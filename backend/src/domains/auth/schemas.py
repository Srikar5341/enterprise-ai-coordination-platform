"""Pydantic schemas for Authentication and User management."""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


EMAIL_REGEX = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


class LoginRequest(BaseModel):
    """User credentials for token issuance."""
    email: str = Field(..., pattern=EMAIL_REGEX, description="User registered email address")
    password: str = Field(..., min_length=1, description="Plaintext password")


class TokenResponse(BaseModel):
    """Bearer JWT access token and opaque refresh token pair."""
    access_token: str = Field(..., description="Signed Bearer JWT access token")
    refresh_token: str = Field(..., description="Opaque refresh token string")
    token_type: str = Field(default="bearer", description="Token authentication scheme")
    expires_in: int = Field(default=900, description="Access token lifetime in seconds")


class RefreshTokenRequest(BaseModel):
    """Payload to rotate an active refresh token."""
    refresh_token: str = Field(..., min_length=1, description="Active opaque refresh token")


class LogoutRequest(BaseModel):
    """Payload to revoke an active refresh token."""
    refresh_token: str = Field(..., min_length=1, description="Opaque refresh token to revoke")


class RegisterRequest(BaseModel):
    """Payload to register a new user account."""
    email: str = Field(..., pattern=EMAIL_REGEX, description="Unique email address")
    password: str = Field(..., min_length=8, description="Password with minimum 8 characters")
    full_name: str = Field(..., min_length=1, max_length=255, description="User full display name")


class UserResponse(BaseModel):
    """Public authenticated user profile representation."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    full_name: str
    role: str
    is_active: bool
    is_verified: bool
    created_at: datetime


class RegisterResponse(BaseModel):
    """Response returned upon account registration."""
    user: UserResponse
    message: str
    verification_status: str = Field(
        default="pending_verification",
        description="Verification state of the newly created account",
    )
    email_delivery: str = Field(
        default="unconfigured",
        description="External email delivery status (not configured for local development)",
    )


class VerifyEmailRequest(BaseModel):
    """Payload to verify an account email address using the received token."""
    token: str = Field(..., min_length=1, description="Opaque verification token received via email")


class VerifyEmailResponse(BaseModel):
    """Response returned upon successful email verification."""
    status: str = Field(default="success", description="Verification operation outcome status")
    message: str = Field(default="Email address verified successfully", description="User confirmation message")
    user: UserResponse


class ResendVerificationRequest(BaseModel):
    """Payload to request a new verification email for an unverified account."""
    email: str = Field(..., pattern=EMAIL_REGEX, description="Registered email address")


class ResendVerificationResponse(BaseModel):
    """Response returned upon dispatching a verification email."""
    status: str = Field(default="success", description="Operation status")
    message: str = Field(
        default="If an unverified account exists for this email, a verification link has been sent.",
        description="Safe generic response message",
    )
    email_delivery: str = Field(
        default="unconfigured",
        description="External email delivery status",
    )

