import type { FastifyInstance } from 'fastify';
import type { Readable } from 'node:stream';
import { readFile, rm } from 'node:fs/promises';
import { z } from 'zod';
import { tx } from '../db/pool.js';
import { actorOf, parse, requireUser, type Services } from '../app.js';
import { isOrgAdmin } from '../acl/engine.js';
import { verifyPassword } from '../auth/passwords.js';
import { auditStandalone } from '../services/audit.js';
import { buildOrgArchive, analyzeArchive, restoreArchive, verifyRestore } from '../services/archive.js';
import { streamToTemp, blobKey } from '../storage/blob-store.js';
import { registerJob } from '../jobs/worker.js';
import { AppError, badRequest, conflict, forbidden, notFound } from '../lib/errors.js';

const uuid = z.string().uuid();

registerJob('archive-export', async ({ s, job, progress }) => {
  const { buffer, manifest } = await buildOrgArchive(s, job.org_id, job.params.options, progress);
  const put = await s.store.putBuffer(buffer);
  await s.db.query(`insert into blobs (sha256, size, mime, storage_key) values ($1, $2, 'application/zip', $3) on conflict do nothing`, [put.sha256, put.size, put.key]);
  return { result: { sha: put.sha256, size: put.size, filename: `knowledge-archive-${new Date().toISOString().slice(0, 10)}.zip`, manifest } };
});

export async function archiveRoutes(app: FastifyInstance, s: Services) {
  const requireAdmin = async (req: any, password: string | undefined) => {
    const user = requireUser(req);
    if (!isOrgAdmin(user)) throw forbidden('Операция доступна владельцу и администраторам организации');
    // Second factor of intent: the password is re-entered for this high-privilege operation.
    const row = (await s.db.query('select password_hash from users where id = $1', [user.id])).rows[0];
    if (!password || !(await verifyPassword(row.password_hash, password))) {
      await auditStandalone(s.db, actorOf(req), { action: 'archive.denied', outcome: 'denied', details: { reason: 'password' } });
      throw new AppError(403, 'reauth_failed', 'Подтвердите операцию паролем');
    }
    return user;
  };

  /** Full portable archive of the organisation (includes private pages): owner/admin + password confirmation, audited. */
  app.post('/api/v1/admin/archives', async (req) => {
    const body = parse(z.object({ password: z.string(), confirm: z.literal(true), options: z.object({ includeVersions: z.boolean().default(true), includeAcl: z.boolean().default(true), includeComments: z.boolean().default(true), includeAudit: z.boolean().default(false) }).default({ includeVersions: true, includeAcl: true, includeComments: true, includeAudit: false }) }), req.body);
    const user = await requireAdmin(req, body.password);
    const r = await s.db.query(`insert into jobs (org_id, type, created_by, params) values ($1, 'archive-export', $2, $3) returning id`, [user.orgId, user.id, { options: body.options }]);
    await auditStandalone(s.db, actorOf(req), { action: 'archive.export_request', targetType: 'org', targetId: user.orgId, details: body.options });
    return { jobId: r.rows[0].id };
  });

  app.get('/api/v1/admin/archives', async (req) => {
    const user = requireUser(req);
    if (!isOrgAdmin(user)) throw forbidden();
    const rows = (await s.db.query(`select j.id, j.type, j.status, j.progress, j.error, j.created_at, j.finished_at, j.result->'manifest'->'counts' as counts, u.name as created_by_name from jobs j left join users u on u.id = j.created_by where j.org_id = $1 and j.type in ('archive-export', 'archive-restore') order by j.created_at desc limit 50`, [user.orgId])).rows;
    return { archives: rows };
  });

  app.get('/api/v1/admin/archives/:id', async (req) => {
    const user = requireUser(req);
    if (!isOrgAdmin(user)) throw forbidden();
    const { id } = parse(z.object({ id: uuid }), req.params);
    const j = (await s.db.query(`select * from jobs where id = $1 and org_id = $2 and type in ('archive-export', 'archive-restore')`, [id, user.orgId])).rows[0];
    if (!j) throw notFound();
    return { id: j.id, type: j.type, status: j.status, progress: j.progress, error: j.error, manifest: j.result?.manifest ?? null, analysis: j.result?.analysis ?? null, restore: j.result?.restore ?? null, verification: j.result?.verification ?? null };
  });

  app.get('/api/v1/admin/archives/:id/download', async (req, reply) => {
    const user = requireUser(req);
    if (!isOrgAdmin(user)) throw forbidden();
    const { id } = parse(z.object({ id: uuid }), req.params);
    const j = (await s.db.query(`select * from jobs where id = $1 and org_id = $2 and type = 'archive-export'`, [id, user.orgId])).rows[0];
    if (!j) throw notFound();
    if (j.status !== 'succeeded') throw conflict('not_ready', 'Архив ещё формируется');
    if (Date.now() - new Date(j.finished_at).getTime() > 72 * 3600_000) throw conflict('expired', 'Срок хранения архива для скачивания истёк — сформируйте заново');
    await auditStandalone(s.db, actorOf(req), { action: 'archive.download', targetType: 'job', targetId: id, details: { size: j.result.size } });
    reply.header('content-disposition', `attachment; filename="${j.result.filename}"`);
    return reply.type('application/zip').send(await s.store.read(blobKey(j.result.sha)));
  });

  /** Upload an archive: integrity check + dry run report. Nothing is changed. */
  app.post('/api/v1/admin/archives/restore', async (req) => {
    const user = requireUser(req);
    if (!isOrgAdmin(user)) throw forbidden();
    const file = await req.file();
    if (!file) throw badRequest('Файл не выбран');
    const tmp = await streamToTemp(s.store, file.file as Readable, s.cfg.maxImportBytes);
    try {
      const buf = await readFile(tmp.path);
      const { analysis } = await analyzeArchive(s, user.orgId, buf);
      const put = await s.store.putBuffer(buf);
      await s.db.query(`insert into blobs (sha256, size, mime, storage_key) values ($1, $2, 'application/zip', $3) on conflict do nothing`, [put.sha256, put.size, put.key]);
      const r = await s.db.query(`insert into jobs (org_id, type, status, created_by, params, result) values ($1, 'archive-restore', 'awaiting_confirmation', $2, $3, $4) returning id`, [user.orgId, user.id, { sha: put.sha256 }, { analysis }]);
      await auditStandalone(s.db, actorOf(req), { action: 'archive.restore_analyze', targetType: 'job', targetId: r.rows[0].id, details: { ok: analysis.ok, counts: analysis.manifest.counts } });
      return { jobId: r.rows[0].id, analysis };
    } finally {
      await rm(tmp.path, { force: true });
    }
  });

  app.post('/api/v1/admin/archives/restore/:id/commit', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const body = parse(z.object({ password: z.string(), confirm: z.literal(true) }), req.body);
    const user = await requireAdmin(req, body.password);
    const j = (await s.db.query(`select * from jobs where id = $1 and org_id = $2 and type = 'archive-restore'`, [id, user.orgId])).rows[0];
    if (!j) throw notFound();
    if (j.status === 'succeeded') return { restore: j.result.restore, verification: j.result.verification, repeated: true };
    if (j.status !== 'awaiting_confirmation') throw conflict('bad_state', 'Восстановление уже выполняется или отменено');
    const buf = await s.store.readBuffer(blobKey(j.params.sha));
    const { analysis, entries } = await analyzeArchive(s, user.orgId, buf);
    const restore = await tx(s.db, async (q) => {
      const locked = (await q.query(`update jobs set status = 'running' where id = $1 and status = 'awaiting_confirmation' returning id`, [id])).rowCount;
      if (!locked) throw conflict('bad_state', 'Восстановление уже выполняется');
      return restoreArchive(s, q, user.orgId, actorOf(req), entries, analysis, user.id);
    }).catch(async (e) => {
      await s.db.query(`update jobs set status = 'failed', error = $2, finished_at = now() where id = $1 and status <> 'succeeded'`, [id, String(e.message).slice(0, 1000)]);
      throw e;
    });
    const verification = await verifyRestore(s, entries, restore.idMap);
    await s.db.query(`update jobs set status = 'succeeded', result = result || $2::jsonb, finished_at = now() where id = $1`, [id, JSON.stringify({ restore: { ...restore, idMap: undefined }, verification })]);
    s.bus.emit({ type: 'acl-changed', orgId: user.orgId });
    return { restore: { ...restore, idMap: undefined }, verification };
  });
}
