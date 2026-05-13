# Инструкция по развертыванию TaskFlow

## Содержание

1. [Системные требования](#системные-требования)
2. [Развертывание через Docker (рекомендуется)](#развертывание-через-docker-рекомендуется)
3. [Развертывание без Docker](#развертывание-без-docker)
4. [Переменные окружения](#переменные-окружения)
5. [Настройка обратного прокси](#настройка-обратного-прокси)
6. [Настройка OIDC / SSO](#настройка-oidc--sso)
7. [Резервное копирование](#резервное-копирование)
8. [Обновление](#обновление)
9. [Устранение неполадок](#устранение-неполадок)

---

## Системные требования

| Компонент | Минимум | Рекомендуется |
|-----------|---------|---------------|
| CPU       | 1 ядро  | 2 ядра        |
| RAM       | 512 МБ  | 1 ГБ          |
| Диск      | 1 ГБ    | 5 ГБ (с учетом данных) |
| ОС        | Linux (x86_64 / ARM64) | Ubuntu 22.04+ / Debian 12+ |

**При установке через Docker:**

- [Docker](https://docs.docker.com/get-docker/) ≥ 20.10
- [Docker Compose](https://docs.docker.com/compose/install/) ≥ 2.0 (входит в Docker Desktop)

**При установке без Docker:**

- [Node.js](https://nodejs.org/) ≥ 20.x
- [Bun](https://bun.sh/) ≥ 1.0 (или npm ≥ 9)

---

## Развертывание через Docker (рекомендуется)

### 1. Клонирование репозитория

```bash
git clone <url-репозитория> taskflow
cd taskflow
```

### 2. Настройка переменных окружения

Создайте файл `.env` в корне проекта (или отредактируйте `docker-compose.yml`):

```bash
# Обязательные
NEXTAUTH_SECRET=<сгенерируйте-надежный-секрет>    # openssl rand -base64 32
NEXTAUTH_URL=https://your-domain.com               # URL вашего приложения

# База данных (по умолчанию SQLite)
DATABASE_URL=file:./db/taskflow.db

# Опционально: OIDC
# OIDC_ISSUER=https://keycloak.example.com/realms/your-realm
# OIDC_CLIENT_ID=taskflow
# OIDC_CLIENT_SECRET=<client-secret>

# Опционально: субпуть (если за прокси на /app)
# NEXT_BASE_PATH=/app
```

> ⚠️ **Обязательно** замените `NEXTAUTH_SECRET` на уникальный секретный ключ в production!

### 3. Запуск

```bash
docker compose up -d
```

Приложение будет доступно на `http://localhost:3000`.

### 4. Проверка

```bash
# Проверить статус контейнера
docker compose ps

# Посмотреть логи
docker compose logs -f taskflow

# В логах при старте должна быть строка шедулера:
# [Scheduler] Started. Interval: 1 min. Pending jobs: 0

# Проверить доступность
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
# Ожидаемый ответ: 200
```

### 5. Остановка

```bash
docker compose down        # Остановить, сохранить данные
docker compose down -v     # Остановить и УДАЛИТЬ данные
```

---

## Развертывание без Docker

### 1. Установка зависимостей

```bash
git clone <url-репозитория> taskflow
cd taskflow

# Установить bun (если не установлен)
curl -fsSL https://bun.sh/install | bash

# Установить зависимости проекта
bun install
```

### 2. Настройка базы данных

```bash
# Применить схему Prisma к SQLite
bun run db:push

# Сгенерировать Prisma Client
bun run db:generate
```

База данных создается автоматически в `db/taskflow.db` (путь настраивается через `DATABASE_URL`).

### 3. Сборка приложения

```bash
bun run build
```

Результат сборки — standalone-бандл в `.next/standalone/`.

### 4. Запуск в production

```bash
bun run start
# или напрямую:
# NODE_ENV=production node .next/standalone/server.js
```

### 5. Запуск как systemd-сервис (Linux)

Создайте файл `/etc/systemd/system/taskflow.service`:

```ini
[Unit]
Description=TaskFlow Application
After=network.target

[Service]
Type=simple
User=taskflow
WorkingDirectory=/opt/taskflow
ExecStart=/usr/bin/node .next/standalone/server.js
Restart=on-failure
RestartSec=10

Environment=NODE_ENV=production
Environment=PORT=3000
Environment=DATABASE_URL=file:./db/taskflow.db
Environment=NEXTAUTH_SECRET=your-secret-here
Environment=NEXTAUTH_URL=https://your-domain.com

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable taskflow
sudo systemctl start taskflow

# Проверить статус
sudo systemctl status taskflow
```

---

## Переменные окружения

| Переменная | Обязательная | По умолчанию | Описание |
|------------|:---:|--------------|----------|
| `NEXTAUTH_SECRET` | ✅ | `taskflow-dev-secret-change-in-production` | Секретный ключ для JWT-сессий. **Обязательно замените в production!** |
| `NEXTAUTH_URL` | ✅ | `http://localhost:3000` | Полный URL приложения (для корректной работы OAuth и редиректов) |
| `DATABASE_URL` | ❌ | `file:./db/taskflow.db` | Путь к SQLite-базе. Формат: `file:<относительный_путь>` или `file:<абсолютный_путь>` |
| `PORT` | ❌ | `3000` | Порт HTTP-сервера |
| `OIDC_ISSUER` | ❌ | — | URL OIDC-провайдера (например, Keycloak realm) |
| `OIDC_CLIENT_ID` | ❌ | — | Client ID у OIDC-провайдера |
| `OIDC_CLIENT_SECRET` | ❌ | — | Client Secret у OIDC-провайдера |
| `NOAUTH_MODE` | ❌ | — | Пропустить аутентификацию, автоматический вход как демо-пользователь |
| `DEMO_MODE` | ❌ | — | Публичный демо-режим с автоматическим сбросом БД (несовместим с `NOAUTH_MODE` и OIDC) |
| `DEMO_RESET_MIN` | ❌ | `15` | Интервал сброса БД в минутах. Не рекомендуется ставить ниже 5 — пользователь должен успеть попробовать (только при `DEMO_MODE=true`) |
| `NEXT_BASE_PATH` | ❌ | `""` | Субпуть для развертывания за прокси (например, `/taskflow`) |
| `KANBAN_COLUMNS` | ❌ | — | Кастомные колонки канбан по умолчанию для всех пользователей. Формат: `Label:color,Label:color` или JSON-массив |
| `SCHEDULER_INTERVAL_MIN` | ❌ | `1` | Интервал фонового шедулера в минутах (due date webhooks и др.) |
| `ATTACHMENT_MAX_SIZE` | ❌ | `10485760` | Максимальный размер файла вложения в байтах (по умолчанию 10 МБ) |
| `ATTACHMENT_MAX_PER_ENTITY` | ❌ | `10` | Максимальное количество вложений на задачу или заметку |
| `ATTACHMENT_ALLOWED_PATTERNS` | ❌ | `*` | Разрешённые типы файлов (glob-маски через запятую). `*` = разрешить все |
| `STORAGE_ADAPTER` | ❌ | `local` | Адаптер хранилища: `local` (другие адаптеры планируются) |
| `STORAGE_LOCAL_PATH` | ❌ | `/app/uploads` | Путь к директории для загруженных файлов |

**Пример `KANBAN_COLUMNS`:**

```bash
# Простой формат (Label:color через запятую)
KANBAN_COLUMNS=To Do:#94a3b8,In Progress:#3b82f6,Review:#f59e0b,Done:#22c55e,Cancelled:#ef4444

# JSON-формат (больше контроля)
KANBAN_COLUMNS=[{"label":"To Do","color":"#94a3b8"},{"label":"In Progress","color":"#3b82f6"},{"label":"Done","color":"#22c55e"}]
```

Если `KANBAN_COLUMNS` не задана, используются встроенные defaults: To Do, In Progress, Done, Cancelled. Каждый пользователь может кастомизировать свой список в Settings > Kanban Columns.

---

## Настройка обратного прокси

### Nginx

```nginx
server {
    listen 80;
    server_name taskflow.example.com;

    # Если используется субпуть:
    # location /taskflow {
    #     proxy_pass http://127.0.0.1:3000;
    #     ...
    # }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Caddy

```caddyfile
taskflow.example.com {
    reverse_proxy localhost:3000
}
```

### Субпуть (деплой на domain.com/app)

Если приложение развертывается не в корне домена, а по субпути (например, `domain.com/taskflow`):

1. Установите `NEXT_BASE_PATH=/taskflow` **при сборке**:
   ```bash
   # Docker
   docker compose build --build-arg NEXT_BASE_PATH=/taskflow

   # Без Docker
   NEXT_BASE_PATH=/taskflow bun run build
   ```

2. Настройте прокси для передачи запросов:
   ```nginx
   location /taskflow {
       proxy_pass http://127.0.0.1:3000;
       # ... остальные заголовки
   }
   ```

---

## Настройка OIDC / SSO

TaskFlow поддерживает аутентификацию через любого OIDC-совместимого провайдера (Keycloak, Auth0, Okta, Google и др.).

### Предварительные требования

- Зарегистрируйте приложение у OIDC-провайдера
- Укажите **Callback URL**: `https://your-domain.com/api/auth/callback/oidc`
- Получите Client ID и Client Secret

### Конфигурация

Добавьте переменные окружения:

```bash
OIDC_ISSUER=https://keycloak.example.com/realms/myrealm
OIDC_CLIENT_ID=taskflow-app
OIDC_CLIENT_SECRET=a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

При первом входе через OIDC пользователь автоматически создается в базе данных TaskFlow. Если пользователь с таким email уже существует — аккаунты связываются.

### Вход без OIDC

Даже при включенном OIDC остается доступен вход по email (no-auth режим). Если требуется только OIDC, можно ограничить доступ на уровне прокси.

---

## Резервное копирование

### Docker

```bash
# Создать backup базы данных
docker compose exec taskflow sqlite3 /app/db/taskflow.db ".backup /app/db/backup.db"

# Скопировать backup на хост
docker compose cp taskflow:/app/db/backup.db ./taskflow-backup-$(date +%Y%m%d).db

# Резервное копирование вложений (загруженные файлы)
docker compose cp taskflow:/app/uploads ./taskflow-uploads-backup-$(date +%Y%m%d)
```

### Без Docker

```bash
# SQLite backup (без остановки приложения)
sqlite3 db/taskflow.db ".backup db/taskflow-backup-$(date +%Y%m%d).db"

# Или простое копирование (рекомендуется остановить приложение)
cp db/taskflow.db "db/taskflow-backup-$(date +%Y%m%d).db"

# Резервное копирование вложений
cp -r uploads "uploads-backup-$(date +%Y%m%d)"
```

### Автоматический backup (cron)

```bash
# Добавьте в crontab (ежедневно в 03:00)
0 3 * * * sqlite3 /opt/taskflow/db/taskflow.db ".backup /opt/taskflow/backups/taskflow-$(date +\%Y\%m\%d).db"
# Удалять бэкапы старше 30 дней
0 4 * * * find /opt/taskflow/backups/ -name "taskflow-*.db" -mtime +30 -delete
```

---

## Обновление

### Docker

```bash
cd taskflow
git pull origin main

# Пересобрать и перезапустить
docker compose build --no-cache
docker compose up -d

# Проверить
docker compose logs -f --tail=50
```

### Без Docker

```bash
cd taskflow
git pull origin main

# Установить новые зависимости
bun install

# Применить изменения схемы БД
bun run db:push

# Пересобрать
bun run build

# Перезапустить (systemd)
sudo systemctl restart taskflow
```

---

## Устранение неполадок

### Приложение не запускается

```bash
# Проверить логи
docker compose logs taskflow          # Docker
sudo journalctl -u taskflow -f        # systemd

# Частые причины:
# 1. NEXTAUTH_SECRET не задан → установите переменную
# 2. DATABASE_URL указывает на несуществующий путь → создайте директорию
# 3. Порт 3000 занят → измените PORT или освободите порт
```

### Ошибка базы данных

```bash
# Проверить целостность SQLite
sqlite3 db/taskflow.db "PRAGMA integrity_check;"

# Если база повреждена — восстановить из backup
cp db/taskflow-backup-YYYYMMDD.db db/taskflow.db
```

### Проблемы с OIDC

- Проверьте, что `OIDC_ISSUER` доступен с сервера: `curl -s $OIDC_ISSUER/.well-known/openid-configuration`
- Убедитесь, что Callback URL совпадает: `NEXTAUTH_URL + /api/auth/callback/oidc`
- Проверьте, что `NEXTAUTH_URL` использует тот же домен, что и в настройках OIDC-провайдера

### Проблемы с субпутем

- Убедитесь, что `NEXT_BASE_PATH` был установлен **при сборке** (build-time), а не только при запуске
- Все ссылки и статические ресурсы должны включать префикс субпути
- Проверьте конфигурацию прокси: путь должен корректно передаваться в приложение

### Медленная работа

- Увеличьте объем RAM (рекомендуется ≥ 1 ГБ)
- В production-режиме Prisma не логирует запросы (убедитесь, что `NODE_ENV=production`)
- При большом объеме данных (>10 000 задач) рассмотрите переход на PostgreSQL (потребуется изменение `DATABASE_URL` и схемы Prisma)

### Шедулер не работает (нет логов `[Scheduler]`)

- В Docker: убедитесь что при сборке копируется `.next/server` — см. `COPY --from=builder /app/.next/server ./.next/server` в Dockerfile
- Без Docker (standalone): файл `.next/server/instrumentation.js` должен существовать рядом с `server.js`
- Проверьте что `src/instrumentation.ts` присутствует в исходниках и не удалён
- Убедитесь что `NODE_ENV` не установлен в значение, блокирующее instrumentation (не используйте `test`)
