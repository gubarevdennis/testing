import * as Y from 'yjs';
import WebSocket from 'ws';
import { CollabProvider, type SyncStatus } from '@kb/shared';
import type { Api } from './harness.js';

export interface TestClient {
  doc: Y.Doc;
  provider: CollabProvider;
  statuses: SyncStatus[];
  fatal: string[];
  access: Array<{ canEdit: boolean; level: string }>;
  text(): string;
  insert(blockIndex: number, offset: number, text: string): void;
  deleteText(blockIndex: number, offset: number, len: number): void;
  appendParagraph(text: string): void;
  removeBlock(blockIndex: number): void;
  waitFor(pred: () => boolean, ms?: number): Promise<void>;
  waitSaved(ms?: number): Promise<void>;
  close(): void;
}

export async function waitFor(pred: () => boolean, ms = 5000, label = 'condition') {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > ms) throw new Error('timeout waiting for ' + label);
    await new Promise((r) => setTimeout(r, 10));
  }
}

/** Headless collaborative client manipulating the Y.XmlFragment the same way the editor binding does. */
/** A WebSocket that never connects (as behind a proxy that blocks the Upgrade). */
export class BlockedWebSocket {
  readyState = 0;
  binaryType = 'arraybuffer';
  onopen: any = null;
  onmessage: any = null;
  onclose: any = null;
  onerror: any = null;
  constructor() {
    setTimeout(() => {
      this.readyState = 3;
      this.onerror?.();
      this.onclose?.({ code: 1006 });
    }, 5);
  }
  send() {}
  close() {}
}

export async function openClient(
  baseUrl: string,
  api: Api,
  pageId: string,
  opts: { connect?: boolean; batchMs?: number; wsBlocked?: boolean; httpFallback?: boolean; providerOptions?: Record<string, unknown> } = {},
): Promise<TestClient> {
  const doc = new Y.Doc();
  const statuses: SyncStatus[] = [];
  const fatal: string[] = [];
  const access: Array<{ canEdit: boolean; level: string }> = [];
  const provider = new CollabProvider({
    url: baseUrl.replace('http', 'ws') + '/api/v1/collab/' + pageId,
    doc,
    WebSocketImpl: opts.wsBlocked ? BlockedWebSocket : WebSocket,
    wsOptions: { headers: { cookie: api.cookieHeader() } },
    httpFallback: opts.httpFallback || opts.wsBlocked ? { headers: () => ({ cookie: api.cookieHeader(), ...(api.csrf ? { 'x-csrf-token': api.csrf } : {}) }) } : undefined,
    batchMs: opts.batchMs ?? 5,
    backoff: { minMs: 50, maxMs: 300 },
    ackTimeoutMs: 3000,
    onStatus: (s) => statuses.push(s),
    onFatal: (code) => fatal.push(code),
    onAccess: (canEdit, level) => access.push({ canEdit, level }),
    ...opts.providerOptions,
  });
  const frag = () => doc.getXmlFragment('default');
  const textNode = (i: number) => {
    const el = frag().get(i) as Y.XmlElement;
    let t = el.get(0) as Y.XmlText | undefined;
    if (!(t instanceof Y.XmlText)) {
      t = new Y.XmlText();
      el.insert(0, [t]);
    }
    return t;
  };
  const client: TestClient = {
    doc,
    provider,
    statuses,
    fatal,
    access,
    text: () =>
      frag()
        .toArray()
        .map((el) => (el instanceof Y.XmlElement ? el.toArray().map((t) => (t instanceof Y.XmlText ? t.toString().replace(/<[^>]+>/g, '') : '')).join('') : ''))
        .join('\n'),
    insert: (b, o, t) => textNode(b).insert(o, t),
    deleteText: (b, o, l) => textNode(b).delete(o, l),
    appendParagraph: (t) => {
      const p = new Y.XmlElement('paragraph');
      p.setAttribute('id', globalThis.crypto.randomUUID());
      const x = new Y.XmlText();
      x.insert(0, t);
      p.insert(0, [x]);
      frag().push([p]);
    },
    removeBlock: (b) => frag().delete(b, 1),
    waitFor: (pred, ms) => waitFor(pred, ms),
    waitSaved: async (ms = 5000) => {
      provider.flush();
      await waitFor(() => provider.status === 'saved', ms, 'saved (status ' + provider.status + ')');
    },
    close: () => provider.destroy(),
  };
  if (opts.connect !== false) {
    await provider.connect();
    await waitFor(() => provider.synced || fatal.length > 0, opts.wsBlocked ? 15000 : 5000, 'synced');
  }
  return client;
}
