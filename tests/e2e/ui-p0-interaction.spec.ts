import { test, expect, type Page } from '@playwright/test';
import { ensureOwner, newPage, editor, expectSaved, createUser, login_, api, treeLink } from './helpers';
import { spaceOf } from './perf-helpers';

/**
 * Interaction rules that must hold everywhere: menus and popovers stay inside the viewport and manage focus,
 * hover never acts, every hover-only action has a keyboard path, no dead ends (endless spinner, dialog without exit,
 * disabled action without a reason, page created "nowhere", lost draft), and failures are explained to the user.
 */
test.describe.configure({ mode: 'serial' });

let pageId = '';
const errors: string[] = [];

function watchErrors(page: Page) {
  page.on('pageerror', (e) => errors.push(e.message));
}

const header = (page: Page) => page.locator('.page-header-bar');

async function inViewport(page: Page, selector: string) {
  return page.locator(selector).last().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, vw: document.documentElement.clientWidth, vh: document.documentElement.clientHeight, scrollable: el.scrollHeight <= el.clientHeight + 1 || /(auto|scroll)/.test(getComputedStyle(el).overflowY) };
  });
}

function expectInside(b: Awaited<ReturnType<typeof inViewport>>) {
  expect(b.left).toBeGreaterThanOrEqual(0);
  expect(b.top).toBeGreaterThanOrEqual(0);
  expect(b.right).toBeLessThanOrEqual(b.vw);
  expect(b.bottom).toBeLessThanOrEqual(b.vh);
  expect(b.scrollable, 'content taller than the popover must scroll').toBe(true);
}

test('prepare pages', async ({ page }) => {
  watchErrors(page);
  await ensureOwner(page);
  pageId = await newPage(page, 'Взаимодействие: меню и фокус');
  await page.keyboard.type('Текст страницы для проверки меню.');
  await expectSaved(page);
  // a long tree, so that the last rows sit at the bottom edge of a short window
  const spaceId = await spaceOf(page.request, pageId);
  for (let i = 0; i < 14; i++) await api(page, 'POST', '/api/v1/pages', { spaceId, parentId: null, title: `Строка дерева ${String(i).padStart(2, '0')}`, requestId: crypto.randomUUID() });
});

test('R-UI-059, R-UI-008, E224: menus at viewport edges flip/shift inside the window, keep keyboard focus, close with Esc or outside click and return focus', async ({ page }) => {
  watchErrors(page);
  await page.setViewportSize({ width: 1024, height: 420 });
  await ensureOwner(page);
  await page.goto('/p/' + pageId);
  // top-right trigger: the menu shifts left and is height-limited with its own scroll
  const trigger = header(page).getByRole('button', { name: 'Действия со страницей' });
  await trigger.click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await expect(async () => expectInside(await inViewport(page, '.menu'))).toPass({ timeout: 3000 }); // after the pop-in animation
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('role'))).toMatch(/menuitem/);
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
  // outside click closes
  await trigger.click();
  await expect(menu).toBeVisible();
  await page.mouse.click(500, 300);
  await expect(menu).toBeHidden();

  // the last row of a long tree sits at the bottom of the window: the menu opens upwards (flip) and stays fully visible
  await page.setViewportSize({ width: 1024, height: 700 });
  const tree = page.getByRole('tree', { name: 'Страницы' });
  await page.locator('.tree-scroll').evaluate((e) => (e.scrollTop = e.scrollHeight));
  await page.waitForTimeout(300); // virtualised rows render after scrolling
  const last = tree.locator('[role=treeitem] .tree-row-main').last();
  const rowBox = (await last.boundingBox())!;
  await last.focus();
  await page.keyboard.press('Shift+F10'); // keyboard path to the hover-only row actions
  await expect(menu).toBeVisible();
  await expect(async () => expectInside(await inViewport(page, '.menu'))).toPass({ timeout: 3000 });
  const b = await inViewport(page, '.menu');
  const menuH = b.bottom - b.top;
  if (b.vh - (rowBox.y + rowBox.height) < menuH) expect(b.bottom, 'not enough room below: the menu must flip above the row').toBeLessThanOrEqual(rowBox.y + rowBox.height + 1);
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('role'))).toMatch(/menuitem/);
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('.tree-row'))).toBe(true);

  // tooltip next to the right edge stays inside the window
  await page.mouse.move(400, 400);
  await header(page).getByRole('button', { name: 'Комментарии' }).hover();
  await expect(page.locator('.tooltip')).toBeVisible();
  const t = await inViewport(page, '.tooltip');
  expect(t.right).toBeLessThanOrEqual(t.vw);
  expect(t.left).toBeGreaterThanOrEqual(0);
});

test('R-UI-059, R-UI-053: dialogs trap focus, always have a visible exit and Esc, and return focus to the opener', async ({ page }) => {
  watchErrors(page);
  await ensureOwner(page);
  await page.goto('/p/' + pageId);
  const actions = header(page).getByRole('button', { name: 'Действия со страницей' });
  const openers: Array<{ name: string; open: () => Promise<void>; focusBack: () => Promise<void> }> = [
    { name: 'Поделиться', open: () => header(page).getByRole('button', { name: 'Поделиться' }).click(), focusBack: () => expect(header(page).getByRole('button', { name: 'Поделиться' })).toBeFocused() },
    { name: 'Экспорт', open: async () => (await actions.click(), await page.getByRole('menuitem', { name: 'Экспорт…' }).click()), focusBack: async () => expect.poll(() => page.evaluate(() => document.activeElement !== document.body)).toBe(true) },
    { name: 'Переместить', open: async () => (await (await treeLink(page, 'Строка дерева 00')).focus(), await page.keyboard.press('Shift+F10'), await page.getByRole('menuitem', { name: 'Переместить в…' }).click()), focusBack: async () => expect.poll(() => page.evaluate(() => document.activeElement !== document.body)).toBe(true) },
    { name: 'Справка', open: async () => (await page.locator('body').click({ position: { x: 5, y: 5 } }), await page.keyboard.press('?')), focusBack: async () => undefined },
  ];
  for (const o of openers) {
    await o.open();
    const dlg = page.getByRole('dialog').last();
    await expect(dlg, o.name).toBeVisible();
    await expect(dlg.getByRole('button', { name: 'Закрыть' }), `${o.name}: visible exit`).toBeVisible();
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      const inside = await dlg.evaluate((d) => d.contains(document.activeElement));
      expect(inside, `${o.name}: focus left the dialog after ${i + 1} Tab`).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dlg, `${o.name}: Esc closes`).toBeHidden();
    await o.focusBack();
  }
});

test('R-UI-060, UX-141: hovering controls performs no action; hover-only tree actions have a keyboard equivalent', async ({ page }) => {
  watchErrors(page);
  await ensureOwner(page);
  await page.goto('/p/' + pageId);
  await expect(editor(page)).toContainText('Текст страницы');
  const url = page.url();
  const before = await page.evaluate(() => ({ title: document.title, rows: document.querySelectorAll('[role=treeitem]').length, text: document.querySelector('.kb-editor')?.textContent }));
  const targets = page.locator('.sidebar button, .sidebar a[href], .page-header-bar button, .page-header-bar a[href], [role=treeitem]');
  const n = Math.min(await targets.count(), 70);
  let hovered = 0;
  for (let i = 0; i < n; i++) {
    const el = targets.nth(i);
    if (!(await el.isVisible())) continue;
    const box = await el.boundingBox();
    if (!box || box.width < 2) continue;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(120);
    hovered++;
  }
  await page.waitForTimeout(600); // longer than any hover delay (tooltips open at 450 ms)
  expect(hovered).toBeGreaterThan(15);
  expect(page.url()).toBe(url);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('menu')).toHaveCount(0);
  const after = await page.evaluate(() => ({ title: document.title, rows: document.querySelectorAll('[role=treeitem]').length, text: document.querySelector('.kb-editor')?.textContent }));
  expect(after).toEqual(before);

  // keyboard equivalent of the hover "+" on a tree row: Shift+F10 → «Новая вложенная страница»
  const row = page.getByRole('tree', { name: 'Страницы' }).getByRole('link', { name: 'Взаимодействие: меню и фокус' });
  await row.focus();
  await page.keyboard.press('Shift+F10');
  await expect(page.getByRole('menuitem', { name: 'Новая вложенная страница' })).toBeEnabled();
  await page.keyboard.press('Escape');
});

test('R-UI-053: a server that does not answer gives an explanation and a retry instead of an endless spinner', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await ensureOwner(page);
  await page.route('**/api/v1/auth/me', () => undefined); // never answered
  await page.evaluate(() => localStorage.removeItem('kb:me'));
  await page.goto('/');
  const alert = page.getByRole('alert').filter({ hasText: 'Сервер не отвечает' });
  await expect(alert).toBeVisible({ timeout: 20_000 });
  await expect(alert).toContainText('данные не потеряны');
  await page.unroute('**/api/v1/auth/me');
  await alert.getByRole('button', { name: 'Повторить' }).click();
  await expect(page.locator('.app-shell')).toBeVisible();
  await ctx.close();
});

test('R-UI-053, R-UI-068: disabled actions always say why (view-only user)', async ({ page, browser }) => {
  watchErrors(page);
  await ensureOwner(page);
  const viewer = await createUser(page.request, 'Вера Читатель', { pageGrants: [{ pageId, level: 'view' }] });
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await p2.goto('/p/' + pageId);
  await login_(p2, viewer.email, viewer.password);
  await expect(editor(p2)).toContainText('Текст страницы');
  await header(p2).getByRole('button', { name: 'Действия со страницей' }).click();
  const items = p2.getByRole('menu').locator('[role^=menuitem]');
  await expect(items.first()).toBeVisible();
  const disabled = await items.evaluateAll((els) => els.filter((e) => (e as HTMLButtonElement).disabled).map((e) => ({ label: e.textContent, reason: e.getAttribute('title') })));
  expect(disabled.length).toBeGreaterThan(0);
  for (const d of disabled) expect(d.reason, `«${d.label}» is disabled without a reason`).toBeTruthy();
  await p2.keyboard.press('Escape');
  await ctx.close();
});

test('R-UI-062: a new page is never created "nowhere" and a draft survives an immediate reload', async ({ page }) => {
  watchErrors(page);
  page.on('dialog', (d) => d.accept()); // "leave page?" while changes are still being sent
  await ensureOwner(page);
  const id = await newPage(page, 'Черновик без потерь');
  // the page has a place: breadcrumbs show its space and the tree lists it
  await expect(page.getByRole('navigation', { name: 'Путь к странице' })).toBeVisible();
  await expect(page.getByRole('tree', { name: 'Страницы' }).getByRole('link', { name: 'Черновик без потерь' })).toBeVisible();
  await page.keyboard.type('Набрано и сразу перезагружено');
  await page.reload(); // no waiting for "Сохранено"
  await expect(editor(page)).toContainText('Набрано и сразу перезагружено', { timeout: 15_000 });
  await expectSaved(page);
  expect(page.url()).toContain(id);
});

test('R-UI-009, R-UI-052: failed actions are shown with what happened, that nothing was saved, and what to do', async ({ page }) => {
  watchErrors(page);
  await ensureOwner(page);
  await page.goto('/p/' + pageId);
  await expect(editor(page)).toContainText('Текст страницы');
  const url = page.url();
  const toast = page.locator('.toast.error').last();

  // server failure while creating a page from the sidebar (used to be an unhandled rejection with no message)
  await page.route('**/api/v1/pages', (r) => (r.request().method() === 'POST' ? r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'internal', message: 'Внутренняя ошибка сервера' }, correlationId: 'corr-e2e-1' }) }) : r.continue()));
  await page.getByRole('navigation', { name: 'Навигация' }).getByRole('button', { name: 'Новая страница', exact: true }).click();
  await expect(toast).toContainText('Внутренняя ошибка сервера.');
  await expect(toast).toContainText('Изменение не сохранено.');
  await expect(toast).toContainText('Повторите попытку');
  await expect(toast).toContainText('corr-e2e-1');
  expect(page.url()).toBe(url);
  await page.unroute('**/api/v1/pages');

  // no rights
  await page.route('**/api/v1/pages/*/favorite', (r) => r.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: { code: 'forbidden', message: 'Нет доступа' } }) }));
  await header(page).getByRole('button', { name: 'Избранное' }).click();
  await expect(toast).toContainText('Нет доступа. Изменение не сохранено. Запросите доступ');
  await page.unroute('**/api/v1/pages/*/favorite');

  // network failure
  await page.route('**/api/v1/pages/*/favorite', (r) => r.abort('internetdisconnected'));
  await header(page).getByRole('button', { name: 'Избранное' }).click();
  await expect(toast).toContainText('Нет связи с сервером');
  await page.unroute('**/api/v1/pages/*/favorite');
});

test('R-UI-009: no uncaught script errors occurred in any scenario above', async () => {
  expect(errors).toEqual([]);
});
