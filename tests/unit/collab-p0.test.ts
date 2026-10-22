import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { CollabProvider, type PendingStore } from '../../packages/shared/src/collab-client';
import { encodeServer, decodeClient, MSG } from '../../packages/shared/src/collab-protocol';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Scriptable WebSocket double: records frames, lets the test play the server. */
class FakeWS {
  static all: FakeWS[] = [];
  static failToOpen = false;
  readyState = 0;
  binaryType = 'arraybuffer';
  bufferedAmount = 0;
  sent: any[] = [];
  onopen: any = null;
  onmessage: any = null;
  onclose: any = null;
  onerror: any = null;
  constructor(public url: string) {
    FakeWS.all.push(this);
    setTimeout(() => {
      if (FakeWS.failToOpen) {
        this.readyState = 3;
        this.onclose?.({ code: 1006 });
        return;
      }
      this.readyState = 1;
      this.onopen?.();
    }, 1);
  }
  send(d: Uint8Array) {
    this.sent.push(decodeClient(d));
  }
  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.({ code: 1000 });
  }
  serve(m: Parameters<typeof encodeServer>[0]) {
    this.onmessage?.({ data: encodeServer(m).slice().buffer });
  }
  updates() {
    return this.sent.filter((m) => m.type === MSG.UPDATE);
  }
}

async function connected(doc: Y.Doc, extra: Partial<ConstructorParameters<typeof CollabProvider>[0]> = {}) {
  FakeWS.all = [];
  FakeWS.failToOpen = false;
  const p = new CollabProvider({ url: 'ws://h/api/v1/collab/x', doc, WebSocketImpl: FakeWS, batchMs: 1, ...extra });
  await p.connect();
  await sleep(5);
  const ws = FakeWS.all[0];
  ws.serve({ type: MSG.SYNC, update: Y.encodeStateAsUpdate(new Y.Doc()), stateVector: Y.encodeStateVector(doc), seq: 0, canEdit: true });
  return { p, ws };
}

describe('backpressure (R-COLLAB-019)', () => {
  it('never more than maxInflightOps unacknowledged operations; the rest follows as ACKs arrive, in order, each exactly once (R-COLLAB-019)', async () => {
    const doc = new Y.Doc();
    const { p, ws } = await connected(doc, { maxInflightOps: 3 });
    const t = doc.getText('t');
    for (let i = 0; i < 10; i++) {
      t.insert(t.length, String(i));
      await sleep(4); // separate batches → separate operations
    }
    expect(p.pendingCount()).toBe(10);
    expect(ws.updates()).toHaveLength(3);
    expect(p.inflight().ops).toBe(3);
    let acked = 0;
    while (acked < 10) {
      const next = ws.updates()[acked];
      ws.serve({ type: MSG.ACK, opId: next.opId, seq: ++acked });
      expect(p.inflight().ops).toBeLessThanOrEqual(3);
    }
    const ids = ws.updates().map((u) => u.opId);
    expect(ids).toHaveLength(10);
    expect(new Set(ids).size).toBe(10);
    expect(p.status).toBe('saved');
    // replaying the updates in send order rebuilds the same text
    const replica = new Y.Doc();
    for (const u of ws.updates()) Y.applyUpdate(replica, u.update);
    expect(replica.getText('t').toString()).toBe('0123456789');
    p.destroy();
  });

  it('a full socket send buffer pauses sending until it drains; a byte budget limits large operations in flight (R-COLLAB-019)', async () => {
    const doc = new Y.Doc();
    const { p, ws } = await connected(doc, { maxInflightBytes: 1000, maxBufferedBytes: 10 });
    ws.bufferedAmount = 1_000_000;
    doc.getText('t').insert(0, 'x');
    await sleep(10);
    expect(ws.updates()).toHaveLength(0);
    expect(p.status).toBe('syncing');
    ws.bufferedAmount = 0;
    await sleep(80);
    expect(ws.updates()).toHaveLength(1);
    ws.serve({ type: MSG.ACK, opId: ws.updates()[0].opId, seq: 1 });
    // two 800-byte operations: the second waits for the first acknowledgement
    doc.getText('t').insert(1, 'a'.repeat(800));
    await sleep(4);
    doc.getText('t').insert(1, 'b'.repeat(800));
    await sleep(10);
    expect(ws.updates()).toHaveLength(2);
    ws.serve({ type: MSG.ACK, opId: ws.updates()[1].opId, seq: 2 });
    expect(ws.updates()).toHaveLength(3);
    p.destroy();
  });
});

describe('local journal before sending (R-OFFLINE-003, R-OFFLINE-005)', () => {
  it('an operation is sent to the server only after it was written to the local journal (R-OFFLINE-005, R-OFFLINE-003)', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const order: string[] = [];
    const store: PendingStore = {
      load: async () => [],
      put: async (id) => {
        await gate;
        order.push('stored:' + id);
      },
      remove: async () => undefined,
    };
    const doc = new Y.Doc();
    const { p, ws } = await connected(doc, { pendingStore: store });
    doc.getText('t').insert(0, 'журнал');
    await sleep(15);
    expect(ws.updates()).toHaveLength(0);
    release();
    await sleep(5);
    expect(ws.updates()).toHaveLength(1);
    expect(order).toEqual(['stored:' + ws.updates()[0].opId]);
    p.destroy();
  });

  it('if the local journal cannot be written, the operation is still sent (the server is then the only copy) and the status is honest (R-OFFLINE-006)', async () => {
    const doc = new Y.Doc();
    const errors: string[] = [];
    const { p, ws } = await connected(doc, { pendingStore: { load: async () => [], put: async () => Promise.reject(Object.assign(new Error('q'), { name: 'QuotaExceededError' })), remove: async () => undefined }, onStorageError: (m) => errors.push(m) });
    doc.getText('t').insert(0, 'x');
    await sleep(10);
    expect(ws.updates()).toHaveLength(1);
    expect(errors[0]).toMatch(/закончилось место/);
    ws.serve({ type: MSG.ACK, opId: ws.updates()[0].opId, seq: 1 });
    expect(p.status).toBe('saved');
    p.destroy();
  });
});

describe('server storage failure is visible (AT-59, R-COLLAB-017)', () => {
  it('persist_failed turns the status into an error with an explanation (never "Сохранение…" forever), retries, and clears after a durable ACK (AT-59, R-COLLAB-017)', async () => {
    const doc = new Y.Doc();
    const seen: Array<{ s: string; message?: string }> = [];
    const { p, ws } = await connected(doc, { onStatus: (s, i) => seen.push({ s, message: i.message }) });
    doc.getText('t').insert(0, 'важное');
    await sleep(10);
    const op = ws.updates()[0].opId;
    ws.serve({ type: MSG.NACK, opId: op, code: 'persist_failed', message: 'x' });
    expect(p.status).toBe('error');
    expect(seen.at(-1)!.message).toMatch(/Сервер не может сохранить/);
    expect(p.unsyncedUpdates().length).toBe(1); // available for "download local copy"
    await sleep(2100); // automatic retry
    expect(ws.updates().filter((u) => u.opId === op)).toHaveLength(2);
    ws.serve({ type: MSG.ACK, opId: op, seq: 1 });
    expect(p.status).toBe('saved');
    expect(seen.some((x) => x.s === 'saved' && x.message)).toBe(false);
    p.destroy();
  });
});

describe('transport fallback (R-COLLAB-039)', () => {
  it('after repeated WebSocket failures the provider switches to the HTTP channel without waiting out the backoff (R-COLLAB-039)', async () => {
    FakeWS.all = [];
    FakeWS.failToOpen = true;
    const urls: string[] = [];
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      urls.push(String(url));
      if (String(url).includes('/poll'))
        return new Promise((_r, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))); // long poll
      return new Response(JSON.stringify({ id: '00000000-0000-0000-0000-000000000001', frames: [], last: 0, closed: null }), { status: 200 });
    }) as unknown as typeof fetch;
    const doc = new Y.Doc();
    const p = new CollabProvider({ url: 'ws://h/api/v1/collab/abc', doc, WebSocketImpl: FakeWS, backoff: { minMs: 5, maxMs: 10 }, httpFallback: { fetch: fakeFetch } });
    await p.connect();
    await sleep(60);
    expect(FakeWS.all.length).toBe(2);
    expect(p.transport).toBe('http');
    expect(urls[0]).toBe('http://h/api/v1/collab/abc/tunnel');
    p.destroy();
    FakeWS.failToOpen = false;
  });

  it('a channel that opens but never delivers SYNC is treated as broken (proxy swallowing frames) (R-COLLAB-039)', async () => {
    FakeWS.all = [];
    const doc = new Y.Doc();
    const p = new CollabProvider({ url: 'ws://h/x', doc, WebSocketImpl: FakeWS, syncTimeoutMs: 20, backoff: { minMs: 1000, maxMs: 1000 } });
    await p.connect();
    await sleep(50);
    expect(FakeWS.all[0].readyState).toBe(3);
    p.destroy();
  });
});
