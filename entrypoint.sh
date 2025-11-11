#!/bin/sh
set -e

echo "Running database migrations..."
# Optional: set log level for better diagnostics
export PRISMA_MIGRATION_ENGINE_LOG_LEVEL=info

# Ensure DATABASE_URL is visible
echo "DATABASE_URL=$DATABASE_URL" | sed 's/:\/\/[^:]*:[^@]*@/:\/\/***:***@/'

# Apply migrations
npx prisma migrate deploy

echo "Starting the application..."
exec "$@"
