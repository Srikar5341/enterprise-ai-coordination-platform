# Spec Delta: Authentication Lifecycle & Demo-User Provisioning

## Purpose
Provides a complete, secure authentication boundary and token lifecycle for the Revora platform, including credential verification, JWT access tokens, opaque refresh-token rotation in MySQL, logout session revocation, registration with email verification state design, server-side project authorization, and repeatable development environment bootstrapping.

## ADDED Requirements

### Requirement: Credential Authentication and Token Issuance
The system SHALL provide an endpoint `POST /api/v1/auth/login` accepting user credentials (`email` and `password`). The backend SHALL verify the credentials against the salted hash stored in the MySQL `users` table. Upon successful verification, the system SHALL issue a signed Bearer JWT access token (default 15 minutes validity) and persist a cryptographically secure opaque refresh token in the `refresh_tokens` table (default 7 days validity).

#### Scenario: Successful login with valid credentials
- **WHEN** a client submits a valid email and matching password for an active user
- **THEN** the system returns an HTTP 200 response with `access_token`, `refresh_token`, `token_type: "bearer"`, and `expires_in` seconds

#### Scenario: Login with invalid password
- **WHEN** a client submits an incorrect password for an existing user email
- **THEN** the system rejects the request with HTTP 401 Unauthorized using the standard error envelope

#### Scenario: Login with non-existent user email
- **WHEN** a client submits an email that does not exist in the database
- **THEN** the system rejects the request with HTTP 401 Unauthorized using a generic message to prevent user enumeration

#### Scenario: Login with deactivated user account
- **WHEN** a client attempts login for an account where `is_active` is false
- **THEN** the system rejects the request with HTTP 401 Unauthorized or HTTP 403 Forbidden using the standard error envelope

---

### Requirement: Refresh Token Rotation Lifecycle
The system SHALL provide an endpoint `POST /api/v1/auth/refresh` accepting a valid, unrevoked `refresh_token`. The system SHALL validate that the refresh token exists in MySQL, belongs to an active user, and has not expired or been revoked. Upon successful validation, the system SHALL revoke the presented refresh token (token rotation), generate and persist a new opaque refresh token, and return a fresh access token and refresh token pair.

#### Scenario: Successful refresh token rotation
- **WHEN** a client submits a valid, unexpired, unrevoked refresh token
- **THEN** the backend invalidates the old refresh token in MySQL, creates a new refresh token, and returns HTTP 200 with the new token pair

#### Scenario: Refresh token replay or reuse attempt
- **WHEN** a client attempts to refresh using an already revoked or previously rotated refresh token
- **THEN** the system rejects the request with HTTP 401 Unauthorized and invalidates any child tokens if compromise is detected

#### Scenario: Expired refresh token
- **WHEN** a client submits a refresh token whose `expires_at` timestamp is in the past
- **THEN** the system rejects the request with HTTP 401 Unauthorized with code `UNAUTHORIZED`

---

### Requirement: Session Revocation and Logout
The system SHALL provide an endpoint `POST /api/v1/auth/logout` allowing an authenticated client to revoke their active refresh token. The system SHALL mark the provided refresh token as revoked in MySQL (`revoked_at = NOW()`).

#### Scenario: Successful logout revocation
- **WHEN** an authenticated user or client submits their active refresh token to `POST /api/v1/auth/logout`
- **THEN** the system marks the refresh token record as revoked and returns HTTP 200 with success status

#### Scenario: Logout with already revoked or nonexistent token
- **WHEN** a client calls logout with an already revoked or invalid token
- **THEN** the system safely succeeds or returns HTTP 200 to ensure idempotent client logout without leaking token state

---

### Requirement: Authenticated User Profile Inspection
The system SHALL provide an endpoint `GET /api/v1/auth/me` requiring a valid Bearer JWT access token. The endpoint SHALL decode the token, query the `users` table in MySQL, and return the active user's profile attributes (`id`, `email`, `full_name`, `role`, `is_active`, `is_verified`, `created_at`).

#### Scenario: Valid access token returns user profile
- **WHEN** an authenticated user presents a valid Bearer token to `GET /api/v1/auth/me`
- **THEN** the system returns HTTP 200 with the user's current database profile

#### Scenario: Missing or expired token rejected
- **WHEN** a client calls `GET /api/v1/auth/me` without a Bearer token or with an expired token
- **THEN** the system rejects the request with HTTP 401 Unauthorized in the standard error envelope

---

### Requirement: Account Registration with Email Verification Design
The system SHALL provide an endpoint `POST /api/v1/auth/register` allowing account registration with email, password, and full name. The design SHALL incorporate an email verification workflow by assigning a verification token and setting `is_verified = False` (or configured dev default), while explicitly logging and returning unconfigured status for external email delivery without inventing fake SMTP providers.

#### Scenario: Successful account registration
- **WHEN** a client submits unique registration credentials (`email`, `password`, `full_name`)
- **THEN** the system persists the user record with hashed password, generates a verification token, and returns HTTP 201 Created

#### Scenario: Registration with duplicate email
- **WHEN** a client attempts registration with an email already registered in the system
- **THEN** the system rejects the request with HTTP 409 Conflict using the standard error envelope

---

### Requirement: Server-Side Project Membership Authorization & Isolation
The backend SHALL enforce multi-tenant and project-level authorization by validating user membership directly against the `project_members` table in MySQL. For sensitive operations (e.g., goal creation, plan generation, proposal approval/rejection), the backend SHALL verify that the authenticated user possesses an authorized role (`LEAD` or `ADMIN`) for the specific `project_id`.

#### Scenario: Authorized project lead proceeds
- **WHEN** an authenticated user who is recorded as a `LEAD` in `project_members` for `project_id` performs a project operation
- **THEN** the backend permits the operation

#### Scenario: User from different project rejected (Project Isolation)
- **WHEN** an authenticated user attempts to access or mutate a project where they have no membership record
- **THEN** the backend rejects the request with HTTP 403 Forbidden with code `FORBIDDEN`

#### Scenario: Standard member without lead role rejected
- **WHEN** an authenticated user who is only a `MEMBER` attempts a lead-only operation (e.g. goal submission or proposal approval)
- **THEN** the backend rejects the request with HTTP 403 Forbidden

---

### Requirement: Repeatable Development Bootstrap Provisioning
The system SHALL provide an idempotent bootstrap mechanism (`src/core/bootstrap.py`) to provision a demo user, demo project, and project lead membership without hardcoding production credentials or exposing secrets in source control.

#### Scenario: Idempotent execution of bootstrap utility
- **WHEN** the bootstrap mechanism is executed in a development or test environment
- **THEN** it creates the demo user and project if they do not exist, or updates credentials if requested, outputting confirmation without storing passwords in plain text
