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
* Нет нагрузочных тестов (100 тыс. страниц, 20 одновременных редакторов, 100 читателей) — нужен стенд.
* Задержка ввода измерена на 400 абзацах без троттлинга CPU (p95 ≈ 31 мс); требование ТЗ — 10 тыс. слов и p99 — не доказано.
* Неполные E2E: окно «Поделиться», корзина, шаблоны, импорт, экспорт и администрирование проверены интеграционно и axe-аудитом, но без сквозных пользовательских сценариев.
* Конфликт «правка блока ↔ удаление блока другим автором» сейчас не создаёт копию конфликта (тест фиксирует текущее поведение) — открытый P0.

## Каталог автоматических тестов (сгенерировано)

Всего автоматических тестов: **209** (без учёта параметризованных повторов и 12 комбинаций раскладок).


Сгенерировано `python3 scripts/requirements/test_matrix.py`. ID требований в названиях связывают тест с реестром (см. `REQUIREMENTS_TRACEABILITY.md`).

### Юнит-тесты (vitest)

Запуск: `npm run test:unit`. Тестов: **38**.

| Файл | Группа | Тест |
|---|---|---|
| `tests/unit/clipboard-html.test.ts` | paste sanitizer (R-CLIPBOARD-009, R-CLIPBOARD-010, R-CLIPBOARD-022) | R-CLIPBOARD-022: removes scripts, event handlers, iframes and arbitrary inline styles |
| `tests/unit/clipboard-html.test.ts` | paste sanitizer (R-CLIPBOARD-009, R-CLIPBOARD-010, R-CLIPBOARD-022) | R-CLIPBOARD-010: Word HTML loses Office junk but keeps headings, text, tables (no lost cells) |
| `tests/unit/clipboard-html.test.ts` | paste sanitizer (R-CLIPBOARD-009, R-CLIPBOARD-010, R-CLIPBOARD-022) | R-CLIPBOARD-009: Google Docs bold wrapper with font-weight:normal does not make everything bold |
| `tests/unit/clipboard-html.test.ts` | paste sanitizer (R-CLIPBOARD-009, R-CLIPBOARD-010, R-CLIPBOARD-022) | keeps own palette colours given as rgb(), own fonts and sizes; drops foreign ones |
| `tests/unit/clipboard-html.test.ts` | Word lists (AT-44, UX13-02, R-CLIPBOARD-020) | AT-44: Word list paragraphs become nested bullet and numbered lists |
| `tests/unit/clipboard-html.test.ts` | Word lists (AT-44, UX13-02, R-CLIPBOARD-020) | converts lists inside containers and keeps non-list paragraphs in place |
| `tests/unit/clipboard-html.test.ts` | images in pasted HTML (R-CLIPBOARD-020, SC-06) | SC-06: embedded images are extracted for upload, local Word file paths are reported, tracking pixels dropped |
| `tests/unit/clipboard-html.test.ts` | images in pasted HTML (R-CLIPBOARD-020, SC-06) | turns absolute links and images of this instance back into in-app URLs |
| `tests/unit/clipboard-html.test.ts` | copied HTML (R-CLIPBOARD-004, R-CLIPBOARD-018) | R-CLIPBOARD-018: makes URLs absolute and removes comment anchors and DOM ids, keeps block structure attributes |
| `tests/unit/collab-client.test.ts` | offline status honesty (R-OFFLINE-003, R-OFFLINE-005, R-OFFLINE-006) | "saved on this device" appears only after the local write has completed |
| `tests/unit/collab-client.test.ts` | offline status honesty (R-OFFLINE-003, R-OFFLINE-005, R-OFFLINE-006) | a full or broken local store is reported as an error, never as saved |
| `tests/unit/collab-client.test.ts` | offline status honesty (R-OFFLINE-003, R-OFFLINE-005, R-OFFLINE-006) | acknowledged operations are removed from the store only after their write finished |
| `tests/unit/editor-convert.test.ts` | block conversion keeps content (R-EDITOR-003, R-EDITOR-067, AT-64) | AT-64: paragraph → H2 → paragraph keeps text, marks and the block id |
| `tests/unit/editor-convert.test.ts` | block conversion keeps content (R-EDITOR-003, R-EDITOR-067, AT-64) | R-EDITOR-003: list, checklist, quote and callout conversions keep the text and the paragraph id |
| `tests/unit/editor-convert.test.ts` | block conversion keeps content (R-EDITOR-003, R-EDITOR-067, AT-64) | R-EDITOR-067: converting to code keeps mentions/formulas as text and asks before removing formatting |
| `tests/unit/editor-convert.test.ts` | block conversion keeps content (R-EDITOR-003, R-EDITOR-067, AT-64) | R-EDITOR-067: declining the confirmation leaves formatted text unchanged |
| `tests/unit/editor-convert.test.ts` | caret memory (R-EDITOR-001, R-EDITOR-037) | R-EDITOR-037: caret is stored relative to the block id and survives edits before the block |
| `tests/unit/markdown.test.ts` | markdown import | parses GFM structure into valid document |
| `tests/unit/markdown.test.ts` | markdown import | takes leading H1 as title |
| `tests/unit/markdown.test.ts` | markdown import | converts GitHub alerts into callouts |
| `tests/unit/markdown.test.ts` | markdown import | converts <details> to toggle with nested markdown |
| `tests/unit/markdown.test.ts` | markdown import | lifts images out of paragraphs and reports missing assets |
| `tests/unit/markdown.test.ts` | markdown import | removes unsafe links but keeps text |
| `tests/unit/markdown.test.ts` | markdown import | keeps inline html formatting (underline, mark, sub/sup, color) |
| `tests/unit/markdown.test.ts` | markdown import | converts footnotes without losing text |
| `tests/unit/markdown.test.ts` | markdown export | writes readable markdown and reports degradations |
| `tests/unit/markdown.test.ts` | markdown export | round-trips through import with structure preserved |
| `tests/unit/markdown.test.ts` | markdown export | clean mode omits kb markers |
| `tests/unit/markdown.test.ts` | markdown property: text is never lost | docToMarkdown -> markdownToDoc preserves plain text and block types |
| `tests/unit/schema-migrations.test.ts` | document schema versions (R-EDITOR-023, R-EDITOR-043) | R-EDITOR-023: current documents pass unchanged; older ones are migrated step by step |
| `tests/unit/schema-migrations.test.ts` | document schema versions (R-EDITOR-023, R-EDITOR-043) | R-EDITOR-023: refuses newer schemas and gaps in the migration chain |
| `tests/unit/schema-migrations.test.ts` | document schema versions (R-EDITOR-023, R-EDITOR-043) | R-EDITOR-043: dangerous URLs are detected; unusable ones are cleaned without losing text |
| `tests/unit/schema-migrations.test.ts` | document schema versions (R-EDITOR-023, R-EDITOR-043) | image sources: http(s), in-app, relative assets and raster data URIs only |
| `tests/unit/sha256.test.ts` | incremental SHA-256 of streamed uploads (R-FILES-004, R-FILES-011) | R-FILES-004: matches the reference for edge lengths |
| `tests/unit/sha256.test.ts` | incremental SHA-256 of streamed uploads (R-FILES-004, R-FILES-011) | R-FILES-011: arbitrary chunking gives the same digest as hashing the whole file |
| `tests/unit/totp.test.ts` | TOTP (RFC 6238) — second factor | base32 round trip |
| `tests/unit/totp.test.ts` | TOTP (RFC 6238) — second factor | reference vector at T=%i |
| `tests/unit/totp.test.ts` | TOTP (RFC 6238) — second factor | rejects wrong and far-off codes |

### Интеграционные тесты API на реальном PostgreSQL (vitest)

Запуск: `npm run test:integration`. Тестов: **117**.

| Файл | Группа | Тест |
|---|---|---|
| `tests/integration/acl-gaps.test.ts` | time-based expiry in live sessions (R-ACL-038, V15-A07, ACL-156, R-ACL-063, R-ACL-003) | an expiring edit grant downgrades an open editor to read-only without any client or admin action |
| `tests/integration/acl-gaps.test.ts` | time-based expiry in live sessions (R-ACL-038, V15-A07, ACL-156, R-ACL-063, R-ACL-003) | an expiring view grant closes the live channel of a page the user can no longer see |
| `tests/integration/acl-gaps.test.ts` | time-based expiry in live sessions (R-ACL-038, V15-A07, ACL-156, R-ACL-063, R-ACL-003) | expiry of a temporary department membership is detected the same way (R-ACL-038) |
| `tests/integration/acl-gaps.test.ts` | stored exports re-check access at download (E-12, V16-S04, R-ACL-080, R-ACL-072) | a finished export cannot be downloaded after access to its pages was revoked |
| `tests/integration/acl-gaps.test.ts` | audit: private titles masked, denials logged (ROUTE-06, R-AUDIT-001, OPS-014) | an auditor sees events about a private page but not its title |
| `tests/integration/acl-gaps.test.ts` | audit: private titles masked, denials logged (ROUTE-06, R-AUDIT-001, OPS-014) | access denials are written to the audit log with a rate limit |
| `tests/integration/acl-gaps.test.ts` | guests have no global search (R-ACL-064) | search and suggestions return only pages explicitly shared with the guest |
| `tests/integration/acl-gaps.test.ts` | organisation guest switch beats existing grants (R-ACL-033) | disabling guest access makes existing guest grants ineffective until it is enabled again |
| `tests/integration/acl-gaps.test.ts` | explicit exceptions are marked (R-ACL-032, R-ACL-077) | tree nodes and page DTO expose hasExplicitGrants |
| `tests/integration/acl-gaps.test.ts` | deleting a department requires reassignment or confirmation (R-ORG-004) | refuses with the affected grants, then reassigns them to another department |
| `tests/integration/acl-gaps.test.ts` | deleting a department requires reassignment or confirmation (R-ORG-004) | a group without grants or primary members is deleted directly |
| `tests/integration/acl-gaps.test.ts` | copy into another space asks to confirm the audience (R-ACL-050) | duplicating a personal page into an open space requires confirmation |
| `tests/integration/acl-gaps.test.ts` | comments are bound to a revision and a block (R-COMMENTS-001) | stores the revision number and the comment survives edits of its block |
| `tests/integration/acl-gaps.test.ts` | OpenAPI description (R-SPACE-002, R-ACL-016) | is generated from the registered routes |
| `tests/integration/acl.test.ts` | department spaces and inheritance | new employee of a department automatically gets its space (V15-A04, V16-S13, V15-A01, ACL-152, ACL-159, ACL-162, R-ORG-005, R-ADMIN-020, R-ACL-081, UX v2.7) |
| `tests/integration/acl.test.ts` | department spaces and inheritance | nested departments: member of a sub-department inherits parent department access (R-ORG-001) |
| `tests/integration/acl.test.ts` | department spaces and inheritance | removing a user from a department revokes access; personal grants remain (R-ACL-039, E2E-107) |
| `tests/integration/acl.test.ts` | permission levels (ACL-153, ACL-154, A10) | company-wide view, editing only by authors; view-only cannot modify via API (V15-A10, ACL-153) |
| `tests/integration/acl.test.ts` | permission levels (ACL-153, ACL-154, A10) | editor without share right cannot grant access (ACL-154, R-ACL-059) |
| `tests/integration/acl.test.ts` | exceptions and denies | restricted child page is not accessible through parent rights (ACL-160, R-ACL-034, E2E-104, UX-149) |
| `tests/integration/acl.test.ts` | exceptions and denies | explicit deny wins over group allow (R-ACL-066) |
| `tests/integration/acl.test.ts` | exceptions and denies | explains why a user has access (ACL-161, V15-A09, V16-S15, R-ACL-078) |
| `tests/integration/acl.test.ts` | admin does not see private content (A03, S15, §4.1) | org admin cannot open a personal page nor a private space page without a grant (V15-A03, R-ACL-047) |
| `tests/integration/acl.test.ts` | temporary access and guests (ACL-155, ACL-156, ACL-158, A07, S14, ACL-171) | guest invited to one page sees only it, no directory, no org-wide content (ACL-155, ACL-171, R-ACL-029, R-ACL-082, V15-A02) |
| `tests/integration/acl.test.ts` | temporary access and guests (ACL-155, ACL-156, ACL-158, A07, S14, ACL-171) | guest cannot be granted access in a space whose policy forbids guests |
| `tests/integration/acl.test.ts` | temporary access and guests (ACL-155, ACL-156, ACL-158, A07, S14, ACL-171) | time-limited grant expires on the server without client activity (ACL-156) |
| `tests/integration/acl.test.ts` | temporary access and guests (ACL-155, ACL-156, ACL-158, A07, S14, ACL-171) | user access expiry blocks the account (V16-S14) |
| `tests/integration/acl.test.ts` | moving changes audience (ACL-165, ACL-166, A06, UX23-210) | moving a private page to an open space requires confirmation and shows who gains access; undo restores (ACL-165, ACL-166, V15-A06, UX23-210, E2E-098, R-ACL-035, R-ACL-084, R-ACL-079, R-TREE-028, R-TREE-014, UX-126, UX21-188) |
| `tests/integration/acl.test.ts` | moving changes audience (ACL-165, ACL-166, A06, UX23-210) | cannot move into a location where the user cannot create (UX23-209) |
| `tests/integration/acl.test.ts` | moving changes audience (ACL-165, ACL-166, A06, UX23-210) | opening the page to the whole company requires explicit confirmation (R-ACL-069) |
| `tests/integration/acl.test.ts` | concurrency and audit of ACL (ACL-169, ACL-172, A13) | parallel grant changes do not lose updates (one active grant per subject) (ACL-169, ACL-172, E2E-110, R-AUDIT-004) |
| `tests/integration/acl.test.ts` | concurrency and audit of ACL (ACL-169, ACL-172, A13) | deleting a group revokes its grants and keeps users and pages (V15-A13) |
| `tests/integration/acl.test.ts` | concurrency and audit of ACL (ACL-169, ACL-172, A13) | transfer preview shows spaces gained and lost (V15-A16, R-ADMIN-006, R-ADMIN-023) |
| `tests/integration/acl.test.ts` | space policy | export/download flags are reflected in actions (R-ACL-031) |
| `tests/integration/archive.test.ts` | organisation archive round trip (F06, V18-A01, V18-A02, V18-A03, V18-A04, V18-A24, SC-38, S20) | export → readable without the app → restore into a clean installation → verified (V18-A05, R-ACL-049, R-SECURITY-010, E-10, V17-F06, QA26-16, R-ARCHIVE-004, R-ARCHIVE-006, R-ARCHIVE-007, R-ARCHIVE-008, R-ARCHIVE-011, R-ARCHIVE-013, R-ARCHIVE-016, R-BACKUP-005, R-EXPORT-002, R-EXPORT-024, R-EXPORT-026) |
| `tests/integration/collab.test.ts` | durability contract | "saved" is reported only after the update is committed to the journal (E-13, D-10, R-COLLAB-003, R-COLLAB-014, R-COLLAB-016, R-COLLAB-025, R-COLLAB-029, R-COLLAB-043) |
| `tests/integration/collab.test.ts` | durability contract | re-delivered operation is acknowledged once and not duplicated (D-02, E-03, UX23-214, R-COLLAB-019, R-COLLAB-023, R-COLLAB-044, R-OFFLINE-009) |
| `tests/integration/collab.test.ts` | concurrent editing | two editors typing in the same paragraph converge without loss (SC-25, AT-74, COLLAB-192, UX23-217, OPS-005, R-COLLAB-001, UX13-08) |
| `tests/integration/collab.test.ts` | concurrent editing | delete block on one client while another edits it keeps a consistent result (AT-77, COLLAB-193) |
| `tests/integration/collab.test.ts` | offline and reconnection | offline edits are kept locally and synchronised after reconnect, concurrent with others (SC-26, AT-57, AT-76, UX23-215, R-COLLAB-007, COLLAB-195, R-OFFLINE-008, R-OFFLINE-011, UX23-213) |
| `tests/integration/collab.test.ts` | offline and reconnection | unacknowledged changes survive a client restart via the pending store (AT-58, UX23-219, E-02, R-OFFLINE-002, V18-A20, V17-F03) |
| `tests/integration/collab.test.ts` | offline and reconnection | server restart during a session loses no acknowledged change and resends the rest (OPS-009, V17-F04, R-COLLAB-047, R-COLLAB-050, UX13-15) |
| `tests/integration/collab.test.ts` | permissions in live sessions | read-only user cannot write; revoking edit switches session to read-only; revoking view closes it (AT-78, COLLAB-196, E2E-105, ACL-168, SC-32, OPS-008, V15-A08, R-ACL-083) |
| `tests/integration/collab.test.ts` | permissions in live sessions | suspending a user closes their live sessions (ACL-157, R-AUTH-002) |
| `tests/integration/collab.test.ts` | permissions in live sessions | trashing a page stops accepting edits and tells editors (UX: page deleted) |
| `tests/integration/collab.test.ts` | server-side validation | rejects schema-invalid updates and keeps the document valid (R-COLLAB-020, R-COLLAB-031) |
| `tests/integration/collab.test.ts` | history: revisions, restore, journal | restoring a revision creates a new revision and keeps concurrent edits (HIST-189, COLLAB-197, SC-28, S11, R-HISTORY-004, R-HISTORY-007, UX21-201, OPS-010, R-HISTORY-034) |
| `tests/integration/collab.test.ts` | history: revisions, restore, journal | restores a single deleted block from a revision (R-HISTORY-003, R-HISTORY-013) |
| `tests/integration/collab.test.ts` | history: revisions, restore, journal | records a journal of edit operations grouped per author (HIST-187, R-HISTORY-023, R-HISTORY-024) |
| `tests/integration/collab.test.ts` | history: revisions, restore, journal | title is edited collaboratively and synced to the tree (R-PAGE-019) |
| `tests/integration/collab.test.ts` | randomised convergence (COLLAB-198, R-COLLAB-008, R-COLLAB-030, R-COLLAB-044, property-based) | random concurrent edits with random disconnects converge to the server state |
| `tests/integration/collab.test.ts` | access to the live channel | a user without access cannot open the live channel (S03/E2E-105) |
| `tests/integration/content.test.ts` | attachments | uploads an image, stores the original byte-exact with checksum, creates previews (A10, R-MEDIA-010, V18-A10, R-FILES-003) |
| `tests/integration/content.test.ts` | attachments | rejects executables even with a fake extension and dangerous types (SC-19, SC-33) |
| `tests/integration/content.test.ts` | attachments | sanitises SVG and serves user content in a sandbox (SC-12, SC-33, R-MEDIA-011) |
| `tests/integration/content.test.ts` | attachments | files of a private page are not accessible by direct link; revocation invalidates signed links (E2E-102, A14, V18-A17, V15-A08, ACL-164, R-FILES-006, V15-A14) |
| `tests/integration/content.test.ts` | attachments | respects download policy: viewers can see the page but cannot download when forbidden (A15, UX21-182) |
| `tests/integration/content.test.ts` | attachments | resumable upload with chunk retry and checksum verification (UX23-220, A16, R-FILES-011) |
| `tests/integration/content.test.ts` | attachments | incomplete upload cannot be completed (UX23-220) |
| `tests/integration/content.test.ts` | attachments | replacing a file creates a new version; old version restorable (R-FILES-003, R-MEDIA-013) |
| `tests/integration/content.test.ts` | attachments | large images get a deep-zoom tile pyramid (UX21-181, UX22-186) |
| `tests/integration/content.test.ts` | OCR (R-OCR-001, R-OCR-007, R-OCR-011, SC-22, §8) | recognises Russian and English text on a screenshot, keeps original, result is searchable with origin marker (R-SEARCH-002, SC-23) |
| `tests/integration/content.test.ts` | search (§9, S01–S03, V16) | finds by morphology, typo, wrong layout, applies ACL before results and jumps to block (R-SEARCH-004, R-SEARCH-005, R-SEARCH-006, R-SEARCH-011, R-SEARCH-014, E2E-101, ACL-163, V16-S03) |
| `tests/integration/content.test.ts` | search (§9, S01–S03, V16) | space scope does not leak neighbouring spaces (S02, V16-S02) |
| `tests/integration/content.test.ts` | comments and mentions | threads, replies, resolve/reopen, mention notifications only for those with access (R-COMMENTS-001) |
| `tests/integration/content.test.ts` | publishing workflow (§11, S05, ROUTE Автор) | readers see the published revision while the draft evolves; approval required when configured (V16-S05, R-PUBLISH-006, R-PUBLISH-007) |
| `tests/integration/core.test.ts` | auth | rejects wrong password and does not reveal whether the user exists |
| `tests/integration/core.test.ts` | auth | requires CSRF token for cookie-authenticated mutations |
| `tests/integration/core.test.ts` | auth | setup cannot run twice |
| `tests/integration/core.test.ts` | auth | suspended user loses access immediately (ACL-157, R-AUTH-002) |
| `tests/integration/core.test.ts` | personal space (UX23-199, ACL-151) | each employee gets a private personal space invisible to others and to admins (UX23-199, ACL-151, R-SPACE-004) |
| `tests/integration/core.test.ts` | page tree | creates nested pages, idempotent by requestId (UX23-203, R-COLLAB-028) |
| `tests/integration/core.test.ts` | page tree | prevents moving a page into its own descendant (E2E-099, UX23-208, UX21-189) |
| `tests/integration/core.test.ts` | page tree | concurrent opposite moves never create a cycle (COLLAB-194, UX23-218, R-TREE-022) |
| `tests/integration/core.test.ts` | page tree | moves keep ids, ancestors closure is consistent, order respected, undo restores (R-TREE-004, D-06, SC-01, E2E-097, R-TREE-017, UX21-187, E216, R-HISTORY-016) |
| `tests/integration/core.test.ts` | page tree | trash and restore a branch with children (D-05, SC-29, V17-F08, E-05, R-HISTORY-003, R-HISTORY-034, UX13-14) |
| `tests/integration/core.test.ts` | page tree | duplicates a branch with new ids (R-PAGE-021) |
| `tests/integration/core.test.ts` | audit | is hash-chained and append-only (R-AUDIT-005) |
| `tests/integration/core.test.ts` | audit | regular user cannot read the org audit log (SC-39) |
| `tests/integration/files-integrity.test.ts` | upload checksum computed by the client (R-FILES-004, R-FILES-011) | R-FILES-011: a streamed upload is completed only when the client checksum matches the received bytes |
| `tests/integration/files-integrity.test.ts` | upload checksum computed by the client (R-FILES-004, R-FILES-011) | R-FILES-004: a checksum different from the one declared at start is refused |
| `tests/integration/files-integrity.test.ts` | periodic integrity verification of stored files (R-FILES-007) | R-FILES-007: a corrupted or missing stored file is detected, audited and shown to administrators |
| `tests/integration/files-integrity.test.ts` | server-side document validation (R-EDITOR-043) | R-EDITOR-043: an update with a script-capable link (javascript:) is rejected and the document stays clean |
| `tests/integration/gaps.test.ts` | revisions: pre-restore snapshot | restore saves the current state as a "pre-restore" revision (QA26-15) |
| `tests/integration/gaps.test.ts` | access requests notify everyone who can share | space managers (direct and via group) are notified about a page request; the requester is not (R-ACL-043) |
| `tests/integration/gaps.test.ts` | access requests notify everyone who can share | a requester who can already share is not notified about their own request |
| `tests/integration/gaps.test.ts` | audience preview when widening access | audience_change conflict lists who would newly gain access; preview endpoint computes added/removed (R-ACL-014) |
| `tests/integration/gaps.test.ts` | comments: mentions and delete rights | returns stored mentions and a per-comment canDelete flag |
| `tests/integration/gaps.test.ts` | page DTO: approval and published info | shows the pending approval while in review and the published revision afterwards |
| `tests/integration/gaps.test.ts` | admin: users, settings, transfer preview | filters users by role, q and status; returns a single user card |
| `tests/integration/gaps.test.ts` | admin: users, settings, transfer preview | oidcJitProvisioning setting is stored and audited |
| `tests/integration/gaps.test.ts` | admin: users, settings, transfer preview | transfer preview reports the number of owned pages |
| `tests/integration/gaps.test.ts` | trash: path, purgeAt and space purge | trash rows include the parent path (hidden ancestors as …) and purgeAt |
| `tests/integration/gaps.test.ts` | trash: path, purgeAt and space purge | org admin can permanently purge a deleted space (audited, legal hold respected) |
| `tests/integration/gaps.test.ts` | templates from content | creates a template directly from ProseMirror JSON and uses it for new pages |
| `tests/integration/gaps.test.ts` | templates from content | validates content against the editor schema and requires exactly one source |
| `tests/integration/gaps.test.ts` | search: did you mean | suggests a corrected query when nothing is found (R-SEARCH-004) |
| `tests/integration/history-tree.test.ts` | data consistency check (R-COLLAB-037) | maintenance check reports tree and journal inconsistencies and exports kb_integrity_errors (R-COLLAB-037) |
| `tests/integration/history-tree.test.ts` | nesting limit (R-TREE-005, R-TREE-001) | allows 15 levels and rejects a 16th on create, move, duplicate and import with a clear error (R-TREE-005, R-TREE-001) |
| `tests/integration/history-tree.test.ts` | legal hold (R-HISTORY-015, R-HISTORY-028) | only org admins set or release a hold; it is audited, shown on the page and blocks permanent deletion (R-HISTORY-015, R-HISTORY-028) |
| `tests/integration/history-tree.test.ts` | restore to a journal step (R-HISTORY-026, HIST-187) | reconstructs the state after any journal operation and restores it as a new reversible revision (R-HISTORY-026, HIST-187, R-HISTORY-034) |
| `tests/integration/history-tree.test.ts` | restore to a journal step (R-HISTORY-026, HIST-187) | starts from a revision when the journal head was compacted and refuses an unreachable step (R-HISTORY-026) |
| `tests/integration/history-tree.test.ts` | restore notifies co-editors (R-HISTORY-014, COLLAB-197) | everyone else on the page gets a page-restored event with a link to the pre-restore version (R-HISTORY-014, COLLAB-197) |
| `tests/integration/history-tree.test.ts` | search covers comments and attached documents (R-SEARCH-003, R-SEARCH-013) | finds a page by comment text and by text inside an attached DOCX/TXT, respecting access (R-SEARCH-003, R-SEARCH-013) |
| `tests/integration/import-export.test.ts` | DOCX import (SC-13, SC-14, AT-41, AT-42) | imports headings, nested lists, merged tables and images with a report; original kept (R-IMPORT-007, R-IMPORT-008, R-IMPORT-020, R-IMPORT-028, R-IMPORT-033, UX13-05, R-EXPORT-012, R-EXPORT-014) |
| `tests/integration/import-export.test.ts` | DOCX import (SC-13, SC-14, AT-41, AT-42) | rejects a corrupted DOCX with a clear error and changes nothing (SC-19, D-09) |
| `tests/integration/import-export.test.ts` | Markdown ZIP (SC-15, AT-43, AT-69) | imports a folder tree with relative images and cross-links; links become internal (R-IMPORT-010, R-IMPORT-011, R-IMPORT-013, R-IMPORT-035) |
| `tests/integration/import-export.test.ts` | Markdown ZIP (SC-15, AT-43, AT-69) | rejects zip-slip paths and zip bombs before extracting (SC-19, AT-69, R-IMPORT-006, R-IMPORT-035) |
| `tests/integration/import-export.test.ts` | Markdown ZIP (SC-15, AT-43, AT-69) | cancelling before commit creates nothing (AT-72, R-IMPORT-043, E-09) |
| `tests/integration/import-export.test.ts` | Markdown ZIP (SC-15, AT-43, AT-69) | same idempotency key does not create a second job (AT-73, R-IMPORT-024, E-09) |
| `tests/integration/import-export.test.ts` | tabular import (AT-48, AT-49, AT-50, UX13-17) | CSV in Windows-1251 with ";" and decimal comma, quotes and leading zeros; repeated upsert import without duplicates (AT-48, UX13-17, AT-50, R-COLLECTION-003, R-IMPORT-030, R-IMPORT-036) |
| `tests/integration/import-export.test.ts` | tabular import (AT-48, AT-49, AT-50, UX13-17) | XLSX with three sheets: pick a sheet, numbers and dates kept, formulas as values (AT-49, AT-70, R-IMPORT-031, R-IMPORT-041, R-SECURITY-009) |
| `tests/integration/import-export.test.ts` | export (SC-13, S09, UX13-16) | exports a page to MD/DOCX/HTML/PDF; DOCX opens in LibreOffice; MD round-trips (R-EXPORT-001, R-EXPORT-006, R-EXPORT-013, R-EXPORT-016, R-EXPORT-022, V16-S09, V18-A21, E225, UX13-16) |
| `tests/integration/import-export.test.ts` | export (SC-13, S09, UX13-16) | branch export to Markdown ZIP: readable tree, relative links, assets, checksums, report (R-EXPORT-008, R-EXPORT-009, R-EXPORT-015, SC-15) |
| `tests/integration/import-export.test.ts` | export (SC-13, S09, UX13-16) | export respects rights: no export permission => 403; private pages never leak into branch export (SC-20, V17-F07, R-ACL-017, R-EXPORT-011, E2E-108) |
| `tests/integration/security-headers.test.ts` | security headers for user content (SECURITY) | app pages: CSP forbids framing the app and limits frames to same origin and allow-listed video hosts |
| `tests/integration/security-headers.test.ts` | security headers for user content (SECURITY) | uploaded SVG/HTML-like content is served sandboxed with nosniff; PDF is script-free but viewable |

### Отказоустойчивость и восстановление (vitest, отдельные процессы сервера)

Запуск: `npm run test:resilience`. Тестов: **18**.

| Файл | Группа | Тест |
|---|---|---|
| `tests/resilience/backup-restore.test.ts` | backup → restore drill (SC-30, AT-60, AT-87, V16-S20, OPS-011, QA26-18) | restores content, attachment bytes, history, permissions and the audit chain into a new installation (E-08, D-08, R-BACKUP-001, R-BACKUP-002, R-BACKUP-015, R-BACKUP-019, V18-A25) |
| `tests/resilience/backup-restore.test.ts` | backup → restore drill (SC-30, AT-60, AT-87, V16-S20, OPS-011, QA26-18) | a damaged backup is rejected by restore and verification (E-08, AT-60) |
| `tests/resilience/crash-restart.test.ts` | server crash during editing (OPS-009, V17-F04, E-01) | acknowledged edits survive a SIGKILL; in-flight and offline edits are kept and applied once after restart (E-02, E-13, OPS-003) |
| `tests/resilience/crash-restart.test.ts` | server crash during editing (OPS-009, V17-F04, E-01) | an operation persisted before the crash whose acknowledgement was lost is not duplicated on resend (E-03, D-02, OPS-004) |
| `tests/resilience/crash-restart.test.ts` | server crash during editing (OPS-009, V17-F04, E-01) | continuous typing across a crash: every token persists exactly once (E-01, E-03) |
| `tests/resilience/db-connection-loss.test.ts` | database connection loss during editing (SC-30, E-13, D-10) | unacknowledged operations are never shown as saved and all of them persist after the database returns (E-01, D-01, OPS-003) |
| `tests/resilience/db-connection-loss.test.ts` | database connection loss during editing (SC-30, E-13, D-10) | readiness reports the database outage and recovers (R-OPS-006, R-OPS-003) |
| `tests/resilience/db-connection-loss.test.ts` | database connection loss during editing (SC-30, E-13, D-10) | a connection killed in the middle of a transaction does not crash the server process (R-OPS-002, E-01) |
| `tests/resilience/db-connection-loss.test.ts` | database connection loss during editing (SC-30, E-13, D-10) | cross-instance live updates resume after the database returns (event bus reconnects) (SC-30, R-OPS-006, R-OPS-016) |
| `tests/resilience/db-connection-loss.test.ts` | database connection loss during editing (SC-30, E-13, D-10) | database lost between applying and committing an operation: no "saved", and it is not silently dropped (E-01, E-13, D-01) |
| `tests/resilience/db-connection-loss.test.ts` | database connection loss during editing (SC-30, E-13, D-10) | a transaction whose connection is killed before COMMIT is retried transparently (E-01, R-OPS-002) |
| `tests/resilience/db-connection-loss.test.ts` | database connection loss during editing (SC-30, E-13, D-10) | requests during a database outage get 503 with a Russian message instead of 500 (R-OPS-006, D-10) |
| `tests/resilience/migrations.test.ts` | schema migrations: rollback and re-apply (E-14, OPS-002, R-OPS-001) | every migration rolls back and re-applies step by step with data present; the application keeps working (E-14, OPS-002, R-OPS-001, R-OPS-004, R-OPS-007) |
| `tests/resilience/migrations.test.ts` | schema migrations: rollback and re-apply (E-14, OPS-002, R-OPS-001) | a complete rollback to an empty schema and a fresh re-apply both succeed (E-14, R-OPS-007) |
| `tests/resilience/migrations.test.ts` | schema migrations: rollback and re-apply (E-14, OPS-002, R-OPS-001) | an older release refuses to start against a newer schema instead of running on it (OPS-002, E-14, R-OPS-004) |
| `tests/resilience/storage-failure.test.ts` | object storage failure on upload (SC-30, D-03) | blob area not writable → clean error, no orphan rows; retry after recovery stores the file (D-03, E-01) |
| `tests/resilience/storage-failure.test.ts` | object storage failure on upload (SC-30, D-03) | disk full while committing the object → clean error, resumable session marked failed; a new upload succeeds (D-03) |
| `tests/resilience/storage-failure.test.ts` | object storage failure on upload (SC-30, D-03) | temporary area unusable → readiness reports storage error, upload fails cleanly, both recover (R-OPS-006, D-03) |

### Браузерные E2E (Playwright, Chromium)

Запуск: `npm run test:e2e`. Тестов: **36**.

| Файл | Группа | Тест |
|---|---|---|
| `tests/e2e/a11y.spec.ts` |  | WCAG 2.1 AA automated audit of key screens (R-A11Y-003, AT-80, E2E-112) |
| `tests/e2e/a11y.spec.ts` |  | keyboard only: quick switcher, help, dialogs close with Esc and return focus (UX-136, SC-34) |
| `tests/e2e/a11y.spec.ts` |  | reduced motion: animations and transitions are effectively disabled (R-A11Y-002, AT-82) |
| `tests/e2e/a11y.spec.ts` |  | real 200% browser zoom (1280x800 at 2x = 640x400 CSS px) keeps every key screen usable (AT-81, UX-147, V18-A18) |
| `tests/e2e/a11y.spec.ts` |  | pixel baselines for stable screens (R-QA-008, AT-89) |
| `tests/e2e/clipboard.spec.ts` |  | Word paste keeps headings, nested and numbered lists, links and tables without Office styles (AT-44, UX13-02, E209, R-CLIPBOARD-020, R-CLIPBOARD-022) |
| `tests/e2e/clipboard.spec.ts` |  | web HTML paste: scripts removed, embedded image uploaded as an attachment (E210, SC-06, R-CLIPBOARD-009) |
| `tests/e2e/clipboard.spec.ts` |  | page menu copies the page with formatting, as text and as Markdown (R-CLIPBOARD-002, R-CLIPBOARD-004, SC-08) |
| `tests/e2e/clipboard.spec.ts` |  | refused clipboard access shows an error and the text for manual copying, not a false success (R-CLIPBOARD-008, SC-10) |
| `tests/e2e/clipboard.spec.ts` |  | table copy for Excel puts TSV and an HTML table on the clipboard (R-CLIPBOARD-006, R-CLIPBOARD-017, SC-09) |
| `tests/e2e/clipboard.spec.ts` |  | converting formatted text to a code block asks first and keeps the text (R-EDITOR-067, R-EDITOR-003) |
| `tests/e2e/clipboard.spec.ts` |  | caret position of a page is restored when it is opened again (R-EDITOR-037, R-EDITOR-001) |
| `tests/e2e/clipboard.spec.ts` |  | registry block from the slash menu shows the new collection (R-COLLECTION-001) |
| `tests/e2e/clipboard.spec.ts` |  | image viewer: click on a selected image opens it; zoom is limited to 10–800 % (R-MEDIA-015, R-MEDIA-019, R-MEDIA-021) |
| `tests/e2e/collab.spec.ts` |  | two people edit the same page: changes converge, presence is shown, revoking edit makes it read-only (E219, R-COLLAB-006, R-COLLAB-012) |
| `tests/e2e/collab.spec.ts` |  | history: save a version, change text, restore the version (R-HISTORY-004, UX13-14, UX21-201) |
| `tests/e2e/collab.spec.ts` |  | search finds a page by a word from its body and jumps to the block (V16-S01, R-SEARCH-005) |
| `tests/e2e/collab.spec.ts` |  | paste: spreadsheet range becomes a table; Markdown becomes formatted blocks |
| `tests/e2e/collab.spec.ts` |  | typing latency on a long document stays within budget |
| `tests/e2e/content.spec.ts` |  | image: upload via file chooser, resize presets, caption, full-screen viewer with zoom |
| `tests/e2e/content.spec.ts` |  | sidebar tree: "+" creates a child page under the selected parent with focus in the title (R-TREE-002, UX-121, UX23-201) |
| `tests/e2e/content.spec.ts` |  | comment on a selection appears in the comments panel |
| `tests/e2e/editor.spec.ts` |  | first run: organisation setup, personal space and empty states |
| `tests/e2e/editor.spec.ts` |  | create page, type with Markdown shortcuts, "Сохранено" only after server ack, survives reload (R-PAGE-018, R-PAGE-033, AT-61, UX13-01, UX-144) |
| `tests/e2e/editor.spec.ts` |  | offline edits are kept locally and delivered after reconnect (E220, AT-57) |
| `tests/e2e/editor.spec.ts` |  | slash menu inserts a table and a callout; "> " creates a toggle |
| `tests/e2e/editor.spec.ts` |  | an empty page created by mistake disappears when left; a double click creates one page (R-TREE-025, UX23-203, UX23-202) |
| `tests/e2e/mobile.layout.spec.ts` |  | mobile: drawer navigation, editor usable, no horizontal scroll |
| `tests/e2e/undo.spec.ts` |  | undo/redo of typing: 1 and 10 steps, Ctrl+Shift+Z and Ctrl+Y; result is saved (QA26-14, UX21-196, UX21-198, R-HISTORY-017, R-HISTORY-018, HIST-188) |
| `tests/e2e/undo.spec.ts` |  | undo/redo of formatting keeps the text and the selection (QA26-14, SC-11, R-HISTORY-011, R-HISTORY-017) |
| `tests/e2e/undo.spec.ts` |  | one undo reverts a paste of 100 blocks and keeps the cursor position (AT-47, R-HISTORY-009, QA26-14) |
| `tests/e2e/undo.spec.ts` |  | undo of a block move, a table insert and a block deletion (UX-138, UX13-10, SC-11, E2E-118, QA26-14) |
| `tests/e2e/undo.spec.ts` |  | undo reverts only the user's own changes, never a colleague's (SC-27, UX21-200, R-HISTORY-021, R-HISTORY-027, HIST-188) |
| `tests/e2e/visual.spec.ts` |  | prepare a representative page |
| `tests/e2e/visual.spec.ts` |  | layout ${w}x${h} ${theme}: no horizontal overflow, key controls reachable |
| `tests/e2e/visual.spec.ts` |  | 200% zoom (CSS zoom) keeps the page usable |

