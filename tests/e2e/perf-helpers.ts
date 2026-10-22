import { expect, type Page, type APIRequestContext } from '@playwright/test';
import { mkdirSync, appendFileSync } from 'node:fs';

/**
 * Helpers for browser performance tests (perf-*.spec.ts).
 *
 * Input latency is measured per keystroke as "event timestamp → first frame after the change": a capturing keydown
 * listener takes the event's platform timestamp (it includes time spent queued behind a busy main thread), then waits
 * for the next animation frame and a message-channel task (≈ after paint). This approximates "time until the character
 * is visible" and is the same quantity the Event Timing API reports as event duration.
 */

export function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i];
}

export function stats(samples: number[]) {
  const s = [...samples].sort((a, b) => a - b);
  const r = (x: number) => Math.round(x * 10) / 10;
  return { n: s.length, p50: r(percentile(s, 50)), p95: r(percentile(s, 95)), p99: r(percentile(s, 99)), max: r(s[s.length - 1] ?? NaN) };
}

/** Appends one measurement record to test-results/perf/results.jsonl (the run journal referenced from docs/PERFORMANCE.md). */
export function journal(name: string, data: Record<string, unknown>) {
  mkdirSync('test-results/perf', { recursive: true });
  appendFileSync('test-results/perf/results.jsonl', JSON.stringify({ at: new Date().toISOString(), name, ...data }) + '\n');
  console.log(`[perf] ${name} ${JSON.stringify(data)}`);
}

/** CPU throttling through the Chrome DevTools Protocol (rate 4 = four times slower than the host). */
export async function throttleCpu(page: Page, rate: number) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  return cdp;
}

/** Replaces the document through the editor instance exposed with localStorage['kb:debug'] = '1'. */
export async function setDoc(page: Page, content: unknown[]) {
  await page.waitForFunction(() => (window as any).__kbEditor);
  await page.evaluate((c) => (window as any).__kbEditor.commands.setContent({ type: 'doc', content: c }), content as any);
}

const WORDS = 'склад приёмка размещение отгрузка инвентаризация товар смена кладовщик оператор паллета стеллаж ячейка накладная поставщик партия маркировка'.split(' ');

/** A paragraph with exactly `n` words (deterministic). */
export function para(i: number, n: number) {
  const w: string[] = [];
  for (let k = 0; k < n; k++) w.push(WORDS[(i * 7 + k * 3) % WORDS.length]);
  return { type: 'paragraph', content: [{ type: 'text', text: `П${i} ` + w.join(' ') + '.' }] };
}

export function heading(i: number) {
  return { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: `Раздел ${i}` }] };
}

export function table(rows: number, cols: number) {
  const cell = (t: string, header = false) => ({ type: header ? 'tableHeader' : 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });
  const out = [];
  for (let r = 0; r < rows; r++) {
    const cells = [];
    for (let c = 0; c < cols; c++) cells.push(cell(r === 0 ? `Колонка ${c + 1}` : `R${r}C${c + 1} ${WORDS[(r + c) % WORDS.length]}`, r === 0));
    out.push({ type: 'tableRow', content: cells });
  }
  return { type: 'table', content: out };
}

export function countWords(content: any[]): number {
  let n = 0;
  const walk = (node: any) => {
    if (node.text) n += node.text.split(/\s+/).filter(Boolean).length;
    (node.content ?? []).forEach(walk);
  };
  content.forEach(walk);
  return n;
}

/** Installs the keystroke latency probe (idempotent) and clears previous samples. */
export async function startLatencyProbe(page: Page) {
  await page.evaluate(() => {
    const w = window as any;
    w.__kbLat = [];
    w.__kbLongTasks = [];
    if (w.__kbProbe) return;
    w.__kbProbe = true;
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.key.length !== 1 || e.ctrlKey || e.metaKey) return;
        const t0 = e.timeStamp;
        requestAnimationFrame(() => {
          const ch = new MessageChannel();
          ch.port1.onmessage = () => w.__kbLat.push(performance.now() - t0);
          ch.port2.postMessage(0);
        });
      },
      true,
    );
    try {
      new PerformanceObserver((l) => l.getEntries().forEach((e) => w.__kbLongTasks.push(e.duration))).observe({ type: 'longtask', buffered: false });
    } catch {
      /* longtask timing not supported */
    }
  });
}

export async function readLatency(page: Page): Promise<{ samples: number[]; longTasks: number[] }> {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 50))));
  return page.evaluate(() => ({ samples: (window as any).__kbLat as number[], longTasks: (window as any).__kbLongTasks as number[] }));
}

/** Text of the block with the given index among the editor's top-level children. */
export async function blockText(page: Page, selector: string) {
  return page.locator('.kb-editor').locator(selector).first().evaluate((e) => e.textContent ?? '');
}

/** Caret position as {text of the caret's block, offset inside that text node}. */
export async function caret(page: Page) {
  return page.evaluate(() => {
    const s = window.getSelection()!;
    const block = (s.anchorNode instanceof Element ? s.anchorNode : s.anchorNode?.parentElement)?.closest('p, td, th, h1, h2, h3, li');
    return { block: block?.textContent ?? null, offset: s.anchorOffset, nodeText: s.anchorNode?.textContent ?? '' };
  });
}

export function expectBudget(name: string, s: ReturnType<typeof stats>, p95: number, p99: number) {
  expect(s.n, `${name}: sample count`).toBeGreaterThanOrEqual(200);
  expect(s.p95, `${name}: p95 ${s.p95} ms`).toBeLessThanOrEqual(p95);
  expect(s.p99, `${name}: p99 ${s.p99} ms`).toBeLessThanOrEqual(p99);
}

/** Markdown with the same blocks as para()/heading()/table() — documents are seeded through the import pipeline (server side). */
export function md(content: any[]): string {
  const text = (n: any): string => (n.text ?? '') + (n.content ?? []).map(text).join('');
  return content
    .map((b) => {
      if (b.type === 'heading') return '#'.repeat(b.attrs.level) + ' ' + text(b);
      if (b.type === 'table') {
        const rows = b.content.map((r: any) => '| ' + r.content.map((c: any) => text(c)).join(' | ') + ' |');
        return [rows[0], '|' + rows[0].split('|').slice(1, -1).map(() => ' --- |').join(''), ...rows.slice(1)].join('\n');
      }
      return text(b);
    })
    .join('\n\n');
}

async function csrfOf(request: APIRequestContext) {
  return (await request.storageState()).cookies.find((c) => c.name === 'kb_csrf')?.value ?? '';
}

/** Imports a Markdown file as a new page in the given space and returns the page id (upload → analysis → commit). */
export async function importMarkdown(request: APIRequestContext, spaceId: string, filename: string, markdown: string): Promise<string> {
  const headers = { 'x-csrf-token': await csrfOf(request) };
  const up = await request.post('/api/v1/imports', { headers, multipart: { file: { name: filename, mimeType: 'text/markdown', buffer: Buffer.from(markdown, 'utf8') } } });
  expect(up.ok(), await up.text()).toBeTruthy();
  const { jobId } = await up.json();
  await expect
    .poll(async () => (await (await request.get(`/api/v1/imports/${jobId}`)).json()).status, { timeout: 120_000, intervals: [250, 500, 1000] })
    .toBe('awaiting_confirmation');
  const c = await request.post(`/api/v1/imports/${jobId}/commit`, { headers, data: { target: { spaceId, parentId: null } } });
  expect(c.ok(), await c.text()).toBeTruthy();
  const r = await c.json();
  return (r.rootPageId ?? r.pages[0].id) as string;
}

/** Id of the signed-in user's personal space (the space of a freshly created page). */
export async function spaceOf(request: APIRequestContext, pageId: string): Promise<string> {
  const r = await request.get(`/api/v1/pages/${pageId}`);
  expect(r.ok()).toBeTruthy();
  const j = await r.json();
  return (j.page?.spaceId ?? j.spaceId) as string;
}
