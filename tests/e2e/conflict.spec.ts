import { test, expect } from '@playwright/test';
import { ensureOwner, newPage, editor, expectSaved, createUser, login_, apiContent, caretIn } from './helpers';

test('edit vs concurrent delete: the editor keeps a conflict copy and can put the block back (E-04, AT-77, COLLAB-193, R-COLLAB-045, UX13-10)', async ({ page, browser }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Конфликт');
  await page.keyboard.type('Первый абзац.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Абзац, который правят и удаляют');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Последний абзац.');
  await expectSaved(page);
  const bob = await createUser(page.request, 'Борис Удаляющий', { pageGrants: [{ pageId: id, level: 'edit' }] });
  const ctx2 = await browser.newContext();
  const p2 = await ctx2.newPage();
  await p2.goto('/p/' + id);
  await login_(p2, bob.email, bob.password);
  await expect(editor(p2)).toContainText('Абзац, который правят');

  // Anna keeps typing in the paragraph while Boris deletes it (Boris goes offline to make the edits truly concurrent)
  await ctx2.setOffline(true);
  await caretIn(p2, 'Абзац, который правят');
  await p2.keyboard.press('Escape'); // select the whole block
  await p2.keyboard.press('Delete');
  await expect(editor(p2)).not.toContainText('Абзац, который правят');

  await caretIn(page, 'Абзац, который правят');
  await page.keyboard.press('End');
  await page.keyboard.type(' — важное дополнение Анны');
  await expectSaved(page);

  await ctx2.setOffline(false); // Boris's deletion now reaches the server and Anna
  // R-COLLAB-036: a comparison dialog, not a silent merge: my version vs the server's (block deleted)
  const dialog = page.getByTestId('conflict-dialog');
  await expect(dialog).toBeVisible({ timeout: 20_000 });
  await expect(dialog).toContainText('удалил блок, который вы в это время редактировали');
  await expect(dialog.getByRole('region', { name: 'Ваша версия' })).toContainText('важное дополнение Анны');
  await expect(dialog.getByRole('region', { name: 'Версия сервера' })).toContainText('Блок удалён');
  await page.getByRole('button', { name: 'Оставить мою' }).click();
  await expect(dialog).toBeHidden();
  await expect(editor(page)).toContainText('важное дополнение Анны');
  await expectSaved(page);
  await expect(editor(p2)).toContainText('важное дополнение Анны', { timeout: 15_000 });
  const c = JSON.stringify((await apiContent(page.request, id)).content);
  expect(c).toContain('важное дополнение Анны');
  const conflicts = await (await page.request.get(`/api/v1/pages/${id}/conflicts`)).json();
  expect(conflicts.conflicts[0]).toMatchObject({ reason: 'deleted', resolution: 'restored' });
  await ctx2.close();
});

async function concurrentDelete(page: import('@playwright/test').Page, browser: import('@playwright/test').Browser, title: string) {
  await ensureOwner(page);
  const id = await newPage(page, title);
  await page.keyboard.type('Вступление.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Спорный абзац');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Заключение.');
  await expectSaved(page);
  const bob = await createUser(page.request, 'Борис ' + title, { pageGrants: [{ pageId: id, level: 'edit' }] });
  const ctx2 = await browser.newContext();
  const p2 = await ctx2.newPage();
  await p2.goto('/p/' + id);
  await login_(p2, bob.email, bob.password);
  await expect(editor(p2)).toContainText('Спорный абзац');
  await ctx2.setOffline(true);
  await caretIn(p2, 'Спорный абзац');
  await p2.keyboard.press('Escape');
  await p2.keyboard.press('Delete');
  await caretIn(page, 'Спорный абзац');
  await page.keyboard.press('End');
  await page.keyboard.type(' и мой довод');
  await expectSaved(page);
  await ctx2.setOffline(false);
  const dialog = page.getByTestId('conflict-dialog');
  await expect(dialog).toBeVisible({ timeout: 20_000 });
  return { id, ctx2, p2, dialog };
}

test('R-COLLAB-036: conflict dialog — «keep both» keeps the deletion result and adds my version as a separate block; «decide later» leaves a reminder', async ({ page, browser }) => {
  const { id, ctx2, p2, dialog } = await concurrentDelete(page, browser, 'Обе версии');
  // the conflict cannot be dismissed silently: closing leaves a visible reminder that reopens the dialog
  await page.getByRole('button', { name: 'Решить позже' }).click();
  await expect(dialog).toBeHidden();
  const reminder = page.getByTestId('conflict-reminder');
  await expect(reminder).toContainText('Неразрешённых конфликтов правок: 1');
  await reminder.getByRole('button', { name: 'Разрешить' }).click();
  await page.getByRole('button', { name: 'Сохранить обе' }).click();
  await expect(reminder).toBeHidden();
  await expect(editor(page)).toContainText('Спорный абзац и мой довод');
  await expectSaved(page);
  await expect(editor(p2)).toContainText('Спорный абзац и мой довод', { timeout: 15_000 });
  const doc = (await apiContent(page.request, id)).content;
  const ids = doc.content.map((b: any) => b.attrs?.id).filter(Boolean);
  expect(new Set(ids).size).toBe(ids.length); // the copy has its own block id
  const conflicts = await (await page.request.get(`/api/v1/pages/${id}/conflicts`)).json();
  expect(conflicts.conflicts[0]).toMatchObject({ reason: 'deleted', resolution: 'both' });
  await ctx2.close();
});

test('R-COLLAB-036: conflict dialog — «accept the server version» keeps the deletion, my version stays in the page history', async ({ page, browser }) => {
  const { id, ctx2, dialog } = await concurrentDelete(page, browser, 'Версия сервера');
  await page.getByRole('button', { name: 'Принять версию сервера' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.toast').filter({ hasText: 'Ваша версия сохранена в истории страницы' })).toBeVisible();
  await expectSaved(page);
  await expect(editor(page)).not.toContainText('Спорный абзац');
  const conflicts = await (await page.request.get(`/api/v1/pages/${id}/conflicts`)).json();
  expect(conflicts.conflicts[0]).toMatchObject({ reason: 'deleted', resolution: 'dismissed' });
  expect(JSON.stringify(conflicts.conflicts[0].block)).toContain('и мой довод');
  await ctx2.close();
});

test('R-COLLAB-036: a change the server refuses opens the comparison dialog; «keep both» saves my version as a new page, the editor continues on the server version', async ({ page }) => {
  await ensureOwner(page);
  await page.evaluate(() => localStorage.setItem('kb:debug', '1'));
  const id = await newPage(page, 'Отклонённая правка');
  await page.keyboard.type('Принятый текст');
  await expectSaved(page);
  await page.waitForFunction(() => !!(window as any).__kbEditor);
  // A change the server's validation refuses (script URL in an embed): NACK invalid_update
  await page.evaluate(() => (window as any).__kbEditor.chain().insertContentAt((window as any).__kbEditor.state.doc.content.size, [{ type: 'paragraph', content: [{ type: 'text', text: 'Мой локальный абзац' }] }, { type: 'embed', attrs: { url: 'javascript:alert(1)', kind: 'link', title: 'x' } }]).run());
  const dialog = page.getByTestId('doc-conflict-dialog');
  await expect(dialog).toBeVisible({ timeout: 20_000 });
  await expect(dialog.getByRole('region', { name: 'Ваша версия' })).toContainText('Мой локальный абзац');
  await expect(dialog.getByRole('region', { name: 'Версия сервера' })).toContainText('Принятый текст');
  await expect(dialog.getByRole('region', { name: 'Версия сервера' })).not.toContainText('Мой локальный абзац');
  await page.getByRole('button', { name: 'Сохранить обе' }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  const toast = page.locator('.toast').filter({ hasText: 'Ваша версия сохранена как страница' });
  await expect(toast).toBeVisible();
  // the editor reopened on the server version and is editable again
  await expect(editor(page)).toContainText('Принятый текст');
  await expect(editor(page)).not.toContainText('Мой локальный абзац');
  await caretIn(page, 'Принятый текст');
  await page.keyboard.press('End');
  await page.keyboard.type(' и дальше');
  await expectSaved(page);
  expect(JSON.stringify((await apiContent(page.request, id)).content)).toContain('Принятый текст и дальше');
  // the copy page exists next to the original with my text (script URL removed)
  const conflicts = await (await page.request.get(`/api/v1/pages/${id}/conflicts`)).json();
  const copy = conflicts.conflicts.find((c: any) => c.reason === 'document');
  expect(copy).toBeTruthy();
  const ev = await (await page.request.get(`/api/v1/pages/${id}/events?limit=50`)).json();
  const copyId = ev.events.find((e: any) => e.type === 'conflict_copy')?.data?.copyPageId;
  const copyContent = JSON.stringify((await apiContent(page.request, copyId)).content);
  expect(copyContent).toContain('Мой локальный абзац');
  expect(copyContent).not.toContain('javascript:');
});
