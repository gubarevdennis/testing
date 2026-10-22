import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { create } from 'zustand';
import { CollabProvider, type SyncStatus, type PresenceUser } from '@kb/shared';
import { pendingFor, putPending, removePending } from './idb';

export interface SyncInfo {
  status: SyncStatus;
  pending: number;
  oldestPendingMs: number | null;
  message?: string;
  lastSavedAt: number | null;
}

/** Global view of sync state per open page (status indicator, leave-page guard, sync centre). */
export const useSyncState = create<{ pages: Record<string, SyncInfo>; set(pageId: string, info: Partial<SyncInfo>): void; drop(pageId: string): void }>((set) => ({
  pages: {},
  set: (pageId, info) =>
    set((s) => {
      const prev = s.pages[pageId] ?? { status: 'connecting', pending: 0, oldestPendingMs: null, lastSavedAt: null };
      return { pages: { ...s.pages, [pageId]: { ...prev, ...info } } };
    }),
  drop: (pageId) =>
    set((s) => {
      const pages = { ...s.pages };
      delete pages[pageId];
      return { pages };
    }),
}));

export interface CollabSession {
  pageId: string;
  doc: Y.Doc;
  provider: CollabProvider;
  local: IndexeddbPersistence;
  /** Resolves once the local IndexedDB copy has been loaded (offline start). */
  localReady: Promise<void>;
  destroy(): void;
}

export interface CollabCallbacks {
  onAccess?(canEdit: boolean, level: string, reason?: string): void;
  onPresence?(users: PresenceUser[]): void;
  onFatal?(code: string, message: string): void;
  onSynced?(): void;
}

function wsUrl(pageId: string) {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/api/v1/collab/${pageId}`;
}

/**
 * Opens the collaborative document of a page: a local IndexedDB replica (works offline, survives reloads)
 * plus the server connection. Unacknowledged operations are persisted separately and resent on reconnect.
 */
export function openCollab(pageId: string, generation: string | null, cb: CollabCallbacks): CollabSession {
  const doc = new Y.Doc({ gc: true });
  // Local replica and pending queue are keyed by the document generation: a replica of an older CRDT history
  // (e.g. before an archive restore) must never be merged into the new one.
  const key = generation ? `${pageId}:${generation}` : pageId;
  const local = new IndexeddbPersistence('kb-doc-' + key, doc);
  const localReady = new Promise<void>((resolve) => {
    local.once('synced', () => resolve());
    setTimeout(resolve, 1500); // IndexedDB unavailable (private mode): continue online
  });
  const sync = useSyncState.getState();
  const provider = new CollabProvider({
    url: wsUrl(pageId),
    doc,
    pendingStore: {
      load: () => pendingFor(key),
      put: (opId, update, ts) => putPending(key, opId, update, ts),
      remove: (ids) => removePending(key, ids),
    },
    onStatus: (status, info) => sync.set(pageId, { status, pending: info.pending, oldestPendingMs: info.oldestPendingMs, message: info.message, ...(status === 'saved' ? { lastSavedAt: Date.now() } : {}) }),
    onAccess: cb.onAccess,
    onPresence: cb.onPresence,
    onFatal: cb.onFatal,
    onSynced: cb.onSynced,
  });
  const onUnload = (e: BeforeUnloadEvent) => {
    provider.flush();
    if (provider.pendingCount() > 0 && !navigator.onLine) return; // stored locally; no need to block
    if (provider.pendingCount() > 0) {
      e.preventDefault();
      e.returnValue = '';
    }
  };
  window.addEventListener('beforeunload', onUnload);
  return {
    pageId,
    doc,
    provider,
    local,
    localReady,
    destroy() {
      window.removeEventListener('beforeunload', onUnload);
      provider.flush();
      provider.destroy();
      local.destroy();
      doc.destroy();
      useSyncState.getState().drop(pageId);
    },
  };
}
