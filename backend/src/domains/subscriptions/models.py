"""SQLAlchemy models for Subscriptions and Usage Tracking."""

from datetime import datetime, timedelta, timezone
from typing import List, Optional
import uuid
from sqlalchemy import DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.core.database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def default_period_end() -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=30)


class Subscription(Base):
    """SaaS workspace subscription record."""

    __tablename__ = "subscriptions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), unique=True, index=True, nullable=False
    )
    plan_tier: Mapped[str] = mapped_column(String(32), nullable=False, default="FREE")  # FREE, TEAM, BUSINESS
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="ACTIVE")  # ACTIVE, PAST_DUE, CANCELLED
    current_period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    current_period_end: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=default_period_end, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )

    usage_records: Mapped[List["UsageRecord"]] = relationship(
        "UsageRecord", back_populates="subscription", cascade="all, delete-orphan"
    )


class UsageRecord(Base):
    """Durable periodic usage tracking record per metric."""

    __tablename__ = "usage_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    subscription_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("subscriptions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    metric: Mapped[str] = mapped_column(String(64), nullable=False, default="ai_plan_generations")
    count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )

    subscription: Mapped["Subscription"] = relationship("Subscription", back_populates="usage_records")

    __table_args__ = (
        Index("idx_usage_sub_metric_period", "subscription_id", "metric", "period_start"),
    )
