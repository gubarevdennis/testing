#!/usr/bin/env bash
# Copies the backup repository to a second medium / outside the primary site (rule 3-2-1). Add-only: nothing is ever
# deleted or overwritten at the destination, so deleting or encrypting the local repository (operator error,
# ransomware) does not propagate. Run it every minute (cheap: existing files are skipped by name and size).
#
#   OFFSITE_TARGET=/mnt/backup-disk/kb            second medium mounted locally (or dir:/path)
#   OFFSITE_TARGET=s3://kb-offsite/site-a         S3-compatible bucket; must have versioning + Object Lock (checked)
#   OFFSITE_TARGET=rsync:backup@vault:/srv/kb     another host over ssh (rsync --ignore-existing, no --delete)
#   BACKUP_DIR=/backups WAL_ARCHIVE_DIR=/backups/wal scripts/backup/offsite-sync.sh
#
# What is copied: finalized full backups (kb-*Z/), base backups (base/base-*Z/), the object pool (objects/<aa>/…),
# objects/index.log (the only mutable file: append-only, replaced only when the old copy is a prefix of the new one)
# and the WAL archive (→ wal/). Never: *.partial, *.part.*, locks, the S3 mirror.
# Safety checks:
#   - OFFSITE_REQUIRE_ENCRYPTION=1 (default): refuses to ship plaintext data files (dump, base backup, objects, WAL) —
#     data leaving the site must be encrypted (BACKUP_ENCRYPT_CMD / WAL_ENCRYPT_CMD);
#   - a destination file with the same name but a different size is an INTEGRITY error (exit 1), never overwritten;
#   - dir target: every copied file is re-hashed at the destination, SHA256SUMS of each copied backup checked there,
#     copied files made read-only; a sync report is appended to <target>/.offsite/sync.log;
#   - s3 target: refuses unless the bucket reports versioning Enabled and an Object Lock configuration
#     (OFFSITE_REQUIRE_OBJECT_LOCK=1 default); objects are uploaded with --checksum-algorithm SHA256.
# Metric: BACKUP_METRICS_FILE → <file>-offsite.prom, kb_backup_offsite_last_success_timestamp_seconds.
set -euo pipefail
LOG_TAG=offsite
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TARGET="${OFFSITE_TARGET:-}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir) BACKUP_DIR="$2"; shift 2 ;;
    --target) TARGET="$2"; shift 2 ;;
    -h|--help) sed -n '2,26p' "$0"; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done
[[ -n "$TARGET" ]] || die "OFFSITE_TARGET (or --target) is required"
[[ -d "$BACKUP_DIR" ]] || die "backup repository not found: $BACKUP_DIR"
BACKUP_DIR="$(cd "$BACKUP_DIR" && pwd)"
WAL_DIR="${WAL_ARCHIVE_DIR:-}"
REQUIRE_ENC="${OFFSITE_REQUIRE_ENCRYPTION:-1}"
need sha256sum find sort awk flock
T0=$(now_ms)
exec 7>"$BACKUP_DIR/.offsite.lock"
flock -n 7 || die "another offsite sync is running"

# ---------------------------------------------------------------- the list of files to ship: "relative-dest<TAB>abs-src"
LIST="$(mktemp "${TMPDIR:-/tmp}/kb-offsite.XXXXXX")"
trap 'rm -f -- "$LIST" "$LIST".*' EXIT
{
  find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name 'kb-*Z' -printf '%P\n' | while IFS= read -r d; do
    find "$BACKUP_DIR/$d" -type f ! -name '*.part.*' -printf "$d/%P\t$BACKUP_DIR/$d/%P\n"
  done
  [[ -d "$BACKUP_DIR/base" ]] && find "$BACKUP_DIR/base" -mindepth 1 -maxdepth 1 -type d -name 'base-*Z' -printf '%P\n' | while IFS= read -r d; do
    find "$BACKUP_DIR/base/$d" -type f -printf "base/$d/%P\t$BACKUP_DIR/base/$d/%P\n"
  done
  [[ -d "$BACKUP_DIR/objects" ]] && find "$BACKUP_DIR/objects" -mindepth 2 -maxdepth 2 -type f ! -name '*.part.*' -printf "objects/%P\t$BACKUP_DIR/objects/%P\n"
  if [[ -n "$WAL_DIR" && -d "$WAL_DIR" ]]; then
    find "$WAL_DIR" -maxdepth 1 -type f ! -name '*.part*' -printf "wal/%P\t$WAL_DIR/%P\n"
  fi
} | LC_ALL=C sort >"$LIST"

# Plaintext data must not leave the site.
if [[ "$REQUIRE_ENC" == "1" ]]; then
  plain="$(cut -f1 "$LIST" | grep -E '^(kb-[^/]+/db\.dump|base/[^/]+/base\.tar\.gz|objects/[0-9a-f]{2}/[0-9a-f]{64}|wal/[0-9A-F]{24}(\.[0-9A-F]{8}\.backup)?)$' | head -n 5 || true)"
  [[ -z "$plain" ]] || die "unencrypted data would leave the site (e.g. ${plain//$'\n'/, }) — set BACKUP_ENCRYPT_CMD / WAL_ENCRYPT_CMD or OFFSITE_REQUIRE_ENCRYPTION=0"
fi
TOTAL="$(wc -l <"$LIST")"
INDEX_SRC="$BACKUP_DIR/objects/index.log"

case "$TARGET" in
  s3://*)
    need aws
    bucket="${TARGET#s3://}"; bucket="${bucket%%/*}"
    AWS=(aws ${OFFSITE_S3_ENDPOINT:+--endpoint-url "$OFFSITE_S3_ENDPOINT"})
    if [[ "${OFFSITE_REQUIRE_OBJECT_LOCK:-1}" == "1" ]]; then
      [[ "$("${AWS[@]}" s3api get-bucket-versioning --bucket "$bucket" --query Status --output text 2>/dev/null)" == "Enabled" ]] || die "bucket $bucket: versioning is not Enabled"
      "${AWS[@]}" s3api get-object-lock-configuration --bucket "$bucket" --query ObjectLockConfiguration.ObjectLockEnabled --output text 2>/dev/null | grep -q Enabled || die "bucket $bucket: Object Lock is not enabled"
    fi
    existing="$LIST.remote"
    "${AWS[@]}" s3 ls --recursive "$TARGET/" | awk '{ size = $3; $1 = $2 = $3 = ""; sub(/^ +/, ""); print $0 "\t" size }' >"$existing" || true
    prefix="${TARGET#s3://$bucket}"; prefix="${prefix#/}"
    COPIED=0; BYTES=0
    declare -A HAVE=()
    while IFS=$'\t' read -r k s; do HAVE["${k#"$prefix"/}"]="$s"; done <"$existing"
    while IFS=$'\t' read -r rel src; do
      size="$(size_file "$src")"
      if [[ -n "${HAVE[$rel]:-}" ]]; then
        [[ "${HAVE[$rel]}" == "$size" ]] || die "INTEGRITY: $TARGET/$rel exists with size ${HAVE[$rel]}, local $size"
        continue
      fi
      "${AWS[@]}" s3 cp --only-show-errors --checksum-algorithm SHA256 "$src" "$TARGET/$rel"
      COPIED=$((COPIED + 1)); BYTES=$((BYTES + size))
    done <"$LIST"
    [[ -f "$INDEX_SRC" ]] && "${AWS[@]}" s3 cp --only-show-errors --checksum-algorithm SHA256 "$INDEX_SRC" "$TARGET/objects/index.log"
    ;;
  rsync:*)
    need rsync
    dest="${TARGET#rsync:}"
    cut -f1 "$LIST" | sed -E 's#^wal/.*##' | grep -v '^$' >"$LIST.local" || true
    rsync -a --ignore-existing --files-from="$LIST.local" "$BACKUP_DIR/" "$dest/"
    [[ -n "$WAL_DIR" && -d "$WAL_DIR" ]] && rsync -a --ignore-existing --exclude '*.part*' "$WAL_DIR/" "$dest/wal/"
    [[ -f "$INDEX_SRC" ]] && rsync -a "$INDEX_SRC" "$dest/objects/index.log"
    COPIED="$TOTAL"; BYTES=0
    ;;
  *)
    dest="${TARGET#dir:}"
    [[ "$dest" == /* ]] || die "dir target must be an absolute path: $dest"
    mkdir -p "$dest/.offsite"
    COPIED=0; BYTES=0
    : >"$LIST.dirs"
    while IFS=$'\t' read -r rel src; do
      d="$dest/$rel"
      size="$(size_file "$src")"
      if [[ -e "$d" ]]; then
        [[ "$(size_file "$d")" == "$size" ]] || die "INTEGRITY: $d exists with a different size — not overwritten; investigate (tampering at the source or the destination)"
        continue
      fi
      mkdir -p "$(dirname "$d")"
      cp -- "$src" "$d.part.$$"
      sync -- "$d.part.$$" 2>/dev/null || true
      [[ "$(sha256_file "$src")" == "$(sha256_file "$d.part.$$")" ]] || { rm -f -- "$d.part.$$"; die "copy of $rel does not match its source (sha256)"; }
      mv -f -- "$d.part.$$" "$d"
      chmod a-w "$d"
      COPIED=$((COPIED + 1)); BYTES=$((BYTES + size))
      case "$rel" in kb-*/SHA256SUMS|base/*/SHA256SUMS) dirname "$rel" >>"$LIST.dirs" ;; esac
    done <"$LIST"
    # Each newly completed backup must verify AT THE DESTINATION.
    while IFS= read -r b; do
      ( cd "$dest/$b" && sha256sum --quiet --strict -c SHA256SUMS ) || die "offsite copy $dest/$b fails its SHA256SUMS"
    done <"$LIST.dirs"
    if [[ -f "$INDEX_SRC" ]]; then
      di="$dest/objects/index.log"
      if [[ -f "$di" ]] && ! cmp -s -n "$(size_file "$di")" "$di" "$INDEX_SRC"; then die "INTEGRITY: objects/index.log at the destination is not a prefix of the local one"; fi
      cp -- "$INDEX_SRC" "$di.part.$$" && mv -f -- "$di.part.$$" "$di"
    fi
    printf '%s copied=%s bytes=%s total=%s verifiedBackups=%s\n' "$(date -u +%FT%TZ)" "$COPIED" "$BYTES" "$TOTAL" "$(wc -l <"$LIST.dirs")" >>"$dest/.offsite/sync.log"
    ;;
esac
write_metric offsite kb_backup_offsite_last_success_timestamp_seconds "$(date +%s)" "Unix time of the last successful offsite copy (offsite-sync.sh)."
log "offsite sync to $TARGET: $COPIED new file(s), $BYTES bytes of $TOTAL in $(( $(now_ms) - T0 )) ms"
printf '{"target":"%s","copied":%s,"bytes":%s,"total":%s,"ms":%s}\n' "$TARGET" "$COPIED" "$BYTES" "$TOTAL" "$(( $(now_ms) - T0 ))"
