import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ensureOwner, newPage, expectSaved, paste } from './helpers';

test.describe.configure({ mode: 'serial' });

async function axe(page: Page, label: string) {
  // contrast is measured on the final appearance: an element fading in (opacity animation) is not a violation
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity), undefined, { timeout: 5000 }).catch(() => undefined);
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const serious = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  for (const v of serious) console.log(`[axe ${label}] ${v.id}: ${v.help} — ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  expect(serious.map((v) => v.id), `${label}: serious/critical WCAG 2.1 AA violations`).toEqual([]);
}

let pageId = '';

test('WCAG 2.1 AA automated audit of key screens (R-A11Y-003, AT-80, E2E-112)', async ({ page }) => {
  await page.goto('/');
  await axe(page, 'login/setup');
  await ensureOwner(page);
  await axe(page, 'home');
  pageId = await newPage(page, 'Доступность');
  await page.keyboard.type('## Раздел');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Текст абзаца со ссылкой и списком.');
  await page.keyboard.press('Enter');
  await paste(page, { 'text/plain': 'A\tB\n1\t2\n' });
  await expectSaved(page);
  await axe(page, 'page');
  for (const path of ['/search?q=Раздел', '/templates', '/trash', '/settings', '/admin', '/import']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await axe(page, path);
  }
});

test('keyboard only: quick switcher, help, dialogs close with Esc and return focus (UX-136, SC-34)', async ({ page }) => {
  await ensureOwner(page);
  await page.goto('/p/' + pageId);
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+k');
  const sw = page.getByRole('dialog', { name: 'Быстрый переход' });
  await expect(sw).toBeVisible();
  await page.keyboard.type('Доступн');
  await expect(sw.getByRole('option', { name: /Доступность/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sw).toBeHidden();
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: 'Справка' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Справка' })).toBeHidden();
  // tree: roving focus with arrows
  const tree = page.getByRole('tree', { name: 'Страницы' });
  await tree.getByRole('treeitem').filter({ hasText: 'Доступность' }).getByRole('link').focus();
  await page.keyboard.press('ArrowUp');
  const active = await page.evaluate(() => document.activeElement?.textContent ?? '');
  expect(active.length).toBeGreaterThan(0);
  await page.keyboard.press('ArrowDown');
  await expect(tree.getByRole('treeitem').filter({ hasText: 'Доступность' }).getByRole('link')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(pageId));
});

test('reduced motion: animations and transitions are effectively disabled (R-A11Y-002, AT-82)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ensureOwner(page);
  await page.goto('/p/' + pageId);
  await page.getByRole('navigation', { name: 'Навигация' }).getByRole('button', { name: /Поиск/ }).click();
  await expect(page.getByRole('dialog', { name: 'Быстрый переход' })).toBeVisible();
  const durations = await page.evaluate(() => {
    const els = [...document.querySelectorAll('.switcher, .dialog-backdrop, .btn, .tree-row, .nav-item, .icon-btn')];
    return els.map((e) => {
      const cs = getComputedStyle(e);
      const toMs = (v: string) => Math.max(...v.split(',').map((x) => (x.trim().endsWith('ms') ? parseFloat(x) : parseFloat(x) * 1000)));
      return Math.max(toMs(cs.animationDuration), toMs(cs.transitionDuration));
    });
  });
  expect(durations.length).toBeGreaterThan(0);
  expect(Math.max(...durations)).toBeLessThanOrEqual(10);
});

test('real 200% browser zoom (1280x800 at 2x = 640x400 CSS px) keeps every key screen usable (AT-81, UX-147, V18-A18)', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await ensureOwner(page);
  for (const path of ['/', '/p/' + pageId, '/search?q=Раздел', '/settings', '/admin']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
  await page.goto('/p/' + pageId);
  await expect(page.getByLabel('Название страницы')).toBeVisible();
  await page.getByRole('button', { name: 'Показать боковую панель' }).click();
  await expect(page.getByRole('navigation', { name: 'Навигация' })).toBeVisible();
  await ctx.close();
});

test('pixel baselines for stable screens (R-QA-008, AT-89)', async ({ browser }) => {
  // make sure the organisation exists, then capture the sign-in screen from a fresh (signed-out) context
  const setupCtx = await browser.newContext();
  await ensureOwner(await setupCtx.newPage());
  await setupCtx.close();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Вход в базу знаний' })).toBeVisible();
  await expect(page).toHaveScreenshot('auth.png', { maxDiffPixelRatio: 0.01 });
  await ensureOwner(page);
  await page.keyboard.press('?');
  const help = page.getByRole('dialog', { name: 'Справка' });
  await expect(help).toBeVisible();
  await expect(help).toHaveScreenshot('help-dialog.png', { maxDiffPixelRatio: 0.01 });
  await ctx.close();
});
