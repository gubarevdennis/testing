// Starts a private server process for black-box checks (DAST, Lighthouse): its own port, its own fresh database
// (<dbPrefix>_<pid>), its own data directory and a private copy of the built web client. stop() terminates only
// that process and drops only that database. Mirrors tests/e2e/server.mjs, without touching the e2e instance.
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

async function sql(admin: string, q: string) {
  const c = new pg.Client({ connectionString: admin });
  await c.connect();
  try {
    await c.query(q);
  } finally {
    await c.end();
  }
}

export async function startIsolatedServer(opts: { port: number; dbPrefix: string; env?: Record<string, string> }) {
  const admin = process.env.TEST_ADMIN_DATABASE_URL ?? 'postgres://kb:kb@localhost:5432/postgres';
  const db = `${opts.dbPrefix}_${process.pid}`;
  const base = `http://127.0.0.1:${opts.port}`;
  if (await fetch(base + '/healthz').then(() => true, () => false)) throw new Error(`port ${opts.port} is already in use — set another port`);
  const data = mkdtempSync(join(tmpdir(), `${opts.dbPrefix}-`));
  const webSrc = [process.env.KB_WEB_DIST, '.e2e-web', 'apps/web/dist'].filter(Boolean).map((p) => resolve(root, p!)).find((p) => existsSync(join(p, 'index.html'))) ?? null;
  if (webSrc) cpSync(webSrc, join(data, 'web'), { recursive: true });
  await sql(admin, `create database ${db}`);
  const built = process.env.KB_SERVER_BUILT === '1';
  const entry = built ? ['apps/server/dist/main.js'] : ['--import', 'tsx', '--conditions=development', 'apps/server/src/main.ts'];
  const child = spawn(process.execPath, entry, {
    cwd: root,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: {
      ...process.env,
      NODE_ENV: 'test', // enables /api/v1/__test/set-password used to create probe users
      PORT: String(opts.port),
      HOST: '127.0.0.1',
      PUBLIC_URL: base,
      DATABASE_URL: admin.replace(/\/[^/]*$/, '/' + db),
      KB_DATA_DIR: data,
      WEB_DIST: webSrc ? join(data, 'web') : '',
      LOG_LEVEL: 'fatal',
      OCR_ENABLED: 'false',
      ...(opts.env ?? {}),
    },
  });
  let exited = false;
  child.on('exit', () => (exited = true));
  const stop = async () => {
    if (!exited) child.kill('SIGTERM');
    for (let i = 0; i < 100 && !exited; i++) await new Promise((r) => setTimeout(r, 100));
    if (!exited) child.kill('SIGKILL');
    await sql(admin, `drop database if exists ${db} with (force)`).catch(() => undefined);
    rmSync(data, { recursive: true, force: true });
  };
  try {
    for (let i = 0; ; i++) {
      if (exited) throw new Error('server process exited during start-up');
      if (await fetch(base + '/readyz').then((r) => r.ok, () => false)) break;
      if (i > 600) throw new Error('server did not become ready in 60 s');
      await new Promise((r) => setTimeout(r, 100));
    }
  } catch (e) {
    await stop();
    throw e;
  }
  return { base, built, webSrc, stop };
}
