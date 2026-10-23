// R-SEARCH-018: private materials never reach shared indexes or other people's notifications.
// The search index is one physical table; every read path (full-text search with snippets/counts/"did you mean",
// quick switcher, home and recent lists, notifications, the events WebSocket) filters by the reader's rights
// before building a response. These tests probe each path as a colleague who has no access.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
import { startServer, setupOrg, expectStatus, type TestServer } from '../support/harness.js';
import { indexPage } from '../../apps/server/src/jobs/worker.js';
import { replaceContent } from '../../apps/server/src/collab/ydoc.js';

let ts: TestServer;
let org: Awaited<ReturnType<typeof setupOrg>>;

beforeAll(async () => {
  ts = await startServer();
  org = await setupOrg(ts);
}, 120_000);
afterAll(async () => ts?.close());

const SECRET = 'квазарномер';
const para = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });

async function privatePage(owner: Awaited<ReturnType<typeof org.user>>, title: string, body: string) {
  const me = await owner.get('/api/v1/auth/me');
  const page = (await owner.post('/api/v1/pages', { spaceId: me.personalSpaceId, title })).page;
  await ts.srv.services.hub.applyServerChange(page.id, null, (doc) => replaceContent(doc, { type: 'doc', content: [para(body)] }));
  await ts.srv.services.hub.flushPage(page.id);
  return page;
}

async function reindex(id: string) {
  // The worker indexes asynchronously; doing it here makes the test deterministic.
  await ts.srv.services.hub.flushPage(id);
  await indexPage(ts.db, id, ts.srv.services.store);
}

describe('private materials stay out of shared indexes and notifications (R-SEARCH-018)', () => {
  it('R-SEARCH-018: a personal page (title, text, comment, file name) is found by its author and by nobody else — results, counts, snippets, «did you mean», quick switcher, home, recent', async () => {
    const author = await org.user('Автор личного');
    const colleague = await org.user('Любопытный коллега');
    const page = await privatePage(author, `План ${SECRET} личный`, `Внутренний текст ${SECRET}овый и зарплата`);
    await author.post(`/api/v1/pages/${page.id}/comments`, { text: `Комментарий про ${SECRET}` });
    const fd = new FormData();
    fd.append('pageId', page.id);
    fd.append('file', new Blob([Buffer.from('x')], { type: 'text/plain' }), `${SECRET}-вложение.txt`);
    await author.req('POST', '/api/v1/attachments', fd);
    await reindex(page.id);
    // The index row exists (one physical table) …
    expect((await ts.db.query('select count(*)::int c from search_index where page_id = $1', [page.id])).rows[0].c).toBe(1);

    // … the author finds the page by every field.
    const own = await author.get(`/api/v1/search?q=${encodeURIComponent(SECRET)}`);
    expect(own.results.map((r: any) => r.pageId)).toContain(page.id);
    for (const scope of ['text', 'files']) expect((await author.get(`/api/v1/search?q=${encodeURIComponent(SECRET)}&in=${scope}`)).results.map((r: any) => r.pageId)).toContain(page.id);

    // … a colleague finds nothing anywhere, and nothing in the response hints at it.
    const queries = [SECRET, `${SECRET} личный`, 'зарплата', `${SECRET}-вложение`, 'План'];
    for (const q of queries) {
      for (const scope of ['all', 'text', 'files', 'images']) {
        const r = await colleague.get(`/api/v1/search?q=${encodeURIComponent(q)}&in=${scope}`);
        expect(r.results.map((x: any) => x.pageId), `${q}/${scope}`).not.toContain(page.id);
        // Nothing of the page beyond what the colleague typed comes back (the query itself is echoed in `variants`).
        for (const leak of [page.id, 'Внутренний', 'зарплата', 'личный', 'Комментарий про', '-вложение']) if (!q.includes(leak)) expect(JSON.stringify(r), `${q}/${scope}`).not.toContain(leak);
        if (q === SECRET) expect(r.total).toBe(0);
      }
    }
    // A typo would be "corrected" to the private title word if suggestions were built from the whole index.
    const typo = await colleague.get(`/api/v1/search?q=${encodeURIComponent('квазарномр')}`);
    expect(typo.total).toBe(0);
    expect(typo.didYouMean ?? '').not.toContain(SECRET);
    const ownTypo = await author.get(`/api/v1/search?q=${encodeURIComponent('квазарномр')}`);
    expect(ownTypo.didYouMean ?? ownTypo.results?.[0]?.title ?? '').toContain(SECRET); // control: suggestions work for the author
    // Searching inside the author's personal space by id gives nothing either.
    const me = await author.get('/api/v1/auth/me');
    expect((await colleague.get(`/api/v1/search?q=${encodeURIComponent(SECRET)}&spaceId=${me.personalSpaceId}`)).results).toEqual([]);
    expect((await colleague.get(`/api/v1/search/suggest?q=${encodeURIComponent(SECRET)}`)).suggestions).toEqual([]);
    expect(JSON.stringify(await colleague.get(`/api/v1/search/suggest?q=${encodeURIComponent('План ' + SECRET)}`))).not.toContain(page.id);
    expect(JSON.stringify(await colleague.get('/api/v1/me/home'))).not.toContain(page.id);
    expect(JSON.stringify(await colleague.get('/api/v1/me/recent'))).not.toContain(page.id);
    expect(JSON.stringify(await colleague.get('/api/v1/directory').catch(() => ({})))).not.toContain(SECRET);
    // Not even the organisation owner sees another person's personal page in search (no implicit admin access).
    expect((await org.owner.get(`/api/v1/search?q=${encodeURIComponent(SECRET)}`)).results.map((r: any) => r.pageId)).not.toContain(page.id);
  });

  it('R-SEARCH-018: a page made private in a shared space («Только я») disappears from colleagues\' search; restricting a parent hides the children', async () => {
    const author = org.owner; // employees only read the organisation-wide space
    const reader = await org.user('Читатель общей');
    const parent = (await author.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Общий раздел пульсарум' })).page;
    const child = (await author.post('/api/v1/pages', { spaceId: org.generalSpaceId, parentId: parent.id, title: 'Подраздел пульсарум' })).page;
    await reindex(parent.id);
    await reindex(child.id);
    const found = async () => (await reader.get('/api/v1/search?q=' + encodeURIComponent('пульсарум'))).results.map((r: any) => r.pageId);
    expect(await found()).toEqual(expect.arrayContaining([parent.id, child.id]));
    await author.post(`/api/v1/pages/${parent.id}/access/only-me`, { confirm: true });
    expect(await found()).toEqual([]);
    expect((await reader.get('/api/v1/search/suggest?q=' + encodeURIComponent('пульсарум'))).suggestions).toEqual([]);
    expect((await author.get('/api/v1/search?q=' + encodeURIComponent('пульсарум'))).results.map((r: any) => r.pageId)).toEqual(expect.arrayContaining([parent.id, child.id]));
  });

  it('R-SEARCH-018: notifications — mentions, replies and review requests reach only people who can see the page; lost access hides earlier notifications', async () => {
    const author = await org.user('Автор с упоминаниями');
    const outsider = await org.user('Посторонний');
    const page = await privatePage(author, 'Личные заметки о сделке', 'Детали сделки');
    await author.post(`/api/v1/pages/${page.id}/comments`, { text: '@Посторонний посмотри сделку', mentions: [outsider.id] });
    const rows = async (uid: string) => (await ts.db.query('select type, page_id, data from notifications where user_id = $1', [uid])).rows;
    expect(await rows(outsider.id)).toEqual([]);
    // Review request to someone without access is refused up front; nothing is stored for them.
    const err = await expectStatus(author.post(`/api/v1/pages/${page.id}/submit-review`, { reviewerId: outsider.id, message: 'Сумма сделки 10 млн' }), 400);
    expect(err.error.message).toMatch(/нет доступа/);
    expect(await rows(outsider.id)).toEqual([]);
    // With access the notification arrives; after access is revoked it is no longer shown (title, excerpt).
    const g = (await author.put('/api/v1/grants', { resourceType: 'page', resourceId: page.id, subjectType: 'user', subjectId: outsider.id, level: 'view' })).grant;
    await author.post(`/api/v1/pages/${page.id}/comments`, { text: '@Посторонний теперь можно', mentions: [outsider.id] });
    await author.post(`/api/v1/pages/${page.id}/submit-review`, { reviewerId: outsider.id, message: 'Проверь' });
    const shown = await outsider.get('/api/v1/notifications');
    expect(shown.notifications.map((n: any) => n.type).sort()).toEqual(['mention', 'review_requested']);
    await author.del(`/api/v1/grants/${g.id}`);
    const after = await outsider.get('/api/v1/notifications');
    expect(after.notifications).toEqual([]);
    expect(after.unread).toBe(0);
    expect(JSON.stringify(after)).not.toContain('сделк');
  });

  it('R-SEARCH-018: the events WebSocket does not tell colleagues about changes of private pages', async () => {
    const author = await org.user('Автор событий');
    const colleague = await org.user('Слушатель событий');
    const page = await privatePage(author, 'Тихая страница', 'текст');
    const shared = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Шумная страница' })).page;
    const ws = new WebSocket(ts.url.replace(/^http/, 'ws') + '/api/v1/events', { headers: { cookie: colleague.cookieHeader(), origin: ts.url } });
    const got: any[] = [];
    ws.on('message', (m) => got.push(JSON.parse(String(m))));
    await new Promise((r) => ws.once('open', r));
    await new Promise((r) => setTimeout(r, 300));
    await author.patch(`/api/v1/pages/${page.id}`, { title: 'Тихая страница 2' });
    await author.post(`/api/v1/pages/${page.id}/comments`, { text: 'тихий комментарий' });
    await org.owner.patch(`/api/v1/pages/${shared.id}`, { title: 'Шумная страница 2' });
    for (let i = 0; i < 50 && !got.some((e) => e.pageId === shared.id); i++) await new Promise((r) => setTimeout(r, 100));
    ws.close();
    expect(got.some((e) => e.pageId === shared.id)).toBe(true); // control: events do flow
    expect(JSON.stringify(got)).not.toContain(page.id);
  });
});
