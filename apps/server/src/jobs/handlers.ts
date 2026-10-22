// Registers background job handlers. Each handler is idempotent: a job may be retried after a crash.
import { registerJob, indexPage } from './worker.js';
import { makeTiles } from '../services/attachments.js';
import { blobKey } from '../storage/blob-store.js';
import { recognize } from '../ocr/ocr.js';

registerJob('tiles', async ({ s, job }) => {
  const info = await makeTiles(s.db, s.store, job.params.sha256, job.params.mime);
  return { result: info ?? { skipped: true } };
});

registerJob('ocr', async ({ s, job }) => {
  const { attachmentId, version, region, rotation, resultId } = job.params;
  const v = (await s.db.query(`select v.*, a.page_id from attachment_versions v join attachments a on a.id = v.attachment_id where v.attachment_id = $1 and v.version = $2`, [attachmentId, version])).rows[0];
  const target = resultId
    ? resultId
    : (await s.db.query(`select id from ocr_results where attachment_id = $1 and version = $2 order by created_at desc limit 1`, [attachmentId, version])).rows[0]?.id;
  if (!v || !target) return { result: { skipped: true } };
  await s.db.query(`update ocr_results set status = 'processing', attempts = attempts + 1, updated_at = now() where id = $1`, [target]);
  try {
    const out = await recognize(await s.store.readBuffer(blobKey(v.blob_sha256)), { tessdataDir: s.cfg.tessdataDir, region, rotation, log: s.log });
    const status = !out.text ? 'partial' : out.confidence < 55 ? 'partial' : 'done';
    await s.db.query(`update ocr_results set status = $2, text = $3, words = $4, confidence = $5, error = null, updated_at = now() where id = $1`, [target, status, out.text, JSON.stringify(out.words), out.confidence]);
    if (v.page_id) await indexPage(s.db, v.page_id, s.store);
    return { result: { status, confidence: out.confidence, chars: out.text.length } };
  } catch (e) {
    await s.db.query(`update ocr_results set status = 'error', error = $2, updated_at = now() where id = $1`, [target, (e as Error).message.slice(0, 500)]);
    throw e;
  }
});
