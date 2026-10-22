import type pg from 'pg';
import type { Queryable } from '../db/pool.js';
import type { BlobStore } from '../storage/blob-store.js';
import { auditStandalone } from './audit.js';

export interface IntegrityResult {
  checked: number;
  failed: Array<{ sha256: string; status: 'corrupt' | 'missing'; error: string }>;
}

/**
 * Re-hashes stored files (originals of attachments, covers, import sources) and compares them with their content
 * address (R-FILES-007). Oldest-verified blobs go first, so repeated runs cover the whole store over time.
 * Problems are recorded on the blob, audited once per state change and reported in the admin health panel.
 */
export async function verifyBlobs(db: pg.Pool, store: BlobStore, opts: { limit?: number; minAgeHours?: number } = {}): Promise<IntegrityResult> {
  const rows = (
    await db.query(`select sha256, storage_key, verify_status from blobs where verified_at is null or verified_at < now() - make_interval(hours => $2) order by verified_at nulls first limit $1`, [
      opts.limit ?? 200,
      opts.minAgeHours ?? 24 * 7,
    ])
  ).rows as Array<{ sha256: string; storage_key: string; verify_status: string }>;
  const failed: IntegrityResult['failed'] = [];
  for (const b of rows) {
    let status: 'ok' | 'corrupt' | 'missing' = 'ok';
    let error: string | null = null;
    try {
      if (!(await store.exists(b.storage_key))) {
        status = 'missing';
        error = 'Объект отсутствует в хранилище';
      } else {
        const actual = await store.hash(b.storage_key);
        if (actual !== b.sha256) {
          status = 'corrupt';
          error = `SHA-256 не совпадает: ${actual}`;
        }
      }
    } catch (e) {
      status = 'missing';
      error = (e as Error).message.slice(0, 500);
    }
    await db.query('update blobs set verified_at = now(), verify_status = $2, verify_error = $3 where sha256 = $1', [b.sha256, status, error]);
    if (status !== 'ok') {
      failed.push({ sha256: b.sha256, status, error: error ?? '' });
      if (b.verify_status !== status) {
        const orgs = (await db.query(`select distinct a.org_id from attachment_versions v join attachments a on a.id = v.attachment_id where v.blob_sha256 = $1`, [b.sha256])).rows;
        for (const o of orgs.length ? orgs : [{ org_id: null }])
          await auditStandalone(db, { orgId: o.org_id, name: 'integrity-check' }, { action: 'blob.integrity_failed', outcome: 'failure', targetType: 'blob', details: { sha256: b.sha256, status, error } });
      }
    }
  }
  return { checked: rows.length, failed };
}

/** Number of blobs whose last verification failed (admin health panel). */
export async function integrityProblems(db: Queryable, orgId: string): Promise<number> {
  return (
    await db.query(
      `select count(distinct b.sha256)::int c from blobs b join attachment_versions v on v.blob_sha256 = b.sha256 join attachments a on a.id = v.attachment_id where a.org_id = $1 and b.verify_status <> 'ok'`,
      [orgId],
    )
  ).rows[0].c;
}
