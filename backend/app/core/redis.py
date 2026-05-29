"""
Redis client utilities: caching, rate limiting, deduplication.
"""

import json
import logging
from typing import Any, Optional

import redis

from app.config import REDIS_URL

logger = logging.getLogger(__name__)

# Cliente Redis global
redis_client: Optional[redis.Redis] = None


def get_redis_client() -> Optional[redis.Redis]:
    """
    Obtiene el cliente Redis (singleton pattern)
    """
    global redis_client

    if redis_client is None:
        if not REDIS_URL:
            logger.warning("⚠️ REDIS_URL no configurada, Redis deshabilitado")
            return None

        try:
            kwargs = {
                "decode_responses": True,
                "socket_connect_timeout": 5,
                "socket_timeout": 5,
            }
            # Heroku Redis usa SSL
            if REDIS_URL.startswith("rediss://"):
                kwargs["ssl_cert_reqs"] = None

            redis_client = redis.from_url(REDIS_URL, **kwargs)

            # Test connection
            redis_client.ping()
            logger.info("✅ Redis conectado correctamente")

        except Exception as e:
            logger.error("❌ Error conectando a Redis: %s", e)
            redis_client = None

    return redis_client


def cache_get(key: str) -> Optional[Any]:
    """Obtiene valor del caché Redis"""
    try:
        r = get_redis_client()
        if not r:
            return None

        value = r.get(key)
        if value:
            try:
                return json.loads(value)
            except Exception:
                return value
        return None

    except Exception as e:
        logger.error("Error en cache_get(%s): %s", key, e)
        return None


def cache_set(key: str, value: Any, ttl: int = 300) -> bool:
    """Guarda valor en caché Redis con TTL (segundos)"""
    try:
        r = get_redis_client()
        if not r:
            return False

        if isinstance(value, (dict, list)):
            value = json.dumps(value)

        r.setex(key, ttl, value)
        return True

    except Exception as e:
        logger.error("Error en cache_set(%s): %s", key, e)
        return False


def cache_delete(key: str) -> bool:
    """Elimina valor del caché"""
    try:
        r = get_redis_client()
        if not r:
            return False

        r.delete(key)
        return True

    except Exception as e:
        logger.error("Error en cache_delete(%s): %s", key, e)
        return False


def rate_limit(key: str, limit: int = 10, window: int = 60) -> bool:
    """
    Rate limiting usando Redis.
    Returns True si está dentro del límite, False si excede.
    """
    try:
        r = get_redis_client()
        if not r:
            return True

        current = r.incr(key)

        if current == 1:
            r.expire(key, window)

        if current > limit:
            logger.warning("⚠️ Rate limit excedido para %s: %s/%s", key, current, limit)
            return False

        return True

    except Exception as e:
        logger.error("Error en rate_limit(%s): %s", key, e)
        return True


def is_duplicate_message(message_id: str, ttl: int = 86400) -> bool:
    """
    Verifica si un mensaje ya fue procesado (deduplicación).
    Returns True si ya existe (es duplicado), False si es nuevo.
    """
    try:
        r = get_redis_client()
        if not r:
            return False

        key = f"processed:msg:{message_id}"

        if r.exists(key):
            logger.warning("⚠️ Mensaje duplicado detectado: %s", message_id)
            return True

        r.setex(key, ttl, "1")
        return False

    except Exception as e:
        logger.error("Error en is_duplicate_message(%s): %s", message_id, e)
        return False


def invalidate_cache_pattern(pattern: str) -> int:
    """Invalida todas las claves que coincidan con un patrón"""
    try:
        r = get_redis_client()
        if not r:
            return 0

        keys = r.keys(pattern)

        if keys:
            deleted = r.delete(*keys)
            logger.info("🗑️ Invalidadas %s claves de caché (%s)", deleted, pattern)
            return deleted

        return 0

    except Exception as e:
        logger.error("Error en invalidate_cache_pattern(%s): %s", pattern, e)
        return 0


def get_cache_stats() -> dict:
    """Obtiene estadísticas de Redis"""
    try:
        r = get_redis_client()
        if not r:
            return {"status": "disabled"}

        info = r.info("stats")

        return {
            "status": "connected",
            "total_commands": info.get("total_commands_processed", 0),
            "keyspace_hits": info.get("keyspace_hits", 0),
            "keyspace_misses": info.get("keyspace_misses", 0),
            "hit_rate": round(
                info.get("keyspace_hits", 0)
                / max(info.get("keyspace_hits", 0) + info.get("keyspace_misses", 0), 1)
                * 100,
                2,
            ),
        }

    except Exception as e:
        logger.error("Error obteniendo stats de Redis: %s", e)
        return {"status": "error", "error": str(e)}


def invalidate_stats_cache(tenant_id: Any, org_id: Any) -> None:
    """
    Invalida el caché de estadísticas del dashboard para un tenant y organización
    """
    try:
        invalidate_cache_pattern(f"stats:dashboard:{tenant_id}:{org_id}:*")
    except Exception as e:
        logger.error("Error invalidando stats cache: %s", e)

