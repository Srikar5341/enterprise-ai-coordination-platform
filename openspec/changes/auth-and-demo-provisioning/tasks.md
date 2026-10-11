# Tasks: Authentication Lifecycle & Demo-User Provisioning

## Implementation Checklist

- [x] 1. Create and validate OpenSpec change `auth-and-demo-provisioning` <!-- id: 1-openspec-validation -->
- [x] 2. Create SQLAlchemy models for User and RefreshToken in `src/domains/auth/models.py` <!-- id: 2-auth-models -->
- [x] 3. Generate and execute Alembic migration adding `users` and `refresh_tokens` tables to MySQL 8 <!-- id: 3-alembic-migration -->
- [x] 4. Implement secure password hashing, verification, and refresh-token hashing utilities in `src/core/security.py` <!-- id: 4-security-utilities -->
- [x] 5. Implement Pydantic auth schemas and domain service for login, rotation, revocation, and registration <!-- id: 5-auth-service-schemas -->
- [x] 6. Implement FastAPI endpoints for `login`, `refresh`, `logout`, `me`, and `register` under `/api/v1/auth` <!-- id: 6-auth-endpoints -->
- [x] 7. Enhance server-side project membership authorization and project isolation in `src/core/auth.py` <!-- id: 7-server-authorization -->
- [x] 8. Implement repeatable development bootstrap utility in `src/core/bootstrap.py` <!-- id: 8-bootstrap-utility -->
- [x] 9. Implement comprehensive unit and integration tests for auth lifecycle, token rotation, revocation, expiry, and project isolation <!-- id: 9-test-suite -->
- [x] 10. Execute real goal-to-task planning workflow against live MySQL 8 database using bootstrapped credentials <!-- id: 10-live-mysql-verification -->
