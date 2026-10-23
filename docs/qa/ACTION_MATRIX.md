# Матрица действий (сгенерировано)

Сгенерировано `npm run qa:report` (`scripts/qa/coverage.ts`) из `docs/qa/action-inventory.yaml`, тестов `tests/**`, явного сопоставления `docs/qa/action-tests.yaml` и результатов запуска `docs/qa/test-results.json`. Не редактировать вручную. Машиночитаемая форма со всеми полями записи QA26-03 — `docs/qa/action-matrix.json`.

## Итог

| Показатель | Значение |
|---|---|
| Действий в инвентаризации | **865** |
| Покрыто хотя бы одним автотестом | **199** (23%) |
| Критичных действий | 230; покрыто 80 (34.8%) |
| Критичных с пройденным тестом в последнем запуске | нет данных запуска |
| Ячеек «действие × состояние» (без N/A) | 5391; покрыто 248 (4.6%) |
| Неоднозначных ссылок тестов, не засчитанных | 162 |

Состояния: success: покрыто 199, N/A 0, пробел 666; empty: покрыто 13, N/A 219, пробел 633; loading: покрыто 3, N/A 315, пробел 547; cancel: покрыто 17, N/A 311, пробел 537; error: покрыто 3, N/A 118, пробел 744; offline: покрыто 4, N/A 86, пробел 775; no-permission: покрыто 5, N/A 61, пробел 799; double-click: покрыто 4, N/A 419, пробел 442.

## Не покрытые критичные действия (блокируют релиз)

| ID | Тип | Название | Источник |
|---|---|---|---|
| `app/Authenticated/route.p-pageid-slug` | route | /p/:pageId/:slug | `apps/web/src/App.tsx:114` |
| `app/Authenticated/route.templates` | route | /templates | `apps/web/src/App.tsx:118` |
| `app/Authenticated/route.settings` | route | /settings | `apps/web/src/App.tsx:120` |
| `app/Authenticated/route.admin` | route | /admin | `apps/web/src/App.tsx:121` |
| `app/App/route.invite-token` | route | /invite/:token | `apps/web/src/App.tsx:136` |
| `admin/EmergencyAccess/otklonit` | button | Отклонить | `apps/web/src/admin/AccessSection.tsx:425` |
| `admin/EmergencyAccess/otozvat` | button | Отозвать | `apps/web/src/admin/AccessSection.tsx:432` |
| `admin/PublicLinksAdmin/otozvat` | button | Отозвать | `apps/web/src/admin/AccessSection.tsx:508` |
| `admin/AdminPage/route.admin-settings` | route | /admin/settings | `apps/web/src/admin/AdminPage.tsx:33` |
| `admin/AdminPage/route.admin-health` | route | /admin/health | `apps/web/src/admin/AdminPage.tsx:36` |
| `admin/AdminPage/route.admin-expiring` | route | /admin/expiring | `apps/web/src/admin/AdminPage.tsx:37` |
| `admin/AdminPage/route.admin` | route | /admin/… | `apps/web/src/admin/AdminPage.tsx:75` |
| `admin/AnalysisReport/polzovateli-v-arhive-naydeno-v-sisteme-ne-nayden` | button | Пользователи в архиве: … (найдено в системе: , не найдено: … ) | `apps/web/src/admin/ArchivesSection.tsx:326` |
| `admin/ReportDialog/otchet-o-vosstanovlenii` | dialog | Отчёт о восстановлении | `apps/web/src/admin/ArchivesSection.tsx:576` |
| `admin/AuditSection/sbrosit` | button | Сбросить | `apps/web/src/admin/AuditSection.tsx:196` |
| `admin/AuditSection/zagruzit-esche` | button | Загрузить ещё | `apps/web/src/admin/AuditSection.tsx:284` |
| `admin/ExpiringSection/otozvat-dostup` | button | Отозвать доступ … | `apps/web/src/admin/ExpiringSection.tsx:107` |
| `admin/GroupsSection/gruppa` | button | Группа | `apps/web/src/admin/GroupsSection.tsx:105` |
| `admin/GroupDetail/udalit` | button | Удалить | `apps/web/src/admin/GroupsSection.tsx:358` |
| `admin/GroupDetail/rol` | select | Роль | `apps/web/src/admin/GroupsSection.tsx:378` |
| `admin/GroupDetail/rol~2` | select | Роль … | `apps/web/src/admin/GroupsSection.tsx:430` |
| `admin/OrgNameCard/pereimenovat` | button | Переименовать | `apps/web/src/admin/OrgNameCard.tsx:38` |
| `admin/OrgSettingsSection/sohranit` | button | Сохранить | `apps/web/src/admin/OrgSettingsSection.tsx:184` |
| `admin/UsersSection/edit` | menu-item | Изменить профиль и роль | `apps/web/src/admin/UsersSection.tsx:100` |
| `admin/UsersSection/resend` | menu-item | Отправить приглашение повторно | `apps/web/src/admin/UsersSection.tsx:105` |
| `admin/UsersSection/revoke-invite` | menu-item | Отозвать приглашение | `apps/web/src/admin/UsersSection.tsx:113` |
| `admin/UsersSection/reset` | menu-item | Сбросить пароль | `apps/web/src/admin/UsersSection.tsx:124` |
| `admin/UsersSection/reactivate` | menu-item | Восстановить доступ | `apps/web/src/admin/UsersSection.tsx:149` |
| `admin/UsersSection/deactivate` | menu-item | Деактивировать (увольнение)… | `apps/web/src/admin/UsersSection.tsx:159` |
| `admin/UsersSection/import-csv` | button | Импорт CSV | `apps/web/src/admin/UsersSection.tsx:172` |
| `admin/UsersSection/rol` | select | Роль | `apps/web/src/admin/UsersSection.tsx:199` |
| `admin/CreateUserDialog/ssylka-priglashenie` | button | Ссылка-приглашение | `apps/web/src/admin/UsersSection.tsx:420` |
| `admin/CreateUserDialog/rol-v-organizacii` | select | Роль в организации | `apps/web/src/admin/UsersSection.tsx:495` |
| `admin/CreateUserDialog/srok-dostupa-neobyazatelno` | input | Срок доступа (необязательно) | `apps/web/src/admin/UsersSection.tsx:518` |
| `admin/CreateUserDialog/sozdat-ssylku-priglashenie-sotrudnik-sam-zadast` | toggle | Создать ссылку-приглашение (сотрудник сам задаст пароль) | `apps/web/src/admin/UsersSection.tsx:556` |
| `admin/ImportDialog/importirovat` | button | Импортировать ( … ) | `apps/web/src/admin/UsersSection.tsx:724` |
| `admin/ImportDialog/import-sotrudnikov-iz-csv` | dialog | Импорт сотрудников из CSV | `apps/web/src/admin/UsersSection.tsx:769` |
| `admin/EditUserDialog/rol-v-organizacii` | select | Роль в организации | `apps/web/src/admin/UsersSection.tsx:874` |
| `admin/EditUserDialog/dostup-deystvuet-do` | input | Доступ действует до | `apps/web/src/admin/UsersSection.tsx:912` |
| `admin/StatusDialog/deaktivirovat~2` | button | Деактивировать | `apps/web/src/admin/UsersSection.tsx:955` |
| `admin/TransferDialog/sravnit-dostupy` | button | Сравнить доступы | `apps/web/src/admin/UsersSection.tsx:1078` |
| `admin/UserPicker/ochistit-vybor` | button | Очистить выбор | `apps/web/src/admin/common.tsx:274` |
| `common/MoveDialog/peremestit` | dialog | Переместить «…» | `apps/web/src/components/MoveDialog.tsx:33` |
| `common/MoveDialog/peremestit-syuda` | button | Переместить сюда | `apps/web/src/components/MoveDialog.tsx:57` |
| `common/OcrDialog/sohranit-ispravleniya` | button | Сохранить исправления | `apps/web/src/components/OcrDialog.tsx:72` |
| `page/ThreadCard/del` | menu-item | Удалить | `apps/web/src/components/page/CommentsPanel.tsx:260` |
| `page/HistoryPanel/k-spisku-versiy` | button | К списку версий | `apps/web/src/components/page/HistoryPanel.tsx:158` |
| `page/HistoryPanel/zakryt-istoriyu` | button | Закрыть историю | `apps/web/src/components/page/HistoryPanel.tsx:168` |
| `page/RevisionItem/versiya-opublikovana` | button | Версия … … Опубликована № … · … · … | `apps/web/src/components/page/HistoryPanel.tsx:250` |
| `page/RevisionDetail/zakryt-prosmotr-versii` | button | Закрыть просмотр версии | `apps/web/src/components/page/HistoryPanel.tsx:312` |
| `page/RestoreDialog/vosstanovit-versiyu` | dialog | Восстановить версию …? | `apps/web/src/components/page/HistoryPanel.tsx:593` |
| `page/SaveVersionDialog/sohranit-versiyu` | dialog | Сохранить версию | `apps/web/src/components/page/HistoryPanel.tsx:691` |
| `page/PropertiesEditor/udalit-svoystvo` | button | Удалить свойство «…» | `apps/web/src/components/page/PageInfoPanel.tsx:349` |
| `page/LegalHold/snyat-uderzhanie` | button | Снять удержание | `apps/web/src/components/page/PageInfoPanel.tsx:413` |
| `page/LegalHold/ustanovit-yuridicheskoe-uderzhanie` | dialog | Установить юридическое удержание | `apps/web/src/components/page/PageInfoPanel.tsx:418` |
| `page/PublicLinksSection/parol-ssylki` | input | Пароль ссылки | `apps/web/src/components/page/PublicLinks.tsx:127` |
| `page/SubmitReviewDialog/otpravit-na-soglasovanie` | dialog | Отправить на согласование | `apps/web/src/components/page/PublishBar.tsx:222` |
| `page/SubmitReviewDialog/otpravit` | button | Отправить | `apps/web/src/components/page/PublishBar.tsx:231` |
| `page/DecideDialog/soglasovat-i-opublikovat` | dialog | Согласовать и опубликовать | `apps/web/src/components/page/PublishBar.tsx:285` |
| `page/DecideDialog/otkryt-istoriyu-versiy` | button | Открыть историю версий | `apps/web/src/components/page/PublishBar.tsx:309` |
| `page/ShareDialog/uroven-dostupa` | select | Уровень доступа | `apps/web/src/components/page/ShareDialog.tsx:373` |
| `page/ShareDialog/dostup-do` | input | Доступ до | `apps/web/src/components/page/ShareDialog.tsx:381` |
| `page/ShareDialog/dostup-s` | input | Доступ с | `apps/web/src/components/page/ShareDialog.tsx:400` |
| `page/ShareDialog/obschiy-dostup` | select | Общий доступ | `apps/web/src/components/page/ShareDialog.tsx:444` |
| `page/ShareDialog/ubrat-dostup` | button | Убрать доступ: … | `apps/web/src/components/page/ShareDialog.tsx:486` |
| `page/ShareDialog/nasledovat-prava` | toggle | Наследовать права | `apps/web/src/components/page/ShareDialog.tsx:500` |
| `page/ShareDialog/pochemu-u-polzovatelya-est-dostup` | button | Почему у пользователя есть доступ? | `apps/web/src/components/page/ShareDialog.tsx:545` |
| `page/AccessRequest/zachem-nuzhen-dostup-neobyazatelno` | input | Зачем нужен доступ (необязательно) | `apps/web/src/components/page/ShareDialog.tsx:665` |
| `page/AccessRequest/otpravit-zapros` | button | Отправить запрос | `apps/web/src/components/page/ShareDialog.tsx:668` |
| `space/SpaceMembersEditor/dostup-do` | input | Доступ до | `apps/web/src/components/space/SpaceAccess.tsx:349` |
| `ui/ConfirmHost/podtverdit` | button | Подтвердить | `apps/web/src/components/ui/Confirm.tsx:41` |
| `editor/suggest/new` | menu-item | Создать вложенную страницу «…» | `apps/web/src/editor/extensions/suggest.tsx:137` |
| `editor/BlockHandle/dup` | menu-item | Дублировать | `apps/web/src/editor/menus/BlockHandle.tsx:79` |
| `editor/BlockHandle/up` | menu-item | Переместить вверх | `apps/web/src/editor/menus/BlockHandle.tsx:80` |
| `editor/BlockHandle/del` | menu-item | Удалить | `apps/web/src/editor/menus/BlockHandle.tsx:121` |
| `editor/BubbleToolbar/right` | menu-item | По правому краю | `apps/web/src/editor/menus/BubbleToolbar.tsx:206` |
| `editor/BubbleToolbar/clear` | menu-item | Очистить форматирование | `apps/web/src/editor/menus/BubbleToolbar.tsx:240` |
| `editor/TableToolbar/mrup` | menu-item | Переместить строку вверх | `apps/web/src/editor/menus/TableToolbar.tsx:120` |
| `editor/TableToolbar/mcright` | menu-item | Переместить столбец вправо | `apps/web/src/editor/menus/TableToolbar.tsx:123` |
| `editor/TableToolbar/del` | menu-item | Удалить таблицу | `apps/web/src/editor/menus/TableToolbar.tsx:136` |
| `editor/LoadedImageView/po-pravomu-krayu` | button | По правому краю | `apps/web/src/editor/nodeviews/ImageView.tsx:118` |
| `editor/LoadedImageView/udalit` | button | Удалить | `apps/web/src/editor/nodeviews/ImageView.tsx:178` |
| `common/useEvents/otkryt-versiyu` | toast-action | Открыть версию … | `apps/web/src/hooks/useEvents.ts:65` |
| `shell/QuickSwitcher/c-import` | menu-item | Импорт документов | `apps/web/src/layout/QuickSwitcher.tsx:34` |
| `shell/QuickSwitcher/c-trash` | menu-item | Корзина | `apps/web/src/layout/QuickSwitcher.tsx:35` |
| `shell/Sidebar/reset` | menu-item | Сбросить панель по умолчанию | `apps/web/src/layout/Sidebar.tsx:85` |
| `shell/Sidebar/import` | link | Импорт | `apps/web/src/layout/Sidebar.tsx:177` |
| `shell/Sidebar/korzina` | link | Корзина | `apps/web/src/layout/Sidebar.tsx:180` |
| `shell/SidebarTree/rename` | menu-item | Переименовать | `apps/web/src/layout/SidebarTree.tsx:369` |
| `shell/SidebarTree/move` | menu-item | Переместить в… | `apps/web/src/layout/SidebarTree.tsx:372` |
| `shell/SidebarTree/dup` | menu-item | Дублировать | `apps/web/src/layout/SidebarTree.tsx:373` |
| `shell/SidebarTree/spacemenu.new` | menu-item | Новая страница | `apps/web/src/layout/SidebarTree.tsx:381` |
| `shell/SidebarTree/settings` | menu-item | Настройки и участники | `apps/web/src/layout/SidebarTree.tsx:383` |
| `shell/TreeRow/sozdat-pervuyu-stranicu` | button | Создать первую страницу | `apps/web/src/layout/SidebarTree.tsx:506` |
| `shell/TreeRow/novaya-stranica-v` | button | Новая страница в «…» | `apps/web/src/layout/SidebarTree.tsx:529` |
| `shell/treeActions/vosstanovit` | toast-action | Восстановить | `apps/web/src/layout/treeActions.tsx:146` |
| `auth/LoginPage/podtverdit` | button | Подтвердить | `apps/web/src/pages/Auth.tsx:79` |
| `auth/LoginPage/voyti-cherez-korporativnyy-sso` | link | Войти через корпоративный SSO | `apps/web/src/pages/Auth.tsx:84` |
| `auth/InvitePage/novyy-parol` | input | Новый пароль | `apps/web/src/pages/Auth.tsx:171` |
| `home/Home/novaya-stranica-v-lichnom-prostranstve` | button | Новая страница В личном пространстве | `apps/web/src/pages/Home.tsx:128` |
| `home/Home/import-docx-markdown-csv-xlsx` | link | Импорт DOCX, Markdown, CSV, XLSX | `apps/web/src/pages/Home.tsx:144` |
| `home/Home/sozdat-pervuyu-stranicu` | button | Создать первую страницу | `apps/web/src/pages/Home.tsx:169` |
| `home/Home/importirovat-dokumenty` | link | Импортировать документы | `apps/web/src/pages/Home.tsx:172` |
| `import/ImportPage/otmenit-import` | button | Отменить импорт | `apps/web/src/pages/ImportPage.tsx:872` |
| `import/ImportPage/povtorit-import` | button | Повторить импорт | `apps/web/src/pages/ImportPage.tsx:876` |
| `import/ImportPage/importirovat-esche` | button | Импортировать ещё | `apps/web/src/pages/ImportPage.tsx:910` |
| `page/PageError/zapros-otpravlen` | button | Запрос отправлен | `apps/web/src/pages/PageView.tsx:66` |
| `page/PageLoaded/template` | menu-item | Сохранить как шаблон | `apps/web/src/pages/PageView.tsx:227` |
| `page/PageLoaded/dup` | menu-item | Дублировать | `apps/web/src/pages/PageView.tsx:229` |
| `page/PageLoaded/delete` | menu-item | Удалить | `apps/web/src/pages/PageView.tsx:231` |
| `search/AuthorFilter/sbrosit-avtora` | button | Сбросить автора | `apps/web/src/pages/SearchPage.tsx:81` |
| `search/AuthorFilter/nedostupno-gostyam` | select | Недоступно гостям | `apps/web/src/pages/SearchPage.tsx:90` |
| `search/SearchPage/ochistit` | button | Очистить | `apps/web/src/pages/SearchPage.tsx:303` |
| `search/SearchPage/sbrosit-filtry` | button | Сбросить фильтры | `apps/web/src/pages/SearchPage.tsx:367` |
| `search/SearchPage/sbrosit` | button | Сбросить | `apps/web/src/pages/SearchPage.tsx:377` |
| `search/SearchPage/sbrosit-filtry~2` | button | сбросить фильтры | `apps/web/src/pages/SearchPage.tsx:452` |
| `search/SearchPage/zagruzit-esche` | button | Загрузить ещё | `apps/web/src/pages/SearchPage.tsx:466` |
| `search/SearchPage/bez-nazvaniya-v-zagolovke-razdela-v-tegah-v-svoy` | link | Без названия … В заголовке раздела В тегах В свойствах В комментариях Похожее название Опубликованная версия | `apps/web/src/pages/SearchPage.tsx:475` |
| `settings/SettingsPage/route.settings-profile` | route | /settings/profile | `apps/web/src/pages/SettingsPage.tsx:41` |
| `settings/SettingsPage/route.settings-appearance` | route | /settings/appearance | `apps/web/src/pages/SettingsPage.tsx:42` |
| `settings/SettingsPage/route.settings-security` | route | /settings/security | `apps/web/src/pages/SettingsPage.tsx:43` |
| `settings/SettingsPage/route.settings-sessions` | route | /settings/sessions | `apps/web/src/pages/SettingsPage.tsx:44` |
| `settings/SettingsPage/route.settings-tokens` | route | /settings/tokens | `apps/web/src/pages/SettingsPage.tsx:45` |
| `settings/ProfileForm/sohranit` | button | Сохранить | `apps/web/src/pages/SettingsPage.tsx:168` |
| `settings/SecurityTab/tekuschiy-parol` | input | Текущий пароль | `apps/web/src/pages/SettingsPage.tsx:298` |
| `settings/SecurityTab/novyy-parol` | input | Новый пароль | `apps/web/src/pages/SettingsPage.tsx:303` |
| `settings/SecurityTab/povtorite-parol` | input | Повторите пароль | `apps/web/src/pages/SettingsPage.tsx:308` |
| `settings/SecurityTab/izmenit-parol` | button | Изменить пароль | `apps/web/src/pages/SettingsPage.tsx:314` |
| `settings/SessionsTab/zavershit-ostalnye` | button | Завершить остальные | `apps/web/src/pages/SettingsPage.tsx:490` |
| `settings/SessionsTab/zavershit` | button | Завершить | `apps/web/src/pages/SettingsPage.tsx:523` |
| `settings/TokensTab/token` | button | Токен | `apps/web/src/pages/SettingsPage.tsx:587` |
| `settings/TokensTab/ya-sohranil-token` | button | Я сохранил токен | `apps/web/src/pages/SettingsPage.tsx:589` |
| `settings/TokensTab/sozdat-token` | button | Создать токен | `apps/web/src/pages/SettingsPage.tsx:621` |
| `settings/TokensTab/otozvat` | button | Отозвать | `apps/web/src/pages/SettingsPage.tsx:662` |
| `space/PagesTab/import` | link | Импорт | `apps/web/src/pages/SpacePage.tsx:119` |
| `space/SettingsTab/otkryt-korzinu` | toast-action | Открыть корзину | `apps/web/src/pages/SpacePage.tsx:289` |
| `space/SettingsTab/sbrosit` | button | Сбросить | `apps/web/src/pages/SpacePage.tsx:364` |
| `space/SettingsTab/vernut-iz-arhiva` | button | Вернуть из архива | `apps/web/src/pages/SpacePage.tsx:387` |
| `space/SettingsTab/udalit-prostranstvo` | button | Удалить пространство | `apps/web/src/pages/SpacePage.tsx:390` |
| `space/SpacePage/import` | link | Импорт | `apps/web/src/pages/SpacePage.tsx:507` |
| `templates/PreviewDialog/sozdat-stranicu-iz-shablona` | button | Создать страницу из шаблона | `apps/web/src/pages/TemplatesPage.tsx:197` |
| `templates/NewTemplateDialog/sozdat-shablon` | button | Создать шаблон | `apps/web/src/pages/TemplatesPage.tsx:284` |
| `templates/NewTemplateDialog/gde-dostupen` | select | Где доступен | `apps/web/src/pages/TemplatesPage.tsx:382` |
| `templates/TemplatesPage/udalit-shablon` | button | Удалить шаблон «…» | `apps/web/src/pages/TemplatesPage.tsx:541` |
| `trash/TrashPage/vosstanovit` | button | Восстановить | `apps/web/src/pages/TrashPage.tsx:179` |
| `trash/TrashPage/udalit-navsegda-prostranstvo` | button | Удалить навсегда пространство «…» | `apps/web/src/pages/TrashPage.tsx:183` |
| `trash/TrashPage/vosstanovit~2` | button | Восстановить | `apps/web/src/pages/TrashPage.tsx:266` |
| `trash/TrashPage/udalit-navsegda` | button | Удалить навсегда «…» | `apps/web/src/pages/TrashPage.tsx:269` |
| `runtime/link/parol-i-vhod` | runtime | Пароль и вход | `runtime link` |
| `runtime/link/api-tokeny` | runtime | API-токены | `runtime link` |

## Не покрытые прочие действия

| ID | Тип | Название | Источник |
|---|---|---|---|
| `app/App/pereyti-k-soderzhimomu` | link | Перейти к содержимому | `apps/web/src/App.tsx:134` |
| `admin/CheckAccess/https-p-ili-nachnite-vvodit-nazvanie` | input | https://…/p/… или начните вводить название | `apps/web/src/admin/AccessSection.tsx:76` |
| `admin/CheckAccess/bez-nazvaniya` | option | Без названия | `apps/web/src/admin/AccessSection.tsx:91` |
| `admin/Offboarding/sotrudnik` | select | Сотрудник | `apps/web/src/admin/AccessSection.tsx:555` |
| `admin/Offboarding/politika` | select | Политика | `apps/web/src/admin/AccessSection.tsx:566` |
| `admin/Offboarding/predprosmotr` | button | Предпросмотр | `apps/web/src/admin/AccessSection.tsx:579` |
| `admin/Offboarding/primenit` | button | Применить | `apps/web/src/admin/AccessSection.tsx:582` |
| `admin/AccessSection/check` | option | Проверить доступ | `apps/web/src/admin/AccessSection.tsx:602` |
| `admin/AccessSection/matrix` | option | Матрица доступа | `apps/web/src/admin/AccessSection.tsx:603` |
| `admin/AccessSection/emergency` | option | Экстренный доступ | `apps/web/src/admin/AccessSection.tsx:604` |
| `admin/AccessSection/links` | option | Публичные ссылки | `apps/web/src/admin/AccessSection.tsx:605` |
| `admin/AccessSection/offboarding` | option | Увольнение: личные материалы | `apps/web/src/admin/AccessSection.tsx:606` |
| `admin/ArchivesSection/otchet` | button | Отчёт | `apps/web/src/admin/ArchivesSection.tsx:180` |
| `admin/ExportDialog/otmena` | button | Отмена | `apps/web/src/admin/ArchivesSection.tsx:244` |
| `admin/ExportDialog/stranicy-prostranstva-i-fayly` | toggle | Страницы, пространства и файлы | `apps/web/src/admin/ArchivesSection.tsx:270` |
| `admin/RestoreDialog/v-suschestvuyuschee-prostranstvo` | toggle | В существующее пространство | `apps/web/src/admin/ArchivesSection.tsx:479` |
| `admin/RestoreDialog/prostranstvo-dlya-vosstanovleniya` | select | Пространство для восстановления | `apps/web/src/admin/ArchivesSection.tsx:482` |
| `admin/RestoreDialog/otmena` | button | Отмена | `apps/web/src/admin/ArchivesSection.tsx:518` |
| `admin/RestoreDialog/otmena~2` | button | Отмена | `apps/web/src/admin/ArchivesSection.tsx:554` |
| `admin/ReportDialog/zakryt` | button | Закрыть | `apps/web/src/admin/ArchivesSection.tsx:582` |
| `admin/ReportDialog/otchet-predvaritelnoy-proverki` | button | Отчёт предварительной проверки | `apps/web/src/admin/ArchivesSection.tsx:601` |
| `admin/AuditSection/csv` | button | CSV | `apps/web/src/admin/AuditSection.tsx:118` |
| `admin/AuditSection/deystvie` | select | Действие | `apps/web/src/admin/AuditSection.tsx:154` |
| `admin/AuditSection/naprimer-user-deactivate` | input | например, user.deactivate | `apps/web/src/admin/AuditSection.tsx:164` |
| `admin/AuditSection/tip-obekta` | select | Тип объекта | `apps/web/src/admin/AuditSection.tsx:172` |
| `admin/AuditSection/s` | input | С | `apps/web/src/admin/AuditSection.tsx:189` |
| `admin/AuditSection/po` | input | По | `apps/web/src/admin/AuditSection.tsx:193` |
| `admin/ExpiringSection/poisk` | input | Поиск | `apps/web/src/admin/ExpiringSection.tsx:59` |
| `admin/ExpiringSection/period` | select | Период | `apps/web/src/admin/ExpiringSection.tsx:61` |
| `admin/ExpiringSection/bez-nazvaniya` | link | (без названия) | `apps/web/src/admin/ExpiringSection.tsx:97` |
| `admin/GroupsSection/svernut` | button | Свернуть | `apps/web/src/admin/GroupsSection.tsx:82` |
| `admin/GroupsSection/poisk-grupp` | input | Поиск групп | `apps/web/src/admin/GroupsSection.tsx:127` |
| `admin/GroupDialog/otmena` | button | Отмена | `apps/web/src/admin/GroupsSection.tsx:237` |
| `admin/GroupDialog/opisanie` | input | Описание | `apps/web/src/admin/GroupsSection.tsx:265` |
| `admin/GroupDialog/vhodit-v-otdel` | select | Входит в отдел | `apps/web/src/admin/GroupsSection.tsx:270` |
| `admin/GroupDetail/nazad` | button | ← Назад | `apps/web/src/admin/GroupsSection.tsx:338` |
| `admin/GroupDetail/podotdel` | button | Подотдел | `apps/web/src/admin/GroupsSection.tsx:351` |
| `admin/GroupDetail/izmenit` | button | Изменить | `apps/web/src/admin/GroupsSection.tsx:355` |
| `admin/GroupDetail/do-neobyazatelno` | input | До (необязательно) | `apps/web/src/admin/GroupsSection.tsx:385` |
| `admin/GroupDetail/isklyuchit` | button | Исключить … | `apps/web/src/admin/GroupsSection.tsx:442` |
| `admin/HealthSection/obnovit` | button | Обновить | `apps/web/src/admin/HealthSection.tsx:40` |
| `admin/OrgNameCard/nazvanie-organizacii` | input | Название организации | `apps/web/src/admin/OrgNameCard.tsx:36` |
| `admin/OrgSettingsSection/otmenit-izmeneniya` | button | Отменить изменения | `apps/web/src/admin/OrgSettingsSection.tsx:181` |
| `admin/UsersSection/transfer` | menu-item | Перевести в другой отдел… | `apps/web/src/admin/UsersSection.tsx:102` |
| `admin/UsersSection/status` | select | Статус | `apps/web/src/admin/UsersSection.tsx:186` |
| `admin/UsersSection/otdel-ili-gruppa` | select | Отдел или группа | `apps/web/src/admin/UsersSection.tsx:208` |
| `admin/UsersSection/deystviya` | button | Действия: … | `apps/web/src/admin/UsersSection.tsx:298` |
| `admin/UsersSection/ssylka` | button | Ссылка | `apps/web/src/admin/UsersSection.tsx:331` |
| `admin/CreateUserDialog/dobavit-esche` | button | Добавить ещё | `apps/web/src/admin/UsersSection.tsx:397` |
| `admin/CreateUserDialog/otmena` | button | Отмена | `apps/web/src/admin/UsersSection.tsx:449` |
| `admin/CreateUserDialog/sotrudnik` | toggle | Сотрудник | `apps/web/src/admin/UsersSection.tsx:473` |
| `admin/CreateUserDialog/dolzhnost` | input | Должность | `apps/web/src/admin/UsersSection.tsx:490` |
| `admin/CreateUserDialog/filtr-grupp` | input | Фильтр групп | `apps/web/src/admin/UsersSection.tsx:524` |
| `admin/CreateUserDialog/osnovnoy-otdel` | select | Основной отдел | `apps/web/src/admin/UsersSection.tsx:543` |
| `admin/ImportDialog/propuschennye-stroki` | button | Пропущенные строки ( … ) | `apps/web/src/admin/UsersSection.tsx:649` |
| `admin/ImportDialog/kopirovat-ssylki` | button | Копировать ссылки | `apps/web/src/admin/UsersSection.tsx:665` |
| `admin/ImportDialog/skachat-csv` | button | Скачать CSV | `apps/web/src/admin/UsersSection.tsx:668` |
| `admin/ImportDialog/nazad-k-dannym` | button | Назад к данным | `apps/web/src/admin/UsersSection.tsx:721` |
| `admin/ImportDialog/email-name-department-title-ivanov-example-com-i` | input | email;name;department;title ivanov@example.com;Иван Иванов;Бухгалтерия;Бухгалтер | `apps/web/src/admin/UsersSection.tsx:753` |
| `admin/ImportDialog/otmena` | button | Отмена | `apps/web/src/admin/UsersSection.tsx:759` |
| `admin/EditUserDialog/izmenit` | dialog | Изменить: … | `apps/web/src/admin/UsersSection.tsx:823` |
| `admin/EditUserDialog/otmena` | button | Отмена | `apps/web/src/admin/UsersSection.tsx:830` |
| `admin/EditUserDialog/imya` | input | Имя | `apps/web/src/admin/UsersSection.tsx:865` |
| `admin/EditUserDialog/dolzhnost` | input | Должность | `apps/web/src/admin/UsersSection.tsx:869` |
| `admin/EditUserDialog/osnovnoy-otdel` | select | Основной отдел | `apps/web/src/admin/UsersSection.tsx:887` |
| `admin/StatusDialog/otmena` | button | Отмена | `apps/web/src/admin/UsersSection.tsx:952` |
| `admin/TransferDialog/perevod` | dialog | Перевод: … | `apps/web/src/admin/UsersSection.tsx:1067` |
| `admin/TransferDialog/otmena` | button | Отмена | `apps/web/src/admin/UsersSection.tsx:1075` |
| `admin/TransferDialog/sdelat-osnovnym-otdelom` | toggle | Сделать « … » основным отделом | `apps/web/src/admin/UsersSection.tsx:1124` |
| `admin/ErrorState/povtorit` | button | Повторить | `apps/web/src/admin/common.tsx:161` |
| `admin/CopyField/kopirovat` | button | Копировать | `apps/web/src/admin/common.tsx:209` |
| `admin/UserPicker/gost` | option | … … Гость | `apps/web/src/admin/common.tsx:328` |
| `admin/Pager/nazad` | button | Назад | `apps/web/src/admin/common.tsx:360` |
| `admin/Pager/dalee` | button | Далее | `apps/web/src/admin/common.tsx:363` |
| `common/DocPreview/vypolneno` | toggle | Выполнено | `apps/web/src/components/DocPreview.tsx:120` |
| `common/DocPreview/podrobnee` | button | Подробнее | `apps/web/src/components/DocPreview.tsx:140` |
| `common/ErrorBoundary/povtorit` | button | Повторить | `apps/web/src/components/ErrorBoundary.tsx:22` |
| `common/ErrorBoundary/obnovit-stranicu` | button | Обновить страницу | `apps/web/src/components/ErrorBoundary.tsx:23` |
| `common/ErrorBoundary/podrobnosti` | button | Подробности | `apps/web/src/components/ErrorBoundary.tsx:25` |
| `common/IconPicker/poisk-ikonki` | input | Поиск иконки | `apps/web/src/components/IconPicker.tsx:30` |
| `common/IconPicker/ubrat` | button | Убрать | `apps/web/src/components/IconPicker.tsx:32` |
| `common/ViewerInner/umenshit` | button | Уменьшить | `apps/web/src/components/ImageViewer.tsx:282` |
| `common/ViewerInner/x` | button | … % | `apps/web/src/components/ImageViewer.tsx:286` |
| `common/ViewerInner/vpisat-v-ekran` | button | Вписать в экран | `apps/web/src/components/ImageViewer.tsx:295` |
| `common/ViewerInner/povernut` | button | Повернуть | `apps/web/src/components/ImageViewer.tsx:300` |
| `common/ViewerInner/otkryt-original` | link | Открыть оригинал | `apps/web/src/components/ImageViewer.tsx:307` |
| `common/ViewerInner/skachat` | link | Скачать | `apps/web/src/components/ImageViewer.tsx:312` |
| `common/ViewerInner/zakryt` | button | Закрыть | `apps/web/src/components/ImageViewer.tsx:319` |
| `common/ViewerInner/predyduschee-izobrazhenie` | button | Предыдущее изображение | `apps/web/src/components/ImageViewer.tsx:354` |
| `common/ViewerInner/sleduyuschee-izobrazhenie` | button | Следующее изображение | `apps/web/src/components/ImageViewer.tsx:357` |
| `common/MoveDialog/poisk-stranicy-naznacheniya` | input | Поиск страницы назначения | `apps/web/src/components/MoveDialog.tsx:35` |
| `common/MoveDialog/bez-nazvaniya-vnutr` | option | Без названия внутрь | `apps/web/src/components/MoveDialog.tsx:39` |
| `common/MoveDialog/prostranstva` | button | Пространства | `apps/web/src/components/MoveDialog.tsx:50` |
| `common/MoveDialog/vnutr` | button | Внутрь | `apps/web/src/components/MoveDialog.tsx:65` |
| `common/MoveDialog/otkryt` | button | Открыть «…» | `apps/web/src/components/MoveDialog.tsx:68` |
| `common/MoveDialog/x` | button | 🗂 … | `apps/web/src/components/MoveDialog.tsx:80` |
| `common/NotificationsPopover/prochitat-vse` | button | Прочитать все | `apps/web/src/components/Notifications.tsx:39` |
| `common/NotificationsPopover/x` | button | … «…» · … | `apps/web/src/components/Notifications.tsx:52` |
| `common/OcrDialog/tekst-na-izobrazhenii` | dialog | Текст на изображении | `apps/web/src/components/OcrDialog.tsx:57` |
| `common/OcrDialog/raspoznat-zanovo` | button | Распознать заново | `apps/web/src/components/OcrDialog.tsx:64` |
| `common/OcrDialog/kopirovat` | button | Копировать | `apps/web/src/components/OcrDialog.tsx:68` |
| `common/OcrDialog/raspoznannyy-tekst` | input | Распознанный текст | `apps/web/src/components/OcrDialog.tsx:88` |
| `page/CommentsPanel/zakryt-kommentarii` | button | Закрыть комментарии | `apps/web/src/components/page/CommentsPanel.tsx:109` |
| `page/CommentsPanel/otkrytye` | tab | Открытые · … | `apps/web/src/components/page/CommentsPanel.tsx:114` |
| `page/CommentsPanel/reshennye` | tab | Решённые · … | `apps/web/src/components/page/CommentsPanel.tsx:117` |
| `page/CommentsPanel/vse` | tab | Все | `apps/web/src/components/page/CommentsPanel.tsx:120` |
| `page/CommentsPanel/povtorit` | button | Повторить | `apps/web/src/components/page/CommentsPanel.tsx:147` |
| `page/ThreadCard/otkryt-obsuzhdenie-zanovo` | button | Открыть обсуждение заново | `apps/web/src/components/page/CommentsPanel.tsx:223` |
| `page/ThreadCard/deystviya-s-kommentariem` | menu | Действия с комментарием | `apps/web/src/components/page/CommentsPanel.tsx:250` |
| `page/ThreadCard/edit` | menu-item | Изменить | `apps/web/src/components/page/CommentsPanel.tsx:259` |
| `page/ThreadCard/otvetit` | button | Ответить | `apps/web/src/components/page/CommentsPanel.tsx:306` |
| `page/Composer/upomyanut-sotrudnika` | button | Упомянуть сотрудника | `apps/web/src/components/page/CommentsPanel.tsx:508` |
| `page/Composer/otmena` | button | Отмена | `apps/web/src/components/page/CommentsPanel.tsx:534` |
| `page/ExportDialog/md` | option | Markdown | `apps/web/src/components/page/ExportDialog.tsx:13` |
| `page/ExportDialog/mdzip` | option | Markdown + файлы | `apps/web/src/components/page/ExportDialog.tsx:14` |
| `page/ExportDialog/docx` | option | Word (DOCX) | `apps/web/src/components/page/ExportDialog.tsx:15` |
| `page/ExportDialog/html` | option | HTML | `apps/web/src/components/page/ExportDialog.tsx:17` |
| `page/ExportDialog/skachat-snova` | button | Скачать снова | `apps/web/src/components/page/ExportDialog.tsx:163` |
| `page/ExportDialog/tolko-etu-stranicu` | toggle | Только эту страницу | `apps/web/src/components/page/ExportDialog.tsx:202` |
| `page/ExportDialog/odnim-dokumentom-s-oglavleniem` | toggle | Одним документом с оглавлением | `apps/web/src/components/page/ExportDialog.tsx:213` |
| `page/ExportDialog/poprobovat-v-fone` | button | Попробовать в фоне | `apps/web/src/components/page/ExportDialog.tsx:254` |
| `page/HistoryPanel/versii` | tab | Версии | `apps/web/src/components/page/HistoryPanel.tsx:173` |
| `page/HistoryPanel/zhurnal-izmeneniy` | tab | Журнал изменений | `apps/web/src/components/page/HistoryPanel.tsx:176` |
| `page/HistoryPanel/tip-versiy` | select | Тип версий | `apps/web/src/components/page/HistoryPanel.tsx:190` |
| `page/HistoryPanel/povtorit` | button | Повторить | `apps/web/src/components/page/HistoryPanel.tsx:202` |
| `page/HistoryPanel/pokazat-esche` | button | Показать ещё | `apps/web/src/components/page/HistoryPanel.tsx:216` |
| `page/RevisionDetail/prosmotr` | tab | Просмотр | `apps/web/src/components/page/HistoryPanel.tsx:318` |
| `page/RevisionDetail/sravnit-s-tekuschey` | tab | Сравнить с текущей | `apps/web/src/components/page/HistoryPanel.tsx:321` |
| `page/RevisionDetail/sravnit` | select | Сравнить | `apps/web/src/components/page/HistoryPanel.tsx:351` |
| `page/DiffView/bez-izmeneniy-pokazat` | button | … без изменений: … … — показать | `apps/web/src/components/page/HistoryPanel.tsx:454` |
| `page/RestoreDialog/otmena` | button | Отмена | `apps/web/src/components/page/HistoryPanel.tsx:600` |
| `page/RestoreDialog/povtorit` | button | Повторить | `apps/web/src/components/page/HistoryPanel.tsx:615` |
| `page/RestoreDialog/vernut-i-svoystva-stranicy-znachok-oblozhka-vlad` | toggle | Вернуть и свойства страницы (значок, обложка, владелец, теги, поля) | `apps/web/src/components/page/HistoryPanel.tsx:650` |
| `page/SaveVersionDialog/otmena` | button | Отмена | `apps/web/src/components/page/HistoryPanel.tsx:697` |
| `page/SaveVersionDialog/naprimer-pered-soglasovaniem-s-yuristami` | input | Например: «Перед согласованием с юристами» | `apps/web/src/components/page/HistoryPanel.tsx:708` |
| `page/EventsList/otmenit-eto-izmenenie` | button | Отменить это изменение | `apps/web/src/components/page/HistoryPanel.tsx:840` |
| `page/EventsList/pokazat-esche` | button | Показать ещё | `apps/web/src/components/page/HistoryPanel.tsx:858` |
| `page/PageInfoPanel/zakryt-svedeniya` | button | Закрыть сведения | `apps/web/src/components/page/PageInfoPanel.tsx:58` |
| `page/PageInfoPanel/bez-nazvaniya-upominanie` | link | Без названия упоминание | `apps/web/src/components/page/PageInfoPanel.tsx:143` |
| `page/PageInfoPanel/skachat` | link | Скачать … | `apps/web/src/components/page/PageInfoPanel.tsx:172` |
| `page/TagsEditor/otmenit` | toast-action | Отменить | `apps/web/src/components/page/PageInfoPanel.tsx:199` |
| `page/TagsEditor/x` | link | # … | `apps/web/src/components/page/PageInfoPanel.tsx:220` |
| `page/TagsEditor/ubrat-teg` | button | Убрать тег «…» | `apps/web/src/components/page/PageInfoPanel.tsx:224` |
| `page/TagsEditor/novyy-teg` | input | Новый тег | `apps/web/src/components/page/PageInfoPanel.tsx:241` |
| `page/TagsEditor/teg` | button | Тег | `apps/web/src/components/page/PageInfoPanel.tsx:242` |
| `page/PropertiesEditor/otmenit` | toast-action | Отменить | `apps/web/src/components/page/PageInfoPanel.tsx:277` |
| `page/PropertiesEditor/svoystvo` | input | Свойство «…» | `apps/web/src/components/page/PageInfoPanel.tsx:335` |
| `page/PropertiesEditor/nazvanie-novogo-svoystva` | input | Название нового свойства | `apps/web/src/components/page/PageInfoPanel.tsx:371` |
| `page/PropertiesEditor/znachenie-novogo-svoystva` | input | Значение нового свойства | `apps/web/src/components/page/PageInfoPanel.tsx:372` |
| `page/PropertiesEditor/dobavit-svoystvo` | button | Добавить свойство | `apps/web/src/components/page/PageInfoPanel.tsx:373` |
| `page/LegalHold/otmena` | button | Отмена | `apps/web/src/components/page/PageInfoPanel.tsx:424` |
| `page/LegalHold/ustanovit` | button | Установить | `apps/web/src/components/page/PageInfoPanel.tsx:427` |
| `page/LegalHold/naprimer-sudebnyy-zapros` | input | Например: судебный запрос №… | `apps/web/src/components/page/PageInfoPanel.tsx:442` |
| `page/PublicLinksSection/skopirovat` | button | Скопировать | `apps/web/src/components/page/PublicLinks.tsx:109` |
| `page/PublicLinksSection/ssylka-deystvuet-do` | input | Ссылка действует до | `apps/web/src/components/page/PublicLinks.tsx:125` |
| `page/PublicLinksSection/razreshit-skachivanie-vlozheniy` | toggle | Разрешить скачивание вложений | `apps/web/src/components/page/PublicLinks.tsx:129` |
| `page/PublicLinksSection/vklyuchaya-podstranicy` | toggle | Включая подстраницы | `apps/web/src/components/page/PublicLinks.tsx:132` |
| `page/PublicLinksSection/otmena` | button | Отмена | `apps/web/src/components/page/PublicLinks.tsx:145` |
| `page/PublishBar/sravnit` | button | Сравнить | `apps/web/src/components/page/PublishBar.tsx:132` |
| `page/SubmitReviewDialog/otmena` | button | Отмена | `apps/web/src/components/page/PublishBar.tsx:228` |
| `page/SubmitReviewDialog/ubrat-soglasuyuschego` | button | Убрать согласующего | `apps/web/src/components/page/PublishBar.tsx:245` |
| `page/SubmitReviewDialog/chto-izmenilos-i-na-chto-obratit-vnimanie` | input | Что изменилось и на что обратить внимание | `apps/web/src/components/page/PublishBar.tsx:259` |
| `page/DecideDialog/otmena` | button | Отмена | `apps/web/src/components/page/PublishBar.tsx:291` |
| `page/DecideDialog/soglasovat` | button | Согласовать | `apps/web/src/components/page/PublishBar.tsx:294` |
| `page/ShareDialog/skopirovat-ssylku` | button | Скопировать ссылку | `apps/web/src/components/page/ShareDialog.tsx:326` |
| `page/ShareDialog/povtorit` | button | Повторить | `apps/web/src/components/page/ShareDialog.tsx:340` |
| `page/ShareDialog/ubrat` | button | Убрать | `apps/web/src/components/page/ShareDialog.tsx:360` |
| `page/ShareDialog/skryt-parametry` | button | Скрыть параметры | `apps/web/src/components/page/ShareDialog.tsx:390` |
| `page/ShareDialog/zapretit-eksport` | toggle | Запретить экспорт | `apps/web/src/components/page/ShareDialog.tsx:408` |
| `page/ShareDialog/mozhet-delitsya-stranicey-dlya-redaktirovaniya` | toggle | Может делиться страницей (для редактирования) | `apps/web/src/components/page/ShareDialog.tsx:411` |
| `page/ShareDialog/zaprosit-bolshe-prav` | button | Запросить больше прав | `apps/web/src/components/page/ShareDialog.tsx:550` |
| `page/AccessRequest/nuzhnyy-uroven` | select | Нужный уровень | `apps/web/src/components/page/ShareDialog.tsx:655` |
| `page/SharePresets/vsya-kompaniya` | button | Вся компания | `apps/web/src/components/page/ShareDialog.tsx:748` |
| `space/SpaceAccess/project` | option | Проект | `apps/web/src/components/space/SpaceAccess.tsx:16` |
| `space/SpaceAccess/department` | option | Подразделение | `apps/web/src/components/space/SpaceAccess.tsx:17` |
| `space/SpaceAccess/kinds.private` | option | Закрытое | `apps/web/src/components/space/SpaceAccess.tsx:18` |
| `space/SpaceAccess/org` | option | Общекорпоративное | `apps/web/src/components/space/SpaceAccess.tsx:19` |
| `space/SpaceAccess/vis.private` | option | Приватное | `apps/web/src/components/space/SpaceAccess.tsx:22` |
| `space/SpaceAccess/closed` | option | Закрытое | `apps/web/src/components/space/SpaceAccess.tsx:23` |
| `space/SpaceAccess/open` | option | Открытое | `apps/web/src/components/space/SpaceAccess.tsx:24` |
| `space/ExpiryPresets/bessrochno` | button | Бессрочно | `apps/web/src/components/space/SpaceAccess.tsx:60` |
| `space/CreateSpaceDialog/otmena` | button | Отмена | `apps/web/src/components/space/SpaceAccess.tsx:127` |
| `space/CreateSpaceDialog/opisanie` | input | Описание | `apps/web/src/components/space/SpaceAccess.tsx:150` |
| `space/CreateSpaceDialog/vse-sotrudniki-organizacii` | select | Все сотрудники организации | `apps/web/src/components/space/SpaceAccess.tsx:176` |
| `space/CreateSpaceDialog/ubrat` | button | Убрать: … | `apps/web/src/components/space/SpaceAccess.tsx:208` |
| `ui/ConfirmHost/otmena` | button | Отмена | `apps/web/src/components/ui/Confirm.tsx:38` |
| `ui/ConfirmHost/dlya-podtverzhdeniya-vvedite` | input | Для подтверждения введите: | `apps/web/src/components/ui/Confirm.tsx:54` |
| `ui/Dialog/zakryt` | button | Закрыть | `apps/web/src/components/ui/Dialog.tsx:74` |
| `ui/Menu/x` | menu-item | … … ✓ | `apps/web/src/components/ui/Menu.tsx:80` |
| `ui/SubMenu/x` | menu-item | … … ✓ | `apps/web/src/components/ui/Menu.tsx:172` |
| `ui/Toasts/zakryt-uvedomlenie` | button | Закрыть уведомление | `apps/web/src/components/ui/Toast.tsx:75` |
| `editor/FatalBanner/skachat-lokalnuyu-kopiyu-markdown` | button | Скачать локальную копию (Markdown) | `apps/web/src/editor/Editor.tsx:176` |
| `editor/EditorInner/otkryt` | toast-action | Открыть | `apps/web/src/editor/Editor.tsx:516` |
| `editor/ReadOnlyCommentButton/kommentirovat` | button | Комментировать | `apps/web/src/editor/Editor.tsx:570` |
| `editor/FindBar/nayti-na-stranice` | input | Найти на странице | `apps/web/src/editor/Editor.tsx:592` |
| `editor/FindBar/predyduschee` | button | Предыдущее | `apps/web/src/editor/Editor.tsx:616` |
| `editor/FindBar/sleduyuschee` | button | Следующее | `apps/web/src/editor/Editor.tsx:619` |
| `editor/FindBar/zakryt-poisk` | button | Закрыть поиск | `apps/web/src/editor/Editor.tsx:622` |
| `editor/EmbedDialog/video-ili-ssylka` | dialog | Видео или ссылка | `apps/web/src/editor/Editor.tsx:633` |
| `editor/EmbedDialog/otmena` | button | Отмена | `apps/web/src/editor/Editor.tsx:639` |
| `editor/EmbedDialog/https-rutube-ru-video-ili-lyubaya-ssylka` | input | https://rutube.ru/video/… или любая ссылка | `apps/web/src/editor/Editor.tsx:650` |
| `editor/MathDialog/formula` | dialog | Формула | `apps/web/src/editor/Editor.tsx:670` |
| `editor/MathDialog/otmena` | button | Отмена | `apps/web/src/editor/Editor.tsx:676` |
| `editor/MathDialog/gotovo` | button | Готово | `apps/web/src/editor/Editor.tsx:679` |
| `editor/MathDialog/formula-latex` | input | Формула LaTeX | `apps/web/src/editor/Editor.tsx:686` |
| `editor/ImageUrlDialog/otmena` | button | Отмена | `apps/web/src/editor/ImageUrlDialog.tsx:43` |
| `editor/ImageUrlDialog/zagruzka` | button | Загрузка… | `apps/web/src/editor/ImageUrlDialog.tsx:46` |
| `editor/ImageUrlDialog/https-example-ru-schema-png` | input | https://example.ru/schema.png | `apps/web/src/editor/ImageUrlDialog.tsx:54` |
| `editor/PagePicker/poisk-stranicy` | input | Поиск страницы | `apps/web/src/editor/PagePicker.tsx:52` |
| `editor/PagePicker/bez-nazvaniya` | option | Без названия | `apps/web/src/editor/PagePicker.tsx:55` |
| `editor/PagePicker/nazad` | button | Назад | `apps/web/src/editor/PagePicker.tsx:66` |
| `editor/PagePicker/tekst` | button | Текст — | `apps/web/src/editor/PagePicker.tsx:75` |
| `editor/copy/tekst-dlya-kopirovaniya` | input | Текст для копирования | `apps/web/src/editor/clipboard/copy.tsx:45` |
| `editor/commands/text` | command | Текст | `apps/web/src/editor/commands.tsx:32` |
| `editor/commands/bullet` | command | Маркированный список | `apps/web/src/editor/commands.tsx:40` |
| `editor/commands/ordered` | command | Нумерованный список | `apps/web/src/editor/commands.tsx:41` |
| `editor/commands/todo` | command | Чек-лист | `apps/web/src/editor/commands.tsx:42` |
| `editor/commands/toggle` | command | Раскрывающийся блок | `apps/web/src/editor/commands.tsx:43` |
| `editor/commands/code` | command | Блок кода | `apps/web/src/editor/commands.tsx:47` |
| `editor/commands/cols2` | command | Две колонки | `apps/web/src/editor/commands.tsx:49` |
| `editor/commands/cols3` | command | Три колонки | `apps/web/src/editor/commands.tsx:50` |
| `editor/commands/file` | command | Файл | `apps/web/src/editor/commands.tsx:53` |
| `editor/commands/video` | command | Видео или ссылка | `apps/web/src/editor/commands.tsx:54` |
| `editor/commands/subpage` | command | Вложенная страница | `apps/web/src/editor/commands.tsx:55` |
| `editor/commands/pagelink` | command | Ссылка на страницу | `apps/web/src/editor/commands.tsx:56` |
| `editor/commands/mention` | command | Упоминание | `apps/web/src/editor/commands.tsx:57` |
| `editor/commands/toc` | command | Оглавление | `apps/web/src/editor/commands.tsx:58` |
| `editor/commands/synced` | command | Синхронизированный блок | `apps/web/src/editor/commands.tsx:59` |
| `editor/commands/math` | command | Формула | `apps/web/src/editor/commands.tsx:61` |
| `editor/commands/mermaid` | command | Схема (Mermaid) | `apps/web/src/editor/commands.tsx:62` |
| `editor/commands/emoji` | command | Эмодзи | `apps/web/src/editor/commands.tsx:63` |
| `editor/suggest/items.bez-nazvaniya` | toast-action | Без названия | `apps/web/src/editor/extensions/suggest.tsx:113` |
| `editor/suggest/items.bez-nazvaniya~2` | toast-action | Без названия | `apps/web/src/editor/extensions/suggest.tsx:130` |
| `editor/BlockHandle/turn` | option | Превратить в | `apps/web/src/editor/menus/BlockHandle.tsx:61` |
| `editor/BlockHandle/color` | option | Цвет текста | `apps/web/src/editor/menus/BlockHandle.tsx:67` |
| `editor/BlockHandle/none` | menu-item | По умолчанию | `apps/web/src/editor/menus/BlockHandle.tsx:72` |
| `editor/BlockHandle/link` | menu-item | Копировать ссылку на блок | `apps/web/src/editor/menus/BlockHandle.tsx:99` |
| `editor/BlockHandle/md` | menu-item | Копировать как Markdown | `apps/web/src/editor/menus/BlockHandle.tsx:108` |
| `editor/BlockHandle/comment` | menu-item | Комментировать | `apps/web/src/editor/menus/BlockHandle.tsx:119` |
| `editor/BlockHandle/dobavit-blok-nizhe` | button | Добавить блок ниже | `apps/web/src/editor/menus/BlockHandle.tsx:140` |
| `editor/BlockHandle/peretaschite-ili-nazhmite-dlya-deystviy` | button | Перетащите или нажмите для действий | `apps/web/src/editor/menus/BlockHandle.tsx:151` |
| `editor/BubbleToolbar/p` | menu-item | Текст | `apps/web/src/editor/menus/BubbleToolbar.tsx:71` |
| `editor/BubbleToolbar/h1` | menu-item | Заголовок 1 | `apps/web/src/editor/menus/BubbleToolbar.tsx:72` |
| `editor/BubbleToolbar/h2` | menu-item | Заголовок 2 | `apps/web/src/editor/menus/BubbleToolbar.tsx:73` |
| `editor/BubbleToolbar/h3` | menu-item | Заголовок 3 | `apps/web/src/editor/menus/BubbleToolbar.tsx:74` |
| `editor/BubbleToolbar/ul` | menu-item | Маркированный список | `apps/web/src/editor/menus/BubbleToolbar.tsx:75` |
| `editor/BubbleToolbar/ol` | menu-item | Нумерованный список | `apps/web/src/editor/menus/BubbleToolbar.tsx:76` |
| `editor/BubbleToolbar/todo` | menu-item | Чек-лист | `apps/web/src/editor/menus/BubbleToolbar.tsx:77` |
| `editor/BubbleToolbar/quote` | menu-item | Цитата | `apps/web/src/editor/menus/BubbleToolbar.tsx:78` |
| `editor/BubbleToolbar/callout` | menu-item | Выделенный блок | `apps/web/src/editor/menus/BubbleToolbar.tsx:80` |
| `editor/BubbleToolbar/adres-ssylki` | input | Адрес ссылки | `apps/web/src/editor/menus/BubbleToolbar.tsx:140` |
| `editor/BubbleToolbar/cvet` | menu | Цвет | `apps/web/src/editor/menus/BubbleToolbar.tsx:182` |
| `editor/BubbleToolbar/c-default` | menu-item | По умолчанию | `apps/web/src/editor/menus/BubbleToolbar.tsx:186` |
| `editor/BubbleToolbar/h-none` | menu-item | Без фона | `apps/web/src/editor/menus/BubbleToolbar.tsx:189` |
| `editor/BubbleToolbar/cvet-teksta-i-fona` | button | Цвет текста и фона | `apps/web/src/editor/menus/BubbleToolbar.tsx:194` |
| `editor/BubbleToolbar/esche` | menu | Ещё | `apps/web/src/editor/menus/BubbleToolbar.tsx:201` |
| `editor/BubbleToolbar/left` | menu-item | По левому краю | `apps/web/src/editor/menus/BubbleToolbar.tsx:204` |
| `editor/BubbleToolbar/center` | menu-item | По центру | `apps/web/src/editor/menus/BubbleToolbar.tsx:205` |
| `editor/BubbleToolbar/justify` | menu-item | По ширине | `apps/web/src/editor/menus/BubbleToolbar.tsx:207` |
| `editor/BubbleToolbar/size` | option | Размер шрифта | `apps/web/src/editor/menus/BubbleToolbar.tsx:209` |
| `editor/BubbleToolbar/sz-default` | menu-item | По умолчанию | `apps/web/src/editor/menus/BubbleToolbar.tsx:213` |
| `editor/BubbleToolbar/font` | option | Шрифт | `apps/web/src/editor/menus/BubbleToolbar.tsx:217` |
| `editor/BubbleToolbar/f-default` | menu-item | Основной | `apps/web/src/editor/menus/BubbleToolbar.tsx:221` |
| `editor/BubbleToolbar/f-serif` | menu-item | С засечками | `apps/web/src/editor/menus/BubbleToolbar.tsx:222` |
| `editor/BubbleToolbar/f-mono` | menu-item | Моноширинный | `apps/web/src/editor/menus/BubbleToolbar.tsx:223` |
| `editor/BubbleToolbar/sub` | menu-item | Нижний индекс | `apps/web/src/editor/menus/BubbleToolbar.tsx:227` |
| `editor/BubbleToolbar/sup` | menu-item | Верхний индекс | `apps/web/src/editor/menus/BubbleToolbar.tsx:228` |
| `editor/BubbleToolbar/math` | menu-item | Формула из выделения | `apps/web/src/editor/menus/BubbleToolbar.tsx:229` |
| `editor/BubbleToolbar/esche~2` | button | Ещё | `apps/web/src/editor/menus/BubbleToolbar.tsx:244` |
| `editor/PasteOptionsMenu/zakryt-parametry-vstavki` | button | Закрыть параметры вставки | `apps/web/src/editor/menus/PasteOptionsMenu.tsx:38` |
| `editor/TableToolbar/cvet-yacheyki` | menu | Цвет ячейки | `apps/web/src/editor/menus/TableToolbar.tsx:83` |
| `editor/TableToolbar/none` | menu-item | Без заливки | `apps/web/src/editor/menus/TableToolbar.tsx:86` |
| `editor/TableToolbar/zalivka-yacheek` | button | Заливка ячеек | `apps/web/src/editor/menus/TableToolbar.tsx:91` |
| `editor/TableToolbar/l` | menu-item | По левому краю | `apps/web/src/editor/menus/TableToolbar.tsx:100` |
| `editor/TableToolbar/c` | menu-item | По центру | `apps/web/src/editor/menus/TableToolbar.tsx:101` |
| `editor/TableToolbar/t` | menu-item | По верху | `apps/web/src/editor/menus/TableToolbar.tsx:104` |
| `editor/TableToolbar/m` | menu-item | По середине | `apps/web/src/editor/menus/TableToolbar.tsx:105` |
| `editor/TableToolbar/b` | menu-item | По низу | `apps/web/src/editor/menus/TableToolbar.tsx:106` |
| `editor/TableToolbar/vyravnivanie-v-yacheykah` | button | Выравнивание в ячейках | `apps/web/src/editor/menus/TableToolbar.tsx:110` |
| `editor/TableToolbar/hrow` | menu-item | Строка заголовков | `apps/web/src/editor/menus/TableToolbar.tsx:127` |
| `editor/TableToolbar/md` | menu-item | Копировать как Markdown | `apps/web/src/editor/menus/TableToolbar.tsx:134` |
| `editor/TableToolbar/esche` | button | Ещё | `apps/web/src/editor/menus/TableToolbar.tsx:140` |
| `editor/LoadedImageView/po-levomu-krayu` | button | По левому краю | `apps/web/src/editor/nodeviews/ImageView.tsx:108` |
| `editor/LoadedImageView/po-centru` | button | По центру | `apps/web/src/editor/nodeviews/ImageView.tsx:113` |
| `editor/LoadedImageView/na-vsyu-shirinu` | button | На всю ширину | `apps/web/src/editor/nodeviews/ImageView.tsx:123` |
| `editor/LoadedImageView/x` | button | … % | `apps/web/src/editor/nodeviews/ImageView.tsx:129` |
| `editor/LoadedImageView/alternativnyy-tekst` | button | Альтернативный текст | `apps/web/src/editor/nodeviews/ImageView.tsx:147` |
| `editor/LoadedImageView/raspoznannyy-tekst-ocr` | button | Распознанный текст (OCR) | `apps/web/src/editor/nodeviews/ImageView.tsx:153` |
| `editor/LoadedImageView/zamenit` | button | Заменить | `apps/web/src/editor/nodeviews/ImageView.tsx:160` |
| `editor/LoadedImageView/otkryt-na-ves-ekran` | button | Открыть на весь экран | `apps/web/src/editor/nodeviews/ImageView.tsx:166` |
| `editor/LoadedImageView/skachat-original` | link | Скачать оригинал | `apps/web/src/editor/nodeviews/ImageView.tsx:172` |
| `editor/LoadedImageView/povtorit` | button | Повторить | `apps/web/src/editor/nodeviews/ImageView.tsx:189` |
| `editor/LoadedImageView/alternativnyy-tekst~2` | input | Альтернативный текст | `apps/web/src/editor/nodeviews/ImageView.tsx:227` |
| `editor/UploadPlaceholder/povtorit` | button | Повторить | `apps/web/src/editor/nodeviews/UploadPlaceholder.tsx:62` |
| `editor/UploadPlaceholder/otmenit` | button | Отменить | `apps/web/src/editor/nodeviews/UploadPlaceholder.tsx:66` |
| `editor/CalloutView/vid-bloka` | menu | Вид блока | `apps/web/src/editor/nodeviews/blocks.tsx:26` |
| `editor/CalloutView/icon` | menu-item | Свой значок… | `apps/web/src/editor/nodeviews/blocks.tsx:31` |
| `editor/CalloutView/izmenit-vid-vydelennogo-bloka` | button | Изменить вид выделенного блока | `apps/web/src/editor/nodeviews/blocks.tsx:34` |
| `editor/LoadedFileView/predprosmotr` | button | Предпросмотр | `apps/web/src/editor/nodeviews/blocks.tsx:98` |
| `editor/LoadedFileView/otkryt` | link | Открыть | `apps/web/src/editor/nodeviews/blocks.tsx:103` |
| `editor/LoadedFileView/skachat` | link | Скачать | `apps/web/src/editor/nodeviews/blocks.tsx:108` |
| `editor/LoadedFileView/vid` | menu | Вид | `apps/web/src/editor/nodeviews/blocks.tsx:113` |
| `editor/LoadedFileView/compact` | menu-item | Компактно | `apps/web/src/editor/nodeviews/blocks.tsx:116` |
| `editor/LoadedFileView/card` | menu-item | Карточкой | `apps/web/src/editor/nodeviews/blocks.tsx:117` |
| `editor/LoadedFileView/vid-fayla` | button | Вид файла | `apps/web/src/editor/nodeviews/blocks.tsx:120` |
| `editor/EmbedView/ssylka` | link | Ссылка | `apps/web/src/editor/nodeviews/blocks.tsx:169` |
| `editor/MermaidView/skryt-kod` | button | Скрыть код | `apps/web/src/editor/nodeviews/blocks.tsx:278` |
| `editor/TocView/bez-nazvaniya` | link | Без названия | `apps/web/src/editor/nodeviews/blocks.tsx:317` |
| `editor/SyncedBlockView/stranicey` | link | страницей | `apps/web/src/editor/nodeviews/blocks.tsx:349` |
| `editor/SyncedBlockView/ubrat-blok` | button | Убрать блок | `apps/web/src/editor/nodeviews/blocks.tsx:354` |
| `editor/CollectionBlockView/otkryt` | link | Открыть | `apps/web/src/editor/nodeviews/blocks.tsx:380` |
| `editor/CollectionMini/bez-nazvaniya` | link | Без названия | `apps/web/src/editor/nodeviews/blocks.tsx:417` |
| `editor/CodeBlockView/yazyk-koda` | select | Язык кода | `apps/web/src/editor/nodeviews/blocks.tsx:456` |
| `editor/CodeBlockView/skopirovano` | button | Скопировано | `apps/web/src/editor/nodeviews/blocks.tsx:466` |
| `editor/palette/text-colors.gray` | option | Серый | `apps/web/src/editor/palette.ts:6` |
| `editor/palette/text-colors.brown` | option | Коричневый | `apps/web/src/editor/palette.ts:7` |
| `editor/palette/text-colors.orange` | option | Оранжевый | `apps/web/src/editor/palette.ts:8` |
| `editor/palette/text-colors.yellow` | option | Жёлтый | `apps/web/src/editor/palette.ts:9` |
| `editor/palette/text-colors.green` | option | Зелёный | `apps/web/src/editor/palette.ts:10` |
| `editor/palette/text-colors.blue` | option | Синий | `apps/web/src/editor/palette.ts:11` |
| `editor/palette/text-colors.purple` | option | Фиолетовый | `apps/web/src/editor/palette.ts:12` |
| `editor/palette/text-colors.pink` | option | Розовый | `apps/web/src/editor/palette.ts:13` |
| `editor/palette/text-colors.red` | option | Красный | `apps/web/src/editor/palette.ts:14` |
| `editor/palette/text-colors.teal` | option | Бирюзовый | `apps/web/src/editor/palette.ts:15` |
| `editor/palette/highlights.gray` | option | Серый фон | `apps/web/src/editor/palette.ts:19` |
| `editor/palette/highlights.brown` | option | Коричневый фон | `apps/web/src/editor/palette.ts:20` |
| `editor/palette/highlights.orange` | option | Оранжевый фон | `apps/web/src/editor/palette.ts:21` |
| `editor/palette/highlights.yellow` | option | Жёлтый фон | `apps/web/src/editor/palette.ts:22` |
| `editor/palette/highlights.green` | option | Зелёный фон | `apps/web/src/editor/palette.ts:23` |
| `editor/palette/highlights.blue` | option | Синий фон | `apps/web/src/editor/palette.ts:24` |
| `editor/palette/highlights.purple` | option | Фиолетовый фон | `apps/web/src/editor/palette.ts:25` |
| `editor/palette/highlights.pink` | option | Розовый фон | `apps/web/src/editor/palette.ts:26` |
| `editor/palette/highlights.red` | option | Красный фон | `apps/web/src/editor/palette.ts:27` |
| `editor/palette/highlights.teal` | option | Бирюзовый фон | `apps/web/src/editor/palette.ts:28` |
| `help/HelpCenter/poisk-po-spravke` | input | Поиск по справке | `apps/web/src/help/HelpCenter.tsx:83` |
| `help/HelpCenter/pokazyvat-podskazki-dlya-novichkov` | toggle | Показывать подсказки для новичков | `apps/web/src/help/HelpCenter.tsx:114` |
| `help/Onboarding/slash` | option | Команды через «/» | `apps/web/src/help/Onboarding.tsx:7` |
| `help/Onboarding/drag` | option | Перемещение блоков | `apps/web/src/help/Onboarding.tsx:8` |
| `help/Onboarding/tree` | option | Структура базы знаний | `apps/web/src/help/Onboarding.tsx:9` |
| `help/OnboardingHints/zakryt-podskazku` | button | Закрыть подсказку | `apps/web/src/help/Onboarding.tsx:28` |
| `help/OnboardingHints/ponyatno` | button | Понятно | `apps/web/src/help/Onboarding.tsx:34` |
| `help/OnboardingHints/ne-pokazyvat-podskazki` | button | Не показывать подсказки | `apps/web/src/help/Onboarding.tsx:37` |
| `shell/QuickSwitcher/c-search` | menu-item | Расширенный поиск | `apps/web/src/layout/QuickSwitcher.tsx:31` |
| `shell/QuickSwitcher/c-home` | menu-item | Главная | `apps/web/src/layout/QuickSwitcher.tsx:32` |
| `shell/QuickSwitcher/c-templates` | menu-item | Шаблоны | `apps/web/src/layout/QuickSwitcher.tsx:33` |
| `shell/QuickSwitcher/c-settings` | menu-item | Настройки | `apps/web/src/layout/QuickSwitcher.tsx:36` |
| `shell/QuickSwitcher/c-help` | menu-item | Справка и горячие клавиши | `apps/web/src/layout/QuickSwitcher.tsx:37` |
| `shell/QuickSwitcher/t.bez-nazvaniya` | toast-action | Без названия | `apps/web/src/layout/QuickSwitcher.tsx:52` |
| `shell/QuickSwitcher/t.bez-nazvaniya~2` | toast-action | Без названия | `apps/web/src/layout/QuickSwitcher.tsx:61` |
| `shell/QuickSwitcher/full` | menu-item | Искать «…» во всех материалах | `apps/web/src/layout/QuickSwitcher.tsx:62` |
| `shell/QuickSwitcher/nayti-stranicu-ili-komandu` | select | Найти страницу или команду | `apps/web/src/layout/QuickSwitcher.tsx:85` |
| `shell/Sidebar/profil-i-nastroyki` | menu | Профиль и настройки | `apps/web/src/layout/Sidebar.tsx:70` |
| `shell/Sidebar/settings` | menu-item | Настройки профиля | `apps/web/src/layout/Sidebar.tsx:74` |
| `shell/Sidebar/theme` | option | Тема | `apps/web/src/layout/Sidebar.tsx:75` |
| `shell/Sidebar/system` | menu-item | Как в системе | `apps/web/src/layout/Sidebar.tsx:80` |
| `shell/Sidebar/light` | menu-item | Светлая | `apps/web/src/layout/Sidebar.tsx:81` |
| `shell/Sidebar/dark` | menu-item | Тёмная | `apps/web/src/layout/Sidebar.tsx:82` |
| `shell/Sidebar/help` | menu-item | Справка и горячие клавиши | `apps/web/src/layout/Sidebar.tsx:86` |
| `shell/Sidebar/skryt-bokovuyu-panel` | button | Скрыть боковую панель | `apps/web/src/layout/Sidebar.tsx:113` |
| `shell/Sidebar/glavnaya` | link | Главная | `apps/web/src/layout/Sidebar.tsx:123` |
| `shell/Sidebar/vhodyaschie` | button | Входящие … | `apps/web/src/layout/Sidebar.tsx:128` |
| `shell/Sidebar/izbrannoe` | button | Избранное | `apps/web/src/layout/Sidebar.tsx:147` |
| `shell/Sidebar/bez-nazvaniya` | link | Без названия | `apps/web/src/layout/Sidebar.tsx:152` |
| `shell/Sidebar/povtorit` | button | Повторить | `apps/web/src/layout/Sidebar.tsx:161` |
| `shell/Sidebar/administrirovanie` | link | Администрирование | `apps/web/src/layout/Sidebar.tsx:184` |
| `shell/SidebarTree/personal` | option | Моё пространство | `apps/web/src/layout/SidebarTree.tsx:104` |
| `shell/SidebarTree/spaces` | option | Пространства | `apps/web/src/layout/SidebarTree.tsx:108` |
| `shell/SidebarTree/shared` | option | Доступные мне | `apps/web/src/layout/SidebarTree.tsx:117` |
| `shell/SidebarTree/icon` | menu-item | Изменить иконку | `apps/web/src/layout/SidebarTree.tsx:370` |
| `shell/SidebarTree/link` | menu-item | Копировать ссылку | `apps/web/src/layout/SidebarTree.tsx:374` |
| `shell/SidebarTree/fav` | menu-item | В избранное | `apps/web/src/layout/SidebarTree.tsx:375` |
| `shell/SidebarTree/open` | menu-item | Обзор пространства | `apps/web/src/layout/SidebarTree.tsx:382` |
| `shell/TreeRow/povtorit-zagruzku` | button | Повторить загрузку | `apps/web/src/layout/SidebarTree.tsx:497` |
| `shell/TreeRow/deystviya-prostranstva` | menu | Действия пространства «…» | `apps/web/src/layout/SidebarTree.tsx:534` |
| `shell/TreeRow/deystviya` | button | Действия | `apps/web/src/layout/SidebarTree.tsx:538` |
| `shell/TreeRow/bez-nazvaniya` | link | Без названия | `apps/web/src/layout/SidebarTree.tsx:577` |
| `shell/TreeRow/deystviya~2` | button | Действия | `apps/web/src/layout/SidebarTree.tsx:607` |
| `shell/RenameInput/novoe-nazvanie` | input | Новое название | `apps/web/src/layout/SidebarTree.tsx:636` |
| `shell/treeActions/otkryt` | toast-action | Открыть | `apps/web/src/layout/treeActions.tsx:128` |
| `shell/treeActions/otmenit` | toast-action | Отменить | `apps/web/src/layout/treeActions.tsx:129` |
| `auth/LoginPage/kod-iz-prilozheniya-autentifikatora` | input | Код из приложения-аутентификатора | `apps/web/src/pages/Auth.tsx:70` |
| `auth/InvitePage/kak-k-vam-obraschatsya-neobyazatelno` | input | Как к вам обращаться (необязательно) | `apps/web/src/pages/Auth.tsx:167` |
| `home/ErrorState/povtorit` | button | Повторить | `apps/web/src/pages/Home.tsx:32` |
| `home/PageRow/bez-nazvaniya` | link | Без названия … | `apps/web/src/pages/Home.tsx:67` |
| `home/Home/prodolzhit` | link | Продолжить: … | `apps/web/src/pages/Home.tsx:122` |
| `home/Home/iz-shablona-reglament-instrukciya-faq` | link | Из шаблона Регламент, инструкция, FAQ… | `apps/web/src/pages/Home.tsx:135` |
| `home/Home/poisk-po-tekstu-i-izobrazheniyam` | link | Поиск По тексту и изображениям | `apps/web/src/pages/Home.tsx:153` |
| `home/Home/otkrytye-mnoy` | tab | Открытые мной | `apps/web/src/pages/Home.tsx:204` |
| `home/Home/izmenennye` | tab | Изменённые | `apps/web/src/pages/Home.tsx:207` |
| `home/Home/lichnoe-prostranstvo-chernoviki-i-lichnye-zametk` | link | 🏠 Личное пространство Черновики и личные заметки | `apps/web/src/pages/Home.tsx:291` |
| `import/LocationPicker/povtorit` | button | Повторить | `apps/web/src/pages/ImportPage.tsx:110` |
| `import/LocationPicker/prostranstvo` | select | Пространство | `apps/web/src/pages/ImportPage.tsx:115` |
| `import/LocationPicker/kuda-pomestit` | select | Куда поместить | `apps/web/src/pages/ImportPage.tsx:128` |
| `import/ImportPage/peretaschite-fayly-syuda-ili-nazhmite-chtoby-vyb` | button | Перетащите файлы сюда или нажмите, чтобы выбрать DOCX · MD · ZIP с Markdown · HTML · CSV · XLSX | `apps/web/src/pages/ImportPage.tsx:388` |
| `import/ImportPage/ubrat` | button | Убрать … | `apps/web/src/pages/ImportPage.tsx:430` |
| `import/ImportPage/parametry-chteniya-csv` | button | Параметры чтения CSV | `apps/web/src/pages/ImportPage.tsx:447` |
| `import/ImportPage/kodirovka` | select | Кодировка | `apps/web/src/pages/ImportPage.tsx:451` |
| `import/ImportPage/razdelitel` | select | Разделитель | `apps/web/src/pages/ImportPage.tsx:459` |
| `import/ImportPage/povtorit-zagruzku` | button | Повторить загрузку | `apps/web/src/pages/ImportPage.tsx:491` |
| `import/ImportPage/otmenit` | button | Отменить | `apps/web/src/pages/ImportPage.tsx:505` |
| `import/ImportPage/otmenit~2` | button | Отменить | `apps/web/src/pages/ImportPage.tsx:520` |
| `import/ImportPage/povtorit` | button | Повторить | `apps/web/src/pages/ImportPage.tsx:534` |
| `import/ImportPage/povtorit~2` | button | Повторить | `apps/web/src/pages/ImportPage.tsx:544` |
| `import/ImportPage/izmenit-vybor` | button | Изменить выбор | `apps/web/src/pages/ImportPage.tsx:547` |
| `import/ImportPage/oshibka` | button | … ошибка | `apps/web/src/pages/ImportPage.tsx:566` |
| `import/ImportPage/izmenit-vybor~2` | button | Изменить выбор | `apps/web/src/pages/ImportPage.tsx:599` |
| `import/ImportPage/bez-nazvaniya-bl-tabl-izobr` | toggle | Без названия … бл. · … табл. · … изобр. | `apps/web/src/pages/ImportPage.tsx:625` |
| `import/ImportPage/list` | select | Лист | `apps/web/src/pages/ImportPage.tsx:648` |
| `import/ImportPage/ves-list-ili-naprimer-b2-e40` | input | весь лист, или например B2:E40 | `apps/web/src/pages/ImportPage.tsx:669` |
| `import/ImportPage/kodirovka~2` | select | Кодировка | `apps/web/src/pages/ImportPage.tsx:689` |
| `import/ImportPage/razdelitel~2` | select | Разделитель | `apps/web/src/pages/ImportPage.tsx:697` |
| `import/ImportPage/sozdat` | select | Создать | `apps/web/src/pages/ImportPage.tsx:708` |
| `import/ImportPage/kuda` | select | Куда | `apps/web/src/pages/ImportPage.tsx:717` |
| `import/ImportPage/rezhim` | select | Режим | `apps/web/src/pages/ImportPage.tsx:731` |
| `import/ImportPage/klyuchevoy-stolbec-nazvanie-zapisi` | select | Ключевой столбец (название записи) | `apps/web/src/pages/ImportPage.tsx:739` |
| `import/ImportPage/nazvanie` | input | Название | `apps/web/src/pages/ImportPage.tsx:751` |
| `import/ImportPage/perechitat` | button | Перечитать | `apps/web/src/pages/ImportPage.tsx:762` |
| `import/ImportPage/tip-stolbca` | select | Тип столбца … | `apps/web/src/pages/ImportPage.tsx:775` |
| `import/ImportPage/probnyy-progon` | button | Пробный прогон | `apps/web/src/pages/ImportPage.tsx:814` |
| `import/ImportPage/podrobnee` | button | Подробнее | `apps/web/src/pages/ImportPage.tsx:831` |
| `import/ImportPage/bez-nazvaniya` | link | Без названия | `apps/web/src/pages/ImportPage.tsx:902` |
| `import/ImportPage/k-prostranstvu` | link | К пространству | `apps/web/src/pages/ImportPage.tsx:915` |
| `import/ImportPage/otkryt` | link | Открыть | `apps/web/src/pages/ImportPage.tsx:920` |
| `page/PageError/povtorit` | button | Повторить | `apps/web/src/pages/PageView.tsx:62` |
| `page/PageError/na-glavnuyu` | link | На главную | `apps/web/src/pages/PageView.tsx:78` |
| `page/PageLoaded/otmenit` | toast-action | Отменить | `apps/web/src/pages/PageView.tsx:159` |
| `page/PageLoaded/fav` | menu-item | Убрать из избранного | `apps/web/src/pages/PageView.tsx:206` |
| `page/PageLoaded/link` | menu-item | Копировать ссылку | `apps/web/src/pages/PageView.tsx:207` |
| `page/PageLoaded/info` | menu-item | Сведения о странице | `apps/web/src/pages/PageView.tsx:221` |
| `page/PageLoaded/print` | menu-item | Печать | `apps/web/src/pages/PageView.tsx:223` |
| `page/PageLoaded/wide` | menu-item | Широкая страница | `apps/web/src/pages/PageView.tsx:225` |
| `page/PageLoaded/lock` | menu-item | Снять защиту от изменений | `apps/web/src/pages/PageView.tsx:226` |
| `page/PageLoaded/izbrannoe` | button | Избранное | `apps/web/src/pages/PageView.tsx:264` |
| `page/PageLoaded/skachat-lokalnuyu-kopiyu` | button | Скачать локальную копию | `apps/web/src/pages/PageView.tsx:305` |
| `page/PageLoaded/izmenit-znachok` | button | Изменить значок | `apps/web/src/pages/PageView.tsx:313` |
| `page/PageLoaded/dobavit-znachok` | button | Добавить значок | `apps/web/src/pages/PageView.tsx:318` |
| `page/Breadcrumbs/x` | link | 📁 … | `apps/web/src/pages/PageView.tsx:411` |
| `page/Breadcrumbs/bez-nazvaniya` | link | … Без названия | `apps/web/src/pages/PageView.tsx:428` |
| `page/Backlinks/bez-nazvaniya` | link | Без названия | `apps/web/src/pages/PageView.tsx:474` |
| `search/SearchPage/files` | option | Вложения | `apps/web/src/pages/SearchPage.tsx:36` |
| `search/SearchPage/images` | option | Изображения (OCR) | `apps/web/src/pages/SearchPage.tsx:37` |
| `search/SearchPage/poiskovyy-zapros` | input | Поисковый запрос | `apps/web/src/pages/SearchPage.tsx:285` |
| `search/SearchPage/filtry` | button | Фильтры | `apps/web/src/pages/SearchPage.tsx:316` |
| `search/SearchPage/prostranstvo` | select | Пространство | `apps/web/src/pages/SearchPage.tsx:337` |
| `search/SearchPage/status` | select | Статус | `apps/web/src/pages/SearchPage.tsx:349` |
| `search/SearchPage/izmeneno-s` | input | Изменено с | `apps/web/src/pages/SearchPage.tsx:360` |
| `search/SearchPage/po` | input | по | `apps/web/src/pages/SearchPage.tsx:364` |
| `search/SearchPage/povtorit` | button | Повторить | `apps/web/src/pages/SearchPage.tsx:431` |
| `search/SearchPage/pokazat-esche` | button | Показать ещё | `apps/web/src/pages/SearchPage.tsx:543` |
| `settings/ProfileForm/imya-i-familiya` | input | Имя и фамилия | `apps/web/src/pages/SettingsPage.tsx:146` |
| `settings/ProfileForm/dolzhnost` | input | Должность | `apps/web/src/pages/SettingsPage.tsx:151` |
| `settings/ProfileForm/otmenit` | button | Отменить | `apps/web/src/pages/SettingsPage.tsx:156` |
| `settings/AppearanceTab/system` | option | Как в системе | `apps/web/src/pages/SettingsPage.tsx:204` |
| `settings/AppearanceTab/light` | option | Светлая | `apps/web/src/pages/SettingsPage.tsx:205` |
| `settings/AppearanceTab/dark` | option | Тёмная | `apps/web/src/pages/SettingsPage.tsx:206` |
| `settings/MfaCard/123456` | input | 123456 | `apps/web/src/pages/SettingsPage.tsx:368` |
| `settings/MfaCard/otklyuchit` | button | Отключить | `apps/web/src/pages/SettingsPage.tsx:397` |
| `settings/MfaCard/sekretnyy-klyuch` | button | Секретный ключ | `apps/web/src/pages/SettingsPage.tsx:416` |
| `settings/MfaCard/ssylka-otpauth` | button | Ссылка otpauth:// | `apps/web/src/pages/SettingsPage.tsx:417` |
| `settings/MfaCard/otmena` | button | Отмена | `apps/web/src/pages/SettingsPage.tsx:420` |
| `settings/MfaCard/vklyuchit` | button | Включить | `apps/web/src/pages/SettingsPage.tsx:423` |
| `settings/MfaCard/nastroit` | button | Настроить | `apps/web/src/pages/SettingsPage.tsx:431` |
| `settings/TokensTab/naprimer-vygruzka-v-bi` | input | например, Выгрузка в BI | `apps/web/src/pages/SettingsPage.tsx:612` |
| `settings/TokensTab/srok-deystviya-dney` | input | Срок действия, дней | `apps/web/src/pages/SettingsPage.tsx:616` |
| `space/ErrorState/povtorit` | button | Повторить | `apps/web/src/pages/SpacePage.tsx:54` |
| `space/PagesTab/bez-nazvaniya` | link | Без названия | `apps/web/src/pages/SpacePage.tsx:133` |
| `space/SettingsTab/vybrat-ikonku` | button | Выбрать иконку | `apps/web/src/pages/SpacePage.tsx:308` |
| `space/SettingsTab/opisanie` | input | Описание | `apps/web/src/pages/SpacePage.tsx:320` |
| `space/SettingsTab/vidimost` | select | Видимость | `apps/web/src/pages/SpacePage.tsx:325` |
| `space/SettingsTab/srazu-chitateli-vidyat-tekuschuyu-versiyu` | toggle | Сразу — читатели видят текущую версию | `apps/web/src/pages/SpacePage.tsx:338` |
| `space/SettingsTab/soglasovanie-pered-publikaciey` | toggle | Согласование перед публикацией | `apps/web/src/pages/SpacePage.tsx:350` |
| `space/SettingsTab/razreshit-eksport` | toggle | Разрешить экспорт | `apps/web/src/pages/SpacePage.tsx:354` |
| `space/SettingsTab/razreshit-skachivanie-vlozheniy` | toggle | Разрешить скачивание вложений | `apps/web/src/pages/SpacePage.tsx:355` |
| `space/SpacePage/na-glavnuyu` | link | На главную | `apps/web/src/pages/SpacePage.tsx:433` |
| `space/SpacePage/pages` | option | Страницы | `apps/web/src/pages/SpacePage.tsx:448` |
| `templates/ErrorState/povtorit` | button | Повторить | `apps/web/src/pages/TemplatesPage.tsx:57` |
| `templates/CreateFromTemplateDialog/otmena` | button | Отмена | `apps/web/src/pages/TemplatesPage.tsx:133` |
| `templates/PreviewDialog/zakryt` | button | Закрыть | `apps/web/src/pages/TemplatesPage.tsx:194` |
| `templates/NewTemplateDialog/novyy-shablon` | dialog | Новый шаблон | `apps/web/src/pages/TemplatesPage.tsx:275` |
| `templates/NewTemplateDialog/otmena` | button | Отмена | `apps/web/src/pages/TemplatesPage.tsx:281` |
| `templates/NewTemplateDialog/s-nulya-bazovaya-struktura-poyasnenie-cel-soderz` | toggle | С нуля — базовая структура: пояснение, «Цель», «Содержание» | `apps/web/src/pages/TemplatesPage.tsx:300` |
| `templates/NewTemplateDialog/iz-suschestvuyuschey-stranicy-soderzhimoe-i-svoy` | toggle | Из существующей страницы — содержимое и свойства копируются, страница не меняется | `apps/web/src/pages/TemplatesPage.tsx:306` |
| `templates/NewTemplateDialog/izmenit` | button | Изменить | `apps/web/src/pages/TemplatesPage.tsx:322` |
| `templates/NewTemplateDialog/nachnite-vvodit-nazvanie-stranicy` | input | Начните вводить название страницы | `apps/web/src/pages/TemplatesPage.tsx:328` |
| `templates/NewTemplateDialog/bez-nazvaniya` | option | 📄 Без названия | `apps/web/src/pages/TemplatesPage.tsx:332` |
| `templates/NewTemplateDialog/x` | input | 📄 | `apps/web/src/pages/TemplatesPage.tsx:356` |
| `templates/NewTemplateDialog/po-umolchaniyu-nazvanie-shablona` | input | По умолчанию — название шаблона | `apps/web/src/pages/TemplatesPage.tsx:360` |
| `templates/NewTemplateDialog/nazvanie-shablona` | input | Название шаблона | `apps/web/src/pages/TemplatesPage.tsx:365` |
| `templates/NewTemplateDialog/opisanie` | input | Описание | `apps/web/src/pages/TemplatesPage.tsx:369` |
| `templates/NewTemplateDialog/kategoriya` | input | Категория | `apps/web/src/pages/TemplatesPage.tsx:373` |
| `templates/TemplatesPage/novyy-shablon` | button | Новый шаблон | `apps/web/src/pages/TemplatesPage.tsx:474` |
| `templates/TemplatesPage/nayti-shablon` | input | Найти шаблон | `apps/web/src/pages/TemplatesPage.tsx:482` |
| `templates/TemplatesPage/ubrat-iz-izbrannyh` | button | Убрать из избранных | `apps/web/src/pages/TemplatesPage.tsx:520` |
| `templates/TemplatesPage/prosmotr` | button | Просмотр | `apps/web/src/pages/TemplatesPage.tsx:534` |
| `trash/ErrorState/povtorit` | button | Повторить | `apps/web/src/pages/TrashPage.tsx:37` |
| `trash/TrashPage/restore.otkryt` | toast-action | Открыть | `apps/web/src/pages/TrashPage.tsx:79` |
| `trash/TrashPage/restorespace.otkryt` | toast-action | Открыть | `apps/web/src/pages/TrashPage.tsx:118` |
| `trash/TrashPage/nayti-v-korzine` | input | Найти в корзине | `apps/web/src/pages/TrashPage.tsx:199` |
| `trash/TrashPage/prostranstvo` | select | Пространство | `apps/web/src/pages/TrashPage.tsx:202` |
| `runtime/radio/vse` | runtime | Всё | `runtime radio` |
| `runtime/link/profil` | runtime | Профиль | `runtime link` |
| `runtime/link/oformlenie-i-redaktor` | runtime | Оформление и редактор | `runtime link` |
| `runtime/link/aktivnye-seansy` | runtime | Активные сеансы | `runtime link` |
| `runtime/switch/proverka-orfografii` | runtime | Проверка орфографии | `runtime switch` |
| `runtime/switch/shirokie-stranicy-po-umolchaniyu` | runtime | Широкие страницы по умолчанию | `runtime switch` |
| `runtime/switch/umnaya-tipografika` | runtime | Умная типографика | `runtime switch` |
| `runtime/switch/podskazki-po-interfeysu` | runtime | Подсказки по интерфейсу | `runtime switch` |
| `runtime/switch/obyazatelnaya-dvuhfaktornaya-autentifikaciya` | runtime | Обязательная двухфакторная аутентификация | `runtime switch` |
| `runtime/switch/vhod-tolko-cherez-sso` | runtime | Вход только через SSO | `runtime switch` |
| `runtime/switch/avtomaticheskoe-sozdanie-uchetnyh-zapisey-pri-vh` | runtime | Автоматическое создание учётных записей при входе через SSO | `runtime switch` |
| `runtime/switch/gostevye-uchetnye-zapisi` | runtime | Гостевые учётные записи | `runtime switch` |
| `runtime/spinbutton/srok-hraneniya-v-korzine` | runtime | Срок хранения в корзине | `runtime spinbutton` |
| `runtime/spinbutton/srok-hraneniya-versiy` | runtime | Срок хранения версий | `runtime spinbutton` |
| `runtime/spinbutton/srok-hraneniya-zhurnala-izmeneniy` | runtime | Срок хранения журнала изменений | `runtime spinbutton` |
| `runtime/spinbutton/kvota-faylov-na-polzovatelya` | runtime | Квота файлов на пользователя | `runtime spinbutton` |
| `runtime/combobox/kto` | runtime | Кто | `runtime combobox` |

## Все действия

Состояния: ✔ покрыто тестом, · N/A (обоснование в `action-matrix.json`), ✗ пробел. Факт — результат последнего запуска покрывающих тестов.

### admin (64/174 покрыто)

| ID | Название | Крит. | ok | пусто | загр | отм | ошиб | офл | прав | 2× | Факт | Тесты |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `admin/CheckAccess/https-p-ili-nachnite-vvodit-nazvanie` | https://…/p/… или начните вводить название |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `admin/CheckAccess/bez-nazvaniya` | Без названия |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `admin/AccessMatrix/filtr-po-imeni` | Фильтр по имени |  | ✔ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-admin.spec.ts` R-ADMIN-018 V16-S15: the administrator checks a user's access to a document — decision,… |
| `admin/EmergencyAccess/dokument-ssylka-ili-id` | Документ (ссылка или ID) |  | ✔ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-admin.spec.ts` R-ACL-056: emergency access is requested with a reason, approved by a second administra… |
| `admin/EmergencyAccess/osnovanie-ne-menee-20-simvolov` | Основание (не менее 20 символов) |  | ✔ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-admin.spec.ts` R-ACL-056: emergency access is requested with a reason, approved by a second administra… |
| `admin/EmergencyAccess/srok` | Срок |  | ✔ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-admin.spec.ts` R-ACL-056: emergency access is requested with a reason, approved by a second administra… |
| `admin/EmergencyAccess/otpravit-zapros` | Отправить запрос | **да** | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/acl-p0-admin.spec.ts` R-ACL-056: emergency access is requested with a reason, approved by a second administra… |
| `admin/EmergencyAccess/utverdit` | Утвердить |  | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/acl-p0-admin.spec.ts` R-ACL-056: emergency access is requested with a reason, approved by a second administra… |
| `admin/EmergencyAccess/otklonit` | Отклонить | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/EmergencyAccess/otozvat` | Отозвать | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/PublicLinksAdmin/otozvat` | Отозвать | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/Offboarding/sotrudnik` | Сотрудник |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `admin/Offboarding/politika` | Политика |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `admin/Offboarding/predprosmotr` | Предпросмотр |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/Offboarding/primenit` | Применить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/AccessSection/check` | Проверить доступ |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `admin/AccessSection/matrix` | Матрица доступа |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `admin/AccessSection/emergency` | Экстренный доступ |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `admin/AccessSection/links` | Публичные ссылки |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `admin/AccessSection/offboarding` | Увольнение: личные материалы |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `admin/AdminPage/route.admin-users` | /admin/users | **да** | ✔ | ✗ | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-admin.spec.ts` ROUTE-06: the auditor reads who changed what in the journal but does not see titles or …<br>`e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … |
| `admin/AdminPage/route.admin-groups` | /admin/groups | **да** | ✔ | ✗ | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … |
| `admin/AdminPage/route.admin-settings` | /admin/settings | **да** | ✗ | ✗ | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `admin/AdminPage/route.admin-audit` | /admin/audit | **да** | ✔ | ✗ | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-admin.spec.ts` ROUTE-06: the auditor reads who changed what in the journal but does not see titles or …<br>`e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … |
| `admin/AdminPage/route.admin-archives` | /admin/archives | **да** | ✔ | ✗ | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest …<br>`e2e/io-p0-roundtrip.spec.ts` archive restore dialog: the administrator chooses a new isolated space as the target (R… |
| `admin/AdminPage/route.admin-health` | /admin/health | **да** | ✗ | ✗ | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `admin/AdminPage/route.admin-expiring` | /admin/expiring | **да** | ✗ | ✗ | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `admin/AdminPage/route.admin-access` | /admin/access | **да** | ✔ | ✗ | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-admin.spec.ts` R-ACL-056: emergency access is requested with a reason, approved by a second administra…<br>`e2e/acl-p0-admin.spec.ts` R-ADMIN-018 V16-S15: the administrator checks a user's access to a document — decision,…<br>`e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … |
| `admin/AdminPage/route.admin` | /admin/… | **да** | ✗ | ✗ | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `admin/ArchivesSection/vosstanovit-iz-arhiva` | Восстановить из архива | **да** | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … |
| `admin/ArchivesSection/sozdat-arhiv` | Создать архив | **да** | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … |
| `admin/ArchivesSection/skachat` | Скачать |  | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … |
| `admin/ArchivesSection/prodolzhit` | Продолжить |  | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/io-p0-roundtrip.spec.ts` archive restore dialog: the administrator chooses a new isolated space as the target (R… |
| `admin/ArchivesSection/otchet` | Отчёт |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/ExportDialog/x` | … — … |  | ✔ | · | ✗ | ✗ | ✗ | ✔ | ✗ | · | NO RUN DATA | `e2e/collab-p0-editing.spec.ts` two editors change a paragraph, one table and the structure while one loses the connect… |
| `admin/ExportDialog/arhiv-organizacii` | Архив организации | **да** | ✔ | ✗ | · | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … |
| `admin/ExportDialog/otmena` | Отмена |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/ExportDialog/sozdat-arhiv` | Создать архив | **да** | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … |
| `admin/ExportDialog/stranicy-prostranstva-i-fayly` | Страницы, пространства и файлы |  | ✗ | · | ✗ | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `admin/ExportDialog/vash-parol` | Ваш пароль | **да** | ✔ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest …<br>`e2e/io-p0-roundtrip.spec.ts` archive restore dialog: the administrator chooses a new isolated space as the target (R… |
| `admin/ExportDialog/ya-podtverzhdayu-vygruzku-vseh-dannyh-organizaci` | Я подтверждаю выгрузку всех данных организации |  | ✔ | · | ✗ | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … |
| `admin/AnalysisReport/polzovateli-v-arhive-naydeno-v-sisteme-ne-nayden` | Пользователи в архиве: … (найдено в системе: , не найдено: … ) | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/RestoreDialog/gotovo` | Готово |  | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest …<br>`e2e/io-p0-roundtrip.spec.ts` archive restore dialog: the administrator chooses a new isolated space as the target (R… |
| `admin/RestoreDialog/obedinit-s-organizaciey-prostranstva-arhiva` | Объединить с организацией (пространства архива) |  | ✔ | · | ✗ | ✔ | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/editor-p0-clipboard.spec.ts` paste options: «Сохранить форматирование», «Объединить», «Только текст»; scripts and tr… |
| `admin/RestoreDialog/v-novoe-izolirovannoe-prostranstvo-vidno-tolko-v` | В новое изолированное пространство (видно только вам) |  | ✔ | · | ✗ | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest …<br>`e2e/io-p0-roundtrip.spec.ts` archive restore dialog: the administrator chooses a new isolated space as the target (R… |
| `admin/RestoreDialog/nazvanie-novogo-prostranstva` | Название нового пространства |  | ✔ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest …<br>`e2e/io-p0-roundtrip.spec.ts` archive restore dialog: the administrator chooses a new isolated space as the target (R… |
| `admin/RestoreDialog/v-suschestvuyuschee-prostranstvo` | В существующее пространство |  | ✗ | · | ✗ | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `admin/RestoreDialog/prostranstvo-dlya-vosstanovleniya` | Пространство для восстановления |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `admin/RestoreDialog/vash-parol` | Ваш пароль | **да** | ✔ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest …<br>`e2e/io-p0-roundtrip.spec.ts` archive restore dialog: the administrator chooses a new isolated space as the target (R… |
| `admin/RestoreDialog/ya-proveril-otchet-i-podtverzhdayu-vosstanovleni` | Я проверил отчёт и подтверждаю восстановление |  | ✔ | · | ✗ | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest …<br>`e2e/io-p0-roundtrip.spec.ts` archive restore dialog: the administrator chooses a new isolated space as the target (R… |
| `admin/RestoreDialog/otmena` | Отмена |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/RestoreDialog/vosstanovit` | Восстановить | **да** | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest …<br>`e2e/io-p0-roundtrip.spec.ts` archive restore dialog: the administrator chooses a new isolated space as the target (R… |
| `admin/RestoreDialog/otmena~2` | Отмена |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/RestoreDialog/proverit-arhiv` | Проверить архив | **да** | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … |
| `admin/RestoreDialog/rezultat-vosstanovleniya` | Результат восстановления | **да** | ✔ | ✗ | · | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … |
| `admin/ReportDialog/otchet-o-vosstanovlenii` | Отчёт о восстановлении | **да** | ✗ | ✗ | · | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `admin/ReportDialog/zakryt` | Закрыть |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/ReportDialog/otchet-predvaritelnoy-proverki` | Отчёт предварительной проверки |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/AuditSection/csv` | CSV |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/AuditSection/proverit-celostnost` | Проверить целостность |  | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/acl-p0-admin.spec.ts` ROUTE-06: the auditor reads who changed what in the journal but does not see titles or … |
| `admin/AuditSection/deystvie` | Действие |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `admin/AuditSection/naprimer-user-deactivate` | например, user.deactivate |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `admin/AuditSection/tip-obekta` | Тип объекта |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `admin/AuditSection/id-obekta` | ID объекта |  | ✔ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-admin.spec.ts` ROUTE-06: the auditor reads who changed what in the journal but does not see titles or … |
| `admin/AuditSection/s` | С |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `admin/AuditSection/po` | По |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `admin/AuditSection/sbrosit` | Сбросить | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/AuditSection/primenit` | Применить |  | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/acl-p0-admin.spec.ts` ROUTE-06: the auditor reads who changed what in the journal but does not see titles or … |
| `admin/AuditSection/podrobnosti` | Подробности |  | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/acl-p0-admin.spec.ts` ROUTE-06: the auditor reads who changed what in the journal but does not see titles or … |
| `admin/AuditSection/zagruzit-esche` | Загрузить ещё | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/ExpiringSection/poisk` | Поиск |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `admin/ExpiringSection/period` | Период |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `admin/ExpiringSection/bez-nazvaniya` | (без названия) |  | ✗ | · | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `admin/ExpiringSection/otozvat-dostup` | Отозвать доступ … | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/GroupsSection/svernut` | Свернуть |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/GroupsSection/gruppa` | Группа | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/GroupsSection/otdel` | Отдел |  | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … |
| `admin/GroupsSection/poisk-grupp` | Поиск групп |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `admin/GroupDialog/izmenit` | Изменить «…» | **да** | ✔ | ✗ | · | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … |
| `admin/GroupDialog/otmena` | Отмена |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/GroupDialog/sohranit` | Сохранить | **да** | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … |
| `admin/GroupDialog/nazvanie` | Название |  | ✔ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … |
| `admin/GroupDialog/opisanie` | Описание |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `admin/GroupDialog/vhodit-v-otdel` | Входит в отдел |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `admin/GroupDetail/nazad` | ← Назад |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/GroupDetail/podotdel` | Подотдел |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/GroupDetail/izmenit` | Изменить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/GroupDetail/udalit` | Удалить | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/GroupDetail/rol` | Роль | **да** | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `admin/GroupDetail/do-neobyazatelno` | До (необязательно) |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `admin/GroupDetail/dobavit` | Добавить |  | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … |
| `admin/GroupDetail/rol~2` | Роль … | **да** | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `admin/GroupDetail/isklyuchit` | Исключить … |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/HealthSection/obnovit` | Обновить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/OrgNameCard/nazvanie-organizacii` | Название организации |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `admin/OrgNameCard/pereimenovat` | Переименовать | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/OrgSettingsSection/otmenit-izmeneniya` | Отменить изменения |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/OrgSettingsSection/sohranit` | Сохранить | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/UsersSection/edit` | Изменить профиль и роль | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/UsersSection/transfer` | Перевести в другой отдел… |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/UsersSection/resend` | Отправить приглашение повторно | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/UsersSection/revoke-invite` | Отозвать приглашение | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/UsersSection/reset` | Сбросить пароль | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/UsersSection/sessions` | Завершить все сеансы | **да** | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … |
| `admin/UsersSection/suspend` | Приостановить доступ… | **да** | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … |
| `admin/UsersSection/reactivate` | Восстановить доступ | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/UsersSection/deactivate` | Деактивировать (увольнение)… | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/UsersSection/import-csv` | Импорт CSV | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/UsersSection/dobavit` | Добавить |  | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … |
| `admin/UsersSection/poisk-polzovateley` | Поиск пользователей |  | ✔ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … |
| `admin/UsersSection/status` | Статус |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `admin/UsersSection/tip` | Тип |  | ✔ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest …<br>`e2e/acl-p0-spaces.spec.ts` R-SPACE-001 R-SPACE-010 R-ADMIN-020: a space is created in the UI and a department gets… |
| `admin/UsersSection/rol` | Роль | **да** | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `admin/UsersSection/otdel-ili-gruppa` | Отдел или группа |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `admin/UsersSection/deystviya-s-polzovatelem` | Действия с пользователем … |  | ✔ | · | · | · | · | · | ✗ | · | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … |
| `admin/UsersSection/deystviya` | Действия: … |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/UsersSection/gotovo` | Готово |  | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … |
| `admin/UsersSection/ssylka` | Ссылка |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/CreateUserDialog/polzovatel-sozdan` | Пользователь создан |  | ✔ | ✗ | · | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … |
| `admin/CreateUserDialog/dobavit-esche` | Добавить ещё |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/CreateUserDialog/gotovo` | Готово |  | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … |
| `admin/CreateUserDialog/ssylka-priglashenie` | Ссылка-приглашение | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/CreateUserDialog/novyy-polzovatel` | Новый пользователь |  | ✔ | ✗ | · | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … |
| `admin/CreateUserDialog/otmena` | Отмена |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/CreateUserDialog/sozdat` | Создать | **да** | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-03: space manager route — members and group access → template → tree drag-and-dro…<br>`e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … |
| `admin/CreateUserDialog/sotrudnik` | Сотрудник |  | ✗ | · | ✗ | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `admin/CreateUserDialog/gost` | Гость |  | ✔ | · | ✗ | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … |
| `admin/CreateUserDialog/imya-i-familiya` | Имя и фамилия * |  | ✔ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … |
| `admin/CreateUserDialog/email` | Email * |  | ✔ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … |
| `admin/CreateUserDialog/dolzhnost` | Должность |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `admin/CreateUserDialog/rol-v-organizacii` | Роль в организации | **да** | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `admin/CreateUserDialog/dostup-deystvuet-do` | Доступ действует до * | **да** | ✔ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … |
| `admin/CreateUserDialog/srok-dostupa-neobyazatelno` | Срок доступа (необязательно) | **да** | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `admin/CreateUserDialog/filtr-grupp` | Фильтр групп |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `admin/CreateUserDialog/otdel` | … отдел |  | ✔ | · | ✗ | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-03: space manager route — members and group access → template → tree drag-and-dro…<br>`e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest …<br>`e2e/acl-p0-spaces.spec.ts` R-SPACE-001 R-SPACE-010 R-ADMIN-020: a space is created in the UI and a department gets… |
| `admin/CreateUserDialog/osnovnoy-otdel` | Основной отдел |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `admin/CreateUserDialog/sozdat-ssylku-priglashenie-sotrudnik-sam-zadast` | Создать ссылку-приглашение (сотрудник сам задаст пароль) | **да** | ✗ | · | ✗ | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `admin/CreateUserDialog/zadat-parol-vruchnuyu` | Задать пароль вручную | **да** | ✔ | · | ✗ | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … |
| `admin/CreateUserDialog/parol` | Пароль | **да** | ✔ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-03: space manager route — members and group access → template → tree drag-and-dro…<br>`e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest …<br>`e2e/acl-p0-spaces.spec.ts` R-SPACE-001 R-SPACE-010 R-ADMIN-020: a space is created in the UI and a department gets…<br>… ещё 1 |
| `admin/ImportDialog/propuschennye-stroki` | Пропущенные строки ( … ) |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/ImportDialog/kopirovat-ssylki` | Копировать ссылки |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/ImportDialog/skachat-csv` | Скачать CSV |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/ImportDialog/gotovo` | Готово |  | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … |
| `admin/ImportDialog/nazad-k-dannym` | Назад к данным |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/ImportDialog/importirovat` | Импортировать ( … ) | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/ImportDialog/email-name-department-title-ivanov-example-com-i` | email;name;department;title ivanov@example.com;Иван Иванов;Бухгалтерия;Бухгалтер |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `admin/ImportDialog/otmena` | Отмена |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/ImportDialog/proverit` | Проверить |  | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/editor-p0-clipboard.spec.ts` copy: a text selection, a block and a section of a heading go to the clipboard as text/… |
| `admin/ImportDialog/import-sotrudnikov-iz-csv` | Импорт сотрудников из CSV | **да** | ✗ | ✗ | · | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `admin/EditUserDialog/izmenit` | Изменить: … |  | ✗ | ✗ | · | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `admin/EditUserDialog/otmena` | Отмена |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/EditUserDialog/sohranit` | Сохранить | **да** | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-03: space manager route — members and group access → template → tree drag-and-dro…<br>`e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … |
| `admin/EditUserDialog/imya` | Имя |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `admin/EditUserDialog/dolzhnost` | Должность |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `admin/EditUserDialog/rol-v-organizacii` | Роль в организации | **да** | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `admin/EditUserDialog/osnovnoy-otdel` | Основной отдел |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `admin/EditUserDialog/dostup-deystvuet-do` | Доступ действует до | **да** | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `admin/StatusDialog/deaktivirovat` | Деактивировать …? | **да** | ✔ | ✗ | · | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … |
| `admin/StatusDialog/otmena` | Отмена |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/StatusDialog/deaktivirovat~2` | Деактивировать | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/StatusDialog/prichina-popadet-v-zhurnal-audita` | Причина (попадёт в журнал аудита) |  | ✔ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … |
| `admin/StatusDialog/ya-ponimayu-posledstviya` | Я понимаю последствия |  | ✔ | · | ✗ | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … |
| `admin/TransferDialog/perevod` | Перевод: … |  | ✗ | ✗ | · | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `admin/TransferDialog/otmena` | Отмена |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/TransferDialog/sravnit-dostupy` | Сравнить доступы | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/TransferDialog/primenit` | Применить |  | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … |
| `admin/TransferDialog/otdel` | … отдел |  | ✔ | · | ✗ | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-03: space manager route — members and group access → template → tree drag-and-dro…<br>`e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest …<br>`e2e/acl-p0-spaces.spec.ts` R-SPACE-001 R-SPACE-010 R-ADMIN-020: a space is created in the UI and a department gets… |
| `admin/TransferDialog/sdelat-osnovnym-otdelom` | Сделать « … » основным отделом |  | ✗ | · | ✗ | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `admin/ErrorState/povtorit` | Повторить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/CopyField/kopirovat` | Копировать |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/UserPicker/ochistit-vybor` | Очистить выбор | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/UserPicker/gost` | … … Гость |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `admin/Pager/nazad` | Назад |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `admin/Pager/dalee` | Далее |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |

### app (8/14 покрыто)

| ID | Название | Крит. | ok | пусто | загр | отм | ошиб | офл | прав | 2× | Факт | Тесты |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `app/Authenticated/povtorit` | Повторить |  | ✔ | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/editor-p0-media.spec.ts` pasted image: instant local preview, upload error keeps the block, retry completes it w…<br>`e2e/ui-p0-interaction.spec.ts` R-UI-053: a server that does not answer gives an explanation and a retry instead of an … |
| `app/Authenticated/povtorit~2` | Повторить |  | ✔ | ✗ | ✔ | ✗ | ✔ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/editor-p0-media.spec.ts` pasted image: instant local preview, upload error keeps the block, retry completes it w…<br>`e2e/ui-p0-interaction.spec.ts` R-UI-053: a server that does not answer gives an explanation and a retry instead of an … |
| `app/Authenticated/route.root` | / | **да** | ✔ | ✗ | ✔ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/a11y.spec.ts` keyboard only: quick switcher, help, dialogs close with Esc and return focus (UX-136, S…<br>`e2e/a11y.spec.ts` pixel baselines for stable screens (R-QA-008, AT-89)<br>`e2e/a11y.spec.ts` real 200% browser zoom (1280x800 at 2x = 640x400 CSS px) keeps every key screen usable …<br>… ещё 108 |
| `app/Authenticated/route.p-pageid` | /p/:pageId | **да** | ✔ | ✗ | ✗ | ✔ | ✔ | ✔ | ✔ | · | NO RUN DATA | `e2e/a11y.spec.ts` keyboard only: quick switcher, help, dialogs close with Esc and return focus (UX-136, S…<br>`e2e/a11y.spec.ts` real 200% browser zoom (1280x800 at 2x = 640x400 CSS px) keeps every key screen usable …<br>`e2e/a11y.spec.ts` reduced motion: animations and transitions are effectively disabled (R-A11Y-002, AT-82)<br>… ещё 37 |
| `app/Authenticated/route.p-pageid-slug` | /p/:pageId/:slug | **да** | ✗ | ✗ | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `app/Authenticated/route.s-spaceid` | /s/:spaceId | **да** | ✔ | ✗ | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-01: employee route — login → own spaces → regulation → search → one-click article…<br>`e2e/acl-p0-routes.spec.ts` ROUTE-03: space manager route — members and group access → template → tree drag-and-dro…<br>`e2e/acl-p0-spaces.spec.ts` R-SPACE-001 R-SPACE-010 R-ADMIN-020: a space is created in the UI and a department gets… |
| `app/Authenticated/route.search` | /search | **да** | ✔ | ✗ | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-01: employee route — login → own spaces → regulation → search → one-click article…<br>`e2e/collab.spec.ts` search finds a page by a word from its body and jumps to the block (V16-S01, R-SEARCH-005) |
| `app/Authenticated/route.trash` | /trash | **да** | ✔ | ✗ | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-03: space manager route — members and group access → template → tree drag-and-dro… |
| `app/Authenticated/route.templates` | /templates | **да** | ✗ | ✗ | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `app/Authenticated/route.import` | /import | **да** | ✔ | ✗ | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/io-p0-roundtrip.spec.ts` DOCX import → edit in the editor → DOCX and Markdown export from the page menu keep the…<br>`e2e/io-p0-roundtrip.spec.ts` Markdown file import → edit → Markdown export round trip (E225, R-EXPORT-012) |
| `app/Authenticated/route.settings` | /settings | **да** | ✗ | ✗ | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `app/Authenticated/route.admin` | /admin | **да** | ✗ | ✗ | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `app/App/pereyti-k-soderzhimomu` | Перейти к содержимому |  | ✗ | · | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `app/App/route.invite-token` | /invite/:token | **да** | ✗ | ✗ | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |

### auth (8/13 покрыто)

| ID | Название | Крит. | ok | пусто | загр | отм | ошиб | офл | прав | 2× | Факт | Тесты |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `auth/LoginPage/elektronnaya-pochta` | Электронная почта |  | ✔ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/a11y.spec.ts` keyboard only: quick switcher, help, dialogs close with Esc and return focus (UX-136, S…<br>`e2e/a11y.spec.ts` pixel baselines for stable screens (R-QA-008, AT-89)<br>`e2e/a11y.spec.ts` real 200% browser zoom (1280x800 at 2x = 640x400 CSS px) keeps every key screen usable …<br>… ещё 108 |
| `auth/LoginPage/parol` | Пароль | **да** | ✔ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/a11y.spec.ts` keyboard only: quick switcher, help, dialogs close with Esc and return focus (UX-136, S…<br>`e2e/a11y.spec.ts` pixel baselines for stable screens (R-QA-008, AT-89)<br>`e2e/a11y.spec.ts` real 200% browser zoom (1280x800 at 2x = 640x400 CSS px) keeps every key screen usable …<br>… ещё 108 |
| `auth/LoginPage/kod-iz-prilozheniya-autentifikatora` | Код из приложения-аутентификатора |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `auth/LoginPage/podtverdit` | Подтвердить | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `auth/LoginPage/voyti-cherez-korporativnyy-sso` | Войти через корпоративный SSO | **да** | ✗ | · | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `auth/SetupPage/nazvanie-organizacii` | Название организации |  | ✔ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/a11y.spec.ts` keyboard only: quick switcher, help, dialogs close with Esc and return focus (UX-136, S…<br>`e2e/a11y.spec.ts` pixel baselines for stable screens (R-QA-008, AT-89)<br>`e2e/a11y.spec.ts` real 200% browser zoom (1280x800 at 2x = 640x400 CSS px) keeps every key screen usable …<br>… ещё 108 |
| `auth/SetupPage/vashe-imya` | Ваше имя |  | ✔ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/a11y.spec.ts` keyboard only: quick switcher, help, dialogs close with Esc and return focus (UX-136, S…<br>`e2e/a11y.spec.ts` pixel baselines for stable screens (R-QA-008, AT-89)<br>`e2e/a11y.spec.ts` real 200% browser zoom (1280x800 at 2x = 640x400 CSS px) keeps every key screen usable …<br>… ещё 108 |
| `auth/SetupPage/elektronnaya-pochta` | Электронная почта |  | ✔ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/a11y.spec.ts` keyboard only: quick switcher, help, dialogs close with Esc and return focus (UX-136, S…<br>`e2e/a11y.spec.ts` pixel baselines for stable screens (R-QA-008, AT-89)<br>`e2e/a11y.spec.ts` real 200% browser zoom (1280x800 at 2x = 640x400 CSS px) keeps every key screen usable …<br>… ещё 108 |
| `auth/SetupPage/parol` | Пароль | **да** | ✔ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/a11y.spec.ts` keyboard only: quick switcher, help, dialogs close with Esc and return focus (UX-136, S…<br>`e2e/a11y.spec.ts` pixel baselines for stable screens (R-QA-008, AT-89)<br>`e2e/a11y.spec.ts` real 200% browser zoom (1280x800 at 2x = 640x400 CSS px) keeps every key screen usable …<br>… ещё 108 |
| `auth/SetupPage/sozdat-organizaciyu` | Создать организацию | **да** | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/a11y.spec.ts` keyboard only: quick switcher, help, dialogs close with Esc and return focus (UX-136, S…<br>`e2e/a11y.spec.ts` pixel baselines for stable screens (R-QA-008, AT-89)<br>`e2e/a11y.spec.ts` real 200% browser zoom (1280x800 at 2x = 640x400 CSS px) keeps every key screen usable …<br>… ещё 108 |
| `auth/InvitePage/kak-k-vam-obraschatsya-neobyazatelno` | Как к вам обращаться (необязательно) |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `auth/InvitePage/novyy-parol` | Новый пароль | **да** | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `auth/InvitePage/prodolzhit` | Продолжить |  | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/io-p0-roundtrip.spec.ts` archive restore dialog: the administrator chooses a new isolated space as the target (R… |

### common (1/33 покрыто)

| ID | Название | Крит. | ok | пусто | загр | отм | ошиб | офл | прав | 2× | Факт | Тесты |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `common/DocPreview/vypolneno` | Выполнено |  | ✗ | · | ✗ | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `common/DocPreview/podrobnee` | Подробнее |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `common/ErrorBoundary/povtorit` | Повторить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `common/ErrorBoundary/obnovit-stranicu` | Обновить страницу |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `common/ErrorBoundary/podrobnosti` | Подробности |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `common/IconPicker/poisk-ikonki` | Поиск иконки |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `common/IconPicker/ubrat` | Убрать |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `common/ViewerInner/umenshit` | Уменьшить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `common/ViewerInner/x` | … % |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `common/ViewerInner/uvelichit` | Увеличить |  | ✔ | ✗ | ✗ | ✔ | ✗ | ✗ | ✔ | ✔ | NO RUN DATA | `e2e/content.spec.ts` image: upload via file chooser, resize presets, caption, full-screen viewer with zoom |
| `common/ViewerInner/vpisat-v-ekran` | Вписать в экран |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `common/ViewerInner/povernut` | Повернуть |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `common/ViewerInner/otkryt-original` | Открыть оригинал |  | ✗ | · | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `common/ViewerInner/skachat` | Скачать |  | ✗ | · | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `common/ViewerInner/zakryt` | Закрыть |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `common/ViewerInner/predyduschee-izobrazhenie` | Предыдущее изображение |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `common/ViewerInner/sleduyuschee-izobrazhenie` | Следующее изображение |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `common/MoveDialog/peremestit` | Переместить «…» | **да** | ✗ | ✗ | · | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `common/MoveDialog/poisk-stranicy-naznacheniya` | Поиск страницы назначения |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `common/MoveDialog/bez-nazvaniya-vnutr` | Без названия внутрь |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `common/MoveDialog/prostranstva` | Пространства |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `common/MoveDialog/peremestit-syuda` | Переместить сюда | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `common/MoveDialog/vnutr` | Внутрь |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `common/MoveDialog/otkryt` | Открыть «…» |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `common/MoveDialog/x` | 🗂 … |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `common/NotificationsPopover/prochitat-vse` | Прочитать все |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `common/NotificationsPopover/x` | … «…» · … |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `common/OcrDialog/tekst-na-izobrazhenii` | Текст на изображении |  | ✗ | ✗ | · | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `common/OcrDialog/raspoznat-zanovo` | Распознать заново |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `common/OcrDialog/kopirovat` | Копировать |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `common/OcrDialog/sohranit-ispravleniya` | Сохранить исправления | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `common/OcrDialog/raspoznannyy-tekst` | Распознанный текст |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `common/useEvents/otkryt-versiyu` | Открыть версию … | **да** | ✗ | · | · | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |

### editor (39/193 покрыто)

| ID | Название | Крит. | ok | пусто | загр | отм | ошиб | офл | прав | 2× | Факт | Тесты |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `editor/FatalBanner/skachat-lokalnuyu-kopiyu-markdown` | Скачать локальную копию (Markdown) |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/EditorInner/vernut-moyu-versiyu` | Вернуть мою версию | **да** | ✔ | · | · | ✔ | ✗ | ✔ | ✗ | ✗ | NO RUN DATA | `e2e/collab-p0-editing.spec.ts` a block is moved by one editor while another edits it: the edit is kept as a conflict c…<br>`e2e/collab-p0-editing.spec.ts` undo of a block move never silently drops a colleague's edits (UX13-10, R-HISTORY-011)<br>`e2e/conflict.spec.ts` edit vs concurrent delete: the editor keeps a conflict copy and can put the block back … |
| `editor/EditorInner/nazvanie-stranicy` | Название страницы |  | ✔ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/collab-p0-editing.spec.ts` a block is moved by one editor while another edits it: the edit is kept as a conflict c…<br>`e2e/collab-p0-editing.spec.ts` undo of a block move never silently drops a colleague's edits (UX13-10, R-HISTORY-011)<br>`e2e/conflict.spec.ts` edit vs concurrent delete: the editor keeps a conflict copy and can put the block back …<br>… ещё 1 |
| `editor/EditorInner/otkryt` | Открыть |  | ✗ | · | · | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/ReadOnlyCommentButton/kommentirovat` | Комментировать |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/FindBar/nayti-na-stranice` | Найти на странице |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `editor/FindBar/predyduschee` | Предыдущее |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/FindBar/sleduyuschee` | Следующее |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/FindBar/zakryt-poisk` | Закрыть поиск |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/EmbedDialog/video-ili-ssylka` | Видео или ссылка |  | ✗ | ✗ | · | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `editor/EmbedDialog/otmena` | Отмена |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/EmbedDialog/vstavit` | Вставить |  | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/editor-p0-media.spec.ts` image by URL: dialog with preview, internal addresses refused, the image is stored as a… |
| `editor/EmbedDialog/https-rutube-ru-video-ili-lyubaya-ssylka` | https://rutube.ru/video/… или любая ссылка |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `editor/MathDialog/formula` | Формула |  | ✗ | ✗ | · | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `editor/MathDialog/otmena` | Отмена |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/MathDialog/gotovo` | Готово |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/MathDialog/formula-latex` | Формула LaTeX |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `editor/TouchInsertButton/vstavit-blok` | Вставить блок |  | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/ui-p0-touch.spec.ts` UX-146, R-UI-058: on a touch phone the floating "+" inserts a block without hover |
| `editor/ImageUrlDialog/izobrazhenie-po-ssylke` | Изображение по ссылке |  | ✔ | ✗ | · | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/editor-p0-media.spec.ts` image by URL: dialog with preview, internal addresses refused, the image is stored as a… |
| `editor/ImageUrlDialog/otmena` | Отмена |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/ImageUrlDialog/zagruzka` | Загрузка… |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/ImageUrlDialog/https-example-ru-schema-png` | https://example.ru/schema.png |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `editor/PagePicker/poisk-stranicy` | Поиск страницы |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `editor/PagePicker/bez-nazvaniya` | Без названия |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `editor/PagePicker/nazad` | Назад |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/PagePicker/tekst` | Текст — |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/copy/tekst-dlya-kopirovaniya` | Текст для копирования |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `editor/commands/text` | Текст |  | ✗ | · | · | ✗ | · | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `editor/commands/h1` | Заголовок 1 |  | ✔ | · | · | ✗ | · | ✗ | ✗ | · | NO RUN DATA | `e2e/editor-p0-blocks.spec.ts` text blocks: paragraph, H1–H6, lead, quote and divider are created from the "/" menu; b… |
| `editor/commands/h2` | Заголовок 2 |  | ✔ | · | · | ✗ | · | ✗ | ✗ | · | NO RUN DATA | `e2e/editor-p0-blocks.spec.ts` text blocks: paragraph, H1–H6, lead, quote and divider are created from the "/" menu; b… |
| `editor/commands/h3` | Заголовок 3 |  | ✔ | · | · | ✗ | · | ✗ | ✗ | · | NO RUN DATA | `e2e/editor-p0-blocks.spec.ts` text blocks: paragraph, H1–H6, lead, quote and divider are created from the "/" menu; b… |
| `editor/commands/h4` | Заголовок 4 |  | ✔ | · | · | ✗ | · | ✗ | ✗ | · | NO RUN DATA | `e2e/editor-p0-blocks.spec.ts` text blocks: paragraph, H1–H6, lead, quote and divider are created from the "/" menu; b… |
| `editor/commands/h5` | Заголовок 5 |  | ✔ | · | · | ✗ | · | ✗ | ✗ | · | NO RUN DATA | `e2e/editor-p0-blocks.spec.ts` text blocks: paragraph, H1–H6, lead, quote and divider are created from the "/" menu; b… |
| `editor/commands/h6` | Заголовок 6 |  | ✔ | · | · | ✗ | · | ✗ | ✗ | · | NO RUN DATA | `e2e/editor-p0-blocks.spec.ts` text blocks: paragraph, H1–H6, lead, quote and divider are created from the "/" menu; b… |
| `editor/commands/lead` | Вводный абзац |  | ✔ | · | · | ✗ | · | ✗ | ✗ | · | NO RUN DATA | `e2e/editor-p0-blocks.spec.ts` text blocks: paragraph, H1–H6, lead, quote and divider are created from the "/" menu; b… |
| `editor/commands/bullet` | Маркированный список |  | ✗ | · | · | ✗ | · | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `editor/commands/ordered` | Нумерованный список |  | ✗ | · | · | ✗ | · | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `editor/commands/todo` | Чек-лист |  | ✗ | · | · | ✗ | · | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `editor/commands/toggle` | Раскрывающийся блок |  | ✗ | · | · | ✗ | · | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `editor/commands/table` | Таблица |  | ✔ | ✔ | · | ✗ | · | ✔ | ✗ | · | NO RUN DATA | `e2e/collab-p0-editing.spec.ts` two editors change a paragraph, one table and the structure while one loses the connect…<br>`e2e/editor-p0-table.spec.ts` table structure: insert/delete rows and columns, header row/column, merge and split, al…<br>`e2e/editor.spec.ts` slash menu inserts a table and a callout; "> " creates a toggle<br>… ещё 1 |
| `editor/commands/callout` | Выделенный блок |  | ✔ | · | · | ✗ | · | ✗ | ✗ | · | NO RUN DATA | `e2e/editor.spec.ts` slash menu inserts a table and a callout; "> " creates a toggle |
| `editor/commands/quote` | Цитата |  | ✔ | · | · | ✗ | · | ✗ | ✗ | · | NO RUN DATA | `e2e/editor-p0-blocks.spec.ts` text blocks: paragraph, H1–H6, lead, quote and divider are created from the "/" menu; b… |
| `editor/commands/code` | Блок кода |  | ✗ | · | · | ✗ | · | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `editor/commands/divider` | Разделитель |  | ✔ | · | · | ✗ | · | ✗ | ✗ | · | NO RUN DATA | `e2e/editor-p0-blocks.spec.ts` text blocks: paragraph, H1–H6, lead, quote and divider are created from the "/" menu; b… |
| `editor/commands/cols2` | Две колонки |  | ✗ | · | · | ✗ | · | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `editor/commands/cols3` | Три колонки |  | ✗ | · | · | ✗ | · | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `editor/commands/image` | Изображение |  | ✔ | · | · | ✔ | · | ✗ | ✔ | ✔ | NO RUN DATA | `e2e/clipboard.spec.ts` image viewer: click on a selected image opens it; zoom is limited to 10–800 % (R-MEDIA-…<br>`e2e/content.spec.ts` image: upload via file chooser, resize presets, caption, full-screen viewer with zoom<br>`e2e/editor-p0-media.spec.ts` image by URL: dialog with preview, internal addresses refused, the image is stored as a… |
| `editor/commands/image-url` | Изображение по ссылке |  | ✔ | · | · | ✗ | · | ✗ | ✗ | · | NO RUN DATA | `e2e/editor-p0-media.spec.ts` image by URL: dialog with preview, internal addresses refused, the image is stored as a… |
| `editor/commands/file` | Файл |  | ✗ | · | · | ✗ | · | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `editor/commands/video` | Видео или ссылка |  | ✗ | · | · | ✗ | · | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `editor/commands/subpage` | Вложенная страница |  | ✗ | · | · | ✗ | · | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `editor/commands/pagelink` | Ссылка на страницу |  | ✗ | · | · | ✗ | · | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `editor/commands/mention` | Упоминание |  | ✗ | · | · | ✗ | · | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `editor/commands/toc` | Оглавление |  | ✗ | · | · | ✗ | · | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `editor/commands/synced` | Синхронизированный блок |  | ✗ | · | · | ✗ | · | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `editor/commands/collection` | Реестр (база данных) |  | ✔ | · | · | ✗ | · | ✗ | ✗ | · | NO RUN DATA | `e2e/clipboard.spec.ts` registry block from the slash menu shows the new collection (R-COLLECTION-001) |
| `editor/commands/math` | Формула |  | ✗ | · | · | ✗ | · | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `editor/commands/mermaid` | Схема (Mermaid) |  | ✗ | · | · | ✗ | · | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `editor/commands/emoji` | Эмодзи |  | ✗ | · | · | ✗ | · | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `editor/suggest/items.bez-nazvaniya` | Без названия |  | ✗ | · | · | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/suggest/items.bez-nazvaniya~2` | Без названия |  | ✗ | · | · | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/suggest/new` | Создать вложенную страницу «…» | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/BlockHandle/turn` | Превратить в |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `editor/BlockHandle/color` | Цвет текста |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `editor/BlockHandle/none` | По умолчанию |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/BlockHandle/dup` | Дублировать | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/BlockHandle/up` | Переместить вверх | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/BlockHandle/down` | Переместить вниз | **да** | ✔ | ✗ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/editor-p0-blocks.spec.ts` moving blocks: one block by keyboard and block menu, several selected blocks together —… |
| `editor/BlockHandle/move-page` | Переместить на страницу… | **да** | ✔ | ✗ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/editor-p0-nav.spec.ts` blocks move to another page: removed here only after the target saved them, order, cont… |
| `editor/BlockHandle/copy` | Копировать блок |  | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/editor-p0-clipboard.spec.ts` copy: a text selection, a block and a section of a heading go to the clipboard as text/… |
| `editor/BlockHandle/copy-section` | Копировать раздел |  | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/editor-p0-clipboard.spec.ts` copy: a text selection, a block and a section of a heading go to the clipboard as text/… |
| `editor/BlockHandle/link` | Копировать ссылку на блок |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/BlockHandle/md` | Копировать как Markdown |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/BlockHandle/comment` | Комментировать |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/BlockHandle/del` | Удалить | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/BlockHandle/dobavit-blok-nizhe` | Добавить блок ниже |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/BlockHandle/deystviya-s-blokom` | Действия с блоком |  | ✔ | · | · | ✔ | · | · | ✗ | · | NO RUN DATA | `e2e/editor-p0-blocks.spec.ts` moving blocks: one block by keyboard and block menu, several selected blocks together —…<br>`e2e/editor-p0-clipboard.spec.ts` copy: a text selection, a block and a section of a heading go to the clipboard as text/…<br>`e2e/editor-p0-nav.spec.ts` blocks move to another page: removed here only after the target saved them, order, cont… |
| `editor/BlockHandle/peretaschite-ili-nazhmite-dlya-deystviy` | Перетащите или нажмите для действий |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/BubbleToolbar/p` | Текст |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/BubbleToolbar/h1` | Заголовок 1 |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/BubbleToolbar/h2` | Заголовок 2 |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/BubbleToolbar/h3` | Заголовок 3 |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/BubbleToolbar/ul` | Маркированный список |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/BubbleToolbar/ol` | Нумерованный список |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/BubbleToolbar/todo` | Чек-лист |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/BubbleToolbar/quote` | Цитата |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/BubbleToolbar/code` | Блок кода |  | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/clipboard.spec.ts` converting formatted text to a code block asks first and keeps the text (R-EDITOR-067, … |
| `editor/BubbleToolbar/callout` | Выделенный блок |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/BubbleToolbar/adres-ssylki` | Адрес ссылки |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `editor/BubbleToolbar/tip-bloka` | Тип блока |  | ✔ | · | · | · | · | · | ✗ | · | NO RUN DATA | `e2e/clipboard.spec.ts` converting formatted text to a code block asks first and keeps the text (R-EDITOR-067, … |
| `editor/BubbleToolbar/cvet` | Цвет |  | ✗ | · | · | · | · | · | ✗ | · | NO RUN DATA | **нет теста** |
| `editor/BubbleToolbar/c-default` | По умолчанию |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/BubbleToolbar/h-none` | Без фона |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/BubbleToolbar/cvet-teksta-i-fona` | Цвет текста и фона |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/BubbleToolbar/esche` | Ещё |  | ✗ | · | · | · | · | · | ✗ | · | NO RUN DATA | **нет теста** |
| `editor/BubbleToolbar/left` | По левому краю |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/BubbleToolbar/center` | По центру |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/BubbleToolbar/right` | По правому краю | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/BubbleToolbar/justify` | По ширине |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/BubbleToolbar/size` | Размер шрифта |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `editor/BubbleToolbar/sz-default` | По умолчанию |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/BubbleToolbar/font` | Шрифт |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `editor/BubbleToolbar/f-default` | Основной |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/BubbleToolbar/f-serif` | С засечками |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/BubbleToolbar/f-mono` | Моноширинный |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/BubbleToolbar/sub` | Нижний индекс |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/BubbleToolbar/sup` | Верхний индекс |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/BubbleToolbar/math` | Формула из выделения |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/BubbleToolbar/clear` | Очистить форматирование | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/BubbleToolbar/esche~2` | Ещё |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/PasteOptionsMenu/zakryt-parametry-vstavki` | Закрыть параметры вставки |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/TableToolbar/cvet-yacheyki` | Цвет ячейки |  | ✗ | · | · | · | · | · | ✗ | · | NO RUN DATA | **нет теста** |
| `editor/TableToolbar/none` | Без заливки |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/TableToolbar/zalivka-yacheek` | Заливка ячеек |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/TableToolbar/vyravnivanie` | Выравнивание |  | ✔ | ✔ | · | · | · | · | ✗ | · | NO RUN DATA | `e2e/editor-p0-table.spec.ts` table structure: insert/delete rows and columns, header row/column, merge and split, al… |
| `editor/TableToolbar/l` | По левому краю |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/TableToolbar/c` | По центру |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/TableToolbar/r` | По правому краю | **да** | ✔ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/editor-p0-table.spec.ts` table structure: insert/delete rows and columns, header row/column, merge and split, al… |
| `editor/TableToolbar/t` | По верху |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/TableToolbar/m` | По середине |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/TableToolbar/b` | По низу |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/TableToolbar/vyravnivanie-v-yacheykah` | Выравнивание в ячейках |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/TableToolbar/tablica` | Таблица |  | ✔ | · | · | · | · | · | ✗ | · | NO RUN DATA | `e2e/editor-p0-table.spec.ts` table data: copy a cell range as TSV, paste a range from Excel, move rows and columns, …<br>`e2e/editor-p0-table.spec.ts` table structure: insert/delete rows and columns, header row/column, merge and split, al… |
| `editor/TableToolbar/mrup` | Переместить строку вверх | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/TableToolbar/mrdown` | Переместить строку вниз | **да** | ✔ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/editor-p0-table.spec.ts` table data: copy a cell range as TSV, paste a range from Excel, move rows and columns, … |
| `editor/TableToolbar/mcleft` | Переместить столбец влево | **да** | ✔ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/editor-p0-table.spec.ts` table data: copy a cell range as TSV, paste a range from Excel, move rows and columns, … |
| `editor/TableToolbar/mcright` | Переместить столбец вправо | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/TableToolbar/sasc` | Сортировать по возрастанию |  | ✔ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/editor-p0-table.spec.ts` table data: copy a cell range as TSV, paste a range from Excel, move rows and columns, … |
| `editor/TableToolbar/sdesc` | Сортировать по убыванию |  | ✔ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/editor-p0-table.spec.ts` table data: copy a cell range as TSV, paste a range from Excel, move rows and columns, … |
| `editor/TableToolbar/hrow` | Строка заголовков |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/TableToolbar/hcol` | Столбец заголовков |  | ✔ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/editor-p0-table.spec.ts` table structure: insert/delete rows and columns, header row/column, merge and split, al… |
| `editor/TableToolbar/drow` | Удалить строку | **да** | ✔ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/editor-p0-table.spec.ts` table structure: insert/delete rows and columns, header row/column, merge and split, al… |
| `editor/TableToolbar/dcol` | Удалить столбец | **да** | ✔ | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/editor-p0-table.spec.ts` table structure: insert/delete rows and columns, header row/column, merge and split, al… |
| `editor/TableToolbar/tsv` | Копировать для Excel |  | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/clipboard.spec.ts` table copy for Excel puts TSV and an HTML table on the clipboard (R-CLIPBOARD-006, R-CL… |
| `editor/TableToolbar/md` | Копировать как Markdown |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/TableToolbar/del` | Удалить таблицу | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/TableToolbar/esche` | Ещё |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/LoadedImageView/po-levomu-krayu` | По левому краю |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/LoadedImageView/po-centru` | По центру |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/LoadedImageView/po-pravomu-krayu` | По правому краю | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/LoadedImageView/na-vsyu-shirinu` | На всю ширину |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/LoadedImageView/x` | … % |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/LoadedImageView/podpis` | Подпись |  | ✔ | ✗ | ✗ | ✔ | ✗ | ✗ | ✔ | ✔ | NO RUN DATA | `e2e/content.spec.ts` image: upload via file chooser, resize presets, caption, full-screen viewer with zoom |
| `editor/LoadedImageView/alternativnyy-tekst` | Альтернативный текст |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/LoadedImageView/raspoznannyy-tekst-ocr` | Распознанный текст (OCR) |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/LoadedImageView/zamenit` | Заменить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/LoadedImageView/otkryt-na-ves-ekran` | Открыть на весь экран |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/LoadedImageView/skachat-original` | Скачать оригинал |  | ✗ | · | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `editor/LoadedImageView/udalit` | Удалить | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/LoadedImageView/povtorit` | Повторить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/LoadedImageView/alternativnyy-tekst~2` | Альтернативный текст |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `editor/LoadedImageView/podpis-k-izobrazheniyu` | Подпись к изображению |  | ✔ | ✔ | · | ✔ | ✗ | ✗ | ✔ | ✔ | NO RUN DATA | `e2e/content.spec.ts` image: upload via file chooser, resize presets, caption, full-screen viewer with zoom<br>`e2e/io-p0-roundtrip.spec.ts` DOCX import → edit in the editor → DOCX and Markdown export from the page menu keep the… |
| `editor/UploadPlaceholder/povtorit` | Повторить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/UploadPlaceholder/otmenit` | Отменить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/CalloutView/vid-bloka` | Вид блока |  | ✗ | · | · | · | · | · | ✗ | · | NO RUN DATA | **нет теста** |
| `editor/CalloutView/icon` | Свой значок… |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/CalloutView/izmenit-vid-vydelennogo-bloka` | Изменить вид выделенного блока |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/LoadedFileView/predprosmotr` | Предпросмотр |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/LoadedFileView/otkryt` | Открыть |  | ✗ | · | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `editor/LoadedFileView/skachat` | Скачать |  | ✗ | · | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `editor/LoadedFileView/vid` | Вид |  | ✗ | · | · | · | · | · | ✗ | · | NO RUN DATA | **нет теста** |
| `editor/LoadedFileView/compact` | Компактно |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/LoadedFileView/card` | Карточкой |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/LoadedFileView/vid-fayla` | Вид файла |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/EmbedView/ssylka` | Ссылка |  | ✗ | · | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `editor/MermaidView/skryt-kod` | Скрыть код |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/TocView/bez-nazvaniya` | Без названия |  | ✗ | · | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `editor/SyncedBlockView/stranicey` | страницей |  | ✗ | · | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `editor/SyncedBlockView/ubrat-blok` | Убрать блок |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/CollectionBlockView/otkryt` | Открыть |  | ✗ | · | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `editor/CollectionMini/bez-nazvaniya` | Без названия |  | ✗ | · | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `editor/CodeBlockView/yazyk-koda` | Язык кода |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `editor/CodeBlockView/skopirovano` | Скопировано |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `editor/palette/text-colors.gray` | Серый |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `editor/palette/text-colors.brown` | Коричневый |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `editor/palette/text-colors.orange` | Оранжевый |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `editor/palette/text-colors.yellow` | Жёлтый |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `editor/palette/text-colors.green` | Зелёный |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `editor/palette/text-colors.blue` | Синий |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `editor/palette/text-colors.purple` | Фиолетовый |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `editor/palette/text-colors.pink` | Розовый |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `editor/palette/text-colors.red` | Красный |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `editor/palette/text-colors.teal` | Бирюзовый |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `editor/palette/highlights.gray` | Серый фон |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `editor/palette/highlights.brown` | Коричневый фон |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `editor/palette/highlights.orange` | Оранжевый фон |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `editor/palette/highlights.yellow` | Жёлтый фон |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `editor/palette/highlights.green` | Зелёный фон |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `editor/palette/highlights.blue` | Синий фон |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `editor/palette/highlights.purple` | Фиолетовый фон |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `editor/palette/highlights.pink` | Розовый фон |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `editor/palette/highlights.red` | Красный фон |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `editor/palette/highlights.teal` | Бирюзовый фон |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |

### help (1/9 покрыто)

| ID | Название | Крит. | ok | пусто | загр | отм | ошиб | офл | прав | 2× | Факт | Тесты |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `help/HelpCenter/spravka` | Справка |  | ✔ | ✔ | · | ✔ | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/a11y.spec.ts` keyboard only: quick switcher, help, dialogs close with Esc and return focus (UX-136, S…<br>`e2e/a11y.spec.ts` pixel baselines for stable screens (R-QA-008, AT-89)<br>`e2e/editor-p0-core.spec.ts` key matrix: Enter, Enter on empty item, Tab/Shift+Tab, Backspace at the start and on em… |
| `help/HelpCenter/poisk-po-spravke` | Поиск по справке |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `help/HelpCenter/pokazyvat-podskazki-dlya-novichkov` | Показывать подсказки для новичков |  | ✗ | · | ✗ | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `help/Onboarding/slash` | Команды через «/» |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `help/Onboarding/drag` | Перемещение блоков |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `help/Onboarding/tree` | Структура базы знаний |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `help/OnboardingHints/zakryt-podskazku` | Закрыть подсказку |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `help/OnboardingHints/ponyatno` | Понятно |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `help/OnboardingHints/ne-pokazyvat-podskazki` | Не показывать подсказки |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |

### home (0/12 покрыто)

| ID | Название | Крит. | ok | пусто | загр | отм | ошиб | офл | прав | 2× | Факт | Тесты |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `home/ErrorState/povtorit` | Повторить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `home/PageRow/bez-nazvaniya` | Без названия … |  | ✗ | · | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `home/Home/prodolzhit` | Продолжить: … |  | ✗ | · | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `home/Home/novaya-stranica-v-lichnom-prostranstve` | Новая страница В личном пространстве | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `home/Home/iz-shablona-reglament-instrukciya-faq` | Из шаблона Регламент, инструкция, FAQ… |  | ✗ | · | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `home/Home/import-docx-markdown-csv-xlsx` | Импорт DOCX, Markdown, CSV, XLSX | **да** | ✗ | · | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `home/Home/poisk-po-tekstu-i-izobrazheniyam` | Поиск По тексту и изображениям |  | ✗ | · | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `home/Home/sozdat-pervuyu-stranicu` | Создать первую страницу | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `home/Home/importirovat-dokumenty` | Импортировать документы | **да** | ✗ | · | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `home/Home/otkrytye-mnoy` | Открытые мной |  | ✗ | ✗ | · | · | · | · | ✗ | · | NO RUN DATA | **нет теста** |
| `home/Home/izmenennye` | Изменённые |  | ✗ | ✗ | · | · | · | · | ✗ | · | NO RUN DATA | **нет теста** |
| `home/Home/lichnoe-prostranstvo-chernoviki-i-lichnye-zametk` | 🏠 Личное пространство Черновики и личные заметки |  | ✗ | · | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |

### import (1/37 покрыто)

| ID | Название | Крит. | ok | пусто | загр | отм | ошиб | офл | прав | 2× | Факт | Тесты |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `import/LocationPicker/povtorit` | Повторить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `import/LocationPicker/prostranstvo` | Пространство |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `import/LocationPicker/kuda-pomestit` | Куда поместить |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `import/ImportPage/peretaschite-fayly-syuda-ili-nazhmite-chtoby-vyb` | Перетащите файлы сюда или нажмите, чтобы выбрать DOCX · MD · ZIP с Markdown · HTML · CSV · XLSX |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `import/ImportPage/ubrat` | Убрать … |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `import/ImportPage/parametry-chteniya-csv` | Параметры чтения CSV |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `import/ImportPage/kodirovka` | Кодировка |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `import/ImportPage/razdelitel` | Разделитель |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `import/ImportPage/povtorit-zagruzku` | Повторить загрузку |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `import/ImportPage/otmenit` | Отменить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `import/ImportPage/otmenit~2` | Отменить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `import/ImportPage/povtorit` | Повторить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `import/ImportPage/povtorit~2` | Повторить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `import/ImportPage/izmenit-vybor` | Изменить выбор |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `import/ImportPage/oshibka` | … ошибка |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `import/ImportPage/izmenit-vybor~2` | Изменить выбор |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `import/ImportPage/bez-nazvaniya-bl-tabl-izobr` | Без названия … бл. · … табл. · … изобр. |  | ✗ | · | ✗ | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `import/ImportPage/list` | Лист |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `import/ImportPage/ves-list-ili-naprimer-b2-e40` | весь лист, или например B2:E40 |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `import/ImportPage/kodirovka~2` | Кодировка |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `import/ImportPage/razdelitel~2` | Разделитель |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `import/ImportPage/sozdat` | Создать |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `import/ImportPage/kuda` | Куда |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `import/ImportPage/rezhim` | Режим |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `import/ImportPage/klyuchevoy-stolbec-nazvanie-zapisi` | Ключевой столбец (название записи) |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `import/ImportPage/nazvanie` | Название |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `import/ImportPage/pervaya-stroka-zagolovki-stolbcov` | Первая строка — заголовки столбцов |  | ✔ | · | ✗ | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/collab.spec.ts` history: save a version, change text, restore the version (R-HISTORY-004, UX13-14, UX21… |
| `import/ImportPage/perechitat` | Перечитать |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `import/ImportPage/tip-stolbca` | Тип столбца … |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `import/ImportPage/probnyy-progon` | Пробный прогон |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `import/ImportPage/podrobnee` | Подробнее |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `import/ImportPage/otmenit-import` | Отменить импорт | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `import/ImportPage/povtorit-import` | Повторить импорт | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `import/ImportPage/bez-nazvaniya` | Без названия |  | ✗ | · | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `import/ImportPage/importirovat-esche` | Импортировать ещё | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `import/ImportPage/k-prostranstvu` | К пространству |  | ✗ | · | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `import/ImportPage/otkryt` | Открыть |  | ✗ | · | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |

### page (34/149 покрыто)

| ID | Название | Крит. | ok | пусто | загр | отм | ошиб | офл | прав | 2× | Факт | Тесты |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `page/CommentsPanel/zakryt-kommentarii` | Закрыть комментарии |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/CommentsPanel/otkrytye` | Открытые · … |  | ✗ | ✗ | · | · | · | · | ✗ | · | NO RUN DATA | **нет теста** |
| `page/CommentsPanel/reshennye` | Решённые · … |  | ✗ | ✗ | · | · | · | · | ✗ | · | NO RUN DATA | **нет теста** |
| `page/CommentsPanel/vse` | Все |  | ✗ | ✗ | · | · | · | · | ✗ | · | NO RUN DATA | **нет теста** |
| `page/CommentsPanel/povtorit` | Повторить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/ThreadCard/otkryt-obsuzhdenie-zanovo` | Открыть обсуждение заново |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/ThreadCard/deystviya-s-kommentariem` | Действия с комментарием |  | ✗ | · | · | · | · | · | ✗ | · | NO RUN DATA | **нет теста** |
| `page/ThreadCard/edit` | Изменить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/ThreadCard/del` | Удалить | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/ThreadCard/otvetit` | Ответить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/Composer/upomyanut-sotrudnika` | Упомянуть сотрудника |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/Composer/otmena` | Отмена |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/ExportDialog/md` | Markdown |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `page/ExportDialog/mdzip` | Markdown + файлы |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `page/ExportDialog/docx` | Word (DOCX) |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `page/ExportDialog/pdf` | PDF |  | ✔ | · | · | · | · | · | · | · | NO RUN DATA | `e2e/io-p0-roundtrip.spec.ts` background export of a branch can be cancelled from the dialog; separate-files ZIP opti… |
| `page/ExportDialog/html` | HTML |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `page/ExportDialog/eksport` | Экспорт | **да** | ✔ | ✗ | · | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/io-p0-roundtrip.spec.ts` background export of a branch can be cancelled from the dialog; separate-files ZIP opti…<br>`e2e/io-p0-roundtrip.spec.ts` DOCX import → edit in the editor → DOCX and Markdown export from the page menu keep the…<br>`e2e/io-p0-roundtrip.spec.ts` Markdown file import → edit → Markdown export round trip (E225, R-EXPORT-012) |
| `page/ExportDialog/zakryt` | Закрыть |  | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/io-p0-roundtrip.spec.ts` DOCX import → edit in the editor → DOCX and Markdown export from the page menu keep the…<br>`e2e/io-p0-roundtrip.spec.ts` Markdown file import → edit → Markdown export round trip (E225, R-EXPORT-012) |
| `page/ExportDialog/skachat-snova` | Скачать снова |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/ExportDialog/eksportirovat` | Экспортировать | **да** | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/io-p0-roundtrip.spec.ts` background export of a branch can be cancelled from the dialog; separate-files ZIP opti…<br>`e2e/io-p0-roundtrip.spec.ts` DOCX import → edit in the editor → DOCX and Markdown export from the page menu keep the…<br>`e2e/io-p0-roundtrip.spec.ts` Markdown file import → edit → Markdown export round trip (E225, R-EXPORT-012) |
| `page/ExportDialog/tolko-etu-stranicu` | Только эту страницу |  | ✗ | · | ✗ | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `page/ExportDialog/stranicu-so-vsemi-podstranicami` | Страницу со всеми подстраницами |  | ✔ | · | ✗ | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/io-p0-roundtrip.spec.ts` background export of a branch can be cancelled from the dialog; separate-files ZIP opti… |
| `page/ExportDialog/odnim-dokumentom-s-oglavleniem` | Одним документом с оглавлением |  | ✗ | · | ✗ | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `page/ExportDialog/otdelnymi-faylami-zip-s-otchetom-i-kontrolnymi-s` | Отдельными файлами (ZIP с отчётом и контрольными суммами) | **да** | ✔ | · | ✗ | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/io-p0-roundtrip.spec.ts` background export of a branch can be cancelled from the dialog; separate-files ZIP opti… |
| `page/ExportDialog/otmenit-eksport` | Отменить экспорт | **да** | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/io-p0-roundtrip.spec.ts` background export of a branch can be cancelled from the dialog; separate-files ZIP opti… |
| `page/ExportDialog/poprobovat-v-fone` | Попробовать в фоне |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/HistoryPanel/k-spisku-versiy` | К списку версий | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/HistoryPanel/sohranit-versiyu` | Сохранить версию | **да** | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/collab.spec.ts` history: save a version, change text, restore the version (R-HISTORY-004, UX13-14, UX21… |
| `page/HistoryPanel/zakryt-istoriyu` | Закрыть историю | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/HistoryPanel/versii` | Версии |  | ✗ | ✗ | · | · | · | · | ✗ | · | NO RUN DATA | **нет теста** |
| `page/HistoryPanel/zhurnal-izmeneniy` | Журнал изменений |  | ✗ | ✗ | · | · | · | · | ✗ | · | NO RUN DATA | **нет теста** |
| `page/HistoryPanel/tip-versiy` | Тип версий |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `page/HistoryPanel/povtorit` | Повторить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/HistoryPanel/pokazat-esche` | Показать ещё |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/RevisionItem/versiya-opublikovana` | Версия … … Опубликована № … · … · … | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/RevisionDetail/zakryt-prosmotr-versii` | Закрыть просмотр версии | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/RevisionDetail/prosmotr` | Просмотр |  | ✗ | ✗ | · | · | · | · | ✗ | · | NO RUN DATA | **нет теста** |
| `page/RevisionDetail/sravnit-s-tekuschey` | Сравнить с текущей |  | ✗ | ✗ | · | · | · | · | ✗ | · | NO RUN DATA | **нет теста** |
| `page/RevisionDetail/vosstanovit-etu-versiyu` | Восстановить эту версию | **да** | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/collab.spec.ts` history: save a version, change text, restore the version (R-HISTORY-004, UX13-14, UX21… |
| `page/RevisionDetail/sravnit` | Сравнить |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `page/DiffView/bez-izmeneniy-pokazat` | … без изменений: … … — показать |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/DiffView/vosstanovit-blok` | Восстановить блок | **да** | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/collab.spec.ts` history: save a version, change text, restore the version (R-HISTORY-004, UX13-14, UX21… |
| `page/RestoreDialog/vosstanovit-versiyu` | Восстановить версию …? | **да** | ✗ | ✗ | · | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `page/RestoreDialog/otmena` | Отмена |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/RestoreDialog/vosstanovit` | Восстановить | **да** | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/collab.spec.ts` history: save a version, change text, restore the version (R-HISTORY-004, UX13-14, UX21… |
| `page/RestoreDialog/povtorit` | Повторить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/RestoreDialog/vernut-i-svoystva-stranicy-znachok-oblozhka-vlad` | Вернуть и свойства страницы (значок, обложка, владелец, теги, поля) |  | ✗ | · | ✗ | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `page/SaveVersionDialog/sohranit-versiyu` | Сохранить версию | **да** | ✗ | ✗ | · | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `page/SaveVersionDialog/otmena` | Отмена |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/SaveVersionDialog/sohranit` | Сохранить | **да** | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/collab.spec.ts` history: save a version, change text, restore the version (R-HISTORY-004, UX13-14, UX21… |
| `page/SaveVersionDialog/naprimer-pered-soglasovaniem-s-yuristami` | Например: «Перед согласованием с юристами» |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `page/EventsList/otmenit-eto-izmenenie` | Отменить это изменение |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/EventsList/vosstanovit-sostoyanie-na-etot-moment` | Восстановить состояние на этот момент | **да** | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/collab.spec.ts` history: save a version, change text, restore the version (R-HISTORY-004, UX13-14, UX21… |
| `page/EventsList/pokazat-esche` | Показать ещё |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/PageInfoPanel/zakryt-svedeniya` | Закрыть сведения |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/PageInfoPanel/bez-nazvaniya-upominanie` | Без названия упоминание |  | ✗ | · | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `page/PageInfoPanel/skachat` | Скачать … |  | ✗ | · | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `page/TagsEditor/otmenit` | Отменить |  | ✗ | · | · | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/TagsEditor/x` | # … |  | ✗ | · | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `page/TagsEditor/ubrat-teg` | Убрать тег «…» |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/TagsEditor/novyy-teg` | Новый тег |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `page/TagsEditor/teg` | Тег |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/PropertiesEditor/otmenit` | Отменить |  | ✗ | · | · | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/PropertiesEditor/svoystvo` | Свойство «…» |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `page/PropertiesEditor/udalit-svoystvo` | Удалить свойство «…» | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/PropertiesEditor/nazvanie-novogo-svoystva` | Название нового свойства |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `page/PropertiesEditor/znachenie-novogo-svoystva` | Значение нового свойства |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `page/PropertiesEditor/dobavit-svoystvo` | Добавить свойство |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/LegalHold/snyat-uderzhanie` | Снять удержание | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/LegalHold/ustanovit-yuridicheskoe-uderzhanie` | Установить юридическое удержание | **да** | ✗ | ✗ | · | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `page/LegalHold/otmena` | Отмена |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/LegalHold/ustanovit` | Установить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/LegalHold/naprimer-sudebnyy-zapros` | Например: судебный запрос №… |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `page/PublicLinksSection/otozvat-publichnuyu-ssylku` | Отозвать публичную ссылку | **да** | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/acl-p0-spaces.spec.ts` E2E-109 R-PUBLISH-009: public links are off by policy; once enabled a link opens withou… |
| `page/PublicLinksSection/skopirovat` | Скопировать |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/PublicLinksSection/sozdat-publichnuyu-ssylku` | Создать публичную ссылку | **да** | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/acl-p0-spaces.spec.ts` E2E-109 R-PUBLISH-009: public links are off by policy; once enabled a link opens withou… |
| `page/PublicLinksSection/ssylka-deystvuet-do` | Ссылка действует до |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `page/PublicLinksSection/parol-ssylki` | Пароль ссылки | **да** | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `page/PublicLinksSection/razreshit-skachivanie-vlozheniy` | Разрешить скачивание вложений |  | ✗ | · | ✗ | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `page/PublicLinksSection/vklyuchaya-podstranicy` | Включая подстраницы |  | ✗ | · | ✗ | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `page/PublicLinksSection/ponimayu-chto-skachannoe-po-ssylke-nelzya-otozva` | Понимаю, что скачанное по ссылке нельзя отозвать |  | ✔ | · | ✗ | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-spaces.spec.ts` E2E-109 R-PUBLISH-009: public links are off by policy; once enabled a link opens withou… |
| `page/PublicLinksSection/sozdat-ssylku` | Создать ссылку | **да** | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/acl-p0-spaces.spec.ts` E2E-109 R-PUBLISH-009: public links are off by policy; once enabled a link opens withou… |
| `page/PublicLinksSection/otmena` | Отмена |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/PublishBar/sravnit` | Сравнить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/SubmitReviewDialog/otpravit-na-soglasovanie` | Отправить на согласование | **да** | ✗ | ✗ | · | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `page/SubmitReviewDialog/otmena` | Отмена |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/SubmitReviewDialog/otpravit` | Отправить | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/SubmitReviewDialog/ubrat-soglasuyuschego` | Убрать согласующего |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/SubmitReviewDialog/chto-izmenilos-i-na-chto-obratit-vnimanie` | Что изменилось и на что обратить внимание |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `page/DecideDialog/soglasovat-i-opublikovat` | Согласовать и опубликовать | **да** | ✗ | ✗ | · | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `page/DecideDialog/otmena` | Отмена |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/DecideDialog/soglasovat` | Согласовать |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/DecideDialog/otkryt-istoriyu-versiy` | Открыть историю версий | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/ShareDialog/dostup` | Доступ: … | **да** | ✔ | ✗ | · | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-ui.spec.ts` QA26-24 R-ACL-075 R-ACL-076: in the browser the UI shows exactly the server rights; no …<br>`e2e/acl-p0-ui.spec.ts` R-ACL-075 QA26-24: the same access-control checks on a phone (Pixel 7 viewport, touch) |
| `page/ShareDialog/skopirovat-ssylku` | Скопировать ссылку |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/ShareDialog/gotovo` | Готово |  | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest …<br>`e2e/acl-p0-ui.spec.ts` QA26-24 R-ACL-075 R-ACL-076: in the browser the UI shows exactly the server rights; no …<br>`e2e/acl-p0-ui.spec.ts` R-ACL-075 QA26-24: the same access-control checks on a phone (Pixel 7 viewport, touch) |
| `page/ShareDialog/povtorit` | Повторить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/ShareDialog/ubrat` | Убрать |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/ShareDialog/uroven-dostupa` | Уровень доступа | **да** | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `page/ShareDialog/dostup-do` | Доступ до | **да** | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `page/ShareDialog/vydat-dostup` | Выдать доступ | **да** | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest …<br>`e2e/acl-p0-spaces.spec.ts` R-ACL-021 R-ACL-036: share dialog — department preset, quick expiry, start date, reason…<br>`e2e/acl-p0-ui.spec.ts` QA26-24 R-ACL-075 R-ACL-076: in the browser the UI shows exactly the server rights; no …<br>… ещё 1 |
| `page/ShareDialog/skryt-parametry` | Скрыть параметры |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/ShareDialog/dostup-s` | Доступ с | **да** | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `page/ShareDialog/osnovanie-dostupa` | Основание доступа | **да** | ✔ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-spaces.spec.ts` R-ACL-021 R-ACL-036: share dialog — department preset, quick expiry, start date, reason… |
| `page/ShareDialog/zapretit-skachivanie-vlozheniy` | Запретить скачивание вложений |  | ✔ | · | ✗ | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-spaces.spec.ts` R-ACL-021 R-ACL-036: share dialog — department preset, quick expiry, start date, reason… |
| `page/ShareDialog/zapretit-eksport` | Запретить экспорт |  | ✗ | · | ✗ | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `page/ShareDialog/mozhet-delitsya-stranicey-dlya-redaktirovaniya` | Может делиться страницей (для редактирования) |  | ✗ | · | ✗ | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `page/ShareDialog/obschiy-dostup` | Общий доступ | **да** | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `page/ShareDialog/uroven-dostupa~2` | Уровень доступа: … | **да** | ✔ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest …<br>`e2e/acl-p0-spaces.spec.ts` R-ACL-021 R-ACL-036: share dialog — department preset, quick expiry, start date, reason… |
| `page/ShareDialog/ubrat-dostup` | Убрать доступ: … | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/ShareDialog/nasledovat-prava` | Наследовать права | **да** | ✗ | · | ✗ | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `page/ShareDialog/pochemu-u-polzovatelya-est-dostup` | Почему у пользователя есть доступ? | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/ShareDialog/zaprosit-bolshe-prav` | Запросить больше прав |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/AccessRequest/nuzhnyy-uroven` | Нужный уровень |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `page/AccessRequest/zachem-nuzhen-dostup-neobyazatelno` | Зачем нужен доступ (необязательно) | **да** | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `page/AccessRequest/otpravit-zapros` | Отправить запрос | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/SharePresets/tolko-ya` | Только я |  | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/acl-p0-spaces.spec.ts` R-ACL-021 R-ACL-036: share dialog — department preset, quick expiry, start date, reason…<br>`e2e/acl-p0-ui.spec.ts` QA26-24 R-ACL-075 R-ACL-076: in the browser the UI shows exactly the server rights; no …<br>`e2e/acl-p0-ui.spec.ts` R-ACL-075 QA26-24: the same access-control checks on a phone (Pixel 7 viewport, touch) |
| `page/SharePresets/otdel` | Отдел: … |  | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/acl-p0-spaces.spec.ts` R-ACL-021 R-ACL-036: share dialog — department preset, quick expiry, start date, reason… |
| `page/SharePresets/vsya-kompaniya` | Вся компания |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/PageError/povtorit` | Повторить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/PageError/zapros-otpravlen` | Запрос отправлен | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/PageError/na-glavnuyu` | На главную |  | ✗ | · | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `page/PageLoaded/otmenit` | Отменить |  | ✗ | · | · | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/PageLoaded/fav` | Убрать из избранного |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/PageLoaded/link` | Копировать ссылку |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/PageLoaded/copy-page` | Копировать страницу |  | ✔ | · | · | · | · | · | · | · | NO RUN DATA | `e2e/acl-p0-ui.spec.ts` AT-79: copying a page does not put titles of linked pages the reader cannot open on the…<br>`e2e/clipboard.spec.ts` page menu copies the page with formatting, as text and as Markdown (R-CLIPBOARD-002, R-… |
| `page/PageLoaded/history` | История версий | **да** | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/collab.spec.ts` history: save a version, change text, restore the version (R-HISTORY-004, UX13-14, UX21… |
| `page/PageLoaded/info` | Сведения о странице |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/PageLoaded/export` | Экспорт… | **да** | ✔ | ✗ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/io-p0-roundtrip.spec.ts` background export of a branch can be cancelled from the dialog; separate-files ZIP opti…<br>`e2e/io-p0-roundtrip.spec.ts` DOCX import → edit in the editor → DOCX and Markdown export from the page menu keep the…<br>`e2e/io-p0-roundtrip.spec.ts` Markdown file import → edit → Markdown export round trip (E225, R-EXPORT-012)<br>… ещё 1 |
| `page/PageLoaded/print` | Печать |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/PageLoaded/wide` | Широкая страница |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/PageLoaded/lock` | Снять защиту от изменений |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/PageLoaded/template` | Сохранить как шаблон | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/PageLoaded/dup` | Дублировать | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/PageLoaded/move` | Переместить в… | **да** | ✔ | ✗ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/ui-p0-interaction.spec.ts` R-UI-059, R-UI-053: dialogs trap focus, always have a visible exit and Esc, and return … |
| `page/PageLoaded/delete` | Удалить | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/PageLoaded/ne-polnostyu-lichnaya` | Не полностью личная |  | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/acl-p0-spaces.spec.ts` R-ACL-051: a shared personal page shows «Не полностью личная» in the header and in the … |
| `page/PageLoaded/podelitsya` | Поделиться | **да** | ✔ | ✗ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest …<br>`e2e/acl-p0-spaces.spec.ts` E2E-109 R-PUBLISH-009: public links are off by policy; once enabled a link opens withou…<br>`e2e/acl-p0-spaces.spec.ts` R-ACL-021 R-ACL-036: share dialog — department preset, quick expiry, start date, reason…<br>… ещё 2 |
| `page/PageLoaded/kommentarii` | Комментарии |  | ✔ | ✗ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/content.spec.ts` comment on a selection appears in the comments panel<br>`e2e/ui-p0-interaction.spec.ts` R-UI-059, R-UI-008, E224: menus at viewport edges flip/shift inside the window, keep ke…<br>`e2e/ui-p0-layout.spec.ts` R-UI-006: switching pages, opening and closing the side panel cause no layout shift |
| `page/PageLoaded/izbrannoe` | Избранное |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/PageLoaded/deystviya-so-stranicey` | Действия со страницей |  | ✔ | · | · | ✔ | · | · | ✗ | · | NO RUN DATA | `e2e/acl-p0-ui.spec.ts` AT-79: copying a page does not put titles of linked pages the reader cannot open on the…<br>`e2e/clipboard.spec.ts` page menu copies the page with formatting, as text and as Markdown (R-CLIPBOARD-002, R-…<br>`e2e/collab.spec.ts` history: save a version, change text, restore the version (R-HISTORY-004, UX13-14, UX21…<br>… ещё 6 |
| `page/PageLoaded/vosstanovit` | Восстановить | **да** | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest …<br>`e2e/collab.spec.ts` history: save a version, change text, restore the version (R-HISTORY-004, UX13-14, UX21… |
| `page/PageLoaded/skachat-lokalnuyu-kopiyu` | Скачать локальную копию |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/PageLoaded/izmenit-znachok` | Изменить значок |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/PageLoaded/dobavit-znachok` | Добавить значок |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `page/Breadcrumbs/x` | 📁 … |  | ✗ | · | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `page/Breadcrumbs/bez-nazvaniya` | … Без названия |  | ✗ | · | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `page/Backlinks/bez-nazvaniya` | Без названия |  | ✗ | · | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |

### runtime (6/25 покрыто)

| ID | Название | Крит. | ok | пусто | загр | отм | ошиб | офл | прав | 2× | Факт | Тесты |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `runtime/textbox/soderzhimoe-stranicy` | Содержимое страницы |  | ✔ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … |
| `runtime/tab/uchastniki` | Участники | **да** | ✔ | ✗ | · | · | · | · | ✗ | · | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-03: space manager route — members and group access → template → tree drag-and-dro…<br>`e2e/acl-p0-spaces.spec.ts` R-SPACE-001 R-SPACE-010 R-ADMIN-020: a space is created in the UI and a department gets… |
| `runtime/radio/vse` | Всё |  | ✗ | · | ✗ | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `runtime/button/zagruzit-i-proverit` | Загрузить и проверить | **да** | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/io-p0-roundtrip.spec.ts` DOCX import → edit in the editor → DOCX and Markdown export from the page menu keep the…<br>`e2e/io-p0-roundtrip.spec.ts` Markdown file import → edit → Markdown export round trip (E225, R-EXPORT-012) |
| `runtime/link/profil` | Профиль |  | ✗ | · | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `runtime/link/oformlenie-i-redaktor` | Оформление и редактор |  | ✗ | · | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `runtime/link/parol-i-vhod` | Пароль и вход | **да** | ✗ | · | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `runtime/link/aktivnye-seansy` | Активные сеансы |  | ✗ | · | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `runtime/link/api-tokeny` | API-токены | **да** | ✗ | · | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `runtime/switch/proverka-orfografii` | Проверка орфографии |  | ✗ | · | ✗ | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `runtime/switch/shirokie-stranicy-po-umolchaniyu` | Широкие страницы по умолчанию |  | ✗ | · | ✗ | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `runtime/switch/umnaya-tipografika` | Умная типографика |  | ✗ | · | ✗ | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `runtime/switch/podskazki-po-interfeysu` | Подсказки по интерфейсу |  | ✗ | · | ✗ | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `runtime/textbox/naznachenie` | Назначение |  | ✔ | ✔ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/io-p0-roundtrip.spec.ts` DOCX import → edit in the editor → DOCX and Markdown export from the page menu keep the… |
| `runtime/switch/obyazatelnaya-dvuhfaktornaya-autentifikaciya` | Обязательная двухфакторная аутентификация |  | ✗ | · | ✗ | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `runtime/switch/vhod-tolko-cherez-sso` | Вход только через SSO |  | ✗ | · | ✗ | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `runtime/switch/avtomaticheskoe-sozdanie-uchetnyh-zapisey-pri-vh` | Автоматическое создание учётных записей при входе через SSO |  | ✗ | · | ✗ | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `runtime/switch/gostevye-uchetnye-zapisi` | Гостевые учётные записи |  | ✗ | · | ✗ | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `runtime/spinbutton/srok-hraneniya-v-korzine` | Срок хранения в корзине |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `runtime/spinbutton/srok-hraneniya-versiy` | Срок хранения версий |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `runtime/spinbutton/srok-hraneniya-zhurnala-izmeneniy` | Срок хранения журнала изменений |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `runtime/spinbutton/kvota-faylov-na-polzovatelya` | Квота файлов на пользователя |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `runtime/textbox/kod-deystviya` | Код действия |  | ✔ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … |
| `runtime/combobox/kto` | Кто |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `runtime/textbox/dokument-ssylka-id-ili-nazvanie` | Документ (ссылка, ID или название) |  | ✔ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-admin.spec.ts` R-ADMIN-018 V16-S15: the administrator checks a user's access to a document — decision,…<br>`e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … |

### search (1/19 покрыто)

| ID | Название | Крит. | ok | пусто | загр | отм | ошиб | офл | прав | 2× | Факт | Тесты |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `search/SearchPage/pages` | Текст страниц |  | ✔ | · | · | · | · | · | · | · | NO RUN DATA | `e2e/io-p0-roundtrip.spec.ts` Markdown file import → edit → Markdown export round trip (E225, R-EXPORT-012) |
| `search/SearchPage/files` | Вложения |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `search/SearchPage/images` | Изображения (OCR) |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `search/AuthorFilter/sbrosit-avtora` | Сбросить автора | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `search/AuthorFilter/nedostupno-gostyam` | Недоступно гостям | **да** | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `search/SearchPage/poiskovyy-zapros` | Поисковый запрос |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `search/SearchPage/ochistit` | Очистить | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `search/SearchPage/filtry` | Фильтры |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `search/SearchPage/prostranstvo` | Пространство |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `search/SearchPage/status` | Статус |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `search/SearchPage/izmeneno-s` | Изменено с |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `search/SearchPage/po` | по |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `search/SearchPage/sbrosit-filtry` | Сбросить фильтры | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `search/SearchPage/sbrosit` | Сбросить | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `search/SearchPage/povtorit` | Повторить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `search/SearchPage/sbrosit-filtry~2` | сбросить фильтры | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `search/SearchPage/zagruzit-esche` | Загрузить ещё | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `search/SearchPage/bez-nazvaniya-v-zagolovke-razdela-v-tegah-v-svoy` | Без названия … В заголовке раздела В тегах В свойствах В комментариях Похожее название Опубликованная версия | **да** | ✗ | · | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `search/SearchPage/pokazat-esche` | Показать ещё |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |

### settings (0/31 покрыто)

| ID | Название | Крит. | ok | пусто | загр | отм | ошиб | офл | прав | 2× | Факт | Тесты |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `settings/SettingsPage/route.settings-profile` | /settings/profile | **да** | ✗ | ✗ | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `settings/SettingsPage/route.settings-appearance` | /settings/appearance | **да** | ✗ | ✗ | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `settings/SettingsPage/route.settings-security` | /settings/security | **да** | ✗ | ✗ | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `settings/SettingsPage/route.settings-sessions` | /settings/sessions | **да** | ✗ | ✗ | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `settings/SettingsPage/route.settings-tokens` | /settings/tokens | **да** | ✗ | ✗ | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `settings/ProfileForm/imya-i-familiya` | Имя и фамилия |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `settings/ProfileForm/dolzhnost` | Должность |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `settings/ProfileForm/otmenit` | Отменить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `settings/ProfileForm/sohranit` | Сохранить | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `settings/AppearanceTab/system` | Как в системе |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `settings/AppearanceTab/light` | Светлая |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `settings/AppearanceTab/dark` | Тёмная |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `settings/SecurityTab/tekuschiy-parol` | Текущий пароль | **да** | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `settings/SecurityTab/novyy-parol` | Новый пароль | **да** | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `settings/SecurityTab/povtorite-parol` | Повторите пароль | **да** | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `settings/SecurityTab/izmenit-parol` | Изменить пароль | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `settings/MfaCard/123456` | 123456 |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `settings/MfaCard/otklyuchit` | Отключить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `settings/MfaCard/sekretnyy-klyuch` | Секретный ключ |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `settings/MfaCard/ssylka-otpauth` | Ссылка otpauth:// |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `settings/MfaCard/otmena` | Отмена |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `settings/MfaCard/vklyuchit` | Включить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `settings/MfaCard/nastroit` | Настроить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `settings/SessionsTab/zavershit-ostalnye` | Завершить остальные | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `settings/SessionsTab/zavershit` | Завершить | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `settings/TokensTab/token` | Токен | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `settings/TokensTab/ya-sohranil-token` | Я сохранил токен | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `settings/TokensTab/naprimer-vygruzka-v-bi` | например, Выгрузка в BI |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `settings/TokensTab/srok-deystviya-dney` | Срок действия, дней |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `settings/TokensTab/sozdat-token` | Создать токен | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `settings/TokensTab/otozvat` | Отозвать | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |

### shell (12/63 покрыто)

| ID | Название | Крит. | ok | пусто | загр | отм | ошиб | офл | прав | 2× | Факт | Тесты |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `shell/AppShell/pokazat-bokovuyu-panel` | Показать боковую панель |  | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/a11y.spec.ts` real 200% browser zoom (1280x800 at 2x = 640x400 CSS px) keeps every key screen usable …<br>`e2e/a11y.spec.ts` WCAG 2.1 AA automated audit of key screens (R-A11Y-003, AT-80, E2E-112)<br>`e2e/acl-p0-spaces.spec.ts` E2E-109 R-PUBLISH-009: public links are off by policy; once enabled a link opens withou…<br>… ещё 59 |
| `shell/QuickSwitcher/c-search` | Расширенный поиск |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `shell/QuickSwitcher/c-home` | Главная |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `shell/QuickSwitcher/c-templates` | Шаблоны |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `shell/QuickSwitcher/c-import` | Импорт документов | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `shell/QuickSwitcher/c-trash` | Корзина | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `shell/QuickSwitcher/c-settings` | Настройки |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `shell/QuickSwitcher/c-help` | Справка и горячие клавиши |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `shell/QuickSwitcher/t.bez-nazvaniya` | Без названия |  | ✗ | · | · | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `shell/QuickSwitcher/t.bez-nazvaniya~2` | Без названия |  | ✗ | · | · | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `shell/QuickSwitcher/full` | Искать «…» во всех материалах |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `shell/QuickSwitcher/nayti-stranicu-ili-komandu` | Найти страницу или команду |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `shell/Sidebar/profil-i-nastroyki` | Профиль и настройки |  | ✗ | · | · | · | · | · | ✗ | · | NO RUN DATA | **нет теста** |
| `shell/Sidebar/settings` | Настройки профиля |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `shell/Sidebar/theme` | Тема |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `shell/Sidebar/system` | Как в системе |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `shell/Sidebar/light` | Светлая |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `shell/Sidebar/dark` | Тёмная |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `shell/Sidebar/reset` | Сбросить панель по умолчанию | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `shell/Sidebar/help` | Справка и горячие клавиши |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `shell/Sidebar/logout` | Выйти | **да** | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-01: employee route — login → own spaces → regulation → search → one-click article… |
| `shell/Sidebar/skryt-bokovuyu-panel` | Скрыть боковую панель |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `shell/Sidebar/poisk-k` | Поиск ⌘K |  | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/a11y.spec.ts` reduced motion: animations and transitions are effectively disabled (R-A11Y-002, AT-82) |
| `shell/Sidebar/glavnaya` | Главная |  | ✗ | · | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `shell/Sidebar/vhodyaschie` | Входящие … |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `shell/Sidebar/novaya-stranica` | Новая страница | **да** | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-01: employee route — login → own spaces → regulation → search → one-click article…<br>`e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest …<br>`e2e/acl-p0-spaces.spec.ts` R-SPACE-001 R-SPACE-010 R-ADMIN-020: a space is created in the UI and a department gets… |
| `shell/Sidebar/novoe-prostranstvo` | Новое пространство |  | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-03: space manager route — members and group access → template → tree drag-and-dro…<br>`e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest …<br>`e2e/acl-p0-spaces.spec.ts` R-SPACE-001 R-SPACE-010 R-ADMIN-020: a space is created in the UI and a department gets… |
| `shell/Sidebar/izbrannoe` | Избранное |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `shell/Sidebar/bez-nazvaniya` | Без названия |  | ✗ | · | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `shell/Sidebar/povtorit` | Повторить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `shell/Sidebar/shablony` | Шаблоны |  | ✔ | · | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-03: space manager route — members and group access → template → tree drag-and-dro… |
| `shell/Sidebar/import` | Импорт | **да** | ✗ | · | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `shell/Sidebar/korzina` | Корзина | **да** | ✗ | · | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `shell/Sidebar/administrirovanie` | Администрирование |  | ✗ | · | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `shell/SidebarTree/personal` | Моё пространство |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `shell/SidebarTree/spaces` | Пространства |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `shell/SidebarTree/shared` | Доступные мне |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `shell/SidebarTree/nodemenu.new` | Новая вложенная страница |  | ✔ | ✗ | ✗ | ✔ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/ui-p0-interaction.spec.ts` R-UI-060, UX-141: hovering controls performs no action; hover-only tree actions have a … |
| `shell/SidebarTree/rename` | Переименовать | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `shell/SidebarTree/icon` | Изменить иконку |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `shell/SidebarTree/move` | Переместить в… | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `shell/SidebarTree/dup` | Дублировать | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `shell/SidebarTree/link` | Копировать ссылку |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `shell/SidebarTree/fav` | В избранное |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `shell/SidebarTree/trash` | Удалить в корзину | **да** | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-03: space manager route — members and group access → template → tree drag-and-dro… |
| `shell/SidebarTree/spacemenu.new` | Новая страница | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `shell/SidebarTree/open` | Обзор пространства |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `shell/SidebarTree/settings` | Настройки и участники | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `shell/TreeRow/povtorit-zagruzku` | Повторить загрузку |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `shell/TreeRow/sozdat-pervuyu-stranicu` | Создать первую страницу | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `shell/TreeRow/svernut` | Свернуть |  | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-03: space manager route — members and group access → template → tree drag-and-dro… |
| `shell/TreeRow/novaya-stranica-v` | Новая страница в «…» | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `shell/TreeRow/deystviya-prostranstva` | Действия пространства «…» |  | ✗ | · | · | · | · | · | ✗ | · | NO RUN DATA | **нет теста** |
| `shell/TreeRow/deystviya` | Действия |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `shell/TreeRow/svernut~2` | Свернуть |  | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-03: space manager route — members and group access → template → tree drag-and-dro… |
| `shell/TreeRow/bez-nazvaniya` | Без названия |  | ✗ | · | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `shell/TreeRow/dobavit-stranicu-vnutr` | Добавить страницу внутрь «…» |  | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/content.spec.ts` sidebar tree: "+" creates a child page under the selected parent with focus in the titl… |
| `shell/TreeRow/deystviya-so-stranicey` | Действия со страницей «…» |  | ✔ | · | · | · | · | · | ✗ | · | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-03: space manager route — members and group access → template → tree drag-and-dro… |
| `shell/TreeRow/deystviya~2` | Действия |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `shell/RenameInput/novoe-nazvanie` | Новое название |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `shell/treeActions/otkryt` | Открыть |  | ✗ | · | · | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `shell/treeActions/otmenit` | Отменить |  | ✗ | · | · | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `shell/treeActions/vosstanovit` | Восстановить | **да** | ✗ | · | · | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |

### space (20/50 покрыто)

| ID | Название | Крит. | ok | пусто | загр | отм | ошиб | офл | прав | 2× | Факт | Тесты |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `space/SpaceAccess/project` | Проект |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `space/SpaceAccess/department` | Подразделение |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `space/SpaceAccess/kinds.private` | Закрытое |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `space/SpaceAccess/org` | Общекорпоративное |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `space/SpaceAccess/vis.private` | Приватное |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `space/SpaceAccess/closed` | Закрытое |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `space/SpaceAccess/open` | Открытое |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `space/ExpiryPresets/bessrochno` | Бессрочно |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `space/CreateSpaceDialog/novoe-prostranstvo` | Новое пространство |  | ✔ | ✗ | · | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-03: space manager route — members and group access → template → tree drag-and-dro…<br>`e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest …<br>`e2e/acl-p0-spaces.spec.ts` R-SPACE-001 R-SPACE-010 R-ADMIN-020: a space is created in the UI and a department gets… |
| `space/CreateSpaceDialog/otmena` | Отмена |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `space/CreateSpaceDialog/sozdat-prostranstvo` | Создать пространство | **да** | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-03: space manager route — members and group access → template → tree drag-and-dro…<br>`e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest …<br>`e2e/acl-p0-spaces.spec.ts` R-SPACE-001 R-SPACE-010 R-ADMIN-020: a space is created in the UI and a department gets… |
| `space/CreateSpaceDialog/nazvanie` | Название |  | ✔ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-03: space manager route — members and group access → template → tree drag-and-dro…<br>`e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest …<br>`e2e/acl-p0-spaces.spec.ts` R-SPACE-001 R-SPACE-010 R-ADMIN-020: a space is created in the UI and a department gets… |
| `space/CreateSpaceDialog/opisanie` | Описание |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `space/CreateSpaceDialog/tip` | Тип |  | ✔ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest …<br>`e2e/acl-p0-spaces.spec.ts` R-SPACE-001 R-SPACE-010 R-ADMIN-020: a space is created in the UI and a department gets… |
| `space/CreateSpaceDialog/vidimost` | Видимость |  | ✔ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-spaces.spec.ts` R-SPACE-001 R-SPACE-010 R-ADMIN-020: a space is created in the UI and a department gets… |
| `space/CreateSpaceDialog/vse-sotrudniki-organizacii` | Все сотрудники организации |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `space/CreateSpaceDialog/uroven` | Уровень: … |  | ✔ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest …<br>`e2e/acl-p0-spaces.spec.ts` R-SPACE-001 R-SPACE-010 R-ADMIN-020: a space is created in the UI and a department gets… |
| `space/CreateSpaceDialog/ubrat` | Убрать: … |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `space/SpaceMembersEditor/ubrat` | Убрать |  | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/acl-p0-spaces.spec.ts` R-SPACE-001 R-SPACE-010 R-ADMIN-020: a space is created in the UI and a department gets… |
| `space/SpaceMembersEditor/uroven-dostupa` | Уровень доступа | **да** | ✔ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-spaces.spec.ts` R-SPACE-001 R-SPACE-010 R-ADMIN-020: a space is created in the UI and a department gets… |
| `space/SpaceMembersEditor/dostup-do` | Доступ до | **да** | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `space/SpaceMembersEditor/osnovanie-dostupa` | Основание доступа | **да** | ✔ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-spaces.spec.ts` R-SPACE-001 R-SPACE-010 R-ADMIN-020: a space is created in the UI and a department gets… |
| `space/SpaceMembersEditor/dobavit-v-prostranstvo` | Добавить в пространство |  | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-03: space manager route — members and group access → template → tree drag-and-dro…<br>`e2e/acl-p0-spaces.spec.ts` R-SPACE-001 R-SPACE-010 R-ADMIN-020: a space is created in the UI and a department gets… |
| `space/SpaceMembersEditor/uroven-dostupa~2` | Уровень доступа: … | **да** | ✔ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-03: space manager route — members and group access → template → tree drag-and-dro…<br>`e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest …<br>`e2e/acl-p0-spaces.spec.ts` R-SPACE-001 R-SPACE-010 R-ADMIN-020: a space is created in the UI and a department gets… |
| `space/SpaceMembersEditor/ubrat-dostup` | Убрать доступ: … | **да** | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/acl-p0-spaces.spec.ts` R-SPACE-001 R-SPACE-010 R-ADMIN-020: a space is created in the UI and a department gets… |
| `space/ErrorState/povtorit` | Повторить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `space/PagesTab/novaya-stranica` | Новая страница | **да** | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … |
| `space/PagesTab/shablony` | Шаблоны |  | ✔ | · | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-03: space manager route — members and group access → template → tree drag-and-dro… |
| `space/PagesTab/import` | Импорт | **да** | ✗ | · | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `space/PagesTab/bez-nazvaniya` | Без названия |  | ✗ | · | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `space/SettingsTab/otkryt-korzinu` | Открыть корзину | **да** | ✗ | · | · | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `space/SettingsTab/vybrat-ikonku` | Выбрать иконку |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `space/SettingsTab/nazvanie` | Название |  | ✔ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-03: space manager route — members and group access → template → tree drag-and-dro…<br>`e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … |
| `space/SettingsTab/opisanie` | Описание |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `space/SettingsTab/vidimost` | Видимость |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `space/SettingsTab/srazu-chitateli-vidyat-tekuschuyu-versiyu` | Сразу — читатели видят текущую версию |  | ✗ | · | ✗ | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `space/SettingsTab/posle-publikacii-chitateli-vidyat-tolko-opubliko` | После публикации — читатели видят только опубликованные версии |  | ✔ | · | ✗ | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-03: space manager route — members and group access → template → tree drag-and-dro… |
| `space/SettingsTab/soglasovanie-pered-publikaciey` | Согласование перед публикацией |  | ✗ | · | ✗ | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `space/SettingsTab/razreshit-eksport` | Разрешить экспорт |  | ✗ | · | ✗ | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `space/SettingsTab/razreshit-skachivanie-vlozheniy` | Разрешить скачивание вложений |  | ✗ | · | ✗ | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `space/SettingsTab/razreshit-dostup-gostyam` | Разрешить доступ гостям | **да** | ✔ | · | ✗ | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … |
| `space/SettingsTab/sbrosit` | Сбросить | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `space/SettingsTab/sohranit` | Сохранить | **да** | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-03: space manager route — members and group access → template → tree drag-and-dro…<br>`e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … |
| `space/SettingsTab/vernut-iz-arhiva` | Вернуть из архива | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `space/SettingsTab/udalit-prostranstvo` | Удалить пространство | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `space/SpacePage/na-glavnuyu` | На главную |  | ✗ | · | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `space/SpacePage/pages` | Страницы |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `space/SpacePage/novaya-stranica` | Новая страница | **да** | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-04: administrator route — department → employee → automatic space access → guest … |
| `space/SpacePage/iz-shablona` | Из шаблона |  | ✔ | · | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-03: space manager route — members and group access → template → tree drag-and-dro… |
| `space/SpacePage/import` | Импорт | **да** | ✗ | · | ✗ | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |

### templates (4/27 покрыто)

| ID | Название | Крит. | ok | пусто | загр | отм | ошиб | офл | прав | 2× | Факт | Тесты |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `templates/ErrorState/povtorit` | Повторить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `templates/CreateFromTemplateDialog/sozdat-stranicu` | Создать страницу: … | **да** | ✔ | ✗ | · | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-03: space manager route — members and group access → template → tree drag-and-dro… |
| `templates/CreateFromTemplateDialog/otmena` | Отмена |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `templates/CreateFromTemplateDialog/sozdat` | Создать | **да** | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-03: space manager route — members and group access → template → tree drag-and-dro… |
| `templates/CreateFromTemplateDialog/nazvanie-stranicy` | Название страницы |  | ✔ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-03: space manager route — members and group access → template → tree drag-and-dro… |
| `templates/PreviewDialog/zakryt` | Закрыть |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `templates/PreviewDialog/sozdat-stranicu-iz-shablona` | Создать страницу из шаблона | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `templates/NewTemplateDialog/novyy-shablon` | Новый шаблон |  | ✗ | ✗ | · | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `templates/NewTemplateDialog/otmena` | Отмена |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `templates/NewTemplateDialog/sozdat-shablon` | Создать шаблон | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `templates/NewTemplateDialog/s-nulya-bazovaya-struktura-poyasnenie-cel-soderz` | С нуля — базовая структура: пояснение, «Цель», «Содержание» |  | ✗ | · | ✗ | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `templates/NewTemplateDialog/iz-suschestvuyuschey-stranicy-soderzhimoe-i-svoy` | Из существующей страницы — содержимое и свойства копируются, страница не меняется |  | ✗ | · | ✗ | ✗ | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `templates/NewTemplateDialog/izmenit` | Изменить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `templates/NewTemplateDialog/nachnite-vvodit-nazvanie-stranicy` | Начните вводить название страницы |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `templates/NewTemplateDialog/bez-nazvaniya` | 📄 Без названия |  | ✗ | · | · | · | · | · | · | · | NO RUN DATA | **нет теста** |
| `templates/NewTemplateDialog/x` | 📄 |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `templates/NewTemplateDialog/po-umolchaniyu-nazvanie-shablona` | По умолчанию — название шаблона |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `templates/NewTemplateDialog/nazvanie-shablona` | Название шаблона |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `templates/NewTemplateDialog/opisanie` | Описание |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `templates/NewTemplateDialog/kategoriya` | Категория |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `templates/NewTemplateDialog/gde-dostupen` | Где доступен | **да** | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `templates/TemplatesPage/novyy-shablon` | Новый шаблон |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `templates/TemplatesPage/nayti-shablon` | Найти шаблон |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `templates/TemplatesPage/ubrat-iz-izbrannyh` | Убрать из избранных |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `templates/TemplatesPage/prosmotr` | Просмотр |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `templates/TemplatesPage/ispolzovat` | Использовать |  | ✔ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | `e2e/acl-p0-routes.spec.ts` ROUTE-03: space manager route — members and group access → template → tree drag-and-dro… |
| `templates/TemplatesPage/udalit-shablon` | Удалить шаблон «…» | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |

### trash (0/9 покрыто)

| ID | Название | Крит. | ok | пусто | загр | отм | ошиб | офл | прав | 2× | Факт | Тесты |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `trash/ErrorState/povtorit` | Повторить |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `trash/TrashPage/restore.otkryt` | Открыть |  | ✗ | · | · | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `trash/TrashPage/restorespace.otkryt` | Открыть |  | ✗ | · | · | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `trash/TrashPage/vosstanovit` | Восстановить | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `trash/TrashPage/udalit-navsegda-prostranstvo` | Удалить навсегда пространство «…» | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `trash/TrashPage/nayti-v-korzine` | Найти в корзине |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `trash/TrashPage/prostranstvo` | Пространство |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `trash/TrashPage/vosstanovit~2` | Восстановить | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `trash/TrashPage/udalit-navsegda` | Удалить навсегда «…» | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |

### ui (0/7 покрыто)

| ID | Название | Крит. | ok | пусто | загр | отм | ошиб | офл | прав | 2× | Факт | Тесты |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `ui/ConfirmHost/otmena` | Отмена |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `ui/ConfirmHost/podtverdit` | Подтвердить | **да** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `ui/ConfirmHost/dlya-podtverzhdeniya-vvedite` | Для подтверждения введите: |  | ✗ | ✗ | · | · | ✗ | ✗ | ✗ | · | NO RUN DATA | **нет теста** |
| `ui/Dialog/zakryt` | Закрыть |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `ui/Menu/x` | … … ✓ |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `ui/SubMenu/x` | … … ✓ |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |
| `ui/Toasts/zakryt-uvedomlenie` | Закрыть уведомление |  | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | NO RUN DATA | **нет теста** |

