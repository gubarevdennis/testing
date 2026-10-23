import { test, expect, request, type APIRequestContext } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { startIdp, type TestIdp } from '../support/oidc-idp';

/**
 * SEC-L3: browser SSO flow against a real OpenID Provider (panva/oidc-provider, tests/support/oidc-idp.ts).
 * Runs its own application instance with OIDC configured (port E2E_PORT+2, database <E2E_DB>_sso) next to the shared
 * E2E server, and the IdP on E2E_PORT+3: «Войти через корпоративный SSO» → IdP login page → back in the app, signed
 * in; logout ends the IdP session too; a refused login shows the reason on the login page.
 */
const BASE = Number(process.env.E2E_PORT ?? 8090);
const APP_PORT = BASE + 2;
const IDP_PORT = BASE + 3;
const APP = `http://127.0.0.1:${APP_PORT}`;
const DB = (process.env.E2E_DB ?? 'kb_e2e') + '_sso';
const ADMIN = process.env.TEST_ADMIN_DATABASE_URL ?? 'postgres://kb:kb@localhost:5432/postgres';
const SECRET = 'kb-e2e-client-secret-0123456789';

let server: ChildProcess | null = null;
let idp: TestIdp | null = null;
let api: APIRequestContext;
let output = '';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  const c = new pg.Client({ connectionString: ADMIN });
  await c.connect();
  await c.query(`drop database if exists ${DB} with (force)`);
  await c.query(`create database ${DB}`);
  await c.end();
  const data = resolve((process.env.E2E_DATA ?? '.e2e-data') + '-sso');
  rmSync(data, { recursive: true, force: true });
  mkdirSync(data, { recursive: true });
  const web = resolve(process.env.E2E_WEB ?? (existsSync('.e2e-web/index.html') ? '.e2e-web' : 'apps/web/dist'));
  cpSync(web, resolve(data, 'web'), { recursive: true });

  idp = await startIdp({
    port: IDP_PORT,
    clients: [{ client_id: 'kb', client_secret: SECRET, redirect_uris: [`${APP}/api/v1/auth/oidc/callback`], post_logout_redirect_uris: [`${APP}/`] }],
    accounts: [
      { sub: 'idp-maria', email: 'maria@corp.test', password: 'idp-pass-1', name: 'Мария Петрова', groups: ['Разработка'] },
      { sub: 'idp-stranger', email: 'stranger@corp.test', password: 'idp-pass-2', name: 'Посторонний' },
    ],
  });
  server = spawn(process.execPath, ['--import', 'tsx', '--conditions=development', 'apps/server/src/main.ts'], {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(APP_PORT),
      HOST: '127.0.0.1',
      PUBLIC_URL: APP,
      DATABASE_URL: ADMIN.replace(/\/[^/]*$/, '/' + DB),
      KB_DATA_DIR: data,
      WEB_DIST: resolve(data, 'web'),
      OCR_ENABLED: 'false',
      WORKER_ENABLED: 'false',
      LOG_LEVEL: 'warn',
      OIDC_ISSUER: idp.issuer,
      OIDC_CLIENT_ID: 'kb',
      OIDC_CLIENT_SECRET: SECRET,
      OIDC_SCOPES: 'openid email profile groups',
      OIDC_GROUPS_CLAIM: 'groups',
      OIDC_ALLOW_INSECURE_HTTP: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout!.on('data', (d) => (output += d));
  server.stderr!.on('data', (d) => (output += d));
  api = await request.newContext({ baseURL: APP });
  for (let i = 0; ; i++) {
    const ok = await api
      .get('/healthz')
      .then((r) => r.ok())
      .catch(() => false);
    if (ok) break;
    if (i > 240 || server.exitCode !== null) throw new Error('SSO app server did not start:\n' + output);
    await new Promise((r) => setTimeout(r, 250));
  }
  const setup = await api.post('/api/v1/setup', { data: { orgName: 'ООО «SSO»', ownerEmail: 'owner@corp.test', ownerName: 'Анна Владелец', password: 'Owner-password-1' } });
  expect(setup.ok()).toBe(true);
  const csrf = (await setup.json()).csrfToken;
  const headers = { 'x-csrf-token': csrf };
  expect((await api.post('/api/v1/admin/groups', { data: { name: 'Разработка', kind: 'group' }, headers })).ok()).toBe(true);
  expect((await api.post('/api/v1/admin/users', { data: { email: 'maria@corp.test', name: 'Мария (приглашена)', kind: 'employee', invite: true }, headers })).ok()).toBe(true);
});

test.afterAll(async () => {
  await api?.dispose();
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
    await new Promise((r) => server!.once('exit', r));
  }
  await idp?.close();
});

test('SEC-L3: «Войти через корпоративный SSO» → IdP login page → back signed in; logout also ends the IdP session', async ({ page }) => {
  await page.goto(APP + '/');
  await expect(page.getByRole('heading', { name: 'Вход в базу знаний' })).toBeVisible();
  await page.getByRole('link', { name: 'Войти через корпоративный SSO' }).click();

  await expect(page.getByRole('heading', { name: 'Тестовый IdP — вход' })).toBeVisible();
  expect(new URL(page.url()).origin).toBe(idp!.issuer);
  await page.getByLabel('Корпоративная почта').fill('maria@corp.test');
  await page.getByLabel('Пароль IdP').fill('idp-pass-1');
  await page.getByRole('button', { name: 'Войти в IdP' }).click();

  await expect(page.locator('.app-shell')).toBeVisible();
  expect(page.url()).toBe(APP + '/');
  const me = await page.evaluate(async () => (await fetch('/api/v1/auth/me')).json());
  expect(me.user.email).toBe('maria@corp.test');
  expect(me.user.status).toBe('active');

  // Logout: the app session ends and the browser goes through the IdP sign-out page and back.
  await page.getByTitle('Профиль и настройки').click();
  await page.getByRole('menuitem', { name: 'Выйти' }).click();
  await expect(page.getByRole('heading', { name: 'Выход из тестового IdP' })).toBeVisible();
  await page.getByRole('button', { name: 'Выйти из IdP' }).click();
  await expect(page.getByRole('heading', { name: 'Вход в базу знаний' })).toBeVisible();
  expect(page.url()).toBe(APP + '/');
  expect(idp!.logouts).toBe(1);

  // The IdP session is gone too: SSO asks for credentials again.
  await page.getByRole('link', { name: 'Войти через корпоративный SSO' }).click();
  await expect(page.getByRole('heading', { name: 'Тестовый IdP — вход' })).toBeVisible();
});

test('SEC-L3: a refused SSO login (no account in the knowledge base) returns to the login page with the reason', async ({ page }) => {
  await page.goto(APP + '/');
  await page.getByRole('link', { name: 'Войти через корпоративный SSO' }).click();
  await page.getByLabel('Корпоративная почта').fill('stranger@corp.test');
  await page.getByLabel('Пароль IdP').fill('idp-pass-2');
  await page.getByRole('button', { name: 'Войти в IdP' }).click();
  await expect(page.getByRole('heading', { name: 'Вход в базу знаний' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveText('Учётная запись не найдена. Обратитесь к администратору базы знаний.');
  expect(new URL(page.url()).search).toBe(''); // the reason code is removed from the address bar
});
