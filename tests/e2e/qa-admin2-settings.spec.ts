import { test, expect, type Page } from '@playwright/test';
import { createHmac } from 'node:crypto';
import { ensureOwner, createUser } from './helpers';
import { call, failWith, pageErrors, signedIn, slow, toasts, uniq } from './qa-admin-helpers';

/**
 * Second QA wave of the personal settings (/settings/*, apps/web/src/pages/SettingsPage.tsx): profile «Должность»,
 * theme and editor preferences, two-factor authentication set-up and removal, API token lifetime — QA26-01, QA26-03,
 * R-QA-004, R-UI-061, R-AUTH-*.
 */

/** RFC 6238 code for a base32 secret (as the server's apps/server/src/auth/totp.ts). */
function totp(secret: string, at = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of secret.replace(/[\s=]+/g, '')) bits += alphabet.indexOf(ch).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const h = createHmac('sha1', key).update(msg).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

const me = async (page: Page) => (await call<{ user: { name: string; title: string | null; mfaEnabled: boolean; preferences: Record<string, any> } }>(page, 'GET', '/api/v1/auth/me')).user;

test('QA admin2 settings setup', async ({ page }) => {
  await ensureOwner(page);
});

test('R-QA-004 profile «Должность»: saved on the server and shown; «Отменить» restores the saved value; an empty name is refused; a server error keeps the typed values', async ({ page, browser }) => {
  const errors = pageErrors(page);
  await ensureOwner(page);
  const u = await createUser(page.request, `Пётр Профиль ${uniq()}`);
  const s = await signedIn(browser, u, '/settings/profile');
  const p = s.p;
  await p.goto('/settings/profile');
  const title = p.getByLabel('Должность');
  const save = p.getByRole('button', { name: 'Сохранить' });
  await expect(save).toBeDisabled(); // nothing changed
  await title.fill('Инженер по качеству');
  await p.getByRole('button', { name: 'Отменить' }).click();
  await expect(title).toHaveValue('');
  await p.getByLabel('Имя и фамилия').fill(' ');
  await expect(p.getByText('Имя не может быть пустым')).toBeVisible();
  await expect(save).toBeDisabled();
  await p.getByLabel('Имя и фамилия').fill(u.name);
  await title.fill('Инженер по качеству');
  await failWith(p, '**/api/v1/auth/me', 'PATCH');
  await save.click();
  await expect(p.getByRole('alert')).toContainText('Внутренняя ошибка сервера');
  await expect(title).toHaveValue('Инженер по качеству');
  expect((await me(p)).title).toBeNull();
  await p.unroute('**/api/v1/auth/me');
  await save.click();
  await expect(toasts(p)).toContainText('Профиль сохранён');
  expect((await me(p)).title).toBe('Инженер по качеству');
  await expect(save).toBeDisabled();
  await p.reload();
  await expect(title).toHaveValue('Инженер по качеству');
  await s.ctx.close();
  expect(errors).toEqual([]);
});

test('R-UI-061 theme «Тёмная» / «Светлая» / «Как в системе» applies at once, survives a reload and is stored in the profile; editor switches («Широкие страницы по умолчанию») are saved on the server; a failed save is reported; a slow save keeps the switches disabled', async ({ page, browser }) => {
  await ensureOwner(page);
  const u = await createUser(page.request, `Тамара Тема ${uniq()}`);
  const s = await signedIn(browser, u, '/settings/appearance');
  const p = s.p;
  await p.goto('/settings/appearance');
  const html = p.locator('html');
  await p.getByLabel('Тёмная').check();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect.poll(async () => (await me(p)).preferences.theme).toBe('dark');
  await p.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(p.getByLabel('Тёмная')).toBeChecked();
  await p.getByLabel('Светлая').check();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await p.getByLabel('Как в системе').check();
  await expect(html).not.toHaveAttribute('data-theme', /./);
  await expect.poll(async () => (await me(p)).preferences.theme).toBe('system');
  // editor preference switch
  const wide = p.getByLabel('Широкие страницы по умолчанию');
  await expect(wide).not.toBeChecked();
  const sent = await slow(p, '**/api/v1/auth/me/preferences', 'PATCH', 900);
  await wide.click();
  await expect(p.getByLabel('Проверка орфографии')).toBeDisabled(); // saving
  await expect(p.getByLabel('Проверка орфографии')).toBeEnabled();
  await expect(wide).toBeChecked(); // the switch shows the state confirmed by the server
  expect(sent.n).toBe(1);
  await expect.poll(async () => (await me(p)).preferences.editor?.wideByDefault).toBe(true);
  await p.unroute('**/api/v1/auth/me/preferences');
  await failWith(p, '**/api/v1/auth/me/preferences', 'PATCH');
  await p.getByLabel('Умная типографика').click();
  await expect(toasts(p)).toContainText('Настройка не сохранена на сервере: Внутренняя ошибка сервера');
  expect((await me(p)).preferences.editor?.smartTypography ?? true).toBe(true);
  await expect(p.getByLabel('Умная типографика')).toBeChecked(); // not changed
  await s.ctx.close();
});

test('R-AUTH-006 two-factor authentication: «Настроить» shows «Секретный ключ» and «Ссылка otpauth://»; «Отмена» drops the set-up; a wrong code is refused; the right code «Включить»s it; «Отключить» asks «Отключить двухфакторную аутентификацию?» — cancel keeps it, confirm removes it', async ({ page, browser }) => {
  const errors = pageErrors(page);
  await ensureOwner(page);
  const u = await createUser(page.request, `Марк Ключ ${uniq()}`);
  const s = await signedIn(browser, u, '/settings/security');
  const p = s.p;
  await p.goto('/settings/security');
  await p.getByRole('button', { name: 'Настроить' }).click();
  const secretField = p.getByLabel('Секретный ключ');
  await expect(secretField).toHaveValue(/^[A-Z2-7]{4}( [A-Z2-7]{1,4})+$/);
  await expect(p.getByLabel('Ссылка otpauth://')).toHaveValue(/^otpauth:\/\/totp\//);
  await p.getByRole('button', { name: 'Отмена' }).click();
  await expect(secretField).toHaveCount(0);
  expect((await me(p)).mfaEnabled).toBe(false);
  // set up again (a new secret)
  await p.getByRole('button', { name: 'Настроить' }).click();
  const secret = (await secretField.inputValue()).replace(/\s/g, '');
  const code = p.getByPlaceholder('123456');
  const enable = p.getByRole('button', { name: 'Включить' });
  await code.fill('12');
  await expect(enable).toBeDisabled(); // not six digits
  const good = totp(secret);
  await code.fill(good === '000000' ? '111111' : '000000');
  await enable.click();
  await expect(p.getByRole('alert')).toContainText('Неверный код подтверждения');
  expect((await me(p)).mfaEnabled).toBe(false);
  await code.fill(totp(secret));
  await enable.click();
  await expect(toasts(p)).toContainText('Двухфакторная аутентификация включена');
  await expect(p.getByText('включена', { exact: true })).toBeVisible();
  expect((await me(p)).mfaEnabled).toBe(true);
  // disable: confirmation, cancel keeps it
  const off = p.getByRole('button', { name: 'Отключить', exact: true });
  await expect(off).toBeDisabled(); // no code yet
  await code.fill(totp(secret, Date.now() + 30_000));
  await off.click();
  const ask = p.getByRole('dialog', { name: 'Отключить двухфакторную аутентификацию?' });
  await ask.getByRole('button', { name: 'Отмена' }).click();
  await expect(ask).toBeHidden();
  expect((await me(p)).mfaEnabled).toBe(true);
  await off.click();
  await ask.getByRole('button', { name: 'Отключить' }).click();
  await expect(toasts(p)).toContainText('Двухфакторная аутентификация отключена');
  expect((await me(p)).mfaEnabled).toBe(false);
  await expect(p.getByRole('button', { name: 'Настроить' })).toBeVisible();
  await s.ctx.close();
  expect(errors).toEqual([]);
});

test('R-UI-061 two-factor set-up errors: «Настроить» failing on the server is explained and can be retried; offline «Включить» keeps the code and explains the lost network', async ({ page, browser }) => {
  await ensureOwner(page);
  const u = await createUser(page.request, `Нина Сеть ${uniq()}`);
  const s = await signedIn(browser, u, '/settings/security');
  const p = s.p;
  await p.goto('/settings/security');
  await failWith(p, '**/api/v1/auth/mfa/setup', 'POST');
  await p.getByRole('button', { name: 'Настроить' }).click();
  await expect(p.getByRole('alert')).toContainText('Внутренняя ошибка сервера');
  await p.unroute('**/api/v1/auth/mfa/setup');
  await p.getByRole('button', { name: 'Настроить' }).click();
  const secret = (await p.getByLabel('Секретный ключ').inputValue()).replace(/\s/g, '');
  await p.getByPlaceholder('123456').fill(totp(secret));
  await s.ctx.setOffline(true);
  await p.getByRole('button', { name: 'Включить' }).click();
  await expect(p.getByRole('alert')).toContainText('Нет связи с сервером');
  await expect(p.getByPlaceholder('123456')).toHaveValue(totp(secret));
  await s.ctx.setOffline(false);
  expect((await me(p)).mfaEnabled).toBe(false);
  await s.ctx.close();
});

test('R-QA-004 API token «Срок действия, дней»: 0 and 400 are refused with «От 1 до 365 дней»; 30 days creates a token that expires in 30 days', async ({ page }) => {
  await ensureOwner(page);
  await page.goto('/settings/tokens');
  const days = page.getByLabel('Срок действия, дней');
  const create = page.getByRole('button', { name: 'Создать токен' });
  const name = `Срок ${uniq()}`;
  await page.getByLabel('Назначение').fill(name);
  await days.fill('0');
  await expect(page.getByText('От 1 до 365 дней')).toBeVisible();
  await expect(create).toBeDisabled();
  await days.fill('400');
  await expect(create).toBeDisabled();
  await days.fill('');
  await expect(create).toBeDisabled();
  await days.fill('30');
  await expect(create).toBeEnabled();
  await create.click();
  await expect(page.getByRole('status').filter({ hasText: `Токен «${name}» создан` })).toBeVisible();
  const t = (await call<{ tokens: Array<{ name: string; expires_at: string }> }>(page, 'GET', '/api/v1/me/tokens')).tokens.find((x) => x.name === name)!;
  const daysLeft = (new Date(t.expires_at).getTime() - Date.now()) / 86400_000;
  expect(daysLeft).toBeGreaterThan(29);
  expect(daysLeft).toBeLessThan(31);
});
