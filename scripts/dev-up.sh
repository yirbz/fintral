#!/usr/bin/env bash
# =============================================================================
# Fintral — Local Development Orchestrator
# =============================================================================
# Prerequisites:
#   1. Docker + Docker Compose plugin
#   2. Supabase CLI (https://supabase.com/docs/guides/cli)
#   3. Doppler CLI (https://docs.doppler.com/docs/install-cli)
#   4. Doppler project "fintral" with config "dev"
#
# This script:
#   1. Verifies dependencies
#   2. Starts Supabase local (Postgres + GoTrue + Storage)
#   3. Launches Docker Compose (backend, frontend, nginx, Redis)
#   4. Injects Doppler secrets at runtime
#
# Usage:
#   chmod +x scripts/dev-up.sh
#   ./scripts/dev-up.sh
#
# Teardown:
#   docker compose -f docker-compose.dev.yml down
#   supabase stop
# =============================================================================

set -euo pipefail

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo -e "${BLUE}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Fintral — Development Environment        ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════╝${NC}"
echo ""

# ---------------------------------------------------------------------------
# Step 0: Dependency check
# ---------------------------------------------------------------------------
echo -e "${YELLOW}[0/4] Checking dependencies...${NC}"

if ! command -v docker &>/dev/null; then
  echo -e "${RED}✖ Docker not found. Install: https://docs.docker.com/engine/install/${NC}"
  exit 1
fi
echo -e "  ${GREEN}✓${NC} Docker"

if ! docker compose version &>/dev/null; then
  echo -e "${RED}✖ Docker Compose plugin not found.${NC}"
  exit 1
fi
echo -e "  ${GREEN}✓${NC} Docker Compose"

if ! command -v npx &>/dev/null; then
  echo -e "${RED}✖ npx not found. Please install Node.js (which includes npm/npx).${NC}"
  exit 1
fi
echo -e "  ${GREEN}✓${NC} npx CLI"

if ! command -v doppler &>/dev/null; then
  echo -e "${RED}✖ Doppler CLI not found. Install: https://docs.doppler.com/docs/install-cli${NC}"
  exit 1
fi
echo -e "  ${GREEN}✓${NC} Doppler CLI"

# Verify Doppler project + config
if ! doppler secrets get APP_JWT_SECRET_KEY --project fintral --config dev &>/dev/null 2>&1; then
  echo -e "${RED}✖ Doppler project 'fintral' / config 'dev' not found or inaccessible.${NC}"
  echo -e "  Run: doppler setup --project fintral --config dev"
  exit 1
fi
echo -e "  ${GREEN}✓${NC} Doppler project 'fintral' — config 'dev'"
echo ""

# ---------------------------------------------------------------------------
# Step 1: Supabase local
# ---------------------------------------------------------------------------
echo -e "${YELLOW}[1/4] Initializing Supabase (if needed)...${NC}"
cd "$ROOT_DIR/supabase"

if [ ! -f config.toml ]; then
  echo -e "  ${BLUE}→${NC} Running supabase init..."
  npx -y supabase init
fi

echo -e "${YELLOW}[2/4] Starting Supabase containers...${NC}"
npx -y supabase start
echo -e "  ${GREEN}✓${NC} Supabase running"
echo -e "  ${BLUE}  API:     ${NC}http://localhost:54321"
echo -e "  ${BLUE}  DB:      ${NC}postgresql://postgres:postgres@localhost:54322/postgres"
echo -e "  ${BLUE}  Studio:  ${NC}http://localhost:54325"
echo -e "  ${BLUE}  Inbucket:${NC}http://localhost:54324"
echo ""

cd "$ROOT_DIR"

# ---------------------------------------------------------------------------
# Step 3: Docker Compose (via Doppler)
# ---------------------------------------------------------------------------
echo -e "${YELLOW}[3/4] Launching app containers (backend + frontend + nginx + Redis)...${NC}"
echo -e "  ${BLUE}→${NC} Injecting secrets with Doppler..."

doppler run --project fintral --config dev -- \
  docker compose -f docker-compose.dev.yml up -d --build

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Fintral — Development environment READY     ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BLUE}Proxy:     ${NC}http://localhost:${LOCAL_PROXY_PORT:-8001}"
echo -e "  ${BLUE}Backend:   ${NC}http://localhost:${LOCAL_BACKEND_PORT:-8000}"
echo -e "  ${BLUE}Frontend:  ${NC}http://localhost:${LOCAL_FRONTEND_PORT:-3000}"
echo -e "  ${BLUE}Redis:     ${NC}localhost:${LOCAL_REDIS_PORT:-6381}"
echo -e "  ${BLUE}Supabase:  ${NC}http://localhost:54321"
echo -e "  ${BLUE}Studio:    ${NC}http://localhost:54325"
echo ""
echo -e "  ${YELLOW}Logs:${NC}  docker compose -f docker-compose.dev.yml logs -f"
echo -e "  ${YELLOW}Down:${NC}  docker compose -f docker-compose.dev.yml down && npx -y supabase stop"
echo ""
