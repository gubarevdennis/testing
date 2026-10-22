import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { inject } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { startServer, setupOrg, Api, OWNER, expectStatus, type TestServer } from '../support/harness.js';
import { openClient } from '../support/collab.js';
import { REPO_ROOT } from '../support/process-server.js';

// Disaster-recovery drill (SC-30, AT-60, AT-87, S20, E-08, D-08, OPS-011, R-BACKUP-001/003/004):
// content built through the API → scripts/backup/backup.sh → restore.sh into a NEW database and object
// directory → a server started on the restored data serves the same content, files (bytes), history,
// permissions and an intact audit chain; verify-backup.sh proves the backup and records the result.

const run = promisify(execFile);
let ts: TestServer;
let restored: TestServer | null = null;
let org: Awaited<ReturnType<typeof setupOrg>>;
let work: string;

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const textOf = (content: any) => content.content.map((b: any) => (b.content ?? []).map((t: any) => t.text ?? '').join('')).join('\n');

async function script(name: string, args: string[], env: Record<string, string>) {
  const t = Date.now();
  const r = await run('bash', [join(REPO_ROOT, 'scripts/backup', name), ...args], { env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024, timeout: 170_000 });
  return { stdout: r.stdout, stderr: r.stderr, ms: Date.now() - t };
}

beforeAll(async () => {
  work = await mkdtemp(join(tmpdir(), 'kb-drill-'));
  ts = await startServer({}, { worker: true }); // worker: search indexing runs before the backup
  org = await setupOrg(ts);
});

afterAll(async () => {
  await restored?.close().catch(() => undefined);
  await ts?.close();
  await rm(work, { recursive: true, force: true });
});

describe('backup → restore drill (SC-30, AT-60, AT-87, V16-S20, OPS-011, QA26-18)', () => {
  it('restores content, attachment bytes, history, permissions and the audit chain into a new installation; search works and respects ACL (E-08, D-08, R-BACKUP-001, R-BACKUP-002, R-BACKUP-015, R-BACKUP-019, V18-A25, V16-S20)', async () => {
    const o = org.owner;
    // ---------------------------------------------------------------- build representative content
    const dept = (await o.post('/api/v1/admin/groups', { name: 'Эксплуатация', kind: 'department' })).group.id;
    const editor = await org.user('Редактор Учений', { groupIds: [dept] });
    const outsider = await org.user('Посторонний Учений');
    const closed = (await o.post('/api/v1/spaces', { name: 'Регламенты', kind: 'department', visibility: 'private', groups: [{ groupId: dept, level: 'edit' }] })).space;
    const root = (await o.post('/api/v1/pages', { spaceId: closed.id, title: 'Регламент ДЦ' })).page;
    const child = (await o.post('/api/v1/pages', { spaceId: closed.id, parentId: root.id, title: 'Резервное копирование' })).page;
    const general = (await o.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Общая страница' })).page;

    const fileBytes = Buffer.concat([Buffer.from('схема стойки\n'), randomBytes(150_000)]);
    const fd = new FormData();
    fd.append('pageId', child.id);
    fd.append('file', new Blob([fileBytes], { type: 'application/octet-stream' }), 'стойка.bin');
    const att = (await o.req('POST', '/api/v1/attachments', fd)).attachments[0];

    const a = await openClient(ts.url, o, child.id);
    a.insert(0, 0, 'Ежедневная полная копия.');
    a.appendParagraph('WAL архивируется непрерывно.');
    await a.waitSaved();
    const v1 = (await o.post(`/api/v1/pages/${child.id}/revisions`, { label: 'Редакция 1' })).revision;
    a.appendParagraph('Проверка восстановления — ежемесячно.');
    await a.waitSaved(); // acknowledged, possibly not yet materialised: must still be in the backup (journal)
    const e = await openClient(ts.url, editor, root.id);
    e.insert(0, 0, 'Правка редактора отдела.');
    await e.waitSaved();
    a.close();
    e.close();

    const expectedChild = 'Ежедневная полная копия.\nWAL архивируется непрерывно.\nПроверка восстановления — ежемесячно.';
    const before = {
      child: textOf((await o.get(`/api/v1/pages/${child.id}/content`)).content),
      root: textOf((await o.get(`/api/v1/pages/${root.id}/content`)).content),
      revisions: (await o.get(`/api/v1/pages/${child.id}/revisions`)).revisions.map((r: any) => ({ number: r.number, label: r.label, kind: r.kind })),
      audit: await o.get('/api/v1/audit/verify'),
    };
    expect(before.child).toBe(expectedChild);
    // Search index is up to date before the backup (indexing is asynchronous through the outbox).
    await ts.srv.services.hub.flushPage(child.id);
    const searchFor = async (api: Api, q: string) => (await api.get('/api/v1/search?q=' + encodeURIComponent(q))).results.map((x: any) => x.pageId);
    for (let i = 0; i < 100 && !(await searchFor(o, 'ежемесячно')).includes(child.id); i++) await new Promise((r) => setTimeout(r, 100));
    expect(await searchFor(o, 'ежемесячно')).toContain(child.id);
    expect(before.audit.ok).toBe(true);
    await expectStatus(outsider.get(`/api/v1/pages/${child.id}`), 404);

    // ---------------------------------------------------------------- backup
    const storageRoot = ts.srv.cfg.storage.root;
    const backupDir = join(work, 'backups');
    const b = await script('backup.sh', [], { DATABASE_URL: ts.dbUrl, BACKUP_DIR: backupDir, STORAGE_ROOT: storageRoot, BACKUP_METRICS_FILE: join(work, 'backup.prom') });
    const backupPath = b.stdout.trim().split('\n').pop()!;
    const manifest = JSON.parse(await readFile(join(backupPath, 'manifest.json'), 'utf8'));
    expect(manifest.format).toBe('kb-backup/1');
    expect(manifest.rowCounts.attachments).toBe(1);
    expect(manifest.objects.count).toBeGreaterThanOrEqual(1);
    expect(await readFile(join(work, 'backup.prom'), 'utf8')).toMatch(/kb_backup_last_success_timestamp_seconds \d+/);
    const rec = (await ts.db.query('select status, size_bytes from backups where id = $1', [manifest.backupRecordId])).rows[0];
    expect(rec.status).toBe('ok');

    // ---------------------------------------------------------------- restore into a NEW database + object dir
    const runTag = inject('runTag' as never) as string;
    const dbName = `kb_t_${runTag}_${process.pid}_restored_${Date.now()}`;
    const targetUrl = ts.dbUrl.replace(/\/[^/]*$/, '/' + dbName);
    const targetRoot = join(work, 'restored-objects');
    const r = await script('restore.sh', [backupPath, '--create', '--target-db', targetUrl, '--target-storage', targetRoot], {});
    const report = JSON.parse(r.stdout);
    expect(report.ok).toBe(true);
    expect(report.rowCounts).toEqual(manifest.rowCounts);
    expect(report.auditChain).toContain('ok: true');
    // restore refuses to overwrite: the same target again must fail
    await expect(script('restore.sh', [backupPath, '--target-db', targetUrl, '--target-storage', targetRoot], {})).rejects.toThrow(/not empty/);

    // ---------------------------------------------------------------- the restored installation works
    restored = await startServer({ storage: { driver: 'fs', root: targetRoot } }, { dbName });
    const ro = new Api(restored.url);
    await ro.login(OWNER.email, OWNER.password);
    expect(textOf((await ro.get(`/api/v1/pages/${child.id}/content`)).content)).toBe(expectedChild);
    expect(textOf((await ro.get(`/api/v1/pages/${root.id}/content`)).content)).toBe(before.root);
    expect((await ro.get(`/api/v1/pages/${general.id}`)).page.title).toBe('Общая страница');
    const tree = await ro.get(`/api/v1/spaces/${closed.id}/tree`);
    expect(JSON.stringify(tree)).toContain('Регламент ДЦ');
    const rchild = (await ro.get(`/api/v1/pages/${child.id}`)).page;
    expect(rchild.title).toBe('Резервное копирование');
    expect(rchild.parentId ?? rchild.parent_id).toBe(root.id);
    // history
    const revs = (await ro.get(`/api/v1/pages/${child.id}/revisions`)).revisions.map((x: any) => ({ number: x.number, label: x.label, kind: x.kind }));
    expect(revs).toEqual(before.revisions);
    const rv1 = await ro.get(`/api/v1/pages/${child.id}/revisions/${v1.id}`);
    expect(textOf(rv1.revision.content)).toBe('Ежедневная полная копия.\nWAL архивируется непрерывно.');
    // attachment bytes
    const dl = await ro.raw('GET', `/api/v1/attachments/${att.id}/download`);
    expect(dl.status).toBe(200);
    expect(sha(Buffer.from(await dl.arrayBuffer()))).toBe(sha(fileBytes));
    // permissions: group member still edits, outsider still sees nothing
    const re = new Api(restored.url);
    await re.login(editor.email, editor.password);
    const reAccess = await re.get(`/api/v1/pages/${child.id}`);
    expect(reAccess.page.id).toBe(child.id);
    const rout = new Api(restored.url);
    await rout.login(outsider.email, outsider.password);
    await expectStatus(rout.get(`/api/v1/pages/${child.id}`), 404);
    await expectStatus(rout.get(`/api/v1/attachments/${att.id}/download`), 404);
    // search: the restored index finds the content, and still respects permissions (V16-S20)
    expect(await searchFor(ro, 'ежемесячно')).toContain(child.id);
    expect(await searchFor(re, 'ежемесячно')).toContain(child.id);
    expect(await searchFor(rout, 'ежемесячно')).not.toContain(child.id);
    // audit chain intact and complete
    const audit = await ro.get('/api/v1/audit/verify');
    expect(audit.ok).toBe(true);
    expect(audit.checked).toBeGreaterThanOrEqual(before.audit.checked);
    // live editing continues on the restored data
    const c = await openClient(restored.url, re, child.id);
    expect(c.text()).toBe(expectedChild);
    c.appendParagraph('Изменение после восстановления.');
    await c.waitSaved();
    c.close();

    // ---------------------------------------------------------------- verification of the backup (temporary DB)
    const v = await script('verify-backup.sh', [backupPath], { DATABASE_URL: ts.dbUrl });
    const vr = JSON.parse(v.stdout.trim().split('\n').pop()!);
    expect(vr.ok).toBe(true);
    expect(vr.blobsVerified).toBe(manifest.rowCounts.blobs);
    expect(vr.documents.ok).toBe(true);
    const vrec = (await ts.db.query('select verify_status from backups where id = $1', [manifest.backupRecordId])).rows[0];
    expect(vrec.verify_status).toBe('ok');
    const metrics = await (await fetch(ts.url + '/metrics')).text();
    expect(metrics).toMatch(/kb_backup_age_seconds \d/);
    expect(metrics).toMatch(/kb_restore_verification_age_seconds \d/);
    console.log(`[drill] backup ${b.ms} ms, restore ${r.ms} ms (${JSON.stringify(report.timingsMs)}), verify ${v.ms} ms`);
  });

  it('a damaged backup is rejected by restore and verification (E-08, AT-60)', async () => {
    const backupDir = join(work, 'backups');
    const latest = (await readdir(backupDir)).filter((d) => /^kb-.*Z$/.test(d)).sort().pop()!;
    const list = (await readFile(join(backupDir, latest, 'objects.list'), 'utf8')).trim().split('\n')[0].split(' ');
    const poolFile = join(backupDir, 'objects', list[0].slice(0, 2), list[0]);
    // Corrupt one object in the pool (bit rot / tampering): the restore must stop at the sha256 check.
    const { writeFile } = await import('node:fs/promises');
    const original = await readFile(poolFile);
    await writeFile(poolFile, Buffer.concat([original.subarray(0, 10), Buffer.from('X'), original.subarray(11)]));
    try {
      await expect(script('verify-backup.sh', [join(backupDir, latest)], { DATABASE_URL: ts.dbUrl, VERIFY_RECORD: '0' })).rejects.toThrow(/sha256|FAILED/);
    } finally {
      await writeFile(poolFile, original);
    }
    // Tampering with the dump is caught by SHA256SUMS before anything is restored.
    const dump = join(backupDir, latest, 'db.dump');
    const d = await readFile(dump);
    await writeFile(dump, Buffer.concat([d, Buffer.from('x')]));
    try {
      await expect(script('restore.sh', [join(backupDir, latest), '--create', '--target-db', ts.dbUrl.replace(/\/[^/]*$/, '/kb_never_created'), '--target-storage', join(work, 'never')], {})).rejects.toThrow(/SHA256SUMS/);
    } finally {
      await writeFile(dump, d);
    }
  });
});
