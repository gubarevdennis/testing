import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ensureOwner, editor, expectSaved, apiContent, paste, caretIn } from './helpers';
import { newPage, cleanupCreatedPages, settle } from './editor-p0-helpers';
import { outline } from '../support/doc-outline';

/**
 * Clipboard fidelity in the browser (R-CLIPBOARD-018, R-CLIPBOARD-020, R-CLIPBOARD-024, SC-06, UX13-02):
 *  - realistic Word 365 (HTML + RTF of one copy), RTF-only, Google Docs, Outlook and web-page clipboards
 *    (tests/fixtures/clipboard) keep their structure: the server copy is compared line by line;
 *  - copy / cut / paste between articles with real Ctrl+C / Ctrl+X / Ctrl+V uses the internal format: same node
 *    types, block ids and attributes; images become attachments of the target page.
 */
test.describe.configure({ mode: 'serial' });
cleanupCreatedPages();

const fx = (name: string) => readFileSync(join('tests/fixtures/clipboard', name), 'utf8');
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP8z4AATAxkCAEAJ9cBD8JfOs4AAAAASUVORK5CYII=';
const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

const WORD_EXPECTED = [
  'h1 Регламент приёмки товара',
  'h2 1. Общие положения',
  'h3 1.1. Область применения',
  'h4 1.1.1. Термины',
  'h5 Примечание к терминам',
  'p Документ описывает порядок приёмки и сроки хранения, см. регламент.',
  'ul>li Проверить документы',
  'ul>li>ul>li Накладная ТОРГ-12',
  'ul>li>ul>li>ul>li Подпись кладовщика',
  'ul>li Пересчитать товар',
  'ol>li Разгрузить машину',
  'ol>li Разместить на стеллаже',
  'table [Артикул|Количество][A-100|42]',
  'img caption=Рисунок 1. Схема зоны приёмки',
];

async function serverOutline(page: Page, id: string) {
  await expectSaved(page);
  return outline((await apiContent(page.request, id)).content);
}

test('Word 365: HTML + RTF of one copy — five heading levels, nested lists, table, link, picture from the RTF with its caption (UX13-02, R-CLIPBOARD-020, SC-06)', async ({ page }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Word: регламент');
  await editor(page).click();
  await paste(page, { 'text/html': fx('word365-reglament.html'), 'text/rtf': fx('word365-reglament.rtf'), 'text/plain': 'Регламент приёмки товара' });
  const ed = editor(page);
  await expect(ed.locator('h5')).toHaveText('Примечание к терминам');
  // the picture is uploaded in place (not at the end), the caption is the picture's caption
  const img = ed.locator('.kb-image-block img');
  await expect(img).toHaveAttribute('src', /\/api\/v1\/attachments\/[0-9a-f-]{36}\/content/, { timeout: 20_000 });
  await expect(ed.locator('.kb-image-block .kb-caption-input')).toHaveValue('Рисунок 1. Схема зоны приёмки');
  await expect(page.getByText(/не удалось перенести из буфера/)).toHaveCount(0);
  const lines = await serverOutline(page, id);
  expect(lines.slice(0, WORD_EXPECTED.length)).toEqual(WORD_EXPECTED);
  expect(lines).toContain('quote>p Принятый товар считается переданным на ответственное хранение.');
  expect(lines).toContain('link регламент -> https://example.com/reglament');
  const json = JSON.stringify((await apiContent(page.request, id)).content);
  expect(json).toMatch(/"attachmentId":"[0-9a-f-]{36}"/);
  expect(json).not.toMatch(/mso|Calibri|file:|utm_|data:image|kb-paste-image/i);
  // one Undo removes the whole paste
  await ed.focus();
  await page.keyboard.press(`${mod}+z`);
  await expect(ed.locator('h1')).toHaveCount(0);
  await expect(ed.locator('table')).toHaveCount(0);
});

test('RTF-only clipboard (WordPad / Outlook): the same structure (R-CLIPBOARD-020)', async ({ page }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'RTF: регламент');
  await editor(page).click();
  await paste(page, { 'text/rtf': fx('word365-reglament.rtf'), 'text/plain': 'Регламент приёмки товара' });
  await expect(editor(page).locator('.kb-image-block img')).toHaveAttribute('src', /\/api\/v1\/attachments\//, { timeout: 20_000 });
  const lines = await serverOutline(page, id);
  expect(lines.slice(0, WORD_EXPECTED.length)).toEqual(WORD_EXPECTED);
  expect(JSON.stringify((await apiContent(page.request, id)).content)).toContain('"bold"');
});

test('Google Docs: H1–H6, nested lists, table, unwrapped links; its picture is copied to the server (R-CLIPBOARD-020, SC-06)', async ({ page }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Google Docs: инструкция');
  const csrf = (await page.context().storageState()).cookies.find((c) => c.name === 'kb_csrf')?.value ?? '';
  // the test server has no Internet access: the server-side fetch answers with a stored attachment
  const up = await page.request.post('/api/v1/attachments', { multipart: { pageId: id, file: { name: 'plan.png', mimeType: 'image/png', buffer: Buffer.from(PNG_B64, 'base64') } }, headers: { 'x-csrf-token': csrf } });
  const att = (await up.json()).attachments[0];
  const fetched: string[] = [];
  await page.route('**/api/v1/attachments/from-url', async (route) => {
    fetched.push(route.request().postDataJSON().url);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ attachment: att }) });
  });
  await editor(page).click();
  await paste(page, { 'text/html': fx('gdocs-reglament.html'), 'text/plain': 'Инструкция кладовщика' });
  await expect(editor(page).locator('h6')).toHaveText('Зарядка');
  await expect(editor(page).locator('.kb-image-block img')).toHaveAttribute('src', new RegExp(`/api/v1/attachments/${att.id}/content`), { timeout: 20_000 });
  expect(fetched).toEqual([expect.stringMatching(/^https:\/\/lh7-rt\.googleusercontent\.com\/docsz\//)]);
  const lines = await serverOutline(page, id);
  expect(lines.slice(0, 13)).toEqual([
    'h1 Инструкция кладовщика',
    'h2 Смена',
    'h3 Начало смены',
    'h4 Проверка оборудования',
    'h5 Сканеры',
    'h6 Зарядка',
    'p Перед началом смены обязательно прочитайте инструкцию по охране труда полностью.',
    'ul>li Получить сканер',
    'ul>li>ul>li Проверить заряд',
    'ul>li>ul>li>ul>li Не меньше 80 %',
    'ul>li Открыть смену в WMS',
    'ol>li Принять задания',
    'ol>li Распечатать этикетки',
  ]);
  expect(lines).toContain('table [Зона|Ответственный][Приёмка|Старший смены]');
  expect(lines).toContain('link инструкцию по охране труда -> https://example.com/safety');
  const json = JSON.stringify((await apiContent(page.request, id)).content);
  expect(json).not.toMatch(/googleusercontent|docs-internal|google\.com\/url|font-family/);
});

test('mail (Outlook) and a web article: structure kept, trackers / navigation / scripts removed (R-CLIPBOARD-020, R-CLIPBOARD-024, SC-06)', async ({ page }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Письмо и статья');
  await page.route('**/api/v1/attachments/from-url', (route) => route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: { code: 'remote_network', message: 'Не удалось получить изображение по ссылке' } }) }));
  await editor(page).click();
  await paste(page, { 'text/html': fx('outlook-mail.html'), 'text/plain': 'Коллеги, добрый день!' });
  await expect(editor(page).locator('blockquote')).toContainText('Исходное письмо');
  await page.keyboard.press(`${mod}+End`);
  await page.keyboard.press('Enter'); // an empty paragraph: the article starts a new block
  await paste(page, { 'text/html': fx('browser-article.html'), 'text/plain': 'Как ускорить приёмку' });
  await expect(editor(page).locator('pre')).toContainText('"status"');
  // the article picture could not be fetched: it stays a link to the other site and the user is told
  await expect(page.getByText(/оставленных внешними ссылками: 1/)).toBeVisible();
  const lines = await serverOutline(page, id);
  expect(lines).toEqual(
    expect.arrayContaining([
      'p С понедельника меняется график отгрузки. Подробности — в новости на портале.',
      'ul>li Самовывоз — по записи',
      'table [День|Окно][Пн–Пт|09:00–18:00]',
      'quote>p Исходное письмо: просим подтвердить окна отгрузки.',
      'h1 Как ускорить приёмку',
      'img caption=Рампа после модернизации alt=Разгрузочная рампа',
      'ol>li>ol>li Кольцевые',
      'code {"status": "ok"}',
      'table [Метрика|До|После][Время разгрузки|45 мин|28 мин]',
      'link новости на портале -> https://portal.example.ru/news/42?id=42',
      'link чек-лист -> https://blog.example.com/docs?ref=feed',
    ]),
  );
  const json = JSON.stringify((await apiContent(page.request, id)).content);
  expect(json).not.toMatch(/utm_|gclid|mc_cid|open\.gif|google-analytics|Главная|Поделиться|cid:/);
});

async function grantClipboard(page: Page) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(page.url()).origin });
}

test('copy / cut / paste between articles with the keyboard: types, ids, attributes kept; images become attachments of the target page; external apps get text/html + text/plain (R-CLIPBOARD-018, R-CLIPBOARD-024)', async ({ page }) => {
  await ensureOwner(page);
  await page.evaluate(() => localStorage.setItem('kb:debug', '1'));
  const a = await newPage(page, 'Источник копирования');
  await grantClipboard(page);
  const csrf = (await page.context().storageState()).cookies.find((c) => c.name === 'kb_csrf')?.value ?? '';
  const up = await page.request.post('/api/v1/attachments', { multipart: { pageId: a, file: { name: 'схема.png', mimeType: 'image/png', buffer: Buffer.from(PNG_B64, 'base64') } }, headers: { 'x-csrf-token': csrf } });
  const att = (await up.json()).attachments[0];
  await page.waitForFunction(() => (window as any).__kbEditor);
  const blocks = [
    { type: 'heading', attrs: { id: 'cp-h', level: 2 }, content: [{ type: 'text', text: 'Раздел для копирования' }] },
    { type: 'callout', attrs: { id: 'cp-k', variant: 'warning', icon: '🚚' }, content: [{ type: 'paragraph', attrs: { id: 'cp-k1' }, content: [{ type: 'text', text: 'Выноска с иконкой', marks: [{ type: 'bold' }] }] }] },
    { type: 'columns', attrs: { id: 'cp-c' }, content: [{ type: 'column', attrs: { width: 3 }, content: [{ type: 'paragraph', attrs: { id: 'cp-l' }, content: [{ type: 'text', text: 'Широкая' }] }] }, { type: 'column', attrs: { width: 1 }, content: [{ type: 'paragraph', attrs: { id: 'cp-r' }, content: [{ type: 'text', text: 'Узкая' }] }] }] },
    { type: 'image', attrs: { id: 'cp-img', src: att.contentUrl, attachmentId: att.id, alt: 'Схема', width: 8, align: 'left', caption: 'Подпись к схеме' } },
    { type: 'bulletList', attrs: { id: 'cp-list' }, content: [{ type: 'listItem', content: [{ type: 'paragraph', attrs: { id: 'cp-li' }, content: [{ type: 'text', text: 'Пункт' }] }, { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', attrs: { id: 'cp-sub' }, content: [{ type: 'text', text: 'Вложенный', marks: [{ type: 'link', attrs: { href: 'https://example.com/x' } }] }] }] }] }] }] },
    { type: 'paragraph', attrs: { id: 'cp-end' }, content: [{ type: 'text', text: 'Хвост' }] },
  ];
  await page.evaluate((c) => (window as any).__kbEditor.chain().setContent({ type: 'doc', content: c }).run(), blocks as any);
  await expectSaved(page);
  // select everything except the last paragraph and copy with the keyboard
  await page.evaluate(() => {
    const ed = (window as any).__kbEditor;
    let end = 0;
    ed.state.doc.forEach((n: any, off: number) => n.attrs.id === 'cp-end' && (end = off));
    ed.commands.setTextSelection({ from: 1, to: end - 1 });
    ed.commands.focus();
  });
  await page.keyboard.press(`${mod}+c`);
  // what other applications receive: text/html and text/plain (portable, no editor-only ids)
  const clip = await page.evaluate(async () => {
    const out: Record<string, string> = {};
    for (const item of await navigator.clipboard.read()) for (const t of item.types) out[t] = await (await item.getType(t)).text();
    return out;
  });
  expect(clip['text/plain']).toContain('Выноска с иконкой');
  expect(clip['text/html']).toMatch(/<h2[^>]*>Раздел для копирования<\/h2>/);
  expect(clip['text/html']).toContain(`${new URL(page.url()).origin}/api/v1/attachments/${att.id}/content`);
  expect(clip['text/html']).not.toMatch(/\sid="/);

  // paste into another article with Ctrl+V
  const b = await newPage(page, 'Цель копирования');
  await page.waitForFunction(() => (window as any).__kbEditor);
  await editor(page).click();
  await page.keyboard.press(`${mod}+v`);
  await expect(editor(page).locator('.kb-callout')).toContainText('Выноска с иконкой');
  // the image is rehomed: an attachment of page B (same bytes)
  const img = editor(page).locator('.kb-image-block img');
  await expect.poll(async () => (await img.getAttribute('src')) ?? '', { timeout: 20_000 }).not.toContain(att.id);
  await expectSaved(page);
  const got = ((await apiContent(page.request, b)).content.content as any[]).filter((n) => !(n.type === 'paragraph' && !n.content));
  expect(got.map((n) => n.attrs.id)).toEqual(['cp-h', 'cp-k', 'cp-c', 'cp-img', 'cp-list']);
  expect(got[1].attrs).toMatchObject({ variant: 'warning', icon: '🚚' });
  expect(got[2].content.map((c: any) => c.attrs.width)).toEqual([3, 1]);
  expect(got[3].attrs).toMatchObject({ alt: 'Схема', width: 8, align: 'left', caption: 'Подпись к схеме' });
  expect(got[3].attrs.attachmentId).not.toBe(att.id);
  const copy = await (await page.request.get(`/api/v1/attachments/${got[3].attrs.attachmentId}`)).json();
  expect(copy.attachment).toMatchObject({ pageId: b, sha256: att.sha256 });
  expect(JSON.stringify(got[4])).toContain('"href":"https://example.com/x"');
  expect(JSON.stringify(got[4])).toContain('"id":"cp-sub"');

  // cut a block on B and paste it back into A: removed from B, same id in A
  await caretIn(page, 'Широкая');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape'); // the column set
  await page.keyboard.press(`${mod}+x`);
  await expect(editor(page).locator('.kb-columns')).toHaveCount(0);
  await expectSaved(page);
  await page.goto('/p/' + a);
  await caretIn(page, 'Хвост');
  await page.keyboard.press('End');
  await settle(page);
  await page.keyboard.press(`${mod}+v`);
  await expect(editor(page).locator('.kb-columns')).toHaveCount(2);
  await expectSaved(page);
  const ids = ((await apiContent(page.request, a)).content.content as any[]).map((n) => n.attrs?.id);
  // the pasted column set got a fresh id (the original is still on this page), its blocks too
  expect(ids.filter((x) => x === 'cp-c')).toHaveLength(1);
  expect(new Set(ids).size).toBe(ids.length);
  expect(((await apiContent(page.request, b)).content.content as any[]).some((n) => n.type === 'columns')).toBe(false);
});

test('paste priority: internal format → HTML → plain text; a forged internal format from another site is ignored (R-CLIPBOARD-018)', async ({ page }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Приоритет форматов');
  const origin = new URL(page.url()).origin;
  const internal = (o: string, text: string) => JSON.stringify({ v: 1, origin: o, pageId: null, slice: { content: [{ type: 'heading', attrs: { id: 'int-h', level: 3 }, content: [{ type: 'text', text }] }], openStart: 0, openEnd: 0 } });
  await editor(page).click();
  await paste(page, { 'application/x-kb-blocks+json': internal(origin, 'Из внутреннего формата'), 'text/html': '<p>Из HTML</p>', 'text/plain': 'Из текста' });
  await expect(editor(page).locator('h3')).toHaveText('Из внутреннего формата');
  await page.keyboard.press(`${mod}+End`);
  await page.keyboard.press('Enter');
  await paste(page, { 'application/x-kb-blocks+json': internal('https://evil.example', 'Подделка'), 'text/html': '<p>Из HTML</p>', 'text/plain': 'Из текста' });
  await expect(editor(page).getByText('Из HTML')).toBeVisible();
  await expect(editor(page).getByText('Подделка')).toHaveCount(0);
  await page.keyboard.press(`${mod}+End`);
  await page.keyboard.press('Enter');
  await paste(page, { 'text/plain': 'Только текст' });
  await expect(editor(page).getByText('Только текст')).toBeVisible();
  await expectSaved(page);
  const lines = outline((await apiContent(page.request, id)).content);
  expect(lines.filter((l) => !l.startsWith('p ') || /Из|Только/.test(l))).toEqual(['h3 Из внутреннего формата', 'p Из HTML', 'p Только текст']);
});
