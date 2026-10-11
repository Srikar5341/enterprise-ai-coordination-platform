"""Health and database readiness check endpoints."""

from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from src.core.config import get_settings
from src.core.database import check_database_health

router = APIRouter(tags=["Health"])
settings = get_settings()


class HealthResponse(BaseModel):
    """Health check response payload schema."""
    status: str
    version: str
    database: str
    environment: str


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Service health and database readiness check",
    responses={
        200: {"description": "Service is healthy and database is connected"},
        503: {"description": "Service is degraded and database is disconnected"},
    },
)
def get_health(db_healthy: bool = Depends(check_database_health)):
    """Evaluate service liveness and database ping readiness.

    Returns HTTP 200 when healthy, or HTTP 503 when the database is unreachable.
    """
    if db_healthy:
        return HealthResponse(
            status="healthy",
            version=settings.VERSION,
            database="connected",
            environment=settings.ENVIRONMENT,
        )

    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={
            "status": "degraded",
            "version": settings.VERSION,
            "database": "disconnected",
            "environment": settings.ENVIRONMENT,
        },
    )
