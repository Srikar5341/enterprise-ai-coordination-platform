# Android Mobile Application

---

## 1. Subsystem Scope
The Android mobile application provides an on-the-go operational tracking and recovery interface for engineering leads and team members:
- Mobile-first dashboard for operational status and active milestones
- Blocker and disruption reporting from mobile devices
- Push and in-app alerts for blockers and pending deadline reminders
- Mobile review, fine-tuning, and approval of recovery plans
- Integration with the shared backend API under `/api/v1`

---

## 2. Ownership & Technology Stack
- **Owner**: Member 3 (Android Mobile Application)
- **Primary Stack (Decided)**:
  - Language: Kotlin
  - UI Toolkit: Jetpack Compose
  - Architecture: MVVM (Model-View-ViewModel) + Repository Pattern
  - Networking: Retrofit + OkHttp
  - Concurrency & Asynchronous State: Kotlin Coroutines + Flow
  - Navigation: Navigation Compose
- **Boundaries**: Uses the identical `/api/v1` REST API and schemas as the web client; no independent business rule implementations or direct database access.

---

## 3. Backend Integration & Locked Port
The Android client interacts with the shared FastAPI backend running on locked default port **12345**:
- **Android Emulator API Base**: `http://10.0.2.2:12345/api/v1` (maps to host `localhost:12345`)
- **Default Local Backend**: `http://localhost:12345`
- **FastAPI Documentation**: `http://localhost:12345/docs`
- **OpenAPI Schema**: `http://localhost:12345/openapi.json`

---

## 4. Implementation Status
> **Implementation Notice**: **Not yet implemented (0% complete)**.
> No Android source code, Gradle scripts, manifests, or scaffolding have been generated. Implementation will begin only after OpenAPI schema availability and approved OpenSpec change proposals.
