import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { APPEARANCE_FONTS, APPEARANCE_PRESETS, APPEARANCE_SIZES } from '@kb/shared';
import { tx } from '../db/pool.js';
import { actorOf, parse, requireUser, type Services } from '../app.js';
import { accessForPages, accessForSpaces, canManagePeople, canReadAudit, isOrgAdmin, userSubjects, bumpAclEpoch, type AuthUser } from '../acl/engine.js';
import { addGroupMember, createGroup, createUser, deleteGroup, removeGroupMember, setUserStatus, transferOwnership, orgSettings, isGroupManager } from '../services/org.js';
import { audit, verifyAuditChain } from '../services/audit.js';
import { toAuthUser } from '../auth/sessions.js';
import { randomToken, sha256 } from '../lib/crypto.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { hashPassword } from '../auth/passwords.js';

const uuid = z.string().uuid();

function requirePeopleAdmin(user: AuthUser) {
  if (!canManagePeople(user)) throw forbidden('Раздел доступен администраторам');
}

export async function adminRoutes(app: FastifyInstance, s: Services) {
  app.get('/api/v1/admin/users', async (req) => {
    const user = requireUser(req);
    requirePeopleAdmin(user);
    const qs = parse(z.object({ q: z.string().max(100).default(''), status: z.string().optional(), kind: z.enum(['employee', 'guest']).optional(), role: z.enum(['owner', 'admin', 'people_admin', 'auditor', 'member']).optional(), groupId: uuid.optional(), offset: z.coerce.number().int().min(0).default(0), limit: z.coerce.number().int().min(1).max(500).default(100) }), req.query);
    const like = '%' + qs.q.replace(/[%_]/g, '') + '%';
    const rows = (
      await s.db.query(
        `select u.id, u.email, u.name, u.kind, u.org_role, u.status, u.title, u.created_at, u.last_login_at, u.access_expires_at, u.mfa_enabled, u.primary_group_id, u.manager_id,
                coalesce((select json_agg(json_build_object('id', g.id, 'name', g.name, 'kind', g.kind, 'role', m.role, 'expiresAt', m.expires_at)) from group_members m join groups g on g.id = m.group_id and g.deleted_at is null where m.user_id = u.id), '[]') as groups,
                count(*) over() as total
           from users u where u.org_id = $1 and (u.name ilike $2 or u.email ilike $2) and ($3::text is null or u.status = $3) and ($4::text is null or u.kind = $4)
            and ($5::uuid is null or exists (select 1 from group_members m where m.user_id = u.id and m.group_id = $5)) and ($8::text is null or u.org_role = $8)
          order by u.name offset $6 limit $7`,
        [user.orgId, like, qs.status ?? null, qs.kind ?? null, qs.groupId ?? null, qs.offset, qs.limit, qs.role ?? null],
      )
    ).rows;
    return { users: rows.map(({ total: _total, ...r }) => r), total: rows[0]?.total ?? 0 };
  });

  /** User card: profile, memberships, manager and primary department names. */
  app.get('/api/v1/admin/users/:id', async (req) => {
    const user = requireUser(req);
    requirePeopleAdmin(user);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const row = (
      await s.db.query(
        `select u.id, u.email, u.name, u.kind, u.org_role, u.status, u.title, u.created_at, u.updated_at, u.last_login_at, u.access_expires_at, u.mfa_enabled, u.primary_group_id, pg.name as primary_group_name,
                u.manager_id, m.name as manager_name,
                coalesce((select json_agg(json_build_object('id', g.id, 'name', g.name, 'kind', g.kind, 'role', gm.role, 'expiresAt', gm.expires_at) order by g.name) from group_members gm join groups g on g.id = gm.group_id and g.deleted_at is null where gm.user_id = u.id), '[]') as groups,
                (select count(*)::int from pages p where p.owner_id = u.id and p.deleted_at is null) as owned_pages
           from users u left join users m on m.id = u.manager_id left join groups pg on pg.id = u.primary_group_id
          where u.id = $1 and u.org_id = $2`,
        [id, user.orgId],
      )
    ).rows[0];
    if (!row) throw notFound('Пользователь не найден');
    return { user: row };
  });

  const createUserBody = z.object({
    email: z.string().email(),
    name: z.string().min(1).max(200),
    kind: z.enum(['employee', 'guest']).default('employee'),
    orgRole: z.enum(['admin', 'people_admin', 'auditor', 'member']).optional(),
    password: z.string().optional(),
    groupIds: z.array(uuid).optional(),
    primaryGroupId: uuid.nullable().optional(),
    managerId: uuid.nullable().optional(),
    title: z.string().max(200).nullable().optional(),
    accessExpiresAt: z.string().datetime({ offset: true }).nullable().optional(),
    invite: z.boolean().default(true),
    pageGrants: z.array(z.object({ pageId: uuid, level: z.enum(['view', 'comment', 'edit']) })).optional(),
  });

  /** Onboarding wizard: creates the user, memberships, optional guest page grants and an invitation link. */
  app.post('/api/v1/admin/users', async (req) => {
    const admin = requireUser(req);
    const body = parse(createUserBody, req.body);
    if (body.kind === 'guest' && !body.accessExpiresAt) throw badRequest('Для гостя укажите срок действия доступа');
    const result = await tx(s.db, async (q) => {
      const u = await createUser(q, admin, actorOf(req), body);
      let inviteToken: string | null = null;
      if (!body.password && body.invite) {
        inviteToken = randomToken(32);
        await q.query(`insert into invitations (org_id, email, user_id, token_hash, created_by, expires_at) values ($1, $2, $3, $4, $5, now() + interval '7 days')`, [admin.orgId, u.email, u.id, sha256(inviteToken), admin.id]);
      }
      for (const g of body.pageGrants ?? []) {
        const { setGrant } = await import('../services/grants.js');
        await setGrant(q, admin, actorOf(req), { resourceType: 'page', resourceId: g.pageId, subjectType: 'user', subjectId: u.id, level: g.level, expiresAt: body.accessExpiresAt ?? null, reason: 'guest invitation' });
      }
      return { user: u, inviteToken };
    });
    const spaces = await accessForSpaces(s.db, toAuthUser(result.user));
    s.bus.emit({ type: 'acl-changed', orgId: admin.orgId });
    return {
      user: toAuthUser(result.user),
      inviteUrl: result.inviteToken ? `${s.cfg.publicUrl}/invite/${result.inviteToken}` : null,
      effectiveSpaces: [...spaces.values()].filter((a) => a.actions.view).map((a) => ({ spaceId: a.spaceId, level: a.level })),
    };
  });

  /** CSV import of employees: email;name;department;title — dry run by default. */
  app.post('/api/v1/admin/users/import', async (req) => {
    const admin = requireUser(req);
    requirePeopleAdmin(admin);
    const body = parse(z.object({ csv: z.string().max(2_000_000), apply: z.boolean().default(false) }), req.body);
    const Papa = (await import('papaparse')).default;
    const parsed = Papa.parse<Record<string, string>>(body.csv.replace(/^﻿/, ''), { header: true, skipEmptyLines: true, delimiter: '' });
    const groups = (await s.db.query('select id, name from groups where org_id = $1 and deleted_at is null', [admin.orgId])).rows;
    const existing = new Set((await s.db.query('select lower(email) e from users where org_id = $1', [admin.orgId])).rows.map((r) => r.e));
    // the same address twice in one file: the first row wins, the repeat is reported instead of failing the whole
    // import on the unique email constraint (QA-A2)
    const seen = new Set<string>();
    const rows = parsed.data.map((r, i) => {
      const email = (r.email ?? r.Email ?? r['почта'] ?? '').trim().toLowerCase();
      const name = (r.name ?? r.Name ?? r['имя'] ?? r['ФИО'] ?? '').trim();
      const dept = (r.department ?? r['отдел'] ?? r['подразделение'] ?? '').trim();
      const group = dept ? groups.find((g) => g.name.toLowerCase() === dept.toLowerCase()) : null;
      const problems: string[] = [];
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) problems.push('некорректный email');
      if (!name) problems.push('нет имени');
      if (existing.has(email)) problems.push('уже существует');
      else if (email && seen.has(email)) problems.push('повторяется в файле');
      if (email) seen.add(email);
      if (dept && !group) problems.push(`подразделение «${dept}» не найдено`);
      return { line: i + 2, email, name, title: (r.title ?? r['должность'] ?? '').trim() || null, groupId: group?.id ?? null, problems };
    });
    if (!body.apply) return { preview: rows, valid: rows.filter((r) => !r.problems.length).length };
    const created = await tx(s.db, async (q) => {
      const out = [];
      for (const r of rows.filter((x) => !x.problems.length)) {
        const u = await createUser(q, admin, actorOf(req), { email: r.email, name: r.name, kind: 'employee', groupIds: r.groupId ? [r.groupId] : [], primaryGroupId: r.groupId, title: r.title });
        const token = randomToken(32);
        await q.query(`insert into invitations (org_id, email, user_id, token_hash, created_by, expires_at) values ($1, $2, $3, $4, $5, now() + interval '7 days')`, [admin.orgId, u.email, u.id, sha256(token), admin.id]);
        out.push({ id: u.id, email: u.email, inviteUrl: `${s.cfg.publicUrl}/invite/${token}` });
      }
      return out;
    });
    s.bus.emit({ type: 'acl-changed', orgId: admin.orgId });
    return { created, skipped: rows.filter((r) => r.problems.length) };
  });

  app.patch('/api/v1/admin/users/:id', async (req) => {
    const admin = requireUser(req);
    requirePeopleAdmin(admin);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const body = parse(z.object({ name: z.string().min(1).max(200).optional(), title: z.string().max(200).nullable().optional(), orgRole: z.enum(['admin', 'people_admin', 'auditor', 'member', 'owner']).optional(), managerId: uuid.nullable().optional(), primaryGroupId: uuid.nullable().optional(), accessExpiresAt: z.string().datetime({ offset: true }).nullable().optional() }), req.body);
    await tx(s.db, async (q) => {
      const u = (await q.query('select * from users where id = $1 and org_id = $2 for update', [id, admin.orgId])).rows[0];
      if (!u) throw notFound();
      if (body.orgRole && body.orgRole !== u.org_role) {
        if (!isOrgAdmin(admin)) throw forbidden('Роли назначает администратор');
        if (body.orgRole === 'owner' && admin.orgRole !== 'owner') throw forbidden('Владельца назначает владелец');
        if (u.kind === 'guest') throw badRequest('Гостю нельзя назначить административную роль');
        if (u.org_role === 'owner') {
          const owners = await q.query(`select count(*)::int c from users where org_id = $1 and org_role = 'owner' and status = 'active'`, [admin.orgId]);
          if (owners.rows[0].c <= 1) throw conflict('last_owner', 'Нельзя снять роль с единственного владельца');
        }
      }
      await q.query(
        `update users set name = coalesce($2, name), title = case when $3::boolean then $4 else title end, org_role = coalesce($5, org_role),
           manager_id = case when $6::boolean then $7 else manager_id end, primary_group_id = case when $8::boolean then $9 else primary_group_id end,
           access_expires_at = case when $10::boolean then $11::timestamptz else access_expires_at end, updated_at = now() where id = $1`,
        [id, body.name ?? null, body.title !== undefined, body.title ?? null, body.orgRole ?? null, body.managerId !== undefined, body.managerId ?? null, body.primaryGroupId !== undefined, body.primaryGroupId ?? null, body.accessExpiresAt !== undefined, body.accessExpiresAt ?? null],
      );
      await audit(q, actorOf(req), { action: 'user.update', targetType: 'user', targetId: id, details: { ...body, previousRole: u.org_role } });
      await bumpAclEpoch(q, admin.orgId);
    });
    s.bus.emit({ type: 'acl-changed', orgId: admin.orgId });
    return { ok: true };
  });

  app.post('/api/v1/admin/users/:id/status', async (req) => {
    const admin = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const body = parse(z.object({ status: z.enum(['active', 'suspended', 'deactivated']), reason: z.string().max(500).default(''), transferTo: uuid.optional() }), req.body);
    await tx(s.db, async (q) => {
      await setUserStatus(q, admin, actorOf(req), id, body.status, body.reason);
      if (body.transferTo) await transferOwnership(q, admin, actorOf(req), id, body.transferTo);
    });
    if (body.status !== 'active') s.bus.emit({ type: 'user-revoked', userId: id, reason: body.status });
    s.bus.emit({ type: 'acl-changed', orgId: admin.orgId });
    return { ok: true };
  });

  app.post('/api/v1/admin/users/:id/revoke-sessions', async (req) => {
    const admin = requireUser(req);
    requirePeopleAdmin(admin);
    const { id } = parse(z.object({ id: uuid }), req.params);
    await tx(s.db, async (q) => {
      const r = await q.query(`update sessions set revoked_at = now(), revoke_reason = 'admin' where user_id = $1 and revoked_at is null and user_id in (select id from users where org_id = $2)`, [id, admin.orgId]);
      await audit(q, actorOf(req), { action: 'user.revoke_sessions', targetType: 'user', targetId: id, details: { count: r.rowCount } });
    });
    s.bus.emit({ type: 'user-revoked', userId: id, reason: 'sessions revoked' });
    return { ok: true };
  });

  app.post('/api/v1/admin/users/:id/reset-password', async (req) => {
    const admin = requireUser(req);
    requirePeopleAdmin(admin);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const token = randomToken(32);
    await tx(s.db, async (q) => {
      const u = (await q.query('select email from users where id = $1 and org_id = $2', [id, admin.orgId])).rows[0];
      if (!u) throw notFound();
      await q.query(`insert into invitations (org_id, email, user_id, token_hash, created_by, expires_at) values ($1, $2, $3, $4, $5, now() + interval '1 day')`, [admin.orgId, u.email, id, sha256(token), admin.id]);
      await q.query(`update sessions set revoked_at = now(), revoke_reason = 'password_reset' where user_id = $1 and revoked_at is null`, [id]);
      await audit(q, actorOf(req), { action: 'user.password_reset', targetType: 'user', targetId: id });
    });
    return { resetUrl: `${s.cfg.publicUrl}/invite/${token}` };
  });

  app.post('/api/v1/admin/invitations/:userId/resend', async (req) => {
    const admin = requireUser(req);
    requirePeopleAdmin(admin);
    const { userId } = parse(z.object({ userId: uuid }), req.params);
    const token = randomToken(32);
    await tx(s.db, async (q) => {
      const u = (await q.query(`select email, status from users where id = $1 and org_id = $2`, [userId, admin.orgId])).rows[0];
      if (!u || u.status !== 'invited') throw badRequest('Пользователь уже активирован или не найден');
      await q.query(`update invitations set revoked_at = now() where user_id = $1 and accepted_at is null and revoked_at is null`, [userId]);
      await q.query(`insert into invitations (org_id, email, user_id, token_hash, created_by, expires_at) values ($1, $2, $3, $4, $5, now() + interval '7 days')`, [admin.orgId, u.email, userId, sha256(token), admin.id]);
      await audit(q, actorOf(req), { action: 'user.invite_resend', targetType: 'user', targetId: userId });
    });
    return { inviteUrl: `${s.cfg.publicUrl}/invite/${token}` };
  });

  app.post('/api/v1/admin/invitations/:userId/revoke', async (req) => {
    const admin = requireUser(req);
    requirePeopleAdmin(admin);
    const { userId } = parse(z.object({ userId: uuid }), req.params);
    await tx(s.db, async (q) => {
      await q.query(`update invitations set revoked_at = now() where user_id = $1 and org_id = $2 and accepted_at is null and revoked_at is null`, [userId, admin.orgId]);
      await audit(q, actorOf(req), { action: 'user.invite_revoke', targetType: 'user', targetId: userId });
    });
    return { ok: true };
  });

  /** Department transfer preview: spaces gained/lost when moving a user from one group to another. */
  app.post('/api/v1/admin/users/:id/transfer-preview', async (req) => {
    const admin = requireUser(req);
    requirePeopleAdmin(admin);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const body = parse(z.object({ removeGroupIds: z.array(uuid).default([]), addGroupIds: z.array(uuid).default([]) }), req.body);
    const target = (await s.db.query('select * from users where id = $1 and org_id = $2', [id, admin.orgId])).rows[0];
    if (!target) throw notFound();
    const tu = toAuthUser(target);
    const before = await userSubjects(s.db, tu);
    const groupsAfter = new Set(before.groupIds.filter((g) => !body.removeGroupIds.includes(g)));
    for (const g of body.addGroupIds) {
      groupsAfter.add(g);
      const parents = (await s.db.query(`with recursive up as (select id, parent_id, kind from groups where id = $1 union select g.id, g.parent_id, g.kind from groups g join up on up.parent_id = g.id where up.kind = 'department' and g.kind = 'department') select id from up`, [g])).rows;
      for (const p of parents) groupsAfter.add(p.id);
    }
    const a = await accessForSpaces(s.db, tu, undefined, before);
    const b = await accessForSpaces(s.db, tu, undefined, { ...before, groupIds: [...groupsAfter] });
    const names = new Map((await s.db.query('select id, name from spaces where org_id = $1', [admin.orgId])).rows.map((r) => [r.id, r.name]));
    const diff = [];
    for (const [spaceId, acc] of b) {
      const old = a.get(spaceId)?.level ?? 'none';
      if (old !== acc.level) diff.push({ spaceId, name: names.get(spaceId), from: old, to: acc.level });
    }
    // Documents whose ownership would need a transfer on deactivation (same scope as transferOwnership).
    const owned = (await s.db.query(`select count(*)::int c from pages p join spaces sp on sp.id = p.space_id where p.owner_id = $1 and p.org_id = $2 and sp.kind <> 'personal' and p.deleted_at is null`, [id, admin.orgId])).rows[0].c;
    return { changes: diff, ownedPages: owned };
  });

  // ---- groups / departments
  app.get('/api/v1/admin/groups', async (req) => {
    const user = requireUser(req);
    if (user.kind === 'guest') throw forbidden();
    const rows = (
      await s.db.query(
        `select g.id, g.name, g.description, g.kind, g.parent_id, g.manager_id, u.name as manager_name, (select count(*)::int from group_members m where m.group_id = g.id) as members
           from groups g left join users u on u.id = g.manager_id where g.org_id = $1 and g.deleted_at is null order by g.kind, g.name`,
        [user.orgId],
      )
    ).rows;
    return { groups: rows };
  });

  app.post('/api/v1/admin/groups', async (req) => {
    const admin = requireUser(req);
    const body = parse(z.object({ name: z.string().min(1).max(200), description: z.string().max(2000).optional(), kind: z.enum(['department', 'group']), parentId: uuid.nullable().optional(), managerId: uuid.nullable().optional() }), req.body);
    const g = await tx(s.db, (q) => createGroup(q, admin, actorOf(req), body));
    return { group: g };
  });

  app.patch('/api/v1/admin/groups/:id', async (req) => {
    const admin = requireUser(req);
    requirePeopleAdmin(admin);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const body = parse(z.object({ name: z.string().min(1).max(200).optional(), description: z.string().max(2000).optional(), parentId: uuid.nullable().optional(), managerId: uuid.nullable().optional() }), req.body);
    await tx(s.db, async (q) => {
      if (body.parentId) {
        const cyc = await q.query(`with recursive up as (select id, parent_id from groups where id = $1 union select g.id, g.parent_id from groups g join up on up.parent_id = g.id) select 1 from up where id = $2`, [body.parentId, id]);
        if (cyc.rowCount) throw conflict('group_cycle', 'Подразделение не может быть вложено в собственное дочернее');
      }
      const r = await q.query(
        `update groups set name = coalesce($2, name), description = coalesce($3, description), parent_id = case when $4::boolean then $5 else parent_id end, manager_id = case when $6::boolean then $7 else manager_id end, updated_at = now() where id = $1 and org_id = $8`,
        [id, body.name ?? null, body.description ?? null, body.parentId !== undefined, body.parentId ?? null, body.managerId !== undefined, body.managerId ?? null, admin.orgId],
      );
      if (!r.rowCount) throw notFound();
      await audit(q, actorOf(req), { action: 'group.update', targetType: 'group', targetId: id, details: body });
      await bumpAclEpoch(q, admin.orgId);
    });
    s.bus.emit({ type: 'acl-changed', orgId: admin.orgId });
    return { ok: true };
  });

  app.delete('/api/v1/admin/groups/:id', async (req) => {
    const admin = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const body = parse(z.object({ confirm: z.boolean().optional(), reassignTo: uuid.nullable().optional() }), req.body ?? {});
    await tx(s.db, (q) => deleteGroup(q, admin, actorOf(req), id, body));
    s.bus.emit({ type: 'acl-changed', orgId: admin.orgId });
    return { ok: true };
  });

  app.get('/api/v1/admin/groups/:id/members', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    if (!canManagePeople(user) && !(await isGroupManager(s.db, user.id, id))) throw forbidden();
    const rows = (await s.db.query(`select u.id, u.name, u.email, u.kind, u.status, m.role, m.expires_at, m.added_at from group_members m join users u on u.id = m.user_id where m.group_id = $1 order by u.name`, [id])).rows;
    return { members: rows };
  });

  app.put('/api/v1/admin/groups/:id/members/:userId', async (req) => {
    const admin = requireUser(req);
    const { id, userId } = parse(z.object({ id: uuid, userId: uuid }), req.params);
    const body = parse(z.object({ role: z.enum(['member', 'manager']).default('member'), expiresAt: z.string().datetime({ offset: true }).nullable().optional() }), req.body ?? {});
    await tx(s.db, (q) => addGroupMember(q, admin, actorOf(req), id, userId, body));
    s.bus.emit({ type: 'acl-changed', orgId: admin.orgId });
    return { ok: true };
  });

  app.delete('/api/v1/admin/groups/:id/members/:userId', async (req) => {
    const admin = requireUser(req);
    const { id, userId } = parse(z.object({ id: uuid, userId: uuid }), req.params);
    await tx(s.db, (q) => removeGroupMember(q, admin, actorOf(req), id, userId));
    s.bus.emit({ type: 'acl-changed', orgId: admin.orgId });
    return { ok: true };
  });

  // ---- organisation settings
  app.get('/api/v1/admin/settings', async (req) => {
    const user = requireUser(req);
    if (!isOrgAdmin(user)) throw forbidden();
    return { settings: await orgSettings(s.db, user.orgId) };
  });

  app.patch('/api/v1/admin/settings', async (req) => {
    const user = requireUser(req);
    if (!isOrgAdmin(user)) throw forbidden();
    const body = parse(
      z.object({
        requireMfa: z.boolean().optional(),
        guestsEnabled: z.boolean().optional(),
        publicLinksEnabled: z.boolean().optional(),
        ssoOnly: z.boolean().optional(),
        oidcJitProvisioning: z.boolean().optional(),
        retention: z.object({ trashDays: z.number().int().min(30).max(3650).optional(), journalDays: z.number().int().min(90).max(3650).optional(), revisionDays: z.number().int().min(365).max(36500).optional() }).optional(),
        quotaPerUserMb: z.number().int().min(10).max(1_000_000).optional(),
        appearance: z.object({ preset: z.enum(APPEARANCE_PRESETS).optional(), font: z.enum(APPEARANCE_FONTS).optional(), fontSize: z.enum(APPEARANCE_SIZES).optional() }).strict().optional(),
      }),
      req.body,
    );
    const settings = await tx(s.db, async (q) => {
      const cur = await orgSettings(q, user.orgId);
      const next = { ...cur, ...body, retention: { ...cur.retention, ...(body.retention ?? {}) }, appearance: { ...cur.appearance, ...(body.appearance ?? {}) } };
      await q.query('update organizations set settings = $2, updated_at = now() where id = $1', [user.orgId, next]);
      await audit(q, actorOf(req), { action: 'org.settings_update', targetType: 'org', targetId: user.orgId, details: { before: cur, after: next } });
      // the appearance alone changes nothing about access: no re-check of every open session
      if (Object.keys(body).some((k) => k !== 'appearance')) await bumpAclEpoch(q, user.orgId);
      return next;
    });
    if (Object.keys(body).some((k) => k !== 'appearance')) s.bus.emit({ type: 'acl-changed', orgId: user.orgId });
    return { settings };
  });

  // ---- audit log
  app.get('/api/v1/audit', async (req) => {
    const user = requireUser(req);
    const qs = parse(
      z.object({ actorId: uuid.optional(), action: z.string().max(100).optional(), targetType: z.string().max(50).optional(), targetId: z.string().max(100).optional(), from: z.string().datetime({ offset: true }).optional(), to: z.string().datetime({ offset: true }).optional(), before: z.coerce.number().int().optional(), limit: z.coerce.number().int().min(1).max(500).default(100) }),
      req.query,
    );
    // Org admins and auditors see the organisation log; others see only events about pages they fully manage.
    let scope = 'org';
    if (!canReadAudit(user)) {
      if (!qs.targetId) throw forbidden('Журнал аудита доступен администраторам и аудиторам');
      const { requirePage } = await import('../acl/engine.js');
      await requirePage(s.db, user, qs.targetId, 'share');
      scope = 'page';
    }
    const rows = (
      await s.db.query(
        `select id, at, actor_id, actor_name, ip, action, target_type, target_id, outcome, correlation_id, details from audit_events
          where org_id = $1 and ($2::uuid is null or actor_id = $2) and ($3::text is null or action like $3 || '%') and ($4::text is null or target_type = $4) and ($5::text is null or target_id = $5)
            and ($6::timestamptz is null or at >= $6) and ($7::timestamptz is null or at <= $7) and ($8::bigint is null or id < $8)
          order by id desc limit $9`,
        [user.orgId, qs.actorId ?? null, qs.action ?? null, qs.targetType ?? null, qs.targetId ?? null, qs.from ?? null, qs.to ?? null, qs.before ?? null, qs.limit],
      )
    ).rows;
    return { scope, events: await maskPrivateTitles(s, user, rows), nextCursor: rows.length === qs.limit ? rows[rows.length - 1].id : null };
  });

  app.get('/api/v1/audit/verify', async (req) => {
    const user = requireUser(req);
    if (!canReadAudit(user)) throw forbidden();
    return verifyAuditChain(s.db);
  });

  // ---- API tokens for integrations
  app.get('/api/v1/me/tokens', async (req) => {
    const user = requireUser(req);
    const r = await s.db.query(`select id, name, created_at, expires_at, last_used_at from api_tokens where user_id = $1 and revoked_at is null order by created_at desc`, [user.id]);
    return { tokens: r.rows.map((t) => ({ ...t, expired: !!t.expires_at && new Date(t.expires_at) <= new Date() })) };
  });

  app.delete('/api/v1/me/tokens/:id', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    await tx(s.db, async (q) => {
      const r = await q.query(`update api_tokens set revoked_at = now() where id = $1 and user_id = $2 and revoked_at is null returning name`, [id, user.id]);
      if (!r.rowCount) throw notFound();
      await audit(q, actorOf(req), { action: 'api_token.revoke', targetType: 'user', targetId: user.id, details: { name: r.rows[0].name } });
    });
    return { ok: true };
  });

  app.post('/api/v1/me/tokens', async (req) => {
    const user = requireUser(req);
    if (user.kind === 'guest') throw forbidden();
    const body = parse(z.object({ name: z.string().min(1).max(100), expiresInDays: z.number().int().min(1).max(365).default(90) }), req.body);
    const token = 'kb_' + randomToken(32);
    await tx(s.db, async (q) => {
      await q.query(`insert into api_tokens (user_id, name, token_hash, expires_at) values ($1, $2, $3, now() + make_interval(days => $4))`, [user.id, body.name, sha256(token), body.expiresInDays]);
      await audit(q, actorOf(req), { action: 'api_token.create', targetType: 'user', targetId: user.id, details: { name: body.name } });
    });
    return { token };
  });

  // Dev/test helper kept out of production builds.
  if (s.cfg.env !== 'production') {
    app.post('/api/v1/__test/set-password', async (req) => {
      const admin = requireUser(req);
      if (!isOrgAdmin(admin)) throw forbidden();
      const body = parse(z.object({ userId: uuid, password: z.string().min(1) }), req.body);
      await s.db.query(`update users set password_hash = $2, status = case when status = 'invited' then 'active' else status end where id = $1 and org_id = $3`, [body.userId, await hashPassword(body.password), admin.orgId]);
      return { ok: true };
    });
  }
}

const TITLE_KEYS = new Set(['title', 'name', 'titles', 'pageTitle', 'spaceName', 'oldTitle', 'newTitle']);

/**
 * Audit readers (auditors, admins) must not learn the content of material they cannot open: titles and names
 * of pages / spaces the viewer has no access to are masked in event details. The event itself stays visible.
 */
export async function maskPrivateTitles(s: Services, user: AuthUser, rows: any[]) {
  const pageIds = [...new Set(rows.filter((r) => r.target_type === 'page' && /^[0-9a-f-]{36}$/i.test(r.target_id ?? '')).map((r) => r.target_id as string))];
  const spaceIds = [...new Set(rows.filter((r) => r.target_type === 'space' && /^[0-9a-f-]{36}$/i.test(r.target_id ?? '')).map((r) => r.target_id as string))];
  const pages = pageIds.length ? await accessForPages(s.db, user, pageIds) : new Map();
  const spaces = spaceIds.length ? await accessForSpaces(s.db, user, spaceIds) : new Map();
  const spaceRows = spaceIds.length ? (await s.db.query(`select id, visibility, kind, deleted_at from spaces where id = any($1::uuid[])`, [spaceIds])).rows : [];
  const spaceMeta = new Map(spaceRows.map((r) => [r.id as string, r]));
  // Purged pages / spaces no longer exist: their names are history, not content, and stay readable in the log.
  const existingPages = new Set(pageIds.length ? (await s.db.query('select id from pages where id = any($1::uuid[])', [pageIds])).rows.map((r) => r.id as string) : []);
  return rows.map((r) => {
    let hidden = false;
    if (r.target_type === 'page') hidden = existingPages.has(r.target_id) && !pages.get(r.target_id)?.actions.view;
    else if (r.target_type === 'space') {
      const m = spaceMeta.get(r.target_id);
      const nameVisible = !!m && m.kind !== 'personal' && (m.visibility === 'open' || m.visibility === 'closed') && user.kind === 'employee';
      // Trashed spaces are not evaluated by the ACL engine: only organisation administrators see their names.
      const canView = m?.deleted_at ? isOrgAdmin(user) : !!spaces.get(r.target_id)?.actions.view;
      hidden = !!m && !canView && !nameVisible;
    }
    if (!hidden || !r.details || typeof r.details !== 'object') return r;
    const details: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r.details)) details[k] = TITLE_KEYS.has(k) && v != null ? '(скрыто)' : v;
    return { ...r, details, masked: true };
  });
}
