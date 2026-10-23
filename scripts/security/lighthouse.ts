// Lighthouse lab audit (R-SECURITY-004: Lighthouse/Web Vitals): login, home and a document page of the built web
// client, desktop and mobile presets, with the preinstalled Chromium. Starts a private server (port LH_PORT,
// default 4391, database kb_lh_<pid>) — see isolated-server.ts.
//
//   npm run perf:lighthouse            (needs a built client: .e2e-web or apps/web/dist; Lighthouse is fetched by npx,
//                                       pinned version, nothing is added to the lockfile)
//
// Output: test-results/perf/lighthouse/<page>-<preset>.json and test-results/perf/lighthouse-summary.json.
// Fails when a score is below the thresholds (LH_MIN_PERFORMANCE / LH_MIN_ACCESSIBILITY / LH_MIN_BEST_PRACTICES).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Api } from '../../tests/support/http-client.js';
import { startIsolatedServer } from './isolated-server.js';

const LIGHTHOUSE = 'lighthouse@13.5.0';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = resolve(root, 'test-results/perf/lighthouse');
const min = {
  performance: Number(process.env.LH_MIN_PERFORMANCE ?? 0.8),
  accessibility: Number(process.env.LH_MIN_ACCESSIBILITY ?? 0.9),
  'best-practices': Number(process.env.LH_MIN_BEST_PRACTICES ?? 0.9),
};

function chromePath(): string {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
  const dir = existsSync(base) ? readdirSync(base).find((d) => d.startsWith('chromium-')) : undefined;
  const p = dir ? join(base, dir, 'chrome-linux', 'chrome') : '';
  if (!p || !existsSync(p)) throw new Error('Chromium not found: set CHROME_PATH or PLAYWRIGHT_BROWSERS_PATH');
  return p;
}

const srv = await startIsolatedServer({ port: Number(process.env.LH_PORT ?? 4391), dbPrefix: 'kb_lh', env: { RATE_LIMIT_PER_MINUTE: '100000', AUTH_RATE_LIMIT_PER_MINUTE: '1000' } });
let code = 1;
try {
  if (!srv.webSrc) throw new Error('no built web client (.e2e-web or apps/web/dist) — run `npm run build -w @kb/web` first');
  // Realistic content: an imported document with headings, lists, a table and a code block.
  const owner = new Api(srv.base);
  const r = await owner.post('/api/v1/setup', { orgName: 'Lighthouse', ownerEmail: 'owner@lh.test', ownerName: 'Владелец', password: 'Lighthouse-owner-1' });
  owner.csrf = r.csrfToken;
  const general = (await owner.get('/api/v1/spaces')).spaces.find((s: any) => s.kind === 'org').id;
  const md = ['# Регламент работы с базой знаний', '', ...Array.from({ length: 12 }, (_, i) => [`## Раздел ${i + 1}`, '', 'Текст раздела с **выделением**, _курсивом_ и [ссылкой](https://example.com). '.repeat(6), '', '- пункт один', '- пункт два', '- пункт три', '', '| Колонка | Значение |', '|---|---|', '| a | 1 |', '| b | 2 |', '', '```js', 'const x = 1;', '```', ''].join('\n'))].join('\n');
  const fd = new FormData();
  fd.append('file', new Blob([md]), 'регламент.md');
  const imp = await owner.req('POST', '/api/v1/imports', fd);
  for (let i = 0; i < 300; i++) {
    const j = await owner.get(`/api/v1/imports/${imp.jobId}`);
    if (!['queued', 'running'].includes(j.status)) break;
    await new Promise((res) => setTimeout(res, 100));
  }
  const pageId = (await owner.post(`/api/v1/imports/${imp.jobId}/commit`, { target: { spaceId: general, parentId: null } })).pages[0].id;
  const cookie = owner.cookieHeader();

  const targets = [
    { name: 'login', url: srv.base + '/', cookie: null },
    { name: 'home', url: srv.base + '/', cookie },
    { name: 'page', url: `${srv.base}/p/${pageId}`, cookie },
  ];
  mkdirSync(outDir, { recursive: true });
  const rows: any[] = [];
  const failures: string[] = [];
  for (const t of targets) {
    for (const preset of ['desktop', 'mobile'] as const) {
      const out = join(outDir, `${t.name}-${preset}.json`);
      const args = ['-y', LIGHTHOUSE, t.url, '--quiet', '--output=json', `--output-path=${out}`, '--only-categories=performance,accessibility,best-practices', '--chrome-flags=--headless=new --no-sandbox'];
      if (preset === 'desktop') args.push('--preset=desktop');
      if (t.cookie) args.push(`--extra-headers=${JSON.stringify({ Cookie: t.cookie })}`);
      // Lab runs occasionally lose the trace (NO_NAVSTART) in headless containers: retry a couple of times.
      let lhr: any = null;
      for (let attempt = 1; attempt <= 3 && !lhr; attempt++) {
        try {
          execFileSync('npx', args, { cwd: root, stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env, CHROME_PATH: chromePath() }, timeout: 180_000 });
          lhr = JSON.parse(readFileSync(out, 'utf8'));
        } catch (e) {
          if (attempt === 3) throw e;
          console.warn(`${t.name}/${preset}: attempt ${attempt} failed, retrying`);
        }
      }
      const a = (id: string) => lhr.audits[id]?.numericValue ?? null;
      const row = {
        page: t.name,
        preset,
        finalUrl: lhr.finalDisplayedUrl,
        scores: Object.fromEntries(Object.entries<any>(lhr.categories).map(([k, v]) => [k, v.score])),
        metrics: { fcpMs: a('first-contentful-paint'), lcpMs: a('largest-contentful-paint'), cls: a('cumulative-layout-shift'), tbtMs: a('total-blocking-time'), speedIndexMs: a('speed-index'), ttiMs: a('interactive') },
        failedA11yAudits: Object.values<any>(lhr.audits).filter((x) => lhr.categories.accessibility.auditRefs.some((ref: any) => ref.id === x.id && ref.weight > 0) && x.score !== null && x.score < 1).map((x) => x.id),
        runtimeError: lhr.runtimeError?.code ?? null,
      };
      rows.push(row);
      for (const [k, v] of Object.entries(min)) if ((row.scores[k] ?? 0) < v) failures.push(`${t.name}/${preset}: ${k} ${row.scores[k]} < ${v}`);
      console.log(`${t.name.padEnd(6)} ${preset.padEnd(8)} ${Object.entries(row.scores).map(([k, v]) => `${k}=${v}`).join(' ')}  LCP=${Math.round(row.metrics.lcpMs)}ms CLS=${row.metrics.cls?.toFixed(3)} TBT=${Math.round(row.metrics.tbtMs)}ms`);
    }
  }
  const summary = { tool: LIGHTHOUSE, chromium: chromePath(), generatedAt: new Date().toISOString(), thresholds: min, results: rows, failures };
  writeFileSync(resolve(root, 'test-results/perf/lighthouse-summary.json'), JSON.stringify(summary, null, 2));
  if (failures.length) console.error('Below thresholds:\n  ' + failures.join('\n  '));
  code = failures.length ? 1 : 0;
} catch (e) {
  console.error(e);
} finally {
  await srv.stop();
}
process.exit(code);
