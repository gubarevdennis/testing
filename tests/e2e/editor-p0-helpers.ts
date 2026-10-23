import { test, type Page } from '@playwright/test';
import { newPage as createPage } from './helpers';

/**
 * Pages created by the editor-p0 specs are moved to the trash after each test: the sidebar tree is virtualised and
 * does not scroll to a new page, so dozens of leftover pages would hide the rows that later specs look for.
 */
const created: string[] = [];

export async function newPage(page: Page, title: string) {
  const id = await createPage(page, title);
  created.push(id);
  return id;
}

export function cleanupCreatedPages() {
  test.afterEach(async ({ page }) => {
    const csrf = (await page.context().storageState()).cookies.find((c) => c.name === 'kb_csrf')?.value ?? '';
    while (created.length) {
      const id = created.pop()!;
      await page.context().request.delete(`/api/v1/pages/${id}`, { headers: { 'x-csrf-token': csrf } }).catch(() => undefined);
    }
  });
}

/**
 * Lets the editor read a selection the browser changed natively (click, arrows, Home/End): selectionchange is delivered
 * asynchronously, and synthetic key presses come faster than any person types.
 */
export const settle = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))));
