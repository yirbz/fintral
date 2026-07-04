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

# Run database migrations
echo "Running database migrations..."
cd /app
timeout 60 bundle exec rails db:migrate || echo "Migration timeout or failed"
echo "Running seed..."
timeout 60 bundle exec rails signup:seed_organization || echo "Seed timeout or failed"

echo "Starting Lago services..."
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
