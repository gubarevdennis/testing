import { test, expect, type Browser, type Page } from '@playwright/test';
import { ensureOwner, login_, OWNER, paste, editor, expectSaved, apiContent } from './helpers';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP8z4AATAxkCAEAJ9cBD8JfOs4AAAAASUVORK5CYII=';

test.describe.configure({ mode: 'serial' });

async function as(browser: Browser, email: string, password: string, path = '/') {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(path);
  await login_(p, email, password);
  await expect(p.locator('.app-shell')).toBeVisible();
  return { ctx, p };
}

async function createUserInUi(page: Page, opts: { name: string; email: string; password: string; guest?: boolean; groups?: string[] }) {
  await page.goto('/admin/users');
  await page.getByRole('main').getByRole('button', { name: 'Добавить', exact: true }).click();
  const dlg = page.getByRole('dialog', { name: 'Новый пользователь' });
  if (opts.guest) {
    await dlg.getByRole('radio', { name: 'Гость' }).check();
    const d = new Date(Date.now() + 14 * 86400_000);
    const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T18:00`;
    await dlg.getByLabel('Доступ действует до *').fill(local);
  }
  await dlg.getByLabel('Имя и фамилия *').fill(opts.name);
  await dlg.getByLabel('Email *').fill(opts.email);
  for (const g of opts.groups ?? []) await dlg.locator('.admin-checklist label', { hasText: g }).getByRole('checkbox').check();
  await dlg.getByRole('radio', { name: 'Задать пароль вручную' }).check();
  await dlg.getByLabel('Пароль', { exact: true }).fill(opts.password);
  await dlg.getByRole('button', { name: 'Создать' }).click();
  const done = page.getByRole('dialog', { name: 'Пользователь создан' });
  await done.getByRole('button', { name: 'Готово' }).click();
}

async function userAction(page: Page, name: string, item: string) {
  await page.goto('/admin/users');
  await page.getByLabel('Поиск пользователей').fill(name);
  await page.getByRole("button", { name: `Действия с пользователем ${name}` }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

test('ROUTE-04: administrator route — department → employee → automatic space access → guest on a section for a term → suspension → sessions revoked → explanation → audit and backup → restore of a test copy', async ({ page, browser }) => {
  test.setTimeout(240_000);
  await ensureOwner(page);
  const stamp = Date.now();
  const emp = { name: 'Сергей Продажник', email: `sales${stamp}@corp.test`, password: 'Sales-password-1' };
  const guest = { name: 'Гость Подрядчик', email: `guest${stamp}@ext.test`, password: 'Guest-password-1' };

  // 1. Department.
  await page.goto('/admin/groups');
  await page.getByRole('button', { name: 'Отдел' }).click();
  const gd = page.getByRole('dialog', { name: 'Новый отдел' });
  await gd.getByLabel('Название').fill('Отдел продаж');
  await gd.getByRole('button', { name: 'Создать' }).click();
  await expect(page.getByText('Отдел продаж').first()).toBeVisible();

  // 2. Employee in the department.
  await createUserInUi(page, { ...emp, groups: ['Отдел продаж'] });

  // 3. Space for the department: the employee gets access automatically through the department.
  await page.getByRole('button', { name: 'Новое пространство' }).click();
  const sd = page.getByRole('dialog', { name: 'Новое пространство' });
  await sd.getByLabel('Название').fill('Продажи');
  await sd.getByLabel('Тип').selectOption('department');
  await sd.getByPlaceholder('Добавить сотрудника, группу или отдел').fill('Отдел продаж');
  await sd.getByRole('option', { name: /Отдел продаж/ }).click();
  await sd.getByLabel('Уровень: Отдел продаж').selectOption('edit');
  await sd.getByRole('button', { name: 'Создать пространство' }).click();
  await page.waitForURL(/\/s\/[0-9a-f-]{36}/);
  const spaceId = page.url().split('/s/')[1];
  const e = await as(browser, emp.email, emp.password, '/s/' + spaceId);
  await expect(e.p.getByRole('heading', { name: 'Продажи' })).toBeVisible();

  // 4. Guest on one section for a term: the space allows guests, the guest gets one page until a date.
  await page.getByRole('tab', { name: 'Настройки' }).click();
  await page.getByLabel('Разрешить доступ гостям').check();
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByText('Настройки сохранены')).toBeVisible();
  await page.getByRole('tab', { name: 'Страницы' }).click();
  await page.getByRole('main').getByRole('button', { name: 'Новая страница' }).first().click();
  await page.waitForURL(/\/p\/[0-9a-f-]{36}/);
  const pageId = page.url().split('/p/')[1].split(/[?#]/)[0];
  await page.getByLabel('Название страницы').fill('Условия для подрядчика');
  await page.getByLabel('Название страницы').press('Enter');
  await createUserInUi(page, { ...guest, guest: true });
  await page.goto('/p/' + pageId);
  await page.getByRole('button', { name: 'Поделиться' }).click();
  const share = page.getByRole('dialog', { name: /Доступ: Условия для подрядчика/ });
  await share.getByPlaceholder('Имя, e-mail или группа').fill('Гость Подрядчик');
  await share.getByRole('option', { name: /Гость Подрядчик/ }).click();
  await share.getByRole('group', { name: 'Быстрый выбор срока' }).getByRole('button', { name: '7 дней' }).click();
  await share.getByRole('button', { name: 'Выдать доступ' }).click();
  await expect(share.getByLabel('Уровень доступа: Гость Подрядчик')).toHaveValue('view');
  const g = await as(browser, guest.email, guest.password, '/p/' + pageId);
  await expect(g.p.getByLabel('Название страницы')).toHaveValue('Условия для подрядчика');
  expect((await g.p.request.get(`/api/v1/spaces/${spaceId}/tree`)).ok()).toBeTruthy();

  // 5. Suspension: the employee's open session ends immediately.
  await userAction(page, emp.name, 'Приостановить доступ…');
  const st = page.getByRole('dialog', { name: `Приостановить доступ ${emp.name}?` });
  await st.getByLabel('Причина (попадёт в журнал аудита)').fill('Служебная проверка');
  await st.getByRole('checkbox', { name: 'Я понимаю последствия' }).check();
  await st.getByRole('button', { name: 'Приостановить' }).click();
  await expect.poll(async () => (await e.p.request.get('/api/v1/auth/me')).status()).toBe(401);
  await e.ctx.close();

  // 6. Revoke all sessions of the guest.
  await userAction(page, guest.name, 'Завершить все сеансы');
  await page.getByRole('dialog', { name: 'Завершить все сеансы?' }).getByRole('button', { name: 'Завершить сеансы' }).click();
  await expect.poll(async () => (await g.p.request.get('/api/v1/auth/me')).status()).toBe(401);
  await g.ctx.close();

  // 7. Explanation: why the guest sees the page (source and term), without logging in as the guest.
  await page.goto('/admin/access');
  await page.locator('#check-user').fill('Гость Подрядчик');
  await page.getByRole('option', { name: /Гость Подрядчик/ }).click();
  await page.getByLabel('Документ (ссылка, ID или название)').fill(pageId);
  const result = page.locator('.access-check-result');
  await expect(result.getByText('может открыть')).toBeVisible();
  await expect(result.getByText(/Гость Подрядчик — Просмотр, выдано напрямую, до/)).toBeVisible();

  // 8. Audit: suspension and the guest grant are in the journal.
  await page.goto('/admin/audit');
  await page.getByLabel('Код действия').fill('user.suspend');
  await page.getByRole('button', { name: 'Применить' }).click();
  await expect(page.locator('tbody tr').first()).toContainText('user.suspend');

  // 9. Backup (organisation archive) and 10. restore of a test copy into an isolated space.
  await page.goto('/admin/archives');
  await page.getByRole('button', { name: 'Создать архив' }).first().click();
  const ad = page.getByRole('dialog', { name: 'Архив организации' });
  await ad.getByLabel('Ваш пароль').fill(OWNER.password);
  await ad.getByRole('checkbox', { name: /подтверждаю выгрузку/ }).check();
  await ad.getByRole('button', { name: 'Создать архив' }).click();
  const dl = page.getByRole('button', { name: 'Скачать' }).first();
  await expect(dl).toBeVisible({ timeout: 90_000 });
  const [download] = await Promise.all([page.waitForEvent('download'), dl.click()]);
  const file = await download.path();
  await page.getByRole('button', { name: 'Восстановить из архива' }).click();
  const rd = page.getByRole('dialog', { name: 'Восстановление из архива' });
  await rd.getByLabel('Файл архива').setInputFiles(file!);
  await rd.getByRole('button', { name: 'Проверить архив' }).click();
  await rd.getByRole('radio', { name: /В новое изолированное пространство/ }).check({ timeout: 90_000 });
  await rd.getByLabel('Название нового пространства').fill('Тестовая копия');
  await rd.getByLabel('Ваш пароль').fill(OWNER.password);
  await rd.getByRole('checkbox', { name: /подтверждаю восстановление/ }).check();
  await rd.getByRole('button', { name: 'Восстановить' }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Готово' })).toBeVisible({ timeout: 90_000 });
  const spaces = await (await page.request.get('/api/v1/spaces')).json();
  const copy = spaces.spaces.find((s: any) => s.name === 'Тестовая копия');
  expect(copy).toBeTruthy();
  expect(JSON.stringify(await (await page.request.get(`/api/v1/spaces/${copy.id}/tree`)).json())).toContain('Продажи');
});

test('ROUTE-03: space manager route — members and group access → template → tree drag-and-drop → publication control → restore of a deleted branch', async ({ page, browser }) => {
  test.setTimeout(180_000);
  await ensureOwner(page);
  const stamp = Date.now();
  // The manager is an ordinary employee (no administrative role); the reader belongs to a group.
  const csrf = (await page.context().storageState()).cookies.find((c) => c.name === 'kb_csrf')!.value;
  const mk = async (name: string) => {
    const email = `m${stamp}${Math.floor(Math.random() * 1000)}@corp.test`;
    const u = (await (await page.request.post('/api/v1/admin/users', { data: { email, name, kind: 'employee', invite: false }, headers: { 'x-csrf-token': csrf } })).json()).user;
    await page.request.post('/api/v1/__test/set-password', { data: { userId: u.id, password: 'User-password-1' }, headers: { 'x-csrf-token': csrf } });
    return { id: u.id as string, email };
  };
  const manager = await mk('Мария Руководитель');
  const reader = await mk('Роман Читатель');
  const grp = (await (await page.request.post('/api/v1/admin/groups', { data: { name: 'Команда Альфа', kind: 'group' }, headers: { 'x-csrf-token': csrf } })).json()).group.id;
  await page.request.put(`/api/v1/admin/groups/${grp}/members/${reader.id}`, { data: { role: 'member' }, headers: { 'x-csrf-token': csrf } });

  const { ctx, p } = await as(browser, manager.email, 'User-password-1');
  // 1. Space + members and group access, in the UI.
  await p.getByRole('button', { name: 'Новое пространство' }).click();
  const sd = p.getByRole('dialog', { name: 'Новое пространство' });
  await sd.getByLabel('Название').fill('Проект Альфа');
  await sd.getByRole('button', { name: 'Создать пространство' }).click();
  await p.waitForURL(/\/s\/[0-9a-f-]{36}/);
  const spaceId = p.url().split('/s/')[1];
  await p.getByRole('tab', { name: 'Участники' }).click();
  await p.getByPlaceholder('Сотрудник, группа или отдел').fill('Команда Альфа');
  await p.getByRole('option', { name: /Команда Альфа/ }).click();
  await p.getByRole('button', { name: 'Добавить в пространство' }).click();
  await expect(p.getByRole('list', { name: 'Участники пространства' }).getByLabel('Уровень доступа: Команда Альфа')).toHaveValue('view');

  // 2. A page from a template.
  await p.getByRole('tab', { name: 'Страницы' }).click();
  await p.getByRole('main').getByRole('link', { name: /Из шаблона|Шаблоны/ }).first().click();
  await p.getByRole('button', { name: 'Использовать' }).first().click();
  const td = p.getByRole('dialog', { name: /Создать страницу:/ });
  await td.getByLabel('Название страницы').fill('Регламент Альфа');
  await td.getByRole('button', { name: 'Создать' }).click();
  await p.waitForURL(/\/p\/[0-9a-f-]{36}/);
  const docId = p.url().split('/p/')[1].split(/[?#]/)[0];
  const mcsrf = (await ctx.storageState()).cookies.find((c) => c.name === 'kb_csrf')!.value;
  const section = (await (await p.request.post('/api/v1/pages', { data: { spaceId, title: 'Раздел регламентов' }, headers: { 'x-csrf-token': mcsrf } })).json()).page.id;

  // 3. Drag-and-drop in the tree: the document goes inside the section.
  const nav = p.getByRole('navigation', { name: 'Навигация' });
  const spaceRow = nav.getByRole('treeitem', { name: /Проект Альфа/ });
  if ((await spaceRow.getAttribute('aria-expanded')) !== 'true') await spaceRow.getByRole('button', { name: 'Развернуть' }).click();
  const src = nav.getByRole('link', { name: /Регламент Альфа/ });
  const dst = nav.getByRole('link', { name: /Раздел регламентов/ });
  await expect(src).toBeVisible();
  await expect(dst).toBeVisible();
  const a = (await src.boundingBox())!;
  const b = (await dst.boundingBox())!;
  await p.mouse.move(a.x + 20, a.y + a.height / 2);
  await p.mouse.down();
  for (let i = 1; i <= 10; i++) await p.mouse.move(a.x + 20, a.y + a.height / 2 + ((b.y + b.height / 2 - (a.y + a.height / 2)) * i) / 10, { steps: 2 });
  await p.mouse.up();
  await expect.poll(async () => (await (await p.request.get(`/api/v1/pages/${docId}`)).json()).page.parentId).toBe(section);

  // 4. Publication control: readers see only published versions.
  await p.goto('/s/' + spaceId);
  await p.getByRole('tab', { name: 'Настройки' }).click();
  await p.getByRole('radio', { name: /После публикации/ }).check();
  await p.getByRole('button', { name: 'Сохранить' }).click();
  await expect(p.getByText('Настройки сохранены')).toBeVisible();
  const r = await as(browser, reader.email, 'User-password-1');
  expect((await (await r.p.request.get(`/api/v1/pages/${docId}/content`)).json()).published).toBe(false);
  await p.goto('/p/' + docId);
  await p.getByRole('region', { name: 'Публикация' }).getByRole('button', { name: 'Опубликовать' }).click();
  await p.getByRole('dialog', { name: /Опубликовать/ }).getByRole('button', { name: 'Опубликовать' }).click();
  await expect.poll(async () => (await (await r.p.request.get(`/api/v1/pages/${docId}/content`)).json()).published).toBe(true);
  await r.ctx.close();

  // 5. Delete the branch (section + document) and restore it from the trash.
  await nav.getByRole('button', { name: 'Действия со страницей «Раздел регламентов»' }).click();
  await p.getByRole('menuitem', { name: 'Удалить в корзину' }).click();
  await expect.poll(async () => (await (await p.request.get(`/api/v1/pages/${docId}`)).json()).page.deletedAt).not.toBeNull();
  await p.goto('/trash');
  const row = p.locator('li, .trash-item, [class*=trash]', { hasText: 'Раздел регламентов' }).filter({ has: p.getByRole('button', { name: 'Восстановить' }) }).last();
  await row.getByRole('button', { name: 'Восстановить' }).click();
  await expect.poll(async () => (await (await p.request.get(`/api/v1/pages/${docId}`)).json()).page.deletedAt).toBeNull();
  expect((await (await p.request.get(`/api/v1/pages/${docId}`)).json()).page.parentId).toBe(section);
  await ctx.close();
});

test('ROUTE-01: employee route — login → own spaces → regulation → search → one-click article in the department → formatting → Excel and image paste → link within rights → logout and return without losses', async ({ page, browser }) => {
  test.setTimeout(180_000);
  await ensureOwner(page);
  const csrf = (await page.context().storageState()).cookies.find((c) => c.name === 'kb_csrf')!.value;
  const h = { 'x-csrf-token': csrf };
  const stamp = Date.now();
  const mk = async (name: string, groupIds: string[] = []) => {
    const email = `e${stamp}${Math.floor(Math.random() * 1000)}@corp.test`;
    const u = (await (await page.request.post('/api/v1/admin/users', { data: { email, name, kind: 'employee', invite: false, groupIds }, headers: h })).json()).user;
    await page.request.post('/api/v1/__test/set-password', { data: { userId: u.id, password: 'User-password-1' }, headers: h });
    return { id: u.id as string, email };
  };
  const dept = (await (await page.request.post('/api/v1/admin/groups', { data: { name: 'Отдел склада', kind: 'department' }, headers: h })).json()).group.id;
  const emp = await mk('Елена Кладовщик', [dept]);
  const outsider = await mk('Пётр Из Бухгалтерии');
  const space = (await (await page.request.post('/api/v1/spaces', { data: { name: 'Склад', kind: 'department', visibility: 'private', groups: [{ groupId: dept, level: 'edit' }] }, headers: h })).json()).space;
  const reg = (await (await page.request.post('/api/v1/pages', { data: { spaceId: space.id, title: `Регламент приёмки ${stamp}` }, headers: h })).json()).page;

  // Login and own spaces.
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto('/');
  await login_(p, emp.email, 'User-password-1');
  const nav = p.getByRole('navigation', { name: 'Навигация' });
  await expect(nav.getByRole('treeitem', { name: /Склад/ })).toBeVisible();
  // The regulation through the space overview.
  await p.goto('/s/' + space.id);
  await expect(p.getByRole('heading', { name: 'Склад' })).toBeVisible();
  await p.locator('.space-pages').getByRole('link', { name: new RegExp(`Регламент приёмки ${stamp}`) }).click();
  await expect(p.getByLabel('Название страницы')).toHaveValue(`Регламент приёмки ${stamp}`);
  // Search finds it.
  await expect
    .poll(async () => {
      await p.goto(`/search?q=${encodeURIComponent('приёмки ' + stamp)}`);
      return p.getByRole('list', { name: 'Результаты поиска' }).getByRole('link', { name: new RegExp(`Регламент приёмки ${stamp}`) }).count();
    }, { timeout: 30_000 })
    .toBeGreaterThan(0);

  // One-click article in the department space.
  await p.goto('/s/' + space.id);
  await p.getByRole('main').getByRole('button', { name: 'Новая страница' }).first().click();
  await p.waitForURL(/\/p\/[0-9a-f-]{36}/);
  const artId = p.url().split('/p/')[1].split(/[?#]/)[0];
  const title = p.getByLabel('Название страницы');
  await title.fill('Приёмка паллет');
  await title.press('Enter');
  // Formatting.
  await p.keyboard.type('Важно: ');
  await p.keyboard.press('Control+b');
  await p.keyboard.type('проверять пломбы');
  await p.keyboard.press('Control+b');
  await p.keyboard.press('Enter');
  // Link within rights: the link points to the regulation the employee can see.
  await paste(p, { 'text/html': `<p><a href="/p/${reg.id}">Регламент приёмки</a></p>`, 'text/plain': 'Регламент приёмки' });
  await p.keyboard.press('Enter');
  // An image and an Excel range (HTML table + TSV).
  await paste(p, { 'text/html': `<figure><img src="${PNG}" alt="Схема"></figure>` });
  await expect(editor(p).locator('.kb-image-block img')).toBeVisible({ timeout: 20_000 });
  await expectSaved(p);
  await editor(p).press('Control+End');
  await paste(p, { 'text/html': '<table><tr><td>Артикул</td><td>Кол-во</td></tr><tr><td>A-1</td><td>12</td></tr></table>', 'text/plain': 'Артикул\tКол-во\nA-1\t12' });
  await expect(editor(p).locator('table')).toContainText('A-1');
  await expectSaved(p);
  const content = JSON.stringify((await apiContent(p.request, artId)).content);
  expect(content).toContain('"bold"');
  expect(content).toContain('A-1');
  expect(content).toContain(`/p/${reg.id}`);
  expect(content).toMatch(/"image"/);
  // Someone outside the department cannot follow the link.
  const o = await browser.newContext();
  const op = await o.newPage();
  await op.goto('/p/' + reg.id);
  await login_(op, outsider.email, 'User-password-1');
  await expect(op.getByRole('heading', { name: 'Страница не найдена или у вас нет доступа' })).toBeVisible();
  await o.close();

  // Logout and return without losses.
  await nav.getByRole('button', { name: 'Профиль и настройки' }).click();
  await p.getByRole('menuitem', { name: 'Выйти' }).click();
  await expect(p.getByRole('heading', { name: 'Вход в базу знаний' })).toBeVisible();
  await p.goto('/p/' + artId);
  await login_(p, emp.email, 'User-password-1');
  await expect(editor(p)).toContainText('проверять пломбы');
  await expect(editor(p).locator('strong', { hasText: 'проверять пломбы' })).toBeVisible();
  await expect(editor(p).locator('table')).toContainText('A-1');
  await expect(editor(p).locator('.kb-image-block img')).toBeVisible();
  await ctx.close();
});
