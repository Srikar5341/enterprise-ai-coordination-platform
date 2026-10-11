"""SQLAlchemy models for Tasks and Dependencies."""

from datetime import datetime, timezone
import uuid
from typing import Any, List
from sqlalchemy import JSON, DateTime, Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from src.core.database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    goal_id: Mapped[str] = mapped_column(String(36), ForeignKey("goals.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    estimated_hours: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    required_skills: Mapped[List[str]] = mapped_column(JSON, nullable=False, default=list)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="OPEN")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class TaskDependency(Base):
    __tablename__ = "task_dependencies"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    task_id: Mapped[str] = mapped_column(String(36), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    prerequisite_task_id: Mapped[str] = mapped_column(String(36), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
