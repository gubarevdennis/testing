import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import WebSocket from 'ws';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupOrg, type TestServer } from '../support/harness.js';
import { openClient, waitFor, type TestClient } from '../support/collab.js';
import { cloneTemplateDb, spawnServer, type ProcessServer } from '../support/process-server.js';
import { FaultProxy } from '../support/fault-proxy.js';

// Network fault injection at the TCP level (tests/support/fault-proxy.ts) between real clients and the real server
// process, and between the server and PostgreSQL (R-QA-005, R-QA-021, R-QA-034, QA26-20):
//   outages of 1 s / 30 s / 300 s (packets dropped, no FIN/RST), high RTT with packet loss, a Wi-Fi → LTE switch
//   (silently dead connection + new client address), a database outage, a double tab of one user.
// Clients run with the production timings of the editor (ack timeout 15 s, backoff 0.5–30 s, ping 25 s + pong 10 s).
// Every scenario checks the exact text of every replica and of the server (0 lost acknowledged edits, 0 duplicates)
// and the honesty of the status: "saved" is never shown while an edit is unacknowledged.

const PROD = { batchMs: 80, ackTimeoutMs: 15_000, backoff: { minMs: 500, maxMs: 30_000 }, syncTimeoutMs: 10_000, pingIntervalMs: 25_000, pongTimeoutMs: 10_000 };

let dir: string;
let srv: ProcessServer;
let pgProxy: FaultProxy;
let db: pg.Pool;
let org: Awaited<ReturnType<typeof setupOrg>>;
const proxies: FaultProxy[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kb-netfault-'));
  const clone = await cloneTemplateDb('netfault');
  const u = new URL(clone.url);
  pgProxy = await new FaultProxy({ target: { host: u.hostname, port: Number(u.port || 5432) }, synTimeoutMs: 5_000 }).start();
  const viaProxy = new URL(clone.url);
  viaProxy.hostname = '127.0.0.1';
  viaProxy.port = String(pgProxy.port);
  db = new pg.Pool({ connectionString: clone.url, max: 2 });
  srv = await spawnServer({ dbUrl: viaProxy.toString(), storageRoot: join(dir, 'objects'), dataDir: dir });
  org = await setupOrg({ url: srv.url } as TestServer);
});

afterAll(async () => {
  await srv?.stop();
  for (const p of proxies) await p.stop().catch(() => undefined);
  await pgProxy?.stop().catch(() => undefined);
  await db?.end();
  await rm(dir, { recursive: true, force: true });
});

async function newPage(title: string) {
  return (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title })).page.id as string;
}

async function serverLines(pageId: string): Promise<string[]> {
  const c = await org.owner.get(`/api/v1/pages/${pageId}/content`);
  return c.content.content.map((b: any) => (b.content ?? []).map((t: any) => t.text ?? '').join(''));
}

async function clientProxy(opts: Partial<ConstructorParameters<typeof FaultProxy>[0]> = {}) {
  const p = await new FaultProxy({ target: { host: '127.0.0.1', port: srv.port }, synTimeoutMs: 20_000, ...opts }).start();
  proxies.push(p);
  return p;
}

interface Tracked extends TestClient {
  log: Array<{ t: number; status: string; pending: number }>;
  lies: string[];
}

/** A client with production timings that records every status change and flags "saved" shown with pending edits. */
async function tracked(baseUrl: string, pageId: string, api = org.owner, extra: Record<string, unknown> = {}): Promise<Tracked> {
  const log: Tracked['log'] = [];
  const lies: string[] = [];
  // in-memory local journal, as IndexedDB in the browser: lets the status distinguish "kept on this device" (local)
  const journal = new Map<string, { update: Uint8Array; ts: number }>();
  const pendingStore = {
    load: async () => [...journal].map(([opId, v]) => ({ opId, ...v })),
    put: async (opId: string, update: Uint8Array, ts: number) => void journal.set(opId, { update, ts }),
    remove: async (ids: string[]) => ids.forEach((i) => journal.delete(i)),
  };
  const c = (await openClient(baseUrl, api, pageId, {
    providerOptions: {
      ...PROD,
      pendingStore,
      ...extra,
      onStatus: (s: string, info: { pending: number }) => {
        log.push({ t: Date.now(), status: s, pending: info.pending });
        if (s === 'saved' && info.pending > 0) lies.push(`saved with ${info.pending} pending at ${new Date().toISOString()}`);
      },
    },
  })) as Tracked;
  c.log = log;
  c.lies = lies;
  return c;
}

/** Plain text of top-level block i. */
const line = (c: TestClient, i: number) => c.text().split('\n')[i] ?? '';

/** Appends a token at the end of block i (as typing at the end of a paragraph). */
function typeAt(c: TestClient, i: number, tok: string) {
  c.insert(i, line(c, i).length, tok);
}

async function metric(name: string): Promise<number> {
  const text = await (await fetch(srv.url + '/metrics')).text();
  const m = new RegExp(`^${name} (\\S+)$`, 'm').exec(text);
  return m ? Number(m[1]) : NaN;
}

describe('network outages while editing: 1 s, 30 s, 300 s (R-QA-021, R-QA-005, QA26-20)', () => {
  it('edits made before, during and after an outage of each length are delivered exactly once; the status never claims "saved" with unacknowledged edits', async () => {
    const results: Record<string, unknown> = {};
    const scenario = async (seconds: number) => {
      const pageId = await newPage(`Обрыв ${seconds} с`);
      const proxy = await clientProxy();
      const a = await tracked(proxy.url, pageId);
      const b = await tracked(srv.url, pageId);
      b.appendParagraph('');
      await b.waitSaved();
      await waitFor(() => a.text().split('\n').length === 2, 10_000, 'a sees the second paragraph');
      const aTokens: string[] = [];
      const bTokens: string[] = [];
      let n = 0;
      const typeA = () => {
        const tok = `a${seconds}.${n++} `;
        aTokens.push(tok);
        typeAt(a, 0, tok);
      };
      const typeB = () => {
        const tok = `b${seconds}.${n++} `;
        bTokens.push(tok);
        typeAt(b, 1, tok);
      };
      for (let i = 0; i < 3; i++) {
        typeA();
        typeB();
        await sleep(300);
      }
      await a.waitSaved(10_000);
      const outageAt = Date.now();
      proxy.outage();
      // keep typing on both sides through the outage (A at most every 2 s, B every 3 s)
      let midStatus = '';
      let midPending = 0;
      while (Date.now() - outageAt < seconds * 1000) {
        typeA();
        if (n % 3 === 0) typeB();
        if (Date.now() - outageAt > (seconds * 1000) / 2 && !midStatus) {
          midStatus = a.provider.status;
          midPending = a.provider.pendingCount();
        }
        await sleep(Math.min(2000, seconds * 250));
      }
      // what B sees during the outage: none of A's outage edits (they are not on the server)
      const bSawDuringOutage = aTokens.slice(3).filter((t) => line(b, 0).includes(t)).length;
      proxy.restore();
      const restoredAt = Date.now();
      typeA();
      typeB();
      await a.waitSaved(60_000);
      const recoveryMs = Date.now() - restoredAt;
      await b.waitSaved(10_000);
      await waitFor(() => a.text() === b.text(), 20_000, `convergence after ${seconds} s outage`);
      const expected = [aTokens.join(''), bTokens.join('')];
      expect(a.text().split('\n')).toEqual(expected);
      expect(await serverLines(pageId)).toEqual(expected);
      expect(a.lies, 'status honesty').toEqual([]);
      expect(b.lies).toEqual([]);
      expect(a.fatal).toEqual([]);
      if (seconds >= 30) {
        // the outage was noticed (acknowledgement timeout): the user saw "not saved", never "saved"
        expect(['local', 'syncing']).toContain(midStatus);
        expect(midPending).toBeGreaterThan(0);
        expect(bSawDuringOutage).toBe(0);
        expect(a.log.some((l) => l.t > outageAt && l.t < restoredAt && l.status === 'local')).toBe(true);
      }
      expect(a.log.filter((l) => l.t > outageAt && l.t < restoredAt).every((l) => l.status !== 'saved' || l.pending === 0)).toBe(true);
      // reconnects with backoff capped at 30 s: back to "saved" within 45 s of the network returning
      expect(recoveryMs).toBeLessThan(45_000);
      results[`${seconds}s`] = { aEdits: aTokens.length, bEdits: bTokens.length, midStatus, midPending, recoveryMs, synTimeouts: proxy.stats.synTimeouts, connections: proxy.stats.accepted };
      a.close();
      b.close();
    };
    // KB_OUTAGE_PROFILES lets a developer shorten the run locally; CI and the evidence use the full 1/30/300 s.
    const profiles = (process.env.KB_OUTAGE_PROFILES ?? '1,30,300').split(',').map(Number);
    await Promise.all(profiles.map(scenario));
    console.log('[network-faults] outages', JSON.stringify(results));
  }, 600_000);
});

describe('slow and lossy network (R-QA-034, QA26-20)', () => {
  it('RTT 300 ms with jitter and 5 % packet loss (retransmission after 400 ms): three editors converge with 0 lost and 0 duplicated edits', async () => {
    const pageId = await newPage('Плохая сеть TCP');
    const ps = [await clientProxy(), await clientProxy(), await clientProxy()];
    for (const p of ps) p.latency(150, 40).loss(0.05, 400);
    const cs: Tracked[] = [];
    for (const p of ps) cs.push(await tracked(p.url, pageId));
    for (let i = 1; i < 3; i++) {
      cs[0].appendParagraph('');
    }
    await cs[0].waitSaved(20_000);
    await waitFor(() => cs.every((c) => c.text().split('\n').length === 3), 20_000, 'paragraphs');
    const tokens: string[][] = [[], [], []];
    const ackMs: number[] = [];
    for (let step = 0; step < 45; step++) {
      const i = step % 3;
      const tok = `{${i}:${step}}`;
      tokens[i].push(tok);
      typeAt(cs[i], i, tok);
      if (step % 9 === 0) {
        const t0 = Date.now();
        await cs[i].waitSaved(30_000);
        ackMs.push(Date.now() - t0);
      }
      await sleep(150);
    }
    await Promise.all(cs.map((c) => c.waitSaved(60_000)));
    await waitFor(() => cs.every((c) => c.text() === cs[0].text()), 30_000, 'convergence');
    const expected = tokens.map((t) => t.join(''));
    expect(cs[0].text().split('\n')).toEqual(expected);
    expect(await serverLines(pageId)).toEqual(expected);
    expect(cs.flatMap((c) => c.lies)).toEqual([]);
    expect(ps.reduce((s, p) => s + p.stats.retransmits, 0)).toBeGreaterThan(0);
    console.log('[network-faults] rtt300+loss5%', JSON.stringify({ ackMs, retransmits: ps.map((p) => p.stats.retransmits) }));
    cs.forEach((c) => c.close());
  }, 180_000);
});

describe('Wi-Fi → LTE switch (QA26-20)', () => {
  it('the old connection dies silently and the client address changes: an idle replica notices by ping within 35 s and catches up; edits typed right after the switch are re-sent once', async () => {
    const pageId = await newPage('Смена сети');
    const proxy = await clientProxy();
    const a = await tracked(proxy.url, pageId);
    const b = await tracked(srv.url, pageId);
    b.appendParagraph('');
    await b.waitSaved();
    typeAt(a, 0, 'до переключения. ');
    await a.waitSaved();
    await waitFor(() => line(b, 0) === 'до переключения. ', 10_000, 'b sees a');
    const connsBefore = await metric('kb_collab_connections');

    // (1) idle replica: Wi-Fi drops, the phone moves to LTE; the user is only reading
    proxy.switchNetwork('127.0.0.2');
    const switchedAt = Date.now();
    typeAt(b, 1, 'пока A переключался. ');
    await b.waitSaved();
    await waitFor(() => line(a, 1) === 'пока A переключался. ', 45_000, 'idle replica catches up after the network switch');
    const idleDetectMs = Date.now() - switchedAt;
    expect(idleDetectMs).toBeLessThan(40_000); // ping 25 s + pong timeout 10 s + reconnect
    expect(proxy.sourceAddresses).toEqual(['127.0.0.1', '127.0.0.2']); // the server saw the new client address

    // (2) typing right after a second switch (LTE → Wi-Fi): the unacknowledged edit is re-sent exactly once
    proxy.switchNetwork('127.0.0.3');
    const t1 = Date.now();
    typeAt(a, 0, 'сразу после второго переключения. ');
    a.provider.flush();
    await sleep(500);
    expect(a.provider.status).not.toBe('saved');
    await a.waitSaved(45_000);
    const typingDetectMs = Date.now() - t1;
    await waitFor(() => a.text() === b.text(), 10_000, 'convergence');
    const expected = ['до переключения. сразу после второго переключения. ', 'пока A переключался. '];
    expect(a.text().split('\n')).toEqual(expected);
    expect(await serverLines(pageId)).toEqual(expected);
    expect(a.lies).toEqual([]);
    // the server drops the dead sockets by its own heartbeat (30 s ping, terminate after a missed pong)
    let connsAfter = NaN;
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      connsAfter = await metric('kb_collab_connections');
      if (connsAfter <= connsBefore) break;
      await sleep(2000);
    }
    expect(connsAfter).toBeLessThanOrEqual(connsBefore);
    console.log('[network-faults] wifi-lte', JSON.stringify({ idleDetectMs, typingDetectMs, sourceAddresses: proxy.sourceAddresses, connsBefore, connsAfter }));
    a.close();
    b.close();
  }, 240_000);
});

describe('database outage while editing (R-QA-021, R-QA-005)', () => {
  it('PostgreSQL unreachable for 10 s (connections reset, new ones refused): nothing is acknowledged meanwhile, readiness reports it, everything is committed once after recovery', async () => {
    const pageId = await newPage('Отказ БД');
    const a = await tracked(srv.url, pageId);
    const b = await tracked(srv.url, pageId);
    b.appendParagraph('');
    await b.waitSaved();
    const tokens: string[][] = [[], []];
    const type = (i: number) => {
      const tok = `${i ? 'b' : 'a'}${tokens[i].length} `;
      tokens[i].push(tok);
      typeAt(i ? b : a, i, tok);
    };
    type(0);
    type(1);
    await Promise.all([a.waitSaved(), b.waitSaved()]);
    const before = (await db.query('select count(*)::int c from doc_updates where page_id = $1', [pageId])).rows[0].c;
    pgProxy.reset().refuse(true);
    const downAt = Date.now();
    let readyDuring = 0;
    while (Date.now() - downAt < 10_000) {
      type(0);
      type(1);
      await sleep(1000);
      readyDuring = (await fetch(srv.url + '/readyz')).status;
    }
    expect(readyDuring).toBe(503);
    expect(a.provider.pendingCount() + b.provider.pendingCount()).toBeGreaterThan(0);
    expect((await db.query('select count(*)::int c from doc_updates where page_id = $1', [pageId])).rows[0].c).toBe(before);
    pgProxy.refuse(false);
    await Promise.all([a.waitSaved(60_000), b.waitSaved(60_000)]);
    let ready = 0;
    for (let i = 0; i < 40 && ready !== 200; i++) {
      ready = (await fetch(srv.url + '/readyz')).status;
      if (ready !== 200) await sleep(500);
    }
    expect(ready).toBe(200);
    await waitFor(() => a.text() === b.text(), 10_000, 'convergence');
    const expected = tokens.map((t) => t.join(''));
    expect(a.text().split('\n')).toEqual(expected);
    expect(await serverLines(pageId)).toEqual(expected);
    expect([...a.lies, ...b.lies]).toEqual([]);
    a.close();
    b.close();
  }, 180_000);
});

describe('double tab of one user over a flaky link (QA26-20, R-QA-021)', () => {
  it('two tabs of the same user, one of them behind a 20 s outage, edit the same paragraph: both versions survive once, both tabs converge', async () => {
    const pageId = await newPage('Две вкладки');
    const proxy = await clientProxy();
    const tab1 = await tracked(srv.url, pageId);
    const tab2 = await tracked(proxy.url, pageId);
    typeAt(tab1, 0, 'общий текст.');
    await tab1.waitSaved();
    await waitFor(() => line(tab2, 0) === 'общий текст.', 10_000, 'tab2 synced');
    proxy.outage();
    tab1.insert(0, 0, '[вкладка 1] ');
    tab2.insert(0, line(tab2, 0).length, ' [вкладка 2]');
    tab2.provider.flush();
    await tab1.waitSaved();
    await sleep(20_000);
    expect(tab2.provider.status).not.toBe('saved');
    proxy.restore();
    await tab2.waitSaved(45_000);
    await waitFor(() => tab1.text() === tab2.text(), 10_000, 'tabs converge');
    expect(tab1.text()).toBe('[вкладка 1] общий текст. [вкладка 2]');
    expect(await serverLines(pageId)).toEqual(['[вкладка 1] общий текст. [вкладка 2]']);
    expect([...tab1.lies, ...tab2.lies]).toEqual([]);
    tab1.close();
    tab2.close();
  }, 120_000);
});

describe('reordered and duplicated frames (R-QA-034)', () => {
  it('a channel that duplicates 10 % of frames and swaps 15 % with the next one: three editors converge, every token exactly once', async () => {
    const pageId = await newPage('Перестановка и дубли');
    const stats = { duplicated: 0, swapped: 0 };
    /** Client → server frames: some are sent twice, some overtake each other (a misbehaving proxy, retried tunnel requests). */
    class ChaosWebSocket extends WebSocket {
      private held: any = null;
      override send(data: any) {
        if (this.held === null && Math.random() < 0.15) {
          this.held = data; // goes out after the next frame
          stats.swapped++;
          setTimeout(() => this.release(), 200);
          return;
        }
        this.raw(data);
        this.release();
        if (Math.random() < 0.1) {
          stats.duplicated++;
          this.raw(data);
        }
      }
      private release() {
        const h = this.held;
        this.held = null;
        if (h !== null) this.raw(h);
      }
      private raw(data: any) {
        if (this.readyState === 1) super.send(data);
      }
    }
    const cs: Tracked[] = [];
    for (let i = 0; i < 3; i++) cs.push(await tracked(srv.url, pageId, org.owner, { WebSocketImpl: ChaosWebSocket, batchMs: 5 }));
    cs[0].appendParagraph('');
    cs[0].appendParagraph('');
    await cs[0].waitSaved();
    await waitFor(() => cs.every((c) => c.text().split('\n').length === 3), 15_000, 'paragraphs');
    const tokens: string[][] = [[], [], []];
    for (let step = 0; step < 90; step++) {
      const i = step % 3;
      const tok = `«${i}.${step}»`;
      tokens[i].push(tok);
      typeAt(cs[i], i, tok);
      await sleep(20);
    }
    await Promise.all(cs.map((c) => c.waitSaved(60_000)));
    await waitFor(() => cs.every((c) => c.text() === cs[0].text()), 30_000, 'convergence');
    const expected = tokens.map((t) => t.join(''));
    expect(cs[0].text().split('\n')).toEqual(expected);
    expect(await serverLines(pageId)).toEqual(expected);
    expect(cs.flatMap((c) => c.lies)).toEqual([]);
    expect(stats.duplicated + stats.swapped).toBeGreaterThan(5);
    const rows = (await db.query('select count(*)::int c, count(distinct op_id)::int d from doc_updates where page_id = $1', [pageId])).rows[0];
    expect(rows.c).toBe(rows.d); // a duplicated operation is stored once
    console.log('[network-faults] reorder+duplicate', JSON.stringify(stats));
    cs.forEach((c) => c.close());
  }, 120_000);
});
