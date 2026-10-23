import { test, expect, type Page } from '@playwright/test';
import { ensureOwner, createUser, OWNER } from './helpers';
import { call, count, failWith, humanDoubleClick, pageErrors, signedIn, slow, toasts, uniq } from './qa-admin-helpers';

/**
 * Action × condition tests of the page-level panels: sharing (ShareDialog, access request, public links), page info
 * (properties, legal hold) and publishing / approvals (PublishBar) — apps/web/src/components/page/*. The critical
 * actions docs/qa/ACTION_MATRIX.md listed as uncovered (QA26-01, QA26-03, R-QA-004, R-QA-029, R-UI-061, R-ACL-*).
 * Outcomes are checked through the API (grants, inheritance, page status, notifications), not only on screen.
 */

interface PageGrant {
  id: string;
  subject_type: string;
  subject_id: string | null;
  level: string;
  expires_at: string | null;
  starts_at: string | null;
}
const access = (page: Page, id: string) => call<{ inheritPermissions: boolean; pageGrants: PageGrant[] }>(page, 'GET', `/api/v1/pages/${id}/access`);
const pageDto = async (page: Page, id: string) => (await call<{ page: { status: string; legalHold?: boolean; properties: Record<string, unknown> } }>(page, 'GET', `/api/v1/pages/${id}`)).page;

async function spaces(page: Page) {
  return (await call<{ spaces: Array<{ id: string; name: string; isPersonal: boolean }> }>(page, 'GET', '/api/v1/spaces')).spaces;
}
async function personalPage(page: Page, title: string) {
  const personal = (await spaces(page)).find((s) => s.isPersonal)!.id;
  return (await call<{ page: { id: string } }>(page, 'POST', '/api/v1/pages', { spaceId: personal, title })).page.id;
}
async function openShare(page: Page, id: string, title: string) {
  await page.goto(`/p/${id}`);
  await page.getByRole('button', { name: 'Поделиться' }).click();
  const dlg = page.getByRole('dialog', { name: `Доступ: ${title}` });
  await expect(dlg.getByText(/Ваш доступ:/)).toBeVisible();
  return dlg;
}
async function pick(dlg: ReturnType<Page['getByRole']>, query: string, name: string | RegExp) {
  await dlg.getByPlaceholder('Имя, e-mail или группа').fill(query);
  await dlg.getByRole('option', { name }).click();
}
const isoDate = (days: number) => {
  const d = new Date(Date.now() + days * 86400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

test('QA page panels setup', async ({ page }) => {
  await ensureOwner(page);
});

test('R-ACL-021 «Выдать доступ» with «Уровень доступа», «Доступ до», «Доступ с»: nobody picked — disabled; server error keeps the pick; double click grants once; the grant has level, start and end on the server', async ({ page }) => {
  const errors = pageErrors(page);
  await ensureOwner(page);
  const tag = uniq();
  const colleague = await createUser(page.request, `Кира Коллега ${tag}`);
  const title = `Смета ${tag}`;
  const id = await personalPage(page, title);
  const dlg = await openShare(page, id, title);
  const grant = dlg.getByRole('button', { name: 'Выдать доступ' });
  await expect(grant).toBeDisabled(); // empty
  await pick(dlg, tag, new RegExp(colleague.name));
  await dlg.getByLabel('Уровень доступа', { exact: true }).selectOption('edit');
  await dlg.getByLabel('Доступ до').fill(isoDate(10));
  await dlg.getByRole('button', { name: 'Ещё параметры' }).click();
  await dlg.getByLabel('Доступ с').fill(isoDate(1));
  await failWith(page, '**/api/v1/grants', 'PUT');
  await grant.click();
  await expect(toasts(page)).toContainText(`${colleague.name}: Внутренняя ошибка сервера`);
  await expect(dlg.locator('.share-chip', { hasText: colleague.name })).toBeVisible(); // the pick is kept for a retry
  expect((await access(page, id)).pageGrants.some((g) => g.subject_id === colleague.id)).toBe(false);
  await page.unroute('**/api/v1/grants');
  const sent = await slow(page, '**/api/v1/grants', 'PUT', 700);
  await humanDoubleClick(page, grant);
  await expect(toasts(page)).toContainText('Доступ выдан');
  expect(sent.n).toBe(1);
  await expect(dlg.getByLabel(`Уровень доступа: ${colleague.name}`)).toHaveValue('edit');
  const g = (await access(page, id)).pageGrants.find((x) => x.subject_id === colleague.id)!;
  expect(g.level).toBe('edit');
  expect(new Date(g.expires_at!).getTime()).toBeGreaterThan(Date.now() + 9 * 86400_000);
  expect(new Date(g.starts_at!).getTime()).toBeGreaterThan(Date.now());
  expect(errors).toEqual([]);
});

test('R-ACL-022 «Общий доступ»: «Открыть доступ всей организации?» cancel keeps the page private, confirm opens it; back to «Только приглашённые»; QA-A9 (fixed): closing an inherited organisation access («Закрыть доступ для организации?») keeps the invited people and the owner', async ({ page }) => {
  const errors = pageErrors(page);
  await ensureOwner(page);
  const tag = uniq();
  const title = `Регламент ${tag}`;
  const id = await personalPage(page, title);
  const dlg = await openShare(page, id, title);
  const general = dlg.getByLabel('Общий доступ');
  await general.selectOption('view');
  const widen = page.getByRole('dialog', { name: 'Открыть доступ всей организации?' });
  await expect(widen).toContainText('все сотрудники организации');
  await widen.getByRole('button', { name: 'Отмена' }).click();
  expect((await access(page, id)).pageGrants.some((g) => g.subject_type === 'org')).toBe(false);
  await expect(general).toHaveValue('none');
  await general.selectOption('view');
  await widen.getByRole('button', { name: 'Открыть всем' }).click();
  await expect(toasts(page)).toContainText('Общий доступ изменён');
  expect((await access(page, id)).pageGrants.find((g) => g.subject_type === 'org')?.level).toBe('view');
  await general.selectOption('none');
  await expect(toasts(page)).toContainText('Доступ для всей организации закрыт');
  expect((await access(page, id)).pageGrants.some((g) => g.subject_type === 'org')).toBe(false);
  await dlg.getByRole('button', { name: 'Готово' }).click();
  // a page in an open space inherits the organisation access: closing it adds an explicit deny after a question
  const open = (await call<{ space: { id: string } }>(page, 'POST', '/api/v1/spaces', { name: `Открытое ${tag}`, kind: 'project', visibility: 'open' })).space.id;
  const title2 = `Открытая ${tag}`;
  const id2 = (await call<{ page: { id: string } }>(page, 'POST', '/api/v1/pages', { spaceId: open, title: title2 })).page.id;
  const invited = await createUser(page.request, `Ира Приглашённая ${tag}`);
  const outsider = await createUser(page.request, `Оскар Посторонний ${tag}`);
  await call(page, 'PUT', '/api/v1/grants', { resourceType: 'page', resourceId: id2, subjectType: 'user', subjectId: invited.id, level: 'comment' });
  expect((await call<{ level: string }>(page, 'GET', `/api/v1/access/explain?userId=${outsider.id}&pageId=${id2}`)).level).toBe('view');
  const dlg2 = await openShare(page, id2, title2);
  await expect(dlg2.getByLabel('Общий доступ')).not.toHaveValue('none');
  await dlg2.getByLabel('Общий доступ').selectOption('none');
  const close = page.getByRole('dialog', { name: 'Закрыть доступ для организации?' });
  await close.getByRole('button', { name: 'Отмена' }).click();
  expect((await access(page, id2)).pageGrants.some((g) => g.subject_type === 'org')).toBe(false);
  await dlg2.getByLabel('Общий доступ').selectOption('none');
  await close.locator('.dialog-footer').getByRole('button', { name: 'Закрыть' }).click();
  await expect(toasts(page)).toContainText('Доступ для всей организации закрыт');
  // QA-A9: no organisation-wide deny (it would win over every allow and lock out the invited and the owner too)
  const after = await access(page, id2);
  expect(after.pageGrants.some((g) => g.subject_type === 'org')).toBe(false);
  expect(after.inheritPermissions).toBe(false);
  await expect(dlg2.getByLabel('Общий доступ')).toHaveValue('none');
  const explain = async (userId: string) => (await call<{ level: string }>(page, 'GET', `/api/v1/access/explain?userId=${userId}&pageId=${id2}`)).level;
  expect(await explain(invited.id)).toBe('comment');
  expect(await explain(outsider.id)).toBe('none');
  const me = (await call<{ user: { id: string } }>(page, 'GET', '/api/v1/auth/me')).user.id;
  expect(await explain(me)).toBe('full');
  expect(errors).toEqual([]);
});

test('R-ACL-030 «Наследовать права» off/on with confirmations; own row: «Понизить собственный доступ?» and «Убрать свой доступ?» cancel keep full access; another member is removed with «Убрать доступ: …»', async ({ page }) => {
  const errors = pageErrors(page);
  await ensureOwner(page);
  const tag = uniq();
  const colleague = await createUser(page.request, `Гена Гость ${tag}`);
  const title = `Наследование ${tag}`;
  const id = await personalPage(page, title);
  await call(page, 'PUT', '/api/v1/grants', { resourceType: 'page', resourceId: id, subjectType: 'user', subjectId: colleague.id, level: 'view' });
  const dlg = await openShare(page, id, title);
  const inherit = dlg.getByLabel('Наследовать права');
  await expect(inherit).toBeChecked();
  await inherit.click();
  const off = page.getByRole('dialog', { name: 'Перестать наследовать права?' });
  await off.getByRole('button', { name: 'Отключить наследование' }).click();
  await expect(toasts(page)).toContainText('Наследование прав отключено');
  expect((await access(page, id)).inheritPermissions).toBe(false);
  // own access: demote → cancel; remove → cancel
  const mine = dlg.getByLabel(`Уровень доступа: ${OWNER.name}`);
  await expect(mine).toHaveValue('full');
  await mine.selectOption('edit');
  const demote = page.getByRole('dialog', { name: 'Понизить собственный доступ?' });
  await demote.getByRole('button', { name: 'Отмена' }).click();
  await expect(mine).toHaveValue('full');
  const me = (await call<{ user: { id: string } }>(page, 'GET', '/api/v1/auth/me')).user.id;
  expect((await access(page, id)).pageGrants.find((g) => g.subject_id === me)?.level).toBe('full');
  await dlg.getByRole('button', { name: `Убрать доступ: ${OWNER.name}` }).click();
  const self = page.getByRole('dialog', { name: 'Убрать свой доступ?' });
  await self.getByRole('button', { name: 'Отмена' }).click();
  expect((await access(page, id)).pageGrants.some((g) => g.subject_id === me)).toBe(true);
  // another member: removed
  await dlg.getByRole('button', { name: `Убрать доступ: ${colleague.name}` }).click();
  await page.getByRole('dialog', { name: `Убрать доступ: ${colleague.name}?` }).getByRole('button', { name: 'Убрать' }).click();
  await expect(toasts(page)).toContainText('Доступ отозван');
  expect((await access(page, id)).pageGrants.some((g) => g.subject_id === colleague.id)).toBe(false);
  // inherit again: cancel, then confirm
  await inherit.click();
  const on = page.getByRole('dialog', { name: 'Снова наследовать права?' });
  await on.getByRole('button', { name: 'Отмена' }).click();
  await expect(inherit).not.toBeChecked();
  expect((await access(page, id)).inheritPermissions).toBe(false);
  await inherit.click();
  await on.getByRole('button', { name: 'Наследовать' }).click();
  await expect(toasts(page)).toContainText('Наследование прав включено');
  expect((await access(page, id)).inheritPermissions).toBe(true);
  expect(errors).toEqual([]);
});

test('R-ACL-033 «Почему у пользователя есть доступ?» explains a colleague\'s level and its source; an explain error is shown', async ({ page }) => {
  await ensureOwner(page);
  const tag = uniq();
  const colleague = await createUser(page.request, `Зоя Зритель ${tag}`);
  const title = `Объяснение ${tag}`;
  const id = await personalPage(page, title);
  await call(page, 'PUT', '/api/v1/grants', { resourceType: 'page', resourceId: id, subjectType: 'user', subjectId: colleague.id, level: 'comment' });
  const dlg = await openShare(page, id, title);
  await dlg.getByRole('button', { name: 'Почему у пользователя есть доступ?' }).click();
  await dlg.getByPlaceholder('Выберите сотрудника').fill(tag);
  await dlg.getByRole('option', { name: new RegExp(colleague.name) }).click();
  await expect(dlg.getByText(`${colleague.name}: Комментирование`, { exact: false })).toBeVisible();
  await expect(dlg.getByText(/выдан напрямую/)).toBeVisible();
  // error
  const other = await createUser(page.request, `Яна Ошибка ${tag}`);
  await failWith(page, /\/api\/v1\/access\/explain/, 'GET');
  await dlg.getByPlaceholder('Выберите сотрудника').fill('Яна Ошибка');
  await dlg.getByRole('option', { name: new RegExp(other.name) }).click();
  await expect(dlg.locator('.kb-error')).toContainText('Внутренняя ошибка сервера');
});

test('R-ACL-040 no permission: a viewer asks for more rights — «Зачем нужен доступ (необязательно)» and «Отправить запрос»; a double click sends one request and the owner gets one notification', async ({ page, browser }) => {
  await ensureOwner(page);
  const tag = uniq();
  const viewer = await createUser(page.request, `Вова Читатель ${tag}`);
  const title = `Запрос прав ${tag}`;
  const id = await personalPage(page, title);
  await call(page, 'PUT', '/api/v1/grants', { resourceType: 'page', resourceId: id, subjectType: 'user', subjectId: viewer.id, level: 'view' });
  const v = await signedIn(browser, viewer, `/p/${id}`);
  await v.p.goto(`/p/${id}`);
  await v.p.getByRole('button', { name: 'Поделиться' }).click();
  const dlg = v.p.getByRole('dialog', { name: `Доступ: ${title}` });
  await expect(dlg.getByText('управлять доступом могут пользователи с полным доступом')).toBeVisible();
  await expect(dlg.getByRole('button', { name: 'Выдать доступ' })).toHaveCount(0);
  await dlg.getByRole('button', { name: 'Запросить больше прав' }).click();
  await dlg.getByLabel('Зачем нужен доступ (необязательно)').fill(`Нужно править раздел ${tag}`);
  const sent = await slow(v.p, '**/api/v1/access-requests', 'POST', 700);
  await humanDoubleClick(v.p, dlg.getByRole('button', { name: 'Отправить запрос' }));
  await expect(toasts(v.p)).toContainText('Запрос отправлен владельцам страницы');
  expect(sent.n).toBe(1);
  await v.ctx.close();
  const notes = (await call<{ notifications: Array<{ type: string; data: { resourceId: string; reason: string | null } }> }>(page, 'GET', '/api/v1/notifications')).notifications;
  expect(notes.filter((n) => n.type === 'access_request' && n.data.resourceId === id)).toHaveLength(1);
});

test('QA-A6 (fixed): «Запросить доступ» on a page without access sends one request on a double click and then shows «Запрос отправлен»; a server error is explained', async ({ page, browser }) => {
  await ensureOwner(page);
  const tag = uniq();
  const stranger = await createUser(page.request, `Стас Чужой ${tag}`);
  const id = await personalPage(page, `Закрытая ${tag}`);
  const s = await signedIn(browser, stranger, `/p/${id}`);
  await s.p.goto(`/p/${id}`);
  await expect(s.p.getByRole('heading', { name: 'Страница не найдена или у вас нет доступа' })).toBeVisible();
  const ask = s.p.getByRole('button', { name: 'Запросить доступ' });
  await failWith(s.p, '**/api/v1/access-requests', 'POST');
  await ask.click();
  await expect(toasts(s.p)).toContainText('Внутренняя ошибка сервера');
  await expect(ask).toBeEnabled();
  await s.p.unroute('**/api/v1/access-requests');
  const sent = await slow(s.p, '**/api/v1/access-requests', 'POST', 700);
  await humanDoubleClick(s.p, ask);
  const done = s.p.getByRole('button', { name: 'Запрос отправлен' });
  await expect(done).toBeDisabled();
  expect(sent.n).toBe(1);
  await s.ctx.close();
  const notes = (await call<{ notifications: Array<{ type: string; data: { resourceId: string } }> }>(page, 'GET', '/api/v1/notifications')).notifications;
  expect(notes.filter((n) => n.type === 'access_request' && n.data.resourceId === id)).toHaveLength(1);
});

test('R-PUBLISH-009 «Пароль ссылки»: a short password blocks «Создать ссылку»; a valid one protects the public link with a password form', async ({ page, browser }) => {
  await ensureOwner(page);
  await call(page, 'PATCH', '/api/v1/admin/settings', { publicLinksEnabled: true });
  const tag = uniq();
  const title = `Защищённая ${tag}`;
  const id = await personalPage(page, title);
  const dlg = await openShare(page, id, title);
  await dlg.getByRole('button', { name: 'Создать публичную ссылку' }).click();
  await dlg.getByLabel('Понимаю, что скачанное по ссылке нельзя отозвать').check();
  const create = dlg.getByRole('button', { name: 'Создать ссылку' });
  await dlg.getByLabel('Пароль ссылки').fill('123');
  await expect(create).toBeDisabled();
  await dlg.getByLabel('Пароль ссылки').fill('секрет-42');
  await expect(create).toBeEnabled();
  await create.click();
  const code = dlg.locator('code', { hasText: '/pub/' });
  await expect(code).toBeVisible();
  const url = (await code.textContent())!;
  const links = (await call<{ links: Array<{ hasPassword: boolean }> }>(page, 'GET', `/api/v1/pages/${id}/share-links`)).links;
  expect(links).toHaveLength(1);
  expect(links[0].hasPassword).toBe(true);
  const anon = await browser.newContext();
  const ap = await anon.newPage();
  await ap.goto(url);
  await expect(ap.getByLabel(/Пароль/)).toBeVisible();
  await expect(ap.getByText(title)).toHaveCount(0);
  await anon.close();
  await dlg.getByRole('button', { name: 'Отозвать публичную ссылку' }).click();
  await page.getByRole('dialog', { name: 'Отозвать публичную ссылку?' }).getByRole('button', { name: 'Отозвать' }).click();
  await expect(toasts(page)).toContainText('Публичная ссылка отозвана');
});

async function openInfo(page: Page, id: string) {
  await page.goto(`/p/${id}`);
  await page.getByRole('button', { name: 'Действия со страницей', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Сведения о странице' }).click();
  const panel = page.getByRole('complementary', { name: 'Боковая панель' });
  await expect(panel.getByText('Свойства')).toBeVisible();
  return panel;
}

test('R-PAGE-022 properties: add a property (server error keeps the typed key and value), «Удалить свойство «…»» removes it on the server', async ({ page }) => {
  const errors = pageErrors(page);
  await ensureOwner(page);
  const id = await personalPage(page, `Свойства ${uniq()}`);
  const panel = await openInfo(page, id);
  const add = panel.getByRole('button', { name: 'Добавить свойство' });
  await expect(add).toBeDisabled(); // empty key
  await panel.getByLabel('Название нового свойства').fill('Ответственный');
  await panel.getByLabel('Значение нового свойства').fill('Отдел закупок');
  await failWith(page, `**/api/v1/pages/${id}`, 'PATCH');
  await add.click();
  await expect(toasts(page)).toContainText('Внутренняя ошибка сервера');
  await expect(panel.getByLabel('Название нового свойства')).toHaveValue('Ответственный');
  await expect(panel.getByLabel('Значение нового свойства')).toHaveValue('Отдел закупок');
  expect((await pageDto(page, id)).properties).not.toHaveProperty('Ответственный');
  await page.unroute(`**/api/v1/pages/${id}`);
  await add.click();
  await expect(panel.getByRole('textbox', { name: 'Свойство «Ответственный»' })).toHaveValue('Отдел закупок');
  await expect(panel.getByLabel('Название нового свойства')).toHaveValue('');
  expect((await pageDto(page, id)).properties['Ответственный']).toBe('Отдел закупок');
  await panel.getByRole('button', { name: 'Удалить свойство «Ответственный»' }).click();
  await expect(panel.getByRole('textbox', { name: 'Свойство «Ответственный»' })).toHaveCount(0);
  await expect.poll(async () => (await pageDto(page, id)).properties['Ответственный'] ?? null).toBeNull();
  expect(errors).toEqual([]);
});

test('R-HISTORY-015 legal hold: «Установить юридическое удержание» needs a reason, cancel changes nothing, server error keeps it unset; «Снять удержание» releases it; an editor without admin role cannot set it', async ({ page, browser }) => {
  const errors = pageErrors(page);
  await ensureOwner(page);
  const tag = uniq();
  const editor = await createUser(page.request, `Эдик Редактор ${tag}`);
  const id = await personalPage(page, `Удержание ${tag}`);
  await call(page, 'PUT', '/api/v1/grants', { resourceType: 'page', resourceId: id, subjectType: 'user', subjectId: editor.id, level: 'edit' });
  const panel = await openInfo(page, id);
  await panel.getByRole('button', { name: 'Установить удержание' }).click();
  const dlg = page.getByRole('dialog', { name: 'Установить юридическое удержание' });
  const set = dlg.getByRole('button', { name: 'Установить' });
  await expect(set).toBeDisabled(); // empty reason
  await dlg.getByLabel('Основание').fill('ок');
  await expect(set).toBeDisabled(); // too short
  await dlg.getByRole('button', { name: 'Отмена' }).click();
  expect((await pageDto(page, id)).legalHold).toBeFalsy();
  await panel.getByRole('button', { name: 'Установить удержание' }).click();
  await dlg.getByLabel('Основание').fill(`Судебный запрос ${tag}`);
  await failWith(page, '**/api/v1/admin/legal-hold', 'PUT');
  await set.click();
  await expect(toasts(page)).toContainText('Внутренняя ошибка сервера');
  await expect(dlg).toBeVisible();
  expect((await pageDto(page, id)).legalHold).toBeFalsy();
  await page.unroute('**/api/v1/admin/legal-hold');
  await set.click();
  await expect(toasts(page)).toContainText('Юридическое удержание установлено');
  await expect(panel.getByText('Юридическое удержание: страницу и её историю нельзя удалить окончательно')).toBeVisible();
  expect((await pageDto(page, id)).legalHold).toBe(true);
  // the editor sees the hold but cannot release it
  const e = await signedIn(browser, editor, `/p/${id}`);
  const ep = await openInfo(e.p, id);
  await expect(ep.getByText('Юридическое удержание: страницу и её историю нельзя удалить окончательно')).toBeVisible();
  await expect(ep.getByRole('button', { name: 'Снять удержание' })).toHaveCount(0);
  await e.ctx.close();
  await panel.getByRole('button', { name: 'Снять удержание' }).click();
  const off = page.getByRole('dialog', { name: 'Снять юридическое удержание' });
  await off.getByLabel('Основание').fill('Дело закрыто');
  await off.getByRole('button', { name: 'Снять' }).click();
  await expect(toasts(page)).toContainText('Юридическое удержание снято');
  expect((await pageDto(page, id)).legalHold).toBeFalsy();
  expect(errors).toEqual([]);
});

/** A project space whose pages are published explicitly (optionally with approval) and a page in it. */
async function workflowPage(page: Page, tag: string, requireApproval: boolean) {
  const sp = (await call<{ space: { id: string } }>(page, 'POST', '/api/v1/spaces', { name: `Публикации ${tag}`, kind: 'project', visibility: 'private' })).space.id;
  await call(page, 'PATCH', `/api/v1/spaces/${sp}`, { policy: { publishingMode: 'publish', requireApproval } });
  const id = (await call<{ page: { id: string } }>(page, 'POST', '/api/v1/pages', { spaceId: sp, title: `Документ ${tag}` })).page.id;
  return { sp, id };
}

test('R-PUBLISH-002 «Снять с публикации?» and «Перенести в архив?»: cancel keeps the status, server error keeps it, confirm changes it on the server; «Вернуть из архива»', async ({ page }) => {
  const errors = pageErrors(page);
  await ensureOwner(page);
  const tag = uniq();
  const { id } = await workflowPage(page, tag, false);
  await call(page, 'POST', `/api/v1/pages/${id}/publish`, {});
  await page.goto(`/p/${id}`);
  const bar = page.getByRole('region', { name: 'Публикация' });
  await expect(bar).toContainText('Опубликовано');
  await bar.getByRole('button', { name: 'Снять с публикации' }).click();
  const unpub = page.getByRole('dialog', { name: 'Снять с публикации?' });
  await unpub.getByRole('button', { name: 'Отмена' }).click();
  expect((await pageDto(page, id)).status).toBe('published');
  await failWith(page, `**/api/v1/pages/${id}/unpublish`, 'POST');
  await bar.getByRole('button', { name: 'Снять с публикации' }).click();
  await unpub.getByRole('button', { name: 'Снять с публикации' }).click();
  await expect(toasts(page)).toContainText('Внутренняя ошибка сервера');
  expect((await pageDto(page, id)).status).toBe('published');
  await page.unroute(`**/api/v1/pages/${id}/unpublish`);
  await bar.getByRole('button', { name: 'Снять с публикации' }).click();
  await unpub.getByRole('button', { name: 'Снять с публикации' }).click();
  await expect(toasts(page)).toContainText('Страница снята с публикации');
  await expect(bar).toContainText('Черновик');
  expect((await pageDto(page, id)).status).toBe('draft');
  // archive
  await bar.getByRole('button', { name: 'В архив' }).click();
  const arch = page.getByRole('dialog', { name: 'Перенести в архив?' });
  await arch.getByRole('button', { name: 'Отмена' }).click();
  expect((await pageDto(page, id)).status).toBe('draft');
  const sent = await count(page, `**/api/v1/pages/${id}/archive`, 'POST');
  await bar.getByRole('button', { name: 'В архив' }).click();
  await arch.getByRole('button', { name: 'В архив' }).click();
  await expect(toasts(page)).toContainText('Страница перенесена в архив');
  await expect(bar).toContainText('Страница в архиве');
  expect((await pageDto(page, id)).status).toBe('archived');
  await bar.getByRole('button', { name: 'Вернуть из архива' }).click();
  await expect(toasts(page)).toContainText('Страница возвращена из архива');
  expect((await pageDto(page, id)).status).not.toBe('archived');
  expect(sent.n).toBe(2);
  expect(errors).toEqual([]);
});

test('R-PUBLISH-005 approval: the reviewer opens «Открыть историю версий» from the decision dialog; «Вернуть на доработку» needs a comment; an editor without publish rights cannot decide', async ({ page, browser }) => {
  const errors = pageErrors(page);
  await ensureOwner(page);
  const tag = uniq();
  const { sp, id } = await workflowPage(page, tag, true);
  const author = await createUser(page.request, `Ася Автор ${tag}`);
  await call(page, 'PUT', '/api/v1/grants', { resourceType: 'space', resourceId: sp, subjectType: 'user', subjectId: author.id, level: 'edit' });
  const a = await signedIn(browser, author, `/p/${id}`);
  await call(a.p, 'POST', `/api/v1/pages/${id}/submit-review`, { message: 'Проверьте раздел 2' });
  await a.p.goto(`/p/${id}`);
  const abar = a.p.getByRole('region', { name: 'Публикация' });
  await expect(abar).toContainText('На согласовании');
  await expect(abar.getByRole('button', { name: 'Согласовать' })).toHaveCount(0); // no publish right
  await a.ctx.close();
  await page.goto(`/p/${id}`);
  const bar = page.getByRole('region', { name: 'Публикация' });
  await bar.getByRole('button', { name: 'Согласовать' }).click();
  const decide = page.getByRole('dialog', { name: 'Согласовать и опубликовать' });
  await expect(decide).toContainText('Проверьте раздел 2');
  await decide.getByRole('button', { name: 'Открыть историю версий' }).click();
  await expect(page.getByRole('complementary', { name: 'Боковая панель' }).getByText(/Отправлено на согласование/).first()).toBeVisible();
  await decide.getByRole('button', { name: 'Отмена' }).click();
  expect((await pageDto(page, id)).status).toBe('review');
  await bar.getByRole('button', { name: 'Вернуть на доработку' }).click();
  const reject = page.getByRole('dialog', { name: 'Вернуть на доработку' });
  const send = reject.getByRole('button', { name: 'Вернуть' });
  await expect(send).toBeDisabled(); // a comment is required
  await reject.getByLabel('Что нужно исправить').fill('Уточните сроки поставки');
  await send.click();
  await expect(toasts(page)).toContainText('Возвращено на доработку');
  expect((await pageDto(page, id)).status).toBe('draft');
  expect(errors).toEqual([]);
});
