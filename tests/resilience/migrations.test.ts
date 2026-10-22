import { describe, it, expect } from 'vitest';
import pg from 'pg';
import { mkdtemp, readdir, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer, setupOrg, Api, OWNER } from '../support/harness.js';
import { openClient } from '../support/collab.js';
import { cloneTemplateDb } from '../support/process-server.js';
import { migrateUp, migrateDown, migrationStatus, MIGRATIONS_DIR, SchemaTooNewError } from '../../apps/server/src/db/migrate.js';

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
});
