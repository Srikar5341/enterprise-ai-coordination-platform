"""Centralized exception classes and global FastAPI error handlers formatted as structured envelopes."""

import logging
from typing import Any, Optional
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


class ErrorDetail(BaseModel):
    """Structured error payload definition."""
    code: str
    message: str
    details: Optional[Any] = None


class ErrorEnvelope(BaseModel):
    """Top-level approved API error response envelope."""
    error: ErrorDetail


class AppException(Exception):
    """Base application exception for deterministic platform errors."""

    def __init__(
        self,
        code: str = "APPLICATION_ERROR",
        message: str = "An application error occurred",
        status_code: int = status.HTTP_400_BAD_REQUEST,
        details: Optional[Any] = None,
    ):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details


class BadRequestError(AppException):
    def __init__(self, message: str = "Bad request", details: Optional[Any] = None):
        super().__init__(
            code="BAD_REQUEST",
            message=message,
            status_code=status.HTTP_400_BAD_REQUEST,
            details=details,
        )


class UnauthorizedError(AppException):
    def __init__(self, message: str = "Authentication required", details: Optional[Any] = None):
        super().__init__(
            code="UNAUTHORIZED",
            message=message,
            status_code=status.HTTP_401_UNAUTHORIZED,
            details=details,
        )


class ForbiddenError(AppException):
    def __init__(self, message: str = "Access forbidden", details: Optional[Any] = None):
        super().__init__(
            code="FORBIDDEN",
            message=message,
            status_code=status.HTTP_403_FORBIDDEN,
            details=details,
        )


class NotFoundError(AppException):
    def __init__(self, message: str = "Resource not found", details: Optional[Any] = None):
        super().__init__(
            code="NOT_FOUND",
            message=message,
            status_code=status.HTTP_404_NOT_FOUND,
            details=details,
        )


class ConflictError(AppException):
    def __init__(self, message: str = "Resource state conflict", details: Optional[Any] = None):
        super().__init__(
            code="CONFLICT",
            message=message,
            status_code=status.HTTP_409_CONFLICT,
            details=details,
        )


class RateLimitError(AppException):
    def __init__(self, message: str = "Rate limit exceeded. Please wait before retrying.", details: Optional[Any] = None):
        super().__init__(
            code="RATE_LIMIT_EXCEEDED",
            message=message,
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            details=details,
        )


class QuotaExceededError(AppException):
    def __init__(
        self,
        message: str = "Monthly AI plan generation quota exceeded for current subscription tier",
        details: Optional[Any] = None,
    ):
        super().__init__(
            code="QUOTA_EXCEEDED",
            message=message,
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            details=details,
        )


class ValidationError(AppException):
    def __init__(self, message: str = "Validation failed", details: Optional[Any] = None):
        super().__init__(
            code="VALIDATION_ERROR",
            message=message,
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            details=details,
        )


class DatabaseError(AppException):
    def __init__(self, message: str = "Database operation failed", details: Optional[Any] = None):
        super().__init__(
            code="DATABASE_ERROR",
            message=message,
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            details=details,
        )


class InternalServerError(AppException):
    def __init__(self, message: str = "Internal server error", details: Optional[Any] = None):
        super().__init__(
            code="INTERNAL_SERVER_ERROR",
            message=message,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            details=details,
        )


async def app_exception_handler(_request: Request, exc: AppException) -> JSONResponse:
    """Format custom application exceptions into the structured error envelope."""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": exc.code,
                "message": exc.message,
                "details": exc.details,
            }
        },
    )


async def validation_exception_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
    """Format request validation errors into the structured error envelope."""
    formatted_errors = []
    for err in exc.errors():
        formatted_errors.append(
            {
                "loc": [str(item) for item in err.get("loc", [])],
                "msg": err.get("msg", "Validation error"),
                "type": err.get("type", "value_error"),
            }
        )

    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "Request validation failed",
                "details": formatted_errors,
            }
        },
    )


STATUS_CODE_MAP = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    408: "REQUEST_TIMEOUT",
    409: "CONFLICT",
    422: "VALIDATION_ERROR",
    500: "INTERNAL_SERVER_ERROR",
    502: "BAD_GATEWAY",
    503: "SERVICE_UNAVAILABLE",
    504: "GATEWAY_TIMEOUT",
}


async def http_exception_handler(_request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """Format Starlette and FastAPI HTTPExceptions into the structured error envelope."""
    code = STATUS_CODE_MAP.get(exc.status_code, f"HTTP_{exc.status_code}")
    message = exc.detail if isinstance(exc.detail, str) else "HTTP error"
    details = exc.detail if not isinstance(exc.detail, str) else None

    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": code,
                "message": message,
                "details": details,
            }
        },
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch-all for unhandled exceptions, hiding sensitive internal traces."""
    logger.error(
        "Unhandled exception processing %s %s: %s",
        request.method,
        request.url.path,
        exc,
        exc_info=True,
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": "An unexpected internal server error occurred",
                "details": None,
            }
        },
    )


def register_error_handlers(app: FastAPI) -> None:
    """Register all centralized error handlers with the FastAPI application instance."""
    app.add_exception_handler(AppException, app_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)
