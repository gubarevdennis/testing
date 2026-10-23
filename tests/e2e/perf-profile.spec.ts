import { test, expect } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { ensureOwner, newPage, editor, caretToEnd } from './helpers';
import { md, importMarkdown, spaceOf, para, heading, table, startLatencyProbe, readLatency, stats, journal } from './perf-helpers';

/**
 * Profiling aid (not a regression test; runs only with KB_PERF_PROFILE=1): records a CDP CPU profile while typing in a
 * large document and prints the functions with the most self time. Used to find per-keystroke work (docs/PERFORMANCE.md).
 * Build the client without minification for readable names: npm run build -w @kb/web -- --minify false --outDir …
 */
test.skip(process.env.KB_PERF_PROFILE !== '1', 'profiling aid: KB_PERF_PROFILE=1');
test.setTimeout(600_000);

const BLOCKS = Number(process.env.KB_PERF_BLOCKS ?? 700);

test('profile typing', async ({ page }) => {
  // which React components render while typing (a minimal DevTools hook: fibers that performed work in a commit)
  await page.addInitScript(() => {
    const w = window as any;
    w.__kbRenders = {};
    w.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true,
      renderers: new Map(),
      inject() {
        return 1;
      },
      onCommitFiberRoot(_id: number, root: any) {
        w.__kbSeen ??= new WeakMap();
        if (!w.__kbCount) {
          // remember the tree's state before measuring
          const mark = (f: any) => {
            for (let c = f; c; c = c.sibling) {
              w.__kbSeen.set(c, { p: c.memoizedProps, s: c.memoizedState });
              if (c.child) mark(c.child);
            }
          };
          mark(root.current);
          return;
        }
        const nm = (c: any) => c.type?.displayName || c.type?.name || c.type?.render?.name || '?';
        const isComp = (c: any) => c.tag === 0 || c.tag === 1 || c.tag === 11 || c.tag === 15;
        const walk = (f: any, parentWorked: boolean, chain: string) => {
          for (let c = f; c; c = c.sibling) {
            let worked = parentWorked;
            let ch = chain;
            if (isComp(c)) {
              const prev = w.__kbSeen.get(c) ?? (c.alternate && w.__kbSeen.get(c.alternate));
              worked = !prev || prev.p !== c.memoizedProps || prev.s !== c.memoizedState;
              w.__kbSeen.set(c, { p: c.memoizedProps, s: c.memoizedState });
              ch = chain.split(' > ').slice(-3).concat(nm(c)).join(' > ');
              if (worked) {
                w.__kbRenders[nm(c)] = (w.__kbRenders[nm(c)] ?? 0) + 1;
                // a render that did not come from the parent re-rendering: the origin of an update
                if (!parentWorked) w.__kbRenders['ORIGIN ' + ch] = (w.__kbRenders['ORIGIN ' + ch] ?? 0) + 1;
              }
            }
            if (c.child) walk(c.child, worked, ch);
          }
        };
        walk(root.current, false, '');
      },
      onCommitFiberUnmount() {},
      onPostCommitFiberRoot() {},
      checkDCE() {},
    };
  });
  await ensureOwner(page);
  await page.evaluate(() => localStorage.setItem('kb:debug', '1'));
  const content: unknown[] = [];
  for (let i = 0; content.length < BLOCKS; i++) {
    if (BLOCKS >= 5000 && i === 2500) content.push(table(200, 4));
    else if (i % 12 === 0) content.push(heading(i / 12));
    else content.push(para(i, BLOCKS >= 5000 ? 3 : 16));
  }
  const scratch = await newPage(page, 'prof');
  const id = await importMarkdown(page.request, await spaceOf(page.request, scratch), 'prof.md', md(content as any[]));
  await page.goto('/p/' + id);
  await expect(editor(page)).toBeVisible({ timeout: 120_000 });
  await page.waitForFunction(() => (window as any).__kbEditor, undefined, { timeout: 120_000 });
  const n = Math.floor(BLOCKS * 0.43);
  const target = editor(page).locator('p', { hasText: new RegExp(`^П${n} `) });
  await target.scrollIntoViewIfNeeded();
  await caretToEnd(page, target);
  await page.waitForTimeout(1500);
  if (process.env.KB_PERF_IDENTITY === '1') {
    // how many top-level nodes each transaction replaces (identity), and where the transactions come from
    await page.evaluate(() => {
      const w = window as any;
      w.__kbTr = [];
      w.__kbEditor.on('transaction', ({ transaction: tr }: any) => {
        if (!tr.docChanged) return;
        let fresh = 0;
        const a = tr.before;
        const b = tr.doc;
        for (let i = 0; i < b.childCount; i++) if (i >= a.childCount || a.child(i) !== b.child(i)) fresh++;
        const metas = Object.keys(tr.meta ?? {}).join(',');
        w.__kbTr.push(`${fresh} steps=${tr.steps.map((s: any) => s.constructor.name).join('+')} meta=${metas}`);
      });
    });
  }
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
  await cdp.send('Profiler.start');
  await startLatencyProbe(page);
  await page.evaluate(() => ((window as any).__kbCount = true));
  await page.keyboard.type('the quick brown fox jumps over the lazy dog '.repeat(3), { delay: 100 });
  const { samples } = await readLatency(page);
  const { profile } = (await cdp.send('Profiler.stop')) as any;
  const s = stats(samples);
  journal('profile-typing', { blocks: BLOCKS, ...s });
  mkdirSync('test-results/perf', { recursive: true });
  writeFileSync(`test-results/perf/typing-${BLOCKS}.cpuprofile`, JSON.stringify(profile));
  // self time per function
  const self = new Map<string, number>();
  const byId = new Map<number, any>(profile.nodes.map((nd: any) => [nd.id, nd]));
  const dt: number[] = profile.timeDeltas;
  const total = new Map<number, number>();
  profile.samples.forEach((sid: number, i: number) => total.set(sid, (total.get(sid) ?? 0) + (dt[i] ?? 0) / 1000));
  for (const [sid, ms] of total) {
    const nd = byId.get(sid);
    const f = nd.callFrame;
    const key = `${f.functionName || '(anon)'} ${String(f.url).split('/').pop()}:${f.lineNumber}`;
    self.set(key, (self.get(key) ?? 0) + ms);
  }
  // inclusive time per function (each sample counted once per distinct function on its stack)
  const parent = new Map<number, number>();
  profile.nodes.forEach((nd: any) => (nd.children ?? []).forEach((c: number) => parent.set(c, nd.id)));
  const incl = new Map<string, number>();
  for (const [sid, ms] of total) {
    const seen = new Set<string>();
    for (let cur: number | undefined = sid; cur != null; cur = parent.get(cur)) {
      const f = byId.get(cur).callFrame;
      const key = `${f.functionName || '(anon)'} ${String(f.url).split('/').pop()}:${f.lineNumber}`;
      if (seen.has(key)) continue;
      seen.add(key);
      incl.set(key, (incl.get(key) ?? 0) + ms);
    }
  }
  const top = (m: Map<string, number>, k: number) => [...m].sort((a, b) => b[1] - a[1]).slice(0, k).map(([name, ms]) => `${ms.toFixed(1).padStart(8)} ms  ${name}`).join('\n');
  console.log('latency', JSON.stringify(s));
  if (process.env.KB_PERF_IDENTITY === '1') console.log('--- transactions\n' + (await page.evaluate(() => (window as any).__kbTr.slice(0, 40).join('\n'))));
  const renders = await page.evaluate(() => (window as any).__kbRenders);
  console.log('--- React renders while typing\n' + Object.entries(renders as Record<string, number>).sort((a, b) => b[1] - a[1]).slice(0, 60).map(([k, v]) => `${String(v).padStart(6)}  ${k}`).join('\n'));
  console.log('--- self\n' + top(self, 40));
  console.log('--- inclusive\n' + top(incl, 70));
});
