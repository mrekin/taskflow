# TaskFlow MCP Server

MCP-сервер (Model Context Protocol) для работы с [TaskFlow](../taskflow) через персональные API-токены. Python + официальный `mcp` SDK (FastMCP), транспорт stdio.

## Возможности

35 инструментов, полный CRUD по всему, что доступно токену:

| Группа | Инструменты |
|---|---|
| Правила | `howto` — правила работы, заданные пользователем (вызывайте первым) |
| Интроспекция | `whoami` — права и скоуп токена |
| Задачи | `task_list`, `task_get`, `task_create`, `task_update`, `task_delete` |
| Заметки | `note_list`, `note_get`, `note_create`, `note_update`, `note_delete`, `note_search` |
| Версии заметок | `note_version_list`, `note_version_restore` |
| Комментарии | `comment_list`, `comment_create`, `comment_update`, `comment_delete` |
| Папки | `folder_list`, `folder_create`, `folder_update`, `folder_delete` |
| Релизы | `release_list`, `release_get`, `release_contents` (только чтение) |
| Навигация | `project_list`, `area_list`, `tag_list` (только чтение) |
| Статусы | `statuses_list` — набор статусов владельца токена (как в его настройках Kanban) |
| Вложения | `attachment_list`, `attachment_get`, `attachment_upload` (требует update-право на родительскую сущность), `attachment_delete` |
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
| `TASKFLOW_MAX_DOWNLOAD_MB` | `5` | Кап размера вложения для base64-выдачи |
| `TASKFLOW_HOWTO` | — | Правила работы (markdown прямо в env) для тула `howto` |
| `TASKFLOW_HOWTO_FILE` | — | Путь к md-файлу с правилами; главнее `TASKFLOW_HOWTO` |

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
