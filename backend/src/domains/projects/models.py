"""SQLAlchemy models for Projects and Project Membership."""

from datetime import datetime, timezone
import uuid
from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.core.database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    members = relationship("ProjectMember", back_populates="project", cascade="all, delete-orphan")


class ProjectMember(Base):
    __tablename__ = "project_members"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False)
    role: Mapped[str] = mapped_column(String(32), nullable=False, default="MEMBER")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    project = relationship("Project", back_populates="members")
