import { test, expect } from '@playwright/test';
import { ensureOwner, newPage, expectSaved } from './helpers';

test('mobile: drawer navigation, editor usable, no horizontal scroll', async ({ page }) => {
  await ensureOwner(page);
  await expect(page.getByRole('navigation', { name: 'Навигация' })).toBeHidden();
  await page.getByRole('button', { name: 'Показать боковую панель' }).click();
  await expect(page.getByRole('navigation', { name: 'Навигация' })).toBeVisible();
  await newPage(page, 'С телефона');
  await page.keyboard.type('Заметка с телефона');
  await expectSaved(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
