# Change Proposal: Redis Infrastructure & SaaS Subscription / Usage Enforcement

## Why
As an enterprise AI team coordination platform, Revora orchestrates computationally expensive hosted LLM calls (e.g. NVIDIA Nemotron via OpenRouter) for goal decomposition and plan generation. Unbounded execution exposes organizations to provider rate limits, financial runaway, and denial-of-service risks.

Currently:
1. Revora runs only MySQL 8 without Redis caching or rate-limiting infrastructure.
2. No persistent subscription or plan entitlement data models exist in MySQL.
3. Expensive AI planning operations (`POST /api/v1/ai/plan/generate`) execute without quota checks or burst rate limiting.
4. Clients cannot query subscription tiers, usage statistics, or plan entitlements.

## What Changes
1. **Redis Infrastructure Setup**:
   - Add `redis:7-alpine` to `docker-compose.yml` with health checks, persistent volume, and environment configuration without recreating or deleting the MySQL volume.
   - Implement resilient Redis client connection pool in `src/core/redis.py` with fallback mechanisms to ensure system resilience during Redis outages.
   - Enhance `GET /api/v1/health` to monitor both MySQL and Redis connectivity.
2. **Persistent Subscription & Usage Domain in MySQL**:
   - MySQL remains the authoritative primary source of truth.
   - Introduce `subscriptions` and `usage_records` relational tables via Alembic migration (`project_id`, `plan_tier`, `status`, `period_start`, `period_end`, `metric`, `count`).
   - Support `FREE`, `TEAM`, and `BUSINESS` tiers with centralized, documented non-commercial plan entitlements.
3. **Multi-Tier Backend Quota & Rate Limit Enforcement**:
   - **Burst Rate Limiting (Redis)**: Sliding window rate limiting on `POST /api/v1/ai/plan/generate` based on plan tier (e.g. 3 req/min on Free, 10 on Team, 30 on Business). Rejections return `HTTP 429 Too Many Requests` (`code: "RATE_LIMIT_EXCEEDED"`).
   - **Monthly Quota Enforcement (MySQL)**: Atomic pre-execution quota checks against persistent `usage_records`. Rejections return `HTTP 429 Too Many Requests` (`code: "QUOTA_EXCEEDED"`).
   - Frontend is explicitly not the security boundary; all invariants are strictly enforced server-side before upstream LLM calls.
4. **Subscription REST Endpoints**:
   - `GET /api/v1/subscriptions/plan`: Retrieves active plan tier, status, and renewal period.
   - `GET /api/v1/subscriptions/usage`: Retrieves current period AI generation usage vs. entitlement limit.
   - `GET /api/v1/subscriptions/entitlements`: Retrieves feature flags and tier limits.
   - `POST /api/v1/subscriptions/upgrade-request`: Demo tier change workflow.
5. **Testing & Observability**:
   - Comprehensive tests for quota enforcement, burst limits, Redis failure graceful degradation, usage accounting, and multi-workspace tenant isolation.

## Capabilities Affected
- `infrastructure`: Adds Redis container, health checks, and connection management.
- `subscriptions`: Persistent subscription tier models, usage accounting, and plan queries.
- `ai-planning`: Enforces rate limits and usage quotas prior to LLM execution.
