/**
 * Client side of the collaboration protocol (browser and Node).
 *
 * Status semantics (never optimistic about durability):
 *  - 'saved'      every local change has been acknowledged by the server after a durable commit
 *  - 'syncing'    connected, some changes are in flight
 *  - 'local'      changes are stored on this device only (offline / reconnecting)
 *  - 'connecting' first connection in progress, no local changes
 *  - 'readonly'   connected without edit rights
 *  - 'error'      needs user attention (rejected change, page deleted, access revoked)
 */
import * as Y from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness';
import { MSG, CLOSE, encodeClient, decodeServer, type PresenceUser } from './collab-protocol.js';

export type SyncStatus = 'connecting' | 'syncing' | 'saved' | 'local' | 'readonly' | 'error';

export interface PendingStore {
  /** Loads unacknowledged updates persisted before a reload/crash. */
  load(): Promise<Array<{ opId: string; update: Uint8Array; ts: number }>>;
  put(opId: string, update: Uint8Array, ts: number): Promise<void>;
  remove(opIds: string[]): Promise<void>;
}

export interface CollabProviderOptions {
  url: string;
  doc: Y.Doc;
  awareness?: awarenessProtocol.Awareness;
  /** WebSocket constructor (browser global by default; `ws` package in Node). */
  WebSocketImpl?: any;
  /** Extra constructor args (Node: { headers: { cookie } }). */
  wsOptions?: unknown;
  pendingStore?: PendingStore;
  batchMs?: number;
  ackTimeoutMs?: number;
  backoff?: { minMs: number; maxMs: number };
  onStatus?: (s: SyncStatus, info: { pending: number; oldestPendingMs: number | null; message?: string }) => void;
  onAccess?: (canEdit: boolean, level: string, reason?: string) => void;
  onPresence?: (users: PresenceUser[]) => void;
  /** Fatal problems: page deleted, change rejected, access revoked. Local data must be offered for export. */
  onFatal?: (code: string, message: string) => void;
  onSynced?: () => void;
  newOpId?: () => string;
}

export class CollabProvider {
  readonly doc: Y.Doc;
  readonly awareness: awarenessProtocol.Awareness;
  status: SyncStatus = 'connecting';
  canEdit = false;
  synced = false;
  serverSeq = 0;
  private ws: any = null;
  private opts: CollabProviderOptions;
  private pending = new Map<string, { update: Uint8Array; ts: number; sent: boolean; covers?: string[] }>();
  private batch: Uint8Array[] = [];
  private batchTimer: any = null;
  private retry = 0;
  private reconnectTimer: any = null;
  private ackTimer: any = null;
  private pingTimer: any = null;
  private destroyed = false;
  private fatal = false;
  private message: string | undefined;
  private ready: Promise<void>;

  constructor(opts: CollabProviderOptions) {
    this.opts = { batchMs: 80, ackTimeoutMs: 15_000, backoff: { minMs: 500, maxMs: 30_000 }, ...opts };
    this.doc = opts.doc;
    this.awareness = opts.awareness ?? new awarenessProtocol.Awareness(this.doc);
    this.doc.on('update', this.onDocUpdate);
    this.awareness.on('update', this.onAwarenessUpdate);
    this.ready = this.restorePending();
  }

  private newOpId() {
    return this.opts.newOpId?.() ?? (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36));
  }

  /** Re-applies updates that were not acknowledged before the page was closed. */
  private async restorePending() {
    if (!this.opts.pendingStore) return;
    try {
      const items = await this.opts.pendingStore.load();
      for (const it of items) {
        this.pending.set(it.opId, { update: it.update, ts: it.ts, sent: false });
        Y.applyUpdate(this.doc, it.update, this);
      }
      if (items.length) this.setStatus();
    } catch {
      /* storage unavailable: in-memory only */
    }
  }

  pendingCount() {
    return this.pending.size + (this.batch.length ? 1 : 0);
  }

  oldestPendingMs(): number | null {
    let oldest: number | null = null;
    for (const p of this.pending.values()) oldest = oldest === null ? p.ts : Math.min(oldest, p.ts);
    return oldest === null ? null : Date.now() - oldest;
  }

  private setStatus(message?: string) {
    if (message !== undefined) this.message = message;
    let s: SyncStatus;
    if (this.fatal) s = 'error';
    else if (!this.ws || this.ws.readyState !== 1 || !this.synced) s = this.pendingCount() ? 'local' : 'connecting';
    else if (!this.canEdit) s = this.pendingCount() ? 'error' : 'readonly';
    else s = this.pendingCount() ? 'syncing' : 'saved';
    if (s !== 'error' && !this.fatal && message === undefined) this.message = undefined;
    this.status = s;
    this.opts.onStatus?.(s, { pending: this.pendingCount(), oldestPendingMs: this.oldestPendingMs(), message: this.message });
  }

  private onDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === this) return; // remote or restored
    this.batch.push(update);
    if (!this.batchTimer) this.batchTimer = setTimeout(() => this.flushBatch(), this.opts.batchMs);
    this.setStatus();
  };

  /** Merges batched local updates into one operation, persists it locally, then sends it. */
  private flushBatch() {
    this.batchTimer = null;
    if (!this.batch.length) return;
    const update = this.batch.length === 1 ? this.batch[0] : Y.mergeUpdates(this.batch);
    this.batch = [];
    const opId = this.newOpId();
    const ts = Date.now();
    this.pending.set(opId, { update, ts, sent: false });
    void this.opts.pendingStore?.put(opId, update, ts).catch(() => undefined);
    this.sendPending();
    this.setStatus();
  }

  /** Forces batched changes out immediately (e.g. before unload). */
  flush() {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.flushBatch();
    }
  }

  private sendPending() {
    if (!this.ws || this.ws.readyState !== 1 || !this.synced || !this.canEdit || this.fatal) return;
    for (const [opId, p] of this.pending) {
      if (p.sent) continue;
      p.sent = true;
      this.ws.send(encodeClient({ type: MSG.UPDATE, opId, update: p.update }));
    }
    this.armAckTimer();
  }

  private armAckTimer() {
    if (this.ackTimer) clearTimeout(this.ackTimer);
    if (![...this.pending.values()].some((p) => p.sent)) return;
    this.ackTimer = setTimeout(() => {
      // No acknowledgement in time: treat the connection as broken; everything will be re-sent after reconnect.
      this.ws?.close();
    }, this.opts.ackTimeoutMs);
  }

  private onAwarenessUpdate = ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
    if (origin === this) return;
    const changed = added.concat(updated, removed);
    if (!changed.includes(this.doc.clientID)) return;
    if (this.ws?.readyState === 1) this.ws.send(encodeClient({ type: MSG.AWARENESS, update: awarenessProtocol.encodeAwarenessUpdate(this.awareness, [this.doc.clientID]) }));
  };

  async connect() {
    await this.ready;
    if (this.destroyed || this.fatal) return;
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) return;
    const WS = this.opts.WebSocketImpl ?? (globalThis as any).WebSocket;
    const ws = this.opts.wsOptions ? new WS(this.opts.url, this.opts.wsOptions) : new WS(this.opts.url);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    this.synced = false;
    this.setStatus();
    ws.onopen = () => {
      this.retry = 0;
      ws.send(encodeClient({ type: MSG.HELLO, stateVector: Y.encodeStateVector(this.doc) }));
      this.pingTimer = setInterval(() => ws.readyState === 1 && ws.send(encodeClient({ type: MSG.PING })), 25_000);
    };
    ws.onmessage = (ev: { data: ArrayBuffer | Buffer }) => this.onMessage(new Uint8Array(ev.data as ArrayBuffer));
    ws.onclose = (ev: { code: number; reason?: string }) => {
      clearInterval(this.pingTimer);
      if (this.ackTimer) clearTimeout(this.ackTimer);
      if (this.ws !== ws) return;
      this.ws = null;
      this.synced = false;
      for (const p of this.pending.values()) p.sent = false; // will be re-sent (idempotent by opId)
      awarenessProtocol.removeAwarenessStates(this.awareness, [...this.awareness.getStates().keys()].filter((id) => id !== this.doc.clientID), this);
      if (ev.code === CLOSE.ACCESS_REVOKED || ev.code === CLOSE.NOT_FOUND) {
        this.fatal = true;
        this.setStatus(this.message ?? 'Доступ к странице отозван');
        return;
      }
      this.setStatus();
      this.scheduleReconnect(ev.code === CLOSE.SESSION_EXPIRED ? 30_000 : 0);
    };
    ws.onerror = () => undefined;
  }

  private scheduleReconnect(minDelay = 0) {
    if (this.destroyed || this.fatal) return;
    const { minMs, maxMs } = this.opts.backoff!;
    const base = Math.min(maxMs, minMs * 2 ** this.retry++);
    const delay = Math.max(minDelay, base / 2 + Math.random() * (base / 2)); // exponential backoff with jitter
    this.reconnectTimer = setTimeout(() => void this.connect(), delay);
  }

  /** Immediately retries the connection (e.g. browser reports "online"). */
  reconnectNow() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.retry = 0;
    void this.connect();
  }

  private onMessage(buf: Uint8Array) {
    let m;
    try {
      m = decodeServer(buf);
    } catch {
      return;
    }
    switch (m.type) {
      case MSG.SYNC: {
        Y.applyUpdate(this.doc, m.update, this);
        this.serverSeq = m.seq;
        this.canEdit = m.canEdit;
        this.synced = true;
        this.opts.onAccess?.(m.canEdit, m.canEdit ? 'edit' : 'view');
        // Whatever the server lacks (offline edits, unacknowledged ops) goes as one operation covering all pending.
        if (this.canEdit) {
          this.flush();
          const diff = Y.encodeStateAsUpdate(this.doc, m.stateVector);
          const covered = [...this.pending.keys()];
          if (hasContent(diff)) {
            const opId = this.newOpId();
            const ts = Math.min(Date.now(), ...[...this.pending.values()].map((p) => p.ts));
            this.pending.set(opId, { update: diff, ts, sent: false, covers: covered });
            void this.opts.pendingStore?.put(opId, diff, ts).catch(() => undefined);
          } else if (covered.length) {
            // Server already has everything (e.g. ack lost before a crash).
            for (const id of covered) this.pending.delete(id);
            void this.opts.pendingStore?.remove(covered).catch(() => undefined);
          }
          // Covered operations are not re-sent individually: the diff carries them.
          for (const id of covered) {
            const p = this.pending.get(id);
            if (p) p.sent = true;
          }
          this.sendPending();
        }
        if (this.awareness.getLocalState()) this.ws.send(encodeClient({ type: MSG.AWARENESS, update: awarenessProtocol.encodeAwarenessUpdate(this.awareness, [this.doc.clientID]) }));
        this.setStatus();
        this.opts.onSynced?.();
        return;
      }
      case MSG.ACK: {
        const p = this.pending.get(m.opId);
        const done = [m.opId, ...(p?.covers ?? [])];
        for (const id of done) this.pending.delete(id);
        void this.opts.pendingStore?.remove(done).catch(() => undefined);
        this.serverSeq = Math.max(this.serverSeq, m.seq);
        this.armAckTimer();
        this.setStatus();
        return;
      }
      case MSG.NACK: {
        const p = this.pending.get(m.opId);
        if (m.code === 'persist_failed') {
          if (p) p.sent = false;
          setTimeout(() => this.sendPending(), 2000);
          this.setStatus('Сервер временно не может сохранить изменения — повторяем');
          return;
        }
        if (m.code === 'forbidden') {
          this.canEdit = false;
          this.setStatus('Нет права на редактирование: изменения сохранены только на этом устройстве');
          this.opts.onAccess?.(false, 'view', 'permission');
          return;
        }
        this.fatal = true;
        this.setStatus(m.message);
        this.opts.onFatal?.(m.code, m.message);
        return;
      }
      case MSG.REMOTE:
        Y.applyUpdate(this.doc, m.update, this);
        this.serverSeq = Math.max(this.serverSeq, m.seq);
        return;
      case MSG.AWARENESS:
        awarenessProtocol.applyAwarenessUpdate(this.awareness, m.update, this);
        return;
      case MSG.PRESENCE:
        this.opts.onPresence?.(m.users);
        return;
      case MSG.ACCESS:
        this.canEdit = m.canEdit;
        this.opts.onAccess?.(m.canEdit, m.level, m.reason);
        if (m.canEdit) this.sendPending();
        this.setStatus(m.canEdit ? undefined : 'Права на редактирование отозваны — несохранённые изменения можно экспортировать');
        return;
      case MSG.ERROR:
        this.message = m.message;
        if (['access_revoked', 'not_found', 'deleted', 'published_only'].includes(m.code)) {
          this.fatal = true;
          this.setStatus(m.message);
          this.opts.onFatal?.(m.code, m.message);
        }
        return;
    }
  }

  /** Local unsynced content for "save a local copy" when the server refuses changes. */
  unsyncedUpdates(): Uint8Array[] {
    return [...this.pending.values()].map((p) => p.update).concat(this.batch);
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const ws = this.ws;
    this.ws = null;
    this.synced = false;
    ws?.close();
    this.setStatus();
  }

  destroy() {
    this.flush();
    this.destroyed = true;
    this.disconnect();
    this.doc.off('update', this.onDocUpdate);
    this.awareness.off('update', this.onAwarenessUpdate);
    if (this.batchTimer) clearTimeout(this.batchTimer);
  }
}

/** An encoded update with no structs and no deletions is 2 bytes ([0,0]). */
function hasContent(update: Uint8Array) {
  return update.byteLength > 2;
}
