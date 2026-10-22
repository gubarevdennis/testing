/**
 * P0 collaboration scenarios: HTTP fallback channel, many editors, tables, block moves, session expiry,
 * sleeping laptop, unreliable network.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as Y from 'yjs';
import WebSocket from 'ws';
import { CollabProvider } from '@kb/shared';
import { startServer, setupOrg, expectStatus, type TestServer } from '../support/harness.js';
import { openClient, waitFor, type TestClient } from '../support/collab.js';

let ts: TestServer;
let org: Awaited<ReturnType<typeof setupOrg>>;

beforeAll(async () => {
  ts = await startServer();
  org = await setupOrg(ts);
});
afterAll(async () => ts?.close());

async function newPage(title = 'P0 документ') {
  return (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title })).page.id as string;
}

/** Plain text of every block (tables included), one line per textblock. */
function deepText(el: Y.XmlFragment | Y.XmlElement): string[] {
  const out: string[] = [];
  for (const c of el.toArray()) {
    if (c instanceof Y.XmlText) continue;
    const e = c as Y.XmlElement;
    const kids = e.toArray();
    if (kids.every((x) => x instanceof Y.XmlText)) out.push((kids as Y.XmlText[]).map((t) => t.toString().replace(/<[^>]+>/g, '')).join(''));
    else out.push(...deepText(e));
  }
  return out;
}
const textOf = (c: TestClient) => deepText(c.doc.getXmlFragment('default')).join('\n');

async function serverLines(pageId: string): Promise<string[]> {
  await ts.srv.services.hub.flushPage(pageId);
  const c = await org.owner.get(`/api/v1/pages/${pageId}/content`);
  const walk = (n: any): string[] => (n.content ?? []).flatMap((b: any) => (!b.content || b.content.every((x: any) => x.type === 'text') ? [(b.content ?? []).map((t: any) => t.text ?? '').join('')] : walk(b)));
  return walk(c.content);
}

function para(text: string, id = globalThis.crypto.randomUUID()) {
  const p = new Y.XmlElement('paragraph');
  p.setAttribute('id', id);
  const t = new Y.XmlText();
  t.insert(0, text);
  p.insert(0, [t]);
  return p;
}

function row(cells: string[]) {
  const r = new Y.XmlElement('tableRow');
  r.insert(
    0,
    cells.map((txt) => {
      const c = new Y.XmlElement('tableCell');
      c.insert(0, [para(txt)]);
      return c;
    }),
  );
  return r;
}

function table(rows: string[][]) {
  const t = new Y.XmlElement('table');
  t.setAttribute('id', globalThis.crypto.randomUUID());
  t.insert(0, rows.map(row));
  return t;
}

/** The text of the paragraph inside cell (row, col) of the first table. */
function cellText(c: TestClient, row: number, col: number) {
  const tbl = c.doc
    .getXmlFragment('default')
    .toArray()
    .find((x) => x instanceof Y.XmlElement && x.nodeName === 'table') as Y.XmlElement;
  const cell = (tbl.get(row) as Y.XmlElement).get(col) as Y.XmlElement;
  return (cell.get(0) as Y.XmlElement).get(0) as Y.XmlText;
}

/** Moves a top-level block the way the editor binding does: delete + insert of a copy. */
function moveBlock(c: TestClient, from: number, to: number) {
  const frag = c.doc.getXmlFragment('default');
  c.doc.transact(() => {
    const el = frag.get(from) as Y.XmlElement;
    const copy = el.clone();
    frag.delete(from, 1);
    frag.insert(to, [copy]);
  });
}

async function editors(pageId: string, n: number, users: Awaited<ReturnType<typeof org.user>>[]) {
  const clients: TestClient[] = [];
  for (let i = 0; i < n; i++) clients.push(await openClient(ts.url, i === 0 ? org.owner : users[i % users.length], pageId));
  return clients;
}

describe('HTTP fallback channel (R-COLLAB-039)', () => {
  it('WebSocket blocked: the client switches to the HTTP channel, gets ACK only after commit and exchanges edits with WebSocket editors (R-COLLAB-039, R-COLLAB-019)', async () => {
    const pageId = await newPage();
    const ws = await openClient(ts.url, org.owner, pageId);
    const http = await openClient(ts.url, org.owner, pageId, { wsBlocked: true });
    expect(http.provider.transport).toBe('http');
    expect(http.provider.synced).toBe(true);
    const before = (await ts.db.query('select count(*)::int c from doc_updates where page_id = $1', [pageId])).rows[0].c;
    http.insert(0, 0, 'через HTTPS');
    expect(http.provider.status).not.toBe('saved');
    await http.waitSaved(10_000);
    expect((await ts.db.query('select count(*)::int c from doc_updates where page_id = $1', [pageId])).rows[0].c).toBeGreaterThan(before);
    await waitFor(() => textOf(ws) === 'через HTTPS', 10_000, 'ws client receives');
    ws.appendParagraph('по WebSocket');
    await ws.waitSaved();
    await waitFor(() => textOf(http) === 'через HTTPS\nпо WebSocket', 10_000, 'http client receives');
    // offline on the fallback channel and back: queued edits are delivered exactly once
    http.provider.disconnect();
    http.insert(0, 0, '[офлайн] ');
    http.provider.flush();
    expect(http.provider.status).toBe('local');
    await http.provider.connect();
    await http.waitSaved(10_000);
    await waitFor(() => textOf(ws) === textOf(http), 10_000, 'convergence');
    expect(await serverLines(pageId)).toEqual(['[офлайн] через HTTPS', 'по WebSocket']);
    http.close();
    ws.close();
  });

  it('the HTTP channel enforces the same access rules: no session → 401, foreign tunnel → 404, reader cannot write', async () => {
    const pageId = await newPage();
    const reader = await org.user('Читатель HTTP', { pageGrants: [{ pageId, level: 'view' }] });
    const outsider = await org.user('Чужой HTTP');
    const anon = new (org.owner.constructor as any)(ts.url);
    await expectStatus(anon.post(`/api/v1/collab/${pageId}/tunnel`, {}), 401);
    const { id } = await reader.post(`/api/v1/collab/${pageId}/tunnel`, {});
    await expectStatus(outsider.get(`/api/v1/collab/tunnel/${id}/poll?after=0`), 404);
    const r = await openClient(ts.url, reader, pageId, { wsBlocked: true });
    expect(r.provider.transport).toBe('http');
    expect(r.provider.canEdit).toBe(false);
    r.insert(0, 0, 'нельзя');
    r.provider.flush();
    await new Promise((res) => setTimeout(res, 300));
    expect(await serverLines(pageId)).toEqual(['']);
    r.close();
    // no access at all (owner's personal page): the channel reports "not found" and closes
    const denied = await openClient(ts.url, outsider, (await org.owner.post('/api/v1/pages', { spaceId: org.personalSpaceId, title: 'Личное' })).page.id, { wsBlocked: true });
    await waitFor(() => denied.provider.status === 'error', 10_000, 'denied');
    denied.close();
  });
});

describe('many editors, tables, moves (QA26-19, AT-56, SC-25, R-COLLAB-024, R-COLLAB-032)', () => {
  it('2, 5 and 20 editors type into one paragraph at the same time: every character survives and all replicas are identical (QA26-19)', async () => {
    const users = [await org.user('Редактор 1'), await org.user('Редактор 2'), await org.user('Редактор 3'), await org.user('Редактор 4')];
    for (const n of [2, 5, 20]) {
      const pageId = await newPage('Редакторов: ' + n);
      for (const u of users) await org.owner.put('/api/v1/grants', { resourceType: 'page', resourceId: pageId, subjectType: 'user', subjectId: u.id, level: 'edit' });
      const cs = await editors(pageId, n, users);
      // every editor types 3 bursts into the same paragraph, interleaved
      for (let round = 0; round < 3; round++) cs.forEach((c, i) => c.insert(0, 0, `[${i}.${round}]`));
      await Promise.all(cs.map((c) => c.waitSaved(20_000)));
      await waitFor(() => cs.every((c) => textOf(c) === textOf(cs[0])), 20_000, `convergence of ${n}`);
      const text = textOf(cs[0]);
      for (let i = 0; i < n; i++) for (let round = 0; round < 3; round++) expect(text).toContain(`[${i}.${round}]`);
      expect(text.length).toBe(cs.reduce((s, _c, i) => s + 3 * `[${i}.0]`.length, 0));
      expect((await serverLines(pageId)).join('\n')).toBe(text);
      cs.forEach((c) => c.close());
    }
  });

  it('two editors change one table cell and neighbouring rows while a third adds a row; the merged table is valid and loses nothing (AT-56, SC-25, R-COLLAB-024, QA26-19, ROUTE-05)', async () => {
    const pageId = await newPage('Таблица');
    const u = await org.user('Табличный соавтор', {});
    await org.owner.put('/api/v1/grants', { resourceType: 'page', resourceId: pageId, subjectType: 'user', subjectId: u.id, level: 'edit' });
    const a = await openClient(ts.url, org.owner, pageId);
    a.doc.transact(() => {
      a.doc.getXmlFragment('default').delete(0, 1);
      a.doc.getXmlFragment('default').push([para('Перед таблицей'), table([['A1', 'B1'], ['A2', 'B2'], ['A3', 'B3']])]);
    });
    await a.waitSaved();
    const b = await openClient(ts.url, u, pageId);
    const c = await openClient(ts.url, org.owner, pageId);
    await waitFor(() => textOf(b) === textOf(a) && textOf(c) === textOf(a), 5000, 'initial');
    // b loses the connection while everybody edits
    b.provider.disconnect();
    cellText(a, 0, 0).insert(2, ' правка-A');
    cellText(b, 0, 0).insert(2, ' правка-B');
    cellText(a, 1, 1).insert(2, ' строка2-A');
    cellText(b, 2, 0).insert(2, ' строка3-B');
    const tblC = c.doc.getXmlFragment('default').get(1) as Y.XmlElement;
    tblC.insert(3, [row(['A4', 'B4'])]);
    await Promise.all([a.waitSaved(), c.waitSaved()]);
    b.provider.flush();
    expect(b.provider.status).toBe('local');
    await b.provider.connect();
    await b.waitSaved();
    await waitFor(() => textOf(a) === textOf(b) && textOf(b) === textOf(c), 10_000, 'convergence');
    const lines = await serverLines(pageId);
    expect(lines.join('\n')).toBe(textOf(a));
    const cell = lines.find((l) => l.startsWith('A1'))!;
    expect(cell).toContain('правка-A');
    expect(cell).toContain('правка-B');
    expect(lines).toContain('B2 строка2-A');
    expect(lines).toContain('A3 строка3-B');
    expect(lines).toContain('A4');
    // schema-valid: the server accepted every step (no NACK), the table has 4 rows of 2 cells
    expect([a, b, c].flatMap((x) => x.fatal)).toEqual([]);
    const content = (await org.owner.get(`/api/v1/pages/${pageId}/content`)).content;
    const tbl = content.content.find((n: any) => n.type === 'table');
    expect(tbl.content.map((r: any) => r.content.length)).toEqual([2, 2, 2, 2]);
    [a, b, c].forEach((x) => x.close());
  });

  it('table deleted while another editor adds a row: the result is a valid document, never an orphan row (R-COLLAB-032, R-COLLAB-024)', async () => {
    const pageId = await newPage('Удаление таблицы');
    const a = await openClient(ts.url, org.owner, pageId);
    a.doc.transact(() => a.doc.getXmlFragment('default').push([table([['x', 'y']])]));
    await a.waitSaved();
    const b = await openClient(ts.url, org.owner, pageId);
    await waitFor(() => textOf(b) === textOf(a));
    b.provider.disconnect();
    a.doc.getXmlFragment('default').delete(1, 1);
    (b.doc.getXmlFragment('default').get(1) as Y.XmlElement).push([row(['новая строка', ''])]);
    await a.waitSaved();
    await b.provider.connect();
    await b.waitSaved();
    await waitFor(() => textOf(a) === textOf(b), 5000, 'convergence');
    const content = (await org.owner.get(`/api/v1/pages/${pageId}/content`)).content;
    expect(content.content.some((n: any) => n.type === 'tableRow')).toBe(false);
    expect(b.fatal).toEqual([]);
    a.close();
    b.close();
  });

  it('format + delete, block copy + edit and concurrent block moves converge without duplicates of text or lost characters (R-COLLAB-032, R-COLLAB-021, R-COLLAB-009, R-COLLAB-024, COLLAB-193)', async () => {
    const pageId = await newPage('Перемещения');
    const a = await openClient(ts.url, org.owner, pageId);
    a.doc.transact(() => {
      a.doc.getXmlFragment('default').delete(0, 1);
      a.doc.getXmlFragment('default').push(['один', 'два', 'три', 'четыре'].map((t) => para(t)));
    });
    await a.waitSaved();
    const b = await openClient(ts.url, org.owner, pageId);
    await waitFor(() => textOf(b) === textOf(a));

    // concurrent moves of different blocks
    b.provider.disconnect();
    moveBlock(a, 0, 3); // "один" to the end
    moveBlock(b, 3, 0); // "четыре" to the top
    await a.waitSaved();
    await b.provider.connect();
    await b.waitSaved();
    await waitFor(() => textOf(a) === textOf(b), 5000, 'moves converge');
    expect(textOf(a).split('\n').sort()).toEqual(['два', 'один', 'три', 'четыре']);

    // copy a block while the other edits the original: both versions present, the edit is in the original
    b.provider.disconnect();
    const frag = a.doc.getXmlFragment('default');
    const idxTwo = textOf(a).split('\n').indexOf('два');
    const dup = (frag.get(idxTwo) as Y.XmlElement).clone();
    dup.setAttribute('id', globalThis.crypto.randomUUID());
    frag.insert(idxTwo + 1, [dup]);
    const idxTwoB = textOf(b).split('\n').indexOf('два');
    b.insert(idxTwoB, 3, ' (правка)');
    await a.waitSaved();
    await b.provider.connect();
    await b.waitSaved();
    await waitFor(() => textOf(a) === textOf(b), 5000, 'copy converges');
    expect(textOf(a)).toContain('два (правка)');
    expect(textOf(a).split('\n').filter((l) => l.startsWith('два'))).toHaveLength(2);

    // formatting on one side, deletion of the formatted text on the other: no resurrected or doubled text
    b.provider.disconnect();
    const i3 = textOf(a).split('\n').indexOf('три');
    ((frag.get(i3) as Y.XmlElement).get(0) as Y.XmlText).format(0, 3, { bold: {} });
    const i3b = textOf(b).split('\n').indexOf('три');
    b.deleteText(i3b, 0, 3);
    await a.waitSaved();
    await b.provider.connect();
    await b.waitSaved();
    await waitFor(() => textOf(a) === textOf(b), 5000, 'format/delete converge');
    expect(textOf(a).split('\n')).toContain('');
    expect(textOf(a)).not.toContain('три');
    expect([a, b].flatMap((x) => x.fatal)).toEqual([]);
    expect((await serverLines(pageId)).join('\n')).toBe(textOf(a));
    a.close();
    b.close();
  });

  it('the same user on two devices edits offline on both; nothing is lost or doubled (R-COLLAB-032, UX23-216)', async () => {
    const pageId = await newPage('Два устройства');
    const laptop = await openClient(ts.url, org.owner, pageId);
    laptop.insert(0, 0, 'общий');
    await laptop.waitSaved();
    const phone = await openClient(ts.url, org.owner, pageId);
    await waitFor(() => textOf(phone) === 'общий');
    laptop.provider.disconnect();
    phone.provider.disconnect();
    laptop.insert(0, 5, ' с ноутбука');
    phone.appendParagraph('с телефона');
    laptop.provider.flush();
    phone.provider.flush();
    await Promise.all([laptop.provider.connect(), phone.provider.connect()]);
    await Promise.all([laptop.waitSaved(), phone.waitSaved()]);
    await waitFor(() => textOf(laptop) === textOf(phone), 5000, 'convergence');
    expect(textOf(laptop)).toBe('общий с ноутбука\nс телефона');
    expect(await serverLines(pageId)).toEqual(['общий с ноутбука', 'с телефона']);
    laptop.close();
    phone.close();
  });
});

describe('session expiry, sleep, unreliable network (R-COLLAB-021, QA26-20)', () => {
  it('session expires during editing: unsent edits are never shown as saved and are delivered after signing in again (R-COLLAB-021, QA26-20)', async () => {
    const pageId = await newPage('Истечение сеанса');
    const u = await org.user('Сеанс истекает', { pageGrants: [{ pageId, level: 'edit' }] });
    const persisted = new Map<string, { update: Uint8Array; ts: number }>();
    const store = {
      load: async () => [...persisted].map(([opId, v]) => ({ opId, ...v })),
      put: async (opId: string, update: Uint8Array, ts: number) => void persisted.set(opId, { update, ts }),
      remove: async (ids: string[]) => ids.forEach((i) => persisted.delete(i)),
    };
    const mk = () => {
      const doc = new Y.Doc();
      const p = new CollabProvider({ url: ts.url.replace('http', 'ws') + '/api/v1/collab/' + pageId, doc, WebSocketImpl: WebSocket, wsOptions: { headers: { cookie: u.cookieHeader() } }, pendingStore: store, batchMs: 1, backoff: { minMs: 50, maxMs: 200 } });
      return { doc, p };
    };
    const s1 = mk();
    await s1.p.connect();
    await waitFor(() => s1.p.synced);
    await ts.db.query(`update sessions set expires_at = now() + interval '300 milliseconds' where user_id = $1`, [u.id]);
    await new Promise((r) => setTimeout(r, 400));
    await ts.srv.services.hub.checkExpirations();
    await waitFor(() => !s1.p.synced, 5000, 'session closed');
    const el = s1.doc.getXmlFragment('default').get(0) as Y.XmlElement;
    const t = new Y.XmlText();
    el.insert(0, [t]);
    t.insert(0, 'после истечения');
    s1.p.flush();
    await new Promise((r) => setTimeout(r, 50));
    expect(s1.p.status).toBe('local');
    expect(persisted.size).toBe(1);
    s1.p.destroy();
    // signs in again (new cookie), the page is reopened: the queue is delivered under the user's own name
    await u.login(u.email, u.password);
    const s2 = mk();
    await s2.p.connect();
    await waitFor(() => s2.p.status === 'saved', 5000, 'saved after re-login');
    expect(await serverLines(pageId)).toEqual(['после истечения']);
    const author = (await ts.db.query('select user_id from doc_updates where page_id = $1 order by seq desc limit 1', [pageId])).rows[0].user_id;
    expect(author).toBe(u.id);
    s2.p.destroy();
  });

  it('sleeping laptop: a silently dead connection is detected by the acknowledgement timeout, edits are re-sent once and converge (R-COLLAB-021, QA26-20, R-OFFLINE-010)', async () => {
    const pageId = await newPage('Сон');
    const a = await openClient(ts.url, org.owner, pageId);
    const b = await openClient(ts.url, org.owner, pageId);
    a.insert(0, 0, 'до сна');
    await a.waitSaved();
    await waitFor(() => textOf(b) === 'до сна');
    // the laptop "sleeps": its socket looks open but nothing passes any more
    const dead = (a.provider as any).ws;
    dead.send = () => undefined;
    dead.onmessage = () => undefined;
    b.appendParagraph('пока ноутбук спал');
    await b.waitSaved();
    a.insert(0, 6, ' и после');
    a.provider.flush();
    expect(a.provider.status).not.toBe('saved');
    await waitFor(() => a.provider.status === 'saved', 15_000, 'resent after ack timeout');
    await waitFor(() => textOf(a) === textOf(b), 5000, 'convergence');
    expect(await serverLines(pageId)).toEqual(['до сна и после', 'пока ноутбук спал']);
    a.close();
    b.close();
  });

  it('high latency, jitter and dropped connections: random edits of three editors converge with 0 losses and 0 duplicates (QA26-20, R-COLLAB-019)', async () => {
    const pageId = await newPage('Плохая сеть');
    /** WebSocket with 50–250 ms latency in both directions (order kept) that sometimes drops the connection. */
    class LossyWebSocket extends WebSocket {
      private q = Promise.resolve();
      override send(data: any) {
        const delay = 50 + Math.random() * 200;
        this.q = this.q.then(() => new Promise((r) => setTimeout(r, delay))).then(() => {
          if (this.readyState === 1) super.send(data);
          if (Math.random() < 0.04) this.terminate(); // connection lost mid-flight
        });
      }
    }
    const mk = async () => {
      const c = await openClient(ts.url, org.owner, pageId, { providerOptions: { WebSocketImpl: LossyWebSocket } });
      return c;
    };
    const cs = [await mk(), await mk(), await mk()];
    const tokens: string[] = [];
    for (let step = 0; step < 60; step++) {
      const i = step % 3;
      const tok = `{${i}:${step}}`;
      tokens.push(tok);
      cs[i].insert(0, 0, tok);
      await new Promise((r) => setTimeout(r, 15));
    }
    await Promise.all(cs.map((c) => c.waitSaved(60_000)));
    await waitFor(() => cs.every((c) => textOf(c) === textOf(cs[0])), 30_000, 'convergence');
    const text = textOf(cs[0]);
    for (const tok of tokens) expect(text.split(tok).length - 1).toBe(1);
    expect(text.length).toBe(tokens.join('').length);
    expect((await serverLines(pageId)).join('\n')).toBe(text);
    cs.forEach((c) => c.close());
  }, 120_000);
});
