#!/usr/bin/env bash
# PostgreSQL archive_command helper for continuous WAL archiving (PITR, RPO ≤ 5 min). See wal-archive.md.
#
#   archive_mode = on
#   archive_timeout = 60s
#   archive_command = 'WAL_ARCHIVE_DIR=/backups/wal /opt/kb/scripts/backup/wal-archive.sh %p %f'
#
# - copies the segment to WAL_ARCHIVE_DIR atomically (temp file, fsync, rename);
# - succeeds without rewriting when an identical file is already archived (PostgreSQL may retry);
# - FAILS when a different file with the same name exists (never overwrite archived WAL);
# - optional WAL_ENCRYPT_CMD (stdin→stdout filter) — then files are stored as <name>.enc and the
#   "identical" check compares the recorded plaintext sha256 (<name>.sha256).
# Exit status non-zero makes PostgreSQL keep the segment and retry: watch pg_stat_archiver.failed_count.
set -euo pipefail
src="${1:?usage: wal-archive.sh %p %f}"
name="${2:?usage: wal-archive.sh %p %f}"
dir="${WAL_ARCHIVE_DIR:?WAL_ARCHIVE_DIR is required}"
mkdir -p "$dir"
sum="$(sha256sum "$src" | awk '{print $1}')"
suffix=""
[[ -n "${WAL_ENCRYPT_CMD:-}" ]] && suffix=".enc"
dest="$dir/$name$suffix"
if [[ -e "$dest" ]]; then
  if [[ -f "$dir/$name.sha256" && "$(cat "$dir/$name.sha256")" == "$sum" ]]; then exit 0; fi
  echo "wal-archive: $dest exists with different content — refusing to overwrite" >&2
  exit 1
fi
tmp="$dest.part.$$"
if [[ -n "$suffix" ]]; then
  bash -c "$WAL_ENCRYPT_CMD" <"$src" >"$tmp"
else
  cp -- "$src" "$tmp"
fi
printf '%s' "$sum" >"$dir/$name.sha256.part.$$"
sync -- "$tmp" "$dir/$name.sha256.part.$$"
mv -f -- "$dir/$name.sha256.part.$$" "$dir/$name.sha256"
mv -f -- "$tmp" "$dest"
sync -f "$dest" 2>/dev/null || true
