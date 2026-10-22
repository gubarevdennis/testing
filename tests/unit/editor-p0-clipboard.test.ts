// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { Editor } from '@tiptap/core';
import { Slice } from '@tiptap/pm/model';
import { createSchemaExtensions } from '@kb/shared';
import { cleanPastedHtml, stripTracking, isTrackingImage } from '../../apps/web/src/editor/clipboard/html';
import { sectionRange } from '../../apps/web/src/editor/clipboard/section';
import { mergeFormatting, pasteSlice } from '../../apps/web/src/editor/extensions/pasteOptions';

let ed: Editor | null = null;
afterEach(() => {
  ed?.destroy();
  ed = null;
});
const make = (content: object[]) => (ed = new Editor({ element: document.createElement('div'), extensions: createSchemaExtensions(), content: { type: 'doc', content } }));
const p = (text: string, marks?: object[]) => ({ type: 'paragraph', content: [{ type: 'text', text, marks }] });
const h = (level: number, text: string) => ({ type: 'heading', attrs: { level }, content: [{ type: 'text', text }] });

describe('tracker cleanup in pasted HTML (R-CLIPBOARD-024)', () => {
  it('R-CLIPBOARD-024: removes utm_*/fbclid/gclid/yclid parameters, keeps others and the fragment', () => {
    expect(stripTracking('https://shop.ru/item?id=5&utm_source=mail&utm_medium=x&fbclid=abc#price')).toBe('https://shop.ru/item?id=5#price');
    expect(stripTracking('https://ya.ru/?yclid=1&gclid=2')).toBe('https://ya.ru/');
    expect(stripTracking('https://ya.ru/a?q=utm_source')).toBe('https://ya.ru/a?q=utm_source');
    expect(stripTracking('/p/abc?block=1')).toBe('/p/abc?block=1');
  });
  it('R-CLIPBOARD-024: tracking pixels and analytics counters are dropped from pasted HTML, links are cleaned', () => {
    const r = cleanPastedHtml(
      '<p><a href="https://example.com/doc?utm_campaign=spring&page=2">Документ</a></p><img src="https://mc.yandex.ru/watch/123" width="88" height="31"><img src="https://cdn.example.com/x.gif" width="1" height="1"><img src="https://cdn.example.com/photo.png" width="300">',
    );
    expect(r.html).toContain('href="https://example.com/doc?page=2"');
    expect(r.html).not.toContain('mc.yandex.ru');
    expect(r.html).not.toContain('x.gif');
    expect(r.html).toContain('photo.png');
    expect(isTrackingImage('https://www.google-analytics.com/collect?v=1', null, null)).toBe(true);
    expect(isTrackingImage('https://example.com/track.png', '400', '300')).toBe(false);
  });
});

describe('copying a section of a heading (R-CLIPBOARD-001)', () => {
  it('R-CLIPBOARD-001: a section ends before the next heading of the same or a higher level and includes subsections', () => {
    const e = make([h(1, 'Документ'), h(2, 'Приёмка'), p('Текст приёмки'), h(3, 'Подраздел'), p('Деталь'), h(2, 'Отгрузка'), p('Текст отгрузки')]);
    let at = -1;
    e.state.doc.forEach((n, off) => {
      if (n.textContent === 'Приёмка') at = off;
    });
    const r = sectionRange(e.state.doc, at)!;
    expect(e.state.doc.textBetween(r.from, r.to, '|')).toBe('Приёмка|Текст приёмки|Подраздел|Деталь');
    expect(sectionRange(e.state.doc, 0) && e.state.doc.textBetween(0, sectionRange(e.state.doc, 0)!.to, '|')).toContain('Текст отгрузки');
    let para = -1;
    e.state.doc.forEach((n, off) => {
      if (n.textContent === 'Деталь') para = off;
    });
    expect(sectionRange(e.state.doc, para)).toBeNull();
  });
});

describe('paste options (R-CLIPBOARD-009)', () => {
  it('R-CLIPBOARD-009: «Объединить» keeps structure and emphasis, drops headings, colours and highlights; «Только текст» gives paragraphs', () => {
    const e = make([
      h(2, 'Заголовок'),
      p('Цветной', [{ type: 'textStyle', attrs: { color: '#b4372b' } }]),
      p('Жирный', [{ type: 'bold' }, { type: 'highlight', attrs: { color: '#fff3bf' } }]),
      { type: 'bulletList', content: [{ type: 'listItem', content: [p('Пункт')] }] },
    ]);
    const st = { from: 0, to: e.state.doc.content.size, mode: 'keep' as const, original: e.state.doc.slice(0, e.state.doc.content.size), text: 'Заголовок\nЦветной\nЖирный\nПункт' };
    const merged = mergeFormatting(st.original.content, e.schema).toJSON() as any[];
    expect(merged.map((n) => n.type)).toEqual(['paragraph', 'paragraph', 'paragraph', 'bulletList']);
    expect(merged[1].content[0].marks).toBeUndefined();
    expect(merged[2].content[0].marks).toEqual([{ type: 'bold' }]);
    const plain = pasteSlice(st, 'text', e.schema);
    expect(plain).toBeInstanceOf(Slice);
    expect((plain.content.toJSON() as any[]).map((n) => n.type)).toEqual(['paragraph', 'paragraph', 'paragraph', 'paragraph']);
    expect(JSON.stringify(plain.content.toJSON())).not.toContain('marks');
    expect(pasteSlice(st, 'keep', e.schema)).toBe(st.original);
  });
});
