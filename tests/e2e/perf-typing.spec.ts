import { test, expect, type Page } from '@playwright/test';
import { ensureOwner, newPage, editor, expectSaved, apiContent, caretToEnd } from './helpers';
import { md, importMarkdown, spaceOf, para, heading, table, countWords, startLatencyProbe, readLatency, stats, journal, throttleCpu, caret, expectBudget } from './perf-helpers';

/**
 * Typing latency and input integrity on large documents (docs/PERFORMANCE.md has the method and recorded numbers).
 * Budgets (SPECIFICATION §… "Ввод: p95 ≤ 50 мс, p99 ≤ 100 мс для обычной статьи 10 тыс. слов"), CPU slowed down 4× via CDP.
 */
test.describe.configure({ mode: 'serial' });
test.setTimeout(300_000);

const CPU_RATE = Number(process.env.KB_PERF_CPU_RATE ?? 4);
/**
 * Latency budgets are asserted only on a calibrated machine (KB_PERF_ENFORCE=1): on a shared, overloaded CI container the
 * numbers measure the neighbours, not the editor. Integrity (every character arrives, caret does not jump) is always asserted,
 * and every run is journaled to test-results/perf/results.jsonl.
 */
const ENFORCE = process.env.KB_PERF_ENFORCE === '1';

function budget(name: string, s: ReturnType<typeof stats>, p95: number, p99: number) {
  expect(s.n, `${name}: sample count`).toBeGreaterThanOrEqual(200);
  const ok = s.p95 <= p95 && s.p99 <= p99;
  test.info().annotations.push({ type: 'perf', description: `${name}: p50=${s.p50} p95=${s.p95} p99=${s.p99} ms (budget p95<=${p95}, p99<=${p99}: ${ok ? 'met' : 'NOT met'})` });
  if (ENFORCE) expectBudget(name, s, p95, p99);
}
const SAMPLES = Number(process.env.KB_PERF_SAMPLES ?? 240);
// 100 ms between keys ≈ 10 characters per second (a fast typist, ~120 words per minute)
const TYPING_DELAY = Number(process.env.KB_PERF_TYPING_DELAY ?? 100);

/** Seeds the document through the Markdown import (server side) and opens it, like a user opening a big page. */
async function prepare(page: Page, title: string, content: unknown[]) {
  await ensureOwner(page);
  await page.evaluate(() => localStorage.setItem('kb:debug', '1'));
  const scratch = await newPage(page, title + ' (черновик)');
  const id = await importMarkdown(page.request, await spaceOf(page.request, scratch), title + '.md', md(content as any[]));
  const t0 = Date.now();
  await page.goto('/p/' + id);
  await expect(editor(page)).toBeVisible({ timeout: 120_000 });
  await page.waitForFunction(() => (window as any).__kbEditor, undefined, { timeout: 120_000 });
  journal('open-imported-page', { title, blocks: content.length, ms: Date.now() - t0 });
  return id;
}

/** Types `text` (ASCII, so every character produces a keydown) with a human-like pause between keys. */
async function typeMeasured(page: Page, text: string, delay = TYPING_DELAY) {
  await startLatencyProbe(page);
  await page.keyboard.type(text, { delay });
  return readLatency(page);
}

function typingText(n: number) {
  const base = 'the quick brown fox jumps over the lazy dog 0123456789 ';
  let s = '';
  while (s.length < n) s += base;
  return s.slice(0, n - 1) + 'Z';
}

test('R-PERF-008, AT-84: typing in a 10 000-word article with CPU throttled 4x — 240 samples, p95/p99 journaled against 50/100 ms, no lost characters', async ({ page }) => {
  const content: unknown[] = [];
  for (let i = 0; content.length < 700; i++) {
    if (i % 12 === 0) content.push(heading(i / 12));
    content.push(para(i, 16));
  }
  const words = countWords(content);
  expect(words).toBeGreaterThanOrEqual(10_000);
  const id = await prepare(page, 'Статья 10 тыс. слов', content);
  // caret into the middle of the article
  const target = editor(page).locator('p', { hasText: /^П300 / });
  await caretToEnd(page, target);
  const before = (await target.textContent())!;
  const top0 = await target.evaluate((e) => e.getBoundingClientRect().top);
  const cdp = await throttleCpu(page, CPU_RATE);
  const text = typingText(SAMPLES);
  const { samples, longTasks } = await typeMeasured(page, text);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const s = stats(samples);
  journal('typing-10k-words', { cpuRate: CPU_RATE, words, blocks: content.length, ...s, longTasksOver100ms: longTasks.filter((d) => d > 100).length });
  // integrity: every character arrived, in order, caret stayed at the end of the typed text, no scroll jump
  await expect(target).toHaveText(before + text);
  const c = await caret(page);
  expect(c.block).toBe(before + text);
  expect(c.offset).toBe(c.nodeText.length);
  const top1 = await target.evaluate((e) => e.getBoundingClientRect().top);
  expect(Math.abs(top1 - top0)).toBeLessThan(40);
  budget('10k words, CPU x' + CPU_RATE, s, 50, 100);
  await expectSaved(page);
  expect(JSON.stringify((await apiContent(page.request, id)).content)).toContain(text);
});

test('SC-04: 5 000 blocks and a long table: typing keeps the caret in place and loses no characters', async ({ page }) => {
  const content: unknown[] = [];
  for (let i = 0; content.length < 5_000; i++) {
    if (i === 2_500) content.push(table(200, 4));
    else content.push(i % 50 === 0 ? heading(i / 50) : para(i, 3));
  }
  expect(content.length).toBe(5_000);
  const id = await prepare(page, '5000 блоков', content);
  const blocks = await editor(page).evaluate((e) => e.children.length);
  expect(blocks).toBeGreaterThanOrEqual(5_000);

  // 1) a paragraph deep in the document
  const p = editor(page).locator('p', { hasText: /^П4001 / });
  await p.scrollIntoViewIfNeeded();
  await caretToEnd(page, p);
  const before = (await p.textContent())!;
  const top0 = await p.evaluate((e) => e.getBoundingClientRect().top);
  const text = typingText(SAMPLES);
  const r1 = await typeMeasured(page, text);
  await expect(p).toHaveText(before + text);
  const c1 = await caret(page);
  expect(c1.block).toBe(before + text);
  expect(c1.offset).toBe(c1.nodeText.length);
  expect(Math.abs((await p.evaluate((e) => e.getBoundingClientRect().top)) - top0)).toBeLessThan(40);

  // 2) a cell in the middle of the 200-row table
  const cell = editor(page).locator('td', { hasText: /^R120C2 / });
  await cell.scrollIntoViewIfNeeded();
  await caretToEnd(page, cell);
  const cellBefore = (await cell.textContent())!;
  const cellText = typingText(80);
  const r2 = await typeMeasured(page, cellText);
  await expect(cell).toHaveText(cellBefore + cellText);
  const c2 = await caret(page);
  expect(c2.block).toBe(cellBefore + cellText);
  expect(editor(page).locator('table tr')).toHaveCount(200);

  const s1 = stats(r1.samples);
  const s2 = stats(r2.samples);
  journal('typing-5000-blocks', { cpuRate: 1, blocks, paragraph: s1, tableCell: s2 });
  expect(s1.n).toBeGreaterThanOrEqual(200);
  await expectSaved(page);
  const saved = JSON.stringify((await apiContent(page.request, id)).content);
  expect(saved).toContain(text);
  expect(saved).toContain(cellText);
});

test('R-PERF-013: typing starts no animations on document content (input latency journaled)', async ({ page }) => {
  const content: unknown[] = [];
  for (let i = 0; i < 200; i++) content.push(para(i, 12));
  await prepare(page, 'Анимации и ввод', content);
  const p = editor(page).locator('p', { hasText: /^П100 / });
  await caretToEnd(page, p);
  await page.evaluate(() => {
    const w = window as any;
    w.__kbAnim = [];
    document.addEventListener('animationstart', (e) => (e.target as Element).closest('.kb-editor') && w.__kbAnim.push((e as AnimationEvent).animationName), true);
    document.addEventListener('transitionrun', (e) => (e.target as Element).closest('.kb-editor') && w.__kbAnim.push((e as TransitionEvent).propertyName), true);
  });
  const { samples } = await typeMeasured(page, typingText(200));
  const running = await page.evaluate(() => document.getAnimations().filter((a) => ((a.effect as KeyframeEffect)?.target as Element | null)?.closest?.('.kb-editor')).length);
  const started = await page.evaluate(() => (window as any).__kbAnim as string[]);
  const s = stats(samples);
  journal('typing-animations', { started: started.length, running, ...s });
  expect(started, 'animations/transitions started inside the document while typing').toEqual([]);
  expect(running).toBe(0);
  budget('typing next to chrome animations', s, 50, 100);
});
