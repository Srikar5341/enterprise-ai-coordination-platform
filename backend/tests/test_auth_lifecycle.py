"""Unit and integration tests for Authentication Lifecycle, Token Rotation, Revocation, and Project Isolation."""

from datetime import datetime, timedelta, timezone
import pytest
from fastapi import status
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.core.database import Base, get_db
from src.core.security import create_access_token, hash_password, hash_token
from src.domains.auth.models import RefreshToken, User
from src.domains.projects.models import Project, ProjectMember
from src.main import app


@pytest.fixture
def auth_test_db():
    """In-memory SQLite database for authentication lifecycle and isolation tests."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    init_db = TestingSessionLocal()

    # Seed users
    active_user = User(
        id="user-active-1",
        email="lead@example.com",
        full_name="Lead Engineer",
        hashed_password=hash_password("ValidPassword123!"),
        role="LEAD",
        is_active=True,
        is_verified=True,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    deactivated_user = User(
        id="user-deactivated-2",
        email="inactive@example.com",
        full_name="Inactive Member",
        hashed_password=hash_password("ValidPassword123!"),
        role="MEMBER",
        is_active=False,
        is_verified=True,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    project_member_user = User(
        id="user-member-3",
        email="member@example.com",
        full_name="Standard Member",
        hashed_password=hash_password("ValidPassword123!"),
        role="MEMBER",
        is_active=True,
        is_verified=True,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )

    # Seed projects
    project_1 = Project(id="proj-alpha", name="Project Alpha")
    project_2 = Project(id="proj-beta", name="Project Beta")

    # Seed memberships: lead in Project Alpha, member in Project Alpha, no access in Project Beta
    pm_lead = ProjectMember(id="pm-1", project_id="proj-alpha", user_id="user-active-1", role="LEAD")
    pm_member = ProjectMember(id="pm-2", project_id="proj-alpha", user_id="user-member-3", role="MEMBER")

    init_db.add_all([active_user, deactivated_user, project_member_user, project_1, project_2, pm_lead, pm_member])
    init_db.commit()

    def override_get_db():
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db

    yield TestingSessionLocal

    app.dependency_overrides.clear()
    init_db.close()


def test_login_success(client, auth_test_db):
    """Scenario: Valid credentials return access token and refresh token."""
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "lead@example.com", "password": "ValidPassword123!"},
    )
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"
    assert data["expires_in"] == 900


def test_login_invalid_password(client, auth_test_db):
    """Scenario: Incorrect password returns 401 Unauthorized in standard envelope."""
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "lead@example.com", "password": "WrongPassword!"},
    )
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    data = response.json()
    assert data["error"]["code"] == "UNAUTHORIZED"
    assert "invalid" in data["error"]["message"].lower()


def test_login_nonexistent_user(client, auth_test_db):
    """Scenario: Non-existent email returns generic 401 Unauthorized."""
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@example.com", "password": "AnyPassword!"},
    )
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    data = response.json()
    assert data["error"]["code"] == "UNAUTHORIZED"


def test_login_deactivated_user(client, auth_test_db):
    """Scenario: Deactivated user account is rejected."""
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "inactive@example.com", "password": "ValidPassword123!"},
    )
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    data = response.json()
    assert data["error"]["code"] == "UNAUTHORIZED"
    assert "deactivated" in data["error"]["message"].lower()


def test_refresh_token_rotation_lifecycle(client, auth_test_db):
    """Scenario: Refresh token rotation issues fresh tokens and revokes prior token."""
    # 1. Login to obtain initial tokens
    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": "lead@example.com", "password": "ValidPassword123!"},
    )
    init_tokens = login_res.json()
    first_refresh_token = init_tokens["refresh_token"]

    # 2. Rotate token
    refresh_res = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": first_refresh_token},
    )
    assert refresh_res.status_code == status.HTTP_200_OK
    new_tokens = refresh_res.json()
    second_refresh_token = new_tokens["refresh_token"]

    assert second_refresh_token != first_refresh_token
    assert "access_token" in new_tokens

    # 3. Attempt reuse of old refresh token -> Must be rejected with 401
    reuse_res = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": first_refresh_token},
    )
    assert reuse_res.status_code == status.HTTP_401_UNAUTHORIZED
    assert reuse_res.json()["error"]["code"] == "UNAUTHORIZED"
    assert "revoked" in reuse_res.json()["error"]["message"].lower()

    # 4. New refresh token is usable
    second_rotation_res = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": second_refresh_token},
    )
    assert second_rotation_res.status_code == status.HTTP_200_OK


def test_refresh_token_expired_rejected(client, auth_test_db):
    """Scenario: Expired refresh token is rejected with 401."""
    session = auth_test_db()
    expired_raw = "expired_raw_opaque_token_value_here"
    expired_hash = hash_token(expired_raw)
    past_time = datetime.now(timezone.utc) - timedelta(days=1)

    rt = RefreshToken(
        id="rt-expired",
        user_id="user-active-1",
        token_hash=expired_hash,
        expires_at=past_time,
        created_at=past_time - timedelta(days=7),
    )
    session.add(rt)
    session.commit()
    session.close()

    response = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": expired_raw},
    )
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert response.json()["error"]["code"] == "UNAUTHORIZED"
    assert "expired" in response.json()["error"]["message"].lower()


def test_logout_revocation(client, auth_test_db):
    """Scenario: Logout revokes active refresh token immediately."""
    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": "lead@example.com", "password": "ValidPassword123!"},
    )
    refresh_token = login_res.json()["refresh_token"]

    # Call logout
    logout_res = client.post(
        "/api/v1/auth/logout",
        json={"refresh_token": refresh_token},
    )
    assert logout_res.status_code == status.HTTP_200_OK

    # Subsequent refresh attempt with revoked token must fail
    refresh_res = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token},
    )
    assert refresh_res.status_code == status.HTTP_401_UNAUTHORIZED
    assert "revoked" in refresh_res.json()["error"]["message"].lower()


def test_auth_me_profile(client, auth_test_db):
    """Scenario: /auth/me returns current user profile."""
    # Obtain token
    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": "lead@example.com", "password": "ValidPassword123!"},
    )
    access_token = login_res.json()["access_token"]

    me_res = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert me_res.status_code == status.HTTP_200_OK
    user_data = me_res.json()
    assert user_data["email"] == "lead@example.com"
    assert user_data["full_name"] == "Lead Engineer"
    assert user_data["role"] == "LEAD"
    assert user_data["is_active"] is True


def test_register_flow_and_conflict(client, auth_test_db):
    """Scenario: Account registration creates unverified user and prevents duplicates."""
    # Register new account
    reg_res = client.post(
        "/api/v1/auth/register",
        json={
            "email": "newbie@example.com",
            "password": "StrongPassword123!",
            "full_name": "New Team Member",
        },
    )
    assert reg_res.status_code == status.HTTP_201_CREATED
    data = reg_res.json()
    assert data["user"]["email"] == "newbie@example.com"
    assert data["user"]["is_verified"] is False
    assert data["verification_status"] == "pending_verification"
    assert data["email_delivery"] == "unconfigured"

    # Register again with same email -> 409 Conflict
    dup_res = client.post(
        "/api/v1/auth/register",
        json={
            "email": "newbie@example.com",
            "password": "StrongPassword123!",
            "full_name": "Duplicate Member",
        },
    )
    assert dup_res.status_code == status.HTTP_409_CONFLICT
    assert dup_res.json()["error"]["code"] == "CONFLICT"


def test_project_isolation_and_authorization(client, auth_test_db):
    """Scenario: Project membership validates tenant isolation across distinct projects."""
    # 1. Lead user creates goal on Project Alpha -> Success
    lead_token = create_access_token({"sub": "user-active-1", "email": "lead@example.com", "role": "LEAD"})
    alpha_goal_res = client.post(
        "/api/v1/projects/proj-alpha/goals",
        headers={"Authorization": f"Bearer {lead_token}"},
        json={
            "title": "Alpha Release Goal",
            "target_date": (datetime.now(timezone.utc) + timedelta(days=10)).isoformat(),
        },
    )
    assert alpha_goal_res.status_code == status.HTTP_201_CREATED

    # 2. Lead user attempts goal creation on Project Beta (no membership) -> 403 Forbidden
    beta_goal_res = client.post(
        "/api/v1/projects/proj-beta/goals",
        headers={"Authorization": f"Bearer {lead_token}"},
        json={
            "title": "Unauthorized Beta Goal",
            "target_date": (datetime.now(timezone.utc) + timedelta(days=10)).isoformat(),
        },
    )
    assert beta_goal_res.status_code == status.HTTP_403_FORBIDDEN
    assert beta_goal_res.json()["error"]["code"] == "FORBIDDEN"

    # 3. Member user attempts goal creation on Project Alpha (member role, not LEAD) -> 403 Forbidden
    member_token = create_access_token({"sub": "user-member-3", "email": "member@example.com", "role": "MEMBER"})
    member_res = client.post(
        "/api/v1/projects/proj-alpha/goals",
        headers={"Authorization": f"Bearer {member_token}"},
        json={
            "title": "Member Alpha Goal",
            "target_date": (datetime.now(timezone.utc) + timedelta(days=10)).isoformat(),
        },
    )
    assert member_res.status_code == status.HTTP_403_FORBIDDEN
    assert member_res.json()["error"]["code"] == "FORBIDDEN"
