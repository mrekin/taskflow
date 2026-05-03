# TaskFlow - Multi-stage Docker build
# Supports subpath deployment via NEXT_BASE_PATH env var
# Auto-creates and migrates database on startup

# Stage 1: Build (deps + build in one stage, cache mount for bun)
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install bun
COPY --from=oven/bun:1 /usr/local/bin/bun /usr/local/bin/bun

# Copy package files
COPY package.json bun.lock ./

# Install dependencies with cache mount
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Generate Prisma client (must be AFTER copy so output isn't overwritten)
RUN bun run db:generate

# Build args for subpath support
ARG NEXT_BASE_PATH=""
ENV NEXT_BASE_PATH=$NEXT_BASE_PATH
ENV NEXTAUTH_URL=${NEXTAUTH_URL:-http://localhost:3000}
ENV NEXTAUTH_SECRET=${NEXTAUTH_SECRET:-change-me-in-production}
ENV DATABASE_URL=${DATABASE_URL:-file:./db/taskflow.db}

# Build the application
RUN bun run build

# Stage 2: Production
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXTAUTH_URL=${NEXTAUTH_URL:-http://localhost:3000}
ENV NEXTAUTH_SECRET=${NEXTAUTH_SECRET:-change-me-in-production}
ENV DATABASE_URL=${DATABASE_URL:-file:./db/taskflow.db}

# Install prisma CLI for db push at runtime (schema migration)
RUN npm install -g prisma@7

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 taskflow

# Copy built application
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy Prisma files (schema + config + generated client)
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/src/generated/prisma ./src/generated/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma

# Create data directory for SQLite
RUN mkdir -p /app/db && chown taskflow:nodejs /app/db

# Copy entrypoint script
COPY --chown=taskflow:nodejs docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER taskflow

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["./docker-entrypoint.sh"]
