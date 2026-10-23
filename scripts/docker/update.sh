#!/usr/bin/env bash
# Безопасное обновление стенда в Docker без потери данных:
#   1) резервная копия базы, файлов и секретов (scripts/docker/backup.sh);
#   2) git pull (если это git-клон и нет локальных изменений кода);
#   3) пересборка образа и перезапуск — данные живут в именованных томах (pgdata, kb-data, secrets) и не трогаются;
#   4) миграции базы применяются при старте под блокировкой; ожидание готовности (/readyz).
# Если приложение не поднялось — подсказка, как вернуть копию. Никогда не используйте `docker compose down -v`.
set -euo pipefail
cd "$(dirname "$0")/../.."
dc() { docker compose "$@"; }
if [ -n "$(dc ps -q postgres 2>/dev/null)" ]; then
  STAMP="before-update-$(date +%Y%m%d-%H%M%S)"
  scripts/docker/backup.sh "$STAMP"
else
  STAMP=""
  echo "Стенд не запущен — копия не нужна (данных в томах ещё нет или они не изменятся)."
fi
if [ -d .git ] && [ "${KB_SKIP_PULL:-0}" != "1" ]; then
  if git diff --quiet && git diff --cached --quiet; then git pull --ff-only; else echo "Есть локальные изменения — git pull пропущен (KB_SKIP_PULL=1 чтобы не спрашивать)."; fi
fi
dc build
dc up -d --remove-orphans
for i in $(seq 1 80); do
  h="$(dc ps app --format '{{.Health}}' 2>/dev/null || true)"
  [ "$h" = "healthy" ] && break
  sleep 3
done
if [ "$(dc ps app --format '{{.Health}}')" != "healthy" ]; then
  echo "Приложение не стало готовым. Журнал: docker compose logs app" >&2
  [ -n "$STAMP" ] && echo "Вернуть данные до обновления: scripts/docker/restore.sh backups/$STAMP" >&2
  exit 3
fi
echo "Обновлено. Копия до обновления: ${STAMP:+backups/$STAMP}"
