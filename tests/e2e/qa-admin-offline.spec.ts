import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { ensureOwner, createUser, OWNER } from './helpers';
import { call, signedIn, toasts, uniq } from './qa-admin-helpers';

/**
 * R-QA-029, R-UI-061 «потеря сети» for the critical administration, access and page-panel actions: without a network
 * every action explains «Нет связи с сервером», changes nothing on the server and works once the network is back.
 * One focused test per action group so the matrix credits the offline state to the actions each test drives.
 */

const OFFLINE = 'Нет связи с сервером';

/** Runs `act` offline (expects the offline explanation and no server change), then online (expects success). */
async function offlineThenOnline(page: Page, context: BrowserContext, act: () => Promise<void>, unchanged: () => Promise<void>, done: () => Promise<void>) {
  await context.setOffline(true);
  await act();
  await expect(toasts(page).or(page.getByRole('alert')).filter({ hasText: OFFLINE }).first()).toBeVisible();
  await context.setOffline(false);
  await unchanged();
  await act();
  await done();
}

async function personalPage(page: Page, title: string) {
  const sp = (await call<{ spaces: Array<{ id: string; isPersonal: boolean }> }>(page, 'GET', '/api/v1/spaces')).spaces.find((s) => s.isPersonal)!.id;
  return (await call<{ page: { id: string } }>(page, 'POST', '/api/v1/pages', { spaceId: sp, title })).page.id;
}

test('QA offline setup', async ({ page }) => {
  await ensureOwner(page);
});

test('R-QA-029 offline: «Отозвать доступ {…}» of an expiring grant and «Удалить» of a group explain the lost network and change nothing until it is back', async ({ page, context }) => {
  await ensureOwner(page);
  const tag = uniq();
  const u = await createUser(page.request, `Ольга Офлайн ${tag}`);
  const pid = await personalPage(page, `Офлайн-доступ ${tag}`);
  await call(page, 'PUT', '/api/v1/grants', { resourceType: 'page', resourceId: pid, subjectType: 'user', subjectId: u.id, level: 'view', expiresAt: new Date(Date.now() + 2 * 86400_000).toISOString() });
  const grant = async () => (await call<{ grants: Array<{ id: string; resource_id: string }> }>(page, 'GET', '/api/v1/admin/grants/expiring')).grants.some((g) => g.resource_id === pid);
  await page.goto('/admin/expiring');
  await page.locator('.admin-page').getByLabel('Поиск', { exact: true }).fill(tag);
  await offlineThenOnline(
    page,
    context,
    async () => {
      await page.getByRole('button', { name: `Отозвать доступ ${u.name}` }).click();
      await page.getByRole('dialog', { name: 'Отозвать доступ сейчас?' }).getByRole('button', { name: 'Отозвать' }).click();
    },
    async () => expect(await grant()).toBe(true),
    async () => {
      await expect(toasts(page)).toContainText('Доступ отозван');
      await expect.poll(grant).toBe(false);
    },
  );
  // group deletion
  const name = `Офлайн-группа ${tag}`;
  const g = (await call<{ group: { id: string } }>(page, 'POST', '/api/v1/admin/groups', { name, kind: 'group' })).group.id;
  const exists = async () => (await call<{ groups: Array<{ id: string }> }>(page, 'GET', '/api/v1/admin/groups')).groups.some((x) => x.id === g);
  await page.goto('/admin/groups');
  await page.getByLabel('Поиск групп').fill(name);
  await page.getByRole('button', { name: new RegExp(name) }).first().click();
  await offlineThenOnline(
    page,
    context,
    async () => {
      await page.getByRole('button', { name: 'Удалить', exact: true }).click();
      await page.getByRole('dialog', { name: `Удалить «${name}»?` }).getByRole('button', { name: 'Удалить' }).click();
    },
    async () => expect(await exists()).toBe(true),
    async () => {
      await expect(toasts(page)).toContainText('Удалено');
      await expect.poll(exists).toBe(false);
    },
  );
  await call(page, 'DELETE', `/api/v1/pages/${pid}`);
});

test('R-QA-029 offline: emergency access «Отклонить» and the admin public link «Отозвать» explain the lost network and keep the state', async ({ page, context, browser }) => {
  await ensureOwner(page);
  const tag = uniq();
  const admin2 = await createUser(page.request, `Олег Админ ${tag}`);
  await call(page, 'PATCH', `/api/v1/admin/users/${admin2.id}`, { orgRole: 'admin' });
  const pid = await personalPage(page, `Экстренно ${tag}`);
  const b = await signedIn(browser, admin2);
  await call(b.p, 'POST', '/api/v1/admin/emergency-access', { pageId: pid, reason: `Офлайн-проверка инцидента ${tag} для отчёта`, durationHours: 1 });
  await b.ctx.close();
  const status = async () => (await call<{ requests: Array<{ page_id: string; status: string }> }>(page, 'GET', '/api/v1/admin/emergency-access')).requests.find((r) => r.page_id === pid)!.status;
  await page.goto('/admin/access');
  await page.getByRole('tab', { name: 'Экстренный доступ' }).click();
  const row = page.getByRole('row', { name: new RegExp(tag) });
  await offlineThenOnline(
    page,
    context,
    async () => {
      await row.getByRole('button', { name: 'Отклонить' }).click();
      await page.getByRole('dialog', { name: 'Отклонить запрос?' }).getByRole('button', { name: 'Отклонить' }).click();
    },
    async () => expect(await status()).toBe('pending'),
    async () => expect.poll(status).toBe('rejected'),
  );
  // public link
  await call(page, 'PATCH', '/api/v1/admin/settings', { publicLinksEnabled: true });
  for (const l of (await call<{ links: Array<{ id: string }> }>(page, 'GET', '/api/v1/admin/share-links')).links) await call(page, 'DELETE', `/api/v1/share-links/${l.id}`);
  const link = await call<{ path: string }>(page, 'POST', `/api/v1/pages/${pid}/share-links`, { acknowledged: true });
  await page.getByRole('tab', { name: 'Публичные ссылки' }).click();
  await offlineThenOnline(
    page,
    context,
    async () => {
      await page.getByRole('table', { name: 'Публичные ссылки' }).getByRole('button', { name: 'Отозвать' }).click();
      await page.getByRole('dialog', { name: 'Отозвать публичную ссылку?' }).getByRole('button', { name: 'Отозвать' }).click();
    },
    async () => expect((await page.request.get(link.path)).status()).toBe(200),
    async () => {
      await expect(toasts(page)).toContainText('Ссылка отозвана');
      expect((await page.request.get(link.path)).status()).not.toBe(200);
    },
  );
  await call(page, 'DELETE', `/api/v1/pages/${pid}`);
});

test('R-QA-029 offline: «Выдать доступ» and «Убрать доступ: …» in the share dialog keep the pick / the grant without a network', async ({ page, context }) => {
  await ensureOwner(page);
  const tag = uniq();
  const u = await createUser(page.request, `Пётр Офлайн ${tag}`);
  const title = `Офлайн-доступ ${tag}`;
  const pid = await personalPage(page, title);
  const has = async () => (await call<{ pageGrants: Array<{ subject_id: string }> }>(page, 'GET', `/api/v1/pages/${pid}/access`)).pageGrants.some((g) => g.subject_id === u.id);
  await page.goto(`/p/${pid}`);
  await page.getByRole('button', { name: 'Поделиться' }).click();
  const dlg = page.getByRole('dialog', { name: `Доступ: ${title}` });
  await dlg.getByPlaceholder('Имя, e-mail или группа').fill(tag);
  await dlg.getByRole('option', { name: new RegExp(u.name) }).click();
  await offlineThenOnline(
    page,
    context,
    async () => dlg.getByRole('button', { name: 'Выдать доступ' }).click(),
    async () => {
      expect(await has()).toBe(false);
      await expect(dlg.locator('.share-chip', { hasText: u.name })).toBeVisible();
    },
    async () => {
      await expect(toasts(page)).toContainText('Доступ выдан');
      await expect.poll(has).toBe(true);
    },
  );
  await offlineThenOnline(
    page,
    context,
    async () => {
      await dlg.getByRole('button', { name: `Убрать доступ: ${u.name}` }).click();
      await page.getByRole('dialog', { name: `Убрать доступ: ${u.name}?` }).getByRole('button', { name: 'Убрать' }).click();
    },
    async () => expect(await has()).toBe(true),
    async () => expect.poll(has).toBe(false),
  );
  await call(page, 'DELETE', `/api/v1/pages/${pid}`);
});

test('R-QA-029 offline: «Установить юридическое удержание» and «Снять с публикации» explain the lost network and keep the page state', async ({ page, context }) => {
  await ensureOwner(page);
  const tag = uniq();
  const pid = await personalPage(page, `Удержание офлайн ${tag}`);
  const dto = async () => (await call<{ page: { legalHold?: boolean; status: string } }>(page, 'GET', `/api/v1/pages/${pid}`)).page;
  await page.goto(`/p/${pid}`);
  await page.getByRole('button', { name: 'Действия со страницей', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Сведения о странице' }).click();
  await page.getByRole('button', { name: 'Установить удержание' }).click();
  const dlg = page.getByRole('dialog', { name: 'Установить юридическое удержание' });
  await dlg.getByLabel('Основание').fill('Запрос регулятора');
  await offlineThenOnline(
    page,
    context,
    async () => dlg.getByRole('button', { name: 'Установить' }).click(),
    async () => expect((await dto()).legalHold).toBeFalsy(),
    async () => expect.poll(async () => (await dto()).legalHold).toBe(true),
  );
  // unpublish in a publish-mode space
  const sp = (await call<{ space: { id: string } }>(page, 'POST', '/api/v1/spaces', { name: `Офлайн-публикации ${tag}`, kind: 'project', visibility: 'private' })).space.id;
  await call(page, 'PATCH', `/api/v1/spaces/${sp}`, { policy: { publishingMode: 'publish', requireApproval: false } });
  const doc = (await call<{ page: { id: string } }>(page, 'POST', '/api/v1/pages', { spaceId: sp, title: `Опубликованный ${tag}` })).page.id;
  await call(page, 'POST', `/api/v1/pages/${doc}/publish`, {});
  const status = async () => (await call<{ page: { status: string } }>(page, 'GET', `/api/v1/pages/${doc}`)).page.status;
  await page.goto(`/p/${doc}`);
  const bar = page.getByRole('region', { name: 'Публикация' });
  await expect(bar.getByRole('button', { name: 'Снять с публикации' })).toBeVisible();
  await offlineThenOnline(
    page,
    context,
    async () => {
      await bar.getByRole('button', { name: 'Снять с публикации' }).click();
      await page.getByRole('dialog', { name: 'Снять с публикации?' }).getByRole('button', { name: 'Снять с публикации' }).click();
    },
    async () => expect(await status()).toBe('published'),
    async () => expect.poll(status).toBe('draft'),
  );
});

test('R-QA-029 offline: «Архивировать пространство?» and «Удалить навсегда пространство «…»» explain the lost network and keep the space', async ({ page, context }) => {
  await ensureOwner(page);
  const tag = uniq();
  const name = `Офлайн-пространство ${tag}`;
  const sp = (await call<{ space: { id: string } }>(page, 'POST', '/api/v1/spaces', { name, kind: 'project', visibility: 'private' })).space.id;
  const archived = async () => !!(await call<{ space: { archived_at: string | null } }>(page, 'GET', `/api/v1/spaces/${sp}`)).space.archived_at;
  await page.goto(`/s/${sp}`);
  await page.getByRole('tab', { name: 'Настройки' }).click();
  await offlineThenOnline(
    page,
    context,
    async () => {
      await page.getByRole('button', { name: 'Архивировать' }).click();
      await page.getByRole('dialog', { name: 'Архивировать пространство?' }).getByRole('button', { name: 'Архивировать' }).click();
    },
    async () => expect(await archived()).toBe(false),
    async () => expect.poll(archived).toBe(true),
  );
  await call(page, 'PATCH', `/api/v1/spaces/${sp}`, { archived: false });
  await call(page, 'DELETE', `/api/v1/spaces/${sp}`, { confirmName: name });
  const inTrash = async () => (await call<{ spaces: Array<{ id: string }> }>(page, 'GET', '/api/v1/trash/spaces')).spaces.some((s) => s.id === sp);
  await page.goto('/trash');
  await expect(page.getByRole('button', { name: `Удалить навсегда пространство «${name}»` })).toBeVisible();
  await offlineThenOnline(
    page,
    context,
    async () => {
      await page.getByRole('button', { name: `Удалить навсегда пространство «${name}»` }).click();
      const ask = page.getByRole('dialog', { name: 'Удалить пространство навсегда?' });
      await ask.getByLabel(/Для подтверждения введите/).fill(name);
      await ask.getByRole('button', { name: 'Удалить навсегда' }).click();
    },
    async () => expect(await inTrash()).toBe(true),
    async () => expect.poll(inTrash).toBe(false),
  );
});

test('R-QA-029 offline: «Отправить приглашение повторно» and «Завершить сеанс?» explain the lost network; nothing changes until it is back', async ({ page, context, browser }) => {
  await ensureOwner(page);
  const tag = uniq();
  const email = `off-inv-${tag}@corp.test`;
  const created = await call<{ user: { id: string } }>(page, 'POST', '/api/v1/admin/users', { email, name: `Инна Офлайн ${tag}`, kind: 'employee', invite: true });
  const resends = async () => (await call<{ events: unknown[] }>(page, 'GET', `/api/v1/audit?action=user.invite_resend&targetId=${created.user.id}`)).events.length;
  await page.goto('/admin/users');
  await page.getByLabel('Поиск пользователей').fill(email);
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await offlineThenOnline(
    page,
    context,
    async () => {
      await page.getByRole('button', { name: `Действия с пользователем Инна Офлайн ${tag}` }).click();
      await page.getByRole('menuitem', { name: 'Отправить приглашение повторно' }).click();
    },
    async () => expect(await resends()).toBe(0),
    async () => {
      await expect(page.getByRole('dialog', { name: 'Новое приглашение' })).toBeVisible();
      expect(await resends()).toBe(1);
    },
  );
  // sessions of the owner's own account: a second device
  const other = await signedIn(browser, { email: OWNER.email, password: OWNER.password });
  await page.goto('/settings/sessions');
  const row = page.locator('.settings-sessions li', { hasNotText: 'этот сеанс' }).last();
  await expect(row.getByRole('button', { name: 'Завершить' })).toBeVisible();
  await offlineThenOnline(
    page,
    context,
    async () => {
      await row.getByRole('button', { name: 'Завершить' }).click();
      await page.getByRole('dialog', { name: 'Завершить сеанс?' }).getByRole('button', { name: 'Завершить' }).click();
    },
    async () => expect(await page.locator('.settings-sessions li').count()).toBeGreaterThan(1),
    async () => expect(toasts(page)).toContainText('Сеанс завершён'),
  );
  await other.ctx.close();
});

test('QA-A10 (fixed): a page never opened on this device, opened without a network, says «Нет связи с сервером» (not a blank «Не удалось открыть страницу») and opens by itself when the network is back', async ({ page, context }) => {
  await ensureOwner(page);
  const pid = await personalPage(page, `Без сети ${uniq()}`);
  await page.goto('/');
  await expect(page.locator('.app-shell')).toBeVisible();
  await context.setOffline(true);
  // client-side navigation inside the loaded app (a reload would not reach the server either)
  await page.evaluate((id) => {
    history.pushState({}, '', `/p/${id}`);
    dispatchEvent(new PopStateEvent('popstate'));
  }, pid);
  await expect(page.getByRole('heading', { name: 'Нет связи с сервером' })).toBeVisible();
  await expect(page.getByText('Страница ещё не сохранялась на этом устройстве. Проверьте подключение.')).toBeVisible();
  await context.setOffline(false);
  await expect(page.locator('.kb-editor')).toBeVisible({ timeout: 20_000 });
  await call(page, 'DELETE', `/api/v1/pages/${pid}`);
});
