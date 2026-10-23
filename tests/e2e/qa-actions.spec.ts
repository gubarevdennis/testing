import { test, expect, type Page, type Browser } from '@playwright/test';
import { ensureOwner, newPage, createUser, login_, api, treeLink, editor, expectSaved, apiContent } from './helpers';

/**
 * Action × condition tests for high-value actions the action matrix (docs/qa/ACTION_MATRIX.md) listed as uncovered
 * (R-QA-004, R-QA-029, R-UI-026): normal path plus cancel, repeated/double click, slow network, server error, offline,
 * empty input and no-permission paths. Every test names the actions it drives by their visible labels, which is how
 * scripts/qa/coverage.ts links them to docs/qa/action-inventory.yaml.
 */
test.describe.configure({ mode: 'serial' });

const errors: string[] = [];
// uncaught page errors are collected per test
test.beforeEach(() => {
  errors.length = 0;
});
const watch = (p: Page) => p.on('pageerror', (e) => (errors.push(e.message), process.env.QA_STACKS && console.log('PAGEERROR', e.stack)));
const toasts = (p: Page) => p.locator('.toasts');

/** Delays every matching request by `ms` and counts how many were sent. */
async function slow(page: Page, pattern: string | RegExp, method: string, ms: number) {
  const counter = { n: 0 };
  await page.route(pattern, async (route) => {
    if (route.request().method() !== method) return route.fallback();
    counter.n++;
    await new Promise((r) => setTimeout(r, ms));
    await route.fallback();
  });
  return counter;
}

/** Answers matching requests with a server error. */
async function failWith(page: Page, pattern: string | RegExp, method: string, status = 500) {
  await page.route(pattern, (route) =>
    route.request().method() === method ? route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ error: { code: 'internal', message: 'Внутренняя ошибка сервера' } }) }) : route.fallback(),
  );
}

/**
 * A human double click: two presses ~120 ms apart (the second one with detail = 2, so the browser also fires dblclick).
 * Locator.dblclick() fires both presses within the same few milliseconds — faster than any person; that case is
 * documented separately as defect QA-D3.
 */
async function humanDoubleClick(page: Page, target: import('@playwright/test').Locator) {
  const b = (await target.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down({ clickCount: 1 });
  await page.mouse.up({ clickCount: 1 });
  await page.waitForTimeout(120);
  await page.mouse.down({ clickCount: 2 });
  await page.mouse.up({ clickCount: 2 });
}

async function treeMenu(page: Page, title: string) {
  const link = await treeLink(page, title);
  await link.scrollIntoViewIfNeeded();
  await link.focus();
  await page.keyboard.press('Shift+F10');
  await expect(page.getByRole('menu')).toBeVisible();
}

async function userContext(browser: Browser, user: { email: string; password: string }, url = '/') {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  watch(p);
  await p.goto(url);
  await login_(p, user.email, user.password);
  await expect(p.locator('.app-shell')).toBeVisible();
  return { ctx, p };
}

/** pages this spec created in the owner's personal space; trashed after each test so the tree stays short for later specs */
const created: string[] = [];
test.afterEach(async ({ page }) => {
  const csrf = (await page.context().storageState()).cookies.find((c) => c.name === 'kb_csrf')?.value ?? '';
  while (created.length) await page.context().request.delete(`/api/v1/pages/${created.pop()}`, { headers: { 'x-csrf-token': csrf } }).catch(() => undefined);
});
/** the owner's personal space: its pages are expanded in the sidebar tree */
let personalId = '';

test('QA actions setup: owner, a project space', async ({ page }) => {
  watch(page);
  await ensureOwner(page);
  // a project space for the sidebar space menu (QA-D5)
  await api(page, 'POST', '/api/v1/spaces', { name: 'Проверка действий', kind: 'project', visibility: 'open' });
  const spaces = await (await page.request.get('/api/v1/spaces')).json();
  personalId = spaces.spaces.find((x: { isPersonal: boolean }) => x.isPersonal).id;
});

test('R-QA-004 API tokens: empty name disables «Создать токен»; slow network shows progress and a double click creates one token; «Я сохранил токен»; revoke: cancel keeps it, confirm removes it and shows the empty state; server error keeps the input', async ({ page }) => {
  watch(page);
  await ensureOwner(page);
  await page.goto('/settings/tokens');
  const create = page.getByRole('button', { name: 'Создать токен' });
  const name = page.getByLabel('Назначение');
  // empty: nothing to submit
  await expect(name).toHaveValue('');
  await expect(create).toBeDisabled();
  // error: the server fails — the reason is shown and the typed name stays for a retry
  await failWith(page, '**/api/v1/me/tokens', 'POST');
  await name.fill('Выгрузка в BI');
  await create.click();
  await expect(page.getByRole('alert')).toContainText(/Внутренняя ошибка сервера|ошибк/i);
  await expect(name).toHaveValue('Выгрузка в BI');
  await page.unroute('**/api/v1/me/tokens');
  // slow network + double click: one request, the button is busy meanwhile
  const sent = await slow(page, '**/api/v1/me/tokens', 'POST', 1200);
  await humanDoubleClick(page, create);
  await expect(create).toHaveAttribute('aria-busy', 'true');
  await expect(create).toBeDisabled();
  await expect(page.getByText('Токен «Выгрузка в BI» создан.', { exact: false })).toBeVisible();
  expect(sent.n).toBe(1);
  await page.unroute('**/api/v1/me/tokens');
  await expect(page.getByLabel('Токен', { exact: true })).toHaveValue(/.{20,}/);
  await expect(page.getByRole('button', { name: 'Копировать' })).toBeVisible();
  await page.getByRole('button', { name: 'Я сохранил токен' }).click();
  await expect(page.getByText('Скопируйте его сейчас', { exact: false })).toHaveCount(0);
  const tokens = await (await page.request.get('/api/v1/me/tokens')).json();
  expect(tokens.tokens.filter((t: { name: string }) => t.name === 'Выгрузка в BI')).toHaveLength(1);
  // revoke: cancel, then confirm
  const row = page.getByRole('row', { name: /Выгрузка в BI/ });
  await row.getByRole('button', { name: 'Отозвать' }).click();
  const dlg = page.getByRole('dialog', { name: 'Отозвать токен «Выгрузка в BI»?' });
  await expect(dlg).toBeVisible();
  await dlg.getByRole('button', { name: 'Отмена' }).click();
  await expect(dlg).toBeHidden();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Отозвать' }).click();
  await dlg.getByRole('button', { name: 'Отозвать' }).click();
  await expect(toasts(page)).toContainText('Токен отозван');
  await expect(page.getByText('Токенов нет')).toBeVisible();
  expect(errors).toEqual([]);
});

test('QA-D3 (fixed): an instantaneous double activation of «Создать токен» sends one request', async ({ page }) => {
  watch(page);
  await ensureOwner(page);
  await page.goto('/settings/tokens');
  await page.getByLabel('Назначение').fill('Двойное нажатие');
  const sent = await slow(page, '**/api/v1/me/tokens', 'POST', 600);
  await page.getByRole('button', { name: 'Создать токен' }).dblclick();
  await expect(page.getByText(/Токен «.*» создан\./)).toBeVisible();
  await page.waitForTimeout(800);
  expect(sent.n).toBe(1);
});

test('R-QA-029 offline: «Создать токен» without a network explains the failure and works after reconnecting', async ({ page, context }) => {
  watch(page);
  await ensureOwner(page);
  await page.goto('/settings/tokens');
  await page.getByLabel('Назначение').fill('Офлайн-интеграция');
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Создать токен' }).click();
  await expect(page.getByRole('alert')).toContainText('Нет связи с сервером');
  await expect(page.getByLabel('Назначение')).toHaveValue('Офлайн-интеграция');
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Создать токен' }).click();
  await expect(page.getByText('Токен «Офлайн-интеграция» создан.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Я сохранил токен' }).click();
  expect(errors).toEqual([]);
});

test('R-QA-004 password change (separate account): empty form is disabled, mismatch and wrong current password are explained without losing input, success needs one click', async ({ page, browser }) => {
  watch(page);
  await ensureOwner(page);
  const u = await createUser(page.request, 'Пётр Пароль');
  const { ctx, p } = await userContext(browser, u, '/settings/security');
  await p.goto('/settings/security');
  const submit = p.getByRole('button', { name: 'Изменить пароль' });
  await expect(submit).toBeDisabled(); // empty
  await p.getByLabel('Текущий пароль').fill('Wrong-password-9');
  await p.getByLabel('Новый пароль').fill('New-password-2026');
  await p.getByLabel('Повторите пароль').fill('New-password-2027');
  await expect(p.getByText('Пароли не совпадают')).toBeVisible();
  await expect(submit).toBeDisabled();
  await p.getByLabel('Повторите пароль').fill('New-password-2026');
  await submit.click();
  // error: wrong current password — explained, the new password fields are kept
  await expect(p.getByRole('alert')).toBeVisible();
  await expect(p.getByLabel('Новый пароль')).toHaveValue('New-password-2026');
  await p.getByLabel('Текущий пароль').fill(u.password);
  const sent = await slow(p, '**/api/v1/auth/password', 'POST', 800);
  await humanDoubleClick(p, submit);
  await expect(toasts(p)).toContainText('Пароль изменён');
  expect(sent.n).toBe(1);
  await expect(p.getByLabel('Текущий пароль')).toHaveValue('');
  // the new password works
  const r = await p.request.post('/api/v1/auth/login', { data: { email: u.email, password: 'New-password-2026' } });
  expect(r.ok()).toBeTruthy();
  await ctx.close();
  expect(errors).toEqual([]);
});

test('R-QA-004 sessions: «Завершить остальные» — cancel keeps the other device signed in, confirm signs it out', async ({ page, browser }) => {
  watch(page);
  await ensureOwner(page);
  const u = await createUser(page.request, 'Сеня Сеансов');
  const a = await userContext(browser, u);
  const b = await userContext(browser, u);
  await a.p.goto('/settings/sessions');
  const endOthers = a.p.getByRole('button', { name: 'Завершить остальные' });
  await endOthers.click();
  const dlg = a.p.getByRole('dialog', { name: 'Завершить остальные сеансы?' });
  await dlg.getByRole('button', { name: 'Отмена' }).click();
  await expect(dlg).toBeHidden();
  expect((await b.p.request.get('/api/v1/auth/me')).ok()).toBeTruthy();
  await endOthers.click();
  await dlg.getByRole('button', { name: 'Завершить' }).click();
  await expect(toasts(a.p)).toContainText('Остальные сеансы завершены');
  await expect.poll(async () => (await b.p.request.get('/api/v1/auth/me')).status()).toBe(401);
  expect((await a.p.request.get('/api/v1/auth/me')).ok()).toBeTruthy();
  await a.ctx.close();
  await b.ctx.close();
  expect(errors).toEqual([]);
});

test('R-QA-004 trash: «Удалить в корзину» from the tree → toast «Восстановить» undoes it; trash «Восстановить» (double click restores once); «Удалить навсегда» — cancel keeps it, typed confirmation purges; server error on restore keeps the item', async ({ page }) => {
  watch(page);
  await ensureOwner(page);
  const created = await api(page, 'POST', '/api/v1/pages', { spaceId: personalId, parentId: null, title: 'Корзина: черновик', requestId: crypto.randomUUID() });
  const id = created.page.id as string;
  await page.goto('/');
  // tree menu → trash → undo from the toast
  await treeMenu(page, 'Корзина: черновик');
  await page.getByRole('menuitem', { name: 'Удалить в корзину' }).click();
  await expect(toasts(page)).toContainText('перемещены в корзину');
  await toasts(page).getByRole('button', { name: 'Восстановить' }).click();
  await expect.poll(async () => (await (await page.request.get(`/api/v1/pages/${id}`)).json()).page?.deletedAt ?? null).toBeNull();
  await expect(await treeLink(page, 'Корзина: черновик')).toBeVisible();
  // trash again; restore from the trash page with a double click
  await api(page, 'DELETE', `/api/v1/pages/${id}`);
  await page.goto('/trash');
  const row = page.locator('li, tr, .trash-item').filter({ hasText: 'Корзина: черновик' }).first();
  await expect(row).toBeVisible();
  // server error first: explained, item stays
  await failWith(page, `**/api/v1/pages/${id}/restore`, 'POST');
  await row.getByRole('button', { name: 'Восстановить' }).click();
  await expect(toasts(page)).toContainText(/Внутренняя ошибка сервера|Не удалось восстановить/);
  await expect(row).toBeVisible();
  await page.unroute(`**/api/v1/pages/${id}/restore`);
  const sent = await slow(page, `**/api/v1/pages/${id}/restore`, 'POST', 600);
  await humanDoubleClick(page, row.getByRole('button', { name: 'Восстановить' }));
  await expect(toasts(page)).toContainText('восстановлена');
  expect(sent.n).toBe(1);
  await page.unroute(`**/api/v1/pages/${id}/restore`);
  await expect(page.getByRole('button', { name: 'Удалить навсегда «Корзина: черновик»' })).toHaveCount(0);
  // purge: cancel, then typed confirmation
  await api(page, 'DELETE', `/api/v1/pages/${id}`);
  await page.reload();
  const purge = page.getByRole('button', { name: 'Удалить навсегда «Корзина: черновик»' });
  await purge.click();
  const dlg = page.getByRole('dialog', { name: 'Удалить навсегда?' });
  await expect(dlg.getByRole('button', { name: 'Удалить навсегда' })).toBeDisabled();
  await dlg.getByRole('button', { name: 'Отмена' }).click();
  await expect(dlg).toBeHidden();
  await expect(purge).toBeVisible();
  await purge.click();
  await dlg.getByLabel(/Для подтверждения введите/).fill('Корзина: черновик');
  await dlg.getByRole('button', { name: 'Удалить навсегда' }).click();
  await expect(toasts(page)).toContainText('Удалено навсегда');
  await expect(purge).toHaveCount(0);
  expect((await page.request.get(`/api/v1/pages/${id}`)).status()).toBe(404);
  expect(errors).toEqual([]);
});

test('QA-D4 (fixed): «Переименовать» in the tree row menu opens the inline title editor', async ({ page }) => {
  watch(page);
  await ensureOwner(page);
  await api(page, 'POST', '/api/v1/pages', { spaceId: personalId, parentId: null, title: 'Дерево: через меню', requestId: crypto.randomUUID() });
  await page.goto('/');
  await treeMenu(page, 'Дерево: через меню');
  await page.getByRole('menuitem', { name: 'Переименовать' }).click();
  await expect(page.getByLabel('Новое название')).toBeFocused({ timeout: 3000 });
});

test('R-QA-004 tree row: rename (F2) — Esc cancels, Enter saves, server error keeps the old title; «Дублировать» opens the copy; «Переместить в…» closes with Esc without moving', async ({ page }) => {
  watch(page);
  await ensureOwner(page);
  const created = await api(page, 'POST', '/api/v1/pages', { spaceId: personalId, parentId: null, title: 'Дерево: исходная', requestId: crypto.randomUUID() });
  const id = created.page.id as string;
  await page.goto('/');
  const rename = async (title: string) => {
    const link = await treeLink(page, title);
    await link.focus();
    await page.keyboard.press('F2');
    return page.getByLabel('Новое название');
  };
  // cancel
  let input = await rename('Дерево: исходная');
  await input.fill('Не сохранять');
  await input.press('Escape');
  await expect(input).toHaveCount(0);
  await expect(await treeLink(page, 'Дерево: исходная')).toBeVisible();
  // server error
  await failWith(page, `**/api/v1/pages/${id}`, 'PATCH');
  input = await rename('Дерево: исходная');
  await input.fill('Не сохранится');
  await input.press('Enter');
  await expect(toasts(page)).toContainText(/Внутренняя ошибка сервера|Не удалось переименовать/);
  expect((await (await page.request.get(`/api/v1/pages/${id}`)).json()).page.title).toBe('Дерево: исходная');
  await page.unroute(`**/api/v1/pages/${id}`);
  // success
  input = await rename('Дерево: исходная');
  await input.fill('Дерево: переименована');
  await input.press('Enter');
  await expect.poll(async () => (await (await page.request.get(`/api/v1/pages/${id}`)).json()).page.title).toBe('Дерево: переименована');
  // move dialog: cancel does not move
  await treeMenu(page, 'Дерево: переименована');
  await page.getByRole('menuitem', { name: 'Переместить в…' }).click();
  const move = page.getByRole('dialog', { name: /Переместить «/ });
  await expect(move).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(move).toBeHidden();
  expect((await (await page.request.get(`/api/v1/pages/${id}`)).json()).page.spaceId).toBe(personalId);
  // duplicate
  await treeMenu(page, 'Дерево: переименована');
  await page.getByRole('menuitem', { name: 'Дублировать' }).click();
  await expect(toasts(page)).toContainText('Копия создана');
  await page.waitForURL((u) => /\/p\//.test(u.pathname) && !u.pathname.includes(id));
  await expect(page.getByLabel('Название страницы')).toHaveValue(/Дерево: переименована/);
  expect(errors).toEqual([]);
});

test('R-QA-004 page menu: «Сохранить как шаблон», «Дублировать», «Удалить» with «Восстановить» from the toast', async ({ page }) => {
  watch(page);
  await ensureOwner(page);
  const id = await newPage(page, 'Меню страницы: проверка');
  await page.keyboard.type('Содержимое для шаблона.');
  const actions = page.locator('.page-header-bar').getByRole('button', { name: 'Действия со страницей' });
  await actions.click();
  await page.getByRole('menuitem', { name: 'Сохранить как шаблон' }).click();
  await expect(toasts(page)).toContainText(/шаблон/i);
  await actions.click();
  await page.getByRole('menuitem', { name: 'Дублировать' }).click();
  await page.waitForURL((u) => /\/p\//.test(u.pathname) && !u.pathname.includes(id));
  const copyId = page.url().split('/p/')[1].split(/[/?#]/)[0];
  await actions.click();
  await page.getByRole('menuitem', { name: 'Удалить', exact: true }).click();
  await expect(toasts(page)).toContainText('перемещены в корзину');
  await page.waitForURL((u) => !u.pathname.includes(copyId));
  await toasts(page).getByRole('button', { name: 'Восстановить' }).click();
  await expect.poll(async () => (await (await page.request.get(`/api/v1/pages/${copyId}`)).json()).page?.deletedAt ?? null).toBeNull();
  expect(errors).toEqual([]);
});

test('R-QA-029 no permission: a viewer sees page and tree actions disabled with the reason, and the server refuses them', async ({ page, browser }) => {
  watch(page);
  await ensureOwner(page);
  const created = await api(page, 'POST', '/api/v1/pages', { spaceId: personalId, parentId: null, title: 'Только для чтения: регламент', requestId: crypto.randomUUID() });
  const id = created.page.id as string;
  const reader = await createUser(page.request, 'Вика Читатель', { pageGrants: [{ pageId: id, level: 'view' }] });
  const { ctx, p } = await userContext(browser, reader, '/p/' + id);
  await p.goto('/p/' + id);
  await p.locator('.page-header-bar').getByRole('button', { name: 'Действия со страницей' }).click();
  const del = p.getByRole('menuitem', { name: 'Удалить', exact: true });
  await expect(del).toBeDisabled();
  await expect(del).toHaveAttribute('title', /Удалять страницу может только пользователь с полным доступом/);
  await expect(p.getByRole('menuitem', { name: 'Сохранить как шаблон' })).toHaveAttribute('title', /Нужно право на редактирование страницы/);
  await expect(p.getByRole('menuitem', { name: 'Переместить в…' })).toBeDisabled();
  await p.keyboard.press('Escape');
  // the tree row of a page shared with me: rename and trash need edit rights
  await treeMenu(p, 'Только для чтения: регламент');
  for (const name of ['Переименовать', 'Удалить в корзину']) {
    const item = p.getByRole('menuitem', { name });
    await expect(item).toBeDisabled();
    await expect(item).toHaveAttribute('title', 'Нужно право на редактирование — запросите его у владельца страницы');
  }
  await p.keyboard.press('Escape');
  const csrf = (await ctx.storageState()).cookies.find((c) => c.name === 'kb_csrf')!.value;
  expect((await p.request.delete(`/api/v1/pages/${id}`, { headers: { 'x-csrf-token': csrf } })).status()).toBe(403);
  await ctx.close();
  expect(errors).toEqual([]);
});

test('R-QA-004 search: empty result explains itself, «Очистить» resets the query, a server error offers «Повторить»', async ({ page }) => {
  watch(page);
  await ensureOwner(page);
  await page.goto('/search?q=' + encodeURIComponent('ъъънесуществующееслово'));
  await expect(page.getByRole('heading', { name: /ничего не найдено/ })).toBeVisible();
  await page.getByRole('button', { name: 'Очистить' }).click();
  await expect(page.getByLabel('Поисковый запрос')).toHaveValue('');
  await expect(page.getByLabel('Поисковый запрос')).toBeFocused();
  let fail = true;
  await page.route('**/api/v1/search?**', (route) => (fail ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'internal', message: 'Поиск недоступен' } }) }) : route.fallback()));
  await page.getByLabel('Поисковый запрос').fill('Проверка');
  const retry = page.getByRole('alert').getByRole('button', { name: 'Повторить' });
  await expect(retry).toBeVisible({ timeout: 15_000 });
  fail = false;
  await retry.click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('QA-D5 (fixed): «Настройки и участники» in the sidebar space menu opens the space settings', async ({ page }) => {
  watch(page);
  await ensureOwner(page);
  await page.goto('/');
  // the tree re-renders while spaces load: click() re-resolves the (virtualized) row instead of holding a stale element
  await (await treeLink(page, 'Действия пространства «Проверка действий»', 'button')).click();
  await page.getByRole('menuitem', { name: 'Настройки и участники' }).click();
  await page.waitForURL(/tab=settings/);
  await expect(page.getByRole('tablist', { name: 'Разделы пространства' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Настройки' })).toHaveAttribute('aria-selected', 'true', { timeout: 3000 });
});

test('R-QA-004 space settings: «Удалить пространство» — cancel keeps it, typed confirmation moves it to the trash, the trash restores it', async ({ page }) => {
  watch(page);
  await ensureOwner(page);
  const sp = await api(page, 'POST', '/api/v1/spaces', { name: 'Удаляемое пространство', kind: 'project', visibility: 'open' });
  const sid = sp.space.id as string;
  await page.goto('/s/' + sid);
  await page.getByRole('tab', { name: 'Настройки' }).click();
  await page.getByRole('button', { name: 'Удалить пространство' }).click();
  const dlg = page.getByRole('dialog', { name: 'Удалить пространство?' });
  await expect(dlg.getByRole('button', { name: 'Удалить', exact: true })).toBeDisabled();
  await dlg.getByRole('button', { name: 'Отмена' }).click();
  await expect(dlg).toBeHidden();
  expect((await page.request.get('/api/v1/spaces/' + sid)).ok()).toBeTruthy();
  await page.getByRole('button', { name: 'Удалить пространство' }).click();
  await dlg.getByLabel(/Для подтверждения введите/).fill('Удаляемое пространство');
  await dlg.getByRole('button', { name: 'Удалить', exact: true }).click();
  await expect(toasts(page)).toContainText('Пространство перемещено в корзину');
  await toasts(page).getByRole('button', { name: 'Открыть корзину' }).click();
  await page.waitForURL('**/trash');
  const restore = page.locator('li, tr, .trash-item').filter({ hasText: 'Удаляемое пространство' }).first().getByRole('button', { name: 'Восстановить' });
  await restore.click();
  await expect(toasts(page)).toContainText('Пространство «Удаляемое пространство» восстановлено');
  expect((await page.request.get('/api/v1/spaces/' + sid)).ok()).toBeTruthy();
  expect(errors).toEqual([]);
});

/** Starts a new empty paragraph at the end of the document (diagnostics hook, localStorage kb:debug = 1). */
async function freshLine(page: Page) {
  await page.waitForFunction(() => (window as any).__kbEditor);
  await page.evaluate(() => {
    const e = (window as any).__kbEditor;
    e.chain().insertContentAt(e.state.doc.content.size, { type: 'paragraph' }).focus('end').run();
  });
}

/** Picks a command in the "/" menu: types the query, waits for the option, clicks it. */
async function slash(page: Page, query: string, title: string) {
  await page.keyboard.type('/' + query);
  const option = page.getByRole('listbox').getByRole('option', { name: new RegExp('^' + title.replace(/[()]/g, '\\$&')) }).first();
  await expect(option).toBeVisible();
  await option.click();
}

function types(node: any, out = new Set<string>()) {
  if (node?.type) out.add(node.type);
  for (const c of node?.content ?? []) types(c, out);
  return out;
}

test('R-QA-004 editor "/" menu: every block command inserts its block; dialog commands close with «Отмена»/Esc without inserting', async ({ page }) => {
  test.setTimeout(120_000);
  watch(page);
  await ensureOwner(page);
  await page.evaluate(() => localStorage.setItem('kb:debug', '1'));
  const id = await newPage(page, 'Команды меню «/»');
  created.push(id);
  await page.reload();
  await expect(editor(page)).toBeVisible();
  const blocks: Array<[string, string, string]> = [];
  const run = async (query: string, title: string, type: string) => {
    await freshLine(page);
    await slash(page, query, title);
    blocks.push([query, title, type]);
  };
  await run('текст', 'Текст', 'paragraph');
  await page.keyboard.type('Обычный абзац');
  await run('маркир', 'Маркированный список', 'bulletList');
  await page.keyboard.type('пункт');
  await run('нумер', 'Нумерованный список', 'orderedList');
  await page.keyboard.type('первый');
  await run('чек', 'Чек-лист', 'taskList');
  await page.keyboard.type('задача');
  await run('раскрыв', 'Раскрывающийся блок', 'details');
  await run('выделенный', 'Выделенный блок', 'callout');
  await page.keyboard.type('заметка');
  await run('две', 'Две колонки', 'columns');
  await run('оглав', 'Оглавление', 'toc');
  await run('три', 'Три колонки', 'columns');
  await run('формула', 'Формула', 'blockMath');
  await run('схема', 'Схема (Mermaid)', 'mermaid');
  await run('код', 'Блок кода', 'codeBlock');
  await page.keyboard.type('const x = 1;');
  // dialog commands: cancel inserts nothing
  await freshLine(page);
  await slash(page, 'видео', 'Видео или ссылка');
  const embed = page.getByRole('dialog', { name: 'Видео или ссылка' });
  await expect(embed.getByRole('button', { name: 'Вставить' })).toBeDisabled(); // empty address
  await embed.getByRole('button', { name: 'Отмена' }).click();
  await expect(embed).toBeHidden();
  await freshLine(page);
  await slash(page, 'ссылка', 'Ссылка на страницу');
  await expect(page.getByRole('dialog', { name: 'Ссылка на страницу' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Ссылка на страницу' })).toBeHidden();
  await freshLine(page);
  await slash(page, 'синхрон', 'Синхронизированный блок');
  await expect(page.getByRole('dialog', { name: 'Синхронизированный блок' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Синхронизированный блок' })).toBeHidden();
  // the embed dialog inserts a link card for an address
  await freshLine(page);
  await slash(page, 'видео', 'Видео или ссылка');
  await embed.getByLabel('Адрес').fill('https://example.com/regulations');
  await embed.getByRole('button', { name: 'Вставить' }).click();
  await expect(embed).toBeHidden();
  // emoji and mention commands open their suggestion lists; Esc closes them
  await freshLine(page);
  await slash(page, 'эмодзи', 'Эмодзи');
  await page.keyboard.press('Escape');
  await freshLine(page);
  await slash(page, 'упомин', 'Упоминание');
  await page.keyboard.press('Escape');
  await expectSaved(page);
  const doc = (await apiContent(page.request, id)).content;
  const got = types(doc);
  for (const [, title, type] of blocks) expect(got.has(type), `${title} → ${type}`).toBe(true);
  expect(got.has('embed')).toBe(true);
  expect(got.has('pageLink') || got.has('syncedBlock')).toBe(false); // cancelled dialogs inserted nothing
  // QA-D6 (open defect, reproduced separately below): the placeholder plugin throws «Position N out of range»
  expect(errors).toEqual([]);
});

test('QA-D6 (fixed): inserting column blocks from the "/" menu raises no uncaught editor error', async ({ page }) => {
  const own: string[] = [];
  page.on('pageerror', (e) => own.push(e.message));
  await ensureOwner(page);
  await page.evaluate(() => localStorage.setItem('kb:debug', '1'));
  const id = await newPage(page, 'Колонки без ошибок');
  created.push(id);
  await page.reload();
  await expect(editor(page)).toBeVisible();
  for (const [q, t] of [['две', 'Две колонки'], ['оглав', 'Оглавление'], ['три', 'Три колонки'], ['текст', 'Текст']]) {
    await freshLine(page);
    await slash(page, q, t);
  }
  await expectSaved(page);
  expect(own).toEqual([]);
});

test('R-QA-004 block menu «Действия с блоком»: «Дублировать», «Переместить вверх», «Цвет текста», «Удалить» and Ctrl+Z; Esc closes the menu without changes', async ({ page }) => {
  watch(page);
  await ensureOwner(page);
  const id = await newPage(page, 'Меню блока');
  created.push(id);
  await page.keyboard.type('Блок А');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Блок Б');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Блок В');
  const texts = () => editor(page).evaluate((el) => [...el.children].map((c) => (c as HTMLElement).innerText.trim()).filter(Boolean));
  // the menu is opened on a freshly loaded page for every block: QA-D7 (open defect) — once opened, the block menu keeps
  // acting on its first block
  const menuFor = async (text: string, nth = 0, fresh = true) => {
    if (fresh) {
      await expectSaved(page);
      await page.reload();
      await expect(editor(page)).toContainText(text);
    }
    const block = editor(page).locator('p', { hasText: text }).nth(nth);
    await block.hover();
    const handle = page.getByRole('button', { name: 'Действия с блоком' });
    // the handle follows the hovered block; act only once it stands next to it
    await expect
      .poll(async () => {
        const [b, h] = [await block.boundingBox(), await handle.boundingBox()];
        return !!b && !!h && h.y + h.height / 2 >= b.y - 2 && h.y + h.height / 2 <= b.y + b.height + 2;
      })
      .toBe(true);
    await handle.click();
    await expect(page.getByRole('menu')).toBeVisible();
  };
  await menuFor('Блок Б', 0, false);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  expect(await texts()).toEqual(['Блок А', 'Блок Б', 'Блок В']);
  await menuFor('Блок В');
  await page.getByRole('menuitem', { name: 'Переместить вверх' }).click();
  await expect.poll(texts).toEqual(['Блок А', 'Блок В', 'Блок Б']);
  await menuFor('Блок А');
  await page.getByRole('menuitem', { name: 'Цвет текста' }).press('ArrowRight');
  // keyboard: the submenu opens outside the window for a block near the sidebar (QA-D8), so a pointer cannot reach it
  await page.getByRole('menuitem', { name: /Красный$/ }).press('Enter');
  await expect(editor(page).locator('p', { hasText: 'Блок А' }).locator('[style*="color"]')).toHaveCount(1);
  await menuFor('Блок В');
  await page.getByRole('menuitem', { name: 'Дублировать' }).click();
  await expect.poll(texts).toEqual(['Блок А', 'Блок В', 'Блок В', 'Блок Б']);
  await menuFor('Блок Б');
  await page.getByRole('menuitem', { name: /^Удалить/ }).click();
  await expect.poll(texts).toEqual(['Блок А', 'Блок В', 'Блок В']);
  // undo from the text (after the menu closes, focus is on the block handle)
  await editor(page).locator('p', { hasText: 'Блок А' }).click();
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(texts).toEqual(['Блок А', 'Блок В', 'Блок В', 'Блок Б']);
  await expectSaved(page);
  expect(errors).toEqual([]);
});

test('QA-D7 (fixed): the block menu acts on the block it is opened next to, also after it was opened for another block', async ({ page }) => {
  watch(page);
  await ensureOwner(page);
  const id = await newPage(page, 'Меню блока: цель');
  created.push(id);
  for (const [i, t] of ['Блок А', 'Блок Б', 'Блок В'].entries()) {
    if (i) await page.keyboard.press('Enter');
    await page.keyboard.type(t);
  }
  const texts = () => editor(page).evaluate((el) => [...el.children].map((c) => (c as HTMLElement).innerText.trim()).filter(Boolean));
  const handle = page.getByRole('button', { name: 'Действия с блоком' });
  await editor(page).locator('p', { hasText: 'Блок Б' }).hover();
  await handle.click();
  await page.keyboard.press('Escape');
  await editor(page).locator('p', { hasText: 'Блок В' }).hover();
  await handle.click();
  await page.getByRole('menuitem', { name: 'Переместить вверх' }).click();
  await expect.poll(texts, { timeout: 3000 }).toEqual(['Блок А', 'Блок В', 'Блок Б']);
});

test('QA-D8 (fixed): the «Цвет текста» submenu of the block menu opens inside the window and can be clicked', async ({ page }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Подменю в пределах окна');
  created.push(id);
  await page.keyboard.type('Абзац');
  await editor(page).locator('p', { hasText: 'Абзац' }).hover();
  await page.getByRole('button', { name: 'Действия с блоком' }).click();
  await page.getByRole('menuitem', { name: 'Цвет текста' }).hover();
  const red = page.getByRole('menuitem', { name: /Красный$/ });
  await expect(red).toBeVisible();
  const box = (await red.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  await red.click({ timeout: 3000 });
  await expect(editor(page).locator('p', { hasText: 'Абзац' }).locator('[style*="color"]')).toHaveCount(1);
});

test('R-QA-004 admin users menu: «Сбросить пароль» (cancel, then link), «Изменить профиль и роль» (nothing to save until changed), «Деактивировать (увольнение)…» needs acknowledgement and cancels, «Приостановить доступ…» → «Восстановить доступ»; own row cannot be disabled', async ({ page }) => {
  watch(page);
  await ensureOwner(page);
  const u = await createUser(page.request, 'Ульяна Админтест');
  await page.goto('/admin/users');
  await page.getByLabel('Поиск пользователей').fill('Ульяна Админтест');
  const openMenu = async () => {
    await page.getByRole('button', { name: /Действия.*Ульяна Админтест/ }).click();
    await expect(page.getByRole('menu')).toBeVisible();
  };
  // reset password: cancel, then confirm → one-time link
  await openMenu();
  await page.getByRole('menuitem', { name: 'Сбросить пароль' }).click();
  const reset = page.getByRole('dialog', { name: 'Сбросить пароль?' });
  await reset.getByRole('button', { name: 'Отмена' }).click();
  await expect(reset).toBeHidden();
  await openMenu();
  await page.getByRole('menuitem', { name: 'Сбросить пароль' }).click();
  await reset.getByRole('button', { name: 'Сбросить пароль' }).click();
  const link = page.getByRole('dialog', { name: 'Ссылка для сброса пароля' });
  await expect(link).toBeVisible();
  await link.getByRole('button', { name: 'Готово' }).click();
  // edit: «Сохранить» is unavailable until something changes
  await openMenu();
  await page.getByRole('menuitem', { name: 'Изменить профиль и роль' }).click();
  const edit = page.getByRole('dialog', { name: 'Изменить: Ульяна Админтест' });
  await expect(edit.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
  await edit.getByLabel('Должность').fill('Инженер по качеству');
  await edit.getByRole('button', { name: 'Сохранить' }).click();
  await expect(toasts(page)).toContainText('Изменения сохранены');
  // deactivate: the confirm button needs «Я понимаю последствия»; cancel changes nothing
  await openMenu();
  await page.getByRole('menuitem', { name: 'Деактивировать (увольнение)…' }).click();
  const deact = page.getByRole('dialog', { name: 'Деактивировать Ульяна Админтест?' });
  await expect(deact.getByRole('button', { name: 'Деактивировать' })).toBeDisabled();
  await deact.getByRole('button', { name: 'Отмена' }).click();
  await expect(deact).toBeHidden();
  // suspend → restore
  await openMenu();
  await page.getByRole('menuitem', { name: 'Приостановить доступ…' }).click();
  const susp = page.getByRole('dialog', { name: 'Приостановить доступ Ульяна Админтест?' });
  await susp.getByLabel('Причина (попадёт в журнал аудита)').fill('Проверка сценария');
  await susp.getByLabel('Я понимаю последствия').check();
  await susp.getByRole('button', { name: 'Приостановить' }).click();
  await expect(toasts(page)).toContainText('Доступ приостановлен');
  expect((await page.request.post('/api/v1/auth/login', { data: { email: u.email, password: u.password } })).ok()).toBe(false);
  await openMenu();
  await page.getByRole('menuitem', { name: 'Восстановить доступ' }).click();
  await page.getByRole('dialog', { name: 'Восстановить доступ?' }).getByRole('button', { name: 'Восстановить' }).click();
  await expect(toasts(page)).toContainText('Доступ восстановлен');
  // no permission on oneself
  await page.getByLabel('Поиск пользователей').fill('Анна Владелец');
  await page.getByRole('button', { name: /Действия.*Анна Владелец/ }).click();
  const self = page.getByRole('menuitem', { name: 'Деактивировать (увольнение)…' });
  await expect(self).toBeDisabled();
  await expect(self).toHaveAttribute('title', 'Нельзя отключить себя');
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

test('R-QA-004 templates: «Новый шаблон» — empty name disables «Создать шаблон», «Отмена» creates nothing, create; «Удалить шаблон «…»» — cancel keeps it, confirm removes it', async ({ page }) => {
  watch(page);
  await ensureOwner(page);
  await page.goto('/templates');
  await page.getByRole('button', { name: 'Новый шаблон' }).click();
  const dlg = page.getByRole('dialog', { name: 'Новый шаблон' });
  await expect(dlg.getByRole('button', { name: 'Создать шаблон' })).toBeDisabled();
  await dlg.getByLabel('Название шаблона').fill('Шаблон проверки действий');
  await dlg.getByRole('button', { name: 'Отмена' }).click();
  await expect(dlg).toBeHidden();
  await expect(page.getByRole('button', { name: 'Удалить шаблон «Шаблон проверки действий»' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Новый шаблон' }).click();
  await dlg.getByLabel('Название шаблона').fill('Шаблон проверки действий');
  await dlg.getByLabel('Категория').fill('Проверка');
  await dlg.getByRole('button', { name: 'Создать шаблон' }).click();
  await expect(toasts(page)).toContainText('Шаблон создан');
  const del = page.getByRole('button', { name: 'Удалить шаблон «Шаблон проверки действий»' });
  await expect(del).toBeVisible();
  await del.click();
  const confirmDlg = page.getByRole('dialog', { name: 'Удалить шаблон?' });
  await confirmDlg.getByRole('button', { name: 'Отмена' }).click();
  await expect(del).toBeVisible();
  await del.click();
  await confirmDlg.getByRole('button', { name: 'Удалить', exact: true }).click();
  await expect(del).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('R-QA-004 invitation link /invite/:token: empty password disables «Продолжить», an invalid link and a short password are explained, a valid one signs the employee in', async ({ page, browser }) => {
  watch(page);
  await ensureOwner(page);
  const csrf = (await page.context().storageState()).cookies.find((c) => c.name === 'kb_csrf')!.value;
  const r = await page.request.post('/api/v1/admin/users', { data: { email: `invite${Date.now()}@corp.test`, name: 'Игорь Приглашённый', kind: 'employee', invite: true }, headers: { 'x-csrf-token': csrf } });
  expect(r.ok(), await r.text()).toBeTruthy();
  const inviteUrl = new URL((await r.json()).inviteUrl as string);
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  watch(p);
  // a broken link: explained, no sign-in
  await p.goto('/invite/0000000000000000000000000000000000000000');
  const go = p.getByRole('button', { name: 'Продолжить' });
  await expect(go).toBeDisabled();
  await p.getByLabel('Новый пароль').fill('Invite-password-2026');
  await go.click();
  await expect(p.getByRole('alert')).toBeVisible();
  // the real link: a too short password is refused with a reason, then a valid one signs in
  await p.goto(inviteUrl.pathname);
  await p.getByLabel('Как к вам обращаться (необязательно)').fill('Игорь');
  await p.getByLabel('Новый пароль').fill('Short-pw-1');
  await go.click();
  await expect(p.getByRole('alert')).toBeVisible();
  await p.getByLabel('Новый пароль').fill('Invite-password-2026');
  await go.click();
  await expect(p.locator('.app-shell')).toBeVisible();
  await ctx.close();
  expect(errors).toEqual([]);
});

test('R-QA-004 navigation: sidebar «Шаблоны», «Импорт», «Корзина» and the quick switcher commands «Корзина», «Импорт документов» open their screens', async ({ page }) => {
  watch(page);
  await ensureOwner(page);
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Навигация' });
  for (const [name, path] of [['Шаблоны', '/templates'], ['Импорт', '/import'], ['Корзина', '/trash']] as const) {
    await nav.getByRole('link', { name, exact: true }).click();
    await page.waitForURL('**' + path);
  }
  for (const [name, path] of [['Корзина', '/trash'], ['Импорт документов', '/import']] as const) {
    await page.goto('/');
    await page.getByRole('navigation', { name: 'Навигация' }).getByRole('button', { name: /^Поиск/ }).click();
    const sw = page.getByRole('dialog', { name: 'Быстрый переход' });
    await expect(sw).toBeVisible();
    await sw.getByRole('option', { name: new RegExp('^' + name) }).click();
    await page.waitForURL('**' + path);
  }
  expect(errors).toEqual([]);
});

test('R-QA-004 profile (separate account): «Сохранить» needs a change, «Отменить» restores the form, a server error keeps the input, success saves the name', async ({ page, browser }) => {
  watch(page);
  await ensureOwner(page);
  const u = await createUser(page.request, 'Пелагея Профиль');
  const { ctx, p } = await userContext(browser, u, '/settings/profile');
  await p.goto('/settings/profile');
  const save = p.getByRole('button', { name: 'Сохранить' });
  const name = p.getByLabel('Имя и фамилия');
  await expect(save).toBeDisabled();
  await name.fill('Пелагея Новая');
  await p.getByRole('button', { name: 'Отменить' }).click();
  await expect(name).toHaveValue('Пелагея Профиль');
  await failWith(p, '**/api/v1/auth/me', 'PATCH');
  await name.fill('Пелагея Новая');
  await save.click();
  await expect(p.getByRole('alert')).toBeVisible();
  await expect(name).toHaveValue('Пелагея Новая');
  await p.unrouteAll();
  await save.click();
  await expect(toasts(p)).toContainText('Профиль сохранён');
  expect((await (await p.request.get('/api/v1/auth/me')).json()).user.name).toBe('Пелагея Новая');
  await ctx.close();
  expect(errors).toEqual([]);
});

test('R-QA-004 organisation name: «Переименовать» is unavailable without a change and a server error is explained without renaming', async ({ page }) => {
  watch(page);
  await ensureOwner(page);
  await page.goto('/admin/settings');
  const btn = page.getByRole('button', { name: 'Переименовать' });
  const input = page.getByLabel('Название организации');
  const before = await input.inputValue();
  await expect(btn).toBeDisabled();
  await input.fill('   ');
  await expect(btn).toBeDisabled(); // empty
  await failWith(page, '**/api/v1/admin/org', 'PATCH');
  await input.fill(before + ' (временно)');
  await btn.click();
  await expect(toasts(page)).toContainText(/Внутренняя ошибка сервера|ошибк/i);
  expect((await (await page.request.get('/api/v1/auth/me')).json()).org.name).toBe(before);
  await page.unrouteAll();
  await input.fill(before);
  await expect(btn).toBeDisabled();
  expect(errors).toEqual([]);
});
