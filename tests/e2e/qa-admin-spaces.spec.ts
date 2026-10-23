import { test, expect, type Page } from '@playwright/test';
import { ensureOwner, createUser, OWNER } from './helpers';
import { call, count, failWith, humanDoubleClick, pageErrors, signedIn, slow, toasts, uniq } from './qa-admin-helpers';

/**
 * Action × condition tests of space settings and members (SpacePage.tsx, components/space/SpaceAccess.tsx), the trash
 * (TrashPage.tsx), templates (TemplatesPage.tsx), the home screen (Home.tsx), document import (ImportPage.tsx) and
 * personal settings (SettingsPage.tsx) — the critical actions docs/qa/ACTION_MATRIX.md listed as uncovered (QA26-01,
 * QA26-03, R-QA-004, R-QA-029, R-UI-061). Results are checked through the API.
 */

interface SpaceDetail {
  id: string;
  name: string;
  visibility: string;
  archived_at: string | null;
}
const spaceOf = async (page: Page, id: string) => (await call<{ space: SpaceDetail }>(page, 'GET', `/api/v1/spaces/${id}`)).space;
async function newSpace(page: Page, name: string, visibility = 'private') {
  return (await call<{ space: { id: string } }>(page, 'POST', '/api/v1/spaces', { name, kind: 'project', visibility })).space.id;
}
async function openSpaceTab(page: Page, id: string, tab: 'Страницы' | 'Участники' | 'Настройки') {
  await page.goto(`/s/${id}`);
  await page.getByRole('tab', { name: tab }).click();
}

test('QA spaces setup', async ({ page }) => {
  await ensureOwner(page);
});

test('R-SPACE-004 settings: «Сбросить» restores the form; empty name is refused; widening visibility asks «Расширить доступ?» (cancel keeps it private, confirm opens it); server error keeps the input', async ({ page }) => {
  const errors = pageErrors(page);
  await ensureOwner(page);
  const tag = uniq();
  const name = `Закупки ${tag}`;
  const id = await newSpace(page, name);
  await openSpaceTab(page, id, 'Настройки');
  const save = page.getByRole('button', { name: 'Сохранить' });
  const reset = page.getByRole('button', { name: 'Сбросить' });
  await expect(save).toBeDisabled();
  await expect(reset).toBeDisabled();
  await page.getByLabel('Название').fill(`Переименовано ${tag}`);
  await reset.click();
  await expect(page.getByLabel('Название')).toHaveValue(name);
  await expect(save).toBeDisabled();
  // empty name
  await page.getByLabel('Название').fill('   ');
  await save.click();
  await expect(page.getByRole('alert')).toContainText('Название не может быть пустым');
  await reset.click();
  // widen
  await page.getByLabel('Видимость').selectOption('open');
  await save.click();
  const widen = page.getByRole('dialog', { name: 'Расширить доступ?' });
  await expect(widen).toContainText(`Пространство «${name}»`);
  await widen.getByRole('button', { name: 'Отмена' }).click();
  expect((await spaceOf(page, id)).visibility).toBe('private');
  await expect(page.getByLabel('Видимость')).toHaveValue('open'); // the choice stays for another try
  await failWith(page, `**/api/v1/spaces/${id}`, 'PATCH');
  await save.click();
  await expect(page.getByRole('alert')).toContainText('Внутренняя ошибка сервера');
  await page.unroute(`**/api/v1/spaces/${id}`);
  await save.click();
  await widen.getByRole('button', { name: 'Открыть пространство' }).click();
  await expect(toasts(page)).toContainText('Настройки сохранены');
  expect((await spaceOf(page, id)).visibility).toBe('open');
  expect(errors).toEqual([]);
});

test('R-SPACE-009 «Архивировать пространство?»: cancel keeps it active; confirm archives it (read-only, no «Новая страница»); «Вернуть из архива»; server error is reported', async ({ page }) => {
  const errors = pageErrors(page);
  await ensureOwner(page);
  const id = await newSpace(page, `Архивное ${uniq()}`);
  await openSpaceTab(page, id, 'Настройки');
  await page.getByRole('button', { name: 'Архивировать' }).click();
  const ask = page.getByRole('dialog', { name: 'Архивировать пространство?' });
  await ask.getByRole('button', { name: 'Отмена' }).click();
  expect((await spaceOf(page, id)).archived_at).toBeNull();
  await failWith(page, `**/api/v1/spaces/${id}`, 'PATCH');
  await page.getByRole('button', { name: 'Архивировать' }).click();
  await ask.getByRole('button', { name: 'Архивировать' }).click();
  await expect(toasts(page)).toContainText('Внутренняя ошибка сервера');
  expect((await spaceOf(page, id)).archived_at).toBeNull();
  await page.unroute(`**/api/v1/spaces/${id}`);
  await page.getByRole('button', { name: 'Архивировать' }).click();
  await ask.getByRole('button', { name: 'Архивировать' }).click();
  await expect(toasts(page)).toContainText('Пространство архивировано');
  expect((await spaceOf(page, id)).archived_at).not.toBeNull();
  await expect(page.getByRole('button', { name: 'Новая страница', exact: true }).and(page.locator('.space-actions button'))).toHaveCount(0);
  await page.getByRole('button', { name: 'Вернуть из архива' }).click();
  await expect(toasts(page)).toContainText('Пространство возвращено из архива');
  expect((await spaceOf(page, id)).archived_at).toBeNull();
  expect(errors).toEqual([]);
});

test('R-ADMIN-020 space members: «Доступ до» is saved with the new member; own level: «Понизить собственный доступ?» cancel keeps full access', async ({ page }) => {
  const errors = pageErrors(page);
  await ensureOwner(page);
  const tag = uniq();
  const id = await newSpace(page, `Команда ${tag}`);
  const member = await createUser(page.request, `Маша Участник ${tag}`);
  await openSpaceTab(page, id, 'Участники');
  const add = page.getByRole('button', { name: 'Добавить в пространство' });
  await expect(add).toBeDisabled();
  await page.getByPlaceholder('Сотрудник, группа или отдел').fill(tag);
  await page.getByRole('option', { name: new RegExp(member.name) }).click();
  const d = new Date(Date.now() + 20 * 86400_000);
  await page.getByLabel('Доступ до').fill(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  await add.click();
  await expect(toasts(page)).toContainText('Участники добавлены');
  const grants = async () => (await call<{ grants: Array<{ subject_id: string; level: string; expires_at: string | null }> }>(page, 'GET', `/api/v1/spaces/${id}/access`)).grants;
  const g = (await grants()).find((x) => x.subject_id === member.id)!;
  expect(g.level).toBe('view');
  expect(new Date(g.expires_at!).getTime()).toBeGreaterThan(Date.now() + 19 * 86400_000);
  const mine = page.getByLabel(`Уровень доступа: ${OWNER.name}`);
  await expect(mine).toHaveValue('full');
  await mine.selectOption('edit');
  const ask = page.getByRole('dialog', { name: 'Понизить собственный доступ?' });
  await ask.getByRole('button', { name: 'Отмена' }).click();
  await expect(mine).toHaveValue('full');
  const me = (await call<{ user: { id: string } }>(page, 'GET', '/api/v1/auth/me')).user.id;
  expect((await grants()).find((x) => x.subject_id === me)?.level).toBe('full');
  expect(errors).toEqual([]);
});

test('R-SPACE-001 «Импорт» from a space (header and the empty pages tab) opens the import for that space', async ({ page }) => {
  await ensureOwner(page);
  const id = await newSpace(page, `Пустое ${uniq()}`);
  await page.goto(`/s/${id}`);
  await expect(page.getByRole('heading', { name: 'В пространстве пока нет страниц' })).toBeVisible();
  await page.locator('.empty-state').getByRole('link', { name: 'Импорт' }).click();
  await expect(page).toHaveURL(new RegExp(`/import\\?spaceId=${id}`));
  await page.goto(`/s/${id}`);
  await page.locator('.space-actions').getByRole('link', { name: 'Импорт' }).click();
  await expect(page).toHaveURL(new RegExp(`/import\\?spaceId=${id}`));
  await expect(page.getByRole('heading', { name: /Импорт/ }).first()).toBeVisible();
});

test('R-TRASH-006 «Удалить навсегда пространство «…»»: typed name required; cancel keeps it in the trash; server error keeps it; confirm purges it; a space manager without admin role cannot purge', async ({ page, browser }) => {
  const errors = pageErrors(page);
  await ensureOwner(page);
  const tag = uniq();
  const name = `Ненужное ${tag}`;
  const id = await newSpace(page, name);
  const mgr = await createUser(page.request, `Мира Менеджер ${tag}`);
  await call(page, 'PUT', '/api/v1/grants', { resourceType: 'space', resourceId: id, subjectType: 'user', subjectId: mgr.id, level: 'full' });
  await call(page, 'DELETE', `/api/v1/spaces/${id}`, { confirmName: name });
  const inTrash = async () => (await call<{ spaces: Array<{ id: string }> }>(page, 'GET', '/api/v1/trash/spaces')).spaces.some((s) => s.id === id);
  expect(await inTrash()).toBe(true);
  // the manager sees the space in the trash but no permanent deletion
  const m = await signedIn(browser, mgr, '/trash');
  await m.p.goto('/trash');
  await expect(m.p.getByRole('region', { name: 'Удалённые пространства' }).getByText(name)).toBeVisible();
  await expect(m.p.getByRole('button', { name: `Удалить навсегда пространство «${name}»` })).toHaveCount(0);
  await m.ctx.close();
  await page.goto('/trash');
  const purge = page.getByRole('button', { name: `Удалить навсегда пространство «${name}»` });
  await purge.click();
  const ask = page.getByRole('dialog', { name: 'Удалить пространство навсегда?' });
  const confirmBtn = ask.getByRole('button', { name: 'Удалить навсегда' });
  await expect(confirmBtn).toBeDisabled();
  await ask.getByRole('button', { name: 'Отмена' }).click();
  expect(await inTrash()).toBe(true);
  await failWith(page, `**/api/v1/trash/spaces/${id}`, 'DELETE');
  await purge.click();
  await ask.getByLabel(/Для подтверждения введите/).fill(name);
  await confirmBtn.click();
  await expect(toasts(page)).toContainText('Внутренняя ошибка сервера');
  expect(await inTrash()).toBe(true);
  await page.unroute(`**/api/v1/trash/spaces/${id}`);
  await purge.click();
  await ask.getByLabel(/Для подтверждения введите/).fill(name);
  await confirmBtn.click();
  await expect(toasts(page)).toContainText('Пространство удалено навсегда');
  expect(await inTrash()).toBe(false);
  expect((await page.request.get(`/api/v1/spaces/${id}`)).status()).toBe(404);
  await expect(purge).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('R-TEMPLATE-003 template preview → «Создать страницу из шаблона» creates a page from it in the chosen space; «Где доступен» limits a new template to one space', async ({ page }) => {
  const errors = pageErrors(page);
  await ensureOwner(page);
  const tag = uniq();
  const sp = await newSpace(page, `Шаблоны ${tag}`);
  await page.goto('/templates');
  await page.getByRole('button', { name: 'Новый шаблон' }).click();
  const nt = page.getByRole('dialog', { name: 'Новый шаблон' });
  const createTpl = nt.getByRole('button', { name: 'Создать шаблон' });
  await expect(createTpl).toBeDisabled(); // no name
  await nt.getByLabel('Название шаблона').fill(`Протокол ${tag}`);
  await nt.getByLabel('Описание').fill('Протокол совещания');
  await nt.getByLabel('Где доступен').selectOption({ label: `Пространство «Шаблоны ${tag}»` });
  await createTpl.click();
  await expect(toasts(page)).toContainText('Шаблон создан');
  const tpl = (await call<{ templates: Array<{ id: string; name: string; space_id: string | null }> }>(page, 'GET', `/api/v1/templates?spaceId=${sp}`)).templates.find((t) => t.name === `Протокол ${tag}`)!;
  expect(tpl.space_id).toBe(sp);
  // preview → create
  await page.goto(`/templates?spaceId=${sp}`);
  await page.getByRole('button', { name: `Протокол ${tag}`, exact: true }).click();
  const preview = page.getByRole('dialog', { name: new RegExp(`Протокол ${tag}`) });
  await expect(preview).toContainText('Протокол совещания');
  await preview.getByRole('button', { name: 'Создать страницу из шаблона' }).click();
  const create = page.getByRole('dialog', { name: `Создать страницу: Протокол ${tag}` });
  await create.getByLabel('Название страницы').fill(`Совещание ${tag}`);
  const sent = await count(page, '**/api/v1/pages', 'POST');
  await create.getByRole('button', { name: 'Создать' }).click();
  await page.waitForURL(/\/p\/[0-9a-f-]{36}/);
  expect(sent.n).toBe(1);
  const pid = page.url().split('/p/')[1].split(/[?#]/)[0];
  const created = (await call<{ page: { title: string; space: { id: string } } }>(page, 'GET', `/api/v1/pages/${pid}`)).page;
  expect(created.title).toBe(`Совещание ${tag}`);
  expect(created.space.id).toBe(sp);
  expect(errors).toEqual([]);
});

test('R-HOME-002 «Новая страница В личном пространстве»: server error is reported; slow network + double click creates one page in the personal space; «Импорт DOCX, Markdown, CSV, XLSX» opens the import', async ({ page }) => {
  const errors = pageErrors(page);
  await ensureOwner(page);
  await page.goto('/');
  const btn = page.getByRole('button', { name: 'Новая страница В личном пространстве' });
  await failWith(page, '**/api/v1/pages', 'POST');
  await btn.click();
  await expect(toasts(page)).toContainText('Внутренняя ошибка сервера');
  await expect(page).toHaveURL(/\/$/);
  await page.unroute('**/api/v1/pages');
  const sent = await slow(page, '**/api/v1/pages', 'POST', 700);
  await humanDoubleClick(page, btn);
  await page.waitForURL(/\/p\/[0-9a-f-]{36}/);
  expect(sent.n).toBe(1);
  const pid = page.url().split('/p/')[1].split(/[?#]/)[0];
  const me = await call<{ personalSpaceId: string }>(page, 'GET', '/api/v1/auth/me');
  expect((await call<{ page: { space: { id: string } } }>(page, 'GET', `/api/v1/pages/${pid}`)).page.space.id).toBe(me.personalSpaceId);
  await call(page, 'DELETE', `/api/v1/pages/${pid}`);
  await page.unroute('**/api/v1/pages');
  await page.goto('/');
  await page.getByRole('link', { name: 'Импорт DOCX, Markdown, CSV, XLSX' }).click();
  await expect(page).toHaveURL(/\/import$/);
  expect(errors).toEqual([]);
});

test('R-HOME-004 empty home of a new employee: «Создать первую страницу» creates a page; «Импортировать документы» opens the import', async ({ page, browser }) => {
  await ensureOwner(page);
  const u = await createUser(page.request, `Новичок ${uniq()}`);
  const n = await signedIn(browser, u);
  // nothing but the personal space (organisation spaces of other tests hidden): the first-run state
  await n.p.route('**/api/v1/spaces', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const r = await route.fetch();
    const body = await r.json();
    await route.fulfill({ response: r, json: { ...body, spaces: body.spaces.filter((s: { isPersonal: boolean }) => s.isPersonal) } });
  });
  await n.p.goto('/');
  await expect(n.p.getByRole('heading', { name: 'Добро пожаловать в базу знаний' })).toBeVisible();
  await n.p.getByRole('link', { name: 'Импортировать документы' }).click();
  await expect(n.p).toHaveURL(/\/import$/);
  await n.p.goto('/');
  await n.p.locator('.home-welcome').getByRole('button', { name: 'Создать первую страницу' }).click();
  await n.p.waitForURL(/\/p\/[0-9a-f-]{36}/);
  const pid = n.p.url().split('/p/')[1].split(/[?#]/)[0];
  const me = await call<{ personalSpaceId: string }>(n.p, 'GET', '/api/v1/auth/me');
  expect((await call<{ page: { space: { id: string } } }>(n.p, 'GET', `/api/v1/pages/${pid}`)).page.space.id).toBe(me.personalSpaceId);
  await n.ctx.close();
});

async function uploadMarkdown(page: Page, name: string, text: string) {
  await page.goto('/import');
  await page.locator('input[type=file]').setInputFiles({ name, mimeType: 'text/markdown', buffer: Buffer.from(text, 'utf8') });
  const upload = page.waitForResponse((r) => r.url().endsWith('/api/v1/imports') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Загрузить и проверить' }).click();
  const jobId = (await (await upload).json()).jobId as string;
  await expect(page.getByRole('button', { name: 'Импортировать' })).toBeVisible({ timeout: 30_000 });
  return jobId;
}

test('R-IMPORT-010 «Отменить импорт» before confirming creates nothing and returns to the file choice', async ({ page }) => {
  const errors = pageErrors(page);
  await ensureOwner(page);
  const tag = uniq();
  const jobId = await uploadMarkdown(page, `отмена-${tag}.md`, `# Отменённый ${tag}\n\nТекст.`);
  await page.getByRole('button', { name: 'Отменить импорт' }).click();
  await expect(toasts(page)).toContainText('Импорт отменён — ничего не создано');
  await expect(page.getByRole('button', { name: 'Загрузить и проверить' })).toBeVisible();
  expect((await call<{ status: string }>(page, 'GET', `/api/v1/imports/${jobId}`)).status).toBe('cancelled');
  const found = await call<{ results?: unknown[]; hits?: unknown[] }>(page, 'GET', `/api/v1/search?q=${encodeURIComponent(`Отменённый ${tag}`)}`);
  expect((found.results ?? found.hits ?? []).length).toBe(0);
  expect(errors).toEqual([]);
});

test('R-IMPORT-011 commit error: the reason is shown, the button becomes «Повторить импорт» and the retry imports once; «Импортировать ещё» starts over', async ({ page }) => {
  const errors = pageErrors(page);
  await ensureOwner(page);
  const tag = uniq();
  const jobId = await uploadMarkdown(page, `повтор-${tag}.md`, `# Повторный ${tag}\n\nТекст.`);
  await failWith(page, `**/api/v1/imports/${jobId}/commit`, 'POST');
  await page.getByRole('button', { name: 'Импортировать' }).click();
  await expect(page.getByRole('alert')).toContainText('Внутренняя ошибка сервера');
  await expect(page.getByRole('alert')).toContainText('Выбранные параметры сохранены — можно повторить.');
  await page.unroute(`**/api/v1/imports/${jobId}/commit`);
  const sent = await slow(page, `**/api/v1/imports/${jobId}/commit`, 'POST', 600);
  await humanDoubleClick(page, page.getByRole('button', { name: 'Повторить импорт' }));
  await expect(page.getByRole('status').filter({ hasText: 'Импорт завершён' })).toBeVisible();
  expect(sent.n).toBe(1);
  const job = await call<{ status: string; result: { pages: Array<{ id: string }> } }>(page, 'GET', `/api/v1/imports/${jobId}`);
  expect(job.status).toBe('succeeded');
  expect(job.result.pages).toHaveLength(1);
  await page.getByRole('button', { name: 'Импортировать ещё' }).click();
  await expect(page.getByText('Файлы не выбраны')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Загрузить и проверить' })).toBeDisabled();
  for (const p of job.result.pages) await call(page, 'DELETE', `/api/v1/pages/${p.id}`);
  expect(errors).toEqual([]);
});

test('R-AUTH-012 sessions: «Завершить сеанс?» cancel keeps the other device signed in; server error keeps it; confirm signs it out; QA-A8 (fixed): settings links «Пароль и вход», «API-токены» open their tabs from another tab', async ({ page, browser }) => {
  await ensureOwner(page);
  const u = await createUser(page.request, `Сева Сеанс ${uniq()}`);
  const a = await signedIn(browser, u);
  const b = await signedIn(browser, u);
  const bAlive = async () => (await b.p.request.get('/api/v1/auth/me')).status() === 200;
  await a.p.goto('/settings/sessions');
  const end = a.p.locator('.settings-sessions li', { hasNotText: 'этот сеанс' }).getByRole('button', { name: 'Завершить' });
  await expect(end).toHaveCount(1);
  await end.click();
  const ask = a.p.getByRole('dialog', { name: 'Завершить сеанс?' });
  await ask.getByRole('button', { name: 'Отмена' }).click();
  expect(await bAlive()).toBe(true);
  await failWith(a.p, /\/api\/v1\/auth\/sessions\/[0-9a-f-]{36}$/, 'DELETE');
  await end.click();
  await ask.getByRole('button', { name: 'Завершить' }).click();
  await expect(toasts(a.p)).toContainText('Внутренняя ошибка сервера');
  expect(await bAlive()).toBe(true);
  await a.p.unroute(/\/api\/v1\/auth\/sessions\/[0-9a-f-]{36}$/);
  await end.click();
  await ask.getByRole('button', { name: 'Завершить' }).click();
  await expect(toasts(a.p)).toContainText('Сеанс завершён');
  expect(await bAlive()).toBe(false);
  await expect(end).toHaveCount(0);
  await a.p.getByRole('link', { name: 'Пароль и вход' }).click();
  await expect(a.p).toHaveURL(/\/settings\/security$/);
  await expect(a.p.getByRole('button', { name: 'Изменить пароль' })).toBeVisible();
  await a.p.getByRole('link', { name: 'API-токены' }).click();
  await expect(a.p).toHaveURL(/\/settings\/tokens$/);
  await expect(a.p.getByLabel('Назначение')).toBeVisible();
  await a.p.getByRole('link', { name: 'Активные сеансы' }).click();
  await expect(a.p).toHaveURL(/\/settings\/sessions$/);
  // an unknown tab falls back to the profile once (no redirect loop)
  await a.p.goto('/settings/nonexistent');
  await expect(a.p).toHaveURL(/\/settings\/profile$/);
  await a.ctx.close();
  await b.ctx.close();
});
