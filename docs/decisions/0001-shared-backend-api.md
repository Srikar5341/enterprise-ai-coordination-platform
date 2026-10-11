# ADR 0001: Shared Backend REST API for Web and Android Clients

- **Status**: Accepted
- **Date**: 2026-10-11
- **Deciders**: Member 2 (Project Owner / Backend Lead), Core Team
- **Consulted**: Member 1 (Web Lead), Member 3 (Android Lead)

---

## Context

The platform requires two distinct user-facing client applications:
1. A web frontend built with React.js and Vite.
2. A native mobile application built with Kotlin and Jetpack Compose for Android.

Both clients provide views for operational goals, structured tasks, dependency graphs, allocation reviews, blockers, and recovery plans. They must share real-time state, maintain consistent permissions, and avoid duplicating business and validation rules.

---

## Decision

The system will use a single, shared FastAPI backend communicating via an HTTPS REST API under the `/api/v1` route prefix.

Both the React web application and the Android mobile application will consume this shared API. Direct database connections from either client to MySQL 8 are strictly prohibited. Privileged business logic, authorization checks, AI orchestration, allocation ranking, and recovery workflows reside exclusively within the backend.

---

## Consequences

### Positive
- **Single Source of Truth**: Centralized enforcement of authorization, business rules, and state transitions in Python/FastAPI.
- **Consistent Client Experience**: Both web and mobile interfaces render data and execute operations backed by identical contracts and models.
- **Enhanced Security**: Database credentials, secrets, and LLM API keys remain isolated within backend services.
- **Simplified Auditing**: State changes, approvals, and recovery operations are tracked in a unified backend audit log.

### Negative / Trade-offs
- **Network Dependency**: Client interactions require network communication with the backend service.
- **API Surface Coordination**: Contract changes require versioning and coordination across both client platforms.
- **Client Synchronization**: Real-time updates require polling or planned future streaming capabilities, as WebSockets are not part of the initial MVP.
