import { Extension, type Editor } from '@tiptap/core';
import { useUploadState } from '../../lib/uploadState';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
import { uploadFile, isImageFile, type AttachmentDto } from '../../lib/uploads';
import { saveUpload, loadUpload, dropUpload, patchUpload, uploadsForPage } from '../../lib/pendingUploads';

/**
 * Uploads as real document blocks (R-MEDIA-006, R-MEDIA-008, UX13-03).
 *
 * A dropped/pasted/chosen file immediately becomes an `image` / `fileBlock` node with `uploadId` (local preview from
 * the file, progress, retry). The file is kept in IndexedDB (lib/pendingUploads) until the server stored it; then the
 * same node is completed in place (attachmentId, src) in a transaction that is not an undo step. Because the block is
 * part of the document it survives re-renders, sync and reloads; an error never removes it; closing the tab during the
 * upload resumes it the next time the page is opened in this browser.
 */
export interface UploadItem {
  id: string;
  pageId: string;
  file: File;
  progress: number;
  state: 'uploading' | 'waiting' | 'error';
  error?: string;
  preview?: string;
  controller: AbortController;
}

export const uploadsKey = new PluginKey('kbUploads');
const items = new Map<string, UploadItem>();
const listeners = new Map<string, Set<() => void>>();
/** Editors by page, so a finished upload is applied to the editor currently showing its page. */
const editors = new Map<string, Editor>();

function notify(id: string) {
  listeners.get(id)?.forEach((l) => l());
  const active: Record<string, number> = {};
  for (const i of items.values()) if (i.state !== 'error') active[i.pageId] = (active[i.pageId] ?? 0) + 1;
  const prev = useUploadState.getState().active;
  if (JSON.stringify(prev) !== JSON.stringify(active)) useUploadState.setState({ active });
}

export function subscribeUpload(id: string, cb: () => void) {
  let set = listeners.get(id);
  if (!set) listeners.set(id, (set = new Set()));
  set.add(cb);
  return () => {
    set!.delete(cb);
    if (!set!.size) listeners.delete(id);
  };
}

export function getUploadItem(id: string): UploadItem | undefined {
  return items.get(id);
}

/** Alt text from the file name ("Схема_склада.png" → "Схема склада"); generic clipboard names → "Изображение". */
export function altFromName(name: string): string {
  const base = name.replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[_]+/g, ' ').trim();
  if (!base || /^(image|img|clipboard|screenshot|pasted|blob|изображение)[\s\d-]*$/i.test(base)) return 'Изображение';
  return base.slice(0, 200);
}

function placeholderNode(file: File, id: string) {
  return isImageFile(file)
    ? { type: 'image', attrs: { uploadId: id, alt: altFromName(file.name || '') } }
    : { type: 'fileBlock', attrs: { uploadId: id, name: file.name || 'Файл', size: file.size, mime: file.type || null, view: 'compact' } };
}

/** Inserts blocks at a block boundary: replaces an empty paragraph, otherwise goes after the current text block. */
function insertBlocks(editor: Editor, nodes: object[], pos: number) {
  const doc = editor.state.doc;
  const $pos = doc.resolve(Math.min(pos, doc.content.size));
  const chain = editor.chain();
  if ($pos.parent.isTextblock && $pos.depth > 0) {
    if ($pos.parent.content.size === 0) chain.insertContentAt({ from: $pos.before(), to: $pos.after() }, nodes);
    else chain.insertContentAt($pos.after(), nodes);
  } else chain.insertContentAt(pos, nodes);
  chain.run();
}

/** Finds the node carrying `uploadId`. */
export function findUploadNode(doc: PMNode, id: string): { node: PMNode; pos: number } | null {
  let found: { node: PMNode; pos: number } | null = null;
  doc.descendants((node, pos) => {
    if (found) return false;
    if (node.attrs.uploadId === id) {
      found = { node, pos };
      return false;
    }
    return true;
  });
  return found;
}

function attachmentAttrs(node: PMNode, a: AttachmentDto) {
  if (node.type.name === 'image')
    return { ...node.attrs, uploadId: null, src: a.contentUrl, attachmentId: a.id, naturalWidth: a.width, naturalHeight: a.height, width: node.attrs.width ?? (a.width && a.width > 720 ? null : a.width) };
  return { ...node.attrs, uploadId: null, attachmentId: a.id, name: a.filename, size: a.size, mime: a.mime };
}

/** Completes the placeholder in place. Returns false when the editor or the block is gone. */
function complete(editor: Editor | undefined, id: string, a: AttachmentDto): 'done' | 'no-editor' | 'no-node' {
  if (!editor || editor.isDestroyed) return 'no-editor';
  const hit = findUploadNode(editor.state.doc, id);
  if (!hit) return 'no-node';
  // not an undo step: Ctrl+Z after the upload must not turn the image back into a placeholder
  editor.view.dispatch(editor.state.tr.setNodeMarkup(hit.pos, undefined, attachmentAttrs(hit.node, a)).setMeta('addToHistory', false));
  return 'done';
}

/** Removes the placeholder block (user pressed "Убрать"/"Отменить") and forgets the local file. */
export function cancelUpload(editor: Editor, id: string) {
  const item = items.get(id);
  item?.controller.abort();
  items.delete(id);
  if (item?.preview) URL.revokeObjectURL(item.preview);
  void dropUpload(id);
  const hit = findUploadNode(editor.state.doc, id);
  if (hit) editor.view.dispatch(editor.state.tr.delete(hit.pos, hit.pos + hit.node.nodeSize));
  notify(id);
}

export function retryUpload(editor: Editor, id: string) {
  const item = items.get(id);
  if (!item) return;
  item.controller = new AbortController();
  void run(editor, item);
}

function track(file: File, id: string, pageId: string): UploadItem {
  const item: UploadItem = { id, pageId, file, progress: 0, state: 'uploading', controller: new AbortController(), preview: isImageFile(file) && file.size < 30e6 ? URL.createObjectURL(file) : undefined };
  items.set(id, item);
  notify(id);
  return item;
}

/** Inserts upload blocks at `pos` right away and uploads the files in the background. */
export function startUploads(editor: Editor, files: File[], pos: number, pageId: string) {
  if (!files.length) return;
  editors.set(pageId, editor);
  const started = files.map((file) => {
    const id = crypto.randomUUID();
    const item = track(file, id, pageId);
    return { item, node: placeholderNode(file, id) };
  });
  insertBlocks(
    editor,
    started.map((s) => s.node),
    pos,
  );
  for (const { item } of started) {
    // persist first (best effort), then upload: a closed tab resumes from IndexedDB
    void saveUpload({ id: item.id, pageId, name: item.file.name, type: item.file.type, lastModified: item.file.lastModified, size: item.file.size, blob: item.file, ts: Date.now() }).then(() => run(editor, item));
  }
}

async function run(editor: Editor, item: UploadItem) {
  item.state = 'uploading';
  item.error = undefined;
  notify(item.id);
  try {
    const a = await uploadFile(
      item.file,
      item.pageId,
      (p, st) => {
        item.progress = p;
        item.state = st === 'waiting' ? 'waiting' : 'uploading';
        notify(item.id);
      },
      item.controller.signal,
    );
    if (!items.has(item.id)) return; // cancelled meanwhile
    const target = editors.get(item.pageId) ?? editor;
    const r = complete(target, item.id, a);
    if (r === 'no-editor') await patchUpload(item.id, { attachment: a, blob: undefined });
    else await dropUpload(item.id);
    items.delete(item.id);
    if (item.preview) setTimeout(() => URL.revokeObjectURL(item.preview!), 30_000);
    notify(item.id);
  } catch (e) {
    if ((e as Error).name === 'AbortError') return;
    item.state = 'error';
    item.error = (e as Error).message || 'Ошибка загрузки';
    notify(item.id);
  }
}

/**
 * Called when a page is opened with edit rights: placeholders of this page whose file is still in this browser
 * resume uploading; finished-but-unapplied uploads are applied; stored files whose block no longer exists are dropped.
 */
export async function resumeUploads(editor: Editor, pageId: string) {
  editors.set(pageId, editor);
  const stored = await uploadsForPage(pageId);
  if (editor.isDestroyed) return;
  for (const s of stored) {
    if (items.has(s.id)) continue;
    const hit = findUploadNode(editor.state.doc, s.id);
    if (!hit) {
      if (Date.now() - s.ts > 10_000) await dropUpload(s.id);
      continue;
    }
    if (s.attachment) {
      if (complete(editor, s.id, s.attachment) === 'done') await dropUpload(s.id);
      notify(s.id);
      continue;
    }
    if (!s.blob) continue;
    const file = new File([s.blob], s.name, { type: s.type, lastModified: s.lastModified });
    void run(editor, track(file, s.id, pageId));
  }
}

/** Whether this browser still holds the file of a placeholder (another user's placeholder → false). */
export async function hasLocalUpload(id: string) {
  return !!(await loadUpload(id));
}

export const Uploads = Extension.create<{ pageId: () => string }>({
  name: 'kbUploads',
  addOptions() {
    return { pageId: () => '' };
  },
  onDestroy() {
    const pageId = this.options.pageId();
    if (editors.get(pageId) === this.editor) editors.delete(pageId);
  },
  addProseMirrorPlugins() {
    const editor = this.editor;
    const pageId = this.options.pageId;
    return [
      new Plugin({
        key: uploadsKey,
        props: {
          handleDrop(view, event, _slice, moved) {
            const files = [...(event.dataTransfer?.files ?? [])];
            if (moved || !files.length || !view.editable) return false;
            event.preventDefault();
            const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
            startUploads(editor, files, coords?.pos ?? view.state.selection.from, pageId());
            return true;
          },
          handlePaste(view, event) {
            const files = [...(event.clipboardData?.files ?? [])];
            if (!files.length || !view.editable) return false;
            // Office apps put both an HTML table and a PNG rendering on the clipboard: prefer the structured data.
            const html = event.clipboardData?.getData('text/html') ?? '';
            if (html && /<table|<p|<h\d|<li/i.test(html)) return false;
            event.preventDefault();
            startUploads(editor, files, view.state.selection.from, pageId());
            return true;
          },
        },
      }),
    ];
  },
});

export function pendingUploads() {
  return items.size;
}
