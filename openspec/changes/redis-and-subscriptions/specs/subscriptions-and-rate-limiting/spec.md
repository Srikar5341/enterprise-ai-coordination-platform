# Spec Delta: Redis Infrastructure & SaaS Subscription / Usage Enforcement

## Purpose
Defines requirements for Redis-backed burst rate limiting and MySQL-backed SaaS subscription quotas, entitlement queries, and pre-execution AI plan generation guards.

## ADDED Requirements

### Requirement: Centralized Plan Limits Configuration
The system SHALL maintain centralized, documented tier configuration for `FREE`, `TEAM`, and `BUSINESS` plans in `src/core/config.py`:
- `FREE`: 2 max projects, 5 max members, 20 AI plan generations per billing period, 3 AI requests/min rate limit.
- `TEAM`: 10 max projects, 25 max members, 200 AI plan generations per billing period, 10 AI requests/min rate limit.
- `BUSINESS`: 50 max projects, 100 max members, 1000 AI plan generations per billing period, 30 AI requests/min rate limit.

#### Scenario: Retrieval of tier configuration
- **WHEN** the application loads plan configurations
- **THEN** it resolves defined limits for FREE, TEAM, and BUSINESS without hardcoded external pricing dependencies


---

### Requirement: Persistent Relational Subscriptions and Usage Records
The backend SHALL maintain MySQL 8 as the authoritative source of truth for subscription status and usage accounting:
1. `subscriptions` table mapping `project_id` to `plan_tier` (`FREE`, `TEAM`, `BUSINESS`), subscription `status` (`ACTIVE`, `PAST_DUE`, `CANCELLED`), and `current_period_start` / `current_period_end`.
2. `usage_records` table recording periodic metric counts (`metric = "ai_plan_generations"`, `count`, `period_start`, `period_end`).

#### Scenario: New project subscription defaults to Free
- **WHEN** a project is queried for subscription without a prior custom record
- **THEN** the system returns active `FREE` plan entitlements and zero accrued usage

---

### Requirement: Pre-Execution Quota & Rate Limit Enforcement on AI Planning
The backend SHALL validate both burst rate limits and monthly usage quotas server-side before initiating LLM prompt executions via `POST /api/v1/ai/plan/generate`.

#### Scenario: AI plan generation within quota succeeds
- **WHEN** an authorized project lead submits an AI plan generation request and both rate limit and monthly quota have available capacity
- **THEN** the backend increments the persistent MySQL usage count, increments the Redis rate limit window, and proceeds with plan generation

#### Scenario: Exceeded monthly quota rejected
- **WHEN** an AI plan generation request is submitted for a project whose current period usage has reached its plan entitlement (e.g. 20 for FREE)
- **THEN** the backend rejects the request with HTTP 429 Too Many Requests with code `QUOTA_EXCEEDED` without calling the LLM

#### Scenario: Exceeded burst rate limit rejected
- **WHEN** an AI plan generation request is submitted after exceeding the tier's per-minute rate limit (e.g. >3 req/min for FREE)
- **THEN** the backend rejects the request with HTTP 429 Too Many Requests with code `RATE_LIMIT_EXCEEDED` and includes `Retry-After` metadata

#### Scenario: Graceful degradation during Redis disruption
- **WHEN** Redis is temporarily unreachable or fails
- **THEN** the system logs a warning, falls back gracefully to MySQL quota validation, and permits valid un-exceeded operations without application crash

---

### Requirement: Subscription and Usage Inspection Endpoints
The system SHALL provide authenticated endpoints under `/api/v1/subscriptions`:
- `GET /api/v1/subscriptions/plan`: Returns active subscription tier, status, and period timestamps for the authorized project.
- `GET /api/v1/subscriptions/usage`: Returns usage metric count, entitlement limit, remaining quota, and utilization percentage.
- `GET /api/v1/subscriptions/entitlements`: Returns feature limits and quotas for the project's current tier.
- `POST /api/v1/subscriptions/upgrade-request`: Accepts `{"project_id": "...", "requested_tier": "..."}` and upgrades the plan tier for demo workflows.

#### Scenario: Unauthorized user from different project rejected (Workspace Isolation)
- **WHEN** a user who is not a member of `project_id` attempts to retrieve subscription details or usage
- **THEN** the backend rejects the request with HTTP 403 Forbidden with code `FORBIDDEN`

---

### Requirement: Redis Health Monitoring
The endpoint `GET /api/v1/health` SHALL inspect both MySQL and Redis connectivity.

#### Scenario: Healthy state when both MySQL and Redis are operational
- **WHEN** an authenticated or unauthenticated client requests `GET /api/v1/health` while MySQL and Redis are both reachable
- **THEN** the system returns HTTP 200 with `status: "healthy"` and detailed connectivity indicators

#### Scenario: Degraded state when Redis is unreachable
- **WHEN** an unauthenticated client requests `GET /api/v1/health` while Redis is unreachable but MySQL is reachable
- **THEN** the system returns HTTP 200 with `status: "degraded"` indicating cache unavailability

