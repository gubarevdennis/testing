import type { Queryable, Tx } from '../db/pool.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { audit, type AuditActor } from './audit.js';
import { hashPassword, passwordProblems } from '../auth/passwords.js';
import { revokeUserSessions } from '../auth/sessions.js';
import { bumpAclEpoch, canManagePeople, isOrgAdmin, type AuthUser } from '../acl/engine.js';
import { DEFAULT_APPEARANCE, DEFAULT_SPACE_POLICY, keyBetween, resolveAppearance, type Level, type SpaceKind, type SpaceVisibility } from '@kb/shared';

export const DEFAULT_ORG_SETTINGS = {
  requireMfa: false,
  guestsEnabled: true,
  publicLinksEnabled: false,
  ssoOnly: false,
  oidcJitProvisioning: false,
  retention: { trashDays: 90, journalDays: 90, revisionDays: 365 },
  quotaPerUserMb: 2048,
  /** Default visual preset, content font and size for everyone in the organisation (item 7). */
  appearance: { ...DEFAULT_APPEARANCE },
};

export async function orgSettings(q: Queryable, orgId: string) {
  const r = await q.query('select settings from organizations where id = $1', [orgId]);
  const stored = r.rows[0]?.settings ?? {};
  return { ...DEFAULT_ORG_SETTINGS, ...stored, appearance: resolveAppearance(stored.appearance) };
}

export interface BootstrapInput {
  orgName: string;
  slug: string;
  ownerEmail: string;
  ownerName: string;
  password: string;
}

/** Creates an organisation with its owner, the owner's personal space and a company-wide space. */
export async function bootstrapOrg(q: Tx, input: BootstrapInput) {
  const problem = passwordProblems(input.password);
  if (problem) throw badRequest(problem);
  const org = (await q.query('insert into organizations (name, slug, settings) values ($1, $2, $3) returning *', [input.orgName, input.slug, DEFAULT_ORG_SETTINGS])).rows[0];
  const owner = (
    await q.query(`insert into users (org_id, email, name, kind, org_role, status, password_hash) values ($1, $2, $3, 'employee', 'owner', 'active', $4) returning *`, [
      org.id,
      input.ownerEmail.trim().toLowerCase(),
      input.ownerName,
      await hashPassword(input.password),
    ])
  ).rows[0];
  const actor: AuditActor = { orgId: org.id, userId: owner.id, name: owner.name };
  await audit(q, actor, { action: 'org.bootstrap', targetType: 'org', targetId: org.id, details: { name: input.orgName } });
  await ensurePersonalSpace(q, owner);
  const { installBuiltinTemplates } = await import('../routes/templates.js');
  await installBuiltinTemplates(q, org.id);
  const ownerAuth = { id: owner.id, orgId: org.id, name: owner.name, email: owner.email, kind: 'employee' as const, orgRole: 'owner' as const, status: 'active' };
  await createSpace(q, ownerAuth, actor, { name: 'Общее', description: 'Пространство для всей компании', kind: 'org', visibility: 'open', icon: '🏢', orgLevel: 'view' });
  return { org, owner };
}

export async function ensurePersonalSpace(q: Queryable, user: { id: string; org_id?: string; orgId?: string; name: string; kind?: string }) {
  const orgId = user.org_id ?? user.orgId!;
  if (user.kind === 'guest') return null;
  const existing = await q.query(`select * from spaces where kind = 'personal' and owner_user_id = $1`, [user.id]);
  if (existing.rows[0]) return existing.rows[0];
  const sp = (
    await q.query(
      `insert into spaces (org_id, name, description, icon, kind, visibility, owner_user_id, settings, created_by)
       values ($1, 'Моё пространство', 'Личные заметки и черновики — видны только вам', '🔒', 'personal', 'private', $2, $3, $2) returning *`,
      [orgId, user.id, { policy: { ...DEFAULT_SPACE_POLICY } }],
    )
  ).rows[0];
  await q.query(`insert into grants (org_id, resource_type, resource_id, subject_type, subject_id, level, reason) values ($1, 'space', $2, 'user', $3, 'full', 'personal space owner')`, [orgId, sp.id, user.id]);
  return sp;
}

export interface CreateSpaceInput {
  name: string;
  description?: string;
  icon?: string | null;
  kind: SpaceKind;
  visibility: SpaceVisibility;
  /** Level granted to all employees (org subject). */
  orgLevel?: Level | null;
  groups?: Array<{ groupId: string; level: Level }>;
  users?: Array<{ userId: string; level: Level }>;
  policy?: Partial<typeof DEFAULT_SPACE_POLICY>;
}

export async function createSpace(q: Tx, user: AuthUser, actor: AuditActor, input: CreateSpaceInput) {
  if (input.kind === 'personal') throw badRequest('Личное пространство создаётся автоматически');
  if (!isOrgAdmin(user) && user.kind !== 'employee') throw forbidden('Гости не могут создавать пространства');
  if (!input.name?.trim()) throw badRequest('Укажите название пространства');
  const last = await q.query(`select sort_key from spaces where org_id = $1 and kind <> 'personal' order by sort_key collate "C" desc limit 1`, [user.orgId]);
  const sp = (
    await q.query(
      `insert into spaces (org_id, name, description, icon, kind, visibility, settings, created_by, sort_key) values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning *`,
      [user.orgId, input.name.trim(), input.description ?? '', input.icon ?? null, input.kind, input.visibility, { policy: { ...DEFAULT_SPACE_POLICY, ...(input.policy ?? {}) } }, user.id, keyBetween(last.rows[0]?.sort_key ?? null, null)],
    )
  ).rows[0];
  const grant = (subjectType: string, subjectId: string | null, level: Level, reason: string) =>
    q.query(`insert into grants (org_id, resource_type, resource_id, subject_type, subject_id, level, granted_by, reason) values ($1, 'space', $2, $3, $4, $5, $6, $7)`, [
      user.orgId,
      sp.id,
      subjectType,
      subjectId,
      level,
      user.id,
      reason,
    ]);
  await grant('user', user.id, 'full', 'space creator');
  const orgLevel = input.orgLevel ?? (input.visibility === 'open' ? 'view' : null);
  if (orgLevel && orgLevel !== 'none') await grant('org', null, orgLevel, 'space visibility: all employees');
  for (const g of input.groups ?? []) await grant('group', g.groupId, g.level, 'space members');
  for (const u of input.users ?? []) if (u.userId !== user.id) await grant('user', u.userId, u.level, 'space members');
  await audit(q, actor, { action: 'space.create', targetType: 'space', targetId: sp.id, details: { name: sp.name, kind: sp.kind, visibility: sp.visibility, orgLevel, groups: input.groups ?? [], users: input.users ?? [] } });
  await bumpAclEpoch(q, user.orgId);
  return sp;
}

export interface CreateUserInput {
  email: string;
  name: string;
  kind: 'employee' | 'guest';
  orgRole?: 'admin' | 'people_admin' | 'auditor' | 'member';
  password?: string | null;
  groupIds?: string[];
  primaryGroupId?: string | null;
  managerId?: string | null;
  title?: string | null;
  accessExpiresAt?: string | null;
}

export async function createUser(q: Tx, admin: AuthUser, actor: AuditActor, input: CreateUserInput) {
  if (!canManagePeople(admin)) throw forbidden('Нет права управлять сотрудниками');
  if ((input.orgRole === 'admin' || input.orgRole === 'people_admin' || input.orgRole === 'auditor') && admin.orgRole !== 'owner' && admin.orgRole !== 'admin')
    throw forbidden('Только администратор может назначать административные роли');
  const settings = await orgSettings(q, admin.orgId);
  if (input.kind === 'guest' && !settings.guestsEnabled) throw forbidden('Гостевой доступ отключён политикой организации');
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw badRequest('Некорректный email');
  const dup = await q.query('select id from users where org_id = $1 and lower(email) = $2', [admin.orgId, email]);
  if (dup.rowCount) throw conflict('email_taken', 'Пользователь с таким email уже существует');
  if (input.password) {
    const p = passwordProblems(input.password);
    if (p) throw badRequest(p);
  }
  const role = input.kind === 'guest' ? 'member' : input.orgRole ?? 'member';
  const u = (
    await q.query(
      `insert into users (org_id, email, name, kind, org_role, status, password_hash, manager_id, title, access_expires_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning *`,
      [admin.orgId, email, input.name.trim(), input.kind, role, input.password ? 'active' : 'invited', input.password ? await hashPassword(input.password) : null, input.managerId ?? null, input.title ?? null, input.accessExpiresAt ?? null],
    )
  ).rows[0];
  for (const gid of input.groupIds ?? []) await addGroupMember(q, admin, actor, gid, u.id, { silentAudit: true });
  if (input.primaryGroupId) await q.query('update users set primary_group_id = $2 where id = $1', [u.id, input.primaryGroupId]);
  await ensurePersonalSpace(q, u);
  await audit(q, actor, { action: 'user.create', targetType: 'user', targetId: u.id, details: { email, kind: input.kind, orgRole: role, groups: input.groupIds ?? [], accessExpiresAt: input.accessExpiresAt ?? null } });
  await bumpAclEpoch(q, admin.orgId);
  return u;
}

export async function addGroupMember(q: Tx, admin: AuthUser, actor: AuditActor, groupId: string, userId: string, opts: { role?: 'member' | 'manager'; expiresAt?: string | null; silentAudit?: boolean } = {}) {
  const g = (await q.query('select * from groups where id = $1 and org_id = $2 and deleted_at is null', [groupId, admin.orgId])).rows[0];
  if (!g) throw notFound('Группа не найдена');
  if (!canManagePeople(admin) && !(await isGroupManager(q, admin.id, groupId))) throw forbidden('Нет права изменять состав группы');
  const u = (await q.query('select kind from users where id = $1 and org_id = $2', [userId, admin.orgId])).rows[0];
  if (!u) throw notFound('Пользователь не найден');
  if (u.kind === 'guest' && g.kind === 'department') throw badRequest('Гостя нельзя добавить в подразделение');
  await q.query(
    `insert into group_members (group_id, user_id, role, added_by, expires_at) values ($1, $2, $3, $4, $5)
     on conflict (group_id, user_id) do update set role = excluded.role, expires_at = excluded.expires_at`,
    [groupId, userId, opts.role ?? 'member', admin.id, opts.expiresAt ?? null],
  );
  if (!opts.silentAudit) await audit(q, actor, { action: 'group.member.add', targetType: 'group', targetId: groupId, details: { userId, role: opts.role ?? 'member', expiresAt: opts.expiresAt ?? null } });
  await bumpAclEpoch(q, admin.orgId);
}

export async function removeGroupMember(q: Tx, admin: AuthUser, actor: AuditActor, groupId: string, userId: string) {
  if (!canManagePeople(admin) && !(await isGroupManager(q, admin.id, groupId))) throw forbidden('Нет права изменять состав группы');
  const r = await q.query('delete from group_members where group_id = $1 and user_id = $2', [groupId, userId]);
  if (!r.rowCount) throw notFound('Участник не найден');
  await audit(q, actor, { action: 'group.member.remove', targetType: 'group', targetId: groupId, details: { userId } });
  await bumpAclEpoch(q, admin.orgId);
}

export async function isGroupManager(q: Queryable, userId: string, groupId: string): Promise<boolean> {
  const r = await q.query(
    `with recursive up as (select id, parent_id, manager_id from groups where id = $2
       union select g.id, g.parent_id, g.manager_id from groups g join up on up.parent_id = g.id)
     select 1 from up where manager_id = $1
     union select 1 from group_members where group_id = $2 and user_id = $1 and role = 'manager'`,
    [userId, groupId],
  );
  return !!r.rowCount;
}

/** Suspends (reversible) or deactivates a user; revokes sessions, tokens and time-limited grants. */
export async function setUserStatus(q: Tx, admin: AuthUser, actor: AuditActor, userId: string, status: 'active' | 'suspended' | 'deactivated', reason: string) {
  if (!canManagePeople(admin)) throw forbidden('Нет права управлять сотрудниками');
  const u = (await q.query('select * from users where id = $1 and org_id = $2', [userId, admin.orgId])).rows[0];
  if (!u) throw notFound('Пользователь не найден');
  if (u.org_role === 'owner' && status !== 'active') {
    const owners = await q.query(`select count(*)::int c from users where org_id = $1 and org_role = 'owner' and status = 'active'`, [admin.orgId]);
    if (owners.rows[0].c <= 1) throw conflict('last_owner', 'Нельзя отключить единственного владельца организации');
  }
  if (userId === admin.id && status !== 'active') throw badRequest('Нельзя отключить собственную учётную запись');
  await q.query('update users set status = $2, updated_at = now() where id = $1', [userId, status]);
  let revokedGrants = 0;
  if (status !== 'active') {
    await revokeUserSessions(q, userId, status);
    await q.query(`update invitations set revoked_at = now() where user_id = $1 and accepted_at is null and revoked_at is null`, [userId]);
    if (status === 'deactivated') {
      const r = await q.query(`update grants set revoked_at = now(), revoked_by = $2 where subject_type = 'user' and subject_id = $1 and revoked_at is null and expires_at is not null`, [userId, admin.id]);
      revokedGrants = r.rowCount ?? 0;
    }
  }
  await audit(q, actor, { action: `user.${status === 'active' ? 'reactivate' : status === 'suspended' ? 'suspend' : 'deactivate'}`, targetType: 'user', targetId: userId, details: { reason, revokedTemporaryGrants: revokedGrants } });
  await bumpAclEpoch(q, admin.orgId);
}

/** Transfers ownership of a departing user's documents (outside the personal space) to another user. */
export async function transferOwnership(q: Tx, admin: AuthUser, actor: AuditActor, fromUserId: string, toUserId: string) {
  if (!canManagePeople(admin)) throw forbidden();
  const r = await q.query(
    `update pages p set owner_id = $2 from spaces s where s.id = p.space_id and s.kind <> 'personal' and p.owner_id = $1 and p.org_id = $3`,
    [fromUserId, toUserId, admin.orgId],
  );
  await audit(q, actor, { action: 'user.transfer_ownership', targetType: 'user', targetId: fromUserId, details: { toUserId, pages: r.rowCount } });
  return r.rowCount ?? 0;
}

export async function createGroup(q: Tx, admin: AuthUser, actor: AuditActor, input: { name: string; description?: string; kind: 'department' | 'group'; parentId?: string | null; managerId?: string | null }) {
  if (!canManagePeople(admin)) throw forbidden('Нет права управлять группами');
  if (!input.name?.trim()) throw badRequest('Укажите название');
  if (input.parentId) {
    const p = (await q.query('select kind from groups where id = $1 and org_id = $2 and deleted_at is null', [input.parentId, admin.orgId])).rows[0];
    if (!p) throw notFound('Родительское подразделение не найдено');
  }
  const g = (
    await q.query(`insert into groups (org_id, name, description, kind, parent_id, manager_id, created_by) values ($1, $2, $3, $4, $5, $6, $7) returning *`, [
      admin.orgId,
      input.name.trim(),
      input.description ?? '',
      input.kind,
      input.parentId ?? null,
      input.managerId ?? null,
      admin.id,
    ])
  ).rows[0];
  await audit(q, actor, { action: 'group.create', targetType: 'group', targetId: g.id, details: input });
  return g;
}

/**
 * Deleting a group never deletes users or pages. While the group still carries rights or is somebody's primary
 * department, deletion is refused (409 group_in_use, with the affected grants) until the caller either reassigns
 * them to another group (`reassignTo`) or explicitly confirms their revocation (`confirm`). Everything is audited.
 */
export async function deleteGroup(q: Tx, admin: AuthUser, actor: AuditActor, groupId: string, opts: { confirm?: boolean; reassignTo?: string | null } = {}) {
  if (!canManagePeople(admin)) throw forbidden();
  const g = (await q.query('select * from groups where id = $1 and org_id = $2 and deleted_at is null for update', [groupId, admin.orgId])).rows[0];
  if (!g) throw notFound();
  const children = await q.query('select count(*)::int c from groups where parent_id = $1 and deleted_at is null', [groupId]);
  if (children.rows[0].c) throw conflict('group_has_children', 'Сначала перенесите или удалите вложенные подразделения');
  const active = (
    await q.query(
      `select gr.id, gr.resource_type, gr.resource_id, gr.level, gr.expires_at, coalesce(p.title, sp.name) as resource_name
         from grants gr left join pages p on gr.resource_type = 'page' and p.id = gr.resource_id left join spaces sp on gr.resource_type = 'space' and sp.id = gr.resource_id
        where gr.subject_type = 'group' and gr.subject_id = $1 and gr.revoked_at is null order by gr.created_at`,
      [groupId],
    )
  ).rows;
  const primary = (await q.query('select count(*)::int c from users where primary_group_id = $1', [groupId])).rows[0].c as number;
  const members = (await q.query('select count(*)::int c from group_members where group_id = $1', [groupId])).rows[0].c as number;
  if (opts.reassignTo === groupId) throw badRequest('Нельзя переназначить права на удаляемую группу');
  let target: any = null;
  if (opts.reassignTo) {
    target = (await q.query('select * from groups where id = $1 and org_id = $2 and deleted_at is null', [opts.reassignTo, admin.orgId])).rows[0];
    if (!target) throw notFound('Группа для переназначения не найдена');
  }
  if ((active.length || primary) && !opts.confirm && !target)
    throw conflict('group_in_use', 'Группе выданы права или она является основным отделом сотрудников — переназначьте их или подтвердите отзыв', {
      grants: active.map((x) => ({ id: x.id, resourceType: x.resource_type, resourceId: x.resource_id, resourceName: x.resource_name, level: x.level, expiresAt: x.expires_at })),
      primaryMembers: primary,
      members,
    });
  const reassigned: string[] = [];
  if (target) {
    for (const x of active) {
      // Keep the stronger of the two grants for the target group; never weaken what it already has.
      const ex = (await q.query(`select id, level from grants where resource_type = $1 and resource_id = $2 and subject_type = 'group' and subject_id = $3 and revoked_at is null`, [x.resource_type, x.resource_id, target.id])).rows[0];
      const rank: Record<string, number> = { none: 0, view: 1, comment: 2, edit: 3, full: 4 };
      if (ex && (ex.level === 'none' || rank[ex.level] >= rank[x.level])) continue;
      if (ex) await q.query('update grants set revoked_at = now(), revoked_by = $2 where id = $1', [ex.id, admin.id]);
      await q.query(
        `insert into grants (org_id, resource_type, resource_id, subject_type, subject_id, level, can_export, can_download, can_share, can_publish, starts_at, expires_at, reason, granted_by)
         select org_id, resource_type, resource_id, 'group', $2, level, can_export, can_download, can_share, can_publish, starts_at, expires_at, $3, $4 from grants where id = $1`,
        [x.id, target.id, `reassigned from deleted group ${g.name}`, admin.id],
      );
      reassigned.push(x.id);
    }
    await q.query('update users set primary_group_id = $2 where primary_group_id = $1', [groupId, target.kind === 'department' ? target.id : null]);
  }
  const revoked = await q.query(`update grants set revoked_at = now(), revoked_by = $2 where subject_type = 'group' and subject_id = $1 and revoked_at is null returning id, resource_type, resource_id, level`, [groupId, admin.id]);
  await q.query('update groups set deleted_at = now() where id = $1', [groupId]);
  await q.query('update users set primary_group_id = null where primary_group_id = $1', [groupId]);
  await q.query('delete from group_members where group_id = $1', [groupId]);
  await audit(q, actor, { action: 'group.delete', targetType: 'group', targetId: groupId, details: { name: g.name, revokedGrants: revoked.rows, reassignedTo: target?.id ?? null, reassignedGrants: reassigned.length, primaryMembers: primary, members } });
  await bumpAclEpoch(q, admin.orgId);
}

