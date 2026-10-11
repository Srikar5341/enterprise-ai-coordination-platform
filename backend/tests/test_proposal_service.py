"""Unit tests for proposal lifecycle, atomic task persistence, and transaction rollback."""

from datetime import datetime, timedelta, timezone
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.core.database import Base
from src.core.errors import ConflictError, InternalServerError, NotFoundError
from src.domains.ai.models import PlanProposal
from src.domains.ai.proposal_service import ProposalService
from src.domains.ai.schemas import ProposedDependency, ProposedTask
from src.domains.goals.models import Goal
from src.domains.projects.models import Project
from src.domains.tasks.models import Task, TaskDependency


@pytest.fixture
def test_db():
    """In-memory SQLite database session fixture for isolated persistence tests."""
    engine = create_engine("sqlite:///:memory:", echo=False)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()

    # Seed test project and goal
    project = Project(id="proj-1", name="Release Project")
    session.add(project)

    goal = Goal(
        id="goal-1",
        project_id="proj-1",
        title="Production Release",
        target_date=datetime.now(timezone.utc) + timedelta(days=5),
        status="PENDING_PLANNING",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    session.add(goal)
    session.commit()

    yield session

    session.close()


def test_stage_proposal_creates_zero_tasks(test_db):
    """Scenario: Staging a proposal creates record in plan_proposals but zero tasks."""
    service = ProposalService()
    tasks = [
        ProposedTask(temp_id="T1", title="Task 1", description="Desc 1", estimated_hours=2.0),
        ProposedTask(temp_id="T2", title="Task 2", description="Desc 2", estimated_hours=3.0),
    ]
    deps = [ProposedDependency(prerequisite_temp_id="T1", dependent_temp_id="T2")]

    proposal = service.stage_proposal(
        goal_id="goal-1",
        project_id="proj-1",
        tasks=tasks,
        dependencies=deps,
        created_by="lead-1",
        db=test_db,
    )

    assert proposal.id is not None
    assert proposal.status == "VALIDATED"

    # Verify zero tasks or task_dependencies are created
    assert test_db.query(Task).count() == 0
    assert test_db.query(TaskDependency).count() == 0


def test_approve_proposal_atomic_persistence(test_db):
    """Scenario: Approving a proposal atomically persists tasks, maps temp_ids, and creates dependencies."""
    service = ProposalService()
    tasks = [
        ProposedTask(temp_id="T1", title="Task 1", description="Desc 1", estimated_hours=2.0, required_skills=["SQL"]),
        ProposedTask(temp_id="T2", title="Task 2", description="Desc 2", estimated_hours=4.0, required_skills=["API"]),
    ]
    deps = [ProposedDependency(prerequisite_temp_id="T1", dependent_temp_id="T2")]

    proposal = service.stage_proposal(
        goal_id="goal-1",
        project_id="proj-1",
        tasks=tasks,
        dependencies=deps,
        created_by="lead-1",
        db=test_db,
    )

    approval_res = service.approve_proposal(
        proposal_id=proposal.id,
        reviewer_user_id="lead-1",
        db=test_db,
    )

    assert approval_res.status == "APPROVED"
    assert approval_res.created_tasks_count == 2
    assert approval_res.created_dependencies_count == 1
    assert len(approval_res.task_ids) == 2

    # Verify database records
    db_tasks = test_db.query(Task).all()
    assert len(db_tasks) == 2

    db_deps = test_db.query(TaskDependency).all()
    assert len(db_deps) == 1

    # Verify dependency mapping
    t1_db = next(t for t in db_tasks if t.title == "Task 1")
    t2_db = next(t for t in db_tasks if t.title == "Task 2")
    assert db_deps[0].prerequisite_task_id == t1_db.id
    assert db_deps[0].task_id == t2_db.id

    # Verify goal status transitioned to PLANNED
    goal = test_db.query(Goal).filter(Goal.id == "goal-1").first()
    assert goal.status == "PLANNED"


def test_atomic_rollback_on_failure(test_db, monkeypatch):
    """Scenario: Transaction disruption during persistence triggers complete rollback (zero tasks persisted)."""
    service = ProposalService()
    tasks = [
        ProposedTask(temp_id="T1", title="Task 1", description="Desc 1", estimated_hours=2.0),
        ProposedTask(temp_id="T2", title="Task 2", description="Desc 2", estimated_hours=3.0),
    ]
    deps = [ProposedDependency(prerequisite_temp_id="T1", dependent_temp_id="T2")]

    proposal = service.stage_proposal(
        goal_id="goal-1",
        project_id="proj-1",
        tasks=tasks,
        dependencies=deps,
        created_by="lead-1",
        db=test_db,
    )

    # Simulate database crash during commit
    original_commit = test_db.commit

    def failing_commit():
        raise RuntimeError("Simulated database failure during atomic persist")

    monkeypatch.setattr(test_db, "commit", failing_commit)

    with pytest.raises(InternalServerError):
        service.approve_proposal(
            proposal_id=proposal.id,
            reviewer_user_id="lead-1",
            db=test_db,
        )

    # Restore commit and assert ZERO tasks and ZERO dependencies were written
    monkeypatch.setattr(test_db, "commit", original_commit)
    assert test_db.query(Task).count() == 0
    assert test_db.query(TaskDependency).count() == 0


def test_duplicate_approval_rejected(test_db):
    """Scenario: Duplicate approval on already-approved proposal raises 409 Conflict."""
    service = ProposalService()
    tasks = [ProposedTask(temp_id="T1", title="Task 1", description="Desc 1", estimated_hours=2.0)]
    proposal = service.stage_proposal("goal-1", "proj-1", tasks, [], "lead-1", test_db)

    # First approval succeeds
    service.approve_proposal(proposal.id, "lead-1", test_db)

    # Second approval fails with 409 Conflict
    with pytest.raises(ConflictError) as exc:
        service.approve_proposal(proposal.id, "lead-1", test_db)

    assert exc.value.status_code == 409
    assert "cannot be approved" in exc.value.message


def test_stale_proposal_rejected(test_db):
    """Scenario: Proposal generated before goal update is marked STALE and rejected with 409."""
    service = ProposalService()
    tasks = [ProposedTask(temp_id="T1", title="Task 1", description="Desc 1", estimated_hours=2.0)]
    proposal = service.stage_proposal("goal-1", "proj-1", tasks, [], "lead-1", test_db)

    # Update goal after proposal generation
    goal = test_db.query(Goal).filter(Goal.id == "goal-1").first()
    goal.updated_at = datetime.now(timezone.utc) + timedelta(minutes=5)
    test_db.commit()

    with pytest.raises(ConflictError) as exc:
        service.approve_proposal(proposal.id, "lead-1", test_db)

    assert exc.value.status_code == 409
    assert "modified after" in exc.value.message


def test_reject_proposal_creates_zero_tasks(test_db):
    """Scenario: Rejecting a proposal transitions status to REJECTED and creates zero tasks."""
    service = ProposalService()
    tasks = [ProposedTask(temp_id="T1", title="Task 1", description="Desc 1", estimated_hours=2.0)]
    proposal = service.stage_proposal("goal-1", "proj-1", tasks, [], "lead-1", test_db)

    reject_res = service.reject_proposal(
        proposal_id=proposal.id,
        reviewer_user_id="lead-1",
        notes="Scope is too broad",
        db=test_db,
    )

    assert reject_res.status == "REJECTED"
    assert reject_res.notes == "Scope is too broad"
    assert test_db.query(Task).count() == 0
