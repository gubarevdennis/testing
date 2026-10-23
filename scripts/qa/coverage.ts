#!/usr/bin/env -S node --import tsx
/**
 * Action × test × state matrix (QA26-03, R-QA-002, R-QA-004, R-QA-006, R-QA-029, R-UI-026, R-UI-061).
 *
 * Inputs:  docs/qa/action-inventory.yaml (scripts/qa/inventory.ts), tests/** (scripts/qa/tests-index.ts),
 *          docs/qa/action-tests.yaml (explicit mapping, N/A, critical overrides), docs/qa/test-results.json
 *          (scripts/qa/report.ts: last PASS/FAIL/BLOCKED/N/A per test), docs/qa/defects.yaml.
 * Outputs: docs/qa/action-matrix.json  — one record per action (QA26-03 fields) + summary, read by scripts/release-gate.py
 *          docs/qa/ACTION_MATRIX.md    — readable matrix, uncovered actions listed explicitly
 *          docs/qa/OPERATION_CONTRACT.md — per operation: empty/success/loading/cancel/error/no permission/offline/… with tests
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';
import { ROOT, loadInventory, labelPattern, norm, DYN, DYN_RE, type Action, type Kind } from './inventory';
import { indexTests, type TestCase, type Ref } from './tests-index';

interface Mapping {
  action: string;
  tests?: Array<{ test: string; states?: string[] }>;
  na?: Record<string, string>;
  note?: string;
}
interface MappingFile {
  states: string[];
  na_by_kind: Record<string, Record<string, string>>;
  owners: Record<string, string>;
  critical: { add: string[]; remove: string[] };
  mappings: Mapping[];
}
interface Result {
  status: 'PASS' | 'FAIL' | 'BLOCKED' | 'N/A';
  reason?: string;
  run?: string;
}
interface Results {
  build: { sha: string; dirty: boolean };
  generatedAt: string;
  runs: Array<{ suite: string; source: string; startedAt: string; link: string }>;
  tests: Record<string, Result>;
}

const MAP_FILE = join(ROOT, 'docs/qa/action-tests.yaml');
const RESULTS = join(ROOT, 'docs/qa/test-results.json');
const DEFECTS = join(ROOT, 'docs/qa/defects.yaml');
const OUT_JSON = join(ROOT, 'docs/qa/action-matrix.json');
const OUT_MD = join(ROOT, 'docs/qa/ACTION_MATRIX.md');
const OUT_CONTRACT = join(ROOT, 'docs/qa/OPERATION_CONTRACT.md');

/** Which inventory kinds an ARIA role in getByRole() can address. Roles not listed are context (heading, table…). */
const ROLE_KINDS: Record<string, Kind[]> = {
  button: ['button', 'toggle', 'menu', 'toast-action', 'runtime', 'tab'],
  menuitem: ['menu-item', 'command', 'option', 'runtime'],
  menuitemcheckbox: ['menu-item', 'option', 'runtime'],
  menuitemradio: ['menu-item', 'option', 'runtime'],
  option: ['command', 'option', 'menu-item', 'runtime'],
  link: ['link', 'route', 'menu-item', 'runtime', 'toast-action'],
  textbox: ['input', 'runtime'],
  searchbox: ['input', 'runtime'],
  combobox: ['select', 'input', 'runtime'],
  spinbutton: ['input', 'runtime'],
  checkbox: ['toggle', 'runtime'],
  switch: ['toggle', 'runtime'],
  radio: ['toggle', 'option', 'runtime', 'button'],
  tab: ['tab', 'button', 'link', 'runtime'],
  dialog: ['dialog'],
  alertdialog: ['dialog'],
  menu: ['menu'],
};

const lower = (s: string) => norm(s).toLowerCase();
const sample = (label: string) => label.replace(DYN_RE, 'Тест');

function candidates(ref: Ref, actions: Action[]): Action[] {
  if (ref.kind !== 'name' || (!ref.value && !ref.regex)) return [];
  const kinds = ref.role ? ROLE_KINDS[ref.role] : null;
  if (ref.role && !kinds) return [];
  const pool = kinds ? actions.filter((a) => kinds.includes(a.kind) && (a.kind !== 'runtime' || !ref.role || a.component === ref.role || kinds.includes('runtime'))) : actions.filter((a) => a.kind !== 'route');
  const names = (a: Action) => (a.kind === 'route' ? a.aliases ?? [] : [a.label, ...(a.aliases ?? [])]);
  if (ref.regex) {
    const [src, flags] = ref.regex.split('\u0000');
    let re: RegExp;
    try {
      re = new RegExp(src, flags.replace(/[gy]/g, ''));
    } catch {
      return [];
    }
    // a regex that only anchors on a few characters (e.g. /^Да$/) is precise; one like /./ matches everything — skip
    if (src.replace(/[\\^$.*+?()[\]{}|]/g, '').length < 2) return [];
    return pool.filter((a) => names(a).some((n) => re.test(sample(n))));
  }
  const v = lower(ref.value);
  if (v.length < 2 || v === DYN) return [];
  if (v.includes(DYN)) {
    const p = labelPattern(ref.value);
    return pool.filter((a) => names(a).some((n) => p.test(sample(n))));
  }
  const exact = pool.filter((a) => names(a).some((n) => (n.includes(DYN) ? labelPattern(n).test(ref.value) : lower(n) === v)));
  if (exact.length || ref.exact) return exact;
  if (v.length < 4) return [];
  return pool.filter((a) => names(a).some((n) => lower(n.replace(DYN_RE, ' ')).includes(v)));
}

/** Slash-menu query typed in the editor → the command the palette ranks first (same order as filterCommands). */
function slashCommand(query: string, commands: Action[]): Action | undefined {
  const q = query.toLowerCase();
  if (!q) return undefined;
  return (
    commands.find((c) => c.label.toLowerCase().startsWith(q)) ??
    commands.find((c) => c.label.toLowerCase().split(/\s+/).some((w) => w.startsWith(q))) ??
    commands.find((c) => (c.keywords ?? '').toLowerCase().includes(q))
  );
}

function routeRe(path: string): RegExp {
  const p = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:[A-Za-z]+/g, '[^/?#]+');
  return new RegExp('^' + p + '(?:[?#].*)?$');
}

interface Link {
  test: string;
  states: Set<string>;
  source: 'auto' | 'explicit';
}

const CONFIRM_HOST = 'apps/web/src/components/ui/Confirm.tsx';

function fileOf(a: Action) {
  return a.source.split(':')[0];
}

export function computeMatrix() {
  const inv = loadInventory();
  const map: MappingFile = YAML.parse(readFileSync(MAP_FILE, 'utf8'));
  const results: Results | null = existsSync(RESULTS) ? JSON.parse(readFileSync(RESULTS, 'utf8')) : null;
  const defects: Array<{ id: string; severity: string; status: string; actions?: string[]; title: string }> = existsSync(DEFECTS) ? (YAML.parse(readFileSync(DEFECTS, 'utf8'))?.defects ?? []) : [];
  const actions = inv.actions;
  for (const a of actions) {
    if (map.critical.add.includes(a.id)) a.critical = true;
    if (map.critical.remove.includes(a.id)) a.critical = false;
  }
  const tests = indexTests();
  const byKey = new Map(tests.map((t) => [t.key, t]));
  const commands = actions.filter((a) => a.kind === 'command');
  const routes = actions.filter((a) => a.kind === 'route');
  const links = new Map<string, Map<string, Link>>();
  const addLink = (actionId: string, test: string, states: string[], source: 'auto' | 'explicit') => {
    let m = links.get(actionId);
    if (!m) links.set(actionId, (m = new Map()));
    const l = m.get(test) ?? { test, states: new Set<string>(), source };
    for (const s of states) l.states.add(s);
    if (source === 'explicit') l.source = 'explicit';
    m.set(test, l);
  };
  let ambiguousDropped = 0;

  for (const t of tests.filter((x) => x.suite === 'e2e')) {
    const direct = new Set<string>();
    const all = new Set<string>();
    const ambiguous: Array<{ ref: Ref; cands: Action[] }> = [];
    const context = new Set<string>();
    const credit = (a: Action, ref: Ref | null) => {
      all.add(a.id);
      // a confirm({…}) dialog is rendered by ui/ConfirmHost: its «Отмена»/«Подтвердить» belong to that context
      if (a.confirm) context.add(CONFIRM_HOST);
      if (!ref?.helper) direct.add(a.id);
    };
    for (const ref of t.refs) {
      if (ref.kind === 'url') {
        const v = ref.value.replace(/^https?:\/\/[^/]+/, '').replace(DYN_RE, 'x');
        for (const r of routes) {
          if (r.route === '/' ? /^\/(?:[?#].*)?$/.test(v) : routeRe(r.route!).test(v)) {
            credit(r, ref);
            context.add(fileOf(r));
          }
        }
        continue;
      }
      if (ref.kind === 'typed') {
        const m = /(?:^|\s)\/([\p{L}\d-]+)/u.exec(ref.value);
        if (m) {
          const c = slashCommand(m[1], commands);
          if (c) credit(c, ref);
        }
        continue;
      }
      let cands = candidates(ref, actions);
      // a helper argument such as slash(page, 'цитата', …) may be the "/" query itself
      if (!cands.length && ref.exact && !ref.role && /^[\p{L}\d-]{2,}$/u.test(ref.value) && t.refs.some((r) => r.kind === 'typed' && r.value.startsWith('/'))) {
        const c = slashCommand(ref.value, commands);
        if (c) cands = [c];
      }
      if (!cands.length) continue;
      const filesHit = new Set(cands.map(fileOf));
      if (filesHit.size === 1) {
        for (const c of cands) credit(c, ref);
        context.add(fileOf(cands[0]));
      } else ambiguous.push({ ref, cands });
    }
    for (const { ref, cands } of ambiguous) {
      const inCtx = cands.filter((c) => context.has(fileOf(c)));
      if (inCtx.length) for (const c of inCtx) credit(c, ref);
      else ambiguousDropped++;
    }
    const title = [...t.describe, t.title].join(' ').toLowerCase();
    const extra = t.states.filter((s) => s !== 'success');
    for (const id of all) {
      const a = actions.find((x) => x.id === id)!;
      // inferred non-success states go only to what the test itself drives (not helpers), and only when the test is
      // focused (≤ 8 actions) or names the action in its title — a broad test that also presses Escape somewhere does
      // not prove "cancel" for every control it touched
      const named = title.includes(a.label.toLowerCase().replace(DYN_RE, '').trim()) && a.label.length > 3;
      // "no permission" needs a second, less privileged account in the test
      const states = ['success', ...((direct.has(id) && direct.size <= 8) || named ? extra : [])].filter((st) => st !== 'no-permission' || t.otherUser);
      addLink(id, t.key, states, 'auto');
    }
  }

  const unknownMappings: string[] = [];
  const matchKey = (k: string) => (k.endsWith('…') ? tests.filter((t) => t.key.startsWith(k.slice(0, -1))).map((t) => t.key) : byKey.has(k) ? [k] : []);
  const naExtra = new Map<string, Record<string, string>>();
  for (const m of map.mappings ?? []) {
    if (!actions.some((a) => a.id === m.action)) {
      unknownMappings.push(`action ${m.action}`);
      continue;
    }
    if (m.na) naExtra.set(m.action, m.na);
    for (const t of m.tests ?? []) {
      const keys = matchKey(t.test);
      if (!keys.length) unknownMappings.push(`test ${t.test}`);
      for (const k of keys) addLink(m.action, k, ['success', ...(t.states ?? [])], 'explicit');
    }
  }

  const resultOf = (key: string): Result | undefined => {
    if (!results) return undefined;
    const t = byKey.get(key);
    if (results.tests[key]) return results.tests[key];
    if (t?.parametrised) {
      const re = labelPattern(key);
      const hits = Object.entries(results.tests).filter(([k]) => re.test(k)).map(([, v]) => v);
      if (hits.length) return hits.find((h) => h.status === 'FAIL') ?? hits.find((h) => h.status === 'PASS') ?? hits[0];
    }
    return { status: 'BLOCKED', reason: 'not executed in the ingested runs' };
  };

  const defectsByAction = new Map<string, string[]>();
  for (const d of defects) for (const a of d.actions ?? []) defectsByAction.set(a, [...(defectsByAction.get(a) ?? []), d.id]);

  const records = actions.map((a) => {
    const ls = [...(links.get(a.id)?.values() ?? [])].sort((x, y) => x.test.localeCompare(y.test));
    const na: Record<string, string> = { ...(map.na_by_kind[a.kind === 'runtime' ? runtimeKind(a.component) : a.kind] ?? {}), ...(naExtra.get(a.id) ?? {}) };
    const covered = new Set<string>();
    for (const l of ls) for (const s of l.states) covered.add(s);
    const stateCells = Object.fromEntries(
      map.states.map((s) => {
        if (covered.has(s)) return [s, { status: 'covered', tests: ls.filter((l) => l.states.has(s)).map((l) => l.test) }];
        if (na[s]) return [s, { status: 'n/a', reason: na[s] }];
        return [s, { status: 'gap' }];
      }),
    );
    const res = ls.map((l) => ({ test: l.test, result: resultOf(l.test) }));
    const ran = res.filter((r) => r.result && r.result.status !== 'BLOCKED' && r.result.status !== 'N/A');
    const last = !results ? 'NO RUN DATA' : !ls.length ? '—' : ran.length === 0 ? 'BLOCKED' : ran.some((r) => r.result!.status === 'PASS') ? (ran.some((r) => r.result!.status === 'FAIL') ? 'PASS (with failing tests)' : 'PASS') : 'FAIL';
    const t0 = ls.map((l) => byKey.get(l.test)).filter(Boolean) as TestCase[];
    return {
      id: a.id,
      component: `${a.screen}/${a.component}`,
      kind: a.kind,
      label: a.label,
      source: a.source,
      critical: a.critical,
      // QA26-03 record fields
      states: stateCells,
      devices: [...new Set(t0.map((t) => (t.file.includes('mobile.') || t.file.includes('touch') ? 'mobile' : 'desktop')))].sort(),
      inputs: [...new Set(t0.flatMap((t) => t.inputs))].sort(),
      preconditions: a.no_permission ? `права: без них — «${a.no_permission}»` : a.kind === 'route' ? 'вход выполнен' : 'экран открыт, вход выполнен',
      expectation: expectation(a),
      autotests: ls.map((l) => ({ test: l.test, source: l.source, states: [...l.states].sort(), result: resultOf(l.test)?.status ?? null })),
      manual: 'нет',
      fact: last,
      defects: defectsByAction.get(a.id) ?? [],
      owner: map.owners[a.screen] ?? map.owners.common,
      evidence: results ? `docs/qa/test-results.json (${results.build.sha.slice(0, 12)}${results.build.dirty ? '+dirty' : ''}, ${results.generatedAt})` : null,
    };
  });

  const covered = records.filter((r) => r.autotests.length);
  const crit = records.filter((r) => r.critical);
  const critCovered = crit.filter((r) => r.autotests.length);
  const critPassed = crit.filter((r) => r.fact === 'PASS' || r.fact === 'PASS (with failing tests)');
  const critFailed = crit.filter((r) => r.fact === 'FAIL');
  let cellsReq = 0;
  let cellsCov = 0;
  const perState: Record<string, { covered: number; na: number; gap: number }> = {};
  for (const r of records)
    for (const [s, c] of Object.entries(r.states)) {
      perState[s] ??= { covered: 0, na: 0, gap: 0 };
      if (c.status === 'covered') {
        perState[s].covered++;
        cellsReq++;
        cellsCov++;
      } else if (c.status === 'n/a') perState[s].na++;
      else {
        perState[s].gap++;
        cellsReq++;
      }
    }
  const pct = (a: number, b: number) => (b ? Math.round((1000 * a) / b) / 10 : 100);
  const summary = {
    actions: records.length,
    covered: covered.length,
    coverage_pct: pct(covered.length, records.length),
    critical: crit.length,
    critical_covered: critCovered.length,
    critical_coverage_pct: pct(critCovered.length, crit.length),
    critical_passed: results ? critPassed.length : null,
    critical_failed: results ? critFailed.map((r) => r.id) : null,
    critical_uncovered: crit.filter((r) => !r.autotests.length).map((r) => r.id),
    uncovered: records.filter((r) => !r.autotests.length).length,
    state_cells_required: cellsReq,
    state_cells_covered: cellsCov,
    state_coverage_pct: pct(cellsCov, cellsReq),
    per_state: perState,
    tests_indexed: tests.length,
    e2e_tests: tests.filter((t) => t.suite === 'e2e').length,
    ambiguous_references_not_credited: ambiguousDropped,
    unknown_mappings: unknownMappings,
    results: results ? { build: results.build, generatedAt: results.generatedAt, runs: results.runs } : null,
  };
  return { summary, records, tests, results };
}

function runtimeKind(role: string): Kind {
  return (({ textbox: 'input', spinbutton: 'input', combobox: 'select', switch: 'toggle', checkbox: 'toggle', radio: 'toggle', tab: 'tab', link: 'link', menuitem: 'menu-item' }) as Record<string, Kind>)[role] ?? 'button';
}

function expectation(a: Action): string {
  switch (a.kind) {
    case 'route':
      return `экран ${a.route} открывается по прямой ссылке и после перезагрузки; без прав — объяснение, не пустой экран`;
    case 'dialog':
      return 'диалог открывается с фокусом внутри, закрывается Esc/«Отмена» без изменений, возвращает фокус';
    case 'command':
      return 'команда меню «/» преобразует/вставляет блок в позиции курсора; отменяется Ctrl+Z одним шагом';
    case 'option':
      return 'значение применяется к выделению/полю и видно сразу';
    case 'input':
    case 'select':
      return 'ввод сохраняется в форме, ошибки показываются у поля, введённое не теряется при ошибке';
    case 'toggle':
      return 'переключатель меняет состояние и сохраняет его; состояние видно';
    case 'link':
      return 'переход на целевой экран; адрес меняется, «Назад» возвращает';
    case 'menu':
      return 'меню открывается в пределах окна, управляется клавиатурой, закрывается Esc с возвратом фокуса';
    default:
      return a.critical ? 'операция выполняется один раз (повторный клик не дублирует), результат подтверждается, ошибка объяснена с возможностью повторить, без прав — недоступна с причиной' : 'действие выполняется, результат виден сразу';
  }
}

const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
const short = (k: string) => {
  const [file, ...rest] = k.split(' › ');
  const title = rest.join(' › ');
  return `\`${file.replace('tests/', '')}\` ${esc(title.length > 90 ? title.slice(0, 87) + '…' : title)}`;
};
const STATE_SHORT: Record<string, string> = { success: 'ok', empty: 'пусто', loading: 'загр', cancel: 'отм', error: 'ошиб', offline: 'офл', 'no-permission': 'прав', 'double-click': '2×' };

function writeMd(m: ReturnType<typeof computeMatrix>) {
  const { summary: s, records } = m;
  const L: string[] = [];
  L.push('# Матрица действий (сгенерировано)', '');
  L.push('Сгенерировано `npm run qa:report` (`scripts/qa/coverage.ts`) из `docs/qa/action-inventory.yaml`, тестов `tests/**`, явного сопоставления `docs/qa/action-tests.yaml` и результатов запуска `docs/qa/test-results.json`. Не редактировать вручную. Машиночитаемая форма со всеми полями записи QA26-03 — `docs/qa/action-matrix.json`.', '');
  L.push('## Итог', '');
  L.push(`| Показатель | Значение |`, `|---|---|`);
  L.push(`| Действий в инвентаризации | **${s.actions}** |`);
  L.push(`| Покрыто хотя бы одним автотестом | **${s.covered}** (${s.coverage_pct}%) |`);
  L.push(`| Критичных действий | ${s.critical}; покрыто ${s.critical_covered} (${s.critical_coverage_pct}%) |`);
  L.push(`| Критичных с пройденным тестом в последнем запуске | ${s.critical_passed ?? 'нет данных запуска'} |`);
  L.push(`| Ячеек «действие × состояние» (без N/A) | ${s.state_cells_required}; покрыто ${s.state_cells_covered} (${s.state_coverage_pct}%) |`);
  L.push(`| Неоднозначных ссылок тестов, не засчитанных | ${s.ambiguous_references_not_credited} |`);
  if (s.results) L.push(`| Сборка последнего запуска | \`${s.results.build.sha.slice(0, 12)}\`${s.results.build.dirty ? ' (рабочая копия с изменениями)' : ''}, ${s.results.generatedAt} |`);
  L.push('');
  L.push('Состояния: ' + Object.entries(s.per_state).map(([k, v]) => `${k}: покрыто ${v.covered}, N/A ${v.na}, пробел ${v.gap}`).join('; ') + '.', '');
  if (s.unknown_mappings.length) L.push('**Ошибки сопоставления** (в `action-tests.yaml` указаны несуществующие действия/тесты): ' + s.unknown_mappings.map((u) => '`' + u + '`').join(', '), '');
  L.push('## Не покрытые критичные действия (блокируют релиз)', '');
  const cu = records.filter((r) => r.critical && !r.autotests.length);
  L.push(cu.length ? '| ID | Тип | Название | Источник |\n|---|---|---|---|\n' + cu.map((r) => `| \`${r.id}\` | ${r.kind} | ${esc(r.label)} | \`${r.source}\` |`).join('\n') : 'Нет.', '');
  L.push('## Не покрытые прочие действия', '');
  const ou = records.filter((r) => !r.critical && !r.autotests.length);
  L.push(ou.length ? '| ID | Тип | Название | Источник |\n|---|---|---|---|\n' + ou.map((r) => `| \`${r.id}\` | ${r.kind} | ${esc(r.label)} | \`${r.source}\` |`).join('\n') : 'Нет.', '');
  L.push('## Все действия', '');
  L.push('Состояния: ✔ покрыто тестом, · N/A (обоснование в `action-matrix.json`), ✗ пробел. Факт — результат последнего запуска покрывающих тестов.', '');
  const screens = [...new Set(records.map((r) => r.component.split('/')[0]))].sort();
  for (const sc of screens) {
    const rs = records.filter((r) => r.component.startsWith(sc + '/'));
    L.push(`### ${sc} (${rs.filter((r) => r.autotests.length).length}/${rs.length} покрыто)`, '');
    L.push('| ID | Название | Крит. | ' + Object.keys(STATE_SHORT).map((k) => STATE_SHORT[k]).join(' | ') + ' | Факт | Тесты |');
    L.push('|---|---|---|' + Object.keys(STATE_SHORT).map(() => '---').join('|') + '|---|---|');
    for (const r of rs) {
      const cells = Object.keys(STATE_SHORT).map((k) => ({ covered: '✔', 'n/a': '·', gap: '✗' })[(r.states as any)[k].status as 'covered' | 'n/a' | 'gap']);
      const ts = r.autotests.slice(0, 3).map((t) => short(t.test)).join('<br>') + (r.autotests.length > 3 ? `<br>… ещё ${r.autotests.length - 3}` : '');
      L.push(`| \`${r.id}\` | ${esc(r.label)} | ${r.critical ? '**да**' : ''} | ${cells.join(' | ')} | ${r.fact} | ${ts || '**нет теста**'} |`);
    }
    L.push('');
  }
  writeFileSync(OUT_MD, L.join('\n') + '\n');
}

const CONTRACT_STATES: Array<[string, string]> = [
  ['empty', 'Пусто'],
  ['success', 'Успех'],
  ['loading', 'Загрузка / медленная сеть'],
  ['cancel', 'Отмена'],
  ['error', 'Ошибка сервера'],
  ['no-permission', 'Нет прав'],
  ['offline', 'Потеря сети'],
  ['double-click', 'Повторный клик'],
];
/** Product-wide state rules every operation follows (SPECIFICATION: R-UI-011, R-UI-053, R-UI-062, R-UI-068, R-UI-027). */
const CONTRACT_RULES: Record<string, string> = {
  empty: 'пустое состояние объясняет, что здесь будет, и предлагает первое действие; пустой ввод не отправляется, кнопка подтверждения недоступна с подсказкой',
  success: 'результат виден сразу (оптимистично или после ответа), подтверждение тостом для неочевидных операций; обратимые операции предлагают «Отменить»',
  loading: 'скелетон/индикатор не дольше 12 с без объяснения; кнопка операции в состоянии «выполняется» и недоступна; ввод не блокируется',
  cancel: '«Отмена»/Esc закрывает без изменений и возвращает фокус; несохранённые критичные данные — подтверждение закрытия',
  error: 'сообщение с причиной и действием («Повторить»), введённые данные сохраняются; технические детали — в «Подробности»',
  'no-permission': 'элемент скрыт или недоступен с причиной (подсказка) и путём запросить доступ; сервер отвечает 403 и ничего не меняет',
  offline: 'правки документа копятся локально (индикатор «Нет сети · сохранено на устройстве»); серверные операции недоступны с объяснением или ставятся в очередь',
  'double-click': 'повторное нажатие не выполняет операцию дважды (идемпотентный requestId / блокировка кнопки)',
};
const EXTRA_DIMENSIONS = 'Конфликт, «Назад», перезагрузка, мобильный ввод и zoom 200% описаны общими правилами ниже и проверяются сквозными наборами: конфликт — `tests/e2e/conflict.spec.ts`, `tests/integration/conflicts.test.ts`; перезагрузка и «Назад» — `tests/e2e/ui-p0-interaction.spec.ts`, `collab-p0-offline.spec.ts`; мобильный ввод — `tests/e2e/ui-p0-touch.spec.ts`, `mobile.layout.spec.ts`; zoom 200% — `tests/e2e/ui-p0-layout.spec.ts`, `visual.spec.ts`.';

function writeContract(m: ReturnType<typeof computeMatrix>, inv: { actions: Action[] }) {
  const byId = new Map(inv.actions.map((a) => [a.id, a]));
  const ops = m.records.filter((r) => ['button', 'menu-item', 'command', 'toast-action', 'dialog', 'route', 'toggle', 'runtime'].includes(r.kind));
  const L: string[] = [];
  L.push('# Контракт состояний операций (R-UI-061, сгенерировано)', '');
  L.push('Сгенерировано `npm run qa:report` (`scripts/qa/coverage.ts`) из инвентаризации действий. Для каждой операции перечислены состояния R-UI-061: пусто, успех, загрузка, отмена, ошибка, нет прав, потеря сети, повторный клик. В ячейке — ожидаемое поведение (специфичное из исходного кода — текст причины недоступности, подтверждение; иначе общее правило из таблицы ниже) и тест, который его проверяет, либо «N/A» с обоснованием, либо **пробел**.', '');
  L.push(EXTRA_DIMENSIONS, '');
  L.push('## Общие правила состояний', '', '| Состояние | Ожидаемое поведение |', '|---|---|');
  for (const [k, n] of CONTRACT_STATES) L.push(`| ${n} | ${CONTRACT_RULES[k]} |`);
  L.push('| Конфликт | правка не теряется: слияние CRDT, при несливаемой операции — диалог сравнения (R-COLLAB-036) |');
  L.push('| Назад / перезагрузка | состояние экрана восстанавливается по адресу; черновик не теряется (R-UI-062) |');
  L.push('| Мобильный ввод / zoom 200% | действие доступно касанием (цель ≥ 44 px) и без горизонтальной прокрутки (R-A11Y-008, R-QA-007) |', '');
  const docCount = { total: ops.length, specific: 0, tested: 0 };
  L.push('## Операции', '');
  const screens = [...new Set(ops.map((r) => r.component.split('/')[0]))].sort();
  for (const sc of screens) {
    L.push(`### ${sc}`, '');
    for (const r of ops.filter((x) => x.component.startsWith(sc + '/'))) {
      const a = byId.get(r.id)!;
      const states = r.states as Record<string, { status: string; tests?: string[]; reason?: string }>;
      L.push(`#### \`${r.id}\` — ${esc(r.label)}${r.critical ? ' (критичная)' : ''}`, '');
      L.push(`Источник: \`${r.source}\`. Ожидание: ${r.expectation}.`, '');
      L.push('| Состояние | Ожидаемое поведение | Проверка |', '|---|---|---|');
      let specific = false;
      for (const [k, n] of CONTRACT_STATES) {
        let exp = CONTRACT_RULES[k];
        if (k === 'no-permission' && a.no_permission) {
          exp = `недоступно с причиной «${esc(a.no_permission)}»`;
          specific = true;
        }
        if (k === 'success' && a.shortcut) exp += `; горячая клавиша ${a.shortcut}`;
        const c = states[k];
        const check = c.status === 'covered' ? c.tests!.slice(0, 2).map(short).join('<br>') : c.status === 'n/a' ? `N/A: ${esc(c.reason!)}` : '**пробел**';
        L.push(`| ${n} | ${c.status === 'n/a' ? '—' : exp} | ${check} |`);
      }
      if (specific) docCount.specific++;
      if (r.autotests.length) docCount.tested++;
      L.push('');
    }
  }
  L.splice(4, 0, `Операций: **${docCount.total}**; с хотя бы одним тестом: ${docCount.tested}; с причиной недоступности из кода: ${docCount.specific}.`, '');
  writeFileSync(OUT_CONTRACT, L.join('\n') + '\n');
}

if (process.argv[1]?.endsWith('coverage.ts')) {
  const m = computeMatrix();
  writeFileSync(OUT_JSON, JSON.stringify({ generated_by: 'scripts/qa/coverage.ts', summary: m.summary, records: m.records }, null, 1) + '\n');
  writeMd(m);
  writeContract(m, loadInventory());
  const s = m.summary;
  console.log(`actions ${s.actions}, covered ${s.covered} (${s.coverage_pct}%), critical ${s.critical_covered}/${s.critical} (${s.critical_coverage_pct}%), state cells ${s.state_cells_covered}/${s.state_cells_required} (${s.state_coverage_pct}%), ambiguous dropped ${s.ambiguous_references_not_credited}`);
  if (s.unknown_mappings.length) {
    console.error('unknown mappings in docs/qa/action-tests.yaml:', s.unknown_mappings.join('; '));
    process.exit(1);
  }
}
