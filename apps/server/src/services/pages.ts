import { keyBetween, emptyDoc, ensureBlockIds, walk, type PMNode, LEVEL_RANK } from '@kb/shared';
import type { Queryable, Tx } from '../db/pool.js';
import { badRequest, conflict, forbidden, notFound, unprocessable } from '../lib/errors.js';
import { audit, type AuditActor } from './audit.js';
import { jsonToUpdate, updateToJson } from '../collab/ydoc.js';
import { docToPlainText, countWords } from '@kb/shared';
import { moveImpact, type MoveImpact } from './move-impact.js';
import { diffAudience, hypotheticalAudience, pageAudience, requirePage, requireSpace, bumpAclEpoch, type AuthUser, type AudienceDiff } from '../acl/engine.js';

export interface PageRow {
  id: string;
  org_id: string;
  space_id: string;
  parent_id: string | null;
  sort_key: string;
  title: string;
  icon: string | null;
  cover: any;
  status: string;
  inherit_permissions: boolean;
  locked: boolean;
  wide: boolean;
  properties: any;
  collection_id: string | null;
  owner_id: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: Date;
  updated_at: Date;
  content_updated_at: Date | null;
  published_revision_id: string | null;
  deleted_at: Date | null;
  legal_hold: boolean;
  version: number;
  review_due_at: string | null;
  verified_at: Date | null;
}

/** Maximum nesting level of pages under a space root (a root page is level 1). */
export const MAX_TREE_DEPTH = 15;

/** Level of a page in its space tree (root page = 1). */
export async function pageLevel(q: Queryable, pageId: string): Promise<number> {
  const r = await q.query('select coalesce(max(depth), 0)::int as d from page_ancestors where page_id = $1', [pageId]);
  return r.rows[0].d + 1;
}

/** Height of the subtree below a page (0 for a leaf). */
export async function subtreeHeight(q: Queryable, pageId: string): Promise<number> {
  const r = await q.query('select coalesce(max(depth), 0)::int as d from page_ancestors where ancestor_id = $1', [pageId]);
  return r.rows[0].d;
}

function depthError(wouldBe: number) {
  return unprocessable('depth_limit', `Слишком глубокая вложенность: допускается не более ${MAX_TREE_DEPTH} уровней страниц (получилось бы ${wouldBe}). Выберите место выше по дереву.`, { max: MAX_TREE_DEPTH, wouldBe });
}

/** Rejects placing a subtree of the given height under `parentId` if it would exceed MAX_TREE_DEPTH. */
export async function assertDepth(q: Queryable, parentId: string | null, height = 0) {
  const level = (parentId ? (await pageLevel(q, parentId)) + 1 : 1) + height;
  if (level > MAX_TREE_DEPTH) throw depthError(level);
}

/** Serialises structural changes of an organisation's tree (prevents concurrent moves creating cycles). */
export async function lockTree(q: Tx, orgId: string) {
  await q.query('select pg_advisory_xact_lock(hashtext($1))', ['tree:' + orgId]);
}

export async function getPage(q: Queryable, id: string): Promise<PageRow | null> {
  const r = await q.query('select * from pages where id = $1', [id]);
  return r.rows[0] ?? null;
}


/** Computes a sort key for placing a node relative to a sibling (before/after) or at the end. */
export async function placementKey(q: Queryable, spaceId: string, parentId: string | null, place: { beforeId?: string | null; afterId?: string | null; position?: 'start' | 'end' }): Promise<string> {
  const rows = (
    await q.query(
      `select id, sort_key from pages where space_id = $1 and parent_id is not distinct from $2 and deleted_at is null order by sort_key collate "C"`,
      [spaceId, parentId],
    )
  ).rows as { id: string; sort_key: string }[];
  if (place.beforeId) {
    const i = rows.findIndex((r) => r.id === place.beforeId);
    if (i < 0) throw badRequest('Целевой элемент не найден среди соседей');
    return keyBetween(rows[i - 1]?.sort_key ?? null, rows[i].sort_key);
  }
  if (place.afterId) {
    const i = rows.findIndex((r) => r.id === place.afterId);
    if (i < 0) throw badRequest('Целевой элемент не найден среди соседей');
    return keyBetween(rows[i].sort_key, rows[i + 1]?.sort_key ?? null);
  }
  if (place.position === 'start') return keyBetween(null, rows[0]?.sort_key ?? null);
  return keyBetween(rows[rows.length - 1]?.sort_key ?? null, null);
}

export async function insertAncestors(q: Queryable, pageId: string, parentId: string | null) {
  await q.query('insert into page_ancestors (page_id, ancestor_id, depth) values ($1, $1, 0)', [pageId]);
  if (parentId)
    await q.query(`insert into page_ancestors (page_id, ancestor_id, depth) select $1, ancestor_id, depth + 1 from page_ancestors where page_id = $2`, [pageId, parentId]);
}

/** Initialises CRDT state for a new page (seq 1) and the first revision. */
export async function initDocument(q: Queryable, pageId: string, title: string, content: PMNode | null, userId: string | null, kind: 'create' | 'import' = 'create') {
  const json = ensureBlockIds(structuredClone(content ?? emptyDoc()));
  const update = jsonToUpdate(json, title);
  const normalized = updateToJson(update);
  const text = docToPlainText(normalized);
  await q.query(`insert into doc_updates (page_id, seq, update, user_id, op_id) values ($1, 1, $2, $3, $4)`, [pageId, Buffer.from(update), userId, 'init:' + pageId]);
  await q.query(
    `insert into doc_state (page_id, snapshot, snapshot_seq, last_seq, content, plain_text) values ($1, $2, 1, 1, $3, $4)`,
    [pageId, Buffer.from(update), normalized, text],
  );
  await q.query(
    `insert into page_revisions (page_id, number, kind, title, state, content, seq_upto, authors, created_by) values ($1, 1, $2, $3, $4, $5, 1, $6, $7)`,
    [pageId, kind, title, Buffer.from(update), normalized, userId ? [userId] : [], userId],
  );
  await q.query('update pages set word_count = $2, content_updated_at = now() where id = $1', [pageId, countWords(text)]);
  await enqueue(q, 'index-page', { pageId });
}

export async function enqueue(q: Queryable, topic: string, payload: Record<string, unknown>) {
  await q.query('insert into outbox (topic, payload) values ($1, $2)', [topic, payload]);
}

export interface CreatePageInput {
  spaceId: string;
  parentId?: string | null;
  title?: string;
  icon?: string | null;
  content?: PMNode | null;
  properties?: Record<string, unknown>;
  beforeId?: string | null;
  afterId?: string | null;
  position?: 'start' | 'end';
  requestId?: string | null;
  templateId?: string | null;
  collectionId?: string | null;
  status?: string;
  /** Pre-assigned id (imports resolve cross-links before pages exist). */
  id?: string;
  /** Kind of the first revision. */
  revisionKind?: 'create' | 'import';
}

/**
 * Creates a page. Idempotent per (user, requestId): a retried request (double click, network retry) returns the
 * already created page instead of creating a duplicate (UX23-203).
 */
export async function createPage(q: Tx, user: AuthUser, actor: AuditActor, input: CreatePageInput): Promise<{ page: PageRow; created: boolean }> {
  if (input.requestId) {
    // Serialise retries of the same request so a double click / network retry never creates two pages.
    await q.query('select pg_advisory_xact_lock(hashtext($1))', ['create:' + user.id + ':' + input.requestId]);
    const existing = await q.query('select * from pages where created_by = $1 and create_request_id = $2', [user.id, input.requestId]);
    if (existing.rows[0]) return { page: existing.rows[0], created: false };
  }
  let spaceId = input.spaceId;
  const parentId = input.parentId ?? null;
  if (parentId) {
    const acc = await requirePage(q, user, parentId, 'create');
    spaceId = acc.spaceId;
  } else {
    await requireSpace(q, user, spaceId, 'create');
  }
  await lockTree(q, user.orgId);
  await assertDepth(q, parentId);
  const sortKey = await placementKey(q, spaceId, parentId, { beforeId: input.beforeId, afterId: input.afterId, position: input.position });
  const title = (input.title ?? '').slice(0, 500);
  const r = await q.query(
    `insert into pages (id, org_id, space_id, parent_id, sort_key, title, icon, properties, owner_id, created_by, updated_by, create_request_id, collection_id, status)
     values (coalesce($12::uuid, gen_random_uuid()), $1, $2, $3, $4, $5, $6, $7, $8, $8, $8, $9, $10, $11) returning *`,
    [user.orgId, spaceId, parentId, sortKey, title, input.icon ?? null, input.properties ?? {}, user.id, input.requestId ?? null, input.collectionId ?? null, input.status ?? 'draft', input.id ?? null],
  );
  const page = r.rows[0] as PageRow;
  await insertAncestors(q, page.id, parentId);
  await initDocument(q, page.id, title, input.content ?? null, user.id, input.revisionKind ?? 'create');
  await q.query(`insert into page_events (org_id, page_id, actor_id, type, data) values ($1, $2, $3, 'created', $4)`, [user.orgId, page.id, user.id, { parentId, spaceId, templateId: input.templateId ?? null }]);
  await audit(q, actor, { action: 'page.create', targetType: 'page', targetId: page.id, details: { spaceId, parentId, title, templateId: input.templateId ?? null } });
  return { page, created: true };
}

export interface MoveInput {
  pageId: string;
  targetSpaceId?: string | null;
  targetParentId?: string | null;
  beforeId?: string | null;
  afterId?: string | null;
  position?: 'start' | 'end';
  confirmAudienceChange?: boolean;
  expectedVersion?: number;
}

export interface MovePreview {
  from: { spaceId: string; parentId: string | null };
  to: { spaceId: string; parentId: string | null };
  audience: AudienceDiff;
  descendants: number;
  attachments: number;
  requiresConfirmation: boolean;
  /** Paths, public links and guests affected by the move (R-SPACE-007, R-ACL-068). */
  impact?: MoveImpact;
}

async function resolveMoveTarget(q: Queryable, user: AuthUser, page: PageRow, input: MoveInput) {
  let targetParentId = input.targetParentId === undefined ? page.parent_id : input.targetParentId;
  let targetSpaceId = input.targetSpaceId ?? null;
  if (targetParentId) {
    const parent = await getPage(q, targetParentId);
    if (!parent || parent.deleted_at) throw notFound('Целевая страница не найдена');
    targetSpaceId = parent.space_id;
    // Cycle protection: target parent must not be the page itself or its descendant.
    const cyc = await q.query('select 1 from page_ancestors where page_id = $1 and ancestor_id = $2', [targetParentId, page.id]);
    if (cyc.rowCount) throw conflict('move_cycle', 'Нельзя переместить страницу внутрь неё самой или её дочерней страницы');
    await requirePage(q, user, targetParentId, 'create');
  } else {
    targetSpaceId = targetSpaceId ?? page.space_id;
    targetParentId = null;
    await requireSpace(q, user, targetSpaceId, 'create');
  }
  return { targetSpaceId: targetSpaceId!, targetParentId };
}

/** Adds human readable names to the subjects of an audience diff (confirmation dialogs). */
async function nameAudience(q: Queryable, audience: AudienceDiff) {
  const all = [...audience.gained, ...audience.lost];
  const users = all.filter((g) => g.subjectType === 'user').map((g) => g.subjectId);
  const groups = all.filter((g) => g.subjectType === 'group').map((g) => g.subjectId);
  const names = new Map<string, string>([
    ...((users.length ? (await q.query('select id, name from users where id = any($1::uuid[])', [users])).rows : []) as any[]).map((r) => [r.id, r.name] as [string, string]),
    ...((groups.length ? (await q.query('select id, name from groups where id = any($1::uuid[])', [groups])).rows : []) as any[]).map((r) => [r.id, r.name] as [string, string]),
  ]);
  for (const e of all) (e as any).name = e.subjectType === 'org' ? 'Все сотрудники организации' : names.get(e.subjectId ?? '') ?? '—';
}

export async function previewMove(q: Queryable, user: AuthUser, input: MoveInput): Promise<MovePreview> {
  const page = await getPage(q, input.pageId);
  if (!page || page.deleted_at) throw notFound();
  await requirePage(q, user, page.id, 'manage_structure');
  const { targetSpaceId, targetParentId } = await resolveMoveTarget(q, user, page, input);
  const before = await pageAudience(q, page.id);
  const after = await hypotheticalAudience(q, page.id, { spaceId: targetSpaceId, parentId: targetParentId });
  const audience = diffAudience(before, after);
  // Human readable names for the confirmation dialog.
  const users = audience.gained.concat(audience.lost).filter((g) => g.subjectType === 'user').map((g) => g.subjectId);
  const groups = audience.gained.concat(audience.lost).filter((g) => g.subjectType === 'group').map((g) => g.subjectId);
  const names = new Map<string, string>([
    ...((users.length ? (await q.query('select id, name from users where id = any($1::uuid[])', [users])).rows : []) as any[]).map((r) => [r.id, r.name] as [string, string]),
    ...((groups.length ? (await q.query('select id, name from groups where id = any($1::uuid[])', [groups])).rows : []) as any[]).map((r) => [r.id, r.name] as [string, string]),
  ]);
  for (const e of [...audience.gained, ...audience.lost]) (e as any).name = e.subjectType === 'org' ? 'Все сотрудники организации' : names.get(e.subjectId ?? '') ?? '—';
  const counts = await q.query(
    `select count(*)::int - 1 as descendants,
            (select count(*)::int from attachments a where a.page_id in (select page_id from page_ancestors where ancestor_id = $1) and a.deleted_at is null) as attachments
       from page_ancestors where ancestor_id = $1`,
    [page.id],
  );
  const personalSource = (await q.query(`select kind from spaces where id = $1`, [page.space_id])).rows[0]?.kind === 'personal';
  const impact = await moveImpact(q, user, page, { spaceId: targetSpaceId, parentId: targetParentId }, audience.lost);
  return {
    from: { spaceId: page.space_id, parentId: page.parent_id },
    to: { spaceId: targetSpaceId, parentId: targetParentId },
    audience,
    descendants: counts.rows[0].descendants,
    attachments: counts.rows[0].attachments,
    requiresConfirmation: audience.widens || (personalSource && targetSpaceId !== page.space_id) || impact.guests.some((g) => g.losesAccess),
    impact,
  };
}

/** Transactional move with cycle check, audience-widening confirmation and closure maintenance. */
export async function movePage(q: Tx, user: AuthUser, actor: AuditActor, input: MoveInput): Promise<{ page: PageRow; preview: MovePreview; undo: MoveInput }> {
  await lockTree(q, user.orgId);
  const page = await getPage(q, input.pageId);
  if (!page || page.deleted_at) throw notFound();
  if (input.expectedVersion !== undefined && input.expectedVersion !== page.version)
    throw conflict('version_conflict', 'Страница была изменена другим пользователем; обновите дерево и повторите', { currentVersion: page.version });
  const preview = await previewMove(q, user, input);
  if (preview.requiresConfirmation && !input.confirmAudienceChange) throw conflict('audience_change', 'Перенос изменит аудиторию документа — требуется подтверждение', preview);
  const { spaceId: targetSpaceId, parentId: targetParentId } = preview.to;
  await assertDepth(q, targetParentId, await subtreeHeight(q, page.id));
  const sortKey = await placementKey(q, targetSpaceId, targetParentId, { beforeId: input.beforeId, afterId: input.afterId, position: input.position });
  const undo: MoveInput = { pageId: page.id, targetSpaceId: page.space_id, targetParentId: page.parent_id, ...(await neighbourAnchor(q, page)), confirmAudienceChange: true };

  // Closure maintenance: detach subtree from old ancestors, attach to new ones.
  await q.query(
    `delete from page_ancestors where page_id in (select page_id from page_ancestors where ancestor_id = $1)
       and ancestor_id not in (select page_id from page_ancestors where ancestor_id = $1)`,
    [page.id],
  );
  if (targetParentId)
    await q.query(
      `insert into page_ancestors (page_id, ancestor_id, depth)
       select sub.page_id, sup.ancestor_id, sub.depth + sup.depth + 1
         from page_ancestors sub cross join page_ancestors sup
        where sub.ancestor_id = $1 and sup.page_id = $2`,
      [page.id, targetParentId],
    );
  if (targetSpaceId !== page.space_id) await q.query(`update pages set space_id = $2 where id in (select page_id from page_ancestors where ancestor_id = $1)`, [page.id, targetSpaceId]);
  const r = await q.query(`update pages set parent_id = $2, sort_key = $3, version = version + 1, updated_at = now(), updated_by = $4 where id = $1 returning *`, [page.id, targetParentId, sortKey, user.id]);
  await q.query(`insert into page_events (org_id, page_id, actor_id, type, data) values ($1, $2, $3, 'moved', $4)`, [user.orgId, page.id, user.id, { from: preview.from, to: preview.to, audience: preview.audience }]);
  await audit(q, actor, { action: 'page.move', targetType: 'page', targetId: page.id, details: { from: preview.from, to: preview.to, widens: preview.audience.widens, gained: preview.audience.gained, lost: preview.audience.lost } });
  await bumpAclEpoch(q, user.orgId);
  await enqueue(q, 'reindex-subtree', { pageId: page.id });
  return { page: r.rows[0], preview, undo };
}

async function neighbourAnchor(q: Queryable, page: PageRow): Promise<{ afterId?: string; beforeId?: string; position?: 'start' }> {
  const prev = await q.query(
    `select id from pages where space_id = $1 and parent_id is not distinct from $2 and deleted_at is null and sort_key collate "C" < $3 collate "C" and id <> $4 order by sort_key collate "C" desc limit 1`,
    [page.space_id, page.parent_id, page.sort_key, page.id],
  );
  if (prev.rows[0]) return { afterId: prev.rows[0].id };
  return { position: 'start' };
}

/** Soft-deletes a page with its subtree as one batch (restorable together). */
export async function trashPage(q: Tx, user: AuthUser, actor: AuditActor, pageId: string): Promise<{ batchId: string; count: number }> {
  await lockTree(q, user.orgId);
  const acc = await requirePage(q, user, pageId, 'delete');
  const page = await getPage(q, pageId);
  if (page!.locked && acc.level !== 'full') throw forbidden('Страница защищена от изменений');
  const batch = (await q.query('select gen_random_uuid() as id')).rows[0].id as string;
  const r = await q.query(
    `update pages set deleted_at = now(), deleted_by = $2, delete_batch_id = $3, delete_root = (id = $1)
      where id in (select page_id from page_ancestors where ancestor_id = $1) and deleted_at is null returning id`,
    [pageId, user.id, batch],
  );
  await q.query(`insert into page_events (org_id, page_id, actor_id, type, data) values ($1, $2, $3, 'trashed', $4)`, [user.orgId, pageId, user.id, { batchId: batch, count: r.rowCount }]);
  await audit(q, actor, { action: 'page.trash', targetType: 'page', targetId: pageId, details: { batchId: batch, count: r.rowCount, title: page!.title } });
  await enqueue(q, 'reindex-subtree', { pageId });
  return { batchId: batch, count: r.rowCount ?? 0 };
}

/** Restores a trashed page (and the subtree deleted with it). If the original parent is gone, restores at space root. */
export async function restorePage(q: Tx, user: AuthUser, actor: AuditActor, pageId: string): Promise<PageRow> {
  await lockTree(q, user.orgId);
  const page = await getPage(q, pageId);
  if (!page || !page.deleted_at) throw notFound('Страница не найдена в корзине');
  await requirePage(q, user, pageId, 'restore', { allowDeleted: true });
  const batch = (await q.query('select delete_batch_id from pages where id = $1', [pageId])).rows[0].delete_batch_id;
  let parentId = page.parent_id;
  let reparent = false;
  if (parentId) {
    const parent = await getPage(q, parentId);
    if (!parent || parent.deleted_at) {
      reparent = true;
      parentId = null;
    }
  }
  const space = (await q.query('select deleted_at from spaces where id = $1', [page.space_id])).rows[0];
  if (space?.deleted_at) throw conflict('space_deleted', 'Пространство страницы удалено — сначала восстановите пространство');
  if (reparent) {
    await q.query(
      `delete from page_ancestors where page_id in (select page_id from page_ancestors where ancestor_id = $1) and ancestor_id not in (select page_id from page_ancestors where ancestor_id = $1)`,
      [pageId],
    );
    const key = await placementKey(q, page.space_id, null, { position: 'end' });
    await q.query('update pages set parent_id = null, sort_key = $2 where id = $1', [pageId, key]);
  }
  await q.query(
    `update pages set deleted_at = null, deleted_by = null, delete_batch_id = null, delete_root = false, version = version + 1
      where id in (select page_id from page_ancestors where ancestor_id = $1) and delete_batch_id = $2`,
    [pageId, batch],
  );
  // Pages deleted in this batch that are not descendants of this page (shouldn't happen) are left alone.
  await q.query(`insert into page_events (org_id, page_id, actor_id, type, data) values ($1, $2, $3, 'restored', $4)`, [user.orgId, pageId, user.id, { reparentedToRoot: reparent }]);
  await audit(q, actor, { action: 'page.restore', targetType: 'page', targetId: pageId, details: { reparentedToRoot: reparent } });
  await enqueue(q, 'reindex-subtree', { pageId });
  return (await getPage(q, pageId))!;
}

/** Permanently deletes trashed pages (after retention or on explicit purge by an authorised user). */
export async function purgePages(q: Tx, actor: AuditActor, pageIds: string[], reason: string) {
  if (!pageIds.length) return 0;
  const held = await q.query('select id from pages where id = any($1::uuid[]) and legal_hold', [pageIds]);
  if (held.rowCount) throw forbidden('Страница находится на юридическом удержании и не может быть удалена окончательно');
  // Order: dependent rows first. Blobs are garbage collected separately once unreferenced.
  const ids = pageIds;
  await q.query('update pages set published_revision_id = null where id = any($1::uuid[])', [ids]);
  await q.query('update pages set collection_id = null where collection_id in (select id from collections where page_id = any($1::uuid[]))', [ids]);
  await q.query('delete from collections where page_id = any($1::uuid[])', [ids]);
  await q.query('delete from upload_sessions where page_id = any($1::uuid[])', [ids]);
  for (const t of ['doc_updates', 'doc_state', 'page_events', 'comments', 'approvals', 'favorites', 'recent_views', 'notifications', 'search_index', 'share_links'])
    await q.query(`delete from ${t} where page_id = any($1::uuid[])`, [ids]);
  await q.query('delete from page_revisions where page_id = any($1::uuid[])', [ids]);
  await q.query(`update attachments set deleted_at = coalesce(deleted_at, now()), page_id = null where page_id = any($1::uuid[])`, [ids]);
  await q.query(`delete from grants where resource_type = 'page' and resource_id = any($1::uuid[])`, [ids]);
  await q.query('update pages set parent_id = null where id = any($1::uuid[])', [ids]);
  await q.query('delete from page_ancestors where page_id = any($1::uuid[]) or ancestor_id = any($1::uuid[])', [ids]);
  await q.query('delete from pages where id = any($1::uuid[])', [ids]);
  await audit(q, actor, { action: 'page.purge', targetType: 'page', targetId: ids.length === 1 ? ids[0] : null, details: { count: ids.length, ids: ids.slice(0, 100), reason } });
  return ids.length;
}

/** Permanently deletes a space from the trash together with all its pages (org admins; legal holds are respected). */
export async function purgeSpace(q: Tx, actor: AuditActor, spaceId: string, orgId: string) {
  const sp = (await q.query('select * from spaces where id = $1 and org_id = $2 for update', [spaceId, orgId])).rows[0];
  if (!sp || !sp.deleted_at) throw notFound('Пространство не найдено в корзине');
  if (sp.legal_hold) throw forbidden('Пространство на юридическом удержании и не может быть удалено окончательно');
  await lockTree(q, orgId);
  const ids = (await q.query('select id from pages where space_id = $1', [spaceId])).rows.map((r) => r.id);
  const pages = await purgePages(q, actor, ids, 'space purge');
  await q.query(`update templates set space_id = null, deleted_at = coalesce(deleted_at, now()) where space_id = $1`, [spaceId]);
  await q.query(`delete from grants where resource_type = 'space' and resource_id = $1`, [spaceId]);
  await q.query(`delete from access_requests where resource_type = 'space' and resource_id = $1`, [spaceId]);
  await q.query('delete from spaces where id = $1', [spaceId]);
  await audit(q, actor, { action: 'space.purge', targetType: 'space', targetId: spaceId, details: { name: sp.name, pages } });
  await bumpAclEpoch(q, orgId);
  return pages;
}

/** Remaps attachment ids inside document JSON (used by duplication and import). */
export function remapAttachments(doc: PMNode, map: Map<string, string>): PMNode {
  walk(doc, (n) => {
    if (n.attrs?.attachmentId && map.has(n.attrs.attachmentId)) {
      const id = map.get(n.attrs.attachmentId)!;
      n.attrs.attachmentId = id;
      if (n.type === 'image' || n.attrs.src) n.attrs.src = `/api/v1/attachments/${id}/content`;
    }
  });
  return doc;
}

/** Duplicates a page (optionally with children). New ids; attachments are copied as new records over the same blobs; guest grants are not copied. */
export async function duplicatePage(q: Tx, user: AuthUser, actor: AuditActor, pageId: string, opts: { includeChildren: boolean; targetParentId?: string | null; targetSpaceId?: string | null; requestId?: string | null; confirmAudienceChange?: boolean }): Promise<PageRow> {
  const src = await getPage(q, pageId);
  if (!src || src.deleted_at) throw notFound();
  await requirePage(q, user, pageId, 'view');
  const parentId = opts.targetParentId === undefined ? src.parent_id : opts.targetParentId;
  const spaceId = opts.targetSpaceId ?? src.space_id;
  // A copy placed elsewhere gets that location's audience: show who would newly see it and require confirmation.
  const targetSpace = parentId ? ((await getPage(q, parentId))?.space_id ?? spaceId) : spaceId;
  if (targetSpace !== src.space_id || parentId !== src.parent_id) {
    const before = await pageAudience(q, pageId);
    const after = await hypotheticalAudience(q, pageId, { spaceId: targetSpace, parentId });
    const audience = diffAudience(before, after);
    const personalSource = (await q.query('select kind from spaces where id = $1', [src.space_id])).rows[0]?.kind === 'personal';
    if ((audience.widens || (personalSource && targetSpace !== src.space_id)) && !opts.confirmAudienceChange) {
      await nameAudience(q, audience);
      throw conflict('audience_change', 'Копия станет доступна другому кругу людей — требуется подтверждение', { audience, to: { spaceId: targetSpace, parentId }, requiresConfirmation: true });
    }
  }
  await assertDepth(q, parentId, opts.includeChildren ? await subtreeHeight(q, pageId) : 0);
  const ids = opts.includeChildren
    ? (await q.query(`select a.page_id, a.depth from page_ancestors a join pages p on p.id = a.page_id where a.ancestor_id = $1 and p.deleted_at is null order by a.depth`, [pageId])).rows
    : [{ page_id: pageId, depth: 0 }];
  const { accessForPages } = await import('../acl/engine.js');
  const access = await accessForPages(q, user, ids.map((r: any) => r.page_id));
  const idMap = new Map<string, string>();
  let root: PageRow | null = null;
  for (const { page_id } of ids) {
    const p = (await getPage(q, page_id))!;
    if (!access.get(page_id)?.actions.view) continue; // never copy what the user cannot see
    const newParent = page_id === pageId ? parentId : idMap.get(p.parent_id!) ?? null;
    if (page_id !== pageId && !newParent) continue;
    const content = (await q.query('select content from doc_state where page_id = $1', [page_id])).rows[0]?.content ?? emptyDoc();
    const attMap = await copyAttachments(q, user, page_id, access.get(page_id)!.actions.download);
    const doc = remapAttachments(structuredClone(content), attMap);
    // fresh block ids so block links stay unambiguous
    walk(doc, (n) => {
      if (n.attrs?.id) delete n.attrs.id;
    });
    const { page } = await createPage(q, user, actor, {
      spaceId,
      parentId: newParent,
      title: page_id === pageId ? `${p.title} (копия)` : p.title,
      icon: p.icon,
      properties: p.properties,
      content: doc,
      ...(page_id === pageId ? { afterId: newParent === src.parent_id && spaceId === src.space_id ? src.id : undefined, requestId: opts.requestId ?? null } : {}),
    });
    if (attMap.size) await q.query('update attachments set page_id = $2 where id = any($1::uuid[])', [[...attMap.values()], page.id]);
    idMap.set(page_id, page.id);
    // copy non-guest page-level grants (exceptions) so the copy is not more open than the source
    await q.query(
      `insert into grants (org_id, resource_type, resource_id, subject_type, subject_id, level, can_export, can_download, can_share, can_publish, expires_at, reason, granted_by)
       select g.org_id, 'page', $2, g.subject_type, g.subject_id, g.level, g.can_export, g.can_download, g.can_share, g.can_publish, g.expires_at, $4, $3
         from grants g left join users u on g.subject_type = 'user' and u.id = g.subject_id
        where g.resource_type = 'page' and g.resource_id = $1 and g.revoked_at is null and (u.id is null or u.kind <> 'guest')`,
      [page_id, page.id, user.id, 'copied from ' + page_id],
    );
    if (!p.inherit_permissions) await q.query('update pages set inherit_permissions = false where id = $1', [page.id]);
    if (!root) root = page;
  }
  await audit(q, actor, { action: 'page.duplicate', targetType: 'page', targetId: pageId, details: { newPageId: root?.id, count: idMap.size } });
  return root!;
}

async function copyAttachments(q: Queryable, user: AuthUser, pageId: string, canDownload: boolean): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!canDownload) return map;
  const atts = await q.query('select * from attachments where page_id = $1 and deleted_at is null', [pageId]);
  for (const a of atts.rows) {
    const v = (await q.query('select * from attachment_versions where attachment_id = $1 and version = $2', [a.id, a.current_version])).rows[0];
    if (!v) continue;
    const n = await q.query(`insert into attachments (org_id, page_id, kind, filename, created_by) values ($1, null, $2, $3, $4) returning id`, [a.org_id, a.kind, a.filename, user.id]);
    await q.query(
      `insert into attachment_versions (attachment_id, version, blob_sha256, size, mime, filename, width, height, created_by) values ($1, 1, $2, $3, $4, $5, $6, $7, $8)`,
      [n.rows[0].id, v.blob_sha256, v.size, v.mime, v.filename, v.width, v.height, user.id],
    );
    map.set(a.id, n.rows[0].id);
  }
  return map;
}

export function levelGte(a: string, b: string) {
  return LEVEL_RANK[a as keyof typeof LEVEL_RANK] >= LEVEL_RANK[b as keyof typeof LEVEL_RANK];
}

