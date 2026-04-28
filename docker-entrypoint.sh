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

# Check if database file exists
if [ -f "$DB_PATH" ]; then
  echo "Database file found: $DB_PATH"
  echo "Running schema migration (safe - adds missing columns, preserves data)..."
else
  echo "No database found at: $DB_PATH"
  echo "Creating new database with current schema..."
fi

# Run prisma db push to create/migrate the schema
npx prisma db push 2>&1 || {
  echo ""
  echo "⚠ WARNING: Schema sync encountered an issue."
  echo "Starting the app anyway — some features may not work correctly."
}

echo ""
echo "=== Starting TaskFlow ==="
exec node server.js
