# AI Safety Boundaries & Guardrails

---

## 1. Overview & Implementation Status

- **Status**: **Intended Safeguards** (Design specifications, none currently implemented in source code).
- **Core Principle**: The hosted LLM functions exclusively as an advisory interpreter and plan synthesizer. Consequential operational mutations and access boundaries are governed by deterministic application logic.

> **Caution**: These guardrails are designed to mitigate risks, but they do **not** eliminate hallucinations or guarantee infallible algorithmic choices. Continuous human governance remains a critical system boundary.

---

## 2. Eleven Intended Guardrails

### 1. User Input Validation & Sanitization
All natural-language operational prompts, goal statements, and parameters must be validated and sanitized via Pydantic schemas prior to inclusion in LLM prompt contexts.

### 2. Authorization-Scoped Context Retrieval
When assembling prompt context for the LLM, the backend must retrieve only project, team, and member records that the authenticated requesting user is authorized to view.

### 3. Structured LLM Output Enforcement
LLM responses must be constrained to structured formats (e.g., Pydantic schema validation / JSON mode). Responses failing schema validation must be rejected or retried without altering system state.

### 4. Deterministic Constraint Enforcement
LLM-generated plan proposals and task allocations must be evaluated against deterministic constraint validators:
- Required technical skills matching.
- Real-time availability windows.
- Maximum workload capacity thresholds.
- Graph acyclicity and dependency ordering.
- Project milestone deadlines.

### 5. Isolation from Database & Command Execution
The LLM has zero direct database connectivity and cannot execute SQL commands, shell scripts, or API requests independently. All database modifications are executed via pre-compiled application services.

### 6. Mandatory Human Approval Gate
Consequential recovery changes (e.g., task reassignments, deadline modifications, plan substitutions) require explicit human review and approval by an authorized team lead before application.

### 7. Immediate Pre-Execution State Revalidation
Because team conditions may shift while a recovery plan is under review, the backend must deterministically revalidate current database state against plan preconditions immediately prior to execution. If preconditions fail, execution is halted.

### 8. Post-Execution State Verification
Following atomic execution of an approved plan, backend verification routines must inspect persisted MySQL records to confirm that task states and assignments match the approved plan.

### 9. Explicit Failure, Timeout, and Error Handling
The orchestration layer must explicitly handle LLM provider timeouts, rate limits, malformed responses, and network partitions, returning graceful error envelopes to client applications rather than cascading failures.

### 10. Audit Logging of Sensitive & Consequential Operations
All prompt executions, plan recommendations, human approvals, plan modifications, and executed recovery workflows must be recorded in an immutable audit log.

### 11. Secrets Protection & Data Minimization
Database credentials, API tokens, and extraneous personally identifiable information (PII) must never be injected into LLM prompt contexts. Contexts must include only the minimal information required for plan generation.

---

## 3. Technology Clarifications & Exclusions

- **Retrieval-Augmented Generation (RAG)**: RAG is **not** required for the MVP. Current project graphs and team profiles fit within standard LLM context windows.
- **Reinforcement Learning (RL)**: RL is exploratory research and is **not** implemented or designed for the current platform.
