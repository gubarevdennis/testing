import glob, json, os, re, sys, collections
D = os.path.dirname(os.path.abspath(__file__))
MODS = "AUTH ORG SPACE TREE PAGE EDITOR CLIPBOARD TABLE COLLECTION MEDIA FILES LAYOUT HISTORY COLLAB OFFLINE ACL SEARCH TEMPLATES HELP IMPORT EXPORT ARCHIVE OCR COMMENTS PUBLISH ADMIN AUDIT BACKUP SECURITY PERF A11Y UI OPS QA PROCESS".split()
entries = []; errs = []
for f in sorted(glob.glob(os.path.join(D, 'reg', '*.txt'))):
    src = None
    for n, line in enumerate(open(f, encoding='utf-8'), 1):
        line = line.rstrip('\n')
        if not line.strip(): continue
        if line.startswith('@ '): src = line[2:].strip(); continue
        p = line.split('|')
        if len(p) not in (6, 7): errs.append(f'{f}:{n} fields={len(p)}'); continue
        e = dict(id=p[0].strip(), source=src, module=p[1], priority=p[2], kind=p[3], title=p[4].strip(), acceptance=p[5].strip(), alias=None, ob=None)
        if len(p) == 7:
            for kv in p[6].split(';'):
                k, v = kv.split('=', 1)
                if k == 'id': e['alias'] = v
                elif k == 'ob': e['ob'] = v
                else: errs.append(f'{f}:{n} bad extra {kv}')
        if e['module'] not in MODS: errs.append(f'{f}:{n} module {e["module"]}')
        if e['priority'] not in ('P0','P1','P2'): errs.append(f'{f}:{n} prio')
        if e['kind'] not in ('functional','nfr','scenario','process','constraint'): errs.append(f'{f}:{n} kind {e["kind"]}')
        e['detail'] = None
        if len(e['title']) > 140:
            t = e['title']; e['detail'] = t
            cut = max(t.rfind('; ', 0, 137), t.rfind(', ', 0, 137))
            if cut < 80: cut = t.rfind(' ', 0, 137)
            e['title'] = t[:cut].rstrip(' ,;:—→') + ' …'
            assert len(e['title']) <= 140
        entries.append(e)
cnt = collections.Counter()
for e in entries:
    if e['id'] == '-':
        cnt[e['module']] += 1
        e['id'] = f"R-{e['module']}-{cnt[e['module']]:03d}"
alias = {e['alias']: e['id'] for e in entries if e['alias']}
for e in entries:
    if e['ob']:
        if e['ob'] not in alias: errs.append('unresolved ob ' + e['ob'])
        else: e['ob'] = alias[e['ob']]
ids = [e['id'] for e in entries]
d = [i for i, c in collections.Counter(ids).items() if c > 1]
if d: errs.append('dups ' + ','.join(d))
if errs: print('\n'.join(errs)); sys.exit(1)
q = lambda s: json.dumps(s, ensure_ascii=False)
out = ['# Реестр требований — сгенерирован из SPECIFICATION.md (v3.0, 22.10.2026)',
       '# Поля: id, source, module, priority (P0/P1/P2), kind, title, acceptance, detail (опц.: полная формулировка, если title сокращён до 140 симв.), overridden_by (опц.)', '']
for e in entries:
    out.append(f"- id: {e['id']}")
    out.append(f"  source: {q(e['source'])}")
    out.append(f"  module: {e['module']}")
    out.append(f"  priority: {e['priority']}")
    out.append(f"  kind: {e['kind']}")
    out.append(f"  title: {q(e['title'])}")
    out.append(f"  acceptance: {q(e['acceptance'])}")
    if e['detail']: out.append(f"  detail: {q(e['detail'])}")
    if e['ob']: out.append(f"  overridden_by: {e['ob']}")
os.makedirs('/home/user/testing/docs/requirements', exist_ok=True)
open(os.path.join(D, '..', '..', 'docs', 'requirements', 'registry.yaml'), 'w', encoding='utf-8').write('\n'.join(out) + '\n')
print('total', len(entries), 'truncated', sum(1 for e in entries if e['detail']))
print('modules', dict(sorted(collections.Counter(e['module'] for e in entries).items())))
print('prio', collections.Counter(e['priority'] for e in entries))
print('kind', collections.Counter(e['kind'] for e in entries))
fam = collections.Counter()
for i in ids:
    m = re.match(r'^(R-[A-Z0-9]+|[A-Z]+(?:\d\d)?(?=-)|E2(?=\d\d)|[A-Z]+)', i)
    fam[re.sub(r'^(R)-.*', r'R', m.group(1)) if m else i] += 1
print('families', dict(fam))
for e in entries:
    if e['ob']: print('override', e['id'], '->', e['ob'])
