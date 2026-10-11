# System Architecture

---

## 1. High-Level System Topology

```
React Web Client (Vite) ──────────┐
                                  ├── HTTPS REST API (/api/v1) ──> Shared FastAPI Backend
Android Mobile Client (Compose) ──┘                                      │
                                                                         ├── MySQL 8 (Primary Relational Store)
                                                                         ├── Hosted LLM API (Assistive Orchestration)
                                                                         ├── Allocation Engine (Deterministic)
                                                                         ├── Dependency Engine (Graph Analysis)
                                                                         └── Recovery Engine (Option Generation & Verification)
```

Both client platforms consume a single shared versioned API under the `/api/v1` prefix. Direct database access from clients to MySQL 8 is strictly prohibited. All business rules, access control, and state management are enforced within the backend.

### Network Endpoints & Locked Port

The default local backend port is locked at **12345** (configurable for deployment environments via environment variables, but locked as the agreed default):

- **Default local backend**: `http://localhost:12345`
- **Versioned API base**: `http://localhost:12345/api/v1`
- **FastAPI interactive documentation**: `http://localhost:12345/docs`
- **OpenAPI JSON specification**: `http://localhost:12345/openapi.json`
- **Android emulator API base**: `http://10.0.2.2:12345/api/v1`

---


## 2. Component Responsibilities

### Web Frontend (Member 1)
- **Technology**: React.js, Vite, Vanilla CSS.
- **Scope**: Responsive web application, navigation flows, state management, interactive dependency graphs, allocation reviews, and recovery plan dashboards.
- **Constraints**: Interacts exclusively with the backend REST API; no direct persistence or bypass of backend authorization.

### Backend & AI Lead (Member 2 - Project Owner)
- **Technology**: Python, FastAPI, MySQL 8, Pydantic, Hosted LLM API.
- **Scope**:
  - REST API implementation under `/api/v1`.
  - Authentication and role-based access control.
  - AI orchestration for plan generation and recovery explanation.
  - Deterministic allocation engine (skill, workload, availability, and deadline matching).
  - Dependency engine (directed acyclic graph cycle validation, blast-radius calculations).
  - Recovery engine (option formulation, pre-execution revalidation, atomic state updates, state verification).
  - Relational schema modeling and persistence management.

### Android Mobile Client (Member 3)
- **Technology**: Kotlin, Jetpack Compose, MVVM Architecture, Repository Pattern, Retrofit + OkHttp, Kotlin Coroutines + Flow, Navigation Compose.
- **Scope**: Native Android mobile application, offline-resilient UI state caching, task status updates, push/in-app blocker alerts, and recovery plan review.
- **Constraints**: Uses identical endpoints, auth flows, and schemas as the web client; no independent business rule implementations.

---

## 3. Technology Adoption Status

Every technology choice is tracked with an explicit decision status:

| Technology / Component | Scope / Layer | Decision Status | Notes |
| :--- | :--- | :--- | :--- |
| **Python 3** | Backend Runtime | **Decided** | Standard runtime for backend services. |
| **FastAPI** | Backend Web Framework | **Decided** | Modern, asynchronous REST API framework generating OpenAPI specs. |
| **MySQL 8** | Primary Relational Store | **Decided** | Durable source of truth for operational and entitlement data. |
| **Pydantic** | Validation Layer | **Decided** | Request and response schema enforcement. |
| **React.js + Vite** | Web Client | **Decided** | Fast modern SPA framework. |
| **Kotlin + Jetpack Compose** | Android Mobile Client | **Decided** | Declarative native Android UI with MVVM and Retrofit. |
| **Hosted LLM API** | AI Provider | **Decided** | Used for natural language parsing and structured proposals. |
| **SQLAlchemy 2.x** | Database ORM | **Decided** | Synchronous SQLAlchemy with PyMySQL for initial MVP to minimize async-driver complexity. |
| **Alembic** | Database Migrations | **Decided** | Versioned schema migration management for MySQL 8. |
| **Modular Monolith (ADR 0002)** | Backend Architecture | **Decided** | Single FastAPI app partitioned into decoupled domain modules; microservices rejected for MVP. |
| **Docker / Docker Compose** | Development Containerization | **Candidate / Optional** | Optional for reproducible local developer environments. |
| **Redis** | Caching / Task Queue | **Deferred / Not Approved** | Not required for MVP. Documented for future evaluation. |
| **MinIO** | Object Storage | **Deferred / Not Approved** | Not required for MVP. |
| **Reverse Proxy / Nginx** | Traffic Routing | **Deferred / Not Approved** | Not required for local hackathon development. |
| **WebSockets** | Real-time Streaming | **Deferred / Not Approved** | REST polling satisfies initial MVP needs. |
| **RAG (Retrieval-Augmented Generation)** | Context Retrieval | **Deferred / Not Approved** | Direct context injection into prompts is sufficient for MVP. |
| **Reinforcement Learning** | Adaptive AI Optimization | **Deferred / Research Only** | Academic interest only; not in scope for MVP. |

---

## 4. Division of Responsibility: AI vs. Deterministic Logic

To guarantee system reliability, safety, and operational predictability, system responsibilities are strictly divided:

### Hosted LLM Responsibilities
- Interpreting natural-language operational instructions and goal descriptions.
- Formulating structured task-plan proposals (task breakdowns, suggested dependencies).
- Identifying ambiguities, omissions, and conflicting instructions.
- Producing human-readable natural-language summaries of recovery alternatives.

### Deterministic Application Responsibilities
- Authentication, session validation, and role-based permissions.
- Input validation and sanitization using Pydantic schemas.
- Validation of dependency graphs (cycle prevention, topological sorting).
- Quantitative candidate matching against skills, workload, availability, and deadlines.
- Deterministic calculation of downstream blast-radius and schedule impact.
- Feasibility verification of recovery plans before presentation.
- Pre-execution state revalidation immediately prior to atomic database updates.
- Post-execution verification confirming database state matches the approved plan.
- Durable audit event logging.

---

## 5. Data Flow & Recovery Invariant

```
[Operational Goal / Instruction]
           │
           ▼
[FastAPI Backend: Input Validation]
           │
           ▼
[Hosted LLM API: Generate Structured Plan Proposal]
           │
           ▼
[Deterministic Validation: Pydantic + Dependency Graph Check]
           │
           ▼
[Lead Review & Approval] ──(Approved)──> [Candidate Allocation Engine]
                                                    │
                                                    ▼
                                          [Tasks Persisted in MySQL 8]
                                                    │
                                           (Disruption Occurs)
                                                    │
                                                    ▼
[Blast-Radius Calculation: Direct & Transitive Graph Traversal]
           │
           ▼
[Recovery Engine: Generate Alternatives (Fastest, Balanced, Lowest Cost)]
           │
           ▼
[Authorized Lead Review & Approval Gate]
           │
           ▼
[Pre-Execution Revalidation Against Live MySQL State]
           │
           ▼
[Atomic Execution of Approved Plan]
           │
           ▼
[Post-Execution State Verification in MySQL 8]
```

---

## 6. Authority & Security Boundaries

1. **Client Isolation**: Clients never hold database credentials. All database operations are channeled through backend endpoints protected by authentication and authorization checks.
2. **Deterministic Governance**: The LLM has zero direct database write permissions and cannot trigger unapproved system mutations. All changes require deterministic validation and human sign-off.
