// @vitest-environment happy-dom
/**
 * Footnotes (R-EDITOR-038), inline images (R-MEDIA-007) and the single ingest pipeline (R-IMPORT-021) at unit level:
 * schema migration 1 → 2, Markdown / HTML round trips, recognition of footnotes of other applications, and the proof
 * that the paste path (browser DOM) and the import path (server, happy-dom) give the same document and the same report.
 */
import { describe, it, expect } from 'vitest';
import {
  getKbSchema,
  migrateContent,
  migrateLegacyFootnotes,
  docToMarkdown,
  markdownToDoc,
  docToPlainText,
  collectFootnotes,
  footnotesToEndnotes,
  ingestHtml,
  ingestClipboard,
  ingestMarkdown,
  ingestText,
  ingestRows,
  clipboardKind,
  docFingerprint,
  toFootnoteContent,
  CONTENT_SCHEMA_VERSION,
  parseTsv,
  type PMNode,
} from '@kb/shared';
import * as md from '@kb/shared/markdown';
import { htmlToDoc, importMarkdown, importText, importRows, docToHtml } from '../../apps/server/src/convert/html';
import { jsonToUpdate, updateToJson } from '../../apps/server/src/collab/ydoc';
import { diffDocs } from '../../apps/server/src/services/revisions';

const env = () => ({ parser: new DOMParser(), markdown: md, origin: 'https://kb.example' });
const valid = (doc: PMNode) => getKbSchema().nodeFromJSON(doc).check();
const t = (text: string, marks?: PMNode['marks']): PMNode => ({ type: 'text', text, ...(marks ? { marks } : {}) });
const sup = (text: string) => t(text, [{ type: 'superscript' }]);
const p = (...content: PMNode[]): PMNode => ({ type: 'paragraph', content });
const footnotes = (doc: PMNode) => collectFootnotes(doc).map((f) => f.text);

describe('R-EDITOR-038 footnotes: schema, migration 1 → 2 (D-36)', () => {
  const legacy = (): PMNode => ({
    type: 'doc',
    content: [
      p(t('Освещённость'), sup('[1]'), t(' и шум'), sup('[2]'), t('.')),
      { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [p(t('ячейка'), sup('[1]'))] }] }] },
      { type: 'heading', attrs: { level: 3 }, content: [t('Сноски')] },
      {
        type: 'orderedList',
        attrs: { start: 1 },
        content: [
          { type: 'listItem', content: [p(t('СП 52', [{ type: 'bold' }])), p(t('второй абзац'))] },
          { type: 'listItem', content: [p(t('СН 2.2.4'))] },
        ],
      },
      { type: 'details', content: [{ type: 'detailsSummary', content: [t('Колонтитулы')] }, { type: 'detailsContent', content: [p(t('x'))] }] },
    ],
  });

  it('the shipped schema has footnote and inline image nodes and version ≥ 2', () => {
    expect(CONTENT_SCHEMA_VERSION).toBeGreaterThanOrEqual(2);
    const s = getKbSchema();
    expect(s.nodes.footnote.isInline && s.nodes.footnote.isAtom).toBe(true);
    expect(s.nodes.inlineImage.isInline).toBe(true);
    valid({ type: 'doc', content: [p(t('a'), { type: 'footnote', content: [t('note', [{ type: 'italic' }]), { type: 'hardBreak' }, t('2')] }, { type: 'inlineImage', attrs: { src: '/x.png', alt: 'i' } })] });
  });

  it('the legacy «Сноски» section of version-1 imports becomes footnote nodes (references repeated per use, marks kept, appendix kept)', () => {
    const r = migrateContent(legacy(), 1);
    expect(r.version).toBe(CONTENT_SCHEMA_VERSION);
    expect(r.applied).toEqual(['Сноски и изображения в строке']);
    valid(r.doc);
    expect(r.doc.content!.map((n) => n.type)).toEqual(['paragraph', 'table', 'details']);
    expect(footnotes(r.doc)).toEqual(['СП 52\nвторой абзац', 'СН 2.2.4', 'СП 52\nвторой абзац']);
    const first = r.doc.content![0].content!.find((n) => n.type === 'footnote')!;
    expect(first.content![0]).toEqual(t('СП 52', [{ type: 'bold' }]));
    expect(JSON.stringify(r.doc)).not.toContain('[1]');
  });

  it('anything ambiguous is left untouched (no guessing on user content)', () => {
    const cases: PMNode[] = [];
    // a heading «Сноски» written by a user, with no markers
    const a = legacy();
    a.content![0] = p(t('Без ссылок'));
    a.content![1] = p(t('x'));
    cases.push(a);
    // a marker number without a note
    const b = legacy();
    b.content![0].content!.push(sup('[3]'));
    cases.push(b);
    // a superscript with other text around a marker
    const c = legacy();
    c.content![0].content!.push(sup('x[2]'));
    cases.push(c);
    // two sections
    const d = legacy();
    d.content!.splice(4, 0, { type: 'heading', attrs: { level: 3 }, content: [t('Концевые сноски')] }, { type: 'orderedList', content: [{ type: 'listItem', content: [p(t('e'))] }] });
    cases.push(d);
    // text after the section
    const e = legacy();
    e.content!.push(p(t('продолжение статьи')));
    cases.push(e);
    for (const doc of cases) expect(migrateLegacyFootnotes(doc)).toBe(doc);
  });

  it('note content: blocks joined by line breaks, inline nodes become text, comment anchors dropped', () => {
    const c = toFootnoteContent([
      p(t('a', [{ type: 'comment', attrs: { threadId: 'x' } }]), { type: 'mention', attrs: { id: 'u', label: 'Иван' } }),
      { type: 'bulletList', content: [{ type: 'listItem', content: [p(t('b'))] }] },
      p({ type: 'inlineMath', attrs: { latex: 'E=mc^2' } }),
    ]);
    expect(c).toEqual([t('a@Иван'), { type: 'hardBreak' }, t('b'), { type: 'hardBreak' }, t('E=mc^2', [{ type: 'code' }])]);
  });

  it('history compare shows a change of a note as a change of its paragraph, word by word', () => {
    const before: PMNode = { type: 'doc', content: [{ type: 'paragraph', attrs: { id: 'p1' }, content: [t('Норма'), { type: 'footnote', content: [t('СП 52 редакция 2016')] }] }] };
    const after = structuredClone(before);
    after.content![0].content![1].content![0].text = 'СП 52 редакция 2024';
    const d = diffDocs(before, after);
    expect(d.blocks).toHaveLength(1);
    expect(d.blocks[0]).toMatchObject({ id: 'p1', status: 'changed' });
    const parts = (d.blocks[0] as any).parts as Array<{ value: string; added?: boolean; removed?: boolean }>;
    expect(parts.filter((x) => x.removed).map((x) => x.value).join('')).toContain('2016');
    expect(parts.filter((x) => x.added).map((x) => x.value).join('')).toContain('2024');
    expect(parts.filter((x) => !x.added && !x.removed).map((x) => x.value).join('')).toContain('Норма [СП 52 редакция');
  });

  it('search / history text contains the note; Yjs round trip keeps it', () => {
    const doc: PMNode = { type: 'doc', content: [p(t('Норма'), { type: 'footnote', content: [t('ГОСТ 12.1')] }, t(' соблюдается'))] };
    expect(docToPlainText(doc)).toBe('Норма [ГОСТ 12.1] соблюдается');
    const back = updateToJson(jsonToUpdate(doc));
    expect(footnotes(back)).toEqual(['ГОСТ 12.1']);
  });
});

describe('R-EDITOR-038 footnotes: Markdown and HTML round trips, other applications', () => {
  const doc: PMNode = {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 2 }, content: [t('Раздел'), { type: 'footnote', content: [t('к заголовку')] }] },
      p(t('Первый'), { type: 'footnote', content: [t('ГОСТ ', []), t('Р 1', [{ type: 'bold' }]), { type: 'hardBreak' }, t('стр. 4')] }, t(' и второй'), { type: 'footnote', content: [t('см. '), t('сайт', [{ type: 'link', attrs: { href: 'https://e.com/' } }])] }, t('.')),
    ],
  };

  it('Markdown [^n]: export → import gives the same notes in the same order', () => {
    const { markdown, warnings } = docToMarkdown(doc);
    expect(warnings).toEqual([]);
    expect(markdown).toContain('Первый[^2]');
    expect(markdown).toContain('[^1]: к заголовку');
    expect(markdown).toMatch(/\[\^2\]: ГОСТ \*\*Р 1\*\* стр\. 4/);
    const back = markdownToDoc(markdown).doc;
    valid(back);
    expect(footnotes(back)).toEqual(['к заголовку', 'ГОСТ Р 1 стр. 4', 'см. сайт']);
    expect(collectFootnotes(back)[2].node.content!.find((n) => n.text === 'сайт')!.marks![0]).toMatchObject({ type: 'link', attrs: { href: 'https://e.com/' } });
  });

  it('HTML export (numbered references + notes list) → import restores footnotes (DOCX/HTML/clipboard share it)', () => {
    const html = docToHtml(doc);
    expect(html).toContain('<sup class="kb-fn-ref"><a href="#kb-fn-1" id="kb-fnref-1">1</a></sup>');
    expect(html).toContain('<section class="kb-footnotes" data-type="footnotes">');
    const back = htmlToDoc(html).doc;
    expect(footnotes(back)).toEqual(['к заголовку', 'ГОСТ Р 1\nстр. 4', 'см. сайт']);
    expect(JSON.stringify(back)).not.toContain('↩');
  });

  it('footnotes of Word (clipboard HTML), Google Docs, GitHub/pandoc and mammoth are recognised; ordinary #anchors are not', () => {
    const word = `<p class=MsoNormal>Текст<a style='mso-footnote-id:ftn1' href="#_ftn1" name="_ftnref1" title=""><span class=MsoFootnoteReference><span style='mso-special-character:footnote'><span class=MsoFootnoteReference>[1]</span></span></span></a> дальше</p><div style='mso-element:footnote-list'><hr align=left size=1 width="33%"><div style='mso-element:footnote' id=ftn1><p class=MsoFootnoteText><a style='mso-footnote-id:ftn1' href="#_ftnref1" name="_ftn1" title=""><span class=MsoFootnoteReference><span>[1]</span></span></a> Примечание Word</p></div></div>`;
    const gdocs = `<p>Google<sup><a href="#ftnt1" id="ftnt_ref1">[1]</a></sup> doc</p><hr><div><p><a href="#ftnt_ref1" id="ftnt1">[1]</a><span> Заметка Google</span></p></div>`;
    const github = `<p>GitHub<sup><a href="#user-content-fn-1" id="user-content-fnref-1" data-footnote-ref>1</a></sup></p><section data-footnotes class="footnotes"><h2 id="footnote-label" class="sr-only">Footnotes</h2><ol><li id="user-content-fn-1"><p>Сноска GitHub <a href="#user-content-fnref-1" data-footnote-backref class="data-footnote-backref">↩</a></p></li></ol></section>`;
    const mammoth = `<p>Word-файл<sup><a href="#footnote-1" id="footnote-ref-1">[1]</a></sup></p><ol><li id="footnote-1"><p>Сноска из DOCX <a href="#footnote-ref-1">↑</a></p></li></ol>`;
    for (const [html, note, text] of [
      [word, 'Примечание Word', 'Текст дальше'],
      [gdocs, 'Заметка Google', 'Google doc'],
      [github, 'Сноска GitHub', 'GitHub'],
      [mammoth, 'Сноска из DOCX', 'Word-файл'],
    ]) {
      const r = ingestHtml(html, env());
      expect(footnotes(r.doc)).toEqual([note]);
      expect(r.report.converted.footnotes).toBe(1);
      expect(r.doc.content!.map((n) => n.type).filter((x) => x !== 'horizontalRule')).toEqual(['paragraph']);
      expect(docToPlainText(r.doc).replace(/ \[.*?\]/, '')).toBe(text);
    }
    const anchors = ingestHtml('<p>См. <a href="#intro">введение</a></p><h2 id="intro">Введение</h2>', env());
    expect(collectFootnotes(anchors.doc)).toEqual([]);
    expect(anchors.doc.content!.map((n) => n.type)).toEqual(['paragraph', 'heading']);
  });

  it('copied HTML (footnotesToEndnotes) pasted back gives the same footnotes', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>a<span data-type="footnote">note <b>b</b></span> c<span data-type="footnote">two</span></p>';
    expect(footnotesToEndnotes(root)).toBe(2);
    expect(root.querySelectorAll('section.kb-footnotes li')).toHaveLength(2);
    const r = ingestHtml(root.innerHTML, env());
    expect(footnotes(r.doc)).toEqual(['note b', 'two']);
  });
});

describe('R-MEDIA-007 inline images', () => {
  it('HTML: a picture in a line of text is inline, a lone picture (or a figure) is a block — without an empty paragraph', () => {
    const r = ingestHtml('<p>Нажмите <img src="https://e.com/btn.png" alt="кнопка" width="24"> и подождите</p><p><img src="https://e.com/big.png" alt="схема"></p><figure><img src="https://e.com/f.png"><figcaption>Рис. 1</figcaption></figure><p><img src="https://e.com/a.png"><img src="https://e.com/b.png"></p>', env());
    expect(r.doc.content!.map((n) => n.type)).toEqual(['paragraph', 'image', 'image', 'paragraph']);
    expect(r.doc.content![0].content!.map((n) => n.type)).toEqual(['text', 'inlineImage', 'text']);
    expect(r.doc.content![0].content![1].attrs).toMatchObject({ src: 'https://e.com/btn.png', alt: 'кнопка', width: 24 });
    expect(r.doc.content![2].attrs!.caption).toBe('Рис. 1');
    expect(r.doc.content![3].content!.map((n) => n.type)).toEqual(['inlineImage', 'inlineImage']);
    expect(r.remoteImages.sort()).toEqual(['https://e.com/a.png', 'https://e.com/b.png', 'https://e.com/big.png', 'https://e.com/btn.png', 'https://e.com/f.png']);
  });

  it('Markdown and HTML round trips keep size, vertical alignment, alt, caption and the attachment', () => {
    const doc: PMNode = {
      type: 'doc',
      content: [p(t('Значок '), { type: 'inlineImage', attrs: { src: '/api/v1/attachments/11111111-1111-4111-8111-111111111111/content', attachmentId: '11111111-1111-4111-8111-111111111111', alt: 'ok', title: 'Готово', width: 20, valign: 'middle' } }, t(' в строке'))],
    };
    const mdBack = markdownToDoc(docToMarkdown(doc).markdown).doc;
    expect(mdBack.content![0].content![1]).toMatchObject({ type: 'inlineImage', attrs: { attachmentId: '11111111-1111-4111-8111-111111111111', alt: 'ok', title: 'Готово', width: 20, valign: 'middle' } });
    const htmlBack = htmlToDoc(docToHtml(doc)).doc;
    expect(htmlBack.content![0].content![1]).toMatchObject({ type: 'inlineImage', attrs: { attachmentId: '11111111-1111-4111-8111-111111111111', alt: 'ok', title: 'Готово', width: 20, valign: 'middle' } });
  });

  it('a picture whose source cannot be used is a visible placeholder, reported', () => {
    const r = ingestHtml('<p>Иконка <img src="javascript:alert(1)" alt="x"> тут</p>', env());
    expect(JSON.stringify(r.doc)).not.toContain('javascript');
    expect(r.report.dropped.images).toBe(1);
  });
});

describe('R-IMPORT-021 one pipeline: paste and import give the same result and the same report', () => {
  const strip = (d: PMNode) => docFingerprint(d);
  const HTML = `<html><head><style>p{color:red}</style><script>alert(1)</script></head><body>
    <h1>Регламент</h1><script>alert(2)</script><form><input name="q"></form><p style="color:#123456;font-family:Comic Sans MS">Текст <b>жирный</b> <a href="https://e.com/?utm_source=x&id=7">ссылка</a> <img src="https://t.example/p.gif" width="1" height="1"></p>
    <p>Со сноской<sup><a href="#fn1" id="fnref1">1</a></sup> и картинкой <img src="https://e.com/i.png" alt="i"> в строке</p>
    <ul><li>один</li><li>два<ul><li>вложенный</li></ul></li></ul>
    <table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>
    <p><img src="file:///C:/tmp/x.png" alt="локальная"></p>
    <section class="footnotes"><ol><li id="fn1"><p>Примечание <a href="#fnref1">↩</a></p></li></ol></section></body></html>`;

  it('text/html: browser paste path ≡ server import path (document and report)', () => {
    const paste = ingestClipboard({ html: HTML, text: 'ignored' }, env());
    expect(paste.kind).toBe('html');
    const imp = htmlToDoc(HTML, { origin: 'https://kb.example' });
    expect(strip(paste.doc)).toBe(strip(imp.doc));
    expect(paste.report).toEqual(imp.report);
    expect(paste.report.dropped).toMatchObject({ images: 1, removedElements: 2, trackingPixels: 1, trackingLinks: 1 });
    expect(paste.report.converted).toMatchObject({ headings: 1, lists: 2, tables: 1, footnotes: 1, inlineImages: 1 });
    expect(paste.report.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(['dropped-images', 'dropped-trackingPixels', 'dropped-removedElements']));
    expect(JSON.stringify(paste.doc)).not.toMatch(/utm_source|script|Comic/);
    valid(paste.doc);
  });

  it('text/markdown and Markdown-looking text ≡ .md import', () => {
    const MD = '# Заголовок\n\nТекст **жирный** со сноской[^1] и ![значок](https://e.com/i.png) в строке.\n\n- [ ] задача\n- [x] готово\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n<details><summary>Ещё</summary>\n\nвнутри\n\n</details>\n\n[^1]: Примечание.\n';
    const viaType = ingestClipboard({ markdown: MD, text: MD }, env());
    const viaText = ingestClipboard({ text: MD }, env());
    expect(viaType.kind).toBe('markdown');
    expect(viaText.kind).toBe('markdown');
    const imp = importMarkdown(MD);
    // a file's leading H1 is the page title; a paste keeps it as a heading — otherwise identical
    expect(imp.title).toBe('Заголовок');
    expect(viaType.doc.content![0]).toMatchObject({ type: 'heading', attrs: { level: 1 } });
    const body = (d: PMNode) => strip({ ...d, content: d.content!.slice(1) });
    expect(body(viaType.doc)).toBe(strip(imp.doc));
    expect(body(viaText.doc)).toBe(strip(imp.doc));
    expect(viaType.report.warnings).toEqual(imp.report.warnings);
    expect(viaType.report.dropped).toEqual(imp.report.dropped);
    expect(footnotes(imp.doc)).toEqual(['Примечание.']);
    expect(ingestMarkdown(MD, env()).title).toBe('Заголовок');
  });

  it('text/plain ≡ .txt import; TSV range ≡ CSV/XLSX rows imported as a table', () => {
    const TXT = 'Первая строка\nвторая строка\n\nтретья\t с табуляцией';
    const paste = ingestClipboard({ text: TXT }, env());
    expect(paste.kind).toBe('text');
    expect(strip(paste.doc)).toBe(strip(importText(TXT).doc));
    expect(strip(paste.doc)).toBe(strip(ingestText(TXT).doc));
    const TSV = 'Имя\tКоличество\nБолт\t"10\n(в упаковке)"\nГайка\t5';
    const range = ingestClipboard({ text: TSV }, env());
    expect(range.kind).toBe('rows');
    const rows = parseTsv(TSV);
    expect(strip(range.doc)).toBe(strip({ type: 'doc', content: [importRows(rows, true)] }));
    expect(strip(range.doc)).toBe(strip(ingestRows(rows, { header: true }).doc));
    expect(range.doc.content![0].content![1].content![1].content!.map((c) => c.content?.[0]?.text)).toEqual(['10', '(в упаковке)']);
  });

  it('plain paste (Ctrl+Shift+V) ignores formatting; pictures/files only go to the upload path; code editors paste as text', () => {
    expect(clipboardKind({ html: '<b>x</b>', text: 'x', plain: true })).toBe('text');
    expect(clipboardKind({ html: '<img src="x.png">', files: [{ name: 'a.png', type: 'image/png', size: 1 }] })).toBe('files');
    expect(clipboardKind({ html: '<table><tr><td>1</td></tr></table>', files: [{ name: 'a.png', type: 'image/png', size: 1 }] })).toBe('html');
    expect(clipboardKind({ html: '<meta charset="utf-8"><div style="white-space: pre;">const a = 1;</div>', text: 'const a = 1;' })).toBe('text');
    const files = ingestClipboard({ files: [{ name: 'Схема_склада.png', type: 'image/png', size: 10 }, { name: 'отчёт.pdf', type: 'application/pdf', size: 20 }] }, env(), (_f, i) => ({ uploadId: 'u' + i }));
    expect(files.doc.content!.map((n) => [n.type, n.attrs?.alt ?? n.attrs?.name, n.attrs?.uploadId])).toEqual([
      ['image', 'Схема склада', 'u0'],
      ['fileBlock', 'отчёт.pdf', 'u1'],
    ]);
  });

  it('embedded (data:) pictures are tokens for the caller on both sides; the same count', () => {
    const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const html = `<p>до</p><p><img src="${PNG}" alt="встроенная"></p><p>после <img src="${PNG}" alt="в строке"> текста</p>`;
    const paste = ingestClipboard({ html }, env());
    const imp = htmlToDoc(html);
    expect(paste.images.map((i) => i.alt)).toEqual(['встроенная', 'в строке']);
    expect(imp.images.map((i) => i.alt)).toEqual(['встроенная', 'в строке']);
    expect(strip(paste.doc)).toBe(strip(imp.doc));
    expect(paste.doc.content!.map((n) => n.type)).toEqual(['paragraph', 'image', 'paragraph']);
  });
});
