# Proposal: Goal-to-Task Planning

## Why
Engineering delivery teams struggle to quickly translate high-level operational instructions into structured, dependency-aware work items during critical milestones (such as the Friday production release demo scenario). Providing an AI-assisted goal-to-task planning pipeline enables leads to rapidly transform operational directives into structured task plans while preserving deterministic validation, safety guardrails, and explicit human sign-off before state persistence.

## What Changes
- **Operational Goal Ingestion**: Allows authorized team leads to submit operational goals for a project under `POST /api/v1/projects/{project_id}/goals`.
- **AI Task-Plan Generation**: Backend orchestrates hosted LLM prompts to synthesize a structured task breakdown with proposed dependencies via `POST /api/v1/ai/plan/generate`.
- **Isolated Proposal Staging**: Generated proposals are staged in an isolated `plan_proposals` table (holding structured JSON payload and validation state) without creating premature task records in `tasks`.
- **Deterministic Plan Validation**: Application logic validates the LLM output (verifying Pydantic schemas, acyclic graph structure, reasonable task durations, and missing contextual prerequisites) before returning the staged proposal.
- **Dedicated Proposal Lifecycle Operations**:
  - `GET /api/v1/ai/plan-proposals/{proposal_id}`: Retrieves the active staged proposal for review.
  - `POST /api/v1/ai/plan-proposals/{proposal_id}/approve`: Approves the proposal, revalidates preconditions, and triggers atomic single-transaction persistence into `tasks` and `task_dependencies`.
  - `POST /api/v1/ai/plan-proposals/{proposal_id}/reject`: Explicitly rejects the proposal with optional feedback notes; creates zero task records.
- **Atomic Single-Transaction Persistence**: Upon approval, backend services execute an atomic transaction translating staged task definitions and dependencies into durable MySQL records (`tasks` and `task_dependencies`), guaranteeing full rollback on failure and preventing duplicate/stale approvals.
- **Guardrail Enforcement**: Prevents autonomous database mutations; unapproved proposals are never persisted.

## Capabilities

### New Capabilities
- `goal-to-task-planning`: Covers operational goal intake, user authorization, LLM plan generation, isolated proposal staging, deterministic plan validation, dedicated human acceptance/rejection endpoints, and atomic persistence of accepted tasks and dependencies.

### Modified Capabilities
*(None: Initial capability for greenfield system)*

## Impact
- **APIs Affected**: Defines contract requirements for endpoints:
  - `POST /api/v1/projects/{project_id}/goals`
  - `POST /api/v1/ai/plan/generate`
  - `GET /api/v1/ai/plan-proposals/{proposal_id}`
  - `POST /api/v1/ai/plan-proposals/{proposal_id}/approve`
  - `POST /api/v1/ai/plan-proposals/{proposal_id}/reject`
  - `POST /api/v1/tasks` (for direct manual task creation)
  - `POST /api/v1/tasks/{task_id}/dependencies` (for direct manual dependency linking)
- **Backend Architecture**: Implemented as modular packages within the approved FastAPI Modular Monolith (ADR 0002) using synchronous SQLAlchemy 2.x + PyMySQL and Alembic migrations.
- **Client Integration**: Both React web client (`http://localhost:12345/api/v1`) and Android mobile client (`http://10.0.2.2:12345/api/v1`) consume these endpoints using the approved structured error envelope and Bearer JWT authentication.
- **Decision Status**: Key gating decisions (Auth flow, Error envelope, Schemas, SQLAlchemy/Alembic, Modular Monolith) formally approved in Phase 1 specification finalization.
