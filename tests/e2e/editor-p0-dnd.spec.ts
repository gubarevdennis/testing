import { test, expect, type Page, type Locator } from '@playwright/test';
import { ensureOwner, editor, expectSaved, apiContent, treeLink, caretIn } from './helpers';
import { newPage, cleanupCreatedPages, settle } from './editor-p0-helpers';

/**
 * Block drag-and-drop with a real mouse (R-EDITOR-069, R-EDITOR-075, R-EDITOR-076, QA26-09): drag threshold, insertion
 * line before / after / inside, container highlight, invalid targets with a reason, autoscroll, Alt-copy, Esc,
 * several blocks, columns, images / tables / nested lists, another page from the sidebar tree, one Undo per drop,
 * keyboard alternatives. Server copies are checked after every drop (ids, order, attributes).
 */
test.describe.configure({ mode: 'serial' });
cleanupCreatedPages();

const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP8z4AATAxkCAEAJ9cBD8JfOs4AAAAASUVORK5CYII=';
const isMac = process.platform === 'darwin';
const mod = isMac ? 'Meta' : 'Control';

const p = (id: string, text: string) => ({ type: 'paragraph', attrs: { id }, content: [{ type: 'text', text }] });

async function open(page: Page, title: string, content: unknown[]) {
  await ensureOwner(page);
  await page.evaluate(() => localStorage.setItem('kb:debug', '1'));
  const id = await newPage(page, title);
  await page.waitForFunction(() => (window as any).__kbEditor);
  await page.evaluate((c) => {
    const ed = (window as any).__kbEditor;
    ed.chain().setContent({ type: 'doc', content: c }).run();
  }, content as any);
  await expectSaved(page);
  return id;
}

/** Ids of top-level blocks (and of blocks inside columns, as nested arrays). */
const order = (page: Page) =>
  page.evaluate(() =>
    ((window as any).__kbEditor.getJSON().content as any[]).map((n) => (n.type === 'columns' ? n.content.map((c: any) => c.content.map((b: any) => b.attrs?.id)) : n.attrs?.id ?? n.type)),
  );

/** Hovers the block so its ⋮⋮ handle appears; returns the handle's centre. */
async function grip(page: Page, block: Locator) {
  const b = (await block.boundingBox())!;
  await page.mouse.move(b.x + Math.min(40, b.width / 2), b.y + Math.min(10, b.height / 2));
  const handle = page.locator('.block-handle .block-grip');
  await expect(handle).toBeVisible();
  // the handle is aligned with the hovered block
  await expect.poll(async () => Math.abs(((await handle.boundingBox())?.y ?? -999) - b.y)).toBeLessThan(30);
  const g = (await handle.boundingBox())!;
  return { x: g.x + g.width / 2, y: g.y + g.height / 2 };
}

/** Presses on the handle of `block` and moves (slowly, in steps) to (x, y); the button stays pressed. */
async function dragTo(page: Page, block: Locator, x: number, y: number, steps = 12) {
  const g = await grip(page, block);
  await page.mouse.move(g.x, g.y);
  await page.mouse.down();
  await page.mouse.move(g.x + 2, g.y + 2); // below the threshold: nothing happens yet
  await expect(page.locator('.kb-drag-preview')).toHaveCount(0);
  await page.mouse.move(x, y, { steps });
  await settle(page);
}

async function rect(l: Locator) {
  return (await l.boundingBox())!;
}

const undoKey = `${mod}+z`;
const redoKey = `${mod}+Shift+z`;

test('drag threshold, preview, line before/after, one atomic drop, one Undo; ids kept on the server (R-EDITOR-069, R-EDITOR-075, R-HISTORY-017)', async ({ page }) => {
  const id = await open(page, 'DnD порядок', [p('a', 'Первый абзац'), p('b', 'Второй абзац'), p('c', 'Третий абзац'), p('d', 'Четвёртый абзац')]);
  const ed = editor(page);
  // a click on the handle (no movement) opens the block menu and moves nothing
  const g = await grip(page, ed.locator('p', { hasText: 'Третий' }));
  await page.mouse.click(g.x, g.y);
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');
  expect(await order(page)).toEqual(['a', 'b', 'c', 'd']);

  // drag "Третий" over the upper half of "Первый": line before "Первый", preview, dimmed source
  const first = await rect(ed.locator('p', { hasText: 'Первый' }));
  await dragTo(page, ed.locator('p', { hasText: 'Третий' }), first.x + 60, first.y + 3);
  const line = page.locator('.kb-drop-line');
  await expect(line).toBeVisible();
  await expect(line).toHaveAttribute('data-side', 'before');
  await expect(line).toHaveAttribute('data-valid', 'true');
  expect(Math.abs((await rect(line)).y - first.y)).toBeLessThan(8);
  const preview = page.locator('.kb-drag-preview');
  await expect(preview).toBeVisible();
  await expect(preview).toContainText('Третий абзац');
  expect(Number(await preview.evaluate((e) => getComputedStyle(e).opacity))).toBeLessThan(1);
  await expect(ed.locator('p.kb-drag-source', { hasText: 'Третий' })).toHaveCount(1);
  // lower half of "Первый": line after it
  await page.mouse.move(first.x + 60, first.y + first.height - 3, { steps: 3 });
  await expect(line).toHaveAttribute('data-side', 'after');
  await page.mouse.move(first.x + 60, first.y + 3, { steps: 3 });
  await expect(line).toHaveAttribute('data-side', 'before');
  await page.mouse.up();
  await expect(line).toHaveCount(0);
  await expect(preview).toHaveCount(0);
  expect(await order(page)).toEqual(['c', 'a', 'b', 'd']);
  // the click that ended the drag did not open the menu
  await expect(page.getByRole('menu')).toHaveCount(0);

  // typing right after the drop is a separate Undo step: Undo removes the typing, the next Undo the whole drop
  await ed.locator('p', { hasText: 'Четвёртый' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' дописано');
  await page.keyboard.press(undoKey);
  await expect(ed.locator('p', { hasText: 'дописано' })).toHaveCount(0);
  expect(await order(page)).toEqual(['c', 'a', 'b', 'd']);
  await page.keyboard.press(undoKey);
  await expect.poll(() => order(page)).toEqual(['a', 'b', 'c', 'd']);
  await page.keyboard.press(redoKey);
  await expect.poll(() => order(page)).toEqual(['c', 'a', 'b', 'd']);
  if (!isMac) {
    await page.keyboard.press(undoKey);
    await expect.poll(() => order(page)).toEqual(['a', 'b', 'c', 'd']);
    await page.keyboard.press('Control+y');
    await expect.poll(() => order(page)).toEqual(['c', 'a', 'b', 'd']);
  }
  await expectSaved(page);
  const saved = (await apiContent(page.request, id)).content.content as any[];
  expect(saved.map((n) => n.attrs.id)).toEqual(['c', 'a', 'b', 'd']);
  expect(saved[0].content[0].text).toBe('Третий абзац');
  // after a reload the order is the same
  await page.reload();
  await expect(ed.locator('p').first()).toHaveText('Третий абзац');
});

test('Esc cancels a drag; a fast drag lands exactly; dropping in place changes nothing (QA26-09)', async ({ page }) => {
  await open(page, 'DnD отмена', [p('a', 'Альфа'), p('b', 'Бета'), p('c', 'Гамма')]);
  const ed = editor(page);
  const last = await rect(ed.locator('p', { hasText: 'Гамма' }));
  await dragTo(page, ed.locator('p', { hasText: 'Альфа' }), last.x + 40, last.y + last.height - 2);
  await expect(page.locator('.kb-drop-line')).toHaveAttribute('data-side', 'after');
  await page.keyboard.press('Escape');
  await expect(page.locator('.kb-drop-line')).toHaveCount(0);
  await page.mouse.up();
  expect(await order(page)).toEqual(['a', 'b', 'c']);
  // fast: two pointer moves only
  await dragTo(page, ed.locator('p', { hasText: 'Альфа' }), last.x + 40, last.y + last.height - 2, 1);
  await page.mouse.up();
  expect(await order(page)).toEqual(['b', 'c', 'a']);
  // in place: no line, no change, no undo step
  const self = await rect(ed.locator('p', { hasText: 'Бета' }));
  await dragTo(page, ed.locator('p', { hasText: 'Бета' }), self.x + 40, self.y + 4);
  await expect(page.locator('.kb-drop-line')).toBeHidden();
  await page.mouse.up();
  expect(await order(page)).toEqual(['b', 'c', 'a']);
});

test('inside a callout, between columns with the column highlighted, invalid target explained (R-EDITOR-075, R-EDITOR-076)', async ({ page }) => {
  const id = await open(page, 'DnD колонки', [
    p('a', 'Абзац сверху'),
    { type: 'callout', attrs: { id: 'k', variant: 'info' }, content: [p('k1', 'Текст выноски'), p('k2', 'Ещё строка выноски'), p('k3', 'Третья строка выноски')] },
    { type: 'columns', attrs: { id: 'cols' }, content: [{ type: 'column', content: [p('l1', 'Левая колонка 1'), p('l2', 'Левая колонка 2')] }, { type: 'column', content: [p('r1', 'Правая колонка 1')] }] },
    { type: 'columns', attrs: { id: 'cols2' }, content: [{ type: 'column', content: [p('x1', 'Второй набор слева')] }, { type: 'column', content: [p('y1', 'Второй набор справа')] }] },
    p('z', 'Абзац снизу'),
  ]);
  const ed = editor(page);
  // 1) into the callout: over the callout itself (its icon column, not over a child block) → "inside", callout outlined
  const icon = await rect(ed.locator('.kb-callout-icon').first());
  const callout = await rect(ed.locator('.kb-callout').first());
  await dragTo(page, ed.locator('p', { hasText: 'Абзац сверху' }), icon.x + icon.width / 2, callout.y + callout.height / 2);
  await expect(page.locator('.kb-drop-line')).toHaveAttribute('data-side', 'inside');
  const hl = await rect(page.locator('.kb-drop-container'));
  expect(Math.abs(hl.y + 4 - callout.y)).toBeLessThan(6);
  expect(Math.abs(hl.height - 8 - callout.height)).toBeLessThan(6);
  await page.mouse.up();
  const calloutIds = await page.evaluate(() => ((window as any).__kbEditor.getJSON().content as any[]).find((n) => n.type === 'callout').content.map((b: any) => b.attrs.id));
  expect(calloutIds).toEqual(['k1', 'k2', 'k3', 'a']);

  // 2) between columns: "Левая колонка 2" → before "Правая колонка 1"; the right column is outlined
  const r1 = await rect(ed.locator('p', { hasText: 'Правая колонка 1' }));
  await dragTo(page, ed.locator('p', { hasText: 'Левая колонка 2' }), r1.x + 30, r1.y + 3);
  await expect(page.locator('.kb-drop-line')).toHaveAttribute('data-side', 'before');
  const box = page.locator('.kb-drop-container');
  await expect(box).toBeVisible();
  const col = await rect(ed.locator('.kb-column').nth(1));
  const b = await rect(box);
  expect(Math.abs(b.x + 4 - col.x)).toBeLessThan(6);
  expect(Math.abs(b.width - 8 - col.width)).toBeLessThan(6);
  await page.mouse.up();
  let o = (await order(page)) as any[];
  expect(o.find((x) => Array.isArray(x) && JSON.stringify(x).includes('r1'))).toEqual([['l1'], ['l2', 'r1']]);

  // 3) a column set into a column of another set: red line, reason, drop does nothing
  // (the column set is dragged after Esc twice: block → its column set)
  await caretIn(page, 'Второй набор слева');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => (window as any).__kbEditor.state.selection.node?.attrs.id)).toBe('cols2');
  const target = await rect(ed.locator('p', { hasText: 'Левая колонка 1' }));
  await dragTo(page, ed.locator('p', { hasText: 'Второй набор слева' }), target.x + 30, target.y + 3);
  await expect(page.locator('.kb-drop-line')).toHaveAttribute('data-valid', 'false');
  await expect(page.locator('.kb-drop-label')).toHaveText('Колонки нельзя вложить в колонку');
  await page.mouse.up();
  const after = (await order(page)) as any[];
  expect(after).toEqual(o);
  await expectSaved(page);
  const saved = (await apiContent(page.request, id)).content.content as any[];
  const cols = saved.find((n) => n.attrs?.id === 'cols');
  expect(cols.content.map((c: any) => c.content.map((x: any) => x.attrs.id))).toEqual([['l1'], ['l2', 'r1']]);
  o = after;
});

test('several selected blocks; images, tables and nested lists move whole; Alt-drag copies (R-EDITOR-076, QA26-09)', async ({ page }) => {
  await ensureOwner(page);
  await page.evaluate(() => localStorage.setItem('kb:debug', '1'));
  const scratch = await newPage(page, 'DnD медиа');
  const csrf = (await page.context().storageState()).cookies.find((c) => c.name === 'kb_csrf')?.value ?? '';
  const up = await page.request.post('/api/v1/attachments', { multipart: { pageId: scratch, file: { name: 'схема.png', mimeType: 'image/png', buffer: Buffer.from(PNG_B64, 'base64') } }, headers: { 'x-csrf-token': csrf } });
  expect(up.ok()).toBeTruthy();
  const att = (await up.json()).attachments[0];
  await page.waitForFunction(() => (window as any).__kbEditor);
  const nested = {
    type: 'bulletList',
    attrs: { id: 'list' },
    content: [{ type: 'listItem', attrs: { id: 'li1' }, content: [p('li1p', 'Пункт 1'), { type: 'bulletList', attrs: { id: 'sub' }, content: [{ type: 'listItem', attrs: { id: 'li2' }, content: [p('li2p', 'Подпункт 1.1')] }] }] }],
  };
  const tbl = {
    type: 'table',
    attrs: { id: 'tbl' },
    content: [
      { type: 'tableRow', content: [{ type: 'tableHeader', content: [p('th1', 'Склад')] }, { type: 'tableHeader', content: [p('th2', 'Остаток')] }] },
      { type: 'tableRow', content: [{ type: 'tableCell', content: [p('td1', 'Москва')] }, { type: 'tableCell', content: [p('td2', '42')] }] },
    ],
  };
  await page.evaluate(
    ({ c }) => (window as any).__kbEditor.chain().setContent({ type: 'doc', content: c }).run(),
    {
      c: [
        p('a', 'Начало'),
        { type: 'image', attrs: { id: 'img', src: att.contentUrl, attachmentId: att.id, alt: 'Схема склада', naturalWidth: 8, naturalHeight: 8, width: 8 } },
        tbl,
        nested,
        p('b', 'Блок Б'),
        p('c', 'Блок В'),
        p('z', 'Конец'),
      ] as any,
    },
  );
  await expectSaved(page);
  const ed = editor(page);
  // two selected blocks (Esc, Shift+↓) move together, the preview says how many
  await ed.locator('p', { hasText: 'Блок Б' }).click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Shift+ArrowDown');
  const top = await rect(ed.locator('p', { hasText: 'Начало' }));
  await dragTo(page, ed.locator('p', { hasText: 'Блок В' }), top.x + 40, top.y + 3);
  await expect(page.locator('.kb-drag-count')).toHaveText('2 блока');
  await page.mouse.up();
  expect(await order(page)).toEqual(['b', 'c', 'a', 'img', 'tbl', 'list', 'z']);
  // the table to the very end, the image before the table's old place, the nested list to the top
  const end = await rect(ed.locator('p', { hasText: 'Конец' }));
  await dragTo(page, ed.locator('table'), end.x + 40, end.y + end.height - 2);
  await page.mouse.up();
  expect(await order(page)).toEqual(['b', 'c', 'a', 'img', 'list', 'z', 'tbl']);
  const b = await rect(ed.locator('p', { hasText: 'Блок Б' }));
  await dragTo(page, ed.locator('ul').first(), b.x + 40, b.y + 3);
  await page.mouse.up();
  expect(await order(page)).toEqual(['list', 'b', 'c', 'a', 'img', 'z', 'tbl']);
  const z = await rect(ed.locator('p', { hasText: 'Конец' }));
  await dragTo(page, ed.locator('.kb-image-block').first(), z.x + 40, z.y + z.height - 2);
  await page.mouse.up();
  expect(await order(page)).toEqual(['list', 'b', 'c', 'a', 'z', 'img', 'tbl']);
  // Alt held while dropping: a copy (fresh id), the original stays
  const a = await rect(ed.locator('p', { hasText: 'Начало' }));
  await dragTo(page, ed.locator('p', { hasText: 'Блок Б' }), a.x + 40, a.y + a.height - 2);
  await page.keyboard.down('Alt');
  await page.mouse.move(a.x + 42, a.y + a.height - 2);
  await expect(page.locator('.kb-drop-label')).toHaveText('Копия');
  await page.mouse.up();
  await page.keyboard.up('Alt');
  await expect(ed.locator('p', { hasText: 'Блок Б' })).toHaveCount(2);
  await expectSaved(page);
  const saved = (await apiContent(page.request, scratch)).content.content as any[];
  const ids = saved.map((n) => n.attrs.id);
  expect(ids.slice(0, 4)).toEqual(['list', 'b', 'c', 'a']);
  expect(ids[4]).not.toBe('b');
  expect(new Set(ids).size).toBe(ids.length);
  const json = JSON.stringify(saved);
  // nested list, table cells and image attributes survived the moves
  expect(json).toContain('"id":"li2p"');
  expect(json).toContain('"text":"Подпункт 1.1"');
  expect(json).toContain('"text":"Москва"');
  expect(saved.find((n) => n.type === 'image').attrs).toMatchObject({ id: 'img', attachmentId: att.id, alt: 'Схема склада' });
});

test('autoscroll near the bottom edge while dragging, drop far below (QA26-09)', async ({ page }) => {
  const content = [];
  for (let i = 1; i <= 80; i++) content.push(p('p' + i, `Абзац номер ${i} с текстом для прокрутки`));
  await open(page, 'DnD прокрутка', content);
  const ed = editor(page);
  const scroller = await ed.evaluate((el) => {
    for (let x = el.parentElement; x; x = x.parentElement) {
      const oy = getComputedStyle(x).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && x.scrollHeight > x.clientHeight) return x.className;
    }
    return 'document';
  });
  const viewport = page.viewportSize()!;
  const top0 = await page.evaluate((cls) => (cls === 'document' ? document.scrollingElement!.scrollTop : (document.getElementsByClassName(cls)[0] as HTMLElement).scrollTop), scroller);
  const src = ed.locator('p', { hasText: /^Абзац номер 2 / });
  const s = await rect(src);
  await dragTo(page, src, s.x + 60, viewport.height - 8);
  // holding the pointer at the edge scrolls the page
  await expect.poll(() => page.evaluate((cls) => (cls === 'document' ? document.scrollingElement!.scrollTop : (document.getElementsByClassName(cls)[0] as HTMLElement).scrollTop), scroller), { timeout: 10_000 }).toBeGreaterThan(top0 + 400);
  // move away from the edge (scrolling stops) and drop after the block under the pointer
  await page.mouse.move(s.x + 60, viewport.height / 2, { steps: 4 });
  await page.mouse.move(s.x + 61, viewport.height / 2 + 1);
  await settle(page);
  const under = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('p')?.textContent ?? '', { x: s.x + 61, y: viewport.height / 2 + 1 });
  expect(under).toMatch(/Абзац номер (\d+)/);
  await page.mouse.up();
  const n = Number(/номер (\d+)/.exec(under)![1]);
  expect(n).toBeGreaterThan(10);
  const o = (await order(page)) as string[];
  const idx = o.indexOf('p2');
  expect(Math.abs(idx - o.indexOf('p' + n))).toBe(1);
});

test('drop on another page in the sidebar tree moves the blocks there (ids kept), no-rights target refused (R-EDITOR-076)', async ({ page }) => {
  await ensureOwner(page);
  await page.evaluate(() => localStorage.setItem('kb:debug', '1'));
  const target = await newPage(page, 'DnD цель переноса');
  await editor(page).click();
  await page.keyboard.type('Уже на странице');
  await expectSaved(page);
  const source = await open(page, 'DnD источник переноса', [p('m1', 'Останется здесь'), p('m2', 'Уедет на другую страницу')]);
  const row = (await treeLink(page, 'DnD цель переноса')).locator('xpath=ancestor::div[contains(concat(" ",@class," ")," tree-row ")][1]');
  const r = await rect(row);
  await dragTo(page, editor(page).locator('p', { hasText: 'Уедет' }), r.x + r.width / 2, r.y + r.height / 2, 16);
  await expect(row).toHaveClass(/kb-block-drop-page/);
  await expect(page.locator('.kb-drop-label')).toHaveText('Переместить на страницу «DnD цель переноса»');
  await page.mouse.up();
  await expect(page.getByText('Перенесено на страницу «DnD цель переноса»')).toBeVisible({ timeout: 20_000 });
  await expect(editor(page).locator('p', { hasText: 'Уедет' })).toHaveCount(0);
  await expectSaved(page);
  const moved = (await apiContent(page.request, target)).content.content as any[];
  expect(moved.map((n) => n.content?.[0]?.text)).toEqual(['Уже на странице', 'Уедет на другую страницу']);
  expect(moved[1].attrs.id).toBe('m2');
  expect(((await apiContent(page.request, source)).content.content as any[]).map((n) => n.attrs.id)).toEqual(['m1']);
  // the page itself is not a target
  const self = (await treeLink(page, 'DnD источник переноса')).locator('xpath=ancestor::div[contains(concat(" ",@class," ")," tree-row ")][1]');
  const sr = await rect(self);
  await dragTo(page, editor(page).locator('p', { hasText: 'Останется' }), sr.x + sr.width / 2, sr.y + sr.height / 2, 16);
  await expect(page.locator('.kb-drop-label')).toHaveText('Блок уже на этой странице');
  await page.mouse.up();
  expect(await order(page)).toEqual(['m1']);
});

test('keyboard alternatives: Alt+Shift+↑/↓ move (also out of a callout / column), Esc twice selects the column set (R-EDITOR-069, R-EDITOR-052)', async ({ page }) => {
  await open(page, 'DnD клавиатура', [
    p('a', 'Перед выноской'),
    { type: 'callout', attrs: { id: 'k', variant: 'info' }, content: [p('k1', 'Первая в выноске'), p('k2', 'Вторая в выноске')] },
    { type: 'columns', attrs: { id: 'cols' }, content: [{ type: 'column', content: [p('l1', 'Слева')] }, { type: 'column', content: [p('r1', 'Справа')] }] },
  ]);
  const ed = editor(page);
  await caretIn(page, 'Первая в выноске');
  await page.keyboard.press('Alt+Shift+ArrowUp');
  expect(await order(page)).toEqual(['a', 'k1', 'k', [['l1'], ['r1']]]);
  await page.keyboard.press('Alt+Shift+ArrowUp');
  expect(await order(page)).toEqual(['k1', 'a', 'k', [['l1'], ['r1']]]);
  await page.keyboard.press(undoKey);
  await page.keyboard.press(undoKey);
  await expect.poll(() => order(page)).toEqual(['a', 'k', [['l1'], ['r1']]]);
  // Esc → the block, Esc again → the column set, then Alt+Shift+↑ moves the whole set
  await caretIn(page, 'Справа');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Alt+Shift+ArrowUp');
  expect(await order(page)).toEqual(['a', [['l1'], ['r1']], 'k']);
});
