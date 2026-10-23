import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer as createNetServer } from 'node:net';
import { startServer, setupOrg, type TestServer } from '../support/harness.js';
import { startIdp, type TestIdp } from '../support/oidc-idp.js';

/**
 * SEC-L3: OIDC SSO end-to-end against a real OpenID Provider (panva/oidc-provider, tests/support/oidc-idp.ts):
 * authorization code + PKCE + state + nonce, account matching/provisioning, group/department claim mapping,
 * rejection of forged/expired/mis-addressed ID tokens, state replay, IdP errors and outages, RP-initiated logout.
 * The browser is simulated with a cookie jar that follows redirects between the app and the IdP.
 */

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createNetServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => resolve(port));
    });
  });
}

interface Cookie {
  value: string;
  path: string;
}

/** Minimal browser: per-origin cookie jar (with paths), manual redirect following. */
class Browser {
  jar = new Map<string, Map<string, Cookie>>();
  constructor(private readonly appOrigin: string) {}

  private cookiesFor(url: URL) {
    const m = this.jar.get(url.origin);
    if (!m) return '';
    return [...m.entries()]
      .filter(([, c]) => url.pathname.startsWith(c.path))
      .map(([k, c]) => `${k}=${c.value}`)
      .join('; ');
  }
  private store(url: URL, res: Response) {
    const m = this.jar.get(url.origin) ?? new Map<string, Cookie>();
    for (const raw of res.headers.getSetCookie()) {
      const [kv, ...attrs] = raw.split(';').map((x) => x.trim());
      const i = kv.indexOf('=');
      const name = kv.slice(0, i);
      const value = kv.slice(i + 1);
      const path = attrs.find((a) => /^path=/i.test(a))?.slice(5) || '/';
      const expired = attrs.some((a) => /^expires=Thu, 01 Jan 1970/i.test(a) || /^max-age=0$/i.test(a));
      if (!value || expired) m.delete(name);
      else m.set(name, { value, path });
    }
    this.jar.set(url.origin, m);
  }
  cookie(origin: string, name: string) {
    return this.jar.get(origin)?.get(name)?.value ?? null;
  }
  setCookie(origin: string, name: string, value: string, path = '/') {
    const m = this.jar.get(origin) ?? new Map<string, Cookie>();
    m.set(name, { value, path });
    this.jar.set(origin, m);
  }

  async request(method: string, href: string, body?: Record<string, string>, headers: Record<string, string> = {}) {
    const url = new URL(href);
    const h: Record<string, string> = { ...headers };
    const c = this.cookiesFor(url);
    if (c) h.cookie = c;
    let payload: string | undefined;
    if (body) {
      h['content-type'] = 'application/x-www-form-urlencoded';
      payload = new URLSearchParams(body).toString();
    }
    const res = await fetch(url, { method, headers: h, body: payload, redirect: 'manual' });
    this.store(url, res);
    return res;
  }

  /** Follows redirects until the browser lands on a page (2xx/4xx) or on the SPA of the app (non-API path). */
  async go(href: string, method = 'GET', body?: Record<string, string>): Promise<{ url: URL; res: Response; html: string }> {
    let url = new URL(href);
    let res = await this.request(method, url.href, body);
    for (let i = 0; i < 20 && res.status >= 300 && res.status < 400; i++) {
      url = new URL(res.headers.get('location')!, url);
      if (url.origin === this.appOrigin && !url.pathname.startsWith('/api/')) return { url, res, html: '' };
      res = await this.request('GET', url.href);
    }
    return { url, res, html: await res.text() };
  }
}

const formAction = (html: string) => /<form method="post" action="([^"]+)"/.exec(html)?.[1] ?? null;

describe('OIDC SSO with a real OpenID Provider (SEC-L3)', () => {
  let ts: TestServer;
  let idp: TestIdp;
  let org: Awaited<ReturnType<typeof setupOrg>>;
  let app: string;
  const secret = 'kb-test-client-secret-0123456789';

  const login = async (b: Browser, email: string, password: string, start = '/api/v1/auth/oidc/start') => {
    const page = await b.go(app + start);
    if (page.url.origin === app) return page.url; // IdP session still alive: straight back
    expect(page.html).toContain('Тестовый IdP — вход');
    const action = formAction(page.html)!;
    const done = await b.go(new URL(action, idp.issuer).href, 'POST', { email, password });
    return done.url;
  };
  const me = async (b: Browser) => fetch(app + '/api/v1/auth/me', { headers: { cookie: `kb_session=${b.cookie(app, 'kb_session')}` } });
  const lastLogin = async () => (await ts.db.query(`select outcome, details from audit_events where action = 'auth.login' order by id desc limit 1`)).rows[0];

  beforeAll(async () => {
    const idpPort = await freePort();
    ts = await startServer({
      oidc: {
        issuer: `http://127.0.0.1:${idpPort}`,
        clientId: 'kb',
        clientSecret: secret,
        redirectUri: 'http://placeholder/api/v1/auth/oidc/callback',
        scopes: 'openid email profile groups',
        groupsClaim: 'groups',
        departmentClaim: 'department',
        allowInsecure: true,
      },
    });
    app = ts.url;
    const cfg = ts.srv.services.cfg;
    cfg.publicUrl = app;
    cfg.oidc!.redirectUri = app + '/api/v1/auth/oidc/callback';
    cfg.oidc!.postLogoutRedirectUri = app + '/';
    idp = await startIdp({
      port: idpPort,
      clients: [{ client_id: 'kb', client_secret: secret, redirect_uris: [cfg.oidc!.redirectUri], post_logout_redirect_uris: [app + '/'] }],
      accounts: [
        { sub: 'idp-ivanov', email: 'ivanov@corp.test', password: 'idp-pass-1', name: 'Иван Иванов', groups: ['Разработка', 'Несуществующая группа'], department: 'Отдел продаж' },
        { sub: 'idp-newbie', email: 'newbie@corp.test', password: 'idp-pass-2', name: 'Новый Сотрудник' },
        { sub: 'idp-unverified', email: 'unverified@corp.test', password: 'idp-pass-3', email_verified: false },
        { sub: 'idp-impostor', email: 'bound@corp.test', password: 'idp-pass-4' },
        { sub: 'idp-suspended', email: 'suspended@corp.test', password: 'idp-pass-5' },
      ],
    });
    org = await setupOrg(ts);
  });
  afterAll(async () => {
    await ts?.close();
    await idp?.close();
  });

  it('login: authorization code + PKCE (S256) + state + nonce; invited account matched by e-mail, activated and bound to the subject; groups and department mapped by name', async () => {
    const dev = (await org.owner.post('/api/v1/admin/groups', { name: 'Разработка', kind: 'group' })).group;
    const sales = (await org.owner.post('/api/v1/admin/groups', { name: 'Отдел продаж', kind: 'department' })).group;
    const manual = (await org.owner.post('/api/v1/admin/groups', { name: 'Ручная группа', kind: 'group' })).group;
    const created = await org.owner.post('/api/v1/admin/users', { email: 'Ivanov@corp.test', name: 'Иванов (приглашён)', kind: 'employee', groupIds: [manual.id], invite: true });
    expect(created.user.status).toBe('invited');

    const b = new Browser(app);
    const start = await b.request('GET', app + '/api/v1/auth/oidc/start');
    expect(start.status).toBe(302);
    const authz = new URL(start.headers.get('location')!);
    expect(authz.origin).toBe(idp.issuer);
    expect(authz.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authz.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(authz.searchParams.get('state')).toBeTruthy();
    expect(authz.searchParams.get('nonce')).toBeTruthy();
    expect(b.cookie(app, 'kb_oidc')).toBeTruthy();

    const landed = await login(b, 'ivanov@corp.test', 'idp-pass-1');
    expect(landed.href).toBe(app + '/');
    expect(b.cookie(app, 'kb_oidc')).toBeNull(); // single-use state cookie
    const r = await me(b);
    expect(r.status).toBe(200);
    const u = (await r.json()).user;
    expect(u.email).toBe('ivanov@corp.test');
    const row = (await ts.db.query('select status, external_id, primary_group_id from users where id = $1', [u.id])).rows[0];
    expect(row).toMatchObject({ status: 'active', external_id: 'idp-ivanov', primary_group_id: sales.id });
    const groups = (await ts.db.query('select group_id, source from group_members where user_id = $1 order by source', [u.id])).rows;
    expect(groups).toEqual(
      expect.arrayContaining([
        { group_id: manual.id, source: 'manual' },
        { group_id: dev.id, source: 'oidc' },
        { group_id: sales.id, source: 'oidc' },
      ]),
    );
    expect(groups).toHaveLength(3); // the unknown IdP group is ignored, never created
    expect(await lastLogin()).toMatchObject({ outcome: 'success', details: { method: 'oidc', sub: 'idp-ivanov' } });
    const sync = (await ts.db.query(`select details from audit_events where action = 'user.sso_sync' order by id desc limit 1`)).rows[0].details;
    expect(sync.added.sort()).toEqual(['Отдел продаж', 'Разработка']);

    // The IdP removes the group: the next login removes the SSO membership, the manual one stays.
    idp.accounts.get('idp-ivanov')!.groups = [];
    const b2 = new Browser(app);
    await login(b2, 'ivanov@corp.test', 'idp-pass-1');
    const after = (await ts.db.query('select group_id from group_members where user_id = $1', [u.id])).rows.map((x) => x.group_id).sort();
    expect(after).toEqual([manual.id, sales.id].sort());
  });

  it('unknown e-mail: refused without JIT provisioning (clear reason, audited); with the organisation setting the employee is created', async () => {
    const b = new Browser(app);
    const landed = await login(b, 'newbie@corp.test', 'idp-pass-2');
    expect(landed.searchParams.get('sso_error')).toBe('no_account');
    expect(b.cookie(app, 'kb_session')).toBeNull();
    expect(await lastLogin()).toMatchObject({ outcome: 'denied', details: { method: 'oidc', reason: 'no_account' } });

    await org.owner.patch('/api/v1/admin/settings', { oidcJitProvisioning: true });
    const b2 = new Browser(app);
    expect((await login(b2, 'newbie@corp.test', 'idp-pass-2')).href).toBe(app + '/');
    const m = await (await me(b2)).json();
    expect(m.user).toMatchObject({ email: 'newbie@corp.test', name: 'Новый Сотрудник', kind: 'employee' });
    expect(m.personalSpaceId).toBeTruthy();
    await org.owner.patch('/api/v1/admin/settings', { oidcJitProvisioning: false });
  });

  it('refuses unverified e-mail, an e-mail bound to another subject, and a suspended account', async () => {
    expect((await login(new Browser(app), 'unverified@corp.test', 'idp-pass-3')).searchParams.get('sso_error')).toBe('email_unverified');

    const bound = await org.owner.post('/api/v1/admin/users', { email: 'bound@corp.test', name: 'Связанный', kind: 'employee', invite: true });
    await ts.db.query(`update users set external_id = 'idp-original-person' where id = $1`, [bound.user.id]);
    expect((await login(new Browser(app), 'bound@corp.test', 'idp-pass-4')).searchParams.get('sso_error')).toBe('subject_mismatch');

    const sus = await org.owner.post('/api/v1/admin/users', { email: 'suspended@corp.test', name: 'Отключённый', kind: 'employee', invite: true });
    await ts.db.query(`update users set status = 'suspended' where id = $1`, [sus.user.id]);
    expect((await login(new Browser(app), 'suspended@corp.test', 'idp-pass-5')).searchParams.get('sso_error')).toBe('account_disabled');
  });

  it('state: a callback delivered to another browser, without the state cookie, or replayed is rejected', async () => {
    // The attacker completes a login at the IdP and sends the callback URL to the victim (login CSRF).
    const attacker = new Browser(app);
    const page = await attacker.go(app + '/api/v1/auth/oidc/start');
    const done = await attacker.request('POST', new URL(formAction(page.html)!, idp.issuer).href, { email: 'ivanov@corp.test', password: 'idp-pass-1' });
    let loc = new URL(done.headers.get('location')!, idp.issuer);
    while (loc.origin === idp.issuer) loc = new URL((await attacker.request('GET', loc.href)).headers.get('location')!, idp.issuer);
    expect(loc.pathname).toBe('/api/v1/auth/oidc/callback');
    expect(loc.searchParams.get('code')).toBeTruthy();

    const victim = new Browser(app);
    await victim.request('GET', app + '/api/v1/auth/oidc/start'); // victim has their own (different) state
    const v = await victim.go(loc.href);
    expect(v.url.searchParams.get('sso_error')).toBe('state_mismatch');
    expect(victim.cookie(app, 'kb_session')).toBeNull();

    const noCookie = await new Browser(app).go(loc.href);
    expect(noCookie.url.searchParams.get('sso_error')).toBe('state_mismatch');

    // The legitimate browser uses it once; a replay (cookie consumed, code spent) is refused.
    expect((await attacker.go(loc.href)).url.href).toBe(app + '/');
    expect((await attacker.go(loc.href)).url.searchParams.get('sso_error')).toBe('state_mismatch');
    expect(await lastLogin()).toMatchObject({ outcome: 'denied', details: { reason: 'state_mismatch' } });
  });

  it('PKCE: a wrong code_verifier is refused by the IdP — no session', async () => {
    const b = new Browser(app);
    const page = await b.go(app + '/api/v1/auth/oidc/start');
    const saved = JSON.parse(decodeURIComponent(b.cookie(app, 'kb_oidc')!));
    b.setCookie(app, 'kb_oidc', encodeURIComponent(JSON.stringify({ ...saved, verifier: 'x'.repeat(43) })), '/api/v1/auth/oidc');
    const done = await b.go(new URL(formAction(page.html)!, idp.issuer).href, 'POST', { email: 'ivanov@corp.test', password: 'idp-pass-1' });
    expect(done.url.searchParams.get('sso_error')).toBe('token_invalid');
    expect(b.cookie(app, 'kb_session')).toBeNull();
  });

  const forged: Array<[string, (p: Record<string, unknown>) => { payload: Record<string, unknown>; foreignKey?: boolean }]> = [
    ['expired', (p) => ({ payload: { ...p, iat: Math.floor(Date.now() / 1000) - 7200, exp: Math.floor(Date.now() / 1000) - 3600 } })],
    ['nonce mismatch', (p) => ({ payload: { ...p, nonce: 'attacker-nonce' } })],
    ['wrong audience', (p) => ({ payload: { ...p, aud: 'another-client' } })],
    ['wrong issuer', (p) => ({ payload: { ...p, iss: 'https://evil.example' } })],
    ['signed with a foreign key', (p) => ({ payload: p, foreignKey: true })],
    ['issued in the future', (p) => ({ payload: { ...p, iat: Math.floor(Date.now() / 1000) + 3600, exp: Math.floor(Date.now() / 1000) + 7200 } })],
  ];
  for (const [name, tamper] of forged) {
    it(`ID token ${name}: rejected, no session, audited`, async () => {
      idp.tamper = tamper;
      try {
        const b = new Browser(app);
        const landed = await login(b, 'ivanov@corp.test', 'idp-pass-1');
        expect(landed.searchParams.get('sso_error')).toBe('token_invalid');
        expect(b.cookie(app, 'kb_session')).toBeNull();
        expect(await lastLogin()).toMatchObject({ outcome: 'denied', details: { method: 'oidc', reason: 'token_invalid' } });
      } finally {
        idp.tamper = null;
      }
    });
  }

  it('the user cancels at the IdP (error=access_denied): back on the login page with the reason', async () => {
    const b = new Browser(app);
    const page = await b.go(app + '/api/v1/auth/oidc/start');
    const abort = /<form method="post" action="([^"]+\/abort)"/.exec(page.html)![1];
    const done = await b.go(new URL(abort, idp.issuer).href, 'POST', {});
    expect(done.url.searchParams.get('sso_error')).toBe('idp_error');
  });

  it('returnTo is kept for in-app paths and ignored for anything that could leave the site', async () => {
    expect((await login(new Browser(app), 'ivanov@corp.test', 'idp-pass-1', '/api/v1/auth/oidc/start?returnTo=' + encodeURIComponent('/p/123?x=1'))).href).toBe(app + '/p/123?x=1');
    for (const bad of ['//evil.example/x', 'https://evil.example', '/\\evil.example', 'javascript:alert(1)'])
      expect((await login(new Browser(app), 'ivanov@corp.test', 'idp-pass-1', '/api/v1/auth/oidc/start?returnTo=' + encodeURIComponent(bad))).href).toBe(app + '/');
  });

  it('logout: the app session is revoked and the browser is sent to the IdP end_session endpoint (id_token_hint) and back; the next login asks for credentials again', async () => {
    const b = new Browser(app);
    await login(b, 'ivanov@corp.test', 'idp-pass-1');
    const csrf = b.cookie(app, 'kb_csrf')!;
    const out = await fetch(app + '/api/v1/auth/logout', { method: 'POST', headers: { cookie: `kb_session=${b.cookie(app, 'kb_session')}; kb_csrf=${csrf}`, 'x-csrf-token': csrf, 'content-type': 'application/json' }, body: '{}' });
    expect(out.status).toBe(200);
    const { redirect } = await out.json();
    const end = new URL(redirect);
    expect(end.origin + end.pathname).toBe(idp.issuer + '/session/end');
    expect(end.searchParams.get('id_token_hint')).toMatch(/^ey/);
    expect(end.searchParams.get('post_logout_redirect_uri')).toBe(app + '/');
    expect((await me(b)).status).toBe(401);

    const before = idp.logouts;
    const confirm = await b.go(redirect);
    expect(confirm.html).toContain('Выйти из IdP');
    const form = /<form[^>]*id="op.logoutForm"[^>]*>/.exec(confirm.html)![0];
    const action = /action="([^"]+)"/.exec(form)![1];
    const xsrf = /name="xsrf" value="([^"]+)"/.exec(confirm.html)![1];
    const back = await b.go(new URL(action, idp.issuer).href, 'POST', { xsrf, logout: 'yes' });
    expect(back.url.href).toBe(app + '/');
    expect(idp.logouts).toBe(before + 1);
    // IdP session gone: the login form is shown again (no silent re-login).
    const again = await b.go(app + '/api/v1/auth/oidc/start');
    expect(again.html).toContain('Тестовый IdP — вход');
  });

  it('password sessions log out locally only (no IdP redirect)', async () => {
    const r = await org.owner.post('/api/v1/auth/logout');
    expect(r.redirect).toBeNull();
  });
});

describe('OIDC when the IdP is down (SEC-L3)', () => {
  it('the server starts and password login works; SSO reports "IdP unavailable" and recovers once the IdP is back', async () => {
    const idpPort = await freePort();
    const ts = await startServer({ oidc: { issuer: `http://127.0.0.1:${idpPort}`, clientId: 'kb', clientSecret: 'kb-test-client-secret-0123456789', redirectUri: 'http://placeholder/cb', allowInsecure: true } });
    let idp: TestIdp | null = null;
    try {
      const org = await setupOrg(ts);
      expect((await org.owner.get('/api/v1/setup/status')).sso).toBe(true);
      const r = await fetch(ts.url + '/api/v1/auth/oidc/start', { redirect: 'manual' });
      expect(r.status).toBe(302);
      expect(r.headers.get('location')).toBe('/?sso_error=idp_unavailable');
      const cfg = ts.srv.services.cfg;
      cfg.oidc!.redirectUri = ts.url + '/api/v1/auth/oidc/callback';
      idp = await startIdp({ port: idpPort, clients: [{ client_id: 'kb', client_secret: 'kb-test-client-secret-0123456789', redirect_uris: [cfg.oidc!.redirectUri] }], accounts: [] });
      const r2 = await fetch(ts.url + '/api/v1/auth/oidc/start', { redirect: 'manual' });
      expect(new URL(r2.headers.get('location')!).origin).toBe(idp.issuer);
    } finally {
      await ts.close();
      await idp?.close();
    }
  });
});
