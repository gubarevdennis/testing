import { test, expect } from '@playwright/test';
import { ensureOwner, newPage, editor, expectSaved, createUser, login_, apiContent } from './helpers';

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
  await editor(p2).locator('p', { hasText: 'Абзац, который правят' }).click();
  await p2.keyboard.press('Escape'); // select the whole block
  await p2.keyboard.press('Delete');
  await expect(editor(p2)).not.toContainText('Абзац, который правят');

  await editor(page).locator('p', { hasText: 'Абзац, который правят' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' — важное дополнение Анны');
  await expectSaved(page);

  await ctx2.setOffline(false); // Boris's deletion now reaches the server and Anna
  const notice = page.locator('.toast').filter({ hasText: 'удалил блок, который вы редактировали' });
  await expect(notice).toBeVisible({ timeout: 20_000 });
  await notice.getByRole('button', { name: 'Вернуть мою версию' }).click();
  await expect(editor(page)).toContainText('важное дополнение Анны');
  await expectSaved(page);
  await expect(editor(p2)).toContainText('важное дополнение Анны', { timeout: 15_000 });
  const c = JSON.stringify((await apiContent(page.request, id)).content);
  expect(c).toContain('важное дополнение Анны');
  const conflicts = await (await page.request.get(`/api/v1/pages/${id}/conflicts`)).json();
  expect(conflicts.conflicts[0]).toMatchObject({ reason: 'deleted', resolution: 'restored' });
  await ctx2.close();
});
