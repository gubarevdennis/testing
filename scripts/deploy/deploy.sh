#!/usr/bin/env bash
# Release deployment with gates and automatic rollback (R-OPS-022, R-OPS-003; docs/OPERATIONS.md §3.1).
#
#   scripts/deploy/deploy.sh --image registry.corp/kb:1.4.0 [--previous registry.corp/kb:1.3.2] [--dry-run]
#
# Steps (each one is logged with its duration into the JSON report, DEPLOY_REPORT):
#   1. preflight     — the target is reachable, the current image is known (rollback target)
#   2. plan          — how many migrations the new release will apply (cli migrate pending, run with the NEW image)
#   3. backup        — full backup BEFORE anything changes (backup.sh with BACKUP_RECORD=1; the server's own guard,
#                      MIGRATION_REQUIRE_BACKUP, refuses migrations without it too). Failure → stop, nothing changed.
#   4. migrate       — cli migrate up with the NEW image
#   5. switch        — roll the application service to the new image
#   6. ready gate    — /readyz must answer 200 READY_STABLE times in a row within READY_TIMEOUT_S
#   7. smoke         — scripts/deploy/smoke.mjs against the public URL (health, SPA, API, auth, live collaboration)
#   Failure in 4–7 → automatic rollback:
#      a. migrations applied by this run are rolled back with the NEW image (it carries the down sections;
#         ROLLBACK_MIGRATIONS=down, default) — the old release refuses a newer schema (SchemaTooNewError);
#         ROLLBACK_MIGRATIONS=none keeps the schema (only for releases whose migrations are backward compatible);
#      b. switch back to the previous image, ready gate, smoke.
#      If a step of the rollback fails, the script stops (exit 4) and prints the recovery path: restore the backup of
#      step 3 into a new database (scripts/backup/restore.sh) and point DATABASE_URL at it.
#
# Exit codes: 0 deployed; 1 usage/preflight; 2 backup failed (nothing changed); 3 release failed and was rolled back;
#             4 rollback failed — manual intervention (runbook docs/OPERATIONS.md §7.11).
#
# Drivers (DEPLOY_DRIVER):
#   compose (default) — docker compose on the target host; commands run locally or through `ssh $DEPLOY_SSH`.
#                       COMPOSE_FILE (deploy/docker-compose.yml), COMPOSE_ENV_FILE (deploy/.env), COMPOSE_DIR on the host.
#   hooks             — every step is a shell command from the environment (HOOK_CURRENT_IMAGE, HOOK_PENDING,
#                       HOOK_BACKUP, HOOK_MIGRATE_UP, HOOK_MIGRATE_DOWN, HOOK_SWITCH; $IMAGE and $N are exported):
#                       other orchestrators (Kubernetes, Nomad, plain systemd) and the pipeline's own tests.
# --dry-run prints the plan and every command that would run; it needs no secrets and changes nothing.
#
# Secrets are never printed: commands are logged with URLs redacted, and secret values come from the target's own
# environment / secret files (<VAR>_FILE, see docs/OPERATIONS.md §2.1), never from arguments of this script.
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

IMAGE=""
PREVIOUS="${DEPLOY_PREVIOUS_IMAGE:-}"
DRY_RUN="${DRY_RUN:-0}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --image) IMAGE="$2"; shift 2 ;;
    --previous) PREVIOUS="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) sed -n '2,40p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 1 ;;
  esac
done

DRIVER="${DEPLOY_DRIVER:-compose}"
HEALTH_URL="${DEPLOY_HEALTH_URL:-${PUBLIC_URL:-}}"
READY_TIMEOUT_S="${READY_TIMEOUT_S:-180}"
READY_STABLE="${READY_STABLE:-3}"
READY_INTERVAL_S="${READY_INTERVAL_S:-2}"
ROLLBACK_MIGRATIONS="${ROLLBACK_MIGRATIONS:-down}"
SMOKE_CMD="${SMOKE_CMD:-node $REPO_ROOT/scripts/deploy/smoke.mjs}"
REPORT="${DEPLOY_REPORT:-deploy-report.json}"
COMPOSE_FILE="${COMPOSE_FILE:-deploy/docker-compose.yml}"
COMPOSE_ENV_FILE="${COMPOSE_ENV_FILE:-deploy/.env}"
COMPOSE_DIR="${COMPOSE_DIR:-.}"
DEPLOY_SSH="${DEPLOY_SSH:-}"

log() { printf '%s [deploy] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
redact() { sed -E 's#(://[^:/@ ]+):[^@ ]*@#\1:***@#g; s#(password|secret|token|key)=[^ ]*#\1=***#Ig'; }
die() { log "ERROR: $*"; exit 1; }

[[ -n "$IMAGE" ]] || die "--image is required"
[[ "$DRIVER" == compose || "$DRIVER" == hooks ]] || die "DEPLOY_DRIVER must be compose or hooks"
[[ "$ROLLBACK_MIGRATIONS" == down || "$ROLLBACK_MIGRATIONS" == none ]] || die "ROLLBACK_MIGRATIONS must be down or none"
[[ "$DRY_RUN" == 1 || -n "$HEALTH_URL" ]] || die "set DEPLOY_HEALTH_URL (or PUBLIC_URL) for the readiness gate and smoke tests"

# ---------------------------------------------------------------- report
STEPS_JSON=""
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
step_record() { # name status ms [detail]
  local d
  d="$(printf '%s' "${4:-}" | tr -d '\000-\010\013\014\016-\037')"
  d="${d//\\/\\\\}"; d="${d//\"/\\\"}"; d="${d//$'\r'/}"; d="${d//$'\n'/\\n}"
  STEPS_JSON+="${STEPS_JSON:+,}{\"step\":\"$1\",\"status\":\"$2\",\"ms\":$3,\"detail\":\"$d\"}"
}
write_report() { # outcome exit_code
  printf '{"kind":"kb-deploy/1","image":"%s","previous":"%s","driver":"%s","dryRun":%s,"startedAt":"%s","finishedAt":"%s","outcome":"%s","exitCode":%s,"migrationsApplied":%s,"rollbackMigrations":"%s","steps":[%s]}\n' \
    "$IMAGE" "$PREVIOUS" "$DRIVER" "$([[ $DRY_RUN == 1 ]] && echo true || echo false)" "$STARTED_AT" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$2" "${APPLIED:-0}" "$ROLLBACK_MIGRATIONS" "$STEPS_JSON" >"$REPORT"
}
finish() { # outcome code
  write_report "$1" "$2"
  log "outcome: $1 (exit $2); report: $REPORT"
  exit "$2"
}
now_ms() { date +%s%3N; }

# Runs one named step; returns the command's status. Output goes to stderr (the CI log).
run_step() { # name command...
  local name="$1"; shift
  local t0 rc out
  t0="$(now_ms)"
  if [[ "$DRY_RUN" == 1 ]]; then
    log "[dry-run] $name: $(printf '%s ' "$@" | redact)"
    step_record "$name" "dry-run" 0 "$(printf '%s ' "$@" | redact)"
    return 0
  fi
  log "$name …"
  set +e
  out="$("$@" 2>&1)"
  rc=$?
  set -e
  [[ -n "$out" ]] && printf '%s\n' "$out" | redact | sed "s/^/  [$name] /" >&2
  step_record "$name" "$([[ $rc == 0 ]] && echo ok || echo "failed:$rc")" "$(( $(now_ms) - t0 ))" "$(printf '%s' "$out" | tail -n 3 | redact)"
  if [[ $rc == 0 ]]; then log "$name: ok"; else log "$name: FAILED ($rc)"; fi
  return $rc
}

# ---------------------------------------------------------------- driver: compose (optionally over ssh)
remote() { # command string executed on the target host in COMPOSE_DIR
  if [[ -n "$DEPLOY_SSH" ]]; then ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new "$DEPLOY_SSH" "cd $(printf %q "$COMPOSE_DIR") && $1"
  else (cd "$COMPOSE_DIR" && bash -c "$1"); fi
}
dc() { # compose with an image
  printf 'KB_IMAGE=%q docker compose -f %q --env-file %q %s' "$1" "$COMPOSE_FILE" "$COMPOSE_ENV_FILE" "$2"
}
compose_current_image() { remote "docker compose -f $(printf %q "$COMPOSE_FILE") --env-file $(printf %q "$COMPOSE_ENV_FILE") ps --format '{{.Image}}' app | head -n1"; }
compose_pending() { remote "$(dc "$1" "run --rm --no-deps -T app node apps/server/dist/cli.js migrate pending")" | tail -n1; }
compose_backup() { remote "$(dc "$PREVIOUS" "exec -T -e BACKUP_RECORD=1 backup /app/scripts/backup/backup.sh")"; }
compose_migrate_up() { remote "$(dc "$1" "run --rm --no-deps -T app node apps/server/dist/cli.js migrate up")"; }
compose_migrate_down() { remote "$(dc "$1" "run --rm --no-deps -T app node apps/server/dist/cli.js migrate down $2")"; }
compose_switch() { remote "$(dc "$1" "pull -q app backup") && $(dc "$1" "up -d --no-deps --wait --wait-timeout $READY_TIMEOUT_S app backup")"; }

# ---------------------------------------------------------------- driver: hooks
hook() { # VAR [IMAGE] [N]
  local cmd="${!1:-}"
  [[ -n "$cmd" ]] || { log "$1 is not set"; return 1; }
  IMAGE_ARG="${2:-}" N="${3:-}" IMAGE="${2:-$IMAGE}" bash -c "$cmd"
}

d_current() { if [[ $DRIVER == compose ]]; then compose_current_image; else hook HOOK_CURRENT_IMAGE; fi; }
d_pending() { if [[ $DRIVER == compose ]]; then compose_pending "$1"; else hook HOOK_PENDING "$1"; fi; }
d_backup() { if [[ $DRIVER == compose ]]; then compose_backup; else hook HOOK_BACKUP; fi; }
d_migrate_up() { if [[ $DRIVER == compose ]]; then compose_migrate_up "$1"; else hook HOOK_MIGRATE_UP "$1"; fi; }
d_migrate_down() { if [[ $DRIVER == compose ]]; then compose_migrate_down "$1" "$2"; else hook HOOK_MIGRATE_DOWN "$1" "$2"; fi; }
d_switch() { if [[ $DRIVER == compose ]]; then compose_switch "$1"; else hook HOOK_SWITCH "$1"; fi; }

ready_gate() {
  local deadline ok=0 code
  deadline=$(( $(date +%s) + READY_TIMEOUT_S ))
  while (( $(date +%s) < deadline )); do
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$HEALTH_URL/readyz" || true)"
    if [[ "$code" == 200 ]]; then
      ok=$((ok + 1))
      (( ok >= READY_STABLE )) && return 0
    else
      ok=0
    fi
    sleep "$READY_INTERVAL_S"
  done
  echo "readyz did not answer 200 ${READY_STABLE}x within ${READY_TIMEOUT_S}s (last: ${code:-none})"
  return 1
}
smoke() { KB_URL="$HEALTH_URL" bash -c "$SMOKE_CMD"; }

# ---------------------------------------------------------------- 1. preflight
if [[ "$DRY_RUN" != 1 ]]; then
  if [[ -z "$PREVIOUS" ]]; then
    PREVIOUS="$(d_current 2>/dev/null | tail -n1 || true)"
  fi
  [[ -n "$PREVIOUS" ]] || { log "cannot determine the current image (rollback target); pass --previous"; finish preflight-failed 1; }
  command -v curl >/dev/null || { log "curl is required"; finish preflight-failed 1; }
fi
step_record preflight ok 0 "new=$IMAGE previous=${PREVIOUS:-unknown} driver=$DRIVER"
log "deploying $IMAGE (previous: ${PREVIOUS:-unknown}, driver: $DRIVER$([[ $DRY_RUN == 1 ]] && echo ", dry run"))"
if [[ "$PREVIOUS" == "$IMAGE" ]]; then log "image $IMAGE is already deployed — re-running gates only"; fi

# ---------------------------------------------------------------- 2. plan
APPLIED=0
if [[ "$DRY_RUN" == 1 ]]; then
  run_step plan d_pending "$IMAGE"
  PENDING=0
else
  PENDING="$(d_pending "$IMAGE" 2>/dev/null | tail -n1 | tr -dc '0-9')"
  [[ -n "$PENDING" ]] || { step_record plan failed 0 "cannot count pending migrations"; finish preflight-failed 1; }
  step_record plan ok 0 "pending migrations: $PENDING"
  log "plan: $PENDING pending migration(s)"
fi

# ---------------------------------------------------------------- 3. backup (always before anything changes)
if ! run_step backup d_backup; then finish backup-failed 2; fi

rollback() {
  log "ROLLBACK: $1"
  if (( APPLIED > 0 )) && [[ "$ROLLBACK_MIGRATIONS" == down ]]; then
    if ! run_step rollback-migrations d_migrate_down "$IMAGE" "$APPLIED"; then
      log "migrations could not be rolled back. Recovery: restore the backup taken in step 'backup' into a NEW database (scripts/backup/restore.sh), point DATABASE_URL at it, then deploy $PREVIOUS (docs/OPERATIONS.md §7.11)."
      finish rollback-failed 4
    fi
  fi
  if ! run_step rollback-switch d_switch "$PREVIOUS"; then finish rollback-failed 4; fi
  if ! run_step rollback-ready ready_gate; then finish rollback-failed 4; fi
  if ! run_step rollback-smoke smoke; then finish rollback-failed 4; fi
  finish rolled-back 3
}

# ---------------------------------------------------------------- 4–7. migrate, switch, gates
if (( PENDING > 0 )) || [[ "$DRY_RUN" == 1 ]]; then
  if ! run_step migrate d_migrate_up "$IMAGE"; then
    # a failed migration runs in its own transaction; whatever completed before it is counted as applied
    APPLIED="$( (d_pending "$IMAGE" 2>/dev/null || echo "$PENDING") | tail -n1 | tr -dc '0-9')"
    APPLIED=$(( PENDING - ${APPLIED:-$PENDING} ))
    rollback "migration failed"
  fi
  APPLIED="$PENDING"
fi
run_step switch d_switch "$IMAGE" || rollback "switch failed"
run_step ready ready_gate || rollback "readiness gate failed"
run_step smoke smoke || rollback "smoke tests failed"
finish "$([[ $DRY_RUN == 1 ]] && echo dry-run || echo deployed)" 0
