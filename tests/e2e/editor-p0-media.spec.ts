import { test, expect, type Page } from '@playwright/test';
import { ensureOwner, newPage, editor, expectSaved, apiContent } from './helpers';

test.describe.configure({ mode: 'serial' });

// 8x8 PNG
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP8z4AATAxkCAEAJ9cBD8JfOs4AAAAASUVORK5CYII=';

/** Pastes an image file (as a screenshot tool or a browser "Copy image" puts it on the clipboard). */
async function pasteImage(page: Page, name: string) {
  await page.evaluate(
    ({ b64, name }) => {
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bin], name, { type: 'image/png' }));
      const target = document.activeElement ?? document.querySelector('.kb-editor');
      target!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    },
    { b64: PNG_B64, name },
  );
}

function images(content: unknown): Array<Record<string, any>> {
  const out: Array<Record<string, any>> = [];
  const walk = (n: any) => {
    if (n?.type === 'image') out.push(n.attrs);
    n?.content?.forEach(walk);
  };
  walk(content);
  return out;
}

test('pasted image: instant local preview, upload error keeps the block, retry completes it with alt (R-MEDIA-006, R-MEDIA-008)', async ({ page }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Скриншот из буфера');
  await page.keyboard.type('До картинки');
  await page.keyboard.press('Enter');
  // the storage fails: the server answers 500
  await page.route('**/api/v1/attachments', (route) =>
    route.request().method() === 'POST' ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'storage', message: 'Сбой хранилища' } }) }) : route.continue(),
  );
  await pasteImage(page, 'Схема_цеха.png');
  const ph = editor(page).locator('.kb-upload.is-image');
  await expect(ph).toBeVisible();
  // local preview straight from the file (no server round trip)
  await expect(ph.locator('img')).toHaveAttribute('src', /^blob:/);
  await expect(ph.getByRole('status')).toContainText('Не удалось загрузить');
  await expect(ph.getByRole('status')).toContainText('Сбой хранилища');
  // the block is a real document node: it is saved and survives a reload
  await expectSaved(page);
  let imgs = images((await apiContent(page.request, id)).content);
  expect(imgs).toHaveLength(1);
  expect(imgs[0].uploadId).toBeTruthy();
  expect(imgs[0].alt).toBe('Схема цеха');

  await page.unroute('**/api/v1/attachments');
  await ph.getByRole('button', { name: 'Повторить' }).click();
  const img = editor(page).locator('.kb-image-block img');
  await expect(img).toHaveAttribute('src', /\/api\/v1\/attachments\/[0-9a-f-]{36}\/content/, { timeout: 20_000 });
  await expect(ph).toHaveCount(0);
  await expectSaved(page);
  imgs = images((await apiContent(page.request, id)).content);
  expect(imgs).toHaveLength(1);
  expect(imgs[0].uploadId ?? null).toBeNull();
  expect(imgs[0].attachmentId).toMatch(/^[0-9a-f-]{36}$/);
  expect(imgs[0].alt).toBe('Схема цеха');
  // the stored original is the pasted file
  const orig = await page.request.get(`/api/v1/attachments/${imgs[0].attachmentId}/download`);
  expect(orig.ok()).toBeTruthy();
  expect(Buffer.from(await orig.body()).equals(Buffer.from(PNG_B64, 'base64'))).toBe(true);
  // completing the upload is not an undo step: Ctrl+Z does not turn the image back into a placeholder
  await editor(page).focus();
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  await page.keyboard.press('Control+z');
  await expect(img).toBeVisible();
  await expect(ph).toHaveCount(0);
});

test('closing the tab during an image upload: the block and the file are restored and the upload finishes on next open (UX13-03, R-MEDIA-006)', async ({ page, context }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Закрытая вкладка');
  // the upload never completes in this tab
  await page.route('**/api/v1/attachments', () => undefined);
  await pasteImage(page, 'image.png');
  await expect(editor(page).locator('.kb-upload.is-image')).toBeVisible();
  await expectSaved(page);
  expect(images((await apiContent(page.request, id)).content)[0].uploadId).toBeTruthy();
  await page.close();

  const p2 = await context.newPage();
  await p2.goto('/p/' + id);
  const img = editor(p2).locator('.kb-image-block img');
  await expect(img).toHaveAttribute('src', /\/api\/v1\/attachments\/[0-9a-f-]{36}\/content/, { timeout: 20_000 });
  await expectSaved(p2);
  const imgs = images((await apiContent(p2.request, id)).content);
  expect(imgs).toHaveLength(1);
  expect(imgs[0].uploadId ?? null).toBeNull();
  expect(imgs[0].attachmentId).toMatch(/^[0-9a-f-]{36}$/);
  expect(imgs[0].alt).toBe('Изображение');
  // the restored file is byte-exact
  const orig = await p2.request.get(`/api/v1/attachments/${imgs[0].attachmentId}/download`);
  expect(Buffer.from(await orig.body()).equals(Buffer.from(PNG_B64, 'base64'))).toBe(true);
});

test('cancelling an upload removes only that block (R-MEDIA-006)', async ({ page }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Отмена загрузки');
  await page.keyboard.type('Текст остаётся');
  await page.keyboard.press('Enter');
  await page.route('**/api/v1/attachments', () => undefined);
  await pasteImage(page, 'Лишнее.png');
  const ph = editor(page).locator('.kb-upload.is-image');
  await expect(ph).toBeVisible();
  await ph.getByRole('button', { name: 'Отменить' }).click();
  await expect(ph).toHaveCount(0);
  await expectSaved(page);
  const c = await apiContent(page.request, id);
  expect(images(c.content)).toHaveLength(0);
  expect(JSON.stringify(c.content)).toContain('Текст остаётся');
});
