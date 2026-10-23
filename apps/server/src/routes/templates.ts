import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { tx, type Queryable } from '../db/pool.js';
import { actorOf, parse, requireUser, type Services } from '../app.js';
import { accessForSpaces, isOrgAdmin, requirePage, requireSpace } from '../acl/engine.js';
import { audit } from '../services/audit.js';
import { copyContentAttachments } from '../services/attachment-copy.js';
import { TEMPLATES } from '../templates/library.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { getKbSchema, ensureBlockIds, walk, type PMNode } from '@kb/shared';

const uuid = z.string().uuid();

/** Installs/updates the built-in library for an organisation (idempotent; versions bump on change). */
export async function installBuiltinTemplates(q: Queryable, orgId: string) {
  for (const t of TEMPLATES) {
    const cur = (await q.query('select id, content, version from templates where org_id = $1 and key = $2', [orgId, t.key])).rows[0];
    if (!cur) {
      const r = await q.query(
        `insert into templates (org_id, key, name, description, category, icon, content, properties, required_properties, builtin) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, true) returning id`,
        [orgId, t.key, t.name, t.description, t.category, t.icon, t.content, t.properties ?? {}, t.requiredProperties ?? []],
      );
      await q.query('insert into template_versions (template_id, version, content, properties) values ($1, 1, $2, $3)', [r.rows[0].id, t.content, t.properties ?? {}]);
    } else if (JSON.stringify(cur.content) !== JSON.stringify(t.content)) {
      await q.query(`update templates set content = $2, name = $3, description = $4, category = $5, icon = $6, properties = $7, version = version + 1, updated_at = now() where id = $1`, [cur.id, t.content, t.name, t.description, t.category, t.icon, t.properties ?? {}]);
      await q.query('insert into template_versions (template_id, version, content, properties) values ($1, $2, $3, $4)', [cur.id, cur.version + 1, t.content, t.properties ?? {}]);
    }
  }
}

function stripIds(doc: PMNode): PMNode {
  const d = structuredClone(doc);
  walk(d, (n) => {
    if (n.attrs?.id) n.attrs = { ...n.attrs, id: null };
  });
  return d;
}

export async function templateRoutes(app: FastifyInstance, s: Services) {
  app.get('/api/v1/templates', async (req) => {
    const user = requireUser(req);
    const { spaceId } = parse(z.object({ spaceId: uuid.optional() }), req.query);
    const n = await s.db.query('select count(*)::int c from templates where org_id = $1 and builtin', [user.orgId]);
    if (!n.rows[0].c) await tx(s.db, (q) => installBuiltinTemplates(q, user.orgId));
    const spaces = await accessForSpaces(s.db, user);
    const rows = (
      await s.db.query(
        `select t.id, t.key, t.name, t.description, t.category, t.icon, t.default_title, t.builtin, t.space_id, t.version, t.properties, t.required_properties, t.updated_at, sp.name as space_name
           from templates t left join spaces sp on sp.id = t.space_id where t.org_id = $1 and t.deleted_at is null and t.published order by t.builtin, t.category, t.name`,
        [user.orgId],
      )
    ).rows.filter((t) => !t.space_id || spaces.get(t.space_id)?.actions.view);
    const fav = ((await s.db.query('select preferences from users where id = $1', [user.id])).rows[0].preferences?.favoriteTemplates ?? []) as string[];
    return { templates: rows.map((t) => ({ ...t, favorite: fav.includes(t.id), recommended: !!spaceId && t.space_id === spaceId })) };
  });

  app.get('/api/v1/templates/:id', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const t = (await s.db.query('select * from templates where id = $1 and org_id = $2 and deleted_at is null', [id, user.orgId])).rows[0];
    if (!t) throw notFound('Шаблон не найден');
    if (t.space_id) await requireSpace(s.db, user, t.space_id, 'view');
    return { template: t };
  });

  /**
   * Creates a template of a space (or of the organisation for admins) either from a page (`pageId`, the page stays
   * unchanged) or directly from ProseMirror `content` (validated against the editor schema).
   */
  app.post('/api/v1/templates', async (req) => {
    const user = requireUser(req);
    const body = parse(
      z
        .object({
          pageId: uuid.optional(),
          content: z.object({ type: z.literal('doc') }).passthrough().optional(),
          title: z.string().max(500).optional(),
          name: z.string().min(1).max(200),
          description: z.string().max(1000).default(''),
          category: z.string().max(100).default('Пространство'),
          icon: z.string().max(64).optional(),
          spaceId: uuid.nullable().optional(),
          properties: z.record(z.string(), z.unknown()).optional(),
          requiredProperties: z.array(z.string().max(100)).max(30).optional(),
        })
        .refine((b) => !!b.pageId !== !!b.content, { message: 'Укажите либо pageId, либо content', path: ['content'] }),
      req.body,
    );
    if (body.pageId) await requirePage(s.db, user, body.pageId, 'view');
    if (body.spaceId) await requireSpace(s.db, user, body.spaceId, 'manage_space');
    else if (!isOrgAdmin(user)) throw forbidden('Шаблоны организации создаёт администратор');
    let content: PMNode;
    let page: { properties: Record<string, unknown> | null; icon: string | null } = { properties: body.properties ?? {}, icon: null };
    if (body.pageId) {
      content = stripIds((await s.hub.snapshot(body.pageId)).json);
      page = (await s.db.query('select properties, icon from pages where id = $1', [body.pageId])).rows[0];
    } else {
      if (JSON.stringify(body.content).length > 2_000_000) throw badRequest('Слишком большой шаблон');
      try {
        content = stripIds(body.content as PMNode);
        getKbSchema().nodeFromJSON(ensureBlockIds(structuredClone(content))).check();
      } catch (e) {
        throw badRequest('Содержимое шаблона не соответствует схеме документа', { reason: (e as Error).message });
      }
    }
    if (body.pageId) getKbSchema().nodeFromJSON(ensureBlockIds(structuredClone(content))).check();
    const t = await tx(s.db, async (q) => {
      // the template's pictures and files become its own assets (independent of the source page, D-39)
      content = (await copyContentAttachments(q, user, content, null, { actor: actorOf(req) })).doc;
      const r = (await q.query(`insert into templates (org_id, space_id, name, description, category, icon, content, properties, required_properties, created_by, default_title) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning *`, [user.orgId, body.spaceId ?? null, body.name, body.description, body.category, body.icon ?? page.icon, content, page.properties ?? {}, body.requiredProperties ?? [], user.id, body.title?.trim() || null])).rows[0];
      await q.query('insert into template_versions (template_id, version, content, properties, created_by) values ($1, 1, $2, $3, $4)', [r.id, content, page.properties ?? {}, user.id]);
      await audit(q, actorOf(req), { action: 'template.create', targetType: 'template', targetId: r.id, details: { name: body.name, spaceId: body.spaceId ?? null, source: body.pageId ? 'page' : 'content', pageId: body.pageId ?? null } });
      return r;
    });
    return { template: t };
  });

  app.patch('/api/v1/templates/:id', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const body = parse(z.object({ name: z.string().min(1).max(200).optional(), description: z.string().max(1000).optional(), category: z.string().max(100).optional(), icon: z.string().max(64).optional(), published: z.boolean().optional(), fromPageId: uuid.optional() }), req.body);
    const t = (await s.db.query('select * from templates where id = $1 and org_id = $2 and deleted_at is null', [id, user.orgId])).rows[0];
    if (!t) throw notFound();
    if (t.builtin) throw forbidden('Встроенные шаблоны не изменяются — создайте копию');
    if (t.space_id) await requireSpace(s.db, user, t.space_id, 'manage_space');
    else if (!isOrgAdmin(user)) throw forbidden();
    let content = t.content;
    if (body.fromPageId) {
      await requirePage(s.db, user, body.fromPageId, 'view');
      content = stripIds((await s.hub.snapshot(body.fromPageId)).json);
    }
    await tx(s.db, async (q) => {
      if (body.fromPageId) content = (await copyContentAttachments(q, user, content, null, { actor: actorOf(req) })).doc;
      await q.query(
        `update templates set name = coalesce($2, name), description = coalesce($3, description), category = coalesce($4, category), icon = coalesce($5, icon), published = coalesce($6, published), content = $7, version = version + $8, updated_at = now() where id = $1`,
        [id, body.name ?? null, body.description ?? null, body.category ?? null, body.icon ?? null, body.published ?? null, content, body.fromPageId ? 1 : 0],
      );
      if (body.fromPageId) await q.query('insert into template_versions (template_id, version, content, properties, created_by) values ($1, $2, $3, $4, $5)', [id, t.version + 1, content, t.properties, user.id]);
      await audit(q, actorOf(req), { action: 'template.update', targetType: 'template', targetId: id, details: { ...body } });
    });
    return { ok: true };
  });

  app.delete('/api/v1/templates/:id', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const t = (await s.db.query('select * from templates where id = $1 and org_id = $2 and deleted_at is null', [id, user.orgId])).rows[0];
    if (!t) throw notFound();
    if (t.builtin) throw forbidden('Встроенный шаблон можно только скрыть');
    if (t.space_id) await requireSpace(s.db, user, t.space_id, 'manage_space');
    else if (!isOrgAdmin(user)) throw forbidden();
    await tx(s.db, async (q) => {
      await q.query('update templates set deleted_at = now() where id = $1', [id]);
      await audit(q, actorOf(req), { action: 'template.delete', targetType: 'template', targetId: id });
    });
    return { ok: true };
  });

  app.put('/api/v1/templates/:id/favorite', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const { favorite } = parse(z.object({ favorite: z.boolean() }), req.body);
    const prefs = (await s.db.query('select preferences from users where id = $1', [user.id])).rows[0].preferences ?? {};
    const list = new Set<string>(prefs.favoriteTemplates ?? []);
    if (favorite) list.add(id);
    else list.delete(id);
    await s.db.query(`update users set preferences = preferences || $2::jsonb where id = $1`, [user.id, { favoriteTemplates: [...list] }]);
    return { ok: true };
  });
}
