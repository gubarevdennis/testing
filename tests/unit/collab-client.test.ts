import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { CollabProvider, type PendingStore, type SyncStatus } from '../../packages/shared/src/collab-client';
import { encodeServer, MSG } from '../../packages/shared/src/collab-protocol';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function setup(store: PendingStore) {
  const doc = new Y.Doc();
  const statuses: Array<{ s: SyncStatus; message?: string }> = [];
  const p = new CollabProvider({ url: 'ws://unused', doc, pendingStore: store, batchMs: 5, onStatus: (s, i) => statuses.push({ s, message: i.message }) });
  return { doc, p, statuses };
}

describe('offline status honesty (R-OFFLINE-003, R-OFFLINE-005, R-OFFLINE-006)', () => {
  it('"saved on this device" appears only after the local write has completed', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { doc, p, statuses } = setup({ load: async () => [], put: () => gate, remove: async () => undefined });
    await sleep(5);
    doc.getText('t').insert(0, 'офлайн');
    await sleep(30);
    expect(p.status).not.toBe('local');
    expect(statuses.some((x) => x.s === 'local')).toBe(false);
    release();
    await sleep(10);
    expect(p.status).toBe('local');
  });

  it('a full or broken local store is reported as an error, never as saved', async () => {
    const quota = Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
    const errors: string[] = [];
    const doc = new Y.Doc();
    const p = new CollabProvider({ url: 'ws://unused', doc, batchMs: 5, pendingStore: { load: async () => [], put: async () => Promise.reject(quota), remove: async () => undefined }, onStorageError: (m) => errors.push(m) });
    await sleep(5);
    doc.getText('t').insert(0, 'x');
    await sleep(30);
    expect(p.status).toBe('error');
    expect(errors[0]).toMatch(/закончилось место/);
  });

  it('acknowledged operations are removed from the store only after their write finished', async () => {
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { doc, p } = setup({
      load: async () => [],
      put: async (id) => {
        await gate;
        order.push('put:' + id);
      },
      remove: async (ids) => void order.push('remove:' + ids.join(',')),
    });
    await sleep(5);
    doc.getText('t').insert(0, 'y');
    await sleep(20);
    const opId = [...(p as any).pending.keys()][0] as string;
    // simulate the server acknowledgement arriving before the local write completed
    (p as any).onMessage(encodeServer({ type: MSG.ACK, opId, seq: 1 }));
    expect((p as any).pending.size).toBe(0);
    release();
    await sleep(10);
    expect(order).toEqual(['put:' + opId, 'remove:' + opId]);
  });
});
