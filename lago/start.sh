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

# Test database connectivity before Rails
echo "Testing database connectivity..."
timeout 10 bash -c 'exec 3<>/dev/tcp/lago-postgres/5432' 2>&1 && echo "TCP to postgres OK" || echo "TCP to postgres FAILED"
echo "Running database migrations..."
cd /app
timeout 120 bundle exec rails db:migrate 2>&1 || echo "Migration failed or timed out"
timeout 30 bundle exec rails signup:seed_organization 2>&1 || echo "Seed skipped or already seeded"

echo "Starting Lago services..."
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
