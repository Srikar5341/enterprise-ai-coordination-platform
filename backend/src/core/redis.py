"""Redis connection management, resilient client factory, and health checks."""

import logging
import time
from typing import Any, Dict, Optional
import redis
from redis.exceptions import ConnectionError, RedisError, TimeoutError

from src.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_redis_pool: Optional[redis.ConnectionPool] = None


def get_redis_pool() -> Optional[redis.ConnectionPool]:
    """Retrieve or initialize the global Redis connection pool."""
    global _redis_pool
    if not settings.REDIS_ENABLED:
        return None

    if _redis_pool is None:
        try:
            _redis_pool = redis.ConnectionPool.from_url(
                settings.REDIS_URL,
                decode_responses=True,
                socket_timeout=2.0,
                socket_connect_timeout=2.0,
                max_connections=20,
            )
        except Exception as exc:
            logger.warning("Failed to initialize Redis connection pool: %s", exc)
            return None
    return _redis_pool


def get_redis_client() -> Optional[redis.Redis]:
    """Retrieve a thread-safe Redis client instance or None if unavailable/disabled."""
    pool = get_redis_pool()
    if pool is None:
        return None
    try:
        client = redis.Redis(connection_pool=pool)
        return client
    except Exception as exc:
        logger.warning("Failed to acquire Redis client: %s", exc)
        return None


def check_redis_health() -> Dict[str, Any]:
    """Ping Redis and measure round-trip latency for system health checks.

    Returns structured health metadata without raising exceptions.
    """
    if not settings.REDIS_ENABLED:
        return {"status": "disabled", "details": "Redis is disabled in application settings"}

    client = get_redis_client()
    if client is None:
        return {"status": "unreachable", "details": "Unable to initialize Redis client pool"}

    try:
        start_time = time.perf_counter()
        is_alive = client.ping()
        elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)
        if is_alive:
            return {
                "status": "connected",
                "latency_ms": elapsed_ms,
                "host": settings.REDIS_HOST,
                "port": settings.REDIS_PORT,
            }
        return {"status": "unresponsive", "details": "Redis ping did not return True"}
    except (ConnectionError, TimeoutError) as exc:
        logger.warning("Redis health check failed (Connection/Timeout): %s", exc)
        return {"status": "unreachable", "details": str(exc)}
    except RedisError as exc:
        logger.warning("Redis health check failed: %s", exc)
        return {"status": "error", "details": str(exc)}
    except Exception as exc:
        logger.warning("Unexpected error during Redis health check: %s", exc)
        return {"status": "error", "details": str(exc)}
