#!/usr/bin/env node
// Load test: N readers + M editors over REST and the collaborative WebSocket channel, on seeded pages.
//
//   node --import tsx --conditions=development scripts/load/collab-load.mjs --readers 100 --editors 20 --pages 5 --duration 120
//
// By default a fresh, isolated server is started (tests/e2e/server.mjs: new database, empty object store, background
// worker). With --url the test runs against an existing instance using one account (--email/--password) for all clients.
//
// Measured (p50/p95/p99/max, count, errors):
//   rest.page / rest.content / rest.search / rest.tree — reader requests (think time 0.5–1.5 s)
//   collab.ack      — editor change → durable server acknowledgement (provider has no pending operations)
//   collab.remote   — editor change → visible in a reader's replica of the same page (fan-out latency)
//   collab.connect  — WebSocket connect → first sync
// Integrity: after the run every acknowledged editor change must be present exactly once in the server copy
// (REST /content) — "0 lost confirmed changes". The report is printed and written to test-results/load/*.json.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as Y from 'yjs';
import WebSocket from 'ws';
import { CollabProvider } from '@kb/shared';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []),
);
const READERS = Number(args.readers ?? 100);
const EDITORS = Number(args.editors ?? 20);
const PAGES = Number(args.pages ?? 5);
const DURATION = Number(args.duration ?? 60) * 1000;
const BLOCKS = Number(args.blocks ?? 200);
const EDIT_EVERY = Number(args['edit-every'] ?? 1000);
const PORT = Number(args.port ?? 8190);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (a, b) => a + Math.random() * (b - a);

// ---------------------------------------------------------------- metrics
const metrics = new Map();
function record(name, ms) {
  if (!metrics.has(name)) metrics.set(name, { samples: [], errors: 0 });
  metrics.get(name).samples.push(ms);
}
function fail(name, err) {
  if (!metrics.has(name)) metrics.set(name, { samples: [], errors: 0 });
  const m = metrics.get(name);
  m.errors++;
  if (m.errors <= 3) console.error(`[${name}] ${err?.message ?? err}`);
}
function pct(sorted, p) {
  if (!sorted.length) return null;
  return Math.round(sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))] * 10) / 10;
}
function summary() {
  const out = {};
  for (const [k, m] of [...metrics].sort()) {
    const s = [...m.samples].sort((a, b) => a - b);
    out[k] = { n: s.length, errors: m.errors, p50: pct(s, 50), p95: pct(s, 95), p99: pct(s, 99), max: s.length ? Math.round(s[s.length - 1]) : null };
  }
  return out;
}

// ---------------------------------------------------------------- HTTP client with cookie jar
class Api {
  constructor(base) {
    this.base = base;
    this.cookies = new Map();
    this.csrf = null;
  }
  cookieHeader() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  async req(method, path, body) {
    const h = {};
    if (this.cookies.size) h.cookie = this.cookieHeader();
    if (this.csrf && method !== 'GET') h['x-csrf-token'] = this.csrf;
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      h['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetch(this.base + path, { method, headers: h, body: payload, redirect: 'manual' });
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(';');
      const i = kv.indexOf('=');
      this.cookies.set(kv.slice(0, i), kv.slice(i + 1));
    }
    const text = await res.text();
    let data = text;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      /* not json */
    }
    if (!res.ok) throw new Error(`${method} ${path}: HTTP ${res.status} ${text.slice(0, 200)}`);
    return data;
  }
  get = (p) => this.req('GET', p);
  post = (p, b) => this.req('POST', p, b ?? {});
  async login(email, password) {
    const r = await this.post('/api/v1/auth/login', { email, password });
    this.csrf = r.csrfToken ?? decodeURIComponent(this.cookies.get('kb_csrf') ?? '');
    return r;
  }
}

// ---------------------------------------------------------------- server
async function startServer() {
  const web = mkdtempSync(join(tmpdir(), 'kb-load-web-'));
  writeFileSync(join(web, 'index.html'), '<!doctype html><title>kb</title>');
  const env = { ...process.env, E2E_PORT: String(PORT), E2E_DB: args.db ?? 'kb_load', E2E_DATA: resolve(args.data ?? '.load-data'), E2E_WEB: web, LOG_LEVEL: 'error' };
  const child = spawn(process.execPath, ['--import', 'tsx', '--conditions=development', 'tests/e2e/server.mjs'], { env, stdio: ['ignore', 'inherit', 'inherit'] });
  const url = `http://127.0.0.1:${PORT}`;
  for (let i = 0; i < 240; i++) {
    try {
      if ((await fetch(url + '/healthz')).ok) return { url, child };
    } catch {
      /* not yet */
    }
    await sleep(500);
  }
  child.kill();
  throw new Error('server did not start');
}

// ---------------------------------------------------------------- collaborative client
function openClient(baseUrl, api, pageId, { onUpdate } = {}) {
  const doc = new Y.Doc();
  let synced = false;
  const t0 = performance.now();
  const provider = new CollabProvider({
    url: baseUrl.replace('http', 'ws') + '/api/v1/collab/' + pageId,
    doc,
    WebSocketImpl: WebSocket,
    wsOptions: { headers: { cookie: api.cookieHeader() } },
    batchMs: 20,
    backoff: { minMs: 200, maxMs: 2000 },
    onSynced: () => {
      if (!synced) record('collab.connect', performance.now() - t0);
      synced = true;
    },
    onFatal: (code) => fail('collab.fatal', new Error(code)),
  });
  // remote insertions only (cheap: the inserted strings of each text change, not the whole document)
  if (onUpdate)
    doc.getXmlFragment('default').observeDeep((events) => {
      for (const e of events) for (const d of e.changes?.delta ?? []) if (typeof d.insert === 'string') onUpdate(d.insert);
    });
  const ready = provider.connect().then(async () => {
    const start = Date.now();
    while (!provider.synced) {
      if (Date.now() - start > 30_000) throw new Error('sync timeout');
      await sleep(20);
    }
  });
  return { doc, provider, ready, frag: () => doc.getXmlFragment('default') };
}

function appendParagraph(frag, text) {
  const p = new Y.XmlElement('paragraph');
  p.setAttribute('id', globalThis.crypto.randomUUID());
  const x = new Y.XmlText();
  x.insert(0, text);
  p.insert(0, [x]);
  frag.push([p]);
  return p;
}

// ---------------------------------------------------------------- scenario
async function main() {
  const own = args.url ? null : await startServer();
  const base = args.url ?? own.url;
  const stopServer = () => own?.child.kill('SIGTERM');
  process.on('SIGINT', () => (stopServer(), process.exit(130)));
  try {
    const owner = new Api(base);
    if (args.url) await owner.login(args.email, args.password);
    else {
      const r = await owner.post('/api/v1/setup', { orgName: 'Нагрузочный тест', ownerEmail: 'owner@load.test', ownerName: 'Владелец', password: 'Owner-password-1' });
      owner.csrf = r.csrfToken;
    }
    const spaces = await owner.get('/api/v1/spaces');
    const space = (spaces.spaces.find((s) => s.kind === 'org') ?? spaces.spaces[0]).id;

    // seed pages: BLOCKS paragraphs each, written through the collaborative channel (as the editor does)
    console.log(`seeding ${PAGES} pages × ${BLOCKS} blocks…`);
    const pages = [];
    for (let i = 0; i < PAGES; i++) {
      const r = await owner.post('/api/v1/pages', { spaceId: space, parentId: null, title: `Нагрузка ${i + 1}`, requestId: crypto.randomUUID() });
      const c = openClient(base, owner, r.page.id);
      await c.ready;
      c.doc.transact(() => {
        for (let b = 0; b < BLOCKS; b++) appendParagraph(c.frag(), `Абзац ${b}: складской учёт, приёмка и размещение товара — страница ${i + 1}.`);
      });
      c.provider.flush();
      while (c.provider.pendingCount()) await sleep(20);
      c.provider.destroy();
      pages.push(r.page.id);
    }

    // accounts: one per editor/reader on the self-started server (distinct sessions, ACL checks per user)
    async function account(name) {
      if (args.url) return owner;
      const email = `${name}-${Math.random().toString(36).slice(2, 8)}@load.test`;
      const created = await owner.post('/api/v1/admin/users', { email, name, kind: 'employee', invite: false });
      await owner.post('/api/v1/__test/set-password', { userId: created.user.id, password: 'User-password-1' });
      for (const pageId of pages) await owner.req('PUT', '/api/v1/grants', { resourceType: 'page', resourceId: pageId, subjectType: 'user', subjectId: created.user.id, level: name.startsWith('editor') ? 'edit' : 'view' });
      const a = new Api(base);
      await a.login(email, 'User-password-1');
      return a;
    }
    console.log(`creating ${EDITORS} editors and ${READERS} readers…`);
    const editorApis = [];
    for (let i = 0; i < EDITORS; i++) editorApis.push(await account(`editor${i}`));
    const readerApis = [];
    for (let i = 0; i < READERS; i++) readerApis.push(await account(`reader${i}`));

    const until = Date.now() + DURATION;
    const acked = []; // { pageId, marker }
    const sentAt = new Map(); // marker -> wall time of the local change
    const seenRemote = new Set();

    // readers: REST browsing + a live replica of one page each (receives every edit of that page)
    const readerClients = [];
    const readerLoops = readerApis.map(async (api, i) => {
      const pageId = pages[i % pages.length];
      const c = openClient(base, api, pageId, {
        onUpdate: (text) => {
          // fan-out latency: markers "⟦m:<id>⟧" carry the send time on the editor side
          for (const m of text.matchAll(/⟦m:([\w-]+)⟧/g)) {
            const key = i + '|' + m[1]; // every reader: fan-out latency to all replicas
            if (seenRemote.has(key)) continue;
            seenRemote.add(key);
            const t = sentAt.get(m[1]);
            if (t) record('collab.remote', Date.now() - t);
          }
        },
      });
      readerClients.push(c);
      try {
        await c.ready;
      } catch (e) {
        fail('collab.connect', e);
      }
      let n = 0;
      while (Date.now() < until) {
        const op = n++ % 6;
        const [name, path] =
          op === 0 ? ['rest.page', `/api/v1/pages/${pageId}`] : op === 1 ? ['rest.content', `/api/v1/pages/${pageId}/content`] : op === 2 ? ['rest.search', `/api/v1/search?q=${encodeURIComponent('приёмка')}`] : op === 3 ? ['rest.tree', `/api/v1/spaces/${space}/tree`] : ['rest.page', `/api/v1/pages/${pages[(i + n) % pages.length]}`];
        const t0 = performance.now();
        try {
          await api.get(path);
          record(name, performance.now() - t0);
        } catch (e) {
          fail(name, e);
        }
        await sleep(jitter(500, 1500));
      }
    });

    // editors: each owns a paragraph on one page and appends a marked fragment every EDIT_EVERY ms
    const editorLoops = editorApis.map(async (api, i) => {
      const pageId = pages[i % pages.length];
      const c = openClient(base, api, pageId);
      try {
        await c.ready;
      } catch (e) {
        fail('collab.connect', e);
        return;
      }
      const para = appendParagraph(c.frag(), `Редактор ${i}: `);
      let seq = 0;
      await sleep(jitter(0, EDIT_EVERY));
      while (Date.now() < until) {
        const marker = `e${i}-${seq++}`;
        const t0 = performance.now();
        sentAt.set(marker, Date.now());
        const x = para.get(0);
        x.insert(x.length, `⟦m:${marker}⟧ `);
        c.provider.flush();
        const start = Date.now();
        while (c.provider.pendingCount() && Date.now() - start < 30_000) await sleep(5);
        if (c.provider.pendingCount()) fail('collab.ack', new Error('not acknowledged within 30 s: ' + marker));
        else {
          record('collab.ack', performance.now() - t0);
          acked.push({ pageId, marker });
        }
        await sleep(jitter(EDIT_EVERY * 0.5, EDIT_EVERY * 1.5));
      }
      c.provider.destroy();
    });

    console.log(`running ${DURATION / 1000} s…`);
    const t0 = Date.now();
    const progress = setInterval(() => console.log(`  ${Math.round((Date.now() - t0) / 1000)} s: ${acked.length} acknowledged edits, ${metrics.get('rest.page')?.samples.length ?? 0} page reads`), 15_000);
    await Promise.all([...editorLoops, ...readerLoops]);
    clearInterval(progress);
    for (const c of readerClients) c.provider.destroy();

    // integrity: every acknowledged change is in the server copy exactly once
    let lost = 0;
    let duplicated = 0;
    for (const pageId of pages) {
      const r = await owner.get(`/api/v1/pages/${pageId}/content`);
      const text = JSON.stringify(r.content);
      for (const a of acked.filter((x) => x.pageId === pageId)) {
        const count = text.split(`⟦m:${a.marker}⟧`).length - 1;
        if (count === 0) lost++;
        if (count > 1) duplicated++;
      }
    }
    const report = {
      at: new Date().toISOString(),
      config: { readers: READERS, editors: EDITORS, pages: PAGES, blocksPerPage: BLOCKS, durationS: DURATION / 1000, editEveryMs: EDIT_EVERY, target: args.url ?? 'self-started server (tests/e2e/server.mjs)', node: process.version },
      metrics: summary(),
      integrity: { acknowledged: acked.length, lost, duplicated },
    };
    mkdirSync('test-results/load', { recursive: true });
    const file = `test-results/load/collab-load-${report.at.replace(/[:.]/g, '-')}.json`;
    writeFileSync(file, JSON.stringify(report, null, 2));
    console.log('\n| metric | n | errors | p50 ms | p95 ms | p99 ms | max ms |\n|---|---|---|---|---|---|---|');
    for (const [k, m] of Object.entries(report.metrics)) console.log(`| ${k} | ${m.n} | ${m.errors} | ${m.p50} | ${m.p95} | ${m.p99} | ${m.max} |`);
    console.log(`\nacknowledged edits: ${acked.length}, lost: ${lost}, duplicated: ${duplicated}\nreport: ${file}`);
    process.exitCode = lost || duplicated ? 1 : 0;
  } finally {
    stopServer();
  }
}

main()
  .then(() => setTimeout(() => process.exit(process.exitCode ?? 0), 500)) // providers' reconnect timers must not keep the process alive
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
