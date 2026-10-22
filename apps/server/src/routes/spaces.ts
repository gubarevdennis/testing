import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { LEVELS, SPACE_KINDS, SPACE_VISIBILITY } from '@kb/shared';
import { tx } from '../db/pool.js';
import { actorOf, parse, requireUser, type Services } from '../app.js';
import { accessForSpaces, requireSpace, isOrgAdmin, bumpAclEpoch, userSubjects } from '../acl/engine.js';
import { createSpace } from '../services/org.js';
import { audit } from '../services/audit.js';
import { visibleChildren, sharedWithMe } from '../services/tree.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';

const uuid = z.string().uuid();

export async function spaceRoutes(app: FastifyInstance, s: Services) {
  /** Spaces visible in the sidebar: those with access, plus "closed" spaces whose name is visible to employees. */
  app.get('/api/v1/spaces', async (req) => {
    const user = requireUser(req);
    const subjects = await userSubjects(s.db, user);
    const acc = await accessForSpaces(s.db, user, undefined, subjects);
    const rows = (await s.db.query(`select * from spaces where org_id = $1 and deleted_at is null order by kind = 'personal' desc, sort_key collate "C", name`, [user.orgId])).rows;
    const spaces = rows
      .map((r) => {
        const a = acc.get(r.id)!;
        const member = a.actions.view;
        const discoverable = !member && r.visibility === 'closed' && user.kind === 'employee';
        if (!member && !discoverable) return null;
        return {
          id: r.id,
          name: r.name,
          description: member ? r.description : '',
          icon: r.icon,
          kind: r.kind,
          visibility: r.visibility,
          archived: !!r.archived_at,
          member,
          level: a.level,
          actions: a.actions,
          policy: member ? a.policy : undefined,
          isPersonal: r.kind === 'personal',
        };
      })
      .filter(Boolean);
    return { spaces, shared: await sharedWithMe(s.db, user) };
  });

  app.post('/api/v1/spaces', async (req) => {
    const user = requireUser(req);
    const body = parse(
      z.object({
        name: z.string().min(1).max(200),
        description: z.string().max(2000).optional(),
        icon: z.string().max(64).nullable().optional(),
        kind: z.enum(SPACE_KINDS).refine((k) => k !== 'personal'),
        visibility: z.enum(SPACE_VISIBILITY),
        orgLevel: z.enum(LEVELS).nullable().optional(),
        groups: z.array(z.object({ groupId: uuid, level: z.enum(LEVELS) })).optional(),
        users: z.array(z.object({ userId: uuid, level: z.enum(LEVELS) })).optional(),
        policy: z.object({ publishingMode: z.enum(['live', 'publish']).optional(), requireApproval: z.boolean().optional(), allowExport: z.boolean().optional(), allowDownload: z.boolean().optional(), allowGuests: z.boolean().optional() }).optional(),
      }),
      req.body,
    );
    if (body.kind === 'org' && !isOrgAdmin(user)) throw forbidden('Общекорпоративное пространство создаёт администратор');
    const sp = await tx(s.db, (q) => createSpace(q, user, actorOf(req), body));
    s.bus.emit({ type: 'acl-changed', orgId: user.orgId });
    return { space: sp };
  });

  app.get('/api/v1/spaces/:id', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const a = await requireSpace(s.db, user, id, 'view');
    const sp = (await s.db.query('select * from spaces where id = $1', [id])).rows[0];
    const stats = (await s.db.query(`select count(*)::int pages from pages where space_id = $1 and deleted_at is null`, [id])).rows[0];
    return { space: { ...sp, settings: undefined, policy: a.policy, level: a.level, actions: a.actions, stats } };
  });

  app.patch('/api/v1/spaces/:id', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const body = parse(
      z.object({
        name: z.string().min(1).max(200).optional(),
        description: z.string().max(2000).optional(),
        icon: z.string().max(64).nullable().optional(),
        visibility: z.enum(SPACE_VISIBILITY).optional(),
        policy: z.object({ publishingMode: z.enum(['live', 'publish']).optional(), requireApproval: z.boolean().optional(), allowExport: z.boolean().optional(), allowDownload: z.boolean().optional(), allowGuests: z.boolean().optional() }).optional(),
        archived: z.boolean().optional(),
        confirmWiden: z.boolean().optional(),
      }),
      req.body,
    );
    await requireSpace(s.db, user, id, 'manage_space');
    const sp = await tx(s.db, async (q) => {
      const cur = (await q.query('select * from spaces where id = $1 for update', [id])).rows[0];
      if (cur.kind === 'personal' && (body.visibility || body.policy?.allowGuests)) throw badRequest('Личное пространство всегда закрыто');
      if (body.visibility === 'open' && cur.visibility !== 'open') {
        if (!body.confirmWiden) throw conflict('audience_change', 'Пространство станет видимым всем сотрудникам — требуется подтверждение', { widens: true });
        const has = await q.query(`select 1 from grants where resource_type = 'space' and resource_id = $1 and subject_type = 'org' and revoked_at is null`, [id]);
        if (!has.rowCount) await q.query(`insert into grants (org_id, resource_type, resource_id, subject_type, level, granted_by, reason) values ($1, 'space', $2, 'org', 'view', $3, 'space opened')`, [user.orgId, id, user.id]);
      }
      if (body.visibility && body.visibility !== 'open' && cur.visibility === 'open')
        await q.query(`update grants set revoked_at = now(), revoked_by = $2 where resource_type = 'space' and resource_id = $1 and subject_type = 'org' and revoked_at is null`, [id, user.id]);
      const settings = { ...cur.settings, policy: { ...(cur.settings?.policy ?? {}), ...(body.policy ?? {}) } };
      const r = await q.query(
        `update spaces set name = coalesce($2, name), description = coalesce($3, description), icon = case when $4::boolean then $5 else icon end, visibility = coalesce($6, visibility), settings = $7,
           archived_at = case when $8::boolean is null then archived_at when $8 then coalesce(archived_at, now()) else null end, updated_at = now() where id = $1 returning *`,
        [id, body.name ?? null, body.description ?? null, body.icon !== undefined, body.icon ?? null, body.visibility ?? null, settings, body.archived ?? null],
      );
      await audit(q, actorOf(req), { action: 'space.update', targetType: 'space', targetId: id, details: body });
      await bumpAclEpoch(q, user.orgId);
      return r.rows[0];
    });
    s.bus.emit({ type: 'acl-changed', orgId: user.orgId });
    return { space: sp };
  });

  /** Spaces are soft-deleted (restorable); deleting requires typing the name (protection against accidents). */
  app.delete('/api/v1/spaces/:id', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const body = parse(z.object({ confirmName: z.string() }), req.body ?? {});
    await requireSpace(s.db, user, id, 'manage_space');
    await tx(s.db, async (q) => {
      const sp = (await q.query('select * from spaces where id = $1 for update', [id])).rows[0];
      if (sp.kind === 'personal') throw badRequest('Личное пространство нельзя удалить');
      if (sp.legal_hold) throw forbidden('Пространство на юридическом удержании');
      if (body.confirmName.trim() !== sp.name) throw badRequest('Название для подтверждения не совпадает');
      await q.query('update spaces set deleted_at = now(), deleted_by = $2 where id = $1', [id, user.id]);
      await audit(q, actorOf(req), { action: 'space.delete', targetType: 'space', targetId: id, details: { name: sp.name } });
      await bumpAclEpoch(q, user.orgId);
    });
    s.bus.emit({ type: 'acl-changed', orgId: user.orgId });
    return { ok: true };
  });

  app.post('/api/v1/spaces/:id/restore', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    await tx(s.db, async (q) => {
      const sp = (await q.query('select * from spaces where id = $1 and org_id = $2', [id, user.orgId])).rows[0];
      if (!sp || !sp.deleted_at) throw notFound();
      // Only someone with full grant on the space (or org admin) may restore it.
      const g = await q.query(`select 1 from grants where resource_type = 'space' and resource_id = $1 and subject_type = 'user' and subject_id = $2 and level = 'full' and revoked_at is null`, [id, user.id]);
      if (!g.rowCount && !isOrgAdmin(user)) throw forbidden();
      await q.query('update spaces set deleted_at = null, deleted_by = null where id = $1', [id]);
      await audit(q, actorOf(req), { action: 'space.restore', targetType: 'space', targetId: id });
      await bumpAclEpoch(q, user.orgId);
    });
    s.bus.emit({ type: 'acl-changed', orgId: user.orgId });
    return { ok: true };
  });

  app.get('/api/v1/trash/spaces', async (req) => {
    const user = requireUser(req);
    const r = await s.db.query(
      `select s.id, s.name, s.icon, s.deleted_at, u.name as deleted_by_name from spaces s left join users u on u.id = s.deleted_by
        where s.org_id = $1 and s.deleted_at is not null
          and (exists (select 1 from grants g where g.resource_type = 'space' and g.resource_id = s.id and g.subject_type = 'user' and g.subject_id = $2 and g.level = 'full' and g.revoked_at is null) or $3)`,
      [user.orgId, user.id, isOrgAdmin(user)],
    );
    return { spaces: r.rows };
  });

  app.get('/api/v1/spaces/:id/tree', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const qs = parse(z.object({ parentId: uuid.optional(), after: z.string().optional(), limit: z.coerce.number().int().min(1).max(2000).optional() }), req.query);
    const sp = (await s.db.query('select org_id, deleted_at from spaces where id = $1', [id])).rows[0];
    if (!sp || sp.org_id !== user.orgId || sp.deleted_at) throw notFound();
    // The space itself may not be visible (pages shared individually), children are filtered per page.
    return visibleChildren(s.db, user, id, qs.parentId ?? null, { after: qs.after ?? null, limit: qs.limit });
  });

  app.get('/api/v1/spaces/:id/access', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const a = await requireSpace(s.db, user, id, 'view');
    const grants = (
      await s.db.query(
        `select g.*, u.name as user_name, u.email as user_email, u.kind as user_kind, gr.name as group_name, gr.kind as group_kind
           from grants g left join users u on g.subject_type = 'user' and u.id = g.subject_id left join groups gr on g.subject_type = 'group' and gr.id = g.subject_id
          where g.resource_type = 'space' and g.resource_id = $1 and g.revoked_at is null order by g.created_at`,
        [id],
      )
    ).rows;
    return { level: a.level, actions: a.actions, grants: a.actions.share || isOrgAdmin(user) ? grants : grants.filter((g) => g.subject_type !== 'user' || g.subject_id === user.id) };
  });

  /** Request access to a closed space or page (notifies people who can share). */
  app.post('/api/v1/access-requests', async (req) => {
    const user = requireUser(req);
    const body = parse(z.object({ resourceType: z.enum(['space', 'page']), resourceId: uuid, level: z.enum(['view', 'comment', 'edit']), reason: z.string().max(1000).optional() }), req.body);
    if (user.kind === 'guest') throw forbidden('Гости не могут запрашивать доступ');
    const r = await tx(s.db, async (q) => {
      const row = (await q.query(`insert into access_requests (org_id, resource_type, resource_id, user_id, level, reason) values ($1, $2, $3, $4, $5, $6) returning *`, [user.orgId, body.resourceType, body.resourceId, user.id, body.level, body.reason ?? null])).rows[0];
      const managers = await q.query(`select subject_id from grants where resource_type = $1 and resource_id = $2 and subject_type = 'user' and level = 'full' and revoked_at is null`, [body.resourceType, body.resourceId]);
      for (const m of managers.rows) await q.query(`insert into notifications (user_id, type, data) values ($1, 'access_request', $2)`, [m.subject_id, { requestId: row.id, from: user.name, resourceType: body.resourceType, resourceId: body.resourceId, level: body.level, reason: body.reason ?? null }]);
      await audit(q, actorOf(req), { action: 'access.request', targetType: body.resourceType, targetId: body.resourceId, details: { level: body.level } });
      return row;
    });
    return { request: r };
  });
}
