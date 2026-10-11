"""Synchronous SQLAlchemy 2.x database configuration and session management."""

import logging
from typing import Generator
from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker, Session

from src.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Synchronous SQLAlchemy 2.x Engine with PyMySQL
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=3600,
    pool_size=10,
    max_overflow=20,
    echo=settings.DEBUG and settings.ENVIRONMENT == "development",
)

# Thread-safe sessionmaker
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)


class Base(DeclarativeBase):
    """Base declarative class for all SQLAlchemy 2.x domain models."""
    pass


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency yielding a scoped synchronous database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def check_database_health() -> bool:
    """Lightweight database connectivity check executing 'SELECT 1'.

    Returns True if database is reachable and responds, False otherwise.
    """
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception as exc:
        logger.warning("Database connectivity check failed: %s", exc)
        return False
