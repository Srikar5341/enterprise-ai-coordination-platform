# Enterprise AI Team Coordination & Recovery Platform

AI-powered team coordination and recovery platform with a shared FastAPI backend, React frontend, and Kotlin Android application.

---

## 1. Project Overview

- **Official Hackathon Problem Statement**: *"Build an AI agent that can take operations instructions and generate tasks, reminders and workflows."*
- **Judging Criteria**:
  - Working MVP: 30%
  - AI/SaaS Relevance: 20%
  - UI/UX: 15%
  - Market Potential: 15%
  - Innovation: 10%
  - Demo & Pitch: 10%
- **Product Vision**: An AI-powered team coordination and recovery platform for software and technology teams. It converts operational goals into structured tasks, organizes dependencies and assignments, tracks execution, and helps teams recover when disruptions threaten delivery.
- **Proposed Differentiator (Hypothesis)**:
  $$\text{Impact Analysis} \longrightarrow \text{Recovery Alternatives} \longrightarrow \text{Human Approval} \longrightarrow \text{Revalidation} \longrightarrow \text{Execution} \longrightarrow \text{State Verification}$$
- **Default Local Backend Port**: Locked at **12345** (API base: `http://localhost:12345/api/v1`, Docs: `http://localhost:12345/docs`, Android emulator: `http://10.0.2.2:12345/api/v1`).

---

## 2. Repository Directory Map

```
enterprise-ai-coordination-platform/
├── README.md                              # Project introduction, repository map, docs index
├── AGENTS.md                              # Repository-wide working rules for coding agents
├── LICENSE                                # Project license (MIT)
├── .gitignore                             # Version control ignore rules
├── .agents/                               # Antigravity agent configuration
│   ├── rules/
│   │   └── architecture-invariants.md     # Persistent architectural constraints
│   ├── skills/                            # OpenSpec workflow skills
│   └── workflows/                         # OpenSpec slash command workflows
├── docs/                                  # Project documentation
│   ├── PRODUCT_BRIEF.md                   # Problem, users, vision, proposed value
│   ├── ARCHITECTURE.md                    # Architecture, components, data flow, tech status
│   ├── MVP_SCOPE.md                       # MVP features, exclusions, roadmap
│   ├── API_CONTRACT.md                    # Proposed route inventory and contract rules
│   ├── AI_GUARDRAILS.md                   # AI responsibilities, safety boundaries, verification
│   ├── TEAM_WORKFLOW.md                   # Three-member ownership and integration process
│   ├── PROJECT_STATUS.md                  # Truthful implementation and test status
│   ├── DECISIONS_REQUIRED.md              # Unresolved decisions and options requiring approval
│   └── decisions/                         # Architecture Decision Records (ADRs)
│       ├── 0001-shared-backend-api.md     # [Accepted] Shared FastAPI REST API for both clients
│       └── 0002-modular-monolith.md       # [Accepted] Modular monolith architecture for backend
├── openspec/                              # Spec-driven development framework
│   ├── config.yaml                        # OpenSpec project context and schema config
│   ├── specs/                             # Canonical system specifications
│   └── changes/                           # Proposed and active change specifications
├── backend/                               # Shared FastAPI backend (Member 2)
│   └── README.md                          # Subsystem scope, stack, and status (0% implemented)
├── web/                                   # React.js + Vite web frontend (Member 1)
│   └── README.md                          # Subsystem scope, stack, and status (0% implemented)
└── android/                               # Kotlin + Jetpack Compose app (Member 3)
    └── README.md                          # Subsystem scope, stack, and status (0% implemented)
```

---

## 3. Documentation Index

| Document | Primary Responsibility |
| :--- | :--- |
| [`PRODUCT_BRIEF.md`](file:///c:/Coding/Tri%20City%20Hackathon/enterprise-ai-coordination-platform/docs/PRODUCT_BRIEF.md) | Product vision, user scenario, value proposition, and blast-radius heuristic. |
| [`ARCHITECTURE.md`](file:///c:/Coding/Tri%20City%20Hackathon/enterprise-ai-coordination-platform/docs/ARCHITECTURE.md) | System topology, component roles, decided vs. candidate tech choices, and authority boundaries. |
| [`MVP_SCOPE.md`](file:///c:/Coding/Tri%20City%20Hackathon/enterprise-ai-coordination-platform/docs/MVP_SCOPE.md) | Specific demo capabilities, explicit MVP exclusions, and phased roadmap. |
| [`API_CONTRACT.md`](file:///c:/Coding/Tri%20City%20Hackathon/enterprise-ai-coordination-platform/docs/API_CONTRACT.md) | 62 proposed endpoints under `/api/v1` and contract development guidelines. |
| [`AI_GUARDRAILS.md`](file:///c:/Coding/Tri%20City%20Hackathon/enterprise-ai-coordination-platform/docs/AI_GUARDRAILS.md) | 11 intended safety boundaries separating assistive LLM from deterministic logic. |
| [`TEAM_WORKFLOW.md`](file:///c:/Coding/Tri%20City%20Hackathon/enterprise-ai-coordination-platform/docs/TEAM_WORKFLOW.md) | Roles for Web, Backend/Owner, and Android leads; OpenSpec processes. |
| [`PROJECT_STATUS.md`](file:///c:/Coding/Tri%20City%20Hackathon/enterprise-ai-coordination-platform/docs/PROJECT_STATUS.md) | Truthful tracking of implementation progress (currently 0% implemented, 0% tested). |
| [`DECISIONS_REQUIRED.md`](file:///c:/Coding/Tri%20City%20Hackathon/enterprise-ai-coordination-platform/docs/DECISIONS_REQUIRED.md) | Open architectural items, candidates, and options requiring explicit approval. |
| [`ADR 0001`](file:///c:/Coding/Tri%20City%20Hackathon/enterprise-ai-coordination-platform/docs/decisions/0001-shared-backend-api.md) | **[Accepted]** Single shared backend REST API for Web and Android clients. |
| [`ADR 0002`](file:///c:/Coding/Tri%20City%20Hackathon/enterprise-ai-coordination-platform/docs/decisions/0002-modular-monolith.md) | **[Accepted]** Modular monolith architecture for the FastAPI backend service. |

---

## 4. Current Implementation Status

- **Status**: **Phase 1 Specification Finalized — Approvals Complete**
- **Application Code**: 0% implemented. No backend, frontend, or Android code has been written.
- **Tests**: 0% tested.
- **Next Step**: Project owner authorization to commence Phase 2 implementation.

