import { test, expect, type Page } from '@playwright/test';
import { ensureOwner, createUser, OWNER } from './helpers';
import { call, count, failWith, humanDoubleClick, pageErrors, signedIn, toasts, uniq } from './qa-admin-helpers';
import { createSpace, createPageIn } from './qa-admin2-helpers';

/**
 * Second QA wave of spaces: «Новое пространство» (components/space/SpaceAccess.tsx CreateSpaceDialog), the members
 * editor (term presets, organisation-wide row, own level, removal) and the space page (SpacePage.tsx: settings icon,
 * description, publication policy and restrictions, load error, unavailable space, untitled page row) — QA26-01,
 * QA26-03, R-QA-004, R-UI-061, R-SPACE-*, R-ADMIN-020.
 */

interface Space {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  kind: string;
  visibility: string;
  policy: { publishingMode: string; requireApproval: boolean; allowExport: boolean; allowDownload: boolean };
}
interface Grant {
  id: string;
  subject_type: string;
  subject_id: string | null;
  level: string;
  expires_at: string | null;
}
const spaceOf = async (page: Page, id: string) => (await call<{ space: Space }>(page, 'GET', `/api/v1/spaces/${id}`)).space;
const grantsOf = async (page: Page, id: string) => (await call<{ grants: Grant[] }>(page, 'GET', `/api/v1/spaces/${id}/access`)).grants;
async function openNewSpace(page: Page) {
  const nav = page.getByRole('navigation', { name: 'Навигация' });
  if (!(await nav.isVisible())) await page.getByRole('button', { name: 'Показать боковую панель' }).click();
  await nav.getByRole('button', { name: 'Новое пространство' }).click();
  return page.getByRole('dialog', { name: 'Новое пространство' });
}
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

test('QA admin2 spaces setup', async ({ page }) => {
  await ensureOwner(page);
});

test('R-SPACE-001 «Новое пространство»: empty name is explained; «Тип» offers «Проект», «Подразделение», «Закрытое», «Общекорпоративное»; «Видимость» «Приватное», «Закрытое», «Открытое»; «Описание» and «Все сотрудники организации» are saved; a picked member can be «Убрать»-ed; a server error keeps the form; a double click creates one space', async ({ page }) => {
  const errors = pageErrors(page);
  await ensureOwner(page);
  const tag = uniq();
  const colleague = await createUser(page.request, `Рита Участник ${tag}`);
  await page.goto('/');
  const dlg = await openNewSpace(page);
  const create = dlg.getByRole('button', { name: 'Создать пространство' });
  await create.click();
  await expect(dlg.getByRole('alert')).toContainText('Укажите название пространства');
  // the type and visibility choices
  const kind = dlg.getByLabel('Тип');
  for (const label of ['Проект', 'Подразделение', 'Закрытое', 'Общекорпоративное']) await expect(kind.getByRole('option', { name: new RegExp(`^${label} — `) })).toHaveCount(1);
  const vis = dlg.getByLabel('Видимость');
  for (const label of ['Приватное', 'Закрытое', 'Открытое']) await expect(vis.getByRole('option', { name: new RegExp(`^${label} — `) })).toHaveCount(1);
  const name = `Маркетинг ${tag}`;
  await dlg.getByLabel('Название').fill(name);
  await dlg.getByLabel('Описание').fill('Кампании и бренд');
  await kind.selectOption({ label: 'Подразделение — Материалы отдела; доступ выдаётся отделу целиком' });
  await vis.selectOption({ label: 'Закрытое — название видно всем, содержимое — по приглашению' });
  await dlg.getByLabel('Все сотрудники организации').selectOption({ label: 'Комментирование' });
  await expect(dlg.getByText('Пространство и все его страницы увидят все сотрудники (гости — нет).')).toBeVisible();
  // a member picked by mistake is removed again
  await dlg.getByPlaceholder('Добавить сотрудника, группу или отдел').fill(`Рита Участник ${tag}`);
  await dlg.getByRole('option', { name: new RegExp(`Рита Участник ${tag}`) }).click();
  const remove = dlg.getByRole('button', { name: `Убрать: Рита Участник ${tag}` });
  await expect(remove).toBeVisible();
  await remove.click();
  await expect(dlg.getByRole('list', { name: 'Участники нового пространства' })).toHaveCount(0);
  // server error: explained, nothing lost
  await failWith(page, '**/api/v1/spaces', 'POST');
  await create.click();
  await expect(dlg.getByRole('alert')).toContainText('Внутренняя ошибка сервера');
  await expect(dlg.getByLabel('Описание')).toHaveValue('Кампании и бренд');
  await page.unroute('**/api/v1/spaces');
  const sent = await count(page, '**/api/v1/spaces', 'POST');
  await humanDoubleClick(page, create);
  await page.waitForURL(/\/s\/[0-9a-f-]{36}/);
  expect(sent.n).toBe(1);
  const id = page.url().split('/s/')[1];
  const s = await spaceOf(page, id);
  expect(s.name).toBe(name);
  expect(s.description).toBe('Кампании и бренд');
  expect(s.kind).toBe('department');
  expect(s.visibility).toBe('closed');
  const grants = await grantsOf(page, id);
  expect(grants.find((g) => g.subject_type === 'org')?.level).toBe('comment');
  expect(grants.some((g) => g.subject_id === colleague.id)).toBe(false);
  const spaces = (await call<{ spaces: Array<{ name: string }> }>(page, 'GET', '/api/v1/spaces')).spaces.filter((x) => x.name === name);
  expect(spaces).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('R-SPACE-001 no permission: an employee creating a space is not offered «Общекорпоративное»', async ({ page, browser }) => {
  await ensureOwner(page);
  const u = await createUser(page.request, `Ефим Сотрудник ${uniq()}`);
  const s = await signedIn(browser, u);
  const dlg = await openNewSpace(s.p);
  await expect(dlg.getByLabel('Тип').getByRole('option', { name: /^Проект — / })).toHaveCount(1);
  await expect(dlg.getByLabel('Тип').getByRole('option', { name: /^Общекорпоративное — / })).toHaveCount(0);
  await s.ctx.close();
});

test('R-ADMIN-020 members: term presets «7 дней» / «Бессрочно»; the organisation row raised asks «Открыть пространство всей организации?» (cancel keeps it, «Открыть всем» applies); «Убрать из пространства: …?» cancel keeps, confirm removes; own level «Понизить»', async ({ page }) => {
  const errors = pageErrors(page);
  await ensureOwner(page);
  const tag = uniq();
  const member = await createUser(page.request, `Тома Срок ${tag}`);
  const id = await createSpace(page, `Участники ${tag}`, { orgLevel: 'view', visibility: 'closed' });
  await page.goto(`/s/${id}`);
  await page.getByRole('tab', { name: 'Участники' }).click();
  // presets
  await page.getByPlaceholder('Сотрудник, группа или отдел').fill(`Тома Срок ${tag}`);
  await page.getByRole('option', { name: new RegExp(`Тома Срок ${tag}`) }).click();
  const presets = page.getByRole('group', { name: 'Быстрый выбор срока' });
  await presets.getByRole('button', { name: '7 дней' }).click();
  await expect(page.getByLabel('Доступ до')).toHaveValue(ymd(new Date(Date.now() + 7 * 86400_000)));
  await expect(presets.getByRole('button', { name: '7 дней' })).toHaveAttribute('aria-pressed', 'true');
  await presets.getByRole('button', { name: 'Бессрочно' }).click();
  await expect(page.getByLabel('Доступ до')).toHaveValue('');
  await presets.getByRole('button', { name: '1 день' }).click();
  await page.getByRole('button', { name: 'Добавить в пространство' }).click();
  await expect(toasts(page)).toContainText('Участники добавлены');
  const g = (await grantsOf(page, id)).find((x) => x.subject_id === member.id)!;
  expect(new Date(g.expires_at!).getTime() - Date.now()).toBeLessThan(2 * 86400_000);
  // the organisation-wide row: view → edit asks first
  const orgRow = page.getByLabel('Уровень доступа: Все сотрудники организации');
  await orgRow.selectOption('edit');
  const widen = page.getByRole('dialog', { name: 'Открыть пространство всей организации?' });
  await expect(widen).toContainText(`Пространство «Участники ${tag}»`);
  await widen.getByRole('button', { name: 'Отмена' }).click();
  await expect(orgRow).toHaveValue('view');
  expect((await grantsOf(page, id)).find((x) => x.subject_type === 'org')?.level).toBe('view');
  await orgRow.selectOption('edit');
  await widen.getByRole('button', { name: 'Открыть всем' }).click();
  await expect(toasts(page)).toContainText('Доступ изменён');
  await expect.poll(async () => (await grantsOf(page, id)).find((x) => x.subject_type === 'org')?.level).toBe('edit');
  // removal asks with the member's name
  await page.getByRole('button', { name: `Убрать доступ: Тома Срок ${tag}` }).click();
  const memberName = `Тома Срок ${tag}`;
  const ask = page.getByRole('dialog', { name: `Убрать из пространства: ${memberName}?` });
  await ask.getByRole('button', { name: 'Отмена' }).click();
  expect((await grantsOf(page, id)).some((x) => x.subject_id === member.id)).toBe(true);
  await page.getByRole('button', { name: `Убрать доступ: Тома Срок ${tag}` }).click();
  await ask.getByRole('button', { name: 'Убрать' }).click();
  await expect(toasts(page)).toContainText('Доступ отозван');
  expect((await grantsOf(page, id)).some((x) => x.subject_id === member.id)).toBe(false);
  // own level lowered after confirmation (the organisation owner keeps managing the space through the role)
  const mine = page.getByLabel(`Уровень доступа: ${OWNER.name}`);
  await mine.selectOption('edit');
  await page.getByRole('dialog', { name: 'Понизить собственный доступ?' }).getByRole('button', { name: 'Понизить' }).click();
  await expect(toasts(page)).toContainText('Доступ изменён');
  const meId = (await call<{ user: { id: string } }>(page, 'GET', '/api/v1/auth/me')).user.id;
  await expect.poll(async () => (await grantsOf(page, id)).find((x) => x.subject_id === meId)?.level).toBe('edit');
  expect(errors).toEqual([]);
});

test('R-SPACE-004 space settings: «Выбрать иконку», «Описание», publication «После публикации» with «Согласование перед публикацией», back to «Сразу — читатели видят текущую версию»; «Разрешить экспорт» and «Разрешить скачивание вложений» off — all saved on the server', async ({ page }) => {
  const errors = pageErrors(page);
  await ensureOwner(page);
  const tag = uniq();
  const id = await createSpace(page, `Политика ${tag}`);
  await page.goto(`/s/${id}`);
  await page.getByRole('tab', { name: 'Настройки' }).click();
  await page.getByRole('button', { name: 'Выбрать иконку' }).click();
  await page.getByLabel('Поиск иконки').fill('ракета');
  await page.getByRole('listbox', { name: 'Иконки' }).getByRole('option').first().click();
  await expect(page.getByRole('button', { name: 'Выбрать иконку' })).toHaveText('🚀');
  await page.getByLabel('Описание').fill('Правила и процессы');
  const approval = page.getByLabel('Согласование перед публикацией');
  await expect(approval).toBeDisabled(); // only with «После публикации»
  await page.getByLabel(/^После публикации/).check();
  await expect(approval).toBeEnabled();
  await approval.check();
  await page.getByLabel('Разрешить экспорт').uncheck();
  await page.getByLabel('Разрешить скачивание вложений').uncheck();
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(toasts(page)).toContainText('Настройки сохранены');
  let s = await spaceOf(page, id);
  expect(s.icon).toBe('🚀');
  expect(s.description).toBe('Правила и процессы');
  expect(s.policy).toMatchObject({ publishingMode: 'publish', requireApproval: true, allowExport: false, allowDownload: false });
  await page.getByLabel('Сразу — читатели видят текущую версию').check();
  await expect(approval).toBeDisabled();
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(toasts(page)).toContainText('Настройки сохранены');
  s = await spaceOf(page, id);
  expect(s.policy.publishingMode).toBe('live');
  expect(errors).toEqual([]);
});

test('R-UI-061 space page: a load error offers «Повторить» which opens the space; an unknown space says «Пространство недоступно» with «На главную»; an untitled page is listed as «Без названия» and opens', async ({ page }) => {
  await ensureOwner(page);
  const tag = uniq();
  const id = await createSpace(page, `Сбойное ${tag}`);
  const untitled = await createPageIn(page, id, '');
  await failWith(page, `**/api/v1/spaces/${id}`, 'GET');
  await page.goto(`/s/${id}`);
  const retry = page.getByRole('alert').getByRole('button', { name: 'Повторить' });
  await expect(retry).toBeVisible({ timeout: 15_000 });
  await page.unroute(`**/api/v1/spaces/${id}`);
  await retry.click();
  await expect(page.getByRole('heading', { name: `Сбойное ${tag}` })).toBeVisible();
  const row = page.locator('.space-pages').getByRole('link', { name: 'Без названия' });
  await row.click();
  await expect(page).toHaveURL(new RegExp(`/p/${untitled}`));
  await page.goto('/s/00000000-0000-4000-8000-000000000000');
  await expect(page.getByRole('heading', { name: 'Пространство недоступно' })).toBeVisible();
  await page.getByRole('link', { name: 'На главную' }).click();
  await expect(page).toHaveURL(/\/$/);
});
