import { expect, type Page, type APIRequestContext } from '@playwright/test';

export const OWNER = { org: 'ООО «Тест»', name: 'Анна Владелец', email: 'owner@corp.test', password: 'Owner-password-1' };

/** First-run setup through the UI (only once per server); later calls just log in. */
export async function ensureOwner(page: Page) {
  await page.goto('/');
  const setup = page.getByRole('heading', { name: 'Первичная настройка' });
  const login = page.getByRole('heading', { name: 'Вход в базу знаний' });
  await expect(setup.or(login).or(page.locator('.app-shell'))).toBeVisible();
  if (await setup.isVisible()) {
    await page.getByLabel('Название организации').fill(OWNER.org);
    await page.getByLabel('Ваше имя').fill(OWNER.name);
    await page.getByLabel('Электронная почта').fill(OWNER.email);
    await page.getByLabel('Пароль').fill(OWNER.password);
    await page.getByRole('button', { name: 'Создать организацию' }).click();
  } else if (await login.isVisible()) {
    await login_(page, OWNER.email, OWNER.password);
  }
  await expect(page.locator('.app-shell')).toBeVisible();
}

export async function login_(page: Page, email: string, password: string) {
  await page.getByLabel('Электронная почта').fill(email);
  await page.getByLabel('Пароль').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
}

/** Creates a page in the personal space via the "Новая страница" button and returns its id. */
export async function newPage(page: Page, title: string) {
  if (!(await page.getByRole('navigation', { name: 'Навигация' }).isVisible())) await page.getByRole('button', { name: 'Показать боковую панель' }).click();
  const before = page.url();
  await page.getByRole('navigation', { name: 'Навигация' }).getByRole('button', { name: 'Новая страница', exact: true }).click();
  await page.waitForURL((u) => /\/p\/[0-9a-f-]{36}/.test(u.pathname) && u.toString() !== before);
  const titleBox = page.getByLabel('Название страницы');
  await expect(titleBox).toBeFocused();
  await titleBox.fill(title);
  await titleBox.press('Enter');
  return page.url().split('/p/')[1].split(/[?#]/)[0];
}

export function editor(page: Page) {
  return page.locator('.kb-editor');
}

export async function expectSaved(page: Page) {
  await expect(page.locator('.sync-status')).toHaveText(/Сохранено$/, { timeout: 15_000 });
}

export async function apiContent(request: APIRequestContext, pageId: string) {
  const r = await request.get(`/api/v1/pages/${pageId}/content`);
  expect(r.ok()).toBeTruthy();
  return (await r.json()) as { content: any; title: string };
}

/** Creates an employee via the admin API (test-only password endpoint) and returns credentials. */
export async function createUser(request: APIRequestContext, name: string, opts: { pageGrants?: Array<{ pageId: string; level: 'view' | 'comment' | 'edit' }> } = {}) {
  const csrf = (await request.storageState()).cookies.find((c) => c.name === 'kb_csrf')?.value ?? '';
  const email = `u${Date.now()}${Math.floor(Math.random() * 1000)}@corp.test`;
  const r = await request.post('/api/v1/admin/users', { data: { email, name, kind: 'employee', invite: false, pageGrants: opts.pageGrants }, headers: { 'x-csrf-token': csrf } });
  expect(r.ok(), await r.text()).toBeTruthy();
  const { user } = await r.json();
  const password = 'User-password-1';
  const p = await request.post('/api/v1/__test/set-password', { data: { userId: user.id, password }, headers: { 'x-csrf-token': csrf } });
  expect(p.ok()).toBeTruthy();
  return { id: user.id as string, email, password, name };
}

export async function api(page: Page, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, data?: unknown) {
  const csrf = (await page.context().storageState()).cookies.find((c) => c.name === 'kb_csrf')?.value ?? '';
  const r = await page.request.fetch(path, { method, data, headers: { 'x-csrf-token': csrf } });
  expect(r.ok(), `${method} ${path}: ${await r.text()}`).toBeTruthy();
  return r.json();
}

/** Dispatches a synthetic paste with the given clipboard flavours into the focused editor. */
export async function paste(page: Page, data: Record<string, string>) {
  await page.evaluate((d) => {
    const dt = new DataTransfer();
    for (const [k, v] of Object.entries(d)) dt.setData(k, v);
    const target = document.activeElement ?? document.querySelector('.kb-editor');
    target!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, data);
}

/** Places the caret inside the paragraph containing `text`, retrying if late layout shifts moved the click target. */
export async function caretIn(page: Page, text: string) {
  const p = editor(page).locator('p', { hasText: text }).first();
  await expect(async () => {
    await p.click();
    const ok = await page.evaluate((t) => (window.getSelection()?.anchorNode?.textContent ?? '').includes(t), text);
    expect(ok).toBe(true);
  }).toPass({ timeout: 10_000 });
}

/**
 * A page link in the sidebar tree. The tree is virtualized, so in a database shared by many tests the row may not be
 * rendered yet: scroll the tree from the top until it appears.
 */
export async function treeLink(page: Page, name: string | RegExp, role: 'link' | 'button' = 'link') {
  const tree = page.getByRole('tree', { name: 'Страницы' });
  const link = tree.getByRole(role, { name });
  await expect(tree).toBeVisible();
  await page.waitForTimeout(200);
  if (await link.count()) return link.first();
  await tree.evaluate((el) => (el.scrollTop = 0));
  for (let i = 0; i < 200; i++) {
    if (await link.count()) break;
    const end = await tree.evaluate((el) => {
      const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
      el.scrollTop += el.clientHeight * 0.8;
      return atEnd;
    });
    await page.waitForTimeout(end ? 300 : 60);
    if (end && !(await link.count()) && i > 5) break;
  }
  return link.first();
}
