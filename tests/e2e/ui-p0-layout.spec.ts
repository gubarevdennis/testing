import { test, expect, type Page } from '@playwright/test';
import { ensureOwner, newPage, editor, expectSaved, paste, treeLink } from './helpers';

/**
 * Layout stability and integrity: cumulative layout shift (CLS) while a page opens and while typing, and a geometric
 * check that every visible control is really reachable — not covered by another element, not clipped by its container,
 * not pushed out of the viewport — at 320–1920 px, light and dark themes, and at real 200 % browser zoom.
 */
test.describe.configure({ mode: 'serial' });

let pageId = '';

/** Collects layout shifts not caused by recent input (the CLS definition) from the very start of the document. */
async function observeShifts(page: Page) {
  await page.addInitScript(() => {
    const w = window as any;
    w.__kbShifts = [];
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as any[]) {
          if (e.hadRecentInput) continue;
          w.__kbShifts.push({ value: e.value, at: Math.round(e.startTime), nodes: (e.sources ?? []).map((s: any) => (s.node instanceof Element ? s.node.className || s.node.tagName : String(s.node?.nodeName))).slice(0, 3) });
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {
      /* not supported */
    }
  });
}

async function cls(page: Page) {
  return page.evaluate(() => {
    const shifts = ((window as any).__kbShifts ?? []) as Array<{ value: number; at: number; nodes: string[] }>;
    return { total: shifts.reduce((a, s) => a + s.value, 0), shifts };
  });
}

/**
 * Returns the problems found among visible interactive elements:
 *  - covered: the centre of the visible part hits another element (overlap);
 *  - offscreen: the element sticks out of the viewport horizontally;
 *  - clipped: text content is cut off by the element's own box without an ellipsis.
 */
async function layoutProblems(page: Page) {
  return page.evaluate(() => {
    const out: string[] = [];
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const describe = (el: Element) => {
      const label = el.getAttribute('aria-label') || (el.textContent ?? '').trim().slice(0, 30) || el.getAttribute('title') || '';
      return `${el.tagName.toLowerCase()}.${String((el as HTMLElement).className || '').split(' ')[0]}[${label}]`;
    };
    // behind an open modal layer (mobile drawer, dialog) the page is intentionally covered: check the layer only
    const layers = [...document.querySelectorAll<HTMLElement>('.drawer, [role=dialog][aria-modal=true]')];
    const root: ParentNode = layers.length ? layers[layers.length - 1] : document;
    const controls = [...root.querySelectorAll<HTMLElement>('button, a[href], input:not([type=hidden]), select, textarea, [role=treeitem] > a, [role=tab], [role=menuitem]')];
    for (const el of controls) {
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
      if (el.closest('[aria-hidden=true], .skip-link, .sr-only')) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      // visible part = intersection with every clipping ancestor and the viewport
      let left = r.left, top = r.top, right = r.right, bottom = r.bottom;
      let skip = false;
      let hScroller = false;
      for (let a = el.parentElement; a; a = a.parentElement) {
        const acs = getComputedStyle(a);
        if (Number(acs.opacity) === 0) skip = true;
        if (/(auto|scroll)/.test(acs.overflowX) && a.scrollWidth > a.clientWidth) hScroller = true;
        if (/(hidden|auto|scroll|clip)/.test(acs.overflowX + acs.overflowY)) {
          const ar = a.getBoundingClientRect();
          left = Math.max(left, ar.left); top = Math.max(top, ar.top); right = Math.min(right, ar.right); bottom = Math.min(bottom, ar.bottom);
        }
      }
      if (skip) continue;
      left = Math.max(left, 0); top = Math.max(top, 0); right = Math.min(right, vw); bottom = Math.min(bottom, vh);
      const visW = right - left, visH = bottom - top;
      if (visW <= 0 || visH <= 0) continue; // scrolled away inside a list or below the fold: not a defect
      // a control whose visible part is cut horizontally by the viewport is a defect (vertical cuts are just scrolling)
      if (!hScroller && (r.left < -1 || r.right > vw + 1)) out.push(`offscreen ${describe(el)} x=${Math.round(r.left)}..${Math.round(r.right)} vw=${vw}`);
      if (visW * visH < 0.5 * r.width * r.height) continue; // mostly scrolled out of its container
      const cx = left + visW / 2, cy = top + visH / 2;
      const hit = document.elementFromPoint(cx, cy);
      // dismissible floating overlays (toasts, the onboarding hint card) may sit above content by design
      if (hit && hit !== el && !el.contains(hit) && !hit.contains(el) && !hit.closest('.tooltip, .toasts, .onboarding-hint')) {
        // labels and wrappers that forward clicks to the control are fine
        const lbl = hit.closest('label');
        if (!(lbl && (lbl.contains(el) || (el.id && lbl.htmlFor === el.id)))) out.push(`covered ${describe(el)} by ${describe(hit)}`);
      }
      if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA' && el.tagName !== 'SELECT' && (cs.overflow === 'hidden' || cs.overflowX === 'hidden') && el.scrollWidth > el.clientWidth + 2) {
        const ell = [el, ...el.querySelectorAll('*')].some((x) => getComputedStyle(x).textOverflow === 'ellipsis');
        if (!ell) out.push(`clipped ${describe(el)} scrollWidth=${el.scrollWidth} clientWidth=${el.clientWidth}`);
      }
    }
    return [...new Set(out)];
  });
}

test('prepare a page with headings, long words, a list and a table', async ({ page }) => {
  await ensureOwner(page);
  pageId = await newPage(page, 'Макет: проверка перекрытий и сдвигов');
  await page.keyboard.type('## Порядок приёмки');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Длинное слово: высокопроизводительныйраспределительныйцентрприёмкиипереработкитоваров без пробелов.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('- первый пункт');
  await page.keyboard.press('Enter');
  await page.keyboard.type('второй пункт');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await paste(page, { 'text/plain': 'Этап\tОтветственный\tСрок\nПриёмка\tКладовщик\t2 часа\nРазмещение\tОператор\t4 часа\n' });
  await expectSaved(page);
});

test('R-UI-006, R-UI-040: opening a page and typing cause no layout shift (CLS < 0.02)', async ({ page }) => {
  await observeShifts(page);
  await ensureOwner(page);
  await page.goto('/p/' + pageId);
  await expect(editor(page).locator('table')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500); // late fonts, presence, sync status
  const open = await cls(page);
  // typing: shifts right after input are excluded by definition, so also watch for shifts later than 500 ms after a key
  await editor(page).locator('p', { hasText: 'Длинное слово' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Дописанный текст без скачков.', { delay: 30 });
  await expectSaved(page);
  await page.waitForTimeout(1000);
  const after = await cls(page);
  console.log(`CLS on open=${open.total.toFixed(4)} total=${after.total.toFixed(4)} shifts=${JSON.stringify(after.shifts.slice(0, 5))}`);
  expect(open.total, JSON.stringify(open.shifts)).toBeLessThan(0.02);
  expect(after.total, JSON.stringify(after.shifts)).toBeLessThan(0.02);
});

test('R-UI-006: switching pages, opening and closing the side panel cause no layout shift', async ({ page }) => {
  await observeShifts(page);
  await ensureOwner(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  const home = await cls(page);
  // the home screen is reported, not asserted: its lists replace skeletons of a different height (known, see docs/PERFORMANCE.md)
  test.info().annotations.push({ type: 'cls', description: `home load CLS=${home.total.toFixed(4)}` });
  expect(home.total).toBeLessThan(0.1); // Web Vitals "good"
  await page.evaluate(() => ((window as any).__kbShifts = []));
  await (await treeLink(page, /Макет: проверка перекрытий/)).click();
  await expect(editor(page).locator('table')).toBeVisible();
  await page.waitForTimeout(1000);
  await page.locator('.page-header-bar').getByRole('button', { name: 'Комментарии' }).click();
  await expect(page.getByRole('complementary', { name: 'Боковая панель' })).toBeVisible();
  await page.waitForTimeout(800);
  await page.locator('.page-header-bar').getByRole('button', { name: 'Комментарии' }).click();
  await expect(page.getByRole('complementary', { name: 'Боковая панель' })).toBeHidden();
  await page.waitForTimeout(800);
  const c = await cls(page);
  expect(c.total, JSON.stringify(c.shifts)).toBeLessThan(0.02);
});

const WIDTHS = [320, 375, 768, 1024, 1440, 1920];
const PATHS = () => ['/', '/p/' + pageId, '/search?q=приёмки', '/templates', '/trash', '/settings'];

for (const theme of ['light', 'dark'] as const) {
  test(`R-UI-006, V17-F09: no overlapping, clipped or off-screen controls at 320–1920 px (${theme})`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.addInitScript((t) => localStorage.setItem('kb:theme', JSON.stringify(t)), theme);
    await ensureOwner(page);
    const problems: string[] = [];
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: w < 800 ? 760 : 900 });
      for (const path of PATHS()) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(300);
        for (const p of await layoutProblems(page)) problems.push(`${w}px ${path}: ${p}`);
      }
      // the mobile drawer must not overlap itself either
      if (w < 861) {
        await page.goto('/p/' + pageId);
        await page.getByRole('button', { name: 'Показать боковую панель' }).click();
        await expect(page.getByRole('navigation', { name: 'Навигация' })).toBeVisible();
        await page.waitForTimeout(300);
        for (const p of await layoutProblems(page)) problems.push(`${w}px drawer: ${p}`);
      }
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });
}

test('V18-A18, AT-81: real 200 % zoom (DPR 2, 640×400 CSS px) — no overlaps or clipped controls', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await ensureOwner(page);
  const problems: string[] = [];
  for (const path of PATHS()) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(300);
    for (const p of await layoutProblems(page)) problems.push(`${path}: ${p}`);
  }
  await ctx.close();
  expect(problems, problems.join('\n')).toEqual([]);
});
