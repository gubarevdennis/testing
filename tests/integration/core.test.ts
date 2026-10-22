import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startServer, setupOrg, expectStatus, Api, OWNER, type TestServer } from '../support/harness.js';

let ts: TestServer;
let org: Awaited<ReturnType<typeof setupOrg>>;

beforeAll(async () => {
  ts = await startServer();
  org = await setupOrg(ts);
});
afterAll(async () => ts?.close());

describe('auth', () => {
  it('rejects wrong password and does not reveal whether the user exists', async () => {
    const a = new Api(ts.url);
    const e1 = await expectStatus(a.login(OWNER.email, 'wrong-password-1'), 401);
    const e2 = await expectStatus(a.login('nobody@corp.test', 'wrong-password-1'), 401);
    expect(e1.error.message).toBe(e2.error.message);
  });

  it('requires CSRF token for cookie-authenticated mutations', async () => {
    const a = new Api(ts.url);
    await a.login(OWNER.email, OWNER.password);
    a.csrf = null;
    await expectStatus(a.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'x' }), 403);
  });

  it('setup cannot run twice', async () => {
    await expectStatus(new Api(ts.url).post('/api/v1/setup', { orgName: 'X', ownerEmail: 'x@x.test', ownerName: 'X', password: 'Password-123456' }), 409);
  });

  it('suspended user loses access immediately (ACL-157)', async () => {
    const u = await org.user('Suspend Me');
    await u.get('/api/v1/spaces');
    await org.owner.post(`/api/v1/admin/users/${u.id}/status`, { status: 'suspended', reason: 'test' });
    await expectStatus(u.get('/api/v1/spaces'), 401);
    // Reactivation does not resurrect old sessions.
    await org.owner.post(`/api/v1/admin/users/${u.id}/status`, { status: 'active' });
    await expectStatus(u.get('/api/v1/spaces'), 401);
  });
});

describe('personal space (UX23-199, ACL-151)', () => {
  it('each employee gets a private personal space invisible to others and to admins', async () => {
    const a = await org.user('Alice');
    const b = await org.user('Bob');
    const meA = await a.get('/api/v1/auth/me');
    expect(meA.personalSpaceId).toBeTruthy();
    const p = await a.post('/api/v1/pages', { spaceId: meA.personalSpaceId, title: 'Мой черновик' });
    await expectStatus(b.get(`/api/v1/pages/${p.page.id}`), 404);
    await expectStatus(org.owner.get(`/api/v1/pages/${p.page.id}`), 404);
    const bSpaces = await b.get('/api/v1/spaces');
    expect(bSpaces.spaces.some((s: any) => s.id === meA.personalSpaceId)).toBe(false);
  });
});

describe('page tree', () => {
  it('creates nested pages, idempotent by requestId (UX23-203)', async () => {
    const parent = await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Раздел' });
    const reqId = 'req-' + Date.now();
    const [c1, c2] = await Promise.all([
      org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, parentId: parent.page.id, title: 'Дочерняя', requestId: reqId }),
      org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, parentId: parent.page.id, title: 'Дочерняя', requestId: reqId }).catch((e) => e),
    ]);
    const tree = await org.owner.get(`/api/v1/spaces/${org.generalSpaceId}/tree?parentId=${parent.page.id}`);
    expect(tree.nodes.length).toBe(1);
    expect(c1.page.id).toBe(tree.nodes[0].id);
    void c2;
    const root = await org.owner.get(`/api/v1/spaces/${org.generalSpaceId}/tree`);
    expect(root.nodes.find((n: any) => n.id === parent.page.id).hasChildren).toBe(true);
  });

  it('prevents moving a page into its own descendant (E2E-099, UX23-208)', async () => {
    const a = await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'A' });
    const b = await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, parentId: a.page.id, title: 'B' });
    const c = await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, parentId: b.page.id, title: 'C' });
    const e = await expectStatus(org.owner.post(`/api/v1/pages/${a.page.id}/move`, { targetParentId: c.page.id }), 409);
    expect(e.error.code).toBe('move_cycle');
    await expectStatus(org.owner.post(`/api/v1/pages/${a.page.id}/move`, { targetParentId: a.page.id }), 409);
  });

  it('concurrent opposite moves never create a cycle (COLLAB-194)', async () => {
    const x = await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'X' });
    const y = await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Y' });
    const results = await Promise.allSettled([
      org.owner.post(`/api/v1/pages/${x.page.id}/move`, { targetParentId: y.page.id }),
      org.owner.post(`/api/v1/pages/${y.page.id}/move`, { targetParentId: x.page.id }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled').length).toBe(1);
    const cyc = await ts.db.query(`select count(*)::int c from page_ancestors a join page_ancestors b on a.page_id = b.ancestor_id and a.ancestor_id = b.page_id where a.page_id <> a.ancestor_id`);
    expect(cyc.rows[0].c).toBe(0);
  });

  it('moves keep ids, ancestors closure is consistent, order respected', async () => {
    const p1 = await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'P1' });
    const p2 = await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'P2' });
    const k1 = await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, parentId: p1.page.id, title: 'K1' });
    const k2 = await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, parentId: p1.page.id, title: 'K2' });
    await org.owner.post(`/api/v1/pages/${k2.page.id}/move`, { targetParentId: p1.page.id, beforeId: k1.page.id });
    let kids = (await org.owner.get(`/api/v1/spaces/${org.generalSpaceId}/tree?parentId=${p1.page.id}`)).nodes.map((n: any) => n.title);
    expect(kids).toEqual(['K2', 'K1']);
    const moved = await org.owner.post(`/api/v1/pages/${p1.page.id}/move`, { targetParentId: p2.page.id });
    expect(moved.page.id).toBe(p1.page.id);
    const anc = (await ts.db.query(`select ancestor_id, depth from page_ancestors where page_id = $1 order by depth`, [k1.page.id])).rows;
    expect(anc.map((a: any) => a.ancestor_id)).toEqual([k1.page.id, p1.page.id, p2.page.id]);
    // undo restores position
    await org.owner.post(`/api/v1/pages/${p1.page.id}/move`, moved.undo);
    const after = (await ts.db.query(`select parent_id from pages where id = $1`, [p1.page.id])).rows[0];
    expect(after.parent_id).toBeNull();
    kids = (await org.owner.get(`/api/v1/spaces/${org.generalSpaceId}/tree?parentId=${p1.page.id}`)).nodes.map((n: any) => n.title);
    expect(kids).toEqual(['K2', 'K1']);
  });

  it('trash and restore a branch with children (D-05, SC-29, V17-F08)', async () => {
    const r = await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Ветка' });
    const c = await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, parentId: r.page.id, title: 'Лист' });
    const del = await org.owner.del(`/api/v1/pages/${r.page.id}`);
    expect(del.count).toBe(2);
    await expectStatus(org.owner.get(`/api/v1/pages/${c.page.id}/content`), 404);
    const trash = await org.owner.get('/api/v1/trash');
    expect(trash.pages.find((p: any) => p.id === r.page.id).children).toBe(1);
    expect(trash.pages.some((p: any) => p.id === c.page.id)).toBe(false);
    await org.owner.post(`/api/v1/pages/${r.page.id}/restore`);
    const content = await org.owner.get(`/api/v1/pages/${c.page.id}/content`);
    expect(content.mode).toBe('live');
  });

  it('duplicates a branch with new ids', async () => {
    const r = await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Оригинал' });
    await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, parentId: r.page.id, title: 'Дочерняя' });
    const d = await org.owner.post(`/api/v1/pages/${r.page.id}/duplicate`, { includeChildren: true });
    expect(d.page.id).not.toBe(r.page.id);
    expect(d.page.title).toBe('Оригинал (копия)');
    const kids = await org.owner.get(`/api/v1/spaces/${org.generalSpaceId}/tree?parentId=${d.page.id}`);
    expect(kids.nodes.map((n: any) => n.title)).toEqual(['Дочерняя']);
  });
});

describe('audit', () => {
  it('is hash-chained and append-only', async () => {
    const v = await org.owner.get('/api/v1/audit/verify');
    expect(v.ok).toBe(true);
    expect(v.checked).toBeGreaterThan(3);
    await expect(ts.db.query(`update audit_events set action = 'x' where id = 1`)).rejects.toThrow(/append-only/);
    await expect(ts.db.query(`delete from audit_events where id = 1`)).rejects.toThrow(/append-only/);
  });

  it('regular user cannot read the org audit log (SC-39)', async () => {
    const u = await org.user('Reader');
    await expectStatus(u.get('/api/v1/audit'), 403);
  });
});
