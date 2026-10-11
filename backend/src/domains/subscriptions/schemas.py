"""Pydantic schemas for SaaS Subscription, Entitlements, and Usage Tracking."""

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class SubscriptionPlanResponse(BaseModel):
    """Active subscription status and billing period window."""
    project_id: str
    plan_tier: str
    status: str
    current_period_start: datetime
    current_period_end: datetime


class SubscriptionUsageResponse(BaseModel):
    """Usage accounting metrics, limit, and utilization rate for current period."""
    project_id: str
    plan_tier: str
    metric: str
    used: int
    limit: int
    remaining: int
    utilization_percent: float
    period_start: datetime
    period_end: datetime


class SubscriptionEntitlementsResponse(BaseModel):
    """Configured feature limits and quotas for a given plan tier."""
    plan_tier: str
    display_name: str
    max_projects: int
    max_team_members: int
    max_ai_generations_per_month: int
    ai_rate_limit_per_minute: int
    features: List[str]


class UpgradeRequestPayload(BaseModel):
    """Demo upgrade request payload."""
    project_id: str
    requested_tier: str = Field(..., description="Requested tier: FREE, TEAM, or BUSINESS")


class UpgradeResponse(BaseModel):
    """Response returned upon upgrading subscription tier."""
    project_id: str
    plan_tier: str
    status: str
    message: str
    current_period_start: datetime
    current_period_end: datetime
