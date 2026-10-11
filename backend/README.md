# Backend Service

---

## 1. Subsystem Scope
The backend service coordinates all platform capabilities:
- Shared REST API exposing endpoints under `/api/v1`
- Relational schema modeling and durable persistence in MySQL 8
- Authentication, token issuance, and role-based access control
- Hosted LLM prompt orchestration, output schema validation, and guardrails
- Deterministic candidate allocation engine (skills, availability, workload constraints)
- Dependency engine (DAG cycle prevention, direct & transitive blast-radius calculation)
- Recovery engine (alternative generation, pre-execution revalidation, atomic state updates, state verification)
- Notification and reminder management

---

## 2. Ownership & Technology Stack
- **Owner**: Member 2 (Backend and AI Lead / Project Owner)
- **Primary Stack**: Python 3.14+, FastAPI, MySQL 8, Pydantic, SQLAlchemy 2.x (Synchronous with PyMySQL), Alembic
- **Architecture**: Modular Monolith (ADR 0002 Accepted)
- **Optional / Dev**: Docker / Docker Compose

---

## 3. Network Configuration & Locked Port
The default local backend port is locked at **12345** (configurable for deployment environments, locked default):
- **Local Service Base**: `http://localhost:12345`
- **Versioned API Base**: `http://localhost:12345/api/v1`
- **Interactive Swagger Docs**: `http://localhost:12345/docs`
- **OpenAPI Schema**: `http://localhost:12345/openapi.json`
- **Android Emulator Access Base**: `http://10.0.2.2:12345/api/v1`

---

## 4. Local Development Setup

### 4.1 Prerequisites
- Python 3.11+ (Python 3.14 supported)
- Docker & Docker Compose (for local MySQL 8)

### 4.2 Environment Configuration
Copy `.env.example` to `.env` in the repository root:
```bash
cp .env.example .env
```

Key environment settings:
- `PORT=12345` (Locked default)
- `DATABASE_URL=mysql+pymysql://platform_user:platform_pass@localhost:3306/ai_coordination?charset=utf8mb4`
- `ENVIRONMENT=development`
- `LOG_LEVEL=INFO`

### 4.3 Start Database via Docker Compose
From the repository root:
```bash
docker compose up -d db
```
This starts MySQL 8 on port 3306 with health checks and persistent storage in named volume `mysql_data`.

### 4.4 Install Dependencies & Run Migrations
From `backend/`:
```bash
# Create virtual environment if needed
python -m venv .venv

# Activate virtual environment
# Windows PowerShell:
.venv\Scripts\Activate.ps1
# Linux/macOS:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run database migrations
python -m alembic upgrade head
```

### 4.5 Run the Development Server
From `backend/`:
```bash
python -m uvicorn src.main:app --host 0.0.0.0 --port 12345 --reload
```
The server will be available at `http://localhost:12345` and `/api/v1/health`.

### 4.6 Running Tests
From `backend/`:
```bash
python -m pytest -v
```

---

## 5. Implementation Status
- **Backend Foundation (Stage 1)**: **Implemented and Tested**.
  - FastAPI application bootstrap with CORS and versioned `/api/v1` routing.
  - Centralized Pydantic Settings configuration reading `.env` (default port 12345).
  - Docker Compose configuration for MySQL 8 with health checks.
  - SQLAlchemy 2.x synchronous engine with PyMySQL connection pooling.
  - Alembic migration environment targeting MySQL 8 and `Base.metadata`.
  - Structured error envelopes (`{"error": {"code": "...", "message": "...", "details": ...}}`).
  - Liveness and database readiness check (`GET /api/v1/health`).
  - Structured logging with credential/secret masking.
- **Goal-to-Task Planning (Stage 2)**: Next implementation stage (OpenSpec change `goal-to-task-planning`).
