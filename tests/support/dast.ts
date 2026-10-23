/**
 * Baseline DAST (R-SECURITY-004, R-SECURITY-002): black-box probes against a running server over HTTP/WebSocket only.
 * Used by tests/integration/security-dast.test.ts (in-process server, fresh DB) and by scripts/security/dast.ts
 * (spawned server process on its own port and database, report in test-results/security/dast-report.json).
 *
 * Every probe records the checks it made and the findings it produced; a finding is a failed security expectation.
 * Nothing here depends on vitest.
 */
import { createServer as createHttpServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import { Api } from './http-client.js';

export type Severity = 'high' | 'medium' | 'low';
export interface Finding {
  severity: Severity;
  target: string;
  detail: string;
}
export interface ProbeResult {
  id: string;
  title: string;
  checks: number;
  findings: Finding[];
  notes: string[];
  ms: number;
}
export interface DastOptions {
  base: string;
  /** Rate limits the server was started with; the rate-limit probe is skipped when they are not set (huge). */
  limits?: { authPerMinute: number; apiPerMinute: number } | null;
  /** Number of trusted reverse-proxy hops the server was started with (TRUST_PROXY). */
  proxyHops?: number;
  /** Whether cookies must carry `Secure` (production / COOKIE_SECURE). */
  expectSecureCookies?: boolean;
}

export interface Res {
  status: number;
  headers: Headers;
  text: string;
}

const RAND = () => randomUUID();
const STACK = [/\n\s+at\s+\S+\s+\(/, /node_modules\//, /\/home\/|\/app\/apps\//, /\.ts:\d+:\d+/, /\bSELECT\b.+\bFROM\b/i, /duplicate key value|violates (?:foreign key|unique|check) constraint|syntax error at or near/i, /\bTypeError\b|\bReferenceError\b/];
const XSS = {
  title: `<img src=x onerror=alert('t')><script>alert('t2')</script>`,
  comment: `<script>alert('c')</script><img src=x onerror=alert('c2')>`,
  filename: `"><img src=x onerror=alert('f')>.txt`,
};
/** Active markup that must never appear in an HTML response built from user strings (escaped text is fine). */
const RAW_XSS = [/<script[\s>][^<]*alert\(/i, /<[a-z][^<>]*\son[a-z]+\s*=/i, /<[a-z][^<>]*\s(?:href|src|action|formaction)\s*=\s*["']?\s*javascript:/i, /<iframe\b/i];

export async function http(base: string, method: string, path: string, opts: { cookie?: string; headers?: Record<string, string>; body?: string | FormData | Buffer; json?: unknown } = {}): Promise<Res> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.cookie) headers.cookie = opts.cookie;
  let body: any = opts.body;
  if (opts.json !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(opts.json);
  }
  const r = await fetch(base + path, { method, headers, body, redirect: 'manual' });
  return { status: r.status, headers: r.headers, text: await r.text() };
}

interface Route {
  method: string;
  path: string;
}

/** Routes that are reachable without a session by design (each one is still probed for 5xx and data leaks). */
const PUBLIC_ROUTES = [
  /^GET \/api\/v1\/setup\/status$/,
  /^POST \/api\/v1\/setup$/, // only while no organisation exists (409 afterwards)
  /^POST \/api\/v1\/auth\/login$/,
  /^POST \/api\/v1\/auth\/logout$/, // no-op without a session
  /^POST \/api\/v1\/auth\/invite\/accept$/, // invitation token in the body
  /^GET \/api\/v1\/auth\/oidc\//,
  /^GET \/api\/v1\/files\/\{token\}$/, // signed, expiring link (HMAC)
  /^GET \/api\/v1\/openapi\.json$/,
  /^(GET|POST) \/pub\//,
  /^GET \/(healthz|readyz|metrics)$/,
  /^POST \/api\/v1\/__test\//, // registered only with NODE_ENV=test
];
const isPublic = (r: Route) => PUBLIC_ROUTES.some((re) => re.test(`${r.method} ${r.path}`));

function fill(path: string): string {
  return path.replace(/\{(\w+)\}/g, (_m, name: string) => {
    if (/^(seq|level|version)$/.test(name)) return '1';
    if (name === 'tile') return '0_0.jpg';
    if (name === 'token') return 'invalid-token';
    if (name === 'action') return 'resolve';
    return RAND();
  });
}

export class Dast {
  results: ProbeResult[] = [];
  routes: Route[] = [];
  owner!: Api;
  a!: Api & { id: string };
  b!: Api & { id: string };
  generalSpaceId = '';
  private emails = 0;

  constructor(public opt: DastOptions) {}

  get base() {
    return this.opt.base;
  }

  // ------------------------------------------------------------------ setup (HTTP only)
  async setup() {
    const owner = new Api(this.base);
    const status = await owner.get('/api/v1/setup/status');
    if (status.initialized) throw new Error('DAST needs a fresh installation (empty database)');
    const r = await owner.post('/api/v1/setup', { orgName: 'DAST', ownerEmail: 'owner@dast.test', ownerName: 'Владелец DAST', password: 'Dast-owner-password-1' });
    owner.csrf = r.csrfToken;
    owner.user = r.user;
    this.owner = owner;
    this.generalSpaceId = (await owner.get('/api/v1/spaces')).spaces.find((s: any) => s.kind === 'org').id;
    this.a = await this.user('Сотрудник A');
    this.b = await this.user('Сотрудник B');
    const doc = await owner.get('/api/v1/openapi.json');
    for (const [p, ops] of Object.entries<any>(doc.paths ?? {})) for (const m of Object.keys(ops)) if (['get', 'post', 'put', 'patch', 'delete'].includes(m)) this.routes.push({ method: m.toUpperCase(), path: p });
  }

  async user(name: string, kind: 'employee' | 'guest' = 'employee') {
    const email = `u${++this.emails}-${Date.now().toString(36)}@dast.test`;
    const password = 'Dast-password-' + RAND().slice(0, 8) + '1';
    const created = await this.owner.post('/api/v1/admin/users', { email, name, kind, invite: false });
    await this.owner.post('/api/v1/__test/set-password', { userId: created.user.id, password });
    const api = new Api(this.base);
    await api.login(email, password);
    return Object.assign(api, { id: created.user.id as string, email, password });
  }

  private async probe(id: string, title: string, fn: (ctx: { check: (ok: boolean, f: Omit<Finding, 'severity'> & { severity?: Severity }) => void; note: (s: string) => void }) => Promise<void>) {
    const res: ProbeResult = { id, title, checks: 0, findings: [], notes: [], ms: 0 };
    const t = Date.now();
    try {
      await fn({
        check: (ok, f) => {
          res.checks++;
          if (!ok) res.findings.push({ severity: f.severity ?? 'high', target: f.target, detail: f.detail });
        },
        note: (s) => res.notes.push(s),
      });
    } catch (e: any) {
      res.findings.push({ severity: 'high', target: id, detail: `probe crashed: ${e?.stack ?? e}` });
    }
    res.ms = Date.now() - t;
    this.results.push(res);
    return res;
  }

  /** Runs every probe; the rate-limit probe last (it exhausts the login budget of this client). */
  async runAll() {
    await this.setup();
    await this.inventory();
    await this.authRequired();
    await this.csrf();
    await this.headers();
    await this.cookies();
    await this.idor();
    await this.xss();
    await this.ssrf();
    await this.openRedirect();
    await this.pathTraversal();
    await this.errors();
    await this.cors();
    await this.websocketOrigin();
    await this.rateLimits();
    return this.report();
  }

  report() {
    const findings = this.results.flatMap((r) => r.findings.map((f) => ({ probe: r.id, ...f })));
    return {
      tool: 'kb baseline DAST (tests/support/dast.ts)',
      target: this.base,
      generatedAt: new Date().toISOString(),
      routes: this.routes.length,
      summary: { probes: this.results.length, checks: this.results.reduce((n, r) => n + r.checks, 0), high: findings.filter((f) => f.severity === 'high').length, medium: findings.filter((f) => f.severity === 'medium').length, low: findings.filter((f) => f.severity === 'low').length },
      probes: this.results,
      findings,
    };
  }

  // ------------------------------------------------------------------ probes
  inventory() {
    return this.probe('inventory', 'Route inventory from the OpenAPI description', async ({ check, note }) => {
      check(this.routes.length >= 150, { target: '/api/v1/openapi.json', detail: `only ${this.routes.length} routes listed — inventory incomplete` });
      const mutating = this.routes.filter((r) => r.method !== 'GET').length;
      note(`${this.routes.length} operations (${mutating} mutating), ${this.routes.filter(isPublic).length} public by design`);
    });
  }

  authRequired() {
    return this.probe('authn', 'Every non-public route requires a session or API token', async ({ check }) => {
      for (const r of this.routes) {
        const path = fill(r.path);
        const res = await http(this.base, r.method, path, r.method === 'GET' ? {} : { json: {} });
        if (isPublic(r)) {
          check(res.status < 500, { target: `${r.method} ${r.path}`, detail: `public route answered ${res.status} to an anonymous probe`, severity: 'medium' });
          continue;
        }
        check(res.status === 401, { target: `${r.method} ${r.path}`, detail: `anonymous request got ${res.status} (expected 401): ${res.text.slice(0, 120)}` });
      }
      // A forged/expired session cookie and a bogus API token are not accepted either.
      const forged = await http(this.base, 'GET', '/api/v1/auth/me', { cookie: 'kb_session=' + 'A'.repeat(43) });
      check(forged.status === 401, { target: 'GET /api/v1/auth/me', detail: `forged session cookie got ${forged.status}` });
      const token = await http(this.base, 'GET', '/api/v1/auth/me', { headers: { authorization: 'Bearer kb_' + 'x'.repeat(40) } });
      check(token.status === 401, { target: 'GET /api/v1/auth/me', detail: `bogus API token got ${token.status}` });
    });
  }

  csrf() {
    return this.probe('csrf', 'CSRF token is enforced on every mutating route for cookie sessions', async ({ check, note }) => {
      const cookie = this.a.cookieHeader();
      let n = 0;
      for (const r of this.routes) {
        if (r.method === 'GET' || /^\/pub\//.test(r.path) || r.path === '/api/v1/auth/login') continue;
        n++;
        const path = fill(r.path);
        const missing = await http(this.base, r.method, path, { cookie, json: {} });
        check(missing.status === 403 && /CSRF/.test(missing.text), { target: `${r.method} ${r.path}`, detail: `without x-csrf-token: ${missing.status} ${missing.text.slice(0, 100)}` });
        if (n % 10 === 1) {
          const wrong = await http(this.base, r.method, path, { cookie, json: {}, headers: { 'x-csrf-token': 'x'.repeat(43) } });
          check(wrong.status === 403 && /CSRF/.test(wrong.text), { target: `${r.method} ${r.path}`, detail: `with a wrong x-csrf-token: ${wrong.status}` });
        }
      }
      // Form posts (the classic CSRF vector) are refused the same way.
      const form = await http(this.base, 'POST', '/api/v1/pages', { cookie, body: `spaceId=${this.generalSpaceId}&title=csrf`, headers: { 'content-type': 'application/x-www-form-urlencoded' } });
      check(form.status === 403 || form.status === 415, { target: 'POST /api/v1/pages (form)', detail: `cross-site form post got ${form.status}` });
      // The session still works with the token (the probe did not just break the session).
      const ok = await this.a.raw('POST', '/api/v1/notifications/read', {});
      check(ok.status === 200, { target: 'POST /api/v1/notifications/read', detail: `request with a valid token got ${ok.status}`, severity: 'medium' });
      note(`${n} mutating operations probed`);
    });
  }

  headers() {
    return this.probe('headers', 'Security headers on every kind of response', async ({ check, note }) => {
      const page = (await this.owner.post('/api/v1/pages', { spaceId: this.generalSpaceId, title: 'Заголовки' })).page;
      const att = await this.upload(this.owner, page.id, 'note.txt', 'текст', 'text/plain');
      const html = await this.upload(this.owner, page.id, 'evil.html', '<script>alert(1)</script>', 'text/html');
      const index = await http(this.base, 'GET', '/');
      const asset = /src="(\/assets\/[^"]+\.js)"/.exec(index.text)?.[1];
      const targets: Array<{ name: string; path: string; cookie?: string; app: boolean }> = [
        { name: 'API JSON', path: '/api/v1/auth/me', cookie: this.owner.cookieHeader(), app: true },
        { name: 'API 401', path: '/api/v1/pages/' + RAND(), app: true },
        { name: 'API 404', path: '/api/v1/no-such-route', cookie: this.owner.cookieHeader(), app: true },
        { name: 'SPA index', path: '/', app: true },
        { name: 'SPA deep link', path: '/p/' + page.id, app: true },
        { name: 'health', path: '/healthz', app: true },
        { name: 'attachment content', path: att.contentUrl, cookie: this.owner.cookieHeader(), app: false },
        { name: 'attachment download', path: att.downloadUrl, cookie: this.owner.cookieHeader(), app: false },
        { name: 'HTML attachment', path: html.contentUrl, cookie: this.owner.cookieHeader(), app: false },
        { name: 'page export', path: `/api/v1/pages/${page.id}/export?format=html`, cookie: this.owner.cookieHeader(), app: true },
      ];
      if (asset) targets.push({ name: 'static asset', path: asset, app: true });
      else note('no built web client is served — SPA/static asset headers not probed');
      for (const t of targets) {
        const r = await http(this.base, 'GET', t.path, { cookie: t.cookie });
        const h = (k: string) => r.headers.get(k) ?? '';
        const csp = h('content-security-policy');
        const where = `${t.name} (${r.status}) ${t.path.slice(0, 60)}`;
        check(h('x-content-type-options') === 'nosniff', { target: where, detail: 'X-Content-Type-Options: nosniff missing' });
        check(!!csp, { target: where, detail: 'Content-Security-Policy missing' });
        check(/frame-ancestors '(none|self)'/.test(csp), { target: where, detail: `CSP without frame-ancestors: ${csp}` });
        check(!/script-src[^;]*'unsafe-(inline|eval)'/.test(csp), { target: where, detail: `script-src allows unsafe-inline/eval: ${csp}` });
        check(!/default-src[^;]*\*/.test(csp), { target: where, detail: `wildcard default-src: ${csp}` });
        check(!!h('strict-transport-security'), { target: where, detail: 'Strict-Transport-Security missing', severity: 'medium' });
        check(!!h('referrer-policy'), { target: where, detail: 'Referrer-Policy missing', severity: 'medium' });
        check(!h('x-powered-by'), { target: where, detail: `X-Powered-By disclosed: ${h('x-powered-by')}`, severity: 'low' });
        if (t.app) check(!!h('cross-origin-opener-policy'), { target: where, detail: 'Cross-Origin-Opener-Policy missing', severity: 'low' });
        if (t.path.startsWith('/api/') && t.cookie) check(/no-store|private/.test(h('cache-control')), { target: where, detail: `authenticated API response cacheable: cache-control="${h('cache-control')}"`, severity: 'medium' });
        if (t.name === 'HTML attachment') {
          check(/sandbox/.test(csp), { target: where, detail: 'user HTML served without CSP sandbox' });
          check(/^attachment/.test(h('content-disposition')), { target: where, detail: `user HTML rendered inline: ${h('content-disposition')}` });
        }
      }
    });
  }

  cookies() {
    return this.probe('cookies', 'Session cookie flags, session fixation, logout invalidation', async ({ check }) => {
      const u = await this.user('Проверка cookie');
      const res = await fetch(this.base + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', cookie: 'kb_session=fixated-by-attacker' }, body: JSON.stringify({ email: u.email, password: u.password }) });
      const set = res.headers.getSetCookie();
      const session = set.find((c) => c.startsWith('kb_session=')) ?? '';
      const csrf = set.find((c) => c.startsWith('kb_csrf=')) ?? '';
      check(/;\s*HttpOnly/i.test(session), { target: 'kb_session', detail: `not HttpOnly: ${session.replace(/=[^;]+/, '=…')}` });
      check(/;\s*SameSite=(Lax|Strict)/i.test(session), { target: 'kb_session', detail: 'SameSite missing' });
      check(/;\s*Path=\//i.test(session), { target: 'kb_session', detail: 'Path missing' });
      check(/;\s*SameSite=(Lax|Strict)/i.test(csrf), { target: 'kb_csrf', detail: 'SameSite missing' });
      if (this.opt.expectSecureCookies) check(/;\s*Secure/i.test(session) && /;\s*Secure/i.test(csrf), { target: 'cookies', detail: 'Secure flag missing in production mode' });
      const token = /^kb_session=([^;]+)/.exec(session)?.[1] ?? '';
      check(token.length >= 32 && token !== 'fixated-by-attacker', { target: 'kb_session', detail: 'session id not regenerated on login / too short' });
      const cookie = `kb_session=${token}`;
      const csrfToken = (await res.json()).csrfToken;
      const out = await http(this.base, 'POST', '/api/v1/auth/logout', { cookie, headers: { 'x-csrf-token': csrfToken }, json: {} });
      check(out.status === 200, { target: 'POST /api/v1/auth/logout', detail: `logout got ${out.status}`, severity: 'medium' });
      const after = await http(this.base, 'GET', '/api/v1/auth/me', { cookie });
      check(after.status === 401, { target: 'GET /api/v1/auth/me', detail: `old session cookie still valid after logout (${after.status})` });
      // User enumeration: unknown e-mail and wrong password look the same.
      const unknown = await http(this.base, 'POST', '/api/v1/auth/login', { json: { email: 'nobody-' + RAND() + '@dast.test', password: 'x' } });
      const wrong = await http(this.base, 'POST', '/api/v1/auth/login', { json: { email: u.email, password: 'wrong-password' } });
      const msg = (t: string) => JSON.parse(t)?.error?.message;
      check(unknown.status === wrong.status && msg(unknown.text) === msg(wrong.text), { target: 'POST /api/v1/auth/login', detail: `user enumeration: ${unknown.status}/${msg(unknown.text)} vs ${wrong.status}/${msg(wrong.text)}`, severity: 'medium' });
    });
  }

  idor() {
    return this.probe('idor', 'Objects of user A are invisible (404) and immutable for user B', async ({ check }) => {
      const me = await this.a.get('/api/v1/auth/me');
      const page = (await this.a.post('/api/v1/pages', { spaceId: me.personalSpaceId, title: 'Личное A' })).page;
      const att = await this.upload(this.a, page.id, 'secret-a.txt', 'секрет A', 'text/plain');
      await this.a.post(`/api/v1/pages/${page.id}/comments`, { text: 'Комментарий A' });
      const comment = (await this.a.get(`/api/v1/pages/${page.id}/comments`)).threads?.[0] ?? (await this.a.get(`/api/v1/pages/${page.id}/comments`)).comments?.[0];
      const commentId = comment?.id ?? comment?.comments?.[0]?.id ?? comment?.root?.id;
      const threadId = comment?.threadId ?? comment?.thread_id ?? comment?.id;
      const rev = (await this.a.post(`/api/v1/pages/${page.id}/revisions`, {})).revision;
      const upload = await this.a.post('/api/v1/uploads', { pageId: page.id, filename: 'big.bin', size: 10 });
      const reads = [
        `/api/v1/pages/${page.id}`,
        `/api/v1/pages/${page.id}/content`,
        `/api/v1/pages/${page.id}/children`,
        `/api/v1/pages/${page.id}/backlinks`,
        `/api/v1/pages/${page.id}/attachments`,
        `/api/v1/pages/${page.id}/comments`,
        `/api/v1/pages/${page.id}/revisions`,
        rev?.id ? `/api/v1/pages/${page.id}/revisions/${rev.id}` : null,
        `/api/v1/pages/${page.id}/events`,
        `/api/v1/pages/${page.id}/access`,
        `/api/v1/pages/${page.id}/share-links`,
        `/api/v1/pages/${page.id}/export?format=md`,
        `/api/v1/pages/${page.id}/exposure`,
        `/api/v1/attachments/${att.id}`,
        `/api/v1/attachments/${att.id}/content`,
        `/api/v1/attachments/${att.id}/download`,
        `/api/v1/attachments/${att.id}/ocr`,
        `/api/v1/uploads/${upload.uploadId}`,
        `/api/v1/spaces/${me.personalSpaceId}`,
        `/api/v1/spaces/${me.personalSpaceId}/tree`,
        `/api/v1/search?q=${encodeURIComponent('Личное A')}`,
      ].filter(Boolean) as string[];
      for (const p of reads) {
        const r = await this.b.raw('GET', p);
        const text = await r.text();
        if (p.startsWith('/api/v1/search')) {
          check(r.status === 200 && !text.includes(page.id), { target: `GET ${p}`, detail: 'private page of A found by B in search' });
          continue;
        }
        // By design the tree of a space one cannot see answers 200 with only the pages shared individually (here:
        // none) — the same answer as for a space with nothing shared, so it reveals nothing about the content.
        const emptyTree = p.endsWith('/tree') && r.status === 200 && JSON.parse(text).nodes?.length === 0;
        check(r.status === 404 || emptyTree, { target: `GET ${p.replace(/[0-9a-f-]{36}/g, ':id')}`, detail: `B got ${r.status}: ${text.slice(0, 120)}`, severity: r.status === 403 ? 'low' : 'high' });
        check(!text.includes('секрет A') && !text.includes('Личное A'), { target: `GET ${p}`, detail: 'response leaks content or title of A' });
      }
      const writes: Array<[string, string, unknown]> = [
        ['PATCH', `/api/v1/pages/${page.id}`, { title: 'Захвачено' }],
        ['DELETE', `/api/v1/pages/${page.id}`, undefined],
        ['POST', `/api/v1/pages/${page.id}/comments`, { text: 'чужой' }],
        ['POST', `/api/v1/pages/${page.id}/move`, { spaceId: this.generalSpaceId }],
        ['POST', `/api/v1/pages/${page.id}/duplicate`, {}],
        ['PUT', '/api/v1/grants', { resourceType: 'page', resourceId: page.id, subjectType: 'user', subjectId: this.b.id, level: 'full' }],
        ['POST', `/api/v1/pages/${page.id}/share-links`, { acknowledged: true }],
        ['PATCH', `/api/v1/attachments/${att.id}`, { filename: 'захват.txt' }],
        ['DELETE', `/api/v1/attachments/${att.id}`, undefined],
        ['POST', `/api/v1/attachments/${att.id}/link`, {}],
        ['PUT', `/api/v1/uploads/${upload.uploadId}?offset=0`, undefined],
        ['DELETE', `/api/v1/uploads/${upload.uploadId}`, undefined],
        ...(commentId ? ([['PATCH', `/api/v1/comments/${commentId}`, { text: 'изменено B' }], ['DELETE', `/api/v1/comments/${commentId}`, undefined]] as Array<[string, string, unknown]>) : []),
        ...(threadId ? ([['POST', `/api/v1/comments/threads/${threadId}/resolve`, {}]] as Array<[string, string, unknown]>) : []),
        ...(rev?.id ? ([['POST', `/api/v1/pages/${page.id}/revisions/${rev.id}/restore`, {}]] as Array<[string, string, unknown]>) : []),
      ];
      for (const [m, p, body] of writes) {
        const r = await this.b.raw(m, p, body);
        check(r.status === 404 || r.status === 403, { target: `${m} ${p.replace(/[0-9a-f-]{36}/g, ':id')}`, detail: `B got ${r.status}` });
      }
      // A's objects are unchanged.
      const still = await this.a.get(`/api/v1/pages/${page.id}`);
      check(still.page.title === 'Личное A' && !still.page.deletedAt, { target: 'page of A', detail: 'modified by B' });
      const back = await this.a.raw('GET', att.downloadUrl);
      check(back.status === 200 && (await back.text()) === 'секрет A', { target: 'attachment of A', detail: 'modified or removed by B' });
      check(!!commentId, { target: 'comment id', detail: 'could not resolve the comment id of A (comment IDOR not probed)', severity: 'low' });
    });
  }

  xss() {
    return this.probe('xss', 'XSS payloads in titles, comments, file names and imports are inert in every HTML output', async ({ check, note }) => {
      const page = (await this.owner.post('/api/v1/pages', { spaceId: this.generalSpaceId, title: XSS.title })).page;
      await this.owner.post(`/api/v1/pages/${page.id}/comments`, { text: XSS.comment });
      const att = await this.upload(this.owner, page.id, XSS.filename, 'x', 'text/plain');
      check(!/[\u0000-\u001f/\\]/.test(att.filename), { target: 'attachment filename', detail: `stored as ${att.filename}`, severity: 'medium' });
      const dl = await this.owner.raw('GET', att.downloadUrl);
      const cd = dl.headers.get('content-disposition') ?? '';
      // Header injection: the quoted filename must not be closable by the payload.
      check(/^attachment; filename="[^"]*"(; filename\*=UTF-8''[^\s;"]+)?$/.test(cd), { target: 'Content-Disposition', detail: cd });
      // Import (HTML and Markdown) with active content.
      const fd = new FormData();
      fd.append('file', new Blob([`<html><head><title>${XSS.title}</title></head><body><p onclick="alert(1)">т</p><img src="x" onerror="alert(2)"><a href="javascript:alert(3)">s</a><iframe src="javascript:alert(4)"></iframe><svg onload="alert(5)"></svg><form action="javascript:alert(6)"><input></form></body></html>`]), 'x.html');
      fd.append('file', new Blob([`# ${XSS.title}\n\n[a](javascript:alert(7)) <img src=x onerror=alert(8)>\n\n<script>alert(9)</script>\n`]), 'x.md');
      const imp = await this.owner.req('POST', '/api/v1/imports', fd);
      let job: any;
      for (let i = 0; i < 300; i++) {
        job = await this.owner.get(`/api/v1/imports/${imp.jobId}`);
        if (!['queued', 'running'].includes(job.status)) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      const pages = [page.id];
      const committed = await this.owner.raw('POST', `/api/v1/imports/${imp.jobId}/commit`, { target: { spaceId: this.generalSpaceId, parentId: null } });
      if (committed.ok) {
        const res = await committed.json();
        for (const p of res.pages) {
          pages.push(p.id);
          const json = JSON.stringify((await this.owner.get(`/api/v1/pages/${p.id}/content`)).content);
          for (const bad of ['<script', 'onerror', 'onclick', 'onload', 'javascript:', 'alert(']) check(!json.includes(bad), { target: `import ${p.title}`, detail: `stored content contains ${bad}` });
        }
      } else note(`import job ended as ${job?.status} (worker not running?) — import part skipped`);
      // HTML exports and the public page render the stored strings as text.
      for (const id of pages) {
        const r = await this.owner.raw('GET', `/api/v1/pages/${id}/export?format=html`);
        const body = await r.text();
        check(r.status === 200, { target: `export html ${id}`, detail: `status ${r.status}`, severity: 'low' });
        for (const re of RAW_XSS) check(!re.test(body), { target: `GET /api/v1/pages/:id/export?format=html`, detail: `raw payload ${re} in exported HTML` });
      }
      const md = await (await this.owner.raw('GET', `/api/v1/pages/${page.id}/export?format=md`)).text();
      // Markdown renderers pass raw HTML through: user text must come out escaped. The YAML front matter is data
      // (YAML-quoted by the serializer, keeps the exact title for re-import) and is not rendered as Markdown.
      const mdBody = md.replace(/^---\n[\s\S]*?\n---\n/, '');
      // `\<` is a Markdown backslash escape (literal text), so only unescaped `<` counts.
      for (const re of RAW_XSS.map((r) => new RegExp(r.source.replace(/^</, '(?<!\\\\)<'), r.flags))) check(!re.test(mdBody), { target: 'GET /api/v1/pages/:id/export?format=md', detail: `active HTML ${re} in Markdown export: ${mdBody.slice(0, 200)}` });
      // JSON APIs are served as JSON (never sniffed as HTML).
      const c = await this.owner.raw('GET', `/api/v1/pages/${page.id}/comments`);
      check(/application\/json/.test(c.headers.get('content-type') ?? ''), { target: 'GET /api/v1/pages/:id/comments', detail: `content-type ${c.headers.get('content-type')}` });
      // Public link page (server-rendered HTML).
      const prev = (await this.owner.get('/api/v1/admin/settings')).settings?.publicLinksEnabled;
      await this.owner.patch('/api/v1/admin/settings', { publicLinksEnabled: true });
      try {
        const link = await this.owner.post(`/api/v1/pages/${page.id}/share-links`, { acknowledged: true });
        const pub = await http(this.base, 'GET', link.path);
        check(pub.status === 200, { target: 'GET /pub/:token', detail: `status ${pub.status}`, severity: 'low' });
        for (const re of RAW_XSS) check(!re.test(pub.text), { target: 'GET /pub/:token', detail: `raw payload ${re} in public page` });
        check(/script-src/.test(pub.headers.get('content-security-policy') ?? '') || /default-src 'none'/.test(pub.headers.get('content-security-policy') ?? ''), { target: 'GET /pub/:token', detail: 'public page without script-restricting CSP' });
        await this.owner.del(`/api/v1/share-links/${link.link.id}`);
      } finally {
        await this.owner.patch('/api/v1/admin/settings', { publicLinksEnabled: !!prev });
      }
      note('clipboard paste sanitisation is client-side (apps/web/src/editor/clipboard) — covered by tests/unit/editor-p0-clipboard.test.ts and tests/unit/clipboard-html.test.ts, not by DAST');
    });
  }

  ssrf() {
    return this.probe('ssrf', 'Server-side fetches cannot reach loopback, private or metadata addresses', async ({ check, note }) => {
      let hits = 0;
      const internal: Server = createHttpServer((req, res) => {
        hits++;
        res.writeHead(200, { 'content-type': 'image/png' }).end(Buffer.from('89504e470d0a1a0a', 'hex'));
      });
      await new Promise<void>((r) => internal.listen(0, '127.0.0.1', () => r()));
      const port = (internal.address() as any).port;
      try {
        const page = (await this.owner.post('/api/v1/pages', { spaceId: this.generalSpaceId, title: 'SSRF' })).page;
        const urls = [
          `http://127.0.0.1:${port}/a.png`,
          `http://localhost:${port}/a.png`,
          `http://[::1]:${port}/a.png`,
          `http://[::ffff:127.0.0.1]:${port}/a.png`,
          `http://2130706433:${port}/a.png`,
          `http://0x7f000001:${port}/a.png`,
          `http://0177.0.0.1:${port}/a.png`,
          `http://127.1:${port}/a.png`,
          `http://0.0.0.0:${port}/a.png`,
          'http://169.254.169.254/latest/meta-data/',
          'http://[fd00::1]/a.png',
          'http://10.0.0.1/a.png',
          'http://192.168.0.1/a.png',
          'http://100.64.0.1/a.png',
          'file:///etc/passwd',
          'gopher://127.0.0.1:6379/_INFO',
          'ftp://127.0.0.1/a.png',
          `http://user:pass@127.0.0.1:${port}/a.png`,
          `http://127.0.0.1.nip.io:${port}/a.png`,
        ];
        for (const url of urls) {
          const r = await this.owner.raw('POST', '/api/v1/attachments/from-url', { url, pageId: page.id });
          const body = await r.text();
          check(r.status >= 400 && r.status < 500, { target: `from-url ${url}`, detail: `status ${r.status}: ${body.slice(0, 100)}` });
          check(!body.includes('root:x:0:0'), { target: `from-url ${url}`, detail: 'local file content returned' });
        }
        // Import: images with internal addresses are not fetched.
        const fd = new FormData();
        fd.append('file', new Blob([`# SSRF\n\n![](http://127.0.0.1:${port}/md.png)\n`]), 'ssrf.md');
        fd.append('file', new Blob([`<html><body><img src="http://127.0.0.1:${port}/html.png"><img src="http://[::1]:${port}/v6.png"></body></html>`]), 'ssrf.html');
        const imp = await this.owner.req('POST', '/api/v1/imports', fd);
        for (let i = 0; i < 300; i++) {
          const j = await this.owner.get(`/api/v1/imports/${imp.jobId}`);
          if (!['queued', 'running'].includes(j.status)) break;
          await new Promise((r) => setTimeout(r, 100));
        }
        await this.owner.raw('POST', `/api/v1/imports/${imp.jobId}/commit`, { target: { spaceId: this.generalSpaceId, parentId: null } });
        check(hits === 0, { target: `internal listener 127.0.0.1:${port}`, detail: `received ${hits} request(s) from the server` });
        note('redirect-to-internal and DNS-rebinding cases need a controllable external host; covered by tests/integration/acl-p0.test.ts «SC-33 R-SECURITY-008» against the fetcher with a stubbed resolver');
      } finally {
        internal.close();
      }
    });
  }

  openRedirect() {
    return this.probe('open-redirect', 'No redirect leads to another origin', async ({ check }) => {
      const origin = new URL(this.base).origin;
      const paths = ['//evil.example/', '/%2F%2Fevil.example/', '/\\evil.example/', '/%5Cevil.example/', '/assets', '/assets//evil.example/', '/assets/..%2F%2Fevil.example', '/pub/x?next=https://evil.example', '/api/v1/auth/oidc/callback?redirect_uri=https://evil.example', '/api/v1/auth/oidc/start?returnTo=https://evil.example', '/login?next=https://evil.example', '/?redirect=//evil.example'];
      for (const p of paths) {
        const r = await http(this.base, 'GET', p);
        const loc = r.headers.get('location');
        if (r.status >= 300 && r.status < 400 && loc) {
          const target = new URL(loc, this.base);
          check(target.origin === origin && !/^\/[\\/]/.test(loc), { target: `GET ${p}`, detail: `redirects to ${loc}` });
        } else check(true, { target: p, detail: '' });
      }
    });
  }

  pathTraversal() {
    return this.probe('path-traversal', 'File-serving routes do not escape their roots', async ({ check }) => {
      const page = (await this.owner.post('/api/v1/pages', { spaceId: this.generalSpaceId, title: 'Пути' })).page;
      const att = await this.upload(this.owner, page.id, '../../../../etc/passwd', 'root:x:0:0 (not really)', 'text/plain');
      check(!att.filename.includes('/') && !att.filename.includes('..'), { target: 'upload filename', detail: `stored as ${att.filename}` });
      const probes = [
        '/assets/../../../../../etc/passwd',
        '/assets/..%2f..%2f..%2f..%2f..%2fetc%2fpasswd',
        '/assets/%2e%2e/%2e%2e/%2e%2e/%2e%2e/etc/passwd',
        '/..%2f..%2f..%2f..%2fetc%2fpasswd',
        '/%2e%2e%2f%2e%2e%2f%2e%2e%2fpackage.json',
        '/..%5c..%5c..%5cetc%5cpasswd',
        '/assets/..%252f..%252f..%252fetc%252fpasswd',
        '/index.html/..%2f..%2f..%2fpackage.json',
        '/api/v1/files/..%2f..%2f..%2fetc%2fpasswd',
        `/api/v1/attachments/${att.id}/tiles/..%2f..%2f..%2f/..%2fpasswd`,
        `/api/v1/attachments/${att.id}/tiles/0/..%2f..%2f..%2f..%2fetc%2fpasswd`,
        '/pub/x/files/..%2f..%2f..%2fetc%2fpasswd',
        '/api/v1/attachments/..%2f..%2f..%2fetc%2fpasswd/content',
      ];
      for (const p of probes) {
        const r = await http(this.base, 'GET', p, { cookie: this.owner.cookieHeader() });
        check(!/root:x:0:0:/.test(r.text) && !/"workspaces"\s*:/.test(r.text) && !/DATABASE_URL|SECRET_KEY=/.test(r.text), { target: `GET ${p}`, detail: `served a file outside the web root (${r.status})` });
        check(r.status < 500, { target: `GET ${p}`, detail: `server error ${r.status}`, severity: 'low' });
      }
    });
  }

  errors() {
    return this.probe('errors', 'Malformed input gets 4xx without stack traces, paths or SQL; prototype pollution refused', async ({ check }) => {
      const cookie = this.owner.cookieHeader();
      const csrf = { 'x-csrf-token': this.owner.csrf ?? '' };
      const cases: Array<[string, string, { body?: string | Buffer; headers?: Record<string, string> }, number[]]> = [
        ['POST', '/api/v1/pages', { body: '{"spaceId": ', headers: { ...csrf, 'content-type': 'application/json' } }, [400]],
        ['POST', '/api/v1/pages', { body: `{"spaceId":"${this.generalSpaceId}","title":"p","__proto__":{"isAdmin":true}}`, headers: { ...csrf, 'content-type': 'application/json' } }, [400]],
        ['POST', '/api/v1/pages', { body: `{"spaceId":"${this.generalSpaceId}","constructor":{"prototype":{"isAdmin":true}}}`, headers: { ...csrf, 'content-type': 'application/json' } }, [400]],
        ['POST', '/api/v1/pages', { body: '<x/>', headers: { ...csrf, 'content-type': 'application/xml' } }, [400, 415]],
        ['POST', '/api/v1/pages', { body: JSON.stringify({ spaceId: 'not-a-uuid' }), headers: { ...csrf, 'content-type': 'application/json' } }, [400]],
        ['POST', '/api/v1/pages', { body: JSON.stringify({ spaceId: this.generalSpaceId, title: 'x'.repeat(100_000) }), headers: { ...csrf, 'content-type': 'application/json' } }, [400]],
        ['POST', '/api/v1/pages', { body: Buffer.alloc(25 * 1024 * 1024, 32), headers: { ...csrf, 'content-type': 'application/json' } }, [400, 413]],
        ['GET', '/api/v1/pages/not-a-uuid', {}, [400, 404]],
        ['GET', `/api/v1/pages/${RAND()}'%20or%201=1--`, {}, [400, 404]],
        ['GET', '/api/v1/search?q=%00%27%22%5C', {}, [200, 400]],
        ['GET', '/api/v1/search?q=' + encodeURIComponent("') or 1=1 --"), {}, [200]],
        ['GET', '/api/v1/search?q=' + encodeURIComponent('a'.repeat(5000)), {}, [200, 400]],
        ['GET', '/api/v1/search?limit=-1&offset=-5&q=x', {}, [200, 400]],
        ['GET', '/api/v1/spaces/%00', {}, [400, 404]],
        ['GET', '/api/v1/audit?from=not-a-date', {}, [200, 400]],
      ];
      for (const [m, p, o, ok] of cases) {
        const r = await http(this.base, m, p, { cookie, ...o });
        const where = `${m} ${p.slice(0, 70)}`;
        check(ok.includes(r.status), { target: where, detail: `status ${r.status} (expected ${ok.join('/')}): ${r.text.slice(0, 160)}`, severity: r.status >= 500 ? 'medium' : 'low' });
        for (const re of STACK) check(!re.test(r.text), { target: where, detail: `error body leaks internals (${re}): ${r.text.slice(0, 200)}` });
      }
      // The pollution attempt changed nothing visible.
      const me = await this.owner.get('/api/v1/auth/me');
      check(me.isAdmin === undefined, { target: 'GET /api/v1/auth/me', detail: 'polluted property visible' });
    });
  }

  cors() {
    return this.probe('cors', 'No cross-origin read access to the API', async ({ check }) => {
      for (const p of ['/api/v1/auth/me', '/api/v1/search?q=a', '/api/v1/spaces']) {
        const r = await http(this.base, 'GET', p, { cookie: this.owner.cookieHeader(), headers: { origin: 'https://evil.example' } });
        const acao = r.headers.get('access-control-allow-origin');
        check(!acao || (acao !== '*' && acao !== 'https://evil.example'), { target: `GET ${p}`, detail: `ACAO=${acao}` });
        const pre = await http(this.base, 'OPTIONS', p, { headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST', 'access-control-request-headers': 'x-csrf-token' } });
        check(!pre.headers.get('access-control-allow-origin'), { target: `OPTIONS ${p}`, detail: `preflight allowed: ${pre.headers.get('access-control-allow-origin')}` });
      }
    });
  }

  websocketOrigin() {
    return this.probe('ws-origin', 'WebSockets refuse foreign origins and anonymous clients (cross-site WebSocket hijacking)', async ({ check }) => {
      const page = (await this.owner.post('/api/v1/pages', { spaceId: this.generalSpaceId, title: 'WS' })).page;
      const wsBase = this.base.replace(/^http/, 'ws');
      const open = (path: string, headers: Record<string, string>) =>
        new Promise<{ closed: number | null; messages: number }>((resolve) => {
          const ws = new WebSocket(wsBase + path, { headers });
          let messages = 0;
          const done = (closed: number | null) => {
            clearTimeout(t);
            resolve({ closed, messages });
            try {
              ws.terminate();
            } catch {}
          };
          const t = setTimeout(() => done(null), 2500);
          ws.on('message', () => messages++);
          ws.on('close', (code) => done(code));
          ws.on('error', () => done(-1));
        });
      for (const path of [`/api/v1/collab/${page.id}`, '/api/v1/events']) {
        const evil = await open(path, { cookie: this.owner.cookieHeader(), origin: 'https://evil.example' });
        check(evil.closed !== null, { target: `WS ${path}`, detail: 'foreign Origin with a valid session cookie stayed connected' });
        const anon = await open(path, { origin: this.base });
        check(anon.closed !== null, { target: `WS ${path}`, detail: 'anonymous connection stayed open' });
        const ok = await open(path, { cookie: this.owner.cookieHeader(), origin: this.base });
        check(ok.closed === null || ok.messages > 0, { target: `WS ${path}`, detail: `same-origin authenticated connection refused (${ok.closed}) — probe misconfigured`, severity: 'low' });
      }
    });
  }

  rateLimits() {
    return this.probe('rate-limit', 'Login and API rate limits hold, also against X-Forwarded-For spoofing', async ({ check, note }) => {
      const l = this.opt.limits;
      if (!l) {
        note('server started without low limits — probe skipped (run with limits, see scripts/security/dast.ts)');
        return;
      }
      const hops = this.opt.proxyHops ?? 0;
      // A real client behind `hops` proxies: the address the nearest proxy appends is constant, the leftmost part
      // (attacker-controlled) rotates on every attempt.
      const client = '203.0.113.' + (1 + Math.floor(Math.random() * 250));
      const xff = (i: number) => (hops > 0 ? `198.51.100.${i % 250}, ${client}` : `198.51.100.${i % 250}`);
      let limited = 0;
      for (let i = 0; i < l.authPerMinute + 3; i++) {
        const r = await http(this.base, 'POST', '/api/v1/auth/login', { json: { email: 'victim@dast.test', password: 'guess-' + i }, headers: { 'x-forwarded-for': xff(i) } });
        if (r.status === 429) limited++;
      }
      check(limited >= 2, { target: 'POST /api/v1/auth/login', detail: `${l.authPerMinute + 3} attempts with rotating X-Forwarded-For, ${limited} rate-limited (limit ${l.authPerMinute}/min)` });
      const u = await this.user('Быстрый клиент').catch(() => null);
      if (!u) {
        note('could not log in a fresh user after the login burst (same client address) — API limit not probed');
        return;
      }
      let apiLimited = 0;
      const batch = 50;
      for (let sent = 0; sent < l.apiPerMinute + 20 && !apiLimited; sent += batch) {
        const rs = await Promise.all(Array.from({ length: batch }, () => u.raw('GET', '/api/v1/auth/me')));
        apiLimited += rs.filter((r) => r.status === 429).length;
      }
      check(apiLimited > 0, { target: 'GET /api/v1/auth/me', detail: `no 429 after ${l.apiPerMinute + 20} requests (limit ${l.apiPerMinute}/min)` });
      const r = await u.raw('GET', '/api/v1/auth/me');
      const body = await r.text();
      check(r.status !== 429 || (/rate_limited/.test(body) && !STACK.some((re) => re.test(body))), { target: '429 body', detail: body.slice(0, 120), severity: 'low' });
    });
  }

  // ------------------------------------------------------------------ helpers
  async upload(api: Api, pageId: string, name: string, data: string, mime: string) {
    const fd = new FormData();
    fd.append('pageId', pageId);
    fd.append('file', new Blob([Buffer.from(data)], { type: mime }), name);
    const r = await api.req('POST', '/api/v1/attachments', fd);
    return r.attachments[0];
  }
}

/** Markdown summary of a report (for logs / CI summaries). */
export function summarize(report: ReturnType<Dast['report']>): string {
  const lines = [`DAST ${report.target}: ${report.summary.probes} probes, ${report.summary.checks} checks, ${report.routes} routes — findings: high ${report.summary.high}, medium ${report.summary.medium}, low ${report.summary.low}`];
  for (const p of report.probes) lines.push(`  ${p.findings.length ? 'FAIL' : 'ok  '} ${p.id.padEnd(15)} ${String(p.checks).padStart(4)} checks ${p.findings.length ? `${p.findings.length} findings` : ''}${p.notes.length ? ' — ' + p.notes.join('; ') : ''}`);
  for (const f of report.findings) lines.push(`    [${f.severity}] ${f.probe}: ${f.target} — ${f.detail}`);
  return lines.join('\n');
}
