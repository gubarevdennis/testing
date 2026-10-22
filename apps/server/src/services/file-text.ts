import mammoth from 'mammoth';
import type { Queryable } from '../db/pool.js';
import { blobKey, type BlobStore } from '../storage/blob-store.js';

const MAX_SOURCE_BYTES = 30 * 1024 * 1024;
const MAX_TEXT_CHARS = 500_000;
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Which attached files have searchable text (R-SEARCH-013). DOCX via mammoth, plain text formats as UTF-8.
 * PDF text extraction is NOT supported: no PDF parser is installed in this build (scanned PDFs/images go through OCR).
 */
export function extractableKind(mime: string, filename: string): 'docx' | 'text' | null {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  if (mime === DOCX || ext === 'docx') return 'docx';
  if (mime.startsWith('text/') || ['txt', 'md', 'markdown', 'csv', 'log'].includes(ext)) return 'text';
  return null;
}

export async function extractText(buf: Buffer, kind: 'docx' | 'text'): Promise<string> {
  const text = kind === 'docx' ? (await mammoth.extractRawText({ buffer: buf })).value : buf.toString('utf8');
  return text.replace(/\u0000/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').slice(0, MAX_TEXT_CHARS);
}

/**
 * Text of the current versions of a page's attached files, extracting (and caching by content hash) what has
 * not been extracted yet when a blob store is available.
 */
export async function attachedFilesText(q: Queryable, pageId: string, store?: BlobStore): Promise<string> {
  const rows = (
    await q.query(
      `select v.blob_sha256, v.mime, v.filename, v.size, t.status, t.text
         from attachments a join attachment_versions v on v.attachment_id = a.id and v.version = a.current_version
         left join blob_texts t on t.blob_sha256 = v.blob_sha256
        where a.page_id = $1 and a.deleted_at is null and a.kind = 'file'`,
      [pageId],
    )
  ).rows;
  const parts: string[] = [];
  for (const r of rows) {
    if (r.status) {
      if (r.status === 'done' && r.text) parts.push(r.text);
      continue;
    }
    const kind = extractableKind(r.mime ?? '', r.filename ?? '');
    if (!kind || !store) continue;
    if (Number(r.size) > MAX_SOURCE_BYTES) {
      await q.query(`insert into blob_texts (blob_sha256, status, error) values ($1, 'unsupported', 'too large') on conflict do nothing`, [r.blob_sha256]);
      continue;
    }
    try {
      const text = await extractText(await store.readBuffer(blobKey(r.blob_sha256)), kind);
      await q.query(`insert into blob_texts (blob_sha256, status, text) values ($1, 'done', $2) on conflict do nothing`, [r.blob_sha256, text]);
      if (text) parts.push(text);
    } catch (e) {
      await q.query(`insert into blob_texts (blob_sha256, status, error) values ($1, 'error', $2) on conflict do nothing`, [r.blob_sha256, String((e as Error).message).slice(0, 500)]);
    }
  }
  return parts.join('\n');
}
