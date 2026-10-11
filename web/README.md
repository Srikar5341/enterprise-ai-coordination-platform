# Web Frontend Application

---

## 1. Subsystem Scope
The web application provides an interactive single-page interface for software delivery teams:
- Team and project dashboards
- Natural-language operational goal intake and plan review interfaces
- Interactive dependency graph visualization with blocker highlights
- Allocation review and workload visualization
- Recovery cockpit: side-by-side alternative comparison (Fastest, Balanced, Lowest Cost), editing, and approval flows
- Reminder and notification center
- Integration with the shared backend API under `/api/v1`

---

## 2. Ownership & Technology Stack
- **Owner**: Member 1 (Web Frontend)
- **Primary Stack (Decided)**: React.js, Vite, Vanilla CSS
- **Boundaries**: All data and state transitions are mediated by the shared FastAPI backend REST API. Direct database access is strictly prohibited.

---

## 3. Backend Integration & Locked Port
The web frontend connects to the shared FastAPI backend running on locked default port **12345**:
- **Default Local Backend**: `http://localhost:12345`
- **Versioned API Base**: `http://localhost:12345/api/v1`
- **FastAPI Documentation**: `http://localhost:12345/docs`
- **OpenAPI Schema**: `http://localhost:12345/openapi.json`

---

## 4. Implementation Status
> **Implementation Notice**: **Not yet implemented (0% complete)**.
> No application source code, scaffolding, package manifests (`package.json`), or build configurations have been generated. Implementation will begin only after OpenAPI schema availability and approved OpenSpec change proposals.
