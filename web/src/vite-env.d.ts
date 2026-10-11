/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "mock" (default — everything demo-backed) or "http" (goal-to-task flow against the shared FastAPI backend). */
  readonly VITE_OPSPILOT_API_MODE?: "mock" | "http";
  /** Base URL of the FastAPI backend, e.g. http://localhost:12345/api/v1 */
  readonly VITE_OPSPILOT_API_BASE_URL?: string;
  /**
   * The verified backend contract starts at POST /projects/{project_id}/goals
   * and has no project-creation/list endpoint, so the project a goal is
   * submitted under must be provisioned externally (integration blocker B1).
   */
  readonly VITE_OPSPILOT_DEMO_PROJECT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
