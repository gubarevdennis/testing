import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startServer, setupOrg, expectStatus, type TestServer } from '../support/harness.js';
import { openClient, waitFor } from '../support/collab.js';

/**
 * R-ACL-036: a grant whose subject is «участники пространства X» (members of space X) — engine, API, audience preview,
 * audit, expiry and revocation in live sessions. Membership of X = an active allowing grant on X to the user, their
 * group/department or the whole organisation, no deny on X; it is evaluated on every request (no cache, D-35), so
 * joining or leaving X changes access at once. One level deep: a grant to "members of Z" where Z's members are
 * "members of X" does not chain.
 */
let ts: TestServer;
let org: Awaited<ReturnType<typeof setupOrg>>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  ts = await startServer({}, { worker: true });
  org = await setupOrg(ts);
}, 120_000);
afterAll(async () => ts?.close());

describe('grants to the members of a space (R-ACL-036)', () => {
  it('members (direct, via group) get access, outsiders do not; preview names them; audit and share data name the space; joining/leaving X and a deny in X apply at once', async () => {
    const team = (await org.owner.post('/api/v1/admin/groups', { name: 'Команда проекта Альфа', kind: 'group' })).group;
    const alice = await org.user('Alice');
    const bob = await org.user('Bob', { groupIds: [team.id] });
    const carol = await org.user('Carol');
    const X = (await org.owner.post('/api/v1/spaces', { name: 'Проект Альфа', kind: 'project', visibility: 'private' })).space;
    await org.owner.put('/api/v1/grants', { resourceType: 'space', resourceId: X.id, subjectType: 'user', subjectId: alice.id, level: 'view' });
    await org.owner.put('/api/v1/grants', { resourceType: 'space', resourceId: X.id, subjectType: 'group', subjectId: team.id, level: 'edit' });
    const Y = (await org.owner.post('/api/v1/spaces', { name: 'Закрытый архив', kind: 'project', visibility: 'private' })).space;
    const P = (await org.owner.post('/api/v1/pages', { spaceId: Y.id, title: 'Договор с подрядчиком' })).page;
    for (const u of [alice, bob, carol]) await expectStatus(u.get(`/api/v1/pages/${P.id}`), 404);

    // Directory offers the space; the preview names exactly the members.
    const dir = await org.owner.get(`/api/v1/directory?q=${encodeURIComponent('Альфа')}&spaces=1`);
    expect(dir.spaces.map((s: any) => s.id)).toContain(X.id);
    const preview = await org.owner.post(`/api/v1/pages/${P.id}/access/preview`, { subjectType: 'space', subjectId: X.id, level: 'comment' });
    expect(preview.added.map((a: any) => a.name).sort()).toEqual(['Alice', 'Bob']);
    expect(preview.subjects.gained[0].subject.name).toBe('Участники пространства «Проект Альфа»');

    const expiresAt = new Date(Date.now() + 7 * 86400_000).toISOString();
    const { grant } = await org.owner.put('/api/v1/grants', { resourceType: 'page', resourceId: P.id, subjectType: 'space', subjectId: X.id, level: 'comment', expiresAt, timeZone: 'Asia/Yekaterinburg', reason: 'согласование договора' });
    expect(grant).toMatchObject({ subject_type: 'space', subject_id: X.id, level: 'comment', time_zone: 'Asia/Yekaterinburg', reason: 'согласование договора' });
    const audit = (await ts.db.query(`select details from audit_events where action = 'grant.create' and target_id = $1 order by id desc limit 1`, [P.id])).rows[0].details;
    expect(audit).toMatchObject({ subjectType: 'space', subjectId: X.id, level: 'comment', timeZone: 'Asia/Yekaterinburg', reason: 'согласование договора' });

    const a = await alice.get(`/api/v1/pages/${P.id}`);
    expect(a.page.access.level).toBe('comment');
    const mine = (await alice.get(`/api/v1/pages/${P.id}/access`)).my;
    expect(mine.sources.some((s: any) => s.subjectType === 'space' && s.subjectId === X.id && s.via === 'space-members')).toBe(true);
    expect(mine.explanation.join(' ')).toContain('как участнику пространства');
    expect((await bob.get(`/api/v1/pages/${P.id}`)).page.access.level).toBe('comment');
    await expectStatus(carol.get(`/api/v1/pages/${P.id}`), 404);
    // Members see the page under "Доступные мне"; outsiders' search does not find it.
    expect((await alice.get('/api/v1/spaces')).shared.map((p: any) => p.id)).toContain(P.id);

    const access = await org.owner.get(`/api/v1/pages/${P.id}/access`);
    const g = access.pageGrants.find((x: any) => x.subject_type === 'space');
    expect(g.subject).toMatchObject({ name: 'Участники пространства «Проект Альфа»', kind: 'space', members: 3 }); // Alice, Bob and the creator of X

    // Carol joins X → access now; Bob's group leaves X → Bob loses it; a deny for Alice in X removes her membership.
    await org.owner.put('/api/v1/grants', { resourceType: 'space', resourceId: X.id, subjectType: 'user', subjectId: carol.id, level: 'view' });
    expect((await carol.get(`/api/v1/pages/${P.id}`)).page.access.level).toBe('comment');
    const teamGrant = (await org.owner.get(`/api/v1/spaces/${X.id}/access`)).grants.find((x: any) => x.subject_type === 'group');
    await org.owner.del(`/api/v1/grants/${teamGrant.id}`);
    await expectStatus(bob.get(`/api/v1/pages/${P.id}`), 404);
    await org.owner.put('/api/v1/grants', { resourceType: 'space', resourceId: X.id, subjectType: 'user', subjectId: alice.id, level: 'none' });
    await expectStatus(alice.get(`/api/v1/pages/${P.id}`), 404);

    // Revoking the grant itself.
    await org.owner.del(`/api/v1/grants/${grant.id}`);
    await expectStatus(carol.get(`/api/v1/pages/${P.id}`), 404);
    const revoked = (await ts.db.query(`select details from audit_events where action = 'grant.revoke' and target_id = $1 order by id desc limit 1`, [P.id])).rows[0].details;
    expect(revoked).toMatchObject({ subjectType: 'space', subjectId: X.id });
  });

  it('space-level grant to the members of another space; not transitive; guests only where the space admits them', async () => {
    const dave = await org.user('Dave');
    const X = (await org.owner.post('/api/v1/spaces', { name: 'Бета', kind: 'project', visibility: 'private' })).space;
    await org.owner.put('/api/v1/grants', { resourceType: 'space', resourceId: X.id, subjectType: 'user', subjectId: dave.id, level: 'view' });
    const Z = (await org.owner.post('/api/v1/spaces', { name: 'Гамма', kind: 'project', visibility: 'private' })).space;
    await org.owner.put('/api/v1/grants', { resourceType: 'space', resourceId: Z.id, subjectType: 'space', subjectId: X.id, level: 'edit' });
    const inZ = (await org.owner.post('/api/v1/pages', { spaceId: Z.id, title: 'Страница Гаммы' })).page;
    expect((await dave.get(`/api/v1/pages/${inZ.id}`)).page.access.level).toBe('edit');
    expect((await dave.get('/api/v1/spaces')).spaces.map((s: any) => s.id)).toContain(Z.id);

    // Members of Z (via "members of X") are NOT members of Z for a grant naming Z: no chaining.
    const W = (await org.owner.post('/api/v1/spaces', { name: 'Дельта', kind: 'project', visibility: 'private' })).space;
    const inW = (await org.owner.post('/api/v1/pages', { spaceId: W.id, title: 'Страница Дельты' })).page;
    await org.owner.put('/api/v1/grants', { resourceType: 'page', resourceId: inW.id, subjectType: 'space', subjectId: Z.id, level: 'view' });
    await expectStatus(dave.get(`/api/v1/pages/${inW.id}`), 404);

    // A guest who is a member of X gets nothing through it while the target space does not admit guests.
    const guest = await org.user('Гость Ева', { kind: 'guest', accessExpiresAt: new Date(Date.now() + 30 * 86400_000).toISOString() });
    await ts.db.query(`update spaces set settings = jsonb_set(coalesce(settings, '{}'), '{policy,allowGuests}', 'true') where id = $1`, [X.id]);
    await org.owner.put('/api/v1/grants', { resourceType: 'space', resourceId: X.id, subjectType: 'user', subjectId: guest.id, level: 'view' });
    await ts.db.query(`update spaces set settings = jsonb_set(coalesce(settings, '{}'), '{policy,allowGuests}', 'false') where id = $1`, [Z.id]);
    await expectStatus(guest.get(`/api/v1/pages/${inZ.id}`), 404);
    // …and does get it once the target space admits guests (the guest is a member of X).
    await ts.db.query(`update spaces set settings = jsonb_set(coalesce(settings, '{}'), '{policy,allowGuests}', 'true') where id = $1`, [Z.id]);
    expect((await guest.get(`/api/v1/pages/${inZ.id}`)).page.access.level).toBe('edit');
  });

  it('validation: own space, personal spaces and spaces the granter cannot see are refused', async () => {
    const X = (await org.owner.post('/api/v1/spaces', { name: 'Эпсилон', kind: 'project', visibility: 'private' })).space;
    await expectStatus(org.owner.put('/api/v1/grants', { resourceType: 'space', resourceId: X.id, subjectType: 'space', subjectId: X.id, level: 'view' }), 400);
    const page = (await org.owner.post('/api/v1/pages', { spaceId: X.id, title: 'Эпсилон-страница' })).page;
    await expectStatus(org.owner.put('/api/v1/grants', { resourceType: 'page', resourceId: page.id, subjectType: 'space', subjectId: org.personalSpaceId, level: 'view' }), 400);
    // Frank manages his own page but cannot see X: naming X is refused like a missing space.
    const frank = await org.user('Frank');
    const fp = (await frank.post('/api/v1/pages', { spaceId: (await frank.get('/api/v1/auth/me')).personalSpaceId, title: 'Моя' })).page;
    await expectStatus(frank.put('/api/v1/grants', { resourceType: 'page', resourceId: fp.id, subjectType: 'space', subjectId: X.id, level: 'view' }), 404);
    expect((await frank.get(`/api/v1/directory?q=${encodeURIComponent('Эпсилон')}&spaces=1`)).spaces).toEqual([]);
  });

  it('expiry and revocation reach open editors live: a member of X editing through "members of X" is downgraded/closed', async () => {
    const gina = await org.user('Gina');
    const X = (await org.owner.post('/api/v1/spaces', { name: 'Живой проект', kind: 'project', visibility: 'private' })).space;
    const membership = (await org.owner.put('/api/v1/grants', { resourceType: 'space', resourceId: X.id, subjectType: 'user', subjectId: gina.id, level: 'view' })).grant;
    const page = (await org.owner.post('/api/v1/pages', { spaceId: org.personalSpaceId, title: 'Общая правка' })).page;
    const g = (await org.owner.put('/api/v1/grants', { resourceType: 'page', resourceId: page.id, subjectType: 'space', subjectId: X.id, level: 'edit', expiresAt: new Date(Date.now() + 3600_000).toISOString() })).grant;
    const c = await openClient(ts.url, gina, page.id);
    expect(c.provider.canEdit).toBe(true);
    // The grant to "members of X" expires.
    await ts.db.query(`update grants set expires_at = now() + interval '300 milliseconds' where id = $1`, [g.id]);
    await sleep(500);
    await ts.srv.services.hub.checkExpirations();
    await waitFor(() => c.provider.status === 'error', 5000, 'channel closed after expiry');
    c.close();

    // Again with a fresh grant; this time Gina's membership of X is revoked — the live channel closes as well.
    await org.owner.put('/api/v1/grants', { resourceType: 'page', resourceId: page.id, subjectType: 'space', subjectId: X.id, level: 'edit' });
    const c2 = await openClient(ts.url, gina, page.id);
    expect(c2.provider.canEdit).toBe(true);
    await org.owner.del(`/api/v1/grants/${membership.id}`);
    await waitFor(() => c2.provider.status === 'error', 5000, 'channel closed after leaving X');
    c2.close();
  });
});
