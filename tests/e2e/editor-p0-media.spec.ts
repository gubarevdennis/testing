import { test, expect, type Page } from '@playwright/test';
import { ensureOwner, editor, expectSaved, apiContent } from './helpers';
import { newPage, cleanupCreatedPages } from './editor-p0-helpers';

test.describe.configure({ mode: 'serial' });
cleanupCreatedPages();

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
  // the indicator does not claim «Сохранено» while the file is still uploading…
  await expect(page.locator('.sync-status')).toHaveText(/Загрузка файлов/);
  // …but the block itself is already stored on the server
  await expect.poll(async () => images((await apiContent(page.request, id)).content)[0]?.uploadId ?? null, { timeout: 15_000 }).toBeTruthy();
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

test('image by URL: dialog with preview, internal addresses refused, the image is stored as an attachment of the page (R-MEDIA-009)', async ({ page }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Картинка по ссылке');
  await page.keyboard.type('/изображ');
  await page.getByRole('option', { name: /Изображение по ссылке/ }).click();
  const dlg = page.getByRole('dialog', { name: 'Изображение по ссылке' });
  await expect(dlg).toBeVisible();
  const input = dlg.getByLabel('Адрес изображения');
  await input.fill('не ссылка');
  await expect(dlg.getByRole('button', { name: 'Вставить' })).toBeDisabled();
  // an address inside the company network is refused by the server (SSRF guard), the dialog stays open
  await input.fill('http://169.254.169.254/latest/meta-data/logo.png');
  await dlg.getByRole('button', { name: 'Вставить' }).click();
  await expect(dlg.getByRole('alert')).toContainText('внутренней сети');
  await expect(dlg).toBeVisible();
  // success path: the server answers with the stored attachment (the e2e server has no Internet access)
  const csrf = (await page.context().storageState()).cookies.find((c) => c.name === 'kb_csrf')?.value ?? '';
  const up = await page.request.post('/api/v1/attachments', { multipart: { pageId: id, file: { name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from(PNG_B64, 'base64') } }, headers: { 'x-csrf-token': csrf } });
  expect(up.ok()).toBeTruthy();
  const att = (await up.json()).attachments[0];
  let sent: any = null;
  await page.route('**/api/v1/attachments/from-url', async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ attachment: att }) });
  });
  await input.fill('https://cdn.example.com/brand/Логотип_компании.png');
  await expect(dlg.locator('.image-url-preview')).toBeVisible();
  await dlg.getByRole('button', { name: 'Вставить' }).click();
  await expect(dlg).toBeHidden();
  expect(sent).toEqual({ url: 'https://cdn.example.com/brand/Логотип_компании.png', pageId: id });
  await expect(editor(page).locator('.kb-image-block img')).toHaveAttribute('src', new RegExp(`/api/v1/attachments/${att.id}/content`));
  await expectSaved(page);
  const imgs = images((await apiContent(page.request, id)).content);
  expect(imgs).toHaveLength(1);
  expect(imgs[0]).toMatchObject({ attachmentId: att.id, alt: 'Логотип компании' });
});

test('an image file dropped onto the page appears at once with a local preview and is stored as an attachment (R-MEDIA-009)', async ({ page }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Перетаскивание файла');
  await page.keyboard.type('Текст над картинкой');
  await page.route('**/api/v1/attachments', async (route) => {
    await new Promise((r) => setTimeout(r, 800)); // a slow network: the preview must not wait for it
    await route.continue();
  });
  const box = (await editor(page).locator('p').first().boundingBox())!;
  await page.evaluate(
    ({ b64, x, y }) => {
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bin], 'Перетащенная схема.png', { type: 'image/png' }));
      document.querySelector('.kb-editor')!.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, clientX: x, clientY: y, bubbles: true, cancelable: true }));
    },
    { b64: PNG_B64, x: box.x + box.width / 2, y: box.y + box.height - 2 },
  );
  // instant: the block with the local preview and progress is there before the server answered
  const ph = editor(page).locator('.kb-upload.is-image');
  await expect(ph).toBeVisible({ timeout: 700 });
  await expect(ph.locator('img')).toHaveAttribute('src', /^blob:/);
  await expect(ph.getByRole('status')).toContainText(/Загрузка/);
  await expect(editor(page).locator('.kb-image-block img')).toHaveAttribute('src', /\/api\/v1\/attachments\/[0-9a-f-]{36}\/content/, { timeout: 20_000 });
  await expectSaved(page);
  const imgs = images((await apiContent(page.request, id)).content);
  expect(imgs).toHaveLength(1);
  expect(imgs[0]).toMatchObject({ alt: 'Перетащенная схема' });
  expect(imgs[0].attachmentId).toMatch(/^[0-9a-f-]{36}$/);
});
