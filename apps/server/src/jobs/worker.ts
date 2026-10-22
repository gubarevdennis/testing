import type pg from 'pg';
import type { Logger } from 'pino';
import { hostname } from 'node:os';
import { extractPageRefs, docToPlainText } from '@kb/shared';
import { tx } from '../db/pool.js';
import type { Services } from '../app.js';
import { purgePages } from '../services/pages.js';
import { verifyBlobs } from '../services/integrity.js';
import { orgSettings } from '../services/org.js';
import { checkConsistency, type ConsistencyReport } from '../services/consistency.js';
import { attachedFilesText } from '../services/file-text.js';
import type { BlobStore } from '../storage/blob-store.js';
import { parseTraceparent } from '../observability/tracing.js';

export interface JobContext {
  s: Services;
  job: JobRow;
  progress(p: Record<string, unknown>): Promise<void>;
  cancelled(): Promise<boolean>;
}

export interface JobRow {
  id: string;
  org_id: string;
  type: string;
  params: any;
  created_by: string | null;
  attempts: number;
}

export type JobHandler = (ctx: JobContext) => Promise<{ status?: 'succeeded' | 'partial' | 'awaiting_confirmation'; result?: unknown; report?: unknown }>;

const handlers = new Map<string, JobHandler>();
export function registerJob(type: string, h: JobHandler) {
  handlers.set(type, h);
}

/** Search index document for a page: live content + published revision, OCR text, file names, properties. */
export async function indexPage(db: pg.Pool | pg.PoolClient, pageId: string, store?: BlobStore) {
  const p = (await db.query(`select p.*, s.deleted_at as space_deleted from pages p join spaces s on s.id = p.space_id where p.id = $1`, [pageId])).rows[0];
  if (!p || p.deleted_at || p.space_deleted) {
    await db.query('delete from search_index where page_id = $1', [pageId]);
    return;
  }
  const st = (await db.query('select content, plain_text from doc_state where page_id = $1', [pageId])).rows[0];
  const body = st?.plain_text ?? '';
  const files = (await db.query(`select string_agg(filename, ' ') f from attachments where page_id = $1 and deleted_at is null`, [pageId])).rows[0].f ?? '';
  const ocr = (
    await db.query(
      `select string_agg(coalesce(o.corrected_text, o.text), E'\\n') t from attachments a
         join lateral (select * from ocr_results r where r.attachment_id = a.id and r.status in ('done', 'partial') order by r.created_at desc limit 1) o on true
        where a.page_id = $1 and a.deleted_at is null`,
      [pageId],
    )
  ).rows[0].t ?? '';
  // Comment text (visible to everyone who can see the page) and text of attached documents (R-SEARCH-003, R-SEARCH-013).
  const comments = (await db.query(`select string_agg(coalesce(quote, '') || ' ' || body_text, E'\\n' order by created_at) t from comments where page_id = $1 and deleted_at is null`, [pageId])).rows[0].t ?? '';
  const fileText = await attachedFilesText(db, pageId, store);
  const props = Object.entries(p.properties ?? {})
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join('\n');
  let pubTitle: string | null = null;
  let pubBody: string | null = null;
  if (p.published_revision_id) {
    const rev = (await db.query('select title, content from page_revisions where id = $1', [p.published_revision_id])).rows[0];
    if (rev) {
      pubTitle = rev.title;
      pubBody = docToPlainText(rev.content);
    }
  }
  await db.query(
    `insert into search_index (page_id, org_id, space_id, title, body, ocr, files, properties, tsv, pub_title, pub_body, pub_tsv, updated_at, comments, file_text)
     values ($1, $2, $3, $4, $5, $6, $7, $8,
       setweight(to_tsvector('russian', $4), 'A') || setweight(to_tsvector('english', $4), 'A') ||
       setweight(to_tsvector('russian', $5), 'B') || setweight(to_tsvector('english', $5), 'B') ||
       setweight(to_tsvector('russian', $8 || ' ' || $7), 'C') || setweight(to_tsvector('russian', $6), 'D') || setweight(to_tsvector('english', $6), 'D') ||
       setweight(to_tsvector('russian', $11), 'C') || setweight(to_tsvector('english', $11), 'C') || setweight(to_tsvector('russian', $12), 'D') || setweight(to_tsvector('english', $12), 'D'),
       $9, $10,
       case when $9::text is null then null else setweight(to_tsvector('russian', $9), 'A') || setweight(to_tsvector('english', $9), 'A') || setweight(to_tsvector('russian', $10), 'B') || setweight(to_tsvector('english', $10), 'B') || setweight(to_tsvector('russian', $6), 'D') end,
       now(), $11, $12)
     on conflict (page_id) do update set space_id = excluded.space_id, title = excluded.title, body = excluded.body, ocr = excluded.ocr, files = excluded.files, properties = excluded.properties,
       tsv = excluded.tsv, pub_title = excluded.pub_title, pub_body = excluded.pub_body, pub_tsv = excluded.pub_tsv, updated_at = now(), comments = excluded.comments, file_text = excluded.file_text`,
    [pageId, p.org_id, p.space_id, p.title, body, ocr, files, props, pubTitle, pubBody, comments, fileText],
  );
  // Link graph for backlinks and broken-link detection.
  if (st?.content) {
    const refs = extractPageRefs(st.content).filter((id) => id !== pageId);
    await db.query('delete from page_links where source_page_id = $1', [pageId]);
    if (refs.length) await db.query(`insert into page_links (source_page_id, target_page_id) select $1, unnest($2::uuid[]) on conflict do nothing`, [pageId, refs]);
  }
}

let lastConsistencyReport: ConsistencyReport | null = null;
/** Result of the most recent integrity check in this process (null before the first run). */
export function latestConsistencyReport() {
  return lastConsistencyReport;
}

export class Worker {
  private timers: NodeJS.Timeout[] = [];
  private running = 0;
  private stopped = false;
  private readonly id = `${hostname()}:${process.pid}:${Math.random().toString(36).slice(2, 6)}`;

  constructor(
    private s: Services,
    private log: Logger,
  ) {}

  start() {
    const loop = (fn: () => Promise<unknown>, ms: number) => {
      const tick = async () => {
        if (this.stopped) return;
        try {
          await fn();
        } catch (err) {
          this.log.error({ err }, 'worker loop error');
        }
        if (!this.stopped) this.timers.push(setTimeout(tick, ms));
      };
      this.timers.push(setTimeout(tick, 50));
    };
    loop(() => this.processOutbox(), 500);
    loop(() => this.processJobs(), 700);
    loop(() => this.maintenance(), 60 * 60_000);
  }

  async stop() {
    this.stopped = true;
    for (const t of this.timers) clearTimeout(t);
    while (this.running > 0) await new Promise((r) => setTimeout(r, 50));
  }

  /** Drains the outbox (search indexing etc.). Each event is processed at-least-once; handlers are idempotent. */
  async processOutbox(limit = 100): Promise<number> {
    const db = this.s.db;
    let processed = 0;
    await tx(db, async (q) => {
      const rows = (await q.query(`select id, topic, payload from outbox where processed_at is null and attempts < 10 order by id limit $1 for update skip locked`, [limit])).rows;
      const seen = new Set<string>();
      for (const r of rows) {
        const key = r.topic + JSON.stringify(r.payload);
        try {
          if (!seen.has(key)) {
            seen.add(key);
            await this.handleOutbox(q, r.topic, r.payload);
          }
          await q.query('update outbox set processed_at = now() where id = $1', [r.id]);
          processed++;
        } catch (err) {
          this.log.error({ err, topic: r.topic }, 'outbox handler failed');
          await q.query('update outbox set attempts = attempts + 1, last_error = $2 where id = $1', [r.id, String((err as Error).message).slice(0, 500)]);
        }
      }
    });
    return processed;
  }

  private async handleOutbox(q: pg.PoolClient, topic: string, payload: any) {
    switch (topic) {
      case 'index-page':
        await q.query('savepoint ix');
        try {
          await indexPage(q, payload.pageId, this.s.store);
          await q.query('release savepoint ix');
        } catch (e) {
          await q.query('rollback to savepoint ix');
          throw e;
        }
        return;
      case 'reindex-subtree': {
        const ids = (await q.query('select page_id from page_ancestors where ancestor_id = $1', [payload.pageId])).rows.map((r) => r.page_id);
        for (const id of ids) await indexPage(q, id, this.s.store);
        return;
      }
      default:
        this.log.warn({ topic }, 'unknown outbox topic');
    }
  }

  /** Runs queued jobs (import, export, OCR, backup verification...). */
  async processJobs(): Promise<number> {
    if (this.running >= this.s.cfg.workerConcurrency) return 0;
    const job = (
      await this.s.db.query(
        `update jobs set status = 'running', locked_by = $1, locked_until = now() + interval '10 minutes', started_at = coalesce(started_at, now()), attempts = attempts + 1
          where id = (select id from jobs where (status = 'queued' and run_after <= now()) or (status = 'running' and locked_until < now()) order by created_at limit 1 for update skip locked)
          returning *`,
        [this.id],
      )
    ).rows[0] as JobRow | undefined;
    if (!job) return 0;
    this.running++;
    void this.runJob(job).finally(() => this.running--);
    return 1;
  }

  async runJob(job: JobRow) {
    // Each job run is its own trace (consumer span), continuing the request's trace when the job recorded one.
    return this.s.tracer.withSpan(`job ${job.type}`, { parent: parseTraceparent(job.params?.traceparent) ?? null, kind: 'consumer', attributes: { 'kb.job.id': job.id, 'kb.job.type': job.type, 'kb.job.attempt': job.attempts } }, () => this.runJobInner(job));
  }

  private async runJobInner(job: JobRow) {
    const h = handlers.get(job.type);
    const db = this.s.db;
    const heartbeat = setInterval(() => void db.query(`update jobs set locked_until = now() + interval '10 minutes' where id = $1`, [job.id]).catch(() => undefined), 60_000);
    try {
      if (!h) throw new Error('Неизвестный тип задания: ' + job.type);
      const ctx: JobContext = {
        s: this.s,
        job,
        progress: async (p) => {
          await db.query(`update jobs set progress = $2 where id = $1`, [job.id, p]);
        },
        cancelled: async () => (await db.query('select cancel_requested from jobs where id = $1', [job.id])).rows[0]?.cancel_requested === true,
      };
      const r = await h(ctx);
      const cancelled = await ctx.cancelled();
      await db.query(`update jobs set status = $2, result = $3, report = $4, finished_at = now(), locked_by = null where id = $1`, [job.id, cancelled ? 'cancelled' : r.status ?? 'succeeded', r.result ?? null, r.report ?? null]);
      this.s.metrics.jobsTotal.labels(job.type, r.status ?? 'succeeded').inc();
    } catch (err) {
      this.log.error({ err, jobId: job.id, type: job.type }, 'job failed');
      const retry = job.attempts < 3 && (err as any).retryable;
      await db.query(
        `update jobs set status = $2, error = $3, finished_at = case when $2 = 'failed' then now() else null end, run_after = now() + interval '30 seconds', locked_by = null where id = $1`,
        [job.id, retry ? 'queued' : 'failed', String((err as Error).message).slice(0, 2000)],
      );
      this.s.metrics.jobsTotal.labels(job.type, 'failed').inc();
    } finally {
      clearInterval(heartbeat);
    }
  }

  /** Retention policy enforcement: trash purge, journal compaction, revision thinning. Legal holds are respected. */
  async maintenance() {
    const db = this.s.db;
    const orgs = (await db.query('select id from organizations')).rows;
    for (const o of orgs) {
      const st = await orgSettings(db, o.id);
      const trashDays = st.retention?.trashDays ?? this.s.cfg.retention.trashDays;
      const expired = (
        await db.query(`select id from pages where org_id = $1 and deleted_at < now() - make_interval(days => $2) and not legal_hold and not exists (select 1 from spaces s where s.id = pages.space_id and s.legal_hold)`, [o.id, trashDays])
      ).rows.map((r) => r.id);
      if (expired.length) await tx(db, (q) => purgePages(q, { orgId: o.id, name: 'retention' }, expired, `retention ${trashDays} days`));
      const journalDays = st.retention?.journalDays ?? this.s.cfg.retention.journalDays;
      // Journal rows already folded into a snapshot and older than the journal retention are removed.
      await db.query(
        `delete from doc_updates d using doc_state s, pages p where d.page_id = s.page_id and p.id = d.page_id and p.org_id = $1 and d.seq <= s.snapshot_seq and d.seq > 1 and d.created_at < now() - make_interval(days => $2) and not p.legal_hold`,
        [o.id, journalDays],
      );
      const revisionDays = st.retention?.revisionDays ?? this.s.cfg.retention.revisionDays;
      // Old automatic revisions are thinned; publish/manual/restore revisions and the latest revision are kept.
      await db.query(
        `delete from page_revisions r using pages p where p.id = r.page_id and p.org_id = $1 and r.kind = 'auto' and r.created_at < now() - make_interval(days => $2) and not p.legal_hold
           and r.id <> coalesce(p.published_revision_id, '00000000-0000-0000-0000-000000000000') and r.number < (select max(number) from page_revisions x where x.page_id = r.page_id)
           and not exists (select 1 from page_revisions y where y.restored_from = r.id) and not exists (select 1 from approvals a where a.revision_id = r.id)`,
        [o.id, revisionDays],
      );
    }
    // Integrity of stored files: a slice of the store is re-hashed every run (whole store roughly weekly).
    try {
      const r = await verifyBlobs(db, this.s.store, { limit: this.s.cfg.integrityBatch });
      if (r.failed.length) this.log.error({ failed: r.failed }, 'stored files failed integrity verification');
    } catch (err) {
      this.log.error({ err }, 'integrity verification failed');
    }
    await db.query(`delete from outbox where processed_at < now() - interval '7 days'`);
    await db.query(`delete from upload_sessions where expires_at < now() - interval '1 day'`);
    await db.query(`delete from sessions where expires_at < now() - interval '30 days' or revoked_at < now() - interval '30 days'`);
    await db.query(`delete from idempotency_keys where created_at < now() - interval '2 days'`);
    await this.consistencyCheck();
  }

  /** Consistency check of the tree and the document journal; the result feeds kb_integrity_errors (R-COLLAB-037). */
  async consistencyCheck(): Promise<ConsistencyReport> {
    const report = await checkConsistency(this.s.db);
    this.s.metrics.integrityErrors.set(report.total);
    lastConsistencyReport = report;
    if (!report.ok) this.log.error({ problems: report.problems }, 'data integrity check found problems');
    return report;
  }
}
