"""Pydantic schemas for the Goals domain matching API_CONTRACT.md."""

from datetime import datetime, timezone
from enum import Enum
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator


class GoalStatus(str, Enum):
    PENDING_PLANNING = "PENDING_PLANNING"
    PLANNED = "PLANNED"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class GoalCreateRequest(BaseModel):
    title: str = Field(..., min_length=3, max_length=255, description="Goal title")
    description: Optional[str] = Field(None, max_length=4000, description="Detailed goal context")
    target_date: datetime = Field(..., description="Target completion datetime (must be UTC and in the future)")

    @field_validator("title")
    @classmethod
    def validate_title_not_empty(cls, value: str) -> str:
        stripped = value.strip()
        if len(stripped) < 3:
            raise ValueError("Title must contain at least 3 non-whitespace characters")
        return stripped

    @field_validator("target_date")
    @classmethod
    def validate_target_date_future(cls, value: datetime) -> datetime:
        # Normalize naive datetime to UTC if needed, but require timezone awareness
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        if value <= now:
            raise ValueError("Target date must be a future datetime")
        return value


class GoalResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    title: str
    description: Optional[str] = None
    target_date: datetime
    status: GoalStatus
    created_at: datetime
    updated_at: datetime
