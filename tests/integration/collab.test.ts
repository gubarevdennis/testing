import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as Y from 'yjs';
import WebSocket from 'ws';
import fc from 'fast-check';
import { encodeClient, MSG, decodeServer } from '@kb/shared';
import { startServer, setupOrg, expectStatus, type TestServer } from '../support/harness.js';
import { openClient, waitFor } from '../support/collab.js';

let ts: TestServer;
let org: Awaited<ReturnType<typeof setupOrg>>;

beforeAll(async () => {
  ts = await startServer();
  org = await setupOrg(ts);
});
afterAll(async () => ts?.close());

async function newPage(title = 'Совместный документ') {
  return (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title })).page.id as string;
}

async function serverText(pageId: string) {
  const c = await org.owner.get(`/api/v1/pages/${pageId}/content`);
  return c.content.content.map((b: any) => (b.content ?? []).map((t: any) => t.text ?? '').join('')).join('\n');
}

describe('durability contract', () => {
  it('"saved" is reported only after the update is committed to the journal (E-13, D-10, R-COLLAB-003, R-COLLAB-014, R-COLLAB-016, R-COLLAB-025, R-COLLAB-029, R-COLLAB-043)', async () => {
    const pageId = await newPage();
    const c = await openClient(ts.url, org.owner, pageId);
    const before = (await ts.db.query('select count(*)::int c from doc_updates where page_id = $1', [pageId])).rows[0].c;
    c.insert(0, 0, 'Привет');
    expect(c.provider.status).not.toBe('saved');
    await c.waitSaved();
    const after = (await ts.db.query('select count(*)::int c from doc_updates where page_id = $1', [pageId])).rows[0].c;
    expect(after).toBeGreaterThan(before);
    expect(c.statuses).toContain('syncing');
    expect(await serverText(pageId)).toBe('Привет');
    c.close();
  });

  it('re-delivered operation is acknowledged once and not duplicated (D-02, E-03, UX23-214, R-COLLAB-019, R-COLLAB-023, R-COLLAB-044, R-OFFLINE-009)', async () => {
    const pageId = await newPage();
    const doc = new Y.Doc();
    const ws = new WebSocket(ts.url.replace('http', 'ws') + '/api/v1/collab/' + pageId, { headers: { cookie: org.owner.cookieHeader() } });
    const msgs: any[] = [];
    ws.on('message', (d: Buffer) => msgs.push(decodeServer(new Uint8Array(d))));
    await new Promise((r) => ws.on('open', r));
    ws.send(encodeClient({ type: MSG.HELLO, stateVector: Y.encodeStateVector(doc) }));
    await waitFor(() => msgs.some((m) => m.type === MSG.SYNC));
    Y.applyUpdate(doc, msgs.find((m) => m.type === MSG.SYNC).update);
    const sv = Y.encodeStateVector(doc);
    const el = doc.getXmlFragment('default').get(0) as Y.XmlElement;
    const t = new Y.XmlText();
    el.insert(0, [t]);
    t.insert(0, 'один раз');
    const update = Y.encodeStateAsUpdate(doc, sv);
    for (let i = 0; i < 3; i++) ws.send(encodeClient({ type: MSG.UPDATE, opId: 'op-dup-1', update }));
    await waitFor(() => msgs.filter((m) => m.type === MSG.ACK).length === 3);
    const seqs = new Set(msgs.filter((m) => m.type === MSG.ACK).map((m) => m.seq));
    expect(seqs.size).toBe(1);
    const rows = (await ts.db.query(`select count(*)::int c from doc_updates where page_id = $1 and op_id = 'op-dup-1'`, [pageId])).rows[0].c;
    expect(rows).toBe(1);
    // A different opId carrying the same (already integrated) content changes nothing.
    ws.send(encodeClient({ type: MSG.UPDATE, opId: 'op-dup-2', update }));
    await waitFor(() => msgs.filter((m) => m.type === MSG.ACK).length === 4);
    ws.close();
    expect(await serverText(pageId)).toBe('один раз');
  });
});

describe('concurrent editing', () => {
  it('two editors typing in the same paragraph converge without loss (SC-25, AT-74, COLLAB-192, UX23-217, OPS-005, R-COLLAB-001, UX13-08)', async () => {
    const pageId = await newPage();
    const editor = await org.user('Соавтор');
    await org.owner.put('/api/v1/grants', { resourceType: 'page', resourceId: pageId, subjectType: 'user', subjectId: editor.id, level: 'edit' });
    const a = await openClient(ts.url, org.owner, pageId);
    const b = await openClient(ts.url, editor, pageId);
    a.insert(0, 0, 'AAAA');
    b.insert(0, 0, 'BBBB');
    await Promise.all([a.waitSaved(), b.waitSaved()]);
    await waitFor(() => a.text() === b.text() && a.text().length === 8, 5000, 'convergence');
    expect(a.text()).toMatch(/^(AAAABBBB|BBBBAAAA)$/);
    expect(await serverText(pageId)).toBe(a.text());
    a.close();
    b.close();
  });

  it('delete block on one client while another edits it keeps a consistent result (AT-77, COLLAB-193)', async () => {
    const pageId = await newPage();
    const a = await openClient(ts.url, org.owner, pageId);
    a.insert(0, 0, 'первый');
    a.appendParagraph('второй');
    await a.waitSaved();
    const b = await openClient(ts.url, org.owner, pageId);
    await waitFor(() => b.text() === a.text());
    a.provider.disconnect();
    a.removeBlock(1);
    b.insert(1, 0, 'правка ');
    await b.waitSaved();
    await a.provider.connect();
    await a.waitSaved();
    await waitFor(() => a.text() === b.text(), 5000, 'convergence');
    // CRDT semantics: the deleted block is gone, but it stays restorable from history (journal + revisions).
    expect(a.text()).toBe('первый');
    const journal = (await ts.db.query('select count(*)::int c from doc_updates where page_id = $1', [pageId])).rows[0].c;
    expect(journal).toBeGreaterThan(3);
    a.close();
    b.close();
  });
});

describe('offline and reconnection', () => {
  it('offline edits are kept locally and synchronised after reconnect, concurrent with others (SC-26, AT-57, AT-76, UX23-215, R-COLLAB-007, COLLAB-195, R-OFFLINE-008, R-OFFLINE-011, UX23-213)', async () => {
    const pageId = await newPage();
    const a = await openClient(ts.url, org.owner, pageId);
    const b = await openClient(ts.url, org.owner, pageId);
    a.insert(0, 0, 'База.');
    await a.waitSaved();
    await waitFor(() => b.text() === 'База.');
    b.provider.disconnect();
    b.insert(0, 5, ' Офлайн-текст.');
    b.provider.flush();
    expect(b.provider.status).toBe('local');
    a.appendParagraph('Онлайн-абзац');
    await a.waitSaved();
    await b.provider.connect();
    await b.waitSaved();
    await waitFor(() => a.text() === b.text(), 5000, 'convergence');
    expect(a.text()).toBe('База. Офлайн-текст.\nОнлайн-абзац');
    expect(await serverText(pageId)).toBe(a.text());
    a.close();
    b.close();
  });

  it('unacknowledged changes survive a client restart via the pending store (AT-58, UX23-219, E-02, R-OFFLINE-002, V18-A20, V17-F03)', async () => {
    const pageId = await newPage();
    const persisted = new Map<string, { update: Uint8Array; ts: number }>();
    const store = {
      load: async () => [...persisted].map(([opId, v]) => ({ opId, ...v })),
      put: async (opId: string, update: Uint8Array, ts: number) => void persisted.set(opId, { update, ts }),
      remove: async (ids: string[]) => ids.forEach((i) => persisted.delete(i)),
    };
    const { CollabProvider } = await import('@kb/shared');
    const mk = () => {
      const doc = new Y.Doc();
      const p = new CollabProvider({ url: ts.url.replace('http', 'ws') + '/api/v1/collab/' + pageId, doc, WebSocketImpl: WebSocket, wsOptions: { headers: { cookie: org.owner.cookieHeader() } }, pendingStore: store, batchMs: 1, backoff: { minMs: 50, maxMs: 200 } });
      return { doc, p };
    };
    // Session 1: offline from the start — edits never reach the server, then the "tab is closed".
    const s1 = mk();
    const tmp = new Y.Doc();
    const base = await org.owner.get(`/api/v1/pages/${pageId}/content`);
    void base;
    // obtain base state via a short sync
    await s1.p.connect();
    await waitFor(() => s1.p.synced);
    s1.p.disconnect();
    const el = s1.doc.getXmlFragment('default').get(0) as Y.XmlElement;
    const t = new Y.XmlText();
    el.insert(0, [t]);
    t.insert(0, 'не потеряется');
    s1.p.flush();
    expect(persisted.size).toBe(1);
    s1.p.destroy();
    void tmp;
    // Session 2: a fresh document restores pending ops and syncs them.
    const s2 = mk();
    await s2.p.connect();
    await waitFor(() => s2.p.status === 'saved', 5000, 'saved after restart');
    expect(persisted.size).toBe(0);
    expect(await serverText(pageId)).toBe('не потеряется');
    s2.p.destroy();
  });

  it('server restart during a session loses no acknowledged change and resends the rest (OPS-009, V17-F04, R-COLLAB-047, R-COLLAB-050, UX13-15)', async () => {
    const dbName = new URL(ts.dbUrl).pathname.slice(1);
    const second = await startServer({}, { dbName });
    const pageId = await newPage();
    const a = await openClient(second.url, org.owner, pageId);
    a.insert(0, 0, 'до перезапуска');
    await a.waitSaved();
    await second.srv.app.close(); // graceful: flushes documents, closes sockets
    a.insert(0, 0, '[офлайн] ');
    a.provider.flush();
    expect(a.provider.status).toBe('local');
    // the same database keeps serving through the first server
    a.provider.disconnect();
    (a.provider as any).opts.url = ts.url.replace('http', 'ws') + '/api/v1/collab/' + pageId;
    await a.provider.connect();
    await a.waitSaved();
    expect(await serverText(pageId)).toBe('[офлайн] до перезапуска');
    a.close();
    await second.srv.services.db.end().catch(() => undefined);
  });
});

describe('permissions in live sessions', () => {
  it('read-only user cannot write; revoking edit switches session to read-only; revoking view closes it (AT-78, COLLAB-196, E2E-105, ACL-168, SC-32, OPS-008, V15-A08, R-ACL-083)', async () => {
    const pageId = await newPage();
    const u = await org.user('Живой редактор');
    const grant = (await org.owner.put('/api/v1/grants', { resourceType: 'page', resourceId: pageId, subjectType: 'user', subjectId: u.id, level: 'edit' })).grant;
    const c = await openClient(ts.url, u, pageId);
    expect(c.provider.canEdit).toBe(true);
    c.insert(0, 0, 'моя правка');
    await c.waitSaved();
    // Downgrade to view
    await org.owner.put('/api/v1/grants', { resourceType: 'page', resourceId: pageId, subjectType: 'user', subjectId: u.id, level: 'view' });
    await waitFor(() => c.provider.canEdit === false, 5000, 'read-only');
    c.insert(0, 0, 'запрещено ');
    c.provider.flush();
    await new Promise((r) => setTimeout(r, 200));
    expect(await serverText(pageId)).toBe('моя правка');
    expect(c.provider.unsyncedUpdates().length).toBeGreaterThan(0); // local copy retained for export
    // Revoke completely: the org grant on the general space still gives view, so deny explicitly.
    void grant;
    await org.owner.put('/api/v1/grants', { resourceType: 'page', resourceId: pageId, subjectType: 'user', subjectId: u.id, level: 'none' });
    await waitFor(() => c.provider.status === 'error', 5000, 'closed');
    c.close();
  });

  it('suspending a user closes their live sessions (ACL-157, R-AUTH-002)', async () => {
    const pageId = await newPage();
    const u = await org.user('Будет приостановлен');
    await org.owner.put('/api/v1/grants', { resourceType: 'page', resourceId: pageId, subjectType: 'user', subjectId: u.id, level: 'edit' });
    const c = await openClient(ts.url, u, pageId);
    await org.owner.post(`/api/v1/admin/users/${u.id}/status`, { status: 'suspended', reason: 'test' });
    await waitFor(() => c.provider.status === 'error' || c.provider.status === 'local', 5000, 'session closed');
    c.close();
  });

  it('trashing a page stops accepting edits and tells editors (UX: page deleted)', async () => {
    const pageId = await newPage();
    const c = await openClient(ts.url, org.owner, pageId);
    await org.owner.del(`/api/v1/pages/${pageId}`);
    await waitFor(() => c.provider.status === 'error', 5000, 'deleted');
    c.close();
  });
});

describe('server-side validation', () => {
  it('rejects schema-invalid updates and keeps the document valid (R-COLLAB-020, R-COLLAB-031)', async () => {
    const pageId = await newPage();
    const c = await openClient(ts.url, org.owner, pageId);
    c.insert(0, 0, 'валидно');
    await c.waitSaved();
    // A table without rows is not allowed by the schema.
    c.doc.getXmlFragment('default').push([new Y.XmlElement('table')]);
    c.provider.flush();
    await waitFor(() => c.fatal.includes('invalid_update'), 5000, 'nack');
    const content = await org.owner.get(`/api/v1/pages/${pageId}/content`);
    expect(content.content.content.map((b: any) => b.type)).toEqual(['paragraph']);
    c.close();
  });
});

describe('history: revisions, restore, journal', () => {
  it('restoring a revision creates a new revision and keeps concurrent edits (HIST-189, COLLAB-197, SC-28, S11, R-HISTORY-004, R-HISTORY-007, UX21-201, OPS-010, R-HISTORY-034)', async () => {
    const pageId = await newPage('История');
    const a = await openClient(ts.url, org.owner, pageId);
    a.insert(0, 0, 'Версия один');
    await a.waitSaved();
    const v1 = (await org.owner.post(`/api/v1/pages/${pageId}/revisions`, { label: 'v1' })).revision;
    a.deleteText(0, 0, 11);
    a.insert(0, 0, 'Версия два');
    a.appendParagraph('Добавлено позже');
    await a.waitSaved();
    const b = await openClient(ts.url, org.owner, pageId);
    await waitFor(() => b.text() === a.text());
    const diff = await org.owner.get(`/api/v1/pages/${pageId}/revisions/${v1.id}/diff?against=current`);
    expect(diff.stats.added + diff.stats.changed).toBeGreaterThan(0);
    const before = (await org.owner.get(`/api/v1/pages/${pageId}/revisions`)).revisions.length;
    const r = await org.owner.post(`/api/v1/pages/${pageId}/revisions/${v1.id}/restore`);
    expect(r.revision.number).toBeGreaterThan(v1.number);
    await waitFor(() => a.text() === 'Версия один' && b.text() === 'Версия один', 5000, 'restore propagated');
    const revs = (await org.owner.get(`/api/v1/pages/${pageId}/revisions`)).revisions;
    expect(revs.length).toBe(before + 2); // pre-restore + restore
    expect(revs.some((x: any) => x.kind === 'pre-restore')).toBe(true);
    // The restore itself is reversible: restore the pre-restore snapshot.
    const pre = revs.find((x: any) => x.kind === 'pre-restore');
    await org.owner.post(`/api/v1/pages/${pageId}/revisions/${pre.id}/restore`);
    await waitFor(() => a.text() === 'Версия два\nДобавлено позже', 5000, 'undo restore');
    a.close();
    b.close();
  });

  it('restores a single deleted block from a revision (R-HISTORY-003, R-HISTORY-013)', async () => {
    const pageId = await newPage();
    const a = await openClient(ts.url, org.owner, pageId);
    a.insert(0, 0, 'остаётся');
    a.appendParagraph('будет удалён');
    a.appendParagraph('хвост');
    await a.waitSaved();
    const rev = (await org.owner.post(`/api/v1/pages/${pageId}/revisions`, {})).revision;
    const full = await org.owner.get(`/api/v1/pages/${pageId}/revisions/${rev.id}`);
    const blockId = full.revision.content.content[1].attrs.id;
    a.removeBlock(1);
    await a.waitSaved();
    await waitFor(() => a.text() === 'остаётся\nхвост');
    const res = await org.owner.post(`/api/v1/pages/${pageId}/revisions/${rev.id}/restore-block`, { blockId });
    expect(res.mode).toBe('inserted');
    await waitFor(() => a.text() === 'остаётся\nбудет удалён\nхвост', 5000, 'block restored');
    a.close();
  });

  it('records a journal of edit operations grouped per author (HIST-187, R-HISTORY-023, R-HISTORY-024)', async () => {
    const pageId = await newPage();
    const a = await openClient(ts.url, org.owner, pageId);
    for (const ch of 'журнал') a.insert(0, 0, ch);
    await a.waitSaved();
    await ts.srv.services.hub.flushPage(pageId);
    const ev = await org.owner.get(`/api/v1/pages/${pageId}/events`);
    const edits = ev.events.filter((e: any) => e.type === 'edit');
    expect(edits.length).toBe(1); // one logical group, not one per keystroke
    expect(edits[0].actor_name).toBe(org.owner.user.name);
    expect(ev.events.some((e: any) => e.type === 'created')).toBe(true);
    a.close();
  });

  it('title is edited collaboratively and synced to the tree (R-PAGE-019)', async () => {
    const pageId = await newPage('Старое название');
    const a = await openClient(ts.url, org.owner, pageId);
    expect(a.doc.getText('title').toString()).toBe('Старое название');
    await org.owner.patch(`/api/v1/pages/${pageId}`, { title: 'Новое название' });
    await waitFor(() => a.doc.getText('title').toString() === 'Новое название', 5000, 'title');
    const t = a.doc.getText('title');
    t.insert(t.length, '!');
    await a.waitSaved();
    await ts.srv.services.hub.flushPage(pageId);
    const p = await org.owner.get(`/api/v1/pages/${pageId}`);
    expect(p.page.title).toBe('Новое название!');
    a.close();
  });
});

describe('randomised convergence (COLLAB-198, R-COLLAB-008, R-COLLAB-030, R-COLLAB-044, property-based)', () => {
  it('random concurrent edits with random disconnects converge to the server state', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({ client: fc.integer({ min: 0, max: 2 }), op: fc.constantFrom('ins', 'del', 'para', 'toggle'), pos: fc.nat(50), text: fc.stringMatching(/^[а-яa-z]{1,5}$/) }),
          { minLength: 5, maxLength: 30 },
        ),
        async (ops) => {
          const pageId = await newPage('fuzz');
          const clients = await Promise.all([0, 1, 2].map(() => openClient(ts.url, org.owner, pageId)));
          for (const o of ops) {
            const c = clients[o.client];
            const frag = c.doc.getXmlFragment('default');
            const blocks = frag.length;
            if (o.op === 'toggle') {
              if (c.provider.status === 'local' || !c.provider.synced) await c.provider.connect();
              else c.provider.disconnect();
              continue;
            }
            if (o.op === 'para') {
              c.appendParagraph(o.text);
              continue;
            }
            const bi = o.pos % blocks;
            const len = c.text().split('\n')[bi]?.length ?? 0;
            if (o.op === 'ins') c.insert(bi, len ? o.pos % (len + 1) : 0, o.text);
            else if (len > 0) c.deleteText(bi, o.pos % len, Math.min(2, len - (o.pos % len)));
          }
          for (const c of clients) if (!c.provider.synced) await c.provider.connect();
          await Promise.all(clients.map((c) => c.waitSaved(8000)));
          await waitFor(() => clients.every((c) => c.text() === clients[0].text()), 8000, 'convergence');
          expect(await serverText(pageId)).toBe(clients[0].text());
          clients.forEach((c) => c.close());
        },
      ),
      { numRuns: 15 },
    );
  });
});

describe('access to the live channel', () => {
  it('a user without access cannot open the live channel (S03/E2E-105)', async () => {
    const u = await org.user('Посторонний');
    const me = await org.owner.get('/api/v1/auth/me');
    const priv = (await org.owner.post('/api/v1/pages', { spaceId: me.personalSpaceId, title: 'Приватная' })).page.id;
    const c = await openClient(ts.url, u, priv);
    await waitFor(() => c.provider.status === 'error', 5000, 'rejected');
    expect(c.fatal).toContain('not_found');
    c.close();
    await expectStatus(u.get(`/api/v1/pages/${priv}/content`), 404);
  });
});
