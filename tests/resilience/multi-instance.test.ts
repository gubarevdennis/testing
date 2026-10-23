import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import WebSocket from 'ws';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Api, setupOrg, type TestServer } from '../support/harness.js';
import { openClient, waitFor, type TestClient } from '../support/collab.js';
import { cloneTemplateDb, spawnServer, type ProcessServer } from '../support/process-server.js';
import { LoadBalancer } from '../support/lb-proxy.js';

// Several application instances on one PostgreSQL and one shared object store, behind a load balancer
// (R-QA-034, QA26-20 "смена ведущего узла", docs/ARCHITECTURE.md §10, docs/OPERATIONS.md §4):
//   - editors connected to different instances co-edit one page; tree and page events reach clients of the other
//     instance; a file uploaded through one instance is served by the other;
//   - one instance is killed (SIGKILL) while everybody types: clients fail over through the balancer to the survivor
//     and nothing typed is lost or duplicated; the instance comes back and takes traffic again;
//   - with page affinity (deploy/nginx.conf `hash $kb_collab_key consistent`) presence lists every editor and the
//     HTTP fallback channel works across instances.

const PROD = { batchMs: 80, ackTimeoutMs: 15_000, backoff: { minMs: 500, maxMs: 5_000 }, syncTimeoutMs: 10_000, pingIntervalMs: 25_000, pongTimeoutMs: 10_000 };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let dir: string;
let dbUrl: string;
let db: pg.Pool;
const inst: ProcessServer[] = [];
let org: Awaited<ReturnType<typeof setupOrg>>;
const lbs: LoadBalancer[] = [];

async function startInstance(i: number, port?: number) {
  // shared database and object store; private data dir (temp files, OCR cache)
  inst[i] = await spawnServer({ dbUrl, storageRoot: join(dir, 'objects'), dataDir: join(dir, `data${i}`), port, env: { WORKER_ENABLED: i === 0 ? 'true' : 'false' } });
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kb-multi-'));
  const clone = await cloneTemplateDb('multi');
  dbUrl = clone.url;
  db = new pg.Pool({ connectionString: dbUrl, max: 2 });
  await startInstance(0);
  await startInstance(1);
  org = await setupOrg({ url: inst[0].url } as TestServer);
});

afterAll(async () => {
  for (const lb of lbs) await lb.stop().catch(() => undefined);
  for (const s of inst) await s?.stop();
  await db?.end();
  await rm(dir, { recursive: true, force: true });
});

/** The same session, talking to another instance. */
function via(api: Api, base: string): Api {
  const a = new Api(base);
  a.cookies = api.cookies;
  a.csrf = api.csrf;
  a.user = api.user;
  return a;
}

async function balancer(mode: 'round-robin' | 'page-hash') {
  const lb = await new LoadBalancer(
    inst.map((s, i) => ({ name: `i${i}`, host: '127.0.0.1', port: s.port, up: true })),
    mode,
  ).start();
  lbs.push(lb);
  return lb;
}

async function metricOf(s: ProcessServer, name: string) {
  const text = await (await fetch(s.url + '/metrics')).text();
  return Number(new RegExp(`^${name} (\\S+)$`, 'm').exec(text)?.[1] ?? NaN);
}

async function linesFrom(base: string, pageId: string) {
  const c = await via(org.owner, base).get(`/api/v1/pages/${pageId}/content`);
  return c.content.content.map((b: any) => (b.content ?? []).map((t: any) => t.text ?? '').join(''));
}

function events(base: string, api: Api) {
  const got: any[] = [];
  const ws = new WebSocket(base.replace('http', 'ws') + '/api/v1/events', { headers: { cookie: api.cookieHeader() } });
  ws.on('message', (d: Buffer) => got.push(JSON.parse(d.toString())));
  const open = new Promise((r) => ws.once('open', r));
  return { got, ws, open };
}

const line = (c: TestClient, i: number) => c.text().split('\n')[i] ?? '';

/** Each client types its own tokens into its own paragraph until stop() — like people typing. */
function typists(cs: TestClient[], prefix: string) {
  const tokens: string[][] = cs.map(() => []);
  let running = true;
  const loops = cs.map(async (c, i) => {
    while (running) {
      const tok = `${prefix}${i}.${tokens[i].length} `;
      tokens[i].push(tok);
      c.insert(i, line(c, i).length, tok);
      await sleep(150 + Math.random() * 150);
    }
  });
  return {
    tokens,
    stop: async () => {
      running = false;
      await Promise.all(loops);
    },
  };
}

describe('two instances on one database, no affinity (round-robin) (R-QA-034, QA26-20)', () => {
  it('editors on different instances co-edit; events and files cross instances; one instance is killed mid-typing, clients fail over, nothing is lost', async () => {
    const lb = await balancer('round-robin');
    const pageId = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Два экземпляра' })).page.id as string;
    const users = [org.owner];
    for (let i = 1; i < 4; i++) users.push(await org.user(`Соавтор ${i}`, { pageGrants: [{ pageId, level: 'edit' }] }));

    // events of both instances
    const ev0 = events(inst[0].url, org.owner);
    const ev1 = events(inst[1].url, org.owner);
    await Promise.all([ev0.open, ev1.open]);

    // 4 editors through the balancer: round-robin spreads them over both instances
    const cs: TestClient[] = [];
    const seen: number[] = users.map(() => 0);
    for (const [i, u] of users.entries()) cs.push(await openClient(lb.url, u, pageId, { providerOptions: { ...PROD, onPresence: (p: unknown[]) => (seen[i] = p.length) } }));
    expect(await metricOf(inst[0], 'kb_collab_connections')).toBeGreaterThan(0);
    expect(await metricOf(inst[1], 'kb_collab_connections')).toBeGreaterThan(0);
    cs[0].doc.transact(() => {
      for (let i = 1; i < cs.length; i++) cs[0].appendParagraph('');
    });
    await cs[0].waitSaved();
    await waitFor(() => cs.every((c) => c.text().split('\n').length === cs.length), 15_000, 'paragraphs everywhere');

    // a tree change made on instance 1 reaches the event stream of instance 0 and vice versa
    await via(org.owner, inst[1].url).post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Создана на втором' });
    await waitFor(() => ev0.got.some((e) => e.type === 'tree-changed' && e.spaceId === org.generalSpaceId), 10_000, 'tree event 1 → 0');
    await via(org.owner, inst[0].url).req('PATCH', `/api/v1/pages/${pageId}`, { title: 'Два экземпляра (переименована)' });
    await waitFor(() => ev1.got.some((e) => e.type === 'page-changed' && e.pageId === pageId), 10_000, 'page event 0 → 1');

    // a file stored through instance 0 is served by instance 1 (shared object store)
    const fd = new FormData();
    fd.append('pageId', pageId);
    const bytes = new TextEncoder().encode('общий файл ' + 'x'.repeat(5000));
    fd.append('file', new Blob([bytes], { type: 'text/plain' }), 'общий.txt');
    const att = (await via(org.owner, inst[0].url).req('POST', '/api/v1/attachments', fd)).attachments[0];
    const dl = await fetch(`${inst[1].url}/api/v1/attachments/${att.id}/content`, { headers: { cookie: org.owner.cookieHeader() } });
    expect(dl.status).toBe(200);
    expect(new Uint8Array(await dl.arrayBuffer())).toEqual(bytes);

    // without affinity, presence is per instance (documented; deploy/nginx.conf routes a page to one instance)
    const presenceWithoutAffinity = [...seen];
    // everyone types; instance 1 is killed in the middle
    const t = typists(cs, 'r');
    await sleep(3000);
    const before1 = await metricOf(inst[1], 'kb_collab_connections');
    const killedPort = inst[1].port;
    await inst[1].crash();
    await sleep(8000); // clients of the dead instance reconnect through the balancer to instance 0
    await t.stop();
    await Promise.all(cs.map((c) => c.waitSaved(60_000)));
    await waitFor(() => cs.every((c) => c.text() === cs[0].text()), 30_000, 'convergence after failover');
    const expected = t.tokens.map((x) => x.join(''));
    expect(cs[0].text().split('\n')).toEqual(expected);
    expect(await linesFrom(inst[0].url, pageId)).toEqual(expected);
    expect(await metricOf(inst[0], 'kb_collab_connections')).toBeGreaterThanOrEqual(cs.length + 0);

    // the instance returns (same address) and serves the same content; the balancer sends traffic to it again
    await startInstance(1, killedPort);
    await waitFor(() => lb.backends[1].up, 10_000, 'balancer sees instance 1');
    expect(await linesFrom(inst[1].url, pageId)).toEqual(expected);
    const late = await openClient(inst[1].url, org.owner, pageId, { providerOptions: PROD });
    late.insert(0, line(late, 0).length, 'после возврата ');
    await late.waitSaved();
    await waitFor(() => line(cs[0], 0).endsWith('после возврата '), 10_000, 'edit on the returned instance reaches the others');
    expect((await linesFrom(inst[0].url, pageId))[0]).toBe(expected[0] + 'после возврата ');
    const dup = (await db.query('select count(*)::int c, count(distinct op_id)::int d from doc_updates where page_id = $1', [pageId])).rows[0];
    expect(dup.c).toBe(dup.d); // every operation stored once
    console.log('[multi-instance] round-robin', JSON.stringify({ typed: t.tokens.map((x) => x.length), connectionsOnKilled: before1, routed: lb.routed, presenceWithoutAffinity }));
    for (const c of [...cs, late]) c.close();
    ev0.ws.close();
    ev1.ws.close();
  }, 180_000);
});

describe('two instances with page affinity (deploy/nginx.conf hash by page id) (R-QA-034, QA26-20)', () => {
  it('presence lists every editor; on failover all editors of the page move together, presence and content stay complete; the HTTP fallback channel works through the balancer', async () => {
    const lb = await balancer('page-hash');
    const pageId = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Присутствие' })).page.id as string;
    const users = [org.owner, await org.user('Присутствие 1', { pageGrants: [{ pageId, level: 'edit' }] }), await org.user('Присутствие 2', { pageGrants: [{ pageId, level: 'edit' }] })];
    const presence: string[][] = users.map(() => []);
    const cs: TestClient[] = [];
    for (let i = 0; i < users.length; i++) {
      const c = await openClient(lb.url, users[i], pageId, {
        // the third editor is behind a proxy that blocks WebSocket: HTTP long-polling tunnel
        wsBlocked: i === 2,
        providerOptions: { ...PROD, onPresence: (u: Array<{ userId: string }>) => (presence[i] = [...new Set(u.map((x) => x.userId))].sort()) },
      });
      c.provider.awareness.setLocalState({ user: { name: `u${i}` } });
      cs.push(c);
    }
    expect(cs[2].provider.transport).toBe('http');
    const ids = users.map((u) => (u === org.owner ? org.owner.user.id : (u as any).id)).sort();
    await waitFor(() => presence.every((p) => p.length === 3), 15_000, 'everyone sees everyone');
    expect(presence[0]).toEqual(ids);
    const home = (await metricOf(inst[0], 'kb_collab_connections')) >= 3 ? 0 : 1;
    cs[0].doc.transact(() => {
      cs[0].appendParagraph('');
      cs[0].appendParagraph('');
    });
    await cs[0].waitSaved();
    await waitFor(() => cs.every((c) => c.text().split('\n').length === 3), 15_000, 'paragraphs');

    const t = typists(cs, 'h');
    await sleep(2000);
    const port = inst[home].port;
    await inst[home].crash();
    for (const p of presence) p.length = 0;
    await sleep(8000);
    await t.stop();
    await Promise.all(cs.map((c) => c.waitSaved(60_000)));
    await waitFor(() => cs.every((c) => c.text() === cs[0].text()), 30_000, 'convergence');
    const expected = t.tokens.map((x) => x.join(''));
    expect(cs[0].text().split('\n')).toEqual(expected);
    expect(await linesFrom(inst[1 - home].url, pageId)).toEqual(expected);
    await waitFor(() => presence.every((p) => p.length === 3), 20_000, 'presence complete on the surviving instance');
    expect(await metricOf(inst[1 - home], 'kb_collab_connections')).toBeGreaterThanOrEqual(2); // + the HTTP tunnel
    await startInstance(home, port);
    console.log('[multi-instance] page-hash', JSON.stringify({ home, typed: t.tokens.map((x) => x.length), routed: lb.routed }));
    for (const c of cs) c.close();
  }, 180_000);
});
