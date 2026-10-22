import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { LEVELS } from '@kb/shared';
import { tx } from '../db/pool.js';
import { actorOf, parse, requireUser, type Services } from '../app.js';
import { accessForPages, accessForSpaces, pageAudience, requirePage, canManagePeople, isOrgAdmin, canReadAudit, type AuthUser } from '../acl/engine.js';
import { setGrant, revokeGrant, setInheritance } from '../services/grants.js';
import { toAuthUser } from '../auth/sessions.js';
import { forbidden, notFound } from '../lib/errors.js';
import type { Queryable } from '../db/pool.js';

const uuid = z.string().uuid();

/** Adds human names to subjects. */
async function nameSubjects(q: Queryable, list: Array<{ subjectType: string; subjectId: string | null }>) {
  const userIds = list.filter((x) => x.subjectType === 'user').map((x) => x.subjectId);
  const groupIds = list.filter((x) => x.subjectType === 'group').map((x) => x.subjectId);
  const users = userIds.length ? (await q.query('select id, name, email, kind, status from users where id = any($1::uuid[])', [userIds])).rows : [];
  const groups = groupIds.length ? (await q.query(`select g.id, g.name, g.kind, (select count(*)::int from group_members m where m.group_id = g.id) as members from groups g where g.id = any($1::uuid[])`, [groupIds])).rows : [];
  return (x: { subjectType: string; subjectId: string | null }) => {
    if (x.subjectType === 'org') return { name: 'Все сотрудники организации', kind: 'org' };
    if (x.subjectType === 'user') {
      const u = users.find((y) => y.id === x.subjectId);
      return u ? { name: u.name, email: u.email, kind: u.kind, status: u.status } : { name: 'Удалённый пользователь', kind: 'user' };
    }
    const g = groups.find((y) => y.id === x.subjectId);
    return g ? { name: g.name, kind: g.kind, members: g.members } : { name: 'Удалённая группа', kind: 'group' };
  };
}

export async function accessRoutes(app: FastifyInstance, s: Services) {
  /** Share dialog data: my access, who has access and why, inheritance state. */
  app.get('/api/v1/pages/:id/access', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const acc = await requirePage(s.db, user, id, 'view');
    const page = (await s.db.query('select inherit_permissions, space_id, parent_id from pages where id = $1', [id])).rows[0];
    const audience = user.kind === 'guest' && !acc.actions.share ? [] : await pageAudience(s.db, id);
    const name = await nameSubjects(s.db, audience);
    const grants = (await s.db.query(`select id, subject_type, subject_id, level, can_export, can_download, can_share, can_publish, starts_at, expires_at, reason, created_at, granted_by from grants where resource_type = 'page' and resource_id = $1 and revoked_at is null`, [id])).rows;
    const gname = await nameSubjects(s.db, grants.map((g) => ({ subjectType: g.subject_type, subjectId: g.subject_id })));
    return {
      my: { level: acc.level, actions: acc.actions, sources: acc.sources, explanation: acc.explanation },
      inheritPermissions: page.inherit_permissions,
      audience: audience.map((a) => ({ ...a, subject: name(a) })),
      pageGrants: grants.map((g) => ({ ...g, subject: gname({ subjectType: g.subject_type, subjectId: g.subject_id }) })),
      publicLinks: acc.actions.share ? (await s.db.query(`select id, created_at, expires_at, include_children, allow_download from share_links where page_id = $1 and revoked_at is null`, [id])).rows : [],
    };
  });

  const grantBody = z.object({
    resourceType: z.enum(['space', 'page']),
    resourceId: uuid,
    subjectType: z.enum(['user', 'group', 'org']),
    subjectId: uuid.nullable(),
    level: z.enum(LEVELS),
    canExport: z.boolean().nullable().optional(),
    canDownload: z.boolean().nullable().optional(),
    canShare: z.boolean().nullable().optional(),
    canPublish: z.boolean().nullable().optional(),
    startsAt: z.string().datetime({ offset: true }).nullable().optional(),
    expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
    reason: z.string().max(500).nullable().optional(),
    confirmWiden: z.boolean().optional(),
  });

  app.put('/api/v1/grants', async (req) => {
    const user = requireUser(req);
    const body = parse(grantBody, req.body);
    const g = await tx(s.db, (q) => setGrant(q, user, actorOf(req), body));
    s.bus.emit({ type: 'acl-changed', orgId: user.orgId });
    return { grant: g };
  });

  /** Bulk assignment with preview: returns the exact list of changes; applies only with apply=true. */
  app.post('/api/v1/grants/bulk', async (req) => {
    const user = requireUser(req);
    const body = parse(z.object({ grants: z.array(grantBody).min(1).max(500), apply: z.boolean().default(false) }), req.body);
    if (!body.apply) {
      const name = await nameSubjects(s.db, body.grants);
      return { preview: body.grants.map((g) => ({ ...g, subject: name(g) })) };
    }
    const results = await tx(s.db, async (q) => {
      const out = [];
      for (const g of body.grants) out.push(await setGrant(q, user, actorOf(req), g));
      return out;
    });
    s.bus.emit({ type: 'acl-changed', orgId: user.orgId });
    return { applied: results.length };
  });

  app.delete('/api/v1/grants/:id', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    await tx(s.db, (q) => revokeGrant(q, user, actorOf(req), id));
    s.bus.emit({ type: 'acl-changed', orgId: user.orgId });
    return { ok: true };
  });

  app.post('/api/v1/pages/:id/inheritance', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const { inherit } = parse(z.object({ inherit: z.boolean() }), req.body);
    await tx(s.db, (q) => setInheritance(q, user, actorOf(req), id, inherit));
    s.bus.emit({ type: 'acl-changed', orgId: user.orgId });
    return { ok: true };
  });

  /**
   * "Почему пользователь видит этот документ?" — explains another user's effective access without impersonation.
   * Allowed for org admins / people admins / auditors and for people who can share the page.
   */
  app.get('/api/v1/access/explain', async (req) => {
    const user = requireUser(req);
    const qs = parse(z.object({ userId: uuid, pageId: uuid.optional(), spaceId: uuid.optional() }), req.query);
    const privileged = canManagePeople(user) || canReadAudit(user);
    if (!privileged) {
      if (!qs.pageId) throw forbidden();
      await requirePage(s.db, user, qs.pageId, 'share');
    }
    const target = (await s.db.query('select * from users where id = $1 and org_id = $2', [qs.userId, user.orgId])).rows[0];
    if (!target) throw notFound('Пользователь не найден');
    const tu: AuthUser = toAuthUser(target);
    const userActive = target.status === 'active' && (!target.access_expires_at || new Date(target.access_expires_at) > new Date());
    if (qs.pageId) {
      const pageMeta = (await s.db.query('select p.id, p.title, p.inherit_permissions, s.kind as space_kind from pages p join spaces s on s.id = p.space_id where p.id = $1 and p.org_id = $2', [qs.pageId, user.orgId])).rows[0];
      if (!pageMeta) throw notFound();
      // An admin without content access sees the decision and its sources, but not the page title of private personal content.
      const viewerAcc = (await accessForPages(s.db, user, [qs.pageId])).get(qs.pageId);
      const acc = (await accessForPages(s.db, tu, [qs.pageId])).get(qs.pageId)!;
      const chain = (await s.db.query(`select p.id, p.title, p.inherit_permissions, a.depth from page_ancestors a join pages p on p.id = a.ancestor_id where a.page_id = $1 order by a.depth`, [qs.pageId])).rows;
      const name = await nameSubjects(s.db, [...acc.sources, ...acc.denies]);
      return {
        user: { id: target.id, name: target.name, status: target.status, kind: target.kind, active: userActive },
        page: { id: pageMeta.id, title: viewerAcc?.actions.view ? pageMeta.title : '(скрыто)', inheritPermissions: pageMeta.inherit_permissions },
        level: userActive ? acc.level : 'none',
        actions: userActive ? acc.actions : Object.fromEntries(Object.keys(acc.actions).map((k) => [k, false])),
        sources: acc.sources.map((x) => ({ ...x, subject: name(x) })),
        denies: acc.denies.map((x) => ({ ...x, subject: name(x) })),
        explanation: userActive ? acc.explanation : ['Учётная запись неактивна или срок доступа истёк'],
        inheritanceChain: chain.map((c) => ({ id: c.id, title: viewerAcc?.actions.view ? c.title : '…', inherits: c.inherit_permissions, depth: c.depth })),
      };
    }
    const spaces = await accessForSpaces(s.db, tu, qs.spaceId ? [qs.spaceId] : undefined);
    const names = (await s.db.query('select id, name, kind from spaces where org_id = $1 and deleted_at is null', [user.orgId])).rows;
    return {
      user: { id: target.id, name: target.name, status: target.status, kind: target.kind, active: userActive },
      spaces: names
        .filter((sp) => sp.kind !== 'personal' || sp.id === qs.spaceId)
        .map((sp) => {
          const a = spaces.get(sp.id);
          return { id: sp.id, name: sp.name, level: userActive ? a?.level ?? 'none' : 'none', explanation: a?.explanation ?? [] };
        }),
    };
  });

  /** People & groups directory for the share dialog. Guests have no access to the directory. */
  app.get('/api/v1/directory', async (req) => {
    const user = requireUser(req);
    if (user.kind === 'guest') throw forbidden('Каталог сотрудников недоступен гостям');
    const { q, limit } = parse(z.object({ q: z.string().max(100).default(''), limit: z.coerce.number().int().min(1).max(50).default(20) }), req.query);
    const like = '%' + q.replace(/[%_]/g, '') + '%';
    const users = (await s.db.query(`select id, name, email, kind, title from users where org_id = $1 and status in ('active', 'invited') and (name ilike $2 or email ilike $2) order by name limit $3`, [user.orgId, like, limit])).rows;
    const groups = (await s.db.query(`select g.id, g.name, g.kind, (select count(*)::int from group_members m where m.group_id = g.id) as members from groups g where g.org_id = $1 and g.deleted_at is null and g.name ilike $2 order by g.kind, g.name limit $3`, [user.orgId, like, limit])).rows;
    return { users, groups };
  });

  /** Admin: list of grants expiring soon (temporary access overview). */
  app.get('/api/v1/admin/grants/expiring', async (req) => {
    const user = requireUser(req);
    if (!canManagePeople(user) && !isOrgAdmin(user)) throw forbidden();
    const rows = (
      await s.db.query(
        `select g.*, coalesce(u.name, gr.name, 'Все сотрудники') as subject_name, coalesce(p.title, sp.name) as resource_name
           from grants g left join users u on g.subject_type = 'user' and u.id = g.subject_id left join groups gr on g.subject_type = 'group' and gr.id = g.subject_id
           left join pages p on g.resource_type = 'page' and p.id = g.resource_id left join spaces sp on g.resource_type = 'space' and sp.id = g.resource_id
          where g.org_id = $1 and g.revoked_at is null and g.expires_at is not null order by g.expires_at limit 500`,
        [user.orgId],
      )
    ).rows;
    return { grants: rows.map((r) => ({ ...r, expired: new Date(r.expires_at) <= new Date() })) };
  });
}
