# shellcheck shell=bash
# Shared helpers for backup.sh / restore.sh / verify-backup.sh. Sourced, never executed directly.
# No secrets live here: credentials come from the environment (DATABASE_URL, PG* variables, ~/.pgpass,
# S3 credentials for the aws CLI, the encryption command's own key source).

KB_BACKUP_FORMAT="kb-backup/1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

log() { printf '%s [%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${LOG_TAG:-kb-backup}" "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

need() {
  local c
  for c in "$@"; do command -v "$c" >/dev/null 2>&1 || die "required command not found: $c"; done
}

# Milliseconds since epoch (GNU date).
now_ms() { date +%s%3N; }

sha256_file() { sha256sum "$1" | awk '{print $1}'; }
size_file() { stat -c %s "$1"; }

# Strips the password from a libpq URL for logging / manifests.
redact_url() { printf '%s' "$1" | sed -E 's#(://[^:/@]+):[^@]*@#\1:***@#'; }

# Database name of a postgres URL (last path segment, without query string).
url_dbname() { local u="${1%%\?*}"; printf '%s' "${u##*/}"; }

# Replaces the database name of a postgres URL.
url_with_db() {
  local u="$1" db="$2" q=""
  if [[ "$u" == *\?* ]]; then q="?${u#*\?}"; u="${u%%\?*}"; fi
  printf '%s/%s%s' "${u%/*}" "$db" "$q"
}

psql_q() { # psql_q URL SQL... -> unaligned, tuples only
  local url="$1"; shift
  psql "$url" -X -q -A -t -v ON_ERROR_STOP=1 "$@"
}

# Encrypt / decrypt hooks: commands reading stdin and writing stdout, e.g.
#   BACKUP_ENCRYPT_CMD='age -r age1...'                   BACKUP_DECRYPT_CMD='age -d -i /run/secrets/kb-backup.key'
#   BACKUP_ENCRYPT_CMD='gpg --batch -e -r backup@corp'     BACKUP_DECRYPT_CMD='gpg --batch -d'
#   BACKUP_ENCRYPT_CMD='openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:KB_BACKUP_PASSPHRASE'
#   BACKUP_DECRYPT_CMD='openssl enc -d -aes-256-cbc -pbkdf2 -pass env:KB_BACKUP_PASSPHRASE'
encryption_enabled() { [[ -n "${BACKUP_ENCRYPT_CMD:-}" ]]; }

# store_file SRC DEST : copies (and encrypts when enabled) SRC to DEST atomically (tmp + fsync + rename).
# DEST must already carry the ".enc" suffix when encryption is enabled.
store_file() {
  local src="$1" dest="$2" tmp
  mkdir -p "$(dirname "$dest")"
  tmp="$dest.part.$$"
  if encryption_enabled; then
    bash -c "$BACKUP_ENCRYPT_CMD" <"$src" >"$tmp"
  else
    cp -- "$src" "$tmp"
  fi
  sync -- "$tmp" 2>/dev/null || true
  mv -f -- "$tmp" "$dest"
}

# fetch_file SRC DEST ENCRYPTED(0|1): reverse of store_file.
fetch_file() {
  local src="$1" dest="$2" enc="$3" tmp
  mkdir -p "$(dirname "$dest")"
  tmp="$dest.part.$$"
  if [[ "$enc" == "1" ]]; then
    [[ -n "${BACKUP_DECRYPT_CMD:-}" ]] || die "backup is encrypted: set BACKUP_DECRYPT_CMD"
    bash -c "$BACKUP_DECRYPT_CMD" <"$src" >"$tmp"
  else
    cp -- "$src" "$tmp"
  fi
  mv -f -- "$tmp" "$dest"
}

# Command used to run the server CLI (migrate / audit-verify). Inside the production image the compiled
# CLI is used; from a source checkout the TypeScript entry point is run through tsx.
kb_cli() {
  if [[ -n "${KB_CLI:-}" ]]; then
    # shellcheck disable=SC2086
    (cd "$REPO_ROOT" && $KB_CLI "$@")
  elif [[ -f "$REPO_ROOT/apps/server/dist/cli.js" ]]; then
    (cd "$REPO_ROOT" && node apps/server/dist/cli.js "$@")
  else
    (cd "$REPO_ROOT" && node --import tsx --conditions=development apps/server/src/cli.ts "$@")
  fi
}

# Tables whose row counts are recorded in the manifest and compared after a restore.
COUNT_TABLES=(organizations users groups group_members spaces pages page_ancestors grants doc_state doc_updates page_revisions page_events blobs attachments attachment_versions blob_derivatives comments approvals templates collections search_index audit_events share_links schema_migrations)

# SQL returning "table<TAB>count" lines for COUNT_TABLES (one statement → one snapshot).
count_sql() {
  local t first=1
  printf 'select t, c from ('
  for t in "${COUNT_TABLES[@]}"; do
    [[ $first -eq 1 ]] || printf ' union all '
    first=0
    printf "select '%s' t, count(*)::bigint c from %s" "$t" "$t"
  done
  printf ') x order by t;\n'
}
