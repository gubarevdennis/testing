import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { tx } from '../db/pool.js';
import { actorOf, parse, requireUser, type Services } from '../app.js';
import { requirePage, pageAccess } from '../acl/engine.js';
import { search, suggest } from '../services/search.js';
import { audit } from '../services/audit.js';
import { forbidden, notFound } from '../lib/errors.js';
import { enqueue } from '../services/pages.js';

const uuid = z.string().uuid();

export async function searchCommentRoutes(app: FastifyInstance, s: Services) {
  app.get('/api/v1/search', async (req) => {
    const user = requireUser(req);
    const qs = parse(
      z.object({
        q: z.string().min(1).max(300),
        spaceId: uuid.optional(),
        pageId: uuid.optional(),
        status: z.enum(['draft', 'review', 'published', 'archived']).optional(),
        authorId: uuid.optional(),
        from: z.string().datetime({ offset: true }).optional(),
        to: z.string().datetime({ offset: true }).optional(),
        in: z.enum(['all', 'text', 'images', 'files']).optional(),
        tag: z.string().min(1).max(60).optional(),
        limit: z.coerce.number().int().min(1).max(100).default(20),
        offset: z.coerce.number().int().min(0).max(5000).default(0),
      }),
      req.query,
    );
    return search(s.db, user, { ...qs, spaceId: qs.spaceId ?? null, pageId: qs.pageId ?? null });
  });

  app.get('/api/v1/search/suggest', async (req) => {
    const user = requireUser(req);
    const { q } = parse(z.object({ q: z.string().min(1).max(200) }), req.query);
    return { suggestions: await suggest(s.db, user, q) };
  });

  // ------------------------------------------------------------ comments

  app.get('/api/v1/pages/:id/comments', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const acc = await requirePage(s.db, user, id, 'view');
    const rows = (
      await s.db.query(
        `select c.id, c.thread_id, c.parent_id, c.block_id, c.quote, c.body, c.body_text, c.created_at, c.updated_at, c.resolved_at, c.deleted_at, c.author_id, c.revision_number, u.name as author_name, r.name as resolved_by_name
           from comments c join users u on u.id = c.author_id left join users r on r.id = c.resolved_by where c.page_id = $1 order by c.created_at`,
        [id],
      )
    ).rows;
    const threads = new Map<string, any>();
    for (const c of rows) {
      const t = threads.get(c.thread_id) ?? { id: c.thread_id, blockId: c.block_id, quote: c.quote, revisionNumber: c.revision_number, resolvedAt: null, resolvedBy: null, comments: [] };
      if (!c.parent_id) {
        t.blockId = c.block_id;
        t.quote = c.quote;
        t.revisionNumber = c.revision_number;
        t.resolvedAt = c.resolved_at;
        t.resolvedBy = c.resolved_by_name;
      }
      const mine = c.author_id === user.id;
      t.comments.push({
        id: c.id,
        parentId: c.parent_id,
        author: { id: c.author_id, name: c.author_name },
        text: c.deleted_at ? '' : c.body_text,
        mentions: c.deleted_at ? [] : ((c.body?.mentions ?? []) as string[]),
        deleted: !!c.deleted_at,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
        revisionNumber: c.revision_number,
        mine,
        // Mirrors DELETE /comments/:id: the author or someone with full access to the page.
        canDelete: !c.deleted_at && acc.actions.comment && (mine || acc.level === 'full'),
      });
      threads.set(c.thread_id, t);
    }
    return { threads: [...threads.values()] };
  });

  app.post('/api/v1/pages/:id/comments', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const body = parse(z.object({ threadId: uuid.optional(), blockId: z.string().max(100).nullable().optional(), quote: z.string().max(2000).nullable().optional(), text: z.string().min(1).max(20_000), mentions: z.array(uuid).max(50).optional() }), req.body);
    await requirePage(s.db, user, id, 'comment');
    const c = await tx(s.db, async (q) => {
      let threadId = body.threadId;
      let parentId: string | null = null;
      if (threadId) {
        const root = (await q.query('select id from comments where thread_id = $1 and page_id = $2 and parent_id is null', [threadId, id])).rows[0];
        if (!root) throw notFound('Обсуждение не найдено');
        parentId = root.id;
        await q.query('update comments set resolved_at = null, resolved_by = null where id = $1', [root.id]); // replying reopens
      } else threadId = (await q.query('select gen_random_uuid() id')).rows[0].id;
      const row = (
        await q.query(`insert into comments (org_id, page_id, thread_id, parent_id, block_id, quote, body, body_text, author_id, revision_number)
                       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, (select max(number) from page_revisions where page_id = $2)) returning *`, [
          user.orgId,
          id,
          threadId,
          parentId,
          body.blockId ?? null,
          body.quote ?? null,
          { text: body.text, mentions: body.mentions ?? [] },
          body.text,
          user.id,
        ])
      ).rows[0];
      // Notify mentioned people only if they can see the page (no leak through notifications).
      const { toAuthUser } = await import('../auth/sessions.js');
      const participants = new Set<string>(body.mentions ?? []);
      for (const p of (await q.query('select distinct author_id from comments where thread_id = $1', [threadId])).rows) participants.add(p.author_id);
      participants.delete(user.id);
      for (const uid of participants) {
        const u = (await q.query(`select * from users where id = $1 and status = 'active'`, [uid])).rows[0];
        if (!u || !(await pageAccess(q, toAuthUser(u), id))?.actions.view) continue;
        await q.query(`insert into notifications (user_id, type, page_id, data) values ($1, $2, $3, $4)`, [uid, (body.mentions ?? []).includes(uid) ? 'mention' : 'comment_reply', id, { from: user.name, threadId, commentId: row.id, excerpt: body.text.slice(0, 200) }]);
        s.bus.emit({ type: 'notification', userId: uid });
      }
      await enqueue(q, 'index-page', { pageId: id }); // comments are searchable (R-SEARCH-003)
      return row;
    });
    s.bus.emit({ type: 'comments-changed', pageId: id });
    return { comment: { id: c.id, threadId: c.thread_id } };
  });

  app.patch('/api/v1/comments/:id', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const { text } = parse(z.object({ text: z.string().min(1).max(20_000) }), req.body);
    const c = (await s.db.query('select * from comments where id = $1', [id])).rows[0];
    if (!c) throw notFound();
    await requirePage(s.db, user, c.page_id, 'comment');
    if (c.author_id !== user.id) throw forbidden('Редактировать можно только свои комментарии');
    // Merge so stored mentions survive an edit.
    await s.db.query('update comments set body = body || $2::jsonb, body_text = $3, updated_at = now() where id = $1', [id, { text, edited: true }, text]);
    await enqueue(s.db, 'index-page', { pageId: c.page_id });
    s.bus.emit({ type: 'comments-changed', pageId: c.page_id });
    return { ok: true };
  });

  app.delete('/api/v1/comments/:id', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const c = (await s.db.query('select * from comments where id = $1', [id])).rows[0];
    if (!c) throw notFound();
    const acc = await requirePage(s.db, user, c.page_id, 'comment');
    if (c.author_id !== user.id && acc.level !== 'full') throw forbidden();
    await tx(s.db, async (q) => {
      await q.query('update comments set deleted_at = now() where id = $1', [id]);
      await enqueue(q, 'index-page', { pageId: c.page_id });
      await audit(q, actorOf(req), { action: 'comment.delete', targetType: 'page', targetId: c.page_id, details: { commentId: id } });
    });
    s.bus.emit({ type: 'comments-changed', pageId: c.page_id });
    return { ok: true };
  });

  app.post('/api/v1/comments/threads/:threadId/:action', async (req) => {
    const user = requireUser(req);
    const { threadId, action } = parse(z.object({ threadId: uuid, action: z.enum(['resolve', 'reopen']) }), req.params);
    const root = (await s.db.query('select * from comments where thread_id = $1 and parent_id is null', [threadId])).rows[0];
    if (!root) throw notFound();
    await requirePage(s.db, user, root.page_id, 'comment');
    await s.db.query(`update comments set resolved_at = ${action === 'resolve' ? 'now()' : 'null'}, resolved_by = $2 where id = $1`, [root.id, action === 'resolve' ? user.id : null]);
    s.bus.emit({ type: 'comments-changed', pageId: root.page_id });
    return { ok: true };
  });

  // ------------------------------------------------------------ notifications

  app.get('/api/v1/notifications', async (req) => {
    const user = requireUser(req);
    const rows = (await s.db.query(`select n.*, p.title as page_title from notifications n left join pages p on p.id = n.page_id where n.user_id = $1 order by n.created_at desc limit 100`, [user.id])).rows;
    // Re-check access at read time (rights may have been revoked since).
    const ids = [...new Set(rows.filter((r) => r.page_id).map((r) => r.page_id))];
    const { accessForPages } = await import('../acl/engine.js');
    const acc = await accessForPages(s.db, user, ids);
    const visible = rows.filter((r) => !r.page_id || acc.get(r.page_id)?.actions.view);
    return { notifications: visible, unread: visible.filter((r) => !r.read_at).length };
  });

  app.post('/api/v1/notifications/read', async (req) => {
    const user = requireUser(req);
    const { ids } = parse(z.object({ ids: z.array(uuid).max(500).optional() }), req.body ?? {});
    if (ids?.length) await s.db.query('update notifications set read_at = now() where user_id = $1 and id = any($2::uuid[])', [user.id, ids]);
    else await s.db.query('update notifications set read_at = now() where user_id = $1 and read_at is null', [user.id]);
    return { ok: true };
  });
}
