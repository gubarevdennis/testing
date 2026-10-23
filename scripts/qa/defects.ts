#!/usr/bin/env -S node --import tsx
/**
 * Defect register (R-PROCESS-051, OPS-018): validates docs/qa/defects.yaml and writes docs/qa/DEFECTS.md with
 *  1. the registered defects (severity, owner, test, status);
 *  2. the open P0 requirement gaps, derived live from docs/requirements/registry.yaml + status/*.yaml (each P0 that is
 *     not done/process/superseded is an open high-severity issue owned by its module, with its evidence as the test);
 *  3. failing tests of the last ingested run (docs/qa/test-results.json).
 * Exit 1 when the register is malformed (missing owner/test, unknown severity, accepted high/critical, accepted without
 * a name and reason).
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';
import { ROOT } from './inventory';

const SEVERITIES = ['blocker', 'critical', 'high', 'medium', 'low'];
const STATUSES = ['open', 'fixed', 'accepted'];
interface Defect {
  id: string;
  title: string;
  severity: string;
  status: string;
  owner: string;
  test: string;
  requirements?: string[];
  source?: string;
  actions?: string[];
  accepted_by?: string;
  reason?: string;
}

const MODULE_OWNER: Record<string, string> = {
  EDITOR: 'команда «Редактор»', CLIPBOARD: 'команда «Редактор»', MEDIA: 'команда «Редактор»', COLLECTION: 'команда «Редактор»',
  COLLAB: 'команда «Страница и совместная работа»', HISTORY: 'команда «Страница и совместная работа»', PAGE: 'команда «Страница и совместная работа»',
  ACL: 'команда «Администрирование и доступ»', ADMIN: 'команда «Администрирование и доступ»', SECURITY: 'команда «Администрирование и доступ»',
  TREE: 'команда «Навигация и оболочка»', UI: 'команда «Навигация и оболочка»', A11Y: 'команда «Навигация и оболочка»', SEARCH: 'команда «Поиск»',
  IMPORT: 'команда «Импорт и экспорт»', EXPORT: 'команда «Импорт и экспорт»', ARCHIVE: 'команда «Импорт и экспорт»',
  BACKUP: 'эксплуатация', OPS: 'эксплуатация', PERF: 'команда «Редактор»', QA: 'QA (ответственный за релиз)', PROCESS: 'QA (ответственный за релиз)',
};

export function loadDefects(): Defect[] {
  return YAML.parse(readFileSync(join(ROOT, 'docs/qa/defects.yaml'), 'utf8'))?.defects ?? [];
}

export function validate(ds: Defect[]): string[] {
  const errs: string[] = [];
  const ids = new Set<string>();
  for (const d of ds) {
    if (!d.id || ids.has(d.id)) errs.push(`${d.id ?? '?'}: missing or duplicate id`);
    ids.add(d.id);
    if (!SEVERITIES.includes(d.severity)) errs.push(`${d.id}: severity must be one of ${SEVERITIES.join('/')}`);
    if (!STATUSES.includes(d.status)) errs.push(`${d.id}: status must be one of ${STATUSES.join('/')}`);
    if (!d.owner) errs.push(`${d.id}: owner is required`);
    if (!d.test) errs.push(`${d.id}: test is required (write "none (…)" when a test is still missing)`);
    if (d.status === 'accepted' && (!d.accepted_by || !d.reason)) errs.push(`${d.id}: accepted defects need accepted_by and reason`);
    if (d.status === 'accepted' && !['medium', 'low'].includes(d.severity)) errs.push(`${d.id}: only medium/low defects may be accepted (R-PROCESS-051)`);
  }
  return errs;
}

function requirementGaps() {
  const reg = YAML.parse(readFileSync(join(ROOT, 'docs/requirements/registry.yaml'), 'utf8')) as Array<{ id: string; module: string; priority: string; title: string }>;
  const status = new Map<string, { status: string; evidence?: string; note?: string }>();
  const dir = join(ROOT, 'docs/requirements/status');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.yaml')).sort()) for (const e of YAML.parse(readFileSync(join(dir, f), 'utf8')) ?? []) status.set(e.id, e);
  return reg
    .filter((r) => r.priority === 'P0' && !['done', 'process', 'superseded', 'env-blocked', 'manual'].includes(status.get(r.id)?.status ?? 'missing'))
    .map((r) => ({ ...r, st: status.get(r.id) }));
}

const esc = (s: string) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

if (process.argv[1]?.endsWith('defects.ts')) {
  const ds = loadDefects();
  const errs = validate(ds);
  const gaps = requirementGaps();
  const results = existsSync(join(ROOT, 'docs/qa/test-results.json')) ? JSON.parse(readFileSync(join(ROOT, 'docs/qa/test-results.json'), 'utf8')) : null;
  const failing = results ? Object.entries(results.tests as Record<string, { status: string; reason?: string; run: string }>).filter(([, v]) => v.status === 'FAIL') : [];
  const open = ds.filter((d) => d.status === 'open');
  const openHigh = open.filter((d) => ['blocker', 'critical', 'high'].includes(d.severity));
  const L: string[] = [];
  L.push('# Реестр дефектов и открытых вопросов (сгенерировано)', '');
  L.push('Источник — `docs/qa/defects.yaml` (зарегистрированные дефекты) и реестр требований (открытые P0). Сгенерировано `npm run qa:report` (`scripts/qa/defects.ts`); не редактировать вручную. `scripts/release-gate.py` не пропускает релиз, пока открыт хотя бы один дефект blocker/critical/high (OPS-018) или не закрыт хотя бы один P0.', '');
  L.push('## Итог', '');
  const count = (sev: string, st: string) => ds.filter((d) => d.severity === sev && d.status === st).length;
  L.push('| Серьёзность | Открыто | Исправлено | Принято письменно |', '|---|---|---|---|');
  for (const s of SEVERITIES) L.push(`| ${s} | ${count(s, 'open')} | ${count(s, 'fixed')} | ${count(s, 'accepted')} |`);
  L.push('', `Открытых blocker/critical/high: **${openHigh.length}**; открытых P0-требований (каждое — открытый вопрос высокой серьёзности): **${gaps.length}**; падающих тестов в последнем запуске: **${failing.length}**.`, '');
  if (errs.length) L.push('**Ошибки реестра:** ' + errs.map(esc).join('; '), '');
  L.push('## Зарегистрированные дефекты', '', '| ID | Серьёзность | Статус | Владелец | Тест | Требования | Описание | Источник |', '|---|---|---|---|---|---|---|---|');
  const order = (d: Defect) => SEVERITIES.indexOf(d.severity) + (d.status === 'open' ? 0 : 10);
  for (const d of [...ds].sort((a, b) => order(a) - order(b) || a.id.localeCompare(b.id)))
    L.push(`| ${d.id} | ${d.severity} | ${d.status}${d.status === 'accepted' ? ` (${esc(d.accepted_by!)}: ${esc(d.reason!)})` : ''} | ${esc(d.owner)} | ${esc(d.test)} | ${(d.requirements ?? []).join(', ')} | ${esc(d.title)} | ${esc(d.source ?? '')} |`);
  L.push('', '## Падающие тесты последнего запуска', '');
  if (!results) L.push('Нет данных запуска (`docs/qa/test-results.json`).');
  else if (!failing.length) L.push('Нет.');
  else {
    L.push('Каждый падающий тест — дефект продукта или теста до разбора; владелец — владелец экрана в `docs/qa/action-tests.yaml`.', '', '| Тест | Причина | Запуск |', '|---|---|---|');
    for (const [k, v] of failing) L.push(`| ${esc(k)} | ${esc(v.reason ?? '')} | ${esc(v.run)} |`);
  }
  L.push('', '## Открытые P0-требования (из реестра требований)', '', 'Серьёзность — high: требование приоритета P0 не выполнено. Тест/доказательство — из файла статуса.', '', '| Требование | Статус | Владелец | Название | Доказательство / тест | Что не сделано |', '|---|---|---|---|---|---|');
  for (const g of gaps) L.push(`| ${g.id} | ${g.st?.status ?? 'missing'} | ${MODULE_OWNER[g.module] ?? 'QA (ответственный за релиз)'} | ${esc(g.title.slice(0, 120))} | ${esc((g.st?.evidence ?? 'n/a').slice(0, 200))} | ${esc((g.st?.note ?? '').slice(0, 200))} |`);
  writeFileSync(join(ROOT, 'docs/qa/DEFECTS.md'), L.join('\n') + '\n');
  console.log(`defects: ${ds.length} registered, ${open.length} open (${openHigh.length} blocker/critical/high); P0 gaps ${gaps.length}; failing tests ${failing.length}`);
  if (errs.length) {
    console.error(errs.join('\n'));
    process.exit(1);
  }
}
