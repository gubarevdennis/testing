import { LEVEL_RANK, type Level } from '@kb/shared';
import type { Tx, Queryable } from '../db/pool.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { audit, type AuditActor } from './audit.js';
import { bumpAclEpoch, pageAudience, previewGrantAudience, requirePage, requireSpace, type AuthUser } from '../acl/engine.js';
import { orgSettings } from './org.js';

export interface GrantInput {
  resourceType: 'space' | 'page';
  resourceId: string;
  subjectType: 'user' | 'group' | 'org';
  subjectId: string | null;
  level: Level;
  canExport?: boolean | null;
  canDownload?: boolean | null;
  canShare?: boolean | null;
  canPublish?: boolean | null;
  startsAt?: string | null;
  expiresAt?: string | null;
  reason?: string | null;
  /** IANA time zone the dates were entered in (shown back to people in other zones, R-ACL-036). */
  timeZone?: string | null;
  /** Required when the change widens the audience to the whole organisation. */
  confirmWiden?: boolean;
}

async function requireShare(q: Queryable, user: AuthUser, resourceType: 'space' | 'page', resourceId: string) {
  if (resourceType === 'space') return requireSpace(q, user, resourceId, 'share');
  return requirePage(q, user, resourceId, 'share');
}

/** Creates or replaces the active grant for (resource, subject). Previous grant is revoked (history kept). */
export async function setGrant(q: Tx, user: AuthUser, actor: AuditActor, input: GrantInput) {
  const acc = await requireShare(q, user, input.resourceType, input.resourceId);
  if (input.subjectType === 'org' && input.subjectId) throw badRequest('Для всей организации subjectId не указывается');
  if (input.subjectType !== 'org' && !input.subjectId) throw badRequest('Не указан получатель доступа');
  if (acc.level !== 'full' && LEVEL_RANK[input.level] > LEVEL_RANK[acc.level]) throw forbidden('Нельзя выдать уровень доступа выше собственного');
  if (input.expiresAt && new Date(input.expiresAt) <= new Date()) throw badRequest('Срок действия должен быть в будущем');
  if (input.startsAt && input.expiresAt && new Date(input.startsAt) >= new Date(input.expiresAt)) throw badRequest('Начало действия должно быть раньше окончания');
  const resourceOrg = input.resourceType === 'space'
    ? (await q.query('select org_id, kind from spaces where id = $1', [input.resourceId])).rows[0]
    : (await q.query('select p.org_id, s.kind from pages p join spaces s on s.id = p.space_id where p.id = $1', [input.resourceId])).rows[0];
  if (!resourceOrg || resourceOrg.org_id !== user.orgId) throw notFound();
  if (input.resourceType === 'space' && resourceOrg.kind === 'personal') throw badRequest('Доступ к личному пространству целиком не выдаётся — поделитесь отдельной страницей');
  if (input.subjectType === 'user') {
    const target = (await q.query('select kind, status, org_id from users where id = $1', [input.subjectId])).rows[0];
    if (!target || target.org_id !== user.orgId) throw notFound('Пользователь не найден');
    if (target.kind === 'guest') {
      const settings = await orgSettings(q, user.orgId);
      if (!settings.guestsEnabled) throw forbidden('Гостевой доступ отключён политикой организации');
      if (!acc.policy.allowGuests) throw forbidden('Политика пространства запрещает гостевой доступ');
      if (LEVEL_RANK[input.level] > LEVEL_RANK.edit) throw forbidden('Гостю нельзя выдать полный доступ');
    }
  }
  if (input.subjectType === 'group') {
    const g = (await q.query('select org_id from groups where id = $1 and deleted_at is null', [input.subjectId])).rows[0];
    if (!g || g.org_id !== user.orgId) throw notFound('Группа не найдена');
  }
  const before = input.resourceType === 'page' ? await pageAudience(q, input.resourceId) : null;
  if (input.subjectType === 'org' && input.level !== 'none' && !input.confirmWiden) {
    const had = (before ?? []).some((e) => e.subjectType === 'org' && LEVEL_RANK[e.level] >= LEVEL_RANK[input.level]);
    if (!had) {
      // The confirmation dialog shows who exactly would newly gain access.
      const preview = await previewGrantAudience(q, user.orgId, { type: input.resourceType, id: input.resourceId }, input);
      throw conflict('audience_change', 'Доступ будет открыт всей организации — требуется подтверждение', { widens: true, preview });
    }
  }
  const prev = await q.query(
    `update grants set revoked_at = now(), revoked_by = $5
      where resource_type = $1 and resource_id = $2 and subject_type = $3 and subject_id is not distinct from $4 and revoked_at is null returning *`,
    [input.resourceType, input.resourceId, input.subjectType, input.subjectId, user.id],
  );
  const g = (
    await q.query(
      `insert into grants (org_id, resource_type, resource_id, subject_type, subject_id, level, can_export, can_download, can_share, can_publish, starts_at, expires_at, reason, granted_by, time_zone)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) returning *`,
      [user.orgId, input.resourceType, input.resourceId, input.subjectType, input.subjectId, input.level, input.canExport ?? null, input.canDownload ?? null, input.canShare ?? null, input.canPublish ?? null, input.startsAt ?? null, input.expiresAt ?? null, input.reason ?? null, user.id, input.timeZone ?? null],
    )
  ).rows[0];
  await audit(q, actor, {
    action: prev.rowCount ? 'grant.update' : 'grant.create',
    targetType: input.resourceType,
    targetId: input.resourceId,
    details: { subjectType: input.subjectType, subjectId: input.subjectId, level: input.level, previousLevel: prev.rows[0]?.level ?? null, startsAt: input.startsAt ?? null, expiresAt: input.expiresAt ?? null, timeZone: input.timeZone ?? null, reason: input.reason ?? null, flags: { export: input.canExport ?? null, download: input.canDownload ?? null, share: input.canShare ?? null, publish: input.canPublish ?? null } },
  });
  await bumpAclEpoch(q, user.orgId);
  return g;
}

export async function revokeGrant(q: Tx, user: AuthUser, actor: AuditActor, grantId: string) {
  const g = (await q.query('select * from grants where id = $1 and revoked_at is null', [grantId])).rows[0];
  if (!g || g.org_id !== user.orgId) throw notFound('Разрешение не найдено');
  await requireShare(q, user, g.resource_type, g.resource_id);
  if (g.resource_type === 'space' && g.subject_type === 'user' && g.subject_id === user.id && g.level === 'full') {
    const others = await q.query(`select count(*)::int c from grants where resource_type = 'space' and resource_id = $1 and level = 'full' and revoked_at is null and id <> $2`, [g.resource_id, g.id]);
    if (!others.rows[0].c) throw conflict('last_manager', 'Нельзя отозвать последний полный доступ к пространству');
  }
  await q.query('update grants set revoked_at = now(), revoked_by = $2 where id = $1', [grantId, user.id]);
  await audit(q, actor, { action: 'grant.revoke', targetType: g.resource_type, targetId: g.resource_id, details: { grantId, subjectType: g.subject_type, subjectId: g.subject_id, level: g.level } });
  await bumpAclEpoch(q, user.orgId);
}

/** Toggles inheritance on a page. Breaking inheritance copies the current effective audience as explicit grants so nobody silently gains access. */
export async function setInheritance(q: Tx, user: AuthUser, actor: AuditActor, pageId: string, inherit: boolean) {
  await requirePage(q, user, pageId, 'share');
  const page = (await q.query('select inherit_permissions, org_id from pages where id = $1', [pageId])).rows[0];
  if (page.inherit_permissions === inherit) return;
  if (!inherit) {
    const audienceNow = await pageAudience(q, pageId);
    const best = new Map<string, { subjectType: string; subjectId: string | null; level: Level }>();
    for (const e of audienceNow) {
      if (e.via === 'direct') continue;
      const k = e.subjectType + ':' + (e.subjectId ?? '');
      const cur = best.get(k);
      if (!cur || LEVEL_RANK[e.level] > LEVEL_RANK[cur.level] || e.level === 'none') best.set(k, { subjectType: e.subjectType, subjectId: e.subjectId, level: e.level });
    }
    for (const b of best.values()) {
      const exists = await q.query(`select 1 from grants where resource_type = 'page' and resource_id = $1 and subject_type = $2 and subject_id is not distinct from $3 and revoked_at is null`, [pageId, b.subjectType, b.subjectId]);
      if (!exists.rowCount)
        await q.query(`insert into grants (org_id, resource_type, resource_id, subject_type, subject_id, level, granted_by, reason) values ($1, 'page', $2, $3, $4, $5, $6, 'copied when inheritance was disabled')`, [
          page.org_id,
          pageId,
          b.subjectType,
          b.subjectId,
          b.level,
          user.id,
        ]);
    }
    // The person restricting the page keeps full control.
    const own = await q.query(`select id from grants where resource_type = 'page' and resource_id = $1 and subject_type = 'user' and subject_id = $2 and revoked_at is null`, [pageId, user.id]);
    if (own.rowCount) await q.query(`update grants set level = 'full' where id = $1`, [own.rows[0].id]);
    else
      await q.query(`insert into grants (org_id, resource_type, resource_id, subject_type, subject_id, level, granted_by, reason) values ($1, 'page', $2, 'user', $3, 'full', $3, 'restricted by')`, [page.org_id, pageId, user.id]);
  }
  await q.query('update pages set inherit_permissions = $2, version = version + 1 where id = $1', [pageId, inherit]);
  await audit(q, actor, { action: inherit ? 'page.inherit.enable' : 'page.inherit.disable', targetType: 'page', targetId: pageId });
  await bumpAclEpoch(q, user.orgId);
}
