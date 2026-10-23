import { test, expect, type Page } from '@playwright/test';
import { ensureOwner, editor, expectSaved, createUser, login_, apiContent, caretIn } from './helpers';
import { newPage, cleanupCreatedPages } from './editor-p0-helpers';

/**
 * Conflict dialogs (R-COLLAB-036, R-COLLAB-045): «Конфликт правок» (edit vs concurrent delete of a block) and
 * «Страница удалена, пока вы её редактировали» (the page went to the trash while this device had changes) — cancel /
 * decide later, server error, offline and the successful choices, asserting what the server stores.
 */
cleanupCreatedPages();

const toasts = (p: Page) => p.locator('.toasts');
const csrf = async (p: Page) => (await p.context().storageState()).cookies.find((c) => c.name === 'kb_csrf')?.value ?? '';
const trash = async (p: Page, id: string) => expect((await p.request.delete(`/api/v1/pages/${id}`, { headers: { 'x-csrf-token': await csrf(p) } })).ok()).toBe(true);

test('R-COLLAB-036: «Конфликт правок» — «Решить позже» leaves a reminder, «Разрешить» reopens it, «Сохранить обе» keeps the deletion and adds my version as a separate block (server, after reload)', async ({ page, browser }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Конфликт правок: диалог');
  await page.keyboard.type('Первый абзац.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Спорный абзац');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Последний абзац.');
  await expectSaved(page);
  const bob = await createUser(page.request, 'Борис Удаляет', { pageGrants: [{ pageId: id, level: 'edit' }] });
  const ctx2 = await browser.newContext();
  const p2 = await ctx2.newPage();
  await p2.goto('/p/' + id);
  await login_(p2, bob.email, bob.password);
  await expect(editor(p2)).toContainText('Спорный абзац');
  // a truly concurrent delete: the colleague is offline while deleting
  await ctx2.setOffline(true);
  await caretIn(p2, 'Спорный абзац');
  await p2.keyboard.press('Escape');
  await p2.keyboard.press('Delete');
  await expect(editor(p2)).not.toContainText('Спорный абзац');
  await caretIn(page, 'Спорный абзац');
  await page.keyboard.press('End');
  await page.keyboard.type(' с моей правкой');
  await expectSaved(page);
  await ctx2.setOffline(false);
  const dialog = page.getByRole('dialog', { name: 'Конфликт правок' });
  await expect(dialog).toBeVisible({ timeout: 20_000 });
  await expect(dialog.getByRole('region', { name: 'Ваша версия' })).toContainText('Спорный абзац с моей правкой');
  await expect(dialog.getByRole('region', { name: 'Версия сервера' })).toContainText('Блок удалён');
  // decide later (cancel): a reminder stays, nothing is changed
  await dialog.getByRole('button', { name: 'Решить позже' }).click();
  await expect(dialog).toBeHidden();
  const reminder = page.getByRole('status').filter({ hasText: 'Неразрешённых конфликтов правок: 1' });
  await expect(reminder).toBeVisible();
  await expect.poll(async () => JSON.stringify((await apiContent(page.request, id)).content)).not.toContain('Спорный абзац');
  await reminder.getByRole('button', { name: 'Разрешить' }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Сохранить обе' }).click();
  await expect(dialog).toBeHidden();
  await expect(toasts(page)).toContainText('Сохранены обе версии блока');
  await expect(reminder).toHaveCount(0);
  await expectSaved(page);
  const paras = async (p: Page) => ((await apiContent(p.request, id)).content.content as any[]).map((b) => (b.content ?? []).map((t: any) => t.text).join(''));
  await expect.poll(() => paras(page)).toEqual(['Первый абзац.', 'Спорный абзац с моей правкой', 'Последний абзац.']);
  await expect(editor(p2)).toContainText('Спорный абзац с моей правкой');
  await page.reload();
  await expect(editor(page)).toContainText('Спорный абзац с моей правкой');
  await expect(page.getByRole('dialog', { name: 'Конфликт правок' })).toHaveCount(0);
  await ctx2.close();
});

/**
 * The page goes to the trash while this device has changes the server has not taken yet: either the device is offline,
 * or (online) the collaboration channel holds back the device's updates while everything else passes.
 */
async function deletedWhileEditing(page: Page, title: string, offline: boolean) {
  let holding = false;
  if (!offline)
    await page.routeWebSocket(/\/api\/v1\/collab\//, (ws) => {
      const srv = ws.connectToServer();
      ws.onMessage((m) => {
        if (holding && typeof m !== 'string' && m[0] === 2) return; // MSG.UPDATE stays on the device
        srv.send(m);
      });
      srv.onMessage((m) => ws.send(m));
    });
  await ensureOwner(page);
  const id = await newPage(page, title);
  await page.keyboard.type('Сохранённый текст');
  await expectSaved(page);
  if (offline) await page.context().setOffline(true);
  holding = true;
  await page.keyboard.press('Enter');
  await page.keyboard.type('Правка, которой нет на сервере');
  if (offline) await expect(page.locator('.sync-status')).toHaveText(/устройств|Нет сети|офлайн/i, { timeout: 15_000 });
  else await page.waitForTimeout(500);
  await trash(page, id); // the API request is neither offline nor held back
  if (offline) await page.context().setOffline(false);
  const dialog = page.getByRole('dialog', { name: 'Страница удалена, пока вы её редактировали' });
  await expect(dialog).toBeVisible({ timeout: 20_000 });
  await expect(dialog.getByRole('region', { name: 'Ваша версия' })).toContainText('Правка, которой нет на сервере');
  return { id, dialog };
}

test('R-COLLAB-036: «Страница удалена, пока вы её редактировали» — «Сохранить локальную копию» downloads my text; «Сохранить мою версию как новую страницу»: a server error keeps the dialog, success creates the page with my text', async ({ page }) => {
  const { id, dialog } = await deletedWhileEditing(page, 'Удалена во время правки', false);
  // local copy as a file
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Сохранить локальную копию' }).click()]);
  const path = await download.path();
  const md = (await import('node:fs')).readFileSync(path!, 'utf8');
  expect(md).toContain('Правка, которой нет на сервере');
  // server error: the dialog stays and explains
  await page.route('**/api/v1/pages/*/conflict-copy', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'internal', message: 'Внутренняя ошибка сервера' } }) }));
  const save = dialog.getByRole('button', { name: 'Сохранить мою версию как новую страницу' });
  await save.click();
  await expect(toasts(page)).toContainText(/Внутренняя ошибка сервера|Не удалось сохранить копию/);
  await expect(dialog).toBeVisible();
  await page.unroute('**/api/v1/pages/*/conflict-copy');
  // success
  const created = page.waitForResponse((r) => r.url().includes('/conflict-copy') && r.request().method() === 'POST');
  await save.click();
  const copy = (await (await created).json()).page as { id: string; title: string };
  await expect(toasts(page)).toContainText(`Ваша версия сохранена как страница «${copy.title}»`);
  await expect(dialog).toBeHidden();
  expect(copy.title).toContain('моя версия (конфликт)');
  const c = JSON.stringify((await apiContent(page.request, copy.id)).content);
  expect(c).toContain('Сохранённый текст');
  expect(c).toContain('Правка, которой нет на сервере');
  // the original stays in the trash, untouched by the refused change
  const orig = await (await page.request.get(`/api/v1/pages/${id}`)).json();
  expect(orig.page?.deletedAt ?? orig.page?.deleted_at).toBeTruthy();
  await page.request.delete(`/api/v1/pages/${copy.id}`, { headers: { 'x-csrf-token': await csrf(page) } });
});

test('QA-E3 (fixed): offline edits to a page trashed meanwhile — after reconnecting the same «Страница удалена, пока вы её редактировали» dialog offers to keep them as a new page', async ({ page }) => {
  const { dialog } = await deletedWhileEditing(page, 'Удалена без сети', true);
  const created = page.waitForResponse((r) => r.url().includes('/conflict-copy') && r.request().method() === 'POST');
  await dialog.getByRole('button', { name: 'Сохранить мою версию как новую страницу' }).click();
  const copy = (await (await created).json()).page as { id: string };
  await expect(dialog).toBeHidden();
  expect(JSON.stringify((await apiContent(page.request, copy.id)).content)).toContain('Правка, которой нет на сервере');
  await page.request.delete(`/api/v1/pages/${copy.id}`, { headers: { 'x-csrf-token': await csrf(page) } });
});

test('QA-E3: a reader whose page is moved to the trash sees the trash banner, not the «edited while deleted» dialog', async ({ page, browser }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Удалена при чтении');
  await page.keyboard.type('Только читают');
  await expectSaved(page);
  const reader = await createUser(page.request, 'Читатель Корзины', { pageGrants: [{ pageId: id, level: 'view' }] });
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await p2.goto('/p/' + id);
  await login_(p2, reader.email, reader.password);
  await expect(editor(p2)).toContainText('Только читают');
  await trash(page, id);
  await expect(p2.getByRole('alert').filter({ hasText: 'Страница перемещена в корзину' }).or(p2.getByText(/Страница (в корзине|не найдена)/)).first()).toBeVisible({ timeout: 20_000 });
  await expect(p2.getByRole('dialog', { name: 'Страница удалена, пока вы её редактировали' })).toHaveCount(0);
  await ctx.close();
});
