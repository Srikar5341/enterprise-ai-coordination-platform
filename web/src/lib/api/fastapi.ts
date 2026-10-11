/**
 * FastAPI backend adapter — verified goal-to-task contract slice.
 *
 * This module is the ONLY place that talks to the shared FastAPI backend.
 * It implements exactly the routes defined in the authoritative OpenAPI
 * specification (`docs/openapi.json`, version 0.1.0 "Enterprise AI Team
 * Coordination Platform"):
 *
 *   GET  /api/v1/health                                  (public)
 *   POST /api/v1/projects/{project_id}/goals             (Bearer JWT)
 *   POST /api/v1/ai/plan/generate                        (Bearer JWT)
 *   GET  /api/v1/ai/plan-proposals/{proposal_id}         (Bearer JWT)
 *   POST /api/v1/ai/plan-proposals/{proposal_id}/approve (Bearer JWT)
 *   POST /api/v1/ai/plan-proposals/{proposal_id}/reject  (Bearer JWT)
 *
 * The base URL is configurable (VITE_OPSPILOT_API_BASE_URL, default
 * http://localhost:12345/api/v1). Protected endpoints require Bearer JWT
 * authentication; the token comes from a replaceable AccessTokenProvider —
 * NEVER from the mock demo session, and no mock token is ever sent as if
 * it were valid.
 *
 * CONTRACT STATUS
 * ---------------
 * Request/response schemas now follow the OpenAPI specification directly
 * (previously documented assumptions A1–A8 in INTEGRATION_NOTES.md are
 * resolved). Response parsing stays tolerant about OPTIONAL fields but is
 * strict about the fields the flow cannot proceed without — a mismatch
 * throws `invalid_response` instead of rendering fabricated data.
 */

import { ApiError, type PlanProposal, type PlanTask, type TaskPriority } from "./types";

/* ------------------------------------------------------------------ */
/* Verified routes                                                     */
/* ------------------------------------------------------------------ */

export const FASTAPI_ROUTES = {
  health: () => "/health",
  createGoal: (projectId: string) => `/projects/${encodeURIComponent(projectId)}/goals`,
  generatePlan: () => "/ai/plan/generate",
  planProposal: (proposalId: string) => `/ai/plan-proposals/${encodeURIComponent(proposalId)}`,
  approvePlanProposal: (proposalId: string) => `/ai/plan-proposals/${encodeURIComponent(proposalId)}/approve`,
  rejectPlanProposal: (proposalId: string) => `/ai/plan-proposals/${encodeURIComponent(proposalId)}/reject`,
} as const;

/** Join the configured base URL and a route path safely (no double/missing slashes). */
export function joinApiUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

/* ------------------------------------------------------------------ */
/* Access-token provider                                               */
/* ------------------------------------------------------------------ */

/**
 * Replaceable source of the backend access token. The production mechanism
 * (real login against the backend / approved demo-user provisioning) is not
 * decided yet — see INTEGRATION_NOTES.md (blocker B2). Until then the default
 * provider reads a manually-provisioned token from localStorage, which allows
 * local end-to-end verification without inventing auth endpoints.
 */
export interface AccessTokenProvider {
  getToken(): string | null;
}

export const API_TOKEN_STORAGE_KEY = "opspilot.api-token.v1";

export class LocalStorageTokenProvider implements AccessTokenProvider {
  getToken(): string | null {
    if (typeof window === "undefined") return null;
    try {
      const token = window.localStorage.getItem(API_TOKEN_STORAGE_KEY);
      return token && token.trim() ? token.trim() : null;
    } catch {
      return null;
    }
  }
}

/** Manually provision an API token (documented in INTEGRATION_NOTES.md). Not a login flow. */
export function setStoredApiToken(token: string) {
  if (typeof window !== "undefined") window.localStorage.setItem(API_TOKEN_STORAGE_KEY, token.trim());
}

export function clearStoredApiToken() {
  if (typeof window !== "undefined") window.localStorage.removeItem(API_TOKEN_STORAGE_KEY);
}

/* ------------------------------------------------------------------ */
/* Error handling — structured envelope + FastAPI fallbacks            */
/* ------------------------------------------------------------------ */

/** Documented backend error envelope: { error: { code, message, details } }. */
export function parseFastApiError(status: number, payload: unknown): ApiError {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const obj = payload as Record<string, unknown>;
    const err = obj.error;
    if (err && typeof err === "object" && !Array.isArray(err)) {
      const e = err as Record<string, unknown>;
      const code = typeof e.code === "string" && e.code ? e.code : defaultCodeFor(status);
      const message = typeof e.message === "string" && e.message ? e.message : `Request failed (${status}).`;
      const apiError = new ApiError(status, code, message);
      if (e.details !== undefined && e.details !== null) apiError.details = e.details;
      return apiError;
    }
    /* FastAPI's default validation/error body: { detail: "..." } or
       { detail: [{ loc: [...], msg: "...", type: "..." }] } (HTTPValidationError). */
    const detail = obj.detail;
    if (typeof detail === "string" && detail) {
      return new ApiError(status, defaultCodeFor(status), detail);
    }
    if (Array.isArray(detail)) {
      const parts = detail
        .map((d) => {
          if (d && typeof d === "object") {
            const dd = d as Record<string, unknown>;
            const loc = Array.isArray(dd.loc) ? dd.loc.filter((x) => x !== "body").join(".") : "";
            const msg = typeof dd.msg === "string" ? dd.msg : "invalid value";
            return loc ? `${loc}: ${msg}` : msg;
          }
          return String(d);
        })
        .slice(0, 5);
      const message = `The backend rejected the request as invalid — ${parts.join("; ")}.`;
      const apiError = new ApiError(status, "validation_error", message);
      apiError.details = detail;
      return apiError;
    }
  }
  return new ApiError(status, defaultCodeFor(status), `Request failed (${status}).`);
}

function defaultCodeFor(status: number): string {
  if (status === 0) return "network_error";
  if (status === 401) return "unauthenticated";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 422) return "validation_error";
  if (status >= 500) return "server_error";
  return "http_error";
}

/* ------------------------------------------------------------------ */
/* Normalized backend types (per docs/openapi.json)                    */
/* ------------------------------------------------------------------ */

export interface BackendGoalRef {
  id: string;
  projectId?: string;
  title?: string;
  status?: string;
  targetDate?: string;
}

export interface BackendPlanTask {
  /** Backend `temp_id` (e.g. "T1") — proposal-scoped, not a persisted task id. */
  id: string | null;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  skills: string[];
  estimateHours: number | null;
  dueDate: string | null;
  /** temp_ids of prerequisite tasks (must complete before this one). */
  dependsOn: string[];
}

/**
 * Normalized PlanProposalResponse. Status enum per spec: GENERATED | VALIDATED |
 * APPROVED | REJECTED | STALE | PERSISTENCE_FAILED (lower-cased here; unknown
 * values are surfaced raw, never guessed).
 */
export interface BackendPlanProposal {
  id: string;
  goalId: string | null;
  projectId: string | null;
  status: string;
  summary: string;
  generatedAt: string;
  /** Proposal TTL — the backend marks proposals STALE after expiry. */
  expiresAt: string | null;
  tasks: BackendPlanTask[];
  warnings: string[];
}

/** POST …/approve → ProposalApprovalResponse; POST …/reject → ProposalRejectResponse.
 *  Neither carries a full proposal body — the caller re-GETs the proposal so the
 *  rendered state always comes from the backend's confirmation. */
export interface BackendDecisionResult {
  proposalId: string;
  goalId: string | null;
  status: string;
  createdTasksCount?: number;
  createdDependenciesCount?: number;
  taskIds?: string[];
  notes?: string | null;
}

export interface BackendHealth {
  ok: boolean;
  status: string;
  version?: string;
  database?: string;
  environment?: string;
}

/* ------------------------------------------------------------------ */
/* Tolerant field readers                                              */
/* ------------------------------------------------------------------ */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** First present string field among `keys` (trims; returns null when absent). */
function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function pickId(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return null;
}

function pickStringArray(obj: Record<string, unknown>, keys: string[]): string[] {
  for (const k of keys) {
    const v = obj[k];
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim());
  }
  return [];
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

function invalidResponse(what: string, payload: unknown): ApiError {
  const apiError = new ApiError(
    502,
    "invalid_response",
    `The backend response does not match the expected contract (${what}). No data was fabricated — see INTEGRATION_NOTES.md.`
  );
  apiError.details = payload;
  return apiError;
}

/* ------------------------------------------------------------------ */
/* Proposal normalization                                              */
/* ------------------------------------------------------------------ */

/** Spec: ProposedTask.temp_id ("T1", "T2", …). Older tolerant fallbacks kept. */
const TASK_ID_KEYS = ["temp_id", "task_id", "id"];
const DEP_KEYS = ["depends_on", "dependencies", "prerequisites", "dependsOn"];
const STATUS_KEYS = ["status", "state", "proposal_status"];

/** Normalize one proposal task. Dependencies may arrive inline per task or as
 *  the spec's top-level `dependencies` edge list — both are supported. */
export function normalizeBackendTask(raw: unknown, edgeDeps: Map<string, string[]> | null): BackendPlanTask {
  if (!isRecord(raw)) throw invalidResponse("proposal task is not an object", raw);
  const id = pickId(raw, TASK_ID_KEYS);
  const title = pickString(raw, ["title", "name", "summary"]);
  if (!title) throw invalidResponse("proposal task is missing a title", raw);

  let dependsOn = pickStringArray(raw, DEP_KEYS);
  if (dependsOn.length === 0 && edgeDeps && id) {
    dependsOn = edgeDeps.get(id) ?? [];
  }

  return {
    id: id ?? null,
    title,
    description: pickString(raw, ["description", "details"]) ?? "",
    acceptanceCriteria: pickStringArray(raw, ["acceptance_criteria", "acceptanceCriteria", "criteria"]),
    skills: pickStringArray(raw, ["required_skills", "skills", "skill_tags"]),
    estimateHours: pickNumber(raw, ["estimated_hours", "estimate_hours", "estimateHours", "estimate"]),
    dueDate: pickString(raw, ["due_date", "dueDate", "deadline"]),
    dependsOn,
  };
}

/** Build a task-temp-id → prerequisite-temp-ids map from a top-level edge list.
 *  Spec: ProposedDependency { prerequisite_temp_id, dependent_temp_id }.
 *  Tolerant fallbacks for other edge shapes are kept. */
export function normalizeDependencyEdges(raw: unknown): Map<string, string[]> {
  const map = new Map<string, string[]>();
  if (!isRecord(raw)) return map;
  const list = raw.dependencies ?? raw.edges;
  if (!Array.isArray(list)) return map;
  for (const e of list) {
    if (!isRecord(e)) continue;
    const to = pickId(e, ["dependent_temp_id", "to_task_id", "task_id", "dependent_task_id"]);
    const from = pickId(e, ["prerequisite_temp_id", "from_task_id", "prerequisite_task_id", "depends_on_task_id"]);
    if (!to || !from) continue;
    map.set(to, [...(map.get(to) ?? []), from]);
  }
  return map;
}

export function normalizeBackendProposal(raw: unknown): BackendPlanProposal {
  if (!isRecord(raw)) throw invalidResponse("plan proposal is not an object", raw);
  const id = pickId(raw, ["proposal_id", "id"]);
  if (!id) throw invalidResponse("plan proposal is missing an id", raw);

  const edgeDeps = normalizeDependencyEdges(raw);
  const rawTasks = raw.tasks ?? raw.proposed_tasks ?? raw.steps;
  if (!Array.isArray(rawTasks)) throw invalidResponse("plan proposal is missing its tasks list", raw);

  return {
    id,
    goalId: pickId(raw, ["goal_id", "goalId"]),
    projectId: pickId(raw, ["project_id", "projectId"]),
    /* Status enum per spec: GENERATED | VALIDATED | APPROVED | REJECTED |
       STALE | PERSISTENCE_FAILED — lower-cased for stable comparisons;
       unknown values are still surfaced as-is. */
    status: (pickString(raw, STATUS_KEYS) ?? "generated").toLowerCase(),
    /* The spec does not define a summary field — kept tolerant for forward
       compatibility; the UI never fabricates one. */
    summary: pickString(raw, ["summary", "overview", "description"]) ?? "",
    generatedAt: pickString(raw, ["created_at", "generated_at", "createdAt", "timestamp"]) ?? new Date().toISOString(),
    expiresAt: pickString(raw, ["expires_at", "expiresAt", "expiry"]),
    tasks: rawTasks.map((t) => normalizeBackendTask(t, edgeDeps)),
    warnings: pickStringArray(raw, ["warnings", "notes", "caveats"]),
  };
}

/**
 * Map a normalized backend proposal onto the frontend PlanProposal shape.
 * The backend id, raw status and expiry are preserved (`backendId` /
 * `backendStatus` / `backendExpiresAt`) so the UI can render the
 * authoritative state honestly.
 */
export function backendProposalToPlanProposal(p: BackendPlanProposal, workflowId: string): PlanProposal {
  const tasks: PlanTask[] = p.tasks.map((t) => ({
    ...(t.id ? { id: t.id } : {}),
    title: t.title,
    description: t.description,
    acceptanceCriteria: t.acceptanceCriteria,
    skills: t.skills,
    ...(t.estimateHours != null ? { estimateHours: t.estimateHours } : {}),
    ...(t.dueDate ? { dueDate: t.dueDate } : {}),
    dependsOn: t.dependsOn,
    /* The verified contract does not expose a per-task priority — the neutral
       default keeps the existing UI working without inventing data. */
    suggestedPriority: "medium" as TaskPriority,
  }));

  return {
    workflowId,
    /* Backend "approved" is the terminal approved state the UI treats as
       confirmed; every other backend status (generated/validated/rejected/
       stale/persistence_failed/unknown) stays reviewable and is surfaced via
       backendStatus, never fabricated. */
    status: p.status === "approved" ? "confirmed" : "proposed",
    generatedAt: p.generatedAt,
    summary: p.summary,
    tasks,
    warnings: p.warnings,
    backendId: p.id,
    backendStatus: p.status,
    ...(p.expiresAt ? { backendExpiresAt: p.expiresAt } : {}),
  };
}

/* ------------------------------------------------------------------ */
/* Goal references (client-side registry, NOT a persisted model)        */
/* ------------------------------------------------------------------ */

/**
 * Tracks which backend goal/proposal ids belong to a goal submitted through
 * this browser session. This is a client-side convenience registry so the
 * existing `/workflows/{id}/plan` route can address the right backend
 * entities — it does NOT invent a persisted workflow model, and ids are
 * never treated as interchangeable: the URL id slot carries the backend
 * *goal* id, the *proposal* id is tracked here separately.
 */
export interface GoalRef {
  goalId: string;
  projectId: string;
  /** Goal title (GoalCreateRequest.title). */
  title: string;
  /** Goal description (GoalCreateRequest.description). */
  goal: string;
  targetDate?: string;
  /** Extra context captured by the create screen — sent to the plan
   *  generator as PlanGenerateRequest.additional_instructions. */
  context?: string;
  proposalId?: string;
  createdAt: string;
}

const GOAL_REFS_KEY = "opspilot.goalrefs.v1";

function readGoalRefs(): Record<string, GoalRef> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(GOAL_REFS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, GoalRef>) : {};
  } catch {
    return {};
  }
}

function writeGoalRefs(refs: Record<string, GoalRef>) {
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(GOAL_REFS_KEY, JSON.stringify(refs));
    } catch {
      /* storage unavailable — refs degrade to in-memory only */
    }
  }
}

export const goalRefStore = {
  get(goalId: string): GoalRef | null {
    return readGoalRefs()[goalId] ?? null;
  },
  register(ref: GoalRef): void {
    const refs = readGoalRefs();
    refs[ref.goalId] = ref;
    writeGoalRefs(refs);
  },
  setProposalId(goalId: string, proposalId: string): void {
    const refs = readGoalRefs();
    if (refs[goalId]) {
      refs[goalId] = { ...refs[goalId], proposalId };
      writeGoalRefs(refs);
    }
  },
};

/* ------------------------------------------------------------------ */
/* HTTP client for the verified slice                                  */
/* ------------------------------------------------------------------ */

export interface FastApiClientOptions {
  baseUrl: string;
  tokenProvider?: AccessTokenProvider;
  fetchImpl?: typeof fetch;
}

export class FastApiClient {
  private readonly tokenProvider: AccessTokenProvider;
  private readonly fetchImpl: typeof fetch;

  constructor(private options: FastApiClientOptions) {
    /* Default to the localStorage provider so the hand-off token mechanism
       works without extra wiring; callers may inject any AccessTokenProvider. */
    this.tokenProvider = options.tokenProvider ?? new LocalStorageTokenProvider();
    /* Bind window.fetch — calling an unbound reference as a method throws
       "Illegal invocation" in browsers (bun/node's fetch is more forgiving,
       so unit tests alone would not catch this). */
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
  }

  get baseUrl(): string {
    return this.options.baseUrl;
  }

  hasToken(): boolean {
    return !!this.tokenProvider?.getToken();
  }

  private async request(
    method: string,
    path: string,
    body?: unknown,
    opts?: { acceptStatuses?: number[] }
  ): Promise<{ status: number; payload: unknown; text: string }> {
    const url = joinApiUrl(this.options.baseUrl, path);
    const headers: Record<string, string> = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    /* Bearer token only when a real one is provisioned — never a mock token. */
    const token = this.tokenProvider?.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(
        0,
        "network_error",
        `Network error — could not reach the Renova API at ${this.options.baseUrl}. Check that the FastAPI server is running and reachable.`
      );
    }

    let text = "";
    try {
      text = await res.text();
    } catch {
      text = "";
    }

    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }

    if (!res.ok && !opts?.acceptStatuses?.includes(res.status)) {
      const apiError = parseFastApiError(res.status, payload);
      if (res.status === 401) {
        apiError.message = this.hasToken()
          ? "The backend rejected the API session (401). The access token may be expired — request a fresh one."
          : "The backend requires an authenticated session (401). No API access token is configured yet — coordinate with the backend owner on the approved demo-user/token provisioning mechanism (see INTEGRATION_NOTES.md).";
      }
      if (res.status === 409 && !apiError.message) {
        apiError.message = "The backend reports a conflict — the entity was already changed or decided.";
      }
      throw apiError;
    }

    return { status: res.status, payload, text };
  }

  private parseJsonOrThrow(status: number, payload: unknown, text: string): unknown {
    if (payload === null && text) {
      /* Non-JSON 2xx — the contract expects JSON; refuse to guess. */
      throw invalidResponse("success response is not valid JSON", text.slice(0, 200));
    }
    return payload;
  }

  /** GET /health — public connectivity/readiness probe (200 healthy,
   *  503 degraded with the database unreachable). Never throws for 503. */
  async healthCheck(): Promise<BackendHealth> {
    const { status, payload, text } = await this.request("GET", FASTAPI_ROUTES.health(), undefined, { acceptStatuses: [503] });
    const raw = (this.parseJsonOrThrow(status, payload, text) ?? {}) as Record<string, unknown>;
    const health = isRecord(raw) ? raw : {};
    return {
      ok: status === 200,
      status: pickString(health, ["status"]) ?? (status === 200 ? "healthy" : "degraded"),
      version: pickString(health, ["version"]) ?? undefined,
      database: pickString(health, ["database"]) ?? undefined,
      environment: pickString(health, ["environment"]) ?? undefined,
    };
  }

  /** POST /projects/{project_id}/goals
   *  Spec (GoalCreateRequest): { title (required, 3–255), description? (≤4000),
   *  target_date (required, UTC date-time in the future) } → 201 GoalResponse. */
  async createGoal(
    projectId: string,
    input: { title: string; description: string; targetDate: string }
  ): Promise<BackendGoalRef> {
    if (!projectId) throw new ApiError(500, "config_error", "No project id is configured (VITE_OPSPILOT_DEMO_PROJECT_ID). The backend contract has no project-creation endpoint, so a project id must be provisioned externally.");
    if (!input.title || input.title.trim().length < 3) throw new ApiError(422, "validation_error", "The goal title is required (3–255 characters).");
    if (!input.targetDate) throw new ApiError(422, "validation_error", "A target date is required — the backend rejects goals without a future target_date.");
    const body: Record<string, unknown> = {
      title: input.title.trim(),
      target_date: input.targetDate,
    };
    if (input.description && input.description.trim()) body.description = input.description.trim();
    const { payload, text } = await this.request("POST", FASTAPI_ROUTES.createGoal(projectId), body);
    const raw = this.parseJsonOrThrow(201, payload, text);
    if (!isRecord(raw)) throw invalidResponse("goal creation response is not an object", raw);
    const id = pickId(raw, ["id", "goal_id"]);
    if (!id) throw invalidResponse("goal creation response is missing a goal id", raw);
    return {
      id,
      projectId: pickId(raw, ["project_id", "projectId"]) ?? projectId,
      title: pickString(raw, ["title"]) ?? input.title.trim(),
      status: pickString(raw, ["status"]) ?? undefined,
      targetDate: pickString(raw, ["target_date", "targetDate"]) ?? undefined,
    };
  }

  /** POST /ai/plan/generate
   *  Spec (PlanGenerateRequest): { goal_id (required), additional_instructions? }
   *  → 201 PlanProposalResponse (the FULL staged proposal). A tolerant
   *  id-only/nested fallback is kept: when no proposal body arrives, an
   *  explicit GET (generate → retrieve) follows. */
  async generatePlanProposal(goalId: string, additionalInstructions?: string): Promise<{ proposalId: string; proposal: BackendPlanProposal | null }> {
    const body: Record<string, unknown> = { goal_id: goalId };
    if (additionalInstructions && additionalInstructions.trim()) body.additional_instructions = additionalInstructions.trim();
    const { payload, text } = await this.request("POST", FASTAPI_ROUTES.generatePlan(), body);
    const raw = this.parseJsonOrThrow(201, payload, text);
    if (!isRecord(raw)) throw invalidResponse("plan generation response is not an object", raw);
    const nested = isRecord(raw.proposal) ? raw.proposal : isRecord(raw.plan_proposal) ? raw.plan_proposal : null;
    if (nested) {
      const proposal = normalizeBackendProposal(nested);
      return { proposalId: proposal.id, proposal };
    }
    const proposalId = pickId(raw, ["proposal_id", "id"]);
    const hasTasks = Array.isArray(raw.tasks) || Array.isArray(raw.proposed_tasks) || Array.isArray(raw.steps);
    if (proposalId && hasTasks) {
      /* The response body IS the proposal (spec behavior). */
      const proposal = normalizeBackendProposal(raw);
      return { proposalId: proposal.id, proposal };
    }
    if (proposalId) return { proposalId, proposal: null };
    throw invalidResponse("plan generation response contains neither a proposal object nor a proposal id", raw);
  }

  /** GET /ai/plan-proposals/{proposal_id} — the backend refreshes stale state
   *  (goal changed or proposal expired) before responding. */
  async getPlanProposal(proposalId: string): Promise<BackendPlanProposal> {
    const { payload, text } = await this.request("GET", FASTAPI_ROUTES.planProposal(proposalId));
    const raw = this.parseJsonOrThrow(200, payload, text);
    return normalizeBackendProposal(raw);
  }

  /** POST …/approve — spec: no request body; 200 ProposalApprovalResponse
   *  { proposal_id, goal_id, status: "APPROVED", created_tasks_count,
   *  created_dependencies_count, task_ids[] }. The updated proposal is NOT
   *  returned — the caller re-GETs it so the UI only ever reflects
   *  backend-confirmed state. */
  async approvePlanProposal(proposalId: string): Promise<BackendDecisionResult> {
    const { payload, text } = await this.request("POST", FASTAPI_ROUTES.approvePlanProposal(proposalId));
    const raw = this.parseJsonOrThrow(200, payload, text);
    return normalizeDecisionResult(raw, "approved");
  }

  /** POST …/reject — spec: optional body ProposalRejectRequest { notes? };
   *  200 ProposalRejectResponse { proposal_id, goal_id, status: "REJECTED",
   *  notes }. The caller re-GETs the proposal for confirmed state. */
  async rejectPlanProposal(proposalId: string, notes?: string): Promise<BackendDecisionResult> {
    const body: Record<string, unknown> = {};
    if (notes && notes.trim()) body.notes = notes.trim();
    const { payload, text } = await this.request("POST", FASTAPI_ROUTES.rejectPlanProposal(proposalId), body);
    const raw = this.parseJsonOrThrow(200, payload, text);
    return normalizeDecisionResult(raw, "rejected");
  }

  /** Back-compat shim used by IntegratedApiClient — routes to approve/reject. */
  decidePlanProposal(proposalId: string, decision: "approve" | "reject", note?: string): Promise<BackendDecisionResult> {
    return decision === "approve" ? this.approvePlanProposal(proposalId) : this.rejectPlanProposal(proposalId, note);
  }
}

function normalizeDecisionResult(raw: unknown, fallbackStatus: string): BackendDecisionResult {
  if (!isRecord(raw)) throw invalidResponse("decision response is not an object", raw);
  const proposalId = pickId(raw, ["proposal_id", "id"]);
  if (!proposalId) throw invalidResponse("decision response is missing a proposal id", raw);
  const count = (key: string): number | undefined => {
    const v = pickNumber(raw, [key]);
    return v == null ? undefined : v;
  };
  const taskIds = pickStringArray(raw, ["task_ids", "taskIds"]);
  return {
    proposalId,
    goalId: pickId(raw, ["goal_id", "goalId"]),
    status: (pickString(raw, ["status"]) ?? fallbackStatus).toLowerCase(),
    createdTasksCount: count("created_tasks_count"),
    createdDependenciesCount: count("created_dependencies_count"),
    ...(taskIds.length ? { taskIds } : {}),
    notes: pickString(raw, ["notes", "note", "reason"]) ?? null,
  };
}
