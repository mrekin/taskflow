# TaskFlow

Self-hosted task and notes management application with Kanban board, Markdown notes, and hierarchical project organization.

## Features

- **Hierarchical organization** — Areas > Projects > Tasks with subtasks
- **Kanban board** — Drag-and-drop task board with status columns
- **Markdown notes** — Full editor with live preview, tagging, and import/export
- **Comments** — Threaded comments on tasks with inline editing
- **Tags** — Cross-entity tagging with color coding
- **Quick create** — Streamlined entity creation from a single text input
- **Entity links & mentions** — Reference tasks, projects, and notes with short IDs (T-5, P-2, N-3) and `#mentions` in Markdown
- **Webhooks** — Automated notifications on task/project events with scope matching and placeholder substitution
- **Bulk operations** — Select multiple tasks for delete or export
- **Dark / Light theme** — System-aware theme switching
- **OIDC / SSO** — Enterprise authentication via Keycloak, Auth0, Okta, Google, etc.
- **Demo mode** — Start using immediately without authentication
- **Subpath deployment** — Run behind a reverse proxy at any path (e.g., `/taskflow`)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, standalone output) |
| UI | React 19, TypeScript, Tailwind CSS 4, shadcn/ui |
| State | Zustand |
| Database | SQLite via Prisma ORM |
| Auth | NextAuth.js v4 (credentials + OIDC) |
| Animations | Framer Motion |
| Drag & Drop | @dnd-kit |

## Quick Start

### Docker (recommended)

```bash
git clone <repo-url> taskflow
cd taskflow
docker compose up -d
```

The app will be available at `http://localhost:3000`.

> Change `NEXTAUTH_SECRET` in `docker-compose.yml` before deploying to production:
> ```bash
> openssl rand -base64 32
> ```

### Manual

Requires Node.js >= 20 and [Bun](https://bun.sh/) >= 1.0.

```bash
git clone <repo-url> taskflow
cd taskflow
bun install
bun run db:push
bun run db:generate
bun run dev
```

## Configuration

| Variable | Required | Default | Description |
|----------|:--------:|---------|-------------|
| `NEXTAUTH_SECRET` | yes | — | JWT session secret. Generate with `openssl rand -base64 32` |
| `NEXTAUTH_URL` | yes | `http://localhost:3000` | Full app URL (used for OAuth redirects) |
| `DATABASE_URL` | no | `file:./db/taskflow.db` | SQLite database path |
| `PORT` | no | `3000` | HTTP server port |
| `OIDC_ISSUER` | no | — | OIDC provider URL (e.g. Keycloak realm) |
| `OIDC_CLIENT_ID` | no | — | OIDC client ID |
| `OIDC_CLIENT_SECRET` | no | — | OIDC client secret |
| `DEMO_MODE` | no | `false` | Skip authentication, auto-login as demo user |
| `NEXT_BASE_PATH` | no | `""` | Subpath for reverse proxy deployment (build-time) |
| `KANBAN_COLUMNS` | no | — | Default Kanban board columns. Format: `Label:color,...` or JSON array |
| `SCHEDULER_INTERVAL_MIN` | no | `1` | Background scheduler interval in minutes (due date webhooks, etc.) |

## Documentation

- [Build instructions](docs/BUILD.md) — production builds, Docker, cross-compilation
- [Deployment guide](docs/DEPLOYMENT.md) — Docker, manual deploy, reverse proxy, OIDC, backups

## License

Private. All rights reserved.
