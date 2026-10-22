import { createHash } from 'node:crypto';
import type { Queryable } from '../db/pool.js';
import { canonicalJson } from '../lib/canonical-json.js';

export interface AuditActor {
  userId?: string | null;
  name?: string | null;
  sessionId?: string | null;
  ip?: string | null;
  correlationId?: string | null;
  orgId?: string | null;
}

export interface AuditEntry {
  action: string;
  targetType?: string;
  targetId?: string | null;
  outcome?: 'success' | 'denied' | 'failure';
  details?: Record<string, unknown>;
}

/**
 * Appends to the hash-chained audit log. Call inside the same transaction as the audited change so the log
 * contains exactly the committed actions. The advisory lock serialises the chain.
 */
export async function audit(q: Queryable, actor: AuditActor, e: AuditEntry): Promise<void> {
  await q.query('select pg_advisory_xact_lock(4242)');
  const prev = await q.query('select hash from audit_events order by id desc limit 1');
  const prevHash: string | null = prev.rows[0]?.hash ?? null;
  const at = new Date().toISOString();
  const record = {
    org: actor.orgId ?? null,
    at,
    actor: actor.userId ?? null,
    action: e.action,
    targetType: e.targetType ?? null,
    targetId: e.targetId ?? null,
    outcome: e.outcome ?? 'success',
    details: JSON.parse(JSON.stringify(e.details ?? {})),
  };
  const hash = createHash('sha256').update((prevHash ?? '') + canonicalJson(record)).digest('hex');
  await q.query(
    `insert into audit_events (org_id, at, actor_id, actor_name, session_id, ip, action, target_type, target_id, outcome, correlation_id, details, prev_hash, hash)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [record.org, at, record.actor, actor.name ?? null, actor.sessionId ?? null, actor.ip ?? null, e.action, record.targetType, record.targetId, record.outcome, actor.correlationId ?? null, record.details, prevHash, hash],
  );
}

/** Audit write outside of a business transaction (denials, logins); wraps in its own transaction for the lock. */
export async function auditStandalone(pool: { connect(): Promise<any> }, actor: AuditActor, e: AuditEntry): Promise<void> {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await audit(c, actor, e);
    await c.query('commit');
  } catch (err) {
    await c.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    c.release();
  }
}

/** Verifies the hash chain; returns the id of the first broken record or null. */
export async function verifyAuditChain(q: Queryable): Promise<{ ok: boolean; brokenAt: number | null; checked: number }> {
  const r = await q.query('select id, org_id, at, actor_id, action, target_type, target_id, outcome, details, prev_hash, hash from audit_events order by id');
  let prev: string | null = null;
  for (const row of r.rows) {
    const record = {
      org: row.org_id,
      at: new Date(row.at).toISOString(),
      actor: row.actor_id,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      outcome: row.outcome,
      details: row.details,
    };
    const expected = createHash('sha256').update((prev ?? '') + canonicalJson(record)).digest('hex');
    if (row.prev_hash !== prev || row.hash !== expected) return { ok: false, brokenAt: row.id, checked: r.rows.length };
    prev = row.hash;
  }
  return { ok: true, brokenAt: null, checked: r.rows.length };
}
