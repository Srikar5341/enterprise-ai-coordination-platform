"""Application settings and environment configuration."""

from functools import lru_cache
from typing import Optional
from pydantic import computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

    # Application
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    PORT: int = 12345
    HOST: str = "0.0.0.0"
    API_V1_PREFIX: str = "/api/v1"
    PROJECT_NAME: str = "Enterprise AI Team Coordination Platform"
    VERSION: str = "0.1.0"

    # MySQL Database
    DB_HOST: str = "localhost"
    DB_PORT: int = 3306
    DB_USER: str = "platform_user"
    DB_PASSWORD: str = "platform_pass"
    DB_NAME: str = "ai_coordination"
    _DATABASE_URL: Optional[str] = None

    @computed_field
    @property
    def DATABASE_URL(self) -> str:
        if self._DATABASE_URL:
            return self._DATABASE_URL
        return f"mysql+pymysql://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}?charset=utf8mb4"

    # Authentication & JWT
    JWT_SECRET_KEY: str = "local_dev_secret_key_minimum_32_characters_for_jwt"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Plan Proposal Lifecycle
    PROPOSAL_TTL_HOURS: int = 24

    # Hosted LLM Provider
    LLM_PROVIDER: str = "openrouter"
    LLM_BASE_URL: str = "https://openrouter.ai/api/v1"
    LLM_API_KEY: Optional[str] = None
    LLM_MODEL: str = "nvidia/nemotron-3-ultra-550b-a55b:free"

    # Redis Cache & Rate Limiting
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_PASSWORD: Optional[str] = None
    REDIS_DB: int = 0
    REDIS_ENABLED: bool = True
    _REDIS_URL: Optional[str] = None

    @computed_field
    @property
    def REDIS_URL(self) -> str:
        if self._REDIS_URL:
            return self._REDIS_URL
        if self.REDIS_PASSWORD:
            return f"redis://:{self.REDIS_PASSWORD}@{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"
        return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"

    # Logging
    LOG_LEVEL: str = "INFO"


# Centralized SaaS Subscription Plan Entitlements & Limits
PLAN_ENTITLEMENTS = {
    "FREE": {
        "tier": "FREE",
        "display_name": "Free Community Tier",
        "max_projects": 2,
        "max_team_members": 5,
        "max_ai_generations_per_month": 20,
        "ai_rate_limit_per_minute": 3,
        "features": ["ai_planning_basic", "kanban_board", "standard_notifications"],
    },
    "TEAM": {
        "tier": "TEAM",
        "display_name": "Team Professional Tier",
        "max_projects": 10,
        "max_team_members": 25,
        "max_ai_generations_per_month": 200,
        "ai_rate_limit_per_minute": 10,
        "features": [
            "ai_planning_basic",
            "ai_planning_advanced",
            "kanban_board",
            "priority_notifications",
            "workload_allocation",
        ],
    },
    "BUSINESS": {
        "tier": "BUSINESS",
        "display_name": "Business Enterprise Tier",
        "max_projects": 50,
        "max_team_members": 100,
        "max_ai_generations_per_month": 1000,
        "ai_rate_limit_per_minute": 30,
        "features": [
            "ai_planning_basic",
            "ai_planning_advanced",
            "kanban_board",
            "priority_notifications",
            "workload_allocation",
            "recovery_engine",
            "custom_audit_logs",
        ],
    },
}


@lru_cache()
def get_settings() -> Settings:
    """Return cached application settings instance."""
    return Settings()

