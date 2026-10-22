import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startServer, setupOrg, expectStatus, type TestServer } from '../support/harness.js';

let ts: TestServer;
let org: Awaited<ReturnType<typeof setupOrg>>;

beforeAll(async () => {
  ts = await startServer();
  org = await setupOrg(ts);
});
afterAll(async () => ts?.close());

async function dept(name: string, parentId?: string) {
  return (await org.owner.post('/api/v1/admin/groups', { name, kind: 'department', parentId })).group.id as string;
}

describe('department spaces and inheritance', () => {
  it('new employee of a department automatically gets its space (V15-A04, V16-S13, V15-A01, ACL-152, ACL-159, ACL-162, R-ORG-005, R-ADMIN-020, R-ACL-081, UX v2.7)', async () => {
    const eng = await dept('Проектирование');
    const sales = await dept('Продажи');
    const sp = (await org.owner.post('/api/v1/spaces', { name: 'Проектирование', kind: 'department', visibility: 'private', groups: [{ groupId: eng, level: 'edit' }] })).space;
    const salesSp = (await org.owner.post('/api/v1/spaces', { name: 'Продажи', kind: 'department', visibility: 'private', groups: [{ groupId: sales, level: 'edit' }] })).space;
    const engineer = await org.user('Инженер', { groupIds: [eng] });
    const spaces = (await engineer.get('/api/v1/spaces')).spaces.map((s: any) => s.id);
    expect(spaces).toContain(sp.id);
    expect(spaces).not.toContain(salesSp.id); // A01, A02: private space of another department is invisible
    expect(spaces).toContain(org.generalSpaceId);
    // create 20 child pages without any ACL configuration (v2.7)
    const root = await engineer.post('/api/v1/pages', { spaceId: sp.id, title: 'Стандарты' });
    for (let i = 0; i < 20; i++) await engineer.post('/api/v1/pages', { spaceId: sp.id, parentId: root.page.id, title: 'Стандарт ' + i });
    const colleague = await org.user('Коллега', { groupIds: [eng] });
    const kids = await colleague.get(`/api/v1/spaces/${sp.id}/tree?parentId=${root.page.id}`);
    expect(kids.nodes.length).toBe(20);
    expect(kids.nodes[0].canEdit).toBe(true);
    const seller = await org.user('Продавец', { groupIds: [sales] });
    await expectStatus(seller.get(`/api/v1/pages/${root.page.id}`), 404); // ACL-162: no metadata via direct URL
    const tree = await seller.get(`/api/v1/spaces/${sp.id}/tree`);
    expect(tree.nodes).toEqual([]);
  });

  it('nested departments: member of a sub-department inherits parent department access (R-ORG-001)', async () => {
    const parent = await dept('Производство');
    const child = await dept('Цех №1', parent);
    const sp = (await org.owner.post('/api/v1/spaces', { name: 'Производство', kind: 'department', visibility: 'private', groups: [{ groupId: parent, level: 'view' }] })).space;
    const worker = await org.user('Рабочий', { groupIds: [child] });
    expect((await worker.get('/api/v1/spaces')).spaces.map((s: any) => s.id)).toContain(sp.id);
  });

  it('removing a user from a department revokes access; personal grants remain (R-ACL-039, E2E-107)', async () => {
    const g = await dept('Отдел качества');
    const sp = (await org.owner.post('/api/v1/spaces', { name: 'Качество', kind: 'department', visibility: 'private', groups: [{ groupId: g, level: 'view' }] })).space;
    const p1 = (await org.owner.post('/api/v1/pages', { spaceId: sp.id, title: 'Общая' })).page;
    const p2 = (await org.owner.post('/api/v1/pages', { spaceId: sp.id, title: 'Лично выданная' })).page;
    const u = await org.user('Контролёр', { groupIds: [g] });
    await org.owner.put('/api/v1/grants', { resourceType: 'page', resourceId: p2.id, subjectType: 'user', subjectId: u.id, level: 'view' });
    await u.get(`/api/v1/pages/${p1.id}`);
    await org.owner.del(`/api/v1/admin/groups/${g}/members/${u.id}`);
    await expectStatus(u.get(`/api/v1/pages/${p1.id}`), 404);
    await u.get(`/api/v1/pages/${p2.id}`);
    const shared = (await u.get('/api/v1/spaces')).shared.map((x: any) => x.id);
    expect(shared).toContain(p2.id);
  });
});

describe('permission levels (ACL-153, ACL-154, A10)', () => {
  it('company-wide view, editing only by authors; view-only cannot modify via API (V15-A10, ACL-153)', async () => {
    const sp = (await org.owner.post('/api/v1/spaces', { name: 'Регламенты', kind: 'org', visibility: 'open', orgLevel: 'view' })).space;
    const page = (await org.owner.post('/api/v1/pages', { spaceId: sp.id, title: 'Регламент' })).page;
    const reader = await org.user('Читатель');
    await reader.get(`/api/v1/pages/${page.id}`);
    await expectStatus(reader.patch(`/api/v1/pages/${page.id}`, { title: 'взлом' }), 403);
    await expectStatus(reader.post('/api/v1/pages', { spaceId: sp.id, title: 'новая' }), 403);
    await expectStatus(reader.del(`/api/v1/pages/${page.id}`), 403);
    await expectStatus(reader.put('/api/v1/grants', { resourceType: 'page', resourceId: page.id, subjectType: 'user', subjectId: reader.id, level: 'edit' }), 403);
  });

  it('editor without share right cannot grant access (ACL-154, R-ACL-059)', async () => {
    const page = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Редактируемая' })).page;
    const editor = await org.user('Редактор');
    const other = await org.user('Другой');
    await org.owner.put('/api/v1/grants', { resourceType: 'page', resourceId: page.id, subjectType: 'user', subjectId: editor.id, level: 'edit' });
    await editor.patch(`/api/v1/pages/${page.id}`, { icon: '📘' });
    await expectStatus(editor.put('/api/v1/grants', { resourceType: 'page', resourceId: page.id, subjectType: 'user', subjectId: other.id, level: 'view' }), 403);
  });
});

describe('exceptions and denies', () => {
  it('restricted child page is not accessible through parent rights (ACL-160, R-ACL-034, E2E-104, UX-149)', async () => {
    const parent = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Открытый раздел' })).page;
    const secret = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, parentId: parent.id, title: 'Секретная' })).page;
    const emp = await org.user('Сотрудник');
    await emp.get(`/api/v1/pages/${secret.id}`);
    await org.owner.post(`/api/v1/pages/${secret.id}/inheritance`, { inherit: false });
    // Breaking inheritance copies current audience: nobody silently gains, nobody silently loses.
    await emp.get(`/api/v1/pages/${secret.id}`);
    const access = await org.owner.get(`/api/v1/pages/${secret.id}/access`);
    const orgGrant = access.pageGrants.find((g: any) => g.subject_type === 'org');
    await org.owner.del(`/api/v1/grants/${orgGrant.id}`);
    await expectStatus(emp.get(`/api/v1/pages/${secret.id}`), 404);
    const kids = await emp.get(`/api/v1/spaces/${org.generalSpaceId}/tree?parentId=${parent.id}`);
    expect(kids.nodes).toEqual([]);
    const tree = (await emp.get(`/api/v1/spaces/${org.generalSpaceId}/tree`)).nodes.find((n: any) => n.id === parent.id);
    expect(tree.hasChildren).toBe(false); // no leak through "has children" marker
  });

  it('explicit deny wins over group allow (R-ACL-066)', async () => {
    const g = await dept('Бухгалтерия');
    const sp = (await org.owner.post('/api/v1/spaces', { name: 'Бух', kind: 'department', visibility: 'private', groups: [{ groupId: g, level: 'edit' }] })).space;
    const page = (await org.owner.post('/api/v1/pages', { spaceId: sp.id, title: 'Зарплаты' })).page;
    const u = await org.user('Стажёр', { groupIds: [g] });
    await u.get(`/api/v1/pages/${page.id}`);
    await org.owner.put('/api/v1/grants', { resourceType: 'page', resourceId: page.id, subjectType: 'user', subjectId: u.id, level: 'none', reason: 'стажёр' });
    await expectStatus(u.get(`/api/v1/pages/${page.id}`), 404);
  });

  it('explains why a user has access (ACL-161, V15-A09, V16-S15, R-ACL-078)', async () => {
    const g = await dept('Логистика');
    const sp = (await org.owner.post('/api/v1/spaces', { name: 'Логистика', kind: 'department', visibility: 'private', groups: [{ groupId: g, level: 'comment' }] })).space;
    const page = (await org.owner.post('/api/v1/pages', { spaceId: sp.id, title: 'Маршруты' })).page;
    const u = await org.user('Логист', { groupIds: [g] });
    await org.owner.put('/api/v1/grants', { resourceType: 'page', resourceId: page.id, subjectType: 'user', subjectId: u.id, level: 'edit', expiresAt: new Date(Date.now() + 86400_000).toISOString() });
    const ex = await org.owner.get(`/api/v1/access/explain?userId=${u.id}&pageId=${page.id}`);
    expect(ex.level).toBe('edit');
    const vias = ex.sources.map((s: any) => s.via).sort();
    expect(vias).toEqual(['direct', 'space']);
    expect(ex.sources.find((s: any) => s.via === 'space').subject.name).toBe('Логистика');
    expect(ex.sources.find((s: any) => s.via === 'direct').expiresAt).toBeTruthy();
  });
});

describe('admin does not see private content (A03, S15, §4.1)', () => {
  it('org admin cannot open a personal page nor a private space page without a grant (V15-A03, R-ACL-047)', async () => {
    const admin = await org.user('Админ', { orgRole: 'admin' });
    const u = await org.user('Автор');
    const me = await u.get('/api/v1/auth/me');
    const p = (await u.post('/api/v1/pages', { spaceId: me.personalSpaceId, title: 'Личное' })).page;
    await expectStatus(admin.get(`/api/v1/pages/${p.id}`), 404);
    const ex = await admin.get(`/api/v1/access/explain?userId=${u.id}&pageId=${p.id}`);
    expect(ex.page.title).toBe('(скрыто)');
  });
});

describe('temporary access and guests (ACL-155, ACL-156, ACL-158, A07, S14, ACL-171)', () => {
  it('guest invited to one page sees only it, no directory, no org-wide content (ACL-155, ACL-171, R-ACL-029, R-ACL-082, V15-A02)', async () => {
    const sp = (await org.owner.post('/api/v1/spaces', { name: 'Проект с подрядчиком', kind: 'project', visibility: 'private', policy: { allowGuests: true } })).space;
    const page = (await org.owner.post('/api/v1/pages', { spaceId: sp.id, title: 'ТЗ для подрядчика' })).page;
    const other = (await org.owner.post('/api/v1/pages', { spaceId: sp.id, title: 'Внутреннее' })).page;
    const guest = await org.user('Гость', { kind: 'guest', accessExpiresAt: new Date(Date.now() + 7 * 86400_000).toISOString(), pageGrants: [{ pageId: page.id, level: 'comment' }] });
    await guest.get(`/api/v1/pages/${page.id}`);
    await expectStatus(guest.get(`/api/v1/pages/${other.id}`), 404);
    const spaces = await guest.get('/api/v1/spaces');
    expect(spaces.spaces.some((s: any) => s.kind === 'org')).toBe(false);
    expect(spaces.shared.map((s: any) => s.id)).toEqual([page.id]);
    await expectStatus(guest.get('/api/v1/directory?q=a'), 403);
    // Even an org-wide grant does not reach guests.
    const pub = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Для всех сотрудников' })).page;
    await expectStatus(guest.get(`/api/v1/pages/${pub.id}`), 404);
  });

  it('guest cannot be granted access in a space whose policy forbids guests', async () => {
    const page = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Без гостей' })).page;
    const guest = await org.user('Гость2', { kind: 'guest', accessExpiresAt: new Date(Date.now() + 86400_000).toISOString() });
    await expectStatus(org.owner.put('/api/v1/grants', { resourceType: 'page', resourceId: page.id, subjectType: 'user', subjectId: guest.id, level: 'view' }), 403);
  });

  it('time-limited grant expires on the server without client activity (ACL-156)', async () => {
    const page = (await org.owner.post('/api/v1/pages', { spaceId: org.personalSpaceId, title: 'Временно' })).page;
    const u = await org.user('Временный');
    const g = (await org.owner.put('/api/v1/grants', { resourceType: 'page', resourceId: page.id, subjectType: 'user', subjectId: u.id, level: 'view', expiresAt: new Date(Date.now() + 60_000).toISOString() })).grant;
    await u.get(`/api/v1/pages/${page.id}`);
    await ts.db.query(`update grants set expires_at = now() - interval '1 second' where id = $1`, [g.id]);
    await expectStatus(u.get(`/api/v1/pages/${page.id}`), 404);
  });

  it('user access expiry blocks the account (V16-S14)', async () => {
    const u = await org.user('Срочный');
    await ts.db.query(`update users set access_expires_at = now() - interval '1 second' where id = $1`, [u.id]);
    await expectStatus(u.get('/api/v1/spaces'), 401);
  });
});

describe('moving changes audience (ACL-165, ACL-166, A06, UX23-210)', () => {
  it('moving a private page to an open space requires confirmation and shows who gains access; undo restores (ACL-165, ACL-166, V15-A06, UX23-210, E2E-098, R-ACL-035, R-ACL-084, R-ACL-079, R-TREE-028, R-TREE-014, UX-126, UX21-188)', async () => {
    const u = await org.user('Перемещающий');
    const me = await u.get('/api/v1/auth/me');
    const draft = (await u.post('/api/v1/pages', { spaceId: me.personalSpaceId, title: 'Черновик регламента' })).page;
    const openSp = (await org.owner.post('/api/v1/spaces', { name: 'Открытое', kind: 'project', visibility: 'open', users: [{ userId: u.id, level: 'edit' }] })).space;
    const preview = await u.post(`/api/v1/pages/${draft.id}/move-preview`, { targetSpaceId: openSp.id, targetParentId: null });
    expect(preview.requiresConfirmation).toBe(true);
    expect(preview.audience.gained.some((g: any) => g.subjectType === 'org')).toBe(true);
    const err = await expectStatus(u.post(`/api/v1/pages/${draft.id}/move`, { targetSpaceId: openSp.id, targetParentId: null }), 409);
    expect(err.error.code).toBe('audience_change');
    const other = await org.user('Наблюдатель');
    await expectStatus(other.get(`/api/v1/pages/${draft.id}`), 404);
    const moved = await u.post(`/api/v1/pages/${draft.id}/move`, { targetSpaceId: openSp.id, targetParentId: null, confirmAudienceChange: true });
    await other.get(`/api/v1/pages/${draft.id}`);
    await u.post(`/api/v1/pages/${draft.id}/move`, moved.undo);
    await expectStatus(other.get(`/api/v1/pages/${draft.id}`), 404);
  });

  it('cannot move into a location where the user cannot create (UX23-209)', async () => {
    const u = await org.user('Без прав');
    const me = await u.get('/api/v1/auth/me');
    const p = (await u.post('/api/v1/pages', { spaceId: me.personalSpaceId, title: 'Моё' })).page;
    await expectStatus(u.post(`/api/v1/pages/${p.id}/move`, { targetSpaceId: org.generalSpaceId, targetParentId: null, confirmAudienceChange: true }), 403);
  });

  it('opening the page to the whole company requires explicit confirmation (R-ACL-069)', async () => {
    const page = (await org.owner.post('/api/v1/pages', { spaceId: org.personalSpaceId, title: 'Личная' })).page;
    const e = await expectStatus(org.owner.put('/api/v1/grants', { resourceType: 'page', resourceId: page.id, subjectType: 'org', subjectId: null, level: 'view' }), 409);
    expect(e.error.code).toBe('audience_change');
    await org.owner.put('/api/v1/grants', { resourceType: 'page', resourceId: page.id, subjectType: 'org', subjectId: null, level: 'view', confirmWiden: true });
  });
});

describe('concurrency and audit of ACL (ACL-169, ACL-172, A13)', () => {
  it('parallel grant changes do not lose updates (one active grant per subject) (ACL-169, ACL-172, E2E-110, R-AUDIT-004)', async () => {
    const page = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Параллельно' })).page;
    const users = await Promise.all([1, 2, 3, 4, 5].map((i) => org.user('Параллельный' + i)));
    await Promise.all(users.map((u) => org.owner.put('/api/v1/grants', { resourceType: 'page', resourceId: page.id, subjectType: 'user', subjectId: u.id, level: 'edit' })));
    const acc = await org.owner.get(`/api/v1/pages/${page.id}/access`);
    expect(acc.pageGrants.filter((g: any) => g.subject_type === 'user').length).toBe(5);
    const log = await org.owner.get(`/api/v1/audit?action=grant.&targetId=${page.id}`);
    expect(log.events.length).toBe(5);
  });

  it('deleting a group revokes its grants and keeps users and pages (V15-A13)', async () => {
    const g = await dept('Временный отдел');
    const sp = (await org.owner.post('/api/v1/spaces', { name: 'Временное', kind: 'department', visibility: 'private', groups: [{ groupId: g, level: 'edit' }] })).space;
    const p = (await org.owner.post('/api/v1/pages', { spaceId: sp.id, title: 'Документ' })).page;
    const u = await org.user('Участник', { groupIds: [g] });
    await u.get(`/api/v1/pages/${p.id}`);
    await org.owner.del(`/api/v1/admin/groups/${g}`, { confirm: true });
    await expectStatus(u.get(`/api/v1/pages/${p.id}`), 404);
    await org.owner.get(`/api/v1/pages/${p.id}`);
    const orphan = await ts.db.query(`select count(*)::int c from grants where subject_type = 'group' and subject_id = $1 and revoked_at is null`, [g]);
    expect(orphan.rows[0].c).toBe(0);
  });

  it('transfer preview shows spaces gained and lost (V15-A16, R-ADMIN-006, R-ADMIN-023)', async () => {
    const a = await dept('Отдел А');
    const b = await dept('Отдел Б');
    const spA = (await org.owner.post('/api/v1/spaces', { name: 'А', kind: 'department', visibility: 'private', groups: [{ groupId: a, level: 'edit' }] })).space;
    const spB = (await org.owner.post('/api/v1/spaces', { name: 'Б', kind: 'department', visibility: 'private', groups: [{ groupId: b, level: 'view' }] })).space;
    const u = await org.user('Переводимый', { groupIds: [a] });
    const prev = await org.owner.post(`/api/v1/admin/users/${u.id}/transfer-preview`, { removeGroupIds: [a], addGroupIds: [b] });
    const ch = Object.fromEntries(prev.changes.map((c: any) => [c.spaceId, c]));
    expect(ch[spA.id]).toMatchObject({ from: 'edit', to: 'none' });
    expect(ch[spB.id]).toMatchObject({ from: 'none', to: 'view' });
  });
});

describe('space policy', () => {
  it('export/download flags are reflected in actions (R-ACL-031)', async () => {
    const sp = (await org.owner.post('/api/v1/spaces', { name: 'Без экспорта', kind: 'project', visibility: 'private', policy: { allowExport: false } })).space;
    const p = (await org.owner.post('/api/v1/pages', { spaceId: sp.id, title: 'X' })).page;
    const acc = await org.owner.get(`/api/v1/pages/${p.id}`);
    expect(acc.page.access.actions.export).toBe(false);
    expect(acc.page.access.actions.edit).toBe(true);
  });
});
