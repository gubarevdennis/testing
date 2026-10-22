import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startServer, setupOrg, expectStatus, type TestServer } from '../support/harness.js';
import { openClient, waitFor } from '../support/collab.js';

let ts: TestServer;
let org: Awaited<ReturnType<typeof setupOrg>>;

beforeAll(async () => {
  ts = await startServer({}, { worker: true });
  org = await setupOrg(ts);
}, 120_000);
afterAll(async () => ts?.close());

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const dept = async (name: string, kind: 'department' | 'group' = 'department') => (await org.owner.post('/api/v1/admin/groups', { name, kind })).group.id as string;

describe('time-based expiry in live sessions (R-ACL-038, V15-A07, ACL-156, R-ACL-063, R-ACL-003)', () => {
  it('an expiring edit grant downgrades an open editor to read-only without any client or admin action', async () => {
    const page = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Временная правка' })).page;
    const u = await org.user('Временный редактор');
    const g = (await org.owner.put('/api/v1/grants', { resourceType: 'page', resourceId: page.id, subjectType: 'user', subjectId: u.id, level: 'edit', expiresAt: new Date(Date.now() + 3600_000).toISOString() })).grant;
    const c = await openClient(ts.url, u, page.id);
    expect(c.provider.canEdit).toBe(true);
    await ts.db.query(`update grants set expires_at = now() + interval '300 milliseconds' where id = $1`, [g.id]);
    await sleep(500);
    await ts.srv.services.hub.checkExpirations(); // the periodic timer would do the same within a few seconds
    await waitFor(() => c.provider.canEdit === false, 5000, 'downgraded to read-only'); // org-wide view remains
    c.close();
  });

  it('an expiring view grant closes the live channel of a page the user can no longer see', async () => {
    const page = (await org.owner.post('/api/v1/pages', { spaceId: org.personalSpaceId, title: 'Временно видимая' })).page;
    const u = await org.user('Временный читатель');
    const g = (await org.owner.put('/api/v1/grants', { resourceType: 'page', resourceId: page.id, subjectType: 'user', subjectId: u.id, level: 'edit', expiresAt: new Date(Date.now() + 3600_000).toISOString() })).grant;
    const c = await openClient(ts.url, u, page.id);
    await ts.db.query(`update grants set expires_at = now() + interval '300 milliseconds' where id = $1`, [g.id]);
    await sleep(500);
    await ts.srv.services.hub.checkExpirations();
    await waitFor(() => c.provider.status === 'error', 5000, 'channel closed');
    c.close();
  });

  it('expiry of a temporary department membership is detected the same way (R-ACL-038)', async () => {
    const d = await dept('Временный отдел для проверки срока');
    const sp = (await org.owner.post('/api/v1/spaces', { name: 'Пространство временного отдела', kind: 'department', visibility: 'private', groups: [{ groupId: d, level: 'edit' }] })).space;
    const page = (await org.owner.post('/api/v1/pages', { spaceId: sp.id, title: 'Документ отдела' })).page;
    const u = await org.user('Временный участник');
    await org.owner.put(`/api/v1/admin/groups/${d}/members/${u.id}`, { role: 'member', expiresAt: new Date(Date.now() + 3600_000).toISOString() });
    const c = await openClient(ts.url, u, page.id);
    await ts.db.query(`update group_members set expires_at = now() + interval '300 milliseconds' where group_id = $1 and user_id = $2`, [d, u.id]);
    await sleep(500);
    await ts.srv.services.hub.checkExpirations();
    await waitFor(() => c.provider.status === 'error', 5000, 'channel closed');
    c.close();
  });
});

describe('stored exports re-check access at download (E-12, V16-S04, R-ACL-080, R-ACL-072)', () => {
  it('a finished export cannot be downloaded after access to its pages was revoked', async () => {
    const page = (await org.owner.post('/api/v1/pages', { spaceId: org.personalSpaceId, title: 'Экспортируемая' })).page;
    const u = await org.user('Экспортёр');
    const g = (await org.owner.put('/api/v1/grants', { resourceType: 'page', resourceId: page.id, subjectType: 'user', subjectId: u.id, level: 'view' })).grant;
    const { jobId } = await u.post('/api/v1/exports', { pageIds: [page.id], format: 'md', includeChildren: false });
    let st: any;
    for (let i = 0; i < 100; i++) {
      st = await u.get(`/api/v1/exports/${jobId}`);
      if (st.status === 'succeeded' || st.status === 'failed') break;
      await sleep(100);
    }
    expect(st.status).toBe('succeeded');
    const ok = await u.raw('GET', `/api/v1/exports/${jobId}/download`);
    expect(ok.status).toBe(200);
    await org.owner.del(`/api/v1/grants/${g.id}`);
    await expectStatus(u.get(`/api/v1/exports/${jobId}/download`), 403);
  });
});

describe('audit: private titles masked, denials logged (ROUTE-06, R-AUDIT-001, OPS-014)', () => {
  it('an auditor sees events about a private page but not its title', async () => {
    const author = await org.user('Автор секретов');
    const me = await author.get('/api/v1/auth/me');
    const p = (await author.post('/api/v1/pages', { spaceId: me.personalSpaceId, title: 'Секретный план слияния' })).page;
    const auditor = await org.user('Аудитор', { orgRole: 'auditor' });
    const log = await auditor.get(`/api/v1/audit?targetId=${p.id}`);
    const created = log.events.find((e: any) => e.action === 'page.create');
    expect(created).toBeTruthy();
    expect(created.details.title).toBe('(скрыто)');
    expect(JSON.stringify(log.events)).not.toContain('Секретный план');
    // The author (who can see the page) and its sharers see the title.
    const own = await author.get(`/api/v1/audit?targetId=${p.id}`);
    expect(own.events.find((e: any) => e.action === 'page.create').details.title).toBe('Секретный план слияния');
  });

  it('access denials are written to the audit log with a rate limit', async () => {
    const sp = (await org.owner.post('/api/v1/spaces', { name: 'Регламенты для отказов', kind: 'org', visibility: 'open', orgLevel: 'view' })).space;
    const page = (await org.owner.post('/api/v1/pages', { spaceId: sp.id, title: 'Нельзя менять' })).page;
    const reader = await org.user('Настойчивый читатель');
    for (let i = 0; i < 5; i++) await expectStatus(reader.patch(`/api/v1/pages/${page.id}`, { title: 'взлом ' + i }), 403);
    let events: any[] = [];
    for (let i = 0; i < 30; i++) {
      events = (await org.owner.get(`/api/v1/audit?action=access.denied&actorId=${reader.id}`)).events;
      if (events.length) break;
      await sleep(100);
    }
    expect(events.length).toBe(1);
    expect(events[0]).toMatchObject({ outcome: 'denied', target_id: page.id });
    expect(events[0].details.route).toBe('/api/v1/pages/:id');
  });
});

describe('guests have no global search (R-ACL-064)', () => {
  it('search and suggestions return only pages explicitly shared with the guest', async () => {
    const sp = (await org.owner.post('/api/v1/spaces', { name: 'Проект с гостями', kind: 'project', visibility: 'private', policy: { allowGuests: true } })).space;
    const shared = (await org.owner.post('/api/v1/pages', { spaceId: sp.id, title: 'Гостевой регламент приёмки' })).page;
    const other = (await org.owner.post('/api/v1/pages', { spaceId: sp.id, title: 'Внутренний регламент приёмки' })).page;
    const grp = await dept('Подрядчики', 'group');
    await org.owner.put('/api/v1/grants', { resourceType: 'space', resourceId: sp.id, subjectType: 'group', subjectId: grp, level: 'view' });
    const guest = await org.user('Гость-подрядчик', { kind: 'guest', accessExpiresAt: new Date(Date.now() + 86400_000).toISOString(), pageGrants: [{ pageId: shared.id, level: 'view' }] });
    await org.owner.put(`/api/v1/admin/groups/${grp}/members/${guest.id}`, { role: 'member' });
    await guest.get(`/api/v1/pages/${other.id}`); // readable through the group grant ...
    // ... but not discoverable by search: wait until the owner finds both, then compare.
    for (let i = 0; i < 50; i++) {
      const r = await org.owner.get('/api/v1/search?q=' + encodeURIComponent('регламент приёмки'));
      if (r.results.length >= 2) break;
      await sleep(100);
    }
    const r = await guest.get('/api/v1/search?q=' + encodeURIComponent('регламент приёмки'));
    expect(r.results.map((x: any) => x.pageId)).toEqual([shared.id]);
    const sg = await guest.get('/api/v1/search/suggest?q=' + encodeURIComponent('регламент'));
    expect(sg.suggestions.map((x: any) => x.pageId)).toEqual([shared.id]);
  });
});

describe('organisation guest switch beats existing grants (R-ACL-033)', () => {
  it('disabling guest access makes existing guest grants ineffective until it is enabled again', async () => {
    const sp = (await org.owner.post('/api/v1/spaces', { name: 'Гостевой проект 2', kind: 'project', visibility: 'private', policy: { allowGuests: true } })).space;
    const page = (await org.owner.post('/api/v1/pages', { spaceId: sp.id, title: 'Для гостя' })).page;
    const guest = await org.user('Гость с доступом', { kind: 'guest', accessExpiresAt: new Date(Date.now() + 86400_000).toISOString(), pageGrants: [{ pageId: page.id, level: 'view' }] });
    await guest.get(`/api/v1/pages/${page.id}`);
    await org.owner.patch('/api/v1/admin/settings', { guestsEnabled: false });
    try {
      await expectStatus(guest.get(`/api/v1/pages/${page.id}`), 404);
      expect((await guest.get('/api/v1/spaces')).shared).toEqual([]);
    } finally {
      await org.owner.patch('/api/v1/admin/settings', { guestsEnabled: true });
    }
    await guest.get(`/api/v1/pages/${page.id}`);
  });
});

describe('explicit exceptions are marked (R-ACL-032, R-ACL-077)', () => {
  it('tree nodes and page DTO expose hasExplicitGrants', async () => {
    const parent = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Раздел с исключением' })).page;
    const plain = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, parentId: parent.id, title: 'Обычная' })).page;
    const special = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, parentId: parent.id, title: 'С отдельным доступом' })).page;
    const u = await org.user('Получатель исключения');
    await org.owner.put('/api/v1/grants', { resourceType: 'page', resourceId: special.id, subjectType: 'user', subjectId: u.id, level: 'edit' });
    const kids = (await org.owner.get(`/api/v1/spaces/${org.generalSpaceId}/tree?parentId=${parent.id}`)).nodes;
    expect(kids.find((n: any) => n.id === special.id).hasExplicitGrants).toBe(true);
    expect(kids.find((n: any) => n.id === plain.id).hasExplicitGrants).toBe(false);
    expect((await org.owner.get(`/api/v1/pages/${special.id}`)).page.hasExplicitGrants).toBe(true);
    expect((await org.owner.get(`/api/v1/pages/${plain.id}`)).page.hasExplicitGrants).toBe(false);
  });
});

describe('deleting a department requires reassignment or confirmation (R-ORG-004)', () => {
  it('refuses with the affected grants, then reassigns them to another department', async () => {
    const old = await dept('Старый отдел');
    const neu = await dept('Новый отдел');
    const sp = (await org.owner.post('/api/v1/spaces', { name: 'Пространство старого отдела', kind: 'department', visibility: 'private', groups: [{ groupId: old, level: 'edit' }] })).space;
    const page = (await org.owner.post('/api/v1/pages', { spaceId: sp.id, title: 'Документ старого отдела' })).page;
    const member = await org.user('Сотрудник нового отдела', { groupIds: [neu] });
    await expectStatus(member.get(`/api/v1/pages/${page.id}`), 404);
    const err = await expectStatus(org.owner.del(`/api/v1/admin/groups/${old}`), 409);
    expect(err.error.code).toBe('group_in_use');
    expect(err.error.details.grants.map((g: any) => g.resourceId)).toContain(sp.id);
    await org.owner.del(`/api/v1/admin/groups/${old}`, { reassignTo: neu });
    await member.get(`/api/v1/pages/${page.id}`); // access moved to the new department
    const log = await org.owner.get(`/api/v1/audit?action=group.delete&targetId=${old}`);
    expect(log.events[0].details.reassignedTo).toBe(neu);
  });

  it('a group without grants or primary members is deleted directly', async () => {
    const g = await dept('Пустая группа', 'group');
    await org.owner.del(`/api/v1/admin/groups/${g}`);
  });
});

describe('copy into another space asks to confirm the audience (R-ACL-050)', () => {
  it('duplicating a personal page into an open space requires confirmation', async () => {
    const u = await org.user('Копирующий');
    const me = await u.get('/api/v1/auth/me');
    const draft = (await u.post('/api/v1/pages', { spaceId: me.personalSpaceId, title: 'Личный черновик' })).page;
    const openSp = (await org.owner.post('/api/v1/spaces', { name: 'Открытое для копий', kind: 'project', visibility: 'open', users: [{ userId: u.id, level: 'edit' }] })).space;
    const err = await expectStatus(u.post(`/api/v1/pages/${draft.id}/duplicate`, { targetSpaceId: openSp.id, targetParentId: null }), 409);
    expect(err.error.code).toBe('audience_change');
    expect(err.error.details.audience.gained.some((g: any) => g.subjectType === 'org')).toBe(true);
    const copy = (await u.post(`/api/v1/pages/${draft.id}/duplicate`, { targetSpaceId: openSp.id, targetParentId: null, confirmAudienceChange: true })).page;
    expect(copy.spaceId).toBe(openSp.id);
    // In-place copies need no confirmation.
    await u.post(`/api/v1/pages/${draft.id}/duplicate`, {});
  });
});

describe('comments are bound to a revision and a block (R-COMMENTS-001)', () => {
  it('stores the revision number and the comment survives edits of its block', async () => {
    const page = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Комментируемая' })).page;
    const c = await openClient(ts.url, org.owner, page.id);
    c.insert(0, 0, 'Исходный текст абзаца.');
    await c.waitSaved();
    await ts.srv.services.hub.flushPage(page.id);
    const before = await org.owner.get(`/api/v1/pages/${page.id}/content`);
    const blockId = before.content.content[0].attrs.id as string;
    expect(blockId).toBeTruthy();
    const t = await org.owner.post(`/api/v1/pages/${page.id}/comments`, { text: 'Уточнить формулировку', quote: 'Исходный текст', blockId });
    c.insert(0, 0, 'Новое начало. ');
    await c.waitSaved();
    await ts.srv.services.hub.flushPage(page.id);
    const after = await org.owner.get(`/api/v1/pages/${page.id}/content`);
    expect(after.content.content[0].attrs.id).toBe(blockId);
    const th = (await org.owner.get(`/api/v1/pages/${page.id}/comments`)).threads.find((x: any) => x.id === t.comment.threadId);
    expect(th.blockId).toBe(blockId);
    expect(th.revisionNumber).toBeGreaterThanOrEqual(1);
    c.close();
  });
});

describe('OpenAPI description (R-SPACE-002, R-ACL-016)', () => {
  it('is generated from the registered routes', async () => {
    const doc = await org.owner.get('/api/v1/openapi.json');
    expect(doc.openapi).toMatch(/^3\./);
    expect(Object.keys(doc.paths)).toEqual(expect.arrayContaining(['/api/v1/spaces', '/api/v1/grants', '/api/v1/audit']));
    expect(doc.paths['/api/v1/spaces']).toHaveProperty('post');
  });
});
