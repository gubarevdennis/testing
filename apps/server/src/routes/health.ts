import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parse, requireUser, type Services } from '../app.js';
import { isOrgAdmin } from '../acl/engine.js';
import { forbidden } from '../lib/errors.js';
import { migrationStatus } from '../db/migrate.js';

export async function healthRoutes(app: FastifyInstance, s: Services) {
  /** Liveness: the process is up. */
  app.get('/healthz', { config: { rateLimit: false } }, async () => ({ status: 'ok' }));

  /** Readiness: database and object storage reachable, migrations applied. */
  app.get('/readyz', { config: { rateLimit: false } }, async (_req, reply) => {
    const checks: Record<string, string> = {};
    try {
      await s.db.query('select 1');
      checks.database = 'ok';
    } catch (e) {
      checks.database = 'error: ' + (e as Error).message;
    }
    try {
      await s.store.healthCheck();
      checks.storage = 'ok';
    } catch (e) {
      checks.storage = 'error: ' + (e as Error).message;
    }
    try {
      const pending = (await migrationStatus(s.db)).filter((m) => !m.applied);
      checks.migrations = pending.length ? `pending: ${pending.map((m) => m.name).join(', ')}` : 'ok';
    } catch (e) {
      checks.migrations = 'error: ' + (e as Error).message;
    }
    const ok = Object.values(checks).every((v) => v === 'ok');
    return reply.status(ok ? 200 : 503).send({ status: ok ? 'ready' : 'not_ready', checks });
  });

  app.get('/metrics', { config: { rateLimit: false } }, async (req, reply) => {
    const token = process.env.METRICS_TOKEN;
    if (token && req.headers.authorization !== `Bearer ${token}`) return reply.status(401).send('unauthorized');
    const pending = (await s.db.query('select count(*)::int c from outbox where processed_at is null')).rows[0].c;
    s.metrics.outboxLag.set(pending);
    const q = (await s.db.query(`select count(*)::int c from jobs where status = 'queued'`)).rows[0].c;
    s.metrics.jobsQueued.set(q);
    const b = (await s.db.query(`select max(finished_at) f, max(verified_at) filter (where verify_status = 'ok') v from backups where status = 'ok'`)).rows[0];
    if (b.f) s.metrics.backupAgeSeconds.set((Date.now() - new Date(b.f).getTime()) / 1000);
    if (b.v) s.metrics.restoreVerifyAgeSeconds.set((Date.now() - new Date(b.v).getTime()) / 1000);
    reply.type(s.metrics.registry.contentType);
    return s.metrics.registry.metrics();
  });

  /** Client telemetry (errors, input latency, unsynced queue age). No document content is accepted. */
  app.post('/api/v1/telemetry', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => {
    requireUser(req);
    const body = parse(
      z.object({
        errors: z.array(z.object({ kind: z.string().max(50), message: z.string().max(500) })).max(20).optional(),
        inputLatencyMs: z.array(z.number().min(0).max(10_000)).max(200).optional(),
        unsyncedAgeSeconds: z.number().min(0).max(86400 * 30).optional(),
      }),
      req.body,
    );
    for (const e of body.errors ?? []) {
      s.metrics.clientErrors.labels(e.kind).inc();
      req.log.warn({ clientError: e }, 'client error');
    }
    for (const v of body.inputLatencyMs ?? []) s.metrics.clientInputLatency.observe(v);
    if (body.unsyncedAgeSeconds !== undefined) s.metrics.clientUnsyncedAge.observe(body.unsyncedAgeSeconds);
    return { ok: true };
  });

  /** "Здоровье системы" panel for administrators. */
  app.get('/api/v1/admin/health', async (req) => {
    const user = requireUser(req);
    if (!isOrgAdmin(user)) throw forbidden();
    const db = (await s.db.query(`select pg_database_size(current_database())::bigint as size, (select count(*)::int from pages where org_id = $1) as pages, (select count(*)::int from attachments where org_id = $1) as attachments, (select coalesce(sum(size), 0)::bigint from blobs) as blob_bytes`, [user.orgId])).rows[0];
    const outbox = (await s.db.query(`select count(*)::int pending, min(created_at) oldest from outbox where processed_at is null`)).rows[0];
    const jobs = (await s.db.query(`select status, count(*)::int c from jobs where org_id = $1 and created_at > now() - interval '7 days' group by status`, [user.orgId])).rows;
    const failedJobs = (await s.db.query(`select id, type, error, finished_at from jobs where org_id = $1 and status = 'failed' order by finished_at desc limit 10`, [user.orgId])).rows;
    const backups = (await s.db.query(`select kind, status, location, size_bytes, finished_at, verified_at, verify_status from backups order by started_at desc limit 10`)).rows;
    const lastBackup = backups.find((b) => b.status === 'ok');
    const lastVerified = backups.find((b) => b.verify_status === 'ok');
    let storage = 'ok';
    try {
      await s.store.healthCheck();
    } catch (e) {
      storage = (e as Error).message;
    }
    return {
      services: { database: 'ok', storage, collab: s.hub.stats() },
      database: db,
      searchIndexLag: outbox,
      jobs,
      failedJobs,
      backups,
      lastSuccessfulBackupAt: lastBackup?.finished_at ?? null,
      lastSuccessfulRestoreVerificationAt: lastVerified?.verified_at ?? null,
      warnings: [
        ...(!lastBackup ? ['Нет успешных резервных копий'] : new Date(lastBackup.finished_at).getTime() < Date.now() - 26 * 3600_000 ? ['Последняя резервная копия старше 26 часов'] : []),
        ...(!lastVerified ? ['Восстановление из резервной копии ещё не проверялось'] : new Date(lastVerified.verified_at).getTime() < Date.now() - 35 * 86400_000 ? ['Проверка восстановления старше 35 дней'] : []),
        ...(outbox.pending > 1000 ? ['Отставание поисковой индексации'] : []),
      ],
    };
  });
}
