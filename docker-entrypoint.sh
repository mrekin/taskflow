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

# Check if database file exists
if [ -f "$DB_PATH" ]; then
  echo "Database file found: $DB_PATH"
  echo "Running schema migration (safe - adds missing columns, preserves data)..."
else
  echo "No database found at: $DB_PATH"
  echo "Creating new database with current schema..."
fi

# Run prisma db push to create/migrate the schema
# This is safe and non-destructive:
#   - Fresh DB: creates all tables from current schema
#   - Existing DB with current schema: no-op (idempotent)
#   - Existing DB with older schema (new columns added): adds missing columns
#   - Existing DB with incompatible changes: will error with clear message
npx prisma db push --skip-generate 2>&1 || {
  echo ""
  echo "⚠ WARNING: Schema sync encountered an issue."
  echo "If you have an existing database with an incompatible schema, you may need to:"
  echo "  1. Back up your data"
  echo "  2. Delete the database file and restart (it will be recreated)"
  echo "  3. Or manually adjust the schema"
  echo ""
  echo "Starting the app anyway — some features may not work correctly."
}

echo ""
echo "=== Starting TaskFlow ==="
exec node server.js
