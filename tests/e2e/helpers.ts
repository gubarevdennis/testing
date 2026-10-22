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
