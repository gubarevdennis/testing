import { test, expect, type Page } from '@playwright/test';
import { ensureOwner, editor, expectSaved, apiContent } from './helpers';
import { newPage, cleanupCreatedPages, settle } from './editor-p0-helpers';

test.describe.configure({ mode: 'serial' });
cleanupCreatedPages();

async function scrollTopOf(page: Page) {
  return page.evaluate(() => {
    // the scroll container of the page view: the nearest scrollable ancestor of the editor
    let el: HTMLElement | null = document.querySelector('.kb-editor');
    while (el && !(el.scrollHeight > el.clientHeight && /(auto|scroll)/.test(getComputedStyle(el).overflowY))) el = el.parentElement;
    return el ? el.scrollTop : -1;
  });
}

/** The sidebar tree is virtualised: scroll it until the row is rendered. */
async function treeRow(page: Page, row: ReturnType<Page['locator']>) {
  for (let i = 0; i < 40 && !(await row.isVisible()); i++) await page.locator('.tree-scroll').evaluate((e, k) => (e.scrollTop = k * 200), i);
  await expect(row).toBeVisible();
  return row;
}

async function scrollTo(page: Page, y: number) {
  await page.evaluate((top) => {
    let el: HTMLElement | null = document.querySelector('.kb-editor');
    while (el && !(el.scrollHeight > el.clientHeight && /(auto|scroll)/.test(getComputedStyle(el).overflowY))) el = el.parentElement;
    el!.scrollTop = top;
    el!.dispatchEvent(new Event('scroll'));
  }, y);
}

test('opening another page and coming back from the tree keeps the scroll position and the edits; collapsing the tree does not scroll (R-EDITOR-047)', async ({ page }) => {
  await ensureOwner(page);
  const longId = await newPage(page, 'Длинная статья');
  for (let i = 1; i <= 80; i++) {
    await page.keyboard.type(`Абзац ${i} длинной статьи`);
    await page.keyboard.press('Enter');
  }
  await page.keyboard.type('Последняя правка');
  await expectSaved(page);
  await scrollTo(page, 900);
  await expect.poll(() => scrollTopOf(page)).toBeGreaterThan(800);
  const before = await scrollTopOf(page);
  await page.waitForTimeout(200);
  // another page via the tree
  await newPage(page, 'Короткая статья');
  await page.keyboard.type('Текст');
  await expectSaved(page);
  // back to the long article from the tree (a new navigation, not Back)
  const tree = page.getByRole('tree', { name: 'Страницы' });
  await (await treeRow(page, tree.getByText('Длинная статья', { exact: true }))).click();
  await page.waitForURL('**/p/' + longId);
  await expect(editor(page)).toContainText('Последняя правка');
  await expect.poll(() => scrollTopOf(page), { timeout: 10_000 }).toBeGreaterThan(before - 5);
  expect(Math.abs((await scrollTopOf(page)) - before)).toBeLessThanOrEqual(5);
  // collapsing a branch of the tree does not move the article
  const sectionToggle = await treeRow(page, page.locator('.tree-section-btn').filter({ hasText: /^\s*Пространства\s*$/i }).first());
  await sectionToggle.click();
  await page.waitForTimeout(300);
  expect(Math.abs((await scrollTopOf(page)) - before)).toBeLessThanOrEqual(5);
  // a link to a block still jumps to that block instead of the remembered position
  const c = (await apiContent(page.request, longId)).content;
  const first = c.content[0].attrs.id;
  await page.goto(`/p/${longId}?block=${first}`);
  await expect(editor(page)).toContainText('Абзац 1 длинной статьи');
  await expect.poll(() => scrollTopOf(page)).toBeLessThan(before - 200);
});

test('blocks move to another page: removed here only after the target saved them, order, content and ids kept (E215, R-EDITOR-076, R-EDITOR-049)', async ({ page }) => {
  await ensureOwner(page);
  const targetId = await newPage(page, 'Приёмник блоков');
  await page.keyboard.type('Существующий текст');
  await expectSaved(page);
  const sourceId = await newPage(page, 'Источник блоков');
  await page.keyboard.type('Блок А');
  await page.keyboard.press('Enter');
  await page.keyboard.type('- Пункт списка');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Остаётся');
  await expectSaved(page);
  const src = (await apiContent(page.request, sourceId)).content.content as any[];
  const ids = src.slice(0, 2).map((n) => n.attrs.id);
  // select «Блок А» and the list as blocks, then «Переместить на страницу…»
  await editor(page).locator('p', { hasText: 'Блок А' }).click();
  await settle(page);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Shift+ArrowDown');
  await expect(editor(page).locator('.kb-block-in-range')).toHaveCount(2);
  await editor(page).locator('p', { hasText: 'Блок А' }).hover();
  await page.getByRole('button', { name: 'Действия с блоком' }).click();
  await page.getByRole('menuitem', { name: 'Переместить на страницу…' }).click();
  const dlg = page.getByRole('dialog', { name: 'Переместить на страницу' });
  await expect(dlg).toBeVisible();
  await dlg.getByRole('option', { name: 'Приёмник блоков' }).click();
  await expect(page.getByText('Перенесено на страницу «Приёмник блоков»')).toBeVisible({ timeout: 20_000 });
  await expect(editor(page).locator('p', { hasText: 'Блок А' })).toHaveCount(0);
  await expect(editor(page).locator('li', { hasText: 'Пункт списка' })).toHaveCount(0);
  await expect(editor(page)).toContainText('Остаётся');
  await expectSaved(page);
  const target = (await apiContent(page.request, targetId)).content.content as any[];
  expect(target.map((n) => n.type)).toEqual(['paragraph', 'paragraph', 'bulletList']);
  expect(JSON.stringify(target)).toContain('Существующий текст');
  expect(target[1].content[0].text).toBe('Блок А');
  expect(JSON.stringify(target[2])).toContain('Пункт списка');
  // the same block ids: links to these blocks and their comments keep working
  expect(target.slice(1).map((n) => n.attrs.id)).toEqual(ids);
  const source = JSON.stringify((await apiContent(page.request, sourceId)).content);
  expect(source).not.toContain('Блок А');
  expect(source).toContain('Остаётся');
  // the moved blocks are on the target page in the editor too
  await page.getByRole('button', { name: 'Открыть' }).click().catch(() => page.goto('/p/' + targetId));
  await page.waitForURL('**/p/' + targetId);
  await expect(editor(page)).toContainText('Блок А');
  await expect(editor(page).locator('li', { hasText: 'Пункт списка' })).toHaveCount(1);
});
