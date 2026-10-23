import { test, expect, type Page } from '@playwright/test';
import { ensureOwner, createUser } from './helpers';
import { call, failWith, humanDoubleClick, pageErrors, signedIn, slow, toasts, uniq } from './qa-admin-helpers';

/**
 * Action × condition tests of groups and departments, organisation settings, the audit log and expiring access
 * (apps/web/src/admin/GroupsSection.tsx, OrgSettingsSection.tsx, AuditSection.tsx, ExpiringSection.tsx) — the critical
 * actions docs/qa/ACTION_MATRIX.md listed as uncovered (QA26-01, QA26-03, R-QA-004, R-QA-029, R-UI-061). Every
 * outcome is checked on the server through the API, not only on screen.
 */

interface Group {
  id: string;
  name: string;
  kind: string;
  members: number;
}
interface Member {
  id: string;
  name: string;
  role: 'member' | 'manager';
  expires_at: string | null;
}
const groups = async (page: Page) => (await call<{ groups: Group[] }>(page, 'GET', '/api/v1/admin/groups')).groups;
const members = async (page: Page, id: string) => (await call<{ members: Member[] }>(page, 'GET', `/api/v1/admin/groups/${id}/members`)).members;

async function openGroup(page: Page, name: string) {
  await page.goto('/admin/groups');
  await page.getByLabel('Поиск групп').fill(name);
  await page.getByRole('button', { name: new RegExp(name) }).first().click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
}

test('QA admin org setup', async ({ page }) => {
  await ensureOwner(page);
});

test('R-QA-004 «Группа»: empty name disabled, server error keeps the dialog, slow network + double click creates exactly one group which opens', async ({ page }) => {
  const errors = pageErrors(page);
  await ensureOwner(page);
  await page.goto('/admin/groups');
  await page.getByRole('button', { name: 'Группа', exact: true }).click();
  const dlg = page.getByRole('dialog', { name: 'Новая группа' });
  const create = dlg.getByRole('button', { name: 'Создать' });
  await expect(create).toBeDisabled(); // empty
  const name = `Проектная группа ${uniq()}`;
  await dlg.getByLabel('Название').fill(name);
  await failWith(page, '**/api/v1/admin/groups', 'POST');
  await create.click();
  await expect(dlg.getByRole('alert')).toContainText('Внутренняя ошибка сервера');
  await page.unroute('**/api/v1/admin/groups');
  const sent = await slow(page, '**/api/v1/admin/groups', 'POST', 800);
  await humanDoubleClick(page, create);
  await expect(toasts(page)).toContainText('Группа создана');
  expect(sent.n).toBe(1);
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  expect((await groups(page)).filter((g) => g.name === name)).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('QA-A1 (fixed): an instantaneous double activation of «Создать» in «Новая группа» creates one group', async ({ page }) => {
  await ensureOwner(page);
  await page.goto('/admin/groups');
  await page.getByRole('button', { name: 'Группа', exact: true }).click();
  const dlg = page.getByRole('dialog', { name: 'Новая группа' });
  const name = `Двойная группа ${uniq()}`;
  await dlg.getByLabel('Название').fill(name);
  const sent = await slow(page, '**/api/v1/admin/groups', 'POST', 500);
  await dlg.getByRole('button', { name: 'Создать' }).dblclick();
  await expect(toasts(page)).toContainText('Группа создана');
  await page.waitForTimeout(700);
  expect(sent.n).toBe(1);
  expect((await groups(page)).filter((g) => g.name === name)).toHaveLength(1);
});

test('R-QA-004 group members: add with «Роль» = manager and «До (необязательно)»; change «Роль {name}» (server error reverts it); «Исключить участника?» — cancel keeps, confirm removes', async ({ page }) => {
  const errors = pageErrors(page);
  await ensureOwner(page);
  const tag = uniq();
  const g = (await call<{ group: { id: string } }>(page, 'POST', '/api/v1/admin/groups', { name: `Участники ${tag}`, kind: 'group' })).group.id;
  const u = await createUser(page.request, `Лев Участник ${tag}`);
  await openGroup(page, `Участники ${tag}`);
  const add = page.getByRole('button', { name: 'Добавить', exact: true });
  await expect(add).toBeDisabled(); // nobody picked
  await page.getByLabel('Добавить участника').fill(tag);
  await page.getByRole('option', { name: new RegExp(u.name) }).click();
  await page.getByLabel('Роль', { exact: true }).selectOption('manager');
  await page.getByLabel('До (необязательно)').fill('2030-01-15T10:00');
  await add.click();
  await expect(toasts(page)).toContainText(`${u.name} добавлен(а)`);
  let m = (await members(page, g)).find((x) => x.id === u.id)!;
  expect(m.role).toBe('manager');
  expect(new Date(m.expires_at!).getUTCFullYear()).toBe(2030);
  // the row role: server error reverts the select
  const rowRole = page.getByLabel(`Роль ${u.name}`);
  await expect(rowRole).toHaveValue('manager');
  await failWith(page, `**/api/v1/admin/groups/${g}/members/${u.id}`, 'PUT');
  await rowRole.selectOption('member');
  await expect(toasts(page)).toContainText('Внутренняя ошибка сервера');
  await expect(rowRole).toHaveValue('manager');
  await page.unroute(`**/api/v1/admin/groups/${g}/members/${u.id}`);
  await rowRole.selectOption('member');
  await expect.poll(async () => (await members(page, g)).find((x) => x.id === u.id)?.role).toBe('member');
  m = (await members(page, g)).find((x) => x.id === u.id)!;
  expect(m.expires_at).not.toBeNull(); // the expiry is kept when only the role changes
  // remove: cancel, then confirm
  await page.getByRole('button', { name: `Исключить ${u.name}` }).click();
  const ask = page.getByRole('dialog', { name: 'Исключить участника?' });
  await ask.getByRole('button', { name: 'Отмена' }).click();
  await expect(ask).toBeHidden();
  expect(await members(page, g)).toHaveLength(1);
  await page.getByRole('button', { name: `Исключить ${u.name}` }).click();
  await ask.getByRole('button', { name: 'Исключить' }).click();
  await expect(toasts(page)).toContainText('Участник исключён');
  expect(await members(page, g)).toHaveLength(0);
  await expect(page.getByRole('heading', { name: 'Нет участников' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('R-QA-004 «Удалить» group: «Удалить «…»?» needs the typed name when the group has members; cancel keeps it; server error keeps it; confirm deletes it', async ({ page }) => {
  const errors = pageErrors(page);
  await ensureOwner(page);
  const tag = uniq();
  const name = `Удаляемая ${tag}`;
  const g = (await call<{ group: { id: string } }>(page, 'POST', '/api/v1/admin/groups', { name, kind: 'group' })).group.id;
  const u = await createUser(page.request, `Ева Удаляемая ${tag}`);
  await call(page, 'PUT', `/api/v1/admin/groups/${g}/members/${u.id}`, { role: 'member' });
  await openGroup(page, name);
  await page.getByRole('button', { name: 'Удалить', exact: true }).click();
  const ask = page.getByRole('dialog', { name: `Удалить «${name}»?` });
  const confirmBtn = ask.getByRole('button', { name: 'Удалить' });
  await expect(confirmBtn).toBeDisabled(); // the name must be typed
  await ask.getByLabel(/Для подтверждения введите/).fill('не то');
  await expect(confirmBtn).toBeDisabled();
  await ask.getByRole('button', { name: 'Отмена' }).click();
  expect((await groups(page)).some((x) => x.id === g)).toBe(true);
  await failWith(page, `**/api/v1/admin/groups/${g}`, 'DELETE');
  await page.getByRole('button', { name: 'Удалить', exact: true }).click();
  await ask.getByLabel(/Для подтверждения введите/).fill(name);
  await confirmBtn.click();
  await expect(toasts(page)).toContainText('Внутренняя ошибка сервера');
  expect((await groups(page)).some((x) => x.id === g)).toBe(true);
  await page.unroute(`**/api/v1/admin/groups/${g}`);
  await page.getByRole('button', { name: 'Удалить', exact: true }).click();
  await ask.getByLabel(/Для подтверждения введите/).fill(name);
  await confirmBtn.click();
  await expect(toasts(page)).toContainText('Удалено');
  expect((await groups(page)).some((x) => x.id === g)).toBe(false);
  await expect(page.getByRole('heading', { name: 'Выберите отдел или группу' })).toBeVisible();
  // the member is not deleted, only excluded
  const users = await call<{ users: Array<{ id: string; groups: unknown[] }> }>(page, 'GET', `/api/v1/admin/users?q=${encodeURIComponent(u.email)}`);
  expect(users.users[0].groups).toHaveLength(0);
  expect(errors).toEqual([]);
});

test('R-QA-004 «Сохранить» organisation settings: nothing changed — disabled; out-of-range value is explained and blocks saving; «Отменить изменения» restores; policy change asks «Применить изменения политики?» (cancel saves nothing); server error and offline keep the form', async ({ page, context }) => {
  const errors = pageErrors(page);
  await ensureOwner(page);
  const settings = async () => (await call<{ settings: { quotaPerUserMb: number; guestsEnabled: boolean; retention: { trashDays: number } } }>(page, 'GET', '/api/v1/admin/settings')).settings;
  const before = await settings();
  await page.goto('/admin/settings');
  const save = page.getByRole('button', { name: 'Сохранить', exact: true });
  await expect(save).toBeDisabled();
  // validation (empty / out of range)
  const trash = page.getByLabel('Срок хранения в корзине');
  await trash.fill('5');
  await expect(page.getByText('Допустимо от 30 до 3 650')).toBeVisible();
  await expect(save).toBeDisabled();
  await trash.fill('');
  await expect(save).toBeDisabled();
  await page.getByRole('button', { name: 'Отменить изменения' }).click();
  await expect(trash).toHaveValue(String(before.retention.trashDays));
  await expect(save).toBeDisabled();
  // a plain value: saved without a question
  const quota = page.getByLabel('Квота файлов на пользователя');
  await quota.fill(String(before.quotaPerUserMb + 7));
  // server error and offline: the input stays
  await failWith(page, '**/api/v1/admin/settings', 'PATCH');
  await save.click();
  await expect(page.getByRole('alert')).toContainText('Внутренняя ошибка сервера');
  await page.unroute('**/api/v1/admin/settings');
  await context.setOffline(true);
  await save.click();
  await expect(page.getByRole('alert')).toContainText('Нет связи с сервером');
  await context.setOffline(false);
  await expect(quota).toHaveValue(String(before.quotaPerUserMb + 7));
  expect((await settings()).quotaPerUserMb).toBe(before.quotaPerUserMb);
  await save.click();
  await expect(toasts(page)).toContainText('Настройки организации сохранены');
  expect((await settings()).quotaPerUserMb).toBe(before.quotaPerUserMb + 7);
  await expect(save).toBeDisabled();
  // a policy change asks first (disabling guests)
  await page.getByLabel('Гостевые учётные записи').uncheck();
  await save.click();
  const ask = page.getByRole('dialog', { name: 'Применить изменения политики?' });
  await expect(ask).toContainText('Новых гостей нельзя будет приглашать.');
  await ask.getByRole('button', { name: 'Отмена' }).click();
  expect((await settings()).guestsEnabled).toBe(true);
  await save.click();
  await ask.getByRole('button', { name: 'Применить' }).click();
  await expect.poll(async () => (await settings()).guestsEnabled).toBe(false);
  await expect(save).toBeDisabled();
  // restore for the other tests
  await call(page, 'PATCH', '/api/v1/admin/settings', { guestsEnabled: true, quotaPerUserMb: before.quotaPerUserMb });
  expect(errors).toEqual([]);
});

test('QA-A4 (fixed) no permission: an auditor opening /admin/settings lands on the audit log once (no redirect loop); no organisation settings; the settings API refuses', async ({ page, browser }) => {
  await ensureOwner(page);
  const aud = await createUser(page.request, 'Аркадий Аудитор');
  await call(page, 'PATCH', `/api/v1/admin/users/${aud.id}`, { orgRole: 'auditor' });
  const a = await signedIn(browser, aud, '/admin');
  await a.p.goto('/admin/settings');
  await expect(a.p.getByRole('link', { name: 'Настройки организации' })).toHaveCount(0);
  await expect(a.p.getByRole('button', { name: 'Сохранить', exact: true })).toHaveCount(0);
  await expect(a.p).toHaveURL(/\/admin\/audit/);
  expect((await a.p.request.patch('/api/v1/admin/settings', { data: { quotaPerUserMb: 11 } })).status()).toBeGreaterThanOrEqual(400);
  await a.ctx.close();
});

test('R-QA-004 audit log: «Загрузить ещё» appends the next page (slow network shows progress, one request per click); «Сбросить» clears applied filters; a filter with no events shows the empty state', async ({ page }) => {
  const errors = pageErrors(page);
  await ensureOwner(page);
  // more than one page (100) of group events
  const tag = uniq();
  for (let i = 0; i < 55; i++) {
    const g = (await call<{ group: { id: string } }>(page, 'POST', '/api/v1/admin/groups', { name: `Аудит ${tag} ${i}`, kind: 'group' })).group.id;
    await call(page, 'DELETE', `/api/v1/admin/groups/${g}`, { confirm: true });
  }
  await page.goto('/admin/audit');
  await page.getByLabel('Код действия').fill('group.');
  await page.getByRole('button', { name: 'Применить' }).click();
  await expect(page.getByText('Показано: 100')).toBeVisible();
  const more = page.getByRole('button', { name: 'Загрузить ещё' });
  const sent = await slow(page, /\/api\/v1\/audit\?.*before=/, 'GET', 800);
  await humanDoubleClick(page, more);
  await expect(more).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByText(/Показано: (1[1-9]\d|[2-9]\d\d)/)).toBeVisible();
  expect(sent.n).toBe(1);
  // empty state for a filter matching nothing, then «Сбросить»
  await page.getByLabel('Код действия').fill(`no.such.action.${tag}`);
  await page.getByRole('button', { name: 'Применить' }).click();
  await expect(page.getByRole('heading', { name: 'Нет событий по заданным условиям' })).toBeVisible();
  await page.getByRole('button', { name: 'Сбросить' }).click();
  await expect(page.getByLabel('Код действия')).toHaveValue('');
  await expect(page.getByText('Показано: 100')).toBeVisible();
  expect(errors).toEqual([]);
});

test('QA-A3 (fixed): a failed «Загрузить ещё» keeps the audit rows already loaded and offers a retry next to the button', async ({ page }) => {
  await ensureOwner(page);
  await page.goto('/admin/audit');
  await page.getByLabel('Код действия').fill('group.');
  await page.getByRole('button', { name: 'Применить' }).click();
  await expect(page.getByText('Показано: 100')).toBeVisible();
  await failWith(page, /\/api\/v1\/audit\?.*before=/, 'GET');
  await page.getByRole('button', { name: 'Загрузить ещё' }).click();
  await expect(page.getByRole('alert')).toContainText('Внутренняя ошибка сервера');
  await expect(page.getByText('Показано: 100')).toBeVisible(); // the loaded page is still there
  await expect(page.locator('tbody tr')).toHaveCount(100);
  await page.unroute(/\/api\/v1\/audit\?.*before=/);
  await page.getByRole('button', { name: 'Загрузить ещё' }).click();
  await expect(page.getByText(/Показано: (1[1-9]\d|[2-9]\d\d)/)).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('R-QA-004 expiring access: «Отозвать доступ {…}» — «Отозвать доступ сейчас?» cancel keeps the grant, server error keeps it, confirm revokes it; search with no match shows the empty state', async ({ page }) => {
  const errors = pageErrors(page);
  await ensureOwner(page);
  const tag = uniq();
  const u = await createUser(page.request, `Вика Временная ${tag}`);
  const spaces = await call<{ spaces: Array<{ id: string; isPersonal: boolean }> }>(page, 'GET', '/api/v1/spaces');
  const personal = spaces.spaces.find((s) => s.isPersonal)!.id;
  const pageId = (await call<{ page: { id: string } }>(page, 'POST', '/api/v1/pages', { spaceId: personal, title: `Временный доступ ${tag}` })).page.id;
  const expires = new Date(Date.now() + 3 * 86400_000).toISOString();
  await call(page, 'PUT', '/api/v1/grants', { resourceType: 'page', resourceId: pageId, subjectType: 'user', subjectId: u.id, level: 'comment', expiresAt: expires });
  const grantId = async () => (await call<{ grants: Array<{ id: string; resource_id: string }> }>(page, 'GET', '/api/v1/admin/grants/expiring')).grants.find((g) => g.resource_id === pageId)?.id;
  expect(await grantId()).toBeTruthy();
  await page.goto('/admin/expiring');
  await page.locator('.admin-page').getByLabel('Поиск', { exact: true }).fill(tag);
  await page.getByLabel('Период').selectOption('7');
  const revokeBtn = page.getByRole('button', { name: `Отозвать доступ ${u.name}` });
  await revokeBtn.click();
  const ask = page.getByRole('dialog', { name: 'Отозвать доступ сейчас?' });
  await expect(ask).toContainText(`«Временный доступ ${tag}»`);
  await ask.getByRole('button', { name: 'Отмена' }).click();
  expect(await grantId()).toBeTruthy();
  const id = (await grantId())!;
  await failWith(page, `**/api/v1/grants/${id}`, 'DELETE');
  await revokeBtn.click();
  await ask.getByRole('button', { name: 'Отозвать' }).click();
  await expect(toasts(page)).toContainText('Внутренняя ошибка сервера');
  expect(await grantId()).toBe(id);
  await page.unroute(`**/api/v1/grants/${id}`);
  await revokeBtn.click();
  await ask.getByRole('button', { name: 'Отозвать' }).click();
  await expect(toasts(page)).toContainText('Доступ отозван');
  expect(await grantId()).toBeUndefined();
  await expect(page.getByRole('heading', { name: /Нет доступов за выбранный период|Временных доступов нет/ })).toBeVisible();
  await call(page, 'DELETE', `/api/v1/pages/${pageId}`);
  expect(errors).toEqual([]);
});

test('QA-A4 (fixed): the administration tabs open their sections from any other section (absolute links in the /admin/* splat route)', async ({ page }) => {
  await ensureOwner(page);
  await page.goto('/admin/users');
  const tabs = page.getByRole('navigation', { name: 'Разделы администрирования' });
  await tabs.getByRole('link', { name: 'Группы и отделы' }).click();
  await expect(page).toHaveURL(/\/admin\/groups$/);
  await expect(page.getByRole('heading', { name: 'Группы и отделы' })).toBeVisible();
  await tabs.getByRole('link', { name: 'Журнал аудита' }).click();
  await expect(page).toHaveURL(/\/admin\/audit$/);
  await expect(page.getByLabel('Код действия')).toBeVisible();
  await tabs.getByRole('link', { name: 'Истекающие доступы' }).click();
  await expect(page).toHaveURL(/\/admin\/expiring$/);
  await page.goto('/admin/unknown-section');
  await expect(page).toHaveURL(/\/admin\/users$/);
});
