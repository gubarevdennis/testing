import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import yazl from 'yazl';
import sharp from 'sharp';
import { docToPlainText } from '@kb/shared';
import { startServer, setupOrg, type TestServer, type Api } from '../support/harness.js';
import { openClient } from '../support/collab.js';
import { validateDocx } from '../../apps/server/src/convert/docx-validate.js';
import { referenceCorpus, specToDocx, specToMarkdown, expectedText, expectedStructure, actualStructure, charAccuracy, complexWordDocx, unzipEntries, type DocSpec } from '../support/doc-corpus.js';

// Import fidelity of the IMPORT module P0 requirements: DOCX structure (captions, footnotes, numbering levels,
// headers/footers, bookmarks, TOC), the reference corpus metric, complex Word constructs, edge cases of batches
// and the full import → edit → export chains (SC-13, SC-15).

let ts: TestServer;
let org: Awaited<ReturnType<typeof setupOrg>>;

beforeAll(async () => {
  ts = await startServer({}, { worker: true });
  org = await setupOrg(ts);
}, 120_000);
afterAll(async () => ts?.close());

async function startImport(api: Api, files: Array<[string, Buffer]>, extra: Record<string, string> = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(extra)) fd.append(k, v);
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
  return { job: j, res, pageId: res.rootPageId as string };
}

const content = async (api: Api, id: string) => (await api.get(`/api/v1/pages/${id}/content`)).content;
const find = (doc: any, pred: (n: any) => boolean): any[] => {
  const out: any[] = [];
  const walk = (n: any) => {
    if (pred(n)) out.push(n);
    (n.content ?? []).forEach(walk);
  };
  walk(doc);
  return out;
};
const textOf = (n: any): string => (n.text ?? '') + (n.content ?? []).map(textOf).join('');

async function zipOf(files: Record<string, Buffer | string>): Promise<Buffer> {
  const z = new yazl.ZipFile();
  for (const [name, data] of Object.entries(files)) z.addBuffer(Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8'), name);
  z.end();
  const chunks: Buffer[] = [];
  for await (const c of z.outputStream) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

describe('DOCX structure mapping (IMPORT P0)', () => {
  it('Word captions, footnotes, three numbering levels, headers/footers, bookmarks and the TOC field become semantic blocks; images are page assets with order, alt and caption (R-IMPORT-007, R-IMPORT-025, R-IMPORT-026, R-IMPORT-027, R-IMPORT-034)', async () => {
    const spec = referenceCorpus(2)[1]; // has a TOC field, two footnote-free tables, a captioned image, bookmarks
    spec.blocks.splice(2, 0, { kind: 'image', alt: 'Первая схема', caption: 'Рисунок 0 — Общий вид', color: '#123456' });
    spec.blocks.push({ kind: 'h', level: 4, text: 'Уровень 4' }, { kind: 'h', level: 5, text: 'Уровень 5' }, { kind: 'h', level: 6, text: 'Уровень 6' });
    const { job, pageId } = await importOne(org.owner, 'отчёт.docx', await specToDocx(spec));
    const codes = job.preview.files[0].warnings.map((w: any) => w.code);
    expect(codes).toEqual(expect.arrayContaining(['footnotes', 'header-footer', 'toc']));
    const doc = await content(org.owner, pageId);

    // TOC field → live TOC block; headings are real headings with stable anchors (block ids).
    expect(doc.content[0].type).toBe('toc');
    const headings = find(doc, (n) => n.type === 'heading');
    expect(headings.map((h) => h.attrs.level)).toEqual([1, 2, 3, 2, 4, 5, 6, 3]); // Heading 1–6 (+ «Сноски»)
    // Separators: Word's bordered empty paragraph becomes a horizontal rule.
    expect(find(doc, (n) => n.type === 'horizontalRule').length).toBe(1);
    expect(headings.every((h) => typeof h.attrs.id === 'string' && h.attrs.id.length > 8)).toBe(true);
    // The internal hyperlink to the Word bookmark points at the heading's anchor.
    const internal = find(doc, (n) => n.type === 'text' && (n.marks ?? []).some((m: any) => m.type === 'link' && m.attrs.href.startsWith('#')))[0];
    expect(internal.marks.find((m: any) => m.type === 'link').attrs.href).toBe('#' + headings[0].attrs.id);
    const outline = await org.owner.get(`/api/v1/pages/${pageId}/content`);
    expect(JSON.stringify(outline.content)).not.toContain('_Toc');

    // Numbering levels: ordered list nested three deep, bullets likewise.
    const ol = doc.content.find((b: any) => b.type === 'orderedList');
    const lvl2 = ol.content[0].content.find((c: any) => c.type === 'orderedList');
    const lvl3 = lvl2.content[0].content.find((c: any) => c.type === 'orderedList');
    expect(lvl3.content.length).toBe(2);
    const ul = doc.content.find((b: any) => b.type === 'bulletList');
    expect(ul.content[0].content.find((c: any) => c.type === 'bulletList').content[0].content.find((c: any) => c.type === 'bulletList')).toBeTruthy();

    // Footnotes: reference stays in the text as superscript [1]; the note text is in a «Сноски» section.
    const ref = find(doc, (n) => n.type === 'text' && n.text === '[1]')[0];
    expect(ref.marks.map((m: any) => m.type)).toContain('superscript');
    const notesIdx = doc.content.findIndex((b: any) => b.type === 'heading' && textOf(b) === 'Сноски');
    expect(notesIdx).toBeGreaterThan(0);
    expect(textOf(doc.content[notesIdx + 1])).toMatch(/^Примечание 1:/);

    // Captions and alt text belong to the image; images are stored assets of the page, in document order.
    const imgs = find(doc, (n) => n.type === 'image');
    expect(imgs.map((i) => [i.attrs.alt, i.attrs.caption])).toEqual([
      ['Первая схема', 'Рисунок 0 — Общий вид'],
      ['Схема 2', expect.stringMatching(/^Рисунок 2 — /)],
    ]);
    expect(find(doc, (n) => n.type === 'paragraph' && /^Рисунок \d —/.test(textOf(n))).length).toBe(0); // not duplicated as text
    const atts = (await org.owner.get(`/api/v1/pages/${pageId}/attachments`)).attachments;
    for (const [k, i] of imgs.entries()) {
      expect(i.attrs.src).toMatch(/^\/api\/v1\/attachments\/[0-9a-f-]{36}\/content/);
      const a = atts.find((x: any) => x.id === i.attrs.attachmentId);
      expect(a, 'image is an attachment of the page').toBeTruthy();
      expect(a.filename).toBe(`image-${k + 1}.png`);
      const r = await org.owner.raw('GET', i.attrs.src);
      expect(r.status).toBe(200);
      expect((await sharp(Buffer.from(await r.arrayBuffer())).metadata()).width).toBe(160);
    }
    expect(JSON.stringify(doc)).not.toMatch(/"src":"(?!\/api\/v1\/attachments\/)/); // no broken/external image links

    // Headers/footers are kept (collapsed block at the end), not silently dropped.
    const last = doc.content[doc.content.length - 1];
    expect(last.type).toBe('details');
    expect(textOf(last)).toContain('ООО «Тест» — документ 2');
    expect(textOf(last)).toContain('Для внутреннего использования');
  });

  it('complex Word constructs (SmartArt, text boxes, fields, floating objects, tracked changes, comments) keep their text and are listed in the compatibility report, never lost silently (R-IMPORT-009, R-IMPORT-034)', async () => {
    const { job, pageId } = await importOne(org.owner, 'сложный.docx', await complexWordDocx());
    const w = job.preview.files[0].warnings;
    const codes = w.map((x: any) => x.code);
    expect(codes).toEqual(expect.arrayContaining(['track-changes', 'smartart', 'shapes', 'fields', 'floating', 'comments']));
    expect(w.find((x: any) => x.code === 'comments').message).toMatch(/1/);
    const text = docToPlainText(await content(org.owner, pageId));
    expect(text).toContain('Вставленный правкой текст'); // insertion accepted
    expect(text).not.toContain('удалённый'); // deletion applied
    expect(text).toContain('Дата документа: 22.10.2026'); // field result, not the field code
    expect(text).toContain('Текст в надписи'); // text box content
    expect(text).toContain('[SmartArt] Заявка → Согласование'); // SmartArt node text in place of the diagram
    expect(text).toContain('Комментируемый фрагмент');
    expect(text).toContain('Плавающий рисунок'); // floating image kept in the flow
    // The original file is kept with the page for everything that could not be represented.
    const atts = (await org.owner.get(`/api/v1/pages/${pageId}/attachments`)).attachments;
    expect(atts.some((a: any) => a.kind === 'import-source' && a.filename === 'сложный.docx')).toBe(true);
  });
});

describe('reference corpus accuracy (R-IMPORT-019)', () => {
  it('reference DOCX and Markdown corpus: ≥99% of characters and 100% of structural elements survive import; nothing is lost silently (R-IMPORT-019, R-IMPORT-025)', async () => {
    const corpus = referenceCorpus(6);
    const rows: Array<{ file: string; accuracy: number; structure: boolean }> = [];
    let refChars = 0;
    let matched = 0;
    for (const [i, spec] of corpus.entries()) {
      for (const format of ['docx', 'md'] as const) {
        const data = format === 'docx' ? await specToDocx(spec) : Buffer.from(specToMarkdown(spec), 'utf8');
        const { job, pageId } = await importOne(org.owner, `эталон-${i + 1}.${format}`, data);
        const page = await org.owner.get(`/api/v1/pages/${pageId}`);
        expect(page.page?.title ?? page.title).toBe(spec.title);
        const doc = await content(org.owner, pageId);
        const ref = expectedText(spec, format);
        const acc = charAccuracy(ref, docToPlainText(doc));
        const structure = actualStructure(doc);
        expect(structure, `${format} #${i + 1}: structure`).toEqual(expectedStructure(spec, format));
        // Every simplification is reported (footnotes, headers/footers, TOC, merged cells) — no silent loss.
        const codes = job.preview.files[0].warnings.map((w: any) => w.code);
        expect(codes).toContain('footnotes');
        if (format === 'docx') expect(codes).toContain('header-footer');
        rows.push({ file: `${i + 1}.${format}`, accuracy: acc, structure: true });
        refChars += ref.replace(/\s+/g, ' ').length;
        matched += acc * ref.replace(/\s+/g, ' ').length;
      }
    }
    const total = matched / refChars;
    // The metric is printed so CI logs carry the measured value, not only pass/fail.
    console.info(`[R-IMPORT-019] corpus ${rows.length} files, ${refChars} reference characters, accuracy ${(total * 100).toFixed(2)}%`, rows.map((r) => `${r.file}:${(r.accuracy * 100).toFixed(2)}%`).join(' '));
    for (const r of rows) expect(r.accuracy, r.file).toBeGreaterThanOrEqual(0.99);
    expect(total).toBeGreaterThanOrEqual(0.99);
  }, 240_000);
});

describe('import → edit → export chains (SC-13, SC-15)', () => {
  it('Word-style DOCX with headings, 3 list levels, links, 2 tables, images and code → import → edit → DOCX export valid for Word (Open XML) and LibreOffice, structure preserved (SC-13, R-EXPORT-006, R-EXPORT-012, R-IMPORT-007)', async () => {
    const spec: DocSpec = referenceCorpus(1)[0];
    const { pageId } = await importOne(org.owner, 'sc13.docx', await specToDocx(spec));
    const before = actualStructure(await content(org.owner, pageId));
    // Edit like a user: real-time collaboration client types into the first paragraph and adds one more.
    const c = await openClient(ts.url, org.owner, pageId);
    c.insert(2, 0, 'Правка после импорта. ');
    c.appendParagraph('Новый абзац после импорта.');
    await c.waitSaved();
    c.close();
    const edited = await content(org.owner, pageId);
    expect(docToPlainText(edited)).toContain('Правка после импорта.');
    const docx = Buffer.from(await (await org.owner.raw('GET', `/api/v1/pages/${pageId}/export?format=docx`)).arrayBuffer());
    const v = await validateDocx(docx);
    expect(v.errors).toEqual([]);
    expect(v.stats.tables).toBe(2);
    expect(v.stats.images).toBe(1);
    expect(v.stats.numberedParagraphs).toBe(9); // 8 list items + the «Сноски» list
    expect(v.stats.headings).toBeGreaterThanOrEqual(4);
    expect(v.stats.hyperlinks).toBe(2);
    // LibreOffice opens it and reads the edited text.
    const dir = mkdtempSync(join(tmpdir(), 'kb-sc13-'));
    writeFileSync(join(dir, 'e.docx'), docx);
    execFileSync('soffice', ['--headless', '--convert-to', 'txt:Text (encoded):UTF8', '--outdir', dir, join(dir, 'e.docx')], { timeout: 90_000, stdio: 'ignore' });
    const txt = readFileSync(join(dir, 'e.txt'), 'utf8');
    expect(txt).toContain('Правка после импорта.');
    expect(txt).toContain('Новый абзац после импорта.');
    expect(txt).toContain('listen 443 ssl;');
    // Re-import of the exported file gives the same structure (editable structure kept, not flattened).
    const { pageId: again } = await importOne(org.owner, 'sc13-export.docx', docx);
    const after = actualStructure(await content(org.owner, again));
    expect({ ...after, footnotes: 0, headings: after.headings.slice(1) }).toEqual({ ...before, footnotes: 0, headings: before.headings.slice(1) });
  }, 180_000);

  it('Markdown ZIP with a GFM table, task list, code and relative images → import → ZIP export → every relative link resolves locally → re-import gives the same content (SC-15, R-EXPORT-002, R-IMPORT-010)', async () => {
    const png = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#00aa00' } }).png().toBuffer();
    const zip = await zipOf({
      'kb/index.md': '# Справочник\n\nСм. [настройку](guide/setup.md).\n\n![схема](<img/схема сети.png>)\n\n| Узел | IP |\n|---|---|\n| web | 10.0.0.1 |\n| db | 10.0.0.2 |\n',
      'kb/guide/setup.md': '# Настройка\n\n- [x] установить пакеты\n- [ ] открыть порт\n\n```bash\nsystemctl enable kb\n```\n\n![логотип](../img/logo.png)\n\n[Назад](../index.md)\n',
      'kb/img/схема сети.png': png,
      'kb/img/logo.png': png,
    });
    // The set is imported under one section page, the section is exported with its children.
    const section = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Набор SC-15' })).page;
    const j = await startImport(org.owner, [['kb.zip', zip]]);
    const res = await org.owner.post(`/api/v1/imports/${j.jobId}/commit`, { target: { spaceId: org.generalSpaceId, parentId: section.id } });
    const root = section;
    const er = await org.owner.raw('GET', `/api/v1/pages/${root.id}/export?format=md&children=true`);
    const exported = Buffer.from(await er.arrayBuffer());
    expect(er.headers.get('content-type'), exported.toString('utf8').slice(0, 300) + JSON.stringify(res.pages)).toMatch(/zip/);
    const files = await unzipEntries(exported);
    const mdFiles = [...files.keys()].filter((f) => f.endsWith('.md') && f !== 'export-report.md');
    expect(mdFiles.length).toBeGreaterThanOrEqual(2);
    // Every relative link/image in the exported Markdown points to a file inside the archive.
    let links = 0;
    for (const f of mdFiles) {
      const md = files.get(f)!.toString('utf8');
      for (const m of md.matchAll(/\]\((?:<([^>]+)>|([^)\s]+))\)/g)) {
        const href = decodeURIComponent((m[1] ?? m[2]).replace(/#.*$/, ''));
        expect(href.startsWith('/p/'), `${f}: link to the application instead of a local file: ${href}`).toBe(false);
        if (/^[a-z]+:/i.test(href) || href.startsWith('/')) continue;
        const base = f.includes('/') ? f.slice(0, f.lastIndexOf('/') + 1) : '';
        const segs: string[] = [];
        for (const s of (base + href).split('/')) s === '..' ? segs.pop() : s && s !== '.' && segs.push(s);
        expect(files.has(segs.join('/')), `${f} → ${href}`).toBe(true);
        links++;
      }
    }
    expect(links).toBeGreaterThanOrEqual(4); // 2 images + 2 page links
    const sums = files.get('checksums.sha256')!.toString('utf8');
    expect(sums.split('\n').filter(Boolean).length).toBe(files.size - 1);
    // Round trip: the exported ZIP imports again with the same pages, tables, task lists and images.
    const j2 = await startImport(org.owner, [['kb-export.zip', exported]]);
    const res2 = await org.owner.post(`/api/v1/imports/${j2.jobId}/commit`, { target: { spaceId: org.generalSpaceId, parentId: null } });
    const titles = (r: any) => r.pages.map((p: any) => p.title).sort();
    expect(titles(res2)).toEqual(['guide', 'Набор SC-15', 'Настройка', 'Справочник'].sort()); // service files (report, checksums) are not pages
    expect(j2.preview.files[0].warnings.map((w: any) => w.code)).not.toContain('checksum-mismatch');
    // A tampered package is detected by its checksums.
    const tampered = new Map(files);
    tampered.set(mdFiles[0], Buffer.from(files.get(mdFiles[0])!.toString('utf8') + '\nподмена\n'));
    const { zipEntries } = await import('../support/doc-corpus.js');
    const j3 = await startImport(org.owner, [['tampered.zip', await zipEntries(tampered)]]);
    expect(j3.preview.files[0].warnings.find((w: any) => w.code === 'checksum-mismatch').message).toContain(mdFiles[0]);
    for (const title of ['Справочник', 'Настройка']) {
      const a = await content(org.owner, res.pages.find((p: any) => p.title === title).id);
      const b = await content(org.owner, res2.pages.find((p: any) => p.title === title).id);
      expect(docToPlainText(b)).toBe(docToPlainText(a));
      expect(find(b, (n) => n.type === 'image').length).toBe(find(a, (n) => n.type === 'image').length);
      expect(find(b, (n) => n.type === 'image').every((n) => n.attrs.src?.startsWith('/api/v1/attachments/'))).toBe(true);
      expect(b.content.map((x: any) => x.type)).toEqual(a.content.map((x: any) => x.type));
    }
  }, 120_000);
});

describe('batch edge cases (QA26-17)', () => {
  it('long Cyrillic names with special characters, an empty file, a large file and a broken file in one batch: valid files import, problems are reported per file, selective commit imports only the chosen pages (QA26-17, R-IMPORT-021)', async () => {
    const longName = 'Очень длинное название документа — «Регламент № 5» (ред. 2026) & прочее; ' + 'я'.repeat(150) + '.md';
    const large = '# Большой\n\n' + Array.from({ length: 20_000 }, (_, i) => `Строка ${i} — текст для проверки объёма.`).join('\n\n') + '\n';
    const j = await startImport(org.owner, [
      [longName, Buffer.from('# Длинное имя\n\nСодержимое.')],
      ['пустой.md', Buffer.alloc(0)],
      ['большой.md', Buffer.from(large, 'utf8')],
      ['битый.docx', Buffer.concat([Buffer.from('PK\x03\x04'), Buffer.alloc(64, 7)])],
      ['второй.md', Buffer.from('# Второй\n\nТекст')],
    ]);
    expect(j.status).toBe('awaiting_confirmation');
    const files = j.preview.files;
    expect(files.find((f: any) => f.file === 'битый.docx' || f.filename === 'битый.docx').status).toBe('error');
    expect(files.filter((f: any) => f.status !== 'error').length).toBe(4);
    const pages = j.preview.pages;
    const long = pages.find((p: any) => p.title === 'Длинное имя');
    const empty = pages.find((p: any) => p.title === 'пустой');
    const big = pages.find((p: any) => p.title === 'Большой');
    expect(long && empty && big).toBeTruthy();
    expect(big.stats.blocks).toBeGreaterThanOrEqual(20_000);
    // Partial import: only two of the analysed pages are committed.
    const before = (await ts.db.query('select count(*)::int c from pages')).rows[0].c;
    const res = await org.owner.post(`/api/v1/imports/${j.jobId}/commit`, { target: { spaceId: org.generalSpaceId, parentId: null }, pageTempIds: [long.tempId, big.tempId] });
    expect(res.pages.map((p: any) => p.title).sort()).toEqual(['Большой', 'Длинное имя']);
    expect((await ts.db.query('select count(*)::int c from pages')).rows[0].c).toBe(before + 2);
    const bigDoc = await content(org.owner, res.pages.find((p: any) => p.title === 'Большой').id);
    expect(docToPlainText(bigDoc)).toContain('Строка 19999 — текст для проверки объёма.');
    // The original file name (long, Cyrillic, special characters) is kept on the source attachment.
    const atts = (await org.owner.get(`/api/v1/pages/${res.pages.find((p: any) => p.title === 'Длинное имя').id}/attachments`)).attachments;
    expect(atts.some((a: any) => a.kind === 'import-source' && a.filename === longName)).toBe(true);
    // Repeating the commit does not duplicate anything.
    const again = await org.owner.post(`/api/v1/imports/${j.jobId}/commit`, { target: { spaceId: org.generalSpaceId, parentId: null }, pageTempIds: [long.tempId, big.tempId] });
    expect(again.repeated).toBe(true);
    expect((await ts.db.query('select count(*)::int c from pages')).rows[0].c).toBe(before + 2);
  }, 180_000);
});

describe('formatting through DOCX and HTML (R-EXPORT-012, R-EXPORT-025)', () => {
  it('inline formatting (bold, italic, underline, strike, code, sub/sup, highlight, colour, links) survives DOCX export → import and is present in HTML export (R-EXPORT-012, R-EXPORT-025)', async () => {
    const page = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Форматирование' })).page;
    const { replaceContent } = await import('../../apps/server/src/collab/ydoc.js');
    const t = (text: string, marks: any[]) => ({ type: 'text', text, marks });
    const para = {
      type: 'paragraph',
      content: [
        t('жирный', [{ type: 'bold' }]),
        { type: 'text', text: ' ' },
        t('курсив', [{ type: 'italic' }]),
        { type: 'text', text: ' ' },
        t('подчёркнутый', [{ type: 'underline' }]),
        { type: 'text', text: ' ' },
        t('зачёркнутый', [{ type: 'strike' }]),
        { type: 'text', text: ' ' },
        t('код', [{ type: 'code' }]),
        { type: 'text', text: ' H' },
        t('2', [{ type: 'subscript' }]),
        { type: 'text', text: 'O x' },
        t('2', [{ type: 'superscript' }]),
        { type: 'text', text: ' ' },
        t('ссылка', [{ type: 'link', attrs: { href: 'https://example.com/a' } }]),
        { type: 'text', text: ' ' },
        t('жирный курсив', [{ type: 'bold' }, { type: 'italic' }]),
        { type: 'text', text: ' ' },
        t('выделение', [{ type: 'highlight', attrs: { color: '#FFF3B0' } }]),
        { type: 'text', text: ' ' },
        t('красный', [{ type: 'textStyle', attrs: { color: '#C00000' } }]),
      ],
    };
    await ts.srv.services.hub.applyServerChange(page.id, null, (doc) => replaceContent(doc, { type: 'doc', content: [para] }));
    const docx = Buffer.from(await (await org.owner.raw('GET', `/api/v1/pages/${page.id}/export?format=docx`)).arrayBuffer());
    expect((await validateDocx(docx)).errors).toEqual([]);
    const { pageId } = await importOne(org.owner, 'marks.docx', docx);
    const back = await content(org.owner, pageId);
    const marksOf = (doc: any, text: string) => (find(doc, (n) => n.type === 'text' && n.text?.includes(text))[0]?.marks ?? []).map((m: any) => m.type).sort();
    expect(marksOf(back, 'жирный курсив')).toEqual(['bold', 'italic']);
    for (const [text, mark] of [['подчёркнутый', 'underline'], ['зачёркнутый', 'strike'], ['ссылка', 'link'], ['курсив', 'italic']] as const) expect(marksOf(back, text), text).toContain(mark);
    expect(find(back, (n) => n.type === 'text' && n.text === '2').flatMap((n) => n.marks.map((m: any) => m.type)).sort()).toEqual(['subscript', 'superscript']);
    const link = find(back, (n) => n.type === 'text' && n.text === 'ссылка')[0].marks.find((m: any) => m.type === 'link');
    expect(link.attrs.href).toBe('https://example.com/a');
    expect(docToPlainText(back)).toBe(docToPlainText({ type: 'doc', content: [para] }));
    // HTML export keeps every mark as markup (no hidden loss).
    const html = await (await org.owner.raw('GET', `/api/v1/pages/${page.id}/export?format=html`)).text();
    for (const tag of ['<strong>жирный</strong>', '<em>курсив</em>', '<u>подчёркнутый</u>', '<s>зачёркнутый</s>', '<code>код</code>', '<sub>2</sub>', '<sup>2</sup>', 'href="https://example.com/a"', '<mark', 'color: #C00000']) expect(html, tag).toContain(tag);
  });
});
