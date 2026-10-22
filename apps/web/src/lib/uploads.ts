import { ApiError, api, upload } from '../api/client';

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
  contentUrl: string;
  downloadUrl: string;
}

const RESUMABLE_FROM = 8 * 1024 * 1024;

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
        return r.attachments[0];
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
  const start = await api<{ uploadId: string; received: number; chunkSize: number }>('POST', '/api/v1/uploads', { pageId, filename: file.name || 'file', size: file.size, mime: file.type || undefined, replaceId });
  let offset = start.received;
  let failures = 0;
  while (offset < file.size) {
    if (signal?.aborted) {
      await api('DELETE', `/api/v1/uploads/${start.uploadId}`).catch(() => undefined);
      throw new DOMException('aborted', 'AbortError');
    }
    const chunk = file.slice(offset, offset + start.chunkSize);
    try {
      const r = await api<{ received: number }>('PUT', `/api/v1/uploads/${start.uploadId}?offset=${offset}`, chunk, { headers: { 'content-type': 'application/octet-stream' }, signal });
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
  const done = await api<{ attachment: AttachmentDto }>('POST', `/api/v1/uploads/${start.uploadId}/complete`);
  return done.attachment;
}

export function isImageFile(f: File) {
  return /^image\/(png|jpe?g|gif|webp|avif|bmp|svg\+xml|tiff|heic|heif)$/.test(f.type) || /\.(png|jpe?g|gif|webp|avif|bmp|svg|tiff?|heic|heif)$/i.test(f.name);
}
