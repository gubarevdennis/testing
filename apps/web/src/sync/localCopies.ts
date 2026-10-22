import { openDb, pendingFor } from './idb';

/**
 * Lifetime policy for local (IndexedDB) copies of documents (R-ACL-025):
 *  * a cached copy is used offline only while it is younger than LOCAL_COPY_MAX_AGE_MS;
 *  * when the server says the page is no longer available (access revoked or deleted: HTTP 404), the cached
 *    metadata and the document replica are removed from this device — unless unsent edits are still queued
 *    (those are never silently destroyed; they stay in the queue and the replica is removed once it is empty).
 */
export const LOCAL_COPY_MAX_AGE_MS = 30 * 86400_000;

export interface CachedPage {
  cachedAt?: number;
  page: { docGeneration?: string | null };
}

export function isFresh(c: CachedPage | undefined, now = Date.now()): boolean {
  return !!c?.cachedAt && now - c.cachedAt < LOCAL_COPY_MAX_AGE_MS;
}

async function metaDelete(key: string) {
  const db = await openDb();
  const tx = db.transaction('meta', 'readwrite');
  tx.objectStore('meta').delete(key);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Removes the local copy of a page for one user (metadata + Yjs replica without pending changes). */
export async function purgeLocalCopy(userId: string, pageId: string, cached: CachedPage | undefined): Promise<boolean> {
  await metaDelete(`page:${userId}:${pageId}`);
  const gen = cached?.page?.docGeneration ?? null;
  const key = `${userId}:${pageId}${gen ? ':' + gen : ''}`;
  if ((await pendingFor(key).catch(() => [])).length) return false;
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('kb-doc-' + key);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
  return true;
}
