# Team Workflow & Responsibilities

---

## 1. Fixed Team Structure & Ownership

Development responsibilities are partitioned among exactly three members:

```
┌─────────────────────────────────┐      ┌─────────────────────────────────┐
│     Member 1: Web Frontend      │      │ Member 3: Android Mobile Client │
│         React.js + Vite         │      │      Kotlin + Jetpack Compose   │
└────────────────┬────────────────┘      └────────────────┬────────────────┘
                 │                                        │
                 └───────────────┐        ┌───────────────┘
                                 ▼        ▼
                      ┌──────────────────────────────────────┐
                      │ Member 2: Backend & AI Lead (Owner)  │
                      │         Python, FastAPI, MySQL 8     │
                      └──────────────────────────────────────┘
```

### Member 1: Web Frontend
- **Technology Stack**: React.js, Vite, Vanilla CSS.
- **Responsibilities**: Web user experience, navigation flows, state management, dependency graph rendering, task boards, recovery dashboard, and consuming the shared FastAPI backend REST API.
- **Boundaries**: No direct database access; relies exclusively on `/api/v1` endpoints.

### Member 2: Backend & AI Lead (Project Owner)
- **Technology Stack**: Python 3, FastAPI, MySQL 8, Pydantic, Hosted LLM API.
- **Responsibilities**:
  - Architecture governance and authoritative API design.
  - Relational schema modeling and database persistence.
  - Authentication, token lifecycle, and role-based access control.
  - AI prompt orchestration, safety guardrails, and plan proposal parsing.
  - Deterministic allocation matching (skills, availability, workload).
  - Dependency engine (DAG validation, cycle detection, blast-radius calculation).
  - Recovery engine (option generation, pre-execution revalidation, atomic state execution, post-execution verification).
  - Backend security, input validation, and audit logging.
- **Role**: Approving authority for all architectural changes, schema updates, and OpenSpec proposals.

### Member 3: Android Mobile Application
- **Technology Stack**: Kotlin, Jetpack Compose, MVVM Architecture, Repository Pattern, Retrofit + OkHttp, Kotlin Coroutines + Flow, Navigation Compose.
- **Responsibilities**: Native Android user experience, mobile navigation, offline-resilient UI caching, push/alert handling, blocker reporting, and mobile recovery plan review.
- **Boundaries**: Uses the identical `/api/v1` REST API and schemas as the web client; no independent business rule implementations.

---

## 2. API Coordination Workflow

1. **Contract First**: Any API endpoint or schema change begins as an OpenSpec proposal or schema discussion approved by Member 2.
2. **Implementation**: Member 2 implements the route and Pydantic models in FastAPI.
3. **OpenAPI Generation**: FastAPI automatically publishes the updated OpenAPI document (`/api/v1/openapi.json`).
4. **Client Consumption**: Member 1 and Member 3 update client bindings and test against the running backend.

---

## 3. Spec-Driven Development with OpenSpec

All features and architectural adjustments follow the OpenSpec specification lifecycle:

1. **Propose (`openspec/changes/`)**: Create a structured proposal defining problem, context, requirements, and acceptance criteria.
2. **Review & Approval**: The project owner (Member 2) reviews and approves the change before code implementation.
3. **Implementation**: Code is written strictly conforming to the approved specification.
4. **Verification**: Automated tests and manual validation confirm all acceptance criteria are met.
5. **Archive (`openspec archive`)**: Once validated, the change proposal is archived and folded into permanent specs.

---

## 4. Branching & Code Integration Rules

- **Shared Repository**: All three members collaborate in this repository.
- **Directory Isolation**:
  - Web work occurs in `web/`.
  - Backend work occurs in `backend/`.
  - Android work occurs in `android/`.
  - Cross-cutting documentation and governance live in `docs/`, `openspec/`, and `.agents/`.
- **Integrity Rules**:
  - Never modify another member's domain without coordination.
  - Never commit secrets, local environment files (`.env`), or binary build artifacts.
  - Always verify that existing tests pass before pushing code.
