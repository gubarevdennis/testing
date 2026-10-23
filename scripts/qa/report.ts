#!/usr/bin/env -S node --import tsx
/**
 * Run-result ingestion (QA26-27): converts Playwright JSON and vitest JSON reports into one per-test status table
 * PASS / FAIL / BLOCKED / N/A with reason, run reference and build version (git sha), and merges it into
 * docs/qa/test-results.json. Tests of earlier ingested runs keep their last status with their own run reference; tests
 * that never ran are reported as BLOCKED by the matrix generators.
 *
 * Usage: node --import tsx scripts/qa/report.ts [--playwright <file>]… [--vitest <file>]… [--reset]
 *   defaults: every test-results/qa/playwright*.json and test-results/qa/vitest*.json
 * Produce the inputs with:
 *   PLAYWRIGHT_JSON_OUTPUT_NAME=test-results/qa/playwright.json npx playwright test --reporter=list,json
 *   npx vitest run --project unit --project integration --reporter=default --reporter=json --outputFile.json=test-results/qa/vitest.json
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative, resolve, isAbsolute } from 'node:path';
import { ROOT } from './inventory';

export type Status = 'PASS' | 'FAIL' | 'BLOCKED' | 'N/A';
interface Entry {
  status: Status;
  reason?: string;
  run: string;
  durationMs?: number;
  project?: string;
}
interface Run {
  id: string;
  suite: 'e2e' | 'vitest';
  source: string;
  startedAt: string;
  sha: string;
  dirty: boolean;
  link: string;
  counts: Record<Status, number>;
}
const OUT = join(ROOT, 'docs/qa/test-results.json');

function git(args: string[]): string {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}
const sha = process.env.QA_BUILD_SHA ?? (git(['rev-parse', 'HEAD']) || 'unknown');
const dirty = process.env.QA_BUILD_SHA ? false : git(['status', '--porcelain', '--untracked-files=no']) !== '';

function link(source: string, startedAt: string) {
  const { GITHUB_SERVER_URL: s, GITHUB_REPOSITORY: r, GITHUB_RUN_ID: id } = process.env;
  return s && r && id ? `${s}/${r}/actions/runs/${id}` : `local:${source}@${startedAt}`;
}

const firstLine = (s: string | undefined) => (s ?? '').replace(/\u001b\[[0-9;]*m/g, '').split('\n').find((l) => l.trim())?.trim().slice(0, 300);

function playwright(file: string, tests: Record<string, Entry>): Run {
  const j = JSON.parse(readFileSync(file, 'utf8'));
  const testDir = j.config?.rootDir ?? join(ROOT, 'tests/e2e');
  const startedAt = j.stats?.startTime ?? statSync(file).mtime.toISOString();
  const source = relative(ROOT, file);
  const runId = `e2e@${startedAt}`;
  const counts: Record<Status, number> = { PASS: 0, FAIL: 0, BLOCKED: 0, 'N/A': 0 };
  const walkSuite = (s: any, titles: string[], fileRel: string) => {
    const f = s.file ? relative(ROOT, isAbsolute(s.file) ? s.file : join(testDir, s.file)).replace(/\\/g, '/') : fileRel;
    const isFile = s.file && s.title === s.file;
    const t2 = isFile || !s.title ? titles : [...titles, s.title];
    for (const spec of s.specs ?? []) {
      const key = `${f} › ${[...t2, spec.title].join(' › ')}`;
      for (const t of spec.tests ?? []) {
        const last = t.results?.[t.results.length - 1];
        const skip = (t.annotations ?? []).find((a: any) => a.type === 'skip' || a.type === 'fixme');
        let e: Entry;
        if (!last || last.status === 'skipped' || t.status === 'skipped')
          e = skip?.description ? { status: 'N/A', reason: skip.description, run: runId } : { status: 'BLOCKED', reason: 'skipped (not executed: serial group stopped earlier or skipped without reason)', run: runId };
        else if (last.status === 'passed') e = { status: 'PASS', run: runId, durationMs: last.duration };
        else e = { status: 'FAIL', reason: firstLine(last.error?.message ?? last.errors?.[0]?.message) ?? last.status, run: runId, durationMs: last.duration };
        e.project = t.projectName;
        // several projects (desktop/mobile) of one test: FAIL wins, then PASS
        const prev = tests[key];
        if (prev && prev.run === runId && (prev.status === 'FAIL' || (prev.status === 'PASS' && e.status !== 'FAIL'))) continue;
        tests[key] = e;
      }
    }
    for (const c of s.suites ?? []) walkSuite(c, t2, f);
  };
  for (const s of j.suites ?? []) walkSuite(s, [], '');
  for (const e of Object.values(tests)) if (e.run === runId) counts[e.status]++;
  return { id: runId, suite: 'e2e', source, startedAt, sha, dirty, link: link(source, startedAt), counts };
}

function vitest(file: string, tests: Record<string, Entry>): Run {
  const j = JSON.parse(readFileSync(file, 'utf8'));
  const startedAt = j.startTime ? new Date(j.startTime).toISOString() : statSync(file).mtime.toISOString();
  const source = relative(ROOT, file);
  const runId = `vitest@${startedAt}`;
  const counts: Record<Status, number> = { PASS: 0, FAIL: 0, BLOCKED: 0, 'N/A': 0 };
  for (const tr of j.testResults ?? []) {
    const f = relative(ROOT, tr.name).replace(/\\/g, '/');
    for (const a of tr.assertionResults ?? []) {
      const key = `${f} › ${[...(a.ancestorTitles ?? []), a.title].join(' › ')}`;
      let e: Entry;
      if (a.status === 'passed') e = { status: 'PASS', run: runId, durationMs: a.duration };
      else if (a.status === 'failed') e = { status: 'FAIL', reason: firstLine(a.failureMessages?.[0]) ?? 'failed', run: runId, durationMs: a.duration };
      else if (a.status === 'todo') e = { status: 'N/A', reason: 'todo', run: runId };
      else e = { status: 'BLOCKED', reason: `skipped (${a.status})`, run: runId };
      tests[key] = e;
      counts[e.status]++;
    }
    // a file that failed to load has no assertions: mark it so the gap is visible
    if (!(tr.assertionResults ?? []).length && tr.status === 'failed') {
      tests[`${f} › (file)`] = { status: 'FAIL', reason: firstLine(tr.message) ?? 'test file failed to run', run: runId };
      counts.FAIL++;
    }
  }
  return { id: runId, suite: 'vitest', source, startedAt, sha, dirty, link: link(source, startedAt), counts };
}

function defaults(prefix: string): string[] {
  const dir = join(ROOT, 'test-results/qa');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.startsWith(prefix) && f.endsWith('.json')).map((f) => join(dir, f));
}

const args = process.argv.slice(2);
const pw: string[] = [];
const vt: string[] = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--playwright') pw.push(resolve(args[++i]));
  else if (args[i] === '--vitest') vt.push(resolve(args[++i]));
}
if (!pw.length && !vt.length) (pw.push(...defaults('playwright')), vt.push(...defaults('vitest')));

const prev = existsSync(OUT) && !args.includes('--reset') ? JSON.parse(readFileSync(OUT, 'utf8')) : { runs: [], tests: {} };
const tests: Record<string, Entry> = prev.tests;
const runs: Run[] = prev.runs;
for (const f of pw) runs.push(playwright(f, tests));
for (const f of vt) runs.push(vitest(f, tests));
// keep only runs still referenced by a test
const used = new Set(Object.values(tests).map((t) => t.run));
const keptRuns = [...new Map(runs.filter((r) => used.has(r.id)).map((r) => [r.id, r])).values()].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
const latest = keptRuns[keptRuns.length - 1];
const out = {
  format: 'kb-qa-results/1',
  build: latest ? { sha: latest.sha, dirty: latest.dirty } : { sha, dirty },
  generatedAt: new Date().toISOString(),
  runs: keptRuns,
  totals: Object.values(tests).reduce((acc: Record<string, number>, t) => ((acc[t.status] = (acc[t.status] ?? 0) + 1), acc), {}),
  tests: Object.fromEntries(Object.entries(tests).sort(([a], [b]) => a.localeCompare(b))),
};
writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
console.log(`ingested ${pw.length} playwright + ${vt.length} vitest report(s); tests with status: ${Object.keys(tests).length}`, out.totals);
