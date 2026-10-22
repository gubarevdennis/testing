#!/usr/bin/env bash
# Proves a backup is restorable: restores it into a TEMPORARY database + object directory and checks consistency.
# A backup counts as valid only after this succeeds (spec E-08 / D-08 / AT-60).
#
#   DATABASE_URL=postgres://kb@db/kb scripts/backup/verify-backup.sh /backups/kb-20261022T020000Z
#   scripts/backup/verify-backup.sh --latest /backups
#
# Checks (in addition to everything restore.sh verifies: file checksums, row counts, object sha256,
# migrations, audit hash chain):
#   - every attachment version references an existing blob row, and the current version exists;
#   - every blob row has its object in the restored store, with the recorded size and sha256;
#   - every derivative (thumbnail/tiles) object exists;
#   - every document replays from snapshot + journal without gaps or pending structs, every revision decodes.
#
# Environment:
#   VERIFY_ADMIN_URL   connection used to CREATE/DROP the temporary database (default: DATABASE_URL with db "postgres")
#   DATABASE_URL       source installation: verify result is recorded in its "backups" table (VERIFY_RECORD=1)
#   VERIFY_KEEP=1      keep the temporary database and directory for inspection
#   VERIFY_METRICS_FILE  optional textfile-collector output
#   BACKUP_DECRYPT_CMD, KB_CLI as for restore.sh
set -euo pipefail
LOG_TAG=verify
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

BACKUP_PATH=""
LATEST_IN=""
VERIFY_KEEP="${VERIFY_KEEP:-0}"
VERIFY_RECORD="${VERIFY_RECORD:-1}"
REPORT=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --latest) LATEST_IN="$2"; shift 2 ;;
    --keep) VERIFY_KEEP=1; shift ;;
    --report) REPORT="$2"; shift 2 ;;
    -h|--help) sed -n '2,24p' "$0"; exit 0 ;;
    -*) die "unknown option: $1" ;;
    *) BACKUP_PATH="$1"; shift ;;
  esac
done
if [[ -n "$LATEST_IN" ]]; then
  BACKUP_PATH="$(ls -1d "$LATEST_IN"/kb-*Z 2>/dev/null | sort | tail -n 1 || true)"
  [[ -n "$BACKUP_PATH" ]] || die "no completed backups in $LATEST_IN"
fi
[[ -n "$BACKUP_PATH" ]] || die "usage: verify-backup.sh <backup-dir> | --latest <backup-root>"
need jq psql node sha256sum
BACKUP_PATH="$(cd "$BACKUP_PATH" && pwd)"
MANIFEST="$BACKUP_PATH/manifest.json"
[[ -f "$MANIFEST" ]] || die "not a backup: $BACKUP_PATH"

ADMIN_URL="${VERIFY_ADMIN_URL:-}"
if [[ -z "$ADMIN_URL" ]]; then
  [[ -n "${DATABASE_URL:-}" ]] || die "set VERIFY_ADMIN_URL (or DATABASE_URL) to reach a PostgreSQL server for the temporary database"
  ADMIN_URL="$(url_with_db "$DATABASE_URL" postgres)"
fi
T0=$(now_ms)
VDB="kb_verify_$(date -u +%Y%m%d%H%M%S)_$$"
VURL="$(url_with_db "$ADMIN_URL" "$VDB")"
VDIR="$(mktemp -d "${TMPDIR:-/tmp}/kb-verify.XXXXXX")"
RESULT="failed"
DETAILS='{}'

finish() {
  local rc=$?
  if [[ "$VERIFY_KEEP" != "1" ]]; then
    psql_q "$ADMIN_URL" -c "drop database if exists \"$VDB\" with (force)" >/dev/null 2>&1 || log "warning: could not drop $VDB"
    rm -rf -- "$VDIR"
  else
    log "kept temporary database $VDB and directory $VDIR"
  fi
  local rec
  rec="$(jq -r '.backupRecordId // empty' "$MANIFEST" 2>/dev/null || true)"
  if [[ "$VERIFY_RECORD" == "1" && -n "${DATABASE_URL:-}" && -n "$rec" ]]; then
    psql_q "$DATABASE_URL" -v id="$rec" -v st="$RESULT" -v det="$DETAILS" \
      <<<"update backups set verified_at = now(), verify_status = :'st', verify_details = :'det'::jsonb where id = :'id'" >/dev/null 2>&1 \
      || log "warning: could not record the verification result in the source database"
  fi
  [[ $rc -eq 0 ]] || log "verification FAILED for $BACKUP_PATH"
}
trap finish EXIT

# ---------------------------------------------------------------- restore into the temporary installation
T=$(now_ms)
RESTORE_JSON="$("$SCRIPT_DIR/restore.sh" "$BACKUP_PATH" --create --target-db "$VURL" --target-storage "$VDIR/objects")"
RESTORE_MS=$(( $(now_ms) - T ))

# ---------------------------------------------------------------- referential checks
T=$(now_ms)
check_zero() { # label sql
  local n
  n="$(psql_q "$VURL" -c "$2")"
  [[ "$n" == "0" ]] || die "$1: $n problem row(s)"
}
check_zero "attachment versions without blob row" "select count(*) from attachment_versions v left join blobs b on b.sha256 = v.blob_sha256 where b.sha256 is null"
check_zero "attachments without their current version" "select count(*) from attachments a left join attachment_versions v on v.attachment_id = a.id and v.version = a.current_version where v.attachment_id is null"
check_zero "derivatives without blob row" "select count(*) from blob_derivatives d left join blobs b on b.sha256 = d.blob_sha256 where b.sha256 is null"
check_zero "blobs whose storage key does not match their hash" "select count(*) from blobs where storage_key <> 'blobs/' || substr(sha256, 1, 2) || '/' || substr(sha256, 3, 2) || '/' || sha256"

# every blob: file present, size as recorded, content hash = sha256 (re-read from the restored store)
psql_q "$VURL" -F ' ' -c "select sha256, size, storage_key from blobs order by sha256" >"$VDIR/blobs.txt"
BLOBS=0; MISSING=0; BADSIZE=0
: >"$VDIR/blobs.sha256"
while read -r sha size key; do
  [[ -n "$sha" ]] || continue
  BLOBS=$((BLOBS + 1))
  f="$VDIR/objects/$key"
  if [[ ! -f "$f" ]]; then log "missing object for blob $sha ($key)"; MISSING=$((MISSING + 1)); continue; fi
  if [[ "$(size_file "$f")" != "$size" ]]; then log "size mismatch for blob $sha"; BADSIZE=$((BADSIZE + 1)); fi
  printf '%s  %s\n' "$sha" "$key" >>"$VDIR/blobs.sha256"
done <"$VDIR/blobs.txt"
[[ $MISSING -eq 0 && $BADSIZE -eq 0 ]] || die "$MISSING missing / $BADSIZE wrong-size blob object(s)"
( cd "$VDIR/objects" && sha256sum --quiet --strict -c "$VDIR/blobs.sha256" ) || die "blob content does not match sha256"
DERIV_MISSING=0
while read -r key; do
  [[ -z "$key" || -e "$VDIR/objects/$key" ]] || { log "missing derivative $key"; DERIV_MISSING=$((DERIV_MISSING + 1)); }
done < <(psql_q "$VURL" -c "select storage_key from blob_derivatives")
[[ $DERIV_MISSING -eq 0 ]] || die "$DERIV_MISSING derivative object(s) missing"
REF_MS=$(( $(now_ms) - T ))
log "references ok: $BLOBS blobs present with matching size and sha256"

# ---------------------------------------------------------------- documents decode
T=$(now_ms)
DOCS_JSON="$(cd "$REPO_ROOT" && node "$SCRIPT_DIR/check-docs.mjs" "$VURL")" || die "document check failed: $DOCS_JSON"
DOCS_MS=$(( $(now_ms) - T ))
log "documents ok: $DOCS_JSON"

TOTAL_MS=$(( $(now_ms) - T0 ))
RESULT="ok"
DETAILS="$(jq -n -c --arg backup "$(jq -r .id "$MANIFEST")" --argjson restore "$RESTORE_JSON" --argjson blobs "$BLOBS" --argjson docs "$DOCS_JSON" \
  --argjson restoreMs "$RESTORE_MS" --argjson refMs "$REF_MS" --argjson docsMs "$DOCS_MS" --argjson totalMs "$TOTAL_MS" \
  '{ok: true, backup: $backup, rowCounts: $restore.rowCounts, objects: $restore.objects, objectBytes: $restore.objectBytes, blobsVerified: $blobs,
    documents: $docs, auditChain: $restore.auditChain,
    timingsMs: {restore: $restoreMs, restoreBreakdown: $restore.timingsMs, references: $refMs, documents: $docsMs, total: $totalMs}}')"
[[ -z "$REPORT" ]] || printf '%s\n' "$DETAILS" | jq . >"$REPORT"
if [[ -n "${VERIFY_METRICS_FILE:-}" ]]; then
  {
    echo "# HELP kb_restore_verification_last_success_timestamp_seconds Unix time of the last successful restore verification (verify-backup.sh)."
    echo "# TYPE kb_restore_verification_last_success_timestamp_seconds gauge"
    echo "kb_restore_verification_last_success_timestamp_seconds $(date +%s)"
    echo "# HELP kb_restore_verification_duration_seconds Duration of the last restore verification."
    echo "# TYPE kb_restore_verification_duration_seconds gauge"
    echo "kb_restore_verification_duration_seconds $(awk -v ms="$TOTAL_MS" 'BEGIN{printf "%.3f", ms/1000}')"
  } >"$VERIFY_METRICS_FILE.tmp" && mv -f "$VERIFY_METRICS_FILE.tmp" "$VERIFY_METRICS_FILE"
fi
log "backup $(jq -r .id "$MANIFEST") VERIFIED in ${TOTAL_MS} ms"
printf '%s\n' "$DETAILS"
