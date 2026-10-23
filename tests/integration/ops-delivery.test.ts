import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import yaml from 'js-yaml';
import { Api } from '../support/harness.js';
import { REPO_ROOT, spawnServer, cloneTemplateDb, type ProcessServer } from '../support/process-server.js';
import { loadConfig } from '../../apps/server/src/config.js';

// Delivery kit and observability (R-OPS-022, R-OPS-003): health/readiness/metrics endpoints of the real server process (NODE_ENV=production),
// structured JSON logs with correlation ids and without secrets, no secrets in the repository, deployment files take
// every secret from the environment, and production refuses to start without a real SECRET_KEY.

let srv: ProcessServer;
let work: string;
const secretKey = randomBytes(24).toString('hex'); // 48 chars

beforeAll(async () => {
  work = await mkdtemp(join(tmpdir(), 'kb-ops-'));
  const db = await cloneTemplateDb('ops');
  srv = await spawnServer({ dbUrl: db.url, storageRoot: join(work, 'objects'), dataDir: join(work, 'data'), env: { NODE_ENV: 'production', LOG_LEVEL: 'info', SECRET_KEY: secretKey } }); // production logging (request logs on, JSON)
}, 120_000);
afterAll(async () => {
  await srv?.stop();
  await rm(work, { recursive: true, force: true });
});

describe('health, readiness, metrics and structured logs of the server process (R-OPS-003, R-OPS-022)', () => {
  it('/healthz, /readyz (database, storage, migrations) and Prometheus /metrics answer; logs are JSON lines with level, time and the caller correlation id, and never contain passwords or the secret key (R-OPS-003, R-OPS-022)', async () => {
    expect(await (await fetch(srv.url + '/healthz')).json()).toEqual({ status: 'ok' });
    const ready = await fetch(srv.url + '/readyz');
    expect(ready.status).toBe(200);
    expect(await ready.json()).toEqual({ status: 'ready', checks: { database: 'ok', storage: 'ok', migrations: 'ok' } });

    const owner = new Api(srv.url);
    const pw = 'Very-secret-password-' + randomBytes(4).toString('hex');
    await owner.post('/api/v1/setup', { orgName: 'ООО Журналы', ownerEmail: 'ops-log@corp.test', ownerName: 'Журнал', password: pw });
    const api = new Api(srv.url);
    await api.login('ops-log@corp.test', pw);
    await new Api(srv.url).login('ops-log@corp.test', pw + 'x').catch(() => undefined); // a failed login is logged too
    const corr = 'ops-corr-' + randomBytes(4).toString('hex');
    const r = await fetch(srv.url + '/api/v1/pages/00000000-0000-0000-0000-000000000000', { headers: { 'x-correlation-id': corr, cookie: api.cookieHeader() } });
    expect(r.status).toBeGreaterThanOrEqual(400);

    const metrics = await (await fetch(srv.url + '/metrics')).text();
    for (const m of ['kb_http_request_duration_seconds', 'kb_process_resident_memory_bytes', 'kb_nodejs_eventloop_lag_p99_seconds', 'kb_jobs_queued', 'kb_outbox_pending', 'kb_collab_persist_failures_total']) expect(metrics, m).toContain(`# TYPE ${m} `);
    expect(metrics).toMatch(/kb_http_request_duration_seconds_count\{[^}]*status="200"[^}]*\} \d+/);

    await new Promise((res) => setTimeout(res, 300));
    const out = srv.output();
    // Node's own runtime warnings (stderr, merged by spawnServer) are not application logs.
    const lines = out.split('\n').filter((l) => l.trim() && !/^\((node:\d+|Use `node)/.test(l));
    expect(lines.length).toBeGreaterThan(5);
    const parsed = lines.map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    });
    expect(lines.filter((_l, i) => parsed[i] === null), "every log line is JSON").toEqual([]);
    for (const p of parsed) {
      expect(typeof p.level).toBe('number');
      expect(typeof p.time).toBe('number');
    }
    expect(parsed.some((p) => p.reqId === corr), 'the caller correlation id is the request id in the log').toBe(true);
    expect(out).not.toContain(pw);
    expect(out).not.toContain(secretKey);
  }, 120_000);
});

describe('deployment kit without secrets (R-OPS-022)', () => {
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: REPO_ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((f) => f && !f.startsWith('node_modules/') && !/\.(png|jpe?g|gif|webp|ico|woff2?|ttf|pdf|docx|xlsx|zip|gz|bin)$/i.test(f));

  it('no private keys, cloud access keys or tokens in any repository file (R-OPS-022)', () => {
    const patterns = [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, /AGE-SECRET-KEY-1[0-9A-Z]{20,}/, /\bAKIA[0-9A-Z]{16}\b/, /\bgh[pousr]_[A-Za-z0-9]{36}\b/, /\bxox[baprs]-[A-Za-z0-9-]{10,}/, /\bsk_live_[A-Za-z0-9]{16,}/];
    const hits: string[] = [];
    for (const f of files) {
      const p = join(REPO_ROOT, f);
      let size = 0;
      try {
        size = statSync(p).size;
      } catch {
        continue; // deleted in the working tree
      }
      if (size > 5_000_000) continue;
      const text = readFileSync(p, 'utf8');
      for (const re of patterns) if (re.test(text)) hits.push(`${f}: ${re}`);
    }
    expect(hits).toEqual([]);
  });

  it('env.example only has placeholders for secrets; docker-compose takes every secret from the environment (R-OPS-022)', () => {
    const secretName = /(PASSWORD|SECRET|TOKEN|PRIVATE|ACCESS_KEY)/;
    const env = readFileSync(join(REPO_ROOT, 'deploy/env.example'), 'utf8');
    for (const line of env.split('\n')) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (!m || !secretName.test(m[1])) continue;
      expect(m[2] === '' || /CHANGE_ME/.test(m[2]), `${m[1]} in env.example must be empty or a CHANGE_ME placeholder`).toBe(true);
    }
    const compose = yaml.load(readFileSync(join(REPO_ROOT, 'deploy/docker-compose.yml'), 'utf8')) as any;
    let checked = 0;
    for (const [name, svc] of Object.entries<any>(compose.services)) {
      const envs: Record<string, unknown> = Array.isArray(svc.environment) ? Object.fromEntries(svc.environment.map((e: string) => e.split(/=(.*)/s).slice(0, 2))) : (svc.environment ?? {});
      for (const [k, v] of Object.entries(envs)) {
        if (!secretName.test(k) || /_FILE$/.test(k)) continue;
        checked++;
        expect(String(v ?? ''), `${name}.${k} must come from the environment`).toMatch(/^\$\{[A-Z0-9_]+(:?[-?][^}]*)?\}$/);
      }
    }
    expect(checked).toBeGreaterThan(3);
  });

  it('production refuses to start without a SECRET_KEY or with a short one (R-OPS-022)', () => {
    const saved = { NODE_ENV: process.env.NODE_ENV, SECRET_KEY: process.env.SECRET_KEY };
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.SECRET_KEY;
      expect(() => loadConfig()).toThrow(/SECRET_KEY/);
      process.env.SECRET_KEY = 'short';
      expect(() => loadConfig()).toThrow(/SECRET_KEY/);
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
});
