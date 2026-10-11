# Spec Delta: Goal-to-Task Planning

## Purpose
Provides an AI-assisted operational planning pipeline that translates high-level engineering directives into structured, validated, dependency-aware tasks with explicit human review and atomic persistence.

## ADDED Requirements

### Requirement: Operational Goal Submission
The system SHALL allow an authenticated team lead to submit an operational goal for an existing project via the shared REST API (`POST /api/v1/projects/{project_id}/goals`). The system SHALL validate that the requesting user holds lead permissions for the project and that required goal attributes (title, target timeline, description) are provided.

#### Scenario: Successful operational goal submission
- **WHEN** an authenticated team lead submits a valid goal payload with a non-empty title and target timeline for an active project
- **THEN** the system validates the payload, persists the goal record in MySQL 8, and returns the created goal with status `PENDING_PLANNING`

#### Scenario: Unauthorized user submits goal
- **WHEN** an authenticated user who is not a designated team lead or project administrator submits a goal creation request
- **THEN** the system rejects the request with an HTTP 403 Forbidden response using the standard error envelope and creates no persistent records

#### Scenario: Missing or malformed goal attributes
- **WHEN** a client submits a goal request missing mandatory fields or containing invalid data types
- **THEN** the system rejects the request with an HTTP 422 Unprocessable Entity response detailing the validation errors in the standard error envelope

---

### Requirement: AI-Orchestrated Structured Plan Generation & Isolated Staging
The system SHALL provide an endpoint (`POST /api/v1/ai/plan/generate`) to generate a structured task-plan proposal from an approved goal using the configured hosted LLM. The system SHALL store the resulting plan in an isolated `plan_proposals` table with a unique `proposal_id` (UUID), storing the structured plan payload as JSON. The system SHALL NOT insert records into `tasks` or `task_dependencies` during generation or staging.

#### Scenario: Successful plan generation and staging
- **WHEN** an authorized lead requests plan generation for an existing goal and the hosted LLM returns valid structured JSON
- **THEN** the system creates a proposal record in `plan_proposals` with status `VALIDATED`, links it to the goal, and returns the proposal with its unique `proposal_id`

#### Scenario: Hosted LLM timeout or upstream failure
- **WHEN** the hosted LLM API encounters a timeout, network failure, or rate limit during plan generation
- **THEN** the system catches the upstream error, logs the failure, and returns an HTTP 502 Bad Gateway or 504 Gateway Timeout error with standard error envelope without staging a proposal or modifying project state

#### Scenario: Malformed LLM output rejected
- **WHEN** the hosted LLM returns unstructured text or output that fails Pydantic schema validation
- **THEN** the backend rejects the output, flags a plan generation schema error, and does not stage an invalid proposal

---

### Requirement: Deterministic Plan and Dependency Validation
The backend SHALL deterministically validate all LLM-generated plan proposals prior to staging them as `VALIDATED`. The validation logic SHALL verify that proposed dependencies form a directed acyclic graph (DAG) containing zero cycles, all task duration estimates are within positive bounds, and all referenced task dependencies exist within the proposal.

#### Scenario: Dependency cycle detected in proposal
- **WHEN** an LLM-generated proposal contains a circular dependency chain between tasks (e.g., Task A depends on Task B which depends on Task A)
- **THEN** the deterministic validation engine detects the cycle, rejects the proposal, and logs the validation failure

#### Scenario: Valid acyclic proposal passes deterministic checks
- **WHEN** an LLM-generated proposal contains only valid acyclic dependency chains, positive durations, and required attributes
- **THEN** the backend stages the proposal status as `VALIDATED` and returns the structured plan to the client for human review

---

### Requirement: Plan Proposal Identification, Retrieval, and Stale State Guard
The system SHALL provide a dedicated retrieval endpoint (`GET /api/v1/ai/plan-proposals/{proposal_id}`) allowing clients to retrieve the staged proposal by its `proposal_id`. The system SHALL guard against stale or expired proposals: if the parent goal or project timeline is modified after the proposal was generated (`goal.updated_at > proposal.created_at`) or if the proposal exceeds its configurable validity duration (default: 24 hours), the proposal SHALL be marked `STALE` and barred from approval.

#### Scenario: Client retrieves active proposal for review
- **WHEN** an authorized team member queries the proposal via `GET /api/v1/ai/plan-proposals/{proposal_id}`
- **THEN** the system returns the proposal record containing status, tasks breakdown, and dependency graph

#### Scenario: Approval rejected for stale proposal
- **WHEN** a team lead attempts to approve a proposal whose parent goal was modified after the proposal was generated or whose TTL expired
- **THEN** the system rejects the approval with an HTTP 409 Conflict error with code `PROPOSAL_STALE` stating the proposal must be regenerated

---

### Requirement: Dedicated Human-in-the-Loop Decision Operations
The system SHALL provide dedicated endpoints to approve (`POST /api/v1/ai/plan-proposals/{proposal_id}/approve`) or reject (`POST /api/v1/ai/plan-proposals/{proposal_id}/reject`) a staged proposal. Rejection SHALL update the proposal status to `REJECTED`, record optional notes, and create zero task rows. Approval of an already-processed or invalid proposal SHALL be rejected idempotently with HTTP 409 Conflict.

#### Scenario: Team lead rejects plan proposal
- **WHEN** an authorized team lead submits a rejection request via `POST /api/v1/ai/plan-proposals/{proposal_id}/reject`
- **THEN** the system transitions the proposal status to `REJECTED`, records any rejection feedback, and creates zero task records

#### Scenario: Duplicate or concurrent decision attempts
- **WHEN** a client submits an approval or rejection for a proposal that is not in `VALIDATED` status (e.g., already `APPROVED` or `REJECTED`)
- **THEN** the system rejects the operation with an HTTP 409 Conflict response without mutating state

#### Scenario: Unauthorized user attempts decision
- **WHEN** a user without lead permissions attempts to approve or reject a plan proposal
- **THEN** the system returns an HTTP 403 Forbidden response and leaves proposal state unchanged

---

### Requirement: Atomic Task and Dependency Persistence
Upon explicit approval of a `VALIDATED` proposal via `POST /api/v1/ai/plan-proposals/{proposal_id}/approve`, the backend SHALL execute an atomic database transaction in MySQL 8 that: (1) locks and verifies the proposal, (2) creates all task records in `tasks`, (3) maps temporary proposal task identifiers to generated database task UUIDs, (4) creates all dependency records in `task_dependencies`, (5) updates the proposal status to `APPROVED`, and (6) updates the goal status to `PLANNED`. If any step fails, the transaction SHALL roll back completely and the proposal SHALL NOT be marked approved.

#### Scenario: Successful atomic persistence of tasks and dependencies
- **WHEN** an authorized team lead approves a validated proposal containing N tasks and M dependencies
- **THEN** the backend executes an atomic transaction persisting all N tasks and M dependencies, verifies persisted records match the proposal, and returns HTTP 200 OK with the generated task identifiers

#### Scenario: Transaction failure triggers complete rollback
- **WHEN** a database constraint violation, connection disruption, or verification mismatch occurs during task persistence
- **THEN** the backend transaction rolls back completely, ensuring zero partial or orphaned tasks are persisted, leaves proposal state unchanged or flagged `PERSISTENCE_FAILED`, and returns an HTTP 500 Internal Server Error
