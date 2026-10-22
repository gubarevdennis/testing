import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { inject } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { docToPlainText } from '@kb/shared';
import { startServer, setupOrg, OWNER, type TestServer } from '../support/harness.js';
import { REPO_ROOT } from '../support/process-server.js';
import { replaceContent } from '../../apps/server/src/collab/ydoc.js';
import { blobKey } from '../../apps/server/src/storage/blob-store.js';

// Page/space-level restore from a backup (R-BACKUP-015): backup.sh → restore.sh into a temporary database and
// object directory → `cli restore-pages` previews the impact (diff per page) and brings pages back as new versions
// or recreated pages, never overwriting the live state.

const run = promisify(execFile);
let ts: TestServer;
let org: Awaited<ReturnType<typeof setupOrg>>;
let work: string;
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

beforeAll(async () => {
  work = await mkdtemp(join(tmpdir(), 'kb-partial-'));
  ts = await startServer({}, { worker: true });
  org = await setupOrg(ts);
});
afterAll(async () => {
  await ts?.close();
  await rm(work, { recursive: true, force: true });
});

const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });

describe('partial restore from a backup (R-BACKUP-015)', () => {
  it('space restore from a backup restored into a temporary database: impact preview with per-page diff, then pages come back as new versions or recreated pages with their files, without overwriting live data (R-BACKUP-015, R-BACKUP-019)', async () => {
    const o = org.owner;
    const sp = (await o.post('/api/v1/spaces', { name: 'Склад', kind: 'project', visibility: 'private' })).space;
    const A = (await o.post('/api/v1/pages', { spaceId: sp.id, title: 'Приёмка' })).page;
    const B = (await o.post('/api/v1/pages', { spaceId: sp.id, parentId: A.id, title: 'Схема стеллажей' })).page;
    const C = (await o.post('/api/v1/pages', { spaceId: sp.id, title: 'Инвентаризация' })).page;
    const D = (await o.post('/api/v1/pages', { spaceId: sp.id, title: 'Не менялась' })).page;
    const bytes = Buffer.concat([Buffer.from('стеллажи\n'), randomBytes(50_000)]);
    const fd = new FormData();
    fd.append('pageId', B.id);
    fd.append('file', new Blob([bytes]), 'стеллажи.bin');
    const att = (await o.req('POST', '/api/v1/attachments', fd)).attachments[0];
    const hub = ts.srv.services.hub;
    await hub.applyServerChange(A.id, null, (d) => replaceContent(d, doc('Версия из копии: приёмка по накладной.')));
    await hub.applyServerChange(B.id, null, (d) => replaceContent(d, { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Схема из копии.' }] }, { type: 'fileBlock', attrs: { attachmentId: att.id, name: 'стеллажи.bin', size: bytes.length } }] }));
    await hub.applyServerChange(C.id, null, (d) => replaceContent(d, doc('Инвентаризация раз в квартал.')));
    await hub.applyServerChange(D.id, null, (d) => replaceContent(d, doc('Без изменений.')));

    // ------------------------------------------------ backup → restore into a temporary DB + object directory
    const env = { ...process.env, DATABASE_URL: ts.dbUrl, BACKUP_DIR: join(work, 'backups'), STORAGE_ROOT: ts.srv.cfg.storage.root };
    const b = await run('bash', [join(REPO_ROOT, 'scripts/backup/backup.sh')], { env, timeout: 170_000, maxBuffer: 64 << 20 });
    const backupPath = b.stdout.trim().split('\n').pop()!;
    const runTag = inject('runTag' as never) as string;
    const tmpDb = ts.dbUrl.replace(/\/[^/]*$/, `/kb_t_${runTag}_${process.pid}_partial_${Date.now()}`);
    const tmpObjects = join(work, 'restored-objects');
    await run('bash', [join(REPO_ROOT, 'scripts/backup/restore.sh'), backupPath, '--create', '--target-db', tmpDb, '--target-storage', tmpObjects], { env: process.env, timeout: 170_000, maxBuffer: 64 << 20 });

    // ------------------------------------------------ the incident: live data changed/lost after the backup
    await hub.applyServerChange(A.id, null, (d) => replaceContent(d, doc('Испорчено после копии.')));
    await o.del(`/api/v1/pages/${B.id}`);
    await o.del(`/api/v1/trash/${B.id}`, { confirm: true }); // purged: gone from the live database
    await ts.srv.services.store.remove(blobKey(att.sha256 ?? (await ts.db.query('select blob_sha256 from attachment_versions where attachment_id = $1', [att.id])).rows[0].blob_sha256)); // and its file
    await o.del(`/api/v1/pages/${C.id}`); // in the trash

    const cli = async (args: string[]) => {
      const r = await run(process.execPath, ['--import', 'tsx', '--conditions=development', 'apps/server/src/cli.ts', 'restore-pages', '--source', tmpDb, '--space', sp.id, '--user', OWNER.email, ...args], {
        cwd: REPO_ROOT,
        env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: ts.dbUrl, STORAGE_DRIVER: 'fs', STORAGE_ROOT: ts.srv.cfg.storage.root },
        timeout: 120_000,
        maxBuffer: 64 << 20,
      });
      return JSON.parse(r.stdout);
    };

    // ------------------------------------------------ impact preview (nothing changes)
    const revsBefore = (await ts.db.query('select count(*)::int c from page_revisions')).rows[0].c;
    const preview = await cli([]);
    expect(preview.mode).toBe('preview');
    const status = Object.fromEntries(preview.pages.map((p: any) => [p.title, p.status]));
    expect(status).toEqual({ Приёмка: 'changed', 'Схема стеллажей': 'missing-in-live', Инвентаризация: 'deleted-in-live', 'Не менялась': 'unchanged' });
    expect(preview.pages.find((p: any) => p.title === 'Приёмка').diff.changed + preview.pages.find((p: any) => p.title === 'Приёмка').diff.added).toBeGreaterThan(0);
    expect(preview.pages.find((p: any) => p.title === 'Схема стеллажей').attachments).toEqual({ total: 1, missingInLive: 1 });
    expect(preview.summary).toEqual({ unchanged: 1, changed: 1, 'deleted-in-live': 1, 'missing-in-live': 1 });
    expect((await ts.db.query('select count(*)::int c from page_revisions')).rows[0].c).toBe(revsBefore);

    // ------------------------------------------------ apply
    const applied = await cli(['--apply', '--label', 'копия перед инцидентом', '--source-storage', tmpObjects]);
    expect(applied.versions.map((v: any) => v.pageId).sort()).toEqual([A.id, C.id].sort());
    expect(applied.recreated.length).toBe(1);
    expect(applied.attachments).toMatchObject({ reattached: 1, copied: 1, missing: [] });
    // Nothing was overwritten: the live text of A is still the current one …
    expect(docToPlainText((await o.get(`/api/v1/pages/${A.id}/content`)).content)).toBe('Испорчено после копии.');
    // … and the backup state is a version in its history, which the user restores through the normal UI/API.
    const revs = (await o.get(`/api/v1/pages/${A.id}/revisions`)).revisions;
    const fromBackup = revs.find((r: any) => r.kind === 'restore' && r.label === 'копия перед инцидентом');
    expect(fromBackup).toBeTruthy();
    await o.post(`/api/v1/pages/${A.id}/revisions/${fromBackup.id}/restore`, {});
    expect(docToPlainText((await o.get(`/api/v1/pages/${A.id}/content`)).content)).toBe('Версия из копии: приёмка по накладной.');
    // The purged page is recreated (new id) under its original parent, with its file (bytes copied from the backup).
    const nb = applied.recreated[0];
    expect(nb.parentId).toBe(A.id);
    const page = (await o.get(`/api/v1/pages/${nb.pageId}`)).page;
    expect(page.title).toBe('Схема стеллажей');
    expect(docToPlainText((await o.get(`/api/v1/pages/${nb.pageId}/content`)).content)).toContain('Схема из копии.');
    const dl = await o.raw('GET', `/api/v1/attachments/${att.id}/download`);
    expect(dl.status).toBe(200);
    expect(sha(Buffer.from(await dl.arrayBuffer()))).toBe(sha(bytes));
    // The trashed page got the version too and stays in the trash until someone restores it.
    expect((await ts.db.query('select deleted_at from pages where id = $1', [C.id])).rows[0].deleted_at).not.toBeNull();
    expect((await ts.db.query(`select count(*)::int c from page_revisions where page_id = $1 and kind = 'restore'`, [C.id])).rows[0].c).toBe(1);
    // Audited, and the audit chain is intact.
    expect((await ts.db.query(`select count(*)::int c from audit_events where action = 'backup.partial_restore'`)).rows[0].c).toBe(1);
    expect((await o.get('/api/v1/audit/verify')).ok).toBe(true);
  }, 300_000);
});
