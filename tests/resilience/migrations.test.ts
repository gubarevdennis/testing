import { describe, it, expect } from 'vitest';
import pg from 'pg';
import { mkdtemp, readdir, copyFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer, setupOrg, Api, OWNER } from '../support/harness.js';
import { openClient } from '../support/collab.js';
import { cloneTemplateDb } from '../support/process-server.js';
import { migrateUp, migrateDown, migrationStatus, MIGRATIONS_DIR, SchemaTooNewError, BackupRequiredError } from '../../apps/server/src/db/migrate.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { REPO_ROOT } from '../support/process-server.js';
import { tx } from '../../apps/server/src/db/pool.js';
import { bootstrapOrg } from '../../apps/server/src/services/org.js';

// Release rollback (E-14, OPS-002, R-OPS-001, R-OPS-004, R-OPS-007): every migration can be rolled back and
// re-applied with real data in the database, and an older release refuses to run against a newer schema.

const textOf = (content: any) => content.content.map((b: any) => (b.content ?? []).map((t: any) => t.text ?? '').join('')).join('\n');

describe('schema migrations: rollback and re-apply (E-14, OPS-002, R-OPS-001)', () => {
  it('every migration rolls back and re-applies step by step with data present; the application keeps working (E-14, OPS-002, R-OPS-001, R-OPS-004, R-OPS-007)', async () => {
    const ts = await startServer();
    const org = await setupOrg(ts);
    const pageId = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Переживёт откат' })).page.id;
    const c = await openClient(ts.url, org.owner, pageId);
    c.insert(0, 0, 'данные до отката');
    await c.waitSaved();
    c.close();
    const fd = new FormData();
    fd.append('pageId', pageId);
    fd.append('file', new Blob([Buffer.from('вложение')]), 'a.txt');
    await org.owner.req('POST', '/api/v1/attachments', fd);
    const dbName = new URL(ts.dbUrl).pathname.slice(1);
    await ts.srv.close(); // stop the application before changing the schema

    const pool = new pg.Pool({ connectionString: ts.dbUrl, max: 2 });
    try {
      const all = (await migrationStatus(pool)).map((m) => m.name);
      expect(all.length).toBeGreaterThan(1);
      const counts = async () => (await pool.query('select (select count(*)::int from pages) p, (select count(*)::int from doc_updates) u, (select count(*)::int from attachments) a, (select count(*)::int from audit_events) e')).rows[0];
      const before = await counts();
      // Roll back the newest migrations one at a time (down to the core schema) and re-apply each.
      for (let i = all.length - 1; i >= 1; i--) {
        const rolled = await migrateDown(pool, 1);
        expect(rolled).toEqual([all[i]]);
        expect((await migrationStatus(pool)).filter((m) => m.applied).length).toBe(i);
        expect(await counts()).toEqual(before); // core data untouched by the down migration
        const reapplied = await migrateUp(pool, () => undefined, all[i].slice(0, 4));
        expect(reapplied).toEqual([all[i]]);
        await migrateDown(pool, 1); // keep going down for the next step
      }
      // Now only the core migration is applied: re-apply everything in one go.
      expect(await migrateUp(pool)).toEqual(all.slice(1));
      expect(await counts()).toEqual(before);
    } finally {
      await pool.end();
    }

    // The application starts on the round-tripped schema and serves the data.
    const again = await startServer({}, { dbName });
    try {
      const api = new Api(again.url);
      await api.login(OWNER.email, OWNER.password);
      expect(textOf((await api.get(`/api/v1/pages/${pageId}/content`)).content)).toBe('данные до отката');
      const atts = await api.get(`/api/v1/pages/${pageId}/attachments`);
      expect(atts.attachments.some((a: any) => a.filename === 'a.txt')).toBe(true);
      expect((await fetch(again.url + '/readyz')).status).toBe(200);
    } finally {
      await again.close();
    }
  });

  it('a complete rollback to an empty schema and a fresh re-apply both succeed (E-14, R-OPS-007)', async () => {
    const db = await cloneTemplateDb('mig');
    const pool = new pg.Pool({ connectionString: db.url, max: 2 });
    try {
      const n = (await migrationStatus(pool)).length;
      expect((await migrateDown(pool, n)).length).toBe(n);
      const tables = (await pool.query(`select tablename from pg_tables where schemaname = 'public' order by 1`)).rows.map((r) => r.tablename);
      expect(tables).toEqual(['schema_migrations']);
      expect((await migrateUp(pool)).length).toBe(n);
    } finally {
      await pool.end();
    }
  });

  it('an older release refuses to start against a newer schema instead of running on it (OPS-002, E-14, R-OPS-004)', async () => {
    const db = await cloneTemplateDb('old');
    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
    const oldDir = await mkdtemp(join(tmpdir(), 'kb-old-release-'));
    for (const f of files.slice(0, -1)) await copyFile(join(MIGRATIONS_DIR, f), join(oldDir, f)); // "previous release" lacks the newest migration
    const pool = new pg.Pool({ connectionString: db.url, max: 2 });
    try {
      const err = await migrateUp(pool, () => undefined, undefined, oldDir).catch((e) => e);
      expect(err).toBeInstanceOf(SchemaTooNewError);
      expect(err.unknown).toEqual([files[files.length - 1].slice(0, 4)]);
      expect(err.message).toMatch(/newer than this application/);
      // After rolling the schema back with the newer release, the older release runs again.
      await migrateDown(pool, 1);
      expect(await migrateUp(pool, () => undefined, undefined, oldDir)).toEqual([]);
    } finally {
      await pool.end();
      await rm(oldDir, { recursive: true, force: true });
    }
  });

  it('pending migrations on a database with data are refused until a fresh full backup is recorded; backup.sh unlocks them, the CLI enforces it too (R-OPS-001, R-OPS-004)', async () => {
    const run = promisify(execFile);
    const db = await cloneTemplateDb('guard');
    const work = await mkdtemp(join(tmpdir(), 'kb-mig-guard-'));
    const pool = new pg.Pool({ connectionString: db.url, max: 2 });
    const guard = { requireBackupWithinMinutes: 60 };
    try {
      // A fresh installation (no data yet) migrates without a backup.
      const all = (await migrationStatus(pool)).map((m) => m.name);
      await migrateDown(pool, 1);
      expect(await migrateUp(pool, () => undefined, undefined, undefined, guard)).toEqual([all[all.length - 1]]);
      // With data present, a pending migration needs a backup.
      await tx(pool, (q) => bootstrapOrg(q, { orgName: 'Guard', slug: 'guard', ownerEmail: 'g@example.com', ownerName: 'G', password: 'Очень-надёжный-пароль-1' }));
      await migrateDown(pool, 1);
      const err = await migrateUp(pool, () => undefined, undefined, undefined, guard).catch((e) => e);
      expect(err).toBeInstanceOf(BackupRequiredError);
      expect(err.pending).toEqual([all[all.length - 1]]);
      expect(err.message).toMatch(/without a fresh full backup/);
      expect((await migrationStatus(pool)).filter((m) => m.applied).length).toBe(all.length - 1); // nothing applied
      // A real backup run (recorded in "backups") unlocks the migration.
      await mkdir(join(work, 'objects'), { recursive: true });
      await run('bash', [join(REPO_ROOT, 'scripts/backup/backup.sh')], {
        env: { ...process.env, DATABASE_URL: db.url, BACKUP_DIR: join(work, 'backups'), STORAGE_DRIVER: 'fs', STORAGE_ROOT: join(work, 'objects'), BACKUP_RECORD: '1', BACKUP_PRUNE: '0' },
        timeout: 120_000,
      });
      expect((await pool.query(`select count(*)::int c from backups where kind = 'full' and status = 'ok'`)).rows[0].c).toBe(1);
      expect(await migrateUp(pool, () => undefined, undefined, undefined, guard)).toEqual([all[all.length - 1]]);
      // A backup older than the allowed age (or older than the current schema) does not count: the CLI refuses …
      await pool.query(`update backups set finished_at = now() - interval '1 day'`);
      await migrateDown(pool, 1);
      const cli = (args: string[]) =>
        run(process.execPath, ['--import', 'tsx', '--conditions=development', 'apps/server/src/cli.ts', 'migrate', 'up', ...args], { cwd: REPO_ROOT, env: { ...process.env, DATABASE_URL: db.url, MIGRATION_REQUIRE_BACKUP: 'true', MIGRATION_BACKUP_MAX_AGE_MIN: '60' }, timeout: 60_000 }).then(
          (r) => ({ code: 0, out: r.stdout + r.stderr }),
          (e) => ({ code: e.code as number, out: String(e.stdout) + String(e.stderr) }),
        );
      const refused = await cli([]);
      expect(refused.code).toBe(1);
      expect(refused.out).toMatch(/without a fresh full backup/);
      // … unless the operator overrides it deliberately (restore.sh does this for a database restored from a backup).
      const forced = await cli(['--skip-backup-check']);
      expect(forced.code).toBe(0);
      expect(forced.out).toMatch(/backup-before-migration check skipped/);
      expect((await migrationStatus(pool)).every((m) => m.applied)).toBe(true);
    } finally {
      await pool.end();
      await rm(work, { recursive: true, force: true });
    }
  }, 180_000);
});
