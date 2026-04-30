#!/bin/sh
set -e

echo "=== TaskFlow Docker Entrypoint ==="

# Ensure db directory exists for SQLite
mkdir -p ./db

# Extract database file path from DATABASE_URL
# Format: file:./db/taskflow.db or file:/absolute/path/db.db
DB_PATH=$(echo "$DATABASE_URL" | sed 's/^file://')

# Resolve relative paths
case "$DB_PATH" in
  ./*)
    # Relative path - resolve against /app
    DB_PATH="/app/${DB_PATH#./}"
    ;;
  /*)
    # Already absolute
    ;;
  *)
    # No prefix - assume relative
    DB_PATH="/app/$DB_PATH"
    ;;
esac

DB_DIR=$(dirname "$DB_PATH")
mkdir -p "$DB_DIR"

# Check writability of database directory
echo "Database directory: $DB_DIR (owner: $(ls -ld "$DB_DIR" | awk '{print $3":"$4}'), permissions: $(ls -ld "$DB_DIR" | awk '{print $1}'))"
if ! touch "$DB_DIR/.write_test" 2>/dev/null; then
  echo ""
  echo "⚠ ERROR: Cannot write to $DB_DIR"
  echo "Current user: $(id)"
  echo ""
  echo "If using a Docker bind mount (volumes: ./taskflow-data:/app/db),"
  echo "fix permissions on the HOST before starting the container:"
  echo "  chown -R 1001:1001 ./taskflow-data"
  echo ""
  echo "Starting the app anyway — database will NOT work."
  exec node server.js
fi
rm -f "$DB_DIR/.write_test"

# Compute current schema hash to detect changes
SCHEMA_HASH_FILE="${DB_PATH}.schema_hash"
CURRENT_HASH=$(cat /app/prisma/schema.prisma | md5sum | cut -d' ' -f1)
PREV_HASH=""
if [ -f "$SCHEMA_HASH_FILE" ]; then
  PREV_HASH=$(cat "$SCHEMA_HASH_FILE")
fi

# Check if database file exists
if [ -f "$DB_PATH" ]; then
  echo "Database file found: $DB_PATH"

  # Only backup and migrate if schema has changed
  if [ "$CURRENT_HASH" != "$PREV_HASH" ]; then
    echo "Schema change detected."

    # Create backup before migration (iterative, timestamped)
    BACKUP_TS=$(date +%Y%m%d_%H%M%S)
    BACKUP_FILE="${DB_PATH}.bak.${BACKUP_TS}"
    cp "$DB_PATH" "$BACKUP_FILE"
    echo "Backup created: ${BACKUP_FILE}"

    # Keep only last 10 backups to avoid disk bloat
    BACKUP_COUNT=$(ls -1 "${DB_PATH}".bak.* 2>/dev/null | wc -l)
    if [ "$BACKUP_COUNT" -gt 10 ]; then
      echo "Cleaning old backups (keeping last 10)..."
      ls -1t "${DB_PATH}".bak.* | tail -n +11 | xargs rm -f
    fi

    echo "Running schema migration (safe - adds missing columns, preserves data)..."
    NEEDS_MIGRATION=1
  else
    echo "Schema unchanged since last migration. Skipping."
    NEEDS_MIGRATION=0
  fi
else
  echo "No database found at: $DB_PATH"
  echo "Creating new database with current schema..."
  NEEDS_MIGRATION=1
fi

if [ "$NEEDS_MIGRATION" = "1" ]; then
  # Run prisma db push to create/migrate the schema
  npx prisma db push 2>&1 || {
    echo ""
    echo "⚠ WARNING: Schema sync encountered an issue."
    echo "Starting the app anyway — some features may not work correctly."
  }

  # Save schema hash after successful migration
  echo "$CURRENT_HASH" > "$SCHEMA_HASH_FILE"
fi

echo ""
echo "=== Starting TaskFlow ==="
exec node server.js
