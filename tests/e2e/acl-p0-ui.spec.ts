import { test, expect, devices, type Page } from '@playwright/test';
import { ensureOwner, newPage, createUser, login_, api, editor, expectSaved } from './helpers';

test.describe.configure({ mode: 'serial' });

/** Reads the cached page metadata the client keeps for offline use. */
async function localMeta(p: Page, key: string) {
  return p.evaluate(
    (k) =>
      new Promise<unknown>((resolve) => {
        const req = indexedDB.open('kb-client');
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('meta')) return resolve(undefined);
          const g = db.transaction('meta').objectStore('meta').get(k);
          g.onsuccess = () => resolve(g.result);
          g.onerror = () => resolve(undefined);
        };
        req.onerror = () => resolve(undefined);
      }),
    key,
  );
}

async function scenario(page: Page, browser: import('@playwright/test').Browser, label: string, ctxOptions: Parameters<import('@playwright/test').Browser['newContext']>[0] = {}) {
  test.setTimeout(150_000);
  await ensureOwner(page);
  const sharedId = await newPage(page, `Общий регламент ${label}`);
  await page.keyboard.type('Текст регламента для читателя.');
  await expectSaved(page);
  const hiddenId = await newPage(page, `Скрытая служебная записка ${label}`);
  await page.keyboard.type('Конфиденциально.');
  await expectSaved(page);
  const reader = await createUser(page.request, `Читатель ${label}`, { pageGrants: [{ pageId: sharedId, level: 'view' }] });

  const ctx = await browser.newContext(ctxOptions);
  const p = await ctx.newPage();
  await p.goto('/p/' + sharedId);
  await login_(p, reader.email, reader.password);
  await expect(editor(p)).toContainText('Текст регламента для читателя.');
  const csrf = (await ctx.storageState()).cookies.find((c) => c.name === 'kb_csrf')!.value;

  // UI = server: the server says view-only, the UI offers no editing or sharing.
  const dto = (await (await p.request.get(`/api/v1/pages/${sharedId}`)).json()).page;
  expect(dto.access.level).toBe('view');
  expect(dto.access.actions.edit).toBe(false);
  await expect(editor(p)).toHaveAttribute('contenteditable', 'false');
  // On a phone the button shows only its icon.
  await p.locator('.page-header-actions button.btn.sm').first().click();
  const dlg = p.getByRole('dialog', { name: /Доступ:/ });
  await expect(dlg.getByText(/Ваш доступ: Просмотр/)).toBeVisible();
  await expect(dlg.getByRole('button', { name: 'Выдать доступ' })).toHaveCount(0);
  await expect(dlg.getByRole('button', { name: 'Только я' })).toHaveCount(0);
  await dlg.getByRole('button', { name: 'Готово' }).click();

  // No bypass through the API: edits, sharing and public links are refused by the server.
  const patch = await p.request.patch(`/api/v1/pages/${sharedId}`, { data: { title: 'взлом' }, headers: { 'x-csrf-token': csrf } });
  expect(patch.status()).toBe(403);
  const grant = await p.request.put('/api/v1/grants', { data: { resourceType: 'page', resourceId: sharedId, subjectType: 'user', subjectId: reader.id, level: 'full' }, headers: { 'x-csrf-token': csrf } });
  expect(grant.status()).toBe(403);
  // No bypass through URLs: a hidden page is "not found", invisible in search and content endpoints.
  await p.goto('/p/' + hiddenId);
  await expect(p.getByRole('heading', { name: 'Страница не найдена или у вас нет доступа' })).toBeVisible();
  await expect(p.getByText('Конфиденциально.')).toHaveCount(0);
  for (const url of [`/api/v1/pages/${hiddenId}`, `/api/v1/pages/${hiddenId}/content`, `/api/v1/pages/${hiddenId}/export?format=md`, `/api/v1/pages/${hiddenId}/comments`]) expect((await p.request.get(url)).status(), url).toBe(404);
  const search = await (await p.request.get(`/api/v1/search?q=${encodeURIComponent('служебная записка ' + label)}`)).json();
  expect(JSON.stringify(search)).not.toContain(hiddenId);

  // Revocation in the session: the open page loses access; on reload the local copy is removed from the device.
  await p.goto('/p/' + sharedId);
  await expect(editor(p)).toContainText('Текст регламента для читателя.');
  expect(await localMeta(p, `page:${reader.id}:${sharedId}`)).toBeTruthy();
  const access = await (await page.request.get(`/api/v1/pages/${sharedId}/access`)).json();
  const g = access.pageGrants.find((x: any) => x.subject_id === reader.id);
  await api(page, 'DELETE', `/api/v1/grants/${g.id}`);
  await expect.poll(async () => (await p.request.get(`/api/v1/pages/${sharedId}`)).status()).toBe(404);
  await p.reload();
  await expect(p.getByRole('heading', { name: 'Страница не найдена или у вас нет доступа' })).toBeVisible();
  await expect.poll(() => localMeta(p, `page:${reader.id}:${sharedId}`)).toBeFalsy();
  await ctx.close();
}

test('QA26-24 R-ACL-075 R-ACL-076: in the browser the UI shows exactly the server rights; no bypass via URL or API; revocation removes access and the local copy (R-ACL-025)', async ({ page, browser }) => {
  await scenario(page, browser, 'ПК');
});

test('R-ACL-075 QA26-24: the same access-control checks on a phone (Pixel 7 viewport, touch)', async ({ page, browser }) => {
  const { defaultBrowserType: _ignored, ...pixel } = devices['Pixel 7'];
  await scenario(page, browser, 'телефон', pixel);
});
