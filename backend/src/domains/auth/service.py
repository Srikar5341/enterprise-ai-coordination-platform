"""Authentication domain service implementing login, token rotation, and revocation."""

from datetime import datetime, timedelta, timezone
import logging
from typing import Optional, Tuple
from sqlalchemy.orm import Session

from src.core.config import get_settings
from src.core.errors import (
    BadRequestError,
    ConflictError,
    ForbiddenError,
    NotFoundError,
    RateLimitError,
    UnauthorizedError,
)
from src.core.security import (
    create_access_token,
    generate_refresh_token,
    generate_verification_token,
    hash_password,
    hash_token,
    verify_password,
)
from src.domains.auth.email_delivery import get_email_provider
from src.domains.auth.models import RefreshToken, User
from src.domains.auth.schemas import LoginRequest, RegisterRequest, TokenResponse

logger = logging.getLogger(__name__)
settings = get_settings()


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def ensure_utc(dt: datetime) -> datetime:
    """Ensure datetime is timezone-aware in UTC."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


class AuthService:
    """Manages user authentication lifecycle, token issuance, rotation, and revocation."""

    def authenticate_user(self, db: Session, login_data: LoginRequest) -> User:
        """Authenticate user by email and password, verifying salted hash.

        Raises UnauthorizedError on invalid credentials or inactive account.
        Raises ForbiddenError if user email is not yet verified.
        """
        user = db.query(User).filter(User.email == login_data.email).first()
        if not user:
            logger.warning("Authentication failed: user not found for email %s", login_data.email)
            raise UnauthorizedError(message="Invalid email or password")

        if not verify_password(login_data.password, user.hashed_password):
            logger.warning("Authentication failed: incorrect password for user %s", user.id)
            raise UnauthorizedError(message="Invalid email or password")

        if not user.is_active:
            logger.warning("Authentication failed: user %s is deactivated", user.id)
            raise UnauthorizedError(message="User account is deactivated")

        if not user.is_verified:
            logger.warning("Authentication failed: user %s email is not verified", user.id)
            raise ForbiddenError(message="Email address has not been verified. Please verify your email before logging in.")

        return user

    def issue_token_pair(self, db: Session, user: User) -> TokenResponse:
        """Generate JWT access token and persist a cryptographically secure opaque refresh token."""
        # 1. Create short-lived JWT access token
        access_token_payload = {
            "sub": user.id,
            "email": user.email,
            "role": user.role,
        }
        access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(access_token_payload, expires_delta=access_token_expires)

        # 2. Create opaque refresh token and persist SHA-256 hash
        raw_refresh_token = generate_refresh_token()
        token_hash = hash_token(raw_refresh_token)
        refresh_expires_at = utc_now() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

        refresh_record = RefreshToken(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=refresh_expires_at,
            created_at=utc_now(),
        )
        db.add(refresh_record)
        db.commit()

        return TokenResponse(
            access_token=access_token,
            refresh_token=raw_refresh_token,
            token_type="bearer",
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        )

    def rotate_refresh_token(self, db: Session, raw_refresh_token: str) -> TokenResponse:
        """Atomically validate, revoke, and rotate an existing refresh token.

        Guarantees single-use token lifecycle and issues fresh token pair.
        """
        token_hash = hash_token(raw_refresh_token)
        refresh_record = db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()

        if not refresh_record:
            logger.warning("Refresh token rotation rejected: token not found")
            raise UnauthorizedError(message="Invalid or unrecognized refresh token")

        if refresh_record.revoked_at is not None:
            logger.warning("Refresh token replay detected: token %s already revoked", refresh_record.id)
            raise UnauthorizedError(message="Refresh token has already been revoked")

        if ensure_utc(refresh_record.expires_at) < utc_now():
            logger.warning("Refresh token expired: token %s expired at %s", refresh_record.id, refresh_record.expires_at)
            raise UnauthorizedError(message="Refresh token has expired")

        user = db.query(User).filter(User.id == refresh_record.user_id).first()
        if not user or not user.is_active:
            raise UnauthorizedError(message="User account is inactive or not found")

        # Invalidate the existing token
        refresh_record.revoked_at = utc_now()

        # Issue new token pair
        access_token_payload = {
            "sub": user.id,
            "email": user.email,
            "role": user.role,
        }
        access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(access_token_payload, expires_delta=access_token_expires)

        new_raw_refresh = generate_refresh_token()
        new_token_hash = hash_token(new_raw_refresh)
        new_refresh_record = RefreshToken(
            user_id=user.id,
            token_hash=new_token_hash,
            expires_at=utc_now() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
            created_at=utc_now(),
        )
        db.add(new_refresh_record)
        db.commit()

        return TokenResponse(
            access_token=access_token,
            refresh_token=new_raw_refresh,
            token_type="bearer",
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        )

    def revoke_refresh_token(self, db: Session, raw_refresh_token: str) -> None:
        """Revoke an active refresh token on logout."""
        token_hash = hash_token(raw_refresh_token)
        refresh_record = db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()
        if refresh_record and refresh_record.revoked_at is None:
            refresh_record.revoked_at = utc_now()
            db.commit()
            logger.info("Successfully revoked refresh token %s on logout", refresh_record.id)

    def register_user(self, db: Session, request: RegisterRequest) -> Tuple[User, str]:
        """Register a new user account with pending email verification.

        Persists only SHA-256 hash of the generated verification token, establishes
        24-hour TTL, and dispatches raw token via pluggable delivery interface.
        """
        existing = db.query(User).filter(User.email == request.email).first()
        if existing:
            raise ConflictError(message="An account with this email address already exists")

        raw_verification_token = generate_verification_token()
        token_hash = hash_token(raw_verification_token)
        hashed_pw = hash_password(request.password)
        now = utc_now()

        new_user = User(
            email=request.email,
            full_name=request.full_name,
            hashed_password=hashed_pw,
            role="MEMBER",
            is_active=True,
            is_verified=False,
            verification_token=None,  # Never persist raw token in legacy or new column
            verification_token_hash=token_hash,
            verification_token_expires_at=now + timedelta(hours=24),
            verification_token_consumed_at=None,
            last_verification_sent_at=now,
            resend_count=0,
            created_at=now,
            updated_at=now,
        )
        db.add(new_user)
        db.commit()
        db.refresh(new_user)

        # Dispatch through replaceable email delivery interface
        get_email_provider().send_verification_email(
            to_email=new_user.email,
            recipient_name=new_user.full_name,
            raw_token=raw_verification_token,
        )

        logger.info(
            "Registered new user %s (email: %s). Verification token dispatched via delivery interface.",
            new_user.id,
            new_user.email,
        )
        return new_user, raw_verification_token

    def verify_email_token(self, db: Session, raw_token: str) -> User:
        """Verify an account email address using the received token.

        Enforces SHA-256 hash lookup, expiration check, and single-use consumption.
        """
        token_hash = hash_token(raw_token)
        user = db.query(User).filter(User.verification_token_hash == token_hash).first()

        if not user:
            # Check legacy token column if any
            user = db.query(User).filter(User.verification_token == raw_token).first()
            if not user:
                logger.warning("Email verification failed: token hash not recognized")
                raise BadRequestError(message="Invalid or unrecognized verification token")

        if user.verification_token_consumed_at is not None:
            logger.warning("Email verification replay rejected: token for user %s already consumed", user.id)
            raise ConflictError(message="Verification token has already been used")

        if user.verification_token_expires_at is not None:
            if ensure_utc(user.verification_token_expires_at) < utc_now():
                logger.warning(
                    "Email verification expired: token for user %s expired at %s",
                    user.id,
                    user.verification_token_expires_at,
                )
                raise BadRequestError(message="Verification token has expired. Please request a new verification email.")

        # Mark user as verified and record consumption timestamp
        now = utc_now()
        user.is_verified = True
        user.verification_token_consumed_at = now
        user.updated_at = now
        db.commit()
        db.refresh(user)

        logger.info("Email verification successful for user %s (%s)", user.id, user.email)
        return user

    def resend_verification_email(self, db: Session, email: str) -> Tuple[User, str]:
        """Generate and dispatch a new verification token for an unverified account.

        Enforces 60-second cooldown rate limit and daily ceiling directly in MySQL.
        """
        user = db.query(User).filter(User.email == email).first()
        if not user:
            logger.warning("Resend verification requested for non-existent email %s", email)
            raise NotFoundError(message="No account found with this email address")

        if user.is_verified:
            logger.info("Resend verification rejected: user %s is already verified", user.id)
            raise BadRequestError(message="Account email address is already verified")

        if not user.is_active:
            raise UnauthorizedError(message="User account is deactivated")

        now = utc_now()

        # Enforce 60s cooldown
        if user.last_verification_sent_at is not None:
            elapsed = (now - ensure_utc(user.last_verification_sent_at)).total_seconds()
            if elapsed < 60:
                remaining = int(60 - elapsed)
                logger.warning("Resend rate limit triggered for user %s: %ds remaining", user.id, remaining)
                raise RateLimitError(
                    message=f"Verification email was recently sent. Please wait {remaining} seconds before requesting another."
                )

        # Enforce daily ceiling (max 5 resends in 24 hours)
        if user.resend_count >= 5 and user.last_verification_sent_at is not None:
            elapsed_day = (now - ensure_utc(user.last_verification_sent_at)).total_seconds()
            if elapsed_day < 86400:
                logger.warning("Daily resend limit reached for user %s (%d attempts)", user.id, user.resend_count)
                raise RateLimitError(message="Maximum resend attempts reached for today. Please try again tomorrow.")
            else:
                user.resend_count = 0

        # Generate fresh token
        raw_token = generate_verification_token()
        token_hash = hash_token(raw_token)

        user.verification_token_hash = token_hash
        user.verification_token = None
        user.verification_token_expires_at = now + timedelta(hours=24)
        user.verification_token_consumed_at = None
        user.last_verification_sent_at = now
        user.resend_count += 1
        user.updated_at = now
        db.commit()
        db.refresh(user)

        # Dispatch through replaceable email delivery interface
        get_email_provider().send_verification_email(
            to_email=user.email,
            recipient_name=user.full_name,
            raw_token=raw_token,
        )

        logger.info("Resent verification token for user %s (%s)", user.id, user.email)
        return user, raw_token



auth_service = AuthService()
