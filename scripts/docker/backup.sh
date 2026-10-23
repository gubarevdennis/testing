#!/usr/bin/env bash
# Резервная копия локального/серверного стенда в Docker: база (pg_dump, формат custom) + файлы (том kb-data) + секреты.
#   scripts/docker/backup.sh            → backups/<дата-время>/{db.dump,files.tar.gz,secrets.tar.gz,SHA256SUMS}
# Копия делается «на ходу» (pg_dump согласован), приложение не останавливается.
set -euo pipefail
sums() { if command -v sha256sum >/dev/null; then sha256sum "$@"; else shasum -a 256 "$@"; fi; }  # Linux / macOS
cd "$(dirname "$0")/../.."
STAMP="${1:-$(date +%Y%m%d-%H%M%S)}"
DIR="backups/$STAMP"
mkdir -p "$DIR"
dc() { docker compose "$@"; }
# the secrets volume is used directly (the "secrets" service would rebuild the image and mix build output into the archive)
secrets_tool() { docker run --rm -i --user root -v "${KB_PROJECT:-kb-demo}_secrets:/secrets" --entrypoint "$1" "${KB_IMAGE:-kb:local}" "${@:2}"; }
if [ -z "$(dc ps -q postgres 2>/dev/null)" ]; then echo "Стенд не запущен (нет контейнера postgres) — нечего сохранять." >&2; exit 1; fi
echo "→ база данных…"
dc exec -T postgres sh -c 'pg_dump -U kb -d kb -Fc' > "$DIR/db.dump"
echo "→ файлы…"
dc run --rm --no-deps -T --entrypoint tar app czf - -C /var/lib/kb . > "$DIR/files.tar.gz"
echo "→ секреты…"
secrets_tool tar czf - -C /secrets . > "$DIR/secrets.tar.gz"
( cd "$DIR" && sums db.dump files.tar.gz secrets.tar.gz > SHA256SUMS )
[ -s "$DIR/db.dump" ] || { echo "Пустой дамп базы — копия НЕ сделана" >&2; exit 2; }
echo "Готово: $DIR ($(du -sh "$DIR" | cut -f1)). Храните копии вне этой машины."
