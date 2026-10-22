import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { walk, type Level, type PMNode } from '@kb/shared';
import { tx, type Queryable } from '../db/pool.js';
import { actorOf, parse, requireUser, type Services } from '../app.js';
import { accessForPages, bumpAclEpoch, canManagePeople, canReadAudit, combine, isOrgAdmin, orgGuestsDisabled, orgPeople, policyOf, requirePage, usersWithAction, type AuthUser } from '../acl/engine.js';
import { toAuthUser } from '../auth/sessions.js';
import { hashPassword, verifyPassword } from '../auth/passwords.js';
import { audit, auditStandalone, type AuditActor } from '../services/audit.js';
import { orgSettings } from '../services/org.js';
import { getPage } from '../services/pages.js';
import { docToHtml } from '../convert/html.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { randomToken, sha256, signToken, verifyToken } from '../lib/crypto.js';

const uuid = z.string().uuid();
const LINK_MAX_DAYS = 365;

/** Is a page of a personal space visible to anybody besides its owner (R-ACL-051 «не полностью личная»)? */
export async function personalExposure(q: Queryable, pageId: string): Promise<{ personal: boolean; shared: boolean; people: number; groups: number; org: boolean; publicLinks: number }> {
  const sp = (await q.query(`select s.kind, s.owner_user_id from pages p join spaces s on s.id = p.space_id where p.id = $1`, [pageId])).rows[0];
  if (!sp || sp.kind !== 'personal') return { personal: false, shared: false, people: 0, groups: 0, org: false, publicLinks: 0 };
  const r = (
    await q.query(
      `select g.subject_type, g.subject_id from page_ancestors a join grants g on g.resource_type = 'page' and g.resource_id = a.ancestor_id
        where a.page_id = $1 and g.revoked_at is null and g.level <> 'none' and (g.expires_at is null or g.expires_at > now())
          and not (g.subject_type = 'user' and g.subject_id = $2)`,
      [pageId, sp.owner_user_id],
    )
  ).rows;
  const links = (await q.query(`select count(*)::int c from share_links l join page_ancestors a on a.ancestor_id = l.page_id and a.page_id = $1 where l.revoked_at is null and (l.expires_at is null or l.expires_at > now()) and (l.page_id = $1 or l.include_children)`, [pageId])).rows[0].c;
  const people = new Set(r.filter((x) => x.subject_type === 'user').map((x) => x.subject_id)).size;
  const groups = new Set(r.filter((x) => x.subject_type === 'group').map((x) => x.subject_id)).size;
  const org = r.some((x) => x.subject_type === 'org');
  return { personal: true, shared: people + groups + links > 0 || org, people, groups, org, publicLinks: links };
}

// ------------------------------------------------------------------------------------------- public links

interface LinkRow {
  id: string;
  org_id: string;
  page_id: string;
  password_hash: string | null;
  include_children: boolean;
  allow_download: boolean;
  allow_index: boolean;
  created_by: string;
  expires_at: Date | null;
  revoked_at: Date | null;
}

/**
 * A link works only while: it is not revoked or expired, public links are enabled for the organisation,
 * the page is not deleted and the person who created it is active and still allowed to share the page.
 */
async function activeLink(s: Services, token: string): Promise<{ link: LinkRow; policy: ReturnType<typeof policyOf> } | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const link = (await s.db.query(`select * from share_links where token_hash = $1`, [sha256(token)])).rows[0] as LinkRow | undefined;
  if (!link || link.revoked_at || (link.expires_at && link.expires_at <= new Date())) return null;
  if (!(await orgSettings(s.db, link.org_id)).publicLinksEnabled) return null;
  const creator = (await s.db.query(`select * from users where id = $1 and status = 'active' and (access_expires_at is null or access_expires_at > now())`, [link.created_by])).rows[0];
  if (!creator) return null;
  const acc = (await accessForPages(s.db, toAuthUser(creator), [link.page_id])).get(link.page_id);
  if (!acc || acc.deleted || !acc.actions.share) return null;
  return { link, policy: acc.policy };
}

/** Pages reachable through a link: the page itself, plus its live subtree when include_children is set. */
async function inScope(q: Queryable, link: LinkRow, pageId: string): Promise<boolean> {
  if (pageId === link.page_id) return true;
  if (!link.include_children || !/^[0-9a-f-]{36}$/i.test(pageId)) return false;
  const r = await q.query(`select 1 from page_ancestors a join pages p on p.id = a.page_id where a.page_id = $1 and a.ancestor_id = $2 and p.deleted_at is null`, [pageId, link.page_id]);
  return !!r.rowCount;
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const PUBLIC_CSS = `body{font-family:Inter,"Segoe UI",Roboto,Arial,sans-serif;color:#24272D;line-height:1.6;max-width:820px;margin:32px auto;padding:0 16px;font-size:15px}
a{color:#2F5FA8}img{max-width:100%;height:auto}table{border-collapse:collapse;width:100%}td,th{border:1px solid #E5E8ED;padding:6px 8px;vertical-align:top}
pre{background:#F3F5F7;border-radius:8px;padding:12px;white-space:pre-wrap}.kb-public-bar{font-size:13px;color:#68717D;border-bottom:1px solid #E5E8ED;padding-bottom:8px;margin-bottom:24px}
.kb-callout{border-radius:10px;padding:12px 16px;background:#EAF1FB}.kb-public-children{margin-top:32px;border-top:1px solid #E5E8ED;padding-top:12px}
form{display:flex;flex-direction:column;gap:8px;max-width:320px}input{font:inherit;padding:8px;border:1px solid #C9CED6;border-radius:8px}button{font:inherit;padding:8px 12px;border-radius:8px;border:0;background:#2F5FA8;color:#fff}`;

function publicHtml(reply: FastifyReply, link: LinkRow | null, title: string, body: string, status = 200) {
  const robots = link?.allow_index ? 'index, nofollow' : 'noindex, nofollow, noarchive';
  return reply
    .status(status)
    .header('x-robots-tag', robots)
    .header('cache-control', 'no-store')
    .header('referrer-policy', 'no-referrer')
    .type('text/html; charset=utf-8')
    .send(
      `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="${robots}"><title>${esc(title)}</title><style>${PUBLIC_CSS}</style></head><body>${body}</body></html>`,
    );
}

const invalidLink = (reply: FastifyReply) =>
  publicHtml(reply, null, 'Ссылка недействительна', `<h1>Ссылка недействительна</h1><p>Срок действия ссылки истёк, она отозвана или публичный доступ отключён.</p>`, 404);

const cookieName = (linkId: string) => 'kb_pl_' + linkId.replace(/-/g, '').slice(0, 16);

/** Renders the document for anonymous readers: in-app links and attachments are rewritten to link-scoped URLs. */
async function renderPublic(s: Services, link: LinkRow, token: string, pageId: string, policy: ReturnType<typeof policyOf>): Promise<{ title: string; html: string } | null> {
  const p = await getPage(s.db, pageId);
  if (!p || p.deleted_at) return null;
  let content: PMNode;
  let title = p.title;
  if (policy.publishingMode === 'publish') {
    // Readers of a "publish" space see only published revisions; so do anonymous readers.
    if (!p.published_revision_id) return { title, html: '<p>Документ ещё не опубликован.</p>' };
    const rev = (await s.db.query('select content, title from page_revisions where id = $1', [p.published_revision_id])).rows[0];
    content = rev.content;
    title = rev.title;
  } else content = structuredClone((await s.hub.snapshot(pageId)).json);
  const base = `/pub/${token}`;
  const linked = new Set<string>();
  walk(content, (n) => {
    if ((n.type === 'pageLink' || n.type === 'pageMention') && n.attrs?.pageId) linked.add(String(n.attrs.pageId));
  });
  const reachable = new Set<string>();
  for (const id of linked) if (await inScope(s.db, link, id)) reachable.add(id);
  const canDownload = link.allow_download && policy.allowDownload;
  walk(content, (n) => {
    if (n.type === 'image' && n.attrs) n.attrs.src = n.attrs.attachmentId ? `${base}/files/${n.attrs.attachmentId}` : /^https:\/\//.test(String(n.attrs.src ?? '')) ? n.attrs.src : null;
    if ((n.type === 'fileBlock' || n.type === 'embed') && n.attrs) n.attrs.href = n.attrs.attachmentId && canDownload ? `${base}/files/${n.attrs.attachmentId}?download=1` : '#';
    if ((n.type === 'pageLink' || n.type === 'pageMention') && n.attrs && !reachable.has(String(n.attrs.pageId))) n.attrs.title = 'Страница недоступна по ссылке';
  });
  let html = docToHtml(content);
  // Links to pages of the shared subtree stay inside the link; all other in-app links are neutralised.
  html = html.replace(/href="\/p\/([0-9a-f-]{36})([^"]*)"/g, (_m, id: string, rest: string) => (reachable.has(id) ? `href="${base}/p/${id}${rest.startsWith('#') ? rest : ''}"` : 'href="#"'));
  html = html.replace(/href="\/api\/[^"]*"/g, 'href="#"').replace(/src="\/api\/[^"]*"/g, 'src=""');
  if (link.include_children) {
    const kids = (await s.db.query(`select id, title from pages where parent_id = $1 and deleted_at is null order by sort_key collate "C" limit 200`, [pageId])).rows;
    if (kids.length) html += `<nav class="kb-public-children"><b>Вложенные страницы</b><ul>${kids.map((k) => `<li><a href="${base}/p/${k.id}">${esc(k.title || 'Без названия')}</a></li>`).join('')}</ul></nav>`;
  }
  return { title, html };
}

/** One audit record per link + client address per 10 minutes (anonymous reads can be numerous). */
const viewSeen = new Map<string, number>();
function auditPublicView(s: Services, req: FastifyRequest, link: LinkRow, pageId: string) {
  const key = link.id + '|' + req.ip + '|' + pageId;
  const now = Date.now();
  if ((viewSeen.get(key) ?? 0) > now - 600_000) return;
  viewSeen.set(key, now);
  if (viewSeen.size > 10_000) for (const [k, at] of viewSeen) if (at < now - 600_000) viewSeen.delete(k);
  void s.db.query(`update share_links set access_count = access_count + 1, last_access_at = now() where id = $1`, [link.id]).catch(() => undefined);
  void auditStandalone(s.db, { orgId: link.org_id, ip: req.ip, correlationId: req.correlationId }, { action: 'share_link.view', targetType: 'page', targetId: pageId, details: { linkId: link.id } }).catch(() => undefined);
}

function linkDto(l: any) {
  return { id: l.id, pageId: l.page_id, createdAt: l.created_at, createdBy: l.created_by, createdByName: l.created_by_name ?? null, expiresAt: l.expires_at, includeChildren: l.include_children, allowDownload: l.allow_download, allowIndex: l.allow_index, hasPassword: !!l.password_hash, accessCount: l.access_count, lastAccessAt: l.last_access_at };
}

// ------------------------------------------------------------------------------------------- emergency access

async function emergencyGrantFor(q: Queryable, row: any, approver: AuthUser, actor: AuditActor) {
  const g = (
    await q.query(
      `insert into grants (org_id, resource_type, resource_id, subject_type, subject_id, level, can_export, can_download, can_share, can_publish, expires_at, reason, granted_by)
       values ($1, 'page', $2, 'user', $3, 'view', false, false, false, false, now() + make_interval(hours => $4), $5, $6)
       on conflict do nothing returning *`,
      [row.org_id, row.page_id, row.requested_by, row.duration_hours, `Экстренный доступ: ${row.reason}`.slice(0, 500), approver.id],
    )
  ).rows[0];
  if (!g) throw conflict('grant_exists', 'У сотрудника уже есть явное разрешение на этот документ — экстренный доступ не нужен');
  await audit(q, actor, { action: 'emergency_access.approve', targetType: 'page', targetId: row.page_id, details: { requestId: row.id, requestedBy: row.requested_by, hours: row.duration_hours, grantId: g.id, reason: row.reason } });
  return g;
}

export async function aclExtraRoutes(app: FastifyInstance, s: Services) {
  // ---------------------------------------------------------------- public links (R-PUBLISH-009, E-2E-109, R-ACL-021)
  app.get('/api/v1/pages/:id/share-links', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    await requirePage(s.db, user, id, 'share');
    const rows = (await s.db.query(`select l.*, u.name as created_by_name from share_links l left join users u on u.id = l.created_by where l.page_id = $1 and l.revoked_at is null and (l.expires_at is null or l.expires_at > now()) order by l.created_at desc`, [id])).rows;
    return { enabled: (await orgSettings(s.db, user.orgId)).publicLinksEnabled, links: rows.map(linkDto) };
  });

  app.post('/api/v1/pages/:id/share-links', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const body = parse(
      z.object({
        expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
        password: z.string().min(6).max(200).nullable().optional(),
        includeChildren: z.boolean().default(false),
        allowDownload: z.boolean().default(false),
        allowIndex: z.boolean().default(false),
        /** The creator confirms having read the warning: copies downloaded through the link cannot be revoked. */
        acknowledged: z.literal(true),
      }),
      req.body,
    );
    const settings = await orgSettings(s.db, user.orgId);
    if (!settings.publicLinksEnabled) throw forbidden('Публичные ссылки отключены политикой организации');
    const acc = await requirePage(s.db, user, id, 'share');
    if (body.allowDownload && !acc.policy.allowDownload) throw forbidden('Скачивание запрещено политикой пространства');
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    if (expiresAt && expiresAt <= new Date()) throw badRequest('Срок действия должен быть в будущем');
    if (expiresAt && expiresAt.getTime() > Date.now() + LINK_MAX_DAYS * 86400_000) throw badRequest(`Срок действия публичной ссылки — не более ${LINK_MAX_DAYS} дней`);
    const token = randomToken(24);
    const passwordHash = body.password ? await hashPassword(body.password) : null;
    const row = await tx(s.db, async (q) => {
      const r = (
        await q.query(
          `insert into share_links (org_id, page_id, token_hash, password_hash, include_children, allow_download, allow_index, created_by, expires_at) values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning *`,
          [user.orgId, id, sha256(token), passwordHash, body.includeChildren, body.allowDownload, body.allowIndex, user.id, expiresAt],
        )
      ).rows[0];
      await audit(q, actorOf(req), { action: 'share_link.create', targetType: 'page', targetId: id, details: { linkId: r.id, expiresAt, includeChildren: body.includeChildren, allowDownload: body.allowDownload, allowIndex: body.allowIndex, password: !!passwordHash } });
      return r;
    });
    s.bus.emit({ type: 'acl-changed', orgId: user.orgId });
    return { link: linkDto(row), url: `${s.cfg.publicUrl}/pub/${token}`, path: `/pub/${token}` };
  });

  app.delete('/api/v1/share-links/:id', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    await tx(s.db, async (q) => {
      const l = (await q.query(`select * from share_links where id = $1 and org_id = $2 and revoked_at is null for update`, [id, user.orgId])).rows[0];
      if (!l) throw notFound('Ссылка не найдена');
      // Page managers and organisation administrators (incident response) may revoke.
      if (!isOrgAdmin(user)) await requirePage(q, user, l.page_id, 'share', { allowDeleted: true });
      await q.query(`update share_links set revoked_at = now(), revoked_by = $2 where id = $1`, [id, user.id]);
      await audit(q, actorOf(req), { action: 'share_link.revoke', targetType: 'page', targetId: l.page_id, details: { linkId: id } });
    });
    s.bus.emit({ type: 'acl-changed', orgId: user.orgId });
    return { ok: true };
  });

  /** Organisation-wide list of active public links (administrators: incident response, policy review). */
  app.get('/api/v1/admin/share-links', async (req) => {
    const user = requireUser(req);
    if (!isOrgAdmin(user) && !canReadAudit(user)) throw forbidden();
    const rows = (await s.db.query(`select l.*, u.name as created_by_name from share_links l left join users u on u.id = l.created_by where l.org_id = $1 and l.revoked_at is null and (l.expires_at is null or l.expires_at > now()) order by l.created_at desc limit 500`, [user.orgId])).rows;
    return { links: rows.map(linkDto) };
  });

  // Anonymous pages. Rate limited; the password form posts urlencoded data (no session, so no CSRF token: see app.ts). The prefix is /pub/ — /s/:id is the SPA route of a space.
  await app.register(async (pub) => {
    pub.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string', bodyLimit: 4096 }, (_req, body, done) => done(null, Object.fromEntries(new URLSearchParams(String(body)))));
    const limit = { config: { rateLimit: { max: 120, timeWindow: '1 minute', keyGenerator: (r: FastifyRequest) => r.ip } } };

    const unlocked = (req: FastifyRequest, link: LinkRow) => {
      if (!link.password_hash) return true;
      const v = req.cookies[cookieName(link.id)];
      const p = v ? verifyToken<{ l: string }>(s.cfg.secretKey, v) : null;
      return p?.l === link.id;
    };
    const passwordForm = (reply: FastifyReply, link: LinkRow, token: string, error?: string) =>
      publicHtml(
        reply,
        link,
        'Документ защищён паролем',
        `<h1>Документ защищён паролем</h1>${error ? `<p role="alert" style="color:#B42318">${esc(error)}</p>` : ''}<form method="post" action="/pub/${token}"><label for="pw">Пароль</label><input id="pw" name="password" type="password" autocomplete="off" autofocus required><button type="submit">Открыть</button></form>`,
        error ? 401 : 200,
      );

    const show = async (req: FastifyRequest, reply: FastifyReply, token: string, pageId: string | null) => {
      const a = await activeLink(s, token);
      if (!a) return invalidLink(reply);
      const { link, policy } = a;
      if (!unlocked(req, link)) return passwordForm(reply, link, token);
      const target = pageId ?? link.page_id;
      if (!(await inScope(s.db, link, target))) return invalidLink(reply);
      const r = await renderPublic(s, link, token, target, policy);
      if (!r) return invalidLink(reply);
      auditPublicView(s, req, link, target);
      const bar = `<div class="kb-public-bar">Документ открыт по публичной ссылке${link.expires_at ? ` · действует до ${link.expires_at.toLocaleDateString('ru-RU')}` : ''}${target !== link.page_id ? ` · <a href="/pub/${token}">к началу</a>` : ''}</div>`;
      return publicHtml(reply, link, r.title || 'Без названия', `${bar}<h1>${esc(r.title || 'Без названия')}</h1>${r.html}`);
    };

    pub.get('/pub/:token', limit, async (req, reply) => show(req, reply, (req.params as { token: string }).token, null));
    pub.get('/pub/:token/p/:pageId', limit, async (req, reply) => {
      const { token, pageId } = req.params as { token: string; pageId: string };
      return show(req, reply, token, pageId);
    });

    pub.post('/pub/:token', { config: { rateLimit: { max: 10, timeWindow: '1 minute', keyGenerator: (r: FastifyRequest) => r.ip } } }, async (req, reply) => {
      const { token } = req.params as { token: string };
      const a = await activeLink(s, token);
      if (!a) return invalidLink(reply);
      const password = String((req.body as Record<string, unknown> | null)?.password ?? '');
      if (!a.link.password_hash || !(await verifyPassword(a.link.password_hash, password))) {
        await auditStandalone(s.db, { orgId: a.link.org_id, ip: req.ip, correlationId: req.correlationId }, { action: 'share_link.password_failed', outcome: 'denied', targetType: 'page', targetId: a.link.page_id, details: { linkId: a.link.id } });
        return passwordForm(reply, a.link, token, 'Неверный пароль');
      }
      reply.setCookie(cookieName(a.link.id), signToken(s.cfg.secretKey, { l: a.link.id, exp: Date.now() + 12 * 3600_000 }), { path: `/pub/${token}`, httpOnly: true, sameSite: 'lax', secure: s.cfg.cookieSecure, maxAge: 12 * 3600 });
      return reply.redirect(`/pub/${token}`, 303);
    });

    pub.get('/pub/:token/files/:attachmentId', limit, async (req, reply) => {
      const { token, attachmentId } = req.params as { token: string; attachmentId: string };
      const download = (req.query as Record<string, string>)?.download === '1';
      const a = await activeLink(s, token);
      if (!a || !unlocked(req, a.link) || !/^[0-9a-f-]{36}$/i.test(attachmentId)) return reply.status(404).send({ error: { code: 'not_found', message: 'Не найдено' } });
      const att = (
        await s.db.query(
          `select a.page_id, v.mime, v.size, v.filename, b.storage_key from attachments a join attachment_versions v on v.attachment_id = a.id and v.version = a.current_version join blobs b on b.sha256 = v.blob_sha256
            where a.id = $1 and a.deleted_at is null`,
          [attachmentId],
        )
      ).rows[0];
      if (!att || !att.page_id || !(await inScope(s.db, a.link, att.page_id))) return reply.status(404).send({ error: { code: 'not_found', message: 'Не найдено' } });
      const image = /^image\/(png|jpeg|gif|webp|avif)$/.test(att.mime);
      // Viewing images is part of reading; any other file (or saving the original) needs the download permission of the link.
      if ((download || !image) && !(a.link.allow_download && a.policy.allowDownload)) return reply.status(403).send({ error: { code: 'forbidden', message: 'Скачивание по этой ссылке запрещено' } });
      if (download || !image) void auditStandalone(s.db, { orgId: a.link.org_id, ip: req.ip, correlationId: req.correlationId }, { action: 'share_link.download', targetType: 'attachment', targetId: attachmentId, details: { linkId: a.link.id, pageId: att.page_id } }).catch(() => undefined);
      reply
        .header('x-content-type-options', 'nosniff')
        .header('x-robots-tag', 'noindex, nofollow')
        .header('cache-control', 'no-store')
        .header('content-security-policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox")
        .header('content-disposition', `${download || !image ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(att.filename)}`);
      return reply.type(att.mime).send(await s.store.readBuffer(att.storage_key));
    });
  });

  // ---------------------------------------------------------------- "Только я" (R-ACL-021)
  /** Restricts a page to its current manager only: inheritance off, every other explicit grant revoked (with preview + confirmation). */
  app.post('/api/v1/pages/:id/access/only-me', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const { confirm } = parse(z.object({ confirm: z.boolean().default(false) }), req.body ?? {});
    const r = await tx(s.db, async (q) => {
      await requirePage(q, user, id, 'share');
      const viewers = (await usersWithAction(q, user.orgId, { type: 'page', id }, 'view')).filter((p) => p.id !== user.id);
      const links = (await q.query(`select count(*)::int c from share_links where page_id = $1 and revoked_at is null and (expires_at is null or expires_at > now())`, [id])).rows[0].c;
      if (!confirm) throw conflict('audience_change', 'Доступ потеряют все, кроме вас — требуется подтверждение', { removed: viewers.slice(0, 50).map((p) => ({ id: p.id, name: p.name })), removedCount: viewers.length, publicLinks: links });
      await q.query(`update grants set revoked_at = now(), revoked_by = $2 where resource_type = 'page' and resource_id = $1 and revoked_at is null`, [id, user.id]);
      await q.query(`insert into grants (org_id, resource_type, resource_id, subject_type, subject_id, level, granted_by, reason) values ($1, 'page', $2, 'user', $3, 'full', $3, 'Только я')`, [user.orgId, id, user.id]);
      await q.query(`update share_links set revoked_at = now(), revoked_by = $2 where page_id = $1 and revoked_at is null`, [id, user.id]);
      await q.query(`update pages set inherit_permissions = false, version = version + 1 where id = $1`, [id]);
      await audit(q, actorOf(req), { action: 'page.access.only_me', targetType: 'page', targetId: id, details: { removedCount: viewers.length, revokedLinks: links } });
      await bumpAclEpoch(q, user.orgId);
      return { removedCount: viewers.length };
    });
    s.bus.emit({ type: 'acl-changed', orgId: user.orgId });
    return { ok: true, ...r };
  });

  /** My own groups and departments (presets "Отдел" in the share dialog). */
  app.get('/api/v1/me/groups', async (req) => {
    const user = requireUser(req);
    const rows = (
      await s.db.query(
        `select g.id, g.name, g.kind, (select count(*)::int from group_members m where m.group_id = g.id) as members from group_members gm join groups g on g.id = gm.group_id
          where gm.user_id = $1 and g.deleted_at is null and (gm.expires_at is null or gm.expires_at > now()) order by g.kind = 'department' desc, g.name`,
        [user.id],
      )
    ).rows;
    return { groups: rows };
  });

  app.get('/api/v1/pages/:id/exposure', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    await requirePage(s.db, user, id, 'view');
    return personalExposure(s.db, id);
  });

  // ---------------------------------------------------------------- effective access matrix (R-ADMIN-010, V16-S15)
  /**
   * Users × spaces: effective level, source (direct / group / organisation / deny), expiry, conflicts (deny next to
   * allows), plus who manages each space. Personal spaces are never listed — the matrix does not reveal private content.
   */
  app.get('/api/v1/admin/access-matrix', async (req) => {
    const user = requireUser(req);
    if (!canManagePeople(user) && !canReadAudit(user)) throw forbidden();
    const qs = parse(z.object({ q: z.string().max(100).default(''), groupId: uuid.optional(), limit: z.coerce.number().int().min(1).max(500).default(100) }), req.query);
    let people = await orgPeople(s.db, user.orgId);
    if (qs.q) people = people.filter((p) => p.name.toLowerCase().includes(qs.q.toLowerCase()));
    if (qs.groupId) people = people.filter((p) => p.subjects.groupIds.includes(qs.groupId!));
    const total = people.length;
    people = people.slice(0, qs.limit);
    const spaces = (await s.db.query(`select id, name, icon, kind, visibility, settings from spaces where org_id = $1 and deleted_at is null and kind <> 'personal' order by sort_key collate "C", name`, [user.orgId])).rows;
    const grants = spaces.length
      ? (await s.db.query(`select g.*, g.resource_id as target_page, null::int as depth from grants g where g.resource_type = 'space' and g.resource_id = any($1::uuid[]) and g.revoked_at is null`, [spaces.map((x) => x.id)])).rows
      : [];
    const groupNames = new Map((await s.db.query('select id, name from groups where org_id = $1', [user.orgId])).rows.map((g) => [g.id, g.name]));
    const userNames = new Map((await s.db.query('select id, name from users where org_id = $1', [user.orgId])).rows.map((u) => [u.id, u.name]));
    const guestsDisabled = await orgGuestsDisabled(s.db, user.orgId);
    const now = new Date();
    const cells: Record<string, Record<string, { level: Level; source: string; expiresAt: string | null; conflict: boolean }>> = {};
    for (const p of people) {
      cells[p.id] = {};
      for (const sp of spaces) {
        const gs = grants.filter((g) => g.resource_id === sp.id);
        const eff = combine(gs as any, p.subjects, policyOf(sp.settings), { guest: p.kind === 'guest', personalOwner: false, guestsDisabled, now });
        const best = eff.sources.filter((x) => x.level === eff.level);
        const src = eff.denies.length
          ? 'запрет: ' + eff.denies.map((d) => (d.subjectType === 'user' ? 'лично' : d.subjectType === 'org' ? 'вся организация' : groupNames.get(d.subjectId!) ?? 'группа')).join(', ')
          : best.map((b) => (b.subjectType === 'user' ? 'лично' : b.subjectType === 'org' ? 'вся организация' : 'группа «' + (groupNames.get(b.subjectId!) ?? '?') + '»')).join(', ');
        const expiry = best.map((b) => b.expiresAt).filter(Boolean).sort()[0] ?? null;
        if (eff.level !== 'none' || eff.denies.length) cells[p.id][sp.id] = { level: eff.level, source: src, expiresAt: expiry, conflict: eff.denies.length > 0 && gs.some((g) => g.level !== 'none' && (g.subject_type === 'org' ? p.subjects.employee : g.subject_type === 'user' ? g.subject_id === p.id : p.subjects.groupIds.includes(g.subject_id))) };
      }
    }
    const managers = Object.fromEntries(spaces.map((sp) => [sp.id, grants.filter((g) => g.resource_id === sp.id && g.level === 'full' && g.subject_type === 'user' && (!g.expires_at || g.expires_at > now)).map((g) => userNames.get(g.subject_id) ?? '—')]));
    return {
      total,
      users: people.map((p) => ({ id: p.id, name: p.name, kind: p.kind, status: p.status })),
      spaces: spaces.map((sp) => ({ id: sp.id, name: sp.name, icon: sp.icon, kind: sp.kind, visibility: sp.visibility, managers: managers[sp.id] })),
      cells,
    };
  });

  // ---------------------------------------------------------------- emergency access (R-ACL-056, R-ADMIN-016)
  /**
   * The administrator role never opens personal or restricted content. Emergency access is a two-person procedure:
   * an administrator requests read-only access to one document with a reason and a time limit, a DIFFERENT
   * administrator approves it, the owner is notified, and every step is audited. No export, download or sharing.
   */
  app.post('/api/v1/admin/emergency-access', async (req) => {
    const user = requireUser(req);
    if (!isOrgAdmin(user)) throw forbidden('Экстренный доступ запрашивает администратор организации');
    const body = parse(z.object({ pageId: uuid, reason: z.string().trim().min(20, 'Опишите основание (не менее 20 символов)').max(1000), durationHours: z.number().int().min(1).max(72) }), req.body);
    const row = await tx(s.db, async (q) => {
      const p = (await q.query('select org_id from pages where id = $1 and deleted_at is null', [body.pageId])).rows[0];
      if (!p || p.org_id !== user.orgId) throw notFound();
      const r = (await q.query(`insert into emergency_access (org_id, page_id, requested_by, reason, duration_hours) values ($1, $2, $3, $4, $5) returning *`, [user.orgId, body.pageId, user.id, body.reason, body.durationHours])).rows[0];
      await audit(q, actorOf(req), { action: 'emergency_access.request', targetType: 'page', targetId: body.pageId, details: { requestId: r.id, hours: body.durationHours, reason: body.reason } });
      const approvers = (await q.query(`select id from users where org_id = $1 and org_role in ('owner', 'admin') and status = 'active' and id <> $2`, [user.orgId, user.id])).rows;
      for (const a of approvers) await q.query(`insert into notifications (user_id, type, data) values ($1, 'emergency_access_request', $2)`, [a.id, { requestId: r.id, from: user.name, hours: body.durationHours }]);
      return r;
    });
    return { request: row };
  });

  app.get('/api/v1/admin/emergency-access', async (req) => {
    const user = requireUser(req);
    if (!isOrgAdmin(user) && !canReadAudit(user)) throw forbidden();
    const rows = (
      await s.db.query(
        `select e.*, r.name as requested_by_name, d.name as decided_by_name, p.title from emergency_access e join users r on r.id = e.requested_by left join users d on d.id = e.decided_by join pages p on p.id = e.page_id
          where e.org_id = $1 order by e.created_at desc limit 200`,
        [user.orgId],
      )
    ).rows;
    const acc = await accessForPages(s.db, user, [...new Set(rows.map((r) => r.page_id))]);
    return { requests: rows.map((r) => ({ ...r, title: acc.get(r.page_id)?.actions.view ? r.title : '(скрыто)' })) };
  });

  app.post('/api/v1/admin/emergency-access/:id/decide', async (req) => {
    const user = requireUser(req);
    if (!isOrgAdmin(user)) throw forbidden();
    const { id } = parse(z.object({ id: uuid }), req.params);
    const { approve } = parse(z.object({ approve: z.boolean() }), req.body);
    const out = await tx(s.db, async (q) => {
      const row = (await q.query(`select * from emergency_access where id = $1 and org_id = $2 for update`, [id, user.orgId])).rows[0];
      if (!row) throw notFound();
      if (row.status !== 'pending') throw conflict('already_decided', 'Запрос уже рассмотрен');
      if (row.requested_by === user.id) throw forbidden('Запрос на экстренный доступ должен утвердить другой администратор');
      let grantId: string | null = null;
      if (approve) {
        grantId = (await emergencyGrantFor(q, row, user, actorOf(req))).id;
        // The owner of the material learns that it was opened (no silent access).
        const owner = (await q.query(`select coalesce(sp.owner_user_id, p.owner_id, p.created_by) as uid from pages p join spaces sp on sp.id = p.space_id where p.id = $1`, [row.page_id])).rows[0]?.uid;
        if (owner && owner !== row.requested_by) await q.query(`insert into notifications (user_id, type, page_id, data) values ($1, 'emergency_access_granted', $2, $3)`, [owner, row.page_id, { requestId: row.id, hours: row.duration_hours, reason: row.reason }]);
        await bumpAclEpoch(q, user.orgId);
      } else await audit(q, actorOf(req), { action: 'emergency_access.reject', targetType: 'page', targetId: row.page_id, details: { requestId: row.id } });
      const r = (await q.query(`update emergency_access set status = $2, decided_by = $3, decided_at = now(), grant_id = $4 where id = $1 returning *`, [id, approve ? 'approved' : 'rejected', user.id, grantId])).rows[0];
      return r;
    });
    if (approve) s.bus.emit({ type: 'acl-changed', orgId: user.orgId });
    return { request: out };
  });

  app.post('/api/v1/admin/emergency-access/:id/revoke', async (req) => {
    const user = requireUser(req);
    if (!isOrgAdmin(user)) throw forbidden();
    const { id } = parse(z.object({ id: uuid }), req.params);
    await tx(s.db, async (q) => {
      const row = (await q.query(`select * from emergency_access where id = $1 and org_id = $2 for update`, [id, user.orgId])).rows[0];
      if (!row || row.status !== 'approved') throw notFound();
      if (row.grant_id) await q.query(`update grants set revoked_at = now(), revoked_by = $2 where id = $1 and revoked_at is null`, [row.grant_id, user.id]);
      await q.query(`update emergency_access set status = 'revoked' where id = $1`, [id]);
      await audit(q, actorOf(req), { action: 'emergency_access.revoke', targetType: 'page', targetId: row.page_id, details: { requestId: id } });
      await bumpAclEpoch(q, user.orgId);
    });
    s.bus.emit({ type: 'acl-changed', orgId: user.orgId });
    return { ok: true };
  });

  // ---------------------------------------------------------------- offboarding of personal materials (R-ADMIN-016)
  /**
   * Policy for the personal space of a suspended / deactivated employee:
   *  * archive — the space becomes read-only and stays private (retained under the retention policy);
   *  * transfer_shared — documents the employee had ALREADY shared with colleagues are handed over (full access) to a
   *    successor; private notes nobody else could see stay private and are archived.
   * The response and the audit record carry counts only — never titles or content of private notes.
   */
  app.post('/api/v1/admin/users/:id/offboard-personal', async (req) => {
    const admin = requireUser(req);
    if (!canManagePeople(admin)) throw forbidden();
    const { id } = parse(z.object({ id: uuid }), req.params);
    const body = parse(z.object({ mode: z.enum(['archive', 'transfer_shared']), successorId: uuid.optional(), dryRun: z.boolean().default(false) }), req.body);
    const out = await tx(s.db, async (q) => {
      const u = (await q.query('select * from users where id = $1 and org_id = $2', [id, admin.orgId])).rows[0];
      if (!u) throw notFound('Пользователь не найден');
      if (u.status === 'active' || u.status === 'invited') throw badRequest('Сначала приостановите или отключите учётную запись');
      const sp = (await q.query(`select * from spaces where kind = 'personal' and owner_user_id = $1`, [id])).rows[0];
      if (!sp) return { pages: 0, shared: 0, private: 0, transferred: 0 };
      const pages = (await q.query(`select id from pages where space_id = $1 and deleted_at is null`, [sp.id])).rows.map((r) => r.id as string);
      const shared: string[] = [];
      for (const pid of pages) if ((await personalExposure(q, pid)).shared) shared.push(pid);
      let successor: any = null;
      if (body.mode === 'transfer_shared') {
        if (!body.successorId) throw badRequest('Укажите преемника');
        successor = (await q.query(`select * from users where id = $1 and org_id = $2 and status = 'active' and kind = 'employee'`, [body.successorId, admin.orgId])).rows[0];
        if (!successor) throw notFound('Преемник не найден или неактивен');
      }
      const result = { pages: pages.length, shared: shared.length, private: pages.length - shared.length, transferred: body.mode === 'transfer_shared' ? shared.length : 0 };
      if (body.dryRun) return result;
      if (successor)
        for (const pid of shared) {
          await q.query(`update grants set revoked_at = now(), revoked_by = $3 where resource_type = 'page' and resource_id = $1 and subject_type = 'user' and subject_id = $2 and revoked_at is null`, [pid, successor.id, admin.id]);
          await q.query(`insert into grants (org_id, resource_type, resource_id, subject_type, subject_id, level, granted_by, reason) values ($1, 'page', $2, 'user', $3, 'full', $4, 'offboarding: transfer of shared personal document')`, [admin.orgId, pid, successor.id, admin.id]);
          await q.query(`update pages set owner_id = $2 where id = $1`, [pid, successor.id]);
        }
      await q.query(`update spaces set archived_at = coalesce(archived_at, now()), updated_at = now() where id = $1`, [sp.id]);
      await audit(q, actorOf(req), { action: 'user.offboard_personal', targetType: 'user', targetId: id, details: { mode: body.mode, successorId: successor?.id ?? null, ...result } });
      await bumpAclEpoch(q, admin.orgId);
      return result;
    });
    if (!body.dryRun) s.bus.emit({ type: 'acl-changed', orgId: admin.orgId });
    return out;
  });

  // ---------------------------------------------------------------- reminders before temporary access ends (R-ACL-063)
  /** Notifies whoever granted a temporary permission one day before it ends (idempotent; called by the hub timer and on demand). */
  app.post('/api/v1/admin/grants/remind-expiring', async (req) => {
    const user = requireUser(req);
    if (!canManagePeople(user)) throw forbidden();
    return { reminded: await remindExpiringGrants(s.db, user.orgId) };
  });
  const reminder = setInterval(() => void remindExpiringGrants(s.db).catch((err) => s.log.warn({ err: (err as Error).message }, 'grant expiry reminders failed')), 10 * 60_000);
  reminder.unref();
  app.addHook('onClose', async () => clearInterval(reminder));
}

/** Sends one reminder per temporary grant to the person who granted it, 24 h before expiry. */
export async function remindExpiringGrants(q: Queryable, orgId?: string): Promise<number> {
  const rows = (
    await q.query(
      `update grants g set reminder_sent_at = now()
        where g.revoked_at is null and g.reminder_sent_at is null and g.granted_by is not null and g.expires_at > now() and g.expires_at <= now() + interval '24 hours'
          and ($1::uuid is null or g.org_id = $1)
       returning g.id, g.granted_by, g.resource_type, g.resource_id, g.subject_type, g.subject_id, g.level, g.expires_at`,
      [orgId ?? null],
    )
  ).rows;
  for (const g of rows)
    await q.query(`insert into notifications (user_id, type, page_id, data) values ($1, 'grant_expiring', $2, $3)`, [
      g.granted_by,
      g.resource_type === 'page' ? g.resource_id : null,
      { grantId: g.id, resourceType: g.resource_type, resourceId: g.resource_id, subjectType: g.subject_type, subjectId: g.subject_id, level: g.level, expiresAt: g.expires_at },
    ]);
  return rows.length;
}

