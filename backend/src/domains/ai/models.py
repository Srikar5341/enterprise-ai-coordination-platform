"""SQLAlchemy models for AI Plan Proposals."""

from datetime import datetime, timezone
import uuid
from typing import Any, Dict
from sqlalchemy import JSON, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from src.core.database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class PlanProposal(Base):
    __tablename__ = "plan_proposals"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    goal_id: Mapped[str] = mapped_column(String(36), ForeignKey("goals.id", ondelete="CASCADE"), nullable=False)
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="GENERATED")
    plan_payload: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)
    created_by: Mapped[str] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    reviewed_by: Mapped[str] = mapped_column(String(36), nullable=True)
    reviewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    rejection_notes: Mapped[str] = mapped_column(Text, nullable=True)
