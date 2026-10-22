/**
 * Durable store of uploads that have not reached the server yet (R-MEDIA-006, R-MEDIA-008, UX13-03).
 * The file itself is kept in IndexedDB until the block in the document points to the stored attachment, so closing
 * the tab, a reload or a crash during an upload does not lose the image: the next time the page is opened in this
 * browser the upload resumes. If the upload finished while the editor was gone, the result is kept here and applied
 * on the next open. A separate database (not kb-client) so that its schema evolves independently.
 */
import type { AttachmentDto } from './uploads';

export interface StoredUpload {
  id: string;
  pageId: string;
  name: string;
  type: string;
  lastModified: number;
  size: number;
  blob?: Blob;
  /** Set when the upload completed but the document could not be updated yet. */
  attachment?: AttachmentDto;
  ts: number;
}

let dbp: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open('kb-uploads', 1);
    req.onupgradeneeded = () => {
      const s = req.result.createObjectStore('uploads', { keyPath: 'id' });
      s.createIndex('page', 'pageId');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbp = null;
      reject(req.error);
    };
  });
  return dbp;
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void): Promise<T | undefined> {
  const d = await db();
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = d.transaction('uploads', mode);
    const req = fn(tx.objectStore('uploads'));
    tx.oncomplete = () => resolve(req ? (req.result as T) : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('aborted'));
  });
}

/** Best effort: a failure (private mode, quota) only means the upload cannot survive a closed tab. */
export async function saveUpload(u: StoredUpload): Promise<boolean> {
  try {
    await run('readwrite', (s) => s.put(u));
    return true;
  } catch {
    return false;
  }
}

export async function loadUpload(id: string): Promise<StoredUpload | undefined> {
  try {
    return await run<StoredUpload>('readonly', (s) => s.get(id));
  } catch {
    return undefined;
  }
}

export async function patchUpload(id: string, patch: Partial<StoredUpload>): Promise<void> {
  const cur = await loadUpload(id);
  if (cur) await saveUpload({ ...cur, ...patch });
}

export async function dropUpload(id: string): Promise<void> {
  try {
    await run('readwrite', (s) => s.delete(id));
  } catch {
    /* nothing stored */
  }
}

export async function uploadsForPage(pageId: string): Promise<StoredUpload[]> {
  try {
    return (await run<StoredUpload[]>('readonly', (s) => s.index('page').getAll(pageId))) ?? [];
  } catch {
    return [];
  }
}
