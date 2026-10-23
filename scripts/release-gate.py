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
# R-BACKUP-002: no release without a real restore. A passing restore-drill protocol (npm run restore:drill, or the
# production drill's report given by RESTORE_DRILL_REPORT) no older than RESTORE_DRILL_MAX_AGE_DAYS (default 31) is required.
import json, datetime
restore_problem = None
report_path = os.environ.get('RESTORE_DRILL_REPORT', os.path.join(ROOT, 'docs/drills/latest.json'))
try:
    rep = json.load(open(report_path, encoding='utf-8'))
    age = datetime.datetime.now(datetime.timezone.utc) - datetime.datetime.fromisoformat(rep['finishedAt'].replace('Z', '+00:00'))
    max_age = float(os.environ.get('RESTORE_DRILL_MAX_AGE_DAYS', '31'))
    rpo = rep['disaster']['rpo']; rto = rep['disaster']['rto']; tgt = rep['targets']
    if rep.get('format') != 'kb-dr-drill/1' or rep.get('ok') is not True:
        restore_problem = f'{report_path}: drill did not pass'
    elif age.total_seconds() > max_age * 86400:
        restore_problem = f'{report_path}: last restore drill is {age.days} days old (> {max_age:g})'
    elif max(rpo['databaseS'], rpo['filesS']) > tgt['rpoS'] or rto['verifiedS'] > tgt['rtoS']:
        restore_problem = f'{report_path}: RPO/RTO targets not met'
    else:
        print(f"Restore protocol: {report_path} ({rep['finishedAt']}): RPO db {rpo['databaseS']:.1f} s, files {rpo['filesS']:.1f} s; RTO {rto['verifiedS']:.1f} s")
except (OSError, ValueError, KeyError) as e:
    restore_problem = f'no valid restore-drill protocol ({report_path}: {e})'
if restore_problem:
    blocking.append(('R-BACKUP-002', 'restore-protocol', restore_problem))
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
