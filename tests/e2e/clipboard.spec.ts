import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { ensureOwner, newPage, editor, expectSaved, apiContent, paste } from './helpers';

test.describe.configure({ mode: 'serial' });

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP8z4AATAxkCAEAJ9cBD8JfOs4AAAAASUVORK5CYII=';

const WORD = `<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8"><style>p.MsoNormal{font-family:Calibri}</style></head><body>
<!--StartFragment-->
<h1>Регламент приёмки<o:p></o:p></h1>
<h2>Порядок</h2>
<p class=MsoNormal><span style='font-size:11pt;font-family:Calibri;color:#1F3864'>Документ описывает <b>порядок</b> и <a href="https://example.com/norm">норматив</a>.</span><o:p></o:p></p>
<p class=MsoListParagraphCxSpFirst style='mso-list:l0 level1 lfo1'><![if !supportLists]><span><span style='mso-list:Ignore'>·<span>&nbsp;</span></span></span><![endif]>Проверить документы<o:p></o:p></p>
<p class=MsoListParagraphCxSpMiddle style='mso-list:l0 level2 lfo1'><![if !supportLists]><span><span style='mso-list:Ignore'>o<span>&nbsp;</span></span></span><![endif]>Накладная<o:p></o:p></p>
<p class=MsoListParagraphCxSpLast style='mso-list:l0 level1 lfo1'><![if !supportLists]><span><span style='mso-list:Ignore'>·<span>&nbsp;</span></span></span><![endif]>Пересчитать товар<o:p></o:p></p>
<p class=MsoListParagraph style='mso-list:l1 level1 lfo2'><![if !supportLists]><span><span style='mso-list:Ignore'>1.<span>&nbsp;</span></span></span><![endif]>Первый шаг</p>
<p class=MsoListParagraph style='mso-list:l1 level1 lfo2'><![if !supportLists]><span><span style='mso-list:Ignore'>2.<span>&nbsp;</span></span></span><![endif]>Второй шаг</p>
<table class=MsoTableGrid border=1><tr><td style='border:solid windowtext 1pt'><p class=MsoNormal>Артикул</p></td><td><p class=MsoNormal>Кол-во</p></td></tr><tr><td><p class=MsoNormal>A-1</p></td><td><p class=MsoNormal>10</p></td></tr></table>
<![if !vml]><img width=200 height=100 src="file:///C:/Users/x/AppData/Local/Temp/msohtmlclip1/01/clip_image002.png"><![endif]>
<!--EndFragment--></body></html>`;

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

test('Word paste keeps headings, nested and numbered lists, links and tables without Office styles (AT-44, UX13-02, E209, R-CLIPBOARD-020, R-CLIPBOARD-022)', async ({ page }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Вставка из Word');
  await paste(page, { 'text/html': WORD, 'text/plain': 'Регламент приёмки\nПорядок\n…' });
  const ed = editor(page);
  await expect(ed.locator('h1')).toHaveText('Регламент приёмки');
  await expect(ed.locator('h2')).toHaveText('Порядок');
  await expect(ed.locator('ul > li')).toHaveCount(2);
  await expect(ed.locator('ul > li ul > li')).toHaveText('Накладная');
  await expect(ed.locator('ol > li')).toHaveCount(2);
  await expect(ed.locator('table tr')).toHaveCount(2);
  await expect(ed.locator('a[href="https://example.com/norm"]')).toHaveText('норматив');
  await expect(page.getByText(/не удалось перенести из буфера: 1/)).toBeVisible();
  await expectSaved(page);
  const json = JSON.stringify((await apiContent(page.request, id)).content);
  expect(json).not.toMatch(/Calibri|fontSize|1F3864|mso|file:/i);
  expect(json).toContain('"bold"');
  expect(json).toContain('Пересчитать товар');
});

test('web HTML paste: scripts removed, embedded image uploaded as an attachment (E210, SC-06, R-CLIPBOARD-009)', async ({ page }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Вставка из браузера');
  await page.evaluate(() => ((window as any).__pwned = false));
  await paste(page, {
    'text/html': `<h2 onclick="window.__pwned=true">Схема склада</h2><p style="font-family:Comic Sans MS">Описание <img src="x" onerror="window.__pwned=true"></p><script>window.__pwned=true</script><figure><img src="${PNG}" alt="План"></figure>`,
    'text/plain': 'Схема склада',
  });
  await expect(editor(page).locator('h2')).toHaveText('Схема склада');
  await expect(editor(page).locator('.kb-image-block img')).toBeVisible({ timeout: 20_000 });
  await expectSaved(page);
  expect(await page.evaluate(() => (window as any).__pwned)).toBe(false);
  const json = JSON.stringify((await apiContent(page.request, id)).content);
  expect(json).toMatch(/"attachmentId":"[0-9a-f-]{36}"/);
  expect(json).not.toMatch(/Comic|onclick|onerror|data:image/);
});

test('page menu copies the page with formatting, as text and as Markdown (R-CLIPBOARD-002, R-CLIPBOARD-004, SC-08)', async ({ page }) => {
  await ensureOwner(page);
  await newPage(page, 'Копирование страницы');
  await grantClipboard(page);
  await page.keyboard.type('## Раздел');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Текст со **ссылкой** ');
  await expectSaved(page);
  const copyVia = async (label: string) => {
    await page.locator('.page-header-bar').getByRole('button', { name: 'Действия со страницей' }).click();
    await page.getByRole('menuitem', { name: 'Копировать страницу' }).click();
    await page.getByRole('menuitem', { name: label }).click();
  };
  await copyVia('С форматированием');
  await expect(page.getByText('Страница скопирована с форматированием')).toBeVisible();
  let clip = await readClipboard(page);
  expect(clip['text/html']).toContain('<h1>Копирование страницы</h1>');
  expect(clip['text/html']).toMatch(/<h2[^>]*>Раздел<\/h2>/);
  expect(clip['text/html']).toContain('<strong>ссылкой</strong>');
  expect(clip['text/plain']).toContain('Раздел');

  await copyVia('Как Markdown');
  clip = await readClipboard(page);
  expect(clip['text/plain']).toContain('# Копирование страницы');
  expect(clip['text/plain']).toContain('## Раздел');
  expect(clip['text/plain']).toContain('**ссылкой**');

  await copyVia('Как текст');
  clip = await readClipboard(page);
  expect(clip['text/plain']).not.toContain('**');
  expect(clip['text/plain']).toContain('Текст со ссылкой');
});

test('refused clipboard access shows an error and the text for manual copying, not a false success (R-CLIPBOARD-008, SC-10)', async ({ page }) => {
  await ensureOwner(page);
  await newPage(page, 'Без буфера');
  await page.keyboard.type('Секретный регламент');
  await expectSaved(page);
  await page.evaluate(() => {
    const deny = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: deny, write: deny, read: deny }, configurable: true });
  });
  await page.keyboard.press('Control+Shift+C');
  const dlg = page.getByRole('dialog', { name: 'Скопируйте вручную' });
  await expect(dlg).toBeVisible();
  await expect(dlg.getByRole('textbox')).toHaveValue(/Секретный регламент/);
  await expect(page.getByText('Скопировано в формате Markdown')).toHaveCount(0);
  await expect(page.getByText(/запретил доступ к буферу/)).toBeVisible();
  await dlg.getByRole('button', { name: 'Готово' }).click();
});

test('table copy for Excel puts TSV and an HTML table on the clipboard (R-CLIPBOARD-006, R-CLIPBOARD-017, SC-09)', async ({ page }) => {
  await ensureOwner(page);
  await newPage(page, 'Таблица в Excel');
  await grantClipboard(page);
  await paste(page, { 'text/plain': 'Артикул\tКол-во\nA-1\t10\nB-2\t3\n' });
  await expect(editor(page).locator('table tr')).toHaveCount(3);
  await editor(page).locator('td').first().click();
  await page.getByRole('toolbar', { name: 'Таблица' }).getByRole('button').last().click();
  await page.getByRole('menuitem', { name: 'Копировать для Excel' }).click();
  await expect(page.getByText(/Таблица скопирована/)).toBeVisible();
  const clip = await readClipboard(page);
  expect(clip['text/plain']).toBe('Артикул\tКол-во\nA-1\t10\nB-2\t3');
  expect(clip['text/html']).toMatch(/<table[\s\S]*A-1[\s\S]*<\/table>/);
});

test('converting formatted text to a code block asks first and keeps the text (R-EDITOR-067, R-EDITOR-003)', async ({ page }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'В код');
  await page.keyboard.type('вызов **важный** api');
  await page.keyboard.press('Shift+Home');
  await page.getByRole('toolbar', { name: 'Форматирование' }).getByRole('button', { name: /Текст/ }).click();
  await page.getByRole('menuitem', { name: 'Блок кода' }).click();
  const dlg = page.getByRole('dialog', { name: 'Преобразовать в блок кода?' });
  await expect(dlg).toBeVisible();
  await dlg.getByRole('button', { name: 'Преобразовать' }).click();
  await expect(editor(page).locator('pre')).toContainText('вызов важный api');
  await expectSaved(page);
  expect(JSON.stringify((await apiContent(page.request, id)).content)).toContain('"type":"codeBlock"');
});

test('caret position of a page is restored when it is opened again (R-EDITOR-037, R-EDITOR-001)', async ({ page }) => {
  await ensureOwner(page);
  await newPage(page, 'Курсор');
  await page.keyboard.type('Первый абзац');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Второй абзац текста');
  await expectSaved(page);
  await editor(page).locator('p', { hasText: 'Первый абзац' }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft'); // after "Первый "
  await page.waitForTimeout(500);
  // reopen the page in the same tab (a reload would also replay the "just created" navigation state)
  await page.goto(page.url());
  await expect(editor(page)).toContainText('Второй абзац');
  await expect(editor(page)).toBeFocused();
  await page.keyboard.type('X');
  await expect(editor(page).locator('p').first()).toHaveText('Первый Xабзац');
  await expectSaved(page);
});

test('registry block from the slash menu shows the new collection (R-COLLECTION-001)', async ({ page }) => {
  await ensureOwner(page);
  await newPage(page, 'Страница с реестром');
  await page.keyboard.type('/реестр');
  await page.keyboard.press('Enter');
  const block = editor(page).locator('.kb-collection-block');
  await expect(block).toContainText('Новый реестр');
  await expect(block.locator('th')).toContainText(['Название', 'Статус']);
  await expect(block).toContainText('Записей пока нет');
  await expect(block.getByRole('link', { name: 'Открыть' })).toBeVisible();
});

test('image viewer: click on a selected image opens it; zoom is limited to 10–800 % (R-MEDIA-015, R-MEDIA-019, R-MEDIA-021)', async ({ page }) => {
  await ensureOwner(page);
  await newPage(page, 'Просмотр изображения');
  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.type('/изображ');
  await page.keyboard.press('Enter');
  await (await chooser).setFiles(path.resolve('tests/e2e/fixtures/scheme.png'));
  const img = editor(page).locator('.kb-image-block img');
  await expect(img).toBeVisible({ timeout: 20_000 });
  await img.click(); // selects
  await expect(page.getByRole('toolbar', { name: 'Изображение' })).toBeVisible();
  await img.click(); // opens
  const viewer = page.getByRole('dialog', { name: /Просмотр изображения/ });
  await expect(viewer).toBeVisible();
  const pct = viewer.locator('.viewer-pct');
  for (let i = 0; i < 30; i++) await page.keyboard.press('+');
  await expect(pct).toHaveText('800%');
  for (let i = 0; i < 40; i++) await page.keyboard.press('-');
  const min = Number((await pct.textContent())!.replace('%', ''));
  expect(min).toBeGreaterThanOrEqual(1);
  expect(min).toBeLessThanOrEqual(10);
  await page.keyboard.press('Escape');
  await expect(viewer).toBeHidden();
});
