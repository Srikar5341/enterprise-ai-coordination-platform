# Design: Authentication Lifecycle & Demo-User Provisioning

## 1. Context and Architectural Fit

The platform operates as a FastAPI modular monolith with MySQL 8 as the single source of truth. Under ADR 0002 and approved Decisions 1 and 2:
- Authentication relies on short-lived Bearer JWT access tokens (15-minute default) and cryptographically secure opaque refresh tokens persisted in MySQL (7-day default).
- The backend enforces project-level authorization by validating user membership directly against `project_members` in MySQL for every state-altering or sensitive request.
- Client applications (Web Vite client and Android Kotlin client) interact exclusively via the shared `/api/v1` REST API using the unified JSON error envelope.

## 2. Relational Data Models (MySQL 8)

### A. `users` Table
```sql
CREATE TABLE users (
    id VARCHAR(36) PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'MEMBER',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    verification_token VARCHAR(255) NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL
);
```

### B. `refresh_tokens` Table
```sql
CREATE TABLE refresh_tokens (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at DATETIME(6) NOT NULL,
    revoked_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_refresh_token_lookup (token_hash, revoked_at)
);
```

## 3. Cryptographic and Token Strategy

### A. Access Tokens
- **Format**: Signed JWT (HS256) using `JWT_SECRET_KEY` from environment variables.
- **Payload Claims**:
  - `sub`: User ID (UUID string)
  - `email`: User email string
  - `role`: Global default role string (e.g., `MEMBER`, `LEAD`, `ADMIN`)
  - `iat`: Issued-at UTC timestamp
  - `exp`: Expiration UTC timestamp (current time + 15 minutes)

### B. Refresh Tokens & Rotation
- **Format**: High-entropy opaque string generated via `secrets.token_urlsafe(48)`.
- **Storage**: Persisted as a SHA-256 hash (`hashlib.sha256(token.encode()).hexdigest()`) to protect against token leakage in database snapshots or query logs.
- **Rotation Flow**:
  1. Incoming refresh token string is hashed with SHA-256.
  2. Database lookup in `refresh_tokens` by `token_hash`.
  3. Validate:
     - Token exists.
     - `revoked_at IS NULL`.
     - `expires_at > utc_now()`.
  4. If invalid or revoked, reject with HTTP 401 Unauthorized (`UNAUTHORIZED`).
  5. Atomically update the existing token record: `revoked_at = utc_now()`.
  6. Generate a new opaque refresh token, hash it, and insert a new record in `refresh_tokens`.
  7. Issue a new Bearer JWT access token and return both new tokens to the client.

### C. Password Hashing
- Utilizes `bcrypt` for one-way salted password hashing and verification.
- Hashed passwords are never logged, returned in API responses, or stored in plaintext.

## 4. Endpoints and Schemas

### Routes under `/api/v1/auth`:
- `POST /login`: Accepts `{"email": "...", "password": "..."}`. Returns `{"access_token": "...", "refresh_token": "...", "token_type": "bearer", "expires_in": 900}`.
- `POST /refresh`: Accepts `{"refresh_token": "..."}`. Rotates token and returns new token pair.
- `POST /logout`: Accepts `{"refresh_token": "..."}`. Marks token as revoked.
- `GET /me`: Requires `Authorization: Bearer <token>`. Returns current user profile.
- `POST /register`: Accepts `{"email": "...", "password": "...", "full_name": "..."}`. Creates user record with pending verification token and returns user details.

## 5. Server-Side Project Authorization

Project-level security is enforced via `verify_project_lead_permission`:
1. Authenticated user identity (`sub`) is extracted from the validated JWT.
2. A direct SQL query checks `project_members`:
   ```sql
   SELECT role FROM project_members WHERE project_id = :project_id AND user_id = :user_id
   ```
3. If no record is found or the role is not in `['LEAD', 'ADMIN']` (and the user is not a global ADMIN), the request is rejected with `HTTP 403 Forbidden` (`FORBIDDEN`).
4. This guarantees project isolation: a member of Project A cannot manipulate or view resources in Project B without explicit membership.

## 6. Repeatable Development Bootstrap Provisioning

The utility `backend/src/core/bootstrap.py` provides an idempotent provisioning routine:
- Configurable environment variables:
  - `DEMO_USER_EMAIL` (default: `lead@revora.local`)
  - `DEMO_USER_PASSWORD` (default: `DemoLead123!`)
  - `DEMO_USER_NAME` (default: `Demo Team Lead`)
  - `DEMO_PROJECT_NAME` (default: `Demo Coordination Project`)
- Execution flow:
  1. Inspects database for demo user; creates user if missing (with verified status and hashed password).
  2. Inspects database for demo project; creates project if missing.
  3. Ensures `project_members` contains a record assigning the demo user `LEAD` role on the demo project.
  4. Returns IDs and logs status without leaking raw passwords.

## 7. Email Verification Architecture Design

- Registration model includes `is_verified` boolean and `verification_token` column.
- External email delivery (SMTP/SES/SendGrid) is intentionally omitted from the hackathon MVP runtime to avoid mock/fake service illusions.
- Registration returns user state indicating pending verification, and logs the generated token in development for local verification simulation if needed.
