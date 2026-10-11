# Design: Goal-to-Task Planning

## Context
See [`proposal.md`](file:///c:/Coding/Tri%20City%20Hackathon/enterprise-ai-coordination-platform/openspec/changes/goal-to-task-planning/proposal.md) for business motivation and [`specs/goal-to-task-planning/spec.md`](file:///c:/Coding/Tri%20City%20Hackathon/enterprise-ai-coordination-platform/openspec/changes/goal-to-task-planning/specs/goal-to-task-planning/spec.md) for behavioral requirements.

The backend is built with Python and FastAPI within an approved **Modular Monolith** architecture (ADR 0002), bound locally to locked port **12345** (`http://localhost:12345/api/v1`). Clients (React on Web, Kotlin Compose on Android) consume endpoints exclusively through this shared interface using Bearer JWT authentication and the standard structured error envelope. The LLM serves solely as an assistive plan generator; all authorization, schema validation, dependency integrity checks, and database mutations are governed deterministically by backend services.

---

## Goals / Non-Goals

### Goals
- Establish clean FastAPI service boundaries within the modular monolith for goals, AI prompt orchestration, plan proposals, and tasks.
- Enforce strict structured JSON extraction from the hosted LLM using Pydantic models.
- Implement deterministic cycle detection (topological sort / Kahn's algorithm) for proposed task dependencies.
- Provide a robust human-in-the-loop review barrier ensuring unapproved tasks are never committed to MySQL 8.
- Dedicated REST endpoints for proposal retrieval, approval, and rejection (`/api/v1/ai/plan-proposals/...`).
- Guarantee atomic persistence of approved tasks and dependencies within an isolated database transaction using synchronous SQLAlchemy 2.x + PyMySQL.
- Explicitly handle duplicate submissions, stale/expired proposals, and transaction failures.

### Non-Goals
- Microservices, message queues, or distributed caches (rejected for MVP).
- Autonomous code generation or unconstrained task execution agents.
- Complex vector retrieval (RAG); goal prompts fit directly into LLM context windows.
- Public user self-registration workflows.

---

## Technical Architecture & Lifecycle

### 1. Plan Staging Model (`plan_proposals` table)
To avoid polluting `tasks` and `task_dependencies` with draft or rejected work items, unapproved proposals are staged in a dedicated table:

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | VARCHAR(36) / CHAR(36) | Primary Key UUID for the proposal |
| `goal_id` | VARCHAR(36) | Foreign Key -> `goals.id` |
| `project_id` | VARCHAR(36) | Foreign Key -> `projects.id` |
| `status` | ENUM | `GENERATED`, `VALIDATED`, `APPROVED`, `REJECTED`, `STALE`, `PERSISTENCE_FAILED` |
| `plan_payload` | JSON | Structured payload containing tasks (`temp_id`, `title`, `duration`, `skills`) and dependencies (`prereq_temp_id`, `dependent_temp_id`) |
| `created_by` | VARCHAR(36) | Foreign Key -> `users.id` (initiator) |
| `created_at` | DATETIME | Timestamp of proposal generation (UTC) |
| `expires_at` | DATETIME | Generation timestamp + configurable TTL (default: 24 hours) |
| `reviewed_by` | VARCHAR(36) | Foreign Key -> `users.id` (nullable, reviewer) |
| `reviewed_at` | DATETIME | Timestamp of review decision (nullable, UTC) |
| `rejection_notes` | TEXT | Optional feedback notes if rejected (nullable) |

### 2. Dedicated Proposal Lifecycle Endpoints (Approved Approach 2)
The API exposes dedicated routes for managing plan proposals:
- `POST /api/v1/ai/plan/generate`: Accepts `{ goal_id, additional_instructions }`, prompts LLM, validates DAG acyclicity, saves record in `plan_proposals` with status `VALIDATED`, and returns HTTP 201 with `proposal_id`.
- `GET /api/v1/ai/plan-proposals/{proposal_id}`: Retrieves the active staged proposal for review by team leads across web or Android.
- `POST /api/v1/ai/plan-proposals/{proposal_id}/approve`: Validates lead authorization, executes the atomic persistence transaction, and returns HTTP 200 with generated task IDs.
- `POST /api/v1/ai/plan-proposals/{proposal_id}/reject`: Accepts optional `{ notes }`, marks proposal `REJECTED`, and returns HTTP 200 without creating any task rows.

### 3. Atomic Single-Transaction Persistence Flow
When `POST /api/v1/ai/plan-proposals/{proposal_id}/approve` is called, the backend executes the following atomic database transaction using synchronous SQLAlchemy 2.x:
```python
with session.begin():
    # 1. Lock and inspect proposal state
    proposal = session.query(PlanProposal).filter(
        PlanProposal.id == proposal_id,
        PlanProposal.status == ProposalStatus.VALIDATED
    ).with_for_update().first()
    
    if not proposal:
        raise ConflictException(code="PROPOSAL_ALREADY_PROCESSED", message="Proposal has already been processed or is not in valid state")
    
    # 2. Verify stale conditions
    goal = session.query(Goal).filter(Goal.id == proposal.goal_id).first()
    now_utc = datetime.now(timezone.utc)
    if goal.updated_at > proposal.created_at or now_utc > proposal.expires_at:
        proposal.status = ProposalStatus.STALE
        session.commit()
        raise ConflictException(code="PROPOSAL_STALE", message="Goal was modified after plan generation or proposal expired. Please regenerate.")
    
    # 3. Insert tasks and map temporary IDs
    id_mapping = {}  # temp_id -> db_uuid
    for t in proposal.plan_payload["tasks"]:
        db_task_id = str(uuid.uuid4())
        id_mapping[t["temp_id"]] = db_task_id
        session.add(Task(
            id=db_task_id,
            project_id=proposal.project_id,
            goal_id=proposal.goal_id,
            title=t["title"],
            description=t["description"],
            estimated_hours=t["estimated_hours"],
            required_skills=t.get("required_skills", []),
            status="OPEN"
        ))
    
    # 4. Insert dependencies using mapped UUIDs
    for dep in proposal.plan_payload["dependencies"]:
        session.add(TaskDependency(
            id=str(uuid.uuid4()),
            task_id=id_mapping[dep["dependent_temp_id"]],
            prerequisite_task_id=id_mapping[dep["prerequisite_temp_id"]]
        ))
    
    # 5. Finalize proposal and goal states
    proposal.status = ProposalStatus.APPROVED
    proposal.reviewed_by = current_user.id
    proposal.reviewed_at = now_utc
    goal.status = GoalStatus.PLANNED
```
If an exception occurs at any point during steps 1–5, the `session.begin()` context manager automatically triggers `ROLLBACK;`, guaranteeing zero orphaned rows.

### 4. Database Access Pattern: Synchronous SQLAlchemy 2.x with PyMySQL
- **Driver**: Synchronous `mysql+pymysql://` connection engine.
- **FastAPI Execution**: Database-bound endpoints are defined as standard synchronous functions (`def endpoint(...)`), allowing FastAPI to automatically manage them within external worker threads (`run_in_threadpool`), avoiding event-loop blocking while eliminating async-driver complexity for the initial MVP.

### 5. Authentication & Authorization Enforcement
- Endpoints inject `current_user = Depends(get_current_active_user)`.
- Sensitive operations invoke `verify_project_role(project_id, current_user.id, allowed_roles=[ProjectRole.LEAD, ProjectRole.ADMIN])` querying the database directly. Role claims in the JWT token are treated as advisory and never trusted as the sole authorization authority.

---

## Decisions (Approved in Phase 1 Finalization)

- **Decision 1 (Auth)**: Bearer JWT (15-min access, 7-day refresh rotated/revocable in MySQL). Project membership verified on backend.
- **Decision 2 (Error Envelope)**: Structured format `{"error": {"code": "...", "message": "...", "details": null}}`.
- **Decision 3 (Schemas)**: Goal and Proposal schemas codified in `docs/API_CONTRACT.md`.
- **Decision 4 (Database Tooling)**: SQLAlchemy 2.x (Sync + PyMySQL) + Alembic migrations.
- **Decision 8 (Architecture)**: ADR 0002 Modular Monolith accepted.
- **Decision 11 (Proposal Lifecycle)**: Dedicated routes (`/ai/plan-proposals/{id}/...`), isolated `plan_proposals` table, 24h default TTL, atomic persistence transaction.

---

## Risks / Trade-offs

- **[LLM Hallucination / Cyclic Dependencies]** → *Mitigation*: Deterministic Kahn's algorithm cycle check flags and rejects invalid graphs before staging.
- **[LLM API Latency / Provider Outage]** → *Mitigation*: Asynchronous HTTP timeout handling with clear HTTP 502/504 error envelopes.
- **[Partial Persistence Failure]** → *Mitigation*: Atomic transaction committing all tasks and dependencies simultaneously with automatic rollback on error.
- **[Concurrent Double Approval]** → *Mitigation*: Row locking `with_for_update()` on proposal returning HTTP 409 Conflict.
- **[Stale Plan Approval]** → *Mitigation*: Revalidation of `goal.updated_at <= proposal.created_at` and TTL checks.

---

## Migration Plan
1. Schema migration via Alembic introducing tables: `goals`, `plan_proposals`, `tasks`, and `task_dependencies`.
2. Initial seed script for demo teams, users, and projects.
3. Rollback strategy: Dropping new tables or applying reversible down-migrations via Alembic.
