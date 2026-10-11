"""Health and database readiness check endpoints."""

from typing import Optional
from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from src.core.config import get_settings
from src.core.database import check_database_health
from src.core.redis import check_redis_health

router = APIRouter(tags=["Health"])
settings = get_settings()


class HealthResponse(BaseModel):
    """Health check response payload schema."""
    status: str
    version: str
    database: str
    redis: Optional[str] = None
    environment: str


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Service health, database, and Redis readiness check",
    responses={
        200: {"description": "Service is healthy or degraded (Redis unreachable)"},
        503: {"description": "Service is degraded and database is disconnected"},
    },
)
def get_health(
    db_healthy: bool = Depends(check_database_health),
    redis_info: dict = Depends(check_redis_health),
):
    """Evaluate service liveness, database ping readiness, and Redis connectivity.

    Returns HTTP 200 when healthy (or degraded if Redis is down), or HTTP 503 when the database is unreachable.
    """
    redis_status = redis_info.get("status", "unknown")
    if db_healthy:
        is_degraded = (redis_status not in ("connected", "disabled"))
        return HealthResponse(
            status="degraded" if is_degraded else "healthy",
            version=settings.VERSION,
            database="connected",
            redis=redis_status,
            environment=settings.ENVIRONMENT,
        )

    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={
            "status": "degraded",
            "version": settings.VERSION,
            "database": "disconnected",
            "redis": redis_status,
            "environment": settings.ENVIRONMENT,
        },
    )

