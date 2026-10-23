import { test, expect, type Page } from '@playwright/test';
import { ensureOwner, editor, expectSaved, apiContent, paste, api } from './helpers';
import { newPage, cleanupCreatedPages, settle } from './editor-p0-helpers';

/**
 * R-EDITOR-038 footnotes, R-MEDIA-007 inline images and attachments of pasted pictures, R-IMPORT-021 one pipeline —
 * in the real editor (browser DOM, collaboration, Undo).
 */
test.describe.configure({ mode: 'serial' });
cleanupCreatedPages();

const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAIAAAACUFjqAAAAEklEQVR4nGP4z8CAB+GTG8HSALfKY52fTcuYAAAAAElFTkSuQmCC';

const notesList = (page: Page) => page.getByTestId('footnotes-list').locator('li');
const footnotesOf = (doc: any): string[] => {
  const out: string[] = [];
  const walk = (n: any) => {
    if (n.type === 'footnote') out.push((n.content ?? []).map((c: any) => c.text ?? '\n').join(''));
    (n.content ?? []).forEach(walk);
  };
  walk(doc);
  return out;
};
const nodesOf = (doc: any, type: string): any[] => {
  const out: any[] = [];
  const walk = (n: any) => {
    if (n.type === type) out.push(n);
    (n.content ?? []).forEach(walk);
  };
  walk(doc);
  return out;
};
/** Document JSON without block ids / null attributes, for comparing two pages. */
const shape = (n: any): any => {
  const { attrs, content, ...rest } = n;
  const a = attrs ? Object.fromEntries(Object.entries(attrs).filter(([k, v]) => k !== 'id' && v !== null && v !== undefined)) : undefined;
  return { ...rest, ...(a && Object.keys(a).length ? { attrs: a } : {}), ...(content ? { content: content.map(shape) } : {}) };
};

test('R-EDITOR-038: footnotes — insert (Ctrl+Alt+F and /-menu), automatic numbering, note ↔ reference navigation, editing, Undo, copy/paste, saved', async ({ page }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Сноски в статье');
  const ed = editor(page);
  await page.keyboard.type('Норма освещённости');
  await page.keyboard.press('Control+Alt+f');
  // the note opens with its own small editor, focused
  const pop = page.locator('.kb-footnote-popover');
  await expect(pop).toBeVisible();
  await expect(pop.getByRole('textbox')).toBeFocused();
  await page.keyboard.type('СП 52.13330');
  await page.keyboard.press('Escape');
  await expect(pop).toHaveCount(0);
  await settle(page);
  await page.keyboard.type(' и шум');
  // the /-menu inserts the second one
  await page.keyboard.type(' /сноска');
  await expect(page.getByRole('option', { name: /Сноска/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(pop.getByRole('textbox')).toBeFocused();
  await page.keyboard.type('СН 2.2.4');
  await page.keyboard.press('Escape');
  await expect(pop).toHaveCount(0);
  await expect(notesList(page)).toHaveText([/СП 52\.13330/, /СН 2\.2\.4/]);
  await expect(ed.locator('.kb-footnote-ref')).toHaveCount(2);

  // a reference inserted earlier in the text renumbers the others (numbers are the document order, never stored)
  await page.keyboard.press('Home');
  await settle(page);
  await page.keyboard.press('Control+Alt+f');
  await expect(pop.getByRole('textbox')).toBeFocused();
  await page.keyboard.type('Первая по порядку');
  await page.keyboard.press('Escape');
  await expect(notesList(page)).toHaveText([/Первая по порядку/, /СП 52\.13330/, /СН 2\.2\.4/]);

  // reference → note list ("↓ К списку сносок") and note → reference ("↑")
  await ed.locator('.kb-footnote-ref').nth(1).click();
  await expect(pop).toBeVisible();
  await expect(pop).toContainText('Сноска 2');
  await pop.getByRole('button', { name: '↓ К списку сносок' }).click();
  await expect(notesList(page).nth(1)).toHaveClass(/is-flash/);
  await notesList(page).nth(2).getByRole('button', { name: /Вернуться к ссылке на сноску 3/ }).click();
  await expect(ed.locator('.kb-footnote').nth(2)).toHaveClass(/ProseMirror-selectednode/);
  await expect(pop).toContainText('Сноска 3');

  // editing a note in place; Ctrl+Z inside the note is the page's undo
  await pop.getByRole('textbox').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' (ред.)');
  await expect(notesList(page).nth(2)).toContainText('СН 2.2.4 (ред.)');
  await page.keyboard.press(`${mod}+z`);
  await expect(notesList(page).nth(2)).not.toContainText('(ред.)');
  await page.keyboard.press(`${mod}+Shift+z`);
  await expect(notesList(page).nth(2)).toContainText('СН 2.2.4 (ред.)');
  await page.keyboard.press('Escape');

  // deleting a reference removes its note in one step; Undo brings both back
  await ed.locator('.kb-footnote-ref').first().click();
  await expect(pop).toBeVisible();
  await pop.getByRole('button', { name: 'Удалить сноску' }).click();
  await expect(notesList(page)).toHaveCount(2);
  await page.keyboard.press(`${mod}+z`);
  await expect(notesList(page)).toHaveCount(3);
  await expect(notesList(page).first()).toContainText('Первая по порядку');

  // copy the paragraph (references carry their notes) and paste it below: 6 footnotes, numbered in order
  await ed.locator('p').first().click({ position: { x: 4, y: 8 } });
  await settle(page);
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await settle(page);
  await page.keyboard.press(`${mod}+c`);
  await page.keyboard.press('End');
  await settle(page);
  await page.keyboard.press('Enter');
  await page.keyboard.press(`${mod}+v`);
  await expect(notesList(page)).toHaveCount(6);
  await expect(notesList(page).nth(3)).toContainText('Первая по порядку');

  await expectSaved(page);
  const { content } = await apiContent(page.request, id);
  expect(footnotesOf(content)).toEqual(['Первая по порядку', 'СП 52.13330', 'СН 2.2.4 (ред.)', 'Первая по порядку', 'СП 52.13330', 'СН 2.2.4 (ред.)']);
  // reload: the notes come back from the server
  await page.reload();
  await expect(notesList(page)).toHaveCount(6);
});

test('R-EDITOR-038: Markdown with [^1] pasted right after opening a page becomes footnotes', async ({ page }) => {
  await ensureOwner(page);
  await newPage(page, 'Сноски из Markdown');
  await paste(page, { 'text/plain': 'Текст со сноской[^1] и ещё одной[^2].\n\n[^1]: Первая.\n[^2]: Вторая **важная**.\n' });
  await expect(notesList(page)).toHaveText([/Первая\./, /Вторая важная\./]);
  await expect(editor(page).locator('.kb-footnote-ref')).toHaveCount(2);
  await expect(editor(page)).not.toContainText('[^1]');
});

test('R-MEDIA-007: a picture in a line of text — pasted inline, uploaded as an attachment, resized, aligned, converted to a block and back, viewer, one Undo step each', async ({ page }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Картинка в строке');
  const ed = editor(page);
  await paste(page, { 'text/html': `<p>Нажмите кнопку <img src="${PNG}" alt="Сохранить"> чтобы сохранить</p>`, 'text/plain': 'Нажмите кнопку чтобы сохранить' });
  const inl = ed.locator('img.kb-inline-image');
  await expect(inl).toHaveCount(1);
  await expect(ed.locator('p', { hasText: 'Нажмите кнопку' }).locator('img.kb-inline-image')).toHaveCount(1); // in the line
  // the embedded picture became an attachment of this page (the original, not a thumbnail)
  await expect.poll(async () => nodesOf((await apiContent(page.request, id)).content, 'inlineImage')[0]?.attrs?.attachmentId ?? null, { timeout: 20_000 }).not.toBeNull();
  const att = nodesOf((await apiContent(page.request, id)).content, 'inlineImage')[0].attrs.attachmentId;
  const meta = await (await page.request.get(`/api/v1/attachments/${att}`)).json();
  expect(meta.attachment?.pageId ?? meta.pageId).toBe(id);
  const orig = await page.request.get(`/api/v1/attachments/${att}/download`);
  expect(orig.status()).toBe(200);
  expect((await orig.body()).length).toBe(Buffer.from(PNG.split(',')[1], 'base64').length);

  // select → toolbar: size preset, vertical alignment, alt text
  await inl.click();
  const bar = page.getByRole('toolbar', { name: 'Изображение в строке' });
  await expect(bar).toBeVisible();
  await bar.getByRole('button', { name: '48', exact: true }).click();
  await expect(inl).toHaveAttribute('style', /width: 48px/);
  await bar.getByRole('button', { name: 'По центру строки' }).click();
  await bar.getByRole('button', { name: 'Альтернативный текст' }).click();
  const altInput = bar.getByRole('textbox', { name: 'Альтернативный текст' });
  await altInput.fill('Кнопка «Сохранить»');
  await altInput.press('Enter');
  await expectSaved(page);
  let img = nodesOf((await apiContent(page.request, id)).content, 'inlineImage')[0];
  expect(img.attrs).toMatchObject({ width: 48, valign: 'middle', alt: 'Кнопка «Сохранить»' });

  // keyboard resize (R-MEDIA-012): Alt+Shift+→ grows it by a quarter
  // the click must select the picture (node selection) before the shortcut applies to it
  await expect(async () => {
    await inl.click();
    await expect(inl.locator('xpath=ancestor-or-self::*[contains(@class,"ProseMirror-selectednode")][1]')).toHaveCount(1, { timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  await page.keyboard.press('Alt+Shift+ArrowRight');
  await expect(inl).toHaveAttribute('style', /width: 60px/);
  await page.keyboard.press(`${mod}+z`);
  await expect(inl).toHaveAttribute('style', /width: 48px/);

  // viewer (lightbox) with the original
  await inl.dblclick();
  const viewer = page.getByRole('dialog', { name: /Просмотр изображения/ });
  await expect(viewer).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(viewer).toHaveCount(0);

  // to a block and back: one Undo step each way
  await inl.click();
  await page.getByRole('toolbar', { name: 'Изображение в строке' }).getByRole('button', { name: 'Сделать блоком' }).click();
  await expect(ed.locator('img.kb-inline-image')).toHaveCount(0);
  await expect(ed.locator('figure.kb-image-block img')).toHaveCount(1);
  await page.keyboard.press(`${mod}+z`);
  await expect(ed.locator('img.kb-inline-image')).toHaveCount(1);
  await expect(ed.locator('figure.kb-image-block')).toHaveCount(0);
  await page.keyboard.press(`${mod}+Shift+z`);
  await expect(ed.locator('figure.kb-image-block img')).toHaveCount(1);
  await ed.locator('figure.kb-image-block img').click();
  await page.getByRole('toolbar', { name: 'Изображение' }).getByRole('button', { name: 'В строку текста' }).click();
  await expect(ed.locator('img.kb-inline-image')).toHaveCount(1);
  await expectSaved(page);
  img = nodesOf((await apiContent(page.request, id)).content, 'inlineImage')[0];
  expect(img.attrs.attachmentId).toBe(att); // the same attachment all along
  expect(img.attrs.alt).toBe('Кнопка «Сохранить»');
  // «Удалить» on the inline toolbar removes only the picture (text around it stays); one Undo brings it back
  const textBefore = await ed.locator('p', { has: page.locator('img.kb-inline-image') }).first().innerText();
  await ed.locator('img.kb-inline-image').click();
  await page.getByRole('toolbar', { name: 'Изображение в строке' }).getByRole('button', { name: 'Удалить' }).click();
  await expect(ed.locator('img.kb-inline-image')).toHaveCount(0);
  await expectSaved(page);
  expect(nodesOf((await apiContent(page.request, id)).content, 'inlineImage')).toHaveLength(0);
  expect(JSON.stringify((await apiContent(page.request, id)).content)).toContain(textBefore.trim().slice(0, 10));
  await page.keyboard.press(`${mod}+z`);
  await expect(ed.locator('img.kb-inline-image')).toHaveCount(1);
  await expectSaved(page);
  expect(nodesOf((await apiContent(page.request, id)).content, 'inlineImage')[0].attrs.attachmentId).toBe(att);
});

test('R-MEDIA-007: a picture copied from another page as HTML (no internal clipboard format) becomes an attachment of the target page', async ({ page }) => {
  await ensureOwner(page);
  const src = await newPage(page, 'Исходная с картинкой');
  await paste(page, { 'text/html': `<p><img src="${PNG}" alt="схема"></p>`, 'text/plain': '' });
  await expect.poll(async () => nodesOf((await apiContent(page.request, src)).content, 'image')[0]?.attrs?.attachmentId ?? null, { timeout: 20_000 }).not.toBeNull();
  const original = nodesOf((await apiContent(page.request, src)).content, 'image')[0].attrs.attachmentId as string;
  const html = await page.evaluate(() => {
    const fig = document.querySelector('.kb-editor figure');
    const img = fig?.querySelector('img');
    return `<figure data-attachment-id="${img?.closest('[data-attachment-id]')?.getAttribute('data-attachment-id') ?? ''}"><img src="${img?.getAttribute('src')}" alt="схема"></figure>`;
  });
  const target = await newPage(page, 'Целевая страница');
  // the attachment id travels in the HTML (data-attachment-id) as when copying between tabs/browsers
  await paste(page, { 'text/html': html.replace('data-attachment-id=""', `data-attachment-id="${original}"`), 'text/plain': '' });
  await expect
    .poll(async () => {
      const a = nodesOf((await apiContent(page.request, target)).content, 'image')[0]?.attrs?.attachmentId ?? null;
      return a && a !== original ? 'copied' : a ?? 'none';
    }, { timeout: 20_000 })
    .toBe('copied');
  const copied = nodesOf((await apiContent(page.request, target)).content, 'image')[0].attrs.attachmentId as string;
  expect(copied).toBeTruthy();
  const meta = await (await page.request.get(`/api/v1/attachments/${copied}`)).json();
  expect(meta.attachment?.pageId ?? meta.pageId).toBe(target);
});

test('R-IMPORT-021: the same HTML pasted in the browser and imported as a file gives the same document', async ({ page }) => {
  await ensureOwner(page);
  const HTML = `<h2>Порядок работ</h2><p>Отключите <b>питание</b><sup><a href="#fn1" id="fnref1">1</a></sup> и проверьте <a href="https://example.com/?utm_source=x&amp;id=3">инструкцию</a>.</p><ul><li>Первый</li><li>Второй<ul><li>Вложенный</li></ul></li></ul><table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table><blockquote><p>Цитата</p></blockquote><section class="footnotes"><ol><li id="fn1"><p>Автоматом на щите. <a href="#fnref1">↩</a></p></li></ol></section>`;
  const pasted = await newPage(page, 'Вставка HTML');
  await paste(page, { 'text/html': HTML, 'text/plain': 'x' });
  await expect(notesList(page)).toHaveCount(1);
  await expectSaved(page);
  // the same HTML through the import endpoint
  const csrf = (await page.context().storageState()).cookies.find((c) => c.name === 'kb_csrf')?.value ?? '';
  const job = await (
    await page.request.post('/api/v1/imports', { multipart: { file: { name: 'вставка.html', mimeType: 'text/html', buffer: Buffer.from(`<!doctype html><html><body>${HTML}</body></html>`) } }, headers: { 'x-csrf-token': csrf } })
  ).json();
  let status = '';
  for (let i = 0; i < 100 && status !== 'awaiting_confirmation'; i++) {
    status = (await (await page.request.get(`/api/v1/imports/${job.jobId}`)).json()).status;
    if (status !== 'awaiting_confirmation') await page.waitForTimeout(100);
  }
  const me = await (await page.request.get('/api/v1/auth/me')).json();
  const res = await api(page, 'POST', `/api/v1/imports/${job.jobId}/commit`, { target: { spaceId: me.personalSpaceId, parentId: null } });
  const imported = (await apiContent(page.request, res.rootPageId)).content;
  const viaPaste = (await apiContent(page.request, pasted)).content;
  // the paste went into the page's first (empty) paragraph: same blocks
  expect(shape(viaPaste)).toEqual(shape(imported));
  await api(page, 'DELETE', `/api/v1/pages/${res.rootPageId}`);
  await settle(page);
});
