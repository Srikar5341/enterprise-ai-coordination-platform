"""Redis sliding-window rate limiter for burst AI request protection."""

import logging
import time
from typing import Optional
import uuid
import redis
from redis.exceptions import ConnectionError, RedisError, TimeoutError

from src.core.config import PLAN_ENTITLEMENTS, get_settings
from src.core.errors import RateLimitError
from src.core.redis import get_redis_client

logger = logging.getLogger(__name__)
settings = get_settings()


def check_ai_rate_limit(
    project_id: str,
    tier: str = "FREE",
    redis_client: Optional[redis.Redis] = None,
) -> None:
    """Enforce per-minute burst rate limit on AI requests using a Redis sliding-window.

    If Redis is unreachable or disabled, this check gracefully degrades and logs a warning
    without breaking application flow (MySQL monthly quotas remain the authoritative ceiling).
    """
    if not settings.REDIS_ENABLED:
        return

    tier_normalized = tier.upper().strip()
    tier_config = PLAN_ENTITLEMENTS.get(tier_normalized, PLAN_ENTITLEMENTS["FREE"])
    rate_limit = tier_config["ai_rate_limit_per_minute"]

    client = redis_client or get_redis_client()
    if client is None:
        logger.warning(
            "Redis client unavailable; skipping burst rate limiting for project %s (graceful fallback)",
            project_id,
        )
        return

    key = f"ratelimit:ai:{project_id}"
    window_seconds = 60
    now = time.time()
    clear_before = now - window_seconds

    try:
        # Use pipeline for atomic sliding-window evaluation
        pipe = client.pipeline()
        # 1. Remove timestamps outside the 60s sliding window
        pipe.zremrangebyscore(key, "-inf", clear_before)
        # 2. Count requests remaining in the window
        pipe.zcard(key)
        # 3. Retrieve the oldest score in current window (to compute retry_after)
        pipe.zrange(key, 0, 0, withscores=True)
        results = pipe.execute()

        current_count = results[1]
        oldest_entry = results[2]

        if current_count >= rate_limit:
            oldest_timestamp = oldest_entry[0][1] if oldest_entry else clear_before
            retry_after = max(1, int(window_seconds - (now - oldest_timestamp)))
            logger.warning(
                "Rate limit exceeded for project %s on plan %s (%d/%d req/min). Retry-After: %ds",
                project_id,
                tier_normalized,
                current_count,
                rate_limit,
                retry_after,
            )
            raise RateLimitError(
                message=(
                    f"Rate limit exceeded: maximum {rate_limit} AI requests per minute allowed "
                    f"for {tier_normalized} plan. Please retry in {retry_after} seconds."
                ),
                details={
                    "plan_tier": tier_normalized,
                    "limit_per_minute": rate_limit,
                    "retry_after_seconds": retry_after,
                },
            )

        # Record this request in the sliding window
        member_id = f"{now}:{uuid.uuid4().hex[:8]}"
        add_pipe = client.pipeline()
        add_pipe.zadd(key, {member_id: now})
        add_pipe.expire(key, window_seconds + 5)
        add_pipe.execute()

    except RateLimitError:
        raise
    except (ConnectionError, TimeoutError) as exc:
        logger.warning(
            "Redis connection/timeout error during rate limit check for project %s: %s (graceful fallback)",
            project_id,
            exc,
        )
    except RedisError as exc:
        logger.warning(
            "Redis error during rate limit check for project %s: %s (graceful fallback)",
            project_id,
            exc,
        )
    except Exception as exc:
        logger.warning(
            "Unexpected error during Redis rate limit check for project %s: %s (graceful fallback)",
            project_id,
            exc,
        )
