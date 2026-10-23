import { test, expect, type Browser, type Page } from '@playwright/test';
import { ensureOwner, createUser, login_, editor, expectSaved, apiContent } from './helpers';
import { newPage, cleanupCreatedPages, settle } from './editor-p0-helpers';

/**
 * Co-author dimension of the editor action matrix (QA26-07, R-COLLAB-006, R-EDITOR-022) and the regression for the
 * flaky tests/e2e/collab.spec.ts «two people edit the same page» (defect QA-E1 in docs/qa/defects.yaml).
 */
cleanupCreatedPages();

const paras = (page: Page) =>
  editor(page)
    .locator('p')
    .evaluateAll((ps) =>
      ps.map((p) => {
        const c = p.cloneNode(true) as HTMLElement;
        c.querySelectorAll('.collab-caret').forEach((x) => x.remove()); // colleagues' caret labels
        return c.textContent ?? '';
      }),
    );
const serverParas = async (page: Page, id: string) => ((await apiContent(page.request, id)).content.content as Array<{ type: string; content?: Array<{ text?: string }> }>).filter((b) => b.type === 'paragraph').map((b) => (b.content ?? []).map((t) => t.text ?? '').join(''));

async function colleague(browser: Browser, page: Page, id: string) {
  const user = await createUser(page.request, 'Борис Соавтор', { pageGrants: [{ pageId: id, level: 'edit' }] });
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await p2.goto('/p/' + id);
  await login_(p2, user.email, user.password);
  await expect(editor(p2)).toBeVisible();
  return { ctx, p2 };
}

test('QA-E1 (fixed): a caret parked at the end of a paragraph stays at its end when a co-author appends there — Enter then starts a new paragraph after the co-author’s sentence instead of tearing it apart', async ({ page, browser }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Соавтор: конец абзаца');
  await page.keyboard.type('Начало.');
  await expectSaved(page);
  const { ctx, p2 } = await colleague(browser, page, id);
  await expect(editor(p2)).toContainText('Начало.');
  // the owner parks the caret at the end of the document BEFORE the colleague's words arrive
  await editor(page).click();
  await page.keyboard.press('Control+End');
  await settle(page);
  await page.waitForTimeout(1600); // not typing any more
  await editor(p2).click();
  await p2.keyboard.press('Control+End');
  await p2.keyboard.type(' Добавил Борис.');
  await expect(editor(page)).toContainText('Начало. Добавил Борис.');
  // the owner continues where the caret was: after the end of the paragraph
  const caretAtEnd = await page.evaluate(() => {
    const s = getSelection()!;
    const r = document.createRange();
    r.setStart(s.anchorNode!, s.anchorOffset);
    r.setEndAfter((s.anchorNode!.nodeType === 3 ? s.anchorNode!.parentElement! : (s.anchorNode as Element)).closest('p')!.lastChild!);
    return r.toString().replace(/Борис Соавтор/, '');
  });
  expect(caretAtEnd).toBe('');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Добавила Анна.');
  await expectSaved(page);
  await expectSaved(p2);
  const want = ['Начало. Добавил Борис.', 'Добавила Анна.'];
  await expect.poll(() => paras(page)).toEqual(want);
  await expect.poll(() => paras(p2)).toEqual(want);
  await expect.poll(() => serverParas(page, id)).toEqual(want);
  await ctx.close();
});

test('QA-E1: a co-author joining the next paragraph into mine does not move my parked caret to the end of the joined text', async ({ page, browser }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Соавтор: объединение абзацев');
  await page.keyboard.type('Первый.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Второй.');
  await expectSaved(page);
  const { ctx, p2 } = await colleague(browser, page, id);
  await expect(editor(p2)).toContainText('Второй.');
  // the owner parks the caret at the end of the first paragraph
  await editor(page).locator('p', { hasText: 'Первый.' }).click();
  await page.keyboard.press('End');
  await settle(page);
  await page.waitForTimeout(1600);
  // the colleague joins the second paragraph into the first (Backspace at its start)
  await editor(p2).locator('p', { hasText: 'Второй.' }).click();
  await p2.keyboard.press('Home');
  await p2.keyboard.press('Backspace');
  await expect.poll(() => paras(page)).toEqual(['Первый.Второй.']);
  // typing goes to the junction, where the caret was
  await page.keyboard.type('|');
  await expectSaved(page);
  await expect.poll(() => serverParas(page, id)).toEqual(['Первый.|Второй.']);
  await expect.poll(() => paras(p2)).toEqual(['Первый.|Второй.']);
  await ctx.close();
});
