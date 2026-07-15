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

# Start ClickHouse in background for migrations
echo "Starting ClickHouse..."
sudo -u clickhouse clickhouse-server --config-file=/etc/clickhouse-server/config.xml &
CLICKHOUSE_PID=$!

# Wait for ClickHouse to be ready
echo "Waiting for ClickHouse..."
for i in $(seq 1 30); do
  if clickhouse-client --host 127.0.0.1 --query "SELECT 1" 2>/dev/null; then
    echo "ClickHouse is ready!"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "ClickHouse not available after 30s, continuing..."
  fi
  sleep 1
done

echo "Running database setup..."
cd /app
# Run all pending migrations (PostgreSQL + ClickHouse)
# db:migrate handles both; ClickHouse migrations generate clickhouse_structure.sql
DISABLE_DATABASE_ENVIRONMENT_CHECK=1 timeout 300 bundle exec rails db:migrate 2>&1 || echo "Migration failed or timed out"
timeout 60 bundle exec rails signup:seed_organization 2>&1 && echo "Seed completed successfully" || echo "Seed skipped, failed, or already seeded"

# Stop background ClickHouse so supervisord can take over
kill $CLICKHOUSE_PID 2>/dev/null || true
wait $CLICKHOUSE_PID 2>/dev/null || true

echo "Starting Lago services..."
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
