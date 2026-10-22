import * as Y from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness';
import type { WebSocket } from 'ws';
import type { Logger } from 'pino';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { MSG, CLOSE, decodeClient, encodeServer, colorForUser, docToPlainText, countWords, collectBlocks, type ServerMessage, type PMNode, type PresenceUser } from '@kb/shared';
import { tx } from '../db/pool.js';
import { FRAGMENT, ydocToJson, validateDoc, titleOf } from './ydoc.js';
import { pageAccess, type AuthUser } from '../acl/engine.js';
import { createRevision } from '../services/revisions.js';
import { enqueue } from '../services/pages.js';
import type { EventBus } from '../lib/events.js';
import type { Metrics } from '../observability/metrics.js';

const AUTO_REVISION_MS = 5 * 60_000;
const FLUSH_DEBOUNCE_MS = 1500;
const FLUSH_MAX_MS = 10_000;
const COMPACT_EVERY = 300;
const IDLE_UNLOAD_MS = 60_000;
const MAX_UPDATE_BYTES = 10 * 1024 * 1024;

export interface Conn {
  id: string;
  ws: WebSocket;
  user: AuthUser;
  sessionId: string | null;
  clientId: number | null;
  canEdit: boolean;
  level: string;
  alive: boolean;
}

interface LiveDoc {
  pageId: string;
  orgId: string;
  ydoc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  lastSeq: number;
  snapshotSeq: number;
  conns: Set<Conn>;
  chain: Promise<unknown>;
  lastFlushedJson: PMNode | null;
  dirty: boolean;
  firstDirtyAt: number | null;
  flushTimer: NodeJS.Timeout | null;
  authorsSinceRevision: Set<string>;
  authorsSinceFlush: Set<string>;
  lastRevisionAt: number;
  changedSinceRevision: boolean;
  idleTimer: NodeJS.Timeout | null;
  awarenessClients: Map<string, Set<number>>;
}

/**
 * In-memory authority for documents being edited on this instance. Durable state lives in PostgreSQL:
 * every accepted update is appended to doc_updates before it is acknowledged or broadcast.
 */
export class CollabHub {
  private docs = new Map<string, LiveDoc>();
  private loading = new Map<string, Promise<LiveDoc>>();
  private stopping = false;
  private heartbeat: NodeJS.Timeout;
  private unsub: () => void;
  private aclRecheck = new Map<string, NodeJS.Timeout>();

  constructor(
    private pool: pg.Pool,
    private log: Logger,
    private bus: EventBus,
    private metrics: Metrics,
  ) {
    this.heartbeat = setInterval(() => this.ping(), 30_000);
    this.unsub = bus.on((e) => {
      if (e.type === 'acl-changed') this.scheduleAclRecheck(e.orgId);
      else if (e.type === 'user-revoked') this.closeUser(e.userId, CLOSE.ACCESS_REVOKED, e.reason);
      else if (e.type === 'doc-update' && e.origin !== bus.instanceId) void this.catchUp(e.pageId);
      else if (e.type === 'tree-changed' && e.pageIds) for (const id of e.pageIds) this.closeIfDeleted(id);
    });
  }

  stats() {
    let conns = 0;
    for (const d of this.docs.values()) conns += d.conns.size;
    return { docs: this.docs.size, connections: conns };
  }

  // ------------------------------------------------------------------ loading

  private async load(pageId: string): Promise<LiveDoc> {
    const existing = this.docs.get(pageId);
    if (existing) return existing;
    const pending = this.loading.get(pageId);
    if (pending) return pending;
    const p = (async () => {
      const page = (await this.pool.query('select org_id from pages where id = $1', [pageId])).rows[0];
      if (!page) throw Object.assign(new Error('page not found'), { code: 'not_found' });
      const ydoc = new Y.Doc({ gc: true });
      const st = (await this.pool.query('select snapshot, snapshot_seq, last_seq, content from doc_state where page_id = $1', [pageId])).rows[0];
      if (!st) throw Object.assign(new Error('document state missing'), { code: 'not_found' });
      if (st.snapshot) Y.applyUpdate(ydoc, st.snapshot);
      const ups = await this.pool.query('select seq, update from doc_updates where page_id = $1 and seq > $2 order by seq', [pageId, st.snapshot_seq]);
      let lastSeq = st.snapshot_seq;
      for (const u of ups.rows) {
        Y.applyUpdate(ydoc, u.update);
        lastSeq = u.seq;
      }
      const lastRev = (await this.pool.query('select created_at from page_revisions where page_id = $1 order by number desc limit 1', [pageId])).rows[0];
      const live: LiveDoc = {
        pageId,
        orgId: page.org_id,
        ydoc,
        awareness: new awarenessProtocol.Awareness(new Y.Doc()),
        lastSeq,
        snapshotSeq: st.snapshot_seq,
        conns: new Set(),
        chain: Promise.resolve(),
        lastFlushedJson: st.content ?? null,
        dirty: false,
        firstDirtyAt: null,
        flushTimer: null,
        authorsSinceRevision: new Set(),
        authorsSinceFlush: new Set(),
        lastRevisionAt: lastRev ? new Date(lastRev.created_at).getTime() : 0,
        changedSinceRevision: false,
        idleTimer: null,
        awarenessClients: new Map(),
      };
      live.awareness.setLocalState(null);
      this.docs.set(pageId, live);
      this.metrics.collabDocs.set(this.docs.size);
      return live;
    })();
    this.loading.set(pageId, p);
    try {
      return await p;
    } finally {
      this.loading.delete(pageId);
    }
  }

  /** Serialises all mutations of one document. */
  private run<T>(live: LiveDoc, fn: () => Promise<T>): Promise<T> {
    const next = live.chain.then(fn, fn);
    live.chain = next.catch(() => undefined);
    return next;
  }

  // ------------------------------------------------------------------ persistence

  /**
   * Appends an update to the durable journal. Idempotent by opId: a re-sent operation returns the original seq.
   * Returns null if the page is no longer editable (deleted).
   */
  private async persist(live: LiveDoc, update: Uint8Array, userId: string | null, clientId: number | null, opId: string): Promise<{ seq: number; duplicate: boolean }> {
    const started = performance.now();
    const res = await tx(this.pool, async (c) => {
      const st = (await c.query('select last_seq from doc_state where page_id = $1 for update', [live.pageId])).rows[0];
      const dup = await c.query('select seq from doc_updates where page_id = $1 and op_id = $2', [live.pageId, opId]);
      if (dup.rows[0]) return { seq: dup.rows[0].seq as number, duplicate: true };
      const seq = st.last_seq + 1;
      await c.query('insert into doc_updates (page_id, seq, update, user_id, client_id, op_id) values ($1, $2, $3, $4, $5, $6)', [live.pageId, seq, Buffer.from(update), userId, clientId, opId]);
      await c.query('update doc_state set last_seq = $2, updated_at = now() where page_id = $1', [live.pageId, seq]);
      return { seq, duplicate: false };
    });
    this.metrics.collabPersistSeconds.observe((performance.now() - started) / 1000);
    return res;
  }

  /** Applies updates persisted by other instances that this instance has not seen yet. */
  private async catchUp(pageId: string) {
    const live = this.docs.get(pageId);
    if (!live) return;
    await this.run(live, async () => {
      const ups = await this.pool.query('select seq, update from doc_updates where page_id = $1 and seq > $2 order by seq', [pageId, live.lastSeq]);
      for (const u of ups.rows) {
        Y.applyUpdate(live.ydoc, u.update, 'remote-instance');
        live.lastSeq = u.seq;
        this.broadcast(live, { type: MSG.REMOTE, update: u.update, seq: u.seq }, null);
      }
      if (ups.rowCount) this.markDirty(live, null);
    });
  }

  // ------------------------------------------------------------------ connections

  async connect(ws: WebSocket, user: AuthUser, sessionId: string | null, pageId: string) {
    const conn: Conn = { id: randomUUID(), ws, user, sessionId, clientId: null, canEdit: false, level: 'none', alive: true };
    const acc = await pageAccess(this.pool, user, pageId);
    if (!acc || !acc.actions.view || acc.deleted) {
      this.sendError(ws, 'not_found', 'Страница не найдена или нет доступа', CLOSE.NOT_FOUND);
      return;
    }
    if (acc.policy.publishingMode === 'publish' && !acc.actions.edit) {
      this.sendError(ws, 'published_only', 'Читателям этого пространства доступна только опубликованная версия', CLOSE.ACCESS_REVOKED);
      return;
    }
    const locked = (await this.pool.query('select locked from pages where id = $1', [pageId])).rows[0]?.locked;
    conn.canEdit = acc.actions.edit && (!locked || acc.level === 'full');
    conn.level = acc.level;
    let live: LiveDoc;
    try {
      live = await this.load(pageId);
    } catch (err) {
      this.log.error({ err, pageId }, 'failed to load document');
      this.sendError(ws, 'load_failed', 'Не удалось загрузить документ', CLOSE.SERVER_RESTART);
      return;
    }
    if (live.idleTimer) {
      clearTimeout(live.idleTimer);
      live.idleTimer = null;
    }
    live.conns.add(conn);
    this.metrics.collabConnections.inc();
    ws.on('pong', () => (conn.alive = true));
    ws.on('message', (data: Buffer, isBinary: boolean) => {
      if (!isBinary) return;
      void this.onMessage(live, conn, new Uint8Array(data)).catch((err) => this.log.error({ err, pageId }, 'collab message failed'));
    });
    ws.on('close', () => {
      live.conns.delete(conn);
      this.metrics.collabConnections.dec();
      const ids = live.awarenessClients.get(conn.id);
      if (ids?.size) awarenessProtocol.removeAwarenessStates(live.awareness, [...ids], 'disconnect');
      live.awarenessClients.delete(conn.id);
      this.sendPresence(live);
      if (live.conns.size === 0) {
        void this.flush(live, { revision: true }).catch((err) => this.log.error({ err }, 'flush on disconnect failed'));
        live.idleTimer = setTimeout(() => void this.unload(live), IDLE_UNLOAD_MS);
      }
    });
    // Send current awareness of others.
    const states = [...live.awareness.getStates().keys()];
    if (states.length) this.send(ws, { type: MSG.AWARENESS, update: awarenessProtocol.encodeAwarenessUpdate(live.awareness, states) });
  }

  private async onMessage(live: LiveDoc, conn: Conn, buf: Uint8Array) {
    let msg;
    try {
      msg = decodeClient(buf);
    } catch {
      this.sendError(conn.ws, 'bad_message', 'Некорректное сообщение', CLOSE.INVALID);
      return;
    }
    switch (msg.type) {
      case MSG.PING:
        this.send(conn.ws, { type: MSG.PONG });
        return;
      case MSG.HELLO:
        await this.run(live, async () => {
          const update = Y.encodeStateAsUpdate(live.ydoc, msg.stateVector);
          this.send(conn.ws, { type: MSG.SYNC, update, stateVector: Y.encodeStateVector(live.ydoc), seq: live.lastSeq, canEdit: conn.canEdit });
        });
        this.sendPresence(live);
        return;
      case MSG.AWARENESS: {
        try {
          const dec = await import('lib0/decoding');
          // Track which awareness client ids belong to this connection (cleanup on disconnect).
          const d = dec.createDecoder(msg.update);
          const len = dec.readVarUint(d);
          const ids = live.awarenessClients.get(conn.id) ?? new Set<number>();
          for (let i = 0; i < len; i++) {
            const clientId = dec.readVarUint(d);
            dec.readVarUint(d);
            dec.readVarString(d);
            ids.add(clientId);
            conn.clientId = clientId;
          }
          live.awarenessClients.set(conn.id, ids);
          awarenessProtocol.applyAwarenessUpdate(live.awareness, msg.update, conn);
          this.broadcast(live, { type: MSG.AWARENESS, update: msg.update }, conn);
          this.sendPresence(live);
        } catch {
          /* ignore malformed awareness */
        }
        return;
      }
      case MSG.UPDATE:
        await this.run(live, () => this.acceptUpdate(live, conn, msg.opId, msg.update));
        return;
    }
  }

  private async acceptUpdate(live: LiveDoc, conn: Conn, opId: string, update: Uint8Array) {
    const nack = (code: string, message: string) => this.send(conn.ws, { type: MSG.NACK, opId, code, message });
    if (!conn.canEdit) return nack('forbidden', 'Нет права на редактирование');
    if (!opId || opId.length > 100) return nack('bad_request', 'Некорректный идентификатор операции');
    if (update.byteLength > MAX_UPDATE_BYTES) return nack('too_large', 'Слишком большое изменение');
    // Fast path for a retried operation that is already durable.
    const dup = await this.pool.query('select seq from doc_updates where page_id = $1 and op_id = $2', [live.pageId, opId]);
    if (dup.rows[0]) {
      this.send(conn.ws, { type: MSG.ACK, opId, seq: dup.rows[0].seq });
      return;
    }
    // Re-check page state (may have been trashed / locked meanwhile).
    const page = (await this.pool.query('select deleted_at from pages where id = $1', [live.pageId])).rows[0];
    if (!page || page.deleted_at) {
      nack('deleted', 'Страница перемещена в корзину. Ваши несохранённые изменения остаются на устройстве.');
      return;
    }
    try {
      Y.decodeUpdate(update);
    } catch {
      return nack('invalid_update', 'Повреждённое обновление отклонено');
    }
    const svBefore = Y.encodeStateVector(live.ydoc);
    Y.applyUpdate(live.ydoc, update, conn);
    // Persist whenever the update may carry information: new structs, deletions, or structs still pending
    // (dependencies not yet integrated). Only a provably redundant update is acknowledged without a write.
    const pending = (live.ydoc.store as any).pendingStructs !== null || (live.ydoc.store as any).pendingDs !== null;
    const changed = pending || !sameStateVector(svBefore, Y.encodeStateVector(live.ydoc)) || hasDeletes(update);
    const check = validateDoc(live.ydoc);
    if (!check.ok) {
      this.log.warn({ pageId: live.pageId, error: check.error, userId: conn.user.id }, 'rejected schema-invalid update');
      await this.reload(live);
      this.metrics.collabRejected.inc();
      return nack('invalid_update', 'Изменение нарушает структуру документа и было отклонено. Сохраните локальную копию и обновите страницу.');
    }
    if (!changed) {
      // Nothing new (already integrated) — durable by definition.
      this.send(conn.ws, { type: MSG.ACK, opId, seq: live.lastSeq });
      return;
    }
    let res: { seq: number; duplicate: boolean };
    try {
      res = await this.persist(live, update, conn.user.id, conn.clientId, opId);
    } catch (err) {
      this.log.error({ err, pageId: live.pageId }, 'failed to persist update');
      // Not durable: roll the in-memory state back to what the database has and tell the client to retry.
      await this.reload(live);
      this.metrics.collabPersistFailures.inc();
      return nack('persist_failed', 'Сервер не смог сохранить изменение — оно остаётся на устройстве и будет отправлено повторно');
    }
    if (res.seq > live.lastSeq + 1 && !res.duplicate) {
      // Another instance appended meanwhile: integrate the gap.
      const gap = await this.pool.query('select seq, update from doc_updates where page_id = $1 and seq > $2 and seq < $3 order by seq', [live.pageId, live.lastSeq, res.seq]);
      for (const g of gap.rows) {
        Y.applyUpdate(live.ydoc, g.update, 'remote-instance');
        this.broadcast(live, { type: MSG.REMOTE, update: g.update, seq: g.seq }, null);
      }
    }
    live.lastSeq = Math.max(live.lastSeq, res.seq);
    this.send(conn.ws, { type: MSG.ACK, opId, seq: res.seq });
    this.broadcast(live, { type: MSG.REMOTE, update, seq: res.seq }, conn);
    this.bus.emit({ type: 'doc-update', pageId: live.pageId, seq: res.seq, origin: this.bus.instanceId });
    this.metrics.collabUpdates.inc();
    this.markDirty(live, conn.user.id);
  }

  /** Rebuilds the in-memory doc from the database (after a rejected/failed update). */
  private async reload(live: LiveDoc) {
    const fresh = new Y.Doc({ gc: true });
    const st = (await this.pool.query('select snapshot, snapshot_seq from doc_state where page_id = $1', [live.pageId])).rows[0];
    if (st?.snapshot) Y.applyUpdate(fresh, st.snapshot);
    const ups = await this.pool.query('select seq, update from doc_updates where page_id = $1 and seq > $2 order by seq', [live.pageId, st?.snapshot_seq ?? 0]);
    let last = st?.snapshot_seq ?? 0;
    for (const u of ups.rows) {
      Y.applyUpdate(fresh, u.update);
      last = u.seq;
    }
    live.ydoc.destroy();
    live.ydoc = fresh;
    live.lastSeq = last;
  }

  /**
   * Server-originated change (version restore, import into existing page, template apply, migration).
   * Runs through the same durable path and is broadcast to editors.
   */
  async applyServerChange(pageId: string, userId: string | null, change: (doc: Y.Doc) => void, opId = 'srv:' + randomUUID()): Promise<{ seq: number; json: PMNode }> {
    const live = await this.load(pageId);
    return this.run(live, async () => {
      const sv = Y.encodeStateVector(live.ydoc);
      change(live.ydoc);
      const update = Y.encodeStateAsUpdate(live.ydoc, sv);
      const check = validateDoc(live.ydoc);
      if (!check.ok) {
        await this.reload(live);
        throw new Error('server change produced an invalid document: ' + check.error);
      }
      let seq = live.lastSeq;
      if (update.byteLength > 2) {
        try {
          const res = await this.persist(live, update, userId, null, opId);
          seq = res.seq;
        } catch (err) {
          await this.reload(live);
          throw err;
        }
        live.lastSeq = Math.max(live.lastSeq, seq);
        this.broadcast(live, { type: MSG.REMOTE, update, seq }, null);
        this.bus.emit({ type: 'doc-update', pageId, seq, origin: this.bus.instanceId });
        this.markDirty(live, userId);
      }
      await this.flushNow(live, { revision: false });
      if (live.conns.size === 0 && !live.idleTimer) live.idleTimer = setTimeout(() => void this.unload(live), IDLE_UNLOAD_MS);
      return { seq, json: check.json };
    });
  }

  /** Current document JSON + state (loads from DB if not live). */
  async snapshot(pageId: string): Promise<{ json: PMNode; state: Uint8Array; seq: number }> {
    const live = await this.load(pageId);
    const res = await this.run(live, async () => ({ json: ydocToJson(live.ydoc), state: Y.encodeStateAsUpdate(live.ydoc), seq: live.lastSeq }));
    if (live.conns.size === 0 && !live.idleTimer) live.idleTimer = setTimeout(() => void this.unload(live), IDLE_UNLOAD_MS);
    return res;
  }

  // ------------------------------------------------------------------ flush / revisions

  private markDirty(live: LiveDoc, userId: string | null) {
    live.dirty = true;
    live.changedSinceRevision = true;
    if (userId) {
      live.authorsSinceFlush.add(userId);
      live.authorsSinceRevision.add(userId);
    }
    const now = Date.now();
    live.firstDirtyAt ??= now;
    if (live.flushTimer) clearTimeout(live.flushTimer);
    const wait = now - live.firstDirtyAt > FLUSH_MAX_MS ? 0 : FLUSH_DEBOUNCE_MS;
    live.flushTimer = setTimeout(() => void this.flush(live, { revision: false }).catch((err) => this.log.error({ err }, 'flush failed')), wait);
  }

  private flush(live: LiveDoc, opts: { revision: boolean; kind?: 'auto' | 'manual'; label?: string; userId?: string | null }) {
    return this.run(live, () => this.flushNow(live, opts));
  }

  /** Materialises JSON/text for search & API, records the edit journal, creates auto revisions and compacts. */
  private async flushNow(live: LiveDoc, opts: { revision: boolean; kind?: 'auto' | 'manual'; label?: string; userId?: string | null }) {
    if (live.flushTimer) {
      clearTimeout(live.flushTimer);
      live.flushTimer = null;
    }
    const wantRevision = (opts.revision && live.changedSinceRevision) || (live.changedSinceRevision && Date.now() - live.lastRevisionAt > AUTO_REVISION_MS) || opts.kind === 'manual';
    if (!live.dirty && !wantRevision) return null;
    const json = ydocToJson(live.ydoc);
    const text = docToPlainText(json);
    const state = Y.encodeStateAsUpdate(live.ydoc);
    const docTitle = titleOf(live.ydoc).slice(0, 500);
    const authors = [...live.authorsSinceFlush];
    const prev = live.lastFlushedJson;
    let revision: { id: string; number: number } | null = null;
    let titleChanged = false;
    await tx(this.pool, async (c) => {
      if (live.dirty) {
        await c.query('update doc_state set content = $2, plain_text = $3, updated_at = now() where page_id = $1', [live.pageId, json, text]);
        await c.query(`update pages set content_updated_at = now(), updated_at = now(), word_count = $2, updated_by = coalesce($3, updated_by) where id = $1`, [live.pageId, countWords(text), authors[authors.length - 1] ?? null]);
        const cur = (await c.query('select title from pages where id = $1', [live.pageId])).rows[0];
        if (cur && cur.title !== docTitle) {
          await c.query('update pages set title = $2, version = version + 1 where id = $1', [live.pageId, docTitle]);
          await c.query(`insert into page_events (org_id, page_id, actor_id, type, data) values ($1, $2, $3, 'renamed', $4)`, [live.orgId, live.pageId, authors[0] ?? null, { from: cur.title, to: docTitle }]);
          titleChanged = true;
        }
        const changes = blockChanges(prev, json);
        if (changes.total > 0) {
          // Aggregate consecutive edits of the same author into one journal entry (logical operation groups).
          const last = (await c.query(`select id, actor_id, data, created_at from page_events where page_id = $1 order by id desc limit 1`, [live.pageId])).rows[0];
          const actor = authors.length === 1 ? authors[0] : null;
          if (last && last.data?.kind === 'edit' && last.actor_id === actor && Date.now() - new Date(last.created_at).getTime() < 5 * 60_000 && (last.data.blocks?.length ?? 0) < 500) {
            const blocks = [...new Set([...(last.data.blocks ?? []), ...changes.ids])].slice(0, 500);
            await c.query(`update page_events set data = $2 where id = $1`, [last.id, { ...last.data, blocks, added: (last.data.added ?? 0) + changes.added, removed: (last.data.removed ?? 0) + changes.removed, changed: (last.data.changed ?? 0) + changes.changed, until: new Date().toISOString(), seq: live.lastSeq }]);
          } else {
            await c.query(`insert into page_events (org_id, page_id, actor_id, type, data) values ($1, $2, $3, 'edit', $4)`, [live.orgId, live.pageId, actor, { kind: 'edit', authors, blocks: changes.ids.slice(0, 500), added: changes.added, removed: changes.removed, changed: changes.changed, seq: live.lastSeq }]);
          }
        }
        await enqueue(c, 'index-page', { pageId: live.pageId });
      }
      if (wantRevision) {
        revision = await createRevision(c, {
          pageId: live.pageId,
          kind: opts.kind ?? 'auto',
          label: opts.label ?? null,
          title: docTitle,
          state,
          content: json,
          seqUpto: live.lastSeq,
          authors: [...live.authorsSinceRevision],
          createdBy: opts.userId ?? null,
        });
      }
      if (live.lastSeq - live.snapshotSeq >= COMPACT_EVERY) {
        await c.query('update doc_state set snapshot = $2, snapshot_seq = $3 where page_id = $1', [live.pageId, Buffer.from(state), live.lastSeq]);
        live.snapshotSeq = live.lastSeq;
      }
    });
    if (titleChanged) {
      const sp = (await this.pool.query('select space_id from pages where id = $1', [live.pageId])).rows[0];
      if (sp) this.bus.emit({ type: 'tree-changed', orgId: live.orgId, spaceId: sp.space_id });
      this.bus.emit({ type: 'page-changed', orgId: live.orgId, pageId: live.pageId, fields: ['title'] });
    }
    live.dirty = false;
    live.firstDirtyAt = null;
    live.lastFlushedJson = json;
    live.authorsSinceFlush.clear();
    if (revision) {
      live.lastRevisionAt = Date.now();
      live.changedSinceRevision = false;
      live.authorsSinceRevision.clear();
    }
    return revision;
  }

  /** Creates a named/manual revision of the current state (used by "Сохранить версию", publish, pre-restore). */
  async createRevisionNow(pageId: string, kind: 'manual' | 'auto', userId: string | null, label?: string) {
    const live = await this.load(pageId);
    return this.run(live, () => this.flushNow(live, { revision: true, kind: 'manual', label, userId }).then(async (r) => r ?? (await this.latestRevision(pageId))));
  }

  private async latestRevision(pageId: string) {
    return (await this.pool.query('select id, number from page_revisions where page_id = $1 order by number desc limit 1', [pageId])).rows[0];
  }

  private async unload(live: LiveDoc) {
    if (live.conns.size > 0) return;
    await this.flush(live, { revision: true }).catch((err) => this.log.error({ err }, 'flush before unload failed'));
    if (live.conns.size > 0) return;
    this.docs.delete(live.pageId);
    live.ydoc.destroy();
    live.awareness.destroy();
    this.metrics.collabDocs.set(this.docs.size);
  }

  // ------------------------------------------------------------------ access re-validation

  private scheduleAclRecheck(orgId: string) {
    if (this.aclRecheck.has(orgId)) return;
    this.aclRecheck.set(
      orgId,
      setTimeout(() => {
        this.aclRecheck.delete(orgId);
        void this.recheckAccess(orgId);
      }, 100),
    );
  }

  /** Re-validates every open connection of the org after an ACL / membership / status change. */
  async recheckAccess(orgId?: string) {
    for (const live of this.docs.values()) {
      if (orgId && live.orgId !== orgId) continue;
      for (const conn of [...live.conns]) {
        try {
          const status = (await this.pool.query('select status, access_expires_at from users where id = $1', [conn.user.id])).rows[0];
          if (!status || status.status !== 'active' || (status.access_expires_at && new Date(status.access_expires_at) <= new Date())) {
            this.sendError(conn.ws, 'access_revoked', 'Доступ отозван', CLOSE.ACCESS_REVOKED);
            continue;
          }
          if (conn.sessionId) {
            const s = (await this.pool.query('select revoked_at, expires_at from sessions where id = $1', [conn.sessionId])).rows[0];
            if (!s || s.revoked_at || new Date(s.expires_at) <= new Date()) {
              this.sendError(conn.ws, 'session_expired', 'Сеанс завершён — войдите снова', CLOSE.SESSION_EXPIRED);
              continue;
            }
          }
          const acc = await pageAccess(this.pool, conn.user, live.pageId);
          if (!acc || !acc.actions.view || acc.deleted || (acc.policy.publishingMode === 'publish' && !acc.actions.edit)) {
            this.sendError(conn.ws, acc?.deleted ? 'deleted' : 'access_revoked', acc?.deleted ? 'Страница перемещена в корзину' : 'Доступ к странице отозван', CLOSE.ACCESS_REVOKED);
            continue;
          }
          const locked = (await this.pool.query('select locked from pages where id = $1', [live.pageId])).rows[0]?.locked;
          const canEdit = acc.actions.edit && (!locked || acc.level === 'full');
          if (canEdit !== conn.canEdit || acc.level !== conn.level) {
            conn.canEdit = canEdit;
            conn.level = acc.level;
            this.send(conn.ws, { type: MSG.ACCESS, canEdit, level: acc.level, reason: canEdit ? undefined : locked ? 'locked' : 'permission' });
          }
        } catch (err) {
          this.log.error({ err }, 'access recheck failed');
        }
      }
    }
  }

  private closeUser(userId: string, code: number, reason: string) {
    for (const live of this.docs.values()) for (const c of [...live.conns]) if (c.user.id === userId) this.sendError(c.ws, 'access_revoked', reason, code);
  }

  private closeIfDeleted(pageId: string) {
    const live = this.docs.get(pageId);
    if (live) void this.recheckAccess(live.orgId);
  }

  // ------------------------------------------------------------------ messaging

  private send(ws: WebSocket, m: ServerMessage) {
    if (ws.readyState === 1) ws.send(encodeServer(m), { binary: true });
  }

  private sendError(ws: WebSocket, code: string, message: string, closeCode: number) {
    this.send(ws, { type: MSG.ERROR, code, message });
    setTimeout(() => ws.close(closeCode, code), 10);
  }

  private broadcast(live: LiveDoc, m: ServerMessage, except: Conn | null) {
    const data = encodeServer(m);
    for (const c of live.conns) if (c !== except && c.ws.readyState === 1) c.ws.send(data, { binary: true });
  }

  private sendPresence(live: LiveDoc) {
    const users: PresenceUser[] = [...live.conns].map((c) => ({ clientId: c.clientId ?? 0, userId: c.user.id, name: c.user.name, color: colorForUser(c.user.id), canEdit: c.canEdit }));
    this.broadcast(live, { type: MSG.PRESENCE, users }, null);
  }

  private ping() {
    for (const live of this.docs.values())
      for (const c of live.conns) {
        if (!c.alive) {
          c.ws.terminate();
          continue;
        }
        c.alive = false;
        c.ws.ping();
      }
  }

  /** Graceful shutdown: flush every document and tell clients to reconnect elsewhere. */
  async shutdown() {
    if (this.stopping) return;
    this.stopping = true;
    clearInterval(this.heartbeat);
    this.unsub();
    for (const t of this.aclRecheck.values()) clearTimeout(t);
    for (const live of [...this.docs.values()]) {
      if (live.idleTimer) clearTimeout(live.idleTimer);
      try {
        await this.flush(live, { revision: true });
      } catch (err) {
        this.log.error({ err }, 'flush on shutdown failed');
      }
      for (const c of live.conns) c.ws.close(CLOSE.SERVER_RESTART, 'server restart');
      live.ydoc.destroy();
    }
    this.docs.clear();
  }

  /** For tests: force a flush of a live document. */
  async flushPage(pageId: string) {
    const live = this.docs.get(pageId);
    if (live) await this.flush(live, { revision: false });
  }
}

function sameStateVector(a: Uint8Array, b: Uint8Array) {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false;
  return true;
}

function hasDeletes(update: Uint8Array): boolean {
  try {
    const d = Y.decodeUpdate(update);
    return d.ds.clients.size > 0;
  } catch {
    return false;
  }
}

function blockChanges(before: PMNode | null, after: PMNode) {
  const a = new Map((before ? collectBlocks(before) : []).map((b) => [b.id, b.hash]));
  const b = new Map(collectBlocks(after).map((x) => [x.id, x.hash]));
  const ids: string[] = [];
  let added = 0;
  let removed = 0;
  let changed = 0;
  for (const [id, h] of b) {
    if (!a.has(id)) {
      added++;
      ids.push(id);
    } else if (a.get(id) !== h) {
      changed++;
      ids.push(id);
    }
  }
  for (const id of a.keys())
    if (!b.has(id)) {
      removed++;
      ids.push(id);
    }
  return { ids, added, removed, changed, total: added + removed + changed };
}

export { FRAGMENT };
