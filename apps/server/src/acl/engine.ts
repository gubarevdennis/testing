import {
  ACTIONS,
  DEFAULT_SPACE_POLICY,
  LEVEL_RANK,
  actionsFor,
  type AccessSource,
  type Action,
  type EffectiveAccess,
  type GrantFlags,
  type Level,
  type SpacePolicy,
} from '@kb/shared';
import type { Queryable } from '../db/pool.js';
import { forbidden, notFound } from '../lib/errors.js';

export interface AuthUser {
  id: string;
  orgId: string;
  name: string;
  email: string;
  kind: 'employee' | 'guest';
  orgRole: 'owner' | 'admin' | 'people_admin' | 'auditor' | 'member';
  status: string;
}

export interface Subjects {
  userId: string;
  groupIds: string[];
  employee: boolean;
}

/** Groups a user belongs to, including parent departments of the departments they are in. */
export async function userSubjects(q: Queryable, user: Pick<AuthUser, 'id' | 'kind'>): Promise<Subjects> {
  const r = await q.query(
    `with recursive direct as (
       select g.id, g.parent_id, g.kind from group_members gm join groups g on g.id = gm.group_id
        where gm.user_id = $1 and g.deleted_at is null and (gm.expires_at is null or gm.expires_at > now())
     ), up as (
       select id, parent_id, kind from direct
       union
       select g.id, g.parent_id, g.kind from groups g join up on up.parent_id = g.id
        where up.kind = 'department' and g.kind = 'department' and g.deleted_at is null
     ) select distinct id from up`,
    [user.id],
  );
  return { userId: user.id, groupIds: r.rows.map((x) => x.id), employee: user.kind === 'employee' };
}

interface GrantRow {
  id: string;
  target_page: string;
  resource_type: 'space' | 'page';
  resource_id: string;
  subject_type: 'user' | 'group' | 'org';
  subject_id: string | null;
  level: Level;
  can_export: boolean | null;
  can_download: boolean | null;
  can_share: boolean | null;
  can_publish: boolean | null;
  starts_at: Date | null;
  expires_at: Date | null;
  depth: number | null;
}

export interface PageAccess extends EffectiveAccess {
  pageId: string;
  spaceId: string;
  spaceKind: string;
  policy: SpacePolicy;
  deleted: boolean;
}

/**
 * Grants applicable to each page considering inheritance:
 * page grants on ancestors-or-self up to the nearest page with inherit_permissions = false (inclusive),
 * plus space grants when no such boundary exists.
 */
const APPLICABLE_GRANTS_SQL = `
  with pg as (
    select p.id, p.space_id from pages p where p.id = any($1::uuid[])
  ), anc as (
    select a.page_id, a.ancestor_id, a.depth, ap.inherit_permissions
      from page_ancestors a join pages ap on ap.id = a.ancestor_id
     where a.page_id in (select id from pg)
  ), bnd as (
    select page_id, min(depth) d from anc where not inherit_permissions group by page_id
  )
  select anc.page_id as target_page, anc.depth, g.*
    from anc left join bnd on bnd.page_id = anc.page_id
    join grants g on g.resource_type = 'page' and g.resource_id = anc.ancestor_id and g.revoked_at is null
   where anc.depth <= coalesce(bnd.d, 2147483647)
  union all
  select pg.id as target_page, null as depth, g.*
    from pg left join bnd on bnd.page_id = pg.id
    join grants g on g.resource_type = 'space' and g.resource_id = pg.space_id and g.revoked_at is null
   where bnd.d is null`;

function active(g: { starts_at: Date | null; expires_at: Date | null }, now: Date) {
  return (!g.starts_at || g.starts_at <= now) && (!g.expires_at || g.expires_at > now);
}

function matches(g: { subject_type: string; subject_id: string | null }, s: Subjects): boolean {
  if (g.subject_type === 'user') return g.subject_id === s.userId;
  if (g.subject_type === 'group') return s.groupIds.includes(g.subject_id!);
  return s.employee; // 'org' = all employees (never guests)
}

function viaOf(g: GrantRow): string {
  if (g.resource_type === 'space') return 'space';
  if (g.depth && g.depth > 0) return 'inherited-page';
  return g.subject_type === 'user' ? 'direct' : g.subject_type;
}

function toSource(g: GrantRow): AccessSource {
  return {
    grantId: g.id,
    resourceType: g.resource_type,
    resourceId: g.resource_id,
    subjectType: g.subject_type,
    subjectId: g.subject_id,
    level: g.level,
    expiresAt: g.expires_at ? g.expires_at.toISOString() : null,
    via: viaOf(g),
  };
}

/** Combines matching grants into an effective access record. Deny ('none') wins over any allow. */
export function combine(grants: GrantRow[], subjects: Subjects, policy: SpacePolicy, opts: { guest: boolean; personalOwner: boolean; now?: Date }): EffectiveAccess {
  const now = opts.now ?? new Date();
  const mine = grants.filter((g) => active(g, now) && matches(g, subjects));
  const denies = mine.filter((g) => g.level === 'none');
  const allows = mine.filter((g) => g.level !== 'none');
  let level: Level = 'none';
  const explanation: string[] = [];
  if (opts.personalOwner) {
    level = 'full';
    explanation.push('Владелец личного пространства');
  } else if (denies.length) {
    level = 'none';
    explanation.push('Явный запрет доступа имеет приоритет над разрешениями');
  } else {
    for (const g of allows) if (LEVEL_RANK[g.level] > LEVEL_RANK[level]) level = g.level;
  }
  if (opts.guest && !policy.allowGuests && !opts.personalOwner) {
    if (level !== 'none') explanation.push('Политика пространства запрещает гостевой доступ');
    level = 'none';
  }
  // Flags: grants are additive — a capability is available if any allowing grant at the effective level permits it.
  const top = allows.filter((g) => g.level === level);
  const flag = (k: 'can_export' | 'can_download' | 'can_share' | 'can_publish'): boolean | null => {
    if (!top.length) return null;
    if (top.some((g) => g[k] === true)) return true;
    if (top.every((g) => g[k] === false)) return false;
    return null;
  };
  const flags: GrantFlags = { canExport: flag('can_export'), canDownload: flag('can_download'), canShare: flag('can_share'), canPublish: flag('can_publish') };
  const actions = level === 'none' ? (Object.fromEntries(ACTIONS.map((a) => [a, false])) as Record<Action, boolean>) : actionsFor(level, flags, policy, { guest: opts.guest, personalOwner: opts.personalOwner });
  for (const g of allows) explanation.push(describe(g));
  return { level, actions, sources: allows.map(toSource), denies: denies.map(toSource), explanation };
}

function describe(g: GrantRow): string {
  const who = g.subject_type === 'user' ? 'лично' : g.subject_type === 'group' ? 'через группу/отдел' : 'как сотруднику организации';
  const where = g.resource_type === 'space' ? 'права пространства' : g.depth ? 'унаследовано от родительской страницы' : 'права страницы';
  return `${g.level}: ${who}, ${where}${g.expires_at ? ` (до ${g.expires_at.toISOString()})` : ''}`;
}

export function policyOf(settings: any): SpacePolicy {
  return { ...DEFAULT_SPACE_POLICY, ...(settings?.policy ?? {}) };
}

/** Effective access of `user` to many pages at once (used by tree, search, links, export). */
export async function accessForPages(q: Queryable, user: AuthUser, pageIds: string[], subjects?: Subjects): Promise<Map<string, PageAccess>> {
  const out = new Map<string, PageAccess>();
  if (!pageIds.length) return out;
  const s = subjects ?? (await userSubjects(q, user));
  const meta = await q.query(
    `select p.id, p.space_id, p.deleted_at, s.kind, s.owner_user_id, s.settings, s.deleted_at as space_deleted, p.org_id
       from pages p join spaces s on s.id = p.space_id where p.id = any($1::uuid[])`,
    [pageIds],
  );
  const grants = (await q.query(APPLICABLE_GRANTS_SQL, [pageIds])).rows as GrantRow[];
  const byPage = new Map<string, GrantRow[]>();
  for (const g of grants) {
    const list = byPage.get(g.target_page) ?? [];
    list.push(g);
    byPage.set(g.target_page, list);
  }
  for (const m of meta.rows) {
    if (m.org_id !== user.orgId) continue;
    const policy = policyOf(m.settings);
    const personalOwner = m.kind === 'personal' && m.owner_user_id === user.id;
    const eff = combine(byPage.get(m.id) ?? [], s, policy, { guest: user.kind === 'guest', personalOwner });
    out.set(m.id, { ...eff, pageId: m.id, spaceId: m.space_id, spaceKind: m.kind, policy, deleted: !!m.deleted_at || !!m.space_deleted });
  }
  return out;
}

export async function pageAccess(q: Queryable, user: AuthUser, pageId: string): Promise<PageAccess | null> {
  return (await accessForPages(q, user, [pageId])).get(pageId) ?? null;
}

/** Throws 404 (not 403) when the page is not viewable so existence is not revealed; 403 when viewable but action denied. */
export async function requirePage(q: Queryable, user: AuthUser, pageId: string, action: Action, opts: { allowDeleted?: boolean } = {}): Promise<PageAccess> {
  if (!/^[0-9a-f-]{36}$/i.test(pageId)) throw notFound();
  const acc = await pageAccess(q, user, pageId);
  if (!acc || !acc.actions.view) throw notFound();
  if (acc.deleted && !opts.allowDeleted) throw notFound('Страница удалена (находится в корзине)');
  if (!acc.actions[action]) throw forbidden(actionDenied(action));
  return acc;
}

export function actionDenied(action: Action): string {
  const m: Partial<Record<Action, string>> = {
    edit: 'Нет права на редактирование',
    comment: 'Нет права комментировать',
    create: 'Нет права создавать страницы здесь',
    manage_structure: 'Нет права изменять структуру',
    publish: 'Нет права публиковать',
    share: 'Нет права управлять доступом',
    export: 'Экспорт запрещён политикой или правами',
    download: 'Скачивание запрещено политикой или правами',
    restore: 'Нет права восстанавливать',
    delete: 'Нет права удалять',
    manage_space: 'Нет права управлять пространством',
  };
  return m[action] ?? 'Недостаточно прав';
}

export interface SpaceAccess extends EffectiveAccess {
  spaceId: string;
  kind: string;
  visibility: string;
  policy: SpacePolicy;
}

export async function accessForSpaces(q: Queryable, user: AuthUser, spaceIds?: string[], subjects?: Subjects): Promise<Map<string, SpaceAccess>> {
  const s = subjects ?? (await userSubjects(q, user));
  const spaces = await q.query(
    `select id, kind, visibility, owner_user_id, settings from spaces where org_id = $1 and deleted_at is null ${spaceIds ? 'and id = any($2::uuid[])' : ''}`,
    spaceIds ? [user.orgId, spaceIds] : [user.orgId],
  );
  const ids = spaces.rows.map((r) => r.id);
  const grants = ids.length
    ? ((await q.query(`select g.*, g.resource_id as target_page, null::int as depth from grants g where g.resource_type = 'space' and g.resource_id = any($1::uuid[]) and g.revoked_at is null`, [ids])).rows as GrantRow[])
    : [];
  const out = new Map<string, SpaceAccess>();
  for (const sp of spaces.rows) {
    const policy = policyOf(sp.settings);
    const personalOwner = sp.kind === 'personal' && sp.owner_user_id === user.id;
    const eff = combine(
      grants.filter((g) => g.resource_id === sp.id),
      s,
      policy,
      { guest: user.kind === 'guest', personalOwner },
    );
    out.set(sp.id, { ...eff, spaceId: sp.id, kind: sp.kind, visibility: sp.visibility, policy });
  }
  return out;
}

export async function requireSpace(q: Queryable, user: AuthUser, spaceId: string, action: Action): Promise<SpaceAccess> {
  if (!/^[0-9a-f-]{36}$/i.test(spaceId)) throw notFound();
  const acc = (await accessForSpaces(q, user, [spaceId])).get(spaceId);
  if (!acc || !acc.actions.view) throw notFound();
  if (!acc.actions[action]) throw forbidden(actionDenied(action));
  return acc;
}

/** Bumps the org ACL epoch; WebSocket sessions and caches re-validate on change. */
export async function bumpAclEpoch(q: Queryable, orgId: string): Promise<number> {
  const r = await q.query(
    `insert into acl_epoch (org_id, epoch) values ($1, 1) on conflict (org_id) do update set epoch = acl_epoch.epoch + 1 returning epoch`,
    [orgId],
  );
  return r.rows[0].epoch;
}

/** Org-level admin checks (never imply content access). */
export function isOrgAdmin(user: AuthUser) {
  return user.orgRole === 'owner' || user.orgRole === 'admin';
}
export function canManagePeople(user: AuthUser) {
  return isOrgAdmin(user) || user.orgRole === 'people_admin';
}
export function canReadAudit(user: AuthUser) {
  return isOrgAdmin(user) || user.orgRole === 'auditor';
}

export interface AudienceEntry {
  subjectType: 'user' | 'group' | 'org';
  subjectId: string | null;
  level: Level;
  via: string;
  grantId: string;
  expiresAt: string | null;
}

/** All grants that currently apply to a page (who has access and why), regardless of the viewer. */
export async function pageAudience(q: Queryable, pageId: string): Promise<AudienceEntry[]> {
  const rows = (await q.query(APPLICABLE_GRANTS_SQL, [[pageId]])).rows as GrantRow[];
  const now = new Date();
  return rows
    .filter((g) => active(g, now))
    .map((g) => ({ subjectType: g.subject_type, subjectId: g.subject_id, level: g.level, via: viaOf(g), grantId: g.id, expiresAt: g.expires_at?.toISOString() ?? null }));
}

/**
 * Audience a page would have under a hypothetical parent/space (used for move previews).
 * Own page grants (depth 0) travel with the page; inherited grants come from the new location.
 */
export async function hypotheticalAudience(q: Queryable, pageId: string, target: { spaceId: string; parentId: string | null }): Promise<AudienceEntry[]> {
  const page = (await q.query('select inherit_permissions from pages where id = $1', [pageId])).rows[0];
  const own = (await q.query(`select * from grants where resource_type = 'page' and resource_id = $1 and revoked_at is null`, [pageId])).rows as GrantRow[];
  const now = new Date();
  const entries: AudienceEntry[] = own.filter((g) => active(g, now)).map((g) => ({ subjectType: g.subject_type, subjectId: g.subject_id, level: g.level, via: 'direct', grantId: g.id, expiresAt: g.expires_at?.toISOString() ?? null }));
  if (!page.inherit_permissions) return entries;
  if (target.parentId) {
    const parentRows = (await q.query(APPLICABLE_GRANTS_SQL, [[target.parentId]])).rows as GrantRow[];
    entries.push(...parentRows.filter((g) => active(g, now)).map((g) => ({ subjectType: g.subject_type, subjectId: g.subject_id, level: g.level, via: g.resource_type === 'space' ? 'space' : 'inherited-page', grantId: g.id, expiresAt: g.expires_at?.toISOString() ?? null })));
  } else {
    const sp = (await q.query(`select * from grants where resource_type = 'space' and resource_id = $1 and revoked_at is null`, [target.spaceId])).rows as GrantRow[];
    entries.push(...sp.filter((g) => active(g, now)).map((g) => ({ subjectType: g.subject_type, subjectId: g.subject_id, level: g.level, via: 'space', grantId: g.id, expiresAt: g.expires_at?.toISOString() ?? null })));
  }
  return entries;
}

export interface AudienceDiff {
  gained: Array<{ subjectType: string; subjectId: string | null; from: Level; to: Level }>;
  lost: Array<{ subjectType: string; subjectId: string | null; from: Level; to: Level }>;
  widens: boolean;
}

/** Compares audiences per subject (max level, deny wins). */
export function diffAudience(before: AudienceEntry[], after: AudienceEntry[]): AudienceDiff {
  const summarise = (list: AudienceEntry[]) => {
    const m = new Map<string, Level>();
    const denied = new Set<string>();
    for (const e of list) {
      const k = e.subjectType + ':' + (e.subjectId ?? '');
      if (e.level === 'none') denied.add(k);
      else if (!m.has(k) || LEVEL_RANK[e.level] > LEVEL_RANK[m.get(k)!]) m.set(k, e.level);
    }
    for (const k of denied) m.set(k, 'none');
    return m;
  };
  const b = summarise(before);
  const a = summarise(after);
  const keys = new Set([...b.keys(), ...a.keys()]);
  const gained: AudienceDiff['gained'] = [];
  const lost: AudienceDiff['lost'] = [];
  for (const k of keys) {
    const [subjectType, id] = k.split(':');
    const from = b.get(k) ?? 'none';
    const to = a.get(k) ?? 'none';
    const entry = { subjectType, subjectId: id || null, from, to };
    if (LEVEL_RANK[to] > LEVEL_RANK[from]) gained.push(entry);
    else if (LEVEL_RANK[to] < LEVEL_RANK[from]) lost.push(entry);
  }
  return { gained, lost, widens: gained.length > 0 };
}
