/**
 * HTML normalisation shared by every HTML input (R-IMPORT-021, D-38): clipboard paste in the browser and import of
 * HTML / DOCX (mammoth output) / HTML blocks of Markdown on the server run exactly this code, on the browser DOM and on
 * happy-dom respectively. Pure DOM functions — the caller supplies the DOMParser.
 *
 *  - an allowlist sanitiser: scripts, event handlers, Office junk and arbitrary inline styles are removed; only semantic
 *    formatting and the editor's own palette colours/fonts survive (R-CLIPBOARD-009/010/022);
 *  - Word list paragraphs become real lists; Google Docs list nesting, Word titles / quotes / captions are normalised;
 *  - footnotes of Word, Google Docs, GitHub/pandoc Markdown renderers, mammoth and our own exports become footnote
 *    nodes (`<span data-type="footnote">`);
 *  - embedded (data:) images stay in place as upload tokens, unusable images (file://, blob:, cid:) are counted;
 *  - every removal is counted in a report (the same report for paste and import).
 */
import { sanitizeHref } from './url.js';
import { safeImageSrc } from './migrations.js';
import { FONT_FAMILIES, FONT_SIZES } from './extensions.js';
import { TEXT_COLORS, HIGHLIGHTS } from './palette.js';

export interface PastedImage {
  dataUri: string;
  alt: string;
}

/** What normalisation removed or changed (counts). Merged into the ingest report. */
export interface NormalizeStats {
  /** Elements removed with their content (scripts, styles, forms, navigation, media players, Office VML …). */
  removedElements: number;
  /** Tracking pixels removed. */
  trackingPixels: number;
  /** Links whose tracking parameters were stripped. */
  trackingLinks: number;
  /** Unsafe links whose target was removed (text kept). */
  unsafeLinks: number;
  /** Inline styles outside the palette/semantics that were dropped. */
  droppedStyles: number;
  /** Footnotes recognised. */
  footnotes: number;
}

export interface CleanResult {
  html: string;
  /** Embedded images (data: URIs) removed from the HTML; the caller uploads/stores them as attachments. */
  images: PastedImage[];
  /** Images that cannot be transferred (local file paths of Word, blob:, cid: …). */
  droppedImages: number;
  /** Number of Word list paragraphs converted into list items. */
  wordListItems: number;
  stats: NormalizeStats;
}

/** A DOMParser (browser `new DOMParser()`, happy-dom `new window.DOMParser()`). */
export interface HtmlParser {
  parseFromString(html: string, type: 'text/html'): Document;
}

export interface NormalizeOptions {
  /** Absolute links to this instance (e.g. location.origin / PUBLIC_URL) become in-app links. */
  origin?: string | null;
  parser: HtmlParser;
  /** Image sources kept as they are besides http(s)/in-app/data (e.g. `kbblob:` staged import assets). */
  keepImageSrc?: (src: string) => boolean;
}

const REMOVE = new Set(['nav', 'form', 'script', 'style', 'noscript', 'template', 'iframe', 'object', 'embed', 'meta', 'link', 'title', 'head', 'svg', 'math', 'canvas', 'audio', 'select', 'option', 'textarea', 'button', 'frame', 'frameset', 'applet', 'base']);
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
        else if (tag === 'img' && /^(top|middle|bottom|text-top|text-bottom|baseline)$/.test(v)) out.push(`vertical-align: ${v}`);
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
  const kept = query.split('&').filter((p) => p && !TRACKING_PARAM.test(safeDecode(p.split('=')[0] ?? '')));
  return base + (kept.length ? '?' + kept.join('&') : '') + frag;
}

function safeDecode(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Placeholder `src` of an embedded (data:) image: `kb-paste-image:<index into CleanResult.images>`. */
export const PASTE_TOKEN_PREFIX = 'kb-paste-image:';
export const PASTE_TOKEN = /^kb-paste-image:(\d+)$/;

/** Google's redirect wrapper (links copied from Google Docs / search results): the real target. */
export function unwrapRedirect(href: string): string {
  const m = /^https?:\/\/(?:www\.)?google\.[a-z.]+\/url\?(.*)$/i.exec(href);
  if (!m) return href;
  for (const part of m[1].split('&')) {
    const [k, v] = part.split('=');
    if ((k === 'q' || k === 'url') && v) {
      try {
        const target = decodeURIComponent(v);
        if (/^https?:\/\//i.test(target)) return target;
      } catch {
        /* keep the original */
      }
    }
  }
  return href;
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
  const text = (marker?.textContent ?? '').replace(/\u00a0/g, ' ').trim();
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

// ------------------------------------------------------------------------------------------------ footnotes

const NOTE_LISTS = 'section.footnotes, [data-footnotes], section[data-type="footnotes"], .kb-footnotes, div[style*="mso-element:footnote-list" i], div[style*="mso-element:endnote-list" i]';
const BLOCKS = new Set(['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'TABLE', 'UL', 'OL', 'SECTION', 'ASIDE']);

function targetOf(root: ParentNode, name: string): Element | null {
  if (!name) return null;
  const esc = name.replace(/["\\]/g, '\\$&');
  return root.querySelector(`[id="${esc}"]`) ?? root.querySelector(`a[name="${esc}"]`);
}

/** Keys by which a note may link back to its reference: ids/names of the reference and of its marker wrapper. */
function refKeys(ref: Element): string[] {
  const keys: string[] = [];
  for (let el: Element | null = ref, k = 0; el && k < 3; el = el.parentElement, k++) {
    if (el.id) keys.push(el.id);
    const name = el.getAttribute('name');
    if (name) keys.push(name);
  }
  return keys;
}

function noteContainer(target: Element): Element {
  if (target.tagName !== 'A') return target;
  return target.closest('li') ?? target.closest('div[style*="mso-element:footnote" i], div[style*="mso-element:endnote" i]') ?? target.closest('p') ?? target.parentElement ?? target;
}

/** The outermost element around the reference link that holds nothing but the marker (<sup><a>1</a></sup>). */
function markerWrapper(ref: Element): Element {
  let el = ref;
  while (el.parentElement && ['SUP', 'SPAN'].includes(el.parentElement.tagName) && el.parentElement.childNodes.length === 1) el = el.parentElement;
  return el;
}

const MARKER_TEXT = /^\s*[[(]?\s*(\d{1,4}|[*†‡§]|[ivxlc]{1,6})\s*[\])]?\s*$/i;

/**
 * Footnotes in HTML of other applications and of our own exports → `<span data-type="footnote">note</span>` at the place of
 * the reference; the notes list is removed (every note moves into its reference; a note referenced twice is repeated).
 * A link to an in-document target counts as a footnote reference only when the target is inside a known notes list or
 * links back to the reference — ordinary internal links (#section) are left alone. Returns the number of footnotes.
 */
export function inlineFootnotes(root: ParentNode): number {
  const doc = (root as Node).ownerDocument ?? (root as Document);
  const used = new Set<Element>();
  let count = 0;
  for (const ref of Array.from(root.querySelectorAll('a[href^="#"]'))) {
    if (!ref.isConnected) continue;
    if (ref.closest(NOTE_LISTS) || used.has(noteContainer(ref))) continue; // a backlink inside a note
    const target = targetOf(root, (ref.getAttribute('href') ?? '').slice(1));
    if (!target || target.contains(ref) || ref.contains(target)) continue;
    const note = noteContainer(target);
    if (note.contains(ref)) continue;
    const keys = refKeys(ref);
    const backlinks = Array.from(note.querySelectorAll('a[href^="#"]')).filter((a) => keys.includes((a.getAttribute('href') ?? '').slice(1)));
    const inList = !!note.closest(NOTE_LISTS);
    if (!backlinks.length && !inList) continue;
    if (!inList && !MARKER_TEXT.test(ref.textContent ?? '')) continue;
    // note content: without its marker anchor / backlinks / leading number
    const clone = note.cloneNode(true) as Element;
    const cloneKeys = new Set([...keys, target.id, target.getAttribute('name') ?? ''].filter(Boolean));
    clone.querySelectorAll('a').forEach((a) => {
      const href = (a.getAttribute('href') ?? '').slice(1);
      const self = a.id || a.getAttribute('name') || '';
      if ((a.getAttribute('href') ?? '').startsWith('#') && (cloneKeys.has(href) || cloneKeys.has(self) || MARKER_TEXT.test(a.textContent ?? '') || /^[↩↑⏎^]+$/.test((a.textContent ?? '').trim()))) {
        const wrap = a.parentElement && ['SUP', 'SPAN'].includes(a.parentElement.tagName) && a.parentElement.childNodes.length === 1 ? a.parentElement : a;
        wrap.remove();
      }
    });
    clone.querySelectorAll('.MsoFootnoteReference, .MsoEndnoteReference').forEach((m) => m.remove());
    const span = doc.createElement('span');
    span.setAttribute('data-type', 'footnote');
    const parts: Node[][] = [];
    const blocks = Array.from(clone.children).filter((c) => BLOCKS.has(c.tagName));
    if (blocks.length && blocks.length === Array.from(clone.childNodes).filter((n) => n.nodeType === 1 || (n.nodeType === 3 && n.textContent?.trim())).length)
      blocks.forEach((b) => parts.push(b.tagName === 'UL' || b.tagName === 'OL' || b.tagName === 'TABLE' ? [doc.createTextNode(b.textContent ?? '')] : Array.from(b.childNodes)));
    else parts.push(Array.from(clone.childNodes));
    parts.forEach((p, i) => {
      if (i) span.append(doc.createElement('br'));
      span.append(...p);
    });
    // whitespace left around the removed marker anchor / backlink
    const first = span.firstChild;
    if (first?.nodeType === 3) first.textContent = (first.textContent ?? '').replace(/^\s+/, '');
    const last = span.lastChild;
    if (last?.nodeType === 3) last.textContent = (last.textContent ?? '').replace(/\s+$/, '');
    markerWrapper(ref).replaceWith(span);
    used.add(note);
    count++;
  }
  for (const note of used) {
    const list = note.closest(NOTE_LISTS) ?? (note.tagName === 'LI' ? note.parentElement : null);
    note.remove();
    if (list && !Array.from(list.querySelectorAll('li, p')).some((e) => (e.textContent ?? '').trim())) {
      // the list (and a heading / rule right before it, e.g. «Сноски» / <hr>) carried only the notes
      const prev = list.previousElementSibling;
      if (prev && (prev.tagName === 'HR' || (/^H[1-6]$/.test(prev.tagName) && /^(сноски|концевые сноски|примечания|footnotes|notes|endnotes)$/i.test((prev.textContent ?? '').trim())))) prev.remove();
      list.remove();
    }
  }
  return count;
}

/**
 * The inverse, for exported/copied HTML: footnote spans become numbered references `<sup><a href="#kb-fn-1">1</a></sup>` and
 * the notes a list at the end (`<section class="kb-footnotes">`) with links back. Readable in Word, mail and browsers, and
 * recognised again by inlineFootnotes (round trip). Returns the number of notes.
 */
export function footnotesToEndnotes(root: ParentNode, opts: { idPrefix?: string } = {}): number {
  const doc = (root as Node).ownerDocument ?? (root as Document);
  const spans = Array.from(root.querySelectorAll('span[data-type="footnote"]')).filter((s) => !s.parentElement?.closest('span[data-type="footnote"]'));
  if (!spans.length) return 0;
  const p = opts.idPrefix ?? 'kb-fn';
  const section = doc.createElement('section');
  section.setAttribute('class', 'kb-footnotes');
  section.setAttribute('data-type', 'footnotes');
  const ol = doc.createElement('ol');
  section.append(ol);
  spans.forEach((span, i) => {
    const n = i + 1;
    const sup = doc.createElement('sup');
    sup.setAttribute('class', 'kb-fn-ref');
    const a = doc.createElement('a');
    a.setAttribute('href', `#${p}-${n}`);
    a.setAttribute('id', `${p}ref-${n}`);
    a.textContent = String(n);
    sup.append(a);
    const li = doc.createElement('li');
    li.setAttribute('id', `${p}-${n}`);
    li.append(...Array.from(span.childNodes));
    const back = doc.createElement('a');
    back.setAttribute('href', `#${p}ref-${n}`);
    back.setAttribute('class', 'kb-fn-back');
    back.setAttribute('aria-label', 'Вернуться к тексту');
    back.textContent = '↩';
    li.append(doc.createTextNode(' '), back);
    ol.append(li);
    span.replaceWith(sup);
  });
  root.append(section);
  return spans.length;
}

// ------------------------------------------------------------------------------------------------ sanitiser

function sanitizeTree(root: Element, res: CleanResult, opts: NormalizeOptions) {
  const origin = opts.origin ?? null;
  // depth-first over a static list: elements may be removed or unwrapped while walking
  const all = Array.from(root.querySelectorAll('*'));
  for (const el of all) {
    if (!el.isConnected && !root.contains(el)) continue;
    const tag = el.tagName.toLowerCase();
    if (REMOVE.has(tag) || tag.includes(':')) {
      if (tag.includes(':') && tag !== 'o:p') el.querySelectorAll('img').forEach(() => res.droppedImages++);
      if (tag !== 'o:p' && tag !== 'meta' && tag !== 'link' && tag !== 'title' && tag !== 'head') res.stats.removedElements++;
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
      if (parseStyle(style).length > (s ? s.split(';').length : 0)) res.stats.droppedStyles++;
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
        let next: string | null;
        if (!sanitizeHref(href)) {
          next = null;
          res.stats.unsafeLinks++;
        } else if (origin && href.startsWith(origin + '/')) next = stripTracking(href.slice(origin.length));
        else next = stripTracking(unwrapRedirect(href));
        if (next === null) el.removeAttribute('href');
        else {
          if (next !== href && next.length < unwrapRedirect(href).length) res.stats.trackingLinks++;
          el.setAttribute('href', next);
        }
      }
    }
    if (tag === 'img') {
      const src = el.getAttribute('src') ?? '';
      const tiny = isTrackingImage(src, el.getAttribute('width'), el.getAttribute('height'));
      const figure = el.closest('figure');
      if (tiny) {
        res.stats.trackingPixels++;
        el.remove();
        continue;
      }
      if (PASTE_TOKEN.test(src) || opts.keepImageSrc?.(src)) {
        // already processed (a re-run on its own output) or a staged asset of the caller
      } else if (/^data:image\//i.test(src.trim()) && safeImageSrc(src)) {
        // stays in place (with its figure / caption) as a token; the caller uploads/stores the file into that node
        el.setAttribute('src', PASTE_TOKEN_PREFIX + res.images.length);
        res.images.push({ dataUri: src.trim(), alt: el.getAttribute('alt') ?? '' });
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

/**
 * Lists nested the way Google Docs (and some mail clients) write them — a <ul>/<ol> directly inside a <ul>/<ol>, next to
 * the items — become proper nesting: the inner list moves into the preceding item.
 */
export function fixNestedLists(root: ParentNode) {
  const doc = (root as Node).ownerDocument ?? (root as Document);
  for (const list of Array.from(root.querySelectorAll('ul > ul, ul > ol, ol > ul, ol > ol'))) {
    const prev = list.previousElementSibling;
    if (prev && prev.tagName === 'LI') prev.append(list);
    else {
      const li = doc.createElement('li');
      list.before(li);
      li.append(list);
    }
  }
  // Google Docs marks the level of flat items with aria-level (older exports): nest them
  for (const list of Array.from(root.querySelectorAll('ul, ol'))) {
    const items = Array.from(list.children).filter((c) => c.tagName === 'LI' && c.getAttribute('aria-level'));
    if (items.length < 2 || !items.some((i) => Number(i.getAttribute('aria-level')) > 1)) continue;
    const stack: Array<{ level: number; list: Element }> = [{ level: Number(items[0].getAttribute('aria-level')) || 1, list }];
    for (const li of items) {
      const level = Number(li.getAttribute('aria-level')) || 1;
      while (stack.length > 1 && stack[stack.length - 1].level > level) stack.pop();
      let top = stack[stack.length - 1];
      if (level > top.level) {
        const host = top.list.lastElementChild;
        const sub = doc.createElement(list.tagName.toLowerCase());
        (host ?? top.list).append(sub);
        stack.push((top = { level, list: sub }));
      }
      top.list.append(li); // in document order: items staying at this level keep their order
    }
  }
}

/**
 * Word specifics beyond lists: the title style becomes H1, quote styles become quotes, a caption paragraph right
 * after a picture becomes the picture's caption (figure / figcaption).
 */
export function convertWordBlocks(root: ParentNode) {
  const doc = (root as Node).ownerDocument ?? (root as Document);
  const cls = (el: Element) => el.getAttribute('class') ?? '';
  for (const p of Array.from(root.querySelectorAll('p'))) {
    const c = cls(p);
    if (/\bMsoTitle\b/i.test(c)) {
      const h = doc.createElement('h1');
      h.append(...Array.from(p.childNodes));
      p.replaceWith(h);
    } else if (/\bMso(Intense)?Quote\b/i.test(c)) {
      const q = doc.createElement('blockquote');
      p.before(q);
      q.append(p);
    } else if (/\bMsoCaption\b/i.test(c)) {
      const prev = p.previousElementSibling;
      const img = prev && (prev.tagName === 'IMG' ? prev : prev.querySelectorAll('img').length === 1 && !(prev.textContent ?? '').trim() ? prev.querySelector('img') : null);
      if (!img || !prev) continue;
      const fig = doc.createElement('figure');
      const cap = doc.createElement('figcaption');
      cap.textContent = (p.textContent ?? '').replace(/\s+/g, ' ').trim();
      prev.replaceWith(fig);
      fig.append(img, cap);
      p.remove();
    }
  }
  // consecutive quote paragraphs form one quote
  for (const q of Array.from(root.querySelectorAll('blockquote'))) {
    const next = q.nextElementSibling;
    if (next?.tagName === 'BLOCKQUOTE' && q.isConnected) {
      q.append(...Array.from(next.childNodes));
      next.remove();
    }
  }
}

/**
 * A paragraph that holds nothing but one picture is that picture (a block image): without this the parser would leave an
 * empty paragraph in front of the image it splits off.
 */
function liftLonePictures(root: Element) {
  for (const p of Array.from(root.querySelectorAll('p'))) {
    const imgs = p.querySelectorAll('img');
    if (imgs.length !== 1 || (p.textContent ?? '').replace(/[\s\u00a0\u200b]+/g, '') !== '' || imgs[0].getAttribute('data-type') === 'inline-image') continue;
    if (p.closest('li, td, th, figure, span[data-type="footnote"]')) continue;
    p.replaceWith(imgs[0]);
  }
}

/** Normalises HTML from any source (clipboard, HTML/DOCX import, HTML blocks of Markdown). */
export function normalizeHtml(html: string, opts: NormalizeOptions): CleanResult {
  // Word's conditional comments hide VML duplicates of images; drop them before parsing.
  const doc = opts.parser.parseFromString(html.replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, ''), 'text/html');
  const res: CleanResult = { html: '', images: [], droppedImages: 0, wordListItems: 0, stats: { removedElements: 0, trackingPixels: 0, trackingLinks: 0, unsafeLinks: 0, droppedStyles: 0, footnotes: 0 } };
  const body = doc.body;
  if (!body) return res;
  removeComments(body);
  res.wordListItems = convertWordLists(body);
  convertWordBlocks(body);
  fixNestedLists(body);
  res.stats.footnotes = inlineFootnotes(body);
  sanitizeTree(body, res, opts);
  liftLonePictures(body);
  // line breaks between blocks (Google Docs, Safari's interchange newline) would become empty paragraphs
  Array.from(body.children).forEach((el) => el.tagName === 'BR' && el.remove());
  res.html = body.innerHTML;
  return res;
}

/** Former name (clipboard module); `parser` defaults to the global DOMParser (browser). */
export function cleanPastedHtml(html: string, opts: { origin?: string | null; parser?: HtmlParser; keepImageSrc?: (src: string) => boolean } = {}): CleanResult {
  return normalizeHtml(html, { ...opts, parser: opts.parser ?? new (globalThis as unknown as { DOMParser: new () => HtmlParser }).DOMParser() });
}
