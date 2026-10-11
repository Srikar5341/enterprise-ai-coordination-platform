"""Unit and integration tests for Secure Email Verification Lifecycle.

Tests:
1. Registration with secure SHA-256 token hashing and email delivery dispatch
2. Unverified account login rejection (HTTP 403 Forbidden)
3. Successful email verification with account transition to is_verified = True
4. Expired token rejection (HTTP 400 Bad Request)
5. Token replay/reuse rejection (HTTP 409 Conflict)
6. Resend rate limiting cooldown enforcement (HTTP 429 Too Many Requests)
7. Resend for already verified account rejection (HTTP 400 Bad Request)
8. Verified login success with token pair issuance (HTTP 200 OK)
"""

from datetime import datetime, timedelta, timezone
import pytest
from fastapi import status
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.core.database import Base, get_db
from src.core.security import hash_password, hash_token
from src.domains.auth.email_delivery import DevInMemoryEmailSink, set_email_provider
from src.domains.auth.models import User
from src.main import app


@pytest.fixture
def email_sink():
    """Configure in-memory email sink for capturing outbound tokens."""
    sink = DevInMemoryEmailSink()
    set_email_provider(sink)
    yield sink
    sink.clear()


@pytest.fixture
def verification_db(email_sink):
    """In-memory SQLite database for email verification lifecycle tests."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db

    yield TestingSessionLocal

    app.dependency_overrides.clear()


def test_registration_hashes_token_and_dispatches_email(client, verification_db, email_sink):
    """Scenario: Registration hashes token, dispatches via delivery sink, and conceals token from HTTP response."""
    reg_res = client.post(
        "/api/v1/auth/register",
        json={
            "email": "secure_user@example.com",
            "password": "StrongPassword123!",
            "full_name": "Secure User",
        },
    )
    assert reg_res.status_code == status.HTTP_201_CREATED
    data = reg_res.json()

    # 1. Response never exposes raw verification token
    assert "token" not in data
    assert "verification_token" not in data
    assert data["user"]["is_verified"] is False
    assert data["verification_status"] == "pending_verification"

    # 2. Email sink captured the dispatched raw token
    raw_token = email_sink.get_latest_token("secure_user@example.com")
    assert raw_token is not None
    assert len(raw_token) >= 32

    # 3. Database stores only the SHA-256 hash
    db = verification_db()
    try:
        user = db.query(User).filter(User.email == "secure_user@example.com").first()
        assert user is not None
        assert user.is_verified is False
        assert user.verification_token is None  # Legacy raw column is None
        assert user.verification_token_hash == hash_token(raw_token)
        assert user.verification_token_consumed_at is None
        assert user.verification_token_expires_at is not None
    finally:
        db.close()


def test_unverified_account_login_rejected(client, verification_db, email_sink):
    """Scenario: Unverified user cannot log in (HTTP 403 Forbidden with clear message)."""
    client.post(
        "/api/v1/auth/register",
        json={
            "email": "unverified@example.com",
            "password": "Password123!",
            "full_name": "Unverified User",
        },
    )

    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": "unverified@example.com", "password": "Password123!"},
    )
    assert login_res.status_code == status.HTTP_403_FORBIDDEN
    err = login_res.json()["error"]
    assert err["code"] == "FORBIDDEN"
    assert "verified" in err["message"].lower()


def test_valid_verification_and_login_success(client, verification_db, email_sink):
    """Scenario: Valid token verification transitions account to verified; login succeeds."""
    # 1. Register
    client.post(
        "/api/v1/auth/register",
        json={
            "email": "verify_me@example.com",
            "password": "Password123!",
            "full_name": "Verify Me",
        },
    )
    raw_token = email_sink.get_latest_token("verify_me@example.com")

    # 2. Verify token
    verify_res = client.post(
        "/api/v1/auth/verify-email",
        json={"token": raw_token},
    )
    assert verify_res.status_code == status.HTTP_200_OK
    verify_data = verify_res.json()
    assert verify_data["status"] == "success"
    assert verify_data["user"]["is_verified"] is True

    # 3. DB confirms consumption and verified status
    db = verification_db()
    try:
        user = db.query(User).filter(User.email == "verify_me@example.com").first()
        assert user.is_verified is True
        assert user.verification_token_consumed_at is not None
    finally:
        db.close()

    # 4. Login now succeeds
    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": "verify_me@example.com", "password": "Password123!"},
    )
    assert login_res.status_code == status.HTTP_200_OK
    tokens = login_res.json()
    assert "access_token" in tokens
    assert "refresh_token" in tokens


def test_expired_token_rejected(client, verification_db, email_sink):
    """Scenario: Expired verification token is rejected with HTTP 400 Bad Request."""
    client.post(
        "/api/v1/auth/register",
        json={
            "email": "expired@example.com",
            "password": "Password123!",
            "full_name": "Expired User",
        },
    )
    raw_token = email_sink.get_latest_token("expired@example.com")

    # Manually expire token in DB
    db = verification_db()
    try:
        user = db.query(User).filter(User.email == "expired@example.com").first()
        user.verification_token_expires_at = datetime.now(timezone.utc) - timedelta(hours=1)
        db.commit()
    finally:
        db.close()

    verify_res = client.post(
        "/api/v1/auth/verify-email",
        json={"token": raw_token},
    )
    assert verify_res.status_code == status.HTTP_400_BAD_REQUEST
    err = verify_res.json()["error"]
    assert err["code"] == "BAD_REQUEST"
    assert "expired" in err["message"].lower()


def test_token_replay_rejected(client, verification_db, email_sink):
    """Scenario: Token already consumed cannot be used again (HTTP 409 Conflict)."""
    client.post(
        "/api/v1/auth/register",
        json={
            "email": "replay@example.com",
            "password": "Password123!",
            "full_name": "Replay User",
        },
    )
    raw_token = email_sink.get_latest_token("replay@example.com")

    # First verification succeeds
    res1 = client.post("/api/v1/auth/verify-email", json={"token": raw_token})
    assert res1.status_code == status.HTTP_200_OK

    # Second verification attempt (replay) fails with 409 Conflict
    res2 = client.post("/api/v1/auth/verify-email", json={"token": raw_token})
    assert res2.status_code == status.HTTP_409_CONFLICT
    err = res2.json()["error"]
    assert err["code"] == "CONFLICT"
    assert "already been used" in err["message"].lower()


def test_resend_verification_cooldown_rate_limit(client, verification_db, email_sink):
    """Scenario: Resend during 60-second cooldown is rejected with HTTP 429 RateLimitError."""
    client.post(
        "/api/v1/auth/register",
        json={
            "email": "ratelimit@example.com",
            "password": "Password123!",
            "full_name": "Rate Limit User",
        },
    )

    # Immediate resend attempt (within 60s cooldown)
    resend_res = client.post(
        "/api/v1/auth/resend-verification",
        json={"email": "ratelimit@example.com"},
    )
    assert resend_res.status_code == status.HTTP_429_TOO_MANY_REQUESTS
    err = resend_res.json()["error"]
    assert err["code"] == "RATE_LIMIT_EXCEEDED"
    assert "wait" in err["message"].lower()


def test_resend_verification_success_after_cooldown(client, verification_db, email_sink):
    """Scenario: Resend after cooldown succeeds and dispatches fresh token."""
    client.post(
        "/api/v1/auth/register",
        json={
            "email": "resend_ok@example.com",
            "password": "Password123!",
            "full_name": "Resend OK User",
        },
    )
    token_1 = email_sink.get_latest_token("resend_ok@example.com")

    # Simulate passage of 65 seconds
    db = verification_db()
    try:
        user = db.query(User).filter(User.email == "resend_ok@example.com").first()
        user.last_verification_sent_at = datetime.now(timezone.utc) - timedelta(seconds=65)
        db.commit()
    finally:
        db.close()

    # Resend succeeds
    resend_res = client.post(
        "/api/v1/auth/resend-verification",
        json={"email": "resend_ok@example.com"},
    )
    assert resend_res.status_code == status.HTTP_200_OK
    token_2 = email_sink.get_latest_token("resend_ok@example.com")
    assert token_2 != token_1

    # New token can verify the account
    verify_res = client.post("/api/v1/auth/verify-email", json={"token": token_2})
    assert verify_res.status_code == status.HTTP_200_OK
    assert verify_res.json()["user"]["is_verified"] is True


def test_resend_already_verified_account_rejected(client, verification_db, email_sink):
    """Scenario: Resend for already-verified account returns HTTP 400 Bad Request."""
    client.post(
        "/api/v1/auth/register",
        json={
            "email": "already_v@example.com",
            "password": "Password123!",
            "full_name": "Already Verified",
        },
    )
    token = email_sink.get_latest_token("already_v@example.com")
    client.post("/api/v1/auth/verify-email", json={"token": token})

    # Resend attempt
    resend_res = client.post(
        "/api/v1/auth/resend-verification",
        json={"email": "already_v@example.com"},
    )
    assert resend_res.status_code == status.HTTP_400_BAD_REQUEST
    err = resend_res.json()["error"]
    assert err["code"] == "BAD_REQUEST"
    assert "already verified" in err["message"].lower()
