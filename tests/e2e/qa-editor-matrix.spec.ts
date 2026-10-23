import { test, expect, devices, type Page, type Browser } from '@playwright/test';
import { ensureOwner, editor, expectSaved, apiContent, createUser, login_, caretToEnd } from './helpers';
import { newPage, cleanupCreatedPages, settle } from './editor-p0-helpers';
import { importMarkdown, spaceOf, md, para, heading } from './perf-helpers';

/**
 * QA26-07: every core editor action — new paragraph, heading, bulleted list, bold, block deletion — in an empty
 * document, a filled one, a long one (5 000 blocks), after Undo/Redo, after reload and with a co-author; QA26-06:
 * selection by touch (Pixel 7 tap / double tap) and Shift+click. Each step is checked in the content the server stores.
 */
cleanupCreatedPages();

type Block = { type: string; attrs?: Record<string, any>; content?: Block[]; text?: string; marks?: Array<{ type: string }> };
const textOf = (b: Block): string => (b.text ?? '') + (b.content ?? []).map(textOf).join('');
const server = async (page: Page, id: string) => (await apiContent(page.request, id)).content.content as Block[];
const find = async (page: Page, id: string, pred: (b: Block) => boolean) => (await server(page, id)).some(pred);
const has = {
  paragraph: (t: string) => (b: Block) => b.type === 'paragraph' && textOf(b) === t,
  heading: (t: string) => (b: Block) => b.type === 'heading' && b.attrs?.level === 2 && textOf(b) === t,
  list: (t: string) => (b: Block) => b.type === 'bulletList' && textOf(b).includes(t),
  bold: (t: string) => (b: Block) => JSON.stringify(b).includes(`"text":"${t}","marks":[{"type":"bold"`) || (b.content ?? []).some((c) => c.text === t && (c.marks ?? []).some((m) => m.type === 'bold')),
  any: (t: string) => (b: Block) => textOf(b).includes(t),
};
const UNDO = 'Control+z';
const REDO = 'Control+Shift+z';

/** Waits until the server has (or no longer has) a block. */
async function serverHas(page: Page, id: string, pred: (b: Block) => boolean, want = true) {
  await expectSaved(page);
  await expect.poll(() => find(page, id, pred), { timeout: 15_000 }).toBe(want);
}

/**
 * The core actions after the paragraph containing `anchor`; with `undoRedo` every action is undone (server no longer
 * has it) and redone (server has it again).
 */
async function coreActions(page: Page, id: string, anchor: string, tag: string, opts: { undoRedo?: boolean; peer?: Page } = {}) {
  const check = async (pred: (b: Block) => boolean, ui: () => Promise<void>) => {
    await serverHas(page, id, pred);
    await ui();
    if (!opts.undoRedo) return;
    await page.keyboard.press(UNDO);
    await serverHas(page, id, pred, false);
    await page.keyboard.press(REDO);
    await serverHas(page, id, pred);
  };
  const views = [page, ...(opts.peer ? [opts.peer] : [])];
  await caretToEnd(page, editor(page).locator('p, h1, h2, h3, li', { hasText: anchor }).last());
  // new paragraph
  await page.keyboard.press('Enter');
  await page.keyboard.type(`Абзац ${tag}`);
  await check(has.paragraph(`Абзац ${tag}`), async () => {
    for (const v of views) await expect(editor(v).locator('p', { hasText: `Абзац ${tag}` })).toHaveCount(1);
  });
  // heading (Markdown shortcut)
  await page.keyboard.press('Enter');
  await page.keyboard.type(`## Заголовок ${tag}`);
  await check(has.heading(`Заголовок ${tag}`), async () => {
    for (const v of views) await expect(editor(v).locator('h2', { hasText: `Заголовок ${tag}` })).toHaveCount(1);
  });
  // bulleted list
  await page.keyboard.press('Enter');
  await page.keyboard.type(`- Пункт ${tag}`);
  await check(has.list(`Пункт ${tag}`), async () => {
    for (const v of views) await expect(editor(v).locator('ul li', { hasText: `Пункт ${tag}` })).toHaveCount(1);
  });
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter'); // leave the list
  // bold: the last word of a new paragraph
  await page.keyboard.type(`Слово жирное${tag}`);
  for (let i = 0; i < `жирное${tag}`.length; i++) await page.keyboard.press('Shift+ArrowLeft');
  await settle(page);
  await page.keyboard.press('Control+b');
  await check(has.bold(`жирное${tag}`), async () => {
    for (const v of views) await expect(editor(v).locator('strong', { hasText: `жирное${tag}` })).toHaveCount(1);
  });
  // delete the block «Абзац …» (select the block, Delete)
  await caretToEnd(page, editor(page).locator('p', { hasText: `Абзац ${tag}` }));
  await settle(page);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Delete');
  await serverHas(page, id, has.paragraph(`Абзац ${tag}`), false);
  for (const v of views) await expect(editor(v).locator('p', { hasText: `Абзац ${tag}` })).toHaveCount(0);
  if (opts.undoRedo) {
    await page.keyboard.press(UNDO);
    await serverHas(page, id, has.paragraph(`Абзац ${tag}`));
    await page.keyboard.press(REDO);
    await serverHas(page, id, has.paragraph(`Абзац ${tag}`), false);
  }
}

async function colleague(browser: Browser, page: Page, id: string) {
  const user = await createUser(page.request, 'Соавтор Матрицы', { pageGrants: [{ pageId: id, level: 'edit' }] });
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await p2.goto('/p/' + id);
  await login_(p2, user.email, user.password);
  await expect(editor(p2)).toBeVisible();
  return { ctx, p2 };
}

test('QA26-07 empty document: paragraph, heading, list, bold and block deletion from an empty page', async ({ page }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Матрица: пустой документ');
  expect((await server(page, id)).every((b) => !textOf(b))).toBe(true); // empty
  await page.keyboard.type('Первая строка');
  await serverHas(page, id, has.paragraph('Первая строка'));
  await coreActions(page, id, 'Первая строка', 'П');
});

test('QA26-07 filled document: the core actions in the middle of a document keep the neighbouring blocks', async ({ page }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Матрица: заполненный документ');
  for (const t of ['Вступление', 'Середина', 'Заключение']) {
    await page.keyboard.type(t);
    await page.keyboard.press('Enter');
  }
  await page.keyboard.press('Backspace');
  await serverHas(page, id, has.paragraph('Заключение'));
  await coreActions(page, id, 'Середина', 'З');
  const order = (await server(page, id)).map(textOf).filter(Boolean);
  expect(order[0]).toBe('Вступление');
  expect(order[order.length - 1]).toBe('Заключение');
});

test('QA26-07 after Undo/Redo: each core action is undone and redone on the server', async ({ page }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Матрица: отмена и повтор');
  await page.keyboard.type('Опорный абзац');
  await serverHas(page, id, has.paragraph('Опорный абзац'));
  await coreActions(page, id, 'Опорный абзац', 'О', { undoRedo: true });
});

test('QA-E6 (fixed): after Undo then Redo the caret is at the end of the redone text — Enter and typing continue after it instead of splitting the last block', async ({ page }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Матрица: курсор после повтора');
  await page.keyboard.type('Опорный абзац');
  await serverHas(page, id, has.paragraph('Опорный абзац'));
  await page.keyboard.press('Enter');
  await page.keyboard.type('Абзац О');
  await serverHas(page, id, has.paragraph('Абзац О'));
  await page.keyboard.press(UNDO);
  await serverHas(page, id, has.paragraph('Абзац О'), false);
  await page.keyboard.press(REDO);
  await serverHas(page, id, has.paragraph('Абзац О'));
  await page.keyboard.press('Enter');
  await page.keyboard.type('## Дальше');
  await serverHas(page, id, has.heading('Дальше'));
  await expect.poll(async () => (await server(page, id)).map((b) => [b.type, textOf(b)])).toEqual([
    ['paragraph', 'Опорный абзац'],
    ['paragraph', 'Абзац О'],
    ['heading', 'Дальше'],
  ]);
});

test('QA26-07 after reload: the results of the core actions are shown after a reload and editing continues', async ({ page }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Матрица: после перезагрузки');
  await page.keyboard.type('До перезагрузки');
  await serverHas(page, id, has.paragraph('До перезагрузки'));
  await coreActions(page, id, 'До перезагрузки', 'Р');
  await page.reload();
  await expect(editor(page).locator('h2', { hasText: 'Заголовок Р' })).toHaveCount(1);
  await expect(editor(page).locator('ul li', { hasText: 'Пункт Р' })).toHaveCount(1);
  await expect(editor(page).locator('strong', { hasText: 'жирноеР' })).toHaveCount(1);
  await expect(editor(page).locator('p', { hasText: 'Абзац Р' })).toHaveCount(0);
  // and the core actions work again after the reload
  await coreActions(page, id, 'жирноеР', 'Р2');
});

test('QA26-07 with a co-author: every core action reaches the colleague’s open editor, and the colleague’s edit reaches the owner', async ({ page, browser }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Матрица: с соавтором');
  await page.keyboard.type('Общий абзац');
  await serverHas(page, id, has.paragraph('Общий абзац'));
  const { ctx, p2 } = await colleague(browser, page, id);
  await expect(editor(p2)).toContainText('Общий абзац');
  await coreActions(page, id, 'Общий абзац', 'С', { peer: p2 });
  await caretToEnd(p2, editor(p2).locator('strong', { hasText: 'жирноеС' }));
  await p2.keyboard.press('Enter');
  await p2.keyboard.type('## Раздел соавтора');
  await serverHas(p2, id, has.heading('Раздел соавтора'));
  await expect(editor(page).locator('h2', { hasText: 'Раздел соавтора' })).toHaveCount(1);
  await ctx.close();
});

test('QA26-07, SC-04 long document (5 000 blocks): the core actions near the end of the document are stored', async ({ page }) => {
  test.setTimeout(300_000);
  await ensureOwner(page);
  const scratch = await newPage(page, 'Матрица: черновик');
  const content: unknown[] = [];
  for (let i = 0; i < 5000; i++) content.push(i % 50 === 0 ? heading(i) : para(i, 8));
  const id = await importMarkdown(page.request, await spaceOf(page.request, scratch), 'Матрица длинный документ.md', md(content as any[]));
  await page.goto('/p/' + id);
  await expect(editor(page).locator('p').first()).toBeVisible({ timeout: 60_000 });
  expect((await server(page, id)).length).toBeGreaterThanOrEqual(5000);
  // the last paragraph of the document
  const last = editor(page).locator('p', { hasText: 'П4999 ' });
  await last.scrollIntoViewIfNeeded();
  await coreActions(page, id, 'П4999 ', 'Д');
  expect((await server(page, id)).length).toBeGreaterThanOrEqual(5003);
  await page.request.delete(`/api/v1/pages/${id}`, { headers: { 'x-csrf-token': (await page.context().storageState()).cookies.find((c) => c.name === 'kb_csrf')?.value ?? '' } });
});

test('QA26-06 Shift+click selection: click at one word, Shift+click at another — exactly that range is formatted (server)', async ({ page }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Выделение Shift+клик');
  await page.keyboard.type('альфа бета гамма дельта');
  await serverHas(page, id, has.paragraph('альфа бета гамма дельта'));
  const p = editor(page).locator('p').first();
  const at = (word: string, edge: 'start' | 'end') =>
    p.evaluate(
      (el, { word, edge }) => {
        const t = el.firstChild as Text;
        const i = t.data.indexOf(word) + (edge === 'end' ? word.length : 0);
        const r = document.createRange();
        r.setStart(t, i);
        r.setEnd(t, i);
        const b = r.getBoundingClientRect();
        return { x: b.left + (edge === 'end' ? -1 : 1), y: b.top + b.height / 2 };
      },
      { word, edge },
    );
  const a = await at('бета', 'start');
  const b = await at('гамма', 'end');
  await page.mouse.click(a.x, a.y);
  await page.keyboard.down('Shift');
  await page.mouse.click(b.x, b.y);
  await page.keyboard.up('Shift');
  await settle(page);
  expect(await page.evaluate(() => getSelection()!.toString())).toBe('бета гамма');
  await page.getByRole('toolbar', { name: 'Форматирование' }).getByRole('button', { name: 'Жирный' }).click();
  await serverHas(page, id, has.bold('бета гамма'));
  const runs = (await server(page, id))[0].content!.map((c) => [c.text, (c.marks ?? []).map((m) => m.type).join()]);
  expect(runs).toEqual([['альфа ', ''], ['бета гамма', 'bold'], [' дельта', '']]);
});

test('QA26-06 touch selection (Pixel 7): a tap places the caret, a double tap selects the tapped text, the formatting toolbar works by touch (server)', async ({ browser }) => {
  const ctx = await browser.newContext({ ...devices['Pixel 7'], locale: 'ru-RU', timezoneId: 'Europe/Moscow' });
  const page = await ctx.newPage();
  await ensureOwner(page);
  const id = await newPage(page, 'Выделение касанием');
  await page.keyboard.type('утро день вечер');
  await serverHas(page, id, has.paragraph('утро день вечер'));
  const p = editor(page).locator('p').first();
  const center = await p.evaluate((el) => {
    const t = el.firstChild as Text;
    const i = t.data.indexOf('день');
    const r = document.createRange();
    r.setStart(t, i + 1);
    r.setEnd(t, i + 2);
    const b = r.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  });
  // a tap puts the caret inside the word
  await page.touchscreen.tap(center.x, center.y);
  await settle(page);
  expect(await page.evaluate(() => getSelection()!.isCollapsed)).toBe(true);
  await page.keyboard.type('Ж');
  await serverHas(page, id, has.paragraph('утро дЖень вечер'));
  await page.keyboard.press('Backspace');
  await serverHas(page, id, has.paragraph('утро день вечер'));
  // a double tap selects the word
  await page.touchscreen.tap(center.x, center.y);
  await page.waitForTimeout(60);
  await page.touchscreen.tap(center.x, center.y);
  await settle(page);
  // the double tap selects text around the tapped word (word or paragraph, as the platform decides)
  await expect.poll(() => page.evaluate(() => getSelection()!.toString())).toContain('день');
  const selected = (await page.evaluate(() => getSelection()!.toString())).trim();
  const bold = page.getByRole('toolbar', { name: 'Форматирование' }).getByRole('button', { name: 'Жирный' });
  await expect(bold).toBeVisible();
  await bold.tap();
  await serverHas(page, id, has.bold(selected));
  await expect(editor(page).locator('strong')).toHaveText(selected);
  await ctx.close();
});
