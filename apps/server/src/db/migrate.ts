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

export class SchemaTooNewError extends Error {
  constructor(public unknown: string[]) {
    super(`Database schema is newer than this application: applied migration(s) ${unknown.join(', ')} are unknown to this version. ` +
      'Roll the schema back with the newer release (cli migrate down) or deploy the newer release.');
  }
}

/** Raised when pending migrations would run on a database with data but no fresh full backup exists (R-OPS-001, R-OPS-004). */
export class BackupRequiredError extends Error {
  constructor(
    public pending: string[],
    public lastBackupAt: Date | null,
  ) {
    super(
      `Refusing to apply ${pending.length} migration(s) (${pending.join(', ')}) without a fresh full backup: ` +
        (lastBackupAt ? `the last successful backup (${lastBackupAt.toISOString()}) is older than the allowed age or older than the current schema. ` : 'no successful full backup is recorded. ') +
        'Run scripts/backup/backup.sh (BACKUP_RECORD=1) and retry, or override deliberately with MIGRATION_REQUIRE_BACKUP=false / cli migrate up --skip-backup-check (docs/OPERATIONS.md §3).',
    );
  }
}

export interface MigrateGuard {
  /** Pending migrations on a non-empty database need a successful full backup finished within this many minutes
   * and after the latest applied migration. null/undefined = no check (fresh installs are never checked). */
  requireBackupWithinMinutes?: number | null;
}

/** Checks the "backup before every migration" rule; a fresh (empty) database needs no backup. */
async function checkBackupBeforeMigration(client: pg.PoolClient, pending: string[], maxAgeMinutes: number) {
  const applied = (await client.query('select max(applied_at) as at, count(*)::int as n from schema_migrations')).rows[0];
  if (!applied.n) return; // fresh install: nothing to lose
  const hasBackups = (await client.query(`select to_regclass('public.backups') is not null as ok`)).rows[0].ok;
  const hasData = (await client.query(`select to_regclass('public.organizations') is not null and exists (select 1 from organizations) as ok`).catch(() => ({ rows: [{ ok: true }] }))).rows[0].ok;
  if (!hasData) return;
  const last = hasBackups ? (await client.query(`select max(finished_at) as at from backups where kind = 'full' and status = 'ok'`)).rows[0].at as Date | null : null;
  const fresh = last && last.getTime() >= Date.now() - maxAgeMinutes * 60_000 && last.getTime() >= new Date(applied.at).getTime();
  if (!fresh) throw new BackupRequiredError(pending, last);
}

/**
 * Applies pending migrations, each in its own transaction, under an advisory lock (safe for parallel app instances).
 * Refuses to run (SchemaTooNewError) when the database has migrations this code does not know: an older release must
 * not run against a newer schema it was never tested with (roll the schema back first, see docs/OPERATIONS.md §3).
 */
export async function migrateUp(pool: pg.Pool, log: (m: string) => void = () => undefined, target?: string, dir = MIGRATIONS_DIR, guard: MigrateGuard = {}): Promise<string[]> {
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query('select pg_advisory_lock(727274)');
    await ensureTable(client);
    const done = new Map((await client.query('select version, checksum from schema_migrations')).rows.map((r) => [r.version, r.checksum]));
    const known = await loadMigrations(dir);
    const knownVersions = new Set(known.map((m) => m.version));
    const unknown = [...done.keys()].filter((v) => !knownVersions.has(v)).sort();
    if (unknown.length) throw new SchemaTooNewError(unknown);
    const pending = known.filter((m) => !done.has(m.version) && !(target && m.version > target)).map((m) => m.name);
    if (pending.length && guard.requireBackupWithinMinutes) await checkBackupBeforeMigration(client, pending, guard.requireBackupWithinMinutes);
    for (const m of known) {
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
export async function migrateDown(pool: pg.Pool, steps = 1, log: (m: string) => void = () => undefined, dir = MIGRATIONS_DIR): Promise<string[]> {
  const client = await pool.connect();
  const rolled: string[] = [];
  try {
    await client.query('select pg_advisory_lock(727274)');
    await ensureTable(client);
    const all = new Map((await loadMigrations(dir)).map((m) => [m.version, m]));
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
