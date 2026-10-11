"""Unit tests for configuration management and locked defaults."""

from src.core.config import Settings, get_settings


def test_settings_defaults():
    """Verify application defaults adhere to locked architecture decisions."""
    settings = get_settings()

    assert settings.PORT == 12345
    assert settings.API_V1_PREFIX == "/api/v1"
    assert settings.PROJECT_NAME == "Enterprise AI Team Coordination Platform"
    assert "mysql+pymysql://" in settings.DATABASE_URL
    assert settings.JWT_ALGORITHM == "HS256"
    assert settings.ACCESS_TOKEN_EXPIRE_MINUTES == 15
    assert settings.REFRESH_TOKEN_EXPIRE_DAYS == 7
    assert settings.LLM_PROVIDER == "openrouter"
    assert settings.LLM_BASE_URL == "https://openrouter.ai/api/v1"
    assert settings.LLM_MODEL == "nvidia/nemotron-3-ultra-550b-a55b:free"


def test_custom_settings_override():
    """Verify settings can be overridden via custom parameters."""
    custom = Settings(
        PORT=12345,
        DB_NAME="custom_test_db",
        LLM_BASE_URL="https://custom-proxy.internal/v1",
        LLM_MODEL="custom/model-id",
    )
    assert custom.PORT == 12345
    assert "custom_test_db" in custom.DATABASE_URL
    assert custom.LLM_BASE_URL == "https://custom-proxy.internal/v1"
    assert custom.LLM_MODEL == "custom/model-id"
