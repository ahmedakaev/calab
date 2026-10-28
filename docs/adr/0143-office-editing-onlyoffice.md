# ADR-0143. Правка xlsx и docx Диска в ONLYOFFICE Docs

Статус: **предложено** (спайк задачи #98, 28.10.2026; ветка `spike/onlyoffice-98`, не влита). Дополняет
[ADR-0094](0094-disk.md) (Диск). Решение о движке — владельца: ONLYOFFICE, потому что правка и
пересчёт идут в браузере пользователя и сервер остаётся лёгким.

## Контекст

Файлы Диска (`ФОТ*.xlsx`, `График отпусков*.xlsx`, шаблоны договоров `*.docx`) сотрудники
регулярно правят, а боты и синк Hostinger читают их по пути и sha256 (openpyxl, python-docx). Сейчас
поправить ячейку можно только скачав файл и загрузив его заново. Нужно (доска #98): «Открыть»
открывает редактор в окне Calab. Сохранение идёт в тот же файл: тот же id, путь и имя, новая
версия в «Истории», новые sha256, размер и `updatedAt`. Нужна совместная правка без «конфликтующих
копий». «Правка» редактирует, остальные открывают файл только на чтение. Файл остаётся обычным
OOXML. Телефону достаточно просмотра.

## Факты из документации ONLYOFFICE (проверено 28.10.2026)

Актуальная версия — **10.0.0** (12.10.2026,
[releases](https://github.com/ONLYOFFICE/DocumentServer/releases)).

**Лицензия и лимиты Community Edition**
- AGPLv3 с дополнительными условиями: указание авторства (раздел «About» или аналог), пометка
  изменённых версий; права на товарные знаки не даются. Оригинальный брендинг и копирайты
  убирать нельзя; white label — только по коммерческой лицензии. Если программу изменили и дают
  ей пользоваться по сети, её исходники должны быть доступны пользователям.
  Источники: [блог 9.4](https://www.onlyoffice.com/blog/2026/05/onlyoffice-docs-9-4),
  [FAQ Community](https://helpcenter.onlyoffice.com/docs/faq/docs-community.aspx).
- **Лимита 20 одновременных подключений больше нет** (с 9.4, 19.05.2026). Проверено по коду:
  коммит [ONLYOFFICE/server@c635713](https://github.com/ONLYOFFICE/server/commit/c635713160f2964fb1f5abddc75b5a7cdc05d73e)
  ставит `connections` и `connectionsView` для open source в `0x7fffffff`. В том же объекте
  лицензии: `customization: false`, `branding: false`, `advancedApi: false`. Лимита на число
  документов не нашли. FAQ называет ограничения Community: «No clustering or enterprise
  scalability» (только один инстанс) и «No mobile web version».
- **Мобильная веб-правка — только в коммерческих редакциях.** Community на телефоне открывает
  документ только для просмотра. Источники:
  [FAQ](https://helpcenter.onlyoffice.com/docs/faq/docs-community.aspx),
  [сравнение редакций](https://www.onlyoffice.com/compare-editions).

**Кастомизация** ([customization](https://api.onlyoffice.com/docs/docs-api/usage-api/config/editor/customization/customization-standard-branding/),
[темы](https://api.onlyoffice.com/docs/docs-api/get-started/how-it-works/customizing-themes/)).
Что работает без лицензии, проверено по коду web-apps
(`apps/spreadsheeteditor/main/app/controller/Main.js`: `canBranding = asc_getCustomization()`,
`canBrandingExt = asc_getCanBranding()`; `LayoutManager`/`FeaturesManager` читают
`customization.layout` и `customization.features` только при `canBrandingExt`):

| Параметр | Community | Что даёт |
|---|---|---|
| `uiTheme`: `default-dark`, `default-light`, `theme-dark`, `theme-light`, `theme-classic-light`, `theme-contrast-dark`, `theme-gray`, `theme-white`, `theme-night`, `theme-system` | да | тёмная или светлая тема по теме приложения |
| Своя тема: JSON `{id: "theme-…", type: light/dark, colors{…}}` в `web-apps/apps/common/main/resources/themes`, затем `uiTheme: "theme-calab-dark"` | да (ограничения редакции в документации нет; проверить прогоном) | цвета Calab: фон, панели, акцент |
| `compactHeader`, `compactToolbar`, `toolbarHideFileName`, `hideRightMenu`, `hideRulers`, `zoom`, `unit`, `wordHeadingsColor` | да | компактная шапка, имя файла только в рамке Calab |
| `autosave`, `forcesave`, `comments`, `help`, `feedback`, `plugins`, `close`, `goback`, `macros`, `review.*`, `mobile.*`, `ai.disabled` | да | убрать «Справку», «Обратную связь», плагины, AI |
| `logo`, `customer` (раздел «О программе») | **нет** (только Developer) | свой логотип |
| `layout` (скрыть вкладки, меню «Файл», панели, строку состояния), `features` (spellcheck mode, `tabStyle`, `tabBackground` без `change`) | **нет** (`canBrandingExt`) | тонкая перекройка интерфейса |
| `loaderLogo`, `loaderName`, `font` | **нет**: Community показывает предупреждение «платная функция» | свой экран загрузки |

**JWT** ([signature](https://api.onlyoffice.com/docs/docs-api/additional-api/signature/),
[в заголовке](https://api.onlyoffice.com/docs/docs-api/additional-api/signature/request/token-in-header/),
[в теле](https://api.onlyoffice.com/docs/docs-api/additional-api/signature/request/token-in-body/),
[Docker env](https://github.com/ONLYOFFICE/Docker-DocumentServer#readme))
- Алгоритм HS256. В Docker `JWT_ENABLED=true` по умолчанию, а `JWT_SECRET` без явного значения —
  случайный, поэтому его обязательно задавать. `JWT_HEADER=Authorization`, `JWT_IN_BODY=false`.
- Конфиг редактора подписан целиком: claims — это сам конфиг, а токен лежит в `config.token`.
- Исходящие запросы Document Server (скачивание `document.url` и вызов `callbackUrl`) несут
  `Authorization: Bearer <jwt>`, где `payload` — тело запроса; при `JWT_IN_BODY` токен идёт полем
  `token` в теле. С 10.0 в токене есть `operation` (`download` / `callback`), и Document Server
  отвергает входящие токены с такими значениями. `/converter`, `/command` и `/docbuilder` больше не
  принимают токен конфига редактора ([CHANGELOG 10.0.0](https://github.com/ONLYOFFICE/DocumentServer/blob/master/CHANGELOG.md)).

**Сохранение** ([callback handler](https://api.onlyoffice.com/docs/docs-api/usage-api/callback-handler/))
- Статусы: 1 — подключился или отключился пользователь; 2 — готов к сохранению, через ≈10 с после
  закрытия последним (`url`, `changesurl`, `history`, `users`, `actions`, `filetype`); 3 — ошибка
  сохранения; 4 — закрыт без изменений; 6 — forcesave, правка продолжается (`forcesavetype`: 0 —
  command service, 1 — кнопка «Сохранить» или Ctrl+S при `customization.forcesave`, 2 — таймер
  сервера, 3 — отправка формы); 7 — ошибка forcesave.
- Ответ `{"error":0}`. Время жизни `url` в документации не указано: файл забираем сразу.

**Ключи и совместная правка** ([document](https://api.onlyoffice.com/docs/docs-api/usage-api/config/document/),
[co-editing](https://api.onlyoffice.com/docs/docs-api/get-started/how-it-works/co-editing/))
- `document.key`: символы `0-9 a-z A-Z - . _ =`, не длиннее 128. Ключ уникален на сервере
  документов, иначе тот отдаст чужой кэш. Известный ключ открывает документ из кэша.
- Все соавторы открывают один ключ. После статуса 2 ключ больше не открывает правку — нужен новый.
  После статуса 6 ключ **не меняют**, иначе совместная правка распадётся.
- Режимы `coEditing`: `fast` (по умолчанию, правки видны сразу) и `strict`. Совместная правка в
  Community доступна.

## Решение

### 1. Схема
```
Calab client ──GET /api/office/config?item=…──▶ API (signed config: mode, key, file URL, callback URL)
     │  iframe {OFFICE_DOCS_URL}/web-apps/apps/calab/calab-editor.html   (only while open)
     │  postMessage: hello → open{config} → events(ready/state/error) → close
     ▼
Document Server ──GET /api/office/file/{t}──▶ API (our URL token + DS JWT «download»; pinned version)
                ──POST /api/office/callback/{t}─▶ API (DS JWT; status 2/6 → new version of the item)
```
- **JS Document Server не исполняется в странице Calab.** Клиент на «Открыть» создаёт `<iframe>`
  на нашу страницу-хост `infra/office/calab-editor.html`. Она лежит на origin Document Server:
  смонтирована read-only в его `web-apps/apps/calab/`, и nginx самого Document Server её уже
  отдаёт. Хост грузит `api.js` только после `open` и создаёт `DocsAPI.DocEditor`. На `close`
  вызывает `destroyEditor()`, после чего клиент удаляет iframe — уходят JS, сокет и таймеры
  редактора. Поэтому не нужно исключений в `script-src` у приложения, сторонний код не попадает
  рядом с мостом preload, а закрытое окно ничего не стоит.
- Протокол postMessage. Клиент шлёт конфиг только на origin Document Server и принимает сообщения
  только от `iframe.contentWindow` с этого origin. Хост принимает только от `window.parent`.
  События (флаги состояния, коды ошибок) секретов не несут.
- Сервер: пакет `internal/office`, включается `OFFICE_ENABLED`, по умолчанию выключен.

### 2. Эндпоинты
- `GET /api/office/config?item={diskItemId}&theme=dark|light&phone=1&lang=ru` (private):
  `OfficeConfigResponse{docs_url, host_url, config_json, mode, key}` (proto `office.proto`). В
  запросе id элемента Диска, а не файла: файл меняется с каждой версией, а элемент нет.
  Ответы: 404 без `DISK_VIEW`, 415 — не xlsx/docx.
- `GET /api/office/file/{token}` (анонимный). Наш URL-токен: HS256 ключом, выведенным из
  `JWT_SECRET` API (`DeriveURLKey`), `aud=office`, `op=file`, `exp` = 5 мин, закреплён за
  `file_id` версии сессии. Плюс JWT Document Server в `Authorization` с `operation`
  `download` или без неё (до 10.0). Если элемент ушёл на новую версию — 410.
- `POST /api/office/callback/{token}` (анонимный). Наш токен с `op=callback` (без exp: сессия может
  жить днями) и JWT Document Server (заголовок с `payload` или `token` в теле, `operation` —
  `callback`). Читаем только подписанное тело. Всегда отвечаем 200 с `{"error":0}` или
  `{"error":1}`: на отказ Document Server оставляет правки у себя и показывает ошибку сохранения.

### 3. Права (diskacl)
`Mode(item, phone)` ([config.go](../../apps/server/internal/office/config.go)):
- `DISK_VIEW | DISK_WRITE` («Правка», владелец, `DISK_MANAGE`) → `edit`;
- только `DISK_VIEW` → `view`;
- без `DISK_VIEW` → 404, как во всём Диске;
- элемент в корзине, пространство без записи (тариф) и телефон → `view`.

Биты — `perm.ComputeDiskItemIn` по цепочке `diskacl`. При сохранении права того, кто прислал
изменения (`users[0]`), проверяются заново: потерял «Правку» — сохранение отклоняется. Сохранение
без пользователя Calab тоже отклоняется. Боты в редактор не ходят (маршруты `botDeny`), файлы
читают API Диска, как раньше.

### 4. Сохранение как версия того же файла
Callback со статусом 2 или 6:
1. URL скачивания должен быть на origin `OFFICE_DOCS_URL` или `OFFICE_DOCS_INTERNAL_URL` (защита
   от SSRF), размер — не больше `OFFICE_MAX_SIZE_MB`.
2. `filetype` не должен смениться.
3. `Store.SaveVersion(item, expect=session.file_id, actor, bytes)` в одной транзакции:
   - новая строка `files` через `files.StoreSystemFile` (sha256, квота);
   - у `disk_items` меняются `file_id` и `updated_at`; id, родитель и имя прежние;
   - запись `disk_activity` вида `edit` (автор, размер до и после; склейка повторов за 5 мин
     одного автора, как `rename`, ADR-0081);
   - событие `DISK_ITEM_UPSERT`.

   Прежний файл остаётся версией: таблица `disk_file_versions(item_id, file_id, actor_id,
   created_at)` (миграция `00131`). `ListOrphanFiles` её учитывает, версии считаются в квоту и
   хранятся N последних или 90 дней (настройка Диска). Если содержимое совпало с текущим (тот же
   sha256), версия не создаётся. Синхронной конвертации нет: `GET …/disk` и скачивание сразу
   отдают новую версию.
4. Status 6 — версия сразу, сессия продолжается с тем же ключом (`Sessions.Advance` на новый
   `file_id`). Status 2 — последняя версия, сессия закрывается.

Чтобы диск не отставал от открытого редактора (бот забирает файл раз в час), на Document Server
включаем forcesave по таймеру (`services.CoAuthoring.autoAssembly`, интервал 5 мин): пока есть
правки, раз в 5 минут создаётся версия. Ctrl+S (`customization.forcesave`) сохраняет версию сразу.

### 5. Ключ — один на сессию
`key = "calab-" + hex(HMAC(urlKey, item_id ‖ file_id начала сессии))[:40]` — детерминированный.
Двое, открывшие файл одновременно, получают один ключ ещё до записи сессии. Ключ уникален для
каждой установки на общем сервере документов. Сессия (`Sessions`: Valkey, хэш на элемент с TTL,
который продлевает статус 1) хранит `{key, file_id}`:
- первый открывший создаёт её (set-if-absent), следующие присоединяются к тому же ключу;
- forcesave сдвигает `file_id`, ключ остаётся;
- статус 2 или 4 закрывает её, и следующее открытие получает ключ новой версии;
- если `file_id` сессии ≠ текущему файлу элемента (Document Server потерял сессию), открытие
  начинает новую.

### 6. Блокировки и конфликты
- Внутри одной сессии конфликтов нет: Document Server сливает правки (`fast`). Копий не бывает.
- Сохранение с чужим или устаревшим ключом (поздний статус 2 закрытой сессии) отклоняется
  (`error:1`) и никогда не пишется поверх новой версии.
- Файл сменился под сессией (`SaveVersion` получил `ErrConflict`) — отказ. Чтобы этого не было,
  пока у элемента есть сессия, загрузка поверх, переименование типа и «Удалить навсегда» отвечают
  409 «Файл сейчас редактируют». Перемещение и переименование без смены расширения разрешены: id
  тот же.
- Потеря «Правки» во время сессии: при сохранении — отказ (§3). Сразу при смене доступа —
  `/command` `drop` для этого пользователя (в полной реализации).
- В списке и карточке файла — «Редактирует Имя» (статус 1 → `Presence` → событие Диска).

### 7. Откуда открывается
- **Диск** — «Открыть» и двойной клик по xlsx/docx (сделано в спайке). PDF, картинки и остальное —
  как раньше.
- **Вложения задач** — если вложение лежит на Диске, тот же редактор. Обычное вложение (`files`
  без элемента Диска) открывается только на чтение (`GET /api/office/config?file=`, ключ = sha256
  файла): версий у вложения нет. Предлагаем «Сохранить на Диск и править».
- **Файлы чата** — так же: на чтение, «Сохранить на Диск и править».
- Ссылка на файл Диска в чате (`DiskLinkChip`) — тот же редактор.

### 8. Развёртывание (k8s, позже)
- Отдельный `Deployment` `onlyoffice/documentserver:10.0.0` (1 реплика: Community не
  кластеризуется), `Service` и `Ingress` на хосте из env (`OFFICE_DOCS_URL`, например
  `docs.<домен>`).
- Секрет `JWT_SECRET` — Kubernetes Secret, тот же в API как `OFFICE_JWT_SECRET`.
- Хост-страница и темы `theme-calab-*.json` — `ConfigMap`, смонтированные read-only в
  `web-apps/apps/calab` и `web-apps/apps/common/main/resources/themes`.
- PVC на `/var/lib/onlyoffice` (кэш и несохранённые сессии) и `/var/www/onlyoffice/Data`.
- `WOPI_ENABLED=false`, `PLUGINS_ENABLED=false`, `ALLOW_PRIVATE_IP_ADDRESS=true` (Document Server
  ходит к API по in-cluster адресу `OFFICE_API_URL`). `NetworkPolicy`: Document Server ходит только
  к API, а callback и file — только от Document Server.
- Хостов и секретов в коде нет: `OFFICE_*` в env API, origin Document Server клиенту отдаёт
  сервер.
- Стенд (compose) — тот же образ с теми же env, только на тестовом хосте.

### 9. CSP и frame-ancestors
- Ingress Document Server: `Content-Security-Policy: frame-ancestors <PUBLIC_APP_URLS> 'self'` плюс
  origin Electron (`file:`). Встраивать редактор может только Calab.
- Веб Calab (Caddy): `frame-src https:` уже разрешает iframe. `script-src` не меняется.
- **Electron**: навигацию подфреймов режут два guard'а — `windows.ts` (`will-frame-navigate`) и
  `mail/frameGuard.ts`. Им нужно разрешение для origin Document Server. Origin main получает от
  сервера, с которым залогинен (как `rendererServerUrl`), а не от renderer. В спайке этого нет:
  поэтому снимки сделаны на веб-сборке.
- Скрытое окно: iframe редактора держит сокет и таймеры. Правило CLAUDE.md — закрывать редактор,
  если окно скрыто больше 5 минут и нет несохранённых правок (`state=false`); при возврате
  открывать снова.

### 10. Телефон
Community не правит в мобильном вебе, поэтому телефон всегда получает `mode: view`,
`type: mobile` (это совпадает с non-goal задачи). Оболочка `apps/mobile` открывает тот же
веб-клиент. Мобильный просмотр нужно проверить прогоном.

### 11. Стоимость и лимиты
- Сервер Calab: только подпись конфига, отдача файла по ссылке и приём callback. CPU — на
  клиенте (редактор) и на Document Server (конвертация при открытии и сохранении).
- Document Server: один под. Память, CPU и размер образа — замерить по плану (§«План проверки»).
  Исходное предположение для заявки ресурсов: requests 2 GiB RAM и 1 CPU, limits 4 GiB — уточнить
  цифрами.
- Клиент: редактор стоит, только пока открыт. До «Открыть» не грузится ничего, кроме чанка рамки
  (lazy). После закрытия страница возвращается к базовой линии — проверяется в `bench.mjs`.
- Лимиты: размер файла — `OFFICE_MAX_SIZE_MB` (100), ссылка на файл живёт `OFFICE_FILE_URL_TTL`
  (5 мин). Лимита подключений нет (9.4+).

### 12. Вид: что совпадает с Calab без коммерческой лицензии
- Совпадает:
  - рамка Calab (общий `ViewerBar`: имя, «Изменения сохранены» / «Сохраняется…» / «Только
    просмотр», «Скачать», «Закрыть»);
  - тема редактора по теме приложения (`default-dark`/`default-light`, а лучше свои
    `theme-calab-dark`/`-light` с цветами токенов);
  - компактная шапка, имя файла только в рамке, без правой панели, «Справки», «Обратной связи»,
    плагинов и AI.
- Не совпадает:
  - логотип ONLYOFFICE и раздел «О программе» (AGPL и лицензия);
  - экран загрузки ONLYOFFICE;
  - нельзя скрывать вкладки и меню «Файл» (`layout`), и нет своего шрифта интерфейса;
  - вид ленты (табы и иконки) — ONLYOFFICE.

## Что сделано в спайке
- `proto/calaba/v1/office.proto`: `OfficeConfigResponse`, `OfficeMode`.
- `apps/server/internal/office`:
  - конфиг с JWT, `Mode` из битов Диска, ключ сессии, URL файла и callback;
  - интерфейсы `Store`, `Sessions` и `Presence`;
  - тесты с фейками: подпись и чужой секрет, права, статусы 1/2/3/4/6/7, forcesave с тем же
    ключом, новый ключ после сохранения, устаревший ключ, тот же id и имя при новом файле, sha256
    и размер, отказы (без токена, `operation`, SSRF, потеря «Правки», смена типа, файл сменился,
    размер, чужой URL-токен), сессия-сирота;
  - `config/office.go`: `OFFICE_*`, выключено по умолчанию, валидация.
- Клиент:
  - `features/disk/office/` (`OfficeEditor`, `bridge.ts`) за `CALABA_OFFICE=1` /
    `VITE_OFFICE=1`; диалог `office` в `useUi`; «Открыть» xlsx/docx на Диске;
  - тесты vitest: хост-страница с фейковым `DocsAPI` (api.js грузится только после `open`,
    `destroyEditor` на `close`, чужие сообщения игнорируются) и мост.
- `infra/office/calab-editor.{html,js}` — хост-страница.
- Mock API: `GET /api/office/config`, хост-страница и **заглушка** `api.js`
  (`e2e-support/assets/office-stub-api.js`) для снимков рамки.
- `tools/office-fidelity/`: `fixtures.py`, `compare.py`, `bench.mjs`, `run.sh`.

## План проверки (нужен Docker и ≥ 8 ГБ свободно; только localhost)
`tools/office-fidelity/run.sh [OUT]`:
1. Поднимает `onlyoffice/documentserver:10.0.0` на `127.0.0.1:18080` с `JWT_ENABLED=true` и
   секретом в `OUT/ds.env` (не в репозитории). Хост-страница монтируется в
   `web-apps/apps/calab`. Снимает `docker stats` в простое.
2. `fixtures.py OUT` (openpyxl, python-docx):
   - `vacations.xlsx` — формулы VLOOKUP/INDEX/MATCH между листами, SUM, SUMPRODUCT, COUNTIF, TEXT,
     именованный диапазон, объединённые ячейки, форматы дат, ₽ и %, ширины колонок, закрепление,
     условное форматирование (cellIs, expression, colorScale), проверка данных, стили;
   - `contract.docx` — Title, Heading 1/2, нумерованные и маркированные списки, таблица со стилем,
     повтором шапки и объединёнными ячейками, колонтитулы (свой для первой страницы), поля,
     разрыв страницы, альбомная секция, жирный, курсив и цвет.
3. `bench.mjs`:
   - конвертация `/converter` xlsx→xlsx и docx→docx с JWT → `convert-*`;
   - редактор через хост-страницу в Chromium (Playwright): размер загрузки JS редактора, время до
     `ready`, CPU и heap в простое 30 с, правка C4 и абзаца, Ctrl+S → статус 6 → `editor6-*`,
     закрытие → статус 2 → `editor2-*`, CPU, heap и число фреймов после закрытия против базовой
     линии;
   - снимки `editor-{default-dark,default-light}-*.png`.
4. `docker stats` с открытым документом.
5. `compare.py` по каждой паре. Критерий: `convert-*` без изменений; `editor*-*` — ровно одна
   ожидаемая правка. Проверяются формулы (текст), объединения, форматы чисел, ширины, условное
   форматирование, проверки данных, имена, стили, абзацы, стили списков, таблицы, колонтитулы,
   поля.
6. После прогона — снимки со своей темой `theme-calab-*` и с `compactToolbar`.

`compare.py` проверен на контрольных парах: файл против себя — без изменений; openpyxl-пересохранение
с правкой C4 — ровно одно изменение; python-docx с правкой абзаца — ровно одно.

## Что остаётся (оценка ≈ 9–10 дней)
| Работа | Дни |
|---|---|
| Store поверх Диска: `disk.Service` (элемент и биты, `ReplaceFile`), миграция `disk_file_versions` и вида `edit` в `disk_activity`, сборщик сирот, квота версий, «История» с версиями и восстановлением | 2 |
| Sessions в Valkey, «Редактирует Имя» (событие и плашка в списке и карточке), 409 на загрузку поверх или удаление при сессии, `drop` при снятии прав | 1,5 |
| Подключение в `app.go`, `botroutes` (`botDeny`) и `identityroutes`, флаг сервера клиенту вместо `VITE_OFFICE`, интеграционные тесты с Postgres | 1 |
| Electron: origin Document Server в guard'ах (`windows.ts`, `mail/frameGuard.ts`) от сервера, закрытие в скрытом окне, визуальная спека `disk-office` (тёмная, светлая, телефон) | 1 |
| k8s и стенд: Deployment, PVC, Ingress с frame-ancestors, ConfigMap хоста и тем, Secret, NetworkPolicy, ресурсы; docs/06 | 1,5 |
| Вложения задач, файлы чата (просмотр, «Сохранить на Диск и править»), телефон (просмотр) | 1 |
| Прогон плана проверки, правки по итогам, темы `theme-calab-*`, docs/04, docs/08, TESTING | 1,5 |

## Риски
- **Совместимость**: x2t конвертирует OOXML во внутренний формат и обратно. Сводные таблицы,
  макросы, внешние ссылки, срезы, спарклайны и редкое условное форматирование могут измениться.
  Пересчёт идёт формулами ONLYOFFICE, а кэшированные значения пишет он же (боты с
  `data_only=True` читают их). Без прогона §«План проверки» потери неизвестны — это главный
  открытый вопрос.
- **Единственный инстанс** (Community не кластеризуется): падение Document Server — правка
  недоступна, а несохранённые правки живут в его кэше. Нужен PVC и forcesave по таймеру.
- **Лицензия**: AGPL и дополнительные условия, брендинг ONLYOFFICE остаётся. Образ не меняем, своя
  только хост-страница рядом. Если её сочтут модификацией — отдавать её отдельным путём Ingress на
  том же origin.
- **Безопасность**: у Document Server были CVE (в 10.0 исправлены SSRF и перехват сессии в WOPI).
  Держать версию свежей, WOPI выключен, NetworkPolicy. Callback и file проверяют наш токен и JWT
  Document Server, URL скачивания — на origin Document Server.
- **Слабые компьютеры**: редактор — полноценный офис в canvas; он тяжёлый, пока открыт.
  Закрытие освобождает всё (iframe), скрытое окно закрывает редактор.
- **Electron**: без разрешения в guard'ах подфреймов (§9) в приложении будет пустая рамка.
