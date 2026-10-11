"""Structured logging configuration with credential masking and standard formatting."""

import logging
import re
import sys
from typing import Any
from src.core.config import get_settings

# Patterns to mask sensitive tokens, keys, and passwords from logs
SENSITIVE_PATTERNS = [
    re.compile(r"(password[:=]\s*)([^\s&,;]+)", re.IGNORECASE),
    re.compile(r"(secret[:=]\s*)([^\s&,;]+)", re.IGNORECASE),
    re.compile(r"(token[:=]\s*)([^\s&,;]+)", re.IGNORECASE),
    re.compile(r"(api[_-]?key[:=]\s*)([^\s&,;]+)", re.IGNORECASE),
    re.compile(r"(authorization[:=]\s*Bearer\s+)([^\s&,;]+)", re.IGNORECASE),
]


class SensitiveDataFilter(logging.Filter):
    """Logging filter that scrubs sensitive credentials and secrets from log records."""

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = self._sanitize(record.msg)
        if record.args:
            if isinstance(record.args, dict):
                record.args = {k: self._sanitize(v) if isinstance(v, str) else v for k, v in record.args.items()}
            elif isinstance(record.args, tuple):
                record.args = tuple(self._sanitize(v) if isinstance(v, str) else v for v in record.args)
        return True

    @staticmethod
    def _sanitize(text: Any) -> Any:
        if not isinstance(text, str):
            return text
        sanitized = text
        for pattern in SENSITIVE_PATTERNS:
            sanitized = pattern.sub(r"\1[MASKED]", sanitized)
        return sanitized


def setup_logging() -> None:
    """Initialize structured console logging configured via application settings."""
    settings = get_settings()
    log_level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)

    log_format = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
    date_format = "%Y-%m-%d %H:%M:%S"

    # Configure stdout handler with sensitive data filter
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(log_level)
    handler.setFormatter(logging.Formatter(fmt=log_format, datefmt=date_format))
    handler.addFilter(SensitiveDataFilter())

    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)
    
    # Avoid duplicate handlers if setup_logging is called multiple times
    root_logger.handlers.clear()
    root_logger.addHandler(handler)

    # Silence excessively verbose third-party loggers if in INFO mode
    if log_level == logging.INFO:
        logging.getLogger("uvicorn.access").setLevel(logging.WARNING)

    logging.getLogger("src").info(
        "Structured logging initialized at %s level (Environment: %s)",
        settings.LOG_LEVEL,
        settings.ENVIRONMENT,
    )
