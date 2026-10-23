import { test, expect, type Page } from '@playwright/test';
import { ensureOwner, createUser } from './helpers';
import { call, count, failWith, humanDoubleClick, pageErrors, signedIn, slow, toasts, uniq } from './qa-admin-helpers';

/**
 * Action × condition tests of the user administration screen (/admin/users, apps/web/src/admin/UsersSection.tsx) for
 * the critical actions docs/qa/ACTION_MATRIX.md listed as uncovered (QA26-01, QA26-03, R-QA-004, R-QA-029, R-UI-061):
 * success with the server state checked through the API, cancel, empty input, server error, offline, slow network with
 * a double click, and the same screen for a less privileged role.
 */

interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  org_role: string;
  status: string;
  access_expires_at: string | null;
  manager_id: string | null;
  primary_group_id: string | null;
  groups: Array<{ id: string; name: string }>;
}
async function findUser(page: Page, email: string): Promise<AdminUserRow | undefined> {
  const r = await call<{ users: AdminUserRow[] }>(page, 'GET', `/api/v1/admin/users?q=${encodeURIComponent(email)}&limit=5`);
  return r.users.find((u) => u.email === email.toLowerCase());
}
async function openUsers(page: Page, search?: string) {
  await page.goto('/admin/users');
  await expect(page.getByRole('heading', { name: 'Пользователи', exact: true })).toBeVisible();
  if (search) {
    await page.getByLabel('Поиск пользователей').fill(search);
    await expect(page.locator('tbody tr')).toHaveCount(1);
  }
}
async function rowMenu(page: Page, name: string) {
  await page.getByRole('button', { name: `Действия с пользователем ${name}` }).click();
  await expect(page.getByRole('menu')).toBeVisible();
}
/** an invitation token from an invite URL */
const tokenOf = (url: string) => url.split('/invite/')[1];
/** True when the invitation link no longer works. Probes with a valid password: a live link would be accepted, so call
 * it only where the link is expected to be dead. */
async function inviteDead(page: Page, token: string) {
  const body = await call(page, 'POST', '/api/v1/auth/invite/accept', { token, password: 'Probe-password-2026' }, true);
  return body?.error?.code === 'invite_invalid';
}
async function auditCount(page: Page, action: string, targetId: string) {
  const r = await call<{ events: unknown[] }>(page, 'GET', `/api/v1/audit?action=${action}&targetId=${targetId}`);
  return r.events.length;
}

test('QA admin users setup', async ({ page }) => {
  await ensureOwner(page);
});

test('R-QA-004 «Добавить» user: empty form disabled; server error keeps the input; slow network + double click creates one invited user with role «Роль в организации», «Срок доступа (необязательно)» and «Создать ссылку-приглашение (сотрудник сам задаст пароль)»', async ({ page }) => {
  const errors = pageErrors(page);
  await ensureOwner(page);
  await openUsers(page);
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  const dlg = page.getByRole('dialog', { name: 'Новый пользователь' });
  const create = dlg.getByRole('button', { name: 'Создать' });
  // empty: nothing to submit
  await expect(create).toBeDisabled();
  const email = `new-${uniq()}@corp.test`;
  await dlg.getByLabel('Имя и фамилия *').fill('Нина Новикова');
  await dlg.getByLabel('Email *').fill(email);
  await dlg.getByLabel('Роль в организации').selectOption({ label: 'Аудитор' });
  await dlg.getByLabel('Срок доступа (необязательно)').fill('2030-12-31T18:00');
  await dlg.getByLabel('Создать ссылку-приглашение (сотрудник сам задаст пароль)').check();
  await expect(create).toBeEnabled();
  // error: the server fails — explained, nothing lost
  await failWith(page, '**/api/v1/admin/users', 'POST');
  await create.click();
  await expect(dlg.getByRole('alert')).toContainText('Внутренняя ошибка сервера');
  await expect(dlg.getByLabel('Email *')).toHaveValue(email);
  await expect(dlg.getByLabel('Роль в организации')).toHaveValue('auditor');
  expect(await findUser(page, email)).toBeUndefined();
  await page.unroute('**/api/v1/admin/users');
  // slow network + a human double click: one request, one user
  const sent = await slow(page, '**/api/v1/admin/users', 'POST', 900);
  await humanDoubleClick(page, create);
  await expect(create).toHaveAttribute('aria-busy', 'true');
  const done = page.getByRole('dialog', { name: 'Пользователь создан' });
  await expect(done).toBeVisible();
  await expect(done.getByLabel('Ссылка-приглашение')).toHaveValue(/\/invite\/[A-Za-z0-9_-]{20,}/);
  expect(sent.n).toBe(1);
  await page.unroute('**/api/v1/admin/users');
  const u = (await findUser(page, email))!;
  expect(u.org_role).toBe('auditor');
  expect(u.status).toBe('invited');
  expect(new Date(u.access_expires_at!).getUTCFullYear()).toBe(2030);
  await done.getByRole('button', { name: 'Готово' }).click();
  await expect(page.getByRole('row', { name: new RegExp(email) })).toContainText('Приглашён');
  expect(errors).toEqual([]);
});

test('QA-A1 (fixed): an instantaneous double activation of «Создать» in «Новый пользователь» sends one request — no duplicate-email error after success', async ({ page }) => {
  await ensureOwner(page);
  await openUsers(page);
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  const dlg = page.getByRole('dialog', { name: 'Новый пользователь' });
  const email = `dbl-${uniq()}@corp.test`;
  await dlg.getByLabel('Имя и фамилия *').fill('Дима Двойной');
  await dlg.getByLabel('Email *').fill(email);
  const sent = await slow(page, '**/api/v1/admin/users', 'POST', 500);
  await dlg.getByRole('button', { name: 'Создать' }).dblclick();
  await expect(page.getByRole('dialog', { name: 'Пользователь создан' })).toBeVisible();
  await page.waitForTimeout(700);
  expect(sent.n).toBe(1);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await findUser(page, email)).toBeDefined();
});

test('R-QA-029 «Новый пользователь» offline and cancel: no network keeps the form and explains; Esc on a filled form asks before discarding; «Отмена» creates nothing', async ({ page, context }) => {
  await ensureOwner(page);
  await openUsers(page);
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  const dlg = page.getByRole('dialog', { name: 'Новый пользователь' });
  const email = `off-${uniq()}@corp.test`;
  await dlg.getByLabel('Имя и фамилия *').fill('Оля Офлайн');
  await dlg.getByLabel('Email *').fill(email);
  await context.setOffline(true);
  await dlg.getByRole('button', { name: 'Создать' }).click();
  await expect(dlg.getByRole('alert')).toContainText('Нет связи с сервером');
  await expect(dlg.getByLabel('Email *')).toHaveValue(email);
  await context.setOffline(false);
  // Esc asks first; «Вернуться» keeps the input
  await page.keyboard.press('Escape');
  const leave = page.getByRole('alertdialog', { name: 'Несохранённые данные' });
  await expect(leave).toBeVisible();
  await leave.getByRole('button', { name: 'Вернуться' }).click();
  await expect(dlg.getByLabel('Email *')).toHaveValue(email);
  await dlg.getByRole('button', { name: 'Отмена' }).click();
  await expect(dlg).toBeHidden();
  expect(await findUser(page, email)).toBeUndefined();
});

test('R-QA-004 invitations: «Отправить приглашение повторно» issues a new link and kills the old one; «Отозвать приглашение» — cancel keeps the link, confirm revokes it; server error is reported', async ({ page }) => {
  const errors = pageErrors(page);
  await ensureOwner(page);
  const email = `inv-${uniq()}@corp.test`;
  const created = await call<{ user: { id: string }; inviteUrl: string }>(page, 'POST', '/api/v1/admin/users', { email, name: 'Игорь Приглашённый', kind: 'employee', invite: true });
  const first = tokenOf(created.inviteUrl);
  await openUsers(page, email);
  // error first
  await failWith(page, `**/api/v1/admin/invitations/${created.user.id}/resend`, 'POST');
  await rowMenu(page, 'Игорь Приглашённый');
  await page.getByRole('menuitem', { name: 'Отправить приглашение повторно' }).click();
  await expect(toasts(page)).toContainText('Внутренняя ошибка сервера');
  expect(await auditCount(page, 'user.invite_resend', created.user.id)).toBe(0);
  await page.unroute(`**/api/v1/admin/invitations/${created.user.id}/resend`);
  // success: a new link in a dialog, the previous one is dead
  await rowMenu(page, 'Игорь Приглашённый');
  await page.getByRole('menuitem', { name: 'Отправить приглашение повторно' }).click();
  const linkDlg = page.getByRole('dialog', { name: 'Новое приглашение' });
  await expect(linkDlg).toContainText(`Предыдущие ссылки для ${email} отозваны`);
  const second = tokenOf(await linkDlg.getByLabel('Ссылка').inputValue());
  expect(second).not.toBe(first);
  expect(await inviteDead(page, first)).toBe(true);
  await linkDlg.getByRole('button', { name: 'Готово' }).click();
  // revoke: cancel keeps the link
  await rowMenu(page, 'Игорь Приглашённый');
  await page.getByRole('menuitem', { name: 'Отозвать приглашение' }).click();
  const confirmDlg = page.getByRole('dialog', { name: 'Отозвать приглашение?' });
  await confirmDlg.getByRole('button', { name: 'Отмена' }).click();
  await expect(confirmDlg).toBeHidden();
  expect(await auditCount(page, 'user.invite_revoke', created.user.id)).toBe(0);
  // confirm revokes it; the user stays «Приглашён»
  await rowMenu(page, 'Игорь Приглашённый');
  await page.getByRole('menuitem', { name: 'Отозвать приглашение' }).click();
  await confirmDlg.getByRole('button', { name: 'Отозвать' }).click();
  await expect(toasts(page)).toContainText('Приглашение отозвано');
  expect(await inviteDead(page, second)).toBe(true);
  expect(await auditCount(page, 'user.invite_revoke', created.user.id)).toBe(1);
  expect((await findUser(page, email))!.status).toBe('invited');
  expect(errors).toEqual([]);
});

test('R-QA-004 «Импорт CSV»: empty input disabled; check error explained; preview marks bad rows; «Импортировать пользователей?» cancel creates nothing, confirm creates only valid rows', async ({ page }) => {
  const errors = pageErrors(page);
  await ensureOwner(page);
  await openUsers(page);
  await page.getByRole('button', { name: 'Импорт CSV' }).click();
  const dlg = page.getByRole('dialog', { name: 'Импорт сотрудников из CSV' });
  const check = dlg.getByRole('button', { name: 'Проверить' });
  await expect(check).toBeDisabled(); // empty
  const a = `csv-a-${uniq()}@corp.test`;
  const b = `csv-b-${uniq()}@corp.test`;
  await dlg.getByLabel('или вставьте содержимое').fill(`email;name;department;title\n${a};Анна Импорт;;Бухгалтер\n${b};Борис Импорт;;\nне-почта;Без почты;;\n`);
  await failWith(page, '**/api/v1/admin/users/import', 'POST');
  await check.click();
  await expect(dlg.getByRole('alert')).toContainText('Внутренняя ошибка сервера');
  await page.unroute('**/api/v1/admin/users/import');
  await check.click();
  await expect(dlg).toContainText('Строк в файле: 3, готовы к импорту: 2, с ошибками: 1 (будут пропущены).');
  await expect(dlg.getByRole('row', { name: /не-почта/ })).toContainText('некорректный email');
  const importBtn = dlg.getByRole('button', { name: 'Импортировать (2)' });
  await importBtn.click();
  const confirmDlg = page.getByRole('dialog', { name: 'Импортировать пользователей?' });
  await confirmDlg.getByRole('button', { name: 'Отмена' }).click();
  expect(await findUser(page, a)).toBeUndefined();
  const sent = await count(page, '**/api/v1/admin/users/import', 'POST');
  await importBtn.click();
  await confirmDlg.getByRole('button', { name: 'Импортировать' }).click();
  await expect(dlg).toContainText('Создано пользователей: 2. Пропущено строк: 1.');
  expect(sent.n).toBe(1);
  expect((await findUser(page, a))!.status).toBe('invited');
  expect((await findUser(page, b))!.name).toBe('Борис Импорт');
  await expect(dlg.getByRole('row', { name: new RegExp(a) })).toContainText('/invite/');
  await dlg.getByRole('button', { name: 'Готово' }).click();
  await expect(dlg).toBeHidden();
  expect(errors).toEqual([]);
});

test('QA-A2 (fixed): «Импорт CSV» with the same email twice in the file flags the repeat in the preview and imports the address once instead of failing the whole import', async ({ page }) => {
  await ensureOwner(page);
  await openUsers(page);
  await page.getByRole('button', { name: 'Импорт CSV' }).click();
  const dlg = page.getByRole('dialog', { name: 'Импорт сотрудников из CSV' });
  const a = `twice-${uniq()}@corp.test`;
  await dlg.getByLabel('или вставьте содержимое').fill(`email;name\n${a};Первый Повтор\n${a.toUpperCase()};Второй Повтор\n`);
  await dlg.getByRole('button', { name: 'Проверить' }).click();
  await expect(dlg).toContainText('Строк в файле: 2, готовы к импорту: 1');
  await expect(dlg.getByRole('row', { name: /Второй Повтор/ })).toContainText('повторяется в файле');
  await dlg.getByRole('button', { name: 'Импортировать (1)' }).click();
  await page.getByRole('dialog', { name: 'Импортировать пользователей?' }).getByRole('button', { name: 'Импортировать' }).click();
  await expect(dlg).toContainText('Создано пользователей: 1. Пропущено строк: 1.');
  expect((await findUser(page, a))!.name).toBe('Первый Повтор');
});

test('R-QA-004 «Изменить профиль и роль»: «Роль в организации» → administrator asks «Назначить административную роль?» (cancel saves nothing); «Доступ действует до» saved; server error keeps the dialog', async ({ page }) => {
  const errors = pageErrors(page);
  await ensureOwner(page);
  const u = await createUser(page.request, 'Роман Ролев');
  await openUsers(page, u.email);
  await rowMenu(page, 'Роман Ролев');
  await page.getByRole('menuitem', { name: 'Изменить профиль и роль' }).click();
  const dlg = page.getByRole('dialog', { name: 'Изменить: Роман Ролев' });
  const save = dlg.getByRole('button', { name: 'Сохранить' });
  await expect(save).toBeDisabled(); // nothing changed yet
  await dlg.getByLabel('Роль в организации').selectOption('admin');
  await save.click();
  const ask = page.getByRole('dialog', { name: 'Назначить административную роль?' });
  await ask.getByRole('button', { name: 'Отмена' }).click();
  await expect(ask).toBeHidden();
  expect((await findUser(page, u.email))!.org_role).toBe('member');
  // server error: dialog stays with the reason
  await failWith(page, `**/api/v1/admin/users/${u.id}`, 'PATCH');
  await save.click();
  await ask.getByRole('button', { name: 'Назначить' }).click();
  await expect(dlg.getByRole('alert')).toContainText('Внутренняя ошибка сервера');
  expect((await findUser(page, u.email))!.org_role).toBe('member');
  await page.unroute(`**/api/v1/admin/users/${u.id}`);
  await dlg.getByLabel('Доступ действует до').fill('2031-06-30T12:00');
  await save.click();
  await ask.getByRole('button', { name: 'Назначить' }).click();
  await expect(toasts(page)).toContainText('Изменения сохранены');
  await expect(dlg).toBeHidden();
  const after = (await findUser(page, u.email))!;
  expect(after.org_role).toBe('admin');
  expect(new Date(after.access_expires_at!).getUTCFullYear()).toBe(2031);
  // a plain role change (not administrative) asks nothing; clearing the date makes access indefinite
  await rowMenu(page, 'Роман Ролев');
  await page.getByRole('menuitem', { name: 'Изменить профиль и роль' }).click();
  await dlg.getByLabel('Роль в организации').selectOption('member');
  await dlg.getByLabel('Доступ действует до').fill('');
  await save.click();
  await expect(dlg).toBeHidden();
  await expect(ask).toBeHidden();
  await expect.poll(async () => (await findUser(page, u.email))!.org_role).toBe('member');
  const back = (await findUser(page, u.email))!;
  expect(back.org_role).toBe('member');
  expect(back.access_expires_at).toBeNull();
  expect(errors).toEqual([]);
});

test('R-QA-004 «Руководитель» picker: a picked manager is saved; «Очистить выбор» removes the manager', async ({ page }) => {
  await ensureOwner(page);
  const boss = await createUser(page.request, `Борис Начальник ${uniq()}`);
  const u = await createUser(page.request, 'Пётр Подчинённый');
  await openUsers(page, u.email);
  await rowMenu(page, 'Пётр Подчинённый');
  await page.getByRole('menuitem', { name: 'Изменить профиль и роль' }).click();
  const dlg = page.getByRole('dialog', { name: 'Изменить: Пётр Подчинённый' });
  await dlg.getByLabel('Руководитель').fill(boss.name.split(' ').slice(-1)[0]);
  await dlg.getByRole('option', { name: new RegExp(boss.name) }).click();
  await dlg.getByRole('button', { name: 'Сохранить' }).click();
  await expect(toasts(page)).toContainText('Изменения сохранены');
  await expect(dlg).toBeHidden();
  expect((await findUser(page, u.email))!.manager_id).toBe(boss.id);
  await rowMenu(page, 'Пётр Подчинённый');
  await page.getByRole('menuitem', { name: 'Изменить профиль и роль' }).click();
  await expect(dlg.getByText(boss.name)).toBeVisible();
  await dlg.getByRole('button', { name: 'Очистить выбор' }).click();
  await expect(dlg.getByLabel('Руководитель')).toHaveValue('');
  await dlg.getByRole('button', { name: 'Сохранить' }).click();
  await expect(dlg).toBeHidden();
  await expect.poll(async () => (await findUser(page, u.email))!.manager_id).toBeNull();
});

test('R-QA-004 filter «Роль»: auditors only; a role with nobody shows the empty state «Никого не найдено»', async ({ page }) => {
  await ensureOwner(page);
  const tag = uniq();
  const aud = await createUser(page.request, `Ада Аудит ${tag}`);
  await call(page, 'PATCH', `/api/v1/admin/users/${aud.id}`, { orgRole: 'auditor' });
  await createUser(page.request, `Мира Сотрудник ${tag}`);
  await openUsers(page);
  await page.getByLabel('Поиск пользователей').fill(tag);
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await page.getByLabel('Роль').selectOption('auditor');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody tr')).toContainText(`Ада Аудит ${tag}`);
  await page.getByLabel('Роль').selectOption('owner');
  await expect(page.getByRole('heading', { name: 'Никого не найдено' })).toBeVisible();
  await page.getByLabel('Роль').selectOption('');
  await expect(page.locator('tbody tr')).toHaveCount(2);
});

test('R-QA-004 «Перевести в другой отдел…»: «Сравнить доступы» shows the space access change (error explained), «Применить» moves the user', async ({ page }) => {
  const errors = pageErrors(page);
  await ensureOwner(page);
  const tag = uniq();
  const dept = (await call<{ group: { id: string } }>(page, 'POST', '/api/v1/admin/groups', { name: `Отдел продаж ${tag}`, kind: 'department' })).group.id;
  const space = (await call<{ space: { id: string } }>(page, 'POST', '/api/v1/spaces', { name: `Продажи ${tag}`, kind: 'project', visibility: 'private' })).space.id;
  await call(page, 'PUT', '/api/v1/grants', { resourceType: 'space', resourceId: space, subjectType: 'group', subjectId: dept, level: 'edit' });
  const u = await createUser(page.request, `Тарас Перевод ${tag}`);
  await openUsers(page, u.email);
  await rowMenu(page, u.name);
  await page.getByRole('menuitem', { name: 'Перевести в другой отдел…' }).click();
  const dlg = page.getByRole('dialog', { name: `Перевод: ${u.name}` });
  const compare = dlg.getByRole('button', { name: 'Сравнить доступы' });
  const apply = dlg.getByRole('button', { name: 'Применить' });
  await expect(compare).toBeDisabled(); // nothing selected
  await dlg.getByRole('checkbox', { name: new RegExp(`Отдел продаж ${tag}`) }).check();
  await expect(apply).toBeDisabled(); // compare first
  await failWith(page, `**/api/v1/admin/users/${u.id}/transfer-preview`, 'POST');
  await compare.click();
  await expect(dlg.getByRole('alert')).toContainText('Внутренняя ошибка сервера');
  await page.unroute(`**/api/v1/admin/users/${u.id}/transfer-preview`);
  await compare.click();
  await expect(dlg.getByRole('row', { name: new RegExp(`Продажи ${tag}`) })).toContainText('Редактирование');
  await apply.click();
  await expect(toasts(page)).toContainText('Перевод выполнен');
  const after = (await findUser(page, u.email))!;
  expect(after.groups.map((g) => g.id)).toContain(dept);
  expect(after.primary_group_id).toBe(dept);
  expect(errors).toEqual([]);
});

test('R-QA-004 no permission: an employee sees «Нет доступа к администрированию»; an HR admin («Администратор персонала») creates users but cannot pick «Роль в организации»', async ({ page, browser }) => {
  await ensureOwner(page);
  const member = await createUser(page.request, 'Сава Сотрудник');
  const hr = await createUser(page.request, 'Хельга Кадры');
  await call(page, 'PATCH', `/api/v1/admin/users/${hr.id}`, { orgRole: 'people_admin' });
  const m = await signedIn(browser, member, '/admin/users');
  await m.p.goto('/admin/users');
  await expect(m.p.getByRole('heading', { name: 'Нет доступа к администрированию' })).toBeVisible();
  await expect(m.p.getByRole('button', { name: 'Добавить' })).toHaveCount(0);
  expect((await m.p.request.get('/api/v1/admin/users')).status()).toBe(403);
  await m.ctx.close();
  const h = await signedIn(browser, hr, '/admin/users');
  await h.p.goto('/admin/users');
  await h.p.getByRole('button', { name: 'Добавить' }).click();
  const dlg = h.p.getByRole('dialog', { name: 'Новый пользователь' });
  await expect(dlg.getByLabel('Роль в организации')).toBeDisabled();
  await expect(dlg.getByText('Административные роли назначает администратор.')).toBeVisible();
  // a forged request with an administrative role is refused by the server
  const forged = await call(h.p, 'POST', '/api/v1/admin/users', { email: `forged-${uniq()}@corp.test`, name: 'Подделка', kind: 'employee', orgRole: 'admin', invite: true }, true);
  expect(JSON.stringify(forged)).toMatch(/error/);
  await h.ctx.close();
});
