import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { startServer, setupOrg, type TestServer } from '../support/harness.js';
import { tx } from '../../apps/server/src/db/pool.js';
import { openClient, waitFor } from '../support/collab.js';
import { spawnServer } from '../support/process-server.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// PostgreSQL becomes unreachable while users edit: every backend of the application is terminated and new
// connections are refused. The client must never report "saved" for an operation that is not durable, and
// once the database is back every operation must be persisted — in the journal, not just in server memory
// (E-01, E-13, D-01, D-10, SC-30, OPS-003).

let ts: TestServer;
let org: Awaited<ReturnType<typeof setupOrg>>;
let admin: pg.Client;
let dbName: string;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function outage(on: boolean) {
  if (on) {
    await admin.query(`alter database ${dbName} allow_connections false`);
    await admin.query(`select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()`, [dbName]);
  } else {
    await admin.query(`alter database ${dbName} allow_connections true`);
  }
}

function textOf(content: any) {
  return content.content.map((b: any) => (b.content ?? []).map((t: any) => t.text ?? '').join('')).join('\n');
}

beforeAll(async () => {
  ts = await startServer();
  org = await setupOrg(ts);
  dbName = new URL(ts.dbUrl).pathname.slice(1);
  admin = new pg.Client({ connectionString: ts.dbUrl.replace(/\/[^/]*$/, '/postgres') });
  await admin.connect();
});

afterAll(async () => {
  await outage(false).catch(() => undefined);
  await admin?.end();
  await ts?.close();
});

describe('database connection loss during editing (SC-30, E-13, D-10)', () => {
  it('unacknowledged operations are never shown as saved and all of them persist after the database returns (E-01, D-01, OPS-003)', async () => {
    const pageId = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Обрыв БД' })).page.id as string;
    const a = await openClient(ts.url, org.owner, pageId);
    a.insert(0, 0, 'до обрыва.');
    await a.waitSaved();

    await outage(true);
    const statusesDuringOutage: string[] = [];
    const onStatus = (a.provider as any).opts.onStatus;
    (a.provider as any).opts.onStatus = (s: string, info: unknown) => {
      statusesDuringOutage.push(s);
      onStatus(s, info);
    };
    a.insert(0, 'до обрыва.'.length, ' первая правка.');
    a.provider.flush();
    await sleep(300);
    a.appendParagraph('второй абзац во время сбоя');
    a.provider.flush();
    // Give the server time to fail (persist error, retries, ack timeout and reconnect attempts).
    await sleep(4000);
    expect(a.provider.status).not.toBe('saved');
    expect(a.provider.pendingCount()).toBeGreaterThan(0);
    expect(statusesDuringOutage).not.toContain('saved');

    await outage(false);
    await a.waitSaved(30_000);
    const expected = 'до обрыва. первая правка.\nвторой абзац во время сбоя';
    expect(a.text()).toBe(expected);

    // The journal itself must contain the operations: a second instance (separate process) loads the
    // document from the database only, sharing no memory with the first one.
    const dir = await mkdtemp(join(tmpdir(), 'kb-dbloss-'));
    const second = await spawnServer({ dbUrl: ts.dbUrl, storageRoot: join(dir, 'objects'), dataDir: dir });
    try {
      const fresh = await openClient(second.url, org.owner, pageId);
      expect(fresh.text()).toBe(expected);
      fresh.close();
    } finally {
      await second.stop();
      await rm(dir, { recursive: true, force: true });
    }
    expect(textOf((await org.owner.get(`/api/v1/pages/${pageId}/content`)).content)).toBe(expected);
    a.close();
  });

  it('readiness reports the database outage and recovers (R-OPS-006)', async () => {
    await outage(true);
    try {
      const r = await fetch(ts.url + '/readyz');
      expect(r.status).toBe(503);
      expect((await r.json()).checks.database).toMatch(/^error/);
      expect((await fetch(ts.url + '/healthz')).status).toBe(200); // liveness must not restart a healthy process
    } finally {
      await outage(false);
    }
    let ok = false;
    for (let i = 0; i < 50 && !ok; i++) {
      ok = (await fetch(ts.url + '/readyz')).status === 200;
      if (!ok) await sleep(100);
    }
    expect(ok).toBe(true);
  });

  it('a connection killed in the middle of a transaction does not crash the server process (R-OPS-002, E-01)', async () => {
    // A checked-out client whose backend dies emits 'error' outside of any query: without a listener this
    // would be an uncaught exception (a crashed server). The transaction must just fail and the pool recover.
    const client = await ts.db.connect();
    await client.query('begin');
    await client.query('select 1');
    await outage(true);
    await sleep(300);
    await expect(client.query('select 1')).rejects.toThrow();
    client.release();
    await outage(false);
    let ok = false;
    for (let i = 0; i < 50 && !ok; i++) {
      ok = (await fetch(ts.url + '/readyz')).status === 200;
      if (!ok) await sleep(100);
    }
    expect(ok).toBe(true);
    expect((await ts.db.query('select 1 as x')).rows[0].x).toBe(1);
  });

  it('cross-instance live updates resume after the database returns (event bus reconnects) (SC-30, R-OPS-006)', async () => {
    const pageId = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Два узла' })).page.id as string;
    const dir = await mkdtemp(join(tmpdir(), 'kb-bus-'));
    const other = await spawnServer({ dbUrl: ts.dbUrl, storageRoot: join(dir, 'objects'), dataDir: dir });
    try {
      const a = await openClient(ts.url, org.owner, pageId);
      const b = await openClient(other.url, org.owner, pageId);
      a.insert(0, 0, 'узел A.');
      await a.waitSaved();
      await waitFor(() => b.text() === 'узел A.', 5000, 'b sees a before the outage');

      await outage(true);
      await sleep(1000);
      await outage(false);
      // Both instances serve requests again.
      for (const url of [ts.url, other.url]) {
        let ready = false;
        for (let i = 0; i < 100 && !ready; i++) {
          ready = (await fetch(url + '/readyz')).status === 200;
          if (!ready) await sleep(100);
        }
        expect(ready).toBe(true);
      }
      await a.waitSaved(15_000);
      await b.waitSaved(15_000);
      a.insert(0, 'узел A.'.length, ' после сбоя.');
      await a.waitSaved(15_000);
      // B learns about A's commit through the cross-instance bus (LISTEN/NOTIFY), not by reconnecting.
      await waitFor(() => b.text() === 'узел A. после сбоя.', 10_000, 'b receives a\'s edit after the outage');
      a.close();
      b.close();
    } finally {
      await other.stop();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('database lost between applying and committing an operation: no "saved", and it is not silently dropped (E-01, E-13, D-01)', async () => {
    const pageId = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Сбой при фиксации' })).page.id as string;
    const a = await openClient(ts.url, org.owner, pageId);
    a.insert(0, 0, 'основа.');
    await a.waitSaved();
    // Fault injection on the application's pool: the database becomes unreachable right after the server has
    // validated the operation (last read before the commit), so both the commit and the in-memory rollback fail.
    const pool = ts.db as any;
    const realQuery = pool.query.bind(pool);
    const realConnect = pool.connect.bind(pool);
    let down = false;
    // Not classified as a connection error on purpose, so tx() does not retry it away: the failure path itself is under test.
    const unreachable = () => Promise.reject(new Error('injected: database unreachable'));
    pool.query = (...args: any[]) => {
      if (down) return unreachable();
      const sql = typeof args[0] === 'string' ? args[0] : '';
      const r = realQuery(...args);
      if (sql.startsWith('select deleted_at from pages where id')) return r.then((x: unknown) => ((down = true), x));
      return r;
    };
    pool.connect = (...args: any[]) => (down ? unreachable() : realConnect(...args));
    try {
      a.insert(0, 'основа.'.length, ' критичная правка.');
      a.provider.flush();
      await waitFor(() => down, 5000, 'fault injected');
      await sleep(1500);
      expect(a.provider.status).not.toBe('saved');
    } finally {
      down = false;
      pool.query = realQuery;
      pool.connect = realConnect;
    }
    await a.waitSaved(30_000);
    expect(a.text()).toBe('основа. критичная правка.');
    // Durable, not only in the first instance's memory:
    const dir = await mkdtemp(join(tmpdir(), 'kb-commitloss-'));
    const other = await spawnServer({ dbUrl: ts.dbUrl, storageRoot: join(dir, 'objects'), dataDir: dir });
    try {
      const fresh = await openClient(other.url, org.owner, pageId);
      expect(fresh.text()).toBe('основа. критичная правка.');
      fresh.close();
    } finally {
      await other.stop();
      await rm(dir, { recursive: true, force: true });
    }
    a.close();
  });

  it('a transaction whose connection is killed before COMMIT is retried transparently (E-01, R-OPS-002)', async () => {
    let attempts = 0;
    const id = await tx(ts.db, async (c) => {
      attempts++;
      if (attempts === 1) await c.query('select pg_terminate_backend(pg_backend_pid())'); // 57P01 on this connection only
      return (await c.query(`insert into outbox (topic, payload) values ('resilience-test', '{}'::jsonb) returning id`)).rows[0].id as number;
    });
    expect(attempts).toBe(2);
    const rows = (await ts.db.query(`select id from outbox where topic = 'resilience-test'`)).rows;
    expect(rows.map((r) => r.id)).toEqual([id]); // exactly once
    // The API keeps working (the broken connection was discarded, not returned to the pool).
    expect((await org.owner.get('/api/v1/auth/me')).user.email).toBe(org.owner.user.email);
  });

  it('requests during a database outage get 503 with a Russian message instead of 500 (R-OPS-006, D-10)', async () => {
    await outage(true);
    try {
      const res = await org.owner.raw('POST', '/api/v1/pages', { spaceId: org.generalSpaceId, title: 'во время сбоя' });
      const body = await res.json();
      expect(res.status, JSON.stringify(body)).toBe(503);
      expect(res.headers.get('retry-after')).toBe('5');
      expect(body.error.code).toBe('db_unavailable');
      expect(body.error.message).toMatch(/База данных временно недоступна/);
    } finally {
      await outage(false);
    }
    const ok = await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'после сбоя' });
    expect(ok.page.id).toBeTruthy();
  });
});
