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

def main():
    out = [open(HEAD, encoding='utf-8').read().rstrip(), '', '## Каталог автоматических тестов (сгенерировано)', '',
           'Сгенерировано `python3 scripts/requirements/test_matrix.py`. ID требований в названиях связывают тест с реестром (см. `REQUIREMENTS_TRACEABILITY.md`).', '']
    total = 0
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
        out += [f'### {name}', '', f'Запуск: `{cmd}`. Тестов: **{len(rows)}**.', '', '| Файл | Группа | Тест |', '|---|---|---|']
        for f, d, t in rows:
            out.append(f"| `{f}` | {(d or '').replace('|', '/')} | {t.replace('|', '/')} |")
        out.append('')
    out.insert(out.index('## Каталог автоматических тестов (сгенерировано)') + 1, f'\nВсего автоматических тестов: **{total}** (без учёта параметризованных повторов и 12 комбинаций раскладок).\n')
    open(OUT, 'w', encoding='utf-8').write('\n'.join(out) + '\n')
    print('tests:', total)

main()
