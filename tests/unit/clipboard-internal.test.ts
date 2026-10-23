// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { Editor } from '@tiptap/core';
import { Slice } from '@tiptap/pm/model';
import { createSchemaExtensions } from '@kb/shared';
import { serializeInternal, parseInternal, attachmentIdsOf } from '../../apps/web/src/editor/clipboard/internal';
import { setCopyRefLookup } from '../../apps/web/src/editor/clipboard/redact';
import { rewriteAttrs, rewriteJson } from '../../apps/web/src/editor/clipboard/rehome';

/** Internal clipboard format (R-CLIPBOARD-018): exact blocks, no leaks, untrusted on paste. */
let ed: Editor | null = null;
afterEach(() => {
  ed?.destroy();
  ed = null;
  setCopyRefLookup(() => 'visible', async () => undefined);
});

const ORIGIN = 'https://kb.corp';
const doc = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { id: 'h1', level: 2 }, content: [{ type: 'text', text: 'Раздел' }] },
    {
      type: 'paragraph',
      attrs: { id: 'p1' },
      content: [
        { type: 'text', text: 'с комментарием', marks: [{ type: 'comment', attrs: { threadId: 'thread-1' } }, { type: 'bold' }] },
        { type: 'text', text: ' и ' },
        { type: 'pageMention', attrs: { pageId: 'secret-page', title: 'Секретный проект «Феникс»' } },
      ],
    },
    { type: 'columns', attrs: { id: 'c1' }, content: [{ type: 'column', attrs: { width: 2 }, content: [{ type: 'paragraph', attrs: { id: 'l' } }] }, { type: 'column', attrs: { width: 1 }, content: [{ type: 'paragraph', attrs: { id: 'r' } }] }] },
    { type: 'image', attrs: { id: 'img', src: '/api/v1/attachments/a-1/content', attachmentId: 'a-1', width: 320, align: 'left', caption: 'Схема' } },
  ],
};

function make() {
  ed = new Editor({ element: document.createElement('div'), extensions: createSchemaExtensions(), content: doc });
  return ed;
}
const all = (e: Editor) => new Slice(e.state.doc.content, 0, 0);

describe('internal clipboard format (R-CLIPBOARD-018)', () => {
  it('round-trips node types, block ids and attributes HTML cannot carry (column widths, image size/alignment)', () => {
    const e = make();
    const data = serializeInternal(all(e), 'page-a', ORIGIN);
    const back = parseInternal(data, e.schema, ORIGIN)!;
    expect(back.pageId).toBe('page-a');
    const json = back.slice.content.toJSON() as any[];
    expect(json.map((n) => n.attrs.id)).toEqual(['h1', 'p1', 'c1', 'img']);
    expect(json[2].content.map((c: any) => c.attrs.width)).toEqual([2, 1]);
    expect(json[3].attrs).toMatchObject({ width: 320, align: 'left', caption: 'Схема', attachmentId: 'a-1' });
    expect(attachmentIdsOf(back.json)).toEqual(['a-1']);
  });

  it('leaks nothing: comment threads of the source page and titles of pages the reader cannot open are not in it', () => {
    setCopyRefLookup((id) => (id === 'secret-page' ? 'hidden' : 'visible'), async () => undefined);
    const e = make();
    const data = serializeInternal(all(e), 'page-a', ORIGIN);
    expect(data).not.toContain('thread-1');
    expect(data).not.toContain('Феникс');
    expect(data).toContain('Страница недоступна');
    expect(data).toContain('"bold"');
  });

  it('is untrusted on paste: another origin, garbage, schema-invalid content are refused; unsafe URLs are cleaned', () => {
    const e = make();
    const good = serializeInternal(all(e), 'page-a', ORIGIN);
    expect(parseInternal(good, e.schema, 'https://evil.example')).toBeNull();
    expect(parseInternal('{not json', e.schema, ORIGIN)).toBeNull();
    expect(parseInternal(JSON.stringify({ v: 2, origin: ORIGIN, slice: { content: [] } }), e.schema, ORIGIN)).toBeNull();
    // a column outside of a column set is not valid content
    expect(parseInternal(JSON.stringify({ v: 1, origin: ORIGIN, pageId: null, slice: { content: [{ type: 'columns', content: [{ type: 'column', content: [{ type: 'paragraph' }] }] }], openStart: 0, openEnd: 0 } }), e.schema, ORIGIN)).toBeNull();
    const evil = {
      v: 1,
      origin: ORIGIN,
      pageId: 'x',
      slice: {
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'клик', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] },
          { type: 'image', attrs: { src: 'javascript:alert(2)' } },
          { type: 'embed', attrs: { url: 'javascript:alert(3)', kind: 'link' } },
        ],
        openStart: 0,
        openEnd: 0,
      },
    };
    const r = parseInternal(JSON.stringify(evil), e.schema, ORIGIN)!;
    const out = JSON.stringify(r.slice.content.toJSON());
    expect(out).not.toContain('javascript:');
    expect(out).toContain('клик');
  });

  it('attachment references are rewritten to the copies of the target page (attribute values containing the id too)', () => {
    const map = new Map([['a-1', 'b-9']]);
    expect(rewriteAttrs({ src: '/api/v1/attachments/a-1/content?variant=preview', attachmentId: 'a-1', alt: 'a-1 схема' }, map)).toEqual({
      src: '/api/v1/attachments/b-9/content?variant=preview',
      attachmentId: 'b-9',
      alt: 'a-1 схема',
    });
    expect(rewriteAttrs({ attachmentId: 'zzz' }, map)).toBeNull();
    const json = rewriteJson([{ type: 'callout', content: [{ type: 'fileBlock', attrs: { attachmentId: 'a-1', name: 'f.pdf' } }] }] as any, map);
    expect((json[0] as any).content[0].attrs.attachmentId).toBe('b-9');
  });

  it('a text fragment (open slice) keeps its openness', () => {
    const e = make();
    const slice = e.state.doc.slice(3, 8); // inside the heading
    const back = parseInternal(serializeInternal(slice, 'p', ORIGIN), e.schema, ORIGIN)!;
    expect(back.slice.openStart).toBe(slice.openStart);
    expect(back.slice.content.eq(slice.content)).toBe(true);
  });
});
