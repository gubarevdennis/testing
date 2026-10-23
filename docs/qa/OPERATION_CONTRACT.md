# Контракт состояний операций (R-UI-061, сгенерировано)

Сгенерировано `npm run qa:report` (`scripts/qa/coverage.ts`) из инвентаризации действий `docs/qa/action-inventory.yaml`. Для каждой операции задано поведение в состояниях R-UI-061 — пусто, успех, загрузка, отмена, ошибка, нет прав, потеря сети, повторный клик: общее правило (таблица ниже) плюс особенности операции из исходного кода (текст причины недоступности, подтверждение, горячая клавиша). В ячейке состояния: ✔ — есть автотест этого состояния (ссылки — в `docs/qa/ACTION_MATRIX.md` и `action-matrix.json`), · — неприменимо (обоснование в `docs/qa/action-tests.yaml`), ✗ — пробел.

Операций: **718**; с хотя бы одним тестом: 502; с особенностями из кода (причина недоступности, подтверждение): 103. Покрыто тестами по состояниям: пусто 101, успех 502, загрузка / медленная сеть 72, отмена 219, ошибка сервера 158, нет прав 62, потеря сети 83, повторный клик 65.

Конфликт, «Назад», перезагрузка, мобильный ввод и zoom 200% описаны общими правилами ниже и проверяются сквозными наборами: конфликт — `tests/e2e/conflict.spec.ts`, `tests/integration/conflicts.test.ts`; перезагрузка и «Назад» — `tests/e2e/ui-p0-interaction.spec.ts`, `collab-p0-offline.spec.ts`; мобильный ввод — `tests/e2e/ui-p0-touch.spec.ts`, `mobile.layout.spec.ts`; zoom 200% — `tests/e2e/ui-p0-layout.spec.ts`, `visual.spec.ts`.

## Общие правила состояний

| Состояние | Ожидаемое поведение |
|---|---|
| Пусто | пустое состояние объясняет, что здесь будет, и предлагает первое действие; пустой ввод не отправляется, кнопка подтверждения недоступна с подсказкой |
| Успех | результат виден сразу (оптимистично или после ответа), подтверждение тостом для неочевидных операций; обратимые операции предлагают «Отменить» |
| Загрузка / медленная сеть | скелетон/индикатор не дольше 12 с без объяснения; кнопка операции в состоянии «выполняется» и недоступна; ввод не блокируется |
| Отмена | «Отмена»/Esc закрывает без изменений и возвращает фокус; несохранённые критичные данные — подтверждение закрытия |
| Ошибка сервера | сообщение с причиной и действием («Повторить»), введённые данные сохраняются; технические детали — в «Подробности» |
| Нет прав | элемент скрыт или недоступен с причиной (подсказка) и путём запросить доступ; сервер отвечает 403 и ничего не меняет |
| Потеря сети | правки документа копятся локально (индикатор «Нет сети · сохранено на устройстве»); серверные операции недоступны с объяснением или ставятся в очередь |
| Повторный клик | повторное нажатие не выполняет операцию дважды (идемпотентный requestId / блокировка кнопки) |
| Конфликт | правка не теряется: слияние CRDT, при несливаемой операции — диалог сравнения (R-COLLAB-036) |
| Назад / перезагрузка | состояние экрана восстанавливается по адресу; черновик не теряется (R-UI-062) |
| Мобильный ввод / zoom 200% | действие доступно касанием (цель ≥ 44 px) и без горизонтальной прокрутки (R-A11Y-008, R-QA-007) |

## Операции

### admin

| ID | Операция | Особенности из кода | Пусто | Успех | Загрузка / медленная сеть | Отмена | Ошибка сервера | Нет прав | Потеря сети | Повторный клик | Тест |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `admin/EmergencyAccess/confirm.utverdit-ekstrennyy-dostup` | Утвердить экстренный доступ? | с подтверждением; **критичная** | ✗ | ✔ | · | ✔ | ✔ | ✗ | ✗ | · | `e2e/acl-p0-admin.spec.ts` R-ACL-056: emergency access is requested with a reason, approved by a second administra… (+2) |
| `admin/EmergencyAccess/confirm.utverdit-ekstrennyy-dostup.utverdit` | Утвердить | с подтверждением; **критичная** | ✗ | ✔ | ✗ | ✔ | ✔ | ✗ | ✗ | ✗ | `e2e/acl-p0-admin.spec.ts` R-ACL-056: emergency access is requested with a reason, approved by a second administra… (+2) |
| `admin/EmergencyAccess/otpravit-zapros` | Отправить запрос | **критичная** | ✗ | ✔ | ✗ | ✗ | ✗ | ✔ | ✗ | ✗ | `e2e/acl-p0-admin.spec.ts` R-ACL-056: emergency access is requested with a reason, approved by a second administra… (+1) |
| `admin/EmergencyAccess/utverdit` | Утвердить |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/acl-p0-admin.spec.ts` R-ACL-056: emergency access is requested with a reason, approved by a second administra… |
| `admin/EmergencyAccess/otklonit` | Отклонить | **критичная** | ✗ | ✔ | ✗ | ✔ | ✔ | ✔ | ✔ | ✗ | `e2e/qa-admin-access.spec.ts` R-ACL-056 emergency access «Отклонить»: «Отклонить запрос?» cancel keeps it pending; se… (+2) |
| `admin/EmergencyAccess/otozvat` | Отозвать | **критичная** | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | `e2e/qa-admin-access.spec.ts` QA-A5 (fixed): an instantaneous double activation of «Отозвать» (emergency access) send… (+4) |
| `admin/PublicLinksAdmin/confirm.otozvat-publichnuyu-ssylku` | Отозвать публичную ссылку? | с подтверждением; **критичная** | ✔ | ✔ | · | ✔ | ✔ | ✗ | ✗ | · | `e2e/qa-admin-access.spec.ts` R-PUBLISH-009 admin «Отозвать» public link: «Отозвать публичную ссылку?» cancel keeps i… (+1) |
| `admin/PublicLinksAdmin/confirm.otozvat-publichnuyu-ssylku.otozvat` | Отозвать | с подтверждением; **критичная** | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | `e2e/qa-admin-access.spec.ts` QA-A5 (fixed): an instantaneous double activation of «Отозвать» (emergency access) send… (+4) |
| `admin/PublicLinksAdmin/otozvat` | Отозвать | **критичная** | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | `e2e/qa-admin-access.spec.ts` QA-A5 (fixed): an instantaneous double activation of «Отозвать» (emergency access) send… (+4) |
| `admin/Offboarding/predprosmotr` | Предпросмотр |  | ✗ | ✔ | ✔ | ✗ | ✗ | ✗ | ✗ | ✔ | `e2e/qa-admin2-access.spec.ts` R-ADMIN-016 «Увольнение: личные материалы»: «Сотрудник» lists suspended employees; «Пре… |
| `admin/Offboarding/primenit` | Применить |  | ✗ | ✔ | ✔ | ✗ | ✗ | ✗ | ✗ | ✔ | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … (+1) |
| `admin/AdminPage/route.admin-users` | /admin/users | **критичная** | ✗ | ✔ | ✔ | · | ✔ | ✔ | ✔ | · | `e2e/acl-p0-admin.spec.ts` ROUTE-06: the auditor reads who changed what in the journal but does not see titles or … (+25) |
| `admin/AdminPage/route.admin-groups` | /admin/groups | **критичная** | ✔ | ✔ | ✔ | ✔ | ✔ | ✗ | ✗ | ✔ | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … (+9) |
| `admin/AdminPage/route.admin-settings` | /admin/settings | **критичная** | ✔ | ✔ | ✗ | · | ✔ | ✔ | ✗ | · | `e2e/qa-actions.spec.ts` R-QA-004 organisation name: «Переименовать» is unavailable without a change and a serve… (+3) |
| `admin/AdminPage/route.admin-audit` | /admin/audit | **критичная** | ✔ | ✔ | ✔ | · | ✔ | ✗ | ✗ | ✔ | `e2e/acl-p0-admin.spec.ts` ROUTE-06: the auditor reads who changed what in the journal but does not see titles or … (+5) |
| `admin/AdminPage/route.admin-archives` | /admin/archives | **критичная** | ✗ | ✔ | ✔ | · | ✗ | ✗ | ✗ | ✔ | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … (+5) |
| `admin/AdminPage/route.admin-health` | /admin/health | **критичная** | ✗ | ✔ | ✔ | · | ✔ | ✗ | ✗ | · | `e2e/qa-admin2-org.spec.ts` R-UI-061 system health «Обновить»: slow network marks the button busy and keeps the fig… (+1) |
| `admin/AdminPage/route.admin-expiring` | /admin/expiring | **критичная** | ✔ | ✔ | ✗ | ✔ | ✔ | ✗ | ✗ | · | `e2e/qa-admin-offline.spec.ts` R-QA-029 offline: «Отозвать доступ {…}» of an expiring grant and «Удалить» of a group e… (+4) |
| `admin/AdminPage/route.admin-access` | /admin/access | **критичная** | ✗ | ✔ | ✗ | · | ✗ | ✔ | ✗ | · | `e2e/acl-p0-admin.spec.ts` R-ACL-056: emergency access is requested with a reason, approved by a second administra… (+11) |
| `admin/ArchivesSection/vosstanovit-iz-arhiva` | Восстановить из архива | **критичная** | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … (+3) |
| `admin/ArchivesSection/sozdat-arhiv` | Создать архив | **критичная** | ✗ | ✔ | ✔ | ✗ | ✗ | ✗ | ✗ | ✔ | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … (+3) |
| `admin/ArchivesSection/skachat` | Скачать | без прав: «Срок хранения для скачивания (72 ч) истёк — сформируйте заново» | ✗ | ✔ | ✔ | ✗ | ✗ | ✗ | ✗ | ✔ | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … (+1) |
| `admin/ArchivesSection/prodolzhit` | Продолжить |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/io-p0-roundtrip.spec.ts` archive restore dialog: the administrator chooses a new isolated space as the target (R… |
| `admin/ArchivesSection/otchet` | Отчёт |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-admin-access.spec.ts` R-ARCHIVE-006 restore from archive: analysis report («Пользователи в архиве: …») before… |
| `admin/ExportDialog/x` | {…} — {…} |  | · | ✔ | ✗ | ✗ | ✗ | ✗ | ✔ | · | `e2e/collab-p0-editing.spec.ts` two editors change a paragraph, one table and the structure while one loses the connect… (+1) |
| `admin/ExportDialog/arhiv-organizacii` | Архив организации | **критичная** | ✗ | ✔ | ✔ | ✔ | ✗ | ✗ | ✗ | ✔ | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … (+2) |
| `admin/ExportDialog/otmena` | Отмена |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-admin-access.spec.ts` R-ARCHIVE-006 restore: a server error while checking the archive is explained and the d… (+1) |
| `admin/ExportDialog/sozdat-arhiv` | Создать архив | **критичная** | ✗ | ✔ | ✔ | ✗ | ✗ | ✗ | ✗ | ✔ | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … (+3) |
| `admin/ExportDialog/stranicy-prostranstva-i-fayly` | Страницы, пространства и файлы |  | · | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | · | `e2e/qa-admin2-access.spec.ts` R-ARCHIVE-006 «Архив организации» composition («Страницы, пространства и файлы» always … |
| `admin/ExportDialog/ya-podtverzhdayu-vygruzku-vseh-dannyh-organizaci` | Я подтверждаю выгрузку всех данных организации |  | · | ✔ | ✔ | ✗ | ✗ | ✗ | ✗ | ✔ | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … (+1) |
| `admin/AnalysisReport/polzovateli-v-arhive-naydeno-v-sisteme-ne-nayden` | Пользователи в архиве: {…} (найдено в системе: , не найдено: {…}) | **критичная** | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-admin-access.spec.ts` R-ARCHIVE-006 restore from archive: analysis report («Пользователи в архиве: …») before… |
| `admin/RestoreDialog/gotovo` | Готово |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … (+3) |
| `admin/RestoreDialog/obedinit-s-organizaciey-prostranstva-arhiva` | Объединить с организацией (пространства архива) |  | · | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | · | `e2e/editor-p0-clipboard.spec.ts` paste options: «Сохранить форматирование», «Объединить», «Только текст»; scripts and tr… |
| `admin/RestoreDialog/v-novoe-izolirovannoe-prostranstvo-vidno-tolko-v` | В новое изолированное пространство (видно только вам) |  | · | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | · | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … (+2) |
| `admin/RestoreDialog/v-suschestvuyuschee-prostranstvo` | В существующее пространство |  | · | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | · | `e2e/qa-admin2-access.spec.ts` R-ARCHIVE-006 «Архив организации» composition («Страницы, пространства и файлы» always … |
| `admin/RestoreDialog/ya-proveril-otchet-i-podtverzhdayu-vosstanovleni` | Я проверил отчёт и подтверждаю восстановление |  | · | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | · | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … (+3) |
| `admin/RestoreDialog/otmena` | Отмена |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-admin-access.spec.ts` R-ARCHIVE-006 restore: a server error while checking the archive is explained and the d… (+1) |
| `admin/RestoreDialog/vosstanovit` | Восстановить | **критичная** | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … (+3) |
| `admin/RestoreDialog/fayl-arhiva` | Файл архива | **критичная** | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … (+3) |
| `admin/RestoreDialog/otmena~2` | Отмена |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-admin-access.spec.ts` R-ARCHIVE-006 restore: a server error while checking the archive is explained and the d… (+1) |
| `admin/RestoreDialog/proverit-arhiv` | Проверить архив | **критичная** | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … (+3) |
| `admin/RestoreDialog/rezultat-vosstanovleniya` | Результат восстановления | **критичная** | ✗ | ✔ | · | ✗ | ✗ | ✗ | ✗ | · | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … (+3) |
| `admin/ReportDialog/otchet-o-vosstanovlenii` | Отчёт о восстановлении | **критичная** | ✗ | ✔ | · | ✗ | ✗ | ✔ | ✗ | · | `e2e/qa-admin-access.spec.ts` R-ARCHIVE-006 restore from archive: analysis report («Пользователи в архиве: …») before… (+1) |
| `admin/ReportDialog/zakryt` | Закрыть |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-admin-access.spec.ts` R-ARCHIVE-006 restore from archive: analysis report («Пользователи в архиве: …») before… (+1) |
| `admin/ReportDialog/otchet-predvaritelnoy-proverki` | Отчёт предварительной проверки |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-admin-access.spec.ts` R-ARCHIVE-006 restore from archive: analysis report («Пользователи в архиве: …») before… |
| `admin/AuditSection/csv` | CSV |  | ✔ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-admin2-org.spec.ts` R-QA-004 audit log filters «Действие» and «Тип объекта», period «С» … «По»: each is app… |
| `admin/AuditSection/proverit-celostnost` | Проверить целостность |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/acl-p0-admin.spec.ts` ROUTE-06: the auditor reads who changed what in the journal but does not see titles or … |
| `admin/AuditSection/sbrosit` | Сбросить | **критичная** | ✔ | ✔ | ✔ | ✗ | ✗ | ✗ | ✗ | ✔ | `e2e/qa-admin-org.spec.ts` R-QA-004 audit log: «Загрузить ещё» appends the next page (slow network shows progress,… |
| `admin/AuditSection/primenit` | Применить |  | ✔ | ✔ | ✔ | ✗ | ✔ | ✗ | ✗ | ✔ | `e2e/acl-p0-admin.spec.ts` ROUTE-06: the auditor reads who changed what in the journal but does not see titles or … (+4) |
| `admin/AuditSection/podrobnosti` | Подробности |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/acl-p0-admin.spec.ts` ROUTE-06: the auditor reads who changed what in the journal but does not see titles or … |
| `admin/AuditSection/zagruzit-esche` | Загрузить ещё | **критичная** | ✔ | ✔ | ✔ | ✗ | ✔ | ✗ | ✗ | ✔ | `e2e/qa-admin-org.spec.ts` QA-A3 (fixed): a failed «Загрузить ещё» keeps the audit rows already loaded and offers … (+1) |
| `admin/ExpiringSection/confirm.otozvat-dostup-seychas` | Отозвать доступ сейчас? | с подтверждением; **критичная** | ✔ | ✔ | · | ✔ | ✔ | ✗ | ✗ | · | `e2e/qa-admin-offline.spec.ts` R-QA-029 offline: «Отозвать доступ {…}» of an expiring grant and «Удалить» of a group e… (+1) |
| `admin/ExpiringSection/confirm.otozvat-dostup-seychas.otozvat` | Отозвать | с подтверждением; **критичная** | ✔ | ✔ | ✗ | ✔ | ✔ | ✗ | ✔ | ✗ | `e2e/qa-admin-offline.spec.ts` R-QA-029 offline: «Отозвать доступ {…}» of an expiring grant and «Удалить» of a group e… (+1) |
| `admin/ExpiringSection/otozvat-dostup` | Отозвать доступ {…} | **критичная** | ✔ | ✔ | ✗ | ✔ | ✔ | ✗ | ✔ | ✗ | `e2e/qa-admin-offline.spec.ts` R-QA-029 offline: «Отозвать доступ {…}» of an expiring grant and «Удалить» of a group e… (+1) |
| `admin/GroupsSection/confirm.udalit` | Удалить «{…}»? | с подтверждением; **критичная** | ✗ | ✔ | · | ✔ | ✔ | ✗ | ✗ | · | `e2e/qa-admin-offline.spec.ts` R-QA-029 offline: «Отозвать доступ {…}» of an expiring grant and «Удалить» of a group e… (+1) |
| `admin/GroupsSection/confirm.udalit.udalit` | Удалить | с подтверждением; **критичная** | ✗ | ✔ | ✗ | ✔ | ✔ | ✗ | ✔ | ✗ | `e2e/qa-admin-offline.spec.ts` R-QA-029 offline: «Отозвать доступ {…}» of an expiring grant and «Удалить» of a group e… (+1) |
| `admin/GroupsSection/svernut` | Свернуть |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-admin2-org.spec.ts` R-QA-004 departments tree: a department opens its card; «Подотдел» creates a child with… |
| `admin/GroupsSection/renderdept.button-data` | {…} |  | · | ✔ | · | · | · | · | · | · | `e2e/qa-admin2-org.spec.ts` R-QA-004 «Изменить» a department: new name, «Описание» and «Входит в отдел» → top level… (+1) |
| `admin/GroupsSection/gruppa` | Группа | **критичная** | ✔ | ✔ | ✔ | ✔ | ✔ | ✗ | ✗ | ✔ | `e2e/qa-admin-org.spec.ts` QA-A1 (fixed): an instantaneous double activation of «Создать» in «Новая группа» create… (+2) |
| `admin/GroupsSection/otdel` | Отдел |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … |
| `admin/GroupsSection/button-data` | {…} |  | · | ✔ | · | · | · | · | · | · | `e2e/qa-admin2-org.spec.ts` R-QA-004 departments tree: a department opens its card; «Подотдел» creates a child with… |
| `admin/GroupDialog/izmenit` | Изменить «{…}» | **критичная** | ✔ | ✔ | ✔ | ✗ | ✔ | ✗ | ✗ | ✔ | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … (+4) |
| `admin/GroupDialog/otmena` | Отмена |  | ✗ | ✔ | ✗ | ✔ | ✔ | ✗ | ✗ | ✗ | `e2e/qa-admin-org.spec.ts` R-QA-004 «Удалить» group: «Удалить «…»?» needs the typed name when the group has member… (+1) |
| `admin/GroupDialog/sohranit` | Сохранить | **критичная** | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … |
| `admin/GroupDetail/confirm.isklyuchit-uchastnika` | Исключить участника? | с подтверждением; **критичная** | ✗ | ✔ | · | ✔ | ✔ | ✗ | ✗ | · | `e2e/qa-admin-org.spec.ts` R-QA-004 group members: add with «Роль» = manager and «До (необязательно)»; change «Рол… |
| `admin/GroupDetail/confirm.isklyuchit-uchastnika.isklyuchit` | Исключить | с подтверждением | ✗ | ✔ | ✗ | ✔ | ✔ | ✗ | ✗ | ✗ | `e2e/qa-admin-org.spec.ts` R-QA-004 group members: add with «Роль» = manager and «До (необязательно)»; change «Рол… |
| `admin/GroupDetail/nazad` | ← Назад |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-admin2-org.spec.ts` R-QA-004 departments tree: a department opens its card; «Подотдел» creates a child with… |
| `admin/GroupDetail/podotdel` | Подотдел |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-admin2-org.spec.ts` R-QA-004 departments tree: a department opens its card; «Подотдел» creates a child with… |
| `admin/GroupDetail/izmenit` | Изменить |  | ✗ | ✔ | ✗ | ✔ | ✔ | ✗ | ✗ | ✗ | `e2e/qa-admin2-org.spec.ts` R-QA-004 «Изменить» a department: new name, «Описание» and «Входит в отдел» → top level… |
| `admin/GroupDetail/udalit` | Удалить | **критичная** | ✗ | ✔ | ✗ | ✔ | ✔ | ✗ | ✔ | ✗ | `e2e/qa-admin-offline.spec.ts` R-QA-029 offline: «Отозвать доступ {…}» of an expiring grant and «Удалить» of a group e… (+1) |
| `admin/GroupDetail/dobavit` | Добавить |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … (+1) |
| `admin/GroupDetail/isklyuchit` | Исключить {…} |  | ✗ | ✔ | ✗ | ✔ | ✔ | ✗ | ✗ | ✗ | `e2e/qa-admin-org.spec.ts` R-QA-004 group members: add with «Роль» = manager and «До (необязательно)»; change «Рол… |
| `admin/HealthSection/obnovit` | Обновить |  | ✗ | ✔ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | `e2e/qa-admin2-org.spec.ts` R-UI-061 system health «Обновить»: slow network marks the button busy and keeps the fig… |
| `admin/OrgNameCard/pereimenovat` | Переименовать | **критичная** | ✔ | ✔ | ✗ | ✗ | ✔ | ✗ | ✗ | ✗ | `e2e/qa-actions.spec.ts` R-QA-004 organisation name: «Переименовать» is unavailable without a change and a serve… |
| `admin/OrgSettingsSection/confirm.primenit-izmeneniya-politiki` | Применить изменения политики? | с подтверждением | ✔ | ✔ | · | ✔ | ✔ | ✗ | ✔ | · | `e2e/qa-admin-org.spec.ts` R-QA-004 «Сохранить» organisation settings: nothing changed — disabled; out-of-range va… |
| `admin/OrgSettingsSection/confirm.primenit-izmeneniya-politiki.primenit` | Применить | с подтверждением | ✔ | ✔ | ✗ | ✔ | ✔ | ✗ | ✔ | ✗ | `e2e/qa-admin-org.spec.ts` R-QA-004 «Сохранить» organisation settings: nothing changed — disabled; out-of-range va… |
| `admin/OrgSettingsSection/toggle-data` | {…} |  | · | ✔ | · | ✔ | · | ✔ | · | · | `e2e/qa-admin-org.spec.ts` QA-A4 (fixed) no permission: an auditor opening /admin/settings lands on the audit log … (+1) |
| `admin/OrgSettingsSection/otmenit-izmeneniya` | Отменить изменения |  | ✔ | ✔ | ✗ | ✔ | ✔ | ✗ | ✔ | ✗ | `e2e/qa-admin-org.spec.ts` R-QA-004 «Сохранить» organisation settings: nothing changed — disabled; out-of-range va… |
| `admin/OrgSettingsSection/sohranit` | Сохранить | **критичная** | ✔ | ✔ | ✗ | ✔ | ✔ | ✔ | ✔ | ✗ | `e2e/qa-admin-org.spec.ts` QA-A4 (fixed) no permission: an auditor opening /admin/settings lands on the audit log … (+1) |
| `admin/UsersSection/edit` | Изменить профиль и роль | **критичная** | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✗ | ✔ | `e2e/qa-actions.spec.ts` R-QA-004 admin users menu: «Сбросить пароль» (cancel, then link), «Изменить профиль и р… (+4) |
| `admin/UsersSection/transfer` | Перевести в другой отдел… |  | ✗ | ✔ | ✗ | ✗ | ✔ | ✗ | ✗ | ✗ | `e2e/qa-admin-users.spec.ts` R-QA-004 «Перевести в другой отдел…»: «Сравнить доступы» shows the space access change … (+1) |
| `admin/UsersSection/resend` | Отправить приглашение повторно | **критичная** | ✗ | ✔ | ✗ | ✔ | ✔ | ✔ | ✔ | ✗ | `e2e/qa-admin-offline.spec.ts` R-QA-029 offline: «Отправить приглашение повторно» and «Завершить сеанс?» explain the l… (+2) |
| `admin/UsersSection/revoke-invite` | Отозвать приглашение | **критичная** | ✗ | ✔ | ✗ | ✔ | ✔ | ✔ | ✗ | ✗ | `e2e/qa-admin-users.spec.ts` R-QA-004 invitations: «Отправить приглашение повторно» issues a new link and kills the … (+1) |
| `admin/UsersSection/confirm.otozvat-priglashenie` | Отозвать приглашение? | с подтверждением; **критичная** | ✗ | ✔ | · | ✗ | ✗ | ✗ | ✗ | · | `e2e/qa-admin-users.spec.ts` R-QA-004 invitations: «Отправить приглашение повторно» issues a new link and kills the … |
| `admin/UsersSection/confirm.otozvat-priglashenie.otozvat` | Отозвать | с подтверждением; **критичная** | ✗ | ✔ | ✗ | ✔ | ✔ | ✗ | ✗ | ✗ | `e2e/qa-admin-users.spec.ts` R-QA-004 invitations: «Отправить приглашение повторно» issues a new link and kills the … |
| `admin/UsersSection/reset` | Сбросить пароль | **критичная** | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-actions.spec.ts` R-QA-004 admin users menu: «Сбросить пароль» (cancel, then link), «Изменить профиль и р… |
| `admin/UsersSection/confirm.sbrosit-parol` | Сбросить пароль? | с подтверждением; **критичная** | ✗ | ✔ | · | ✗ | ✗ | ✗ | ✗ | · | `e2e/qa-actions.spec.ts` R-QA-004 admin users menu: «Сбросить пароль» (cancel, then link), «Изменить профиль и р… |
| `admin/UsersSection/confirm.sbrosit-parol.sbrosit-parol` | Сбросить пароль | с подтверждением; **критичная** | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-actions.spec.ts` R-QA-004 admin users menu: «Сбросить пароль» (cancel, then link), «Изменить профиль и р… |
| `admin/UsersSection/sessions` | Завершить все сеансы | **критичная** | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … |
| `admin/UsersSection/confirm.zavershit-vse-seansy` | Завершить все сеансы? | с подтверждением; **критичная** | ✗ | ✔ | · | ✗ | ✗ | ✗ | ✗ | · | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … |
| `admin/UsersSection/confirm.zavershit-vse-seansy.zavershit-seansy` | Завершить сеансы | с подтверждением; **критичная** | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … |
| `admin/UsersSection/suspend` | Приостановить доступ… | без прав: «Нельзя отключить себя»; **критичная** | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … (+1) |
| `admin/UsersSection/reactivate` | Восстановить доступ | **критичная** | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-actions.spec.ts` R-QA-004 admin users menu: «Сбросить пароль» (cancel, then link), «Изменить профиль и р… |
| `admin/UsersSection/confirm.vosstanovit-dostup` | Восстановить доступ? | с подтверждением; **критичная** | ✗ | ✔ | · | ✗ | ✗ | ✗ | ✗ | · | `e2e/qa-actions.spec.ts` R-QA-004 admin users menu: «Сбросить пароль» (cancel, then link), «Изменить профиль и р… |
| `admin/UsersSection/confirm.vosstanovit-dostup.vosstanovit` | Восстановить | с подтверждением; **критичная** | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/acl-p0-routes.spec.ts` ROUTE-03: space manager route — members and group access → template → tree drag-and-dro… (+2) |
| `admin/UsersSection/deactivate` | Деактивировать (увольнение)… | без прав: «Нельзя отключить себя»; **критичная** | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-actions.spec.ts` R-QA-004 admin users menu: «Сбросить пароль» (cancel, then link), «Изменить профиль и р… |
| `admin/UsersSection/import-csv` | Импорт CSV | **критичная** | ✔ | ✔ | ✗ | ✔ | ✔ | ✔ | ✗ | ✗ | `e2e/qa-admin-users.spec.ts` QA-A2 (fixed): «Импорт CSV» with the same email twice in the file flags the repeat in t… (+4) |
| `admin/UsersSection/dobavit` | Добавить |  | ✔ | ✔ | ✔ | ✗ | ✔ | ✔ | ✗ | ✔ | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … (+6) |
| `admin/UsersSection/gotovo` | Готово |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … (+4) |
| `admin/CreateUserDialog/polzovatel-sozdan` | Пользователь создан |  | ✗ | ✔ | ✔ | ✗ | ✔ | ✗ | ✗ | ✔ | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … (+4) |
| `admin/CreateUserDialog/dobavit-esche` | Добавить ещё |  | ✔ | ✔ | ✗ | ✗ | ✗ | ✔ | ✗ | ✗ | `e2e/qa-admin2-users.spec.ts` R-QA-004 «Новый пользователь»: «Гость» ↔ «Сотрудник» switches the form; «Фильтр групп» … |
| `admin/CreateUserDialog/gotovo` | Готово |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … (+4) |
| `admin/CreateUserDialog/novyy-polzovatel` | Новый пользователь |  | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … (+7) |
| `admin/CreateUserDialog/otmena` | Отмена |  | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✔ | ✗ | `e2e/qa-actions.spec.ts` R-QA-004 admin users menu: «Сбросить пароль» (cancel, then link), «Изменить профиль и р… (+5) |
| `admin/CreateUserDialog/sozdat` | Создать | **критичная** | ✔ | ✔ | ✔ | ✗ | ✔ | ✗ | ✗ | ✔ | `e2e/acl-p0-routes.spec.ts` ROUTE-03: space manager route — members and group access → template → tree drag-and-dro… (+6) |
| `admin/CreateUserDialog/sotrudnik` | Сотрудник |  | ✔ | ✔ | ✗ | ✗ | ✗ | ✔ | ✗ | · | `e2e/qa-admin2-users.spec.ts` R-QA-004 «Новый пользователь»: «Гость» ↔ «Сотрудник» switches the form; «Фильтр групп» … |
| `admin/CreateUserDialog/gost` | Гость |  | ✔ | ✔ | ✗ | ✗ | ✗ | ✔ | ✗ | · | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … (+1) |
| `admin/CreateUserDialog/otdel` | {…} отдел |  | ✔ | ✔ | ✔ | ✗ | ✗ | ✔ | ✗ | ✔ | `e2e/acl-p0-routes.spec.ts` ROUTE-03: space manager route — members and group access → template → tree drag-and-dro… (+5) |
| `admin/CreateUserDialog/sozdat-ssylku-priglashenie-sotrudnik-sam-zadast` | Создать ссылку-приглашение (сотрудник сам задаст пароль) | **критичная** | ✔ | ✔ | ✔ | ✗ | ✔ | ✗ | ✗ | ✔ | `e2e/qa-admin-users.spec.ts` R-QA-004 «Добавить» user: empty form disabled; server error keeps the input; slow netwo… |
| `admin/CreateUserDialog/zadat-parol-vruchnuyu` | Задать пароль вручную | **критичная** | · | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | · | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … |
| `admin/ImportDialog/propuschennye-stroki` | Пропущенные строки ({…}) |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-admin2-users.spec.ts` R-QA-004 «Импорт CSV» from «Файл CSV»: the file fills the text, a file over 2 MB is ref… |
| `admin/ImportDialog/kopirovat-ssylki` | Копировать ссылки |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-admin2-users.spec.ts` R-QA-004 «Импорт CSV» from «Файл CSV»: the file fills the text, a file over 2 MB is ref… |
| `admin/ImportDialog/skachat-csv` | Скачать CSV |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-admin2-users.spec.ts` R-QA-004 «Импорт CSV» from «Файл CSV»: the file fills the text, a file over 2 MB is ref… |
| `admin/ImportDialog/gotovo` | Готово |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … (+4) |
| `admin/ImportDialog/nazad-k-dannym` | Назад к данным |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-admin2-users.spec.ts` R-QA-004 «Импорт CSV» from «Файл CSV»: the file fills the text, a file over 2 MB is ref… |
| `admin/ImportDialog/importirovat` | Импортировать ({…}) | **критичная** | ✔ | ✔ | ✗ | ✔ | ✔ | ✔ | ✗ | ✔ | `e2e/qa-admin-users.spec.ts` QA-A2 (fixed): «Импорт CSV» with the same email twice in the file flags the repeat in t… (+3) |
| `admin/ImportDialog/confirm.importirovat-polzovateley` | Импортировать пользователей? | с подтверждением; **критичная** | ✔ | ✔ | · | ✔ | ✔ | ✗ | ✗ | · | `e2e/qa-admin-users.spec.ts` QA-A2 (fixed): «Импорт CSV» with the same email twice in the file flags the repeat in t… (+2) |
| `admin/ImportDialog/confirm.importirovat-polzovateley.importirovat` | Импортировать | с подтверждением; **критичная** | ✔ | ✔ | ✔ | ✔ | ✔ | ✗ | ✗ | ✔ | `e2e/import-collection.spec.ts` R-COLLECTION-003: import into an existing collection in «replace» mode — dry run lists … (+7) |
| `admin/ImportDialog/fayl-csv` | Файл CSV |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-admin2-users.spec.ts` R-QA-004 «Импорт CSV» from «Файл CSV»: the file fills the text, a file over 2 MB is ref… |
| `admin/ImportDialog/otmena` | Отмена |  | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✔ | ✗ | `e2e/qa-actions.spec.ts` R-QA-004 admin users menu: «Сбросить пароль» (cancel, then link), «Изменить профиль и р… (+5) |
| `admin/ImportDialog/proverit` | Проверить |  | ✗ | ✔ | ✗ | ✗ | ✔ | ✗ | ✗ | ✗ | `e2e/editor-p0-clipboard.spec.ts` copy: a text selection, a block and a section of a heading go to the clipboard as text/… (+3) |
| `admin/ImportDialog/import-sotrudnikov-iz-csv` | Импорт сотрудников из CSV | **критичная** | ✗ | ✔ | · | ✔ | ✔ | ✗ | ✗ | · | `e2e/qa-admin-users.spec.ts` QA-A2 (fixed): «Импорт CSV» with the same email twice in the file flags the repeat in t… (+3) |
| `admin/EditUserDialog/confirm.naznachit-administrativnuyu-rol` | Назначить административную роль? | с подтверждением; **критичная** | ✗ | ✔ | · | ✔ | ✔ | ✗ | ✗ | · | `e2e/qa-admin-users.spec.ts` R-QA-004 «Изменить профиль и роль»: «Роль в организации» → administrator asks «Назначит… |
| `admin/EditUserDialog/confirm.naznachit-administrativnuyu-rol.naznachit` | Назначить | с подтверждением | ✗ | ✔ | ✗ | ✔ | ✔ | ✗ | ✗ | ✗ | `e2e/qa-admin-users.spec.ts` R-QA-004 «Изменить профиль и роль»: «Роль в организации» → administrator asks «Назначит… |
| `admin/EditUserDialog/izmenit` | Изменить: {…} |  | ✗ | ✔ | · | ✗ | ✔ | ✔ | ✗ | · | `e2e/qa-actions.spec.ts` R-QA-004 admin users menu: «Сбросить пароль» (cancel, then link), «Изменить профиль и р… (+4) |
| `admin/EditUserDialog/otmena` | Отмена |  | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✔ | ✗ | `e2e/qa-actions.spec.ts` R-QA-004 admin users menu: «Сбросить пароль» (cancel, then link), «Изменить профиль и р… (+5) |
| `admin/EditUserDialog/sohranit` | Сохранить | **критичная** | ✗ | ✔ | ✗ | ✗ | ✔ | ✔ | ✗ | ✗ | `e2e/acl-p0-routes.spec.ts` ROUTE-03: space manager route — members and group access → template → tree drag-and-dro… (+6) |
| `admin/StatusDialog/deaktivirovat` | Деактивировать {…}? | **критичная** | ✗ | ✔ | · | ✗ | ✗ | ✗ | ✗ | · | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … (+1) |
| `admin/StatusDialog/otmena` | Отмена |  | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✔ | ✗ | `e2e/qa-actions.spec.ts` R-QA-004 admin users menu: «Сбросить пароль» (cancel, then link), «Изменить профиль и р… (+5) |
| `admin/StatusDialog/deaktivirovat~2` | Деактивировать | **критичная** | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-actions.spec.ts` R-QA-004 admin users menu: «Сбросить пароль» (cancel, then link), «Изменить профиль и р… |
| `admin/StatusDialog/ya-ponimayu-posledstviya` | Я понимаю последствия |  | · | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | · | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … (+1) |
| `admin/TransferDialog/perevod` | Перевод: {…} |  | ✗ | ✔ | · | ✗ | ✔ | ✗ | ✗ | · | `e2e/qa-admin-users.spec.ts` R-QA-004 «Перевести в другой отдел…»: «Сравнить доступы» shows the space access change … (+1) |
| `admin/TransferDialog/otmena` | Отмена |  | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✔ | ✗ | `e2e/qa-actions.spec.ts` R-QA-004 admin users menu: «Сбросить пароль» (cancel, then link), «Изменить профиль и р… (+5) |
| `admin/TransferDialog/sravnit-dostupy` | Сравнить доступы | **критичная** | ✗ | ✔ | ✗ | ✗ | ✔ | ✗ | ✗ | ✗ | `e2e/qa-admin-users.spec.ts` R-QA-004 «Перевести в другой отдел…»: «Сравнить доступы» shows the space access change … (+1) |
| `admin/TransferDialog/primenit` | Применить |  | ✗ | ✔ | ✗ | ✗ | ✔ | ✗ | ✗ | ✗ | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … (+2) |
| `admin/TransferDialog/toggle-data` | {…} |  | · | ✔ | ✗ | ✗ | ✔ | ✗ | ✗ | · | `e2e/qa-admin-users.spec.ts` R-QA-004 «Перевести в другой отдел…»: «Сравнить доступы» shows the space access change … (+1) |
| `admin/TransferDialog/otdel` | {…} отдел |  | ✔ | ✔ | ✔ | ✗ | ✗ | ✔ | ✗ | ✔ | `e2e/acl-p0-routes.spec.ts` ROUTE-03: space manager route — members and group access → template → tree drag-and-dro… (+5) |
| `admin/TransferDialog/sdelat-osnovnym-otdelom` | Сделать «{…}» основным отделом |  | · | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | · | `e2e/qa-admin2-users.spec.ts` R-QA-004 «Перевести в другой отдел…»: «Исключить из» the current department and «Добави… |
| `admin/ErrorState/povtorit` | Повторить |  | ✗ | ✔ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | `e2e/qa-admin2-users.spec.ts` R-UI-061 users list load error: «Не удалось загрузить данные.» with «Повторить» — a ret… |
| `admin/CopyField/kopirovat` | Копировать |  | · | ✔ | · | · | ✔ | · | · | · | `e2e/qa-admin2-users.spec.ts` R-QA-004 «Новый пользователь»: «Гость» ↔ «Сотрудник» switches the form; «Фильтр групп» … (+1) |
| `admin/UserPicker/ochistit-vybor` | Очистить выбор | **критичная** | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-admin-users.spec.ts` R-QA-004 «Руководитель» picker: a picked manager is saved; «Очистить выбор» removes the… |
| `admin/Pager/nazad` | Назад |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-admin2-users.spec.ts` R-QA-004 pager: more than 50 users — «Далее» shows the next page from the server, «Наза… |
| `admin/Pager/dalee` | Далее |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-admin2-users.spec.ts` R-QA-004 pager: more than 50 users — «Далее» shows the next page from the server, «Наза… |

### app

| ID | Операция | Особенности из кода | Пусто | Успех | Загрузка / медленная сеть | Отмена | Ошибка сервера | Нет прав | Потеря сети | Повторный клик | Тест |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `app/Authenticated/povtorit` | Повторить |  | ✔ | ✔ | ✔ | ✗ | ✔ | ✗ | ✔ | ✗ | `e2e/editor-p0-dnd.spec.ts` autoscroll near the bottom edge while dragging, drop far below (QA26-09) (+13) |
| `app/Authenticated/povtorit~2` | Повторить |  | ✔ | ✔ | ✔ | ✗ | ✔ | ✗ | ✔ | ✗ | `e2e/editor-p0-dnd.spec.ts` autoscroll near the bottom edge while dragging, drop far below (QA26-09) (+13) |
| `app/Authenticated/route.root` | / | **критичная** | ✔ | ✔ | ✔ | ✔ | ✔ | ✗ | ✔ | ✔ | `e2e/a11y.spec.ts` keyboard only: quick switcher, help, dialogs close with Esc and return focus (UX-136, S… (+313) |
| `app/Authenticated/route.p-pageid` | /p/:pageId | **критичная** | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | `e2e/a11y.spec.ts` keyboard only: quick switcher, help, dialogs close with Esc and return focus (UX-136, S… (+79) |
| `app/Authenticated/route.p-pageid-slug` | /p/:pageId/:slug | **критичная** | ✗ | ✔ | ✗ | · | ✗ | ✗ | ✗ | · | `e2e/qa-crawl.spec.ts` QA26-01, QA26-04, R-UI-026: every route rendered as owner exposes only named controls; … |
| `app/Authenticated/route.s-spaceid` | /s/:spaceId | **критичная** | ✔ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | · | `e2e/acl-p0-routes.spec.ts` ROUTE-01: employee route — login → own spaces → regulation → search → one-click article… (+9) |
| `app/Authenticated/route.search` | /search | **критичная** | ✔ | ✔ | ✗ | · | ✔ | ✗ | ✗ | · | `e2e/a11y.spec.ts` real 200% browser zoom (1280x800 at 2x = 640x400 CSS px) keeps every key screen usable … (+8) |
| `app/Authenticated/route.trash` | /trash | **критичная** | ✗ | ✔ | ✗ | ✔ | ✔ | ✗ | ✗ | · | `e2e/a11y.spec.ts` WCAG 2.1 AA automated audit of key screens (R-A11Y-003, AT-80, E2E-112) (+7) |
| `app/Authenticated/route.templates` | /templates | **критичная** | ✗ | ✔ | ✗ | · | ✗ | ✗ | ✗ | · | `e2e/a11y.spec.ts` WCAG 2.1 AA automated audit of key screens (R-A11Y-003, AT-80, E2E-112) (+6) |
| `app/Authenticated/route.import` | /import | **критичная** | ✗ | ✔ | ✗ | · | ✗ | ✗ | ✗ | · | `e2e/a11y.spec.ts` WCAG 2.1 AA automated audit of key screens (R-A11Y-003, AT-80, E2E-112) (+6) |
| `app/Authenticated/route.settings` | /settings | **критичная** | ✗ | ✔ | ✗ | · | ✗ | ✗ | ✗ | · | `e2e/a11y.spec.ts` real 200% browser zoom (1280x800 at 2x = 640x400 CSS px) keeps every key screen usable … (+4) |
| `app/Authenticated/route.admin` | /admin | **критичная** | ✗ | ✔ | ✗ | · | ✗ | ✔ | ✗ | · | `e2e/a11y.spec.ts` real 200% browser zoom (1280x800 at 2x = 640x400 CSS px) keeps every key screen usable … (+3) |
| `app/App/route.invite-token` | /invite/:token | **критичная** | ✔ | ✔ | ✗ | · | ✗ | ✗ | ✗ | · | `e2e/qa-actions.spec.ts` R-QA-004 invitation link /invite/:token: empty password disables «Продолжить», an inval… |

### auth

| ID | Операция | Особенности из кода | Пусто | Успех | Загрузка / медленная сеть | Отмена | Ошибка сервера | Нет прав | Потеря сети | Повторный клик | Тест |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `auth/LoginPage/podtverdit` | Подтвердить | **критичная** | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/editor-p0-dnd.spec.ts` autoscroll near the bottom edge while dragging, drop far below (QA26-09) (+6) |
| `auth/SetupPage/sozdat-organizaciyu` | Создать организацию | **критичная** | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/a11y.spec.ts` keyboard only: quick switcher, help, dialogs close with Esc and return focus (UX-136, S… (+311) |
| `auth/InvitePage/prodolzhit` | Продолжить |  | ✔ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/editor-p0-dnd.spec.ts` autoscroll near the bottom edge while dragging, drop far below (QA26-09) (+8) |

### common

| ID | Операция | Особенности из кода | Пусто | Успех | Загрузка / медленная сеть | Отмена | Ошибка сервера | Нет прав | Потеря сети | Повторный клик | Тест |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `common/DocPreview/vypolneno` | Выполнено |  | · | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | · | **нет** |
| `common/DocPreview/podrobnee` | Подробнее |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `common/ErrorBoundary/povtorit` | Повторить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `common/ErrorBoundary/obnovit-stranicu` | Обновить страницу |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `common/ErrorBoundary/podrobnosti` | Подробности |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `common/IconPicker/ubrat` | Убрать |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `common/IconPicker/button-data` | {…} |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `common/ViewerInner/umenshit` | Уменьшить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `common/ViewerInner/x` | {…}% |  | ✗ | ✔ | ✗ | ✔ | ✗ | ✔ | ✗ | ✔ | `e2e/content.spec.ts` image: upload via file chooser, resize presets, caption, full-screen viewer with zoom |
| `common/ViewerInner/uvelichit` | Увеличить |  | ✗ | ✔ | ✗ | ✔ | ✗ | ✔ | ✗ | ✔ | `e2e/content.spec.ts` image: upload via file chooser, resize presets, caption, full-screen viewer with zoom |
| `common/ViewerInner/vpisat-v-ekran` | Вписать в экран |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `common/ViewerInner/povernut` | Повернуть |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `common/ViewerInner/zakryt` | Закрыть |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `common/ViewerInner/predyduschee-izobrazhenie` | Предыдущее изображение |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `common/ViewerInner/sleduyuschee-izobrazhenie` | Следующее изображение |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `common/MoveDialog/peremestit` | Переместить «{…}» | **критичная** | ✗ | ✔ | · | ✔ | ✔ | ✗ | ✗ | · | `e2e/qa-actions.spec.ts` R-QA-004 tree row: rename (F2) — Esc cancels, Enter saves, server error keeps the old t… (+1) |
| `common/MoveDialog/prostranstva` | Пространства |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `common/MoveDialog/peremestit-syuda` | Переместить сюда | **критичная** | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/route-author.spec.ts` ROUTE-02: draft → offline → sync → move to a department with visibility preview → appro… |
| `common/MoveDialog/vnutr` | Внутрь |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `common/MoveDialog/otkryt` | Открыть «{…}» |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `common/MoveDialog/x` | 🗂 {…} |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `common/NotificationsPopover/prochitat-vse` | Прочитать все |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `common/NotificationsPopover/x` | {…} «{…}» · {…} |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `common/OcrDialog/tekst-na-izobrazhenii` | Текст на изображении |  | ✗ | ✗ | · | ✗ | ✗ | ✗ | ✗ | · | **нет** |
| `common/OcrDialog/raspoznat-zanovo` | Распознать заново |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `common/OcrDialog/vernut-raspoznannyy-tekst` | Вернуть распознанный текст |  | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/ocr-view.spec.ts` SC-22: the OCR view shows the original image, confidence with uncertain words, correcti… |
| `common/OcrDialog/kopirovat` | Копировать |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `common/OcrDialog/sohranit-ispravleniya` | Сохранить исправления | **критичная** | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/ocr-view.spec.ts` SC-22: the OCR view shows the original image, confidence with uncertain words, correcti… |
| `common/useEvents/otkryt-versiyu` | Открыть версию {…} | **критичная** | · | ✔ | · | ✗ | ✗ | ✔ | ✗ | ✗ | `e2e/qa-editor-history.spec.ts` R-HISTORY-014: a co-author sees «Открыть версию N» after the owner restores a version; … |

### editor

| ID | Операция | Особенности из кода | Пусто | Успех | Загрузка / медленная сеть | Отмена | Ошибка сервера | Нет прав | Потеря сети | Повторный клик | Тест |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `editor/BlockConflictHost/razreshit` | Разрешить |  | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✔ | ✗ | `e2e/conflict.spec.ts` R-COLLAB-036: conflict dialog — «keep both» keeps the deletion result and adds my versi… (+1) |
| `editor/BlockConflictHost/konflikt-pravok` | Конфликт правок | **критичная** | ✗ | ✔ | · | ✔ | ✗ | ✗ | ✔ | · | `e2e/qa-editor-conflicts.spec.ts` R-COLLAB-036: «Конфликт правок» — «Решить позже» leaves a reminder, «Разрешить» reopens… |
| `editor/BlockConflictHost/reshit-pozzhe` | Решить позже |  | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✔ | ✗ | `e2e/conflict.spec.ts` R-COLLAB-036: conflict dialog — «keep both» keeps the deletion result and adds my versi… (+1) |
| `editor/BlockConflictHost/prinyat-versiyu-servera` | Принять версию сервера | **критичная** | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✔ | ✗ | `e2e/conflict.spec.ts` R-COLLAB-036: conflict dialog — «accept the server version» keeps the deletion, my vers… |
| `editor/BlockConflictHost/sohranit-obe` | Сохранить обе | **критичная** | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✔ | ✗ | `e2e/conflict.spec.ts` R-COLLAB-036: a change the server refuses opens the comparison dialog; «keep both» save… (+2) |
| `editor/BlockConflictHost/ostavit-moyu` | Оставить мою |  | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✔ | ✗ | `e2e/collab-p0-editing.spec.ts` a block is moved by one editor while another edits it: the edit is kept as a conflict c… (+2) |
| `editor/DocConflictDialog/otkryt` | Открыть |  | · | ✗ | · | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `editor/DocConflictDialog/stranica-udalena-poka-vy-ee-redaktirovali` | Страница удалена, пока вы её редактировали | **критичная** | ✗ | ✔ | · | ✗ | ✔ | ✔ | ✔ | · | `e2e/qa-editor-conflicts.spec.ts` QA-E3 (fixed): offline edits to a page trashed meanwhile — after reconnecting the same … (+2) |
| `editor/DocConflictDialog/sohranit-lokalnuyu-kopiyu` | Сохранить локальную копию | **критичная** | ✗ | ✔ | ✗ | ✗ | ✔ | ✗ | ✔ | ✗ | `e2e/qa-editor-conflicts.spec.ts` R-COLLAB-036: «Страница удалена, пока вы её редактировали» — «Сохранить локальную копию… |
| `editor/DocConflictDialog/da-otbrosit-moi-izmeneniya` | Да, отбросить мои изменения |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `editor/DocConflictDialog/sohranit-moyu-versiyu-kak-novuyu-stranicu` | Сохранить мою версию как новую страницу | **критичная** | ✗ | ✔ | ✗ | ✗ | ✔ | ✗ | ✔ | ✗ | `e2e/qa-editor-conflicts.spec.ts` QA-E3 (fixed): offline edits to a page trashed meanwhile — after reconnecting the same … (+1) |
| `editor/PageEditor/razreshit` | Разрешить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `editor/FatalBanner/skachat-lokalnuyu-kopiyu-markdown` | Скачать локальную копию (Markdown) |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `editor/EditorInner/otkryt` | Открыть |  | · | ✗ | · | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `editor/EditorInner/otkryt~2` | Открыть |  | · | ✗ | · | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `editor/ReadOnlyCommentButton/kommentirovat` | Комментировать |  | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-editor2-handle.spec.ts` R-COMMENTS-001 «Комментировать» from the block menu opens a draft quoting the block (Es… |
| `editor/FindBar/predyduschee` | Предыдущее |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `editor/FindBar/sleduyuschee` | Следующее |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `editor/FindBar/zakryt-poisk` | Закрыть поиск |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `editor/EmbedDialog/video-ili-ssylka` | Видео или ссылка |  | ✗ | ✔ | · | ✗ | ✗ | ✗ | ✗ | · | `e2e/qa-actions.spec.ts` R-QA-004 editor "/" menu: every block command inserts its block; dialog commands close … |
| `editor/EmbedDialog/otmena` | Отмена |  | ✔ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-actions.spec.ts` R-QA-004 editor "/" menu: every block command inserts its block; dialog commands close … |
| `editor/EmbedDialog/vstavit` | Вставить |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/editor-p0-media.spec.ts` image by URL: dialog with preview, internal addresses refused, the image is stored as a… (+1) |
| `editor/MathDialog/formula` | Формула |  | ✗ | ✗ | · | ✗ | ✗ | ✗ | ✗ | · | **нет** |
| `editor/MathDialog/otmena` | Отмена |  | ✔ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-actions.spec.ts` R-QA-004 editor "/" menu: every block command inserts its block; dialog commands close … |
| `editor/MathDialog/gotovo` | Готово |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `editor/TouchInsertButton/vstavit-blok` | Вставить блок |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/ui-p0-touch.spec.ts` UX-146, R-UI-058: on a touch phone the floating "+" inserts a block without hover |
| `editor/FootnotesList/snoska-otkryt-u-ssylki-v-tekste` | Сноска {…}: открыть у ссылки в тексте |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `editor/FootnotesList/vernutsya-k-ssylke-na-snosku` | Вернуться к ссылке на сноску {…} |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `editor/ImageUrlDialog/izobrazhenie-po-ssylke` | Изображение по ссылке |  | ✗ | ✔ | · | ✗ | ✗ | ✗ | ✗ | · | `e2e/editor-p0-media.spec.ts` image by URL: dialog with preview, internal addresses refused, the image is stored as a… |
| `editor/ImageUrlDialog/otmena` | Отмена |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `editor/ImageUrlDialog/zagruzka` | Загрузка… |  | ✗ | ✔ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | `e2e/qa-admin2-users.spec.ts` R-UI-061 users list load error: «Не удалось загрузить данные.» with «Повторить» — a ret… |
| `editor/PagePicker/nazad` | Назад |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `editor/PagePicker/tekst` | Текст — |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `editor/copy/confirm.skopiruyte-vruchnuyu` | Скопируйте вручную | с подтверждением | ✗ | ✔ | · | ✔ | ✔ | ✗ | ✗ | · | `e2e/clipboard.spec.ts` refused clipboard access shows an error and the text for manual copying, not a false su… (+2) |
| `editor/copy/confirm.skopiruyte-vruchnuyu.gotovo` | Готово | с подтверждением | ✗ | ✔ | ✗ | ✗ | ✔ | ✗ | ✗ | ✗ | `e2e/clipboard.spec.ts` refused clipboard access shows an error and the text for manual copying, not a false su… (+1) |
| `editor/commands/text` | Текст |  | · | ✗ | · | ✗ | · | ✗ | ✗ | · | **нет** |
| `editor/commands/h1` | Заголовок 1 | клавиша # | · | ✔ | · | ✗ | · | ✗ | ✗ | · | `e2e/editor-p0-blocks.spec.ts` text blocks: paragraph, H1–H6, lead, quote and divider are created from the "/" menu; b… |
| `editor/commands/h2` | Заголовок 2 | клавиша ## | · | ✔ | · | ✗ | · | ✗ | ✗ | · | `e2e/editor-p0-blocks.spec.ts` text blocks: paragraph, H1–H6, lead, quote and divider are created from the "/" menu; b… |
| `editor/commands/h3` | Заголовок 3 | клавиша ### | · | ✔ | · | ✗ | · | ✗ | ✗ | · | `e2e/editor-p0-blocks.spec.ts` text blocks: paragraph, H1–H6, lead, quote and divider are created from the "/" menu; b… |
| `editor/commands/h4` | Заголовок 4 | клавиша #### | · | ✔ | · | ✗ | · | ✗ | ✗ | · | `e2e/editor-p0-blocks.spec.ts` text blocks: paragraph, H1–H6, lead, quote and divider are created from the "/" menu; b… |
| `editor/commands/h5` | Заголовок 5 | клавиша ##### | · | ✔ | · | ✗ | · | ✗ | ✗ | · | `e2e/editor-p0-blocks.spec.ts` text blocks: paragraph, H1–H6, lead, quote and divider are created from the "/" menu; b… |
| `editor/commands/h6` | Заголовок 6 | клавиша ###### | · | ✔ | · | ✗ | · | ✗ | ✗ | · | `e2e/editor-p0-blocks.spec.ts` text blocks: paragraph, H1–H6, lead, quote and divider are created from the "/" menu; b… |
| `editor/commands/lead` | Вводный абзац |  | · | ✔ | · | ✗ | · | ✗ | ✗ | · | `e2e/editor-p0-blocks.spec.ts` text blocks: paragraph, H1–H6, lead, quote and divider are created from the "/" menu; b… (+1) |
| `editor/commands/bullet` | Маркированный список | клавиша - | · | ✗ | · | ✗ | · | ✗ | ✗ | · | **нет** |
| `editor/commands/ordered` | Нумерованный список | клавиша 1. | · | ✗ | · | ✗ | · | ✗ | ✗ | · | **нет** |
| `editor/commands/todo` | Чек-лист | клавиша [] | · | ✗ | · | ✗ | · | ✗ | ✗ | · | **нет** |
| `editor/commands/toggle` | Раскрывающийся блок | клавиша > | · | ✗ | · | ✗ | · | ✗ | ✗ | · | **нет** |
| `editor/commands/table` | Таблица |  | ✔ | ✔ | · | ✗ | · | ✗ | ✔ | · | `e2e/collab-p0-editing.spec.ts` two editors change a paragraph, one table and the structure while one loses the connect… (+3) |
| `editor/commands/callout` | Выделенный блок | клавиша !info | · | ✔ | · | ✗ | · | ✗ | ✗ | · | `e2e/editor.spec.ts` slash menu inserts a table and a callout; "> " creates a toggle |
| `editor/commands/quote` | Цитата | клавиша " | · | ✔ | · | ✗ | · | ✗ | ✗ | · | `e2e/editor-p0-blocks.spec.ts` text blocks: paragraph, H1–H6, lead, quote and divider are created from the "/" menu; b… |
| `editor/commands/code` | Блок кода | клавиша ``` | · | ✗ | · | ✗ | · | ✗ | ✗ | · | **нет** |
| `editor/commands/divider` | Разделитель | клавиша --- | · | ✔ | · | ✗ | · | ✗ | ✗ | · | `e2e/editor-p0-blocks.spec.ts` text blocks: paragraph, H1–H6, lead, quote and divider are created from the "/" menu; b… |
| `editor/commands/cols2` | Две колонки |  | · | ✗ | · | ✗ | · | ✗ | ✗ | · | **нет** |
| `editor/commands/cols3` | Три колонки |  | · | ✗ | · | ✗ | · | ✗ | ✗ | · | **нет** |
| `editor/commands/image` | Изображение |  | · | ✔ | · | ✔ | · | ✔ | ✗ | ✔ | `e2e/clipboard.spec.ts` image viewer: click on a selected image opens it; zoom is limited to 10–800 % (R-MEDIA-… (+2) |
| `editor/commands/image-url` | Изображение по ссылке |  | · | ✔ | · | ✗ | · | ✗ | ✗ | · | `e2e/editor-p0-media.spec.ts` image by URL: dialog with preview, internal addresses refused, the image is stored as a… |
| `editor/commands/file` | Файл |  | · | ✗ | · | ✗ | · | ✗ | ✗ | · | **нет** |
| `editor/commands/video` | Видео или ссылка |  | · | ✔ | · | ✗ | · | ✗ | ✗ | · | `e2e/qa-actions.spec.ts` R-QA-004 editor "/" menu: every block command inserts its block; dialog commands close … |
| `editor/commands/subpage` | Вложенная страница |  | · | ✗ | · | ✗ | · | ✗ | ✗ | · | **нет** |
| `editor/commands/pagelink` | Ссылка на страницу | клавиша [[ | · | ✔ | · | ✗ | · | ✗ | ✗ | · | `e2e/qa-actions.spec.ts` R-QA-004 editor "/" menu: every block command inserts its block; dialog commands close … |
| `editor/commands/mention` | Упоминание | клавиша @ | · | ✔ | · | ✗ | · | ✗ | ✗ | · | `e2e/qa-actions.spec.ts` R-QA-004 editor "/" menu: every block command inserts its block; dialog commands close … |
| `editor/commands/toc` | Оглавление |  | · | ✗ | · | ✗ | · | ✗ | ✗ | · | **нет** |
| `editor/commands/synced` | Синхронизированный блок |  | · | ✔ | · | ✗ | · | ✗ | ✗ | · | `e2e/qa-actions.spec.ts` R-QA-004 editor "/" menu: every block command inserts its block; dialog commands close … |
| `editor/commands/collection` | Реестр (база данных) |  | · | ✔ | ✔ | ✗ | ✔ | ✗ | ✗ | · | `e2e/clipboard.spec.ts` registry block from the slash menu shows the new collection (R-COLLECTION-001) (+1) |
| `editor/commands/footnote` | Сноска | клавиша Ctrl+Alt+F | · | ✔ | · | ✔ | · | ✗ | ✗ | · | `e2e/editor-footnotes-media.spec.ts` R-EDITOR-038: footnotes — insert (Ctrl+Alt+F and /-menu), automatic numbering, note ↔ r… |
| `editor/commands/math` | Формула |  | · | ✗ | · | ✗ | · | ✗ | ✗ | · | **нет** |
| `editor/commands/mermaid` | Схема (Mermaid) |  | · | ✗ | · | ✗ | · | ✗ | ✗ | · | **нет** |
| `editor/commands/emoji` | Эмодзи | клавиша : | · | ✔ | · | ✗ | · | ✗ | ✗ | · | `e2e/qa-actions.spec.ts` R-QA-004 editor "/" menu: every block command inserts its block; dialog commands close … |
| `editor/suggest/items.bez-nazvaniya` | Без названия |  | · | ✗ | · | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `editor/suggest/items.bez-nazvaniya~2` | Без названия |  | · | ✗ | · | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `editor/suggest/new` | Создать вложенную страницу «{…}» | **критичная** | ✗ | ✔ | ✗ | ✔ | ✔ | ✗ | ✔ | ✗ | `e2e/qa-editor-toolbars.spec.ts` R-EDITOR-031: «[[» → «Создать вложенную страницу «…»» — Esc cancels without creating; a… |
| `editor/BlockHandle/none` | По умолчанию |  | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-editor2-handle.spec.ts` R-EDITOR-052 «Превратить в» and «Цвет текста» → «По умолчанию» from the block menu: Esc… |
| `editor/BlockHandle/dup` | Дублировать | клавиша Mod+D; **критичная** | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-actions.spec.ts` R-QA-004 block menu «Действия с блоком»: «Дублировать», «Переместить вверх», «Цвет текс… |
| `editor/BlockHandle/up` | Переместить вверх | клавиша Alt+Shift+↑; **критичная** | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/editor-p0-dnd.spec.ts` touch: the block menu (no hover handle) moves and deletes the block at the caret; one U… (+2) |
| `editor/BlockHandle/down` | Переместить вниз | клавиша Alt+Shift+↓; **критичная** | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/editor-p0-blocks.spec.ts` moving blocks: one block by keyboard and block menu, several selected blocks together —… |
| `editor/BlockHandle/move-page` | Переместить на страницу… | **критичная** | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/editor-p0-nav.spec.ts` blocks move to another page: removed here only after the target saved them, order, cont… |
| `editor/BlockHandle/copy` | Копировать блок |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/editor-p0-clipboard.spec.ts` copy: a text selection, a block and a section of a heading go to the clipboard as text/… |
| `editor/BlockHandle/copy-section` | Копировать раздел |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/editor-p0-clipboard.spec.ts` copy: a text selection, a block and a section of a heading go to the clipboard as text/… |
| `editor/BlockHandle/link` | Копировать ссылку на блок |  | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-editor2-handle.spec.ts` R-CLIPBOARD-001 «Копировать ссылку на блок» opens the page at that block; «Копировать к… |
| `editor/BlockHandle/md` | Копировать как Markdown |  | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-editor2-handle.spec.ts` R-CLIPBOARD-001 «Копировать ссылку на блок» opens the page at that block; «Копировать к… |
| `editor/BlockHandle/comment` | Комментировать |  | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-editor2-handle.spec.ts` R-COMMENTS-001 «Комментировать» from the block menu opens a draft quoting the block (Es… |
| `editor/BlockHandle/del` | Удалить | клавиша Del; **критичная** | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/editor-p0-dnd.spec.ts` touch: the block menu (no hover handle) moves and deletes the block at the caret; one U… (+1) |
| `editor/BlockHandle/dobavit-blok-nizhe` | Добавить блок ниже |  | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-editor2-handle.spec.ts` R-EDITOR-052 «Добавить блок ниже»: opens the «/» menu in a new block under the hovered … |
| `editor/BubbleToolbar/confirm.preobrazovat-v-blok-koda` | Преобразовать в блок кода? | с подтверждением | ✗ | ✔ | · | ✗ | ✗ | ✗ | ✗ | · | `e2e/clipboard.spec.ts` converting formatted text to a code block asks first and keeps the text (R-EDITOR-067, … |
| `editor/BubbleToolbar/confirm.preobrazovat-v-blok-koda.preobrazovat` | Преобразовать | с подтверждением | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/clipboard.spec.ts` converting formatted text to a code block asks first and keeps the text (R-EDITOR-067, … |
| `editor/BubbleToolbar/p` | Текст |  | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-editor2-bubble.spec.ts` R-EDITOR-005, QA26-07 «Тип блока»: Текст, Заголовок 1–3, Маркированный/Нумерованный спи… |
| `editor/BubbleToolbar/h1` | Заголовок 1 | клавиша Mod+Alt+1 | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-editor2-bubble.spec.ts` R-EDITOR-005, QA26-07 «Тип блока»: Текст, Заголовок 1–3, Маркированный/Нумерованный спи… |
| `editor/BubbleToolbar/h2` | Заголовок 2 | клавиша Mod+Alt+2 | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-editor2-bubble.spec.ts` R-EDITOR-005, QA26-07 «Тип блока»: Текст, Заголовок 1–3, Маркированный/Нумерованный спи… |
| `editor/BubbleToolbar/h3` | Заголовок 3 | клавиша Mod+Alt+3 | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-editor2-bubble.spec.ts` R-EDITOR-005, QA26-07 «Тип блока»: Текст, Заголовок 1–3, Маркированный/Нумерованный спи… |
| `editor/BubbleToolbar/ul` | Маркированный список | клавиша Mod+Shift+8 | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-editor2-bubble.spec.ts` R-EDITOR-005, QA26-07 «Тип блока»: Текст, Заголовок 1–3, Маркированный/Нумерованный спи… |
| `editor/BubbleToolbar/ol` | Нумерованный список | клавиша Mod+Shift+7 | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-editor2-bubble.spec.ts` R-EDITOR-005, QA26-07 «Тип блока»: Текст, Заголовок 1–3, Маркированный/Нумерованный спи… |
| `editor/BubbleToolbar/todo` | Чек-лист | клавиша Mod+Shift+9 | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-editor2-bubble.spec.ts` R-EDITOR-005, QA26-07 «Тип блока»: Текст, Заголовок 1–3, Маркированный/Нумерованный спи… |
| `editor/BubbleToolbar/quote` | Цитата |  | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-editor2-bubble.spec.ts` R-EDITOR-005, QA26-07 «Тип блока»: Текст, Заголовок 1–3, Маркированный/Нумерованный спи… |
| `editor/BubbleToolbar/code` | Блок кода |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/clipboard.spec.ts` converting formatted text to a code block asks first and keeps the text (R-EDITOR-067, … |
| `editor/BubbleToolbar/callout` | Выделенный блок |  | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-editor2-bubble.spec.ts` R-EDITOR-005, QA26-07 «Тип блока»: Текст, Заголовок 1–3, Маркированный/Нумерованный спи… |
| `editor/BubbleToolbar/button-data` | {…} |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `editor/BubbleToolbar/c-default` | По умолчанию |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-editor2-bubble.spec.ts` R-EDITOR-010 «Ещё»: «По левому краю», «По центру», «По ширине», «Размер шрифта» → 24 px… (+1) |
| `editor/BubbleToolbar/h-none` | Без фона |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-editor2-bubble.spec.ts` R-EDITOR-010 «Цвет»: a text colour and a background, «По умолчанию» and «Без фона» remo… |
| `editor/BubbleToolbar/left` | По левому краю |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-editor2-bubble.spec.ts` R-EDITOR-010 «Ещё»: «По левому краю», «По центру», «По ширине», «Размер шрифта» → 24 px… |
| `editor/BubbleToolbar/center` | По центру |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-editor2-bubble.spec.ts` R-EDITOR-010 «Ещё»: «По левому краю», «По центру», «По ширине», «Размер шрифта» → 24 px… |
| `editor/BubbleToolbar/right` | По правому краю | **критичная** | ✔ | ✔ | ✗ | ✗ | ✗ | ✔ | ✗ | ✗ | `e2e/qa-editor-toolbars.spec.ts` R-EDITOR, QA26-07: bubble «Ещё» → «По правому краю» and «Очистить форматирование» — sto… |
| `editor/BubbleToolbar/justify` | По ширине |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-editor2-bubble.spec.ts` R-EDITOR-010 «Ещё»: «По левому краю», «По центру», «По ширине», «Размер шрифта» → 24 px… |
| `editor/BubbleToolbar/sz-default` | По умолчанию |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-editor2-bubble.spec.ts` R-EDITOR-010 «Ещё»: «По левому краю», «По центру», «По ширине», «Размер шрифта» → 24 px… (+1) |
| `editor/BubbleToolbar/f-default` | Основной |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-editor2-bubble.spec.ts` R-EDITOR-010 «Ещё»: «По левому краю», «По центру», «По ширине», «Размер шрифта» → 24 px… |
| `editor/BubbleToolbar/f-serif` | С засечками |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-editor2-bubble.spec.ts` R-EDITOR-010 «Ещё»: «По левому краю», «По центру», «По ширине», «Размер шрифта» → 24 px… |
| `editor/BubbleToolbar/f-mono` | Моноширинный |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-editor2-bubble.spec.ts` R-EDITOR-010 «Ещё»: «По левому краю», «По центру», «По ширине», «Размер шрифта» → 24 px… |
| `editor/BubbleToolbar/sub` | Нижний индекс |  | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-editor2-bubble.spec.ts` R-EDITOR-010, R-EDITOR-038 «Ещё»: «Нижний индекс», «Верхний индекс», «Сноска (Ctrl+Alt+… |
| `editor/BubbleToolbar/sup` | Верхний индекс |  | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-editor2-bubble.spec.ts` R-EDITOR-010, R-EDITOR-038 «Ещё»: «Нижний индекс», «Верхний индекс», «Сноска (Ctrl+Alt+… |
| `editor/BubbleToolbar/footnote` | Сноска (Ctrl+Alt+F) |  | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-editor2-bubble.spec.ts` R-EDITOR-010, R-EDITOR-038 «Ещё»: «Нижний индекс», «Верхний индекс», «Сноска (Ctrl+Alt+… |
| `editor/BubbleToolbar/math` | Формула из выделения |  | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-editor2-bubble.spec.ts` R-EDITOR-010, R-EDITOR-038 «Ещё»: «Нижний индекс», «Верхний индекс», «Сноска (Ctrl+Alt+… |
| `editor/BubbleToolbar/clear` | Очистить форматирование | **критичная** | ✔ | ✔ | ✗ | ✗ | ✗ | ✔ | ✗ | ✗ | `e2e/qa-editor-toolbars.spec.ts` R-EDITOR, QA26-07: bubble «Ещё» → «По правому краю» and «Очистить форматирование» — sto… |
| `editor/PasteOptionsMenu/button-data` | {…} |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `editor/PasteOptionsMenu/zakryt-parametry-vstavki` | Закрыть параметры вставки |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `editor/TableToolbar/button-data` | {…} |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `editor/TableToolbar/none` | Без заливки |  | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-editor2-table.spec.ts` R-TABLE-003 «Цвет ячейки»: a fill and «Без заливки», Esc closes the palette without cha… |
| `editor/TableToolbar/l` | По левому краю |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-editor2-table.spec.ts` R-TABLE-003 «Выравнивание»: «По левому краю», «По центру», «По правому краю», «По верху… |
| `editor/TableToolbar/c` | По центру |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-editor2-table.spec.ts` R-TABLE-003 «Выравнивание»: «По левому краю», «По центру», «По правому краю», «По верху… |
| `editor/TableToolbar/r` | По правому краю | **критичная** | ✔ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/editor-p0-table.spec.ts` table structure: insert/delete rows and columns, header row/column, merge and split, al… (+1) |
| `editor/TableToolbar/t` | По верху |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-editor2-table.spec.ts` R-TABLE-003 «Выравнивание»: «По левому краю», «По центру», «По правому краю», «По верху… |
| `editor/TableToolbar/m` | По середине |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-editor2-table.spec.ts` R-TABLE-003 «Выравнивание»: «По левому краю», «По центру», «По правому краю», «По верху… |
| `editor/TableToolbar/b` | По низу |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-editor2-table.spec.ts` R-TABLE-003 «Выравнивание»: «По левому краю», «По центру», «По правому краю», «По верху… |
| `editor/TableToolbar/mrup` | Переместить строку вверх | клавиша Alt+Shift+↑; **критичная** | ✔ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-editor-toolbars.spec.ts` R-TABLE-003, QA26-07: table «Переместить строку вверх», «Переместить столбец вправо», «… |
| `editor/TableToolbar/mrdown` | Переместить строку вниз | клавиша Alt+Shift+↓; **критичная** | ✔ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/editor-p0-table.spec.ts` table data: copy a cell range as TSV, paste a range from Excel, move rows and columns, … |
| `editor/TableToolbar/mcleft` | Переместить столбец влево | клавиша Alt+Shift+←; **критичная** | ✔ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/editor-p0-table.spec.ts` table data: copy a cell range as TSV, paste a range from Excel, move rows and columns, … |
| `editor/TableToolbar/mcright` | Переместить столбец вправо | клавиша Alt+Shift+→; **критичная** | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-editor-toolbars.spec.ts` R-TABLE-003, QA26-07: table «Переместить строку вверх», «Переместить столбец вправо», «… |
| `editor/TableToolbar/sasc` | Сортировать по возрастанию |  | ✔ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/editor-p0-table.spec.ts` table data: copy a cell range as TSV, paste a range from Excel, move rows and columns, … |
| `editor/TableToolbar/sdesc` | Сортировать по убыванию |  | ✔ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/editor-p0-table.spec.ts` table data: copy a cell range as TSV, paste a range from Excel, move rows and columns, … |
| `editor/TableToolbar/hrow` | Строка заголовков |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-editor2-table.spec.ts` R-TABLE-003 «Строка заголовков» toggles the header row; row/column buttons «Строка выше… |
| `editor/TableToolbar/hcol` | Столбец заголовков |  | ✔ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/editor-p0-table.spec.ts` table structure: insert/delete rows and columns, header row/column, merge and split, al… |
| `editor/TableToolbar/drow` | Удалить строку | **критичная** | ✔ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/editor-p0-table.spec.ts` table structure: insert/delete rows and columns, header row/column, merge and split, al… |
| `editor/TableToolbar/dcol` | Удалить столбец | **критичная** | ✔ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/editor-p0-table.spec.ts` table structure: insert/delete rows and columns, header row/column, merge and split, al… |
| `editor/TableToolbar/tsv` | Копировать для Excel |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/clipboard.spec.ts` table copy for Excel puts TSV and an HTML table on the clipboard (R-CLIPBOARD-006, R-CL… |
| `editor/TableToolbar/md` | Копировать как Markdown |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-editor2-table.spec.ts` R-CLIPBOARD-006 «Копировать как Markdown» of a table: the clipboard gets a Markdown tab… |
| `editor/TableToolbar/del` | Удалить таблицу | **критичная** | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-editor-toolbars.spec.ts` R-TABLE-003, QA26-07: table «Переместить строку вверх», «Переместить столбец вправо», «… |
| `editor/LoadedImageView/po-levomu-krayu` | По левому краю |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `editor/LoadedImageView/po-centru` | По центру |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `editor/LoadedImageView/po-pravomu-krayu` | По правому краю | **критичная** | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-editor-toolbars.spec.ts` R-MEDIA, QA26-07: image toolbar «По правому краю» and «Удалить» — stored, Undo returns … |
| `editor/LoadedImageView/na-vsyu-shirinu` | На всю ширину |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `editor/LoadedImageView/x` | {…}% |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `editor/LoadedImageView/podpis` | Подпись |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `editor/LoadedImageView/alternativnyy-tekst` | Альтернативный текст |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/editor-footnotes-media.spec.ts` R-MEDIA-007: a picture in a line of text — pasted inline, uploaded as an attachment, re… |
| `editor/LoadedImageView/raspoznannyy-tekst-ocr` | Распознанный текст (OCR) |  | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/ocr-view.spec.ts` SC-22: the OCR view shows the original image, confidence with uncertain words, correcti… |
| `editor/LoadedImageView/zamenit` | Заменить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `editor/LoadedImageView/otkryt-na-ves-ekran` | Открыть на весь экран |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `editor/LoadedImageView/v-stroku-teksta` | В строку текста |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/editor-footnotes-media.spec.ts` R-MEDIA-007: a picture in a line of text — pasted inline, uploaded as an attachment, re… |
| `editor/LoadedImageView/udalit` | Удалить | **критичная** | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/editor-footnotes-media.spec.ts` R-MEDIA-007: a picture in a line of text — pasted inline, uploaded as an attachment, re… (+1) |
| `editor/LoadedImageView/povtorit` | Повторить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `editor/InlineImageView/button-data` | {…} |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `editor/InlineImageView/1-1` | 1:1 |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `editor/InlineImageView/po-bazovoy-linii` | По базовой линии |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `editor/InlineImageView/po-centru-stroki` | По центру строки |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/editor-footnotes-media.spec.ts` R-MEDIA-007: a picture in a line of text — pasted inline, uploaded as an attachment, re… |
| `editor/InlineImageView/po-verhu-stroki` | По верху строки |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `editor/InlineImageView/alternativnyy-tekst` | Альтернативный текст |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/editor-footnotes-media.spec.ts` R-MEDIA-007: a picture in a line of text — pasted inline, uploaded as an attachment, re… |
| `editor/InlineImageView/podpis` | Подпись |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `editor/InlineImageView/otkryt-na-ves-ekran` | Открыть на весь экран |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `editor/InlineImageView/sdelat-blokom` | Сделать блоком |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/editor-footnotes-media.spec.ts` R-MEDIA-007: a picture in a line of text — pasted inline, uploaded as an attachment, re… |
| `editor/InlineImageView/udalit` | Удалить | **критичная** | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/editor-footnotes-media.spec.ts` R-MEDIA-007: a picture in a line of text — pasted inline, uploaded as an attachment, re… |
| `editor/UploadPlaceholder/povtorit` | Повторить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `editor/UploadPlaceholder/otmenit` | Отменить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `editor/CalloutView/icon` | Свой значок… |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `editor/LoadedFileView/predprosmotr` | Предпросмотр |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `editor/LoadedFileView/compact` | Компактно |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `editor/LoadedFileView/card` | Карточкой |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `editor/MermaidView/skryt-kod` | Скрыть код |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `editor/SyncedBlockView/ubrat-blok` | Убрать блок |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `editor/CodeBlockView/skopirovano` | Скопировано |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |

### help

| ID | Операция | Особенности из кода | Пусто | Успех | Загрузка / медленная сеть | Отмена | Ошибка сервера | Нет прав | Потеря сети | Повторный клик | Тест |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `help/HelpCenter/spravka` | Справка |  | ✔ | ✔ | · | ✔ | ✗ | ✗ | ✗ | · | `e2e/a11y.spec.ts` keyboard only: quick switcher, help, dialogs close with Esc and return focus (UX-136, S… (+2) |
| `help/HelpCenter/button-data` | {…} |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `help/HelpCenter/pokazyvat-podskazki-dlya-novichkov` | Показывать подсказки для новичков |  | · | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | · | **нет** |
| `help/OnboardingHints/zakryt-podskazku` | Закрыть подсказку |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `help/OnboardingHints/ponyatno` | Понятно |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `help/OnboardingHints/ne-pokazyvat-podskazki` | Не показывать подсказки |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |

### home

| ID | Операция | Особенности из кода | Пусто | Успех | Загрузка / медленная сеть | Отмена | Ошибка сервера | Нет прав | Потеря сети | Повторный клик | Тест |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `home/ErrorState/povtorit` | Повторить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `home/Home/novaya-stranica-v-lichnom-prostranstve` | Новая страница В личном пространстве | **критичная** | ✗ | ✔ | ✔ | ✗ | ✔ | ✗ | ✗ | ✔ | `e2e/qa-admin-spaces.spec.ts` R-HOME-002 «Новая страница В личном пространстве»: server error is reported; slow netwo… |
| `home/Home/sozdat-pervuyu-stranicu` | Создать первую страницу | **критичная** | ✔ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-admin-spaces.spec.ts` R-HOME-004 empty home of a new employee: «Создать первую страницу» creates a page; «Имп… |

### import

| ID | Операция | Особенности из кода | Пусто | Успех | Загрузка / медленная сеть | Отмена | Ошибка сервера | Нет прав | Потеря сети | Повторный клик | Тест |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `import/LocationPicker/povtorit` | Повторить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `import/ImportPage/peretaschite-fayly-syuda-ili-nazhmite-chtoby-vyb` | Перетащите файлы сюда или нажмите, чтобы выбрать DOCX · MD · ZIP с Markdown · HTML · CSV · XLSX |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `import/ImportPage/ubrat` | Убрать {…} |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `import/ImportPage/parametry-chteniya-csv` | Параметры чтения CSV |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `import/ImportPage/povtorit-zagruzku` | Повторить загрузку |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `import/ImportPage/otmenit` | Отменить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `import/ImportPage/otmenit~2` | Отменить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `import/ImportPage/povtorit` | Повторить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `import/ImportPage/povtorit~2` | Повторить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `import/ImportPage/izmenit-vybor` | Изменить выбор |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `import/ImportPage/oshibka` | {…} ошибка |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `import/ImportPage/izmenit-vybor~2` | Изменить выбор |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `import/ImportPage/bez-nazvaniya-bl-tabl-izobr` | Без названия {…} бл. · {…} табл. · {…} изобр. |  | · | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | · | **нет** |
| `import/ImportPage/pervaya-stroka-zagolovki-stolbcov` | Первая строка — заголовки столбцов |  | · | ✔ | ✗ | ✔ | ✔ | ✗ | ✔ | ✔ | `e2e/collab.spec.ts` history: save a version, change text, restore the version (R-HISTORY-004, UX13-14, UX21… (+1) |
| `import/ImportPage/perechitat` | Перечитать |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `import/ImportPage/probnyy-progon` | Пробный прогон |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/import-collection.spec.ts` R-COLLECTION-003: import into an existing collection in «replace» mode — dry run lists … |
| `import/ImportPage/ponyatno-stroka-budet-peremeschena-v-korzinu` | Понятно: {…} строка будет перемещена в корзину |  | · | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | · | `e2e/route-author.spec.ts` ROUTE-02: draft → offline → sync → move to a department with visibility preview → appro… |
| `import/ImportPage/podrobnee` | Подробнее |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `import/ImportPage/otmenit-import` | Отменить импорт | **критичная** | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-admin-spaces.spec.ts` R-IMPORT-010 «Отменить импорт» before confirming creates nothing and returns to the fil… |
| `import/ImportPage/povtorit-import` | Повторить импорт | **критичная** | ✗ | ✔ | ✔ | ✗ | ✔ | ✗ | ✗ | ✔ | `e2e/qa-admin-spaces.spec.ts` R-IMPORT-011 commit error: the reason is shown, the button becomes «Повторить импорт» a… |
| `import/ImportPage/importirovat-esche` | Импортировать ещё | **критичная** | ✗ | ✔ | ✔ | ✗ | ✔ | ✗ | ✗ | ✔ | `e2e/qa-admin-spaces.spec.ts` R-IMPORT-011 commit error: the reason is shown, the button becomes «Повторить импорт» a… |

### page

| ID | Операция | Особенности из кода | Пусто | Успех | Загрузка / медленная сеть | Отмена | Ошибка сервера | Нет прав | Потеря сети | Повторный клик | Тест |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `page/CommentsPanel/zakryt-kommentarii` | Закрыть комментарии |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `page/CommentsPanel/povtorit` | Повторить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `page/ThreadCard/otkryt-obsuzhdenie-zanovo` | Открыть обсуждение заново |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `page/ThreadCard/edit` | Изменить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `page/ThreadCard/del` | Удалить | **критичная** | ✗ | ✔ | ✗ | ✔ | ✔ | ✔ | ✔ | ✗ | `e2e/qa-editor-history.spec.ts` R-COMMENTS-005, QA26-03: «Удалить» a comment — cancel keeps it; a server error and offl… |
| `page/ThreadCard/confirm.udalit-kommentariy` | Удалить комментарий? | с подтверждением; **критичная** | ✗ | ✔ | · | ✔ | ✔ | ✗ | ✔ | · | `e2e/qa-editor-history.spec.ts` R-COMMENTS-005, QA26-03: «Удалить» a comment — cancel keeps it; a server error and offl… |
| `page/ThreadCard/confirm.udalit-kommentariy.udalit` | Удалить | с подтверждением; **критичная** | ✗ | ✔ | ✗ | ✔ | ✔ | ✗ | ✔ | ✗ | `e2e/qa-editor-history.spec.ts` R-COMMENTS-005, QA26-03: «Удалить» a comment — cancel keeps it; a server error and offl… |
| `page/ThreadCard/otvetit` | Ответить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `page/Composer/upomyanut-sotrudnika` | Упомянуть сотрудника |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `page/Composer/otmena` | Отмена |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-editor-history.spec.ts` R-COMMENTS-005, QA26-03: «Удалить» a comment — cancel keeps it; a server error and offl… |
| `page/Composer/button-data` | {…} |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `page/ExportDialog/md` | Markdown |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/editor-p0-dnd.spec.ts` autoscroll near the bottom edge while dragging, drop far below (QA26-09) |
| `page/ExportDialog/mdzip` | Markdown + файлы |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/editor-p0-dnd.spec.ts` autoscroll near the bottom edge while dragging, drop far below (QA26-09) |
| `page/ExportDialog/docx` | Word (DOCX) |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/editor-p0-dnd.spec.ts` autoscroll near the bottom edge while dragging, drop far below (QA26-09) |
| `page/ExportDialog/pdf` | PDF |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/editor-p0-dnd.spec.ts` autoscroll near the bottom edge while dragging, drop far below (QA26-09) (+1) |
| `page/ExportDialog/html` | HTML |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/editor-p0-blocks.spec.ts` text blocks: paragraph, H1–H6, lead, quote and divider are created from the "/" menu; b… (+1) |
| `page/ExportDialog/eksport` | Экспорт | **критичная** | ✗ | ✔ | · | ✗ | ✗ | ✗ | ✗ | · | `e2e/editor-p0-dnd.spec.ts` autoscroll near the bottom edge while dragging, drop far below (QA26-09) (+3) |
| `page/ExportDialog/zakryt` | Закрыть |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/editor-p0-dnd.spec.ts` autoscroll near the bottom edge while dragging, drop far below (QA26-09) (+2) |
| `page/ExportDialog/skachat-snova` | Скачать снова |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/editor-p0-dnd.spec.ts` autoscroll near the bottom edge while dragging, drop far below (QA26-09) |
| `page/ExportDialog/eksportirovat` | Экспортировать | **критичная** | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/editor-p0-dnd.spec.ts` autoscroll near the bottom edge while dragging, drop far below (QA26-09) (+3) |
| `page/ExportDialog/tolko-etu-stranicu` | Только эту страницу |  | · | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | · | `e2e/editor-p0-dnd.spec.ts` autoscroll near the bottom edge while dragging, drop far below (QA26-09) |
| `page/ExportDialog/stranicu-so-vsemi-podstranicami` | Страницу со всеми подстраницами |  | · | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | · | `e2e/editor-p0-dnd.spec.ts` autoscroll near the bottom edge while dragging, drop far below (QA26-09) (+1) |
| `page/ExportDialog/odnim-dokumentom-s-oglavleniem` | Одним документом с оглавлением |  | · | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | · | `e2e/editor-p0-dnd.spec.ts` autoscroll near the bottom edge while dragging, drop far below (QA26-09) |
| `page/ExportDialog/otdelnymi-faylami-zip-s-otchetom-i-kontrolnymi-s` | Отдельными файлами (ZIP с отчётом и контрольными суммами) | **критичная** | · | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | · | `e2e/editor-p0-dnd.spec.ts` autoscroll near the bottom edge while dragging, drop far below (QA26-09) (+1) |
| `page/ExportDialog/otmenit-eksport` | Отменить экспорт | **критичная** | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/editor-p0-dnd.spec.ts` autoscroll near the bottom edge while dragging, drop far below (QA26-09) (+1) |
| `page/ExportDialog/poprobovat-v-fone` | Попробовать в фоне |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/editor-p0-dnd.spec.ts` autoscroll near the bottom edge while dragging, drop far below (QA26-09) |
| `page/HistoryPanel/k-spisku-versiy` | К списку версий | **критичная** | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-editor-history.spec.ts` R-HISTORY, R-UI-068 (phone): «К списку версий» returns from a version to the list on a … |
| `page/HistoryPanel/sohranit-versiyu` | Сохранить версию | **критичная** | ✔ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/collab.spec.ts` history: save a version, change text, restore the version (R-HISTORY-004, UX13-14, UX21… (+6) |
| `page/HistoryPanel/zakryt-istoriyu` | Закрыть историю | **критичная** | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-editor-history.spec.ts` R-HISTORY-013: «Сравнить с текущей» → «Вернуть удалённый блок из версии N?» — cancel ke… |
| `page/HistoryPanel/povtorit` | Повторить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `page/HistoryPanel/pokazat-esche` | Показать ещё |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `page/RevisionItem/versiya-opublikovana` | Версия {…} {…} Опубликована №{…} · {…} · {…} | **критичная** | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/route-author.spec.ts` ROUTE-02: draft → offline → sync → move to a department with visibility preview → appro… |
| `page/RevisionDetail/zakryt-prosmotr-versii` | Закрыть просмотр версии | **критичная** | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-editor-history.spec.ts` R-HISTORY-013: «Сравнить с текущей» → «Вернуть удалённый блок из версии N?» — cancel ke… (+1) |
| `page/RevisionDetail/vosstanovit-etu-versiyu` | Восстановить эту версию | **критичная** | ✗ | ✔ | ✗ | ✔ | ✔ | ✗ | ✔ | ✔ | `e2e/collab.spec.ts` history: save a version, change text, restore the version (R-HISTORY-004, UX13-14, UX21… (+4) |
| `page/DiffView/confirm.vernut-udalennyy-blok-iz-versii` | Вернуть удалённый блок из версии {…}? | с подтверждением; **критичная** | ✗ | ✔ | · | ✔ | ✗ | ✗ | ✗ | · | `e2e/qa-editor-history.spec.ts` R-HISTORY-013: «Сравнить с текущей» → «Вернуть удалённый блок из версии N?» — cancel ke… |
| `page/DiffView/confirm.vernut-udalennyy-blok-iz-versii.vernut-blok` | Вернуть блок | с подтверждением | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/history-p0.spec.ts` R-HISTORY-013: one block is restored from a version after a preview, as a new version (+1) |
| `page/DiffView/bez-izmeneniy-pokazat` | … без изменений: {…} {…} — показать |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `page/DiffView/vosstanovit-blok` | Восстановить блок | **критичная** | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/collab.spec.ts` history: save a version, change text, restore the version (R-HISTORY-004, UX13-14, UX21… (+2) |
| `page/RestoreDialog/vosstanovit-versiyu` | Восстановить версию {…}? | **критичная** | ✗ | ✔ | · | ✔ | ✔ | ✗ | ✔ | ✔ | `e2e/qa-editor-history.spec.ts` R-HISTORY-002, QA26-03: «Восстановить версию N?» — cancel changes nothing; a server err… |
| `page/RestoreDialog/otmena` | Отмена |  | ✗ | ✔ | ✗ | ✔ | ✔ | ✗ | ✔ | ✔ | `e2e/qa-editor-history.spec.ts` R-HISTORY-002, QA26-03: «Восстановить версию N?» — cancel changes nothing; a server err… (+2) |
| `page/RestoreDialog/vosstanovit` | Восстановить | **критичная** | ✗ | ✔ | ✗ | ✔ | ✔ | ✗ | ✔ | ✔ | `e2e/collab.spec.ts` history: save a version, change text, restore the version (R-HISTORY-004, UX13-14, UX21… (+5) |
| `page/RestoreDialog/povtorit` | Повторить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `page/RestoreDialog/vernut-i-svoystva-stranicy-znachok-oblozhka-vlad` | Вернуть и свойства страницы (значок, обложка, владелец, теги, поля) |  | · | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | · | `e2e/history-p0.spec.ts` R-HISTORY-013, V16-S11: compare shows text and property changes highlighted; restore sh… |
| `page/SaveVersionDialog/sohranit-versiyu` | Сохранить версию | **критичная** | ✔ | ✔ | · | ✔ | ✗ | ✗ | ✗ | · | `e2e/ocr-view.spec.ts` R-UI-062: a dialog with typed critical input warns before closing; closing without savi… |
| `page/SaveVersionDialog/otmena` | Отмена |  | ✗ | ✔ | ✗ | ✔ | ✔ | ✗ | ✔ | ✔ | `e2e/qa-editor-history.spec.ts` R-HISTORY-002, QA26-03: «Восстановить версию N?» — cancel changes nothing; a server err… (+2) |
| `page/SaveVersionDialog/sohranit` | Сохранить | **критичная** | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/collab.spec.ts` history: save a version, change text, restore the version (R-HISTORY-004, UX13-14, UX21… (+5) |
| `page/HistoryPanel/confirm.vosstanovit-sostoyanie-na-etot-moment` | Восстановить состояние на этот момент? | с подтверждением; **критичная** | ✗ | ✔ | · | ✔ | ✔ | ✗ | ✗ | · | `e2e/qa-editor-history.spec.ts` R-HISTORY-026: «Восстановить состояние на этот момент?» from the change journal — cance… |
| `page/HistoryPanel/confirm.vosstanovit-sostoyanie-na-etot-moment.vosstanovit` | Восстановить | с подтверждением; **критичная** | ✗ | ✔ | ✗ | ✔ | ✔ | ✗ | ✔ | ✔ | `e2e/collab.spec.ts` history: save a version, change text, restore the version (R-HISTORY-004, UX13-14, UX21… (+5) |
| `page/EventsList/otmenit-eto-izmenenie` | Отменить это изменение |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `page/EventsList/vosstanovit-sostoyanie-na-etot-moment` | Восстановить состояние на этот момент | **критичная** | ✗ | ✔ | ✗ | ✔ | ✔ | ✗ | ✗ | ✗ | `e2e/collab.spec.ts` history: save a version, change text, restore the version (R-HISTORY-004, UX13-14, UX21… (+1) |
| `page/EventsList/pokazat-esche` | Показать ещё |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `page/PageInfoPanel/zakryt-svedeniya` | Закрыть сведения |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `page/TagsEditor/otmenit` | Отменить |  | · | ✔ | · | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/history-p0.spec.ts` R-HISTORY-002: a property change (icon, tag) offers «Отменить» right away; tags are edi… |
| `page/TagsEditor/ubrat-teg` | Убрать тег «{…}» |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `page/TagsEditor/teg` | Тег |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `page/PropertiesEditor/otmenit` | Отменить |  | · | ✔ | · | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/history-p0.spec.ts` R-HISTORY-002: a property change (icon, tag) offers «Отменить» right away; tags are edi… |
| `page/PropertiesEditor/udalit-svoystvo` | Удалить свойство «{…}» | **критичная** | ✔ | ✔ | ✗ | ✗ | ✔ | ✗ | ✗ | ✗ | `e2e/qa-admin-page-panels.spec.ts` R-PAGE-022 properties: add a property (server error keeps the typed key and value), «Уд… |
| `page/PropertiesEditor/dobavit-svoystvo` | Добавить свойство |  | ✔ | ✔ | ✗ | ✗ | ✔ | ✗ | ✗ | ✗ | `e2e/qa-admin-page-panels.spec.ts` R-PAGE-022 properties: add a property (server error keeps the typed key and value), «Уд… |
| `page/LegalHold/snyat-uderzhanie` | Снять удержание | **критичная** | ✔ | ✔ | ✗ | ✔ | ✔ | ✔ | ✗ | ✗ | `e2e/qa-admin-page-panels.spec.ts` R-HISTORY-015 legal hold: «Установить юридическое удержание» needs a reason, cancel cha… |
| `page/LegalHold/ustanovit-yuridicheskoe-uderzhanie` | Установить юридическое удержание | **критичная** | ✔ | ✔ | · | ✔ | ✔ | ✔ | ✔ | · | `e2e/qa-admin-offline.spec.ts` R-QA-029 offline: «Установить юридическое удержание» and «Снять с публикации» explain t… (+1) |
| `page/LegalHold/otmena` | Отмена |  | ✔ | ✔ | ✗ | ✔ | ✔ | ✗ | ✗ | ✗ | `e2e/qa-admin-page-panels.spec.ts` R-HISTORY-015 legal hold: «Установить юридическое удержание» needs a reason, cancel cha… |
| `page/LegalHold/ustanovit` | Установить |  | ✔ | ✔ | ✗ | ✔ | ✔ | ✗ | ✔ | ✗ | `e2e/qa-admin-offline.spec.ts` R-QA-029 offline: «Установить юридическое удержание» and «Снять с публикации» explain t… (+1) |
| `page/PublicLinksSection/confirm.otozvat-publichnuyu-ssylku` | Отозвать публичную ссылку? | с подтверждением; **критичная** | ✗ | ✔ | · | ✗ | ✗ | ✗ | ✗ | · | `e2e/acl-p0-spaces.spec.ts` E2E-109 R-PUBLISH-009: public links are off by policy; once enabled a link opens withou… (+1) |
| `page/PublicLinksSection/confirm.otozvat-publichnuyu-ssylku.otozvat` | Отозвать | с подтверждением; **критичная** | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/acl-p0-spaces.spec.ts` E2E-109 R-PUBLISH-009: public links are off by policy; once enabled a link opens withou… (+1) |
| `page/PublicLinksSection/otozvat-publichnuyu-ssylku` | Отозвать публичную ссылку | **критичная** | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/acl-p0-spaces.spec.ts` E2E-109 R-PUBLISH-009: public links are off by policy; once enabled a link opens withou… (+1) |
| `page/PublicLinksSection/skopirovat` | Скопировать |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `page/PublicLinksSection/sozdat-publichnuyu-ssylku` | Создать публичную ссылку | **критичная** | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/acl-p0-spaces.spec.ts` E2E-109 R-PUBLISH-009: public links are off by policy; once enabled a link opens withou… (+1) |
| `page/PublicLinksSection/razreshit-skachivanie-vlozheniy` | Разрешить скачивание вложений |  | · | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | · | **нет** |
| `page/PublicLinksSection/vklyuchaya-podstranicy` | Включая подстраницы |  | · | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | · | **нет** |
| `page/PublicLinksSection/ponimayu-chto-skachannoe-po-ssylke-nelzya-otozva` | Понимаю, что скачанное по ссылке нельзя отозвать |  | · | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | · | `e2e/acl-p0-spaces.spec.ts` E2E-109 R-PUBLISH-009: public links are off by policy; once enabled a link opens withou… (+1) |
| `page/PublicLinksSection/sozdat-ssylku` | Создать ссылку | **критичная** | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/acl-p0-spaces.spec.ts` E2E-109 R-PUBLISH-009: public links are off by policy; once enabled a link opens withou… (+1) |
| `page/PublicLinksSection/otmena` | Отмена |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `page/PublishBar/confirm.opublikovat-izmeneniya` | Опубликовать изменения? | с подтверждением; **критичная** | ✗ | ✔ | · | ✗ | ✗ | ✗ | ✗ | · | `e2e/acl-p0-routes.spec.ts` ROUTE-03: space manager route — members and group access → template → tree drag-and-dro… |
| `page/PublishBar/confirm.opublikovat-izmeneniya.opublikovat` | Опубликовать | с подтверждением; **критичная** | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/acl-p0-routes.spec.ts` ROUTE-03: space manager route — members and group access → template → tree drag-and-dro… |
| `page/PublishBar/confirm.snyat-s-publikacii` | Снять с публикации? | с подтверждением; **критичная** | ✗ | ✔ | · | ✔ | ✔ | ✗ | ✔ | · | `e2e/qa-admin-offline.spec.ts` R-QA-029 offline: «Установить юридическое удержание» and «Снять с публикации» explain t… (+1) |
| `page/PublishBar/confirm.snyat-s-publikacii.snyat-s-publikacii` | Снять с публикации | с подтверждением; **критичная** | ✗ | ✔ | ✗ | ✔ | ✔ | ✗ | ✔ | ✗ | `e2e/qa-admin-offline.spec.ts` R-QA-029 offline: «Установить юридическое удержание» and «Снять с публикации» explain t… (+1) |
| `page/PublishBar/confirm.perenesti-v-arhiv` | Перенести в архив? | с подтверждением; **критичная** | ✗ | ✔ | · | ✔ | ✔ | ✗ | ✗ | · | `e2e/qa-admin-page-panels.spec.ts` R-PUBLISH-002 «Снять с публикации?» and «Перенести в архив?»: cancel keeps the status, … |
| `page/PublishBar/confirm.perenesti-v-arhiv.v-arhiv` | В архив | с подтверждением; **критичная** | ✗ | ✔ | ✗ | ✔ | ✔ | ✗ | ✗ | ✗ | `e2e/qa-admin-page-panels.spec.ts` R-PUBLISH-002 «Снять с публикации?» and «Перенести в архив?»: cancel keeps the status, … |
| `page/PublishBar/sravnit` | Сравнить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `page/PublishBar/button-data` | {…} |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `page/SubmitReviewDialog/otpravit-na-soglasovanie` | Отправить на согласование | **критичная** | ✗ | ✔ | · | ✗ | ✗ | ✗ | ✗ | · | `e2e/route-author.spec.ts` ROUTE-02: draft → offline → sync → move to a department with visibility preview → appro… |
| `page/SubmitReviewDialog/otmena` | Отмена |  | ✗ | ✔ | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | `e2e/qa-admin-page-panels.spec.ts` R-PUBLISH-002 «Снять с публикации?» and «Перенести в архив?»: cancel keeps the status, … (+1) |
| `page/SubmitReviewDialog/otpravit` | Отправить | **критичная** | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/route-author.spec.ts` ROUTE-02: draft → offline → sync → move to a department with visibility preview → appro… |
| `page/SubmitReviewDialog/ubrat-soglasuyuschego` | Убрать согласующего |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `page/DecideDialog/soglasovat-i-opublikovat` | Согласовать и опубликовать | **критичная** | ✗ | ✔ | · | ✔ | ✗ | ✔ | ✗ | · | `e2e/qa-admin-page-panels.spec.ts` R-PUBLISH-005 approval: the reviewer opens «Открыть историю версий» from the decision d… (+1) |
| `page/DecideDialog/otmena` | Отмена |  | ✗ | ✔ | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | `e2e/qa-admin-page-panels.spec.ts` R-PUBLISH-002 «Снять с публикации?» and «Перенести в архив?»: cancel keeps the status, … (+1) |
| `page/DecideDialog/soglasovat` | Согласовать |  | ✗ | ✔ | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | `e2e/qa-admin-page-panels.spec.ts` R-PUBLISH-005 approval: the reviewer opens «Открыть историю версий» from the decision d… (+1) |
| `page/DecideDialog/otkryt-istoriyu-versiy` | Открыть историю версий | **критичная** | ✗ | ✔ | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | `e2e/qa-admin-page-panels.spec.ts` R-PUBLISH-005 approval: the reviewer opens «Открыть историю версий» from the decision d… |
| `page/ShareDialog/confirm.otkryt-dostup-vsey-organizacii` | Открыть доступ всей организации? | с подтверждением; **критичная** | ✗ | ✔ | · | ✔ | ✗ | ✗ | ✗ | · | `e2e/qa-admin-page-panels.spec.ts` R-ACL-022 «Общий доступ»: «Открыть доступ всей организации?» cancel keeps the page priv… |
| `page/ShareDialog/confirm.otkryt-dostup-vsey-organizacii.otkryt-vsem` | Открыть всем | с подтверждением | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-admin-page-panels.spec.ts` R-ACL-022 «Общий доступ»: «Открыть доступ всей организации?» cancel keeps the page priv… |
| `page/ShareDialog/confirm.ponizit-sobstvennyy-dostup` | Понизить собственный доступ? | с подтверждением; **критичная** | ✗ | ✔ | · | ✔ | ✗ | ✗ | ✗ | · | `e2e/qa-admin-page-panels.spec.ts` R-ACL-030 «Наследовать права» off/on with confirmations; own row: «Понизить собственный… |
| `page/ShareDialog/confirm.ponizit-sobstvennyy-dostup.ponizit` | Понизить | с подтверждением | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `page/ShareDialog/confirm.ubrat-svoy-dostup` | Убрать свой доступ? | с подтверждением; **критичная** | ✗ | ✔ | · | ✔ | ✗ | ✗ | ✔ | · | `e2e/qa-admin-offline.spec.ts` R-QA-029 offline: «Выдать доступ» and «Убрать доступ: …» in the share dialog keep the p… (+1) |
| `page/ShareDialog/confirm.ubrat-svoy-dostup.ubrat` | Убрать | с подтверждением | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✔ | ✗ | `e2e/qa-admin-offline.spec.ts` R-QA-029 offline: «Выдать доступ» and «Убрать доступ: …» in the share dialog keep the p… (+1) |
| `page/ShareDialog/confirm.snova-nasledovat-prava` | Снова наследовать права? | с подтверждением; **критичная** | ✗ | ✔ | · | ✗ | ✗ | ✗ | ✗ | · | `e2e/qa-admin-page-panels.spec.ts` R-ACL-030 «Наследовать права» off/on with confirmations; own row: «Понизить собственный… |
| `page/ShareDialog/confirm.snova-nasledovat-prava.nasledovat` | Наследовать | с подтверждением | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-admin-page-panels.spec.ts` R-ACL-030 «Наследовать права» off/on with confirmations; own row: «Понизить собственный… |
| `page/ShareDialog/confirm.zakryt-dostup-dlya-organizacii` | Закрыть доступ для организации? | с подтверждением; **критичная** | ✗ | ✔ | · | ✔ | ✗ | ✗ | ✗ | · | `e2e/qa-admin-page-panels.spec.ts` R-ACL-022 «Общий доступ»: «Открыть доступ всей организации?» cancel keeps the page priv… |
| `page/ShareDialog/confirm.zakryt-dostup-dlya-organizacii.zakryt` | Закрыть | с подтверждением | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-admin-page-panels.spec.ts` R-ACL-022 «Общий доступ»: «Открыть доступ всей организации?» cancel keeps the page priv… |
| `page/ShareDialog/dostup` | Доступ: {…} | **критичная** | ✗ | ✔ | ✔ | ✔ | ✗ | ✔ | ✔ | ✔ | `e2e/acl-p0-ui.spec.ts` QA26-24 R-ACL-075 R-ACL-076: in the browser the UI shows exactly the server rights; no … (+8) |
| `page/ShareDialog/skopirovat-ssylku` | Скопировать ссылку |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `page/ShareDialog/gotovo` | Готово |  | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … (+3) |
| `page/ShareDialog/povtorit` | Повторить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `page/ShareDialog/ubrat` | Убрать |  | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✔ | ✗ | `e2e/qa-admin-offline.spec.ts` R-QA-029 offline: «Выдать доступ» and «Убрать доступ: …» in the share dialog keep the p… (+1) |
| `page/ShareDialog/vydat-dostup` | Выдать доступ | **критичная** | ✔ | ✔ | ✔ | ✗ | ✔ | ✔ | ✔ | ✔ | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … (+7) |
| `page/ShareDialog/skryt-parametry` | Скрыть параметры |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `page/ShareDialog/zapretit-skachivanie-vlozheniy` | Запретить скачивание вложений |  | · | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | · | `e2e/acl-p0-spaces.spec.ts` R-ACL-021 R-ACL-036: share dialog — department preset, quick expiry, start date, reason… |
| `page/ShareDialog/zapretit-eksport` | Запретить экспорт |  | · | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | · | **нет** |
| `page/ShareDialog/mozhet-delitsya-stranicey-dlya-redaktirovaniya` | Может делиться страницей (для редактирования) |  | · | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | · | **нет** |
| `page/ShareDialog/ubrat-dostup` | Убрать доступ: {…} | **критичная** | ✗ | ✔ | ✗ | ✔ | ✗ | ✔ | ✔ | ✗ | `e2e/qa-admin-offline.spec.ts` R-QA-029 offline: «Выдать доступ» and «Убрать доступ: …» in the share dialog keep the p… (+2) |
| `page/ShareDialog/nasledovat-prava` | Наследовать права | **критичная** | · | ✔ | ✗ | ✔ | ✗ | ✔ | ✗ | · | `e2e/qa-admin-page-panels.spec.ts` R-ACL-030 «Наследовать права» off/on with confirmations; own row: «Понизить собственный… (+1) |
| `page/ShareDialog/pochemu-u-polzovatelya-est-dostup` | Почему у пользователя есть доступ? | **критичная** | ✗ | ✔ | ✗ | ✗ | ✔ | ✗ | ✗ | ✗ | `e2e/qa-admin-page-panels.spec.ts` R-ACL-033 «Почему у пользователя есть доступ?» explains a colleague's level and its sou… |
| `page/ShareDialog/zaprosit-bolshe-prav` | Запросить больше прав |  | ✗ | ✔ | ✔ | ✗ | ✗ | ✔ | ✗ | ✔ | `e2e/qa-admin-page-panels.spec.ts` R-ACL-040 no permission: a viewer asks for more rights — «Зачем нужен доступ (необязате… |
| `page/AccessRequest/otpravit-zapros` | Отправить запрос | **критичная** | ✗ | ✔ | ✔ | ✗ | ✗ | ✔ | ✗ | ✔ | `e2e/qa-admin-page-panels.spec.ts` R-ACL-040 no permission: a viewer asks for more rights — «Зачем нужен доступ (необязате… |
| `page/SharePresets/confirm.ostavit-dostup-tolko-vam` | Оставить доступ только вам? | с подтверждением; **критичная** | ✗ | ✔ | · | ✗ | ✗ | ✗ | ✗ | · | `e2e/acl-p0-spaces.spec.ts` R-ACL-021 R-ACL-036: share dialog — department preset, quick expiry, start date, reason… |
| `page/SharePresets/confirm.ostavit-dostup-tolko-vam.tolko-ya` | Только я | с подтверждением | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/acl-p0-spaces.spec.ts` R-ACL-021 R-ACL-036: share dialog — department preset, quick expiry, start date, reason… (+2) |
| `page/SharePresets/tolko-ya` | Только я |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/acl-p0-spaces.spec.ts` R-ACL-021 R-ACL-036: share dialog — department preset, quick expiry, start date, reason… (+2) |
| `page/SharePresets/otdel` | Отдел: {…} |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/acl-p0-spaces.spec.ts` R-ACL-021 R-ACL-036: share dialog — department preset, quick expiry, start date, reason… |
| `page/SharePresets/vsya-kompaniya` | Вся компания |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `page/PageError/povtorit` | Повторить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `page/PageError/zapros-otpravlen` | Запрос отправлен | **критичная** | ✗ | ✔ | ✔ | ✗ | ✔ | ✔ | ✗ | ✔ | `e2e/qa-admin-page-panels.spec.ts` QA-A6 (fixed): «Запросить доступ» on a page without access sends one request on a doubl… (+1) |
| `page/PageLoaded/otmenit` | Отменить |  | · | ✔ | · | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/history-p0.spec.ts` R-HISTORY-002: a property change (icon, tag) offers «Отменить» right away; tags are edi… |
| `page/PageLoaded/fav` | Убрать из избранного |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `page/PageLoaded/link` | Копировать ссылку |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `page/PageLoaded/history` | История версий | **критичная** | ✔ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/collab.spec.ts` history: save a version, change text, restore the version (R-HISTORY-004, UX13-14, UX21… (+9) |
| `page/PageLoaded/info` | Сведения о странице |  | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✔ | ✗ | `e2e/history-p0.spec.ts` R-HISTORY-002: a property change (icon, tag) offers «Отменить» right away; tags are edi… (+3) |
| `page/PageLoaded/export` | Экспорт… | без прав: «Экспорт запрещён политикой пространства или организации»; **критичная** | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/io-p0-roundtrip.spec.ts` background export of a branch can be cancelled from the dialog; separate-files ZIP opti… (+3) |
| `page/PageLoaded/print` | Печать |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `page/PageLoaded/wide` | Широкая страница | без прав: «Нужно право на редактирование страницы — запросите его в «Поделиться»» | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `page/PageLoaded/lock` | Снять защиту от изменений |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `page/PageLoaded/template` | Сохранить как шаблон | без прав: «Нужно право на редактирование страницы — запросите его в «Поделиться»»; **критичная** | ✗ | ✔ | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | `e2e/qa-actions.spec.ts` R-QA-004 page menu: «Сохранить как шаблон», «Дублировать», «Удалить» with «Восстановить… (+1) |
| `page/PageLoaded/dup` | Дублировать | без прав: «Нет права создавать страницы в этом пространстве»; **критичная** | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-actions.spec.ts` R-QA-004 page menu: «Сохранить как шаблон», «Дублировать», «Удалить» with «Восстановить… |
| `page/PageLoaded/move` | Переместить в… | без прав: «Перемещать страницу может только тот, у кого есть право изменять структуру (полный доступ к разделу)»; **критичная** | ✗ | ✔ | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | `e2e/qa-actions.spec.ts` R-QA-029 no permission: a viewer sees page and tree actions disabled with the reason, a… (+2) |
| `page/PageLoaded/delete` | Удалить | без прав: «Удалять страницу может только пользователь с полным доступом (или включено юридическое удержание)»; **критичная** | ✗ | ✔ | ✗ | ✔ | ✔ | ✔ | ✔ | ✗ | `e2e/qa-actions.spec.ts` R-QA-004 page menu: «Сохранить как шаблон», «Дублировать», «Удалить» with «Восстановить… (+2) |
| `page/PageLoaded/ne-polnostyu-lichnaya` | Не полностью личная |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/acl-p0-spaces.spec.ts` R-ACL-051: a shared personal page shows «Не полностью личная» in the header and in the … |
| `page/PageLoaded/podelitsya` | Поделиться | **критичная** | ✗ | ✔ | ✔ | ✔ | ✗ | ✔ | ✔ | ✔ | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … (+12) |
| `page/PageLoaded/kommentarii` | Комментарии |  | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/content.spec.ts` comment on a selection appears in the comments panel (+3) |
| `page/PageLoaded/izbrannoe` | Избранное |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `page/PageLoaded/vosstanovit` | Восстановить | **критичная** | ✗ | ✔ | ✗ | ✔ | ✔ | ✗ | ✔ | ✔ | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … (+7) |
| `page/PageLoaded/skachat-lokalnuyu-kopiyu` | Скачать локальную копию |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `page/PageLoaded/izmenit-znachok` | Изменить значок |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `page/PageLoaded/dobavit-znachok` | Добавить значок |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |

### runtime

| ID | Операция | Особенности из кода | Пусто | Успех | Загрузка / медленная сеть | Отмена | Ошибка сервера | Нет прав | Потеря сети | Повторный клик | Тест |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `runtime/textbox/soderzhimoe-stranicy` | Содержимое страницы |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | **нет** |
| `runtime/radio/vse` | Всё |  | · | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | · | **нет** |
| `runtime/button/zagruzit-i-proverit` | Загрузить и проверить | **критичная** | ✗ | ✔ | ✔ | ✔ | ✔ | ✗ | ✗ | ✔ | `e2e/import-collection.spec.ts` R-COLLECTION-003: import into an existing collection in «replace» mode — dry run lists … (+4) |
| `runtime/link/profil` | Профиль |  | · | ✗ | ✗ | · | ✗ | ✗ | ✗ | · | **нет** |
| `runtime/link/oformlenie-i-redaktor` | Оформление и редактор |  | · | ✗ | ✗ | · | ✗ | ✗ | ✗ | · | **нет** |
| `runtime/link/parol-i-vhod` | Пароль и вход | **критичная** | · | ✔ | ✗ | ✔ | ✔ | ✗ | ✗ | · | `e2e/qa-admin-spaces.spec.ts` R-AUTH-012 sessions: «Завершить сеанс?» cancel keeps the other device signed in; server… |
| `runtime/link/aktivnye-seansy` | Активные сеансы |  | · | ✔ | ✗ | · | ✗ | ✗ | ✗ | · | `e2e/qa-admin-spaces.spec.ts` R-AUTH-012 sessions: «Завершить сеанс?» cancel keeps the other device signed in; server… |
| `runtime/link/api-tokeny` | API-токены | **критичная** | · | ✔ | ✗ | ✔ | ✔ | ✗ | ✗ | · | `e2e/qa-admin-spaces.spec.ts` R-AUTH-012 sessions: «Завершить сеанс?» cancel keeps the other device signed in; server… |
| `runtime/switch/proverka-orfografii` | Проверка орфографии |  | · | ✔ | ✔ | ✗ | ✔ | ✗ | ✗ | · | `e2e/qa-admin2-settings.spec.ts` R-UI-061 theme «Тёмная» / «Светлая» / «Как в системе» applies at once, survives a reloa… |
| `runtime/switch/shirokie-stranicy-po-umolchaniyu` | Широкие страницы по умолчанию |  | · | ✔ | ✔ | ✗ | ✔ | ✗ | ✗ | · | `e2e/qa-admin2-settings.spec.ts` R-UI-061 theme «Тёмная» / «Светлая» / «Как в системе» applies at once, survives a reloa… |
| `runtime/switch/umnaya-tipografika` | Умная типографика |  | · | ✔ | ✔ | ✗ | ✔ | ✗ | ✗ | · | `e2e/qa-admin2-settings.spec.ts` R-UI-061 theme «Тёмная» / «Светлая» / «Как в системе» applies at once, survives a reloa… |
| `runtime/switch/podskazki-po-interfeysu` | Подсказки по интерфейсу |  | · | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | · | **нет** |
| `runtime/switch/obyazatelnaya-dvuhfaktornaya-autentifikaciya` | Обязательная двухфакторная аутентификация |  | · | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | · | **нет** |
| `runtime/switch/vhod-tolko-cherez-sso` | Вход только через SSO |  | · | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | · | **нет** |
| `runtime/switch/avtomaticheskoe-sozdanie-uchetnyh-zapisey-pri-vh` | Автоматическое создание учётных записей при входе через SSO |  | · | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | · | **нет** |
| `runtime/switch/gostevye-uchetnye-zapisi` | Гостевые учётные записи |  | · | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | · | `e2e/qa-admin-org.spec.ts` R-QA-004 «Сохранить» organisation settings: nothing changed — disabled; out-of-range va… |
| `runtime/spinbutton/srok-hraneniya-v-korzine` | Срок хранения в корзине |  | ✗ | ✔ | · | · | ✗ | ✗ | ✗ | · | `e2e/qa-admin-org.spec.ts` R-QA-004 «Сохранить» organisation settings: nothing changed — disabled; out-of-range va… |
| `runtime/spinbutton/srok-hraneniya-versiy` | Срок хранения версий |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | **нет** |
| `runtime/spinbutton/srok-hraneniya-zhurnala-izmeneniy` | Срок хранения журнала изменений |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | **нет** |
| `runtime/spinbutton/kvota-faylov-na-polzovatelya` | Квота файлов на пользователя |  | ✗ | ✔ | · | · | ✗ | ✗ | ✗ | · | `e2e/qa-admin-org.spec.ts` R-QA-004 «Сохранить» organisation settings: nothing changed — disabled; out-of-range va… |
| `runtime/combobox/kto` | Кто |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | **нет** |

### search

| ID | Операция | Особенности из кода | Пусто | Успех | Загрузка / медленная сеть | Отмена | Ошибка сервера | Нет прав | Потеря сети | Повторный клик | Тест |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `search/SearchPage/pages` | Текст страниц |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/io-p0-roundtrip.spec.ts` Markdown file import → edit → Markdown export round trip (E225, R-EXPORT-012) |
| `search/SearchPage/files` | Вложения |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `search/SearchPage/images` | Изображения (OCR) |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `search/AuthorFilter/sbrosit-avtora` | Сбросить автора | **критичная** | ✗ | ✔ | ✗ | ✗ | ✔ | ✗ | ✔ | ✗ | `e2e/qa-editor-shell.spec.ts` R-SEARCH-008: search filters — «Сбросить автора», «Сбросить фильтры», tag «Сбросить», «… |
| `search/AuthorFilter/button-data` | {…} |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `search/SearchPage/ochistit` | Очистить | **критичная** | ✔ | ✔ | ✗ | ✗ | ✔ | ✗ | ✗ | ✗ | `e2e/qa-actions.spec.ts` R-QA-004 search: empty result explains itself, «Очистить» resets the query, a server er… |
| `search/SearchPage/filtry` | Фильтры |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `search/SearchPage/sbrosit-filtry` | Сбросить фильтры | **критичная** | ✗ | ✔ | ✗ | ✗ | ✔ | ✗ | ✔ | ✗ | `e2e/qa-editor-shell.spec.ts` R-SEARCH-008: search filters — «Сбросить автора», «Сбросить фильтры», tag «Сбросить», «… |
| `search/SearchPage/sbrosit` | Сбросить | **критичная** | ✗ | ✔ | ✗ | ✗ | ✔ | ✗ | ✔ | ✗ | `e2e/qa-editor-shell.spec.ts` R-SEARCH-008: search filters — «Сбросить автора», «Сбросить фильтры», tag «Сбросить», «… |
| `search/SearchPage/povtorit` | Повторить |  | ✔ | ✔ | ✗ | ✗ | ✔ | ✗ | ✔ | ✗ | `e2e/qa-actions.spec.ts` R-QA-004 search: empty result explains itself, «Очистить» resets the query, a server er… (+1) |
| `search/SearchPage/sbrosit-filtry~2` | сбросить фильтры | **критичная** | ✔ | ✔ | ✗ | ✗ | ✔ | ✗ | ✔ | ✗ | `e2e/qa-editor-shell.spec.ts` R-SEARCH-008: search filters — «Сбросить автора», «Сбросить фильтры», tag «Сбросить», «… |
| `search/SearchPage/pokazat-esche` | Показать ещё |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |

### settings

| ID | Операция | Особенности из кода | Пусто | Успех | Загрузка / медленная сеть | Отмена | Ошибка сервера | Нет прав | Потеря сети | Повторный клик | Тест |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `settings/SettingsPage/route.settings-profile` | /settings/profile | **критичная** | ✔ | ✔ | ✗ | ✔ | ✔ | ✗ | ✗ | · | `e2e/qa-actions.spec.ts` R-QA-004 profile (separate account): «Сохранить» needs a change, «Отменить» restores th… (+2) |
| `settings/SettingsPage/route.settings-appearance` | /settings/appearance | **критичная** | ✗ | ✔ | ✔ | · | ✔ | ✗ | ✗ | · | `e2e/qa-admin2-settings.spec.ts` R-UI-061 theme «Тёмная» / «Светлая» / «Как в системе» applies at once, survives a reloa… (+1) |
| `settings/SettingsPage/route.settings-security` | /settings/security | **критичная** | ✔ | ✔ | ✔ | · | ✔ | ✗ | ✔ | ✔ | `e2e/qa-actions.spec.ts` R-QA-004 password change (separate account): empty form is disabled, mismatch and wrong… (+2) |
| `settings/SettingsPage/route.settings-sessions` | /settings/sessions | **критичная** | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✔ | · | `e2e/qa-actions.spec.ts` R-QA-004 sessions: «Завершить остальные» — cancel keeps the other device signed in, con… (+2) |
| `settings/SettingsPage/route.settings-tokens` | /settings/tokens | **критичная** | ✗ | ✔ | ✔ | · | ✔ | ✗ | ✔ | ✔ | `e2e/qa-actions.spec.ts` QA-D3 (fixed): an instantaneous double activation of «Создать токен» sends one request (+3) |
| `settings/ProfileForm/otmenit` | Отменить |  | ✔ | ✔ | ✗ | ✔ | ✔ | ✗ | ✗ | ✗ | `e2e/qa-actions.spec.ts` R-QA-004 profile (separate account): «Сохранить» needs a change, «Отменить» restores th… (+2) |
| `settings/ProfileForm/sohranit` | Сохранить | **критичная** | ✔ | ✔ | ✗ | ✔ | ✔ | ✗ | ✗ | ✗ | `e2e/qa-actions.spec.ts` R-QA-004 profile (separate account): «Сохранить» needs a change, «Отменить» restores th… (+2) |
| `settings/AppearanceTab/system` | Как в системе |  | · | ✔ | ✔ | ✗ | ✔ | ✗ | ✗ | · | `e2e/qa-admin2-settings.spec.ts` R-AUTH-006 two-factor authentication: «Настроить» shows «Секретный ключ» and «Ссылка ot… (+1) |
| `settings/AppearanceTab/light` | Светлая |  | · | ✔ | ✔ | ✗ | ✔ | ✗ | ✗ | · | `e2e/qa-admin2-settings.spec.ts` R-AUTH-006 two-factor authentication: «Настроить» shows «Секретный ключ» and «Ссылка ot… (+1) |
| `settings/AppearanceTab/dark` | Тёмная |  | · | ✔ | ✔ | ✗ | ✔ | ✗ | ✗ | · | `e2e/qa-admin2-settings.spec.ts` R-AUTH-006 two-factor authentication: «Настроить» shows «Секретный ключ» and «Ссылка ot… (+1) |
| `settings/AppearanceTab/toggle-data` | {…} |  | · | ✔ | ✔ | ✗ | ✔ | ✗ | ✗ | · | `e2e/qa-admin2-settings.spec.ts` R-UI-061 theme «Тёмная» / «Светлая» / «Как в системе» applies at once, survives a reloa… |
| `settings/SecurityTab/izmenit-parol` | Изменить пароль | **критичная** | ✔ | ✔ | ✔ | ✗ | ✗ | ✗ | ✗ | ✔ | `e2e/qa-actions.spec.ts` R-QA-004 password change (separate account): empty form is disabled, mismatch and wrong… (+2) |
| `settings/MfaCard/confirm.otklyuchit-dvuhfaktornuyu-autentifikaciyu` | Отключить двухфакторную аутентификацию? | с подтверждением | ✗ | ✔ | · | ✔ | ✗ | ✗ | ✗ | · | `e2e/qa-admin2-settings.spec.ts` R-AUTH-006 two-factor authentication: «Настроить» shows «Секретный ключ» and «Ссылка ot… |
| `settings/MfaCard/confirm.otklyuchit-dvuhfaktornuyu-autentifikaciyu.otklyuchit` | Отключить | с подтверждением | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-admin2-settings.spec.ts` R-AUTH-006 two-factor authentication: «Настроить» shows «Секретный ключ» and «Ссылка ot… |
| `settings/MfaCard/otklyuchit` | Отключить |  | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-admin2-settings.spec.ts` R-AUTH-006 two-factor authentication: «Настроить» shows «Секретный ключ» and «Ссылка ot… |
| `settings/MfaCard/otmena` | Отмена |  | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-actions.spec.ts` R-QA-004 API tokens: empty name disables «Создать токен»; slow network shows progress a… (+3) |
| `settings/MfaCard/vklyuchit` | Включить |  | ✗ | ✔ | ✗ | ✔ | ✔ | ✗ | ✔ | ✗ | `e2e/qa-admin2-settings.spec.ts` R-AUTH-006 two-factor authentication: «Настроить» shows «Секретный ключ» and «Ссылка ot… (+1) |
| `settings/MfaCard/nastroit` | Настроить |  | ✗ | ✔ | ✗ | ✔ | ✔ | ✗ | ✔ | ✗ | `e2e/qa-admin2-settings.spec.ts` R-AUTH-006 two-factor authentication: «Настроить» shows «Секретный ключ» and «Ссылка ot… (+1) |
| `settings/SessionsTab/confirm.zavershit-seans` | Завершить сеанс? | с подтверждением; **критичная** | ✗ | ✔ | · | ✔ | ✔ | ✗ | ✔ | · | `e2e/qa-admin-offline.spec.ts` R-QA-029 offline: «Отправить приглашение повторно» and «Завершить сеанс?» explain the l… (+2) |
| `settings/SessionsTab/confirm.zavershit-seans.zavershit` | Завершить | с подтверждением; **критичная** | ✗ | ✔ | ✗ | ✔ | ✔ | ✗ | ✔ | ✗ | `e2e/qa-actions.spec.ts` R-QA-004 sessions: «Завершить остальные» — cancel keeps the other device signed in, con… (+3) |
| `settings/SessionsTab/zavershit-ostalnye` | Завершить остальные | **критичная** | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-actions.spec.ts` R-QA-004 sessions: «Завершить остальные» — cancel keeps the other device signed in, con… (+1) |
| `settings/SessionsTab/confirm.zavershit-ostalnye-seansy` | Завершить остальные сеансы? | с подтверждением; **критичная** | ✗ | ✔ | · | ✔ | ✗ | ✗ | ✗ | · | `e2e/qa-actions.spec.ts` R-QA-004 sessions: «Завершить остальные» — cancel keeps the other device signed in, con… (+1) |
| `settings/SessionsTab/confirm.zavershit-ostalnye-seansy.zavershit` | Завершить | с подтверждением; **критичная** | ✗ | ✔ | ✗ | ✔ | ✔ | ✗ | ✔ | ✗ | `e2e/qa-actions.spec.ts` R-QA-004 sessions: «Завершить остальные» — cancel keeps the other device signed in, con… (+3) |
| `settings/SessionsTab/zavershit` | Завершить | **критичная** | ✗ | ✔ | ✗ | ✔ | ✔ | ✗ | ✔ | ✗ | `e2e/qa-actions.spec.ts` R-QA-004 sessions: «Завершить остальные» — cancel keeps the other device signed in, con… (+3) |
| `settings/TokensTab/confirm.otozvat-token` | Отозвать токен «{…}»? | с подтверждением; **критичная** | ✗ | ✔ | · | ✗ | ✗ | ✗ | ✗ | · | `e2e/qa-actions.spec.ts` R-QA-004 API tokens: empty name disables «Создать токен»; slow network shows progress a… (+1) |
| `settings/TokensTab/confirm.otozvat-token.otozvat` | Отозвать | с подтверждением; **критичная** | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-actions.spec.ts` R-QA-004 API tokens: empty name disables «Создать токен»; slow network shows progress a… (+1) |
| `settings/TokensTab/ya-sohranil-token` | Я сохранил токен | **критичная** | ✔ | ✔ | ✔ | ✔ | ✔ | ✗ | ✔ | ✔ | `e2e/qa-actions.spec.ts` R-QA-004 API tokens: empty name disables «Создать токен»; slow network shows progress a… (+2) |
| `settings/TokensTab/sozdat-token` | Создать токен | **критичная** | ✔ | ✔ | ✔ | ✔ | ✔ | ✗ | ✔ | ✔ | `e2e/qa-actions.spec.ts` QA-D3 (fixed): an instantaneous double activation of «Создать токен» sends one request (+4) |
| `settings/TokensTab/otozvat` | Отозвать | **критичная** | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-actions.spec.ts` R-QA-004 API tokens: empty name disables «Создать токен»; slow network shows progress a… (+1) |

### shell

| ID | Операция | Особенности из кода | Пусто | Успех | Загрузка / медленная сеть | Отмена | Ошибка сервера | Нет прав | Потеря сети | Повторный клик | Тест |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `shell/AppShell/pokazat-bokovuyu-panel` | Показать боковую панель |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/a11y.spec.ts` real 200% browser zoom (1280x800 at 2x = 640x400 CSS px) keeps every key screen usable … (+81) |
| `shell/QuickSwitcher/c-search` | Расширенный поиск |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `shell/QuickSwitcher/c-home` | Главная |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `shell/QuickSwitcher/c-templates` | Шаблоны |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `shell/QuickSwitcher/c-import` | Импорт документов | **критичная** | ✔ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-editor-shell.spec.ts` R-SEARCH-010: quick switcher commands «Импорт документов» and «Корзина» (empty query li… |
| `shell/QuickSwitcher/c-trash` | Корзина | **критичная** | ✔ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-editor-shell.spec.ts` R-SEARCH-010: quick switcher commands «Импорт документов» and «Корзина» (empty query li… |
| `shell/QuickSwitcher/c-settings` | Настройки |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `shell/QuickSwitcher/c-help` | Справка и горячие клавиши |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `shell/QuickSwitcher/t.bez-nazvaniya` | Без названия |  | · | ✗ | · | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `shell/QuickSwitcher/t.bez-nazvaniya~2` | Без названия |  | · | ✗ | · | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `shell/QuickSwitcher/full` | Искать «{…}» во всех материалах |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `shell/Sidebar/settings` | Настройки профиля |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `shell/Sidebar/system` | Как в системе |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `shell/Sidebar/light` | Светлая |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `shell/Sidebar/dark` | Тёмная |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `shell/Sidebar/reset` | Сбросить панель по умолчанию | **критичная** | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-editor-shell.spec.ts` R-UI-026: profile menu «Сбросить панель по умолчанию» restores the sidebar width after … |
| `shell/Sidebar/help` | Справка и горячие клавиши | клавиша ? | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `shell/Sidebar/logout` | Выйти | **критичная** | ✔ | ✔ | ✔ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/acl-p0-routes.spec.ts` ROUTE-01: employee route — login → own spaces → regulation → search → one-click article… (+2) |
| `shell/Sidebar/confirm.est-neotpravlennye-izmeneniya` | Есть неотправленные изменения | с подтверждением; **критичная** | ✗ | ✔ | ✔ | ✔ | ✗ | ✗ | ✔ | · | `e2e/qa-editor-shell.spec.ts` R-COLLAB-040: «Выйти» with changes that have not reached the server asks «Есть неотправ… |
| `shell/Sidebar/confirm.est-neotpravlennye-izmeneniya.vyyti` | Выйти | с подтверждением; **критичная** | ✗ | ✔ | ✔ | ✔ | ✗ | ✗ | ✔ | ✗ | `e2e/qa-editor-shell.spec.ts` R-COLLAB-040: «Выйти» with changes that have not reached the server asks «Есть неотправ… |
| `shell/Sidebar/skryt-bokovuyu-panel` | Скрыть боковую панель |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `shell/Sidebar/poisk-k` | Поиск ⌘K |  | ✔ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/a11y.spec.ts` reduced motion: animations and transitions are effectively disabled (R-A11Y-002, AT-82) (+2) |
| `shell/Sidebar/vhodyaschie` | Входящие {…} |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `shell/Sidebar/novaya-stranica` | Новая страница | **критичная** | ✔ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/acl-p0-routes.spec.ts` ROUTE-01: employee route — login → own spaces → regulation → search → one-click article… (+2) |
| `shell/Sidebar/novoe-prostranstvo` | Новое пространство |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/acl-p0-routes.spec.ts` ROUTE-03: space manager route — members and group access → template → tree drag-and-dro… (+2) |
| `shell/Sidebar/izbrannoe` | Избранное |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `shell/Sidebar/povtorit` | Повторить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `shell/SidebarTree/nodemenu.new` | Новая вложенная страница | без прав: «Нет права создавать страницы здесь» | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/ui-p0-interaction.spec.ts` R-UI-060, UX-141: hovering controls performs no action; hover-only tree actions have a … |
| `shell/SidebarTree/rename` | Переименовать | без прав: «Нужно право на редактирование — запросите его у владельца страницы»; клавиша F2; **критичная** | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-actions.spec.ts` QA-D4 (fixed): «Переименовать» in the tree row menu opens the inline title editor |
| `shell/SidebarTree/icon` | Изменить иконку | без прав: «Нужно право на редактирование — запросите его у владельца страницы» | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `shell/SidebarTree/move` | Переместить в… | без прав: «Нужно право на редактирование — запросите его у владельца страницы»; **критичная** | ✗ | ✔ | ✗ | ✔ | ✔ | ✗ | ✗ | ✗ | `e2e/qa-actions.spec.ts` R-QA-004 tree row: rename (F2) — Esc cancels, Enter saves, server error keeps the old t… |
| `shell/SidebarTree/dup` | Дублировать | **критичная** | ✗ | ✔ | ✗ | ✔ | ✔ | ✗ | ✗ | ✗ | `e2e/qa-actions.spec.ts` R-QA-004 tree row: rename (F2) — Esc cancels, Enter saves, server error keeps the old t… |
| `shell/SidebarTree/link` | Копировать ссылку |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `shell/SidebarTree/fav` | В избранное |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `shell/SidebarTree/trash` | Удалить в корзину | без прав: «Нужно право на редактирование — запросите его у владельца страницы»; **критичная** | ✗ | ✔ | ✔ | ✔ | ✔ | ✗ | ✗ | ✔ | `e2e/acl-p0-routes.spec.ts` ROUTE-03: space manager route — members and group access → template → tree drag-and-dro… (+1) |
| `shell/SidebarTree/spacemenu.new` | Новая страница | без прав: «Нет права создавать страницы в этом пространстве»; **критичная** | ✔ | ✔ | ✔ | ✗ | ✔ | ✔ | ✗ | ✔ | `e2e/qa-editor-shell.spec.ts` R-TREE-002: an empty space offers «Создать первую страницу» (a double click creates one… |
| `shell/SidebarTree/open` | Обзор пространства |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `shell/SidebarTree/settings` | Настройки и участники | без прав: «Настройки доступны администраторам пространства»; **критичная** | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-actions.spec.ts` QA-D5 (fixed): «Настройки и участники» in the sidebar space menu opens the space settings |
| `shell/TreeRow/button-data` | {…} |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `shell/TreeRow/povtorit-zagruzku` | Повторить загрузку |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `shell/TreeRow/sozdat-pervuyu-stranicu` | Создать первую страницу | **критичная** | ✔ | ✔ | ✔ | ✗ | ✔ | ✗ | ✗ | ✔ | `e2e/qa-editor-shell.spec.ts` R-TREE-002: an empty space offers «Создать первую страницу» (a double click creates one… |
| `shell/TreeRow/svernut` | Свернуть |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/acl-p0-routes.spec.ts` ROUTE-03: space manager route — members and group access → template → tree drag-and-dro… |
| `shell/TreeRow/button-data~2` | {…} |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `shell/TreeRow/novaya-stranica-v` | Новая страница в «{…}» | **критичная** | ✔ | ✔ | ✔ | ✗ | ✔ | ✔ | ✗ | ✔ | `e2e/qa-editor-shell.spec.ts` R-TREE-002: an empty space offers «Создать первую страницу» (a double click creates one… |
| `shell/TreeRow/svernut~2` | Свернуть |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/acl-p0-routes.spec.ts` ROUTE-03: space manager route — members and group access → template → tree drag-and-dro… |
| `shell/TreeRow/dobavit-stranicu-vnutr` | Добавить страницу внутрь «{…}» |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/content.spec.ts` sidebar tree: "+" creates a child page under the selected parent with focus in the titl… |
| `shell/treeActions/confirm.izmenitsya-krug-dostupa` | Изменится круг доступа | с подтверждением; **критичная** | ✗ | ✔ | · | ✗ | ✗ | ✗ | ✗ | · | `e2e/route-author.spec.ts` ROUTE-02: draft → offline → sync → move to a department with visibility preview → appro… |
| `shell/treeActions/confirm.izmenitsya-krug-dostupa.peremestit` | Переместить | с подтверждением; **критичная** | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/route-author.spec.ts` ROUTE-02: draft → offline → sync → move to a department with visibility preview → appro… |
| `shell/treeActions/otkryt` | Открыть |  | · | ✗ | · | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `shell/treeActions/otmenit` | Отменить |  | · | ✗ | · | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `shell/treeActions/vosstanovit` | Восстановить | **критичная** | · | ✔ | · | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/route-author.spec.ts` ROUTE-02: draft → offline → sync → move to a department with visibility preview → appro… |
| `shell/treeActions/confirm.skopiruyte-ssylku` | Скопируйте ссылку | с подтверждением | ✗ | ✗ | · | ✗ | ✗ | ✗ | ✗ | · | **нет** |
| `shell/treeActions/confirm.skopiruyte-ssylku.gotovo` | Готово | с подтверждением | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |

### space

| ID | Операция | Особенности из кода | Пусто | Успех | Загрузка / медленная сеть | Отмена | Ошибка сервера | Нет прав | Потеря сети | Повторный клик | Тест |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `space/ExpiryPresets/button-data` | {…} |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `space/ExpiryPresets/bessrochno` | Бессрочно |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `space/CreateSpaceDialog/novoe-prostranstvo` | Новое пространство |  | ✗ | ✔ | · | ✗ | ✗ | ✗ | ✗ | · | `e2e/acl-p0-routes.spec.ts` ROUTE-03: space manager route — members and group access → template → tree drag-and-dro… (+2) |
| `space/CreateSpaceDialog/otmena` | Отмена |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-admin-spaces.spec.ts` R-ADMIN-020 space members: «Доступ до» is saved with the new member; own level: «Понизи… |
| `space/CreateSpaceDialog/sozdat-prostranstvo` | Создать пространство | **критичная** | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/acl-p0-routes.spec.ts` ROUTE-03: space manager route — members and group access → template → tree drag-and-dro… (+2) |
| `space/CreateSpaceDialog/ubrat` | Убрать: {…} |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `space/SpaceMembersEditor/confirm.otkryt-prostranstvo-vsey-organizacii` | Открыть пространство всей организации? | с подтверждением | ✗ | ✗ | · | ✗ | ✗ | ✗ | ✗ | · | **нет** |
| `space/SpaceMembersEditor/confirm.otkryt-prostranstvo-vsey-organizacii.otkryt-vsem` | Открыть всем | с подтверждением | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `space/SpaceMembersEditor/confirm.ponizit-sobstvennyy-dostup` | Понизить собственный доступ? | с подтверждением; **критичная** | ✗ | ✔ | · | ✔ | ✗ | ✗ | ✗ | · | `e2e/qa-admin-spaces.spec.ts` R-ADMIN-020 space members: «Доступ до» is saved with the new member; own level: «Понизи… |
| `space/SpaceMembersEditor/confirm.ponizit-sobstvennyy-dostup.ponizit` | Понизить | с подтверждением | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `space/SpaceMembersEditor/confirm.ubrat-iz-prostranstva` | Убрать из пространства: {…}? | с подтверждением | ✗ | ✗ | · | ✗ | ✗ | ✗ | ✗ | · | **нет** |
| `space/SpaceMembersEditor/confirm.ubrat-iz-prostranstva.ubrat` | Убрать | с подтверждением | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/acl-p0-spaces.spec.ts` R-SPACE-001 R-SPACE-010 R-ADMIN-020: a space is created in the UI and a department gets… |
| `space/SpaceMembersEditor/ubrat` | Убрать |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/acl-p0-spaces.spec.ts` R-SPACE-001 R-SPACE-010 R-ADMIN-020: a space is created in the UI and a department gets… |
| `space/SpaceMembersEditor/dobavit-v-prostranstvo` | Добавить в пространство |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/acl-p0-routes.spec.ts` ROUTE-03: space manager route — members and group access → template → tree drag-and-dro… (+2) |
| `space/SpaceMembersEditor/ubrat-dostup` | Убрать доступ: {…} | **критичная** | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/acl-p0-spaces.spec.ts` R-SPACE-001 R-SPACE-010 R-ADMIN-020: a space is created in the UI and a department gets… |
| `space/ErrorState/povtorit` | Повторить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `space/Toggle/toggle-data` | {…} |  | · | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | · | **нет** |
| `space/PagesTab/novaya-stranica` | Новая страница | **критичная** | ✗ | ✔ | ✗ | ✔ | ✔ | ✔ | ✗ | ✗ | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … (+2) |
| `space/SettingsTab/confirm.rasshirit-dostup` | Расширить доступ? | с подтверждением; **критичная** | ✔ | ✔ | · | ✔ | ✔ | ✗ | ✗ | · | `e2e/qa-admin-spaces.spec.ts` R-SPACE-004 settings: «Сбросить» restores the form; empty name is refused; widening vis… |
| `space/SettingsTab/confirm.rasshirit-dostup.otkryt-prostranstvo` | Открыть пространство | с подтверждением | ✔ | ✔ | ✗ | ✔ | ✔ | ✗ | ✗ | ✗ | `e2e/qa-admin-spaces.spec.ts` R-SPACE-004 settings: «Сбросить» restores the form; empty name is refused; widening vis… |
| `space/SettingsTab/confirm.arhivirovat-prostranstvo` | Архивировать пространство? | с подтверждением; **критичная** | ✗ | ✔ | · | ✔ | ✔ | ✔ | ✔ | · | `e2e/qa-admin-offline.spec.ts` R-QA-029 offline: «Архивировать пространство?» and «Удалить навсегда пространство «…»» … (+1) |
| `space/SettingsTab/confirm.arhivirovat-prostranstvo.arhivirovat` | Архивировать | с подтверждением; **критичная** | ✗ | ✔ | ✗ | ✔ | ✔ | ✔ | ✔ | ✗ | `e2e/qa-admin-offline.spec.ts` R-QA-029 offline: «Архивировать пространство?» and «Удалить навсегда пространство «…»» … (+1) |
| `space/SettingsTab/confirm.udalit-prostranstvo` | Удалить пространство? | с подтверждением; **критичная** | ✗ | ✔ | · | ✔ | ✗ | ✗ | ✗ | · | `e2e/qa-actions.spec.ts` R-QA-004 space settings: «Удалить пространство» — cancel keeps it, typed confirmation m… |
| `space/SettingsTab/confirm.udalit-prostranstvo.udalit` | Удалить | с подтверждением; **критичная** | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-actions.spec.ts` R-QA-004 space settings: «Удалить пространство» — cancel keeps it, typed confirmation m… |
| `space/SettingsTab/otkryt-korzinu` | Открыть корзину | **критичная** | · | ✔ | · | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-actions.spec.ts` R-QA-004 space settings: «Удалить пространство» — cancel keeps it, typed confirmation m… |
| `space/SettingsTab/vybrat-ikonku` | Выбрать иконку |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `space/SettingsTab/srazu-chitateli-vidyat-tekuschuyu-versiyu` | Сразу — читатели видят текущую версию |  | · | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | · | **нет** |
| `space/SettingsTab/posle-publikacii-chitateli-vidyat-tolko-opubliko` | После публикации — читатели видят только опубликованные версии |  | · | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | · | `e2e/acl-p0-routes.spec.ts` ROUTE-03: space manager route — members and group access → template → tree drag-and-dro… |
| `space/SettingsTab/soglasovanie-pered-publikaciey` | Согласование перед публикацией |  | · | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | · | **нет** |
| `space/SettingsTab/razreshit-eksport` | Разрешить экспорт |  | · | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | · | **нет** |
| `space/SettingsTab/razreshit-skachivanie-vlozheniy` | Разрешить скачивание вложений |  | · | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | · | **нет** |
| `space/SettingsTab/razreshit-dostup-gostyam` | Разрешить доступ гостям | **критичная** | · | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | · | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … |
| `space/SettingsTab/sbrosit` | Сбросить | **критичная** | ✔ | ✔ | ✗ | ✔ | ✔ | ✗ | ✗ | ✗ | `e2e/qa-admin-spaces.spec.ts` R-SPACE-004 settings: «Сбросить» restores the form; empty name is refused; widening vis… |
| `space/SettingsTab/sohranit` | Сохранить | **критичная** | ✔ | ✔ | ✗ | ✔ | ✔ | ✗ | ✗ | ✗ | `e2e/acl-p0-routes.spec.ts` ROUTE-03: space manager route — members and group access → template → tree drag-and-dro… (+2) |
| `space/SettingsTab/vernut-iz-arhiva` | Вернуть из архива | **критичная** | ✗ | ✔ | ✗ | ✔ | ✔ | ✔ | ✗ | ✗ | `e2e/qa-admin-page-panels.spec.ts` R-PUBLISH-002 «Снять с публикации?» and «Перенести в архив?»: cancel keeps the status, … (+1) |
| `space/SettingsTab/udalit-prostranstvo` | Удалить пространство | **критичная** | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-actions.spec.ts` R-QA-004 space settings: «Удалить пространство» — cancel keeps it, typed confirmation m… |
| `space/SpacePage/novaya-stranica` | Новая страница | **критичная** | ✗ | ✔ | ✗ | ✔ | ✔ | ✔ | ✗ | ✗ | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … (+2) |

### templates

| ID | Операция | Особенности из кода | Пусто | Успех | Загрузка / медленная сеть | Отмена | Ошибка сервера | Нет прав | Потеря сети | Повторный клик | Тест |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `templates/ErrorState/povtorit` | Повторить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `templates/CreateFromTemplateDialog/sozdat-stranicu` | Создать страницу: {…} | **критичная** | ✗ | ✔ | · | ✗ | ✗ | ✗ | ✗ | · | `e2e/acl-p0-routes.spec.ts` ROUTE-03: space manager route — members and group access → template → tree drag-and-dro… |
| `templates/CreateFromTemplateDialog/otmena` | Отмена |  | ✔ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-actions.spec.ts` R-QA-004 templates: «Новый шаблон» — empty name disables «Создать шаблон», «Отмена» cre… |
| `templates/CreateFromTemplateDialog/sozdat` | Создать | **критичная** | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/acl-p0-routes.spec.ts` ROUTE-03: space manager route — members and group access → template → tree drag-and-dro… (+1) |
| `templates/PreviewDialog/zakryt` | Закрыть |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `templates/PreviewDialog/sozdat-stranicu-iz-shablona` | Создать страницу из шаблона | **критичная** | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-admin-spaces.spec.ts` R-TEMPLATE-003 template preview → «Создать страницу из шаблона» creates a page from it … |
| `templates/NewTemplateDialog/novyy-shablon` | Новый шаблон |  | ✔ | ✔ | · | ✔ | ✗ | ✗ | ✗ | · | `e2e/qa-actions.spec.ts` R-QA-004 templates: «Новый шаблон» — empty name disables «Создать шаблон», «Отмена» cre… (+1) |
| `templates/NewTemplateDialog/otmena` | Отмена |  | ✔ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-actions.spec.ts` R-QA-004 templates: «Новый шаблон» — empty name disables «Создать шаблон», «Отмена» cre… |
| `templates/NewTemplateDialog/sozdat-shablon` | Создать шаблон | **критичная** | ✔ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-actions.spec.ts` R-QA-004 templates: «Новый шаблон» — empty name disables «Создать шаблон», «Отмена» cre… (+1) |
| `templates/NewTemplateDialog/s-nulya-bazovaya-struktura-poyasnenie-cel-soderz` | С нуля — базовая структура: пояснение, «Цель», «Содержание» |  | · | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | · | **нет** |
| `templates/NewTemplateDialog/iz-suschestvuyuschey-stranicy-soderzhimoe-i-svoy` | Из существующей страницы — содержимое и свойства копируются, страница не меняется |  | · | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | · | **нет** |
| `templates/NewTemplateDialog/izmenit` | Изменить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `templates/TemplatesPage/confirm.udalit-shablon` | Удалить шаблон? | с подтверждением; **критичная** | ✗ | ✔ | · | ✗ | ✗ | ✗ | ✗ | · | `e2e/qa-actions.spec.ts` R-QA-004 templates: «Новый шаблон» — empty name disables «Создать шаблон», «Отмена» cre… |
| `templates/TemplatesPage/confirm.udalit-shablon.udalit` | Удалить | с подтверждением; **критичная** | ✔ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-actions.spec.ts` R-QA-004 templates: «Новый шаблон» — empty name disables «Создать шаблон», «Отмена» cre… |
| `templates/TemplatesPage/novyy-shablon` | Новый шаблон |  | ✔ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-actions.spec.ts` R-QA-004 templates: «Новый шаблон» — empty name disables «Создать шаблон», «Отмена» cre… (+1) |
| `templates/TemplatesPage/ubrat-iz-izbrannyh` | Убрать из избранных |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `templates/TemplatesPage/button-data` | {…} |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `templates/TemplatesPage/prosmotr` | Просмотр |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `templates/TemplatesPage/ispolzovat` | Использовать |  | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/acl-p0-routes.spec.ts` ROUTE-03: space manager route — members and group access → template → tree drag-and-dro… |
| `templates/TemplatesPage/udalit-shablon` | Удалить шаблон «{…}» | **критичная** | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-actions.spec.ts` R-QA-004 templates: «Новый шаблон» — empty name disables «Создать шаблон», «Отмена» cre… |

### trash

| ID | Операция | Особенности из кода | Пусто | Успех | Загрузка / медленная сеть | Отмена | Ошибка сервера | Нет прав | Потеря сети | Повторный клик | Тест |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `trash/ErrorState/povtorit` | Повторить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `trash/TrashPage/restore.otkryt` | Открыть |  | · | ✗ | · | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `trash/TrashPage/confirm.udalit-navsegda` | Удалить навсегда? | с подтверждением; **критичная** | ✗ | ✔ | · | ✗ | ✗ | ✗ | ✗ | · | `e2e/qa-actions.spec.ts` R-QA-004 trash: «Удалить в корзину» from the tree → toast «Восстановить» undoes it; tra… |
| `trash/TrashPage/confirm.udalit-navsegda.udalit-navsegda` | Удалить навсегда | с подтверждением; **критичная** | ✗ | ✔ | ✔ | ✔ | ✔ | ✗ | ✔ | ✔ | `e2e/qa-actions.spec.ts` R-QA-004 trash: «Удалить в корзину» from the tree → toast «Восстановить» undoes it; tra… (+2) |
| `trash/TrashPage/restorespace.otkryt` | Открыть |  | · | ✗ | · | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `trash/TrashPage/confirm.udalit-prostranstvo-navsegda` | Удалить пространство навсегда? | с подтверждением; **критичная** | ✗ | ✔ | · | ✔ | ✔ | ✗ | ✗ | · | `e2e/qa-admin-offline.spec.ts` R-QA-029 offline: «Архивировать пространство?» and «Удалить навсегда пространство «…»» … (+1) |
| `trash/TrashPage/confirm.udalit-prostranstvo-navsegda.udalit-navsegda` | Удалить навсегда | с подтверждением; **критичная** | ✗ | ✔ | ✔ | ✔ | ✔ | ✗ | ✔ | ✔ | `e2e/qa-actions.spec.ts` R-QA-004 trash: «Удалить в корзину» from the tree → toast «Восстановить» undoes it; tra… (+2) |
| `trash/TrashPage/vosstanovit` | Восстановить | **критичная** | ✗ | ✔ | ✔ | ✔ | ✔ | ✗ | ✗ | ✔ | `e2e/qa-actions.spec.ts` R-QA-004 trash: «Удалить в корзину» from the tree → toast «Восстановить» undoes it; tra… |
| `trash/TrashPage/udalit-navsegda-prostranstvo` | Удалить навсегда пространство «{…}» | **критичная** | ✗ | ✔ | ✗ | ✔ | ✔ | ✔ | ✗ | ✗ | `e2e/qa-admin-offline.spec.ts` R-QA-029 offline: «Архивировать пространство?» and «Удалить навсегда пространство «…»» … (+1) |
| `trash/TrashPage/vosstanovit~2` | Восстановить | **критичная** | ✗ | ✔ | ✔ | ✔ | ✔ | ✗ | ✗ | ✔ | `e2e/qa-actions.spec.ts` R-QA-004 trash: «Удалить в корзину» from the tree → toast «Восстановить» undoes it; tra… |
| `trash/TrashPage/udalit-navsegda` | Удалить навсегда «{…}» | **критичная** | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `e2e/qa-actions.spec.ts` R-QA-004 trash: «Удалить в корзину» from the tree → toast «Восстановить» undoes it; tra… |

### ui

| ID | Операция | Особенности из кода | Пусто | Успех | Загрузка / медленная сеть | Отмена | Ошибка сервера | Нет прав | Потеря сети | Повторный клик | Тест |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `ui/ConfirmHost/otmena` | Отмена |  | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | `e2e/qa-actions.spec.ts` R-QA-004 admin users menu: «Сбросить пароль» (cancel, then link), «Изменить профиль и р… (+28) |
| `ui/ConfirmHost/button-data` | {…} |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `ui/Dialog/zakryt` | Закрыть |  | ✔ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/ocr-view.spec.ts` R-UI-062: a dialog with typed critical input warns before closing; closing without savi… |
| `ui/Dialog/vernutsya` | Вернуться |  | ✗ | ✔ | ✗ | ✔ | ✔ | ✗ | ✗ | ✗ | `e2e/ocr-view.spec.ts` SC-22: the OCR view shows the original image, confidence with uncertain words, correcti… (+3) |
| `ui/Dialog/zakryt-bez-sohraneniya` | Закрыть без сохранения | **критичная** | ✔ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | `e2e/ocr-view.spec.ts` R-UI-062: a dialog with typed critical input warns before closing; closing without savi… (+1) |
| `ui/Menu/x` | {…} {…} ✓ | без прав: «Действие сейчас недоступно» | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `ui/SubMenu/menu-item-data` | {…} |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `ui/SubMenu/x` | {…} {…} ✓ |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `ui/Toasts/button-data` | {…} |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |
| `ui/Toasts/zakryt-uvedomlenie` | Закрыть уведомление |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **нет** |

