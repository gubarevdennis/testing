import { test, expect, type Page } from '@playwright/test';
import { ensureOwner, editor, expectSaved, apiContent, paste, createUser, login_ } from './helpers';
import { newPage, cleanupCreatedPages, settle } from './editor-p0-helpers';

/**
 * Table toolbar (apps/web/src/editor/menus/TableToolbar.tsx): cell fill («Цвет ячейки»), alignment in cells
 * («Выравнивание»), «Строка заголовков», «Копировать как Markdown» and the row/column buttons — the actions the matrix
 * listed as uncovered (QA26-01, QA26-03, QA26-06 «таблицы»). Outcomes are checked in the content the server stores, with
 * Undo/Redo, reload, a clipboard the browser refuses and the view of a reader.
 */
cleanupCreatedPages();

const UNDO = 'Control+z';
const REDO = 'Control+Shift+z';
const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Таблица' });
const cell = (page: Page, t: string) => editor(page).locator('td, th').filter({ hasText: new RegExp('^' + t + '$') }).first();
type Cell = { type: string; attrs: Record<string, any>; content: any[] };
const rows = async (page: Page, id: string) => {
  const t = ((await apiContent(page.request, id)).content.content as any[]).find((b) => b.type === 'table');
  return (t?.content ?? []).map((r: any) => r.content as Cell[]) as Cell[][];
};
const cellText = (c: Cell) => (c.content ?? []).map((p: any) => (p.content ?? []).map((t: any) => t.text).join('')).join('');
const attrOf = async (page: Page, id: string, text: string, attr: string) => {
  for (const r of await rows(page, id)) for (const c of r) if (cellText(c) === text) return c.attrs?.[attr] ?? null;
  return undefined;
};

async function makeTable(page: Page, title: string) {
  await ensureOwner(page);
  const id = await newPage(page, title);
  await paste(page, { 'text/plain': 'Товар\tСклад\nБолт\tА\nГайка\tБ\n' });
  await expect(editor(page).locator('table')).toBeVisible();
  await expectSaved(page);
  return id;
}

/** Opens a toolbar menu by its name and picks an item. */
async function tableItem(page: Page, menu: string, item: string) {
  await expect(toolbar(page)).toBeVisible();
  await toolbar(page).getByRole('button', { name: menu, exact: true }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

test('R-TABLE-003 «Цвет ячейки»: a fill and «Без заливки», Esc closes the palette without change — stored, Undo/Redo, after reload; a reader has no table toolbar', async ({ page, browser }) => {
  const id = await makeTable(page, 'Таблица: заливка');
  await cell(page, 'Болт').click();
  // cancel: the palette closes, nothing changes
  await toolbar(page).getByRole('button', { name: 'Цвет ячейки', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Без заливки' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menuitem', { name: 'Без заливки' })).toHaveCount(0);
  expect(await attrOf(page, id, 'Болт', 'background')).toBeNull();
  // the trigger is announced by its tooltip «Заливка ячеек» as well
  await toolbar(page).getByRole('button', { name: 'Цвет ячейки', exact: true }).hover();
  await expect(page.getByRole('tooltip').filter({ hasText: 'Заливка ячеек' })).toBeVisible();
  await tableItem(page, 'Цвет ячейки', 'Жёлтый');
  await expectSaved(page);
  await expect.poll(() => attrOf(page, id, 'Болт', 'background')).toBe('#fff3b0');
  await expect(cell(page, 'Болт')).toHaveAttribute('data-background', '#fff3b0');
  await page.keyboard.press(UNDO);
  await expectSaved(page);
  await expect.poll(() => attrOf(page, id, 'Болт', 'background')).toBeNull();
  await page.keyboard.press(REDO);
  await expectSaved(page);
  await expect.poll(() => attrOf(page, id, 'Болт', 'background')).toBe('#fff3b0');
  await page.reload();
  await expect(cell(page, 'Болт')).toHaveAttribute('data-background', '#fff3b0');
  await cell(page, 'Болт').click();
  await tableItem(page, 'Цвет ячейки', 'Без заливки');
  await expectSaved(page);
  await expect.poll(() => attrOf(page, id, 'Болт', 'background')).toBeNull();
  await expect(cell(page, 'Болт')).not.toHaveAttribute('data-background', /./);
  // no permission: a reader clicking a cell gets no table toolbar
  const reader = await createUser(page.request, 'Читатель таблицы', { pageGrants: [{ pageId: id, level: 'view' }] });
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await p2.goto('/p/' + id);
  await login_(p2, reader.email, reader.password);
  await cell(p2, 'Гайка').click(); // «Болт» carries the owner's caret label
  await settle(p2);
  await expect(p2.getByRole('toolbar', { name: 'Таблица' })).toHaveCount(0);
  await ctx.close();
});

test('R-TABLE-003 «Выравнивание»: «По левому краю», «По центру», «По правому краю», «По верху», «По середине», «По низу» in a cell — stored, Undo/Redo, after reload', async ({ page }) => {
  const id = await makeTable(page, 'Таблица: выравнивание');
  const align = () => attrOf(page, id, 'Гайка', 'align');
  const valign = () => attrOf(page, id, 'Гайка', 'valign');
  await cell(page, 'Гайка').click();
  await tableItem(page, 'Выравнивание', 'По центру');
  await expectSaved(page);
  await expect.poll(align).toBe('center');
  await cell(page, 'Гайка').click();
  await tableItem(page, 'Выравнивание', 'По правому краю');
  await expectSaved(page);
  await expect.poll(align).toBe('right');
  await cell(page, 'Гайка').click();
  await tableItem(page, 'Выравнивание', 'По левому краю');
  await expectSaved(page);
  await expect.poll(align).toBe('left');
  await cell(page, 'Гайка').click();
  await tableItem(page, 'Выравнивание', 'По низу');
  await expectSaved(page);
  await expect.poll(valign).toBe('bottom');
  await expect(cell(page, 'Гайка')).toHaveCSS('vertical-align', 'bottom');
  await cell(page, 'Гайка').click();
  await tableItem(page, 'Выравнивание', 'По середине');
  await expectSaved(page);
  await expect.poll(valign).toBe('middle');
  await cell(page, 'Гайка').click();
  await tableItem(page, 'Выравнивание', 'По верху');
  await expectSaved(page);
  await expect.poll(valign).toBe('top');
  await expect(cell(page, 'Гайка')).toHaveCSS('vertical-align', 'top');
  // the trigger is announced by its tooltip «Выравнивание в ячейках»
  await toolbar(page).getByRole('button', { name: 'Выравнивание', exact: true }).hover();
  await expect(page.getByRole('tooltip').filter({ hasText: 'Выравнивание в ячейках' })).toBeVisible();
  await page.keyboard.press(UNDO);
  await expectSaved(page);
  await expect.poll(valign).toBe('middle');
  await page.keyboard.press(REDO);
  await expectSaved(page);
  await expect.poll(valign).toBe('top');
  await page.reload();
  await expect(cell(page, 'Гайка')).toHaveCSS('vertical-align', 'top');
  expect(await align()).toBe('left');
});

test('R-TABLE-003 «Строка заголовков» toggles the header row; row/column buttons «Строка выше», «Строка ниже», «Столбец слева», «Столбец справа» — stored, Undo/Redo, after reload', async ({ page }) => {
  const id = await makeTable(page, 'Таблица: заголовки');
  const types = async () => (await rows(page, id)).map((r) => r.map((c) => (c.type === 'tableHeader' ? '#' : '') + cellText(c)));
  const before = await types();
  const headerNow = before[0][0].startsWith('#');
  await cell(page, 'Болт').click();
  await tableItem(page, 'Таблица', 'Строка заголовков');
  await expectSaved(page);
  await expect.poll(async () => (await types())[0][0].startsWith('#')).toBe(!headerNow);
  await page.keyboard.press(UNDO);
  await expectSaved(page);
  await expect.poll(types).toEqual(before);
  await page.keyboard.press(REDO);
  await expectSaved(page);
  await expect.poll(async () => (await types())[0][0].startsWith('#')).toBe(!headerNow);
  await page.reload();
  await expect(editor(page).locator('table tr').first().locator(headerNow ? 'td' : 'th')).toHaveCount(2);
  // rows and columns
  await cell(page, 'Болт').click();
  await toolbar(page).getByRole('button', { name: 'Строка выше' }).click();
  await toolbar(page).getByRole('button', { name: 'Строка ниже' }).click();
  await toolbar(page).getByRole('button', { name: 'Столбец слева' }).click();
  await toolbar(page).getByRole('button', { name: 'Столбец справа' }).click();
  await expectSaved(page);
  await expect.poll(async () => (await rows(page, id)).map((r) => r.length)).toEqual([4, 4, 4, 4, 4]);
  await page.keyboard.press(UNDO);
  await expectSaved(page);
  await expect.poll(async () => (await rows(page, id))[0].length).toBe(3);
  // «Объединить ячейки» needs several cells: disabled with a single cell
  await cell(page, 'Болт').click();
  await expect(toolbar(page).getByRole('button', { name: 'Объединить ячейки' })).toBeDisabled();
});

test('R-CLIPBOARD-006 «Копировать как Markdown» of a table: the clipboard gets a Markdown table; when the browser refuses the clipboard the text is offered in «Текст для копирования» and «Готово» closes it', async ({ page }) => {
  const id = await makeTable(page, 'Таблица: Markdown');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(page.url()).origin });
  await cell(page, 'Болт').click();
  await expect(toolbar(page).getByRole('button', { name: 'Цвет ячейки' })).toBeVisible();
  await tableItem(page, 'Таблица', 'Копировать как Markdown');
  await expect(page.locator('.toasts')).toContainText('Скопировано в формате Markdown');
  const md = await page.evaluate(() => navigator.clipboard.readText());
  expect(md).toMatch(/\|\s*Товар\s*\|\s*Склад\s*\|/);
  expect(md).toMatch(/\|\s*-+\s*\|\s*-+\s*\|/);
  expect(md).toMatch(/\|\s*Гайка\s*\|\s*Б\s*\|/);
  // error: the browser refuses the clipboard — the text is shown for manual copying, nothing is lost
  await page.evaluate(() => {
    const deny = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));
    Object.defineProperty(navigator.clipboard, 'write', { value: deny, configurable: true });
    Object.defineProperty(navigator.clipboard, 'writeText', { value: deny, configurable: true });
  });
  await cell(page, 'Болт').click();
  await tableItem(page, 'Таблица', 'Копировать как Markdown');
  await expect(page.locator('.toasts')).toContainText('Браузер запретил доступ к буферу обмена');
  const dlg = page.getByRole('dialog', { name: 'Скопируйте вручную' });
  await expect(dlg).toBeVisible();
  const box = dlg.getByRole('textbox', { name: 'Текст для копирования' });
  await expect(box).toHaveValue(/\|\s*Болт\s*\|\s*А\s*\|/);
  await expect(box).toBeFocused();
  expect(await box.evaluate((el: HTMLTextAreaElement) => el.selectionEnd - el.selectionStart)).toBe((await box.inputValue()).length);
  await dlg.getByRole('button', { name: 'Готово' }).click();
  await expect(dlg).toHaveCount(0);
  // the table itself is unchanged
  expect((await rows(page, id)).map((r) => r.map(cellText))).toEqual([['Товар', 'Склад'], ['Болт', 'А'], ['Гайка', 'Б']]);
});
