#!/usr/bin/env node
// Test double of a deployment target for scripts/deploy/deploy.sh (DEPLOY_DRIVER=hooks), used by
// tests/integration/deploy-pipeline.test.ts. "Images" are behaviours:
//   kb:good-*          — the real server (apps/server/src/main.ts) on TARGET_PORT with the caller's DATABASE_URL etc.
//   kb:broken-ready-*  — a process whose /readyz answers 503 (release that cannot reach a dependency)
//   kb:broken-smoke-*  — /healthz and /readyz fine, the application itself answers 500
// Every action is appended to $TARGET_STATE/events.log; the schema version lives in $TARGET_STATE/schema.
//   deploy-target.mjs current | switch <image> | pending <image> | migrate-up <image> | migrate-down <image> <n> | backup
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync, openSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';

const [cmd, image, n] = process.argv.slice(2);
const state = process.env.TARGET_STATE;
const port = Number(process.env.TARGET_PORT);
const ev = (line) => appendFileSync(join(state, 'events.log'), line + '\n');
const read = (f, d) => (existsSync(join(state, f)) ? readFileSync(join(state, f), 'utf8').trim() : d);
// how many migrations each image brings (env TARGET_MIGRATIONS="kb:good-2=2,kb:broken-ready-1=1")
const migrationsOf = (img) => Number(Object.fromEntries((process.env.TARGET_MIGRATIONS ?? '').split(',').filter(Boolean).map((p) => p.split('=')))[img] ?? 0);
const schema = () => Number(read('schema', '0'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function stopCurrent() {
  const pid = Number(read('pid', '0'));
  if (!pid) return;
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return;
  }
  for (let i = 0; i < 150; i++) {
    try {
      process.kill(pid, 0);
    } catch {
      return;
    }
    await sleep(100);
  }
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    /* gone */
  }
}

switch (cmd) {
  case 'current':
    console.log(read('image', ''));
    break;
  case 'pending':
    // migrations of the image not yet applied (schema counts applied migrations of the newest image deployed)
    console.log(Math.max(0, migrationsOf(image) - Number(read('applied-' + image, '0'))));
    break;
  case 'backup':
    if (process.env.TARGET_FAIL_BACKUP) {
      ev('backup FAILED');
      process.exit(1);
    }
    ev('backup');
    break;
  case 'migrate-up': {
    if (process.env.TARGET_FAIL_MIGRATION === image) {
      ev(`migrate-up ${image} FAILED`);
      process.exit(1);
    }
    const k = migrationsOf(image) - Number(read('applied-' + image, '0'));
    writeFileSync(join(state, 'applied-' + image), String(migrationsOf(image)));
    writeFileSync(join(state, 'schema'), String(schema() + k));
    ev(`migrate-up ${image} +${k} schema=${schema()}`);
    break;
  }
  case 'migrate-down':
    writeFileSync(join(state, 'applied-' + image), String(Math.max(0, Number(read('applied-' + image, '0')) - Number(n))));
    writeFileSync(join(state, 'schema'), String(schema() - Number(n)));
    ev(`migrate-down ${image} -${n} schema=${schema()}`);
    break;
  case 'switch': {
    await stopCurrent();
    let child;
    const out = openSync(join(state, 'release.log'), 'a');
    if (image.startsWith('kb:good')) {
      child = spawn(process.execPath, ['--import', 'tsx', '--conditions=development', 'apps/server/src/main.ts'], { env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' }, detached: true, stdio: ['ignore', out, out] });
    } else {
      child = spawn(process.execPath, [process.argv[1], 'serve-stub', image], { env: process.env, detached: true, stdio: ['ignore', out, out] });
    }
    child.unref();
    writeFileSync(join(state, 'pid'), String(child.pid));
    writeFileSync(join(state, 'image'), image);
    ev(`switch ${image}`);
    break;
  }
  case 'serve-stub':
    createServer((req, res) => {
      if (req.url === '/healthz') return res.writeHead(200, { 'content-type': 'application/json' }).end('{"status":"ok"}');
      if (req.url === '/readyz') return image.startsWith('kb:broken-ready') ? res.writeHead(503).end('{"status":"not_ready"}') : res.writeHead(200).end('{"status":"ready"}');
      res.writeHead(500).end('broken release');
    }).listen(port, '127.0.0.1');
    break;
  case 'stop':
    await stopCurrent();
    break;
  default:
    console.error('unknown command ' + cmd);
    process.exit(1);
}
