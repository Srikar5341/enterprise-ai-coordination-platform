# Shared REST API Contract

---

## 1. Overview & Status

- **Status**: **Proposed** (None implemented)
- **Total Route Inventory**: **62 endpoints** (expanded from 59 with approved proposal lifecycle routes)
- **Default Local Backend Port**: **12345** (configurable for deployment environments, locked default)
- **Default Local Backend Base**: `http://localhost:12345`
- **Versioned API Base**: `http://localhost:12345/api/v1`
- **FastAPI Documentation**: `http://localhost:12345/docs`
- **OpenAPI Specification**: `http://localhost:12345/openapi.json`
- **Android Emulator API Base**: `http://10.0.2.2:12345/api/v1`
- **Base Route Prefix**: `/api/v1`
- **Specification Source of Truth**: Both the React web client and the Android Kotlin client will consume the FastAPI-generated OpenAPI specification once endpoints are defined and implemented in code.

---

## 2. Approved Cross-Cutting Standards

### A. Authentication & Authorization (Approved)
- **Transport**: `Authorization: Bearer <access_token>` header.
- **Tokens**:
  - Access Token: JWT with configurable default lifetime of **15 minutes**.
  - Refresh Token: Secure random opaque token stored in MySQL with configurable default lifetime of **7 days**.
- **Lifecycle**:
  - Refresh tokens are rotated upon use; previous tokens are immediately invalidated.
  - Logout explicitly revokes the active refresh token.
  - Signing secrets and encryption keys are strictly loaded from environment variables (`.env`), never checked into source control.
- **Backend Authority**:
  - Sensitive operations (goal creation, plan generation, proposal approval/rejection) verify the authenticated user's active project membership and permissions against the database on each request.
  - The backend never relies solely on embedded claims in the access token for authorization.
- **Unresolved Auth Scope**: Account self-registration and public provisioning workflows are **UNRESOLVED**; only pre-provisioned user authentication is in scope.

### B. Standard API Error Envelope (Approved)
All client-visible errors must conform to the unified structured envelope:
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message describing the failure condition",
    "details": null
  }
}
```
- **Fields**:
  - `code`: Uppercase snake_case machine-readable identifier (e.g., `VALIDATION_ERROR`, `PROPOSAL_NOT_FOUND`, `PROPOSAL_STALE`, `PROPOSAL_ALREADY_PROCESSED`, `FORBIDDEN_PROJECT_ACCESS`).
  - `message`: User-friendly, safe description. Stack traces, secrets, and internal SQL errors are never exposed.
  - `details`: Safe structured context (e.g., field-level validation errors array) or `null` when no additional context is applicable.
- **HTTP Status Code Conventions**:
  - `400 Bad Request`: Malformed syntax or illegal request parameters.
  - `401 Unauthorized`: Missing or invalid Bearer JWT token.
  - `403 Forbidden`: Authenticated user lacks required project role or permissions.
  - `404 Not Found`: Target resource does not exist.
  - `409 Conflict`: Business state conflict (e.g., proposal already approved, stale proposal).
  - `422 Unprocessable Entity`: Schema/field validation failure.
  - `500 Internal Server Error`: Server failure (with atomic rollback guarantee).
  - `502 Bad Gateway / 504 Gateway Timeout`: Upstream hosted LLM provider failure or timeout.

---

## 3. Proposed Route Inventory (62 Endpoints)

### Authentication (4 endpoints)
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`

### Users and Teams (10 endpoints)
- `GET /api/v1/users`
- `GET /api/v1/users/{user_id}`
- `PATCH /api/v1/users/{user_id}`
- `GET /api/v1/teams`
- `POST /api/v1/teams`
- `GET /api/v1/teams/{team_id}`
- `PATCH /api/v1/teams/{team_id}`
- `GET /api/v1/teams/{team_id}/members`
- `POST /api/v1/teams/{team_id}/members`
- `PATCH /api/v1/teams/{team_id}/members/{user_id}`

### Projects and Goals (8 endpoints)
- `GET /api/v1/projects`
- `POST /api/v1/projects`
- `GET /api/v1/projects/{project_id}`
- `PATCH /api/v1/projects/{project_id}`
- `GET /api/v1/projects/{project_id}/goals`
- `POST /api/v1/projects/{project_id}/goals`
- `GET /api/v1/goals/{goal_id}`
- `PATCH /api/v1/goals/{goal_id}`

### Tasks and Dependencies (9 endpoints)
- `GET /api/v1/tasks`
- `POST /api/v1/tasks`
- `GET /api/v1/tasks/{task_id}`
- `PATCH /api/v1/tasks/{task_id}`
- `DELETE /api/v1/tasks/{task_id}`
- `GET /api/v1/tasks/{task_id}/dependencies`
- `POST /api/v1/tasks/{task_id}/dependencies`
- `DELETE /api/v1/tasks/{task_id}/dependencies/{dependency_id}`
- `POST /api/v1/tasks/{task_id}/blockers`

### AI Planning (6 endpoints — 3 existing + 3 approved proposal lifecycle)
- `POST /api/v1/ai/plan/generate`
- `GET /api/v1/ai/plan-proposals/{proposal_id}` *(Approved dedicated retrieval endpoint)*
- `POST /api/v1/ai/plan-proposals/{proposal_id}/approve` *(Approved dedicated approval endpoint)*
- `POST /api/v1/ai/plan-proposals/{proposal_id}/reject` *(Approved dedicated rejection endpoint)*
- `POST /api/v1/ai/plan/explain`
- `POST /api/v1/ai/assist-task` *(optional, future or separately approved functionality)*

### Allocation (3 endpoints)
- `GET /api/v1/allocation/eligible`
- `POST /api/v1/allocation/recommend`
- `POST /api/v1/allocation/validate`

### Recovery (9 endpoints)
- `POST /api/v1/recovery/analyze`
- `POST /api/v1/recovery/options`
- `POST /api/v1/recovery-plans`
- `GET /api/v1/recovery-plans`
- `GET /api/v1/recovery-plans/{plan_id}`
- `PATCH /api/v1/recovery-plans/{plan_id}`
- `POST /api/v1/recovery-plans/{plan_id}/approve`
- `POST /api/v1/recovery-plans/{plan_id}/execute`
- `POST /api/v1/recovery-plans/{plan_id}/cancel`

### Notifications and Reminders (7 endpoints)
- `GET /api/v1/notifications`
- `GET /api/v1/notifications/unread-count`
- `PATCH /api/v1/notifications/{notification_id}`
- `GET /api/v1/reminders`
- `POST /api/v1/reminders`
- `PATCH /api/v1/reminders/{reminder_id}`
- `DELETE /api/v1/reminders/{reminder_id}`

### Subscriptions (4 endpoints)
- `GET /api/v1/subscriptions/plan`
- `GET /api/v1/subscriptions/usage`
- `GET /api/v1/subscriptions/entitlements`
- `POST /api/v1/subscriptions/upgrade-request` *(optional demo functionality)*

### Health and Audit (2 endpoints)
- `GET /api/v1/health`
- `GET /api/v1/audit-events` *(optional restricted functionality)*

---

## 4. Approved Schemas: Goal-to-Task Planning

### A. Goal Ingestion (`POST /api/v1/projects/{project_id}/goals`)
- **Request Body**:
  ```json
  {
    "title": "Friday Production Release v2.4",
    "description": "Prepare, test, and execute deployment for version 2.4",
    "target_date": "2026-10-16T18:00:00Z"
  }
  ```
- **Validation**:
  - `title`: String, min 3, max 255 chars, non-empty.
  - `description`: String, optional, max 4000 chars.
  - `target_date`: Timezone-aware ISO 8601 UTC datetime. Must be in the future.
- **Response (201 Created)**:
  ```json
  {
    "id": "c7a8b3f4-1234-4567-89ab-cdef01234567",
    "project_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "title": "Friday Production Release v2.4",
    "description": "Prepare, test, and execute deployment for version 2.4",
    "target_date": "2026-10-16T18:00:00Z",
    "status": "PENDING_PLANNING",
    "created_at": "2026-10-11T04:30:00Z",
    "updated_at": "2026-10-11T04:30:00Z"
  }
  ```

### B. Plan Generation & Staging (`POST /api/v1/ai/plan/generate`)
- **Request Body**:
  ```json
  {
    "goal_id": "c7a8b3f4-1234-4567-89ab-cdef01234567",
    "additional_instructions": "Prioritize database migration safety and rollback testing"
  }
  ```
- **Response (201 Created)**:
  ```json
  {
    "proposal_id": "e8d9c0b1-2345-6789-01ab-cdef23456789",
    "goal_id": "c7a8b3f4-1234-4567-89ab-cdef01234567",
    "project_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "status": "VALIDATED",
    "tasks": [
      {
        "temp_id": "T1",
        "title": "Execute staging database migration test",
        "description": "Run Alembic upgrade and downgrade against isolated replica",
        "estimated_hours": 3.0,
        "required_skills": ["Database", "SQL"]
      },
      {
        "temp_id": "T2",
        "title": "Deploy API service to staging",
        "description": "Deploy backend container on staging environment and run health check",
        "estimated_hours": 2.0,
        "required_skills": ["DevOps", "FastAPI"]
      }
    ],
    "dependencies": [
      {
        "prerequisite_temp_id": "T1",
        "dependent_temp_id": "T2"
      }
    ],
    "created_at": "2026-10-11T04:31:00Z",
    "expires_at": "2026-10-12T04:31:00Z"
  }
  ```

### C. Proposal Retrieval (`GET /api/v1/ai/plan-proposals/{proposal_id}`)
- **Response (200 OK)**: Identical payload to plan generation above, reflecting current status (`VALIDATED`, `APPROVED`, `REJECTED`, or `STALE`).

### D. Proposal Approval (`POST /api/v1/ai/plan-proposals/{proposal_id}/approve`)
- **Request Body**: `{}` (Empty JSON object; authorized user identity derived from Bearer token).
- **Behavior**: Executes single atomic MySQL transaction:
  1. Row-lock check `WHERE id = :proposal_id AND status = 'VALIDATED'`.
  2. Stale checks (`goal.updated_at <= proposal.created_at` and `NOW() <= proposal.expires_at`).
  3. Inserts all tasks into `tasks`, mapping `temp_id` to generated database UUIDs.
  4. Inserts all dependencies into `task_dependencies` using mapped database UUIDs.
  5. Updates `plan_proposals.status = 'APPROVED'` and `goals.status = 'PLANNED'`.
  6. Commits transaction (or rolls back completely on any error).
- **Response (200 OK)**:
  ```json
  {
    "proposal_id": "e8d9c0b1-2345-6789-01ab-cdef23456789",
    "goal_id": "c7a8b3f4-1234-4567-89ab-cdef01234567",
    "status": "APPROVED",
    "created_tasks_count": 2,
    "created_dependencies_count": 1,
    "task_ids": [
      "b2c3d4e5-f6a7-8901-bcde-f01234567891",
      "c3d4e5f6-a7b8-9012-cdef-012345678912"
    ]
  }
  ```

### E. Proposal Rejection (`POST /api/v1/ai/plan-proposals/{proposal_id}/reject`)
- **Request Body**:
  ```json
  {
    "notes": "Scope is too broad; split into separate database and application releases"
  }
  ```
- **Behavior**: Transitions proposal status to `REJECTED`. Creates zero task records.
- **Response (200 OK)**:
  ```json
  {
    "proposal_id": "e8d9c0b1-2345-6789-01ab-cdef23456789",
    "goal_id": "c7a8b3f4-1234-4567-89ab-cdef01234567",
    "status": "REJECTED",
    "notes": "Scope is too broad; split into separate database and application releases"
  }
  ```

### F. SaaS Subscriptions & Usage Accounting

#### 1. Retrieve Subscription Plan (`GET /api/v1/subscriptions/plan?project_id={project_id}`)
- **Security**: Bearer JWT; requires project membership.
- **Response (200 OK)**:
  ```json
  {
    "project_id": "proj-123",
    "plan_tier": "FREE",
    "status": "ACTIVE",
    "current_period_start": "2026-10-11T08:00:00Z",
    "current_period_end": "2026-11-10T08:00:00Z"
  }
  ```

#### 2. Retrieve Periodic Usage (`GET /api/v1/subscriptions/usage?project_id={project_id}`)
- **Security**: Bearer JWT; requires project membership.
- **Response (200 OK)**:
  ```json
  {
    "project_id": "proj-123",
    "plan_tier": "FREE",
    "metric": "ai_plan_generations",
    "used": 12,
    "limit": 20,
    "remaining": 8,
    "utilization_percent": 60.0,
    "period_start": "2026-10-11T08:00:00Z",
    "period_end": "2026-11-10T08:00:00Z"
  }
  ```

#### 3. Retrieve Tier Entitlements (`GET /api/v1/subscriptions/entitlements?tier={tier}`)
- **Response (200 OK)**:
  ```json
  {
    "plan_tier": "FREE",
    "display_name": "Free Community Tier",
    "max_projects": 2,
    "max_team_members": 5,
    "max_ai_generations_per_month": 20,
    "ai_rate_limit_per_minute": 3,
    "features": ["ai_planning_basic", "kanban_board", "standard_notifications"]
  }
  ```

#### 4. Request Plan Upgrade (`POST /api/v1/subscriptions/upgrade-request`)
- **Security**: Bearer JWT; requires project `LEAD` or `ADMIN`.
- **Request Body**:
  ```json
  {
    "project_id": "proj-123",
    "requested_tier": "TEAM"
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "project_id": "proj-123",
    "plan_tier": "TEAM",
    "status": "ACTIVE",
    "message": "Plan successfully updated to TEAM",
    "current_period_start": "2026-10-11T08:00:00Z",
    "current_period_end": "2026-11-10T08:00:00Z"
  }
  ```

#### 5. Quota & Rate Limit Error Envelopes (HTTP 429)
- **Monthly Quota Exceeded**:
  ```json
  {
    "error": {
      "code": "QUOTA_EXCEEDED",
      "message": "Monthly AI plan generation quota of 20 reached for 'FREE' plan. Please upgrade your subscription tier.",
      "details": {
        "plan_tier": "FREE",
        "limit": 20,
        "used": 20,
        "metric": "ai_plan_generations"
      }
    }
  }
  ```
- **Burst Rate Limit Exceeded**:
  ```json
  {
    "error": {
      "code": "RATE_LIMIT_EXCEEDED",
      "message": "Rate limit exceeded: maximum 3 AI requests per minute allowed for FREE plan. Please retry in 42 seconds.",
      "details": {
        "plan_tier": "FREE",
        "limit_per_minute": 3,
        "retry_after_seconds": 42
      }
    }
  }
  ```

---


## 5. OpenAPI Integration Workflow

1. Backend endpoints will define Pydantic request and response schemas in Python (`backend/src/`).
2. FastAPI will automatically compile and expose the OpenAPI specification at `http://localhost:12345/openapi.json` and interactive Swagger docs at `http://localhost:12345/docs`.
3. Client leads (Web and Android) will consume the generated OpenAPI schemas to drive API client generation and type bindings.
4. Schema updates must follow the spec-driven OpenSpec process prior to backend code implementation.
