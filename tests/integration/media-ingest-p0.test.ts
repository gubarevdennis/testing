import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import sharp from 'sharp';
import { ingestClipboard, docFingerprint, collectFootnotes, type PMNode } from '@kb/shared';
import * as md from '@kb/shared/markdown';
import { startServer, setupOrg, expectStatus, type TestServer, type Api } from '../support/harness.js';
import { replaceContent } from '../../apps/server/src/collab/ydoc.js';
import { withHtmlParser } from '../../apps/server/src/convert/html.js';

/**
 * R-MEDIA-007 (pictures that reach another page are that page's attachments, on every path; inline pictures in all
 * formats), R-EDITOR-038 (footnotes through import, export, search) and R-IMPORT-021 (the import endpoint and a paste
 * of the same content give the same document and the same report).
 */
let ts: TestServer;
let org: Awaited<ReturnType<typeof setupOrg>>;

beforeAll(async () => {
  ts = await startServer({}, { worker: true });
  org = await setupOrg(ts);
}, 120_000);
afterAll(async () => ts?.close());

async function upload(api: Api, pageId: string | null, name: string, data: Buffer, mime: string) {
  const fd = new FormData();
  if (pageId) fd.append('pageId', pageId);
  fd.append('file', new Blob([data], { type: mime }), name);
  return (await api.req('POST', '/api/v1/attachments', fd)).attachments[0];
}
const png = (color: string) => sharp({ create: { width: 30, height: 20, channels: 3, background: color } }).png().toBuffer();
const content = async (api: Api, id: string) => (await api.get(`/api/v1/pages/${id}/content`)).content as PMNode;
const find = (doc: PMNode, pred: (n: PMNode) => boolean): PMNode[] => {
  const out: PMNode[] = [];
  const walk = (n: PMNode) => {
    if (pred(n)) out.push(n);
    (n.content ?? []).forEach(walk);
  };
  walk(doc);
  return out;
};
const pics = (doc: PMNode) => find(doc, (n) => n.type === 'image' || n.type === 'inlineImage');
async function setContent(pageId: string, doc: PMNode) {
  await ts.srv.services.hub.applyServerChange(pageId, null, (d) => replaceContent(d, doc));
  await ts.srv.services.hub.flushPage(pageId);
}
async function pageOf(attachmentId: string): Promise<string | null> {
  return (await ts.db.query('select page_id from attachments where id = $1', [attachmentId])).rows[0]?.page_id ?? null;
}
async function shaOf(attachmentId: string): Promise<string> {
  return (await ts.db.query('select v.blob_sha256 from attachments a join attachment_versions v on v.attachment_id = a.id and v.version = a.current_version where a.id = $1', [attachmentId])).rows[0].blob_sha256;
}

async function startImport(api: Api, files: Array<[string, Buffer]>) {
  const fd = new FormData();
  for (const [name, data] of files) fd.append('file', new Blob([data]), name);
  const r = await api.req('POST', '/api/v1/imports', fd);
  for (let i = 0; i < 600; i++) {
    const j = await api.get(`/api/v1/imports/${r.jobId}`);
    if (!['queued', 'running'].includes(j.status)) return { ...j, jobId: r.jobId };
    await new Promise((res) => setTimeout(res, 100));
  }
  throw new Error('import analysis timeout');
}
async function importOne(api: Api, name: string, data: Buffer) {
  const j = await startImport(api, [[name, data]]);
  expect(j.status, JSON.stringify(j.preview?.files)).toBe('awaiting_confirmation');
  const res = await api.post(`/api/v1/imports/${j.jobId}/commit`, { target: { spaceId: org.generalSpaceId, parentId: null } });
  return { job: j, pageId: res.rootPageId as string };
}

describe('R-MEDIA-007: a picture that reaches another page becomes that page\'s attachment (D-39)', () => {
  it('duplicating a page copies its own files AND the pictures it references from other pages; readers of the copy see them, the source is untouched', async () => {
    // a private page of the author holds a picture that was pasted elsewhere without a copy (an old document)
    const author = org.owner;
    const priv = (await author.post('/api/v1/pages', { spaceId: org.personalSpaceId, title: 'Личные черновики' })).page;
    const foreign = await upload(author, priv.id, 'схема.png', await png('#aa0000'), 'image/png');
    const page = (await author.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Инструкция с картинками' })).page;
    const own = await upload(author, page.id, 'значок.png', await png('#00aa00'), 'image/png');
    await setContent(page.id, {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Нажмите ' }, { type: 'inlineImage', attrs: { src: own.contentUrl, attachmentId: own.id, alt: 'значок', width: 16 } }, { type: 'text', text: ' и смотрите схему' }] },
        { type: 'image', attrs: { src: foreign.contentUrl, attachmentId: foreign.id, alt: 'схема', caption: 'Рис. 1' } },
      ],
    });
    const reader = await org.user('Читатель общего');
    // before: the reader cannot open the picture of the private page
    await expectStatus(reader.get(`/api/v1/attachments/${foreign.id}`), 404);

    const copy = (await author.post(`/api/v1/pages/${page.id}/duplicate`, { includeChildren: false })).page;
    const doc = await content(author, copy.id);
    const [inl, blk] = pics(doc);
    expect(inl.type).toBe('inlineImage');
    expect(blk.type).toBe('image');
    for (const n of [inl, blk]) {
      expect(n.attrs!.attachmentId).not.toBe(own.id);
      expect(n.attrs!.attachmentId).not.toBe(foreign.id);
      expect(await pageOf(n.attrs!.attachmentId)).toBe(copy.id);
      expect(n.attrs!.src).toBe(`/api/v1/attachments/${n.attrs!.attachmentId}/content`);
      // the reader of the copy opens the original bytes (same blob, no second upload)
      const r = await reader.raw('GET', `/api/v1/attachments/${n.attrs!.attachmentId}/download`);
      expect(r.status).toBe(200);
    }
    expect(await shaOf(blk.attrs!.attachmentId)).toBe(await shaOf(foreign.id));
    expect(blk.attrs).toMatchObject({ alt: 'схема', caption: 'Рис. 1' });
    expect(inl.attrs).toMatchObject({ alt: 'значок', width: 16 });
    // the source page still references its originals
    expect(pics(await content(author, page.id)).map((n) => n.attrs!.attachmentId)).toEqual([own.id, foreign.id]);
    const audit = (await ts.db.query(`select count(*)::int n from audit_events where action = 'attachment.copy' and details->>'from' = $1`, [foreign.id])).rows[0].n;
    expect(audit).toBe(1);
  });

  it('a template keeps its own copies of the pictures; a page created from it gets its own attachments, readable without access to the source page', async () => {
    const admin = org.owner;
    const src = (await admin.post('/api/v1/pages', { spaceId: org.personalSpaceId, title: 'Шаблон: исходник' })).page;
    const logo = await upload(admin, src.id, 'логотип.png', await png('#0000aa'), 'image/png');
    await setContent(src.id, { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Шапка ' }, { type: 'inlineImage', attrs: { src: logo.contentUrl, attachmentId: logo.id, alt: 'лого' } }] }] });
    const tpl = (await admin.post('/api/v1/templates', { pageId: src.id, name: 'С логотипом', category: 'Тест' })).template;
    const tplPic = pics(tpl.content)[0];
    expect(tplPic.attrs!.attachmentId).not.toBe(logo.id); // the template owns a copy
    expect(await pageOf(tplPic.attrs!.attachmentId)).toBeNull();
    // the source page goes to the trash: the template and its pages do not depend on it
    await admin.del(`/api/v1/pages/${src.id}`);
    const user = await org.user('Автор по шаблону');
    await admin.put('/api/v1/grants', { resourceType: 'space', resourceId: org.generalSpaceId, subjectType: 'user', subjectId: user.id, level: 'edit' });
    const created = (await user.post('/api/v1/pages', { spaceId: org.generalSpaceId, templateId: tpl.id, title: 'По шаблону' })).page;
    const pic = pics(await content(user, created.id))[0];
    expect(pic.type).toBe('inlineImage');
    expect(await pageOf(pic.attrs!.attachmentId)).toBe(created.id);
    expect((await user.raw('GET', `/api/v1/attachments/${pic.attrs!.attachmentId}/download`)).status).toBe(200);
    expect(await shaOf(pic.attrs!.attachmentId)).toBe(await shaOf(logo.id));
  });

  it('a template cannot be used to take a file the user may not download: the reference stays, nothing is copied', async () => {
    const owner = org.owner;
    const priv = (await owner.post('/api/v1/pages', { spaceId: org.personalSpaceId, title: 'Секретные схемы' })).page;
    const secret = await upload(owner, priv.id, 'секрет.png', await png('#333333'), 'image/png');
    const tpl = (await owner.post('/api/v1/templates', { content: { type: 'doc', content: [{ type: 'image', attrs: { src: secret.contentUrl, attachmentId: secret.id } }] }, name: 'Ссылка на секрет', category: 'Тест' })).template;
    // a template built from JSON by someone who may download the file owns a copy: that is the author's decision
    expect(pics(tpl.content)[0].attrs!.attachmentId).not.toBe(secret.id);
    // …but a user cannot craft one from a file they cannot download
    const sp = (await owner.post('/api/v1/spaces', { name: 'Шаблоны отдела', kind: 'project', visibility: 'open', orgLevel: 'view', confirmWiden: true })).space;
    const mgr = await org.user('Менеджер шаблонов');
    await owner.put('/api/v1/grants', { resourceType: 'space', resourceId: sp.id, subjectType: 'user', subjectId: mgr.id, level: 'full' });
    const crafted = (await mgr.post('/api/v1/templates', { spaceId: sp.id, content: { type: 'doc', content: [{ type: 'image', attrs: { src: secret.contentUrl, attachmentId: secret.id } }] }, name: 'Подделка', category: 'Тест' })).template;
    expect(pics(crafted.content)[0].attrs!.attachmentId).toBe(secret.id); // not copied
    const pg = (await mgr.post('/api/v1/pages', { spaceId: sp.id, templateId: crafted.id, title: 'Попытка' })).page;
    expect(pics(await content(mgr, pg.id))[0].attrs!.attachmentId).toBe(secret.id);
    await expectStatus(mgr.get(`/api/v1/attachments/${secret.id}`), 404);
  });
});

describe('R-EDITOR-038 footnotes through import, export and search', () => {
  it('Markdown [^n] import → footnotes; search finds the note text; MD / HTML / DOCX export carry them; DOCX re-import restores them', async () => {
    const MD = '# Нормы\n\nОсвещённость рабочих мест[^1] проверяется ежегодно[^2].\n\n[^1]: По СП 52.13330 «уникальныйтерминсноски».\n[^2]: Протокол хранится 5 лет.\n';
    const { pageId } = await importOne(org.owner, 'нормы.md', Buffer.from(MD));
    const doc = await content(org.owner, pageId);
    expect(collectFootnotes(doc).map((f) => f.text)).toEqual(['По СП 52.13330 «уникальныйтерминсноски».', 'Протокол хранится 5 лет.']);
    // search indexes the note text (index jobs run in the worker)
    let hits: any[] = [];
    for (let i = 0; i < 100 && !hits.length; i++) {
      hits = (await org.owner.get(`/api/v1/search?q=${encodeURIComponent('уникальныйтерминсноски')}`)).results ?? [];
      if (!hits.length) await new Promise((r) => setTimeout(r, 100));
    }
    expect(hits.map((h: any) => h.pageId ?? h.id)).toContain(pageId);
    const mdOut = await (await org.owner.raw('GET', `/api/v1/pages/${pageId}/export?format=md`)).text();
    expect(mdOut).toContain('мест[^1]');
    expect(mdOut).toContain('[^2]: Протокол хранится 5 лет.');
    const html = await (await org.owner.raw('GET', `/api/v1/pages/${pageId}/export?format=html`)).text();
    expect(html).toContain('class="kb-fn-ref"');
    expect(html).toMatch(/<section class="kb-footnotes"[^>]*><ol><li id="kb-fn-1">По СП 52\.13330/);
    const docx = Buffer.from(await (await org.owner.raw('GET', `/api/v1/pages/${pageId}/export?format=docx`)).arrayBuffer());
    const again = await importOne(org.owner, 'нормы.docx', docx);
    expect(collectFootnotes(await content(org.owner, again.pageId)).map((f) => f.text)).toEqual(['По СП 52.13330 «уникальныйтерминсноски».', 'Протокол хранится 5 лет.']);
  });
});

describe('R-IMPORT-021: import and paste are one pipeline', () => {
  const HTML = `<!doctype html><html><head><title>Регламент</title></head><body>
    <h2>Порядок</h2><p>Нажмите <img src="https://images.example.invalid/btn.png" alt="кнопка" width="20"> и подтвердите<sup><a href="#fn1" id="fnref1">1</a></sup>.</p>
    <script>alert(1)</script><p><img src="file:///C:/x.png" alt="локальная"></p>
    <ol><li>шаг</li><li>ещё шаг</li></ol>
    <section class="footnotes"><ol><li id="fn1"><p>Подтверждение — в журнале. <a href="#fnref1">↩</a></p></li></ol></section></body></html>`;

  it('an .html import creates exactly the document a paste of the same HTML produces, with the same report', async () => {
    const { job, pageId } = await importOne(org.owner, 'регламент.html', Buffer.from(HTML));
    const imported = await content(org.owner, pageId);
    const pasted = withHtmlParser((parser) => ingestClipboard({ html: HTML, text: '' }, { parser, markdown: md, origin: null }));
    // remote pictures are copied by the server on import (SSRF-guarded, a hook on paste): compare without their source
    const norm = (d: PMNode) => {
      const c = structuredClone(d);
      for (const n of pics(c)) n.attrs = { ...n.attrs, src: null, attachmentId: null, naturalWidth: null, naturalHeight: null };
      return docFingerprint(c);
    };
    expect(norm(imported)).toBe(norm(pasted.doc));
    expect(pics(imported).map((n) => n.type)).toEqual(['inlineImage']);
    expect(collectFootnotes(imported).map((f) => f.text)).toEqual(['Подтверждение — в журнале.']);
    // the report: the paste's messages are part of the file's report (plus the import-specific notice)
    const codes = job.preview.files[0].warnings.map((w: any) => w.code);
    for (const w of pasted.report.warnings) expect(codes).toContain(w.code);
    expect(codes).toEqual(expect.arrayContaining(['dropped-images', 'dropped-removedElements']));
  });

  it('a .txt and an .md import equal the paste of the same text', async () => {
    const TXT = 'Строка один\nстрока два\n\nстрока три';
    const t = await importOne(org.owner, 'заметка.txt', Buffer.from(TXT));
    const pastedText = ingestClipboard({ text: TXT }, { parser: undefined as never, markdown: md });
    expect(docFingerprint(await content(org.owner, t.pageId))).toBe(docFingerprint(pastedText.doc));
    const MD = '## Раздел\n\n- [x] сделано\n- [ ] осталось\n\n| A | B |\n|---|---|\n| 1 | 2 |\n';
    const m = await importOne(org.owner, 'раздел.md', Buffer.from(MD));
    const pastedMd = withHtmlParser((parser) => ingestClipboard({ text: MD }, { parser, markdown: md }));
    expect(pastedMd.kind).toBe('markdown');
    expect(docFingerprint(await content(org.owner, m.pageId))).toBe(docFingerprint(pastedMd.doc));
  });
});
