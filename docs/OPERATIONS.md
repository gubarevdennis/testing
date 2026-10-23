# Эксплуатация

Руководство для администраторов и дежурных: установка, конфигурация, обновление и откат, масштабирование,
мониторинг, журналы и runbooks типовых инцидентов. Резервное копирование подробно описано в
[`BACKUP_RESTORE.md`](BACKUP_RESTORE.md).

Файлы развёртывания:

| Файл | Назначение |
|---|---|
| `Dockerfile` | Многоэтапная сборка: shared → server (tsc) → web (Vite). Образ на `node:22-bookworm-slim`, пользователь `node`, healthcheck `/healthz`, `tini`. В образ входят `pg_dump`/`psql` 16 и `jq` для сайдкара резервного копирования. |
| `.dockerignore` | Исключает данные, секреты, тесты и `node_modules`. |
| `deploy/docker-compose.yml` | postgres 16 (с WAL-архивацией), app, backup-сайдкар, MinIO (profile `minio`). |
| `deploy/env.example` | Все переменные окружения с пояснениями; секретов нет. |
| `deploy/nginx.conf` | TLS, WebSocket (`/api/v1/collab`, `/api/v1/events`), лимиты загрузки, заголовки безопасности. |
| `deploy/systemd/kb.service`, `kb-backup.service`, `kb-backup.timer` | Установка без контейнеров. |
| `deploy/monitoring/prometheus-alerts.yml`, `grafana-dashboard.json` | Алерты (32 правила) и дашборд. |
| `scripts/backup/*` | `backup.sh`, `restore.sh`, `verify-backup.sh`, `restore-objects.sh`, `wal-archive.sh`/`wal-restore.sh`, `backup-loop.sh`, `check-docs.mjs`. |

## 1. Установка

### Docker Compose (один хост)

```bash
cp deploy/env.example deploy/.env && chmod 600 deploy/.env
$EDITOR deploy/.env          # все CHANGE_ME: SECRET_KEY (openssl rand -base64 48), пароли БД, PUBLIC_URL
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
docker compose -f deploy/docker-compose.yml --env-file deploy/.env exec app \
  node apps/server/dist/cli.js bootstrap "ООО Компания" admin@corp.example "Администратор" 'Начальный-пароль-1'
# или первичная настройка через UI: POST /api/v1/setup доступен, пока организации нет
```

Затем настройте nginx по `deploy/nginx.conf`, выпустите TLS-сертификат и откройте `PUBLIC_URL`.
Порт приложения 8080 опубликован только на `127.0.0.1`. PostgreSQL наружу не публикуется.

Сборка образа: `docker build -t kb:<версия> .`. Для экспорта в PDF нужен Chromium:
`--build-arg INSTALL_CHROMIUM=1 … && CHROMIUM_PATH=/usr/bin/chromium`. Без него экспорт в PDF вернёт ошибку,
остальное работает. Языковые данные OCR (rus, eng) уже в образе, внешний интернет не нужен.

### Без контейнеров (systemd)

Требования: Node.js ≥ 22, PostgreSQL 16, `pg_dump` 16, `jq`.

```bash
sudo useradd --system --home /var/lib/kb kb
sudo install -d -o kb -g kb -m 0750 /var/lib/kb /var/lib/kb/objects
cd /opt/kb && npm ci && npx tsc -b packages/shared && npm run build -w @kb/server && npm run build -w @kb/web && npm prune --omit=dev
sudo install -m 0640 -o root -g kb deploy/env.example /etc/kb/kb.env   # отредактировать
sudo cp deploy/systemd/kb*.service deploy/systemd/kb-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now kb kb-backup.timer
```

Комментарии в `kb.env` должны быть на отдельных строках: systemd и `docker run --env-file` не понимают
комментарии в конце строки.

Режим разработки: `node --import tsx --conditions=development apps/server/src/main.ts`.

### Роли PostgreSQL

| Роль | Права | Где используется |
|---|---|---|
| `kb` | владелец схемы БД `kb` | приложение (`DATABASE_URL`); миграции при старте |
| `kb_backup` | `SELECT` на всё, `INSERT/UPDATE` на `backups`; `REPLICATION` при `pg_basebackup` | `backup.sh` (`BACKUP_DATABASE_URL`) |
| `kb_verify` | `CREATEDB` | `verify-backup.sh` (`VERIFY_ADMIN_URL`) — временная БД `kb_verify_*` |

## 2. Конфигурация

Полный список переменных — в `deploy/env.example`; источник — `apps/server/src/config.ts`. Главное:

* `NODE_ENV=production` включает обязательный `SECRET_KEY` (≥ 32 символов), cookie `Secure` и отключает
  тестовые маршруты.
* `DATABASE_URL`, `DB_POOL_SIZE`: держите `экземпляров × DB_POOL_SIZE + 20 < max_connections`.
* `STORAGE_DRIVER=fs` + `STORAGE_ROOT` (по умолчанию `$KB_DATA_DIR/objects`) или `s3` + `S3_*`.
* `MAX_UPLOAD_MB` / `MAX_IMPORT_MB` не должны превышать `client_max_body_size` в nginx.
* `WORKER_ENABLED=false` выключает фоновые задачи на экземплярах, которые должны обслуживать только HTTP/WebSocket.
* `METRICS_TOKEN` защищает `/metrics` (Bearer). nginx также закрывает `/metrics` снаружи.
* `CLAMAV_HOST=clamd:3310` включает антивирусную проверку загрузок, импорта (каждый файл и каждое вложение
  внутри ZIP/DOCX) и восстановления архива. Проверка работает в режиме fail-closed: если clamd недоступен, файл
  не принимается (HTTP 503 `av_unavailable` «Антивирусная проверка недоступна…»; файл больше `StreamMaxLength`
  clamd — 413 `av_limit`, поэтому `StreamMaxLength` ≥ `MAX_UPLOAD_MB`/`MAX_IMPORT_MB`). `CLAMAV_TIMEOUT_MS` (60 000) —
  предельное время вердикта. Метрики `kb_antivirus_up`, `kb_antivirus_scans_total{result}`. Этапы импорта (upload, scan, detect, parse, normalize, media, validate, preview, commit, index)
  записываются в задание (`GET /api/v1/imports/:id` → `progress.stages`) и в журнал (`msg: import stage`).

## 3. Обновление, миграции и откат

Миграции (`apps/server/migrations/NNNN_*.sql`, секции `-- migrate:up` / `-- migrate:down`) применяются
**автоматически при старте** под advisory-lock: несколько экземпляров могут стартовать одновременно.
Изменённая после применения миграция обнаруживается по контрольной сумме, и старт прерывается.

Порядок обновления (rolling):

1. Сделайте копию **перед** обновлением (ТЗ п. 9: «любая миграция — с резервной копией»):
   `backup.sh`, затем `verify-backup.sh --latest` (для полной копии).
   Правило **проверяется автоматически** (R-OPS-004): если в БД есть данные и есть неприменённые миграции, сервер
   при старте и `cli migrate up` отказываются их применять (`BackupRequiredError`), пока в таблице `backups` нет
   успешной полной копии (`backup.sh` с `BACKUP_RECORD=1`), завершённой не раньше `MIGRATION_BACKUP_MAX_AGE_MIN`
   (180 мин) назад и после последней применённой миграции. Включено по умолчанию при `NODE_ENV=production`
   (`MIGRATION_REQUIRE_BACKUP`). Осознанный обход — `cli migrate up --skip-backup-check` (пишет предупреждение;
   его использует `restore.sh`, потому что восстановленная БД сама является копией). Проверено тестом
   `tests/resilience/migrations.test.ts`.
2. Просмотрите новые миграции: `node apps/server/dist/cli.js migrate status`.
3. Обновите один экземпляр: `docker compose … up -d app` или `systemctl restart kb`. SIGTERM запускает
   graceful shutdown: документы сохраняются, WebSocket-клиенты получают «перезапуск сервера»,
   переподключаются и досылают неподтверждённые правки (проверено тестом `crash-restart`).
4. Дождитесь `/readyz` = 200 (`checks.migrations = ok`) и проверьте алерты, затем обновите остальные экземпляры.

Откат релиза (OPS-002, E-14):

* **Без изменения схемы:** верните предыдущий образ или тег.
* **С миграцией.** Сначала откатите схему **новой** версией кода (в ней есть секции down), затем верните
  старый образ:
  ```bash
  node apps/server/dist/cli.js migrate down 1     # по одной миграции; проверяйте migrate status
  ```
  Порядок важен: старая версия **отказывается запускаться** на более новой схеме — `SchemaTooNewError`
  («Database schema is newer than this application…»), поэтому откатывайте схему до замены образа. Откат каждой
  миграции с данными в БД и отказ старой версии проверяются тестом `tests/resilience/migrations.test.ts`.
* Полный цикл на **пустой** БД через CLI релиза (`migrate up` → `migrate down N` без остатков → `migrate up` с
  идентичной схемой по `pg_dump --schema-only`) проверяется тестом `tests/resilience/migrations-fresh.test.ts`.
* **Если down-миграция теряет данные или не удалась:** восстановите копию, сделанную на шаге 1, в новую БД
  (`restore.sh`) и переключите `DATABASE_URL`. Изменения после копии восстанавливаются через PITR (WAL).

## 4. Масштабирование

* Приложение не хранит состояния между запросами. Документы координируются через PostgreSQL: журнал
  `doc_updates`, `LISTEN/NOTIFY` для межэкземплярных событий. Поэтому можно держать N экземпляров за nginx
  (`least_conn`) без sticky sessions. Шина событий переподключается после потери соединения с БД и делает
  повторную синхронизацию открытых документов и проверку прав (проверено тестом).
* Фоновые задачи (импорт, OCR, экспорт, индексация) берутся через `FOR UPDATE SKIP LOCKED`. Их можно вынести
  на отдельные экземпляры: `WORKER_ENABLED=true` на воркерах и `false` на фронтах.
* Узкое место — PostgreSQL. Ориентиры: `max_connections`, `shared_buffers` ≈ 25 % ОЗУ, PgBouncer в
  транзакционном режиме **не подходит** для шины событий (нужен LISTEN), используйте session-режим или прямые
  соединения.
* Файлы: `fs` на общем томе (NFS с fsync) или S3-совместимое хранилище, если экземпляров больше одного.
* Graceful shutdown занимает до 30 с: в compose `stop_grace_period: 40s`, в systemd `TimeoutStopSec=45`.

## 5. Мониторинг и алерты

Точки проверки:

| Точка | Назначение |
|---|---|
| `GET /healthz` | Liveness: процесс отвечает. **Не** зависит от БД, поэтому при сбое БД процесс не перезапускается. |
| `GET /readyz` | Readiness: БД, хранилище (запись пробного файла), применённые миграции. Возвращает 503 с `checks`. |
| `GET /metrics` | Prometheus (prom-client, префикс `kb_`). |
| `GET /api/v1/admin/health` | Панель «Здоровье системы» для администратора: БД, хранилище, коллаборация, задачи, бэкапы, предупреждения. |

Ключевые метрики приложения (`apps/server/src/observability/metrics.ts`):

* HTTP: `kb_http_request_duration_seconds{method,route,status}`.
* Совместное редактирование: `kb_collab_connections`, `kb_collab_documents`, `kb_collab_updates_total`,
  `kb_collab_rejected_total`, `kb_collab_persist_failures_total`, `kb_collab_persist_seconds`.
* Фоновые задачи: `kb_jobs_total{type,status}`, `kb_jobs_queued`, `kb_outbox_pending` (отставание индекса).
* Резервное копирование: `kb_backup_age_seconds`, `kb_restore_verification_age_seconds` — из таблицы
  `backups`, которую заполняют скрипты.
* Клиенты: `kb_client_errors_total`, `kb_client_unsynced_queue_age_seconds`, `kb_client_input_latency_ms`.
* Целостность: `kb_integrity_errors`.
* Процесс: `kb_process_*`, `kb_nodejs_*`.

Скрипты бэкапа дополнительно пишут textfile-метрики для node_exporter (`BACKUP_METRICS_FILE`):
`kb_backup_last_success_timestamp_seconds`, `kb_restore_verification_last_success_timestamp_seconds`,
`kb_backup_objects_last_sync_timestamp_seconds`, `kb_basebackup_last_success_timestamp_seconds` (`basebackup.sh`),
`kb_backup_offsite_last_success_timestamp_seconds` (`offsite-sync.sh`), `kb_pitr_verify_last_success_timestamp_seconds`
(`verify-pitr.sh`). Ответы `/healthz`, `/readyz`, `/metrics` реального процесса в `NODE_ENV=production` проверяет тест
`tests/integration/ops-delivery.test.ts`.

Алерты (`deploy/monitoring/prometheus-alerts.yml`, проверка: `promtool check rules …`) объединены в группы:

| Группа | Алерты |
|---|---|
| Доступность | instance/all down, 5xx > 2 %, p95 > 1 с, event loop lag, память, цикл перезапусков |
| Совместное редактирование | сбои фиксации, p99 фиксации > 500 мс, отклонённые правки, неотправленные изменения клиентов старше 5 мин, ошибки браузеров |
| Фоновые задачи | очередь > 100, доля ошибок > 20 %, отставание индекса > 1000, ошибки целостности |
| Бэкап | копия старше 26 ч (из приложения и с хоста бэкапа), нет ни одной копии, проверка восстановления старше 8 дней, сбой или задержка архивации WAL, файлы не синхронизируются > 10 мин (`KbObjectSyncStale`), внешняя копия старше 15 мин (`KbOffsiteCopyStale`), базовая копия старше 26 ч (`KbBaseBackupStale`), проверка PITR старше 35 дней (`KbPitrVerificationTooOld`) |
| Инфраструктура (node/postgres_exporter) | PostgreSQL down, соединения > 85 %, долгая транзакция, диск < 15 %, прогноз заполнения диска за сутки, хост down |

Каждый алерт несёт `owner` (ops/dba/dev) и ссылку `runbook` на раздел ниже. Дашборд
`deploy/monitoring/grafana-dashboard.json` импортируется в Grafana (переменные `datasource`, `job`).
Ожидаемые задания сбора метрик: `job="kb"`, `job="node"` (с textfile collector), `job="postgres"`.

## 6. Журналы

### Трассировка (OpenTelemetry)

Каждый HTTP-запрос и каждая фоновая задача — это span. Входящий заголовок `traceparent` (W3C Trace Context)
продолжает трассу вызывающей стороны, ответ возвращает `traceparent` серверного span, а `traceId` пишется в
журнал запроса рядом с `reqId`. Задачи импорта и экспорта продолжают трассу запроса, который их создал.
Экспорт — OTLP/HTTP (JSON) в любой OpenTelemetry Collector, Jaeger или Tempo:
`OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318` (или `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`),
`OTEL_SERVICE_NAME` (по умолчанию `kb`), `OTEL_EXPORTER_OTLP_HEADERS=authorization=Bearer …`. Без адреса
идентификаторы трасс всё равно создаются для журналов. Экспорт идёт пакетами в фоне и не влияет на запросы
(очередь ограничена 5000 span). Проверено тестом `tests/integration/io-p0-ops.test.ts`.

* Приложение пишет JSON-журнал (pino) в stdout, уровень задаёт `LOG_LEVEL`. В каждой записи запроса есть
  `reqId`, который совпадает с `correlationId` в ответе об ошибке: по номеру из сообщения пользователя
  находится нужная запись. Заголовок `x-correlation-id` вызывающей стороны становится `reqId`. Тела документов,
  пароли, cookie и `SECRET_KEY` в журнал не попадают (тест `tests/integration/ops-delivery.test.ts` проверяет это на
  реальном процессе в `NODE_ENV=production`: каждая строка — JSON с `level`/`time`, пароль входа и ключ не встречаются).
  * Docker: `docker compose -f deploy/docker-compose.yml logs -f app`; драйвер `json-file` или
    отправка в Loki/ELK.
  * systemd: `journalctl -u kb -f -o cat | npx pino-pretty`.
* Скрипты бэкапа: stderr с префиксами `[backup]`, `[restore]`, `[verify]`. Для сайдкара —
  `docker compose logs backup`, для systemd — `journalctl -u kb-backup`. Отчёты JSON выводятся в stdout или
  в файл `--report`.
* PostgreSQL: `docker compose logs postgres` или `/var/log/postgresql/postgresql-16-main.log`.
* nginx: `/var/log/nginx/kb.access.log`, `kb.error.log`.
* Аудит действий пользователей хранится в БД (`audit_events`, хеш-цепочка). Проверка целостности:
  `GET /api/v1/audit/verify` или `node apps/server/dist/cli.js audit-verify`.

## 7. Runbooks

<a id="runbook-app-down"></a>
### 7.1 Приложение недоступно / перезапускается

1. Проверьте `curl -s localhost:8080/healthz`, `…/readyz`, затем `docker compose ps` или `systemctl status kb`.
2. Посмотрите последние строки журнала. Частые причины:
   * `SECRET_KEY must be at least 32 characters`;
   * `Migration … was modified after being applied` — подменён файл миграции, верните оригинал;
   * `Migration … failed` — БД осталась на предыдущей версии, восстановите образ;
   * `EADDRINUSE`.
3. Если процесс упал по OOM (`KbMemoryHigh`), снимите heap-профиль и увеличьте лимит. Данные не теряются:
   подтверждённые правки лежат в журнале, неподтверждённые — на клиентах.
4. Цикл перезапусков при недоступной БД — ожидаемое поведение readiness. Переходите к 7.2.

<a id="runbook-db-down"></a>
### 7.2 База данных недоступна

Симптомы: `/readyz` 503 (`checks.database: error`), ответы API **503 `db_unavailable`** («База данных временно
недоступна…»), алерт `KbPostgresDown`, у пользователей статус «синхронизация» или «только на этом устройстве».

Поведение системы (проверено `db-connection-loss.test.ts`):

* правки не помечаются «Сохранено» и остаются у клиентов;
* транзакции, оборванные до COMMIT, повторяются автоматически (до 5 раз, ≈ 3 с);
* процесс не падает;
* после возврата БД клиенты досылают правки, а шина событий переподключается сама.

Действия:

1. Проверьте `pg_isready -h db`, место на диске БД (7.3) и журнал PostgreSQL (`FATAL`, `PANIC`,
   `could not write`).
2. Если упёрлись в соединения (`too many connections`), найдите долгие и зависшие сессии:
   `select pid, state, now()-xact_start, query from pg_stat_activity order by 3 desc nulls last;`.
   Уменьшите `DB_POOL_SIZE` или число экземпляров.
3. Если повреждение или потеря БД, переходите к 7.6.
4. После восстановления убедитесь, что `/readyz` = 200, `kb_collab_persist_failures_total` больше не растёт
   и `kb_client_unsynced_queue_age_seconds` возвращается к нулю.

<a id="runbook-disk-full"></a>
### 7.3 Закончилось место на диске

* **Том БД.** PostgreSQL перестаёт принимать запись, приложение отвечает 503. Частая причина — растущий
  `pg_wal` из-за сломанной архивации WAL (`KbWalArchivingFailing`, `select * from pg_stat_archiver`).
  Почините `archive_command` (место в архиве, права). **Не удаляйте файлы из pg_wal вручную.** Временно можно
  расширить том.
* **Том объектов (`STORAGE_ROOT`).** Загрузка файлов возвращает 5xx без «осиротевших» строк в БД и без
  временных файлов, `/readyz` показывает `storage: error` (проверено `storage-failure.test.ts`). Освободите
  место, затем загрузите файлы заново. Очистите `$STORAGE_ROOT/tmp` от файлов старше суток:
  `find $STORAGE_ROOT/tmp -type f -mtime +1 -delete` — это незавершённые загрузки.
* **Том копий.** `backup.sh` завершается с ошибкой (`KbBackupTooOld`). Проверьте политику хранения
  (`BACKUP_KEEP_*`). Удалять каталоги копий вручную безопасно: пул объектов почистится при следующем запуске.
  **Не удаляйте** файлы из `objects/` вручную.

<a id="runbook-storage"></a>
### 7.4 Объектное хранилище недоступно или повреждено

1. Посмотрите `/readyz` → `checks.storage` и `/api/v1/admin/health` → `services.storage`.
2. **fs:** смонтирован ли том, доступен ли он на запись пользователю `node`/`kb`, есть ли место (7.3).
   **s3:** доступность эндпоинта, срок действия ключей, существование бакета.
3. Чтение уже загруженных файлов во время сбоя возвращает ошибку, документы и правки продолжают работать.
   Новые загрузки откатываются целиком: ни одна строка не ссылается на несуществующий объект.
4. Алерт `KbIntegrityErrors` или сообщения `INTEGRITY:` в журнале бэкапа означают, что содержимое объекта
   не совпадает с его sha256.
   * Найдите объект в журнале (`stored files failed integrity verification`).
   * Восстановите его из пула копий: `cp $BACKUP_DIR/objects/<aa>/<sha> $STORAGE_ROOT/blobs/<aa>/<bb>/<sha>`
     (для зашифрованных — через `BACKUP_DECRYPT_CMD`). Затем проверьте `sha256sum`.

<a id="runbook-stuck-jobs"></a>
### 7.5 Зависшие фоновые задачи / отставание поиска

* Задачи с `status='running'` и истёкшим `locked_until` (10 мин без heartbeat) автоматически забирает другой
  воркер. Это происходит, например, если воркер упал.
* Диагностика:
  ```sql
  select type, status, count(*), min(created_at) from jobs where status in ('queued','running') group by 1,2;
  select id, type, attempts, error, locked_by, locked_until from jobs where status = 'running' order by started_at limit 20;
  ```
* Если очередь растёт: убедитесь, что хотя бы на одном экземпляре `WORKER_ENABLED=true`, увеличьте
  `WORKER_CONCURRENCY` или добавьте воркеры. Отменить импорт: `POST /api/v1/imports/:id/cancel`.
* Отставание индекса (`kb_outbox_pending`):
  `select count(*), max(attempts), max(last_error) from outbox where processed_at is null;`.
  Записи с `attempts >= 10` больше не обрабатываются. После устранения причины сбросьте счётчик:
  `update outbox set attempts = 0 where processed_at is null and attempts >= 10;`.

<a id="runbook-collab-persist"></a>
### 7.6 Сбои фиксации правок (`KbCollabPersistFailures`)

Каждый сбой означает, что сервер не смог записать правку в журнал. Клиент получает «повторите»
(`persist_failed`), статус «Сохранено» не показывается, и правка повторяется каждые 2 с.

Если БД отказала посередине операции и сервер не смог даже перечитать документ, документ выгружается из
памяти, а редакторы переподключаются и синхронизируются с фактическим состоянием БД. Так сервер не сообщает
«сохранено» о том, чего нет в журнале (`db-connection-loss.test.ts`, «between applying and committing»).

1. Найдите в журнале `failed to persist update` и `cannot rebuild document after failed persist`
   (`pageId`, `err`).
2. Обычная причина — 7.2 или 7.3. Ошибки ограничений (`duplicate key`) или lock timeout на конкретной
   странице означают, что кто-то держит блокировку:
   `select * from pg_locks l join pg_stat_activity a using (pid) where relation = 'doc_state'::regclass;`.
3. `kb_collab_rejected_total` — это другое: клиент прислал правку, нарушающую схему документа. Клиенту
   предлагается сохранить локальную копию. Проверьте совместимость версий клиента и сервера (кэш PWA после
   релиза).
4. Сохранность проверяется так: `node scripts/backup/check-docs.mjs $DATABASE_URL` воспроизводит все документы
   из журнала без пропусков.

<a id="runbook-reconnects"></a>
### 7.6.1 Массовые переподключения (`KbCollabReconnectStorm`)

`kb_collab_reconnects_total` растёт, когда та же сессия снова открывает тот же документ в течение 2 минут после
разрыва. Правки при этом не теряются (очередь клиента), но пользователи видят «Переподключение…».

1. Совпадает ли всплеск с перезапуском экземпляров (`kb_process_start_time_seconds`) или релизом — тогда это
   ожидаемо и затухает за минуты.
2. Иначе проверьте таймауты прокси для WebSocket (`proxy_read_timeout` в `deploy/nginx.conf` должен быть больше
   интервала ping 25 с), балансировщик и сеть; в журнале nginx — коды 499/502/504 на `/api/v1/collab`.
3. По трассам (раздел 6, «Трассировка») найдите медленные `GET /api/v1/collab/:pageId` с ошибками.

<a id="runbook-import-ocr"></a>
### 7.6.2 Ошибки импорта и медленный OCR (`KbImportFailureRateHigh`, `KbOcrSlow`, `KbOcrFailing`)

* Импорт: `kb_import_files_total{format,status}` показывает, какой формат отклоняется. Отчёт по файлу —
  `GET /api/v1/imports/:id` (`preview.files[].error`), этапы — в журнале (`msg: import stage`, `jobId`).
  `rejected` — антивирус или лимит размера (`MAX_IMPORT_MB`), `error` — файл не разобран (повреждён, не тот формат).
* OCR: `kb_ocr_duration_seconds` — время распознавания одного изображения. Рост p95 означает нехватку CPU у
  воркеров: увеличьте `WORKER_CONCURRENCY` только при свободных ядрах, иначе вынесите воркеры на отдельные
  экземпляры (`WORKER_ENABLED`). Ошибки — в `ocr_results.error` и журнале (`job failed`, `type: ocr`).

<a id="runbook-antivirus"></a>
### 7.6.3 Антивирус недоступен (`KbAntivirusDown`, `KbAntivirusScanErrors`, `KbMalwareRejected`)

* Пока clamd недоступен, загрузка вложений, импорт и восстановление архивов **отклоняются** (fail closed),
  пользователи видят «Антивирусная проверка недоступна — файл … не принят. Повторите позже.». Уже сохранённые
  данные не затрагиваются.
* Проверка: `printf 'zPING\0' | nc clamd 3310` → `PONG`; журнал clamd; память (clamd с полной базой занимает
  ≈ 1–1,5 ГБ, при нехватке его завершает OOM killer); `freshclam` (устаревшая база не мешает работе, но снижает
  защиту).
* `KbAntivirusScanErrors` без `KbAntivirusDown`: тайм-аут (`CLAMAV_TIMEOUT_MS`), слишком большой файл
  (`StreamMaxLength`, `MaxScanSize` в `clamd.conf`) — в журнале приложения `antivirus scan failed`.
* `KbMalwareRejected`: найти загрузившего в аудите (`attachment.rejected`, `import.rejected`,
  `archive.restore_rejected`), проверить его рабочее место.

<a id="runbook-slow"></a>
### 7.7 Медленная работа

Порядок проверки:

1. Дашборд: «Медленные маршруты (p95)» и event loop lag.
2. `pg_stat_statements`: самые дорогие запросы.
3. Долгие транзакции (`KbPostgresLongTransaction`).
4. Активные импорт, OCR и экспорт в очереди. Если задачи тяжёлые, вынесите воркеры на отдельные экземпляры.

<a id="runbook-backup"></a>
### 7.8 Резервная копия не создаётся или не проверяется

1. Журнал: `docker compose logs backup`, `journalctl -u kb-backup`, таблица
   `select * from backups order by started_at desc limit 5` (поле `details.error`).
2. Частые причины:
   * нет места на томе копий;
   * у роли `kb_backup` нет прав (`permission denied`);
   * версия `pg_dump` ниже версии сервера;
   * `INTEGRITY:` — повреждённый объект, см. 7.4;
   * не работает `BACKUP_ENCRYPT_CMD` (нет ключа).
   * `basebackup.sh`: `pg_verifybackup failed` — копия не сохранена (по замыслу), проверьте диск и `pg_wal`;
     нет права `REPLICATION` у роли `BASEBACKUP_URL`; запрос пароля (используйте `~/.pgpass`, скрипт не ждёт ввода);
   * `offsite-sync.sh`: `unencrypted data would leave the site` — не задан `BACKUP_ENCRYPT_CMD`/`WAL_ENCRYPT_CMD`;
     `INTEGRITY` — локальный файл и внешняя копия различаются: **не удаляйте** внешнюю копию, сравните sha256 и
     выясните, какая сторона повреждена (`sha256sum -c SHA256SUMS` в каталоге копии); `versioning is not Enabled` /
     `Object Lock is not enabled` — бакет настроен неверно;
   * `verify-pitr.sh`: смотрите журнал временного кластера (путь в сообщении об ошибке, `--keep` оставляет каталог).
3. После исправления запустите вручную: `backup.sh`, затем `verify-backup.sh --latest`; для PITR — `basebackup.sh`,
   `offsite-sync.sh`, `verify-pitr.sh --repo <внешняя копия>`. Алерт снимется при следующем сборе метрик.
4. Если сбой `verify-backup.sh`, **последняя копия считается непригодной** (E-08). Разберите причину по отчёту.
   Для проверки предыдущей копии запустите `verify-backup.sh /backups/kb-…`.

<a id="runbook-disaster"></a>
### 7.9 Восстановление после аварии (потеря сервера, БД или хранилища)

Полная процедура с выбором точки восстановления — в [`BACKUP_RESTORE.md` §5](BACKUP_RESTORE.md),
PITR — в [`scripts/backup/wal-archive.md`](../scripts/backup/wal-archive.md). Коротко:

1. Остановите запись (обслуживание на балансировщике). Клиенты держат неподтверждённые правки у себя.
2. Восстановите данные в **новый** контур (при потере площадки — с внешней копии `OFFSITE_TARGET`; ключ
   расшифрования берётся из сейфа/менеджера секретов, на площадке его нет):
   * PITR: `scripts/backup/pitr-restore.sh --base-root <копия>/base --wal <копия>/wal --pgdata /srv/pg-restore --port 5433
     --latest` (или `--target-time T`), затем `restore-objects.sh --db … --pool <копия>/objects --target … [--allow-missing]`;
   * или полная копия: `restore.sh <копия> --create --target-db … --target-storage …`.
3. Проверьте: `audit-verify`, `check-docs.mjs`; для полной копии `restore.sh` проверяет всё сам. Затем
   выборочно вручную.
4. Переключите `DATABASE_URL`/`STORAGE_ROOT`, запустите приложение и дождитесь `/readyz`.
5. Зафиксируйте фактические RPO/RTO: время последней воспроизведённой транзакции (`lastReplayedTransaction` в
   выводе `pitr-restore.sh`) против момента аварии — это RPO БД; список `missingBlobs` из `--report` — потерянные
   файлы. Ориентиры по времени — в `BACKUP_RESTORE.md` §6 и в протоколе учения `docs/drills/LATEST.md`
   (`npm run restore:drill`).

<a id="runbook-security"></a>
### 7.10 Компрометация учётной записи администратора

* Отзовите сеансы пользователя (приостановка закрывает его live-сессии) и смените пароль и MFA.
* Копии защищены от администратора приложения: у роли `kb_backup` отдельные учётные данные, а том или бакет
  копий недоступен приложению. Проверьте целостность аудита (`/api/v1/audit/verify`).
* При подозрении на порчу данных восстановитесь на момент до инцидента (PITR) в отдельный контур и сравните.
