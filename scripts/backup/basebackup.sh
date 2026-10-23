#!/usr/bin/env bash
# Physical base backup for point-in-time recovery (PITR), together with continuous WAL archiving (wal-archive.sh).
#
#   BASEBACKUP_URL=postgres://kb_basebackup@db/kb BACKUP_DIR=/backups WAL_ARCHIVE_DIR=/backups/wal \
#   BACKUP_ENCRYPT_CMD='age -R /etc/kb/backup-recipients.txt' scripts/backup/basebackup.sh
#
# Writes BACKUP_DIR/base/base-YYYYMMDDTHHMMSSZ/
#   base.tar.gz[.enc]   the whole data directory incl. the WAL needed for consistency (-X stream), gzip, then encrypted
#   manifest.json       format kb-basebackup/1: start WAL segment/LSN, times, sizes, sha256 of plaintext and stored file,
#                       pg_verifybackup result, encryption flag
#   SHA256SUMS          sha256sum -c compatible checksums of the two files above
#
# Order (data safety first): pg_basebackup -Fp into a private work directory → pg_verifybackup (every file against the
# server-written backup_manifest, WAL parse) → tar+gzip → sha256 → encrypt → sha256 → manifest → atomic rename →
# files made read-only. A failed or unverifiable backup never appears under its final name.
#
# Retention (after a successful backup only): the BASEBACKUP_KEEP newest base backups are kept (default 7, minimum 1;
# the backup just written is always kept). With BASEBACKUP_WAL_CLEANUP=1 (default when WAL_ARCHIVE_DIR is set), archived
# WAL segments older than the start segment of the OLDEST retained base backup are removed (same rule as
# pg_archivecleanup: timeline ignored, *.history kept) — WAL any retained base backup needs is never deleted.
#
# Environment (no secrets in this file):
#   BASEBACKUP_URL     libpq URL of a role with REPLICATION (defaults to DATABASE_URL)
#   BACKUP_DIR         repository root (default ./backups); WAL_ARCHIVE_DIR — archive used for cleanup (optional)
#   BACKUP_ENCRYPT_CMD optional stdin→stdout filter (age -R …, gpg -e …, openssl enc …); the DECRYPTION key is needed
#                      only where restores run (pitr-restore.sh, BACKUP_DECRYPT_CMD) and must not live on this host
#   BACKUP_METRICS_FILE node_exporter textfile: writes <file>-basebackup.prom (kb_basebackup_last_success_timestamp_seconds)
set -euo pipefail
LOG_TAG=basebackup
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir) BACKUP_DIR="$2"; shift 2 ;;
    --no-prune) BASEBACKUP_PRUNE=0; shift ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done
URL="${BASEBACKUP_URL:-${DATABASE_URL:-}}"
[[ -n "$URL" ]] || die "BASEBACKUP_URL (or DATABASE_URL) is required"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP="${BASEBACKUP_KEEP:-7}"
[[ "$KEEP" =~ ^[0-9]+$ && "$KEEP" -ge 1 ]] || die "BASEBACKUP_KEEP must be >= 1"
PRUNE="${BASEBACKUP_PRUNE:-1}"
WAL_DIR="${WAL_ARCHIVE_DIR:-}"
WAL_CLEANUP="${BASEBACKUP_WAL_CLEANUP:-$([[ -n "$WAL_DIR" ]] && echo 1 || echo 0)}"
need pg_basebackup sha256sum tar gzip jq flock
BIN="$(pg_server_bin)" || die "pg_verifybackup not found (PostgreSQL server binaries); set PG_BIN"
umask 077

mkdir -p "$BACKUP_DIR/base"
BACKUP_DIR="$(cd "$BACKUP_DIR" && pwd)"
ROOT="$BACKUP_DIR/base"
exec 8>"$ROOT/.lock"
flock -n 8 || die "another base backup is running ($ROOT/.lock)"

T0=$(now_ms)
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
ID="base-$(date -u +%Y%m%dT%H%M%SZ)"
FINAL="$ROOT/$ID"
WORK="$ROOT/$ID.partial"
[[ ! -e "$FINAL" && ! -e "$WORK" ]] || die "$FINAL already exists"
mkdir -p "$WORK"
OK=0
trap '[[ $OK -eq 1 ]] || { log "base backup $ID FAILED"; chmod -R u+w "$WORK" 2>/dev/null; rm -rf -- "$WORK"; }' EXIT

# 1. physical copy (plain format, so it can be verified before it is packed)
T=$(now_ms)
pg_basebackup -w -d "$URL" -D "$WORK/data" -Fp -X stream -c fast --manifest-checksums=SHA256 --label "$ID"
COPY_MS=$(( $(now_ms) - T ))
START_LINE="$(grep -m1 '^START WAL LOCATION' "$WORK/data/backup_label")"
START_LSN="$(awk '{print $4}' <<<"$START_LINE")"
START_WAL="$(sed -E 's/.*\(file ([0-9A-F]{24})\).*/\1/' <<<"$START_LINE")"
START_TIME="$(sed -n 's/^START TIME: //p' "$WORK/data/backup_label")"
[[ "$START_WAL" =~ ^[0-9A-F]{24}$ ]] || die "cannot read the start WAL segment from backup_label: $START_LINE"
DATA_BYTES="$(du -sb "$WORK/data" | awk '{print $1}')"

# 2. verify against the manifest PostgreSQL wrote (file checksums + WAL needed for consistency)
T=$(now_ms)
"$BIN/pg_verifybackup" -q "$WORK/data" || die "pg_verifybackup failed — the copy is not usable"
VERIFY_MS=$(( $(now_ms) - T ))

# 3. pack, checksum, encrypt
T=$(now_ms)
tar -C "$WORK/data" -cf - . | gzip -1 >"$WORK/base.tar.gz"
rm -rf -- "$WORK/data"
PLAIN_SHA="$(sha256_file "$WORK/base.tar.gz")"
PLAIN_SIZE="$(size_file "$WORK/base.tar.gz")"
FILE="base.tar.gz"
if encryption_enabled; then
  FILE="base.tar.gz.enc"
  store_file "$WORK/base.tar.gz" "$WORK/$FILE"
  rm -f -- "$WORK/base.tar.gz"
fi
STORED_SHA="$(sha256_file "$WORK/$FILE")"
STORED_SIZE="$(size_file "$WORK/$FILE")"
PACK_MS=$(( $(now_ms) - T ))

jq -n --arg format kb-basebackup/1 --arg id "$ID" --arg started "$STARTED_AT" --arg finished "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg startTime "$START_TIME" --arg startLsn "$START_LSN" --arg startWal "$START_WAL" \
  --arg file "$FILE" --argjson size "$STORED_SIZE" --arg sha "$STORED_SHA" --argjson psize "$PLAIN_SIZE" --arg psha "$PLAIN_SHA" \
  --argjson dataBytes "$DATA_BYTES" --argjson enc "$(encryption_enabled && echo true || echo false)" \
  --arg host "$(hostname)" --arg pgbb "$(pg_basebackup --version)" \
  --argjson copyMs "$COPY_MS" --argjson verifyMs "$VERIFY_MS" --argjson packMs "$PACK_MS" --argjson totalMs "$(( $(now_ms) - T0 ))" \
  '{format: $format, id: $id, startedAt: $started, finishedAt: $finished, host: $host, pgBasebackup: $pgbb,
    wal: {startTime: $startTime, startLsn: $startLsn, startSegment: $startWal},
    file: $file, sizeBytes: $size, sha256: $sha, plainSizeBytes: $psize, plainSha256: $psha, dataDirBytes: $dataBytes,
    encryption: {enabled: $enc}, verified: {tool: "pg_verifybackup", ok: true},
    durationsMs: {copy: $copyMs, verify: $verifyMs, packEncrypt: $packMs, total: $totalMs}}' >"$WORK/manifest.json"
( cd "$WORK" && sha256sum "$FILE" manifest.json >SHA256SUMS )
sync -f "$WORK/SHA256SUMS" 2>/dev/null || true
chmod 0400 "$WORK"/*
mv -- "$WORK" "$FINAL"
chmod 0500 "$FINAL"
OK=1
log "base backup $ID: data $DATA_BYTES B → $FILE $STORED_SIZE B, start WAL $START_WAL, verified, $(( $(now_ms) - T0 )) ms"
write_metric basebackup kb_basebackup_last_success_timestamp_seconds "$(date +%s)" "Unix time of the last verified base backup (basebackup.sh)."

# 4. retention + WAL cleanup
if [[ "$PRUNE" == "1" ]]; then
  mapfile -t ALL < <(ls -1d "$ROOT"/base-*Z 2>/dev/null | sort -r)
  removed=0
  for ((i = KEEP; i < ${#ALL[@]}; i++)); do
    [[ "${ALL[$i]}" == "$FINAL" ]] && continue
    chmod -R u+w "${ALL[$i]}" && rm -rf -- "${ALL[$i]}" && removed=$((removed + 1))
  done
  OLDEST="$(ls -1d "$ROOT"/base-*Z 2>/dev/null | sort | head -n 1)"
  wal_removed=0
  if [[ "$WAL_CLEANUP" == "1" && -n "$WAL_DIR" && -d "$WAL_DIR" && -f "$OLDEST/manifest.json" ]]; then
    keep_from="$(jq -r .wal.startSegment "$OLDEST/manifest.json")"
    [[ "$keep_from" =~ ^[0-9A-F]{24}$ ]] || die "bad startSegment in $OLDEST/manifest.json"
    while IFS= read -r f; do
      seg="${f:0:24}"
      [[ "$seg" =~ ^[0-9A-F]{24}$ && "$f" != *.history* ]] || continue
      # timeline (first 8 hex digits) ignored, as pg_archivecleanup does
      if [[ "${seg:8}" < "${keep_from:8}" ]]; then rm -f -- "$WAL_DIR/$f"; wal_removed=$((wal_removed + 1)); fi
    done < <(find "$WAL_DIR" -maxdepth 1 -type f -printf '%f\n')
  fi
  log "retention: kept $(( ${#ALL[@]} - removed )) base backup(s), removed $removed; WAL files removed: $wal_removed (keeping from ${keep_from:-n/a})"
fi
echo "$FINAL"
