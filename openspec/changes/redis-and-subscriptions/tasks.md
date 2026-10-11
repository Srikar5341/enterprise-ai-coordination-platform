# Tasks: Redis Infrastructure & SaaS Subscription / Usage Enforcement

## Implementation Checklist

- [x] 1. Add Redis 7 container and health checks to `docker-compose.yml` and start container <!-- id: 1-docker-compose-redis -->
- [x] 2. Update `backend/requirements.txt` with `redis>=5.0.0` and configure settings in `src/core/config.py` <!-- id: 2-redis-config -->
- [x] 3. Implement resilient Redis connection client and health checks in `src/core/redis.py` and update `/health` endpoint <!-- id: 3-redis-client-health -->
- [x] 4. Create SQLAlchemy models for Subscriptions and UsageRecords in `src/domains/subscriptions/models.py` <!-- id: 4-subscription-models -->
- [x] 5. Generate and execute non-destructive Alembic migration adding `subscriptions` and `usage_records` tables to MySQL 8 <!-- id: 5-alembic-migration -->
- [x] 6. Implement Pydantic schemas and domain service for subscriptions, entitlements, and usage tracking in `src/domains/subscriptions/` <!-- id: 6-subscription-service -->
- [x] 7. Implement Redis sliding-window burst rate limiter and integrate quota checks before AI plan generation in `src/api/routes/ai_plans.py` <!-- id: 7-quota-enforcement -->
- [x] 8. Implement subscription REST endpoints (`GET /plan`, `GET /usage`, `GET /entitlements`, `POST /upgrade-request`) in `src/api/routes/subscriptions.py` and register on master router <!-- id: 8-subscription-endpoints -->
- [x] 9. Implement automated test suite covering quota enforcement, exceeded limits, usage accounting, Redis failure fallback, and workspace isolation <!-- id: 9-test-suite -->
- [x] 10. Regenerate `docs/openapi.json`, update `docs/PROJECT_STATUS.md`, and validate OpenSpec <!-- id: 10-docs-and-validation -->
