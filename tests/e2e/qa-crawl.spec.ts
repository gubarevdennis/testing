import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { ensureOwner, newPage, api, expectSaved, OWNER } from './helpers';

/**
 * Runtime action inventory (QA26-01, QA26-04): visits every route as the organisation owner and records every rendered
 * control (button, link, menu item, text box, checkbox, switch, tab, combobox, option…) with its accessible name, also
 * inside each popup menu that a visible trigger opens. scripts/qa/inventory.ts merges the result into
 * docs/qa/action-inventory.yaml. Output: $QA_CRAWL_OUT (default test-results/qa/runtime-controls.json).
 *
 * The crawl also checks the R-UI-026 rule that no rendered control is anonymous: every button, link, menu item and
 * field exposes an accessible name.
 */
test.describe.configure({ mode: 'serial' });

const ROLES = 'button|link|menuitem|menuitemcheckbox|menuitemradio|textbox|searchbox|checkbox|switch|radio|tab|combobox|option|slider|spinbutton|treeitem';
const LINE = new RegExp(`^\\s*- (${ROLES})(?=[ :\\[]|$)(?: "((?:[^"\\\\]|\\\\.)*)")?`);

interface Control {
  route: string;
  role: string;
  name: string;
}
const controls: Control[] = [];
const unnamed: Array<{ route: string; role: string; line: string }> = [];
const data = new Set<string>([OWNER.name, OWNER.org, OWNER.email]);

async function record(page: Page, route: string, scope = page.locator('body')) {
  const snap = await scope.ariaSnapshot();
  for (const line of snap.split('\n')) {
    const m = LINE.exec(line);
    if (!m) continue;
    const name = (m[2] ?? '').replace(/\\"/g, '"').trim();
    // tree items are data (page titles); their actions are recorded through the row buttons and menus
    if (m[1] === 'treeitem') continue;
    if (!name) {
      // a text box named by its visible <label> shows as `textbox "…"`; an anonymous one has no name at all
      unnamed.push({ route, role: m[1], line: line.trim() });
      continue;
    }
    controls.push({ route, role: m[1], name });
  }
}

/** Opens each visible popup-menu trigger on the screen, records the menu's items and closes it again with Escape. */
async function recordMenus(page: Page, route: string) {
  const triggers = page.locator('[aria-haspopup="menu"]:visible');
  const n = Math.min(await triggers.count(), 25);
  for (let i = 0; i < n; i++) {
    const t = triggers.nth(i);
    if (!(await t.isVisible()) || !(await t.isEnabled())) continue;
    await t.click().catch(() => undefined);
    const menu = page.getByRole('menu').last();
    if (await menu.isVisible().catch(() => false)) await record(page, route, menu);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
  }
}

async function visit(page: Page, url: string, route: string, ready: () => Promise<void>) {
  await page.goto(url);
  await ready();
  await page.waitForTimeout(400); // lazy panels and counters settle
  await record(page, route);
  await recordMenus(page, route);
}

let pageId = '';
let spaceId = '';

test('QA26-04 seed: a space with a page, a comment thread and a trashed page', async ({ page }) => {
  await ensureOwner(page);
  const sp = await api(page, 'POST', '/api/v1/spaces', { name: 'Обход действий', kind: 'project', visibility: 'open' });
  spaceId = sp.space.id;
  pageId = await newPage(page, 'Страница обхода');
  await page.keyboard.type('Абзац страницы для обхода действий.');
  await expectSaved(page);
  const trashed = await api(page, 'POST', '/api/v1/pages', { spaceId, parentId: null, title: 'Удалённая для обхода', requestId: crypto.randomUUID() });
  await api(page, 'DELETE', `/api/v1/pages/${trashed.page?.id ?? trashed.id}`);
  for (const d of ['Обход действий', 'Страница обхода', 'Удалённая для обхода', 'Абзац страницы для обхода действий.']) data.add(d);
  // names that are data, not actions: spaces, built-in templates and their categories
  const spaces = await (await page.request.get('/api/v1/spaces')).json();
  for (const s of spaces.spaces ?? []) data.add(s.name);
  const templates = await (await page.request.get('/api/v1/templates')).json();
  for (const t of templates.templates ?? []) {
    data.add(t.name);
    if (t.category) data.add(t.category);
  }
});

const ROUTES: Array<{ route: string; url: () => string; ready: (p: Page) => Promise<void> }> = [
  { route: '/', url: () => '/', ready: (p) => expect(p.locator('main, #main').first()).toBeVisible() },
  { route: '/p/:pageId', url: () => '/p/' + pageId, ready: (p) => expect(p.locator('.kb-editor')).toBeVisible() },
  { route: '/p/:pageId/:slug', url: () => '/p/' + pageId + '/stranica-obhoda', ready: (p) => expect(p.locator('.kb-editor')).toBeVisible() },
  { route: '/s/:spaceId', url: () => '/s/' + spaceId, ready: (p) => expect(p.getByRole('heading', { name: 'Обход действий' }).first()).toBeVisible() },
  { route: '/s/:spaceId?tab=settings', url: () => '/s/' + spaceId + '?tab=settings', ready: (p) => expect(p.getByRole('heading', { name: 'Обход действий' }).first()).toBeVisible() },
  { route: '/search', url: () => '/search?q=обход', ready: (p) => expect(p.getByLabel('Поисковый запрос')).toBeVisible() },
  { route: '/trash', url: () => '/trash', ready: (p) => expect(p.getByText('Удалённая для обхода').first()).toBeVisible() },
  { route: '/templates', url: () => '/templates', ready: (p) => expect(p.getByRole('heading').first()).toBeVisible() },
  { route: '/import', url: () => '/import', ready: (p) => expect(p.getByRole('heading').first()).toBeVisible() },
  ...['profile', 'appearance', 'security', 'sessions', 'tokens'].map((t) => ({ route: '/settings/' + t, url: () => '/settings/' + t, ready: (p: Page) => expect(p.getByRole('heading').first()).toBeVisible() })),
  ...['users', 'groups', 'settings', 'audit', 'archives', 'health', 'expiring', 'access'].map((t) => ({ route: '/admin/' + t, url: () => '/admin/' + t, ready: (p: Page) => expect(p.getByRole('heading', { name: 'Администрирование' })).toBeVisible() })),
];

test('QA26-01, QA26-04, R-UI-026: every route rendered as owner exposes only named controls; runtime inventory recorded', async ({ page }) => {
  test.setTimeout(240_000);
  await ensureOwner(page);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const r of ROUTES) await visit(page, r.url(), r.route, () => r.ready(page));
  const out = process.env.QA_CRAWL_OUT ?? 'test-results/qa/runtime-controls.json';
  mkdirSync(dirname(out), { recursive: true });
  const uniq = [...new Map(controls.map((c) => [`${c.route}\u0000${c.role}\u0000${c.name}`, c])).values()];
  writeFileSync(out, JSON.stringify({ format: 'kb-qa-runtime/1', routes: ROUTES.map((r) => r.route), data: [...data].sort(), controls: uniq, unnamed }, null, 2) + '\n');
  expect(uniq.length).toBeGreaterThan(100);
  expect(errors, 'no uncaught errors while crawling').toEqual([]);
  expect(unnamed, 'every rendered control has an accessible name').toEqual([]);
});
