import { describe, it, expect, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { REPO_ROOT, spawnServer, cloneTemplateDb, type ProcessServer } from '../support/process-server.js';

// Secrets manager integration on the real server process (R-OPS-003, R-OPS-022): the production server starts with
// SECRET_KEY, DATABASE_URL and METRICS_TOKEN given only as files (Docker/Kubernetes secrets, Vault Agent templates),
// uses them, and never writes them to its log; a broken secret file stops the start with a message naming the file.

let srv: ProcessServer | undefined;
let work: string;
afterAll(async () => {
  await srv?.stop();
  if (work) await rm(work, { recursive: true, force: true });
});

describe('secrets from files on the production server (R-OPS-003, R-OPS-022)', () => {
  it('SECRET_KEY_FILE, DATABASE_URL_FILE and METRICS_TOKEN_FILE are used; none of the values reaches the log', async () => {
    work = await mkdtemp(join(tmpdir(), 'kb-ops-secrets-'));
    const db = await cloneTemplateDb('secrets');
    const secretKey = randomBytes(32).toString('base64');
    const metricsToken = 'mt-' + randomBytes(16).toString('hex');
    const sec = join(work, 'run-secrets');
    await import('node:fs/promises').then((f) => f.mkdir(sec, { mode: 0o700 }));
    await writeFile(join(sec, 'secret_key'), secretKey + '\n', { mode: 0o400 });
    await writeFile(join(sec, 'database_url'), db.url + '\n', { mode: 0o400 });
    await writeFile(join(sec, 'metrics_token'), metricsToken, { mode: 0o400 });
    srv = await spawnServer({
      dbUrl: db.url,
      storageRoot: join(work, 'objects'),
      dataDir: join(work, 'data'),
      env: { NODE_ENV: 'production', LOG_LEVEL: 'debug', DATABASE_URL: '', SECRET_KEY: '', SECRET_KEY_FILE: join(sec, 'secret_key'), DATABASE_URL_FILE: join(sec, 'database_url'), METRICS_TOKEN_FILE: join(sec, 'metrics_token') },
    });
    // the database from the file is the one in use (readiness checks it), the metrics token from the file protects /metrics
    expect((await fetch(srv.url + '/readyz')).status).toBe(200);
    expect((await fetch(srv.url + '/metrics')).status).toBe(401);
    expect((await fetch(srv.url + '/metrics', { headers: { authorization: 'Bearer wrong' } })).status).toBe(401);
    const m = await fetch(srv.url + '/metrics', { headers: { authorization: `Bearer ${metricsToken}` } });
    expect(m.status).toBe(200);
    expect(await m.text()).toContain('kb_db_pool_connections{state="total"}');
    // sessions are signed with the key from the file: setup + login work
    const setup = await fetch(srv.url + '/api/v1/setup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orgName: 'ООО Секреты', ownerEmail: 'sec@corp.test', ownerName: 'Секрет', password: 'Secret-file-password-1' }) });
    expect(setup.status).toBe(200);
    await new Promise((r) => setTimeout(r, 300));
    const out = srv.output();
    expect(out.length).toBeGreaterThan(100);
    expect(out).not.toContain(secretKey);
    expect(out).not.toContain(metricsToken);
    expect(out).not.toContain(db.url.replace(/^postgres:\/\/[^@]*@/, '')); // not even the host/db part of the URL
  }, 120_000);

  it('a missing secret file stops the start; the error names the variable and the path', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kb-ops-secrets-bad-'));
    const conflicting = join(dir, 'secret_key');
    const value = randomBytes(32).toString('base64');
    await writeFile(conflicting, value);
    const runOnce = (env: Record<string, string>) =>
      new Promise<{ code: number | null; out: string }>((resolve) => {
        let out = '';
        const p = spawn(process.execPath, ['--import', 'tsx', '--conditions=development', 'apps/server/src/main.ts'], { cwd: REPO_ROOT, env: { PATH: process.env.PATH, NODE_ENV: 'production', PORT: '0', HOST: '127.0.0.1', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
        p.stdout.on('data', (d) => (out += d));
        p.stderr.on('data', (d) => (out += d));
        const t = setTimeout(() => p.kill('SIGKILL'), 60_000);
        p.on('exit', (code) => {
          clearTimeout(t);
          resolve({ code, out });
        });
      });
    const missing = await runOnce({ SECRET_KEY_FILE: join(dir, 'absent') });
    expect(missing.code).not.toBe(0);
    expect(missing.out).toContain(`SECRET_KEY_FILE: cannot read ${join(dir, 'absent')} (ENOENT)`);
    const both = await runOnce({ SECRET_KEY: 'x'.repeat(48), SECRET_KEY_FILE: conflicting });
    expect(both.code).not.toBe(0);
    expect(both.out).toContain('both SECRET_KEY and SECRET_KEY_FILE are set');
    expect(both.out).not.toContain(value);
    await rm(dir, { recursive: true, force: true });
  }, 120_000);
});
