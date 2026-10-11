"""Integration tests for the health check and database ping endpoint."""

from fastapi import status
from src.core.database import check_database_health
from src.main import app


def test_health_endpoint_healthy(client):
    """Scenario: Database is reachable and healthy (returns HTTP 200)."""
    app.dependency_overrides[check_database_health] = lambda: True

    try:
        response = client.get("/api/v1/health")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["status"] == "healthy"
        assert data["database"] == "connected"
        assert data["version"] == "0.1.0"
        assert "environment" in data
    finally:
        app.dependency_overrides.clear()


def test_health_endpoint_degraded(client):
    """Scenario: Database is unreachable or down (returns HTTP 503)."""
    app.dependency_overrides[check_database_health] = lambda: False

    try:
        response = client.get("/api/v1/health")
        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
        data = response.json()
        assert data["status"] == "degraded"
        assert data["database"] == "disconnected"
        assert data["version"] == "0.1.0"
    finally:
        app.dependency_overrides.clear()
