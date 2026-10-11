"""Pluggable email delivery interface and development sinks.

Provides an abstract delivery boundary for outbound transactional emails,
supporting development in-memory sinks without exposing tokens or configuring
external SMTP/SES providers before formal architectural approval.
"""

from abc import ABC, abstractmethod
from datetime import datetime, timezone
import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class EmailDeliveryProvider(ABC):
    """Abstract interface for transactional email delivery."""

    @abstractmethod
    def send_verification_email(self, to_email: str, recipient_name: str, raw_token: str) -> bool:
        """Send account email verification link containing the high-entropy raw token.

        Implementations must never log the raw token in persistent log storage.
        """
        pass


class UnconfiguredEmailProvider(EmailDeliveryProvider):
    """Default runtime provider when external email services (SMTP/SES) are unconfigured.

    Ensures zero tokens are leaked or exposed and logs a safe audit message.
    """

    def send_verification_email(self, to_email: str, recipient_name: str, raw_token: str) -> bool:
        logger.info(
            "Outbound email delivery is unconfigured. Verification message for recipient %s was not sent externally.",
            to_email,
        )
        return False


class DevInMemoryEmailSink(EmailDeliveryProvider):
    """In-memory email sink for unit, integration, and live workflow testing.

    Captures sent tokens in memory so automated test assertions can verify the lifecycle
    without external network or SMTP dependencies.
    """

    def __init__(self):
        self._sent_messages: List[Dict[str, Any]] = []

    def send_verification_email(self, to_email: str, recipient_name: str, raw_token: str) -> bool:
        message = {
            "to_email": to_email,
            "recipient_name": recipient_name,
            "raw_token": raw_token,
            "sent_at": datetime.now(timezone.utc),
        }
        self._sent_messages.append(message)
        logger.debug("DevInMemoryEmailSink captured verification message for %s", to_email)
        return True

    def get_latest_token(self, to_email: str) -> Optional[str]:
        """Retrieve the most recent verification token dispatched for the specified email."""
        for msg in reversed(self._sent_messages):
            if msg["to_email"].lower() == to_email.lower():
                return msg["raw_token"]
        return None

    def get_messages_for_email(self, to_email: str) -> List[Dict[str, Any]]:
        """Retrieve all messages dispatched for the specified email."""
        return [msg for msg in self._sent_messages if msg["to_email"].lower() == to_email.lower()]

    def clear(self) -> None:
        """Clear all in-memory message logs."""
        self._sent_messages.clear()


# Active provider instance (defaults to Unconfigured for safety)
_current_provider: EmailDeliveryProvider = UnconfiguredEmailProvider()


def get_email_provider() -> EmailDeliveryProvider:
    """Retrieve the currently configured email delivery provider."""
    return _current_provider


def set_email_provider(provider: EmailDeliveryProvider) -> None:
    """Override the active email delivery provider (used in tests and harnesses)."""
    global _current_provider
    _current_provider = provider
