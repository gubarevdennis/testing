import { test, expect } from '@playwright/test';
import { ensureOwner, newPage, editor, expectSaved, apiContent } from './helpers';
import { startLatencyProbe, readLatency, stats, journal } from './perf-helpers';

/**
 * Long editing sessions: scripted typing with formatting toggles. The duration is configurable
 * (KB_LONG_SESSION_MIN, default 1 minute in CI; the 20-minute run required by UX13-09 is recorded in docs/PERFORMANCE.md).
 */
const MINUTES = Number(process.env.KB_LONG_SESSION_MIN ?? 1);
test.setTimeout((MINUTES + 4) * 60_000);

const MARKS = [
  { key: 'Control+b', tag: 'strong' },
  { key: 'Control+i', tag: 'em' },
  { key: 'Control+u', tag: 'u' },
] as const;

test('E2E-120, UX13-09: long session — 200 formatting toggles and continuous typing; exact final text, nothing lost, saved on the server', async ({ page }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Длинная сессия');
  const ed = editor(page);
  await expect(ed).toBeFocused();
  await startLatencyProbe(page);

  // 1) 200 fast formatting operations: 100 words, each wrapped in a toggle on + toggle off
  const expected: string[] = [];
  const formatted: Record<string, string[]> = { strong: [], em: [], u: [] };
  let toggles = 0;
  for (let k = 0; k < 100; k++) {
    const m = MARKS[k % 3];
    const word = `w${k}x`;
    await page.keyboard.press(m.key);
    await page.keyboard.type(word);
    await page.keyboard.press(m.key);
    toggles += 2;
    await page.keyboard.type(' ');
    expected.push(word + ' ');
    formatted[m.tag].push(word);
  }
  expect(toggles).toBe(200);
  await page.keyboard.press('Enter');

  // 2) continuous typing for the configured duration: one sentence per paragraph
  const until = Date.now() + MINUTES * 60_000;
  const sentences: string[] = [];
  for (let i = 0; Date.now() < until; i++) {
    const s = `Line ${i}: the warehouse shift accepts pallet ${i} and stores it in cell ${(i * 37) % 1000}.`;
    await page.keyboard.type(s, { delay: 20 });
    await page.keyboard.press('Enter');
    sentences.push(s);
  }
  const { samples, longTasks } = await readLatency(page);

  // exact text, in order, nothing duplicated or lost
  const first = ed.locator('p').first();
  await expect(first).toHaveText(expected.join('').trimEnd());
  for (const [tag, words] of Object.entries(formatted)) await expect(first.locator(tag)).toHaveText(words);
  const paras = await ed.locator('p').allTextContents();
  expect(paras.slice(1, 1 + sentences.length)).toEqual(sentences);

  const s = stats(samples);
  journal('long-session', { minutes: MINUTES, toggles, sentences: sentences.length, chars: sentences.join('').length, ...s, longTasksOver100ms: longTasks.filter((d) => d > 100).length, longTaskMax: Math.round(Math.max(0, ...longTasks)) });
  await expectSaved(page);
  const saved = JSON.stringify((await apiContent(page.request, id)).content);
  for (const line of [sentences[0], sentences[sentences.length - 1], 'w99x']) expect(saved).toContain(line);
  // reload: the server copy is what the user sees
  await page.reload();
  await expect(editor(page).locator('p').nth(sentences.length)).toHaveText(sentences[sentences.length - 1]);
});
