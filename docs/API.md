# TaskFlow REST API — доступ по персональному токену

Справочник программного доступа к TaskFlow через персональные API-токены. Для UI приложение по-прежнему использует сессионную cookie — оба механизма работают параллельно и не конфликтуют: браузер шлёт cookie, скрипты/MCP шлют заголовок.

## Быстрый старт

1. **Settings → API Tokens → Add Token** в веб-интерфейсе
2. Задайте имя, скоуп (все проекты / список проектов), права (матрица «сущность × действие»), срок действия
3. Скопируйте токен — **он показывается один раз**, хранится только SHA-256 хэш
4. Используйте заголовок `Authorization: Bearer <token>`:

```bash
curl -H "Authorization: Bearer tfa_4f1a..." https://your-taskflow/taskflow/api/tasks
```

Формат токена: `tfa_` + 40 hex-символов. Токен передаётся в **каждом** запросе — сервер проверяет его по БД на каждый вызов, поэтому отзыв действует мгновенно.

## Управление токенами

Эти эндпоинты работают только с сессией (cookie), через токен они недоступны:

| Метод | Путь | Описание |
|---|---|---|
| `GET` | `/api/user/tokens` | Список своих токенов (без секретов) |
| `POST` | `/api/user/tokens` | Создать. Тело: `{ name, scopeType: "all"\|"projects", projectIds?, permissions, expiresAt? }`. Ответ `201 { token: "<raw>", record }` — `token` показывается один раз |
| `POST` | `/api/user/tokens/[id]/revoke` | Отозвать (мгновенно, идемпотентно) |
| `DELETE` | `/api/user/tokens/[id]` | Удалить из списка |

Ограничения: 20 токенов на пользователя, имя ≤ 64 символа и уникально.

`permissions` — объект вида:

```json
{
  "tasks":    { "read": true, "create": true, "update": true, "delete": false },
  "notes":    { "read": true, "create": false, "update": false, "delete": false },
  "comments": { "read": true, "create": true, "update": false, "delete": false }
}
```

## Эндпоинты, доступные токену

| Роут | Методы | Требуемое право | Примечание |
|---|---|---|---|
| `/api/token-info` | только GET | — (сам токен) | Интроспекция: имя, матрица прав, эффективный скоуп (с именами проектов), срок действия. Сессией недоступен — только Bearer |
| `/api/tasks` | GET, POST | `tasks:read` / `tasks:create` | GET: фильтры `projectId`, `status`, `parentId`, `search`, `assigneeId`, `tagIds`, `dueFrom`, `dueTo`, пагинация `limit`/`offset` |
| `/api/tasks/[id]` | GET, PUT, DELETE | `tasks:read/update/delete` | PUT: если переносите задачу в другой проект, целевой проект тоже должен быть в скоупе |
| `/api/notes` | GET, POST | `notes:read/create` | GET: фильтры `projectId`, `folderId`, `tagIds`, пагинация `limit`/`offset` |
| `/api/notes/[id]` | GET, PUT, DELETE | `notes:read/update/delete` | |
| `/api/notes/search` | GET | `notes:read` | Параметр `search` (текст, `N-3`, `F-2`, дата, год) |
| `/api/notes/[id]/versions` | GET, POST, DELETE | `notes:read` / `notes:update` | |
| `/api/notes/[id]/versions/[number]` | GET, PATCH | `notes:read` / `notes:update` | PATCH: pin (`kept`) |
| `/api/notes/[id]/versions/[number]/restore` | POST | `notes:update` | |
| `/api/comments` | GET, POST | `comments:read/create` | GET требует `?taskId=`; создание комментария требует право на чтение задачи (существующая семантика приложения) |
| `/api/comments/[id]` | PUT, DELETE | `comments:update/delete` | Сервисные правила автора/владельца задачи сохраняются |
| `/api/folders` | GET, POST | `notes:read/create` | Папки следуют правам заметок 1:1; GET: фильтры `projectId`, `parentId`, пагинация `limit`/`offset` |
| `/api/folders/[id]` | GET, PUT, DELETE | `notes:read/update/delete` | |
| `/api/attachments` | GET, DELETE | право чтения/удаления родителя | GET: `?entityId=&entityType=`; родитель определяет тип права (task→tasks, note→notes, comment→comments) |
| `/api/attachments/file/[blobId]` | GET | право чтения родителя | Файл доступен, если **хотя бы одна** ссылающаяся сущность в скоупе (блобы дедуплицируются по хэшу) |
| `/api/attachments/upload` | POST (multipart: `file`, `entityId`, `entityType`) | право **`update`** родителя | Владение сущностью и лимиты (размер/количество/типы/хранилище) проверяет сервис — те же, что для сессии |
| `/api/search` | только GET | `tasks:read` и/или `notes:read` | Глобальный поиск: `{ q, tasks, notes, folders, projects }`. Секции без права у токена опускаются; скоуп применяется к каждой секции. Параметры: `q` (обязателен, ≤ 200), `limit` на секцию (1..100, по умолчанию 20) |
| `/api/tags` | только GET | любое право `read` | Теги — пользовательский уровень, мутации тегов через токен запрещены |
| `/api/projects` | только GET | любое право `read` | Отдаёт только проекты в скоупе |
| `/api/areas` | только GET | любое право `read` | Отдаёт только области, содержащие скоуп-проекты |

## Пагинация и фильтры списков

- Ответы списков остаются **голым JSON-массивом**. Пагинация включается только явной передачей `limit` и/или `offset`; без них список возвращается целиком — существующие клиенты не меняются.
- При пагинации полный размер выборки (с учётом фильтров, но без `limit`/`offset`) передаётся заголовком **`X-Total-Count`**.
- Лимиты: `limit` — целое 1..500, `offset` — целое ≥ 0, иначе `400 {"error": "Invalid limit: ..."}`.
- Пагинируются `tasks`, `notes`, `folders`. `comments` (всегда строго по `taskId`), `tags`, `projects`, `areas` сознательно не пагинируются — списки маленькие.
- `tagIds` — через запятую, семантика **OR** (сущность с любым из тегов): `?tagIds=<id1>,<id2>`.
- `dueFrom`/`dueTo` (tasks) — инклюзивно; `YYYY-MM-DD` трактуется как UTC-день (`dueTo` включает весь день), полный ISO тоже принимается. Задачи без `dueDate` исключаются.

## Эндпоинты, закрытые для токенов

`export`, `export-files`, `import`, `webhooks/*`, `users/*`, `user/profile`, `user/preferences`, `attachments/check`, `attachments/config`, `attachments/storage`, `attachments/user-files`, `tags` (POST/PUT/DELETE), `tags/usage`, `projects`/`areas` (POST/PUT/DELETE).

Запрос с валидным токеном на них → `403 {"error": "API tokens are not allowed on this endpoint"}`. Публичные эндпоинты (`/api/config`, `/api/settings`) заголовок игнорируют.

## Семантика ошибок

| Статус | Значение | Примеры |
|---|---|---|
| `401` | Аутентификация не удалась | `"Invalid Authorization header format. Expected: Bearer <token>"`, `"Unsupported Authorization scheme"`, `"Invalid API token"`, `"API token has been revoked"`, `"API token has expired"` |
| `403` | Токен валиден, но конфигурация не позволяет | `"API token missing permission: tasks:update"`, `"Entity is outside the token's project scope"`, `"API tokens are not allowed on this endpoint"` |
| `404` / существующие статусы | Данные недоступны на уровне приложения | задачи/заметки/папки — 404, вложения — 403 (как в UI) |

Все ошибки имеют форму `{ "error": "<message>" }`. Порядок проверок: право → скоуп → данные.

## Правила скоупа

- Скоуп пересчитывается **на каждый запрос**: `scope = (scopeType='all' ? все проекты, видимые пользователю сейчас : projectIds) ∩ проекты, видимые пользователю`. Токен никогда не даёт больше, чем видит сам пользователь.
- Новые проекты пользователя автоматически попадают в скоуп «all»; потеря доступа к расшаренному проекту мгновенно сужает любой токен.
- **Inbox-сущности** (`projectId = null`) недоступны ни одному токену: в списках отфильтрованы, напрямую — 403.
- Сущность привязана к скоупу по собственному `projectId`: подзадача в проекте вне скоупа недоступна, даже если родительская задача в скоупе.
- Комментарии наследуют проект родительской задачи. Вне скоупа: `GET` возвращает `[]`, `POST` — `404 "Task not found"` (та же «ленивая» форма, что у неизвестной задачи).
- Файлы вложений: блоб дедуплицируется между сущностями, поэтому доступен, если хотя бы одна ссылающаяся сущность читаема и в скоупе.

## Прочее

- `lastUsedAt` на токене обновляется не чаще 1 раза в 60 секунд (защита SQLite от записи на каждый вызов).
- Каждое действие через токен логируется в консоль сервера: `[api-token] "Имя" (tfa_префикс) METHOD /path`.
- `NOAUTH_MODE`/`DEMO_MODE` не влияют на токен-запросы: без заголовка работает прежнее поведение (demo-пользователь), с заголовком — только токен. Токены demo-пользователя стираются demo-ресетом.
- Работает за reverse proxy и при subpath-деплое (`NEXT_BASE_PATH`) — аутентификация не зависит от пути.
- Требуется HTTPS в продакшене: токен эквивалентен паролю.

## Заметки для MCP-потребителя

- Перечисленные выше эндпоинты образуют полную поверхность инструментов: интроспекция прав (`token-info`), навигация (`projects`/`areas` GET), CRUD задач и заметок, поиск (включая глобальный `/api/search`), версии, комментарии, вложения.
- Списки по умолчанию возвращаются целиком; при больших выборках используйте `limit`/`offset` и заголовок `X-Total-Count` либо сужайте фильтрами (`projectId`, `tagIds`, даты).
- Различайте 401 (чинить токен) и 403 (чинить конфигурацию токена: право/скоуп) и 404 (нет данных).
- Перед записью агент может узнать свои права заранее: `GET /api/token-info` возвращает матрицу прав и скоуп.
- Один процесс MCP обычно работает от одного пользователя: создавайте один токен с минимально достаточными правами, отзыв — мгновенный.
