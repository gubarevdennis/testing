#!/usr/bin/env bash
# Restores a backup written by backup.sh into a NEW database and a NEW object directory, then verifies it.
# It never overwrites a live installation: the target database must be empty and the target storage
# directory empty or absent (use a new name and switch the application over after verification).
#
#   scripts/backup/restore.sh /backups/kb-20261022T020000Z \
#       --target-db postgres://kb:...@db/kb_restored --create \
#       --target-storage /var/lib/kb/objects-restored
#
# Steps: SHA256SUMS → decrypt (BACKUP_DECRYPT_CMD) → dump checksum → pg_restore → row counts vs manifest →
#        objects copied from the pool and every sha256 re-checked → migrations (server CLI) → audit-verify.
#
# Options / environment:
#   --target-db URL        | TARGET_DATABASE_URL     database to restore into (required)
#   --create               | RESTORE_CREATE_DB=1     create the target database (via TARGET_ADMIN_URL, default: same server, db "postgres")
#   --target-storage DIR   | TARGET_STORAGE_ROOT     object directory to fill (required for fs)
#   --target-s3-bucket B   | TARGET_S3_BUCKET        additionally upload restored objects to an S3 bucket (aws CLI, TARGET_S3_ENDPOINT)
#   --pool DIR             | BACKUP_POOL             object pool (default: <backup>/../objects)
#   --report FILE                                    write the JSON report there as well
#   --skip-migrate / --skip-audit                    for diagnostics only
#   --jobs N               | RESTORE_JOBS=2          pg_restore parallelism
#   BACKUP_DECRYPT_CMD                               decryption filter for encrypted backups
#   KB_CLI                                           server CLI command (default: dist/cli.js or tsx src/cli.ts)
set -euo pipefail
LOG_TAG=restore
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

BACKUP_PATH=""
TARGET_DATABASE_URL="${TARGET_DATABASE_URL:-}"
TARGET_STORAGE_ROOT="${TARGET_STORAGE_ROOT:-}"
TARGET_S3_BUCKET="${TARGET_S3_BUCKET:-}"
RESTORE_CREATE_DB="${RESTORE_CREATE_DB:-0}"
BACKUP_POOL="${BACKUP_POOL:-}"
RESTORE_JOBS="${RESTORE_JOBS:-2}"
REPORT=""
SKIP_MIGRATE=0
SKIP_AUDIT=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --target-db) TARGET_DATABASE_URL="$2"; shift 2 ;;
    --create) RESTORE_CREATE_DB=1; shift ;;
    --target-storage) TARGET_STORAGE_ROOT="$2"; shift 2 ;;
    --target-s3-bucket) TARGET_S3_BUCKET="$2"; shift 2 ;;
    --pool) BACKUP_POOL="$2"; shift 2 ;;
    --report) REPORT="$2"; shift 2 ;;
    --jobs) RESTORE_JOBS="$2"; shift 2 ;;
    --skip-migrate) SKIP_MIGRATE=1; shift ;;
    --skip-audit) SKIP_AUDIT=1; shift ;;
    -h|--help) sed -n '2,28p' "$0"; exit 0 ;;
    -*) die "unknown option: $1" ;;
    *) [[ -z "$BACKUP_PATH" ]] || die "only one backup path expected"; BACKUP_PATH="$1"; shift ;;
  esac
done
[[ -n "$BACKUP_PATH" ]] || die "usage: restore.sh <backup-dir> --target-db URL --target-storage DIR [--create]"
[[ -n "$TARGET_DATABASE_URL" ]] || die "--target-db (TARGET_DATABASE_URL) is required"
[[ -n "$TARGET_STORAGE_ROOT" ]] || die "--target-storage (TARGET_STORAGE_ROOT) is required"
need jq pg_restore psql sha256sum
umask 077

T0=$(now_ms)
BACKUP_PATH="$(cd "$BACKUP_PATH" && pwd)"
[[ -f "$BACKUP_PATH/manifest.json" ]] || die "$BACKUP_PATH/manifest.json not found (incomplete backup?)"
BACKUP_POOL="${BACKUP_POOL:-$BACKUP_PATH/../objects}"
[[ -d "$BACKUP_POOL" ]] || die "object pool not found: $BACKUP_POOL"
BACKUP_POOL="$(cd "$BACKUP_POOL" && pwd)"
MANIFEST="$BACKUP_PATH/manifest.json"
[[ "$(jq -r .format "$MANIFEST")" == "$KB_BACKUP_FORMAT" ]] || die "unsupported backup format: $(jq -r .format "$MANIFEST")"
ENCRYPTED="$(jq -r 'if .encryption.enabled then 1 else 0 end' "$MANIFEST")"
ENC_SUFFIX=""; [[ "$ENCRYPTED" == "1" ]] && ENC_SUFFIX=".enc"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/kb-restore.XXXXXX")"
trap 'rm -rf -- "$TMP"' EXIT

# ---------------------------------------------------------------- 1. backup file checksums
T=$(now_ms)
( cd "$BACKUP_PATH" && sha256sum --quiet --strict -c SHA256SUMS ) || die "SHA256SUMS check failed — backup is damaged"
[[ "$(sha256_file "$BACKUP_PATH/objects.list")" == "$(jq -r .objects.listSha256 "$MANIFEST")" ]] || die "objects.list checksum mismatch"
DB_FILE="$BACKUP_PATH/$(jq -r .database.file "$MANIFEST")"
[[ "$(sha256_file "$DB_FILE")" == "$(jq -r .database.sha256 "$MANIFEST")" ]] || die "database dump checksum mismatch"
DUMP="$DB_FILE"
if [[ "$ENCRYPTED" == "1" ]]; then
  DUMP="$TMP/db.dump"
  fetch_file "$DB_FILE" "$DUMP" 1
fi
[[ "$(sha256_file "$DUMP")" == "$(jq -r .database.plainSha256 "$MANIFEST")" ]] || die "decrypted dump checksum mismatch (wrong key?)"
CHECKSUM_MS=$(( $(now_ms) - T ))
log "backup $(jq -r .id "$MANIFEST") checksums ok (${CHECKSUM_MS} ms)"

# ---------------------------------------------------------------- 2. database
T=$(now_ms)
TARGET_DB="$(url_dbname "$TARGET_DATABASE_URL")"
[[ "$TARGET_DB" =~ ^[A-Za-z0-9_]+$ ]] || die "unsupported target database name: $TARGET_DB"
if [[ "$RESTORE_CREATE_DB" == "1" ]]; then
  ADMIN_URL="${TARGET_ADMIN_URL:-$(url_with_db "$TARGET_DATABASE_URL" postgres)}"
  exists="$(psql_q "$ADMIN_URL" -v db="$TARGET_DB" <<<"select 1 from pg_database where datname = :'db'")"
  [[ -z "$exists" ]] || die "target database $TARGET_DB already exists (choose a new name; restore never overwrites)"
  psql_q "$ADMIN_URL" -c "create database \"$TARGET_DB\"" >/dev/null
  log "created database $TARGET_DB"
fi
tables="$(psql_q "$TARGET_DATABASE_URL" -c "select count(*) from pg_tables where schemaname = 'public'")"
[[ "$tables" == "0" ]] || die "target database $TARGET_DB is not empty ($tables tables)"
# Extension comments belong to the bootstrap superuser and cannot be restored by an ordinary owner.
pg_restore -l "$DUMP" | grep -v 'COMMENT - EXTENSION' >"$TMP/restore.list"
pg_restore --no-owner --no-privileges --exit-on-error --jobs="$RESTORE_JOBS" -L "$TMP/restore.list" -d "$TARGET_DATABASE_URL" "$DUMP"
DB_MS=$(( $(now_ms) - T ))
log "database restored into $(redact_url "$TARGET_DATABASE_URL") (${DB_MS} ms)"

# Row counts must equal the counts taken in the dump's snapshot.
count_sql | psql_q "$TARGET_DATABASE_URL" -F $'\t' >"$TMP/counts.tsv"
COUNTS_JSON="$(jq -R -s 'split("\n") | map(select(length > 0) | split("\t") | {key: .[0], value: (.[1] | tonumber)}) | from_entries' "$TMP/counts.tsv")"
COUNT_DIFF="$(jq -n --argjson a "$(jq .rowCounts "$MANIFEST")" --argjson b "$COUNTS_JSON" '[$a | to_entries[] | select($b[.key] != .value) | {table: .key, expected: .value, actual: $b[.key]}]')"
[[ "$COUNT_DIFF" == "[]" ]] || die "row counts differ from the manifest: $COUNT_DIFF"
log "row counts match the manifest ($(jq 'length' <<<"$COUNTS_JSON") tables)"

# ---------------------------------------------------------------- 3. objects
T=$(now_ms)
mkdir -p "$TARGET_STORAGE_ROOT"
TARGET_STORAGE_ROOT="$(cd "$TARGET_STORAGE_ROOT" && pwd)"
if [[ -n "$(find "$TARGET_STORAGE_ROOT" -mindepth 1 -type f ! -path "$TARGET_STORAGE_ROOT/tmp/*" -print -quit)" ]]; then
  die "target storage $TARGET_STORAGE_ROOT is not empty"
fi
OBJ_COUNT=0; OBJ_BYTES=0
: >"$TMP/check.sha256"
while read -r sha size key; do
  [[ -n "$key" ]] || continue
  case "$key" in /*|*..*) die "unsafe key in objects.list: $key" ;; esac
  src="$BACKUP_POOL/${sha:0:2}/$sha$ENC_SUFFIX"
  [[ -f "$src" ]] || die "object $sha ($key) missing from the pool $BACKUP_POOL"
  fetch_file "$src" "$TARGET_STORAGE_ROOT/$key" "$ENCRYPTED"
  printf '%s  %s\n' "$sha" "$key" >>"$TMP/check.sha256"
  OBJ_COUNT=$((OBJ_COUNT + 1)); OBJ_BYTES=$((OBJ_BYTES + size))
done <"$BACKUP_PATH/objects.list"
( cd "$TARGET_STORAGE_ROOT" && sha256sum --quiet --strict -c "$TMP/check.sha256" ) || die "restored objects failed the sha256 check"
mkdir -p "$TARGET_STORAGE_ROOT/tmp" "$TARGET_STORAGE_ROOT/blobs"
if [[ -n "$TARGET_S3_BUCKET" ]]; then
  need aws
  aws ${TARGET_S3_ENDPOINT:+--endpoint-url "$TARGET_S3_ENDPOINT"} s3 sync "$TARGET_STORAGE_ROOT/" "s3://$TARGET_S3_BUCKET/" --exclude 'tmp/*' --only-show-errors
  log "objects uploaded to s3://$TARGET_S3_BUCKET"
fi
OBJ_MS=$(( $(now_ms) - T ))
log "objects restored: $OBJ_COUNT ($OBJ_BYTES bytes), sha256 verified (${OBJ_MS} ms)"

# ---------------------------------------------------------------- 4. migrations + audit chain
T=$(now_ms)
MIGRATE_OUT="skipped"
if [[ "$SKIP_MIGRATE" != "1" ]]; then
  MIGRATE_OUT="$(DATABASE_URL="$TARGET_DATABASE_URL" STORAGE_DRIVER=fs STORAGE_ROOT="$TARGET_STORAGE_ROOT" kb_cli migrate up --skip-backup-check 2>&1)" || die "migrations failed: $MIGRATE_OUT"
  log "migrations: $MIGRATE_OUT"
fi
MIGRATE_MS=$(( $(now_ms) - T ))
T=$(now_ms)
AUDIT_OUT="skipped"
if [[ "$SKIP_AUDIT" != "1" ]]; then
  AUDIT_OUT="$(DATABASE_URL="$TARGET_DATABASE_URL" STORAGE_DRIVER=fs STORAGE_ROOT="$TARGET_STORAGE_ROOT" kb_cli audit-verify 2>&1)" || die "audit-verify failed: $AUDIT_OUT"
  grep -q 'ok: true' <<<"$AUDIT_OUT" || die "audit chain verification FAILED: $AUDIT_OUT"
  log "audit chain: $(tr -s ' \n' ' ' <<<"$AUDIT_OUT")"
fi
AUDIT_MS=$(( $(now_ms) - T ))
TOTAL_MS=$(( $(now_ms) - T0 ))

REPORT_JSON="$(jq -n --arg backup "$(jq -r .id "$MANIFEST")" --arg target "$(redact_url "$TARGET_DATABASE_URL")" --arg storage "$TARGET_STORAGE_ROOT" \
  --argjson counts "$COUNTS_JSON" --argjson objects "$OBJ_COUNT" --argjson bytes "$OBJ_BYTES" \
  --arg migrate "$MIGRATE_OUT" --arg audit "$(tr -s ' \n' ' ' <<<"$AUDIT_OUT")" \
  --argjson checksumMs "$CHECKSUM_MS" --argjson dbMs "$DB_MS" --argjson objMs "$OBJ_MS" --argjson migrateMs "$MIGRATE_MS" --argjson auditMs "$AUDIT_MS" --argjson totalMs "$TOTAL_MS" \
  '{ok: true, backup: $backup, targetDatabase: $target, targetStorage: $storage, rowCounts: $counts, objects: $objects, objectBytes: $bytes,
    migrations: $migrate, auditChain: $audit,
    timingsMs: {checksums: $checksumMs, database: $dbMs, objects: $objMs, migrations: $migrateMs, audit: $auditMs, total: $totalMs}}')"
[[ -z "$REPORT" ]] || printf '%s\n' "$REPORT_JSON" >"$REPORT"
log "restore complete in ${TOTAL_MS} ms"
printf '%s\n' "$REPORT_JSON"
