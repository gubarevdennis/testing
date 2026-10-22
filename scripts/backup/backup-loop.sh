#!/usr/bin/env bash
# Backup sidecar entry point (deploy/docker-compose.yml): runs backup.sh every BACKUP_SCHEDULE_SECONDS and
# verify-backup.sh after every BACKUP_VERIFY_EVERY-th backup. Use cron/systemd timers instead when available:
#   15 2 * * *  DATABASE_URL=... /opt/kb/scripts/backup/backup.sh
#   45 3 * * 0  DATABASE_URL=... /opt/kb/scripts/backup/verify-backup.sh --latest /backups
# A failed run is logged and retried at the next interval; alerting relies on kb_backup_age_seconds.
set -euo pipefail
LOG_TAG=backup-loop
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
: "${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
INTERVAL="${BACKUP_SCHEDULE_SECONDS:-86400}"
VERIFY_EVERY="${BACKUP_VERIFY_EVERY:-7}"
export BACKUP_METRICS_FILE="${BACKUP_METRICS_FILE:-$BACKUP_DIR/metrics/backup.prom}"
export VERIFY_METRICS_FILE="${VERIFY_METRICS_FILE:-$BACKUP_DIR/metrics/verify.prom}"
mkdir -p "$(dirname "$BACKUP_METRICS_FILE")"
n=0
trap 'log "stopping"; exit 0' TERM INT
while true; do
  if "$SCRIPT_DIR/backup.sh" --dir "$BACKUP_DIR"; then
    n=$((n + 1))
    if [[ "$VERIFY_EVERY" -gt 0 && $((n % VERIFY_EVERY)) -eq 1 ]] || [[ "$VERIFY_EVERY" -eq 1 ]]; then
      "$SCRIPT_DIR/verify-backup.sh" --latest "$BACKUP_DIR" >/dev/null || log "verification FAILED"
    fi
  else
    log "backup FAILED — retrying at the next interval"
  fi
  sleep "$INTERVAL" &
  wait $!
done
