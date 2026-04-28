# Инструкция по сборке TaskFlow

## Содержание

1. [Обзор процесса сборки](#обзор-процесса-сборки)
2. [Предварительные требования](#предварительные-требования)
3. [Сборка для production](#сборка-для-production)
4. [Сборка Docker-образа](#сборка-docker-образа)
5. [Структура артефактов сборки](#структура-артефактов-сборки)
6. [Сборка с субпутем](#сборка-с-субпутем)
7. [Кросс-компиляция для других платформ](#кросс-компиляция-для-других-платформ)
8. [Скрипты и команды](#скрипты-и-команды)
9. [Устранение ошибок сборки](#устранение-ошибок-сборки)

---

## Обзор процесса сборки

TaskFlow построен на **Next.js 16** с использованием **standalone**-режима вывода. Это означает, что результат сборки — это минимальный самодостаточный Node.js-сервер, не требующий `node_modules` целиком.

**Конвейер сборки:**

```
Исходный код (src/)
      │
      ▼
 TypeScript → JavaScript (next build)
      │
      ▼
 Prisma Client генерация (prisma generate)
      │
      ▼
 Standalone-бандл (.next/standalone/)
      │
      ├── server.js          — точка входа
      ├── .next/             — серверный и клиентский код
      ├── public/            — статические файлы
      ├── node_modules/.prisma/ — сгенерированный Prisma Client
      └── prisma/            — схема БД
```

**Multi-stage Docker-сборка:**

| Stage | Базовый образ | Назначение |
|-------|--------------|------------|
| `deps` | `node:20-alpine` | Установка зависимостей + генерация Prisma Client |
| `builder` | `node:20-alpine` | Сборка Next.js приложения |
| `runner` | `node:20-alpine` | Минимальный production-образ (~120 МБ) |

---

## Предварительные требования

### Локальная сборка

| Инструмент | Версия | Установка |
|-----------|--------|-----------|
| [Bun](https://bun.sh/) | ≥ 1.0 | `curl -fsSL https://bun.sh/install \| bash` |
| [Node.js](https://nodejs.org/) | ≥ 20.x | Через nvm или системный пакет |
| [Git](https://git-scm.com/) | ≥ 2.x | Системный пакет |

> Bun используется как пакетный менеджер и runtime для разработки. Production-сервер запускается через Node.js.

### Docker-сборка

| Инструмент | Версия |
|-----------|--------|
| [Docker](https://docs.docker.com/get-docker/) | ≥ 20.10 |
| [Docker Buildx](https://docs.docker.com/buildx/working-with-buildx/) | ≥ 0.10 (для мультиплатформенной сборки) |

---

## Сборка для production

### 1. Получение исходного кода

```bash
git clone <url-репозитория> taskflow
cd taskflow
```

### 2. Установка зависимостей

```bash
bun install
```

Это установит все зависимости из `bun.lock` и создаст `node_modules/`.

### 3. Генерация Prisma Client

```bash
bun run db:generate
```

Команда запускает `prisma generate`, которая создаёт типизированный клиент базы данных в `node_modules/.prisma/client/`. **Без этого шага сборка не выполнится** — серверный код импортирует Prisma Client.

### 4. Применение схемы БД

```bash
bun run db:push
```

Команда создаёт/обновляет SQLite-файл базы данных в соответствии со схемой `prisma/schema.prisma`. Для чистой сборки с нуля это создаст файл `db/taskflow.db`.

### 5. Сборка Next.js

```bash
bun run build
```

**Что происходит внутри:**

1. `next build` — компиляция TypeScript, сборка серверных и клиентских бандлов
2. Копирование `.next/static` в `.next/standalone/.next/static` — статические файлы должны быть в standalone-бандле
3. Копирование `public/` в `.next/standalone/public` — публичные ресурсы

> **Примечание:** Конфигурация `next.config.ts` содержит `output: "standalone"`, что указывает Next.js создать минимальный самодостаточный сервер.

### 6. Копирование Prisma в standalone

Standalone-бандл не включает Prisma автоматически. Необходимо скопировать:

```bash
# Prisma Client (сгенерированный)
cp -r node_modules/.prisma .next/standalone/node_modules/.prisma
cp -r node_modules/@prisma .next/standalone/node_modules/@prisma

# Схема Prisma (для миграций)
cp -r prisma .next/standalone/prisma
```

### 7. Создание директории для БД

```bash
mkdir -p .next/standalone/db
```

Если есть существующая база данных:

```bash
cp db/taskflow.db .next/standalone/db/
```

### 8. Запуск собранного приложения

```bash
cd .next/standalone
NODE_ENV=production \
DATABASE_URL=file:./db/taskflow.db \
NEXTAUTH_SECRET=your-secret \
NEXTAUTH_URL=http://localhost:3000 \
node server.js
```

---

## Сборка Docker-образа

### Стандартная сборка

```bash
docker build -t taskflow:latest .
```

### Сборка с субпутем

```bash
docker build \
  --build-arg NEXT_BASE_PATH=/taskflow \
  -t taskflow:latest .
```

### Сборка для другой архитектуры (ARM64)

```bash
# Создать мультиплатформенный builder (один раз)
docker buildx create --name multiarch --use

# Собрать для ARM64 (например, для Raspberry Pi)
docker buildx build \
  --platform linux/arm64 \
  -t taskflow:latest \
  --load .
```

### Сборка через docker compose

```bash
# Стандартная
docker compose build

# Без кэша (полная пересборка)
docker compose build --no-cache

# С субпутем
docker compose build --build-arg NEXT_BASE_PATH=/taskflow
```

### Детали Dockerfile

Dockerfile использует трёхстадийную сборку:

**Stage 1 — `deps` (зависимости):**
- Базовый образ: `node:20-alpine`
- Устанавливает bun глобально
- Копирует `package.json` и `bun.lock`
- Выполняет `bun install --frozen-lockfile` (точное воспроизведение зависимостей)
- Генерирует Prisma Client

**Stage 2 — `builder` (сборка):**
- Копирует `node_modules` из stage `deps`
- Копирует весь исходный код
- Поддерживает build-arg `NEXT_BASE_PATH`
- Выполняет `bun run build`

**Stage 3 — `runner` (production):**
- Минимальный образ с `node:20-alpine`
- Создаёт непривилегированного пользователя `taskflow`
- Копирует только необходимые артефакты:
  - `.next/standalone/` — сервер и код
  - `.next/static/` — статические файлы
  - `public/` — публичные ресурсы
  - `node_modules/.prisma/` и `node_modules/@prisma/` — Prisma Client
  - `prisma/` — схема БД
  - `db/` — база данных
- Порт: 3000
- CMD: `node server.js`

**Итоговый размер образа:** ~120–150 МБ (Alpine + Node.js + приложение).

---

## Структура артефактов сборки

### standalone-бандл (`.next/standalone/`)

```
.next/standalone/
├── server.js                    # Точка входа Node.js сервера
├── .next/
│   ├── server/                  # Серверные чанки (API routes, SSR)
│   └── static/                  # Клиентские чанки (JS, CSS)
├── public/                      # Статические файлы (favicon, logo и т.д.)
├── node_modules/
│   ├── .prisma/                 # Сгенерированный Prisma Client
│   └── @prisma/                 # Prisma Runtime
├── prisma/
│   └── schema.prisma            # Схема базы данных
└── db/
    └── taskflow.db              # SQLite база данных
```

### Исходный код проекта

```
taskflow/
├── src/
│   ├── app/                     # Next.js App Router
│   │   ├── page.tsx             # Главная страница
│   │   ├── layout.tsx           # Корневой layout
│   │   ├── globals.css          # Глобальные стили
│   │   └── api/                 # API Routes
│   │       ├── areas/           # CRUD Areas
│   │       ├── projects/        # CRUD Projects
│   │       ├── tasks/           # CRUD Tasks
│   │       ├── notes/           # CRUD Notes
│   │       ├── comments/        # CRUD Comments
│   │       ├── tags/            # CRUD Tags
│   │       └── auth/            # NextAuth.js
│   ├── components/              # React-компоненты
│   │   ├── ui/                  # shadcn/ui компоненты
│   │   ├── kanban-board.tsx     # Канбан-доска
│   │   ├── task-list.tsx        # Список задач
│   │   ├── task-detail-dialog.tsx
│   │   ├── note-editor.tsx
│   │   ├── notes-list.tsx
│   │   └── ...                  # Остальные компоненты
│   ├── store/                   # Zustand store
│   │   └── app-store.ts
│   ├── lib/                     # Утилиты
│   │   ├── auth.ts              # NextAuth конфигурация
│   │   ├── db.ts                # Prisma Client singleton
│   │   ├── constants.ts         # Константы приложения
│   │   ├── types.ts             # TypeScript типы
│   │   └── utils.ts             # Утилиты
│   └── hooks/                   # React hooks
├── prisma/
│   └── schema.prisma            # Схема базы данных
├── public/                      # Публичные статические файлы
├── Dockerfile                   # Multi-stage Docker сборка
├── docker-compose.yml           # Docker Compose конфигурация
├── next.config.ts               # Конфигурация Next.js
├── tsconfig.json                # Конфигурация TypeScript
├── package.json                 # Зависимости и скрипты
└── bun.lock                     # Lockfile зависимостей
```

---

## Сборка с субпутем

Если приложение будет развернуто не в корне домена (например, `example.com/taskflow`), необходимо задать субпуть **при сборке**.

### Почему при сборке?

`NEXT_BASE_PATH` встраивается в клиентские JavaScript-бандлы и HTML-шаблоны во время `next build`. Изменение переменной после сборки не даст эффекта — старые пути будут «зашиты» в бандлах.

### Сборка с субпутем

```bash
# Без Docker
NEXT_BASE_PATH=/taskflow bun run build

# Docker
docker build --build-arg NEXT_BASE_PATH=/taskflow -t taskflow:latest .

# Docker Compose (отредактируйте docker-compose.yml)
# build:
#   args:
#     NEXT_BASE_PATH: "/taskflow"
```

### Что изменяется

- Все внутренние ссылки получают префикс `/taskflow`
- Статические ресурсы (`/_next/...`) получают префикс `/taskflow/_next/...`
- `assetPrefix` в Next.js конфигурации устанавливается автоматически

---

## Кросс-компиляция для других платформ

### Сборка для ARM64 (Raspberry Pi, AWS Graviton)

```bash
# Включить мультиплатформенную сборку
docker buildx create --name multiarch --use

# Собрать и загрузить в Docker
docker buildx build \
  --platform linux/arm64 \
  -t taskflow:arm64 \
  --load .

# Собрать и сразу отправить в registry
docker buildx build \
  --platform linux/arm64 \
  -t registry.example.com/taskflow:arm64 \
  --push .
```

### Мультиплатформенный образ (amd64 + arm64)

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t registry.example.com/taskflow:latest \
  --push .
```

---

## Скрипты и команды

Все команды выполняются через `bun run <скрипт>`:

| Скрипт | Команда | Описание |
|--------|---------|----------|
| `dev` | `next dev -p 3000` | Запуск dev-сервера с горячей перезагрузкой |
| `build` | `next build && cp -r .next/static .next/standalone/.next/ && cp -r public .next/standalone/` | Полная production-сборка |
| `start` | `NODE_ENV=production bun .next/standalone/server.js` | Запуск собранного приложения |
| `lint` | `eslint .` | Проверка качества кода |
| `db:push` | `prisma db push` | Применить схему Prisma к БД |
| `db:generate` | `prisma generate` | Сгенерировать Prisma Client |
| `db:migrate` | `prisma migrate dev` | Создать и применить миграцию |
| `db:reset` | `prisma migrate reset` | Сбросить БД и применить все миграции заново |

### Типичный рабочий процесс разработки

```bash
# 1. Установка зависимостей
bun install

# 2. Настройка БД
bun run db:push

# 3. Разработка
bun run dev

# 4. Проверка кода
bun run lint

# 5. Сборка для production
bun run build

# 6. Запуск production
bun run start
```

---

## Устранение ошибок сборки

### `Error: Cannot find module '@prisma/client'`

**Причина:** Prisma Client не сгенерирован.

**Решение:**
```bash
bun run db:generate
```

---

### `PrismaClient is unable to run in this browser environment`

**Причина:** Prisma Client импортирован в клиентском компоненте.

**Решение:** Убедитесь, что `import { db } from '@/lib/db'` используется только в API-маршрутах (`src/app/api/`), а не в компонентах с `'use client'`.

---

### `Build error: Type 'X' is not assignable to type 'Y'`

**Причина:** Ошибки TypeScript.

**Решение:**
```bash
# Проверить ошибки TypeScript
npx tsc --noEmit

# Если нужно собрать с ошибками TypeScript (не рекомендуется)
# В next.config.ts уже установлено:
# typescript: { ignoreBuildErrors: true }
```

> ⚠️ Для production-сборки рекомендуется исправить все ошибки TypeScript, а не игнорировать их.

---

### `ENOMEM: not enough memory` при сборке

**Причина:** Next.js сборка требует значительного объёма RAM.

**Решение:**
```bash
# Увеличить лимит памяти Node.js
export NODE_OPTIONS="--max-old-space-size=4096"
bun run build

# В Docker — увеличить память контейнера:
docker build --memory=4g -t taskflow:latest .
```

---

### Standalone-сервер не находит статические файлы

**Причина:** Статические файлы и `public/` не скопированы в `.next/standalone/`.

**Решение:** Скрипт `build` в `package.json` уже включает копирование. Если вы запускали `next build` вручную, выполните:
```bash
cp -r .next/static .next/standalone/.next/
cp -r public .next/standalone/
```

---

### Ошибка `DATABASE_URL` при запуске

**Причина:** Переменная `DATABASE_URL` не задана или указывает на несуществующий путь.

**Решение:**
```bash
# Установить переменную (относительный путь от .next/standalone/)
export DATABASE_URL="file:./db/taskflow.db"

# Убедиться, что директория существует
mkdir -p .next/standalone/db

# Абсолютный путь (альтернатива)
export DATABASE_URL="file:/var/lib/taskflow/taskflow.db"
```

---

### Docker-образ слишком большой

**Причины и решения:**

| Причина | Решение |
|---------|---------|
| Остались dev-зависимости | Dockerfile устанавливает только production-зависимости через `--frozen-lockfile` |
| Включены лишние файлы | `.dockerignore` исключает `node_modules`, `.next`, `.git`, `*.md` |
| Не используется Alpine | Dockerfile использует `node:20-alpine` (~50 МБ базовый образ) |

Проверить размер слоёв:
```bash
docker history taskflow:latest
```
