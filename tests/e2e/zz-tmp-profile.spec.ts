import { test } from '@playwright/test';
import { ensureOwner, newPage } from './helpers';
import { para } from './perf-helpers';
test.setTimeout(600_000);
test('profile setContent', async ({ page }) => {
  await ensureOwner(page);
  await page.evaluate(() => localStorage.setItem('kb:debug', '1'));
  for (const n of [250, 500, 1000]) {
    await newPage(page, 'Профиль ' + n);
    await page.waitForFunction(() => (window as any).__kbEditor);
    const content = Array.from({ length: n }, (_, i) => para(i, 3));
    const cdp = await page.context().newCDPSession(page);
    const prof = n === 1000;
    if (prof) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start'); }
    const ms = await page.evaluate((c) => { const t = performance.now(); (window as any).__kbEditor.commands.setContent({ type: 'doc', content: c }); return performance.now() - t; }, content as any);
    const settle = await page.evaluate(() => new Promise<number>((r) => { const t = performance.now(); setTimeout(() => requestAnimationFrame(() => r(performance.now() - t)), 0); }));
    console.log(`n=${n} setContent=${ms.toFixed(0)}ms settle=${settle.toFixed(0)}ms`);
    if (prof) {
      const { profile } = await cdp.send('Profiler.stop');
      const byId = new Map(profile.nodes.map((x: any) => [x.id, x]));
      const parent = new Map<number, number>();
      for (const x of profile.nodes as any[]) for (const c of x.children ?? []) parent.set(c, x.id);
      const incl = new Map<string, number>(); const self = new Map<string, number>();
      profile.samples.forEach((id: number, i: number) => { const d = profile.timeDeltas[i] ?? 0; const seen = new Set<string>(); let cur: number | undefined = id; let first = true; while (cur !== undefined) { const x: any = byId.get(cur); const k = `${x.callFrame.functionName || '(anon)'} ${x.callFrame.url.split('/').pop()}:${x.callFrame.lineNumber}`; if (first) { self.set(k, (self.get(k) ?? 0) + d); first = false; } if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) ?? 0) + d); } cur = parent.get(cur); } });
      console.log('SELF\n' + [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${(v / 1000).toFixed(0)}ms ${k}`).join('\n'));
      console.log('INCL\n' + [...incl.entries()].sort((a, b) => b[1] - a[1]).slice(0, 70).map(([k, v]) => `${(v / 1000).toFixed(0)}ms ${k}`).join('\n'));
    }
  }
});
