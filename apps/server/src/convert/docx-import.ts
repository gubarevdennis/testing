import mammoth from 'mammoth';
import yauzl from 'yauzl';
import yazl from 'yazl';
import { htmlToDoc } from './html.js';
import { randomUUID } from 'node:crypto';
import { ensureBlockIds, getKbSchema, type PMNode } from '@kb/shared';
import type { ConversionWarning } from '@kb/shared';

export type StoreImage = (buf: Buffer, filename: string, mime: string, alt: string) => Promise<{ attachmentId: string; src: string }>;

/** Word style names -> semantic blocks. Real headings become headings (not bold text). */
const STYLE_MAP = [
  "p[style-name='Title'] => h1:fresh",
  "p[style-name='Subtitle'] => p.lead:fresh",
  "p[style-name='heading 1'] => h1:fresh",
  "p[style-name='heading 2'] => h2:fresh",
  "p[style-name='heading 3'] => h3:fresh",
  "p[style-name='heading 4'] => h4:fresh",
  "p[style-name='heading 5'] => h5:fresh",
  "p[style-name='heading 6'] => h6:fresh",
  "p[style-name='Заголовок 1'] => h1:fresh",
  "p[style-name='Заголовок 2'] => h2:fresh",
  "p[style-name='Заголовок 3'] => h3:fresh",
  "p[style-name='Заголовок 4'] => h4:fresh",
  "p[style-name='Quote'] => blockquote > p:fresh",
  "p[style-name='Intense Quote'] => blockquote > p:fresh",
  "p[style-name='Цитата'] => blockquote > p:fresh",
  "p[style-name='Code'] => pre > code:separator('\\n')",
  "p[style-name='HTML Preformatted'] => pre > code:separator('\\n')",
  "p[style-name='Source Code'] => pre > code:separator('\\n')",
  // Word captions ("Рисунок 1 — …") become the caption of the neighbouring image (R-IMPORT-027).
  "p[style-name='caption'] => p.kb-caption:fresh",
  "p[style-name='Caption'] => p.kb-caption:fresh",
  "p[style-name='Название объекта'] => p.kb-caption:fresh",
  "r[style-name='Code Char'] => code",
  "r[style-name='Source Code Char'] => code",
  'u => u',
  'strike => s',
  'comment-reference => sup',
];

async function readZipEntries(buf: Buffer, names: RegExp): Promise<Map<string, string>> {
  return new Promise((resolve, reject) => {
    const out = new Map<string, string>();
    yauzl.fromBuffer(buf, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(new Error('Файл DOCX повреждён (не является корректным ZIP-архивом)'));
      zip.on('entry', (e: yauzl.Entry) => {
        if (!names.test(e.fileName) || e.uncompressedSize > 200 * 1024 * 1024) return zip.readEntry();
        zip.openReadStream(e, (e2, rs) => {
          if (e2 || !rs) return reject(e2);
          const chunks: Buffer[] = [];
          rs.on('data', (c) => chunks.push(c));
          rs.on('end', () => {
            out.set(e.fileName, Buffer.concat(chunks).toString('utf8'));
            zip.readEntry();
          });
        });
      });
      zip.on('end', () => resolve(out));
      zip.on('error', reject);
      zip.readEntry();
    });
  });
}

/** Detects constructs that cannot be represented faithfully; reported instead of being lost silently. */
export async function inspectDocx(buf: Buffer): Promise<ConversionWarning[]> {
  return (await inspectDocxParts(buf)).warnings;
}

/** Plain text of the paragraphs of a WordprocessingML part (w:t runs only: field codes are not text). */
function partParagraphs(xml: string): string[] {
  const out: string[] = [];
  for (const p of xml.match(/<w:p\b[\s\S]*?<\/w:p>/g) ?? []) {
    // eslint-disable-next-line security/detect-unsafe-regex -- disjoint classes, linear (measured on 50k-char input)
    const t = (p.match(/<w:t(?:\s[^>]*)?>[^<]*<\/w:t>/g) ?? []).map((x) => x.replace(/<[^>]+>/g, '')).join('');
    const text = t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim();
    if (text) out.push(text);
  }
  return out;
}

interface DocxParts {
  warnings: ConversionWarning[];
  /** Distinct header/footer paragraphs (kept in a collapsed block instead of being dropped). */
  headerFooter: string[];
  hasToc: boolean;
}

async function inspectDocxParts(buf: Buffer): Promise<DocxParts> {
  const parts = await readZipEntries(buf, /^word\/(document|comments|footnotes|endnotes|header\d*|footer\d*)\.xml$/);
  const doc = parts.get('word/document.xml');
  if (!doc) throw new Error('В файле нет основного документа word/document.xml — файл повреждён или не является DOCX');
  const w: ConversionWarning[] = [];
  const count = (re: RegExp) => (doc.match(re) ?? []).length;
  if (count(/<w:ins\b/g) + count(/<w:del\b/g)) w.push({ code: 'track-changes', message: `Обнаружены исправления (track changes): ${count(/<w:ins\b/g)} вставок, ${count(/<w:del\b/g)} удалений. Импортирован текст с принятыми вставками; исходный файл сохранён.` });
  if (/dgm:relIds|smartArt/i.test(doc)) w.push({ code: 'smartart', message: 'SmartArt не поддерживается как редактируемый блок: текст узлов перенесён на место схемы, графика — в исходном файле.' });
  if (count(/<wps:wsp\b/g) + count(/<v:shape\b/g)) w.push({ code: 'shapes', message: `Фигуры/надписи (${count(/<wps:wsp\b/g) + count(/<v:shape\b/g)}) преобразованы в текст, где это возможно; оформление фигур не переносится.` });
  if (count(/<wp:anchor\b/g)) w.push({ code: 'floating', message: `Плавающие объекты (${count(/<wp:anchor\b/g)}) размещены в потоке текста.` });
  if (count(/<w:fldSimple\b/g) + count(/<w:instrText\b/g)) w.push({ code: 'fields', message: 'Поля Word (оглавление, номера страниц, ссылки) импортированы как текущий текст результата.' });
  if (count(/<w:sectPr\b/g) > 1) w.push({ code: 'sections', message: 'Разрывы разделов и разные параметры страниц не переносятся.' });
  if (count(/<w:gridSpan\b/g) + count(/<w:vMerge\b/g)) w.push({ code: 'merged-cells', message: 'Таблицы содержат объединённые ячейки — структура объединений сохранена; проверьте результат в предпросмотре.' });
  const comments = parts.get('word/comments.xml');
  if (comments && /<w:comment\b/.test(comments)) w.push({ code: 'comments', message: `Комментарии Word (${(comments.match(/<w:comment\b/g) ?? []).length}) не переносятся в обсуждения; они доступны в исходном файле.` });
  const foot = parts.get('word/footnotes.xml');
  // footnotes.xml always holds the separator and continuation-separator pseudo-notes.
  // eslint-disable-next-line security/detect-non-literal-regexp -- `tag` is a literal ('footnote' | 'endnote') at both call sites
  const realNotes = (xml: string | undefined, tag: string) => (xml?.match(new RegExp(`<w:${tag}\\b(?![^>]*w:type="(?:separator|continuationSeparator|continuationNotice)")`, 'g')) ?? []).length;
  const footnotes = realNotes(foot, 'footnote');
  const endnotes = realNotes(parts.get('word/endnotes.xml'), 'endnote');
  if (footnotes) w.push({ code: 'footnotes', message: `Сноски Word (${footnotes}) импортированы как сноски статьи: ссылка в тексте, текст сноски — в самой сноске, нумерация автоматическая.` });
  if (endnotes) w.push({ code: 'endnotes', message: `Концевые сноски Word (${endnotes}) импортированы как обычные сноски статьи (в базе знаний один вид сносок; нумерация общая).` });
  const headerFooter: string[] = [];
  for (const [name, xml] of [...parts].sort(([a], [b]) => (a.includes('header') === b.includes('header') ? a.localeCompare(b) : a.includes('header') ? -1 : 1))) if (/^word\/(header|footer)\d*\.xml$/.test(name)) for (const t of partParagraphs(xml)) if (!headerFooter.includes(t)) headerFooter.push(t);
  if (/<w:headerReference\b|<w:footerReference\b/.test(doc) && headerFooter.length) w.push({ code: 'header-footer', message: 'Колонтитулы перенесены в свёрнутый блок «Колонтитулы исходного документа» в конце статьи.' });
  if (/w:macro|vbaProject/i.test(doc)) w.push({ code: 'macros', message: 'Макросы проигнорированы и не исполнялись.' });
  const hasToc = /<w:instrText[^>]*>\s*TOC\b/.test(doc) || /<w:fldSimple[^>]*w:instr="\s*TOC\b/.test(doc) || /<w:docPartGallery w:val="Table of Contents"/.test(doc);
  if (hasToc) w.push({ code: 'toc', message: 'Оглавление Word заменено живым оглавлением статьи (строится по заголовкам).' });
  return { warnings: w, headerFooter, hasToc };
}

const stripTags = (h: string) => h.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();

/**
 * Structural post-processing of mammoth's HTML (R-IMPORT-007/025/026/027/034):
 * bookmarks on headings become block anchors (internal links are re-pointed to them), the Word TOC field becomes a
 * live TOC block, captions become image captions. Footnotes/endnotes (mammoth: <sup><a href="#footnote-1">) are left to
 * the shared HTML pipeline, which turns them into footnote nodes like any other HTML footnotes (D-36, D-38).
 */
export function restructureDocxHtml(html: string, opts: { hasToc: boolean }): string {
  // 1. Bookmarks: <h2><a id="_Toc1"></a><a id="x"></a>Text</h2> → <h2 data-block-id="uuid">Text</h2>; "#x" → "#uuid".
  const anchors = new Map<string, string>();
  // eslint-disable-next-line security/detect-unsafe-regex -- repeated unit starts with a fixed '<a id="', linear (measured)
  html = html.replace(/<(h[1-6]|p)>((?:<a id="[^"]+"><\/a>)+)/g, (_m, tag: string, as: string) => {
    const id = randomUUID();
    for (const a of as.match(/id="([^"]+)"/g) ?? []) anchors.set(a.slice(4, -1), id);
    return `<${tag} data-block-id="${id}">`;
  });
  html = html.replace(/<a id="[^"]*"><\/a>/g, '');
  // 2. Word TOC field: its cached entries (paragraphs consisting of one link to a bookmark) → one TOC block.
  if (opts.hasToc) {
    let placed = false;
    // eslint-disable-next-line security/detect-unsafe-regex -- runs on mammoth's well-formed HTML: each lazy scan stops at the paragraph's own </a></p> or </p>
    html = html.replace(/(?:<p><a href="#_Toc[^"]*">(?:(?!<\/p>)[\s\S])*?<\/a><\/p>)+/g, () => (placed ? '' : ((placed = true), '<div data-type="toc"></div>')));
    if (!placed) html = '<div data-type="toc"></div>' + html;
  }
  html = html.replace(/href="#([^"]+)"/g, (m, a: string) => (anchors.has(a) ? `href="#${anchors.get(a)}"` : m));
  // 3. Captions: an image paragraph followed (or preceded) by a caption paragraph becomes a figure with figcaption.
  html = html.replace(/<p>(<img [^>]*\/?>)<\/p><p class="kb-caption">([\s\S]*?)<\/p>/g, (_m, img: string, cap: string) => `<figure>${img}<figcaption>${stripTags(cap)}</figcaption></figure>`);
  html = html.replace(/<p class="kb-caption">([\s\S]*?)<\/p><p>(<img [^>]*\/?>)<\/p>/g, (_m, cap: string, img: string) => `<figure>${img}<figcaption>${stripTags(cap)}</figcaption></figure>`);
  html = html.replace(/<p class="kb-caption">/g, '<p>'); // table captions etc. stay as text
  // 4. Separators marked by preprocessDocx.
  html = html.split(`<p>${HR_MARKER}</p>`).join('<hr />');
  return html;
}

async function readAllEntries(buf: Buffer): Promise<Map<string, Buffer>> {
  return new Promise((resolve, reject) => {
    const out = new Map<string, Buffer>();
    yauzl.fromBuffer(buf, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(new Error('Файл DOCX повреждён (не является корректным ZIP-архивом)'));
      zip.on('entry', (e: yauzl.Entry) => {
        if (e.fileName.endsWith('/')) return zip.readEntry();
        zip.openReadStream(e, (e2, rs) => {
          if (e2 || !rs) return reject(e2);
          const chunks: Buffer[] = [];
          rs.on('data', (c) => chunks.push(c));
          rs.on('end', () => {
            out.set(e.fileName, Buffer.concat(chunks));
            zip.readEntry();
          });
        });
      });
      zip.on('end', () => resolve(out));
      zip.on('error', reject);
      zip.readEntry();
    });
  });
}

const HR_MARKER = '\u2E3BKB-HR\u2E3B';
const xmlEsc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Rewrites constructs mammoth would drop silently (R-IMPORT-009): simple fields keep their displayed result,
 * SmartArt diagrams are replaced in place by the text of their nodes (the graphic stays in the source file).
 */
export async function preprocessDocx(buf: Buffer): Promise<Buffer> {
  const head = await readZipEntries(buf, /^word\/document\.xml$/);
  const doc = head.get('word/document.xml');
  if (!doc || !/<w:fldSimple\b|dgm:relIds|<w:pBdr>|o:hr="t"/.test(doc)) return buf;
  const files = await readAllEntries(buf);
  let xml = files.get('word/document.xml')!.toString('utf8');
  xml = xml.replace(/<w:fldSimple\b[^>]*\/>/g, '').replace(/<w:fldSimple\b[^>]*>([\s\S]*?)<\/w:fldSimple>/g, '$1');
  const rels = files.get('word/_rels/document.xml.rels')?.toString('utf8') ?? '';
  xml = xml.replace(/<w:drawing>(?:(?!<\/w:drawing>)[\s\S])*?<dgm:relIds\b[^>]*r:dm="([^"]+)"[\s\S]*?<\/w:drawing>/g, (_m, rid: string) => {
    // rid comes from the uploaded file: escape it, or a crafted id becomes a pattern (ReDoS / SyntaxError) — SAST finding.
    const id = rid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // eslint-disable-next-line security/detect-non-literal-regexp -- the only variable part is the escaped id
    const target = new RegExp(`<Relationship\\b[^>]*Id="${id}"[^>]*Target="([^"]+)"`).exec(rels)?.[1] ?? new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${id}"`).exec(rels)?.[1];
    const data = target ? files.get(('word/' + target).replace(/\/[^/]+\/\.\.\//g, '/'))?.toString('utf8') : undefined;
    const texts = (data?.match(/<a:t>[^<]*<\/a:t>/g) ?? []).map((t) => t.slice(5, -6).trim()).filter(Boolean);
    return `<w:t xml:space="preserve">${texts.length ? xmlEsc('[SmartArt] ' + texts.map((t) => t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')).join(' → ')) : '[SmartArt]'}</w:t>`;
  });
  // Separators: an empty paragraph with a top/bottom border (how Word draws "---" lines) or a VML horizontal line.
  xml = xml.replace(/<w:p\b[^>]*>(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/g, (p) => {
    const rule = (/<w:pBdr>(?:(?!<\/w:pBdr>)[\s\S])*?<w:(bottom|top)\b(?![^>]*w:val="(?:nil|none)")/.test(p) && !/<w:t[\s>]|<w:drawing\b|<w:pict\b/.test(p)) || /<v:rect\b[^>]*o:hr="t"/.test(p);
    return rule ? `<w:p><w:r><w:t>${HR_MARKER}</w:t></w:r></w:p>` : p;
  });
  files.set('word/document.xml', Buffer.from(xml, 'utf8'));
  const z = new yazl.ZipFile();
  for (const [name, data] of files) z.addBuffer(data, name);
  z.end();
  const chunks: Buffer[] = [];
  for await (const c of z.outputStream) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

export async function docxToDoc(buf: Buffer, storeImage: StoreImage): Promise<{ doc: PMNode; title: string | null; warnings: ConversionWarning[] }> {
  const parts = await inspectDocxParts(buf);
  const warnings = parts.warnings;
  buf = await preprocessDocx(buf);
  let imageNo = 0;
  const result = await mammoth.convertToHtml(
    { buffer: buf },
    {
      styleMap: STYLE_MAP,
      includeDefaultStyleMap: true,
      convertImage: mammoth.images.imgElement(async (image: any) => {
        imageNo++;
        const data: Buffer = await image.readAsBuffer();
        const mime = image.contentType || 'image/png';
        const ext = (mime.split('/')[1] || 'png').replace('jpeg', 'jpg').replace('x-emf', 'emf').replace('x-wmf', 'wmf');
        if (/emf|wmf/.test(ext)) warnings.push({ code: 'vector-image', message: `Изображение №${imageNo} в формате ${ext.toUpperCase()} сохранено как файл; браузер может не отобразить его.` });
        const stored = await storeImage(data, `image-${imageNo}.${ext}`, mime, image.altText ?? '');
        return { src: stored.src, alt: image.altText ?? '', 'data-attachment-id': stored.attachmentId } as any;
      }),
    },
  );
  for (const m of result.messages) {
    if (m.type === 'warning' && /Unrecognised paragraph style|Unrecognised run style/.test(m.message)) {
      const style = /'([^']+)'/.exec(m.message)?.[1];
      if (!style || style === 'null' || /^toc \d$/i.test(style)) continue;
      if (!warnings.some((x) => x.code === 'style-' + style)) warnings.push({ code: 'style-' + style, message: `Стиль Word «${style}» импортирован как обычный текст.` });
    } else if (!/style with ID TOC\d/i.test(m.message)) warnings.push({ code: 'mammoth', message: m.message });
  }
  const html = restructureDocxHtml(result.value, { hasToc: parts.hasToc }).replace(/<p class="lead">/g, '<p data-variant="lead">');
  const conv = htmlToDoc(html, {
    resolveImage: (src) => {
      if (src.startsWith('kbblob:')) return { src, attachmentId: src }; // staged import asset
      const m = /\/api\/v1\/attachments\/([0-9a-f-]{36})\/content/.exec(src);
      return m ? { src, attachmentId: m[1] } : null;
    },
  });
  warnings.push(...conv.warnings);
  let title: string | null = null;
  const first = conv.doc.content?.[0];
  if (first?.type === 'heading' && first.attrs?.level === 1) {
    title = (first.content ?? []).map((x) => x.text ?? '').join('').trim() || null;
    if (title) conv.doc.content = conv.doc.content!.slice(1);
    if (!conv.doc.content!.length) conv.doc.content = [{ type: 'paragraph' }];
  }
  if (parts.headerFooter.length) {
    // Headers/footers are not part of the article flow; they are kept (not lost) in a collapsed block at the end.
    const block: PMNode = {
      type: 'details',
      content: [
        { type: 'detailsSummary', content: [{ type: 'text', text: 'Колонтитулы исходного документа' }] },
        { type: 'detailsContent', content: parts.headerFooter.map((t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] })) },
      ],
    };
    const withBlock = ensureBlockIds({ ...conv.doc, content: [...(conv.doc.content ?? []), block] });
    try {
      getKbSchema().nodeFromJSON(withBlock).check();
      conv.doc = withBlock;
    } catch {
      conv.doc = ensureBlockIds({ ...conv.doc, content: [...(conv.doc.content ?? []), ...parts.headerFooter.map((t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] }))] });
    }
  }
  return { doc: conv.doc, title, warnings };
}
