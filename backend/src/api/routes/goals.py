"""Goal submission and retrieval REST endpoints."""

from datetime import datetime, timezone
import uuid
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from src.core.auth import AuthenticatedUser, get_current_user, verify_project_lead_permission
from src.core.database import get_db
from src.core.errors import NotFoundError
from src.domains.goals.models import Goal
from src.domains.goals.schemas import GoalCreateRequest, GoalResponse, GoalStatus
from src.domains.projects.models import Project

router = APIRouter(tags=["Goals"])


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


@router.post(
    "/projects/{project_id}/goals",
    response_model=GoalResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit operational goal for project",
)
def create_project_goal(
    project_id: str,
    payload: GoalCreateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Submit an operational goal for an active project requiring project lead authorization."""
    # Verify requesting user holds LEAD or ADMIN role for the project
    verify_project_lead_permission(project_id, current_user, db)

    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise NotFoundError(message=f"Project '{project_id}' not found")

    goal = Goal(
        id=str(uuid.uuid4()),
        project_id=project_id,
        title=payload.title,
        description=payload.description,
        target_date=payload.target_date,
        status=GoalStatus.PENDING_PLANNING.value,
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return goal
