import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { cloneTemplateDb, spawnServer, type ProcessServer } from '../support/process-server.js';
import { Api, setupOrg, type TestServer } from '../support/harness.js';
import { SharedRateLimiter, limitKey } from '../../apps/server/src/services/rate-limit.js';

/**
 * SEC-L4: rate limits that matter for security hold across application instances. Two real server processes share one
 * PostgreSQL database; requests alternate between them (as a round-robin load balancer would) and the combined count
 * is limited exactly like one instance: sign-in, public-link passwords (per address and per link), uploads.
 */
const AUTH = 6;
const UPLOAD = 4;
let a: ProcessServer;
let b: ProcessServer;
let dir: string;
let dbUrl: string;
let db: pg.Pool;

/** Fixed one-minute windows: start a scenario only with enough of the current window left. */
async function freshWindow(needMs = 20_000) {
  const left = 60_000 - (Date.now() % 60_000);
  if (left < needMs) await new Promise((r) => setTimeout(r, left + 200));
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kb-rl-'));
  dbUrl = (await cloneTemplateDb('rl')).url;
  db = new pg.Pool({ connectionString: dbUrl, max: 3 });
  const env = { AUTH_RATE_LIMIT_PER_MINUTE: String(AUTH), UPLOAD_RATE_LIMIT_PER_MINUTE: String(UPLOAD), PUBLIC_LINK_ATTEMPTS_PER_LINK_PER_MINUTE: '12' };
  [a, b] = await Promise.all([
    spawnServer({ dbUrl, storageRoot: join(dir, 'objects'), dataDir: join(dir, 'a'), env }),
    spawnServer({ dbUrl, storageRoot: join(dir, 'objects'), dataDir: join(dir, 'b'), env }),
  ]);
});
afterAll(async () => {
  await Promise.all([a?.stop(), b?.stop()]);
  await db?.end();
  await rm(dir, { recursive: true, force: true });
});

describe('global rate limits across two instances (SEC-L4)', () => {
  it('sign-in: the limit is shared — alternating instances allow AUTH attempts in total, then both answer 429', async () => {
    const org = await setupOrg({ url: a.url } as TestServer);
    void org;
    await freshWindow();
    const statuses: number[] = [];
    for (let i = 0; i < AUTH + 4; i++) {
      const srv = i % 2 ? b : a;
      const r = await fetch(srv.url + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'nobody@corp.test', password: 'wrong-password-1' }) });
      statuses.push(r.status);
    }
    expect(statuses.slice(0, AUTH)).toEqual(Array(AUTH).fill(401));
    expect(statuses.slice(AUTH)).toEqual([429, 429, 429, 429]);
    const r = await fetch(b.url + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'x@corp.test', password: 'y' }) });
    expect(r.status).toBe(429);
    expect((await r.json()).error.code).toBe('rate_limited');
    // Counters are stored hashed (the default key can be a session token).
    const keys = (await db.query('select key from rate_limit_counters')).rows.map((x) => x.key as string);
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) expect(k).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it('uploads: the per-session limit is shared by the instances', { timeout: 170_000 }, async () => {
    // A session created on A is valid on B (sessions live in PostgreSQL).
    const owner = new Api(a.url);
    await freshWindow();
    // Sign-in may still be throttled for this address from the previous test: wait for the next window if so.
    for (;;) {
      const r = await owner.raw('POST', '/api/v1/auth/login', { email: 'owner@corp.test', password: 'Owner-password-1' });
      if (r.status === 200) {
        owner.csrf = (await r.json()).csrfToken;
        break;
      }
      expect(r.status).toBe(429);
      await new Promise((res) => setTimeout(res, 60_000 - (Date.now() % 60_000) + 200));
    }
    await freshWindow();
    const viaB = new Api(b.url);
    viaB.cookies = owner.cookies;
    viaB.csrf = owner.csrf;
    const statuses: number[] = [];
    for (let i = 0; i < UPLOAD + 2; i++) {
      const fd = new FormData();
      fd.append('file', new Blob([Buffer.from('файл ' + i)], { type: 'text/plain' }), `f${i}.txt`);
      statuses.push((await (i % 2 ? viaB : owner).raw('POST', '/api/v1/attachments', fd)).status);
    }
    expect(statuses).toEqual([...Array(UPLOAD).fill(200), 429, 429]);
  });

  it('public-link password: per address and per link (all addresses together), across instances', { timeout: 170_000 }, async () => {
    const owner = new Api(a.url);
    for (;;) {
      const r = await owner.raw('POST', '/api/v1/auth/login', { email: 'owner@corp.test', password: 'Owner-password-1' });
      if (r.status === 200) {
        owner.csrf = (await r.json()).csrfToken;
        break;
      }
      await new Promise((res) => setTimeout(res, 60_000 - (Date.now() % 60_000) + 200));
    }
    await owner.patch('/api/v1/admin/settings', { publicLinksEnabled: true });
    const me = await owner.get('/api/v1/auth/me');
    const page = (await owner.post('/api/v1/pages', { spaceId: me.personalSpaceId, title: 'Прайс' })).page;
    const link = await owner.post(`/api/v1/pages/${page.id}/share-links`, { acknowledged: true, password: 'secret-pass-1' });
    await freshWindow(30_000);
    const attempt = (srv: ProcessServer) => fetch(srv.url + link.path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'password=guess', redirect: 'manual' });
    // Per address: 10 per minute in total over both instances.
    const s1: number[] = [];
    for (let i = 0; i < 12; i++) s1.push((await attempt(i % 2 ? b : a)).status);
    expect(s1.slice(0, 10)).toEqual(Array(10).fill(401));
    expect(s1.slice(10)).toEqual([429, 429]);

    // Per link: attempts from many addresses exhaust the link's own budget (12/min in this test). Simulated by
    // counting under the route's per-link key from another "instance"; then a single attempt from a fresh address
    // window is refused for this link and audited.
    await new Promise((r) => setTimeout(r, 60_000 - (Date.now() % 60_000) + 200)); // new window: per-address count 0
    const limiter = new SharedRateLimiter(db);
    const linkId = (await db.query('select id from share_links where page_id = $1', [page.id])).rows[0].id;
    for (let i = 0; i < 12; i++) await limiter.hit(limitKey('pub-password-link', linkId), 60_000, 12);
    limiter.stop();
    const refused = await attempt(b);
    expect(refused.status).toBe(429);
    expect(await refused.text()).toContain('Слишком много попыток ввода пароля для этой ссылки');
    const denied = (await db.query(`select count(*)::int c from audit_events where action = 'share_link.password_failed' and details->>'reason' = 'rate_limited'`)).rows[0].c;
    expect(denied).toBe(1);
  });

  it('fast path: once over the limit, an instance rejects without asking the database until the window ends', async () => {
    const limiter = new SharedRateLimiter(db);
    try {
      const key = limitKey('test', 'fast-path-' + Date.now());
      await freshWindow(5_000);
      for (let i = 0; i < 3; i++) expect((await limiter.hit(key, 60_000, 3)).current).toBe(i + 1);
      expect((await limiter.hit(key, 60_000, 3)).current).toBe(4); // over: remembered locally
      const before = limiter.dbHits;
      for (let i = 0; i < 50; i++) expect((await limiter.hit(key, 60_000, 3)).current).toBeGreaterThan(3);
      expect(limiter.dbHits).toBe(before);
      // Another instance (separate limiter) sees the shared count.
      const other = new SharedRateLimiter(db);
      expect((await other.hit(key, 60_000, 3)).current).toBe(5);
      other.stop();
    } finally {
      limiter.stop();
    }
  });
});
