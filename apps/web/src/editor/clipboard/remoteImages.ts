/**
 * Pictures of other sites in pasted content (SEC-L1, R-SECURITY-008): never hot-linked. The browser does not load them
 * at all — the application CSP allows images only from this origin (img-src 'self' data: blob:) — and they are copied
 * by the server through the SSRF-guarded fetcher (POST /api/v1/attachments/from-url → services/remote-fetch.ts).
 *
 * Progress and failures are shown in place (decorations: «Копирование изображения…», «Не скопировано» with «Повторить»)
 * and summarised in one notice. The swap to the copy is written outside the Undo history, so the paste stays exactly
 * one Undo step. Installed as the paste pipeline's remote-images hook (clipboard/hooks.ts).
 */
import type { Editor } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNodeT } from '@tiptap/pm/model';
import { post, ApiError } from '../../api/client';
import { toast } from '../../components/ui/Toast';

type Status = { state: 'pending' } | { state: 'failed'; message: string };
type Statuses = Map<string, Status>;

interface RemoteDto {
  attachment: { id: string; contentUrl: string; width: number | null; height: number | null };
}

const key = new PluginKey<Statuses>('kbRemoteImages');
const CONCURRENCY = 3;
const MAX_PER_PASTE = 50;

const isImage = (n: PMNodeT) => n.type.name === 'image' || n.type.name === 'inlineImage';
/** http(s) picture of another origin (not yet an attachment of this knowledge base). */
export function isExternalSrc(src: unknown): src is string {
  if (typeof src !== 'string' || !/^https?:\/\//i.test(src)) return false;
  try {
    return new URL(src).origin !== location.origin;
  } catch {
    return false;
  }
}

function statusWidget(status: Status, src: string, retry: (src: string) => void): HTMLElement {
  const el = document.createElement('span');
  el.className = 'kb-remote-image-status';
  el.setAttribute('contenteditable', 'false');
  el.setAttribute('role', 'status');
  el.dataset.remoteStatus = status.state;
  el.style.cssText = 'display:inline-flex;gap:6px;align-items:center;font-size:12px;color:var(--text-muted,#68717D);margin:2px 0;user-select:none';
  if (status.state === 'pending') {
    el.textContent = 'Копирование изображения с другого сайта…';
    return el;
  }
  el.style.color = 'var(--danger,#B42318)';
  const text = document.createElement('span');
  text.textContent = `Изображение с другого сайта не скопировано — читатели его не увидят (${status.message})`;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn sm';
  btn.textContent = 'Повторить';
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', () => retry(src));
  el.append(text, btn);
  return el;
}

function decorations(state: EditorState, statuses: Statuses, retry: (src: string) => void): DecorationSet {
  if (!statuses.size) return DecorationSet.empty;
  const decos: Decoration[] = [];
  state.doc.descendants((node, pos) => {
    if (!isImage(node) || node.attrs.attachmentId) return;
    const src = String(node.attrs.src ?? '');
    const st = statuses.get(src);
    if (!st) return;
    decos.push(Decoration.node(pos, pos + node.nodeSize, { class: `kb-remote-image kb-remote-${st.state}`, 'data-remote-status': st.state, style: st.state === 'pending' ? 'opacity:.55' : 'outline:2px dashed var(--danger,#B42318);outline-offset:2px' }));
    decos.push(Decoration.widget(pos + node.nodeSize, () => statusWidget(st, src, retry), { side: -1, key: `${st.state}:${src}`, ignoreSelection: true }));
  });
  return DecorationSet.create(state.doc, decos);
}

/** Plugin holding the copy status per external src (one per editor, registered on first use). */
function ensurePlugin(editor: Editor, retry: (src: string) => void) {
  if (key.getState(editor.state)) return;
  editor.registerPlugin(
    new Plugin<Statuses>({
      key,
      state: {
        init: () => new Map(),
        apply: (tr, prev) => (tr.getMeta(key) as Statuses | undefined) ?? prev,
      },
      props: { decorations: (state) => decorations(state, key.getState(state) ?? new Map(), retry) },
    }),
  );
}

function setStatus(editor: Editor, src: string, status: Status | null) {
  if (editor.isDestroyed) return;
  const next = new Map(key.getState(editor.state) ?? []);
  if (status) next.set(src, status);
  else next.delete(src);
  editor.view.dispatch(editor.state.tr.setMeta(key, next).setMeta('addToHistory', false));
}

/** Points every pasted node with `src` at the stored copy (outside the Undo history: the paste stays one step). */
function swap(editor: Editor, src: string, a: RemoteDto['attachment']) {
  if (editor.isDestroyed) return;
  const tr = editor.state.tr;
  editor.state.doc.descendants((node, pos) => {
    if (isImage(node) && !node.attrs.attachmentId && node.attrs.src === src)
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, src: a.contentUrl, attachmentId: a.id, naturalWidth: a.width, naturalHeight: a.height }, node.marks);
  });
  const next = new Map(key.getState(editor.state) ?? []);
  next.delete(src);
  editor.view.dispatch(tr.setMeta(key, next).setMeta('addToHistory', false));
}

async function copyOne(editor: Editor, src: string, pageId: string): Promise<boolean> {
  setStatus(editor, src, { state: 'pending' });
  try {
    const r = await post<RemoteDto>('/api/v1/attachments/from-url', { url: src, pageId });
    swap(editor, src, r.attachment);
    return true;
  } catch (e) {
    setStatus(editor, src, { state: 'failed', message: e instanceof ApiError ? e.message : 'нет связи с сервером' });
    return false;
  }
}

/** Remote-images hook of the paste pipeline: copies the pictures (3 at a time) and reports the outcome once. */
export async function copyRemoteImages(editor: Editor, srcs: string[], pageId: string) {
  const list = [...new Set(srcs.filter(isExternalSrc))].slice(0, MAX_PER_PASTE);
  if (!list.length || editor.isDestroyed) return;
  const retry = (src: string) => void copyOne(editor, src, pageId).then((ok) => ok && toast.success('Изображение скопировано'));
  ensurePlugin(editor, retry);
  for (const src of list) setStatus(editor, src, { state: 'pending' });
  let failed = 0;
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const src = list[next++];
      if (!(await copyOne(editor, src, pageId))) failed++;
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, worker));
  if (failed)
    toast.info(
      `Изображений с других сайтов, оставленных внешними ссылками: ${failed} — сервер не смог их скопировать, поэтому они не показываются (внешние изображения не загружаются из соображений безопасности). Нажмите «Повторить» у изображения или вставьте его файлом.`,
    );
}
