import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createWriteStream } from 'node:fs';
import { mkdir, stat, rm, open } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import { tx } from '../db/pool.js';
import { actorOf, parse, requireUser, type Services } from '../app.js';
import { requirePage, pageAccess, type AuthUser } from '../acl/engine.js';
import { streamToTemp } from '../storage/blob-store.js';
import { inspectFile, sanitizeSvgFile, scanForViruses, safeFilename, createAttachment, registerBlob, makeImageDerivatives, isInlineSafe, derivedKey, removeTemp, IMAGE_MIME } from '../services/attachments.js';
import { audit, auditStandalone } from '../services/audit.js';
import { badRequest, conflict, forbidden, notFound, tooLarge, unprocessable } from '../lib/errors.js';
import { signToken, verifyToken } from '../lib/crypto.js';
import { orgSettings } from '../services/org.js';

const uuid = z.string().uuid();

/** Loads an attachment and checks the effective rights of its page. Returns 404 when not viewable. */
export async function loadAttachment(s: Services, user: AuthUser, id: string, action: 'view' | 'download' | 'edit') {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound();
  const a = (await s.db.query('select * from attachments where id = $1', [id])).rows[0];
  if (!a || a.org_id !== user.orgId) throw notFound();
  if (a.page_id) {
    const acc = await requirePage(s.db, user, a.page_id, 'view', { allowDeleted: action === 'view' });
    if (action === 'download' && !acc.actions.download) throw forbidden('Скачивание запрещено политикой или правами');
    if (action === 'edit' && !acc.actions.edit) throw forbidden('Нет права изменять вложения');
  } else if (a.created_by !== user.id) throw notFound();
  if (a.deleted_at && action !== 'view') throw notFound('Файл удалён');
  return a;
}

async function versionRow(s: Services, attachmentId: string, version?: number) {
  const r = await s.db.query(
    `select v.*, b.storage_key from attachment_versions v join blobs b on b.sha256 = v.blob_sha256 where v.attachment_id = $1 and v.version = coalesce($2, (select current_version from attachments where id = $1))`,
    [attachmentId, version ?? null],
  );
  if (!r.rows[0]) throw notFound('Версия файла не найдена');
  return r.rows[0];
}

function contentDisposition(kind: 'inline' | 'attachment', filename: string) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/** Streams a stored object with Range support and safe headers (user content never executes in our origin). */
async function sendObject(s: Services, req: FastifyRequest, reply: FastifyReply, key: string, mime: string, size: number, filename: string, disposition: 'inline' | 'attachment', etag: string) {
  reply.header('x-content-type-options', 'nosniff');
  // User content must never run scripts in our origin. PDFs need the browser's built-in viewer, which refuses
  // sandboxed documents, so they get a script-free policy without the sandbox flag (embeddable only by us).
  reply.header(
    'content-security-policy',
    mime === 'application/pdf' ? "default-src 'none'; object-src 'self'; img-src 'self' data:; style-src 'unsafe-inline'; frame-ancestors 'self'" : "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
  );
  reply.header('cache-control', 'private, max-age=300');
  reply.header('etag', `"${etag}"`);
  reply.header('accept-ranges', 'bytes');
  reply.header('content-disposition', contentDisposition(disposition, filename));
  if (req.headers['if-none-match'] === `"${etag}"`) return reply.status(304).send();
  const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ''));
  if (range && size > 0) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start > end) return reply.status(416).header('content-range', `bytes */${size}`).send();
    reply.status(206).header('content-range', `bytes ${start}-${end}/${size}`).header('content-length', end - start + 1).type(mime);
    return reply.send(await s.store.read(key, { start, end }));
  }
  reply.type(mime).header('content-length', size);
  return reply.send(await s.store.read(key));
}

export function attachmentDto(a: any, v: any, extra: Record<string, unknown> = {}) {
  return {
    id: a.id,
    pageId: a.page_id,
    filename: a.filename,
    kind: a.kind,
    version: v.version,
    mime: v.mime,
    size: Number(v.size),
    sha256: v.blob_sha256,
    width: v.width,
    height: v.height,
    createdAt: a.created_at,
    updatedAt: v.created_at,
    deleted: !!a.deleted_at,
    contentUrl: `/api/v1/attachments/${a.id}/content`,
    downloadUrl: `/api/v1/attachments/${a.id}/download`,
    ...extra,
  };
}

async function quotaCheck(s: Services, user: AuthUser, size: number) {
  const st = await orgSettings(s.db, user.orgId);
  const used = (await s.db.query(`select coalesce(sum(v.size), 0)::bigint u from attachment_versions v join attachments a on a.id = v.attachment_id where a.created_by = $1 and a.deleted_at is null`, [user.id])).rows[0].u;
  if (Number(used) + size > st.quotaPerUserMb * 1024 * 1024)
    throw new (await import('../lib/errors.js')).AppError(507, 'quota_exceeded', `Превышена квота хранилища (${st.quotaPerUserMb} МБ). Удалите ненужные файлы или обратитесь к администратору. Существующие данные не затронуты.`);
}

/** Validates, scans and stores a temp file as a new attachment (or a new version of an existing one). */
export async function ingestFile(s: Services, req: FastifyRequest, user: AuthUser, tmp: { path: string; size: number }, filename: string, opts: { pageId: string | null; declaredMime?: string | null; replaceId?: string | null; kind?: string }) {
  try {
    await quotaCheck(s, user, tmp.size);
    const info = await inspectFile(tmp.path, filename, opts.declaredMime);
    if (info.mime === 'image/svg+xml') await sanitizeSvgFile(tmp.path);
    const virus = await scanForViruses(tmp.path, s.cfg.clamavHost);
    if (virus) {
      await auditStandalone(s.db, actorOf(req), { action: 'attachment.rejected', outcome: 'denied', details: { filename, reason: virus } });
      throw unprocessable('malware', 'Файл отклонён антивирусной проверкой');
    }
    const att = await tx(s.db, async (q) => {
      const blob = await registerBlob(q, s.store, tmp.path, info);
      if (opts.replaceId) {
        const cur = (await q.query('select * from attachments where id = $1 for update', [opts.replaceId])).rows[0];
        const next = cur.current_version + 1;
        await q.query(`insert into attachment_versions (attachment_id, version, blob_sha256, size, mime, filename, width, height, created_by) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [
          cur.id,
          next,
          blob.sha256,
          blob.size,
          info.mime,
          filename,
          info.width,
          info.height,
          user.id,
        ]);
        await q.query('update attachments set current_version = $2, updated_at = now() where id = $1', [cur.id, next]);
        await audit(q, actorOf(req), { action: 'attachment.version', targetType: 'attachment', targetId: cur.id, details: { version: next, filename, sha256: blob.sha256 } });
        if (cur.page_id) await q.query(`insert into outbox (topic, payload) values ('index-page', $1)`, [{ pageId: cur.page_id }]);
        return { ...cur, current_version: next, sha: blob.sha256, size: blob.size, version: next };
      }
      const a = await createAttachment(q, { orgId: user.orgId, pageId: opts.pageId, userId: user.id, filename, sha256: blob.sha256, size: blob.size, info, kind: opts.kind });
      await audit(q, actorOf(req), { action: 'attachment.upload', targetType: 'attachment', targetId: a.id, details: { pageId: opts.pageId, filename, size: blob.size, mime: info.mime, sha256: blob.sha256 } });
      if (opts.pageId) await q.query(`insert into outbox (topic, payload) values ('index-page', $1)`, [{ pageId: opts.pageId }]);
      return { id: a.id, sha: blob.sha256, size: blob.size, version: 1 };
    });
    if (info.kind === 'image') {
      await makeImageDerivatives(s.db, s.store, att.sha, info.mime);
      if (Math.max(info.width ?? 0, info.height ?? 0) > 4096) await s.db.query(`insert into jobs (org_id, type, params, created_by) values ($1, 'tiles', $2, $3)`, [user.orgId, { sha256: att.sha, mime: info.mime }, user.id]);
      if (info.mime !== 'image/svg+xml' && s.cfg.ocrEnabled) {
        // OCR runs in the background; the original image is never replaced.
        await s.db.query(`insert into ocr_results (org_id, attachment_id, version, status) values ($1, $2, $3, 'pending')`, [user.orgId, att.id, att.version]);
        await s.db.query(`insert into jobs (org_id, type, params, created_by) values ($1, 'ocr', $2, $3)`, [user.orgId, { attachmentId: att.id, version: att.version }, user.id]);
      }
    }
    const a = (await s.db.query('select * from attachments where id = $1', [att.id])).rows[0];
    const v = await versionRow(s, att.id);
    return attachmentDto(a, v);
  } finally {
    await removeTemp(tmp.path);
  }
}

export async function attachmentRoutes(app: FastifyInstance, s: Services) {
  // Raw binary bodies for resumable chunk uploads.
  app.addContentTypeParser('application/octet-stream', (_req, payload, done) => done(null, payload));

  /** Simple multipart upload: fields pageId, kind (optional), replaceId (optional), then one or more files. */
  app.post('/api/v1/attachments', async (req) => {
    const user = requireUser(req);
    const fields: Record<string, string> = {};
    const results: unknown[] = [];
    const errors: Array<{ filename: string; error: string }> = [];
    for await (const part of req.parts()) {
      if (part.type === 'field') {
        fields[part.fieldname] = String(part.value);
        continue;
      }
      const pageId = fields.pageId || null;
      if (pageId) await requirePage(s.db, user, pageId, 'edit');
      if (fields.replaceId) await loadAttachment(s, user, fields.replaceId, 'edit');
      const filename = safeFilename(part.filename || 'file');
      let tmp: { path: string; size: number } | null = null;
      try {
        tmp = await streamToTemp(s.store, part.file as Readable, s.cfg.maxUploadBytes);
        if ((part.file as any).truncated) throw tooLarge('Файл превышает допустимый размер');
        results.push(await ingestFile(s, req, user, tmp, filename, { pageId, declaredMime: part.mimetype, replaceId: fields.replaceId || null, kind: fields.kind }));
      } catch (e: any) {
        if (tmp) await removeTemp(tmp.path);
        if (e?.code === 'TOO_LARGE') errors.push({ filename, error: 'Файл превышает допустимый размер' });
        else if (e?.status && e.status < 500) errors.push({ filename, error: e.message });
        else throw e;
      }
    }
    if (!results.length && errors.length === 1) throw unprocessable('upload_rejected', errors[0].error, errors);
    return { attachments: results, errors };
  });

  // ---- resumable uploads (large files, unstable networks)
  app.post('/api/v1/uploads', async (req) => {
    const user = requireUser(req);
    const body = parse(z.object({ pageId: uuid.nullable(), filename: z.string().min(1).max(255), size: z.number().int().min(0), mime: z.string().max(200).optional(), sha256: z.string().regex(/^[0-9a-f]{64}$/).optional(), replaceId: uuid.optional() }), req.body);
    if (body.size > s.cfg.maxUploadBytes) throw tooLarge(`Файл больше ${Math.round(s.cfg.maxUploadBytes / 1048576)} МБ`);
    if (body.pageId) await requirePage(s.db, user, body.pageId, 'edit');
    if (body.replaceId) await loadAttachment(s, user, body.replaceId, 'edit');
    await quotaCheck(s, user, body.size);
    const tempKey = randomUUID();
    await mkdir(s.store.tmpDir(), { recursive: true });
    await (await open(join(s.store.tmpDir(), 'up-' + tempKey), 'w')).close();
    const r = await s.db.query(
      `insert into upload_sessions (org_id, user_id, page_id, attachment_id, filename, size, mime, sha256_expected, temp_key, expires_at) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now() + interval '24 hours') returning id`,
      [user.orgId, user.id, body.pageId, body.replaceId ?? null, safeFilename(body.filename), body.size, body.mime ?? null, body.sha256 ?? null, tempKey],
    );
    return { uploadId: r.rows[0].id, received: 0, chunkSize: 4 * 1024 * 1024 };
  });

  async function session(user: AuthUser, id: string) {
    const u = (await s.db.query('select * from upload_sessions where id = $1 and user_id = $2', [id, user.id])).rows[0];
    if (!u) throw notFound('Сеанс загрузки не найден');
    if (u.status !== 'open') throw conflict('upload_closed', 'Загрузка уже завершена или отменена');
    if (new Date(u.expires_at) < new Date()) throw conflict('upload_expired', 'Сеанс загрузки истёк — начните заново');
    return u;
  }

  app.get('/api/v1/uploads/:id', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const u = (await s.db.query('select id, filename, size, received, status, error from upload_sessions where id = $1 and user_id = $2', [id, user.id])).rows[0];
    if (!u) throw notFound();
    return u;
  });

  /** Appends a chunk at `offset`. A chunk that was already received (retry) is acknowledged without rewriting. */
  app.put('/api/v1/uploads/:id', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const { offset } = parse(z.object({ offset: z.coerce.number().int().min(0) }), req.query);
    const u = await session(user, id);
    const path = join(s.store.tmpDir(), 'up-' + u.temp_key);
    const current = (await stat(path)).size;
    if (offset > current) throw conflict('offset_mismatch', 'Пропущена часть файла', { received: current });
    const ws = createWriteStream(path, { flags: 'r+', start: offset });
    let written = 0;
    await pipeline(req.body as Readable, async function* (src) {
      for await (const chunk of src) {
        written += (chunk as Buffer).length;
        if (offset + written > u.size) throw badRequest('Получено больше данных, чем заявлено');
        yield chunk;
      }
    }, ws);
    const received = Math.max(current, offset + written);
    await s.db.query('update upload_sessions set received = $2 where id = $1', [id, received]);
    return { received };
  });

  app.post('/api/v1/uploads/:id/complete', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const u = await session(user, id);
    const path = join(s.store.tmpDir(), 'up-' + u.temp_key);
    const size = (await stat(path)).size;
    if (size !== Number(u.size)) throw conflict('incomplete', `Получено ${size} из ${u.size} байт — продолжите загрузку`, { received: size });
    if (u.sha256_expected) {
      const h = createHash('sha256');
      for await (const c of (await import('node:fs')).createReadStream(path)) h.update(c as Buffer);
      if (h.digest('hex') !== u.sha256_expected) {
        await s.db.query(`update upload_sessions set status = 'failed', error = 'checksum mismatch' where id = $1`, [id]);
        await rm(path, { force: true });
        throw unprocessable('checksum_mismatch', 'Контрольная сумма не совпала — файл повреждён при передаче, загрузите заново');
      }
    }
    try {
      const dto = await ingestFile(s, req, user, { path, size }, u.filename, { pageId: u.page_id, declaredMime: u.mime, replaceId: u.attachment_id });
      await s.db.query(`update upload_sessions set status = 'complete' where id = $1`, [id]);
      return { attachment: dto };
    } catch (e) {
      await s.db.query(`update upload_sessions set status = 'failed', error = $2 where id = $1`, [id, (e as Error).message.slice(0, 500)]);
      throw e;
    }
  });

  app.delete('/api/v1/uploads/:id', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const u = await session(user, id);
    await s.db.query(`update upload_sessions set status = 'cancelled' where id = $1`, [id]);
    await rm(join(s.store.tmpDir(), 'up-' + u.temp_key), { force: true });
    return { ok: true };
  });

  // ---- reading
  app.get('/api/v1/attachments/:id', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const a = await loadAttachment(s, user, id, 'view');
    const v = await versionRow(s, id);
    const versions = (await s.db.query(`select v.version, v.size, v.mime, v.filename, v.created_at, u.name as created_by_name from attachment_versions v left join users u on u.id = v.created_by where v.attachment_id = $1 order by v.version desc`, [id])).rows;
    const ocr = (await s.db.query(`select id, status, confidence, error, updated_at, (corrected_text is not null) as corrected from ocr_results where attachment_id = $1 order by created_at desc limit 1`, [id])).rows[0] ?? null;
    const tiles = (await s.db.query(`select meta from blob_derivatives where blob_sha256 = $1 and kind = 'tiles'`, [v.blob_sha256])).rows[0]?.meta ?? null;
    const acc = a.page_id ? await pageAccess(s.db, user, a.page_id) : null;
    return { attachment: attachmentDto(a, v, { versions, ocr, tiles, canDownload: acc ? acc.actions.download : true, canEdit: acc ? acc.actions.edit : true }) };
  });

  /** Inline content (images, PDF, video) for viewing. `variant` = thumb | preview | original. */
  app.get('/api/v1/attachments/:id/content', async (req, reply) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const qs = parse(z.object({ variant: z.enum(['thumb', 'preview', 'original']).default('original'), v: z.coerce.number().int().optional() }), req.query);
    await loadAttachment(s, user, id, 'view');
    const v = await versionRow(s, id, qs.v);
    if (qs.variant !== 'original' && IMAGE_MIME.has(v.mime)) {
      const d = (await s.db.query('select storage_key, meta from blob_derivatives where blob_sha256 = $1 and kind = $2', [v.blob_sha256, qs.variant])).rows[0];
      if (d) {
        const size = (await s.store.size(d.storage_key)) ?? 0;
        return sendObject(s, req, reply, d.storage_key, 'image/webp', size, v.filename, 'inline', v.blob_sha256 + '-' + qs.variant);
      }
    }
    // Viewing an original image inline is part of reading the page; non-displayable types require download right.
    if (!isInlineSafe(v.mime)) {
      await loadAttachment(s, user, id, 'download');
      return sendObject(s, req, reply, v.storage_key, v.mime, Number(v.size), v.filename, 'attachment', v.blob_sha256);
    }
    return sendObject(s, req, reply, v.storage_key, v.mime, Number(v.size), v.filename, 'inline', v.blob_sha256);
  });

  app.get('/api/v1/attachments/:id/download', async (req, reply) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const { v: ver } = parse(z.object({ v: z.coerce.number().int().optional() }), req.query);
    const a = await loadAttachment(s, user, id, 'download');
    const v = await versionRow(s, id, ver);
    if (!req.headers.range) await auditStandalone(s.db, actorOf(req), { action: 'attachment.download', targetType: 'attachment', targetId: id, details: { pageId: a.page_id, version: v.version } });
    return sendObject(s, req, reply, v.storage_key, v.mime, Number(v.size), v.filename, 'attachment', v.blob_sha256);
  });

  /** Deep-zoom tiles for very large images. */
  app.get('/api/v1/attachments/:id/tiles/:level/:tile', async (req, reply) => {
    const user = requireUser(req);
    const { id, level, tile } = parse(z.object({ id: uuid, level: z.coerce.number().int().min(0).max(40), tile: z.string().regex(/^\d+_\d+\.(jpg|png)$/) }), req.params);
    await loadAttachment(s, user, id, 'view');
    const v = await versionRow(s, id);
    const key = `${derivedKey(v.blob_sha256, 'tiles')}/${level}/${tile}`;
    const size = await s.store.size(key);
    if (size === null) throw notFound('Тайл не найден');
    reply.header('cache-control', 'private, max-age=86400, immutable');
    return reply.type(tile.endsWith('.png') ? 'image/png' : 'image/jpeg').send(await s.store.read(key));
  });

  /**
   * Short-lived link (5 minutes) bound to the requesting user. Access is re-checked when the link is used,
   * so revoking rights immediately invalidates outstanding links (A14, A17).
   */
  app.post('/api/v1/attachments/:id/link', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    await loadAttachment(s, user, id, 'download');
    const token = signToken(s.cfg.secretKey, { a: id, u: user.id, exp: Date.now() + 5 * 60_000 });
    return { url: `/api/v1/files/${token}`, expiresInSeconds: 300 };
  });

  app.get('/api/v1/files/:token', async (req, reply) => {
    const { token } = req.params as { token: string };
    const payload = verifyToken<{ a: string; u: string }>(s.cfg.secretKey, token);
    if (!payload) throw notFound('Ссылка недействительна или истекла');
    const row = (await s.db.query(`select * from users where id = $1 and status = 'active'`, [payload.u])).rows[0];
    if (!row) throw notFound('Ссылка недействительна или истекла');
    const { toAuthUser } = await import('../auth/sessions.js');
    const u = toAuthUser(row);
    await loadAttachment(s, u, payload.a, 'download');
    const v = await versionRow(s, payload.a);
    return sendObject(s, req, reply, v.storage_key, v.mime, Number(v.size), v.filename, 'attachment', v.blob_sha256);
  });

  // ---- management
  app.patch('/api/v1/attachments/:id', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const { filename } = parse(z.object({ filename: z.string().min(1).max(255) }), req.body);
    await loadAttachment(s, user, id, 'edit');
    await tx(s.db, async (q) => {
      const prev = (await q.query('select filename from attachments where id = $1', [id])).rows[0];
      await q.query('update attachments set filename = $2, updated_at = now() where id = $1', [id, safeFilename(filename)]);
      await audit(q, actorOf(req), { action: 'attachment.rename', targetType: 'attachment', targetId: id, details: { from: prev.filename, to: filename } });
    });
    return { ok: true };
  });

  /** Makes an older version current again (as a new version — history is kept). */
  app.post('/api/v1/attachments/:id/versions/:version/restore', async (req) => {
    const user = requireUser(req);
    const { id, version } = parse(z.object({ id: uuid, version: z.coerce.number().int().min(1) }), req.params);
    await loadAttachment(s, user, id, 'edit');
    const v = await versionRow(s, id, version);
    await tx(s.db, async (q) => {
      const cur = (await q.query('select current_version from attachments where id = $1 for update', [id])).rows[0];
      const next = cur.current_version + 1;
      await q.query(`insert into attachment_versions (attachment_id, version, blob_sha256, size, mime, filename, width, height, created_by) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [id, next, v.blob_sha256, v.size, v.mime, v.filename, v.width, v.height, user.id]);
      await q.query('update attachments set current_version = $2, updated_at = now() where id = $1', [id, next]);
      await audit(q, actorOf(req), { action: 'attachment.version_restore', targetType: 'attachment', targetId: id, details: { from: version, newVersion: next } });
    });
    return { ok: true };
  });

  /** Soft delete; the blob is kept until retention expires (D-05). */
  app.delete('/api/v1/attachments/:id', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    await loadAttachment(s, user, id, 'edit');
    await tx(s.db, async (q) => {
      await q.query('update attachments set deleted_at = now(), deleted_by = $2 where id = $1', [id, user.id]);
      await audit(q, actorOf(req), { action: 'attachment.delete', targetType: 'attachment', targetId: id });
    });
    return { ok: true };
  });

  app.post('/api/v1/attachments/:id/restore', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    await loadAttachment(s, user, id, 'view');
    const a = (await s.db.query('select page_id from attachments where id = $1', [id])).rows[0];
    if (a.page_id) await requirePage(s.db, user, a.page_id, 'edit');
    await tx(s.db, async (q) => {
      await q.query('update attachments set deleted_at = null, deleted_by = null where id = $1', [id]);
      await audit(q, actorOf(req), { action: 'attachment.restore', targetType: 'attachment', targetId: id });
    });
    return { ok: true };
  });

  // ---- OCR: original is never replaced; automatic result and manual correction are stored separately.
  app.get('/api/v1/attachments/:id/ocr', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    await loadAttachment(s, user, id, 'view');
    const r = (await s.db.query(`select o.*, u.name as corrected_by_name from ocr_results o left join users u on u.id = o.corrected_by where o.attachment_id = $1 order by o.created_at desc limit 1`, [id])).rows[0];
    if (!r) return { ocr: null };
    return { ocr: { id: r.id, status: r.status, text: r.text, correctedText: r.corrected_text, correctedBy: r.corrected_by_name, correctedAt: r.corrected_at, confidence: r.confidence, words: r.words, region: r.region, rotation: r.rotation, error: r.error, updatedAt: r.updated_at, version: r.version } };
  });

  app.post('/api/v1/attachments/:id/ocr', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const body = parse(z.object({ region: z.object({ x: z.number().min(0), y: z.number().min(0), width: z.number().positive(), height: z.number().positive() }).nullable().optional(), rotation: z.number().int().refine((r) => [0, 90, 180, 270].includes(r)).default(0) }), req.body ?? {});
    await loadAttachment(s, user, id, 'view');
    const v = await versionRow(s, id);
    if (!IMAGE_MIME.has(v.mime) || v.mime === 'image/svg+xml') throw badRequest('Распознавание доступно для растровых изображений');
    const r = await s.db.query(`insert into ocr_results (org_id, attachment_id, version, status, region, rotation) values ($1, $2, $3, 'pending', $4, $5) returning id`, [user.orgId, id, v.version, body.region ?? null, body.rotation]);
    await s.db.query(`insert into jobs (org_id, type, params, created_by) values ($1, 'ocr', $2, $3)`, [user.orgId, { attachmentId: id, version: v.version, region: body.region ?? null, rotation: body.rotation, resultId: r.rows[0].id }, user.id]);
    return { id: r.rows[0].id, status: 'pending' };
  });

  app.patch('/api/v1/attachments/:id/ocr', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const { correctedText } = parse(z.object({ correctedText: z.string().max(1_000_000).nullable() }), req.body);
    const a = await loadAttachment(s, user, id, 'edit');
    await tx(s.db, async (q) => {
      const r = (await q.query(`select id from ocr_results where attachment_id = $1 order by created_at desc limit 1`, [id])).rows[0];
      if (!r) throw notFound('Результат распознавания не найден');
      await q.query(`update ocr_results set corrected_text = $2, corrected_by = $3, corrected_at = now(), updated_at = now() where id = $1`, [r.id, correctedText, user.id]);
      await audit(q, actorOf(req), { action: 'ocr.correct', targetType: 'attachment', targetId: id });
      if (a.page_id) await q.query(`insert into outbox (topic, payload) values ('index-page', $1)`, [{ pageId: a.page_id }]);
    });
    return { ok: true };
  });

  app.get('/api/v1/pages/:id/attachments', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const acc = await requirePage(s.db, user, id, 'view');
    const rows = (await s.db.query(`select a.*, v.size, v.mime, v.version, v.blob_sha256, v.width, v.height, v.created_at as v_created from attachments a join attachment_versions v on v.attachment_id = a.id and v.version = a.current_version where a.page_id = $1 order by a.created_at`, [id])).rows;
    return { canDownload: acc.actions.download, attachments: rows.map((r) => attachmentDto(r, { ...r, created_at: r.v_created })) };
  });
}
