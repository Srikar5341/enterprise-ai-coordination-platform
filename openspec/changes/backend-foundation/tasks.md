# Tasks: Backend Foundation

## 1. Project Dependencies & Configuration

- [x] 1.1 Create `backend/requirements.txt` with FastAPI, uvicorn, SQLAlchemy 2.x, PyMySQL, pydantic-settings, alembic, pytest, and httpx, verified by dependency file review.
- [x] 1.2 Implement `backend/src/core/config.py` using Pydantic Settings reading `.env` with locked default port 12345, verified by configuration unit tests.
- [x] 1.3 Create `.env.example` documenting all configuration variables (DB connection, JWT secrets, port 12345, log level), verified by file inspection.

## 2. Docker Compose & Database Connectivity

- [x] 2.1 Create root `docker-compose.yml` defining MySQL 8 service with health checks and persistent volume storage, verified by running `docker compose config`.
- [x] 2.2 Implement `backend/src/core/database.py` with synchronous SQLAlchemy 2.x engine, connection pooling, and scoped sessionmaker, verified by database engine tests.
- [x] 2.3 Initialize Alembic configuration in `backend/alembic.ini` and `backend/alembic/env.py` targeting MySQL 8 and SQLAlchemy Base, verified by migration configuration check.

## 3. Error Handling, Logging & Core Application

- [x] 3.1 Implement `backend/src/core/errors.py` with custom exception classes and global FastAPI handlers formatting errors into the approved structured envelope, verified by error response tests.
- [x] 3.2 Implement `backend/src/core/logging.py` configuring structured console logging without exposing secrets, verified by application startup log check.
- [x] 3.3 Implement `backend/src/api/routes/health.py` and `backend/src/api/router.py` exposing `GET /api/v1/health` with database ping check, verified by API test suite.
- [x] 3.4 Implement `backend/src/main.py` creating the FastAPI application mounted on port 12345 with CORS, error handlers, and `/api/v1` routes, verified by TestClient startup.

## 4. Testing, Documentation & Verification

- [x] 4.1 Implement automated tests in `backend/tests/` verifying health endpoints, database readiness reporting, and error envelope formatting, verified by running `pytest`.
- [x] 4.2 Update `backend/README.md` with developer run instructions, Docker Compose workflow, port 12345 URLs, and test execution commands, verified by documentation review.
