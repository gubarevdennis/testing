import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { tx, type Queryable } from '../db/pool.js';
import { actorOf, parse, requireUser, type Services } from '../app.js';
import { accessForPages, requirePage, pageAccess, usersWithAction, type AuthUser, type PageAccess } from '../acl/engine.js';
import { createPage, movePage, previewMove, trashPage, restorePage, duplicatePage, purgePages, getPage, type PageRow } from '../services/pages.js';
import { breadcrumbs, filterVisible, visibleChildren, pagesWithExplicitGrants } from '../services/tree.js';
import { audit } from '../services/audit.js';
import { orgSettings } from '../services/org.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { setTitle } from '../collab/ydoc.js';
import { keyBetween } from '@kb/shared';

const uuid = z.string().uuid();
const idParam = z.object({ id: uuid });

export async function pageDto(q: Queryable, user: AuthUser, p: PageRow, acc: PageAccess) {
  const people = (await q.query('select id, name from users where id = any($1::uuid[])', [[p.created_by, p.updated_by, p.owner_id].filter(Boolean)])).rows;
  const name = (id: string | null) => (id ? { id, name: people.find((x) => x.id === id)?.name ?? '—' } : null);
  const fav = await q.query('select 1 from favorites where user_id = $1 and page_id = $2', [user.id, p.id]);
  const space = (await q.query('select id, name, icon, kind from spaces where id = $1', [p.space_id])).rows[0];
  const gen = (await q.query('select generation from doc_state where page_id = $1', [p.id])).rows[0]?.generation ?? null;
  // Properties the template of the page declares mandatory (R-PAGE-022).
  const required = (
    await q.query(
      `select t.required_properties from page_events e join templates t on t.id::text = e.data->>'templateId' where e.page_id = $1 and e.type = 'created' limit 1`,
      [p.id],
    )
  ).rows[0]?.required_properties ?? [];
  // Current approval request (review state): who asked and who may decide.
  let approval = null;
  if (p.status === 'review') {
    const a = (
      await q.query(
        `select a.id, a.created_at, a.message, a.requested_by, u.name as requested_by_name, a.reviewer_id, r.name as reviewer_name, pr.number as revision_number
           from approvals a join users u on u.id = a.requested_by left join users r on r.id = a.reviewer_id left join page_revisions pr on pr.id = a.revision_id
          where a.page_id = $1 and a.status = 'pending' order by a.created_at desc limit 1`,
        [p.id],
      )
    ).rows[0];
    if (a) {
      const approvers = a.reviewer_id
        ? [{ id: a.reviewer_id, name: a.reviewer_name }]
        : (await usersWithAction(q, p.org_id, { type: 'page', id: p.id }, 'publish')).filter((u) => u.status === 'active' && u.id !== a.requested_by).slice(0, 20).map((u) => ({ id: u.id, name: u.name }));
      approval = { id: a.id, requestedBy: { id: a.requested_by, name: a.requested_by_name }, approvers, message: a.message, revisionNumber: a.revision_number, createdAt: a.created_at };
    }
  }
  const pub = p.published_revision_id
    ? (await q.query(`select r.id, r.number, coalesce((select max(e.created_at) from page_events e where e.page_id = r.page_id and e.type = 'published'), r.created_at) as at from page_revisions r where r.id = $1`, [p.published_revision_id])).rows[0]
    : null;
  return {
    id: p.id,
    spaceId: p.space_id,
    space: { id: space.id, name: space.name, icon: space.icon, kind: space.kind },
    parentId: p.parent_id,
    title: p.title,
    icon: p.icon,
    cover: p.cover,
    status: p.status,
    inheritPermissions: p.inherit_permissions,
    hasExplicitGrants: (await pagesWithExplicitGrants(q, [p.id])).has(p.id),
    locked: p.locked,
    wide: p.wide,
    properties: p.properties,
    collectionId: p.collection_id,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    contentUpdatedAt: p.content_updated_at,
    createdBy: name(p.created_by),
    updatedBy: name(p.updated_by),
    owner: name(p.owner_id),
    version: p.version,
    publishedRevisionId: p.published_revision_id,
    published: pub ? { revisionId: pub.id, number: pub.number, at: pub.at } : null,
    approval,
    reviewDueAt: p.review_due_at,
    verifiedAt: p.verified_at,
    needsReview: !!p.review_due_at && new Date(p.review_due_at) < new Date(),
    deletedAt: p.deleted_at,
    legalHold: !!p.legal_hold,
    requiredProperties: required as string[],
    favorite: !!fav.rowCount,
    access: { level: acc.level, actions: acc.actions, policy: acc.policy },
    readMode: acc.policy.publishingMode === 'publish' && !acc.actions.edit ? 'published' : 'live',
    docGeneration: gen,
  };
}

export async function pageRoutes(app: FastifyInstance, s: Services) {
  app.post('/api/v1/pages', async (req) => {
    const user = requireUser(req);
    const body = parse(
      z.object({
        spaceId: uuid,
        parentId: uuid.nullable().optional(),
        title: z.string().max(500).optional(),
        icon: z.string().max(64).nullable().optional(),
        beforeId: uuid.optional(),
        afterId: uuid.optional(),
        position: z.enum(['start', 'end']).optional(),
        requestId: z.string().min(8).max(100).optional(),
        templateId: uuid.optional(),
      }),
      req.body,
    );
    const result = await tx(s.db, async (q) => {
      let content = null;
      let properties: Record<string, unknown> | undefined;
      let icon = body.icon;
      let title = body.title;
      if (body.templateId) {
        const t = (await q.query('select * from templates where id = $1 and (org_id = $2 or org_id is null) and deleted_at is null', [body.templateId, user.orgId])).rows[0];
        if (!t) throw notFound('Шаблон не найден');
        content = structuredClone(t.content);
        properties = t.properties;
        icon = icon ?? t.icon;
        title = title ?? t.default_title ?? t.name;
      }
      return createPage(q, user, actorOf(req), { ...body, title, icon, content, properties });
    });
    const acc = (await pageAccess(s.db, user, result.page.id))!;
    s.bus.emit({ type: 'tree-changed', orgId: user.orgId, spaceId: result.page.space_id });
    return { page: await pageDto(s.db, user, result.page, acc), created: result.created };
  });

  app.get('/api/v1/pages/:id', async (req) => {
    const user = requireUser(req);
    const { id } = parse(idParam, req.params);
    const acc = await requirePage(s.db, user, id, 'view', { allowDeleted: true });
    const p = (await getPage(s.db, id))!;
    if (p.deleted_at && !acc.actions.restore) throw notFound();
    await s.db.query(`insert into recent_views (user_id, page_id) values ($1, $2) on conflict (user_id, page_id) do update set viewed_at = now()`, [user.id, id]);
    return { page: await pageDto(s.db, user, p, acc), breadcrumbs: await breadcrumbs(s.db, user, id) };
  });

  /**
   * Content for reading/export (the live editor uses the WebSocket channel).
   * In "publish" spaces readers get the published revision only.
   */
  app.get('/api/v1/pages/:id/content', async (req) => {
    const user = requireUser(req);
    const { id } = parse(idParam, req.params);
    const acc = await requirePage(s.db, user, id, 'view');
    const p = (await getPage(s.db, id))!;
    if (acc.policy.publishingMode === 'publish' && !acc.actions.edit) {
      if (!p.published_revision_id) return { mode: 'published', published: false, content: null, title: p.title };
      const rev = (await s.db.query('select number, content, title, created_at from page_revisions where id = $1', [p.published_revision_id])).rows[0];
      return { mode: 'published', published: true, content: rev.content, title: rev.title, revision: { number: rev.number, createdAt: rev.created_at } };
    }
    const snap = await s.hub.snapshot(id);
    return { mode: 'live', content: snap.json, seq: snap.seq, title: p.title };
  });

  app.patch('/api/v1/pages/:id', async (req) => {
    const user = requireUser(req);
    const { id } = parse(idParam, req.params);
    const body = parse(
      z.object({
        title: z.string().max(500).optional(),
        icon: z.string().max(200).nullable().optional(),
        cover: z.object({ attachmentId: uuid.nullable().optional(), url: z.string().max(500).nullable().optional(), position: z.number().min(0).max(100).optional() }).nullable().optional(),
        wide: z.boolean().optional(),
        locked: z.boolean().optional(),
        properties: z.record(z.string(), z.unknown()).optional(),
        reviewDueAt: z.string().date().nullable().optional(),
        verified: z.boolean().optional(),
        expectedVersion: z.number().int().optional(),
      }),
      req.body,
    );
    const acc = await requirePage(s.db, user, id, 'edit');
    if (body.locked !== undefined && acc.level !== 'full') throw forbidden('Блокировать страницу может только владелец доступа');
    const cur = (await getPage(s.db, id))!;
    if (cur.locked && acc.level !== 'full' && body.locked === undefined) throw forbidden('Страница защищена от изменений — предложите правку через черновик или обратитесь к владельцу');
    if (body.properties && JSON.stringify(body.properties).length > 100_000) throw badRequest('Слишком большие свойства');
    if (body.title !== undefined) await s.hub.applyServerChange(id, user.id, (d) => setTitle(d, body.title!));
    const updated = await tx(s.db, async (q) => {
      const p = (await q.query('select * from pages where id = $1 for update', [id])).rows[0];
      if (body.expectedVersion !== undefined && body.properties && p.version !== body.expectedVersion) throw conflict('version_conflict', 'Свойства изменены другим пользователем', { current: p.properties, version: p.version });
      const sets: string[] = [];
      const vals: unknown[] = [id];
      const set = (col: string, v: unknown) => {
        vals.push(v);
        sets.push(`${col} = $${vals.length}`);
      };
      if (body.title !== undefined) set('title', body.title);
      if (body.icon !== undefined) set('icon', body.icon);
      if (body.cover !== undefined) set('cover', body.cover);
      if (body.wide !== undefined) set('wide', body.wide);
      if (body.locked !== undefined) set('locked', body.locked);
      // null removes a property
      if (body.properties !== undefined) set('properties', Object.fromEntries(Object.entries({ ...p.properties, ...body.properties }).filter(([, v]) => v !== null)));
      if (body.reviewDueAt !== undefined) set('review_due_at', body.reviewDueAt);
      if (body.verified !== undefined) {
        set('verified_at', body.verified ? new Date() : null);
        set('verified_by', body.verified ? user.id : null);
      }
      if (!sets.length) return p;
      sets.push('version = version + 1', 'updated_at = now()');
      vals.push(user.id);
      sets.push(`updated_by = $${vals.length}`);
      const r = await q.query(`update pages set ${sets.join(', ')} where id = $1 returning *`, vals);
      const changed = Object.keys(body).filter((k) => k !== 'expectedVersion');
      await q.query(`insert into page_events (org_id, page_id, actor_id, type, data) values ($1, $2, $3, 'updated', $4)`, [user.orgId, id, user.id, { fields: changed, before: Object.fromEntries(changed.map((k) => [k, (p as any)[snake(k)]])) }]);
      if (body.locked !== undefined) await audit(q, actorOf(req), { action: body.locked ? 'page.lock' : 'page.unlock', targetType: 'page', targetId: id });
      if (body.properties !== undefined) await q.query(`insert into outbox (topic, payload) values ('index-page', $1)`, [{ pageId: id }]);
      return r.rows[0];
    });
    if (body.locked !== undefined) void s.hub.recheckAccess(user.orgId);
    s.bus.emit({ type: 'page-changed', orgId: user.orgId, pageId: id, fields: Object.keys(body) });
    if (body.title !== undefined || body.icon !== undefined) s.bus.emit({ type: 'tree-changed', orgId: user.orgId, spaceId: updated.space_id });
    return { page: await pageDto(s.db, user, updated, (await pageAccess(s.db, user, id))!) };
  });

  app.delete('/api/v1/pages/:id', async (req) => {
    const user = requireUser(req);
    const { id } = parse(idParam, req.params);
    const r = await tx(s.db, (q) => trashPage(q, user, actorOf(req), id));
    const p = (await getPage(s.db, id))!;
    s.bus.emit({ type: 'tree-changed', orgId: user.orgId, spaceId: p.space_id, pageIds: [id] });
    void s.hub.recheckAccess(user.orgId);
    return r;
  });

  app.post('/api/v1/pages/:id/restore', async (req) => {
    const user = requireUser(req);
    const { id } = parse(idParam, req.params);
    const p = await tx(s.db, (q) => restorePage(q, user, actorOf(req), id));
    s.bus.emit({ type: 'tree-changed', orgId: user.orgId, spaceId: p.space_id });
    return { page: await pageDto(s.db, user, p, (await pageAccess(s.db, user, id))!) };
  });

  const moveBody = z.object({
    targetSpaceId: uuid.nullable().optional(),
    targetParentId: uuid.nullable().optional(),
    beforeId: uuid.nullable().optional(),
    afterId: uuid.nullable().optional(),
    position: z.enum(['start', 'end']).optional(),
    confirmAudienceChange: z.boolean().optional(),
    expectedVersion: z.number().int().optional(),
  });

  app.post('/api/v1/pages/:id/move-preview', async (req) => {
    const user = requireUser(req);
    const { id } = parse(idParam, req.params);
    const body = parse(moveBody, req.body);
    return previewMove(s.db, user, { pageId: id, ...body });
  });

  app.post('/api/v1/pages/:id/move', async (req) => {
    const user = requireUser(req);
    const { id } = parse(idParam, req.params);
    const body = parse(moveBody, req.body);
    const before = (await getPage(s.db, id))?.space_id;
    const r = await tx(s.db, (q) => movePage(q, user, actorOf(req), { pageId: id, ...body }));
    s.bus.emit({ type: 'tree-changed', orgId: user.orgId, spaceId: r.page.space_id });
    if (before && before !== r.page.space_id) s.bus.emit({ type: 'tree-changed', orgId: user.orgId, spaceId: before });
    s.bus.emit({ type: 'acl-changed', orgId: user.orgId });
    return { page: await pageDto(s.db, user, r.page, (await pageAccess(s.db, user, id))!), preview: r.preview, undo: r.undo };
  });

  app.post('/api/v1/pages/:id/duplicate', async (req) => {
    const user = requireUser(req);
    const { id } = parse(idParam, req.params);
    const body = parse(z.object({ includeChildren: z.boolean().default(true), targetParentId: uuid.nullable().optional(), targetSpaceId: uuid.nullable().optional(), requestId: z.string().min(8).max(100).optional(), confirmAudienceChange: z.boolean().optional() }), req.body ?? {});
    const p = await tx(s.db, (q) => duplicatePage(q, user, actorOf(req), id, body));
    s.bus.emit({ type: 'tree-changed', orgId: user.orgId, spaceId: p.space_id });
    return { page: await pageDto(s.db, user, p, (await pageAccess(s.db, user, p.id))!) };
  });

  app.get('/api/v1/pages/:id/children', async (req) => {
    const user = requireUser(req);
    const { id } = parse(idParam, req.params);
    await requirePage(s.db, user, id, 'view');
    const p = (await getPage(s.db, id))!;
    return visibleChildren(s.db, user, p.space_id, id);
  });

  app.get('/api/v1/pages/:id/backlinks', async (req) => {
    const user = requireUser(req);
    const { id } = parse(idParam, req.params);
    await requirePage(s.db, user, id, 'view');
    const rows = (await s.db.query(`select l.source_page_id as id, p.title, p.icon, l.kind from page_links l join pages p on p.id = l.source_page_id where l.target_page_id = $1 and p.deleted_at is null`, [id])).rows;
    const vis = await filterVisible(s.db, user, rows.map((r) => r.id));
    return { backlinks: rows.filter((r) => vis.has(r.id)) };
  });

  /** Resolves titles/status of referenced pages for link rendering (renamed, deleted or inaccessible targets). */
  app.post('/api/v1/pages/resolve', async (req) => {
    const user = requireUser(req);
    const { ids } = parse(z.object({ ids: z.array(uuid).max(500) }), req.body);
    const acc = await accessForPages(s.db, user, ids);
    const rows = ids.length ? (await s.db.query('select id, title, icon, deleted_at, space_id from pages where id = any($1::uuid[]) and org_id = $2', [ids, user.orgId])).rows : [];
    const out: Record<string, unknown> = {};
    for (const id of ids) {
      const r = rows.find((x) => x.id === id);
      const a = acc.get(id);
      if (!r) out[id] = { status: 'missing' };
      else if (!a?.actions.view) out[id] = { status: 'forbidden' };
      else if (r.deleted_at) out[id] = { status: 'deleted', title: r.title };
      else out[id] = { status: 'ok', title: r.title, icon: r.icon, spaceId: r.space_id };
    }
    return { pages: out };
  });

  // ---- favorites & recents
  app.put('/api/v1/pages/:id/favorite', async (req) => {
    const user = requireUser(req);
    const { id } = parse(idParam, req.params);
    await requirePage(s.db, user, id, 'view');
    const last = (await s.db.query('select sort_key from favorites where user_id = $1 order by sort_key collate "C" desc limit 1', [user.id])).rows[0];
    await s.db.query('insert into favorites (user_id, page_id, sort_key) values ($1, $2, $3) on conflict do nothing', [user.id, id, keyBetween(last?.sort_key ?? null, null)]);
    return { ok: true };
  });
  app.delete('/api/v1/pages/:id/favorite', async (req) => {
    const user = requireUser(req);
    const { id } = parse(idParam, req.params);
    await s.db.query('delete from favorites where user_id = $1 and page_id = $2', [user.id, id]);
    return { ok: true };
  });
  app.get('/api/v1/me/favorites', async (req) => {
    const user = requireUser(req);
    const rows = (await s.db.query(`select p.id, p.title, p.icon, p.space_id from favorites f join pages p on p.id = f.page_id where f.user_id = $1 and p.deleted_at is null order by f.sort_key collate "C"`, [user.id])).rows;
    const vis = await filterVisible(s.db, user, rows.map((r) => r.id));
    return { pages: rows.filter((r) => vis.has(r.id)) };
  });
  app.get('/api/v1/me/recent', async (req) => {
    const user = requireUser(req);
    const rows = (await s.db.query(`select p.id, p.title, p.icon, p.space_id, r.viewed_at from recent_views r join pages p on p.id = r.page_id where r.user_id = $1 and p.deleted_at is null order by r.viewed_at desc limit 50`, [user.id])).rows;
    const vis = await filterVisible(s.db, user, rows.map((r) => r.id));
    return { pages: rows.filter((r) => vis.has(r.id)).slice(0, 20) };
  });
  app.get('/api/v1/me/home', async (req) => {
    const user = requireUser(req);
    const recentChanged = (await s.db.query(`select p.id, p.title, p.icon, p.space_id, p.content_updated_at, u.name as updated_by_name from pages p left join users u on u.id = p.updated_by where p.org_id = $1 and p.deleted_at is null order by p.content_updated_at desc nulls last limit 200`, [user.orgId])).rows;
    const needsReview = (await s.db.query(`select p.id, p.title, p.icon, p.review_due_at from pages p where p.org_id = $1 and p.deleted_at is null and p.review_due_at is not null and p.review_due_at <= current_date + 14 and (p.owner_id = $2) order by p.review_due_at limit 50`, [user.orgId, user.id])).rows;
    const vis = await filterVisible(s.db, user, [...recentChanged, ...needsReview].map((r) => r.id));
    return { recentlyUpdated: recentChanged.filter((r) => vis.has(r.id)).slice(0, 15), needsReview: needsReview.filter((r) => vis.has(r.id)) };
  });

  // ---- trash
  app.get('/api/v1/trash', async (req) => {
    const user = requireUser(req);
    const rows = (
      await s.db.query(
        `select p.id, p.title, p.icon, p.space_id, p.deleted_at, p.delete_batch_id, u.name as deleted_by_name, s.name as space_name,
                (select count(*)::int from pages c where c.delete_batch_id = p.delete_batch_id) - 1 as children
           from pages p left join users u on u.id = p.deleted_by join spaces s on s.id = p.space_id
          where p.org_id = $1 and p.deleted_at is not null and p.delete_root order by p.deleted_at desc limit 500`,
        [user.orgId],
      )
    ).rows;
    const acc = await accessForPages(s.db, user, rows.map((r) => r.id));
    const visible = rows.filter((r) => acc.get(r.id)?.actions.restore);
    // Same retention the maintenance job applies (organisation setting, server default as fallback).
    const retention = (await orgSettings(s.db, user.orgId)).retention?.trashDays ?? s.cfg.retention.trashDays;
    // Original location: ancestor titles, hidden ones as '…' (like breadcrumbs).
    const anc = visible.length
      ? (await s.db.query(`select a.page_id, p.id, p.title, a.depth from page_ancestors a join pages p on p.id = a.ancestor_id where a.page_id = any($1::uuid[]) and a.depth > 0 order by a.depth desc`, [visible.map((r) => r.id)])).rows
      : [];
    const ancAcc = await accessForPages(s.db, user, [...new Set(anc.map((a) => a.id))]);
    return {
      retentionDays: retention,
      pages: visible.map((r) => ({
        ...r,
        path: anc.filter((a) => a.page_id === r.id).map((a) => (ancAcc.get(a.id)?.actions.view ? a.title : '…')),
        purgeAt: new Date(new Date(r.deleted_at).getTime() + retention * 86400_000),
      })),
    };
  });

  app.delete('/api/v1/trash/:id', async (req) => {
    const user = requireUser(req);
    const { id } = parse(idParam, req.params);
    parse(z.object({ confirm: z.literal(true) }), req.body ?? {});
    const acc = await requirePage(s.db, user, id, 'view', { allowDeleted: true });
    if (acc.level !== 'full') throw forbidden('Окончательное удаление доступно только при полном доступе');
    const p = (await getPage(s.db, id))!;
    if (!p.deleted_at) throw badRequest('Сначала переместите страницу в корзину');
    const n = await tx(s.db, async (q) => {
      const ids = (await q.query('select id from pages where delete_batch_id = (select delete_batch_id from pages where id = $1)', [id])).rows.map((r) => r.id);
      return purgePages(q, actorOf(req), ids, 'manual purge');
    });
    return { purged: n };
  });

  // ---- journal of operations
  app.get('/api/v1/pages/:id/events', async (req) => {
    const user = requireUser(req);
    const { id } = parse(idParam, req.params);
    const qs = parse(z.object({ before: z.coerce.number().int().optional(), type: z.string().optional(), actorId: uuid.optional(), limit: z.coerce.number().int().min(1).max(200).default(50) }), req.query);
    await requirePage(s.db, user, id, 'view_history', { allowDeleted: true });
    const rows = (
      await s.db.query(
        `select e.id, e.type, e.data, e.created_at, e.actor_id, u.name as actor_name from page_events e left join users u on u.id = e.actor_id
          where e.page_id = $1 and ($2::bigint is null or e.id < $2) and ($3::text is null or e.type = $3) and ($4::uuid is null or e.actor_id = $4)
          order by e.id desc limit $5`,
        [id, qs.before ?? null, qs.type ?? null, qs.actorId ?? null, qs.limit],
      )
    ).rows;
    return { events: rows, nextCursor: rows.length === qs.limit ? rows[rows.length - 1].id : null };
  });
}

function snake(k: string) {
  return k.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
}
