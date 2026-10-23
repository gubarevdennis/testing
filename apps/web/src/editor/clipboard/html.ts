/**
 * Clipboard HTML in the browser. The normalisation of pasted HTML is the shared pipeline of every HTML input
 * (packages/shared/src/editor/html-normalize.ts — the server's HTML/DOCX import runs the same code, R-IMPORT-021); this
 * module re-exports it for the editor and adds what only the browser does:
 *  - dataUriToFile: an embedded picture becomes a File to upload;
 *  - cleanCopiedDom: makes HTML written to the clipboard portable (absolute URLs, no comment anchors / DOM ids,
 *    footnotes as numbered references + a notes list).
 */
import { footnotesToEndnotes } from '@kb/shared';
import { redactDomRefs } from './redact';

export {
  cleanPastedHtml,
  normalizeHtml,
  convertWordLists,
  convertWordBlocks,
  fixNestedLists,
  filterStyle,
  toHex,
  stripTracking,
  unwrapRedirect,
  isTrackingImage,
  inlineFootnotes,
  PASTE_TOKEN,
  PASTE_TOKEN_PREFIX,
  type PastedImage,
  type CleanResult,
} from '@kb/shared';

function unwrap(el: Element) {
  el.replaceWith(...Array.from(el.childNodes));
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
  redactDomRefs(root); // titles of linked pages the reader cannot open (AT-79)
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
  // footnotes: numbered references + the notes after the copied content (Word, mail; recognised again on paste)
  footnotesToEndnotes(root);
}
