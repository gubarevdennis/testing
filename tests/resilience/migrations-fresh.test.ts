import { describe, it, expect } from 'vitest';
import { inject } from 'vitest';
import pg from 'pg';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { readdirSync } from 'node:fs';
import { REPO_ROOT } from '../support/process-server.js';

// Deployment with migrations and rollback (R-OPS-022, E-14): on a FRESH empty database, the release CLI applies every
// migration, rolls all of them back, and applies them again; the down migrations leave nothing behind and the schema after
// the second up is identical (pg_dump --schema-only) to the first one.

const run = promisify(execFile);
const cli = (url: string, ...args: string[]) =>
  run(process.execPath, ['--import', 'tsx', '--conditions=development', 'apps/server/src/cli.ts', ...args], { cwd: REPO_ROOT, env: { ...process.env, DATABASE_URL: url, NODE_ENV: 'test' }, maxBuffer: 16 * 1024 * 1024 });
const schema = async (url: string) => (await run('pg_dump', ['--schema-only', '--no-owner', '--no-privileges', url], { maxBuffer: 64 * 1024 * 1024 })).stdout.replace(/^\\(un)?restrict .*$/gm, '');

describe('migrations on a fresh database: up → down → up (R-OPS-022, E-14)', () => {
  it('the CLI applies all migrations to an empty database, rolls every one back without leftovers and re-applies them to an identical schema (R-OPS-022, E-14, R-OPS-003)', async () => {
    const adminUrl = inject('adminUrl' as never) as string;
    const name = `kb_t_${inject('runTag' as never) as string}_fresh_${Date.now()}`; // dropped by the global teardown
    const admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`create database ${name}`);
    await admin.end();
    const url = adminUrl.replace(/\/[^/]*$/, '/' + name);
    const db = new pg.Pool({ connectionString: url, max: 1 });
    try {
      await cli(url, 'migrate', 'up');
      const n = (await db.query('select count(*)::int n from schema_migrations')).rows[0].n;
      expect(n).toBe(readdirSync(join(REPO_ROOT, 'apps/server/migrations')).filter((f) => f.endsWith('.sql')).length);
      const first = await schema(url);

      await cli(url, 'migrate', 'down', String(n));
      const left = (
        await db.query(`select c.relname, c.relkind from pg_class c join pg_namespace s on s.oid = c.relnamespace
                        where s.nspname = 'public' and c.relname not like 'schema_migrations%' order by 1`)
      ).rows;
      expect(left).toEqual([]);
      const leftTypes = (await db.query(`select t.typname from pg_type t join pg_namespace s on s.oid = t.typnamespace where s.nspname = 'public' and t.typtype in ('e', 'd', 'c') and t.typname not like 'schema_migrations%' and not exists (select 1 from pg_depend d where d.objid = t.oid and d.deptype = 'e')`)).rows;
      expect(leftTypes).toEqual([]);
      const leftFns = (await db.query(`select p.proname from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')`)).rows; // extensions (pg_trgm) stay installed
      expect(leftFns).toEqual([]);
      expect((await db.query('select count(*)::int n from schema_migrations')).rows[0].n).toBe(0);

      await cli(url, 'migrate', 'up');
      expect((await db.query('select count(*)::int n from schema_migrations')).rows[0].n).toBe(n);
      expect(await schema(url)).toBe(first);
    } finally {
      await db.end();
    }
  });
});
