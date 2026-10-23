/**
 * HTML <-> canonical document on the server (import of DOCX/HTML/MD fragments, HTML/PDF export, public links).
 *
 * Import runs the shared pipeline (packages/shared/src/editor/ingest.ts, R-IMPORT-021): exactly the normalisation,
 * sanitising, footnote recognition, schema parsing and URL checks the browser runs for a paste — here on happy-dom.
 */
import { generateHTML } from '@tiptap/html/server';
import { Window } from 'happy-dom';
import sanitize from 'sanitize-html';
import { createSchemaExtensions, ingestHtml, ingestMarkdown, ingestText, ingestRows, footnotesToEndnotes, walk, markdownToDoc, PASTE_TOKEN, type PMNode, type IngestEnv, type IngestReport, type PastedImage, type FromMarkdownOptions } from '@kb/shared';

const extensions = createSchemaExtensions();

/** Runs `fn` with a DOMParser of a fresh, script-less happy-dom window (closed afterwards). */
export function withHtmlParser<T>(fn: (parser: IngestEnv['parser'], document: Document) => T): T {
  const w = new Window({ settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true, disableIframePageLoading: true, disableComputedStyleRendering: true } });
  try {
    return fn(new w.DOMParser() as unknown as IngestEnv['parser'], w.document as unknown as Document);
  } finally {
    void w.happyDOM.abort();
    void w.happyDOM.close();
  }
}

const ALLOWED_TAGS = [
  'p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code', 'hr', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'ins', 'sub', 'sup', 'mark',
  'a', 'img', 'figure', 'figcaption', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col', 'span', 'div', 'details', 'summary', 'label', 'input', 'video', 'section', 'article', 'aside', 'header', 'footer', 'main',
];

/**
 * Allowlist sanitiser for HTML that is stored or served as HTML (not for import: imported HTML becomes schema nodes
 * through the shared pipeline, which is the safety boundary there).
 */
export function sanitizeHtml(html: string): string {
  const cleaned = html
    .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, '')
    .replace(/<o:p>[\s\S]*?<\/o:p>/gi, '')
    .replace(/<\/?(o|w|v|m):[^>]*>/gi, '');
  return sanitize(cleaned, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      '*': ['data-type', 'data-variant', 'data-block-id', 'data-align', 'data-valign', 'data-level', 'data-page-id', 'data-attachment-id', 'data-id', 'data-label', 'data-checked', 'data-width', 'data-name', 'data-size', 'data-mime', 'data-view', 'data-url', 'data-kind', 'data-title', 'data-icon', 'data-source-page', 'data-source-block', 'data-collection-id', 'data-comment-thread', 'align', 'valign', 'colspan', 'rowspan', 'style', 'start', 'type', 'checked', 'open', 'lang'],
      a: ['href', 'title', 'name'],
      img: ['src', 'alt', 'title', 'width', 'height'],
      video: ['src'],
      code: ['class'],
      pre: ['class'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel', 'data'],
    allowedSchemesByTag: { img: ['http', 'https', 'data', 'kbblob'] }, // kbblob: staged import asset, replaced on commit
    allowedStyles: {
      '*': {
        color: [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s,.%]+\)$/i, /^[a-z]+$/i],
        'background-color': [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s,.%]+\)$/i, /^[a-z]+$/i],
        'text-align': [/^(left|right|center|justify)$/],
        'vertical-align': [/^(top|middle|bottom)$/],
        'font-weight': [/^(bold|[6-9]00)$/],
        'font-style': [/^italic$/],
        'text-decoration': [/^(underline|line-through)$/],
      },
    },
    disallowedTagsMode: 'discard',
    nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript', 'title', 'head'],
    exclusiveFilter: (frame) => frame.tag === 'img' && /^(1|0)$/.test(String(frame.attribs.width ?? '')) && /^(1|0)$/.test(String(frame.attribs.height ?? '')), // tracking pixels
  });
}

export interface HtmlImportOptions {
  /** Called for each picture's src; return replacement attrs (stored attachment) or null to leave it to the pipeline. */
  resolveImage?: (src: string, alt: string) => { src: string; attachmentId: string | null; width?: number | null; height?: number | null } | null;
  /** Sources kept as they are (staged import assets). Default: `kbblob:` refs. */
  keepImageSrc?: (src: string) => boolean;
  origin?: string | null;
}

export interface HtmlImportResult {
  doc: PMNode;
  warnings: Array<{ code: string; message: string }>;
  report: IngestReport;
  /** Embedded (data:) pictures: nodes refer to them by `kb-paste-image:<i>`; the importer stores them as assets. */
  images: PastedImage[];
  remoteImages: string[];
}

const KBBLOB = (src: string) => src.startsWith('kbblob:');

export function htmlToDoc(html: string, opts: HtmlImportOptions = {}): HtmlImportResult {
  const keep = opts.keepImageSrc ?? KBBLOB;
  const res = withHtmlParser((parser) => ingestHtml(html, { parser, origin: opts.origin ?? null, keepImageSrc: keep }));
  if (opts.resolveImage)
    walk(res.doc, (n) => {
      if ((n.type === 'image' || n.type === 'inlineImage') && n.attrs?.src) {
        const r = opts.resolveImage!(String(n.attrs.src), n.attrs.alt ?? '');
        if (r) n.attrs = { ...n.attrs, ...r };
      }
    });
  return { doc: res.doc, warnings: res.report.warnings, report: res.report, images: res.images, remoteImages: res.remoteImages };
}

/** Block-level nodes of an HTML fragment (for Markdown html blocks). */
export function htmlToNodes(html: string): PMNode[] {
  return htmlToDoc(html).doc.content ?? [];
}

/** Document → HTML (export, public links): footnotes become numbered references with the notes at the end. */
export function docToHtml(doc: PMNode): string {
  const html = generateHTML(doc as any, extensions);
  if (!html.includes('data-type="footnote"')) return html;
  return withHtmlParser((parser) => {
    const d = parser.parseFromString(`<!DOCTYPE html><html><body>${html}</body></html>`, 'text/html');
    footnotesToEndnotes(d.body);
    return d.body.innerHTML;
  });
}

const KB_MD = { markdownToDoc };

/** Markdown import through the shared pipeline (HTML blocks inside it take the HTML path above). */
export function importMarkdown(text: string, mdOpts: FromMarkdownOptions = {}) {
  const res = withHtmlParser((parser) => ingestMarkdown(text, { parser, markdown: KB_MD, keepImageSrc: KBBLOB }, mdOpts));
  return { doc: res.doc, title: res.title, frontMatter: res.frontMatter, warnings: res.report.warnings, report: res.report, images: res.images, remoteImages: res.remoteImages };
}

/** Plain text import (.txt): the same conversion as a plain-text paste. */
export function importText(text: string) {
  const res = ingestText(text);
  return { doc: res.doc, title: null, frontMatter: null, warnings: res.report.warnings, report: res.report };
}

/** Spreadsheet rows imported as a table: the same conversion as a pasted cell range. */
export function importRows(rows: string[][], header: boolean): PMNode {
  return ingestRows(rows, { header }).doc.content![0];
}

/**
 * Embedded (data:) pictures of imported HTML become staged assets like the pictures of a DOCX or ZIP (the browser
 * uploads the same pictures of a paste as attachments): `store` returns the staged ref.
 */
export async function storeEmbeddedImages(res: { doc: PMNode; images: PastedImage[] }, store: (buf: Buffer, filename: string) => Promise<{ ref: string }>): Promise<void> {
  if (!res.images.length) return;
  const refs = await Promise.all(
    res.images.map(async (im, i) => {
      const m = /^data:image\/([a-z0-9.+-]+);base64,(.*)$/is.exec(im.dataUri);
      if (!m) return null;
      const ext = m[1].toLowerCase().replace('jpeg', 'jpg').replace(/\+.*/, '');
      return (await store(Buffer.from(m[2].replace(/\s/g, ''), 'base64'), `image-${i + 1}.${ext}`)).ref;
    }),
  );
  walk(res.doc, (n) => {
    const m = PASTE_TOKEN.exec(String(n.attrs?.src ?? ''));
    if (m && n.attrs) {
      const ref = refs[Number(m[1])];
      n.attrs = { ...n.attrs, src: ref, attachmentId: ref };
    }
  });
}
