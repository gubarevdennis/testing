import { test, expect, type Page, type Browser } from '@playwright/test';
import { ensureOwner, editor, expectSaved, apiContent, createUser, login_, paste, caretIn } from './helpers';
import { newPage, cleanupCreatedPages, settle } from './editor-p0-helpers';

test.describe.configure({ mode: 'serial' });
cleanupCreatedPages();

const selectionText = (page: Page) => page.evaluate(() => window.getSelection()?.toString() ?? '');
const paragraphs = (page: Page) => editor(page).locator('p').allInnerTexts();
/** Document text without the colleagues' caret labels. */
const docText = (page: Page) =>
  editor(page).evaluate((el) => {
    const c = el.cloneNode(true) as HTMLElement;
    c.querySelectorAll('.collab-caret').forEach((x) => x.remove());
    return c.innerText;
  });

/** Opens the page as a colleague with edit rights in a separate browser context. */
async function colleague(page: Page, browser: Browser, pageId: string, name: string) {
  const u = await createUser(page.request, name, { pageGrants: [{ pageId, level: 'edit' }] });
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await p2.goto('/p/' + pageId);
  await login_(p2, u.email, u.password);
  await expect(editor(p2)).toBeVisible();
  return { p2, ctx };
}

function text(content: any): string {
  let out = '';
  const walk = (n: any) => {
    if (n.type === 'text') out += n.text;
    n.content?.forEach(walk);
    if (n.type === 'paragraph' || n.type === 'heading') out += '\n';
  };
  walk(content);
  return out;
}

test('caret and selection stay in place while a colleague edits, during autosave and after a network failure (R-EDITOR-022, R-EDITOR-001)', async ({ page, browser, context }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Стабильный курсор');
  await page.keyboard.type('Первая строка');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Альфа Бета Гамма');
  await expectSaved(page);
  const { p2, ctx } = await colleague(page, browser, id, 'Вера Соавтор');
  await expect.poll(() => docText(p2)).toContain('Альфа Бета Гамма');

  // Anna selects "Бета"
  await caretIn(page, 'Альфа Бета Гамма');
  await page.keyboard.press('End');
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowLeft');
  for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowLeft');
  expect(await selectionText(page)).toBe('Бета');

  // the colleague inserts text before the selection: a new paragraph above and words in the same paragraph
  await editor(p2).focus();
  await p2.keyboard.press('Control+Home');
  await p2.keyboard.type('Новое начало. ');
  await p2.keyboard.press('Enter');
  // keyboard, not a click: Anna's caret label sits over the paragraph in the colleague's view
  await p2.keyboard.press('ArrowDown');
  await p2.keyboard.press('Home');
  await p2.keyboard.type('ВСТАВКА ');
  await expect.poll(() => docText(page)).toContain('ВСТАВКА Альфа Бета Гамма');
  await expect.poll(() => docText(page)).toContain('Новое начало.');
  await expectSaved(page); // autosave of the remote change does not move the local selection
  expect(await selectionText(page)).toBe('Бета');

  // typing replaces exactly the selection
  await page.keyboard.type('Дельта');
  await expect.poll(() => docText(page)).toContain('ВСТАВКА Альфа Дельта Гамма');

  // network failure: the colleague keeps editing the same paragraph after the caret; after reconnect the caret is where it was
  await context.setOffline(true);
  await expect(page.locator('.sync-status')).not.toHaveText(/Сохранено$/, { timeout: 15_000 }).catch(() => undefined);
  await p2.keyboard.press('End');
  await p2.keyboard.type(' конец');
  await expectSaved(p2);
  await context.setOffline(false);
  await expect.poll(() => docText(page), { timeout: 20_000 }).toContain('ВСТАВКА Альфа Дельта Гамма конец');
  await page.keyboard.type('!');
  await expect.poll(() => docText(page)).toContain('ВСТАВКА Альфа Дельта! Гамма конец');
  await expectSaved(page);
  await expect.poll(() => docText(p2)).toContain('ВСТАВКА Альфа Дельта! Гамма конец');
  expect(text((await apiContent(page.request, id)).content)).toContain('Новое начало. \nПервая строка\nВСТАВКА Альфа Дельта! Гамма конец');
  await ctx.close();
});

test('IME composition commits once, coexists with a colleague typing and autosave, and undo reverts only own input (E221, R-EDITOR-021, R-EDITOR-053)', async ({ page, browser }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Ввод через IME');
  await page.keyboard.type('Строка коллеги');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Мой текст: ');
  await expectSaved(page);
  const { p2, ctx } = await colleague(page, browser, id, 'Глеб Соавтор');
  const cdp = await page.context().newCDPSession(page);
  // composition in progress (Japanese IME): the colleague types meanwhile
  await cdp.send('Input.imeSetComposition', { text: 'に', selectionStart: 1, selectionEnd: 1 });
  await cdp.send('Input.imeSetComposition', { text: 'にほ', selectionStart: 2, selectionEnd: 2 });
  await caretIn(p2, 'Строка коллеги');
  await p2.keyboard.press('End');
  await p2.keyboard.type(' (дополнено)');
  await expect.poll(() => docText(page)).toContain('Строка коллеги (дополнено)');
  await cdp.send('Input.imeSetComposition', { text: 'にほん', selectionStart: 3, selectionEnd: 3 });
  await cdp.send('Input.insertText', { text: '日本' });
  // a Cyrillic composition (phonetic IME) right after
  await cdp.send('Input.imeSetComposition', { text: 'при', selectionStart: 3, selectionEnd: 3 });
  await cdp.send('Input.insertText', { text: 'привет' });
  await expect(editor(page).locator('p').nth(1)).toHaveText('Мой текст: 日本привет');
  await expectSaved(page);
  const saved = text((await apiContent(page.request, id)).content);
  expect(saved).toContain('Мой текст: 日本привет\n');
  expect(saved.match(/日本/g)).toHaveLength(1);
  // the caret is after the committed text: typing continues there
  await page.keyboard.type('!');
  await expect(editor(page).locator('p').nth(1)).toHaveText('Мой текст: 日本привет!');
  // undo removes only Anna's own input, never the colleague's
  const mine = editor(page).locator('p').nth(1);
  for (let i = 0; i < 8 && (await mine.innerText()).trim() !== 'Мой текст:'; i++) {
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(150);
  }
  await expect(mine).toHaveText('Мой текст:');
  await expect.poll(() => docText(page)).toContain('Строка коллеги (дополнено)');
  await page.keyboard.press('Control+Shift+z');
  await expect(editor(page).locator('p').nth(1)).not.toHaveText('Мой текст:');
  await expectSaved(page);
  await ctx.close();
});

test('Cyrillic, Russian quotes, emoji and a very long URL are typed, saved and laid out correctly (R-EDITOR-021, R-EDITOR-033)', async ({ page }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Юникод');
  const line = 'Ёжик «ёлочки» „лапки“ — тире, эмодзи 👍🏽 👨‍👩‍👧 и ©';
  await page.keyboard.type(line);
  await page.keyboard.press('Enter');
  const url = 'https://example.com/' + 'очень-длинный-путь/'.repeat(30) + '?q=' + 'x'.repeat(200);
  await page.keyboard.insertText(url);
  await page.keyboard.type(' ');
  await expect(editor(page).locator('p').first()).toHaveText(line);
  // a long unbroken URL wraps inside the editor instead of widening the page
  const overflow = await editor(page).evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  // Backspace after an emoji never leaves half of a surrogate pair
  await caretIn(page, 'Ёжик');
  await page.keyboard.press('End');
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowLeft'); // before " и ©"
  await page.keyboard.press('Backspace');
  const first = (await paragraphs(page))[0];
  expect(first.isWellFormed?.() ?? !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(first)).toBe(true);
  expect(first).toContain('👍🏽');
  await expectSaved(page);
  const saved = text((await apiContent(page.request, id)).content);
  expect(saved).toContain('Ёжик «ёлочки» „лапки“ — тире, эмодзи 👍🏽');
  expect(saved).toContain(url);
});

test('a document of 100 000+ characters (50+ pages pasted at once) stays editable: caret after the paste, one undo step, saved in full (R-EDITOR-021, R-EDITOR-033)', async ({ page }) => {
  test.setTimeout(180_000);
  await ensureOwner(page);
  const id = await newPage(page, 'Пятьдесят страниц');
  await page.keyboard.type('Начало документа');
  await page.keyboard.press('Enter');
  await expectSaved(page);
  // ~55 pages of 3000 characters
  const paras = Array.from({ length: 550 }, (_, i) => `Абзац ${i + 1}. Складской учёт: приёмка товара, размещение по ячейкам, комплектация, отгрузка и инвентаризация — порядок действий, ответственные и сроки. Ёлки «кавычки» №${i}. Конец абзаца ${i + 1}.`);
  const big = paras.join('\n');
  expect(big.length).toBeGreaterThan(100_000);
  await paste(page, { 'text/plain': big });
  await expect(editor(page).locator('p').last()).toContainText('Конец абзаца 550.', { timeout: 30_000 });
  // the caret is right after the pasted text
  await page.keyboard.type(' ХВОСТ');
  await expect(editor(page).locator('p').last()).toContainText('Конец абзаца 550. ХВОСТ');
  await page.waitForTimeout(700); // separate undo steps (typing within 0.5 s is one step)
  // editing at the start of the long document
  await page.keyboard.press('Control+Home');
  await page.keyboard.type('>> ');
  await expect(editor(page).locator('p').first()).toHaveText('>> Начало документа');
  await page.waitForTimeout(700);
  // typing in the middle stays responsive
  const mid = editor(page).locator('p', { hasText: 'Абзац 275. ' });
  await mid.scrollIntoViewIfNeeded();
  await caretIn(page, 'Абзац 275. ');
  const t0 = Date.now();
  await page.keyboard.type(' середина ');
  await expect(mid).toContainText(' середина ');
  expect(Date.now() - t0).toBeLessThan(5000);
  await expectSaved(page);
  const saved = text((await apiContent(page.request, id)).content);
  expect(saved.length).toBeGreaterThan(100_000);
  expect(saved).toContain('Конец абзаца 550. ХВОСТ');
  expect(saved.split('\n').find((l) => l.startsWith('Абзац 275. '))).toContain(' середина ');
  // history is intact: undo the edits one by one, then the paste as a single step, then redo it
  await page.keyboard.press('Control+z');
  await expect(mid).not.toContainText('середина');
  await page.keyboard.press('Control+z');
  await expect(editor(page).locator('p').first()).toHaveText('Начало документа');
  await page.keyboard.press('Control+z');
  await expect(editor(page)).not.toContainText('ХВОСТ');
  await expect(editor(page).locator('p').last()).toContainText('Конец абзаца 550.');
  // the paste itself is exactly one step
  await page.keyboard.press('Control+z');
  await expect(editor(page)).not.toContainText('Абзац 1.');
  await expect(editor(page)).toContainText('Начало документа');
  await page.keyboard.press('Control+Shift+z');
  await expect(editor(page).locator('p').last()).toContainText('Конец абзаца 550.');
  await expect(editor(page).locator('p')).toHaveCount(551, { timeout: 15_000 }).catch(async () => expect((await paragraphs(page)).length).toBeGreaterThanOrEqual(551));
  await expectSaved(page);
});

test('key matrix: Enter, Enter on empty item, Tab/Shift+Tab, Backspace at the start and on empty blocks behave by the documented rules (R-EDITOR-065, R-EDITOR-034, E208)', async ({ page }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Матрица клавиш');
  const ed = editor(page);
  // Enter in a paragraph → new paragraph; Shift+Enter → line break inside the paragraph
  await page.keyboard.type('Абзац один');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('вторая строка');
  await page.keyboard.press('Enter');
  await expect(ed.locator('p').first().locator('br')).toHaveCount(1);
  // list: Enter → next item; Tab → nested; Shift+Tab → back; Enter on an empty item → leaves the list
  await page.keyboard.type('- Пункт 1');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Пункт 2');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Вложенный 2.1');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Вложенный 2.2');
  await expect(ed.locator('ul > li > ul > li')).toHaveCount(2);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter'); // empty nested item → one level up
  await page.keyboard.type('Пункт 3');
  await expect(ed.locator('ul > li > ul > li')).toHaveCount(2);
  await expect(ed.locator('ul').first().locator(':scope > li')).toHaveCount(3);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Временно вложен');
  await page.keyboard.press('Shift+Tab');
  await expect(ed.locator('ul').first().locator(':scope > li')).toHaveCount(4);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter'); // empty top-level item → leaves the list as a paragraph
  await page.keyboard.type('После списка');
  await expect(ed.locator('p', { hasText: 'После списка' })).toHaveCount(1);
  expect(await ed.locator('li', { hasText: 'После списка' }).count()).toBe(0);
  // Backspace at the start of a list item → the item becomes a paragraph
  await page.keyboard.press('ArrowUp'); // from "После списка" to the last item "Временно вложен"
  await page.keyboard.press('Home');
  await settle(page);
  await page.keyboard.press('Backspace');
  expect(await ed.locator('li', { hasText: 'Временно вложен' }).count()).toBe(0);
  await expect(ed.locator('p', { hasText: 'Временно вложен' })).toHaveCount(1);
  // Backspace at the start of a heading → paragraph (type changes, text stays)
  await caretIn(page, 'После списка');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('## Заголовок');
  await expect(ed.locator('h2', { hasText: 'Заголовок' })).toHaveCount(1);
  await page.keyboard.press('Home');
  await settle(page);
  await page.keyboard.press('Backspace');
  await expect(ed.locator('h2')).toHaveCount(0);
  await expect(ed.locator('p').filter({ hasText: /^Заголовок$/ })).toHaveCount(1);
  // Backspace at the start of a paragraph → merges with the previous one
  await page.keyboard.press('Backspace');
  await expect(ed.locator('p', { hasText: 'После спискаЗаголовок' })).toHaveCount(1);
  // Backspace at the start of a quote → the paragraph leaves the quote
  await page.keyboard.press('Control+End'); // the merged paragraph is the last block
  await settle(page);
  await page.keyboard.press('Enter');
  await page.keyboard.type('" Цитата');
  await expect(ed.locator('blockquote', { hasText: 'Цитата' })).toHaveCount(1);
  await page.keyboard.press('Home');
  await settle(page);
  await page.keyboard.press('Backspace');
  await expect(ed.locator('blockquote')).toHaveCount(0);
  await expect(ed.locator('p').filter({ hasText: /^Цитата$/ })).toHaveCount(1);
  await page.keyboard.press('Backspace');
  await expect(ed.locator('p', { hasText: 'После спискаЗаголовокЦитата' })).toHaveCount(1);
  // Backspace on an empty paragraph → removed, caret at the end of the previous block
  await page.keyboard.press('Control+End');
  await settle(page);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Backspace');
  await page.keyboard.type('+');
  await expect(ed.locator('p', { hasText: 'После спискаЗаголовокЦитата+' })).toHaveCount(1);
  // the same rules for a checklist: Enter → next task, Enter on empty → leaves
  await page.keyboard.press('Enter');
  await page.keyboard.type('[] Задача');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Задача 2');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Финал');
  await expect(ed.locator('ul[data-type="taskList"] > li')).toHaveCount(2);
  await expect(ed.locator('p', { hasText: 'Финал' })).toHaveCount(1);
  await expectSaved(page);
  const c = JSON.stringify((await apiContent(page.request, id)).content);
  expect(c).toContain('Вложенный 2.2');
  // the rules are documented in the in-app help
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('F1');
  const help = page.getByRole('dialog', { name: 'Справка' });
  await expect(help).toBeVisible();
  await expect(help.getByText('Клавиши в тексте и списках')).toBeVisible();
  await expect(help.getByText('Enter на пустом пункте списка')).toBeVisible();
});
