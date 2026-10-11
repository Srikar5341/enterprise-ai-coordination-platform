"""AI Plan Generation and Proposal Lifecycle REST endpoints."""

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from src.core.auth import AuthenticatedUser, get_current_user, verify_project_lead_permission
from src.core.database import get_db
from src.core.errors import NotFoundError
from src.domains.ai.llm_service import llm_service
from src.domains.ai.models import PlanProposal
from src.domains.ai.proposal_service import proposal_service
from src.domains.ai.schemas import (
    PlanGenerateRequest,
    PlanProposalResponse,
    ProposalApprovalResponse,
    ProposalRejectRequest,
    ProposalRejectResponse,
)
from src.domains.goals.models import Goal
from src.domains.subscriptions.rate_limiter import check_ai_rate_limit
from src.domains.subscriptions.service import subscription_service

router = APIRouter(tags=["AI Planning"])


@router.post(
    "/ai/plan/generate",
    response_model=PlanProposalResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Generate and stage structured task-plan proposal from goal",
)
def generate_plan(
    payload: PlanGenerateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generate a structured, dependency-aware plan proposal using hosted LLM and stage in plan_proposals."""
    goal = db.query(Goal).filter(Goal.id == payload.goal_id).first()
    if not goal:
        raise NotFoundError(message=f"Goal '{payload.goal_id}' not found")

    # Authorize team lead permissions
    verify_project_lead_permission(goal.project_id, current_user, db)

    # Resolve subscription plan tier
    subscription = subscription_service.get_or_create_subscription(goal.project_id, db)

    # 1. Enforce Redis burst rate limit (with graceful fallback if Redis down)
    check_ai_rate_limit(project_id=goal.project_id, tier=subscription.plan_tier)

    # 2. Enforce MySQL monthly quota ceiling and atomically record persistent usage
    subscription_service.check_and_increment_quota(project_id=goal.project_id, db=db)

    # Prompt hosted LLM with deterministic validation
    plan_result = llm_service.generate_plan(
        goal_title=goal.title,
        goal_description=goal.description,
        target_date=goal.target_date,
        additional_instructions=payload.additional_instructions,
    )

    # Stage proposal in plan_proposals table without creating tasks
    proposal = proposal_service.stage_proposal(
        goal_id=goal.id,
        project_id=goal.project_id,
        tasks=plan_result["tasks"],
        dependencies=plan_result["dependencies"],
        created_by=current_user.id,
        db=db,
    )

    return proposal_service.get_proposal(proposal.id, db)


@router.get(
    "/ai/plan-proposals/{proposal_id}",
    response_model=PlanProposalResponse,
    summary="Retrieve active staged plan proposal for human review",
)
def get_plan_proposal(
    proposal_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve staged proposal by proposal_id, refreshing stale state if goal changed or expired."""
    proposal_res = proposal_service.get_proposal(proposal_id, db)
    verify_project_lead_permission(
        proposal_res.project_id,
        current_user,
        db,
        allowed_roles=["LEAD", "ADMIN", "MEMBER"],
    )
    return proposal_res


@router.post(
    "/ai/plan-proposals/{proposal_id}/approve",
    response_model=ProposalApprovalResponse,
    summary="Approve proposal and atomically create tasks and dependencies",
)
def approve_plan_proposal(
    proposal_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Explicit human approval executing atomic transaction in MySQL to create active tasks and dependencies."""
    proposal = db.query(PlanProposal).filter(PlanProposal.id == proposal_id).first()
    if not proposal:
        raise NotFoundError(message=f"Plan proposal '{proposal_id}' not found")

    verify_project_lead_permission(proposal.project_id, current_user, db, allowed_roles=["LEAD", "ADMIN"])

    return proposal_service.approve_proposal(
        proposal_id=proposal_id,
        reviewer_user_id=current_user.id,
        db=db,
    )


@router.post(
    "/ai/plan-proposals/{proposal_id}/reject",
    response_model=ProposalRejectResponse,
    summary="Reject proposal with feedback and write zero tasks",
)
def reject_plan_proposal(
    proposal_id: str,
    payload: ProposalRejectRequest = ProposalRejectRequest(),
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Explicit human rejection updating proposal status to REJECTED and writing zero active tasks."""
    proposal = db.query(PlanProposal).filter(PlanProposal.id == proposal_id).first()
    if not proposal:
        raise NotFoundError(message=f"Plan proposal '{proposal_id}' not found")

    verify_project_lead_permission(proposal.project_id, current_user, db, allowed_roles=["LEAD", "ADMIN"])

    return proposal_service.reject_proposal(
        proposal_id=proposal_id,
        reviewer_user_id=current_user.id,
        notes=payload.notes,
        db=db,
    )
