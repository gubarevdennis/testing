import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { tx } from '../db/pool.js';
import { actorOf, parse, requireUser, type Services } from '../app.js';
import { trashPage, getPage } from '../services/pages.js';

/**
 * A page created with "+" and left without a title or any content is moved to the trash when its author leaves it,
 * so accidental clicks do not litter the tree. Anything typed, uploaded, commented or edited by someone else keeps it.
 */
export async function draftRoutes(app: FastifyInstance, s: Services) {
  app.post('/api/v1/pages/:id/discard-if-empty', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    await s.hub.flushPage(id).catch(() => undefined);
    const p = await getPage(s.db, id);
    if (!p || p.deleted_at) return { discarded: false };
    const st = (
      await s.db.query(
        `select (select plain_text from doc_state where page_id = $1) as text,
                (select count(*)::int from pages c where c.parent_id = $1 and c.deleted_at is null) as children,
                (select count(*)::int from attachments a where a.page_id = $1) as files,
                (select count(*)::int from comments c where c.page_id = $1) as comments,
                (select count(distinct user_id)::int from doc_updates d where d.page_id = $1 and d.user_id is not null and d.user_id <> $2) as others`,
        [id, user.id],
      )
    ).rows[0];
    const empty =
      p.created_by === user.id &&
      !p.title.trim() &&
      !String(st.text ?? '').trim() &&
      st.children === 0 &&
      st.files === 0 &&
      st.comments === 0 &&
      st.others === 0 &&
      Date.now() - new Date(p.created_at).getTime() < 24 * 3600_000;
    if (!empty) return { discarded: false };
    await tx(s.db, (q) => trashPage(q, user, actorOf(req), id));
    s.bus.emit({ type: 'tree-changed', orgId: user.orgId, spaceId: p.space_id, pageIds: [id] });
    return { discarded: true };
  });
}
