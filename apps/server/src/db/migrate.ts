import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type pg from 'pg';

export const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');

interface Migration {
  version: string;
  name: string;
  up: string;
  down: string;
  checksum: string;
}

export async function loadMigrations(dir = MIGRATIONS_DIR): Promise<Migration[]> {
  const files = (await readdir(dir)).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
  const out: Migration[] = [];
  for (const f of files) {
    const text = await readFile(join(dir, f), 'utf8');
    const upIdx = text.indexOf('-- migrate:up');
    const downIdx = text.indexOf('-- migrate:down');
    if (upIdx < 0 || downIdx < 0) throw new Error(`Migration ${f} must contain "-- migrate:up" and "-- migrate:down" sections`);
    out.push({
      version: f.slice(0, 4),
      name: f.replace(/\.sql$/, ''),
      up: text.slice(upIdx, downIdx),
      down: text.slice(downIdx),
      checksum: createHash('sha256').update(text.slice(upIdx, downIdx)).digest('hex'),
    });
  }
  return out;
}

async function ensureTable(client: pg.PoolClient) {
  await client.query(`create table if not exists schema_migrations (
    version text primary key, name text not null, checksum text not null, applied_at timestamptz not null default now())`);
}

/** Applies pending migrations, each in its own transaction, under an advisory lock (safe for parallel app instances). */
export async function migrateUp(pool: pg.Pool, log: (m: string) => void = () => undefined, target?: string): Promise<string[]> {
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query('select pg_advisory_lock(727274)');
    await ensureTable(client);
    const done = new Map((await client.query('select version, checksum from schema_migrations')).rows.map((r) => [r.version, r.checksum]));
    for (const m of await loadMigrations()) {
      if (target && m.version > target) break;
      if (done.has(m.version)) {
        if (done.get(m.version) !== m.checksum) throw new Error(`Migration ${m.name} was modified after being applied (checksum mismatch)`);
        continue;
      }
      log(`applying ${m.name}`);
      await client.query('begin');
      try {
        await client.query(m.up);
        await client.query('insert into schema_migrations (version, name, checksum) values ($1, $2, $3)', [m.version, m.name, m.checksum]);
        await client.query('commit');
        applied.push(m.name);
      } catch (e) {
        await client.query('rollback');
        throw new Error(`Migration ${m.name} failed: ${(e as Error).message}`);
      }
    }
  } finally {
    await client.query('select pg_advisory_unlock(727274)').catch(() => undefined);
    client.release();
  }
  return applied;
}

/** Rolls back the latest `steps` migrations. */
export async function migrateDown(pool: pg.Pool, steps = 1, log: (m: string) => void = () => undefined): Promise<string[]> {
  const client = await pool.connect();
  const rolled: string[] = [];
  try {
    await client.query('select pg_advisory_lock(727274)');
    await ensureTable(client);
    const all = new Map((await loadMigrations()).map((m) => [m.version, m]));
    const done = (await client.query('select version from schema_migrations order by version desc limit $1', [steps])).rows;
    for (const { version } of done) {
      const m = all.get(version);
      if (!m) throw new Error(`No migration file for applied version ${version}`);
      log(`rolling back ${m.name}`);
      await client.query('begin');
      try {
        await client.query(m.down);
        await client.query('delete from schema_migrations where version = $1', [version]);
        await client.query('commit');
        rolled.push(m.name);
      } catch (e) {
        await client.query('rollback');
        throw new Error(`Rollback of ${m.name} failed: ${(e as Error).message}`);
      }
    }
  } finally {
    await client.query('select pg_advisory_unlock(727274)').catch(() => undefined);
    client.release();
  }
  return rolled;
}

export async function migrationStatus(pool: pg.Pool) {
  const client = await pool.connect();
  try {
    await ensureTable(client);
    const done = new Set((await client.query('select version from schema_migrations')).rows.map((r) => r.version));
    return (await loadMigrations()).map((m) => ({ name: m.name, applied: done.has(m.version) }));
  } finally {
    client.release();
  }
}
