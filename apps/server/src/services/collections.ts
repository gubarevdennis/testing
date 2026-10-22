import { z } from 'zod';
import type { Queryable } from '../db/pool.js';
import { accessForPages, pageAccess, type AuthUser, type PageAccess } from '../acl/engine.js';
import { badRequest } from '../lib/errors.js';

export const FIELD_TYPES = ['text', 'number', 'date', 'checkbox', 'select', 'multiselect', 'status', 'person', 'url', 'email', 'file', 'relation'] as const;

export const fieldSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]{1,40}$/i),
  name: z.string().min(1).max(200),
  type: z.enum(FIELD_TYPES),
  options: z.array(z.object({ id: z.string().max(40), name: z.string().max(200), color: z.string().max(20).optional() })).max(200).optional(),
  relationCollectionId: z.string().uuid().optional(),
  description: z.string().max(500).optional(),
});
export type Field = z.infer<typeof fieldSchema>;

export const conditionSchema = z.object({
  fieldId: z.string(),
  cmp: z.enum(['eq', 'neq', 'contains', 'not_contains', 'gt', 'gte', 'lt', 'lte', 'empty', 'not_empty', 'checked', 'unchecked', 'before', 'after']),
  value: z.unknown().optional(),
});
export const filterSchema = z.object({ op: z.enum(['and', 'or']).default('and'), conditions: z.array(conditionSchema).max(30).default([]) });

export const viewSchema = z.object({
  id: z.string().max(40),
  name: z.string().max(200),
  type: z.enum(['table', 'list', 'board', 'gallery']).default('table'),
  filter: filterSchema.optional(),
  sorts: z.array(z.object({ fieldId: z.string(), dir: z.enum(['asc', 'desc']) })).max(5).optional(),
  groupBy: z.string().nullable().optional(),
  hidden: z.array(z.string()).optional(),
  order: z.array(z.string()).optional(),
  widths: z.record(z.string(), z.number()).optional(),
  frozen: z.number().int().min(0).max(5).optional(),
  aggregations: z.record(z.string(), z.enum(['count', 'sum', 'avg', 'min', 'max', 'filled', 'empty'])).optional(),
  coverFieldId: z.string().nullable().optional(),
});
export type View = z.infer<typeof viewSchema>;

/** SQL expression for a field value. `title` is the row page title. */
function fieldExpr(field: Field | 'title'): string {
  if (field === 'title') return 'p.title';
  return `(p.properties -> '${field.id.replace(/'/g, '')}')`;
}

function textExpr(field: Field | 'title') {
  return field === 'title' ? 'p.title' : `(p.properties ->> '${field.id.replace(/'/g, '')}')`;
}

/** Builds WHERE fragments for a view filter; values go through parameters only. */
export function buildFilter(schema: Field[], filter: z.infer<typeof filterSchema> | undefined, params: unknown[]): string {
  if (!filter?.conditions.length) return 'true';
  const parts: string[] = [];
  for (const c of filter.conditions) {
    const field = c.fieldId === 'title' ? 'title' : schema.find((f) => f.id === c.fieldId);
    if (!field) continue;
    const t = textExpr(field);
    const typ = field === 'title' ? 'text' : field.type;
    const push = (v: unknown) => {
      params.push(v);
      return '$' + params.length;
    };
    switch (c.cmp) {
      case 'empty':
        parts.push(`(${t} is null or ${t} = '' or ${t} = '[]')`);
        break;
      case 'not_empty':
        parts.push(`(${t} is not null and ${t} <> '' and ${t} <> '[]')`);
        break;
      case 'checked':
        parts.push(`coalesce((${t})::boolean, false)`);
        break;
      case 'unchecked':
        parts.push(`not coalesce((${t})::boolean, false)`);
        break;
      case 'contains':
        if (typ === 'multiselect') parts.push(`coalesce(${fieldExpr(field)} ? ${push(String(c.value))}, false)`);
        else parts.push(`${t} ilike '%' || ${push(String(c.value ?? ''))} || '%'`);
        break;
      case 'not_contains':
        parts.push(`coalesce(${t}, '') not ilike '%' || ${push(String(c.value ?? ''))} || '%'`);
        break;
      case 'eq':
        parts.push(typ === 'number' ? `(${t})::numeric = ${push(Number(c.value))}` : `${t} = ${push(String(c.value ?? ''))}`);
        break;
      case 'neq':
        parts.push(typ === 'number' ? `(${t})::numeric is distinct from ${push(Number(c.value))}` : `${t} is distinct from ${push(String(c.value ?? ''))}`);
        break;
      case 'gt':
      case 'gte':
      case 'lt':
      case 'lte': {
        const op = { gt: '>', gte: '>=', lt: '<', lte: '<=' }[c.cmp];
        parts.push(typ === 'date' ? `(${t})::date ${op} ${push(String(c.value))}::date` : `(${t})::numeric ${op} ${push(Number(c.value))}`);
        break;
      }
      case 'before':
        parts.push(`(${t})::date < ${push(String(c.value))}::date`);
        break;
      case 'after':
        parts.push(`(${t})::date > ${push(String(c.value))}::date`);
        break;
    }
  }
  if (!parts.length) return 'true';
  return '(' + parts.join(filter.op === 'or' ? ' or ' : ' and ') + ')';
}

export function buildOrder(schema: Field[], sorts: View['sorts']): string {
  const parts: string[] = [];
  for (const s of sorts ?? []) {
    const field = s.fieldId === 'title' ? 'title' : schema.find((f) => f.id === s.fieldId);
    if (!field) continue;
    const t = textExpr(field);
    const typ = field === 'title' ? 'text' : field.type;
    const expr = typ === 'number' ? `nullif(${t}, '')::numeric` : typ === 'date' ? `nullif(${t}, '')::date` : typ === 'checkbox' ? `coalesce((${t})::boolean, false)` : `lower(${t})`;
    parts.push(`${expr} ${s.dir === 'desc' ? 'desc' : 'asc'} nulls last`);
  }
  parts.push('p.sort_key collate "C"');
  return parts.join(', ');
}

/** Validates and normalises a value for a field type (rejects incompatible values instead of storing garbage). */
export function coerceValue(field: Field, value: unknown): unknown {
  if (value === null || value === undefined || value === '') return null;
  switch (field.type) {
    case 'number': {
      const n = typeof value === 'number' ? value : Number(String(value).replace(/[  ]/g, '').replace(',', '.'));
      if (!Number.isFinite(n)) throw badRequest(`Поле «${field.name}»: ожидается число`);
      return n;
    }
    case 'date': {
      const s = String(value);
      if (!/^\d{4}-\d{2}-\d{2}/.test(s) || Number.isNaN(Date.parse(s))) throw badRequest(`Поле «${field.name}»: ожидается дата ГГГГ-ММ-ДД`);
      return s.slice(0, 10);
    }
    case 'checkbox':
      return value === true || value === 'true' || value === 1 || value === 'да';
    case 'multiselect':
      return (Array.isArray(value) ? value : [value]).map(String).slice(0, 100);
    case 'url': {
      const s = String(value);
      if (!/^https?:\/\//i.test(s)) throw badRequest(`Поле «${field.name}»: ожидается ссылка http(s)`);
      return s;
    }
    case 'email': {
      const s = String(value);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) throw badRequest(`Поле «${field.name}»: ожидается email`);
      return s;
    }
    default:
      return typeof value === 'string' ? value.slice(0, 10_000) : value;
  }
}

/** Visible rows of a collection (ACL: rows inherit from the collection page; exceptions checked individually). */
export async function visibleRowIds(q: Queryable, user: AuthUser, collection: { id: string; page_id: string }, rowIds: string[], collectionAccess: PageAccess): Promise<Set<string>> {
  if (!rowIds.length) return new Set();
  const special = (
    await q.query(
      `select p.id from pages p where p.id = any($1::uuid[]) and (not p.inherit_permissions or exists (select 1 from grants g where g.resource_type = 'page' and g.resource_id = p.id and g.revoked_at is null))`,
      [rowIds],
    )
  ).rows.map((r) => r.id);
  const set = new Set(collectionAccess.actions.view ? rowIds.filter((id) => !special.includes(id)) : []);
  if (special.length) {
    const acc = await accessForPages(q, user, special);
    for (const id of special) if (acc.get(id)?.actions.view) set.add(id);
  }
  return set;
}

export async function collectionAccess(q: Queryable, user: AuthUser, pageId: string) {
  return pageAccess(q, user, pageId);
}
