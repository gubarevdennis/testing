import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { uploadFile, isImageFile, type AttachmentDto } from '../../lib/uploads';
import { fileSize } from '../../lib/format';

interface UploadItem {
  id: string;
  pos: number;
  file: File;
  progress: number;
  state: 'uploading' | 'waiting' | 'error';
  error?: string;
  preview?: string;
  controller: AbortController;
}

export const uploadsKey = new PluginKey<DecorationSet>('kbUploads');
const items = new Map<string, UploadItem>();

function widget(item: UploadItem) {
  const el = document.createElement('div');
  el.className = 'kb-upload' + (item.state === 'error' ? ' error' : '');
  el.contentEditable = 'false';
  el.dataset.uploadId = item.id;
  render(el, item);
  return el;
}

function render(el: HTMLElement, item: UploadItem) {
  el.replaceChildren();
  if (item.preview) {
    const img = document.createElement('img');
    img.src = item.preview;
    img.alt = '';
    el.append(img);
  }
  const info = document.createElement('div');
  info.className = 'kb-upload-info';
  const name = document.createElement('div');
  name.className = 'kb-upload-name';
  name.textContent = `${item.file.name || 'Файл'} · ${fileSize(item.file.size)}`;
  const status = document.createElement('div');
  status.className = 'kb-upload-status';
  status.setAttribute('role', 'status');
  status.textContent =
    item.state === 'error' ? item.error ?? 'Ошибка загрузки' : item.state === 'waiting' ? 'Ожидание сети — загрузка продолжится автоматически' : `Загрузка… ${Math.round(item.progress * 100)}%`;
  const bar = document.createElement('div');
  bar.className = 'progress';
  const fill = document.createElement('div');
  fill.style.width = `${Math.round(item.progress * 100)}%`;
  bar.append(fill);
  info.append(name, status);
  if (item.state !== 'error') info.append(bar);
  const actions = document.createElement('div');
  actions.className = 'kb-upload-actions';
  if (item.state === 'error') {
    const retry = document.createElement('button');
    retry.className = 'btn sm';
    retry.textContent = 'Повторить';
    retry.dataset.action = 'retry';
    actions.append(retry);
  }
  const cancel = document.createElement('button');
  cancel.className = 'btn sm ghost';
  cancel.textContent = item.state === 'error' ? 'Убрать' : 'Отменить';
  cancel.dataset.action = 'cancel';
  actions.append(cancel);
  el.append(info, actions);
}

function refresh(id: string) {
  const el = document.querySelector<HTMLElement>(`.kb-upload[data-upload-id="${id}"]`);
  const item = items.get(id);
  if (el && item) {
    el.classList.toggle('error', item.state === 'error');
    render(el, item);
  }
}

function setDecos(editor: Editor) {
  editor.view.dispatch(editor.state.tr.setMeta(uploadsKey, 'refresh'));
}

/** Starts uploading files and inserts image/file blocks at `pos` once each upload is stored on the server. */
export function startUploads(editor: Editor, files: File[], pos: number, pageId: string) {
  for (const file of files) {
    const id = Math.random().toString(36).slice(2);
    const item: UploadItem = { id, pos, file, progress: 0, state: 'uploading', controller: new AbortController(), preview: isImageFile(file) && file.size < 30e6 ? URL.createObjectURL(file) : undefined };
    items.set(id, item);
    run(editor, item, pageId);
  }
  setDecos(editor);
}

async function run(editor: Editor, item: UploadItem, pageId: string) {
  item.state = 'uploading';
  item.error = undefined;
  refresh(item.id);
  try {
    const a = await uploadFile(
      item.file,
      pageId,
      (p, st) => {
        item.progress = p;
        item.state = st === 'waiting' ? 'waiting' : 'uploading';
        refresh(item.id);
      },
      item.controller.signal,
    );
    if (editor.isDestroyed) return;
    const pos = Math.min(item.pos, editor.state.doc.content.size);
    items.delete(item.id);
    if (item.preview) URL.revokeObjectURL(item.preview);
    insertAttachment(editor, a, pos);
  } catch (e) {
    if ((e as Error).name === 'AbortError') return;
    item.state = 'error';
    item.error = (e as Error).message;
    refresh(item.id);
  }
}

export function insertAttachment(editor: Editor, a: AttachmentDto, pos: number) {
  const isImage = a.kind === 'image' || /^image\//.test(a.mime);
  const node = isImage
    ? { type: 'image', attrs: { src: a.contentUrl, attachmentId: a.id, alt: '', naturalWidth: a.width, naturalHeight: a.height, width: a.width && a.width > 720 ? null : a.width } }
    : { type: 'fileBlock', attrs: { attachmentId: a.id, name: a.filename, size: a.size, mime: a.mime, view: 'compact' } };
  const $pos = editor.state.doc.resolve(pos);
  // insert at block boundary: after the current block when inside text
  let at = pos;
  if ($pos.parent.isTextblock) at = $pos.parent.content.size === 0 ? $pos.before() : $pos.after();
  const empty = $pos.parent.isTextblock && $pos.parent.content.size === 0 && $pos.depth > 0;
  const chain = editor.chain();
  if (empty) chain.insertContentAt({ from: $pos.before(), to: $pos.after() }, node);
  else chain.insertContentAt(at, node);
  chain.run();
}

export const Uploads = Extension.create<{ pageId: () => string }>({
  name: 'kbUploads',
  addOptions() {
    return { pageId: () => '' };
  },
  addProseMirrorPlugins() {
    const editor = this.editor;
    const pageId = this.options.pageId;
    return [
      new Plugin<DecorationSet>({
        key: uploadsKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set) {
            for (const item of items.values()) item.pos = tr.mapping.map(item.pos);
            if (tr.getMeta(uploadsKey) || tr.docChanged) {
              return DecorationSet.create(
                tr.doc,
                [...items.values()].map((i) => Decoration.widget(Math.min(i.pos, tr.doc.content.size), () => widget(i), { key: i.id + ':' + i.state, side: 1 })),
              );
            }
            return set.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations(state) {
            return uploadsKey.getState(state);
          },
          handleDOMEvents: {
            click(_view, e) {
              const btn = (e.target as HTMLElement).closest<HTMLElement>('.kb-upload button');
              if (!btn) return false;
              const id = btn.closest<HTMLElement>('.kb-upload')!.dataset.uploadId!;
              const item = items.get(id);
              if (!item) return true;
              if (btn.dataset.action === 'cancel') {
                item.controller.abort();
                items.delete(id);
                if (item.preview) URL.revokeObjectURL(item.preview);
                setDecos(editor);
              } else if (btn.dataset.action === 'retry') {
                item.controller = new AbortController();
                run(editor, item, pageId());
              }
              return true;
            },
          },
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
