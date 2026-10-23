# Матрица трассируемости требований

Сгенерировано `python3 scripts/requirements/trace.py` из `docs/requirements/registry.yaml` (все пункты ТЗ), оценок статуса `docs/requirements/status/*.yaml` и ссылок на ID требований в названиях автоматических тестов. Не редактируйте вручную.

Статусы: `done` — реализовано, `partial` — частично, `missing` — не реализовано, `manual` — требует ручной проверки, `env-blocked` — ограничение окружения, `process` — процесс/документ, `superseded` — заменено. «Тесты» — ID требования встречается в названии автоматического теста.

## Сводка

| Приоритет | Всего | реализовано | частично | не реализовано | требует ручной проверки | ограничение окружения | процесс/документ | заменено | не оценено | покрыто тестами |
|---|---|---|---|---|---|---|---|---|---|---|
| P0 | 637 | 525 | 76 | 12 | 1 | 8 | 14 | 1 | 0 | 434 |
| P1 | 588 | 227 | 276 | 30 | 32 | 7 | 15 | 1 | 0 | 95 |
| P2 | 73 | 26 | 24 | 6 | 7 | 0 | 9 | 1 | 0 | 1 |
| **Итого** | 1298 | 778 | 376 | 48 | 40 | 15 | 38 | 3 | 0 | 530 |

## По модулям

| Модуль | Всего | реализовано | частично | не реализовано | ручная проверка | окружение | процесс | покрыто тестами |
|---|---|---|---|---|---|---|---|---|
| A11Y | 24 | 12 | 12 | 0 | 0 | 0 | 0 | 10 |
| ACL | 139 | 126 | 13 | 0 | 0 | 0 | 0 | 88 |
| ADMIN | 28 | 15 | 13 | 0 | 0 | 0 | 0 | 9 |
| ARCHIVE | 30 | 26 | 3 | 0 | 0 | 0 | 1 | 18 |
| AUDIT | 11 | 11 | 0 | 0 | 0 | 0 | 0 | 9 |
| AUTH | 5 | 5 | 0 | 0 | 0 | 0 | 0 | 3 |
| BACKUP | 29 | 15 | 11 | 0 | 0 | 0 | 2 | 19 |
| CLIPBOARD | 45 | 24 | 16 | 1 | 0 | 4 | 0 | 21 |
| COLLAB | 80 | 70 | 8 | 0 | 2 | 0 | 0 | 60 |
| COLLECTION | 10 | 3 | 7 | 0 | 0 | 0 | 0 | 3 |
| COMMENTS | 3 | 0 | 2 | 1 | 0 | 0 | 0 | 1 |
| EDITOR | 105 | 64 | 34 | 2 | 4 | 1 | 0 | 26 |
| EXPORT | 37 | 23 | 10 | 0 | 2 | 1 | 0 | 21 |
| FILES | 17 | 12 | 5 | 0 | 0 | 0 | 0 | 7 |
| HELP | 11 | 5 | 2 | 0 | 3 | 0 | 1 | 0 |
| HISTORY | 63 | 51 | 9 | 3 | 0 | 0 | 0 | 39 |
| IMPORT | 63 | 48 | 14 | 0 | 0 | 1 | 0 | 44 |
| LAYOUT | 19 | 1 | 16 | 2 | 0 | 0 | 0 | 1 |
| MEDIA | 43 | 31 | 10 | 0 | 0 | 1 | 0 | 13 |
| OCR | 15 | 5 | 9 | 1 | 0 | 0 | 0 | 4 |
| OFFLINE | 28 | 26 | 2 | 0 | 0 | 0 | 0 | 25 |
| OPS | 29 | 9 | 14 | 0 | 1 | 3 | 2 | 10 |
| ORG | 7 | 6 | 1 | 0 | 0 | 0 | 0 | 5 |
| PAGE | 50 | 30 | 15 | 4 | 1 | 0 | 0 | 7 |
| PERF | 44 | 6 | 26 | 12 | 0 | 0 | 0 | 6 |
| PROCESS | 57 | 9 | 11 | 7 | 2 | 0 | 28 | 0 |
| PUBLISH | 15 | 9 | 5 | 1 | 0 | 0 | 0 | 4 |
| QA | 56 | 6 | 25 | 9 | 10 | 3 | 3 | 4 |
| SEARCH | 30 | 22 | 8 | 0 | 0 | 0 | 0 | 14 |
| SECURITY | 15 | 12 | 1 | 1 | 0 | 0 | 1 | 9 |
| SPACE | 15 | 13 | 1 | 1 | 0 | 0 | 0 | 8 |
| TABLE | 9 | 5 | 4 | 0 | 0 | 0 | 0 | 2 |
| TEMPLATES | 14 | 10 | 4 | 0 | 0 | 0 | 0 | 0 |
| TREE | 63 | 50 | 11 | 1 | 1 | 0 | 0 | 24 |
| UI | 89 | 18 | 54 | 2 | 14 | 1 | 0 | 16 |

## Открытые P0/P1 (частично / не реализовано / не оценено)

- **R-PROCESS-004** (P1, PROCESS, частично): Создать docs/ARCHITECTURE.md, DECISIONS.md, TEST_MATRIX.md, OPERATIONS.md, RELEASE_READINESS.md — RELEASE_READINESS.md not yet present at re-assessment (written by the lead)
- **R-QA-001** (P0, QA, частично): Тестировать в реальном браузере: навигация, курсор, выделение, hover, меню, drag-and-drop, масштаб, таблицы, мобильная версия … — drag-and-drop and text selection by mouse not covered; paste is synthetic
- **R-PROCESS-010** (P1, PROCESS, не реализовано): Итоговый отчёт: реализованное, трассировка, команды запуска, тесты, дефекты, производительность, резервирование, ограничения … — final report (RELEASE_READINESS) not written
- **R-QA-002** (P0, QA, частично): «Всё протестировано» = доказанное покрытие каждого доступного элемента и действия через каталог состояний, матрицы переходов, pairwise … — no per-element state catalogue or transition matrix
- **R-UI-003** (P1, UI, частично): Минимизировать обязательные диалоги и клики; умные контекстные действия, наследование настроек и понятные значения по умолчанию — no audit of all key tasks for mandatory dialogs
- **R-UI-004** (P1, UI, частично): Меню остаётся в пределах экрана — no test of menus at viewport edges
- **R-UI-005** (P1, UI, частично): Последний контекст навигации восстанавливается — last route/page/space not restored after restart
- **R-HISTORY-002** (P0, HISTORY, частично): Все операции обратимы где возможно; опасные действия — точный предпросмотр последствий без бесконечных подтверждений — Не все операции обратимы: смена иконки/свойств/заголовка через API без отмены (только запись before в page_events)
- **R-A11Y-001** (P1, A11Y, частично): Действия мышью, клавиатурой и на телефоне одинаково доступны — no mouse/keyboard/touch input matrix; touch never exercised in tests
- **ROUTE-02** (P0, OFFLINE, частично): Автор: личный черновик → офлайн → синхронизация → перенос в отдел с предпросмотром видимости → согласование → публикация → обновление и … — Отдельные шаги покрыты, но сквозного E2E «черновик → офлайн → перенос в отдел с предпросмотром → согласование → публикация → откат» нет
- **R-QA-003** (P1, QA, не реализовано): Для каждого компонента перечислить состояния: default, hover, focus, active, disabled, loading, error, empty, overflow, mobile … — no component state catalogue
- **R-QA-004** (P0, QA, не реализовано): Для каждого действия проверить нормальный путь, отмену, повтор, двойной клик, медленную сеть, офлайн, конфликт, недостаток прав … — no actions × conditions matrix
- **R-UI-007** (P1, UI, частично): Кнопки/иконки: семантика, tooltip, hit target, доступность, реакция, идемпотентность — no per-button checks
- **R-EDITOR-002** (P0, EDITOR, частично): Редактор: ввод, IME, выделение, преобразование блоков, курсор, форматирование, drag, copy/paste из Word/Excel/браузера, Undo/Redo — IME, выделение, курсор, Undo, вставка Word/Excel/HTML покрыты тестами (editor-p0-*.spec.ts, clipboard.spec.ts). Не сделано: RTF-только буфер не разбирается; картинки Word по file:// браузер не передаёт (пользователь получает уведомление)
- **R-TABLE-002** (P1, TABLE, частично): Таблицы: вставка, resize, wrap, merge, выделение диапазона, выравнивание, большие данные — Большие таблицы не проверялись (нет виртуализации/теста); есть только E2E вставки
- **R-QA-005** (P0, QA, частично): Отказы: отключение сети, рестарт сервера, перезапуск вкладки, таймаут, конфликт, частичный сбой хранилища — timeouts and partial storage failure not covered
- **R-QA-006** (P0, QA, частично): docs/TEST_MATRIX.md с ID каждого компонента/действия и ссылкой на тест; нет «нет теста» для критичного пути — not organised by component/action id; several critical paths still listed as gaps
- **R-QA-007** (P1, QA, частично): Браузерная матрица 320/375/768/1024/1440/1920px, zoom 200%, мышь/клавиатура/сенсор; WebKit, Chromium, Firefox — only Chromium is installed (playwright.config.ts, DECISIONS D-18); touch input not exercised
- **R-BACKUP-001** (P0, BACKUP, частично): RPO ≤5 минут и RTO ≤2 часа для катастрофического отказа — Confirmed at test scale only; production-volume drill pending
- **R-OPS-003** (P0, OPS, частично): Инфраструктура эксплуатации: health checks, метрики, логи, трассировки, алерты, backup/restore, миграции, CI/CD, секреты, runbooks — No CD/deploy pipeline; secrets only via env/EnvironmentFile (no secrets manager)
- **R-PROCESS-013** (P1, PROCESS, частично): Документация: REQUIREMENTS_TRACEABILITY, ARCHITECTURE, DECISIONS, TEST_MATRIX, UX_ACCEPTANCE, SECURITY, OPERATIONS, BACKUP_RESTORE … — RELEASE_READINESS.md not yet present at re-assessment (written by the lead)
- **R-BACKUP-002** (P0, BACKUP, частично): Запрет: выпускать релиз без проверки реального восстановления — No formal release gate requiring a production restore protocol
- **R-UI-011** (P0, UI, частично): Система сохраняет работу, объясняет состояние и позволяет исправить ошибку — cancel/status not verified for every operation
- **R-ADMIN-001** (P1, ADMIN, частично): Администратор управляет подразделениями и пространствами, а не сотнями разрозненных ACL — Departments managed in UI, spaces are not: no web UI to create spaces or to add groups/users to a space (SpacePage AccessTab is read-only; POST /api/v1/spaces and PUT /grants resourceType=space only via API).
- **R-PROCESS-018** (P0, PROCESS, частично): Продукт завершён только после доказанных проверок каждого критичного сценария — many critical scenarios lack passing tests
- **R-COLLAB-005** (P1, COLLAB, частично): Совместная работа, комментарии, упоминания, согласование и публикация, история и восстановление — Функции есть; согласование/публикация и упоминания покрыты только интеграционными тестами, не E2E
- **R-ACL-009** (P1, ACL, частично): Роль «Редактор»: структурирует, актуализирует, управляет публикацией пространства — No distinct "Editor" role separate from Author: both are level edit, publish distinguished only via per-grant canPublish flag.
- **R-ACL-010** (P1, ACL, частично): Роль «Владелец пространства»: участники, шаблоны, структура — Members management for space owners has no UI: no web UI to create spaces or to add groups/users to a space (SpacePage AccessTab is read-only; POST /api/v1/spaces and PUT /grants resourceType=space only via API).
- **R-TREE-005** (P0, TREE, частично): Иерархия Organization → Workspace → Space → Page с неограниченной вложенностью и API-лимитом глубины 15, смена уровня без потери ссылок — Лимит 15 уровней с понятной ошибкой реализован и тестируется; отдельной сущности Workspace нет (организация = рабочее пространство)
- **R-PAGE-001** (P0, PAGE, частично): Страница: неизменный UUID, название, slug, обложка, иконка, блоки, статус, владелец, автор, время, теги, версия, права, публикация … — Нет slug и тегов; остальное есть
- **R-PAGE-002** (P1, PAGE, частично): Типы связей: родитель–дочерняя, ссылка, обратная ссылка, упоминание, вложение, якорь блока, связанная страница — Нет типа «связанная страница»; page_links не различает ссылку и упоминание (kind всегда link)
- **R-TREE-006** (P1, TREE, частично): Левое дерево пространств и разделов: поиск по дереву, раскрытие, DnD, избранное, недавние — Нет поиска по дереву и «Недавних» в боковой панели (недавние только в Ctrl+K)
- **R-UI-012** (P1, UI, частично): Центральная зона главной: поиск, закреплённые, последние изменения, популярные и назначенные к актуализации — no "popular" block
- **R-UI-013** (P1, UI, частично): Верхняя панель: глобальный поиск, «Создать», уведомления, профиль, переключатель пространства — no top bar; no explicit space switcher
- **R-UI-014** (P1, UI, частично): Правая контекстная панель без сужения контента: оглавление, свойства, комментарии, история, связанные — panel shrinks the main column; no TOC/related tabs in panel
- **R-UI-015** (P1, UI, частично): Сохранение раскрытых папок, ширины панелей и последнего пространства между сессиями — last space not persisted; no server mirroring; untested
- **R-PAGE-004** (P1, PAGE, частично): Экран страницы: заголовок, крошки, автор/обновление, статус, метки, действия Поделиться/Копировать/Экспорт/История/… — Нет меток (тегов) на экране страницы
- **R-UI-016** (P1, UI, частично): Состояния: пустая страница, нет доступа, нет сети, импортируется, нет результатов — с ясным действием — states not tested; "no results"/"importing" CTA not verified
- **R-UI-018** (P1, UI, частично): Малые экраны: дерево в выдвижной панели, клавиатурные действия, горизонтальная прокрутка таблиц, одинаковая семантика функций — mobile E2E not at 375px; only overflow checked at 375 in visual spec
- **R-EDITOR-010** (P1, EDITOR, частично): Ссылки, внутристраничные якоря, ссылки на страницы, упоминания сотрудников, теги — Тегов в редакторе нет
- **R-EDITOR-011** (P1, EDITOR, частично): Клавиатурные сочетания, отмена/повтор, множественное выделение, доступное контекстное меню — Нет множественного выделения блоков; тестов клавиатурного управления нет
- **R-MEDIA-003** (P1, MEDIA, частично): Изображения: подпись, alt, размер, выравнивание, увеличение, замена; галерея — Отдельного блока «галерея» нет (только колонки/листание во viewer)
- **R-FILES-001** (P1, FILES, частично): Вложения как безопасные ссылки с названием и размером; ссылка-превью; встроенный документ по постоянной ссылке без дублирования — Ссылка-превью без метаданных (OG); встраивания документа по постоянной ссылке нет
- **R-EDITOR-020** (P1, EDITOR, частично): Перемещение, дублирование, преобразование типа, копирование блока, сворачивание секций — Нет сворачивания секций по заголовкам; «копирование блока» только как Markdown/ссылка
- **R-CLIPBOARD-007** (P1, CLIPBOARD, не реализовано): Копирование изображения — оригинал или URL по правам; отказ не выглядит как успешная операция — Команды «копировать изображение» нет
- **R-IMPORT-004** (P1, IMPORT, частично): DnD одного/нескольких файлов, диалог, предпросмотр, целевой раздел, режим новая/дочерняя/обновить с версией — UI always uses mode "new"; update-with-version not exposed
- **R-IMPORT-005** (P1, IMPORT, частично): Показ заголовков, количества блоков/таблиц/изображений, предупреждений; отмена до публикации — UI not e2e-tested
- **R-EXPORT-004** (P1, EXPORT, частично): Экспорт DOCX одной страницы, ветки и набора; отдельные файлы или общий документ с оглавлением — No "separate files" mode for a set; automatic TOC for merged document not verified
- **R-EXPORT-005** (P1, EXPORT, частично): DOCX: стили Heading 1–6, текст, списки, таблицы, hyperlinks, медиа, подписи, код моноширинным, авторство и дата версии — Styles not asserted in tests; version date not written
- **R-EXPORT-007** (P1, EXPORT, частично): Mermaid и нестандартные блоки — изображение/текст и запись о конвертации; обязательный отчёт при потере семантики — Mermaid exported as source text, not image
- **R-EXPORT-009** (P1, EXPORT, частично): Одна страница без вложений — прямой .md; с вложениями — ZIP или «MD со ссылками на сервер» с предупреждением — No "MD with links to server" mode with warning
- **R-EXPORT-016** (P1, EXPORT, частично): Матрица: код — язык и содержимое сохраняются в DOCX и MD — Code language in DOCX not preserved/verified
- **R-OCR-002** (P1, OCR, частично): Действия на изображении: распознать, скопировать распознанное, вставить в документ, найти по тексту, повторить — Нет «вставить в документ»
- **R-OCR-003** (P1, OCR, частично): Источники OCR: системный буфер, DnD, медиа в DOCX, PNG/JPEG/WebP, скриншоты — Изображения из DOCX-импорта OCR не проходят (importer.ts не создаёт ocr job)
- **R-OCR-004** (P1, OCR, частично): Языки: русский, английский, смешанный, цифры; проверка инженерных обозначений, таблиц, кода — Тест — 3 строки RU/EN; таблицы/код/инженерные обозначения не проверяются
- **R-OCR-005** (P1, OCR, частично): Результат: текст, уверенность, координаты; подсветка на картинке; ручная правка с фиксацией — Подсветки на изображении нет; confidence показывается только при низком качестве
- **R-SEARCH-003** (P0, SEARCH, частично): Глобальный поиск по названиям, содержимому, заголовкам, тегам, комментариям (по праву), подписям, файлам, OCR — Комментарии и DOCX/TXT индексируются; текст PDF не извлекается (PDF-парсер не установлен), тегов нет
- **R-PAGE-006** (P1, PAGE, частично): Оглавление, breadcrumbs, обратные ссылки, «связанные материалы», ссылки на блоки — Нет «связанных материалов»
- **R-COMMENTS-001** (P1, COMMENTS, частично): Комментарии к выделению и блоку, ветки, @mention, разрешить/переоткрыть, привязка к версии и ID блока — revision_number = latest saved revision (may lag live content by up to the auto-revision interval).
- **R-COLLAB-009** (P0, COLLAB, частично): Интеграционные тесты конфликтов при смене схемы, копировании блока, отключённой сети — Нет тестов конфликтов при смене схемы содержимого (миграции content_schema_version не реализованы)
- **R-SECURITY-002** (P0, SECURITY, частично): TLS, шифрование на хранении, секреты, CSRF/XSS/SSRF, rate limit, CSP, антивирус и проверка типа вложений, path traversal, sanitize … — No encryption at rest inside the application (left to disk/DB/S3), ClamAV not verified with a real daemon, no independent OWASP/ASVS test run; TLS is terminated by deploy/nginx.conf (not exercised by tests).
- **R-PROCESS-022** (P1, PROCESS, не реализовано): Внешние зависимости, особенно платные, лицензируются и фиксируются до разработки — no licence register
- **R-BACKUP-003** (P0, BACKUP, частично): Бэкапы: ежедневные полные, инкрементальные/журналы, отдельное защищённое хранилище, шифрование, мониторинг, регулярный тест восстановления — Separate protected/offsite storage is deployment responsibility (documented, not configured)
- **R-UI-021** (P1, UI, частично): 8-пиксельная сетка, последовательные отступы, ≥3 уровня текстовой иерархии, контролируемая ширина чтения и таблиц — many hard-coded 6/10/14 px paddings off the 8px grid; no token check
- **R-UI-022** (P1, UI, частично): Анимации: меню 100–160 мс, панели 160–240 мс, перетаскивание 120–200 мс; индикатор сохранения без постоянного движения; без блокировки ввода — values in range but not tested; save spinner rotates while saving
- **R-UI-023** (P1, UI, частично): hover, focus-visible, active, disabled, pending, success, error, пустые состояния каждого элемента управления — no state catalogue; pending/success/error not uniform
- **R-A11Y-003** (P1, A11Y, частично): WCAG 2.2 AA: клавиатура, экранные дикторы, aria-label, контраст, табуляция, без цветозависимых сигналов — WCAG 2.2-specific rules and moderate/minor findings not asserted; screen readers not available
- **R-PERF-002** (P1, PERF, не реализовано): Масштаб: 10–200 сотрудников, 100 000 страниц, 500 000 вложений; рост без переработки модели — no 100k pages / 500k attachments load test
- **R-PERF-003** (P1, PERF, частично): p95: открытие страницы ≤2 с, локальный ввод ≤100 мс, поиск ≤1 с, навигация дерева ≤300 мс — page open, search, tree navigation not measured; vite build: entry index.js 140 KB gz + index.css 23 KB gz; opening a page also loads PageView chunk 1.32 MB / 413 KB gz (katex + all highlight.js languages bundled eagerly) => ~576 KB gz before first edit
- **R-PERF-004** (P1, PERF, частично): Страница до 5 000 блоков; виртуализация, без блокировки основной нити — no 5000-block test; no long-task measurement
- **R-IMPORT-015** (P1, IMPORT, частично): Импорт/экспорт больших документов (50 МБ) — фоновые задания с прогрессом, таймаутом, отменой, безопасными повторами — No 50 MB test; progress coarse (stage only)
- **R-OPS-006** (P1, OPS, частично): Логи, метрики, трассировка, health/readiness, алерты по sync, OCR, импорту, индексу, бэкапам; correlation IDs — No tracing; no OCR-latency or import-failure-rate metric (only kb_jobs_total{type,status}); alerts not fired in a drill
- **R-OPS-008** (P1, OPS, частично): Docker Compose локально; production в корпоративной инфраструктуре с HTTPS, секретами, мониторингом, бэкапом, CI/CD; без обязательных SaaS — Image/compose never built or run here (no Docker daemon); no CD
- **R-PAGE-007** (P1, PAGE, частично): Сущности: User, Group, Membership, Workspace, Space, Page, PageRevision, DocumentBlock, Attachment, OCRJob, OCRResult, Comment … — Нет отдельных Workspace и DocumentBlock (блоки внутри CRDT); Import/Export/OCRJob — общая таблица jobs
- **R-PAGE-008** (P1, PAGE, частично): Поля Page: id, spaceId, parentId?, title, slug, icon?, contentSchemaVersion, status, createdBy, updatedBy, createdAt, updatedAt … — Нет slug; content_schema_version есть, но не используется
- **R-PAGE-009** (P1, PAGE, частично): API: GET/POST /api/v1/pages, GET/PATCH/DELETE /api/v1/pages/{id} — Нет GET /api/v1/pages (список); OpenAPI-спецификации нет
- **R-PAGE-010** (P1, PAGE, частично): API: POST /pages/{id}/publish, /restore, /duplicate, /move — Эндпоинты есть, OpenAPI нет
- **R-HISTORY-008** (P1, HISTORY, частично): API: GET /pages/{id}/revisions, POST /revisions/{revisionId}/restore — Восстановление — POST /pages/{id}/revisions/{rid}/restore вместо /revisions/{revisionId}/restore; OpenAPI нет
- **R-SEARCH-009** (P1, SEARCH, частично): API: GET /api/v1/search?q=&space=&type=&status= — Параметр spaceId вместо space, параметра type нет; OpenAPI нет
- **R-MEDIA-005** (P1, MEDIA, частично): API: POST /attachments, POST /ocr/jobs — Пути /ocr/jobs нет; OpenAPI-описания нет
- **R-ACL-016** (P1, ACL, частично): API: GET/PATCH /permissions/{resourceType}/{id}; GET /audit с ограничением доступа — No GET/PATCH /permissions/{resourceType}/{id} endpoint shape.
- **R-OPS-009** (P1, OPS, частично): Каждый эндпоинт: схемы, коды 400/401/403/404/409/413/422/429/500, права, лимиты, пагинация, идемпотентность, версия, аудит, примеры — No per-endpoint contract tests; OpenAPI lacks complete schemas/examples
- **SC-06** (P0, CLIPBOARD, частично): Вставка из Word и веб-страницы с заголовками, таблицами, ссылками, картинками; предпросмотр без мусорной HTML-разметки — tests/e2e/clipboard.spec.ts. Предпросмотра вставки нет; Картинки из Word (file://, VML) браузер не передаёт — пользователь получает уведомление с числом непереданных изображений; RTF не разбирается
- **SC-18** (P1, IMPORT, частично): Массовый импорт 100 документов — список успешных/ошибочных, повтор только неудачных — No "retry only failed" action; no 100-document test
- **SC-21** (P1, OCR, частично): Русский скриншот с таблицей, английским и артикулом → OCR → выбор фрагмента → копирование → вставка текстом — Скриншот с таблицей и выбор фрагмента не проверяются (название теста упоминает SC-21..24, но покрывает только распознавание)
- **SC-22** (P0, OCR, частично): Видны оригинал, confidence, исправления, происхождение; ошибка OCR не удаляет изображение — Confidence скрыт при нормальном качестве, автор исправления не показывается
- **SC-24** (P1, OCR, частично): Поворот, низкое качество, смешанный язык, область — сервис не ломается; ошибку можно повторить — Поворот/область только через API; тестов плохих изображений нет
- **SC-34** (P1, A11Y, частично): Весь интерфейс без мыши; читаются метки кнопок и ошибок; контраст и reduced motion — keyboard pass covers switcher/help/tree only, not every screen
- **SC-36** (P1, PERF, частично): На медленной сети анимация и автосохранение не блокируют текст; видно реальное состояние — slow-network throttling not tested
- **SC-38** (P1, IMPORT, частично): Перенос 1 000 страниц с вложениями; количество объектов, связи и ACL сверены контрольными запросами — Archive migration of 1 000 pages not tested
- **SC-40** (P1, UI, частично): Статусы всех действий: пусто, загрузка, ошибка, успех, нет доступа, конфликт, восстановлено; нет кликов «в никуда» — no verification of every action result/state
- **R-QA-014** (P0, QA, частично): Критические потоки §18 проходят E2E на релизной сборке во всех браузерах; без заглушек — only Chromium is installed (playwright.config.ts, DECISIONS D-18); most §18 scenarios have no E2E
- **R-OCR-012** (P1, OCR, частично): OCR RU/EN character accuracy ≥95% на чётких скриншотах; отдельная матрица плохих изображений — CER не измеряется (только regex), матрицы плохих изображений нет
- **R-PERF-005** (P1, PERF, не реализовано): SLO §15 подтверждены нагрузкой; восстановление и отзыв прав — отдельные протоколы — SLO not confirmed by load; no protocols
- **R-SECURITY-004** (P0, SECURITY, не реализовано): Lighthouse/Web Vitals, accessibility audit, OWASP ASVS, SAST/DAST, dependency scan без критических находок — No Lighthouse/Web Vitals, accessibility audit, ASVS review, SAST/DAST or dependency scanning configured.
- **R-OPS-010** (P1, OPS, частично): Артефакт: репозиторий с кодом, схемами, миграциями, Docker-файлами и инструкцией запуска без закрытых секретов — No README.md with clean-clone quick start in repo root
- **R-OPS-011** (P1, OPS, частично): Артефакт: OpenAPI, схема БД, модель документа и конвертации, контракты websocket/ACL — No standalone DB schema document / WS protocol contract document
- **R-QA-015** (P1, QA, частично): Артефакт: unit, integration, contract, E2E, load, security, accessibility тесты; fixtures DOCX/MD/изображений; отчёты прогонов — no contract, load or accessibility tests; no archived run reports
- **R-PROCESS-033** (P1, PROCESS, не реализовано): Акт приёмки с трассировкой «пункт ТЗ → тест → результат → доказательство» — no acceptance act
- **R-EDITOR-025** (P1, EDITOR, частично): Не писать rich-text редактор с нуля; взять зрелую платформу и проверить ограничения до фиксации архитектуры — В docs/DECISIONS.md нет решения о выборе редактора и проверке его ограничений
- **R-UI-026** (P0, UI, частично): Не создавать UI-элементы без работающих действий, ошибок, состояний и автотестов — most UI (admin, ShareDialog, trash, templates, import UI, export, OCR dialog) has no browser test
- **R-EDITOR-026** (P1, EDITOR, не реализовано): Для сложного блока описать представление во внутренней модели, DOCX, MD, clipboard и индексе — Нет документа с таблицей представлений сложных блоков (модель/DOCX/MD/clipboard/индекс)
- **R-UI-027** (P0, UI, частично): Неподдерживаемая операция обязана иметь честное объяснение; молчаливая потеря данных запрещена — not systematically verified for all operations
- **R-IMPORT-021** (P0, IMPORT, частично): Единый конвейер: DOCX, MD, CSV, XLSX, буфер (text/html, text/plain, text/markdown, изображения, файлы); пакетно … — Clipboard paste uses a separate client-side pipeline
- **R-IMPORT-022** (P1, IMPORT, частично): Точки входа: кнопка «Импорт», /import, DnD на страницу/раздел, Ctrl/Cmd+V, меню таблицы «Импортировать данные», «Вставить как…» — No DnD onto page/tree section, no table menu "Импортировать данные", no "Вставить как…"
- **R-IMPORT-023** (P1, IMPORT, частично): Предпросмотр до подтверждения: цель, количество страниц/строк/изображений, типы столбцов, предупреждения … — Implemented; no browser (e2e) test
- **R-CLIPBOARD-016** (P1, CLIPBOARD, частично): Вставка Markdown: «распознать разметку» / «вставить исходный текст»; HTML сохраняет заголовки, списки, ссылки, таблицы, картинки — Выбора режима нет (только эвристика/горячая клавиша); картинки из HTML не загружаются
- **R-COLLECTION-002** (P1, COLLECTION, частично): Мастер сопоставления: текст, число, дата, checkbox, select, URL, email, пользователь, файл; подсветка несовместимых … — Типы «пользователь» и «файл» в мастере отсутствуют
- **R-COLLECTION-003** (P0, COLLECTION, частично): Режимы: новая таблица, добавить строки, обновить по ключу (dry-run + подтверждение), заменить диапазон; нет скрытых дублей при повторе — tests/integration/import-export.test.ts:'CSV in Windows-1251… (AT-48, UX13-17, AT-50, R-COLLECTION-003)'. Нет «заменить диапазон»
- **R-CLIPBOARD-017** (P1, CLIPBOARD, частично): Вставка диапазона Excel/Sheets создаёт корректную сетку; табличный буфер TSV + HTML; экспорт выделения в CSV — Экспорта выделения в CSV нет; HTML Excel 20×10 не проверялся
- **R-TABLE-004** (P1, TABLE, частично): Простая таблица: строки/столбцы, перемещение, ширина, выравнивание, диапазон, копирование, закрепление заголовка, клавиатура — Нет перемещения строк/столбцов и закрепления заголовка
- **R-COLLECTION-004** (P1, COLLECTION, частично): Коллекция: типы полей, строки-страницы, фильтры AND/OR, мультисортировка, группировка, колонки, массовая правка, поиск, итоги … — Веб-интерфейса коллекции нет (нет страницы/таблицы реестра с фильтрами, сортировкой, массовой правкой, экспортом)
- **R-COLLECTION-005** (P1, COLLECTION, частично): Виртуализация больших таблиц, без потери фокуса при прокрутке, клавиатурная навигация, сохранение вида, одновременные правки — Виртуализации, клавиатуры, сохранения вида в UI нет; 10 000 строк не проверялись
- **R-PAGE-011** (P1, PAGE, частично): Иконка страницы и записи: emoji/библиотека/своя; поиск, замена, удаление; одинаково в дереве, крошках и поиске — Только emoji; своей/библиотечной (SVG/загруженной) иконки нет
- **R-FILES-002** (P1, FILES, частично): Вложения: DnD, Ctrl/Cmd+V, выбор, пакетно, прогресс каждого, пауза/повтор, предпросмотр, скачать, ссылка, переименовать, удалить по правам — Нет паузы, переименования и удаления вложения в UI (API PATCH/DELETE есть), копирования ссылки на файл
- **R-MEDIA-007** (P0, MEDIA, частично): Изображения inline/блоком, размер, выравнивание, подпись, alt, lightbox, оригинал; thumbnail не заменяет оригинал; не теряются при переносе — tests/integration/content.test.ts:'uploads an image, stores the original byte-exact with checksum…'. Нет inline-изображений в строке; копия блока на другую страницу ссылается на вложение исходной страницы (права)
- **R-UI-029** (P1, UI, частично): Микроанимации 120–220 мс для hover, меню, перестановки, дерева; не анимировать ввод; reduced-motion — no measurement/test
- **R-PERF-006** (P1, PERF, частично): Ввод p95 <50 мс; локальная правка <100 мс; удалённая правка p95 <500 мс; восстановление после обрыва <10 с — input p95 not met at 4x; remote edit p95 1.4 s at 100+20 (143 ms at 20+5); reconnect not measured
- **R-BACKUP-006** (P0, BACKUP, частично): Бэкапы БД, объектов, метаданных; шифрование, offsite, ежемесячный тест восстановления; RPO ≤5 мин, RTO ≤2 ч — Offsite copy and monthly restore test are operational procedures not yet run; RPO/RTO only at test scale
- **AT-51** (P1, CLIPBOARD, частично): Вставка диапазона 20×10 из Excel сохраняет геометрию и значения — tests/e2e/collab.spec.ts:'paste: spreadsheet range becomes a table; Markdown becomes formatted blocks' — только TSV 3×3; 20×10 из Excel не проверялся
- **AT-52** (P1, COLLECTION, частично): Фильтры, сортировка, группы, закрепление колонок, итоги на 10 000 строк — Закрепления колонок и UI нет; производительность на 10 000 строк не измерена
- **R-PAGE-013** (P1, PAGE, частично): «Новая статья» в дереве, шапке пространства и Ctrl/Cmd+N; открытие без модального мастера — Ctrl/Cmd+N не реализован
- **R-PAGE-014** (P1, PAGE, частично): Фокус в названии; Enter — первый блок; пустая статья предлагает «Написать», «Импортировать», «Шаблон», «Таблица» — Пустая статья не предлагает «Написать/Импортировать/Шаблон/Таблица» (только placeholder)
- **R-PAGE-015** (P1, PAGE, частично): Название, иконка, обложка, статус, местоположение меняются без перезагрузки; иконка emoji/SVG/загруженная с fallback и правами — Название/иконка/статус/место без перезагрузки; обложки нет, иконки только emoji
- **R-A11Y-004** (P1, A11Y, частично): В каждом состоянии клавиатурная навигация, видимый фокус, корректный undo/redo, без потери выделения при открытии меню — undo/redo and focus visibility per state not tested
- **R-EDITOR-029** (P1, EDITOR, частично): Slash-меню: фильтр по названию и синонимам RU/EN, стрелки/Enter/Esc, популярные первыми, не мешает вводу путей и URL — «/usr/bin» в начале строки открывает меню; нет «популярные/недавние первыми»
- **R-EDITOR-030** (P1, EDITOR, частично): Hover-плюс и drag-handle (и клавиатурно); DnD с направляющей, вложением, автопрокруткой; undo восстанавливает положение — Нет теста DnD+Undo; вложение «внутрь» и подсветка контейнера отсутствуют
- **R-LAYOUT-002** (P1, LAYOUT, частично): Вложенные колонки с responsive-перестройкой; ширина обычная/широкая, шрифт и размер — настройки без порчи семантики — page-level font/size settings absent; untested
- **R-CLIPBOARD-018** (P0, CLIPBOARD, частично): Копирование text/plain + text/html, Markdown по команде; внутренний формат с ID/типами без утечки прав; вставка: внутренний → HTML → plain — Вложение, скопированное на другую страницу, проверяется по правам исходной страницы (читатели новой получат 404)
- **R-CLIPBOARD-019** (P1, CLIPBOARD, частично): Paste: HTML Word/Google Docs/браузер, MD-текст, изображения; выбор «с форматированием/только текст/как Markdown» при неоднозначности — Нет выбора «с форматированием/только текст/как Markdown» при неоднозначности
- **R-IMPORT-036** (P1, IMPORT, частично): CSV/XLSX: лист, заголовки, разделитель, кодировка, типы, предпросмотр 100 строк, сопоставление, диагностика … — No mapping of file columns onto existing collection fields
- **R-IMPORT-037** (P1, IMPORT, частично): Отчёт по каждому файлу (готово/предупреждение/ошибка), исходник доступен автору, откат импортированной пачки — No rollback of an imported batch
- **R-COLLECTION-007** (P1, COLLECTION, частично): Коллекция: записи с постоянным ID, типы (текст, число, дата, выбор, статус, человек, ссылка, файл, checkbox, relation) … — Веб-интерфейса коллекции нет (нет страницы/таблицы реестра с фильтрами, сортировкой, массовой правкой, экспортом)
- **R-COLLECTION-008** (P1, COLLECTION, частично): Виртуализация, sticky headers, навигация стрелками/Tab, массовая правка, undo, экспорт CSV/XLSX — Нет UI (виртуализация, sticky, клавиатура, undo); кнопки экспорта нет
- **R-OFFLINE-004** (P1, OFFLINE, частично): Офлайн для выбранных страниц/пространств; индикатор несинхронизированных правок; квота устройства; права офлайн недоступны — Нет выбора страниц/пространств для офлайна, нет квоты устройства, нет общего индикатора несинхронизированных страниц (pagesWithPending в idb.ts не используется)
- **R-PERF-007** (P1, PERF, не реализовано): Условия замеров: ноутбук 8 GB, Chromium, RTT 80 мс, 20 Mbps, low-end mobile; p50/p95/p99; 10/100 редакторов; 1/10/100 тыс. слов и строк — no measurement conditions/report (8GB laptop, RTT 80ms, low-end mobile, 10/100 editors)
- **R-PERF-008** (P1, PERF, частично): Ввод: p95 ≤50 мс, p99 ≤100 мс для статьи 10 тыс. слов — budget NOT met in this environment: 4x p95 504–827 ms, p99 824–1169 ms; 1x p95 64 ms, p99 157 ms (overloaded 4-vCPU container). Budget assertion runs only with KB_PERF_ENFORCE=1 (open defect PERF-D1)
- **R-PERF-009** (P1, PERF, не реализовано): Переход между кэшированными статьями p95 ≤300 мс; первая загрузка p95 ≤2 с — cached navigation and first-load p95 not measured
- **R-PERF-010** (P1, PERF, частично): Синхронизация между клиентами p95 ≤500 мс при RTT 80 мс; durable-подтверждение p95 ≤2 с — client-to-client sync p95 at RTT 80ms not measured
- **R-PERF-011** (P1, PERF, не реализовано): Скролл и DnD 60 FPS; INP p75 ≤200 мс; без long tasks >200 мс при наборе — no FPS/INP/long-task measurement
- **R-PERF-012** (P1, PERF, частично): Импорт, OCR, превью, индексация вне UI-потока с progress и cancel; нарушение SLO — дефект, не маскировка skeleton — client Markdown conversion runs on main thread (lazy chunk); no main-thread measurement
- **R-UI-030** (P1, UI, частично): Design tokens: типографика, сетка 4/8 px, радиусы, отступы, цвета, бордеры, тени, состояния, z-index — tokens not documented outside CSS comments
- **R-LAYOUT-003** (P1, LAYOUT, частично): Читаемая ширина, вертикальный ритм, адаптивные изображения, код с горизонтальным скроллом, таблицы с overflow … — sample page has no code block, wide table or image
- **R-UI-031** (P1, UI, частично): Макеты 320/375/768/1024/1440/1920, zoom 200%, длинные русские слова, RTL не ломает layout; тёмная/светлая; WCAG 2.2 AA — long Russian words and RTL not covered
- **R-UI-032** (P1, UI, частично): Анимации меню/подсказок 120–220 мс, дерева/панелей 160–260 мс; без bounce; без смещения курсора и layout shift — CLS during animations not measured
- **R-UI-033** (P1, UI, частично): Для каждого экрана состояния loading/empty/error/offline/conflict/permission-denied и визуальная консистентность — conflict/permission-denied not on every screen; not verified
- **R-ADMIN-003** (P1, ADMIN, частично): Админ управляет пользователями, пространствами, политиками хранения, квотами, журналом, импортами, бэкапами — Spaces and imports not administrable from admin UI.
- **R-BACKUP-007** (P0, BACKUP, частично): 99.9% доступности, RPO ≤5 мин, RTO ≤60 мин; подтверждено нагрузкой и restore drill — RTO ≤60 min not proven for production volume; no load test
- **R-BACKUP-008** (P0, BACKUP, частично): Снимки БД, WAL/PITR, versioned object storage, шифрование, проверка восстановления, целостность ссылок, защита последней копии — Versioned object storage not configured by the repo
- **R-QA-018** (P0, QA, частично): Contract tests схемы/миграций; property-based undo/redo, paste, CRDT; fuzz HTML/DOCX/MD/ZIP; security XSS/CSRF/SSRF/traversal/ACL — no migration contract tests, undo/redo or paste property tests, DOCX/HTML fuzz, SSRF/XSS-paste tests (CI exists now)
- **R-QA-019** (P0, QA, частично): Playwright E2E Chromium/Firefox/WebKit desktop/mobile с реальным буфером и DnD — only Chromium is installed (playwright.config.ts, DECISIONS D-18); no real clipboard, no DnD
- **R-QA-020** (P1, QA, частично): Visual regression на всех ширинах и темах с порогами и ручной проверкой — baselines not at all widths and themes
- **R-QA-021** (P0, QA, частично): Fault injection: сеть 1/30/300 с, рестарт WS и БД, двойная вкладка, конфликт удаления/правки, заполнение локального хранилища, диск сервера — no 1/30/300 s outage profile, no local-storage-full, no server-disk-full
- **R-OPS-014** (P1, OPS, частично): Метрики: client errors, input latency, reconnect, unsynced queue age, failed imports, OCR latency, backup age, restore verification … — Missing: WebSocket reconnect count, failed-import rate as own metric, OCR latency
- **AT-62** (P1, PAGE, частично): Иконка, обложка, перемещение статьи без потери фокуса и перезагрузки — Обложки нет
- **AT-65** (P1, EDITOR, частично): DnD вложенного блока, затем Undo — Теста нет; перетаскивание внутрь контейнеров не поддерживается
- **AT-67** (P1, CLIPBOARD, частично): Вставка таблицы Word со списками и картинками; структура и ссылки — Таблицы и списки сохраняются; Картинки из Word (file://, VML) браузер не передаёт — пользователь получает уведомление с числом непереданных изображений; RTF не разбирается
- **AT-68** (P1, MEDIA, частично): Вставка изображения из clipboard: alt, превью, файл — alt при вставке не заполняется
- **AT-71** (P1, CLIPBOARD, частично): Вставка диапазона Excel в простую таблицу и в коллекцию по выбору — Выбора «в коллекцию» нет
- **AT-80** (P1, UI, частично): Переключение светлой/тёмной темы без скачков и нечитаемых элементов — dark theme not axe-audited
- **AT-83** (P1, LAYOUT, частично): Длинная таблица и код не вызывают overflow всей страницы — VS sample has only a 3-column table, no long code; no dedicated test
- **AT-84** (P1, PERF, частично): Статья 10 тыс. слов соответствует SLO ввода и переключения — typing SLO not met (see R-PERF-008); page switching time not measured
- **AT-85** (P1, PERF, не реализовано): 10 одновременных авторов соответствуют SLO синхронизации — no 10-author sync latency test
- **AT-89** (P1, QA, частично): Visual regression всех ключевых экранов и состояний — only 2 of the key screens have baselines
- **R-TREE-007** (P1, TREE, частично): Левая панель: поиск, избранное, недавние, пространства и дерево, кнопка «Новая страница» — Нет «Недавних» в левой панели
- **R-IMPORT-038** (P1, IMPORT, частично): В новую страницу сразу можно вставить большой текст, DOCX, MD, скриншот или таблицу — Screenshot (image-only clipboard) paste and DOCX file paste not tested
- **R-CLIPBOARD-020** (P0, CLIPBOARD, частично): Вставка HTML/RTF/plain из Word, Google Docs, браузера, почты сохраняет H1–H6, абзацы, списки, таблицы, ссылки, изображения, подписи … — tests/e2e/clipboard.spec.ts. Картинки из Word (file://, VML) браузер не передаёт — пользователь получает уведомление с числом непереданных изображений; RTF не разбирается
- **R-CLIPBOARD-021** (P1, CLIPBOARD, частично): Без диалога при обычной вставке; при неоднозначности ненавязчиво «Вставить как текст / как таблицу / отменить» — Ненавязчивого «как текст / как таблицу / отменить» нет
- **R-IMPORT-039** (P1, IMPORT, частично): DOCX/MD через DnD, кнопку, вставку; пакетный импорт с предпросмотром дерева и отчётом несовместимостей — UI not e2e-tested
- **R-A11Y-006** (P1, A11Y, частично): Навигация только клавиатурой в редакторе — no keyboard-only editor pass
- **R-LAYOUT-004** (P1, LAYOUT, частично): Один столбец чтения комфортной ширины, опциональная широкая таблица — ≈90 chars per line at 16px Inter, above the usual 60–80; not measured
- **R-UI-037** (P1, UI, частично): Типографические токены: 6 уровней заголовков, текст, подписи, код, цитаты; вертикальный ритм — h4–h6 visually identical; vertical rhythm not tokenised
- **R-LAYOUT-005** (P1, LAYOUT, частично): Таблицы не обрезают текст молча; длинные URL переносятся; изображения масштабируются предсказуемо с подписями — untested
- **R-UI-038** (P1, UI, частично): Светлая/тёмная тема без скачков размеров; адаптивность от мобильного до 4K; фиксированные панели не закрывают текст — no 4K; theme-switch size stability not measured
- **R-QA-022** (P1, QA, частично): Скриншотные эталоны для всех ключевых состояний; статья выглядит законченной в чтении и редактировании — baselines only for 2 states; article reading/editing not baselined
- **R-UI-039** (P1, UI, частично): Функциональные анимации: дерево, меню, drag-preview, создание блока, загрузка, панель, подтверждение; 120–220 мс — untested
- **R-UI-040** (P1, UI, частично): reduced-motion; skeleton без мигания; спокойные ошибки; нет внезапных смещений layout — home screen CLS ≈ 0.03 (skeleton/list height mismatch, PERF-D3)
- **R-COLLAB-024** (P0, COLLAB, частично): Параллельные изменения на одном блоке, таблице, вложении, при перемещении страницы; предсказуемые правила конфликтов удаления и прав — Блок, таблица, перемещение страницы и удаление/правка покрыты; одновременная загрузка новой версии одного вложения двумя пользователями не тестируется
- **R-PERF-014** (P1, PERF, не реализовано): p50/p95/p99 на реальных устройствах: 1/100/1000 блоков, 20 таблиц, 100 изображений, несколько редакторов … — no device/throttling report
- **R-PERF-015** (P1, PERF, частично): Ввод p95 ≤50 мс; кэшированная статья p95 ≤300 мс; синхронизация p95 ≤500 мс; нет long tasks >100 мс при наборе — budgets not met in this environment (PERF-D1); cached open not measured
- **R-PERF-016** (P1, PERF, частично): Виртуализация больших таблиц с клавиатурой и копированием; конвертации/OCR в фоне — tables not virtualised
- **R-OPS-015** (P1, OPS, частично): Мониторинг ошибок синхронизации, очередей импорта, времени подтверждения, конфликтов, потерянных вложений, восстановления — No conflict metric; no dedicated "lost attachment" alert besides integrity errors
- **UX13-02** (P0, CLIPBOARD, частично): Вставка из Word 5 уровней заголовков, списков, таблиц, картинок; сравнение структуры — tests/e2e/clipboard.spec.ts (заголовки, вложенные списки, таблица). Картинки из Word (file://, VML) браузер не передаёт — пользователь получает уведомление с числом непереданных изображений; RTF не разбирается
- **UX13-04** (P1, TABLE, частично): Вставка 1000 строк из Excel, выбор типа таблицы, сохранение — Нет выбора типа таблицы; 1000 строк не проверялось
- **UX13-06** (P1, CLIPBOARD, частично): Несколько блоков → Word и Markdown; сравнение — Направление в Word не проверено (env)
- **UX13-11** (P1, LAYOUT, частично): Длинная статья на мобильном, все элементы читаемы — no long article on mobile
- **UX13-13** (P1, UI, частично): Переключение темы без смещения контента — no CLS test on theme switch
- **UX13-16** (P1, EXPORT, частично): Экспорт DOCX/MD и обратный импорт с автоматическим отчётом расхождений — No automatic user-facing discrepancy report
- **UX13-19** (P1, PERF, не реализовано): Импорт 100 изображений без зависания ввода — no 100-image import responsiveness test
- **UX13-20** (P1, QA, частично): Визуальная регрессия ключевых экранов на 3 ширинах и 2 темах — no baselines at 3 widths × 2 themes
- **R-TREE-010** (P1, TREE, частично): Строка узла: отдельные зоны стрелки, иконки, названия, действий; стрелка только раскрывает, название только открывает; высота 36 px … — Зоны разделены; высота строки 32 px вместо 36, на touch 40 px вместо 44
- **R-TREE-011** (P1, TREE, частично): Ширина 280 px, настройка 240–420 px; многоточие, tooltip, фокус, полное название; глубокая вложенность — фокус ветки и breadcrumbs … — Нет «фокуса ветки» для глубокой вложенности
- **R-TREE-016** (P1, TREE, частично): Контекстное меню: подстраница, переименовать, иконка, переместить, дублировать, ссылка, избранное, права, архив/корзина … — Нет пункта «Права/Поделиться» в контекстном меню дерева
- **R-ACL-022** (P1, ACL, частично): Уровни: просмотр, комментарии, редактирование, полный контроль; отдельно структура, экспорт, предоставление доступа — Separate structure/export/share flags are API-only; ShareDialog exposes only levels.
- **R-EDITOR-038** (P0, EDITOR, частично): H1–H3, стили, ссылки, индексы, цитаты, разделители, списки, чекбоксы, таблицы, колонки, оглавление, сноски, toggle — Сносок (footnotes) в схеме нет — Markdown-импорт сносок разворачивает их в текст
- **R-LAYOUT-006** (P1, LAYOUT, частично): Колонки: DnD с видимыми границами, на узких экранах вертикально — untested
- **R-EDITOR-042** (P1, EDITOR, частично): Панель форматирования не закрывает выделение и не перехватывает фокус; slash-меню стрелки/Enter/Esc; touch-панель без hover — Touch-варианта панели/ручки нет: ручка блока только по hover
- **R-EXPORT-020** (P1, EXPORT, частично): Режим чтения совпадает с редактором; печать, PDF, DOCX, MD имеют матрицу соответствия и отчёт ограничений — No published conformity matrix document
- **R-ACL-026** (P0, ACL, частично): ACL/группы/политики; effective permissions с инвалидируемым кешем; проверка в API, WS, поиске, экспорте, превью, скачивании — No permission cache by design (D-24): rights are computed per request in one query and acl_epoch drives WS re-checks. A cache keyed by acl_epoch would be correct only if every change (including direct DB edits and time-based expiry) bumped the epoch, and saves no queries — so the 'cache is invalidated' acceptance is not demonstrable.
- **R-UI-042** (P1, UI, частично): Состояния: loading, empty, ready, saving, saved, offline, reconnecting, conflict, denied, failed — reconnecting/conflict/failed not tested
- **E2E-095** (P1, TREE, частично): 12 уровней вложенности доступны через фокус ветки — Фокуса ветки нет; 12 уровней только отступами
- **E2E-100** (P1, PERF, частично): Виртуализация 10 000 узлов без потери клавиатурной навигации — not tested with 10 000 nodes
- **E2E-112** (P1, A11Y, частично): Подсветка контрастна в двух темах — highlight palettes c-yellow/hl-yellow, c-orange/hl-orange not exercised by the audit
- **E2E-114** (P1, EXPORT, частично): Toggle с изображением корректно экспортируется — No test for toggle containing an image
- **E2E-117** (P1, LAYOUT, частично): Колонки перестраиваются на мобильном — no test
- **R-PERF-017** (P1, PERF, частично): p95 раскрытия кэшированной ветки ≤100 мс; удалённая подгрузка с состоянием ожидания; p95 форматирования ≤50 мс — not measured
- **R-UI-043** (P1, UI, частично): Нулевые перекрытия/обрезания критичных элементов на 320/375/768/1024/1440 px при 100% и 200% — overlaps not detected; 200% only at one width
- **R-QA-025** (P1, QA, частично): Chrome, Firefox, Safari, Edge; клавиатура, touch, reduced-motion, темы; визуальные скриншоты всех состояний дерева, окна доступа, блоков — only Chromium is installed (playwright.config.ts, DECISIONS D-18); no screenshots of tree/share dialog/block states
- **R-ORG-003** (P1, ORG, частично): Каждая сущность: стабильный UUID, имя, описание, владелец, статус, аудит изменений — Groups have no owner/status fields; spaces have no explicit owner field (only grants).
- **R-ACL-036** (P0, ACL, частично): Разрешение пользователю/группе/отделу/пространству с датой окончания, часовым поясом, автором и основанием — A space as a subject («участники пространства X») is not supported — grant to the group/department that forms the space instead.
- **R-ACL-037** (P1, ACL, частично): Быстрые сроки: 1 день, 7 дней, 30 дней, дата, бессрочно — No quick presets 1/7/30 days.
- **R-ACL-042** (P1, ACL, частично): Пресеты «Только я», «Приглашённые», «Отдел», «Вся компания» с предупреждением о последствиях; «Дополнительно» скрывает редкие политики — No "Только я" and "Отдел" presets, no "Дополнительно" section.
- **R-ADMIN-005** (P1, ADMIN, частично): Создание сотрудника: имя, email, тип, отдел, руководитель, группы; предпросмотр доступных пространств — Accessible spaces are shown only after creation, not as a preview before confirming.
- **R-ACL-046** (P0, ACL, частично): Версионированный кеш прав с инвалидацией при изменении членства/ACL; не доверять клиентскому скрытию — No permission cache by design (D-24): rights are computed per request in one query and acl_epoch drives WS re-checks. A cache keyed by acl_epoch would be correct only if every change (including direct DB edits and time-based expiry) bumped the epoch, and saves no queries — so the 'cache is invalidated' acceptance is not demonstrable.
- **R-UI-046** (P1, UI, частично): Акценты: синий ссылки, зелёный успех, янтарный предупреждение, красный ошибка, сиреневый заметки; тёмная тема; WCAG AA — dark theme not audited
- **R-EDITOR-045** (P1, EDITOR, частично): Эмодзи/иконки, обложки, цвет текста/фона/блока, цитаты, toggle, колонки, подсказки; стили сохраняются при копировании/экспорте — Нет UI обложки (API pages.cover есть), подсказок (tooltip-блоков), цвета блока кроме выносок
- **R-UI-047** (P1, UI, частично): Анимации меню, дерева, DnD, панелей 120–220 мс; reduced-motion; не блокируют фокус, набор, переключение — non-blocking of focus/typing not tested
- **R-LAYOUT-008** (P1, LAYOUT, частично): Закрытие панели без скачков ширины текста; стабильная сетка — at widths < content+panel closing the panel changes text width; untested
- **R-UI-048** (P1, UI, частично): Скелетоны без бесконечных спиннеров; виртуализация длинных деревьев и списков — search/history/audit lists not virtualised; App loading spinner has no timeout
- **R-PERF-018** (P1, PERF, не реализовано): Отклик клика p95 <100 мс; раскрытие кэшированной ветки p95 <150 мс; нет заметного layout shift — click/branch-expand latency not measured
- **V15-A11** (P1, UI, частично): Длинные названия отделов и участников не перекрывают элементы — no long-name test
- **V15-A12** (P1, LAYOUT, частично): На мобильном доступы управляются без горизонтального скролла — no mobile access-management test
- **V15-A18** (P1, UI, частично): Цветные callout корректны в светлой/тёмной темах — dark variants untested
- **V15-A20** (P1, PERF, не реализовано): 1000 пользователей, 100 отделов, 500 групп, 100 000 страниц с профилированием ACL и поиска — no 1000 users/100k pages ACL+search profiling
- **R-QA-027** (P0, QA, частично): Приёмка v1.5: 100% критических сценариев, нет утечек в негативных тестах, визуальные снимки, регрессионные E2E — critical-scenario coverage not 100%
- **R-SEARCH-012** (P1, SEARCH, частично): Четыре области: глобальный Ctrl/Cmd+K, пространство, страница Ctrl/Cmd+F, таблица и свойства; область видна и меняется одним действием — Глобальный, пространство (фильтр) и страница (Ctrl+F) есть; поиска по таблицам/свойствам как области и переключения области одним действием в Ctrl+K нет
- **R-SEARCH-013** (P1, SEARCH, частично): Индекс: заголовки, текст, свойства, таблицы, вложенные DOCX/PDF, OCR; путь, фрагмент, подсветка, дата, тип; морфология RU, опечатки … — DOCX/TXT индексируются; содержимое PDF — нет (нет PDF-парсера в зависимостях)
- **R-SEARCH-016** (P1, SEARCH, частично): Быстрые результаты при вводе, клавиатура, недавние, избранное, пустые состояния, переход к абзацу, сохранение фильтров — Избранное в быстром поиске отсутствует; фильтры сохраняются только в URL
- **R-SEARCH-017** (P1, SEARCH, частично): p95 подсказки ≤300 мс, p95 полные результаты ≤800 мс при 100 тыс. страниц; права в выдаче ≤5 с, прямой доступ блокируется немедленно — Права применяются немедленно; p95 ≤300/≤800 мс на 100 тыс. страниц не измерялись (нагрузочного теста поиска нет)
- **R-PUBLISH-008** (P1, PUBLISH, частично): Публикация в компании, пространстве, отделам/людям; внешняя только по политике; предпросмотр аудитории, вложений, дочерних, индексации … — No choice of publication audience (company/departments/people), no preview of audience/attachments/children/indexing.
- **R-HISTORY-013** (P0, HISTORY, частично): Сравнение двух версий с подсветкой; восстановление статьи или блока как новая версия — Восстановление блока не создаёт новую версию сразу (только событие restored-block)
- **R-ADMIN-009** (P1, ADMIN, частично): Админ-центр: обзор, люди, отделы, группы, пространства, роли, гости, приглашения, публикации, аудит; поиск, фильтры, массовые операции … — Missing sections: overview, spaces, roles, guests/invitations dashboard, publications; no bulk operations.
- **R-ADMIN-011** (P1, ADMIN, частично): Мастер сотрудника: приглашение, роль, отделы, группы, пространства, срок, предпросмотр; отзыв/перевод пересчитывает права — No spaces step and no pre-confirmation preview in the wizard.
- **R-ADMIN-012** (P1, ADMIN, частично): Панель контроля: внешние ссылки, истекающие приглашения, открытые пространства, сиротские страницы, владельцы, массовые экспорты … — No control panel for external links, expiring invitations, open spaces, orphan pages, ownerless pages, mass exports.
- **V16-S06** (P1, PUBLISH, не реализовано): Внешняя публикация предупреждает о дочерних и вложениях, поддерживает отзыв — External publication (public links) not implemented.
- **V16-S11** (P0, HISTORY, частично): Сравнение версий текста и свойств; восстановление не стирает историю — Сравнение свойств между версиями отсутствует (ревизия хранит только заголовок и содержимое) — по свойствам только журнал updated
- **V16-S16** (P1, ADMIN, частично): Массовая смена прав: подтверждение, лог, отчёт результата — No UI; preview only echoes grants (no audience); no result report beyond count.
- **V16-S17** (P1, UI, частично): Мобильный и десктопный интерфейс без перекрытий названий, меню, фильтров — overlaps not detected
- **V16-S18** (P1, PERF, не реализовано): Нагрузочные тесты поиска, импорта, экспорта, публикации с p95/p99 и ошибками — no load tests for search/import/export/publish
- **V16-S19** (P1, QA, частично): Визуальная регрессия меню, поиска, модалок, таблиц, админки в двух темах — baselines only for sign-in and help dialog; menus, search, tables, admin, dark theme not baselined
- **R-CLIPBOARD-023** (P1, CLIPBOARD, частично): Вставка DOCX/браузера/MD интерпретирует структуру; ненавязчивый результат и «Отменить»; без модалки при однозначной операции — Нет уведомления с кнопкой «Отменить» после вставки
- **R-UI-051** (P1, UI, частично): Пустые состояния объясняют шаг; ошибки содержат действие восстановления; нет декоративных неработающих кнопок — no check that every button works
- **R-PUBLISH-010** (P1, PUBLISH, частично): Владелец, ответственная группа, дата проверки, срок следующей, статус «проверено»/«требует пересмотра»; напоминания, фильтр устаревших … — No responsible group, no reminders, no stale filter in search, not hidden for notes.
- **R-PUBLISH-011** (P1, PUBLISH, частично): Блокировка подтверждённых регламентов; обновления через черновик и согласование; опубликованная редакция неизменна — No "update via draft + approval" for locked regulations — locked page simply blocks non-owners.
- **R-PAGE-026** (P1, PAGE, частично): Обратные ссылки, проверка битых ссылок, обновление пути при перемещении, неизменные ID — Отчёта о битых ссылках нет
- **R-OPS-016** (P1, OPS, частично): Кластеризация приложений и WS-шлюзов, health checks, rolling deploy, graceful shutdown, rate limiting … — Rolling deploy not tested end-to-end; no explicit overload shedding for import/OCR beyond queue concurrency
- **R-BACKUP-010** (P0, BACKUP, частично): Проектные SLO: доступность 99,9%/мес, RPO ≤5 мин, RTO ≤2 ч для полной организации; подтверждаются испытаниями — Test scale only
- **R-BACKUP-012** (P0, BACKUP, частично): Правило 3-2-1: ≥3 копии, 2 среды, 1 вне контура; шифрование, отдельные ключи, неизменяемое хранение от ransomware — The bucket/second medium must be provisioned by infrastructure; not run here
- **R-ARCHIVE-005** (P1, ARCHIVE, частично): ZIP/тома для больших объёмов с прогрессом, возобновлением, проверкой целостности; шифрование, временная ссылка, аудит скачивания — No volumes, no resumable download, no archive encryption; archive built in memory
- **R-ADMIN-013** (P1, ADMIN, частично): Панель «Здоровье системы»: сервисы, задержки, последний бэкап, последний тест восстановления, место, неуспешные задания, архивы — No latency metrics, no free disk space, archives not summarised.
- **R-ADMIN-014** (P1, ADMIN, частично): Вкладки: Сотрудники, Отделы, Группы, Пространства, Доступы, Публикации, Аудит, Резервирование, Импорт/экспорт … — No Spaces, Access, Publications, Import/Export tabs; no bulk operations with preview/report.
- **R-ADMIN-015** (P1, ADMIN, частично): Мастер приглашения: имя/email → роль → отделы → пространства → срок (гость) → подтверждение; затем эффективные права — No spaces step in the wizard.
- **R-OPS-018** (P1, OPS, частично): Инструкции и автопроверки на контрольные вопросы: ночной инцидент, восстановимость бэкапа, переезд без поставщика … — No explicit Q&A section answering each control question
- **R-ARCHIVE-010** (P1, ARCHIVE, частично): Состав: README.md, spaces/…--page-id.md, assets/images, assets/files, databases/*.csv + schema.json, metadata/*.json, versions/ … — File names lack --page-id suffix; assets not split into images/files; versions under metadata/
- **R-ARCHIVE-014** (P1, ARCHIVE, частично): Настройки: «Скачать архив организации», «Скачать пространство», «Скачать страницу», «Восстановить из архива» — No "download space" action in settings UI
- **R-MEDIA-011** (P1, MEDIA, частично): EXIF-ориентация, HEIC, безопасный SVG, прозрачность, GIF-анимация, понятные ошибки форматов — HEIC принимается, но не конвертируется (в Chromium не отобразится); фикстур форматов нет, кроме SVG (content.test.ts:'sanitises SVG…')
- **R-MEDIA-012** (P1, MEDIA, частично): Resize ручками с сохранением пропорций, клавиатура, Undo — Нет изменения размера с клавиатуры; без теста
- **R-LAYOUT-009** (P1, LAYOUT, частично): На узких экранах изображение в контейнере; резервирование места по aspect ratio без layout shift — CLS not measured; no narrow-screen image test
- **R-FILES-008** (P1, FILES, частично): Вложение — карточка: иконка типа, название, размер, состояние, превью, скачать, заменить, переименовать, удалить, открыть; без обрезаний — Нет заменить/переименовать/удалить в карточке; имя обрезается ellipsis
- **R-FILES-010** (P1, FILES, частично): Вложения перемещаются как блоки, выравниваются, группируются в колонки; клавиатура — Выравнивания вложений нет; без тестов
- **R-A11Y-007** (P1, A11Y, частично): Панели не перекрывают текст; IME, экранные читалки, touch, zoom 200%; палитра с проверкой контраста — IME, screen readers, real touch not available
- **R-QA-029** (P0, QA, не реализовано): Для каждого действия: исходное состояние, happy path, пусто, медленная сеть, офлайн, потеря прав, конфликт, квота, неверный файл … — no per-action condition matrix
- **R-QA-030** (P1, QA, не реализовано): Реестр состояний каждого компонента: idle/hover/focus/loading/empty/success/error/offline/permission denied/conflict … — no component state registry
- **R-PERF-019** (P0, PERF, частично): Тяжёлые операции в фоне; ввод не блокируется OCR, загрузкой, экспортом — typing during upload/OCR/export not measured
- **V18-A09** (P1, LAYOUT, частично): Выравнивание изображения не ломается на телефоне — untested at 375px
- **V18-A15** (P1, PERF, частично): Медленная сеть не тормозит набор — no slow-network typing measurement
- **V18-A19** (P1, A11Y, частично): Все основные действия доступны с клавиатуры — no keyboard pass test
- **V18-A22** (P1, IMPORT, частично): Повторный импорт предлагает стратегию конфликтов — Documents: no conflict strategy on re-import (new copies created)
- **V18-A23** (P1, UI, частично): Длительная операция имеет отмену или объясняет её невозможность — export/OCR cancel or explanation not verified in UI
- **V18-A25** (P0, BACKUP, частично): Восстановление прошло тест на независимом сервере — Same PostgreSQL host, not an independent server
- **R-PERF-020** (P1, PERF, частично): Целевые задержки и надёжность v1.7 сохраняются; приоритеты: сохранность, понятность, скорость, эстетика, расширенные функции — most targets unmeasured
- **R-UI-055** (P0, UI, частично): Визуальный эталон — утверждённые светлые UX-примеры; запрещены произвольные стили по разделам; общие design tokens, контраст … — some hard-coded colours (#9cc0f5 toast, #000 embed) and inline styles (HistoryPanel fontSize 22)
- **R-TREE-018** (P1, TREE, частично): Настраиваемый sidebar: недавние, избранное, пространства команд, общие, личные; скрыть, переставить, сброс … — Можно сворачивать секции и сбросить; нет скрытия/перестановки секций и админ-предустановки отдела; хранится только в localStorage
- **R-EDITOR-050** (P1, EDITOR, частично): «+» в левом поле, ручка ⋮⋮ (перетаскивание/действия), /, вставка MD, преобразование, дублирование, перенос на другую страницу, undo/redo — Нет «перенести на другую страницу»
- **R-EDITOR-051** (P1, EDITOR, частично): Раскрывающиеся заголовки; содержание справа для длинной статьи; переход к заголовку без перекрытия шапкой; длинные заголовки — Нет UI раскрывающегося заголовка, нет оглавления справа, нет scroll-margin под шапку
- **R-PAGE-030** (P1, PAGE, не реализовано): Peek-предпросмотр в боковой панели/модальном слое при наличии места; «открыть полностью», «закрыть», Esc, back … — Peek-предпросмотра нет
- **R-COMMENTS-003** (P1, COMMENTS, частично): Комментарии к выделению, упоминания, уведомления без спама; выделение и курсор сохраняются после закрытия панели — Preservation of selection/cursor after closing the panel not verified; spam control is basic (participants only).
- **R-UI-058** (P1, UI, частично): Без hover на touch: доступные кнопки и меню, безопасные размеры касания; клавиатура не перекрывает редактор — no visualViewport handling for the on-screen keyboard
- **R-TREE-021** (P1, TREE, частично): Дочерние страницы в sidebar и в теле родителя на одной модели данных — Дочерние в теле родителя — отдельные узлы pageLink, не синхронизированы с деревом (созданная в дереве не появляется в теле)
- **R-UI-061** (P0, UI, не реализовано): Для каждой операции документировать: пусто, успех, загрузка, отмена, ошибка, нет прав, потеря сети, конфликт, назад, перезагрузка … — no per-operation state documentation (no TEST_MATRIX/UX_ACCEPTANCE)
- **R-UI-062** (P0, UI, частично): Нельзя создавать страницу «в никуда», терять черновик, закрывать диалог с критичными данными без предупреждения, прятать возврат — warning before closing a dialog with critical unsaved input is not tested
- **UX-127** (P1, PAGE, не реализовано): Открыть в предпросмотре и закрыть Esc — Peek-предпросмотра нет
- **UX-128** (P1, PAGE, не реализовано): Открыть страницу полностью из предпросмотра — Peek-предпросмотра нет
- **UX-135** (P1, EDITOR, частично): Раскрытие toggle heading — Toggle раскрывается; создать раскрывающийся заголовок из UI нельзя
- **UX-139** (P1, UI, частично): Меню у нижнего края — flip вверх — untested
- **UX-140** (P1, UI, частично): Меню у правого края — без выхода за экран — untested
- **R-EDITOR-052** (P0, EDITOR, частично): v2.0 — статус P0, применяется совместно с ранее определёнными; все команды мышью и клавиатурой, критические — touch — Touch: нет DnD/ручки блока; resize изображения без клавиатуры (только пресеты 25–100 % мышью/касанием)
- **R-EDITOR-057** (P1, EDITOR, частично): Состояния normal/hover/focus/selected/mixed-format/loading/disabled/error/success/readonly/offline/conflict/collaboration … — Нет mixed-format состояния в панели (isActive=false при смешанном)
- **R-EDITOR-059** (P1, EDITOR, частично): Палитра: 10–12 цветов текста и 10–12 подложек, «без цвета», последние; предпросмотр при hover без фиксации; цвет и фон независимы … — Нет «последних» цветов и предпросмотра при hover
- **R-EDITOR-063** (P1, EDITOR, частично): Ссылки: Ctrl/Cmd+K, вставка URL поверх выделения → «Сделать ссылкой», правка/снятие, предпросмотр и проверка URL, внутренние ссылки … — Нет предпросмотра ссылки (hover card); без тестов
- **R-EDITOR-066** (P1, EDITOR, частично): Нумерация пересчитывается при вставке/удалении/переносе/объединении; «начать с N», «продолжить»; чекбокс только по клику/Space — Нет UI «начать с N»/«продолжить»
- **R-CLIPBOARD-024** (P0, CLIPBOARD, частично): Copy/Cut/Paste между статьями сохраняет стили, вложенность, таблицы, ссылки, изображения по правам; во внешние — text/html и text/plain … — Трекеры удаляются: tests/unit/editor-p0-clipboard.test.ts:'tracker cleanup in pasted HTML (R-CLIPBOARD-024)', tests/e2e/editor-p0-clipboard.spec.ts:'paste options… (R-CLIPBOARD-009, R-CLIPBOARD-024)'. Открыто: права на вложения при переносе между статьями — см. R-CLIPBOARD-018
- **R-CLIPBOARD-025** (P1, CLIPBOARD, частично): Вставка Excel/CSV распознаёт таблицу, многострочные ячейки и табуляцию; большие файлы с прогрессом, отменой, повтором без блокировки набора — Больших вставок с прогрессом/отменой нет (синхронно)
- **R-EDITOR-069** (P0, EDITOR, частично): Drag handle ⋮⋮ предсказуем; порог начала; линия до/после/внутрь; автопрокрутка, вложенность, колонки, Ctrl/Alt-копирование, клавиатура … — Нет копирования Ctrl/Alt-перетаскиванием, нет «внутрь», нет запрета недопустимых целей; без тестов
- **R-EDITOR-072** (P1, EDITOR, частично): /-меню: поиск, синонимы RU/EN, недавние, стрелки, Enter, Esc; не перехватывает ввод в коде, URL, IME, при экранировании — Нет недавних; IME/экранирование не проверены
- **R-QA-032** (P0, QA, частично): Матрица: Chrome/Edge/Firefox/Safari, Windows/macOS, клавиатура/мышь/touch, 100–200% zoom, 320–1920 px, RU/EN, IME, дикторы … — Edge/Firefox/Safari, Windows/macOS, touch, EN, IME, screen readers absent (env)
- **E204** (P1, EDITOR, частично): E2E: смешанные стили — Mixed-состояния нет; E2E нет
- **E205** (P1, EDITOR, частично): E2E: применение/сброс цвета — E2E нет
- **E206** (P1, EDITOR, частично): E2E: URL поверх выделения — E2E нет
- **E207** (P1, EDITOR, частично): E2E: редактирование ссылки — E2E нет
- **E212** (P1, CLIPBOARD, частично): E2E: вставка без форматирования — E2E нет
- **E214** (P1, LAYOUT, не реализовано): E2E: перенос между колонками — no E2E for moving between columns
- **E223** (P1, A11Y, частично): E2E: клавиатура без мыши — no keyboard-only E2E
- **R-PERF-021** (P1, PERF, частично): Палитра после выделения p95 ≤100 мс; форматирование p95 ≤50 мс; ввод p95 ≤50 мс; без layout shift при hover — palette/formatting latency and hover layout shift not measured
- **R-QA-033** (P0, QA, частично): Не принимать по скриншотам: ручное UX-тестирование с сотрудниками, браузерные автотесты, тесты потери сети, обратимый экспорт — manual UX testing with employees not done
- **R-EDITOR-074** (P1, EDITOR, частично): Единый DnD: «+» и ⋮⋮ на hover без сдвига контента; на touch — долгое нажатие или меню «Переместить» — На touch нет долгого нажатия/меню «Переместить» (ручка только hover)
- **R-EDITOR-075** (P0, EDITOR, частично): Drag preview, линия вставки, подсветка колонки/контейнера, автопрокрутка, недопустимые цели; отпускание — одна атомарная операция — Нет подсветки колонки/контейнера и недопустимых целей
- **R-EDITOR-076** (P0, EDITOR, частично): Перемещение нескольких блоков, между колонками и страницами (изображения, таблицы, вложенные) с сохранением порядка, ссылок и ID — tests/e2e/editor-p0-nav.spec.ts:'blocks move to another page… (E215, R-EDITOR-076)'; editor-p0-blocks.spec.ts (набор блоков). Нет теста перетаскивания между колонками; вложения изображений при переносе остаются привязаны к исходной странице (R-CLIPBOARD-018)
- **R-HISTORY-017** (P0, HISTORY, частично): Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y по платформе; атомарные операции: ввод, формат, вставка, удаление, перенос, resize, преобразование … — Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y: ввод, формат, вставка, удаление, перенос, преобразование отменяются (тесты); отмена изменения размера (resize изображения/колонки) не тестируется
- **R-HISTORY-019** (P1, HISTORY, не реализовано): Меню истории у кнопок отмены: время, тип, объект, автор; переход к состоянию с предпросмотром и подтверждением при массовом откате — Меню истории операций с предпросмотром нет
- **R-HISTORY-022** (P1, HISTORY, не реализовано): После перезагрузки граница undo-истории обозначена; история документа доступна; без ложных обещаний отката необратимого — Граница undo-истории после перезагрузки не обозначается
- **R-UI-064** (P1, UI, частично): Hover 100–160 мс; drag без инерционного промаха; структура 120–220 мс; не анимировать ввод, курсор, сохранение; reduced-motion — drag inertia/hover timing untested
- **R-LAYOUT-010** (P1, LAYOUT, частично): Контроль 320–1920 px, touch, мышь, клавиатура, 200%, длинные названия, 4 колонки, вложенные таблицы; без наложений, page-скролла … — 4 columns, nested tables, long names, touch not covered
- **UX21-185** (P1, LAYOUT, не реализовано): Перенос изображения в другую колонку — no evidence/test of moving an image into another column
- **UX21-191** (P1, EDITOR, не реализовано): Drag на touch — Перетаскивание на touch не поддерживается
- **UX21-192** (P1, A11Y, частично): Перемещение клавиатурой — untested
- **UX21-199** (P1, HISTORY, не реализовано): Меню истории действий — Меню истории действий у кнопок отмены нет
- **UX21-205** (P1, LAYOUT, частично): 4 колонки на мобильном без потери контента — untested
- **R-MEDIA-022** (P1, MEDIA, частично): Mobile: pinch от центра жеста, pan одним пальцем, double tap, инерция с ограничением; свайп переключает только в «вписать»; safe-area … — Нет инерции, свайпа между изображениями, safe-area
- **R-MEDIA-023** (P1, MEDIA, частично): Рендер: оригинал с progressive loading/тайлингом, предупреждение о размытии, EXIF, санитизация SVG, прозрачность PNG, узкие изображения … — tests/integration/content.test.ts:'large images get a deep-zoom tile pyramid…'. Нет предупреждения о размытии
- **R-PERF-022** (P1, PERF, частично): Zoom/pan через transform+rAF без layout thrashing; отклик на жест <50 мс, ~60 fps на типовом устройстве — no requestAnimationFrame batching; gesture latency/fps not measured
- **R-HISTORY-029** (P1, HISTORY, частично): Гарантия — восстановление после каждой подтверждённой смысловой операции/группы набора, не каждого нажатия; границы гарантии видны — Граница гарантии не отображается пользователю
- **R-HISTORY-031** (P1, HISTORY, частично): UX: Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y; список последних операций; панель «История» с фильтрами автор/дата/блок/тип; visual diff … — Фильтр только по типу версии; фильтров автор/дата/блок в UI нет; списка последних операций нет
- **R-COLLAB-031** (P0, COLLAB, частично): Серверная валидация схемы, прав, инвариантов; транзакционная координация поверх CRDT для таблиц, колонок, удаления/перемещения страниц, ACL — Нет транзакционной координации поверх CRDT для таблиц/колонок; только валидация схемы с откатом
- **R-COLLAB-036** (P0, COLLAB, частично): Неслиемая операция — диалог сравнения: сохранить обе, принять серверную, сохранить локальную копию; не скрывать конфликт — Конфликт не скрывается: копия сохраняется на сервере, уведомление с восстановлением; полноценного диалога сравнения с тремя вариантами нет
- **R-COLLAB-037** (P0, COLLAB, частично): Журнал с ack, retry/backoff, идемпотентность, sequence/vector clocks, проверка согласованности, контроль orphan-блоков и циклов … — Проверка согласованности сделана и тестируется; безопасная миграция схемы содержимого (content_schema_version) по-прежнему не реализована
- **R-QA-034** (P0, QA, частично): Property-based/fuzz, partition/latency/reorder/duplicate, 2–20 редакторов, нагрузка, восстановление из snapshot+log … — no partition/reorder/duplicate injection; 20-editor run is manual
- **UX22-183** (P1, MEDIA, частично): iOS/Android pinch, pan, double tap, инерция, смена ориентации, safe areas — Нет инерции, safe-area; проверка на iOS/Android невозможна здесь (env)
- **HIST-190** (P1, HISTORY, частично): История: автор, время, diff, фильтры; доступна на телефоне — Фильтров автора/даты нет
- **R-SPACE-008** (P1, SPACE, частично): Квоты ненавязчиво; при превышении содержимое не удаляется, доступны безопасные действия — No quota usage indicator in UI.
- **R-TREE-023** (P1, TREE, частично): Группы «Моё пространство», «Командные», «Избранное», «Недавние»; сохраняются раскрытия, выбранная страница, ширина, прокрутка … — Нет группы «Недавние» в панели, не сохраняются прокрутка и выбранная позиция между сессиями
- **R-PERF-023** (P1, PERF, частично): Тысячи страниц: ленивые дочерние, виртуализация, стабильная прокрутка, мгновенное раскрытие загруженных ветвей — not tested at 10 000 nodes
- **R-COLLAB-038** (P1, COLLAB, частично): WebSocket или аналог для присутствия, курсоров, изменений, уведомлений, дерева; HTTPS для загрузки, файлов, поиска, критических команд … — Решение описано, нагрузочных испытаний транспорта нет
- **R-UI-066** (P1, UI, частично): Непрерывная прокрутка и подгрузка вместо технической пагинации: дерево, поиск, недавние, шаблоны — "Показать ещё/Загрузить ещё" buttons in SearchPage.tsx:531, HistoryPanel.tsx:194, AuditSection.tsx:285 instead of continuous loading
- **R-PERF-024** (P1, PERF, частично): Серверная курсорная пагинация, виртуализация, предзагрузка, сохранение позиции; для аудита и истории — переход к дате/фильтру — lists not virtualised; history has no jump-to-date
- **R-PERF-025** (P1, PERF, частично): Длинные документы без блокировки набора; ленивые медиа с резервированием размеров; виртуализация таблиц не ломает выделение … — no virtualisation; typing on 5 000 blocks p50 ≈ 190 ms (PERF-D2)
- **R-PERF-026** (P1, PERF, частично): Отклик типичных действий ~100 мс; раскрытие загруженной ветки без сетевого ожидания; численные SLA после профилирования — other actions not profiled
- **R-PERF-027** (P1, PERF, частично): Метрики: INP, время первого взаимодействия, sync p95/p99, пропуски кадров DnD, размер очереди, время reconnect; бюджеты регрессии в CI — no INP/reconnect/DnD metrics; CI exists but has no performance budgets
- **R-UI-067** (P1, UI, частично): Пустое дерево, пустая статья, нет прав, нет сети, ошибка загрузки — ясное сообщение и безопасный шаг; без зависших экранов — untested
- **UX23-202** (P1, TREE, не реализовано): Escape отменяет пустое создание без мусора и дублей — Escape на пустом новом черновике ничего не отменяет
- **UX23-212** (P1, PERF, частично): Раскрытие дерева на 10 000 страниц не блокирует интерфейс — not tested with 10 000 pages
- **UX23-221** (P1, SEARCH, частично): Поиск с десятками тысяч результатов подгружается плавно — Кандидатов не более 3000, offset ≤5000 — десятки тысяч результатов недоступны
- **UX23-223** (P1, UI, частично): Мобильное создание и перенос без hover — move without hover untested
- **R-UI-068** (P0, UI, частично): Никакие функции не ведут в тупик, нет нерабочих кнопок и незавершённых состояний — no inventory of every button/state; other screens (admin, import) not covered by dead-end E2E
- **R-PROCESS-049** (P1, PROCESS, частично): При неоднозначности — варианты и выбор по приоритету: данные/права, корректность, простота, скорость/доступность, визуал, сопровождение … — not every decision has an ADR
- **R-PROCESS-051** (P0, PROCESS, не реализовано): Реестр открытых вопросов и дефектов с владельцем и тестом; 0 критических/высоких; средние/низкие исправлены или письменно приняты — no open-issues/defects registry
- **R-PERF-028** (P1, PERF, частично): Локальный отклик набора и действий p95 ≤100 мс в типовом документе; честная индикация тяжёлых операций — typing only; other local actions unmeasured
- **R-PERF-029** (P1, PERF, частично): Удалённое подтверждённое изменение у другого участника p95 ≤500 мс при нормальной сети — latency not measured
- **R-BACKUP-018** (P0, BACKUP, частично): RPO ≤5 минут и RTO ≤2 часа с регулярными испытаниями; учёт неподтверждённых локальных изменений отдельно — Test scale only
- **R-OPS-021** (P1, OPS, частично): Поддерживаемые размеры документов, вложений, число редакторов и профили нагрузки определены, измерены и в паспорте эксплуатации — No operations passport with supported document/attachment sizes, editor counts, load profiles
- **R-QA-036** (P0, QA, не реализовано): Для каждого сценария: обычный, граничный, ошибочный, конкурентный, восстановительный пути по 16 группам функций — no scenario × path matrix
- **R-QA-037** (P0, QA, частично): Сквозные испытания A–L: одна строка и разные блоки; перенос+правка; структура таблицы; обрыв при записи и перезапуск … — no mapping of the 12 trials to tests
- **R-QA-038** (P0, QA, частично): Автоматизация unit/component/integration/API/E2E/property/load/chaos; рандомизированные конкурентные последовательности … — no component/contract tests; load test exists (scripts/load) but is not in CI
- **R-OPS-022** (P0, OPS, частично): Поставка: deployment без секретов в репо, миграции и откат, health/readiness, метрики/логи/трейсы, алерты, бэкапы и restore-тесты … — CD pipeline and operations passport missing
- **R-PROCESS-052** (P0, PROCESS, не реализовано): До запуска: тестовая эксплуатация, нагрузка, доступность, угрозы и права, тест восстановления, ручная UX-проверка, регрессии, пилот … — no gate checklist; no pilot, load, a11y audit, manual UX check
- **R-PROCESS-053** (P0, PROCESS, частично): «Готово» только после прохождения gate, не после написания кода — gate currently fails (open P0s), so "готово" is not claimed
- **OPS-012** (P1, UI, частично): Корректное отображение долгих операций — no browser test
- **OPS-013** (P1, OPS, частично): Мониторинг и тревоги — Rules not loaded into Prometheus / fired in a drill here (promtool unavailable)
- **OPS-015** (P1, QA, частично): Мобильная и планшетная регрессия — single phone test; no tablet project
- **OPS-016** (P1, A11Y, частично): Доступность с клавиатуры — no keyboard pass
- **OPS-017** (P1, PERF, не реализовано): Нагрузка и длительная сессия без деградации — no long-session/load degradation test
- **OPS-018** (P0, PROCESS, не реализовано): Нет открытых критических/высоких дефектов при приёмке — no defect registry
- **R-ACL-057** (P1, ACL, частично): Объекты: организация, подразделение, группа, пространство, папка/страница, дочерняя, вложение, версия, шаблон; области «Только я» … — Scopes "Группа", "Подразделение", "Гости по приглашению", "Только я" not offered as presets; no grants on templates/attachments.
- **R-ACL-060** (P1, ACL, частично): Диалог доступа: область, люди/группы/подразделения, уровень, срок, статус (активен/ожидает/приостановлен/истёк) … — No status (active/pending/suspended/expired) display; starts_at not exposed in UI.
- **R-ACL-061** (P1, ACL, частично): Быстрые действия: пригласить гостя, добавить сотрудника, подразделение, вся компания, роль, срок начала/окончания, приостановить … — No start date, suspend/resume of a grant, grouping/filters or bulk assignment with preview in UI.
- **R-ACL-062** (P1, ACL, частично): Опасные действия подтверждаются без лишних диалогов, с отменой где безопасно — No undo for grant revocation/changes.
- **R-ADMIN-019** (P1, ADMIN, частично): Поиск, фильтры, пустые состояния, пакетные операции с предпросмотром; администрирование на мобильном/планшете без hover-only — No batch operations; admin on mobile/tablet not verified.
- **ACL-170** (P1, ADMIN, частично): Массовое назначение показывает точную аудиторию до подтверждения — Bulk preview does not compute exact audience; no bulk UI.
- **ACL-174** (P1, A11Y, частично): Все операции доступа клавиатурой, с экрана 320px и на планшете — no test at 320px/keyboard/tablet
- **QA26-01** (P0, QA, не реализовано): Система не готова, пока не проверено каждое доступное действие, визуальный элемент и переход состояния; «в основном работает» не критерий — no inventory of actions
- **QA26-03** (P0, QA, не реализовано): Запись матрицы на каждый экран/элемент/состояние/действие: ID, компонент, состояние, устройство, ввод, предусловия, действие, ожидание … — no matrix records
- **QA26-04** (P0, QA, не реализовано): Инвентаризация из маршрутов и реестра компонентов; пропущенные действия блокируют релиз — no route/component inventory
- **QA26-05** (P1, QA, частично): Состояния normal/hover/focus/active/disabled/loading/error/empty/overflow; подсказки, popover, modal, меню, drag-preview; клавиатура … — not verified
- **QA26-06** (P0, EDITOR, частично): Проверить ввод, выделение (мышь/клавиатура/палец), клики, Shift, copy/cut/paste plain/rich/HTML/Word/Excel, DnD, форматирование, ссылки … — Покрыты: ввод, IME, выделение мышью/клавиатурой (слово, абзац, через блоки, блоки), Shift, copy/paste plain/rich/HTML/Word/Excel, форматирование, slash, заголовки, списки, чек-листы, таблицы (все операции, merge, сортировка), изображения, перенос блоков. Не покрыты: DnD блоков мышью, выделение пальцем, 1–4 колонки, ширина колонок макета
- **QA26-07** (P0, EDITOR, частично): Каждое действие в пустом/заполненном документе, на длинных данных, после Undo/Redo, после перезагрузки, при конкурирующих изменениях — Пять контекстов на каждое действие не реализованы
- **QA26-08** (P1, TABLE, частично): Таблицы: выравнивание по горизонтали и вертикали, автовысота, перенос длинных слов/ссылок, вставка диапазонов, строки/столбцы … — Чек-лист таблиц не автоматизирован
- **QA26-09** (P0, EDITOR, частично): DnD блоков, изображений, таблиц, вложенных страниц и ветвей: соседние блоки, колонки, статьи, разделы по правам, края с автопрокруткой … — Автотестов DnD нет
- **QA26-11** (P1, TREE, частично): Проверить «+» у страницы, раскрытие/сворачивание, breadcrumbs, back/forward, поиск, избранное, пагинацию/виртуализацию, сохранение положения — Из плана проверок автоматизировано только «+»; раскрытие, breadcrumbs, back/forward, избранное, виртуализация не проверяются
- **QA26-12** (P1, MEDIA, частично): Просмотрщик: открытие/закрытие, колесо по курсору, pan, pinch, pan пальцем, double tap, reset, ориентация, экстремальные пропорции … — Покрыты только открытие/кнопка +/0/Esc; жесты/ориентация не автоматизированы
- **QA26-13** (P1, FILES, частично): Файлы: иконка, просмотр, скачивание, прогресс, ошибки, повтор, длинные имена, права, мобильное сохранение, недоступный файл … — UI-аспекты (иконки, длинные имена, мобильное сохранение) не проверяются
- **QA26-15** (P0, HISTORY, частично): Восстановление не уничтожает последующие версии, аудит не подменяется; документ и блоки, после удаления/архивации … — Нет проверок после удаления/архивации, при совместной работе, очистки по сроку
- **QA26-20** (P0, COLLAB, частично): Сбои: сеть, высокий RTT, потери, Wi-Fi/LTE, закрытие вкладки, обновление, рестарт сервера, истечение сессии, повторная доставка … — Не проверены смена ведущего узла БД/экземпляра под нагрузкой и реальная смена Wi-Fi/LTE (ограничение окружения)
- **QA26-22** (P1, PERF, частично): SLO (калибруемые): локальный отклик p95 ≤100 мс; контекстная панель p95 ≤150 мс; загруженная страница p95 ≤500 мс; ~60 fps … — panel/page-load/fps not measured
- **QA26-23** (P1, QA, частично): 320–1920 px, zoom 100/125/150/200%, темы, Safari/Chrome/Firefox/Edge, iOS/Android, длинные строки, переполнение, меню у границ … — zoom only 200% (no 125/150); only Chromium is installed (playwright.config.ts, DECISIONS D-18)
- **QA26-25** (P0, OPS, частично): Нагрузочное, soak, стресс, регрессия, доступность, отказоустойчивость; наблюдаемость, алерты, журналы без секретов, миграции, откат … — No load/soak/stress test protocols
- **QA26-27** (P0, QA, не реализовано): Статус PASS/FAIL/BLOCKED/N/A с обоснованием, ссылкой на запуск и версией сборки; CI, E2E, visual regression, ручной UX-аудит … — no PASS/FAIL/BLOCKED per scenario with build/run links
- **QA26-28** (P0, PROCESS, частично): Перед релизом: 100% действий покрыто; 100% критичных пройдено; 0 blocker/critical; 0 сценариев потери данных, обхода ACL … — gate defined but not met; "100% действий покрыто" not measurable (no action inventory)
- **QA26-29** (P1, PROCESS, частично): Сдать отчёт о покрытии, протоколы восстановления, измерения производительности, реестр решений, руководство администратора, runbooks — coverage report per run missing
- **R-UI-069** (P1, UI, частично): Дочерняя статья, DnD, копирование, публикация — минимум действий; исключения доступа скрыты до запроса — DnD/copy/publish action counts not measured
- **R-ADMIN-022** (P1, ADMIN, частично): Временные приглашения, гости, приостановка, отзыв сессий, массовое управление группами — No bulk group management.
- **R-SEARCH-018** (P0, SEARCH, частично): Приватные материалы не включаются в общие индексы и уведомления — Личные материалы лежат в общей таблице search_index и отсекаются только фильтром ACL при запросе
- **R-BACKUP-019** (P0, BACKUP, частично): Регулярная проверка бэкапов реальным восстановлением, контрольными суммами и сравнением импорт-экспорт-импорт — Regular production verification is an operational process
- **R-UI-071** (P1, UI, частично): Умные значения по умолчанию, последняя позиция, быстрый поиск, клавиатура, отмена, понятная обратная связь — not verified
- **R-UI-072** (P1, UI, частично): Без обязательных диалогов для типовых операций; предупреждения только при необратимом действии или изменении видимости — no audit of dialogs in typical ops

## Полный реестр


### PROCESS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PROCESS-001 | P1 | Перед изменениями исследовать репозиторий: структуру, стек, зависимости, миграции, API, UI, тесты, конфигурации, дефекты | процесс/документ | first commit 1fc0d14 is a scaffold (repo started empty); no audit report needed/written |  |
| R-PROCESS-002 | P1 | Не переписывать исправно работающий код без причины; при пустом репозитории создать поддерживаемую структуру | процесс/документ | docs/DECISIONS.md (D-01..D-18); exists |  |
| R-PROCESS-003 | P0 | Составить реестр требований: ID, модуль, приоритет P0/P1/P2, статус, тесты, критерий приёмки; сохранить docs/REQUIREMENTS_TRACEABILITY.md | реализовано | docs/requirements/registry.yaml (1298 entries), scripts/requirements/trace.py → docs/REQUIREMENTS_TRACEABILITY.md; completeness vs source not independently re-verified here |  |
| R-PROCESS-004 | P1 | Создать docs/ARCHITECTURE.md, DECISIONS.md, TEST_MATRIX.md, OPERATIONS.md, RELEASE_READINESS.md | частично | docs/ARCHITECTURE.md, DECISIONS.md, TEST_MATRIX.md (generated by scripts/requirements/test_matrix.py), OPERATIONS.md exist; RELEASE_READINESS.md not yet present at re-assessment (written by the lead) |  |
| R-PROCESS-005 | P1 | Технические решения принимать самостоятельно с объяснением компромиссов; уточнения только при блокирующей неоднозначности … | процесс/документ | docs/DECISIONS.md; exists |  |
| R-PROCESS-006 | P1 | Работать вертикальными срезами: БД + сервер + API + интерфейс + права + тесты + диагностика | процесс/документ | git history; not followed: server layers first, web client in e51bb0c/4fabd33, browser E2E only in 0d4abd3 |  |
| R-PROCESS-007 | P0 | После каждого среза запускать сборку, статический анализ, модульные, интеграционные, E2E и визуальную проверку … | реализовано | .github/workflows/ci.yml runs typecheck, eslint (eslint.config.js, 0 errors), unit, integration, resilience, build, Playwright E2E incl. pixel baselines (tests/e2e/a11y.spec.ts) on every push/PR; workflow runs on GitHub were not observed from this environment; locally all stages were run green |  |

### QA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-QA-001 | P0 | Тестировать в реальном браузере: навигация, курсор, выделение, hover, меню, drag-and-drop, масштаб, таблицы, мобильная версия … | частично | tests/e2e/* incl. ui-p0-interaction (menus at edges, hover, focus), ui-p0-layout (320–1920, real zoom), ui-p0-touch (touch phone context), perf-typing (caret), a11y; drag-and-drop and text selection by mouse not covered; paste is synthetic |  |

### PROCESS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PROCESS-008 | P0 | Не скрывать ограничения: непроведённые испытания указывать как непроверенные блокеры; не заявлять production-ready без свидетельств | процесс/документ | this status file lists env-blocked/manual items; RELEASE_READINESS.md with unverified blockers missing |  |
| R-PROCESS-009 | P0 | Не удалять функции для упрощения; при нехватке библиотеки расширить/заменить её с тестами | процесс/документ | no deleted features/tests in git history; not formally verifiable |  |

### OPS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-OPS-001 | P0 | Сохранять исходные данные и обратную совместимость; любая миграция с резервной копией, проверкой и откатом | реализовано | db/migrate.ts BackupRequiredError: pending migrations on a database with data need a successful full backup (backups table) newer than MIGRATION_BACKUP_MAX_AGE_MIN and than the last applied migration; enforced on server start and cli migrate up (default on in production, override --skip-backup-check, used by restore.sh); rollback of every migration with data; tests/resilience/migrations.test.ts: pending migrations on a database with data are refused until a fresh full backup is recorded… | tests/resilience/migrations.test.ts: schema migrations: rollback and re-apply (E-14, OPS-002, R-OPS-001)<br>tests/resilience/migrations.test.ts: every migration rolls back and re-applies step by step with data present; the application <br>tests/resilience/migrations.test.ts: pending migrations on a database with data are refused until a fresh full backup is record |

### PROCESS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PROCESS-010 | P1 | Итоговый отчёт: реализованное, трассировка, команды запуска, тесты, дефекты, производительность, резервирование, ограничения … | не реализовано | n/a; final report (RELEASE_READINESS) not written |  |
| R-PROCESS-011 | P0 | Разделы A–L имеют приоритет над устаревшими формулировками исторического корпуса | процесс/документ | docs/DECISIONS.md D-10 (stricter of conflicting requirements); exists |  |

### EXPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-EXPORT-001 | P0 | Обязательны DOCX и Markdown import/export, CSV/XLSX для таблиц, PDF и HTML как экспорт, ZIP полного переносимого архива | реализовано | tests/integration/import-export.test.ts: exports MD/DOCX/HTML/PDF; DOCX/MD/CSV/XLSX imports; GET /api/v1/collections/:id/export?format=csv/xlsx; org archive ZIP; Collection CSV/XLSX export not covered by a test | tests/integration/io-p0-export.test.ts: branch export: one DOCX with a table of contents, or separate files in a ZIP with report a<br>tests/integration/import-export.test.ts: exports a page to MD/DOCX/HTML/PDF; DOCX opens in LibreOffice; MD round-trips (R-EXPORT-00 |

### IMPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-IMPORT-001 | P2 | PDF как редактируемый импорт не обязателен; раннее исключение PDF/HTML из экспорта отменено | реализовано | PDF not an import format (importer.ts unsupported) |  |

### TREE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-TREE-001 | P1 | Глубина вложенности произвольная; ранний API-лимит 15 уровней не становится UX-ограничением; техлимит только если доказан | реализовано | apps/server/src/services/pages.ts#assertDepth; tests/integration/history-tree.test.ts; Техлимит 15 уровней (как в ТЗ §B), обоснован единым ограничением API | tests/integration/history-tree.test.ts: nesting limit (R-TREE-005, R-TREE-001)<br>tests/integration/history-tree.test.ts: allows 15 levels and rejects a 16th on create, move, duplicate and import with a clear err |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ACL-001 | P0 | Пространства и группы — первичный уровень доступа; постраничные ACL — редкие явные исключения | реализовано | apps/server/src/acl/engine.ts APPLICABLE_GRANTS_SQL (space grants + page exceptions), apps/server/src/services/org.ts createSpace groups/orgLevel; tests/integration/acl.test.ts: department spaces |  |
| R-ACL-002 | P0 | Никогда не заставлять пользователя выбирать права при обычном создании статьи | реализовано | POST /api/v1/pages (routes/pages.ts) -> createPage inherits, no rights dialog; Sidebar "+" creates directly |  |

### COLLAB

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-COLLAB-001 | P0 | Синхронизация не обязана быть исключительно WebSocket; критерий — без потерь, многопользовательское редактирование и восстановление … | реализовано | apps/server/src/collab/hub.ts, packages/shared/src/collab-client.ts; tests/integration/collab.test.ts (randomised convergence, offline), tests/resilience/crash-restart.test.ts; Yjs CRDT + собственный протокол с ACK после commit (docs/DECISIONS.md D-02) | tests/integration/collab.test.ts: two editors typing in the same paragraph converge without loss (SC-25, AT-74, COLLAB-192,  |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-UI-001 | P1 | UI светлый, минималистичный, сдержанный, по согласованным макетам; не тёмный фирменный UI | требует ручной проверки | apps/web/src/styles/tokens.css (light reference theme, dark only via data-theme/system); no agreed mockups in repo; needs visual sign-off |  |

### HISTORY

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-HISTORY-001 | P0 | История и резервирование сохраняют максимальные из согласованных гарантий, без упрощения ради скорости | реализовано | apps/server/src/routes/admin.ts (retention min 90/365), docs/DECISIONS.md D-10 |  |

### QA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-QA-002 | P0 | «Всё протестировано» = доказанное покрытие каждого доступного элемента и действия через каталог состояний, матрицы переходов, pairwise … | частично | docs/TEST_MATRIX.md (area × condition matrix, generated test catalogue); pairwise generator tests/support/pairwise.ts; no per-element state catalogue or transition matrix |  |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-UI-002 | P1 | Внешне простой, эстетичный, быстрый, интуитивный инструмент уровня Notion; внутри — транзакционная, восстановимая, наблюдаемая платформа | требует ручной проверки | n/a; UX comparison with Notion not performed |  |
| R-UI-003 | P1 | Минимизировать обязательные диалоги и клики; умные контекстные действия, наследование настроек и понятные значения по умолчанию | частично | tests/e2e/editor.spec.ts create→type→autosave with no dialogs; slash menu; helpers.newPage; no audit of all key tasks for mandatory dialogs |  |

### TREE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-TREE-002 | P1 | «+» рядом с разделом создаёт дочернюю страницу с фокусом в заголовке | реализовано | apps/web/src/layout/SidebarTree.tsx#newChild, apps/web/src/editor/Editor.tsx autoFocusTitle; tests/e2e/content.spec.ts (sidebar tree) | tests/e2e/content.spec.ts: sidebar tree: "+" creates a child page under the selected parent with focus in the title ( |

### TABLE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-TABLE-001 | P1 | Таблица сама переносит текст | реализовано | styles/editor.css .kb-editor overflow-wrap:anywhere, td vertical-align; Без теста |  |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-UI-004 | P1 | Меню остаётся в пределах экрана | частично | apps/web/src/components/ui/Menu.tsx (floating-ui flip/shift/size padding 8); no test of menus at viewport edges |  |
| R-UI-005 | P1 | Последний контекст навигации восстанавливается | частично | apps/web/src/state/ui.ts persists theme, sidebar, expanded, rightPanel; last route/page/space not restored after restart |  |

### EDITOR

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-EDITOR-001 | P0 | Сохранять выделение, курсор, прокрутку, состояние дерева, открытые вкладки и данные при ререндере, навигации, синхронизации и сбоях сети | реализовано | extensions/stableSelection.ts (курсор/выделение при синхронизации); selectionMemory.ts (курсор по id блока); hooks/useScrollRestore.ts (прокрутка Back/Forward и при повторном открытии страницы); tests/e2e/editor-p0-core.spec.ts:'caret and selection stay in place while a colleague edits…'; tests/e2e/clipboard.spec.ts:'caret position of a page is restored…'; tests/e2e/editor-p0-nav.spec.ts:'opening another page and coming back from the tree keeps the scroll position…' | tests/unit/editor-convert.test.ts: caret memory (R-EDITOR-001, R-EDITOR-037)<br>tests/e2e/editor-p0-core.spec.ts: caret and selection stay in place while a colleague edits, during autosave and after a net<br>tests/e2e/clipboard.spec.ts: caret position of a page is restored when it is opened again (R-EDITOR-037, R-EDITOR-001) |

### HISTORY

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-HISTORY-002 | P0 | Все операции обратимы где возможно; опасные действия — точный предпросмотр последствий без бесконечных подтверждений | частично | apps/web/src/layout/treeActions.tsx (undo перемещения, восстановление из корзины), apps/server/src/routes/revisions.ts pre-restore; Не все операции обратимы: смена иконки/свойств/заголовка через API без отмены (только запись before в page_events) |  |

### A11Y

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-A11Y-001 | P1 | Действия мышью, клавиатурой и на телефоне одинаково доступны | частично | keyboard in SidebarTree/Menu/Dialog; @media (pointer: coarse) in apps/web/src/styles/layout.css, ui.css; no mouse/keyboard/touch input matrix; touch never exercised in tests |  |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-UI-006 | P0 | Нет обрезаний, перекрытий, случайного скролла, прыжков layout, дрожания, ложных «сохранено» и скрытой утраты данных | реализовано | tests/e2e/ui-p0-layout.spec.ts "R-UI-006, R-UI-040: opening a page and typing cause no layout shift (CLS < 0.02)" (measured CLS 0.001), "R-UI-006: switching pages, opening and closing the side panel…", "R-UI-006, V17-F09: no overlapping, clipped or off-screen controls at 320–1920 px (light/dark)" (hit-testing every visible control), "V18-A18, AT-81: real 200 % zoom…"; pixel baselines tests/e2e/a11y.spec.ts; honest "Сохранено" tests/e2e/editor.spec.ts; home screen load CLS ≈ 0.03 (asserted < 0.1, docs/PERFORMANCE.md PERF-D3); dismissible overlays (toasts, onboarding hint) are allowed to cover content | tests/e2e/ui-p0-layout.spec.ts: R-UI-006, R-UI-040: opening a page and typing cause no layout shift (CLS < 0.02)<br>tests/e2e/ui-p0-layout.spec.ts: R-UI-006: switching pages, opening and closing the side panel cause no layout shift<br>tests/e2e/ui-p0-layout.spec.ts: R-UI-006, V17-F09: no overlapping, clipped or off-screen controls at 320–1920 px (${theme} |

### AUTH

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| ROUTE-01 | P0 | Сотрудник: вход → свои пространства → регламент → поиск → статья в отделе одной кнопкой → форматирование → вставка Excel/изображения … | реализовано | tests/e2e/acl-p0-routes.spec.ts 'ROUTE-01: employee route …': login, own spaces, regulation via space overview, search, one-click page in the department space, bold formatting, Excel (HTML table+TSV) and image paste, link to a page within rights (outsider gets «нет доступа»), logout and return with content intact | tests/e2e/acl-p0-routes.spec.ts: ROUTE-01: employee route — login → own spaces → regulation → search → one-click article in |

### OFFLINE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| ROUTE-02 | P0 | Автор: личный черновик → офлайн → синхронизация → перенос в отдел с предпросмотром видимости → согласование → публикация → обновление и … | частично | tests/e2e/editor.spec.ts, tests/e2e/collab.spec.ts, tests/integration/content.test.ts (publishing workflow), tests/integration/acl.test.ts (moving changes audience); Отдельные шаги покрыты, но сквозного E2E «черновик → офлайн → перенос в отдел с предпросмотром → согласование → публикация → откат» нет |  |

### SPACE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| ROUTE-03 | P0 | Руководитель пространства: дерево drag-and-drop → шаблоны → участники и доступ группы → контроль публикаций → восстановление удалённой ветки | реализовано | tests/e2e/acl-p0-routes.spec.ts 'ROUTE-03: space manager route …': an ordinary employee creates a space (CreateSpaceDialog), adds a group on «Участники» (SpaceMembersEditor), creates a page from a template, moves it by drag-and-drop in the sidebar tree, switches the space to «После публикации» and publishes (reader sees only the published version), deletes the branch and restores it from the trash | tests/e2e/acl-p0-routes.spec.ts: ROUTE-03: space manager route — members and group access → template → tree drag-and-drop → |

### ADMIN

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| ROUTE-04 | P0 | Администратор: подразделение/группа → сотрудник → автодоступ к пространству → гость в раздел на срок → приостановка → отзыв сессий … | реализовано | tests/e2e/acl-p0-routes.spec.ts 'ROUTE-04: administrator route …': department in Groups UI → employee with the department in Users UI → space for the department (automatic access verified by logging in) → guest user + page grant for 7 days via ShareDialog in a guests-allowed space → suspension (open session gets 401) → «Завершить все сеансы» → «Проверить доступ» explains the guest's access (source, term) → audit journal filter → organisation archive created, downloaded and restored into a new isolated space | tests/e2e/acl-p0-routes.spec.ts: ROUTE-04: administrator route — department → employee → automatic space access → guest on  |

### COLLAB

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| ROUTE-05 | P0 | Два редактора правят абзац, таблицу и структуру; связь у одного пропадает и восстанавливается; подтверждённый текст не теряется … | реализовано | tests/e2e/collab-p0-editing.spec.ts (two editors change a paragraph, one table and the structure while one loses the connection …), tests/integration/collab-p0.test.ts | tests/integration/collab-p0.test.ts: two editors change one table cell and neighbouring rows while a third adds a row; the merg<br>tests/e2e/collab-p0-editing.spec.ts: two editors change a paragraph, one table and the structure while one loses the connection |

### AUDIT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| ROUTE-06 | P0 | Аудитор проверяет кто и когда изменил документ, права, удаление, импорт, восстановление без скрытого доступа к посторонним материалам | реализовано | tests/e2e/acl-p0-admin.spec.ts 'ROUTE-06: the auditor reads who changed what …' (auditor sees events and actors in the journal, private titles masked, no access to the page itself); routes/admin.ts maskPrivateTitles; tests/integration/acl-p0.test.ts R-AUDIT-001/OPS-014 (views, edits, hidden-resource probes in the journal) | tests/integration/acl-gaps.test.ts: audit: private titles masked, denials logged (ROUTE-06, R-AUDIT-001, OPS-014)<br>tests/e2e/acl-p0-admin.spec.ts: ROUTE-06: the auditor reads who changed what in the journal but does not see titles or con |

### COLLAB

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| E-01 | P0 | Подтверждённые сервером изменения не теряются при обычных отказах приложения | реализовано | apps/server/src/collab/hub.ts#persist (ACK после tx); tests/resilience/crash-restart.test.ts, tests/resilience/db-connection-loss.test.ts | tests/resilience/storage-failure.test.ts: blob area not writable → clean error, no orphan rows; retry after recovery stores the file<br>tests/resilience/db-connection-loss.test.ts: unacknowledged operations are never shown as saved and all of them persist after the datab<br>tests/resilience/db-connection-loss.test.ts: a connection killed in the middle of a transaction does not crash the server process (R-OP<br>… ещё 3 |

### OFFLINE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| E-02 | P0 | Локальные неподтверждённые изменения в устойчивой очереди, статус виден пользователю | реализовано | packages/shared/src/collab-client.ts#restorePending, apps/web/src/sync/idb.ts, apps/web/src/hooks/data.ts#usePage (метаданные страницы в IndexedDB), apps/web/public/sw.js, apps/web/src/pages/PageView.tsx (баннер локальной копии); tests/e2e/collab-p0-offline.spec.ts (reload without network …), tests/integration/collab.test.ts (pending store) | tests/integration/collab.test.ts: unacknowledged changes survive a client restart via the pending store (AT-58, UX23-219, E-<br>tests/e2e/collab-p0-offline.spec.ts: reload without network reopens the local copy with an honest status; the queue is delivere<br>tests/resilience/crash-restart.test.ts: acknowledged edits survive a SIGKILL; in-flight and offline edits are kept and applied onc |

### COLLAB

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| E-03 | P0 | Повторная/переупорядоченная доставка операций не дублирует и не стирает данные | реализовано | apps/server/src/collab/hub.ts#acceptUpdate (dedupe по op_id); tests/integration/collab.test.ts, tests/resilience/crash-restart.test.ts | tests/integration/collab.test.ts: re-delivered operation is acknowledged once and not duplicated (D-02, E-03, UX23-214, R-CO<br>tests/resilience/crash-restart.test.ts: an operation persisted before the crash whose acknowledgement was lost is not duplicated o<br>tests/resilience/crash-restart.test.ts: continuous typing across a crash: every token persists exactly once (E-01, E-03) |
| E-04 | P0 | Одновременные изменения не перезаписываются молча; конфликт сохраняет данные и объясним | реализовано | apps/web/src/editor/extensions/conflictGuard.ts (удаление и перенос), apps/server/src/routes/conflicts.ts, apps/web/src/editor/Editor.tsx (уведомление «Вернуть мою версию»); tests/e2e/conflict.spec.ts, tests/e2e/collab-p0-editing.spec.ts (a block is moved …), tests/integration/conflicts.test.ts; Правка в одновременно удалённом/перемещённом блоке сохраняется как конфликтная копия (page_events conflict_copy), показывается уведомление и восстанавливается одним действием | tests/integration/conflicts.test.ts: conflict copies (E-04, R-COLLAB-045, R-COLLAB-049)<br>tests/e2e/collab-p0-editing.spec.ts: a block is moved by one editor while another edits it: the edit is kept as a conflict copy<br>tests/e2e/conflict.spec.ts: edit vs concurrent delete: the editor keeps a conflict copy and can put the block back (E- |

### TREE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| E-05 | P0 | Перенос, удаление, восстановление дерева и изменение ACL атомарны или имеют гарантированную компенсацию | реализовано | apps/server/src/services/pages.ts (move/trash/restore в одной транзакции + lockTree) | tests/integration/core.test.ts: trash and restore a branch with children (D-05, SC-29, V17-F08, E-05, R-HISTORY-003, R-HIS |

### PAGE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| E-06 | P0 | Внутренние ссылки используют стабильные ID и переживают переименование и перенос | реализовано | packages/shared/src/editor/nodes/links.ts (pageLink/pageMention по pageId), /p/:id |  |

### ARCHIVE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| E-07 | P0 | Удаление обратимо через корзину и версии в пределах политики хранения | реализовано | DELETE /api/v1/pages/:id → trash, POST /pages/:id/restore; tests/integration/core.test.ts: trash and restore a branch with children |  |

### BACKUP

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| E-08 | P0 | Бэкап подтверждён только успешным восстановлением и проверкой контрольных сумм | реализовано | scripts/backup/verify-backup.sh (restore to temp DB + checksums, records backups.verified_at); tests/resilience/backup-restore.test.ts: restores content…; a damaged backup is rejected | tests/resilience/backup-restore.test.ts: restores content, attachment bytes, history, permissions and the audit chain into a new in<br>tests/resilience/backup-restore.test.ts: a damaged backup is rejected by restore and verification (E-08, AT-60) |

### IMPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| E-09 | P0 | Импорт не повреждает существующие материалы, поддерживает dry-run и безопасный повтор | реализовано | tests/integration/import-export.test.ts: cancelling before commit creates nothing; same idempotency key; commit repeated=true; Preview of staged plan acts as dry-run for documents; tabular has explicit dry-run | tests/integration/import-export.test.ts: cancelling before commit creates nothing (AT-72, R-IMPORT-043, E-09)<br>tests/integration/import-export.test.ts: same idempotency key does not create a second job (AT-73, R-IMPORT-024, E-09) |

### EXPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| E-10 | P0 | Полный архив пригоден для чтения без приложения и обратного импорта | реализовано | tests/integration/archive.test.ts | tests/integration/archive.test.ts: export → readable without the app → restore into a clean installation → verified (V18-A05, |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| E-11 | P0 | Права одинаково применяются к документу, поиску, вложению, истории, экспорту, API, уведомлениям и кешу | реализовано | requirePage/accessForPages used by pages, search (services/search.ts), attachments, revisions, export, comments notifications, events WS (routes/collab.ts); tests/integration/acl.test.ts, tests/integration/content.test.ts; No ACL cache exists (always computed from DB). |  |
| E-12 | P0 | При отзыве прав не остаётся работающих прямых ссылок/сессий, раскрывающих запрещённые данные | реализовано | sessions/tokens revoked, signed links re-checked, WS recheck incl. expiry, stored exports re-checked at download (routes/import-export.ts, ExportResult.pageIds); tests/integration/acl-gaps.test.ts | tests/integration/acl-gaps.test.ts: stored exports re-check access at download (E-12, V16-S04, R-ACL-080, R-ACL-072) |

### COLLAB

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| E-13 | P0 | UI не утверждает «сохранено» без устойчивой фиксации | реализовано | packages/shared/src/collab-client.ts#setStatus, apps/web/src/components/page/SyncStatus.tsx; tests/integration/collab.test.ts durability, tests/e2e/editor.spec.ts, tests/resilience/db-connection-loss.test.ts | tests/integration/collab.test.ts: "saved" is reported only after the update is committed to the journal (E-13, D-10, R-COLLA<br>tests/resilience/db-connection-loss.test.ts: database connection loss during editing (SC-30, E-13, D-10)<br>tests/resilience/crash-restart.test.ts: acknowledged edits survive a SIGKILL; in-flight and offline edits are kept and applied onc |

### OPS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| E-14 | P0 | Обновления приложения и миграции имеют воспроизводимый откат | реализовано | db/migrate.ts migrateDown + SchemaTooNewError; tests/resilience/migrations.test.ts: every migration rolls back and re-applies with data; older release refuses newer schema; Image/tag rollback itself is procedural (docs/OPERATIONS.md §3) | tests/resilience/migrations.test.ts: schema migrations: rollback and re-apply (E-14, OPS-002, R-OPS-001)<br>tests/resilience/migrations.test.ts: every migration rolls back and re-applies step by step with data present; the application <br>tests/resilience/migrations.test.ts: a complete rollback to an empty schema and a fresh re-apply both succeed (E-14, R-OPS-007)<br>… ещё 1 |

### QA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-QA-003 | P1 | Для каждого компонента перечислить состояния: default, hover, focus, active, disabled, loading, error, empty, overflow, mobile … | не реализовано | n/a; no component state catalogue |  |
| R-QA-004 | P0 | Для каждого действия проверить нормальный путь, отмену, повтор, двойной клик, медленную сеть, офлайн, конфликт, недостаток прав … | не реализовано | n/a; no actions × conditions matrix |  |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-UI-007 | P1 | Кнопки/иконки: семантика, tooltip, hit target, доступность, реакция, идемпотентность | частично | aria-label + Tooltip on icon buttons; ui.css .icon-btn 28px (44px coarse); no per-button checks |  |
| R-UI-008 | P1 | Меню/popover: позиция, фокус, Esc, клик снаружи, вложенность, viewport | реализовано | tests/e2e/ui-p0-interaction.spec.ts "R-UI-059, R-UI-008, E224: …" (position in viewport, ArrowDown focus, Esc + focus return, outside click); nested submenus not exercised | tests/e2e/ui-p0-interaction.spec.ts: R-UI-059, R-UI-008, E224: menus at viewport edges flip/shift inside the window, keep keybo |

### TREE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-TREE-003 | P1 | Дерево: раскрытие, сворачивание, создание, перенос, автоскролл, ленивое дерево, восстановление состояния | реализовано | apps/web/src/layout/SidebarTree.tsx (lazy per-parent queries, virtualizer, DnD autoscroll), apps/web/src/state/ui.ts |  |

### EDITOR

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-EDITOR-002 | P0 | Редактор: ввод, IME, выделение, преобразование блоков, курсор, форматирование, drag, copy/paste из Word/Excel/браузера, Undo/Redo | частично | packages/shared/src/editor/extensions.ts; extensions/paste.ts + clipboard/html.ts (санитайзер, списки Word, data:-картинки); IME и курсор — editor-p0-core.spec.ts; IME, выделение, курсор, Undo, вставка Word/Excel/HTML покрыты тестами (editor-p0-*.spec.ts, clipboard.spec.ts). Не сделано: RTF-только буфер не разбирается; картинки Word по file:// браузер не передаёт (пользователь получает уведомление) |  |

### TABLE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-TABLE-002 | P1 | Таблицы: вставка, resize, wrap, merge, выделение диапазона, выравнивание, большие данные | частично | @tiptap/extension-table (resizable, CellSelection); apps/web/src/editor/menus/TableToolbar.tsx; Большие таблицы не проверялись (нет виртуализации/теста); есть только E2E вставки |  |

### MEDIA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-MEDIA-001 | P1 | Медиа: загрузка, preview, скачивание, полноэкранный просмотр, колесо под курсором, панорамирование, pinch, double-tap, поворот | реализовано | apps/web/src/editor/extensions/uploads.ts; apps/web/src/components/ImageViewer.tsx (wheel/pinch/pan/double-tap/rotate); apps/web/src/editor/nodeviews/ImageView.tsx; tests/e2e/content.spec.ts:'image: upload via file chooser, resize presets, caption, full-screen viewer with zoom' |  |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ACL-003 | P0 | ACL: наследование, исключения, гости, срок, перевод сотрудника, отзыв во время открытого документа | реализовано | tests/integration/acl.test.ts, tests/integration/collab.test.ts, tests/integration/acl-gaps.test.ts | tests/integration/acl-gaps.test.ts: time-based expiry in live sessions (R-ACL-038, V15-A07, ACL-156, R-ACL-063, R-ACL-003) |

### HISTORY

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-HISTORY-003 | P0 | История: восстановление блока, страницы, ветки, ревизии | реализовано | apps/server/src/routes/revisions.ts (restore, restore-block), apps/server/src/services/pages.ts#restorePage; tests/integration/collab.test.ts, tests/integration/core.test.ts | tests/integration/core.test.ts: trash and restore a branch with children (D-05, SC-29, V17-F08, E-05, R-HISTORY-003, R-HIS<br>tests/integration/collab.test.ts: restores a single deleted block from a revision (R-HISTORY-003, R-HISTORY-013) |

### EXPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-EXPORT-002 | P0 | Экспорт/импорт: round-trip, ссылки, ACL, вложения, Unicode, повреждённый архив, прерванная загрузка | реализовано | tests/integration/archive.test.ts (links, ACL, attachments, Unicode, corrupted archive); POST /api/v1/admin/archives/restore/upload/:uploadId (resumable upload session); tests/integration/io-p0-export.test.ts: archive uploaded through an interrupted, resumed upload session…; tests/integration/io-p0-import.test.ts: Markdown ZIP … round trip | tests/integration/archive.test.ts: export → readable without the app → restore into a clean installation → verified (V18-A05,<br>tests/integration/io-p0-export.test.ts: archive restore target and resumable upload (R-ARCHIVE-006, R-ARCHIVE-016, R-EXPORT-002)<br>tests/integration/io-p0-export.test.ts: archive uploaded through an interrupted, resumed upload session is restored into a NEW iso<br>… ещё 1 |

### QA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-QA-005 | P0 | Отказы: отключение сети, рестарт сервера, перезапуск вкладки, таймаут, конфликт, частичный сбой хранилища | частично | tests/resilience/crash-restart.test.ts, db-connection-loss.test.ts; tests/integration/collab.test.ts offline/pending store/conflict; tests/e2e/editor.spec.ts offline; timeouts and partial storage failure not covered |  |
| R-QA-006 | P0 | docs/TEST_MATRIX.md с ID каждого компонента/действия и ссылкой на тест; нет «нет теста» для критичного пути | частично | docs/TEST_MATRIX.md (generated catalogue with requirement ids per test, known gaps listed); not organised by component/action id; several critical paths still listed as gaps |  |
| R-QA-007 | P1 | Браузерная матрица 320/375/768/1024/1440/1920px, zoom 200%, мышь/клавиатура/сенсор; WebKit, Chromium, Firefox | частично | tests/e2e/visual.spec.ts 6 widths + zoom; tests/e2e/mobile.layout.spec.ts; only Chromium is installed (playwright.config.ts, DECISIONS D-18); touch input not exercised |  |
| R-QA-008 | P1 | Визуальные скриншоты эталонных экранов и сравнение регрессий | реализовано | tests/e2e/a11y.spec.ts "pixel baselines for stable screens (R-QA-008, AT-89)" toHaveScreenshot vs committed tests/e2e/a11y.spec.ts-snapshots (maxDiffPixelRatio 0.01), run in CI; only 2 screens (sign-in, help dialog) have baselines | tests/e2e/a11y.spec.ts: pixel baselines for stable screens (R-QA-008, AT-89) |
| R-QA-009 | P1 | UX-сравнение с Notion: задачи, клики, время, ошибки, оценка; без копирования ассетов; без существенного проигрыша | требует ручной проверки | n/a; Notion comparison not performed |  |

### OPS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-OPS-002 | P0 | Availability ≥99.9% в месяц | ограничение окружения | /healthz, /readyz, alerts KbInstanceDown/KbAllInstancesDown (deploy/monitoring/prometheus-alerts.yml); Monthly availability can only be measured in production by external monitoring | tests/resilience/db-connection-loss.test.ts: a connection killed in the middle of a transaction does not crash the server process (R-OP<br>tests/resilience/db-connection-loss.test.ts: a transaction whose connection is killed before COMMIT is retried transparently (E-01, R-O |

### BACKUP

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-BACKUP-001 | P0 | RPO ≤5 минут и RTO ≤2 часа для катастрофического отказа | частично | tests/resilience/pitr.test.ts (PITR: recovery 1.1 s, API serving 1.6 s), WAL archive_timeout=60s, --objects-only every 5 min, tests/resilience/backup-restore.test.ts; Confirmed at test scale only; production-volume drill pending | tests/resilience/backup-restore.test.ts: restores content, attachment bytes, history, permissions and the audit chain into a new in<br>tests/resilience/pitr.test.ts: recovers database and files to the moment before the incident; later damage is absent, ear |

### COLLAB

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-COLLAB-002 | P0 | Нулевая потеря подтверждённых операций при обычном сбое приложения | реализовано | apps/server/src/collab/hub.ts#persist; tests/resilience/crash-restart.test.ts, tests/resilience/db-connection-loss.test.ts |  |

### PERF

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PERF-001 | P1 | Скорость измеряется p95/p99 при зафиксированной нагрузке, сети и устройствах; быстрый ввод важнее анимации | реализовано | docs/PERFORMANCE.md (conditions, method, p50/p95/p99 for typing, long session, load); measured on an overloaded shared container, not the reference stand |  |

### QA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-QA-010 | P0 | Нагрузочные, длительные, конкурентные, отказоустойчивые и security-тесты с журналированием результатов | реализовано | load scripts/load/collab-load.mjs (journal test-results/load/*.json), longevity tests/e2e/perf-session.spec.ts + perf-typing (journal test-results/perf/results.jsonl), concurrency tests/integration/qa-invariants.test.ts + collab tests, resilience tests/resilience/*, security tests (CSRF/ACL/zip-slip/headers); CI uploads test-results/ as an artifact; docs/PERFORMANCE.md; load test is run manually, not in CI |  |

### PROCESS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PROCESS-012 | P0 | Релиз запрещён при критических дефектах данных/ACL/восстановления, непройденных критичных тестах … | реализовано | scripts/release-gate.py exits 1 while any P0 (data, ACL, restore, critical tests) is partial/missing or any requirement unassessed; CI job release-gate (workflow_dispatch); the gate is generic over P0 status, not a per-condition check |  |

### OPS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-OPS-003 | P0 | Инфраструктура эксплуатации: health checks, метрики, логи, трассировки, алерты, backup/restore, миграции, CI/CD, секреты, runbooks | частично | routes/health.ts (/healthz,/readyz,/metrics), pino JSON logs + correlationId + traceId, observability/tracing.ts (W3C traceparent, OTLP/HTTP export of request and job spans), metrics kb_collab_reconnects_total / kb_import_files_total / kb_ocr_duration_seconds with alerts, deploy/monitoring/*, scripts/backup/*, .github/workflows/ci.yml, docs/OPERATIONS.md runbooks; tests/integration/io-p0-ops.test.ts; No CD/deploy pipeline; secrets only via env/EnvironmentFile (no secrets manager) | tests/integration/io-p0-ops.test.ts: distributed tracing (R-OPS-003, R-OPS-022)<br>tests/integration/io-p0-ops.test.ts: HTTP requests and background jobs are OpenTelemetry spans: W3C traceparent is continued an<br>tests/integration/io-p0-ops.test.ts: metrics behind the new alerts (R-OPS-003)<br>… ещё 3 |

### PROCESS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PROCESS-013 | P1 | Документация: REQUIREMENTS_TRACEABILITY, ARCHITECTURE, DECISIONS, TEST_MATRIX, UX_ACCEPTANCE, SECURITY, OPERATIONS, BACKUP_RESTORE … | частично | docs/ REQUIREMENTS_TRACEABILITY, ARCHITECTURE, DECISIONS, TEST_MATRIX, UX_ACCEPTANCE, SECURITY, OPERATIONS, BACKUP_RESTORE; RELEASE_READINESS.md not yet present at re-assessment (written by the lead) |  |

### QA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-QA-011 | P1 | Каталоги тестов unit, integration, e2e, resilience (адаптируемые к стеку) | реализовано | tests/unit, tests/integration, tests/e2e, tests/resilience; vitest.config.ts projects; unit level is thin (1 file) |  |

### PROCESS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PROCESS-014 | P1 | README с точными командами установки, запуска, тестирования, миграций и восстановления | реализовано | README.md (environment, quick start, migrations, production build/run, checks incl. tests/backup/restore:verify, structure) |  |
| R-PROCESS-015 | P1 | План: аудит → архитектура/прототипы рисков → основа → редактор → онлайн/офлайн → поиск/шаблоны/публикация/OCR/импорт-экспорт … | процесс/документ | git history; no per-stage reports |  |
| R-PROCESS-016 | P0 | План не разрешение остановиться на промежуточном этапе; продолжать до полного результата, фиксировать внешние блокеры | процесс/документ | n/a; external blockers not yet recorded in a document |  |

### OFFLINE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-OFFLINE-001 | P0 | Запрет: localStorage как единственное долговременное хранилище документов | реализовано | apps/server/src/collab/hub.ts (PostgreSQL doc_updates/doc_state), apps/web/src/sync/collab.ts (IndexedDB только реплика/очередь) |  |

### COLLAB

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-COLLAB-003 | P0 | Запрет: считать setTimeout автосохранением | реализовано | packages/shared/src/collab-client.ts (saved только при пустой очереди после ACK) | tests/integration/collab.test.ts: "saved" is reported only after the update is committed to the journal (E-13, D-10, R-COLLA |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ACL-004 | P0 | Запрет: UI-имитации вместо серверных прав | реализовано | all routes call requirePage/requireSpace/canManagePeople server-side; client uses actions only for display; tests/integration/acl.test.ts A10 tests |  |

### EDITOR

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-EDITOR-003 | P0 | Запрет: терять содержимое при конвертации блоков | реализовано | apps/web/src/editor/convert.ts; setNode сохраняет атрибуты; tests/unit/editor-convert.test.ts:'R-EDITOR-003…', 'AT-64…'; tests/e2e/clipboard.spec.ts | tests/unit/editor-convert.test.ts: block conversion keeps content (R-EDITOR-003, R-EDITOR-067, AT-64)<br>tests/unit/editor-convert.test.ts: R-EDITOR-003: list, checklist, quote and callout conversions keep the text and the paragra<br>tests/e2e/clipboard.spec.ts: converting formatted text to a code block asks first and keeps the text (R-EDITOR-067, R-E |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-UI-009 | P0 | Запрет: скрывать ошибки | реализовано | fixed silent failure of sidebar "Новая страница" (unhandled rejection); tests/e2e/ui-p0-interaction.spec.ts "R-UI-009, R-UI-052: failed actions are shown…" (500 / 403 / network abort → visible toast) and "R-UI-009: no uncaught script errors occurred in any scenario above"; window error/unhandledrejection → lib/telemetry.ts; remaining .catch(() => undefined) are benign (telemetry, logout, storage.persist, service worker, best-effort cleanup) | tests/unit/ui-error-template.test.ts: error message template (R-UI-052, R-UI-009)<br>tests/e2e/ui-p0-interaction.spec.ts: R-UI-009, R-UI-052: failed actions are shown with what happened, that nothing was saved, a<br>tests/e2e/ui-p0-interaction.spec.ts: R-UI-009: no uncaught script errors occurred in any scenario above |

### QA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-QA-012 | P0 | Запрет: удалять тесты ради зелёного CI | процесс/документ | git history shows no deleted test files; CI runs every suite (.github/workflows/ci.yml); no written review rule |  |

### COLLAB

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-COLLAB-004 | P0 | Запрет: last-write-wins для конфликтующего содержимого | реализовано | apps/server/src/collab/hub.ts, apps/server/src/collab/ydoc.ts (CRDT, LWW не используется для содержимого); Свойства страницы (PATCH properties) без expectedVersion — фактически LWW по ключам; клиент expectedVersion не передаёт |  |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ACL-005 | P0 | Запрет: бесконтрольные публичные ссылки | реализовано | no public-link creation endpoint exists; org setting publicLinksEnabled=false by default (services/org.ts); Satisfied because public links are not implemented at all (see R-PUBLISH-009). |  |

### TREE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-TREE-004 | P0 | Запрет: ломать внутренние ID при переносах | реализовано | apps/server/src/services/pages.ts#movePage; tests/integration/core.test.ts (moves keep ids) | tests/integration/core.test.ts: moves keep ids, ancestors closure is consistent, order respected, undo restores (R-TREE-00 |

### OPS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-OPS-004 | P0 | Запрет: опасные миграции без backup/rollback | реализовано | Same guard as R-OPS-001 (BackupRequiredError) + SchemaTooNewError; tests/resilience/migrations.test.ts: pending migrations … refused until a fresh full backup is recorded; backup.sh unlocks them, the CLI enforces it too | tests/resilience/migrations.test.ts: every migration rolls back and re-applies step by step with data present; the application <br>tests/resilience/migrations.test.ts: an older release refuses to start against a newer schema instead of running on it (OPS-002<br>tests/resilience/migrations.test.ts: pending migrations on a database with data are refused until a fresh full backup is record |

### BACKUP

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-BACKUP-002 | P0 | Запрет: выпускать релиз без проверки реального восстановления | частично | CI runs tests/resilience/backup-restore.test.ts on every push; verify-backup.sh; No formal release gate requiring a production restore protocol | tests/resilience/backup-restore.test.ts: restores content, attachment bytes, history, permissions and the audit chain into a new in |

### PROCESS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PROCESS-017 | P0 | Запрет: выдавать моковые данные за production-реализацию | реализовано | apps/server/src/routes/admin.ts:436 test endpoint disabled in production; demo seed only via CLI |  |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-UI-010 | P1 | Человек открывает систему и интуитивно понимает, что делать | требует ручной проверки | n/a; usability test without training not performed |  |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ACL-006 | P0 | Никаких ежедневных ручных настроек доступа при создании статей | реализовано | createPage inherits parent/space rights; tests/integration/acl.test.ts: 20 child pages without ACL setup |  |

### EDITOR

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-EDITOR-004 | P1 | Кнопки, наведение, меню, выделение, копирование, DnD, масштаб, таблицы, вложения, восстановление ведут себя естественно … | требует ручной проверки | Tiptap-редактор, меню, DnD, viewer; UX-сравнение с эталонами — ручная оценка |  |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-UI-011 | P0 | Система сохраняет работу, объясняет состояние и позволяет исправить ошибку | частично | sync-status, offline banner, undo toasts, version restore; error template (R-UI-052) says whether data was saved; boot timeout screen with retry; cancel/status not verified for every operation |  |

### ADMIN

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ADMIN-001 | P1 | Администратор управляет подразделениями и пространствами, а не сотнями разрозненных ACL | частично | GroupsSection (departments/groups), space grants to groups (API); Departments managed in UI, spaces are not: no web UI to create spaces or to add groups/users to a space (SpacePage AccessTab is read-only; POST /api/v1/spaces and PUT /grants resourceType=space only via API). |  |

### PROCESS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PROCESS-018 | P0 | Продукт завершён только после доказанных проверок каждого критичного сценария | частично | see QA gaps; many critical scenarios lack passing tests |  |
| R-PROCESS-019 | P0 | Исторический корпус v2.7 реализуется полностью, кроме коллизий, разрешённых разделом B; повторения — подтверждение важности | процесс/документ | registry.yaml covers corpus; exists |  |

### COLLAB

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| D-01 | P0 | Подтверждённая операция не исчезает молча | реализовано | apps/server/src/collab/hub.ts; tests/resilience/crash-restart.test.ts, tests/resilience/db-connection-loss.test.ts | tests/resilience/db-connection-loss.test.ts: unacknowledged operations are never shown as saved and all of them persist after the datab |
| D-02 | P0 | Повторная доставка не дублирует | реализовано | apps/server/src/collab/hub.ts#acceptUpdate; tests/integration/collab.test.ts (re-delivered operation) | tests/integration/collab.test.ts: re-delivered operation is acknowledged once and not duplicated (D-02, E-03, UX23-214, R-CO<br>tests/resilience/crash-restart.test.ts: an operation persisted before the crash whose acknowledgement was lost is not duplicated o |
| D-03 | P0 | Ошибка одной операции не повреждает другие документы | реализовано | apps/server/src/collab/hub.ts#run (цепочка на документ), #reload; нет автотеста изоляции между документами | tests/resilience/storage-failure.test.ts: object storage failure on upload (SC-30, D-03)<br>tests/resilience/storage-failure.test.ts: blob area not writable → clean error, no orphan rows; retry after recovery stores the file<br>tests/resilience/storage-failure.test.ts: disk full while committing the object → clean error, resumable session marked failed; a ne<br>… ещё 1 |

### HISTORY

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| D-04 | P0 | История восстанавливает подтверждённые состояния | реализовано | apps/server/src/routes/revisions.ts; tests/integration/collab.test.ts |  |

### ARCHIVE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| D-05 | P0 | Удаление не уничтожает необратимо до истечения хранения | реализовано | tests/integration/core.test.ts: trash and restore a branch; retention purge respects legal hold (jobs/worker.ts) | tests/integration/core.test.ts: trash and restore a branch with children (D-05, SC-29, V17-F08, E-05, R-HISTORY-003, R-HIS |

### TREE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| D-06 | P0 | Перемещение сохраняет идентификаторы и ссылки | реализовано | apps/server/src/services/pages.ts#movePage; tests/integration/core.test.ts | tests/integration/core.test.ts: moves keep ids, ancestors closure is consistent, order respected, undo restores (R-TREE-00 |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| D-07 | P0 | Изменение прав не раскрывает закрытые данные | реализовано | apps/server/src/services/grants.ts setInheritance copies audience (nobody gains/loses), setGrant audience_change confirmation, movePage audience diff |  |

### BACKUP

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| D-08 | P0 | Резервная копия пригодна только после проверки восстановления | реализовано | verify-backup.sh sets backups.verify_status=ok only after restore; tests/resilience/backup-restore.test.ts | tests/resilience/backup-restore.test.ts: restores content, attachment bytes, history, permissions and the audit chain into a new in |

### IMPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| D-09 | P0 | Ошибка импорта не повреждает данные | реализовано | tests/integration/import-export.test.ts: rejects a corrupted DOCX … changes nothing | tests/integration/import-pipeline.test.ts: an infected file is rejected at upload, nothing is stored, and the rejection is audited (R<br>tests/integration/import-export.test.ts: rejects a corrupted DOCX with a clear error and changes nothing (SC-19, D-09) |

### COLLAB

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| D-10 | P0 | Пользователь получает достоверный статус сохранения | реализовано | packages/shared/src/collab-client.ts#setStatus, apps/web/src/components/page/SyncStatus.tsx; tests/integration/collab.test.ts | tests/integration/collab.test.ts: "saved" is reported only after the update is committed to the journal (E-13, D-10, R-COLLA<br>tests/resilience/db-connection-loss.test.ts: database connection loss during editing (SC-30, E-13, D-10)<br>tests/resilience/db-connection-loss.test.ts: requests during a database outage get 503 with a Russian message instead of 500 (R-OPS-006 |

### PROCESS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PROCESS-020 | P2 | Функциональная эквивалентность Notion/Confluence/Outline без воспроизведения чужих интерфейсов, кода и фирменных материалов | процесс/документ | own CSS/tokens, lucide icons (ISC); no formal asset/code provenance check |  |

### SPACE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-SPACE-001 | P0 | Организации/рабочие пространства, пространства знаний, древовидные разделы, папки и страницы | реализовано | PATCH /api/v1/admin/org + admin/OrgNameCard.tsx (organisation name), spaces CRUD (routes/spaces.ts) with UI creation (components/space/SpaceAccess.tsx CreateSpaceDialog, Sidebar «Новое пространство»), pages-as-sections CRUD; tests/integration/acl-p0.test.ts 'R-SPACE-001: organisation → space → section → page …'; tests/e2e/acl-p0-spaces.spec.ts; Sections are pages with children (no separate folder entity) — the tree treats any page as a folder. | tests/integration/acl-p0.test.ts: hierarchy CRUD (R-SPACE-001)<br>tests/integration/acl-p0.test.ts: R-SPACE-001: organisation → space → section → page: every level can be created, renamed an<br>tests/e2e/acl-p0-spaces.spec.ts: R-SPACE-001 R-SPACE-010 R-ADMIN-020: a space is created in the UI and a department gets ac |

### EDITOR

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-EDITOR-005 | P0 | Блочный редактор: форматирование, таблицы, изображения, код, схемы, ссылки, вложения, интерактивные элементы | реализовано | packages/shared/src/editor/extensions.ts; apps/web/src/editor/commands.tsx SLASH_COMMANDS; nodeviews/blocks.tsx, ImageView.tsx; Таблица/выноска/изображение покрыты E2E (tests/e2e/editor.spec.ts:'slash menu inserts a table and a callout; "> " creates a toggle'; tests/e2e/content.spec.ts:'image: upload via file chooser, resize presets, caption, full-screen viewer with zoom'); остальные типы без тестов |  |

### COLLAB

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-COLLAB-005 | P1 | Совместная работа, комментарии, упоминания, согласование и публикация, история и восстановление | частично | tests/e2e/collab.spec.ts, tests/e2e/content.spec.ts (комментарии), tests/integration/content.test.ts (mentions, publishing); Функции есть; согласование/публикация и упоминания покрыты только интеграционными тестами, не E2E |  |

### IMPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-IMPORT-002 | P0 | Импорт/экспорт DOCX и .md; импорт CSV и XLSX в табличные блоки/коллекции; пакетный ZIP с .md и медиа | реализовано | tests/integration/import-export.test.ts: DOCX, MD ZIP, CSV, XLSX tests; export tests |  |

### MEDIA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-MEDIA-002 | P2 | PNG/JPG/WebP/SVG — медиа/вложения, не самостоятельные форматы импортируемых документов | реализовано | importer.ts: изображения → вложения; PNG/JPG не принимаются как документы (unsupported) |  |

### CLIPBOARD

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-CLIPBOARD-001 | P0 | Копирование в буфер как text/plain и text/html, «Копировать Markdown», копирование блоков, разделов и ссылок | реализовано | ProseMirror copy (text/html + text/plain); clipboard/copy.tsx copyBlocks; clipboard/section.ts; BlockHandle «Копировать блок», «Копировать раздел», «Копировать ссылку на блок», «Копировать как Markdown»; tests/e2e/editor-p0-clipboard.spec.ts:'copy: a text selection, a block and a section of a heading go to the clipboard as text/html and text/plain (R-CLIPBOARD-001)'; tests/unit/editor-p0-clipboard.test.ts:'copying a section of a heading (R-CLIPBOARD-001)'; tests/e2e/clipboard.spec.ts (Markdown) | tests/unit/editor-p0-clipboard.test.ts: copying a section of a heading (R-CLIPBOARD-001)<br>tests/unit/editor-p0-clipboard.test.ts: R-CLIPBOARD-001: a section ends before the next heading of the same or a higher level and <br>tests/e2e/editor-p0-clipboard.spec.ts: copy: a text selection, a block and a section of a heading go to the clipboard as text/htm |

### OCR

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-OCR-001 | P1 | OCR изображений и скриншотов (русский и английский) с сохранением исходника и проверяемого результата | реализовано | apps/server/src/ocr/ocr.ts recognize (tesseract rus+eng); jobs/handlers.ts ocr; tests/integration/content.test.ts:'recognises Russian and English text on a screenshot…' | tests/integration/content.test.ts: OCR (R-OCR-001, R-OCR-007, R-OCR-011, SC-22, §8) |

### ADMIN

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ADMIN-002 | P1 | Поиск, версии, права, аудит, резервное копирование, импорт/экспорт, администрирование, API | реализовано | all modules present; OpenAPI at /api/v1/openapi.json |  |

### PROCESS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PROCESS-021 | P2 | Исключено: CRM, задачи, канбан, тайм-трекинг, склад, закупки, финансы, мессенджер, почта, BPM; табличные коллекции входят | процесс/документ | no CRM/tasks/kanban modules in apps/server/src; respected |  |

### IMPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-IMPORT-003 | P2 | Исключено: полноценный настольный Word и пиксель-в-пиксель восстановление вёрстки Word | реализовано | Semantic model via mammoth + htmlToDoc; no layout reproduction |  |

### EXPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-EXPORT-003 | P2 | Исключено: PDF, HTML и ODT как форматы импорта/экспорта документов; XLSX только для табличных данных | заменено | overridden_by R-EXPORT-001 |  |

### SEARCH

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-SEARCH-001 | P2 | Генерация внешним ИИ не обязательна; OCR обязателен; интеллектуальные подсказки — опциональный модуль | реализовано | apps/server/src/ocr/ocr.ts |  |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ACL-007 | P1 | Роль «Читатель»: ищет, читает, копирует, скачивает по разрешению | реализовано | level view: actions view/export/download subject to flags & space policy (packages/shared/src/permissions.ts actionsFor); No dedicated role-matrix test. |  |
| R-ACL-008 | P1 | Роль «Автор»: черновики, редактирование, загрузка документов и изображений | реализовано | level edit: edit/create/upload (ACTION_MIN_LEVEL), attachments upload requires edit |  |
| R-ACL-009 | P1 | Роль «Редактор»: структурирует, актуализирует, управляет публикацией пространства | частично | level edit + publish/manage_structure; canPublish flag; No distinct "Editor" role separate from Author: both are level edit, publish distinguished only via per-grant canPublish flag. |  |
| R-ACL-010 | P1 | Роль «Владелец пространства»: участники, шаблоны, структура | частично | level full on space -> manage_space/share; templates API; tree structure; Members management for space owners has no UI: no web UI to create spaces or to add groups/users to a space (SpacePage AccessTab is read-only; POST /api/v1/spaces and PUT /grants resourceType=space only via API). |  |
| R-ACL-011 | P1 | Роль «Администратор организации»: SSO, политики, пользователи, журналы, резервное копирование | реализовано | org roles owner/admin: OrgSettingsSection (MFA, SSO-only, guests, public links, retention), UsersSection, AuditSection, ArchivesSection; SSO configured via env (OIDC_*), not in UI. |  |
| R-ACL-012 | P0 | Роль «Аудитор»: просматривает доступные версии, публикации и журнал без редактирования | реализовано | orgRole auditor: canReadAudit only, no content grants implied (acl/engine.ts isOrgAdmin/canReadAudit); No test for auditor role. |  |

### TREE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-TREE-005 | P0 | Иерархия Organization → Workspace → Space → Page с неограниченной вложенностью и API-лимитом глубины 15, смена уровня без потери ссылок | частично | apps/server/src/services/pages.ts#assertDepth (create/move/duplicate), apps/server/src/services/importer.ts (проверка плана); tests/integration/history-tree.test.ts; Лимит 15 уровней с понятной ошибкой реализован и тестируется; отдельной сущности Workspace нет (организация = рабочее пространство) | tests/integration/history-tree.test.ts: nesting limit (R-TREE-005, R-TREE-001)<br>tests/integration/history-tree.test.ts: allows 15 levels and rejects a 16th on create, move, duplicate and import with a clear err |

### PAGE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PAGE-001 | P0 | Страница: неизменный UUID, название, slug, обложка, иконка, блоки, статус, владелец, автор, время, теги, версия, права, публикация … | частично | apps/server/migrations/0001_core.sql (pages); Нет slug и тегов; остальное есть |  |

### PUBLISH

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PUBLISH-001 | P1 | Статусы: черновик → на согласовании → опубликовано → архивировано; возврат на доработку; согласование отключаемо per workspace | реализовано | pages.status draft/review/published/archived; submit-review/decide(reject->draft)/publish/archive routes (routes/revisions.ts); space policy requireApproval; PublishBar |  |

### PAGE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PAGE-002 | P1 | Типы связей: родитель–дочерняя, ссылка, обратная ссылка, упоминание, вложение, якорь блока, связанная страница | частично | apps/server/src/jobs/worker.ts#indexPage (page_links), apps/server/src/routes/pages.ts backlinks; Нет типа «связанная страница»; page_links не различает ссылку и упоминание (kind всегда link) |  |
| R-PAGE-003 | P0 | Постоянный URL по ID/slug; переименование и перенос не разрывают ссылки; иерархия не заменяет поиск | реализовано | apps/web/src/pages/PageView.tsx (/p/:id); Только ID, без slug |  |

### ARCHIVE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ARCHIVE-001 | P0 | Мягкое удаление с корзиной и восстановлением 90 дней (настраивается); окончательное удаление по политике и праву | реализовано | RETENTION_TRASH_DAYS=90 + org retention settings, worker purge, DELETE /api/v1/trash/:id; tests/integration/gaps.test.ts: trash rows include … purgeAt |  |

### TEMPLATES

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-TEMPLATES-001 | P2 | Шаблоны — страницы с параметрами-заполнителями, версионируемые отдельно | частично | apps/server/src/routes/templates.ts; template_versions; Параметров-заполнителей нет; API просмотра/восстановления версий шаблона нет |  |

### TREE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-TREE-006 | P1 | Левое дерево пространств и разделов: поиск по дереву, раскрытие, DnD, избранное, недавние | частично | apps/web/src/layout/SidebarTree.tsx, apps/web/src/layout/Sidebar.tsx; Нет поиска по дереву и «Недавних» в боковой панели (недавние только в Ctrl+K) |  |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-UI-012 | P1 | Центральная зона главной: поиск, закреплённые, последние изменения, популярные и назначенные к актуализации | частично | pages/Home.tsx: quick search link, Избранное, Недавние/Обновлённые, Требуют пересмотра; no "popular" block |  |
| R-UI-013 | P1 | Верхняя панель: глобальный поиск, «Создать», уведомления, профиль, переключатель пространства | частично | layout/Sidebar.tsx: Поиск (Ctrl+K), Новая страница, Входящие, profile menu; no top bar; no explicit space switcher |  |
| R-UI-014 | P1 | Правая контекстная панель без сужения контента: оглавление, свойства, комментарии, история, связанные | частично | apps/web/src/styles/editor.css .right-panel 380px flex sibling; PageView panels comments/history/info; panel shrinks the main column; no TOC/related tabs in panel |  |
| R-UI-015 | P1 | Сохранение раскрытых папок, ширины панелей и последнего пространства между сессиями | частично | state/ui.ts localStorage: expanded, sidebarWidth, rightPanel; last space not persisted; no server mirroring; untested |  |

### PAGE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PAGE-004 | P1 | Экран страницы: заголовок, крошки, автор/обновление, статус, метки, действия Поделиться/Копировать/Экспорт/История/… | частично | apps/web/src/pages/PageView.tsx; Нет меток (тегов) на экране страницы |  |

### EDITOR

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-EDITOR-006 | P1 | Режим чтения чистый и быстрый; редактирование WYSIWYG без «сырой» формы | реализовано | apps/web/src/pages/PageView.tsx (PublishedView/DocPreview); нет raw-режима |  |

### LAYOUT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-LAYOUT-001 | P2 | Переключатели «Широкая страница», «Фокус», «Показать оглавление», «Светлая/тёмная тема» | частично | PageView menu "Широкая страница" (per page), theme menu in Sidebar/Settings, TOC block; no Focus mode, no "show TOC" toggle |  |

### PAGE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PAGE-005 | P1 | Якоря у заголовков и блоков; копирование ссылки в одно действие | реализовано | apps/web/src/editor/menus/BlockHandle.tsx («Копировать ссылку на блок»), ?block= |  |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-UI-016 | P1 | Состояния: пустая страница, нет доступа, нет сети, импортируется, нет результатов — с ясным действием | частично | PageView PageError (no access/offline + retry), App offline screen, empty-state (16 uses), ImportPage progress; states not tested; "no results"/"importing" CTA not verified |  |
| R-UI-017 | P2 | Экраны: поиск с фильтрами, версии и сравнение, корзина, редактор шаблонов, права, центр импорта/экспорта, профиль, аудит, админка | частично | routes: search, history+diff panel, trash, templates, ShareDialog, ImportPage, settings, admin audit; export centre is only a per-page dialog |  |
| R-UI-018 | P1 | Малые экраны: дерево в выдвижной панели, клавиатурные действия, горизонтальная прокрутка таблиц, одинаковая семантика функций | частично | AppShell drawer ≤860px; .tableWrapper overflow-x; tests/e2e/mobile.layout.spec.ts (Pixel 7, 412px); mobile E2E not at 375px; only overflow checked at 375 in visual spec |  |

### EDITOR

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-EDITOR-007 | P0 | Параграф, H1–H6, вводный текст, цитаты, разделитель, типографские переносы | реализовано | commands.tsx SLASH_COMMANDS h1–h6, lead, quote, divider; styles/editor.css hyphens:auto для текста (словарь по <html lang="ru">); tests/e2e/editor-p0-blocks.spec.ts:'text blocks: paragraph, H1–H6, lead, quote and divider are created from the "/" menu; body text is hyphenated (R-EDITOR-007)' | tests/e2e/editor-p0-blocks.spec.ts: text blocks: paragraph, H1–H6, lead, quote and divider are created from the "/" menu; body |
| R-EDITOR-008 | P0 | Inline: жирный, курсив, подчёркнутый, зачёркнутый, верхний/нижний индекс, inline code, цвет текста/фона, маркер | реализовано | packages/shared/src/editor/extensions.ts (Underline/Sub/Sup/Code/Color/Highlight); apps/web/src/editor/menus/BubbleToolbar.tsx; Жирный проверен E2E; остальные стили без тестов |  |
| R-EDITOR-009 | P0 | Нумерованные, маркированные, многоуровневые списки, чек-листы с реальным состоянием | реализовано | packages/shared/src/editor/extensions.ts TaskItem nested, BulletList/OrderedList; tests/e2e/editor.spec.ts:'create page, type with Markdown shortcuts, …survives reload' (список переживает reload); состояние чек-листа без теста |  |
| R-EDITOR-010 | P1 | Ссылки, внутристраничные якоря, ссылки на страницы, упоминания сотрудников, теги | частично | links.ts PageMention/UserMention; apps/web/src/editor/menus/BlockHandle.tsx «Копировать ссылку на блок»; suggest.tsx @ и [[; Тегов в редакторе нет |  |
| R-EDITOR-011 | P1 | Клавиатурные сочетания, отмена/повтор, множественное выделение, доступное контекстное меню | частично | apps/web/src/editor/extensions/blockOps.ts BlockOps keyboard; Menu (role=menu); Нет множественного выделения блоков; тестов клавиатурного управления нет |  |

### TABLE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-TABLE-003 | P0 | Таблицы: строки/столбцы, перемещение, ширина, выравнивание, merge/split, заголовок, диапазон, копирование диапазона, вставка из Excel … | реализовано | apps/web/src/editor/tableOps.ts (перемещение строк/столбцов, сортировка; Alt+Shift+стрелки и меню «Таблица»); menus/TableToolbar.tsx; extensions/paste.ts (Ctrl+C диапазона ячеек → TSV); tests/unit/editor-table-ops.test.ts:'table operations (R-TABLE-003)'; tests/e2e/editor-p0-table.spec.ts:'table structure: insert/delete rows and columns, header row/column, merge and split, alignment, column width (R-TABLE-003)', 'table data: copy a cell range as TSV, paste a range from Excel, move rows and columns, sort by a column (R-TABLE-003)'. Найден и исправлен дефект: Ctrl+C диапазона ячеек давал text/plain без табуляций | tests/unit/editor-table-ops.test.ts: table operations (R-TABLE-003)<br>tests/e2e/editor-p0-table.spec.ts: table structure: insert/delete rows and columns, header row/column, merge and split, align<br>tests/e2e/editor-p0-table.spec.ts: table data: copy a cell range as TSV, paste a range from Excel, move rows and columns, sor |

### EDITOR

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-EDITOR-012 | P1 | Callout предупреждение/примечание/успех с иконкой и цветом; toggle; вкладки — необязательно | реализовано | nodes/callout.ts CALLOUT_VARIANTS; blocks.tsx CalloutView; Details; tests/e2e/editor.spec.ts:'slash menu inserts a table and a callout; "> " creates a toggle' |  |
| R-EDITOR-013 | P1 | Блок кода с языком, подсветкой, кнопкой «Копировать»; без выполнения кода | реализовано | CodeBlockLowlight; blocks.tsx CodeBlockView (язык, «Копировать»); Код не исполняется (только подсветка); без теста |  |

### MEDIA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-MEDIA-003 | P1 | Изображения: подпись, alt, размер, выравнивание, увеличение, замена; галерея | частично | apps/web/src/editor/nodeviews/ImageView.tsx caption/alt/width/align/replace; Отдельного блока «галерея» нет (только колонки/листание во viewer) |  |

### FILES

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-FILES-001 | P1 | Вложения как безопасные ссылки с названием и размером; ссылка-превью; встроенный документ по постоянной ссылке без дублирования | частично | media.ts FileBlock; blocks.tsx FileView; EmbedView (link card); Ссылка-превью без метаданных (OG); встраивания документа по постоянной ссылке нет |  |

### EDITOR

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-EDITOR-014 | P2 | Mermaid как редактируемый исходник с безопасным превью; DOCX-экспорт — изображение+исходник, MD — fenced-блок | частично | nodes/special.ts Mermaid; blocks.tsx MermaidView securityLevel strict; markdown.ts fenced mermaid; DOCX-экспорт кладёт только исходник, без изображения (docx-export.ts case mermaid) |  |
| R-EDITOR-015 | P2 | Автоматическое оглавление по заголовкам и блок «Связанные страницы» | реализовано | special.ts TableOfContentsBlock + TocView (обновление по update); PageView Backlinks; Без тестов |  |
| R-EDITOR-016 | P2 | Формулы LaTeX inline/block как расширяемая функция | реализовано | @tiptap/extension-mathematics InlineMath/BlockMath; Editor.tsx MathDialog (KaTeX); Без тестов |  |
| R-EDITOR-017 | P0 | Enter — ожидаемый блок; Shift+Enter — перенос строки; Tab/Shift+Tab — вложенность списка или переход по таблице | реализовано | StarterKit/ListKeymap/Table keymaps (Enter, Shift+Enter, Tab); Только Enter в E2E; матрицы клавиш нет |  |
| R-EDITOR-018 | P1 | «/» — поиск блоков по названию и синонимам; «@» — упоминания; «[[» — ссылки на страницы | реализовано | apps/web/src/editor/extensions/suggest.tsx slash/mention/pageLink; commands.tsx filterCommands (синонимы, раскладка); tests/e2e/editor.spec.ts:'slash menu inserts a table and a callout; "> " creates a toggle' |  |
| R-EDITOR-019 | P1 | Плавающая панель при выделении, «+» и drag-handle, клавиатурный аналог DnD | реализовано | apps/web/src/editor/menus/BubbleToolbar.tsx; apps/web/src/editor/menus/BlockHandle.tsx (DragHandle, «+»); apps/web/src/editor/extensions/blockOps.ts Alt+Shift+↑/↓; Без тестов |  |
| R-EDITOR-020 | P1 | Перемещение, дублирование, преобразование типа, копирование блока, сворачивание секций | частично | apps/web/src/editor/extensions/blockOps.ts moveBlock/duplicateBlock; apps/web/src/editor/menus/BlockHandle.tsx; Нет сворачивания секций по заголовкам; «копирование блока» только как Markdown/ссылка |  |

### MEDIA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-MEDIA-004 | P1 | Вставка изображений перетаскиванием, из буфера и через диалог с ясным прогрессом | реализовано | apps/web/src/editor/extensions/uploads.ts handleDrop/handlePaste, widget с прогрессом; Editor.tsx file input; tests/e2e/content.spec.ts:'image: upload via file chooser, resize presets, caption, full-screen viewer with zoom' |  |

### EDITOR

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-EDITOR-021 | P0 | IME, кириллица, русские кавычки, emoji, длинные URL, текст 100 000+ символов | реализовано | ProseMirror/Tiptap; extensions/paste.ts (вставка — отдельный шаг Undo); StableSelection; tests/e2e/editor-p0-core.spec.ts:'IME composition commits once…(E221, R-EDITOR-021, R-EDITOR-053)', 'Cyrillic, Russian quotes, emoji and a very long URL…', 'a document of 100 000+ characters (50+ pages pasted at once) stays editable…' | tests/e2e/editor-p0-core.spec.ts: IME composition commits once, coexists with a colleague typing and autosave, and undo reve<br>tests/e2e/editor-p0-core.spec.ts: Cyrillic, Russian quotes, emoji and a very long URL are typed, saved and laid out correctl<br>tests/e2e/editor-p0-core.spec.ts: a document of 100 000+ characters (50+ pages pasted at once) stays editable: caret after t |
| R-EDITOR-022 | P0 | Выделение и курсор не прыгают при автосохранении или совместном редактировании | реализовано | apps/web/src/editor/extensions/stableSelection.ts (исправлен дефект @tiptap/y-tiptap 3.0.x: курсор оставался на прежнем смещении, когда соавтор печатал перед ним в том же абзаце); tests/e2e/editor-p0-core.spec.ts:'caret and selection stay in place while a colleague edits, during autosave and after a network failure (R-EDITOR-022, R-EDITOR-001)' | tests/e2e/editor-p0-core.spec.ts: caret and selection stay in place while a colleague edits, during autosave and after a net |

### CLIPBOARD

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-CLIPBOARD-002 | P0 | Действия: копировать выделение, страницу с форматированием, как текст, Markdown, ссылку на страницу, ссылку на блок, таблицу, код | реализовано | PageView «Копировать страницу» (с форматированием / как текст / Markdown) → apps/web/src/editor/clipboard/copy.tsx copyPage; apps/web/src/editor/menus/BlockHandle.tsx; apps/web/src/editor/menus/TableToolbar.tsx; CodeBlockView; tests/e2e/clipboard.spec.ts:'page menu copies the page…' | tests/e2e/clipboard.spec.ts: page menu copies the page with formatting, as text and as Markdown (R-CLIPBOARD-002, R-CLI |
| R-CLIPBOARD-003 | P0 | Ctrl/Cmd+C/V работают без перехвата в неуместном контексте; выделение не теряется | реализовано | AppShell.tsx перехватывает только Mod+K/Mod+Shift+P/Mod+\ вне полей; SmartPaste только в редакторе |  |
| R-CLIPBOARD-004 | P0 | «С форматированием» пишет text/plain и безопасный text/html; вставка в Word/почту сохраняет H1–H6, списки, стили, ссылки, таблицы … | ограничение окружения | apps/web/src/editor/extensions/paste.ts SmartPaste clipboardSerializer → apps/web/src/editor/clipboard/html.ts cleanCopiedDom (абсолютные URL, без якорей комментариев/id); apps/web/src/editor/clipboard/copy.tsx copyPage (text/html + text/plain); tests/e2e/clipboard.spec.ts; tests/unit/clipboard-html.test.ts. Вставка в MS Word здесь не проверяема | tests/unit/clipboard-html.test.ts: copied HTML (R-CLIPBOARD-004, R-CLIPBOARD-018)<br>tests/e2e/clipboard.spec.ts: page menu copies the page with formatting, as text and as Markdown (R-CLIPBOARD-002, R-CLI |
| R-CLIPBOARD-005 | P0 | «Markdown» — корректная UTF-8 строка с заголовками, списками, таблицами, ссылками, code fences | реализовано | packages/shared/src/editor/markdown.ts docToMarkdown; tests/unit/markdown.test.ts:'writes readable markdown…', 'round-trips…', property 'text is never lost' |  |
| R-CLIPBOARD-006 | P1 | Таблица копируется также как TSV; код — только исходник без кнопок и номеров строк | реализовано | apps/web/src/editor/extensions/paste.ts SmartPaste clipboardTextSerializer (диапазон ячеек → TSV); apps/web/src/editor/menus/TableToolbar.tsx TSV+HTML; CodeBlockView; tests/e2e/clipboard.spec.ts:'table copy for Excel…' | tests/e2e/clipboard.spec.ts: table copy for Excel puts TSV and an HTML table on the clipboard (R-CLIPBOARD-006, R-CLIPB |
| R-CLIPBOARD-007 | P1 | Копирование изображения — оригинал или URL по правам; отказ не выглядит как успешная операция | не реализовано | —; Команды «копировать изображение» нет |  |
| R-CLIPBOARD-008 | P1 | Уведомление только после успешной записи в clipboard; при запрете API — выделяемый текст для штатного копирования | реализовано | apps/web/src/editor/clipboard/copy.tsx copyWithFeedback (тост только после записи; при отказе — ошибка и диалог с выделенным текстом); tests/e2e/clipboard.spec.ts:'refused clipboard access…' | tests/e2e/clipboard.spec.ts: refused clipboard access shows an error and the text for manual copying, not a false succe |
| R-CLIPBOARD-009 | P0 | Санитизация внешнего HTML; варианты «Сохранить форматирование», «Объединить», «Только текст» | реализовано | clipboard/html.ts cleanPastedHtml (allowlist); extensions/pasteOptions.ts + menus/PasteOptionsMenu.tsx («Сохранить форматирование», «Объединить», «Только текст», Esc); tests/unit/clipboard-html.test.ts; tests/unit/editor-p0-clipboard.test.ts:'paste options (R-CLIPBOARD-009)'; tests/e2e/editor-p0-clipboard.spec.ts:'paste options: «Сохранить форматирование», «Объединить», «Только текст»; scripts and trackers removed (R-CLIPBOARD-009, R-CLIPBOARD-024)' | tests/unit/clipboard-html.test.ts: paste sanitizer (R-CLIPBOARD-009, R-CLIPBOARD-010, R-CLIPBOARD-022)<br>tests/unit/clipboard-html.test.ts: R-CLIPBOARD-009: Google Docs bold wrapper with font-weight:normal does not make everything<br>tests/unit/editor-p0-clipboard.test.ts: paste options (R-CLIPBOARD-009)<br>… ещё 3 |
| R-CLIPBOARD-010 | P0 | Вставка из Word, Google Docs, веб, другого экземпляра без скриптов, мусора и потерянных ячеек | реализовано | apps/web/src/editor/clipboard/html.ts cleanPastedHtml + convertWordLists; Фикстуры Word и Google Docs: tests/unit/clipboard-html.test.ts; tests/e2e/clipboard.spec.ts:Word paste… | tests/unit/clipboard-html.test.ts: paste sanitizer (R-CLIPBOARD-009, R-CLIPBOARD-010, R-CLIPBOARD-022)<br>tests/unit/clipboard-html.test.ts: R-CLIPBOARD-010: Word HTML loses Office junk but keeps headings, text, tables (no lost cel |
| R-CLIPBOARD-011 | P2 | Мобильные альтернативы запрещённым платформой clipboard-функциям | реализовано | apps/web/src/editor/clipboard/copy.tsx — диалог с выделенным текстом для ручного копирования (работает и на мобильных); Проверено в Chromium; на реальных устройствах не проверялось |  |

### IMPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-IMPORT-004 | P1 | DnD одного/нескольких файлов, диалог, предпросмотр, целевой раздел, режим новая/дочерняя/обновить с версией | частично | apps/web/src/pages/ImportPage.tsx (drop zone, multi-file, LocationPicker target/parent, preview); server modes new/update/append (commitIntoPage); UI always uses mode "new"; update-with-version not exposed |  |
| R-IMPORT-005 | P1 | Показ заголовков, количества блоков/таблиц/изображений, предупреждений; отмена до публикации | частично | planSummary stats (blocks/tables/images), per-file warnings, cancel (ImportPage); UI not e2e-tested |  |
| R-IMPORT-006 | P0 | Массовый импорт .md, .docx, ZIP с вложениями; защита от ZIP-bomb и небезопасных путей | реализовано | tests/integration/import-export.test.ts: rejects zip-slip paths and zip bombs | tests/integration/import-pipeline.test.ts: an infected asset inside a ZIP is found after extraction; a clean file in the same upload <br>tests/integration/import-export.test.ts: rejects zip-slip paths and zip bombs before extracting (SC-19, AT-69, R-IMPORT-006, R-IMPO |
| R-IMPORT-007 | P0 | DOCX: заголовки, текст, стили, списки, таблицы/merge, ссылки, изображения, подписи, разделители, колонтитулы/сноски | реализовано | convert/docx-import.ts restructureDocxHtml/preprocessDocx: captions → image caption, footnotes/endnotes → [n] + «Сноски», headers/footers → collapsed block, bordered paragraphs → separators, bookmarks → anchors, TOC field → TOC block; tests/integration/io-p0-import.test.ts: Word captions, footnotes, three numbering levels, headers/footers…; reference corpus …; tests/e2e/io-p0-roundtrip.spec.ts: DOCX import → edit…; Fixtures are generated with the docx library in Word style (built-in style names, numbering.xml, footnotes, header/footer parts); no binary authored in Microsoft Word is checked in | tests/integration/io-p0-import.test.ts: Word captions, footnotes, three numbering levels, headers/footers, bookmarks and the TOC f<br>tests/integration/io-p0-import.test.ts: Word-style DOCX with headings, 3 list levels, links, 2 tables, images and code → import → <br>tests/integration/import-export.test.ts: imports headings, nested lists, merged tables and images with a report; original kept (R-I |
| R-IMPORT-008 | P1 | Исходный DOCX сохраняется как артефакт импорта (по политике); контент в каноническую модель | реализовано | tests/integration/import-export.test.ts: import-source attachment regl.docx | tests/integration/import-export.test.ts: imports headings, nested lists, merged tables and images with a report; original kept (R-I |
| R-IMPORT-009 | P0 | Сложные фигуры, SmartArt, поля → изображение или отчёт о совместимости; молчаливая потеря запрещена | реализовано | preprocessDocx keeps field results and SmartArt node text in place; inspectDocx reports smartart/shapes/fields/floating/track-changes/comments; original file kept as import-source; tests/integration/io-p0-import.test.ts: complex Word constructs … keep their text and are listed in the compatibility report; Complex graphics are reported (not rasterised); the requirement allows "image or compatibility report" | tests/integration/io-p0-import.test.ts: complex Word constructs (SmartArt, text boxes, fields, floating objects, tracked changes,  |

### SECURITY

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-SECURITY-001 | P0 | Отключить макросы и внешние связи DOCX; запрещать активный контент | реализовано | DOCX via mammoth (no execution), macro warning (convert/docx-import.ts inspectDocx); sanitize-html; Macro detection only scans document.xml (vbaProject.bin part not detected); no macro fixture test. |  |

### IMPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-IMPORT-010 | P0 | CommonMark и GFM: заголовки, параграфы, списки, task lists, цитаты, таблицы, code fences, изображения, ссылки | реализовано | tests/unit/markdown.test.ts: parses GFM structure; tests/integration/import-export.test.ts: task list, table | tests/integration/io-p0-import.test.ts: Markdown ZIP with a GFM table, task list, code and relative images → import → ZIP export →<br>tests/integration/import-export.test.ts: imports a folder tree with relative images and cross-links; links become internal (R-IMPOR |
| R-IMPORT-011 | P0 | Относительные пути только внутри ZIP/папки; вложения сохраняются, ссылки переписываются на постоянные URL | реализовано | tests/integration/import-export.test.ts: links become internal /p/<id>, images → attachments | tests/integration/import-export.test.ts: imports a folder tree with relative images and cross-links; links become internal (R-IMPOR |
| R-IMPORT-012 | P2 | YAML front matter в метаданные по явной схеме; неизвестные поля сохраняются и в отчёте | частично | markdownToDoc front matter → page properties (frontMatterProps); No explicit schema; unknown fields not listed in the report |  |
| R-IMPORT-013 | P1 | Недоступные ссылки и файлы — предупреждение, а не бесследное удаление | реализовано | tests/integration/import-export.test.ts: unused-files warning; tests/unit/markdown.test.ts: reports missing assets | tests/integration/import-export.test.ts: imports a folder tree with relative images and cross-links; links become internal (R-IMPOR |
| R-IMPORT-014 | P1 | Частично несовместимые документы импортируются с отчётом и обратимой копией оригинала | реализовано | Originals of DOCX/MD/ZIP/HTML/CSV/XLSX attached as import-source to the page created from them; tests/integration/import-pipeline.test.ts: original MD, ZIP and CSV attached | tests/integration/import-pipeline.test.ts: import job stage log and kept originals (R-IMPORT-032, R-IMPORT-014, R-IMPORT-042, R-IMPOR<br>tests/integration/import-pipeline.test.ts: the original MD, ZIP and CSV files are attached to the imported page for the author (R-IMP |

### EXPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-EXPORT-004 | P1 | Экспорт DOCX одной страницы, ветки и набора; отдельные файлы или общий документ с оглавлением | частично | GET /pages/:id/export?format=docx&children=true (merged single document), POST /api/v1/exports pageIds; No "separate files" mode for a set; automatic TOC for merged document not verified |  |
| R-EXPORT-005 | P1 | DOCX: стили Heading 1–6, текст, списки, таблицы, hyperlinks, медиа, подписи, код моноширинным, авторство и дата версии | частично | convert/docx-export.ts (HeadingLevel 1–6, lists, tables, hyperlinks, images, captions, monospace code, creator=author); Styles not asserted in tests; version date not written |  |
| R-EXPORT-006 | P0 | DOCX открывается без ошибок в Microsoft Word и LibreOffice с редактируемой структурой | ограничение окружения | convert/docx-validate.ts: Open XML package/schema validation (content types, relationships, well-formedness, element order Word enforces, unique drawing ids, numbering/bookmarks); every exported DOCX is validated (fail closed); tests/integration/io-p0-export.test.ts: exported DOCX with every block type passes Open XML … opens in LibreOffice; corrupted packages are detected; tests/integration/io-p0-import.test.ts: … DOCX export valid for Word (Open XML) and LibreOffice; Everything automatable is done; opening in real Microsoft Word is not possible in this Linux CI environment (manual check per release) | tests/integration/io-p0-export.test.ts: DOCX validity (R-EXPORT-006)<br>tests/integration/io-p0-export.test.ts: exported DOCX with every block type passes Open XML package/schema validation and opens in<br>tests/integration/io-p0-export.test.ts: docToDocx output for imported-style content keeps anchors as bookmarks and internal links <br>… ещё 3 |
| R-EXPORT-007 | P1 | Mermaid и нестандартные блоки — изображение/текст и запись о конвертации; обязательный отчёт при потере семантики | частично | docx-export.ts warns for mermaid/toggle; export-report.md in MD ZIP; x-export-warnings header; Mermaid exported as source text, not image |  |
| R-EXPORT-008 | P0 | Экспорт .md как UTF-8, LF, GFM; с медиа — ZIP с index.md и assets/ с корректными относительными путями | реализовано | tests/integration/import-export.test.ts: branch export to Markdown ZIP: index.md, assets/, relative links, checksums | tests/integration/import-export.test.ts: branch export to Markdown ZIP: readable tree, relative links, assets, checksums, report (R |
| R-EXPORT-009 | P1 | Одна страница без вложений — прямой .md; с вложениями — ZIP или «MD со ссылками на сервер» с предупреждением | частично | exporter.ts: single page without assets → .md, otherwise ZIP; No "MD with links to server" mode with warning | tests/integration/import-export.test.ts: branch export to Markdown ZIP: readable tree, relative links, assets, checksums, report (R |

### CLIPBOARD

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-CLIPBOARD-012 | P1 | Копирование Markdown в буфер без предварительного скачивания | реализовано | Editor.tsx onCopyMd (Mod+Shift+C), BlockHandle «Копировать как Markdown»; Без теста |  |

### EXPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-EXPORT-010 | P1 | Сложные таблицы, комментарии и ACL не в GFM: режим совместимости и уведомление; оригинал не меняется | реализовано | shared markdown.ts warnings (table-html, table-cell-format, …); tests/unit/markdown.test.ts: writes readable markdown and reports degradations |  |
| R-EXPORT-011 | P0 | Экспорт строго под правом export, включая пакетные операции и ссылки на вложения | реализовано | tests/integration/import-export.test.ts: export respects rights …; tests/integration/acl-gaps.test.ts: a finished export cannot be downloaded after access was revoked | tests/integration/import-export.test.ts: export respects rights: no export permission => 403; private pages never leak into branch  |
| R-EXPORT-012 | P0 | Матрица: заголовки/стили/списки/ссылки — DOCX и MD импорт/экспорт с семантическим сохранением | реализовано | tests/integration/io-p0-import.test.ts: inline formatting … survives DOCX export → import and is present in HTML export; Word-style DOCX … structure preserved (quotes now exported with Word Quote style); tests/e2e/io-p0-roundtrip.spec.ts: DOCX import → edit … DOCX and Markdown export | tests/integration/io-p0-import.test.ts: Word-style DOCX with headings, 3 list levels, links, 2 tables, images and code → import → <br>tests/integration/io-p0-import.test.ts: formatting through DOCX and HTML (R-EXPORT-012, R-EXPORT-025)<br>tests/integration/io-p0-import.test.ts: inline formatting (bold, italic, underline, strike, code, sub/sup, highlight, colour, link<br>… ещё 3 |
| R-EXPORT-013 | P0 | Матрица: простые таблицы DOCX/MD с сохранением ячеек | реализовано | tests/integration/import-export.test.ts: tables in MD export and DOCX import | tests/integration/import-export.test.ts: exports a page to MD/DOCX/HTML/PDF; DOCX opens in LibreOffice; MD round-trips (R-EXPORT-00 |
| R-EXPORT-014 | P1 | Матрица: объединённые ячейки — DOCX да, MD ограниченно с явным отчётом о деградации | реализовано | tests/integration/import-export.test.ts: merged cells survive DOCX (colspan=2); MD writes HTML table with table-html warning | tests/integration/import-export.test.ts: imports headings, nested lists, merged tables and images with a report; original kept (R-I |
| R-EXPORT-015 | P0 | Матрица: изображения DOCX/MD (assets) без потери оригинала | реализовано | tests/integration/import-export.test.ts: assets/pic.png in MD ZIP; tests/integration/archive.test.ts: attachment sha256 equal after restore; DOCX embeds images (not byte-identical by design) | tests/integration/import-export.test.ts: branch export to Markdown ZIP: readable tree, relative links, assets, checksums, report (R |
| R-EXPORT-016 | P1 | Матрица: код — язык и содержимое сохраняются в DOCX и MD | частично | tests/integration/import-export.test.ts: ```js preserved in MD; Code language in DOCX not preserved/verified | tests/integration/import-export.test.ts: exports a page to MD/DOCX/HTML/PDF; DOCX opens in LibreOffice; MD round-trips (R-EXPORT-00 |
| R-EXPORT-017 | P1 | Матрица: toggle, callout — адаптация, контент не пропадает | реализовано | docx-export.ts callout/toggle adaptation; MD callouts [!WARNING] (tested), details→toggle (unit) |  |
| R-EXPORT-018 | P2 | Матрица: Mermaid — DOCX изображение+исходник, MD исходник; исходник редактируем | частично | DOCX/MD keep Mermaid source; No rendered image in DOCX |  |
| R-EXPORT-019 | P2 | Матрица: комментарии, версии, права не входят в переносимый контент; только в системе/аудите | реализовано | exporter.ts exports content only; comments/ACL only in admin archive metadata/ |  |

### OCR

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-OCR-002 | P1 | Действия на изображении: распознать, скопировать распознанное, вставить в документ, найти по тексту, повторить | частично | components/OcrDialog.tsx (распознать заново, копировать, исправить); поиск по OCR (jobs/worker.ts indexPage); Нет «вставить в документ» |  |
| R-OCR-003 | P1 | Источники OCR: системный буфер, DnD, медиа в DOCX, PNG/JPEG/WebP, скриншоты | частично | apps/server/src/routes/attachments.ts ingestFile ставит OCR для любых растровых загрузок (буфер, DnD); Изображения из DOCX-импорта OCR не проходят (importer.ts не создаёт ocr job) |  |
| R-OCR-004 | P1 | Языки: русский, английский, смешанный, цифры; проверка инженерных обозначений, таблиц, кода | частично | ocr.ts fixHomoglyphs (артикулы), rus+eng; Тест — 3 строки RU/EN; таблицы/код/инженерные обозначения не проверяются |  |
| R-OCR-005 | P1 | Результат: текст, уверенность, координаты; подсветка на картинке; ручная правка с фиксацией | частично | ocr_results.text/confidence/words(bbox); PATCH /ocr corrected_text; Подсветки на изображении нет; confidence показывается только при низком качестве |  |
| R-OCR-006 | P2 | Область распознавания (crop), поворот, повторный запуск с выбранным языком | частично | apps/server/src/routes/attachments.ts POST /ocr {region, rotation}; ocr.ts; В UI нет crop/поворота/выбора языка |  |
| R-OCR-007 | P0 | OCR не замещает оригинал: исходник, автораспознавание и ручная коррекция хранятся отдельно | реализовано | attachment blob + ocr_results.text + ocr_results.corrected_text; tests/integration/content.test.ts:'recognises Russian and English text on a screenshot…' | tests/integration/content.test.ts: OCR (R-OCR-001, R-OCR-007, R-OCR-011, SC-22, §8) |

### SEARCH

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-SEARCH-002 | P1 | OCR-текст индексируется с отметкой происхождения; в выдаче «найдено на изображении» | реализовано | apps/server/src/services/search.ts (matchedIn image), apps/web/src/pages/SearchPage.tsx; tests/integration/content.test.ts (OCR) | tests/integration/content.test.ts: recognises Russian and English text on a screenshot, keeps original, result is searchable  |

### OCR

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-OCR-008 | P2 | OCR — сервис обработки медиа, не импорт PDF/офисных форматов | реализовано | apps/server/src/routes/attachments.ts POST /ocr только для растровых изображений |  |
| R-OCR-009 | P1 | Статусы OCR: ожидает, обрабатывается, готово, частично, ошибка; очереди, повторы, таймауты | реализовано | ocr_results.status (pending/processing/done/partial/error), jobs/worker.ts (retry ≤3), timeout 120 c; OcrDialog; Без теста ошибок/таймаутов |  |
| R-OCR-010 | P2 | Опционально: структуризация распознанной таблицы с обязательной проверкой человеком | не реализовано | —; Структуризации распознанной таблицы нет |  |

### SEARCH

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-SEARCH-003 | P0 | Глобальный поиск по названиям, содержимому, заголовкам, тегам, комментариям (по праву), подписям, файлам, OCR | частично | apps/server/src/jobs/worker.ts#indexPage (комментарии, текст DOCX/TXT вложений), apps/server/src/services/file-text.ts, migrations/0006; tests/integration/history-tree.test.ts; Комментарии и DOCX/TXT индексируются; текст PDF не извлекается (PDF-парсер не установлен), тегов нет | tests/integration/history-tree.test.ts: search covers comments and attached documents (R-SEARCH-003, R-SEARCH-013)<br>tests/integration/history-tree.test.ts: finds a page by comment text and by text inside an attached DOCX/TXT, respecting access (R |
| R-SEARCH-004 | P1 | Полнотекстовый RU/EN, лемматизация, опечатки, подсветка, варианты слов, фильтры пространство/автор/дата/тип/статус | реализовано | apps/server/src/services/search.ts; tests/integration/content.test.ts (morphology, typo, wrong layout), tests/integration/gaps.test.ts; Отдельного фильтра «тип» нет — есть «in» (текст/изображения/файлы) | tests/integration/content.test.ts: finds by morphology, typo, wrong layout, applies ACL before results and jumps to block (R-<br>tests/integration/gaps.test.ts: suggests a corrected query when nothing is found (R-SEARCH-004) |
| R-SEARCH-005 | P1 | Ctrl/Cmd+K, клавиатурная навигация, переход к совпадению внутри страницы | реализовано | apps/web/src/layout/QuickSwitcher.tsx, apps/web/src/layout/AppShell.tsx, apps/web/src/pages/SearchPage.tsx; tests/e2e/collab.spec.ts (jumps to the block) | tests/integration/content.test.ts: finds by morphology, typo, wrong layout, applies ACL before results and jumps to block (R-<br>tests/e2e/collab.spec.ts: search finds a page by a word from its body and jumps to the block (V16-S01, R-SEARCH-005) |

### PAGE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PAGE-006 | P1 | Оглавление, breadcrumbs, обратные ссылки, «связанные материалы», ссылки на блоки | частично | apps/web/src/pages/PageView.tsx#Breadcrumbs/Backlinks, blocks.tsx#TocView; Нет «связанных материалов» |  |

### SEARCH

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-SEARCH-006 | P0 | Права применяются до выдачи результатов, сниппетов, автодополнения, счётчиков и API | реализовано | apps/server/src/services/search.ts#search/suggest/correctedQuery (ACL до подсчёта); tests/integration/content.test.ts | tests/integration/content.test.ts: finds by morphology, typo, wrong layout, applies ACL before results and jumps to block (R- |
| R-SEARCH-007 | P0 | Перемещение/переименование и массовое обновление не ломают ссылки и индекс | реализовано | apps/server/src/services/pages.ts (reindex-subtree), apps/server/src/collab/hub.ts#flushNow (index-page) |  |

### COLLAB

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-COLLAB-006 | P0 | Одновременное редактирование с видимыми курсорами, выделениями, присутствием | реализовано | apps/web/src/editor/clientExtensions.ts (CollaborationCaret), apps/web/src/components/page/Presence.tsx; tests/e2e/collab.spec.ts; E2E проверяет присутствие, курсоры — нет | tests/e2e/collab.spec.ts: two people edit the same page: changes converge, presence is shown, revoking edit makes it |
| R-COLLAB-007 | P0 | Изменения без перезагрузки; при потере сети изменения остаются и синхронизируются | реализовано | packages/shared/src/collab-client.ts, apps/web/src/sync/collab.ts; tests/integration/collab.test.ts offline, tests/e2e/editor.spec.ts offline | tests/integration/collab.test.ts: offline edits are kept locally and synchronised after reconnect, concurrent with others (S |
| R-COLLAB-008 | P0 | CRDT или эквивалент с проверяемой сходимостью; запрет «последний затёр всех» | реализовано | tests/integration/collab.test.ts (randomised convergence, fast-check) | tests/integration/collab.test.ts: randomised convergence (COLLAB-198, R-COLLAB-008, R-COLLAB-030, R-COLLAB-044, property-bas |

### COMMENTS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-COMMENTS-001 | P1 | Комментарии к выделению и блоку, ветки, @mention, разрешить/переоткрыть, привязка к версии и ID блока | частично | threads, block_id, quote, mentions, resolve/reopen; comments.revision_number set to latest revision; tests/integration/acl-gaps.test.ts: comment survives block edits; revision_number = latest saved revision (may lag live content by up to the auto-revision interval). | tests/integration/content.test.ts: threads, replies, resolve/reopen, mention notifications only for those with access (R-COMM<br>tests/integration/acl-gaps.test.ts: comments are bound to a revision and a block (R-COMMENTS-001) |
| R-COMMENTS-002 | P2 | Режим предложений правок; принятие/отклонение требует роли редактора | не реализовано | -; No suggestion (track changes) mode. |  |

### HISTORY

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-HISTORY-004 | P0 | Восстановление старой версии создаёт новую версию без стирания истории | реализовано | apps/server/src/routes/revisions.ts#restore; tests/integration/collab.test.ts, tests/e2e/collab.spec.ts | tests/integration/collab.test.ts: restoring a revision creates a new revision and keeps concurrent edits (HIST-189, COLLAB-1<br>tests/e2e/collab.spec.ts: history: save a version, change text, restore the version (R-HISTORY-004, UX13-14, UX21-20 |

### COLLAB

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-COLLAB-009 | P0 | Интеграционные тесты конфликтов при смене схемы, копировании блока, отключённой сети | частично | tests/integration/collab.test.ts (отключённая сеть, невалидная схема), tests/integration/collab-p0.test.ts (копирование блока + правка); Нет тестов конфликтов при смене схемы содержимого (миграции content_schema_version не реализованы) | tests/integration/collab-p0.test.ts: format + delete, block copy + edit and concurrent block moves converge without duplicates  |

### PUBLISH

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PUBLISH-002 | P1 | Черновик, запрос согласования, согласующий, замечания, публикация, отзыв публикации | реализовано | submit-review (reviewer, message), decide approve/reject with comment, publish, unpublish; PublishBar; tests/integration/content.test.ts publishing workflow |  |
| R-PUBLISH-003 | P2 | Свойства: ответственный, дата пересмотра, тип, критичность, подразделение, продукт, срок действия | частично | pages.owner_id, review_due_at, verified_at, free-form properties jsonb; No typed fields for type/criticality/department/product/validity; search cannot filter by them. |  |
| R-PUBLISH-004 | P1 | Истёкший срок проверки — пометка «Требует актуализации» без автоудаления | реализовано | pageDto.needsReview, PageInfoPanel warning, Home "needsReview"; nothing auto-deleted; No test. |  |

### TEMPLATES

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-TEMPLATES-002 | P2 | Шаблоны: регламент, инструкция, база решений, FAQ, паспорт продукта, техописание, протокол, чек-лист, тестирование, onboarding | реализовано | templates/library-core.ts, library.ts (35 шаблонов, все 10 видов) |  |

### HISTORY

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-HISTORY-005 | P1 | «Что изменилось» для версии: автор, дата, изменения; ID опубликованной редакции | реализовано | apps/server/src/routes/revisions.ts (authors, summary, published), apps/web/src/components/page/HistoryPanel.tsx |  |

### PUBLISH

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PUBLISH-005 | P2 | Напоминания об актуализации и упоминания без превращения в task tracker | частично | Home needsReview widget for page owners; No reminder notifications for overdue review. |  |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ACL-013 | P0 | RBAC: сисадмин, владелец, редактор, автор, читатель, аудитор; разрешения view/create/edit/comment/publish/delete/manage_members/export/audit | реализовано | tests/integration/acl-p0.test.ts 'R-ACL-013: every role × permission cell of the matrix is enforced by the API (table-driven)': владелец/редактор/автор/читатель/сисадмин/аудитор × view/create/edit/comment/publish/delete/manage_members/export/audit; Roles map to space grant levels (+canPublish=false for «автор») and organisation roles (admin, auditor). | tests/integration/acl-p0.test.ts: role × permission matrix (R-ACL-013, R-AUDIT-002)<br>tests/integration/acl-p0.test.ts: R-ACL-013: every role × permission cell of the matrix is enforced by the API (table-driven |
| R-ACL-014 | P0 | ACL наследуются от пространства и родителя, исключения с предпросмотром эффективных прав; по умолчанию закрыто; публичные ссылки выключены | реализовано | inheritance (APPLICABLE_GRANTS_SQL), exceptions, POST /pages/:id/access/preview, default deny (combine), publicLinksEnabled=false; tests/integration/gaps.test.ts: audience preview | tests/integration/gaps.test.ts: audience_change conflict lists who would newly gain access; preview endpoint computes adde |

### AUTH

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-AUTH-001 | P0 | Локальная аутентификация с MFA или SSO (OIDC/SAML), сессии, отзыв доступа, принудительный logout | реализовано | password login + TOTP MFA (auth/totp.ts, tests/unit/totp.test.ts), OIDC (auth/oidc.ts), sessions list/revoke, admin revoke-sessions; core test suspend; SAML not implemented; OIDC not verifiable without an external IdP. |  |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ACL-015 | P0 | Права на уровне API, объектов, вложений, версий, индекса, OCR, экспорта и WebSocket, не только UI | реализовано | requirePage in pages/revisions/attachments/OCR/export/search; WS connect+recheck (apps/server/src/collab/hub.ts); tests/integration/acl.test.ts, tests/integration/content.test.ts E2E-102, tests/integration/collab.test.ts S03/E2E-105 |  |

### AUDIT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-AUDIT-001 | P0 | Аудит: вход, отказ, просмотр/скачивание, изменение, публикация, права, импорт/экспорт, удаление/восстановление, настройки; actor, UTC … | реализовано | page views audited as page.view (rate limited per user+page, services/denials.ts createViewLogger), hidden-resource 404s as access.not_found, 403 as access.denied; all fields present; tests/integration/acl-p0.test.ts 'R-AUDIT-001 OPS-014: opening a document is audited …' | tests/integration/acl-gaps.test.ts: audit: private titles masked, denials logged (ROUTE-06, R-AUDIT-001, OPS-014)<br>tests/integration/acl-p0.test.ts: audit of reads and hidden resources (R-AUDIT-001, OPS-014)<br>tests/integration/acl-p0.test.ts: R-AUDIT-001 OPS-014: opening a document is audited (rate limited) and probing a hidden pag |

### SECURITY

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-SECURITY-002 | P0 | TLS, шифрование на хранении, секреты, CSRF/XSS/SSRF, rate limit, CSP, антивирус и проверка типа вложений, path traversal, sanitize … | частично | CSRF double submit (app.ts), helmet CSP, rate-limit, sanitize-html, SVG sanitising, type sniffing (inspectFile), zip-slip protection, optional ClamAV; SSRF-guarded remote fetcher (services/remote-fetch.ts); tests/integration/acl-p0.test.ts 'SC-33 R-SECURITY-002: …' (XSS in imports, CSRF, path traversal, sandboxed HTML files); No encryption at rest inside the application (left to disk/DB/S3), ClamAV not verified with a real daemon, no independent OWASP/ASVS test run; TLS is terminated by deploy/nginx.conf (not exercised by tests). | tests/integration/acl-p0.test.ts: malicious inputs (SC-33, R-SECURITY-002, R-SECURITY-007)<br>tests/integration/acl-p0.test.ts: SC-33 R-SECURITY-002: XSS in imported HTML/Markdown is neutralised, CSRF without token and |
| R-SECURITY-003 | P0 | Контент не уходит во внешние OCR/AI API без админ-включения, договора и видимого указания | реализовано | OCR local tesseract.js with bundled rus/eng data (apps/server/src/ocr/ocr.ts); no AI/external calls |  |

### PROCESS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PROCESS-022 | P1 | Внешние зависимости, особенно платные, лицензируются и фиксируются до разработки | не реализовано | n/a; no licence register |  |

### COLLAB

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-COLLAB-010 | P0 | Автосохранение с явным статусом Сохранено/Синхронизация/Ошибка; потеря фокуса не удаляет правки | реализовано | apps/web/src/components/page/SyncStatus.tsx, apps/web/src/sync/collab.ts (beforeunload/flush) |  |

### HISTORY

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-HISTORY-006 | P0 | Серверные снимки после публикации, ручного сохранения, импорта и по интервалу (~5 мин активного редактирования) | реализовано | apps/server/src/collab/hub.ts (AUTO_REVISION_MS), apps/server/src/routes/revisions.ts publish, import revisions |  |
| R-HISTORY-007 | P1 | Сравнение версий: вставлено/удалено/перемещено/изменено; восстановление как новый коммит | реализовано | apps/server/src/services/revisions.ts#diffDocs (added/removed/moved/changed), apps/web/src/components/page/HistoryPanel.tsx | tests/integration/collab.test.ts: restoring a revision creates a new revision and keeps concurrent edits (HIST-189, COLLAB-1 |

### ARCHIVE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ARCHIVE-002 | P0 | Корзина, защита от случайного удаления пространства, подтверждение опасных админ-операций | реализовано | DELETE /api/v1/spaces/:id requires confirmName; archive ops require password re-entry; tests/integration/gaps.test.ts: org admin can permanently purge a deleted space |  |

### BACKUP

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-BACKUP-003 | P0 | Бэкапы: ежедневные полные, инкрементальные/журналы, отдельное защищённое хранилище, шифрование, мониторинг, регулярный тест восстановления | частично | scripts/backup/backup.sh (daily full, incremental object pool, BACKUP_ENCRYPT_CMD), kb-backup.timer / backup-loop.sh, alerts KbBackupTooOld, weekly verify; Separate protected/offsite storage is deployment responsibility (documented, not configured) |  |
| R-BACKUP-004 | P0 | RPO ≤15 минут, RTO ≤4 часа для типового инцидента, подтверждённые испытаниями | заменено | overridden_by R-BACKUP-001 |  |
| R-BACKUP-005 | P0 | Экспорт резервной копии: структура, медиа, ACL, версии, связи, метаданные в документированном формате | реализовано | Org archive (services/archive.ts: structure, media, ACL, versions, links, metadata, manifest) + kb-backup/1 manifest; tests/integration/archive.test.ts | tests/integration/archive.test.ts: export → readable without the app → restore into a clean installation → verified (V18-A05, |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-UI-019 | P1 | Деловой стиль: чистая типографика, нейтральные поверхности, комфортная плотность, лаконичные иконки, различимые состояния … | требует ручной проверки | apps/web/src/styles/tokens.css; design review not performed |  |
| R-UI-020 | P2 | Цвет темы настраивается (бренд/личное); тёмная и светлая темы одинаково проработаны; цвет не единственный носитель смысла | частично | tokens.css light+dark semantic tokens; dark screenshots in VS; brand/personal accent colour not configurable; dark theme has overflow checks but no pixel baselines |  |
| R-UI-021 | P1 | 8-пиксельная сетка, последовательные отступы, ≥3 уровня текстовой иерархии, контролируемая ширина чтения и таблиц | частично | tokens.css --sp-1..10 (4/8 px), --content-w 760px; many hard-coded 6/10/14 px paddings off the 8px grid; no token check |  |
| R-UI-022 | P1 | Анимации: меню 100–160 мс, панели 160–240 мс, перетаскивание 120–200 мс; индикатор сохранения без постоянного движения; без блокировки ввода | частично | tokens.css --t-fast 120 / --t-med 180 / --t-slow 240 ms; values in range but not tested; save spinner rotates while saving |  |

### A11Y

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-A11Y-002 | P1 | prefers-reduced-motion сводит анимации к минимуму; элементы не прыгают и не смещают курсор | реализовано | tests/e2e/a11y.spec.ts "reduced motion: animations and transitions are effectively disabled (R-A11Y-002, AT-82)" | tests/e2e/a11y.spec.ts: reduced motion: animations and transitions are effectively disabled (R-A11Y-002, AT-82) |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-UI-023 | P1 | hover, focus-visible, active, disabled, pending, success, error, пустые состояния каждого элемента управления | частично | ui.css hover/:focus-visible/active/disabled styles; no state catalogue; pending/success/error not uniform |  |

### A11Y

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-A11Y-003 | P1 | WCAG 2.2 AA: клавиатура, экранные дикторы, aria-label, контраст, табуляция, без цветозависимых сигналов | частично | tests/e2e/a11y.spec.ts "WCAG 2.1 AA automated audit of key screens (R-A11Y-003, AT-80, E2E-112)" (axe wcag2a/aa/21a/21aa, serious+critical must be 0) on login, home, page, search, templates, trash, settings, admin, import; contrast fixed (--accent-strong 5.0:1, --success 5.2:1); WCAG 2.2-specific rules and moderate/minor findings not asserted; screen readers not available | tests/e2e/a11y.spec.ts: WCAG 2.1 AA automated audit of key screens (R-A11Y-003, AT-80, E2E-112) |

### PERF

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PERF-002 | P1 | Масштаб: 10–200 сотрудников, 100 000 страниц, 500 000 вложений; рост без переработки модели | не реализовано | scratch/scale-drill.sh (1000 pages, backup drill only, not in repo tests); no 100k pages / 500k attachments load test |  |
| R-PERF-003 | P1 | p95: открытие страницы ≤2 с, локальный ввод ≤100 мс, поиск ≤1 с, навигация дерева ≤300 мс | частично | tests/e2e/collab.spec.ts "typing latency on a long document stays within budget": 400 paragraphs (~5k words), 40 samples, execCommand insertText -> next rAF, no CPU/network throttling; last run p95≈31 ms; page open, search, tree navigation not measured; vite build: entry index.js 140 KB gz + index.css 23 KB gz; opening a page also loads PageView chunk 1.32 MB / 413 KB gz (katex + all highlight.js languages bundled eagerly) => ~576 KB gz before first edit |  |
| R-PERF-004 | P1 | Страница до 5 000 блоков; виртуализация, без блокировки основной нити | частично | Tiptap without document virtualisation; no 5000-block test; no long-task measurement |  |

### IMPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-IMPORT-015 | P1 | Импорт/экспорт больших документов (50 МБ) — фоновые задания с прогрессом, таймаутом, отменой, безопасными повторами | частично | import-analyze/export jobs with progress, cancel, idempotency key, lock timeout 10 min; No 50 MB test; progress coarse (stage only) |  |

### OPS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-OPS-005 | P1 | SLA 99,9% в месяц кроме обслуживания; метрики внешним мониторингом | ограничение окружения | deploy/monitoring/prometheus-alerts.yml; /healthz for external probes; External monitoring of a production SLA is outside the repository |  |
| R-OPS-006 | P1 | Логи, метрики, трассировка, health/readiness, алерты по sync, OCR, импорту, индексу, бэкапам; correlation IDs | частично | pino logs with reqId=correlationId (app.ts genReqId), /healthz,/readyz, metrics.ts, alerts for collab persist, jobs by type, outbox lag, backups; tests/resilience/db-connection-loss.test.ts: readiness reports the database outage; No tracing; no OCR-latency or import-failure-rate metric (only kb_jobs_total{type,status}); alerts not fired in a drill | tests/resilience/storage-failure.test.ts: temporary area unusable → readiness reports storage error, upload fails cleanly, both reco<br>tests/resilience/db-connection-loss.test.ts: readiness reports the database outage and recovers (R-OPS-006, R-OPS-003)<br>tests/resilience/db-connection-loss.test.ts: cross-instance live updates resume after the database returns (event bus reconnects) (SC-3<br>… ещё 1 |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-UI-024 | P1 | Браузеры: актуальные и две предыдущие версии Chrome, Edge, Firefox, Safari, Safari iOS, Chrome Android | ограничение окружения | playwright.config.ts; only Chromium is installed (playwright.config.ts, DECISIONS D-18); Edge/Firefox/Safari/iOS/Android untested |  |

### PROCESS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PROCESS-023 | P2 | Клиент React + TypeScript с редактором ProseMirror/Tiptap (заменяемо при равном качестве) | частично | docs/ARCHITECTURE.md §1/§8 (React + Tiptap/ProseMirror + Yjs); no explicit ADR in DECISIONS.md |  |
| R-PROCESS-024 | P2 | Сервер TypeScript (NestJS) или Python (FastAPI), один API-контур без лишних микросервисов | частично | docs/ARCHITECTURE.md (Fastify 5, single process); DECISIONS D-01; deviation from NestJS not argued |  |
| R-PROCESS-025 | P2 | PostgreSQL для данных; S3-совместимое объектное хранилище для медиа и архивов | реализовано | PostgreSQL; apps/server/src/storage/blob-store.ts S3 driver; ARCHITECTURE.md:16; DECISIONS D-08 |  |

### SEARCH

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-SEARCH-008 | P2 | Redis для очередей; OpenSearch или эквивалент для поиска с фильтрацией прав | реализовано | docs/DECISIONS.md D-01, docs/ARCHITECTURE.md §6; Вместо Redis/OpenSearch — PostgreSQL FTS + outbox (решение задокументировано) |  |

### COLLAB

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-COLLAB-011 | P0 | Yjs + WebSocket/Hocuspocus или аналог, обязательно с серверной долговременной записью обновлений и снапшотами | реализовано | apps/server/src/collab/hub.ts (doc_updates + snapshot), apps/server/migrations/0001_core.sql |  |

### OCR

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-OCR-011 | P2 | OCR-воркер PaddleOCR или аналог, прошедший тесты RU/EN; очередь и контроль доступа | реализовано | tesseract.js (локальные rus/eng), очередь jobs, loadAttachment; tests/integration/content.test.ts:'recognises Russian and English text on a screenshot…' | tests/integration/content.test.ts: OCR (R-OCR-001, R-OCR-007, R-OCR-011, SC-22, §8) |

### IMPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-IMPORT-016 | P1 | Отдельный двусторонний DOCX-конвертер; Mammoth недостаточен сам по себе; экспорт испытан отдельно | реализовано | convert/docx-export.ts (docx lib) separate from mammoth import; tests/integration/import-export.test.ts: DOCX opens in LibreOffice |  |
| R-IMPORT-017 | P1 | Markdown парсер/сериализатор с поддержкой нестандартных блоков и round-trip тестами | реализовано | packages/shared/src/editor/markdown.ts; tests/unit/markdown.test.ts round trip + property test |  |

### EDITOR

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-EDITOR-023 | P0 | Источник истины — одна версионируемая семантическая схема (schemaVersion); HTML/DOCX/MD — представления | реализовано | packages/shared/src/editor/migrations.ts migrateContent/SCHEMA_MIGRATIONS; archive.ts restore (contentSchemaVersion); tests/unit/schema-migrations.test.ts | tests/unit/schema-migrations.test.ts: document schema versions (R-EDITOR-023, R-EDITOR-043)<br>tests/unit/schema-migrations.test.ts: R-EDITOR-023: current documents pass unchanged; older ones are migrated step by step<br>tests/unit/schema-migrations.test.ts: R-EDITOR-023: refuses newer schemas and gaps in the migration chain |

### PROCESS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PROCESS-026 | P2 | Сервисные границы: Auth, Spaces, Pages, EditorDocument, Permissions, Search, Media, OCR, ImportExport, Collaboration, Audit … | частично | apps/server/src: auth, acl, collab, convert, ocr, storage, jobs, routes; mapping to required boundaries not documented |  |

### OPS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-OPS-007 | P1 | REST/OpenAPI + WebSocket; идемпотентные импорт, мутации, экспорт; обратимые миграции схемы | реализовано | /api/v1/openapi.json (acl-gaps.test.ts: OpenAPI description); tests/resilience/migrations.test.ts: reversible migrations; idempotency keys on imports/exports; Idempotency not uniform for every mutation | tests/resilience/migrations.test.ts: every migration rolls back and re-applies step by step with data present; the application <br>tests/resilience/migrations.test.ts: a complete rollback to an empty schema and a fresh re-apply both succeed (E-14, R-OPS-007) |
| R-OPS-008 | P1 | Docker Compose локально; production в корпоративной инфраструктуре с HTTPS, секретами, мониторингом, бэкапом, CI/CD; без обязательных SaaS | частично | deploy/docker-compose.yml, Dockerfile, deploy/nginx.conf (TLS), deploy/env.example, deploy/monitoring/*, backup sidecar; no SaaS dependencies; Image/compose never built or run here (no Docker daemon); no CD |  |

### PAGE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PAGE-007 | P1 | Сущности: User, Group, Membership, Workspace, Space, Page, PageRevision, DocumentBlock, Attachment, OCRJob, OCRResult, Comment … | частично | apps/server/migrations/0001_core.sql; Нет отдельных Workspace и DocumentBlock (блоки внутри CRDT); Import/Export/OCRJob — общая таблица jobs |  |
| R-PAGE-008 | P1 | Поля Page: id, spaceId, parentId?, title, slug, icon?, contentSchemaVersion, status, createdBy, updatedBy, createdAt, updatedAt … | частично | apps/server/migrations/0001_core.sql (pages); Нет slug; content_schema_version есть, но не используется |  |

### SPACE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-SPACE-002 | P1 | API: GET/POST /api/v1/spaces | реализовано | GET/POST /api/v1/spaces; OpenAPI at /api/v1/openapi.json (@fastify/swagger); tests/integration/acl-gaps.test.ts; OpenAPI lists paths/methods; request/response schemas not described (zod in handlers). | tests/integration/acl-gaps.test.ts: OpenAPI description (R-SPACE-002, R-ACL-016) |

### PAGE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PAGE-009 | P1 | API: GET/POST /api/v1/pages, GET/PATCH/DELETE /api/v1/pages/{id} | частично | apps/server/src/routes/pages.ts; Нет GET /api/v1/pages (список); OpenAPI-спецификации нет |  |
| R-PAGE-010 | P1 | API: POST /pages/{id}/publish, /restore, /duplicate, /move | частично | apps/server/src/routes/pages.ts (move, duplicate, restore), apps/server/src/routes/revisions.ts (publish); Эндпоинты есть, OpenAPI нет |  |

### HISTORY

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-HISTORY-008 | P1 | API: GET /pages/{id}/revisions, POST /revisions/{revisionId}/restore | частично | apps/server/src/routes/revisions.ts; Восстановление — POST /pages/{id}/revisions/{rid}/restore вместо /revisions/{revisionId}/restore; OpenAPI нет |  |

### SEARCH

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-SEARCH-009 | P1 | API: GET /api/v1/search?q=&space=&type=&status= | частично | apps/server/src/routes/search-comments.ts; Параметр spaceId вместо space, параметра type нет; OpenAPI нет |  |

### IMPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-IMPORT-018 | P1 | API: POST /imports, GET /imports/{jobId}; POST /exports, GET /exports/{jobId} | реализовано | routes/import-export.ts POST/GET /api/v1/imports, /api/v1/exports |  |

### MEDIA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-MEDIA-005 | P1 | API: POST /attachments, POST /ocr/jobs | частично | apps/server/src/routes/attachments.ts POST /api/v1/attachments, POST /api/v1/attachments/:id/ocr; Пути /ocr/jobs нет; OpenAPI-описания нет |  |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ACL-016 | P1 | API: GET/PATCH /permissions/{resourceType}/{id}; GET /audit с ограничением доступа | частично | GET /pages/:id/access, PUT/DELETE /grants, GET /audit (restricted); OpenAPI /api/v1/openapi.json; tests/integration/acl-gaps.test.ts; No GET/PATCH /permissions/{resourceType}/{id} endpoint shape. | tests/integration/acl-gaps.test.ts: OpenAPI description (R-SPACE-002, R-ACL-016) |

### OPS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-OPS-009 | P1 | Каждый эндпоинт: схемы, коды 400/401/403/404/409/413/422/429/500, права, лимиты, пагинация, идемпотентность, версия, аудит, примеры | частично | zod validation + AppError codes (app.ts error handler: 400/401/403/404/409/413/422/429/500/503), rate limits, OpenAPI generated; No per-endpoint contract tests; OpenAPI lacks complete schemas/examples |  |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ACL-017 | P0 | Поиск/скачивание/экспорт не обходят ACL через прямые URL | реализовано | attachments loadAttachment, signed links re-check, export routes; tests/integration/content.test.ts E2E-102; tests/integration/import-export.test.ts: export respects rights (SC-20, V17-F07) | tests/integration/import-export.test.ts: export respects rights: no export permission => 403; private pages never leak into branch  |

### TREE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| SC-01 | P0 | Организация, пространство, вложенная страница, переименование, перенос, восстановление из корзины — неизменный ID и рабочие ссылки | реализовано | apps/server/src/services/pages.ts; tests/integration/core.test.ts (moves keep ids, trash and restore) | tests/integration/core.test.ts: moves keep ids, ancestors closure is consistent, order respected, undo restores (R-TREE-00 |

### TEMPLATES

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| SC-02 | P1 | Создать страницу из каждого шаблона, отредактировать, опубликовать; читатель видит только опубликованное по политике | реализовано | templateId при создании страницы; publishing workflow; tests/integration/content.test.ts:'readers see the published revision…'; создание из каждого шаблона не тестируется |  |

### TREE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| SC-03 | P1 | Дерево: клавиатура, мышь, drag-and-drop, мобильный экран | реализовано | apps/web/src/layout/SidebarTree.tsx (клавиатура, pointer DnD, touch-хэндл), apps/web/src/layout/treeActions.tsx; DnD и клавиатура дерева автотестами не проверены (название E2E упоминает keyboard navigation, но не проверяет) |  |

### PERF

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| SC-04 | P0 | Документ 5 000 блоков и длинная таблица без скачков курсора и потери ввода | реализовано | tests/e2e/perf-typing.spec.ts "SC-04: 5 000 blocks and a long table: typing keeps the caret in place and loses no characters" (document imported server-side, 240 chars in a paragraph + 80 in a 200-row table cell, exact text, caret offset, no scroll jump, server copy); latency on 5 000 blocks is poor (p50 ≈ 190 ms, docs/PERFORMANCE.md PERF-D2) — tracked under R-PERF-025 | tests/e2e/perf-typing.spec.ts: SC-04: 5 000 blocks and a long table: typing keeps the caret in place and loses no charact |

### EDITOR

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| SC-05 | P0 | Все inline-форматы, заголовки, вложенные списки, чек-листы, callout, toggle, формулы, ссылки, код, цитаты … | реализовано | Схема packages/shared; Yjs-хранение; Markdown-маркеры; tests/integration/editor-p0.test.ts:'SC-05: a document with all inline formats, headings, nested lists, checklists, callout, toggle, formulas, links, code and quotes is stored and reopened identically', 'SC-05: Markdown export with markers and re-import keep the same structure…' | tests/integration/editor-p0.test.ts: save and open keep the structure identical (SC-05)<br>tests/integration/editor-p0.test.ts: SC-05: a document with all inline formats, headings, nested lists, checklists, callout, to<br>tests/integration/editor-p0.test.ts: SC-05: Markdown export with markers and re-import keep the same structure (formulas, check |

### CLIPBOARD

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| SC-06 | P0 | Вставка из Word и веб-страницы с заголовками, таблицами, ссылками, картинками; предпросмотр без мусорной HTML-разметки | частично | apps/web/src/editor/clipboard/html.ts; apps/web/src/editor/extensions/paste.ts SmartPaste; tests/e2e/clipboard.spec.ts. Предпросмотра вставки нет; Картинки из Word (file://, VML) браузер не передаёт — пользователь получает уведомление с числом непереданных изображений; RTF не разбирается | tests/unit/clipboard-html.test.ts: images in pasted HTML (R-CLIPBOARD-020, SC-06)<br>tests/unit/clipboard-html.test.ts: SC-06: embedded images are extracted for upload, local Word file paths are reported, track<br>tests/e2e/clipboard.spec.ts: web HTML paste: scripts removed, embedded image uploaded as an attachment (E210, SC-06, R- |
| SC-07 | P0 | Копировать из базы в Word, почту, Google Docs и обратно — списки, ссылки, таблицы сохраняются | ограничение окружения | PM copy html/plain; парсинг HTML; Нужны реальные Word/почта/Google Docs; кроме того см. пробелы R-CLIPBOARD-004/020 |  |
| SC-08 | P1 | «Копировать Markdown» страницы → текстовый редактор: корректный MD, UTF-8, code fences, таблицы | реализовано | packages/shared/src/editor/markdown.ts docToMarkdown; apps/web/src/editor/clipboard/copy.tsx copyPage(markdown); tests/e2e/clipboard.spec.ts:'page menu copies the page…'; tests/unit/markdown.test.ts | tests/e2e/clipboard.spec.ts: page menu copies the page with formatting, as text and as Markdown (R-CLIPBOARD-002, R-CLI |
| SC-09 | P1 | Копировать таблицу в Excel/Sheets — значения в правильных ячейках; код без UI-надписей | ограничение окружения | apps/web/src/editor/menus/TableToolbar.tsx TSV; CodeBlockView; Проверка ячеек в реальном Excel/Sheets невозможна здесь; unit-теста rowsToTsv нет | tests/e2e/clipboard.spec.ts: table copy for Excel puts TSV and an HTML table on the clipboard (R-CLIPBOARD-006, R-CLIPB |
| SC-10 | P1 | При запрете clipboard — точное объяснение и альтернативный путь, не ложное «Скопировано» | реализовано | apps/web/src/editor/clipboard/copy.tsx copyWithFeedback; tests/e2e/clipboard.spec.ts:'refused clipboard access…' | tests/e2e/clipboard.spec.ts: refused clipboard access shows an error and the text for manual copying, not a false succe |

### HISTORY

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| SC-11 | P0 | Undo/redo после вставки, перемещения блока, изменения таблицы; фокус и выделение сохраняются | реализовано | apps/web/src/editor/extensions/blockIds.ts (присвоение id в том же шаге отмены), apps/web/src/editor/clientExtensions.ts; tests/e2e/undo.spec.ts (вставка, перемещение блока, вставка таблицы, форматирование с сохранением выделения); Ранее найденный баг blockIds/addToHistory исправлен: вставка, Enter и вставка таблицы отменяются | tests/e2e/undo.spec.ts: undo/redo of formatting keeps the text and the selection (QA26-14, SC-11, R-HISTORY-011, R<br>tests/e2e/undo.spec.ts: undo of a table insert (SC-11, R-HISTORY-017, QA26-14) |

### SECURITY

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| SC-12 | P0 | Вставка вредоносных HTML/URL/SVG — произвольный JS не выполняется | реализовано | tests/integration/content.test.ts: sanitises SVG ... (SC-12); safe URL protocols (packages/shared/src/editor/url.ts); tests/unit/markdown.test.ts removes unsafe links | tests/integration/content.test.ts: sanitises SVG and serves user content in a sandbox (SC-12, SC-33, R-MEDIA-011) |

### IMPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| SC-13 | P0 | DOCX с заголовками, 3 уровнями списков, ссылками, 2 таблицами, изображениями, кодом → импорт → правка → экспорт → Word/LibreOffice без … | ограничение окружения | tests/integration/io-p0-import.test.ts: Word-style DOCX with headings, 3 list levels, links, 2 tables, images and code → import → edit → DOCX export valid for Word (Open XML) and LibreOffice, structure preserved; tests/e2e/io-p0-roundtrip.spec.ts: DOCX import → edit in the editor → DOCX and Markdown export…; Import, edit (collaboration client and browser), export, Open XML validation and LibreOffice are automated; the final check in Microsoft Word needs Word (not available in CI) | tests/integration/io-p0-import.test.ts: import → edit → export chains (SC-13, SC-15)<br>tests/integration/io-p0-import.test.ts: Word-style DOCX with headings, 3 list levels, links, 2 tables, images and code → import → <br>tests/integration/import-export.test.ts: DOCX import (SC-13, SC-14, AT-41, AT-42)<br>… ещё 2 |
| SC-14 | P0 | DOCX с объединёнными ячейками импортируется корректно; неподдержанное — конкретный отчёт | реализовано | tests/integration/import-export.test.ts: merged tables colspan preserved, warning | tests/integration/import-export.test.ts: DOCX import (SC-13, SC-14, AT-41, AT-42) |
| SC-15 | P0 | MD с GFM-таблицей, task list, кодом, относительными изображениями → ZIP импорт → ZIP экспорт → локально пути рабочие | реализовано | tests/integration/io-p0-import.test.ts: Markdown ZIP with a GFM table, task list, code and relative images → import → ZIP export → every relative link resolves locally → re-import gives the same content (links between pages are now relative in ZIP exports; checksums verified on re-import) | tests/integration/io-p0-import.test.ts: import → edit → export chains (SC-13, SC-15)<br>tests/integration/io-p0-import.test.ts: Markdown ZIP with a GFM table, task list, code and relative images → import → ZIP export →<br>tests/integration/import-export.test.ts: Markdown ZIP (SC-15, AT-43, AT-69)<br>… ещё 1 |
| SC-16 | P0 | MD round-trip parse→edit→serialize→parse на наборе — поддерживаемые элементы не пропадают | реализовано | tests/unit/markdown.test.ts: round-trips through import; property test |  |

### EXPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| SC-17 | P1 | Таблица с merge → экспорт MD уведомляет об ограничении; исходник не меняется | реализовано | markdown.ts table-html warning; export never modifies source; UI notification not e2e-tested |  |

### IMPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| SC-18 | P1 | Массовый импорт 100 документов — список успешных/ошибочных, повтор только неудачных | частично | Per-file report statuses in preview; No "retry only failed" action; no 100-document test |  |

### SECURITY

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| SC-19 | P0 | Повреждённый DOCX, ложный MIME, вредоносный ZIP, слишком большой файл отвергаются безопасно и объяснимо | реализовано | tests/integration/content.test.ts rejects executables (SC-19); tests/integration/import-export.test.ts corrupted DOCX (SC-19), zip-slip/zip bombs (SC-19); 413 too_large | tests/integration/content.test.ts: rejects executables even with a fake extension and dangerous types (SC-19, SC-33)<br>tests/integration/import-export.test.ts: rejects a corrupted DOCX with a clear error and changes nothing (SC-19, D-09)<br>tests/integration/import-export.test.ts: rejects zip-slip paths and zip bombs before extracting (SC-19, AT-69, R-IMPORT-006, R-IMPO |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| SC-20 | P0 | Импорт и экспорт проверяют права; неизвестный пользователь не получает исходник по URL задания | реализовано | import/export job lookup bound to creator (routes/import-export.ts job(user.id,...)); tests/integration/import-export.test.ts: export respects rights (SC-20) | tests/integration/import-export.test.ts: export respects rights: no export permission => 403; private pages never leak into branch  |

### OCR

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| SC-21 | P1 | Русский скриншот с таблицей, английским и артикулом → OCR → выбор фрагмента → копирование → вставка текстом | частично | tests/integration/content.test.ts:'recognises Russian and English text on a screenshot…'; OcrDialog textarea + «Копировать»; Скриншот с таблицей и выбор фрагмента не проверяются (название теста упоминает SC-21..24, но покрывает только распознавание) |  |
| SC-22 | P0 | Видны оригинал, confidence, исправления, происхождение; ошибка OCR не удаляет изображение | частично | OcrDialog; search matchedIn image; ошибка OCR не трогает вложение; Confidence скрыт при нормальном качестве, автор исправления не показывается | tests/integration/content.test.ts: OCR (R-OCR-001, R-OCR-007, R-OCR-011, SC-22, §8) |

### SEARCH

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| SC-23 | P1 | Поиск термина только со скриншота возвращает страницу с пометкой «совпадение в изображении» | реализовано | tests/integration/content.test.ts (OCR searchable with origin marker) | tests/integration/content.test.ts: recognises Russian and English text on a screenshot, keeps original, result is searchable  |

### OCR

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| SC-24 | P1 | Поворот, низкое качество, смешанный язык, область — сервис не ломается; ошибку можно повторить | частично | apps/server/src/routes/attachments.ts region/rotation; OcrDialog «Распознать заново»; Поворот/область только через API; тестов плохих изображений нет |  |

### COLLAB

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| SC-25 | P0 | Два автора правят абзац и таблицу; после синхронизации документы одинаковы | реализовано | tests/integration/collab-p0.test.ts (two editors change one table cell …), tests/e2e/collab-p0-editing.spec.ts (two editors change a paragraph, one table …), tests/integration/collab.test.ts (same paragraph); Таблица одновременно двумя авторами (одна ячейка, соседние строки, новая строка) сливается в валидный документ без NACK | tests/integration/collab.test.ts: two editors typing in the same paragraph converge without loss (SC-25, AT-74, COLLAB-192, <br>tests/integration/collab-p0.test.ts: many editors, tables, moves (QA26-19, AT-56, SC-25, R-COLLAB-024, R-COLLAB-032)<br>tests/integration/collab-p0.test.ts: two editors change one table cell and neighbouring rows while a third adds a row; the merg<br>… ещё 1 |

### OFFLINE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| SC-26 | P0 | Сеть отключена на одном клиенте, правки на обоих, сеть восстановлена — нет бесшумной потери, сходимость | реализовано | tests/integration/collab.test.ts (offline edits ... SC-26) | tests/integration/collab.test.ts: offline edits are kept locally and synchronised after reconnect, concurrent with others (S |

### HISTORY

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| SC-27 | P0 | Отмена одного пользователя не откатывает действия второго | реализовано | apps/web/src/editor/clientExtensions.ts (Tiptap Collaboration → y-tiptap yUndoPlugin, own origin only; undoRedo disabled in packages/shared/src/editor/extensions.ts); tests/e2e/undo.spec.ts (совместная работа) | tests/e2e/undo.spec.ts: undo reverts only the user's own changes, never a colleague's (SC-27, UX21-200, R-HISTORY- |
| SC-28 | P0 | Восстановление старой версии создаёт новую ревизию, история не стёрта | реализовано | tests/integration/collab.test.ts (SC-28) | tests/integration/collab.test.ts: restoring a revision creates a new revision and keeps concurrent edits (HIST-189, COLLAB-1 |

### ARCHIVE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| SC-29 | P0 | Удалить страницу, найти в корзине, восстановить; права, вложения, внутренние ссылки целы | реализовано | tests/integration/core.test.ts: trash and restore a branch with children (SC-29) | tests/integration/core.test.ts: trash and restore a branch with children (D-05, SC-29, V17-F08, E-05, R-HISTORY-003, R-HIS |

### BACKUP

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| SC-30 | P0 | Сбой БД/объектного хранилища и восстановление из бэкапа — целевые RPO/RTO на тестовом контуре | реализовано | tests/resilience/backup-restore.test.ts; tests/resilience/db-connection-loss.test.ts; tests/resilience/storage-failure.test.ts; measured RTO on test bench; Production-scale RPO/RTO still to confirm | tests/resilience/storage-failure.test.ts: object storage failure on upload (SC-30, D-03)<br>tests/resilience/backup-restore.test.ts: backup → restore drill (SC-30, AT-60, AT-87, V16-S20, OPS-011, QA26-18)<br>tests/resilience/db-connection-loss.test.ts: database connection loss during editing (SC-30, E-13, D-10)<br>… ещё 2 |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| SC-31 | P0 | Читатель без доступа не видит страницу в поиске, подсказках, ссылках, API, файлах, истории и WebSocket | реализовано | search/suggest filter accessForPages (services/search.ts), backlinks/resolve/favorites filterVisible, attachments, revisions, WS; tests/integration/content.test.ts search applies ACL; tests/integration/collab.test.ts live channel; No single test enumerating all channels. |  |
| SC-32 | P0 | Смена роли действует на открытый редактор без возможности запрещённых изменений | реализовано | apps/server/src/collab/hub.ts recheckAccess sends ACCESS canEdit=false; tests/integration/collab.test.ts: revoking edit switches session to read-only (AT-78...) | tests/integration/collab.test.ts: read-only user cannot write; revoking edit switches session to read-only; revoking view cl |

### SECURITY

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| SC-33 | P0 | XSS/CSRF/SSRF/path traversal/ZIP-bomb/исполняемые файлы блокируются на сервере | реализовано | tests/integration/acl-p0.test.ts 'SC-33 R-SECURITY-008: …' (SSRF classification and fetcher: loopback, private, link-local/metadata, decimal and IPv6-mapped forms, unsafe schemes, credentials, redirects into the internal network), 'SC-33 R-SECURITY-002: XSS in imported HTML/Markdown …, CSRF …, path traversal …'; existing tests for executables, SVG, zip bomb (content.test.ts, import-export.test.ts) | tests/integration/content.test.ts: rejects executables even with a fake extension and dangerous types (SC-19, SC-33)<br>tests/integration/content.test.ts: sanitises SVG and serves user content in a sandbox (SC-12, SC-33, R-MEDIA-011)<br>tests/integration/import-pipeline.test.ts: antivirus quarantine for imports and archive restore (R-IMPORT-032, R-ARCHIVE-016, SC-33)<br>… ещё 5 |

### A11Y

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| SC-34 | P1 | Весь интерфейс без мыши; читаются метки кнопок и ошибок; контраст и reduced motion | частично | tests/e2e/a11y.spec.ts keyboard test (Ctrl+K, ?, Esc, tree arrows/Enter) + reduced-motion + axe contrast; keyboard pass covers switcher/help/tree only, not every screen | tests/e2e/a11y.spec.ts: keyboard only: quick switcher, help, dialogs close with Esc and return focus (UX-136, SC-3 |

### QA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| SC-35 | P1 | Chrome/Edge/Firefox/Safari, macOS/Windows, мобильные Safari/Chrome; матрица Ctrl/Cmd+C/V, вставки изображений, скачиваний DOCX/MD | ограничение окружения | n/a; only Chromium is installed (playwright.config.ts, DECISIONS D-18); OS/browser clipboard matrix untested |  |

### PERF

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| SC-36 | P1 | На медленной сети анимация и автосохранение не блокируют текст; видно реальное состояние | частично | tests/e2e/editor.spec.ts offline typing works (local-first Yjs); slow-network throttling not tested |  |

### OPS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| SC-37 | P1 | Без внешнего интернета: создание, редактирование, поиск, OCR, DOCX/MD импорт/экспорт в корпоративном контуре | требует ручной проверки | No SaaS dependencies; OCR data bundled (tesseract.js-data); PDF via local Chromium; Not tested in a network-isolated environment |  |

### IMPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| SC-38 | P1 | Перенос 1 000 страниц с вложениями; количество объектов, связи и ACL сверены контрольными запросами | частично | tests/integration/archive.test.ts on a small org; backup drill with 1 000 pages (docs/BACKUP_RESTORE.md §6); Archive migration of 1 000 pages not tested | tests/integration/archive.test.ts: organisation archive round trip (F06, V18-A01, V18-A02, V18-A03, V18-A04, V18-A24, SC-38,  |

### AUDIT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| SC-39 | P0 | Аудит показывает ключевые операции; рядовой пользователь не читает журнал чужого пространства | реализовано | tests/integration/core.test.ts: regular user cannot read the org audit log (SC-39) | tests/integration/core.test.ts: regular user cannot read the org audit log (SC-39) |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| SC-40 | P1 | Статусы всех действий: пусто, загрузка, ошибка, успех, нет доступа, конфликт, восстановлено; нет кликов «в никуда» | частично | sync-status, toasts, PageError, empty-state; no verification of every action result/state |  |

### QA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-QA-013 | P0 | P0-дефекты (потеря данных, обход прав, повреждение, XSS, сломанное копирование/экспорт, расхождение коллаборации) = 0 | процесс/документ | n/a; no defect registry, so 0 open P0 cannot be shown |  |
| R-QA-014 | P0 | Критические потоки §18 проходят E2E на релизной сборке во всех браузерах; без заглушек | частично | tests/e2e/server.mjs serves the built apps/web/dist; only Chromium is installed (playwright.config.ts, DECISIONS D-18); most §18 scenarios have no E2E |  |

### IMPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-IMPORT-019 | P0 | Точность конвертации по семантике: ≥99% символов эталонных DOCX/MD, 100% структурных элементов, нет бесшумной потери | реализовано | tests/support/doc-corpus.ts: deterministic reference corpus (6 DOCX + 6 MD, all supported constructs) with independent expected text/structure; character accuracy via diff; tests/integration/io-p0-import.test.ts: reference DOCX and Markdown corpus: ≥99% of characters and 100% of structural elements … (measured 100%, printed in CI log) | tests/integration/io-p0-import.test.ts: reference corpus accuracy (R-IMPORT-019)<br>tests/integration/io-p0-import.test.ts: reference DOCX and Markdown corpus: ≥99% of characters and 100% of structural elements sur |

### OCR

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-OCR-012 | P1 | OCR RU/EN character accuracy ≥95% на чётких скриншотах; отдельная матрица плохих изображений | частично | tests/integration/content.test.ts:'recognises Russian and English text on a screenshot…'; CER не измеряется (только regex), матрицы плохих изображений нет |  |

### CLIPBOARD

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-CLIPBOARD-013 | P1 | Копирование: 100% автоматизированных и ручных сценариев матрицы браузер×приложение | ограничение окружения | Только Chromium (D-18); Матрица браузер×приложение требует реальных Word/Excel/GDocs/почты и браузеров |  |

### PERF

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PERF-005 | P1 | SLO §15 подтверждены нагрузкой; восстановление и отзыв прав — отдельные протоколы | не реализовано | n/a; SLO not confirmed by load; no protocols |  |

### SECURITY

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-SECURITY-004 | P0 | Lighthouse/Web Vitals, accessibility audit, OWASP ASVS, SAST/DAST, dependency scan без критических находок | не реализовано | eslint only; No Lighthouse/Web Vitals, accessibility audit, ASVS review, SAST/DAST or dependency scanning configured. |  |

### PROCESS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PROCESS-027 | P1 | Этап 0: карта сущностей, design system, схема документа, прототипы 12 экранов и состояний, RBAC/ACL, тестовый набор DOCX/MD … | процесс/документ | n/a; stage-0 artifacts (design system, 12 screen prototypes, test DOCX/MD set) not in repo |  |
| R-PROCESS-028 | P1 | Этап 1: пространства, страницы, дерево, редактор, ACL, DOCX+MD, clipboard, поиск, медиа, автосохранение, версии, адаптивность | процесс/документ | features largely present; no stage acceptance record |  |
| R-PROCESS-029 | P1 | Этап 2: коллаборация/офлайн, OCR, комментарии, согласование, таблицы, аудит, бэкапы, шаблоны, SSO, перфоманс, мониторинг | процесс/документ | features partly present; no stage acceptance record; perf/monitoring incomplete |  |
| R-PROCESS-030 | P1 | Этап 3: анимации, удобства редактирования, diff версий, миграция архивов, браузерная регрессия, документация, испытания | процесс/документ | n/a; browser regression (multi-browser) and trials incomplete |  |
| R-PROCESS-031 | P0 | Полный продукт принимается только после всех этапов; этапность не разрешает заглушки | процесс/документ | n/a; acceptance pending all stages |  |

### OPS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-OPS-010 | P1 | Артефакт: репозиторий с кодом, схемами, миграциями, Docker-файлами и инструкцией запуска без закрытых секретов | частично | Dockerfile, deploy/*, deploy/env.example (no secrets), migrations, docs/OPERATIONS.md install; No README.md with clean-clone quick start in repo root |  |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-UI-025 | P2 | Артефакт: исходники дизайн-системы, спецификация компонентов, макеты desktop/tablet/mobile, states, motion guidelines | не реализовано | only tokens.css; no design-system sources, component spec, mockups or motion guidelines in repo |  |

### OPS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-OPS-011 | P1 | Артефакт: OpenAPI, схема БД, модель документа и конвертации, контракты websocket/ACL | частично | /api/v1/openapi.json, docs/ARCHITECTURE.md (data model, sync protocol), apps/server/migrations; No standalone DB schema document / WS protocol contract document |  |

### QA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-QA-015 | P1 | Артефакт: unit, integration, contract, E2E, load, security, accessibility тесты; fixtures DOCX/MD/изображений; отчёты прогонов | частично | unit/integration/E2E/resilience suites; tests/e2e/fixtures/scheme.png; no contract, load or accessibility tests; no archived run reports |  |

### OPS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-OPS-012 | P1 | Артефакт: документация развёртывания, миграции, обновления, диагностики, бэкапа и восстановления | реализовано | docs/OPERATIONS.md (install, config, upgrade/rollback, scaling, monitoring, logs, runbooks), docs/BACKUP_RESTORE.md, scripts/backup/wal-archive.md |  |

### PROCESS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PROCESS-032 | P2 | Артефакт: реестр ограничений конвертации и OCR, измерения качества, лицензии/SBOM | не реализовано | n/a; no SBOM, no conversion/OCR limitation registry |  |

### HELP

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-HELP-001 | P2 | Артефакт: пользовательская и админ-инструкции, обучающие примеры, демонстрационная база знаний | процесс/документ | in-app HelpCenter articles; seed.ts creates demo org (no demo content); No user/admin manuals, no training examples, no demo knowledge base content. |  |

### PROCESS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PROCESS-033 | P1 | Акт приёмки с трассировкой «пункт ТЗ → тест → результат → доказательство» | не реализовано | docs/REQUIREMENTS_TRACEABILITY.md (no results/evidence columns per run); no acceptance act |  |

### EDITOR

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-EDITOR-024 | P0 | Не заменять структурированную модель документа произвольным HTML или textarea | реализовано | Структурированная ProseMirror-схема + Yjs; apps/server/src/collab/ydoc.ts validateDoc; tests/integration/collab.test.ts:'rejects schema-invalid updates…' |  |
| R-EDITOR-025 | P1 | Не писать rich-text редактор с нуля; взять зрелую платформу и проверить ограничения до фиксации архитектуры | частично | Tiptap/ProseMirror (docs/ARCHITECTURE.md §3); В docs/DECISIONS.md нет решения о выборе редактора и проверке его ограничений |  |

### IMPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-IMPORT-020 | P0 | Импорт DOCX не готов при плоском тексте; экспорт MD не готов при потере изображений/ссылок без предупреждений | реализовано | tests/integration/import-export.test.ts: DOCX import asserts heading/list/table/image blocks; MD export warnings | tests/integration/import-export.test.ts: imports headings, nested lists, merged tables and images with a report; original kept (R-I |

### CLIPBOARD

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-CLIPBOARD-014 | P0 | Буфер не готов, если копируется только текст без таблиц, ссылок и форматирования | реализовано | PM text/html + text/plain; copyPage/TableToolbar пишут HTML и текст; tests/e2e/clipboard.spec.ts:'page menu copies the page…', 'table copy for Excel…' |  |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-UI-026 | P0 | Не создавать UI-элементы без работающих действий, ошибок, состояний и автотестов | частично | tests/e2e: 6 spec files, ~22 tests; most UI (admin, ShareDialog, trash, templates, import UI, export, OCR dialog) has no browser test |  |

### SECURITY

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-SECURITY-005 | P1 | Не подключать платные компоненты/внешние OCR без решения о лицензиях и передаче данных | реализовано | only OSS local components (tesseract.js, LibreOffice); decisions in docs/DECISIONS.md |  |

### OPS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-OPS-013 | P1 | Не использовать внешнюю базу знаний как источник истины без экспорта, миграции и аварийного восстановления | реализовано | All data in self-hosted PostgreSQL + own object store; org archive export (services/archive.ts) + backups |  |

### QA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-QA-016 | P0 | После каждого инкремента тесты в реальных браузерах, не только unit | реализовано | .github/workflows/ci.yml runs the Playwright suite (Chromium) on every push and PR; Chromium only (see R-QA-017); workflow runs not observed from this environment |  |

### EDITOR

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-EDITOR-026 | P1 | Для сложного блока описать представление во внутренней модели, DOCX, MD, clipboard и индексе | не реализовано | —; Нет документа с таблицей представлений сложных блоков (модель/DOCX/MD/clipboard/индекс) |  |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-UI-027 | P0 | Неподдерживаемая операция обязана иметь честное объяснение; молчаливая потеря данных запрещена | частично | Menu disabledReason now on every disabled page/tree action (tested for a view-only user in tests/e2e/ui-p0-interaction.spec.ts), import/export fidelity reports; not systematically verified for all operations |  |

### PROCESS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PROCESS-034 | P2 | Сверка с материалами: ProseMirror, Tiptap Conversion (Pro, проверить лицензию), Tiptap Markdown (beta), Yjs, Mammoth, PaddleOCR | частично | ARCHITECTURE.md mentions mammoth/remark; library limitations/licences (Tiptap Pro, Markdown beta, OCR engine) not in DECISIONS.md |  |

### SECURITY

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-SECURITY-006 | P1 | Загрузка файлов по OWASP File Upload Cheat Sheet | процесс/документ | controls implemented in routes/attachments.ts + services/attachments.ts (type sniffing, size limit, safe filename, sandboxed serving, optional AV); No written OWASP File Upload checklist document. |  |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-UI-028 | P1 | Сотрудник не задумывается, как сохранить, вставить/скопировать, работать с таблицей, найти на скриншоте, передать документ … | требует ручной проверки | n/a; usability test of key operations not performed |  |

### COLLAB

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-COLLAB-012 | P0 | Редактирование прямо на странице без кнопки «Сохранить»; статус синхронизации всегда виден | реализовано | apps/web/src/editor/Editor.tsx, apps/web/src/components/page/SyncStatus.tsx, apps/web/src/pages/PageView.tsx; Кнопки «Сохранить» нет; статус скрыт в режиме чтения опубликованной версии (ожидаемо) | tests/e2e/collab.spec.ts: two people edit the same page: changes converge, presence is shown, revoking edit makes it |

### PROCESS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PROCESS-035 | P2 | Ориентир Notion без копирования фирменных материалов и кода; оценка по сценариям, не пикселям | требует ручной проверки | n/a; scenario comparison not performed |  |

### EDITOR

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-EDITOR-027 | P1 | Единообразие действий (вставить, перетащить, загрузить, открыть, отменить, восстановить) в странице, таблице и вложенном блоке | требует ручной проверки | uploads.ts, blockOps.ts работают в doc/таблице/колонке/выноске; Единообразие в трёх контекстах — ручная проверка; тестов нет |  |

### IMPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-IMPORT-021 | P0 | Единый конвейер: DOCX, MD, CSV, XLSX, буфер (text/html, text/plain, text/markdown, изображения, файлы); пакетно … | частично | services/importer.ts analyzeImport for DOCX/MD/ZIP/HTML/CSV/XLSX; Clipboard paste uses a separate client-side pipeline | tests/integration/io-p0-import.test.ts: long Cyrillic names with special characters, an empty file, a large file and a broken file |
| R-IMPORT-022 | P1 | Точки входа: кнопка «Импорт», /import, DnD на страницу/раздел, Ctrl/Cmd+V, меню таблицы «Импортировать данные», «Вставить как…» | частично | Import button (Sidebar, Home, SpacePage), /import route, Ctrl/Cmd+V paste; No DnD onto page/tree section, no table menu "Импортировать данные", no "Вставить как…" |  |
| R-IMPORT-023 | P1 | Предпросмотр до подтверждения: цель, количество страниц/строк/изображений, типы столбцов, предупреждения … | частично | ImportPage preview: target, pages/stats, rows, column types, warnings; Implemented; no browser (e2e) test |  |
| R-IMPORT-024 | P0 | Импорт — идемпотентная задача с ID, прогрессом, журналом ошибок, отменой до фиксации; частичный успех явно обозначен | реализовано | tests/integration/import-export.test.ts: same idempotency key; cancel; per-file status ok/warning/error | tests/integration/import-export.test.ts: same idempotency key does not create a second job (AT-73, R-IMPORT-024, E-09) |

### SECURITY

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-SECURITY-007 | P0 | Оригинал сохраняется по политике; проверка MIME, размера, вирусов, zip-bomb, URL, HTML, макросов; без исполнения встроенного кода | реализовано | antivirus for attachments, imports (incl. assets inside ZIP/DOCX) and archive restore; type sniffing; tests/integration/acl-p0.test.ts 'R-SECURITY-007: malicious fixtures are rejected …' (fake clamd INSTREAM: infected attachment and import rejected and audited, disguised PE/ELF rejected, clean original byte-exact); tests/integration/import-pipeline.test.ts; Verified against a protocol-compatible fake clamd; a real ClamAV daemon is not available in this environment (CLAMAV_HOST). | tests/integration/acl-p0.test.ts: malicious inputs (SC-33, R-SECURITY-002, R-SECURITY-007)<br>tests/integration/acl-p0.test.ts: R-SECURITY-007: malicious fixtures are rejected — infected attachment and import (antiviru |

### IMPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-IMPORT-025 | P0 | DOCX: Heading 1–6, абзацы, inline-стили, ссылки, уровни нумерации, цитаты, таблицы, изображения, подписи, разделители, сноски | реализовано | tests/integration/io-p0-import.test.ts: Word captions, footnotes, three numbering levels …(Heading 1–6, separators); reference corpus … 100% structural elements; inline styles via formatting test | tests/integration/io-p0-import.test.ts: Word captions, footnotes, three numbering levels, headers/footers, bookmarks and the TOC f<br>tests/integration/io-p0-import.test.ts: reference DOCX and Markdown corpus: ≥99% of characters and 100% of structural elements sur |
| R-IMPORT-026 | P0 | Word-заголовки становятся настоящими заголовками с оглавлением и якорями | реализовано | Heading bookmarks become block anchors and internal hyperlinks are re-pointed to them; Word TOC field → live TOC block; export writes bookmarks + internal links; tests/integration/io-p0-import.test.ts: Word captions … bookmarks and the TOC field…; tests/integration/io-p0-export.test.ts: docToDocx output … keeps anchors as bookmarks and internal links | tests/integration/io-p0-export.test.ts: docToDocx output for imported-style content keeps anchors as bookmarks and internal links <br>tests/integration/io-p0-import.test.ts: Word captions, footnotes, three numbering levels, headers/footers, bookmarks and the TOC f |
| R-IMPORT-027 | P0 | Картинки из DOCX — отдельные assets с порядком, подписью, alt и привязкой к блоку; без битых внешних ссылок | реализовано | tests/integration/io-p0-import.test.ts: … images are page assets with order, alt and caption (attachments of the page, served, no external/broken src) | tests/integration/io-p0-import.test.ts: Word captions, footnotes, three numbering levels, headers/footers, bookmarks and the TOC f |
| R-IMPORT-028 | P0 | Merge-ячейки, плавающие объекты, SmartArt, комментарии, track changes — точный отчёт; текст не теряется; исходник прилагается | реализовано | inspectDocx reports merged cells, floating objects, SmartArt, comments, track changes; source kept; tests/integration/import-export.test.ts; Only merged-cells case tested | tests/integration/import-export.test.ts: imports headings, nested lists, merged tables and images with a report; original kept (R-I |
| R-IMPORT-029 | P0 | CommonMark/GFM: заголовки, списки, ссылки, таблицы, fenced code с языком, изображения, цитаты, чекбоксы, линии; YAML front matter | реализовано | tests/unit/markdown.test.ts (GFM, footnotes, alerts, details); front matter parsed |  |

### SECURITY

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-SECURITY-008 | P0 | Относительные пути изображений из ZIP; удалённые изображения копируются с проверкой URL/SSRF | реализовано | services/remote-fetch.ts (SSRF-guarded fetcher: every resolved address checked, pinned connection, re-checked redirects, size/time limits, REMOTE_FETCH_ALLOW_HOSTS) + services/remote-images.ts (import copies remote images as attachments, internal addresses removed with a report warning); tests/integration/acl-p0.test.ts 'R-SECURITY-008: on import remote images are copied …', 'SC-33 R-SECURITY-008: …'; Images in pasted HTML are still hot-linked by the browser (docs/SECURITY.md limitation 1). | tests/integration/acl-p0.test.ts: SSRF-guarded remote images (R-SECURITY-008, SC-33)<br>tests/integration/acl-p0.test.ts: SC-33 R-SECURITY-008: internal, loopback, link-local, mapped and reserved addresses are cl<br>tests/integration/acl-p0.test.ts: SC-33 R-SECURITY-008: the fetcher refuses internal targets, unsafe schemes, credentials an<br>… ещё 1 |

### CLIPBOARD

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-CLIPBOARD-015 | P0 | Вставка из Word, Google Docs, браузера, ChatGPT, MD-редакторов: анализ MIME, сохранение семантики, очистка HTML; не одним абзацем | реализовано | apps/web/src/editor/extensions/paste.ts SmartPaste (TSV / Markdown / санитизированный HTML); tests/e2e/collab.spec.ts:'paste: spreadsheet range becomes a table; Markdown becomes formatted blocks'; tests/e2e/clipboard.spec.ts |  |
| R-CLIPBOARD-016 | P1 | Вставка Markdown: «распознать разметку» / «вставить исходный текст»; HTML сохраняет заголовки, списки, ссылки, таблицы, картинки | частично | apps/web/src/editor/extensions/paste.ts SmartPaste looksLikeMarkdown; Ctrl+Shift+V — исходный текст; Выбора режима нет (только эвристика/горячая клавиша); картинки из HTML не загружаются |  |

### MEDIA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-MEDIA-006 | P0 | Изображение из буфера: локальный предпросмотр сразу, фоновая загрузка; ошибка не уничтожает блок и позволяет повторить | реализовано | apps/web/src/editor/extensions/uploads.ts (блок image/fileBlock с uploadId сразу в документе, завершение на месте без шага Undo); apps/web/src/lib/pendingUploads.ts (файл в IndexedDB до сохранения на сервере, возобновление); nodeviews/UploadPlaceholder.tsx (превью, прогресс, «Повторить»/«Убрать»); components/page/SyncStatus.tsx «Загрузка файлов…» вместо «Сохранено», пока файл не на сервере; tests/e2e/editor-p0-media.spec.ts:'pasted image: instant local preview, upload error keeps the block, retry completes it with alt…', 'closing the tab during an image upload…', 'cancelling an upload removes only that block…' | tests/e2e/editor-p0-media.spec.ts: pasted image: instant local preview, upload error keeps the block, retry completes it with<br>tests/e2e/editor-p0-media.spec.ts: closing the tab during an image upload: the block and the file are restored and the upload<br>tests/e2e/editor-p0-media.spec.ts: cancelling an upload removes only that block (R-MEDIA-006) |

### HISTORY

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-HISTORY-009 | P0 | Ctrl/Cmd+Z отменяет массовую вставку одной операцией с сохранением позиции курсора | реализовано | apps/web/src/editor/extensions/blockIds.ts, apps/web/src/editor/clientExtensions.ts; tests/e2e/undo.spec.ts (one undo reverts a paste of 100 blocks …) | tests/e2e/undo.spec.ts: one undo reverts a paste of 100 blocks and keeps the cursor position (AT-47, R-HISTORY-009 |

### COLLECTION

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-COLLECTION-001 | P1 | Разделение простой таблицы в тексте и структурированной коллекции (строка = запись-страница, типизированные столбцы) | реализовано | special.ts CollectionView; Editor.tsx insertCollection (spaceId/parentId); blocks.tsx CollectionBlockView; tests/e2e/clipboard.spec.ts:'registry block from the slash menu…' | tests/e2e/clipboard.spec.ts: registry block from the slash menu shows the new collection (R-COLLECTION-001) |

### IMPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-IMPORT-030 | P1 | CSV: автоопределение UTF-8/Windows-1251, разделитель , ; tab, кавычки, заголовки, локаль дат/чисел, пустые; предпросмотр 100 строк | реализовано | tests/integration/import-export.test.ts: Windows-1251, ";", quotes, decimal comma; 100-row preview server and ImportPage; tests/integration/import-pipeline.test.ts | tests/integration/import-pipeline.test.ts: XLSX range selection and 100-row preview (R-IMPORT-031, R-IMPORT-041, R-IMPORT-030, R-IMPO<br>tests/integration/import-pipeline.test.ts: previews up to 100 rows and imports only the selected range (R-IMPORT-031, R-IMPORT-041, R<br>tests/integration/import-export.test.ts: CSV in Windows-1251 with ";" and decimal comma, quotes and leading zeros; repeated upsert  |
| R-IMPORT-031 | P1 | XLSX: выбор листа и диапазона, заголовки, даты/числа; формулы как значения с предупреждением; без макросов и внешних ссылок | реализовано | TabularOptions.range (A1:D50) for XLSX/CSV, dry-run preview of the range; ImportPage "Диапазон" field; tests/integration/import-pipeline.test.ts: imports only the selected range | tests/integration/import-pipeline.test.ts: XLSX range selection and 100-row preview (R-IMPORT-031, R-IMPORT-041, R-IMPORT-030, R-IMPO<br>tests/integration/import-pipeline.test.ts: previews up to 100 rows and imports only the selected range (R-IMPORT-031, R-IMPORT-041, R<br>tests/integration/import-pipeline.test.ts: rejects a malformed or empty range with a clear error (R-IMPORT-031)<br>… ещё 1 |

### COLLECTION

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-COLLECTION-002 | P1 | Мастер сопоставления: текст, число, дата, checkbox, select, URL, email, пользователь, файл; подсветка несовместимых … | частично | apps/web/src/pages/ImportPage.tsx типы столбцов + «не распознано»; importer.ts tabularDryRun; Типы «пользователь» и «файл» в мастере отсутствуют |  |
| R-COLLECTION-003 | P0 | Режимы: новая таблица, добавить строки, обновить по ключу (dry-run + подтверждение), заменить диапазон; нет скрытых дублей при повторе | частично | importer.ts new/append/upsert + dry-run; ImportPage «В существующую», режим и ключевой столбец; пробный прогон обязателен; tests/integration/import-export.test.ts:'CSV in Windows-1251… (AT-48, UX13-17, AT-50, R-COLLECTION-003)'. Нет «заменить диапазон» | tests/integration/import-export.test.ts: CSV in Windows-1251 with ";" and decimal comma, quotes and leading zeros; repeated upsert  |

### CLIPBOARD

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-CLIPBOARD-017 | P1 | Вставка диапазона Excel/Sheets создаёт корректную сетку; табличный буфер TSV + HTML; экспорт выделения в CSV | частично | apps/web/src/editor/extensions/paste.ts SmartPaste (вставка TSV/HTML Excel, копирование TSV+HTML); Экспорта выделения в CSV нет; HTML Excel 20×10 не проверялся | tests/e2e/clipboard.spec.ts: table copy for Excel puts TSV and an HTML table on the clipboard (R-CLIPBOARD-006, R-CLIPB |

### TABLE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-TABLE-004 | P1 | Простая таблица: строки/столбцы, перемещение, ширина, выравнивание, диапазон, копирование, закрепление заголовка, клавиатура | частично | apps/web/src/editor/menus/TableToolbar.tsx; Tab-навигация; Нет перемещения строк/столбцов и закрепления заголовка |  |

### COLLECTION

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-COLLECTION-004 | P1 | Коллекция: типы полей, строки-страницы, фильтры AND/OR, мультисортировка, группировка, колонки, массовая правка, поиск, итоги … | частично | apps/server/src/routes/collections.ts query (AND/OR, мультисортировка, группировка, итоги, поиск), rows/bulk; Веб-интерфейса коллекции нет (нет страницы/таблицы реестра с фильтрами, сортировкой, массовой правкой, экспортом) |  |
| R-COLLECTION-005 | P1 | Виртуализация больших таблиц, без потери фокуса при прокрутке, клавиатурная навигация, сохранение вида, одновременные правки | частично | apps/server/src/routes/collections.ts PATCH rows (cell_conflict 409); Виртуализации, клавиатуры, сохранения вида в UI нет; 10 000 строк не проверялись |  |
| R-COLLECTION-006 | P2 | Не превращать систему в CRM: коллекции для реестров регламентов, оборудования, стандартов, справочников | реализовано | Коллекции без CRM-функций |  |

### PAGE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PAGE-011 | P1 | Иконка страницы и записи: emoji/библиотека/своя; поиск, замена, удаление; одинаково в дереве, крошках и поиске | частично | apps/web/src/components/IconPicker.tsx; Только emoji; своей/библиотечной (SVG/загруженной) иконки нет |  |
| R-PAGE-012 | P2 | Обложка: загрузка, кадрирование/позиционирование, удаление; без пустой области при отсутствии | не реализовано | apps/server/src/routes/pages.ts (cover принимается API); UI обложки отсутствует |  |

### FILES

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-FILES-002 | P1 | Вложения: DnD, Ctrl/Cmd+V, выбор, пакетно, прогресс каждого, пауза/повтор, предпросмотр, скачать, ссылка, переименовать, удалить по правам | частично | apps/web/src/editor/extensions/uploads.ts (DnD, Ctrl+V, выбор, пакетно, прогресс, отмена, повтор); FileView (предпросмотр, скачать); Нет паузы, переименования и удаления вложения в UI (API PATCH/DELETE есть), копирования ссылки на файл |  |

### MEDIA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-MEDIA-007 | P0 | Изображения inline/блоком, размер, выравнивание, подпись, alt, lightbox, оригинал; thumbnail не заменяет оригинал; не теряются при переносе | частично | apps/web/src/editor/nodeviews/ImageView.tsx; apps/server/src/services/attachments.ts makeImageDerivatives (оригинал не меняется); tests/integration/content.test.ts:'uploads an image, stores the original byte-exact with checksum…'. Нет inline-изображений в строке; копия блока на другую страницу ссылается на вложение исходной страницы (права) |  |

### FILES

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-FILES-003 | P0 | Для файлов: checksum, версия, автор, дата, размер, ссылочная целостность; скачивание по правам страницы | реализовано | apps/server/src/routes/attachments.ts attachmentDto (sha256, version, size), loadAttachment; tests/integration/content.test.ts:'files of a private page are not accessible…', 'respects download policy…' | tests/integration/content.test.ts: uploads an image, stores the original byte-exact with checksum, creates previews (A10, R-M<br>tests/integration/content.test.ts: replacing a file creates a new version; old version restorable (R-FILES-003, R-MEDIA-013) |

### COLLAB

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-COLLAB-013 | P1 | Оптимистичное обновление UI: символы, блоки, иконки, строки, перемещения сразу; подтверждение асинхронно | реализовано | packages/shared/src/collab-client.ts (локальное применение, ACK асинхронно), apps/web/src/layout/treeActions.tsx |  |
| R-COLLAB-014 | P0 | Статусы «Сохраняется», «Сохранено», «Нет сети», «Не удалось синхронизировать»; «Сохранено» только после фиксации | реализовано | apps/web/src/components/page/SyncStatus.tsx (Сохранение…/Сохранено/Нет связи/Сохранено на устройстве/Ошибка сохранения); Формулировки отличаются от ТЗ, семантика совпадает | tests/integration/collab.test.ts: "saved" is reported only after the update is committed to the journal (E-13, D-10, R-COLLA |
| R-COLLAB-015 | P0 | WebSocket/Yjs или эквивалент для presence, курсоров, блоков и таблиц; reconnect с экспоненциальной задержкой и сверкой пропущенных | реализовано | packages/shared/src/collab-client.ts#scheduleReconnect (exp backoff + jitter), HELLO/SYNC по state vector |  |

### OFFLINE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-OFFLINE-002 | P0 | Локальный журнал (IndexedDB) неподтверждённых операций, восстановление после закрытия/сбоя, синхронизация; конфликт по операциям | реализовано | apps/web/src/sync/idb.ts, packages/shared/src/collab-client.ts#restorePending; tests/integration/collab.test.ts (pending store); Тест — на уровне провайдера в Node, не в браузере | tests/integration/collab.test.ts: unacknowledged changes survive a client restart via the pending store (AT-58, UX23-219, E- |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ACL-018 | P0 | Фоновое обновление дерева, поиска, комментариев, прав; при изменении доступа немедленная блокировка запрещённых операций | реализовано | events WS /api/v1/events (tree-changed, access-changed, comments-changed), hub.recheckAccess on acl-changed |  |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-UI-029 | P1 | Микроанимации 120–220 мс для hover, меню, перестановки, дерева; не анимировать ввод; reduced-motion | частично | tokens.css motion 120–240 ms, chevron/menu/drawer use tokens; no measurement/test |  |

### PERF

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PERF-006 | P1 | Ввод p95 <50 мс; локальная правка <100 мс; удалённая правка p95 <500 мс; восстановление после обрыва <10 с | частично | tests/e2e/perf-typing.spec.ts, scripts/load/collab-load.mjs (remote p95), docs/PERFORMANCE.md; input p95 not met at 4x; remote edit p95 1.4 s at 100+20 (143 ms at 20+5); reconnect not measured |  |

### COLLAB

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-COLLAB-016 | P0 | ACK только после durable commit; журнал операций и снимки; контроль целостности; атомарные изменения структуры | реализовано | apps/server/src/collab/hub.ts#persist (ACK после commit транзакции), validateDoc | tests/integration/collab.test.ts: "saved" is reported only after the update is committed to the journal (E-13, D-10, R-COLLA |

### HISTORY

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-HISTORY-010 | P0 | История независима от UI; удаление через корзину; политика хранения версий и вложений задаётся админом | реализовано | apps/web/src/admin/OrgSettingsSection.tsx, apps/server/src/jobs/worker.ts#maintenance |  |

### BACKUP

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-BACKUP-006 | P0 | Бэкапы БД, объектов, метаданных; шифрование, offsite, ежемесячный тест восстановления; RPO ≤5 мин, RTO ≤2 ч | частично | backup.sh (DB+objects+metadata, encryption hook), wal-archive.sh, verify-backup.sh; Offsite copy and monthly restore test are operational procedures not yet run; RPO/RTO only at test scale |  |

### COLLAB

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-COLLAB-017 | P0 | Запрет ложного «сохранено»; при нехватке места/отказе/нет прав — ошибка, локальная копия, экспорт черновика | реализовано | packages/shared/src/collab-client.ts (persist_failed → «Ошибка сохранения»; квота → ошибка), apps/web/src/editor/Editor.tsx#LocalCopyGuard/downloadLocalCopy, apps/server/src/collab/hub.ts#faults (тестовая инъекция); tests/e2e/collab-p0-storage.spec.ts, tests/unit/collab-p0.test.ts (persist_failed …); Ложного «Сохранено» нет; при переполнении хранилища, сбое сервера и отзыве прав — видимая ошибка и скачивание локальной копии | tests/unit/collab-p0.test.ts: server storage failure is visible (AT-59, R-COLLAB-017)<br>tests/unit/collab-p0.test.ts: persist_failed turns the status into an error with an explanation (never "Сохранение…" for<br>tests/e2e/collab-p0-storage.spec.ts: the server cannot store changes: visible error (never endless "Сохранение…"), local copy o |

### IMPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| AT-41 | P0 | DOCX с H1–H4, вложенными списками, таблицами, изображениями → корректные редактируемые блоки | реализовано | tests/integration/import-export.test.ts | tests/integration/import-export.test.ts: DOCX import (SC-13, SC-14, AT-41, AT-42) |
| AT-42 | P0 | DOCX с merge-ячейками → отчёт о поддержанных/изменённых элементах, оригинал сохранён | реализовано | tests/integration/import-export.test.ts | tests/integration/import-export.test.ts: DOCX import (SC-13, SC-14, AT-41, AT-42) |
| AT-43 | P0 | Markdown ZIP с относительными картинками → страницы без битых ссылок | реализовано | tests/integration/import-export.test.ts | tests/integration/import-export.test.ts: Markdown ZIP (SC-15, AT-43, AT-69) |

### CLIPBOARD

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| AT-44 | P0 | Вставка из Word сохраняет структуру заголовков и списков | реализовано | apps/web/src/editor/clipboard/html.ts convertWordLists; tests/unit/clipboard-html.test.ts:'AT-44…'; tests/e2e/clipboard.spec.ts:'Word paste…' | tests/unit/clipboard-html.test.ts: Word lists (AT-44, UX13-02, R-CLIPBOARD-020)<br>tests/unit/clipboard-html.test.ts: AT-44: Word list paragraphs become nested bullet and numbered lists<br>tests/e2e/clipboard.spec.ts: Word paste keeps headings, nested and numbered lists, links and tables without Office styl |

### SECURITY

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| AT-45 | P0 | Вставка HTML из браузера не исполняет скрипты, не теряет безопасные ссылки | реализовано | ProseMirror schema parsing drops scripts; sanitizeUrl keeps http/https/mailto/tel links (packages/shared/src/editor/url.ts); No dedicated paste-XSS test. |  |

### MEDIA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| AT-46 | P1 | Вставка скриншота сразу показывает превью и надёжно завершает загрузку | реализовано | apps/web/src/editor/extensions/uploads.ts (мгновенное превью, ожидание сети, повтор); Без теста |  |

### HISTORY

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| AT-47 | P0 | Отмена вставки 100 блоков одной командой Undo | реализовано | apps/web/src/editor/extensions/blockIds.ts; tests/e2e/undo.spec.ts (one undo reverts a paste of 100 blocks …) | tests/e2e/undo.spec.ts: one undo reverts a paste of 100 blocks and keeps the cursor position (AT-47, R-HISTORY-009 |

### IMPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| AT-48 | P1 | CSV с «;», Windows-1251, десятичной запятой импортируется после выбора параметров | реализовано | tests/integration/import-export.test.ts | tests/integration/import-export.test.ts: tabular import (AT-48, AT-49, AT-50, UX13-17)<br>tests/integration/import-export.test.ts: CSV in Windows-1251 with ";" and decimal comma, quotes and leading zeros; repeated upsert  |
| AT-49 | P1 | XLSX с 3 листами: выбор листа/диапазона, числа и даты сохранены | реализовано | tests/integration/import-export.test.ts | tests/integration/import-pipeline.test.ts: previews up to 100 rows and imports only the selected range (R-IMPORT-031, R-IMPORT-041, R<br>tests/integration/import-export.test.ts: tabular import (AT-48, AT-49, AT-50, UX13-17)<br>tests/integration/import-export.test.ts: XLSX with three sheets: pick a sheet, numbers and dates kept, formulas as values (AT-49, A |

### COLLECTION

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| AT-50 | P0 | Повторный импорт в существующую таблицу — dry-run, без скрытых дублей | реализовано | importer.ts upsert + dry-run; ImportPage (существующая коллекция, обязательный пробный прогон); GET /api/v1/collections?spaceId; tests/integration/import-export.test.ts:'CSV in Windows-1251… (…AT-50…)' | tests/integration/import-export.test.ts: tabular import (AT-48, AT-49, AT-50, UX13-17)<br>tests/integration/import-export.test.ts: CSV in Windows-1251 with ";" and decimal comma, quotes and leading zeros; repeated upsert  |

### CLIPBOARD

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| AT-51 | P1 | Вставка диапазона 20×10 из Excel сохраняет геометрию и значения | частично | HTML-таблица Excel → table; TSV fallback; tests/e2e/collab.spec.ts:'paste: spreadsheet range becomes a table; Markdown becomes formatted blocks' — только TSV 3×3; 20×10 из Excel не проверялся |  |

### COLLECTION

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| AT-52 | P1 | Фильтры, сортировка, группы, закрепление колонок, итоги на 10 000 строк | частично | apps/server/src/routes/collections.ts query; Закрепления колонок и UI нет; производительность на 10 000 строк не измерена |  |

### PAGE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| AT-53 | P1 | Иконка обновляется в заголовке, дереве и поиске без перезагрузки | реализовано | apps/web/src/pages/PageView.tsx#patchPage, apps/web/src/hooks/useEvents.ts (page-changed/tree-changed); нет автотеста |  |

### FILES

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| AT-54 | P1 | Пакетная загрузка 20 файлов: индивидуальные ошибки и повторы | реализовано | apps/web/src/editor/extensions/uploads.ts — каждый файл отдельным запросом, своя ошибка/повтор; Без теста на 20 файлов |  |

### TREE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| AT-55 | P0 | Перемещение страницы с изображениями не ломает медиа и права | реализовано | apps/server/src/services/pages.ts#movePage (вложения привязаны к page_id), tests/integration/acl.test.ts |  |

### COLLAB

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| AT-56 | P0 | Два редактора меняют один абзац и соседние строки таблицы без потерь | реализовано | tests/integration/collab-p0.test.ts (two editors change one table cell and neighbouring rows …), tests/e2e/collab-p0-editing.spec.ts | tests/integration/collab-p0.test.ts: many editors, tables, moves (QA26-19, AT-56, SC-25, R-COLLAB-024, R-COLLAB-032)<br>tests/integration/collab-p0.test.ts: two editors change one table cell and neighbouring rows while a third adds a row; the merg<br>tests/e2e/collab-p0-editing.spec.ts: two editors change a paragraph, one table and the structure while one loses the connection |

### OFFLINE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| AT-57 | P0 | Обрыв сети при вводе: «Нет сети», локальное хранение, восстановление после подключения | реализовано | tests/integration/collab.test.ts, tests/e2e/editor.spec.ts offline | tests/integration/collab.test.ts: offline edits are kept locally and synchronised after reconnect, concurrent with others (S<br>tests/e2e/editor.spec.ts: offline edits are kept locally and delivered after reconnect (E220, AT-57) |
| AT-58 | P0 | Закрытие вкладки до ACK не уничтожает локальный черновик | реализовано | tests/integration/collab.test.ts (pending store, AT-58); Проверено на уровне провайдера (Node), не в браузере | tests/integration/collab.test.ts: unacknowledged changes survive a client restart via the pending store (AT-58, UX23-219, E- |

### COLLAB

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| AT-59 | P0 | Отказ хранилища: нет ложного «Сохранено», безопасное восстановление/экспорт | реализовано | packages/shared/src/collab-client.ts (serverFailing), apps/web/src/editor/Editor.tsx#LocalCopyGuard; tests/e2e/collab-p0-storage.spec.ts (the server cannot store changes …), tests/unit/collab-p0.test.ts, tests/resilience/db-connection-loss.test.ts | tests/unit/collab-p0.test.ts: server storage failure is visible (AT-59, R-COLLAB-017)<br>tests/unit/collab-p0.test.ts: persist_failed turns the status into an error with an explanation (never "Сохранение…" for<br>tests/e2e/collab-p0-storage.spec.ts: the server cannot store changes: visible error (never endless "Сохранение…"), local copy o |

### BACKUP

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| AT-60 | P0 | Восстановление БД и файлов из бэкапа с проверкой контрольных сумм и ссылок | реализовано | tests/resilience/backup-restore.test.ts: restores content…; a damaged backup is rejected (sha256 / SHA256SUMS) | tests/resilience/backup-restore.test.ts: backup → restore drill (SC-30, AT-60, AT-87, V16-S20, OPS-011, QA26-18)<br>tests/resilience/backup-restore.test.ts: a damaged backup is rejected by restore and verification (E-08, AT-60) |

### QA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-QA-017 | P0 | §24 выполнен только после демонстрации в Chrome, Firefox, Safari (mobile по матрице), видеозаписи, автотестов … | ограничение окружения | n/a; only Chromium is installed (playwright.config.ts, DECISIONS D-18); no Firefox/Safari demos or video recordings |  |

### PROCESS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PROCESS-036 | P2 | Эталон — наблюдаемое поведение Notion (Help Center), без копирования кода, графики, пиксельной идентичности; без таск-менеджмента | требует ручной проверки | n/a; Help Center scenario comparison not performed |  |

### PAGE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PAGE-013 | P1 | «Новая статья» в дереве, шапке пространства и Ctrl/Cmd+N; открытие без модального мастера | частично | apps/web/src/layout/Sidebar.tsx, apps/web/src/layout/SidebarTree.tsx, apps/web/src/pages/SpacePage.tsx; Ctrl/Cmd+N не реализован |  |
| R-PAGE-014 | P1 | Фокус в названии; Enter — первый блок; пустая статья предлагает «Написать», «Импортировать», «Шаблон», «Таблица» | частично | apps/web/src/editor/Editor.tsx (фокус в названии, Enter → первый блок); Пустая статья не предлагает «Написать/Импортировать/Шаблон/Таблица» (только placeholder) |  |
| R-PAGE-015 | P1 | Название, иконка, обложка, статус, местоположение меняются без перезагрузки; иконка emoji/SVG/загруженная с fallback и правами | частично | apps/web/src/pages/PageView.tsx; Название/иконка/статус/место без перезагрузки; обложки нет, иконки только emoji |  |

### TEMPLATES

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-TEMPLATES-003 | P2 | Шаблоны: регламент, инструкция, FAQ, техрешение, паспорт продукта, onboarding; админ задаёт обязательные метаданные и шаблоны пространства | частично | apps/server/src/routes/templates.ts spaceId, requiredProperties; Обязательные метаданные не применяются при создании страницы и не настраиваются в UI |  |

### A11Y

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-A11Y-004 | P1 | В каждом состоянии клавиатурная навигация, видимый фокус, корректный undo/redo, без потери выделения при открытии меню | частично | tests/e2e/content.spec.ts comment on a selection keeps selection when opening the comment action; undo/redo and focus visibility per state not tested |  |

### EDITOR

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-EDITOR-028 | P0 | Блоки: абзац, H1–H3, списки, чек-лист, цитата, callout, toggle, код, таблица, изображение, файл, видео/ссылка, разделитель, оглавление … | реализовано | apps/web/src/editor/commands.tsx SLASH_COMMANDS (все перечисленные типы); tests/e2e/editor.spec.ts:'slash menu inserts a table and a callout; "> " creates a toggle'; tests/e2e/content.spec.ts:'image: upload via file chooser, resize presets, caption, full-screen viewer with zoom' |  |
| R-EDITOR-029 | P1 | Slash-меню: фильтр по названию и синонимам RU/EN, стрелки/Enter/Esc, популярные первыми, не мешает вводу путей и URL | частично | suggest.tsx slashExtension allow(); commands.tsx filterCommands; «/usr/bin» в начале строки открывает меню; нет «популярные/недавние первыми» |  |
| R-EDITOR-030 | P1 | Hover-плюс и drag-handle (и клавиатурно); DnD с направляющей, вложением, автопрокруткой; undo восстанавливает положение | частично | apps/web/src/editor/menus/BlockHandle.tsx DragHandle; Dropcursor; Yjs undo; Нет теста DnD+Undo; вложение «внутрь» и подсветка контейнера отсутствуют |  |
| R-EDITOR-031 | P1 | Панель выделения: жирный, курсив, подчёркивание, зачёркивание, code, ссылка, цвет/фон, комментарий … | реализовано | apps/web/src/editor/menus/BubbleToolbar.tsx (flip/shift в viewport); tests/e2e/content.spec.ts:'comment on a selection…' использует кнопку панели |  |
| R-EDITOR-032 | P0 | Многоабзацное и частичное выделение, copy/cut/paste между страницами, преобразование типа с сохранением текста, Enter/Backspace/Tab | реализовано | ProseMirror selection/clipboard; turnIntoItems; Без автотестов конверсии/копирования между страницами |  |

### LAYOUT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-LAYOUT-002 | P1 | Вложенные колонки с responsive-перестройкой; ширина обычная/широкая, шрифт и размер — настройки без порчи семантики | частично | shared columns node; editor.css:173 grid stacks ≤640px; page wide toggle; page-level font/size settings absent; untested |  |

### CLIPBOARD

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-CLIPBOARD-018 | P0 | Копирование text/plain + text/html, Markdown по команде; внутренний формат с ID/типами без утечки прав; вставка: внутренний → HTML → plain | частично | apps/web/src/editor/clipboard/html.ts cleanCopiedDom/cleanPastedHtml (внутренние ссылки), ClientBlockIds; Вложение, скопированное на другую страницу, проверяется по правам исходной страницы (читатели новой получат 404) | tests/unit/clipboard-html.test.ts: copied HTML (R-CLIPBOARD-004, R-CLIPBOARD-018)<br>tests/unit/clipboard-html.test.ts: R-CLIPBOARD-018: makes URLs absolute and removes comment anchors and DOM ids, keeps block  |

### EDITOR

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-EDITOR-033 | P0 | IME, кириллица, emoji, длинные URL, автозамены, вставка 50+ страниц текста не ломают курсор и историю | реализовано | extensions/paste.ts (stopCapturing до и после вставки: Undo отменяет ровно вставку); Markdown-автозамены (input rules) с отменой Backspace; tests/e2e/editor-p0-core.spec.ts:'a document of 100 000+ characters (50+ pages pasted at once) stays editable: caret after the paste, one undo step, saved in full (R-EDITOR-021, R-EDITOR-033)', 'Cyrillic, Russian quotes, emoji and a very long URL…'; автозамены — 'key matrix…' | tests/e2e/editor-p0-core.spec.ts: Cyrillic, Russian quotes, emoji and a very long URL are typed, saved and laid out correctl<br>tests/e2e/editor-p0-core.spec.ts: a document of 100 000+ characters (50+ pages pasted at once) stays editable: caret after t |

### IMPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-IMPORT-032 | P0 | Конвейер: upload → quarantine/antivirus → detection → parse → normalize → media → validation → preview/diff → commit → indexing | реализовано | importer.ts assertClean in storeBuffer (upload, every ZIP/DOCX asset, sources; fail-closed), stage log upload→scan→detect→parse→normalize→media→validate→preview→commit→index in jobs.progress.stages + logs; tests/integration/import-pipeline.test.ts | tests/integration/import-pipeline.test.ts: antivirus quarantine for imports and archive restore (R-IMPORT-032, R-ARCHIVE-016, SC-33)<br>tests/integration/import-pipeline.test.ts: an infected file is rejected at upload, nothing is stored, and the rejection is audited (R<br>tests/integration/import-pipeline.test.ts: an infected asset inside a ZIP is found after extraction; a clean file in the same upload <br>… ещё 3 |
| R-IMPORT-033 | P0 | Импорт в staging: до commit ни одна статья не меняется; повтор с тем же import-id идемпотентен | реализовано | tests/integration/import-export.test.ts: before commit nothing exists; commit repeated=true | tests/integration/import-export.test.ts: imports headings, nested lists, merged tables and images with a report; original kept (R-I |
| R-IMPORT-034 | P0 | DOCX: стили заголовков, списки, таблицы, изображения с якорями, ссылки, сноски; таблица несовместимостей и отчёт | реализовано | tests/integration/io-p0-import.test.ts: Word captions, footnotes …; complex Word constructs … listed in the compatibility report (per-file warnings in the preview report) | tests/integration/io-p0-import.test.ts: Word captions, footnotes, three numbering levels, headers/footers, bookmarks and the TOC f<br>tests/integration/io-p0-import.test.ts: complex Word constructs (SmartArt, text boxes, fields, floating objects, tracked changes,  |
| R-IMPORT-035 | P0 | MD: CommonMark/GFM, frontmatter, относительные изображения, code, чек-листы, таблицы; ZIP с контролем traversal и лимитов распаковки | реализовано | tests/integration/import-export.test.ts: MD ZIP import; zip-slip and bomb rejected | tests/integration/import-export.test.ts: imports a folder tree with relative images and cross-links; links become internal (R-IMPOR<br>tests/integration/import-export.test.ts: rejects zip-slip paths and zip bombs before extracting (SC-19, AT-69, R-IMPORT-006, R-IMPO |

### CLIPBOARD

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-CLIPBOARD-019 | P1 | Paste: HTML Word/Google Docs/браузер, MD-текст, изображения; выбор «с форматированием/только текст/как Markdown» при неоднозначности | частично | apps/web/src/editor/extensions/paste.ts SmartPaste; apps/web/src/editor/extensions/uploads.ts handlePaste (изображения); Нет выбора «с форматированием/только текст/как Markdown» при неоднозначности |  |

### IMPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-IMPORT-036 | P1 | CSV/XLSX: лист, заголовки, разделитель, кодировка, типы, предпросмотр 100 строк, сопоставление, диагностика … | частично | tests/integration/import-export.test.ts; tests/integration/import-pipeline.test.ts: range, 100-row preview, encoding/delimiter, types, table vs collection, upsert key; No mapping of file columns onto existing collection fields | tests/integration/import-pipeline.test.ts: XLSX range selection and 100-row preview (R-IMPORT-031, R-IMPORT-041, R-IMPORT-030, R-IMPO<br>tests/integration/import-export.test.ts: CSV in Windows-1251 with ";" and decimal comma, quotes and leading zeros; repeated upsert  |

### FILES

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-FILES-004 | P1 | Вложения: DnD в место, paste, прогресс, отмена, повтор, проверка хэша, доступность после восстановления, alt, превью | реализовано | apps/web/src/lib/uploads.ts (SHA-256 клиента: малые — сверка с ответом, большие — потоково + /complete {sha256}); lib/sha256.ts; tests/integration/files-integrity.test.ts; tests/unit/sha256.test.ts; хэш после restore — tests/integration/archive.test.ts | tests/integration/files-integrity.test.ts: upload checksum computed by the client (R-FILES-004, R-FILES-011)<br>tests/integration/files-integrity.test.ts: R-FILES-004: a checksum different from the one declared at start is refused<br>tests/unit/sha256.test.ts: incremental SHA-256 of streamed uploads (R-FILES-004, R-FILES-011)<br>… ещё 1 |

### IMPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-IMPORT-037 | P1 | Отчёт по каждому файлу (готово/предупреждение/ошибка), исходник доступен автору, откат импортированной пачки | частично | Per-file report, originals attached for every format (tests/integration/import-pipeline.test.ts), import.commit audit; No rollback of an imported batch | tests/integration/import-pipeline.test.ts: import job stage log and kept originals (R-IMPORT-032, R-IMPORT-014, R-IMPORT-042, R-IMPOR |

### TABLE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-TABLE-005 | P1 | Таблица документа: строки/столбцы, заголовки, выравнивание, ширина, объединение, копирование диапазонов, вставка из Excel | реализовано | apps/web/src/editor/menus/TableToolbar.tsx; apps/web/src/editor/extensions/paste.ts SmartPaste; Тесты: tests/e2e/editor.spec.ts:'slash menu inserts a table and a callout; "> " creates a toggle', tests/e2e/collab.spec.ts:'paste: spreadsheet range becomes a table; Markdown becomes formatted blocks'; остальное без тестов |  |

### COLLECTION

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-COLLECTION-007 | P1 | Коллекция: записи с постоянным ID, типы (текст, число, дата, выбор, статус, человек, ссылка, файл, checkbox, relation) … | частично | services/collections.ts FIELD_TYPES (relation, file, person, status…); строка = страница; Веб-интерфейса коллекции нет (нет страницы/таблицы реестра с фильтрами, сортировкой, массовой правкой, экспортом) |  |
| R-COLLECTION-008 | P1 | Виртуализация, sticky headers, навигация стрелками/Tab, массовая правка, undo, экспорт CSV/XLSX | частично | apps/server/src/routes/collections.ts bulk, export csv/xlsx; Нет UI (виртуализация, sticky, клавиатура, undo); кнопки экспорта нет |  |

### TABLE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-TABLE-006 | P1 | Не преобразовывать простую таблицу в коллекцию без подтверждения | реализовано | Автопреобразования таблицы в коллекцию нет |  |

### COLLAB

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-COLLAB-018 | P0 | Локальное состояние; операции Yjs без ожидания сервера; presence отдельно от документа | реализовано | packages/shared/src/collab-client.ts, apps/server/src/collab/hub.ts (awareness отдельно от Y.Doc) |  |
| R-COLLAB-019 | P0 | WebSocket: backoff с jitter, heartbeat, backpressure, повторная отправка; уникальный ID операции; повтор без дублей | реализовано | packages/shared/src/collab-client.ts#sendPending (backpressure: maxInflightOps/maxInflightBytes/bufferedAmount), backoff+jitter, PING, ack timeout, opId; apps/server/src/collab/hub.ts dedupe; tests/unit/collab-p0.test.ts (backpressure), tests/integration/collab-p0.test.ts, tests/integration/collab.test.ts (re-delivered operation) | tests/integration/collab.test.ts: re-delivered operation is acknowledged once and not duplicated (D-02, E-03, UX23-214, R-CO<br>tests/integration/collab-p0.test.ts: WebSocket blocked: the client switches to the HTTP channel, gets ACK only after commit and<br>tests/integration/collab-p0.test.ts: high latency, jitter and dropped connections: random edits of three editors converge with <br>… ещё 3 |

### OFFLINE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-OFFLINE-003 | P0 | IndexedDB-журнал пишется до статуса «сохранено локально»; «сохранено» после durable commit; очередь переживает перезагрузку | реализовано | packages/shared/src/collab-client.ts#persist/sendPending (операция уходит на сервер только после записи в IndexedDB; «Сохранено на устройстве» — только после записи), apps/web/src/sync/idb.ts; tests/unit/collab-p0.test.ts, tests/unit/collab-client.test.ts, tests/e2e/collab-p0-offline.spec.ts | tests/unit/collab-p0.test.ts: local journal before sending (R-OFFLINE-003, R-OFFLINE-005)<br>tests/unit/collab-p0.test.ts: an operation is sent to the server only after it was written to the local journal (R-OFFLI<br>tests/unit/collab-client.test.ts: offline status honesty (R-OFFLINE-003, R-OFFLINE-005, R-OFFLINE-006)<br>… ещё 1 |

### COLLAB

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-COLLAB-020 | P0 | Snapshot + append-only log, компактификация после подтверждённого snapshot, история, защита от повреждённых CRDT-обновлений | реализовано | apps/server/src/collab/hub.ts#flushNow (snapshot каждые 300 seq), apps/server/src/jobs/worker.ts#maintenance, Y.decodeUpdate+validateDoc; tests/integration/collab.test.ts schema-invalid | tests/integration/collab.test.ts: rejects schema-invalid updates and keeps the document valid (R-COLLAB-020, R-COLLAB-031) |
| R-COLLAB-021 | P0 | Тест-кейсы: один блок двумя, одновременные перемещения, удаление/правка, смена прав, истечение сессии, обрыв, спящий ноутбук … | реализовано | tests/integration/collab-p0.test.ts (одновременные перемещения, истечение сессии, спящий ноутбук, плохая сеть), tests/integration/collab.test.ts (один блок двумя, удаление/правка, смена прав, обрыв), apps/server/src/collab/hub.ts#checkExpirations (истечение сессии закрывает живые сессии); Одновременное перемещение одного и того же блока двумя авторами даёт два экземпляра блока (без потерь текста) — ограничение модели «перенос = удаление+вставка» | tests/integration/collab-p0.test.ts: format + delete, block copy + edit and concurrent block moves converge without duplicates <br>tests/integration/collab-p0.test.ts: session expiry, sleep, unreliable network (R-COLLAB-021, QA26-20)<br>tests/integration/collab-p0.test.ts: session expires during editing: unsent edits are never shown as saved and are delivered af<br>… ещё 1 |

### OFFLINE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-OFFLINE-004 | P1 | Офлайн для выбранных страниц/пространств; индикатор несинхронизированных правок; квота устройства; права офлайн недоступны | частично | apps/web/src/sync/collab.ts (y-indexeddb реплика открытых страниц), apps/web/public/sw.js; Нет выбора страниц/пространств для офлайна, нет квоты устройства, нет общего индикатора несинхронизированных страниц (pagesWithPending в idb.ts не используется) |  |

### PERF

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PERF-007 | P1 | Условия замеров: ноутбук 8 GB, Chromium, RTT 80 мс, 20 Mbps, low-end mobile; p50/p95/p99; 10/100 редакторов; 1/10/100 тыс. слов и строк | не реализовано | n/a; no measurement conditions/report (8GB laptop, RTT 80ms, low-end mobile, 10/100 editors) |  |
| R-PERF-008 | P1 | Ввод: p95 ≤50 мс, p99 ≤100 мс для статьи 10 тыс. слов | частично | tests/e2e/perf-typing.spec.ts "R-PERF-008, AT-84: typing in a 10 000-word article with CPU throttled 4x — 240 samples, p95/p99 journaled…" (11 090 words, CDP throttling 4x, keydown→next frame, no lost characters); docs/PERFORMANCE.md; budget NOT met in this environment: 4x p95 504–827 ms, p99 824–1169 ms; 1x p95 64 ms, p99 157 ms (overloaded 4-vCPU container). Budget assertion runs only with KB_PERF_ENFORCE=1 (open defect PERF-D1) | tests/e2e/perf-typing.spec.ts: R-PERF-008, AT-84: typing in a 10 000-word article with CPU throttled 4x — 240 samples, p9 |
| R-PERF-009 | P1 | Переход между кэшированными статьями p95 ≤300 мс; первая загрузка p95 ≤2 с | не реализовано | vite build: entry index.js 140 KB gz + index.css 23 KB gz; opening a page also loads PageView chunk 1.32 MB / 413 KB gz (katex + all highlight.js languages bundled eagerly) => ~576 KB gz before first edit; cached navigation and first-load p95 not measured |  |
| R-PERF-010 | P1 | Синхронизация между клиентами p95 ≤500 мс при RTT 80 мс; durable-подтверждение p95 ≤2 с | частично | server histogram kb_collab_persist_seconds (observability/metrics.ts); client-to-client sync p95 at RTT 80ms not measured |  |
| R-PERF-011 | P1 | Скролл и DnD 60 FPS; INP p75 ≤200 мс; без long tasks >200 мс при наборе | не реализовано | n/a; no FPS/INP/long-task measurement |  |
| R-PERF-012 | P1 | Импорт, OCR, превью, индексация вне UI-потока с progress и cancel; нарушение SLO — дефект, не маскировка skeleton | частично | import/OCR/previews/indexing run in server jobs (apps/server/src/jobs/worker.ts); import progress+cancel; client Markdown conversion runs on main thread (lazy chunk); no main-thread measurement |  |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-UI-030 | P1 | Design tokens: типографика, сетка 4/8 px, радиусы, отступы, цвета, бордеры, тени, состояния, z-index | частично | tokens.css typography/spacing/radii/colours/shadows/z-index/motion; tokens not documented outside CSS comments |  |

### LAYOUT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-LAYOUT-003 | P1 | Читаемая ширина, вертикальный ритм, адаптивные изображения, код с горизонтальным скроллом, таблицы с overflow … | частично | tests/e2e/visual.spec.ts no page overflow at 320px; editor.css pre/.tableWrapper overflow-x; sample page has no code block, wide table or image |  |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-UI-031 | P1 | Макеты 320/375/768/1024/1440/1920, zoom 200%, длинные русские слова, RTL не ломает layout; тёмная/светлая; WCAG 2.2 AA | частично | tests/e2e/visual.spec.ts 6 widths × 2 themes; tests/e2e/a11y.spec.ts real 200% zoom + axe audit; long Russian words and RTL not covered |  |
| R-UI-032 | P1 | Анимации меню/подсказок 120–220 мс, дерева/панелей 160–260 мс; без bounce; без смещения курсора и layout shift | частично | tokens.css durations, ease without bounce; CLS during animations not measured |  |

### A11Y

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-A11Y-005 | P1 | reduced-motion отключает необязательное движение; transform/opacity; без тяжёлых blur/теней в списках; не анимировать символы | реализовано | tokens.css reduced-motion rule; tests/e2e/a11y.spec.ts reduced-motion test (computed durations ≤10 ms) |  |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-UI-033 | P1 | Для каждого экрана состояния loading/empty/error/offline/conflict/permission-denied и визуальная консистентность | частично | skeletons (App Suspense, EditorSkeleton), PageError, offline banner; conflict/permission-denied not on every screen; not verified |  |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ACL-019 | P0 | Роли Reader/Author/Editor/Space owner/Admin/Auditor; наследование от пространства; исключения; проверка в API, поиске, вложениях … | реализовано | roles view/comment/edit/full + org roles; checks in API, search, attachments, WS, export; tests/integration/acl.test.ts |  |

### PUBLISH

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PUBLISH-006 | P1 | Версии draft/review/published/archived; опубликованная стабильна, пока редактируется черновик; согласование опционально | реализовано | publishingMode publish: readers get published revision (GET /pages/:id/content); tests/integration/content.test.ts S05 | tests/integration/content.test.ts: readers see the published revision while the draft evolves; approval required when configu |

### ADMIN

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ADMIN-003 | P1 | Админ управляет пользователями, пространствами, политиками хранения, квотами, журналом, импортами, бэкапами | частично | users, retention, quota (OrgSettingsSection), audit, backups (ArchivesSection); Spaces and imports not administrable from admin UI. |  |

### BACKUP

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-BACKUP-007 | P0 | 99.9% доступности, RPO ≤5 мин, RTO ≤60 мин; подтверждено нагрузкой и restore drill | частично | see R-BACKUP-001; restore drill measured; RTO ≤60 min not proven for production volume; no load test |  |
| R-BACKUP-008 | P0 | Снимки БД, WAL/PITR, versioned object storage, шифрование, проверка восстановления, целостность ссылок, защита последней копии | частично | tests/resilience/pitr.test.ts (PITR), BACKUP_ENCRYPT_CMD, verify-backup.sh link/sha checks, retention keeps last N, offsite Object Lock example (compose profile offsite); Versioned object storage not configured by the repo | tests/resilience/pitr.test.ts: recovers database and files to the moment before the incident; later damage is absent, ear |

### QA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-QA-018 | P0 | Contract tests схемы/миграций; property-based undo/redo, paste, CRDT; fuzz HTML/DOCX/MD/ZIP; security XSS/CSRF/SSRF/traversal/ACL | частично | fast-check: tests/unit/markdown.test.ts, collab.test.ts randomised convergence; core.test CSRF; import-export zip-slip/bomb; content SVG sanitising; security-headers.test.ts; no migration contract tests, undo/redo or paste property tests, DOCX/HTML fuzz, SSRF/XSS-paste tests (CI exists now) |  |
| R-QA-019 | P0 | Playwright E2E Chromium/Firefox/WebKit desktop/mobile с реальным буфером и DnD | частично | tests/e2e/collab.spec.ts paste via helpers.paste (synthetic ClipboardEvent); only Chromium is installed (playwright.config.ts, DECISIONS D-18); no real clipboard, no DnD |  |
| R-QA-020 | P1 | Visual regression на всех ширинах и темах с порогами и ручной проверкой | частично | tests/e2e/a11y.spec.ts pixel baselines (2 screens, threshold 1%); tests/e2e/visual.spec.ts overflow checks at 6 widths × 2 themes; baselines not at all widths and themes |  |
| R-QA-021 | P0 | Fault injection: сеть 1/30/300 с, рестарт WS и БД, двойная вкладка, конфликт удаления/правки, заполнение локального хранилища, диск сервера | частично | crash-restart (SIGKILL), db-connection-loss, collab offline/restart, AT-77 delete/edit conflict, two contexts in CO; no 1/30/300 s outage profile, no local-storage-full, no server-disk-full |  |

### OPS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-OPS-014 | P1 | Метрики: client errors, input latency, reconnect, unsynced queue age, failed imports, OCR latency, backup age, restore verification … | частично | metrics.ts: kb_client_errors_total, kb_client_input_latency_ms, kb_client_unsynced_queue_age_seconds, kb_backup_age_seconds, kb_restore_verification_age_seconds, kb_integrity_errors; grafana-dashboard.json; Missing: WebSocket reconnect count, failed-import rate as own metric, OCR latency |  |

### PAGE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| AT-61 | P1 | Создать статью с клавиатуры и сразу вводить текст без модального окна | реализовано | tests/e2e/editor.spec.ts (create page), tests/e2e/helpers.ts#newPage | tests/e2e/editor.spec.ts: create page, type with Markdown shortcuts, "Сохранено" only after server ack, survives rel |
| AT-62 | P1 | Иконка, обложка, перемещение статьи без потери фокуса и перезагрузки | частично | apps/web/src/pages/PageView.tsx; Обложки нет |  |

### EDITOR

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| AT-63 | P1 | Slash-menu RU/EN мышью и клавиатурой, Esc возвращает курсор | реализовано | suggest.tsx slashExtension (мышь, стрелки, Enter, Esc закрывает без смещения курсора); filterCommands RU/EN + раскладка; tests/e2e/editor.spec.ts:'slash menu inserts a table and a callout; "> " creates a toggle' — только клавиатура/RU; Esc и мышь не проверяются |  |
| AT-64 | P0 | Абзац → H2 → абзац с сохранением текста | реализовано | setHeading/setParagraph сохраняют текст, marks и id; tests/unit/editor-convert.test.ts:'AT-64…' | tests/unit/editor-convert.test.ts: block conversion keeps content (R-EDITOR-003, R-EDITOR-067, AT-64)<br>tests/unit/editor-convert.test.ts: AT-64: paragraph → H2 → paragraph keeps text, marks and the block id |
| AT-65 | P1 | DnD вложенного блока, затем Undo | частично | DragHandle + Yjs UndoManager; Теста нет; перетаскивание внутрь контейнеров не поддерживается |  |

### CLIPBOARD

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| AT-66 | P0 | Выделение через 5 блоков, копирование и вставка с форматированием | реализовано | PM copy/paste slice; Без теста |  |
| AT-67 | P1 | Вставка таблицы Word со списками и картинками; структура и ссылки | частично | apps/web/src/editor/clipboard/html.ts; Таблицы и списки сохраняются; Картинки из Word (file://, VML) браузер не передаёт — пользователь получает уведомление с числом непереданных изображений; RTF не разбирается |  |

### MEDIA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| AT-68 | P1 | Вставка изображения из clipboard: alt, превью, файл | частично | apps/web/src/editor/extensions/uploads.ts handlePaste; alt при вставке не заполняется |  |

### SECURITY

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| AT-69 | P0 | Импорт MD ZIP с относительными картинками без path traversal | реализовано | tests/integration/import-export.test.ts: rejects zip-slip paths and zip bombs; Markdown ZIP relative images (AT-69) | tests/integration/import-export.test.ts: Markdown ZIP (SC-15, AT-43, AT-69)<br>tests/integration/import-export.test.ts: rejects zip-slip paths and zip bombs before extracting (SC-19, AT-69, R-IMPORT-006, R-IMPO |

### IMPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| AT-70 | P1 | Импорт XLSX с тремя листами и предпросмотром типов | реализовано | tests/integration/import-export.test.ts: XLSX three sheets, column types | tests/integration/import-export.test.ts: XLSX with three sheets: pick a sheet, numbers and dates kept, formulas as values (AT-49, A |

### CLIPBOARD

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| AT-71 | P1 | Вставка диапазона Excel в простую таблицу и в коллекцию по выбору | частично | apps/web/src/editor/extensions/paste.ts SmartPaste → простая таблица; Выбора «в коллекцию» нет |  |

### IMPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| AT-72 | P0 | Прерывание импорта до commit — нет частичных опубликованных страниц | реализовано | tests/integration/import-export.test.ts | tests/integration/import-export.test.ts: cancelling before commit creates nothing (AT-72, R-IMPORT-043, E-09) |
| AT-73 | P0 | Повтор import-id — нет дубликатов | реализовано | tests/integration/import-export.test.ts | tests/integration/import-export.test.ts: same idempotency key does not create a second job (AT-73, R-IMPORT-024, E-09) |

### COLLAB

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| AT-74 | P0 | Два автора в одном абзаце — содержимое сходится | реализовано | tests/integration/collab.test.ts (AT-74) | tests/integration/collab.test.ts: two editors typing in the same paragraph converge without loss (SC-25, AT-74, COLLAB-192,  |

### OFFLINE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| AT-75 | P0 | Отключение сети при вводе, перезагрузка вкладки, восстановление очереди | реализовано | apps/web/src/hooks/data.ts#usePage, apps/web/src/sync/idb.ts, packages/shared/src/collab-client.ts; tests/e2e/collab-p0-offline.spec.ts (reload without network reopens the local copy …) | tests/e2e/collab-p0-offline.spec.ts: reload without network reopens the local copy with an honest status; the queue is delivere |
| AT-76 | P0 | Подключение после 5 минут офлайн — все локальные правки синхронизированы | реализовано | tests/integration/collab.test.ts (AT-76); Длительность 5 мин не моделируется; логика от длительности не зависит | tests/integration/collab.test.ts: offline edits are kept locally and synchronised after reconnect, concurrent with others (S |

### COLLAB

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| AT-77 | P0 | Удаление блока на одном клиенте при правке на другом — нет silent data loss | реализовано | apps/web/src/editor/extensions/conflictGuard.ts, apps/server/src/routes/conflicts.ts; tests/e2e/conflict.spec.ts (edit vs concurrent delete …), tests/integration/conflicts.test.ts; Правка в удалённом блоке не теряется молча: конфликтная копия + «Вернуть мою версию» | tests/integration/collab.test.ts: delete block on one client while another edits it keeps a consistent result (AT-77, COLLAB<br>tests/e2e/conflict.spec.ts: edit vs concurrent delete: the editor keeps a conflict copy and can put the block back (E- |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| AT-78 | P0 | Потеря права редактирования в сессии — сервер отклоняет операции, локальные правки извлекаемы | реализовано | apps/server/src/collab/hub.ts nack forbidden, collab-client keeps pending, Editor.tsx "Скачать локальную копию"; tests/integration/collab.test.ts AT-78 | tests/integration/collab.test.ts: read-only user cannot write; revoking edit switches session to read-only; revoking view cl |
| AT-79 | P0 | Копирование не раскрывает скрытые поля и недоступные вложения | реализовано | duplicatePage copies only visible pages and attachments only with download right (services/pages.ts); clipboard: comment anchors and DOM ids stripped, titles of linked pages the reader cannot open replaced by «Страница недоступна» in Ctrl+C HTML/text and in «Копировать страницу» HTML/Markdown (apps/web/src/editor/clipboard/redact.ts); the reading API and exports redact them on the server (routes/acl-extra.ts redactInaccessibleRefs); tests/integration/acl-p0.test.ts 'AT-79: the reading API and exports replace titles …'; tests/e2e/acl-p0-ui.spec.ts 'AT-79: copying a page does not put titles of linked pages the reader cannot open on the clipboard …'; Attachment links in copied HTML point to the API, which re-checks download rights on use. The live collaborative document (WebSocket/CRDT) still carries the title snapshot of linked pages for anybody who can read it; HTTP reading, export and clipboard are redacted. | tests/integration/acl-p0.test.ts: linked page titles (AT-79)<br>tests/integration/acl-p0.test.ts: AT-79: the reading API and exports replace titles of linked pages the reader cannot open; <br>tests/e2e/acl-p0-ui.spec.ts: AT-79: copying a page does not put titles of linked pages the reader cannot open on the cl |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| AT-80 | P1 | Переключение светлой/тёмной темы без скачков и нечитаемых элементов | частично | tests/e2e/a11y.spec.ts axe audit (light theme); tokens.css dual theme; dark theme not axe-audited | tests/e2e/a11y.spec.ts: WCAG 2.1 AA automated audit of key screens (R-A11Y-003, AT-80, E2E-112) |
| AT-81 | P1 | Адаптивность 320–1920 px и zoom 200% | реализовано | tests/e2e/visual.spec.ts + tests/e2e/ui-p0-layout.spec.ts (320–1920 overlap/clipping both themes, real 200 % zoom) | tests/e2e/ui-p0-layout.spec.ts: V18-A18, AT-81: real 200 % zoom (DPR 2, 640×400 CSS px) — no overlaps or clipped controls<br>tests/e2e/a11y.spec.ts: real 200% browser zoom (1280x800 at 2x = 640x400 CSS px) keeps every key screen usable (AT |

### A11Y

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| AT-82 | P1 | prefers-reduced-motion отключает необязательные анимации | реализовано | tests/e2e/a11y.spec.ts "reduced motion: animations and transitions are effectively disabled (R-A11Y-002, AT-82)" | tests/e2e/a11y.spec.ts: reduced motion: animations and transitions are effectively disabled (R-A11Y-002, AT-82) |

### LAYOUT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| AT-83 | P1 | Длинная таблица и код не вызывают overflow всей страницы | частично | editor.css .tableWrapper/pre overflow-x:auto; VS sample has only a 3-column table, no long code; no dedicated test |  |

### PERF

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| AT-84 | P1 | Статья 10 тыс. слов соответствует SLO ввода и переключения | частично | tests/e2e/perf-typing.spec.ts "R-PERF-008, AT-84: …"; docs/PERFORMANCE.md; typing SLO not met (see R-PERF-008); page switching time not measured | tests/e2e/perf-typing.spec.ts: R-PERF-008, AT-84: typing in a 10 000-word article with CPU throttled 4x — 240 samples, p9 |
| AT-85 | P1 | 10 одновременных авторов соответствуют SLO синхронизации | не реализовано | tests/e2e/collab.spec.ts uses 2 authors; no 10-author sync latency test |  |

### HISTORY

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| AT-86 | P0 | Восстановление опубликованной версии после случайного удаления | реализовано | apps/web/src/components/page/HistoryPanel.tsx, apps/server/src/routes/revisions.ts, apps/server/src/services/pages.ts#restorePage; нет автотеста |  |

### BACKUP

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| AT-87 | P0 | Восстановление БД и файлов из бэкапа, проверка ссылок | реализовано | tests/resilience/backup-restore.test.ts: attachment bytes, links, ACL after restore; verify-backup.sh reference checks | tests/resilience/backup-restore.test.ts: backup → restore drill (SC-30, AT-60, AT-87, V16-S20, OPS-011, QA26-18) |

### QA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| AT-88 | P0 | E2E в Chromium, Firefox, WebKit с реальным paste | ограничение окружения | tests/e2e/collab.spec.ts paste test (Chromium, synthetic paste); only Chromium is installed (playwright.config.ts, DECISIONS D-18) |  |
| AT-89 | P1 | Visual regression всех ключевых экранов и состояний | частично | tests/e2e/a11y.spec.ts "pixel baselines for stable screens (R-QA-008, AT-89)"; only 2 of the key screens have baselines | tests/e2e/a11y.spec.ts: pixel baselines for stable screens (R-QA-008, AT-89) |

### OFFLINE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| AT-90 | P0 | Экран ошибки/офлайна/конфликта и извлечение локальных правок | реализовано | apps/web/src/editor/Editor.tsx#FatalBanner/downloadLocalCopy, apps/web/src/pages/PageView.tsx (офлайн-баннер со скачиванием), conflict toast; tests/e2e/collab-p0-storage.spec.ts (offline local-copy screen …, device storage is full …), tests/e2e/collab-p0-editing.spec.ts (конфликт) | tests/e2e/collab-p0-offline.spec.ts: reload without network reopens the local copy with an honest status; the queue is delivere<br>tests/e2e/collab-p0-editing.spec.ts: a block is moved by one editor while another edits it: the edit is kept as a conflict copy<br>tests/e2e/collab-p0-storage.spec.ts: offline local-copy screen lets the user extract local edits (AT-90, R-OFFLINE-010) |

### PROCESS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PROCESS-037 | P1 | Этапы A–E: сценарии/прототип/дизайн → модель/editor/clipboard/импорт/история → CRDT/офлайн/durability/ACL → таблицы/поиск/медиа/админка … | процесс/документ | n/a; no per-stage demos/limitations |  |
| R-PROCESS-038 | P2 | Источники поведения Notion Help Center (writing, create page, collaborate, databases, import, synced blocks, offline) | процесс/документ | n/a; not reconciled with sources |  |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-UI-034 | P1 | Путь «открыл → создал/вставил → поправил → связал → закрыл» без обязательных настроек, режимов, синтаксиса, ручного сохранения, техтерминов | реализовано | tests/e2e/editor.spec.ts "create page, type with Markdown shortcuts…"; helpers.newPage (no dialog, autosave); linking step not in the test |  |
| R-UI-035 | P2 | Продвинутые возможности раскрываются по запросу; интерфейс показывает прежде всего документ | требует ручной проверки | page actions in menus, block handle on hover; needs design review |  |
| R-UI-036 | P1 | Новый сотрудник без инструкции создаёт и публикует структурированную статью за 3 минуты при готовом тексте | требует ручной проверки | n/a; 3-minute usability test not performed |  |

### TREE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-TREE-007 | P1 | Левая панель: поиск, избранное, недавние, пространства и дерево, кнопка «Новая страница» | частично | apps/web/src/layout/Sidebar.tsx; Нет «Недавних» в левой панели |  |

### PAGE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PAGE-016 | P1 | Действия «Переместить», «Дублировать», «В архив»; хлебные крошки и постоянная ссылка | реализовано | apps/web/src/pages/PageView.tsx#menuItems, apps/web/src/components/page/PublishBar.tsx (архив) |  |

### SEARCH

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-SEARCH-010 | P1 | Ctrl/Cmd+K, поиск по заголовкам и содержимому, обратные ссылки, блок «Упоминается в» | реализовано | apps/web/src/layout/QuickSwitcher.tsx, apps/web/src/pages/PageView.tsx#Backlinks |  |

### PAGE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PAGE-017 | P0 | Ссылки используют постоянные ID, а не путь; перемещение не ломает ссылки | реализовано | packages/shared/src/editor/nodes/links.ts |  |

### TREE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-TREE-008 | P1 | Состояние дерева и последняя статья восстанавливаются после перезапуска; пустые состояния объясняют одно следующее действие | реализовано | apps/web/src/layout/treeState.ts (последняя страница), apps/web/src/pages/Home.tsx («Продолжить: …»), apps/web/src/state/ui.ts; нет автотеста |  |

### PAGE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PAGE-018 | P1 | «+ Новая страница» сразу создаёт черновик с курсором в заголовке, без модального мастера | реализовано | apps/web/src/layout/Sidebar.tsx#newPage; tests/e2e/editor.spec.ts | tests/e2e/editor.spec.ts: create page, type with Markdown shortcuts, "Сохранено" only after server ack, survives rel |

### IMPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-IMPORT-038 | P1 | В новую страницу сразу можно вставить большой текст, DOCX, MD, скриншот или таблицу | частично | tests/e2e/clipboard.spec.ts (Word paste, web HTML with image), tests/e2e/collab.spec.ts (spreadsheet, Markdown paste); Screenshot (image-only clipboard) paste and DOCX file paste not tested |  |

### TEMPLATES

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-TEMPLATES-004 | P2 | Иконка и обложка одним кликом; шаблоны «Регламент», «Инструкция», «Паспорт продукта», «FAQ», «Протокол» или чистая страница | частично | components/IconPicker.tsx; TemplatesPage; UI обложки нет (pages.cover только в API) |  |

### PAGE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PAGE-019 | P0 | Заголовок меняется без изменения URL/ID; публикация не нужна для сохранения черновика; статус виден | реализовано | apps/server/src/collab/hub.ts#flushNow (title из Y.Text), apps/web/src/components/page/SyncStatus.tsx; tests/integration/collab.test.ts (title) | tests/integration/collab.test.ts: title is edited collaboratively and synced to the tree (R-PAGE-019) |

### CLIPBOARD

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-CLIPBOARD-020 | P0 | Вставка HTML/RTF/plain из Word, Google Docs, браузера, почты сохраняет H1–H6, абзацы, списки, таблицы, ссылки, изображения, подписи … | частично | apps/web/src/editor/clipboard/html.ts (H1–H6, списки Word, таблицы, ссылки, data:-изображения → вложения); tests/e2e/clipboard.spec.ts. Картинки из Word (file://, VML) браузер не передаёт — пользователь получает уведомление с числом непереданных изображений; RTF не разбирается | tests/unit/clipboard-html.test.ts: Word lists (AT-44, UX13-02, R-CLIPBOARD-020)<br>tests/unit/clipboard-html.test.ts: images in pasted HTML (R-CLIPBOARD-020, SC-06)<br>tests/e2e/clipboard.spec.ts: Word paste keeps headings, nested and numbered lists, links and tables without Office styl |
| R-CLIPBOARD-021 | P1 | Без диалога при обычной вставке; при неоднозначности ненавязчиво «Вставить как текст / как таблицу / отменить» | частично | apps/web/src/editor/extensions/paste.ts SmartPaste (без диалогов); Ненавязчивого «как текст / как таблицу / отменить» нет |  |

### IMPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-IMPORT-039 | P1 | DOCX/MD через DnD, кнопку, вставку; пакетный импорт с предпросмотром дерева и отчётом несовместимостей | частично | ImportPage: DnD, button, preview tree (parentTempId), per-file incompatibility warnings; UI not e2e-tested |  |

### MEDIA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-MEDIA-008 | P0 | Изображения из буфера загружаются как файлы с устойчивыми ссылками и alt; ошибка не удаляет блок | реализовано | apps/web/src/editor/extensions/uploads.ts altFromName (alt из имени файла, «Изображение» для безымянных), загрузка как вложение с attachmentId; блок сохраняется при ошибке; tests/e2e/editor-p0-media.spec.ts:'pasted image: instant local preview, upload error keeps the block, retry completes it with alt (R-MEDIA-006, R-MEDIA-008)' | tests/e2e/editor-p0-media.spec.ts: pasted image: instant local preview, upload error keeps the block, retry completes it with |

### IMPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-IMPORT-040 | P0 | Сложные структуры не уплощать молча | реализовано | Conversion warnings for every simplification (docx inspect, markdown warn); tests/integration/import-export.test.ts |  |
| R-IMPORT-041 | P1 | CSV/XLSX: лист, диапазон, заголовки, типы колонок, подтверждение; результат — таблица или коллекция с фильтрами | реализовано | tests/integration/import-pipeline.test.ts: sheet + range + header + column types, table or collection; ImportPage confirmation via dry run | tests/integration/import-pipeline.test.ts: XLSX range selection and 100-row preview (R-IMPORT-031, R-IMPORT-041, R-IMPORT-030, R-IMPO<br>tests/integration/import-pipeline.test.ts: previews up to 100 rows and imports only the selected range (R-IMPORT-031, R-IMPORT-041, R<br>tests/integration/import-export.test.ts: XLSX with three sheets: pick a sheet, numbers and dates kept, formulas as values (AT-49, A |

### SECURITY

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-SECURITY-009 | P0 | Формулы XLSX и макросы не исполнять; сообщать об их судьбе | реализовано | convert/tabular.ts imports formulas as values, warning with count; tests/integration/import-export.test.ts: formulas as values (AT-49) | tests/integration/import-export.test.ts: XLSX with three sheets: pick a sheet, numbers and dates kept, formulas as values (AT-49, A |

### IMPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-IMPORT-042 | P1 | Сохранять исходник и лог импорта для диагностики | реализовано | import-source attachments for every format; per-stage job log (progress.stages) and report; tests/integration/import-pipeline.test.ts | tests/integration/import-pipeline.test.ts: import job stage log and kept originals (R-IMPORT-032, R-IMPORT-014, R-IMPORT-042, R-IMPOR<br>tests/integration/import-pipeline.test.ts: the original MD, ZIP and CSV files are attached to the imported page for the author (R-IMP |

### EDITOR

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-EDITOR-034 | P0 | Enter — абзац; Backspace на пустом блоке объединяет/преобразует; Tab/Shift+Tab предсказуемы | реализовано | Tiptap keymap + blockOps.ts resetTypeAtStart; правила в справке (F1); tests/e2e/editor-p0-core.spec.ts:'key matrix… (R-EDITOR-065, R-EDITOR-034, E208)' | tests/e2e/editor-p0-core.spec.ts: key matrix: Enter, Enter on empty item, Tab/Shift+Tab, Backspace at the start and on empty |
| R-EDITOR-035 | P1 | Markdown-шорткаты, /-меню, @, [[, DnD блоков, контекстное меню без конфликтов | реализовано | StarterKit input rules; apps/web/src/editor/extensions/blockOps.ts addInputRules; suggest.tsx; Без теста на конфликты триггеров |  |
| R-EDITOR-036 | P0 | Выделение сохраняется при появлении панели; команды применяются ровно к выделению | реализовано | apps/web/src/editor/menus/BubbleToolbar.tsx onMouseDown preventDefault; команды на текущем выделении; Косвенно: tests/e2e/content.spec.ts:'comment on a selection…' |  |

### HISTORY

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-HISTORY-011 | P0 | Undo/Redo охватывают ввод, вставку, перенос, форматирование, не откатывая чужие изменения | реализовано | apps/web/src/editor/clientExtensions.ts (yUndoPlugin, только свои изменения); tests/e2e/undo.spec.ts, tests/e2e/collab-p0-editing.spec.ts (undo of a block move …, sequences) | tests/e2e/collab-p0-editing.spec.ts: undo of a block move never silently drops a colleague's edits (UX13-10, R-HISTORY-011)<br>tests/e2e/collab-p0-editing.spec.ts: undo/redo sequences of 100 and 1000 steps, transform and delete are reversible; history do<br>tests/e2e/undo.spec.ts: undo/redo of formatting keeps the text and the selection (QA26-14, SC-11, R-HISTORY-011, R |

### EDITOR

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-EDITOR-037 | P0 | Пустые строки, списки, таблицы, вложенные блоки переживают перезагрузку; прокрутка, фокус, курсор сохраняются | реализовано | apps/web/src/editor/selectionMemory.ts; useScrollRestore; Yjs+IndexedDB; tests/e2e/clipboard.spec.ts:'caret position of a page is restored…'; tests/e2e/editor.spec.ts:'create page, type with Markdown shortcuts, …survives reload' | tests/unit/editor-convert.test.ts: caret memory (R-EDITOR-001, R-EDITOR-037)<br>tests/unit/editor-convert.test.ts: R-EDITOR-037: caret is stored relative to the block id and survives edits before the block<br>tests/e2e/clipboard.spec.ts: caret position of a page is restored when it is opened again (R-EDITOR-037, R-EDITOR-001) |

### A11Y

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-A11Y-006 | P1 | Навигация только клавиатурой в редакторе | частично | tests/e2e/editor.spec.ts slash menu by keyboard; Alt+Shift+↑/↓ (editor/extensions/blockOps.ts); no keyboard-only editor pass |  |

### LAYOUT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-LAYOUT-004 | P1 | Один столбец чтения комфортной ширины, опциональная широкая таблица | частично | tokens.css --content-w 760px (+wide 1180px); ≈90 chars per line at 16px Inter, above the usual 60–80; not measured |  |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-UI-037 | P1 | Типографические токены: 6 уровней заголовков, текст, подписи, код, цитаты; вертикальный ритм | частично | editor.css h1 28 / h2 22 / h3 18 / h4–h6 16px, code, quotes; h4–h6 visually identical; vertical rhythm not tokenised |  |

### LAYOUT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-LAYOUT-005 | P1 | Таблицы не обрезают текст молча; длинные URL переносятся; изображения масштабируются предсказуемо с подписями | частично | editor.css overflow-wrap:anywhere, .tableWrapper overflow-x, img max-width + captions; untested |  |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-UI-038 | P1 | Светлая/тёмная тема без скачков размеров; адаптивность от мобильного до 4K; фиксированные панели не закрывают текст | частично | tests/e2e/visual.spec.ts up to 1920px both themes; no 4K; theme-switch size stability not measured |  |

### QA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-QA-022 | P1 | Скриншотные эталоны для всех ключевых состояний; статья выглядит законченной в чтении и редактировании | частично | tests/e2e/a11y.spec.ts-snapshots (sign-in, help dialog); baselines only for 2 states; article reading/editing not baselined |  |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-UI-039 | P1 | Функциональные анимации: дерево, меню, drag-preview, создание блока, загрузка, панель, подтверждение; 120–220 мс | частично | tree chevron, menu pop-in, drawer, panel slide animations via tokens; untested |  |

### PERF

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PERF-013 | P0 | Ввод, прокрутка, сохранение никогда не ждут анимации; не анимировать весь документ | реализовано | tests/e2e/perf-typing.spec.ts "R-PERF-013: typing starts no animations on document content (input latency journaled)" (no animationstart/transitionrun inside .kb-editor, document.getAnimations() empty) | tests/e2e/perf-typing.spec.ts: R-PERF-013: typing starts no animations on document content (input latency journaled) |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-UI-040 | P1 | reduced-motion; skeleton без мигания; спокойные ошибки; нет внезапных смещений layout | частично | tests/e2e/ui-p0-layout.spec.ts CLS on page open 0.001, page switch/side panel < 0.02; reduced-motion test; home screen CLS ≈ 0.03 (skeleton/list height mismatch, PERF-D3) | tests/e2e/ui-p0-layout.spec.ts: R-UI-006, R-UI-040: opening a page and typing cause no layout shift (CLS < 0.02) |

### OFFLINE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-OFFLINE-005 | P0 | Ввод локально сразу; операции в устойчивый журнал до отправки; статусы «Локально», «Синхронизация», «Сохранено», «Требуется действие» | реализовано | packages/shared/src/collab-client.ts (журнал до отправки), apps/web/src/components/page/SyncStatus.tsx; tests/unit/collab-p0.test.ts (an operation is sent … only after it was written to the local journal), tests/e2e/collab-p0-offline.spec.ts | tests/unit/collab-p0.test.ts: local journal before sending (R-OFFLINE-003, R-OFFLINE-005)<br>tests/unit/collab-p0.test.ts: an operation is sent to the server only after it was written to the local journal (R-OFFLI<br>tests/unit/collab-client.test.ts: offline status honesty (R-OFFLINE-003, R-OFFLINE-005, R-OFFLINE-006)<br>… ещё 1 |

### COLLAB

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-COLLAB-022 | P2 | Presence-аватары и курсоры ненавязчивы | требует ручной проверки | apps/web/src/components/page/Presence.tsx, CollaborationCaret; Визуальная проверка |  |
| R-COLLAB-023 | P0 | Переподключение с backoff и повторной отправкой идемпотентных операций без дубликатов | реализовано | packages/shared/src/collab-client.ts, apps/server/src/collab/hub.ts; tests/resilience/crash-restart.test.ts (ack lost) | tests/integration/collab.test.ts: re-delivered operation is acknowledged once and not duplicated (D-02, E-03, UX23-214, R-CO |

### OFFLINE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-OFFLINE-006 | P0 | Офлайн-правки переживают закрытие вкладки; при переполнении хранилища явное предупреждение | реализовано | packages/shared/src/collab-client.ts#persist (QuotaExceeded → статус «Ошибка сохранения», onStorageError), apps/web/src/editor/Editor.tsx (предупреждение, баннер со скачиванием); tests/e2e/collab-p0-storage.spec.ts (device storage is full …), tests/unit/collab-p0.test.ts | tests/unit/collab-p0.test.ts: if the local journal cannot be written, the operation is still sent (the server is then th<br>tests/unit/collab-client.test.ts: offline status honesty (R-OFFLINE-003, R-OFFLINE-005, R-OFFLINE-006) |

### COLLAB

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-COLLAB-024 | P0 | Параллельные изменения на одном блоке, таблице, вложении, при перемещении страницы; предсказуемые правила конфликтов удаления и прав | частично | tests/integration/collab-p0.test.ts (таблица, удаление таблицы+строка, перемещения), tests/e2e/collab-p0-editing.spec.ts, tests/integration/core.test.ts (COLLAB-194), tests/integration/content.test.ts (attachment versions), tests/e2e/conflict.spec.ts; Блок, таблица, перемещение страницы и удаление/правка покрыты; одновременная загрузка новой версии одного вложения двумя пользователями не тестируется | tests/integration/collab-p0.test.ts: many editors, tables, moves (QA26-19, AT-56, SC-25, R-COLLAB-024, R-COLLAB-032)<br>tests/integration/collab-p0.test.ts: two editors change one table cell and neighbouring rows while a third adds a row; the merg<br>tests/integration/collab-p0.test.ts: table deleted while another editor adds a row: the result is a valid document, never an or<br>… ещё 2 |
| R-COLLAB-025 | P0 | Серверная фиксация отделена от локального optimistic UI | реализовано | packages/shared/src/collab-client.ts, apps/web/src/components/page/SyncStatus.tsx | tests/integration/collab.test.ts: "saved" is reported only after the update is committed to the journal (E-13, D-10, R-COLLA |

### PERF

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PERF-014 | P1 | p50/p95/p99 на реальных устройствах: 1/100/1000 блоков, 20 таблиц, 100 изображений, несколько редакторов … | не реализовано | n/a; no device/throttling report |  |
| R-PERF-015 | P1 | Ввод p95 ≤50 мс; кэшированная статья p95 ≤300 мс; синхронизация p95 ≤500 мс; нет long tasks >100 мс при наборе | частично | docs/PERFORMANCE.md (typing p95, long tasks count, sync p95); budgets not met in this environment (PERF-D1); cached open not measured |  |
| R-PERF-016 | P1 | Виртуализация больших таблиц с клавиатурой и копированием; конвертации/OCR в фоне | частично | conversions/OCR server-side; tables not virtualised |  |

### COLLAB

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-COLLAB-026 | P0 | Операции версионируются и проверяются на целостность; серверный журнал + снимки; бэкапы БД и объектов с проверкой восстановления | реализовано | apps/server/src/collab/hub.ts (seq, validateDoc), scripts/backup/*; Проверка восстановления бэкапов — в модуле BACKUP |  |

### IMPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-IMPORT-043 | P0 | Импорт не публикует частично повреждённую страницу: staging, валидация, атомарная публикация | реализовано | tests/integration/import-export.test.ts: cancelling before commit creates nothing; commit in one transaction | tests/integration/import-export.test.ts: cancelling before commit creates nothing (AT-72, R-IMPORT-043, E-09) |

### FILES

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-FILES-005 | P0 | Удалённые файлы не удалять физически до окончания retention | реализовано | apps/server/src/routes/attachments.ts DELETE — soft delete; физического удаления blob нет (GC не реализован); Без теста |  |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ACL-020 | P0 | Проверка прав чтения/изменения/экспорта и вложений на сервере | реализовано | requirePage view/edit/export/download server-side; tests/integration/acl.test.ts, tests/integration/content.test.ts, tests/integration/import-export.test.ts |  |

### OPS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-OPS-015 | P1 | Мониторинг ошибок синхронизации, очередей импорта, времени подтверждения, конфликтов, потерянных вложений, восстановления | частично | alerts KbCollabPersistFailures, KbCollabCommitLatencyHigh, KbJobsBacklog/Failing, KbIntegrityErrors, KbRestoreVerificationTooOld; No conflict metric; no dedicated "lost attachment" alert besides integrity errors |  |

### BACKUP

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-BACKUP-009 | P1 | Формально согласовать RPO/RTO с владельцем системы до запуска | процесс/документ | docs/BACKUP_RESTORE.md §1 (targets mapped); Formal sign-off with system owner |  |

### PAGE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX13-01 | P1 | Новая страница и набор без единого диалога | реализовано | tests/e2e/editor.spec.ts, tests/e2e/helpers.ts | tests/e2e/editor.spec.ts: create page, type with Markdown shortcuts, "Сохранено" only after server ack, survives rel |

### CLIPBOARD

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX13-02 | P0 | Вставка из Word 5 уровней заголовков, списков, таблиц, картинок; сравнение структуры | частично | apps/web/src/editor/clipboard/html.ts; tests/e2e/clipboard.spec.ts (заголовки, вложенные списки, таблица). Картинки из Word (file://, VML) браузер не передаёт — пользователь получает уведомление с числом непереданных изображений; RTF не разбирается | tests/unit/clipboard-html.test.ts: Word lists (AT-44, UX13-02, R-CLIPBOARD-020)<br>tests/e2e/clipboard.spec.ts: Word paste keeps headings, nested and numbered lists, links and tables without Office styl |

### MEDIA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX13-03 | P0 | Вставка изображения, закрытие вкладки во время загрузки, восстановление | реализовано | apps/web/src/lib/pendingUploads.ts + extensions/uploads.ts resumeUploads (Editor.tsx при открытии страницы с правом правки); tests/e2e/editor-p0-media.spec.ts:'closing the tab during an image upload: the block and the file are restored and the upload finishes on next open (UX13-03, R-MEDIA-006)' | tests/e2e/editor-p0-media.spec.ts: closing the tab during an image upload: the block and the file are restored and the upload |

### TABLE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX13-04 | P1 | Вставка 1000 строк из Excel, выбор типа таблицы, сохранение | частично | apps/web/src/editor/extensions/paste.ts SmartPaste; Нет выбора типа таблицы; 1000 строк не проверялось |  |

### IMPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX13-05 | P1 | Импорт DOCX с предупреждением о неподдерживаемом элементе, исходник доступен | реализовано | tests/integration/import-export.test.ts: merged-cells warning, import-source kept | tests/integration/import-pipeline.test.ts: the original MD, ZIP and CSV files are attached to the imported page for the author (R-IMP<br>tests/integration/import-export.test.ts: imports headings, nested lists, merged tables and images with a report; original kept (R-I |

### CLIPBOARD

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX13-06 | P1 | Несколько блоков → Word и Markdown; сравнение | частично | Mod+Shift+C по выделению → Markdown; Направление в Word не проверено (env) |  |

### PAGE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX13-07 | P0 | [[Ссылка]], переименование и перемещение цели — ссылка рабочая | реализовано | apps/web/src/editor/extensions/suggest.tsx#pageLinkExtension, apps/web/src/lib/pageRefs.ts; нет автотеста |  |

### COLLAB

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX13-08 | P0 | Правка одного абзаца вдвоём, отключение сети, восстановление без потерь | реализовано | tests/integration/collab.test.ts | tests/integration/collab.test.ts: two editors typing in the same paragraph converge without loss (SC-25, AT-74, COLLAB-192,  |

### PERF

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX13-09 | P0 | 20 минут непрерывного ввода без рывков и потерянных символов | реализовано | tests/e2e/perf-session.spec.ts "E2E-120, UX13-09: long session — …" run with KB_LONG_SESSION_MIN=20 on 2026-10-22 (20.6 min, 198 lines / 14 612 chars + 200 formatting toggles, exact text, server copy and reload match); CI runs the 1-minute variant; latency over the 20 min: p50 47, p95 267, p99 468 ms on an overloaded container (docs/PERFORMANCE.md) | tests/e2e/perf-session.spec.ts: E2E-120, UX13-09: long session — 200 formatting toggles and continuous typing; exact final |

### HISTORY

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX13-10 | P0 | Отмена переноса блока с сохранением правок другого участника | реализовано | apps/web/src/editor/clientExtensions.ts (yUndoPlugin, только свои изменения), apps/web/src/editor/extensions/conflictGuard.ts; tests/e2e/collab-p0-editing.spec.ts (undo of a block move never silently drops a colleague's edits …); Правка участника в перемещённом блоке после отмены переноса остаётся в документе (или возвращается из его конфликтной копии одним действием) | tests/e2e/collab-p0-editing.spec.ts: undo of a block move never silently drops a colleague's edits (UX13-10, R-HISTORY-011)<br>tests/e2e/conflict.spec.ts: edit vs concurrent delete: the editor keeps a conflict copy and can put the block back (E- |

### LAYOUT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX13-11 | P1 | Длинная статья на мобильном, все элементы читаемы | частично | tests/e2e/mobile.layout.spec.ts; tests/e2e/visual.spec.ts at 375px; no long article on mobile |  |

### A11Y

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX13-12 | P1 | Масштаб 200% и клавиатурная навигация | реализовано | tests/e2e/a11y.spec.ts real 200% zoom test + keyboard-only test; keyboard and zoom are tested in separate tests |  |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX13-13 | P1 | Переключение темы без смещения контента | частично | theme only swaps colour tokens; no CLS test on theme switch |  |

### HISTORY

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX13-14 | P0 | Восстановление статьи из истории и корзины | реализовано | tests/integration/collab.test.ts, tests/integration/core.test.ts, tests/e2e/collab.spec.ts | tests/integration/core.test.ts: trash and restore a branch with children (D-05, SC-29, V17-F08, E-05, R-HISTORY-003, R-HIS<br>tests/e2e/collab.spec.ts: history: save a version, change text, restore the version (R-HISTORY-004, UX13-14, UX21-20 |

### OFFLINE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX13-15 | P0 | Сбой сервера после локального редактирования — честный статус, изменения восстанавливаются | реализовано | tests/resilience/crash-restart.test.ts, tests/resilience/db-connection-loss.test.ts | tests/integration/collab.test.ts: server restart during a session loses no acknowledged change and resends the rest (OPS-009 |

### EXPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX13-16 | P1 | Экспорт DOCX/MD и обратный импорт с автоматическим отчётом расхождений | частично | tests/integration/import-export.test.ts: MD export → import text equality; No automatic user-facing discrepancy report | tests/integration/import-export.test.ts: export (SC-13, S09, UX13-16)<br>tests/integration/import-export.test.ts: exports a page to MD/DOCX/HTML/PDF; DOCX opens in LibreOffice; MD round-trips (R-EXPORT-00 |

### IMPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX13-17 | P1 | CSV с кавычками, переносами, кириллицей, датами, ведущими нулями | реализовано | tests/integration/import-export.test.ts | tests/integration/import-export.test.ts: tabular import (AT-48, AT-49, AT-50, UX13-17)<br>tests/integration/import-export.test.ts: CSV in Windows-1251 with ";" and decimal comma, quotes and leading zeros; repeated upsert  |

### SEARCH

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX13-18 | P1 | Поиск по заголовку, тексту и обратным ссылкам | реализовано | apps/server/src/services/search.ts, apps/web/src/pages/PageView.tsx#Backlinks |  |

### PERF

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX13-19 | P1 | Импорт 100 изображений без зависания ввода | не реализовано | n/a; no 100-image import responsiveness test |  |

### QA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX13-20 | P1 | Визуальная регрессия ключевых экранов на 3 ширинах и 2 темах | частично | tests/e2e/a11y.spec.ts baselines at 1280px light only; no baselines at 3 widths × 2 themes |  |

### PROCESS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PROCESS-039 | P0 | Запрет выпуска при потере текста/вложений, ошибке прав, некорректном восстановлении, зависании редактора, сломанной базовой вставке | реализовано | scripts/release-gate.py blocks release while any P0 requirement (text/attachment loss, ACL, restore, editor hang …) is open; the gate is generic over P0 status, not a per-condition check |  |

### QA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-QA-023 | P1 | Юзабилити-тест ≥8 сотрудников без обучения: создание, импорт, оформление, ссылка, поиск, экспорт; время, ошибки, просьбы о помощи … | требует ручной проверки | n/a; usability test with ≥8 employees not performed |  |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-UI-041 | P1 | Усложнение модели только при сохранении простого пути по умолчанию | требует ручной проверки | n/a; design principle; needs review |  |

### QA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-QA-024 | P1 | Красота оценивается по эталонным макетам и визуальной регрессии, а не «похоже на Notion» | требует ручной проверки | n/a; no reference mockups to compare against |  |

### TREE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-TREE-009 | P1 | Зоны панели: Поиск, Избранное, Пространства, Общие, Личные, Корзина; секции сворачиваются независимо; без наложений от 320 px | реализовано | apps/web/src/layout/Sidebar.tsx, apps/web/src/layout/SidebarTree.tsx (секции сворачиваются независимо) |  |
| R-TREE-010 | P1 | Строка узла: отдельные зоны стрелки, иконки, названия, действий; стрелка только раскрывает, название только открывает; высота 36 px … | частично | apps/web/src/styles/tokens.css (--row-h: 32px), apps/web/src/styles/layout.css; Зоны разделены; высота строки 32 px вместо 36, на touch 40 px вместо 44 |  |
| R-TREE-011 | P1 | Ширина 280 px, настройка 240–420 px; многоточие, tooltip, фокус, полное название; глубокая вложенность — фокус ветки и breadcrumbs … | частично | apps/web/src/state/ui.ts#setSidebarWidth (240–420, по умолчанию 280), apps/web/src/layout/SidebarTree.tsx; Нет «фокуса ветки» для глубокой вложенности |  |
| R-TREE-012 | P1 | Выравнивание по сетке; hover-кнопки не перекрывают текст; без скачков строк | реализовано | apps/web/src/styles/layout.css (.tree-row grid, .tree-actions opacity) |  |
| R-TREE-013 | P1 | Раскрытие 120–180 мс с reduced-motion; не анимировать тысячи элементов; раскрытие per-user; при переходе раскрываются предки | реализовано | apps/web/src/layout/treeState.ts#useRevealCurrentPage (раскрытие пространства и предков открытой страницы), styles/layout.css; нет автотеста |  |
| R-TREE-014 | P1 | DnD: цели перед/после/внутрь; клавиатурные аналоги, Undo, автопрокрутка, предупреждение об изменении прав | реализовано | apps/web/src/layout/SidebarTree.tsx (before/after/inside, Alt+Shift+↑/↓), apps/web/src/layout/treeActions.tsx (undo-тост, подтверждение аудитории), MoveDialog | tests/integration/acl.test.ts: moving a private page to an open space requires confirmation and shows who gains access; u |
| R-TREE-015 | P1 | Lazy-load, виртуализация с доступностью, без мигания; поиск по дереву не раскрывает запрещённые страницы | реализовано | apps/web/src/layout/SidebarTree.tsx (useVirtualizer, lazy), apps/server/src/services/tree.ts#visibleChildren; Поиска по дереву нет (см. R-TREE-006) |  |
| R-TREE-016 | P1 | Контекстное меню: подстраница, переименовать, иконка, переместить, дублировать, ссылка, избранное, права, архив/корзина … | частично | apps/web/src/layout/SidebarTree.tsx#nodeMenu; Нет пункта «Права/Поделиться» в контекстном меню дерева |  |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ACL-021 | P0 | Режимы «Только я», «Конкретные пользователи и группы», «Вся компания»; публичная ссылка выключена, только политикой админа | реализовано | ShareDialog presets «Только я» (POST /pages/:id/access/only-me with preview of who loses access), «Отдел: …» (GET /me/groups), «Вся компания»; specific users/groups; public links off unless publicLinksEnabled; tests/integration/acl-p0.test.ts 'R-ACL-021: «Только я» …', 'E2E-109 …'; tests/e2e/acl-p0-spaces.spec.ts 'R-ACL-021 R-ACL-036 …' | tests/integration/acl-p0.test.ts: public links (R-PUBLISH-009, E2E-109, R-ACL-021)<br>tests/integration/acl-p0.test.ts: sharing details (R-ACL-051, R-ACL-021, R-ACL-036, R-ACL-063)<br>tests/integration/acl-p0.test.ts: R-ACL-021: «Только я» shows who loses access, requires confirmation and leaves only the au<br>… ещё 1 |
| R-ACL-022 | P1 | Уровни: просмотр, комментарии, редактирование, полный контроль; отдельно структура, экспорт, предоставление доступа | частично | levels view/comment/edit/full; grant flags canExport/canDownload/canShare/canPublish (grants table, setGrant); Separate structure/export/share flags are API-only; ShareDialog exposes only levels. |  |
| R-ACL-023 | P0 | Наследование с видимыми исключениями; «Почему у этого человека есть доступ»; запреты политики не обходятся дочерней страницей | реализовано | ShareDialog inherited list + ExplainBox (GET /access/explain), deny wins (combine), space policy (allowGuests/export) cannot be overridden by child grants; tests/integration/acl.test.ts ACL-161 |  |
| R-ACL-024 | P0 | При переносе показать, кто приобретёт/потеряет доступ; приватная страница не индексируется в чужом поиске, превью, упоминаниях, истории … | реализовано | previewMove audience diff (services/pages.ts), search/preview/backlinks/attachments filtered by ACL; tests/integration/acl.test.ts ACL-165 |  |
| R-ACL-025 | P0 | Отзыв доступа немедленно на сервере, аннулирование временных URL; политика срока жизни локальных копий | реализовано | signed links/exports re-checked; local copies: offline use only for 30 days, removed from the device when the server answers 404 (apps/web/src/sync/localCopies.ts, hooks/data.ts usePage); tests/e2e/acl-p0-ui.spec.ts 'QA26-24 R-ACL-075 R-ACL-076 … removes access and the local copy (R-ACL-025)'; tests/integration/acl-gaps.test.ts; Replica is kept while unsent edits are queued (never destroyed silently). | tests/e2e/acl-p0-ui.spec.ts: QA26-24 R-ACL-075 R-ACL-076: in the browser the UI shows exactly the server rights; no byp |

### AUDIT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-AUDIT-002 | P0 | Приглашения/отзыв логируются; права на сервере для каждой операции и файлов; тесты сочетаний родитель/дочерний/группы | реализовано | tests/integration/acl-p0.test.ts 'R-AUDIT-002: combinatorial parent / child / group inheritance matches an independent oracle, and every grant is audited' (36 combinations of space-group level × parent grant/deny × inheritance × child grant); user.create/grant.* audited | tests/integration/acl-p0.test.ts: role × permission matrix (R-ACL-013, R-AUDIT-002)<br>tests/integration/acl-p0.test.ts: R-AUDIT-002: combinatorial parent / child / group inheritance matches an independent oracl |

### EDITOR

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-EDITOR-038 | P0 | H1–H3, стили, ссылки, индексы, цитаты, разделители, списки, чекбоксы, таблицы, колонки, оглавление, сноски, toggle | частично | packages/shared/src/editor/extensions.ts; apps/web/src/editor/commands.tsx SLASH_COMMANDS; Сносок (footnotes) в схеме нет — Markdown-импорт сносок разворачивает их в текст |  |
| R-EDITOR-039 | P1 | Семантическая палитра: нейтральный, красный, оранжевый, жёлтый, зелёный, синий, фиолетовый; токены двух тем; контраст AA … | требует ручной проверки | apps/web/src/editor/palette.ts TEXT_COLORS/HIGHLIGHTS; styles/editor.css dark remap; «По умолчанию» в apps/web/src/editor/menus/BubbleToolbar.tsx; Контраст AA не измерен |  |
| R-EDITOR-040 | P1 | Callout: иконка, фон, вложенные абзацы/заголовки/списки/ссылки/изображения; пресеты Информация/Совет/Важно/Предупреждение/Ошибка/Пример | реализовано | callout.ts (info/tip/important/warning/error/example/neutral), content block+; CalloutView |  |
| R-EDITOR-041 | P1 | Toggle с произвольным содержимым, раскрытие с клавиатуры, копирование и экспорт | реализовано | KbDetails (content произвольный); markdown.ts <details>; docx-export.ts details; tests/unit/markdown.test.ts:'round-trips through import…' (toggle) |  |

### LAYOUT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-LAYOUT-006 | P1 | Колонки: DnD с видимыми границами, на узких экранах вертикально | частично | columns node + drag handle; editor.css:173 stacking; untested |  |

### EDITOR

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-EDITOR-042 | P1 | Панель форматирования не закрывает выделение и не перехватывает фокус; slash-меню стрелки/Enter/Esc; touch-панель без hover | частично | apps/web/src/editor/menus/BubbleToolbar.tsx; suggest.tsx (стрелки/Enter/Esc); Touch-варианта панели/ручки нет: ручка блока только по hover |  |

### LAYOUT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-LAYOUT-007 | P2 | Стили страницы: шрифт, ширина, плотность, обложка, иконка; токены централизованно | частично | page icon, cover field, wide flag; central tokens; no page-level font/density settings |  |

### CLIPBOARD

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-CLIPBOARD-022 | P0 | Никаких произвольных inline-стилей из импортируемого HTML | реализовано | apps/web/src/editor/clipboard/html.ts filterStyle (только семантика и собственная палитра/шрифты); tests/unit/clipboard-html.test.ts:'R-CLIPBOARD-022: removes scripts…'; tests/e2e/clipboard.spec.ts | tests/unit/clipboard-html.test.ts: paste sanitizer (R-CLIPBOARD-009, R-CLIPBOARD-010, R-CLIPBOARD-022)<br>tests/unit/clipboard-html.test.ts: R-CLIPBOARD-022: removes scripts, event handlers, iframes and arbitrary inline styles<br>tests/e2e/clipboard.spec.ts: Word paste keeps headings, nested and numbered lists, links and tables without Office styl |

### EXPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-EXPORT-020 | P1 | Режим чтения совпадает с редактором; печать, PDF, DOCX, MD имеют матрицу соответствия и отчёт ограничений | частично | Shared renderer for HTML/PDF (standaloneHtml), warnings per format; No published conformity matrix document |  |

### TREE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-TREE-017 | P0 | Дерево: UUID, parent_id, sort_key, workspace_id; транзакционный move, защита от циклов, версия дерева, курсорная подгрузка … | реализовано | apps/server/src/services/pages.ts#lockTree/movePage, apps/server/src/services/tree.ts (cursor after), packages/shared/src/sort-key.ts; tests/integration/core.test.ts | tests/integration/core.test.ts: moves keep ids, ancestors closure is consistent, order respected, undo restores (R-TREE-00 |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ACL-026 | P0 | ACL/группы/политики; effective permissions с инвалидируемым кешем; проверка в API, WS, поиске, экспорте, превью, скачивании | частично | effective access computed per request (accessForPages), acl_epoch bumped on every change (apps/server/src/acl/engine.ts bumpAclEpoch), checks in API/WS/search/export/preview/download; decision documented in docs/DECISIONS.md D-24; No permission cache by design (D-24): rights are computed per request in one query and acl_epoch drives WS re-checks. A cache keyed by acl_epoch would be correct only if every change (including direct DB edits and time-based expiry) bumped the epoch, and saves no queries — so the 'cache is invalidated' acceptance is not demonstrable. |  |

### EDITOR

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-EDITOR-043 | P0 | Узлы и marks со строгой схемой, валидаторы, миграции схемы, санация, совместные операции и снапшоты; HTML не единственный источник | реализовано | collab/ydoc.ts validateDoc (схема + findUnsafeUrls), sanitizeDocUrls при импорте/восстановлении; migrations.ts; tests/unit/schema-migrations.test.ts; tests/integration/files-integrity.test.ts:'R-EDITOR-043…'; tests/integration/collab.test.ts | tests/integration/files-integrity.test.ts: server-side document validation (R-EDITOR-043)<br>tests/integration/files-integrity.test.ts: R-EDITOR-043: an update with a script-capable link (javascript:) is rejected and the docum<br>tests/unit/schema-migrations.test.ts: document schema versions (R-EDITOR-023, R-EDITOR-043)<br>… ещё 1 |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-UI-042 | P1 | Состояния: loading, empty, ready, saving, saved, offline, reconnecting, conflict, denied, failed | частично | Editor sync-status; tests/e2e/editor.spec.ts saved + offline; tests/e2e/collab.spec.ts read-only; reconnecting/conflict/failed not tested |  |

### TREE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| E2E-091 | P1 | Раскрытие стрелкой не открывает страницу | реализовано | apps/web/src/layout/SidebarTree.tsx (.tree-chevron onToggle); нет автотеста |  |
| E2E-092 | P1 | Клик по названию не меняет раскрытие | реализовано | apps/web/src/layout/SidebarTree.tsx (title → onOpen); нет автотеста |  |
| E2E-093 | P1 | Кнопки при hover не сдвигают название | реализовано | apps/web/src/styles/layout.css (действия резервируют колонку, opacity); нет автотеста |  |
| E2E-094 | P1 | Длинный заголовок на 240 px не накладывается | реализовано | apps/web/src/styles/layout.css (minmax(0,1fr), ellipsis); нет автотеста |  |
| E2E-095 | P1 | 12 уровней вложенности доступны через фокус ветки | частично | apps/web/src/layout/SidebarTree.tsx (INDENT 14px); Фокуса ветки нет; 12 уровней только отступами |  |
| E2E-096 | P1 | Состояние дерева сохраняется после перезагрузки | реализовано | apps/web/src/state/ui.ts (expanded в localStorage); нет автотеста |  |
| E2E-097 | P0 | Перемещение узла между родителями корректно | реализовано | tests/integration/core.test.ts (moves keep ids, order respected) | tests/integration/core.test.ts: moves keep ids, ancestors closure is consistent, order respected, undo restores (R-TREE-00 |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| E2E-098 | P0 | Перенос с изменением прав предупреждает | реализовано | treeActions.tsx movePage confirm dialog with gained/lost; tests/integration/acl.test.ts ACL-165 (409 audience_change); Server-level test only, no browser E2E. | tests/integration/acl.test.ts: moving a private page to an open space requires confirmation and shows who gains access; u |

### TREE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| E2E-099 | P0 | Невозможен перенос родителя в потомка | реализовано | tests/integration/core.test.ts (E2E-099) | tests/integration/core.test.ts: prevents moving a page into its own descendant (E2E-099, UX23-208, UX21-189) |

### PERF

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| E2E-100 | P1 | Виртуализация 10 000 узлов без потери клавиатурной навигации | частично | SidebarTree @tanstack/react-virtual + keyboard; not tested with 10 000 nodes |  |

### SEARCH

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| E2E-101 | P0 | Приватная страница не появляется в поиске другого пользователя | реализовано | tests/integration/content.test.ts (applies ACL before results) | tests/integration/content.test.ts: finds by morphology, typo, wrong layout, applies ACL before results and jumps to block (R- |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| E2E-102 | P0 | Вложение приватной страницы не открывается прямой ссылкой | реализовано | tests/integration/content.test.ts: files of a private page are not accessible by direct link (E2E-102) | tests/integration/content.test.ts: files of a private page are not accessible by direct link; revocation invalidates signed l |
| E2E-103 | P1 | Наследуемые права объясняются в интерфейсе | реализовано | apps/web/src/components/page/ShareDialog.tsx "Унаследованный доступ" with via labels + ExplainBox inheritance chain; No browser test. |  |
| E2E-104 | P0 | Исключение дочерней страницы применяется | реализовано | tests/integration/acl.test.ts: restricted child page (ACL-160) | tests/integration/acl.test.ts: restricted child page is not accessible through parent rights (ACL-160, R-ACL-034, E2E-104 |
| E2E-105 | P0 | Отзыв доступа закрывает WebSocket-подписку | реализовано | tests/integration/collab.test.ts: revoking view closes it (E2E-105) | tests/integration/collab.test.ts: read-only user cannot write; revoking edit switches session to read-only; revoking view cl<br>tests/integration/collab.test.ts: a user without access cannot open the live channel (S03/E2E-105) |
| E2E-106 | P0 | Права корректны при одновременном переносе и редактировании | реализовано | tests/integration/acl-p0.test.ts 'E2E-106: moving a page while it is being edited re-evaluates rights for the open editor; later edits are not saved' | tests/integration/acl-p0.test.ts: move preview (R-SPACE-007, R-ACL-068) and concurrent move + edit (E2E-106)<br>tests/integration/acl-p0.test.ts: E2E-106: moving a page while it is being edited re-evaluates rights for the open editor; l |
| E2E-107 | P0 | Групповые права пересчитываются после изменения состава | реализовано | tests/integration/acl.test.ts: removing a user from a department revokes access | tests/integration/acl.test.ts: removing a user from a department revokes access; personal grants remain (R-ACL-039, E2E-1 |

### EXPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| E2E-108 | P0 | Экспорт запрещён без права | реализовано | tests/integration/import-export.test.ts: no export permission => 403 | tests/integration/import-export.test.ts: export respects rights: no export permission => 403; private pages never leak into branch  |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| E2E-109 | P0 | Публичная ссылка запрещена политикой | реализовано | tests/integration/acl-p0.test.ts 'E2E-109: creating a public link is rejected while the organisation policy forbids it (default)'; tests/e2e/acl-p0-spaces.spec.ts 'E2E-109 R-PUBLISH-009 …' | tests/integration/acl-p0.test.ts: public links (R-PUBLISH-009, E2E-109, R-ACL-021)<br>tests/integration/acl-p0.test.ts: E2E-109: creating a public link is rejected while the organisation policy forbids it (defa<br>tests/e2e/acl-p0-spaces.spec.ts: E2E-109 R-PUBLISH-009: public links are off by policy; once enabled a link opens without l |

### AUDIT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| E2E-110 | P0 | Аудит фиксирует изменение прав | реализовано | apps/server/src/services/grants.ts audit grant.*; tests/integration/acl.test.ts: parallel grant changes ... audit events (ACL-172) | tests/integration/acl.test.ts: parallel grant changes do not lose updates (one active grant per subject) (ACL-169, ACL-17 |

### EDITOR

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| E2E-111 | P1 | Цвет текста сохраняется после перезагрузки | реализовано | TextStyle/Color в схеме, хранится в Yjs; Автотеста нет |  |

### A11Y

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| E2E-112 | P1 | Подсветка контрастна в двух темах | частично | tests/e2e/a11y.spec.ts axe audit (title carries E2E-112) — the audited page has no highlight colours; highlight palettes c-yellow/hl-yellow, c-orange/hl-orange not exercised by the audit | tests/e2e/a11y.spec.ts: WCAG 2.1 AA automated audit of key screens (R-A11Y-003, AT-80, E2E-112) |

### CLIPBOARD

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| E2E-113 | P1 | Callout с вложенной таблицей корректно копируется | реализовано | callout content block+ сериализуется с таблицей; Без теста |  |

### EXPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| E2E-114 | P1 | Toggle с изображением корректно экспортируется | частично | docx-export.ts exports toggle expanded incl. children; No test for toggle containing an image |  |

### A11Y

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| E2E-115 | P1 | Slash-меню работает без мыши | реализовано | tests/e2e/editor.spec.ts "slash menu inserts a table and a callout" (keyboard only) |  |

### EDITOR

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| E2E-116 | P0 | Форматирующая панель не сбивает выделение | реализовано | apps/web/src/editor/menus/BubbleToolbar.tsx preventDefault на кнопках; Отдельного E2E нет |  |

### LAYOUT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| E2E-117 | P1 | Колонки перестраиваются на мобильном | частично | editor.css:173 columns stack ≤640px; no test |  |

### HISTORY

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| E2E-118 | P0 | Undo отменяет только ожидаемое действие | реализовано | apps/web/src/editor/clientExtensions.ts (Tiptap Collaboration → y-tiptap yUndoPlugin, own origin only; undoRedo disabled in packages/shared/src/editor/extensions.ts); tests/e2e/undo.spec.ts | tests/e2e/undo.spec.ts: undo of a block move and of a block deletion is precise (UX-138, E2E-118, QA26-14) |

### EXPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| E2E-119 | P1 | Печать и режим чтения не ломают структуру | требует ручной проверки | editor.css @media print; Print/reading mode needs browser check |  |

### PERF

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| E2E-120 | P0 | 200 быстрых операций форматирования без зависания и потери символов | реализовано | tests/e2e/perf-session.spec.ts "E2E-120, UX13-09: long session — 200 formatting toggles and continuous typing; exact final text, nothing lost, saved on the server" | tests/e2e/perf-session.spec.ts: E2E-120, UX13-09: long session — 200 formatting toggles and continuous typing; exact final |
| R-PERF-017 | P1 | p95 раскрытия кэшированной ветки ≤100 мс; удалённая подгрузка с состоянием ожидания; p95 форматирования ≤50 мс | частично | virtualised tree, cached children via react-query; not measured |  |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-UI-043 | P1 | Нулевые перекрытия/обрезания критичных элементов на 320/375/768/1024/1440 px при 100% и 200% | частично | tests/e2e/visual.spec.ts overflow only; overlaps not detected; 200% only at one width |  |

### QA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-QA-025 | P1 | Chrome, Firefox, Safari, Edge; клавиатура, touch, reduced-motion, темы; визуальные скриншоты всех состояний дерева, окна доступа, блоков | частично | Chromium E2E; only Chromium is installed (playwright.config.ts, DECISIONS D-18); no screenshots of tree/share dialog/block states |  |
| R-QA-026 | P1 | Новый сотрудник за ≤5 минут без подсказок: вложенная статья, callout, ссылка, доступ коллеге (валидируется пилотом) | требует ручной проверки | n/a; pilot not performed |  |

### ORG

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ORG-001 | P0 | Организация → подразделения (вложенные) → сотрудники; рабочие группы и пространства независимо от структуры | реализовано | groups kind department (nested parent_id) / group; GroupsSection; tests/integration/acl.test.ts: nested departments | tests/integration/acl.test.ts: nested departments: member of a sub-department inherits parent department access (R-ORG-00 |
| R-ORG-002 | P1 | Сотрудник в нескольких группах, с основным отделом и руководителем; пространство не обязано совпадать с отделом | реализовано | group_members (many), users.primary_group_id, users.manager_id; EditUserDialog |  |
| R-ORG-003 | P1 | Каждая сущность: стабильный UUID, имя, описание, владелец, статус, аудит изменений | частично | UUID ids, name, description, created_by, audit group.*/space.*/user.*; Groups have no owner/status fields; spaces have no explicit owner field (only grants). |  |
| R-ORG-004 | P0 | Удаление отдела не удаляет пользователей и статьи; сначала переназначение прав и владельцев | реализовано | DELETE /admin/groups/:id -> 409 group_in_use with affected grants unless reassignTo/confirm; reassignment keeps stronger grant, audited; tests/integration/acl-gaps.test.ts | tests/integration/acl-gaps.test.ts: deleting a department requires reassignment or confirmation (R-ORG-004) |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ACL-027 | P1 | Типы учётных записей: гость, сотрудник, руководитель; роли админ организации, админ участников, владелец пространства, владелец документа | реализовано | users.kind employee/guest; org_role owner/admin/people_admin/auditor/member; group manager (groups.manager_id, group_members.role); pages.owner_id |  |
| R-ACL-028 | P0 | Руководитель управляет членством делегированных отделов, но не получает автоматически доступ к секретным документам | реализовано | apps/server/src/services/org.ts isGroupManager allows membership changes only; no content access implied; No test; a delegated manager can add himself to the department (by design?). |  |
| R-ACL-029 | P0 | Гость видит только явно разрешённые страницы и их разрешённые дочерние | реализовано | org-subject grants never match guests (engine matches()); tests/integration/acl.test.ts: guest invited to one page sees only it | tests/integration/acl.test.ts: guest invited to one page sees only it, no directory, no org-wide content (ACL-155, ACL-17 |
| R-ACL-030 | P1 | Уровни: нет доступа, просмотр, комментарии, редактирование, управление страницей, управление пространством | реализовано | LEVELS none/view/comment/edit/full; full on page = manage page, full on space = manage space |  |
| R-ACL-031 | P1 | Экспорт, скачивание, приглашения, публикация — отдельные флаги политики; запрет копирования в браузере не гарантия защиты | реализовано | space policy allowExport/allowDownload/allowGuests + grant flags canExport/canDownload/canShare/canPublish; tests/integration/acl.test.ts: export/download flags; Invitations flag = canShare. | tests/integration/acl.test.ts: export/download flags are reflected in actions (R-ACL-031) |

### SPACE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-SPACE-003 | P0 | Типы пространств: общедоступное, закрытое (видно название), приватное (не видно), личное | реализовано | visibility open/closed/private + kind personal; GET /spaces discoverable closed spaces for employees; Closed (name visible) case not tested. |  |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ACL-032 | P0 | Новая страница наследует права родителя; исключение отмечено маркером | реализовано | hasExplicitGrants on tree nodes/PageDto, SidebarTree lock marker for explicit grants or broken inheritance; tests/integration/acl-gaps.test.ts | tests/integration/acl-gaps.test.ts: explicit exceptions are marked (R-ACL-032, R-ACL-077) |
| R-ACL-033 | P0 | При конфликте — запрет верхнего уровня для гостей/внешних и минимально достаточный доступ … | реализовано | deny wins; space allowGuests and org guestsEnabled=false (engine orgGuestsDisabled) override any grant; tests/integration/acl.test.ts, tests/integration/acl-gaps.test.ts | tests/integration/acl-gaps.test.ts: organisation guest switch beats existing grants (R-ACL-033) |
| R-ACL-034 | P0 | Защищённая дочерняя страница не доступна из-за прав на родителя | реализовано | tests/integration/acl.test.ts: restricted child page is not accessible through parent rights | tests/integration/acl.test.ts: restricted child page is not accessible through parent rights (ACL-160, R-ACL-034, E2E-104 |
| R-ACL-035 | P0 | Перенос между пространствами: предпросмотр изменений доступа и подтверждение при расширении аудитории | реализовано | previewMove/movePage requiresConfirmation (audience_change 409); tests/integration/acl.test.ts ACL-165 | tests/integration/acl.test.ts: moving a private page to an open space requires confirmation and shows who gains access; u |
| R-ACL-036 | P0 | Разрешение пользователю/группе/отделу/пространству с датой окончания, часовым поясом, автором и основанием | частично | grants store subject user/group(department)/org, starts_at, expires_at, time_zone (IANA, from the browser), granted_by, reason; ShareDialog «Ещё параметры» (start date, reason, flags) and SpaceMembersEditor (term, reason); tests/integration/acl-p0.test.ts 'R-ACL-036 R-ACL-063: …'; tests/e2e/acl-p0-spaces.spec.ts 'R-ACL-021 R-ACL-036 …'; A space as a subject («участники пространства X») is not supported — grant to the group/department that forms the space instead. | tests/integration/acl-p0.test.ts: sharing details (R-ACL-051, R-ACL-021, R-ACL-036, R-ACL-063)<br>tests/integration/acl-p0.test.ts: R-ACL-036 R-ACL-063: start, end, time zone, author and reason are stored; the granter is r<br>tests/e2e/acl-p0-spaces.spec.ts: R-ACL-021 R-ACL-036: share dialog — department preset, quick expiry, start date, reason, f |
| R-ACL-037 | P1 | Быстрые сроки: 1 день, 7 дней, 30 дней, дата, бессрочно | частично | apps/web/src/components/page/ShareDialog.tsx date input (empty = бессрочно); No quick presets 1/7/30 days. |  |
| R-ACL-038 | P0 | Истечение на сервере независимо от клиента; WebSocket и ссылки на вложения немедленно перепроверяют доступ | реализовано | hub.checkExpirations() every 5 s (KB_ACL_EXPIRY_CHECK_MS) detects grant/membership/account expiry and grant start, emits acl-changed -> recheckAccess downgrades/closes WS; events WS also checks session/account expiry; tests/integration/acl-gaps.test.ts: time-based expiry in live sessions; Detection latency up to the check interval (5 s). | tests/integration/acl-gaps.test.ts: time-based expiry in live sessions (R-ACL-038, V15-A07, ACL-156, R-ACL-063, R-ACL-003)<br>tests/integration/acl-gaps.test.ts: expiry of a temporary department membership is detected the same way (R-ACL-038) |

### ADMIN

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ADMIN-004 | P1 | Админ видит истекающие разрешения и отзывает досрочно | реализовано | GET /api/v1/admin/grants/expiring + ExpiringSection (early revoke via DELETE /grants/:id); No test. |  |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ACL-039 | P0 | Удаление из отдела прекращает доступ через отдел; персональное разрешение отображается как отдельный источник | реализовано | tests/integration/acl.test.ts: removing a user from a department revokes access; personal grants remain | tests/integration/acl.test.ts: removing a user from a department revokes access; personal grants remain (R-ACL-039, E2E-1 |
| R-ACL-040 | P1 | «Поделиться» в три шага: поиск человека/отдела/группы → уровень → срок и подтверждение | реализовано | apps/web/src/components/page/ShareDialog.tsx picker -> level -> optional date -> "Выдать доступ" with audience preview |  |
| R-ACL-041 | P1 | «Кто имеет доступ» и «Почему»: лично, отдел, группа, пространство, родитель | реализовано | apps/web/src/components/page/ShareDialog.tsx explicit + inherited list with via (лично/группа/пространство/родитель), ExplainBox |  |
| R-ACL-042 | P1 | Пресеты «Только я», «Приглашённые», «Отдел», «Вся компания» с предупреждением о последствиях; «Дополнительно» скрывает редкие политики | частично | apps/web/src/components/page/ShareDialog.tsx "Только приглашённые"/"Все сотрудники" with widening confirmation; No "Только я" and "Отдел" presets, no "Дополнительно" section. |  |
| R-ACL-043 | P1 | Запрос доступа с причиной владельцу; внешние публичные ссылки выключены по умолчанию | реализовано | POST /api/v1/access-requests notifies all sharers (usersWithAction); ShareDialog AccessRequest; tests/integration/gaps.test.ts: access requests notify; No approve/reject flow for requests (notification only). | tests/integration/gaps.test.ts: space managers (direct and via group) are notified about a page request; the requester is  |

### ADMIN

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ADMIN-005 | P1 | Создание сотрудника: имя, email, тип, отдел, руководитель, группы; предпросмотр доступных пространств | частично | CreateUserDialog (UsersSection.tsx): name, email, kind, departments, manager, groups; POST /admin/users returns effectiveSpaces; Accessible spaces are shown only after creation, not as a preview before confirming. |  |
| R-ADMIN-006 | P1 | Перевод в другой отдел: сравнение потерянных и приобретённых доступов | реализовано | POST /admin/users/:id/transfer-preview + TransferDialog; tests/integration/acl.test.ts A16 | tests/integration/acl.test.ts: transfer preview shows spaces gained and lost (V15-A16, R-ADMIN-006, R-ADMIN-023) |
| R-ADMIN-007 | P0 | Увольнение одним действием: сессии, токены, приглашения, временные права отключены; новые владельцы документов | реализовано | apps/server/src/services/org.ts setUserStatus (sessions, api_tokens, invitations, temporary grants) + transferOwnership; StatusDialog; Not covered by a test for tokens/transfer. |  |

### AUDIT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-AUDIT-003 | P1 | Неактивные сотрудники остаются в аудите без доступа | реализовано | users are never deleted (status deactivated); audit_events keep actor_id/actor_name |  |

### ADMIN

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ADMIN-008 | P2 | Импорт сотрудников CSV, в перспективе SCIM/SSO | реализовано | POST /admin/users/import (dry run + apply) + ImportDialog in UsersSection; SCIM not implemented (future); no test. |  |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ACL-044 | P0 | Серверная авторизация на API, WS-подписке, вложении, поиске, экспорте, превью, OCR | реализовано | requirePage/loadAttachment in API, WS, attachments, search, export, previews/tiles, OCR |  |
| R-ACL-045 | P0 | RBAC + ACL/группы/наследование + политики; effective_permission(subject, resource, action, time) с трассировкой источников | реализовано | apps/server/src/acl/engine.ts combine(grants, subjects, policy, {now}) with sources/denies/explanation; GET /access/explain; "time" parameter not exposed in API. |  |
| R-ACL-046 | P0 | Версионированный кеш прав с инвалидацией при изменении членства/ACL; не доверять клиентскому скрытию | частично | acl_epoch table + bumpAclEpoch; client never trusted; decision documented in docs/DECISIONS.md D-24; No permission cache by design (D-24): rights are computed per request in one query and acl_epoch drives WS re-checks. A cache keyed by acl_epoch would be correct only if every change (including direct DB edits and time-based expiry) bumped the epoch, and saves no queries — so the 'cache is invalidated' acceptance is not demonstrable. |  |

### FILES

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-FILES-006 | P0 | Краткоживущие подписанные URL вложений; отзыв прав прекращает выдачу новых URL | реализовано | apps/server/src/routes/attachments.ts POST /attachments/:id/link (5 мин), GET /files/:token перепроверяет права; tests/integration/content.test.ts:'files of a private page are not accessible…' | tests/integration/content.test.ts: files of a private page are not accessible by direct link; revocation invalidates signed l |

### SEARCH

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-SEARCH-011 | P0 | Индексы поиска фильтруются по разрешениям на сервере | реализовано | apps/server/src/services/search.ts | tests/integration/content.test.ts: finds by morphology, typo, wrong layout, applies ACL before results and jumps to block (R- |

### AUDIT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-AUDIT-004 | P0 | Все изменения ACL аудируются | реализовано | grant.create/update/revoke, page.inherit.*, space.update, group.member.*, group.delete audited; tests/integration/acl.test.ts ACL-172 | tests/integration/acl.test.ts: parallel grant changes do not lose updates (one active grant per subject) (ACL-169, ACL-17 |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-UI-044 | P1 | Светлая нейтральная тема-эталон: тёплый белый, светлые серые поверхности, графитовый текст, мягкие линии, тени, скругления 8–12 px | реализовано | tokens.css light tokens, radii 8/12, soft shadows |  |
| R-UI-045 | P1 | Шрифт Inter или аналог с кириллицей; текст 15–16 px, интервал 1.55–1.7; шкала заголовков | реализовано | main.tsx @fontsource-variable/inter; editor 16px, line-height 1.7; heading scale |  |
| R-UI-046 | P1 | Акценты: синий ссылки, зелёный успех, янтарный предупреждение, красный ошибка, сиреневый заметки; тёмная тема; WCAG AA | частично | tokens.css accents (--accent-strong 5.0:1, --success 5.2:1 on white); axe light-theme audit tests/e2e/a11y.spec.ts; dark theme not audited |  |

### EDITOR

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-EDITOR-044 | P1 | Запрет произвольных цветов callout: семантические токены и предпросмотр | реализовано | callout.ts variant enum; editor.css .kb-callout.v-* на токенах; Предпросмотр варианта — в меню вида |  |
| R-EDITOR-045 | P1 | Эмодзи/иконки, обложки, цвет текста/фона/блока, цитаты, toggle, колонки, подсказки; стили сохраняются при копировании/экспорте | частично | IconPicker, Color/Highlight, callout, Details, Columns; Нет UI обложки (API pages.cover есть), подсказок (tooltip-блоков), цвета блока кроме выносок |  |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-UI-047 | P1 | Анимации меню, дерева, DnD, панелей 120–220 мс; reduced-motion; не блокируют фокус, набор, переключение | частично | motion tokens in range; non-blocking of focus/typing not tested |  |

### LAYOUT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-LAYOUT-008 | P1 | Закрытие панели без скачков ширины текста; стабильная сетка | частично | page-body centred with max-width; at widths < content+panel closing the panel changes text width; untested |  |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-UI-048 | P1 | Скелетоны без бесконечных спиннеров; виртуализация длинных деревьев и списков | частично | skeletons; SidebarTree @tanstack/react-virtual; search/history/audit lists not virtualised; App loading spinner has no timeout |  |

### PERF

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PERF-018 | P1 | Отклик клика p95 <100 мс; раскрытие кэшированной ветки p95 <150 мс; нет заметного layout shift | не реализовано | n/a; click/branch-expand latency not measured |  |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V15-A01 | P0 | Новый сотрудник отдела видит только свои и общие пространства | реализовано | tests/integration/acl.test.ts: new employee ... (A04, S13) checks own + general spaces only | tests/integration/acl.test.ts: new employee of a department automatically gets its space (V15-A04, V16-S13, V15-A01, ACL- |
| V15-A02 | P0 | Гость не видит название приватного пространства в поиске, API, боковой панели | реализовано | GET /spaces hides private spaces, closed only for employees; guest test in tests/integration/acl.test.ts; Search not explicitly tested for guest. | tests/integration/acl.test.ts: guest invited to one page sees only it, no directory, no org-wide content (ACL-155, ACL-17 |
| V15-A03 | P0 | Руководитель не видит личную страницу подчинённого без разрешения | реализовано | personal space owner-only (combine personalOwner); tests/integration/acl.test.ts: admin does not see private content (A03); Tested for org admin, not specifically for a line manager. | tests/integration/acl.test.ts: org admin cannot open a personal page nor a private space page without a grant (V15-A03, R |

### ORG

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V15-A04 | P0 | Права отдела автоматически применяются к новому сотруднику | реализовано | tests/integration/acl.test.ts: new employee of a department automatically gets its space (A04) | tests/integration/acl.test.ts: new employee of a department automatically gets its space (V15-A04, V16-S13, V15-A01, ACL- |

### SEARCH

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V15-A05 | P0 | Исключение дочерней страницы не раскрывает содержимое через поиск или превью | реализовано | apps/server/src/services/search.ts (accessForPages), tests/integration/acl.test.ts (restricted child); Поиск по исключённой дочерней странице отдельно не тестируется |  |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V15-A06 | P0 | Перенос приватной статьи в общий раздел требует явного подтверждения | реализовано | tests/integration/acl.test.ts: moving a private page to an open space requires confirmation (A06) | tests/integration/acl.test.ts: moving a private page to an open space requires confirmation and shows who gains access; u |
| V15-A07 | P0 | Временный доступ истекает без перезагрузки браузера | реализовано | hub.checkExpirations() every 5 s (KB_ACL_EXPIRY_CHECK_MS) detects grant/membership/account expiry and grant start, emits acl-changed -> recheckAccess downgrades/closes WS; events WS also checks session/account expiry; tests/integration/acl-gaps.test.ts; No browser test. | tests/integration/acl-gaps.test.ts: time-based expiry in live sessions (R-ACL-038, V15-A07, ACL-156, R-ACL-063, R-ACL-003) |
| V15-A08 | P0 | Отзыв доступа блокирует активный WebSocket и повторное скачивание | реализовано | tests/integration/collab.test.ts revoking view closes it; tests/integration/content.test.ts revocation invalidates signed links | tests/integration/content.test.ts: files of a private page are not accessible by direct link; revocation invalidates signed l<br>tests/integration/collab.test.ts: read-only user cannot write; revoking edit switches session to read-only; revoking view cl |
| V15-A09 | P1 | В «Поделиться» показаны все источники доступа | реализовано | apps/web/src/components/page/ShareDialog.tsx audience with via; GET /access/explain sources; tests/integration/acl.test.ts A09 | tests/integration/acl.test.ts: explains why a user has access (ACL-161, V15-A09, V16-S15, R-ACL-078) |
| V15-A10 | P0 | Пользователь с просмотром не может изменить содержимое через API | реализовано | tests/integration/acl.test.ts: view-only cannot modify via API (A10) | tests/integration/acl.test.ts: company-wide view, editing only by authors; view-only cannot modify via API (V15-A10, ACL- |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V15-A11 | P1 | Длинные названия отделов и участников не перекрывают элементы | частично | ellipsis/admin-chip styles; no long-name test |  |

### LAYOUT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V15-A12 | P1 | На мобильном доступы управляются без горизонтального скролла | частично | ShareDialog full-screen on ≤600px; no mobile access-management test |  |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V15-A13 | P0 | Удаление группы пересчитывает права без осиротевших ссылок | реализовано | tests/integration/acl.test.ts: deleting a group revokes its grants (orphan count 0) | tests/integration/acl.test.ts: deleting a group revokes its grants and keeps users and pages (V15-A13) |

### FILES

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V15-A14 | P0 | Вложения недоступны по устаревшей ссылке после отзыва | реализовано | apps/server/src/routes/attachments.ts /files/:token → loadAttachment; Тест ожидает 404 (D-11), не 403 | tests/integration/content.test.ts: files of a private page are not accessible by direct link; revocation invalidates signed l |

### EXPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V15-A15 | P0 | Экспорт соблюдает отдельную политику скачивания | реализовано | exporter.ts collectAssets: download-forbidden warning, files excluded; tests/integration/acl.test.ts: export/download flags (R-ACL-031) |  |

### ADMIN

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V15-A16 | P1 | Перевод сотрудника между отделами показывает дифф прав | реализовано | tests/integration/acl.test.ts: transfer preview shows spaces gained and lost (A16) | tests/integration/acl.test.ts: transfer preview shows spaces gained and lost (V15-A16, R-ADMIN-006, R-ADMIN-023) |

### AUTH

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V15-A17 | P0 | Деактивация сотрудника отзывает сессии и токены | реализовано | revokeUserSessions revokes sessions and api_tokens; lookupApiToken requires status active; Tokens path not tested. |  |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V15-A18 | P1 | Цветные callout корректны в светлой/тёмной темах | частично | editor.css callout variants on *-soft tokens (text ≥13:1 light); dark variants untested |  |

### A11Y

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V15-A19 | P1 | Анимации отключаются в reduced-motion | реализовано | tests/e2e/a11y.spec.ts reduced-motion test |  |

### PERF

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V15-A20 | P1 | 1000 пользователей, 100 отделов, 500 групп, 100 000 страниц с профилированием ACL и поиска | не реализовано | n/a; no 1000 users/100k pages ACL+search profiling |  |

### QA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-QA-027 | P0 | Приёмка v1.5: 100% критических сценариев, нет утечек в негативных тестах, визуальные снимки, регрессионные E2E | частично | tests/integration/acl.test.ts negative ACL tests; pixel baselines tests/e2e/a11y.spec.ts; critical-scenario coverage not 100% |  |

### PROCESS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PROCESS-040 | P2 | v1.6 дополняет v1.5, не отменяя его; сведения о Notion сверены по официальной справке | процесс/документ | registry keeps v1.5 items; exists |  |

### SEARCH

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-SEARCH-012 | P1 | Четыре области: глобальный Ctrl/Cmd+K, пространство, страница Ctrl/Cmd+F, таблица и свойства; область видна и меняется одним действием | частично | apps/web/src/layout/QuickSwitcher.tsx, apps/web/src/pages/SearchPage.tsx, apps/web/src/editor/extensions/find.ts; Глобальный, пространство (фильтр) и страница (Ctrl+F) есть; поиска по таблицам/свойствам как области и переключения области одним действием в Ctrl+K нет |  |
| R-SEARCH-013 | P1 | Индекс: заголовки, текст, свойства, таблицы, вложенные DOCX/PDF, OCR; путь, фрагмент, подсветка, дата, тип; морфология RU, опечатки … | частично | apps/server/src/jobs/worker.ts#indexPage, apps/server/src/services/file-text.ts; tests/integration/history-tree.test.ts; DOCX/TXT индексируются; содержимое PDF — нет (нет PDF-парсера в зависимостях) | tests/integration/history-tree.test.ts: search covers comments and attached documents (R-SEARCH-003, R-SEARCH-013)<br>tests/integration/history-tree.test.ts: finds a page by comment text and by text inside an attached DOCX/TXT, respecting access (R |
| R-SEARCH-014 | P0 | Фильтрация по ACL на сервере до ранжирования, подсчёта и подсказок; нет утечек через автодополнение, кеш, API | реализовано | apps/server/src/services/search.ts; tests/integration/content.test.ts | tests/integration/content.test.ts: finds by morphology, typo, wrong layout, applies ACL before results and jumps to block (R- |
| R-SEARCH-015 | P0 | Инвалидация индекса/кеша при изменении доступа; обновление пути при rename/move; удаление из выдачи … | реализовано | apps/server/src/services/search.ts (ACL на лету), apps/server/src/jobs/worker.ts (outbox, attempts), apps/server/src/routes/health.ts (searchIndexLag) |  |
| R-SEARCH-016 | P1 | Быстрые результаты при вводе, клавиатура, недавние, избранное, пустые состояния, переход к абзацу, сохранение фильтров | частично | apps/web/src/layout/QuickSwitcher.tsx, apps/web/src/pages/SearchPage.tsx; Избранное в быстром поиске отсутствует; фильтры сохраняются только в URL |  |
| R-SEARCH-017 | P1 | p95 подсказки ≤300 мс, p95 полные результаты ≤800 мс при 100 тыс. страниц; права в выдаче ≤5 с, прямой доступ блокируется немедленно | частично | apps/server/src/services/search.ts; Права применяются немедленно; p95 ≤300/≤800 мс на 100 тыс. страниц не измерялись (нагрузочного теста поиска нет) |  |

### PUBLISH

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PUBLISH-007 | P0 | Статусы Черновик/На согласовании/Опубликовано/Архив; публикация — неизменяемая ревизия; читатели видят опубликованную | реализовано | publish() marks immutable revision kind publish; readers in publish mode see it | tests/integration/content.test.ts: readers see the published revision while the draft evolves; approval required when configu |
| R-PUBLISH-008 | P1 | Публикация в компании, пространстве, отделам/людям; внешняя только по политике; предпросмотр аудитории, вложений, дочерних, индексации … | частично | publish within the space audience; PublishBar confirm; No choice of publication audience (company/departments/people), no preview of audience/attachments/children/indexing. |  |
| R-PUBLISH-009 | P0 | Публичная ссылка: отзыв, срок, пароль, noindex по умолчанию, контроль скачивания; предупреждение, что скачанное нельзя отозвать | реализовано | routes/acl-extra.ts: POST/GET /pages/:id/share-links, DELETE /share-links/:id, anonymous /pub/:token (noindex header+meta by default, expiry, argon2 password with audited failures, download flag + space policy, children only when included, link dies on revoke / policy off / creator losing share), admin list; ShareDialog PublicLinksSection with the «скачанное нельзя отозвать» acknowledgement; tests/integration/acl-p0.test.ts 'R-PUBLISH-009: …' (2 tests); tests/e2e/acl-p0-spaces.spec.ts 'E2E-109 R-PUBLISH-009 …' | tests/integration/acl-p0.test.ts: public links (R-PUBLISH-009, E2E-109, R-ACL-021)<br>tests/integration/acl-p0.test.ts: R-PUBLISH-009: link works anonymously with noindex, honours password, expiry, download con<br>tests/integration/acl-p0.test.ts: R-PUBLISH-009: a link stops when its creator loses the right to share; children only when <br>… ещё 1 |

### PAGE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PAGE-020 | P0 | Постоянная ссылка на статью, заголовок, блок; работает после переноса; без прав — безопасная ошибка | реализовано | apps/web/src/pages/PageView.tsx (PageError 404 + запрос доступа), apps/server/src/routes/pages.ts#resolve |  |

### EXPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-EXPORT-021 | P2 | Печать A4 с оглавлением, переносами таблиц, скрытой навигацией, callout и вложениями; предпросмотр | частично | editor.css @media print; PDF A4 via Chromium; No TOC/print preview; not tested |  |
| R-EXPORT-022 | P0 | Экспорт DOCX, MD, PDF, HTML: статья или дерево, вложения по политике; отчёт, прогресс, отмена, проверка целостности | реализовано | POST /api/v1/exports/:id/cancel + «Отменить экспорт» in ExportDialog; SHA-256 of every export (x-content-sha256, job file.sha256, shown in the dialog); DOCX validated before delivery; separate-files ZIP layout with checksums/report; TOC in merged DOCX; tests/integration/io-p0-export.test.ts: a queued export is cancelled…; branch export: one DOCX with a table of contents, or separate files…; tests/e2e/io-p0-roundtrip.spec.ts: background export of a branch can be cancelled from the dialog… | tests/integration/io-p0-export.test.ts: exported DOCX with every block type passes Open XML package/schema validation and opens in<br>tests/integration/io-p0-export.test.ts: background export: cancel, integrity, layouts (R-EXPORT-022)<br>tests/integration/io-p0-export.test.ts: a queued export is cancelled before it runs; a running export stops at the next page; noth<br>… ещё 3 |

### PAGE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PAGE-021 | P1 | Дублирование страницы/ветки: место, дочерние, вложения; новый ID; правила ссылок; запрет копирования секретных вложений без прав | реализовано | apps/server/src/services/pages.ts#duplicatePage (вложения только при праве download, гостевые гранты не копируются); tests/integration/core.test.ts; Внутренние ссылки внутри копии ветки не перенаправляются на копии | tests/integration/core.test.ts: duplicates a branch with new ids (R-PAGE-021) |

### HISTORY

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-HISTORY-012 | P0 | Журнал и снимки: автор, время, блоки, свойства, таблицы, права, публикации; история не заменяет бэкапы | реализовано | apps/server/src/collab/hub.ts#flushNow (page_events edit), apps/server/src/routes/pages.ts (updated/moved), apps/server/src/routes/revisions.ts |  |
| R-HISTORY-013 | P0 | Сравнение двух версий с подсветкой; восстановление статьи или блока как новая версия | частично | apps/server/src/routes/revisions.ts#restore-block, apps/web/src/components/page/HistoryPanel.tsx; Восстановление блока не создаёт новую версию сразу (только событие restored-block) | tests/integration/collab.test.ts: restores a single deleted block from a revision (R-HISTORY-003, R-HISTORY-013) |
| R-HISTORY-014 | P0 | Восстановление при совместной работе согласует текущие изменения, предупреждает редакторов, не теряет неподтверждённые операции | реализовано | apps/server/src/routes/revisions.ts#restoreContent (pre-restore + CRDT), событие page-restored (apps/server/src/routes/collab.ts /api/v1/events), apps/web/src/hooks/useEvents.ts (toast со ссылкой на версию до восстановления); tests/integration/history-tree.test.ts | tests/integration/history-tree.test.ts: restore notifies co-editors (R-HISTORY-014, COLLAB-197)<br>tests/integration/history-tree.test.ts: everyone else on the page gets a page-restored event with a link to the pre-restore versio |
| R-HISTORY-015 | P1 | Раздельные версии черновика и публикаций; хранение, юридическое удержание, политики удаления | реализовано | apps/server/src/routes/retention.ts (PUT /api/v1/admin/legal-hold, аудит), apps/web/src/components/page/PageInfoPanel.tsx#LegalHold, apps/server/src/jobs/worker.ts#maintenance; tests/integration/history-tree.test.ts | tests/integration/history-tree.test.ts: legal hold (R-HISTORY-015, R-HISTORY-028)<br>tests/integration/history-tree.test.ts: only org admins set or release a hold; it is audited, shown on the page and blocks permane |

### PAGE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PAGE-022 | P1 | Панель свойств: владелец, ответственный, автор, статус, категория, теги, дата пересмотра, версия, отдел, конфиденциальность … | реализовано | apps/web/src/components/page/PageInfoPanel.tsx#PropertiesEditor, apps/server/src/routes/pages.ts (requiredProperties из шаблона); Обязательные свойства шаблона подсвечиваются; нет автотеста |  |
| R-PAGE-023 | P1 | Свойства редактируются в контексте; скрытие необязательных; значения по умолчанию | реализовано | apps/web/src/components/page/PageInfoPanel.tsx#PropertiesEditor (PATCH с expectedVersion, конфликт версий); нет автотеста |  |
| R-PAGE-024 | P1 | Меню: Поделиться, Ссылка, Печать, Экспорт, Дублировать, История, Свойства, Переместить, Архивировать, Удалить; видимость по правам | реализовано | apps/web/src/pages/PageView.tsx#menuItems (видимость/disabled по правам); «Архивировать» в PublishBar, не в меню |  |

### ADMIN

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ADMIN-009 | P1 | Админ-центр: обзор, люди, отделы, группы, пространства, роли, гости, приглашения, публикации, аудит; поиск, фильтры, массовые операции … | частично | AdminPage tabs: users, groups, settings, audit, archives, health, expiring; search & filters in UsersSection; Missing sections: overview, spaces, roles, guests/invitations dashboard, publications; no bulk operations. |  |
| R-ADMIN-010 | P0 | Матрица эффективного доступа пользователь × пространство/страница: уровень, источник, срок, владелец, конфликты … | реализовано | GET /api/v1/admin/access-matrix (users × non-personal spaces: level, source incl. group names, earliest expiry, deny+allow conflicts, managers) + admin «Доступ → Матрица доступа»; pages via «Проверить доступ»; tests/integration/acl-p0.test.ts 'R-ADMIN-010 V16-S15: …'; tests/e2e/acl-p0-admin.spec.ts | tests/integration/acl-p0.test.ts: effective access for administrators (R-ADMIN-010, V16-S15, R-ADMIN-018)<br>tests/integration/acl-p0.test.ts: R-ADMIN-010 V16-S15: users × spaces matrix shows level, source, expiry, conflicts and mana |
| R-ADMIN-011 | P1 | Мастер сотрудника: приглашение, роль, отделы, группы, пространства, срок, предпросмотр; отзыв/перевод пересчитывает права | частично | CreateUserDialog (role, departments, groups, expiry), TransferDialog recalculates; No spaces step and no pre-confirmation preview in the wizard. |  |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ACL-047 | P0 | Наименьшие привилегии: админ пользователей не читает приватный контент; отдельные полномочия публикации, политик, аудита, контента | реализовано | org admin gets no content grants; people_admin/auditor separate roles; tests/integration/acl.test.ts A03 | tests/integration/acl.test.ts: org admin cannot open a personal page nor a private space page without a grant (V15-A03, R |

### ADMIN

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ADMIN-012 | P1 | Панель контроля: внешние ссылки, истекающие приглашения, открытые пространства, сиротские страницы, владельцы, массовые экспорты … | частично | ExpiringSection (expiring grants); No control panel for external links, expiring invitations, open spaces, orphan pages, ownerless pages, mass exports. |  |

### SEARCH

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V16-S01 | P1 | Найти вложенный абзац глобальным поиском и открыть страницу на фрагменте | реализовано | tests/e2e/collab.spec.ts (search ... jumps to the block) | tests/e2e/collab.spec.ts: search finds a page by a word from its body and jumps to the block (V16-S01, R-SEARCH-005) |
| V16-S02 | P1 | Поиск в пространстве не выдаёт соседние; поиск в странице не выходит за её пределы | реализовано | tests/integration/content.test.ts (space scope does not leak) | tests/integration/content.test.ts: space scope does not leak neighbouring spaces (S02, V16-S02) |
| V16-S03 | P0 | Закрытая статья не в подсказках, счётчиках, фрагментах, API, кешах | реализовано | apps/server/src/services/search.ts; tests/integration/content.test.ts | tests/integration/content.test.ts: finds by morphology, typo, wrong layout, applies ACL before results and jumps to block (R- |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V16-S04 | P0 | Отзыв доступа во время поиска блокирует чтение и экспорт | реализовано | per-request checks; GET /exports/:id/download re-checks every exported page; tests/integration/acl-gaps.test.ts: stored exports re-check access | tests/integration/acl-gaps.test.ts: stored exports re-check access at download (E-12, V16-S04, R-ACL-080, R-ACL-072) |

### PUBLISH

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V16-S05 | P0 | Черновик редактируется, опубликованная версия стабильна до публикации | реализовано | tests/integration/content.test.ts: readers see the published revision while the draft evolves (S05) | tests/integration/content.test.ts: readers see the published revision while the draft evolves; approval required when configu |
| V16-S06 | P1 | Внешняя публикация предупреждает о дочерних и вложениях, поддерживает отзыв | не реализовано | -; External publication (public links) not implemented. |  |

### PAGE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V16-S07 | P0 | Постоянные ссылки после rename/move; ссылка на закрытый блок не раскрывает содержание | реализовано | apps/server/src/routes/pages.ts#resolve, blocks.tsx#RefLabel |  |

### EXPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V16-S08 | P2 | Печать длинной статьи с таблицами, картинками, callout без обрезаний | требует ручной проверки | print CSS + PDF export; Visual check of long article printing |  |
| V16-S09 | P0 | Экспорт DOCX/MD/PDF/HTML с файлами, изображениями, отчётом потерь | реализовано | tests/integration/import-export.test.ts: DOCX/MD/PDF/HTML export; branch ZIP with assets and export-report.md | tests/integration/import-export.test.ts: exports a page to MD/DOCX/HTML/PDF; DOCX opens in LibreOffice; MD round-trips (R-EXPORT-00 |

### PAGE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V16-S10 | P0 | Дублирование ветки сохраняет структуру, не копирует недоступные вложения | реализовано | apps/server/src/services/pages.ts#duplicatePage; Исключение недоступных вложений не тестируется |  |

### HISTORY

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V16-S11 | P0 | Сравнение версий текста и свойств; восстановление не стирает историю | частично | apps/server/src/services/revisions.ts#diffDocs (текст), apps/server/src/routes/revisions.ts#restore; tests/integration/collab.test.ts; Сравнение свойств между версиями отсутствует (ревизия хранит только заголовок и содержимое) — по свойствам только журнал updated |  |

### COLLAB

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V16-S12 | P0 | Совместное редактирование и восстановление не теряют неподтверждённые правки | реализовано | tests/integration/collab.test.ts, tests/resilience/crash-restart.test.ts |  |

### ORG

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V16-S13 | P0 | Приглашение в отдел даёт нужные пространства и не открывает чужие | реализовано | tests/integration/acl.test.ts: new employee ... (A04, S13) | tests/integration/acl.test.ts: new employee of a department automatically gets its space (V15-A04, V16-S13, V15-A01, ACL- |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V16-S14 | P0 | Истечение гостевого доступа блокирует страницу, поиск, API, вложения | реализовано | users.access_expires_at blocks session/API/attachments (lookupSession); tests/integration/acl.test.ts: user access expiry blocks the account | tests/integration/acl.test.ts: user access expiry blocks the account (V16-S14) |

### ADMIN

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V16-S15 | P0 | Админ видит эффективные права с причиной и сроком без скрытого доступа к приватному | реализовано | admin «Доступ» section (AccessSection.tsx): check access + matrix; private titles shown as «(скрыто)», admin still gets 404 on the page; tests/integration/acl-p0.test.ts 'R-ADMIN-010 V16-S15: …'; tests/e2e/acl-p0-admin.spec.ts 'R-ADMIN-018 V16-S15: …' | tests/integration/acl.test.ts: explains why a user has access (ACL-161, V15-A09, V16-S15, R-ACL-078)<br>tests/integration/acl-p0.test.ts: effective access for administrators (R-ADMIN-010, V16-S15, R-ADMIN-018)<br>tests/integration/acl-p0.test.ts: R-ADMIN-010 V16-S15: users × spaces matrix shows level, source, expiry, conflicts and mana<br>… ещё 1 |
| V16-S16 | P1 | Массовая смена прав: подтверждение, лог, отчёт результата | частично | POST /api/v1/grants/bulk (preview/apply, per-grant audit); No UI; preview only echoes grants (no audience); no result report beyond count. |  |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V16-S17 | P1 | Мобильный и десктопный интерфейс без перекрытий названий, меню, фильтров | частично | tests/e2e/visual.spec.ts; overlaps not detected |  |

### PERF

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V16-S18 | P1 | Нагрузочные тесты поиска, импорта, экспорта, публикации с p95/p99 и ошибками | не реализовано | n/a; no load tests for search/import/export/publish |  |

### QA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V16-S19 | P1 | Визуальная регрессия меню, поиска, модалок, таблиц, админки в двух темах | частично | tests/e2e/visual.spec.ts; baselines only for sign-in and help dialog; menus, search, tables, admin, dark theme not baselined |  |

### BACKUP

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V16-S20 | P0 | Восстановление из бэкапа с проверкой ACL, ревизий, вложений, индекса | реализовано | tests/resilience/backup-restore.test.ts: ACL, revisions, attachments, search (restored index finds the page, outsider does not), audit chain | tests/resilience/backup-restore.test.ts: backup → restore drill (SC-30, AT-60, AT-87, V16-S20, OPS-011, QA26-18)<br>tests/resilience/backup-restore.test.ts: restores content, attachment bytes, history, permissions and the audit chain into a new in |

### PROCESS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PROCESS-041 | P2 | Сверка с Notion Help: search, duplicate/delete/restore, publish to web, groups, sharing and permissions | процесс/документ | n/a; reconciliation not done |  |
| R-PROCESS-042 | P0 | Приоритеты: 1) нет потери данных и нарушений доступа; 2) предсказуемое редактирование; 3) скорость; 4) простота и визуал; 5) широта | процесс/документ | n/a; no defect registry to prioritise |  |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-UI-049 | P1 | Не выносить функции на главный экран только потому, что реализованы; сложные настройки — в контекстном меню | требует ручной проверки | Home.tsx minimal blocks; needs review |  |
| R-UI-050 | P1 | Путь открыть → написать/вставить → структура → автосохранение → закрыть; без выбора типа страницы, формата, режима | реализовано | tests/e2e/editor.spec.ts create→type→"Сохранено" with no type/format/mode choice |  |

### PAGE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PAGE-025 | P1 | Новая статья одной командой «Создать» с фокусом в названии; дочерняя — «+» у родителя и команда из статьи | реализовано | apps/web/src/layout/Sidebar.tsx, apps/web/src/layout/SidebarTree.tsx, apps/web/src/editor/commands.tsx (subpage) |  |

### CLIPBOARD

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-CLIPBOARD-023 | P1 | Вставка DOCX/браузера/MD интерпретирует структуру; ненавязчивый результат и «Отменить»; без модалки при однозначной операции | частично | apps/web/src/editor/extensions/paste.ts SmartPaste; Ctrl+Z отменяет вставку; Нет уведомления с кнопкой «Отменить» после вставки |  |

### EDITOR

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-EDITOR-046 | P1 | Меню выделения, /, @, DnD, tooltips, единые горячие клавиши, курсор сохраняется после асинхронных операций | реализовано | Единые меню (components/ui/Menu.tsx), Tooltip; uploads.ts вставка по сопоставленной позиции; Без тестов |  |
| R-EDITOR-047 | P0 | Открытие страницы, смена ветки, сворачивание дерева не сбрасывают несохранённые правки и прокрутку без предупреждения | реализовано | hooks/useScrollRestore.ts (позиция по странице и при повторном открытии из дерева/ссылки; ссылка на блок по-прежнему ведёт к блоку); правки — CRDT + локальная реплика; tests/e2e/editor-p0-nav.spec.ts:'opening another page and coming back from the tree keeps the scroll position and the edits; collapsing the tree does not scroll (R-EDITOR-047)' | tests/e2e/editor-p0-nav.spec.ts: opening another page and coming back from the tree keeps the scroll position and the edits |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-UI-051 | P1 | Пустые состояния объясняют шаг; ошибки содержат действие восстановления; нет декоративных неработающих кнопок | частично | empty-state texts, PageError retry; no check that every button works |  |

### QA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-QA-028 | P1 | ≥90% новых сотрудников без обучения создают и оформляют статью; ≥95% находят существующую; 0 критических потерь в авариях | требует ручной проверки | n/a; usability metrics not collected |  |

### PUBLISH

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PUBLISH-010 | P1 | Владелец, ответственная группа, дата проверки, срок следующей, статус «проверено»/«требует пересмотра»; напоминания, фильтр устаревших … | частично | owner_id, review_due_at, verified_at/verified_by, Home needsReview; No responsible group, no reminders, no stale filter in search, not hidden for notes. |  |

### TEMPLATES

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-TEMPLATES-005 | P2 | Шаблоны «Регламент», «Инструкция», «FAQ», «Паспорт продукта», «Решение инцидента», свои; не блокируют свободное редактирование | реализовано | library.ts incident; POST /templates (свои); tests/integration/gaps.test.ts:'creates a template directly from ProseMirror JSON…' |  |

### PUBLISH

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PUBLISH-011 | P1 | Блокировка подтверждённых регламентов; обновления через черновик и согласование; опубликованная редакция неизменна | частично | pages.locked: only full-level users may edit (routes/pages.ts PATCH, hub canEdit); published revision immutable; No "update via draft + approval" for locked regulations — locked page simply blocks non-owners. |  |

### EDITOR

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-EDITOR-048 | P1 | Синхронизируемые блоки: каноническая версия, встраивания с проверкой прав; без доступа — заглушка без текста | реализовано | special.ts SyncedBlock; blocks.tsx SyncedBlockView (404 → «Нет доступа» без текста); Без тестов |  |

### PAGE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PAGE-026 | P1 | Обратные ссылки, проверка битых ссылок, обновление пути при перемещении, неизменные ID | частично | apps/server/src/routes/pages.ts backlinks, apps/server/src/jobs/worker.ts page_links; Отчёта о битых ссылках нет |  |

### ARCHIVE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ARCHIVE-003 | P0 | Корзина с восстановлением ветки и её прав; правила хранения и юридической блокировки по политике | реализовано | core.test.ts branch restore; history-tree.test.ts legal hold; worker retention |  |

### COLLAB

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-COLLAB-027 | P0 | PostgreSQL — источник истины; CRDT-обновления в долговечном журнале, согласованные снимки; Redis только кэш | реализовано | apps/server/src/collab/hub.ts, docs/DECISIONS.md D-01 (Redis не используется) |  |

### FILES

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-FILES-007 | P0 | Объектное хранилище с версионированием, SHA-256, проверкой целостности, защитой от удаления; все вложения, обложки … | реализовано | apps/server/src/services/integrity.ts verifyBlobs (ежечасно в jobs/worker.ts maintenance), migrations/0007_blob_integrity.sql, предупреждение в /api/v1/admin/health; tests/integration/files-integrity.test.ts:'R-FILES-007…'. Защита от удаления — object lock бакета (рекомендация) | tests/integration/files-integrity.test.ts: periodic integrity verification of stored files (R-FILES-007)<br>tests/integration/files-integrity.test.ts: R-FILES-007: a corrupted or missing stored file is detected, audited and shown to administ |

### COLLAB

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-COLLAB-028 | P0 | Идемпотентные создание/перенос/импорт, транзакции дерева и прав, outbox для индексации и уведомлений, повторы без дублей | реализовано | apps/server/src/services/pages.ts#createPage (requestId), outbox (apps/server/src/jobs/worker.ts), imports idempotencyKey; tests/integration/core.test.ts | tests/integration/core.test.ts: creates nested pages, idempotent by requestId (UX23-203, R-COLLAB-028) |

### OFFLINE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-OFFLINE-007 | P0 | Локальный журнал, статусы «локально»/«на сервере»/«ошибка»; восстановление после закрытия, обрыва, повторного входа … | реализовано | apps/web/src/sync/collab.ts (реплика и очередь ключуются userId:pageId:generation), apps/web/src/hooks/data.ts (кеш метаданных по пользователю), apps/web/src/layout/Sidebar.tsx (предупреждение при выходе); tests/e2e/collab-p0-offline.spec.ts (one browser, two accounts …), tests/integration/collab-p0.test.ts (session expires …) | tests/e2e/collab-p0-offline.spec.ts: one browser, two accounts: a user's unsent changes are never sent or shown under another a |

### OPS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-OPS-016 | P1 | Кластеризация приложений и WS-шлюзов, health checks, rolling deploy, graceful shutdown, rate limiting … | частично | Multi-instance via PostgreSQL journal + LISTEN/NOTIFY (bus reconnects), graceful shutdown (main.ts), rate limiting, readiness; tests/resilience/db-connection-loss.test.ts: cross-instance live updates resume; crash-restart.test.ts; Rolling deploy not tested end-to-end; no explicit overload shedding for import/OCR beyond queue concurrency | tests/resilience/db-connection-loss.test.ts: cross-instance live updates resume after the database returns (event bus reconnects) (SC-3 |
| R-OPS-017 | P1 | Наблюдаемость: задержки редактора, отказы sync, импорт, индекс, очереди, бэкапы, место; алерты с владельцем реакции | реализовано | deploy/monitoring/prometheus-alerts.yml: 32 rules, each with owner label + runbook link (checked by tests/integration/io-p0-ops.test.ts); grafana-dashboard.json; Disk signals rely on node_exporter |  |

### BACKUP

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-BACKUP-010 | P0 | Проектные SLO: доступность 99,9%/мес, RPO ≤5 мин, RTO ≤2 ч для полной организации; подтверждаются испытаниями | частично | see R-BACKUP-001; tests/resilience/pitr.test.ts; Test scale only | tests/resilience/pitr.test.ts: recovers database and files to the moment before the incident; later damage is absent, ear |
| R-BACKUP-011 | P0 | Непрерывный WAL и PITR PostgreSQL; ежедневные полные + инкрементальные; согласованные снимки файлов и метаданных | реализовано | scripts/backup/pitr-drill.sh + wal-archive.sh/wal-restore.sh; tests/resilience/pitr.test.ts: recovery to T with app data; backup.sh daily full + --objects-only | tests/resilience/pitr.test.ts: recovers database and files to the moment before the incident; later damage is absent, ear |
| R-BACKUP-012 | P0 | Правило 3-2-1: ≥3 копии, 2 среды, 1 вне контура; шифрование, отдельные ключи, неизменяемое хранение от ransomware | частично | compose profile offsite: aws s3 sync of backups + WAL into an Object Lock (COMPLIANCE) bucket, key without delete; BACKUP_ENCRYPT_CMD; The bucket/second medium must be provisioned by infrastructure; not run here |  |
| R-BACKUP-013 | P1 | Хранение: ежедневные 30 дней, еженедельные 12 недель, ежемесячные 12 месяцев (настраиваемо) | реализовано | backup.sh BACKUP_KEEP_DAILY=30/WEEKLY=12/MONTHLY=12 (+KEEP_LAST), pool GC; Retention logic verified manually, not by an automated test |  |
| R-BACKUP-014 | P0 | Ежедневная проверка и checksums; ежемесячное тестовое восстановление страниц/вложений … | процесс/документ | verify-backup.sh (weekly in kb-backup.service/backup-loop.sh), SHA256SUMS; Monthly/quarterly drill protocols must be run by operations |  |
| R-BACKUP-015 | P0 | Восстановление страницы, пространства, организации на точку времени; предпросмотр влияния; как новая версия/контур без затирания | реализовано | services/partial-restore.ts + cli restore-pages: page/space restore from a backup restored into a temporary DB — impact preview (per-page diff, missing files), apply as a new version (existing/trashed pages) or recreated page with files (purged pages), never overwriting; org level: restore.sh / PITR; tests/resilience/io-p0-partial-restore.test.ts: space restore from a backup restored into a temporary database… | tests/resilience/backup-restore.test.ts: restores content, attachment bytes, history, permissions and the audit chain into a new in<br>tests/resilience/io-p0-partial-restore.test.ts: partial restore from a backup (R-BACKUP-015)<br>tests/resilience/io-p0-partial-restore.test.ts: space restore from a backup restored into a temporary database: impact preview with per-pa |
| R-BACKUP-016 | P0 | Бэкапы защищены от скомпрометированного админа приложения: отдельные роли и учётные данные backup-оператора | реализовано | deploy/docker-compose.yml requires BACKUP_DATABASE_URL (no fallback to app role); separate kb_backup role (docs §3); app has no API to delete backups; offsite copy is WORM; Host administrators are out of scope |  |

### EXPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-EXPORT-023 | P0 | Два режима: пользовательский экспорт DOCX/MD/PDF/HTML/CSV/XLSX по правам; административный архив организации — отдельная … | реализовано | User exports (routes/import-export.ts, collection export) vs admin archive (routes/archives.ts, admin + password) |  |

### ARCHIVE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ARCHIVE-004 | P0 | Архив: манифест со схемой и версией, ID, дерево, свойства, опубликованные версии, история, комментарии, права, группы, вложения, связи … | реализовано | services/archive.ts manifest + metadata/*.json (tree, properties, versions, comments, permissions, groups, attachments, links); tests/integration/archive.test.ts: no secrets in users.json | tests/integration/archive.test.ts: export → readable without the app → restore into a clean installation → verified (V18-A05, |
| R-ARCHIVE-005 | P1 | ZIP/тома для больших объёмов с прогрессом, возобновлением, проверкой целостности; шифрование, временная ссылка, аудит скачивания | частично | archive-export job with progress, checksums.sha256, download audited, 72 h expiry (routes/archives.ts); No volumes, no resumable download, no archive encryption; archive built in memory |  |
| R-ARCHIVE-006 | P0 | Обратный импорт: dry-run, отчёт совместимости, конфликтов ID, отсутствующих файлов; новая организация или изолированный контур … | реализовано | services/archive.ts RestoreTarget: merge / new-space (isolated private space, fresh ids, space grants not applied) / into-space; target choice in the restore dialog; tests/integration/io-p0-export.test.ts: … restored into a NEW isolated space or merged into an existing space; tests/e2e/io-p0-roundtrip.spec.ts: archive restore dialog: the administrator chooses a new isolated space; A separate new organisation is not offered; the isolated contour is a new private space | tests/integration/archive.test.ts: export → readable without the app → restore into a clean installation → verified (V18-A05,<br>tests/integration/io-p0-export.test.ts: archive restore target and resumable upload (R-ARCHIVE-006, R-ARCHIVE-016, R-EXPORT-002)<br>tests/integration/io-p0-export.test.ts: archive uploaded through an interrupted, resumed upload session is restored into a NEW iso<br>… ещё 2 |
| R-ARCHIVE-007 | P0 | Полнота: после экспорта+импорта совпадают страницы, дерево, ссылки, ACL, версии, изображения, вложения по манифесту … | реализовано | tests/integration/archive.test.ts: verification.problems = [], text/tree/attachments/revisions/ACL compared | tests/integration/archive.test.ts: export → readable without the app → restore into a clean installation → verified (V18-A05, |

### EXPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-EXPORT-024 | P0 | Экспорт не обходит права; архив организации — административная процедура с двойным подтверждением | реализовано | tests/integration/archive.test.ts: wrong password → 403; confirm:true required; tests/integration/import-export.test.ts: export respects rights | tests/integration/archive.test.ts: export → readable without the app → restore into a clean installation → verified (V18-A05, |

### ADMIN

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ADMIN-013 | P1 | Панель «Здоровье системы»: сервисы, задержки, последний бэкап, последний тест восстановления, место, неуспешные задания, архивы | частично | GET /api/v1/admin/health + HealthSection: services, last backup, last restore verification, failed jobs, index lag; No latency metrics, no free disk space, archives not summarised. |  |
| R-ADMIN-014 | P1 | Вкладки: Сотрудники, Отделы, Группы, Пространства, Доступы, Публикации, Аудит, Резервирование, Импорт/экспорт … | частично | AdminPage tabs (users, groups, settings, audit, archives, health, expiring); No Spaces, Access, Publications, Import/Export tabs; no bulk operations with preview/report. |  |
| R-ADMIN-015 | P1 | Мастер приглашения: имя/email → роль → отделы → пространства → срок (гость) → подтверждение; затем эффективные права | частично | CreateUserDialog + result screen with effectiveSpaces; No spaces step in the wizard. |  |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ACL-048 | P0 | Доступы по умолчанию минимальные; отзыв сотрудника блокирует запросы, токены, ссылки; незавершённые синхронизации по политике | реализовано | deny by default (combine); suspend/deactivate revokes sessions, tokens, invitations; pending offline edits stay local and are rejected/exportable |  |

### CLIPBOARD

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V17-F01 | P0 | Вставка многостраничного документа с таблицами, изображениями, ссылками; Undo возвращает исходное | реализовано | extensions/paste.ts (вставка — один шаг Undo, вместе с изображениями); clipboard/html.ts; tests/e2e/editor-p0-clipboard.spec.ts:'a multi-page document with tables, images and links is pasted with its structure, and one Undo returns the page to its original state (V17-F01)'. Изображения из Word по file:// браузер не передаёт (см. SC-06) | tests/e2e/editor-p0-clipboard.spec.ts: a multi-page document with tables, images and links is pasted with its structure, and one  |

### PERF

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V17-F02 | P0 | 100 читателей и 20 редакторов; p95/p99; без потери подтверждённых изменений | реализовано | scripts/load/collab-load.mjs (100 readers + 20 editors, REST + WebSocket, seeded 5×200-block pages, 120 s); results in docs/PERFORMANCE.md and test-results/load/*.json — 1 527 acknowledged edits, 0 lost, 0 duplicated, p95/p99 reported; p95 sync ≈ 1.4 s exceeds the 500 ms SLO on a shared 4-vCPU container (tracked by R-PERF-006/R-PERF-015); not a CI test — run manually |  |

### OFFLINE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V17-F03 | P0 | Обрыв при вводе, закрытие браузера, восстановление сети — локальные изменения восстановлены, статус честный | реализовано | packages/shared/src/collab-client.ts, apps/web/src/sync/idb.ts; tests/integration/collab.test.ts (pending store); Восстановление при открытии с сетью; браузерного теста нет | tests/integration/collab.test.ts: unacknowledged changes survive a client restart via the pending store (AT-58, UX23-219, E- |

### COLLAB

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V17-F04 | P0 | Падение приложения, Redis и узла WebSocket — содержимое не теряется, повторы без дублей | реализовано | tests/resilience/crash-restart.test.ts (SIGKILL), tests/resilience/db-connection-loss.test.ts; Redis не используется; многоузловой отказ под нагрузкой не проверялся | tests/integration/collab.test.ts: server restart during a session loses no acknowledged change and resends the rest (OPS-009<br>tests/resilience/crash-restart.test.ts: server crash during editing (OPS-009, V17-F04, E-01) |

### BACKUP

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V17-F05 | P0 | PITR базы и файлов; проверка прав, версий, поиска, вложений, обратных ссылок | реализовано | tests/resilience/pitr.test.ts: PITR of DB + files; rights, content, attachments (sha256), audit, versions, search (incl. ACL) and backlinks verified after recovery (scratch cluster now UTF8 like production) | tests/resilience/pitr.test.ts: recovers database and files to the moment before the incident; later damage is absent, ear |

### ARCHIVE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V17-F06 | P0 | Полный экспорт → SHA-256 → импорт в чистый контур → сверка манифеста и выборочная ручная проверка | реализовано | tests/integration/archive.test.ts: checksums.sha256 verified, restore into clean installation, verification ok | tests/integration/archive.test.ts: export → readable without the app → restore into a clean installation → verified (V18-A05, |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V17-F07 | P0 | Сотрудник не может экспортировать закрытые страницы или получить их через индекс, CDN, OCR, ссылки, вложения | реализовано | tests/integration/import-export.test.ts: export respects rights ... private pages never leak into branch export (V17-F07); See V16-S04 for export-job download gap. | tests/integration/import-export.test.ts: export respects rights: no export permission => 403; private pages never leak into branch  |

### ARCHIVE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V17-F08 | P0 | Восстановление удалённой ветки без поломки ссылок и наследования прав | реализовано | tests/integration/core.test.ts (V17-F08) | tests/integration/core.test.ts: trash and restore a branch with children (D-05, SC-29, V17-F08, E-05, R-HISTORY-003, R-HIS |

### LAYOUT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V17-F09 | P1 | Макеты 320–1920 px без перекрытий, прыжков, горизонтального скролла, потерянных элементов | реализовано | tests/e2e/ui-p0-layout.spec.ts "R-UI-006, V17-F09: no overlapping, clipped or off-screen controls at 320–1920 px (light/dark)"; fixed onboarding hint covering the mobile drawer navigation | tests/e2e/ui-p0-layout.spec.ts: R-UI-006, V17-F09: no overlapping, clipped or off-screen controls at 320–1920 px (${theme} |

### QA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V17-F10 | P1 | Usability-тест новых сотрудников: создание, оформление, ссылка, поиск, совместная работа, экспорт, восстановление | требует ручной проверки | n/a; usability test not performed |  |

### OPS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-OPS-018 | P1 | Инструкции и автопроверки на контрольные вопросы: ночной инцидент, восстановимость бэкапа, переезд без поставщика … | частично | docs/OPERATIONS.md runbooks (night incident flow, DB down, disaster), docs/BACKUP_RESTORE.md (restorability proof), org archive for vendor-independent migration; No explicit Q&A section answering each control question |  |

### PROCESS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PROCESS-043 | P2 | Сверка с Notion Help: backup, export, wikis/verified pages, synced blocks, duplicate/restore, first page | процесс/документ | n/a; reconciliation not done |  |

### ARCHIVE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ARCHIVE-008 | P0 | Полный экспорт — ZIP с открытой структурой, читаемый файловыми менеджерами без приложения | реализовано | tests/integration/archive.test.ts: README.md, readable .md, relative links resolve | tests/integration/archive.test.ts: export → readable without the app → restore into a clean installation → verified (V18-A05, |
| R-ARCHIVE-009 | P0 | Каноническая переносимая форма — Markdown UTF-8 + оригиналы; DOCX опционально и не единственный формат восстановления … | реализовано | Archive pages as Markdown UTF-8 + original assets (services/archive.ts) |  |
| R-ARCHIVE-010 | P1 | Состав: README.md, spaces/…--page-id.md, assets/images, assets/files, databases/*.csv + schema.json, metadata/*.json, versions/ … | частично | README.md, spaces/<space>/<tree>.md, assets/, databases/*.csv, metadata/*.json, metadata/versions/; File names lack --page-id suffix; assets not split into images/files; versions under metadata/ |  |
| R-ARCHIVE-011 | P0 | Читаемые имена со стабильными ID против коллизий; относительные ссылки MD работают после распаковки; ID восстанавливают перекрёстные ссылки | реализовано | tests/integration/archive.test.ts: relative links resolve to existing files; ids kept in metadata/pages.json; Readable names without id suffix (collisions resolved by path dedupe) | tests/integration/archive.test.ts: export → readable without the app → restore into a clean installation → verified (V18-A05, |
| R-ARCHIVE-012 | P1 | README.md объясняет структуру, дату, объём, ограничения, порядок чтения и восстановления | реализовано | services/archive.ts readme(): structure, date, counts, limits, how to read/restore |  |
| R-ARCHIVE-013 | P0 | Страницы сохраняют заголовки, списки, таблицы, цитаты, изображения, подписи, callout (fallback), ссылки, файлы, метаданные … | реализовано | tests/integration/archive.test.ts: headings/tables in MD; exact JSON in metadata/content/ | tests/integration/archive.test.ts: export → readable without the app → restore into a clean installation → verified (V18-A05, |
| R-ARCHIVE-014 | P1 | Настройки: «Скачать архив организации», «Скачать пространство», «Скачать страницу», «Восстановить из архива» | частично | apps/web/src/admin/ArchivesSection.tsx (org archive download, restore); ExportDialog (page); No "download space" action in settings UI |  |
| R-ARCHIVE-015 | P1 | Опции экспорта: контент+вложения; +версии; +права/оргструктура; +журналы (уполномоченным); фоновая задача с прогрессом, повтором, checksums | реализовано | ArchiveOptions includeVersions/Acl/Comments/Audit, background job with progress, checksums |  |

### SECURITY

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-SECURITY-010 | P0 | Секреты, пароли, токены, ключи шифрования никогда не включаются; данные пользователей по законным основаниям | реализовано | archive users.json excludes password/MFA/tokens (services/archive.ts); tests/integration/archive.test.ts: no secrets | tests/integration/archive.test.ts: export → readable without the app → restore into a clean installation → verified (V18-A05, |

### ARCHIVE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ARCHIVE-016 | P0 | Импорт архива: zip-slip, zip bomb, вредоносные вложения, повреждения; манифест; dry-run; новая орг/пространство/объединение … | реализовано | readZipSafe (zip-slip, bomb), checksums, dry-run, antivirus (tests/integration/import-pipeline.test.ts); restore target new space / existing space / merge: tests/integration/io-p0-export.test.ts: … restored into a NEW isolated space or merged into an existing space; tests/e2e/io-p0-roundtrip.spec.ts: archive restore dialog…; Restore into a separate new organisation is not offered (new space instead) | tests/integration/archive.test.ts: export → readable without the app → restore into a clean installation → verified (V18-A05,<br>tests/integration/io-p0-export.test.ts: archive restore target and resumable upload (R-ARCHIVE-006, R-ARCHIVE-016, R-EXPORT-002)<br>tests/integration/io-p0-export.test.ts: archive uploaded through an interrupted, resumed upload session is restored into a NEW iso<br>… ещё 3 |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ACL-049 | P0 | Отсутствующие пользователи — «неразрешённые идентичности» с закрытым доступом до сопоставления | реализовано | archive restore creates unresolved users suspended (services/archive.ts); tests/integration/archive.test.ts | tests/integration/archive.test.ts: export → readable without the app → restore into a clean installation → verified (V18-A05, |

### ARCHIVE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ARCHIVE-017 | P0 | Приёмка: export → чтение без приложения → импорт в чистую установку → сверка страниц, блоков, файлов, таблиц, версий, ссылок, ACL … | процесс/документ | tests/integration/archive.test.ts automates the comparison; Quarterly protocol is operational |  |

### BACKUP

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-BACKUP-017 | P1 | Человекочитаемый архив не заменяет горячие бэкапы БД и журнала транзакций | реализовано | scripts/backup/* (pg_dump + WAL) independent of org archive; docs/BACKUP_RESTORE.md §1 |  |

### MEDIA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-MEDIA-009 | P0 | Вставка изображений Ctrl+V, DnD, диалог, URL с проверкой; мгновенное превью и прогресс | реализовано | Ctrl+V/DnD/диалог: extensions/uploads.ts (мгновенное превью и прогресс в блоке); ImageUrlDialog.tsx + POST /api/v1/attachments/from-url (apps/server/src/routes/attachments.ts, SSRF-защита remote-fetch.ts, проверка, что это изображение); tests/integration/editor-p0.test.ts:'R-MEDIA-009: the server copies an image from a URL…'; tests/e2e/editor-p0-media.spec.ts:'image by URL: dialog with preview…(R-MEDIA-009)', 'an image file dropped onto the page appears at once…(R-MEDIA-009)', 'pasted image: instant local preview…' | tests/integration/editor-p0.test.ts: image by URL (R-MEDIA-009)<br>tests/integration/editor-p0.test.ts: R-MEDIA-009: the server copies an image from a URL into an attachment of the page; non-ima<br>tests/e2e/editor-p0-media.spec.ts: image by URL: dialog with preview, internal addresses refused, the image is stored as an a<br>… ещё 1 |
| R-MEDIA-010 | P0 | Сохранять оригинал и производные версии; не заменять оригинал сжатыми | реализовано | apps/server/src/services/attachments.ts registerBlob/derivedKey; tests/integration/content.test.ts:'uploads an image, stores the original byte-exact with checksum…' | tests/integration/content.test.ts: uploads an image, stores the original byte-exact with checksum, creates previews (A10, R-M |
| R-MEDIA-011 | P1 | EXIF-ориентация, HEIC, безопасный SVG, прозрачность, GIF-анимация, понятные ошибки форматов | частично | apps/server/src/services/attachments.ts inspectFile (EXIF), sanitizeSvgFile, webp с альфой, corrupt_image; HEIC принимается, но не конвертируется (в Chromium не отобразится); фикстур форматов нет, кроме SVG (content.test.ts:'sanitises SVG…') | tests/integration/content.test.ts: sanitises SVG and serves user content in a sandbox (SC-12, SC-33, R-MEDIA-011) |
| R-MEDIA-012 | P1 | Resize ручками с сохранением пропорций, клавиатура, Undo | частично | apps/web/src/editor/nodeviews/ImageView.tsx startResize (ширина, высота по пропорции), Yjs undo; Нет изменения размера с клавиатуры; без теста |  |
| R-MEDIA-013 | P1 | Выравнивание лево/центр/право, ширины, подпись, alt, замена без потери подписи, полноэкранный просмотр, скачивание оригинала | реализовано | apps/web/src/editor/nodeviews/ImageView.tsx (align, presets, caption, alt, replace сохраняет caption, fullscreen, download); tests/e2e/content.spec.ts:'image: upload via file chooser, resize presets, caption, full-screen viewer with zoom' | tests/integration/content.test.ts: replacing a file creates a new version; old version restorable (R-FILES-003, R-MEDIA-013) |

### LAYOUT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-LAYOUT-009 | P1 | На узких экранах изображение в контейнере; резервирование места по aspect ratio без layout shift | частично | editor/nodeviews/ImageView.tsx aspectRatio + width/height + loading=lazy; CLS not measured; no narrow-screen image test |  |

### MEDIA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-MEDIA-014 | P1 | При перемещении блока изображения не теряются фокус, подписи, ссылки и история | реализовано | Атрибуты узла image переносятся с блоком; Без теста |  |

### FILES

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-FILES-008 | P1 | Вложение — карточка: иконка типа, название, размер, состояние, превью, скачать, заменить, переименовать, удалить, открыть; без обрезаний | частично | blocks.tsx FileView (иконка, имя, размер, предпросмотр, открыть, скачать); Нет заменить/переименовать/удалить в карточке; имя обрезается ellipsis |  |
| R-FILES-009 | P1 | PDF — безопасный просмотр; Office — предпросмотр при наличии сервиса, иначе скачивание | реализовано | apps/server/src/routes/attachments.ts sendObject CSP (PDF без sandbox, без скриптов); FileView iframe; Office — только скачивание (сервиса предпросмотра нет) |  |
| R-FILES-010 | P1 | Вложения перемещаются как блоки, выравниваются, группируются в колонки; клавиатура | частично | FileBlock draggable; Columns; Alt+Shift+↑/↓; Выравнивания вложений нет; без тестов |  |

### PAGE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PAGE-027 | P1 | Иконки и обложки страниц единообразны в дереве, поиске, заголовке; не меняют высоту строк | требует ручной проверки | apps/web/src/styles/layout.css; Иконки — визуальная проверка; обложек нет |  |

### EDITOR

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-EDITOR-049 | P0 | Блочный редактор: ручка, «+», slash, преобразование, множественное выделение, дублирование, перемещение, Undo/Redo, автосохранение … | реализовано | BlockHandle.tsx; commands.tsx; blockOps.ts (блочное выделение, перенос набора); moveToPage.ts; clipboard/*; tests/e2e/editor-p0-blocks.spec.ts, editor-p0-nav.spec.ts (E215), editor-p0-clipboard.spec.ts; tests/e2e/editor.spec.ts, undo.spec.ts, clipboard.spec.ts | tests/e2e/editor-p0-nav.spec.ts: blocks move to another page: removed here only after the target saved them, order, content<br>tests/e2e/editor-p0-blocks.spec.ts: moving blocks: one block by keyboard and block menu, several selected blocks together — or |

### A11Y

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-A11Y-007 | P1 | Панели не перекрывают текст; IME, экранные читалки, touch, zoom 200%; палитра с проверкой контраста | частично | mobile panels as sheets; real 200% zoom and axe audit in tests/e2e/a11y.spec.ts; IME, screen readers, real touch not available |  |

### QA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-QA-029 | P0 | Для каждого действия: исходное состояние, happy path, пусто, медленная сеть, офлайн, потеря прав, конфликт, квота, неверный файл … | не реализовано | n/a; no per-action condition matrix |  |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-UI-052 | P0 | Сообщение об ошибке отвечает: что случилось, сохранены ли данные, что делать, как повторить | реализовано | apps/web/src/api/client.ts explainError (what happened + "Изменение не сохранено" + what to do/retry + request code); tests/unit/ui-error-template.test.ts "R-UI-052: …"; tests/e2e/ui-p0-interaction.spec.ts "R-UI-009, R-UI-052: …"; validation (400), auth (401) and not-found (404) messages stay field/page-specific by design; client-only messages are hand-written per call site | tests/unit/ui-error-template.test.ts: error message template (R-UI-052, R-UI-009)<br>tests/unit/ui-error-template.test.ts: R-UI-052: server failure on a change says it was not saved, how to retry and gives the req<br>tests/unit/ui-error-template.test.ts: R-UI-052: missing rights explain what to do; reads do not talk about saving<br>… ещё 2 |
| R-UI-053 | P0 | Запрет тупиков: модалка без выхода, бесконечный spinner, недоступная кнопка без причины, потерянное выделение, исчезнувший блок | реализовано | tests/e2e/ui-p0-interaction.spec.ts "R-UI-053: a server that does not answer gives an explanation and a retry instead of an endless spinner" (App.tsx boot timeout 12 s, was unbounded), "R-UI-059, R-UI-053: dialogs trap focus, always have a visible exit and Esc, and return focus to the opener", "R-UI-053, R-UI-068: disabled actions always say why (view-only user)"; lost selection / disappearing block are covered by editor tests of other modules, not re-tested here | tests/e2e/ui-p0-interaction.spec.ts: R-UI-059, R-UI-053: dialogs trap focus, always have a visible exit and Esc, and return foc<br>tests/e2e/ui-p0-interaction.spec.ts: R-UI-053: a server that does not answer gives an explanation and a retry instead of an end<br>tests/e2e/ui-p0-interaction.spec.ts: R-UI-053, R-UI-068: disabled actions always say why (view-only user) |

### QA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-QA-030 | P1 | Реестр состояний каждого компонента: idle/hover/focus/loading/empty/success/error/offline/permission denied/conflict … | не реализовано | n/a; no component state registry |  |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-UI-054 | P2 | Не добавлять настройки при наличии безопасного значения по умолчанию | требует ручной проверки | n/a; settings review not done |  |

### PERF

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PERF-019 | P0 | Тяжёлые операции в фоне; ввод не блокируется OCR, загрузкой, экспортом | частично | OCR/import/export server jobs; uploads via XHR; typing during upload/OCR/export not measured |  |

### ARCHIVE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V18-A01 | P0 | Распакованный ZIP читается без приложения | реализовано | tests/integration/archive.test.ts | tests/integration/archive.test.ts: organisation archive round trip (F06, V18-A01, V18-A02, V18-A03, V18-A04, V18-A24, SC-38,  |
| V18-A02 | P0 | Относительные ссылки в архиве работают | реализовано | tests/integration/archive.test.ts: relative links resolve | tests/integration/archive.test.ts: organisation archive round trip (F06, V18-A01, V18-A02, V18-A03, V18-A04, V18-A24, SC-38,  |
| V18-A03 | P0 | Round-trip в чистую установку сохраняет ACL и вложенность | реализовано | tests/integration/archive.test.ts: ACL exception and parent preserved | tests/integration/archive.test.ts: organisation archive round trip (F06, V18-A01, V18-A02, V18-A03, V18-A04, V18-A24, SC-38,  |
| V18-A04 | P0 | Повреждённый архив не меняет текущие данные | реализовано | tests/integration/archive.test.ts: corrupted archive refused, commit 422 | tests/integration/archive.test.ts: organisation archive round trip (F06, V18-A01, V18-A02, V18-A03, V18-A04, V18-A24, SC-38,  |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V18-A05 | P0 | Отсутствующие пользователи не получают доступ | реализовано | tests/integration/archive.test.ts: unresolved identities status suspended | tests/integration/archive.test.ts: export → readable without the app → restore into a clean installation → verified (V18-A05, |

### EXPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V18-A06 | P0 | Экспорт при конкурентных правках даёт консистентный снимок | реализовано | services/archive.ts REPEATABLE READ snapshot; tests/integration/io-p0-export.test.ts: organisation archive taken during concurrent transactional changes and live editing is a consistent snapshot | tests/integration/io-p0-export.test.ts: consistent snapshot (V18-A06)<br>tests/integration/io-p0-export.test.ts: organisation archive taken during concurrent transactional changes and live editing is a c |

### MEDIA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V18-A07 | P1 | Фото из буфера сразу отображается и загружается | реализовано | apps/web/src/editor/extensions/uploads.ts objectURL-превью + загрузка; Без теста |  |
| V18-A08 | P1 | Resize не искажает изображение и поддерживает Undo | реализовано | apps/web/src/editor/nodeviews/ImageView.tsx resize по ширине (пропорции через aspect-ratio), Yjs undo; Без теста |  |

### LAYOUT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V18-A09 | P1 | Выравнивание изображения не ломается на телефоне | частично | image alignment CSS; untested at 375px |  |

### MEDIA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V18-A10 | P0 | Изображения сохраняют оригинал и подписи | реализовано | apps/server/src/services/attachments.ts; caption в узле; tests/integration/content.test.ts:'uploads an image, stores the original byte-exact with checksum…'; tests/e2e/content.spec.ts:'image: upload via file chooser, resize presets, caption, full-screen viewer with zoom' | tests/integration/content.test.ts: uploads an image, stores the original byte-exact with checksum, creates previews (A10, R-M |

### FILES

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V18-A11 | P1 | Вложение перетаскивается и копируется | реализовано | FileBlock draggable; PM copy; Без теста |  |

### TREE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V18-A12 | P1 | Обложки и иконки выровнены в дереве | требует ручной проверки | apps/web/src/styles/layout.css (.tree-icon); Обложек нет; выравнивание иконок — визуальная проверка |  |

### CLIPBOARD

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V18-A13 | P0 | Вставка сложного Word-документа не теряет текст | реализовано | apps/web/src/editor/clipboard/html.ts; tests/e2e/clipboard.spec.ts:'Word paste…' (текст всех абзацев, списков и таблицы сохранён) |  |
| V18-A14 | P1 | Вставка Excel создаёт редактируемую таблицу | реализовано | apps/web/src/editor/extensions/paste.ts SmartPaste TSV → table; tests/e2e/collab.spec.ts:'paste: spreadsheet range becomes a table; Markdown becomes formatted blocks' |  |

### PERF

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V18-A15 | P1 | Медленная сеть не тормозит набор | частично | local-first editing (Yjs + pending store); no slow-network typing measurement |  |

### FILES

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V18-A16 | P1 | Ошибка загрузки предлагает повтор | реализовано | apps/web/src/editor/extensions/uploads.ts кнопка «Повторить»; Без теста |  |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V18-A17 | P0 | С отозванным доступом вложение по старой ссылке не выдаётся | реализовано | tests/integration/content.test.ts: revocation invalidates signed links (A17) | tests/integration/content.test.ts: files of a private page are not accessible by direct link; revocation invalidates signed l |

### A11Y

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V18-A18 | P1 | 200% zoom без наложений | реализовано | tests/e2e/ui-p0-layout.spec.ts "V18-A18, AT-81: real 200 % zoom (DPR 2, 640×400 CSS px) — no overlaps or clipped controls" | tests/e2e/ui-p0-layout.spec.ts: V18-A18, AT-81: real 200 % zoom (DPR 2, 640×400 CSS px) — no overlaps or clipped controls<br>tests/e2e/a11y.spec.ts: real 200% browser zoom (1280x800 at 2x = 640x400 CSS px) keeps every key screen usable (AT |
| V18-A19 | P1 | Все основные действия доступны с клавиатуры | частично | keyboard handlers across shell/tree/editor; no keyboard pass test |  |

### OFFLINE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V18-A20 | P0 | После перезапуска неподтверждённые локальные правки восстанавливаются | реализовано | packages/shared/src/collab-client.ts#restorePending; tests/integration/collab.test.ts | tests/integration/collab.test.ts: unacknowledged changes survive a client restart via the pending store (AT-58, UX23-219, E- |

### ARCHIVE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V18-A21 | P1 | Экспорт-импорт сохраняет читаемые callout fallback | реализовано | tests/integration/import-export.test.ts: exported MD contains [!WARNING] callout; archive uses same MD writer | tests/integration/import-export.test.ts: exports a page to MD/DOCX/HTML/PDF; DOCX opens in LibreOffice; MD round-trips (R-EXPORT-00 |

### IMPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V18-A22 | P1 | Повторный импорт предлагает стратегию конфликтов | частично | Tabular upsert/append into existing collection (dry-run); Documents: no conflict strategy on re-import (new copies created) |  |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V18-A23 | P1 | Длительная операция имеет отмену или объясняет её невозможность | частично | ImportPage cancel; uploads abort (lib/uploads.ts); integration AT-72; export/OCR cancel or explanation not verified in UI |  |

### ARCHIVE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V18-A24 | P0 | Архив проверен контрольными суммами | реализовано | tests/integration/archive.test.ts: checksums.sha256 verified like sha256sum -c | tests/integration/archive.test.ts: organisation archive round trip (F06, V18-A01, V18-A02, V18-A03, V18-A04, V18-A24, SC-38,  |

### BACKUP

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| V18-A25 | P0 | Восстановление прошло тест на независимом сервере | частично | tests/resilience/backup-restore.test.ts restores into a new database + directory and starts a separate server; Same PostgreSQL host, not an independent server | tests/resilience/backup-restore.test.ts: restores content, attachment bytes, history, permissions and the audit chain into a new in |

### PROCESS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PROCESS-044 | P0 | Релиз запрещён при потере содержимого, ошибке доступа, повреждении архива, невосстанавливаемой копии, блокировке ввода … | реализовано | scripts/release-gate.py blocks release while any P0 requirement is open; the gate is generic over P0 status, not a per-condition check |  |

### PERF

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PERF-020 | P1 | Целевые задержки и надёжность v1.7 сохраняются; приоритеты: сохранность, понятность, скорость, эстетика, расширенные функции | частично | v1.7 targets referenced by tests (typing <50 ms); most targets unmeasured |  |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-UI-055 | P0 | Визуальный эталон — утверждённые светлые UX-примеры; запрещены произвольные стили по разделам; общие design tokens, контраст … | частично | apps/web/src/styles/* use tokens; some hard-coded colours (#9cc0f5 toast, #000 embed) and inline styles (HistoryPanel fontSize 22) |  |
| R-UI-056 | P1 | Стартовые токены: фон #F8F9FB, поверхность #FFFFFF, вторичная #F3F5F7, текст #24272D, вторичный #68717D, граница #E5E8ED … | реализовано | tokens.css matches #F8F9FB/#FFFFFF/#F3F5F7/#24272D/#68717D/#E5E8ED |  |

### TREE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-TREE-018 | P1 | Настраиваемый sidebar: недавние, избранное, пространства команд, общие, личные; скрыть, переставить, сброс … | частично | apps/web/src/state/ui.ts#toggleSection/resetSidebar; Можно сворачивать секции и сбросить; нет скрытия/перестановки секций и админ-предустановки отдела; хранится только в localStorage |  |

### PAGE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PAGE-028 | P1 | Вложенная страница из трёх мест: «+» в дереве, команда в статье, [[ или + с выбором «создать вложенную»/«ссылка» … | реализовано | apps/web/src/layout/SidebarTree.tsx «+», commands.tsx subpage, suggest.tsx «[[» |  |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-UI-057 | P1 | Cmd/Ctrl+K, Cmd/Ctrl+F, назад/вперёд, ссылка на статью/блок; всё доступно мышью | реализовано | AppShell Ctrl+K; editor/extensions/find.ts Mod-f; ?block= links (tests/e2e/collab.spec.ts search jump); sidebar buttons for mouse |  |

### EDITOR

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-EDITOR-050 | P1 | «+» в левом поле, ручка ⋮⋮ (перетаскивание/действия), /, вставка MD, преобразование, дублирование, перенос на другую страницу, undo/redo | частично | apps/web/src/editor/menus/BlockHandle.tsx; apps/web/src/editor/extensions/blockOps.ts; apps/web/src/editor/extensions/paste.ts SmartPaste (MD); Нет «перенести на другую страницу» |  |
| R-EDITOR-051 | P1 | Раскрывающиеся заголовки; содержание справа для длинной статьи; переход к заголовку без перекрытия шапкой; длинные заголовки | частично | Details level (toggle heading CSS); TocView; Нет UI раскрывающегося заголовка, нет оглавления справа, нет scroll-margin под шапку |  |

### PAGE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PAGE-029 | P2 | Иконки и обложки: библиотека/эмодзи, поиск, удаление/замена, отображение в дереве, ссылках, поиске, карточках | частично | apps/web/src/components/IconPicker.tsx; Обложек нет, только emoji |  |
| R-PAGE-030 | P1 | Peek-предпросмотр в боковой панели/модальном слое при наличии места; «открыть полностью», «закрыть», Esc, back … | не реализовано | Peek-предпросмотра нет |  |
| R-PAGE-031 | P0 | Ссылки на статьи/блоки: автообновление заголовка, статус недоступного/удалённого адресата, вставка как ссылка/упоминание/карточка … | реализовано | blocks.tsx#RefLabel/PageLinkView/PageMentionView, apps/web/src/lib/pageRefs.ts; Заголовок обновляется при повторном resolve (staleTime 60 с), не мгновенно |  |

### COMMENTS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-COMMENTS-003 | P1 | Комментарии к выделению, упоминания, уведомления без спама; выделение и курсор сохраняются после закрытия панели | частично | mentions notify only people with access (tests/integration/content.test.ts); tests/e2e/content.spec.ts comment on a selection; Preservation of selection/cursor after closing the panel not verified; spam control is basic (participants only). |  |

### TEMPLATES

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-TEMPLATES-006 | P1 | Старт с чистой страницы — основной путь; шаблон — подсказка, не обязательный мастер | реализовано | treeActions.createPage без шаблона; SpacePage «Из шаблона» опционально |  |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-UI-058 | P1 | Без hover на touch: доступные кнопки и меню, безопасные размеры касания; клавиатура не перекрывает редактор | частично | @media (pointer: coarse) 44 px targets, floating "+" (tests/e2e/ui-p0-touch.spec.ts); no visualViewport handling for the on-screen keyboard | tests/e2e/ui-p0-touch.spec.ts: UX-146, R-UI-058: on a touch phone the floating "+" inserts a block without hover |
| R-UI-059 | P0 | Popover/tooltip/menu/drawer/dialog: anchor, границы viewport, fallback-сторона, max-height, скролл, z-index, focus trap, возврат фокуса … | реализовано | tests/e2e/ui-p0-interaction.spec.ts "R-UI-059, R-UI-008, E224: menus at viewport edges flip/shift inside the window, keep keyboard focus, close with Esc or outside click and return focus" (+ tooltip at the right edge) and dialog focus-trap test; fixed: focus returned to <body> after a dialog opened from a menu item (Dialog.tsx now returns it to the menu trigger); drawer/sheet positioning covered by ui-p0-layout overlap checks | tests/e2e/ui-p0-interaction.spec.ts: R-UI-059, R-UI-008, E224: menus at viewport edges flip/shift inside the window, keep keybo<br>tests/e2e/ui-p0-interaction.spec.ts: R-UI-059, R-UI-053: dialogs trap focus, always have a visible exit and Esc, and return foc |
| R-UI-060 | P0 | Hover не выполняет действий; click/Enter/Space выполняют; hover-меню не мерцают; у hover-действий есть видимый/клавиатурный эквивалент | реализовано | tests/e2e/ui-p0-interaction.spec.ts "R-UI-060, UX-141: hovering controls performs no action; hover-only tree actions have a keyboard equivalent" (hover over ~70 controls: URL, dialogs, menus, tree and content unchanged; Shift+F10/Menu key opens tree row actions — added in SidebarTree.tsx) | tests/e2e/ui-p0-interaction.spec.ts: R-UI-060, UX-141: hovering controls performs no action; hover-only tree actions have a key |

### TREE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-TREE-019 | P0 | Стрелка — expanded, название — открыть, ⋯ — меню; hit areas не перекрываются; сохранение expanded/scroll/selection … | реализовано | apps/web/src/layout/SidebarTree.tsx + apps/web/src/layout/treeState.ts#useTreeScrollMemory (прокрутка в localStorage), expanded в apps/web/src/state/ui.ts; нет автотеста |  |
| R-TREE-020 | P1 | DnD дерева с индикаторами before/inside/after, проверкой прав и undo; клавиатурная навигация | реализовано | apps/web/src/layout/SidebarTree.tsx, apps/web/src/layout/treeActions.tsx |  |
| R-TREE-021 | P1 | Дочерние страницы в sidebar и в теле родителя на одной модели данных | частично | apps/web/src/editor/nodeviews/blocks.tsx#PageLinkView (child), apps/server/src/services/tree.ts; Дочерние в теле родителя — отдельные узлы pageLink, не синхронизированы с деревом (созданная в дереве не появляется в теле) |  |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-UI-061 | P0 | Для каждой операции документировать: пусто, успех, загрузка, отмена, ошибка, нет прав, потеря сети, конфликт, назад, перезагрузка … | не реализовано | n/a; no per-operation state documentation (no TEST_MATRIX/UX_ACCEPTANCE) |  |
| R-UI-062 | P0 | Нельзя создавать страницу «в никуда», терять черновик, закрывать диалог с критичными данными без предупреждения, прятать возврат | частично | tests/e2e/ui-p0-interaction.spec.ts "R-UI-062: a new page is never created "nowhere" and a draft survives an immediate reload" (breadcrumbs + tree entry; reload without waiting keeps the text); warning before closing a dialog with critical unsaved input is not tested | tests/e2e/ui-p0-interaction.spec.ts: R-UI-062: a new page is never created "nowhere" and a draft survives an immediate reload |

### COLLAB

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-COLLAB-029 | P0 | Статусы «Сохраняется», «Сохранено», «Нет подключения», «Требуется действие»; без утверждения сохранения до подтверждения сервера | реализовано | apps/web/src/components/page/SyncStatus.tsx, packages/shared/src/collab-client.ts | tests/integration/collab.test.ts: "saved" is reported only after the update is committed to the journal (E-13, D-10, R-COLLA |

### TREE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX-121 | P1 | Создать вложенную страницу из дерева | реализовано | tests/e2e/content.spec.ts (sidebar tree) | tests/e2e/content.spec.ts: sidebar tree: "+" creates a child page under the selected parent with focus in the title ( |

### PAGE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX-122 | P1 | Создать вложенную страницу из текста [[ | реализовано | apps/web/src/editor/extensions/suggest.tsx#pageLinkExtension; нет автотеста |  |
| UX-123 | P1 | Создать ссылку на существующую страницу | реализовано | apps/web/src/editor/PagePicker.tsx, suggest.tsx; нет автотеста |  |
| UX-124 | P0 | Переименовать связанную страницу — ссылка обновилась | реализовано | apps/web/src/lib/pageRefs.ts; Обновление по истечении кеша 60 с; нет автотеста |  |
| UX-125 | P1 | Удалить связанную страницу — корректный статус ссылки | реализовано | blocks.tsx#RefLabel («(удалена)»); нет автотеста |  |

### TREE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX-126 | P0 | Переместить страницу с дочерними — ссылки и права проверены | реализовано | apps/server/src/services/pages.ts#movePage, tests/integration/acl.test.ts (moving changes audience) | tests/integration/acl.test.ts: moving a private page to an open space requires confirmation and shows who gains access; u |

### PAGE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX-127 | P1 | Открыть в предпросмотре и закрыть Esc | не реализовано | Peek-предпросмотра нет |  |
| UX-128 | P1 | Открыть страницу полностью из предпросмотра | не реализовано | Peek-предпросмотра нет |  |

### TREE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX-129 | P1 | Сохранить sidebar-предпочтения | реализовано | apps/web/src/state/ui.ts; нет автотеста |  |
| UX-130 | P1 | Восстановить sidebar по умолчанию | реализовано | apps/web/src/state/ui.ts#resetSidebar, apps/web/src/layout/Sidebar.tsx; нет автотеста |  |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX-131 | P1 | Переход назад сохраняет scroll | реализовано | tests/e2e/ui-p0-touch.spec.ts "UX-131: Back restores the reading position of a long page" (±50 px; a new navigation starts at the top) | tests/e2e/ui-p0-touch.spec.ts: UX-131: Back restores the reading position of a long page |

### SEARCH

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX-132 | P1 | Быстрый поиск Cmd/Ctrl+K | реализовано | apps/web/src/layout/QuickSwitcher.tsx, apps/web/src/layout/AppShell.tsx |  |
| UX-133 | P1 | Поиск внутри статьи | реализовано | apps/web/src/editor/extensions/find.ts, apps/web/src/editor/Editor.tsx#FindBar; нет автотеста |  |

### PAGE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX-134 | P1 | Ссылка на заголовок и блок | реализовано | BlockHandle.tsx, apps/web/src/editor/Editor.tsx scrollToBlock; нет автотеста |  |

### EDITOR

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX-135 | P1 | Раскрытие toggle heading | частично | Details + CSS data-level; Toggle раскрывается; создать раскрывающийся заголовок из UI нельзя |  |

### A11Y

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX-136 | P1 | Клавиатурное перемещение по дереву | реализовано | tests/e2e/a11y.spec.ts "keyboard only: quick switcher, help, dialogs close with Esc and return focus (UX-136, SC-34)" (tree ArrowUp/ArrowDown/Enter) | tests/e2e/a11y.spec.ts: keyboard only: quick switcher, help, dialogs close with Esc and return focus (UX-136, SC-3 |

### EDITOR

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX-137 | P1 | Перетаскивание блока с корректным drop indicator | реализовано | Dropcursor color accent; Без теста |  |

### HISTORY

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX-138 | P0 | Отмена ошибочного перемещения | реализовано | apps/web/src/editor/clientExtensions.ts (Tiptap Collaboration → y-tiptap yUndoPlugin, own origin only; undoRedo disabled in packages/shared/src/editor/extensions.ts) (moveBlock + Mod-z); tests/e2e/undo.spec.ts | tests/e2e/undo.spec.ts: undo of a block move and of a block deletion is precise (UX-138, E2E-118, QA26-14) |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX-139 | P1 | Меню у нижнего края — flip вверх | частично | Menu flip middleware; untested |  |
| UX-140 | P1 | Меню у правого края — без выхода за экран | частично | Menu shift middleware; untested |  |
| UX-141 | P0 | Hover не вызывает случайного клика | реализовано | tests/e2e/ui-p0-interaction.spec.ts "R-UI-060, UX-141: hovering controls performs no action…" | tests/e2e/ui-p0-interaction.spec.ts: R-UI-060, UX-141: hovering controls performs no action; hover-only tree actions have a key |

### EDITOR

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX-142 | P0 | Курсор и выделение не теряются при открытии меню | реализовано | Menu/BubbleToolbar onMouseDown preventDefault; Без теста |  |

### TEMPLATES

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX-143 | P2 | Создать статью из шаблона | реализовано | TemplatesPage → createPage(templateId); tests/integration/gaps.test.ts:'creates a template directly from ProseMirror JSON and uses it for new pages' |  |

### PAGE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX-144 | P1 | Создать пустую статью без шаблона | реализовано | tests/e2e/editor.spec.ts | tests/e2e/editor.spec.ts: create page, type with Markdown shortcuts, "Сохранено" only after server ack, survives rel |
| UX-145 | P2 | Выбрать и заменить иконку | реализовано | apps/web/src/components/IconPicker.tsx; нет автотеста |  |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX-146 | P1 | Мобильное добавление блока без hover | реализовано | tests/e2e/ui-p0-touch.spec.ts "UX-146, R-UI-058: on a touch phone the floating "+" inserts a block without hover" (fixed: onboarding hint covered the "+") | tests/e2e/ui-p0-touch.spec.ts: UX-146, R-UI-058: on a touch phone the floating "+" inserts a block without hover |

### A11Y

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX-147 | P1 | Масштаб 200% | реализовано | tests/e2e/a11y.spec.ts "real 200% browser zoom … (AT-81, UX-147, V18-A18)" on 5 screens | tests/e2e/a11y.spec.ts: real 200% browser zoom (1280x800 at 2x = 640x400 CSS px) keeps every key screen usable (AT |

### TREE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX-148 | P1 | Ошибка загрузки ветки — retry без потери контекста | реализовано | apps/web/src/layout/SidebarTree.tsx (error row + retry); нет автотеста |  |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX-149 | P0 | Нет доступа к дочерней статье — без утечки заголовка | реализовано | visibleChildren/hasChildren filtered, breadcrumbs "…"; tests/integration/acl.test.ts: no leak through "has children" marker | tests/integration/acl.test.ts: restricted child page is not accessible through parent rights (ACL-160, R-ACL-034, E2E-104 |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX-150 | P1 | Сценарий новичка «найти → прочесть → создать → вложить → поделиться → вернуться» без подсказок | требует ручной проверки | n/a; novice scenario test not performed |  |
| R-UI-063 | P1 | Каждая основная функция за 2–3 осмысленных действия из естественного контекста (кроме админ-операций); мышь, клавиатура, касание | требует ручной проверки | n/a; action counting not done |  |

### QA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-QA-031 | P1 | Тесты с новыми пользователями разных отделов: успешность, ошибки, время, подсказки, субъективная нагрузка | требует ручной проверки | n/a; tests with new users not performed |  |

### PROCESS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PROCESS-045 | P0 | P0-блокеры: потеря данных, утечка прав, тупик, меню не открывается/закрывается, перекрытие контента, непредсказуемая навигация … | процесс/документ | n/a; no blocker registry; known blockers e.g. UX-131, contrast |  |
| R-PROCESS-046 | P2 | UX-ориентир по Notion Help (sidebar, editing, shortcuts, columns/headings, styling); документация не свидетельство реализации | процесс/документ | n/a; reconciliation not done |  |

### EDITOR

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-EDITOR-052 | P0 | v2.0 — статус P0, применяется совместно с ранее определёнными; все команды мышью и клавиатурой, критические — touch | частично | Клавиатура: BlockOps (Esc, Shift+↑/↓, Alt+Shift+стрелки, Ctrl+A), меню; мышь: всё; touch: «+» (TouchInsertButton); Touch: нет DnD/ручки блока; resize изображения без клавиатуры (только пресеты 25–100 % мышью/касанием) |  |
| R-EDITOR-053 | P0 | Блочный редактор с выделением и копированием как в текстовом процессоре; согласованы курсор, выделение, IME, автосохранение, Undo/Redo … | реализовано | Tiptap+Yjs; StableSelection; Undo только своих правок; tests/e2e/editor-p0-core.spec.ts:'IME composition… (E221, R-EDITOR-021, R-EDITOR-053)', 'caret and selection stay in place…'; tests/e2e/undo.spec.ts | tests/e2e/editor-p0-core.spec.ts: IME composition commits once, coexists with a colleague typing and autosave, and undo reve |
| R-EDITOR-054 | P1 | Три способа команд: палитра при выделении, /-меню, ⋮⋮-меню и «+»; без дублирования постоянно видимых панелей | реализовано | apps/web/src/editor/menus/BubbleToolbar.tsx; apps/web/src/editor/commands.tsx SLASH_COMMANDS; apps/web/src/editor/menus/BlockHandle.tsx |  |
| R-EDITOR-055 | P1 | Hover — только неопасные кнопки; палитра у выделения с flip вверх/вниз, в пределах viewport, не закрывает текст, без скачков | реализовано | apps/web/src/editor/menus/BubbleToolbar.tsx BUBBLE_OPTIONS flip/shift; hover-ручка без опасных действий |  |
| R-EDITOR-056 | P0 | Выделение сохраняется при палитре, color picker, списке шрифтов, диалоге ссылки; фокус возвращается; Esc закрывает верхний слой … | реализовано | apps/web/src/editor/menus/BubbleToolbar.tsx (linkMode, Esc возвращает фокус); Menu; Без тестов |  |
| R-EDITOR-057 | P1 | Состояния normal/hover/focus/selected/mixed-format/loading/disabled/error/success/readonly/offline/conflict/collaboration … | частично | SyncStatus, readonly, error-баннер FatalBanner; Нет mixed-format состояния в панели (isActive=false при смешанном) |  |
| R-EDITOR-058 | P1 | Панель: стиль абзаца (текст/H1/H2/H3/цитата), шрифт, размер, B/I/U/S, code, ссылка, цвет, фон, «Ещё» без горизонтального переполнения | реализовано | apps/web/src/editor/menus/BubbleToolbar.tsx (тип блока, B/I/U/S, code, ссылка, цвет/фон, «Ещё»: размер/шрифт) |  |
| R-EDITOR-059 | P1 | Палитра: 10–12 цветов текста и 10–12 подложек, «без цвета», последние; предпросмотр при hover без фиксации; цвет и фон независимы … | частично | apps/web/src/editor/palette.ts (10+10), «По умолчанию»/«Без фона»; Нет «последних» цветов и предпросмотра при hover |  |
| R-EDITOR-060 | P2 | Шрифты: 3 пресета (sans, serif, mono) и управляемый список корпоративных с fallback и кириллицей; предпросмотр, поиск … | частично | packages/shared/src/editor/extensions.ts FONT_FAMILIES; apps/web/src/editor/menus/BubbleToolbar.tsx «Шрифт»; Нет управляемого списка корпоративных шрифтов, предпросмотра и поиска |  |
| R-EDITOR-061 | P2 | Размер: H1–H3 предпочтительнее; ручная шкала 12/14/16/18/20/24/28/32 со сбросом; вставка сохраняет структуру и интервал | реализовано | packages/shared/src/editor/extensions.ts FONT_SIZES 12–32; «По умолчанию» |  |
| R-EDITOR-062 | P2 | Выравнивание влево/центр/вправо; по ширине только при подтверждённом качестве; отдельные правила для изображений и файлов | реализовано | TextAlign; ImageView align; Выравнивание по ширине доступно без условий |  |
| R-EDITOR-063 | P1 | Ссылки: Ctrl/Cmd+K, вставка URL поверх выделения → «Сделать ссылкой», правка/снятие, предпросмотр и проверка URL, внутренние ссылки … | частично | apps/web/src/editor/extensions/blockOps.ts Mod-k; apps/web/src/editor/menus/BubbleToolbar.tsx applyLink/sanitizeHref; apps/web/src/editor/extensions/paste.ts SmartPaste URL поверх выделения; Нет предпросмотра ссылки (hover card); без тестов |  |
| R-EDITOR-064 | P0 | Списки (маркированный, нумерованный, чек-лист, многоуровневый), toggle, цитата, callout, код, разделитель, таблица, вложенная страница … | реализовано | apps/web/src/editor/commands.tsx SLASH_COMMANDS; tests/e2e/editor.spec.ts:'slash menu inserts a table and a callout; "> " creates a toggle' |  |
| R-EDITOR-065 | P0 | Enter — следующий пункт; Enter на пустом — выход; Tab/Shift+Tab — вложенность; Backspace в начале — объединение/смена типа по правилу | реализовано | Правила в справке (help/HelpCenter.tsx, группа «Клавиши в тексте и списках»); extensions/blockOps.ts resetTypeAtStart (Backspace в начале заголовка/цитаты → абзац, затем объединение); tests/e2e/editor-p0-core.spec.ts:'key matrix: Enter, Enter on empty item, Tab/Shift+Tab, Backspace at the start and on empty blocks behave by the documented rules (R-EDITOR-065, R-EDITOR-034, E208)' | tests/e2e/editor-p0-core.spec.ts: key matrix: Enter, Enter on empty item, Tab/Shift+Tab, Backspace at the start and on empty |
| R-EDITOR-066 | P1 | Нумерация пересчитывается при вставке/удалении/переносе/объединении; «начать с N», «продолжить»; чекбокс только по клику/Space | частично | OrderedList (нумерация пересчитывается), TaskItem; Нет UI «начать с N»/«продолжить» |  |
| R-EDITOR-067 | P0 | Преобразование блоков не теряет содержимое, вложенность, комментарии, ссылки, ID; несовместимые объясняются заранее | реализовано | apps/web/src/editor/convert.ts convertToCodeBlock (упоминания/формулы → текст, подтверждение при потере форматирования); id блока сохраняется; tests/unit/editor-convert.test.ts; tests/e2e/clipboard.spec.ts:'converting formatted text to a code block…' | tests/unit/editor-convert.test.ts: block conversion keeps content (R-EDITOR-003, R-EDITOR-067, AT-64)<br>tests/unit/editor-convert.test.ts: R-EDITOR-067: converting to code keeps mentions/formulas as text and asks before removing <br>tests/unit/editor-convert.test.ts: R-EDITOR-067: declining the confirmation leaves formatted text unchanged<br>… ещё 1 |
| R-EDITOR-068 | P0 | Выделение слова/строки/фрагмента, через блоки, блока, нескольких блоков; Shift+стрелки, Ctrl/Cmd+A (блок → статья), Esc (текст → блок) … | реализовано | extensions/blockOps.ts: Ctrl/Cmd+A блок → статья (selectAllStepwise), Esc → блок, Shift+↑/↓ расширяет выделение целыми блоками (blockRangeKey), Backspace/Delete удаляют блоки, Alt+Shift+↑/↓ переносит набор; tests/e2e/editor-p0-blocks.spec.ts:'selection modes: word, paragraph, Shift+arrows, across blocks, Ctrl+A block → article, Esc → block, several blocks (R-EDITOR-068, E201)' | tests/e2e/editor-p0-blocks.spec.ts: selection modes: word, paragraph, Shift+arrows, across blocks, Ctrl+A block → article, Esc |

### CLIPBOARD

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-CLIPBOARD-024 | P0 | Copy/Cut/Paste между статьями сохраняет стили, вложенность, таблицы, ссылки, изображения по правам; во внешние — text/html и text/plain … | частично | clipboard/html.ts stripTracking/isTrackingImage (utm_*, fbclid, gclid, yclid…, пиксели счётчиков); portable HTML; Ctrl+Shift+V; Трекеры удаляются: tests/unit/editor-p0-clipboard.test.ts:'tracker cleanup in pasted HTML (R-CLIPBOARD-024)', tests/e2e/editor-p0-clipboard.spec.ts:'paste options… (R-CLIPBOARD-009, R-CLIPBOARD-024)'. Открыто: права на вложения при переносе между статьями — см. R-CLIPBOARD-018 | tests/unit/editor-p0-clipboard.test.ts: tracker cleanup in pasted HTML (R-CLIPBOARD-024)<br>tests/unit/editor-p0-clipboard.test.ts: R-CLIPBOARD-024: removes utm_*/fbclid/gclid/yclid parameters, keeps others and the fragmen<br>tests/unit/editor-p0-clipboard.test.ts: R-CLIPBOARD-024: tracking pixels and analytics counters are dropped from pasted HTML, link<br>… ещё 1 |
| R-CLIPBOARD-025 | P1 | Вставка Excel/CSV распознаёт таблицу, многострочные ячейки и табуляцию; большие файлы с прогрессом, отменой, повтором без блокировки набора | частично | json.ts parseTsv (кавычки, многострочные ячейки), looksLikeTsv; Больших вставок с прогрессом/отменой нет (синхронно) |  |

### EDITOR

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-EDITOR-069 | P0 | Drag handle ⋮⋮ предсказуем; порог начала; линия до/после/внутрь; автопрокрутка, вложенность, колонки, Ctrl/Alt-копирование, клавиатура … | частично | @tiptap/extension-drag-handle-react 3.32; Dropcursor; Нет копирования Ctrl/Alt-перетаскиванием, нет «внутрь», нет запрета недопустимых целей; без тестов |  |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ACL-050 | P0 | Копирование/перемещение между пространствами проверяет права, наследование, вложения; предупреждение до опасного перемещения | реализовано | move: create right + audience preview; duplicate into another location: audience diff + 409 audience_change unless confirmAudienceChange; tests/integration/acl-gaps.test.ts; Web UI only duplicates in place (no cross-space copy dialog yet). | tests/integration/acl-gaps.test.ts: copy into another space asks to confirm the audience (R-ACL-050) |

### EDITOR

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-EDITOR-070 | P1 | Горячие клавиши Ctrl/Cmd: B, I, U, K, Z, Shift+Z/Ctrl+Y, C/X/V, Shift+V, F, P, Shift+M (комментарий) | реализовано | StarterKit marks; apps/web/src/editor/extensions/blockOps.ts Mod-k/Mod-Shift-m; find.ts Mod-f; apps/web/src/editor/extensions/paste.ts SmartPaste Mod-Shift-v; Collaboration undo; Mod+P — системная печать; без тестов |  |
| R-EDITOR-071 | P1 | Markdown-автозамены: #/##/###, -/*/+, 1., [], > (toggle), ---, **жирный**, *курсив*, `code` | реализовано | StarterKit input rules; TaskItem; apps/web/src/editor/extensions/blockOps.ts "> "; tests/e2e/editor.spec.ts:'create page, type with Markdown shortcuts, …survives reload'; tests/e2e/editor.spec.ts:'slash menu inserts a table and a callout; "> " creates a toggle' |  |
| R-EDITOR-072 | P1 | /-меню: поиск, синонимы RU/EN, недавние, стрелки, Enter, Esc; не перехватывает ввод в коде, URL, IME, при экранировании | частично | suggest.tsx allow(): не в коде, не после непробела; Нет недавних; IME/экранирование не проверены |  |

### HELP

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-HELP-002 | P2 | Справочник клавиш с поиском, Windows/macOS, конфликтами браузера, раскладками RU/EN, screen readers; не обещать неперехватываемые сочетания | частично | HelpCenter SHORTCUTS with search, Mod -> Ctrl/⌘ per OS (Tooltip formatShortcut); No browser-conflict, RU/EN layout or screen-reader notes. |  |

### EXPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-EXPORT-025 | P0 | Форматирование атомарно, обратимо, переживает перезагрузку, экспортируется в MD/DOCX/HTML без скрытой потери … | реализовано | tests/integration/io-p0-import.test.ts: inline formatting (bold, italic, underline, strike, code, sub/sup, highlight, colour, links) survives DOCX export → import and is present in HTML export; MD round trip property test (tests/unit/markdown.test.ts) | tests/integration/io-p0-import.test.ts: formatting through DOCX and HTML (R-EXPORT-012, R-EXPORT-025)<br>tests/integration/io-p0-import.test.ts: inline formatting (bold, italic, underline, strike, code, sub/sup, highlight, colour, link |

### OFFLINE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-OFFLINE-008 | P0 | При обрыве ввод локально со статусом; конфликт не затирает чужие правки; детерминированный reconnect; сохранение после фактической записи | реализовано | packages/shared/src/collab-client.ts, tests/integration/collab.test.ts | tests/integration/collab.test.ts: offline edits are kept locally and synchronised after reconnect, concurrent with others (S |

### QA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-QA-032 | P0 | Матрица: Chrome/Edge/Firefox/Safari, Windows/macOS, клавиатура/мышь/touch, 100–200% zoom, 320–1920 px, RU/EN, IME, дикторы … | частично | tests/e2e/visual.spec.ts 320–1920 + zoom; Chromium/Linux, RU only; Edge/Firefox/Safari, Windows/macOS, touch, EN, IME, screen readers absent (env) |  |

### EDITOR

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| E201 | P0 | E2E: выделение через блоки | реализовано | Нативное выделение через блоки + блочное выделение (blockOps.ts); tests/e2e/editor-p0-blocks.spec.ts:'selection modes… (R-EDITOR-068, E201)' | tests/e2e/editor-p0-blocks.spec.ts: selection modes: word, paragraph, Shift+arrows, across blocks, Ctrl+A block → article, Esc |
| E202 | P0 | E2E: форматирование и сохранение selection | реализовано | Tiptap marks; BubbleToolbar (onMouseDown preventDefault — выделение не теряется); tests/e2e/editor-p0-blocks.spec.ts:'formatting keeps the selection: bold, italic and toolbar underline apply to the same range (E202)' | tests/e2e/editor-p0-blocks.spec.ts: formatting keeps the selection: bold, italic and toolbar underline apply to the same range |
| E203 | P2 | E2E: смена шрифта/размера | частично | apps/web/src/editor/menus/BubbleToolbar.tsx «Ещё» → Размер/Шрифт; E2E нет |  |
| E204 | P1 | E2E: смешанные стили | частично | apps/web/src/editor/menus/BubbleToolbar.tsx; Mixed-состояния нет; E2E нет |  |
| E205 | P1 | E2E: применение/сброс цвета | частично | apps/web/src/editor/menus/BubbleToolbar.tsx цвет/«По умолчанию»; E2E нет |  |
| E206 | P1 | E2E: URL поверх выделения | частично | apps/web/src/editor/extensions/paste.ts SmartPaste; E2E нет |  |
| E207 | P1 | E2E: редактирование ссылки | частично | apps/web/src/editor/menus/BubbleToolbar.tsx linkMode; E2E нет |  |
| E208 | P0 | E2E: списки и вложенность | реализовано | Tiptap ListItem/TaskItem (Tab/Shift+Tab, Enter на пустом пункте); tests/e2e/editor-p0-core.spec.ts:'key matrix… (R-EDITOR-065, R-EDITOR-034, E208)' — вложенность 2 уровня, выход из вложенного и из списка | tests/e2e/editor-p0-core.spec.ts: key matrix: Enter, Enter on empty item, Tab/Shift+Tab, Backspace at the start and on empty |

### CLIPBOARD

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| E209 | P0 | E2E: вставка Word | реализовано | apps/web/src/editor/clipboard/html.ts; apps/web/src/editor/extensions/paste.ts SmartPaste; tests/e2e/clipboard.spec.ts:'Word paste keeps headings, nested and numbered lists…' | tests/e2e/clipboard.spec.ts: Word paste keeps headings, nested and numbered lists, links and tables without Office styl |
| E210 | P0 | E2E: вставка веб HTML | реализовано | apps/web/src/editor/clipboard/html.ts; apps/web/src/editor/extensions/paste.ts SmartPaste pasteHTML + startUploads; tests/e2e/clipboard.spec.ts:'web HTML paste: scripts removed, embedded image uploaded…' | tests/e2e/clipboard.spec.ts: web HTML paste: scripts removed, embedded image uploaded as an attachment (E210, SC-06, R- |
| E211 | P1 | E2E: вставка Excel | реализовано | apps/web/src/editor/extensions/paste.ts SmartPaste; tests/e2e/collab.spec.ts:'paste: spreadsheet range becomes a table; Markdown becomes formatted blocks' |  |
| E212 | P1 | E2E: вставка без форматирования | частично | apps/web/src/editor/extensions/paste.ts SmartPaste Ctrl+Shift+V; E2E нет |  |

### EDITOR

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| E213 | P0 | E2E: перенос блока | реализовано | blockOps.ts moveBlock (Alt+Shift+↑/↓), BlockHandle «Переместить вверх/вниз»; tests/e2e/editor-p0-blocks.spec.ts:'moving blocks: one block by keyboard and block menu, several selected blocks together — order and ids kept (E213, UX21-186)' | tests/e2e/editor-p0-blocks.spec.ts: moving blocks: one block by keyboard and block menu, several selected blocks together — or |

### LAYOUT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| E214 | P1 | E2E: перенос между колонками | не реализовано | n/a; no E2E for moving between columns |  |

### EDITOR

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| E215 | P0 | E2E: перенос между страницами | реализовано | apps/web/src/editor/moveToPage.ts (через канал целевой страницы; исходные блоки удаляются только после ACK сервера), BlockHandle «Переместить на страницу…»; tests/e2e/editor-p0-nav.spec.ts:'blocks move to another page: removed here only after the target saved them, order, content and ids kept (E215, R-EDITOR-076)' | tests/e2e/editor-p0-nav.spec.ts: blocks move to another page: removed here only after the target saved them, order, content |

### HISTORY

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| E216 | P0 | E2E: отмена переноса | реализовано | apps/web/src/layout/treeActions.tsx (кнопка «Отменить»); tests/integration/core.test.ts; Только интеграционный тест API, браузерного E2E нет | tests/integration/core.test.ts: moves keep ids, ancestors closure is consistent, order respected, undo restores (R-TREE-00 |

### MEDIA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| E217 | P1 | E2E: вставка изображения | реализовано | apps/web/src/editor/extensions/uploads.ts; apps/web/src/editor/nodeviews/ImageView.tsx; tests/e2e/content.spec.ts:'image: upload via file chooser, resize presets, caption, full-screen viewer with zoom' |  |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| E218 | P0 | E2E: конфликт прав | реализовано | tests/integration/collab.test.ts permissions in live sessions; tests/e2e/collab.spec.ts revoking edit makes it read-only |  |

### COLLAB

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| E219 | P0 | E2E: одновременное редактирование | реализовано | tests/e2e/collab.spec.ts (two people edit the same page) | tests/e2e/collab.spec.ts: two people edit the same page: changes converge, presence is shown, revoking edit makes it |

### OFFLINE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| E220 | P0 | E2E: offline/reconnect | реализовано | tests/e2e/editor.spec.ts (offline edits are kept locally) | tests/e2e/editor.spec.ts: offline edits are kept locally and delivered after reconnect (E220, AT-57) |

### EDITOR

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| E221 | P0 | E2E: IME | реализовано | ProseMirror composition handling; tests/e2e/editor-p0-core.spec.ts:'IME composition commits once, coexists with a colleague typing and autosave, and undo reverts only own input (E221, R-EDITOR-021, R-EDITOR-053)' (CDP Input.imeSetComposition, японский и кириллический ввод) | tests/e2e/editor-p0-core.spec.ts: IME composition commits once, coexists with a colleague typing and autosave, and undo reve |
| E222 | P1 | E2E: Safari/Firefox selection | ограничение окружения | docs/DECISIONS.md D-18 (только Chromium); Нужны Firefox/Safari раннеры |  |

### A11Y

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| E223 | P1 | E2E: клавиатура без мыши | частично | tests/e2e/editor.spec.ts slash menu by keyboard; no keyboard-only E2E |  |
| E224 | P1 | E2E: доступность меню | реализовано | tests/e2e/ui-p0-interaction.spec.ts "R-UI-059, R-UI-008, E224: …" (role=menu/menuitem, keyboard focus, focus return) | tests/e2e/ui-p0-interaction.spec.ts: R-UI-059, R-UI-008, E224: menus at viewport edges flip/shift inside the window, keep keybo |

### EXPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| E225 | P0 | E2E: MD/DOCX round-trip | реализовано | tests/e2e/io-p0-roundtrip.spec.ts: DOCX import → edit in the editor → DOCX and Markdown export from the page menu…; Markdown file import → edit → Markdown export round trip | tests/integration/import-export.test.ts: exports a page to MD/DOCX/HTML/PDF; DOCX opens in LibreOffice; MD round-trips (R-EXPORT-00<br>tests/e2e/io-p0-roundtrip.spec.ts: DOCX import → edit in the editor → DOCX and Markdown export from the page menu keep the st<br>tests/e2e/io-p0-roundtrip.spec.ts: Markdown file import → edit → Markdown export round trip (E225, R-EXPORT-012) |

### EDITOR

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-EDITOR-073 | P0 | Блокирующие: потеря текста/курсора/выделения, самопроизвольное форматирование, дубли блоков, некорректное Undo … | требует ручной проверки | Набор E2E/интеграционных тестов; Требует QA-прогона по списку блокирующих дефектов |  |

### PERF

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PERF-021 | P1 | Палитра после выделения p95 ≤100 мс; форматирование p95 ≤50 мс; ввод p95 ≤50 мс; без layout shift при hover | частично | tests/e2e/collab.spec.ts "typing latency on a long document stays within budget": 400 paragraphs (~5k words), 40 samples, execCommand insertText -> next rAF, no CPU/network throttling; last run p95≈31 ms; palette/formatting latency and hover layout shift not measured |  |

### A11Y

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-A11Y-008 | P1 | Достаточные области попадания и подсказки, touch ≥44×44 CSS px; reduced-motion; контраст AA; видимый focus ring | реализовано | tests/e2e/ui-p0-touch.spec.ts "R-A11Y-008: touch targets on a phone are at least 44×44 CSS px" (fixed: nav items 32 px, section buttons, tree chevrons, icon-only buttons; tree virtual rows now 44 px on touch); axe contrast audit tests/e2e/a11y.spec.ts | tests/e2e/ui-p0-touch.spec.ts: R-A11Y-008: touch targets on a phone are at least 44×44 CSS px |

### QA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-QA-033 | P0 | Не принимать по скриншотам: ручное UX-тестирование с сотрудниками, браузерные автотесты, тесты потери сети, обратимый экспорт | частично | browser autotests; network-loss tests; MD round-trip (import-export.test.ts); manual UX testing with employees not done |  |

### MEDIA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-MEDIA-015 | P1 | Клик по изображению (не в режиме resize) открывает lightbox; «На весь экран» на весь viewport или Fullscreen API | реализовано | apps/web/src/editor/nodeviews/ImageView.tsx onClick (чтение — один клик; редактирование — клик по выделенному); tests/e2e/clipboard.spec.ts:'image viewer…' | tests/e2e/clipboard.spec.ts: image viewer: click on a selected image opens it; zoom is limited to 10–800 % (R-MEDIA-015 |
| R-MEDIA-016 | P1 | Zoom 25–800%, +/−, 100%, «Вписать», «Оригинал», колесо, двойной щелчок, pinch, pan; центрирование по точке курсора/жеста | заменено | overridden_by R-MEDIA-021 |  |
| R-MEDIA-017 | P1 | Esc закрывает; стрелки — соседние изображения; скачивание оригинала по ACL; просмотр не меняет размер в документе | реализовано | apps/web/src/components/ImageViewer.tsx (Esc, ←/→, download по ACL); tests/e2e/content.spec.ts:'image: upload via file chooser, resize presets, caption, full-screen viewer with zoom' (Esc) |  |
| R-MEDIA-018 | P1 | Ограничение выхода за границы, без прокрутки страницы под просмотрщиком; EXIF, загрузка оригинала по требованию, большие схемы … | реализовано | apps/web/src/components/ImageViewer.tsx clampView (без выхода за границы), body overflow hidden, тайлы; Повёрнутое изображение не ограничивается |  |

### EDITOR

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-EDITOR-074 | P1 | Единый DnD: «+» и ⋮⋮ на hover без сдвига контента; на touch — долгое нажатие или меню «Переместить» | частично | apps/web/src/editor/menus/BlockHandle.tsx (absolute, без сдвига); На touch нет долгого нажатия/меню «Переместить» (ручка только hover) |  |
| R-EDITOR-075 | P0 | Drag preview, линия вставки, подсветка колонки/контейнера, автопрокрутка, недопустимые цели; отпускание — одна атомарная операция | частично | DragHandle (preview), Dropcursor (линия), одна PM-транзакция; Нет подсветки колонки/контейнера и недопустимых целей |  |
| R-EDITOR-076 | P0 | Перемещение нескольких блоков, между колонками и страницами (изображения, таблицы, вложенные) с сохранением порядка, ссылок и ID | частично | blockOps.ts moveBlockRange (набор блоков), moveToPage.ts (между страницами, id и порядок сохраняются); tests/e2e/editor-p0-nav.spec.ts:'blocks move to another page… (E215, R-EDITOR-076)'; editor-p0-blocks.spec.ts (набор блоков). Нет теста перетаскивания между колонками; вложения изображений при переносе остаются привязаны к исходной странице (R-CLIPBOARD-018) | tests/e2e/editor-p0-nav.spec.ts: blocks move to another page: removed here only after the target saved them, order, content |

### TREE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-TREE-022 | P0 | Дерево: перенос между родителями, смена уровня, раскрытие по задержке, прокрутка, «Переместить в…» с поиском, защита от циклов, права … | реализовано | apps/server/src/services/pages.ts, apps/web/src/layout/SidebarTree.tsx, apps/web/src/components/MoveDialog.tsx; tests/integration/core.test.ts | tests/integration/core.test.ts: concurrent opposite moves never create a cycle (COLLAB-194, UX23-218, R-TREE-022) |

### HISTORY

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-HISTORY-016 | P0 | Ошибочный перенос отменяется Ctrl/Cmd+Z или «Отменить» в уведомлении | реализовано | apps/web/src/layout/treeActions.tsx#movePage (toast «Отменить») | tests/integration/core.test.ts: moves keep ids, ancestors closure is consistent, order respected, undo restores (R-TREE-00 |

### HELP

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-HELP-003 | P1 | Tooltip каждой иконки с названием и сочетанием, с задержкой на hover и при фокусе; не перекрывает; меняет сторону у краёв | требует ручной проверки | components/ui/Tooltip.tsx (floating-ui: hover delay 450ms, focus, flip/shift, shortcut kbd); Coverage of every icon button not verified. |  |
| R-HELP-004 | P2 | Одноразовые ненавязчивые подсказки новичкам на ключевых действиях с «Понятно»/«Не показывать»; факт прохождения сохраняется … | реализовано | help/Onboarding.tsx OnboardingHints with "Понятно"/"Не показывать", seenHints persisted (localStorage); Persisted per browser only. |  |
| R-HELP-005 | P2 | Центр помощи: поиск по действиям, GIF/видео/схемы, интерактивные примеры; «?» и F1 | частично | HelpCenter dialog with search, opened by "?" and F1 (AppShell.tsx); No GIF/video/diagrams or interactive examples. |  |
| R-HELP-006 | P1 | Пустые состояния содержат контекстные инструкции; reduced-motion и доступность в подсказках | требует ручной проверки | empty states with instructions (32 empty-state usages), prefers-reduced-motion CSS (tokens.css, panels.css, admin.css); Quality needs human review. |  |

### HISTORY

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-HISTORY-017 | P0 | Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y по платформе; атомарные операции: ввод, формат, вставка, удаление, перенос, resize, преобразование … | частично | apps/web/src/editor/clientExtensions.ts; tests/e2e/undo.spec.ts, tests/e2e/collab-p0-editing.spec.ts (sequences: преобразование в заголовок, удаление); Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y: ввод, формат, вставка, удаление, перенос, преобразование отменяются (тесты); отмена изменения размера (resize изображения/колонки) не тестируется | tests/e2e/collab-p0-editing.spec.ts: undo/redo sequences of 100 and 1000 steps, transform and delete are reversible; history do<br>tests/e2e/undo.spec.ts: undo/redo of typing: 1 and 10 steps, Ctrl+Shift+Z and Ctrl+Y; result is saved (QA26-14, UX<br>tests/e2e/undo.spec.ts: undo/redo of formatting keeps the text and the selection (QA26-14, SC-11, R-HISTORY-011, R<br>… ещё 1 |
| R-HISTORY-018 | P1 | Группировка непрерывного набора без склейки несвязанных действий | реализовано | apps/web/src/editor/clientExtensions.ts (Tiptap Collaboration → y-tiptap yUndoPlugin, own origin only; undoRedo disabled in packages/shared/src/editor/extensions.ts); tests/e2e/undo.spec.ts (10 шагов) | tests/e2e/undo.spec.ts: undo/redo of typing: 1 and 10 steps, Ctrl+Shift+Z and Ctrl+Y; result is saved (QA26-14, UX |
| R-HISTORY-019 | P1 | Меню истории у кнопок отмены: время, тип, объект, автор; переход к состоянию с предпросмотром и подтверждением при массовом откате | не реализовано | Меню истории операций с предпросмотром нет |  |
| R-HISTORY-020 | P0 | Undo/redo не путать с версионной историей (снимки, diff, автор, время, восстановление как новая ревизия) | реализовано | apps/web/src/components/page/HistoryPanel.tsx, apps/web/src/help/HelpCenter.tsx |  |
| R-HISTORY-021 | P0 | В коллаборации undo отменяет только свои операции; конфликты без потерь | реализовано | apps/web/src/editor/clientExtensions.ts (Tiptap Collaboration → y-tiptap yUndoPlugin, own origin only; undoRedo disabled in packages/shared/src/editor/extensions.ts); tests/e2e/undo.spec.ts | tests/e2e/undo.spec.ts: undo reverts only the user's own changes, never a colleague's (SC-27, UX21-200, R-HISTORY- |
| R-HISTORY-022 | P1 | После перезагрузки граница undo-истории обозначена; история документа доступна; без ложных обещаний отката необратимого | не реализовано | Граница undo-истории после перезагрузки не обозначается |  |

### TEMPLATES

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-TEMPLATES-007 | P2 | Библиотека ≥30 шаблонов с миниатюрой, назначением, предпросмотром, «Использовать» (SOP, регламент, FAQ, онбординг, ADR, ТЗ, postmortem … | частично | library.ts 35 шаблонов; TemplatesPage PreviewDialog, «Использовать»; Миниатюр нет — только эмодзи-иконка |  |
| R-TEMPLATES-008 | P2 | Шаблоны из реальных редактируемых блоков: списки, таблицы, 2–4 колонки, картинки, вложения, callout, toggle, ссылки, TOC | реализовано | templates/dsl.ts (списки, таблицы, колонки, изображения, callout, toggle, toc) |  |
| R-TEMPLATES-009 | P1 | Создание из шаблона не меняет оригинал | реализовано | services/pages.ts createPage копирует content шаблона; Нет явной проверки неизменности оригинала в tests/integration/gaps.test.ts |  |
| R-TEMPLATES-010 | P2 | Избранные и корпоративные шаблоны с версиями и правами | реализовано | apps/server/src/routes/templates.ts favorite, template_versions, права (space manage / org admin); tests/integration/gaps.test.ts:'validates content…' (403 участнику) |  |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-UI-064 | P1 | Hover 100–160 мс; drag без инерционного промаха; структура 120–220 мс; не анимировать ввод, курсор, сохранение; reduced-motion | частично | motion tokens; no animation on typing; drag inertia/hover timing untested |  |

### LAYOUT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-LAYOUT-010 | P1 | Контроль 320–1920 px, touch, мышь, клавиатура, 200%, длинные названия, 4 колонки, вложенные таблицы; без наложений, page-скролла … | частично | tests/e2e/visual.spec.ts; 4 columns, nested tables, long names, touch not covered |  |

### MEDIA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX21-176 | P1 | Изображение открывается в полноэкранном просмотре | реализовано | apps/web/src/components/ImageViewer.tsx; tests/e2e/content.spec.ts:'image: upload via file chooser, resize presets, caption, full-screen viewer with zoom' |  |
| UX21-177 | P1 | Масштаб по курсору | реализовано | apps/web/src/components/ImageViewer.tsx zoomAt; Без теста |  |
| UX21-178 | P1 | Pinch на телефоне | ограничение окружения | apps/web/src/components/ImageViewer.tsx pinch по pointer events; Нужен реальный телефон |  |
| UX21-179 | P1 | Pan увеличенного изображения | реализовано | apps/web/src/components/ImageViewer.tsx drag-pan; Без теста |  |
| UX21-180 | P1 | Esc/закрытие возвращает прежний scroll | реализовано | apps/web/src/components/ImageViewer.tsx восстанавливает фокус; прокрутка страницы не меняется; Без теста |  |
| UX21-181 | P1 | Загрузка огромной схемы | реализовано | apps/server/src/services/attachments.ts makeTiles; apps/web/src/components/ImageViewer.tsx tileEls; tests/integration/content.test.ts:'large images get a deep-zoom tile pyramid (UX21-181, UX22-186)' | tests/integration/content.test.ts: large images get a deep-zoom tile pyramid (UX21-181, UX22-186) |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX21-182 | P0 | Предпросмотр без прав скачивания | реализовано | loadAttachment download vs inline view; tests/integration/content.test.ts: respects download policy (A15) | tests/integration/content.test.ts: respects download policy: viewers can see the page but cannot download when forbidden (A15 |

### EDITOR

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX21-183 | P1 | Hover ручки без layout shift | реализовано | apps/web/src/editor/menus/BlockHandle.tsx (floating, absolute); CLS не измерялся |  |
| UX21-184 | P0 | Перенос блока внутри страницы | реализовано | DragHandle; Alt+Shift+↑/↓; Без теста |  |

### LAYOUT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX21-185 | P1 | Перенос изображения в другую колонку | не реализовано | n/a; no evidence/test of moving an image into another column |  |

### EDITOR

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX21-186 | P0 | Перенос набора блоков | реализовано | blockOps.ts moveBlockRange (набор блоков, выделенных Esc + Shift+↑/↓); tests/e2e/editor-p0-blocks.spec.ts:'moving blocks… (E213, UX21-186)' | tests/e2e/editor-p0-blocks.spec.ts: moving blocks: one block by keyboard and block menu, several selected blocks together — or |

### HISTORY

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX21-187 | P0 | Отмена переноса | реализовано | apps/web/src/layout/treeActions.tsx undo; tests/integration/core.test.ts (undo restores position) | tests/integration/core.test.ts: moves keep ids, ancestors closure is consistent, order respected, undo restores (R-TREE-00 |

### TREE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX21-188 | P0 | Перенос статьи в другое пространство | реализовано | apps/server/src/services/pages.ts#movePage, tests/integration/acl.test.ts | tests/integration/acl.test.ts: moving a private page to an open space requires confirmation and shows who gains access; u |
| UX21-189 | P0 | Запрет циклического переноса | реализовано | tests/integration/core.test.ts (prevents moving into descendant) | tests/integration/core.test.ts: prevents moving a page into its own descendant (E2E-099, UX23-208, UX21-189) |

### EDITOR

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX21-190 | P1 | Drag при медленной сети | реализовано | DnD — локальная CRDT-операция, очередь в IndexedDB; Без теста на медленной сети |  |
| UX21-191 | P1 | Drag на touch | не реализовано | HTML5 DnD DragHandle; Перетаскивание на touch не поддерживается |  |

### A11Y

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX21-192 | P1 | Перемещение клавиатурой | частично | blockOps.ts Alt-Shift-ArrowUp/Down; untested |  |

### HELP

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX21-193 | P1 | Tooltip у правого края | реализовано | Tooltip flip/shift middleware keeps tooltip in viewport; No visual test. |  |
| UX21-194 | P1 | Подсказка при keyboard focus | реализовано | Tooltip useFocus(visibleOnly) shows on keyboard focus; No test. |  |
| UX21-195 | P2 | Отключение подсказок | реализовано | HelpCenter checkbox + hint "Не показывать подсказки" (hintsDisabled) |  |

### HISTORY

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX21-196 | P0 | Undo ввода | реализовано | apps/web/src/editor/clientExtensions.ts (Tiptap Collaboration → y-tiptap yUndoPlugin, own origin only; undoRedo disabled in packages/shared/src/editor/extensions.ts); tests/e2e/undo.spec.ts | tests/e2e/undo.spec.ts: undo/redo of typing: 1 and 10 steps, Ctrl+Shift+Z and Ctrl+Y; result is saved (QA26-14, UX |
| UX21-197 | P1 | Undo resize | реализовано | apps/web/src/editor/clientExtensions.ts (Tiptap Collaboration → y-tiptap yUndoPlugin, own origin only; undoRedo disabled in packages/shared/src/editor/extensions.ts); нет автотеста |  |
| UX21-198 | P0 | Redo после undo | реализовано | apps/web/src/editor/clientExtensions.ts (Tiptap Collaboration → y-tiptap yUndoPlugin, own origin only; undoRedo disabled in packages/shared/src/editor/extensions.ts); tests/e2e/undo.spec.ts; После повтора курсор возвращается к началу повторённого изменения | tests/e2e/undo.spec.ts: undo/redo of typing: 1 and 10 steps, Ctrl+Shift+Z and Ctrl+Y; result is saved (QA26-14, UX |
| UX21-199 | P1 | Меню истории действий | не реализовано | Меню истории действий у кнопок отмены нет |  |
| UX21-200 | P0 | Совместная работа и undo только своих операций | реализовано | apps/web/src/editor/clientExtensions.ts (Tiptap Collaboration → y-tiptap yUndoPlugin, own origin only; undoRedo disabled in packages/shared/src/editor/extensions.ts); tests/e2e/undo.spec.ts | tests/e2e/undo.spec.ts: undo reverts only the user's own changes, never a colleague's (SC-27, UX21-200, R-HISTORY- |
| UX21-201 | P0 | Восстановление версии как новая ревизия | реализовано | tests/integration/collab.test.ts | tests/integration/collab.test.ts: restoring a revision creates a new revision and keeps concurrent edits (HIST-189, COLLAB-1<br>tests/e2e/collab.spec.ts: history: save a version, change text, restore the version (R-HISTORY-004, UX13-14, UX21-20 |

### TEMPLATES

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX21-202 | P2 | Предпросмотр шаблона | реализовано | TemplatesPage PreviewDialog (DocPreview); Без теста |  |
| UX21-203 | P1 | Создание из шаблона без изменения оригинала | реализовано | Контент шаблона копируется; Без теста |  |

### A11Y

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX21-204 | P1 | Reduced motion | реализовано | tests/e2e/a11y.spec.ts reduced-motion test |  |

### LAYOUT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX21-205 | P1 | 4 колонки на мобильном без потери контента | частично | editor.css:173 stacking; untested |  |

### MEDIA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-MEDIA-019 | P0 | Одно нажатие открывает lightbox с тёмным фоном и «вписать»; масштаб в просмотрщике не меняет блок; без скачков … | реализовано | apps/web/src/editor/nodeviews/ImageView.tsx; apps/web/src/components/ImageViewer.tsx (тёмный фон, «вписать», масштаб не меняет блок); tests/e2e/clipboard.spec.ts:'image viewer…' | tests/e2e/clipboard.spec.ts: image viewer: click on a selected image opens it; zoom is limited to 10–800 % (R-MEDIA-015 |
| R-MEDIA-020 | P1 | Desktop: колесо масштабирует относительно указателя; drag-pan (grab/grabbing); trackpad pinch, двойной щелчок, + / - / 0 / 1 / Esc … | реализовано | apps/web/src/components/ImageViewer.tsx zoomAt по указателю, drag-pan, ctrl-wheel pinch, dblclick, + - 0 1 Esc; tests/e2e/content.spec.ts:'image: upload via file chooser, resize presets, caption, full-screen viewer with zoom' (+, 0, Esc) |  |
| R-MEDIA-021 | P1 | Масштаб ~10–800% (пределы проверяются прототипом); колесо вне просмотрщика не перехватывается, внутри — без скролла страницы | реализовано | apps/web/src/components/ImageViewer.tsx MIN_SCALE 0.1 / MAX_SCALE 8 (ниже 10 % только для «вписать» огромных схем); tests/e2e/clipboard.spec.ts:'image viewer…' | tests/e2e/clipboard.spec.ts: image viewer: click on a selected image opens it; zoom is limited to 10–800 % (R-MEDIA-015 |
| R-MEDIA-022 | P1 | Mobile: pinch от центра жеста, pan одним пальцем, double tap, инерция с ограничением; свайп переключает только в «вписать»; safe-area … | частично | apps/web/src/components/ImageViewer.tsx pointer-events pinch/pan/double-tap; Нет инерции, свайпа между изображениями, safe-area |  |
| R-MEDIA-023 | P1 | Рендер: оригинал с progressive loading/тайлингом, предупреждение о размытии, EXIF, санитизация SVG, прозрачность PNG, узкие изображения … | частично | apps/server/src/services/attachments.ts makeTiles; apps/web/src/components/ImageViewer.tsx tiles/hiRes; sanitizeSvgFile; tests/integration/content.test.ts:'large images get a deep-zoom tile pyramid…'. Нет предупреждения о размытии |  |

### PERF

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PERF-022 | P1 | Zoom/pan через transform+rAF без layout thrashing; отклик на жест <50 мс, ~60 fps на типовом устройстве | частично | components/ImageViewer.tsx CSS transform; no requestAnimationFrame batching; gesture latency/fps not measured |  |

### HISTORY

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-HISTORY-023 | P0 | Три уровня: (A) undo/redo, (B) журнал изменений с автором, временем, типом, блоком, (C) неизменяемые версии/снимки | реализовано | apps/web/src/editor/clientExtensions.ts (Tiptap Collaboration → y-tiptap yUndoPlugin, own origin only; undoRedo disabled in packages/shared/src/editor/extensions.ts); page_events (apps/server/src/routes/pages.ts /events); page_revisions (apps/server/src/routes/revisions.ts) | tests/integration/collab.test.ts: records a journal of edit operations grouped per author (HIST-187, R-HISTORY-023, R-HISTOR |
| R-HISTORY-024 | P1 | Группировка набора (пауза/граница слова/смена блока); структурные действия (перенос, таблица, удаление, вставка, права … | реализовано | apps/server/src/collab/hub.ts#flushNow (группировка правок автора); tests/integration/collab.test.ts (HIST-187) | tests/integration/collab.test.ts: records a journal of edit operations grouped per author (HIST-187, R-HISTORY-023, R-HISTOR |
| R-HISTORY-025 | P0 | Каждая подтверждённая операция имеет устойчивый ID и позицию; append-only журнал с идемпотентностью; периодические снимки | реализовано | apps/server/src/collab/hub.ts#persist (op_id, seq), snapshots; Append-only на уровне кода, без запрета UPDATE/DELETE в БД |  |
| R-HISTORY-026 | P0 | Выбор точки времени/операции, реконструкция и сравнение, восстановление документа или блока без уничтожения новых изменений … | реализовано | apps/server/src/services/revisions.ts#stateAtSeq, apps/server/src/routes/revisions.ts GET/POST /pages/:id/journal/:seq[/restore], apps/web/src/components/page/HistoryPanel.tsx «Восстановить состояние на этот момент»; tests/integration/history-tree.test.ts; Восстановление на шаг журнала создаёт новую обратимую версию; если начало журнала сжато — опора на ревизию, иначе понятный отказ | tests/integration/history-tree.test.ts: restore to a journal step (R-HISTORY-026, HIST-187)<br>tests/integration/history-tree.test.ts: reconstructs the state after any journal operation and restores it as a new reversible rev<br>tests/integration/history-tree.test.ts: starts from a revision when the journal head was compacted and refuses an unreachable step |
| R-HISTORY-027 | P0 | Глобальный undo без подтверждения не откатывает чужие правки; локальный undo учитывает трансформацию относительно параллельных | реализовано | apps/web/src/editor/clientExtensions.ts (Tiptap Collaboration → y-tiptap yUndoPlugin, own origin only; undoRedo disabled in packages/shared/src/editor/extensions.ts); tests/e2e/undo.spec.ts | tests/e2e/undo.spec.ts: undo reverts only the user's own changes, never a colleague's (SC-27, UX21-200, R-HISTORY- |
| R-HISTORY-028 | P0 | Журнал операций ≥90 дней, снимки/версии ≥365 дней, критичные — бессрочно/по политике; юридическое хранение отдельно | реализовано | apps/server/src/jobs/worker.ts#maintenance (90/365), apps/server/src/routes/retention.ts; tests/integration/history-tree.test.ts | tests/integration/history-tree.test.ts: legal hold (R-HISTORY-015, R-HISTORY-028)<br>tests/integration/history-tree.test.ts: only org admins set or release a hold; it is audited, shown on the page and blocks permane |
| R-HISTORY-029 | P1 | Гарантия — восстановление после каждой подтверждённой смысловой операции/группы набора, не каждого нажатия; границы гарантии видны | частично | apps/server/src/collab/hub.ts; Граница гарантии не отображается пользователю |  |
| R-HISTORY-030 | P0 | Версии вложений и метаданных, защита связанных файлов от удаления, ACL при просмотре истории | реализовано | apps/server/src/routes/attachments.ts (версии), view_history в packages/shared/src/permissions.ts; Сборщика мусора blob-ов нет — связанные файлы не удаляются |  |
| R-HISTORY-031 | P1 | UX: Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y; список последних операций; панель «История» с фильтрами автор/дата/блок/тип; visual diff … | частично | apps/web/src/components/page/HistoryPanel.tsx; Фильтр только по типу версии; фильтров автор/дата/блок в UI нет; списка последних операций нет |  |

### COLLAB

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-COLLAB-030 | P0 | Rich-text/block CRDT (Yjs/Automerge или доказанный эквивалент): детерминированное слияние, уникальные ID блоков, порядок … | реализовано | apps/server/src/collab/hub.ts, apps/web/src/editor/extensions/blockIds.ts; tests/integration/collab.test.ts fuzz | tests/integration/collab.test.ts: randomised convergence (COLLAB-198, R-COLLAB-008, R-COLLAB-030, R-COLLAB-044, property-bas |
| R-COLLAB-031 | P0 | Серверная валидация схемы, прав, инвариантов; транзакционная координация поверх CRDT для таблиц, колонок, удаления/перемещения страниц, ACL | частично | apps/server/src/collab/hub.ts#acceptUpdate (права, схема), apps/server/src/services/pages.ts (tx дерева); Нет транзакционной координации поверх CRDT для таблиц/колонок; только валидация схемы с откатом | tests/integration/collab.test.ts: rejects schema-invalid updates and keeps the document valid (R-COLLAB-020, R-COLLAB-031) |
| R-COLLAB-032 | P0 | Сценарии: разные блоки; один абзац и позиция; формат+удаление; перенос+правка; удаление таблицы+строка; двойной перенос страницы … | реализовано | tests/integration/collab-p0.test.ts (формат+удаление, копирование+правка, перемещения, удаление таблицы+строка, два устройства), tests/e2e/collab-p0-editing.spec.ts (перенос+правка), tests/integration/core.test.ts (двойной перенос страницы, COLLAB-194), tests/integration/collab.test.ts (restore во время работы других) | tests/integration/collab-p0.test.ts: many editors, tables, moves (QA26-19, AT-56, SC-25, R-COLLAB-024, R-COLLAB-032)<br>tests/integration/collab-p0.test.ts: table deleted while another editor adds a row: the result is a valid document, never an or<br>tests/integration/collab-p0.test.ts: format + delete, block copy + edit and concurrent block moves converge without duplicates <br>… ещё 1 |
| R-COLLAB-033 | P0 | Предсказуемый результат, сохранение допустимых изменений, уведомление при невозможности слияния, отвергнутые правки в черновик/экспорт … | реализовано | apps/web/src/editor/extensions/conflictGuard.ts, apps/server/src/routes/conflicts.ts, apps/web/src/editor/Editor.tsx#FatalBanner; tests/e2e/conflict.spec.ts, tests/e2e/collab-p0-editing.spec.ts, tests/e2e/collab-p0-storage.spec.ts; Невозможность слияния (удаление/перенос блока с правкой) — уведомление и конфликтная копия; отвергнутые правки доступны для скачивания | tests/e2e/collab-p0-editing.spec.ts: a block is moved by one editor while another edits it: the edit is kept as a conflict copy |
| R-COLLAB-034 | P2 | Presence: аватары, цветные курсоры/выделения, имя по hover; не закрывают текст; скрытие при плотном присутствии | требует ручной проверки | apps/web/src/components/page/Presence.tsx (4 аватара + «+N»), apps/web/src/editor/clientExtensions.ts#caret; Визуальная проверка |  |
| R-COLLAB-035 | P0 | Статусы «Сохранено», «Синхронизация», «Офлайн — изменения на устройстве», «Требуется внимание» по реальному подтверждению … | реализовано | apps/web/src/components/page/SyncStatus.tsx, packages/shared/src/collab-client.ts; Сохранение курсора/прокрутки при reconnect обеспечивается тем, что редактор не перемонтируется; браузерного теста нет |  |
| R-COLLAB-036 | P0 | Неслиемая операция — диалог сравнения: сохранить обе, принять серверную, сохранить локальную копию; не скрывать конфликт | частично | apps/web/src/editor/Editor.tsx (уведомление о конфликте «Вернуть мою версию»), apps/server/src/routes/conflicts.ts (копия в истории, resolve restored/dismissed); tests/e2e/conflict.spec.ts; Конфликт не скрывается: копия сохраняется на сервере, уведомление с восстановлением; полноценного диалога сравнения с тремя вариантами нет |  |
| R-COLLAB-037 | P0 | Журнал с ack, retry/backoff, идемпотентность, sequence/vector clocks, проверка согласованности, контроль orphan-блоков и циклов … | частично | apps/server/src/services/consistency.ts (циклы/сироты/closure/разрывы журнала/снимки), apps/server/src/jobs/worker.ts#consistencyCheck → kb_integrity_errors, GET /api/v1/admin/consistency; tests/integration/history-tree.test.ts; Проверка согласованности сделана и тестируется; безопасная миграция схемы содержимого (content_schema_version) по-прежнему не реализована | tests/integration/history-tree.test.ts: data consistency check (R-COLLAB-037)<br>tests/integration/history-tree.test.ts: maintenance check reports tree and journal inconsistencies and exports kb_integrity_errors |

### QA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-QA-034 | P0 | Property-based/fuzz, partition/latency/reorder/duplicate, 2–20 редакторов, нагрузка, восстановление из snapshot+log … | частично | collab.test.ts randomised convergence; tests/integration/qa-invariants.test.ts (HTTP fallback, offline-reconnect, concurrent editor); scripts/load/collab-load.mjs 20 editors on 5 pages, 0 lost/duplicated; no partition/reorder/duplicate injection; 20-editor run is manual |  |

### MEDIA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX22-181 | P1 | Zoom колёсиком относительно курсора; pan мышью без скачка при захвате и отпускании | реализовано | apps/web/src/components/ImageViewer.tsx; Без теста |  |
| UX22-182 | P1 | Trackpad pinch и колесо не прокручивают статью при полноэкранном изображении | реализовано | apps/web/src/components/ImageViewer.tsx non-passive wheel, body overflow hidden; Без теста |  |
| UX22-183 | P1 | iOS/Android pinch, pan, double tap, инерция, смена ориентации, safe areas | частично | apps/web/src/components/ImageViewer.tsx; Нет инерции, safe-area; проверка на iOS/Android невозможна здесь (env) |  |
| UX22-184 | P1 | При масштабе >fit горизонтальный свайп не переключает изображение | реализовано | apps/web/src/components/ImageViewer.tsx; Свайп-переключения нет вообще, поэтому при масштабе > fit он не срабатывает |  |
| UX22-185 | P1 | Закрытие viewer восстанавливает фокус и прокрутку; оригинал не меняется | реализовано | apps/web/src/components/ImageViewer.tsx prev.focus(), оригинал не меняется; Без теста |  |
| UX22-186 | P1 | Огромная схема, PNG/SVG/EXIF, медленная сеть — без падения и пустого экрана | реализовано | apps/server/src/services/attachments.ts makeTiles; limitInputPixels; tests/integration/content.test.ts:'large images get a deep-zoom tile pyramid…' | tests/integration/content.test.ts: large images get a deep-zoom tile pyramid (UX21-181, UX22-186) |

### HISTORY

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| HIST-187 | P0 | Каждый подтверждённый структурный шаг виден в журнале и реконструируется | реализовано | apps/server/src/collab/hub.ts (page_events edit с seq), apps/server/src/services/revisions.ts#stateAtSeq; tests/integration/collab.test.ts, tests/integration/history-tree.test.ts | tests/integration/collab.test.ts: records a journal of edit operations grouped per author (HIST-187, R-HISTORY-023, R-HISTOR<br>tests/integration/history-tree.test.ts: restore to a journal step (R-HISTORY-026, HIST-187)<br>tests/integration/history-tree.test.ts: reconstructs the state after any journal operation and restores it as a new reversible rev |
| HIST-188 | P0 | Группы набора корректно undo/redo без отката чужих правок | реализовано | apps/web/src/editor/clientExtensions.ts (Tiptap Collaboration → y-tiptap yUndoPlugin, own origin only; undoRedo disabled in packages/shared/src/editor/extensions.ts); tests/e2e/undo.spec.ts | tests/e2e/undo.spec.ts: undo/redo of typing: 1 and 10 steps, Ctrl+Shift+Z and Ctrl+Y; result is saved (QA26-14, UX<br>tests/e2e/undo.spec.ts: undo reverts only the user's own changes, never a colleague's (SC-27, UX21-200, R-HISTORY- |
| HIST-189 | P0 | Восстановление старой версии создаёт новую ревизию; восстановление обратимо | реализовано | tests/integration/collab.test.ts (HIST-189) | tests/integration/collab.test.ts: restoring a revision creates a new revision and keeps concurrent edits (HIST-189, COLLAB-1 |
| HIST-190 | P1 | История: автор, время, diff, фильтры; доступна на телефоне | частично | apps/web/src/components/page/HistoryPanel.tsx (sheet на мобильном); Фильтров автора/даты нет |  |
| HIST-191 | P0 | Политика хранения 90/365 дней, права доступа и вложения | реализовано | apps/server/src/jobs/worker.ts#maintenance, apps/server/src/routes/revisions.ts (view_history); нет автотеста политики хранения |  |

### COLLAB

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| COLLAB-192 | P0 | Одновременный ввод в одном месте сходится на всех клиентах | реализовано | tests/integration/collab.test.ts (COLLAB-192) | tests/integration/collab.test.ts: two editors typing in the same paragraph converge without loss (SC-25, AT-74, COLLAB-192,  |
| COLLAB-193 | P0 | Форматирование+удаление+перемещение одного блока не теряет допустимый контент | реализовано | apps/web/src/editor/extensions/conflictGuard.ts (deleted/moved); tests/e2e/conflict.spec.ts (удаление+правка), tests/e2e/collab-p0-editing.spec.ts (перенос+правка), tests/integration/collab-p0.test.ts (форматирование+удаление, копирование+правка, одновременные перемещения) | tests/integration/collab.test.ts: delete block on one client while another edits it keeps a consistent result (AT-77, COLLAB<br>tests/integration/collab-p0.test.ts: format + delete, block copy + edit and concurrent block moves converge without duplicates <br>tests/e2e/collab-p0-editing.spec.ts: a block is moved by one editor while another edits it: the edit is kept as a conflict copy<br>… ещё 1 |

### TREE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| COLLAB-194 | P0 | Два переноса страницы не создают цикл или дубликат | реализовано | tests/integration/core.test.ts (COLLAB-194) | tests/integration/core.test.ts: concurrent opposite moves never create a cycle (COLLAB-194, UX23-218, R-TREE-022) |

### OFFLINE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| COLLAB-195 | P0 | Офлайн-правки синхронизируются или сохраняются в доступном черновике | реализовано | tests/integration/collab.test.ts, tests/e2e/editor.spec.ts | tests/integration/collab.test.ts: offline edits are kept locally and synchronised after reconnect, concurrent with others (S |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| COLLAB-196 | P0 | Отзыв прав блокирует новые серверные записи; локальные правки извлекаемы | реализовано | tests/integration/collab.test.ts: (AT-78, COLLAB-196 ...) | tests/integration/collab.test.ts: read-only user cannot write; revoking edit switches session to read-only; revoking view cl |

### HISTORY

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| COLLAB-197 | P0 | Concurrent restore не затирает работу коллег молча | реализовано | apps/server/src/routes/revisions.ts#restoreContent, apps/web/src/hooks/useEvents.ts; tests/integration/collab.test.ts, tests/integration/history-tree.test.ts; Коллеги получают уведомление со ссылкой на версию до восстановления, где сохранена их работа | tests/integration/collab.test.ts: restoring a revision creates a new revision and keeps concurrent edits (HIST-189, COLLAB-1<br>tests/integration/history-tree.test.ts: restore notifies co-editors (R-HISTORY-014, COLLAB-197)<br>tests/integration/history-tree.test.ts: everyone else on the page gets a page-restored event with a link to the pre-restore versio |

### COLLAB

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| COLLAB-198 | P0 | Chaos/fuzz подтверждают сходимость, идемпотентность, отсутствие orphan-узлов | реализовано | tests/integration/collab.test.ts (randomised convergence), tests/resilience/crash-restart.test.ts; Fuzz по дереву страниц (orphan-узлы) отсутствует | tests/integration/collab.test.ts: randomised convergence (COLLAB-198, R-COLLAB-008, R-COLLAB-030, R-COLLAB-044, property-bas |

### PROCESS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PROCESS-047 | P2 | Референсы Notion (restore, collaborate, CRDT-блог, images) — целевое ТЗ, не заявление о реализации | процесс/документ | this assessment; followed |  |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-UI-065 | P1 | Документ занимает главное место, инструменты контекстны, частые операции без модальных цепочек; сложность скрыта | требует ручной проверки | n/a; needs UX review |  |

### PUBLISH

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PUBLISH-012 | P0 | Публикация — осознанное действие, не побочный эффект автосохранения | реализовано | publish only via explicit POST /publish or approval; autosave never changes status |  |

### SPACE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-SPACE-004 | P0 | «Моё пространство» создаётся при первом входе; доступно только владельцу; не в корпоративном поиске других | реализовано | ensurePersonalSpace on user creation/login (apps/server/src/services/org.ts); tests/integration/core.test.ts: personal space invisible to others and admins | tests/integration/core.test.ts: each employee gets a private personal space invisible to others and to admins (UX23-199, A |
| R-SPACE-005 | P1 | В личном пространстве любые страницы, блоки, вложенность, таблицы, вложения, шаблоны, черновики; автосохранение и история как в командных | реализовано | personal space is an ordinary space (same pages/blocks/attachments/templates/history) |  |
| R-SPACE-006 | P0 | Личные страницы не публикуются и не доступны по ссылке автоматически; публикация/перенос — явное действие с проверкой прав | реализовано | setGrant org widening confirm; move from personal requires confirmation (previewMove personalSource) |  |
| R-SPACE-007 | P0 | Перенос в общую область: пространство и родитель, предпросмотр пути, аудитории, прав, вложений; подтверждение … | реализовано | previewMove impact (services/move-impact.ts): from/to path, gained/lost audience, guests losing access, public links, descendants, attachments; confirmation dialog shows them; success toast names the new location with «Открыть» link and «Отменить»; tests/integration/acl-p0.test.ts 'R-SPACE-007 R-ACL-068: …'; tests/e2e/acl-p0-routes.spec.ts ROUTE-03 (tree move) | tests/integration/acl-p0.test.ts: move preview (R-SPACE-007, R-ACL-068) and concurrent move + edit (E2E-106)<br>tests/integration/acl-p0.test.ts: R-SPACE-007 R-ACL-068: preview lists target path, public links and guests losing access; a |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ACL-051 | P0 | «Поделиться» личной страницей — осознанная операция с адресатами, уровнем, сроком; индикация «не полностью личная» … | реализовано | pageDto.personalShared + GET /pages/:id/exposure; header badge «Не полностью личная» and ShareDialog indicator; tests/integration/acl-p0.test.ts 'R-ACL-051: …'; tests/e2e/acl-p0-spaces.spec.ts 'R-ACL-051: …' | tests/integration/acl-p0.test.ts: sharing details (R-ACL-051, R-ACL-021, R-ACL-036, R-ACL-063)<br>tests/integration/acl-p0.test.ts: R-ACL-051: a personal page shared with anybody is marked «не полностью личная» (also its c<br>tests/e2e/acl-p0-spaces.spec.ts: R-ACL-051: a shared personal page shows «Не полностью личная» in the header and in the sha |

### ADMIN

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ADMIN-016 | P0 | Увольнение/блокировка: политика передачи/архивации личных материалов с аудитом без раскрытия частных заметок … | реализовано | POST /api/v1/admin/users/:id/offboard-personal (archive / transfer_shared with dry run; only already-shared documents go to the successor; counts-only audit) + admin «Доступ → Увольнение: личные материалы»; emergency access procedure (see R-ACL-056); tests/integration/acl-p0.test.ts 'R-ADMIN-016: offboarding …', 'R-ACL-056: …' | tests/integration/acl-p0.test.ts: emergency access and offboarding (R-ACL-056, R-ADMIN-016)<br>tests/integration/acl-p0.test.ts: R-ADMIN-016: offboarding hands over only already-shared personal documents; private notes  |

### SPACE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-SPACE-008 | P1 | Квоты ненавязчиво; при превышении содержимое не удаляется, доступны безопасные действия | частично | quotaCheck -> 507 quota_exceeded on upload (routes/attachments.ts); content never deleted; No quota usage indicator in UI. |  |

### TREE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-TREE-023 | P1 | Группы «Моё пространство», «Командные», «Избранное», «Недавние»; сохраняются раскрытия, выбранная страница, ширина, прокрутка … | частично | apps/web/src/layout/SidebarTree.tsx, apps/web/src/state/ui.ts; Нет группы «Недавние» в панели, не сохраняются прокрутка и выбранная позиция между сессиями |  |
| R-TREE-024 | P1 | Hover строки: «+» и «⋯» справа без изменения ширины и скачков; на touch — явная кнопка меню | реализовано | apps/web/src/styles/layout.css (pointer: coarse → действия видимы) |  |
| R-TREE-025 | P0 | «+» создаёт черновик под родителем с фокусом в названии; Esc на пустом отменяет без мусора; Enter подтверждает … | реализовано | apps/web/src/layout/treeActions.tsx#createPage (одна заявка на время запроса), apps/web/src/editor/Editor.tsx (Esc в пустом названии), apps/web/src/pages/PageView.tsx (discard-if-empty); tests/e2e/collab-p0-editing.spec.ts (Esc …, double "+" on a slow network), tests/e2e/editor.spec.ts | tests/e2e/collab-p0-editing.spec.ts: Esc in the empty title of a new page cancels it; a double "+" on a slow network creates ex<br>tests/e2e/editor.spec.ts: an empty page created by mistake disappears when left; a double click creates one page (R- |
| R-TREE-026 | P1 | Стрелка раскрывает, название открывает; клавиатура: стрелки, Enter, Space, контекстное меню, подсказки | реализовано | apps/web/src/layout/SidebarTree.tsx#onKeyDown (стрелки, Enter, Space, F2, контекстное меню) |  |
| R-TREE-027 | P0 | DnD страниц: ghost, линия, подсветка родителя, автопрокрутка, авторазворачивание, запретные цели; без циклов, без прав, потери ссылок … | реализовано | apps/web/src/layout/SidebarTree.tsx (ghost, линия, подсветка, автопрокрутка, авторазворачивание, запретные цели), apps/server/src/services/pages.ts |  |
| R-TREE-028 | P0 | Перенос между пространствами: проверка прав, наследования, вложений, ссылок; атомарная серверная операция, аудит, уведомление о конфликте | реализовано | apps/server/src/services/pages.ts#previewMove/movePage (аудит, вложения, подтверждение), tests/integration/acl.test.ts | tests/integration/acl.test.ts: moving a private page to an open space requires confirmation and shows who gains access; u |

### PERF

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PERF-023 | P1 | Тысячи страниц: ленивые дочерние, виртуализация, стабильная прокрутка, мгновенное раскрытие загруженных ветвей | частично | SidebarTree virtualisation; not tested at 10 000 nodes |  |

### PAGE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PAGE-032 | P1 | Дочерняя страница из тела родителя, slash-меню и контекстного меню с одинаковой семантикой | реализовано | apps/web/src/editor/commands.tsx, apps/web/src/layout/SidebarTree.tsx |  |

### COLLAB

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-COLLAB-038 | P1 | WebSocket или аналог для присутствия, курсоров, изменений, уведомлений, дерева; HTTPS для загрузки, файлов, поиска, критических команд … | частично | docs/DECISIONS.md D-02, apps/server/src/routes/*; Решение описано, нагрузочных испытаний транспорта нет |  |

### OFFLINE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-OFFLINE-009 | P0 | Локальная очередь с устойчивыми ID и идемпотентной повторной отправкой; статусы «Изменения на устройстве», «Синхронизация», «Сохранено» … | реализовано | packages/shared/src/collab-client.ts, apps/web/src/sync/idb.ts; tests/integration/collab.test.ts, tests/resilience/crash-restart.test.ts | tests/integration/collab.test.ts: re-delivered operation is acknowledged once and not duplicated (D-02, E-03, UX23-214, R-CO |

### COLLAB

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-COLLAB-039 | P0 | Reconnect с backoff и jitter; догоняющая синхронизация от подтверждённой ревизии; сверка версий … | реализовано | packages/shared/src/collab-http.ts (HttpTunnelSocket), packages/shared/src/collab-client.ts (переключение после 2 неудач WebSocket, sync timeout, повтор WebSocket раз в 5 мин), apps/server/src/collab/tunnel.ts, apps/server/src/routes/collab.ts (/api/v1/collab/:pageId/tunnel, long poll с подтверждением кадров); tests/integration/collab-p0.test.ts (WebSocket blocked …), tests/unit/collab-p0.test.ts (transport fallback); Резервный канал HTTPS (long polling) с теми же кадрами, проверками прав и ACK после commit; догоняющая синхронизация по state vector | tests/integration/collab-p0.test.ts: HTTP fallback channel (R-COLLAB-039)<br>tests/integration/collab-p0.test.ts: WebSocket blocked: the client switches to the HTTP channel, gets ACK only after commit and<br>tests/unit/collab-p0.test.ts: transport fallback (R-COLLAB-039)<br>… ещё 2 |
| R-COLLAB-040 | P0 | CRDT/OT с проверкой реализации; структурные операции (перемещение, права, публикация, удаление … | реализовано | apps/server/src/services/pages.ts (tx move/trash/restore), apps/server/src/routes/revisions.ts, apps/server/src/collab/hub.ts |  |
| R-COLLAB-041 | P0 | Несливаемый конфликт — обе версии и сравнение; без скачков курсора и прокрутки при восстановлении соединения | реализовано | apps/web/src/editor/extensions/conflictGuard.ts, apps/server/src/routes/conflicts.ts (копия в истории страницы), apps/web/src/editor/Editor.tsx (редактор не перемонтируется при reconnect); tests/e2e/collab-p0-editing.spec.ts, tests/e2e/conflict.spec.ts; Обе версии сохраняются (результат слияния + конфликтная копия); построчного сравнения версий конфликта нет | tests/e2e/collab-p0-editing.spec.ts: a block is moved by one editor while another edits it: the edit is kept as a conflict copy |

### OFFLINE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-OFFLINE-010 | P0 | Восстановление после перезагрузки, сна, смены сети, двух вкладок; черновик не теряется до подтверждения; ограничения офлайна обозначены | реализовано | apps/web/src/sync/collab.ts (online/offline/visibilitychange), apps/web/public/sw.js, apps/web/src/hooks/data.ts, apps/web/src/pages/PageView.tsx (баннер ограничений офлайна); tests/e2e/collab-p0-offline.spec.ts (перезагрузка без сети, две вкладки), tests/e2e/collab-p0-storage.spec.ts (offline local-copy screen …), tests/integration/collab-p0.test.ts (sleeping laptop) | tests/integration/collab-p0.test.ts: sleeping laptop: a silently dead connection is detected by the acknowledgement timeout, ed<br>tests/e2e/collab-p0-offline.spec.ts: reload without network reopens the local copy with an honest status; the queue is delivere<br>tests/e2e/collab-p0-offline.spec.ts: two tabs of the same user edit one page online and offline: no loss, no duplicates (UX23-2<br>… ещё 1 |

### FILES

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-FILES-011 | P0 | Возобновляемые загрузки с проверкой целостности; файл не отображается доступным до успешной загрузки | реализовано | apps/server/src/routes/attachments.ts /uploads/:id/complete {sha256}; lib/uploads.ts (возобновление по сохранённому uploadId после перезагрузки); tests/integration/files-integrity.test.ts:'R-FILES-011…'; tests/integration/content.test.ts resumable upload | tests/integration/content.test.ts: resumable upload with chunk retry and checksum verification (UX23-220, A16, R-FILES-011)<br>tests/integration/files-integrity.test.ts: upload checksum computed by the client (R-FILES-004, R-FILES-011)<br>tests/integration/files-integrity.test.ts: R-FILES-011: a streamed upload is completed only when the client checksum matches the rece<br>… ещё 2 |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-UI-066 | P1 | Непрерывная прокрутка и подгрузка вместо технической пагинации: дерево, поиск, недавние, шаблоны | частично | SidebarTree virtualised; "Показать ещё/Загрузить ещё" buttons in SearchPage.tsx:531, HistoryPanel.tsx:194, AuditSection.tsx:285 instead of continuous loading |  |

### PERF

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PERF-024 | P1 | Серверная курсорная пагинация, виртуализация, предзагрузка, сохранение позиции; для аудита и истории — переход к дате/фильтру | частично | cursor pagination (useInfiniteQuery), audit datetime-local filter (AuditSection.tsx:189); lists not virtualised; history has no jump-to-date |  |
| R-PERF-025 | P1 | Длинные документы без блокировки набора; ленивые медиа с резервированием размеров; виртуализация таблиц не ломает выделение … | частично | ImageView lazy + aspect-ratio; tests/e2e/perf-typing.spec.ts SC-04 (5 000 blocks, table 200 rows, no lost input); no virtualisation; typing on 5 000 blocks p50 ≈ 190 ms (PERF-D2) |  |
| R-PERF-026 | P1 | Отклик типичных действий ~100 мс; раскрытие загруженной ветки без сетевого ожидания; численные SLA после профилирования | частично | tests/e2e/collab.spec.ts "typing latency on a long document stays within budget": 400 paragraphs (~5k words), 40 samples, execCommand insertText -> next rAF, no CPU/network throttling; last run p95≈31 ms; other actions not profiled |  |
| R-PERF-027 | P1 | Метрики: INP, время первого взаимодействия, sync p95/p99, пропуски кадров DnD, размер очереди, время reconnect; бюджеты регрессии в CI | частично | lib/telemetry.ts input latency → kb_client_input_latency_ms; server histograms; no INP/reconnect/DnD metrics; CI exists but has no performance budgets |  |

### HELP

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-HELP-007 | P2 | Первое посещение личной области: пример и «Создать первую страницу», без обязательного тура | реализовано | Home/SidebarTree empty state "Создать первую страницу", no tour |  |
| R-HELP-008 | P1 | Подсказки к «+», «⋮», ручке, правам, публикации, статусу sync; сочетания в tooltip; поиск по справке | требует ручной проверки | Tooltips with shortcuts on "+", block handle, sync status; help search; Coverage of all listed controls needs manual check. |  |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-UI-067 | P1 | Пустое дерево, пустая статья, нет прав, нет сети, ошибка загрузки — ясное сообщение и безопасный шаг; без зависших экранов | частично | PageError, App offline screen, empty states; untested |  |

### SPACE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX23-199 | P0 | Новый пользователь получает личное пространство, невидимое другим | реализовано | tests/integration/core.test.ts: (UX23-199, ACL-151) | tests/integration/core.test.ts: personal space (UX23-199, ACL-151)<br>tests/integration/core.test.ts: each employee gets a private personal space invisible to others and to admins (UX23-199, A |

### PUBLISH

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX23-200 | P0 | Личная страница не публикуется при автосохранении | реализовано | autosave/collab flush never publishes; personal page status stays draft; No dedicated test. |  |

### TREE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX23-201 | P1 | «+» в дереве создаёт дочерний черновик у выбранного родителя | реализовано | tests/e2e/content.spec.ts | tests/e2e/content.spec.ts: sidebar tree: "+" creates a child page under the selected parent with focus in the title ( |
| UX23-202 | P1 | Escape отменяет пустое создание без мусора и дублей | не реализовано | Escape на пустом новом черновике ничего не отменяет | tests/e2e/editor.spec.ts: an empty page created by mistake disappears when left; a double click creates one page (R- |
| UX23-203 | P0 | Двойное «+» при задержке сети не создаёт две страницы | реализовано | apps/web/src/layout/treeActions.tsx#createPage (повторное нажатие переиспользует запрос в полёте), apps/server/src/services/pages.ts requestId; tests/e2e/collab-p0-editing.spec.ts (double "+" on a slow network creates exactly one page), tests/e2e/editor.spec.ts, tests/integration/core.test.ts | tests/integration/core.test.ts: creates nested pages, idempotent by requestId (UX23-203, R-COLLAB-028)<br>tests/e2e/collab-p0-editing.spec.ts: Esc in the empty title of a new page cancels it; a double "+" on a slow network creates ex<br>tests/e2e/editor.spec.ts: an empty page created by mistake disappears when left; a double click creates one page (R- |
| UX23-204 | P1 | Раскрытие дерева и открытие статьи — разные предсказуемые действия | реализовано | apps/web/src/layout/SidebarTree.tsx; нет автотеста |  |
| UX23-205 | P1 | Hover-инструменты не сдвигают текст и не перекрывают название | реализовано | apps/web/src/styles/layout.css; нет автотеста |  |
| UX23-206 | P1 | DnD показывает будущего родителя и порядок | реализовано | apps/web/src/layout/SidebarTree.tsx (tree-drop-line, drop-inside); нет автотеста |  |
| UX23-207 | P1 | Автопрокрутка и авторазворачивание в глубоком дереве | реализовано | apps/web/src/layout/SidebarTree.tsx (autoScroll, hoverTimer); нет автотеста |  |
| UX23-208 | P0 | Перенос в себя/потомка блокируется без повреждения структуры | реализовано | tests/integration/core.test.ts (UX23-208) | tests/integration/core.test.ts: prevents moving a page into its own descendant (E2E-099, UX23-208, UX21-189) |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX23-209 | P0 | Перенос без прав отклоняется без ложного локального успеха | реализовано | resolveMoveTarget requires create on target (403); treeActions.movePage waits for server before invalidating tree; tests/integration/acl.test.ts: cannot move into a location where the user cannot create (UX23-209) | tests/integration/acl.test.ts: cannot move into a location where the user cannot create (UX23-209) |
| UX23-210 | P0 | Перемещение между пространствами показывает изменение аудитории и прав | реализовано | previewMove audience diff shown in confirm dialog (treeActions.tsx); tests/integration/acl.test.ts (UX23-210) | tests/integration/acl.test.ts: moving changes audience (ACL-165, ACL-166, A06, UX23-210)<br>tests/integration/acl.test.ts: moving a private page to an open space requires confirmation and shows who gains access; u |

### TREE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX23-211 | P0 | После переноса сохранены вложения, ссылки, история | реализовано | apps/server/src/services/pages.ts#movePage (ID, вложения, история не трогаются); нет автотеста |  |

### PERF

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX23-212 | P1 | Раскрытие дерева на 10 000 страниц не блокирует интерфейс | частично | virtualised tree; not tested with 10 000 pages |  |

### OFFLINE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX23-213 | P0 | Обрыв WebSocket — редактирование продолжается с честным статусом | реализовано | apps/web/src/components/page/SyncStatus.tsx, tests/e2e/editor.spec.ts offline | tests/integration/collab.test.ts: offline edits are kept locally and synchronised after reconnect, concurrent with others (S |

### COLLAB

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX23-214 | P0 | Повторная отправка операций не создаёт дублей | реализовано | tests/integration/collab.test.ts (UX23-214) | tests/integration/collab.test.ts: re-delivered operation is acknowledged once and not duplicated (D-02, E-03, UX23-214, R-CO |
| UX23-215 | P0 | После переподключения пропущенные изменения в верном порядке | реализовано | tests/integration/collab.test.ts (UX23-215) | tests/integration/collab.test.ts: offline edits are kept locally and synchronised after reconnect, concurrent with others (S |

### OFFLINE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX23-216 | P0 | Две вкладки одного пользователя не теряют и не дублируют правки | реализовано | apps/web/src/sync/idb.ts (общая очередь), apps/server/src/collab/hub.ts dedupe по op_id; tests/e2e/collab-p0-offline.spec.ts (two tabs of the same user …), tests/integration/collab-p0.test.ts (the same user on two devices …) | tests/integration/collab-p0.test.ts: the same user on two devices edits offline on both; nothing is lost or doubled (R-COLLAB-0<br>tests/e2e/collab-p0-offline.spec.ts: two tabs of the same user edit one page online and offline: no loss, no duplicates (UX23-2 |

### COLLAB

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX23-217 | P0 | Совместная правка абзаца сохраняет изменения обоих | реализовано | tests/integration/collab.test.ts (UX23-217) | tests/integration/collab.test.ts: two editors typing in the same paragraph converge without loss (SC-25, AT-74, COLLAB-192,  |

### TREE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX23-218 | P0 | Конфликтный перенос страницы не создаёт двух родителей | реализовано | apps/server/src/services/pages.ts#lockTree; tests/integration/core.test.ts (concurrent opposite moves) | tests/integration/core.test.ts: concurrent opposite moves never create a cycle (COLLAB-194, UX23-218, R-TREE-022) |

### OFFLINE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX23-219 | P0 | При закрытии вкладки неподтверждённый черновик восстанавливается | реализовано | tests/integration/collab.test.ts (UX23-219) | tests/integration/collab.test.ts: unacknowledged changes survive a client restart via the pending store (AT-58, UX23-219, E- |

### FILES

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX23-220 | P0 | Огромный файл не отмечается доступным до завершения загрузки | реализовано | apps/server/src/routes/attachments.ts /uploads/:id/complete (409 incomplete); блок вставляется только после complete; tests/integration/content.test.ts:'resumable upload…', 'incomplete upload cannot be completed' | tests/integration/content.test.ts: resumable upload with chunk retry and checksum verification (UX23-220, A16, R-FILES-011)<br>tests/integration/content.test.ts: incomplete upload cannot be completed (UX23-220) |

### SEARCH

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX23-221 | P1 | Поиск с десятками тысяч результатов подгружается плавно | частично | apps/web/src/pages/SearchPage.tsx (useInfiniteQuery); Кандидатов не более 3000, offset ≤5000 — десятки тысяч результатов недоступны |  |

### TREE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX23-222 | P1 | Возврат из статьи восстанавливает прокрутку и раскрытие дерева | реализовано | apps/web/src/state/ui.ts, AppShell держит Sidebar смонтированным; нет автотеста |  |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| UX23-223 | P1 | Мобильное создание и перенос без hover | частично | tests/e2e/mobile.layout.spec.ts creates a page on mobile; move without hover untested |  |
| UX23-224 | P1 | Права, публикация, синхронизация понятны неопытному сотруднику | требует ручной проверки | n/a; usability test not performed |  |

### PROCESS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PROCESS-048 | P0 | Результат — развёрнутая, документированная, протестированная, эксплуатируемая система; прототип/MVP/заглушки/«сделаем позже» не принимаются | процесс/документ | deploy/ (docker-compose, nginx, systemd, monitoring), docs/OPERATIONS.md, BACKUP_RESTORE.md; not yet deployed to a real environment |  |

### OPS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-OPS-019 | P0 | До сдачи завершены развёртывание, миграции, мониторинг, резервирование, восстановление, доступы, обновления, документация, примеры … | процесс/документ | docs/OPERATIONS.md, docs/BACKUP_RESTORE.md, deploy/*; Delivery checklist sign-off is a project process |  |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-UI-068 | P0 | Никакие функции не ведут в тупик, нет нерабочих кнопок и незавершённых состояний | частично | tests/e2e/ui-p0-interaction.spec.ts dead-end tests (endless spinner, dialogs exit/Esc, disabled actions with reasons — disabledReason added to page and tree menus, Menu falls back to hint); no inventory of every button/state; other screens (admin, import) not covered by dead-end E2E | tests/e2e/ui-p0-interaction.spec.ts: R-UI-053, R-UI-068: disabled actions always say why (view-only user) |

### PROCESS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PROCESS-049 | P1 | При неоднозначности — варианты и выбор по приоритету: данные/права, корректность, простота, скорость/доступность, визуал, сопровождение … | частично | docs/DECISIONS.md 18 entries; not every decision has an ADR |  |
| R-PROCESS-050 | P1 | Существенные изменения требований согласуются; закрытие пробелов не меняет объём и бизнес-правила | процесс/документ | n/a; n/a |  |
| R-PROCESS-051 | P0 | Реестр открытых вопросов и дефектов с владельцем и тестом; 0 критических/высоких; средние/низкие исправлены или письменно приняты | не реализовано | n/a; no open-issues/defects registry |  |

### QA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-QA-035 | P1 | Переполнения, наложения, hover-меню, DnD, адаптивность, потеря фокуса — дефекты продукта, не косметика | процесс/документ | n/a; no defect registry/classification doc |  |

### COLLAB

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-COLLAB-042 | P0 | WebSocket не обязателен единственным; допустимы SSE/streaming/периодическая синхронизация; выбор по свойствам … | реализовано | docs/DECISIONS.md D-02, docs/ARCHITECTURE.md §3 |  |
| R-COLLAB-043 | P0 | Локальная фиксация операций; устойчивое ACK после надёжной записи; статусы «локально», «синхронизация», «сохранено на сервере» … | реализовано | apps/web/src/components/page/SyncStatus.tsx, packages/shared/src/collab-client.ts | tests/integration/collab.test.ts: "saved" is reported only after the update is committed to the journal (E-13, D-10, R-COLLA |
| R-COLLAB-044 | P0 | Повторяемая синхронизация: ID операций, идемпотентность, каузальность, контроль пропусков, повторная передача, дедупликация | реализовано | packages/shared/src/collab-client.ts, apps/server/src/collab/hub.ts (seq gap handling); tests/integration/collab.test.ts fuzz, tests/resilience/crash-restart.test.ts | tests/integration/collab.test.ts: re-delivered operation is acknowledged once and not duplicated (D-02, E-03, UX23-214, R-CO<br>tests/integration/collab.test.ts: randomised convergence (COLLAB-198, R-COLLAB-008, R-COLLAB-030, R-COLLAB-044, property-bas |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ACL-052 | P0 | Права перепроверяются при записи, восстановлении, скачивании; изменения при отзыве прав не публикуются … | реализовано | hub write check (nack forbidden), restore requires restore action, download re-check; tests/integration/collab.test.ts AT-78 |  |

### COLLAB

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-COLLAB-045 | P0 | Правки разных и одного абзаца объединяются без потери символов; перемещения/удаления, таблицы, колонки, метаданные детерминированы … | реализовано | apps/server/src/collab/hub.ts, apps/web/src/editor/extensions/conflictGuard.ts; tests/integration/collab.test.ts (один абзац), tests/integration/collab-p0.test.ts (таблицы, перемещения), tests/e2e/conflict.spec.ts, tests/e2e/collab-p0-editing.spec.ts; Слияние CRDT детерминировано; перемещение/удаление блока с параллельной правкой сохраняет «обе версии» через конфликтную копию | tests/integration/conflicts.test.ts: conflict copies (E-04, R-COLLAB-045, R-COLLAB-049)<br>tests/e2e/collab-p0-editing.spec.ts: a block is moved by one editor while another edits it: the edit is kept as a conflict copy<br>tests/e2e/conflict.spec.ts: edit vs concurrent delete: the editor keeps a conflict copy and can put the block back (E- |
| R-COLLAB-046 | P1 | Курсоры и присутствие — эфемерные и не влияют на сохранность | реализовано | apps/server/src/collab/hub.ts (awareness вне Y.Doc) |  |

### OPS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-OPS-020 | P0 | Доступность ≥99,9% в месяц; исключения в SLA | ограничение окружения | see R-OPS-002; Production measurement only |  |

### PERF

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PERF-028 | P1 | Локальный отклик набора и действий p95 ≤100 мс в типовом документе; честная индикация тяжёлых операций | частично | tests/e2e/collab.spec.ts "typing latency on a long document stays within budget": 400 paragraphs (~5k words), 40 samples, execCommand insertText -> next rAF, no CPU/network throttling; last run p95≈31 ms; typing only; other local actions unmeasured |  |
| R-PERF-029 | P1 | Удалённое подтверждённое изменение у другого участника p95 ≤500 мс при нормальной сети | частично | tests/e2e/collab.spec.ts two people edit — convergence only; latency not measured |  |

### COLLAB

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-COLLAB-047 | P0 | Ни одна подтверждённая операция не теряется при перезагрузке, повторном входе, переподключении, отказе экземпляра | реализовано | tests/resilience/crash-restart.test.ts, tests/resilience/db-connection-loss.test.ts, tests/integration/collab.test.ts (server restart) | tests/integration/collab.test.ts: server restart during a session loses no acknowledged change and resends the rest (OPS-009 |

### BACKUP

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-BACKUP-018 | P0 | RPO ≤5 минут и RTO ≤2 часа с регулярными испытаниями; учёт неподтверждённых локальных изменений отдельно | частично | see R-BACKUP-001; tests/resilience/pitr.test.ts; Test scale only | tests/resilience/pitr.test.ts: recovers database and files to the moment before the incident; later damage is absent, ear |

### HISTORY

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-HISTORY-032 | P0 | Журнал смысловых операций ≥90 дней, снимки ≥365 дней или дольше по политике; гарантии документированы | реализовано | apps/server/src/jobs/worker.ts#maintenance, docs/ARCHITECTURE.md |  |

### OPS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-OPS-021 | P1 | Поддерживаемые размеры документов, вложений, число редакторов и профили нагрузки определены, измерены и в паспорте эксплуатации | частично | docs/BACKUP_RESTORE.md §6 (measured backup/restore throughput); No operations passport with supported document/attachment sizes, editor counts, load profiles |  |

### QA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-QA-036 | P0 | Для каждого сценария: обычный, граничный, ошибочный, конкурентный, восстановительный пути по 16 группам функций | не реализовано | n/a; no scenario × path matrix |  |
| R-QA-037 | P0 | Сквозные испытания A–L: одна строка и разные блоки; перенос+правка; структура таблицы; обрыв при записи и перезапуск … | частично | crash-restart typing, concurrent paragraph edits, paste table; no mapping of the 12 trials to tests |  |
| R-QA-038 | P0 | Автоматизация unit/component/integration/API/E2E/property/load/chaos; рандомизированные конкурентные последовательности … | частично | unit/integration/E2E/property/chaos present; no component/contract tests; load test exists (scripts/load) but is not in CI |  |

### OPS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-OPS-022 | P0 | Поставка: deployment без секретов в репо, миграции и откат, health/readiness, метрики/логи/трейсы, алерты, бэкапы и restore-тесты … | частично | Dockerfile, deploy/*, migrations + rollback + enforced pre-migration backup, health/readiness, metrics/logs/OpenTelemetry traces (tests/integration/io-p0-ops.test.ts), alerts, backup + restore tests, docs; CD pipeline and operations passport missing | tests/integration/io-p0-ops.test.ts: distributed tracing (R-OPS-003, R-OPS-022)<br>tests/integration/io-p0-ops.test.ts: HTTP requests and background jobs are OpenTelemetry spans: W3C traceparent is continued an<br>tests/integration/io-p0-ops.test.ts: every alert rule uses metrics the application or the backup scripts export and links to an |

### PROCESS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PROCESS-052 | P0 | До запуска: тестовая эксплуатация, нагрузка, доступность, угрозы и права, тест восстановления, ручная UX-проверка, регрессии, пилот … | не реализовано | n/a; no gate checklist; no pilot, load, a11y audit, manual UX check |  |
| R-PROCESS-053 | P0 | «Готово» только после прохождения gate, не после написания кода | частично | scripts/release-gate.py defines the gate; gate currently fails (open P0s), so "готово" is not claimed |  |

### OPS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| OPS-001 | P0 | Свежая установка и обновление без ручного исправления БД | реализовано | Migrations auto-applied at start under advisory lock (server.ts → migrateUp); every test DB and production smoke run (node apps/server/dist/main.js) installs without manual SQL; Upgrade between released versions not exercised |  |
| OPS-002 | P0 | Откат неудачного релиза | реализовано | tests/resilience/migrations.test.ts: rollback step by step with data, app works after; old release refuses newer schema; Image rollback procedural | tests/resilience/migrations.test.ts: schema migrations: rollback and re-apply (E-14, OPS-002, R-OPS-001)<br>tests/resilience/migrations.test.ts: every migration rolls back and re-applies step by step with data present; the application <br>tests/resilience/migrations.test.ts: an older release refuses to start against a newer schema instead of running on it (OPS-002 |

### OFFLINE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| OPS-003 | P0 | Корректный статус неподтверждённых локальных изменений | реализовано | tests/resilience/db-connection-loss.test.ts, tests/resilience/crash-restart.test.ts | tests/resilience/db-connection-loss.test.ts: unacknowledged operations are never shown as saved and all of them persist after the datab<br>tests/resilience/crash-restart.test.ts: acknowledged edits survive a SIGKILL; in-flight and offline edits are kept and applied onc |

### COLLAB

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| OPS-004 | P0 | Переподключение с идемпотентным повтором | реализовано | tests/resilience/crash-restart.test.ts (OPS-004) | tests/resilience/crash-restart.test.ts: an operation persisted before the crash whose acknowledgement was lost is not duplicated o |
| OPS-005 | P0 | Параллельные правки одного абзаца | реализовано | tests/integration/collab.test.ts (two editors same paragraph) | tests/integration/collab.test.ts: two editors typing in the same paragraph converge without loss (SC-25, AT-74, COLLAB-192,  |
| OPS-006 | P0 | Перемещение блока одновременно с правкой | реализовано | apps/web/src/editor/extensions/conflictGuard.ts, apps/web/src/editor/extensions/blockOps.ts#moveBlock; tests/e2e/collab-p0-editing.spec.ts (a block is moved …); Параллельная правка перемещаемого блока сохраняется (конфликтная копия + восстановление) | tests/e2e/collab-p0-editing.spec.ts: a block is moved by one editor while another edits it: the edit is kept as a conflict copy |

### TABLE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| OPS-007 | P0 | Конкурирующие операции над таблицей | реализовано | apps/web/src/editor/extensions/tableRepair.ts (исправлен дефект: починка «рваной» таблицы после конкурентных правок существовала только в браузере; теперь её записывает один выбранный редактор); tests/e2e/editor-p0-table.spec.ts:'concurrent table operations of two people (row added offline vs column added offline) converge to the same rectangular table (OPS-007)' | tests/e2e/editor-p0-table.spec.ts: concurrent table operations of two people (row added offline vs column added offline) conv |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| OPS-008 | P0 | Отзыв доступа во время сессии | реализовано | tests/integration/collab.test.ts: revoking edit switches session to read-only | tests/integration/collab.test.ts: read-only user cannot write; revoking edit switches session to read-only; revoking view cl |

### COLLAB

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| OPS-009 | P0 | Перезапуск сервера в момент записи | реализовано | tests/integration/collab.test.ts, tests/resilience/crash-restart.test.ts | tests/integration/collab.test.ts: server restart during a session loses no acknowledged change and resends the rest (OPS-009<br>tests/resilience/crash-restart.test.ts: server crash during editing (OPS-009, V17-F04, E-01) |

### HISTORY

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| OPS-010 | P0 | Восстановление документа по истории | реализовано | tests/integration/collab.test.ts, tests/e2e/collab.spec.ts | tests/integration/collab.test.ts: restoring a revision creates a new revision and keeps concurrent edits (HIST-189, COLLAB-1 |

### BACKUP

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| OPS-011 | P0 | Восстановление из резервной копии | реализовано | tests/resilience/backup-restore.test.ts; RPO/RTO met at test scale | tests/resilience/backup-restore.test.ts: backup → restore drill (SC-30, AT-60, AT-87, V16-S20, OPS-011, QA26-18) |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| OPS-012 | P1 | Корректное отображение долгих операций | частично | ImportPage progress + cancel; no browser test |  |

### OPS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| OPS-013 | P1 | Мониторинг и тревоги | частично | deploy/monitoring/prometheus-alerts.yml, grafana-dashboard.json; Rules not loaded into Prometheus / fired in a drill here (promtool unavailable) |  |

### AUDIT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| OPS-014 | P0 | Полный аудит изменений | реализовано | logical edit operations → page.edit in audit_events after commit (collab/hub.ts flushNow), page.view, access.not_found/denied, all admin/ACL changes; tests/integration/acl-p0.test.ts 'OPS-014: a logical edit operation is written to the audit log …', 'R-AUDIT-001 OPS-014: …' | tests/integration/acl-gaps.test.ts: audit: private titles masked, denials logged (ROUTE-06, R-AUDIT-001, OPS-014)<br>tests/integration/acl-p0.test.ts: audit of reads and hidden resources (R-AUDIT-001, OPS-014)<br>tests/integration/acl-p0.test.ts: R-AUDIT-001 OPS-014: opening a document is audited (rate limited) and probing a hidden pag<br>… ещё 2 |

### QA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| OPS-015 | P1 | Мобильная и планшетная регрессия | частично | tests/e2e/mobile.layout.spec.ts; single phone test; no tablet project |  |

### A11Y

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| OPS-016 | P1 | Доступность с клавиатуры | частично | keyboard handlers; no keyboard pass |  |

### PERF

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| OPS-017 | P1 | Нагрузка и длительная сессия без деградации | не реализовано | n/a; no long-session/load degradation test |  |

### PROCESS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| OPS-018 | P0 | Нет открытых критических/высоких дефектов при приёмке | не реализовано | n/a; no defect registry |  |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ACL-053 | P1 | Единый лаконичный интерфейс доступа без знания ACL/RBAC; роль, членство, область видимости, разрешения — независимые сущности | реализовано | model separates org_role, group_members, space visibility, grants (migrations/0001_core.sql) |  |
| R-ACL-054 | P0 | Эффективные права с объяснением происхождения; deny by default; все проверки на сервере (API, поиск, вложения, экспорт, превью, история, WS) | реализовано | combine deny-by-default + explanation; checks in API/search/attachments/export/preview/history/WS |  |
| R-ACL-055 | P1 | Субъекты: владелец организации, администратор, руководитель подразделения (делегирование), сотрудник, гость, группа, подразделение … | реализовано | subjects: user (owner/admin/people_admin/employee/guest), group (department/group with manager), org |  |
| R-ACL-056 | P0 | Админ-роль не открывает личные пространства; экстренный доступ только по утверждённой политике с причиной и аудитом | реализовано | emergency_access table + /api/v1/admin/emergency-access (request with reason ≥20 chars and 1–72 h, approval by a DIFFERENT admin, read-only grant without export/download/share, owner notified, request/approve/reject/revoke audited) + admin UI; tests/integration/acl-p0.test.ts 'R-ACL-056: …'; tests/e2e/acl-p0-admin.spec.ts 'R-ACL-056: …' | tests/integration/acl-p0.test.ts: emergency access and offboarding (R-ACL-056, R-ADMIN-016)<br>tests/integration/acl-p0.test.ts: R-ACL-056: emergency access needs a second administrator, a reason and a time limit; read-<br>tests/e2e/acl-p0-admin.spec.ts: R-ACL-056: emergency access is requested with a reason, approved by a second administrator |
| R-ACL-057 | P1 | Объекты: организация, подразделение, группа, пространство, папка/страница, дочерняя, вложение, версия, шаблон; области «Только я» … | частично | grants on space/page; attachments/versions inherit page; templates org/space scoped; Scopes "Группа", "Подразделение", "Гости по приглашению", "Только я" not offered as presets; no grants on templates/attachments. |  |

### SPACE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-SPACE-009 | P0 | Публикация в общую область — явное действие с предпросмотром аудитории; личное пространство приватно по умолчанию | реализовано | previewMove requiresConfirmation for personal source; personal space private (kind personal) |  |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ACL-058 | P1 | Разрешения: просмотр, комментирование, редактирование, управление структурой, управление доступом, администрирование пространства … | реализовано | actions incl. manage_structure/share/manage_space; PageView export disabled with "Запрещено политикой" hint; SpacePage policy toggles |  |
| R-ACL-059 | P0 | Право редактировать не даёт права выдавать доступ третьим лицам | реализовано | share requires full (ACTION_MIN_LEVEL); tests/integration/acl.test.ts: editor without share right cannot grant access | tests/integration/acl.test.ts: editor without share right cannot grant access (ACL-154, R-ACL-059) |
| R-ACL-060 | P1 | Диалог доступа: область, люди/группы/подразделения, уровень, срок, статус (активен/ожидает/приостановлен/истёк) … | частично | apps/web/src/components/page/ShareDialog.tsx: scope, people/groups, level, expiry, source (via); No status (active/pending/suspended/expired) display; starts_at not exposed in UI. |  |
| R-ACL-061 | P1 | Быстрые действия: пригласить гостя, добавить сотрудника, подразделение, вся компания, роль, срок начала/окончания, приостановить … | частично | ShareDialog (add user/group/org, level, end date, revoke); GroupsSection; grants/bulk API; No start date, suspend/resume of a grant, grouping/filters or bulk assignment with preview in UI. |  |
| R-ACL-062 | P1 | Опасные действия подтверждаются без лишних диалогов, с отменой где безопасно | частично | confirm() on revoke/inheritance/widening; Undo toast for moves; No undo for grant revocation/changes. |  |
| R-ACL-063 | P0 | Временный доступ: начало/конец с часовым поясом, серверное истечение, прекращение выдачи, отмена ссылок и подписок … | реализовано | server-side expiry (hub.checkExpirations), grants.time_zone, reminder to the granter 24 h before expiry (remindExpiringGrants every 10 min, idempotent via reminder_sent_at; POST /admin/grants/remind-expiring); tests/integration/acl-p0.test.ts 'R-ACL-036 R-ACL-063: …'; tests/integration/acl-gaps.test.ts | tests/integration/acl-gaps.test.ts: time-based expiry in live sessions (R-ACL-038, V15-A07, ACL-156, R-ACL-063, R-ACL-003)<br>tests/integration/acl-p0.test.ts: sharing details (R-ACL-051, R-ACL-021, R-ACL-036, R-ACL-063)<br>tests/integration/acl-p0.test.ts: R-ACL-036 R-ACL-063: start, end, time zone, author and reason are stored; the granter is r |

### AUTH

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-AUTH-002 | P0 | Приостановка пользователя блокирует сессии/токены и доступ без удаления профиля, авторства, аудита … | реализовано | apps/server/src/services/org.ts setUserStatus: revoke sessions/tokens/invitations, profile kept; tests/integration/core.test.ts ACL-157 | tests/integration/core.test.ts: suspended user loses access immediately (ACL-157, R-AUTH-002)<br>tests/integration/collab.test.ts: suspending a user closes their live sessions (ACL-157, R-AUTH-002) |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ACL-064 | P0 | Гость — только явно разрешённые объекты и навигационные оболочки родителей; без каталога сотрудников, глобального поиска … | реализовано | guests: explicit grants only, parent shells "…", /directory 403, search/suggest limited to explicitly shared pages (services/search.ts guestSearchScope); tests/integration/acl-gaps.test.ts | tests/integration/acl-gaps.test.ts: guests have no global search (R-ACL-064) |
| R-ACL-065 | P1 | Наследование сверху вниз; для дочерней «Наследовать»/«Настроить отдельно» с предупреждением | реализовано | apps/web/src/components/page/ShareDialog.tsx inheritance toggle with warning; POST /pages/:id/inheritance |  |
| R-ACL-066 | P0 | Формальная модель исключений: запреты приоритетнее разрешений; затем прямые назначения и членства | реализовано | combine: deny > allow, then max of direct/group/org; tests/integration/acl.test.ts: explicit deny wins over group allow; Formal model documented only in code comments. | tests/integration/acl.test.ts: explicit deny wins over group allow (R-ACL-066) |
| R-ACL-067 | P0 | Отсутствие доступа к родителю не раскрывает его метаданные при прямом доступе к дочерней; проверка одинакова в UI и API | реализовано | breadcrumbs hide inaccessible ancestors, explain chain titles "…", tree hasChildren filtered |  |
| R-ACL-068 | P0 | Перемещение между подразделениями/пространствами: прежняя и будущая аудитория, сохраняемые/меняемые права … | реализовано | move preview lists previous/future paths, gained/lost subjects, guests (with loses-access flag, confirmation required when guests lose access) and affected public links; tests/integration/acl-p0.test.ts 'R-SPACE-007 R-ACL-068: …' | tests/integration/acl-p0.test.ts: move preview (R-SPACE-007, R-ACL-068) and concurrent move + edit (E2E-106)<br>tests/integration/acl-p0.test.ts: R-SPACE-007 R-ACL-068: preview lists target path, public links and guests losing access; a |
| R-ACL-069 | P0 | Нельзя незаметно открыть закрытый документ всей компании; повышение видимости подтверждает уполномоченный | реализовано | setGrant org widening -> 409 audience_change + preview, space visibility open requires confirmWiden; tests/integration/acl.test.ts | tests/integration/acl.test.ts: opening the page to the whole company requires explicit confirmation (R-ACL-069) |
| R-ACL-070 | P0 | Копирование статьи не копирует чувствительные приглашения автоматически; отмена перемещения согласованно возвращает структуру и права | реализовано | duplicatePage skips guest grants; move undo payload restores position (rights follow inheritance); No test for duplicate + guest grants. |  |

### ADMIN

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ADMIN-017 | P1 | Экран «Люди и доступ»: пользователи, гости, подразделения, группы, приглашения, приостановленные и истёкшие | реализовано | UsersSection (filters kind/status/role incl. invited/suspended), GroupsSection, ExpiringSection |  |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ACL-071 | P1 | «Кто имеет доступ?» из каждой статьи: эффективная аудитория и причины | реализовано | apps/web/src/components/page/ShareDialog.tsx opened from every page (PageView "Доступ") |  |

### ADMIN

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ADMIN-018 | P0 | «Проверить доступ»: пользователь + документ → может/не может, действия, цепочка наследования без имитации входа | реализовано | admin «Доступ → Проверить доступ» (user + link/ID/title → can/cannot, per-action table, sources, denies, inheritance chain) over GET /access/explain, no impersonation; tests/integration/acl-p0.test.ts 'R-ADMIN-018: …'; tests/e2e/acl-p0-admin.spec.ts 'R-ADMIN-018 V16-S15: …', acl-p0-routes.spec.ts ROUTE-04 | tests/integration/acl-p0.test.ts: effective access for administrators (R-ADMIN-010, V16-S15, R-ADMIN-018)<br>tests/integration/acl-p0.test.ts: R-ADMIN-018: «Проверить доступ» explains a decision without impersonation (no session is c<br>tests/e2e/acl-p0-admin.spec.ts: R-ADMIN-018 V16-S15: the administrator checks a user\'s access to a document — decision, a |
| R-ADMIN-019 | P1 | Поиск, фильтры, пустые состояния, пакетные операции с предпросмотром; администрирование на мобильном/планшете без hover-only | частично | UsersSection search/filters/empty states; mobile layout tests (tests/e2e/mobile.layout.spec.ts) do not cover admin; No batch operations; admin on mobile/tablet not verified. |  |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ACL-072 | P0 | Изменения прав атомарны и проверяются при каждом запросе; после отзыва прекращаются чтение, скачивание, экспорт, поиск … | реализовано | transactions + per-request checks + WS recheck/expiry + export download re-check; tests/integration/acl-gaps.test.ts | tests/integration/acl-gaps.test.ts: stored exports re-check access at download (E-12, V16-S04, R-ACL-080, R-ACL-072) |
| R-ACL-073 | P0 | Кэш и индекс учитывают ACL; подписанные URL ограничены по времени и отзывны | реализовано | search filters by ACL post-query; signed links 5 min, re-checked on use |  |
| R-ACL-074 | P1 | Не обещать отзыв уже скачанных файлов | реализовано | UI does not promise revoking downloaded files; No explicit warning text either. |  |

### AUDIT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-AUDIT-005 | P0 | Аудит прав: кто, когда, кому, объект, право, срок, источник, причина, прежнее и новое значение, результат; доступ ограничен … | реализовано | grant audit details (subject, level, previousLevel, expiresAt, reason, flags); audit_events hash chain + append-only trigger; tests/integration/core.test.ts: is hash-chained and append-only; Revocation entries lack reason. | tests/integration/core.test.ts: is hash-chained and append-only (R-AUDIT-005) |

### HISTORY

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-HISTORY-033 | P0 | Восстановление старой версии документа не откатывает текущие ACL без отдельного админ-действия | реализовано | apps/server/src/routes/revisions.ts#restore (ACL не трогается); нет автотеста |  |

### SPACE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| ACL-151 | P0 | Новый личный документ виден только владельцу | реализовано | tests/integration/core.test.ts: personal space (UX23-199, ACL-151) | tests/integration/core.test.ts: personal space (UX23-199, ACL-151)<br>tests/integration/core.test.ts: each employee gets a private personal space invisible to others and to admins (UX23-199, A |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| ACL-152 | P0 | Сотрудник подразделения видит только разрешённые разделы и документы | реализовано | tests/integration/acl.test.ts: (A04, S13, ACL-152) | tests/integration/acl.test.ts: new employee of a department automatically gets its space (V15-A04, V16-S13, V15-A01, ACL- |
| ACL-153 | P0 | Документ открыт всей компании на просмотр, редактируют только авторы | реализовано | tests/integration/acl.test.ts: company-wide view, editing only by authors (ACL-153) | tests/integration/acl.test.ts: permission levels (ACL-153, ACL-154, A10)<br>tests/integration/acl.test.ts: company-wide view, editing only by authors; view-only cannot modify via API (V15-A10, ACL- |
| ACL-154 | P0 | Право редактирования без права делиться | реализовано | tests/integration/acl.test.ts: editor without share right cannot grant access (ACL-154) | tests/integration/acl.test.ts: permission levels (ACL-153, ACL-154, A10)<br>tests/integration/acl.test.ts: editor without share right cannot grant access (ACL-154, R-ACL-059) |
| ACL-155 | P0 | Гость приглашён на одну статью и не видит другие материалы | реализовано | tests/integration/acl.test.ts: guest invited to one page sees only it (ACL-155) | tests/integration/acl.test.ts: temporary access and guests (ACL-155, ACL-156, ACL-158, A07, S14, ACL-171)<br>tests/integration/acl.test.ts: guest invited to one page sees only it, no directory, no org-wide content (ACL-155, ACL-17 |
| ACL-156 | P0 | Временный доступ прекращается в заданный момент | реализовано | tests/integration/acl.test.ts (HTTP) + tests/integration/acl-gaps.test.ts (live session) | tests/integration/acl.test.ts: temporary access and guests (ACL-155, ACL-156, ACL-158, A07, S14, ACL-171)<br>tests/integration/acl.test.ts: time-limited grant expires on the server without client activity (ACL-156)<br>tests/integration/acl-gaps.test.ts: time-based expiry in live sessions (R-ACL-038, V15-A07, ACL-156, R-ACL-063, R-ACL-003) |

### AUTH

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| ACL-157 | P0 | Приостановленный пользователь теряет доступ с действующих сессий | реализовано | tests/integration/core.test.ts: suspended user loses access immediately (ACL-157); tests/integration/collab.test.ts: suspending a user closes their live sessions | tests/integration/core.test.ts: suspended user loses access immediately (ACL-157, R-AUTH-002)<br>tests/integration/collab.test.ts: suspending a user closes their live sessions (ACL-157, R-AUTH-002) |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| ACL-158 | P1 | Возобновление не продлевает истёкшее приглашение | реализовано | setUserStatus revokes pending invitations on suspend; tests/integration/core.test.ts: reactivation does not resurrect old sessions; Invitation part not asserted by the test. | tests/integration/acl.test.ts: temporary access and guests (ACL-155, ACL-156, ACL-158, A07, S14, ACL-171) |
| ACL-159 | P0 | Права подразделения наследуются дочерними страницами | реализовано | tests/integration/acl.test.ts: 20 child pages canEdit via department grant | tests/integration/acl.test.ts: new employee of a department automatically gets its space (V15-A04, V16-S13, V15-A01, ACL- |
| ACL-160 | P0 | Исключение на дочерней странице отображается и применяется | реализовано | tests/integration/acl.test.ts: restricted child page (A05, ACL-160); SidebarTree lock marker | tests/integration/acl.test.ts: restricted child page is not accessible through parent rights (ACL-160, R-ACL-034, E2E-104 |
| ACL-161 | P1 | Экран объясняет, почему пользователь имеет право | реализовано | tests/integration/acl.test.ts: explains why a user has access (ACL-161) | tests/integration/acl.test.ts: explains why a user has access (ACL-161, V15-A09, V16-S15, R-ACL-078) |
| ACL-162 | P0 | Прямой URL к закрытой статье не раскрывает содержание и метаданные | реализовано | tests/integration/acl.test.ts: 404 for direct URL (ACL-162 comment) | tests/integration/acl.test.ts: new employee of a department automatically gets its space (V15-A04, V16-S13, V15-A01, ACL- |

### SEARCH

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| ACL-163 | P0 | Поиск и подсказки не показывают закрытые статьи | реализовано | apps/server/src/services/search.ts#suggest/search; tests/integration/content.test.ts | tests/integration/content.test.ts: finds by morphology, typo, wrong layout, applies ACL before results and jumps to block (R- |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| ACL-164 | P0 | Превью, вложения, экспорт, история защищены теми же правами | реализовано | tests/integration/content.test.ts (E2E-102, A14, A17, ACL-164); revisions/export/preview use requirePage | tests/integration/content.test.ts: files of a private page are not accessible by direct link; revocation invalidates signed l |
| ACL-165 | P0 | Перемещение в открытое пространство предупреждает о расширении аудитории | реализовано | tests/integration/acl.test.ts: moving changes audience (ACL-165) | tests/integration/acl.test.ts: moving changes audience (ACL-165, ACL-166, A06, UX23-210)<br>tests/integration/acl.test.ts: moving a private page to an open space requires confirmation and shows who gains access; u |
| ACL-166 | P0 | Отмена перемещения возвращает структуру и права | реализовано | tests/integration/acl.test.ts: undo restores (ACL-166) | tests/integration/acl.test.ts: moving changes audience (ACL-165, ACL-166, A06, UX23-210)<br>tests/integration/acl.test.ts: moving a private page to an open space requires confirmation and shows who gains access; u |
| ACL-167 | P0 | Копирование не переносит гостевые приглашения без согласия | реализовано | duplicatePage excludes guest grants (services/pages.ts); No test. |  |
| ACL-168 | P0 | Отзыв прав прекращает поток обновлений и доступ к вложениям | реализовано | tests/integration/collab.test.ts (ACL-168) | tests/integration/collab.test.ts: read-only user cannot write; revoking edit switches session to read-only; revoking view cl |
| ACL-169 | P0 | Две параллельные операции изменения прав не теряют обновления | реализовано | tests/integration/acl.test.ts: parallel grant changes do not lose updates (ACL-169) | tests/integration/acl.test.ts: concurrency and audit of ACL (ACL-169, ACL-172, A13)<br>tests/integration/acl.test.ts: parallel grant changes do not lose updates (one active grant per subject) (ACL-169, ACL-17 |

### ADMIN

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| ACL-170 | P1 | Массовое назначение показывает точную аудиторию до подтверждения | частично | POST /api/v1/grants/bulk preview; POST /pages/:id/access/preview (single grant audience); Bulk preview does not compute exact audience; no bulk UI. |  |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| ACL-171 | P0 | Гость не получает корпоративный доступ через навигацию или API | реализовано | tests/integration/acl.test.ts: guest ... no directory, no org-wide content (ACL-171) | tests/integration/acl.test.ts: temporary access and guests (ACL-155, ACL-156, ACL-158, A07, S14, ACL-171)<br>tests/integration/acl.test.ts: guest invited to one page sees only it, no directory, no org-wide content (ACL-155, ACL-17 |

### AUDIT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| ACL-172 | P0 | Изменение прав фиксируется в защищённом аудите | реализовано | tests/integration/acl.test.ts: audit events for grant changes (ACL-172); audit append-only | tests/integration/acl.test.ts: concurrency and audit of ACL (ACL-169, ACL-172, A13)<br>tests/integration/acl.test.ts: parallel grant changes do not lose updates (one active grant per subject) (ACL-169, ACL-17 |

### HISTORY

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| ACL-173 | P0 | Восстановление версии не восстанавливает старые разрешения | реализовано | apps/server/src/routes/revisions.ts#restore; нет автотеста |  |

### A11Y

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| ACL-174 | P1 | Все операции доступа клавиатурой, с экрана 320px и на планшете | частично | ShareDialog; no test at 320px/keyboard/tablet |  |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ACL-075 | P0 | Готовность прав только после тестов на сервере, API, UI, поиске, вложениях, подписках, конкурентных изменениях, мобильных | реализовано | server/API/search/attachments/subscriptions (acl*.test.ts, collab.test.ts), concurrent move+edit (tests/integration/acl-p0.test.ts E2E-106), browser tests/e2e/acl-p0-ui.spec.ts on desktop and on a Pixel 7 viewport ('R-ACL-075 QA26-24: the same access-control checks on a phone'); The phone check runs in the desktop Chromium project with a Pixel 7 viewport/touch profile (no real devices, D-18). | tests/e2e/acl-p0-ui.spec.ts: QA26-24 R-ACL-075 R-ACL-076: in the browser the UI shows exactly the server rights; no byp<br>tests/e2e/acl-p0-ui.spec.ts: R-ACL-075 QA26-24: the same access-control checks on a phone (Pixel 7 viewport, touch) |
| R-ACL-076 | P0 | Нет скрытых исключений, молчаливого расширения аудитории, рассинхронизации отображаемых и фактических прав … | реализовано | least-privilege decisions consolidated in docs/DECISIONS.md D-24; UI built from server actions; tests/e2e/acl-p0-ui.spec.ts 'QA26-24 R-ACL-075 R-ACL-076: … the UI shows exactly the server rights …' | tests/e2e/acl-p0-ui.spec.ts: QA26-24 R-ACL-075 R-ACL-076: in the browser the UI shows exactly the server rights; no byp |

### QA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| QA26-01 | P0 | Система не готова, пока не проверено каждое доступное действие, визуальный элемент и переход состояния; «в основном работает» не критерий | не реализовано | n/a; no inventory of actions |  |
| QA26-02 | P1 | Качество взаимодействия не хуже Notion подтверждается сравнительными испытаниями; охват: корректность, скорость, понятность, визуал … | требует ручной проверки | n/a; comparison trials not performed |  |
| QA26-03 | P0 | Запись матрицы на каждый экран/элемент/состояние/действие: ID, компонент, состояние, устройство, ввод, предусловия, действие, ожидание … | не реализовано | n/a; no matrix records |  |
| QA26-04 | P0 | Инвентаризация из маршрутов и реестра компонентов; пропущенные действия блокируют релиз | не реализовано | n/a; no route/component inventory |  |
| QA26-05 | P1 | Состояния normal/hover/focus/active/disabled/loading/error/empty/overflow; подсказки, popover, modal, меню, drag-preview; клавиатура … | частично | states styled in ui.css; not verified |  |

### EDITOR

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| QA26-06 | P0 | Проверить ввод, выделение (мышь/клавиатура/палец), клики, Shift, copy/cut/paste plain/rich/HTML/Word/Excel, DnD, форматирование, ссылки … | частично | tests/e2e/editor-p0-*.spec.ts, editor.spec.ts, clipboard.spec.ts, content.spec.ts, undo.spec.ts; Покрыты: ввод, IME, выделение мышью/клавиатурой (слово, абзац, через блоки, блоки), Shift, copy/paste plain/rich/HTML/Word/Excel, форматирование, slash, заголовки, списки, чек-листы, таблицы (все операции, merge, сортировка), изображения, перенос блоков. Не покрыты: DnD блоков мышью, выделение пальцем, 1–4 колонки, ширина колонок макета |  |
| QA26-07 | P0 | Каждое действие в пустом/заполненном документе, на длинных данных, после Undo/Redo, после перезагрузки, при конкурирующих изменениях | частично | collab/resilience тесты (перезагрузка, конкуренция, офлайн); Пять контекстов на каждое действие не реализованы |  |

### TABLE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| QA26-08 | P1 | Таблицы: выравнивание по горизонтали и вертикали, автовысота, перенос длинных слов/ссылок, вставка диапазонов, строки/столбцы … | частично | apps/web/src/editor/menus/TableToolbar.tsx (верт./гор. выравнивание), CSS переносы; Чек-лист таблиц не автоматизирован |  |

### EDITOR

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| QA26-09 | P0 | DnD блоков, изображений, таблиц, вложенных страниц и ветвей: соседние блоки, колонки, статьи, разделы по правам, края с автопрокруткой … | частично | —; Автотестов DnD нет |  |

### TREE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| QA26-10 | P0 | До отпускания — точка вставки и уровень; недопустимы потеря содержимого, циклы, раскрытие доступа, скачки прокрутки, дублирование | реализовано | apps/web/src/layout/SidebarTree.tsx (линия, aria-live «Цель: …»), apps/server/src/services/pages.ts; нет автотеста DnD |  |
| QA26-11 | P1 | Проверить «+» у страницы, раскрытие/сворачивание, breadcrumbs, back/forward, поиск, избранное, пагинацию/виртуализацию, сохранение положения | частично | tests/e2e/content.spec.ts; Из плана проверок автоматизировано только «+»; раскрытие, breadcrumbs, back/forward, избранное, виртуализация не проверяются |  |

### MEDIA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| QA26-12 | P1 | Просмотрщик: открытие/закрытие, колесо по курсору, pan, pinch, pan пальцем, double tap, reset, ориентация, экстремальные пропорции … | частично | tests/e2e/content.spec.ts:'image: upload via file chooser, resize presets, caption, full-screen viewer with zoom'; Покрыты только открытие/кнопка +/0/Esc; жесты/ориентация не автоматизированы |  |

### FILES

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| QA26-13 | P1 | Файлы: иконка, просмотр, скачивание, прогресс, ошибки, повтор, длинные имена, права, мобильное сохранение, недоступный файл … | частично | tests/integration/content.test.ts (attachments); UI-аспекты (иконки, длинные имена, мобильное сохранение) не проверяются |  |

### HISTORY

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| QA26-14 | P0 | Каждая редактирующая операция на обратимость и повтор; последовательности 1/10/100/1000; объединение ввода; границы после перезагрузки … | реализовано | tests/e2e/undo.spec.ts (1 и 10 шагов, форматирование, вставка, структура, совместная работа), tests/e2e/collab-p0-editing.spec.ts (последовательности 100 и 1000, граница после перезагрузки) | tests/e2e/collab-p0-editing.spec.ts: undo/redo sequences of 100 and 1000 steps, transform and delete are reversible; history do<br>tests/e2e/undo.spec.ts: undo/redo of typing: 1 and 10 steps, Ctrl+Shift+Z and Ctrl+Y; result is saved (QA26-14, UX<br>tests/e2e/undo.spec.ts: undo/redo of formatting keeps the text and the selection (QA26-14, SC-11, R-HISTORY-011, R<br>… ещё 3 |
| QA26-15 | P0 | Восстановление не уничтожает последующие версии, аудит не подменяется; документ и блоки, после удаления/архивации … | частично | tests/integration/collab.test.ts, tests/integration/gaps.test.ts (pre-restore); Нет проверок после удаления/архивации, при совместной работе, очистки по сроку | tests/integration/gaps.test.ts: restore saves the current state as a "pre-restore" revision (QA26-15) |

### ARCHIVE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| QA26-16 | P0 | Round-trip: репрезентативная база → экспорт → открытие без приложения → импорт в чистую установку → машинное сравнение дерева … | реализовано | tests/integration/archive.test.ts: machine comparison after restore into clean installation | tests/integration/archive.test.ts: export → readable without the app → restore into a clean installation → verified (V18-A05, |

### IMPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| QA26-17 | P0 | ZIP/Markdown и форматы: кириллица, спецсимволы, длинные имена, пустые/большие, битый архив, частичный импорт, отмена, повтор без дублей … | реализовано | tests/integration/io-p0-import.test.ts: long Cyrillic names with special characters, an empty file, a large file and a broken file in one batch … selective commit; tests/integration/import-export.test.ts: broken archive, cancel, idempotent retry | tests/integration/io-p0-import.test.ts: batch edge cases (QA26-17)<br>tests/integration/io-p0-import.test.ts: long Cyrillic names with special characters, an empty file, a large file and a broken file |

### BACKUP

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| QA26-18 | P0 | Реальное восстановление из бэкапа в изолированном окружении с измерением RPO/RTO, целостности и прав | реализовано | tests/resilience/backup-restore.test.ts (timings logged), docs/BACKUP_RESTORE.md §6 measurements; Repeat on target infrastructure | tests/resilience/backup-restore.test.ts: backup → restore drill (SC-30, AT-60, AT-87, V16-S20, OPS-011, QA26-18) |

### COLLAB

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| QA26-19 | P0 | 2/5/20 редакторов, один абзац, перемещение/удаление блока, одна ячейка, restore, изменение прав в сессии | реализовано | tests/integration/collab-p0.test.ts (2, 5 and 20 editors …; одна ячейка; перемещения/удаление), tests/integration/collab.test.ts (restore, изменение прав в сессии) | tests/integration/collab-p0.test.ts: many editors, tables, moves (QA26-19, AT-56, SC-25, R-COLLAB-024, R-COLLAB-032)<br>tests/integration/collab-p0.test.ts: 2, 5 and 20 editors type into one paragraph at the same time: every character survives and<br>tests/integration/collab-p0.test.ts: two editors change one table cell and neighbouring rows while a third adds a row; the merg |
| QA26-20 | P0 | Сбои: сеть, высокий RTT, потери, Wi-Fi/LTE, закрытие вкладки, обновление, рестарт сервера, истечение сессии, повторная доставка … | частично | tests/integration/collab-p0.test.ts (высокий RTT/джиттер/обрывы, истечение сессии, спящий ноутбук), tests/e2e/collab-p0-offline.spec.ts (закрытие вкладки, перезагрузка, смена сети offline→online), tests/resilience/crash-restart.test.ts, tests/integration/collab.test.ts (повторная доставка, рестарт сервера); Не проверены смена ведущего узла БД/экземпляра под нагрузкой и реальная смена Wi-Fi/LTE (ограничение окружения) | tests/integration/collab-p0.test.ts: session expiry, sleep, unreliable network (R-COLLAB-021, QA26-20)<br>tests/integration/collab-p0.test.ts: session expires during editing: unsent edits are never shown as saved and are delivered af<br>tests/integration/collab-p0.test.ts: sleeping laptop: a silently dead connection is detected by the acknowledgement timeout, ed<br>… ещё 1 |

### QA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| QA26-21 | P1 | Сравнение с Notion: создать, вложить, оформить, перенести блок, таблица, изображение, поделиться, найти, восстановить; время, действия … | требует ручной проверки | n/a; Notion comparison not performed |  |

### PERF

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| QA26-22 | P1 | SLO (калибруемые): локальный отклик p95 ≤100 мс; контекстная панель p95 ≤150 мс; загруженная страница p95 ≤500 мс; ~60 fps … | частично | tests/e2e/collab.spec.ts "typing latency on a long document stays within budget": 400 paragraphs (~5k words), 40 samples, execCommand insertText -> next rAF, no CPU/network throttling; last run p95≈31 ms; panel/page-load/fps not measured |  |

### QA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| QA26-23 | P1 | 320–1920 px, zoom 100/125/150/200%, темы, Safari/Chrome/Firefox/Edge, iOS/Android, длинные строки, переполнение, меню у границ … | частично | tests/e2e/visual.spec.ts; zoom only 200% (no 125/150); only Chromium is installed (playwright.config.ts, DECISIONS D-18) |  |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| QA26-24 | P0 | Роли, наследование, личные/гостевые/временные доступы, отзыв в сессии, вложения, поиск, экспорт под ACL; без обходов через URL/API | реализовано | tests/integration/acl.test.ts, acl-gaps.test.ts, acl-p0.test.ts, collab.test.ts, content.test.ts, import-export.test.ts; browser and phone-viewport checks tests/e2e/acl-p0-ui.spec.ts (no bypass via URL/API, revocation in session) | tests/e2e/acl-p0-ui.spec.ts: QA26-24 R-ACL-075 R-ACL-076: in the browser the UI shows exactly the server rights; no byp<br>tests/e2e/acl-p0-ui.spec.ts: R-ACL-075 QA26-24: the same access-control checks on a phone (Pixel 7 viewport, touch) |

### OPS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| QA26-25 | P0 | Нагрузочное, soak, стресс, регрессия, доступность, отказоустойчивость; наблюдаемость, алерты, журналы без секретов, миграции, откат … | частично | tests/resilience/* (crash, DB loss, storage failure, backup drill), CI runs them; No load/soak/stress test protocols |  |
| QA26-26 | P1 | Тестирование на prod-подобном окружении, затем пилот с реальными сотрудниками | процесс/документ | —; Prod-like test and pilot with employees are organisational |  |

### QA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| QA26-27 | P0 | Статус PASS/FAIL/BLOCKED/N/A с обоснованием, ссылкой на запуск и версией сборки; CI, E2E, visual regression, ручной UX-аудит … | не реализовано | n/a; no PASS/FAIL/BLOCKED per scenario with build/run links |  |

### PROCESS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| QA26-28 | P0 | Перед релизом: 100% действий покрыто; 100% критичных пройдено; 0 blocker/critical; 0 сценариев потери данных, обхода ACL … | частично | scripts/release-gate.py (P0 open → fail; unassessed → fail); gate defined but not met; "100% действий покрыто" not measurable (no action inventory) |  |
| QA26-29 | P1 | Сдать отчёт о покрытии, протоколы восстановления, измерения производительности, реестр решений, руководство администратора, runbooks | частично | docs/OPERATIONS.md, BACKUP_RESTORE.md, SECURITY.md, DECISIONS.md, TEST_MATRIX.md, PERFORMANCE.md; coverage report per run missing |  |

### QA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| QA26-30 | P0 | Pairwise по осям роль × устройство/ввод × контент × сеть × параллельность × история × размер … | реализовано | tests/support/pairwise.ts (all-pairs generator); tests/unit/qa-pairwise.test.ts "QA26-30: covers every pair of role × device/input × content × network × concurrency × history × size…" (7 200 combinations → <40 cases) + property test; tests/integration/qa-invariants.test.ts runs the server-side pairwise matrix (role × network × concurrency × content × history × size, 13 cases) in CI; device/input axis is only generated, not executed (browser matrix is Chromium-only) | tests/integration/qa-invariants.test.ts: pairwise matrix with product invariants (QA26-30, QA26-31)<br>tests/integration/qa-invariants.test.ts: QA26-30: the generated matrix covers every pair of server-side axes<br>tests/unit/qa-pairwise.test.ts: pairwise test-case generator (QA26-30)<br>… ещё 2 |
| QA26-31 | P0 | Инварианты: данные не исчезают; порядок/иерархия корректны; права не расширяются без подтверждения; round-trip сохраняет семантику … | реализовано | tests/integration/qa-invariants.test.ts "QA26-31 case n/13: …" checks after every case: nothing acknowledged lost/duplicated, block order preserved, readers' changes never reach the server and never show "saved", replicas converge to the server copy, versions survive restore; Markdown round-trip invariants live in tests/unit/markdown.test.ts (property-based) | tests/integration/qa-invariants.test.ts: pairwise matrix with product invariants (QA26-30, QA26-31)<br>tests/integration/qa-invariants.test.ts: QA26-31 case ${idx + 1}/${CASES.length}: ${caseName(c)}<br>tests/unit/qa-pairwise.test.ts: invariant helpers (QA26-31)<br>… ещё 1 |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ACL-077 | P0 | Права задаются на уровне пространства и групп подразделений; статьи наследуют; исключения осознанно, с маркировкой и объяснением | реализовано | space/group grants, inheritance, exceptions marked (hasExplicitGrants) and explained; tests/integration/acl-gaps.test.ts | tests/integration/acl-gaps.test.ts: explicit exceptions are marked (R-ACL-032, R-ACL-077) |

### SPACE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-SPACE-010 | P0 | Типы: личное (закрыто), общекорпоративное, подразделение, закрытое (по приглашению), гостевой проект (минимум доступа) | реализовано | SPACE_KINDS + CreateSpaceDialog (Проект/Подразделение/Закрытое/Общекорпоративное for admins, visibility, guests policy in Settings); tests/e2e/acl-p0-spaces.spec.ts 'R-SPACE-001 R-SPACE-010 R-ADMIN-020 …', tests/e2e/acl-p0-routes.spec.ts ROUTE-04 (guest-enabled department space) | tests/e2e/acl-p0-spaces.spec.ts: R-SPACE-001 R-SPACE-010 R-ADMIN-020: a space is created in the UI and a department gets ac |
| R-SPACE-011 | P1 | Видимость: открытое, закрытое с видимым названием, приватное, невидимое посторонним | реализовано | visibility open/closed/private enforced in GET /spaces; SpacePage SettingsTab |  |
| R-SPACE-012 | P2 | Админ задаёт шаблон пространства и права по умолчанию | не реализовано | -; No admin-defined space template / default rights. |  |

### PAGE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PAGE-033 | P0 | Статья кнопкой «+» у раздела без выбора прав; наследует родителя, появляется в дереве, фокус в названии; автосохранение и черновик | реализовано | apps/server/src/services/pages.ts#createPage (наследование), tests/e2e/editor.spec.ts | tests/e2e/editor.spec.ts: create page, type with Markdown shortcuts, "Сохранено" only after server ack, survives rel |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-UI-069 | P1 | Дочерняя статья, DnD, копирование, публикация — минимум действий; исключения доступа скрыты до запроса | частично | tests/e2e/content.spec.ts child page via "+"; DnD/copy/publish action counts not measured |  |

### ADMIN

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ADMIN-020 | P0 | Сотрудник → подразделение/группа/роль → автоматический доступ к пространствам | реализовано | department/group grants on spaces from the UI (CreateSpaceDialog members, SpaceMembersEditor) + userSubjects; tests/e2e/acl-p0-spaces.spec.ts 'R-SPACE-001 R-SPACE-010 R-ADMIN-020 …' (department member sees the space and can create pages, outsider cannot) | tests/integration/acl.test.ts: new employee of a department automatically gets its space (V15-A04, V16-S13, V15-A01, ACL-<br>tests/e2e/acl-p0-spaces.spec.ts: R-SPACE-001 R-SPACE-010 R-ADMIN-020: a space is created in the UI and a department gets ac |
| R-ADMIN-021 | P1 | Перевод между отделами пересчитывает права с предпросмотром | реализовано | TransferDialog with transfer-preview diff |  |
| R-ADMIN-022 | P1 | Временные приглашения, гости, приостановка, отзыв сессий, массовое управление группами | частично | guest invitations with expiry, suspend, revoke sessions (UsersSection), group membership with expiry; No bulk group management. |  |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ACL-078 | P1 | Экран «Почему пользователь видит этот документ?» с цепочкой наследования и исключений | реализовано | GET /access/explain inheritanceChain + apps/web/src/components/page/ShareDialog.tsx ExplainBox "Цепочка наследования" | tests/integration/acl.test.ts: explains why a user has access (ACL-161, V15-A09, V16-S15, R-ACL-078) |

### AUDIT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-AUDIT-006 | P0 | Журнал изменений прав с возможностью аудита | реализовано | grant.* events + AuditSection filters (action/actor/target/date) + /audit/verify |  |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ACL-079 | P0 | Нельзя незаметно расширять аудиторию переносом; перед расширением — конкретное изменение и подтверждение | реализовано | movePage requires confirmAudienceChange with concrete gained list; tests/integration/acl.test.ts | tests/integration/acl.test.ts: moving a private page to an open space requires confirmation and shows who gains access; u |
| R-ACL-080 | P0 | После отзыва нет доступа через вложения, поиск, миниатюры, API, экспорт, историю, кэш; запрет при неоднозначности | реализовано | attachments, search, tiles, API, history, events, stored exports re-checked; tests/integration/acl-gaps.test.ts | tests/integration/acl-gaps.test.ts: stored exports re-check access at download (E-12, V16-S04, R-ACL-080, R-ACL-072) |

### SEARCH

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-SEARCH-018 | P0 | Приватные материалы не включаются в общие индексы и уведомления | частично | apps/server/src/jobs/worker.ts#indexPage, apps/server/src/services/search.ts; Личные материалы лежат в общей таблице search_index и отсекаются только фильтром ACL при запросе |  |

### COLLAB

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-COLLAB-048 | P0 | Подтверждённые операции в устойчивом журнале; идемпотентная синхронизация; контроль версий/конфликтов | реализовано | apps/server/src/collab/hub.ts |  |

### OFFLINE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-OFFLINE-011 | P0 | Локальная очередь офлайн; статус «сохранено/синхронизируется/требуется внимание» | реализовано | packages/shared/src/collab-client.ts, apps/web/src/components/page/SyncStatus.tsx | tests/integration/collab.test.ts: offline edits are kept locally and synchronised after reconnect, concurrent with others (S |

### HISTORY

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-HISTORY-034 | P0 | История операций, версии, корзина; восстановление блока/страницы/дерева с сохранением последующих ревизий | реализовано | apps/server/src/routes/revisions.ts, apps/server/src/services/pages.ts#restorePage; tests/integration/collab.test.ts, tests/integration/core.test.ts | tests/integration/core.test.ts: trash and restore a branch with children (D-05, SC-29, V17-F08, E-05, R-HISTORY-003, R-HIS<br>tests/integration/collab.test.ts: restoring a revision creates a new revision and keeps concurrent edits (HIST-189, COLLAB-1<br>tests/integration/history-tree.test.ts: reconstructs the state after any journal operation and restores it as a new reversible rev |

### BACKUP

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-BACKUP-019 | P0 | Регулярная проверка бэкапов реальным восстановлением, контрольными суммами и сравнением импорт-экспорт-импорт | частично | tests/resilience/backup-restore.test.ts, verify-backup.sh, archive round trip tests/integration/archive.test.ts; Regular production verification is an operational process | tests/resilience/backup-restore.test.ts: restores content, attachment bytes, history, permissions and the audit chain into a new in<br>tests/resilience/io-p0-partial-restore.test.ts: space restore from a backup restored into a temporary database: impact preview with per-pa |

### UI

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-UI-070 | P1 | Контекстные действия только когда нужны; стрелка раскрывает, название открывает, «+» создаёт дочернюю | реализовано | tests/e2e/content.spec.ts "sidebar tree: create child page via +"; SidebarTree chevron toggles, title opens |  |
| R-UI-071 | P1 | Умные значения по умолчанию, последняя позиция, быстрый поиск, клавиатура, отмена, понятная обратная связь | частично | quick switcher, keyboard, undo toasts; not verified |  |
| R-UI-072 | P1 | Без обязательных диалогов для типовых операций; предупреждения только при необратимом действии или изменении видимости | частично | confirmation only on visibility widening (tests/integration/acl.test.ts); no audit of dialogs in typical ops |  |

### ORG

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ORG-005 | P0 | Новый сотрудник видит нужные пространства | реализовано | tests/integration/acl.test.ts: new employee of a department automatically gets its space | tests/integration/acl.test.ts: new employee of a department automatically gets its space (V15-A04, V16-S13, V15-A01, ACL- |

### ADMIN

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ADMIN-023 | P1 | Перевод между отделами | реализовано | tests/integration/acl.test.ts: transfer preview shows spaces gained and lost | tests/integration/acl.test.ts: transfer preview shows spaces gained and lost (V15-A16, R-ADMIN-006, R-ADMIN-023) |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ACL-081 | P0 | Создание 100 дочерних страниц без ручной настройки ACL | реализовано | tests/integration/acl.test.ts: create 20 child pages without any ACL configuration; Test uses 20 pages, not 100. | tests/integration/acl.test.ts: new employee of a department automatically gets its space (V15-A04, V16-S13, V15-A01, ACL- |
| R-ACL-082 | P0 | Приглашение гостя на один раздел | реализовано | tests/integration/acl.test.ts: guest invited to one page sees only it | tests/integration/acl.test.ts: guest invited to one page sees only it, no directory, no org-wide content (ACL-155, ACL-17 |
| R-ACL-083 | P0 | Отзыв доступа при открытой странице | реализовано | tests/integration/collab.test.ts: revoking view closes it | tests/integration/collab.test.ts: read-only user cannot write; revoking edit switches session to read-only; revoking view cl |

### SEARCH

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-SEARCH-019 | P0 | Скрытое пространство отсутствует в поиске и уведомлениях | реализовано | apps/server/src/services/search.ts (ACL), apps/server/src/routes/collab.ts (events only for visible spaces) |  |

### ACL

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ACL-084 | P0 | Перенос приватной страницы в общую с предупреждением | реализовано | tests/integration/acl.test.ts: moving a private page to an open space requires confirmation | tests/integration/acl.test.ts: moving a private page to an open space requires confirmation and shows who gains access; u |

### COLLAB

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-COLLAB-049 | P0 | Одновременный перенос и правка | реализовано | apps/web/src/editor/extensions/conflictGuard.ts (reason moved), apps/server/src/services/pages.ts#movePage; tests/e2e/collab-p0-editing.spec.ts (a block is moved by one editor while another edits it …), tests/integration/core.test.ts (COLLAB-194); Перенос блока = удаление+вставка копии в y-prosemirror: правка исходного блока возвращается из конфликтной копии одним действием; перенос страницы и правка независимы | tests/integration/conflicts.test.ts: conflict copies (E-04, R-COLLAB-045, R-COLLAB-049)<br>tests/e2e/collab-p0-editing.spec.ts: a block is moved by one editor while another edits it: the edit is kept as a conflict copy |
| R-COLLAB-050 | P0 | Сбой сети и перезапуск сервера во время редактирования | реализовано | tests/resilience/crash-restart.test.ts, tests/resilience/db-connection-loss.test.ts, tests/integration/collab.test.ts | tests/integration/collab.test.ts: server restart during a session loses no acknowledged change and resends the rest (OPS-009 |

### ARCHIVE

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-ARCHIVE-018 | P0 | Восстановление удалённого дерева | реализовано | tests/integration/core.test.ts: trash and restore a branch with children |  |

### EXPORT

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-EXPORT-026 | P0 | Импорт/экспорт с вложениями, ACL и ссылками | реализовано | tests/integration/archive.test.ts | tests/integration/archive.test.ts: export → readable without the app → restore into a clean installation → verified (V18-A05, |

### QA

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-QA-039 | P1 | Сравнение с Notion на ежедневных задачах; время, клики, ошибки, потери, визуальные дефекты | требует ручной проверки | n/a; Notion comparison not performed |  |

### PROCESS

| ID | Пр. | Требование | Статус | Реализация / доказательство | Тесты |
|---|---|---|---|---|---|
| R-PROCESS-054 | P0 | Релиз запрещён при непроверенном критичном сценарии или риске утраты данных | реализовано | scripts/release-gate.py blocks release while any P0 requirement is open or any requirement unassessed |  |
