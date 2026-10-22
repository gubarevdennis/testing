import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { docToPlainText } from '@kb/shared';
import { startServer, setupOrg, expectStatus, type TestServer, type Api } from '../support/harness.js';
import { openClient } from '../support/collab.js';
import { validateDocx } from '../../apps/server/src/convert/docx-validate.js';
import { docToDocx } from '../../apps/server/src/convert/docx-export.js';
import { replaceContent } from '../../apps/server/src/collab/ydoc.js';
import { exportPages, ExportCancelledError } from '../../apps/server/src/services/exporter.js';
import { buildOrgArchive } from '../../apps/server/src/services/archive.js';
import { toAuthUser } from '../../apps/server/src/auth/sessions.js';
import { unzipEntries, zipEntries } from '../support/doc-corpus.js';

// EXPORT / ARCHIVE P0: Open XML validity of DOCX, cancellable background export with integrity checksums,
// separate-files ZIP and TOC for branches, consistent archive snapshot under concurrent edits, archive restore
// into a chosen target from a resumable (interrupted) upload.

let ts: TestServer; // worker on (background jobs run)
let org: Awaited<ReturnType<typeof setupOrg>>;
let quiet: TestServer; // worker off: jobs stay queued until the test runs them
let qorg: Awaited<ReturnType<typeof setupOrg>>;

beforeAll(async () => {
  ts = await startServer({}, { worker: true });
  org = await setupOrg(ts);
  quiet = await startServer({}, { worker: false });
  qorg = await setupOrg(quiet);
}, 120_000);
afterAll(async () => {
  await ts?.close();
  await quiet?.close();
});

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const t = (text: string, marks?: any[]) => ({ type: 'text', text, ...(marks ? { marks } : {}) });
const p = (...c: any[]) => ({ type: 'paragraph', content: c });

async function setContent(srv: TestServer, pageId: string, doc: any) {
  await srv.srv.services.hub.applyServerChange(pageId, null, (d) => replaceContent(d, doc));
}

async function branch(api: Api, srv: TestServer, spaceId: string, title: string) {
  const root = (await api.post('/api/v1/pages', { spaceId, title })).page;
  const a = (await api.post('/api/v1/pages', { spaceId, parentId: root.id, title: 'Глава 1' })).page;
  const b = (await api.post('/api/v1/pages', { spaceId, parentId: root.id, title: 'Глава 2' })).page;
  const a1 = (await api.post('/api/v1/pages', { spaceId, parentId: a.id, title: 'Раздел 1.1' })).page;
  for (const [pg, n] of [[root, 0], [a, 1], [b, 2], [a1, 3]] as const) await setContent(srv, pg.id, { type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [t(`Подзаголовок ${n}`)] }, p(t(`Текст страницы ${n}.`))] });
  return { root, a, b, a1 };
}

async function waitJob(api: Api, path: string) {
  for (let i = 0; i < 600; i++) {
    const j = await api.get(path);
    if (!['queued', 'running'].includes(j.status)) return j;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('job timeout');
}

describe('DOCX validity (R-EXPORT-006)', () => {
  it('exported DOCX with every block type passes Open XML package/schema validation and opens in LibreOffice; corrupted packages are detected (R-EXPORT-006, R-EXPORT-022)', async () => {
    const page = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Все блоки' })).page;
    const fd = new FormData();
    fd.append('pageId', page.id);
    fd.append('file', new Blob([await sharp({ create: { width: 120, height: 80, channels: 3, background: '#5A85C6' } }).png().toBuffer()]), 'рис.png');
    const att = (await org.owner.req('POST', '/api/v1/attachments', fd)).attachments[0];
    const cell = (c: any[], header = false) => ({ type: header ? 'tableHeader' : 'tableCell', attrs: { colspan: 1, rowspan: 1 }, content: c });
    await setContent(ts, page.id, {
      type: 'doc',
      content: [
        { type: 'toc' },
        { type: 'heading', attrs: { level: 1, id: '11111111-1111-4111-8111-111111111111' }, content: [t('Раздел')] },
        p(t('Ссылка на '), t('раздел', [{ type: 'link', attrs: { href: '#11111111-1111-4111-8111-111111111111' } }]), t(' и '), t('сайт', [{ type: 'link', attrs: { href: 'https://example.com' } }])),
        { type: 'bulletList', content: [{ type: 'listItem', content: [p(t('a')), { type: 'orderedList', content: [{ type: 'listItem', content: [p(t('b')), { type: 'bulletList', content: [{ type: 'listItem', content: [p(t('c'))] }] }] }] }] }] },
        { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [p(t('готово'))] }] },
        { type: 'table', content: [{ type: 'tableRow', content: [cell([p(t('Шапка'))], true), cell([p(t('Ш2'))], true)] }, { type: 'tableRow', content: [cell([{ type: 'bulletList', content: [{ type: 'listItem', content: [p(t('в ячейке'))] }] }]), cell([p(t('x'))])] }] },
        { type: 'callout', attrs: { variant: 'warning' }, content: [p(t('Внимание'))] },
        { type: 'columns', content: [{ type: 'column', attrs: { width: 1 }, content: [p(t('лево'))] }, { type: 'column', attrs: { width: 1 }, content: [p(t('право'))] }] },
        { type: 'blockquote', content: [p(t('цитата'))] },
        { type: 'codeBlock', attrs: { language: 'js' }, content: [t('const a = 1;\nconst b = 2;')] },
        { type: 'image', attrs: { src: att.contentUrl, attachmentId: att.id, alt: 'рисунок', caption: 'Рисунок 1' } },
        { type: 'image', attrs: { src: att.contentUrl, attachmentId: att.id, alt: 'повтор', caption: '' } },
        { type: 'horizontalRule' },
        { type: 'details', content: [{ type: 'detailsSummary', content: [t('Подробнее')] }, { type: 'detailsContent', content: [p(t('скрытое'))] }] },
      ],
    });
    const res = await org.owner.raw('GET', `/api/v1/pages/${page.id}/export?format=docx`);
    expect(res.status).toBe(200);
    const docx = Buffer.from(await res.arrayBuffer());
    expect(res.headers.get('x-content-sha256')).toBe(sha(docx)); // integrity of the delivered file
    const v = await validateDocx(docx);
    expect(v.errors).toEqual([]);
    expect(v.stats.images).toBe(2); // unique drawing ids
    expect(v.stats.tables).toBeGreaterThanOrEqual(3);
    expect(v.stats.tocFields).toBe(1);
    const dir = mkdtempSync(join(tmpdir(), 'kb-ooxml-'));
    writeFileSync(join(dir, 'all.docx'), docx);
    execFileSync('soffice', ['--headless', '--convert-to', 'txt:Text (encoded):UTF8', '--outdir', dir, join(dir, 'all.docx')], { timeout: 90_000, stdio: 'ignore' });
    const txt = readFileSync(join(dir, 'all.txt'), 'utf8');
    for (const s of ['Раздел', 'в ячейке', 'Внимание', 'право', 'const b = 2;', 'Рисунок 1', 'скрытое']) expect(txt, s).toContain(s);

    // The validator catches what makes Word refuse or "repair" a file.
    const files = await unzipEntries(docx);
    const broken = async (mutate: (m: Map<string, Buffer>) => void) => {
      const m = new Map(files);
      mutate(m);
      return (await validateDocx(await zipEntries(m))).errors.join('\n');
    };
    const doc = files.get('word/document.xml')!.toString('utf8');
    expect(await broken((m) => m.delete('word/styles.xml'))).toMatch(/missing part word\/styles\.xml/);
    expect(await broken((m) => m.set('word/document.xml', Buffer.from(doc.replace('</w:body>', '</w:bod>'))))).toMatch(/not well-formed/);
    expect(await broken((m) => m.set('word/document.xml', Buffer.from(doc.replace(/(<wp:docPr id=")\d+/g, '$11'))))).toMatch(/duplicate drawing id/);
    expect(await broken((m) => m.set('word/document.xml', Buffer.from(doc.replace(/<w:p><w:pPr>(<w:pStyle w:val="Title"\/>)<\/w:pPr>(<w:r>.*?<\/w:r>)/, '<w:p>$2<w:pPr>$1</w:pPr>'))))).toMatch(/w:pPr must be the first child/);
    expect(await broken((m) => m.set('word/document.xml', Buffer.from(doc.replace(/<w:p>((?:(?!<w:p>)[\s\S])*?)<\/w:p>(<\/w:tc>)/, '$2'))))).toMatch(/table cell must end with a paragraph/);
    expect(await broken((m) => m.set('[Content_Types].xml', Buffer.from(m.get('[Content_Types].xml')!.toString().replace(/<Default [^>]*Extension="png"[^>]*\/>/, ''))))).toMatch(/no content type for part word\/media/);
    expect(await broken((m) => m.set('word/document.xml', Buffer.from(doc.replace(/r:embed="[^"]+"/, 'r:embed="rIdNope"'))))).toMatch(/has no relationship/);
  }, 120_000);

  it('docToDocx output for imported-style content keeps anchors as bookmarks and internal links (R-EXPORT-006, R-IMPORT-026)', async () => {
    const out = await docToDocx(
      { type: 'doc', content: [{ type: 'heading', attrs: { level: 2, id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' }, content: [t('Цель')] }, p(t('к цели', [{ type: 'link', attrs: { href: '#aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' } }]))] } as any,
      { title: 'Якоря', baseUrl: 'http://x', loadImage: async () => null },
    );
    const v = await validateDocx(out.buffer);
    expect(v.errors).toEqual([]);
    const xml = (await unzipEntries(out.buffer)).get('word/document.xml')!.toString();
    expect(xml).toMatch(/<w:bookmarkStart [^>]*w:name="_kbaaaaaaaabbbb4ccc8dddeeeeeeeeeeee"/);
    expect(xml).toContain('w:anchor="_kbaaaaaaaabbbb4ccc8dddeeeeeeeeeeee"');
  });
});

describe('background export: cancel, integrity, layouts (R-EXPORT-022)', () => {
  it('a queued export is cancelled before it runs; a running export stops at the next page; nothing can be downloaded; audited (R-EXPORT-022)', async () => {
    const o = qorg.owner;
    const { root } = await branch(o, quiet, qorg.generalSpaceId, 'Отменяемый экспорт');
    // Queued (no worker): cancel → cancelled immediately, the worker never picks it up.
    const { jobId } = await o.post('/api/v1/exports', { pageIds: [root.id], format: 'docx', includeChildren: true });
    expect((await o.post(`/api/v1/exports/${jobId}/cancel`)).status).toBe('cancelled');
    expect(await quiet.srv.worker.processJobs()).toBe(0);
    const j = await o.get(`/api/v1/exports/${jobId}`);
    expect(j.status).toBe('cancelled');
    expect(j.file).toBeNull();
    await expectStatus(o.get(`/api/v1/exports/${jobId}/download`), 409);
    // Running: the job is taken by the worker, the user cancels, the export stops between pages without a file.
    const r2 = await o.post('/api/v1/exports', { pageIds: [root.id], format: 'pdf', includeChildren: true, layout: 'files' });
    const job = (await quiet.db.query(`update jobs set status = 'running', locked_by = 'test', started_at = now(), attempts = 1 where id = $1 returning *`, [r2.jobId])).rows[0];
    expect((await o.post(`/api/v1/exports/${r2.jobId}/cancel`)).status).toBe('running'); // stop requested
    await quiet.srv.worker.runJob(job);
    const j2 = await o.get(`/api/v1/exports/${r2.jobId}`);
    expect(j2.status).toBe('cancelled');
    expect(j2.report).toEqual({ cancelled: true });
    expect(j2.file).toBeNull();
    // A finished export cannot be "cancelled" any more.
    const r3 = await o.post('/api/v1/exports', { pageIds: [root.id], format: 'md', includeChildren: true });
    const job3 = (await quiet.db.query(`update jobs set status = 'running', locked_by = 'test', attempts = 1 where id = $1 returning *`, [r3.jobId])).rows[0];
    await quiet.srv.worker.runJob(job3);
    await expectStatus(o.post(`/api/v1/exports/${r3.jobId}/cancel`), 409);
    const audit = (await quiet.db.query(`select count(*)::int c from audit_events where action = 'export.cancel'`)).rows[0].c;
    expect(audit).toBe(2);
    // Direct service call: cancellation checked between pages.
    let calls = 0;
    const user = toAuthUser((await quiet.db.query('select * from users where id = $1', [o.user.id])).rows[0]);
    const err = await exportPages(quiet.srv.services, user, [root.id], 'docx', { includeChildren: true, layout: 'files', isCancelled: async () => ++calls > 2 }).catch((e) => e);
    expect(err).toBeInstanceOf(ExportCancelledError);
  });

  it('branch export: one DOCX with a table of contents, or separate files in a ZIP with report and checksums; downloads carry the SHA-256 (R-EXPORT-022, R-EXPORT-001)', async () => {
    const o = org.owner;
    const { root } = await branch(o, ts, org.generalSpaceId, 'Руководство по эксплуатации');
    // Merged: TOC field first, child titles as headings, valid Open XML.
    const { jobId } = await o.post('/api/v1/exports', { pageIds: [root.id], format: 'docx', includeChildren: true });
    const j = await waitJob(o, `/api/v1/exports/${jobId}`);
    expect(j.status).toBe('succeeded');
    expect(j.report.toc).toBe(true);
    expect(j.report.validation.ok).toBe(true);
    const dl = await o.raw('GET', `/api/v1/exports/${jobId}/download`);
    const merged = Buffer.from(await dl.arrayBuffer());
    expect(dl.headers.get('x-content-sha256')).toBe(sha(merged));
    expect(j.file.sha256).toBe(sha(merged));
    expect(j.report.sha256).toBe(sha(merged));
    const v = await validateDocx(merged);
    expect(v.errors).toEqual([]);
    expect(v.stats.tocFields).toBe(1);
    const xml = (await unzipEntries(merged)).get('word/document.xml')!.toString();
    const tocAt = xml.indexOf('TOC \\');
    expect(tocAt).toBeGreaterThan(0);
    for (const title of ['Глава 1', 'Раздел 1.1', 'Глава 2']) expect(xml.indexOf(`>${title}<`, tocAt)).toBeGreaterThan(tocAt);
    // Separate files: one DOCX per page in the tree layout + report + checksums.
    const r2 = await o.post('/api/v1/exports', { pageIds: [root.id], format: 'docx', includeChildren: true, layout: 'files' });
    const j2 = await waitJob(o, `/api/v1/exports/${r2.jobId}`);
    expect(j2.status).toBe('succeeded');
    expect(j2.file.filename).toMatch(/\.zip$/);
    const zip = Buffer.from(await (await o.raw('GET', `/api/v1/exports/${r2.jobId}/download`)).arrayBuffer());
    const files = await unzipEntries(zip);
    const docs = [...files.keys()].filter((f) => f.endsWith('.docx')).sort();
    expect(docs).toEqual(['Руководство по эксплуатации/index.docx', 'Руководство по эксплуатации/Глава 1/index.docx', 'Руководство по эксплуатации/Глава 1/Раздел 1.1.docx', 'Руководство по эксплуатации/Глава 2.docx'].sort());
    for (const d of docs) expect((await validateDocx(files.get(d)!)).errors, d).toEqual([]);
    const sums = files.get('checksums.sha256')!.toString('utf8').trim().split('\n');
    for (const line of sums) {
      const [h, path] = line.split('  ');
      expect(sha(files.get(path)!), path).toBe(h);
    }
    expect(files.get('export-report.md')!.toString('utf8')).toContain('Страниц: 4');
    // HTML separate files as well.
    const r3 = await o.post('/api/v1/exports', { pageIds: [root.id], format: 'html', includeChildren: true, layout: 'files' });
    expect((await waitJob(o, `/api/v1/exports/${r3.jobId}`)).status).toBe('succeeded');
    const html = await unzipEntries(Buffer.from(await (await o.raw('GET', `/api/v1/exports/${r3.jobId}/download`)).arrayBuffer()));
    expect(html.get('Руководство по эксплуатации/Глава 2.html')!.toString('utf8')).toContain('Текст страницы 2.');
  }, 120_000);
});

describe('consistent snapshot (V18-A06)', () => {
  it('organisation archive taken during concurrent transactional changes and live editing is a consistent snapshot (V18-A06)', async () => {
    const o = org.owner;
    const sp = (await o.post('/api/v1/spaces', { name: 'Поколение 0', kind: 'project', visibility: 'private' })).space;
    const ids: string[] = [];
    for (let i = 0; i < 25; i++) ids.push((await o.post('/api/v1/pages', { spaceId: sp.id, title: `Страница 0-${i}` })).page.id);
    const live = (await o.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Живая правка' })).page;
    const c = await openClient(ts.url, o, live.id);
    let stop = false;
    let gen = 0;
    // Writer: each transaction renames the space AND all its pages to the same generation number.
    const writer = (async () => {
      while (!stop) {
        gen++;
        const cl = await ts.db.connect();
        try {
          await cl.query('begin');
          await cl.query('update spaces set name = $2 where id = $1', [sp.id, `Поколение ${gen}`]);
          await new Promise((r) => setTimeout(r, 5)); // widen the window between the two statements
          await cl.query(`update pages set title = 'Страница ' || $2::text || '-' || substr(title, strpos(title, '-') + 1) where id = any($1::uuid[])`, [ids, String(gen)]);
          await cl.query('commit');
        } finally {
          cl.release();
        }
      }
    })();
    const typist = (async () => {
      for (let i = 0; !stop && i < 200; i++) {
        c.appendParagraph(`правка ${i}`);
        await new Promise((r) => setTimeout(r, 10));
      }
    })();
    const seen = new Set<string>();
    for (let round = 0; round < 6; round++) {
      const { buffer, manifest } = await buildOrgArchive(ts.srv.services, o.user.orgId, { includeVersions: true, includeAcl: true, includeComments: true, includeAudit: false });
      const files = await unzipEntries(buffer);
      const j = (path: string) => JSON.parse(files.get('knowledge-export/' + path)!.toString('utf8'));
      const spaces = j('metadata/spaces.json');
      const pages = j('metadata/pages.json');
      const spaceGen = /Поколение (\d+)/.exec(spaces.find((x: any) => x.id === sp.id).name)![1];
      const pageGens = new Set(pages.filter((x: any) => x.space_id === sp.id).map((x: any) => /^Страница (\d+)-/.exec(x.title)![1]));
      expect([...pageGens], `round ${round}`).toEqual([spaceGen]); // never a mix of two transactions
      seen.add(spaceGen);
      // Internal consistency: every page file, parent, attachment and count of the manifest matches.
      expect(manifest.counts.pages).toBe(pages.length);
      const ids2 = new Set(pages.map((x: any) => x.id));
      for (const pg of pages) {
        if (pg.parent_id) expect(ids2.has(pg.parent_id)).toBe(true);
        expect(files.has('knowledge-export/' + pg.path), pg.path).toBe(true);
        expect(files.has(`knowledge-export/metadata/content/${pg.id}.json`)).toBe(true);
      }
      for (const a of j('metadata/attachments.json')) expect(ids2.has(a.page_id)).toBe(true);
      const sums = files.get('knowledge-export/checksums.sha256')!.toString('utf8').trim().split('\n');
      for (const line of sums) {
        const [h, path] = line.split('  ');
        expect(sha(files.get('knowledge-export/' + path)!)).toBe(h);
      }
    }
    stop = true;
    await writer;
    await typist;
    await c.waitSaved();
    c.close();
    expect(gen).toBeGreaterThan(6); // the writer really ran concurrently
    expect(seen.size).toBeGreaterThanOrEqual(1);
  }, 120_000);
});

describe('archive restore target and resumable upload (R-ARCHIVE-006, R-ARCHIVE-016, R-EXPORT-002)', () => {
  it('archive uploaded through an interrupted, resumed upload session is restored into a NEW isolated space or merged into an existing space; originals untouched, verification passes (R-ARCHIVE-006, R-ARCHIVE-016, R-EXPORT-002)', async () => {
    const o = org.owner;
    const pw = 'Owner-password-1';
    const sp = (await o.post('/api/v1/spaces', { name: 'Отдел снабжения', kind: 'project', visibility: 'open', orgLevel: 'view', confirmWiden: true })).space;
    const root = (await o.post('/api/v1/pages', { spaceId: sp.id, title: 'Поставщики' })).page;
    const child = (await o.post('/api/v1/pages', { spaceId: sp.id, parentId: root.id, title: 'Договоры' })).page;
    await setContent(ts, child.id, { type: 'doc', content: [p(t('См. '), t('поставщиков', [{ type: 'link', attrs: { href: `/p/${root.id}` } }]))] });
    const { jobId } = await o.post('/api/v1/admin/archives', { password: pw, confirm: true });
    const aj = await waitJob(o, `/api/v1/admin/archives/${jobId}`);
    expect(aj.status).toBe('succeeded');
    const archive = Buffer.from(await (await o.raw('GET', `/api/v1/admin/archives/${jobId}/download`)).arrayBuffer());

    // Resumable upload: the connection "drops" after the first part; the client asks how much arrived and resumes.
    const up = await o.post('/api/v1/uploads', { pageId: null, filename: 'архив.zip', size: archive.length, sha256: sha(archive) });
    const half = Math.floor(archive.length / 2);
    const put = (offset: number, data: Buffer) => fetch(`${ts.url}/api/v1/uploads/${up.uploadId}?offset=${offset}`, { method: 'PUT', headers: { cookie: o.cookieHeader(), 'x-csrf-token': o.csrf!, 'content-type': 'application/octet-stream' }, body: data });
    expect((await put(0, archive.subarray(0, half))).status).toBe(200);
    const incomplete = await expectStatus(o.post(`/api/v1/admin/archives/restore/upload/${up.uploadId}`), 409);
    expect(incomplete.error.details?.received ?? incomplete.error.received ?? half).toBe(half);
    const state = await o.get(`/api/v1/uploads/${up.uploadId}`);
    expect(Number(state.received)).toBe(half);
    expect((await put(Number(state.received), archive.subarray(half))).status).toBe(200);
    const analysed = await o.post(`/api/v1/admin/archives/restore/upload/${up.uploadId}`);
    expect(analysed.analysis.ok).toBe(true);
    expect(analysed.analysis.conflicts.pages).toBeGreaterThan(0); // the originals still exist
    await expectStatus(o.post(`/api/v1/admin/archives/restore/upload/${up.uploadId}`), 409); // one use only

    // Target: a new isolated space.
    const beforeOriginal = await o.get(`/api/v1/pages/${child.id}/content`);
    const r = await o.post(`/api/v1/admin/archives/restore/${analysed.jobId}/commit`, { password: pw, confirm: true, target: { mode: 'new-space', name: 'Проверка архива' } });
    expect(r.verification.ok, JSON.stringify(r.verification.problems)).toBe(true);
    expect(r.restore.target.mode).toBe('new-space');
    const target = (await ts.db.query('select * from spaces where id = $1', [r.restore.target.spaceId])).rows[0];
    expect(target.name).toBe('Проверка архива');
    expect(target.visibility).toBe('private');
    const restoredPages = (await ts.db.query('select id, title, parent_id from pages where space_id = $1 and deleted_at is null', [target.id])).rows;
    const folder = restoredPages.find((x) => x.title === 'Отдел снабжения');
    const rRoot = restoredPages.find((x) => x.title === 'Поставщики');
    const rChild = restoredPages.find((x) => x.title === 'Договоры');
    expect(folder.parent_id).toBeNull();
    expect(rRoot.parent_id).toBe(folder.id);
    expect(rChild.parent_id).toBe(rRoot.id);
    expect([rRoot.id, rChild.id]).not.toContain(root.id); // always new ids
    // Internal links point inside the restored copy, the original stays as it was.
    expect(JSON.stringify((await o.get(`/api/v1/pages/${rChild.id}/content`)).content)).toContain(`/p/${rRoot.id}`);
    expect((await o.get(`/api/v1/pages/${child.id}/content`)).content).toEqual(beforeOriginal.content);
    // Isolated: an ordinary employee who can read the original space cannot see the restored copy.
    const emp = await org.user('Сотрудник Снабжения');
    expect((await emp.raw('GET', `/api/v1/pages/${root.id}`)).status).toBe(200);
    expect((await emp.raw('GET', `/api/v1/pages/${rRoot.id}`)).status).toBe(404);

    // Target: merge into an existing space chosen by the administrator.
    const dest = (await o.post('/api/v1/spaces', { name: 'Сводный архив', kind: 'project', visibility: 'private' })).space;
    const fd = new FormData();
    fd.append('file', new Blob([archive]), 'архив.zip');
    const again = await o.req('POST', '/api/v1/admin/archives/restore', fd);
    const r2 = await o.post(`/api/v1/admin/archives/restore/${again.jobId}/commit`, { password: pw, confirm: true, target: { mode: 'into-space', spaceId: dest.id } });
    expect(r2.verification.ok, JSON.stringify(r2.verification.problems)).toBe(true);
    const merged = (await ts.db.query('select title from pages where space_id = $1 and deleted_at is null', [dest.id])).rows.map((x) => x.title);
    expect(merged).toEqual(expect.arrayContaining(['Отдел снабжения', 'Поставщики', 'Договоры']));
    const audit = (await ts.db.query(`select details from audit_events where action = 'archive.restore' order by id`)).rows.map((x) => x.details.target);
    expect(audit).toEqual(['new-space', 'into-space']);
    expect(docToPlainText((await o.get(`/api/v1/pages/${rChild.id}/content`)).content)).toBe('См. поставщиков');
  }, 180_000);
});
