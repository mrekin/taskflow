# Сущности приложения TaskFlow

Справочник основных сущностей и связанных с ними файлов проекта.

## Иерархия сущностей

```
User
 ├── Area          (область)
 │    └── Project  (проект)
 │         ├── Task       (задача → подзадачи)
 │         │    └── Comment  (комментарий)
 │         ├── Note       (заметка)
 │         └── NoteFolder (папка заметок)
 ├── Tag           (тег — привязывается к Area, Project, Task, Note)
 └── Webhook       (вебхук)
      ├── WebhookTrigger  (триггер вебхука)
      └── WebhookDelivery (доставка вебхука)
└── ScheduledJob  (задание шедулера)
```

## Таблица сущностей

| Сущность | Model | API | Компоненты | Стор / Утилиты |
|---|---|---|---|---|
| Пользователь | `User` | `src/lib/auth.ts`<br>`src/lib/auth-utils.ts` | `src/components/settings-view.tsx`<br>`src/components/sidebar-nav.tsx` | `src/store/app-store.ts`<br>`src/app/api/auth/[...nextauth]/route.ts` |
| Область | `Area` | `src/app/api/areas/route.ts`<br>`src/app/api/areas/[id]/route.ts` | `src/components/area-detail.tsx`<br>`src/components/create-area-dialog.tsx`<br>`src/components/sidebar-nav.tsx` | `src/store/app-store.ts`<br>`src/lib/webhook-engine.ts` |
| Проект | `Project` | `src/app/api/projects/route.ts`<br>`src/app/api/projects/[id]/route.ts` | `src/components/project-detail.tsx`<br>`src/components/create-project-dialog.tsx`<br>`src/components/sidebar-nav.tsx` | `src/store/app-store.ts`<br>`src/lib/webhook-engine.ts` |
| Задача | `Task` | `src/app/api/tasks/route.ts`<br>`src/app/api/tasks/[id]/route.ts` | `src/components/task-list.tsx`<br>`src/components/task-card.tsx`<br>`src/components/task-detail-dialog.tsx`<br>`src/components/create-task-dialog.tsx`<br>`src/components/task-comments.tsx`<br>`src/components/kanban-board.tsx` | `src/store/app-store.ts`<br>`src/lib/webhook-engine.ts` |
| Заметка | `Note` | `src/app/api/notes/route.ts`<br>`src/app/api/notes/[id]/route.ts` | `src/components/note-editor.tsx`<br>`src/components/notes-list.tsx`<br>`src/components/create-note-dialog.tsx`<br>`src/components/markdown-renderer.tsx` | `src/store/app-store.ts` |
| Папка заметок | `NoteFolder` | `src/app/api/folders/route.ts`<br>`src/app/api/folders/[id]/route.ts` | `src/components/notes-list.tsx`<br>`src/components/create-note-dialog.tsx` | `src/store/app-store.ts` |
| Комментарий | `Comment` | `src/app/api/comments/route.ts`<br>`src/app/api/comments/[id]/route.ts` | `src/components/task-comments.tsx` | `src/store/app-store.ts` |
| Тег | `Tag` | `src/app/api/tags/route.ts`<br>`src/app/api/tags/[id]/route.ts` | `src/components/tag-picker.tsx`<br>`src/components/tag-badges.tsx` | `src/store/app-store.ts`<br>`src/lib/api-utils.ts` |
| Вебхук | `Webhook` | `src/app/api/webhooks/route.ts`<br>`src/app/api/webhooks/[id]/route.ts` | `src/components/webhooks-section.tsx` | `src/store/app-store.ts`<br>`src/lib/webhook-engine.ts` |
| Триггер вебхука | `WebhookTrigger` | `src/app/api/webhooks/triggers/route.ts`<br>`src/app/api/webhooks/triggers/[triggerId]/route.ts` | `src/components/webhooks-section.tsx`<br>`src/components/task-detail-dialog.tsx` | `src/store/app-store.ts`<br>`src/lib/webhook-engine.ts` |
| Доставка вебхука | `WebhookDelivery` | `src/app/api/webhooks/[id]/deliveries/route.ts` | `src/components/webhooks-section.tsx` | `src/store/app-store.ts`<br>`src/lib/webhook-engine.ts` |
| Задание шедулера | `ScheduledJob` | — | — | `src/lib/scheduler.ts`<br>`src/instrumentation.ts` |

## Общие файлы

Эти файлы используются несколькими сущностями одновременно:

| Файл | Назначение |
|---|---|
| `src/store/app-store.ts` | Единый Zustand-стор для всех сущностей |
| `src/lib/types.ts` | TypeScript-интерфейсы всех сущностей |
| `src/lib/db.ts` | Экземпляр Prisma Client |
| `src/lib/utils.ts` | Общие утилиты (shortId, форматирование) |
| `src/lib/constants.ts` | Константы приложения |
| `src/lib/webhook-engine.ts` | Движок отправки вебхуков (Task, Area, Project) |
| `src/lib/scheduler.ts` | Фоновый шедулер (due date webhooks, etc.) |
| `src/instrumentation.ts` | Точка входа шедулера (автозапуск при старте сервера) |
| `src/components/app-shell.tsx` | Оболочка приложения, навигация между сущностями |
| `src/components/home-content.tsx` | Главная страница, сводка по сущностям |
| `src/components/quick-create.tsx` | Быстрое создание задач, заметок, проектов |
| `prisma/schema.prisma` | Схема БД, все модели |

## Вебхуки: Webhook, WebhookTrigger, Event, WebhookDelivery

### Webhook (вебхук)

HTTP-запрос, который отправляется при наступлении определённых событий. Содержит настройки доставки:

- **URL** — адрес, на который отправляется запрос
- **Method** — HTTP-метод (GET / POST)
- **Headers** — кастомные заголовки (JSON)
- **Body Template** — шаблон тела запроса с плейсхолдерами (`{entityId}`, `{title}`, `{status}` и др.)
- **Active** — флаг включён/выключен

### Event (событие)

Строковый идентификатор типа происшедшего действия. События не хранятся в БД отдельно — это предопределённые константы:

| Событие | Описание |
|---|---|
| `task.status_changed` | Изменён статус задачи |
| `task.priority_changed` | Изменён приоритет задачи |
| `task.due_date_reached` | Наступила дата выполнения задачи (шедулер) |
| `task.created` | Задача создана |
| `project.status_changed` | Изменён статус проекта |
| `project.created` | Проект создан |

### WebhookTrigger (триггер)

Правило, связывающее вебхук с конкретными **событиями** и **областью (scope)**. Один вебхук может иметь **несколько триггеров** — для разных комбинаций событий и scope.

Поля триггера:

- **events** — массив строк с событиями (например, `["task.status_changed", "task.created"]`)
- **scopeType** — тип области: `null` (глобально), `"area"`, `"project"`, `"task"`
- **scopeId** — ID конкретной сущности области (area/project/task) или `null` для глобального scope
- **active** — флаг активности триггера

**Примеры:**
- Триггер `{ events: ["task.status_changed"], scopeType: null, scopeId: null }` — срабатывать при изменении статуса любой задачи (глобальный scope)
- Триггер `{ events: ["task.created"], scopeType: "project", scopeId: "abc123" }` — срабатывать при создании задачи в конкретном проекте
- Триггер `{ events: ["task.due_date_reached"], scopeType: "task", scopeId: "xyz789" }` — срабатывать при наступлении deadline конкретной задачи

### WebhookDelivery (доставка)

Запись о каждой попытке отправки вебхука. Содержит HTTP-статус, тело ответа, флаг успеха и timestamp. Используется для истории и отладки.

### Как это работает вместе

```
Событие (например, task.status_changed)
  → webhook-engine ищет все WebhookTrigger, у которых:
      • events содержит это событие
      • scope совпадает с сущностью (или глобальный)
      • webhook.active = true и trigger.active = true
  → для каждого подходящего триггера: dispatchWebhook()
    → отправляет HTTP-запрос по настройкам Webhook (URL, method, headers, body)
    → создаёт WebhookDelivery с результатом
```
