import { test, expect, type Page } from '@playwright/test';
import { ensureOwner, newPage, editor, expectSaved, apiContent, createUser, login_, OWNER } from './helpers';

test.describe.configure({ mode: 'serial' });

const status = (page: Page) => page.locator('.sync-status');

/** The app shell is served by the service worker: make sure it controls the tab and has cached the bundles. */
async function withServiceWorker(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(page.locator('.app-shell')).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}

test('reload without network reopens the local copy with an honest status; the queue is delivered after reconnect (E-02, AT-75, R-OFFLINE-010, R-OFFLINE-003, R-OFFLINE-005, AT-90)', async ({ page, context }) => {
  await ensureOwner(page);
  await page.waitForLoadState('networkidle'); // first run: let the shell finish loading before creating pages
  await withServiceWorker(page);
  const id = await newPage(page, 'Офлайн после перезагрузки');
  await page.keyboard.type('Сохранено на сервере.');
  await expectSaved(page);

  await context.setOffline(true);
  await editor(page).locator('p').last().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Написано без сети.');
  await expect(status(page)).toHaveText(/Сохранено на устройстве/);

  // the tab is reloaded while still offline
  await page.reload();
  await expect(editor(page)).toContainText('Написано без сети.', { timeout: 20_000 });
  await expect(editor(page)).toContainText('Сохранено на сервере.');
  await expect(page.locator('.local-copy-banner')).toContainText('копия страницы, сохранённая на этом устройстве');
  await expect(status(page)).toHaveText(/Сохранено на устройстве/);
  await expect(page.locator('.offline-banner')).toBeVisible();
  // still editable offline
  await editor(page).locator('p').last().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' И ещё.');
  await expect(status(page)).toHaveText(/Сохранено на устройстве/);

  await context.setOffline(false);
  await expectSaved(page);
  await expect(page.locator('.local-copy-banner')).toHaveCount(0, { timeout: 15_000 });
  const saved = JSON.stringify((await apiContent(page.request, id)).content);
  expect(saved).toContain('Написано без сети. И ещё.');
  expect(saved.split('Написано без сети').length - 1).toBe(1);
});

test('two tabs of the same user edit one page online and offline: no loss, no duplicates (UX23-216, R-OFFLINE-010)', async ({ page, context }) => {
  await ensureOwner(page);
  await page.waitForLoadState('networkidle'); // first run: let the shell finish loading before creating pages
  const id = await newPage(page, 'Две вкладки');
  await page.keyboard.type('Вкладка один.');
  await expectSaved(page);
  const tab2 = await context.newPage();
  await tab2.goto('/p/' + id);
  await expect(editor(tab2)).toContainText('Вкладка один.');
  await editor(tab2).locator('p').last().click();
  await tab2.keyboard.press('End');
  await tab2.keyboard.press('Enter');
  await tab2.keyboard.type('Вкладка два.');
  await expect(editor(page)).toContainText('Вкладка два.');

  await context.setOffline(true);
  await editor(page).locator('p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Офлайн-1.');
  await editor(tab2).locator('p').last().click();
  await tab2.keyboard.press('End');
  await tab2.keyboard.type(' Офлайн-2.');
  await expect(status(page)).toHaveText(/Сохранено на устройстве/);
  await expect(status(tab2)).toHaveText(/Сохранено на устройстве/);
  await context.setOffline(false);
  await expectSaved(page);
  await expectSaved(tab2);
  await expect(editor(page)).toContainText('Офлайн-2.');
  await expect(editor(tab2)).toContainText('Офлайн-1.');
  const saved = JSON.stringify((await apiContent(page.request, id)).content);
  for (const s of ['Вкладка один. Офлайн-1.', 'Вкладка два. Офлайн-2.']) expect(saved.split(s).length - 1).toBe(1);
  await tab2.close();
});

test("one browser, two accounts: a user's unsent changes are never sent or shown under another account (R-OFFLINE-007)", async ({ page, context }) => {
  await ensureOwner(page);
  await page.waitForLoadState('networkidle'); // first run: let the shell finish loading before creating pages
  const id = await newPage(page, 'Общий компьютер');
  await page.keyboard.type('Общий текст.');
  await expectSaved(page);
  const bob = await createUser(page.request, 'Борис Сменщик', { pageGrants: [{ pageId: id, level: 'edit' }] });

  // Anna writes without network and closes the tab: the change stays queued on this computer
  await context.setOffline(true);
  await editor(page).locator('p').last().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Черновик Анны.');
  await expect(status(page)).toHaveText(/Сохранено на устройстве/);
  await page.close();
  await context.setOffline(false);

  // Boris signs in on the same browser profile and opens the page
  await context.clearCookies();
  const p2 = await context.newPage();
  await p2.goto('/p/' + id);
  await login_(p2, bob.email, bob.password);
  await expect(editor(p2)).toContainText('Общий текст.');
  await editor(p2).locator('p').last().click();
  await p2.keyboard.press('End');
  await p2.keyboard.type(' Правка Бориса.');
  await expectSaved(p2);
  await p2.waitForTimeout(1000);
  await expect(editor(p2)).not.toContainText('Черновик Анны');
  expect(JSON.stringify((await apiContent(p2.request, id)).content)).not.toContain('Черновик Анны');
  await p2.close();

  // Anna signs in again: her queue is delivered under her own account
  await context.clearCookies();
  const p3 = await context.newPage();
  await p3.goto('/p/' + id);
  await login_(p3, OWNER.email, OWNER.password);
  await expect(editor(p3)).toContainText('Черновик Анны.');
  await expectSaved(p3);
  const saved = JSON.stringify((await apiContent(p3.request, id)).content);
  expect(saved).toContain('Черновик Анны.');
  expect(saved).toContain('Правка Бориса.');
});
