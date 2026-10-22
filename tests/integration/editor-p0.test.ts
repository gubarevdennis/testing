import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prosemirrorJSONToYXmlFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import { getKbSchema, markdownToDoc, docToMarkdown, type PMNode } from '@kb/shared';
import { startServer, setupOrg, type TestServer } from '../support/harness.js';
import { openClient } from '../support/collab.js';

let ts: TestServer;
let org: Awaited<ReturnType<typeof setupOrg>>;

beforeAll(async () => {
  ts = await startServer();
  org = await setupOrg(ts);
}, 120_000);
afterAll(async () => ts?.close());

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
