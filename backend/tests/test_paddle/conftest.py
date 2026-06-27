"""Minimal conftest for Paddle tests — avoids heavy app imports."""

import os
import sys

# Ensure the backend root is on sys.path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

# Set test env vars BEFORE any app imports
os.environ.setdefault("DATABASE_URL", "sqlite:///./test_paddle.db")
os.environ.setdefault("SUPABASE_URL", "")
os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-production")

# Force SQLite for tests
os.environ["FINTRAL_DISABLE_WS_HEARTBEAT"] = "true"
