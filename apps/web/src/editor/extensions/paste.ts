import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Slice, Fragment, DOMSerializer, type Node as PMNodeT, type Schema } from '@tiptap/pm/model';
import { CellSelection } from '@tiptap/pm/tables';
import { yUndoPluginKey } from '@tiptap/y-tiptap';
import { sanitizeHref, tableToRows, rowsToTsv, ingestClipboard, clipboardKind, reportSummary, looksLikeMarkdown, walk, type PMNode, type ClipboardInput, type IngestEnv } from '@kb/shared';
import { markdownNow, loadMarkdown } from '../../lib/markdown';
import { cleanPastedHtml, cleanCopiedDom, dataUriToFile, PASTE_TOKEN } from '../clipboard/html';
import { parseRtf, substituteWordImages } from '../clipboard/rtf';
import { KB_CLIPBOARD_TYPE, attachmentIdsOf, parseInternal, serializeInternal } from '../clipboard/internal';
import { rehomeAttachments } from '../clipboard/rehome';
import { handleRemoteImages } from '../clipboard/hooks';
import { isHiddenRef, HIDDEN_PAGE_TITLE } from '../clipboard/redact';
import { uploadIntoBlocks } from './uploads';
import { notePaste } from './pasteOptions';
import { toast } from '../../components/ui/Toast';

export { looksLikeMarkdown } from '@kb/shared';

/** Environment of the shared ingest pipeline in the browser. */
function browserEnv(): IngestEnv {
  return { parser: new DOMParser(), origin: location.origin, markdown: markdownNow() };
}

/** Slice of converted content, opened like ProseMirror's own clipboard parser does (Slice.maxOpen). */
export function sliceOfDoc(doc: PMNode, schema: Schema): Slice {
  return Slice.maxOpen(Fragment.fromJSON(schema, doc.content ?? []));
}

/**
 * Clipboard handling. The conversion of everything that is not this knowledge base's own internal format is the shared
 * ingest pipeline (packages/shared/src/editor/ingest.ts) — the same code the server runs for DOCX/HTML/MD/CSV/XLSX/TXT
 * import, with the same report (R-IMPORT-021, D-38):
 *  - text/html (Word, Google Docs, web pages, mail, other editors; RTF-only clipboards are first converted to HTML):
 *    allowlist normalisation, Word lists, footnotes, embedded pictures uploaded into their blocks (R-CLIPBOARD-009/010/020/022);
 *  - text/markdown, or Markdown-looking text → formatted blocks; spreadsheet ranges (TSV) → tables; other text → paragraphs;
 *  - pictures and files only → upload blocks (Uploads plugin, same nodes as ingestFiles);
 *  - Ctrl/Cmd+Shift+V pastes plain text; a bare URL over selected text becomes a link;
 *  - images and files of another page become attachments of this page (POST /attachments/:id/copy), pictures of other
 *    sites are handed to the remote-images hook (copied to the server);
 *  - copying writes portable HTML (absolute URLs, no comment anchors, numbered footnotes), a table range as TSV text and
 *    the internal format (R-CLIPBOARD-006/017/018).
 * A paste is one Undo step; uploads and attachment copies complete it without adding steps.
 */
export const SmartPaste = Extension.create({
  name: 'smartPaste',
  priority: 900,
  addProseMirrorPlugins() {
    const editor = this.editor;
    let plain = false;
    return [
      new Plugin({
        key: new PluginKey('smartPaste'),
        props: {
          // ProseMirror's own HTML paste (kept for cell-by-cell pastes into tables) normalises with the same shared code
          transformPastedHTML(html) {
            return cleanPastedHtml(html, { origin: location.origin }).html;
          },
          transformPasted(slice) {
            // pictures embedded in that path have no file to upload here: they are dropped (counted in the notice)
            let dropped = 0;
            const mapped = mapImages(slice, (node) => {
              if (!PASTE_TOKEN.test(String(node.attrs.src ?? ''))) return node;
              dropped++;
              return null;
            });
            if (dropped) toast.info(`Изображений, которые не удалось перенести из буфера: ${dropped}. Скопируйте их отдельно (как изображение) или перетащите файлы.`);
            return mapped;
          },
          clipboardSerializer: portableSerializer(editor.schema),
          clipboardTextSerializer(slice) {
            // A table (cell range) is copied as TSV so it lands cell by cell in Excel / Google Sheets.
            const first = slice.content.firstChild;
            if (slice.content.childCount === 1 && first?.type.name === 'table') return rowsToTsv(tableToRows(first.toJSON() as PMNode));
            // a cell range (CellSelection) is a slice of table rows: Ctrl+C must give TSV as well (R-TABLE-003)
            if (first?.type.name === 'tableRow') return rowsToTsv(tableToRows({ type: 'table', content: (slice.content.toJSON() as PMNode[]) ?? [] } as PMNode));
            // Titles of linked pages the reader cannot open never reach the clipboard (AT-79).
            let hidden = false;
            slice.content.descendants((n) => {
              if ((n.type.name === 'pageMention' || n.type.name === 'pageLink') && isHiddenRef(n.attrs.pageId)) hidden = true;
            });
            if (hidden)
              return slice.content.textBetween(0, slice.content.size, '\n\n', (n) =>
                n.type.name === 'pageMention' || n.type.name === 'pageLink' ? (isHiddenRef(n.attrs.pageId) ? HIDDEN_PAGE_TITLE : n.attrs.title || 'Страница') : n.type.name === 'hardBreak' ? '\n' : '',
              );
            return '';
          },
          handleDOMEvents: {
            // text/html + text/plain as the editor writes them, plus the internal format (R-CLIPBOARD-018)
            copy: (view, e) => writeClipboard(view, e as ClipboardEvent, false, pageIdOf(editor)),
            cut: (view, e) => writeClipboard(view, e as ClipboardEvent, true, pageIdOf(editor)),
          },
          handleKeyDown(_view, e) {
            plain = (e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'v' || e.key === 'V' || e.key === 'м' || e.key === 'М');
            return false;
          },
          handlePaste(view, event) {
            // a paste is always its own undo step (not merged with the typing just before it)
            const um = yUndoPluginKey.getState(view.state)?.undoManager;
            um?.stopCapturing();
            // ...and typing right after the paste starts a new step too (R-EDITOR-033: one Undo = exactly the paste)
            setTimeout(() => um?.stopCapturing(), 0);
            const cd = event.clipboardData;
            const asText = plain;
            plain = false;
            if (!cd || !view.editable) return false;
            const text = cd.getData('text/plain');
            const rtf = cd.getData('text/rtf');
            let html = cd.getData('text/html');
            // RTF only (WordPad, some Office / mail clients): converted to HTML; with Word HTML: its pictures
            if (!html && rtf && !asText) html = parseRtf(rtf).html;
            else if (html && rtf) html = substituteWordImages(html, rtf).html;
            notePaste(html && !asText ? { html: true, text } : null); // paste options for formatted pastes (R-CLIPBOARD-009)
            const { $from } = view.state.selection;
            if ($from.parent.type.spec.code) return false; // code block / mermaid: browser default (plain)
            if (!asText) {
              // 1) the internal format: exact blocks (types, ids, attributes) copied in this knowledge base
              const internal = parseInternal(cd.getData(KB_CLIPBOARD_TYPE), view.state.schema);
              if (internal) {
                view.dispatch(view.state.tr.replaceSelection(internal.slice).scrollIntoView().setMeta('uiEvent', 'paste'));
                // images and files from another page become attachments of this page (its readers, its rights)
                const pageId = pageIdOf(editor);
                const ids = attachmentIdsOf(internal.json);
                if (pageId && internal.pageId !== pageId && ids.length) void rehomeAttachments(editor, ids, pageId);
                return true;
              }
              // URL over a text selection → link
              const url = text.trim();
              if (!view.state.selection.empty && /^(https?:\/\/|mailto:)\S+$/i.test(url) && sanitizeHref(url)) {
                editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
                return true;
              }
            }
            // 2) everything else: the shared pipeline
            const input: ClipboardInput = {
              html: asText ? undefined : html || undefined,
              text,
              markdown: asText ? undefined : cd.getData('text/markdown') || undefined,
              files: [...(cd.files ?? [])].map((f) => ({ name: f.name, type: f.type, size: f.size })),
              plain: asText,
            };
            const env = browserEnv();
            if (!env.markdown && (input.markdown?.trim() || (!input.html && looksLikeMarkdown(text)))) {
              // the Markdown converter is loaded on demand: the paste completes as soon as it is there (a few ms)
              void loadMarkdown().then((m) => {
                if (!editor.isDestroyed) insertIngested(editor, ingestClipboard(input, { ...env, markdown: m }));
              });
              return true;
            }
            const kind = clipboardKind(input, env);
            if (kind === 'none' || kind === 'files') return false; // pictures / files: the Uploads plugin (same nodes)
            // a range pasted into a table goes cell by cell (prosemirror-tables), from the same normalised HTML / text
            const inTable = view.state.selection instanceof CellSelection || /^table(Cell|Header)$/.test($from.node(-1)?.type.name ?? '');
            if (inTable && (kind === 'rows' || (kind === 'html' && /<table/i.test(html)))) return false;
            let res: ReturnType<typeof ingestClipboard>;
            try {
              res = ingestClipboard(input, env);
            } catch {
              return false;
            }
            return insertIngested(editor, res);
          },
        },
      }),
    ];
  },
});

/**
 * Puts converted content into the document as one transaction (one Undo step): embedded pictures become upload blocks
 * in place, then (outside the step) uploads start, attachments of other pages are copied, pictures of other sites go to
 * the remote-images hook, and anything that could not be taken over is reported.
 */
export function insertIngested(editor: Editor, res: ReturnType<typeof ingestClipboard>): boolean {
  const view = editor.view;
  const pageId = pageIdOf(editor);
  const uploads: Array<{ id: string; file: File }> = [];
  let lost = 0;
  const doc = structuredClone(res.doc);
  walk(doc, (n) => {
    const m = PASTE_TOKEN.exec(String(n.attrs?.src ?? ''));
    if (!m || !n.attrs) return;
    const im = res.images[Number(m[1])];
    if (!pageId || !im) {
      // no page to attach the file to: a visible placeholder instead of a broken picture
      lost++;
      const label = `[изображение: ${n.attrs.alt || 'без описания'}]`;
      if (n.type === 'image') Object.assign(n, { type: 'paragraph', attrs: {}, content: [{ type: 'text', text: label }] });
      else Object.assign(n, { type: 'text', text: label, attrs: undefined });
      return false;
    }
    const id = crypto.randomUUID();
    uploads.push({ id, file: dataUriToFile(im.dataUri, im.alt || `Изображение ${uploads.length + 1}`) });
    n.attrs = { ...n.attrs, src: null, uploadId: id };
  });
  let slice: Slice;
  try {
    slice = sliceOfDoc(doc, view.state.schema);
  } catch {
    return false;
  }
  const single = slice.openStart === 0 && slice.openEnd === 0 && slice.content.childCount === 1 ? slice.content.firstChild : null;
  const tr = single ? view.state.tr.replaceSelectionWith(single, false) : view.state.tr.replaceSelection(slice);
  view.dispatch(tr.scrollIntoView().setMeta('uiEvent', 'paste'));
  if (pageId) {
    if (uploads.length) uploadIntoBlocks(editor, uploads, pageId);
    handleRemoteImages(editor, res.remoteImages, pageId);
    // pictures and files of another page of this knowledge base (HTML copied without the internal format)
    const ids = attachmentIdsOf(doc.content ?? []);
    if (ids.length) void rehomeAttachments(editor, ids, pageId);
  }
  // what could not be taken over is said (the same report as an import; pictures in the clipboard's own words)
  const droppedImages = (res.report.dropped.images ?? 0) + lost;
  const other = reportSummary({ ...res.report, warnings: res.report.warnings.filter((w) => w.code !== 'dropped-images') });
  const summary = [droppedImages ? `Изображений, которые не удалось перенести из буфера: ${droppedImages}. Скопируйте их отдельно (как изображение) или перетащите файлы.` : '', other].filter(Boolean).join(' ');
  if (summary) toast.info(summary);
  return true;
}

/** Maps image nodes of a slice (null drops the node). */
function mapImages(slice: Slice, fn: (n: PMNodeT) => PMNodeT | null): Slice {
  const walk = (frag: Fragment): Fragment => {
    let changed = false;
    const out: PMNodeT[] = [];
    frag.forEach((n) => {
      const r = n.type.name === 'image' || n.type.name === 'inlineImage' ? fn(n) : n.childCount ? n.copy(walk(n.content)) : n;
      if (r !== n) changed = true;
      if (r) out.push(r);
    });
    return changed ? Fragment.fromArray(out) : frag;
  };
  const content = walk(slice.content);
  return content === slice.content ? slice : new Slice(content, slice.openStart, slice.openEnd);
}

const pageIdOf = (editor: Editor) => (editor.storage as unknown as { kbPage?: { pageId?: string } }).kbPage?.pageId ?? null;

/** Copy / cut: the editor's own text/html and text/plain plus the internal format. */
function writeClipboard(view: import('@tiptap/pm/view').EditorView, e: ClipboardEvent, cut: boolean, pageId: string | null): boolean {
  const sel = view.state.selection;
  const cd = e.clipboardData;
  if (sel.empty || !cd) return false;
  const slice = sel.content();
  const { dom, text } = view.serializeForClipboard(slice);
  e.preventDefault();
  cd.clearData();
  cd.setData('text/html', dom.innerHTML);
  cd.setData('text/plain', text);
  try {
    cd.setData(KB_CLIPBOARD_TYPE, serializeInternal(slice, pageId));
  } catch {
    /* a browser without custom clipboard types: HTML still carries the blocks */
  }
  if (cut && view.editable) {
    // a cut is its own undo step (R-HISTORY-017)
    const um = yUndoPluginKey.getState(view.state)?.undoManager;
    um?.stopCapturing();
    view.dispatch(view.state.tr.deleteSelection().scrollIntoView().setMeta('uiEvent', 'cut'));
    um?.stopCapturing();
  }
  return true;
}

/** Clipboard HTML = the schema's own markup made portable (cleanCopiedDom). */
function portableSerializer(schema: import('@tiptap/pm/model').Schema): DOMSerializer {
  const base = DOMSerializer.fromSchema(schema);
  const ser = new DOMSerializer(base.nodes, base.marks);
  const serializeFragment = ser.serializeFragment.bind(ser);
  ser.serializeFragment = ((fragment, options, target) => {
    const out = serializeFragment(fragment, options, target);
    cleanCopiedDom(out as unknown as ParentNode, location.origin);
    return out;
  }) as DOMSerializer['serializeFragment'];
  return ser;
}
