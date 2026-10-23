#!/usr/bin/env node
// Soak test (QA26-25, R-QA-038): a small, steady population of editors and readers works for hours against one
// server while the script tracks resource leaks and checks data integrity periodically.
//
//   node --import tsx --conditions=development scripts/load/soak.mjs --duration 7200 --editors 6 --readers 10
//
// By default a fresh, isolated server is started (tests/e2e/server.mjs: new database --db, data dir --data, port
// --port). With --url the test runs against an existing instance using one account (--email/--password); add
// --metrics-token when /metrics is protected and --db-url (read-only role is enough) to count database sessions.
//
// Workload (deliberately low intensity, it must run next to other work):
//   editors  — each owns a paragraph and appends a marker "⟦m:<id>⟧ " every --edit-every ms (jittered); when the
//              paragraph holds more than --keep markers the oldest one is deleted again, so documents stay bounded
//              and memory growth is attributable to leaks, not to content. Every --churn-every s an editor either
//              reconnects (network blip) or closes the "tab" and opens the page again in a fresh replica.
//   readers  — a live replica of one page each (rotated every --churn-every s) plus REST reads (page, content,
//              search, tree) with 2–5 s think time.
//   tree     — every 60 s a page is created and moved to the trash (tree events, outbox, search indexing).
//
// Every --sample-every s: server RSS, V8 heap, open file descriptors, event-loop lag p99, collaboration
// connections/documents, DB pool (kb_db_pool_connections) — from /metrics; database sessions of the instance's
// database from pg_stat_activity; /proc/<pid> of the self-started server (RSS, FDs, threads) as a cross-check.
// Every --check-every s, integrity: each acknowledged insertion is present exactly once in the server copy and each
// acknowledged deletion is absent (0 lost / 0 duplicated / 0 resurrected), and each reader replica has every marker
// acknowledged more than 15 s earlier. At the end: quiesce, exact comparison of every replica with the server copy,
// linear-regression slopes after warm-up (RSS/heap MB per hour, FDs/connections per hour) and a leak verdict.
// Reports: test-results/soak/soak-<time>.json (rewritten after every check, so a killed run keeps its data) and .md.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, mkdtempSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import pg from 'pg';
import * as Y from 'yjs';
import WebSocket from 'ws';
import { CollabProvider } from '@kb/shared';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []),
);
const num = (k, d) => Number(args[k] ?? d);
const EDITORS = num('editors', 6);
const READERS = num('readers', 10);
const PAGES = num('pages', 3);
const DURATION = num('duration', 7200) * 1000;
const EDIT_EVERY = num('edit-every', 2000);
const KEEP = num('keep', 60);
const CHURN_EVERY = num('churn-every', 600) * 1000;
const SAMPLE_EVERY = num('sample-every', 30) * 1000;
const CHECK_EVERY = num('check-every', 300) * 1000;
const WARMUP = num('warmup', Math.min(900, DURATION / 1000 / 6)) * 1000;
const PORT = num('port', 4492);
const DB = args.db ?? 'kb_ops_soak';
const ADMIN_URL = process.env.TEST_ADMIN_DATABASE_URL ?? 'postgres://kb:kb@localhost:5432/postgres';
// Leak thresholds (after warm-up, bounded content): see docs/PERFORMANCE.md «Soak».
const LIMITS = { rssMbPerHour: num('max-rss-slope', 15), heapMbPerHour: num('max-heap-slope', 10), fdGrowth: num('max-fd-growth', 20), dbSessionGrowth: num('max-db-growth', 5) };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (a, b) => a + Math.random() * (b - a);
const started = Date.now();
const elapsedS = () => Math.round((Date.now() - started) / 1000);
const log = (m) => console.log(`[soak ${new Date().toISOString().slice(11, 19)} +${elapsedS()}s] ${m}`);

// ---------------------------------------------------------------- latency metrics (overall + per check window)
const metrics = new Map();
let window = new Map();
function record(name, ms) {
  for (const m of [metrics, window]) {
    if (!m.has(name)) m.set(name, { samples: [], errors: 0 });
    m.get(name).samples.push(ms);
  }
}
const errorLog = [];
function fail(name, err) {
  for (const m of [metrics, window]) {
    if (!m.has(name)) m.set(name, { samples: [], errors: 0 });
    m.get(name).errors++;
  }
  if (errorLog.length < 200) errorLog.push({ t: elapsedS(), name, error: String(err?.message ?? err).slice(0, 300) });
  if (errorLog.length <= 20) console.error(`[${name}] ${err?.message ?? err}`);
}
const pct = (s, p) => (s.length ? Math.round(s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))] * 10) / 10 : null);
function summarise(map) {
  const out = {};
  for (const [k, m] of [...map].sort()) {
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
    if (body !== undefined) {
      h['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetch(this.base + path, { method, headers: h, body: payload, redirect: 'manual', signal: AbortSignal.timeout(30_000) });
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

// ---------------------------------------------------------------- server (self-started) and resource sampling
async function startServer() {
  const web = mkdtempSync(join(tmpdir(), 'kb-soak-web-'));
  writeFileSync(join(web, 'index.html'), '<!doctype html><title>kb</title>');
  const env = { ...process.env, E2E_PORT: String(PORT), E2E_DB: DB, E2E_DATA: resolve(args.data ?? '.soak-data-ops'), E2E_WEB: web, LOG_LEVEL: 'error', DB_POOL_SIZE: String(num('pool', 10)) };
  const child = spawn(process.execPath, ['--import', 'tsx', '--conditions=development', 'tests/e2e/server.mjs'], { env, stdio: ['ignore', 'inherit', 'inherit'] });
  const url = `http://127.0.0.1:${PORT}`;
  for (let i = 0; i < 240; i++) {
    if (child.exitCode !== null) throw new Error('server exited during startup');
    try {
      if ((await fetch(url + '/readyz')).ok) return { url, child };
    } catch {
      /* not yet */
    }
    await sleep(500);
  }
  child.kill();
  throw new Error('server did not start');
}

function procStats(pid) {
  if (!pid || !existsSync(`/proc/${pid}/status`)) return null;
  try {
    const st = readFileSync(`/proc/${pid}/status`, 'utf8');
    const kb = (k) => Number(new RegExp(`^${k}:\\s+(\\d+)`, 'm').exec(st)?.[1] ?? NaN);
    return { rssMb: Math.round((kb('VmRSS') / 1024) * 10) / 10, threads: kb('Threads'), fds: readdirSync(`/proc/${pid}/fd`).length };
  } catch {
    return null;
  }
}

function parseProm(text) {
  const out = {};
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const m = /^([a-zA-Z_:][\w:]*(?:\{[^}]*\})?)\s+([-+\deE.]+|NaN)/.exec(line);
    if (m) out[m[1]] = Number(m[2]);
  }
  return out;
}

// ---------------------------------------------------------------- collaborative client
function openClient(baseUrl, api, pageId) {
  const doc = new Y.Doc();
  let firstSync = true;
  const t0 = performance.now();
  const provider = new CollabProvider({
    url: baseUrl.replace('http', 'ws') + '/api/v1/collab/' + pageId,
    doc,
    WebSocketImpl: WebSocket,
    wsOptions: { headers: { cookie: api.cookieHeader() } },
    batchMs: 20,
    backoff: { minMs: 200, maxMs: 3000 },
    onSynced: () => {
      if (firstSync) record('collab.connect', performance.now() - t0);
      firstSync = false;
    },
    onFatal: (code) => fail('collab.fatal', new Error(code)),
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

const paragraphText = (el) => (el.get(0) instanceof Y.XmlText ? el.get(0).toString() : '');
function findParagraph(frag, id) {
  return frag.toArray().find((el) => el instanceof Y.XmlElement && el.getAttribute('id') === id) ?? null;
}
function replicaText(c) {
  return c
    .frag()
    .toArray()
    .map((el) => (el instanceof Y.XmlElement ? paragraphText(el) : ''))
    .join('\n');
}
async function waitAcked(provider, ms = 30_000) {
  const start = Date.now();
  provider.flush();
  while (provider.pendingCount() && Date.now() - start < ms) await sleep(10);
  return provider.pendingCount() === 0;
}

// ---------------------------------------------------------------- scenario
const markers = new Map(); // marker -> { pageId, state: 'sent'|'acked'|'deleting'|'deleted', ackedAt }
const report = {
  kind: 'kb-soak/1',
  at: new Date().toISOString(),
  config: { editors: EDITORS, readers: READERS, pages: PAGES, durationS: DURATION / 1000, editEveryMs: EDIT_EVERY, keepMarkers: KEEP, churnEveryS: CHURN_EVERY / 1000, sampleEveryS: SAMPLE_EVERY / 1000, checkEveryS: CHECK_EVERY / 1000, warmupS: WARMUP / 1000, target: args.url ?? `self-started server on port ${PORT}, database ${DB}`, node: process.version, limits: LIMITS },
  samples: [],
  checks: [],
  churn: { reconnects: 0, reopens: 0, readerRotations: 0, treePages: 0 },
  errors: errorLog,
};
let reportFile = null;
function writeReport() {
  mkdirSync('test-results/soak', { recursive: true });
  reportFile ??= `test-results/soak/soak-${report.at.replace(/[:.]/g, '-')}.json`;
  report.metrics = summarise(metrics);
  writeFileSync(reportFile, JSON.stringify(report, null, 2));
}

/** Least-squares slope of y over x (per unit of x) and the fit's start/end values. */
function slope(points) {
  const n = points.length;
  if (n < 3) return null;
  const mx = points.reduce((s, p) => s + p[0], 0) / n;
  const my = points.reduce((s, p) => s + p[1], 0) / n;
  let num_ = 0;
  let den = 0;
  for (const [x, y] of points) {
    num_ += (x - mx) * (y - my);
    den += (x - mx) ** 2;
  }
  return den ? num_ / den : null;
}

async function main() {
  const own = args.url ? null : await startServer();
  const base = args.url ?? own.url;
  const serverPid = own?.child.pid ?? (args.pid ? Number(args.pid) : null);
  const stopServer = () => own?.child.kill('SIGTERM');
  let stopping = false;
  process.on('SIGINT', () => {
    if (stopping) process.exit(130);
    stopping = true;
    log('SIGINT: finishing early (quiesce + final check)');
  });
  const dbUrl = args['db-url'] ?? (args.url ? null : ADMIN_URL.replace(/\/[^/]*$/, '/' + DB));
  const pgc = dbUrl ? new pg.Pool({ connectionString: dbUrl, max: 1 }) : null;
  const dbName = dbUrl ? new URL(dbUrl).pathname.slice(1) : null;
  try {
    const owner = new Api(base);
    if (args.url) await owner.login(args.email, args.password);
    else {
      const r = await owner.post('/api/v1/setup', { orgName: 'Soak', ownerEmail: 'owner@soak.test', ownerName: 'Владелец', password: 'Owner-password-1' });
      owner.csrf = r.csrfToken;
    }
    const spaces = await owner.get('/api/v1/spaces');
    const space = (spaces.spaces.find((s) => s.kind === 'org') ?? spaces.spaces[0]).id;
    const pages = [];
    for (let i = 0; i < PAGES; i++) pages.push((await owner.post('/api/v1/pages', { spaceId: space, parentId: null, title: `Soak ${i + 1}`, requestId: crypto.randomUUID() })).page.id);

    async function account(name, level) {
      if (args.url) return owner;
      const email = `${name}@soak.test`;
      const created = await owner.post('/api/v1/admin/users', { email, name, kind: 'employee', invite: false });
      await owner.post('/api/v1/__test/set-password', { userId: created.user.id, password: 'User-password-1' });
      for (const pageId of pages) await owner.req('PUT', '/api/v1/grants', { resourceType: 'page', resourceId: pageId, subjectType: 'user', subjectId: created.user.id, level });
      const a = new Api(base);
      await a.login(email, 'User-password-1');
      return a;
    }
    const editorApis = [];
    for (let i = 0; i < EDITORS; i++) editorApis.push(await account(`editor${i}`, 'edit'));
    const readerApis = [];
    for (let i = 0; i < READERS; i++) readerApis.push(await account(`reader${i}`, 'view'));
    log(`${PAGES} pages, ${EDITORS} editors, ${READERS} readers; running ${DURATION / 1000} s against ${base}`);

    const until = Date.now() + DURATION;
    const running = () => Date.now() < until && !stopping;

    // ---- readers
    const readers = [];
    const readerLoops = readerApis.map(async (api, i) => {
      const r = { pageId: pages[i % pages.length], client: openClient(base, api, pages[i % pages.length]), rotatedAt: Date.now() };
      readers.push(r);
      await r.client.ready.catch((e) => fail('collab.connect', e));
      let n = 0;
      while (running()) {
        if (Date.now() - r.rotatedAt > CHURN_EVERY * (0.5 + Math.random())) {
          r.client.provider.destroy();
          r.pageId = pages[(pages.indexOf(r.pageId) + 1) % pages.length];
          r.client = openClient(base, api, r.pageId);
          r.rotatedAt = Date.now();
          report.churn.readerRotations++;
          await r.client.ready.catch((e) => fail('collab.connect', e));
        }
        const op = n++ % 5;
        const [name, path] = op === 0 ? ['rest.page', `/api/v1/pages/${r.pageId}`] : op === 1 ? ['rest.content', `/api/v1/pages/${r.pageId}/content`] : op === 2 ? ['rest.search', `/api/v1/search?q=${encodeURIComponent('m')}`] : op === 3 ? ['rest.tree', `/api/v1/spaces/${space}/tree`] : ['rest.page', `/api/v1/pages/${pages[n % pages.length]}`];
        const t0 = performance.now();
        try {
          await api.get(path);
          record(name, performance.now() - t0);
        } catch (e) {
          fail(name, e);
        }
        await sleep(jitter(2000, 5000));
      }
    });

    // ---- editors
    const editors = [];
    const editorLoops = editorApis.map(async (api, i) => {
      const pageId = pages[i % pages.length];
      const e = { pageId, client: openClient(base, api, pageId), paraId: globalThis.crypto.randomUUID(), live: [], seq: 0, churnAt: Date.now() + CHURN_EVERY * (0.5 + Math.random()) };
      editors.push(e);
      try {
        await e.client.ready;
      } catch (err) {
        fail('collab.connect', err);
        return;
      }
      {
        const p = new Y.XmlElement('paragraph');
        p.setAttribute('id', e.paraId);
        p.insert(0, [new Y.XmlText()]);
        e.client.frag().push([p]);
        if (!(await waitAcked(e.client.provider))) fail('collab.ack', new Error('paragraph not acknowledged'));
      }
      await sleep(jitter(0, EDIT_EVERY));
      while (running()) {
        if (Date.now() > e.churnAt) {
          e.churnAt = Date.now() + CHURN_EVERY * (0.5 + Math.random());
          if (Math.random() < 0.5) {
            // network blip: same replica reconnects and resends whatever was pending
            e.client.provider.disconnect();
            await sleep(jitter(200, 2000));
            await e.client.provider.connect();
            report.churn.reconnects++;
          } else {
            // tab closed and reopened: everything acknowledged so far must come back from the server
            await waitAcked(e.client.provider);
            e.client.provider.destroy();
            e.client = openClient(base, api, pageId);
            report.churn.reopens++;
            try {
              await e.client.ready;
            } catch (err) {
              fail('collab.connect', err);
              continue;
            }
          }
        }
        const para = findParagraph(e.client.frag(), e.paraId);
        if (!para) {
          fail('integrity.paragraph', new Error(`editor ${i}: own paragraph missing after reopen`));
          await sleep(EDIT_EVERY);
          continue;
        }
        const x = para.get(0);
        const marker = `e${i}-${e.seq++}`;
        markers.set(marker, { pageId, state: 'sent' });
        let toDelete = null;
        e.client.doc.transact(() => {
          x.insert(x.length, `⟦m:${marker}⟧ `);
          if (e.live.length >= KEEP) {
            toDelete = e.live.shift();
            const tok = `⟦m:${toDelete}⟧ `;
            const at = x.toString().indexOf(tok);
            if (at >= 0) x.delete(at, tok.length);
            else fail('integrity.local', new Error(`marker ${toDelete} not found locally for deletion`));
            markers.get(toDelete).state = 'deleting';
          }
        });
        e.live.push(marker);
        const t0 = performance.now();
        if (await waitAcked(e.client.provider)) {
          record('collab.ack', performance.now() - t0);
          markers.get(marker).state = 'acked';
          markers.get(marker).ackedAt = Date.now();
          if (toDelete) markers.get(toDelete).state = 'deleted';
        } else fail('collab.ack', new Error('not acknowledged within 30 s: ' + marker));
        await sleep(jitter(EDIT_EVERY * 0.5, EDIT_EVERY * 1.5));
      }
    });

    // ---- tree churn: create + trash one page a minute
    const treeLoop = (async () => {
      while (running()) {
        await sleep(60_000);
        if (!running()) break;
        const t0 = performance.now();
        try {
          const p = await owner.post('/api/v1/pages', { spaceId: space, parentId: null, title: `Временная ${report.churn.treePages}`, requestId: crypto.randomUUID() });
          await owner.req('DELETE', `/api/v1/pages/${p.page.id}`);
          record('rest.tree-churn', performance.now() - t0);
          report.churn.treePages++;
        } catch (err) {
          fail('rest.tree-churn', err);
        }
      }
    })();

    // ---- resource sampler
    async function sample() {
      const s = { t: elapsedS() };
      try {
        const h = args['metrics-token'] ? { authorization: `Bearer ${args['metrics-token']}` } : {};
        const m = parseProm(await (await fetch(base + '/metrics', { headers: h, signal: AbortSignal.timeout(10_000) })).text());
        s.rssMb = Math.round((m.kb_process_resident_memory_bytes / 2 ** 20) * 10) / 10;
        s.heapMb = Math.round((m.kb_nodejs_heap_size_used_bytes / 2 ** 20) * 10) / 10;
        s.externalMb = Math.round((m.kb_nodejs_external_memory_bytes / 2 ** 20) * 10) / 10;
        s.fds = m.kb_process_open_fds;
        s.handles = m.kb_nodejs_active_handles_total;
        s.lagP99Ms = Math.round(m.kb_nodejs_eventloop_lag_p99_seconds * 1e4) / 10;
        s.collabConnections = m.kb_collab_connections;
        s.collabDocuments = m.kb_collab_documents;
        s.poolTotal = m['kb_db_pool_connections{state="total"}'];
        s.poolWaiting = m['kb_db_pool_connections{state="waiting"}'];
        s.persistFailures = m.kb_collab_persist_failures_total;
      } catch (err) {
        fail('sample.metrics', err);
      }
      if (pgc) {
        try {
          s.dbSessions = (await pgc.query('select count(*)::int c from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()', [dbName])).rows[0].c;
          s.dbSizeMb = Math.round(((await pgc.query('select pg_database_size($1)::bigint s', [dbName])).rows[0].s / 2 ** 20) * 10) / 10;
        } catch (err) {
          fail('sample.db', err);
        }
      }
      const p = procStats(serverPid);
      if (p) s.proc = p;
      s.driverRssMb = Math.round((process.memoryUsage().rss / 2 ** 20) * 10) / 10;
      report.samples.push(s);
      return s;
    }
    const samplerLoop = (async () => {
      while (running()) {
        const s = await sample();
        if (report.samples.length % 10 === 1) log(`rss ${s.rssMb} MB, heap ${s.heapMb} MB, fds ${s.fds}, db sessions ${s.dbSessions}, pool ${s.poolTotal}/${s.poolWaiting} waiting, lag p99 ${s.lagP99Ms} ms, ws ${s.collabConnections}, docs ${s.collabDocuments}`);
        await sleep(SAMPLE_EVERY);
      }
    })();

    // ---- integrity checks
    async function integrity(final) {
      const checkAt = Date.now();
      const res = { t: elapsedS(), final, lost: 0, duplicated: 0, resurrected: 0, replicaMissing: 0, replicaMismatch: 0, acked: 0, deleted: 0, examples: [] };
      for (const pageId of pages) {
        let text;
        try {
          text = JSON.stringify((await owner.get(`/api/v1/pages/${pageId}/content`)).content);
        } catch (err) {
          fail('integrity.fetch', err);
          continue;
        }
        for (const [mk, st] of markers) {
          if (st.pageId !== pageId) continue;
          const count = text.split(`⟦m:${mk}⟧`).length - 1;
          if (st.state === 'acked' && (final || st.ackedAt < checkAt)) {
            res.acked++;
            if (count === 0) res.lost++;
            if (count > 1) res.duplicated++;
            if ((count !== 1) && res.examples.length < 10) res.examples.push({ marker: mk, count });
          } else if (st.state === 'deleted') {
            res.deleted++;
            if (count > 0) {
              res.resurrected++;
              if (res.examples.length < 10) res.examples.push({ marker: mk, count, deleted: true });
            }
          }
        }
        for (const r of readers.filter((x) => x.pageId === pageId)) {
          const rt = replicaText(r.client);
          if (final) {
            if (r.client.provider.synced) {
              const serverPlain = (await owner.get(`/api/v1/pages/${pageId}/content`)).content.content.map((b) => (b.content ?? []).map((t) => t.text ?? '').join('')).join('\n');
              if (rt !== serverPlain) {
                res.replicaMismatch++;
                if (res.examples.length < 10) res.examples.push({ replicaOf: pageId, replicaLen: rt.length, serverLen: serverPlain.length });
              }
            }
            continue;
          }
          if (Date.now() - r.rotatedAt < 15_000) continue;
          for (const [mk, st] of markers) if (st.pageId === pageId && st.state === 'acked' && st.ackedAt < checkAt - 15_000 && !rt.includes(`⟦m:${mk}⟧`)) res.replicaMissing++;
        }
      }
      res.window = summarise(window);
      window = new Map();
      report.checks.push(res);
      writeReport();
      log(`integrity${final ? ' (final)' : ''}: ${res.acked} acked checked, ${res.deleted} deleted checked; lost ${res.lost}, duplicated ${res.duplicated}, resurrected ${res.resurrected}, replica missing ${res.replicaMissing}, replica mismatch ${res.replicaMismatch}; ack p95 ${res.window['collab.ack']?.p95 ?? '-'} ms`);
      return res;
    }
    const checkLoop = (async () => {
      while (running()) {
        await sleep(Math.min(CHECK_EVERY, Math.max(1000, until - Date.now())));
        if (!running()) break;
        await integrity(false);
      }
    })();

    await Promise.all([...editorLoops, ...readerLoops, treeLoop, samplerLoop, checkLoop]);
    // quiesce: every editor's pending operations acknowledged, every reader caught up
    for (const e of editors) if (!(await waitAcked(e.client.provider, 60_000))) fail('collab.ack', new Error('pending operations at the end'));
    for (const [, st] of markers) if (st.state === 'deleting') st.state = 'acked-delete-unknown';
    await sleep(3000);
    const final = await integrity(true);
    await sample();
    for (const e of editors) e.client.provider.destroy();
    for (const r of readers) r.client.provider.destroy();

    // ---- leak analysis (after warm-up)
    const after = report.samples.filter((s) => s.t * 1000 >= WARMUP);
    const perHour = (key) => {
      const pts = after.filter((s) => Number.isFinite(s[key])).map((s) => [s.t / 3600, s[key]]);
      const k = slope(pts);
      return k === null ? null : Math.round(k * 100) / 100;
    };
    const growth = (key) => {
      const pts = after.filter((s) => Number.isFinite(s[key]));
      if (pts.length < 4) return null;
      const q = Math.max(1, Math.floor(pts.length / 4));
      const avg = (xs) => xs.reduce((a, s) => a + s[key], 0) / xs.length;
      return Math.round((avg(pts.slice(-q)) - avg(pts.slice(0, q))) * 10) / 10;
    };
    const analysis = {
      samplesAfterWarmup: after.length,
      rssMbPerHour: perHour('rssMb'),
      heapMbPerHour: perHour('heapMb'),
      fdPerHour: perHour('fds'),
      dbSessionsPerHour: perHour('dbSessions'),
      rssGrowthMb: growth('rssMb'),
      heapGrowthMb: growth('heapMb'),
      fdGrowth: growth('fds'),
      dbSessionGrowth: growth('dbSessions'),
      maxPoolWaiting: Math.max(0, ...report.samples.map((s) => s.poolWaiting ?? 0)),
      maxLagP99Ms: Math.max(0, ...report.samples.map((s) => s.lagP99Ms ?? 0)),
    };
    const leaks = [];
    if (analysis.heapMbPerHour !== null && analysis.heapMbPerHour > LIMITS.heapMbPerHour) leaks.push(`heap +${analysis.heapMbPerHour} MB/h > ${LIMITS.heapMbPerHour}`);
    if (analysis.rssMbPerHour !== null && analysis.rssMbPerHour > LIMITS.rssMbPerHour) leaks.push(`RSS +${analysis.rssMbPerHour} MB/h > ${LIMITS.rssMbPerHour}`);
    if (analysis.fdGrowth !== null && analysis.fdGrowth > LIMITS.fdGrowth) leaks.push(`FDs +${analysis.fdGrowth} > ${LIMITS.fdGrowth}`);
    if (analysis.dbSessionGrowth !== null && analysis.dbSessionGrowth > LIMITS.dbSessionGrowth) leaks.push(`DB sessions +${analysis.dbSessionGrowth} > ${LIMITS.dbSessionGrowth}`);
    const integrityTotals = report.checks.reduce((a, c) => ({ lost: a.lost + c.lost, duplicated: a.duplicated + c.duplicated, resurrected: a.resurrected + c.resurrected, replicaMissing: a.replicaMissing + c.replicaMissing, replicaMismatch: a.replicaMismatch + c.replicaMismatch }), { lost: 0, duplicated: 0, resurrected: 0, replicaMissing: 0, replicaMismatch: 0 });
    const ackedTotal = [...markers.values()].filter((m) => m.state === 'acked' || m.state === 'deleted').length;
    report.finishedAt = new Date().toISOString();
    report.actualDurationS = elapsedS();
    report.analysis = analysis;
    report.verdict = {
      leaks,
      integrity: integrityTotals,
      acknowledgedEdits: ackedTotal,
      finalCheck: { acked: final.acked, deleted: final.deleted, lost: final.lost, duplicated: final.duplicated, resurrected: final.resurrected, replicaMismatch: final.replicaMismatch },
      ackErrors: metrics.get('collab.ack')?.errors ?? 0,
      pass: !leaks.length && !integrityTotals.lost && !integrityTotals.duplicated && !integrityTotals.resurrected && !final.replicaMismatch,
    };
    writeReport();
    const md = [
      `# Soak ${report.at}`,
      '',
      `Duration ${Math.round(report.actualDurationS / 60)} min; ${EDITORS} editors, ${READERS} readers, ${PAGES} pages; target ${report.config.target}.`,
      '',
      `Acknowledged edits: ${ackedTotal}; churn: ${report.churn.reconnects} reconnects, ${report.churn.reopens} reopened tabs, ${report.churn.readerRotations} reader rotations, ${report.churn.treePages} tree pages.`,
      `Integrity over ${report.checks.length} checks: lost ${integrityTotals.lost}, duplicated ${integrityTotals.duplicated}, resurrected ${integrityTotals.resurrected}, replica missing ${integrityTotals.replicaMissing}, final replica mismatch ${final.replicaMismatch}.`,
      `Leak analysis after ${WARMUP / 1000} s warm-up: RSS ${analysis.rssMbPerHour} MB/h (Δ ${analysis.rssGrowthMb} MB), heap ${analysis.heapMbPerHour} MB/h (Δ ${analysis.heapGrowthMb} MB), FDs Δ ${analysis.fdGrowth}, DB sessions Δ ${analysis.dbSessionGrowth}; max pool waiting ${analysis.maxPoolWaiting}; max event-loop lag p99 ${analysis.maxLagP99Ms} ms.`,
      `Verdict: ${report.verdict.pass ? 'PASS' : 'FAIL'}${leaks.length ? ' — ' + leaks.join('; ') : ''}.`,
      '',
      '| metric | n | errors | p50 ms | p95 ms | p99 ms | max ms |',
      '|---|---|---|---|---|---|---|',
      ...Object.entries(report.metrics).map(([k, m]) => `| ${k} | ${m.n} | ${m.errors} | ${m.p50} | ${m.p95} | ${m.p99} | ${m.max} |`),
      '',
      '| t, min | RSS MB | heap MB | FDs | DB sessions | pool total/waiting | lag p99 ms | WS | docs |',
      '|---|---|---|---|---|---|---|---|---|',
      ...report.samples.filter((_, i, all) => i % Math.max(1, Math.round(all.length / 24)) === 0 || i === all.length - 1).map((s) => `| ${Math.round(s.t / 60)} | ${s.rssMb} | ${s.heapMb} | ${s.fds} | ${s.dbSessions ?? '-'} | ${s.poolTotal}/${s.poolWaiting} | ${s.lagP99Ms} | ${s.collabConnections} | ${s.collabDocuments} |`),
    ].join('\n');
    writeFileSync(reportFile.replace(/\.json$/, '.md'), md + '\n');
    console.log('\n' + md + `\n\nreport: ${reportFile}`);
    process.exitCode = report.verdict.pass ? 0 : 1;
  } finally {
    await pgc?.end().catch(() => undefined);
    stopServer();
  }
}

main()
  .then(() => setTimeout(() => process.exit(process.exitCode ?? 0), 500))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
