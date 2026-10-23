import { test, expect, type Page } from '@playwright/test';
import { ensureOwner, editor, expectSaved, apiContent, paste, caretIn } from './helpers';
import { newPage, cleanupCreatedPages, settle } from './editor-p0-helpers';

test.describe.configure({ mode: 'serial' });
cleanupCreatedPages();

async function grantClipboard(page: Page) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(page.url()).origin });
}

async function readClipboard(page: Page) {
  return page.evaluate(async () => {
    const out: Record<string, string> = {};
    for (const item of await navigator.clipboard.read()) for (const t of item.types) out[t] = await (await item.getType(t)).text();
    return out;
  });
}

const WEB = `<meta charset="utf-8"><h2 style="color:#123456;font-family:Comic Sans MS">Условия поставки</h2>
<p onclick="alert(1)">Срок — <strong>5 дней</strong>, <span style="color:#ff00ff;background:#00ff00">цветной текст</span>,
<a href="https://partner.example/terms?utm_source=newsletter&amp;utm_medium=email&amp;fbclid=XYZ&amp;section=2">условия</a>.</p>
<script>window.__pwned = true</script><img src="https://mc.yandex.ru/watch/42" width="88" height="31">
<ul><li>Первый пункт</li><li>Второй пункт</li></ul>`;

const WEB_TEXT = 'Условия поставки\nСрок — 5 дней, цветной текст, условия.\nПервый пункт\nВторой пункт';

test('paste options: «Сохранить форматирование», «Объединить», «Только текст»; scripts and trackers removed (R-CLIPBOARD-009, R-CLIPBOARD-024)', async ({ page }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Параметры вставки');
  await page.keyboard.type('До вставки');
  await page.keyboard.press('Enter');
  await paste(page, { 'text/html': WEB, 'text/plain': WEB_TEXT });
  const ed = editor(page);
  await expect(ed.locator('h2', { hasText: 'Условия поставки' })).toHaveCount(1);
  expect(await page.evaluate(() => (window as any).__pwned)).toBeUndefined();
  await expect(ed.locator('[onclick]')).toHaveCount(0);
  await expect(ed.locator('img')).toHaveCount(0); // counter pixel dropped
  await expect(ed.locator('a', { hasText: 'условия' })).toHaveAttribute('href', 'https://partner.example/terms?section=2');
  const opts = page.getByRole('toolbar', { name: 'Параметры вставки' });
  await expect(opts).toBeVisible();
  await expect(opts.getByRole('button', { name: 'Сохранить форматирование' })).toHaveAttribute('aria-pressed', 'true');

  // «Только текст»
  await opts.getByRole('button', { name: 'Только текст' }).click();
  await expect(ed.locator('h2')).toHaveCount(0);
  await expect(ed.locator('strong')).toHaveCount(0);
  await expect(ed.locator('ul')).toHaveCount(0);
  await expect(ed.locator('p', { hasText: 'Условия поставки' })).toHaveCount(1);
  await expect(ed.locator('p', { hasText: 'Первый пункт' })).toHaveCount(1);
  await expect(ed.locator('p').first()).toHaveText('До вставки');

  // «Объединить»: structure and emphasis stay, the heading takes the page's paragraph style
  await opts.getByRole('button', { name: 'Объединить' }).click();
  await expect(ed.locator('h2')).toHaveCount(0);
  await expect(ed.locator('p', { hasText: 'Условия поставки' })).toHaveCount(1);
  await expect(ed.locator('strong', { hasText: '5 дней' })).toHaveCount(1);
  await expect(ed.locator('ul li')).toHaveCount(2);
  await expect(ed.locator('a', { hasText: 'условия' })).toHaveCount(1);

  // back to «Сохранить форматирование»
  await opts.getByRole('button', { name: 'Сохранить форматирование' }).click();
  await expect(ed.locator('h2', { hasText: 'Условия поставки' })).toHaveCount(1);
  await expect(ed.locator('p', { hasText: 'Условия поставки' })).toHaveCount(0);
  await expect(ed.locator('p').first()).toHaveText('До вставки');

  // typing continues after the pasted content and closes the offer
  await page.keyboard.type('!');
  await expect(opts).toBeHidden();
  await expectSaved(page);
  const c = JSON.stringify((await apiContent(page.request, id)).content);
  expect(c).toContain('"level":2');
  expect(c).not.toContain('utm_');
  expect(c).not.toContain('fbclid');
  expect(c).not.toContain('#ff00ff');
  expect(c).not.toContain('Comic');

  // Esc closes the offer without changing the paste
  await page.keyboard.press('Enter');
  await paste(page, { 'text/html': '<p><em>Курсив</em></p>', 'text/plain': 'Курсив' });
  await expect(opts).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(opts).toBeHidden();
  await expect(ed.locator('em', { hasText: 'Курсив' })).toHaveCount(1);
});

test('copy: a text selection, a block and a section of a heading go to the clipboard as text/html and text/plain (R-CLIPBOARD-001)', async ({ page }) => {
  await ensureOwner(page);
  await newPage(page, 'Копирование разделов');
  await grantClipboard(page);
  await page.keyboard.type('## Приёмка');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Проверить **накладную** и ');
  await page.keyboard.press('Enter');
  await page.keyboard.type('### Пересчёт');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Пересчитать места');
  await page.keyboard.press('Enter');
  await page.keyboard.type('## Отгрузка');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Не входит в раздел');
  const ed = editor(page);
  await expect(ed.locator('strong', { hasText: 'накладную' })).toHaveCount(1);

  // 1. Ctrl+C of a text selection
  await caretIn(page, 'Пересчитать места');
  await settle(page);
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+c');
  let clip = await readClipboard(page);
  expect(clip['text/plain']).toBe('Пересчитать места');
  expect(clip['text/html']).toContain('Пересчитать места');

  // 2. block menu → «Копировать блок»
  await ed.locator('p', { hasText: 'Проверить' }).hover();
  await page.getByRole('button', { name: 'Действия с блоком' }).click();
  await page.getByRole('menuitem', { name: 'Копировать блок' }).click();
  await expect(page.getByText('Блок скопирован')).toBeVisible();
  clip = await readClipboard(page);
  expect(clip['text/plain'].trim()).toBe('Проверить накладную и');
  expect(clip['text/html']).toMatch(/<strong>накладную<\/strong>/);

  // 3. heading → «Копировать раздел»: the heading, its text and subsections, not the next section
  await ed.locator('h2', { hasText: 'Приёмка' }).hover();
  await page.getByRole('button', { name: 'Действия с блоком' }).click();
  await page.getByRole('menuitem', { name: 'Копировать раздел' }).click();
  await expect(page.getByText('Раздел скопирован')).toBeVisible();
  clip = await readClipboard(page);
  expect(clip['text/plain']).toContain('Приёмка');
  expect(clip['text/plain']).toContain('Пересчитать места');
  expect(clip['text/plain']).not.toContain('Отгрузка');
  expect(clip['text/html']).toMatch(/<h2[^>]*>Приёмка<\/h2>/);
  expect(clip['text/html']).toMatch(/<h3[^>]*>Пересчёт<\/h3>/);
  expect(clip['text/html']).not.toContain('Не входит в раздел');
  // portable HTML: no editor-internal ids
  expect(clip['text/html']).not.toMatch(/\sid="/);

  // 4. a copied section pastes back into another page with the same structure
  const id2 = await newPage(page, 'Вставка раздела');
  await paste(page, { 'text/html': clip['text/html'], 'text/plain': clip['text/plain'] });
  await expect(editor(page).locator('h2', { hasText: 'Приёмка' })).toHaveCount(1);
  await expect(editor(page).locator('h3', { hasText: 'Пересчёт' })).toHaveCount(1);
  await expect(editor(page).locator('strong', { hasText: 'накладную' })).toHaveCount(1);
  await expectSaved(page);
  expect(JSON.stringify((await apiContent(page.request, id2)).content)).toContain('Пересчитать места');
});

const PNG_URI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP8z4AATAxkCAEAJ9cBD8JfOs4AAAAASUVORK5CYII=';

test('a multi-page document with tables, images and links is pasted with its structure, and one Undo returns the page to its original state (V17-F01)', async ({ page }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Многостраничная вставка');
  await page.keyboard.type('Исходный текст');
  await page.keyboard.press('Enter');
  await expectSaved(page);
  const original = (await apiContent(page.request, id)).content;
  const sections = Array.from({ length: 30 }, (_, i) => {
    const paras = Array.from({ length: 6 }, (_, j) => `<p>Раздел ${i + 1}, абзац ${j + 1}: требования к приёмке и хранению, см. <a href="https://example.com/norm/${i}-${j}">норматив ${i + 1}.${j + 1}</a>.</p>`).join('');
    const table = `<table><tr><th>Позиция</th><th>Кол-во</th></tr><tr><td>Товар ${i + 1}</td><td>${(i + 1) * 10}</td></tr></table>`;
    const img = i % 15 === 0 ? `<p><img src="${PNG_URI}" alt="Схема ${i + 1}"></p>` : '';
    return `<h2>Раздел ${i + 1}</h2>${paras}${table}${img}`;
  }).join('');
  const html = `<meta charset="utf-8">${sections}`;
  const text = sections.replace(/<[^>]+>/g, ' ');
  expect(text.length).toBeGreaterThan(9000); // ~ 4–5 pages
  await paste(page, { 'text/html': html, 'text/plain': text });
  const ed = editor(page);
  await expect(ed.locator('h2')).toHaveCount(30, { timeout: 20_000 });
  await expect(ed.locator('table')).toHaveCount(30);
  await expect(ed.locator('a[href^="https://example.com/norm/"]')).toHaveCount(180);
  // embedded images become attachments of the page
  await expect(ed.locator('.kb-image-block img[src*="/api/v1/attachments/"]')).toHaveCount(2, { timeout: 20_000 });
  await expect(ed.locator('p').first()).toHaveText('Исходный текст');
  await expectSaved(page);
  const pasted = JSON.stringify((await apiContent(page.request, id)).content);
  expect(pasted).toContain('Раздел 30, абзац 6');
  expect(pasted.match(/"type":"table"/g)).toHaveLength(30);
  expect(pasted.match(/"attachmentId":"[0-9a-f-]{36}"/g)).toHaveLength(2);
  // one Undo: exactly the state before the paste
  await editor(page).focus();
  await page.keyboard.press('Control+z');
  await expect(ed.locator('h2')).toHaveCount(0);
  await expect(ed.locator('table')).toHaveCount(0);
  await expect(ed.locator('.kb-image-block')).toHaveCount(0);
  await expect(ed.locator('p').first()).toHaveText('Исходный текст');
  await expectSaved(page);
  const after = (await apiContent(page.request, id)).content;
  const text0 = (d: any) => JSON.stringify(d.content.map((n: any) => [n.type, (n.content ?? []).map((x: any) => x.text ?? '').join('')]));
  expect(text0(after)).toBe(text0(original));
  // and Redo brings the whole paste back
  await page.keyboard.press('Control+Shift+z');
  await expect(ed.locator('h2')).toHaveCount(30);
  await expect(ed.locator('table')).toHaveCount(30);
});
