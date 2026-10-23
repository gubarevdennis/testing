import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { ensureOwner, editor, expectSaved, apiContent, caretIn } from './helpers';
import { newPage, cleanupCreatedPages, settle } from './editor-p0-helpers';

/**
 * Undo / redo of every kind of operation as its own step (R-HISTORY-017): no pauses between the actions — the
 * operations must not be merged with the typing around them by the 500 ms capture window of the undo manager.
 * Typing, formatting, conversion, image resize (handle and presets), table column resize, block move; platform keys
 * (Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y here, ⌘Z / ⌘⇧Z with a macOS platform).
 */
test.describe.configure({ mode: 'serial' });
cleanupCreatedPages();

const json = (page: Page) => page.evaluate(() => (window as any).__kbEditor.getJSON());
const PNG = readFileSync('tests/fixtures/clipboard/blue-400x200.png');

async function open(page: Page, title: string, content?: unknown[]) {
  await ensureOwner(page);
  await page.evaluate(() => localStorage.setItem('kb:debug', '1'));
  const id = await newPage(page, title);
  await page.waitForFunction(() => (window as any).__kbEditor);
  if (content) {
    await page.evaluate((c) => (window as any).__kbEditor.chain().setContent({ type: 'doc', content: c }).run(), content as any);
    await expectSaved(page);
    await page.waitForTimeout(600); // the setup is not part of the tested history
  }
  return id;
}

test('typing, formatting, conversion and typing again are separate undo steps without pauses (R-HISTORY-017)', async ({ page }) => {
  const id = await open(page, 'Отмена: формат и тип');
  const ed = editor(page);
  await page.keyboard.type('Важное правило');
  // immediately: bold on the word "Важное"
  // select the first word (as Shift+Ctrl+→ would) without waiting
  await page.evaluate(() => (window as any).__kbEditor.commands.setTextSelection({ from: 1, to: 7 }));
  await page.keyboard.press('Control+b');
  await expect(ed.locator('strong')).toHaveText(/Важное/);
  // immediately: turn into a heading (Ctrl+Alt+2) and type more
  await page.keyboard.press('End');
  await settle(page);
  await page.keyboard.press('Control+Alt+2');
  await expect(ed.locator('h2')).toHaveCount(1);
  await page.keyboard.type(' склада');
  await expect(ed.locator('h2')).toHaveText('Важное правило склада');

  await page.keyboard.press('Control+z'); // the last typing
  await expect(ed.locator('h2')).toHaveText('Важное правило');
  await page.keyboard.press('Control+z'); // the conversion
  await expect(ed.locator('h2')).toHaveCount(0);
  await expect(ed.locator('p strong')).toHaveCount(1);
  await page.keyboard.press('Control+z'); // the formatting
  await expect(ed.locator('strong')).toHaveCount(0);
  await expect(ed.locator('p').first()).toHaveText('Важное правило');
  await page.keyboard.press('Control+z'); // the first typing
  await expect(ed.locator('p').first()).toHaveText('');
  // redo with both platform-neutral keys of Windows / Linux
  await page.keyboard.press('Control+Shift+z');
  await expect(ed.locator('p').first()).toHaveText('Важное правило');
  await page.keyboard.press('Control+y');
  await expect(ed.locator('strong')).toHaveCount(1);
  await page.keyboard.press('Control+y');
  await expect(ed.locator('h2')).toHaveText('Важное правило');
  await expectSaved(page);
  const c = (await apiContent(page.request, id)).content.content as any[];
  expect(c[0]).toMatchObject({ type: 'heading', attrs: { level: 2 } });
});

test('image resize by the handle and by a preset, table column resize: each is one undo step (R-HISTORY-017, R-EDITOR-052)', async ({ page }) => {
  await ensureOwner(page);
  await page.evaluate(() => localStorage.setItem('kb:debug', '1'));
  const id = await newPage(page, 'Отмена: размеры');
  const csrf = (await page.context().storageState()).cookies.find((c) => c.name === 'kb_csrf')?.value ?? '';
  const up = await page.request.post('/api/v1/attachments', { multipart: { pageId: id, file: { name: 'схема.png', mimeType: 'image/png', buffer: PNG } }, headers: { 'x-csrf-token': csrf } });
  const att = (await up.json()).attachments[0];
  await page.waitForFunction(() => (window as any).__kbEditor);
  const cell = (t: string) => ({ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });
  await page.evaluate(
    (c) => (window as any).__kbEditor.chain().setContent({ type: 'doc', content: c }).run(),
    [
      { type: 'paragraph', content: [{ type: 'text', text: 'Над картинкой' }] },
      { type: 'image', attrs: { id: 'img', src: att.contentUrl, attachmentId: att.id, alt: 'Схема', naturalWidth: 400, naturalHeight: 200, width: 400 } },
      { type: 'table', attrs: { id: 't' }, content: [{ type: 'tableRow', content: [cell('Склад'), cell('Остаток')] }, { type: 'tableRow', content: [cell('Москва'), cell('42')] }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Под таблицей' }] },
    ] as any,
  );
  await expectSaved(page);
  await page.waitForTimeout(600);
  const ed = editor(page);
  const imgWidth = async () => ((await json(page)).content as any[]).find((n) => n.type === 'image').attrs.width;

  // typing, then immediately a drag-resize of the image by its right handle
  await caretIn(page, 'Над картинкой');
  await page.keyboard.press('End');
  await page.keyboard.type(' (схема)');
  const fig = ed.locator('.kb-image-block');
  await fig.hover();
  const handle = fig.locator('.kb-resize.right');
  const h = (await handle.boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x - 60, h.y + h.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect.poll(imgWidth).toBeLessThan(400);
  const resized = await imgWidth();
  await page.keyboard.press('Control+z');
  await expect.poll(imgWidth).toBe(400);
  await expect(ed.locator('p', { hasText: 'Над картинкой (схема)' })).toHaveCount(1); // the typing is a separate step
  await page.keyboard.press('Control+y');
  await expect.poll(imgWidth).toBe(resized);

  // a preset (50 %) from the image toolbar
  await fig.locator('img').click();
  await page.getByRole('button', { name: '50%' }).click();
  await expect.poll(imgWidth).not.toBe(resized);
  await page.keyboard.press('Control+z');
  await expect.poll(imgWidth).toBe(resized);

  // table column resize: drag the border between the columns
  const first = ed.locator('td', { hasText: 'Склад' });
  const b = (await first.boundingBox())!;
  await page.mouse.move(b.x + b.width - 2, b.y + b.height / 2);
  await expect(ed.locator('.column-resize-handle').first()).toBeAttached(); // one per row
  await page.mouse.down();
  await page.mouse.move(b.x + b.width + 80, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
  const colwidth = async () => ((await json(page)).content as any[]).find((n) => n.type === 'table').content[0].content[0].attrs.colwidth;
  await expect.poll(colwidth).not.toBeNull();
  await settle(page);
  await ed.locator('p', { hasText: 'Под таблицей' }).click();
  await page.keyboard.press('Control+z');
  await expect.poll(colwidth).toBeNull();
  await expect.poll(imgWidth).toBe(resized);
  await expectSaved(page);
});

test('macOS keys: ⌘Z undoes, ⌘⇧Z redoes (R-HISTORY-017)', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'platform', { get: () => 'MacIntel' }));
  await open(page, 'Отмена: Mac');
  const ed = editor(page);
  await page.keyboard.type('Первая строка');
  await page.waitForTimeout(600);
  await page.keyboard.type(' и продолжение');
  await page.keyboard.press('Meta+z');
  await expect(ed.locator('p').first()).toHaveText('Первая строка');
  await page.keyboard.press('Meta+Shift+z');
  await expect(ed.locator('p').first()).toHaveText('Первая строка и продолжение');
  // (Ctrl+Z is not bound on a Mac; this Linux browser would run its own native undo, so it is not pressed here)
  // the undo buttons / tooltips show the Mac notation
  expect(await page.evaluate(() => navigator.platform)).toBe('MacIntel');
});
