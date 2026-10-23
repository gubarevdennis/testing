#!/usr/bin/env node
// Static application security testing (R-SECURITY-004): runs the SAST rule set from scripts/security/sast-rules.js
// over the shipped sources, offline (eslint-plugin-security, eslint-plugin-no-unsanitized, core eval rules).
// Fails on any finding and on any inline suppression of a SAST rule without a written reason (`-- reason`).
// Report: test-results/security/sast-report.json.   Usage: npm run security:sast
import { ESLint } from 'eslint';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCTION_SOURCES, SAST_RULE_PREFIXES } from './sast-rules.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const isSast = (rule) => !!rule && SAST_RULE_PREFIXES.some((p) => rule === p || rule.startsWith(p));

const eslint = new ESLint({ cwd: root, errorOnUnmatchedPattern: false });
const results = await eslint.lintFiles(PRODUCTION_SOURCES);

const findings = [];
const suppressions = [];
const DIRECTIVE = /eslint-disable(?:-next-line|-line)?\s+([^\n*]*?)(?:\s+--\s*(.*?))?\s*(?:\*\/|$)/;
for (const r of results) {
  const file = relative(root, r.filePath);
  for (const m of r.messages) if (isSast(m.ruleId)) findings.push({ file, line: m.line, rule: m.ruleId, message: m.message });
  const lines = readFileSync(r.filePath, 'utf8').split('\n');
  lines.forEach((text, i) => {
    const d = DIRECTIVE.exec(text);
    if (!d) return;
    const rules = d[1].split(',').map((x) => x.trim()).filter(Boolean);
    if (!rules.some(isSast)) return;
    suppressions.push({ file, line: i + 1, rules, reason: d[2] ?? null });
  });
}
const unjustified = suppressions.filter((s) => !s.reason);
const report = { tool: 'eslint-plugin-security + eslint-plugin-no-unsanitized + core eval rules', scannedFiles: results.length, generatedAt: new Date().toISOString(), findings, suppressions, unjustified };
const out = resolve(root, 'test-results/security/sast-report.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(report, null, 2));

console.log(`SAST: ${results.length} files, ${findings.length} findings, ${suppressions.length} justified suppressions, ${unjustified.length} without a reason → ${relative(root, out)}`);
for (const f of findings) console.log(`  ${f.file}:${f.line}  ${f.rule}  ${f.message}`);
for (const s of unjustified) console.log(`  ${s.file}:${s.line}  suppression of ${s.rules.join(', ')} without "-- reason"`);
process.exit(findings.length || unjustified.length ? 1 : 0);
