import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile, chmod, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import pg from 'pg';
import { setupOrg, Api, OWNER, expectStatus, type TestServer } from '../support/harness.js';
import { openClient } from '../support/collab.js';
import { REPO_ROOT, spawnServer, type ProcessServer } from '../support/process-server.js';

// Disaster-recovery drill with measured RPO/RTO (R-BACKUP-001, R-BACKUP-006, R-BACKUP-007, R-BACKUP-010, R-BACKUP-018,
// R-BACKUP-019, V18-A25, R-BACKUP-008, R-BACKUP-012, R-BACKUP-003). Also run on demand as `npm run restore:drill`, which
// writes the protocol to docs/drills/ (DR_DRILL_REPORT_DIR) — the release gate requires a fresh passing one (R-BACKUP-002).
//
// Production-shaped setup on throw-away PostgreSQL 16 clusters (initdb, own port and data directory):
//   - the application (real server process) on a primary with continuous WAL archiving, archive_timeout = 60 s
//     (DR_ARCHIVE_TIMEOUT), every segment encrypted with age (X25519 + ChaCha20-Poly1305) by wal-archive.sh;
//   - the database host holds only the age PUBLIC key; the private key lives in a separate "vault" directory and is used
//     only by the restore (keys separate from data);
//   - verified, encrypted base backup (basebackup.sh), encrypted content-addressed object pool (backup.sh --objects-only)
//     and an add-only, checksum-verified copy to a second medium (offsite-sync.sh) every DR_SYNC_INTERVAL seconds.
// Incident + disaster: a page is trashed and another damaged (incident at time T), the users keep working, then the
// whole site is lost — primary data directory, live object store AND the local backup repository are deleted.
// Recovery, both from the second-medium copy only, each into a NEW independent cluster:
//   1. to the end of the archived WAL (disaster): RTO = crash → API serving / → verified; RPO = crash → newest
//      recovered confirmed write (database) and → newest recovered confirmed file upload (objects);
//   2. to T (point in time before the incident): row counts of the 24 manifest tables equal the primary's at T, the incident is
//      absent, exports equal the exports taken before the backup / at T, file bytes (sha256), ACL, audit chain, documents.

const run = promisify(execFile);
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const textOf = (content: any) => content.content.map((b: any) => (b.content ?? []).map((t: any) => t.text ?? '').join('')).join('\n');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ARCHIVE_TIMEOUT_S = Number(process.env.DR_ARCHIVE_TIMEOUT ?? 60);
const SYNC_INTERVAL_S = Number(process.env.DR_SYNC_INTERVAL ?? 30);
const WRITE_S = Number(process.env.DR_WRITE_SECONDS ?? ARCHIVE_TIMEOUT_S + 20);
const BULK_MB = Number(process.env.DR_BULK_MB ?? 0); // extra attachment volume (4 MB files) for RTO at a larger scale
const BULK_PAGES = Number(process.env.DR_BULK_PAGES ?? 0); // extra pages with text
const TARGET_RPO_S = 300;
const TARGET_RTO_S = 3600; // strictest RTO in the specification (R-BACKUP-007: 60 min); 2 h elsewhere
const REPORT_DIR = process.env.DR_DRILL_REPORT_DIR ? resolve(REPO_ROOT, process.env.DR_DRILL_REPORT_DIR) : '';

function have(cmd: string) {
  try {
    execFileSync('bash', ['-c', `command -v ${cmd}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
function serverBinariesAvailable(): boolean {
  const dirs = [process.env.PG_BIN, '/usr/lib/postgresql/16/bin'];
  try {
    dirs.push(execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim());
  } catch {
    /* no pg_config */
  }
  return dirs.some((d) => d && existsSync(join(d, 'initdb')) && existsSync(join(d, 'pg_verifybackup')));
}
const available = serverBinariesAvailable() && have('age') && have('age-keygen') && have('pg_basebackup');
const COUNT_TABLES = /COUNT_TABLES=\(([^)]*)\)/.exec(readFileSync(join(REPO_ROOT, 'scripts/backup/lib.sh'), 'utf8'))![1].trim().split(/\s+/);

let dir = '';
const servers: ProcessServer[] = [];
const pools: pg.Pool[] = [];
const clusters: string[] = [];

async function sh(name: string, args: string[], env: Record<string, string> = {}, timeout = 600_000) {
  const t = Date.now();
  const r = await run('bash', [join(REPO_ROOT, 'scripts/backup', name), ...args], { env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024, timeout });
  const last = r.stdout.trim().split('\n').pop() ?? '';
  return { out: last, stderr: r.stderr, ms: Date.now() - t };
}
const json = (s: string) => JSON.parse(s);
function pool(url: string) {
  const p = new pg.Pool({ connectionString: url, max: 2 });
  p.on('error', () => undefined);
  pools.push(p);
  return p;
}
async function counts(p: pg.Pool) {
  const sql = 'select ' + COUNT_TABLES.map((t) => `(select count(*) from ${t})::int as ${t}`).join(', ');
  return (await p.query(sql)).rows[0] as Record<string, number>;
}
async function cli(dbUrl: string, ...args: string[]) {
  const r = await run(process.execPath, ['--import', 'tsx', '--conditions=development', 'apps/server/src/cli.ts', ...args], { cwd: REPO_ROOT, env: { ...process.env, DATABASE_URL: dbUrl }, maxBuffer: 16 * 1024 * 1024 });
  return r.stdout;
}
async function checkDocs(dbUrl: string) {
  const r = await run(process.execPath, [join(REPO_ROOT, 'scripts/backup/check-docs.mjs'), dbUrl], { cwd: REPO_ROOT, maxBuffer: 16 * 1024 * 1024 });
  return JSON.parse(r.stdout);
}
async function exportMd(api: Api, pageId: string) {
  const r = await api.raw('GET', `/api/v1/pages/${pageId}/export?format=md`);
  expect(r.status).toBe(200);
  return Buffer.from(await r.arrayBuffer()).toString('utf8'); // compared as text: a mismatch shows the diff
}
async function upload(api: Api, pageId: string, bytes: Buffer, name: string) {
  const fd = new FormData();
  fd.append('pageId', pageId);
  fd.append('file', new Blob([bytes]), name);
  return (await api.req('POST', '/api/v1/attachments', fd)).attachments[0];
}
async function downloadSha(api: Api, attId: string) {
  const r = await api.raw('GET', `/api/v1/attachments/${attId}/download`);
  return r.status === 200 ? sha(Buffer.from(await r.arrayBuffer())) : `HTTP ${r.status}`;
}

beforeAll(async () => {
  if (!available) return;
  dir = await mkdtemp(join(tmpdir(), 'kb-dr-')); // under /tmp: the clusters run as the "postgres" OS user when tests run as root
  await chmod(dir, 0o755);
});

afterAll(async () => {
  for (const s of servers) await s.stop().catch(() => undefined);
  for (const p of pools) await p.end().catch(() => undefined);
  // Only the clusters this drill started (by data directory), never anything else on the host.
  const runas = process.getuid?.() === 0 ? 'runuser -u postgres -- ' : '';
  for (const c of clusters) await run('bash', ['-c', `${runas}"$(pg_config --bindir 2>/dev/null || echo /usr/lib/postgresql/16/bin)/pg_ctl" -D "${c}" -m immediate stop`]).catch(() => undefined);
  if (dir) {
    await sh('pitr-drill.sh', ['destroy', '--dir', join(dir, 'site')]).catch(() => undefined);
    await run('chmod', ['-R', 'u+w', dir]).catch(() => undefined);
    await rm(dir, { recursive: true, force: true });
  }
});

describe.skipIf(!available)('disaster-recovery drill with measured RPO/RTO on independent clusters (R-BACKUP-001, V18-A25)', () => {
  it(
    'whole site lost: restored from the encrypted second-medium copy into a new cluster — RPO ≤ 5 min, RTO ≤ 60 min; PITR to the moment before the incident reproduces counts, exports, files, ACL and audit chain (R-BACKUP-001, R-BACKUP-006, R-BACKUP-007, R-BACKUP-010, R-BACKUP-018, R-BACKUP-019, V18-A25, R-BACKUP-008, R-BACKUP-012, R-BACKUP-003)',
    async () => {
      const started = new Date();
      const site = join(dir, 'site'); // the primary site: database cluster, live objects, local backup repository
      const vault = join(dir, 'vault'); // key custody, NOT on the site
      const offsite = join(dir, 'second-medium');
      const repo = join(site, 'repo');
      const live = join(site, 'live-objects');
      await mkdir(vault, { recursive: true });
      await mkdir(offsite, { recursive: true });

      // ---------------------------------------------------------------- primary with encrypted continuous WAL archiving
      const init = json((await sh('pitr-drill.sh', ['init', '--dir', site])).out);
      const keyFile = join(vault, 'kb-backup.key');
      execFileSync('age-keygen', ['-o', keyFile], { stdio: 'ignore' });
      const recipients = join(site, 'kb-backup.pub'); // the only key material on the site
      await writeFile(recipients, execFileSync('age-keygen', ['-y', keyFile], { encoding: 'utf8' }));
      await mkdir(join(repo, 'wal'), { recursive: true });
      const archiveWrapper = join(site, 'bin', 'archive-wal.sh');
      await writeFile(archiveWrapper, `#!/usr/bin/env bash\nexport WAL_ARCHIVE_DIR=${join(repo, 'wal')} WAL_ENCRYPT_CMD='age -R ${recipients}'\nexec bash ${join(site, 'bin', 'wal-archive.sh')} "$@"\n`);
      await chmod(archiveWrapper, 0o755);
      if (process.getuid?.() === 0) {
        execFileSync('chown', ['-R', 'postgres:', repo, recipients, archiveWrapper, keyFile]); // the restore_command (postgres) decrypts
        execFileSync('chmod', ['0711', vault]);
      }
      const primaryDb = pool(init.url);
      await primaryDb.query(`alter system set archive_command = '${archiveWrapper} %p %f'`);
      await primaryDb.query(`alter system set archive_timeout = '${ARCHIVE_TIMEOUT_S}s'`);
      await primaryDb.query('select pg_reload_conf()');
      const enc = { BACKUP_ENCRYPT_CMD: `age -R ${recipients}` };
      const dec = { BACKUP_DECRYPT_CMD: `age -d -i ${keyFile}`, WAL_DECRYPT_CMD: `age -d -i ${keyFile}` };

      const app = await spawnServer({ dbUrl: init.url, storageRoot: live, dataDir: join(site, 'app-data') });
      servers.push(app);
      const org = await setupOrg({ url: app.url } as TestServer);
      const o = org.owner;
      const dept = (await o.post('/api/v1/admin/groups', { name: 'Эксплуатация ДЦ', kind: 'department' })).group.id;
      const editor = await org.user('Редактор Аварии', { groupIds: [dept] });
      const outsider = await org.user('Посторонний Аварии');
      const sp = (await o.post('/api/v1/spaces', { name: 'Регламенты аварий', kind: 'department', visibility: 'private', groups: [{ groupId: dept, level: 'edit' }] })).space;
      const a = (await o.post('/api/v1/pages', { spaceId: sp.id, title: 'Регламент A' })).page;
      const ca = await openClient(app.url, o, a.id);
      ca.insert(0, 0, 'Написано до базовой копии: порядок действий при аварии.');
      await ca.waitSaved();
      ca.close();
      const fileA = randomBytes(300_000);
      const attA = await upload(o, a.id, fileA, 'схема-A.bin');
      const revA = (await o.post(`/api/v1/pages/${a.id}/revisions`, { label: 'До базовой копии' })).revision;
      const bulk: Array<{ id: string; sha: string }> = [];
      for (let i = 0; i < BULK_MB / 4; i++) {
        const bytes = randomBytes(4 * 1024 * 1024);
        bulk.push({ id: (await upload(o, a.id, bytes, `bulk-${i}.bin`)).id, sha: sha(bytes) });
      }
      for (let i = 0; i < BULK_PAGES; i++) {
        const pg1 = (await o.post('/api/v1/pages', { spaceId: sp.id, parentId: a.id, title: `Раздел ${i}` })).page;
        const c = await openClient(app.url, o, pg1.id);
        c.insert(0, 0, `Текст раздела ${i}: ` + 'регламент восстановления '.repeat(40));
        await c.waitSaved();
        c.close();
      }

      const syncs: Array<{ startedAt: number; finishedAt: number; objectsMs: number; offsiteMs: number; copied: number }> = [];
      const syncOnce = async () => {
        const startedAt = Date.now();
        const ob = await sh('backup.sh', ['--objects-only'], { BACKUP_DIR: repo, STORAGE_ROOT: live, ...enc });
        const off = await sh('offsite-sync.sh', ['--target', offsite], { BACKUP_DIR: repo, WAL_ARCHIVE_DIR: join(repo, 'wal') });
        syncs.push({ startedAt, finishedAt: Date.now(), objectsMs: ob.ms, offsiteMs: off.ms, copied: json(off.out).copied });
      };

      await sh('backup.sh', ['--objects-only'], { BACKUP_DIR: repo, STORAGE_ROOT: live, ...enc });
      const exportABeforeBackup = await exportMd(o, a.id);
      const base = await sh('basebackup.sh', [], { BASEBACKUP_URL: init.url, BACKUP_DIR: repo, WAL_ARCHIVE_DIR: join(repo, 'wal'), ...enc });
      const baseManifest = JSON.parse(await readFile(join(base.out, 'manifest.json'), 'utf8'));
      expect(baseManifest.encryption.enabled).toBe(true);
      expect(baseManifest.verified.ok).toBe(true);

      // ---------------------------------------------------------------- after the base backup: only WAL + object syncs carry this
      const b = (await o.post('/api/v1/pages', { spaceId: sp.id, title: 'Регламент B' })).page;
      const cb = await openClient(app.url, o, b.id);
      cb.insert(0, 0, 'Написано после базовой копии.');
      await cb.waitSaved();
      const fileB = randomBytes(120_000);
      const attB = await upload(o, b.id, fileB, 'схема-B.bin');
      await syncOnce();

      // ---------------------------------------------------------------- reference point T (quiescent): exports, row counts
      // Accepted only when nothing changed across the exports (apart from their own audit rows) and around T.
      cb.close();
      const fingerprint = async () => ({ ...(await counts(primaryDb)), ...(await primaryDb.query(`select (select max(updated_at)::text from pages) p, (select coalesce(sum(last_seq), 0)::text from doc_state) d`)).rows[0] });
      const noAudit = (f: Record<string, unknown>) => JSON.stringify({ ...f, audit_events: 0 });
      let refCounts: Record<string, number> = {};
      let target = '';
      let exportAAtT = '';
      let exportBAtT = '';
      for (let i = 0; i < 30 && !target; i++) {
        const f0 = await fingerprint();
        exportAAtT = await exportMd(o, a.id);
        exportBAtT = await exportMd(o, b.id);
        const f1 = await fingerprint();
        await sleep(1100);
        const t = (await primaryDb.query('select clock_timestamp()::text t')).rows[0].t;
        await sleep(1100);
        const f2 = await fingerprint();
        if (noAudit(f0) === noAudit(f1) && JSON.stringify(f1) === JSON.stringify(f2)) {
          target = t;
          refCounts = await counts(primaryDb);
        }
      }
      expect(target, 'the primary never became quiescent').not.toBe('');

      // ---------------------------------------------------------------- the incident, then users keep working
      await o.del(`/api/v1/pages/${a.id}`);
      const cbDamage = await openClient(app.url, o, b.id);
      cbDamage.insert(0, 'Написано после базовой копии.'.length, ' ПОРЧА');
      await cbDamage.waitSaved();
      cbDamage.close();

      const writes: Array<{ n: number; at: number }> = [];
      const uploads: Array<{ id: string; sha: string; at: number }> = [];
      let stop = false;
      const writer = (async () => {
        let n = 0;
        let lastUpload = 0;
        while (!stop) {
          await o.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: `rpo-${n}` });
          writes.push({ n, at: Date.now() });
          n++;
          if (Date.now() - lastUpload > 3000) {
            const bytes = randomBytes(20_000);
            const att = await upload(o, b.id, bytes, `rpo-${n}.bin`);
            uploads.push({ id: att.id, sha: sha(bytes), at: Date.now() });
            lastUpload = Date.now();
          }
          await sleep(150);
        }
      })();
      const syncer = (async () => {
        while (!stop) {
          const next = Date.now() + SYNC_INTERVAL_S * 1000;
          await syncOnce();
          while (!stop && Date.now() < next) await sleep(200);
        }
      })();
      await sleep(WRITE_S * 1000);

      // ---------------------------------------------------------------- disaster: the whole site is lost
      stop = true;
      await writer;
      await syncer; // (a sync in flight is let finish so no process writes into deleted directories)
      const crashAt = Date.now();
      await app.crash();
      servers.splice(servers.indexOf(app), 1);
      await sh('pitr-drill.sh', ['stop', '--dir', site]);
      await primaryDb.end().catch(() => undefined);
      pools.splice(pools.indexOf(primaryDb), 1);
      await rm(site, { recursive: true, force: true });
      expect(existsSync(repo) || existsSync(live)).toBe(false);

      // ---------------------------------------------------------------- recovery 1: to the end of the archive, from the second medium
      const t0 = Date.now();
      execFileSync('chmod', ['-R', 'a+rX', offsite]); // fetch from the second medium: readable for the restore user
      const rec = json((await sh('pitr-restore.sh', ['--base-root', join(offsite, 'base'), '--wal', join(offsite, 'wal'), '--pgdata', join(dir, 'restore-latest', 'pgdata'), '--latest'], dec)).out);
      clusters.push(rec.pgdata);
      const tDb = Date.now();
      const objReport = join(dir, 'restore-latest', 'objects.json');
      await sh('restore-objects.sh', ['--db', rec.url, '--pool', join(offsite, 'objects'), '--target', join(dir, 'restore-latest', 'objects'), '--allow-missing', '--report', objReport], dec);
      const tObj = Date.now();
      const restored = await spawnServer({ dbUrl: rec.url, storageRoot: join(dir, 'restore-latest', 'objects'), dataDir: join(dir, 'restore-latest', 'app-data') });
      servers.push(restored);
      const tServing = Date.now();

      const recDb = pool(rec.url);
      const present = new Set<number>((await recDb.query(`select title from pages where title like 'rpo-%'`)).rows.map((r) => Number(r.title.slice(4))));
      const maxPresent = Math.max(-1, ...present);
      for (let n = 0; n <= maxPresent; n++) expect(present.has(n), `confirmed write rpo-${n} missing below the recovery point (gap)`).toBe(true);
      const lastRecovered = writes.find((w) => w.n === maxPresent);
      const lostWrites = writes.filter((w) => w.n > maxPresent).length;
      const rpoDbS = (crashAt - (lastRecovered?.at ?? crashAt)) / 1000;

      const objectsResult = JSON.parse(await readFile(objReport, 'utf8'));
      const ro = new Api(restored.url);
      await ro.login(OWNER.email, OWNER.password);
      const restoredUploads: typeof uploads = [];
      const lostUploads: typeof uploads = [];
      const lastSyncStart = Math.max(...syncs.map((s) => s.startedAt));
      for (const u of uploads) {
        const inDb = (await recDb.query('select 1 from attachments where id = $1', [u.id])).rowCount === 1;
        const got = inDb ? await downloadSha(ro, u.id) : 'not in db';
        if (got === u.sha) restoredUploads.push(u);
        else {
          lostUploads.push(u);
          // Lost with its database row: commits replay in order, so it must be newer than the newest recovered write.
          if (!inDb) expect(u.at, `upload ${u.id} older than the recovery point but absent`).toBeGreaterThan(lastRecovered?.at ?? 0);
          // Row recovered, bytes not: allowed only for uploads confirmed after the start of the last object sync.
          else expect(u.at, `upload ${u.id} confirmed before the last sync but its file was not restored (${got})`).toBeGreaterThan(lastSyncStart - 1000);
        }
      }
      const rpoFilesS = (crashAt - Math.max(0, ...restoredUploads.map((u) => u.at))) / 1000;
      // A is in the trash here (the incident was replayed), so its file is checked in the restored store, B through the API.
      const keyA = (await recDb.query('select b.storage_key from attachment_versions v join blobs b on b.sha256 = v.blob_sha256 where v.attachment_id = $1', [attA.id])).rows[0].storage_key;
      expect(sha(await readFile(join(dir, 'restore-latest', 'objects', keyA)))).toBe(sha(fileA));
      expect(await downloadSha(ro, attB.id)).toBe(sha(fileB));
      expect((await recDb.query('select deleted_at from pages where id = $1', [a.id])).rows[0].deleted_at).not.toBeNull(); // the incident happened before the crash
      expect(await cli(rec.url, 'audit-verify')).toMatch(/ok: true/);
      const docsLatest = await checkDocs(rec.url);
      expect(docsLatest.ok, JSON.stringify(docsLatest.problems)).toBe(true);
      const tVerified = Date.now();
      const rtoServingS = (tServing - crashAt) / 1000;
      const rtoVerifiedS = (tVerified - crashAt) / 1000;
      expect(rpoDbS).toBeLessThanOrEqual(TARGET_RPO_S);
      expect(rpoFilesS).toBeLessThanOrEqual(TARGET_RPO_S);
      expect(rtoVerifiedS).toBeLessThanOrEqual(TARGET_RTO_S);
      await restored.stop();
      servers.splice(servers.indexOf(restored), 1);

      // ---------------------------------------------------------------- recovery 2: point in time T (before the incident)
      const p0 = Date.now();
      const pitr = json((await sh('pitr-restore.sh', ['--base-root', join(offsite, 'base'), '--wal', join(offsite, 'wal'), '--pgdata', join(dir, 'restore-pitr', 'pgdata'), '--target-time', target], dec)).out);
      clusters.push(pitr.pgdata);
      expect(pitr.stop).toMatch(/recovery stopping before/);
      const pitrDb = pool(pitr.url);
      const pitrCounts = await counts(pitrDb); // before anything (the server, a login) writes to it
      expect(pitrCounts).toEqual(refCounts);
      await sh('restore-objects.sh', ['--db', pitr.url, '--pool', join(offsite, 'objects'), '--target', join(dir, 'restore-pitr', 'objects')], dec); // strict: every file before T
      expect(await cli(pitr.url, 'audit-verify')).toMatch(/ok: true/);
      const docsPitr = await checkDocs(pitr.url);
      expect(docsPitr.ok, JSON.stringify(docsPitr.problems)).toBe(true);
      const ps = await spawnServer({ dbUrl: pitr.url, storageRoot: join(dir, 'restore-pitr', 'objects'), dataDir: join(dir, 'restore-pitr', 'app-data') });
      servers.push(ps);
      const pitrServingS = (Date.now() - p0) / 1000;
      const po = new Api(ps.url);
      await po.login(OWNER.email, OWNER.password);
      const pa = await po.get(`/api/v1/pages/${a.id}`);
      expect(pa.page.deletedAt ?? pa.page.deleted_at ?? null).toBeNull();
      expect(textOf((await po.get(`/api/v1/pages/${b.id}/content`)).content)).toBe('Написано после базовой копии.');
      const exportAAfter = await exportMd(po, a.id);
      expect(exportAAfter).toBe(exportAAtT);
      expect(exportAAfter).toBe(exportABeforeBackup);
      expect(await exportMd(po, b.id)).toBe(exportBAtT);
      expect(await downloadSha(po, attA.id)).toBe(sha(fileA));
      expect(await downloadSha(po, attB.id)).toBe(sha(fileB));
      for (const f of bulk) expect(await downloadSha(po, f.id)).toBe(f.sha);
      expect((await po.get(`/api/v1/pages/${a.id}/revisions`)).revisions.map((r: any) => r.id)).toContain(revA.id);
      expect((await pitrDb.query(`select count(*)::int c from pages where title like 'rpo-%'`)).rows[0].c).toBe(0);
      const pe = new Api(ps.url);
      await pe.login(editor.email, editor.password);
      expect((await pe.get(`/api/v1/pages/${a.id}`)).page.id).toBe(a.id);
      const pout = new Api(ps.url);
      await pout.login(outsider.email, outsider.password);
      await expectStatus(pout.get(`/api/v1/pages/${a.id}`), 404);
      await expectStatus(pout.get(`/api/v1/attachments/${attA.id}/download`), 404);

      // ---------------------------------------------------------------- the scheduled PITR restore test on the same copy
      const vp = json((await sh('verify-pitr.sh', ['--repo', offsite], { ...dec, BACKUP_METRICS_FILE: join(dir, 'metrics', 'kb_backup.prom') })).out);
      expect(vp.ok).toBe(true);
      expect(readFileSync(join(dir, 'metrics', 'kb_backup-pitr-verify.prom'), 'utf8')).toMatch(/^kb_pitr_verify_last_success_timestamp_seconds \d+$/m);

      // ---------------------------------------------------------------- protocol
      const report = {
        format: 'kb-dr-drill/1',
        ok: true,
        startedAt: started.toISOString(),
        finishedAt: new Date().toISOString(),
        host: execFileSync('hostname', { encoding: 'utf8' }).trim(),
        postgres: (await pitrDb.query('select version() v')).rows[0].v,
        config: { archiveTimeoutS: ARCHIVE_TIMEOUT_S, syncIntervalS: SYNC_INTERVAL_S, writeSeconds: WRITE_S, encryption: 'age (X25519, ChaCha20-Poly1305); private key outside the site', restoreSource: 'second medium only (site, live objects and local repository deleted)' },
        targets: { rpoS: TARGET_RPO_S, rtoS: TARGET_RTO_S },
        // Worst case for this configuration: a WAL segment closed by archive_timeout just misses a sync, plus the sync itself.
        rpoBoundS: ARCHIVE_TIMEOUT_S + SYNC_INTERVAL_S + Math.ceil(Math.max(...syncs.map((x) => x.finishedAt - x.startedAt)) / 1000),
        dataset: { bulkMb: BULK_MB, bulkPages: BULK_PAGES, confirmedWrites: writes.length, uploads: uploads.length, blobsInRecoveredDb: objectsResult.blobs, baseBackupBytes: baseManifest.sizeBytes, baseBackupDataDirBytes: baseManifest.dataDirBytes, syncRuns: syncs.length },
        baseBackup: { ms: base.ms, durationsMs: baseManifest.durationsMs, startSegment: baseManifest.wal.startSegment },
        disaster: {
          rpo: { databaseS: rpoDbS, filesS: rpoFilesS, lostConfirmedWrites: lostWrites, lostUploads: lostUploads.length, lostUploadsWithDbRow: lostUploads.filter((u) => u.at <= (lastRecovered?.at ?? 0)).length, missingBlobKeys: objectsResult.missingBlobs.length, gapsBelowRecoveryPoint: 0 },
          rto: { servingS: rtoServingS, verifiedS: rtoVerifiedS },
          stepsMs: { restoreDatabase: tDb - t0, restoreScript: rec.stepsMs, restoreObjects: tObj - tDb, startServer: tServing - tObj, verify: tVerified - tServing },
          lastReplayedTransaction: rec.lastReplayedTransaction,
          checks: ['no gaps among confirmed writes', 'attachment bytes sha256 via API', 'lost files only after the last sync', 'audit hash chain (cli audit-verify)', 'documents decode (check-docs.mjs)'],
        },
        pitr: {
          target,
          stop: pitr.stop,
          servingS: pitrServingS,
          stepsMs: pitr.stepsMs,
          checks: ['row counts of ' + COUNT_TABLES.length + ' tables equal the primary at T', 'incident absent (page not trashed, no damage, no later pages)', 'Markdown export of A equals export before the backup and at T; B equals at T', 'attachments sha256', 'revision present', 'ACL: editor sees, outsider 404 (page and file)', 'audit hash chain', 'documents decode'],
        },
        verifyPitr: { ms: vp.ms, documents: vp.documents, objects: vp.objects },
        notes: 'Unconfirmed local edits are client-side (IndexedDB queue) and are re-sent after the restore; they are not part of any server backup (see docs/BACKUP_RESTORE.md §8).',
      };
      console.log(`[dr-drill] RPO db ${rpoDbS.toFixed(1)} s (lost ${lostWrites}/${writes.length} writes), files ${rpoFilesS.toFixed(1)} s (lost ${lostUploads.length}/${uploads.length}); RTO serving ${rtoServingS.toFixed(1)} s, verified ${rtoVerifiedS.toFixed(1)} s; PITR serving ${pitrServingS.toFixed(1)} s`);
      if (REPORT_DIR) {
        await mkdir(REPORT_DIR, { recursive: true });
        const stamp = started.toISOString().replace(/[-:]/g, '').replace(/\..*/, 'Z');
        const body = JSON.stringify(report, null, 2) + '\n';
        await writeFile(join(REPORT_DIR, `dr-drill-${stamp}.json`), body);
        await writeFile(join(REPORT_DIR, 'latest.json'), body);
        const md = [
          `# Протокол учения по восстановлению (${report.startedAt})`,
          '',
          'Сгенерировано `npm run restore:drill` (tests/resilience/dr-drill.test.ts). Не редактируйте вручную.',
          '',
          `Источник восстановления: ${report.config.restoreSource}. Шифрование: ${report.config.encryption}. archive_timeout = ${ARCHIVE_TIMEOUT_S} с, синхронизация объектов и второй копии каждые ${SYNC_INTERVAL_S} с.`,
          '',
          '| Показатель | Цель | Измерено |',
          '|---|---|---|',
          `| RPO, база данных | ≤ ${TARGET_RPO_S} с | **${rpoDbS.toFixed(1)} с** (потеряно ${lostWrites} из ${writes.length} подтверждённых записей, пропусков нет) |`,
          `| RPO, файлы | ≤ ${TARGET_RPO_S} с | **${rpoFilesS.toFixed(1)} с** (потеряно ${lostUploads.length} из ${uploads.length} загрузок) |`,
          `| RTO до работающего API | ≤ ${TARGET_RTO_S} с | **${rtoServingS.toFixed(1)} с** |`,
          `| RTO с проверками целостности | ≤ ${TARGET_RTO_S} с | **${rtoVerifiedS.toFixed(1)} с** |`,
          `| Граница RPO для этой конфигурации | — | ${report.rpoBoundS} с (archive_timeout + интервал копирования + длительность копирования) |`,
          `| PITR на момент T до API | — | ${pitrServingS.toFixed(1)} с (${pitr.stop}) |`,
          '',
          `Базовая копия: ${baseManifest.dataDirBytes} Б данных → ${baseManifest.sizeBytes} Б (зашифровано), ${base.ms} мс. Шаги восстановления, мс: ${JSON.stringify(report.disaster.stepsMs)}.`,
          '',
          'Проверки (аварийное восстановление): ' + report.disaster.checks.join('; ') + '.',
          '',
          'Проверки (PITR): ' + report.pitr.checks.join('; ') + '.',
          '',
          report.notes,
          '',
        ].join('\n');
        await writeFile(join(REPORT_DIR, 'LATEST.md'), md);
      }
    },
    900_000,
  );
});

describe.skipIf(available)('disaster-recovery drill — skipped', () => {
  it('PostgreSQL server binaries (initdb, pg_verifybackup) or age are not installed: install postgresql-16 and age to run the drill (V18-A25)', () => {
    expect(available).toBe(false);
  });
});
