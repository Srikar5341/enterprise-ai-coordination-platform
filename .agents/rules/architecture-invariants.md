# Architecture Invariants

These rules define non-negotiable architectural boundaries and constraints for the **Enterprise AI Team Coordination & Recovery Platform**. All agents and contributors must adhere to them.

---

## 1. Single Shared Backend API

- **Shared REST Service**: All client applications (React Web Client, Kotlin Android Client) must interact with the system solely via the shared FastAPI backend under the `/api/v1` route prefix.
- **Client Boundaries**:
  - Web and Android clients must **never** connect directly to MySQL 8.
  - Clients must **never** implement privileged business logic, bypass backend authorization, or execute unverified state transitions independently.
  - Both clients must honor identical authentication flows, role-based access control, and response schemas defined by the backend OpenAPI contract.
- **Reference**: [`docs/decisions/0001-shared-backend-api.md`](file:///c:/Coding/Tri%20City%20Hackathon/enterprise-ai-coordination-platform/docs/decisions/0001-shared-backend-api.md).

---

## 2. Source of Truth and Persistence

- **Relational Persistence**: MySQL 8 is the primary relational source of truth for durable operational data, task states, dependencies, team structures, and subscription entitlements.
- **Controlled Access**: Direct database operations are strictly confined to backend data services.
- **Technology Status**:
  - Python 3 + FastAPI: **Decided**.
  - MySQL 8: **Decided**.
  - Pydantic: **Decided**.
  - SQLAlchemy 2.x (Sync + PyMySQL) and Alembic: **Decided / Approved**.
  - Backend Architecture: **Modular Monolith (ADR 0002 Accepted)**.

---

## 3. Division of Responsibility: AI vs. Deterministic Logic

- **Hosted LLM API**:
  - Responsibilities: Interpreting natural-language operational instructions, formulating structured task-plan proposals, flagging ambiguity or missing context, and generating human-readable explanations of recovery options.
  - Prohibitions: The LLM must **never** execute raw database queries, bypass validation, or autonomously commit state mutations.
- **Deterministic Application Engine**:
  - Responsibilities: Authentication, role-based authorization, Pydantic schema validation, skill/availability/workload constraints, dependency graph cycle detection and blast-radius calculations, recovery feasibility checks, atomic state execution, and post-execution persistence verification.

---

## 4. Recovery Loop Invariant

Any automated recovery or workflow alteration must strictly follow the multi-stage invariant:
1. **Impact Analysis**: Deterministic direct and transitive downstream blast-radius calculation.
2. **Recovery Alternatives**: Generation and ranking of distinct alternatives (Fastest, Balanced, Lowest Cost when valid).
3. **Human Approval**: Consequential changes require review, modification, and explicit approval by an authorized lead.
4. **Pre-Execution Revalidation**: Deterministic re-verification of the plan against the latest state immediately before execution.
5. **Execution**: Atomic application of permitted changes.
6. **State Verification**: Post-execution verification confirming database records match expected target state.

---

## 5. API Route Inventory Stability

- The route inventory defined in [`docs/API_CONTRACT.md`](file:///c:/Coding/Tri%20City%20Hackathon/enterprise-ai-coordination-platform/docs/API_CONTRACT.md) is fixed at 62 proposed endpoints under `/api/v1` (including approved proposal lifecycle routes).
- Agents must **not** rename, remove, or invent routes without explicit approval and an approved OpenSpec change.
- Schema definitions for Goal-to-Task Planning are approved; remaining endpoints remain unresolved until codified.

---

## 6. Scope and Architecture Governance

- **MVP Exclusions**: Redis, MinIO, microservices, multiple replicas, reverse proxies, WebSockets, RAG, and Reinforcement Learning are unapproved for the MVP. They must not be introduced without explicit written consent.
- **Spec-Driven Execution**: All feature proposals, modifications, and tasks must be managed through OpenSpec (`openspec/`) before implementation begins.
