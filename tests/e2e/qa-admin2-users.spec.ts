import { test, expect, type Page } from '@playwright/test';
import { ensureOwner, createUser } from './helpers';
import { call, failWith, humanDoubleClick, pageErrors, slow, toasts, uniq } from './qa-admin-helpers';
import { addMember, allowClipboard, breakClipboard, clipboardText, createGroup, downloadText } from './qa-admin2-helpers';

/**
 * Second QA wave of the user administration screen (/admin/users, apps/web/src/admin/UsersSection.tsx and the shared
 * admin/common.tsx views): the remaining list filters, the pager, the load error with «Повторить», the details of the
 * create / import / edit / transfer dialogs and the copy field (QA26-01, QA26-03, R-QA-004, R-QA-029, R-UI-061).
 */

interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  status: string;
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
  if (search) await page.getByLabel('Поиск пользователей').fill(search);
}
const rows = (page: Page) => page.locator('tbody tr');

test('QA admin2 users setup', async ({ page }) => {
  await ensureOwner(page);
});

test('R-QA-004 filters «Статус» and «Отдел или группа»: each narrows the list on the server; a filter with nobody shows «Никого не найдено»; offline the list stays and the filter applies when the network is back', async ({ page, context }) => {
  const errors = pageErrors(page);
  await ensureOwner(page);
  const tag = uniq();
  const dept = await createGroup(page, `Склад ${tag}`);
  const a = await createUser(page.request, `Алла Склад ${tag}`);
  const b = await createUser(page.request, `Бела Пауза ${tag}`);
  await addMember(page, dept, a.id);
  await call(page, 'POST', `/api/v1/admin/users/${b.id}/status`, { status: 'suspended', reason: 'отпуск' });
  await openUsers(page, tag);
  await expect(rows(page)).toHaveCount(2);
  await page.getByLabel('Статус').selectOption({ label: 'Приостановлен' });
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText(`Бела Пауза ${tag}`);
  await expect(rows(page)).toContainText('Приостановлен');
  await page.getByLabel('Статус').selectOption({ label: 'Деактивирован' });
  await expect(page.getByRole('heading', { name: 'Никого не найдено' })).toBeVisible();
  await page.getByLabel('Статус').selectOption('');
  await expect(rows(page)).toHaveCount(2);
  await page.getByLabel('Отдел или группа').selectOption({ label: `Отдел: Склад ${tag}` });
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText(`Алла Склад ${tag}`);
  await page.getByLabel('Отдел или группа').selectOption('');
  await expect(rows(page)).toHaveCount(2);
  // offline: the rows already shown stay, nothing breaks; the filter is applied once the network is back
  // (a filter not used before: no cached answer)
  await context.setOffline(true);
  await page.getByLabel('Статус').selectOption({ label: 'Активен' });
  await page.waitForTimeout(500);
  await expect(rows(page)).toHaveCount(2);
  await expect(page.getByRole('heading', { name: 'Пользователи', exact: true })).toBeVisible();
  await context.setOffline(false);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText(`Алла Склад ${tag}`);
  expect(errors).toEqual([]);
});

test('R-UI-061 users list load error: «Не удалось загрузить данные.» with «Повторить» — a retry after the server recovers shows the list; slow network shows the loading rows', async ({ page }) => {
  await ensureOwner(page);
  const fail = { on: true };
  await page.route('**/api/v1/admin/users?*', (route) =>
    fail.on ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'internal', message: 'Внутренняя ошибка сервера' } }) }) : route.fallback(),
  );
  await page.goto('/admin/users');
  const alert = page.getByRole('alert').filter({ hasText: 'Не удалось загрузить данные.' });
  await expect(alert).toBeVisible({ timeout: 15_000 });
  await expect(alert).toContainText('Внутренняя ошибка сервера');
  fail.on = false;
  await page.unroute('**/api/v1/admin/users?*');
  await slow(page, '**/api/v1/admin/users?*', 'GET', 800);
  await alert.getByRole('button', { name: 'Повторить' }).click();
  await expect(page.getByLabel('Загрузка')).toBeVisible();
  await expect(alert).toBeHidden();
  await expect(rows(page).first()).toBeVisible();
});

test('R-QA-004 pager: more than 50 users — «Далее» shows the next page from the server, «Назад» returns; at the ends the buttons are disabled', async ({ page }) => {
  test.setTimeout(120_000);
  await ensureOwner(page);
  const tag = uniq();
  for (let i = 0; i < 52; i += 13) await Promise.all(Array.from({ length: Math.min(13, 52 - i) }, (_, j) => call(page, 'POST', '/api/v1/admin/users', { email: `pg${i + j}-${tag}@corp.test`, name: `Пейдж ${tag} ${String(i + j).padStart(2, '0')}`, kind: 'employee', invite: false })));
  await openUsers(page, `-${tag}@`);
  await expect(page.getByText('1–50 из 52')).toBeVisible();
  const back = page.getByRole('button', { name: 'Назад', exact: true });
  const next = page.getByRole('button', { name: 'Далее', exact: true });
  await expect(back).toBeDisabled();
  await expect(rows(page)).toHaveCount(50);
  await next.click();
  await expect(page.getByText('51–52 из 52')).toBeVisible();
  await expect(rows(page)).toHaveCount(2);
  await expect(next).toBeDisabled();
  await back.click();
  await expect(page.getByText('1–50 из 52')).toBeVisible();
  await expect(rows(page)).toHaveCount(50);
});

test('R-QA-004 «Новый пользователь»: «Гость» ↔ «Сотрудник» switches the form; «Фильтр групп» narrows the list; two departments ask «Основной отдел» and it is saved; «Ссылка-приглашение» «Копировать» puts the link into the clipboard; «Добавить ещё» starts an empty form', async ({ page }) => {
  const errors = pageErrors(page);
  await ensureOwner(page);
  const tag = uniq();
  const d1 = await createGroup(page, `Север ${tag}`);
  const d2 = await createGroup(page, `Юг ${tag}`);
  for (let i = 0; i < 8; i++) await createGroup(page, `Прочая ${tag} ${i}`, 'group');
  await openUsers(page);
  await allowClipboard(page);
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  const dlg = page.getByRole('dialog', { name: 'Новый пользователь' });
  // guest: departments are not offered and the access end is required
  await dlg.getByLabel('Гость').check();
  await expect(dlg.getByLabel('Доступ действует до *')).toBeVisible();
  await expect(dlg.getByText('Гостей нельзя добавлять в отделы; выдайте им доступ к отдельным страницам.')).toBeVisible();
  await dlg.getByLabel('Сотрудник', { exact: true }).check();
  await expect(dlg.getByLabel('Роль в организации')).toBeVisible();
  // the group filter
  await dlg.getByLabel('Фильтр групп').fill(`Прочая ${tag}`);
  await expect(dlg.locator('.admin-checklist label')).toHaveCount(8);
  await dlg.getByLabel('Фильтр групп').fill(`нет-такой-${tag}`);
  await expect(dlg.getByText('Нет подходящих групп')).toBeVisible();
  await dlg.getByLabel('Фильтр групп').fill(tag);
  await dlg.getByRole('checkbox', { name: new RegExp(`Север ${tag}`) }).check();
  await expect(dlg.getByLabel('Основной отдел')).toHaveCount(0); // one department is the primary one by itself
  await dlg.getByRole('checkbox', { name: new RegExp(`Юг ${tag}`) }).check();
  await dlg.getByLabel('Основной отдел').selectOption({ label: `Юг ${tag}` });
  const email = `two-${tag}@corp.test`;
  await dlg.getByLabel('Имя и фамилия *').fill('Дина Двухотдельная');
  await dlg.getByLabel('Email *').fill(email);
  await dlg.getByRole('button', { name: 'Создать' }).click();
  const done = page.getByRole('dialog', { name: 'Пользователь создан' });
  const link = done.getByLabel('Ссылка-приглашение');
  await expect(link).toHaveValue(/\/invite\//);
  const url = await link.inputValue();
  await done.getByRole('button', { name: 'Копировать' }).click();
  await expect(toasts(page)).toContainText('Скопировано в буфер обмена');
  expect(await clipboardText(page)).toBe(url);
  const u = (await findUser(page, email))!;
  expect(u.primary_group_id).toBe(d2);
  expect(u.groups.map((g) => g.id).sort()).toEqual([d1, d2].sort());
  await done.getByRole('button', { name: 'Добавить ещё' }).click();
  await expect(dlg.getByLabel('Email *')).toHaveValue('');
  await expect(dlg.getByLabel('Имя и фамилия *')).toHaveValue('');
  await expect(dlg.getByRole('button', { name: 'Создать' })).toBeDisabled();
  expect(errors).toEqual([]);
});

test('R-UI-061 «Копировать» error: a browser that refuses the clipboard is told to copy by hand; the link stays selectable in the field', async ({ page }) => {
  await ensureOwner(page);
  await openUsers(page);
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  const dlg = page.getByRole('dialog', { name: 'Новый пользователь' });
  await dlg.getByLabel('Имя и фамилия *').fill('Клим Копия');
  await dlg.getByLabel('Email *').fill(`copy-${uniq()}@corp.test`);
  await dlg.getByRole('button', { name: 'Создать' }).click();
  const done = page.getByRole('dialog', { name: 'Пользователь создан' });
  await expect(done.getByLabel('Ссылка-приглашение')).toHaveValue(/\/invite\//);
  await breakClipboard(page);
  await done.getByRole('button', { name: 'Копировать' }).click();
  await expect(toasts(page)).toContainText('Не удалось скопировать — выделите текст и скопируйте вручную');
  await done.getByLabel('Ссылка-приглашение').focus();
  expect(await page.evaluate(() => (document.activeElement as HTMLInputElement).selectionEnd! > 10)).toBe(true);
});

test('R-QA-004 «Импорт CSV» from «Файл CSV»: the file fills the text, a file over 2 MB is refused; «Назад к данным» keeps the text; after the import «Пропущенные строки (1)» lists the reason, «Копировать ссылки» and «Скачать CSV» give every invitation', async ({ page }) => {
  const errors = pageErrors(page);
  await ensureOwner(page);
  await openUsers(page);
  await allowClipboard(page);
  await page.getByRole('button', { name: 'Импорт CSV' }).click();
  const dlg = page.getByRole('dialog', { name: 'Импорт сотрудников из CSV' });
  const file = dlg.getByLabel('Файл CSV');
  // too large: refused with a reason, nothing read
  await file.setInputFiles({ name: 'big.csv', mimeType: 'text/csv', buffer: Buffer.alloc(2_100_000, 'a') });
  await expect(dlg.getByRole('alert')).toContainText('Файл больше 2 МБ — разделите список на части');
  await expect(dlg.getByLabel('или вставьте содержимое')).toHaveValue('');
  const tag = uniq();
  const a = `file-a-${tag}@corp.test`;
  const b = `file-b-${tag}@corp.test`;
  const csv = `email;name\n${a};Фаина Файл\n${b};Филипп Файл\nплохая-строка;Без почты\n`;
  await file.setInputFiles({ name: 'staff.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') });
  await expect(dlg.getByLabel('или вставьте содержимое')).toHaveValue(csv);
  await dlg.getByRole('button', { name: 'Проверить' }).click();
  await expect(dlg).toContainText('готовы к импорту: 2');
  await dlg.getByRole('button', { name: 'Назад к данным' }).click();
  await expect(dlg.getByLabel('или вставьте содержимое')).toHaveValue(csv);
  expect(await findUser(page, a)).toBeUndefined();
  await dlg.getByRole('button', { name: 'Проверить' }).click();
  await dlg.getByRole('button', { name: 'Импортировать (2)' }).click();
  await page.getByRole('dialog', { name: 'Импортировать пользователей?' }).getByRole('button', { name: 'Импортировать' }).click();
  await expect(dlg).toContainText('Создано пользователей: 2. Пропущено строк: 1.');
  await dlg.getByText('Пропущенные строки (1)').click();
  await expect(dlg.getByText(/Строка 4: плохая-строка — некорректный email/)).toBeVisible();
  await dlg.getByRole('button', { name: 'Копировать ссылки' }).click();
  await expect(toasts(page)).toContainText('Скопировано в буфер обмена');
  const copied = await clipboardText(page);
  expect(copied.split('\n')).toHaveLength(2);
  expect(copied).toMatch(new RegExp(`${a}\\t\\S+/invite/`));
  const dl = await downloadText(page, () => dlg.getByRole('button', { name: 'Скачать CSV' }).click());
  expect(dl.name).toBe('invitations.csv');
  expect(dl.text).toContain('email');
  expect(dl.text).toContain('invite_url');
  expect(dl.text).toContain(b);
  expect((await findUser(page, a))!.status).toBe('invited');
  expect(errors).toEqual([]);
});

test('R-QA-004 «Изменить профиль и роль»: an empty «Имя» blocks saving; a new name and «Основной отдел» are saved on the server; slow network + double click saves once', async ({ page }) => {
  const errors = pageErrors(page);
  await ensureOwner(page);
  const tag = uniq();
  const dept = await createGroup(page, `Бухгалтерия ${tag}`);
  const u = await createUser(page.request, `Ева Правка ${tag}`);
  await addMember(page, dept, u.id);
  await openUsers(page, u.email);
  await page.getByRole('button', { name: `Действия с пользователем ${u.name}` }).click();
  await page.getByRole('menuitem', { name: 'Изменить профиль и роль' }).click();
  const dlg = page.getByRole('dialog', { name: `Изменить: ${u.name}` });
  const save = dlg.getByRole('button', { name: 'Сохранить' });
  await dlg.getByLabel('Имя').fill('   ');
  await expect(save).toBeDisabled();
  await dlg.getByLabel('Имя').fill(`Ева Новая ${tag}`);
  await dlg.getByLabel('Основной отдел').selectOption({ label: `Бухгалтерия ${tag}` });
  const sent = await slow(page, `**/api/v1/admin/users/${u.id}`, 'PATCH', 800);
  await humanDoubleClick(page, save);
  await expect(toasts(page)).toContainText('Изменения сохранены');
  await expect(dlg).toBeHidden();
  expect(sent.n).toBe(1);
  const after = (await findUser(page, u.email))!;
  expect(after.name).toBe(`Ева Новая ${tag}`);
  expect(after.primary_group_id).toBe(dept);
  // back to «Не указан»
  await page.getByRole('button', { name: `Действия с пользователем Ева Новая ${tag}` }).click();
  await page.getByRole('menuitem', { name: 'Изменить профиль и роль' }).click();
  const dlg2 = page.getByRole('dialog', { name: `Изменить: Ева Новая ${tag}` });
  await dlg2.getByLabel('Основной отдел').selectOption({ label: 'Не указан' });
  await dlg2.getByRole('button', { name: 'Сохранить' }).click();
  await expect(dlg2).toBeHidden();
  await expect.poll(async () => (await findUser(page, u.email))!.primary_group_id).toBeNull();
  expect(errors).toEqual([]);
});

test('R-QA-004 «Перевести в другой отдел…»: «Исключить из» the current department and «Добавить в» another with «Сделать «…» основным отделом» unchecked — the user moves, the primary department is cleared, not reassigned', async ({ page }) => {
  const errors = pageErrors(page);
  await ensureOwner(page);
  const tag = uniq();
  const from = await createGroup(page, `Старый ${tag}`);
  const to = await createGroup(page, `Новый ${tag}`);
  const u = await createUser(page.request, `Гена Перевод ${tag}`);
  await addMember(page, from, u.id);
  await call(page, 'PATCH', `/api/v1/admin/users/${u.id}`, { primaryGroupId: from });
  await openUsers(page, u.email);
  await page.getByRole('button', { name: `Действия с пользователем ${u.name}` }).click();
  await page.getByRole('menuitem', { name: 'Перевести в другой отдел…' }).click();
  const dlg = page.getByRole('dialog', { name: `Перевод: ${u.name}` });
  await dlg.getByRole('checkbox', { name: `Старый ${tag}` }).check();
  await dlg.getByRole('checkbox', { name: new RegExp(`Новый ${tag}`) }).check();
  const toName = `Новый ${tag}`;
  const primary = dlg.getByLabel(`Сделать «${toName}» основным отделом`);
  await expect(primary).toBeChecked();
  await primary.uncheck();
  await dlg.getByRole('button', { name: 'Сравнить доступы' }).click();
  await dlg.getByRole('button', { name: 'Применить' }).click();
  await expect(toasts(page)).toContainText('Перевод выполнен');
  const after = (await findUser(page, u.email))!;
  expect(after.groups.map((g) => g.id)).toEqual([to]);
  expect(after.primary_group_id).toBeNull();
  expect(errors).toEqual([]);
});

test('R-QA-004 «Найти сотрудника по имени или email» picker (Руководитель): keyboard choice with ↓ and Enter; a guest is marked «Гость»; nobody matching — «Никого не найдено»; a directory error is shown in the list', async ({ page }) => {
  await ensureOwner(page);
  const tag = uniq();
  const guestEmail = `guest-${tag}@partner.test`;
  await call(page, 'POST', '/api/v1/admin/users', { email: guestEmail, name: `Гоша Гость ${tag}`, kind: 'guest', invite: false, accessExpiresAt: new Date(Date.now() + 30 * 86400_000).toISOString() });
  const boss = await createUser(page.request, `Зоя Шеф ${tag}`);
  const u = await createUser(page.request, `Ия Сотрудник ${tag}`);
  await openUsers(page, u.email);
  await page.getByRole('button', { name: `Действия с пользователем ${u.name}` }).click();
  await page.getByRole('menuitem', { name: 'Изменить профиль и роль' }).click();
  const dlg = page.getByRole('dialog', { name: `Изменить: ${u.name}` });
  const picker = dlg.getByRole('combobox', { name: 'Руководитель' });
  await picker.fill(`Гоша Гость ${tag}`);
  await expect(dlg.getByRole('option', { name: new RegExp(`Гоша Гость ${tag}.*Гость`) })).toBeVisible();
  await picker.fill(`никто-${tag}`);
  await expect(dlg.getByText('Никого не найдено')).toBeVisible();
  await failWith(page, '**/api/v1/directory?*', 'GET');
  await picker.fill(`ошибка-${tag}`);
  await expect(dlg.locator('.admin-picker-list .field-error')).toContainText('Внутренняя ошибка сервера', { timeout: 15_000 });
  await page.unroute('**/api/v1/directory?*');
  await picker.fill(`Зоя Шеф ${tag}`);
  await expect(dlg.getByRole('option', { name: new RegExp(`Зоя Шеф ${tag}`) })).toBeVisible();
  await picker.press('ArrowDown');
  await picker.press('Enter');
  await expect(dlg.getByText(`Зоя Шеф ${tag}`)).toBeVisible();
  await dlg.getByRole('button', { name: 'Сохранить' }).click();
  await expect(dlg).toBeHidden();
  await expect.poll(async () => (await call<{ users: Array<{ email: string; manager_id: string | null }> }>(page, 'GET', `/api/v1/admin/users?q=${encodeURIComponent(u.email)}`)).users[0].manager_id).toBe(boss.id);
});
