/**
 * Local test fixture — a contract-shaped stub of the Renova FastAPI backend.
 *
 * IMPORTANT: this is NOT the real backend. It exists only to verify the
 * frontend wiring in a browser without the shared FastAPI server (which is
 * not reachable from this workspace — see INTEGRATION_NOTES.md blocker B4).
 * It implements exactly the routes from the authoritative OpenAPI spec
 * (docs/openapi.json v0.1.0): the public health check, the five protected
 * goal-to-task routes, the documented error envelope and Bearer-token
 * checking, with a tiny in-memory store.
 *
 * Run:   bun web/tests/fastapi-fixture.ts   (listens on port 12345)
 */
const PORT = 12345;
const BASE = "/api/v1";

type ProposalStatus = "GENERATED" | "VALIDATED" | "APPROVED" | "REJECTED" | "STALE" | "PERSISTENCE_FAILED";

interface Proposal {
  proposal_id: string;
  goal_id: string;
  project_id: string;
  status: ProposalStatus;
  tasks: Array<{ temp_id: string; title: string; description: string; estimated_hours: number; required_skills: string[] }>;
  dependencies: Array<{ prerequisite_temp_id: string; dependent_temp_id: string }>;
  created_at: string;
  expires_at: string;
}

const goals = new Map<string, { id: string; project_id: string; title: string; description: string | null; target_date: string; status: string }>();
const proposals = new Map<string, Proposal>();
let goalSeq = 0;
let proposalSeq = 0;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...CORS } });
}
function envelopeError(status: number, code: string, message: string, details?: unknown) {
  return json({ error: { code, message, ...(details ? { details } : {}) } }, status);
}

async function handler(req: Request): Promise<Response> {
  /* CORS preflight — a real FastAPI app answers this via CORSMiddleware. */
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "");

  /* GET /api/v1/health — public. */
  if (path === `${BASE}/health` && req.method === "GET") {
    return json({ status: "healthy", version: "0.1.0", database: "connected", environment: "local" });
  }

  if (!path.startsWith(BASE)) return envelopeError(404, "not_found", `Unknown path ${path}`);

  /* Bearer check on all protected routes. */
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ") || auth.length < 12) {
    return envelopeError(401, "unauthenticated", "A valid Bearer token is required.");
  }
  await new Promise((r) => setTimeout(r, 250)); // small latency to see pending states

  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};

  /* POST /api/v1/projects/{project_id}/goals — GoalCreateRequest → 201 GoalResponse */
  const goalMatch = path.match(/^\/api\/v1\/projects\/([^/]+)\/goals$/);
  if (goalMatch && req.method === "POST") {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const targetDate = typeof body.target_date === "string" ? body.target_date : "";
    if (title.length < 3 || title.length > 255) {
      return envelopeError(422, "validation_error", "The goal title must be 3–255 characters.", { title });
    }
    if (!targetDate || new Date(targetDate).getTime() <= Date.now()) {
      return envelopeError(422, "validation_error", "target_date must be a UTC date-time in the future.", { target_date: targetDate });
    }
    const id = `goal-${++goalSeq}`;
    const goal = { id, project_id: goalMatch[1], title, description: description || null, target_date: new Date(targetDate).toISOString(), status: "PENDING_PLANNING" };
    goals.set(id, goal);
    return json({ ...goal, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, 201);
  }

  /* POST /api/v1/ai/plan/generate — PlanGenerateRequest → 201 PlanProposalResponse */
  if (path === `${BASE}/ai/plan/generate` && req.method === "POST") {
    const goalId = typeof body.goal_id === "string" ? body.goal_id : "";
    const goal = goals.get(goalId);
    if (!goal) return envelopeError(404, "not_found", `Unknown goal ${goalId || "(missing)"}.`);
    const id = `prop-${++proposalSeq}`;
    const proposal: Proposal = {
      proposal_id: id,
      goal_id: goalId,
      project_id: goal.project_id,
      status: "GENERATED",
      tasks: [
        { temp_id: "T1", title: "Confirm scope and success criteria", description: "Clarify the outcome and constraints with stakeholders.", estimated_hours: 4, required_skills: ["Planning"] },
        { temp_id: "T2", title: "Implement the core change", description: "Do the main engineering work for the goal.", estimated_hours: 16, required_skills: ["Implementation"] },
        { temp_id: "T3", title: "Verify and hand over", description: "Validate the result and document the handover.", estimated_hours: 6, required_skills: ["QA"] },
      ],
      dependencies: [
        { prerequisite_temp_id: "T1", dependent_temp_id: "T2" },
        { prerequisite_temp_id: "T2", dependent_temp_id: "T3" },
      ],
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    };
    proposals.set(id, proposal);
    goal.status = "PLANNED";
    /* Spec behavior: the 201 response IS the full PlanProposalResponse. */
    return json(proposal, 201);
  }

  /* GET /api/v1/ai/plan-proposals/{id} */
  const propMatch = path.match(/^\/api\/v1\/ai\/plan-proposals\/([^/]+)$/);
  if (propMatch && req.method === "GET") {
    const p = proposals.get(propMatch[1]);
    if (!p) return envelopeError(404, "not_found", "Proposal not found.");
    return json(p);
  }

  /* POST /api/v1/ai/plan-proposals/{id}/approve → 200 ProposalApprovalResponse */
  const decideMatch = path.match(/^\/api\/v1\/ai\/plan-proposals\/([^/]+)\/(approve|reject)$/);
  if (decideMatch && req.method === "POST") {
    const p = proposals.get(decideMatch[1]);
    if (!p) return envelopeError(404, "not_found", "Proposal not found.");
    if (p.status === "APPROVED" || p.status === "REJECTED") {
      return envelopeError(409, "proposal_already_decided", `The proposal was already ${p.status.toLowerCase()}.`, { proposal_id: p.proposal_id, status: p.status });
    }
    if (decideMatch[2] === "approve") {
      p.status = "APPROVED";
      const goal = goals.get(p.goal_id);
      if (goal) goal.status = "IN_PROGRESS";
      return json(
        {
          proposal_id: p.proposal_id,
          goal_id: p.goal_id,
          status: "APPROVED",
          created_tasks_count: p.tasks.length,
          created_dependencies_count: p.dependencies.length,
          task_ids: p.tasks.map((t) => `task-${t.temp_id}`),
        },
        200
      );
    }
    p.status = "REJECTED";
    const notes = typeof (body as { notes?: unknown }).notes === "string" ? ((body as { notes: string }).notes) : null;
    return json({ proposal_id: p.proposal_id, goal_id: p.goal_id, status: "REJECTED", notes }, 200);
  }

  return envelopeError(404, "not_found", `No route for ${req.method} ${path}`);
}

Bun.serve({ port: PORT, fetch: (req) => handler(req).catch((e) => envelopeError(500, "server_error", String(e))) });
console.log(`[fastapi-fixture] OpenAPI-shaped stub listening on http://localhost:${PORT}${BASE}`);
