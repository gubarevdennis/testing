#!/usr/bin/env bash
# Point-in-time restore into a NEW, independent PostgreSQL cluster (own data directory, port and process; never in
# place, never over an existing directory) from a base backup written by basebackup.sh plus the WAL archive.
#
#   BACKUP_DECRYPT_CMD='age -d -i /secure/kb-backup.key' WAL_DECRYPT_CMD='age -d -i /secure/kb-backup.key' \
#   scripts/backup/pitr-restore.sh --base-root /backups/base --wal /backups/wal --pgdata /srv/pg-restore \
#     --port 5433 --target-time '2026-10-22 14:05:00+03'          # or --latest (replay every archived segment)
#
# Steps, each timed in the JSON report printed on stdout:
#   1. choose the base backup: --base DIR, or the newest under --base-root that started before the target time;
#   2. sha256sum -c SHA256SUMS, decrypt (BACKUP_DECRYPT_CMD), check the plaintext sha256 from the manifest;
#   3. extract into the empty --pgdata, pg_verifybackup against the server-written backup_manifest;
#   4. recovery settings: restore_command → wal-restore.sh (sha256 of every segment checked, WAL_DECRYPT_CMD),
#      archive_mode = off (the restored cluster never writes into the production archive), own port/socket directory,
#      recovery_target_time + promote (or no target with --latest);
#   5. start, wait until promoted, report where recovery stopped and the last replayed transaction time.
# --no-start stops after step 4. The decryption key is read only here (the database host holds the public key only).
set -euo pipefail
LOG_TAG=pitr-restore
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

BASE=""; BASE_ROOT=""; WAL=""; PGDATA_NEW=""; PORT=""; TARGET=""; LATEST=0; START=1; DBNAME="kb"; LISTEN="127.0.0.1"; SOCKDIR=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --base) BASE="$2"; shift 2 ;;
    --base-root) BASE_ROOT="$2"; shift 2 ;;
    --wal) WAL="$2"; shift 2 ;;
    --pgdata) PGDATA_NEW="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --target-time) TARGET="$2"; shift 2 ;;
    --latest) LATEST=1; shift ;;
    --no-start) START=0; shift ;;
    --db) DBNAME="$2"; shift 2 ;;
    --listen) LISTEN="$2"; shift 2 ;;
    --socket-dir) SOCKDIR="$2"; shift 2 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done
[[ -n "$WAL" && -n "$PGDATA_NEW" && ( -n "$BASE" || -n "$BASE_ROOT" ) ]] || die "usage: pitr-restore.sh (--base DIR | --base-root DIR) --wal DIR --pgdata NEW_DIR [--port P] (--target-time T | --latest)"
[[ -n "$TARGET" || $LATEST -eq 1 ]] || die "choose --target-time T or --latest"
[[ -z "$TARGET" || $LATEST -eq 0 ]] || die "--target-time and --latest are exclusive"
need sha256sum tar gzip jq psql
BIN="$(pg_server_bin)" || die "PostgreSQL server binaries not found; set PG_BIN"
[[ -d "$WAL" ]] || die "WAL archive not found: $WAL"
WAL="$(cd "$WAL" && pwd)"
if [[ -e "$PGDATA_NEW" ]] && [[ -n "$(ls -A "$PGDATA_NEW" 2>/dev/null)" ]]; then die "$PGDATA_NEW exists and is not empty — refusing to restore over it"; fi
mkdir -p "$PGDATA_NEW"
PGDATA_NEW="$(cd "$PGDATA_NEW" && pwd)"
PARENT="$(dirname "$PGDATA_NEW")"
if [[ -z "$SOCKDIR" ]]; then SOCKDIR="$PARENT/.$(basename "$PGDATA_NEW").sock"; mkdir -p "$SOCKDIR"; chmod 0700 "$SOCKDIR"; pg_own "$SOCKDIR"; fi
PORT="${PORT:-$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()')}"
T0=$(now_ms)

# 1. choose the base backup
if [[ -z "$BASE" ]]; then
  tgt_epoch=""
  [[ -n "$TARGET" ]] && tgt_epoch="$(date -d "$TARGET" +%s)" || true
  while IFS= read -r d; do
    [[ -f "$d/manifest.json" ]] || continue
    if [[ -z "$tgt_epoch" ]] || [[ "$(date -d "$(jq -r .wal.startTime "$d/manifest.json")" +%s)" -lt "$tgt_epoch" ]]; then BASE="$d"; break; fi
  done < <(ls -1d "$BASE_ROOT"/base-*Z 2>/dev/null | sort -r)
  [[ -n "$BASE" ]] || die "no base backup under $BASE_ROOT that started before ${TARGET:-now}"
fi
BASE="$(cd "$BASE" && pwd)"
M="$BASE/manifest.json"
[[ -f "$M" ]] || die "no manifest.json in $BASE"
log "base backup $(jq -r .id "$M") (start WAL $(jq -r .wal.startSegment "$M"), $(jq -r .wal.startTime "$M")) → $PGDATA_NEW, port $PORT"

# 2. checksums and decryption
T=$(now_ms)
( cd "$BASE" && sha256sum --quiet --strict -c SHA256SUMS ) || die "SHA256SUMS check failed for $BASE — backup damaged or tampered with"
FILE="$BASE/$(jq -r .file "$M")"
PLAIN="$PARENT/.$(basename "$PGDATA_NEW").base.tar.gz"
trap 'rm -f -- "$PLAIN" "$PLAIN.part".*' EXIT
fetch_file "$FILE" "$PLAIN" "$([[ "$(jq -r .encryption.enabled "$M")" == true ]] && echo 1 || echo 0)"
[[ "$(sha256_file "$PLAIN")" == "$(jq -r .plainSha256 "$M")" ]] || die "plaintext sha256 mismatch after decryption (wrong key or damaged backup)"
CHECK_MS=$(( $(now_ms) - T ))

# 3. extract + pg_verifybackup
T=$(now_ms)
tar -xzf "$PLAIN" -C "$PGDATA_NEW"
rm -f -- "$PLAIN"
"$BIN/pg_verifybackup" -q "$PGDATA_NEW" || die "pg_verifybackup failed on the extracted base backup"
rm -f -- "$PGDATA_NEW/postmaster.pid" "$PGDATA_NEW/postmaster.opts"
EXTRACT_MS=$(( $(now_ms) - T ))

# 4. recovery settings
RESTORE_CMD="$PARENT/.$(basename "$PGDATA_NEW").restore-wal.sh"
# A private copy of wal-restore.sh: the server's OS user may not be able to read the installation directory.
cp -- "$SCRIPT_DIR/wal-restore.sh" "$RESTORE_CMD.impl"
{
  echo '#!/usr/bin/env bash'
  printf 'export WAL_ARCHIVE_DIR=%q\n' "$WAL"
  [[ -n "${WAL_DECRYPT_CMD:-}" ]] && printf 'export WAL_DECRYPT_CMD=%q\n' "$WAL_DECRYPT_CMD"
  printf 'exec bash %q "$@"\n' "$RESTORE_CMD.impl"
} >"$RESTORE_CMD"
chmod 0750 "$RESTORE_CMD" "$RESTORE_CMD.impl"
{
  echo "# --- pitr-restore.sh $(date -u +%FT%TZ): restored copy, independent of the source cluster"
  echo "listen_addresses = '$LISTEN'"
  echo "port = $PORT"
  echo "unix_socket_directories = '$SOCKDIR'"
  echo "archive_mode = off"
  echo "archive_command = ''"
  echo "restore_command = '$RESTORE_CMD %f %p'"
  echo "recovery_target_timeline = 'latest'"
  if [[ -n "$TARGET" ]]; then
    echo "recovery_target_time = '$TARGET'"
    echo "recovery_target_action = 'promote'"
  fi
} >>"$PGDATA_NEW/postgresql.auto.conf"
touch "$PGDATA_NEW/recovery.signal"
chmod 0700 "$PGDATA_NEW"
pg_own "$PGDATA_NEW" "$RESTORE_CMD" "$RESTORE_CMD.impl"
LOGFILE="$PARENT/$(basename "$PGDATA_NEW").log"
: >"$LOGFILE"; pg_own "$LOGFILE"
URL="postgres://postgres@127.0.0.1:$PORT/$DBNAME"
report() {
  jq -cn --arg url "$URL" --argjson port "$PORT" --arg pgdata "$PGDATA_NEW" --arg log "$LOGFILE" --arg base "$BASE" \
    --arg target "${TARGET:-latest}" --arg stop "${STOP_LINE:-}" --arg lastTx "${LAST_TX:-}" --argjson started "$1" \
    --argjson checkMs "$CHECK_MS" --argjson extractMs "$EXTRACT_MS" --argjson replayMs "${REPLAY_MS:-0}" --argjson ms "$(( $(now_ms) - T0 ))" \
    '{url: $url, port: $port, pgdata: $pgdata, log: $log, base: $base, target: $target, started: $started, stop: $stop,
      lastReplayedTransaction: $lastTx, ms: $ms, stepsMs: {checksumsDecrypt: $checkMs, extractVerify: $extractMs, replayPromote: $replayMs}}'
}
if [[ $START -eq 0 ]]; then report false; exit 0; fi

# 5. start, replay, promote
T=$(now_ms)
pg_as "$BIN/pg_ctl" -D "$PGDATA_NEW" -l "$LOGFILE" -w -t 3600 start >/dev/null || die "restored cluster failed to start — see $LOGFILE"
for _ in $(seq 1 36000); do
  [[ "$(psql -w "$URL" -XAtc 'select pg_is_in_recovery()' 2>/dev/null)" == "f" ]] && break
  grep -q 'FATAL' "$LOGFILE" && die "recovery failed — see $LOGFILE: $(grep -m1 FATAL "$LOGFILE")"
  sleep 0.1
done
[[ "$(psql -w "$URL" -XAtc 'select pg_is_in_recovery()')" == "f" ]] || die "recovery did not finish — see $LOGFILE"
REPLAY_MS=$(( $(now_ms) - T ))
STOP_LINE="$(grep -m1 -E 'recovery stopping (before|after)' "$LOGFILE" | sed 's/.*LOG: *//; s/"//g' || true)"
LAST_TX="$(grep -m1 -oE 'last completed transaction was at log time [^"]+' "$LOGFILE" | sed 's/last completed transaction was at log time //' || true)"
[[ -n "$STOP_LINE" ]] && LAST_TX="${LAST_TX:-$(sed -nE 's/.*, time (.*)$/\1/p' <<<"$STOP_LINE")}"
log "recovered and promoted in ${REPLAY_MS} ms${STOP_LINE:+ ($STOP_LINE)}${LAST_TX:+, last transaction $LAST_TX}"
report true
