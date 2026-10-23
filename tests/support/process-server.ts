import { spawn, type ChildProcess } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';
import { inject } from 'vitest';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** A free TCP port on 127.0.0.1 (so a restarted server can come back on the same address). */
export async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createNetServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => resolve(port));
    });
  });
}

let counter = 0;

/** Clones the migrated template database (same naming as the harness so global teardown drops it). */
export async function cloneTemplateDb(suffix = 'p'): Promise<{ name: string; url: string; adminUrl: string }> {
  const tpl = inject('templateDb' as never) as string;
  const adminUrl = inject('adminUrl' as never) as string;
  const runTag = inject('runTag' as never) as string;
  const name = `kb_t_${runTag}_${process.pid}_${suffix}_${Date.now()}_${counter++}`;
  const a = new pg.Client({ connectionString: adminUrl });
  await a.connect();
  await a.query(`create database ${name} template ${tpl}`);
  await a.end();
  return { name, url: adminUrl.replace(/\/[^/]*$/, '/' + name), adminUrl };
}

export interface ProcessServer {
  url: string;
  port: number;
  proc: ChildProcess;
  output(): string;
  /** SIGKILL: no graceful shutdown, no flush — a real crash. */
  crash(): Promise<void>;
  /** SIGSTOP/SIGCONT: the process stays alive but stops processing (sockets stay open, nothing is acknowledged). */
  freeze(): void;
  thaw(): void;
  stop(): Promise<void>;
}

/**
 * Runs the real server entry point (apps/server/src/main.ts) as a child process, so tests can kill it the
 * way an OOM killer or a node failure would.
 */
export async function spawnServer(opts: { dbUrl: string; storageRoot: string; dataDir: string; port?: number; env?: Record<string, string> }): Promise<ProcessServer> {
  // One retry: a startup can fail transiently (port taken between probe and bind, source being rewritten
  // by a concurrent edit while tsx compiles it). A second failure is reported with the server output.
  try {
    return await spawnOnce(opts);
  } catch (e) {
    await new Promise((r) => setTimeout(r, 500));
    return spawnOnce(opts).catch((e2) => {
      throw new Error(`${(e2 as Error).message}\n--- first attempt ---\n${(e as Error).message}`);
    });
  }
}

async function spawnOnce(opts: { dbUrl: string; storageRoot: string; dataDir: string; port?: number; env?: Record<string, string> }): Promise<ProcessServer> {
  const port = opts.port ?? (await freePort());
  let out = '';
  const proc = spawn(process.execPath, ['--import', 'tsx', '--conditions=development', 'apps/server/src/main.ts'], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: opts.dbUrl,
      STORAGE_DRIVER: 'fs',
      STORAGE_ROOT: opts.storageRoot,
      KB_DATA_DIR: opts.dataDir,
      PORT: String(port),
      HOST: '127.0.0.1',
      PUBLIC_URL: 'http://127.0.0.1',
      LOG_LEVEL: process.env.TEST_LOG ?? 'warn',
      WORKER_ENABLED: 'false',
      OCR_ENABLED: 'false',
      RATE_LIMIT_PER_MINUTE: '100000',
      AUTH_RATE_LIMIT_PER_MINUTE: '100000',
      UPLOAD_RATE_LIMIT_PER_MINUTE: '100000',
      DB_POOL_SIZE: '10',
      ...opts.env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stdout!.on('data', (d) => (out += d));
  proc.stderr!.on('data', (d) => (out += d));
  const exited = new Promise<void>((r) => proc.once('exit', () => r()));
  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 60_000;
  for (;;) {
    if (proc.exitCode !== null) throw new Error('server exited during startup:\n' + out);
    try {
      const r = await fetch(url + '/readyz');
      if (r.ok) break;
    } catch {
      /* not listening yet */
    }
    if (Date.now() > deadline) {
      proc.kill('SIGKILL');
      throw new Error('server did not become ready:\n' + out);
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return {
    url,
    port,
    proc,
    output: () => out,
    crash: async () => {
      proc.kill('SIGKILL');
      await exited;
    },
    freeze: () => void proc.kill('SIGSTOP'),
    thaw: () => void proc.kill('SIGCONT'),
    stop: async () => {
      if (proc.exitCode !== null || proc.signalCode !== null) return;
      proc.kill('SIGCONT');
      proc.kill('SIGTERM');
      const t = setTimeout(() => proc.kill('SIGKILL'), 15_000);
      await exited;
      clearTimeout(t);
    },
  };
}
