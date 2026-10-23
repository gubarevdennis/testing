import { test, expect, type Page } from '@playwright/test';
import { ensureOwner, editor, expectSaved, apiContent, caretIn } from './helpers';
import { newPage, cleanupCreatedPages, settle } from './editor-p0-helpers';

test.describe.configure({ mode: 'serial' });
cleanupCreatedPages();

const selectionText = (page: Page) => page.evaluate(() => window.getSelection()?.toString() ?? '');

async function slash(page: Page, query: string, title: string) {
  await page.keyboard.type('/' + query);
  const menu = page.getByRole('listbox');
  await expect(menu.getByRole('option', { name: new RegExp('^' + title) }).first()).toBeVisible();
  await menu.getByRole('option', { name: new RegExp('^' + title) }).first().click();
}

async function lines(page: Page, n: number, prefix = 'Строка') {
  for (let i = 1; i <= n; i++) {
    await page.keyboard.type(`${prefix} ${i}`);
    if (i < n) await page.keyboard.press('Enter');
  }
}

const topTexts = (page: Page) => editor(page).evaluate((el) => [...el.children].map((c) => (c as HTMLElement).innerText.trim()));

test('text blocks: paragraph, H1–H6, lead, quote and divider are created from the "/" menu; body text is hyphenated (R-EDITOR-007)', async ({ page }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Текстовые блоки');
  for (let level = 1; level <= 6; level++) {
    await slash(page, `h${level}`, `Заголовок ${level}`);
    await page.keyboard.type(`Уровень ${level}`);
    await page.keyboard.press('Enter');
  }
  await slash(page, 'вводный', 'Вводный абзац');
  await page.keyboard.type('Вводный текст статьи');
  await page.keyboard.press('Enter');
  await slash(page, 'цитата', 'Цитата');
  await page.keyboard.type('Цитата руководителя');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await slash(page, 'разделитель', 'Разделитель');
  await page.keyboard.type('Обычный абзац с длинными словами: делопроизводство, высокопроизводительный, автоматизированный.');
  const ed = editor(page);
  for (let level = 1; level <= 6; level++) await expect(ed.locator(`h${level}`, { hasText: `Уровень ${level}` })).toHaveCount(1);
  await expect(ed.locator('p.kb-lead', { hasText: 'Вводный текст статьи' })).toHaveCount(1);
  await expect(ed.locator('blockquote', { hasText: 'Цитата руководителя' })).toHaveCount(1);
  await expect(ed.locator('hr')).toHaveCount(1);
  expect(await ed.locator('p', { hasText: 'делопроизводство' }).evaluate((el) => getComputedStyle(el).hyphens)).toBe('auto');
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('ru');
  await expectSaved(page);
  const c = (await apiContent(page.request, id)).content;
  const levels = (c.content as any[]).filter((n) => n.type === 'heading').map((n) => n.attrs.level);
  expect(levels).toEqual([1, 2, 3, 4, 5, 6]);
  expect(JSON.stringify(c)).toContain('"variant":"lead"');
  expect((c.content as any[]).some((n) => n.type === 'horizontalRule')).toBe(true);
  expect((c.content as any[]).some((n) => n.type === 'blockquote')).toBe(true);
});

test('selection modes: word, paragraph, Shift+arrows, across blocks, Ctrl+A block → article, Esc → block, several blocks (R-EDITOR-068, E201)', async ({ page }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Режимы выделения');
  await page.keyboard.type('Альфа Бета Гамма');
  await page.keyboard.press('Enter');
  await lines(page, 4);
  const ed = editor(page);
  // double click → word, triple click → paragraph
  const p0 = ed.locator('p', { hasText: 'Альфа Бета Гамма' });
  const box = (await p0.boundingBox())!;
  const bx = await p0.evaluate((el) => {
    const r = document.createRange();
    const t = el.firstChild!;
    r.setStart(t, 7);
    r.setEnd(t, 9);
    const b = r.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  });
  await page.mouse.dblclick(bx.x, bx.y);
  expect(await selectionText(page)).toBe('Бета');
  await page.mouse.click(bx.x, bx.y, { clickCount: 3 });
  expect((await selectionText(page)).trim()).toBe('Альфа Бета Гамма');
  expect(box.width).toBeGreaterThan(0);
  // Shift+arrows within a line
  await caretIn(page, 'Альфа Бета Гамма');
  await page.keyboard.press('Home');
  for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowRight');
  expect(await selectionText(page)).toBe('Альфа');
  await page.keyboard.press('Shift+End');
  expect(await selectionText(page)).toBe('Альфа Бета Гамма');
  // across blocks: from the middle of "Строка 1" to the middle of "Строка 3"
  await caretIn(page, 'Строка 1');
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Shift+ArrowDown');
  const across = await selectionText(page);
  expect(across).toContain('Строка 2');
  expect(across.startsWith('1')).toBe(true);
  // Ctrl+A: first the current block, then the whole article
  await caretIn(page, 'Строка 2');
  await settle(page);
  await page.keyboard.press('Control+a');
  expect(await selectionText(page)).toBe('Строка 2');
  await page.keyboard.press('Control+a');
  const all = await selectionText(page);
  expect(all).toContain('Альфа Бета Гамма');
  expect(all).toContain('Строка 4');
  // Esc: text → block; Shift+↓ extends by whole blocks
  await caretIn(page, 'Строка 2');
  await settle(page);
  await page.keyboard.press('Escape');
  await expect(ed.locator('.ProseMirror-selectednode')).toHaveCount(1);
  await page.keyboard.press('Shift+ArrowDown');
  await expect(ed.locator('.kb-block-in-range')).toHaveCount(2);
  await page.keyboard.press('Shift+ArrowUp');
  await expect(ed.locator('.kb-block-in-range')).toHaveCount(3);
  const sel = await selectionText(page);
  expect(sel).toContain('Строка 1');
  expect(sel).toContain('Строка 3');
  // the selected blocks are deleted as whole blocks
  await page.keyboard.press('Backspace');
  await expect(ed.locator('.kb-block-in-range')).toHaveCount(0);
  expect(await topTexts(page)).toEqual(['Альфа Бета Гамма', 'Строка 4']);
  await expectSaved(page);
  const c = JSON.stringify((await apiContent(page.request, id)).content);
  expect(c).not.toContain('Строка 2');
  // one undo brings them back
  await page.keyboard.press('Control+z');
  await expect(ed.locator('p', { hasText: 'Строка 2' })).toHaveCount(1);
  expect(await topTexts(page)).toEqual(['Альфа Бета Гамма', 'Строка 1', 'Строка 2', 'Строка 3', 'Строка 4']);
});

test('formatting keeps the selection: bold, italic and toolbar underline apply to the same range (E202)', async ({ page }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Форматирование');
  await page.keyboard.type('Обычный важный фрагмент текста');
  await page.keyboard.press('End');
  for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowLeft'); // before " текста"
  for (let i = 0; i < 15; i++) await page.keyboard.press('Shift+ArrowLeft');
  expect(await selectionText(page)).toBe('важный фрагмент');
  await settle(page);
  await page.keyboard.press('Control+b');
  expect(await selectionText(page)).toBe('важный фрагмент');
  await page.keyboard.press('Control+i');
  expect(await selectionText(page)).toBe('важный фрагмент');
  await page.getByRole('toolbar', { name: 'Форматирование' }).getByRole('button', { name: 'Подчёркнутый' }).click();
  expect(await selectionText(page)).toBe('важный фрагмент');
  const ed = editor(page);
  for (const tag of ['strong', 'em', 'u']) await expect(ed.locator(tag, { hasText: 'важный фрагмент' })).toHaveCount(1);
  await expectSaved(page);
  const c = JSON.stringify((await apiContent(page.request, id)).content);
  expect(c).toMatch(/"text":"важный фрагмент","marks":\[[^\]]*"bold"[^\]]*\]/);
  expect(c).toMatch(/"text":"важный фрагмент","marks":\[[^\]]*"italic"[^\]]*\]/);
  expect(c).toMatch(/"text":"важный фрагмент","marks":\[[^\]]*"underline"[^\]]*\]/);
  // typing over the still-selected range replaces exactly it
  await page.keyboard.type('ключевой');
  await expect(ed.locator('p').first()).toHaveText('Обычный ключевой текста');
});

test('moving blocks: one block by keyboard and block menu, several selected blocks together — order and ids kept (E213, UX21-186, R-EDITOR-049)', async ({ page }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Перенос блоков');
  await lines(page, 5, 'Блок');
  await expectSaved(page);
  const idsOf = async () => Object.fromEntries(((await apiContent(page.request, id)).content.content as any[]).map((n) => [n.content?.[0]?.text, n.attrs.id]));
  const before = await idsOf();
  // keyboard: Alt+Shift+↑ moves the current block up
  await caretIn(page, 'Блок 3');
  await settle(page);
  await page.keyboard.press('Alt+Shift+ArrowUp');
  expect(await topTexts(page)).toEqual(['Блок 1', 'Блок 3', 'Блок 2', 'Блок 4', 'Блок 5']);
  // the caret stays in the moved block
  await page.keyboard.type('!');
  await expect(editor(page).locator('p').nth(1)).toHaveText(/Блок 3!?|!?Блок 3/);
  await page.keyboard.press('Backspace');
  // block menu: "Переместить вниз"
  await editor(page).locator('p', { hasText: 'Блок 1' }).hover();
  await page.getByRole('button', { name: 'Действия с блоком' }).click();
  await page.getByRole('menuitem', { name: 'Переместить вниз' }).click();
  expect(await topTexts(page)).toEqual(['Блок 3', 'Блок 1', 'Блок 2', 'Блок 4', 'Блок 5']);
  // several blocks: Esc, Shift+↓, then Alt+Shift+↓ moves "Блок 1" and "Блок 2" below "Блок 4" together
  await caretIn(page, 'Блок 1');
  await settle(page);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Shift+ArrowDown');
  await expect(editor(page).locator('.kb-block-in-range')).toHaveCount(2);
  await page.keyboard.press('Alt+Shift+ArrowDown');
  expect(await topTexts(page)).toEqual(['Блок 3', 'Блок 4', 'Блок 1', 'Блок 2', 'Блок 5']);
  await expect(editor(page).locator('.kb-block-in-range')).toHaveCount(2);
  await page.keyboard.press('Alt+Shift+ArrowDown');
  expect(await topTexts(page)).toEqual(['Блок 3', 'Блок 4', 'Блок 5', 'Блок 1', 'Блок 2']);
  await expectSaved(page);
  const after = await idsOf();
  // nothing lost or duplicated, and every block kept its id (links and comments keep working)
  expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
  for (const k of Object.keys(before)) expect(after[k]).toBe(before[k]);
});
