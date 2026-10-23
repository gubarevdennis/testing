import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { ensureOwner, createUser, OWNER } from './helpers';
import { call, count, failWith, humanDoubleClick, pageErrors, signedIn, slow, toasts, uniq } from './qa-admin-helpers';

/**
 * Action × condition tests of the access console (emergency access, organisation-wide public links: apps/web/src/admin/
 * AccessSection.tsx) and of backups (archive export → restore → report: ArchivesSection.tsx) — the critical actions
 * docs/qa/ACTION_MATRIX.md listed as uncovered (QA26-01, QA26-03, R-QA-004, R-QA-029, R-UI-061, R-ACL-056, R-ARCHIVE-*).
 */

interface Emergency {
  id: string;
  page_id: string;
  status: string;
}
const emergencies = async (page: Page) => (await call<{ requests: Emergency[] }>(page, 'GET', '/api/v1/admin/emergency-access')).requests;

/** A second administrator, an author with a personal page, and an emergency request by the second admin for that page. */
async function emergencySetup(page: Page, browser: import('@playwright/test').Browser) {
  const tag = uniq();
  const author = await createUser(page.request, `Аня Автор ${tag}`);
  const admin2 = await createUser(page.request, `Ян Админ ${tag}`);
  await call(page, 'PATCH', `/api/v1/admin/users/${admin2.id}`, { orgRole: 'admin' });
  const a = await signedIn(browser, author);
  const me = await call<{ personalSpaceId: string }>(a.p, 'GET', '/api/v1/auth/me');
  const pageId = (await call<{ page: { id: string } }>(a.p, 'POST', '/api/v1/pages', { spaceId: me.personalSpaceId, title: `Личное ${tag}` })).page.id;
  await a.ctx.close();
  const b = await signedIn(browser, admin2);
  const request = async () => {
    await call(b.p, 'POST', '/api/v1/admin/emergency-access', { pageId, reason: `Проверка инцидента по заявке ${tag} службы безопасности`, durationHours: 4 });
    return (await emergencies(page)).find((r) => r.page_id === pageId && r.status === 'pending')!.id;
  };
  return { tag, admin2: b, pageId, request };
}

async function openTab(page: Page, tab: string) {
  await page.goto('/admin/access');
  await page.getByRole('tab', { name: tab }).click();
}

test('QA admin access setup', async ({ page }) => {
  await ensureOwner(page);
});

test('R-ACL-056 emergency access «Отклонить»: «Отклонить запрос?» cancel keeps it pending; server error keeps it; confirm rejects it and the requester gets no access', async ({ page, browser }) => {
  const errors = pageErrors(page);
  await ensureOwner(page);
  const s = await emergencySetup(page, browser);
  const id = await s.request();
  await openTab(page, 'Экстренный доступ');
  const row = page.getByRole('row', { name: new RegExp(s.tag) });
  await row.getByRole('button', { name: 'Отклонить' }).click();
  const ask = page.getByRole('dialog', { name: 'Отклонить запрос?' });
  await ask.getByRole('button', { name: 'Отмена' }).click();
  expect((await emergencies(page)).find((r) => r.id === id)!.status).toBe('pending');
  await failWith(page, `**/api/v1/admin/emergency-access/${id}/decide`, 'POST');
  await row.getByRole('button', { name: 'Отклонить' }).click();
  await ask.getByRole('button', { name: 'Отклонить' }).click();
  await expect(toasts(page)).toContainText('Внутренняя ошибка сервера');
  expect((await emergencies(page)).find((r) => r.id === id)!.status).toBe('pending');
  await page.unroute(`**/api/v1/admin/emergency-access/${id}/decide`);
  await row.getByRole('button', { name: 'Отклонить' }).click();
  await ask.getByRole('button', { name: 'Отклонить' }).click();
  await expect(toasts(page)).toContainText('Запрос отклонён');
  await expect(row).toContainText('Отклонён');
  await expect(row.getByRole('button')).toHaveCount(0);
  expect((await emergencies(page)).find((r) => r.id === id)!.status).toBe('rejected');
  expect((await s.admin2.p.request.get(`/api/v1/pages/${s.pageId}`)).status()).toBe(404);
  await s.admin2.ctx.close();
  expect(errors).toEqual([]);
});

test('R-ACL-056 emergency access «Отозвать»: server error keeps the access; slow network + double click revokes once without an error; the requester loses the read access', async ({ page, browser }) => {
  const errors = pageErrors(page);
  await ensureOwner(page);
  const s = await emergencySetup(page, browser);
  const id = await s.request();
  await call(page, 'POST', `/api/v1/admin/emergency-access/${id}/decide`, { approve: true });
  expect((await s.admin2.p.request.get(`/api/v1/pages/${s.pageId}`)).status()).toBe(200);
  await openTab(page, 'Экстренный доступ');
  const row = page.getByRole('row', { name: new RegExp(s.tag) });
  await expect(row).toContainText('Утверждён');
  const revoke = row.getByRole('button', { name: 'Отозвать' });
  await failWith(page, `**/api/v1/admin/emergency-access/${id}/revoke`, 'POST');
  await revoke.click();
  await expect(toasts(page)).toContainText('Внутренняя ошибка сервера');
  expect((await emergencies(page)).find((r) => r.id === id)!.status).toBe('approved');
  await page.unroute(`**/api/v1/admin/emergency-access/${id}/revoke`);
  const sent = await slow(page, `**/api/v1/admin/emergency-access/${id}/revoke`, 'POST', 800);
  await humanDoubleClick(page, revoke);
  await expect(toasts(page)).toContainText('Экстренный доступ отозван');
  await expect(row).toContainText('Отозван');
  expect(sent.n).toBe(1);
  await expect(toasts(page)).not.toContainText('не найден');
  expect((await emergencies(page)).find((r) => r.id === id)!.status).toBe('revoked');
  expect((await s.admin2.p.request.get(`/api/v1/pages/${s.pageId}`)).status()).toBe(404);
  await s.admin2.ctx.close();
  expect(errors).toEqual([]);
});

test('QA-A5 (fixed): an instantaneous double activation of «Отозвать» (emergency access) sends one request — no «not found» error after the success', async ({ page, browser }) => {
  await ensureOwner(page);
  const s = await emergencySetup(page, browser);
  const id = await s.request();
  await call(page, 'POST', `/api/v1/admin/emergency-access/${id}/decide`, { approve: true });
  await openTab(page, 'Экстренный доступ');
  const row = page.getByRole('row', { name: new RegExp(s.tag) });
  const sent = await slow(page, `**/api/v1/admin/emergency-access/${id}/revoke`, 'POST', 400);
  await row.getByRole('button', { name: 'Отозвать' }).dblclick();
  await expect(toasts(page)).toContainText('Экстренный доступ отозван');
  await page.waitForTimeout(800);
  expect(sent.n).toBe(1);
  await expect(toasts(page)).not.toContainText(/не найден|Not found/i);
  await s.admin2.ctx.close();
});

test('R-ACL-056 no permission: an auditor sees emergency requests and public links read-only — no «Утвердить», «Отклонить», «Отозвать»', async ({ page, browser }) => {
  await ensureOwner(page);
  const s = await emergencySetup(page, browser);
  await s.request();
  await s.admin2.ctx.close();
  const aud = await createUser(page.request, `Алиса Аудитор ${s.tag}`);
  await call(page, 'PATCH', `/api/v1/admin/users/${aud.id}`, { orgRole: 'auditor' });
  const a = await signedIn(browser, aud, '/admin/access');
  await a.p.goto('/admin/access');
  await a.p.getByRole('tab', { name: 'Экстренный доступ' }).click();
  const row = a.p.getByRole('row', { name: new RegExp(s.tag) });
  await expect(row).toContainText('Ожидает утверждения');
  await expect(row.getByRole('button')).toHaveCount(0);
  await expect(a.p.getByRole('button', { name: 'Отправить запрос' })).toHaveCount(0);
  await a.p.getByRole('tab', { name: 'Публичные ссылки' }).click();
  await expect(a.p.getByRole('button', { name: 'Отозвать' })).toHaveCount(0);
  await a.ctx.close();
});

test('R-PUBLISH-009 admin «Отозвать» public link: «Отозвать публичную ссылку?» cancel keeps it working; server error keeps it; confirm stops the link at once; empty state', async ({ page }) => {
  const errors = pageErrors(page);
  await ensureOwner(page);
  await call(page, 'PATCH', '/api/v1/admin/settings', { publicLinksEnabled: true });
  const spaces = await call<{ spaces: Array<{ id: string; isPersonal: boolean }> }>(page, 'GET', '/api/v1/spaces');
  const personal = spaces.spaces.find((x) => x.isPersonal)!.id;
  const pageId = (await call<{ page: { id: string } }>(page, 'POST', '/api/v1/pages', { spaceId: personal, title: `Публичная ${uniq()}` })).page.id;
  // revoke links left by other tests so the table holds exactly this one
  for (const l of (await call<{ links: Array<{ id: string }> }>(page, 'GET', '/api/v1/admin/share-links')).links) await call(page, 'DELETE', `/api/v1/share-links/${l.id}`);
  const link = await call<{ link: { id: string }; path: string }>(page, 'POST', `/api/v1/pages/${pageId}/share-links`, { acknowledged: true });
  const pub = async () => (await page.request.get(link.path)).status();
  expect(await pub()).toBe(200);
  await openTab(page, 'Публичные ссылки');
  const table = page.getByRole('table', { name: 'Публичные ссылки' });
  await expect(table.getByRole('row', { name: new RegExp(pageId) })).toBeVisible();
  const revoke = table.getByRole('button', { name: 'Отозвать' });
  await revoke.click();
  const ask = page.getByRole('dialog', { name: 'Отозвать публичную ссылку?' });
  await ask.getByRole('button', { name: 'Отмена' }).click();
  expect(await pub()).toBe(200);
  await failWith(page, `**/api/v1/share-links/${link.link.id}`, 'DELETE');
  await revoke.click();
  await ask.getByRole('button', { name: 'Отозвать' }).click();
  await expect(toasts(page)).toContainText('Внутренняя ошибка сервера');
  expect(await pub()).toBe(200);
  await page.unroute(`**/api/v1/share-links/${link.link.id}`);
  await revoke.click();
  await ask.getByRole('button', { name: 'Отозвать' }).click();
  await expect(toasts(page)).toContainText('Ссылка отозвана');
  await expect(page.getByRole('heading', { name: 'Активных публичных ссылок нет' })).toBeVisible();
  expect(await pub()).not.toBe(200);
  await call(page, 'DELETE', `/api/v1/pages/${pageId}`);
  expect(errors).toEqual([]);
});

test('R-ARCHIVE-001 archive export: wrong password is explained and cleared, double click creates one archive job, the archive becomes downloadable', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = pageErrors(page);
  await ensureOwner(page);
  const jobs = async () => (await call<{ archives: Array<{ id: string; type: string; status: string }> }>(page, 'GET', '/api/v1/admin/archives')).archives.filter((a) => a.type === 'archive-export');
  const before = (await jobs()).length;
  await page.goto('/admin/archives');
  await page.getByRole('button', { name: 'Создать архив' }).click();
  const dlg = page.getByRole('dialog', { name: 'Архив организации' });
  const create = dlg.getByRole('button', { name: 'Создать архив' });
  await expect(create).toBeDisabled(); // no password, no acknowledgement
  await dlg.getByLabel('Ваш пароль').fill('Wrong-password-1');
  await dlg.getByLabel('Я подтверждаю выгрузку всех данных организации').check();
  await create.click();
  await expect(dlg.getByText('Неверный пароль. Подтвердите операцию своим паролем.')).toBeVisible();
  await expect(dlg.getByLabel('Ваш пароль')).toHaveValue('');
  expect((await jobs()).length).toBe(before);
  await dlg.getByLabel('Ваш пароль').fill(OWNER.password);
  const sent = await slow(page, '**/api/v1/admin/archives', 'POST', 600);
  await create.dblclick();
  await expect(toasts(page)).toContainText('Архив формируется');
  await page.waitForTimeout(800);
  expect(sent.n).toBe(1);
  expect((await jobs()).length).toBe(before + 1);
  await page.unroute('**/api/v1/admin/archives');
  // the export finishes and can be downloaded
  const download = page.getByRole('row', { name: /Экспорт архива/ }).first().getByRole('button', { name: 'Скачать' });
  await expect(download).toBeVisible({ timeout: 180_000 });
  const dl = page.waitForEvent('download');
  await download.click();
  const file = await dl;
  expect(file.suggestedFilename()).toMatch(/\.zip$/);
  expect(errors).toEqual([]);
});

test('R-ARCHIVE-006 restore from archive: analysis report («Пользователи в архиве: …») before any change, restore into a new isolated space, then «Отчёт» → «Отчёт о восстановлении»', async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  const errors = pageErrors(page);
  await ensureOwner(page);
  const archives = async () => (await call<{ archives: Array<{ id: string; type: string; status: string }> }>(page, 'GET', '/api/v1/admin/archives')).archives;
  // a fresh, small archive (no versions, comments, audit)
  const job = await call<{ jobId: string }>(page, 'POST', '/api/v1/admin/archives', { password: OWNER.password, confirm: true, options: { includeVersions: false, includeAcl: true, includeComments: false, includeAudit: false } });
  await expect.poll(async () => (await archives()).find((a) => a.id === job.jobId)?.status, { timeout: 180_000 }).toBe('succeeded');
  const zip = await page.request.get(`/api/v1/admin/archives/${job.jobId}/download`);
  expect(zip.ok()).toBeTruthy();
  const path = testInfo.outputPath('org-archive.zip');
  (await import('node:fs')).writeFileSync(path, await zip.body());
  const spacesBefore = (await call<{ spaces: Array<{ id: string; name: string }> }>(page, 'GET', '/api/v1/spaces')).spaces.length;

  await page.goto('/admin/archives');
  await page.getByRole('button', { name: 'Восстановить из архива' }).click();
  const dlg = page.getByRole('dialog', { name: 'Восстановление из архива' });
  await expect(dlg.getByRole('button', { name: 'Проверить архив' })).toBeDisabled(); // no file
  await dlg.getByLabel('Файл архива').setInputFiles({ name: 'org-archive.zip', mimeType: 'application/zip', buffer: readFileSync(path) });
  await dlg.getByRole('button', { name: 'Проверить архив' }).click();
  await expect(dlg.getByText('Архив прошёл проверку целостности')).toBeVisible({ timeout: 120_000 });
  const users = dlg.getByText(/Пользователи в архиве: \d+ \(найдено в системе: \d+, не найдено: 0\)/);
  await users.click(); // expands the list
  await expect(dlg.getByText(OWNER.email)).toBeVisible();
  // nothing changed yet
  expect((await call<{ spaces: unknown[] }>(page, 'GET', '/api/v1/spaces')).spaces.length).toBe(spacesBefore);
  const restore = dlg.getByRole('button', { name: 'Восстановить' });
  await dlg.getByLabel('В новое изолированное пространство (видно только вам)').check();
  const name = `Восстановлено ${uniq()}`;
  await dlg.getByLabel('Название нового пространства').fill(name);
  await expect(restore).toBeDisabled(); // password + acknowledgement
  await dlg.getByLabel('Ваш пароль').fill(OWNER.password);
  await dlg.getByLabel('Я проверил отчёт и подтверждаю восстановление').check();
  await restore.click();
  const result = page.getByRole('dialog', { name: 'Результат восстановления' });
  await expect(result).toBeVisible({ timeout: 180_000 });
  await expect(result.getByRole('status')).toContainText('Восстановление завершено');
  expect((await call<{ spaces: Array<{ name: string }> }>(page, 'GET', '/api/v1/spaces')).spaces.some((x) => x.name === name)).toBe(true);
  await result.getByRole('button', { name: 'Готово' }).click();
  // the restore job's report
  await page.getByRole('row', { name: /Восстановление/ }).first().getByRole('button', { name: 'Отчёт' }).click();
  const report = page.getByRole('dialog', { name: 'Отчёт о восстановлении' });
  await expect(report.getByRole('status').first()).toContainText('Восстановление завершено');
  await report.getByText('Отчёт предварительной проверки').click();
  await expect(report.getByText(/Пользователи в архиве: \d+/)).toBeVisible();
  await report.getByRole('button', { name: 'Закрыть' }).last().click();
  await expect(report).toBeHidden();
  expect(errors).toEqual([]);
});

test('R-ARCHIVE-006 restore: a server error while checking the archive is explained and the dialog can be cancelled; a non-admin has no backups section', async ({ page, browser }) => {
  await ensureOwner(page);
  await page.goto('/admin/archives');
  await page.getByRole('button', { name: 'Восстановить из архива' }).click();
  const dlg = page.getByRole('dialog', { name: 'Восстановление из архива' });
  await dlg.getByLabel('Файл архива').setInputFiles({ name: 'broken.zip', mimeType: 'application/zip', buffer: Buffer.from('not a zip') });
  const sent = await count(page, '**/api/v1/admin/archives/restore', 'POST');
  await dlg.getByRole('button', { name: 'Проверить архив' }).click();
  await expect(dlg.getByRole('alert').or(dlg.getByText('Архив повреждён'))).toBeVisible();
  expect(sent.n).toBe(1);
  await dlg.getByRole('button', { name: /Отмена|Закрыть/ }).last().click();
  await expect(dlg).toBeHidden();
  const hr = await createUser(page.request, 'Ханна Кадры');
  await call(page, 'PATCH', `/api/v1/admin/users/${hr.id}`, { orgRole: 'people_admin' });
  const h = await signedIn(browser, hr, '/admin/archives');
  await h.p.goto('/admin/archives');
  await expect(h.p.getByRole('link', { name: 'Резервные копии и архив' })).toHaveCount(0);
  await expect(h.p.getByRole('button', { name: 'Создать архив' })).toHaveCount(0);
  expect((await h.p.request.get('/api/v1/admin/archives')).status()).toBe(403);
  await h.ctx.close();
});
