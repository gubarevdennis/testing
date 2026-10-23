#!/usr/bin/env bash
# Backup sidecar entry point (deploy/docker-compose.yml). Use systemd timers instead when available (deploy/systemd/kb-*.timer).
#   every BACKUP_OBJECTS_SYNC_SECONDS (120): backup.sh --objects-only (new files → pool; file RPO), then offsite-sync.sh
#                                            when OFFSITE_TARGET is set (second medium / offsite; site-loss RPO)
#   every BACKUP_SCHEDULE_SECONDS (86400):   backup.sh (full logical backup), basebackup.sh when BASEBACKUP_URL is set (PITR),
#                                            verify-backup.sh after every BACKUP_VERIFY_EVERY-th full backup
# A failed run is logged and retried at the next interval; alerting relies on the textfile metrics and kb_backup_age_seconds.
set -euo pipefail
LOG_TAG=backup-loop
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
: "${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
INTERVAL="${BACKUP_SCHEDULE_SECONDS:-86400}"
OBJ_INTERVAL="${BACKUP_OBJECTS_SYNC_SECONDS:-120}"
VERIFY_EVERY="${BACKUP_VERIFY_EVERY:-7}"
export BACKUP_METRICS_FILE="${BACKUP_METRICS_FILE:-$BACKUP_DIR/metrics/backup.prom}"
export VERIFY_METRICS_FILE="${VERIFY_METRICS_FILE:-$BACKUP_DIR/metrics/verify.prom}"
mkdir -p "$(dirname "$BACKUP_METRICS_FILE")"
n=0
next_full=0
trap 'log "stopping"; exit 0' TERM INT
while true; do
  if [[ $(date +%s) -ge $next_full ]]; then
    next_full=$(( $(date +%s) + INTERVAL ))
    if "$SCRIPT_DIR/backup.sh" --dir "$BACKUP_DIR"; then
      n=$((n + 1))
      if [[ "$VERIFY_EVERY" -gt 0 && $((n % VERIFY_EVERY)) -eq 1 ]] || [[ "$VERIFY_EVERY" -eq 1 ]]; then
        "$SCRIPT_DIR/verify-backup.sh" --latest "$BACKUP_DIR" >/dev/null || log "verification FAILED"
      fi
    else
      log "backup FAILED — retrying at the next interval"
      next_full=$(( $(date +%s) + OBJ_INTERVAL ))
    fi
    if [[ -n "${BASEBACKUP_URL:-}" ]]; then
      BACKUP_DIR="$BACKUP_DIR" "$SCRIPT_DIR/basebackup.sh" >/dev/null || log "base backup FAILED"
    fi
  else
    "$SCRIPT_DIR/backup.sh" --dir "$BACKUP_DIR" --objects-only || log "object sync FAILED"
  fi
  if [[ -n "${OFFSITE_TARGET:-}" ]]; then
    BACKUP_DIR="$BACKUP_DIR" "$SCRIPT_DIR/offsite-sync.sh" >/dev/null || log "offsite sync FAILED"
  fi
  sleep "$OBJ_INTERVAL" &
  wait $!
done
