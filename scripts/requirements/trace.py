#!/usr/bin/env python3
"""Builds docs/REQUIREMENTS_TRACEABILITY.md from the requirement registry, the per-module status
assessments (docs/requirements/status/*.yaml) and requirement ids referenced in automated test titles.

A requirement counts as "covered by tests" only when its id literally appears in a test file
(test title or tag). Status "done" without a test is reported separately so nothing is overstated.
Usage: python3 scripts/requirements/trace.py [--check]
"""
import re, sys, glob, os, collections, yaml

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
REG = os.path.join(ROOT, 'docs/requirements/registry.yaml')
STATUS_DIR = os.path.join(ROOT, 'docs/requirements/status')
OUT = os.path.join(ROOT, 'docs/REQUIREMENTS_TRACEABILITY.md')
VALID = ['done', 'partial', 'missing', 'manual', 'env-blocked', 'process', 'superseded']
LABEL = {
    'done': 'реализовано', 'partial': 'частично', 'missing': 'не реализовано', 'manual': 'требует ручной проверки',
    'env-blocked': 'ограничение окружения', 'process': 'процесс/документ', 'superseded': 'заменено', None: 'не оценено',
}

def load_registry():
    with open(REG, encoding='utf-8') as f:
        return yaml.safe_load(f)

def load_status():
    st = {}
    for p in sorted(glob.glob(os.path.join(STATUS_DIR, '*.yaml'))):
        with open(p, encoding='utf-8') as f:
            data = yaml.safe_load(f) or []
        for e in data:
            if e['status'] not in VALID:
                raise SystemExit(f"{p}: {e['id']}: invalid status {e['status']}")
            st[e['id']] = e
    return st

def test_refs(ids):
    """id -> list of 'file: test title' where the id appears."""
    refs = collections.defaultdict(list)
    # An id must not be glued to other id characters: \b would match OPS-006 inside R-OPS-006.
    pattern = re.compile(r'(?<![\w-])(' + '|'.join(sorted((re.escape(i) for i in ids), key=len, reverse=True)) + r')(?![\w-])')
    for p in glob.glob(os.path.join(ROOT, 'tests/**/*.ts'), recursive=True):
        rel = os.path.relpath(p, ROOT)
        with open(p, encoding='utf-8') as f:
            for line in f:
                m = re.search(r"\b(?:test|it|describe)\s*\(\s*[`'\"](.+?)[`'\"]\s*,", line)
                if not m:
                    continue
                for rid in set(pattern.findall(m.group(1))):
                    refs[rid].append(f"{rel}: {m.group(1)[:90]}")
    return refs

def main():
    reg = load_registry()
    st = load_status()
    ids = [r['id'] for r in reg]
    refs = test_refs(ids)
    unknown = [i for i in st if i not in set(ids)]
    if unknown:
        print('status entries for unknown ids:', unknown[:20], file=sys.stderr)
    counts = collections.Counter()
    by_prio = collections.defaultdict(collections.Counter)
    by_mod = collections.defaultdict(collections.Counter)
    rows = []
    for r in reg:
        s = st.get(r['id'], {})
        status = s.get('status')
        tested = bool(refs.get(r['id']))
        counts[status] += 1
        by_prio[r['priority']][status] += 1
        by_mod[r['module']][status] += 1
        if tested:
            counts['tested'] += 1
            by_prio[r['priority']]['tested'] += 1
            by_mod[r['module']]['tested'] += 1
        rows.append((r, s, refs.get(r['id'], [])))
    L = []
    L.append('# Матрица трассируемости требований\n')
    L.append('Сгенерировано `python3 scripts/requirements/trace.py` из `docs/requirements/registry.yaml` (все пункты ТЗ), '
             'оценок статуса `docs/requirements/status/*.yaml` и ссылок на ID требований в названиях автоматических тестов. '
             'Не редактируйте вручную.\n')
    L.append('Статусы: ' + ', '.join(f'`{k}` — {LABEL[k]}' for k in VALID) + '. «Тесты» — ID требования встречается в названии автоматического теста.\n')
    L.append('## Сводка\n')
    L.append('| Приоритет | Всего | ' + ' | '.join(LABEL[k] for k in VALID) + ' | не оценено | покрыто тестами |')
    L.append('|' + '---|' * (len(VALID) + 4))
    for p in ['P0', 'P1', 'P2']:
        c = by_prio[p]
        L.append(f"| {p} | {sum(v for k, v in c.items() if k != 'tested')} | " + ' | '.join(str(c[k]) for k in VALID) + f" | {c[None]} | {c['tested']} |")
    total = len(reg)
    L.append(f"| **Итого** | {total} | " + ' | '.join(str(counts[k]) for k in VALID) + f" | {counts[None]} | {counts['tested']} |\n")
    L.append('## По модулям\n')
    L.append('| Модуль | Всего | реализовано | частично | не реализовано | ручная проверка | окружение | процесс | покрыто тестами |')
    L.append('|---|---|---|---|---|---|---|---|---|')
    for m in sorted(by_mod):
        c = by_mod[m]
        L.append(f"| {m} | {sum(v for k, v in c.items() if k != 'tested')} | {c['done']} | {c['partial']} | {c['missing']} | {c['manual']} | {c['env-blocked']} | {c['process']} | {c['tested']} |")
    L.append('\n## Открытые P0/P1 (частично / не реализовано / не оценено)\n')
    for r, s, t in rows:
        if r['priority'] in ('P0', 'P1') and s.get('status') in (None, 'partial', 'missing'):
            L.append(f"- **{r['id']}** ({r['priority']}, {r['module']}, {LABEL[s.get('status')]}): {r['title']}" + (f" — {s.get('note')}" if s.get('note') else ''))
    L.append('\n## Полный реестр\n')
    cur = None
    for r, s, t in rows:
        if r['module'] != cur:
            cur = r['module']
            L.append(f"\n### {cur}\n")
            L.append('| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |')
            L.append('|---|---|---|---|---|---|')
        ev = (s.get('evidence') or '')
        if s.get('note'):
            ev = (ev + '; ' if ev else '') + s['note']
        title = r['title'].replace('|', '\\|')
        tests = '<br>'.join(x.replace('|', '\\|') for x in t[:3]) + (f'<br>… ещё {len(t) - 3}' if len(t) > 3 else '')
        L.append(f"| {r['id']} | {r['priority']} | {title} | {LABEL[s.get('status')]} | {ev.replace('|', '/')} | {tests} |")
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write('\n'.join(L) + '\n')
    print(f"{total} requirements; assessed {total - counts[None]}; tested {counts['tested']}; missing {counts['missing']}; partial {counts['partial']}")
    if '--check' in sys.argv and (counts[None] or unknown):
        sys.exit(1)

main()
