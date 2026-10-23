# Матрица тестирования

Как устроено тестирование, какие уровни проверяют какие свойства и где покрытие пока недостаточно. Полный перечень тестов ниже сгенерирован из исходников; статус каждого требования — в `REQUIREMENTS_TRACEABILITY.md`.

## Уровни

| Уровень | Инструмент | Окружение | Что доказывает |
|---|---|---|---|
| Юнит | vitest | Node | Чистые функции: конвертеры Markdown (включая property-based на fast-check), TOTP по векторам RFC 6238, честность статуса синхронизации клиента |
| Интеграционный | vitest + реальный PostgreSQL 16, сервер в процессе | шаблонная БД, клон на файл | Контракты API, права (наследование, запреты, гости, сроки), дерево и перемещения под конкуренцией, совместное редактирование (сходимость, ACK после фиксации, идемпотентность, рандомизированные разрывы), файлы, OCR, поиск, публикация, импорт/экспорт, архив и восстановление, заголовки безопасности |
| Отказоустойчивость | vitest + отдельные процессы сервера | реальные сбои | Убийство процесса во время правки, обрыв соединений с БД, отказ хранилища при загрузке, учение «бэкап → восстановление → проверка» |
| E2E | Playwright (Chromium) | собранный клиент + сервер на чистой БД | Пользовательские сценарии в браузере: создание и правка, честный статус «Сохранено», офлайн и восстановление, двое пользователей, отзыв прав «на лету», история, поиск с переходом к блоку, вставка из Excel/Markdown, изображения и просмотрщик, дерево, комментарии, задержка ввода, раскладки 320–1920 px × светлая/тёмная тема, реальный 200 % зум, WCAG 2.1 AA (axe), клавиатура, reduced motion, эталонные скриншоты |

## Матрица «область × условие»

Знаки: ● — покрыто автотестом, ◐ — частично, ○ — не покрыто (см. «Пробелы»).

| Область | Норма | Конкуренция (2+ пользователя) | Сеть: офлайн/обрыв | Права: отзыв/запрет | Отказ сервера/БД | Мобильный/зум | Доступность |
|---|---|---|---|---|---|---|---|
| Редактор: текст, блоки, Markdown-сокращения | ● | ● | ● | ● | ● | ◐ | ● |
| Таблицы | ● | ◐ | ○ | ○ | ○ | ○ | ◐ |
| Изображения и файлы | ● | ○ | ◐ | ● | ● | ◐ | ◐ |
| Дерево страниц, перемещения | ● | ● | ○ | ● | ○ | ● | ● |
| История и восстановление | ● | ◐ | ○ | ● | ○ | ○ | ○ |
| Комментарии | ● | ◐ | ○ | ● | ○ | ○ | ○ |
| Поиск | ● | — | ○ | ● | ○ | ● | ● |
| Импорт/экспорт | ● | — | ○ | ● | ○ | ○ | ◐ |
| Архив организации, резервные копии | ● | — | — | ● | ● | — | — |
| Администрирование и аудит | ● | ● | — | ● | ○ | ● | ● |

## Известные пробелы покрытия (честно)

* Только Chromium: Firefox, Safari/WebKit и реальные мобильные устройства недоступны в окружении (ручной чек-лист в `UX_ACCEPTANCE.md`).
* Буфер обмена в E2E эмулируется событием `paste` с синтетическим `DataTransfer`; вставка из реальных Word/Excel/Google Docs проверяется фикстурами, а не живыми приложениями.
* Нагрузка 100 читателей + 20 редакторов — скрипт `scripts/load/collab-load.mjs` (запуск вручную, не в CI); прогон на общем контейнере: 0 потерь, но p95 синхронизации ≈ 1,4 с (`PERFORMANCE.md`). 100 тыс. страниц не проверялось — нужен стенд.
* Задержка ввода: `tests/e2e/perf-typing.spec.ts` (11 тыс. слов, CPU 4×, 240 замеров, p95/p99) — бюджет 50/100 мс в этом окружении **не выполнен**, проверяется только при `KB_PERF_ENFORCE=1`; целостность (0 потерянных символов, курсор) проверяется всегда. Подробно — `PERFORMANCE.md`.
* Неполные E2E: окно «Поделиться», корзина, шаблоны, импорт, экспорт и администрирование проверены интеграционно и axe-аудитом, но без сквозных пользовательских сценариев.
* Конфликт «правка блока ↔ удаление блока другим автором» сейчас не создаёт копию конфликта (тест фиксирует текущее поведение) — открытый P0.

## Каталог автоматических тестов (сгенерировано)

Всего автоматических тестов: **506** (без учёта параметризованных повторов и 12 комбинаций раскладок).


Сгенерировано `python3 scripts/requirements/test_matrix.py`. ID требований в названиях связывают тест с реестром (см. `REQUIREMENTS_TRACEABILITY.md`).

Результаты (QA26-27): сборка `30e43fc22ef3` (рабочая копия с изменениями), сведены 2026-10-23T06:02:04.584Z; запуски: e2e 2026-10-23T05:33:31.910Z (local:test-results/qa/playwright.json@2026-10-23T05:33:31.910Z); e2e 2026-10-23T05:56:28.264Z (local:test-results/qa/playwright-qa-actions.json@2026-10-23T05:56:28.264Z); vitest 2026-10-23T05:59:03.771Z (local:test-results/qa/vitest.json@2026-10-23T05:59:03.771Z). Итог по тестам: BLOCKED 18, FAIL 13, N/A 1, PASS 495. Тест, которого нет в запусках, — BLOCKED.

Покрытие действий (QA26-03, R-QA-006): 367 из 1030 действий (35.6%), критичных 171 из 293; матрица действие × тест × состояние — `docs/qa/ACTION_MATRIX.md`, контракт состояний операций — `docs/qa/OPERATION_CONTRACT.md`, дефекты — `docs/qa/DEFECTS.md`.

### Юнит-тесты (vitest)

Запуск: `npm run test:unit`. Тестов: **90**.

| Файл | Группа | Тест | Результат |
|---|---|---|---|
| `tests/unit/auth-hardening.test.ts` | password policy | requires 12 characters, letters and digits | PASS |
| `tests/unit/auth-hardening.test.ts` | password policy | refuses common passwords padded with digits and punctuation | PASS |
| `tests/unit/auth-hardening.test.ts` | secret box | round-trips and never stores the plaintext | PASS |
| `tests/unit/auth-hardening.test.ts` | secret box | rejects a wrong key, another purpose or a tampered value; reads legacy plaintext | PASS |
| `tests/unit/auth-hardening.test.ts` | secret box | an undecryptable secret never verifies a TOTP code (no empty-key HMAC) | PASS |
| `tests/unit/clipboard-fidelity.test.ts` | Word 365 (R-CLIPBOARD-020, UX13-02) | HTML: five heading levels, three-level list, numbered list, table, link without trackers, quote; no Office junk | PASS |
| `tests/unit/clipboard-fidelity.test.ts` | Word 365 (R-CLIPBOARD-020, UX13-02) | HTML + RTF of the same copy: the picture is taken from the RTF, stays in place with its caption | PASS |
| `tests/unit/clipboard-fidelity.test.ts` | Word 365 (R-CLIPBOARD-020, UX13-02) | RTF only: the same structure as the HTML flavour (headings from outline levels, lists by level, table, link, picture) | PASS |
| `tests/unit/clipboard-fidelity.test.ts` | Word 365 (R-CLIPBOARD-020, UX13-02) | RTF details: \\uN with fallback, \\\'hh in the ANSI code page, escaped braces, bold toggles | BLOCKED (не запускался) |
| `tests/unit/clipboard-fidelity.test.ts` | Google Docs, mail, web pages (R-CLIPBOARD-020, R-CLIPBOARD-024, SC-06) | Google Docs: H1–H6, bold / italic from styles, nested lists written as sibling lists, table, redirect links unwrapped | PASS |
| `tests/unit/clipboard-fidelity.test.ts` | Google Docs, mail, web pages (R-CLIPBOARD-020, R-CLIPBOARD-024, SC-06) | Outlook mail: paragraphs, list, table, quoted message, tracking parameters and pixels removed, cid: logo reported | PASS |
| `tests/unit/clipboard-fidelity.test.ts` | Google Docs, mail, web pages (R-CLIPBOARD-020, R-CLIPBOARD-024, SC-06) | web article: headings, figure with caption, nested numbered list, quote, code with language, table; navigation, scripts, buttons, counters removed | PASS |
| `tests/unit/clipboard-fidelity.test.ts` | Google Docs, mail, web pages (R-CLIPBOARD-020, R-CLIPBOARD-024, SC-06) | redirect wrappers are unwrapped only for http(s) targets | PASS |
| `tests/unit/clipboard-html.test.ts` | paste sanitizer (R-CLIPBOARD-009, R-CLIPBOARD-010, R-CLIPBOARD-022) | R-CLIPBOARD-022: removes scripts, event handlers, iframes and arbitrary inline styles | PASS |
| `tests/unit/clipboard-html.test.ts` | paste sanitizer (R-CLIPBOARD-009, R-CLIPBOARD-010, R-CLIPBOARD-022) | R-CLIPBOARD-010: Word HTML loses Office junk but keeps headings, text, tables (no lost cells) | PASS |
| `tests/unit/clipboard-html.test.ts` | paste sanitizer (R-CLIPBOARD-009, R-CLIPBOARD-010, R-CLIPBOARD-022) | R-CLIPBOARD-009: Google Docs bold wrapper with font-weight:normal does not make everything bold | PASS |
| `tests/unit/clipboard-html.test.ts` | paste sanitizer (R-CLIPBOARD-009, R-CLIPBOARD-010, R-CLIPBOARD-022) | keeps own palette colours given as rgb(), own fonts and sizes; drops foreign ones | PASS |
| `tests/unit/clipboard-html.test.ts` | Word lists (AT-44, UX13-02, R-CLIPBOARD-020) | AT-44: Word list paragraphs become nested bullet and numbered lists | PASS |
| `tests/unit/clipboard-html.test.ts` | Word lists (AT-44, UX13-02, R-CLIPBOARD-020) | converts lists inside containers and keeps non-list paragraphs in place | PASS |
| `tests/unit/clipboard-html.test.ts` | images in pasted HTML (R-CLIPBOARD-020, SC-06) | SC-06: embedded images are extracted for upload, local Word file paths are reported, tracking pixels dropped | PASS |
| `tests/unit/clipboard-html.test.ts` | images in pasted HTML (R-CLIPBOARD-020, SC-06) | turns absolute links and images of this instance back into in-app URLs | PASS |
| `tests/unit/clipboard-html.test.ts` | copied HTML (R-CLIPBOARD-004, R-CLIPBOARD-018) | R-CLIPBOARD-018: makes URLs absolute and removes comment anchors and DOM ids, keeps block structure attributes | PASS |
| `tests/unit/clipboard-internal.test.ts` | internal clipboard format (R-CLIPBOARD-018) | round-trips node types, block ids and attributes HTML cannot carry (column widths, image size/alignment) | PASS |
| `tests/unit/clipboard-internal.test.ts` | internal clipboard format (R-CLIPBOARD-018) | leaks nothing: comment threads of the source page and titles of pages the reader cannot open are not in it | PASS |
| `tests/unit/clipboard-internal.test.ts` | internal clipboard format (R-CLIPBOARD-018) | is untrusted on paste: another origin, garbage, schema-invalid content are refused; unsafe URLs are cleaned | PASS |
| `tests/unit/clipboard-internal.test.ts` | internal clipboard format (R-CLIPBOARD-018) | attachment references are rewritten to the copies of the target page (attribute values containing the id too) | PASS |
| `tests/unit/clipboard-internal.test.ts` | internal clipboard format (R-CLIPBOARD-018) | a text fragment (open slice) keeps its openness | PASS |
| `tests/unit/collab-client.test.ts` | offline status honesty (R-OFFLINE-003, R-OFFLINE-005, R-OFFLINE-006) | "saved on this device" appears only after the local write has completed | PASS |
| `tests/unit/collab-client.test.ts` | offline status honesty (R-OFFLINE-003, R-OFFLINE-005, R-OFFLINE-006) | a full or broken local store is reported as an error, never as saved | PASS |
| `tests/unit/collab-client.test.ts` | offline status honesty (R-OFFLINE-003, R-OFFLINE-005, R-OFFLINE-006) | acknowledged operations are removed from the store only after their write finished | PASS |
| `tests/unit/collab-p0.test.ts` | backpressure (R-COLLAB-019) | never more than maxInflightOps unacknowledged operations; the rest follows as ACKs arrive, in order, each exactly once (R-COLLAB-019) | PASS |
| `tests/unit/collab-p0.test.ts` | backpressure (R-COLLAB-019) | a full socket send buffer pauses sending until it drains; a byte budget limits large operations in flight (R-COLLAB-019) | PASS |
| `tests/unit/collab-p0.test.ts` | local journal before sending (R-OFFLINE-003, R-OFFLINE-005) | an operation is sent to the server only after it was written to the local journal (R-OFFLINE-005, R-OFFLINE-003) | PASS |
| `tests/unit/collab-p0.test.ts` | local journal before sending (R-OFFLINE-003, R-OFFLINE-005) | if the local journal cannot be written, the operation is still sent (the server is then the only copy) and the status is honest (R-OFFLINE-006) | PASS |
| `tests/unit/collab-p0.test.ts` | server storage failure is visible (AT-59, R-COLLAB-017) | persist_failed turns the status into an error with an explanation (never "Сохранение…" forever), retries, and clears after a durable ACK (AT-59, R-COLLAB-017) | PASS |
| `tests/unit/collab-p0.test.ts` | transport fallback (R-COLLAB-039) | after repeated WebSocket failures the provider switches to the HTTP channel without waiting out the backoff (R-COLLAB-039) | PASS |
| `tests/unit/collab-p0.test.ts` | transport fallback (R-COLLAB-039) | a channel that opens but never delivers SYNC is treated as broken (proxy swallowing frames) (R-COLLAB-039) | PASS |
| `tests/unit/editor-block-drop.test.ts` | block drag-and-drop model (R-EDITOR-069/075/076) | moves a block before / after another one, keeping its id and content; one transaction | PASS |
| `tests/unit/editor-block-drop.test.ts` | block drag-and-drop model (R-EDITOR-069/075/076) | dropping right where the blocks are is a no-op; into itself is invalid with a reason | PASS |
| `tests/unit/editor-block-drop.test.ts` | block drag-and-drop model (R-EDITOR-069/075/076) | several selected blocks move together in order (block range or text selection over blocks) | PASS |
| `tests/unit/editor-block-drop.test.ts` | block drag-and-drop model (R-EDITOR-069/075/076) | between columns, out of a column, into a column; a column never becomes empty | PASS |
| `tests/unit/editor-block-drop.test.ts` | block drag-and-drop model (R-EDITOR-069/075/076) | column sets cannot go into a column; schema-invalid targets explain why | PASS |
| `tests/unit/editor-block-drop.test.ts` | block drag-and-drop model (R-EDITOR-069/075/076) | inside a callout / quote / toggle: appended at the end of its content | PASS |
| `tests/unit/editor-block-drop.test.ts` | block drag-and-drop model (R-EDITOR-069/075/076) | images, tables and nested lists move whole with ids and attributes | PASS |
| `tests/unit/editor-block-drop.test.ts` | block drag-and-drop model (R-EDITOR-069/075/076) | Alt/Ctrl-drag copies: source stays, the copy has no ids (fresh ids are assigned by the editor) | PASS |
| `tests/unit/editor-block-drop.test.ts` | block drag-and-drop model (R-EDITOR-069/075/076) | keyboard: Alt+Shift+↑ on the first block of a column / callout leaves the container | PASS |
| `tests/unit/editor-convert.test.ts` | block conversion keeps content (R-EDITOR-003, R-EDITOR-067, AT-64) | AT-64: paragraph → H2 → paragraph keeps text, marks and the block id | PASS |
| `tests/unit/editor-convert.test.ts` | block conversion keeps content (R-EDITOR-003, R-EDITOR-067, AT-64) | R-EDITOR-003: list, checklist, quote and callout conversions keep the text and the paragraph id | PASS |
| `tests/unit/editor-convert.test.ts` | block conversion keeps content (R-EDITOR-003, R-EDITOR-067, AT-64) | R-EDITOR-067: converting to code keeps mentions/formulas as text and asks before removing formatting | PASS |
| `tests/unit/editor-convert.test.ts` | block conversion keeps content (R-EDITOR-003, R-EDITOR-067, AT-64) | R-EDITOR-067: declining the confirmation leaves formatted text unchanged | PASS |
| `tests/unit/editor-convert.test.ts` | caret memory (R-EDITOR-001, R-EDITOR-037) | R-EDITOR-037: caret is stored relative to the block id and survives edits before the block | PASS |
| `tests/unit/editor-p0-clipboard.test.ts` | tracker cleanup in pasted HTML (R-CLIPBOARD-024) | R-CLIPBOARD-024: removes utm_*/fbclid/gclid/yclid parameters, keeps others and the fragment | PASS |
| `tests/unit/editor-p0-clipboard.test.ts` | tracker cleanup in pasted HTML (R-CLIPBOARD-024) | R-CLIPBOARD-024: tracking pixels and analytics counters are dropped from pasted HTML, links are cleaned | PASS |
| `tests/unit/editor-p0-clipboard.test.ts` | copying a section of a heading (R-CLIPBOARD-001) | R-CLIPBOARD-001: a section ends before the next heading of the same or a higher level and includes subsections | PASS |
| `tests/unit/editor-p0-clipboard.test.ts` | paste options (R-CLIPBOARD-009) | R-CLIPBOARD-009: «Объединить» keeps structure and emphasis, drops headings, colours and highlights; «Только текст» gives paragraphs | PASS |
| `tests/unit/editor-table-ops.test.ts` | table operations (R-TABLE-003) | moves a row up and down; header cells stay in the header row; ids are kept | PASS |
| `tests/unit/editor-table-ops.test.ts` | table operations (R-TABLE-003) | moves a column left and right with its cell attributes | PASS |
| `tests/unit/editor-table-ops.test.ts` | table operations (R-TABLE-003) | moves a selected range of rows together | PASS |
| `tests/unit/editor-table-ops.test.ts` | table operations (R-TABLE-003) | sorts body rows by the caret column: numbers numerically, text in Russian order, empty cells last, header fixed | PASS |
| `tests/unit/editor-table-ops.test.ts` | table operations (R-TABLE-003) | refuses to move or sort a table with merged cells instead of tearing it apart | PASS |
| `tests/unit/editor-table-ops.test.ts` | table operations (R-TABLE-003) | compareCells: "1 000,5" > "999"; "Ж" < "Я"; "ё" sorts with "е" | PASS |
| `tests/unit/markdown.test.ts` | markdown import | parses GFM structure into valid document | PASS |
| `tests/unit/markdown.test.ts` | markdown import | takes leading H1 as title | PASS |
| `tests/unit/markdown.test.ts` | markdown import | converts GitHub alerts into callouts | PASS |
| `tests/unit/markdown.test.ts` | markdown import | converts <details> to toggle with nested markdown | PASS |
| `tests/unit/markdown.test.ts` | markdown import | lifts images out of paragraphs and reports missing assets | PASS |
| `tests/unit/markdown.test.ts` | markdown import | removes unsafe links but keeps text | PASS |
| `tests/unit/markdown.test.ts` | markdown import | keeps inline html formatting (underline, mark, sub/sup, color) | PASS |
| `tests/unit/markdown.test.ts` | markdown import | converts footnotes without losing text | PASS |
| `tests/unit/markdown.test.ts` | markdown export | writes readable markdown and reports degradations | PASS |
| `tests/unit/markdown.test.ts` | markdown export | round-trips through import with structure preserved | PASS |
| `tests/unit/markdown.test.ts` | markdown export | clean mode omits kb markers | PASS |
| `tests/unit/markdown.test.ts` | markdown property: text is never lost | docToMarkdown -> markdownToDoc preserves plain text and block types | PASS |
| `tests/unit/qa-pairwise.test.ts` | pairwise test-case generator (QA26-30) | QA26-30: covers every pair of role × device/input × content × network × concurrency × history × size with far fewer cases than the product | PASS |
| `tests/unit/qa-pairwise.test.ts` | pairwise test-case generator (QA26-30) | QA26-30: any random set of axes gets a complete pairwise cover (property) | PASS |
| `tests/unit/qa-pairwise.test.ts` | invariant helpers (QA26-31) | QA26-31: detect lost, duplicated and reordered content | PASS |
| `tests/unit/schema-migrations.test.ts` | document schema versions (R-EDITOR-023, R-EDITOR-043) | R-EDITOR-023: current documents pass unchanged; older ones are migrated step by step | PASS |
| `tests/unit/schema-migrations.test.ts` | document schema versions (R-EDITOR-023, R-EDITOR-043) | R-EDITOR-023: refuses newer schemas and gaps in the migration chain | PASS |
| `tests/unit/schema-migrations.test.ts` | document schema versions (R-EDITOR-023, R-EDITOR-043) | R-EDITOR-043: dangerous URLs are detected; unusable ones are cleaned without losing text | PASS |
| `tests/unit/schema-migrations.test.ts` | document schema versions (R-EDITOR-023, R-EDITOR-043) | image sources: http(s), in-app, relative assets and raster data URIs only | PASS |
| `tests/unit/sha256.test.ts` | incremental SHA-256 of streamed uploads (R-FILES-004, R-FILES-011) | R-FILES-004: matches the reference for edge lengths | PASS |
| `tests/unit/sha256.test.ts` | incremental SHA-256 of streamed uploads (R-FILES-004, R-FILES-011) | R-FILES-011: arbitrary chunking gives the same digest as hashing the whole file | PASS |
| `tests/unit/totp.test.ts` | TOTP (RFC 6238) — second factor | base32 round trip | PASS |
| `tests/unit/totp.test.ts` | TOTP (RFC 6238) — second factor | reference vector at T=%i | BLOCKED (не запускался) |
| `tests/unit/totp.test.ts` | TOTP (RFC 6238) — second factor | rejects wrong and far-off codes | PASS |
| `tests/unit/ui-error-template.test.ts` | error message template (R-UI-052, R-UI-009) | R-UI-052: server failure on a change says it was not saved, how to retry and gives the request code | PASS |
| `tests/unit/ui-error-template.test.ts` | error message template (R-UI-052, R-UI-009) | R-UI-052: missing rights explain what to do; reads do not talk about saving | PASS |
| `tests/unit/ui-error-template.test.ts` | error message template (R-UI-052, R-UI-009) | R-UI-052: conflict, size and rate limits name the next step | PASS |
| `tests/unit/ui-error-template.test.ts` | error message template (R-UI-052, R-UI-009) | does not repeat what the server message already says | PASS |
| `tests/unit/ui-error-template.test.ts` | error message template (R-UI-052, R-UI-009) | keeps validation, auth and not-found messages as they are (shown next to the field / page) | PASS |

### Интеграционные тесты API на реальном PostgreSQL (vitest)

Запуск: `npm run test:integration`. Тестов: **223**.

| Файл | Группа | Тест | Результат |
|---|---|---|---|
| `tests/integration/acl-gaps.test.ts` | time-based expiry in live sessions (R-ACL-038, V15-A07, ACL-156, R-ACL-063, R-ACL-003) | an expiring edit grant downgrades an open editor to read-only without any client or admin action | PASS |
| `tests/integration/acl-gaps.test.ts` | time-based expiry in live sessions (R-ACL-038, V15-A07, ACL-156, R-ACL-063, R-ACL-003) | an expiring view grant closes the live channel of a page the user can no longer see | PASS |
| `tests/integration/acl-gaps.test.ts` | time-based expiry in live sessions (R-ACL-038, V15-A07, ACL-156, R-ACL-063, R-ACL-003) | expiry of a temporary department membership is detected the same way (R-ACL-038) | PASS |
| `tests/integration/acl-gaps.test.ts` | stored exports re-check access at download (E-12, V16-S04, R-ACL-080, R-ACL-072) | a finished export cannot be downloaded after access to its pages was revoked | PASS |
| `tests/integration/acl-gaps.test.ts` | audit: private titles masked, denials logged (ROUTE-06, R-AUDIT-001, OPS-014) | an auditor sees events about a private page but not its title | PASS |
| `tests/integration/acl-gaps.test.ts` | audit: private titles masked, denials logged (ROUTE-06, R-AUDIT-001, OPS-014) | access denials are written to the audit log with a rate limit | PASS |
| `tests/integration/acl-gaps.test.ts` | guests have no global search (R-ACL-064) | search and suggestions return only pages explicitly shared with the guest | PASS |
| `tests/integration/acl-gaps.test.ts` | organisation guest switch beats existing grants (R-ACL-033) | disabling guest access makes existing guest grants ineffective until it is enabled again | PASS |
| `tests/integration/acl-gaps.test.ts` | explicit exceptions are marked (R-ACL-032, R-ACL-077) | tree nodes and page DTO expose hasExplicitGrants | PASS |
| `tests/integration/acl-gaps.test.ts` | deleting a department requires reassignment or confirmation (R-ORG-004) | refuses with the affected grants, then reassigns them to another department | PASS |
| `tests/integration/acl-gaps.test.ts` | deleting a department requires reassignment or confirmation (R-ORG-004) | a group without grants or primary members is deleted directly | PASS |
| `tests/integration/acl-gaps.test.ts` | copy into another space asks to confirm the audience (R-ACL-050) | duplicating a personal page into an open space requires confirmation | PASS |
| `tests/integration/acl-gaps.test.ts` | comments are bound to a revision and a block (R-COMMENTS-001) | stores the revision number and the comment survives edits of its block | PASS |
| `tests/integration/acl-gaps.test.ts` | OpenAPI description (R-SPACE-002, R-ACL-016) | is generated from the registered routes | PASS |
| `tests/integration/acl-p0.test.ts` | role × permission matrix (R-ACL-013, R-AUDIT-002) | R-ACL-013: every role × permission cell of the matrix is enforced by the API (table-driven) | PASS |
| `tests/integration/acl-p0.test.ts` | role × permission matrix (R-ACL-013, R-AUDIT-002) | R-AUDIT-002: combinatorial parent / child / group inheritance matches an independent oracle, and every grant is audited | PASS |
| `tests/integration/acl-p0.test.ts` | public links (R-PUBLISH-009, E2E-109, R-ACL-021) | E2E-109: creating a public link is rejected while the organisation policy forbids it (default) | PASS |
| `tests/integration/acl-p0.test.ts` | public links (R-PUBLISH-009, E2E-109, R-ACL-021) | R-PUBLISH-009: link works anonymously with noindex, honours password, expiry, download control, and stops after revoke | PASS |
| `tests/integration/acl-p0.test.ts` | public links (R-PUBLISH-009, E2E-109, R-ACL-021) | R-PUBLISH-009: a link stops when its creator loses the right to share; children only when included; foreign pages never | PASS |
| `tests/integration/acl-p0.test.ts` | emergency access and offboarding (R-ACL-056, R-ADMIN-016) | R-ACL-056: emergency access needs a second administrator, a reason and a time limit; read-only; owner notified; audited | PASS |
| `tests/integration/acl-p0.test.ts` | emergency access and offboarding (R-ACL-056, R-ADMIN-016) | R-ADMIN-016: offboarding hands over only already-shared personal documents; private notes stay private; counts-only audit | PASS |
| `tests/integration/acl-p0.test.ts` | sharing details (R-ACL-051, R-ACL-021, R-ACL-036, R-ACL-063) | R-ACL-051: a personal page shared with anybody is marked «не полностью личная» (also its children); the mark disappears on revoke | PASS |
| `tests/integration/acl-p0.test.ts` | sharing details (R-ACL-051, R-ACL-021, R-ACL-036, R-ACL-063) | R-ACL-021: «Только я» shows who loses access, requires confirmation and leaves only the author | PASS |
| `tests/integration/acl-p0.test.ts` | sharing details (R-ACL-051, R-ACL-021, R-ACL-036, R-ACL-063) | R-ACL-036 R-ACL-063: start, end, time zone, author and reason are stored; the granter is reminded once before expiry | PASS |
| `tests/integration/acl-p0.test.ts` | effective access for administrators (R-ADMIN-010, V16-S15, R-ADMIN-018) | R-ADMIN-010 V16-S15: users × spaces matrix shows level, source, expiry, conflicts and managers without personal spaces | PASS |
| `tests/integration/acl-p0.test.ts` | effective access for administrators (R-ADMIN-010, V16-S15, R-ADMIN-018) | R-ADMIN-018: «Проверить доступ» explains a decision without impersonation (no session is created for the user) | PASS |
| `tests/integration/acl-p0.test.ts` | move preview (R-SPACE-007, R-ACL-068) and concurrent move + edit (E2E-106) | R-SPACE-007 R-ACL-068: preview lists target path, public links and guests losing access; a move that cuts guests off needs confirmation | PASS |
| `tests/integration/acl-p0.test.ts` | move preview (R-SPACE-007, R-ACL-068) and concurrent move + edit (E2E-106) | E2E-106: moving a page while it is being edited re-evaluates rights for the open editor; later edits are not saved | PASS |
| `tests/integration/acl-p0.test.ts` | SSRF-guarded remote images (R-SECURITY-008, SC-33) | SC-33 R-SECURITY-008: internal, loopback, link-local, mapped and reserved addresses are classified as blocked | PASS |
| `tests/integration/acl-p0.test.ts` | SSRF-guarded remote images (R-SECURITY-008, SC-33) | SC-33 R-SECURITY-008: the fetcher refuses internal targets, unsafe schemes, credentials and redirects into the internal network | PASS |
| `tests/integration/acl-p0.test.ts` | SSRF-guarded remote images (R-SECURITY-008, SC-33) | R-SECURITY-008: on import remote images are copied into the knowledge base; internal addresses are removed and reported | PASS |
| `tests/integration/acl-p0.test.ts` | audit of reads and hidden resources (R-AUDIT-001, OPS-014) | R-AUDIT-001 OPS-014: opening a document is audited (rate limited) and probing a hidden page is logged as access.not_found | PASS |
| `tests/integration/acl-p0.test.ts` | content edits in the tamper-evident audit (OPS-014) | OPS-014: a logical edit operation is written to the audit log with its author and change counts; the hash chain stays valid | PASS |
| `tests/integration/acl-p0.test.ts` | malicious inputs (SC-33, R-SECURITY-002, R-SECURITY-007) | SC-33 R-SECURITY-002: XSS in imported HTML/Markdown is neutralised, CSRF without token and path traversal in file names are refused | PASS |
| `tests/integration/acl-p0.test.ts` | malicious inputs (SC-33, R-SECURITY-002, R-SECURITY-007) | R-SECURITY-007: malicious fixtures are rejected — infected attachment and import (antivirus), disguised executables; originals of clean files are kept byte-exact | PASS |
| `tests/integration/acl-p0.test.ts` | hierarchy CRUD (R-SPACE-001) | R-SPACE-001: organisation → space → section → page: every level can be created, renamed and removed/restored; changes are audited | PASS |
| `tests/integration/acl-p0.test.ts` | linked page titles (AT-79) | AT-79: the reading API and exports replace titles of linked pages the reader cannot open; the author still sees them | PASS |
| `tests/integration/acl.test.ts` | department spaces and inheritance | new employee of a department automatically gets its space (V15-A04, V16-S13, V15-A01, ACL-152, ACL-159, ACL-162, R-ORG-005, R-ADMIN-020, R-ACL-081, UX v2.7) | PASS |
| `tests/integration/acl.test.ts` | department spaces and inheritance | nested departments: member of a sub-department inherits parent department access (R-ORG-001) | PASS |
| `tests/integration/acl.test.ts` | department spaces and inheritance | removing a user from a department revokes access; personal grants remain (R-ACL-039, E2E-107) | PASS |
| `tests/integration/acl.test.ts` | permission levels (ACL-153, ACL-154, A10) | company-wide view, editing only by authors; view-only cannot modify via API (V15-A10, ACL-153) | PASS |
| `tests/integration/acl.test.ts` | permission levels (ACL-153, ACL-154, A10) | editor without share right cannot grant access (ACL-154, R-ACL-059) | PASS |
| `tests/integration/acl.test.ts` | exceptions and denies | restricted child page is not accessible through parent rights (ACL-160, R-ACL-034, E2E-104, UX-149) | PASS |
| `tests/integration/acl.test.ts` | exceptions and denies | explicit deny wins over group allow (R-ACL-066) | PASS |
| `tests/integration/acl.test.ts` | exceptions and denies | explains why a user has access (ACL-161, V15-A09, V16-S15, R-ACL-078) | PASS |
| `tests/integration/acl.test.ts` | admin does not see private content (A03, S15, §4.1) | org admin cannot open a personal page nor a private space page without a grant (V15-A03, R-ACL-047) | PASS |
| `tests/integration/acl.test.ts` | temporary access and guests (ACL-155, ACL-156, ACL-158, A07, S14, ACL-171) | guest invited to one page sees only it, no directory, no org-wide content (ACL-155, ACL-171, R-ACL-029, R-ACL-082, V15-A02) | PASS |
| `tests/integration/acl.test.ts` | temporary access and guests (ACL-155, ACL-156, ACL-158, A07, S14, ACL-171) | guest cannot be granted access in a space whose policy forbids guests | PASS |
| `tests/integration/acl.test.ts` | temporary access and guests (ACL-155, ACL-156, ACL-158, A07, S14, ACL-171) | time-limited grant expires on the server without client activity (ACL-156) | PASS |
| `tests/integration/acl.test.ts` | temporary access and guests (ACL-155, ACL-156, ACL-158, A07, S14, ACL-171) | user access expiry blocks the account (V16-S14) | PASS |
| `tests/integration/acl.test.ts` | moving changes audience (ACL-165, ACL-166, A06, UX23-210) | moving a private page to an open space requires confirmation and shows who gains access; undo restores (ACL-165, ACL-166, V15-A06, UX23-210, E2E-098, R-ACL-035, R-ACL-084, R-ACL-079, R-TREE-028, R-TREE-014, UX-126, UX21-188) | PASS |
| `tests/integration/acl.test.ts` | moving changes audience (ACL-165, ACL-166, A06, UX23-210) | cannot move into a location where the user cannot create (UX23-209) | PASS |
| `tests/integration/acl.test.ts` | moving changes audience (ACL-165, ACL-166, A06, UX23-210) | opening the page to the whole company requires explicit confirmation (R-ACL-069) | PASS |
| `tests/integration/acl.test.ts` | concurrency and audit of ACL (ACL-169, ACL-172, A13) | parallel grant changes do not lose updates (one active grant per subject) (ACL-169, ACL-172, E2E-110, R-AUDIT-004) | PASS |
| `tests/integration/acl.test.ts` | concurrency and audit of ACL (ACL-169, ACL-172, A13) | deleting a group revokes its grants and keeps users and pages (V15-A13) | PASS |
| `tests/integration/acl.test.ts` | concurrency and audit of ACL (ACL-169, ACL-172, A13) | transfer preview shows spaces gained and lost (V15-A16, R-ADMIN-006, R-ADMIN-023) | PASS |
| `tests/integration/acl.test.ts` | space policy | export/download flags are reflected in actions (R-ACL-031) | PASS |
| `tests/integration/archive.test.ts` | organisation archive round trip (F06, V18-A01, V18-A02, V18-A03, V18-A04, V18-A24, SC-38, S20) | export → readable without the app → restore into a clean installation → verified (V18-A05, R-ACL-049, R-SECURITY-010, E-10, V17-F06, QA26-16, R-ARCHIVE-004, R-ARCHIVE-006, R-ARCHIVE-007, R-ARCHIVE-008, R-ARCHIVE-011, R-ARCHIVE-013, R-ARCHIVE-016, R-BACKUP-005, R-EXPORT-002, R-EXPORT-024, R-EXPORT-026) | PASS |
| `tests/integration/attachment-copy.test.ts` | POST /api/v1/attachments/:id/copy | copies to the target page: new attachment of that page, same bytes; same page → no copy | PASS |
| `tests/integration/attachment-copy.test.ts` | POST /api/v1/attachments/:id/copy | needs the download right on the source and the edit right on the target | PASS |
| `tests/integration/auth-hardening.test.ts` | authentication hardening (ASVS V2/V3) | a session idle longer than SESSION_IDLE_HOURS is refused; an active one keeps working | PASS |
| `tests/integration/auth-hardening.test.ts` | authentication hardening (ASVS V2/V3) | weak and common passwords are refused on change; a strong one is accepted | PASS |
| `tests/integration/auth-hardening.test.ts` | authentication hardening (ASVS V2/V3) | the TOTP secret is stored encrypted and login with the second factor works | PASS |
| `tests/integration/collab-p0.test.ts` | HTTP fallback channel (R-COLLAB-039) | WebSocket blocked: the client switches to the HTTP channel, gets ACK only after commit and exchanges edits with WebSocket editors (R-COLLAB-039, R-COLLAB-019) | PASS |
| `tests/integration/collab-p0.test.ts` | HTTP fallback channel (R-COLLAB-039) | the HTTP channel enforces the same access rules: no session → 401, foreign tunnel → 404, reader cannot write | PASS |
| `tests/integration/collab-p0.test.ts` | many editors, tables, moves (QA26-19, AT-56, SC-25, R-COLLAB-024, R-COLLAB-032) | 2, 5 and 20 editors type into one paragraph at the same time: every character survives and all replicas are identical (QA26-19) | PASS |
| `tests/integration/collab-p0.test.ts` | many editors, tables, moves (QA26-19, AT-56, SC-25, R-COLLAB-024, R-COLLAB-032) | two editors change one table cell and neighbouring rows while a third adds a row; the merged table is valid and loses nothing (AT-56, SC-25, R-COLLAB-024, QA26-19, ROUTE-05) | PASS |
| `tests/integration/collab-p0.test.ts` | many editors, tables, moves (QA26-19, AT-56, SC-25, R-COLLAB-024, R-COLLAB-032) | table deleted while another editor adds a row: the result is a valid document, never an orphan row (R-COLLAB-032, R-COLLAB-024) | PASS |
| `tests/integration/collab-p0.test.ts` | many editors, tables, moves (QA26-19, AT-56, SC-25, R-COLLAB-024, R-COLLAB-032) | format + delete, block copy + edit and concurrent block moves converge without duplicates of text or lost characters (R-COLLAB-032, R-COLLAB-021, R-COLLAB-009, R-COLLAB-024, COLLAB-193) | PASS |
| `tests/integration/collab-p0.test.ts` | many editors, tables, moves (QA26-19, AT-56, SC-25, R-COLLAB-024, R-COLLAB-032) | the same user on two devices edits offline on both; nothing is lost or doubled (R-COLLAB-032, UX23-216) | PASS |
| `tests/integration/collab-p0.test.ts` | session expiry, sleep, unreliable network (R-COLLAB-021, QA26-20) | session expires during editing: unsent edits are never shown as saved and are delivered after signing in again (R-COLLAB-021, QA26-20) | PASS |
| `tests/integration/collab-p0.test.ts` | session expiry, sleep, unreliable network (R-COLLAB-021, QA26-20) | sleeping laptop: a silently dead connection is detected by the acknowledgement timeout, edits are re-sent once and converge (R-COLLAB-021, QA26-20, R-OFFLINE-010) | PASS |
| `tests/integration/collab-p0.test.ts` | session expiry, sleep, unreliable network (R-COLLAB-021, QA26-20) | high latency, jitter and dropped connections: random edits of three editors converge with 0 losses and 0 duplicates (QA26-20, R-COLLAB-019) | PASS |
| `tests/integration/collab-schema.test.ts` | document schema change vs concurrent editing (R-COLLAB-009, R-COLLAB-037) | migration on open keeps a pre-migration version; up-to-date editors merge; an offline editor of the old format gets an explicit conflict and loses nothing | PASS |
| `tests/integration/collab-schema.test.ts` | document schema change vs concurrent editing (R-COLLAB-009, R-COLLAB-037) | rolling update: an editor newer than the server keeps its operations and they are delivered once the server is updated; a broken migration chain leaves the page read-only and unchanged | PASS |
| `tests/integration/collab.test.ts` | durability contract | "saved" is reported only after the update is committed to the journal (E-13, D-10, R-COLLAB-003, R-COLLAB-014, R-COLLAB-016, R-COLLAB-025, R-COLLAB-029, R-COLLAB-043) | PASS |
| `tests/integration/collab.test.ts` | durability contract | re-delivered operation is acknowledged once and not duplicated (D-02, E-03, UX23-214, R-COLLAB-019, R-COLLAB-023, R-COLLAB-044, R-OFFLINE-009) | PASS |
| `tests/integration/collab.test.ts` | concurrent editing | two editors typing in the same paragraph converge without loss (SC-25, AT-74, COLLAB-192, UX23-217, OPS-005, R-COLLAB-001, UX13-08) | PASS |
| `tests/integration/collab.test.ts` | concurrent editing | delete block on one client while another edits it keeps a consistent result (AT-77, COLLAB-193) | PASS |
| `tests/integration/collab.test.ts` | offline and reconnection | offline edits are kept locally and synchronised after reconnect, concurrent with others (SC-26, AT-57, AT-76, UX23-215, R-COLLAB-007, COLLAB-195, R-OFFLINE-008, R-OFFLINE-011, UX23-213) | PASS |
| `tests/integration/collab.test.ts` | offline and reconnection | unacknowledged changes survive a client restart via the pending store (AT-58, UX23-219, E-02, R-OFFLINE-002, V18-A20, V17-F03) | PASS |
| `tests/integration/collab.test.ts` | offline and reconnection | server restart during a session loses no acknowledged change and resends the rest (OPS-009, V17-F04, R-COLLAB-047, R-COLLAB-050, UX13-15) | PASS |
| `tests/integration/collab.test.ts` | permissions in live sessions | read-only user cannot write; revoking edit switches session to read-only; revoking view closes it (AT-78, COLLAB-196, E2E-105, ACL-168, SC-32, OPS-008, V15-A08, R-ACL-083) | PASS |
| `tests/integration/collab.test.ts` | permissions in live sessions | suspending a user closes their live sessions (ACL-157, R-AUTH-002) | PASS |
| `tests/integration/collab.test.ts` | permissions in live sessions | trashing a page stops accepting edits and tells editors (UX: page deleted) | PASS |
| `tests/integration/collab.test.ts` | server-side validation | rejects schema-invalid updates and keeps the document valid (R-COLLAB-020, R-COLLAB-031) | PASS |
| `tests/integration/collab.test.ts` | history: revisions, restore, journal | restoring a revision creates a new revision and keeps concurrent edits (HIST-189, COLLAB-197, SC-28, S11, R-HISTORY-004, R-HISTORY-007, UX21-201, OPS-010, R-HISTORY-034) | PASS |
| `tests/integration/collab.test.ts` | history: revisions, restore, journal | restores a single deleted block from a revision (R-HISTORY-003, R-HISTORY-013) | PASS |
| `tests/integration/collab.test.ts` | history: revisions, restore, journal | records a journal of edit operations grouped per author (HIST-187, R-HISTORY-023, R-HISTORY-024) | PASS |
| `tests/integration/collab.test.ts` | history: revisions, restore, journal | title is edited collaboratively and synced to the tree (R-PAGE-019) | PASS |
| `tests/integration/collab.test.ts` | randomised convergence (COLLAB-198, R-COLLAB-008, R-COLLAB-030, R-COLLAB-044, property-based) | random concurrent edits with random disconnects converge to the server state | PASS |
| `tests/integration/collab.test.ts` | access to the live channel | a user without access cannot open the live channel (S03/E2E-105) | PASS |
| `tests/integration/collection-import-p0.test.ts` | collection import modes (R-COLLECTION-003) | new table, append rows, update by key and replace — each with a dry run; replace needs confirmation and moves missing rows to the trash; repeated imports never create hidden duplicates | PASS |
| `tests/integration/conflicts.test.ts` | conflict copies (E-04, R-COLLAB-045, R-COLLAB-049) | an editor stores the lost version of a block; it is listed and can be marked restored; readers cannot write | PASS |
| `tests/integration/content.test.ts` | attachments | uploads an image, stores the original byte-exact with checksum, creates previews (A10, R-MEDIA-010, V18-A10, R-FILES-003) | PASS |
| `tests/integration/content.test.ts` | attachments | rejects executables even with a fake extension and dangerous types (SC-19, SC-33) | PASS |
| `tests/integration/content.test.ts` | attachments | sanitises SVG and serves user content in a sandbox (SC-12, SC-33, R-MEDIA-011) | PASS |
| `tests/integration/content.test.ts` | attachments | files of a private page are not accessible by direct link; revocation invalidates signed links (E2E-102, A14, V18-A17, V15-A08, ACL-164, R-FILES-006, V15-A14) | PASS |
| `tests/integration/content.test.ts` | attachments | respects download policy: viewers can see the page but cannot download when forbidden (A15, UX21-182) | PASS |
| `tests/integration/content.test.ts` | attachments | resumable upload with chunk retry and checksum verification (UX23-220, A16, R-FILES-011) | PASS |
| `tests/integration/content.test.ts` | attachments | incomplete upload cannot be completed (UX23-220) | PASS |
| `tests/integration/content.test.ts` | attachments | replacing a file creates a new version; old version restorable (R-FILES-003, R-MEDIA-013) | PASS |
| `tests/integration/content.test.ts` | attachments | large images get a deep-zoom tile pyramid (UX21-181, UX22-186) | PASS |
| `tests/integration/content.test.ts` | OCR (R-OCR-001, R-OCR-007, R-OCR-011, SC-22, §8) | recognises Russian and English text on a screenshot, keeps original, result is searchable with origin marker (R-SEARCH-002, SC-23) | PASS |
| `tests/integration/content.test.ts` | search (§9, S01–S03, V16) | finds by morphology, typo, wrong layout, applies ACL before results and jumps to block (R-SEARCH-004, R-SEARCH-005, R-SEARCH-006, R-SEARCH-011, R-SEARCH-014, E2E-101, ACL-163, V16-S03) | PASS |
| `tests/integration/content.test.ts` | search (§9, S01–S03, V16) | space scope does not leak neighbouring spaces (S02, V16-S02) | PASS |
| `tests/integration/content.test.ts` | comments and mentions | threads, replies, resolve/reopen, mention notifications only for those with access (R-COMMENTS-001) | PASS |
| `tests/integration/content.test.ts` | publishing workflow (§11, S05, ROUTE Автор) | readers see the published revision while the draft evolves; approval required when configured (V16-S05, R-PUBLISH-006, R-PUBLISH-007) | PASS |
| `tests/integration/coordination-p0.test.ts` | transactional coordination over the CRDT (R-COLLAB-031, R-COLLAB-024) | collection columns: two concurrent schema changes → exactly one wins, the other gets version_conflict; a cell write to a column deleted meanwhile is refused, never silently stored | PASS |
| `tests/integration/coordination-p0.test.ts` | transactional coordination over the CRDT (R-COLLAB-031, R-COLLAB-024) | page structure: concurrent moves never create a cycle; delete vs move and delete vs edit have one predictable outcome | PASS |
| `tests/integration/coordination-p0.test.ts` | transactional coordination over the CRDT (R-COLLAB-031, R-COLLAB-024) | attachment: two concurrent new versions of the same file are both kept, numbered in commit order; the current one is the last committed | PASS |
| `tests/integration/coordination-p0.test.ts` | transactional coordination over the CRDT (R-COLLAB-031, R-COLLAB-024) | access change during a session: a revoked editor is switched to read-only at once and its later operations are refused | PASS |
| `tests/integration/core.test.ts` | auth | rejects wrong password and does not reveal whether the user exists | PASS |
| `tests/integration/core.test.ts` | auth | requires CSRF token for cookie-authenticated mutations | PASS |
| `tests/integration/core.test.ts` | auth | setup cannot run twice | PASS |
| `tests/integration/core.test.ts` | auth | suspended user loses access immediately (ACL-157, R-AUTH-002) | PASS |
| `tests/integration/core.test.ts` | personal space (UX23-199, ACL-151) | each employee gets a private personal space invisible to others and to admins (UX23-199, ACL-151, R-SPACE-004) | PASS |
| `tests/integration/core.test.ts` | page tree | creates nested pages, idempotent by requestId (UX23-203, R-COLLAB-028) | PASS |
| `tests/integration/core.test.ts` | page tree | prevents moving a page into its own descendant (E2E-099, UX23-208, UX21-189) | PASS |
| `tests/integration/core.test.ts` | page tree | concurrent opposite moves never create a cycle (COLLAB-194, UX23-218, R-TREE-022) | PASS |
| `tests/integration/core.test.ts` | page tree | moves keep ids, ancestors closure is consistent, order respected, undo restores (R-TREE-004, D-06, SC-01, E2E-097, R-TREE-017, UX21-187, E216, R-HISTORY-016) | PASS |
| `tests/integration/core.test.ts` | page tree | trash and restore a branch with children (D-05, SC-29, V17-F08, E-05, R-HISTORY-003, R-HISTORY-034, UX13-14) | PASS |
| `tests/integration/core.test.ts` | page tree | duplicates a branch with new ids (R-PAGE-021) | PASS |
| `tests/integration/core.test.ts` | audit | is hash-chained and append-only (R-AUDIT-005) | PASS |
| `tests/integration/core.test.ts` | audit | regular user cannot read the org audit log (SC-39) | PASS |
| `tests/integration/download-integrity.test.ts` | attachment downloads are byte-exact (R-BACKUP-008, R-BACKUP-019) | gzip files, zlib-looking and random binary files download unchanged with and without Accept-Encoding, also by Range (R-BACKUP-008, R-BACKUP-019) | PASS |
| `tests/integration/editor-p0.test.ts` | save and open keep the structure identical (SC-05) | SC-05: a document with all inline formats, headings, nested lists, checklists, callout, toggle, formulas, links, code and quotes is stored and reopened identically | PASS |
| `tests/integration/editor-p0.test.ts` | save and open keep the structure identical (SC-05) | SC-05: Markdown export with markers and re-import keep the same structure (formulas, checklists, nested lists, code, quotes) | PASS |
| `tests/integration/editor-p0.test.ts` | image by URL (R-MEDIA-009) | R-MEDIA-009: the server copies an image from a URL into an attachment of the page; non-images, missing files and internal addresses are refused | PASS |
| `tests/integration/files-integrity.test.ts` | upload checksum computed by the client (R-FILES-004, R-FILES-011) | R-FILES-011: a streamed upload is completed only when the client checksum matches the received bytes | PASS |
| `tests/integration/files-integrity.test.ts` | upload checksum computed by the client (R-FILES-004, R-FILES-011) | R-FILES-004: a checksum different from the one declared at start is refused | PASS |
| `tests/integration/files-integrity.test.ts` | periodic integrity verification of stored files (R-FILES-007) | R-FILES-007: a corrupted or missing stored file is detected, audited and shown to administrators | PASS |
| `tests/integration/files-integrity.test.ts` | server-side document validation (R-EDITOR-043) | R-EDITOR-043: an update with a script-capable link (javascript:) is rejected and the document stays clean | PASS |
| `tests/integration/gaps.test.ts` | revisions: pre-restore snapshot | restore saves the current state as a "pre-restore" revision (QA26-15) | PASS |
| `tests/integration/gaps.test.ts` | access requests notify everyone who can share | space managers (direct and via group) are notified about a page request; the requester is not (R-ACL-043) | PASS |
| `tests/integration/gaps.test.ts` | access requests notify everyone who can share | a requester who can already share is not notified about their own request | PASS |
| `tests/integration/gaps.test.ts` | audience preview when widening access | audience_change conflict lists who would newly gain access; preview endpoint computes added/removed (R-ACL-014) | PASS |
| `tests/integration/gaps.test.ts` | comments: mentions and delete rights | returns stored mentions and a per-comment canDelete flag | PASS |
| `tests/integration/gaps.test.ts` | page DTO: approval and published info | shows the pending approval while in review and the published revision afterwards | PASS |
| `tests/integration/gaps.test.ts` | admin: users, settings, transfer preview | filters users by role, q and status; returns a single user card | PASS |
| `tests/integration/gaps.test.ts` | admin: users, settings, transfer preview | oidcJitProvisioning setting is stored and audited | PASS |
| `tests/integration/gaps.test.ts` | admin: users, settings, transfer preview | transfer preview reports the number of owned pages | PASS |
| `tests/integration/gaps.test.ts` | trash: path, purgeAt and space purge | trash rows include the parent path (hidden ancestors as …) and purgeAt | PASS |
| `tests/integration/gaps.test.ts` | trash: path, purgeAt and space purge | org admin can permanently purge a deleted space (audited, legal hold respected) | PASS |
| `tests/integration/gaps.test.ts` | templates from content | creates a template directly from ProseMirror JSON and uses it for new pages | PASS |
| `tests/integration/gaps.test.ts` | templates from content | validates content against the editor schema and requires exactly one source | PASS |
| `tests/integration/gaps.test.ts` | search: did you mean | suggests a corrected query when nothing is found (R-SEARCH-004) | PASS |
| `tests/integration/history-p0.test.ts` | version comparison and restore (R-HISTORY-013, V16-S11, QA26-15, R-HISTORY-002) | compares text AND properties of two versions; restore with a precise preview creates new versions and keeps later ones and the audit | PASS |
| `tests/integration/history-p0.test.ts` | version comparison and restore (R-HISTORY-013, V16-S11, QA26-15, R-HISTORY-002) | restores one block as a new version (preview first), keeping concurrent edits of other blocks and later versions | PASS |
| `tests/integration/history-p0.test.ts` | version comparison and restore (R-HISTORY-013, V16-S11, QA26-15, R-HISTORY-002) | QA26-15: after deletion the history stays readable and restore says why it waits; after archive and restore from trash it works; retention keeps restore points | PASS |
| `tests/integration/history-p0.test.ts` | undo of property changes (R-HISTORY-002) | icon, tags and properties changes are undoable exactly; a later change by someone else is never overwritten | PASS |
| `tests/integration/history-p0.test.ts` | page model and search sources (R-PAGE-001, R-SEARCH-003) | pages have a slug from the title that follows renames; tags and headings are searchable and reported as the match source | PASS |
| `tests/integration/history-tree.test.ts` | data consistency check (R-COLLAB-037) | maintenance check reports tree and journal inconsistencies and exports kb_integrity_errors (R-COLLAB-037) | PASS |
| `tests/integration/history-tree.test.ts` | nesting limit (R-TREE-005, R-TREE-001) | allows 15 levels and rejects a 16th on create, move, duplicate and import with a clear error (R-TREE-005, R-TREE-001) | PASS |
| `tests/integration/history-tree.test.ts` | legal hold (R-HISTORY-015, R-HISTORY-028) | only org admins set or release a hold; it is audited, shown on the page and blocks permanent deletion (R-HISTORY-015, R-HISTORY-028) | PASS |
| `tests/integration/history-tree.test.ts` | restore to a journal step (R-HISTORY-026, HIST-187) | reconstructs the state after any journal operation and restores it as a new reversible revision (R-HISTORY-026, HIST-187, R-HISTORY-034) | PASS |
| `tests/integration/history-tree.test.ts` | restore to a journal step (R-HISTORY-026, HIST-187) | starts from a revision when the journal head was compacted and refuses an unreachable step (R-HISTORY-026) | PASS |
| `tests/integration/history-tree.test.ts` | restore notifies co-editors (R-HISTORY-014, COLLAB-197) | everyone else on the page gets a page-restored event with a link to the pre-restore version (R-HISTORY-014, COLLAB-197) | PASS |
| `tests/integration/history-tree.test.ts` | search covers comments and attached documents (R-SEARCH-003, R-SEARCH-013) | finds a page by comment text and by text inside an attached DOCX/TXT, respecting access (R-SEARCH-003, R-SEARCH-013) | PASS |
| `tests/integration/import-export.test.ts` | DOCX import (SC-13, SC-14, AT-41, AT-42) | imports headings, nested lists, merged tables and images with a report; original kept (R-IMPORT-007, R-IMPORT-008, R-IMPORT-020, R-IMPORT-028, R-IMPORT-033, UX13-05, R-EXPORT-012, R-EXPORT-014) | PASS |
| `tests/integration/import-export.test.ts` | DOCX import (SC-13, SC-14, AT-41, AT-42) | rejects a corrupted DOCX with a clear error and changes nothing (SC-19, D-09) | PASS |
| `tests/integration/import-export.test.ts` | Markdown ZIP (SC-15, AT-43, AT-69) | imports a folder tree with relative images and cross-links; links become internal (R-IMPORT-010, R-IMPORT-011, R-IMPORT-013, R-IMPORT-035) | PASS |
| `tests/integration/import-export.test.ts` | Markdown ZIP (SC-15, AT-43, AT-69) | rejects zip-slip paths and zip bombs before extracting (SC-19, AT-69, R-IMPORT-006, R-IMPORT-035) | PASS |
| `tests/integration/import-export.test.ts` | Markdown ZIP (SC-15, AT-43, AT-69) | cancelling before commit creates nothing (AT-72, R-IMPORT-043, E-09) | PASS |
| `tests/integration/import-export.test.ts` | Markdown ZIP (SC-15, AT-43, AT-69) | same idempotency key does not create a second job (AT-73, R-IMPORT-024, E-09) | PASS |
| `tests/integration/import-export.test.ts` | tabular import (AT-48, AT-49, AT-50, UX13-17) | CSV in Windows-1251 with ";" and decimal comma, quotes and leading zeros; repeated upsert import without duplicates (AT-48, UX13-17, AT-50, R-COLLECTION-003, R-IMPORT-030, R-IMPORT-036) | PASS |
| `tests/integration/import-export.test.ts` | tabular import (AT-48, AT-49, AT-50, UX13-17) | XLSX with three sheets: pick a sheet, numbers and dates kept, formulas as values (AT-49, AT-70, R-IMPORT-031, R-IMPORT-041, R-SECURITY-009) | PASS |
| `tests/integration/import-export.test.ts` | export (SC-13, S09, UX13-16) | exports a page to MD/DOCX/HTML/PDF; DOCX opens in LibreOffice; MD round-trips (R-EXPORT-001, R-EXPORT-006, R-EXPORT-013, R-EXPORT-016, R-EXPORT-022, V16-S09, V18-A21, E225, UX13-16) | PASS |
| `tests/integration/import-export.test.ts` | export (SC-13, S09, UX13-16) | branch export to Markdown ZIP: readable tree, relative links, assets, checksums, report (R-EXPORT-008, R-EXPORT-009, R-EXPORT-015, SC-15) | PASS |
| `tests/integration/import-export.test.ts` | export (SC-13, S09, UX13-16) | export respects rights: no export permission => 403; private pages never leak into branch export (SC-20, V17-F07, R-ACL-017, R-EXPORT-011, E2E-108) | PASS |
| `tests/integration/import-pipeline.test.ts` | antivirus quarantine for imports and archive restore (R-IMPORT-032, R-ARCHIVE-016, SC-33) | an infected file is rejected at upload, nothing is stored, and the rejection is audited (R-IMPORT-032, D-09) | PASS |
| `tests/integration/import-pipeline.test.ts` | antivirus quarantine for imports and archive restore (R-IMPORT-032, R-ARCHIVE-016, SC-33) | an infected asset inside a ZIP is found after extraction; a clean file in the same upload is still imported (R-IMPORT-032, R-IMPORT-006) | PASS |
| `tests/integration/import-pipeline.test.ts` | antivirus quarantine for imports and archive restore (R-IMPORT-032, R-ARCHIVE-016, SC-33) | fails closed when the scanner is unreachable (R-IMPORT-032) | PASS |
| `tests/integration/import-pipeline.test.ts` | antivirus quarantine for imports and archive restore (R-IMPORT-032, R-ARCHIVE-016, SC-33) | archive restore: each attachment is scanned; an infected one blocks the restore (R-ARCHIVE-016, R-ARCHIVE-006) | PASS |
| `tests/integration/import-pipeline.test.ts` | import job stage log and kept originals (R-IMPORT-032, R-IMPORT-014, R-IMPORT-042, R-IMPORT-037) | records every pipeline stage on the job: upload → scan → detect → parse → normalize → media → validate → preview → commit → index (R-IMPORT-032) | PASS |
| `tests/integration/import-pipeline.test.ts` | import job stage log and kept originals (R-IMPORT-032, R-IMPORT-014, R-IMPORT-042, R-IMPORT-037) | the original MD, ZIP and CSV files are attached to the imported page for the author (R-IMPORT-014, R-IMPORT-042, UX13-05) | PASS |
| `tests/integration/import-pipeline.test.ts` | XLSX range selection and 100-row preview (R-IMPORT-031, R-IMPORT-041, R-IMPORT-030, R-IMPORT-036) | previews up to 100 rows and imports only the selected range (R-IMPORT-031, R-IMPORT-041, R-IMPORT-030, AT-49) | PASS |
| `tests/integration/import-pipeline.test.ts` | XLSX range selection and 100-row preview (R-IMPORT-031, R-IMPORT-041, R-IMPORT-030, R-IMPORT-036) | rejects a malformed or empty range with a clear error (R-IMPORT-031) | PASS |
| `tests/integration/io-p0-export.test.ts` | DOCX validity (R-EXPORT-006) | exported DOCX with every block type passes Open XML package/schema validation and opens in LibreOffice; corrupted packages are detected (R-EXPORT-006, R-EXPORT-022) | PASS |
| `tests/integration/io-p0-export.test.ts` | DOCX validity (R-EXPORT-006) | docToDocx output for imported-style content keeps anchors as bookmarks and internal links (R-EXPORT-006, R-IMPORT-026) | PASS |
| `tests/integration/io-p0-export.test.ts` | background export: cancel, integrity, layouts (R-EXPORT-022) | a queued export is cancelled before it runs; a running export stops at the next page; nothing can be downloaded; audited (R-EXPORT-022) | PASS |
| `tests/integration/io-p0-export.test.ts` | background export: cancel, integrity, layouts (R-EXPORT-022) | branch export: one DOCX with a table of contents, or separate files in a ZIP with report and checksums; downloads carry the SHA-256 (R-EXPORT-022, R-EXPORT-001) | PASS |
| `tests/integration/io-p0-export.test.ts` | consistent snapshot (V18-A06) | organisation archive taken during concurrent transactional changes and live editing is a consistent snapshot (V18-A06) | PASS |
| `tests/integration/io-p0-export.test.ts` | archive restore target and resumable upload (R-ARCHIVE-006, R-ARCHIVE-016, R-EXPORT-002) | archive uploaded through an interrupted, resumed upload session is restored into a NEW isolated space or merged into an existing space; originals untouched, verification passes (R-ARCHIVE-006, R-ARCHIVE-016, R-EXPORT-002) | PASS |
| `tests/integration/io-p0-import.test.ts` | DOCX structure mapping (IMPORT P0) | Word captions, footnotes, three numbering levels, headers/footers, bookmarks and the TOC field become semantic blocks; images are page assets with order, alt and caption (R-IMPORT-007, R-IMPORT-025, R-IMPORT-026, R-IMPORT-027, R-IMPORT-034) | PASS |
| `tests/integration/io-p0-import.test.ts` | DOCX structure mapping (IMPORT P0) | complex Word constructs (SmartArt, text boxes, fields, floating objects, tracked changes, comments) keep their text and are listed in the compatibility report, never lost silently (R-IMPORT-009, R-IMPORT-034) | PASS |
| `tests/integration/io-p0-import.test.ts` | reference corpus accuracy (R-IMPORT-019) | reference DOCX and Markdown corpus: ≥99% of characters and 100% of structural elements survive import; nothing is lost silently (R-IMPORT-019, R-IMPORT-025) | PASS |
| `tests/integration/io-p0-import.test.ts` | import → edit → export chains (SC-13, SC-15) | Word-style DOCX with headings, 3 list levels, links, 2 tables, images and code → import → edit → DOCX export valid for Word (Open XML) and LibreOffice, structure preserved (SC-13, R-EXPORT-006, R-EXPORT-012, R-IMPORT-007) | PASS |
| `tests/integration/io-p0-import.test.ts` | import → edit → export chains (SC-13, SC-15) | Markdown ZIP with a GFM table, task list, code and relative images → import → ZIP export → every relative link resolves locally → re-import gives the same content (SC-15, R-EXPORT-002, R-IMPORT-010) | PASS |
| `tests/integration/io-p0-import.test.ts` | batch edge cases (QA26-17) | long Cyrillic names with special characters, an empty file, a large file and a broken file in one batch: valid files import, problems are reported per file, selective commit imports only the chosen pages (QA26-17, R-IMPORT-021) | PASS |
| `tests/integration/io-p0-import.test.ts` | formatting through DOCX and HTML (R-EXPORT-012, R-EXPORT-025) | inline formatting (bold, italic, underline, strike, code, sub/sup, highlight, colour, links) survives DOCX export → import and is present in HTML export (R-EXPORT-012, R-EXPORT-025) | PASS |
| `tests/integration/io-p0-ops.test.ts` | distributed tracing (R-OPS-003, R-OPS-022) | HTTP requests and background jobs are OpenTelemetry spans: W3C traceparent is continued and returned, jobs join the trace of the request that created them, spans reach the OTLP collector (R-OPS-003, R-OPS-022) | PASS |
| `tests/integration/io-p0-ops.test.ts` | metrics behind the new alerts (R-OPS-003) | WebSocket reconnects, import results by format and OCR latency are exported (R-OPS-003) | PASS |
| `tests/integration/io-p0-ops.test.ts` | metrics behind the new alerts (R-OPS-003) | every alert rule uses metrics the application or the backup scripts export and links to an existing runbook with an owner (R-OPS-003, R-OPS-022) | PASS |
| `tests/integration/ocr-view.test.ts` | OCR view: original, confidence, corrections, provenance (SC-22) | shows the machine result with word confidence, who corrected it and when, earlier attempts; corrections can be reset; a failed OCR keeps the image | PASS |
| `tests/integration/ops-delivery.test.ts` | health, readiness, metrics and structured logs of the server process (R-OPS-003, R-OPS-022) | /healthz, /readyz (database, storage, migrations) and Prometheus /metrics answer; logs are JSON lines with level, time and the caller correlation id, and never contain passwords or the secret key (R-OPS-003, R-OPS-022) | PASS |
| `tests/integration/ops-delivery.test.ts` | deployment kit without secrets (R-OPS-022) | no private keys, cloud access keys or tokens in any repository file (R-OPS-022) | PASS |
| `tests/integration/ops-delivery.test.ts` | deployment kit without secrets (R-OPS-022) | env.example only has placeholders for secrets; docker-compose takes every secret from the environment (R-OPS-022) | PASS |
| `tests/integration/ops-delivery.test.ts` | deployment kit without secrets (R-OPS-022) | production refuses to start without a SECRET_KEY, with a short one or with a placeholder (R-OPS-022) | PASS |
| `tests/integration/qa-invariants.test.ts` | pairwise matrix with product invariants (QA26-30, QA26-31) | QA26-30: the generated matrix covers every pair of server-side axes | PASS |
| `tests/integration/qa-invariants.test.ts` | pairwise matrix with product invariants (QA26-30, QA26-31) | QA26-31 case ${idx + 1}/${CASES.length}: ${caseName(c)} | PASS |
| `tests/integration/search-private.test.ts` | private materials stay out of shared indexes and notifications (R-SEARCH-018) | R-SEARCH-018: a personal page (title, text, comment, file name) is found by its author and by nobody else — results, counts, snippets, «did you mean», quick switcher, home, recent | PASS |
| `tests/integration/search-private.test.ts` | private materials stay out of shared indexes and notifications (R-SEARCH-018) | R-SEARCH-018: a page made private in a shared space («Только я») disappears from colleagues\' search; restricting a parent hides the children | BLOCKED (не запускался) |
| `tests/integration/search-private.test.ts` | private materials stay out of shared indexes and notifications (R-SEARCH-018) | R-SEARCH-018: notifications — mentions, replies and review requests reach only people who can see the page; lost access hides earlier notifications | PASS |
| `tests/integration/search-private.test.ts` | private materials stay out of shared indexes and notifications (R-SEARCH-018) | R-SEARCH-018: the events WebSocket does not tell colleagues about changes of private pages | PASS |
| `tests/integration/security-dast.test.ts` | baseline DAST (R-SECURITY-004, R-SECURITY-002) | R-SECURITY-004: route inventory comes from the OpenAPI description | PASS |
| `tests/integration/security-dast.test.ts` | baseline DAST (R-SECURITY-004, R-SECURITY-002) | R-SECURITY-002 R-SECURITY-004: every non-public route requires authentication | PASS |
| `tests/integration/security-dast.test.ts` | baseline DAST (R-SECURITY-004, R-SECURITY-002) | R-SECURITY-002 R-SECURITY-004: CSRF token is enforced on every mutating route | PASS |
| `tests/integration/security-dast.test.ts` | baseline DAST (R-SECURITY-004, R-SECURITY-002) | R-SECURITY-002 R-SECURITY-004: CSP, nosniff, HSTS, referrer policy and no-store on API, SPA, static, attachment and export responses | PASS |
| `tests/integration/security-dast.test.ts` | baseline DAST (R-SECURITY-004, R-SECURITY-002) | R-SECURITY-002 R-SECURITY-004: session cookie flags, no session fixation, logout invalidates, no user enumeration | PASS |
| `tests/integration/security-dast.test.ts` | baseline DAST (R-SECURITY-004, R-SECURITY-002) | R-SECURITY-002 R-SECURITY-004: IDOR — another user gets 404 for private pages, attachments, comments, revisions, uploads | PASS |
| `tests/integration/security-dast.test.ts` | baseline DAST (R-SECURITY-004, R-SECURITY-002) | R-SECURITY-002 R-SECURITY-004: XSS payloads in titles, comments, file names and imports are inert in exports and public pages | PASS |
| `tests/integration/security-dast.test.ts` | baseline DAST (R-SECURITY-004, R-SECURITY-002) | R-SECURITY-002 R-SECURITY-004 R-SECURITY-008: SSRF — image by URL and import never reach loopback/private/metadata addresses | PASS |
| `tests/integration/security-dast.test.ts` | baseline DAST (R-SECURITY-004, R-SECURITY-002) | R-SECURITY-002 R-SECURITY-004: no open redirects | PASS |
| `tests/integration/security-dast.test.ts` | baseline DAST (R-SECURITY-004, R-SECURITY-002) | R-SECURITY-002 R-SECURITY-004: path traversal on static, attachment, tile, signed-file and public-file routes | PASS |
| `tests/integration/security-dast.test.ts` | baseline DAST (R-SECURITY-004, R-SECURITY-002) | R-SECURITY-002 R-SECURITY-004: malformed input → 4xx without stack traces or SQL; prototype pollution refused | PASS |
| `tests/integration/security-dast.test.ts` | baseline DAST (R-SECURITY-004, R-SECURITY-002) | R-SECURITY-002 R-SECURITY-004: no CORS read access for foreign origins | PASS |
| `tests/integration/security-dast.test.ts` | baseline DAST (R-SECURITY-004, R-SECURITY-002) | R-SECURITY-002 R-SECURITY-004: WebSockets refuse foreign origins and anonymous clients | PASS |
| `tests/integration/security-dast.test.ts` | baseline DAST (R-SECURITY-004, R-SECURITY-002) | R-SECURITY-002 R-SECURITY-004: login and API rate limits hold behind one proxy hop, X-Forwarded-For spoofing does not bypass them | PASS |
| `tests/integration/security-dast.test.ts` | baseline DAST (R-SECURITY-004, R-SECURITY-002) | R-SECURITY-002: with COOKIE_SECURE (the production default) session and CSRF cookies carry Secure | PASS |
| `tests/integration/security-dast.test.ts` | baseline DAST (R-SECURITY-004, R-SECURITY-002) | R-SECURITY-002: with the default TRUST_PROXY (unset) X-Forwarded-For is ignored — the audit IP is the socket address | PASS |
| `tests/integration/security-headers.test.ts` | security headers for user content (SECURITY) | app pages: CSP forbids framing the app and limits frames to same origin and allow-listed video hosts | PASS |
| `tests/integration/security-headers.test.ts` | security headers for user content (SECURITY) | uploaded SVG/HTML-like content is served sandboxed with nosniff; PDF is script-free but viewable | PASS |

### Отказоустойчивость и восстановление (vitest, отдельные процессы сервера)

Запуск: `npm run test:resilience`. Тестов: **26**.

| Файл | Группа | Тест | Результат |
|---|---|---|---|
| `tests/resilience/backup-restore.test.ts` | backup → restore drill (SC-30, AT-60, AT-87, V16-S20, OPS-011, QA26-18) | restores content, attachment bytes, history, permissions and the audit chain into a new installation; search works and respects ACL (E-08, D-08, R-BACKUP-001, R-BACKUP-002, R-BACKUP-015, R-BACKUP-019, V18-A25, V16-S20) | PASS |
| `tests/resilience/backup-restore.test.ts` | backup → restore drill (SC-30, AT-60, AT-87, V16-S20, OPS-011, QA26-18) | a damaged backup is rejected by restore and verification (E-08, AT-60) | PASS |
| `tests/resilience/crash-restart.test.ts` | server crash during editing (OPS-009, V17-F04, E-01) | acknowledged edits survive a SIGKILL; in-flight and offline edits are kept and applied once after restart (E-02, E-13, OPS-003) | PASS |
| `tests/resilience/crash-restart.test.ts` | server crash during editing (OPS-009, V17-F04, E-01) | an operation persisted before the crash whose acknowledgement was lost is not duplicated on resend (E-03, D-02, OPS-004) | PASS |
| `tests/resilience/crash-restart.test.ts` | server crash during editing (OPS-009, V17-F04, E-01) | continuous typing across a crash: every token persists exactly once (E-01, E-03) | PASS |
| `tests/resilience/db-connection-loss.test.ts` | database connection loss during editing (SC-30, E-13, D-10) | unacknowledged operations are never shown as saved and all of them persist after the database returns (E-01, D-01, OPS-003) | PASS |
| `tests/resilience/db-connection-loss.test.ts` | database connection loss during editing (SC-30, E-13, D-10) | readiness reports the database outage and recovers (R-OPS-006, R-OPS-003) | PASS |
| `tests/resilience/db-connection-loss.test.ts` | database connection loss during editing (SC-30, E-13, D-10) | a connection killed in the middle of a transaction does not crash the server process (R-OPS-002, E-01) | PASS |
| `tests/resilience/db-connection-loss.test.ts` | database connection loss during editing (SC-30, E-13, D-10) | cross-instance live updates resume after the database returns (event bus reconnects) (SC-30, R-OPS-006, R-OPS-016) | PASS |
| `tests/resilience/db-connection-loss.test.ts` | database connection loss during editing (SC-30, E-13, D-10) | database lost between applying and committing an operation: no "saved", and it is not silently dropped (E-01, E-13, D-01) | PASS |
| `tests/resilience/db-connection-loss.test.ts` | database connection loss during editing (SC-30, E-13, D-10) | a transaction whose connection is killed before COMMIT is retried transparently (E-01, R-OPS-002) | PASS |
| `tests/resilience/db-connection-loss.test.ts` | database connection loss during editing (SC-30, E-13, D-10) | requests during a database outage get 503 with a Russian message instead of 500 (R-OPS-006, D-10) | PASS |
| `tests/resilience/dr-drill.test.ts` |  | PostgreSQL server binaries (initdb, pg_verifybackup) or age are not installed: install postgresql-16 and age to run the drill (V18-A25) | BLOCKED (не запускался) |
| `tests/resilience/io-p0-partial-restore.test.ts` | partial restore from a backup (R-BACKUP-015) | space restore from a backup restored into a temporary database: impact preview with per-page diff, then pages come back as new versions or recreated pages with their files, without overwriting live data (R-BACKUP-015, R-BACKUP-019) | PASS |
| `tests/resilience/migrations-fresh.test.ts` | migrations on a fresh database: up → down → up (R-OPS-022, E-14) | the CLI applies all migrations to an empty database, rolls every one back without leftovers and re-applies them to an identical schema (R-OPS-022, E-14, R-OPS-003) | PASS |
| `tests/resilience/migrations.test.ts` | schema migrations: rollback and re-apply (E-14, OPS-002, R-OPS-001) | every migration rolls back and re-applies step by step with data present; the application keeps working (E-14, OPS-002, R-OPS-001, R-OPS-004, R-OPS-007) | PASS |
| `tests/resilience/migrations.test.ts` | schema migrations: rollback and re-apply (E-14, OPS-002, R-OPS-001) | a complete rollback to an empty schema and a fresh re-apply both succeed (E-14, R-OPS-007) | PASS |
| `tests/resilience/migrations.test.ts` | schema migrations: rollback and re-apply (E-14, OPS-002, R-OPS-001) | an older release refuses to start against a newer schema instead of running on it (OPS-002, E-14, R-OPS-004) | PASS |
| `tests/resilience/migrations.test.ts` | schema migrations: rollback and re-apply (E-14, OPS-002, R-OPS-001) | pending migrations on a database with data are refused until a fresh full backup is recorded; backup.sh unlocks them, the CLI enforces it too (R-OPS-001, R-OPS-004) | PASS |
| `tests/resilience/offsite-sync.test.ts` | offsite copy to a second medium (R-BACKUP-012) | refuses to ship unencrypted backups off the site (R-BACKUP-012, R-BACKUP-006) | PASS |
| `tests/resilience/offsite-sync.test.ts` | offsite copy to a second medium (R-BACKUP-012) | copies add-only and read-only, verifies SHA256SUMS at the destination, survives deletion at the source and detects tampering (R-BACKUP-012, R-BACKUP-003) | PASS |
| `tests/resilience/pitr.test.ts` |  | recovers database and files to the moment before the incident; later damage is absent, earlier data, files, ACL and audit intact (R-BACKUP-011, R-BACKUP-008, V17-F05, R-BACKUP-001, R-BACKUP-010, R-BACKUP-018, SC-30) | PASS |
| `tests/resilience/pitr.test.ts` |  | PostgreSQL server binaries are not installed: run scripts/backup/pitr-drill.sh manually (see wal-archive.md) | BLOCKED (skipped (skipped)) |
| `tests/resilience/storage-failure.test.ts` | object storage failure on upload (SC-30, D-03) | blob area not writable → clean error, no orphan rows; retry after recovery stores the file (D-03, E-01) | PASS |
| `tests/resilience/storage-failure.test.ts` | object storage failure on upload (SC-30, D-03) | disk full while committing the object → clean error, resumable session marked failed; a new upload succeeds (D-03) | PASS |
| `tests/resilience/storage-failure.test.ts` | object storage failure on upload (SC-30, D-03) | temporary area unusable → readiness reports storage error, upload fails cleanly, both recover (R-OPS-006, D-03) | PASS |

### Браузерные E2E (Playwright, Chromium)

Запуск: `npm run test:e2e`. Тестов: **167**.

| Файл | Группа | Тест | Результат |
|---|---|---|---|
| `tests/e2e/a11y.spec.ts` |  | WCAG 2.1 AA automated audit of key screens (R-A11Y-003, AT-80, E2E-112) | FAIL (Error: page: serious/critical WCAG 2.1 AA violations) |
| `tests/e2e/a11y.spec.ts` |  | keyboard only: quick switcher, help, dialogs close with Esc and return focus (UX-136, SC-34) | BLOCKED (skipped (not executed: serial group stopped earlier or skipped without reason)) |
| `tests/e2e/a11y.spec.ts` |  | reduced motion: animations and transitions are effectively disabled (R-A11Y-002, AT-82) | BLOCKED (skipped (not executed: serial group stopped earlier or skipped without reason)) |
| `tests/e2e/a11y.spec.ts` |  | real 200% browser zoom (1280x800 at 2x = 640x400 CSS px) keeps every key screen usable (AT-81, UX-147, V18-A18) | BLOCKED (skipped (not executed: serial group stopped earlier or skipped without reason)) |
| `tests/e2e/a11y.spec.ts` |  | pixel baselines for stable screens (R-QA-008, AT-89) | BLOCKED (skipped (not executed: serial group stopped earlier or skipped without reason)) |
| `tests/e2e/acl-p0-admin.spec.ts` |  | R-ADMIN-018 V16-S15: the administrator checks a user\'s access to a document — decision, actions, sources — without impersonation and without seeing private titles | BLOCKED (не запускался) |
| `tests/e2e/acl-p0-admin.spec.ts` |  | R-ACL-056: emergency access is requested with a reason, approved by a second administrator and appears in the audit log | PASS |
| `tests/e2e/acl-p0-admin.spec.ts` |  | ROUTE-06: the auditor reads who changed what in the journal but does not see titles or content of documents without access | PASS |
| `tests/e2e/acl-p0-routes.spec.ts` |  | ROUTE-04: administrator route — department → employee → automatic space access → guest on a section for a term → suspension → sessions revoked → explanation → audit and backup → restore of a test copy | PASS |
| `tests/e2e/acl-p0-routes.spec.ts` |  | ROUTE-03: space manager route — members and group access → template → tree drag-and-drop → publication control → restore of a deleted branch | PASS |
| `tests/e2e/acl-p0-routes.spec.ts` |  | ROUTE-01: employee route — login → own spaces → regulation → search → one-click article in the department → formatting → Excel and image paste → link within rights → logout and return without losses | PASS |
| `tests/e2e/acl-p0-spaces.spec.ts` |  | R-SPACE-001 R-SPACE-010 R-ADMIN-020: a space is created in the UI and a department gets access automatically; members are managed on the «Участники» tab | PASS |
| `tests/e2e/acl-p0-spaces.spec.ts` |  | R-ACL-021 R-ACL-036: share dialog — department preset, quick expiry, start date, reason, flags, then «Только я» with the list of who loses access | PASS |
| `tests/e2e/acl-p0-spaces.spec.ts` |  | R-ACL-051: a shared personal page shows «Не полностью личная» in the header and in the share dialog | PASS |
| `tests/e2e/acl-p0-spaces.spec.ts` |  | E2E-109 R-PUBLISH-009: public links are off by policy; once enabled a link opens without login, is not indexed and stops after revocation | PASS |
| `tests/e2e/acl-p0-ui.spec.ts` |  | QA26-24 R-ACL-075 R-ACL-076: in the browser the UI shows exactly the server rights; no bypass via URL or API; revocation removes access and the local copy (R-ACL-025) | PASS |
| `tests/e2e/acl-p0-ui.spec.ts` |  | R-ACL-075 QA26-24: the same access-control checks on a phone (Pixel 7 viewport, touch) | PASS |
| `tests/e2e/acl-p0-ui.spec.ts` |  | AT-79: copying a page does not put titles of linked pages the reader cannot open on the clipboard (Ctrl+C and «Копировать страницу») | PASS |
| `tests/e2e/clipboard.spec.ts` |  | Word paste keeps headings, nested and numbered lists, links and tables without Office styles (AT-44, UX13-02, E209, R-CLIPBOARD-020, R-CLIPBOARD-022) | PASS |
| `tests/e2e/clipboard.spec.ts` |  | web HTML paste: scripts removed, embedded image uploaded as an attachment (E210, SC-06, R-CLIPBOARD-009) | PASS |
| `tests/e2e/clipboard.spec.ts` |  | page menu copies the page with formatting, as text and as Markdown (R-CLIPBOARD-002, R-CLIPBOARD-004, SC-08) | PASS |
| `tests/e2e/clipboard.spec.ts` |  | refused clipboard access shows an error and the text for manual copying, not a false success (R-CLIPBOARD-008, SC-10) | PASS |
| `tests/e2e/clipboard.spec.ts` |  | table copy for Excel puts TSV and an HTML table on the clipboard (R-CLIPBOARD-006, R-CLIPBOARD-017, SC-09) | PASS |
| `tests/e2e/clipboard.spec.ts` |  | converting formatted text to a code block asks first and keeps the text (R-EDITOR-067, R-EDITOR-003) | PASS |
| `tests/e2e/clipboard.spec.ts` |  | caret position of a page is restored when it is opened again (R-EDITOR-037, R-EDITOR-001) | PASS |
| `tests/e2e/clipboard.spec.ts` |  | registry block from the slash menu shows the new collection (R-COLLECTION-001) | PASS |
| `tests/e2e/clipboard.spec.ts` |  | image viewer: click on a selected image opens it; zoom is limited to 10–800 % (R-MEDIA-015, R-MEDIA-019, R-MEDIA-021) | PASS |
| `tests/e2e/collab-p0-editing.spec.ts` |  | two editors change a paragraph, one table and the structure while one loses the connection: no confirmed text is lost (ROUTE-05, SC-25, AT-56, R-COLLAB-024) | PASS |
| `tests/e2e/collab-p0-editing.spec.ts` |  | a block is moved by one editor while another edits it: the edit is kept as a conflict copy and restored in one click (OPS-006, R-COLLAB-049, R-COLLAB-045, R-COLLAB-041, R-COLLAB-033, E-04, COLLAB-193, AT-90) | FAIL (Error: expect(received).toMatchObject(expected)) |
| `tests/e2e/collab-p0-editing.spec.ts` |  | undo of a block move never silently drops a colleague's edits (UX13-10, R-HISTORY-011) | BLOCKED (skipped (not executed: serial group stopped earlier or skipped without reason)) |
| `tests/e2e/collab-p0-editing.spec.ts` |  | undo/redo sequences of 100 and 1000 steps, transform and delete are reversible; history does not cross a reload (QA26-14, R-HISTORY-017, R-HISTORY-011) | BLOCKED (skipped (not executed: serial group stopped earlier or skipped without reason)) |
| `tests/e2e/collab-p0-editing.spec.ts` |  | Esc in the empty title of a new page cancels it; a double "+" on a slow network creates exactly one page (R-TREE-025, UX23-203) | BLOCKED (skipped (not executed: serial group stopped earlier or skipped without reason)) |
| `tests/e2e/collab-p0-offline.spec.ts` |  | reload without network reopens the local copy with an honest status; the queue is delivered after reconnect (E-02, AT-75, R-OFFLINE-010, R-OFFLINE-003, R-OFFLINE-005, AT-90) | PASS |
| `tests/e2e/collab-p0-offline.spec.ts` |  | two tabs of the same user edit one page online and offline: no loss, no duplicates (UX23-216, R-OFFLINE-010) | PASS |
| `tests/e2e/collab-p0-offline.spec.ts` |  | one browser, two accounts: a user's unsent changes are never sent or shown under another account (R-OFFLINE-007) | PASS |
| `tests/e2e/collab-p0-storage.spec.ts` |  | device storage is full: explicit warning, error status instead of "saved on device", local copy can be downloaded (R-OFFLINE-006, R-COLLAB-017, AT-90) | PASS |
| `tests/e2e/collab-p0-storage.spec.ts` |  | the server cannot store changes: visible error (never endless "Сохранение…"), local copy offered, automatic retry succeeds (AT-59, R-COLLAB-017) | PASS |
| `tests/e2e/collab-p0-storage.spec.ts` |  | offline local-copy screen lets the user extract local edits (AT-90, R-OFFLINE-010) | PASS |
| `tests/e2e/collab.spec.ts` |  | two people edit the same page: changes converge, presence is shown, revoking edit makes it read-only (E219, R-COLLAB-006, R-COLLAB-012) | PASS |
| `tests/e2e/collab.spec.ts` |  | history: save a version, change text, restore the version (R-HISTORY-004, UX13-14, UX21-201) | PASS |
| `tests/e2e/collab.spec.ts` |  | search finds a page by a word from its body and jumps to the block (V16-S01, R-SEARCH-005) | PASS |
| `tests/e2e/collab.spec.ts` |  | paste: spreadsheet range becomes a table; Markdown becomes formatted blocks | PASS |
| `tests/e2e/collab.spec.ts` |  | typing latency on a long document stays within budget | PASS |
| `tests/e2e/conflict.spec.ts` |  | edit vs concurrent delete: the editor keeps a conflict copy and can put the block back (E-04, AT-77, COLLAB-193, R-COLLAB-045, UX13-10) | PASS |
| `tests/e2e/conflict.spec.ts` |  | R-COLLAB-036: conflict dialog — «keep both» keeps the deletion result and adds my version as a separate block; «decide later» leaves a reminder | PASS |
| `tests/e2e/conflict.spec.ts` |  | R-COLLAB-036: conflict dialog — «accept the server version» keeps the deletion, my version stays in the page history | PASS |
| `tests/e2e/conflict.spec.ts` |  | R-COLLAB-036: a change the server refuses opens the comparison dialog; «keep both» saves my version as a new page, the editor continues on the server version | PASS |
| `tests/e2e/content.spec.ts` |  | image: upload via file chooser, resize presets, caption, full-screen viewer with zoom | PASS |
| `tests/e2e/content.spec.ts` |  | sidebar tree: "+" creates a child page under the selected parent with focus in the title (R-TREE-002, UX-121, UX23-201) | FAIL (Test timeout of 60000ms exceeded.) |
| `tests/e2e/content.spec.ts` |  | comment on a selection appears in the comments panel | BLOCKED (skipped (not executed: serial group stopped earlier or skipped without reason)) |
| `tests/e2e/editor-p0-blocks.spec.ts` |  | text blocks: paragraph, H1–H6, lead, quote and divider are created from the "/" menu; body text is hyphenated (R-EDITOR-007) | PASS |
| `tests/e2e/editor-p0-blocks.spec.ts` |  | selection modes: word, paragraph, Shift+arrows, across blocks, Ctrl+A block → article, Esc → block, several blocks (R-EDITOR-068, E201) | PASS |
| `tests/e2e/editor-p0-blocks.spec.ts` |  | formatting keeps the selection: bold, italic and toolbar underline apply to the same range (E202) | PASS |
| `tests/e2e/editor-p0-blocks.spec.ts` |  | moving blocks: one block by keyboard and block menu, several selected blocks together — order and ids kept (E213, UX21-186, R-EDITOR-049) | PASS |
| `tests/e2e/editor-p0-clipboard-fidelity.spec.ts` |  | Word 365: HTML + RTF of one copy — five heading levels, nested lists, table, link, picture from the RTF with its caption (UX13-02, R-CLIPBOARD-020, SC-06) | PASS |
| `tests/e2e/editor-p0-clipboard-fidelity.spec.ts` |  | RTF-only clipboard (WordPad / Outlook): the same structure (R-CLIPBOARD-020) | PASS |
| `tests/e2e/editor-p0-clipboard-fidelity.spec.ts` |  | Google Docs: H1–H6, nested lists, table, unwrapped links; its picture is copied to the server (R-CLIPBOARD-020, SC-06) | PASS |
| `tests/e2e/editor-p0-clipboard-fidelity.spec.ts` |  | mail (Outlook) and a web article: structure kept, trackers / navigation / scripts removed (R-CLIPBOARD-020, R-CLIPBOARD-024, SC-06) | PASS |
| `tests/e2e/editor-p0-clipboard-fidelity.spec.ts` |  | copy / cut / paste between articles with the keyboard: types, ids, attributes kept; images become attachments of the target page; external apps get text/html + text/plain (R-CLIPBOARD-018, R-CLIPBOARD-024) | PASS |
| `tests/e2e/editor-p0-clipboard-fidelity.spec.ts` |  | paste priority: internal format → HTML → plain text; a forged internal format from another site is ignored (R-CLIPBOARD-018) | PASS |
| `tests/e2e/editor-p0-clipboard.spec.ts` |  | paste options: «Сохранить форматирование», «Объединить», «Только текст»; scripts and trackers removed (R-CLIPBOARD-009, R-CLIPBOARD-024) | PASS |
| `tests/e2e/editor-p0-clipboard.spec.ts` |  | copy: a text selection, a block and a section of a heading go to the clipboard as text/html and text/plain (R-CLIPBOARD-001) | PASS |
| `tests/e2e/editor-p0-clipboard.spec.ts` |  | a multi-page document with tables, images and links is pasted with its structure, and one Undo returns the page to its original state (V17-F01) | PASS |
| `tests/e2e/editor-p0-core.spec.ts` |  | caret and selection stay in place while a colleague edits, during autosave and after a network failure (R-EDITOR-022, R-EDITOR-001) | PASS |
| `tests/e2e/editor-p0-core.spec.ts` |  | IME composition commits once, coexists with a colleague typing and autosave, and undo reverts only own input (E221, R-EDITOR-021, R-EDITOR-053) | PASS |
| `tests/e2e/editor-p0-core.spec.ts` |  | Cyrillic, Russian quotes, emoji and a very long URL are typed, saved and laid out correctly (R-EDITOR-021, R-EDITOR-033) | PASS |
| `tests/e2e/editor-p0-core.spec.ts` |  | a document of 100 000+ characters (50+ pages pasted at once) stays editable: caret after the paste, one undo step, saved in full (R-EDITOR-021, R-EDITOR-033) | PASS |
| `tests/e2e/editor-p0-core.spec.ts` |  | key matrix: Enter, Enter on empty item, Tab/Shift+Tab, Backspace at the start and on empty blocks behave by the documented rules (R-EDITOR-065, R-EDITOR-034, E208) | PASS |
| `tests/e2e/editor-p0-dnd.spec.ts` |  | drag threshold, preview, line before/after, one atomic drop, one Undo; ids kept on the server (R-EDITOR-069, R-EDITOR-075, R-HISTORY-017) | PASS |
| `tests/e2e/editor-p0-dnd.spec.ts` |  | Esc cancels a drag; a fast drag lands exactly; dropping in place changes nothing (QA26-09) | PASS |
| `tests/e2e/editor-p0-dnd.spec.ts` |  | inside a callout, between columns with the column highlighted, invalid target explained (R-EDITOR-075, R-EDITOR-076) | PASS |
| `tests/e2e/editor-p0-dnd.spec.ts` |  | several selected blocks; images, tables and nested lists move whole; Alt-drag copies (R-EDITOR-076, QA26-09) | PASS |
| `tests/e2e/editor-p0-dnd.spec.ts` |  | autoscroll near the bottom edge while dragging, drop far below (QA26-09) | PASS |
| `tests/e2e/editor-p0-dnd.spec.ts` |  | drop on another page in the sidebar tree moves the blocks there (ids kept); the page itself and a page without edit rights are refused (R-EDITOR-076) | BLOCKED (не запускался) |
| `tests/e2e/editor-p0-dnd.spec.ts` |  | keyboard alternatives: Alt+Shift+↑/↓ move (also out of a callout / column), Esc twice selects the column set (R-EDITOR-069, R-EDITOR-052) | BLOCKED (skipped (not executed: serial group stopped earlier or skipped without reason)) |
| `tests/e2e/editor-p0-dnd.spec.ts` |  | pages and whole branches in the tree: into a collapsed node (auto-expand), not into their own descendant, Esc cancels (QA26-09) | BLOCKED (не запускался) |
| `tests/e2e/editor-p0-dnd.spec.ts` |  | tree: dragging a page to the bottom edge scrolls the tree, the drop lands under the pointer (QA26-09) | BLOCKED (не запускался) |
| `tests/e2e/editor-p0-dnd.spec.ts` |  | tree: a section (space) the user may only read is an explicit invalid target — on the space and between its pages (QA26-09) | BLOCKED (не запускался) |
| `tests/e2e/editor-p0-media.spec.ts` |  | pasted image: instant local preview, upload error keeps the block, retry completes it with alt (R-MEDIA-006, R-MEDIA-008) | PASS |
| `tests/e2e/editor-p0-media.spec.ts` |  | closing the tab during an image upload: the block and the file are restored and the upload finishes on next open (UX13-03, R-MEDIA-006) | PASS |
| `tests/e2e/editor-p0-media.spec.ts` |  | cancelling an upload removes only that block (R-MEDIA-006) | PASS |
| `tests/e2e/editor-p0-media.spec.ts` |  | image by URL: dialog with preview, internal addresses refused, the image is stored as an attachment of the page (R-MEDIA-009) | PASS |
| `tests/e2e/editor-p0-media.spec.ts` |  | an image file dropped onto the page appears at once with a local preview and is stored as an attachment (R-MEDIA-009) | PASS |
| `tests/e2e/editor-p0-nav.spec.ts` |  | opening another page and coming back from the tree keeps the scroll position and the edits; collapsing the tree does not scroll (R-EDITOR-047) | PASS |
| `tests/e2e/editor-p0-nav.spec.ts` |  | blocks move to another page: removed here only after the target saved them, order, content and ids kept (E215, R-EDITOR-076, R-EDITOR-049) | PASS |
| `tests/e2e/editor-p0-table.spec.ts` |  | table structure: insert/delete rows and columns, header row/column, merge and split, alignment, column width (R-TABLE-003) | PASS |
| `tests/e2e/editor-p0-table.spec.ts` |  | table data: copy a cell range as TSV, paste a range from Excel, move rows and columns, sort by a column (R-TABLE-003) | PASS |
| `tests/e2e/editor-p0-table.spec.ts` |  | concurrent table operations of two people (row added offline vs column added offline) converge to the same rectangular table (OPS-007) | PASS |
| `tests/e2e/editor-p0-undo-ops.spec.ts` |  | typing, formatting, conversion and typing again are separate undo steps without pauses (R-HISTORY-017) | BLOCKED (не запускался) |
| `tests/e2e/editor-p0-undo-ops.spec.ts` |  | image resize by the handle and by a preset, table column resize: each is one undo step (R-HISTORY-017, R-EDITOR-052) | BLOCKED (не запускался) |
| `tests/e2e/editor-p0-undo-ops.spec.ts` |  | macOS keys: ⌘Z undoes, ⌘⇧Z redoes (R-HISTORY-017) | BLOCKED (не запускался) |
| `tests/e2e/editor.spec.ts` |  | first run: organisation setup, personal space and empty states | PASS |
| `tests/e2e/editor.spec.ts` |  | create page, type with Markdown shortcuts, "Сохранено" only after server ack, survives reload (R-PAGE-018, R-PAGE-033, AT-61, UX13-01, UX-144) | FAIL (Error: expect(locator).toBeVisible() failed) |
| `tests/e2e/editor.spec.ts` |  | offline edits are kept locally and delivered after reconnect (E220, AT-57) | BLOCKED (skipped (not executed: serial group stopped earlier or skipped without reason)) |
| `tests/e2e/editor.spec.ts` |  | slash menu inserts a table and a callout; "> " creates a toggle | BLOCKED (skipped (not executed: serial group stopped earlier or skipped without reason)) |
| `tests/e2e/editor.spec.ts` |  | an empty page created by mistake disappears when left; a double click creates one page (R-TREE-025, UX23-203, UX23-202) | BLOCKED (skipped (not executed: serial group stopped earlier or skipped without reason)) |
| `tests/e2e/history-p0.spec.ts` |  | R-HISTORY-013, V16-S11: compare shows text and property changes highlighted; restore shows an exact preview and brings back properties as a new version | PASS |
| `tests/e2e/history-p0.spec.ts` |  | R-HISTORY-013: one block is restored from a version after a preview, as a new version | PASS |
| `tests/e2e/history-p0.spec.ts` |  | R-HISTORY-002: a property change (icon, tag) offers «Отменить» right away; tags are editable and searchable | PASS |
| `tests/e2e/import-collection.spec.ts` |  | R-COLLECTION-003: import into an existing collection in «replace» mode — dry run lists the rows to remove, import waits for an explicit confirmation, removed rows go to the trash | PASS |
| `tests/e2e/io-p0-roundtrip.spec.ts` |  | DOCX import → edit in the editor → DOCX and Markdown export from the page menu keep the structure and the edit (E225, SC-13, R-EXPORT-006, R-EXPORT-012) | PASS |
| `tests/e2e/io-p0-roundtrip.spec.ts` |  | Markdown file import → edit → Markdown export round trip (E225, R-EXPORT-012) | PASS |
| `tests/e2e/io-p0-roundtrip.spec.ts` |  | background export of a branch can be cancelled from the dialog; separate-files ZIP option (R-EXPORT-022) | PASS |
| `tests/e2e/io-p0-roundtrip.spec.ts` |  | archive restore dialog: the administrator chooses a new isolated space as the target (R-ARCHIVE-006, R-ARCHIVE-016) | FAIL (Test timeout of 60000ms exceeded.) |
| `tests/e2e/mobile.layout.spec.ts` |  | mobile: drawer navigation, editor usable, no horizontal scroll | PASS |
| `tests/e2e/ocr-view.spec.ts` |  | SC-22: the OCR view shows the original image, confidence with uncertain words, corrections and provenance | PASS |
| `tests/e2e/ocr-view.spec.ts` |  | R-UI-062: a dialog with typed critical input warns before closing; closing without saving is an explicit choice | PASS |
| `tests/e2e/perf-background.spec.ts` |  | R-PERF-019: typing stays responsive while a large file uploads and an export runs (checksum in a Web Worker vs on the main thread) | PASS |
| `tests/e2e/perf-profile.spec.ts` |  | profile typing | N/A (profiling aid: KB_PERF_PROFILE=1) |
| `tests/e2e/perf-session.spec.ts` |  | E2E-120, UX13-09: long session — 200 formatting toggles and continuous typing; exact final text, nothing lost, saved on the server | PASS |
| `tests/e2e/perf-typing.spec.ts` |  | R-PERF-008, AT-84: typing in a 10 000-word article with CPU throttled 4x — 240 samples, p95/p99 journaled against 50/100 ms, no lost characters | PASS |
| `tests/e2e/perf-typing.spec.ts` |  | SC-04: 5 000 blocks and a long table: typing keeps the caret in place and loses no characters | PASS |
| `tests/e2e/perf-typing.spec.ts` |  | R-PERF-013: typing starts no animations on document content (input latency journaled) | PASS |
| `tests/e2e/qa-actions.spec.ts` |  | QA actions setup: owner, a project space | PASS |
| `tests/e2e/qa-actions.spec.ts` |  | R-QA-004 API tokens: empty name disables «Создать токен»; slow network shows progress and a double click creates one token; «Я сохранил токен»; revoke: cancel keeps it, confirm removes it and shows the empty state; server error keeps the input | PASS |
| `tests/e2e/qa-actions.spec.ts` |  | QA-D3 (known defect): an instantaneous double activation of «Создать токен» sends one request | FAIL (known defect: QA-D3: two presses within the same few milliseconds create two tok) |
| `tests/e2e/qa-actions.spec.ts` |  | R-QA-029 offline: «Создать токен» without a network explains the failure and works after reconnecting | PASS |
| `tests/e2e/qa-actions.spec.ts` |  | R-QA-004 password change (separate account): empty form is disabled, mismatch and wrong current password are explained without losing input, success needs one click | PASS |
| `tests/e2e/qa-actions.spec.ts` |  | R-QA-004 sessions: «Завершить остальные» — cancel keeps the other device signed in, confirm signs it out | PASS |
| `tests/e2e/qa-actions.spec.ts` |  | R-QA-004 trash: «Удалить в корзину» from the tree → toast «Восстановить» undoes it; trash «Восстановить» (double click restores once); «Удалить навсегда» — cancel keeps it, typed confirmation purges; server error on restore keeps the item | PASS |
| `tests/e2e/qa-actions.spec.ts` |  | QA-D4 (known defect): «Переименовать» in the tree row menu opens the inline title editor | FAIL (known defect: QA-D4: choosing «Переименовать» in the row menu mounts the editor,) |
| `tests/e2e/qa-actions.spec.ts` |  | R-QA-004 tree row: rename (F2) — Esc cancels, Enter saves, server error keeps the old title; «Дублировать» opens the copy; «Переместить в…» closes with Esc without moving | PASS |
| `tests/e2e/qa-actions.spec.ts` |  | R-QA-004 page menu: «Сохранить как шаблон», «Дублировать», «Удалить» with «Восстановить» from the toast | PASS |
| `tests/e2e/qa-actions.spec.ts` |  | R-QA-029 no permission: a viewer sees page and tree actions disabled with the reason, and the server refuses them | PASS |
| `tests/e2e/qa-actions.spec.ts` |  | R-QA-004 search: empty result explains itself, «Очистить» resets the query, a server error offers «Повторить» | PASS |
| `tests/e2e/qa-actions.spec.ts` |  | QA-D5 (known defect): «Настройки и участники» in the sidebar space menu opens the space settings | FAIL (known defect: QA-D5: the menu navigates to /s/:id?tab=settings, but SpacePage ke) |
| `tests/e2e/qa-actions.spec.ts` |  | R-QA-004 space settings: «Удалить пространство» — cancel keeps it, typed confirmation moves it to the trash, the trash restores it | PASS |
| `tests/e2e/qa-actions.spec.ts` |  | R-QA-004 editor "/" menu: every block command inserts its block; dialog commands close with «Отмена»/Esc without inserting | PASS |
| `tests/e2e/qa-actions.spec.ts` |  | QA-D6 (known defect): inserting column blocks from the "/" menu raises no uncaught editor error | FAIL (known defect: QA-D6: the placeholder callback (editor/clientExtensions.ts) resol) |
| `tests/e2e/qa-actions.spec.ts` |  | R-QA-004 block menu «Действия с блоком»: «Дублировать», «Переместить вверх», «Цвет текста», «Удалить» and Ctrl+Z; Esc closes the menu without changes | PASS |
| `tests/e2e/qa-actions.spec.ts` |  | QA-D7 (known defect): the block menu acts on the block it is opened next to, also after it was opened for another block | FAIL (known defect: QA-D7: once the block menu was opened for one block (and closed wi) |
| `tests/e2e/qa-actions.spec.ts` |  | QA-D8 (known defect): the «Цвет текста» submenu of the block menu opens inside the window and can be clicked | FAIL (known defect: QA-D8: for a block next to the sidebar the submenu is positioned o) |
| `tests/e2e/qa-actions.spec.ts` |  | R-QA-004 admin users menu: «Сбросить пароль» (cancel, then link), «Изменить профиль и роль» (nothing to save until changed), «Деактивировать (увольнение)…» needs acknowledgement and cancels, «Приостановить доступ…» → «Восстановить доступ»; own row cannot be disabled | PASS |
| `tests/e2e/qa-actions.spec.ts` |  | R-QA-004 templates: «Новый шаблон» — empty name disables «Создать шаблон», «Отмена» creates nothing, create; «Удалить шаблон «…»» — cancel keeps it, confirm removes it | PASS |
| `tests/e2e/qa-actions.spec.ts` |  | R-QA-004 invitation link /invite/:token: empty password disables «Продолжить», an invalid link and a short password are explained, a valid one signs the employee in | PASS |
| `tests/e2e/qa-actions.spec.ts` |  | R-QA-004 navigation: sidebar «Шаблоны», «Импорт», «Корзина» and the quick switcher commands «Корзина», «Импорт документов» open their screens | PASS |
| `tests/e2e/qa-actions.spec.ts` |  | R-QA-004 profile (separate account): «Сохранить» needs a change, «Отменить» restores the form, a server error keeps the input, success saves the name | PASS |
| `tests/e2e/qa-actions.spec.ts` |  | R-QA-004 organisation name: «Переименовать» is unavailable without a change and a server error is explained without renaming | PASS |
| `tests/e2e/qa-crawl.spec.ts` |  | QA26-04 seed: a space with a page, a comment thread and a trashed page | PASS |
| `tests/e2e/qa-crawl.spec.ts` |  | QA26-01, QA26-04, R-UI-026: every route rendered as owner exposes only named controls; runtime inventory recorded | PASS |
| `tests/e2e/route-author.spec.ts` |  | ROUTE-02: draft → offline → sync → move to a department with visibility preview → approval → publication → update and rollback | PASS |
| `tests/e2e/ui-p0-interaction.spec.ts` |  | prepare pages | PASS |
| `tests/e2e/ui-p0-interaction.spec.ts` |  | R-UI-059, R-UI-008, E224: menus at viewport edges flip/shift inside the window, keep keyboard focus, close with Esc or outside click and return focus | PASS |
| `tests/e2e/ui-p0-interaction.spec.ts` |  | R-UI-059, R-UI-053: dialogs trap focus, always have a visible exit and Esc, and return focus to the opener | PASS |
| `tests/e2e/ui-p0-interaction.spec.ts` |  | R-UI-060, UX-141: hovering controls performs no action; hover-only tree actions have a keyboard equivalent | FAIL (Test timeout of 60000ms exceeded.) |
| `tests/e2e/ui-p0-interaction.spec.ts` |  | R-UI-053: a server that does not answer gives an explanation and a retry instead of an endless spinner | BLOCKED (skipped (not executed: serial group stopped earlier or skipped without reason)) |
| `tests/e2e/ui-p0-interaction.spec.ts` |  | R-UI-053, R-UI-068: disabled actions always say why (view-only user) | BLOCKED (skipped (not executed: serial group stopped earlier or skipped without reason)) |
| `tests/e2e/ui-p0-interaction.spec.ts` |  | R-UI-062: a new page is never created "nowhere" and a draft survives an immediate reload | BLOCKED (skipped (not executed: serial group stopped earlier or skipped without reason)) |
| `tests/e2e/ui-p0-interaction.spec.ts` |  | R-UI-009, R-UI-052: failed actions are shown with what happened, that nothing was saved, and what to do | BLOCKED (skipped (not executed: serial group stopped earlier or skipped without reason)) |
| `tests/e2e/ui-p0-interaction.spec.ts` |  | R-UI-009: no uncaught script errors occurred in any scenario above | BLOCKED (skipped (not executed: serial group stopped earlier or skipped without reason)) |
| `tests/e2e/ui-p0-layout.spec.ts` |  | prepare a page with headings, long words, a list and a table | PASS |
| `tests/e2e/ui-p0-layout.spec.ts` |  | R-UI-006, R-UI-040: opening a page and typing cause no layout shift (CLS < 0.02) | PASS |
| `tests/e2e/ui-p0-layout.spec.ts` |  | R-UI-006: switching pages, opening and closing the side panel cause no layout shift | PASS |
| `tests/e2e/ui-p0-layout.spec.ts` |  | R-UI-006, V17-F09: no overlapping, clipped or off-screen controls at 320–1920 px (${theme}) | PASS |
| `tests/e2e/ui-p0-layout.spec.ts` |  | V18-A18, AT-81: real 200 % zoom (DPR 2, 640×400 CSS px) — no overlaps or clipped controls | PASS |
| `tests/e2e/ui-p0-touch.spec.ts` |  | UX-146, R-UI-058: on a touch phone the floating "+" inserts a block without hover | PASS |
| `tests/e2e/ui-p0-touch.spec.ts` |  | R-A11Y-008: touch targets on a phone are at least 44×44 CSS px | PASS |
| `tests/e2e/ui-p0-touch.spec.ts` |  | UX-131: Back restores the reading position of a long page | PASS |
| `tests/e2e/undo.spec.ts` |  | undo/redo of typing: 1 and 10 steps, Ctrl+Shift+Z and Ctrl+Y; result is saved (QA26-14, UX21-196, UX21-198, R-HISTORY-017, R-HISTORY-018, HIST-188) | PASS |
| `tests/e2e/undo.spec.ts` |  | undo/redo of formatting keeps the text and the selection (QA26-14, SC-11, R-HISTORY-011, R-HISTORY-017) | PASS |
| `tests/e2e/undo.spec.ts` |  | one undo reverts a paste of 100 blocks and keeps the cursor position (AT-47, R-HISTORY-009, QA26-14) | PASS |
| `tests/e2e/undo.spec.ts` |  | undo of a block move and of a block deletion is precise (UX-138, E2E-118, QA26-14) | PASS |
| `tests/e2e/undo.spec.ts` |  | undo of a table insert (SC-11, R-HISTORY-017, QA26-14) | PASS |
| `tests/e2e/undo.spec.ts` |  | undo reverts only the user's own changes, never a colleague's (SC-27, UX21-200, R-HISTORY-021, R-HISTORY-027, HIST-188) | PASS |
| `tests/e2e/visual.spec.ts` |  | prepare a representative page | PASS |
| `tests/e2e/visual.spec.ts` |  | layout ${w}x${h} ${theme}: no horizontal overflow, key controls reachable | PASS |
| `tests/e2e/visual.spec.ts` |  | 200% zoom (CSS zoom) keeps the page usable | PASS |

