# Proposal: Complete Authentication Lifecycle and Demo-User Provisioning

## Why
The Revora platform requires a robust, secure authentication boundary and server-side project authorization layer before client applications can reliably coordinate tasks and manage operational goals. While initial JWT decoding and mock checks were stubbed in the backend foundation, the full authentication lifecycle (credential verification, refresh-token rotation, logout revocation, persistent user records) and repeatable local development provisioning must be formally established without relying on hardcoded secrets or unverified third-party services.

## What Changes
- **User and Refresh Token Persistence**: Introduce persistent relational models (`users` and `refresh_tokens`) in MySQL 8 via versioned Alembic migrations.
- **Credential Security**: Implement secure password hashing and verification using `bcrypt`.
- **JWT Access / Refresh Lifecycle**:
  - `POST /api/v1/auth/login`: Authenticates credentials and issues a short-lived Bearer JWT access token (default 15 minutes) and a cryptographically secure opaque refresh token (default 7 days).
  - `POST /api/v1/auth/refresh`: Rotates refresh tokens atomically upon each invocation, revoking the presented token and issuing a fresh access/refresh token pair to prevent token replay.
  - `POST /api/v1/auth/logout`: Revokes the active refresh token in MySQL.
  - `GET /api/v1/auth/me`: Returns the authenticated user's profile and active metadata.
- **User Registration with Verification Design**:
  - `POST /api/v1/auth/register`: Implements account registration with an unverified initial state and verification token storage, explicitly acknowledging and documenting that external email delivery is not yet configured in development.
- **Server-Side Project Membership Authorization**: Enforce project-level authorization by validating user roles directly against `project_members` in MySQL for all protected resource access, guaranteeing cross-project tenant isolation.
- **Repeatable Development Bootstrap Mechanism**: Provide an idempotent bootstrap utility (`src/core/bootstrap.py`) that provisions demo accounts, a sample project, and lead membership from environment variables (`DEMO_USER_*`) with safe fallbacks.

## Capabilities

### New Capabilities
- `auth-lifecycle`: Covers user credential validation, JWT access token issuance, opaque refresh token storage and rotation in MySQL, logout revocation, authenticated user profile retrieval, account registration with email verification state design, server-side project membership authorization, and development bootstrap provisioning.

### Modified Capabilities
- *(None: Builds upon existing backend foundation without breaking existing endpoints)*

## Impact
- **APIs Affected**:
  - `POST /api/v1/auth/login`
  - `POST /api/v1/auth/refresh`
  - `POST /api/v1/auth/logout`
  - `GET /api/v1/auth/me`
  - `POST /api/v1/auth/register`
- **Database Schema**: Adds `users` table and `refresh_tokens` table in MySQL 8.
- **Security & Invariants**: Enforces Bearer JWT standard, structured error responses on 401/403, and strict project membership authorization checks.
