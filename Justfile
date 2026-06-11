GREEN := "\u{1b}[0;32m"
RED   := "\u{1b}[0;31m"
BLUE  := "\u{1b}[0;34m"
RESET := "\u{1b}[0m"

# ─────────────────────────────────────────────
# Backend
# ─────────────────────────────────────────────

test:
    cd backend && python -m pytest tests/

install:
    cd backend && pip install -r requirements.txt

venv:
    @echo "{{GREEN}}Entrando al entorno virtual... (escribe 'exit' para salir){{RESET}}"
    bash --rcfile venv/bin/activate -i

lint:
    ruff check .

# ─────────────────────────────────────────────
# Frontend
# ─────────────────────────────────────────────

frontend-install:
    cd frontend && npm install

frontend-dev:
    cd frontend && npm run dev

frontend-build:
    cd frontend && npm run build

frontend-lint:
    cd frontend && npm run lint

frontend-typecheck:
    cd frontend && npm run typecheck

# ─────────────────────────────────────────────
# Development (full local stack)
# ─────────────────────────────────────────────

# Start everything: Supabase local + Docker Compose + Doppler
dev-up:
    ./scripts/dev-up.sh

# Stop dev environment
dev-down:
	docker compose -f docker-compose.dev.yml down
	npx -y supabase stop
	@echo "{{RED}}Dev environment stopped.{{RESET}}"

# Rebuild dev containers (no supabase restart)
dev-rebuild:
    doppler run --project fintral --config dev -- docker compose -f docker-compose.dev.yml up -d --build

# Dev logs
dev-logs:
    docker compose -f docker-compose.dev.yml logs -f

# Dev shell into backend
dev-shell-backend:
    docker compose -f docker-compose.dev.yml exec backend /bin/bash

# Dev shell into frontend
dev-shell-frontend:
    docker compose -f docker-compose.dev.yml exec frontend /bin/sh

# ─────────────────────────────────────────────
# Staging
# ─────────────────────────────────────────────

staging-up:
    doppler run --project fintral --config stg -- docker compose -f docker-compose.staging.yml up -d --build

staging-down:
    docker compose -f docker-compose.staging.yml down
    @echo "{{RED}}Staging environment stopped.{{RESET}}"

staging-logs:
    docker compose -f docker-compose.staging.yml logs -f

# ─────────────────────────────────────────────
# Production (legacy compose.yml — DEPRECATED)
# ─────────────────────────────────────────────

up:
    docker compose up -d
    @echo "{{BLUE}}Proxy: {{RESET}}http://localhost:$(docker compose port proxy 80 | sed 's/.*://')"

down:
    docker compose down
    @echo "{{RED}}Services stopped.{{RESET}}"

# ─────────────────────────────────────────────
# Infrastructure only (legacy, for local dev without Docker)
# ─────────────────────────────────────────────

infran:
    docker compose -f compose-database.yml up -d
    @echo "{{GREEN}}Infrastructure started:{{RESET}}"
    @echo "{{BLUE}} Proxy: {{RESET}}http://localhost:$(docker compose -f compose-database.yml port proxy 80 | sed 's/.*://')"
    @echo "{{BLUE}} DB:    {{RESET}}localhost:$(docker compose -f compose-database.yml port db 5432 | sed 's/.*://')"
    @echo "{{BLUE}} Redis: {{RESET}}localhost:$(docker compose -f compose-database.yml port redis 6379 | sed 's/.*://')"

infdown:
    docker compose -f compose-database.yml down
    @echo "{{RED}}Infrastructure stopped.{{RESET}}"

# ─────────────────────────────────────────────
# Suprimir errores en tareas que no existen
# ─────────────────────────────────────────────

integration-test:
    @echo "⚠️ Asegúrate de que el servidor esté corriendo antes de ejecutar estas pruebas."
    venv/bin/python tests/verify_ws_full.py
