import type { Queryable } from '../db/pool.js';
import { accessForPages, policyOf, usersWithAction, type AuthUser } from '../acl/engine.js';

export interface MoveImpact {
  /** Breadcrumb-like paths shown in the confirmation ("Пространство / Родитель / …"). Titles the user cannot see are hidden. */
  fromPath: string[];
  toPath: string[];
  /** Active public links on the moved subtree: they keep working at the new place while their creator may still share. */
  publicLinks: number;
  /** Guests who can open the page now; `losesAccess` when the target forbids guests or their access source disappears. */
  guests: Array<{ id: string; name: string; losesAccess: boolean }>;
}

async function pathOf(q: Queryable, user: AuthUser, spaceId: string, parentId: string | null): Promise<string[]> {
  const sp = (await q.query('select name, kind from spaces where id = $1', [spaceId])).rows[0];
  const out = [sp ? (sp.kind === 'personal' ? 'Личное пространство' : sp.name) : '—'];
  if (!parentId) return out;
  const chain = (await q.query(`select p.id, p.title from page_ancestors a join pages p on p.id = a.ancestor_id where a.page_id = $1 order by a.depth desc`, [parentId])).rows;
  const acc = await accessForPages(q, user, chain.map((c) => c.id));
  for (const c of chain) out.push(acc.get(c.id)?.actions.view ? c.title || 'Без названия' : 'скрыто');
  return out;
}

/** Extra facts for the move confirmation (R-SPACE-007, R-ACL-068): paths, affected public links and guests. */
export async function moveImpact(q: Queryable, user: AuthUser, page: { id: string; space_id: string; parent_id: string | null; org_id: string }, to: { spaceId: string; parentId: string | null }, lostSubjects: Array<{ subjectType: string; subjectId: string | null }>): Promise<MoveImpact> {
  const links = (await q.query(`select count(*)::int c from share_links l where l.revoked_at is null and (l.expires_at is null or l.expires_at > now()) and l.page_id in (select page_id from page_ancestors where ancestor_id = $1)`, [page.id])).rows[0].c;
  const viewers = await usersWithAction(q, page.org_id, { type: 'page', id: page.id }, 'view');
  const target = (await q.query('select settings from spaces where id = $1', [to.spaceId])).rows[0];
  const allowGuests = policyOf(target?.settings).allowGuests;
  const lostUsers = new Set(lostSubjects.filter((s) => s.subjectType === 'user').map((s) => s.subjectId));
  const guests = viewers.filter((v) => v.kind === 'guest').map((v) => ({ id: v.id, name: v.name, losesAccess: !allowGuests || lostUsers.has(v.id) }));
  return { fromPath: await pathOf(q, user, page.space_id, page.parent_id), toPath: await pathOf(q, user, to.spaceId, to.parentId), publicLinks: links, guests };
}
