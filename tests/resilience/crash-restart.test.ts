import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupOrg, type TestServer } from '../support/harness.js';
import { openClient, waitFor } from '../support/collab.js';
import { cloneTemplateDb, spawnServer, type ProcessServer } from '../support/process-server.js';

// Application crash (SIGKILL of the real server process) while a client is editing:
// acknowledged operations are durable, unacknowledged ones stay on the client and are applied exactly once
// after the server comes back on the same database (E-01, E-02, E-03, D-01, D-02, OPS-009, V17-F04).

let dir: string;
let dbUrl: string;
let db: pg.Pool;
let srv: ProcessServer;
let org: Awaited<ReturnType<typeof setupOrg>>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function restart() {
  srv = await spawnServer({ dbUrl, storageRoot: join(dir, 'objects'), dataDir: dir, port: srv.port });
}

async function serverText(pageId: string) {
  const c = await org.owner.get(`/api/v1/pages/${pageId}/content`);
  return c.content.content.map((b: any) => (b.content ?? []).map((t: any) => t.text ?? '').join('')).join('\n');
}

async function newPage(title: string) {
  return (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title })).page.id as string;
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kb-crash-'));
  const clone = await cloneTemplateDb('crash');
  dbUrl = clone.url;
  db = new pg.Pool({ connectionString: dbUrl, max: 2 });
  srv = await spawnServer({ dbUrl, storageRoot: join(dir, 'objects'), dataDir: dir });
  org = await setupOrg({ url: srv.url } as TestServer);
});

afterAll(async () => {
  await srv?.stop();
  await db?.end();
  await rm(dir, { recursive: true, force: true });
});

describe('server crash during editing (OPS-009, V17-F04, E-01)', () => {
  it('acknowledged edits survive a SIGKILL; in-flight and offline edits are kept and applied once after restart (E-02, E-13, OPS-003)', async () => {
    const pageId = await newPage('Сбой процесса');
    const a = await openClient(srv.url, org.owner, pageId);
    a.insert(0, 0, 'подтверждено.');
    await a.waitSaved();
    // Acknowledged but not yet materialised (flush debounce is 1.5 s): only the journal has it.

    srv.freeze(); // the server stops processing: the next operation is sent but can never be acknowledged
    a.insert(0, 'подтверждено.'.length, ' в полёте.');
    a.provider.flush();
    await sleep(300);
    expect(a.provider.status).toBe('syncing');
    expect(a.provider.pendingCount()).toBeGreaterThan(0);

    await srv.crash();
    await waitFor(() => a.provider.status === 'local', 5000, 'client notices the crash');
    a.insert(0, 'подтверждено. в полёте.'.length, ' офлайн.');
    a.provider.flush();
    expect(a.provider.status).toBe('local'); // never "saved" while the server is down
    expect(a.statuses.slice(a.statuses.lastIndexOf('saved') + 1)).not.toContain('saved');

    await restart();
    await a.waitSaved(20_000); // automatic reconnect (backoff) + resend of the pending operations
    const expected = 'подтверждено. в полёте. офлайн.';
    expect(a.text()).toBe(expected);
    expect(await serverText(pageId)).toBe(expected);

    // A fresh client sees the same state, loaded from the durable journal of the restarted process.
    const b = await openClient(srv.url, org.owner, pageId);
    expect(b.text()).toBe(expected);
    a.close();
    b.close();
  });

  it('an operation persisted before the crash whose acknowledgement was lost is not duplicated on resend (E-03, D-02, OPS-004)', async () => {
    const pageId = await newPage('Потерянное подтверждение');
    const a = await openClient(srv.url, org.owner, pageId);
    a.insert(0, 0, 'база');
    await a.waitSaved();
    const count = async () => (await db.query('select count(*)::int c from doc_updates where page_id = $1', [pageId])).rows[0].c as number;
    const before = await count();

    // Drop every server→client message: the server commits the operation, the ACK never arrives.
    const ws = (a.provider as any).ws;
    ws.onmessage = () => undefined;
    a.insert(0, 4, ' ровно один раз');
    a.provider.flush();
    for (let i = 0; i < 200 && (await count()) === before; i++) await sleep(25);
    expect(await count()).toBe(before + 1); // durable on the server
    expect(a.provider.status).toBe('syncing'); // the client correctly does not claim "saved"

    await srv.crash();
    await waitFor(() => a.provider.status === 'local', 5000, 'client notices the crash');
    await restart();
    await a.waitSaved(20_000);
    expect(a.text()).toBe('база ровно один раз');
    expect(await serverText(pageId)).toBe('база ровно один раз');
    // The resend did not append the same content again.
    expect(await count()).toBe(before + 1);
    a.close();
  });

  it('continuous typing across a crash: every token persists exactly once (E-01, E-03)', async () => {
    const pageId = await newPage('Набор во время сбоя');
    const a = await openClient(srv.url, org.owner, pageId);
    const tokens: string[] = [];
    let crashed: Promise<void> | null = null;
    for (let i = 0; i < 40; i++) {
      const tok = `т${i} `;
      tokens.push(tok);
      a.insert(0, a.text().length, tok);
      if (i === 20) crashed = srv.crash();
      await sleep(5);
    }
    await crashed;
    await restart();
    await a.waitSaved(20_000);
    const text = await serverText(pageId);
    expect(text).toBe(tokens.join(''));
    for (const t of tokens) expect(text.split(t).length - 1).toBe(1);
    a.close();
  });
});
