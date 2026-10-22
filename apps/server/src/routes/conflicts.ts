import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getKbSchema } from '@kb/shared';
import { parse, requireUser, type Services } from '../app.js';
import { requirePage } from '../acl/engine.js';
import { badRequest, notFound } from '../lib/errors.js';

/**
 * Conflict copies: when another author deletes or moves a block that this user was editing concurrently,
 * the editing client detects that its changes no longer exist in the merged document and stores its own version
 * here. Nothing is lost silently: the copy is listed for the page (history) and can be restored with one click.
 */
export async function conflictRoutes(app: FastifyInstance, s: Services) {
  app.post('/api/v1/pages/:id/conflicts', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const body = parse(
      z.object({ blockId: z.string().max(100).nullable(), block: z.record(z.string(), z.unknown()), reason: z.enum(['deleted', 'moved', 'overwritten']), afterBlockId: z.string().max(100).nullable().optional() }),
      req.body,
    );
    await requirePage(s.db, user, id, 'edit');
    try {
      getKbSchema().nodeFromJSON(body.block).check();
    } catch (e) {
      throw badRequest('Некорректный блок: ' + (e as Error).message);
    }
    if (JSON.stringify(body.block).length > 2_000_000) throw badRequest('Слишком большой блок');
    const r = await s.db.query(
      `insert into page_events (org_id, page_id, actor_id, type, data) values ($1, $2, $3, 'conflict_copy', $4) returning id, created_at`,
      [user.orgId, id, user.id, { blockId: body.blockId, block: body.block, reason: body.reason, afterBlockId: body.afterBlockId ?? null }],
    );
    s.log.warn({ pageId: id, userId: user.id, reason: body.reason }, 'conflict copy saved');
    return { id: String(r.rows[0].id), createdAt: r.rows[0].created_at };
  });

  app.get('/api/v1/pages/:id/conflicts', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    await requirePage(s.db, user, id, 'view');
    const rows = (
      await s.db.query(
        `select e.id, e.data, e.created_at, u.name as actor_name, e.actor_id from page_events e left join users u on u.id = e.actor_id
          where e.page_id = $1 and e.type = 'conflict_copy' order by e.id desc limit 200`,
        [id],
      )
    ).rows;
    return {
      conflicts: rows.map((r) => ({ id: String(r.id), blockId: r.data.blockId, block: r.data.block, reason: r.data.reason, afterBlockId: r.data.afterBlockId, createdAt: r.created_at, author: { id: r.actor_id, name: r.actor_name }, resolution: r.data.resolution ?? null, resolvedAt: r.data.resolvedAt ?? null })),
    };
  });

  app.post('/api/v1/pages/:id/conflicts/:cid/resolve', async (req) => {
    const user = requireUser(req);
    const { id, cid } = parse(z.object({ id: z.string().uuid(), cid: z.coerce.number().int() }), req.params);
    const { resolution } = parse(z.object({ resolution: z.enum(['restored', 'dismissed']) }), req.body);
    await requirePage(s.db, user, id, 'edit');
    const r = await s.db.query(
      `update page_events set data = data || jsonb_build_object('resolution', $3::text, 'resolvedAt', now(), 'resolvedBy', $4::text)
        where id = $1 and page_id = $2 and type = 'conflict_copy' returning id`,
      [cid, id, resolution, user.id],
    );
    if (!r.rowCount) throw notFound();
    return { ok: true };
  });
}
