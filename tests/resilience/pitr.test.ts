import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { startServer, setupOrg, Api, OWNER, expectStatus, type TestServer } from '../support/harness.js';
import { openClient } from '../support/collab.js';
import { REPO_ROOT } from '../support/process-server.js';

// Point-in-time recovery drill (R-BACKUP-011, R-BACKUP-008, V17-F05, R-BACKUP-001): the application runs on a scratch
// PostgreSQL 16 cluster with continuous WAL archiving (scripts/backup/wal-archive.sh) and 5-minute object syncs
// (backup.sh --objects-only). After a "disaster" (trashed page, corrupted edit), the database is recovered to the
// moment before it from base backup + archived WAL (scripts/backup/pitr-drill.sh), the objects it references are
// materialised from the pool (restore-objects.sh), and a server on the recovered data is checked through the API.

const run = promisify(execFile);
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const textOf = (content: any) => content.content.map((b: any) => (b.content ?? []).map((t: any) => t.text ?? '').join('')).join('\n');

/** PostgreSQL server binaries are needed for a scratch cluster; without them the drill is skipped (and says so). */
function serverBinariesAvailable(): boolean {
  const dirs = [process.env.PG_BIN, '/usr/lib/postgresql/16/bin'];
  try {
    dirs.push(execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim());
  } catch {
    /* no pg_config */
  }
  return dirs.some((d) => d && existsSync(join(d, 'initdb')) && existsSync(join(d, 'pg_ctl')));
}
const available = serverBinariesAvailable();

let dir = '';
let primary: TestServer | null = null;
let recovered: TestServer | null = null;

async function script(name: string, args: string[], env: Record<string, string> = {}) {
  const r = await run('bash', [join(REPO_ROOT, 'scripts/backup', name), ...args], { env: { ...process.env, ...env }, maxBuffer: 16 * 1024 * 1024, timeout: 170_000 });
  return r.stdout.trim().split('\n').pop() ?? '';
}
const drill = async (cmd: string, ...args: string[]) => JSON.parse(await script('pitr-drill.sh', [cmd, '--dir', dir, ...args]));

beforeAll(async () => {
  if (!available) return;
  // Under /tmp: the scratch cluster may run as another OS user ("postgres" when the tests run as root).
  dir = await mkdtemp(join(tmpdir(), 'kb-pitr-'));
});

afterAll(async () => {
  await recovered?.close().catch(() => undefined);
  await primary?.close().catch(() => undefined);
  if (dir) {
    await drill('destroy').catch(() => undefined);
    await rm(dir, { recursive: true, force: true });
  }
});

describe.skipIf(!available)('point-in-time recovery drill (R-BACKUP-011, R-BACKUP-008, V17-F05)', () => {
  it('recovers database and files to the moment before the incident; later damage is absent, earlier data, files, ACL and audit intact (R-BACKUP-011, R-BACKUP-008, V17-F05, R-BACKUP-001, R-BACKUP-010, R-BACKUP-018, SC-30)', async () => {
    const init = await drill('init');
    const objects = join(dir, 'objects');
    const pool = join(dir, 'backups');
    const sync = () => script('backup.sh', ['--objects-only'], { BACKUP_DIR: pool, STORAGE_ROOT: objects, DATABASE_URL: init.url });

    primary = await startServer({ databaseUrl: init.url, storage: { driver: 'fs', root: objects } });
    const org = await setupOrg(primary);
    const o = org.owner;
    const outsider = await org.user('Посторонний PITR');
    const sp = (await o.post('/api/v1/spaces', { name: 'Закрытое PITR', kind: 'project', visibility: 'private' })).space;
    const a = (await o.post('/api/v1/pages', { spaceId: sp.id, title: 'Страница A' })).page;
    const ca = await openClient(primary.url, o, a.id);
    ca.insert(0, 0, 'Создано до базовой копии.');
    await ca.waitSaved();
    ca.close();
    const fileA = randomBytes(40_000);
    const fdA = new FormData();
    fdA.append('pageId', a.id);
    fdA.append('file', new Blob([fileA]), 'a.bin');
    const attA = (await o.req('POST', '/api/v1/attachments', fdA)).attachments[0];
    await sync();
    const base = await drill('basebackup');

    // After the base backup: only the WAL archive and the object syncs carry these changes.
    const b = (await o.post('/api/v1/pages', { spaceId: sp.id, title: 'Страница B' })).page;
    const cb = await openClient(primary.url, o, b.id);
    cb.insert(0, 0, 'Создано после базовой копии.');
    await cb.waitSaved();
    const fileB = randomBytes(30_000);
    const fdB = new FormData();
    fdB.append('pageId', b.id);
    fdB.append('file', new Blob([fileB]), 'b.bin');
    const attB = (await o.req('POST', '/api/v1/attachments', fdB)).attachments[0];
    await sync();

    await new Promise((r) => setTimeout(r, 1100));
    const target = (await primary.db.query('select clock_timestamp()::text t')).rows[0].t as string;
    await new Promise((r) => setTimeout(r, 1100));

    // The incident: a page is trashed, another is damaged, a new page appears.
    await o.del(`/api/v1/pages/${a.id}`);
    cb.insert(0, 'Создано после базовой копии.'.length, ' ПОРЧА');
    await cb.waitSaved();
    cb.close();
    const c = (await o.post('/api/v1/pages', { spaceId: sp.id, title: 'Страница C (после инцидента)' })).page;
    await sync();
    const sw = await drill('switch');
    expect(sw.failed).toBe(0);
    await primary.close(); // the primary is "lost"
    primary = null;

    // Recovery: base backup + WAL up to the target time, then the files that database references.
    const t0 = Date.now();
    const rec = await drill('recover', '--target-time', target);
    expect(rec.stop).toMatch(/recovery stopping before/);
    const restoredObjects = join(dir, 'restored-objects');
    await script('restore-objects.sh', ['--db', rec.url, '--pool', join(pool, 'objects'), '--target', restoredObjects]);
    recovered = await startServer({ databaseUrl: rec.url, storage: { driver: 'fs', root: restoredObjects } });
    const rto = Date.now() - t0;

    const ro = new Api(recovered.url);
    await ro.login(OWNER.email, OWNER.password);
    const ra = await ro.get(`/api/v1/pages/${a.id}`);
    expect(ra.page.deletedAt ?? ra.page.deleted_at ?? null).toBeNull(); // the trashing happened after T
    expect(textOf((await ro.get(`/api/v1/pages/${a.id}/content`)).content)).toBe('Создано до базовой копии.');
    expect(textOf((await ro.get(`/api/v1/pages/${b.id}/content`)).content)).toBe('Создано после базовой копии.'); // no damage
    await expectStatus(ro.get(`/api/v1/pages/${c.id}`), 404); // created after T
    for (const [att, bytes] of [
      [attA, fileA],
      [attB, fileB],
    ] as const) {
      const dl = await ro.raw('GET', `/api/v1/attachments/${att.id}/download`);
      expect(dl.status).toBe(200);
      expect(sha(Buffer.from(await dl.arrayBuffer()))).toBe(sha(bytes));
    }
    const rout = new Api(recovered.url);
    await rout.login(outsider.email, outsider.password);
    await expectStatus(rout.get(`/api/v1/pages/${a.id}`), 404);
    const audit = await ro.get('/api/v1/audit/verify');
    expect(audit.ok).toBe(true);
    console.log(`[pitr] base backup ${base.ms} ms (${base.bytes} B), WAL switch ${sw.ms} ms, recovery ${rec.ms} ms, total RTO to serving API ${rto} ms; ${rec.stop}`);
  });
});

describe.skipIf(available)('point-in-time recovery drill — skipped', () => {
  it('PostgreSQL server binaries are not installed: run scripts/backup/pitr-drill.sh manually (see wal-archive.md)', () => {
    expect(available).toBe(false);
  });
});
