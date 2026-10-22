import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startServer, setupOrg, expectStatus, type TestServer } from '../support/harness.js';

let ts: TestServer;
let org: Awaited<ReturnType<typeof setupOrg>>;

beforeAll(async () => {
  ts = await startServer({}, { worker: true }); // worker builds the search index
  org = await setupOrg(ts);
});
afterAll(async () => ts?.close());

async function privateSpace(name: string, extra: Record<string, unknown> = {}) {
  return (await org.owner.post('/api/v1/spaces', { name, kind: 'project', visibility: 'private', ...extra })).space;
}

describe('revisions: pre-restore snapshot', () => {
  it('restore saves the current state as a "pre-restore" revision (QA26-15)', async () => {
    const page = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Версионируемая' })).page;
    const v1 = (await org.owner.post(`/api/v1/pages/${page.id}/revisions`, { label: 'v1' })).revision;
    await org.owner.patch(`/api/v1/pages/${page.id}`, { title: 'Переименована' });
    const r = await org.owner.post(`/api/v1/pages/${page.id}/revisions/${v1.id}/restore`);
    const revs = (await org.owner.get(`/api/v1/pages/${page.id}/revisions`)).revisions;
    const pre = revs.find((x: any) => x.id === r.preRestore.id);
    expect(pre.kind).toBe('pre-restore');
    expect(pre.label).toBe(`Перед восстановлением версии ${v1.number}`);
    expect(pre.title).toBe('Переименована');
    expect(revs.find((x: any) => x.id === r.revision.id).kind).toBe('restore');
    expect((await org.owner.get(`/api/v1/pages/${page.id}/revisions?kind=pre-restore`)).revisions.map((x: any) => x.id)).toEqual([pre.id]);
  });
});

describe('access requests notify everyone who can share', () => {
  it('space managers (direct and via group) are notified about a page request; the requester is not (R-ACL-043)', async () => {
    const dept = (await org.owner.post('/api/v1/admin/groups', { name: 'Руководители проекта', kind: 'department' })).group.id;
    const sp = await privateSpace('Проект запросов', { groups: [{ groupId: dept, level: 'full' }] });
    const manager = await org.user('Менеджер пространства');
    await org.owner.put('/api/v1/grants', { resourceType: 'space', resourceId: sp.id, subjectType: 'user', subjectId: manager.id, level: 'full' });
    const lead = await org.user('Руководитель', { groupIds: [dept] });
    const editor = await org.user('Редактор проекта');
    await org.owner.put('/api/v1/grants', { resourceType: 'space', resourceId: sp.id, subjectType: 'user', subjectId: editor.id, level: 'edit' });
    const page = (await org.owner.post('/api/v1/pages', { spaceId: sp.id, title: 'Закрытая страница' })).page;
    const requester = await org.user('Просящий');
    const req = (await requester.post('/api/v1/access-requests', { resourceType: 'page', resourceId: page.id, level: 'view', reason: 'нужно для работы' })).request;
    const has = async (api: any) => (await api.get('/api/v1/notifications')).notifications.some((n: any) => n.type === 'access_request' && n.data.requestId === req.id);
    expect(await has(org.owner)).toBe(true); // space creator (inherited full)
    expect(await has(manager)).toBe(true); // direct full grant on the space
    expect(await has(lead)).toBe(true); // full via department
    expect(await has(editor)).toBe(false); // edit without share right
    expect(await has(requester)).toBe(false);
  });

  it('a requester who can already share is not notified about their own request', async () => {
    const sp = await privateSpace('Самозапрос');
    const page = (await org.owner.post('/api/v1/pages', { spaceId: sp.id, title: 'Своя' })).page;
    const req = (await org.owner.post('/api/v1/access-requests', { resourceType: 'space', resourceId: sp.id, level: 'edit' })).request;
    expect((await org.owner.get('/api/v1/notifications')).notifications.some((n: any) => n.data?.requestId === req.id)).toBe(false);
    void page;
  });
});

describe('audience preview when widening access', () => {
  it('audience_change conflict lists who would newly gain access; preview endpoint computes added/removed (R-ACL-014)', async () => {
    const sp = await privateSpace('Секретный проект');
    const page = (await org.owner.post('/api/v1/pages', { spaceId: sp.id, title: 'План' })).page;
    const a = await org.user('Аркадий Новый');
    const guest = await org.user('Гость Внешний', { kind: 'guest', accessExpiresAt: new Date(Date.now() + 86400_000).toISOString() });
    const err = await expectStatus(org.owner.put('/api/v1/grants', { resourceType: 'page', resourceId: page.id, subjectType: 'org', subjectId: null, level: 'view' }), 409);
    expect(err.error.code).toBe('audience_change');
    const preview = err.error.details.preview;
    expect(preview.addedCount).toBeGreaterThanOrEqual(1);
    expect(preview.added.length).toBe(Math.min(50, preview.addedCount));
    expect(preview.added.map((x: any) => x.name)).toContain('Аркадий Новый');
    expect(preview.added.map((x: any) => x.id)).not.toContain(guest.id); // 'org' never includes guests
    expect(preview.added.map((x: any) => x.id)).not.toContain(org.owner.user.id); // already has access
    expect(preview.removedCount).toBe(0);
    // Bulk apply reports the same preview.
    const bulk = await expectStatus(org.owner.post('/api/v1/grants/bulk', { apply: true, grants: [{ resourceType: 'page', resourceId: page.id, subjectType: 'org', subjectId: null, level: 'view' }] }), 409);
    expect(bulk.error.details.preview.addedCount).toBe(preview.addedCount);

    const one = await org.owner.post(`/api/v1/pages/${page.id}/access/preview`, { subjectType: 'user', subjectId: a.id, level: 'comment' });
    expect(one.added).toEqual([{ id: a.id, name: 'Аркадий Новый', level: 'comment' }]);
    expect(one.addedCount).toBe(1);
    expect(one.removedCount).toBe(0);
    expect(one.subjects.gained[0]).toMatchObject({ subjectType: 'user', subjectId: a.id, to: 'comment', subject: { name: 'Аркадий Новый' } });
    await org.owner.put('/api/v1/grants', { resourceType: 'page', resourceId: page.id, subjectType: 'user', subjectId: a.id, level: 'view' });
    const deny = await org.owner.post(`/api/v1/pages/${page.id}/access/preview`, { subjectType: 'user', subjectId: a.id, level: 'none' });
    expect(deny.removed.map((x: any) => x.id)).toEqual([a.id]);
    expect(deny.addedCount).toBe(0);
    await expectStatus(a.post(`/api/v1/pages/${page.id}/access/preview`, { subjectType: 'org', subjectId: null, level: 'view' }), 403);
    const stranger = await org.user('Посторонний');
    await expectStatus(stranger.post(`/api/v1/pages/${page.id}/access/preview`, { subjectType: 'org', subjectId: null, level: 'view' }), 404);
  });
});

describe('comments: mentions and delete rights', () => {
  it('returns stored mentions and a per-comment canDelete flag', async () => {
    const page = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Обсуждаемая' })).page;
    const commenter = await org.user('Комментатор');
    await org.owner.put('/api/v1/grants', { resourceType: 'page', resourceId: page.id, subjectType: 'user', subjectId: commenter.id, level: 'comment' });
    const mine = (await commenter.post(`/api/v1/pages/${page.id}/comments`, { text: 'Посмотрите, @Анна', mentions: [org.owner.user.id] })).comment;
    await org.owner.post(`/api/v1/pages/${page.id}/comments`, { threadId: mine.threadId, text: 'Ответ владельца' });
    const forOwner = (await org.owner.get(`/api/v1/pages/${page.id}/comments`)).threads[0].comments;
    expect(forOwner[0].mentions).toEqual([org.owner.user.id]);
    expect(forOwner[1].mentions).toEqual([]);
    expect(forOwner.every((c: any) => c.canDelete)).toBe(true); // full access
    const forCommenter = (await commenter.get(`/api/v1/pages/${page.id}/comments`)).threads[0].comments;
    expect(forCommenter.map((c: any) => c.canDelete)).toEqual([true, false]);
    await commenter.patch(`/api/v1/comments/${mine.id}`, { text: 'Исправлено' });
    expect((await org.owner.get(`/api/v1/pages/${page.id}/comments`)).threads[0].comments[0].mentions).toEqual([org.owner.user.id]);
    await expectStatus(commenter.del(`/api/v1/comments/${forCommenter[1].id}`), 403);
    const reader = await org.user('Читатель комментариев');
    const forReader = (await reader.get(`/api/v1/pages/${page.id}/comments`)).threads[0].comments;
    expect(forReader.every((c: any) => !c.canDelete)).toBe(true);
  });
});

describe('page DTO: approval and published info', () => {
  it('shows the pending approval while in review and the published revision afterwards', async () => {
    const sp = await privateSpace('Согласования');
    const author = await org.user('Автор');
    await org.owner.put('/api/v1/grants', { resourceType: 'space', resourceId: sp.id, subjectType: 'user', subjectId: author.id, level: 'edit', canPublish: false });
    const page = (await author.post('/api/v1/pages', { spaceId: sp.id, title: 'Положение' })).page;
    expect(page.approval).toBeNull();
    expect(page.published).toBeNull();
    const { approval } = await author.post(`/api/v1/pages/${page.id}/submit-review`, { message: 'Проверьте' });
    const inReview = (await author.get(`/api/v1/pages/${page.id}`)).page;
    expect(inReview.status).toBe('review');
    expect(inReview.approval).toMatchObject({ id: approval.id, requestedBy: { id: author.id, name: 'Автор' }, message: 'Проверьте' });
    expect(inReview.approval.approvers.map((x: any) => x.id)).toEqual([org.owner.user.id]);
    expect(inReview.approval.createdAt).toBeTruthy();
    const decided = await org.owner.post(`/api/v1/pages/${page.id}/approvals/${approval.id}/decide`, { decision: 'approve' });
    const after = (await author.get(`/api/v1/pages/${page.id}`)).page;
    expect(after.approval).toBeNull();
    expect(after.published).toMatchObject({ revisionId: decided.published.revisionId, number: decided.published.number });
    expect(new Date(after.published.at).getTime()).toBeGreaterThan(0);
    expect(after.publishedRevisionId).toBe(decided.published.revisionId);
  });
});

describe('admin: users, settings, transfer preview', () => {
  it('filters users by role, q and status; returns a single user card', async () => {
    const dept = (await org.owner.post('/api/v1/admin/groups', { name: 'Аудит', kind: 'department' })).group.id;
    const auditor = await org.user('Ревизор Иванов', { orgRole: 'auditor', groupIds: [dept] });
    await org.owner.patch(`/api/v1/admin/users/${auditor.id}`, { managerId: org.owner.user.id });
    await org.user('Ревизор Петров');
    const byRole = await org.owner.get('/api/v1/admin/users?role=auditor&q=' + encodeURIComponent('Ревизор'));
    expect(byRole.users.map((u: any) => u.id)).toEqual([auditor.id]);
    expect(byRole.total).toBe(1);
    expect((await org.owner.get('/api/v1/admin/users?role=auditor&status=suspended')).users).toEqual([]);
    expect((await org.owner.get('/api/v1/admin/users?q=' + encodeURIComponent('Ревизор'))).users.length).toBe(2);
    await expectStatus(org.owner.get('/api/v1/admin/users?role=superuser'), 400);
    const card = (await org.owner.get(`/api/v1/admin/users/${auditor.id}`)).user;
    expect(card).toMatchObject({ id: auditor.id, name: 'Ревизор Иванов', org_role: 'auditor', manager_id: org.owner.user.id, manager_name: 'Анна Владелец', owned_pages: 0 });
    expect(card.groups.map((g: any) => g.name)).toEqual(['Аудит']);
    await expectStatus(org.owner.get('/api/v1/admin/users/00000000-0000-4000-8000-000000000000'), 404);
    await expectStatus(auditor.get(`/api/v1/admin/users/${auditor.id}`), 403);
  });

  it('oidcJitProvisioning setting is stored and audited', async () => {
    expect((await org.owner.get('/api/v1/admin/settings')).settings.oidcJitProvisioning).toBe(false);
    const r = await org.owner.patch('/api/v1/admin/settings', { oidcJitProvisioning: true });
    expect(r.settings.oidcJitProvisioning).toBe(true);
    expect((await org.owner.get('/api/v1/admin/settings')).settings.oidcJitProvisioning).toBe(true);
    const ev = (await org.owner.get('/api/v1/audit?action=org.settings_update')).events[0];
    expect(ev.details.after.oidcJitProvisioning).toBe(true);
    await expectStatus(org.owner.patch('/api/v1/admin/settings', { oidcJitProvisioning: 'yes' }), 400);
    await org.owner.patch('/api/v1/admin/settings', { oidcJitProvisioning: false });
  });

  it('transfer preview reports the number of owned pages', async () => {
    const u = await org.user('Уходящий');
    const sp = await privateSpace('Проект уходящего', { users: [{ userId: u.id, level: 'edit' }] });
    await u.post('/api/v1/pages', { spaceId: sp.id, title: 'Моя 1' });
    await u.post('/api/v1/pages', { spaceId: sp.id, title: 'Моя 2' });
    await u.post('/api/v1/pages', { spaceId: (await u.get('/api/v1/auth/me')).personalSpaceId, title: 'Личная' }); // personal pages are not transferred
    const r = await org.owner.post(`/api/v1/admin/users/${u.id}/transfer-preview`, {});
    expect(r.ownedPages).toBe(2);
    expect(Array.isArray(r.changes)).toBe(true);
  });
});

describe('trash: path, purgeAt and space purge', () => {
  it('trash rows include the parent path (hidden ancestors as …) and purgeAt', async () => {
    const sp = await privateSpace('Корзина-проект');
    const parent = (await org.owner.post('/api/v1/pages', { spaceId: sp.id, title: 'Раздел' })).page;
    const child = (await org.owner.post('/api/v1/pages', { spaceId: sp.id, parentId: parent.id, title: 'Подраздел' })).page;
    const leaf = (await org.owner.post('/api/v1/pages', { spaceId: sp.id, parentId: child.id, title: 'Лист' })).page;
    const u = await org.user('Удаляющий');
    await org.owner.put('/api/v1/grants', { resourceType: 'page', resourceId: leaf.id, subjectType: 'user', subjectId: u.id, level: 'full' });
    await u.del(`/api/v1/pages/${leaf.id}`);
    const mine = (await u.get('/api/v1/trash')).pages.find((p: any) => p.id === leaf.id);
    expect(mine.path).toEqual(['…', '…']);
    const settings = (await org.owner.get('/api/v1/admin/settings')).settings;
    expect(new Date(mine.purgeAt).getTime() - new Date(mine.deleted_at).getTime()).toBe(settings.retention.trashDays * 86400_000);
    const own = (await org.owner.get('/api/v1/trash')).pages.find((p: any) => p.id === leaf.id);
    expect(own.path).toEqual(['Раздел', 'Подраздел']);
  });

  it('org admin can permanently purge a deleted space (audited, legal hold respected)', async () => {
    const sp = await privateSpace('Удаляемое');
    const p1 = (await org.owner.post('/api/v1/pages', { spaceId: sp.id, title: 'Страница 1' })).page;
    await org.owner.post('/api/v1/pages', { spaceId: sp.id, parentId: p1.id, title: 'Страница 2' });
    await org.owner.post(`/api/v1/pages/${p1.id}/comments`, { text: 'комментарий' });
    const manager = await org.user('Менеджер удаляемого');
    await org.owner.put('/api/v1/grants', { resourceType: 'space', resourceId: sp.id, subjectType: 'user', subjectId: manager.id, level: 'full' });
    await expectStatus(org.owner.del(`/api/v1/trash/spaces/${sp.id}`, { confirm: true }), 404); // not in trash yet
    await org.owner.del(`/api/v1/spaces/${sp.id}`, { confirmName: 'Удаляемое' });
    const trashed = (await org.owner.get('/api/v1/trash/spaces')).spaces.find((x: any) => x.id === sp.id);
    expect(new Date(trashed.purgeAt).getTime()).toBeGreaterThan(new Date(trashed.deleted_at).getTime());
    await expectStatus(manager.del(`/api/v1/trash/spaces/${sp.id}`, { confirm: true }), 403);
    await expectStatus(org.owner.del(`/api/v1/trash/spaces/${sp.id}`, {}), 400);
    const r = await org.owner.del(`/api/v1/trash/spaces/${sp.id}`, { confirm: true });
    expect(r.purged).toBe(2);
    expect((await org.owner.get('/api/v1/trash/spaces')).spaces.find((x: any) => x.id === sp.id)).toBeUndefined();
    await expectStatus(org.owner.get(`/api/v1/pages/${p1.id}`), 404);
    expect((await ts.db.query('select count(*)::int c from spaces where id = $1', [sp.id])).rows[0].c).toBe(0);
    const ev = (await org.owner.get(`/api/v1/audit?action=space.purge&targetId=${sp.id}`)).events;
    expect(ev[0].details).toMatchObject({ name: 'Удаляемое', pages: 2 });

    const held = await privateSpace('На удержании');
    await org.owner.post('/api/v1/pages', { spaceId: held.id, title: 'Документ' });
    await org.owner.del(`/api/v1/spaces/${held.id}`, { confirmName: 'На удержании' });
    await ts.db.query('update spaces set legal_hold = true where id = $1', [held.id]);
    await expectStatus(org.owner.del(`/api/v1/trash/spaces/${held.id}`, { confirm: true }), 403);
    expect((await ts.db.query('select count(*)::int c from pages where space_id = $1', [held.id])).rows[0].c).toBe(1);
  });
});

describe('templates from content', () => {
  const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Повестка дня' }] }] };

  it('creates a template directly from ProseMirror JSON and uses it for new pages', async () => {
    const t = (await org.owner.post('/api/v1/templates', { name: 'Протокол встречи', description: 'Шаблон протокола', category: 'Встречи', icon: '📝', title: 'Протокол от …', content: doc })).template;
    expect(t).toMatchObject({ name: 'Протокол встречи', category: 'Встречи', icon: '📝', default_title: 'Протокол от …', space_id: null });
    const listed = (await org.owner.get('/api/v1/templates')).templates.find((x: any) => x.id === t.id);
    expect(listed.default_title).toBe('Протокол от …');
    const page = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, templateId: t.id })).page;
    expect(page.title).toBe('Протокол от …');
    const content = (await org.owner.get(`/api/v1/pages/${page.id}/content`)).content;
    expect(JSON.stringify(content)).toContain('Повестка дня');
  });

  it('validates content against the editor schema and requires exactly one source', async () => {
    await expectStatus(org.owner.post('/api/v1/templates', { name: 'Плохой', content: { type: 'doc', content: [{ type: 'нет-такого-узла' }] } }), 400);
    await expectStatus(org.owner.post('/api/v1/templates', { name: 'Плохой', content: { type: 'paragraph' } }), 400);
    await expectStatus(org.owner.post('/api/v1/templates', { name: 'Пустой' }), 400);
    const page = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Источник' })).page;
    await expectStatus(org.owner.post('/api/v1/templates', { name: 'Оба', pageId: page.id, content: doc }), 400);
    const member = await org.user('Участник шаблонов');
    await expectStatus(member.post('/api/v1/templates', { name: 'Организационный', content: doc }), 403);
    // Saving a page as a template still works.
    expect((await org.owner.post('/api/v1/templates', { name: 'Из страницы', pageId: page.id })).template.name).toBe('Из страницы');
  });
});

describe('search: did you mean', () => {
  it('suggests a corrected query when nothing is found (R-SEARCH-004)', async () => {
    const page = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Регламент командировок' })).page;
    const hidden = (await org.owner.post('/api/v1/pages', { spaceId: org.personalSpaceId, title: 'Квартальный бюджет' })).page;
    const reader = await org.user('Ищущий подсказки');
    let ok = null;
    for (let i = 0; i < 50 && !ok; i++) {
      const r = await reader.get('/api/v1/search?q=' + encodeURIComponent('командировок'));
      if (r.total) ok = r;
      else await new Promise((res) => setTimeout(res, 100));
    }
    expect(ok.results[0].pageId).toBe(page.id);
    expect(ok.didYouMean).toBeNull();
    const miss = await reader.get('/api/v1/search?q=' + encodeURIComponent('кмандирвок'));
    expect(miss.total).toBe(0);
    expect(miss.didYouMean).toBe('командировок');
    const fixed = await reader.get('/api/v1/search?q=' + encodeURIComponent(miss.didYouMean));
    expect(fixed.results.map((r: any) => r.pageId)).toContain(page.id);
    // Misspelled and typed in the wrong keyboard layout ("кмандирвок" in EN layout).
    expect((await reader.get('/api/v1/search?q=rvfylbhdjr')).didYouMean).toBe('командировок');
    // Titles the user cannot see are never suggested.
    const secret = await reader.get('/api/v1/search?q=' + encodeURIComponent('квртальный'));
    expect(secret.total).toBe(0);
    expect(secret.didYouMean).toBeNull();
    void hidden;
  });
});
