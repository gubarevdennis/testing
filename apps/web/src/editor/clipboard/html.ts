/**
 * Clipboard HTML processing (pure DOM functions, unit-tested with happy-dom):
 *  - cleanPastedHtml: allowlist sanitiser for pasted HTML (Word, Google Docs, web pages, other editors). Scripts,
 *    event handlers, Office junk and arbitrary inline styles are removed; only semantic formatting and the
 *    editor's own palette colours/fonts survive (R-CLIPBOARD-009/010/022). Word list paragraphs become real lists,
 *    embedded (data:) images are extracted for upload, unusable images (file://, blob:, cid:) are counted.
 *  - cleanCopiedDom: makes HTML written to the clipboard portable (absolute URLs, no comment anchors / DOM ids).
 */
import { sanitizeHref, safeImageSrc, FONT_FAMILIES, FONT_SIZES } from '@kb/shared';
import { TEXT_COLORS, HIGHLIGHTS } from '../palette';

export interface PastedImage {
  dataUri: string;
  alt: string;
}

export interface CleanResult {
  html: string;
  /** Embedded images (data: URIs) removed from the HTML; the caller uploads them as attachments. */
  images: PastedImage[];
  /** Images that cannot be transferred (local file paths of Word, blob:, cid: …). */
  droppedImages: number;
  /** Number of Word list paragraphs converted into list items. */
  wordListItems: number;
}

const REMOVE = new Set(['script', 'style', 'noscript', 'template', 'iframe', 'object', 'embed', 'meta', 'link', 'title', 'head', 'svg', 'math', 'canvas', 'audio', 'select', 'option', 'textarea', 'button', 'frame', 'frameset', 'applet', 'base']);
const ALLOWED = new Set([
  'p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code', 'hr', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'ins', 'sub', 'sup', 'mark',
  'a', 'img', 'figure', 'figcaption', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col', 'span', 'div', 'details', 'summary', 'label', 'input', 'video', 'aside',
]);
const ATTRS: Record<string, string[]> = {
  '*': ['style', 'class', 'align', 'valign'],
  a: ['href', 'title'],
  img: ['src', 'alt', 'title', 'width', 'height'],
  td: ['colspan', 'rowspan', 'colwidth'],
  th: ['colspan', 'rowspan', 'colwidth'],
  ol: ['start', 'type'],
  input: ['type', 'checked'],
  details: ['open'],
  video: ['src'],
};

const norm = (v: string) => v.trim().toLowerCase();
const PALETTE_TEXT = new Set(TEXT_COLORS.map((c) => norm(c.value)));
const PALETTE_BG = new Set(HIGHLIGHTS.map((c) => norm(c.value)));
const FONTS = new Set(Object.values(FONT_FAMILIES).map((f) => norm(f).replace(/\s+/g, ' ')));
const SIZES = new Set(FONT_SIZES.map((n) => `${n}px`));

/** "rgb(180, 55, 43)" / "#B4372B" → "#b4372b". */
export function toHex(color: string): string {
  const c = norm(color);
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(c);
  if (m) return '#' + [m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, '0')).join('');
  if (/^#[0-9a-f]{3}$/.test(c)) return '#' + [...c.slice(1)].map((x) => x + x).join('');
  return c;
}

function parseStyle(style: string): Array<[string, string]> {
  return style
    .split(';')
    .map((d) => {
      const i = d.indexOf(':');
      return i < 0 ? null : ([norm(d.slice(0, i)), d.slice(i + 1).trim().replace(/\s*!important$/i, '')] as [string, string]);
    })
    .filter((x): x is [string, string] => !!x && !!x[0] && !!x[1]);
}

/** Keeps only semantic inline styles and the editor's own palette/font values. */
export function filterStyle(style: string, tag: string): string {
  const out: string[] = [];
  for (const [prop, raw] of parseStyle(style)) {
    const v = norm(raw);
    switch (prop) {
      case 'color':
        if (PALETTE_TEXT.has(toHex(v))) out.push(`color: ${toHex(v)}`);
        break;
      case 'background-color':
        if (PALETTE_BG.has(toHex(v))) out.push(`background-color: ${toHex(v)}`);
        break;
      case 'font-weight':
        if (/^(bold|bolder|[6-9]00)$/.test(v)) out.push('font-weight: bold');
        break;
      case 'font-style':
        if (v === 'italic') out.push('font-style: italic');
        break;
      case 'text-decoration':
      case 'text-decoration-line':
        if (v.includes('underline')) out.push('text-decoration: underline');
        else if (v.includes('line-through')) out.push('text-decoration: line-through');
        break;
      case 'text-align':
        if (/^(left|center|right|justify)$/.test(v) && /^(p|h[1-6]|td|th|div)$/.test(tag)) out.push(`text-align: ${v}`);
        break;
      case 'vertical-align':
        if (/^(top|middle|bottom)$/.test(v) && /^(td|th)$/.test(tag)) out.push(`vertical-align: ${v}`);
        else if (v === 'super' || v === 'sub') out.push(`vertical-align: ${v}`);
        break;
      case 'font-family':
        if (FONTS.has(v.replace(/\s+/g, ' '))) out.push(`font-family: ${raw}`);
        break;
      case 'font-size':
        if (SIZES.has(v)) out.push(`font-size: ${v}`);
        break;
    }
  }
  return out.join('; ');
}

const TRACKING_PARAM = /^(utm_[a-z_]+|fbclid|gclid|dclid|gbraid|wbraid|yclid|ysclid|_openstat|mc_cid|mc_eid|_hsenc|_hsmi|mkt_tok|igshid)$/i;
const TRACKING_HOST = /(^|\.)(google-analytics\.com|googletagmanager\.com|doubleclick\.net|mc\.yandex\.ru|top-fwz1\.mail\.ru|counter\.yadro\.ru|facebook\.com\/tr|pixel\.|track\.|tracking\.)/i;

/** Removes tracking parameters (utm_*, fbclid, gclid, yclid…) from a link; other parameters and the fragment stay (R-CLIPBOARD-024). */
export function stripTracking(href: string): string {
  const q = href.indexOf('?');
  if (q < 0) return href;
  const hash = href.indexOf('#', q);
  const base = href.slice(0, q);
  const query = href.slice(q + 1, hash < 0 ? undefined : hash);
  const frag = hash < 0 ? '' : href.slice(hash);
  const kept = query.split('&').filter((p) => p && !TRACKING_PARAM.test(decodeURIComponent(p.split('=')[0] ?? '')));
  return base + (kept.length ? '?' + kept.join('&') : '') + frag;
}

/** Tracking pixels: 0/1 px images or images served by analytics counters. */
export function isTrackingImage(src: string, width: string | null, height: string | null): boolean {
  if (/^[01]$/.test(width ?? '') && /^[01]$/.test(height ?? '')) return true;
  return /^https?:\/\//i.test(src) && TRACKING_HOST.test(src.replace(/^https?:\/\//i, ''));
}

function unwrap(el: Element) {
  el.replaceWith(...Array.from(el.childNodes));
}

const BULLET_ORDERED = /^[([]?([0-9]{1,3}|[a-zа-я]|[ivxlcdm]{1,6})[.)\]]$/i;

function wordListInfo(p: Element): { level: number; listId: string; ordered: boolean } | null {
  const style = p.getAttribute('style') ?? '';
  const m = /mso-list\s*:\s*([^;]+)/i.exec(style);
  if (!m || /ignore/i.test(m[1])) return null;
  const level = Number(/level(\d+)/i.exec(m[1])?.[1] ?? 1);
  const listId = /\b(l\d+)\b/i.exec(m[1])?.[1] ?? 'l0';
  const marker = p.querySelector('[style*="mso-list" i]');
  const text = (marker?.textContent ?? '').replace(/ /g, ' ').trim();
  return { level: Math.max(1, Math.min(9, level)), listId, ordered: BULLET_ORDERED.test(text) };
}

/**
 * Converts Word "list paragraphs" (<p class=MsoListParagraph style="mso-list:l0 level2 lfo1"> with a marker span
 * "mso-list:Ignore") into nested <ul>/<ol> lists. Returns the number of converted items.
 */
export function convertWordLists(root: ParentNode): number {
  const doc = (root as Node).ownerDocument ?? (root as Document);
  const paras = Array.from(root.querySelectorAll('p')).filter((p) => wordListInfo(p));
  const parents = new Set(paras.map((p) => p.parentNode).filter(Boolean) as ParentNode[]);
  let count = 0;
  for (const parent of parents) {
    let stack: Array<{ level: number; list: HTMLElement; listId: string }> = [];
    for (const child of Array.from(parent.childNodes)) {
      if (child.nodeType === 8 || (child.nodeType === 3 && !child.textContent?.trim())) continue; // comments, whitespace
      const info = child.nodeType === 1 && (child as Element).tagName === 'P' ? wordListInfo(child as Element) : null;
      if (!info) {
        stack = [];
        continue;
      }
      const p = child as Element;
      p.querySelectorAll('[style*="mso-list" i]').forEach((m) => m.remove());
      while (stack.length && stack[stack.length - 1].level > info.level) stack.pop();
      let top: (typeof stack)[number] | undefined = stack[stack.length - 1];
      // a different list type or another Word list at the same level starts a new sibling list
      if (top && top.level === info.level && ((top.list.tagName === 'OL') !== info.ordered || (info.level === 1 && top.listId !== info.listId))) {
        stack.pop();
        top = stack[stack.length - 1];
      }
      if (!top || top.level < info.level) {
        const list = doc.createElement(info.ordered ? 'ol' : 'ul');
        const host = top?.list.lastElementChild;
        if (host) host.append(list);
        else p.before(list);
        stack.push({ level: info.level, list, listId: info.listId });
        top = stack[stack.length - 1];
      }
      const li = doc.createElement('li');
      const para = doc.createElement('p');
      para.append(...Array.from(p.childNodes));
      li.append(para);
      top.list.append(li);
      p.remove();
      count++;
    }
  }
  return count;
}

function sanitizeTree(root: Element, res: CleanResult, origin: string | null) {
  // depth-first over a static list: elements may be removed or unwrapped while walking
  const all = Array.from(root.querySelectorAll('*'));
  for (const el of all) {
    if (!el.isConnected && !root.contains(el)) continue;
    const tag = el.tagName.toLowerCase();
    if (REMOVE.has(tag) || tag.includes(':')) {
      if (tag.includes(':') && tag !== 'o:p') el.querySelectorAll('img').forEach(() => res.droppedImages++);
      el.remove();
      continue;
    }
    if (!ALLOWED.has(tag)) {
      unwrap(el);
      continue;
    }
    // Google Docs wraps everything in <b style="font-weight:normal">.
    if ((tag === 'b' || tag === 'strong') && /font-weight\s*:\s*(normal|[1-4]00)/i.test(el.getAttribute('style') ?? '')) {
      unwrap(el);
      continue;
    }
    const allowed = new Set([...ATTRS['*'], ...(ATTRS[tag] ?? [])]);
    for (const a of Array.from(el.attributes)) {
      const name = a.name.toLowerCase();
      if (name.startsWith('data-')) continue;
      if (!allowed.has(name)) el.removeAttribute(a.name);
    }
    const style = el.getAttribute('style');
    if (style != null) {
      const s = filterStyle(style, tag);
      if (s) el.setAttribute('style', s);
      else el.removeAttribute('style');
    }
    const cls = el.getAttribute('class');
    if (cls != null) {
      const keep = cls.split(/\s+/).filter((c) => /^(language-|kb-|hljs)/.test(c));
      if (keep.length) el.setAttribute('class', keep.join(' '));
      else el.removeAttribute('class');
    }
    if (tag === 'a') {
      const href = el.getAttribute('href');
      if (href != null) {
        if (!sanitizeHref(href)) el.removeAttribute('href');
        else if (origin && href.startsWith(origin + '/')) el.setAttribute('href', stripTracking(href.slice(origin.length)));
        else el.setAttribute('href', stripTracking(href));
      }
    }
    if (tag === 'img') {
      const src = el.getAttribute('src') ?? '';
      const tiny = isTrackingImage(src, el.getAttribute('width'), el.getAttribute('height'));
      const figure = el.closest('figure');
      if (tiny) {
        el.remove();
        continue;
      }
      if (/^data:image\//i.test(src.trim()) && safeImageSrc(src)) {
        res.images.push({ dataUri: src.trim(), alt: el.getAttribute('alt') ?? '' });
        el.remove();
      } else if (!safeImageSrc(src)) {
        res.droppedImages++;
        el.remove();
      } else if (origin && src.startsWith(origin + '/')) el.setAttribute('src', src.slice(origin.length));
      if (figure && !figure.querySelector('img')) figure.remove();
    }
  }
}

function removeComments(root: Node) {
  const doc = root.ownerDocument ?? (root as Document);
  const walker = doc.createTreeWalker(root, 128 /* NodeFilter.SHOW_COMMENT */);
  const list: Node[] = [];
  while (walker.nextNode()) list.push(walker.currentNode);
  list.forEach((c) => c.parentNode?.removeChild(c));
}

/** Cleans pasted HTML. `origin` (e.g. location.origin) turns absolute links to this instance back into in-app links. */
export function cleanPastedHtml(html: string, opts: { origin?: string | null; parser?: DOMParser } = {}): CleanResult {
  const parser = opts.parser ?? new DOMParser();
  // Word's conditional comments hide VML duplicates of images; drop them before parsing.
  const doc = parser.parseFromString(html.replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, ''), 'text/html');
  const res: CleanResult = { html: '', images: [], droppedImages: 0, wordListItems: 0 };
  removeComments(doc.body);
  res.wordListItems = convertWordLists(doc.body);
  sanitizeTree(doc.body, res, opts.origin ?? null);
  res.html = doc.body.innerHTML;
  return res;
}

/** Converts a data: URI into a File for upload. */
export function dataUriToFile(uri: string, name: string): File {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(uri.trim());
  if (!m) throw new Error('Некорректное встроенное изображение');
  const bytes = m[2] ? Uint8Array.from(atob(m[3].replace(/\s/g, '')), (c) => c.charCodeAt(0)) : new TextEncoder().encode(decodeURIComponent(m[3]));
  const ext = (m[1].split('/')[1] ?? 'png').replace('jpeg', 'jpg').replace(/\+.*/, '');
  return new File([bytes], `${name}.${ext}`, { type: m[1] });
}

/**
 * Prepares HTML written to the clipboard for other applications (Word, mail) and other pages: in-app URLs become
 * absolute, comment anchors (thread ids of this page) and DOM ids are removed. Structure attributes (data-type,
 * data-block-id, data-attachment-id) stay so a paste into the knowledge base restores the same blocks.
 */
export function cleanCopiedDom(root: ParentNode, origin: string) {
  root.querySelectorAll('[data-comment-thread]').forEach((el) => unwrap(el));
  root.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
  root.querySelectorAll('[contenteditable],[draggable]').forEach((el) => {
    el.removeAttribute('contenteditable');
    el.removeAttribute('draggable');
  });
  root.querySelectorAll('img[src^="/"]').forEach((el) => {
    const src = el.getAttribute('src')!;
    if (!src.startsWith('//')) el.setAttribute('src', origin + src);
  });
  root.querySelectorAll('a[href^="/"]').forEach((el) => {
    const href = el.getAttribute('href')!;
    if (!href.startsWith('//')) el.setAttribute('href', origin + href);
  });
}
