import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { tx } from '../db/pool.js';
import { actorOf, parse, requireUser, type Services } from '../app.js';
import { requirePage } from '../acl/engine.js';
import { audit } from '../services/audit.js';
import { notFound } from '../lib/errors.js';
import { attachmentDto, loadAttachment } from './attachments.js';

const uuid = z.string().uuid();

/**
 * Copying an attachment to another page (R-CLIPBOARD-018/024, R-EDITOR-076): an image or file pasted or moved from page A
 * into page B must be readable by B's readers and must follow B's rights, not A's. The copy is a new attachment of B
 * that shares the stored bytes (content-addressed blob, no second upload).
 *
 * Rights: the user must be allowed to download the file on its page (D-26: taking a file elsewhere is a download — a
 * reader without the download right cannot spread it this way) and to edit the target page. Otherwise 404 / 403 and the
 * client keeps the original reference (which B's readers simply cannot open).
 */
export async function attachmentCopyRoutes(app: FastifyInstance, s: Services) {
  app.post('/api/v1/attachments/:id/copy', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const { pageId } = parse(z.object({ pageId: uuid }), req.body);
    const src = await loadAttachment(s, user, id, 'download');
    await requirePage(s.db, user, pageId, 'edit');
    const version = async (attachmentId: string) =>
      (await s.db.query(`select v.* from attachment_versions v where v.attachment_id = $1 and v.version = (select current_version from attachments where id = $1)`, [attachmentId])).rows[0];
    if (src.page_id === pageId) return { attachment: attachmentDto(src, await version(id)), copied: false };
    const v = await version(id);
    if (!v) throw notFound('Версия файла не найдена');
    const copy = await tx(s.db, async (q) => {
      const a = (await q.query(`insert into attachments (org_id, page_id, kind, filename, created_by) values ($1, $2, $3, $4, $5) returning *`, [user.orgId, pageId, src.kind, src.filename, user.id])).rows[0];
      const nv = (
        await q.query(
          `insert into attachment_versions (attachment_id, version, blob_sha256, size, mime, filename, width, height, created_by) values ($1, 1, $2, $3, $4, $5, $6, $7, $8) returning *`,
          [a.id, v.blob_sha256, v.size, v.mime, v.filename, v.width, v.height, user.id],
        )
      ).rows[0];
      await audit(q, actorOf(req), { action: 'attachment.copy', targetType: 'attachment', targetId: a.id, details: { from: id, fromPageId: src.page_id, pageId, sha256: v.blob_sha256 } });
      await q.query(`insert into outbox (topic, payload) values ('index-page', $1)`, [{ pageId }]);
      return { a: (await q.query('select * from attachments where id = $1', [a.id])).rows[0], v: nv };
    });
    return { attachment: attachmentDto(copy.a, copy.v), copied: true };
  });
}
