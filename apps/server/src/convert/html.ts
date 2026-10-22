/** HTML <-> canonical document on the server (import of DOCX/HTML/MD fragments, HTML/PDF export, clipboard parity). */
import { generateHTML, generateJSON } from '@tiptap/html/server';
import sanitize from 'sanitize-html';
import { createSchemaExtensions, ensureBlockIds, getKbSchema, walk, sanitizeHref, type PMNode } from '@kb/shared';

const extensions = createSchemaExtensions();

const ALLOWED_TAGS = [
  'p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code', 'hr', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'ins', 'sub', 'sup', 'mark',
  'a', 'img', 'figure', 'figcaption', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col', 'span', 'div', 'details', 'summary', 'label', 'input', 'video', 'section', 'article', 'aside', 'header', 'footer', 'main',
];

/** Allowlist sanitiser: removes scripts, event handlers, styles (except safe colours), tracking pixels and Office junk. */
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
    allowedSchemesByTag: { img: ['http', 'https', 'data'] },
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
  /** Called for each <img src>; return replacement attrs (stored attachment) or null to keep/drop. */
  resolveImage?: (src: string, alt: string) => { src: string; attachmentId: string | null; width?: number | null; height?: number | null } | null;
  keepStyles?: boolean;
}

export function htmlToDoc(html: string, opts: HtmlImportOptions = {}): { doc: PMNode; warnings: Array<{ code: string; message: string }> } {
  const warnings: Array<{ code: string; message: string }> = [];
  const safe = sanitizeHtml(html);
  let json = generateJSON(safe, extensions) as PMNode;
  walk(json, (n) => {
    if (n.type === 'image') {
      const src = String(n.attrs?.src ?? '');
      const r = opts.resolveImage?.(src, n.attrs?.alt ?? '');
      if (r) Object.assign(n.attrs!, r);
      else if (!/^(https?:|\/api\/v1\/attachments\/)/.test(src)) {
        warnings.push({ code: 'image-unresolved', message: `Изображение не удалось сохранить: ${src.slice(0, 80)}` });
        n.attrs!.src = null;
      }
    }
    for (const m of n.marks ?? []) if (m.type === 'link') m.attrs = { ...m.attrs, href: sanitizeHref(m.attrs?.href) ?? '#' };
  });
  // Images without a source are replaced by a visible placeholder paragraph rather than silently dropped.
  const fix = (n: PMNode) => {
    if (!n.content) return;
    n.content = n.content.map((c) => (c.type === 'image' && !c.attrs?.src ? { type: 'paragraph', content: [{ type: 'text', text: `[изображение: ${c.attrs?.alt || 'без описания'}]` }] } : c));
    n.content.forEach(fix);
  };
  fix(json);
  json = ensureBlockIds(json);
  try {
    getKbSchema().nodeFromJSON(json).check();
  } catch (e) {
    warnings.push({ code: 'structure-normalized', message: 'Структура документа была нормализована: ' + (e as Error).message });
    json = getKbSchema().nodeFromJSON(json).toJSON() as PMNode;
  }
  return { doc: json, warnings };
}

/** Block-level nodes of an HTML fragment (for Markdown html blocks). */
export function htmlToNodes(html: string): PMNode[] {
  return htmlToDoc(html).doc.content ?? [];
}

export function docToHtml(doc: PMNode): string {
  return generateHTML(doc as any, extensions);
}
