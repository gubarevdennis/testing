import { test, expect } from '@playwright/test';
import path from 'node:path';
import { ensureOwner, newPage, editor, expectSaved, apiContent, api } from './helpers';

test.describe.configure({ mode: 'serial' });

test('image: upload via file chooser, resize presets, caption, full-screen viewer with zoom', async ({ page }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Схема склада');
  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.type('/изображ');
  await page.keyboard.press('Enter');
  await (await chooser).setFiles(path.resolve('tests/e2e/fixtures/scheme.png'));
  const img = editor(page).locator('.kb-image-block img');
  await expect(img).toBeVisible({ timeout: 20_000 });
  await img.click();
  await page.getByRole('button', { name: '50%' }).click();
  await page.getByRole('button', { name: 'Подпись' }).click();
  await page.getByLabel('Подпись к изображению').fill('Рис. 1 — схема');
  await page.getByLabel('Подпись к изображению').press('Enter');
  await expectSaved(page);
  const c = await apiContent(page.request, id);
  const node = JSON.stringify(c.content);
  expect(node).toContain('"caption":"Рис. 1 — схема"');
  expect(node).toMatch(/"attachmentId":"[0-9a-f-]{36}"/);
  // viewer
  await img.dblclick();
  const viewer = page.getByRole('dialog', { name: /Рис. 1/ });
  await expect(viewer).toBeVisible();
  const pct = viewer.locator('.viewer-pct');
  const before = await pct.textContent();
  await viewer.getByRole('button', { name: 'Увеличить' }).click();
  await expect(pct).not.toHaveText(before!);
  await page.keyboard.press('0');
  await page.keyboard.press('Escape');
  await expect(viewer).toBeHidden();
});

test('sidebar tree: "+" creates a child page under the selected parent with focus in the title (R-TREE-002, UX-121, UX23-201)', async ({ page }) => {
  await ensureOwner(page);
  const parentTitle = 'Родитель ' + Date.now();
  await newPage(page, parentTitle);
  await expectSaved(page);
  const tree = page.getByRole('tree', { name: 'Страницы' });
  const row = tree.getByRole('treeitem').filter({ hasText: parentTitle });
  await row.hover();
  const parentUrl = page.url();
  await row.getByRole('button', { name: `Добавить страницу внутрь «${parentTitle}»` }).click();
  await page.waitForURL((u) => u.toString() !== parentUrl);
  await page.getByLabel('Название страницы').fill('Дочерняя');
  await expectSaved(page);
  await expect(tree.getByRole('treeitem').filter({ hasText: 'Дочерняя' })).toBeVisible();
  const childRow = tree.getByRole('treeitem').filter({ hasText: 'Дочерняя' });
  const parentBox = await row.boundingBox();
  const childBox = await childRow.boundingBox();
  expect(childBox!.y).toBeGreaterThan(parentBox!.y);
});

test('comment on a selection appears in the comments panel', async ({ page }) => {
  await ensureOwner(page);
  await newPage(page, 'Комментарии');
  await page.keyboard.type('Проверьте этот абзац');
  await expectSaved(page);
  await page.keyboard.press('Shift+Home');
  await page.getByRole('button', { name: 'Комментарий' }).click();
  const panel = page.getByRole('complementary', { name: 'Боковая панель' });
  await expect(panel).toBeVisible();
  await panel.getByRole('textbox').first().fill('Нужно уточнить сроки');
  await panel.getByRole('textbox').first().press('Control+Enter');
  await expect(panel.getByText('Нужно уточнить сроки')).toBeVisible();
  await expect(editor(page).locator('.kb-comment-anchor')).toHaveText('Проверьте этот абзац');
});

test('the open page is revealed in the tree: ancestors expanded, row scrolled into view and selected (R-TREE-013)', async ({ page }) => {
  await ensureOwner(page);
  const anchor = await newPage(page, 'Раскрытие: якорь');
  const spaceId = (await (await page.request.get(`/api/v1/pages/${anchor}`)).json()).page.spaceId as string;
  // enough siblings to push the target far below the visible part of the (virtualized) tree
  for (let i = 0; i < 60; i++) await api(page, 'POST', '/api/v1/pages', { spaceId, title: `Раскрытие: строка ${String(i).padStart(2, '0')}` });
  const parent = (await api(page, 'POST', '/api/v1/pages', { spaceId, title: 'Раскрытие: глубокий родитель' })).page.id as string;
  const child = (await api(page, 'POST', '/api/v1/pages', { spaceId, parentId: parent, title: 'Раскрытие: вложенная цель' })).page.id as string;
  await page.goto('/');
  await page.goto('/p/' + child);
  const link = page.getByRole('tree', { name: 'Страницы' }).getByRole('link', { name: 'Раскрытие: вложенная цель' });
  await expect(link).toBeInViewport();
  await expect(link.locator('xpath=ancestor::div[@role="treeitem"][1]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tree', { name: 'Страницы' }).getByRole('treeitem', { name: /Раскрытие: глубокий родитель/ }).first()).toHaveAttribute('aria-expanded', 'true');
});
