# Design: Backend Foundation

## Context
See [`proposal.md`](file:///c:/Coding/Tri%20City%20Hackathon/enterprise-ai-coordination-platform/openspec/changes/backend-foundation/proposal.md) for motivation and [`specs/backend-foundation/spec.md`](file:///c:/Coding/Tri%20City%20Hackathon/enterprise-ai-coordination-platform/openspec/changes/backend-foundation/specs/backend-foundation/spec.md) for requirements.

The backend application is designed as a **Modular Monolith** (ADR 0002 Accepted) using FastAPI and Python. It binds to locked default port **12345** and exposes a versioned API under `/api/v1`. This foundation provides runtime configuration, database connectivity, error formatting, and developer tooling without prematurely creating domain tables or business logic.

---

## Goals / Non-Goals

### Goals
- Establish modular code structure in `backend/src/`: `core/` (config, database, errors, logging), `api/` (router assembly, health check), and empty domain packages ready for feature work (`domains/`).
- Centralize environment configuration via Pydantic Settings reading `.env`.
- Establish SQLAlchemy 2.x synchronous engine with PyMySQL connection pooling (`pool_pre_ping=True`, `pool_recycle=3600`).
- Initialize Alembic migration environment (`backend/alembic/`) targeting MySQL 8.
- Expose `GET /api/v1/health` verifying application and database connectivity.
- Provide global exception handlers ensuring all errors return the approved structured format: `{"error":{"code":"...","message":"...","details":...}}`.
- Provide `docker-compose.yml` defining MySQL 8 service with health checks and persistent volume storage.

### Non-Goals
- Generating domain tables (users, goals, tasks) — deferred to domain changes.
- Setting up Redis or MinIO in Docker Compose — tracked in infrastructure roadmap.
- Complex microservice communication or message brokers.

---

## Technical Design

### 1. Directory Structure (`backend/`)
```
backend/
├── src/
│   ├── core/
│   │   ├── __init__.py
│   │   ├── config.py         # Pydantic Settings (.env handling)
│   │   ├── database.py       # SQLAlchemy 2.x engine, sessionmaker, Base
│   │   ├── errors.py         # Custom exceptions & global error handlers
│   │   └── logging.py        # Structured log configuration
│   ├── api/
│   │   ├── __init__.py
│   │   ├── router.py         # Assembles /api/v1 route tree
│   │   └── routes/
│   │       ├── __init__.py
│   │       └── health.py     # GET /api/v1/health implementation
│   ├── domains/              # Clean modular domains (auth, projects, goals, tasks, etc.)
│   │   └── __init__.py
│   └── main.py               # FastAPI factory & startup entrypoint
├── alembic/
│   ├── env.py                # Alembic migration runner
│   ├── script.py.mako        # Migration template
│   └── versions/             # Migration revisions
├── tests/
│   ├── __init__.py
│   ├── conftest.py           # Test fixtures
│   └── test_health.py        # Health and error envelope tests
├── alembic.ini               # Alembic configuration
├── requirements.txt          # Production & dev dependencies
└── Dockerfile                # Backend containerization
```

### 2. Database Connection Architecture
- **Engine**: Synchronous SQLAlchemy 2.x engine using `mysql+pymysql://<user>:<pass>@<host>:<port>/<db>?charset=utf8mb4`.
- **Session Lifecycle**: `get_db()` dependency yielding a scoped `Session` with automatic closure.
- **Connection Health**: `pool_pre_ping=True` ensures stale connections are recycled before execution.
- **Readiness Ping**: Health check executes `SELECT 1` through a dedicated lightweight connection check.

### 3. Centralized Exception Handling
A global exception filter catches:
1. `RequestValidationError` → HTTP 422 with `code: "VALIDATION_ERROR"`.
2. `AppException` (custom base) → Mapped HTTP status and application-specific error code.
3. `HTTPException` → HTTP status with `code: "HTTP_ERROR"`.
4. `Exception` (catch-all) → Logs error with traceback; returns HTTP 500 with `code: "INTERNAL_SERVER_ERROR"`.

All responses return the exact approved structure:
```json
{
  "error": {
    "code": "STRING_CODE",
    "message": "Human readable message",
    "details": null
  }
}
```

### 4. Docker Compose Development Environment
Root `docker-compose.yml` configures:
- Service `db`: `mysql:8.0` image, environment variables (`MYSQL_DATABASE=ai_coordination`, `MYSQL_USER=platform_user`, `MYSQL_PASSWORD=platform_pass`, `MYSQL_ROOT_PASSWORD=root_pass`), health check (`mysqladmin ping`), port mapping `3306:3306`, and named volume `mysql_data`.
- Extensible design ready for future Redis / MinIO services when required by roadmap.

---

## Risks / Trade-offs

- **[MySQL Stale Connection Drops]** → *Mitigation*: Configure `pool_recycle=3600` and `pool_pre_ping=True`.
- **[Blocking Sync Operations in FastAPI]** → *Mitigation*: Declare database route handlers with `def` rather than `async def`, allowing FastAPI to automatically run them on dedicated worker threads (`run_in_threadpool`).
- **[Credential Leakage in Logs]** → *Mitigation*: Sanitize configuration prints and log filters to strip passwords and API keys.
