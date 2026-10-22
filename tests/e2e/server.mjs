// Starts a fresh, isolated instance for browser tests: new database, empty object store, built web client.
import pg from 'pg';
import { rmSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const admin = process.env.TEST_ADMIN_DATABASE_URL ?? 'postgres://kb:kb@localhost:5432/postgres';
const db = process.env.E2E_DB ?? 'kb_e2e';
const c = new pg.Client({ connectionString: admin });
await c.connect();
await c.query(`drop database if exists ${db} with (force)`);
await c.query(`create database ${db}`);
await c.end();

const data = resolve(process.env.E2E_DATA ?? '.e2e-data');
rmSync(data, { recursive: true, force: true });
mkdirSync(data, { recursive: true });
// a private copy of the built client: a concurrent `vite build` empties apps/web/dist while it runs

const webSrc = resolve(process.env.E2E_WEB ?? (existsSync('.e2e-web/index.html') ? '.e2e-web' : 'apps/web/dist'));
cpSync(webSrc, resolve(data, 'web'), { recursive: true });

Object.assign(process.env, {
  NODE_ENV: 'test',
  PORT: process.env.E2E_PORT ?? '8090',
  HOST: '127.0.0.1',
  PUBLIC_URL: `http://127.0.0.1:${process.env.E2E_PORT ?? '8090'}`,
  DATABASE_URL: admin.replace(/\/[^/]*$/, '/' + db),
  KB_DATA_DIR: data,
  WEB_DIST: resolve(data, 'web'),
  AUTH_RATE_LIMIT_PER_MINUTE: '100000',
  RATE_LIMIT_PER_MINUTE: '100000',
  LOG_LEVEL: 'warn',
  OCR_ENABLED: process.env.OCR_ENABLED ?? 'false',
});
await import('../../apps/server/src/main.ts');
