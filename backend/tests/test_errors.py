"""Integration tests for the structured API error envelope formatting."""

from fastapi import status
from pydantic import BaseModel
from src.core.errors import AppException, NotFoundError
from src.main import app


class DummyPayload(BaseModel):
    name: str
    count: int


# Temporary test endpoints to trigger validation and internal exceptions
@app.post("/api/v1/test/validation-test")
def dummy_validation_endpoint(payload: DummyPayload):
    return {"message": f"Hello {payload.name}"}


@app.get("/api/v1/test/custom-error")
def dummy_custom_error():
    raise NotFoundError(message="Custom item not found", details={"item_id": "test-123"})


@app.get("/api/v1/test/unhandled-error")
def dummy_unhandled_error():
    raise RuntimeError("Simulated unexpected crash")


def test_404_not_found_envelope(client):
    """Scenario: Unrouted path returns 404 formatted in standard error envelope."""
    response = client.get("/api/v1/nonexistent-endpoint-xyz")
    assert response.status_code == status.HTTP_404_NOT_FOUND
    data = response.json()

    assert "error" in data
    assert data["error"]["code"] == "NOT_FOUND"
    assert "Not Found" in data["error"]["message"]
    assert data["error"]["details"] is None


def test_422_validation_error_envelope(client):
    """Scenario: Request validation failure returns 422 with structured field details."""
    response = client.post("/api/v1/test/validation-test", json={"name": "Alice", "count": "not-an-integer"})
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    data = response.json()

    assert "error" in data
    assert data["error"]["code"] == "VALIDATION_ERROR"
    assert data["error"]["message"] == "Request validation failed"
    assert isinstance(data["error"]["details"], list)
    assert len(data["error"]["details"]) > 0
    assert "loc" in data["error"]["details"][0]


def test_app_exception_envelope(client):
    """Scenario: Application exceptions format with specific code and details."""
    response = client.get("/api/v1/test/custom-error")
    assert response.status_code == status.HTTP_404_NOT_FOUND
    data = response.json()

    assert "error" in data
    assert data["error"]["code"] == "NOT_FOUND"
    assert data["error"]["message"] == "Custom item not found"
    assert data["error"]["details"] == {"item_id": "test-123"}


def test_unhandled_exception_hides_traces():
    """Scenario: Unhandled exceptions return generic 500 error hiding internal stack traces."""
    from fastapi.testclient import TestClient

    custom_client = TestClient(app, raise_server_exceptions=False)
    response = custom_client.get("/api/v1/test/unhandled-error")
    assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
    data = response.json()

    assert "error" in data
    assert data["error"]["code"] == "INTERNAL_SERVER_ERROR"
    assert data["error"]["message"] == "An unexpected internal server error occurred"
    assert data["error"]["details"] is None
    # Ensure sensitive traceback or internal code info is NOT leaked in the payload
    assert "Simulated unexpected crash" not in str(data)
