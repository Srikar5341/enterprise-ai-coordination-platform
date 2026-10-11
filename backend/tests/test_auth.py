"""Unit and integration tests for Bearer JWT authentication and project authorization."""

from datetime import timedelta
import pytest
from fastapi import Depends, status
from src.core.auth import AuthenticatedUser, get_current_user, verify_project_lead_permission
from src.core.errors import ForbiddenError, UnauthorizedError
from src.core.security import create_access_token
from src.main import app


# Test route protected with get_current_user
@app.get("/api/v1/test/auth-me")
def dummy_auth_endpoint(user: AuthenticatedUser = Depends(get_current_user)):
    return {"user_id": user.id, "email": user.email, "role": user.role}


def test_missing_token_returns_401(client):
    """Scenario: Missing authorization header returns 401 in standard error envelope."""
    response = client.get("/api/v1/test/auth-me")
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    data = response.json()
    assert data["error"]["code"] == "UNAUTHORIZED"
    assert "missing" in data["error"]["message"].lower()


def test_invalid_token_returns_401(client):
    """Scenario: Malformed or invalid JWT returns 401 in standard error envelope."""
    response = client.get(
        "/api/v1/test/auth-me",
        headers={"Authorization": "Bearer invalid.token.value"},
    )
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    data = response.json()
    assert data["error"]["code"] == "UNAUTHORIZED"


def test_expired_token_returns_401(client):
    """Scenario: Expired JWT returns 401 with explicit expiration error message."""
    expired_token = create_access_token(
        data={"sub": "user-123", "email": "test@example.com"},
        expires_delta=timedelta(seconds=-10),
    )
    response = client.get(
        "/api/v1/test/auth-me",
        headers={"Authorization": f"Bearer {expired_token}"},
    )
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    data = response.json()
    assert data["error"]["code"] == "UNAUTHORIZED"
    assert "expired" in data["error"]["message"].lower()


def test_valid_token_authenticates_user(client):
    """Scenario: Valid JWT resolves user identity and role."""
    valid_token = create_access_token(
        data={"sub": "user-456", "email": "lead@example.com", "role": "LEAD"},
    )
    response = client.get(
        "/api/v1/test/auth-me",
        headers={"Authorization": f"Bearer {valid_token}"},
    )
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["user_id"] == "user-456"
    assert data["email"] == "lead@example.com"
    assert data["role"] == "LEAD"


def test_project_lead_permission_check():
    """Scenario: Project permission checks enforce LEAD or ADMIN roles."""
    lead_user = AuthenticatedUser(id="u1", email="lead@example.com", role="LEAD")
    member_user = AuthenticatedUser(id="u2", email="dev@example.com", role="MEMBER")

    # Lead user allowed
    assert verify_project_lead_permission("proj-1", lead_user, db=None) is True

    # Member user rejected with 403 Forbidden
    with pytest.raises(ForbiddenError) as exc_info:
        verify_project_lead_permission("proj-1", member_user, db=None)
    assert exc_info.value.status_code == status.HTTP_403_FORBIDDEN
    assert exc_info.value.code == "FORBIDDEN"
