"""End-to-end integration tests for Goal Planning and Proposal Lifecycle REST API."""

from datetime import datetime, timedelta, timezone
import json
import httpx
import pytest
from fastapi import status
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.core.database import Base, get_db
from src.core.security import create_access_token
from src.domains.ai.llm_service import llm_service
from src.domains.goals.models import Goal
from src.domains.projects.models import Project, ProjectMember
from src.domains.tasks.models import Task, TaskDependency
from src.main import app


@pytest.fixture
def api_test_db():
    """In-memory SQLite database with StaticPool for thread-safe FastAPI integration tests."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    # Seed test project and memberships
    init_db = TestingSessionLocal()
    project = Project(id="proj-api-1", name="Core Infrastructure")
    init_db.add(project)

    member_lead = ProjectMember(
        id="pm-1",
        project_id="proj-api-1",
        user_id="user-lead",
        role="LEAD",
    )
    member_dev = ProjectMember(
        id="pm-2",
        project_id="proj-api-1",
        user_id="user-dev",
        role="MEMBER",
    )
    init_db.add_all([member_lead, member_dev])
    init_db.commit()

    def override_get_db():
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db

    yield init_db

    app.dependency_overrides.clear()
    init_db.close()


@pytest.fixture
def lead_token():
    return create_access_token({"sub": "user-lead", "email": "lead@example.com", "role": "LEAD"})


@pytest.fixture
def dev_token():
    return create_access_token({"sub": "user-dev", "email": "dev@example.com", "role": "MEMBER"})


def test_goal_submission_success(client, api_test_db, lead_token):
    """Scenario: Authenticated lead submits goal payload (returns HTTP 201)."""
    future_date = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    response = client.post(
        "/api/v1/projects/proj-api-1/goals",
        headers={"Authorization": f"Bearer {lead_token}"},
        json={
            "title": "Release v2.4",
            "description": "Production release pipeline",
            "target_date": future_date,
        },
    )
    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data["title"] == "Release v2.4"
    assert data["status"] == "PENDING_PLANNING"
    assert data["project_id"] == "proj-api-1"
    assert "id" in data


def test_goal_submission_unauthorized_member(client, api_test_db, dev_token):
    """Scenario: Non-lead team member rejected with HTTP 403 in standard error envelope."""
    future_date = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    response = client.post(
        "/api/v1/projects/proj-api-1/goals",
        headers={"Authorization": f"Bearer {dev_token}"},
        json={
            "title": "Unauthorized Goal",
            "target_date": future_date,
        },
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN
    data = response.json()
    assert data["error"]["code"] == "FORBIDDEN"


def test_goal_submission_validation_error(client, api_test_db, lead_token):
    """Scenario: Past target date or short title rejected with HTTP 422 standard envelope."""
    past_date = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    response = client.post(
        "/api/v1/projects/proj-api-1/goals",
        headers={"Authorization": f"Bearer {lead_token}"},
        json={
            "title": "X",  # Too short (< 3 chars)
            "target_date": past_date,  # In the past
        },
    )
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    data = response.json()
    assert data["error"]["code"] == "VALIDATION_ERROR"
    assert isinstance(data["error"]["details"], list)


def test_plan_generation_and_dedicated_proposal_lifecycle(client, api_test_db, lead_token, monkeypatch):
    """Scenario: Full lifecycle: Goal creation -> Plan generation -> Retrieval -> Rejection/Approval."""
    sample_llm_plan = {
        "tasks": [
            {"temp_id": "T1", "title": "Run Migrations", "description": "Run DDL", "estimated_hours": 2.0},
            {"temp_id": "T2", "title": "Deploy API", "description": "Deploy image", "estimated_hours": 1.5},
        ],
        "dependencies": [
            {"prerequisite_temp_id": "T1", "dependent_temp_id": "T2"}
        ],
    }

    # Inject mock provider into llm_service
    monkeypatch.setattr(
        llm_service,
        "_call_provider",
        lambda prompt, client=None: json.dumps(sample_llm_plan),
    )

    # 1. Create Goal
    future_date = (datetime.now(timezone.utc) + timedelta(days=5)).isoformat()
    goal_res = client.post(
        "/api/v1/projects/proj-api-1/goals",
        headers={"Authorization": f"Bearer {lead_token}"},
        json={"title": "Deployment Pipeline", "target_date": future_date},
    )
    assert goal_res.status_code == status.HTTP_201_CREATED
    goal_id = goal_res.json()["id"]

    # 2. POST /api/v1/ai/plan/generate
    gen_res = client.post(
        "/api/v1/ai/plan/generate",
        headers={"Authorization": f"Bearer {lead_token}"},
        json={"goal_id": goal_id, "additional_instructions": "Focus on reliability"},
    )
    assert gen_res.status_code == status.HTTP_201_CREATED
    gen_data = gen_res.json()
    proposal_id = gen_data["proposal_id"]
    assert gen_data["status"] == "VALIDATED"
    assert len(gen_data["tasks"]) == 2
    assert len(gen_data["dependencies"]) == 1

    # Verify zero tasks in tasks table
    assert api_test_db.query(Task).count() == 0

    # 3. GET /api/v1/ai/plan-proposals/{proposal_id}
    get_res = client.get(
        f"/api/v1/ai/plan-proposals/{proposal_id}",
        headers={"Authorization": f"Bearer {lead_token}"},
    )
    assert get_res.status_code == status.HTTP_200_OK
    assert get_res.json()["proposal_id"] == proposal_id

    # 4. POST /api/v1/ai/plan-proposals/{proposal_id}/approve
    approve_res = client.post(
        f"/api/v1/ai/plan-proposals/{proposal_id}/approve",
        headers={"Authorization": f"Bearer {lead_token}"},
    )
    assert approve_res.status_code == status.HTTP_200_OK
    app_data = approve_res.json()
    assert app_data["status"] == "APPROVED"
    assert app_data["created_tasks_count"] == 2
    assert app_data["created_dependencies_count"] == 1
    assert len(app_data["task_ids"]) == 2

    # Verify tasks are now committed in database
    assert api_test_db.query(Task).count() == 2
    assert api_test_db.query(TaskDependency).count() == 1

    # 5. Duplicate approval rejected with 409 Conflict
    dup_res = client.post(
        f"/api/v1/ai/plan-proposals/{proposal_id}/approve",
        headers={"Authorization": f"Bearer {lead_token}"},
    )
    assert dup_res.status_code == status.HTTP_409_CONFLICT
    assert dup_res.json()["error"]["code"] == "CONFLICT"


def test_plan_proposal_rejection_flow(client, api_test_db, lead_token, monkeypatch):
    """Scenario: Rejecting a staged proposal transitions to REJECTED and creates zero tasks."""
    sample_plan = {
        "tasks": [{"temp_id": "T1", "title": "Initial Task", "description": "D", "estimated_hours": 1.0}],
        "dependencies": [],
    }
    monkeypatch.setattr(llm_service, "_call_provider", lambda prompt, client=None: json.dumps(sample_plan))

    future_date = (datetime.now(timezone.utc) + timedelta(days=5)).isoformat()
    goal_res = client.post(
        "/api/v1/projects/proj-api-1/goals",
        headers={"Authorization": f"Bearer {lead_token}"},
        json={"title": "To Be Rejected", "target_date": future_date},
    )
    goal_id = goal_res.json()["id"]

    gen_res = client.post(
        "/api/v1/ai/plan/generate",
        headers={"Authorization": f"Bearer {lead_token}"},
        json={"goal_id": goal_id},
    )
    proposal_id = gen_res.json()["proposal_id"]

    # Reject proposal
    reject_res = client.post(
        f"/api/v1/ai/plan-proposals/{proposal_id}/reject",
        headers={"Authorization": f"Bearer {lead_token}"},
        json={"notes": "Timeline unrealistic"},
    )
    assert reject_res.status_code == status.HTTP_200_OK
    data = reject_res.json()
    assert data["status"] == "REJECTED"
    assert data["notes"] == "Timeline unrealistic"

    # Zero tasks written
    assert api_test_db.query(Task).count() == 0

    # Attempting to approve rejected proposal returns 409 Conflict
    app_res = client.post(
        f"/api/v1/ai/plan-proposals/{proposal_id}/approve",
        headers={"Authorization": f"Bearer {lead_token}"},
    )
    assert app_res.status_code == status.HTTP_409_CONFLICT
