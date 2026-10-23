import type { FastifyInstance } from 'fastify';
import type { Readable } from 'node:stream';
import { z } from 'zod';
import { tx } from '../db/pool.js';
import { actorOf, parse, requireUser, type Services } from '../app.js';
import { requirePage, requireSpace, pageAccess, accessForPages } from '../acl/engine.js';
import { streamToTemp, blobKey } from '../storage/blob-store.js';
import { analyzeImport, commitDocuments, commitIntoPage, commitTabular, tabularDryRun, storeBuffer, type ImportPlan, type ImportTarget, type TabularOptions } from '../services/importer.js';
import { exportPages, ExportCancelledError, type ExportFormat } from '../services/exporter.js';
import { auditStandalone } from '../services/audit.js';
import { badRequest, conflict, forbidden, notFound, unprocessable } from '../lib/errors.js';
import { registerJob } from '../jobs/worker.js';
import { readFile, rm } from 'node:fs/promises';
import { replaceContent, ydocToJson } from '../collab/ydoc.js';

const uuid = z.string().uuid();

const targetSchema = z.object({ spaceId: uuid, parentId: uuid.nullable().default(null), mode: z.enum(['new', 'update', 'append']).default('new'), pageId: uuid.nullable().optional() });
const tabularSchema = z.object({
  sheet: z.number().int().min(0).default(0),
  header: z.boolean().default(true),
  as: z.enum(['table', 'collection']).default('table'),
  collectionId: uuid.nullable().optional(),
  collectionMode: z.enum(['append', 'upsert', 'replace']).optional(),
  /** replace mode: the user saw the dry run (rows to be removed) and confirmed it (R-COLLECTION-003). */
  confirmReplace: z.boolean().optional(),
  keyColumn: z.number().int().min(0).nullable().optional(),
  columnTypes: z.array(z.enum(['text', 'number', 'date', 'checkbox', 'select', 'url', 'email'])).optional(),
  title: z.string().max(300).optional(),
  encoding: z.enum(['auto', 'utf-8', 'windows-1251']).optional(),
  delimiter: z.enum(['auto', ',', ';', '\t']).optional(),
  range: z.string().regex(/^[A-Za-z]{1,3}\d{0,7}:[A-Za-z]{1,3}\d{0,7}$/, 'Диапазон вида A1:D50').nullable().optional(),
});

/** Summary of a staged plan for the preview screen (content itself is not sent). */
function planSummary(plan: ImportPlan) {
  return {
    kind: plan.kind,
    files: plan.files,
    pages: plan.pages.map((p) => ({ tempId: p.tempId, parentTempId: p.parentTempId, title: p.title, sourceFile: p.sourceFile, stats: p.stats, assets: p.assets.length })),
    assets: Object.keys(plan.assets).length,
    tabular: plan.tabular ? { file: plan.tabular.file, encoding: plan.tabular.encoding, delimiter: plan.tabular.delimiter, sheets: plan.tabular.sheets } : null,
  };
}

registerJob('import-analyze', async ({ s, job, progress }) => {
  const files = [];
  for (const f of job.params.files as Array<{ filename: string; sha: string }>) files.push({ filename: f.filename, data: await s.store.readBuffer(blobKey(f.sha)) });
  // Every pipeline stage is recorded on the job (visible in GET /imports/:id) and logged (R-IMPORT-032).
  const prev = (await s.db.query('select progress from jobs where id = $1', [job.id])).rows[0]?.progress;
  const stages: Array<Record<string, unknown>> = [...(prev?.stages ?? [])];
  const onStage = async (stage: string, detail: Record<string, unknown> = {}) => {
    stages.push({ stage, at: new Date().toISOString(), ...detail });
    s.log.info({ jobId: job.id, stage, ...detail }, 'import stage');
    await progress({ stage, files: files.length, stages });
  };
  await onStage('analyze', { files: files.length });
  const plan = await analyzeImport(s, files, { csv: job.params.csv, onStage });
  for (const f of plan.files) s.metrics.importFiles.labels(importFormat(f.file), f.status).inc();
  const ok = plan.files.some((f) => f.status !== 'error');
  return { status: ok ? 'awaiting_confirmation' : 'succeeded', result: { plan }, report: { files: plan.files } };
});

registerJob('export', async ({ s, job, progress, cancelled }) => {
  const user = (await s.db.query('select * from users where id = $1', [job.created_by])).rows[0];
  const { toAuthUser } = await import('../auth/sessions.js');
  await progress({ stage: 'render' });
  let out;
  try {
    out = await exportPages(s, toAuthUser(user), job.params.pageIds, job.params.format, { includeChildren: job.params.includeChildren, layout: job.params.layout, isCancelled: cancelled });
  } catch (e) {
    // Cancelled by the user (R-EXPORT-022): nothing is stored; the worker marks the job 'cancelled'.
    if (e instanceof ExportCancelledError) return { result: null, report: { cancelled: true } };
    throw e;
  }
  if (await cancelled()) return { result: null, report: { cancelled: true } };
  const blob = await s.store.putBuffer(out.buffer);
  await s.db.query(`insert into blobs (sha256, size, mime, storage_key) values ($1, $2, $3, $4) on conflict do nothing`, [blob.sha256, blob.size, out.mime, blob.key]);
  return { result: { sha: blob.sha256, size: blob.size, filename: out.filename, mime: out.mime, pageIds: out.pageIds ?? job.params.pageIds }, report: { warnings: out.warnings, ...out.report } };
});

/** Low-cardinality format label for import metrics. */
function importFormat(filename: string) {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  const alias: Record<string, string> = { markdown: 'md', htm: 'html' };
  return ['docx', 'md', 'markdown', 'txt', 'zip', 'html', 'htm', 'csv', 'tsv', 'xlsx'].includes(ext) ? alias[ext] ?? ext : 'other';
}

export async function importExportRoutes(app: FastifyInstance, s: Services) {
  /** Upload files for import. Nothing is created until the user confirms the preview. */
  app.post('/api/v1/imports', { config: { rateLimit: { max: s.cfg.uploadRateLimitPerMinute, timeWindow: '1 minute', distributed: true } as any } }, async (req) => {
    const user = requireUser(req);
    const fields: Record<string, string> = {};
    const files: Array<{ filename: string; sha: string; size: number }> = [];
    for await (const part of req.parts()) {
      if (part.type === 'field') {
        fields[part.fieldname] = String(part.value);
        continue;
      }
      const tmp = await streamToTemp(s.store, part.file as Readable, s.cfg.maxImportBytes);
      try {
        // storeBuffer runs the antivirus check (quarantine: nothing is registered for an infected file).
        const st = await storeBuffer(s, await readFile(tmp.path), part.filename || 'file');
        files.push({ filename: part.filename || 'file', sha: st.sha, size: st.size });
      } catch (e: any) {
        files.push({ filename: part.filename || 'file', sha: '', size: tmp.size, ...({ error: e.message, code: e.code ?? null } as any) });
        if (e?.code === 'malware' || e?.code === 'av_unavailable')
          await auditStandalone(s.db, actorOf(req), { action: 'import.rejected', outcome: 'denied', details: { filename: part.filename || 'file', reason: e.code, message: String(e.message).slice(0, 300) } });
      } finally {
        await rm(tmp.path, { force: true });
      }
    }
    if (!files.length) throw badRequest('Не выбраны файлы');
    const bad = files.filter((f) => !f.sha);
    for (const f of bad) s.metrics.importFiles.labels(importFormat(f.filename), 'rejected').inc();
    if (bad.length === files.length) throw unprocessable('upload_rejected', (bad[0] as any).error ?? 'Файл отклонён');
    const key = fields.idempotencyKey || null;
    const csv = fields.csv ? JSON.parse(fields.csv) : undefined;
    const existing = key ? (await s.db.query(`select id from jobs where org_id = $1 and type = 'import-analyze' and created_by = $2 and idempotency_key = $3`, [user.orgId, user.id, key])).rows[0] : null;
    if (existing) return { jobId: existing.id, duplicate: true };
    const now = new Date().toISOString();
    const stages = [
      { stage: 'upload', at: now, files: files.length, bytes: files.reduce((n, f) => n + f.size, 0) },
      { stage: 'scan', at: now, scanner: s.cfg.clamavHost ? 'clamav' : 'disabled', rejected: bad.map((f) => ({ file: f.filename, code: (f as any).code ?? null })) },
    ];
    const r = await s.db.query(`insert into jobs (org_id, type, idempotency_key, created_by, params, progress) values ($1, 'import-analyze', $2, $3, $4, $5) returning id`, [user.orgId, key, user.id, { files: files.filter((f) => f.sha), csv, rejected: bad, traceparent: req.span?.traceparent() }, { stage: 'queued', stages }]);
    return { jobId: r.rows[0].id, duplicate: false, rejected: bad };
  });

  async function job(userId: string, id: string, type?: string) {
    const j = (await s.db.query('select * from jobs where id = $1', [id])).rows[0];
    if (!j || j.created_by !== userId || (type && j.type !== type)) throw notFound('Задание не найдено');
    return j;
  }

  app.get('/api/v1/imports/:id', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const j = await job(user.id, id);
    return { id: j.id, type: j.type, status: j.status, progress: j.progress, error: j.error, preview: j.result?.plan ? planSummary(j.result.plan) : null, result: j.result?.commit ?? null, rejected: j.params.rejected ?? [], createdAt: j.created_at };
  });

  app.post('/api/v1/imports/:id/dry-run', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const opts = parse(tabularSchema, req.body);
    const j = await job(user.id, id, 'import-analyze');
    if (!j.result?.plan?.tabular) throw badRequest('Пробный прогон доступен для табличных данных');
    return tabularDryRun(s, j.result.plan, opts as TabularOptions);
  });

  /** Atomic publication of the staged result. Idempotent: repeating returns the same pages. */
  app.post('/api/v1/imports/:id/commit', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const body = parse(z.object({ target: targetSchema, tabular: tabularSchema.optional(), pageTempIds: z.array(z.string()).optional() }), req.body);
    const target = body.target as ImportTarget;
    const actor = actorOf(req);
    const result = await tx(s.db, async (q) => {
      const j = (await q.query('select * from jobs where id = $1 for update', [id])).rows[0];
      if (!j || j.created_by !== user.id) throw notFound('Задание не найдено');
      if (j.status === 'succeeded' && j.result?.commit) return { ...j.result.commit, repeated: true };
      if (j.status === 'cancelled') throw conflict('cancelled', 'Импорт отменён');
      if (j.status !== 'awaiting_confirmation') throw conflict('not_ready', 'Анализ ещё не завершён');
      const plan: ImportPlan = j.result.plan;
      if (body.pageTempIds) plan.pages = plan.pages.filter((p) => body.pageTempIds!.includes(p.tempId) || plan.pages.some((c) => body.pageTempIds!.includes(c.tempId) && c.parentTempId === p.tempId));
      let commit: any;
      if (plan.kind === 'tabular') {
        const t = await commitTabular(s, q, user, actor, plan, target, (body.tabular ?? { sheet: 0, header: true, as: 'table' }) as TabularOptions, id);
        if ('appendTo' in t) {
          // Appending a table to an existing page goes through the collaborative document (after the transaction).
          commit = { appendTo: t.appendTo, table: t.table };
        } else commit = t;
      } else if (target.mode === 'new') commit = await commitDocuments(s, q, user, actor, plan, target, id);
      else commit = { intoPage: true };
      await q.query(`update jobs set status = 'succeeded', result = result || $2::jsonb, finished_at = now() where id = $1`, [id, JSON.stringify({ commit })]);
      return commit;
    });
    if (result.appendTo) {
      await requirePage(s.db, user, result.appendTo, 'edit');
      await s.hub.applyServerChange(result.appendTo, user.id, (doc) => {
        const cur = ydocToJson(doc);
        replaceContent(doc, { type: 'doc', content: [...(cur.content ?? []), result.table] }, 'import');
      });
      const final = { pages: [{ id: result.appendTo }], rootPageId: result.appendTo };
      await s.db.query(`update jobs set result = result || $2::jsonb where id = $1`, [id, JSON.stringify({ commit: final })]);
      await logCommitStages(id, final);
      return final;
    }
    if (result.intoPage) {
      const j = await job(user.id, id);
      const final = await commitIntoPage(s, user, actor, j.result.plan, target, id);
      await s.db.query(`update jobs set result = result || $2::jsonb where id = $1`, [id, JSON.stringify({ commit: final })]);
      await logCommitStages(id, final);
      return final;
    }
    s.bus.emit({ type: 'tree-changed', orgId: user.orgId, spaceId: target.spaceId });
    if (!result.repeated) await logCommitStages(id, result);
    return result;
  });

  /** Appends the final pipeline stages (atomic commit, search indexing queued) to the job's stage log. */
  async function logCommitStages(id: string, result: any) {
    const at = new Date().toISOString();
    const extra = [
      { stage: 'commit', at, pages: result?.pages?.length ?? 0 },
      { stage: 'index', at, status: 'queued' },
    ];
    s.log.info({ jobId: id, stage: 'commit', pages: result?.pages?.length ?? 0 }, 'import stage');
    await s.db.query(`update jobs set progress = jsonb_set(coalesce(progress, '{}'::jsonb), '{stages}', coalesce(progress->'stages', '[]'::jsonb) || $2::jsonb) || jsonb_build_object('stage', 'done') where id = $1`, [id, JSON.stringify(extra)]);
  }

  app.post('/api/v1/imports/:id/cancel', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const j = await job(user.id, id);
    if (j.status === 'succeeded') throw conflict('already_committed', 'Импорт уже выполнен — удалите созданные страницы или восстановите версию');
    await s.db.query(`update jobs set status = 'cancelled', cancel_requested = true, finished_at = now() where id = $1`, [id]);
    return { ok: true };
  });

  app.get('/api/v1/jobs', async (req) => {
    const user = requireUser(req);
    const rows = (await s.db.query(`select id, type, status, progress, error, created_at, finished_at, report from jobs where created_by = $1 order by created_at desc limit 50`, [user.id])).rows;
    return { jobs: rows };
  });

  // ------------------------------------------------------------------ exports

  /** Quick synchronous export of one page (or branch) — the common case. */
  app.get('/api/v1/pages/:id/export', async (req, reply) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const qs = parse(z.object({ format: z.enum(['md', 'docx', 'html', 'pdf']), children: z.coerce.boolean().default(false) }), req.query);
    const acc = await requirePage(s.db, user, id, 'view');
    if (!acc.actions.export) throw forbidden('Экспорт запрещён политикой или правами');
    const out = await exportPages(s, user, [id], qs.format as ExportFormat, { includeChildren: qs.children });
    await auditStandalone(s.db, actorOf(req), { action: 'export.page', targetType: 'page', targetId: id, details: { format: qs.format, children: qs.children, ...out.report, warnings: out.warnings.length } });
    reply.header('content-disposition', `attachment; filename="export.${out.filename.split('.').pop()}"; filename*=UTF-8''${encodeURIComponent(out.filename)}`);
    reply.header('x-export-warnings', encodeURIComponent(JSON.stringify(out.warnings.slice(0, 20))));
    reply.header('x-content-sha256', String(out.report.sha256));
    return reply.type(out.mime).send(out.buffer);
  });

  /** Background export for large selections; result downloadable for 24 hours by its creator only. */
  app.post('/api/v1/exports', async (req) => {
    const user = requireUser(req);
    const body = parse(z.object({ pageIds: z.array(uuid).min(1).max(1000).optional(), spaceId: uuid.optional(), format: z.enum(['md', 'docx', 'html', 'pdf']), includeChildren: z.boolean().default(true), layout: z.enum(['merged', 'files']).default('merged'), idempotencyKey: z.string().max(100).optional() }), req.body);
    let ids = body.pageIds ?? [];
    if (body.spaceId) {
      const acc = await requireSpace(s.db, user, body.spaceId, 'view');
      if (!acc.actions.export) throw forbidden('Экспорт пространства запрещён');
      ids = (await s.db.query(`select id from pages where space_id = $1 and parent_id is null and deleted_at is null order by sort_key collate "C"`, [body.spaceId])).rows.map((r) => r.id);
    }
    for (const id of ids.slice(0, 50)) {
      const a = await pageAccess(s.db, user, id);
      if (!a?.actions.view) throw notFound();
    }
    if (body.idempotencyKey) {
      const ex = (await s.db.query(`select id from jobs where org_id = $1 and type = 'export' and created_by = $2 and idempotency_key = $3`, [user.orgId, user.id, body.idempotencyKey])).rows[0];
      if (ex) return { jobId: ex.id, duplicate: true };
    }
    const r = await s.db.query(`insert into jobs (org_id, type, idempotency_key, created_by, params) values ($1, 'export', $2, $3, $4) returning id`, [user.orgId, body.idempotencyKey ?? null, user.id, { pageIds: ids, format: body.format, includeChildren: body.includeChildren, layout: body.layout, traceparent: req.span?.traceparent() }]);
    await auditStandalone(s.db, actorOf(req), { action: 'export.request', targetType: body.spaceId ? 'space' : 'page', targetId: body.spaceId ?? ids[0], details: { count: ids.length, format: body.format } });
    return { jobId: r.rows[0].id };
  });

  app.get('/api/v1/exports/:id', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const j = await job(user.id, id, 'export');
    return { id: j.id, status: j.status, progress: j.progress, error: j.error, report: j.report, cancelRequested: j.cancel_requested === true, file: j.result?.sha ? { filename: j.result.filename, size: j.result.size, sha256: j.result.sha } : null };
  });

  /** Cancels a background export (R-EXPORT-022): a queued job never runs; a running one stops at the next page. */
  app.post('/api/v1/exports/:id/cancel', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const j = await job(user.id, id, 'export');
    if (j.status === 'succeeded' || j.status === 'partial') throw conflict('already_finished', 'Экспорт уже завершён — файл можно не скачивать');
    if (j.status === 'failed' || j.status === 'cancelled') return { ok: true, status: j.status };
    const r = (
      await s.db.query(
        `update jobs set cancel_requested = true,
                status = case when status = 'queued' then 'cancelled' else status end,
                finished_at = case when status = 'queued' then now() else finished_at end
          where id = $1 returning status`,
        [id],
      )
    ).rows[0];
    await auditStandalone(s.db, actorOf(req), { action: 'export.cancel', targetType: 'job', targetId: id, details: { status: r.status } });
    return { ok: true, status: r.status };
  });

  app.get('/api/v1/exports/:id/download', async (req, reply) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const j = await job(user.id, id, 'export');
    if (j.status !== 'succeeded') throw conflict('not_ready', 'Экспорт ещё не готов');
    if (Date.now() - new Date(j.finished_at).getTime() > 24 * 3600_000) throw conflict('expired', 'Срок хранения файла экспорта истёк — запустите экспорт снова');
    // Rights may have changed since the file was produced: every exported page must still be viewable and exportable.
    const ids: string[] = j.result.pageIds ?? j.params.pageIds ?? [];
    const acc = await accessForPages(s.db, user, ids);
    const denied = ids.filter((pid) => { const a = acc.get(pid); return !a || !a.actions.view || !a.actions.export || a.deleted; });
    if (denied.length) {
      await auditStandalone(s.db, actorOf(req), { action: 'export.download', outcome: 'denied', targetType: 'job', targetId: id, details: { reason: 'access_changed', deniedPages: denied.length } });
      throw forbidden('Права на часть страниц экспорта изменились — запустите экспорт заново');
    }
    await auditStandalone(s.db, actorOf(req), { action: 'export.download', targetType: 'job', targetId: id });
    reply.header('content-disposition', `attachment; filename="export"; filename*=UTF-8''${encodeURIComponent(j.result.filename)}`);
    reply.header('x-content-sha256', j.result.sha);
    return reply.type(j.result.mime).send(await s.store.read(blobKey(j.result.sha)));
  });
}
