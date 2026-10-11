# ADR 0002: Modular Monolith Architecture for Backend Service

- **Status**: Accepted
- **Date**: 2026-10-11
- **Deciders**: Member 2 (Project Owner / Backend Lead)
- **Status Note**: Formally approved by project owner in Phase 1 specification finalization. The backend will be organized as a modular monolith within one FastAPI application, retaining clear module boundaries for authentication, projects, goals, AI planning, tasks and dependencies. Microservices are explicitly excluded for MVP.

---

## Context

The backend service coordinates several distinct functional domains:
- Authentication & Identity Management
- Teams, Projects, and Goals
- Task Management, Dependencies, and Blocker Detection
- AI Plan Generation & Natural-Language Assistance
- Deterministic Candidate Allocation
- Downstream Blast-Radius & Recovery Execution Engine
- Notifications, Reminders, and Subscriptions

We must evaluate whether to organize the FastAPI backend as a modular monolith (single deployable service with clear internal package boundaries) or split functionality across multiple independent services/microservices.

---

## Proposed Decision

Organize the FastAPI backend as a **Modular Monolith** within the `backend/` directory:
- Domain logic partitioned into discrete, decoupled packages (e.g., `auth/`, `tasks/`, `allocation/`, `recovery/`, `ai/`).
- Shared persistence models and data access layer.
- Single FastAPI process exposing the `/api/v1` route tree.
- Internal domain boundaries enforced through explicit service interfaces and Pydantic schemas, avoiding circular dependencies.

Microservices, message queues, distributed caches, and independent deployment pipelines will not be implemented for the initial MVP.

---

## Consequences

### Positive
- **Development Velocity**: Greatly simplified local setup, unified debugging, and zero inter-service network overhead during hackathon development.
- **Transactional Consistency**: Atomic state updates across tasks, dependencies, and recovery plans without requiring distributed transaction protocols (e.g., Saga or 2PC).
- **Clear Extraction Paths**: Clean modular domain packages can be extracted into standalone microservices in the future if scale demands.

### Negative / Trade-offs
- **Coupled Deployment**: Updating one domain (e.g., recovery) requires deploying the full backend application.
- **Shared Resource Contention**: CPU-intensive operations (graph traversal, blast-radius calculation) share runtime resources with standard API request serving.

---

## Approval

Formally accepted by **Member 2 (Backend and AI Lead / Project Owner)** during Phase 1 specification finalization.

