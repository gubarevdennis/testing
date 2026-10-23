# Протокол учения по восстановлению (2026-10-23T04:46:00.973Z)

Сгенерировано `npm run restore:drill` (tests/resilience/dr-drill.test.ts). Не редактируйте вручную.

Источник восстановления: second medium only (site, live objects and local repository deleted). Шифрование: age (X25519, ChaCha20-Poly1305); private key outside the site. archive_timeout = 60 с, синхронизация объектов и второй копии каждые 30 с.

| Показатель | Цель | Измерено |
|---|---|---|
| RPO, база данных | ≤ 300 с | **25.6 с** (потеряно 147 из 469 подтверждённых записей, пропусков нет) |
| RPO, файлы | ≤ 300 с | **27.8 с** (потеряно 8 из 26 загрузок) |
| RTO до работающего API | ≤ 3600 с | **5.9 с** |
| RTO с проверками целостности | ≤ 3600 с | **7.5 с** |
| Граница RPO для этой конфигурации | — | 93 с (archive_timeout + интервал копирования + длительность копирования) |
| PITR на момент T до API | — | 5.9 с (recovery stopping before commit of transaction 2056, time 2026-10-23 04:46:25.085281+00) |

Базовая копия: 52539656 Б данных → 5664228 Б (зашифровано), 1012 мс. Шаги восстановления, мс: {"restoreDatabase":1204,"restoreScript":{"checksumsDecrypt":63,"extractVerify":525,"replayPromote":471},"restoreObjects":1874,"startServer":2173,"verify":1570}.

Проверки (аварийное восстановление): no gaps among confirmed writes; attachment bytes sha256 via API; lost files only after the last sync; audit hash chain (cli audit-verify); documents decode (check-docs.mjs).

Проверки (PITR): row counts of 24 tables equal the primary at T; incident absent (page not trashed, no damage, no later pages); Markdown export of A equals export before the backup and at T; B equals at T; attachments sha256; revision present; ACL: editor sees, outsider 404 (page and file); audit hash chain; documents decode.

Unconfirmed local edits are client-side (IndexedDB queue) and are re-sent after the restore; they are not part of any server backup (see docs/BACKUP_RESTORE.md §8).
