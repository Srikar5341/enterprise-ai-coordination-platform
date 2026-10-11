"""FastAPI route handlers for Authentication and User management."""

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from src.core.auth import AuthenticatedUser, get_current_user
from src.core.database import get_db
from src.core.errors import NotFoundError
from src.domains.auth.models import User
from src.domains.auth.schemas import (
    LoginRequest,
    LogoutRequest,
    RefreshTokenRequest,
    RegisterRequest,
    RegisterResponse,
    ResendVerificationRequest,
    ResendVerificationResponse,
    TokenResponse,
    UserResponse,
    VerifyEmailRequest,
    VerifyEmailResponse,
)
from src.domains.auth.service import auth_service

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=TokenResponse, status_code=status.HTTP_200_OK)
def login(
    payload: LoginRequest,
    db: Session = Depends(get_db),
) -> TokenResponse:
    """Authenticate with email and password to receive access and refresh tokens."""
    user = auth_service.authenticate_user(db, payload)
    return auth_service.issue_token_pair(db, user)


@router.post("/refresh", response_model=TokenResponse, status_code=status.HTTP_200_OK)
def refresh_token(
    payload: RefreshTokenRequest,
    db: Session = Depends(get_db),
) -> TokenResponse:
    """Rotate an active opaque refresh token and receive a fresh token pair."""
    return auth_service.rotate_refresh_token(db, payload.refresh_token)


@router.post("/logout", status_code=status.HTTP_200_OK)
def logout(
    payload: LogoutRequest,
    db: Session = Depends(get_db),
) -> dict:
    """Revoke an active refresh token on user logout."""
    auth_service.revoke_refresh_token(db, payload.refresh_token)
    return {"status": "success", "message": "Successfully logged out and revoked refresh token"}


@router.get("/me", response_model=UserResponse, status_code=status.HTTP_200_OK)
def get_current_user_profile(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserResponse:
    """Retrieve profile and attributes of the currently authenticated user."""
    db_user = db.query(User).filter(User.id == current_user.id).first()
    if not db_user:
        # If user was created before User table or using custom token, return authenticated context
        return UserResponse(
            id=current_user.id,
            email=current_user.email,
            full_name=current_user.email.split("@")[0].title() if "@" in current_user.email else "User",
            role=current_user.role,
            is_active=True,
            is_verified=True,
            created_at=current_user.created_at if hasattr(current_user, "created_at") else None,
        )
    return UserResponse.model_validate(db_user)


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
def register(
    payload: RegisterRequest,
    db: Session = Depends(get_db),
) -> RegisterResponse:
    """Register a new user account with email verification workflow design."""
    user, _verification_token = auth_service.register_user(db, payload)
    return RegisterResponse(
        user=UserResponse.model_validate(user),
        message="User account created successfully. Email verification required.",
        verification_status="pending_verification",
        email_delivery="unconfigured",
    )


@router.post("/verify-email", response_model=VerifyEmailResponse, status_code=status.HTTP_200_OK)
def verify_email(
    payload: VerifyEmailRequest,
    db: Session = Depends(get_db),
) -> VerifyEmailResponse:
    """Verify user email address using the received token, transitioning account to active verified status."""
    verified_user = auth_service.verify_email_token(db, payload.token)
    return VerifyEmailResponse(
        status="success",
        message="Email address verified successfully. You may now log in.",
        user=UserResponse.model_validate(verified_user),
    )


@router.post("/resend-verification", response_model=ResendVerificationResponse, status_code=status.HTTP_200_OK)
def resend_verification(
    payload: ResendVerificationRequest,
    db: Session = Depends(get_db),
) -> ResendVerificationResponse:
    """Request a fresh email verification link for an unverified account (rate-limited)."""
    user, _raw_token = auth_service.resend_verification_email(db, payload.email)
    return ResendVerificationResponse(
        status="success",
        message=f"A fresh verification link has been dispatched to {user.email}.",
        email_delivery="unconfigured",
    )

