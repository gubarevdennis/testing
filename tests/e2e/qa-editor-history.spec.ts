import { test, expect, devices, type Page, type Locator } from '@playwright/test';
import { ensureOwner, createUser, login_, editor, expectSaved, apiContent, api, caretIn } from './helpers';
import { newPage, cleanupCreatedPages } from './editor-p0-helpers';

/**
 * History, version compare/restore and comments: the critical actions docs/qa/ACTION_MATRIX.md listed as uncovered
 * (QA26-01, QA26-03, R-QA-004, R-QA-029, R-HISTORY-002/013/026, R-COMMENTS) in their states — success, cancel,
 * server error, offline, no permission, double click, after reload — asserting the server content.
 */
cleanupCreatedPages();

const toasts = (p: Page) => p.locator('.toasts');
const text = async (page: Page, id: string) => JSON.stringify((await apiContent(page.request, id)).content);

async function openHistory(page: Page) {
  await page.locator('.page-header-bar').getByRole('button', { name: 'Действия со страницей' }).click();
  await page.getByRole('menuitem', { name: 'История версий' }).click();
  const panel = page.getByRole('complementary', { name: 'История страницы' });
  await expect(panel).toBeVisible();
  return panel;
}

async function saveVersion(page: Page, panel: Locator, label: string) {
  await panel.getByRole('button', { name: /Сохранить версию/ }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByRole('textbox').first().fill(label);
  await dlg.getByRole('button', { name: /Сохранить/ }).click();
  await expect(panel.getByText(label)).toBeVisible();
}

/** Fails the POST of `pattern` that is not a dry run (the dialogs ask for a dry-run preview first). */
async function failRealPost(page: Page, pattern: string) {
  await page.route(pattern, (route) => {
    const body = route.request().postDataJSON?.() ?? {};
    if (route.request().method() === 'POST' && !body.dryRun) return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'internal', message: 'Внутренняя ошибка сервера' } }) });
    return route.fallback();
  });
}

test('R-HISTORY-002, QA26-03: «Восстановить версию N?» — cancel changes nothing; a server error keeps the text and explains; offline explains; confirm restores (server content, after reload) and the pre-restore version brings the later text back', async ({ page, context }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'История: восстановление версии');
  await page.keyboard.type('Версия один');
  await expectSaved(page);
  const panel = await openHistory(page);
  await saveVersion(page, panel, 'Первая');
  await caretIn(page, 'Версия один');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Версия два');
  await expectSaved(page);
  await panel.getByText('Первая').click();
  const restore = panel.getByRole('button', { name: 'Восстановить эту версию' });
  const dialog = page.getByRole('dialog', { name: /Восстановить версию \d+\?/ });
  // cancel
  await restore.click();
  await expect(dialog.getByTestId('restore-preview')).toContainText('Содержимое страницы станет таким');
  await dialog.getByRole('button', { name: 'Отмена' }).click();
  await expect(dialog).toBeHidden();
  expect(await text(page, id)).toContain('Версия два');
  // server error: nothing changes, the reason is shown
  await failRealPost(page, '**/api/v1/pages/*/revisions/*/restore');
  await restore.click();
  await dialog.getByRole('button', { name: 'Восстановить', exact: true }).click();
  await expect(toasts(page)).toContainText(/Внутренняя ошибка сервера|Не удалось восстановить версию/);
  await expect(dialog).toBeVisible(); // a retry is possible
  await dialog.getByRole('button', { name: 'Отмена' }).click();
  await page.unroute('**/api/v1/pages/*/revisions/*/restore');
  expect(await text(page, id)).toContain('Версия два');
  await expect(editor(page)).toContainText('Версия два');
  // offline: the preview cannot load / the restore cannot be sent — nothing changes
  await context.setOffline(true);
  await restore.click();
  await expect(dialog.getByRole('button', { name: 'Восстановить', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Отмена' }).click();
  await context.setOffline(false);
  // confirm (a human double click on the button restores once)
  await restore.click();
  const go = dialog.getByRole('button', { name: 'Восстановить', exact: true });
  await expect(go).toBeEnabled();
  const before = (await (await page.request.get(`/api/v1/pages/${id}/revisions?limit=100`)).json()).revisions.length as number;
  await go.dblclick();
  await expect(toasts(page)).toContainText(/Версия \d+ восстановлена как версия \d+\. Прежнее состояние сохранено как версия \d+/);
  await expect(editor(page)).toContainText('Версия один', { timeout: 15_000 });
  await expect.poll(() => text(page, id)).toContain('Версия один');
  expect(await text(page, id)).not.toContain('Версия два');
  const revs = (await (await page.request.get(`/api/v1/pages/${id}/revisions?limit=100`)).json()).revisions;
  expect(revs.length).toBe(before + 2); // pre-restore + restore, not twice
  await page.reload();
  await expect(editor(page)).toContainText('Версия один');
  await expect(editor(page)).not.toContainText('Версия два');
  // undo of a restore = restore the automatically saved pre-restore version
  const panel2 = await openHistory(page);
  await panel2.locator('.rev-item').filter({ hasText: 'Перед восстановлением' }).first().click();
  await panel2.getByRole('button', { name: 'Восстановить эту версию' }).click();
  await page.getByRole('dialog', { name: /Восстановить версию \d+\?/ }).getByRole('button', { name: 'Восстановить', exact: true }).click();
  await expect.poll(() => text(page, id), { timeout: 15_000 }).toContain('Версия два');
  await expect(editor(page)).toContainText('Версия два');
});

test('R-HISTORY-013: «Сравнить с текущей» → «Вернуть удалённый блок из версии N?» — cancel keeps the block deleted, confirm puts it back at its place; «Закрыть просмотр версии» and «Закрыть историю» close the views', async ({ page }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'История: удалённый блок');
  await page.keyboard.type('Остаётся первым');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Будет удалён');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Остаётся последним');
  await expectSaved(page);
  const panel = await openHistory(page);
  await saveVersion(page, panel, 'Три абзаца');
  // delete the middle paragraph
  await editor(page).locator('p', { hasText: 'Будет удалён' }).click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await expectSaved(page);
  await expect.poll(() => text(page, id)).not.toContain('Будет удалён');
  await panel.getByText('Три абзаца').click();
  await panel.getByRole('tab', { name: /Сравнить с текущей/ }).click();
  const block = panel.locator('.diff-block.removed').filter({ hasText: 'Будет удалён' });
  await expect(block).toBeVisible();
  const dialog = page.getByRole('dialog', { name: /Вернуть удалённый блок из версии \d+\?/ });
  // cancel
  await block.hover();
  await block.getByRole('button', { name: 'Восстановить блок' }).click();
  await expect(dialog).toContainText('Блока сейчас нет в документе');
  await dialog.getByRole('button', { name: 'Отмена' }).click();
  await expect(dialog).toBeHidden();
  expect(await text(page, id)).not.toContain('Будет удалён');
  // confirm
  await block.hover();
  await block.getByRole('button', { name: 'Восстановить блок' }).click();
  await dialog.getByRole('button', { name: 'Вернуть блок' }).click();
  await expect(toasts(page)).toContainText(/Блок возвращён в документ — новая версия \d+/);
  await expect.poll(async () => (await apiContent(page.request, id)).content.content.map((b: any) => (b.content ?? []).map((t: any) => t.text).join(''))).toEqual(['Остаётся первым', 'Будет удалён', 'Остаётся последним']);
  await expect(editor(page)).toContainText('Будет удалён');
  // close the version view, then the history panel
  await panel.getByRole('button', { name: 'Закрыть просмотр версии' }).click();
  await expect(panel.getByRole('tab', { name: /Сравнить с текущей/ })).toHaveCount(0);
  await expect(panel.getByText('Три абзаца')).toBeVisible();
  await panel.getByRole('button', { name: 'Закрыть историю' }).click();
  await expect(page.getByRole('complementary', { name: 'История страницы' })).toHaveCount(0);
});

test('R-HISTORY-026: «Восстановить состояние на этот момент?» from the change journal — cancel keeps the text, a server error explains, confirm rebuilds the state (server content)', async ({ page }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'История: журнал');
  await page.keyboard.type('Состояние А');
  await expectSaved(page);
  // the journal entry of the first edit is written when the document is flushed
  await expect.poll(async () => ((await (await page.request.get(`/api/v1/pages/${id}/events`)).json()).events ?? []).some((e: any) => e.type === 'edit'), { timeout: 15_000 }).toBe(true);
  await page.waitForTimeout(5500); // a later edit becomes a separate journal entry
  await caretIn(page, 'Состояние А');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Состояние Б');
  await expectSaved(page);
  await expect.poll(async () => text(page, id)).toContain('Состояние Б');
  const panel = await openHistory(page);
  await panel.getByRole('tab', { name: 'Журнал изменений' }).click();
  const restoreBtn = panel.getByRole('button', { name: 'Восстановить состояние на этот момент' }).last();
  await expect(restoreBtn).toBeVisible({ timeout: 15_000 });
  const dialog = page.getByRole('dialog', { name: 'Восстановить состояние на этот момент?' });
  await restoreBtn.click();
  await expect(dialog).toContainText('Текущее состояние сначала сохранится отдельной версией');
  await dialog.getByRole('button', { name: 'Отмена' }).click();
  await expect(dialog).toBeHidden();
  expect(await text(page, id)).toContain('Состояние Б');
  // server error
  await page.route('**/api/v1/pages/*/journal/*/restore', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'internal', message: 'Внутренняя ошибка сервера' } }) }));
  await restoreBtn.click();
  await dialog.getByRole('button', { name: 'Восстановить', exact: true }).click();
  await expect(toasts(page)).toContainText(/Внутренняя ошибка сервера|Не удалось восстановить состояние/);
  await page.unroute('**/api/v1/pages/*/journal/*/restore');
  expect(await text(page, id)).toContain('Состояние Б');
  // confirm: the oldest journal entry (the first edit) — the document returns to «Состояние А»
  await restoreBtn.click();
  await dialog.getByRole('button', { name: 'Восстановить', exact: true }).click();
  await expect(toasts(page)).toContainText(/Состояние восстановлено как версия \d+/);
  await expect.poll(() => text(page, id), { timeout: 15_000 }).toContain('Состояние А');
  await expect(editor(page)).toContainText('Состояние А');
  await page.reload();
  await expect(editor(page)).toContainText('Состояние А');
});

test('R-HISTORY-014: a co-author sees «Открыть версию N» after the owner restores a version; the button opens the pre-restore version in the history panel', async ({ page, browser }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'История: уведомление соавтора');
  await page.keyboard.type('Исходный текст');
  await expectSaved(page);
  const panel = await openHistory(page);
  await saveVersion(page, panel, 'Исходник');
  await caretIn(page, 'Исходный текст');
  await page.keyboard.press('End');
  await page.keyboard.type(' и правка соавтора');
  await expectSaved(page);
  const colleague = await createUser(page.request, 'Вера Соавтор', { pageGrants: [{ pageId: id, level: 'edit' }] });
  const ctx2 = await browser.newContext();
  const p2 = await ctx2.newPage();
  await p2.goto('/p/' + id);
  await login_(p2, colleague.email, colleague.password);
  await expect(editor(p2)).toContainText('и правка соавтора');
  await panel.getByText('Исходник').click();
  await panel.getByRole('button', { name: 'Восстановить эту версию' }).click();
  await page.getByRole('dialog', { name: /Восстановить версию \d+\?/ }).getByRole('button', { name: 'Восстановить', exact: true }).click();
  await expect(editor(p2)).not.toContainText('и правка соавтора', { timeout: 15_000 });
  const open = toasts(p2).getByRole('button', { name: /Открыть версию \d+/ });
  await expect(open).toBeVisible({ timeout: 15_000 });
  const n = (await open.textContent())!.match(/\d+/)![0];
  await open.click();
  const panel2 = p2.getByRole('complementary', { name: 'История страницы' });
  await expect(panel2).toBeVisible();
  await expect(panel2.locator('.rev-item[aria-current="true"]')).toContainText('№' + n);
  await panel2.getByRole('tab', { name: /Просмотр/ }).click();
  await expect(panel2.locator('.rev-preview')).toContainText('и правка соавтора');
  await ctx2.close();
});

test('R-HISTORY, R-UI-068 (phone): «К списку версий» returns from a version to the list on a narrow screen', async ({ browser }) => {
  const ctx = await browser.newContext({ ...devices['Pixel 7'], locale: 'ru-RU', timezoneId: 'Europe/Moscow' });
  const page = await ctx.newPage();
  await ensureOwner(page);
  const id = await newPage(page, 'История: телефон');
  await page.keyboard.type('Текст на телефоне');
  await expectSaved(page);
  await api(page, 'POST', `/api/v1/pages/${id}/revisions`, { label: 'Мобильная версия' });
  const panel = await openHistory(page);
  await panel.getByText('Мобильная версия').click();
  await expect(panel.getByRole('button', { name: 'Закрыть просмотр версии' })).toBeVisible();
  await panel.getByRole('button', { name: 'К списку версий' }).click();
  await expect(panel.getByRole('button', { name: 'К списку версий' })).toHaveCount(0);
  await expect(panel.getByText('Мобильная версия')).toBeVisible();
  await ctx.close();
});

test('R-COMMENTS-005, QA26-03: «Удалить» a comment — cancel keeps it; a server error and offline keep it with the reason; confirm deletes it (server, after reload); a colleague with comment rights cannot delete someone else’s comment', async ({ page, context, browser }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Комментарии: удаление');
  await page.keyboard.type('Текст для обсуждения');
  await expectSaved(page);
  await api(page, 'POST', `/api/v1/pages/${id}/comments`, { text: 'Комментарий владельца', quote: null, blockId: null });
  const colleague = await createUser(page.request, 'Глеб Комментатор', { pageGrants: [{ pageId: id, level: 'comment' }] });
  await page.reload();
  await page.getByRole('button', { name: 'Комментарии', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Комментарии' });
  const comment = panel.locator('.cm-comment').filter({ hasText: 'Комментарий владельца' });
  await expect(comment).toBeVisible();
  const dialog = page.getByRole('dialog', { name: 'Удалить комментарий?' });
  const del = async () => {
    await comment.getByRole('button', { name: 'Действия с комментарием' }).click();
    await page.getByRole('menuitem', { name: 'Удалить' }).click();
    await expect(dialog).toBeVisible();
  };
  const stored = async () => ((await (await page.request.get(`/api/v1/pages/${id}/comments`)).json()).threads as any[]).flatMap((t) => t.comments);
  // cancel
  await del();
  await dialog.getByRole('button', { name: 'Отмена' }).click();
  await expect(dialog).toBeHidden();
  await expect(comment.locator('.cm-text')).toHaveText('Комментарий владельца');
  // server error
  await page.route('**/api/v1/comments/*', (r) => (r.request().method() === 'DELETE' ? r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'internal', message: 'Внутренняя ошибка сервера' } }) }) : r.fallback()));
  await del();
  await dialog.getByRole('button', { name: 'Удалить' }).click();
  await expect(toasts(page)).toContainText('Внутренняя ошибка сервера');
  await expect(comment.locator('.cm-text')).toHaveText('Комментарий владельца');
  await page.unroute('**/api/v1/comments/*');
  expect((await stored()).find((c) => c.text === 'Комментарий владельца')?.deleted).toBe(false);
  // offline
  await context.setOffline(true);
  await del();
  await dialog.getByRole('button', { name: 'Удалить' }).click();
  await expect(toasts(page).locator('.toast').last()).toContainText(/сет|связ|подключ|Failed|ошибк/i);
  await context.setOffline(false);
  expect((await stored()).find((c) => c.text === 'Комментарий владельца')?.deleted).toBe(false);

  // no permission: the colleague (comment level) adds a comment and can delete only their own
  const ctx2 = await browser.newContext();
  const p2 = await ctx2.newPage();
  await p2.goto('/p/' + id);
  await login_(p2, colleague.email, colleague.password);
  await p2.getByRole('button', { name: 'Комментарии', exact: true }).click();
  const panel2 = p2.getByRole('complementary', { name: 'Комментарии' });
  await expect(panel2.locator('.cm-comment').filter({ hasText: 'Комментарий владельца' })).toBeVisible();
  await expect(panel2.locator('.cm-comment').filter({ hasText: 'Комментарий владельца' }).getByRole('button', { name: 'Действия с комментарием' })).toHaveCount(0);
  const forbidden = await p2.request.delete(`/api/v1/comments/${(await stored()).find((c) => c.text === 'Комментарий владельца').id}`, {
    headers: { 'x-csrf-token': (await ctx2.storageState()).cookies.find((c) => c.name === 'kb_csrf')?.value ?? '' },
  });
  expect(forbidden.status()).toBe(403);
  await ctx2.close();

  // confirm
  await del();
  await dialog.getByRole('button', { name: 'Удалить' }).click();
  await expect(toasts(page)).toContainText('Комментарий удалён');
  await expect(panel.locator('.cm-deleted')).toHaveText('Комментарий удалён');
  await expect.poll(async () => (await stored()).find((c) => c.author.name && c.deleted)?.deleted).toBe(true);
  await page.reload();
  await expect(editor(page)).toContainText('Текст для обсуждения');
  if (!(await page.getByRole('complementary', { name: 'Комментарии' }).isVisible())) await page.getByRole('button', { name: 'Комментарии', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Комментарии' }).locator('.cm-deleted')).toHaveText('Комментарий удалён');
  await expect(page.getByRole('complementary', { name: 'Комментарии' }).getByText('Комментарий владельца')).toHaveCount(0);
});
