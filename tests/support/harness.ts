import pg from 'pg';
import { inject } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from '../../apps/server/src/server.js';
import type { Config } from '../../apps/server/src/config.js';

export interface TestServer {
  url: string;
  dbUrl: string;
  srv: Awaited<ReturnType<typeof createServer>>;
  db: pg.Pool;
  close(): Promise<void>;
}

let counter = 0;

/** Clones the template database and starts a server on a random port. */
export async function startServer(overrides: Partial<Config> = {}, opts: { worker?: boolean; dbName?: string } = {}): Promise<TestServer> {
  const tpl = inject('templateDb' as never) as string;
  const adminUrl = inject('adminUrl' as never) as string;
  const name = opts.dbName ?? `kb_t_${process.pid}_${Date.now()}_${counter++}`;
  if (!opts.dbName) {
    const a = new pg.Client({ connectionString: adminUrl });
    await a.connect();
    await a.query(`create database ${name} template ${tpl}`);
    await a.end();
  }
  const dbUrl = adminUrl.replace(/\/[^/]*$/, '/' + name);
  const root = await mkdtemp(join(tmpdir(), 'kb-store-'));
  const srv = await createServer(
    { databaseUrl: dbUrl, storage: { driver: 'fs', root }, env: 'test', logLevel: process.env.TEST_LOG ?? 'silent', port: 0, host: '127.0.0.1', rateLimitPerMinute: 100_000, authRateLimitPerMinute: 100_000, publicUrl: 'http://127.0.0.1', dbPoolSize: 10, ...overrides },
    { worker: opts.worker ?? false },
  );
  await srv.app.listen({ port: 0, host: '127.0.0.1' });
  const addr = srv.app.server.address() as { port: number };
  return {
    url: `http://127.0.0.1:${addr.port}`,
    dbUrl,
    srv,
    db: srv.services.db,
    close: async () => {
      await srv.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: any,
  ) {
    super(`HTTP ${status}: ${JSON.stringify(body)?.slice(0, 500)}`);
  }
}

/** Minimal HTTP client with a cookie jar and CSRF header handling. */
export class Api {
  cookies = new Map<string, string>();
  csrf: string | null = null;
  user: any = null;
  constructor(public base: string) {}

  cookieHeader() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  async raw(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const h: Record<string, string> = { ...headers };
    if (this.cookies.size) h.cookie = this.cookieHeader();
    if (this.csrf && method !== 'GET') h['x-csrf-token'] = this.csrf;
    let payload: any = undefined;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      h['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetch(this.base + path, { method, headers: h, body: payload, redirect: 'manual' });
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(';');
      const i = kv.indexOf('=');
      const k = kv.slice(0, i);
      const v = kv.slice(i + 1);
      if (!v || /expires=Thu, 01 Jan 1970/i.test(c)) this.cookies.delete(k);
      else this.cookies.set(k, v);
    }
    return res;
  }

  async req<T = any>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.raw(method, path, body);
    const text = await res.text();
    let data: any = text;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      /* not json */
    }
    if (!res.ok) throw new ApiError(res.status, data);
    return data as T;
  }

  get = <T = any>(p: string) => this.req<T>('GET', p);
  post = <T = any>(p: string, b?: unknown) => this.req<T>('POST', p, b ?? {});
  put = <T = any>(p: string, b?: unknown) => this.req<T>('PUT', p, b ?? {});
  patch = <T = any>(p: string, b?: unknown) => this.req<T>('PATCH', p, b ?? {});
  del = <T = any>(p: string, b?: unknown) => this.req<T>('DELETE', p, b);

  async login(email: string, password: string, totp?: string) {
    const r = await this.post('/api/v1/auth/login', { email, password, totp });
    if (r.csrfToken) this.csrf = r.csrfToken;
    this.user = r.user;
    return r;
  }
}

/** Expects a promise to fail with an HTTP status. */
export async function expectStatus(p: Promise<unknown>, status: number): Promise<any> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status !== status) throw new Error(`expected HTTP ${status}, got ${e.status}: ${JSON.stringify(e.body)}`);
      return e.body;
    }
    throw e;
  }
  throw new Error(`expected HTTP ${status}, request succeeded`);
}

export const OWNER = { email: 'owner@corp.test', password: 'Owner-password-1', name: 'Анна Владелец' };

/** Bootstraps an organisation and returns an owner client plus helpers to create users. */
export async function setupOrg(ts: TestServer) {
  const owner = new Api(ts.url);
  const r = await owner.post('/api/v1/setup', { orgName: 'ООО Тест', ownerEmail: OWNER.email, ownerName: OWNER.name, password: OWNER.password });
  owner.csrf = r.csrfToken;
  owner.user = r.user;
  const me = await owner.get('/api/v1/auth/me');
  const spaces = await owner.get('/api/v1/spaces');
  const general = spaces.spaces.find((s: any) => s.kind === 'org');
  async function user(name: string, opts: { kind?: 'employee' | 'guest'; orgRole?: string; groupIds?: string[]; accessExpiresAt?: string; pageGrants?: any[] } = {}) {
    const email = name.toLowerCase().replace(/[^a-z0-9]/g, '') + Math.random().toString(36).slice(2, 6) + '@corp.test';
    const password = 'Password-' + Math.random().toString(36).slice(2, 10) + '1';
    const created = await owner.post('/api/v1/admin/users', { email, name, kind: opts.kind ?? 'employee', orgRole: opts.orgRole, groupIds: opts.groupIds, accessExpiresAt: opts.accessExpiresAt, pageGrants: opts.pageGrants, invite: false });
    await owner.post('/api/v1/__test/set-password', { userId: created.user.id, password });
    const api = new Api(ts.url);
    await api.login(email, password);
    return Object.assign(api, { id: created.user.id as string, email, password });
  }
  return { owner, me, personalSpaceId: me.personalSpaceId as string, generalSpaceId: general.id as string, user };
}
