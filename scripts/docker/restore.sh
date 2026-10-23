#!/usr/bin/env bash
# Восстановление стенда из копии scripts/docker/backup.sh:   scripts/docker/restore.sh backups/<дата-время>
# Перед восстановлением автоматически делается копия текущего состояния (её можно вернуть тем же скриптом).
set -euo pipefail
sums() { if command -v sha256sum >/dev/null; then sha256sum "$@"; else shasum -a 256 "$@"; fi; }  # Linux / macOS
cd "$(dirname "$0")/../.."
SRC="${1:?укажите каталог копии, например backups/20261023-120000}"
[ -f "$SRC/db.dump" ] || { echo "В $SRC нет db.dump" >&2; exit 1; }
( cd "$SRC" && sums -c SHA256SUMS ) || { echo "Контрольные суммы не совпали — копия повреждена" >&2; exit 1; }
dc() { docker compose "$@"; }
# the secrets volume is used directly (the "secrets" service would rebuild the image and mix build output into the archive)
secrets_tool() { docker run --rm -i --user root -v "${KB_PROJECT:-kb-demo}_secrets:/secrets" --entrypoint "$1" "${KB_IMAGE:-kb:local}" "${@:2}"; }
echo "→ копия текущего состояния перед восстановлением…"
scripts/docker/backup.sh "before-restore-$(date +%Y%m%d-%H%M%S)" || true
echo "→ останавливаю приложение…"
dc stop app >/dev/null
# whatever happens next, the application is started again
trap 'dc up -d app >/dev/null 2>&1 || true' EXIT
echo "→ файлы и секреты…"
dc run --rm --no-deps -T --user root --entrypoint sh app -c 'find /var/lib/kb -mindepth 1 -delete && tar xzf - -C /var/lib/kb --no-same-owner && chown -R node:node /var/lib/kb' < "$SRC/files.tar.gz"
secrets_tool sh -c 'tar xzf - -C /secrets --no-same-owner && chown 1000:999 /secrets/*' < "$SRC/secrets.tar.gz"
echo "→ база данных…"
dc exec -T postgres sh -c 'dropdb -U kb --if-exists --force kb_restore_tmp; createdb -U kb kb_restore_tmp && pg_restore -U kb -d kb_restore_tmp --no-owner' < "$SRC/db.dump"
dc exec -T postgres sh -c 'psql -U kb -d postgres -v ON_ERROR_STOP=1 -c "select pg_terminate_backend(pid) from pg_stat_activity where datname = '"'"'kb'"'"' and pid <> pg_backend_pid();" -c "alter database kb rename to kb_before_restore_$(date +%s);" -c "alter database kb_restore_tmp rename to kb;"'
echo "→ запускаю приложение…"
dc up -d app >/dev/null
for i in $(seq 1 60); do [ "$(dc ps app --format '{{.Health}}')" = "healthy" ] && break; sleep 3; done
dc ps app
echo "Восстановлено из $SRC. Прежняя база сохранена как kb_before_restore_* (удалить после проверки)."
