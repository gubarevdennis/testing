import { test, expect, devices, type Browser } from '@playwright/test';
import { ensureOwner, newPage, editor, expectSaved } from './helpers';
import { importMarkdown, spaceOf } from './perf-helpers';

/**
 * Touch and navigation details on top of the desktop project: a phone context (Pixel 7: touch, coarse pointer,
 * no hover) is created inside the test, so these run with `--project=desktop` too.
 */
test.describe.configure({ mode: 'serial' });

async function phone(browser: Browser) {
  const ctx = await browser.newContext({ ...devices['Pixel 7'], locale: 'ru-RU', timezoneId: 'Europe/Moscow' });
  return { ctx, page: await ctx.newPage() };
}

test('UX-146, R-UI-058: on a touch phone the floating "+" inserts a block without hover', async ({ browser }) => {
  const { ctx, page } = await phone(browser);
  await ensureOwner(page);
  await newPage(page, 'Касание: вставка блока');
  await editor(page).tap();
  await page.keyboard.type('Первый абзац');
  const plus = page.getByRole('button', { name: 'Вставить блок' });
  await expect(plus).toBeVisible();
  await plus.tap();
  const menu = page.getByRole('listbox', { name: 'Вставить блок' });
  await expect(menu).toBeVisible();
  await menu.getByRole('option', { name: /Заголовок 2/ }).tap();
  await page.keyboard.type('Раздел с телефона');
  await expect(editor(page).locator('h2')).toHaveText('Раздел с телефона');
  await expect(editor(page).locator('p').first()).toHaveText('Первый абзац');
  await expectSaved(page);
  await ctx.close();
});

test('R-A11Y-008: touch targets on a phone are at least 44×44 CSS px', async ({ browser }) => {
  const { ctx, page } = await phone(browser);
  await ensureOwner(page);
  await newPage(page, 'Касание: размеры');
  await page.keyboard.type('Текст');
  await expectSaved(page);
  const small = async (where: string) =>
    (
      await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('button, a.nav-item, [role=menuitem], [role=tab], .tree-row-main')]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && Number(cs.opacity) > 0 && !el.closest('.kb-editor, [aria-hidden=true]') && r.top < innerHeight && r.bottom > 0;
          })
          .map((el) => ({ el, r: el.getBoundingClientRect() }))
          // a row (tree item) counts with its full row height
          .filter(({ el, r }) => Math.min(r.width, Math.max(r.height, el.closest('.tree-row')?.getBoundingClientRect().height ?? 0)) < 44 - 0.5)
          .map(({ el, r }) => `${el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 24)} ${Math.round(r.width)}×${Math.round(r.height)}`),
      )
    ).map((s) => `${where}: ${s}`);
  const problems = [...(await small('page'))];
  await page.getByRole('button', { name: 'Показать боковую панель' }).tap();
  await expect(page.getByRole('navigation', { name: 'Навигация' })).toBeVisible();
  problems.push(...(await small('drawer')));
  expect(problems, problems.join('\n')).toEqual([]);
  await ctx.close();
});

test('UX-131: Back restores the reading position of a long page', async ({ page }) => {
  await ensureOwner(page);
  const scratch = await newPage(page, 'Позиция прокрутки (черновик)');
  const md = Array.from({ length: 300 }, (_, i) => `Абзац ${i}: длинная статья о приёмке и размещении товара на складе.`).join('\n\n');
  const id = await importMarkdown(page.request, await spaceOf(page.request, scratch), 'Длинная статья.md', md);
  await page.goto('/p/' + id);
  await expect(editor(page).locator('p').nth(299)).toBeAttached();
  const scroller = page.locator('.page-scroll');
  await scroller.evaluate((e) => (e.scrollTop = 4000));
  await page.waitForTimeout(300);
  const before = await scroller.evaluate((e) => e.scrollTop);
  expect(before).toBeGreaterThan(3000);
  await page.getByRole('navigation', { name: 'Навигация' }).getByRole('link', { name: 'Главная' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goBack();
  await expect(editor(page).locator('p').nth(299)).toBeAttached();
  await expect.poll(() => scroller.evaluate((e) => e.scrollTop), { timeout: 10_000 }).toBeGreaterThan(before - 50);
  expect(Math.abs((await scroller.evaluate((e) => e.scrollTop)) - before)).toBeLessThan(50);
  // a fresh navigation to the same page starts at the top
  await page.getByRole('navigation', { name: 'Навигация' }).getByRole('link', { name: 'Главная' }).click();
  await page.getByRole('tree', { name: 'Страницы' }).getByRole('link', { name: 'Длинная статья' }).click();
  await expect(editor(page).locator('p').first()).toBeVisible();
  expect(await scroller.evaluate((e) => e.scrollTop)).toBeLessThan(50);
});
