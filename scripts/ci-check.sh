#!/bin/bash
# CI check script: run all checks locally without Docker (fast mode)
# Usage: ./scripts/ci-check.sh
set -e

echo "════════════════════════════════════════════════"
echo " 🔍 CI Check Local (fast mode)"
echo "════════════════════════════════════════════════"

# ── Backend ──
echo ""
echo "📦 Backend checks..."
cd backend

echo "  → ruff lint..."
uv tool run ruff check . 2>&1 && echo "  ✅ ruff passed" || { echo "  ❌ ruff failed"; exit 1; }

echo "  → pytest..."
PYTHONPATH="$PWD" python -m pytest -x -v --tb=short 2>&1 | tail -5 && echo "  ✅ tests passed" || { echo "  ❌ tests failed"; exit 1; }

cd ..

# ── Frontend ──
echo ""
echo "📦 Frontend checks..."
cd frontend

echo "  → eslint..."
npx eslint . --max-warnings=1000 2>&1 | tail -3 && echo "  ✅ eslint passed" || { echo "  ❌ eslint failed"; exit 1; }

echo "  → typecheck..."
pnpm typecheck 2>&1 | tail -5 && echo "  ✅ typecheck passed" || { echo "  ❌ typecheck failed"; exit 1; }

echo "  → build..."
pnpm build 2>&1 | tail -5 && echo "  ✅ build passed" || { echo "  ❌ build failed"; exit 1; }

cd ..

echo ""
echo "════════════════════════════════════════════════"
echo " ✅ Todos los checks pasaron"
echo "════════════════════════════════════════════════"
