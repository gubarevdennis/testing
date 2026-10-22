# Корпоративная база знаний

Корпоративная база знаний с профессиональным редактором: дерево страниц и пространств, совместное редактирование в реальном времени с работой без сети, права доступа с наследованием, история версий, файлы и изображения (просмотр огромных схем, OCR), поиск, импорт/экспорт DOCX/Markdown/CSV/XLSX/PDF, полный архив организации, администрирование и аудит.

* Требования: [`SPECIFICATION.md`](SPECIFICATION.md) → реестр [`docs/requirements/registry.yaml`](docs/requirements/registry.yaml) → статус и тесты [`docs/REQUIREMENTS_TRACEABILITY.md`](docs/REQUIREMENTS_TRACEABILITY.md).
* Готовность к выпуску: [`docs/RELEASE_READINESS.md`](docs/RELEASE_READINESS.md). **Продукт не объявлен готовым к промышленной эксплуатации** — см. открытые пункты там.
* Архитектура: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), решения: [`docs/DECISIONS.md`](docs/DECISIONS.md), безопасность: [`docs/SECURITY.md`](docs/SECURITY.md), эксплуатация: [`docs/OPERATIONS.md`](docs/OPERATIONS.md), резервное копирование: [`docs/BACKUP_RESTORE.md`](docs/BACKUP_RESTORE.md), тесты: [`docs/TEST_MATRIX.md`](docs/TEST_MATRIX.md), UX-приёмка: [`docs/UX_ACCEPTANCE.md`](docs/UX_ACCEPTANCE.md).

## Требования к окружению

* Node.js 22+, npm 10+
* PostgreSQL 16 (расширения `pg_trgm`, `pgcrypto` создаются миграциями; нужен пользователь с правом `CREATEDB` для тестов)
* Для экспорта PDF — Chromium (`CHROMIUM_PATH`), для OCR — модели tesseract rus/eng (ставятся вместе с зависимостями)
* Python 3 + PyYAML — только для генерации матрицы трассируемости

## Быстрый старт (разработка)

```bash
git clone <repo> && cd <repo>
npm ci
# PostgreSQL: роль kb/kb с правом createdb и база kb
sudo -u postgres psql -c "create role kb login password 'kb' createdb" -c "create database kb owner kb"
npx tsc -b packages/shared          # собрать общий пакет (нужен серверу и клиенту)
npm run db:migrate                  # применить миграции
npm run dev                         # API :8080 + интерфейс :5173 (откройте http://localhost:5173)
```

При первом открытии мастер предложит создать организацию и учётную запись владельца. Демоданные: `npm run db:seed`.

## Сборка и запуск в production

```bash
npm ci && npm run build             # shared → server (apps/server/dist) → web (apps/web/dist)
export NODE_ENV=production DATABASE_URL=postgres://... SECRET_KEY=<32+ символов> PUBLIC_URL=https://kb.example.ru \
       KB_DATA_DIR=/var/lib/kb WEB_DIST=$PWD/apps/web/dist
npm start                           # миграции применяются при старте, затем слушает PORT (8080)
```

Все переменные — в [`deploy/env.example`](deploy/env.example). Docker: [`Dockerfile`](Dockerfile), [`deploy/docker-compose.yml`](deploy/docker-compose.yml) (PostgreSQL с архивированием WAL, приложение, резервное копирование, опционально MinIO); reverse proxy — [`deploy/nginx.conf`](deploy/nginx.conf); systemd — [`deploy/systemd/`](deploy/systemd). Подробно — `docs/OPERATIONS.md`.

## Проверки

| Команда | Что проверяет |
|---|---|
| `npm run typecheck` | TypeScript во всех пакетах |
| `npm run lint` | ESLint (0 ошибок обязательно) |
| `npm run test:unit` | Чистые функции: Markdown, TOTP, клиент синхронизации и т.п. |
| `npm run test:integration` | API на реальном PostgreSQL: права, дерево, совместное редактирование, файлы, OCR, поиск, импорт/экспорт, архив (переменная `TEST_ADMIN_DATABASE_URL`, по умолчанию `postgres://kb:kb@localhost:5432/postgres`) |
| `npm run test:resilience` | Отказы: падение процесса, потеря соединения с БД, сбой хранилища, учение «бэкап → восстановление» |
| `npm run test:e2e` | Браузерные сценарии (Playwright, Chromium): редактор, офлайн, двое пользователей, история, поиск, вставка, раскладки 320–1920 px, тёмная тема, 200 % зум, WCAG (axe), эталонные скриншоты |
| `npm run requirements:trace` | Пересобрать `docs/REQUIREMENTS_TRACEABILITY.md` |
| `python3 scripts/release-gate.py` | Шлюз выпуска: падает, пока открыт хотя бы один P0 |
| `npm run audit-verify` | Целостность хеш-цепочки журнала аудита |
| `npm run backup` / `npm run restore:verify` | Резервная копия / проверка восстановления в отдельную БД |

CI: [`.github/workflows/ci.yml`](.github/workflows/ci.yml) запускает всё перечисленное.

## Структура

```
packages/shared   схема документа, Markdown, протокол и клиент синхронизации, модель прав
apps/server       Fastify API, WebSocket-хаб, ACL, файлы/OCR, импорт/экспорт, архив, задачи, миграции
apps/web          React-клиент (Tiptap/ProseMirror + Yjs)
tests/            unit, integration, resilience, e2e
scripts/          резервное копирование, трассируемость, шлюз выпуска, dev
deploy/           Docker Compose, nginx, systemd, мониторинг (Prometheus, Grafana)
docs/             документация (см. выше)
```
