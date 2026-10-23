#!/usr/bin/env bash
# Scheduled proof that the PITR chain (base backup + archived WAL + object pool) restores: recovers the newest base backup
# and every archived WAL segment into a THROW-AWAY independent cluster, materialises the referenced objects, checks the
# audit hash chain and that every document decodes, then stops and deletes the copy. Monthly (spec) — kb-pitr-verify.timer.
#
#   BACKUP_DECRYPT_CMD=… WAL_DECRYPT_CMD=… scripts/backup/verify-pitr.sh --repo /backups [--wal /backups/wal] [--report FILE]
#
# --repo is the repository root (base/, objects/); run it against the OFFSITE copy too, to prove that one restores.
# Exit 1 on any failure. Metric: <BACKUP_METRICS_FILE>-pitr-verify.prom, kb_pitr_verify_last_success_timestamp_seconds.
set -euo pipefail
LOG_TAG=verify-pitr
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
REPO=""; WAL=""; REPORT=""; KEEP=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) REPO="$2"; shift 2 ;;
    --wal) WAL="$2"; shift 2 ;;
    --report) REPORT="$2"; shift 2 ;;
    --keep) KEEP=1; shift ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done
[[ -d "$REPO/base" ]] || die "usage: verify-pitr.sh --repo DIR (with base/ and objects/) [--wal DIR]"
REPO="$(cd "$REPO" && pwd)"
WAL="${WAL:-$REPO/wal}"
BIN="$(pg_server_bin)" || die "PostgreSQL server binaries not found; set PG_BIN"
T0=$(now_ms)
SCRATCH="$(mktemp -d "${VERIFY_PITR_TMP:-${TMPDIR:-/tmp}}/kb-pitr-verify.XXXXXX")"
chmod 0755 "$SCRATCH"
cleanup() {
  [[ -f "$SCRATCH/pgdata/PG_VERSION" ]] && pg_as "$BIN/pg_ctl" -D "$SCRATCH/pgdata" -m fast stop >/dev/null 2>&1 || true
  [[ $KEEP -eq 1 ]] || rm -rf -- "$SCRATCH"
}
trap cleanup EXIT

REC="$("$SCRIPT_DIR/pitr-restore.sh" --base-root "$REPO/base" --wal "$WAL" --pgdata "$SCRATCH/pgdata" --latest | tail -n 1)"
URL="$(jq -r .url <<<"$REC")"
"$SCRIPT_DIR/restore-objects.sh" --db "$URL" --pool "$REPO/objects" --target "$SCRATCH/objects" --allow-missing --report "$SCRATCH/objects.json"
AUDIT="$(DATABASE_URL="$URL" kb_cli audit-verify)"
grep -q 'ok: true' <<<"$AUDIT" || die "audit hash chain broken in the restored copy: $AUDIT"
DOCS="$(node "$SCRIPT_DIR/check-docs.mjs" "$URL")" || die "documents do not decode in the restored copy: $DOCS"
OUT="$(jq -cn --argjson rec "$REC" --slurpfile obj "$SCRATCH/objects.json" --argjson docs "$DOCS" --arg audit "$AUDIT" --argjson ms "$(( $(now_ms) - T0 ))" \
  '{ok: true, at: (now | todate), restore: ($rec | {base, lastReplayedTransaction, ms, stepsMs}), objects: ($obj[0] | {blobs, missingBlobs: (.missingBlobs | length), missingDerivatives: (.missingDerivatives | length)}),
    documents: ($docs | {documents, journalUpdates, revisions}), audit: $audit, ms: $ms}')"
[[ -n "$REPORT" ]] && printf '%s\n' "$OUT" >"$REPORT"
write_metric pitr-verify kb_pitr_verify_last_success_timestamp_seconds "$(date +%s)" "Unix time of the last successful PITR restore test (verify-pitr.sh)."
log "PITR chain restores: $(jq -c '{restore: .restore.ms, objects, documents}' <<<"$OUT")"
printf '%s\n' "$OUT"
