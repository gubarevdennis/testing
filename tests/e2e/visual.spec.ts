import { test, expect } from '@playwright/test';
import { ensureOwner, newPage, expectSaved, paste } from './helpers';

const VIEWPORTS = [
  [320, 640],
  [375, 812],
  [768, 1024],
  [1024, 768],
  [1440, 900],
  [1920, 1080],
] as const;

test.describe.configure({ mode: 'serial' });

let pageId = '';

test('prepare a representative page', async ({ page }) => {
  await ensureOwner(page);
  pageId = await newPage(page, 'Макет: регламент склада');
  await page.keyboard.type('## Назначение');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Документ определяет порядок приёмки товара на складе и ответственность сотрудников смены за каждый этап работ.');
  await page.keyboard.press('Enter');
  await paste(page, { 'text/plain': 'Этап\tОтветственный\tСрок\nПриёмка\tКладовщик\t2 часа\nРазмещение\tОператор\t4 часа\n' });
  await expectSaved(page);
});

for (const [w, h] of VIEWPORTS) {
  for (const theme of ['light', 'dark'] as const) {
    test(`layout ${w}x${h} ${theme}: no horizontal overflow, key controls reachable`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.addInitScript((t) => localStorage.setItem('kb:theme', JSON.stringify(t)), theme);
      await ensureOwner(page);
      for (const path of ['/', `/p/${pageId}`, '/search?q=склад', '/templates', '/settings']) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${path} overflows horizontally at ${w}px`).toBeLessThanOrEqual(0);
        await page.screenshot({ path: `test-results/visual/${w}x${h}-${theme}${path.replace(/[^a-z0-9]+/gi, '_')}.png` });
      }
      await page.goto(`/p/${pageId}`);
      await expect(page.getByLabel('Название страницы')).toBeVisible();
      if (w < 861) await expect(page.getByRole('button', { name: 'Показать боковую панель' })).toBeVisible();
      else await expect(page.getByRole('navigation', { name: 'Навигация' })).toBeVisible();
    });
  }
}

test('200% zoom (CSS zoom) keeps the page usable', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await ensureOwner(page);
  await page.goto(`/p/${pageId}`);
  await page.evaluate(() => ((document.documentElement.style as any).zoom = '2'));
  await page.waitForTimeout(300);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: 'test-results/visual/zoom-200.png' });
});
