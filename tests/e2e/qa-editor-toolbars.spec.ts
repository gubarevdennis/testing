import { test, expect, type Page } from '@playwright/test';
import { ensureOwner, editor, expectSaved, apiContent, paste, createUser, login_, caretToEnd } from './helpers';
import { newPage, cleanupCreatedPages, settle } from './editor-p0-helpers';

/**
 * Bubble/table/image toolbars and the «[[» page-link menu: critical actions docs/qa/ACTION_MATRIX.md listed as
 * uncovered (QA26-01, QA26-03, R-QA-004, R-EDITOR-*), each with Undo/Redo, reload and the no-permission state;
 * outcomes are checked in the server content.
 */
cleanupCreatedPages();

const toasts = (p: Page) => p.locator('.toasts');
const blocks = async (page: Page, id: string) => (await apiContent(page.request, id)).content.content as Array<Record<string, any>>;
const UNDO = 'Control+z';
const REDO = 'Control+Shift+z';

// 8x8 PNG
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP8z4AATAxkCAEAJ9cBD8JfOs4AAAAASUVORK5CYII=';
async function pasteImage(page: Page, name: string) {
  await page.evaluate(
    ({ b64, name }) => {
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bin], name, { type: 'image/png' }));
      const target = document.activeElement ?? document.querySelector('.kb-editor');
      target!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    },
    { b64: PNG_B64, name },
  );
}

async function bubbleMore(page: Page, item: string) {
  const bar = page.getByRole('toolbar', { name: 'Форматирование' });
  await expect(bar).toBeVisible();
  await bar.getByRole('button', { name: 'Ещё' }).click();
  await page.getByRole('menuitemcheckbox', { name: item }).or(page.getByRole('menuitem', { name: item })).click();
}

/** Empties the first paragraph and leaves the caret in it (no open suggestion menu). */
async function clearLine(page: Page) {
  await caretToEnd(page, editor(page).locator('p').first());
  await page.keyboard.press('Shift+Home');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Escape');
  await caretToEnd(page, editor(page).locator('p').first());
  await expect(editor(page).locator('p').first()).toHaveText('');
}

const tableBar = (page: Page) => page.getByRole('toolbar', { name: 'Таблица' });
async function tableMenu(page: Page, item: string) {
  await expect(tableBar(page)).toBeVisible();
  await tableBar(page).getByRole('button', { name: 'Таблица', exact: true }).click();
  await page.getByRole('menuitem', { name: item }).click();
}
const cell = (page: Page, t: string) => editor(page).locator('td, th').filter({ hasText: new RegExp('^' + t + '$') }).first();
function serverGrid(content: Array<Record<string, any>>) {
  const table = content.find((b) => b.type === 'table');
  if (!table) return null;
  return table.content.map((row: any) => row.content.map((c: any) => (c.content ?? []).map((p: any) => (p.content ?? []).map((t: any) => t.text).join('')).join('')));
}

test('R-EDITOR, QA26-07: bubble «Ещё» → «По правому краю» and «Очистить форматирование» — stored, undone and redone, kept after reload; a viewer gets no formatting toolbar', async ({ page, browser }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Панель форматирования');
  // empty document: nothing selected, no bubble toolbar
  await expect(page.getByRole('toolbar', { name: 'Форматирование' })).toHaveCount(0);
  await page.keyboard.type('Важный текст абзаца');
  await page.keyboard.press('Shift+Home');
  await page.keyboard.press('Control+b');
  await page.keyboard.press('Control+i');
  await expectSaved(page);
  await bubbleMore(page, 'По правому краю');
  await expectSaved(page);
  await expect.poll(async () => (await blocks(page, id))[0].attrs?.textAlign).toBe('right');
  await expect(editor(page).locator('p').first()).toHaveCSS('text-align', 'right');
  const marks = async () => ((await blocks(page, id))[0].content ?? []).flatMap((t: any) => (t.marks ?? []).map((m: any) => m.type)).sort();
  expect(await marks()).toEqual(['bold', 'italic']);
  await bubbleMore(page, 'Очистить форматирование');
  await expectSaved(page);
  await expect.poll(marks).toEqual([]);
  await expect(editor(page).locator('strong, em')).toHaveCount(0);
  // Undo / Redo of the clearing
  await page.keyboard.press(UNDO);
  await expectSaved(page);
  await expect.poll(marks).toEqual(['bold', 'italic']);
  await page.keyboard.press(REDO);
  await expectSaved(page);
  await expect.poll(marks).toEqual([]);
  // reload: alignment and the cleared formatting stay
  await page.reload();
  await expect(editor(page).locator('p').first()).toHaveText('Важный текст абзаца');
  await expect(editor(page).locator('p').first()).toHaveCSS('text-align', 'right');
  await expect(editor(page).locator('strong, em')).toHaveCount(0);
  // no permission: a viewer can select but gets no formatting toolbar
  const viewer = await createUser(page.request, 'Зоя Читатель', { pageGrants: [{ pageId: id, level: 'view' }] });
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await p2.goto('/p/' + id);
  await login_(p2, viewer.email, viewer.password);
  await expect(editor(p2)).toContainText('Важный текст абзаца');
  await editor(p2).locator('p').first().click({ clickCount: 3 });
  await settle(p2);
  await expect(p2.getByRole('toolbar', { name: 'Форматирование' })).toHaveCount(0);
  await ctx.close();
});

test('R-TABLE-003, QA26-07: table «Переместить строку вверх», «Переместить столбец вправо», «Удалить таблицу» — stored, at the edge nothing moves, Undo/Redo, after reload', async ({ page }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Таблица: перемещение и удаление');
  await paste(page, { 'text/plain': 'Товар\tСклад\nБолт\tА\nГайка\tБ\n' });
  await expect(editor(page).locator('table')).toBeVisible();
  await expectSaved(page);
  const grid = async () => serverGrid(await blocks(page, id));
  await expect.poll(grid).toEqual([['Товар', 'Склад'], ['Болт', 'А'], ['Гайка', 'Б']]);
  // move a row up
  await cell(page, 'Гайка').click();
  await tableMenu(page, 'Переместить строку вверх');
  await expectSaved(page);
  await expect.poll(grid).toEqual([['Товар', 'Склад'], ['Гайка', 'Б'], ['Болт', 'А']]);
  // at the top edge nothing moves
  await cell(page, 'Товар').click();
  await tableMenu(page, 'Переместить строку вверх');
  await page.waitForTimeout(300);
  await expect.poll(grid).toEqual([['Товар', 'Склад'], ['Гайка', 'Б'], ['Болт', 'А']]);
  // move a column right
  await cell(page, 'Товар').click();
  await tableMenu(page, 'Переместить столбец вправо');
  await expectSaved(page);
  await expect.poll(grid).toEqual([['Склад', 'Товар'], ['Б', 'Гайка'], ['А', 'Болт']]);
  // Undo / Redo the column move
  await page.keyboard.press(UNDO);
  await expectSaved(page);
  await expect.poll(grid).toEqual([['Товар', 'Склад'], ['Гайка', 'Б'], ['Болт', 'А']]);
  await page.keyboard.press(REDO);
  await expectSaved(page);
  await expect.poll(grid).toEqual([['Склад', 'Товар'], ['Б', 'Гайка'], ['А', 'Болт']]);
  // delete the table, Undo brings it back, Redo removes it again
  await cell(page, 'Болт').click();
  await tableMenu(page, 'Удалить таблицу');
  await expectSaved(page);
  await expect.poll(grid).toBeNull();
  await expect(editor(page).locator('table')).toHaveCount(0);
  await page.keyboard.press(UNDO);
  await expectSaved(page);
  await expect.poll(grid).toEqual([['Склад', 'Товар'], ['Б', 'Гайка'], ['А', 'Болт']]);
  await page.reload();
  await expect(editor(page).locator('table')).toBeVisible();
  await cell(page, 'Болт').click();
  await tableMenu(page, 'Удалить таблицу');
  await expectSaved(page);
  await expect.poll(grid).toBeNull();
  await page.reload();
  await expect(editor(page).locator('table')).toHaveCount(0);
});

test('R-MEDIA, QA26-07: image toolbar «По правому краю» and «Удалить» — stored, Undo returns the image, after reload', async ({ page }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Изображение: панель');
  await page.keyboard.type('Подпись выше');
  await page.keyboard.press('Enter');
  await pasteImage(page, 'Схема.png');
  const img = editor(page).locator('.kb-image-block img');
  await expect(img).toHaveAttribute('src', /\/api\/v1\/attachments\/[0-9a-f-]{36}\/content/, { timeout: 20_000 });
  await expectSaved(page);
  const image = async () => (await blocks(page, id)).find((b) => b.type === 'image')?.attrs ?? null;
  await img.click();
  const bar = page.getByRole('toolbar', { name: 'Изображение' });
  await expect(bar).toBeVisible();
  await bar.getByRole('button', { name: 'По правому краю' }).click();
  await expect(bar.getByRole('button', { name: 'По правому краю' })).toHaveAttribute('aria-pressed', 'true');
  await expectSaved(page);
  await expect.poll(async () => (await image())?.align).toBe('right');
  await expect(editor(page).locator('.kb-image-block')).toHaveClass(/align-right/);
  await page.reload();
  await expect(editor(page).locator('.kb-image-block')).toHaveClass(/align-right/);
  await editor(page).locator('.kb-image-block img').click();
  await page.getByRole('toolbar', { name: 'Изображение' }).getByRole('button', { name: 'Удалить' }).click();
  await expectSaved(page);
  await expect.poll(image).toBeNull();
  await expect(editor(page).locator('.kb-image-block')).toHaveCount(0);
  await page.keyboard.press(UNDO);
  await expectSaved(page);
  await expect.poll(async () => (await image())?.align).toBe('right');
  await expect(editor(page).locator('.kb-image-block')).toHaveCount(1);
  await page.keyboard.press(REDO);
  await expectSaved(page);
  await expect.poll(image).toBeNull();
  await page.reload();
  await expect(editor(page)).toContainText('Подпись выше');
  await expect(editor(page).locator('.kb-image-block')).toHaveCount(0);
});

test('R-EDITOR-031: «[[» → «Создать вложенную страницу «…»» — Esc cancels without creating; a server error and offline keep the typed text and create nothing; success links a new child page (server), survives reload', async ({ page, context }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Ссылки: новая подстраница');
  const children = async () => ((await (await page.request.get(`/api/v1/pages/${id}/children`)).json()).nodes ?? []).map((p: any) => p.title);
  const menu = page.getByRole('listbox', { name: 'Ссылка на страницу' });
  const createItem = (t: string) => menu.getByRole('option', { name: `Создать вложенную страницу «${t}»` });
  // cancel
  await page.keyboard.type('[[Отменённая подстраница');
  await expect(createItem('Отменённая подстраница')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(editor(page)).toContainText('[[Отменённая подстраница');
  await clearLine(page);
  // server error: nothing is created, the typed text stays for a retry
  await page.route('**/api/v1/pages', (r) => (r.request().method() === 'POST' ? r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'internal', message: 'Внутренняя ошибка сервера' } }) }) : r.fallback()));
  await page.keyboard.type('[[Подстраница с ошибкой');
  await createItem('Подстраница с ошибкой').click();
  await expect(toasts(page)).toContainText('Внутренняя ошибка сервера');
  await expect(editor(page)).toContainText('Подстраница с ошибкой');
  await page.unroute('**/api/v1/pages');
  await clearLine(page);
  // offline
  await page.keyboard.type('[[Подстраница без сети');
  await expect(createItem('Подстраница без сети')).toBeVisible();
  await context.setOffline(true);
  await createItem('Подстраница без сети').click();
  await expect(toasts(page).locator('.toast').last()).toBeVisible();
  await expect(editor(page)).toContainText('Подстраница без сети');
  await context.setOffline(false);
  await expectSaved(page);
  expect(await children()).toEqual([]);
  await clearLine(page);
  // success
  await page.keyboard.type('[[Протокол встречи');
  await createItem('Протокол встречи').click();
  const mention = editor(page).locator('.kb-page-mention').filter({ hasText: 'Протокол встречи' });
  await expect(mention.first()).toBeVisible();
  await expectSaved(page);
  await expect.poll(children).toEqual(['Протокол встречи']);
  const stored = JSON.stringify(await blocks(page, id));
  expect(stored).toContain('"type":"pageMention"');
  expect(stored).not.toContain('[[');
  await page.reload();
  await expect(editor(page)).toContainText('Протокол встречи');
});
