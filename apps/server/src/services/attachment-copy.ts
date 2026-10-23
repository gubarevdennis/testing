/**
 * Copying attachments to another page (R-MEDIA-007, R-CLIPBOARD-018/024, R-EDITOR-076, D-32, D-39). An image or file
 * that reaches page B from page A — paste, block moved or dragged to another page, page duplication, page created from a
 * template — must become an attachment of B: B's readers can open it and B's rights apply, independently of A (A may
 * be private, moved, deleted). The copy is a new attachment record that shares the stored bytes (content-addressed blob,
 * no second upload); the original stays byte-exact with its thumbnails.
 *
 * Rule (the same for every path): the user must be allowed to download the file where it is now (taking a file
 * elsewhere is a download) — otherwise the reference stays and the caller reports it. All paths call this module: the
 * HTTP endpoint POST /api/v1/attachments/:id/copy (browser: paste, move/drag to a page) and the server-side
 * duplication and template instantiation.
 *
 * Templates: when a template is saved, the files its content references are copied into template assets (no page,
 * created by the author — who was allowed to download them); a page created from the template copies those assets
 * into itself for whoever may use the template.
 */
import { walk, type PMNode } from '@kb/shared';
import type { Queryable } from '../db/pool.js';
import { accessForPages, type AuthUser } from '../acl/engine.js';
import { audit, type AuditActor } from './audit.js';

export interface CopiedAttachment {
  attachment: Record<string, any>;
  version: Record<string, any>;
}

/** Copies one attachment record (current version) to `pageId` (null: unattached until the caller sets the page). No rights check. */
export async function copyAttachmentRecord(q: Queryable, user: AuthUser, src: Record<string, any>, pageId: string | null, actor: AuditActor | null): Promise<CopiedAttachment | null> {
  const v = (await q.query('select * from attachment_versions where attachment_id = $1 and version = $2', [src.id, src.current_version])).rows[0];
  if (!v) return null;
  const a = (await q.query(`insert into attachments (org_id, page_id, kind, filename, created_by) values ($1, $2, $3, $4, $5) returning *`, [src.org_id, pageId, src.kind, src.filename, user.id])).rows[0];
  const nv = (
    await q.query(
      `insert into attachment_versions (attachment_id, version, blob_sha256, size, mime, filename, width, height, created_by) values ($1, 1, $2, $3, $4, $5, $6, $7, $8) returning *`,
      [a.id, v.blob_sha256, v.size, v.mime, v.filename, v.width, v.height, user.id],
    )
  ).rows[0];
  if (actor) await audit(q, actor, { action: 'attachment.copy', targetType: 'attachment', targetId: a.id, details: { from: src.id, fromPageId: src.page_id, pageId, sha256: v.blob_sha256 } });
  return { attachment: (await q.query('select * from attachments where id = $1', [a.id])).rows[0], version: nv };
}

export interface ContentCopyResult {
  /** The content with references switched to the copies (attachmentId and in-app URLs). */
  doc: PMNode;
  /** old id → new id */
  copied: Map<string, string>;
  /** Attachments left referenced at their original page (no download right there, deleted, other organisation). */
  refused: string[];
}

/** Switches attachment references (attachmentId and URLs containing the id) of a document to the copies. */
export function remapAttachmentRefs(doc: PMNode, map: Map<string, string>): PMNode {
  walk(doc, (n) => {
    const old = n.attrs?.attachmentId;
    if (typeof old !== 'string' || !map.has(old)) return;
    const next = map.get(old)!;
    const attrs: Record<string, any> = {};
    for (const [k, v] of Object.entries(n.attrs!)) attrs[k] = typeof v === 'string' ? v.split(`/attachments/${old}/`).join(`/attachments/${next}/`) : v;
    attrs.attachmentId = next;
    if ((n.type === 'image' || n.type === 'inlineImage') && !attrs.src) attrs.src = `/api/v1/attachments/${next}/content`;
    n.attrs = attrs;
  });
  return doc;
}

/**
 * Makes every attachment referenced by `doc` an attachment of the target page: attachments that are not already the
 * target's are copied (with `pageId` = target, or null when the page does not exist yet — the caller assigns it).
 * `already` maps attachments copied before (duplication copies the page's own files first). The input is not mutated.
 */
export async function copyContentAttachments(
  q: Queryable,
  user: AuthUser,
  doc: PMNode,
  targetPageId: string | null,
  opts: { actor?: AuditActor | null; already?: Map<string, string>; trusted?: (attachment: Record<string, any>) => boolean } = {},
): Promise<ContentCopyResult> {
  const ids = new Set<string>();
  walk(doc, (n) => {
    if (typeof n.attrs?.attachmentId === 'string' && /^[0-9a-f-]{36}$/i.test(n.attrs.attachmentId)) ids.add(n.attrs.attachmentId);
  });
  const copied = new Map(opts.already ?? []);
  const refused: string[] = [];
  const todo = [...ids].filter((id) => !copied.has(id));
  if (!todo.length) return { doc: remapAttachmentRefs(structuredClone(doc), copied), copied, refused };
  const rows = (await q.query('select * from attachments where id = any($1::uuid[])', [todo])).rows;
  const pages = [...new Set(rows.map((r) => r.page_id).filter(Boolean))] as string[];
  const access = pages.length ? await accessForPages(q, user, pages) : new Map();
  for (const id of todo) {
    const a = rows.find((r) => r.id === id);
    if (!a || a.org_id !== user.orgId || a.deleted_at) {
      refused.push(id);
      continue;
    }
    if (targetPageId && a.page_id === targetPageId) continue; // already the target's
    // the user must be allowed to download it where it is (unattached files: only their uploader)
    // (or it is an asset of something the user may use, e.g. a template's own picture — `trusted`)
    const allowed = opts.trusted?.(a) || (a.page_id ? !!access.get(a.page_id)?.actions.download : a.created_by === user.id);
    if (!allowed) {
      refused.push(id);
      continue;
    }
    const c = await copyAttachmentRecord(q, user, a, targetPageId, opts.actor ?? null);
    if (c) copied.set(id, c.attachment.id);
    else refused.push(id);
  }
  return { doc: remapAttachmentRefs(structuredClone(doc), copied), copied, refused };
}
