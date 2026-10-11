"""Subscription domain service managing plans, entitlements, and persistent usage records."""

from datetime import datetime, timedelta, timezone
import logging
from typing import Any, Dict, Optional
from sqlalchemy.orm import Session

from src.core.config import PLAN_ENTITLEMENTS
from src.core.errors import BadRequestError, NotFoundError, QuotaExceededError
from src.domains.projects.models import Project
from src.domains.subscriptions.models import Subscription, UsageRecord

logger = logging.getLogger(__name__)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def ensure_utc(dt: Optional[datetime]) -> Optional[datetime]:
    """Ensure datetime is timezone-aware in UTC for safe comparison across drivers."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


class SubscriptionService:
    """Manages workspace plan entitlements, subscriptions, and persistent MySQL usage tracking."""

    @staticmethod
    def get_or_create_subscription(project_id: str, db: Session) -> Subscription:
        """Retrieve existing project subscription or provision a default FREE subscription."""
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise NotFoundError(message=f"Project '{project_id}' not found")

        subscription = db.query(Subscription).filter(Subscription.project_id == project_id).first()
        now = utc_now()

        if not subscription:
            subscription = Subscription(
                project_id=project_id,
                plan_tier="FREE",
                status="ACTIVE",
                current_period_start=now,
                current_period_end=now + timedelta(days=30),
            )
            db.add(subscription)
            db.commit()
            db.refresh(subscription)
            logger.info("Provisioned default FREE subscription for project %s", project_id)
            return subscription

        # Check if period rolled over
        period_end = ensure_utc(subscription.current_period_end)
        if period_end and period_end <= now:
            subscription.current_period_start = now
            subscription.current_period_end = now + timedelta(days=30)
            db.commit()
            db.refresh(subscription)
            logger.info("Rolled over billing period for project %s", project_id)

        return subscription

    @staticmethod
    def get_or_create_usage_record(
        subscription: Subscription,
        db: Session,
        metric: str = "ai_plan_generations",
    ) -> UsageRecord:
        """Retrieve or initialize the active period usage record for a given metric."""
        usage_record = (
            db.query(UsageRecord)
            .filter(
                UsageRecord.subscription_id == subscription.id,
                UsageRecord.metric == metric,
                UsageRecord.period_start == subscription.current_period_start,
            )
            .first()
        )

        if not usage_record:
            usage_record = UsageRecord(
                subscription_id=subscription.id,
                metric=metric,
                count=0,
                period_start=subscription.current_period_start,
                period_end=subscription.current_period_end,
            )
            db.add(usage_record)
            db.commit()
            db.refresh(usage_record)

        return usage_record

    @classmethod
    def get_usage(
        cls,
        project_id: str,
        db: Session,
        metric: str = "ai_plan_generations",
    ) -> Dict[str, Any]:
        """Inspect current period usage and quota utilization for a project."""
        subscription = cls.get_or_create_subscription(project_id, db)
        usage_record = cls.get_or_create_usage_record(subscription, db, metric=metric)

        tier_config = PLAN_ENTITLEMENTS.get(subscription.plan_tier, PLAN_ENTITLEMENTS["FREE"])
        limit = tier_config["max_ai_generations_per_month"]
        used = usage_record.count
        remaining = max(0, limit - used)
        utilization_pct = round((used / limit) * 100, 2) if limit > 0 else 0.0

        return {
            "project_id": project_id,
            "plan_tier": subscription.plan_tier,
            "metric": metric,
            "used": used,
            "limit": limit,
            "remaining": remaining,
            "utilization_percent": utilization_pct,
            "period_start": subscription.current_period_start,
            "period_end": subscription.current_period_end,
        }

    @classmethod
    def check_and_increment_quota(
        cls,
        project_id: str,
        db: Session,
        metric: str = "ai_plan_generations",
    ) -> None:
        """Enforce persistent monthly quota before initiating expensive AI operations.

        Raises QuotaExceededError (HTTP 429) if the project's limit has been reached.
        Atomically increments persistent MySQL count upon successful validation.
        """
        subscription = cls.get_or_create_subscription(project_id, db)
        usage_record = cls.get_or_create_usage_record(subscription, db, metric=metric)

        tier_config = PLAN_ENTITLEMENTS.get(subscription.plan_tier, PLAN_ENTITLEMENTS["FREE"])
        limit = tier_config["max_ai_generations_per_month"]

        if usage_record.count >= limit:
            logger.warning(
                "Quota exceeded for project %s: %d/%d %s used (plan: %s)",
                project_id,
                usage_record.count,
                limit,
                metric,
                subscription.plan_tier,
            )
            raise QuotaExceededError(
                message=(
                    f"Monthly AI plan generation quota of {limit} reached for "
                    f"'{subscription.plan_tier}' plan. Please upgrade your subscription tier."
                ),
                details={
                    "plan_tier": subscription.plan_tier,
                    "limit": limit,
                    "used": usage_record.count,
                    "metric": metric,
                },
            )

        # Increment persistent usage count
        usage_record.count += 1
        db.commit()
        db.refresh(usage_record)
        logger.info(
            "Incremented persistent %s usage for project %s: %d/%d",
            metric,
            project_id,
            usage_record.count,
            limit,
        )

    @classmethod
    def upgrade_plan(cls, project_id: str, requested_tier: str, db: Session) -> Subscription:
        """Upgrade or update plan tier for demonstration workflows."""
        tier_normalized = requested_tier.upper().strip()
        if tier_normalized not in PLAN_ENTITLEMENTS:
            raise BadRequestError(
                message=f"Invalid plan tier '{requested_tier}'. Valid tiers: {', '.join(PLAN_ENTITLEMENTS.keys())}"
            )

        subscription = cls.get_or_create_subscription(project_id, db)
        subscription.plan_tier = tier_normalized
        subscription.status = "ACTIVE"
        db.commit()
        db.refresh(subscription)
        logger.info("Project %s successfully updated to plan tier %s", project_id, tier_normalized)
        return subscription

    @staticmethod
    def get_entitlements(tier: str) -> Dict[str, Any]:
        """Retrieve centralized entitlement configuration for a specific tier."""
        tier_normalized = tier.upper().strip()
        config = PLAN_ENTITLEMENTS.get(tier_normalized)
        if not config:
            config = PLAN_ENTITLEMENTS["FREE"]

        return {
            "plan_tier": config["tier"],
            "display_name": config["display_name"],
            "max_projects": config["max_projects"],
            "max_team_members": config["max_team_members"],
            "max_ai_generations_per_month": config["max_ai_generations_per_month"],
            "ai_rate_limit_per_minute": config["ai_rate_limit_per_minute"],
            "features": config["features"],
        }


subscription_service = SubscriptionService()
