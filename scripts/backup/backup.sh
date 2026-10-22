#!/usr/bin/env bash
# Full logical backup of the knowledge base: PostgreSQL (pg_dump, custom format) + object store.
#
#   DATABASE_URL=postgres://kb_backup@db/kb BACKUP_DIR=/backups STORAGE_ROOT=/var/lib/kb/objects \
#     scripts/backup/backup.sh
#
# Layout written under BACKUP_DIR:
#   objects/<aa>/<sha256>[.enc]     content-addressed pool shared by all backups (incremental: only new objects are copied)
#   kb-YYYYMMDDTHHMMSSZ/
#     db.dump[.enc]                 pg_dump -Fc taken in an exported REPEATABLE READ snapshot
#     objects.list                  "<sha256> <size> <storage key>" for every object of the store at backup time
#     manifest.json                 sizes, checksums, timings, row counts (same snapshot as the dump), schema version
#     SHA256SUMS                    checksums of the files above (sha256sum -c compatible)
#     base/                         optional physical base backup (BACKUP_PG_BASEBACKUP=1, for PITR with WAL archive)
#
# Consistency: the dump is taken first, the object store is copied afterwards. Objects are immutable and
# content-addressed, so every blob referenced by the dump already exists when it is copied.
#
# Environment (no secrets in this file):
#   DATABASE_URL            required; role needs SELECT on all tables (+ INSERT/UPDATE on "backups" when BACKUP_RECORD=1)
#   BACKUP_DIR              destination root (default ./backups)
#   STORAGE_DRIVER          fs | s3 (default fs)
#   STORAGE_ROOT            fs object root (default $KB_DATA_DIR/objects, KB_DATA_DIR default .data)
#   S3_BUCKET, S3_ENDPOINT  s3 driver: the bucket is mirrored with `aws s3 sync` into BACKUP_DIR/.s3-mirror first
#   BACKUP_ENCRYPT_CMD      optional stdin→stdout encryption filter (age / gpg / openssl); see lib.sh
#   BACKUP_KEEP_DAILY=30 BACKUP_KEEP_WEEKLY=12 BACKUP_KEEP_MONTHLY=12   retention (spec: 30 d / 12 w / 12 m; newest per period)
#   BACKUP_KEEP_LAST=3      the N most recent backups are always kept (intra-day runs)
#   BACKUP_PRUNE=1          apply retention + garbage-collect the object pool after a successful backup
#   BACKUP_RECORD=1         record the run in the application's "backups" table (feeds kb_backup_age_seconds)
#   BACKUP_PG_BASEBACKUP=0  also take a physical pg_basebackup (needs REPLICATION role); see wal-archive.md
#   BACKUP_METRICS_FILE     optional node_exporter textfile-collector output (*.prom)
#   BACKUP_COMPRESS_LEVEL=6 pg_dump compression level
#
# --objects-only: copy only new objects into the pool (no dump, no backup directory). Cheap (content-addressed,
#   incremental); run it every few minutes so that, together with WAL archiving, files reach RPO ≤ 5 min.
#   Every stored object is appended to objects/index.log ("<sha256> <size> <key>"), which restore-objects.sh
#   uses to materialise the objects referenced by a point-in-time-restored database.
set -euo pipefail
LOG_TAG=backup
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir) BACKUP_DIR="$2"; shift 2 ;;
    --no-prune) BACKUP_PRUNE=0; shift ;;
    --objects-only) OBJECTS_ONLY=1; shift ;;
    -h|--help) sed -n '2,40p' "$0"; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done

OBJECTS_ONLY="${OBJECTS_ONLY:-0}"
[[ "$OBJECTS_ONLY" == "1" ]] || : "${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
STORAGE_DRIVER="${STORAGE_DRIVER:-fs}"
STORAGE_ROOT="${STORAGE_ROOT:-${KB_DATA_DIR:-.data}/objects}"
BACKUP_KEEP_DAILY="${BACKUP_KEEP_DAILY:-30}"
BACKUP_KEEP_WEEKLY="${BACKUP_KEEP_WEEKLY:-12}"
BACKUP_KEEP_MONTHLY="${BACKUP_KEEP_MONTHLY:-12}"
BACKUP_KEEP_LAST="${BACKUP_KEEP_LAST:-3}"
BACKUP_PRUNE="${BACKUP_PRUNE:-1}"
BACKUP_RECORD="${BACKUP_RECORD:-1}"
BACKUP_PG_BASEBACKUP="${BACKUP_PG_BASEBACKUP:-0}"
BACKUP_COMPRESS_LEVEL="${BACKUP_COMPRESS_LEVEL:-6}"

need pg_dump psql jq sha256sum flock find sort awk
umask 077

mkdir -p "$BACKUP_DIR"
BACKUP_DIR="$(cd "$BACKUP_DIR" && pwd)"
POOL="$BACKUP_DIR/objects"
mkdir -p "$POOL"
exec 9>"$BACKUP_DIR/.lock"
flock -n 9 || die "another backup is running (lock $BACKUP_DIR/.lock)"
INDEX="$POOL/index.log"

if [[ "$OBJECTS_ONLY" == "1" ]]; then
  T0=$(now_ms)
  SRC_ROOT="$STORAGE_ROOT"
  if [[ "$STORAGE_DRIVER" == "s3" ]]; then
    need aws
    SRC_ROOT="$BACKUP_DIR/.s3-mirror"; mkdir -p "$SRC_ROOT"
    aws ${S3_ENDPOINT:+--endpoint-url "$S3_ENDPOINT"} s3 sync "s3://${S3_BUCKET:?}/" "$SRC_ROOT/" --exclude 'tmp/*' --only-show-errors
  fi
  SUFFIX=""; encryption_enabled && SUFFIX=".enc"
  declare -A KNOWN=()
  [[ -f "$INDEX" ]] && while read -r sha size key; do KNOWN["$key"]="$sha $size"; done <"$INDEX"
  NEW=0; NEWB=0
  while IFS=$'\t' read -r key size; do
    [[ -n "$key" ]] || continue
    if [[ -n "${KNOWN[$key]:-}" && "${KNOWN[$key]#* }" == "$size" ]]; then
      k="${KNOWN[$key]%% *}"; [[ -f "$POOL/${k:0:2}/$k$SUFFIX" ]] && continue
    fi
    sha="$(sha256_file "$SRC_ROOT/$key")"
    if [[ "$key" == blobs/* && "$sha" != "${key##*/}" ]]; then log "INTEGRITY: $key has sha256 $sha"; continue; fi
    dest="$POOL/${sha:0:2}/$sha$SUFFIX"
    [[ -f "$dest" ]] || { store_file "$SRC_ROOT/$key" "$dest"; NEW=$((NEW + 1)); NEWB=$((NEWB + size)); }
    printf '%s %s %s\n' "$sha" "$size" "$key" >>"$INDEX"
  done < <(find "$SRC_ROOT" -type f ! -path "$SRC_ROOT/tmp/*" ! -name '.health-*' ! -name '*.tmp' -printf '%P\t%s\n' | LC_ALL=C sort)
  log "objects-only sync: $NEW new object(s), $NEWB bytes in $(( $(now_ms) - T0 )) ms"
  if [[ -n "${BACKUP_METRICS_FILE:-}" ]]; then
    printf '# TYPE kb_backup_objects_last_sync_timestamp_seconds gauge\nkb_backup_objects_last_sync_timestamp_seconds %s\n' "$(date +%s)" >"$BACKUP_METRICS_FILE.objects.tmp" && mv -f "$BACKUP_METRICS_FILE.objects.tmp" "${BACKUP_METRICS_FILE%.prom}-objects.prom"
  fi
  exit 0
fi

T0=$(now_ms)
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
ID="kb-$(date -u +%Y%m%dT%H%M%SZ)"
FINAL="$BACKUP_DIR/$ID"
WORK="$BACKUP_DIR/$ID.partial"
[[ ! -e "$FINAL" && ! -e "$WORK" ]] || die "$FINAL already exists"
mkdir -p "$WORK"
ENC_SUFFIX=""
encryption_enabled && ENC_SUFFIX=".enc"
REC_ID=""
OK=0

record_failure() {
  local msg="$1"
  [[ -n "$REC_ID" ]] || return 0
  psql_q "$DATABASE_URL" -v id="$REC_ID" -v err="$msg" \
    <<<"update backups set status = 'failed', finished_at = now(), details = jsonb_build_object('error', :'err') where id = :'id'" >/dev/null 2>&1 || true
}
cleanup() {
  local rc=$?
  if [[ $OK -ne 1 ]]; then
    log "backup $ID FAILED (exit $rc)"
    record_failure "backup.sh exited with status $rc"
    rm -rf -- "$WORK"
  fi
}
trap cleanup EXIT

if [[ "$BACKUP_RECORD" == "1" ]]; then
  REC_ID="$(psql_q "$DATABASE_URL" -v loc="$FINAL" <<<"insert into backups (kind, status, location, details) values ('full', 'running', :'loc', '{}'::jsonb) returning id" 2>/dev/null || true)"
  [[ -n "$REC_ID" ]] || log "warning: could not record the run in the backups table (continuing)"
fi

# ---------------------------------------------------------------- 1. database: dump + row counts in one snapshot
log "backup $ID: database $(redact_url "$DATABASE_URL")"
T_DB=$(now_ms)
coproc SNAP { psql "$DATABASE_URL" -X -q -A -t -F $'\t' -v ON_ERROR_STOP=1 2>&1; }
snap_out=${SNAP[0]}
snap_in=${SNAP[1]}
echo "begin transaction isolation level repeatable read read only;" >&"$snap_in"
echo "select pg_export_snapshot();" >&"$snap_in"
read -r -t 60 SNAPSHOT <&"$snap_out" || die "could not export a snapshot"
[[ "$SNAPSHOT" =~ ^[0-9A-F-]+$ ]] || die "could not export a snapshot: $SNAPSHOT"
{ count_sql; echo "select '__SCHEMA__', coalesce(string_agg(version, ',' order by version), '') from schema_migrations;"; echo "select '__PG__', current_setting('server_version');"; echo "select '__END__', 0;"; } >&"$snap_in"
COUNTS_TSV="$WORK/.counts.tsv"
: >"$COUNTS_TSV"
GOT_END=0
while IFS= read -r -t 120 line <&"$snap_out"; do
  if [[ "$line" == __END__* ]]; then GOT_END=1; break; fi
  [[ "$line" == ERROR* || "$line" == psql:* ]] && die "row count query failed: $line"
  printf '%s\n' "$line" >>"$COUNTS_TSV"
done
[[ $GOT_END -eq 1 ]] || die "row count queries did not complete"
SCHEMA_VERSIONS="$(awk -F'\t' '$1=="__SCHEMA__"{print $2}' "$COUNTS_TSV")"
PG_VERSION="$(awk -F'\t' '$1=="__PG__"{print $2}' "$COUNTS_TSV")"

DUMP_PLAIN="$WORK/.db.dump.plain"
pg_dump "$DATABASE_URL" --snapshot="$SNAPSHOT" --format=custom --compress="$BACKUP_COMPRESS_LEVEL" --no-owner --no-privileges --file="$DUMP_PLAIN"
echo "commit;" >&"$snap_in"
exec {snap_in}>&-
wait "$SNAP_PID" 2>/dev/null || true

DB_PLAIN_SHA="$(sha256_file "$DUMP_PLAIN")"
DB_PLAIN_SIZE="$(size_file "$DUMP_PLAIN")"
DB_FILE="db.dump$ENC_SUFFIX"
if encryption_enabled; then
  store_file "$DUMP_PLAIN" "$WORK/$DB_FILE"
  rm -f -- "$DUMP_PLAIN"
else
  mv -- "$DUMP_PLAIN" "$WORK/$DB_FILE"
fi
DB_SHA="$(sha256_file "$WORK/$DB_FILE")"
DB_SIZE="$(size_file "$WORK/$DB_FILE")"
DB_MS=$(( $(now_ms) - T_DB ))
log "database dumped: $DB_PLAIN_SIZE bytes in ${DB_MS} ms (snapshot $SNAPSHOT)"

# ---------------------------------------------------------------- 2. optional physical base backup (PITR)
BASE_JSON='null'
if [[ "$BACKUP_PG_BASEBACKUP" == "1" ]]; then
  need pg_basebackup
  T_BASE=$(now_ms)
  pg_basebackup -d "$DATABASE_URL" -D "$WORK/base" -Ft -z -X stream -c fast --manifest-checksums=SHA256
  BASE_JSON="$(jq -n --arg size "$(du -sb "$WORK/base" | awk '{print $1}')" --arg ms "$(( $(now_ms) - T_BASE ))" '{dir: "base", format: "tar.gz", sizeBytes: ($size|tonumber), durationMs: ($ms|tonumber)}')"
  log "physical base backup written"
fi

# ---------------------------------------------------------------- 3. object store (incremental, content-addressed pool)
T_OBJ=$(now_ms)
SRC_ROOT="$STORAGE_ROOT"
if [[ "$STORAGE_DRIVER" == "s3" ]]; then
  need aws
  : "${S3_BUCKET:?S3_BUCKET is required for STORAGE_DRIVER=s3}"
  SRC_ROOT="$BACKUP_DIR/.s3-mirror"
  mkdir -p "$SRC_ROOT"
  log "mirroring s3://$S3_BUCKET → $SRC_ROOT"
  aws ${S3_ENDPOINT:+--endpoint-url "$S3_ENDPOINT"} s3 sync "s3://$S3_BUCKET/" "$SRC_ROOT/" --exclude 'tmp/*' --only-show-errors
fi
[[ -d "$SRC_ROOT" ]] || die "object store root not found: $SRC_ROOT"

# Previous backup's list lets unchanged objects be reused without re-reading them.
declare -A PREV=()
PREV_LIST="$(ls -1d "$BACKUP_DIR"/kb-*Z 2>/dev/null | sort | tail -n 1 || true)"
if [[ -n "$PREV_LIST" && -f "$PREV_LIST/objects.list" ]]; then
  while read -r sha size key; do PREV["$key"]="$sha $size"; done <"$PREV_LIST/objects.list"
fi

LIST="$WORK/objects.list"
: >"$LIST"
OBJ_COUNT=0; OBJ_BYTES=0; NEW_COUNT=0; NEW_BYTES=0; CORRUPT=0
while IFS=$'\t' read -r key size; do
  [[ -n "$key" ]] || continue
  sha=""
  if [[ "$key" == blobs/* ]]; then
    name="${key##*/}"
    [[ -f "$POOL/${name:0:2}/$name$ENC_SUFFIX" ]] && sha="$name"
  fi
  if [[ -z "$sha" && -n "${PREV[$key]:-}" && "${PREV[$key]#* }" == "$size" ]]; then
    psha="${PREV[$key]%% *}"
    [[ -f "$POOL/${psha:0:2}/$psha$ENC_SUFFIX" ]] && sha="$psha"
  fi
  if [[ -z "$sha" ]]; then
    sha="$(sha256_file "$SRC_ROOT/$key")"
    if [[ "$key" == blobs/* && "$sha" != "${key##*/}" ]]; then
      log "INTEGRITY: object $key has sha256 $sha (content does not match its address)"
      CORRUPT=$((CORRUPT + 1))
      continue
    fi
    dest="$POOL/${sha:0:2}/$sha$ENC_SUFFIX"
    if [[ ! -f "$dest" ]]; then
      store_file "$SRC_ROOT/$key" "$dest"
      printf '%s %s %s\n' "$sha" "$size" "$key" >>"$INDEX"
      NEW_COUNT=$((NEW_COUNT + 1)); NEW_BYTES=$((NEW_BYTES + size))
    fi
  fi
  printf '%s %s %s\n' "$sha" "$size" "$key" >>"$LIST"
  OBJ_COUNT=$((OBJ_COUNT + 1)); OBJ_BYTES=$((OBJ_BYTES + size))
done < <(find "$SRC_ROOT" -type f ! -path "$SRC_ROOT/tmp/*" ! -name '.health-*' ! -name '*.tmp' -printf '%P\t%s\n' | LC_ALL=C sort)
[[ $CORRUPT -eq 0 ]] || die "$CORRUPT corrupted object(s) in the store — investigate before trusting backups (see docs/OPERATIONS.md)"
OBJ_MS=$(( $(now_ms) - T_OBJ ))
log "objects: $OBJ_COUNT objects / $OBJ_BYTES bytes, $NEW_COUNT new ($NEW_BYTES bytes) in ${OBJ_MS} ms"

# ---------------------------------------------------------------- 4. manifest + checksums
FINISHED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
TOTAL_MS=$(( $(now_ms) - T0 ))
COUNTS_JSON="$(grep -v '^__' "$COUNTS_TSV" | jq -R -s 'split("\n") | map(select(length > 0) | split("\t") | {key: .[0], value: (.[1] | tonumber)}) | from_entries')"
rm -f -- "$COUNTS_TSV"
jq -n \
  --arg format "$KB_BACKUP_FORMAT" --arg id "$ID" --arg rec "$REC_ID" \
  --arg started "$STARTED_AT" --arg finished "$FINISHED_AT" --argjson totalMs "$TOTAL_MS" \
  --arg host "$(hostname)" --arg pgdump "$(pg_dump --version)" --arg pgver "$PG_VERSION" \
  --arg dbfile "$DB_FILE" --argjson dbsize "$DB_SIZE" --arg dbsha "$DB_SHA" --argjson dbplainsize "$DB_PLAIN_SIZE" --arg dbplainsha "$DB_PLAIN_SHA" \
  --arg snapshot "$SNAPSHOT" --arg schema "$SCHEMA_VERSIONS" --argjson dbms "$DB_MS" \
  --argjson counts "$COUNTS_JSON" --argjson base "$BASE_JSON" \
  --arg driver "$STORAGE_DRIVER" --arg listsha "$(sha256_file "$LIST")" --argjson ocount "$OBJ_COUNT" --argjson obytes "$OBJ_BYTES" \
  --argjson ncount "$NEW_COUNT" --argjson nbytes "$NEW_BYTES" --argjson oms "$OBJ_MS" \
  --argjson enc "$(encryption_enabled && echo true || echo false)" \
  '{
    format: $format, id: $id, backupRecordId: (if $rec == "" then null else $rec end),
    startedAt: $started, finishedAt: $finished, durationMs: $totalMs, host: $host,
    encryption: {enabled: $enc},
    database: {file: $dbfile, format: "pg_dump custom", sizeBytes: $dbsize, sha256: $dbsha, plainSizeBytes: $dbplainsize, plainSha256: $dbplainsha,
               snapshot: $snapshot, serverVersion: $pgver, pgDump: $pgdump, migrations: ($schema | split(",") | map(select(length > 0))), durationMs: $dbms},
    rowCounts: $counts,
    objects: {driver: $driver, pool: "../objects", listFile: "objects.list", listSha256: $listsha, count: $ocount, totalBytes: $obytes,
              newObjects: $ncount, newBytes: $nbytes, durationMs: $oms},
    physicalBaseBackup: $base
  }' >"$WORK/manifest.json"
( cd "$WORK" && find . -type f ! -name SHA256SUMS -printf '%P\n' | LC_ALL=C sort | xargs -d '\n' sha256sum >SHA256SUMS )
sync -f "$WORK/SHA256SUMS" 2>/dev/null || true
mv -- "$WORK" "$FINAL"
OK=1
MANIFEST_SHA="$(sha256_file "$FINAL/manifest.json")"
log "backup $ID complete in ${TOTAL_MS} ms → $FINAL"

if [[ -n "$REC_ID" ]]; then
  psql_q "$DATABASE_URL" -v id="$REC_ID" -v size="$((DB_SIZE + NEW_BYTES))" -v sum="$MANIFEST_SHA" -v details="$(jq -c '{id, durationMs, database: {sizeBytes: .database.sizeBytes, sha256: .database.sha256}, objects: {count: .objects.count, totalBytes: .objects.totalBytes, newBytes: .objects.newBytes}, encryption}' "$FINAL/manifest.json")" \
    <<<"update backups set status = 'ok', finished_at = now(), size_bytes = :'size', checksum = :'sum', details = :'details'::jsonb where id = :'id'" >/dev/null \
    || log "warning: could not update the backups table"
fi

if [[ -n "${BACKUP_METRICS_FILE:-}" ]]; then
  {
    echo "# HELP kb_backup_last_success_timestamp_seconds Unix time of the last successful backup (backup.sh)."
    echo "# TYPE kb_backup_last_success_timestamp_seconds gauge"
    echo "kb_backup_last_success_timestamp_seconds $(date +%s)"
    echo "# HELP kb_backup_duration_seconds Duration of the last successful backup."
    echo "# TYPE kb_backup_duration_seconds gauge"
    echo "kb_backup_duration_seconds $(awk -v ms="$TOTAL_MS" 'BEGIN{printf "%.3f", ms/1000}')"
    echo "# HELP kb_backup_size_bytes Database dump size plus total object bytes of the last backup."
    echo "# TYPE kb_backup_size_bytes gauge"
    echo "kb_backup_size_bytes $((DB_SIZE + OBJ_BYTES))"
  } >"$BACKUP_METRICS_FILE.tmp" && mv -f "$BACKUP_METRICS_FILE.tmp" "$BACKUP_METRICS_FILE"
fi

# ---------------------------------------------------------------- 5. retention + pool garbage collection
if [[ "$BACKUP_PRUNE" == "1" ]]; then
  declare -A SEEN_D=() SEEN_W=() SEEN_M=()
  kept=0; removed=0; idx=0
  while IFS= read -r d; do
    name="$(basename "$d")"
    ts="${name#kb-}"
    iso="${ts:0:4}-${ts:4:2}-${ts:6:2}T${ts:9:2}:${ts:11:2}:${ts:13:2}Z"
    day="${ts:0:8}"; month="${ts:0:6}"; week="$(date -u -d "$iso" +%G-%V)"
    keep=0
    [[ "$name" == "$ID" ]] && keep=1
    idx=$((idx + 1)); [[ $idx -le $BACKUP_KEEP_LAST ]] && keep=1
    if [[ -z "${SEEN_D[$day]:-}" && ${#SEEN_D[@]} -lt $BACKUP_KEEP_DAILY ]]; then SEEN_D[$day]=1; keep=1; fi
    if [[ -z "${SEEN_W[$week]:-}" && ${#SEEN_W[@]} -lt $BACKUP_KEEP_WEEKLY ]]; then SEEN_W[$week]=1; keep=1; fi
    if [[ -z "${SEEN_M[$month]:-}" && ${#SEEN_M[@]} -lt $BACKUP_KEEP_MONTHLY ]]; then SEEN_M[$month]=1; keep=1; fi
    if [[ $keep -eq 1 ]]; then kept=$((kept + 1)); else rm -rf -- "$d"; removed=$((removed + 1)); fi
  done < <(ls -1d "$BACKUP_DIR"/kb-*Z 2>/dev/null | sort -r)
  # stale partial directories from crashed runs
  find "$BACKUP_DIR" -maxdepth 1 -name 'kb-*.partial' -mmin +1440 -exec rm -rf -- {} + 2>/dev/null || true
  # objects no longer referenced by any retained backup
  declare -A LIVE=()
  for l in "$BACKUP_DIR"/kb-*Z/objects.list; do
    [[ -f "$l" ]] || continue
    while read -r sha _; do LIVE["$sha"]=1; done <"$l"
  done
  # Objects newer than the oldest retained backup are kept even if unreferenced: they may belong to
  # --objects-only syncs that a point-in-time restore (WAL) still needs.
  OLDEST="$(ls -1d "$BACKUP_DIR"/kb-*Z 2>/dev/null | sort | head -n 1)"
  gc=0
  while IFS= read -r f; do
    [[ -n "$OLDEST" && "$f" -nt "$OLDEST/manifest.json" ]] && continue
    b="$(basename "$f")"; b="${b%.enc}"
    if [[ -z "${LIVE[$b]:-}" ]]; then rm -f -- "$f"; gc=$((gc + 1)); fi
  done < <(find "$POOL" -mindepth 2 -type f ! -name '*.part.*')
  # compact the index to live objects
  if [[ -f "$INDEX" ]]; then
    awk 'NR==FNR { split($0, p, "/"); n = p[length(p)]; sub(/\.enc$/, "", n); have[n] = 1; next } have[$1]' \
      <(find "$POOL" -mindepth 2 -type f ! -name '*.part.*') "$INDEX" | awk '{ last[$3] = $0 } END { for (k in last) print last[k] }' >"$INDEX.tmp" && mv -f "$INDEX.tmp" "$INDEX"
  fi
  log "retention: kept $kept backup(s), removed $removed, garbage-collected $gc pool object(s)"
fi

echo "$FINAL"
