"""Pydantic schemas for AI Plan Generation and Proposal Lifecycle matching API_CONTRACT.md."""

from datetime import datetime
from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


class PlanProposalStatus(str, Enum):
    GENERATED = "GENERATED"
    VALIDATED = "VALIDATED"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    STALE = "STALE"
    PERSISTENCE_FAILED = "PERSISTENCE_FAILED"


class ProposedTask(BaseModel):
    temp_id: str = Field(..., min_length=1, max_length=50, description="Temporary identifier (e.g. T1, T2)")
    title: str = Field(..., min_length=3, max_length=255, description="Task title")
    description: str = Field(..., min_length=1, max_length=4000, description="Detailed task scope")
    estimated_hours: float = Field(..., gt=0.0, le=1000.0, description="Estimated duration in hours")
    required_skills: List[str] = Field(default_factory=list, description="List of required team competencies")


class ProposedDependency(BaseModel):
    prerequisite_temp_id: str = Field(..., description="temp_id of task that must complete first")
    dependent_temp_id: str = Field(..., description="temp_id of task that depends on the prerequisite")


class PlanGenerateRequest(BaseModel):
    goal_id: str = Field(..., description="UUID of the existing goal to plan")
    additional_instructions: Optional[str] = Field(None, max_length=4000, description="Optional steering instructions for LLM")


class PlanProposalResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    proposal_id: str
    goal_id: str
    project_id: str
    status: PlanProposalStatus
    tasks: List[ProposedTask]
    dependencies: List[ProposedDependency]
    created_at: datetime
    expires_at: datetime


class ProposalApprovalResponse(BaseModel):
    proposal_id: str
    goal_id: str
    status: str = "APPROVED"
    created_tasks_count: int
    created_dependencies_count: int
    task_ids: List[str]


class ProposalRejectRequest(BaseModel):
    notes: Optional[str] = Field(None, max_length=4000, description="Rejection rationale or refinement instructions")


class ProposalRejectResponse(BaseModel):
    proposal_id: str
    goal_id: str
    status: str = "REJECTED"
    notes: Optional[str] = None
