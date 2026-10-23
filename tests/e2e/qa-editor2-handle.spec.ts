import { test, expect, type Page } from '@playwright/test';
import { ensureOwner, editor, expectSaved, apiContent, createUser, login_ } from './helpers';
import { newPage, cleanupCreatedPages, settle } from './editor-p0-helpers';

/**
 * Block handle (apps/web/src/editor/menus/BlockHandle.tsx): «Добавить блок ниже», «Превратить в», «Цвет текста» →
 * «По умолчанию», «Копировать ссылку на блок», «Копировать как Markdown», «Комментировать», and the reader's
 * «Комментировать» button (Editor.tsx ReadOnlyCommentButton) — QA26-01/03/06, R-QA-004. Server content, clipboard,
 * Undo/Redo, reload, a refused clipboard and readers with and without comment rights.
 */
cleanupCreatedPages();

const UNDO = 'Control+z';
const REDO = 'Control+Shift+z';
type Node = { type: string; attrs?: Record<string, any>; content?: Node[]; text?: string; marks?: any[] };
const blocks = async (page: Page, id: string) => (await apiContent(page.request, id)).content.content as Node[];
const textOf = (b: Node): string => (b.text ?? '') + (b.content ?? []).map(textOf).join('');
const shape = async (page: Page, id: string) => (await blocks(page, id)).map((b) => `${b.type}${b.attrs?.level ? b.attrs.level : ''}:${textOf(b)}`);

/** Hovers the block with `text` and opens «Действия с блоком» once the handle stands next to it. */
async function blockMenu(page: Page, text: string) {
  const block = editor(page).locator('p, h1, h2, h3, li', { hasText: text }).first();
  await block.hover();
  const handle = page.getByRole('button', { name: 'Действия с блоком' });
  await expect
    .poll(async () => {
      const [b, h] = [await block.boundingBox(), await handle.boundingBox()];
      return !!b && !!h && h.y + h.height / 2 >= b.y - 2 && h.y + h.height / 2 <= b.y + b.height + 2;
    })
    .toBe(true);
  await handle.click();
  await expect(page.getByRole('menu', { name: 'Действия с блоком' })).toBeVisible();
}

async function threeBlocks(page: Page, title: string) {
  await ensureOwner(page);
  const id = await newPage(page, title);
  await page.keyboard.type('Блок А');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Блок Б');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Блок В');
  await expectSaved(page);
  return id;
}

test('R-EDITOR-052, QA-E9 «Добавить блок ниже»: opens the «/» menu in a new block under the hovered one, Esc leaves «/» as text with the caret after it, a pick inserts the block there — stored, Undo/Redo, after reload', async ({ page }) => {
  const id = await threeBlocks(page, 'Блок ниже');
  const add = page.getByRole('button', { name: 'Добавить блок ниже' });
  // cancel: the menu closes, the typed «/» stays as text and can be erased
  await editor(page).locator('p', { hasText: 'Блок А' }).hover();
  await add.click();
  const menu = page.getByRole('listbox');
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  // QA-E9 (fixed): Esc only closes the menu — the caret stays after «/», the next key does not replace the block
  await page.keyboard.type('x');
  await expect(editor(page).locator('p').nth(1)).toHaveText('/x');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await expectSaved(page);
  await expect.poll(() => shape(page, id)).toEqual(['paragraph:Блок А', 'paragraph:Блок Б', 'paragraph:Блок В']);
  // success: a heading under «Блок А»
  await editor(page).locator('p', { hasText: 'Блок А' }).hover();
  await add.click();
  await expect(menu).toBeVisible();
  await page.keyboard.type('заголовок 2');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Новый раздел');
  await expectSaved(page);
  await expect.poll(() => shape(page, id)).toEqual(['paragraph:Блок А', 'heading2:Новый раздел', 'paragraph:Блок Б', 'paragraph:Блок В']);
  // Undo removes the typed text and the heading, Redo brings them back
  for (let i = 0; i < 3; i++) await page.keyboard.press(UNDO);
  await expectSaved(page);
  await expect.poll(async () => (await shape(page, id)).includes('heading2:Новый раздел')).toBe(false);
  for (let i = 0; i < 3; i++) await page.keyboard.press(REDO);
  await expectSaved(page);
  await expect.poll(() => shape(page, id)).toEqual(['paragraph:Блок А', 'heading2:Новый раздел', 'paragraph:Блок Б', 'paragraph:Блок В']);
  await page.reload();
  await expect(editor(page).locator('h2')).toHaveText('Новый раздел');
});

test('R-EDITOR-052 «Превратить в» and «Цвет текста» → «По умолчанию» from the block menu: Esc closes without change; stored, Undo/Redo, after reload', async ({ page }) => {
  const id = await threeBlocks(page, 'Превратить из меню блока');
  // cancel
  await blockMenu(page, 'Блок Б');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu', { name: 'Действия с блоком' })).toHaveCount(0);
  // «Превратить в» → «Заголовок 3» (keyboard: the submenu of a block next to the sidebar opens to the side)
  await blockMenu(page, 'Блок Б');
  await page.getByRole('menuitem', { name: 'Превратить в' }).press('ArrowRight');
  await page.getByRole('menuitem', { name: /^Заголовок 3/ }).press('Enter');
  await expectSaved(page);
  await expect.poll(() => shape(page, id)).toEqual(['paragraph:Блок А', 'heading3:Блок Б', 'paragraph:Блок В']);
  await expect(editor(page).locator('h3')).toHaveText('Блок Б');
  // a colour, then «По умолчанию» removes it
  await blockMenu(page, 'Блок В');
  await page.getByRole('menuitem', { name: 'Цвет текста' }).press('ArrowRight');
  await page.getByRole('menuitem', { name: /Синий$/ }).press('Enter');
  await expectSaved(page);
  const colored = async () => JSON.stringify((await blocks(page, id))[2]).includes('#2f5fa8');
  await expect.poll(colored).toBe(true);
  await blockMenu(page, 'Блок В');
  await page.getByRole('menuitem', { name: 'Цвет текста' }).press('ArrowRight');
  await page.getByRole('menuitem', { name: 'По умолчанию' }).press('Enter');
  await expectSaved(page);
  await expect.poll(colored).toBe(false);
  await expect(editor(page).locator('p', { hasText: 'Блок В' }).locator('[style*="color"]')).toHaveCount(0);
  // Undo / Redo of «По умолчанию»
  await editor(page).locator('p', { hasText: 'Блок А' }).click();
  await page.keyboard.press(UNDO);
  await expectSaved(page);
  await expect.poll(colored).toBe(true);
  await page.keyboard.press(REDO);
  await expectSaved(page);
  await expect.poll(colored).toBe(false);
  await page.reload();
  await expect(editor(page).locator('h3')).toHaveText('Блок Б');
  await expect(editor(page).locator('[style*="color"]')).toHaveCount(0);
});

test('R-CLIPBOARD-001 «Копировать ссылку на блок» opens the page at that block; «Копировать как Markdown» copies the block; a refused clipboard offers the text for manual copying', async ({ page }) => {
  const id = await threeBlocks(page, 'Ссылка на блок');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(page.url()).origin });
  // turn «Блок Б» into a heading so the Markdown is recognisable
  await editor(page).locator('p', { hasText: 'Блок Б' }).click();
  await page.keyboard.press('Home');
  await page.keyboard.type('## ');
  await expectSaved(page);
  const blockId = (await blocks(page, id))[1].attrs?.id as string;
  expect(blockId).toBeTruthy();
  await blockMenu(page, 'Блок Б');
  await page.getByRole('menuitem', { name: 'Копировать ссылку на блок' }).click();
  await expect(page.locator('.toasts')).toContainText('Ссылка на блок скопирована');
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toBe(`${new URL(page.url()).origin}/p/${id}?block=${blockId}`);
  await blockMenu(page, 'Блок Б');
  await page.getByRole('menuitem', { name: 'Копировать как Markdown' }).click();
  await expect(page.locator('.toasts')).toContainText('Скопировано в формате Markdown');
  expect((await page.evaluate(() => navigator.clipboard.readText())).trim()).toBe('## Блок Б');
  // the copied link opens the page with the block highlighted
  await page.goto(link);
  await expect(page.locator(`.kb-flash-overlay[data-block="${blockId}"]`)).toBeVisible();
  // error: the browser refuses the clipboard — the link is offered in a dialog
  await page.evaluate(() => {
    const deny = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));
    Object.defineProperty(navigator.clipboard, 'write', { value: deny, configurable: true });
    Object.defineProperty(navigator.clipboard, 'writeText', { value: deny, configurable: true });
  });
  await blockMenu(page, 'Блок А');
  await page.getByRole('menuitem', { name: 'Копировать ссылку на блок' }).click();
  await expect(page.locator('.toasts')).toContainText('Браузер запретил доступ к буферу обмена');
  const dlg = page.getByRole('dialog', { name: 'Скопируйте вручную' });
  await expect(dlg.getByRole('textbox', { name: 'Текст для копирования' })).toHaveValue(new RegExp(`/p/${id}\\?block=`));
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
});

test('R-COMMENTS-001 «Комментировать» from the block menu opens a draft quoting the block (Esc cancels, nothing stored); posted — stored and anchored; a reader with comment rights uses the «Комментировать» button on a selection, a reader without them is told so', async ({ page, browser }) => {
  const id = await threeBlocks(page, 'Комментарий к блоку');
  const threads = async (p: Page = page) => ((await (await p.request.get(`/api/v1/pages/${id}/comments`)).json()).threads ?? []) as Array<{ quote: string; blockId: string; comments: Array<{ text: string }> }>;
  const box = page.getByRole('textbox', { name: 'Новый комментарий… @ — упомянуть' });
  // cancel
  await blockMenu(page, 'Блок Б');
  await page.getByRole('menuitem', { name: 'Комментировать' }).click();
  await expect(box).toBeFocused();
  await expect(page.locator('.cm-draft .cm-quote')).toHaveText('Блок Б');
  await box.press('Escape');
  await expect(box).toHaveCount(0);
  expect(await threads()).toEqual([]);
  // success
  await blockMenu(page, 'Блок Б');
  await page.getByRole('menuitem', { name: 'Комментировать' }).click();
  await box.fill('Уточнить формулировку');
  await page.getByRole('complementary', { name: 'Комментарии' }).getByRole('button', { name: 'Комментировать' }).click();
  await expect.poll(async () => (await threads()).map((t) => [t.quote, t.comments[0]?.text])).toEqual([['Блок Б', 'Уточнить формулировку']]);
  const blockId = (await blocks(page, id))[1].attrs?.id;
  expect((await threads())[0].blockId).toBe(blockId);
  await expectSaved(page);
  await expect.poll(async () => JSON.stringify((await blocks(page, id))[1])).toContain('"type":"comment"');
  // a reader with comment rights: no block handle, a «Комментировать» button over the selection
  const commenter = await createUser(page.request, 'Комментатор', { pageGrants: [{ pageId: id, level: 'comment' }] });
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await p2.goto('/p/' + id);
  await login_(p2, commenter.email, commenter.password);
  await expect(editor(p2)).toContainText('Блок В');
  await editor(p2).locator('p', { hasText: 'Блок В' }).hover();
  await expect(p2.getByRole('button', { name: 'Действия с блоком' })).toHaveCount(0);
  await editor(p2).locator('p', { hasText: 'Блок В' }).click({ clickCount: 3 });
  await settle(p2);
  const ro = p2.getByRole('button', { name: 'Комментировать', exact: true });
  await expect(ro).toBeVisible();
  await ro.click();
  await p2.getByRole('textbox', { name: 'Новый комментарий… @ — упомянуть' }).fill('Вопрос читателя');
  await p2.getByRole('complementary', { name: 'Комментарии' }).getByRole('button', { name: 'Комментировать' }).click();
  await expect.poll(async () => (await threads()).map((t) => t.comments[0]?.text).sort()).toEqual(['Вопрос читателя', 'Уточнить формулировку']);
  await ctx.close();
  // a reader without comment rights: the button is there, but the action explains the missing right
  const viewer = await createUser(page.request, 'Только чтение', { pageGrants: [{ pageId: id, level: 'view' }] });
  const ctx3 = await browser.newContext();
  const p3 = await ctx3.newPage();
  await p3.goto('/p/' + id);
  await login_(p3, viewer.email, viewer.password);
  await editor(p3).locator('p', { hasText: 'Блок А' }).click({ clickCount: 3 });
  await settle(p3);
  await p3.getByRole('button', { name: 'Комментировать', exact: true }).click();
  await expect(p3.locator('.toasts')).toContainText('У вас нет прав на комментирование этой страницы');
  await ctx3.close();
  expect((await threads()).length).toBe(2);
});
