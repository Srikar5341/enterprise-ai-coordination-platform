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
The web frontend is implemented as a modern React 19 + Vite 6 + TypeScript single-page application under `web/`:
- **Branding**: Renova design system with orbital-arrow emblems and modern typography.
- **REST Integration**: Connected to the shared FastAPI backend `/api/v1` routes (`src/lib/api/fastapi.ts`, `src/lib/api/client.ts`) for health, goals, plan generation, plan proposals, and approval/rejection lifecycle, adhering to the structured error envelope (`{ "error": { "code", "message", "details" } }`) and Bearer token transport.
- **Views & Components**:
  - Landing page with responsive feature showcases and interactive product previews
  - Authentication flows (login, register, email verification, password reset)
  - Team lead dashboards: overview, goal intake, plan review with dependency graph visualization, workload allocation
  - Employee workspace & personal task management
  - Recovery cockpit for blocker resolution and alternative scenario evaluation
  - SaaS subscription and tier management
- **Test Suite**: Automated unit and contract adapter tests in `tests/`.

---

## 5. Development & Scripts
From the `web/` directory:

```bash
# Install dependencies
bun install   # or npm install

# Run development server (defaults to port 3000)
bun run dev

# Run type checking
bun run typecheck

# Run linter
bun run lint

# Run automated tests
bun run test

# Build production bundle (outputs to web/dist/)
bun run build
```

---

## 6. Environment Configuration
Configuration is managed through environment variables prefixed with `VITE_`:
- `VITE_OPSPILOT_API_MODE`: `mock` (demo/offline mode) or `http` (live integration mode with FastAPI).
- `VITE_OPSPILOT_API_BASE_URL`: Defaults to `http://localhost:12345/api/v1`.
- `VITE_OPSPILOT_DEMO_PROJECT_ID`: Default project UUID for operational goal submission.

See `web/.env.example` for reference. Never commit credentials, `.env` files, or secrets into source control.
