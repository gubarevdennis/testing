import { test, expect, type Page } from '@playwright/test';
import { ensureOwner, newPage, createUser, login_, api } from './helpers';

test.describe.configure({ mode: 'serial' });

async function department(page: Page, name: string) {
  return (await api(page, 'POST', '/api/v1/admin/groups', { name, kind: 'department' })).group.id as string;
}

async function sidebar(page: Page) {
  const nav = page.getByRole('navigation', { name: 'Навигация' });
  if (!(await nav.isVisible())) await page.getByRole('button', { name: 'Показать боковую панель' }).click();
  return nav;
}

test('R-SPACE-001 R-SPACE-010 R-ADMIN-020: a space is created in the UI and a department gets access automatically; members are managed on the «Участники» tab', async ({ page, browser }) => {
  await ensureOwner(page);
  const dept = await department(page, 'Отдел логистики');
  const member = await createUser(page.request, 'Лена Логист');
  await api(page, 'PUT', `/api/v1/admin/groups/${dept}/members/${member.id}`, { role: 'member' });
  const outsider = await createUser(page.request, 'Олег Посторонний');

  await (await sidebar(page)).getByRole('button', { name: 'Новое пространство' }).click();
  const dlg = page.getByRole('dialog', { name: 'Новое пространство' });
  await dlg.getByLabel('Название').fill('Склад и логистика');
  await dlg.getByLabel('Тип').selectOption('department');
  await dlg.getByLabel('Видимость').selectOption('private');
  await dlg.getByPlaceholder('Добавить сотрудника, группу или отдел').fill('Отдел логистики');
  await dlg.getByRole('option', { name: /Отдел логистики/ }).click();
  await dlg.getByLabel('Уровень: Отдел логистики').selectOption('edit');
  await dlg.getByRole('button', { name: 'Создать пространство' }).click();
  await page.waitForURL(/\/s\/[0-9a-f-]{36}/);
  await expect(page.getByRole('heading', { name: 'Склад и логистика' })).toBeVisible();
  const spaceId = page.url().split('/s/')[1];

  await page.getByRole('tab', { name: 'Участники' }).click();
  const members = page.getByRole('list', { name: 'Участники пространства' });
  await expect(members.getByText('Отдел логистики')).toBeVisible();
  await expect(members.getByLabel('Уровень доступа: Отдел логистики')).toHaveValue('edit');

  // The department member sees the space and can create a page in it; an outsider does not see it.
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await p2.goto('/s/' + spaceId);
  await login_(p2, member.email, member.password);
  await expect(p2.getByRole('heading', { name: 'Склад и логистика' })).toBeVisible();
  await expect(p2.getByRole('button', { name: 'Новая страница' }).first()).toBeVisible();
  await ctx.close();
  const ctx3 = await browser.newContext();
  const p3 = await ctx3.newPage();
  await p3.goto('/s/' + spaceId);
  await login_(p3, outsider.email, outsider.password);
  await expect(p3.getByRole('heading', { name: 'Пространство недоступно' })).toBeVisible();
  await ctx3.close();

  // Add a person with a term and a reason, lower the department to view, then remove the person.
  await page.getByPlaceholder('Сотрудник, группа или отдел').fill('Олег');
  await page.getByRole('option', { name: /Олег Посторонний/ }).click();
  await page.getByLabel('Уровень доступа', { exact: true }).selectOption('comment');
  await page.getByRole('group', { name: 'Быстрый выбор срока' }).getByRole('button', { name: '30 дней' }).click();
  await page.getByLabel('Основание доступа').fill('Аудит склада');
  await page.getByRole('button', { name: 'Добавить в пространство' }).click();
  await expect(members.getByText('Олег Посторонний')).toBeVisible();
  await expect(members.getByText(/Аудит склада/)).toBeVisible();
  const acc = await (await page.request.get(`/api/v1/spaces/${spaceId}/access`)).json();
  const g = acc.grants.find((x: any) => x.subject_id === outsider.id);
  expect(g).toMatchObject({ level: 'comment', reason: 'Аудит склада' });
  expect(new Date(g.expires_at).getTime()).toBeGreaterThan(Date.now() + 28 * 86400_000);

  await members.getByLabel('Уровень доступа: Отдел логистики').selectOption('view');
  await expect.poll(async () => (await (await page.request.get(`/api/v1/spaces/${spaceId}/access`)).json()).grants.find((x: any) => x.subject_id === dept)?.level).toBe('view');
  await members.getByRole('button', { name: 'Убрать доступ: Олег Посторонний' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Убрать' }).click();
  await expect(members.getByText('Олег Посторонний')).toHaveCount(0);
});

test('R-ACL-021 R-ACL-036: share dialog — department preset, quick expiry, start date, reason, flags, then «Только я» with the list of who loses access', async ({ page }) => {
  await ensureOwner(page);
  const me = await (await page.request.get('/api/v1/auth/me')).json();
  const dept = await department(page, 'Отдел качества');
  await api(page, 'PUT', `/api/v1/admin/groups/${dept}/members/${me.user.id}`, { role: 'member' });
  const colleague = await createUser(page.request, 'Пётр Партнёр');
  const id = await newPage(page, 'Договор поставки');
  await page.getByRole('button', { name: 'Поделиться' }).click();
  const dlg = page.getByRole('dialog', { name: /Доступ: Договор поставки/ });

  // Preset: my department is added to the invite list.
  await dlg.getByRole('group', { name: 'Быстрые варианты доступа' }).getByRole('button', { name: 'Отдел: Отдел качества' }).click();
  await expect(dlg.locator('.share-chip', { hasText: 'Отдел качества' })).toBeVisible();
  await dlg.getByPlaceholder('Имя, e-mail или группа').fill('Пётр');
  await dlg.getByRole('option', { name: /Пётр Партнёр/ }).click();
  await dlg.locator('#share-level').selectOption('comment');
  await dlg.getByRole('group', { name: 'Быстрый выбор срока' }).getByRole('button', { name: '7 дней' }).click();
  await dlg.getByRole('button', { name: 'Ещё параметры' }).click();
  await dlg.getByLabel('Основание доступа').fill('Согласование договора');
  await dlg.getByLabel('Запретить скачивание вложений').check();
  await dlg.getByRole('button', { name: 'Выдать доступ' }).click();
  await expect(dlg.getByLabel('Уровень доступа: Пётр Партнёр')).toHaveValue('comment');

  const access = await (await page.request.get(`/api/v1/pages/${id}/access`)).json();
  const pg = access.pageGrants.find((g: any) => g.subject_id === colleague.id);
  expect(pg).toMatchObject({ level: 'comment', reason: 'Согласование договора', can_download: false, time_zone: 'Europe/Moscow' });
  expect(new Date(pg.expires_at).getTime()).toBeGreaterThan(Date.now() + 6 * 86400_000);
  expect(access.pageGrants.some((g: any) => g.subject_id === dept)).toBe(true);

  // «Только я»: the confirmation names who loses access; afterwards only the author has access.
  await dlg.getByRole('button', { name: 'Только я' }).click();
  const confirmDlg = page.getByRole('dialog', { name: 'Оставить доступ только вам?' });
  await expect(confirmDlg.getByText(/Пётр Партнёр/)).toBeVisible();
  await confirmDlg.getByRole('button', { name: 'Только я' }).click();
  await expect(page.getByText('Теперь страницу видите только вы')).toBeVisible();
  const after = await (await page.request.get(`/api/v1/pages/${id}/access`)).json();
  expect(after.inheritPermissions).toBe(false);
  expect(after.pageGrants.map((g: any) => g.subject_id)).toEqual([me.user.id]);
  const r = await page.request.get(`/api/v1/access/explain?userId=${colleague.id}&pageId=${id}`);
  expect((await r.json()).level).toBe('none');
});

test('R-ACL-051: a shared personal page shows «Не полностью личная» in the header and in the share dialog', async ({ page }) => {
  await ensureOwner(page);
  const colleague = await createUser(page.request, 'Инна Коллега');
  const id = await newPage(page, 'Мои черновые мысли');
  await page.getByRole('button', { name: 'Поделиться' }).click();
  const dlg = page.getByRole('dialog', { name: /Доступ: Мои черновые мысли/ });
  await expect(dlg.getByText('Личная страница: её видите только вы.')).toBeVisible();
  await dlg.getByRole('button', { name: 'Готово' }).click();
  await expect(page.getByRole('button', { name: 'Не полностью личная' })).toHaveCount(0);
  await api(page, 'PUT', '/api/v1/grants', { resourceType: 'page', resourceId: id, subjectType: 'user', subjectId: colleague.id, level: 'view' });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Не полностью личная' })).toBeVisible();
  await page.getByRole('button', { name: 'Не полностью личная' }).click();
  await expect(page.getByRole('dialog').getByText(/Не полностью личная: доступ есть у других \(1 чел\.\)/)).toBeVisible();
});

test('E2E-109 R-PUBLISH-009: public links are off by policy; once enabled a link opens without login, is not indexed and stops after revocation', async ({ page, browser }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Памятка для клиентов');
  await page.keyboard.type('Часы работы склада: 9–18.');
  await expect(page.locator('.sync-status')).toHaveText(/Сохранено$/, { timeout: 15_000 });
  await page.getByRole('button', { name: 'Поделиться' }).click();
  let dlg = page.getByRole('dialog', { name: /Доступ: Памятка для клиентов/ });
  await expect(dlg.getByText(/Публичные ссылки отключены администратором/)).toBeVisible();
  const denied = await page.request.post(`/api/v1/pages/${id}/share-links`, { data: { acknowledged: true }, headers: { 'x-csrf-token': (await page.context().storageState()).cookies.find((c) => c.name === 'kb_csrf')!.value } });
  expect(denied.status()).toBe(403);
  await dlg.getByRole('button', { name: 'Готово' }).click();

  await api(page, 'PATCH', '/api/v1/admin/settings', { publicLinksEnabled: true });
  try {
    await page.reload();
    await page.getByRole('button', { name: 'Поделиться' }).click();
    dlg = page.getByRole('dialog', { name: /Доступ: Памятка для клиентов/ });
    await dlg.getByRole('button', { name: 'Создать публичную ссылку' }).click();
    await expect(dlg.getByText(/скачанные или скопированные материалы отозвать нельзя/)).toBeVisible();
    const create = dlg.getByRole('button', { name: 'Создать ссылку' });
    await expect(create).toBeDisabled();
    await dlg.getByLabel('Понимаю, что скачанное по ссылке нельзя отозвать').check();
    await create.click();
    const code = dlg.locator('code', { hasText: '/pub/' });
    await expect(code).toBeVisible();
    const url = (await code.textContent())!;

    const anon = await browser.newContext();
    const ap = await anon.newPage();
    const resp = await ap.goto(url);
    expect(resp!.headers()['x-robots-tag']).toMatch(/noindex/);
    await expect(ap.getByRole('heading', { name: 'Памятка для клиентов' })).toBeVisible();
    await expect(ap.getByText('Часы работы склада: 9–18.')).toBeVisible();

    await dlg.getByRole('button', { name: 'Отозвать публичную ссылку' }).click();
    await page.getByRole('dialog', { name: 'Отозвать публичную ссылку?' }).getByRole('button', { name: 'Отозвать' }).click();
    await expect(page.getByText('Публичная ссылка отозвана')).toBeVisible();
    await ap.goto(url);
    await expect(ap.getByRole('heading', { name: 'Ссылка недействительна' })).toBeVisible();
    await anon.close();
  } finally {
    await api(page, 'PATCH', '/api/v1/admin/settings', { publicLinksEnabled: false });
  }
});
