import { expect, type Browser, type Locator, type Page } from '@playwright/test';
import { login_ } from './helpers';

/**
 * Shared helpers of the qa-admin-*.spec.ts action × condition tests (administration, access, spaces, page panels).
 * Same conventions as tests/e2e/qa-actions.spec.ts: slow network and server errors through page.route, a human double
 * click, a second browser context for a less privileged account.
 */

/** Delays every matching request of `method` by `ms` and counts how many were sent. */
export async function slow(page: Page, pattern: string | RegExp, method: string, ms: number) {
  const counter = { n: 0 };
  await page.route(pattern, async (route) => {
    if (route.request().method() !== method) return route.fallback();
    counter.n++;
    await new Promise((r) => setTimeout(r, ms));
    await route.fallback().catch(() => undefined);
  });
  return counter;
}

/** Counts matching requests of `method` without changing them. */
export async function count(page: Page, pattern: string | RegExp, method: string) {
  const counter = { n: 0 };
  await page.route(pattern, (route) => {
    if (route.request().method() === method) counter.n++;
    return route.fallback();
  });
  return counter;
}

/** Answers matching requests of `method` with a server error. */
export async function failWith(page: Page, pattern: string | RegExp, method: string, status = 500) {
  await page.route(pattern, (route) =>
    route.request().method() === method ? route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ error: { code: 'internal', message: 'Внутренняя ошибка сервера' } }) }) : route.fallback(),
  );
}

/** A human double click: two presses ~120 ms apart (the second one with detail = 2). */
export async function humanDoubleClick(page: Page, target: Locator) {
  await target.scrollIntoViewIfNeeded();
  const b = (await target.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down({ clickCount: 1 });
  await page.mouse.up({ clickCount: 1 });
  await page.waitForTimeout(120);
  await page.mouse.down({ clickCount: 2 });
  await page.mouse.up({ clickCount: 2 });
}

export const pageErrors = (p: Page) => {
  const list: string[] = [];
  p.on('pageerror', (e) => list.push(e.message));
  return list;
};

/** Signs a user in in a separate browser context. */
export async function signedIn(browser: Browser, user: { email: string; password: string }, url = '/') {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(url);
  await login_(p, user.email, user.password);
  await expect(p.locator('.app-shell')).toBeVisible();
  return { ctx, p };
}

export async function csrfOf(page: Page) {
  return (await page.context().storageState()).cookies.find((c) => c.name === 'kb_csrf')?.value ?? '';
}

/** JSON API call in the page's session; asserts success unless `allowFail`. */
export async function call<T = any>(page: Page, method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, data?: unknown, allowFail = false): Promise<T> {
  const r = await page.request.fetch(path, { method, data, headers: { 'x-csrf-token': await csrfOf(page) } });
  if (!allowFail) expect(r.ok(), `${method} ${path}: ${await r.text()}`).toBeTruthy();
  return (await r.json().catch(() => ({}))) as T;
}

export const toasts = (p: Page) => p.locator('.toasts');

export const uniq = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
