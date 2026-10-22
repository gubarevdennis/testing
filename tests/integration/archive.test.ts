import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import yauzl from 'yauzl';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { startServer, setupOrg, expectStatus, Api, OWNER, type TestServer } from '../support/harness.js';
import { openClient } from '../support/collab.js';
import { docToPlainText } from '@kb/shared';
import { replaceContent } from '../../apps/server/src/collab/ydoc.js';

let A: TestServer;
let B: TestServer;
let orgA: Awaited<ReturnType<typeof setupOrg>>;

beforeAll(async () => {
  A = await startServer({}, { worker: true });
  B = await startServer({}, { worker: true });
  orgA = await setupOrg(A);
}, 120_000);
afterAll(async () => {
  await A?.close();
  await B?.close();
});

async function unzip(buf: Buffer): Promise<Map<string, Buffer>> {
  return new Promise((resolve, reject) => {
    const out = new Map<string, Buffer>();
    yauzl.fromBuffer(buf, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err);
      zip.on('entry', (e) => zip.openReadStream(e, (_e, rs) => { const c: Buffer[] = []; rs!.on('data', (d) => c.push(d)); rs!.on('end', () => { out.set(e.fileName, Buffer.concat(c)); zip.readEntry(); }); }));
      zip.on('end', () => resolve(out));
      zip.readEntry();
    });
  });
}

async function waitJob(api: Api, path: string) {
  for (let i = 0; i < 600; i++) {
    const j = await api.get(path);
    if (!['queued', 'running'].includes(j.status)) return j;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('job timeout');
}

describe('organisation archive round trip (F06, V18-A01, V18-A02, V18-A03, V18-A04, V18-A24, SC-38, S20)', () => {
  it('export → readable without the app → restore into a clean installation → verified (V18-A05, R-ACL-049, R-SECURITY-010, E-10, V17-F06, QA26-16, R-ARCHIVE-004, R-ARCHIVE-006, R-ARCHIVE-007, R-ARCHIVE-008, R-ARCHIVE-011, R-ARCHIVE-013, R-ARCHIVE-016, R-BACKUP-005, R-EXPORT-002, R-EXPORT-024, R-EXPORT-026)', async () => {
    const o = orgA.owner;
    // --- build representative content
    const dept = (await o.post('/api/v1/admin/groups', { name: 'Инженеры', kind: 'department' })).group.id;
    const eng = await orgA.user('Инженер Архива', { groupIds: [dept] });
    const sp = (await o.post('/api/v1/spaces', { name: 'Проектирование', kind: 'department', visibility: 'private', groups: [{ groupId: dept, level: 'edit' }] })).space;
    const root = (await o.post('/api/v1/pages', { spaceId: sp.id, title: 'Типовые решения' })).page;
    const knx = (await o.post('/api/v1/pages', { spaceId: sp.id, parentId: root.id, title: 'Освещение KNX' })).page;
    const secret = (await o.post('/api/v1/pages', { spaceId: sp.id, parentId: root.id, title: 'Закрытый расчёт' })).page;
    await o.post(`/api/v1/pages/${secret.id}/inheritance`, { inherit: false });
    const acc = await o.get(`/api/v1/pages/${secret.id}/access`);
    for (const g of acc.pageGrants.filter((g: any) => g.subject_type === 'group')) await o.del(`/api/v1/grants/${g.id}`);
    const fd = new FormData();
    fd.append('pageId', knx.id);
    const png = await sharp({ create: { width: 120, height: 80, channels: 3, background: '#5A85C6' } }).png().toBuffer();
    fd.append('file', new Blob([png]), 'схема щита.png');
    const att = (await o.req('POST', '/api/v1/attachments', fd)).attachments[0];
    await A.srv.services.hub.applyServerChange(knx.id, null, (doc) =>
      replaceContent(doc, {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Параметры' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'См. ' }, { type: 'pageMention', attrs: { pageId: root.id, title: 'Типовые решения' } }] },
          { type: 'image', attrs: { src: att.contentUrl, attachmentId: att.id, alt: 'щит', caption: 'Рис. 1' } },
          { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableHeader', attrs: { colspan: 1, rowspan: 1 }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Линия' }] }] }, { type: 'tableHeader', attrs: { colspan: 1, rowspan: 1 }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ток' }] }] }] }, { type: 'tableRow', content: [{ type: 'tableCell', attrs: { colspan: 1, rowspan: 1 }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'L1' }] }] }, { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, align: 'right' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '16 А' }] }] }] }] },
          { type: 'callout', attrs: { variant: 'warning' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Проверить дроссель' }] }] },
        ],
      }),
    );
    await o.post(`/api/v1/pages/${knx.id}/revisions`, { label: 'Первая редакция' });
    const coll = await o.post('/api/v1/collections', { spaceId: sp.id, parentId: root.id, name: 'Реестр оборудования' });
    await o.post(`/api/v1/collections/${coll.collection.id}/rows`, { title: 'ЩУО-24', values: { status: 'active', updated: '2026-10-01' } });
    const textBefore = docToPlainText((await o.get(`/api/v1/pages/${knx.id}/content`)).content);

    // --- export (requires password confirmation)
    await expectStatus(o.post('/api/v1/admin/archives', { password: 'wrong', confirm: true }), 403);
    const { jobId } = await o.post('/api/v1/admin/archives', { password: OWNER.password, confirm: true });
    const job = await waitJob(o, `/api/v1/admin/archives/${jobId}`);
    expect(job.status).toBe('succeeded');
    const zip = Buffer.from(await (await o.raw('GET', `/api/v1/admin/archives/${jobId}/download`)).arrayBuffer());
    const files = await unzip(zip);

    // --- readable without the application
    const names = [...files.keys()];
    expect(names).toContain('knowledge-export/README.md');
    expect(names).toContain('knowledge-export/manifest.json');
    expect(names).toContain('knowledge-export/checksums.sha256');
    const knxPath = names.find((n) => n.endsWith('/Освещение KNX.md'))!;
    expect(knxPath).toBeTruthy();
    const md = files.get(knxPath)!.toString();
    expect(md).toContain('## Параметры');
    expect(md).toMatch(/\| Линия \| Ток +\|/);
    // relative links resolve to existing files
    for (const m of md.matchAll(/\]\(([^)\s]+)/g)) {
      const href = decodeURIComponent(m[1].split('#')[0]);
      if (/^https?:/.test(href)) continue;
      const target = posix.normalize(posix.join(posix.dirname(knxPath), href));
      expect(files.has(target), `link ${href} -> ${target}`).toBe(true);
    }
    // checksums verify like `sha256sum -c`
    for (const line of files.get('knowledge-export/checksums.sha256')!.toString().trim().split('\n')) {
      const [h, p] = line.split('  ');
      expect(createHash('sha256').update(files.get('knowledge-export/' + p)!).digest('hex')).toBe(h);
    }
    expect(names.some((n) => n.startsWith('knowledge-export/databases/') && n.endsWith('.csv'))).toBe(true);
    const users = JSON.parse(files.get('knowledge-export/metadata/users.json')!.toString());
    expect(JSON.stringify(users)).not.toMatch(/password|argon2|mfa_secret/i); // no secrets

    // --- a corrupted archive is refused without changing anything (V18-A04)
    const orgB = await setupOrg(B);
    // Tamper with one document while keeping the original checksum list.
    const yazl = (await import('yazl')).default;
    const z = new yazl.ZipFile();
    for (const [name, data] of files) z.addBuffer(name === knxPath ? Buffer.from(data.toString().replace('Параметры', 'Подделка')) : data, name);
    z.end();
    const parts: Buffer[] = [];
    for await (const c of z.outputStream) parts.push(c as Buffer);
    const corrupted = Buffer.concat(parts);
    const fdBad = new FormData();
    fdBad.append('file', new Blob([corrupted]), 'bad.zip');
    const bad = await orgB.owner.req('POST', '/api/v1/admin/archives/restore', fdBad).catch((e) => e.body);
    expect(bad.analysis.ok).toBe(false);
    expect(bad.analysis.checksumErrors.length).toBe(1);
    await expectStatus(orgB.owner.post(`/api/v1/admin/archives/restore/${bad.jobId}/commit`, { password: OWNER.password, confirm: true }), 422);

    // --- restore into the clean installation
    const before = (await B.db.query('select count(*)::int c from pages')).rows[0].c;
    const fd2 = new FormData();
    fd2.append('file', new Blob([zip]), 'archive.zip');
    const an = await orgB.owner.req('POST', '/api/v1/admin/archives/restore', fd2);
    expect(an.analysis.ok).toBe(true);
    expect(an.analysis.users.find((u: any) => u.email === eng.email).match).toBe('unresolved');
    expect((await B.db.query('select count(*)::int c from pages')).rows[0].c).toBe(before); // dry run changed nothing
    const res = await orgB.owner.post(`/api/v1/admin/archives/restore/${an.jobId}/commit`, { password: OWNER.password, confirm: true });
    expect(res.verification.problems).toEqual([]);
    expect(res.verification.ok).toBe(true);
    expect(res.restore.unresolvedUsers).toContain(eng.email);

    // --- semantic comparison
    // No id conflicts in a clean installation => original ids are preserved.
    const row = (await B.db.query('select content, plain_text from doc_state where page_id = $1', [knx.id])).rows[0];
    expect(docToPlainText(row.content)).toBe(textBefore);
    const tree = (await B.db.query('select parent_id from pages where id = $1', [knx.id])).rows[0];
    expect(tree.parent_id).toBe(root.id);
    const img = (await B.db.query('select v.blob_sha256 from attachment_versions v where v.attachment_id = $1', [att.id])).rows[0];
    expect(img.blob_sha256).toBe(createHash('sha256').update(png).digest('hex'));
    const revs = (await B.db.query('select count(*)::int c from page_revisions where page_id = $1', [knx.id])).rows[0].c;
    expect(revs).toBeGreaterThanOrEqual(2);
    // ACL restored: the private exception page is still not granted to the department.
    const g = (await B.db.query(`select subject_type from grants where resource_type = 'page' and resource_id = $1 and revoked_at is null`, [secret.id])).rows;
    expect(g.some((x: any) => x.subject_type === 'group')).toBe(false);
    // Unresolved identities have no access until mapped (V18-A05)
    const unresolved = (await B.db.query(`select status from users where lower(email) = lower($1)`, [eng.email])).rows[0];
    expect(unresolved.status).toBe('suspended');
    // Owner of B (same email as owner A) is mapped to the existing account and sees the restored space.
    const spacesB = await orgB.owner.get('/api/v1/spaces');
    expect(spacesB.spaces.some((x: any) => x.name === 'Проектирование')).toBe(true);
    const c2 = await orgB.owner.get(`/api/v1/pages/${knx.id}/content`);
    expect(docToPlainText(c2.content)).toBe(textBefore);
    const live = await openClient(B.url, orgB.owner, knx.id);
    expect(live.provider.synced).toBe(true);
    live.close();
  }, 240_000);
});
