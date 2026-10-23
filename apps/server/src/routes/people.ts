import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { normalizeTelegram, phoneHref } from '@kb/shared';
import { parse, requireUser, type Services } from '../app.js';
import { accessForPages, requirePage } from '../acl/engine.js';
import { toAuthUser } from '../auth/sessions.js';
import { notFound } from '../lib/errors.js';

const uuid = z.string().uuid();

/**
 * People mentions (item 29): the profile card shown on a «@Имя» chip, and the access check made when someone is
 * mentioned on a page (to warn the author and offer to share).
 */
export async function peopleRoutes(app: FastifyInstance, s: Services) {
  /**
   * Profile card. Contacts (email, phone, Telegram), job title and department are visible to colleagues of the same
   * organisation only; a guest sees the name. People of another organisation do not exist for the caller (404).
   */
  app.get('/api/v1/people/:id', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const u = (await s.db.query(`select id, org_id, name, email, kind, status, title, phone, telegram, primary_group_id from users where id = $1 and org_id = $2`, [id, user.orgId])).rows[0];
    if (!u) throw notFound('Пользователь не найден');
    if (user.kind === 'guest' && user.id !== u.id) return { person: { id: u.id, name: u.name, restricted: true } };
    const dept = (
      await s.db.query(
        `select g.name from groups g
          where g.org_id = $2 and g.deleted_at is null and g.kind = 'department'
            and (g.id = $3 or exists (select 1 from group_members m where m.group_id = g.id and m.user_id = $1))
          order by (g.id = $3) desc nulls last, g.name limit 1`,
        [u.id, user.orgId, u.primary_group_id],
      )
    ).rows[0];
    return {
      person: {
        id: u.id,
        name: u.name,
        kind: u.kind,
        active: u.status === 'active',
        title: u.title ?? null,
        department: dept?.name ?? null,
        email: u.email,
        phone: u.phone ?? null,
        phoneHref: phoneHref(u.phone),
        telegram: normalizeTelegram(u.telegram),
        restricted: false,
      },
    };
  });

  /**
   * Which of the mentioned people cannot open the page. The caller must be able to read the page; `canShare` tells
   * the client whether to offer «Открыть доступ».
   */
  app.post('/api/v1/pages/:id/mention-access', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const body = parse(z.object({ userIds: z.array(uuid).min(1).max(20) }), req.body);
    const acc = await requirePage(s.db, user, id, 'view');
    const rows = (await s.db.query(`select * from users where id = any($1::uuid[]) and org_id = $2`, [[...new Set(body.userIds)], user.orgId])).rows;
    const users = [];
    for (const u of rows) {
      const a = u.status === 'active' ? (await accessForPages(s.db, toAuthUser(u), [id])).get(id) : null;
      users.push({ id: u.id as string, name: u.name as string, kind: u.kind as string, active: u.status === 'active', canView: !!a?.actions.view && !a.deleted });
    }
    return { canShare: !!acc.actions.share, users };
  });
}
