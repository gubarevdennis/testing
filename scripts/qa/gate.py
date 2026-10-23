"""QA part of the release gate (QA26-04, QA26-27, QA26-28, R-QA-006, OPS-018, R-PROCESS-051).

qa_blocking(root) regenerates the action inventory check, the action matrix and the defect register and returns the
blocking entries (requirement id, kind, message) for scripts/release-gate.py:
  * the committed docs/qa/action-inventory.yaml is stale (an action exists in the code but not in the inventory);
  * a critical action has no test, or its tests did not pass in the last ingested run;
  * not every action is covered (QA26-28: "100 % действий покрыто");
  * there are no run results for the current build (QA26-27);
  * a blocker/critical/high defect is open, or the register is malformed (OPS-018, R-PROCESS-051).
"""
import json, os, subprocess

import yaml


def _node(root, script, *args):
    return subprocess.run(['node', '--import', 'tsx', os.path.join(root, script), *args], cwd=root, capture_output=True, text=True)


def _head(root):
    try:
        return subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=root, capture_output=True, text=True, check=True).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return ''


def qa_blocking(root):
    out, info = [], []
    try:
        inv = _node(root, 'scripts/qa/inventory.ts', '--check')
    except OSError as e:
        return [('QA26-04', 'qa-tooling', f'cannot run node for the QA gate: {e}')], info
    if inv.returncode != 0:
        out.append(('QA26-04', 'inventory-stale', (inv.stderr or inv.stdout).strip().splitlines()[-1] if (inv.stderr or inv.stdout).strip() else 'inventory check failed'))
    cov = _node(root, 'scripts/qa/coverage.ts')
    if cov.returncode != 0:
        out.append(('QA26-03', 'matrix-error', (cov.stderr or cov.stdout).strip()[-300:]))
    dft = _node(root, 'scripts/qa/defects.ts')
    if dft.returncode != 0:
        out.append(('R-PROCESS-051', 'defect-register-invalid', (dft.stderr or dft.stdout).strip()[-300:]))
    try:
        m = json.load(open(os.path.join(root, 'docs/qa/action-matrix.json'), encoding='utf-8'))['summary']
    except (OSError, ValueError, KeyError) as e:
        return out + [('QA26-03', 'matrix-missing', f'docs/qa/action-matrix.json: {e}')], info
    info.append(f"Action matrix: {m['covered']}/{m['actions']} actions covered ({m['coverage_pct']}%), critical {m['critical_covered']}/{m['critical']}, "
                f"action×state cells {m['state_cells_covered']}/{m['state_cells_required']} ({m['state_coverage_pct']}%) — docs/qa/ACTION_MATRIX.md")
    cu = m['critical_uncovered']
    if cu:
        out.append(('QA26-28', 'critical-uncovered', f"{len(cu)} critical actions without a test (docs/qa/ACTION_MATRIX.md), e.g. {', '.join(cu[:5])}"))
    if m['uncovered']:
        out.append(('QA26-28', 'actions-uncovered', f"{m['uncovered']} of {m['actions']} actions without a test"))
    res = m.get('results')
    if not res:
        out.append(('QA26-27', 'no-run-results', 'no ingested test run (npm run qa:report after a Playwright/vitest JSON run)'))
    else:
        head = _head(root)
        if head and res['build']['sha'] != head:
            out.append(('QA26-27', 'results-stale', f"last ingested run is for {res['build']['sha'][:12]}, HEAD is {head[:12]}"))
        elif res['build'].get('dirty'):
            info.append('Note: the last ingested run was made on a working copy with uncommitted changes.')
        crit_total, passed = m['critical'], m['critical_passed'] or 0
        if passed < crit_total:
            failed = m.get('critical_failed') or []
            out.append(('QA26-28', 'critical-not-passed', f"{passed}/{crit_total} critical actions passed in the last run; failing: {', '.join(failed[:5]) or 'none'}"))
    try:
        defects = (yaml.safe_load(open(os.path.join(root, 'docs/qa/defects.yaml'), encoding='utf-8')) or {}).get('defects', [])
    except (OSError, yaml.YAMLError) as e:
        defects = []
        out.append(('R-PROCESS-051', 'defect-register-missing', str(e)))
    open_high = [d['id'] for d in defects if d.get('status') == 'open' and d.get('severity') in ('blocker', 'critical', 'high')]
    if open_high:
        out.append(('OPS-018', 'open-defects', f"{len(open_high)} open blocker/critical/high defects (docs/qa/DEFECTS.md): {', '.join(open_high)}"))
    return out, info
