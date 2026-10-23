/**
 * Images and files pasted or moved from another page become attachments of the target page (R-CLIPBOARD-018/024,
 * R-EDITOR-076): the server copies the attachment (same stored bytes) when the user may download it there and edit
 * here; the references in the document are then switched to the copy. Without the download right the original
 * reference stays (the readers of this page cannot open it) and the user is told.
 */
import type { Editor } from '@tiptap/core';
import type { PMNode } from '@kb/shared';
import { post } from '../../api/client';
import { toast } from '../../components/ui/Toast';

interface Copied {
  attachment: { id: string; contentUrl: string };
  copied: boolean;
}

/** Copies the attachments to `pageId`; returns old id → new id for the ones copied, and the number refused. */
export async function copyAttachmentsTo(ids: string[], pageId: string): Promise<{ map: Map<string, string>; refused: number }> {
  const map = new Map<string, string>();
  let refused = 0;
  await Promise.all(
    ids.map(async (id) => {
      try {
        const r = await post<Copied>(`/api/v1/attachments/${id}/copy`, { pageId });
        if (r.copied && r.attachment.id !== id) map.set(id, r.attachment.id);
      } catch {
        refused++;
      }
    }),
  );
  return { map, refused };
}

/** Replaces attachment ids in attributes (attachmentId and URLs that contain the id). */
export function rewriteAttrs(attrs: Record<string, unknown>, map: Map<string, string>): Record<string, unknown> | null {
  const old = typeof attrs.attachmentId === 'string' ? attrs.attachmentId : null;
  const next = old ? map.get(old) : undefined;
  if (!old || !next) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(attrs)) out[k] = typeof v === 'string' ? v.split(`/attachments/${old}/`).join(`/attachments/${next}/`) : v;
  out.attachmentId = next;
  return out;
}

/** JSON variant (moving blocks to another page before they are written there). */
export function rewriteJson(nodes: PMNode[], map: Map<string, string>): PMNode[] {
  const walk = (n: PMNode): PMNode => {
    const attrs = n.attrs ? rewriteAttrs(n.attrs, map) : null;
    return { ...n, ...(attrs ? { attrs } : {}), ...(n.content ? { content: n.content.map(walk) } : {}) };
  };
  return nodes.map(walk);
}

export function refusedMessage(n: number) {
  return `Файлов, оставшихся привязанными к исходной странице: ${n} — у вас нет права скачивать их там. Читатели этой страницы их не увидят.`;
}

/** After a paste: copies the attachments and switches the pasted nodes to the copies (not a separate Undo step). */
export async function rehomeAttachments(editor: Editor, ids: string[], pageId: string) {
  const { map, refused } = await copyAttachmentsTo(ids, pageId);
  if (refused) toast.info(refusedMessage(refused));
  if (!map.size || editor.isDestroyed) return;
  const tr = editor.state.tr;
  editor.state.doc.descendants((node, pos) => {
    const attrs = node.attrs.attachmentId ? rewriteAttrs(node.attrs, map) : null;
    if (attrs) tr.setNodeMarkup(pos, undefined, attrs, node.marks);
  });
  if (tr.docChanged) editor.view.dispatch(tr.setMeta('addToHistory', false));
}

interface RemoteDto {
  attachment: { id: string; contentUrl: string; width: number | null; height: number | null };
}

/**
 * Pictures of other sites in a pasted document (Google Docs, web pages, mail) are copied to the server like «Изображение
 * по ссылке» (SSRF-guarded fetch, D-25): the page then does not depend on — or report its readers to — the other site,
 * and expiring links (Google Docs) keep working. A picture that cannot be fetched stays an external link.
 */
export async function importRemoteImages(editor: Editor, srcs: string[], pageId: string) {
  const done = new Map<string, RemoteDto['attachment']>();
  let failed = 0;
  for (const src of srcs.slice(0, 50)) {
    try {
      const r = await post<RemoteDto>('/api/v1/attachments/from-url', { url: src, pageId });
      done.set(src, r.attachment);
    } catch {
      failed++;
    }
  }
  if (failed) toast.info(`Изображений с других сайтов, оставленных внешними ссылками: ${failed} — сервер не смог их загрузить.`);
  if (!done.size || editor.isDestroyed) return;
  const tr = editor.state.tr;
  editor.state.doc.descendants((node, pos) => {
    if ((node.type.name !== 'image' && node.type.name !== 'inlineImage') || node.attrs.attachmentId) return;
    const a = done.get(String(node.attrs.src));
    if (a) tr.setNodeMarkup(pos, undefined, { ...node.attrs, src: a.contentUrl, attachmentId: a.id, naturalWidth: a.width, naturalHeight: a.height }, node.marks);
  });
  if (tr.docChanged) editor.view.dispatch(tr.setMeta('addToHistory', false));
}
