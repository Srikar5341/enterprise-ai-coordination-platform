"""JWT security utilities, token creation, and validation."""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional
import bcrypt
import jwt
from jwt.exceptions import ExpiredSignatureError, InvalidTokenError

from src.core.config import get_settings
from src.core.errors import UnauthorizedError

settings = get_settings()


def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """Create a signed JWT access token."""
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({"exp": expire, "iat": now})
    encoded_jwt = jwt.encode(
        to_encode,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )
    return encoded_jwt


def decode_access_token(token: str) -> Dict[str, Any]:
    """Decode and validate a signed JWT access token.

    Raises UnauthorizedError if token is expired, malformed, or has invalid signature.
    """
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        return payload
    except ExpiredSignatureError as exc:
        raise UnauthorizedError(message="Authentication token has expired") from exc
    except InvalidTokenError as exc:
        raise UnauthorizedError(message="Invalid authentication token signature or payload") from exc


def hash_password(password: str) -> str:
    """Hash a plaintext password using bcrypt with automatic salt generation."""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against a bcrypt hashed password."""
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False


def generate_refresh_token() -> str:
    """Generate a high-entropy cryptographically secure opaque refresh token."""
    return secrets.token_urlsafe(48)


def hash_token(token: str) -> str:
    """Compute SHA-256 hex digest of a token for secure database storage and lookup."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def generate_verification_token() -> str:
    """Generate a cryptographically secure random token for email verification."""
    return secrets.token_urlsafe(32)

