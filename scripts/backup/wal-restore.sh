#!/usr/bin/env bash
# PostgreSQL restore_command helper (counterpart of wal-archive.sh). See wal-archive.md.
#
#   restore_command = 'WAL_ARCHIVE_DIR=/backups/wal /opt/kb/scripts/backup/wal-restore.sh %f %p'
#
# Exits non-zero when the segment is not in the archive (normal at the end of recovery) or when its
# checksum does not match the one recorded at archive time (corrupted archive: recovery stops there).
set -euo pipefail
name="${1:?usage: wal-restore.sh %f %p}"
dest="${2:?usage: wal-restore.sh %f %p}"
dir="${WAL_ARCHIVE_DIR:?WAL_ARCHIVE_DIR is required}"
if [[ -f "$dir/$name.enc" ]]; then
  [[ -n "${WAL_DECRYPT_CMD:-}" ]] || { echo "wal-restore: $name is encrypted, set WAL_DECRYPT_CMD" >&2; exit 1; }
  bash -c "$WAL_DECRYPT_CMD" <"$dir/$name.enc" >"$dest"
elif [[ -f "$dir/$name" ]]; then
  cat -- "$dir/$name" >"$dest"   # not cp: a read-only archive copy must not yield a read-only segment
else
  exit 1
fi
if [[ -f "$dir/$name.sha256" ]]; then
  [[ "$(sha256sum "$dest" | awk '{print $1}')" == "$(cat "$dir/$name.sha256")" ]] || { echo "wal-restore: checksum mismatch for $name" >&2; rm -f -- "$dest"; exit 1; }
fi
