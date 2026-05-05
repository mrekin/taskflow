# TaskFlow

Self-hosted task and notes management application for individual use or small teams, with Kanban board, Markdown notes, and hierarchical project organization.

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
- **No-auth mode** — Skip authentication, auto-login as demo user
- **Demo mode** — Public demo with automatic database reset every N minutes
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
mkdir -p taskflow-data
chown -R 1001:1001 taskflow-data
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
| `NOAUTH_MODE` | no | `false` | Skip authentication, auto-login as demo user |
| `DEMO_MODE` | no | `false` | Public demo mode with automatic DB reset (mutually exclusive with `NOAUTH_MODE` and OIDC) |
| `DEMO_RESET_MIN` | no | `15` | Database reset interval in minutes. Values below 5 are not recommended — users need time to explore (only when `DEMO_MODE=true`) |
| `NEXT_BASE_PATH` | no | `""` | Subpath for reverse proxy deployment (build-time) |
| `BUILD_TYPE` | no | `test` | Build type: `test`, `dev`, or `release` (build-time, affects version display) |
| `KANBAN_COLUMNS` | no | — | Default Kanban board columns. Format: `Label:color,...` or JSON array |
| `SCHEDULER_INTERVAL_MIN` | no | `1` | Background scheduler interval in minutes (due date webhooks, etc.) |

## Subpath Deployment

To run TaskFlow at a subpath (e.g., `domain.com/taskflow`), set `NEXT_BASE_PATH` **at build time**:

```bash
# Docker
docker compose build --build-arg NEXT_BASE_PATH=/taskflow

# Manual
NEXT_BASE_PATH=/taskflow bun run build
```

Configure your reverse proxy accordingly:

```nginx
location /taskflow {
    proxy_pass http://127.0.0.1:3000;
}
```

Also update `NEXTAUTH_URL` to include the subpath, e.g. `https://domain.com/taskflow`.

> `NEXT_BASE_PATH` is baked into client bundles during build. Changing it after build has no effect.

## Documentation

- [Build instructions](docs/BUILD.md) — production builds, Docker, cross-compilation
- [Deployment guide](docs/DEPLOYMENT.md) — Docker, manual deploy, reverse proxy, OIDC, backups

## License

This project is licensed under the [GNU Affero General Public License v3.0](https://www.gnu.org/licenses/agpl-3.0.html) (AGPL-3.0).
