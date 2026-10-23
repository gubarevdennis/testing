import { test, expect, type Page, type Locator } from '@playwright/test';
import { ensureOwner, editor, expectSaved, apiContent, api, createUser, login_, treeLink, OWNER } from './helpers';
import { newPage, cleanupCreatedPages } from './editor-p0-helpers';

/**
 * Sidebar, sidebar tree, quick switcher, search page and the page error screen: critical actions docs/qa/ACTION_MATRIX.md
 * listed as uncovered (QA26-01, QA26-03, R-QA-004, R-QA-029, R-UI-026), with cancel, double click, server error,
 * offline and no-permission states; outcomes are checked through the API.
 */
cleanupCreatedPages();

const toasts = (p: Page) => p.locator('.toasts');
const nav = (p: Page) => p.getByRole('navigation', { name: 'Навигация' });

async function profileMenu(page: Page, item: string) {
  await nav(page).getByTitle('Профиль и настройки').click();
  await page.getByRole('menuitem', { name: item }).click();
}

/** A human double click: two presses ~120 ms apart. */
async function humanDoubleClick(page: Page, target: Locator) {
  const b = (await target.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down({ clickCount: 1 });
  await page.mouse.up({ clickCount: 1 });
  await page.waitForTimeout(120);
  await page.mouse.down({ clickCount: 2 });
  await page.mouse.up({ clickCount: 2 });
}

test('R-UI-026: profile menu «Сбросить панель по умолчанию» restores the sidebar width after a resize (also after reload); sidebar links «Импорт» and «Корзина» open their screens', async ({ page }) => {
  await ensureOwner(page);
  await page.goto('/');
  const sidebar = page.locator('.sidebar').first();
  const width = () => sidebar.evaluate((el) => Math.round(el.getBoundingClientRect().width));
  const handle = page.getByRole('separator', { name: 'Изменить ширину панели' });
  const b = (await handle.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + 120, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(width).toBeGreaterThan(330);
  await page.reload();
  await expect.poll(width).toBeGreaterThan(330);
  await profileMenu(page, 'Сбросить панель по умолчанию');
  await expect.poll(width).toBe(280);
  await page.reload();
  await expect.poll(width).toBe(280);
  // links
  await nav(page).getByRole('link', { name: 'Импорт' }).click();
  await expect(page).toHaveURL(/\/import$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Импорт/);
  await nav(page).getByRole('link', { name: 'Корзина' }).click();
  await expect(page).toHaveURL(/\/trash$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Корзина');
});

test('R-COLLAB-040: «Выйти» with changes that have not reached the server asks «Есть неотправленные изменения» — «Отмена» stays signed in; «Выйти» signs out and the changes are sent at the next sign-in', async ({ page }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Неотправленные при выходе');
  await page.keyboard.type('Отправлено.');
  await expectSaved(page);
  // the collaboration channel stops delivering (server unreachable for it): edits stay on this device
  let blocked = true;
  await page.routeWebSocket(/\/api\/v1\/collab\//, (ws) => {
    if (!blocked) ws.connectToServer();
  });
  await page.route(/\/api\/v1\/collab\//, (r) => (blocked ? r.abort() : r.fallback()));
  await page.reload();
  await expect(editor(page)).toContainText('Отправлено.');
  await editor(page).click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' Не отправлено.');
  await expect(page.locator('.sync-status')).not.toHaveText(/Сохранено$/);
  await page.waitForTimeout(600); // the local journal write
  const dialog = page.getByRole('dialog', { name: 'Есть неотправленные изменения' });
  await profileMenu(page, 'Выйти');
  await expect(dialog).toContainText('Изменения на 1 стр. ещё не дошли до сервера');
  await dialog.getByRole('button', { name: 'Отмена' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.app-shell')).toBeVisible();
  expect(JSON.stringify((await apiContent(page.request, id)).content)).not.toContain('Не отправлено');
  await profileMenu(page, 'Выйти');
  await dialog.getByRole('button', { name: 'Выйти' }).click();
  await expect(page.getByRole('heading', { name: 'Вход в базу знаний' })).toBeVisible();
  // next sign-in with a working channel: the page sends what stayed on the device
  blocked = false;
  await page.goto('/p/' + id);
  await login_(page, OWNER.email, OWNER.password);
  await expect(editor(page)).toContainText('Отправлено. Не отправлено.');
  await expectSaved(page);
  await expect.poll(async () => JSON.stringify((await apiContent(page.request, id)).content)).toContain('Отправлено. Не отправлено.');
});

test('R-SEARCH-010: quick switcher commands «Импорт документов» and «Корзина» (empty query lists commands, Esc cancels, a query matching no command hides them)', async ({ page }) => {
  await ensureOwner(page);
  await page.goto('/');
  const sw = page.getByRole('dialog', { name: 'Быстрый переход' });
  const input = sw.getByRole('combobox', { name: 'Найти страницу или команду' });
  const open = () => nav(page).getByRole('button', { name: /Поиск/ }).click();
  await open();
  await expect(sw).toBeVisible();
  await expect(sw.getByRole('option', { name: 'Импорт документов' })).toBeVisible(); // empty query: commands
  // cancel
  await page.keyboard.press('Escape');
  await expect(sw).toBeHidden();
  await expect(page).toHaveURL(/\/$/);
  // nothing found
  await open();
  await input.fill('ъъъщщщнесуществующее');
  await expect(sw.getByRole('option', { name: 'Импорт документов' })).toHaveCount(0);
  await input.fill('импорт');
  await sw.getByRole('option', { name: 'Импорт документов' }).click();
  await expect(page).toHaveURL(/\/import$/);
  await open();
  await input.fill('корз');
  await sw.getByRole('option', { name: 'Корзина' }).click();
  await expect(page).toHaveURL(/\/trash$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Корзина');
});

test('R-TREE-002: an empty space offers «Создать первую страницу» (a double click creates one page, a server error explains); «Новая страница в «…»» and the space menu «Новая страница» create pages in that space; a member without create rights gets the item disabled', async ({ page, browser }) => {
  await ensureOwner(page);
  const name = 'Пустое пространство ' + Date.now().toString(36);
  const space = (await api(page, 'POST', '/api/v1/spaces', { name, kind: 'project', visibility: 'open' })).space as { id: string };
  const pagesIn = async () => ((await (await page.request.get(`/api/v1/spaces/${space.id}/tree`)).json()).nodes ?? []).length as number;
  await page.goto('/');
  const row = page.getByRole('tree', { name: 'Страницы' }).getByRole('treeitem').filter({ has: page.getByRole('button', { name, exact: true }) });
  const spaceBtn = await treeLink(page, name, 'button');
  await spaceBtn.scrollIntoViewIfNeeded();
  if ((await row.getAttribute('aria-expanded')) !== 'true') await spaceBtn.click();
  const first = page.getByRole('button', { name: 'Создать первую страницу' });
  await expect(first).toBeVisible();
  // server error
  await page.route('**/api/v1/pages', (r) => (r.request().method() === 'POST' ? r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'internal', message: 'Внутренняя ошибка сервера' } }) }) : r.fallback()));
  await first.click();
  await expect(toasts(page)).toContainText('Внутренняя ошибка сервера');
  await page.unroute('**/api/v1/pages');
  expect(await pagesIn()).toBe(0);
  // slow network + human double click: one page
  let posts = 0;
  await page.route('**/api/v1/pages', async (r) => {
    if (r.request().method() === 'POST') {
      posts++;
      await new Promise((res) => setTimeout(res, 700));
    }
    await r.fallback();
  });
  await humanDoubleClick(page, first);
  await page.waitForURL(/\/p\/[0-9a-f-]{36}/);
  await page.unroute('**/api/v1/pages');
  expect(posts).toBe(1);
  await expect(page.getByLabel('Название страницы')).toBeFocused();
  await page.getByLabel('Название страницы').fill('Первая страница');
  await page.getByLabel('Название страницы').press('Enter');
  await expect.poll(pagesIn).toBe(1);
  // «+» on the space row
  await row.hover();
  const before = page.url();
  await row.getByRole('button', { name: `Новая страница в «${name}»` }).click();
  await page.waitForURL((u) => u.toString() !== before && /\/p\//.test(u.pathname));
  await expect(page.getByLabel('Название страницы')).toBeFocused();
  await page.getByLabel('Название страницы').fill('Вторая страница');
  await page.getByLabel('Название страницы').press('Enter');
  await expect.poll(pagesIn).toBe(2);
  // the space menu
  await row.hover();
  await row.getByRole('button', { name: 'Действия' }).click();
  const before2 = page.url();
  await page.getByRole('menuitem', { name: 'Новая страница', exact: true }).click();
  await page.waitForURL((u) => u.toString() !== before2 && /\/p\//.test(u.pathname));
  await page.getByLabel('Название страницы').fill('Третья страница');
  await page.getByLabel('Название страницы').press('Enter');
  await expect.poll(pagesIn).toBe(3);
  const created = page.url().split('/p/')[1];
  const pg = (await (await page.request.get(`/api/v1/pages/${created}`)).json()).page;
  expect(pg.spaceId).toBe(space.id);
  // no permission: a reader of the space sees «Новая страница» disabled
  const reader = await createUser(page.request, 'Пётр Читатель');
  await api(page, 'PUT', '/api/v1/grants', { resourceType: 'space', resourceId: space.id, subjectType: 'user', subjectId: reader.id, level: 'view' });
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await p2.goto('/');
  await login_(p2, reader.email, reader.password);
  const btn2 = await treeLink(p2, name, 'button');
  await btn2.scrollIntoViewIfNeeded();
  const row2 = p2.getByRole('tree', { name: 'Страницы' }).getByRole('treeitem').filter({ has: p2.getByRole('button', { name, exact: true }) });
  await row2.hover();
  await expect(row2.getByRole('button', { name: `Новая страница в «${name}»` })).toHaveCount(0);
  await row2.getByRole('button', { name: 'Действия' }).click();
  await expect(p2.getByRole('menuitem', { name: 'Новая страница' })).toBeDisabled();
  await ctx.close();
  await api(page, 'DELETE', `/api/v1/spaces/${space.id}`).catch(() => undefined);
});

test('R-SEARCH-008: search filters — «Сбросить автора», «Сбросить фильтры», tag «Сбросить», «сбросить фильтры» in the no-results tips; server error and offline show «Повторить»', async ({ page, context }) => {
  await ensureOwner(page);
  const word = 'квазарфильтр' + Date.now().toString(36).replace(/\d/g, '');
  const id = await newPage(page, 'Поиск: ' + word);
  await page.keyboard.type(`Текст со словом ${word}`);
  await expectSaved(page);
  const me = (await (await page.request.get('/api/v1/auth/me')).json()).user as { id: string; name: string };
  await expect.poll(async () => ((await (await page.request.get(`/api/v1/search?q=${encodeURIComponent(word)}`)).json()).total ?? 0), { timeout: 20_000 }).toBeGreaterThan(0);
  const results = page.getByRole('list', { name: 'Результаты поиска' });
  // author chip
  await page.goto(`/search?q=${word}&author=${me.id}&authorName=${encodeURIComponent(me.name)}`);
  await expect(results.getByRole('link').first()).toContainText(word);
  await page.getByRole('button', { name: 'Сбросить автора' }).click();
  await expect(page).not.toHaveURL(/author=/);
  // a status filter that excludes the page: no results, the tip resets the filters
  await page.goto(`/search?q=${word}&status=archived`);
  await expect(page.getByRole('heading', { name: `По запросу «${word}» ничего не найдено` })).toBeVisible();
  await page.getByRole('button', { name: 'сбросить фильтры', exact: true }).click();
  await expect(page).not.toHaveURL(/status=/);
  await expect(results.getByRole('link').first()).toContainText(word);
  // the filters panel «Сбросить фильтры»
  await page.goto(`/search?q=${word}&status=draft`);
  await page.getByRole('button', { name: 'Сбросить фильтры', exact: true }).click();
  await expect(page).not.toHaveURL(/status=/);
  // tag filter
  await page.goto(`/search?q=${word}&tag=нет-такого-тега`);
  await expect(page.getByTestId('search-tag-filter')).toBeVisible();
  await page.getByTestId('search-tag-filter').getByRole('button', { name: 'Сбросить' }).click();
  await expect(page).not.toHaveURL(/tag=/);
  await expect(results.getByRole('link').first()).toContainText(word);
  // server error and offline: an explanation and «Повторить»
  await page.route(/\/api\/v1\/search\?/, (r) => r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'internal', message: 'Поиск временно недоступен' } }) }));
  await page.goto(`/search?q=${word}x`);
  await expect(page.getByRole('alert')).toContainText('Поиск временно недоступен');
  await page.unroute(/\/api\/v1\/search\?/);
  await context.setOffline(true);
  await page.getByRole('searchbox', { name: 'Поисковый запрос' }).fill(word + 'y');
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 15_000 });
  await context.setOffline(false);
  await page.getByRole('alert').getByRole('button', { name: 'Повторить' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await api(page, 'DELETE', `/api/v1/pages/${id}`).catch(() => undefined);
});

test('R-ACCESS-021: a page without access shows «Запросить доступ»; a double click sends one request, the button becomes «Запрос отправлен» and the owner is notified; a server error explains', async ({ page, browser }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Закрытая страница для запроса');
  await page.keyboard.type('Секрет');
  await expectSaved(page);
  const stranger = await createUser(page.request, 'Олег Посторонний');
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await p2.goto('/p/' + id);
  await login_(p2, stranger.email, stranger.password);
  await expect(p2.getByRole('heading', { name: 'Страница не найдена или у вас нет доступа' })).toBeVisible();
  const ask = p2.getByRole('button', { name: 'Запросить доступ' });
  // server error
  await p2.route('**/api/v1/access-requests', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'internal', message: 'Внутренняя ошибка сервера' } }) }));
  await ask.click();
  await expect(toasts(p2)).toContainText('Внутренняя ошибка сервера');
  await expect(ask).toBeEnabled();
  await p2.unroute('**/api/v1/access-requests');
  // slow network + human double click: one request
  let posts = 0;
  await p2.route('**/api/v1/access-requests', async (r) => {
    posts++;
    await new Promise((res) => setTimeout(res, 600));
    await r.fallback();
  });
  await humanDoubleClick(p2, ask);
  const sent = p2.getByRole('button', { name: 'Запрос отправлен' });
  await expect(sent).toBeDisabled();
  await expect(toasts(p2)).toContainText('Запрос отправлен владельцу страницы');
  expect(posts).toBe(1);
  await expect.poll(async () => ((await (await page.request.get('/api/v1/notifications')).json()).notifications ?? []).filter((n: any) => n.type === 'access_request' && n.data?.resourceId === id).length).toBe(1);
  await ctx.close();
});
