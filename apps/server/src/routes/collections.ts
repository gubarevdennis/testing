import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { tx } from '../db/pool.js';
import { actorOf, parse, requireUser, type Services } from '../app.js';
import { requirePage } from '../acl/engine.js';
import { createPage, trashPage } from '../services/pages.js';
import { audit } from '../services/audit.js';
import { fieldSchema, viewSchema, filterSchema, buildFilter, buildOrder, coerceValue, visibleRowIds, type Field, type View } from '../services/collections.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { keyBetween } from '@kb/shared';

const uuid = z.string().uuid();

async function loadCollection(s: Services, id: string, orgId: string) {
  const c = (await s.db.query('select * from collections where id = $1 and org_id = $2', [id, orgId])).rows[0];
  if (!c) throw notFound('Коллекция не найдена');
  return c as { id: string; page_id: string; name: string; schema: Field[]; views: View[]; version: number };
}

function rowDto(r: any) {
  return { id: r.id, title: r.title, icon: r.icon, values: r.properties ?? {}, updatedAt: r.updated_at, version: r.version, sortKey: r.sort_key };
}

export async function collectionRoutes(app: FastifyInstance, s: Services) {
  /** Creates a collection as a page (the container) under a parent page or space root. */
  app.post('/api/v1/collections', async (req) => {
    const user = requireUser(req);
    const body = parse(z.object({ spaceId: uuid, parentId: uuid.nullable().optional(), name: z.string().min(1).max(200), schema: z.array(fieldSchema).max(100).optional(), requestId: z.string().max(100).optional() }), req.body);
    const schema: Field[] = body.schema ?? [
      { id: 'status', name: 'Статус', type: 'status', options: [{ id: 'draft', name: 'Черновик', color: 'gray' }, { id: 'active', name: 'Действует', color: 'green' }, { id: 'old', name: 'Устарел', color: 'orange' }] },
      { id: 'owner', name: 'Ответственный', type: 'person' },
      { id: 'updated', name: 'Дата пересмотра', type: 'date' },
    ];
    const res = await tx(s.db, async (q) => {
      const { page } = await createPage(q, user, actorOf(req), { spaceId: body.spaceId, parentId: body.parentId ?? null, title: body.name, icon: '🗂', requestId: body.requestId ?? null });
      const views: View[] = [{ id: 'default', name: 'Таблица', type: 'table', sorts: [], hidden: [], order: ['title', ...schema.map((f) => f.id)] }];
      const c = (await q.query(`insert into collections (org_id, page_id, name, schema, views, created_by) values ($1, $2, $3, $4, $5, $6) returning *`, [user.orgId, page.id, body.name, JSON.stringify(schema), JSON.stringify(views), user.id])).rows[0];
      await q.query(`update pages set properties = jsonb_build_object('__collection', $2::text) where id = $1`, [page.id, c.id]);
      return { page, collection: c };
    });
    s.bus.emit({ type: 'tree-changed', orgId: user.orgId, spaceId: res.page.space_id });
    return { pageId: res.page.id, collection: res.collection };
  });

  app.get('/api/v1/collections/:id', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const c = await loadCollection(s, id, user.orgId);
    const acc = await requirePage(s.db, user, c.page_id, 'view');
    return { collection: c, access: { level: acc.level, actions: acc.actions } };
  });

  app.patch('/api/v1/collections/:id', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const body = parse(z.object({ name: z.string().min(1).max(200).optional(), schema: z.array(fieldSchema).max(100).optional(), views: z.array(viewSchema).max(50).optional(), expectedVersion: z.number().int() }), req.body);
    const c = await loadCollection(s, id, user.orgId);
    await requirePage(s.db, user, c.page_id, 'edit');
    const updated = await tx(s.db, async (q) => {
      const cur = (await q.query('select * from collections where id = $1 for update', [id])).rows[0];
      if (cur.version !== body.expectedVersion) throw conflict('version_conflict', 'Структура коллекции изменена другим пользователем — обновите и повторите', { collection: cur });
      if (body.schema) {
        const ids = body.schema.map((f) => f.id);
        if (new Set(ids).size !== ids.length) throw badRequest('Идентификаторы полей должны быть уникальны');
        // Deleting a field never deletes data: values stay in row properties and the field can be restored from history.
        const removed = (cur.schema as Field[]).filter((f) => !ids.includes(f.id));
        if (removed.length) await q.query(`insert into page_events (org_id, page_id, actor_id, type, data) values ($1, $2, $3, 'collection-fields-removed', $4)`, [user.orgId, c.page_id, user.id, { fields: removed }]);
      }
      const r = (
        await q.query(`update collections set name = coalesce($2, name), schema = coalesce($3, schema), views = coalesce($4, views), version = version + 1, updated_at = now() where id = $1 returning *`, [
          id,
          body.name ?? null,
          body.schema ? JSON.stringify(body.schema) : null,
          body.views ? JSON.stringify(body.views) : null,
        ])
      ).rows[0];
      await audit(q, actorOf(req), { action: 'collection.update', targetType: 'collection', targetId: id, details: { schemaChanged: !!body.schema, viewsChanged: !!body.views } });
      return r;
    });
    s.bus.emit({ type: 'page-changed', orgId: user.orgId, pageId: c.page_id, fields: ['collection'] });
    return { collection: updated };
  });

  /** Server-side filtering, sorting, search, grouping and aggregation (handles tens of thousands of rows). */
  app.post('/api/v1/collections/:id/query', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const body = parse(
      z.object({ viewId: z.string().optional(), filter: filterSchema.optional(), sorts: viewSchema.shape.sorts, q: z.string().max(200).optional(), groupBy: z.string().nullable().optional(), offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(1000).default(200), aggregations: viewSchema.shape.aggregations }),
      req.body ?? {},
    );
    const c = await loadCollection(s, id, user.orgId);
    const acc = await requirePage(s.db, user, c.page_id, 'view');
    const view = c.views.find((v) => v.id === body.viewId);
    const params: unknown[] = [id];
    let where = buildFilter(c.schema, body.filter ?? view?.filter, params);
    if (body.q) {
      params.push(body.q);
      where += ` and (p.title ilike '%' || $${params.length} || '%' or p.properties::text ilike '%' || $${params.length} || '%')`;
    }
    const order = buildOrder(c.schema, body.sorts ?? view?.sorts);
    const all = (await s.db.query(`select p.id from pages p where p.collection_id = $1 and p.deleted_at is null and ${where} order by ${order}`, params)).rows.map((r) => r.id as string);
    const visible = await visibleRowIds(s.db, user, c, all, acc);
    const ids = all.filter((x) => visible.has(x));
    const pageIds = ids.slice(body.offset, body.offset + body.limit);
    const rows = pageIds.length ? (await s.db.query(`select id, title, icon, properties, updated_at, version, sort_key from pages where id = any($1::uuid[])`, [pageIds])).rows : [];
    const byId = new Map(rows.map((r) => [r.id, r]));
    // Aggregations over the full filtered set.
    const aggs: Record<string, number | null> = {};
    const aggDefs = body.aggregations ?? view?.aggregations ?? {};
    if (Object.keys(aggDefs).length && ids.length) {
      for (const [fieldId, fn] of Object.entries(aggDefs)) {
        const f = c.schema.find((x) => x.id === fieldId);
        if (!f && fieldId !== 'title') continue;
        const t = fieldId === 'title' ? 'title' : `properties ->> '${fieldId.replace(/'/g, '')}'`;
        const expr =
          fn === 'count'
            ? 'count(*)'
            : fn === 'filled'
              ? `count(nullif(${t}, ''))`
              : fn === 'empty'
                ? `count(*) - count(nullif(${t}, ''))`
                : `${fn}(nullif(${t}, '')::numeric)`;
        const r = await s.db.query(`select ${expr} as v from pages where id = any($1::uuid[])`, [ids]);
        aggs[fieldId] = r.rows[0].v === null ? null : Number(r.rows[0].v);
      }
    }
    let groups: Array<{ key: string | null; count: number }> | undefined;
    const groupBy = body.groupBy !== undefined ? body.groupBy : view?.groupBy;
    if (groupBy) {
      const t = groupBy === 'title' ? 'title' : `properties ->> '${groupBy.replace(/'/g, '')}'`;
      groups = (await s.db.query(`select ${t} as key, count(*)::int as count from pages where id = any($1::uuid[]) group by 1 order by 1 nulls last`, [ids])).rows;
    }
    return { total: ids.length, rows: pageIds.map((x) => rowDto(byId.get(x))), aggregations: aggs, groups, schemaVersion: c.version };
  });

  app.post('/api/v1/collections/:id/rows', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const body = parse(z.object({ title: z.string().max(500).default(''), values: z.record(z.string(), z.unknown()).default({}), afterId: uuid.optional(), requestId: z.string().max(100).optional() }), req.body);
    const c = await loadCollection(s, id, user.orgId);
    const values: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body.values)) {
      const f = c.schema.find((x) => x.id === k);
      if (!f) throw badRequest(`Неизвестное поле ${k}`);
      values[k] = coerceValue(f, v);
    }
    await requirePage(s.db, user, c.page_id, 'create');
    const page = (await s.db.query('select space_id from pages where id = $1', [c.page_id])).rows[0];
    const row = await tx(s.db, async (q) => (await createPage(q, user, actorOf(req), { spaceId: page.space_id, parentId: c.page_id, title: body.title, properties: values, collectionId: id, afterId: body.afterId, requestId: body.requestId ?? null })).page);
    return { row: rowDto(row) };
  });

  /**
   * Cell update with optimistic concurrency per value: if someone changed the same cell meanwhile, the server
   * answers 409 with the current value instead of overwriting it silently.
   */
  app.patch('/api/v1/collections/:id/rows/:rowId', async (req) => {
    const user = requireUser(req);
    const { id, rowId } = parse(z.object({ id: uuid, rowId: uuid }), req.params);
    const body = parse(z.object({ title: z.string().max(500).optional(), values: z.record(z.string(), z.unknown()).default({}), expected: z.record(z.string(), z.unknown()).optional() }), req.body);
    const c = await loadCollection(s, id, user.orgId);
    await requirePage(s.db, user, rowId, 'edit');
    const row = await tx(s.db, async (q) => {
      const cur = (await q.query('select * from pages where id = $1 and collection_id = $2 for update', [rowId, id])).rows[0];
      if (!cur) throw notFound('Запись не найдена');
      const next = { ...cur.properties };
      const before: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(body.values)) {
        const f = c.schema.find((x) => x.id === k);
        if (!f) throw badRequest(`Неизвестное поле ${k}`);
        if (body.expected && k in body.expected && JSON.stringify(cur.properties[k] ?? null) !== JSON.stringify(body.expected[k] ?? null))
          throw conflict('cell_conflict', `Значение поля «${f.name}» изменено другим пользователем`, { fieldId: k, current: cur.properties[k] ?? null });
        before[k] = cur.properties[k] ?? null;
        next[k] = coerceValue(f, v);
      }
      const r = (await q.query(`update pages set properties = $2, title = coalesce($3, title), version = version + 1, updated_at = now(), updated_by = $4 where id = $1 returning *`, [rowId, next, body.title ?? null, user.id])).rows[0];
      await q.query(`insert into page_events (org_id, page_id, actor_id, type, data) values ($1, $2, $3, 'properties', $4)`, [user.orgId, rowId, user.id, { before, after: body.values, titleBefore: body.title !== undefined ? cur.title : undefined }]);
      await q.query(`insert into outbox (topic, payload) values ('index-page', $1)`, [{ pageId: rowId }]);
      return r;
    });
    s.bus.emit({ type: 'page-changed', orgId: user.orgId, pageId: c.page_id, fields: ['rows'] });
    return { row: rowDto(row) };
  });

  /** Mass edit: one field for many rows, all-or-nothing. */
  app.post('/api/v1/collections/:id/rows/bulk', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const body = parse(z.object({ rowIds: z.array(uuid).min(1).max(5000), action: z.enum(['set', 'delete', 'duplicate']), fieldId: z.string().optional(), value: z.unknown().optional() }), req.body);
    const c = await loadCollection(s, id, user.orgId);
    await requirePage(s.db, user, c.page_id, 'edit');
    const count = await tx(s.db, async (q) => {
      if (body.action === 'delete') {
        for (const r of body.rowIds) await trashPage(q, user, actorOf(req), r);
        return body.rowIds.length;
      }
      if (body.action === 'duplicate') {
        const rows = (await q.query('select * from pages where id = any($1::uuid[]) and collection_id = $2 and deleted_at is null', [body.rowIds, id])).rows;
        for (const r of rows) await createPage(q, user, actorOf(req), { spaceId: r.space_id, parentId: c.page_id, title: r.title + ' (копия)', properties: r.properties, collectionId: id, afterId: r.id });
        return rows.length;
      }
      const f = c.schema.find((x) => x.id === body.fieldId);
      if (!f) throw badRequest('Не указано поле');
      const v = coerceValue(f, body.value);
      const prev = (await q.query(`select id, properties -> $3::text as v from pages where id = any($1::uuid[]) and collection_id = $2`, [body.rowIds, id, f.id])).rows;
      await q.query(`update pages set properties = jsonb_set(properties, array[$3::text], $4::jsonb, true), version = version + 1, updated_at = now(), updated_by = $5 where id = any($1::uuid[]) and collection_id = $2`, [body.rowIds, id, f.id, JSON.stringify(v), user.id]);
      await q.query(`insert into page_events (org_id, page_id, actor_id, type, data) values ($1, $2, $3, 'bulk-edit', $4)`, [user.orgId, c.page_id, user.id, { fieldId: f.id, value: v, before: prev.slice(0, 5000) }]);
      return prev.length;
    });
    s.bus.emit({ type: 'page-changed', orgId: user.orgId, pageId: c.page_id, fields: ['rows'] });
    return { affected: count };
  });

  app.post('/api/v1/collections/:id/rows/:rowId/move', async (req) => {
    const user = requireUser(req);
    const { id, rowId } = parse(z.object({ id: uuid, rowId: uuid }), req.params);
    const body = parse(z.object({ beforeId: uuid.nullable().optional(), afterId: uuid.nullable().optional() }), req.body);
    const c = await loadCollection(s, id, user.orgId);
    await requirePage(s.db, user, c.page_id, 'edit');
    await tx(s.db, async (q) => {
      const rows = (await q.query(`select id, sort_key from pages where collection_id = $1 and deleted_at is null order by sort_key collate "C"`, [id])).rows;
      const idx = body.beforeId ? rows.findIndex((r) => r.id === body.beforeId) : body.afterId ? rows.findIndex((r) => r.id === body.afterId) + 1 : rows.length;
      const others = rows.filter((r) => r.id !== rowId);
      const pos = Math.max(0, Math.min(others.length, idx - (rows.findIndex((r) => r.id === rowId) < idx ? 1 : 0)));
      await q.query('update pages set sort_key = $2 where id = $1', [rowId, keyBetween(others[pos - 1]?.sort_key ?? null, others[pos]?.sort_key ?? null)]);
    });
    return { ok: true };
  });

  app.get('/api/v1/collections/:id/export', async (req, reply) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const { format } = parse(z.object({ format: z.enum(['csv', 'xlsx']).default('csv') }), req.query);
    const c = await loadCollection(s, id, user.orgId);
    const acc = await requirePage(s.db, user, c.page_id, 'export');
    const all = (await s.db.query(`select id, title, properties from pages where collection_id = $1 and deleted_at is null order by sort_key collate "C"`, [id])).rows;
    const vis = await visibleRowIds(s.db, user, c, all.map((r) => r.id), acc);
    const header = ['Название', ...c.schema.map((f) => f.name)];
    const fmt = (f: Field, v: unknown) => (v === null || v === undefined ? '' : Array.isArray(v) ? v.join(', ') : f.type === 'checkbox' ? (v ? 'да' : 'нет') : String(v));
    const data = all.filter((r) => vis.has(r.id)).map((r) => [r.title, ...c.schema.map((f) => fmt(f, r.properties?.[f.id]))]);
    const filename = encodeURIComponent(c.name);
    if (format === 'csv') {
      reply.header('content-disposition', `attachment; filename="collection.csv"; filename*=UTF-8''${filename}.csv`).type('text/csv; charset=utf-8');
      return '﻿' + Papa.unparse([header, ...data], { delimiter: ';' });
    }
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(c.name.slice(0, 31).replace(/[\\/?*[\]:]/g, ' '));
    ws.addRow(header).font = { bold: true };
    for (const r of all.filter((x) => vis.has(x.id))) ws.addRow([r.title, ...c.schema.map((f) => (f.type === 'number' ? r.properties?.[f.id] ?? null : fmt(f, r.properties?.[f.id])))]);
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    reply.header('content-disposition', `attachment; filename="collection.xlsx"; filename*=UTF-8''${filename}.xlsx`).type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return Buffer.from(await wb.xlsx.writeBuffer());
  });
}
