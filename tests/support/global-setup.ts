import pg from 'pg';
import { createPool } from '../../apps/server/src/db/pool.js';
import { migrateUp } from '../../apps/server/src/db/migrate.js';

const ADMIN_URL = process.env.TEST_ADMIN_DATABASE_URL ?? 'postgres://kb:kb@localhost:5432/postgres';

/** Creates a migrated template database; each test file clones it (fast, isolated). */
export default async function setup({ provide }: { provide: (k: string, v: unknown) => void }) {
  const tpl = `kb_tpl_${process.pid}`;
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`drop database if exists ${tpl}`);
  await admin.query(`create database ${tpl}`);
  const url = ADMIN_URL.replace(/\/[^/]*$/, '/' + tpl);
  const pool = createPool(url, 2);
  await migrateUp(pool);
  await pool.end();
  await admin.end();
  provide('templateDb', tpl);
  provide('adminUrl', ADMIN_URL);
  // Databases created by this run are named kb_t_<runTag>_…; teardown drops only those, never the
  // databases of another vitest run working against the same server at the same time.
  const runTag = String(process.pid);
  provide('runTag', runTag);
  return async () => {
    const a = new pg.Client({ connectionString: ADMIN_URL });
    await a.connect();
    const dbs = (await a.query(`select datname from pg_database where starts_with(datname, $2) or datname = $1`, [tpl, `kb_t_${runTag}_`])).rows;
    for (const d of dbs) await a.query(`drop database if exists ${d.datname} with (force)`).catch(() => undefined);
    await a.end();
  };
}
