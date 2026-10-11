# Architectural Design: Redis Infrastructure & SaaS Subscription / Usage Enforcement

## 1. Context & Architecture Overview

Revora manages operational projects, goals, and AI-generated plans. This change introduces Redis 7 for burst rate limiting and ephemeral state, alongside durable MySQL 8 tables for SaaS subscription tiers and monthly usage records.

```mermaid
flowchart TD
    Client[Client / Web / Android] -->|POST /api/v1/ai/plan/generate| Router[FastAPI API Router]
    Router --> AuthCheck{Project Authorization<br/>(MySQL project_members)}
    AuthCheck -->|Forbidden| Reject403[HTTP 403 Forbidden]
    AuthCheck -->|Authorized| QuotaService[SubscriptionService]

    QuotaService --> RateCheck{Redis Rate Limiter<br/>Sliding Window}
    RateCheck -->|Exceeded| Reject429_Rate[HTTP 429 RATE_LIMIT_EXCEEDED]
    RateCheck -->|Passed| MonthlyCheck{MySQL Usage Check<br/>usage_records}

    MonthlyCheck -->|Quota Exceeded| Reject429_Quota[HTTP 429 QUOTA_EXCEEDED]
    MonthlyCheck -->|Capacity Available| LLMService[LLMService Nemotron 3 Ultra]

    LLMService --> AtomicCommit[Atomic MySQL Persistence<br/>tasks & usage increment]
    AtomicCommit --> Response[HTTP 201 Created Proposal]
```

## 2. Docker Compose Infrastructure
- Service `redis` added using `redis:7-alpine`.
- Health check configured using `redis-cli ping`.
- Port `6379:6379`.
- MySQL volume `mysql_data` preserved completely without disruption.

## 3. Data Models in MySQL 8
- `subscriptions`:
  - `id`: `String(36)` Primary Key
  - `project_id`: `String(36)` Foreign Key to `projects.id` (Unique)
  - `plan_tier`: `String(32)` (`FREE`, `TEAM`, `BUSINESS`)
  - `status`: `String(32)` (`ACTIVE`, `PAST_DUE`, `CANCELLED`)
  - `current_period_start`: `DateTime(timezone=True)`
  - `current_period_end`: `DateTime(timezone=True)`
- `usage_records`:
  - `id`: `String(36)` Primary Key
  - `subscription_id`: `String(36)` Foreign Key to `subscriptions.id`
  - `metric`: `String(64)` (`ai_plan_generations`)
  - `count`: `Integer`
  - `period_start`: `DateTime(timezone=True)`
  - `period_end`: `DateTime(timezone=True)`

## 4. Redis Resilience Pattern
`src/core/redis.py` provides:
- Resilient client initialization with fallback to local state if Redis is offline.
- Try/except boundary around Redis calls in rate limiters to avoid blocking core application logic if the cache node experiences intermittent network failure.
