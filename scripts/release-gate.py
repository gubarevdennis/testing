#!/usr/bin/env python3
"""Release gate: fails (exit 1) while any P0 requirement is not done/process/superseded, while any requirement is
unassessed, or while the traceability document is out of date. Prints the blocking list."""
import subprocess, sys, os, yaml, glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
reg = yaml.safe_load(open(os.path.join(ROOT, 'docs/requirements/registry.yaml'), encoding='utf-8'))
status = {}
for p in glob.glob(os.path.join(ROOT, 'docs/requirements/status/*.yaml')):
    for e in yaml.safe_load(open(p, encoding='utf-8')) or []:
        status[e['id']] = e
OK = {'done', 'process', 'superseded'}
blocking, unassessed, accepted_limits = [], [], []
for r in reg:
    s = status.get(r['id'])
    if not s:
        unassessed.append(r['id'])
    elif r['priority'] == 'P0' and s['status'] not in OK:
        (accepted_limits if s['status'] in ('env-blocked', 'manual') else blocking).append((r['id'], s['status'], r['title'][:100]))
subprocess.run([sys.executable, os.path.join(ROOT, 'scripts/requirements/trace.py')], check=True)
print(f"\nP0 blocking (partial/missing): {len(blocking)}")
for b in blocking:
    print('  -', *b)
print(f"P0 requiring sign-off (manual acceptance / environment limits): {len(accepted_limits)}")
for b in accepted_limits:
    print('  -', *b)
print(f"Unassessed requirements: {len(unassessed)}")
if blocking or unassessed:
    print('\nRELEASE GATE: FAILED — the product must not be declared ready (see docs/RELEASE_READINESS.md).')
    sys.exit(1)
print('\nRELEASE GATE: technical criteria met; manual acceptance items still require sign-off.')
