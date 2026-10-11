/**
 * Focused vitest suite for the FastAPI HTTP adapter + goal-to-task mapping.
 * Schemas follow the authoritative OpenAPI spec (docs/openapi.json).
 * These are unit/contract tests against a stubbed fetch — NOT a claim of live
 * backend verification (see INTEGRATION_NOTES.md § Verification).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  API_TOKEN_STORAGE_KEY,
  FastApiClient,
  backendProposalToPlanProposal,
  joinApiUrl,
  normalizeBackendProposal,
  normalizeDependencyEdges,
  parseFastApiError,
  type AccessTokenProvider,
} from "@/lib/api/fastapi";
import { ApiError } from "@/lib/api/types";

const BASE = "http://localhost:12345/api/v1";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(body === undefined ? "" : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeClient(opts: { token?: string | null; fetchImpl: typeof fetch }) {
  const tokenProvider: AccessTokenProvider = { getToken: () => (opts.token === undefined ? null : opts.token) };
  return new FastApiClient({ baseUrl: BASE, tokenProvider, fetchImpl: opts.fetchImpl });
}

/* Spec-shaped fixtures (docs/openapi.json) --------------------------------- */

const SPEC_PROPOSAL = {
  proposal_id: "prop-1",
  goal_id: "goal-1",
  project_id: "proj-1",
  status: "GENERATED",
  tasks: [
    {
      temp_id: "T1",
      title: "Confirm scope with stakeholders",
      description: "Collect requirements and confirm the delivery scope.",
      estimated_hours: 3,
      required_skills: ["communication"],
    },
    {
      temp_id: "T2",
      title: "Implement the core module",
      description: "Build the core module against the confirmed scope.",
      estimated_hours: 12,
      required_skills: ["typescript", "react"],
    },
  ],
  dependencies: [{ prerequisite_temp_id: "T1", dependent_temp_id: "T2" }],
  created_at: "2025-01-15T10:00:00Z",
  expires_at: "2030-01-16T10:00:00Z",
};

const SPEC_GOAL_RESPONSE = {
  id: "goal-123",
  project_id: "proj-1",
  title: "Ship payments reconciliation",
  description: "Ship the payments reconciliation module.",
  target_date: "2030-02-01T23:59:59.000Z",
  status: "PENDING_PLANNING",
  created_at: "2025-01-15T10:00:00Z",
  updated_at: "2025-01-15T10:00:00Z",
};

/* -------------------------------------------------------------------------- */

describe("joinApiUrl", () => {
  it("joins base + path without double or missing slashes", () => {
    expect(joinApiUrl("http://x/api/v1", "/health")).toBe("http://x/api/v1/health");
    expect(joinApiUrl("http://x/api/v1/", "health")).toBe("http://x/api/v1/health");
    expect(joinApiUrl("http://x/api/v1/", "/health")).toBe("http://x/api/v1/health");
  });
});

describe("parseFastApiError", () => {
  it("parses the structured error envelope", () => {
    const err = parseFastApiError(409, { error: { code: "goal_conflict", message: "Goal already planned.", details: { goal_id: "g1" } } });
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect(err.code).toBe("goal_conflict");
    expect(err.message).toBe("Goal already planned.");
    expect(err.details).toEqual({ goal_id: "g1" });
  });

  it("falls back to FastAPI's { detail: string } form", () => {
    const err = parseFastApiError(403, { detail: "Not authorized" });
    expect(err.code).toBe("forbidden");
    expect(err.message).toBe("Not authorized");
  });

  it("renders FastAPI validation arrays readably", () => {
    const err = parseFastApiError(422, {
      detail: [{ loc: ["body", "title"], msg: "String should have at least 3 characters", type: "string_too_short" }],
    });
    expect(err.code).toBe("validation_error");
    expect(err.message).toContain("title");
    expect(err.message).toContain("3 characters");
  });

  it("maps statuses to default codes for non-JSON bodies", () => {
    expect(parseFastApiError(401, null).code).toBe("unauthenticated");
    expect(parseFastApiError(500, null).code).toBe("server_error");
    expect(parseFastApiError(400, null).code).toBe("http_error");
  });
});

describe("createGoal (POST /projects/{project_id}/goals)", () => {
  it("sends the spec's GoalCreateRequest body (title, description, target_date)", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(SPEC_GOAL_RESPONSE, 201));
    const client = makeClient({ token: "jwt", fetchImpl: fetchImpl as unknown as typeof fetch });

    const ref = await client.createGoal("proj-1", {
      title: "Ship payments reconciliation",
      description: "Ship the payments reconciliation module.",
      targetDate: "2030-02-01T23:59:59.000Z",
    });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE}/projects/proj-1/goals`);
    expect(init.method).toBe("POST");
    const body = JSON.parse(String(init.body));
    expect(body).toEqual({
      title: "Ship payments reconciliation",
      target_date: "2030-02-01T23:59:59.000Z",
      description: "Ship the payments reconciliation module.",
    });
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer jwt");
    expect(ref.id).toBe("goal-123");
    expect(ref.projectId).toBe("proj-1");
    expect(ref.status).toBe("PENDING_PLANNING");
  });

  it("omits description when empty and reads the id from GoalResponse.id", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ...SPEC_GOAL_RESPONSE, description: null }, 201));
    const client = makeClient({ token: "jwt", fetchImpl: fetchImpl as unknown as typeof fetch });
    const ref = await client.createGoal("proj-1", { title: "Title", description: "", targetDate: "2030-02-01T23:59:59.000Z" });
    const body = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as unknown as [string, RequestInit])[1].body));
    expect(body.description).toBeUndefined();
    expect(ref.id).toBe("goal-123");
  });

  it("rejects a 201 response without a goal id as invalid_response", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ unexpected: true }, 201));
    const client = makeClient({ token: "jwt", fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(client.createGoal("proj-1", { title: "Title", description: "d", targetDate: "2030-02-01T23:59:59.000Z" }))
      .rejects.toMatchObject({ code: "invalid_response" });
  });

  it("throws validation_error before hitting the network when title is too short", async () => {
    const fetchImpl = vi.fn();
    const client = makeClient({ token: "jwt", fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(client.createGoal("proj-1", { title: "ab", description: "d", targetDate: "2030-02-01T23:59:59.000Z" }))
      .rejects.toMatchObject({ code: "validation_error" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("generatePlanProposal (POST /ai/plan/generate)", () => {
  it("sends goal_id plus additional_instructions and parses the 201 full-proposal response", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(SPEC_PROPOSAL, 201));
    const client = makeClient({ token: "jwt", fetchImpl: fetchImpl as unknown as typeof fetch });

    const { proposalId, proposal } = await client.generatePlanProposal("goal-123", "Respect the vendor sandbox outage.");

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE}/ai/plan/generate`);
    expect(JSON.parse(String(init.body))).toEqual({ goal_id: "goal-123", additional_instructions: "Respect the vendor sandbox outage." });
    expect(proposalId).toBe("prop-1");
    expect(proposal!.tasks).toHaveLength(2);
    expect(proposal!.tasks[1].dependsOn).toEqual(["T1"]);
  });

  it("follows up with a GET when the response only contains a proposal id", async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      String(url).endsWith("/ai/plan/generate")
        ? jsonResponse({ proposal_id: "prop-9" }, 201)
        : jsonResponse(SPEC_PROPOSAL, 200)
    );
    const client = makeClient({ token: "jwt", fetchImpl: fetchImpl as unknown as typeof fetch });
    const { proposalId, proposal } = await client.generatePlanProposal("goal-123");
    expect(proposalId).toBe("prop-9");
    expect(proposal).toBeNull();
  });

  it("rejects contract mismatches as invalid_response", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ hello: "world" }, 201));
    const client = makeClient({ token: "jwt", fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(client.generatePlanProposal("goal-123")).rejects.toMatchObject({ code: "invalid_response" });
  });
});

describe("proposal normalization (spec shapes)", () => {
  it("normalizes temp_id tasks, required_skills, edge deps and expiry", () => {
    const p = normalizeBackendProposal(SPEC_PROPOSAL);
    expect(p.id).toBe("prop-1");
    expect(p.goalId).toBe("goal-1");
    expect(p.status).toBe("generated");
    expect(p.expiresAt).toBe("2030-01-16T10:00:00Z");
    expect(p.tasks[0].id).toBe("T1");
    expect(p.tasks[0].skills).toEqual(["communication"]);
    expect(p.tasks[0].estimateHours).toBe(3);
    expect(p.tasks[1].dependsOn).toEqual(["T1"]);
  });

  it("maps the dependency edge list via prerequisite_temp_id/dependent_temp_id", () => {
    const map = normalizeDependencyEdges(SPEC_PROPOSAL);
    expect(map.get("T2")).toEqual(["T1"]);
  });

  it("surfaces unknown statuses raw instead of guessing", () => {
    const p = normalizeBackendProposal({ ...SPEC_PROPOSAL, status: "SOMETHING_NEW" });
    expect(p.status).toBe("something_new");
  });
});

describe("backendProposalToPlanProposal", () => {
  it("treats only APPROVED as confirmed; other statuses stay reviewable", () => {
    const approved = backendProposalToPlanProposal(normalizeBackendProposal({ ...SPEC_PROPOSAL, status: "APPROVED" }), "goal-1");
    expect(approved.status).toBe("confirmed");

    for (const status of ["GENERATED", "VALIDATED", "REJECTED", "STALE", "PERSISTENCE_FAILED"]) {
      const p = backendProposalToPlanProposal(normalizeBackendProposal({ ...SPEC_PROPOSAL, status }), "goal-1");
      expect(p.status).toBe("proposed");
    }
  });

  it("preserves backend id/status/expiry and applies no fabricated fields", () => {
    const p = backendProposalToPlanProposal(normalizeBackendProposal(SPEC_PROPOSAL), "goal-1");
    expect(p.backendId).toBe("prop-1");
    expect(p.backendStatus).toBe("generated");
    expect(p.backendExpiresAt).toBe("2030-01-16T10:00:00Z");
    expect(p.tasks[0].suggestedPriority).toBe("medium"); // neutral default, no invented priority
    expect(p.tasks[0].dueDate).toBeUndefined(); // no fabricated dates
    expect(p.summary).toBe(""); // spec has no summary — never fabricated
  });
});

describe("approve / reject decisions", () => {
  it("approve sends NO body and surfaces the ProposalApprovalResponse counts", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(
        {
          proposal_id: "prop-1",
          goal_id: "goal-1",
          status: "APPROVED",
          created_tasks_count: 2,
          created_dependencies_count: 1,
          task_ids: ["task-a", "task-b"],
        },
        200
      )
    );
    const client = makeClient({ token: "jwt", fetchImpl: fetchImpl as unknown as typeof fetch });
    const decision = await client.approvePlanProposal("prop-1");
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.body).toBeUndefined(); // spec: no request body for approve
    expect(decision.status).toBe("approved");
    expect(decision.createdTasksCount).toBe(2);
    expect(decision.createdDependenciesCount).toBe(1);
    expect(decision.taskIds).toEqual(["task-a", "task-b"]);
  });

  it("reject sends { notes } and surfaces ProposalRejectResponse", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ proposal_id: "prop-1", goal_id: "goal-1", status: "REJECTED", notes: "Needs a smaller scope." }, 200)
    );
    const client = makeClient({ token: "jwt", fetchImpl: fetchImpl as unknown as typeof fetch });
    const decision = await client.rejectPlanProposal("prop-1", "Needs a smaller scope.");
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ notes: "Needs a smaller scope." });
    expect(decision.status).toBe("rejected");
    expect(decision.notes).toBe("Needs a smaller scope.");
  });

  it("reject without notes sends an empty object", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ proposal_id: "prop-1", goal_id: "goal-1", status: "REJECTED" }, 200));
    const client = makeClient({ token: "jwt", fetchImpl: fetchImpl as unknown as typeof fetch });
    await client.rejectPlanProposal("prop-1");
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({});
  });

  it("maps 409 conflicts on decisions to the structured envelope", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: { code: "proposal_not_decidable", message: "Proposal already decided." } }, 409));
    const client = makeClient({ token: "jwt", fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(client.approvePlanProposal("prop-1")).rejects.toMatchObject({ status: 409, code: "proposal_not_decidable" });
  });
});

describe("healthCheck (GET /health)", () => {
  it("returns ok for a healthy backend", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ status: "healthy", version: "0.1.0", database: "connected", environment: "local" }, 200)
    );
    const client = makeClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const health = await client.healthCheck();
    expect(health.ok).toBe(true);
    expect(health.database).toBe("connected");
  });

  it("does not throw for a 503 degraded backend", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 503 }));
    const client = makeClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const health = await client.healthCheck();
    expect(health.ok).toBe(false);
    expect(health.status).toBe("degraded");
  });
});

describe("auth + transport", () => {
  it("attaches Bearer only when a token exists; 401 messages differ", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: { code: "unauthenticated", message: "x" } }, 401));
    const withToken = makeClient({ token: "jwt", fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(withToken.getPlanProposal("prop-1")).rejects.toMatchObject({ status: 401 });
    expect(((fetchImpl.mock.calls[0] as unknown as unknown as [string, RequestInit])[1].headers as Record<string, string>).Authorization).toBe("Bearer jwt");

    const withoutToken = makeClient({ token: null, fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(withoutToken.getPlanProposal("prop-1")).rejects.toSatisfy((e: ApiError) => {
      expect(e.status).toBe(401);
      expect(e.message).toContain("provisioning");
      return true;
    });
  });

  it("never sends a token when none is provisioned", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(SPEC_PROPOSAL, 200));
    const client = makeClient({ token: null, fetchImpl: fetchImpl as unknown as typeof fetch });
    await client.getPlanProposal("prop-1");
    const headers = (fetchImpl.mock.calls[0] as unknown as unknown as [string, RequestInit])[1].headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it("maps transport failures to network_error with the base URL", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const client = makeClient({ token: "jwt", fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(client.healthCheck()).rejects.toSatisfy((e: ApiError) => {
      expect(e.code).toBe("network_error");
      expect(e.message).toContain(BASE);
      return true;
    });
  });
});

describe("goalRefStore", () => {
  beforeEach(() => window.sessionStorage.clear());
  afterEach(() => window.sessionStorage.clear());

  it("registers goal refs and updates the proposal id without conflating ids", async () => {
    const { goalRefStore } = await import("@/lib/api/fastapi");
    goalRefStore.register({ goalId: "goal-1", projectId: "proj-1", title: "T", goal: "G", createdAt: new Date().toISOString() });
    expect(goalRefStore.get("goal-1")!.proposalId).toBeUndefined();
    goalRefStore.setProposalId("goal-1", "prop-1");
    const ref = goalRefStore.get("goal-1")!;
    expect(ref.goalId).toBe("goal-1");
    expect(ref.proposalId).toBe("prop-1");
    expect(ref.goalId).not.toBe(ref.proposalId);
  });
});

describe("localStorage token helpers", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it("stores and clears the manually-provisioned API token", async () => {
    const { setStoredApiToken, clearStoredApiToken } = await import("@/lib/api/fastapi");
    setStoredApiToken("abc");
    expect(window.localStorage.getItem(API_TOKEN_STORAGE_KEY)).toBe("abc");
    clearStoredApiToken();
    expect(window.localStorage.getItem(API_TOKEN_STORAGE_KEY)).toBeNull();
  });
});
