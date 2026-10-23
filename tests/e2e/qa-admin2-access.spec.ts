import { test, expect, type Page } from '@playwright/test';
import { ensureOwner, createUser, OWNER } from './helpers';
import { call, failWith, humanDoubleClick, pageErrors, signedIn, slow, toasts, uniq } from './qa-admin-helpers';
import { createSpace, createPageIn } from './qa-admin2-helpers';

/**
 * Second QA wave of the access console (/admin/access: «Проверить доступ» suggestions, «Увольнение: личные материалы»)
 * and of backups (/admin/archives: archive composition, restore into an existing space) — QA26-01, QA26-03, R-QA-004,
 * R-UI-061, R-ADMIN-016, R-ADMIN-018, R-ARCHIVE-006.
 */

async function openTab(page: Page, tab: string) {
  await page.goto('/admin/access');
  await page.getByRole('tab', { name: tab }).click();
  await expect(page.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true');
}

test('QA admin2 access setup', async ({ page }) => {
  await ensureOwner(page);
});

test('R-ADMIN-018 «Проверить доступ»: typing a title in «Документ (ссылка, ID или название)» suggests documents; picking one explains the employee\'s access to it; an unknown title suggests nothing of it', async ({ page }) => {
  const errors = pageErrors(page);
  await ensureOwner(page);
  const tag = uniq();
  const u = await createUser(page.request, `Света Проверка ${tag}`);
  const space = await createSpace(page, `Проверяемое ${tag}`);
  const title = `Регламент ${tag}`;
  await createPageIn(page, space, title);
  await openTab(page, 'Проверить доступ');
  await page.getByLabel('Сотрудник', { exact: true }).fill(`Света Проверка ${tag}`);
  await page.getByRole('option', { name: new RegExp(`Света Проверка ${tag}`) }).click();
  const doc = page.getByLabel('Документ (ссылка, ID или название)');
  await doc.fill(`щъыэ${uniq()}`);
  await page.waitForTimeout(600);
  await expect(page.getByRole('option', { name: `Регламент ${tag}` })).toHaveCount(0);
  await doc.fill(title);
  const suggestion = page.getByRole('listbox', { name: 'Документы' }).getByRole('option', { name: title });
  await expect(suggestion).toBeVisible({ timeout: 15_000 });
  await suggestion.click();
  await expect(doc).toHaveValue(new RegExp(`^${title} — [0-9a-f-]{36}$`));
  // the employee is not a member of the private space: the explanation says there is no access
  await expect(page.getByText(/Нет доступа|не может открыть/).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('R-ADMIN-016 «Увольнение: личные материалы»: «Сотрудник» lists suspended employees; «Предпросмотр» counts pages without changing anything; «Политика» «Передать преемнику…» needs a successor and moves the shared document to him; slow network + double click applies once', async ({ page, browser }) => {
  const errors = pageErrors(page);
  await ensureOwner(page);
  const tag = uniq();
  const leaver = await createUser(page.request, `Уля Уходит ${tag}`);
  const heir = await createUser(page.request, `Ваня Преемник ${tag}`);
  const colleague = await createUser(page.request, `Коля Коллега ${tag}`);
  // the leaver's personal space: one document shared with a colleague, one private note
  const l = await signedIn(browser, leaver);
  const me = await call<{ personalSpaceId: string }>(l.p, 'GET', '/api/v1/auth/me');
  const shared = (await call<{ page: { id: string } }>(l.p, 'POST', '/api/v1/pages', { spaceId: me.personalSpaceId, title: `Общий план ${tag}` })).page.id;
  await call(l.p, 'POST', '/api/v1/pages', { spaceId: me.personalSpaceId, title: `Личная заметка ${tag}` });
  await call(l.p, 'PUT', '/api/v1/grants', { resourceType: 'page', resourceId: shared, subjectType: 'user', subjectId: colleague.id, level: 'view' });
  await l.ctx.close();
  await call(page, 'POST', `/api/v1/admin/users/${leaver.id}/status`, { status: 'suspended', reason: 'увольнение' });

  await openTab(page, 'Увольнение: личные материалы');
  const who = page.getByLabel('Сотрудник', { exact: true });
  const previewBtn = page.getByRole('button', { name: 'Предпросмотр' });
  const apply = page.getByRole('button', { name: 'Применить' });
  await expect(previewBtn).toBeDisabled(); // nobody chosen
  await who.selectOption({ label: `Уля Уходит ${tag} (приостановлен)` });
  await previewBtn.click();
  const status = page.getByRole('status').filter({ hasText: 'Страниц в личном пространстве' });
  await expect(status).toContainText('Страниц в личном пространстве: 2; уже доступны коллегам: 1; только личные: 1.');
  await expect(status).toContainText('Все останутся закрытыми и будут архивированы.');
  // «Политика»: transfer to a successor
  await page.getByLabel('Политика').selectOption({ label: 'Передать преемнику документы, которыми он делился' });
  await expect(status).toHaveCount(0); // a policy change resets the preview
  await expect(previewBtn).toBeDisabled(); // no successor yet
  await page.getByLabel('Преемник').fill(`Ваня Преемник ${tag}`);
  await page.getByRole('option', { name: new RegExp(`Ваня Преемник ${tag}`) }).click();
  // a server error on the preview is reported
  await failWith(page, `**/api/v1/admin/users/${leaver.id}/offboard-personal`, 'POST');
  await previewBtn.click();
  await expect(page.locator('.toasts')).toContainText('Внутренняя ошибка сервера');
  await expect(apply).toBeDisabled();
  await page.unroute(`**/api/v1/admin/users/${leaver.id}/offboard-personal`);
  await previewBtn.click();
  await expect(status).toContainText('Преемнику будет передано: 1.');
  const sent = await slow(page, `**/api/v1/admin/users/${leaver.id}/offboard-personal`, 'POST', 800);
  await humanDoubleClick(page, apply);
  await expect(toasts(page)).toContainText('Готово: личное пространство архивировано, передано документов: 1');
  expect(sent.n).toBe(1);
  // the successor now has full access to the shared document
  const h = await signedIn(browser, heir);
  const r = await h.p.request.get(`/api/v1/pages/${shared}`);
  expect(r.ok()).toBeTruthy();
  await h.ctx.close();
  expect(errors).toEqual([]);
});

test('R-ADMIN-016 no permission: an auditor has no «Увольнение: личные материалы» tab and the API refuses', async ({ page, browser }) => {
  await ensureOwner(page);
  const aud = await createUser(page.request, `Ада Аудитор ${uniq()}`);
  await call(page, 'PATCH', `/api/v1/admin/users/${aud.id}`, { orgRole: 'auditor' });
  const a = await signedIn(browser, aud, '/admin/access');
  await a.p.goto('/admin/access');
  await expect(a.p.getByRole('tab', { name: 'Матрица доступа' })).toBeVisible();
  await expect(a.p.getByRole('tab', { name: 'Увольнение: личные материалы' })).toHaveCount(0);
  const r = await call(a.p, 'POST', `/api/v1/admin/users/${aud.id}/offboard-personal`, { mode: 'archive', dryRun: true }, true);
  expect(JSON.stringify(r)).toMatch(/error/);
  await a.ctx.close();
});

test('R-ARCHIVE-006 «Архив организации» composition («Страницы, пространства и файлы» always included) and restore «В существующее пространство»: «Пространство для восстановления» is required, then each archived space becomes a top-level page there', async ({ page }, testInfo) => {
  test.setTimeout(360_000);
  const errors = pageErrors(page);
  await ensureOwner(page);
  const tag = uniq();
  const target = await createSpace(page, `Приёмник ${tag}`);
  await page.goto('/admin/archives');
  await page.getByRole('button', { name: 'Создать архив' }).click();
  const dlg = page.getByRole('dialog', { name: 'Архив организации' });
  const core = dlg.getByLabel('Страницы, пространства и файлы');
  await expect(core).toBeChecked();
  await expect(core).toBeDisabled();
  await dlg.getByRole('button', { name: 'Отмена' }).click();
  // a small archive through the API (no versions, comments, audit)
  const archives = async () => (await call<{ archives: Array<{ id: string; status: string }> }>(page, 'GET', '/api/v1/admin/archives')).archives;
  const job = await call<{ jobId: string }>(page, 'POST', '/api/v1/admin/archives', { password: OWNER.password, confirm: true, options: { includeVersions: false, includeAcl: false, includeComments: false, includeAudit: false } });
  await expect.poll(async () => (await archives()).find((a) => a.id === job.jobId)?.status, { timeout: 180_000 }).toBe('succeeded');
  const zip = await page.request.get(`/api/v1/admin/archives/${job.jobId}/download`);
  const path = testInfo.outputPath('org-archive.zip');
  (await import('node:fs')).writeFileSync(path, await zip.body());

  await page.goto('/admin/archives');
  await page.getByRole('button', { name: 'Восстановить из архива' }).click();
  const rs = page.getByRole('dialog', { name: 'Восстановление из архива' });
  await rs.getByLabel('Файл архива').setInputFiles(path);
  await rs.getByRole('button', { name: 'Проверить архив' }).click();
  await expect(rs.getByText('Архив прошёл проверку целостности')).toBeVisible({ timeout: 120_000 });
  await rs.getByLabel('В существующее пространство').check();
  const where = rs.getByLabel('Пространство для восстановления');
  await expect(where.locator('option', { hasText: `Приёмник ${tag}` })).toHaveCount(1);
  await rs.getByLabel('Ваш пароль').fill(OWNER.password);
  await rs.getByLabel('Я проверил отчёт и подтверждаю восстановление').check();
  const restore = rs.getByRole('button', { name: 'Восстановить' });
  await expect(restore).toBeDisabled(); // no space chosen yet
  await where.selectOption({ label: `Приёмник ${tag}` });
  await expect(restore).toBeEnabled();
  await restore.click();
  const result = page.getByRole('dialog', { name: 'Результат восстановления' });
  await expect(result).toBeVisible({ timeout: 180_000 });
  await result.getByRole('button', { name: 'Готово' }).click();
  // the target space received top-level pages (one per archived space)
  await page.goto(`/s/${target}`);
  await expect(page.locator('.space-panel').getByRole('link').first()).toBeVisible();
  expect(errors).toEqual([]);
});
