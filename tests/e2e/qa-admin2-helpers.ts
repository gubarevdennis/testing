import { expect, type Page } from '@playwright/test';
import { call } from './qa-admin-helpers';

/**
 * Helpers of the second administration/pages QA wave (tests/e2e/qa-admin2-*.spec.ts): clipboard access, organisation
 * fixtures through the API, a download's text.
 */

/** Lets the page use the clipboard (navigator.clipboard.writeText/readText). */
export async function allowClipboard(page: Page) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(page.url()).origin });
}

/** Text currently in the clipboard. */
export const clipboardText = (page: Page) => page.evaluate(() => navigator.clipboard.readText());

/** Makes navigator.clipboard.writeText fail (a browser that refuses clipboard access). */
export async function breakClipboard(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('denied')), readText: () => Promise.reject(new Error('denied')) } });
  });
}

export async function createGroup(page: Page, name: string, kind: 'department' | 'group' = 'department', parentId?: string) {
  return (await call<{ group: { id: string } }>(page, 'POST', '/api/v1/admin/groups', { name, kind, ...(parentId ? { parentId } : {}) })).group.id;
}

export async function addMember(page: Page, groupId: string, userId: string, role: 'member' | 'manager' = 'member') {
  await call(page, 'PUT', `/api/v1/admin/groups/${groupId}/members/${userId}`, { role });
}

export async function createSpace(page: Page, name: string, extra: Record<string, unknown> = {}) {
  return (await call<{ space: { id: string } }>(page, 'POST', '/api/v1/spaces', { name, kind: 'project', visibility: 'private', ...extra })).space.id;
}

export async function createPageIn(page: Page, spaceId: string, title: string, parentId?: string) {
  const r = await call<{ page: { id: string } }>(page, 'POST', '/api/v1/pages', { spaceId, title, ...(parentId ? { parentId } : {}) });
  return r.page.id;
}

/** Waits for a download started by `action` and returns its file name and text. */
export async function downloadText(page: Page, action: () => Promise<unknown>) {
  const [d] = await Promise.all([page.waitForEvent('download'), action()]);
  const path = await d.path();
  expect(path).toBeTruthy();
  const { readFileSync } = await import('node:fs');
  return { name: d.suggestedFilename(), text: readFileSync(path!, 'utf8') };
}
