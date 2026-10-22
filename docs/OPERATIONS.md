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
| `deploy/monitoring/prometheus-alerts.yml`, `grafana-dashboard.json` | Алерты (28 правил) и дашборд. |
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
  не принимается. Этапы импорта (upload, scan, detect, parse, normalize, media, validate, preview, commit, index)
  записываются в задание (`GET /api/v1/imports/:id` → `progress.stages`) и в журнал (`msg: import stage`).

## 3. Обновление, миграции и откат

Миграции (`apps/server/migrations/NNNN_*.sql`, секции `-- migrate:up` / `-- migrate:down`) применяются
**автоматически при старте** под advisory-lock: несколько экземпляров могут стартовать одновременно.
Изменённая после применения миграция обнаруживается по контрольной сумме, и старт прерывается.

Порядок обновления (rolling):

1. Сделайте копию **перед** обновлением (ТЗ п. 9: «любая миграция — с резервной копией»):
   `backup.sh`, затем `verify-backup.sh --latest` (для полной копии).
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

Скрипты бэкапа дополнительно пишут textfile-метрики для node_exporter: `kb_backup_last_success_timestamp_seconds`,
`kb_restore_verification_last_success_timestamp_seconds`, `kb_backup_objects_last_sync_timestamp_seconds`.

Алерты (`deploy/monitoring/prometheus-alerts.yml`, проверка: `promtool check rules …`) объединены в группы:

| Группа | Алерты |
|---|---|
| Доступность | instance/all down, 5xx > 2 %, p95 > 1 с, event loop lag, память, цикл перезапусков |
| Совместное редактирование | сбои фиксации, p99 фиксации > 500 мс, отклонённые правки, неотправленные изменения клиентов старше 5 мин, ошибки браузеров |
| Фоновые задачи | очередь > 100, доля ошибок > 20 %, отставание индекса > 1000, ошибки целостности |
| Бэкап | копия старше 26 ч (из приложения и с хоста бэкапа), нет ни одной копии, проверка восстановления старше 8 дней, сбой или задержка архивации WAL |
| Инфраструктура (node/postgres_exporter) | PostgreSQL down, соединения > 85 %, долгая транзакция, диск < 15 %, прогноз заполнения диска за сутки, хост down |

Каждый алерт несёт `owner` (ops/dba/dev) и ссылку `runbook` на раздел ниже. Дашборд
`deploy/monitoring/grafana-dashboard.json` импортируется в Grafana (переменные `datasource`, `job`).
Ожидаемые задания сбора метрик: `job="kb"`, `job="node"` (с textfile collector), `job="postgres"`.

## 6. Журналы

* Приложение пишет JSON-журнал (pino) в stdout, уровень задаёт `LOG_LEVEL`. В каждой записи запроса есть
  `reqId`, который совпадает с `correlationId` в ответе об ошибке: по номеру из сообщения пользователя
  находится нужная запись. Тела документов в журнал не попадают.
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
3. После исправления запустите вручную: `backup.sh`, затем `verify-backup.sh --latest`. Алерт снимется при
   следующем сборе метрик.
4. Если сбой `verify-backup.sh`, **последняя копия считается непригодной** (E-08). Разберите причину по отчёту.
   Для проверки предыдущей копии запустите `verify-backup.sh /backups/kb-…`.

<a id="runbook-disaster"></a>
### 7.9 Восстановление после аварии (потеря сервера, БД или хранилища)

Полная процедура с выбором точки восстановления — в [`BACKUP_RESTORE.md` §5](BACKUP_RESTORE.md),
PITR — в [`scripts/backup/wal-archive.md`](../scripts/backup/wal-archive.md). Коротко:

1. Остановите запись (обслуживание на балансировщике). Клиенты держат неподтверждённые правки у себя.
2. Восстановите данные в **новый** контур:
   * PITR: базовая копия + WAL, затем `restore-objects.sh`;
   * или полная копия: `restore.sh <копия> --create --target-db … --target-storage …`.
3. Проверьте: `audit-verify`, `check-docs.mjs`; для полной копии `restore.sh` проверяет всё сам. Затем
   выборочно вручную.
4. Переключите `DATABASE_URL`/`STORAGE_ROOT`, запустите приложение и дождитесь `/readyz`.
5. Зафиксируйте фактические RPO/RTO. Ориентиры по времени — в `BACKUP_RESTORE.md` §6: восстановление
   524 МБ файлов + БД заняло 15 с, проверка — 21 с.

<a id="runbook-security"></a>
### 7.10 Компрометация учётной записи администратора

* Отзовите сеансы пользователя (приостановка закрывает его live-сессии) и смените пароль и MFA.
* Копии защищены от администратора приложения: у роли `kb_backup` отдельные учётные данные, а том или бакет
  копий недоступен приложению. Проверьте целостность аудита (`/api/v1/audit/verify`).
* При подозрении на порчу данных восстановитесь на момент до инцидента (PITR) в отдельный контур и сравните.
