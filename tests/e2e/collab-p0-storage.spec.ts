import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { ensureOwner, newPage, editor, expectSaved, apiContent, api } from './helpers';

test.describe.configure({ mode: 'serial' });

const status = (page: Page) => page.locator('.sync-status');

test('device storage is full: explicit warning, error status instead of "saved on device", local copy can be downloaded (R-OFFLINE-006, R-COLLAB-017, AT-90)', async ({ page, context }) => {
  // the browser refuses writes to the pending-operations store once the test flips the switch
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...args: any[]) {
      if ((window as any).__kbQuota && this.name === 'pending') throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      return put.apply(this, args as any);
    } as any;
  });
  await ensureOwner(page);
  await page.waitForLoadState('networkidle'); // first run: let the shell finish loading before creating pages
  const id = await newPage(page, 'Хранилище переполнено');
  await page.keyboard.type('Основа.');
  await expectSaved(page);

  await page.evaluate(() => ((window as any).__kbQuota = true));
  await context.setOffline(true);
  await page.keyboard.type(' Не поместилось на диск.');
  await expect(page.locator('.toast').filter({ hasText: 'закончилось место' })).toHaveCount(1);
  await expect(status(page)).toHaveText(/Ошибка сохранения/);
  await expect(status(page)).not.toHaveText(/Сохранено/);
  const banner = page.locator('.editor-fatal');
  await expect(banner).toContainText('закончилось место');
  await expect(banner).toContainText('неотправленные изменения');
  const [download] = await Promise.all([page.waitForEvent('download'), banner.getByRole('button', { name: /Скачать локальную копию/ }).click()]);
  const md = await readFile((await download.path())!, 'utf8');
  expect(md).toContain('Не поместилось на диск.');

  // connection back: the operations kept in memory reach the server, the error clears
  await page.evaluate(() => ((window as any).__kbQuota = false));
  await context.setOffline(false);
  await expectSaved(page);
  await expect(banner).toHaveCount(0);
  expect(JSON.stringify((await apiContent(page.request, id)).content)).toContain('Не поместилось на диск.');
});

test('the server cannot store changes: visible error (never endless "Сохранение…"), local copy offered, automatic retry succeeds (AT-59, R-COLLAB-017)', async ({ page }) => {
  await ensureOwner(page);
  await page.waitForLoadState('networkidle'); // first run: let the shell finish loading before creating pages
  const id = await newPage(page, 'Сбой хранилища сервера');
  await page.keyboard.type('До сбоя.');
  await expectSaved(page);
  await api(page, 'POST', '/api/v1/__test/collab-faults', { persistFailures: 3 });
  await page.keyboard.insertText(' Во время сбоя.'); // one operation
  await expect(status(page)).toHaveText(/Ошибка сохранения/, { timeout: 10_000 });
  const banner = page.locator('.editor-fatal');
  await expect(banner).toContainText('Сервер не может сохранить изменения');
  await expect(banner.getByRole('button', { name: /Скачать локальную копию/ })).toBeVisible();
  // retries every 2 s; after the injected failures the change is committed
  await expectSaved(page);
  await expect(banner).toHaveCount(0);
  expect(JSON.stringify((await apiContent(page.request, id)).content)).toContain('До сбоя. Во время сбоя.');
});

test('offline local-copy screen lets the user extract local edits (AT-90, R-OFFLINE-010)', async ({ page, context }) => {
  await ensureOwner(page);
  await page.waitForLoadState('networkidle'); // first run: let the shell finish loading before creating pages
  await page.evaluate(async () => void (await navigator.serviceWorker.ready));
  await page.reload();
  await newPage(page, 'Извлечение правок');
  await page.keyboard.type('Локальная правка без сети.');
  await expectSaved(page);
  await context.setOffline(true);
  await page.keyboard.type(' Ещё офлайн.');
  await page.reload();
  const banner = page.locator('.local-copy-banner');
  await expect(banner).toBeVisible({ timeout: 20_000 });
  await expect(editor(page)).toContainText('Ещё офлайн.');
  const [download] = await Promise.all([page.waitForEvent('download'), banner.getByRole('button', { name: /Скачать локальную копию/ }).click()]);
  expect(await readFile((await download.path())!, 'utf8')).toContain('Локальная правка без сети. Ещё офлайн.');
  await context.setOffline(false);
  await expectSaved(page);
});
