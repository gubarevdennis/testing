import { test, expect, type BrowserContext } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { ensureOwner, newPage, editor, paste } from './helpers';
import { startIsolatedServer } from '../../scripts/security/isolated-server';

/**
 * SEC-L1: pictures of other sites in pasted HTML are never loaded by the browser (CSP img-src 'self' data: blob:) and
 * are copied by the server (SSRF-guarded from-url) — with in-place progress, an honest failure state with «Повторить»,
 * and the paste staying one Undo step. Real fetches: an own application instance (E2E_PORT+4) whose remote fetcher may
 * reach "localhost" (REMOTE_FETCH_ALLOW_HOSTS), and a picture host on E2E_PORT+5 that logs who requests what.
 */
const BASE = Number(process.env.E2E_PORT ?? 8090);
const APP_PORT = BASE + 4;
const IMG_PORT = BASE + 5;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC', 'base64');

let app: Awaited<ReturnType<typeof startIsolatedServer>> | null = null;
let host: Server | null = null;
const hits: Array<{ path: string; browser: boolean }> = [];
let failSlow = true;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  host = createServer((req, res) => {
    const path = req.url ?? '/';
    hits.push({ path, browser: /Chrome|Mozilla/.test(String(req.headers['user-agent'] ?? '')) });
    const send = () => {
      if (path.startsWith('/pic.png') || (path.startsWith('/flaky.png') && !failSlow)) {
        res.writeHead(200, { 'content-type': 'image/png', 'content-length': PNG.length });
        res.end(PNG);
      } else {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not found');
      }
    };
    // a slow host: the in-place progress is visible for a while
    setTimeout(send, path.startsWith('/pic.png') ? 1500 : 0);
  });
  await new Promise<void>((r) => host!.listen(IMG_PORT, () => r()));
  if (process.env.E2E_WEB) process.env.KB_WEB_DIST = process.env.E2E_WEB;
  app = await startIsolatedServer({ port: APP_PORT, dbPrefix: (process.env.E2E_DB ?? 'kb_e2e') + '_paste', env: { REMOTE_FETCH_ALLOW_HOSTS: 'localhost', WORKER_ENABLED: 'false' } });
});

test.afterAll(async () => {
  await app?.stop();
  await new Promise<void>((r) => (host ? host.close(() => r()) : r()));
});

async function context(browser: import('@playwright/test').Browser): Promise<BrowserContext> {
  return browser.newContext({ baseURL: app!.base, locale: 'ru-RU', timezoneId: 'Europe/Moscow' });
}

test('SEC-L1: external pictures in pasted HTML are copied by the server with visible progress; the browser never requests them; one Undo removes the paste', async ({ browser }) => {
  const ctx = await context(browser);
  const page = await ctx.newPage();
  await ensureOwner(page);
  const id = await newPage(page, 'Вставка с картинками');
  await editor(page).locator('p').last().click();
  const src = `http://localhost:${IMG_PORT}/pic.png?utm=tracking`;
  await paste(page, { 'text/html': `<p>Перед картинкой</p><p><img src="${src}" alt="Схема склада"></p><p>После картинки</p>`, 'text/plain': 'Перед картинкой\nПосле картинки' });

  // In place: "copying" while the host is slow…
  await expect(page.getByRole('status').filter({ hasText: 'Копирование изображения с другого сайта…' })).toBeVisible();
  // …then the picture points at this server's copy.
  const img = editor(page).locator('.kb-image-block img');
  await expect(img).toHaveAttribute('src', /^\/api\/v1\/attachments\/[0-9a-f-]{36}\/content/, { timeout: 15_000 });
  await expect(page.getByRole('status').filter({ hasText: 'Копирование изображения' })).toHaveCount(0);
  expect(await img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);

  // The other site saw exactly one request — from the server, never from the browser.
  expect(hits.filter((h) => h.path.startsWith('/pic.png'))).toEqual([{ path: '/pic.png?utm=tracking', browser: false }]);
  const content = await (await page.request.get(`/api/v1/pages/${id}/content`)).json();
  expect(JSON.stringify(content.content)).not.toContain(`localhost:${IMG_PORT}`);

  // The paste (with its copied picture) is a single Undo step.
  await page.keyboard.press('Control+z');
  await expect(editor(page).locator('.kb-image-block')).toHaveCount(0);
  await expect(editor(page).getByText('После картинки')).toHaveCount(0);
  await ctx.close();
});

test('SEC-L1: a picture the server cannot copy is shown as «не скопировано» (not loaded from the other site) and can be retried', async ({ browser }) => {
  const ctx = await context(browser);
  const page = await ctx.newPage();
  await ensureOwner(page);
  await newPage(page, 'Вставка с недоступной картинкой');
  await editor(page).locator('p').last().click();
  failSlow = true;
  hits.length = 0;
  const src = `http://localhost:${IMG_PORT}/flaky.png`;
  await paste(page, { 'text/html': `<p>Текст</p><p><img src="${src}" alt="Недоступная"></p>`, 'text/plain': 'Текст' });

  const failed = page.getByRole('status').filter({ hasText: 'Изображение с другого сайта не скопировано — читатели его не увидят' });
  await expect(failed).toBeVisible({ timeout: 15_000 });
  await expect(failed).toContainText('По ссылке ничего не найдено');
  await expect(page.getByText(/оставленных внешними ссылками: 1 — сервер не смог их скопировать/)).toBeVisible();
  // the browser did not fetch it (CSP img-src 'self'): only the server tried
  expect(hits.every((h) => !h.browser)).toBe(true);
  expect(hits.length).toBeGreaterThanOrEqual(1);

  // The host recovers; «Повторить» copies it.
  failSlow = false;
  await failed.getByRole('button', { name: 'Повторить' }).click();
  await expect(editor(page).locator('.kb-image-block img')).toHaveAttribute('src', /^\/api\/v1\/attachments\/[0-9a-f-]{36}\/content/, { timeout: 15_000 });
  await expect(failed).toHaveCount(0);
  expect(hits.every((h) => !h.browser)).toBe(true);
  await ctx.close();
});
