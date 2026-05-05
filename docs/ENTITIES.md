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
