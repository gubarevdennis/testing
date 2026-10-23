import { test, expect, type Page } from '@playwright/test';
import { ensureOwner, editor, expectSaved, apiContent, createUser, login_, caretToEnd } from './helpers';
import { newPage, cleanupCreatedPages, settle } from './editor-p0-helpers';

/**
 * The floating formatting toolbar (apps/web/src/editor/menus/BubbleToolbar.tsx): «Тип блока», «Цвет», «Ещё» (alignment,
 * size, font, indices, footnote, formula) and the link field — every item the action matrix listed as uncovered
 * (QA26-01, QA26-03, QA26-06, R-QA-004). Each outcome is checked in the content the server stores, with Undo/Redo,
 * reload and the toolbar of a reader.
 */
cleanupCreatedPages();

type Node = { type: string; attrs?: Record<string, any>; content?: Node[]; text?: string; marks?: Array<{ type: string; attrs?: Record<string, any> }> };
const blocks = async (page: Page, id: string) => (await apiContent(page.request, id)).content.content as Node[];
const first = async (page: Page, id: string) => (await blocks(page, id))[0];
const textOf = (b: Node): string => (b.text ?? '') + (b.content ?? []).map(textOf).join('');
const marksOf = (b: Node) => (b.content ?? []).flatMap((t) => (t.marks ?? []).map((m) => ({ type: m.type, ...(m.attrs ?? {}) })));
const UNDO = 'Control+z';
const REDO = 'Control+Shift+z';

const bar = (page: Page) => page.getByRole('toolbar', { name: 'Форматирование' });

/** Selects the whole text of the first block (the toolbar appears). */
async function selectFirst(page: Page) {
  await caretToEnd(page, editor(page).locator('p, h1, h2, h3, li, blockquote p, .kb-callout p').first());
  await page.keyboard.press('Shift+Home');
  await settle(page);
  await expect(bar(page)).toBeVisible();
}

async function more(page: Page, item: string, sub?: string) {
  await bar(page).getByRole('button', { name: 'Ещё' }).click();
  const it = page.getByRole('menuitemcheckbox', { name: item, exact: true }).or(page.getByRole('menuitem', { name: item, exact: true }));
  if (!sub) return it.click();
  await it.click();
  await page.getByRole('menuitem', { name: sub, exact: true }).or(page.getByRole('menuitemcheckbox', { name: sub, exact: true })).click();
}

/** «Тип блока» → item; a list/quote/callout is applied to plain text, so the block is turned back into «Текст» first */
async function turn(page: Page, id: string, label: string, pred: (b: Node) => boolean, css: string, fromText = false) {
  if (fromText) {
    await selectFirst(page);
    await bar(page).getByRole('button', { name: 'Тип блока' }).click();
    await page.getByRole('menuitem', { name: 'Текст' }).click();
    await expectSaved(page);
    await expect.poll(async () => (await first(page, id)).type).toBe('paragraph');
  }
  await selectFirst(page);
  await bar(page).getByRole('button', { name: 'Тип блока' }).click();
  await page.getByRole('menuitem', { name: label }).click();
  await expectSaved(page);
  await expect.poll(async () => pred(await first(page, id)), { message: label }).toBe(true);
  await expect(editor(page).locator(css).first()).toContainText('Строка для преобразования');
  expect(textOf(await first(page, id))).toBe('Строка для преобразования');
}

// items carry a sample swatch («A») and a ✓ for the current value in their accessible name
async function pick(page: Page, item: string) {
  await selectFirst(page);
  await bar(page).getByRole('button', { name: 'Цвет', exact: true }).click();
  await page.getByRole('menuitemcheckbox', { name: new RegExp(item + '( ✓)?$') }).click();
  await expectSaved(page);
}

async function alignTo(page: Page, id: string, item: string, value: string) {
  await selectFirst(page);
  await more(page, item);
  await expectSaved(page);
  await expect.poll(async () => (await first(page, id)).attrs?.textAlign ?? null, { message: item }).toBe(value);
  await expect(editor(page).locator('p').first()).toHaveCSS('text-align', value === 'left' ? /left|start/ : value);
}

test('R-EDITOR-005, QA26-07 «Тип блока»: Текст, Заголовок 1–3, Маркированный/Нумерованный список, Чек-лист, Цитата, Выделенный блок — stored, Esc closes the menu without change, Undo/Redo, after reload', async ({ page }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Тип блока из панели');
  await page.keyboard.type('Строка для преобразования');
  await expectSaved(page);
  const typeMenu = () => bar(page).getByRole('button', { name: 'Тип блока' });
  // cancel: Esc closes the menu, the block stays a paragraph
  await selectFirst(page);
  await typeMenu().click();
  await expect(page.getByRole('menuitem', { name: 'Заголовок 1' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menuitem', { name: 'Заголовок 1' })).toHaveCount(0);
  expect((await first(page, id)).type).toBe('paragraph');
  await turn(page, id, 'Заголовок 1', (b) => b.type === 'heading' && b.attrs?.level === 1, 'h1');
  await turn(page, id, 'Заголовок 2', (b) => b.type === 'heading' && b.attrs?.level === 2, 'h2');
  await turn(page, id, 'Заголовок 3', (b) => b.type === 'heading' && b.attrs?.level === 3, 'h3');
  await turn(page, id, 'Текст', (b) => b.type === 'paragraph', 'p');
  await turn(page, id, 'Маркированный список', (b) => b.type === 'bulletList', 'ul li', true);
  await turn(page, id, 'Нумерованный список', (b) => b.type === 'orderedList', 'ol li', true);
  await turn(page, id, 'Чек-лист', (b) => b.type === 'taskList', 'ul[data-type="taskList"] li', true);
  await turn(page, id, 'Цитата', (b) => b.type === 'blockquote', 'blockquote', true);
  await turn(page, id, 'Выделенный блок', (b) => b.type === 'callout', '.kb-callout, [data-type="callout"]', true);
  // Undo returns the quote, Redo the callout
  await page.keyboard.press(UNDO);
  await expectSaved(page);
  await expect.poll(async () => (await first(page, id)).type).not.toBe('callout');
  await page.keyboard.press(REDO);
  await expectSaved(page);
  await expect.poll(async () => (await first(page, id)).type).toBe('callout');
  await page.reload();
  await expect(editor(page).locator('.kb-callout, [data-type="callout"]').first()).toContainText('Строка для преобразования');
});

test('R-EDITOR-010 «Цвет»: a text colour and a background, «По умолчанию» and «Без фона» remove them — stored, Undo/Redo, after reload; a reader has no toolbar', async ({ page, browser }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Цвет из панели');
  await page.keyboard.type('Цветная строка');
  await expectSaved(page);
  const colorMenu = () => bar(page).getByRole('button', { name: 'Цвет', exact: true });
  // the trigger shows the tooltip «Цвет текста и фона»
  await selectFirst(page);
  await colorMenu().hover();
  await expect(page.getByRole('tooltip').or(page.locator('.tooltip')).filter({ hasText: 'Цвет текста и фона' })).toBeVisible();
  await pick(page, 'Красный');
  await pick(page, 'Жёлтый фон');
  await expect.poll(async () => marksOf(await first(page, id)).map((m) => m.type).sort()).toEqual(['highlight', 'textStyle']);
  expect(JSON.stringify(marksOf(await first(page, id)))).toContain('#b4372b');
  await expect(editor(page).locator('mark')).toHaveText('Цветная строка');
  // «По умолчанию» removes the text colour, the background stays
  await pick(page, 'По умолчанию');
  await expect.poll(async () => JSON.stringify(marksOf(await first(page, id)))).not.toContain('#b4372b');
  expect(marksOf(await first(page, id)).map((m) => m.type)).toContain('highlight');
  // «Без фона» removes the background
  await pick(page, 'Без фона');
  await expect.poll(async () => marksOf(await first(page, id)).filter((m) => m.type === 'highlight')).toEqual([]);
  await expect(editor(page).locator('mark')).toHaveCount(0);
  // Undo brings the background back, Redo removes it again
  await page.keyboard.press(UNDO);
  await expectSaved(page);
  await expect.poll(async () => marksOf(await first(page, id)).some((m) => m.type === 'highlight')).toBe(true);
  await page.keyboard.press(REDO);
  await expectSaved(page);
  await expect.poll(async () => marksOf(await first(page, id)).some((m) => m.type === 'highlight')).toBe(false);
  await page.reload();
  await expect(editor(page).locator('p').first()).toHaveText('Цветная строка');
  await expect(editor(page).locator('mark')).toHaveCount(0);
  // no permission: a reader selecting text gets no colour menu
  const reader = await createUser(page.request, 'Читатель цвета', { pageGrants: [{ pageId: id, level: 'view' }] });
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await p2.goto('/p/' + id);
  await login_(p2, reader.email, reader.password);
  await editor(p2).locator('p').first().click({ clickCount: 3 });
  await settle(p2);
  await expect(p2.getByRole('button', { name: 'Цвет', exact: true })).toHaveCount(0);
  await ctx.close();
});

test('R-EDITOR-010 «Ещё»: «По левому краю», «По центру», «По ширине», «Размер шрифта» → 24 px → «По умолчанию», «Шрифт» → «С засечками» / «Моноширинный» / «Основной» — stored, Undo/Redo, after reload', async ({ page }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Выравнивание и шрифт');
  await page.keyboard.type('Абзац для оформления');
  await expectSaved(page);
  const align = async () => (await first(page, id)).attrs?.textAlign ?? null;
  await alignTo(page, id, 'По центру', 'center');
  await alignTo(page, id, 'По ширине', 'justify');
  await alignTo(page, id, 'По левому краю', 'left');
  await page.keyboard.press(UNDO);
  await expectSaved(page);
  await expect.poll(align).toBe('justify');
  await page.keyboard.press(REDO);
  await expectSaved(page);
  await expect.poll(align).toBe('left');
  const style = async () => marksOf(await first(page, id)).find((m) => m.type === 'textStyle') ?? null;
  // size
  await selectFirst(page);
  await more(page, 'Размер шрифта', '24 px');
  await expectSaved(page);
  await expect.poll(async () => (await style())?.fontSize).toBe('24px');
  await expect(editor(page).locator('p span[style*="font-size"]').first()).toHaveCSS('font-size', '24px');
  // the submenu marks the current size
  await selectFirst(page);
  await bar(page).getByRole('button', { name: 'Ещё' }).click();
  await page.getByRole('menuitem', { name: 'Размер шрифта' }).click();
  await expect(page.getByRole('menuitemcheckbox', { name: '24 px' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('menuitem', { name: 'По умолчанию', exact: true }).click();
  await expectSaved(page);
  await expect.poll(async () => (await style())?.fontSize ?? null).toBeNull();
  // font
  await selectFirst(page);
  await more(page, 'Шрифт', 'С засечками');
  await expectSaved(page);
  await expect.poll(async () => (await style())?.fontFamily ?? '').toContain('PT Serif');
  await selectFirst(page);
  await more(page, 'Шрифт', 'Моноширинный');
  await expectSaved(page);
  await expect.poll(async () => (await style())?.fontFamily ?? '').toContain('JetBrains Mono');
  await expect(editor(page).locator('p span[style*="font-family"]').first()).toHaveCSS('font-family', /JetBrains Mono/);
  await page.keyboard.press(UNDO);
  await expectSaved(page);
  await expect.poll(async () => (await style())?.fontFamily ?? '').toContain('PT Serif');
  await page.keyboard.press(REDO);
  await expectSaved(page);
  await expect.poll(async () => (await style())?.fontFamily ?? '').toContain('JetBrains Mono');
  await page.reload();
  await expect(editor(page).locator('p span[style*="font-family"]').first()).toHaveCSS('font-family', /JetBrains Mono/);
  await selectFirst(page);
  await more(page, 'Шрифт', 'Основной');
  await expectSaved(page);
  await expect.poll(async () => (await style())?.fontFamily ?? null).toBeNull();
  await expect(editor(page).locator('p').first()).toHaveCSS('text-align', /left|start/);
});

test('R-EDITOR-010, R-EDITOR-038 «Ещё»: «Нижний индекс», «Верхний индекс», «Сноска (Ctrl+Alt+F)», «Формула из выделения» — stored, Undo/Redo, after reload', async ({ page }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Индексы, сноска, формула');
  await page.keyboard.type('H2O');
  await expectSaved(page);
  // subscript of the last character
  await caretToEnd(page, editor(page).locator('p').first());
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Shift+ArrowLeft');
  await settle(page);
  await more(page, 'Нижний индекс');
  await expectSaved(page);
  await expect.poll(async () => marksOf(await first(page, id)).map((m) => m.type)).toEqual(['subscript']);
  await expect(editor(page).locator('sub')).toHaveText('2O');
  // superscript replaces it (the two exclude each other)
  await page.keyboard.press('Shift+ArrowLeft');
  await settle(page);
  await caretToEnd(page, editor(page).locator('p').first());
  await page.keyboard.press('Shift+ArrowLeft');
  await settle(page);
  await more(page, 'Верхний индекс');
  await expectSaved(page);
  await expect.poll(async () => marksOf(await first(page, id)).map((m) => m.type).sort()).toEqual(['subscript', 'superscript']);
  await expect(editor(page).locator('sup')).toHaveText('O');
  await page.keyboard.press(UNDO);
  await expectSaved(page);
  await expect.poll(async () => marksOf(await first(page, id)).map((m) => m.type)).toEqual(['subscript']);
  await page.keyboard.press(REDO);
  await expectSaved(page);
  await expect.poll(async () => marksOf(await first(page, id)).map((m) => m.type).sort()).toEqual(['subscript', 'superscript']);
  // a formula from the selected text
  await caretToEnd(page, editor(page).locator('p').first());
  await page.keyboard.press('Enter');
  await page.keyboard.type('Итог: a^2+b^2');
  for (let i = 0; i < 'a^2+b^2'.length; i++) await page.keyboard.press('Shift+ArrowLeft');
  await settle(page);
  await more(page, 'Формула из выделения');
  await expectSaved(page);
  await expect.poll(async () => JSON.stringify((await blocks(page, id))[1])).toContain('"type":"inlineMath"');
  expect(JSON.stringify((await blocks(page, id))[1])).toContain('a^2+b^2');
  await expect(editor(page).locator('.katex').first()).toBeVisible();
  await page.keyboard.press(UNDO);
  await expectSaved(page);
  await expect.poll(async () => textOf((await blocks(page, id))[1])).toBe('Итог: a^2+b^2');
  await page.keyboard.press(REDO);
  await expectSaved(page);
  await expect.poll(async () => JSON.stringify((await blocks(page, id))[1])).toContain('"type":"inlineMath"');
  // a footnote after a selected word
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Источник данных');
  await page.keyboard.press('Shift+Home');
  await settle(page);
  await more(page, 'Сноска (Ctrl+Alt+F)');
  const pop = page.locator('.kb-footnote-popover');
  await expect(pop.getByRole('textbox')).toBeFocused();
  await page.keyboard.type('Росстат, 2025');
  await page.keyboard.press('Escape');
  await expectSaved(page);
  await expect.poll(async () => JSON.stringify(await blocks(page, id))).toContain('Росстат, 2025');
  await expect(page.getByTestId('footnotes-list')).toContainText('Росстат, 2025');
  await page.reload();
  await expect(editor(page).locator('sup').first()).toBeVisible();
  await expect(editor(page).locator('.katex').first()).toBeVisible();
  await expect(page.getByTestId('footnotes-list')).toContainText('Росстат, 2025');
});

test('R-EDITOR-011 link field «Адрес ссылки»: empty input removes nothing, an unsafe address is refused, Esc cancels, Enter applies — stored, Undo/Redo, after reload', async ({ page }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Ссылка из панели');
  await page.keyboard.type('Регламент закупок');
  await expectSaved(page);
  const href = async () => marksOf(await first(page, id)).find((m) => m.type === 'link')?.href ?? null;
  const field = page.getByRole('textbox', { name: 'Адрес ссылки' });
  // cancel
  await selectFirst(page);
  await bar(page).getByRole('button', { name: 'Ссылка' }).click();
  await expect(field).toBeFocused();
  await field.fill('example.org/cancelled');
  await field.press('Escape');
  await expect(field).toHaveCount(0);
  // empty: Enter with nothing typed does not create a link
  await selectFirst(page);
  await bar(page).getByRole('button', { name: 'Ссылка' }).click();
  await field.fill('');
  await field.press('Enter');
  await expectSaved(page);
  expect(await href()).toBeNull();
  // an unsafe address is marked invalid and not applied
  await selectFirst(page);
  await bar(page).getByRole('button', { name: 'Ссылка' }).click();
  await field.fill('javascript:alert(1)');
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await field.press('Enter');
  await expect(field).toBeVisible();
  expect(await href()).toBeNull();
  // success: a bare domain gets https://
  await field.fill('corp.example/zakupki');
  await expect(field).toHaveAttribute('aria-invalid', 'false');
  await field.press('Enter');
  await expectSaved(page);
  await expect.poll(href).toBe('https://corp.example/zakupki');
  await expect(editor(page).locator('a[href="https://corp.example/zakupki"]')).toHaveText('Регламент закупок');
  await page.keyboard.press(UNDO);
  await expectSaved(page);
  await expect.poll(href).toBeNull();
  await page.keyboard.press(REDO);
  await expectSaved(page);
  await expect.poll(href).toBe('https://corp.example/zakupki');
  await page.reload();
  await expect(editor(page).locator('a[href="https://corp.example/zakupki"]')).toHaveText('Регламент закупок');
});
