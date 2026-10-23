// Baseline DAST against an in-process server on a fresh database (R-SECURITY-004, R-SECURITY-002).
// The same probes run black-box against a spawned server with `npm run security:dast`.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer, type TestServer } from '../support/harness.js';
import { Dast, summarize, type ProbeResult } from '../support/dast.js';

let ts: TestServer;
let limited: TestServer;
let web: string;
let dast: Dast;

beforeAll(async () => {
  // A minimal built client so that SPA, static asset and fallback responses are probed too.
  web = mkdtempSync(join(tmpdir(), 'kb-dast-web-'));
  mkdirSync(join(web, 'assets'));
  writeFileSync(join(web, 'index.html'), '<!doctype html><html><head><script type="module" src="/assets/app.js"></script></head><body><div id="root"></div></body></html>');
  writeFileSync(join(web, 'assets', 'app.js'), 'console.log(1)');
  ts = await startServer({ webDist: web, trustProxy: 1 }, { worker: true });
  dast = new Dast({ base: ts.url, proxyHops: 1 });
  await dast.setup();
}, 180_000);
afterAll(async () => {
  writeReport();
  await ts?.close();
  await limited?.close();
  rmSync(web, { recursive: true, force: true });
});

function writeReport() {
  if (!dast?.results.length) return;
  const dir = join(process.cwd(), 'test-results', 'security');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'dast-integration-report.json'), JSON.stringify(dast.report(), null, 2));
}

const clean = (r: ProbeResult) => {
  expect(r.findings, summarize({ ...dast.report(), probes: [r], findings: r.findings.map((f) => ({ probe: r.id, ...f })) })).toEqual([]);
  expect(r.checks).toBeGreaterThan(0);
};

describe('baseline DAST (R-SECURITY-004, R-SECURITY-002)', () => {
  it('R-SECURITY-004: route inventory comes from the OpenAPI description', async () => clean(await dast.inventory()));
  it('R-SECURITY-002 R-SECURITY-004: every non-public route requires authentication', async () => clean(await dast.authRequired()), 120_000);
  it('R-SECURITY-002 R-SECURITY-004: CSRF token is enforced on every mutating route', async () => clean(await dast.csrf()), 120_000);
  it('R-SECURITY-002 R-SECURITY-004: CSP, nosniff, HSTS, referrer policy and no-store on API, SPA, static, attachment and export responses', async () => clean(await dast.headers()));
  it('R-SECURITY-002 R-SECURITY-004: session cookie flags, no session fixation, logout invalidates, no user enumeration', async () => clean(await dast.cookies()));
  it('R-SECURITY-002 R-SECURITY-004: IDOR — another user gets 404 for private pages, attachments, comments, revisions, uploads', async () => clean(await dast.idor()), 120_000);
  it('R-SECURITY-002 R-SECURITY-004: XSS payloads in titles, comments, file names and imports are inert in exports and public pages', async () => clean(await dast.xss()), 120_000);
  it('R-SECURITY-002 R-SECURITY-004 R-SECURITY-008: SSRF — image by URL and import never reach loopback/private/metadata addresses', async () => clean(await dast.ssrf()), 120_000);
  it('R-SECURITY-002 R-SECURITY-004: no open redirects', async () => clean(await dast.openRedirect()));
  it('R-SECURITY-002 R-SECURITY-004: path traversal on static, attachment, tile, signed-file and public-file routes', async () => clean(await dast.pathTraversal()));
  it('R-SECURITY-002 R-SECURITY-004: malformed input → 4xx without stack traces or SQL; prototype pollution refused', async () => clean(await dast.errors()), 120_000);
  it('R-SECURITY-002 R-SECURITY-004: no CORS read access for foreign origins', async () => clean(await dast.cors()));
  it('R-SECURITY-002 R-SECURITY-004: WebSockets refuse foreign origins and anonymous clients', async () => clean(await dast.websocketOrigin()));

  it('R-SECURITY-002 R-SECURITY-004: login and API rate limits hold behind one proxy hop, X-Forwarded-For spoofing does not bypass them', async () => {
    limited = await startServer({ trustProxy: 1, authRateLimitPerMinute: 8, rateLimitPerMinute: 60 });
    const d = new Dast({ base: limited.url, proxyHops: 1, limits: { authPerMinute: 8, apiPerMinute: 60 } });
    await d.setup();
    const r = await d.rateLimits();
    dast.results.push(r);
    clean(r);
  }, 120_000);

  it('R-SECURITY-002: with COOKIE_SECURE (the production default) session and CSRF cookies carry Secure', async () => {
    const { loadConfig } = await import('../../apps/server/src/config.js');
    const saved = { ...process.env };
    Object.assign(process.env, { NODE_ENV: 'production', SECRET_KEY: 'k'.repeat(64), DATABASE_URL: 'postgres://x/y' });
    delete process.env.COOKIE_SECURE;
    try {
      expect(loadConfig().cookieSecure).toBe(true);
    } finally {
      for (const k of ['NODE_ENV', 'SECRET_KEY', 'DATABASE_URL', 'COOKIE_SECURE']) if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    const sec = await startServer({ cookieSecure: true });
    try {
      const d = new Dast({ base: sec.url, expectSecureCookies: true });
      await d.setup();
      clean(await d.cookies());
    } finally {
      await sec.close();
    }
  });

  it('R-SECURITY-002: with the default TRUST_PROXY (unset) X-Forwarded-For is ignored — the audit IP is the socket address', async () => {
    const { parseTrustProxy } = await import('../../apps/server/src/config.js');
    expect([parseTrustProxy(undefined), parseTrustProxy(''), parseTrustProxy('false'), parseTrustProxy('1'), parseTrustProxy('10.0.0.0/8, loopback')]).toEqual([false, false, false, 1, '10.0.0.0/8, loopback']);
    const plain = await startServer({ trustProxy: false });
    try {
      const r = await fetch(plain.url + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '6.6.6.6' }, body: JSON.stringify({ email: 'nobody@x.test', password: 'x' }) });
      expect(r.status).toBe(401);
      const ip = (await plain.db.query(`select ip from audit_events where action = 'auth.login' order by id desc limit 1`)).rows[0]?.ip;
      expect(String(ip)).not.toContain('6.6.6.6');
    } finally {
      await plain.close();
    }
  });
});
