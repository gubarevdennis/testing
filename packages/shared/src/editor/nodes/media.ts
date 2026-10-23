import { Node, mergeAttributes } from '@tiptap/core';
import { sanitizeHref } from '../url.js';

const num = (v: string | null) => {
  const n = v == null ? NaN : parseFloat(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

/**
 * Image block. The original file is an attachment (attachmentId); `src` is the in-app content URL.
 * Width is in CSS px (null = natural size, constrained to the container).
 */
export const ImageBlock = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      src: { default: null },
      attachmentId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-attachment-id') ?? el.querySelector('img')?.getAttribute('data-attachment-id') ?? null,
        renderHTML: (a) => (a.attachmentId ? { 'data-attachment-id': a.attachmentId } : {}),
      },
      alt: { default: '' },
      title: { default: null },
      caption: { default: '' },
      width: { default: null },
      align: { default: 'center' },
      naturalWidth: { default: null },
      naturalHeight: { default: null },
      // Client-side upload in progress (R-MEDIA-006/008): the block exists before the file reaches the server and
      // is completed in place. Never parsed from or rendered to HTML (clipboard must not carry it).
      uploadId: { default: null, parseHTML: () => null, renderHTML: () => ({}) },
    };
  },
  parseHTML() {
    return [
      {
        tag: 'figure',
        getAttrs: (el) => {
          const img = (el as HTMLElement).querySelector('img');
          if (!img) return false;
          return {
            src: img.getAttribute('src'),
            attachmentId: img.getAttribute('data-attachment-id') ?? (el as HTMLElement).getAttribute('data-attachment-id'),
            alt: img.getAttribute('alt') ?? '',
            title: img.getAttribute('title'),
            caption: (el as HTMLElement).querySelector('figcaption')?.textContent?.trim() ?? '',
            width: num(img.getAttribute('width')),
            align: (el as HTMLElement).getAttribute('data-align') ?? 'center',
            naturalWidth: num(img.getAttribute('data-natural-width')),
            naturalHeight: num(img.getAttribute('data-natural-height')),
          };
        },
      },
      {
        tag: 'img[src]',
        getAttrs: (el) => {
          const img = el as HTMLElement;
          return {
            src: img.getAttribute('src'),
            attachmentId: img.getAttribute('data-attachment-id'),
            alt: img.getAttribute('alt') ?? '',
            title: img.getAttribute('title'),
            width: num(img.getAttribute('width')),
            naturalWidth: num(img.getAttribute('data-natural-width')),
            naturalHeight: num(img.getAttribute('data-natural-height')),
          };
        },
      },
    ];
  },
  renderHTML({ node, HTMLAttributes }) {
    const a = node.attrs;
    const img: Record<string, string> = { src: a.src ?? '', alt: a.alt ?? '' };
    if (a.attachmentId) img['data-attachment-id'] = a.attachmentId;
    if (a.width) img.width = String(a.width);
    if (a.title) img.title = a.title;
    if (a.naturalWidth) img['data-natural-width'] = String(a.naturalWidth);
    if (a.naturalHeight) img['data-natural-height'] = String(a.naturalHeight);
    const children: any[] = [['img', img]];
    if (a.caption) children.push(['figcaption', {}, a.caption]);
    return ['figure', mergeAttributes({ 'data-align': a.align, class: 'kb-image', id: HTMLAttributes.id }), ...children];
  },
});

const INLINE_TAGS = new Set(['A', 'SPAN', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'DEL', 'INS', 'STRIKE', 'SUB', 'SUP', 'MARK', 'FONT', 'CODE', 'SMALL', 'BIG', 'LABEL']);

/**
 * An `<img>` that sits in a line of text (text or other pictures next to it in the same paragraph/heading/cell) is an
 * inline image; a picture alone in its paragraph or in a figure is a block image (R-MEDIA-007, D-37).
 */
export function isInlineImageElement(img: HTMLElement): boolean {
  if (img.getAttribute('data-type') === 'inline-image') return true;
  if (img.closest('figure')) return false;
  let host: HTMLElement | null = img.parentElement;
  while (host && INLINE_TAGS.has(host.tagName.toUpperCase())) host = host.parentElement;
  if (!host || host.tagName.toUpperCase() === 'BODY' || host.tagName.toUpperCase() === 'FIGURE') return false;
  if ((host.textContent ?? '').replace(/[\s\u00a0\u200b]+/g, '') !== '') return true;
  return host.querySelectorAll('img').length > 1;
}

const VALIGNS = ['baseline', 'middle', 'top', 'bottom'];

/**
 * Inline image (R-MEDIA-007): a picture inside a line of text (icons, formulas as pictures, small screenshots of
 * buttons). Same attachment model as the block image (original file = attachment, `src` = in-app content URL, thumbnails
 * are derived, never stored instead of the original); width in CSS px; `valign` = vertical alignment in the line;
 * `title` = caption (shown as tooltip and in the viewer).
 */
export const InlineImage = Node.create({
  name: 'inlineImage',
  group: 'inline',
  inline: true,
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      src: { default: null },
      attachmentId: { default: null, parseHTML: (el) => el.getAttribute('data-attachment-id'), renderHTML: (a) => (a.attachmentId ? { 'data-attachment-id': a.attachmentId } : {}) },
      alt: { default: '' },
      title: { default: null },
      width: { default: null },
      valign: { default: 'baseline' },
      naturalWidth: { default: null },
      naturalHeight: { default: null },
      uploadId: { default: null, parseHTML: () => null, renderHTML: () => ({}) },
    };
  },
  parseHTML() {
    return [
      {
        tag: 'img[src]',
        priority: 60, // before the block image rule; declines (false) when the picture is alone in its block
        getAttrs: (el) => {
          const img = el as HTMLElement;
          if (!isInlineImageElement(img)) return false;
          const v = img.getAttribute('data-valign');
          return {
            src: img.getAttribute('src'),
            attachmentId: img.getAttribute('data-attachment-id'),
            alt: img.getAttribute('alt') ?? '',
            title: img.getAttribute('title'),
            width: num(img.getAttribute('width')),
            valign: v && VALIGNS.includes(v) ? v : 'baseline',
            naturalWidth: num(img.getAttribute('data-natural-width')),
            naturalHeight: num(img.getAttribute('data-natural-height')),
          };
        },
      },
    ];
  },
  renderHTML({ node }) {
    const a = node.attrs;
    const img: Record<string, string> = { src: a.src ?? '', alt: a.alt ?? '', 'data-type': 'inline-image', class: 'kb-inline-image' };
    if (a.attachmentId) img['data-attachment-id'] = a.attachmentId;
    if (a.width) img.width = String(a.width);
    if (a.title) img.title = a.title;
    if (a.valign && a.valign !== 'baseline') {
      img['data-valign'] = a.valign;
      img.style = `vertical-align:${a.valign === 'middle' ? 'middle' : a.valign === 'top' ? 'text-top' : a.valign === 'bottom' ? 'text-bottom' : 'baseline'}`;
    }
    if (a.naturalWidth) img['data-natural-width'] = String(a.naturalWidth);
    if (a.naturalHeight) img['data-natural-height'] = String(a.naturalHeight);
    return ['img', img];
  },
  renderText({ node }) {
    return node.attrs.alt ? `[${node.attrs.alt}]` : '';
  },
});

/** File attachment rendered as a compact row or a card. */
export const FileBlock = Node.create({
  name: 'fileBlock',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      attachmentId: { default: null },
      name: { default: '' },
      size: { default: null },
      mime: { default: null },
      view: { default: 'compact' },
      href: { default: null },
      // Client-side upload in progress (R-MEDIA-006/008): the block exists before the file reaches the server and
      // is completed in place. Never parsed from or rendered to HTML (clipboard must not carry it).
      uploadId: { default: null, parseHTML: () => null, renderHTML: () => ({}) },
    };
  },
  parseHTML() {
    return [
      {
        tag: 'div[data-type="file"]',
        getAttrs: (el) => {
          const e = el as HTMLElement;
          return {
            attachmentId: e.getAttribute('data-attachment-id'),
            name: e.getAttribute('data-name') ?? e.textContent?.trim() ?? '',
            size: num(e.getAttribute('data-size')),
            mime: e.getAttribute('data-mime'),
            view: e.getAttribute('data-view') ?? 'compact',
            href: e.querySelector('a')?.getAttribute('href') ?? null,
          };
        },
      },
    ];
  },
  renderHTML({ node, HTMLAttributes }) {
    const a = node.attrs;
    const attrs: Record<string, string> = { 'data-type': 'file', 'data-name': a.name, 'data-view': a.view, class: 'kb-file' };
    if (a.attachmentId) attrs['data-attachment-id'] = a.attachmentId;
    if (a.size != null) attrs['data-size'] = String(a.size);
    if (a.mime) attrs['data-mime'] = a.mime;
    if (HTMLAttributes.id) attrs.id = HTMLAttributes.id;
    const href = a.href ?? (a.attachmentId ? `/api/v1/attachments/${a.attachmentId}/download` : '#');
    return ['div', attrs, ['a', { href }, a.name || 'file']];
  },
});

/** Video / external embed. External URLs are rendered as safe links unless the provider is allow-listed by the client. */
export const Embed = Node.create({
  name: 'embed',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      url: { default: null },
      kind: { default: 'link' }, // link | video
      attachmentId: { default: null },
      title: { default: '' },
    };
  },
  parseHTML() {
    return [
      {
        tag: 'div[data-type="embed"]',
        getAttrs: (el) => {
          const e = el as HTMLElement;
          return {
            url: sanitizeHref(e.getAttribute('data-url')),
            kind: e.getAttribute('data-kind') ?? 'link',
            attachmentId: e.getAttribute('data-attachment-id'),
            title: e.getAttribute('data-title') ?? '',
          };
        },
      },
      {
        tag: 'video[src]',
        getAttrs: (el) => ({ url: sanitizeHref((el as HTMLElement).getAttribute('src')), kind: 'video' }),
      },
    ];
  },
  renderHTML({ node, HTMLAttributes }) {
    const a = node.attrs;
    const attrs: Record<string, string> = { 'data-type': 'embed', 'data-kind': a.kind, class: 'kb-embed' };
    if (a.url) attrs['data-url'] = a.url;
    if (a.attachmentId) attrs['data-attachment-id'] = a.attachmentId;
    if (a.title) attrs['data-title'] = a.title;
    if (HTMLAttributes.id) attrs.id = HTMLAttributes.id;
    const href = a.attachmentId ? `/api/v1/attachments/${a.attachmentId}/download` : (a.url ?? '#');
    return ['div', attrs, ['a', { href }, a.title || a.url || 'media']];
  },
});
