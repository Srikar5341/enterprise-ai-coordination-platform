# Spec Delta: Secure Email Verification Lifecycle

## Purpose
Establishes a hardened, single-use, cryptographic email verification workflow for Revora, enforcing SHA-256 token hashing, token expiration, replay defense, login gating for unverified users, DB-backed resend rate limiting, and a pluggable email delivery interface.

## ADDED Requirements

### Requirement: Cryptographic Verification Token Storage and Hashing
The system SHALL never store raw verification tokens in persistent storage or logs. Upon generating a cryptographically secure random token (URL-safe string, minimum 32 bytes entropy), the backend SHALL compute its SHA-256 hex digest and persist only the digest in `users.verification_token_hash`.

#### Scenario: Verification token generation at registration
- **WHEN** a client successfully registers an account via `POST /api/v1/auth/register`
- **THEN** the backend persists the SHA-256 hash in MySQL, sets `is_verified = False`, records `verification_token_expires_at = NOW() + 24 hours`, and does NOT include the raw token in the HTTP response body

---

### Requirement: Email Verification Endpoint
The system SHALL provide an endpoint `POST /api/v1/auth/verify-email` accepting `{"token": "<raw_token>"}`. The backend SHALL compute the SHA-256 hash of the presented token and locate the associated user in MySQL.

#### Scenario: Successful email verification
- **WHEN** a client submits a valid, unexpired, unconsumed verification token
- **THEN** the system sets `is_verified = True`, records `verification_token_consumed_at = NOW()`, nullifies active token fields, and returns HTTP 200 with success status

#### Scenario: Expired verification token rejected
- **WHEN** a client submits a verification token whose `verification_token_expires_at` is in the past
- **THEN** the system rejects the request with HTTP 400 Bad Request with code `BAD_REQUEST` indicating the token has expired

#### Scenario: Reused or replayed verification token rejected
- **WHEN** a client attempts verification using a token that has already been consumed (`verification_token_consumed_at IS NOT NULL`)
- **THEN** the system rejects the request with HTTP 409 Conflict with code `CONFLICT` stating the verification token has already been used

#### Scenario: Invalid or unrecognized verification token rejected
- **WHEN** a client submits a token whose hash does not match any user record
- **THEN** the system rejects the request with HTTP 400 Bad Request with code `BAD_REQUEST`

---

### Requirement: Mandatory Login Gating for Unverified Accounts
The system SHALL refuse authentication tokens to accounts where `is_verified` is `False`.

#### Scenario: Unverified account login rejected
- **WHEN** an unverified user submits valid email and password credentials to `POST /api/v1/auth/login`
- **THEN** the system rejects the login with HTTP 403 Forbidden with code `FORBIDDEN` and an explicit message that email verification is required

#### Scenario: Verified account login succeeds
- **WHEN** an active, verified user submits valid credentials to `POST /api/v1/auth/login`
- **THEN** the system returns HTTP 200 with Bearer access token and refresh token

---

### Requirement: Rate-Limited Verification Resend
The system SHALL provide an endpoint `POST /api/v1/auth/resend-verification` accepting `{"email": "<user_email>"}`.

#### Scenario: Successful resend after cooldown
- **WHEN** an unverified user requests a new verification email after the cooldown period (minimum 60 seconds since last sent)
- **THEN** the backend generates a new token and hash, resets expiry to 24 hours, updates `last_verification_sent_at`, increments `resend_count`, and returns HTTP 200

#### Scenario: Resend during cooldown rejected by rate limiter
- **WHEN** a user requests a resend within 60 seconds of their previous request
- **THEN** the backend rejects the request with HTTP 429 Too Many Requests with code `RATE_LIMIT_EXCEEDED`

#### Scenario: Resend for already verified account
- **WHEN** a user whose account is already `is_verified = True` calls `POST /api/v1/auth/resend-verification`
- **THEN** the backend safely succeeds or returns HTTP 400 Bad Request with code `BAD_REQUEST` indicating the account is already verified

---

### Requirement: Pluggable Email Delivery Interface
The backend SHALL abstract email transmission behind a domain interface (`EmailDeliveryProvider`).

#### Scenario: Production runtime with unconfigured provider
- **WHEN** a verification email is triggered in an environment without configured external SMTP/SES credentials
- **THEN** the system executes `UnconfiguredEmailProvider`, recording an audit event that external delivery is not configured without raising a fatal application crash or logging raw tokens

#### Scenario: Test environment using DevInMemoryEmailSink
- **WHEN** automated tests or dev workflow scripts run with `DevInMemoryEmailSink`
- **THEN** the delivered raw token is captured in memory for assertion and verification lifecycle testing
