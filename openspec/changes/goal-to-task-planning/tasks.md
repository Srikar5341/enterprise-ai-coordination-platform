# Tasks: Goal-to-Task Planning

## 1. Prerequisites & Schema Definitions

- [x] 1.1 Codify Pydantic request and response models in `backend/src/domains/goals/schemas.py` and `backend/src/domains/ai/schemas.py` matching the approved contract in `docs/API_CONTRACT.md`, verified by python type-checking.
- [x] 1.2 Implement the approved standard error envelope handler `{"error":{"code":"...","message":"...","details":...}}` and Bearer JWT authentication dependencies verifying project lead permissions against MySQL, verified by authentication unit tests.

## 2. Persistence Layer & Database Models

- [x] 2.1 Define synchronous SQLAlchemy 2.x models for `goals`, `plan_proposals`, `tasks`, and `task_dependencies` using PyMySQL and generate the initial Alembic migration script in `backend/alembic/`, verified by executing `alembic upgrade head` against local MySQL 8.
- [x] 2.2 Implement the proposal persistence service executing an atomic MySQL transaction that locks the proposal, inserts tasks, translates temporary IDs to database UUIDs, inserts dependencies, marks the proposal `APPROVED`, and rolls back completely on any failure, verified by unit tests asserting zero records written on rollback.

## 3. AI Orchestration & Deterministic Validation

- [x] 3.1 Implement the deterministic DAG validation service (cycle detection using Kahn's algorithm, duration bounds, and proposal reference validation), verified by unit tests covering cyclic and acyclic graphs.
- [x] 3.2 Implement the hosted LLM prompt orchestration service formatting goal context and parsing structured JSON output into validated proposal schemas, verified with mocked provider response tests.
- [x] 3.3 Implement error handling for LLM timeouts, network interruptions, and malformed outputs, verified by unit tests asserting HTTP 502/504 structured error envelopes.

## 4. Shared FastAPI Route Implementation (Port 12345)

- [x] 4.1 Implement `POST /api/v1/projects/{project_id}/goals` with project lead authorization checks, verified by automated tests confirming HTTP 201 for valid leads and HTTP 403 for unauthorized users.
- [x] 4.2 Implement `POST /api/v1/ai/plan/generate` generating and staging validated proposals in `plan_proposals`, verified by API tests returning HTTP 201 with `proposal_id` on `http://localhost:12345/api/v1`.
- [x] 4.3 Implement dedicated proposal retrieval `GET /api/v1/ai/plan-proposals/{proposal_id}`, verified by API tests returning the complete proposal structure and status.
- [x] 4.4 Implement dedicated approval `POST /api/v1/ai/plan-proposals/{proposal_id}/approve` executing the atomic commit transaction, enforcing row locks against duplicate approvals, and rejecting stale proposals with HTTP 409 Conflict, verified by integration tests.
- [x] 4.5 Implement dedicated rejection `POST /api/v1/ai/plan-proposals/{proposal_id}/reject` transitioning proposal status to `REJECTED` and writing zero task rows, verified by API tests.
- [x] 4.6 Verify FastAPI OpenAPI schema generation at `http://localhost:12345/openapi.json` and interactive docs at `http://localhost:12345/docs`.

## 5. Client Integration Verification

- [x] 5.1 Verify React web client API contracts against the generated OpenAPI specification for local backend at `http://localhost:12345/api/v1`.
- [x] 5.2 Verify Android Retrofit client models against the OpenAPI specification for Android emulator mapping at `http://10.0.2.2:12345/api/v1`.
