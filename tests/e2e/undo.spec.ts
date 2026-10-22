import { test, expect, type Page } from '@playwright/test';
import { ensureOwner, newPage, editor, expectSaved, apiContent, paste, createUser, login_ } from './helpers';

test.describe.configure({ mode: 'serial' });

const UNDO = 'Control+z';
const REDO = 'Control+Shift+z';
/** The collaborative undo manager groups changes made within 500 ms; pause to make a step its own undo step. */
const STEP_PAUSE = 650;

const blockTexts = (page: Page) => editor(page).locator(':scope > *').allInnerTexts();

async function fresh(page: Page, title: string) {
  await ensureOwner(page);
  const id = await newPage(page, title);
  await expect(editor(page)).toBeFocused();
  return id;
}

test('undo/redo of typing: 1 and 10 steps, Ctrl+Shift+Z and Ctrl+Y; result is saved (QA26-14, UX21-196, UX21-198, R-HISTORY-017, R-HISTORY-018, HIST-188)', async ({ page }) => {
  const id = await fresh(page, 'Отмена ввода');
  await page.keyboard.type('Основа.');
  await page.waitForTimeout(STEP_PAUSE);
  // 1 step
  await page.keyboard.type(' Лишнее');
  await page.waitForTimeout(STEP_PAUSE);
  await page.keyboard.press(UNDO);
  await expect(editor(page)).toHaveText('Основа.');
  await page.keyboard.press(REDO);
  await expect(editor(page)).toHaveText('Основа. Лишнее');
  await page.keyboard.press(UNDO);
  await page.keyboard.press('Control+y');
  await expect(editor(page)).toHaveText('Основа. Лишнее');
  // 10 steps: each word is a separate undo step, continuous typing of one word is one step (no step per key)
  // (after redo the caret returns to where the redone change began: move to the end explicitly)
  await page.keyboard.press('End');
  for (let i = 1; i <= 10; i++) {
    await page.keyboard.type(` с${i}`);
    await page.waitForTimeout(STEP_PAUSE);
  }
  await expect(editor(page)).toContainText('с10');
  for (let i = 10; i >= 1; i--) {
    await page.keyboard.press(UNDO);
    await expect(editor(page)).not.toContainText(`с${i}`);
    if (i > 1) await expect(editor(page)).toContainText(`с${i - 1}`);
  }
  await expect(editor(page)).toHaveText('Основа. Лишнее');
  for (let i = 1; i <= 10; i++) await page.keyboard.press(REDO);
  await expect(editor(page)).toHaveText('Основа. Лишнее с1 с2 с3 с4 с5 с6 с7 с8 с9 с10');
  await expectSaved(page);
  expect(JSON.stringify((await apiContent(page.request, id)).content)).toContain('с10');
});

test('undo/redo of formatting keeps the text and the selection (QA26-14, SC-11, R-HISTORY-011, R-HISTORY-017)', async ({ page }) => {
  await fresh(page, 'Отмена форматирования');
  await page.keyboard.type('важное слово');
  await page.waitForTimeout(STEP_PAUSE);
  await page.keyboard.press('Shift+Home');
  await page.keyboard.press('Control+b');
  await expect(editor(page).locator('strong')).toHaveText('важное слово');
  await page.waitForTimeout(STEP_PAUSE);
  await page.keyboard.press(UNDO);
  await expect(editor(page).locator('strong')).toHaveCount(0);
  await expect(editor(page)).toHaveText('важное слово');
  // the selection survived the undo: typing replaces it
  await page.keyboard.press(REDO);
  await expect(editor(page).locator('strong')).toHaveText('важное слово');
});

test('one undo reverts a paste of 100 blocks and keeps the cursor position (AT-47, R-HISTORY-009, QA26-14)', async ({ page }) => {
  const id = await fresh(page, 'Отмена вставки');
  await page.keyboard.type('До вставки');
  await page.waitForTimeout(STEP_PAUSE);
  await page.keyboard.press('Enter');
  const lines = Array.from({ length: 100 }, (_, i) => `Строка вставки ${i + 1}`).join('\n\n');
  await paste(page, { 'text/plain': lines });
  await expect(editor(page).locator('p')).toHaveCount(101, { timeout: 15_000 });
  await page.waitForTimeout(STEP_PAUSE);
  await page.keyboard.press(UNDO);
  await expect(editor(page).locator('p', { hasText: 'Строка вставки' })).toHaveCount(0);
  await expect(editor(page)).toContainText('До вставки');
  // the cursor is back where the paste happened: typing continues there
  await page.keyboard.type('после отмены');
  await expect(editor(page).locator('p').last()).toHaveText('после отмены');
  await page.waitForTimeout(STEP_PAUSE);
  await page.keyboard.press(UNDO);
  await page.keyboard.press(REDO);
  await expectSaved(page);
  const saved = JSON.stringify((await apiContent(page.request, id)).content);
  expect(saved).not.toContain('Строка вставки');
});

test('undo of a block move and of a block deletion is precise (UX-138, E2E-118, QA26-14)', async ({ page }) => {
  await fresh(page, 'Отмена структуры');
  await page.keyboard.type('Первый');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Второй');
  await page.waitForTimeout(STEP_PAUSE);
  // move "Второй" up (keyboard block move)
  await page.keyboard.press('Alt+Shift+ArrowUp');
  await expect.poll(() => blockTexts(page)).toEqual(['Второй', 'Первый']);
  await page.waitForTimeout(STEP_PAUSE);
  await page.keyboard.press(UNDO);
  await expect.poll(() => blockTexts(page)).toEqual(['Первый', 'Второй']);
  await page.keyboard.press(REDO);
  await expect.poll(() => blockTexts(page)).toEqual(['Второй', 'Первый']);
  await page.waitForTimeout(STEP_PAUSE);
  // block deletion (Esc selects the block, Delete removes it); undo brings back only that block
  await editor(page).locator('p', { hasText: 'Первый' }).click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Delete');
  await expect(editor(page).locator('p', { hasText: 'Первый' })).toHaveCount(0);
  await page.waitForTimeout(STEP_PAUSE);
  await page.keyboard.press(UNDO);
  await expect.poll(() => blockTexts(page)).toEqual(['Второй', 'Первый']);
});

test('undo of a table insert (SC-11, R-HISTORY-017, QA26-14)', async ({ page }) => {
  await fresh(page, 'Отмена таблицы');
  await page.keyboard.type('Текст');
  await page.waitForTimeout(STEP_PAUSE);
  await page.keyboard.press('Enter');
  await page.keyboard.type('/табл');
  await page.keyboard.press('Enter');
  await expect(editor(page).locator('table')).toBeVisible();
  await page.waitForTimeout(STEP_PAUSE);
  await page.keyboard.press(UNDO);
  await expect(editor(page).locator('table')).toHaveCount(0);
  await expect(editor(page)).toContainText('Текст');
});

test("undo reverts only the user's own changes, never a colleague's (SC-27, UX21-200, R-HISTORY-021, R-HISTORY-027, HIST-188)", async ({ page, browser }) => {
  const id = await fresh(page, 'Отмена в совместной работе');
  await page.keyboard.type('Текст Анны.');
  await expectSaved(page);
  const colleague = await createUser(page.request, 'Пётр Соавтор', { pageGrants: [{ pageId: id, level: 'edit' }] });
  const ctx2 = await browser.newContext();
  const p2 = await ctx2.newPage();
  await p2.goto('/p/' + id);
  await login_(p2, colleague.email, colleague.password);
  await expect(editor(p2)).toContainText('Текст Анны.');
  await editor(p2).click();
  await p2.keyboard.press('Control+End');
  await p2.keyboard.press('Enter');
  await p2.keyboard.type('Абзац Петра.');
  await expect(editor(page)).toContainText('Абзац Петра.');
  // Anna types more, then undoes: only her own addition disappears
  await editor(page).locator('p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Дополнение Анны.');
  await page.waitForTimeout(STEP_PAUSE);
  await page.keyboard.press(UNDO);
  await expect(editor(page)).not.toContainText('Дополнение Анны.');
  await expect(editor(page)).toContainText('Абзац Петра.');
  await expect(editor(p2)).toContainText('Абзац Петра.');
  await expect(editor(p2)).not.toContainText('Дополнение Анны.');
  // further undos never reach Peter's paragraph
  for (let i = 0; i < 5; i++) await page.keyboard.press(UNDO);
  await expect(editor(page)).toContainText('Абзац Петра.');
  await expectSaved(page);
  await ctx2.close();
});
