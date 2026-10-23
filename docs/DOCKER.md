# Docker: локальный запуск и развёртывание

## 1. Локально / демо — одна команда

```bash
docker compose up -d --build
```

Откроется **http://localhost:8080** с демо-данными (пользователи и пароль — в README, раздел «Быстрый старт в Docker»).

| Что | Где |
|---|---|
| Файл | `docker-compose.yml` в корне репозитория |
| Сервисы | `postgres` (PostgreSQL 16), `app` (сервер + интерфейс + фоновые задачи, OCR, экспорт PDF через Chromium), `secrets` (одноразово генерирует ключи), `demo` (одноразово заполняет демо-данные), `clamav` (по желанию, профиль `antivirus`) |
| Данные | тома `pgdata` (база), `kb-data` (файлы), `secrets` (ключ приложения и пароль БД) |
| Настройки через переменные окружения | `KB_PORT` (порт, по умолчанию 8080), `KB_DEMO=0` (без демо-данных), `PUBLIC_URL`, `CLAMAV_HOST=clamav` + `--profile antivirus` |

Полезные команды:

```bash
docker compose ps                      # состояние сервисов (app должен быть healthy)
docker compose logs -f app             # журнал приложения (JSON)
docker compose logs demo               # что создало наполнение демо-данными
docker compose exec app node apps/server/dist/cli.js audit-verify   # проверка цепочки аудита
docker compose down                    # остановить, данные сохранятся
docker compose down -v                 # удалить всё, включая данные и секреты
```

Сборка за корпоративным прокси с инспекцией TLS: положите корневой сертификат прокси (`*.crt`, PEM) в `deploy/certs/` и пересоберите — см. `deploy/certs/README.md`.

Локальный режим отличается от эксплуатационного только тем, что работает по HTTP (cookie без `Secure`) и сам создаёт демо-данные. Не открывайте его в интернет.

## 2. Развёртывание на сервере

Для эксплуатации используется `deploy/docker-compose.yml`: PostgreSQL с непрерывным архивированием WAL (восстановление на момент времени), приложение, контейнер резервного копирования, при необходимости — копия во внешнее S3-хранилище с защитой от удаления (профиль `offsite`) и MinIO. Снаружи доступен только nginx с HTTPS.

```bash
cp deploy/env.example deploy/.env      # заполнить: PUBLIC_URL, пароли, SECRET_KEY (openssl rand -base64 48), почта, OIDC…
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
# nginx на хосте: deploy/nginx.conf (TLS, заголовки, WebSocket, привязка совместного редактирования к экземпляру)
```

* Секреты можно передавать файлами: любая переменная `<ИМЯ>_FILE` (Docker/Kubernetes secrets, Vault Agent) — `docs/OPERATIONS.md` §2.1.
* При первом входе по адресу `PUBLIC_URL` мастер создаст организацию и владельца (демо-данных в этом режиме нет).
* Миграции базы применяются автоматически при старте под блокировкой; в production старт требует свежую резервную копию (`MIGRATION_REQUIRE_BACKUP`).

### Обновление и откат

```bash
scripts/deploy/deploy.sh               # план → резервная копия → миграции → переключение → проверка готовности → smoke-тесты
```

При любой ошибке скрипт автоматически откатывает миграции и возвращает предыдущий образ (коды выхода и порядок действий — `docs/OPERATIONS.md` §3.1 и §7.11). В GitHub Actions то же самое выполняет `.github/workflows/deploy.yml` (сборка образа, SBOM, проверка уязвимостей Trivy, выкладка с подтверждением окружения).

### Резервное копирование и восстановление

Контейнер `backup` делает ежедневные полные копии с проверкой; WAL архивируется не реже раза в минуту. Восстановление (в том числе на момент времени) и учения — `docs/BACKUP_RESTORE.md`. Измеренные RPO 26–28 с и RTO 6–8 с — `docs/drills/`.

### Мониторинг

`/healthz` (процесс жив), `/readyz` (БД, хранилище, миграции), `/metrics` (Prometheus, защита `METRICS_TOKEN`); правила алертов — `deploy/monitoring/`.
