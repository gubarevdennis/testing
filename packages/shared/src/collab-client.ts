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
import { CONTENT_SCHEMA_VERSION } from './editor/version.js';
import * as awarenessProtocol from 'y-protocols/awareness';
import { MSG, CLOSE, encodeClient, decodeServer, type PresenceUser } from './collab-protocol.js';
import { HttpTunnelSocket, type HttpTunnelOptions } from './collab-http.js';

export type CollabTransport = 'ws' | 'http';

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
  onStatus?: (s: SyncStatus, info: { pending: number; oldestPendingMs: number | null; message?: string; transport: CollabTransport }) => void;
  onAccess?: (canEdit: boolean, level: string, reason?: string) => void;
  onPresence?: (users: PresenceUser[]) => void;
  /** Fatal problems: page deleted, change rejected, access revoked. Local data must be offered for export. */
  onFatal?: (code: string, message: string) => void;
  onSynced?: () => void;
  /** Local pending store failed (quota exceeded or unavailable). */
  onStorageError?: (message: string, quota: boolean) => void;
  newOpId?: () => string;
  /**
   * HTTP fallback channel used when WebSocket cannot be established (blocked by a proxy) — same frames and
   * durability contract over HTTPS long polling. Omit to disable.
   */
  httpFallback?: HttpTunnelOptions;
  /** Consecutive WebSocket failures (never opened or never synced) before switching to the HTTP channel. */
  fallbackAfterFailures?: number;
  /** An opened channel that does not deliver SYNC within this time is treated as broken; so is a WebSocket whose
   * handshake does not complete within this time (a path that accepts TCP but never answers). */
  syncTimeoutMs?: number;
  /**
   * Liveness of an idle WebSocket (QA26-20: Wi-Fi→LTE switch, NAT/proxy timeouts, sleeping laptop): a PING goes out
   * every `pingIntervalMs`; if nothing at all arrives from the server within `pongTimeoutMs` after it, the connection
   * is considered dead and replaced at once — without this an idle replica on a silently dead link would keep showing
   * "connected" and miss everyone else's edits until the OS gives up on TCP (minutes).
   */
  pingIntervalMs?: number;
  pongTimeoutMs?: number;
  /**
   * Backpressure: at most this many operations / bytes are in flight (sent, not yet acknowledged), and nothing
   * more is written while the socket's own send buffer holds more than `maxBufferedBytes`.
   */
  maxInflightOps?: number;
  maxInflightBytes?: number;
  maxBufferedBytes?: number;
  /**
   * Content schema version this client's editor writes (CONTENT_SCHEMA_VERSION of its build). The server refuses
   * edits of an outdated client to a migrated document instead of merging old and new formats (R-COLLAB-037).
   * Default: CONTENT_SCHEMA_VERSION of the shared package this client is built with.
   */
  schemaVersion?: number;
  /** Delay before re-sending operations the server could not take yet (server older than the client). */
  schemaRetryMs?: number;
}

interface PendingOp {
  update: Uint8Array;
  ts: number;
  sent: boolean;
  covers?: string[];
  /** Carried by a later operation (the catch-up diff after reconnect): not sent on its own, not counted in flight. */
  coveredBy?: string;
  /** true once written to the local pending store (or when there is no store) */
  persisted?: boolean;
  write?: Promise<void>;
  /** local write in progress: the operation is not sent before it is in the local journal */
  writing?: boolean;
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
  private pending = new Map<string, PendingOp>();
  /** Last local-storage failure (quota, private mode): status must not claim "saved on this device". */
  private persistError: string | null = null;
  private batch: Uint8Array[] = [];
  private batchTimer: any = null;
  private retry = 0;
  private reconnectTimer: any = null;
  private ackTimer: any = null;
  /** Abandons the current connection immediately (no closing handshake over a dead link) and reconnects. */
  private dropCurrent: (() => void) | null = null;
  private destroyed = false;
  private fatal = false;
  private message: string | undefined;
  private ready: Promise<void>;
  /** The server answered persist_failed and has not committed anything since: visible error, export offered. */
  private serverFailing: string | null = null;
  private wsFailures = 0;
  private fallbackSince = 0;
  private syncTimer: any = null;
  private drainTimer: any = null;
  /** Transport of the current / last connection. */
  transport: CollabTransport = 'ws';

  constructor(opts: CollabProviderOptions) {
    this.opts = { batchMs: 80, ackTimeoutMs: 15_000, backoff: { minMs: 500, maxMs: 30_000 }, fallbackAfterFailures: 2, syncTimeoutMs: 10_000, pingIntervalMs: 25_000, pongTimeoutMs: 10_000, maxInflightOps: 32, maxInflightBytes: 4 * 1024 * 1024, maxBufferedBytes: 1024 * 1024, ...opts };
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
        this.pending.set(it.opId, { update: it.update, ts: it.ts, sent: false, persisted: true });
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

  private allPersisted() {
    if (this.batch.length) return false;
    for (const p of this.pending.values()) if (!p.persisted && !p.covers) return false;
    return true;
  }

  /** Writes an operation to the local pending store; the status reflects whether that succeeded. */
  private persist(opId: string, op: PendingOp) {
    const store = this.opts.pendingStore;
    if (!store) {
      op.persisted = true;
      return;
    }
    op.writing = true;
    op.write = store
      .put(opId, op.update, op.ts)
      .then(() => {
        op.persisted = true;
        this.persistError = null;
      })
      .catch((e: any) => {
        const quota = e?.name === 'QuotaExceededError' || /quota/i.test(String(e?.message));
        this.persistError = quota
          ? 'На устройстве закончилось место: несохранённые изменения могут быть потеряны при закрытии. Восстановите связь или освободите место.'
          : 'Не удалось сохранить изменения на устройстве (хранилище браузера недоступно). Не закрывайте страницу до восстановления связи.';
        this.opts.onStorageError?.(this.persistError, quota);
      })
      .finally(() => {
        // The operation goes to the server only after it is in the durable local journal (or the write failed:
        // then sending is the only way to keep it).
        op.writing = false;
        this.sendPending();
        this.setStatus();
      });
  }

  /** Removes acknowledged operations from the local store only after their own write has finished. */
  private forget(ids: string[], writes: Array<Promise<void> | undefined>) {
    const store = this.opts.pendingStore;
    if (!store || !ids.length) return;
    void Promise.allSettled(writes.filter(Boolean) as Promise<void>[])
      .then(() => store.remove(ids))
      .catch(() => undefined);
  }

  private setStatus(message?: string) {
    if (message !== undefined) this.message = message;
    let s: SyncStatus;
    if (this.fatal) s = 'error';
    else if (!this.ws || this.ws.readyState !== 1 || !this.synced) {
      if (!this.pendingCount()) s = 'connecting';
      else if (this.persistError && !this.allPersisted()) {
        // Offline and the local copy could not be written: never claim it is saved on this device.
        s = 'error';
        message = message ?? this.persistError;
        this.message = message;
      } else s = this.allPersisted() ? 'local' : 'syncing';
    }
    else if (!this.canEdit) s = this.pendingCount() ? 'error' : 'readonly';
    else if (this.serverFailing && this.pendingCount()) {
      // The server cannot commit (storage failure): retrying, but the user must see it and may export a copy.
      s = 'error';
      message = message ?? this.serverFailing;
      this.message = message;
    } else s = this.pendingCount() ? 'syncing' : 'saved';
    if (s !== 'error' && !this.fatal && message === undefined) this.message = undefined;
    this.status = s;
    this.opts.onStatus?.(s, { pending: this.pendingCount(), oldestPendingMs: this.oldestPendingMs(), message: this.message, transport: this.transport });
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
    const op: PendingOp = { update, ts, sent: false };
    this.pending.set(opId, op);
    this.persist(opId, op);
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

  /** Operations sent and not yet acknowledged (covered ones travel inside their covering operation). */
  inflight() {
    let ops = 0;
    let bytes = 0;
    for (const p of this.pending.values())
      if (p.sent && !p.coveredBy) {
        ops++;
        bytes += p.update.byteLength;
      }
    return { ops, bytes };
  }

  /**
   * Sends unsent operations in order, with backpressure: a slow link or a slow server never gets an unbounded
   * burst — at most `maxInflightOps`/`maxInflightBytes` await acknowledgement and the socket buffer is drained first.
   * The rest stays queued (and in the local journal) and goes out as acknowledgements arrive.
   */
  private sendPending() {
    if (!this.ws || this.ws.readyState !== 1 || !this.synced || !this.canEdit || this.fatal) return;
    let { ops, bytes } = this.inflight();
    let sentAny = false;
    for (const [opId, p] of this.pending) {
      if (p.sent || p.writing) continue;
      const tooMany = ops >= this.opts.maxInflightOps! || (ops > 0 && bytes + p.update.byteLength > this.opts.maxInflightBytes!);
      const buffered = (this.ws.bufferedAmount ?? 0) > this.opts.maxBufferedBytes!;
      if (tooMany || buffered) {
        // resume when acknowledgements arrive; if only the socket buffer is full, poll it shortly
        if (buffered && !this.drainTimer) this.drainTimer = setTimeout(() => ((this.drainTimer = null), this.sendPending()), 50);
        break;
      }
      p.sent = true;
      ops++;
      bytes += p.update.byteLength;
      sentAny = true;
      this.ws.send(encodeClient({ type: MSG.UPDATE, opId, update: p.update }));
    }
    // New sends do not restart the clock: it measures the oldest unacknowledged operation. (Restarting it on every
    // send meant that a user typing more often than ackTimeoutMs on a dead link was never reconnected.)
    if (sentAny && !this.ackTimer) this.armAckTimer();
  }

  /** (Re)starts the acknowledgement deadline; called when progress is made (ACK) or the first operation goes out. */
  private armAckTimer() {
    if (this.ackTimer) clearTimeout(this.ackTimer);
    this.ackTimer = null;
    if (![...this.pending.values()].some((p) => p.sent)) return;
    this.ackTimer = setTimeout(() => {
      this.ackTimer = null;
      // No acknowledgement in time: treat the connection as broken; everything will be re-sent after reconnect.
      this.dropCurrent?.();
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
    const fb = this.opts.httpFallback;
    // WebSocket blocked (proxy) or broken: use the HTTP channel; every 5 minutes try WebSocket again.
    if (fb && this.transport === 'http' && Date.now() - this.fallbackSince > 5 * 60_000) this.wsFailures = 0;
    this.transport = fb && this.wsFailures >= this.opts.fallbackAfterFailures! ? 'http' : 'ws';
    if (this.transport === 'http' && !this.fallbackSince) this.fallbackSince = Date.now();
    if (this.transport === 'ws') this.fallbackSince = 0;
    let ws: any;
    if (this.transport === 'http') ws = new HttpTunnelSocket(this.opts.url, fb);
    else {
      const WS = this.opts.WebSocketImpl ?? (globalThis as any).WebSocket;
      ws = this.opts.wsOptions ? new WS(this.opts.url, this.opts.wsOptions) : new WS(this.opts.url);
    }
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    this.synced = false;
    let gotSync = false;
    let lastRx = Date.now();
    let pingTimer: any = null;
    let pongTimer: any = null;
    // A broken connection is detached at once: a closing handshake over a dead link can take tens of seconds, and
    // until onclose runs nothing would be re-sent. The late close event of this socket is ignored (this.ws !== ws).
    const dead = () => {
      if (this.ws !== ws) return;
      try {
        if (typeof ws.terminate === 'function') ws.terminate();
        else ws.close();
      } catch {
        /* already closed */
      }
      ws.onclose?.({ code: 1006, reason: 'timeout' });
    };
    this.dropCurrent = dead;
    // TCP accepted but the handshake never completes (stalled proxy, half-open path after a network switch).
    const openTimer = setTimeout(() => ws.readyState === 0 && dead(), this.opts.syncTimeoutMs);
    const stopTimers = () => {
      clearInterval(pingTimer);
      clearTimeout(pongTimer);
      clearTimeout(openTimer);
    };
    this.setStatus();
    ws.onopen = () => {
      clearTimeout(openTimer);
      // a client always declares the content schema it writes (default: the schema of this build)
      ws.send(encodeClient({ type: MSG.HELLO, stateVector: Y.encodeStateVector(this.doc), schemaVersion: this.opts.schemaVersion ?? CONTENT_SCHEMA_VERSION }));
      pingTimer = setInterval(() => {
        if (ws.readyState !== 1) return;
        const sentAt = Date.now();
        ws.send(encodeClient({ type: MSG.PING }));
        // The HTTP channel has its own request timeouts; liveness by PONG applies to WebSocket.
        if (this.transport !== 'ws') return;
        clearTimeout(pongTimer);
        pongTimer = setTimeout(() => lastRx < sentAt && dead(), this.opts.pongTimeoutMs);
      }, this.opts.pingIntervalMs);
      // An intermediary may accept the upgrade and then swallow frames: no SYNC in time = broken channel.
      if (this.syncTimer) clearTimeout(this.syncTimer);
      this.syncTimer = setTimeout(() => this.ws === ws && !this.synced && dead(), this.opts.syncTimeoutMs);
    };
    const prevOnMessage = (buf: Uint8Array) => {
      lastRx = Date.now();
      if (!gotSync && this.ws === ws) {
        gotSync = true;
        this.retry = 0;
        if (this.transport === 'ws') this.wsFailures = 0;
      }
      this.onMessage(buf);
    };
    ws.onmessage = (ev: { data: ArrayBuffer | Uint8Array }) => prevOnMessage(new Uint8Array(ev.data as ArrayBuffer));
    ws.onclose = (ev: { code: number; reason?: string }) => {
      stopTimers();
      // only the current connection owns the shared timers (a late close of an abandoned socket must not clear
      // the timers of its replacement)
      if (this.ws !== ws) return;
      if (this.ackTimer) clearTimeout(this.ackTimer);
      this.ackTimer = null;
      if (this.syncTimer) clearTimeout(this.syncTimer);
      this.dropCurrent = null;
      this.ws = null;
      this.synced = false;
      // a WebSocket that never got as far as SYNC counts towards switching to the HTTP channel
      if (!gotSync && this.transport === 'ws' && ev.code !== CLOSE.ACCESS_REVOKED && ev.code !== CLOSE.NOT_FOUND && ev.code !== CLOSE.SESSION_EXPIRED) this.wsFailures++;
      for (const p of this.pending.values()) {
        p.sent = false; // will be re-sent (idempotent by opId)
        p.coveredBy = undefined;
      }
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
    // switching to the fallback channel happens without waiting out the backoff
    if (this.opts.httpFallback && this.transport === 'ws' && this.wsFailures === this.opts.fallbackAfterFailures && !minDelay) {
      this.reconnectTimer = setTimeout(() => void this.connect(), 0);
      return;
    }
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
          let coverId: string | undefined;
          if (hasContent(diff)) {
            const opId = this.newOpId();
            coverId = opId;
            const ts = Math.min(Date.now(), ...[...this.pending.values()].map((p) => p.ts));
            const op: PendingOp = { update: diff, ts, sent: false, covers: covered };
            this.pending.set(opId, op);
            this.persist(opId, op);
          } else if (covered.length) {
            // Server already has everything (e.g. ack lost before a crash).
            const writes = covered.map((id) => this.pending.get(id)?.write);
            for (const id of covered) this.pending.delete(id);
            this.forget(covered, writes);
          }
          // Covered operations are not re-sent individually: the diff carries them.
          for (const id of covered) {
            const p = this.pending.get(id);
            if (p) {
              p.sent = true;
              p.coveredBy = coverId;
            }
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
        const writes = done.map((id) => this.pending.get(id)?.write);
        for (const id of done) this.pending.delete(id);
        this.forget(done, writes);
        this.serverSeq = Math.max(this.serverSeq, m.seq);
        this.serverFailing = null;
        this.armAckTimer();
        this.sendPending(); // backpressure: room for the next operations
        this.setStatus();
        return;
      }
      case MSG.NACK: {
        const p = this.pending.get(m.opId);
        if (m.code === 'persist_failed') {
          if (p) p.sent = false;
          setTimeout(() => this.sendPending(), 2000);
          this.serverFailing = 'Сервер не может сохранить изменения (сбой хранилища). Они остаются на этом устройстве и отправляются повторно — при необходимости скачайте локальную копию.';
          this.setStatus(this.serverFailing);
          return;
        }
        if (m.code === 'schema_newer') {
          // Rolling update: this client is newer than the server. Nothing is lost — the operations stay pending and
          // are re-sent until an updated server accepts them.
          if (p) p.sent = false;
          setTimeout(() => this.sendPending(), this.opts.schemaRetryMs ?? 15_000);
          this.serverFailing = m.message;
          this.setStatus(m.message);
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
        if (['access_revoked', 'not_found', 'deleted', 'published_only', 'schema_outdated'].includes(m.code)) {
          this.fatal = true;
          this.setStatus(m.message);
          this.opts.onFatal?.(m.code, m.message);
        }
        return;
    }
  }

  /**
   * "Accept the server version" after a non-mergeable conflict (R-COLLAB-036): forgets every unacknowledged local
   * operation, in memory and in the local pending store, so it is never re-sent. The caller then reopens the document
   * from a fresh replica. Only called on an explicit user choice, after the local copy was offered.
   */
  async discardUnsynced(): Promise<number> {
    if (this.batchTimer) clearTimeout(this.batchTimer);
    this.batchTimer = null;
    const ids = [...this.pending.keys()];
    const writes = [...this.pending.values()].map((p) => p.write);
    const n = ids.length + (this.batch.length ? 1 : 0);
    this.pending.clear();
    this.batch = [];
    const store = this.opts.pendingStore;
    if (store && ids.length) {
      await Promise.allSettled(writes.filter(Boolean) as Promise<void>[]);
      await store.remove(ids);
    }
    this.setStatus();
    return n;
  }

  /** Local unsynced content for "save a local copy" when the server refuses changes. */
  unsyncedUpdates(): Uint8Array[] {
    return [...this.pending.values()].map((p) => p.update).concat(this.batch);
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ackTimer) clearTimeout(this.ackTimer);
    this.ackTimer = null;
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.dropCurrent = null;
    const ws = this.ws;
    this.ws = null;
    this.synced = false;
    ws?.close();
    this.setStatus();
  }

  destroy() {
    this.flush();
    this.destroyed = true;
    if (this.drainTimer) clearTimeout(this.drainTimer);
    if (this.syncTimer) clearTimeout(this.syncTimer);
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
