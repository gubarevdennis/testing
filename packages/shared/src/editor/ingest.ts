/**
 * One conversion pipeline for everything that enters a document (R-IMPORT-021, D-38): DOCX (via mammoth's HTML), HTML,
 * Markdown, plain text, CSV/XLSX/TSV rows, and the clipboard (text/html, text/markdown, text/plain, images, files).
 *
 * The same functions run in the browser (paste: DOMParser of the page, Markdown module loaded lazily) and on the server
 * (import: happy-dom, Markdown module loaded eagerly). Every path ends in `finalize` — URL safety, block ids, schema
 * validation — and returns the same report of what the content became and what was not taken over. The callers only do
 * what needs their environment: storing pictures (tokens `kb-paste-image:<i>` → upload / staged asset), copying pictures
 * of other sites to the server (a hook), inserting into the editor or creating pages.
 */
import { DOMParser as PMDOMParser } from '@tiptap/pm/model';
import { getKbSchema } from './schema.js';
import { normalizeHtml, PASTE_TOKEN, type HtmlParser, type PastedImage, type NormalizeStats } from './html-normalize.js';
import { ensureBlockIds, walk, parseTsv, looksLikeTsv, rowsToTable, inlineText, type PMNode } from './json.js';
import { safeImageSrc } from './migrations.js';
import { sanitizeHref } from './url.js';
import type { ConversionWarning, FromMarkdownOptions, FromMarkdownResult } from './markdown.js';

export type IngestSource = 'html' | 'markdown' | 'text' | 'rows' | 'files';

export interface IngestReport {
  source: IngestSource;
  /** What the content became (counts): paragraphs, headings, lists, tables, images, inlineImages, footnotes, links, files, code. */
  converted: Record<string, number>;
  /** What was not taken over (counts by code): images, scripts/styles/forms, tracking pixels, unsafe links, foreign styles. */
  dropped: Record<string, number>;
  /** Readable messages — the same for paste and import of the same content. */
  warnings: ConversionWarning[];
}

export interface IngestResult {
  doc: PMNode;
  report: IngestReport;
  /** Embedded pictures; image nodes refer to them by `src = kb-paste-image:<index>`. The caller stores them. */
  images: PastedImage[];
  /** Pictures of other sites (http/https): the caller copies them to the server (hook) or keeps them as links. */
  remoteImages: string[];
}

export interface IngestEnv {
  parser: HtmlParser;
  /** Absolute URLs of this instance become in-app URLs. */
  origin?: string | null;
  /** Image sources kept as they are (server: `kbblob:` staged assets of DOCX/ZIP imports). */
  keepImageSrc?: (src: string) => boolean;
  /** The Markdown converter (`@kb/shared/markdown`): eager on the server, lazily loaded in the browser. */
  markdown?: { markdownToDoc(md: string, opts?: FromMarkdownOptions): FromMarkdownResult } | null;
}

/** A file on the clipboard / dropped / imported on its own. */
export interface IngestFile {
  name: string;
  type: string;
  size: number;
}

const DROP_MESSAGES: Record<string, (n: number) => string> = {
  images: (n) => `Изображений, которые не удалось перенести (локальные файлы, blob:, cid:): ${n}. Скопируйте их отдельно или перетащите файлы.`,
  removedElements: (n) => `Удалены небезопасные и служебные элементы (скрипты, стили, формы, навигация, встроенные плееры): ${n}`,
  trackingPixels: (n) => `Удалены пиксели отслеживания: ${n}`,
  trackingLinks: (n) => `Из ссылок удалены параметры отслеживания (utm_*, fbclid…): ${n}`,
  unsafeLinks: (n) => `Небезопасные ссылки удалены, текст сохранён: ${n}`,
  droppedStyles: (n) => `Оформление источника, не входящее в палитру базы знаний, снято (текст и смысловое форматирование сохранены): ${n}`,
};

function emptyReport(source: IngestSource): IngestReport {
  return { source, converted: {}, dropped: {}, warnings: [] };
}

function addDrops(report: IngestReport, stats: Partial<NormalizeStats> & { images?: number }) {
  for (const [k, v] of Object.entries(stats)) {
    if (k === 'footnotes' || !v) continue;
    report.dropped[k] = (report.dropped[k] ?? 0) + (v as number);
  }
}

const COUNTED: Record<string, string> = {
  paragraph: 'paragraphs',
  heading: 'headings',
  bulletList: 'lists',
  orderedList: 'lists',
  taskList: 'lists',
  table: 'tables',
  image: 'images',
  inlineImage: 'inlineImages',
  footnote: 'footnotes',
  fileBlock: 'files',
  codeBlock: 'code',
  blockquote: 'quotes',
  callout: 'callouts',
  details: 'toggles',
};

/**
 * Last step of every path: URL safety (links, images, embeds), placeholders for pictures without a usable source,
 * block ids, schema validation (invalid structure is normalised and reported, never thrown away), counts.
 */
export function finalizeIngest(doc: PMNode, report: IngestReport, opts: { keepImageSrc?: (src: string) => boolean } = {}): { doc: PMNode; remoteImages: string[] } {
  const keep = (src: string) => PASTE_TOKEN.test(src) || !!opts.keepImageSrc?.(src);
  const remote = new Set<string>();
  let lostImages = 0;
  const fix = (n: PMNode): PMNode | null => {
    if (n.marks?.length) {
      const marks = n.marks.filter((m) => m.type !== 'link' || !!sanitizeHref(m.attrs?.href));
      if (marks.length !== n.marks.length) report.dropped.unsafeLinks = (report.dropped.unsafeLinks ?? 0) + 1;
      n = { ...n, ...(marks.length ? { marks } : { marks: undefined }) };
      if (!marks.length) delete n.marks;
    }
    if (n.type === 'image' || n.type === 'inlineImage') {
      const raw = String(n.attrs?.src ?? '');
      const src = keep(raw) ? raw : (safeImageSrc(raw) ?? (n.attrs?.attachmentId ? `/api/v1/attachments/${n.attrs.attachmentId}/content` : null));
      if (!src && !n.attrs?.uploadId) {
        lostImages++;
        const text = `[изображение: ${n.attrs?.alt || n.attrs?.caption || 'без описания'}]`;
        return n.type === 'image' ? { type: 'paragraph', content: [{ type: 'text', text }] } : { type: 'text', text };
      }
      if (src && /^https?:\/\//i.test(src) && !n.attrs?.attachmentId) remote.add(src);
      n = { ...n, attrs: { ...n.attrs, src } };
    }
    if (n.type === 'embed' && n.attrs?.url != null && !sanitizeHref(n.attrs.url)) n = { ...n, attrs: { ...n.attrs, url: null } };
    if (n.type === 'fileBlock' && n.attrs?.href != null && !sanitizeHref(n.attrs.href)) n = { ...n, attrs: { ...n.attrs, href: null } };
    if (n.content) n = { ...n, content: n.content.map(fix).filter((c): c is PMNode => !!c) };
    return n;
  };
  let out = fix(structuredClone(doc)) ?? { type: 'doc', content: [] };
  if (!out.content?.length) out.content = [{ type: 'paragraph' }];
  if (lostImages) {
    report.dropped.images = (report.dropped.images ?? 0) + lostImages;
  }
  out = ensureBlockIds(out);
  const schema = getKbSchema();
  try {
    schema.nodeFromJSON(out).check();
  } catch (e) {
    report.warnings.push({ code: 'structure-normalized', message: 'Структура документа была нормализована: ' + (e as Error).message });
    out = ensureBlockIds(schema.nodeFromJSON(out).toJSON() as PMNode);
  }
  const converted: Record<string, number> = {};
  walk(out, (n) => {
    const k = COUNTED[n.type];
    if (k) converted[k] = (converted[k] ?? 0) + 1;
    if (n.marks?.some((m) => m.type === 'link')) converted.links = (converted.links ?? 0) + 1;
  });
  report.converted = converted;
  // readable messages for every drop, once (the same wording for paste and import)
  for (const [code, n] of Object.entries(report.dropped)) {
    const msg = DROP_MESSAGES[code];
    if (msg && n && !report.warnings.some((w) => w.code === 'dropped-' + code)) report.warnings.push({ code: 'dropped-' + code, message: msg(n) });
  }
  return { doc: out, remoteImages: [...remote] };
}

/** HTML of any origin → document (clipboard text/html, .html files, DOCX via mammoth, HTML blocks of Markdown). */
export function ingestHtml(html: string, env: IngestEnv, report: IngestReport = emptyReport('html')): IngestResult {
  const res = normalizeHtml(html, { parser: env.parser, origin: env.origin ?? null, keepImageSrc: env.keepImageSrc });
  addDrops(report, { ...res.stats, images: res.droppedImages });
  const dom = env.parser.parseFromString(`<!DOCTYPE html><html><body>${res.html}</body></html>`, 'text/html');
  const parsed = PMDOMParser.fromSchema(getKbSchema()).parse(dom.body as unknown as Node).toJSON() as PMNode;
  const fin = finalizeIngest(parsed, report, { keepImageSrc: env.keepImageSrc });
  return { doc: fin.doc, report, images: res.images, remoteImages: fin.remoteImages };
}

/** Markdown (.md files, ZIP packages, clipboard text/markdown and Markdown-looking text). */
export function ingestMarkdown(markdown: string, env: IngestEnv, mdOpts: FromMarkdownOptions = {}): IngestResult & { title: string | null; frontMatter: Record<string, unknown> | null } {
  const report = emptyReport('markdown');
  if (!env.markdown) throw new Error('Markdown converter is not loaded');
  const images: PastedImage[] = [];
  const md = env.markdown.markdownToDoc(markdown, {
    // raw HTML inside Markdown goes through the very same HTML path
    htmlToNodes: (h) => {
      const r = ingestHtml(h, env, report);
      // embedded pictures of HTML blocks keep their own numbering in this result
      const shift = images.length;
      images.push(...r.images);
      if (shift) walk(r.doc, (n) => {
        const m = PASTE_TOKEN.exec(String(n.attrs?.src ?? ''));
        if (m && n.attrs) n.attrs.src = `kb-paste-image:${Number(m[1]) + shift}`;
      });
      return r.doc.content ?? [];
    },
    ...mdOpts,
  });
  report.warnings.push(...md.warnings);
  const fin = finalizeIngest(md.doc, report, { keepImageSrc: env.keepImageSrc });
  return { doc: fin.doc, report, images, remoteImages: fin.remoteImages, title: md.title, frontMatter: md.frontMatter };
}

/** Plain text: one paragraph per line (blank lines only separate). The same for .txt import and text paste. */
export function ingestText(text: string): IngestResult {
  const report = emptyReport('text');
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  while (lines.length && !lines[0].trim()) lines.shift();
  const content: PMNode[] = lines.filter((l) => l.trim() !== '').map((l) => ({ type: 'paragraph', content: [{ type: 'text', text: l }] }));
  const fin = finalizeIngest({ type: 'doc', content }, report);
  return { doc: fin.doc, report, images: [], remoteImages: [] };
}

/** Rows of a spreadsheet (CSV/XLSX import as a table, TSV range on the clipboard) → a table. */
export function ingestRows(rows: string[][], opts: { header: boolean }): IngestResult {
  const report = emptyReport('rows');
  const width = Math.max(1, ...rows.map((r) => r.length));
  const clean = rows.map((r) => Array.from({ length: width }, (_, i) => (r[i] ?? '').replace(/\r\n?/g, '\n')));
  const fin = finalizeIngest({ type: 'doc', content: [rowsToTable(clean, opts.header)] }, report);
  return { doc: fin.doc, report, images: [], remoteImages: [] };
}

/** Alt text from a file name ("Схема_склада.png" → "Схема склада"); generic clipboard names → "Изображение". */
export function altFromName(name: string): string {
  const base = name.replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[_]+/g, ' ').trim();
  if (!base || /^(image|img|clipboard|screenshot|pasted|blob|изображение)[\s\d-]*$/i.test(base)) return 'Изображение';
  return base.slice(0, 200);
}

export const isImageType = (type: string, name = '') => /^image\//i.test(type) || /\.(png|jpe?g|gif|webp|avif|bmp|svg|heic|heif|tiff?)$/i.test(name);

/** Pictures and files (clipboard, drop, import of a lone file) → image / file blocks; `ref` fills the source of each. */
export function ingestFiles(files: IngestFile[], ref: (file: IngestFile, index: number) => Record<string, unknown>): IngestResult {
  const report = emptyReport('files');
  const content: PMNode[] = files.map((f, i) =>
    isImageType(f.type, f.name)
      ? { type: 'image', attrs: { alt: altFromName(f.name || ''), ...ref(f, i) } }
      : { type: 'fileBlock', attrs: { name: f.name || 'Файл', size: f.size, mime: f.type || null, view: 'compact', ...ref(f, i) } },
  );
  const fin = finalizeIngest({ type: 'doc', content }, report, { keepImageSrc: () => true });
  return { doc: fin.doc, report, images: [], remoteImages: [] };
}

const MD_HINTS = [/^#{1,6}\s/m, /^\s*[-*+]\s+\S/m, /^\s*\d+[.)]\s+\S/m, /^```/m, /^\s*>\s/m, /^\|.+\|\s*$/m, /\*\*[^*\n]+\*\*/, /\[[^\]\n]+\]\([^)\s]+\)/, /^\s*[-*]\s\[[ xX]\]\s/m, /\[\^[^\]\s]+\]/];

/** Text that is probably Markdown (at least two distinct markers, or one structural marker over several lines). */
export function looksLikeMarkdown(text: string) {
  const hits = MD_HINTS.filter((r) => r.test(text)).length;
  return hits >= 2 || (hits === 1 && text.split('\n').length >= 3 && /^(#{1,6}\s|```|\|)/m.test(text));
}

export interface ClipboardInput {
  html?: string;
  text?: string;
  /** text/markdown flavour (editors that offer it). */
  markdown?: string;
  files?: IngestFile[];
  /** Ctrl/Cmd+Shift+V: text only. */
  plain?: boolean;
}

export type ClipboardKind = 'none' | 'files' | 'html' | 'markdown' | 'rows' | 'text';

/** HTML that only wraps a picture (a picture copied from a page or an app also offers the file). */
const trivialHtml = (html: string) => !/<table|<p[\s>]|<h\d|<li/i.test(html);
/** Code editors (VS Code …) put plain text in a styled <pre>/<div>: the text is the content. */
const codeEditorHtml = (html: string) => /^\s*<meta[^>]*>\s*<(span|div)[^>]*white-space:\s*pre/i.test(html);

/** Which clipboard flavour is the content (the order of preference is part of the pipeline: identical everywhere). */
export function clipboardKind(input: ClipboardInput, env: Pick<IngestEnv, 'markdown'> = {}): ClipboardKind {
  const text = input.text ?? '';
  if (input.plain) return text ? 'text' : 'none';
  if (input.files?.length && (!input.html || trivialHtml(input.html))) return 'files';
  if (input.markdown?.trim() && env.markdown) return 'markdown';
  if (input.html && !codeEditorHtml(input.html)) return 'html';
  if (!text) return 'none';
  if (looksLikeTsv(text)) return 'rows';
  if (env.markdown && looksLikeMarkdown(text)) return 'markdown';
  return 'text';
}

/** Clipboard → document: the paste side of the pipeline (files are returned as nodes with `ref` attributes). */
export function ingestClipboard(input: ClipboardInput, env: IngestEnv, fileRef: (file: IngestFile, index: number) => Record<string, unknown> = () => ({})): IngestResult & { kind: ClipboardKind } {
  const kind = clipboardKind(input, env);
  switch (kind) {
    case 'files':
      return { kind, ...ingestFiles(input.files ?? [], fileRef) };
    case 'markdown':
      // pasted Markdown keeps its first heading in the content (a file's leading H1 is its page title instead)
      return { kind, ...ingestMarkdown(input.markdown?.trim() ? input.markdown : (input.text ?? ''), env, { extractTitle: false }) };
    case 'html':
      return { kind, ...ingestHtml(input.html ?? '', env) };
    case 'rows': {
      const rows = parseTsv(input.text ?? '');
      return { kind, ...ingestRows(rows, { header: rows.length > 1 }) };
    }
    case 'text':
      return { kind, ...ingestText(input.text ?? '') };
    default:
      return { kind, doc: { type: 'doc', content: [{ type: 'paragraph' }] }, report: emptyReport('text'), images: [], remoteImages: [] };
  }
}

/** Short summary of a report for a notification (empty when nothing was lost). */
export function reportSummary(report: IngestReport): string {
  return report.warnings
    .filter((w) => w.code.startsWith('dropped-images') || w.code === 'dropped-unsafeLinks' || w.code === 'structure-normalized')
    .map((w) => w.message)
    .join(' ');
}

/** Text of a document for comparisons in tests and reports (ids ignored). */
export function docFingerprint(doc: PMNode): string {
  const strip = (n: PMNode): PMNode => {
    const { attrs, content, ...rest } = n;
    const a = attrs ? Object.fromEntries(Object.entries(attrs).filter(([k, v]) => k !== 'id' && v !== null && v !== undefined)) : undefined;
    return { ...rest, ...(a && Object.keys(a).length ? { attrs: a } : {}), ...(content ? { content: content.map(strip) } : {}) };
  };
  return JSON.stringify(strip(doc)) + '|' + inlineText(doc).length;
}
