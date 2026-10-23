import { ApiError, api, upload } from '../api/client';
import { Sha256 } from './sha256';
import { createStreamHasher, hashFileInThread } from './streamHash';

export interface AttachmentDto {
  id: string;
  pageId: string | null;
  filename: string;
  kind: string;
  version: number;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  sha256?: string;
  contentUrl: string;
  downloadUrl: string;
}

const RESUMABLE_FROM = 8 * 1024 * 1024;

/** SHA-256 of a small file (whole buffer). */
async function hashSmall(file: Blob): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  if (globalThis.crypto?.subtle) {
    const d = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
    return Array.from(d, (x) => x.toString(16).padStart(2, '0')).join('');
  }
  return new Sha256().update(buf).digestHex();
}

/** Upload sessions survive a page reload: the same file re-added later resumes from the bytes already on the server. */
const sessionKey = (file: File, pageId: string | null, replaceId?: string) => `kb:upload:${pageId ?? '-'}:${replaceId ?? '-'}:${file.name}:${file.size}:${file.lastModified}`;
function rememberSession(k: string, id: string | null) {
  try {
    if (id) localStorage.setItem(k, id);
    else localStorage.removeItem(k);
  } catch {
    /* storage unavailable */
  }
}
function recallSession(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Waits until the browser reports a network connection again. */
function online(signal?: AbortSignal) {
  if (navigator.onLine) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const on = () => (window.removeEventListener('online', on), resolve());
    window.addEventListener('online', on);
    signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  });
}

/**
 * Uploads a file as an attachment. Small files use one multipart request; large files use resumable
 * chunked upload that survives network interruptions (resumes from the last acknowledged offset).
 */
export async function uploadFile(file: File, pageId: string | null, onProgress?: (f: number, state?: 'waiting') => void, signal?: AbortSignal, replaceId?: string): Promise<AttachmentDto> {
  if (file.size < RESUMABLE_FROM) {
    for (let attempt = 0; ; attempt++) {
      try {
        const fd = new FormData();
        if (pageId) fd.append('pageId', pageId);
        if (replaceId) fd.append('replaceId', replaceId);
        fd.append('file', file, file.name || 'file');
        const r = await upload<{ attachments: AttachmentDto[]; errors: Array<{ filename: string; message: string }> }>('/api/v1/attachments', fd, (f) => onProgress?.(f), signal);
        if (!r.attachments.length) throw new ApiError(422, 'rejected', r.errors?.[0]?.message ?? 'Файл отклонён');
        // The server reports the checksum of what it stored: it must be the file we sent (R-FILES-004).
        const a = r.attachments[0];
        if (a.sha256 && a.sha256 !== (await hashSmall(file))) throw new ApiError(422, 'checksum_mismatch', 'Файл повреждён при передаче — загрузите его заново');
        return a;
      } catch (e) {
        if (e instanceof ApiError && e.isNetwork && attempt < 50) {
          onProgress?.(0, 'waiting');
          await online(signal);
          await sleep(Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5)));
          continue;
        }
        throw e;
      }
    }
  }
  const key = sessionKey(file, pageId, replaceId);
  let start: { uploadId: string; received: number; chunkSize: number } | null = null;
  const previous = recallSession(key);
  if (previous) {
    const st = await api<{ received: number; status: string; size: number }>('GET', `/api/v1/uploads/${previous}`).catch(() => null);
    if (st && st.status === 'open' && Number(st.size) === file.size) start = { uploadId: previous, received: Number(st.received), chunkSize: 4 * 1024 * 1024 };
  }
  start ??= await api<{ uploadId: string; received: number; chunkSize: number }>('POST', '/api/v1/uploads', { pageId, filename: file.name || 'file', size: file.size, mime: file.type || undefined, replaceId });
  rememberSession(key, start.uploadId);
  // The checksum is computed while streaming (in file order) and verified by the server at completion.
  // Hashing runs in a Web Worker: a large upload never blocks typing (R-PERF-019).
  const hasher = createStreamHasher();
  let hashed = 0;
  const hashUpTo = async (end: number) => {
    while (hashed < end) {
      const next = Math.min(end, hashed + 4 * 1024 * 1024);
      await hasher.update(new Uint8Array(await file.slice(hashed, next).arrayBuffer()));
      hashed = next;
    }
  };
  let offset = start.received;
  let failures = 0;
  while (offset < file.size) {
    if (signal?.aborted) {
      await api('DELETE', `/api/v1/uploads/${start.uploadId}`).catch(() => undefined);
      rememberSession(key, null);
      throw new DOMException('aborted', 'AbortError');
    }
    const chunk = file.slice(offset, offset + start.chunkSize);
    try {
      const r = await api<{ received: number }>('PUT', `/api/v1/uploads/${start.uploadId}?offset=${offset}`, chunk, { headers: { 'content-type': 'application/octet-stream' }, signal });
      await hashUpTo(Math.min(r.received, offset + chunk.size));
      offset = r.received;
      failures = 0;
      onProgress?.(offset / file.size);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'offset_mismatch') {
        offset = e.details?.received ?? (await api<{ received: number }>('GET', `/api/v1/uploads/${start.uploadId}`)).received;
        continue;
      }
      if (e instanceof ApiError && (e.isNetwork || e.status >= 500) && failures < 100) {
        failures++;
        onProgress?.(offset / file.size, 'waiting');
        await online(signal);
        await sleep(Math.min(30_000, 500 * 2 ** Math.min(failures, 6)));
        try {
          offset = (await api<{ received: number }>('GET', `/api/v1/uploads/${start.uploadId}`)).received;
        } catch {
          /* retry loop continues */
        }
        continue;
      }
      throw e;
    }
  }
  await hashUpTo(file.size);
  try {
    const sha256 = await hasher.digestHex().catch(() => hashFileInThread(file));
    const done = await api<{ attachment: AttachmentDto }>('POST', `/api/v1/uploads/${start.uploadId}/complete`, { sha256 });
    rememberSession(key, null);
    return done.attachment;
  } catch (e) {
    if (e instanceof ApiError && e.code === 'checksum_mismatch') rememberSession(key, null);
    throw e;
  }
}

export function isImageFile(f: File) {
  return /^image\/(png|jpe?g|gif|webp|avif|bmp|svg\+xml|tiff|heic|heif)$/.test(f.type) || /\.(png|jpe?g|gif|webp|avif|bmp|svg|tiff?|heic|heif)$/i.test(f.name);
}
