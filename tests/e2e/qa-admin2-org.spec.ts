import { test, expect, type Page } from '@playwright/test';
import { ensureOwner, createUser } from './helpers';
import { call, failWith, pageErrors, slow, toasts, uniq } from './qa-admin-helpers';
import { createGroup, createSpace, createPageIn, downloadText } from './qa-admin2-helpers';

/**
 * Second QA wave of the organisation screens: groups and departments tree (/admin/groups), audit log filters and CSV
 * (/admin/audit), system health refresh (/admin/health), expiring access links (/admin/expiring) — QA26-01, QA26-03,
 * R-QA-004, R-UI-061.
 */

interface Group {
  id: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  kind: string;
}
const groups = async (page: Page) => (await call<{ groups: Group[] }>(page, 'GET', '/api/v1/admin/groups')).groups;
const tree = (page: Page) => page.locator('.admin-split-list');

test('QA admin2 org setup', async ({ page }) => {
  await ensureOwner(page);
});

test('R-QA-004 departments tree: a department opens its card; «Подотдел» creates a child with «Описание» and «Входит в отдел» preset; «Свернуть»/«Развернуть» the branch; «← Назад» (narrow screen) closes the card; a plain group opens from «Группы»', async ({ page }) => {
  const errors = pageErrors(page);
  await ensureOwner(page);
  const tag = uniq();
  const parent = await createGroup(page, `Дирекция ${tag}`);
  await createGroup(page, `Команда ${tag}`, 'group');
  await page.goto('/admin/groups');
  await tree(page).getByRole('button', { name: new RegExp(`^Дирекция ${tag}`) }).click();
  await expect(page.getByRole('heading', { name: `Дирекция ${tag}`, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Подотдел' }).click();
  const dlg = page.getByRole('dialog', { name: 'Новый отдел' });
  await expect(dlg.getByLabel('Входит в отдел')).toHaveValue(parent);
  await dlg.getByLabel('Название').fill(`Отдел кадров ${tag}`);
  await dlg.getByLabel('Описание').fill('Подбор и адаптация');
  await dlg.getByRole('button', { name: 'Создать' }).click();
  await expect(toasts(page)).toContainText('Отдел создан');
  await expect(page.getByRole('heading', { name: `Отдел кадров ${tag}`, exact: true })).toBeVisible();
  await expect(page.getByText('Подбор и адаптация')).toBeVisible();
  const child = (await groups(page)).find((g) => g.name === `Отдел кадров ${tag}`)!;
  expect(child.parent_id).toBe(parent);
  expect(child.description).toBe('Подбор и адаптация');
  // the branch folds
  const childRow = tree(page).getByRole('button', { name: new RegExp(`^Отдел кадров ${tag}`) });
  await expect(childRow).toBeVisible();
  const branch = tree(page).locator('li', { has: page.getByRole('button', { name: new RegExp(`^Дирекция ${tag}`) }) }).first();
  await branch.getByRole('button', { name: 'Свернуть' }).first().click();
  await expect(childRow).toBeHidden();
  await branch.getByRole('button', { name: 'Развернуть' }).first().click();
  await expect(childRow).toBeVisible();
  // a narrow screen shows either the tree or the card: «← Назад» returns to the tree
  await page.setViewportSize({ width: 700, height: 900 });
  await expect(tree(page)).toBeHidden();
  await page.getByRole('button', { name: '← Назад' }).click();
  await expect(tree(page)).toBeVisible();
  await expect(page.getByRole('heading', { name: `Отдел кадров ${tag}`, exact: true })).toBeHidden();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole('heading', { name: 'Выберите отдел или группу' })).toBeVisible();
  await tree(page).getByRole('button', { name: new RegExp(`^Команда ${tag}`) }).click();
  await expect(page.getByRole('heading', { name: `Команда ${tag}`, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Подотдел' })).toHaveCount(0); // groups have no children
  expect(errors).toEqual([]);
});

test('R-QA-004 «Изменить» a department: new name, «Описание» and «Входит в отдел» → top level are saved; a server error keeps the dialog with the reason; QA-A12 (fixed): Esc on the changed form asks before discarding', async ({ page }) => {
  const errors = pageErrors(page);
  await ensureOwner(page);
  const tag = uniq();
  const top = await createGroup(page, `Холдинг ${tag}`);
  const dept = await createGroup(page, `Филиал ${tag}`, 'department', top);
  await page.goto('/admin/groups');
  await tree(page).getByRole('button', { name: new RegExp(`^Филиал ${tag}`) }).click();
  await page.getByRole('button', { name: 'Изменить', exact: true }).click();
  const dlg = page.getByRole('dialog', { name: `Изменить «Филиал ${tag}»` });
  await expect(dlg.getByLabel('Входит в отдел')).toHaveValue(top);
  // the department cannot be put inside itself
  await expect(dlg.getByLabel('Входит в отдел').locator('option', { hasText: `Филиал ${tag}` })).toHaveCount(0);
  await dlg.getByLabel('Название').fill(`Филиал Восток ${tag}`);
  await dlg.getByLabel('Описание').fill('Восточное направление');
  await dlg.getByLabel('Входит в отдел').selectOption('');
  await failWith(page, `**/api/v1/admin/groups/${dept}`, 'PATCH');
  await dlg.getByRole('button', { name: 'Сохранить' }).click();
  await expect(dlg.getByRole('alert')).toContainText('Внутренняя ошибка сервера');
  expect((await groups(page)).find((g) => g.id === dept)!.parent_id).toBe(top);
  await page.unroute(`**/api/v1/admin/groups/${dept}`);
  // QA-A12: Esc on a changed form asks first; «Вернуться» keeps the input
  await page.keyboard.press('Escape');
  const leave = dlg.getByRole('alertdialog', { name: 'Несохранённые данные' });
  await expect(leave).toBeVisible();
  await leave.getByRole('button', { name: 'Вернуться' }).click();
  await expect(dlg.getByLabel('Название')).toHaveValue(`Филиал Восток ${tag}`);
  await dlg.getByRole('button', { name: 'Сохранить' }).click();
  await expect(toasts(page)).toContainText('Сохранено');
  const after = (await groups(page)).find((g) => g.id === dept)!;
  expect(after.name).toBe(`Филиал Восток ${tag}`);
  expect(after.description).toBe('Восточное направление');
  expect(after.parent_id).toBeNull();
  expect(errors).toEqual([]);
});

test('R-QA-004 audit log filters «Действие» and «Тип объекта», period «С» … «По»: each is applied on the server; a future period is empty and «CSV» is then unavailable; «CSV» downloads exactly the rows shown', async ({ page }) => {
  const errors = pageErrors(page);
  await ensureOwner(page);
  const tag = uniq();
  await createGroup(page, `Аудит-фильтр ${tag}`, 'group');
  await createUser(page.request, `Аудит Пользователь ${tag}`);
  await page.goto('/admin/audit');
  await expect(page.locator('tbody tr').first()).toBeVisible();
  // «Действие» = Группы
  await page.getByLabel('Действие', { exact: true }).selectOption({ label: 'Группы' });
  await page.getByRole('button', { name: 'Применить' }).click();
  await expect(page.locator('tbody tr').first()).toContainText('group.');
  for (const code of await page.locator('tbody tr td:nth-child(4) .mono').allTextContents()) expect(code).toMatch(/^group\./);
  // «Тип объекта» = Пользователь (with any action)
  await page.getByLabel('Действие', { exact: true }).selectOption({ label: 'Все действия' });
  await page.getByLabel('Тип объекта').selectOption({ label: 'Пользователь' });
  await page.getByRole('button', { name: 'Применить' }).click();
  await expect(page.locator('tbody tr').first()).toBeVisible();
  for (const t of await page.locator('tbody tr td:nth-child(5) > span:first-child').allTextContents()) expect(t).toBe('user');
  // CSV of the rows shown
  const shown = await page.locator('tbody tr').count();
  const csv = await downloadText(page, () => page.getByRole('button', { name: 'CSV', exact: true }).click());
  expect(csv.name).toMatch(/^audit-\d{4}-\d{2}-\d{2}\.csv$/);
  const lines = csv.text.trim().split(/\r?\n/).filter((l) => /^"?\d/.test(l));
  expect(lines.length).toBe(shown);
  expect(csv.text).toContain('target_type');
  // a period in the future: nothing; CSV disabled
  await page.getByLabel('С', { exact: true }).fill('2099-01-01T00:00');
  await page.getByLabel('По', { exact: true }).fill('2099-12-31T23:59');
  await page.getByRole('button', { name: 'Применить' }).click();
  await expect(page.getByRole('heading', { name: 'Нет событий по заданным условиям' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'CSV', exact: true })).toBeDisabled();
  // a period covering today returns the group creation again
  const today = new Date();
  const d = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  await page.getByLabel('Тип объекта').selectOption({ label: 'Группа' });
  await page.getByLabel('С', { exact: true }).fill(`${d(new Date(today.getTime() - 86400_000))}T00:00`);
  await page.getByLabel('По', { exact: true }).fill(`${d(new Date(today.getTime() + 86400_000))}T23:59`);
  await page.getByRole('button', { name: 'Применить' }).click();
  await expect(page.locator('tbody tr').first()).toContainText('group.create');
  expect(errors).toEqual([]);
});

test('R-UI-061 system health «Обновить»: slow network marks the button busy and keeps the figures; a failed refresh is explained with «Повторить», which restores them', async ({ page }) => {
  await ensureOwner(page);
  await page.goto('/admin/health');
  await expect(page.getByText('База данных')).toBeVisible();
  const refresh = page.getByRole('button', { name: 'Обновить' });
  const sent = await slow(page, '**/api/v1/admin/health', 'GET', 900);
  await refresh.click();
  await expect(refresh).toHaveAttribute('aria-busy', 'true');
  await expect(refresh).toBeDisabled();
  await expect(page.getByText('База данных')).toBeVisible();
  await expect(refresh).toHaveAttribute('aria-busy', 'false');
  expect(sent.n).toBe(1);
  await page.unroute('**/api/v1/admin/health');
  await failWith(page, '**/api/v1/admin/health', 'GET');
  await refresh.click();
  const alert = page.getByRole('alert').filter({ hasText: 'Не удалось загрузить данные.' });
  await expect(alert).toBeVisible({ timeout: 15_000 });
  await page.unroute('**/api/v1/admin/health');
  await alert.getByRole('button', { name: 'Повторить' }).click();
  await expect(page.getByText('База данных')).toBeVisible();
  await expect(alert).toBeHidden();
});

test('QA-A11 (fixed): an expiring grant on an untitled page is listed with the link «(без названия)» (was an empty, nameless link) that opens the page', async ({ page }) => {
  const errors = pageErrors(page);
  await ensureOwner(page);
  const tag = uniq();
  const u = await createUser(page.request, `Ника Срочная ${tag}`);
  const space = await createSpace(page, `Срочное ${tag}`);
  const untitled = await createPageIn(page, space, '');
  await call(page, 'PUT', '/api/v1/grants', { resourceType: 'page', resourceId: untitled, subjectType: 'user', subjectId: u.id, level: 'view', expiresAt: new Date(Date.now() + 2 * 86400_000).toISOString() });
  await page.goto('/admin/expiring');
  await page.locator('.admin-page').getByLabel('Поиск', { exact: true }).fill(tag);
  const row = page.getByRole('row', { name: new RegExp(`Ника Срочная ${tag}`) });
  const link = row.getByRole('link', { name: '(без названия)' });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/p/${untitled}`));
  expect(errors).toEqual([]);
});

test('QA-A12 (fixed): Esc in «Новая группа» with a typed name and in «Импорт сотрудников из CSV» with pasted rows asks «Закрыть без сохранения?» instead of silently discarding; «Закрыть без сохранения» discards', async ({ page }) => {
  await ensureOwner(page);
  await page.goto('/admin/groups');
  await page.getByRole('button', { name: 'Группа', exact: true }).click();
  const dlg = page.getByRole('dialog', { name: 'Новая группа' });
  await dlg.getByLabel('Название').fill('Черновик группы');
  await page.keyboard.press('Escape');
  const leave = dlg.getByRole('alertdialog', { name: 'Несохранённые данные' });
  await leave.getByRole('button', { name: 'Вернуться' }).click();
  await expect(dlg.getByLabel('Название')).toHaveValue('Черновик группы');
  await page.keyboard.press('Escape');
  await leave.getByRole('button', { name: 'Закрыть без сохранения' }).click();
  await expect(dlg).toBeHidden();
  expect((await groups(page)).some((g) => g.name === 'Черновик группы')).toBe(false);
  await page.goto('/admin/users');
  await page.getByRole('button', { name: 'Импорт CSV' }).click();
  const imp = page.getByRole('dialog', { name: 'Импорт сотрудников из CSV' });
  await imp.getByLabel('или вставьте содержимое').fill('email;name\nkeep@corp.test;Не потерять');
  await page.keyboard.press('Escape');
  await imp.getByRole('alertdialog', { name: 'Несохранённые данные' }).getByRole('button', { name: 'Вернуться' }).click();
  await expect(imp.getByLabel('или вставьте содержимое')).toHaveValue('email;name\nkeep@corp.test;Не потерять');
});
