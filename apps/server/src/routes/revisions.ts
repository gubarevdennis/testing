import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { findBlock, type PMNode } from '@kb/shared';
import { tx } from '../db/pool.js';
import { actorOf, parse, requireUser, type Services } from '../app.js';
import { requirePage, type AuthUser } from '../acl/engine.js';
import { audit } from '../services/audit.js';
import { createRevision, diffDocs, stateAtSeq } from '../services/revisions.js';
import { replaceContent, setTitle, titleOf, ydocToJson } from '../collab/ydoc.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { getPage } from '../services/pages.js';

const uuid = z.string().uuid();

export async function revisionRoutes(app: FastifyInstance, s: Services) {
  app.get('/api/v1/pages/:id/revisions', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const qs = parse(z.object({ before: z.coerce.number().int().optional(), kind: z.string().optional(), authorId: uuid.optional(), limit: z.coerce.number().int().min(1).max(200).default(50) }), req.query);
    await requirePage(s.db, user, id, 'view_history', { allowDeleted: true });
    const rows = (
      await s.db.query(
        `select r.id, r.number, r.kind, r.label, r.title, r.created_at, r.summary, r.authors, r.created_by, u.name as created_by_name, r.restored_from,
                (select array_agg(name) from users where id = any(r.authors)) as author_names
           from page_revisions r left join users u on u.id = r.created_by
          where r.page_id = $1 and ($2::int is null or r.number < $2) and ($3::text is null or r.kind = $3) and ($4::uuid is null or $4 = any(r.authors) or r.created_by = $4)
          order by r.number desc limit $5`,
        [id, qs.before ?? null, qs.kind ?? null, qs.authorId ?? null, qs.limit],
      )
    ).rows;
    const page = (await getPage(s.db, id))!;
    return { revisions: rows.map((r) => ({ ...r, published: r.id === page.published_revision_id })), nextCursor: rows.length === qs.limit ? rows[rows.length - 1].number : null };
  });

  app.get('/api/v1/pages/:id/revisions/:rid', async (req) => {
    const user = requireUser(req);
    const { id, rid } = parse(z.object({ id: uuid, rid: uuid }), req.params);
    await requirePage(s.db, user, id, 'view_history', { allowDeleted: true });
    const r = (await s.db.query('select id, number, kind, label, title, content, created_at, summary from page_revisions where id = $1 and page_id = $2', [rid, id])).rows[0];
    if (!r) throw notFound('Версия не найдена');
    return { revision: r };
  });

  /** Compare a revision with another revision or with the current state. */
  app.get('/api/v1/pages/:id/revisions/:rid/diff', async (req) => {
    const user = requireUser(req);
    const { id, rid } = parse(z.object({ id: uuid, rid: uuid }), req.params);
    const { against } = parse(z.object({ against: z.union([uuid, z.literal('current'), z.literal('previous')]).default('current') }), req.query);
    await requirePage(s.db, user, id, 'view_history', { allowDeleted: true });
    const base = (await s.db.query('select number, content, title from page_revisions where id = $1 and page_id = $2', [rid, id])).rows[0];
    if (!base) throw notFound('Версия не найдена');
    let other: { content: PMNode; title: string; label: string };
    if (against === 'current') {
      const snap = await s.hub.snapshot(id);
      other = { content: snap.json, title: (await getPage(s.db, id))!.title, label: 'Текущая версия' };
    } else if (against === 'previous') {
      const prev = (await s.db.query('select number, content, title from page_revisions where page_id = $1 and number < $2 order by number desc limit 1', [id, base.number])).rows[0];
      if (!prev) return { from: null, to: { number: base.number }, title: { before: null, after: base.title }, ...diffDocs({ type: 'doc', content: [] }, base.content) };
      return { from: { number: prev.number }, to: { number: base.number }, title: { before: prev.title, after: base.title }, ...diffDocs(prev.content, base.content) };
    } else {
      const o = (await s.db.query('select number, content, title from page_revisions where id = $1 and page_id = $2', [against, id])).rows[0];
      if (!o) throw notFound('Версия для сравнения не найдена');
      other = { content: o.content, title: o.title, label: 'Версия ' + o.number };
    }
    return { from: { number: base.number }, to: { label: other.label }, title: { before: base.title, after: other.title }, ...diffDocs(base.content, other.content) };
  });

  app.post('/api/v1/pages/:id/revisions', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const { label } = parse(z.object({ label: z.string().max(200).optional() }), req.body ?? {});
    await requirePage(s.db, user, id, 'edit');
    const rev = await s.hub.createRevisionNow(id, 'manual', user.id, label);
    return { revision: rev };
  });

  /**
   * Restores a revision as a NEW revision. The current state is saved first ("pre-restore"), so a restore can
   * itself be undone. Concurrent edits are merged by the CRDT; ACLs are never rolled back (ACL-173).
   */
  app.post('/api/v1/pages/:id/revisions/:rid/restore', async (req) => {
    const user = requireUser(req);
    const { id, rid } = parse(z.object({ id: uuid, rid: uuid }), req.params);
    const { restoreTitle } = parse(z.object({ restoreTitle: z.boolean().default(true) }), req.body ?? {});
    await requireRestore(user, id);
    const rev = (await s.db.query('select id, number, content, title from page_revisions where id = $1 and page_id = $2', [rid, id])).rows[0];
    if (!rev) throw notFound('Версия не найдена');
    return restoreContent(req, user, id, {
      content: rev.content,
      title: restoreTitle ? rev.title : null,
      preLabel: `Перед восстановлением версии ${rev.number}`,
      label: `Восстановлена версия ${rev.number}`,
      restoredFrom: rev.id,
      eventType: 'restored-revision',
      eventData: { revisionNumber: rev.number },
      auditAction: 'page.revision_restore',
      auditDetails: { revision: rev.number },
    });
  });

  /**
   * State of the document right after journal operation `seq` (R-HISTORY-026, HIST-187): reconstructed from the
   * durable journal (doc_updates), compared with the current state. Read-only.
   */
  app.get('/api/v1/pages/:id/journal/:seq', async (req) => {
    const user = requireUser(req);
    const { id, seq } = parse(z.object({ id: uuid, seq: z.coerce.number().int().min(1) }), req.params);
    await requirePage(s.db, user, id, 'view_history', { allowDeleted: true });
    const st = await stateAtSeq(s.db, id, seq);
    const snap = await s.hub.snapshot(id);
    const diff = diffDocs(st.content, snap.json);
    return { seq, title: st.title, content: st.content, at: st.at, authorName: st.authorName, base: st.base, stats: diff.stats };
  });

  /** Restores the document to the state right after journal operation `seq`, as a NEW (reversible) revision. */
  app.post('/api/v1/pages/:id/journal/:seq/restore', async (req) => {
    const user = requireUser(req);
    const { id, seq } = parse(z.object({ id: uuid, seq: z.coerce.number().int().min(1) }), req.params);
    const { restoreTitle } = parse(z.object({ restoreTitle: z.boolean().default(true) }), req.body ?? {});
    await requireRestore(user, id);
    const st = await stateAtSeq(s.db, id, seq);
    const when = st.at ? new Date(st.at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }) : '';
    return restoreContent(req, user, id, {
      content: st.content,
      title: restoreTitle ? st.title : null,
      preLabel: `Перед восстановлением состояния на операцию №${seq}`,
      label: `Восстановлено состояние на операцию №${seq}${when ? ` (${when})` : ''}`,
      restoredFrom: null,
      eventType: 'restored-journal',
      eventData: { seq, base: st.base },
      auditAction: 'page.journal_restore',
      auditDetails: { seq, base: st.base },
    });
  });

  async function requireRestore(user: AuthUser, id: string) {
    const acc = await requirePage(s.db, user, id, 'restore');
    const page = (await getPage(s.db, id))!;
    if (page.locked && acc.level !== 'full') throw forbidden('Страница защищена от изменений');
  }

  /**
   * Shared restore path: the current state is saved first ("pre-restore"), the content is replaced through the
   * durable CRDT path, a new revision is recorded, and everyone else on the page is told (R-HISTORY-014).
   * ACLs are never rolled back (ACL-173).
   */
  async function restoreContent(
    req: FastifyRequest,
    user: AuthUser,
    id: string,
    o: { content: PMNode; title: string | null; preLabel: string; label: string; restoredFrom: string | null; eventType: string; eventData: Record<string, unknown>; auditAction: string; auditDetails: Record<string, unknown> },
  ) {
    const pre = await s.hub.createRevisionNow(id, 'pre-restore', user.id, o.preLabel);
    const res = await s.hub.applyServerChange(id, user.id, (doc) => {
      replaceContent(doc, o.content, 'restore');
      if (o.title !== null && o.title !== titleOf(doc)) setTitle(doc, o.title);
    });
    const snap = await s.hub.snapshot(id);
    const title = o.title ?? (await getPage(s.db, id))!.title;
    const created = await tx(s.db, async (q) => {
      const r = await createRevision(q, { pageId: id, kind: 'restore', title, state: snap.state, content: res.json, seqUpto: res.seq, authors: [user.id], createdBy: user.id, label: o.label, restoredFrom: o.restoredFrom });
      await q.query(`insert into page_events (org_id, page_id, actor_id, type, data) values ($1, $2, $3, $4, $5)`, [user.orgId, id, user.id, o.eventType, { ...o.eventData, newRevision: r.number, preRestoreRevision: pre.number }]);
      await audit(q, actorOf(req), { action: o.auditAction, targetType: 'page', targetId: id, details: { ...o.auditDetails, newRevision: r.number, preRestoreRevision: pre.number } });
      return r;
    });
    s.bus.emit({ type: 'page-restored', orgId: user.orgId, pageId: id, actorId: user.id, actorName: user.name, label: o.label, preRestoreRevisionId: pre.id, preRestoreNumber: pre.number });
    return { revision: created, preRestore: pre };
  }

  /** Restores a single block from a revision into the current document (replacing the block with the same id, or re-inserting it). */
  app.post('/api/v1/pages/:id/revisions/:rid/restore-block', async (req) => {
    const user = requireUser(req);
    const { id, rid } = parse(z.object({ id: uuid, rid: uuid }), req.params);
    const { blockId } = parse(z.object({ blockId: z.string().min(1).max(100) }), req.body);
    await requirePage(s.db, user, id, 'edit');
    const rev = (await s.db.query('select number, content from page_revisions where id = $1 and page_id = $2', [rid, id])).rows[0];
    if (!rev) throw notFound('Версия не найдена');
    const fromRev = findBlock(rev.content, blockId);
    if (!fromRev) throw notFound('Блок не найден в выбранной версии');
    let mode = '';
    await s.hub.applyServerChange(id, user.id, (doc) => {
      const current = ydocToJson(doc);
      const block = structuredClone(fromRev.node);
      const existing = findBlock(current, blockId);
      if (existing) {
        existing.parent.content![existing.index] = block;
        mode = 'replaced';
      } else {
        // Re-insert after the block that preceded it in the revision, if it still exists.
        const prevId = fromRev.index > 0 ? fromRev.parent.content![fromRev.index - 1]?.attrs?.id : null;
        const anchor = prevId ? findBlock(current, prevId) : null;
        const parentId = fromRev.parent.attrs?.id;
        const parentNow = parentId ? findBlock(current, parentId) : null;
        if (anchor) anchor.parent.content!.splice(anchor.index + 1, 0, block);
        else if (parentNow) (parentNow.node.content ??= []).splice(Math.min(fromRev.index, parentNow.node.content?.length ?? 0), 0, block);
        else current.content!.splice(Math.min(fromRev.index, current.content!.length), 0, block);
        mode = 'inserted';
      }
      replaceContent(doc, current, 'restore-block');
    });
    await tx(s.db, async (q) => {
      await q.query(`insert into page_events (org_id, page_id, actor_id, type, data) values ($1, $2, $3, 'restored-block', $4)`, [user.orgId, id, user.id, { blockId, revisionNumber: rev.number, mode }]);
      await audit(q, actorOf(req), { action: 'page.block_restore', targetType: 'page', targetId: id, details: { blockId, revision: rev.number, mode } });
    });
    return { ok: true, mode };
  });

  // ------------------------------------------------------------ publishing workflow

  app.post('/api/v1/pages/:id/submit-review', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const body = parse(z.object({ reviewerId: uuid.optional(), message: z.string().max(2000).optional() }), req.body ?? {});
    await requirePage(s.db, user, id, 'edit');
    const rev = await s.hub.createRevisionNow(id, 'manual', user.id, 'Отправлено на согласование');
    const approval = await tx(s.db, async (q) => {
      await q.query(`update approvals set status = 'cancelled' where page_id = $1 and status = 'pending'`, [id]);
      const a = (await q.query(`insert into approvals (org_id, page_id, revision_id, requested_by, reviewer_id, message) values ($1, $2, $3, $4, $5, $6) returning *`, [user.orgId, id, rev.id, user.id, body.reviewerId ?? null, body.message ?? null])).rows[0];
      await q.query(`update pages set status = 'review', version = version + 1 where id = $1`, [id]);
      const reviewers = body.reviewerId
        ? [body.reviewerId]
        : (await q.query(`select g.subject_id from grants g join pages p on p.space_id = g.resource_id where p.id = $1 and g.resource_type = 'space' and g.subject_type = 'user' and g.level = 'full' and g.revoked_at is null`, [id])).rows.map((r) => r.subject_id);
      for (const r of reviewers.filter((x) => x !== user.id)) await q.query(`insert into notifications (user_id, type, page_id, data) values ($1, 'review_requested', $2, $3)`, [r, id, { from: user.name, approvalId: a.id, message: body.message ?? null }]);
      await q.query(`insert into page_events (org_id, page_id, actor_id, type, data) values ($1, $2, $3, 'review-requested', $4)`, [user.orgId, id, user.id, { approvalId: a.id, reviewerId: body.reviewerId ?? null, revision: rev.number }]);
      await audit(q, actorOf(req), { action: 'page.submit_review', targetType: 'page', targetId: id, details: { approvalId: a.id } });
      return a;
    });
    s.bus.emit({ type: 'page-changed', orgId: user.orgId, pageId: id, fields: ['status'] });
    return { approval };
  });

  app.get('/api/v1/pages/:id/approvals', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    await requirePage(s.db, user, id, 'view');
    const rows = (await s.db.query(`select a.*, u.name as requested_by_name, r.name as reviewer_name, d.name as decided_by_name, pr.number as revision_number from approvals a join users u on u.id = a.requested_by left join users r on r.id = a.reviewer_id left join users d on d.id = a.decided_by left join page_revisions pr on pr.id = a.revision_id where a.page_id = $1 order by a.created_at desc limit 50`, [id])).rows;
    return { approvals: rows };
  });

  app.post('/api/v1/pages/:id/approvals/:aid/decide', async (req) => {
    const user = requireUser(req);
    const { id, aid } = parse(z.object({ id: uuid, aid: uuid }), req.params);
    const body = parse(z.object({ decision: z.enum(['approve', 'reject']), comment: z.string().max(2000).optional() }), req.body);
    await requirePage(s.db, user, id, 'publish');
    const result = await tx(s.db, async (q) => {
      const a = (await q.query(`select * from approvals where id = $1 and page_id = $2 for update`, [aid, id])).rows[0];
      if (!a || a.status !== 'pending') throw conflict('approval_closed', 'Запрос на согласование уже закрыт');
      if (a.reviewer_id && a.reviewer_id !== user.id) throw forbidden('Согласование назначено другому сотруднику');
      await q.query(`update approvals set status = $2, decision_comment = $3, decided_at = now(), decided_by = $4 where id = $1`, [aid, body.decision === 'approve' ? 'approved' : 'rejected', body.comment ?? null, user.id]);
      if (body.decision === 'reject') await q.query(`update pages set status = 'draft', version = version + 1 where id = $1`, [id]);
      await q.query(`insert into notifications (user_id, type, page_id, data) values ($1, $2, $3, $4)`, [a.requested_by, body.decision === 'approve' ? 'review_approved' : 'review_rejected', id, { by: user.name, comment: body.comment ?? null }]);
      await q.query(`insert into page_events (org_id, page_id, actor_id, type, data) values ($1, $2, $3, $4, $5)`, [user.orgId, id, user.id, body.decision === 'approve' ? 'review-approved' : 'review-rejected', { approvalId: aid, comment: body.comment ?? null }]);
      await audit(q, actorOf(req), { action: 'page.review_' + body.decision, targetType: 'page', targetId: id, details: { approvalId: aid } });
      return a;
    });
    if (body.decision === 'approve') return { ok: true, published: await publish(s, req, id, user.id, `Согласовано: ${user.name}`, result.revision_id) };
    return { ok: true };
  });

  app.post('/api/v1/pages/:id/publish', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const { label } = parse(z.object({ label: z.string().max(200).optional() }), req.body ?? {});
    const acc = await requirePage(s.db, user, id, 'publish');
    if (acc.policy.requireApproval) {
      const ok = await s.db.query(`select revision_id from approvals where page_id = $1 and status = 'approved' order by decided_at desc limit 1`, [id]);
      if (!ok.rowCount) throw conflict('approval_required', 'В этом пространстве публикация требует согласования');
    }
    return { published: await publish(s, req, id, user.id, label ?? null, null) };
  });

  app.post('/api/v1/pages/:id/unpublish', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    await requirePage(s.db, user, id, 'publish');
    await tx(s.db, async (q) => {
      await q.query(`update pages set published_revision_id = null, status = 'draft', version = version + 1 where id = $1`, [id]);
      await q.query(`insert into page_events (org_id, page_id, actor_id, type) values ($1, $2, $3, 'unpublished')`, [user.orgId, id, user.id]);
      await q.query(`insert into outbox (topic, payload) values ('index-page', $1)`, [{ pageId: id }]);
      await audit(q, actorOf(req), { action: 'page.unpublish', targetType: 'page', targetId: id });
    });
    return { ok: true };
  });

  app.post('/api/v1/pages/:id/archive', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const { archived } = parse(z.object({ archived: z.boolean() }), req.body);
    await requirePage(s.db, user, id, 'manage_structure');
    await tx(s.db, async (q) => {
      const p = (await q.query('select status, published_revision_id from pages where id = $1 for update', [id])).rows[0];
      const next = archived ? 'archived' : p.published_revision_id ? 'published' : 'draft';
      await q.query(`update pages set status = $2, version = version + 1 where id = $1`, [id, next]);
      await q.query(`insert into page_events (org_id, page_id, actor_id, type, data) values ($1, $2, $3, $4, $5)`, [user.orgId, id, user.id, archived ? 'archived' : 'unarchived', { previous: p.status }]);
      await audit(q, actorOf(req), { action: archived ? 'page.archive' : 'page.unarchive', targetType: 'page', targetId: id });
    });
    return { ok: true };
  });
}

/** Publishing freezes an immutable revision; readers in "publish" spaces see it until the next publication. */
async function publish(s: Services, req: any, pageId: string, userId: string, label: string | null, approvedRevisionId: string | null) {
  const user = req.user;
  const rev = approvedRevisionId
    ? (await s.db.query('select id, number from page_revisions where id = $1', [approvedRevisionId])).rows[0]
    : await s.hub.createRevisionNow(pageId, 'manual', userId, label ?? 'Публикация');
  if (!rev) throw badRequest('Версия для публикации не найдена');
  await tx(s.db, async (q) => {
    await q.query(`update page_revisions set kind = 'publish', label = coalesce(label, $2) where id = $1`, [rev.id, label]);
    await q.query(`update pages set published_revision_id = $2, status = 'published', version = version + 1 where id = $1`, [pageId, rev.id]);
    await q.query(`insert into page_events (org_id, page_id, actor_id, type, data) values ($1, $2, $3, 'published', $4)`, [user.orgId, pageId, userId, { revision: rev.number, label }]);
    await q.query(`insert into outbox (topic, payload) values ('index-page', $1)`, [{ pageId }]);
    await audit(q, actorOf(req), { action: 'page.publish', targetType: 'page', targetId: pageId, details: { revision: rev.number } });
  });
  s.bus.emit({ type: 'page-changed', orgId: user.orgId, pageId, fields: ['status'] });
  return { revisionId: rev.id, number: rev.number };
}
