import { test, expect, type Page } from '@playwright/test';
import { ensureOwner, newPage, editor, expectSaved, apiContent, paste, createUser, login_ } from './helpers';

test.describe.configure({ mode: 'serial' });

const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Таблица' });
const grid = (page: Page) =>
  editor(page)
    .locator('table')
    .first()
    .evaluate((t) => {
      const c = t.cloneNode(true) as HTMLElement;
      c.querySelectorAll('.collab-caret').forEach((x) => x.remove()); // colleagues' caret labels
      return [...c.querySelectorAll('tr')].map((r) => [...r.children].map((x) => (x.tagName === 'TH' ? '#' : '') + (x as HTMLElement).textContent!.trim()));
    });
const cell = (page: Page, text: string) => editor(page).locator('td, th').filter({ hasText: new RegExp('^' + text + '$') }).first();

async function tableMenu(page: Page, item: string) {
  await toolbar(page).getByRole('button', { name: 'Таблица', exact: true }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

async function grantClipboard(page: Page) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(page.url()).origin });
}

/** Builds a table from a spreadsheet paste and returns to it. */
async function tableFromExcel(page: Page, title: string, tsv: string) {
  await ensureOwner(page);
  const id = await newPage(page, title);
  await paste(page, { 'text/plain': tsv });
  await expect(editor(page).locator('table')).toBeVisible();
  return id;
}

test('table structure: insert/delete rows and columns, header row/column, merge and split, alignment, column width (R-TABLE-003)', async ({ page }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Таблица: структура');
  await page.keyboard.type('/табл');
  await page.keyboard.press('Enter');
  await expect(editor(page).locator('table tr')).toHaveCount(3);
  const values = ['Товар', 'Склад', 'Остаток', 'Болт', 'А', '10', 'Гайка', 'Б', '20'];
  for (const [i, t] of values.entries()) {
    await page.keyboard.type(t);
    if (i < values.length - 1) await page.keyboard.press('Tab');
  }
  expect(await grid(page)).toEqual([['#Товар', '#Склад', '#Остаток'], ['Болт', 'А', '10'], ['Гайка', 'Б', '20']]);
  // rows and columns
  await cell(page, 'Болт').click();
  await toolbar(page).getByRole('button', { name: 'Строка ниже' }).click();
  await toolbar(page).getByRole('button', { name: 'Строка выше' }).click();
  expect((await grid(page)).length).toBe(5);
  await toolbar(page).getByRole('button', { name: 'Столбец справа' }).click();
  await toolbar(page).getByRole('button', { name: 'Столбец слева' }).click();
  expect((await grid(page))[0].length).toBe(5);
  await editor(page).locator('th').filter({ hasText: /^$/ }).first().click(); // a new, empty column
  await tableMenu(page, 'Удалить столбец');
  expect((await grid(page))[0].length).toBe(4);
  await cell(page, 'Болт').click();
  await page.keyboard.press('ArrowUp');
  await tableMenu(page, 'Удалить строку');
  expect((await grid(page)).length).toBe(4);
  // header column on / off
  await cell(page, 'Болт').click();
  await tableMenu(page, 'Столбец заголовков');
  await expect(editor(page).locator('th', { hasText: 'Болт' })).toHaveCount(1);
  await tableMenu(page, 'Столбец заголовков');
  await expect(editor(page).locator('td', { hasText: 'Болт' })).toHaveCount(1);
  // a cell range by Shift+click → merge → split
  await cell(page, 'Болт').click();
  await cell(page, 'А').click({ modifiers: ['Shift'] });
  // (one of the added columns lies between them)
  await expect(editor(page).locator('.selectedCell')).toHaveCount(3);
  await toolbar(page).getByRole('button', { name: 'Объединить ячейки' }).click();
  await expect(editor(page).locator('td[colspan="3"]')).toHaveCount(1);
  await toolbar(page).getByRole('button', { name: 'Разделить ячейку' }).click();
  await expect(editor(page).locator('td[colspan="3"]')).toHaveCount(0);
  // alignment of the cell
  await cell(page, '20').click();
  await toolbar(page).getByRole('button', { name: 'Выравнивание' }).click();
  await page.getByRole('menuitem', { name: 'По правому краю' }).click();
  await expect(cell(page, '20')).toHaveAttribute('data-align', 'right');
  // column width by dragging the column border
  const th = editor(page).locator('th').first();
  const box = (await th.boundingBox())!;
  await page.mouse.move(box.x + box.width - 1, box.y + box.height / 2);
  await expect(editor(page).locator('.column-resize-handle').first()).toBeAttached();
  await page.mouse.down();
  await page.mouse.move(box.x + box.width + 120, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expectSaved(page);
  const t = (await apiContent(page.request, id)).content.content.find((n: any) => n.type === 'table');
  expect(t.content[0].content[0].attrs.colwidth?.[0]).toBeGreaterThan(box.width + 60);
  expect(JSON.stringify(t)).toContain('"align":"right"');
});

test('table data: copy a cell range as TSV, paste a range from Excel, move rows and columns, sort by a column (R-TABLE-003)', async ({ page }) => {
  const id = await tableFromExcel(page, 'Таблица: данные', 'Имя\tОтдел\tСтаж\nБорис\tСклад\t12\nанна\tОфис\t3\nВера\tСклад\t\nЁлка\tЛогистика\t100');
  // pasted from Excel with a header row
  expect(await grid(page)).toEqual([
    ['#Имя', '#Отдел', '#Стаж'],
    ['Борис', 'Склад', '12'],
    ['анна', 'Офис', '3'],
    ['Вера', 'Склад', ''],
    ['Ёлка', 'Логистика', '100'],
  ]);
  // copy a range (2×2) → TSV for spreadsheets and an HTML table
  await grantClipboard(page);
  await cell(page, 'Борис').click();
  await cell(page, 'Офис').click({ modifiers: ['Shift'] });
  await expect(editor(page).locator('.selectedCell')).toHaveCount(4);
  await page.keyboard.press('Control+c');
  const clip = await page.evaluate(async () => {
    const out: Record<string, string> = {};
    for (const item of await navigator.clipboard.read()) for (const t of item.types) out[t] = await (await item.getType(t)).text();
    return out;
  });
  expect(clip['text/plain'].trim()).toBe('Борис\tСклад\nанна\tОфис');
  expect(clip['text/html']).toContain('<table');
  // sort by "Стаж": numbers numerically, empty last, header stays
  await cell(page, '12').click();
  await tableMenu(page, 'Сортировать по возрастанию');
  expect((await grid(page)).map((r) => r[2])).toEqual(['#Стаж', '3', '12', '100', '']);
  await tableMenu(page, 'Сортировать по убыванию');
  expect((await grid(page)).map((r) => r[2])).toEqual(['#Стаж', '100', '12', '3', '']);
  // sort by name in Russian alphabetical order (ё after е, case-insensitive)
  await cell(page, 'Вера').click();
  await tableMenu(page, 'Сортировать по возрастанию');
  expect((await grid(page)).map((r) => r[0])).toEqual(['#Имя', 'анна', 'Борис', 'Вера', 'Ёлка']);
  // move rows: keyboard and menu
  await cell(page, 'Вера').click();
  await page.keyboard.press('Alt+Shift+ArrowUp');
  expect((await grid(page)).map((r) => r[0])).toEqual(['#Имя', 'анна', 'Вера', 'Борис', 'Ёлка']);
  await tableMenu(page, 'Переместить строку вниз');
  expect((await grid(page)).map((r) => r[0])).toEqual(['#Имя', 'анна', 'Борис', 'Вера', 'Ёлка']);
  // move columns: keyboard and menu; the whole column moves with its header text
  await cell(page, 'Вера').click();
  await page.keyboard.press('Alt+Shift+ArrowRight');
  expect((await grid(page))[0]).toEqual(['#Отдел', '#Имя', '#Стаж']);
  expect((await grid(page))[3]).toEqual(['Склад', 'Вера', '']);
  await tableMenu(page, 'Переместить столбец влево');
  expect((await grid(page))[0]).toEqual(['#Имя', '#Отдел', '#Стаж']);
  // one undo reverts exactly one operation (the menu gives the focus back to the table)
  await expect(editor(page)).toBeFocused();
  await page.keyboard.press('Control+z');
  expect((await grid(page))[0]).toEqual(['#Отдел', '#Имя', '#Стаж']);
  await page.keyboard.press('Control+Shift+z');
  expect((await grid(page))[0]).toEqual(['#Имя', '#Отдел', '#Стаж']);
  await expectSaved(page);
  const t = (await apiContent(page.request, id)).content.content.find((n: any) => n.type === 'table');
  const names = t.content.map((r: any) => r.content[0].content[0].content?.[0]?.text);
  expect(names).toEqual(['Имя', 'анна', 'Борис', 'Вера', 'Ёлка']);
});

test('concurrent table operations of two people (row added offline vs column added offline) converge to the same rectangular table (OPS-007)', async ({ page, browser }) => {
  const id = await tableFromExcel(page, 'Таблица: конкурентно', 'Код\tНазвание\nA1\tБолт\nA2\tГайка');
  await expectSaved(page);
  const u = await createUser(page.request, 'Олег Соавтор', { pageGrants: [{ pageId: id, level: 'edit' }] });
  const ctx2 = await browser.newContext();
  const p2 = await ctx2.newPage();
  await p2.goto('/p/' + id);
  await login_(p2, u.email, u.password);
  await expect(editor(p2).locator('table')).toBeVisible();
  // both lose the network and change the table structure at the same time
  await page.context().setOffline(true);
  await ctx2.setOffline(true);
  await cell(page, 'Болт').click();
  await toolbar(page).getByRole('button', { name: 'Строка ниже' }).click();
  await editor(page).locator('table tr').nth(2).locator('td').first().click(); // the new row
  await page.keyboard.type('A3');
  await cell(p2, 'Название').click();
  await toolbar(p2).getByRole('button', { name: 'Столбец справа' }).click();
  await p2.keyboard.press('Tab');
  await p2.keyboard.type('Цена');
  await page.context().setOffline(false);
  await ctx2.setOffline(false);
  await expectSaved(page);
  await expectSaved(p2);
  // both sides show the same table, every row has the same number of cells, nothing duplicated or lost
  await expect.poll(async () => JSON.stringify(await grid(p2)), { timeout: 20_000 }).toBe(JSON.stringify(await grid(page)));
  await page.waitForTimeout(1500); // let any normalisation round-trips settle
  await expectSaved(page);
  await expectSaved(p2);
  const a = await grid(page);
  const b = await grid(p2);
  expect(b).toEqual(a);
  const widths = new Set(a.map((r) => r.length));
  expect(widths.size).toBe(1);
  expect([...widths][0]).toBe(3);
  expect(a.length).toBe(4);
  const flat = a.flat().join('|');
  expect(flat.match(/A3/g)).toHaveLength(1);
  expect(flat.match(/Цена/g)).toHaveLength(1);
  const t = (await apiContent(page.request, id)).content.content.find((n: any) => n.type === 'table');
  expect(t.content.map((r: any) => r.content.length)).toEqual([3, 3, 3, 3]);
  await ctx2.close();
});
