"""API v1 master router assembling domain sub-routers."""

from fastapi import APIRouter
from src.api.routes import ai_plans, auth, goals, health

api_router = APIRouter()

# Core system routes
api_router.include_router(health.router)
api_router.include_router(auth.router)

# Domain routes: Goals and AI Planning
api_router.include_router(goals.router)
api_router.include_router(ai_plans.router)

