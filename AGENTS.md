# Agent Operating Guidelines (AGENTS.md)

This document establishes the repository-wide operating rules and behavioral constraints for all AI coding agents working on the **Enterprise AI Team Coordination & Recovery Platform**.

---

## 1. Core Operating Principles

1. **Read Documentation Before Acting**: Always read the relevant project documentation in [`docs/`](file:///c:/Coding/Tri%20City%20Hackathon/enterprise-ai-coordination-platform/docs) before proposing or implementing changes.
2. **Respect Approved Architecture**: Adhere strictly to the decisions recorded in [`docs/ARCHITECTURE.md`](file:///c:/Coding/Tri%20City%20Hackathon/enterprise-ai-coordination-platform/docs/ARCHITECTURE.md) and [`docs/decisions/`](file:///c:/Coding/Tri%20City%20Hackathon/enterprise-ai-coordination-platform/docs/decisions). Never circumvent architectural invariants.
3. **Respect API Contracts**: The shared backend REST API is documented in [`docs/API_CONTRACT.md`](file:///c:/Coding/Tri%20City%20Hackathon/enterprise-ai-coordination-platform/docs/API_CONTRACT.md). Never add, rename, or remove endpoints without explicit approval and an approved OpenSpec change.
4. **Inspect Actual Source Code**: Base implementation and test status reports on the actual filesystem state, not on assumptions or prior conversation context.
5. **No Invented Requirements**: Do not create application features, technological choices, or business logic not explicitly specified by project specifications or the project owner.
6. **Explicit Approval for Conflicts**: When architectural, security, contract, or scope ambiguities arise, do not silently resolve them. Record them in [`docs/DECISIONS_REQUIRED.md`](file:///c:/Coding/Tri%20City%20Hackathon/enterprise-ai-coordination-platform/docs/DECISIONS_REQUIRED.md) and request explicit approval.
7. **Spec-Driven Development with OpenSpec**: All feature changes, schema changes, and functional tasks must follow the OpenSpec workflow located in [`openspec/`](file:///c:/Coding/Tri%20City%20Hackathon/enterprise-ai-coordination-platform/openspec).
8. **Protect Existing Work and Secrets**: Never delete, overwrite, or mutate existing configuration, `.git`, licenses, or valid project files without confirmation. Never commit secrets, credentials, or API keys.
9. **Verify Changes with Tests**: Validate code changes using appropriate automated tests. Never mark unverified code as tested.
10. **Truthful Project Status**: Keep [`docs/PROJECT_STATUS.md`](file:///c:/Coding/Tri%20City%20Hackathon/enterprise-ai-coordination-platform/docs/PROJECT_STATUS.md) up to date and strictly truthful. Clearly distinguish between **Proposed**, **Candidate**, **Implemented**, **Tested**, **Simulated**, and **Deferred** artifacts.
11. **Client Authority Boundaries**: The React Web Client and Kotlin Android Client must communicate exclusively via the shared FastAPI REST API (`/api/v1`). Clients must never connect directly to MySQL or independently implement privileged business logic.

---

## 2. Decision and Governance Workflow

- **Proposals vs. Decisions**: Any new pattern, dependency, or architectural variation is a proposal until recorded as "Accepted" in an ADR under [`docs/decisions/`](file:///c:/Coding/Tri%20City%20Hackathon/enterprise-ai-coordination-platform/docs/decisions).
- **Hard Guardrails**: The LLM is an assistive interpreter and proposal generator. Consequential operations (state mutation, recovery plan execution) require deterministic validation, authorization, and human approval. See [`docs/AI_GUARDRAILS.md`](file:///c:/Coding/Tri%20City%20Hackathon/enterprise-ai-coordination-platform/docs/AI_GUARDRAILS.md).
