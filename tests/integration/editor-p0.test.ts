import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { prosemirrorJSONToYXmlFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import { getKbSchema, markdownToDoc, docToMarkdown, type PMNode } from '@kb/shared';
import { startServer, setupOrg, expectStatus, type TestServer } from '../support/harness.js';
import { openClient } from '../support/collab.js';

let ts: TestServer;
let org: Awaited<ReturnType<typeof setupOrg>>;
let site: http.Server;
let siteUrl = '';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP8z4AATAxkCAEAJ9cBD8JfOs4AAAAASUVORK5CYII=', 'base64');

beforeAll(async () => {
  // an "external" web site (allow-listed for the test: it runs on a loopback address)
  site = http.createServer((req, res) => {
    if (req.url === '/img/Схема_цеха.png' || req.url === '/img/%D0%A1%D1%85%D0%B5%D0%BC%D0%B0_%D1%86%D0%B5%D1%85%D0%B0.png') return res.writeHead(200, { 'content-type': 'image/png' }).end(PNG);
    if (req.url === '/fake.png') return res.writeHead(200, { 'content-type': 'image/png' }).end('<html><script>alert(1)</script></html>');
    if (req.url === '/page.html') return res.writeHead(200, { 'content-type': 'text/html' }).end('<html></html>');
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => site.listen(0, '127.0.0.1', () => r()));
  siteUrl = `http://127.0.0.1:${(site.address() as { port: number }).port}`;
  ts = await startServer({ remoteFetch: { enabled: true, allowHosts: ['127.0.0.1'], timeoutMs: 5000, maxBytes: 5 * 1024 * 1024 } } as never);
  org = await setupOrg(ts);
}, 120_000);
afterAll(async () => {
  await ts?.close();
  site?.close();
});

const schema = getKbSchema();
let n = 0;
const id = () => `blk-${++n}`;
const t = (text: string, marks?: object[]) => ({ type: 'text', text, ...(marks ? { marks } : {}) });
const p = (...content: object[]) => ({ type: 'paragraph', attrs: { id: id() }, content });
const li = (...content: object[]) => ({ type: 'listItem', attrs: { id: id() }, content });

/** Every inline format and block type of SC-05. */
function richDoc(): PMNode {
  return {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { id: id(), level: 1 }, content: [t('Регламент')] },
      { type: 'heading', attrs: { id: id(), level: 3 }, content: [t('Подраздел')] },
      p(
        t('жирный', [{ type: 'bold' }]),
        t(' '),
        t('курсив', [{ type: 'italic' }]),
        t(' '),
        t('подчёркнутый', [{ type: 'underline' }]),
        t(' '),
        t('зачёркнутый', [{ type: 'strike' }]),
        t(' '),
        t('код', [{ type: 'code' }]),
        t(' '),
        t('ссылка', [{ type: 'link', attrs: { href: 'https://example.com/a' } }]),
        t(' H'),
        t('2', [{ type: 'subscript' }]),
        t('O x'),
        t('2', [{ type: 'superscript' }]),
        t(' '),
        { type: 'inlineMath', attrs: { latex: 'a^2+b^2' } },
      ),
      {
        type: 'bulletList',
        attrs: { id: id() },
        content: [li(p(t('Пункт 1')), { type: 'bulletList', attrs: { id: id() }, content: [li(p(t('Вложенный 1.1')), { type: 'orderedList', attrs: { id: id(), start: 1 }, content: [li(p(t('Глубже')))] })] }), li(p(t('Пункт 2')))],
      },
      { type: 'taskList', attrs: { id: id() }, content: [{ type: 'taskItem', attrs: { id: id(), checked: true }, content: [p(t('Сделано'))] }, { type: 'taskItem', attrs: { id: id(), checked: false }, content: [p(t('Не сделано'))] }] },
      { type: 'callout', attrs: { id: id(), variant: 'warning' }, content: [p(t('Осторожно'))] },
      { type: 'details', attrs: { id: id() }, content: [{ type: 'detailsSummary', content: [t('Подробнее')] }, { type: 'detailsContent', content: [p(t('Скрытый текст'))] }] },
      { type: 'blockMath', attrs: { id: id(), latex: 'E=mc^2' } },
      { type: 'codeBlock', attrs: { id: id(), language: 'ts' }, content: [t('const a = 1;\nconsole.log(a);')] },
      { type: 'blockquote', attrs: { id: id() }, content: [p(t('Цитата руководителя'))] },
    ],
  };
}

/** Normalises attribute defaults so documents built by hand compare with documents read back. */
const norm = (doc: PMNode) => schema.nodeFromJSON(doc).toJSON();

function stripIds(x: any): any {
  if (Array.isArray(x)) return x.map(stripIds);
  if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).filter(([k]) => k !== 'id').map(([k, v]) => [k, stripIds(v)]));
  return x;
}

describe('save and open keep the structure identical (SC-05)', () => {
  it('SC-05: a document with all inline formats, headings, nested lists, checklists, callout, toggle, formulas, links, code and quotes is stored and reopened identically', async () => {
    const page = (await org.owner.post('/api/v1/pages', { spaceId: org.personalSpaceId, title: 'Полная структура' })).page;
    const doc = richDoc();
    schema.nodeFromJSON(doc).check();
    const a = await openClient(ts.url, org.owner, page.id);
    // the editor writes exactly this way (y-prosemirror binding)
    a.doc.transact(() => prosemirrorJSONToYXmlFragment(schema, doc, a.doc.getXmlFragment('default')));
    await a.waitSaved();
    a.close();
    // "open": a new session reads the stored CRDT state
    const b = await openClient(ts.url, org.owner, page.id);
    const reopened = yXmlFragmentToProsemirrorJSON(b.doc.getXmlFragment('default'));
    b.close();
    expect(norm(reopened as PMNode)).toEqual(norm(doc));
    // the materialised JSON on the server (search, export, history) is identical as well
    const server = (await org.owner.get(`/api/v1/pages/${page.id}/content`)).content;
    await expect.poll(async () => norm((await org.owner.get(`/api/v1/pages/${page.id}/content`)).content), { timeout: 10_000 }).toEqual(norm(doc));
    expect(server.type).toBe('doc');
  });

  it('SC-05: Markdown export with markers and re-import keep the same structure (formulas, checklists, nested lists, code, quotes)', () => {
    const doc = richDoc();
    // (a leading H1 is taken as the page title by the importer, so the Markdown body starts after it)
    doc.content = doc.content!.slice(1);
    const { markdown } = docToMarkdown(doc, { markers: true });
    const back = markdownToDoc(markdown).doc;
    expect(stripIds(norm(back))).toEqual(stripIds(norm(doc)));
  });
});

describe('image by URL (R-MEDIA-009)', () => {
  it('R-MEDIA-009: the server copies an image from a URL into an attachment of the page; non-images, missing files and internal addresses are refused', async () => {
    const page = (await org.owner.post('/api/v1/pages', { spaceId: org.personalSpaceId, title: 'Картинка по ссылке' })).page;
    const r = await org.owner.post('/api/v1/attachments/from-url', { url: `${siteUrl}/img/${encodeURIComponent('Схема_цеха.png')}`, pageId: page.id });
    expect(r.attachment).toMatchObject({ pageId: page.id, kind: 'image', mime: 'image/png', width: 8, height: 8 });
    expect(r.attachment.filename).toBe('Схема_цеха.png');
    const orig = await org.owner.raw('GET', `/api/v1/attachments/${r.attachment.id}/download`);
    expect(Buffer.from(await orig.arrayBuffer()).equals(PNG)).toBe(true);
    // the declared type is not trusted: HTML served as image/png is rejected
    const fake = await expectStatus(org.owner.post('/api/v1/attachments/from-url', { url: `${siteUrl}/fake.png`, pageId: page.id }), 422);
    expect(JSON.stringify(fake)).toMatch(/не изображение/);
    await expectStatus(org.owner.post('/api/v1/attachments/from-url', { url: `${siteUrl}/page.html`, pageId: page.id }), 422);
    await expectStatus(org.owner.post('/api/v1/attachments/from-url', { url: `${siteUrl}/missing.png`, pageId: page.id }), 422);
    // SSRF: the same loopback service under a name that is not allow-listed, and cloud metadata, are refused
    const port = new URL(siteUrl).port;
    const blocked = await expectStatus(org.owner.post('/api/v1/attachments/from-url', { url: `http://localhost:${port}/img/x.png`, pageId: page.id }), 422);
    expect(JSON.stringify(blocked)).toMatch(/внутренней сети/);
    await expectStatus(org.owner.post('/api/v1/attachments/from-url', { url: 'http://169.254.169.254/latest/meta-data', pageId: page.id }), 422);
    await expectStatus(org.owner.post('/api/v1/attachments/from-url', { url: 'file:///etc/passwd', pageId: page.id }), 422);
    // only editors of the page may add images to it
    const reader = await org.user('Читатель Картинок', { pageGrants: [{ pageId: page.id, level: 'view' }] });
    await expectStatus(reader.post('/api/v1/attachments/from-url', { url: `${siteUrl}/img/x.png`, pageId: page.id }), 403);
  });
});
