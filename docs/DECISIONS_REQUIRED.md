# Decisions Required (Architecture & Governance Decision Log)

---

## 1. Overview

Per project governance rules, no architectural choice, schema definition, or technology adoption may be silently resolved or assumed. This document tracks all decisions, recording their formal status (**Accepted**, **Proposed**, **Candidate**, or **Unresolved**) as determined by **Member 2 (Backend & AI Lead / Project Owner)** and core project specifications.

---

## 2. Decision Log

### Decision 1: Authentication & Authorization Flow
- **Current Status**: **Accepted / Approved** (Phase 1 Finalization)
- **Approved Decision**:
  - **Transport**: `Authorization: Bearer <access_token>` header.
  - **Access Token**: JWT with configurable default lifetime of **15 minutes**.
  - **Refresh Token**: Secure opaque token stored in MySQL with configurable default lifetime of **7 days**.
  - **Security & Lifecycle**: Refresh tokens are rotated on each refresh; previous tokens are invalidated. Logout revokes active refresh tokens. Signing secrets and credentials are kept strictly in environment variables (`.env`), never in source control.
  - **Backend Authority**: Backend verifies current user identity, project membership, and permissions against the database for sensitive operations. The backend never relies solely on role claims embedded in an access token.
- **Unresolved Boundary**: Account self-registration and public provisioning workflows are **UNRESOLVED** (see Decision 12). Only pre-provisioned authentication is in scope.

---

### Decision 2: Standard API Error Envelope & Status Code Conventions
- **Current Status**: **Accepted / Approved** (Phase 1 Finalization)
- **Approved Decision**:
  - Unified structured error envelope across Web and Android:
    ```json
    {
      "error": {
        "code": "ERROR_CODE",
        "message": "Human-readable message",
        "details": null
      }
    }
    ```
  - `details` contains safe, structured field-validation information where appropriate.
  - Stack traces, secrets, and internal SQL/database errors are strictly forbidden in client responses.
  - Consistent HTTP status code mapping (400, 401, 403, 404, 409, 422, 500, 502/504).

---

### Decision 3: Request & Response Schemas
- **Current Status**:
  - **Accepted / Approved for Goal Planning (6 Endpoints)**
  - **Unresolved for Remaining Endpoints (56 Endpoints)**
- **Approved Goal Planning Schemas**:
  - Contract established in [`docs/API_CONTRACT.md`](file:///c:/Coding/Tri%20City%20Hackathon/enterprise-ai-coordination-platform/docs/API_CONTRACT.md) for:
    - `POST /api/v1/projects/{project_id}/goals`
    - `POST /api/v1/ai/plan/generate`
    - `GET /api/v1/ai/plan-proposals/{proposal_id}`
    - `POST /api/v1/ai/plan-proposals/{proposal_id}/approve`
    - `POST /api/v1/ai/plan-proposals/{proposal_id}/reject`
  - Invariants: Consistent UUID identifiers, timezone-aware ISO 8601 UTC datetimes, validated numeric bounds, temporary task IDs (`temp_id`) in proposals, dependency references resolving to proposal task IDs, deterministic cycle detection, and strict separation between proposed plans and persisted task records.
- **Path Forward for Remaining Schemas**: Formulated through future OpenSpec change proposals.

---

### Decision 4: Database ORM and Migration Tool Adoption
- **Current Status**: **Accepted / Approved** (Phase 1 Finalization)
- **Approved Decision**:
  - **ORM / Query Layer**: **SQLAlchemy 2.x** using synchronous database access with **PyMySQL** for the initial MVP to reduce asynchronous-driver complexity.
  - **Execution Model**: FastAPI synchronous handlers (`def`) for blocking database operations, or explicit thread pool offloading (`run_in_threadpool`) if an asynchronous handler calls synchronous database code.
  - **Migrations**: **Alembic** for versioned, reproducible database migrations against MySQL 8.
  - **Rule**: MySQL 8 remains the primary relational source of truth. No speculative domain migrations during specification-only phases.

---

### Decision 5: Subscription Enforcement & MVP Scope
- **Current Status**: **Candidate / Demo Functionality / Unresolved**
- **Context**: The API inventory includes 4 subscription endpoints (`/subscriptions/plan`, `/subscriptions/usage`, `/subscriptions/entitlements`, `/subscriptions/upgrade-request`).
- **Options**:
  1. *Mock/Demo Entitlements*: Static database records simulating free vs. pro tier limits; no payment gateway integration. (Recommended for hackathon demo).
  2. *Full Integration (Stripe)*: Heavy implementation overhead; rejected for MVP.
  3. *Defer Subscriptions Entirely*: Remove from initial MVP demo.
- **Approval Required**: Member 2 (Project Owner).

---

### Decision 6: Optional Infrastructure Requirements for MVP
- **Current Status**: **Candidate / Unresolved**
- **Context**: Docker and Docker Compose are proposed for reproducible local development. Redis, MinIO, WebSockets, and reverse proxy remain deferred.
- **Options**:
  1. *Minimalist Local*: Run FastAPI directly with `uvicorn --reload` on port 12345 and MySQL 8 via local service or lightweight Docker container.
  2. *Full Docker Compose*: Orchestrate MySQL 8 and FastAPI in Compose.
- **Approval Required**: Full Team (Members 1, 2, 3).

---

### Decision 7: Blast-Radius Normalization Details & Weight Calibration
- **Current Status**: **Proposed Heuristic / Unvalidated**
- **Context**: $B = 100 \times (0.4D + 0.4T + 0.2R)$. Normalization ranges and weights ($0.4, 0.4, 0.2$) are illustrative.
- **Approval Required**: Member 2 (Project Owner).

---

### Decision 8: Backend Architecture Style (ADR 0002)
- **Current Status**: **Accepted / Approved** (Phase 1 Finalization)
- **Approved Decision**:
  - Formally accepted **ADR 0002: Modular Monolith Architecture** within one FastAPI application.
  - Clear module boundaries: `auth/`, `projects/`, `goals/`, `ai/`, `tasks/`, `recovery/`.
  - Microservices explicitly excluded for MVP.

---

### Decision 9: Antigravity Rules Directory Verification
- **Current Status**: **Resolved & Verified**
- **Audit Result**: Antigravity customization documentation (`agy-customizations`) confirms support for both `AGENTS.md` at root and `.agents/rules/*.md` (`.agents/rules/architecture-invariants.md`). Both established without discrepancy.

---

### Decision 10: Default Local Backend Port
- **Current Status**: **Decided & Locked**
- **Decision**: Port locked at **12345** (`http://localhost:12345`, API base: `http://localhost:12345/api/v1`, Android emulator: `http://10.0.2.2:12345/api/v1`). Configurable via environment variables for deployments, locked as default.

---

### Decision 11: Plan Proposal Staging & Atomic Persistence Lifecycle
- **Current Status**: **Accepted / Approved** (Phase 1 Finalization)
- **Approved Decision**:
  - **Lifecycle**: (1) Create Goal, (2) Generate and validate plan proposal, (3) Persist proposal in isolated `plan_proposals` table (zero rows written to `tasks`), (4) Retrieve proposal via dedicated endpoint `GET /api/v1/ai/plan-proposals/{proposal_id}`, (5) Approve (`POST /ai/plan-proposals/{proposal_id}/approve`) or Reject (`POST /ai/plan-proposals/{proposal_id}/reject`), (6) On approval, revalidate and atomically commit tasks and dependencies within a single MySQL transaction, (7) Verify committed state.
  - **Rollback Guarantee**: Transaction failure rolls back all task and dependency writes. Failed persistence never marks a proposal approved.
  - **Duplicate & Stale Guards**: Row lock prevents double-approval. Proposals expire after configurable TTL (default: **24 hours**). If parent goal is modified after proposal generation (`goal.updated_at > proposal.created_at`), approval is rejected with HTTP 409 Conflict.

---

### Decision 12: User Provisioning, Account Registration, and Email Verification Lifecycle
- **Current Status**: **Accepted & Implemented (Email Verification Lifecycle Complete; Outbound Provider Selection for Phase 3)**
- **Implemented Decision & Architecture**:
  - **Development Bootstrap**: Implemented an idempotent bootstrap utility (`src/core/bootstrap.py`) that provisions a demo lead user (`lead@revora.local`), sample project, and `LEAD` membership directly in MySQL without hardcoding production credentials or exposing secrets.
  - **Secure Token Hashing & Storage**: Registration generates high-entropy verification tokens; only the SHA-256 hex digest (`verification_token_hash`) is persisted. Raw tokens are never persisted or exposed in response payloads.
  - **Token Expiry & Single-Use Enforcement**: Tokens expire after 24 hours (`verification_token_expires_at`). Replay or re-verification attempts are rejected with `HTTP 409 Conflict` using `verification_token_consumed_at`.
  - **Mandatory Login Gate**: Unverified accounts are strictly barred from logging in (`POST /api/v1/auth/login` returns `HTTP 403 Forbidden` with code `FORBIDDEN`). Seeded demo accounts remain pre-verified.
  - **Rate-Limited Resend**: `POST /api/v1/auth/resend-verification` enforces a 60-second database-backed cooldown and daily attempt ceiling directly in MySQL without requiring Redis (`HTTP 429 Too Many Requests`).
  - **Verification Endpoint**: `POST /api/v1/auth/verify-email` validates the presented token hash, updates `is_verified = True`, records consumption, and enables subsequent login.
  - **Pluggable Delivery Interface**: Abstract `EmailDeliveryProvider` with `UnconfiguredEmailProvider` as the production default and `DevInMemoryEmailSink` for automated tests and development workflows.
- **Unresolved Production Scope (Phase 3)**: Selection of outbound transactional email delivery service (AWS SES, SendGrid, Resend, or SMTP) and enterprise admin provisioning endpoints (`POST /api/v1/users`).



