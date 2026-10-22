import type { Queryable } from '../db/pool.js';
import { accessForPages, accessForSpaces, userSubjects, type AuthUser, type PageAccess } from '../acl/engine.js';

export interface TreeNode {
  id: string;
  spaceId: string;
  parentId: string | null;
  title: string;
  icon: string | null;
  sortKey: string;
  status: string;
  hasChildren: boolean;
  version: number;
  inheritPermissions: boolean;
  collectionId: string | null;
  level: string;
  canEdit: boolean;
  canCreate: boolean;
}

/** Visible children of a node. Children the user cannot see are omitted entirely (no titles, no counts). */
export async function visibleChildren(q: Queryable, user: AuthUser, spaceId: string, parentId: string | null, opts: { limit?: number; after?: string | null } = {}): Promise<{ nodes: TreeNode[]; nextCursor: string | null }> {
  const limit = Math.min(opts.limit ?? 500, 2000);
  const rows = (
    await q.query(
      `select id, space_id, parent_id, title, icon, sort_key, status, version, inherit_permissions, collection_id from pages
        where space_id = $1 and parent_id is not distinct from $2 and deleted_at is null and ($3::text is null or sort_key collate "C" > $3 collate "C")
        order by sort_key collate "C" limit $4`,
      [spaceId, parentId, opts.after ?? null, limit + 1],
    )
  ).rows;
  const more = rows.length > limit;
  const page = rows.slice(0, limit);
  const subjects = await userSubjects(q, user);
  const access = await accessForPages(q, user, page.map((r) => r.id), subjects);
  const visible = page.filter((r) => access.get(r.id)?.actions.view);
  // hasChildren must only reflect children the user can see.
  const kids = visible.length
    ? (await q.query(`select id, parent_id from pages where parent_id = any($1::uuid[]) and deleted_at is null`, [visible.map((r) => r.id)])).rows
    : [];
  const kidAccess = await accessForPages(q, user, kids.map((k) => k.id), subjects);
  const withKids = new Set(kids.filter((k) => kidAccess.get(k.id)?.actions.view).map((k) => k.parent_id));
  return {
    nodes: visible.map((r) => toNode(r, access.get(r.id)!, withKids.has(r.id))),
    nextCursor: more ? page[page.length - 1].sort_key : null,
  };
}

function toNode(r: any, acc: PageAccess, hasChildren: boolean): TreeNode {
  return {
    id: r.id,
    spaceId: r.space_id,
    parentId: r.parent_id,
    title: r.title,
    icon: r.icon,
    sortKey: r.sort_key,
    status: r.status,
    hasChildren,
    version: r.version,
    inheritPermissions: r.inherit_permissions,
    collectionId: r.collection_id,
    level: acc.level,
    canEdit: acc.actions.edit,
    canCreate: acc.actions.create,
  };
}

/** Breadcrumbs from the space root; ancestors the user cannot see are shown as an anonymous placeholder. */
export async function breadcrumbs(q: Queryable, user: AuthUser, pageId: string) {
  const anc = (await q.query(`select p.id, p.title, p.icon, a.depth from page_ancestors a join pages p on p.id = a.ancestor_id where a.page_id = $1 and a.depth > 0 order by a.depth desc`, [pageId])).rows;
  const access = await accessForPages(q, user, anc.map((a) => a.id));
  return anc.map((a) => (access.get(a.id)?.actions.view ? { id: a.id, title: a.title, icon: a.icon, hidden: false } : { id: null, title: '…', icon: null, hidden: true }));
}

/** Pages shared with the user through page-level grants in spaces they cannot otherwise see ("Доступные мне"). */
export async function sharedWithMe(q: Queryable, user: AuthUser) {
  const s = await userSubjects(q, user);
  const cand = (
    await q.query(
      `select distinct g.resource_id as id from grants g join pages p on p.id = g.resource_id
        where g.resource_type = 'page' and g.revoked_at is null and g.level <> 'none' and p.deleted_at is null and p.org_id = $1
          and ((g.subject_type = 'user' and g.subject_id = $2) or (g.subject_type = 'group' and g.subject_id = any($3::uuid[])) or (g.subject_type = 'org' and $4))
          and (g.expires_at is null or g.expires_at > now()) and (g.starts_at is null or g.starts_at <= now())`,
      [user.orgId, user.id, s.groupIds, s.employee],
    )
  ).rows.map((r) => r.id);
  if (!cand.length) return [];
  const access = await accessForPages(q, user, cand, s);
  const spaces = await accessForSpaces(q, user, undefined, s);
  const rows = (await q.query(`select id, space_id, parent_id, title, icon, sort_key, status, version, inherit_permissions, collection_id from pages where id = any($1::uuid[])`, [cand])).rows;
  const visibleIds = new Set(rows.filter((r) => access.get(r.id)?.actions.view).map((r) => r.id));
  const out = rows.filter((r) => visibleIds.has(r.id) && !spaces.get(r.space_id)?.actions.view && !(r.parent_id && visibleIds.has(r.parent_id)));
  const kids = out.length ? (await q.query(`select id, parent_id from pages where parent_id = any($1::uuid[]) and deleted_at is null`, [out.map((r) => r.id)])).rows : [];
  const kidAccess = await accessForPages(q, user, kids.map((k) => k.id), s);
  const withKids = new Set(kids.filter((k) => kidAccess.get(k.id)?.actions.view).map((k) => k.parent_id));
  return out.map((r) => toNode(r, access.get(r.id)!, withKids.has(r.id))).sort((a, b) => a.title.localeCompare(b.title, 'ru'));
}

/** Filters a list of page ids to those the user can view (favorites, recents, backlinks...). */
export async function filterVisible(q: Queryable, user: AuthUser, ids: string[]): Promise<Set<string>> {
  const access = await accessForPages(q, user, ids);
  return new Set(ids.filter((id) => access.get(id)?.actions.view && !access.get(id)?.deleted));
}
