#!/usr/bin/env node
// Dependency scan gate (R-SECURITY-004) over `npm audit`.
//   * production dependencies: any high/critical advisory fails (cannot be allow-listed);
//     moderate/low must be listed in scripts/security/audit-allowlist.json with a reason;
//   * dev dependencies (never shipped — the image runs `npm prune --omit=dev`): every advisory of
//     moderate or higher must be listed, so nothing is silently accepted;
//   * an allow-list entry past its `expires` date fails the gate (forces a re-review).
// Report: test-results/security/dependency-audit.json.   Usage: npm run security:deps [-- --offline-ok]
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const allow = JSON.parse(readFileSync(resolve(root, 'scripts/security/audit-allowlist.json'), 'utf8')).advisories;
const RANK = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };

function audit(extra) {
  let out;
  try {
    out = execFileSync('npm', ['audit', '--json', ...extra], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    out = e.stdout; // npm audit exits 1 when vulnerabilities exist
  }
  const data = JSON.parse(out || '{}');
  if (data.error) throw new Error(`npm audit failed: ${data.error.summary ?? JSON.stringify(data.error)}`);
  const adv = new Map();
  for (const v of Object.values(data.vulnerabilities ?? {}))
    for (const via of v.via) if (typeof via === 'object') adv.set(via.url.split('/').pop(), { id: via.url.split('/').pop(), package: via.name, severity: via.severity, title: via.title, url: via.url, range: via.range });
  return adv;
}

let prod, all;
try {
  prod = audit(['--omit=dev']);
  all = audit([]);
} catch (e) {
  console.error(String(e.message ?? e));
  // Without registry access the scan cannot be performed: fail unless explicitly tolerated (local offline runs).
  process.exit(process.argv.includes('--offline-ok') ? 0 : 2);
}

const today = new Date().toISOString().slice(0, 10);
const problems = [];
const rows = [];
for (const [id, a] of all) {
  const scope = prod.has(id) ? 'prod' : 'dev';
  const entry = allow.find((x) => x.id === id);
  let verdict = 'ok';
  if (scope === 'prod' && RANK[a.severity] >= RANK.high) verdict = 'blocked: production high/critical';
  else if (RANK[a.severity] >= (scope === 'prod' ? RANK.low : RANK.moderate) && !entry) verdict = 'blocked: not reviewed (add to audit-allowlist.json with a reason, or upgrade)';
  else if (entry && entry.expires < today) verdict = `blocked: allow-list entry expired ${entry.expires}`;
  else if (entry) verdict = 'accepted';
  rows.push({ ...a, scope, verdict, reason: entry?.reason ?? null, expires: entry?.expires ?? null });
  if (verdict.startsWith('blocked')) problems.push(`${id} ${a.package} (${scope}, ${a.severity}): ${verdict}`);
}
const stale = allow.filter((x) => !all.has(x.id)).map((x) => x.id);
const summary = (scope) => Object.fromEntries(Object.keys(RANK).map((s) => [s, rows.filter((r) => r.scope === scope && r.severity === s).length]));
const report = { generatedAt: new Date().toISOString(), production: summary('prod'), dev: summary('dev'), advisories: rows, staleAllowListEntries: stale, problems };
const out = resolve(root, 'test-results/security/dependency-audit.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(report, null, 2));

console.log(`Dependency audit: production ${JSON.stringify(report.production)}, dev ${JSON.stringify(report.dev)} → ${relative(root, out)}`);
for (const r of rows) console.log(`  [${r.verdict}] ${r.id} ${r.package} ${r.scope} ${r.severity} — ${r.title}`);
if (stale.length) console.log(`  allow-list entries no longer reported (remove them): ${stale.join(', ')}`);
if (problems.length) {
  console.error(`FAILED:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
