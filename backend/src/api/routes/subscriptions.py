"""SaaS Subscription, Entitlements, and Usage Management REST endpoints."""

from typing import Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from src.core.auth import (
    AuthenticatedUser,
    get_current_user,
    verify_project_lead_permission,
    verify_project_member_permission,
)
from src.core.database import get_db
from src.domains.subscriptions.schemas import (
    SubscriptionEntitlementsResponse,
    SubscriptionPlanResponse,
    SubscriptionUsageResponse,
    UpgradeRequestPayload,
    UpgradeResponse,
)
from src.domains.subscriptions.service import subscription_service

router = APIRouter(prefix="/subscriptions", tags=["Subscriptions"])


@router.get(
    "/plan",
    response_model=SubscriptionPlanResponse,
    summary="Retrieve active subscription plan and period window for a project",
)
def get_subscription_plan(
    project_id: str = Query(..., description="Target project ID"),
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve active subscription plan details.

    Enforces workspace isolation by verifying the authenticated user is a project member.
    """
    verify_project_member_permission(project_id, current_user, db)
    subscription = subscription_service.get_or_create_subscription(project_id, db)
    return SubscriptionPlanResponse(
        project_id=subscription.project_id,
        plan_tier=subscription.plan_tier,
        status=subscription.status,
        current_period_start=subscription.current_period_start,
        current_period_end=subscription.current_period_end,
    )


@router.get(
    "/usage",
    response_model=SubscriptionUsageResponse,
    summary="Retrieve current billing period usage accounting and quota metrics",
)
def get_subscription_usage(
    project_id: str = Query(..., description="Target project ID"),
    metric: str = Query("ai_plan_generations", description="Usage metric key"),
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve periodic usage metrics and quota ceiling.

    Enforces workspace isolation by verifying project membership.
    """
    verify_project_member_permission(project_id, current_user, db)
    usage_data = subscription_service.get_usage(project_id, db, metric=metric)
    return SubscriptionUsageResponse(**usage_data)


@router.get(
    "/entitlements",
    response_model=SubscriptionEntitlementsResponse,
    summary="Retrieve feature entitlements and quotas for a plan tier or project",
)
def get_subscription_entitlements(
    project_id: Optional[str] = Query(None, description="Optional target project ID"),
    tier: Optional[str] = Query(None, description="Optional tier name (FREE, TEAM, BUSINESS)"),
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve entitlements configuration for the requested tier or project subscription."""
    resolved_tier = "FREE"
    if project_id:
        verify_project_member_permission(project_id, current_user, db)
        sub = subscription_service.get_or_create_subscription(project_id, db)
        resolved_tier = sub.plan_tier
    elif tier:
        resolved_tier = tier.upper().strip()

    entitlements = subscription_service.get_entitlements(resolved_tier)
    return SubscriptionEntitlementsResponse(**entitlements)


@router.post(
    "/upgrade-request",
    response_model=UpgradeResponse,
    status_code=status.HTTP_200_OK,
    summary="Request workspace plan tier change (demo workflow)",
)
def request_upgrade(
    payload: UpgradeRequestPayload,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upgrade or switch workspace plan tier for demonstration workflows.

    Enforces project lead / admin permissions.
    """
    verify_project_lead_permission(payload.project_id, current_user, db)
    updated_sub = subscription_service.upgrade_plan(payload.project_id, payload.requested_tier, db)
    return UpgradeResponse(
        project_id=updated_sub.project_id,
        plan_tier=updated_sub.plan_tier,
        status=updated_sub.status,
        message=f"Plan successfully updated to {updated_sub.plan_tier}",
        current_period_start=updated_sub.current_period_start,
        current_period_end=updated_sub.current_period_end,
    )
