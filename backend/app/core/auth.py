"""
Authentication utilities — Supabase Auth (primary) + legacy password (dev fallback).

Primary:   RS256 JWT verification via Supabase JWKS (cached locally)
Fallback:  HS256 JWT + bcrypt password hashing (for dev without Supabase)
"""

import logging
import time
from datetime import datetime, timedelta
from typing import Optional

import requests
from jose import JWTError, jwt
from jose.jwk import construct as construct_jwk
from passlib.context import CryptContext

from app.config import APP_JWT_SECRET_KEY, SUPABASE_JWT_ISSUER, SUPABASE_URL

logger = logging.getLogger(__name__)

LEGACY_ALGORITHM = "HS256"


def is_token_expired(token: str) -> bool:
    """Check if a JWT has expired by reading its claims without verifying signature."""
    try:
        claims = jwt.get_unverified_claims(token)
        exp = claims.get("exp")
        if exp:
            return datetime.utcnow().timestamp() > exp
    except Exception:
        pass
    return False

# ---------------------------------------------------------------------------
# JWKS (cached) — verify Supabase RS256 tokens locally
# ---------------------------------------------------------------------------
_jwks_cache: list | None = None
_jwks_cache_time: float = 0
JWKS_CACHE_TTL = 3600  # 1 hour — Supabase keys rotate infrequently


def _fetch_jwks() -> list:
    """Fetch JWKS from Supabase. Results are cached in memory for JWKS_CACHE_TTL."""
    global _jwks_cache, _jwks_cache_time

    now = time.time()
    if _jwks_cache is not None and (now - _jwks_cache_time) < JWKS_CACHE_TTL:
        return _jwks_cache

    try:
        resp = requests.get(f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json", timeout=5)
        resp.raise_for_status()
        data = resp.json()
        _jwks_cache = data.get("keys", [])
        _jwks_cache_time = now
        return _jwks_cache
    except Exception as e:
        logger.warning("Failed to fetch Supabase JWKS: %s", e)
        return _jwks_cache or []


def verify_supabase_token(token: str) -> dict | None:
    """Verify a Supabase JWT locally using cached JWKS.

    Zero network calls after the first JWKS fetch (cached for 1 hour).
    Returns decoded payload dict on success, None on failure.
    Supports both RS256 (RSA) and ES256 (ECDSA) keys.
    """
    if not SUPABASE_URL:
        return None

    jwks = _fetch_jwks()
    if not jwks:
        return None

    try:
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")
    except Exception as e:
        logger.warning("Failed to get JWT header: %s", e)
        return None

    # Find matching key by Key ID
    signing_key = None
    for key in jwks:
        if key.get("kid") == kid:
            signing_key = key
            break

    if not signing_key:
        logger.warning("No matching JWK found for kid: %s", kid)
        return None

    try:
        public_key = construct_jwk(signing_key)
        issuer = SUPABASE_JWT_ISSUER or f"{SUPABASE_URL}/auth/v1"
        payload = jwt.decode(
            token,
            public_key,
            algorithms=[signing_key.get("alg", "RS256")],
            audience="authenticated",
            issuer=issuer,
        )
        return payload
    except JWTError as e:
        if is_token_expired(token):
            logger.warning("Supabase token expired")
        else:
            logger.warning("JWT verification failed: %s", e)
        return None


# ---------------------------------------------------------------------------
# Legacy JWT (dev fallback without Supabase)
# ---------------------------------------------------------------------------

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=300))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, APP_JWT_SECRET_KEY, algorithm=LEGACY_ALGORITHM)


def decode_access_token(token: str) -> dict | None:
    try:
        payload = jwt.decode(token, APP_JWT_SECRET_KEY, algorithms=[LEGACY_ALGORITHM])
        return payload
    except JWTError:
        return None


# ---------------------------------------------------------------------------
# Legacy password utilities (for dev mode and migration period)
# ---------------------------------------------------------------------------
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str | None) -> bool:
    if not hashed_password:
        return False
    if len(plain_password.encode("utf-8")) > 72:
        plain_password = plain_password.encode("utf-8")[:72].decode("utf-8", errors="ignore")
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    if len(password.encode("utf-8")) > 72:
        password = password.encode("utf-8")[:72].decode("utf-8", errors="ignore")
    return pwd_context.hash(password)


# ---------------------------------------------------------------------------
# Smart token verification — tries Supabase first, falls back to legacy
# ---------------------------------------------------------------------------

def verify_any_token(token: str) -> dict | None:
    """Try Supabase (RS256/JWKS) first, then legacy (HS256/secret)."""
    payload = verify_supabase_token(token)
    if payload:
        return payload
    return decode_access_token(token)
