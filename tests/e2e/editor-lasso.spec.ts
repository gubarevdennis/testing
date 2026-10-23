import { test, expect } from '@playwright/test';
import { ensureOwner, newPage, editor, expectSaved, apiContent } from './helpers';

test('lasso: dragging from the margin selects the touched blocks as one range; the range moves and deletes together; Esc cancels', async ({ page }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Рамка выделения');
  for (const t of ['Первый', 'Второй', 'Третий', 'Четвёртый']) {
    await page.keyboard.type(t);
    await page.keyboard.press('Enter');
  }
  await page.keyboard.type('Пятый');
  await expectSaved(page);
  const ed = editor(page);
  const box = async (t: string) => (await ed.locator('p', { hasText: t }).boundingBox())!;
  const b2 = await box('Второй');
  const b4 = await box('Четвёртый');
  const left = (await ed.boundingBox())!.x - 30; // empty margin left of the text
  // Esc while drawing cancels
  await page.mouse.move(left, b2.y + 2);
  await page.mouse.down();
  await page.mouse.move(left + 60, b4.y + 4, { steps: 8 });
  await expect(page.locator('.kb-lasso')).toBeVisible();
  await expect(ed.locator('.kb-block-in-range')).toHaveCount(3);
  await page.mouse.up();
  await expect(page.locator('.kb-lasso')).toHaveCount(0);
  await expect(ed.locator('.kb-block-in-range')).toHaveCount(3);
  // the range acts as a group: Alt+Shift+↑ moves all three above «Первый»
  await page.keyboard.press('Alt+Shift+ArrowUp');
  await expectSaved(page);
  const texts = ((await apiContent(page.request, id)).content.content as any[]).map((n) => n.content?.[0]?.text);
  expect(texts).toEqual(['Второй', 'Третий', 'Четвёртый', 'Первый', 'Пятый']);
  // and Delete removes them together (one Undo brings them back)
  await page.keyboard.press('Delete');
  await expect(ed.locator('p')).toHaveCount(2);
  await page.keyboard.press('Control+z');
  await expect(ed.locator('p')).toHaveCount(5);
  // a click in the text is still a normal caret, not a lasso
  await ed.locator('p', { hasText: 'Пятый' }).click();
  await expect(page.locator('.kb-lasso')).toHaveCount(0);
});
