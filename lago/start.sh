#!/bin/bash
set -e

# Generate RSA key if not provided
if [ -z "$LAGO_RSA_PRIVATE_KEY" ]; then
  echo "Generating RSA key pair..."
  openssl genrsa -out /app/config/keys/private.pem 2048
  openssl rsa -in /app/config/keys/private.pem -pubout -out /app/config/keys/public.pem
  echo "RSA key pair generated."
fi

# Generate frontend env-config.js
if [ -f /usr/share/nginx/html/.env.sh ]; then
  bash /usr/share/nginx/html/.env.sh
fi

# Set ClickHouse env vars with Railway-level overrides
export LAGO_CLICKHOUSE_HOST="${LAGO_CLICKHOUSE_HOST:-127.0.0.1}"
export LAGO_CLICKHOUSE_DATABASE="${LAGO_CLICKHOUSE_DATABASE:-lago}"
export LAGO_CLICKHOUSE_MIGRATIONS_ENABLED="${LAGO_CLICKHOUSE_MIGRATIONS_ENABLED:-false}"

echo "Running database setup..."
cd /app
# Run all pending migrations (PostgreSQL + ClickHouse)
# db:migrate handles both; ClickHouse migrations generate clickhouse_structure.sql
DISABLE_DATABASE_ENVIRONMENT_CHECK=1 timeout 300 bundle exec rails db:migrate 2>&1 || echo "Migration failed or timed out"
timeout 30 bundle exec rails signup:seed_organization 2>&1 || echo "Seed skipped or already seeded"

echo "Starting Lago services..."
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
