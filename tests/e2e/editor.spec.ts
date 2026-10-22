import { test, expect } from '@playwright/test';
import { ensureOwner, newPage, editor, expectSaved, apiContent } from './helpers';

test.describe.configure({ mode: 'serial' });

test('first run: organisation setup, personal space and empty states', async ({ page }) => {
  await ensureOwner(page);
  await expect(page.getByRole('tree', { name: 'Страницы' })).toBeVisible();
});

test('create page, type with Markdown shortcuts, "Сохранено" only after server ack, survives reload (R-PAGE-018, R-PAGE-033, AT-61, UX13-01, UX-144)', async ({ page }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Регламент приёмки');
  const ed = editor(page);
  await expect(ed).toBeFocused();
  await page.keyboard.type('# Цель');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Документ описывает **порядок** приёмки.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('- первый пункт');
  await page.keyboard.press('Enter');
  await page.keyboard.type('второй пункт');
  await expect(ed.locator('h1')).toHaveText('Цель');
  await expect(ed.locator('strong')).toHaveText('порядок');
  await expect(ed.locator('ul > li')).toHaveCount(2);
  await expectSaved(page);
  const saved = await apiContent(page.request, id);
  expect(JSON.stringify(saved.content)).toContain('второй пункт');
  await page.reload();
  await expect(editor(page).locator('ul > li')).toHaveCount(2);
  await expect(page.getByLabel('Название страницы')).toHaveValue('Регламент приёмки');
  // the tree shows the new title
  await expect(page.getByRole('tree', { name: 'Страницы' }).getByText('Регламент приёмки')).toBeVisible();
});

test('offline edits are kept locally and delivered after reconnect (E220, AT-57)', async ({ page, context }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Офлайн');
  await expectSaved(page);
  await context.setOffline(true);
  await editor(page).click();
  await page.keyboard.type('Текст, набранный без сети');
  await expect(page.locator('.sync-status')).toHaveText(/устройстве|Нет связи/, { timeout: 15_000 });
  await context.setOffline(false);
  await expectSaved(page);
  const saved = await apiContent(page.request, id);
  expect(JSON.stringify(saved.content)).toContain('Текст, набранный без сети');
});

test('slash menu inserts a table and a callout; "> " creates a toggle', async ({ page }) => {
  await ensureOwner(page);
  await newPage(page, 'Блоки');
  await page.keyboard.type('/табл');
  await expect(page.getByRole('listbox', { name: 'Вставить блок' })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(editor(page).locator('table')).toBeVisible();
  await expect(editor(page).locator('table tr')).toHaveCount(3);
  // leave the table at the end of the document by keyboard: a new paragraph is created below it
  await page.keyboard.press('Control+End');
  await page.keyboard.type('/выноск');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Важная заметка');
  await expect(editor(page).locator('.kb-callout')).toContainText('Важная заметка');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('> ');
  await expect(editor(page).locator('[data-type="details"]')).toHaveCount(1);
  await expectSaved(page);
});

test('an empty page created by mistake disappears when left; a double click creates one page (R-TREE-025, UX23-203, UX23-202)', async ({ page }) => {
  await ensureOwner(page);
  const nav = page.getByRole('navigation', { name: 'Навигация' });
  const tree = page.getByRole('tree', { name: 'Страницы' });
  const before = await tree.getByRole('treeitem').filter({ hasText: 'Без названия' }).count();
  await nav.getByRole('button', { name: 'Новая страница', exact: true }).dblclick();
  await page.waitForURL(/\/p\//);
  await expect(page.getByLabel('Название страницы')).toBeFocused();
  await expect(tree.getByRole('treeitem').filter({ hasText: 'Без названия' })).toHaveCount(before + 1);
  await nav.getByRole('link', { name: 'Главная' }).click();
  await expect(tree.getByRole('treeitem').filter({ hasText: 'Без названия' })).toHaveCount(before, { timeout: 10_000 });
});
