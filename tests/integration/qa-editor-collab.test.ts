import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
import { MSG, decodeServer, encodeClient } from '@kb/shared';
import * as Y from 'yjs';
import { startServer, setupOrg, type TestServer } from '../support/harness.js';
import { openClient, waitFor } from '../support/collab.js';

/** Collaboration hub regressions found by the editor QA wave (docs/qa/defects.yaml QA-E3, QA-E4). */
let ts: TestServer;
let org: Awaited<ReturnType<typeof setupOrg>>;

beforeAll(async () => {
  ts = await startServer();
  org = await setupOrg(ts);
});
afterAll(async () => ts?.close());

const newPage = async (title: string) => (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title })).page.id as string;
const wsUrl = (pageId: string) => ts.url.replace('http', 'ws') + '/api/v1/collab/' + pageId;

describe('collaboration hub', () => {
  it('QA-E4: a socket that closes while its access is being checked leaves no ghost connection (presence, idle unload)', async () => {
    const pageId = await newPage('Призрачные подключения');
    const hub = ts.srv.services.hub;
    const base = hub.stats().connections;
    // many clients give up right after the upgrade, before the hub has finished checking access and loading the page
    await Promise.all(
      Array.from({ length: 25 }, async () => {
        const ws = new WebSocket(wsUrl(pageId), { headers: { cookie: org.owner.cookieHeader() } });
        await new Promise<void>((r) => ws.on('open', () => (ws.terminate(), r())));
      }),
    );
    await new Promise((r) => setTimeout(r, 1500));
    expect(hub.stats().connections).toBe(base);
    // a real client afterwards is the only connection of the page
    const c = await openClient(ts.url, org.owner, pageId);
    await waitFor(() => hub.stats().connections === base + 1, 5000, 'one live connection');
    c.close();
    await waitFor(() => hub.stats().connections === base, 5000, 'no connection left');
  });

  it('QA-E3: reconnecting to a page that was moved to the trash meanwhile is answered with «deleted», not «not found»', async () => {
    const pageId = await newPage('В корзине без сети');
    await org.owner.del(`/api/v1/pages/${pageId}`);
    const ws = new WebSocket(wsUrl(pageId), { headers: { cookie: org.owner.cookieHeader() } });
    const msgs: any[] = [];
    let closeCode = 0;
    ws.on('message', (d: Buffer) => msgs.push(decodeServer(new Uint8Array(d))));
    ws.on('close', (code) => (closeCode = code));
    await new Promise((r) => ws.on('open', r));
    ws.send(encodeClient({ type: MSG.HELLO, stateVector: Y.encodeStateVector(new Y.Doc()) }));
    await waitFor(() => closeCode !== 0, 5000, 'close');
    expect(msgs.find((m) => m.type === MSG.ERROR)).toMatchObject({ code: 'deleted' });
    expect(closeCode).toBe(4403);
  });
});
