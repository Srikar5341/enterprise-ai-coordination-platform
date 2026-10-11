"""Proposal lifecycle and atomic persistence service."""

from datetime import datetime, timedelta, timezone
import logging
import uuid
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session

from src.core.config import get_settings
from src.core.errors import ConflictError, InternalServerError, NotFoundError
from src.domains.ai.models import PlanProposal
from src.domains.ai.schemas import (
    PlanProposalResponse,
    PlanProposalStatus,
    ProposalApprovalResponse,
    ProposalRejectResponse,
    ProposedDependency,
    ProposedTask,
)
from src.domains.goals.models import Goal
from src.domains.goals.schemas import GoalStatus
from src.domains.tasks.models import Task, TaskDependency

logger = logging.getLogger(__name__)
settings = get_settings()


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ProposalService:
    """Manages the isolated staging, review, and atomic persistence of plan proposals."""

    def stage_proposal(
        self,
        goal_id: str,
        project_id: str,
        tasks: List[ProposedTask],
        dependencies: List[ProposedDependency],
        created_by: Optional[str],
        db: Session,
    ) -> PlanProposal:
        """Stage a validated plan proposal in plan_proposals table without creating active tasks."""
        now = utc_now()
        expires_at = now + timedelta(hours=settings.PROPOSAL_TTL_HOURS)

        payload = {
            "tasks": [t.model_dump() for t in tasks],
            "dependencies": [d.model_dump() for d in dependencies],
        }

        proposal = PlanProposal(
            id=str(uuid.uuid4()),
            goal_id=goal_id,
            project_id=project_id,
            status=PlanProposalStatus.VALIDATED.value,
            plan_payload=payload,
            created_by=created_by,
            created_at=now,
            expires_at=expires_at,
        )

        db.add(proposal)
        db.commit()
        db.refresh(proposal)
        return proposal

    def get_proposal(self, proposal_id: str, db: Session) -> PlanProposalResponse:
        """Retrieve a staged proposal by its proposal_id, refreshing stale state if expired."""
        proposal = db.query(PlanProposal).filter(PlanProposal.id == proposal_id).first()
        if not proposal:
            raise NotFoundError(message=f"Plan proposal '{proposal_id}' not found")

        # Stale state check
        self._check_and_update_stale_state(proposal, db)

        tasks = [ProposedTask(**t) for t in proposal.plan_payload.get("tasks", [])]
        dependencies = [ProposedDependency(**d) for d in proposal.plan_payload.get("dependencies", [])]

        return PlanProposalResponse(
            proposal_id=proposal.id,
            goal_id=proposal.goal_id,
            project_id=proposal.project_id,
            status=PlanProposalStatus(proposal.status),
            tasks=tasks,
            dependencies=dependencies,
            created_at=proposal.created_at,
            expires_at=proposal.expires_at,
        )

    def approve_proposal(
        self,
        proposal_id: str,
        reviewer_user_id: str,
        db: Session,
    ) -> ProposalApprovalResponse:
        """Execute atomic MySQL transaction persisting all tasks and dependencies upon human approval.

        Guarantees:
        - Row locking against duplicate or concurrent approvals (HTTP 409)
        - Rejection of stale or expired proposals (HTTP 409)
        - Atomic creation of all tasks and dependencies
        - Complete transaction rollback on failure with zero orphaned rows
        """
        # 1. Lock and inspect proposal state
        proposal = (
            db.query(PlanProposal)
            .filter(PlanProposal.id == proposal_id)
            .with_for_update()
            .first()
        )

        if not proposal:
            raise NotFoundError(message=f"Plan proposal '{proposal_id}' not found")

        if proposal.status != PlanProposalStatus.VALIDATED.value:
            raise ConflictError(
                message=f"Proposal is in '{proposal.status}' status and cannot be approved",
                details={"proposal_id": proposal_id, "current_status": proposal.status},
            )

        # 2. Verify stale conditions
        goal = db.query(Goal).filter(Goal.id == proposal.goal_id).first()
        if not goal:
            raise NotFoundError(message=f"Associated goal '{proposal.goal_id}' not found")

        now = utc_now()
        # Ensure datetimes are timezone-aware for comparison
        proposal_created_at = proposal.created_at.replace(tzinfo=timezone.utc) if proposal.created_at.tzinfo is None else proposal.created_at
        goal_updated_at = goal.updated_at.replace(tzinfo=timezone.utc) if goal.updated_at.tzinfo is None else goal.updated_at
        proposal_expires_at = proposal.expires_at.replace(tzinfo=timezone.utc) if proposal.expires_at.tzinfo is None else proposal.expires_at

        if goal_updated_at > proposal_created_at or now > proposal_expires_at:
            proposal.status = PlanProposalStatus.STALE.value
            db.commit()
            raise ConflictError(
                message="Goal was modified after plan generation or proposal has expired. Please regenerate plan.",
                details={"code": "PROPOSAL_STALE"},
            )

        # 3. Atomic persistence of tasks and dependencies
        try:
            plan_tasks: List[Dict[str, Any]] = proposal.plan_payload.get("tasks", [])
            plan_deps: List[Dict[str, Any]] = proposal.plan_payload.get("dependencies", [])

            id_mapping: Dict[str, str] = {}
            created_task_ids: List[str] = []

            for t in plan_tasks:
                db_task_id = str(uuid.uuid4())
                id_mapping[t["temp_id"]] = db_task_id
                created_task_ids.append(db_task_id)

                task_record = Task(
                    id=db_task_id,
                    project_id=proposal.project_id,
                    goal_id=proposal.goal_id,
                    title=t["title"],
                    description=t.get("description"),
                    estimated_hours=float(t["estimated_hours"]),
                    required_skills=t.get("required_skills", []),
                    status="OPEN",
                    created_at=now,
                    updated_at=now,
                )
                db.add(task_record)

            for dep in plan_deps:
                dep_record = TaskDependency(
                    id=str(uuid.uuid4()),
                    task_id=id_mapping[dep["dependent_temp_id"]],
                    prerequisite_task_id=id_mapping[dep["prerequisite_temp_id"]],
                    created_at=now,
                )
                db.add(dep_record)

            # Update proposal and goal states
            proposal.status = PlanProposalStatus.APPROVED.value
            proposal.reviewed_by = reviewer_user_id
            proposal.reviewed_at = now
            goal.status = GoalStatus.PLANNED.value
            goal.updated_at = now

            db.commit()

            return ProposalApprovalResponse(
                proposal_id=proposal.id,
                goal_id=proposal.goal_id,
                status="APPROVED",
                created_tasks_count=len(created_task_ids),
                created_dependencies_count=len(plan_deps),
                task_ids=created_task_ids,
            )
        except Exception as exc:
            db.rollback()
            logger.error("Atomic proposal persistence failed for %s: %s", proposal_id, exc, exc_info=True)
            try:
                proposal.status = PlanProposalStatus.PERSISTENCE_FAILED.value
                db.commit()
            except Exception:
                db.rollback()
            raise InternalServerError(
                message="Failed to persist approved tasks and dependencies atomically",
                details=str(exc),
            ) from exc

    def reject_proposal(
        self,
        proposal_id: str,
        reviewer_user_id: str,
        notes: Optional[str],
        db: Session,
    ) -> ProposalRejectResponse:
        """Reject a staged proposal without creating any tasks or dependencies."""
        proposal = (
            db.query(PlanProposal)
            .filter(PlanProposal.id == proposal_id)
            .with_for_update()
            .first()
        )

        if not proposal:
            raise NotFoundError(message=f"Plan proposal '{proposal_id}' not found")

        if proposal.status != PlanProposalStatus.VALIDATED.value:
            raise ConflictError(
                message=f"Proposal is in '{proposal.status}' status and cannot be rejected",
                details={"proposal_id": proposal_id, "current_status": proposal.status},
            )

        now = utc_now()
        proposal.status = PlanProposalStatus.REJECTED.value
        proposal.reviewed_by = reviewer_user_id
        proposal.reviewed_at = now
        proposal.rejection_notes = notes

        db.commit()

        return ProposalRejectResponse(
            proposal_id=proposal.id,
            goal_id=proposal.goal_id,
            status="REJECTED",
            notes=notes,
        )

    @staticmethod
    def _check_and_update_stale_state(proposal: PlanProposal, db: Session) -> None:
        """Check if proposal has expired or if parent goal was updated after generation."""
        if proposal.status != PlanProposalStatus.VALIDATED.value:
            return

        now = utc_now()
        proposal_expires_at = proposal.expires_at.replace(tzinfo=timezone.utc) if proposal.expires_at.tzinfo is None else proposal.expires_at

        goal = db.query(Goal).filter(Goal.id == proposal.goal_id).first()
        if goal:
            goal_updated_at = goal.updated_at.replace(tzinfo=timezone.utc) if goal.updated_at.tzinfo is None else goal.updated_at
            proposal_created_at = proposal.created_at.replace(tzinfo=timezone.utc) if proposal.created_at.tzinfo is None else proposal.created_at
            if goal_updated_at > proposal_created_at or now > proposal_expires_at:
                proposal.status = PlanProposalStatus.STALE.value
                db.commit()


proposal_service = ProposalService()
