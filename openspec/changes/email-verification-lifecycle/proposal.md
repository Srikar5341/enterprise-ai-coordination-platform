# Change Proposal: Secure Email Verification Lifecycle

## Why
While Revora currently implements user registration (`POST /api/v1/auth/register`), the verification subsystem is incomplete and vulnerable:
1. Verification tokens are persisted in plaintext (`users.verification_token`).
2. Verification tokens lack an expiration timestamp (TTL) and single-use consumption guards.
3. No verification endpoint (`POST /api/v1/auth/verify-email`) exists to redeem tokens and transition accounts to `is_verified = True`.
4. No resend verification endpoint (`POST /api/v1/auth/resend-verification`) exists.
5. Login currently permits unverified accounts to obtain Bearer JWT access tokens, violating enterprise onboarding safety requirements.
6. External email delivery is unconfigured without an abstraction layer, preventing testing and delivery isolation.

## What Changes
1. **Cryptographic Token Hashing & Safe Persistence**:
   - Only high-entropy SHA-256 hashes of verification tokens are persisted (`verification_token_hash`). Raw tokens are never stored in the database.
   - Raw tokens are transmitted strictly via the delivery interface and are never logged or returned in HTTP response bodies.
2. **Token Expiry & Single-Use Lifecycle**:
   - Enforce configurable token expiration (default: 24 hours).
   - Track consumption timestamp (`verification_token_consumed_at`) to reject token reuse and replay attempts with HTTP 409 Conflict.
3. **Verification & Resend Endpoints**:
   - `POST /api/v1/auth/verify-email`: Accepts `{"token": "..."}`, validates hash, expiry, and single-use, and transitions `is_verified` to `True`.
   - `POST /api/v1/auth/resend-verification`: Accepts `{"email": "..."}`, enforces database-backed cooldown rate limiting (60s minimum interval), generates a new token hash, and dispatches via delivery sink.
4. **Mandatory Login Verification Gate**:
   - Unverified accounts attempting login (`POST /api/v1/auth/login`) are rejected with `HTTP 403 Forbidden` (`code: "FORBIDDEN"`).
   - Seeded demo users (`lead@revora.local`) remain pre-verified for development workflow continuity.
5. **Pluggable Email Delivery Interface & Development Sink**:
   - Implement `EmailDeliveryProvider` abstract interface.
   - Default to `UnconfiguredEmailProvider` for production/staging safety.
   - Provide `DevInMemoryEmailSink` for local verification testing without external SMTP/SES infrastructure.
6. **Non-Destructive Alembic Migration**:
   - Add new verification columns (`verification_token_hash`, `verification_token_expires_at`, `verification_token_consumed_at`, `last_verification_sent_at`, `resend_count`) to `users` table without dropping or mutating existing data.

## Capabilities Affected
- `auth-lifecycle`: Extends user authentication boundary with token verification, login gating, rate-limited resend, and delivery interfaces.
