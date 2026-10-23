#!/usr/bin/env python3
"""Generates the automated-test catalogue section of docs/TEST_MATRIX.md from test sources."""
import glob, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'docs/TEST_MATRIX.md')
HEAD = os.path.join(ROOT, 'docs/test-matrix-head.md')
SUITES = [
    ('unit', 'Юнит-тесты (vitest)', 'npm run test:unit'),
    ('integration', 'Интеграционные тесты API на реальном PostgreSQL (vitest)', 'npm run test:integration'),
    ('resilience', 'Отказоустойчивость и восстановление (vitest, отдельные процессы сервера)', 'npm run test:resilience'),
    ('e2e', 'Браузерные E2E (Playwright, Chromium)', 'npm run test:e2e'),
]
title_re = re.compile(r"\b(describe|it|test)(?:\.each\([^)]*\))?\s*\(\s*([`'\"])(.+?)\2\s*,")
RESULTS = os.path.join(ROOT, 'docs/qa/test-results.json')
MATRIX = os.path.join(ROOT, 'docs/qa/action-matrix.json')


def load_results():
    """Last PASS/FAIL/BLOCKED/N/A per test from scripts/qa/report.ts (QA26-27), keyed by '<file> › … › <title>'."""
    import json
    try:
        return json.load(open(RESULTS, encoding='utf-8'))
    except (OSError, ValueError):
        return None


def result_of(res, f, title):
    if not res:
        return '—'
    plain = re.sub(r'\$\{[^}]*\}', '{…}', title)
    pat = re.compile('^' + '.*'.join(re.escape(x) for x in plain.split('{…}')) + '$')
    hits = [v for k, v in res['tests'].items() if k.startswith(f + ' › ') and pat.match(k.rsplit(' › ', 1)[-1])]
    if not hits:
        return 'BLOCKED (не запускался)'
    v = next((h for h in hits if h['status'] == 'FAIL'), hits[0])
    return v['status'] + (f" ({v['reason'][:80]})" if v.get('reason') and v['status'] != 'PASS' else '')

def main():
    out = [open(HEAD, encoding='utf-8').read().rstrip(), '', '## Каталог автоматических тестов (сгенерировано)', '',
           'Сгенерировано `python3 scripts/requirements/test_matrix.py`. ID требований в названиях связывают тест с реестром (см. `REQUIREMENTS_TRACEABILITY.md`).', '']
    total = 0
    res = load_results()
    if res:
        runs = '; '.join(f"{r['suite']} {r['startedAt']} ({r['link']})" for r in res['runs'])
        out += [f"Результаты (QA26-27): сборка `{res['build']['sha'][:12]}`{' (рабочая копия с изменениями)' if res['build'].get('dirty') else ''}, сведены {res['generatedAt']}; запуски: {runs}. Итог по тестам: " + ', '.join(f'{k} {v}' for k, v in sorted(res['totals'].items())) + '. Тест, которого нет в запусках, — BLOCKED.', '']
    try:
        import json
        m = json.load(open(MATRIX, encoding='utf-8'))['summary']
        out += [f"Покрытие действий (QA26-03, R-QA-006): {m['covered']} из {m['actions']} действий ({m['coverage_pct']}%), критичных {m['critical_covered']} из {m['critical']}; матрица действие × тест × состояние — `docs/qa/ACTION_MATRIX.md`, контракт состояний операций — `docs/qa/OPERATION_CONTRACT.md`, дефекты — `docs/qa/DEFECTS.md`.", '']
    except (OSError, ValueError, KeyError):
        pass
    for key, name, cmd in SUITES:
        files = sorted(glob.glob(os.path.join(ROOT, f'tests/{key}/**/*.ts'), recursive=True))
        files = [f for f in files if f.endswith(('.test.ts', '.spec.ts'))]
        rows = []
        for f in files:
            describe = None
            for line in open(f, encoding='utf-8'):
                m = title_re.search(line)
                if not m:
                    continue
                kind, _, title = m.groups()
                if kind == 'describe':
                    describe = title
                    continue
                rows.append((os.path.relpath(f, ROOT), describe, title))
        total += len(rows)
        out += [f'### {name}', '', f'Запуск: `{cmd}`. Тестов: **{len(rows)}**.', '', '| Файл | Группа | Тест | Результат |', '|---|---|---|---|']
        for f, d, t in rows:
            out.append(f"| `{f}` | {(d or '').replace('|', '/')} | {t.replace('|', '/')} | {result_of(res, f, t).replace('|', '/')} |")
        out.append('')
    out.insert(out.index('## Каталог автоматических тестов (сгенерировано)') + 1, f'\nВсего автоматических тестов: **{total}** (без учёта параметризованных повторов и 12 комбинаций раскладок).\n')
    open(OUT, 'w', encoding='utf-8').write('\n'.join(out) + '\n')
    print('tests:', total)

main()
