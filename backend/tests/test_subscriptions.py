"""Integration and unit tests for Redis rate limiting and SaaS subscription/usage enforcement."""

from datetime import datetime, timedelta, timezone
import json
from unittest.mock import MagicMock
import pytest
from fastapi import status
from redis.exceptions import ConnectionError, TimeoutError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.core.config import PLAN_ENTITLEMENTS
from src.core.database import Base, get_db
from src.core.errors import QuotaExceededError, RateLimitError
from src.core.redis import check_redis_health, get_redis_client
from src.core.security import create_access_token
from src.domains.ai.llm_service import llm_service
from src.domains.goals.models import Goal
from src.domains.projects.models import Project, ProjectMember
from src.domains.subscriptions.models import Subscription, UsageRecord
from src.domains.subscriptions.rate_limiter import check_ai_rate_limit
from src.domains.subscriptions.service import subscription_service
from src.main import app


@pytest.fixture
def sub_test_db():
    """In-memory SQLite database seeded with test projects and members."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestingSessionLocal()

    # Seed Projects
    p1 = Project(id="proj-tenant-a", name="Tenant A Corp")
    p2 = Project(id="proj-tenant-b", name="Tenant B Corp")
    session.add_all([p1, p2])

    # Seed Members
    m_lead_a = ProjectMember(id="pm-a1", project_id="proj-tenant-a", user_id="user-lead-a", role="LEAD")
    m_dev_a = ProjectMember(id="pm-a2", project_id="proj-tenant-a", user_id="user-dev-a", role="MEMBER")
    m_lead_b = ProjectMember(id="pm-b1", project_id="proj-tenant-b", user_id="user-lead-b", role="LEAD")
    session.add_all([m_lead_a, m_dev_a, m_lead_b])
    session.commit()

    def override_get_db():
        s = TestingSessionLocal()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = override_get_db

    # Clean up any Redis test keys for tenant A and tenant B
    r = get_redis_client()
    if r:
        try:
            r.delete("ratelimit:ai:proj-tenant-a")
            r.delete("ratelimit:ai:proj-tenant-b")
        except Exception:
            pass

    yield session

    if r:
        try:
            r.delete("ratelimit:ai:proj-tenant-a")
            r.delete("ratelimit:ai:proj-tenant-b")
        except Exception:
            pass

    app.dependency_overrides.clear()
    session.close()


@pytest.fixture
def token_lead_a():
    return create_access_token({"sub": "user-lead-a", "email": "lead-a@example.com", "role": "LEAD"})


@pytest.fixture
def token_dev_a():
    return create_access_token({"sub": "user-dev-a", "email": "dev-a@example.com", "role": "MEMBER"})


@pytest.fixture
def token_lead_b():
    return create_access_token({"sub": "user-lead-b", "email": "lead-b@example.com", "role": "LEAD"})


# ---------------------------------------------------------------------------
# 1. Subscription & Entitlements Retrieval
# ---------------------------------------------------------------------------

def test_default_subscription_provisioning(client, sub_test_db, token_dev_a):
    """Scenario: Querying subscription for an existing project auto-provisions default FREE tier."""
    res = client.get(
        "/api/v1/subscriptions/plan?project_id=proj-tenant-a",
        headers={"Authorization": f"Bearer {token_dev_a}"},
    )
    assert res.status_code == status.HTTP_200_OK
    data = res.json()
    assert data["project_id"] == "proj-tenant-a"
    assert data["plan_tier"] == "FREE"
    assert data["status"] == "ACTIVE"
    assert "current_period_start" in data
    assert "current_period_end" in data


def test_subscription_usage_reporting(client, sub_test_db, token_dev_a):
    """Scenario: Usage reporting returns initial 0 used, correct limit, and 0% utilization."""
    res = client.get(
        "/api/v1/subscriptions/usage?project_id=proj-tenant-a",
        headers={"Authorization": f"Bearer {token_dev_a}"},
    )
    assert res.status_code == status.HTTP_200_OK
    data = res.json()
    assert data["project_id"] == "proj-tenant-a"
    assert data["plan_tier"] == "FREE"
    assert data["metric"] == "ai_plan_generations"
    assert data["used"] == 0
    assert data["limit"] == 20
    assert data["remaining"] == 20
    assert data["utilization_percent"] == 0.0


def test_subscription_entitlements_by_tier(client, sub_test_db, token_dev_a):
    """Scenario: Querying entitlements returns configured tier parameters."""
    res_free = client.get(
        "/api/v1/subscriptions/entitlements?tier=FREE",
        headers={"Authorization": f"Bearer {token_dev_a}"},
    )
    assert res_free.status_code == status.HTTP_200_OK
    free_data = res_free.json()
    assert free_data["plan_tier"] == "FREE"
    assert free_data["max_ai_generations_per_month"] == 20
    assert free_data["ai_rate_limit_per_minute"] == 3

    res_team = client.get(
        "/api/v1/subscriptions/entitlements?tier=TEAM",
        headers={"Authorization": f"Bearer {token_dev_a}"},
    )
    assert res_team.status_code == status.HTTP_200_OK
    team_data = res_team.json()
    assert team_data["plan_tier"] == "TEAM"
    assert team_data["max_ai_generations_per_month"] == 200
    assert team_data["ai_rate_limit_per_minute"] == 10

    res_biz = client.get(
        "/api/v1/subscriptions/entitlements?tier=BUSINESS",
        headers={"Authorization": f"Bearer {token_dev_a}"},
    )
    assert res_biz.status_code == status.HTTP_200_OK
    biz_data = res_biz.json()
    assert biz_data["plan_tier"] == "BUSINESS"
    assert biz_data["max_ai_generations_per_month"] == 1000
    assert biz_data["ai_rate_limit_per_minute"] == 30


# ---------------------------------------------------------------------------
# 2. Workspace Tenant Isolation
# ---------------------------------------------------------------------------

def test_workspace_isolation_forbidden_for_non_member(client, sub_test_db, token_lead_b):
    """Scenario: Tenant B lead attempting to access Tenant A subscription is rejected with 403."""
    # Attempt to view plan
    res_plan = client.get(
        "/api/v1/subscriptions/plan?project_id=proj-tenant-a",
        headers={"Authorization": f"Bearer {token_lead_b}"},
    )
    assert res_plan.status_code == status.HTTP_403_FORBIDDEN
    assert res_plan.json()["error"]["code"] == "FORBIDDEN"

    # Attempt to view usage
    res_usage = client.get(
        "/api/v1/subscriptions/usage?project_id=proj-tenant-a",
        headers={"Authorization": f"Bearer {token_lead_b}"},
    )
    assert res_usage.status_code == status.HTTP_403_FORBIDDEN
    assert res_usage.json()["error"]["code"] == "FORBIDDEN"

    # Attempt to upgrade Tenant A's plan
    res_upgrade = client.post(
        "/api/v1/subscriptions/upgrade-request",
        headers={"Authorization": f"Bearer {token_lead_b}"},
        json={"project_id": "proj-tenant-a", "requested_tier": "BUSINESS"},
    )
    assert res_upgrade.status_code == status.HTTP_403_FORBIDDEN
    assert res_upgrade.json()["error"]["code"] == "FORBIDDEN"


# ---------------------------------------------------------------------------
# 3. Plan Upgrade Demo Workflow
# ---------------------------------------------------------------------------

def test_plan_upgrade_demo_workflow(client, sub_test_db, token_lead_a, token_dev_a):
    """Scenario: Authorized project lead upgrades plan to TEAM, expanding limits."""
    # Member cannot upgrade (requires LEAD)
    res_member = client.post(
        "/api/v1/subscriptions/upgrade-request",
        headers={"Authorization": f"Bearer {token_dev_a}"},
        json={"project_id": "proj-tenant-a", "requested_tier": "TEAM"},
    )
    assert res_member.status_code == status.HTTP_403_FORBIDDEN

    # Lead can upgrade
    res_lead = client.post(
        "/api/v1/subscriptions/upgrade-request",
        headers={"Authorization": f"Bearer {token_lead_a}"},
        json={"project_id": "proj-tenant-a", "requested_tier": "TEAM"},
    )
    assert res_lead.status_code == status.HTTP_200_OK
    assert res_lead.json()["plan_tier"] == "TEAM"

    # Verify usage reflects new TEAM limit (200)
    usage_res = client.get(
        "/api/v1/subscriptions/usage?project_id=proj-tenant-a",
        headers={"Authorization": f"Bearer {token_dev_a}"},
    )
    assert usage_res.json()["limit"] == 200
    assert usage_res.json()["plan_tier"] == "TEAM"


# ---------------------------------------------------------------------------
# 4. Quota Enforcement and Exhaustion (MySQL Durable Source of Truth)
# ---------------------------------------------------------------------------

def test_quota_exhaustion_blocks_ai_generation(client, sub_test_db, token_lead_a, monkeypatch):
    """Scenario: When project reaches monthly limit (20), AI plan generation returns HTTP 429 QUOTA_EXCEEDED."""
    sample_plan = {
        "tasks": [{"temp_id": "T1", "title": "Quota Task", "description": "D", "estimated_hours": 1.0}],
        "dependencies": [],
    }
    monkeypatch.setattr(llm_service, "_call_provider", lambda prompt, client=None: json.dumps(sample_plan))

    # Pre-exhaust the quota to 20/20 in MySQL
    sub = subscription_service.get_or_create_subscription("proj-tenant-a", sub_test_db)
    usage = subscription_service.get_or_create_usage_record(sub, sub_test_db)
    usage.count = 20
    sub_test_db.commit()

    # Create Goal
    future_date = (datetime.now(timezone.utc) + timedelta(days=5)).isoformat()
    goal_res = client.post(
        "/api/v1/projects/proj-tenant-a/goals",
        headers={"Authorization": f"Bearer {token_lead_a}"},
        json={"title": "Quota Test Goal", "target_date": future_date},
    )
    assert goal_res.status_code == status.HTTP_201_CREATED
    goal_id = goal_res.json()["id"]

    # Attempt AI plan generation -> Expect 429 QUOTA_EXCEEDED
    gen_res = client.post(
        "/api/v1/ai/plan/generate",
        headers={"Authorization": f"Bearer {token_lead_a}"},
        json={"goal_id": goal_id},
    )
    assert gen_res.status_code == status.HTTP_429_TOO_MANY_REQUESTS
    err = gen_res.json()["error"]
    assert err["code"] == "QUOTA_EXCEEDED"
    assert "quota of 20 reached" in err["message"]


def test_successful_ai_generation_increments_persistent_usage(client, sub_test_db, token_lead_a, monkeypatch):
    """Scenario: Valid AI plan generation increments MySQL usage_records count by 1."""
    sample_plan = {
        "tasks": [{"temp_id": "T1", "title": "Count Task", "description": "D", "estimated_hours": 1.0}],
        "dependencies": [],
    }
    monkeypatch.setattr(llm_service, "_call_provider", lambda prompt, client=None: json.dumps(sample_plan))

    # Check baseline usage
    usage_before = client.get(
        "/api/v1/subscriptions/usage?project_id=proj-tenant-a",
        headers={"Authorization": f"Bearer {token_lead_a}"},
    ).json()["used"]

    # Create and generate plan
    future_date = (datetime.now(timezone.utc) + timedelta(days=5)).isoformat()
    goal_res = client.post(
        "/api/v1/projects/proj-tenant-a/goals",
        headers={"Authorization": f"Bearer {token_lead_a}"},
        json={"title": "Increment Test Goal", "target_date": future_date},
    )
    goal_id = goal_res.json()["id"]

    gen_res = client.post(
        "/api/v1/ai/plan/generate",
        headers={"Authorization": f"Bearer {token_lead_a}"},
        json={"goal_id": goal_id},
    )
    assert gen_res.status_code == status.HTTP_201_CREATED

    # Check usage after
    usage_after = client.get(
        "/api/v1/subscriptions/usage?project_id=proj-tenant-a",
        headers={"Authorization": f"Bearer {token_lead_a}"},
    ).json()["used"]
    assert usage_after == usage_before + 1


# ---------------------------------------------------------------------------
# 5. Redis Burst Rate Limiting
# ---------------------------------------------------------------------------

def test_redis_sliding_window_rate_limiting():
    """Scenario: Burst rate limiting allows requests within limit and raises RateLimitError when exceeded."""
    mock_redis = MagicMock()
    # Mock pipeline execution
    pipe_mock = MagicMock()
    mock_redis.pipeline.return_value = pipe_mock

    # 1. Within limit (count = 1, limit = 3 for FREE)
    pipe_mock.execute.return_value = [0, 1, [(b"ts", 1000.0)]]
    # Should not raise
    check_ai_rate_limit(project_id="test-proj-rate", tier="FREE", redis_client=mock_redis)

    # 2. Exceeded limit (count = 3, limit = 3 for FREE)
    pipe_mock.execute.return_value = [0, 3, [(b"ts", 1000.0)]]
    with pytest.raises(RateLimitError) as exc_info:
        check_ai_rate_limit(project_id="test-proj-rate", tier="FREE", redis_client=mock_redis)

    assert exc_info.value.code == "RATE_LIMIT_EXCEEDED"
    assert "maximum 3 AI requests per minute" in exc_info.value.message


def test_redis_failure_graceful_fallback():
    """Scenario: Redis network timeout/connection failure degrades gracefully without crashing."""
    mock_redis = MagicMock()
    mock_redis.pipeline.side_effect = ConnectionError("Redis connection refused")

    # Should log warning and return without raising exception
    check_ai_rate_limit(project_id="test-proj-fallback", tier="FREE", redis_client=mock_redis)


# ---------------------------------------------------------------------------
# 6. Tenant Quota Isolation
# ---------------------------------------------------------------------------

def test_distinct_tenant_quotas(sub_test_db):
    """Scenario: Quota consumption in Tenant A does not deplete Tenant B's quota."""
    # Tenant A uses quota
    subscription_service.check_and_increment_quota("proj-tenant-a", sub_test_db)
    subscription_service.check_and_increment_quota("proj-tenant-a", sub_test_db)

    usage_a = subscription_service.get_usage("proj-tenant-a", sub_test_db)
    usage_b = subscription_service.get_usage("proj-tenant-b", sub_test_db)

    assert usage_a["used"] == 2
    assert usage_b["used"] == 0


# ---------------------------------------------------------------------------
# 7. Live Redis Health Ping
# ---------------------------------------------------------------------------

def test_live_redis_health_ping():
    """Scenario: Verify health check ping against live Redis container if running."""
    health_res = check_redis_health()
    # If redis is running, status should be 'connected' with measured latency
    if health_res.get("status") == "connected":
        assert health_res["latency_ms"] >= 0.0
        assert health_res["port"] == 6379
