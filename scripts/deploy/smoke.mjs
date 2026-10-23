#!/usr/bin/env node
// Post-deploy smoke tests (R-OPS-022): read-only checks of a running installation; nothing is created or changed.
//
//   KB_URL=https://kb.example.corp node scripts/deploy/smoke.mjs
//   optional: SMOKE_EMAIL + SMOKE_PASSWORD (or SMOKE_PASSWORD_FILE) — a dedicated low-privilege account;
//             SMOKE_PAGE_ID — a page that account can view (live collaboration channel is opened read-only).
//
// Checks: liveness, readiness (db/storage/migrations), the web application shell with security headers, the API
// refuses anonymous access, sign-in, spaces list, page content, collaboration WebSocket reaches SYNC, sign-out.
// Prints one JSON line per check and a summary; exit code 1 when any check fails. Secrets are never printed.
import { readFileSync } from 'node:fs';

const base = (process.env.KB_URL ?? process.argv[2] ?? '').replace(/\/$/, '');
if (!base) {
  console.error('usage: KB_URL=https://kb.example.corp node scripts/deploy/smoke.mjs');
  process.exit(1);
}
const secret = (name) => (process.env[`${name}_FILE`] ? readFileSync(process.env[`${name}_FILE`], 'utf8').replace(/\r?\n$/, '') : process.env[name]);
const email = process.env.SMOKE_EMAIL;
const password = secret('SMOKE_PASSWORD');
const pageId = process.env.SMOKE_PAGE_ID;
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 15_000);

const results = [];
const cookies = new Map();
let csrf = null;

async function http(method, path, body) {
  const headers = { accept: 'application/json, text/html' };
  if (cookies.size) headers.cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  if (csrf && method !== 'GET') headers['x-csrf-token'] = csrf;
  if (body) headers['content-type'] = 'application/json';
  const r = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
  for (const c of r.headers.getSetCookie?.() ?? []) {
    const [kv] = c.split(';');
    const i = kv.indexOf('=');
    cookies.set(kv.slice(0, i), kv.slice(i + 1));
  }
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* html */
  }
  return { status: r.status, headers: r.headers, text, json };
}

async function check(name, fn) {
  const t0 = performance.now();
  try {
    const detail = await fn();
    results.push({ check: name, ok: true, ms: Math.round(performance.now() - t0), ...(detail ? { detail } : {}) });
  } catch (e) {
    results.push({ check: name, ok: false, ms: Math.round(performance.now() - t0), error: String(e?.message ?? e).slice(0, 300) });
  }
  console.log(JSON.stringify(results.at(-1)));
}
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

await check('healthz', async () => {
  const r = await http('GET', '/healthz');
  expect(r.status === 200 && r.json?.status === 'ok', `HTTP ${r.status} ${r.text.slice(0, 100)}`);
});
await check('readyz', async () => {
  const r = await http('GET', '/readyz');
  expect(r.status === 200, `HTTP ${r.status} ${JSON.stringify(r.json?.checks ?? r.text.slice(0, 200))}`);
  return r.json?.checks;
});
await check('web shell', async () => {
  const r = await http('GET', '/');
  expect(r.status === 200, `HTTP ${r.status}`);
  expect(/<!doctype html/i.test(r.text), 'not an HTML page');
  expect(r.headers.get('content-security-policy'), 'Content-Security-Policy header missing');
  expect(r.headers.get('x-content-type-options') === 'nosniff', 'X-Content-Type-Options missing');
});
await check('api refuses anonymous access', async () => {
  const r = await http('GET', '/api/v1/auth/me');
  expect(r.status === 401, `expected 401, got ${r.status}`);
});

if (email && password) {
  await check('sign in', async () => {
    const r = await http('POST', '/api/v1/auth/login', { email, password });
    expect(r.status === 200, `HTTP ${r.status}`);
    csrf = r.json?.csrfToken ?? decodeURIComponent(cookies.get('kb_csrf') ?? '');
  });
  await check('spaces', async () => {
    const r = await http('GET', '/api/v1/spaces');
    expect(r.status === 200 && Array.isArray(r.json?.spaces), `HTTP ${r.status}`);
    return { spaces: r.json.spaces.length };
  });
  if (pageId) {
    await check('page content', async () => {
      const r = await http('GET', `/api/v1/pages/${pageId}/content`);
      expect(r.status === 200 && r.json?.content, `HTTP ${r.status}`);
    });
    await check('collaboration channel (read-only sync)', async () => {
      const [{ default: WebSocket }, Y, { CollabProvider }] = await Promise.all([import('ws'), import('yjs'), import('@kb/shared')]);
      const doc = new Y.Doc();
      const provider = new CollabProvider({ url: base.replace(/^http/, 'ws') + '/api/v1/collab/' + pageId, doc, WebSocketImpl: WebSocket, wsOptions: { headers: { cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; '), origin: base } }, backoff: { minMs: 500, maxMs: 2000 } });
      try {
        await provider.connect();
        const t0 = Date.now();
        while (!provider.synced && Date.now() - t0 < timeoutMs) await new Promise((r) => setTimeout(r, 50));
        expect(provider.synced, 'no SYNC within ' + timeoutMs + ' ms');
        return { transport: provider.transport };
      } finally {
        provider.destroy();
      }
    });
  }
  await check('sign out', async () => {
    const r = await http('POST', '/api/v1/auth/logout', {});
    expect(r.status < 400, `HTTP ${r.status}`);
  });
}

const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify({ smoke: base, checks: results.length, failed: failed.length, totalMs: results.reduce((s, r) => s + r.ms, 0) }));
setTimeout(() => process.exit(failed.length ? 1 : 0), 50);
