import { test, expect, type Browser } from '@playwright/test';
import { ensureOwner, createUser, login_, api } from './helpers';

test.describe.configure({ mode: 'serial' });

async function as(browser: Browser, user: { email: string; password: string }, path: string) {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(path);
  await login_(p, user.email, user.password);
  await expect(p.locator('.app-shell')).toBeVisible();
  return { ctx, p };
}

test('R-ADMIN-018 V16-S15: the administrator checks a user\'s access to a document — decision, actions, sources — without impersonation and without seeing private titles', async ({ page, browser }) => {
  await ensureOwner(page);
  const author = await createUser(page.request, 'Вера Автор');
  const reader = await createUser(page.request, 'Глеб Читатель');
  // A personal page of another employee, shared with the reader: the administrator has no access to it.
  const a = await as(browser, author, '/');
  const me = await (await a.p.request.get('/api/v1/auth/me')).json();
  const csrf = (await a.ctx.storageState()).cookies.find((c) => c.name === 'kb_csrf')!.value;
  const created = await (await a.p.request.post('/api/v1/pages', { data: { spaceId: me.personalSpaceId, title: 'Личный план Веры' }, headers: { 'x-csrf-token': csrf } })).json();
  const pageId = created.page.id as string;
  const g = await a.p.request.put('/api/v1/grants', { data: { resourceType: 'page', resourceId: pageId, subjectType: 'user', subjectId: reader.id, level: 'comment' }, headers: { 'x-csrf-token': csrf } });
  expect(g.ok()).toBeTruthy();
  await a.ctx.close();

  await page.goto('/admin/access');
  await expect(page.getByRole('tab', { name: 'Проверить доступ' })).toHaveAttribute('aria-selected', 'true');
  await page.locator('#check-user').fill('Глеб');
  await page.getByRole('option', { name: /Глеб Читатель/ }).click();
  await page.getByLabel('Документ (ссылка, ID или название)').fill(`http://127.0.0.1/p/${pageId}`);
  const result = page.locator('.access-check-result');
  await expect(result.getByText('может открыть')).toBeVisible();
  await expect(result.getByText('Комментирование').first()).toBeVisible();
  await expect(result.getByText('«(скрыто)»')).toBeVisible(); // the admin does not learn the private title
  await expect(page.getByText('Личный план Веры')).toHaveCount(0);
  const actions = result.getByRole('table', { name: 'Действия' });
  await expect(actions.getByRole('row', { name: /Комментирование может/ })).toBeVisible();
  await expect(actions.getByRole('row', { name: /Редактирование не может/ })).toBeVisible();
  await expect(result.getByText(/Вера Автор|Глеб Читатель/).first()).toBeVisible();
  // The administrator still cannot open the page itself (no hidden access) and no session was created for the reader.
  expect((await page.request.get(`/api/v1/pages/${pageId}`)).status()).toBe(404);

  // Matrix: users × spaces with levels.
  await page.getByRole('tab', { name: 'Матрица доступа' }).click();
  await page.getByLabel('Фильтр по имени').fill('Глеб');
  const matrix = page.getByRole('table', { name: 'Матрица доступа' });
  await expect(matrix.getByRole('rowheader', { name: /Глеб Читатель/ })).toBeVisible();
  await expect(matrix.getByRole('columnheader', { name: /Общее/ })).toBeVisible();
  await expect(matrix.getByRole('cell', { name: /Просмотр · вся организация/ }).first()).toBeVisible();
  await expect(matrix.getByRole('columnheader', { name: /Моё пространство/ })).toHaveCount(0);
});

test('R-ACL-056: emergency access is requested with a reason, approved by a second administrator and appears in the audit log', async ({ page, browser }) => {
  await ensureOwner(page);
  const author = await createUser(page.request, 'Тимур Владелец заметок');
  const admin2 = await createUser(page.request, 'Ирина Второй админ');
  await api(page, 'PATCH', `/api/v1/admin/users/${admin2.id}`, { orgRole: 'admin' });
  const a = await as(browser, author, '/');
  const me = await (await a.p.request.get('/api/v1/auth/me')).json();
  const csrf = (await a.ctx.storageState()).cookies.find((c) => c.name === 'kb_csrf')!.value;
  const pageId = (await (await a.p.request.post('/api/v1/pages', { data: { spaceId: me.personalSpaceId, title: 'Заметки Тимура' }, headers: { 'x-csrf-token': csrf } })).json()).page.id;
  await a.ctx.close();

  await page.goto('/admin/access');
  await page.getByRole('tab', { name: 'Экстренный доступ' }).click();
  await page.getByLabel('Документ (ссылка или ID)').fill(pageId);
  await page.getByLabel('Основание (не менее 20 символов)').fill('Расследование утечки по заявке СБ №42');
  await page.getByLabel('Срок').selectOption('4');
  await page.getByRole('button', { name: 'Отправить запрос' }).click();
  const table = page.getByRole('table', { name: 'Запросы экстренного доступа' });
  await expect(table.getByText('Ожидает утверждения')).toBeVisible();
  await expect(table.getByText('ждёт другого администратора')).toBeVisible();

  const b = await as(browser, admin2, '/admin/access');
  await b.p.getByRole('tab', { name: 'Экстренный доступ' }).click();
  await b.p.getByRole('table', { name: 'Запросы экстренного доступа' }).getByRole('button', { name: 'Утвердить' }).click();
  await b.p.getByRole('dialog', { name: 'Утвердить экстренный доступ?' }).getByRole('button', { name: 'Утвердить' }).click();
  await expect(b.p.getByRole('table', { name: 'Запросы экстренного доступа' }).getByText('Утверждён')).toBeVisible();
  await b.ctx.close();

  // The requester can read (only read) the document now.
  await page.goto('/p/' + pageId);
  await expect(page.locator('.kb-editor')).toHaveAttribute('contenteditable', 'false');
  const log = await (await page.request.get(`/api/v1/audit?action=emergency_access.&targetId=${pageId}`)).json();
  expect(log.events.map((e: any) => e.action)).toEqual(expect.arrayContaining(['emergency_access.request', 'emergency_access.approve']));
});

test('ROUTE-06: the auditor reads who changed what in the journal but does not see titles or content of documents without access', async ({ page, browser }) => {
  await ensureOwner(page);
  const author = await createUser(page.request, 'Захар Секретный');
  const auditor = await createUser(page.request, 'Алла Аудитор');
  await api(page, 'PATCH', `/api/v1/admin/users/${auditor.id}`, { orgRole: 'auditor' });
  const a = await as(browser, author, '/');
  const me = await (await a.p.request.get('/api/v1/auth/me')).json();
  const csrf = (await a.ctx.storageState()).cookies.find((c) => c.name === 'kb_csrf')!.value;
  const pageId = (await (await a.p.request.post('/api/v1/pages', { data: { spaceId: me.personalSpaceId, title: 'Секретная смета Захара' }, headers: { 'x-csrf-token': csrf } })).json()).page.id;
  await a.p.request.delete(`/api/v1/pages/${pageId}`, { headers: { 'x-csrf-token': csrf } });
  await a.ctx.close();

  const au = await as(browser, auditor, '/admin');
  await expect(au.p.getByRole('link', { name: 'Журнал аудита' })).toBeVisible();
  await expect(au.p.getByRole('link', { name: 'Пользователи' })).toHaveCount(0); // read-only role
  await au.p.getByRole('link', { name: 'Журнал аудита' }).click();
  await au.p.getByLabel('ID объекта').fill(pageId);
  await au.p.getByRole('button', { name: 'Применить' }).click();
  const rows = au.p.locator('tbody tr', { hasText: pageId });
  await expect(rows.first()).toBeVisible();
  await expect(au.p.getByText('Захар Секретный').first()).toBeVisible(); // who
  await rows.first().getByRole('button', { name: 'Подробности' }).click();
  await expect(au.p.locator('.admin-pre').first()).toBeVisible();
  await expect(au.p.getByText('Секретная смета Захара')).toHaveCount(0);
  // Integrity of the log can be verified by the auditor.
  await au.p.getByRole('button', { name: /Проверить/ }).first().click();
  // No hidden access to the document itself.
  await au.p.goto('/p/' + pageId);
  await expect(au.p.getByText('Секретная смета Захара')).toHaveCount(0);
  expect((await au.p.request.get(`/api/v1/pages/${pageId}`)).status()).toBe(404);
  await au.ctx.close();
});
