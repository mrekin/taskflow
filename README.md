# TaskFlow MCP Server

MCP-сервер (Model Context Protocol) для работы с [TaskFlow](../taskflow) через персональные API-токены. Python + официальный `mcp` SDK (FastMCP), транспорт stdio.

## Возможности

39 инструментов, полный CRUD по всему, что доступно токену:

| Группа | Инструменты |
|---|---|
| Правила | `howto` — правила работы, заданные пользователем (вызывайте первым) |
| Интроспекция | `whoami` — права и скоуп токена |
| Задачи | `task_list`, `task_get`, `task_create`, `task_update`, `task_delete` |
| Заметки | `note_list`, `note_get`, `note_create`, `note_update`, `note_delete`, `note_search` |
| Версии заметок | `note_version_list`, `note_version_restore` |
| Комментарии | `comment_list` (лимит «N последних», поиск по подстроке), `comment_create`, `comment_update`, `comment_delete` |
| Инлайн-комментарии заметок | `note_comment_list`, `note_comment_create` (якорь: quote + prefix/suffix + offset), `note_comment_update` (текст/`resolved`), `note_comment_delete` |
| Папки | `folder_list`, `folder_create`, `folder_update`, `folder_delete` |
| Релизы | `release_list`, `release_get`, `release_contents` (только чтение) |
| Навигация | `project_list`, `area_list`, `tag_list` (только чтение) |
| Статусы | `statuses_list` — набор статусов владельца токена (как в его настройках Kanban) |
| Вложения | `attachment_list`, `attachment_get`, `attachment_upload` (требует update-право на родительскую сущность; источник — `file_path` на машине сервера **или** `content_base64`+`file_name` для удалённых клиентов), `attachment_delete` |
| Поиск | `search` — глобальный (задачи + заметки + папки + проекты) |

Не выставлены (API не даёт токену): webhooks, управление токенами, мутации проектов/областей/тегов, мутации релизов (создание/редактирование/удаление — только по сессии в UI), ручные снапшоты/pin/delete версий заметок.

`task_id` в тулзах задач/комментариев/вложений принимает и внутренний id (cuid), и короткий номер `T-<n>` — он резолвится автоматически через поиск; неоднозначный номер (короткие id уникальны в рамках владельца) вернёт ошибку со списком кандидатов.

Релизы доступны токену на чтение (`release_list`/`release_get`, видимость владельца токена). Привязка сущностей к релизу — поле `release_id` в `task_create`/`task_update`/`note_create`/`note_update`/`folder_create`/`folder_update` (пустая строка `""` отвязывает). Состав релиза — `release_contents` (берёт списки проекта и фильтрует по `releaseId`). Релизы появились в TaskFlow 0.7.x (T-61): на старом бэкенде `release_list` вернёт 404 — обновите TaskFlow.

Статусы задач — конфигурация, а не константа: уровень инсталляции (`KANBAN_COLUMNS`) плюс персональные наборы пользователей. `statuses_list` возвращает сведённый набор владельца токена (персональный, иначе инсталляционный, иначе дефолт) — используйте его `id` в `status` тулов задач. Неизвестный id сохранится как есть, но в UI попадёт в колонку «Invalid state». Теги аналогично пользовательские — их discovery через `tag_list`. Эндпоинт `GET /api/statuses` появился в TaskFlow вместе с этим тулом: на старом бэкенде `statuses_list` вернёт 404 — обновите TaskFlow.

## Настройка

1. В TaskFlow: **Settings → API Tokens → Add Token** — задайте минимально достаточные права. Токен (`tfa_...`) показывается **один раз**.
2. Скопируйте `.env.example` → `.env` и заполните:

| Переменная | По умолчанию | Описание |
|---|---|---|
| `TASKFLOW_URL` | `http://localhost:3000` | URL инстанса (схема в URL: `http` для тестов, `https` для прода) |
| `TASKFLOW_BASE_PATH` | пусто | Субпуть деплоя (`NEXT_BASE_PATH`), например `/taskflow` |
| `TASKFLOW_API_BASE` | — | Полный оверрайд базы API (`https://host/taskflow/api`), главнее URL+BASE_PATH |
| `TASKFLOW_API_TOKEN` | — | Персональный токен (обязателен для вызовов) |
| `TASKFLOW_TIMEOUT` | `30` | Таймаут запроса, сек |
| `TASKFLOW_MAX_LIST_ITEMS` | `200` | Кап списков, когда вызывающий не задал `limit` |
| `TASKFLOW_MAX_DOWNLOAD_MB` | `5` | Кап размера вложения: для base64-выдачи (`attachment_get`) и для inline-загрузки (`attachment_upload` с `content_base64`, размер декодированный) |
| `TASKFLOW_HOWTO` | — | Правила работы (markdown прямо в env) для тула `howto` |
| `TASKFLOW_HOWTO_FILE` | — | Путь к md-файлу с правилами; главнее `TASKFLOW_HOWTO` |
| `TASKFLOW_MCP_TRANSPORT` | `stdio` | Транспорт MCP: `stdio` (локальный клиент), `streamable-http` (по сети) или `both` (stdio + сеть в одном процессе), см. [«Работа по сети»](#работа-по-сети) |
| `TASKFLOW_MCP_HOST` | `127.0.0.1` | Адрес bind HTTP-сервера (только сетевой режим) |
| `TASKFLOW_MCP_PORT` | `8000` | Порт HTTP-сервера (только сетевой режим) |
| `TASKFLOW_MCP_PATH` | `/mcp` | URL-путь MCP-эндпоинта (только сетевой режим) |
| `TASKFLOW_MCP_AUTH_TOKEN` | — | Общий секрет эндпоинта: клиенты шлют `Authorization: Bearer <значение>`. Пусто — эндпоинт открыт |
| `TASKFLOW_MCP_LOG_FILE` | — | Файл для зеркала логов HTTP-транспорта (ротация 50 МБ + одна копия). Без него проблемы сетевой стороны невидимы при stdio-спавне клиентом |
| `TASKFLOW_MCP_STATELESS` | `false` | Stateless-сессии HTTP (каждый запрос самостоятелен, без `Mcp-Session-Id`) |

Все переменные можно передавать и через `env` конфига MCP-клиента (тогда `.env` не нужен).

### Правила работы (howto)

Агент вызывает `howto` первым (это же предписывают server instructions) и дальше следует правилам. Правила задаёте вы:

```bash
# либо короткий текст прямо в env
TASKFLOW_HOWTO="Всегда спрашивай разрешения заводить задачу"
# либо файл (удобнее для развёрнутых правил; перекрывает текст в env)
TASKFLOW_HOWTO_FILE=/home/user/taskflow-howto.md
```

Пример `taskflow-howto.md`:

```markdown
# Правила работы с TaskFlow
- Всегда спрашивай разрешения заводить задачу.
- Новые задачи — в проект TaskFlow, приоритет medium по умолчанию.
- Не удаляй задачи без явного подтверждения.
```

Файл читается на каждый вызов `howto` — правки подхватываются без рестарта сервера.

## Запуск

```bash
uv sync                      # создать venv и поставить зависимости
uv run taskflow-mcp          # stdio-сервер
```

Требования: Python ≥ 3.10, [uv](https://docs.astral.sh/uv/).

## Регистрация в Claude Code

Проектный `.mcp.json` (в каталоге проекта):

```jsonc
{
  "mcpServers": {
    "taskflow": {
      "command": "uv",
      "args": ["--directory", "/home/vardas/taskflow_mcp", "run", "taskflow-mcp"],
      "env": {
        "TASKFLOW_URL": "http://localhost:3100",
        "TASKFLOW_BASE_PATH": "/taskflow",
        "TASKFLOW_API_TOKEN": "tfa_..."
      }
    }
  }
}
```

или одной командой:

```bash
claude mcp add taskflow \
  --env TASKFLOW_URL=http://localhost:3100 \
  --env TASKFLOW_BASE_PATH=/taskflow \
  --env TASKFLOW_API_TOKEN=tfa_... \
  -- uv --directory /home/vardas/taskflow_mcp run taskflow-mcp
```

Токен эквивалентен паролю — используйте токен с минимальными правами (например, только чтение) и отзывайте, когда он больше не нужен.

## Работа по сети

По умолчанию сервер работает по stdio — клиент должен быть на той же машине. Чтобы подключаться с других машин, включите streamable-http транспорт.

**Одновременно stdio и сеть** (`both`) — локальный клиент (Claude Code) продолжает запускать процесс как обычно, и тот же процесс слушает TCP:

```bash
TASKFLOW_MCP_TRANSPORT=both \
TASKFLOW_MCP_HOST=0.0.0.0 \
TASKFLOW_MCP_PORT=8000 \
TASKFLOW_MCP_AUTH_TOKEN=<случайный секрет, напр. openssl rand -hex 24> \
uv run taskflow-mcp
```

stdio живёт в главном потоке, HTTP — в фоновом; если порт занят (например, другой уже запущенный экземпляр), HTTP не стартует, но stdio продолжает работать.

**Только сеть** (`streamable-http`) — то же самое без stdio:

```bash
TASKFLOW_MCP_TRANSPORT=streamable-http \
TASKFLOW_MCP_HOST=0.0.0.0 \
TASKFLOW_MCP_PORT=8000 \
TASKFLOW_MCP_AUTH_TOKEN=<случайный секрет, напр. openssl rand -hex 24> \
uv run taskflow-mcp
```

Подключение с другой машины — в `.mcp.json` клиента:

```jsonc
{
  "mcpServers": {
    "taskflow": {
      "type": "http",
      "url": "http://server-host:8000/mcp",
      "headers": { "Authorization": "Bearer <TASKFLOW_MCP_AUTH_TOKEN>" }
    }
  }
}
```

или одной командой:

```bash
claude mcp add --transport http taskflow http://server-host:8000/mcp \
  --header "Authorization: Bearer <TASKFLOW_MCP_AUTH_TOKEN>"
```

Как это устроено:

- **Токен TaskFlow по-прежнему один и хранится на сервере** (`TASKFLOW_API_TOKEN` в его env). Все подключённые клиенты действуют с правами этого токена — выдавайте `TASKFLOW_MCP_AUTH_TOKEN` только тем, кому доверяете такие права.
- `TASKFLOW_MCP_AUTH_TOKEN` защищает сам MCP-эндпоинт. Без него эндпоинт открыт — при bind не на loopback сервер предупредит в логе.
- По умолчанию сервер слушает `127.0.0.1` — доступен только с той же машины; для доступа извне укажите `TASKFLOW_MCP_HOST=0.0.0.0` (или IP нужного интерфейса).
- **Шифрование (HTTPS) — не внутри сервера**: в доверенной сети (LAN, Tailscale/WireGuard — там трафик уже зашифрован) достаточно HTTP. Для доступа из интернета поставьте перед сервером reverse-proxy (nginx/caddy) с Let's Encrypt и держите сервер на `127.0.0.1`; либо используйте SSH-туннель (`ssh -L 8000:localhost:8000 server`) — тогда вовсе без секретов и открытых портов.
- `TASKFLOW_MCP_STATELESS=1` полезен за прокси/при нестабильных соединениях: каждая сессия живёт один запрос, `Mcp-Session-Id` не нужен.

## Отладка

```bash
uv run mcp dev src/taskflow_mcp/server.py   # MCP Inspector: список тулз, вызовы вручную
```

## Семантика ошибок

| Сообщение | Что делать |
|---|---|
| `Authentication failed (401)` | Токен неверен/отозван/истёк — создать новый |
| `Forbidden (403)` | Поправить матрицу прав или скоуп токена в Settings → API Tokens |
| `Not found (404)` | Нет данных (или скрыто visibility/скоупом) |
| `Cannot connect to TaskFlow` | Сервер не запущен / неверный `TASKFLOW_URL`/`TASKFLOW_BASE_PATH` |

Особенности скоупа: Inbox-сущности (без проекта) токену недоступны; подзадачи наследуют проект родителя; скоуп пересчитывается на каждый запрос.
