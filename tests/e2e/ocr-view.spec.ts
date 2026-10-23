import { test, expect } from '@playwright/test';
import { ensureOwner, newPage, editor, expectSaved } from './helpers';

const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP8z4AATAxkCAEAJ9cBD8JfOs4AAAAASUVORK5CYII=';

test('SC-22: the OCR view shows the original image, confidence with uncertain words, corrections and provenance', async ({ page }) => {
  await ensureOwner(page);
  await newPage(page, 'Распознавание');
  await page.keyboard.type('Скан счёта');
  await page.keyboard.press('Enter');
  await page.evaluate((b64) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bin], 'счёт.png', { type: 'image/png' }));
    (document.activeElement ?? document.querySelector('.kb-editor'))!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, PNG_B64);
  const img = editor(page).locator('.kb-image-block img');
  await expect(img).toHaveAttribute('src', /\/api\/v1\/attachments\/[0-9a-f-]+\/content/, { timeout: 15_000 });
  await expectSaved(page);
  const attId = /attachments\/([0-9a-f-]+)\/content/.exec((await img.getAttribute('src'))!)![1];

  // The recognition result as the OCR worker stores it (the e2e server runs without the OCR engine).
  let corrected: string | null = null;
  await page.route(`**/api/v1/attachments/${attId}/ocr`, async (route) => {
    if (route.request().method() === 'PATCH') {
      corrected = route.request().postDataJSON().correctedText;
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ocr: {
          status: 'done',
          text: 'Счёт № 12З',
          correctedText: corrected,
          correctedBy: corrected ? 'Анна Владелец' : null,
          correctedAt: corrected ? new Date().toISOString() : null,
          confidence: 64,
          words: [
            { text: 'Счёт', confidence: 91 },
            { text: '№', confidence: 88 },
            { text: '12З', confidence: 31 },
          ],
          createdAt: new Date().toISOString(),
          version: 1,
          imageVersion: 1,
          stale: false,
          languages: 'rus+eng',
          engine: 'Tesseract OCR (на сервере)',
          originalUrl: `/api/v1/attachments/${attId}/content?variant=original&v=1`,
          canEdit: true,
          history: [{ id: 'h1', status: 'done', confidence: 64, version: 1, createdAt: new Date().toISOString() }, { id: 'h0', status: 'error', confidence: null, version: 1, createdAt: new Date().toISOString() }],
        },
      }),
    });
  });
  await img.click();
  await page.getByRole('button', { name: 'Распознанный текст (OCR)' }).click();
  const dlg = page.getByTestId('ocr-dialog');
  await expect(dlg.getByRole('img', { name: 'Исходное изображение' })).toHaveAttribute('src', new RegExp(`${attId}/content\\?variant=original`));
  await expect(dlg.getByTestId('ocr-quality')).toContainText('Уверенность 64%');
  await expect(dlg.getByTestId('ocr-quality')).toContainText('Сомнительных слов: 1');
  await expect(dlg).toContainText('Качество распознавания низкое');
  await expect(dlg.getByTestId('ocr-provenance')).toContainText('Tesseract OCR (на сервере), языки rus, eng');
  await expect(dlg.getByTestId('ocr-provenance')).toContainText('Исправлениянет');
  await expect(dlg.getByTestId('ocr-provenance')).toContainText('Попытки2');
  await page.getByRole('tab', { name: 'Распознано автоматически' }).click();
  await expect(dlg.getByTestId('ocr-machine').locator('.ocr-low')).toHaveText('12З ');
  await page.getByRole('tab', { name: 'Текст для поиска' }).click();
  await page.getByRole('textbox', { name: 'Распознанный текст' }).fill('Счёт № 123');
  // R-UI-062: an accidental close (Esc, ×) of the dialog with unsaved corrections asks first
  await page.keyboard.press('Escape');
  const ask = page.getByRole('alertdialog', { name: 'Несохранённые данные' });
  await expect(ask).toContainText('Исправления текста не сохранены');
  await expect(dlg).toBeVisible();
  await ask.getByRole('button', { name: 'Вернуться' }).click();
  await expect(ask).toBeHidden();
  await expect(page.getByRole('textbox', { name: 'Распознанный текст' })).toHaveValue('Счёт № 123');
  await page.getByRole('button', { name: 'Сохранить исправления' }).click();
  await expect(page.locator('.toast').filter({ hasText: 'Исправленный текст сохранён' })).toBeVisible();
  expect(corrected).toBe('Счёт № 123');
  await expect(dlg.getByTestId('ocr-quality')).toContainText('Исправлено вручную');
  await expect(dlg.getByTestId('ocr-provenance')).toContainText('Анна Владелец');
  await expect(page.getByRole('button', { name: 'Вернуть распознанный текст' })).toBeVisible();
});

test('R-UI-062: a dialog with typed critical input warns before closing; closing without saving is an explicit choice', async ({ page }) => {
  await ensureOwner(page);
  await newPage(page, 'Диалог с черновиком');
  await page.keyboard.type('Текст');
  await expectSaved(page);
  await page.locator('.page-header-bar').getByRole('button', { name: 'Действия со страницей' }).click();
  await page.getByRole('menuitem', { name: 'История версий' }).click();
  await page.getByRole('complementary', { name: 'Боковая панель' }).getByRole('button', { name: /Сохранить версию/ }).click();
  const dlg = page.getByRole('dialog', { name: 'Сохранить версию' });
  await dlg.getByRole('textbox').fill('Важная подпись версии');
  await dlg.getByRole('button', { name: 'Закрыть' }).click();
  const ask = page.getByRole('alertdialog', { name: 'Несохранённые данные' });
  await expect(ask).toBeVisible();
  await page.mouse.click(5, 5); // outside: still asks, does not close
  await expect(dlg).toBeVisible();
  await ask.getByRole('button', { name: 'Закрыть без сохранения' }).click();
  await expect(dlg).toBeHidden();
  // an empty dialog closes at once
  await page.getByRole('complementary', { name: 'Боковая панель' }).getByRole('button', { name: /Сохранить версию/ }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Сохранить версию' })).toBeHidden();
});
