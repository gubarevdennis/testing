#!/usr/bin/env bash
# Point-in-time-recovery drill on throw-away PostgreSQL clusters (never touches a real installation).
# Used by tests/resilience/pitr.test.ts and runnable by hand; see wal-archive.md.
#
#   pitr-drill.sh init       --dir D [--port P]      scratch primary with WAL archiving (wal-archive.sh), db "kb"
#   pitr-drill.sh basebackup --dir D                 pg_basebackup -Ft -z -X stream into D/base
#   pitr-drill.sh switch     --dir D                 pg_switch_wal() and wait until it is archived
#   pitr-drill.sh recover    --dir D --target-time T [--port P]   restore base + WAL into D/recovered, promote at T
#   pitr-drill.sh stop       --dir D                 stop both clusters (keeps files)
#   pitr-drill.sh destroy    --dir D                 stop and delete D
#
# Output: one JSON line per command on stdout ({"url": …, "ms": …}). PG_BIN overrides the server binaries dir.
# When run as root the clusters run as the "postgres" OS user (PostgreSQL refuses to run as root).
set -euo pipefail
LOG_TAG=pitr-drill
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

CMD="${1:-}"; shift || true
DIR=""; PORT=""; TARGET=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir) DIR="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --target-time) TARGET="$2"; shift 2 ;;
    *) die "unknown argument: $1" ;;
  esac
done
[[ -n "$CMD" && -n "$DIR" ]] || die "usage: pitr-drill.sh init|basebackup|switch|recover|stop|destroy --dir DIR"

find_bin() {
  local d
  for d in "${PG_BIN:-}" "$(pg_config --bindir 2>/dev/null || true)" /usr/lib/postgresql/16/bin /usr/local/pgsql/bin; do
    [[ -n "$d" && -x "$d/initdb" && -x "$d/pg_ctl" ]] && { echo "$d"; return 0; }
  done
  return 1
}
BIN="$(find_bin)" || die "PostgreSQL server binaries (initdb, pg_ctl) not found; set PG_BIN"
RUNAS=()
if [[ "$(id -u)" == "0" ]]; then
  id postgres >/dev/null 2>&1 || die "running as root requires an OS user 'postgres'"
  RUNAS=(runuser -u postgres --)
fi
pgrun() { "${RUNAS[@]}" "$@"; }
own() { [[ ${#RUNAS[@]} -eq 0 ]] || chown -R postgres:postgres "$@"; }
state() { cat "$DIR/$1" 2>/dev/null || true; }
free_port() { python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()'; }
url() { printf 'postgres://postgres@127.0.0.1:%s/kb' "$1"; }
wait_ready() { local p="$1" i; for i in $(seq 1 300); do psql "$(url "$p")" -XAtc 'select 1' >/dev/null 2>&1 && return 0; sleep 0.1; done; return 1; }

case "$CMD" in
  init)
    mkdir -p "$DIR"
    [[ ! -e "$DIR/primary" ]] || die "$DIR/primary already exists"
    mkdir -p "$DIR/bin" "$DIR/wal"
    cp "$SCRIPT_DIR/wal-archive.sh" "$SCRIPT_DIR/wal-restore.sh" "$DIR/bin/"
    chmod 0755 "$DIR" "$DIR/bin" "$DIR"/bin/*.sh
    own "$DIR"
    PORT="${PORT:-$(free_port)}"
    T=$(now_ms)
    pgrun "$BIN/initdb" -D "$DIR/primary" -A trust -U postgres --no-sync >/dev/null
    cat >>"$DIR/primary/postgresql.conf" <<CONF
listen_addresses = '127.0.0.1'
port = $PORT
unix_socket_directories = '$DIR'
wal_level = replica
archive_mode = on
archive_timeout = 60s
archive_command = 'WAL_ARCHIVE_DIR=$DIR/wal $DIR/bin/wal-archive.sh %p %f'
max_wal_senders = 4
fsync = off
CONF
    pgrun "$BIN/pg_ctl" -D "$DIR/primary" -l "$DIR/primary.log" -w start >/dev/null
    psql "postgres://postgres@127.0.0.1:$PORT/postgres" -Xqc "create database kb"
    echo "$PORT" >"$DIR/primary.port"
    printf '{"url":"%s","port":%s,"ms":%s}\n' "$(url "$PORT")" "$PORT" "$(( $(now_ms) - T ))"
    ;;
  basebackup)
    PORT="$(state primary.port)"
    T=$(now_ms)
    rm -rf "$DIR/base"
    pgrun "$BIN/pg_basebackup" -h 127.0.0.1 -p "$PORT" -U postgres -D "$DIR/base" -Ft -z -X stream -c fast --manifest-checksums=SHA256
    printf '{"dir":"%s","bytes":%s,"ms":%s}\n' "$DIR/base" "$(du -sb "$DIR/base" | awk '{print $1}')" "$(( $(now_ms) - T ))"
    ;;
  switch)
    PORT="$(state primary.port)"
    U="$(url "$PORT")"
    T=$(now_ms)
    seg="$(psql "$U" -XAtc "select pg_walfile_name(pg_switch_wal())")"
    for _ in $(seq 1 300); do
      last="$(psql "$U" -XAtc "select coalesce(last_archived_wal, '') from pg_stat_archiver")"
      [[ -n "$last" && "$last" > "$seg" || "$last" == "$seg" ]] && break
      sleep 0.1
    done
    [[ "$last" > "$seg" || "$last" == "$seg" ]] || die "segment $seg not archived (last: $last) — see $DIR/primary.log"
    printf '{"segment":"%s","archived":"%s","failed":%s,"ms":%s}\n' "$seg" "$last" "$(psql "$U" -XAtc 'select failed_count from pg_stat_archiver')" "$(( $(now_ms) - T ))"
    ;;
  recover)
    [[ -n "$TARGET" ]] || die "--target-time is required"
    [[ -f "$DIR/base/base.tar.gz" ]] || die "no base backup in $DIR/base"
    [[ ! -e "$DIR/recovered" ]] || die "$DIR/recovered already exists"
    PORT="${PORT:-$(free_port)}"
    T=$(now_ms)
    mkdir -p "$DIR/recovered"
    tar xzf "$DIR/base/base.tar.gz" -C "$DIR/recovered"
    tar xzf "$DIR/base/pg_wal.tar.gz" -C "$DIR/recovered/pg_wal"
    cat >>"$DIR/recovered/postgresql.auto.conf" <<CONF
port = $PORT
archive_mode = off
restore_command = 'WAL_ARCHIVE_DIR=$DIR/wal $DIR/bin/wal-restore.sh %f %p'
recovery_target_time = '$TARGET'
recovery_target_action = 'promote'
CONF
    touch "$DIR/recovered/recovery.signal"
    chmod 0700 "$DIR/recovered"
    own "$DIR/recovered"
    pgrun "$BIN/pg_ctl" -D "$DIR/recovered" -l "$DIR/recovered.log" -w -t 300 start >/dev/null
    wait_ready "$PORT" || die "recovered cluster not reachable — see $DIR/recovered.log"
    for _ in $(seq 1 600); do [[ "$(psql "$(url "$PORT")" -XAtc 'select pg_is_in_recovery()' 2>/dev/null)" == "f" ]] && break; sleep 0.1; done
    [[ "$(psql "$(url "$PORT")" -XAtc 'select pg_is_in_recovery()')" == "f" ]] || die "recovery did not finish — see $DIR/recovered.log"
    echo "$PORT" >"$DIR/recovered.port"
    stop_line="$(grep -m1 -E 'recovery stopping (before|after)' "$DIR/recovered.log" | sed 's/.*LOG: *//' || true)"
    printf '{"url":"%s","port":%s,"ms":%s,"stop":"%s"}\n' "$(url "$PORT")" "$PORT" "$(( $(now_ms) - T ))" "${stop_line//\"/}"
    ;;
  stop|destroy)
    for c in recovered primary; do
      [[ -f "$DIR/$c/PG_VERSION" ]] && pgrun "$BIN/pg_ctl" -D "$DIR/$c" -m immediate stop >/dev/null 2>&1 || true
    done
    [[ "$CMD" == "destroy" ]] && rm -rf -- "$DIR"
    echo '{"ok":true}'
    ;;
  *) die "unknown command: $CMD" ;;
esac
