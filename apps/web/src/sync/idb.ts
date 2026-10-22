/** Minimal promise wrapper over IndexedDB for durable client-side state (pending operations, drafts). */
let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open('kb-client', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('pending')) {
        const s = db.createObjectStore('pending', { keyPath: ['pageId', 'opId'] });
        s.createIndex('page', 'pageId');
      }
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

function done(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('aborted'));
  });
}

export async function pendingFor(pageId: string): Promise<Array<{ opId: string; update: Uint8Array; ts: number }>> {
  const db = await openDb();
  const tx = db.transaction('pending', 'readonly');
  const req = tx.objectStore('pending').index('page').getAll(pageId);
  const rows = await new Promise<any[]>((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
  return rows.map((r) => ({ opId: r.opId, update: new Uint8Array(r.update), ts: r.ts })).sort((a, b) => a.ts - b.ts);
}

export async function putPending(pageId: string, opId: string, update: Uint8Array, ts: number) {
  const db = await openDb();
  const tx = db.transaction('pending', 'readwrite');
  tx.objectStore('pending').put({ pageId, opId, update, ts });
  await done(tx);
}

export async function removePending(pageId: string, opIds: string[]) {
  if (!opIds.length) return;
  const db = await openDb();
  const tx = db.transaction('pending', 'readwrite');
  for (const id of opIds) tx.objectStore('pending').delete([pageId, id]);
  await done(tx);
}

/** Pages that still hold unacknowledged local changes (shown on start and in the sync centre). */
export async function pagesWithPending(): Promise<Map<string, { count: number; oldest: number }>> {
  const db = await openDb();
  const tx = db.transaction('pending', 'readonly');
  const req = tx.objectStore('pending').getAll();
  const rows = await new Promise<any[]>((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
  const m = new Map<string, { count: number; oldest: number }>();
  for (const r of rows) {
    const e = m.get(r.pageId) ?? { count: 0, oldest: r.ts };
    e.count++;
    e.oldest = Math.min(e.oldest, r.ts);
    m.set(r.pageId, e);
  }
  return m;
}

export async function metaGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  const tx = db.transaction('meta', 'readonly');
  const req = tx.objectStore('meta').get(key);
  return new Promise((res, rej) => {
    req.onsuccess = () => res(req.result as T);
    req.onerror = () => rej(req.error);
  });
}

export async function metaSet(key: string, value: unknown) {
  const db = await openDb();
  const tx = db.transaction('meta', 'readwrite');
  tx.objectStore('meta').put(value, key);
  await done(tx);
}
