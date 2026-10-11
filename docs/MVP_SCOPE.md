# MVP Scope & Roadmap

---

## 1. Executive Summary

The Minimum Viable Product (MVP) focuses strictly on demonstrating the coherent end-to-end recovery loop for technology delivery teams, exemplified by a Friday production release scenario. The MVP emphasizes architectural integrity, deterministic safety gates, and unified backend coordination over feature sprawl.

---

## 2. In-Scope MVP Features

### A. Operational Planning & Goal Intake
- Submission of natural-language operational instructions and release targets via Web and Android clients.
- Hosted LLM prompt orchestration to produce structured task breakdowns and proposed dependencies.
- Plan validation checking for syntax, cycle-free dependencies, and reasonable task durations.

### B. Deterministic Allocation Engine
- Team member profiles including verified technical skills, current capacity, availability windows, and assigned workloads.
- Quantitative candidate matching ranking eligible members for tasks based on constraint satisfaction.
- Rejection of unqualified candidates and detection of oversubscribed resources.

### C. Blocker Tracking & Blast-Radius Calculation
- Explicit registration of blockers (external dependency failures, technical hurdles, team member unavailability).
- Deterministic graph traversal to calculate direct and transitive downstream impact across dependent tasks.
- Calculation of the proposed blast-radius heuristic score ($B = 100 \times (0.4D + 0.4T + 0.2R)$) for comparative impact visualization.

### D. Recovery Engine & Human Approval
- Generation of structured recovery alternatives:
  - **Fastest**: Minimizes critical path delay.
  - **Balanced**: Balances deadline preservation with team workload distribution.
  - **Lowest Cost**: Only calculated when verified cost metrics exist.
- Human review, manual fine-tuning, and explicit approval by an authorized team lead.
- Mandatory pre-execution revalidation against real-time MySQL state to prevent stale-state execution.
- Atomic state update applying reassignments, revised deadlines, and dependency modifications.
- Post-execution verification confirming database state matches the approved plan.

### E. Reminders & Notifications
- Reminders for upcoming task deadlines and unresolved blockers (aligned with hackathon problem statement).
- Notification list and unread count endpoints consumed by both clients.

---

## 3. Explicit MVP Exclusions & Deferred Features

The following items are **explicitly excluded** from the MVP:

| Category | Excluded Feature | Rationale |
| :--- | :--- | :--- |
| **Architecture** | Distributed Microservices | Unnecessary operational overhead for hackathon MVP. |
| **Infrastructure** | Redis / MinIO / Nginx / Multiple Replicas | Single FastAPI instance with MySQL 8 handles expected MVP load. |
| **Real-time** | WebSockets / Server-Sent Events | Standard REST polling simplifies client-server synchronization. |
| **AI** | Autonomous Database Mutation | Strict guardrail: all state changes require deterministic approval. |
| **AI** | RAG (Retrieval-Augmented Generation) | Context windows of modern hosted LLMs easily accommodate MVP task graphs. |
| **AI** | Reinforcement Learning (RL) | Unvalidated research concept; out of scope. |
| **Commercial** | Payment Gateway / Stripe Integration | Subscriptions are represented via demo/mock endpoints only. |
| **Logic** | Heuristic Cost Inventions | Fictitious cost estimations are forbidden. |

---

## 4. Post-MVP Roadmap

### Phase 2: Enhanced Real-Time & Integrations
- WebSockets for instant multi-user recovery collaboration.
- Webhook integrations with GitHub/GitLab PRs and Jira issues.
- Background task queues (e.g., Celery or RQ) for heavy graph analyses.

### Phase 3: Advanced Intelligence & Analytics
- Historical team velocity and estimation variance tracking.
- Contextual vector retrieval (RAG) for multi-year organizational documentation.
- Automated calendar and leave management synchronization (Google Calendar / Outlook).

### Phase 4: Enterprise Scale
- Microservice decomposition of the recovery and allocation engines if compute requirements diverge.
- Multi-region database replication and enterprise SSO (SAML/Okta).
