import { test, expect, type Page } from '@playwright/test';
import { ensureOwner, newPage, editor, expectSaved, apiContent, createUser, login_, caretIn } from './helpers';

test.describe.configure({ mode: 'serial' });

const UNDO = 'Control+z';
/** Text of elements without the remote carets (name labels of other participants). */
const clean = (loc: import('@playwright/test').Locator) =>
  loc.evaluateAll((els) =>
    els.map((e) => {
      const c = e.cloneNode(true) as HTMLElement;
      c.querySelectorAll('.collab-caret').forEach((x) => x.remove());
      return (c.textContent ?? '').trim();
    }),
  );
const blockTexts = (page: Page) => clean(editor(page).locator(':scope > *'));
const cell = (page: Page, r: number, c: number) => editor(page).locator('table tr').nth(r).locator('td, th').nth(c);
const cellText = async (page: Page, r: number, c: number) => (await clean(cell(page, r, c)))[0];

async function colleague(page: Page, browser: import('@playwright/test').Browser, id: string, name: string) {
  const u = await createUser(page.request, name, { pageGrants: [{ pageId: id, level: 'edit' }] });
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto('/p/' + id);
  await login_(p, u.email, u.password);
  await expect(editor(p)).toBeVisible();
  return { ctx, p };
}

async function typeAtEnd(page: Page, target: ReturnType<typeof cell>, text: string) {
  await target.click();
  await page.keyboard.press('End');
  await page.keyboard.type(text);
}

test('two editors change a paragraph, one table and the structure while one loses the connection: no confirmed text is lost (ROUTE-05, SC-25, AT-56, R-COLLAB-024)', async ({ page, browser }) => {
  await ensureOwner(page);
  await page.waitForLoadState('networkidle'); // first run: let the shell finish loading before creating pages
  const id = await newPage(page, 'Таблица вдвоём');
  await page.keyboard.type('Вводный абзац.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/табл');
  await page.keyboard.press('Enter');
  await expect(editor(page).locator('table')).toBeVisible();
  await typeAtEnd(page, cell(page, 0, 0), 'Склад');
  await typeAtEnd(page, cell(page, 1, 0), 'Москва');
  await typeAtEnd(page, cell(page, 2, 0), 'Казань');
  await expectSaved(page);
  const { ctx, p: bob } = await colleague(page, browser, id, 'Борис Табличный');
  await expect.poll(() => cellText(bob, 2, 0)).toBe('Казань');

  await ctx.setOffline(true);
  // Bob (offline): the same cell, the neighbouring row and a new section heading
  await typeAtEnd(bob, cell(bob, 1, 0), ' (Борис)');
  await typeAtEnd(bob, cell(bob, 2, 0), ' — склад Бориса');
  await caretIn(bob, 'Вводный абзац.');
  await bob.keyboard.press('End');
  await bob.keyboard.press('Enter');
  await bob.keyboard.type('## Раздел Бориса');
  // Anna (online): the same cell, another row, the paragraph
  await typeAtEnd(page, cell(page, 1, 0), ' (Анна)');
  await typeAtEnd(page, cell(page, 1, 1), '120');
  await caretIn(page, 'Вводный абзац.');
  await page.keyboard.press('End');
  await page.keyboard.type(' Дополнено Анной.');
  await expectSaved(page);
  const confirmed = JSON.stringify((await apiContent(page.request, id)).content);

  await ctx.setOffline(false);
  await expectSaved(bob);
  await expectSaved(page);
  for (const p of [page, bob]) {
    await expect(cell(p, 1, 0)).toContainText('(Анна)');
    await expect(cell(p, 1, 0)).toContainText('(Борис)');
    await expect.poll(() => cellText(p, 1, 1)).toBe('120');
    await expect.poll(() => cellText(p, 2, 0)).toBe('Казань — склад Бориса');
    await expect(editor(p).locator('h2')).toContainText('Раздел Бориса');
    await expect(editor(p)).toContainText('Вводный абзац. Дополнено Анной.');
  }
  expect(await blockTexts(page)).toEqual(await blockTexts(bob));
  const final = JSON.stringify((await apiContent(page.request, id)).content);
  // every confirmed piece of text is still there
  for (const s of ['Дополнено Анной.', '(Анна)', '120', 'Склад']) {
    expect(confirmed).toContain(s);
    expect(final).toContain(s);
  }
  await ctx.close();
});

test('a block is moved by one editor while another edits it: the edit is kept as a conflict copy and restored in one click (OPS-006, R-COLLAB-049, R-COLLAB-045, R-COLLAB-041, R-COLLAB-033, E-04, COLLAB-193, AT-90)', async ({ page, browser }) => {
  await ensureOwner(page);
  await page.waitForLoadState('networkidle'); // first run: let the shell finish loading before creating pages
  const id = await newPage(page, 'Перенос и правка');
  await page.keyboard.type('Первый абзац');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Второй абзац');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Третий абзац');
  await expectSaved(page);
  const { ctx, p: bob } = await colleague(page, browser, id, 'Борис Переносящий');
  await expect(editor(bob)).toContainText('Третий абзац');

  // Bob (offline) moves "Второй" above "Первый"; Anna meanwhile edits "Первый"
  await ctx.setOffline(true);
  await caretIn(bob, 'Второй абзац');
  await bob.keyboard.press('Alt+Shift+ArrowUp');
  await expect.poll(() => blockTexts(bob)).toEqual(['Второй абзац', 'Первый абзац', 'Третий абзац']);
  await caretIn(page, 'Первый абзац');
  await page.keyboard.press('End');
  await page.keyboard.type(' с правкой Анны');
  await expectSaved(page);
  await ctx.setOffline(false);
  await expectSaved(bob);

  // the order follows the move; Anna's text is never silently gone: either merged or offered back
  await expect.poll(async () => (await blockTexts(page))[0], { timeout: 15_000 }).toBe('Второй абзац');
  const notice = page.locator('.toast').filter({ hasText: 'Ваша версия сохранена' });
  if (!(await editor(page).innerText()).includes('с правкой Анны')) {
    await expect(notice).toBeVisible({ timeout: 15_000 });
    await notice.getByRole('button', { name: 'Вернуть мою версию' }).click();
    const conflicts = await (await page.request.get(`/api/v1/pages/${id}/conflicts`)).json();
    expect(conflicts.conflicts[0]).toMatchObject({ reason: 'moved', resolution: 'restored' });
  }
  await expect.poll(() => blockTexts(page)).toEqual(['Второй абзац', 'Первый абзац с правкой Анны', 'Третий абзац']);
  await expectSaved(page);
  await expect.poll(() => blockTexts(bob), { timeout: 15_000 }).toEqual(['Второй абзац', 'Первый абзац с правкой Анны', 'Третий абзац']);
  expect(JSON.stringify((await apiContent(page.request, id)).content)).toContain('Первый абзац с правкой Анны');
  await ctx.close();
});

test("undo of a block move never silently drops a colleague's edits (UX13-10, R-HISTORY-011)", async ({ page, browser }) => {
  await ensureOwner(page);
  await page.waitForLoadState('networkidle'); // first run: let the shell finish loading before creating pages
  const id = await newPage(page, 'Отмена переноса');
  await page.keyboard.type('Альфа');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Бета');
  await expectSaved(page);
  const { ctx, p: bob } = await colleague(page, browser, id, 'Борис Соавтор');
  await expect(editor(bob)).toContainText('Бета');
  await page.waitForTimeout(650);
  await caretIn(page, 'Бета');
  await page.keyboard.press('Alt+Shift+ArrowUp');
  await expect.poll(() => blockTexts(bob)).toEqual(['Бета', 'Альфа']);
  await expectSaved(page);
  // Bob edits the block that took part in the move
  await caretIn(bob, 'Альфа');
  await bob.keyboard.press('End');
  await bob.keyboard.type(' и правка Бориса');
  await expectSaved(bob);
  await expect(editor(page)).toContainText('правка Бориса');
  // Anna undoes her move
  await editor(page).locator('p', { hasText: 'Бета' }).click();
  await page.keyboard.press(UNDO);
  // the move is undone: "Альфа" is above "Бета" again
  await expect
    .poll(async () => {
      const b = await blockTexts(page);
      return b.findIndex((t) => t.startsWith('Альфа')) >= 0 && b.findIndex((t) => t.startsWith('Альфа')) < b.indexOf('Бета');
    })
    .toBe(true);
  // Bob's text survives — directly, or via his conflict copy restored in one click
  const notice = bob.locator('.toast').filter({ hasText: 'Ваша версия сохранена' });
  await expect(async () => {
    const t = await editor(bob).innerText();
    expect(t.includes('правка Бориса') || (await notice.isVisible())).toBe(true);
  }).toPass({ timeout: 15_000 });
  if (!(await editor(bob).innerText()).includes('правка Бориса')) await notice.getByRole('button', { name: 'Вернуть мою версию' }).click();
  await expect(editor(bob)).toContainText('и правка Бориса');
  await expect(editor(page)).toContainText('и правка Бориса', { timeout: 15_000 });
  await expectSaved(bob);
  await expectSaved(page);
  expect(await blockTexts(page)).toEqual(await blockTexts(bob));
  const saved = JSON.stringify((await apiContent(page.request, id)).content);
  expect(saved).toContain('и правка Бориса');
  expect(saved.split('и правка Бориса').length - 1).toBe(1);
  await ctx.close();
});

test('undo/redo sequences of 100 and 1000 steps, transform and delete are reversible; history does not cross a reload (QA26-14, R-HISTORY-017, R-HISTORY-011)', async ({ page }) => {
  test.setTimeout(240_000);
  await ensureOwner(page);
  await page.waitForLoadState('networkidle'); // first run: let the shell finish loading before creating pages
  const id = await newPage(page, 'Длинные последовательности');
  await page.keyboard.type('Основа');
  await expectSaved(page);
  for (const n of [100, 1000]) {
    const r = await page.evaluate(async (count) => {
      const ed = (document.querySelector('.kb-editor') as any).editor;
      const undoPlugin = ed.state.plugins.find((p: any) => String(p.key).startsWith('y-undo'));
      const um = undoPlugin.getState(ed.state).undoManager;
      const text = () => ed.state.doc.textContent as string;
      // yield to the event loop now and then (sync, status indicator), as during real editing
      const tick = (i: number) => (i % 50 === 0 ? new Promise((r) => setTimeout(r, 0)) : Promise.resolve());
      const tok = (i: number) => `‹${count}:${i}›`;
      const base = text();
      const bad: string[] = [];
      ed.commands.focus('end');
      um.stopCapturing(); // earlier typing is its own step
      for (let i = 0; i < count; i++) {
        ed.commands.insertContent(tok(i));
        await tick(i);
        um.stopCapturing(); // each insertion is its own step
      }
      const full = text();
      if (!full.endsWith(tok(count - 1))) bad.push('not appended at the end: ' + full.slice(-30));
      for (let i = count - 1; i >= 0; i--) {
        ed.commands.undo();
        await tick(i);
        const now = text();
        if (now.includes(tok(i)) || (i > 0 && !now.includes(tok(i - 1)))) bad.push(`undo ${i}: ${now.slice(-30)}`);
        if (bad.length > 3) break;
      }
      const afterUndo = text();
      for (let i = 0; i < count; i++) {
        ed.commands.redo();
        await tick(i);
      }
      return { base, full, afterUndo, afterRedo: text(), bad };
    }, n);
    expect(r.bad).toEqual([]);
    expect(r.afterUndo).toBe(r.base);
    expect(r.afterRedo).toBe(r.full);
    await expectSaved(page);
  }
  // transform (paragraph → heading) and delete are single undo steps
  await page.waitForTimeout(650);
  await editor(page).locator('p').first().click();
  await page.keyboard.press('Control+Alt+1');
  await expect(editor(page).locator('h1')).toHaveCount(1);
  await page.waitForTimeout(650);
  await page.keyboard.press(UNDO);
  await expect(editor(page).locator('h1')).toHaveCount(0);
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  await expect(editor(page)).not.toContainText('‹1000:999›');
  await page.waitForTimeout(650);
  await page.keyboard.press(UNDO);
  await expect(editor(page)).toContainText('‹1000:999›');
  await expectSaved(page);
  const before = await editor(page).innerText();
  // after a reload the undo history starts afresh: Ctrl+Z cannot reach changes made before it
  await page.reload();
  await expect(editor(page)).toContainText('‹1000:999›');
  await editor(page).click();
  await page.keyboard.press(UNDO);
  await page.waitForTimeout(500);
  expect(await editor(page).innerText()).toBe(before);
  expect(JSON.stringify((await apiContent(page.request, id)).content)).toContain('‹1000:999›');
});

test('Esc in the empty title of a new page cancels it; a double "+" on a slow network creates exactly one page (R-TREE-025, UX23-203)', async ({ page }) => {
  await ensureOwner(page);
  await page.waitForLoadState('networkidle'); // first run: let the shell finish loading before creating pages
  const tree = page.getByRole('tree', { name: 'Страницы' });
  const nav = page.getByRole('navigation', { name: 'Навигация' });
  const untitled = () => tree.getByRole('treeitem').filter({ hasText: 'Без названия' }).count();
  const before = await untitled();
  await nav.getByRole('button', { name: 'Новая страница', exact: true }).click();
  await page.waitForURL(/\/p\//);
  await expect(page.getByLabel('Название страницы')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page).not.toHaveURL(/\/p\//);
  await expect.poll(untitled, { timeout: 10_000 }).toBe(before);

  // the create request is slow: two quick clicks still give one page
  let creates = 0;
  await page.route('**/api/v1/pages', async (route) => {
    if (route.request().method() === 'POST') {
      creates++;
      await new Promise((r) => setTimeout(r, 1200));
    }
    await route.continue();
  });
  await nav.getByRole('button', { name: 'Новая страница', exact: true }).click();
  await nav.getByRole('button', { name: 'Новая страница', exact: true }).click();
  await page.waitForURL(/\/p\//);
  await page.getByLabel('Название страницы').fill('Одна страница');
  await page.getByLabel('Название страницы').press('Enter');
  await page.unroute('**/api/v1/pages');
  await expect(tree.getByRole('treeitem').filter({ hasText: 'Одна страница' })).toHaveCount(1);
  await expect.poll(untitled).toBe(before);
  expect(creates).toBe(1);
});
