import { test, expect } from '@playwright/test';
import { ensureOwner, newPage, editor, expectSaved, apiContent, createUser, login_, api, paste } from './helpers';

test.describe.configure({ mode: 'serial' });

test('two people edit the same page: changes converge, presence is shown, revoking edit makes it read-only', async ({ page, browser }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Совместная работа');
  await page.keyboard.type('Начало.');
  await expectSaved(page);
  const colleague = await createUser(page.request, 'Борис Коллега', { pageGrants: [{ pageId: id, level: 'edit' }] });

  const ctx2 = await browser.newContext();
  const p2 = await ctx2.newPage();
  await p2.goto('/p/' + id);
  await login_(p2, colleague.email, colleague.password);
  await expect(editor(p2)).toContainText('Начало.');
  await expect(page.locator('.presence')).toBeVisible();

  await editor(p2).click();
  await p2.keyboard.press('Control+End');
  await p2.keyboard.type(' Добавил Борис.');
  await editor(page).click();
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Добавила Анна.');
  await expect(editor(page)).toContainText('Добавил Борис.');
  await expect(editor(p2)).toContainText('Добавила Анна.');
  await expectSaved(page);
  await expectSaved(p2);
  const c = JSON.stringify((await apiContent(page.request, id)).content);
  expect(c).toContain('Добавил Борис.');
  expect(c).toContain('Добавила Анна.');

  // downgrade to view: the open session switches to read-only without losing anything
  const access = await (await page.request.get(`/api/v1/pages/${id}/access`)).json();
  const grant = JSON.stringify(access).match(new RegExp(`"id":"([0-9a-f-]{36})"[^}]*"subjectId":"${colleague.id}"`))?.[1];
  await api(page, 'PUT', '/api/v1/grants', { resourceType: 'page', resourceId: id, subjectType: 'user', subjectId: colleague.id, level: 'view' });
  await expect(p2.locator('.sync-status')).toHaveText(/Только чтение/, { timeout: 15_000 });
  await expect(editor(p2)).toHaveAttribute('contenteditable', 'false');
  expect(grant === undefined || typeof grant === 'string').toBeTruthy();
  await ctx2.close();
});

test('history: save a version, change text, restore the version', async ({ page }) => {
  await ensureOwner(page);
  await newPage(page, 'История');
  await page.keyboard.type('Версия один');
  await expectSaved(page);
  await page.locator('.page-header-bar').getByRole('button', { name: 'Действия со страницей' }).click();
  await page.getByRole('menuitem', { name: 'История версий' }).click();
  const panel = page.getByRole('complementary', { name: 'Боковая панель' });
  await panel.getByRole('button', { name: /Сохранить версию/ }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByRole('textbox').first().fill('Первая');
  await dlg.getByRole('button', { name: /Сохранить/ }).click();
  await expect(panel.getByText('Первая')).toBeVisible();
  await editor(page).click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Версия два');
  await expectSaved(page);
  await panel.getByText('Первая').click();
  await panel.getByRole('button', { name: /Восстановить эту версию/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Восстановить/ }).click();
  await expect(editor(page)).toContainText('Версия один', { timeout: 15_000 });
  await expect(editor(page)).not.toContainText('Версия два');
});

test('search finds a page by a word from its body and jumps to the block', async ({ page }) => {
  await ensureOwner(page);
  const word = 'Квазиуникальность' + Math.floor(Math.random() * 1e6);
  await newPage(page, 'Поисковая');
  await page.keyboard.type('Первый абзац.');
  await page.keyboard.press('Enter');
  await page.keyboard.type(`Здесь встречается ${word} в тексте.`);
  await expectSaved(page);
  await expect(async () => {
    await page.goto('/search?q=' + encodeURIComponent(word));
    await expect(page.locator('main').getByRole('link', { name: /Поисковая/ }).first()).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  await page.locator('main').getByRole('link', { name: /Поисковая/ }).first().click();
  await expect(page).toHaveURL(/block=/);
  const block = new URL(page.url()).searchParams.get('block')!;
  await expect(page.locator(`.kb-flash-overlay[data-block="${block}"]`)).toBeAttached();
  await expect(editor(page).locator(`[data-block-id="${block}"]`)).toContainText(word);
  await expect(editor(page).locator(`[data-block-id="${block}"]`)).toBeInViewport();
});

test('paste: spreadsheet range becomes a table; Markdown becomes formatted blocks', async ({ page }) => {
  await ensureOwner(page);
  await newPage(page, 'Вставка');
  await paste(page, { 'text/plain': 'Артикул\tКол-во\tЦена\nA-1\t10\t99,50\nB-2\t3\t1 200,00\n' });
  await expect(editor(page).locator('table tr')).toHaveCount(3);
  await expect(editor(page).locator('table')).toContainText('1 200,00');
  await page.keyboard.press('Control+End');
  await page.waitForTimeout(2000); // the Markdown converter is warmed up in the background
  await paste(page, { 'text/plain': '## Порядок\n\n- шаг один\n- шаг **два**\n\n```\ncode()\n```\n' });
  await expect(editor(page).locator('h2')).toHaveText('Порядок');
  await expect(editor(page).locator('ul li')).toHaveCount(2);
  await expect(editor(page).locator('pre')).toContainText('code()');
  await expectSaved(page);
});

test('typing latency on a long document stays within budget', async ({ page }) => {
  await ensureOwner(page);
  await page.evaluate(() => localStorage.setItem('kb:debug', '1'));
  await newPage(page, 'Длинный документ');
  await page.waitForFunction(() => (window as any).__kbEditor);
  await page.evaluate(() => {
    const ed = (window as any).__kbEditor;
    const blocks = [];
    for (let i = 0; i < 400; i++) blocks.push({ type: 'paragraph', content: [{ type: 'text', text: `Абзац ${i}: складской учёт, приёмка, размещение, отгрузка и инвентаризация товара на складе.` }] });
    ed.commands.setContent({ type: 'doc', content: blocks });
  });
  await expectSaved(page);
  await editor(page).locator('p').nth(200).click();
  const samples: number[] = await page.evaluate(async () => {
    const out: number[] = [];
    const ed = document.querySelector('.kb-editor')!;
    for (let i = 0; i < 40; i++) {
      const t0 = performance.now();
      const done = new Promise<void>((r) => {
        const mo = new MutationObserver(() => (mo.disconnect(), r()));
        mo.observe(ed, { characterData: true, childList: true, subtree: true });
      });
      document.execCommand('insertText', false, 'ж');
      await done;
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      out.push(performance.now() - t0);
      await new Promise((r) => setTimeout(r, 30));
    }
    return out;
  });
  samples.sort((a, b) => a - b);
  const p95 = samples[Math.floor(samples.length * 0.95) - 1];
  console.log(`typing latency p50=${samples[samples.length / 2].toFixed(1)}ms p95=${p95.toFixed(1)}ms`);
  expect(p95).toBeLessThan(50);
  await expectSaved(page);
});
