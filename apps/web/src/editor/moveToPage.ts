/**
 * Moving blocks to another page (R-EDITOR-076, E215, R-EDITOR-049): the blocks are appended to the target page through
 * its own collaboration channel and removed here only after the server acknowledged the target change — so a network
 * failure or missing rights can at worst leave a copy, never lose the block. Block ids, order and content are kept.
 */
import type { Editor } from '@tiptap/core';
import { Fragment } from '@tiptap/pm/model';
import { updateYFragment, yXmlFragmentToProseMirrorRootNode } from '@tiptap/y-tiptap';
import { FRAGMENT_NAME } from '@kb/shared';
import { get } from '../api/client';
import { openCollab } from '../sync/collab';

export type MoveResult = { ok: true } | { ok: false; reason: 'no-access' | 'not-saved' | 'error'; message: string };

const wait = (pred: () => boolean, ms: number) =>
  new Promise<boolean>((resolve) => {
    const start = Date.now();
    const tick = () => (pred() ? resolve(true) : Date.now() - start > ms ? resolve(false) : setTimeout(tick, 50));
    tick();
  });

export async function moveBlocksToPage(editor: Editor, from: number, to: number, targetPageId: string, userId: string, timeoutMs = 15_000): Promise<MoveResult> {
  const slice = editor.state.doc.slice(from, to);
  const nodes = slice.content;
  if (!nodes.childCount || slice.openStart || slice.openEnd) return { ok: false, reason: 'error', message: 'Выделите блоки целиком' };
  let meta: { page: { docGeneration: string | null; access?: { actions?: { edit?: boolean } } } };
  try {
    meta = await get(`/api/v1/pages/${targetPageId}`);
  } catch (e) {
    return { ok: false, reason: 'error', message: (e as Error).message };
  }
  if (meta.page.access?.actions && !meta.page.access.actions.edit) return { ok: false, reason: 'no-access', message: 'Нет права редактировать выбранную страницу — блок оставлен на месте' };
  let canEdit = true;
  let synced = false;
  const s = openCollab(targetPageId, meta.page.docGeneration, userId, {
    onSynced: () => (synced = true),
    onAccess: (ce) => (canEdit = ce),
  });
  try {
    await s.localReady;
    if (!(await wait(() => synced || !canEdit, timeoutMs)) || !canEdit)
      return { ok: false, reason: canEdit ? 'not-saved' : 'no-access', message: canEdit ? 'Нет связи с сервером — блок оставлен на месте' : 'Нет права редактировать выбранную страницу — блок оставлен на месте' };
    const frag = s.doc.getXmlFragment(FRAGMENT_NAME);
    const target = yXmlFragmentToProseMirrorRootNode(frag, editor.schema);
    const onlyEmpty = target.childCount === 1 && target.firstChild!.isTextblock && target.firstChild!.content.size === 0;
    const next = target.copy(onlyEmpty ? nodes : target.content.append(Fragment.from(nodes)));
    next.check();
    s.doc.transact(() => updateYFragment(s.doc, frag, next, { mapping: new Map(), isOMark: new Map() }));
    s.provider.flush();
    const saved = await wait(() => s.provider.pendingCount() === 0 && s.provider.status === 'saved', timeoutMs);
    if (!saved) return { ok: false, reason: 'not-saved', message: 'Блоки добавлены на выбранную страницу, но ещё не сохранены на сервере — исходные блоки оставлены на месте (копия отправится при подключении)' };
    // the target holds the blocks: remove them here in one step
    if (!editor.isDestroyed) {
      const cur = to <= editor.state.doc.content.size ? editor.state.doc.slice(from, to).content : null;
      if (!cur?.eq(nodes)) return { ok: false, reason: 'error', message: 'Страница изменилась во время переноса — блоки скопированы на выбранную страницу, исходные оставлены' };
      editor.view.dispatch(editor.state.tr.delete(from, to).scrollIntoView());
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: 'error', message: (e as Error).message };
  } finally {
    s.destroy();
  }
}
