/**
 * Centralized API layer.
 *
 * - `OpsPilotApi` is the single integration boundary every view codes against.
 * - `MockApiClient` is a development-only adapter backed by realistic seed data.
 *   It simulates latency and can inject failures (see Settings → Demo controls).
 * - `FastApiClient` (in ./fastapi) is the HTTP adapter for the shared FastAPI
 *   backend's VERIFIED goal-to-task contract slice (Bearer JWT, structured
 *   error envelope — schemas per docs/openapi.json). It intentionally does not
 *   implement the full OpsPilotApi interface — endpoints that were assumed in
 *   earlier scaffolding (auth, workspaces, allocation, recovery, …) are not
 *   part of the backend's current contract and inventing them is explicitly
 *   out of scope.
 * - In API mode `http`, `IntegratedApiClient` routes the goal-to-task flow
 *   (submit goal → generate plan → review proposal → approve/reject) to the
 *   FastAPI backend and keeps every other surface on the mock adapter, still
 *   labeled as demo data. In API mode `mock` (the default) everything is demo.
 *
 * The mock adapter NEVER persists anything beyond the current page session and
 * the UI labels demo data accordingly. The backend is authoritative for the
 * integrated slice: nothing is displayed as approved/decided before a
 * successful backend response, and backend ids are never treated as
 * interchangeable (see ./fastapi → goalRefStore).
 */
import type {
  AllocationPlan,
  ApiError as ApiErrorType,
  ApprovalDecision,
  AuditEvent,
  Blocker,
  ImpactAnalysis,
  MockBehavior,
  PlanProposal,
  RecoveryAlternative,
  RecoveryCase,
  RecoveryDecision,
  RiskItem,
  Session,
  Task,
  TaskStatus,
  TeamMember,
  UsageInfo,
  VerificationResult,
  Workflow,
  WorkspaceSettings,
  PlanTask,
  AllocationRecommendation,
} from "./types";
import { ApiError } from "./types";
import * as seed from "./mock-data";
import {
  backendProposalToPlanProposal,
  FastApiClient,
  goalRefStore,
  type AccessTokenProvider,
} from "./fastapi";

/* ------------------------------------------------------------------ */
/* Contract                                                            */
/* ------------------------------------------------------------------ */

export interface OpsPilotApi {
  // Auth
  login(email: string, password: string): Promise<Session>;
  register(input: { name: string; email: string; password: string; organizationName: string }): Promise<Session>;
  requestPasswordReset(email: string): Promise<{ ok: true; message: string }>;
  logout(): Promise<void>;
  getSession(): Promise<Session | null>;

  // Workspace & team
  createWorkspace(input: { name: string; goalHint?: string }): Promise<Session>;
  joinWorkspace(input: { inviteCode: string }): Promise<Session>;
  inviteMember(input: { email: string; role: "team_lead" | "employee"; title?: string }): Promise<{ ok: true; inviteCode: string }>;
  listTeam(): Promise<TeamMember[]>;

  // Workflows & planning
  listWorkflows(params?: { search?: string; status?: string }): Promise<Workflow[]>;
  getWorkflow(id: string): Promise<Workflow>;
  createWorkflow(input: { title?: string; goal: string; targetDate: string; context?: string; memberIds?: string[] }): Promise<{ workflowId: string }>;
  generatePlan(workflowId: string): Promise<PlanProposal>;
  getPlan(workflowId: string): Promise<PlanProposal | null>;
  savePlanTask(workflowId: string, task: PlanTask): Promise<PlanProposal>;
  deletePlanTask(workflowId: string, taskId: string): Promise<PlanProposal>;
  validatePlan(workflowId: string): Promise<{ ok: true; issues: { severity: "error" | "warning"; message: string; taskTitle?: string }[] }>;
  /** API mode returns the backend's ProposalApprovalResponse counts
   *  (created tasks/dependencies) once the backend confirms the approval. */
  confirmPlan(workflowId: string): Promise<{ ok: true; createdTasksCount?: number; createdDependenciesCount?: number; taskIds?: string[] }>;
  /** Discard a plan proposal (the approve counterpart). Mock: the proposal is
   *  dropped and the workflow returns to draft. HTTP mode: backed by the
   *  backend's reject endpoint for backend goals; `notes` maps to the
   *  backend's ProposalRejectRequest.notes (≤4000 chars). */
  rejectPlan(workflowId: string, notes?: string): Promise<{ ok: true }>;

  // Allocation
  getAllocation(workflowId: string): Promise<AllocationPlan>;
  reassignTask(workflowId: string, taskId: string, memberId: string | null): Promise<AllocationRecommendation>;
  confirmAllocation(workflowId: string): Promise<{ ok: true }>;

  // Execution
  getExecution(workflowId: string): Promise<import("./types").ExecutionSnapshot>;
  updateTaskStatus(taskId: string, status: TaskStatus): Promise<Task>;
  reportBlocker(input: { taskId: string; title: string; description: string; severity: import("./types").BlockerSeverity }): Promise<Blocker>;

  // Employee
  listMyTasks(): Promise<(Task & { workflowName: string; prerequisiteTitles: string[]; dependentTitles: string[] })[]>;
  getTask(taskId: string): Promise<Task & { workflowName: string; prerequisiteTitles: string[]; dependentTitles: string[]; blocker?: Blocker }>;
  listApprovedChanges(): Promise<AuditEvent[]>;

  // Recovery engine
  listRecoveryCases(): Promise<RecoveryCase[]>;
  getRecoveryCase(id: string): Promise<RecoveryCase>;
  requestAnalysis(blockerId: string): Promise<ImpactAnalysis>;
  requestAlternatives(analysisId: string): Promise<RecoveryAlternative[]>;
  decideProposal(input: { caseId: string; analysisId: string; alternativeId: string; decision: ApprovalDecision; comment?: string }): Promise<RecoveryDecision>;
  getVerification(decisionId: string): Promise<VerificationResult>;

  // Misc
  listRisks(): Promise<RiskItem[]>;
  listAudit(): Promise<AuditEvent[]>;
  getUsage(): Promise<UsageInfo>;
  getSettings(): Promise<WorkspaceSettings>;
  updateSettings(patch: Partial<WorkspaceSettings>): Promise<WorkspaceSettings>;
  updateProfile(patch: { name?: string; title?: string }): Promise<Session>;

  // Demo controls (mock adapter only)
  getMockBehavior(): MockBehavior;
  setMockBehavior(patch: Partial<MockBehavior>): MockBehavior;
}

/* ------------------------------------------------------------------ */
/* Environment                                                         */
/* ------------------------------------------------------------------ */

/**
 * API mode: "mock" (default — everything demo-backed) or "http" (goal-to-task
 * flow against the shared FastAPI backend; all other surfaces stay mock).
 */
export const API_MODE = (import.meta.env.VITE_OPSPILOT_API_MODE ?? "mock") as "mock" | "http";
/** Base URL of the FastAPI backend (defaults to the local hand-off value). */
export const API_BASE_URL = import.meta.env.VITE_OPSPILOT_API_BASE_URL ?? "http://localhost:12345/api/v1";
/**
 * The verified backend contract starts at `POST /projects/{project_id}/goals`
 * and has no project-creation/list endpoint, so the project a goal is
 * submitted under must be provisioned externally (documented integration
 * blocker — see INTEGRATION_NOTES.md).
 */
export const DEMO_PROJECT_ID = import.meta.env.VITE_OPSPILOT_DEMO_PROJECT_ID ?? "";

/**
 * Derive a backend goal title from free-form goal text. The backend's
 * GoalCreateRequest requires a 3–255 char title; the mock-mode create screen
 * has no dedicated title field, so http-mode submissions fall back to the
 * first line of the goal (truncated) when the screen did not supply one.
 */
export function deriveGoalTitle(goalText: string): string {
  const firstLine = goalText.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  const base = firstLine || goalText.trim() || "Operational goal";
  if (base.length <= 120) return base;
  const cut = base.slice(0, 120);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 60 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * Map the create screen's date-only target ("yyyy-MM-dd") to the backend's
 * required UTC date-time: end of that UTC day, so same-day targets pass the
 * backend's "must be in the future" check. Full ISO strings pass through.
 */
export function toUtcTargetDate(dateStr: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return `${dateStr}T23:59:59.000Z`;
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? dateStr : d.toISOString();
}

/* ------------------------------------------------------------------ */
/* Mock adapter                                                        */
/* ------------------------------------------------------------------ */

const SESSION_KEY = "opspilot.session.v1";
const BEHAVIOR_KEY = "opspilot.mock.v1";

const behavior: MockBehavior = { failureRate: 0, latency: true };

function readBehavior(): MockBehavior {
  if (typeof window === "undefined") return behavior;
  try {
    const raw = window.localStorage.getItem(BEHAVIOR_KEY);
    if (raw) Object.assign(behavior, JSON.parse(raw));
  } catch { /* ignore */ }
  return behavior;
}

function persistBehavior() {
  if (typeof window !== "undefined") {
    try { window.localStorage.setItem(BEHAVIOR_KEY, JSON.stringify(behavior)); } catch { /* ignore */ }
  }
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function simulate(kind: "read" | "write" = "read") {
  const b = readBehavior();
  if (b.latency) await delay(kind === "write" ? 320 + Math.random() * 380 : 160 + Math.random() * 260);
  if (b.failureRate > 0 && Math.random() < b.failureRate) {
    throw new ApiError(503, "simulated_failure", "Simulated API failure (demo control). The request did not reach a backend and nothing was changed.");
  }
}

function requireSession(): Session {
  const s = readSession();
  if (!s) throw new ApiError(401, "unauthenticated", "Your session has expired. Please sign in again.");
  return s;
}

/**
 * Mock mirror of backend authorization (the real backend remains authoritative).
 * Team-wide surfaces — recovery, risk/audit/usage, planning, allocation, team
 * management — are team-lead exclusive; employees get a 403 exactly as the real
 * API would respond, so unauthorized handling is exercised end-to-end.
 */
function requireLead(): Session {
  const s = requireSession();
  if (s.user.role !== "team_lead") {
    throw new ApiError(403, "forbidden", "You don't have access to team-wide coordination tools. Recovery, planning and workspace management are handled by your team lead.");
  }
  return s;
}

/** Employees may only mutate their own assigned tasks (leads may act on any). */
function requireTaskMutation(taskId: string): { session: Session; task: (typeof db.tasks)[number] } {
  const session = requireSession();
  const task = db.tasks.find((x) => x.id === taskId);
  if (!task) throw new ApiError(404, "not_found", "Task not found.");
  if (session.user.role !== "team_lead" && task.assigneeId !== session.user.id) {
    throw new ApiError(403, "forbidden", "You can only update tasks assigned to you.");
  }
  return { session, task };
}

function readSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function writeSession(s: Session | null) {
  if (typeof window === "undefined") return;
  if (s) window.localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  else window.localStorage.removeItem(SESSION_KEY);
}

/* Mutable in-memory demo database (resets on reload — intentional) */
const db = {
  users: [...seed.users],
  teamMembers: seed.teamMembers.map((m) => ({ ...m, skills: m.skills.map((s) => ({ ...s })) })),
  workflows: seed.workflows.map((w) => ({ ...w, memberIds: [...w.memberIds] })),
  tasks: seed.tasks.map((t) => ({ ...t, acceptanceCriteria: [...t.acceptanceCriteria], skills: [...t.skills] })),
  dependencies: seed.dependencies.map((d) => ({ ...d })),
  proposedPlans: JSON.parse(JSON.stringify(seed.proposedPlans)) as Record<string, PlanProposal>,
  blockers: seed.blockers.map((b) => ({ ...b })),
  analyses: seed.analyses.map((a) => ({ ...a })),
  alternatives: seed.alternatives.map((a) => ({ ...a })),
  recoveryCases: JSON.parse(JSON.stringify(seed.recoveryCases)) as RecoveryCase[],
  risks: seed.risks.map((r) => ({ ...r })),
  audit: seed.auditEvents.map((a) => ({ ...a })),
  usage: { ...seed.usage },
  settings: JSON.parse(JSON.stringify(seed.defaultSettings)) as WorkspaceSettings,
  decisions: [] as RecoveryDecision[],
  verifications: [] as VerificationResult[],
  allocationPlans: JSON.parse(JSON.stringify(seed.allocationPlans)) as Record<string, AllocationPlan>,
  approvedChanges: [
    seed.auditEvents[3],
    seed.auditEvents[2],
  ] as AuditEvent[],
};

let idCounter = 100;
const nextId = (prefix: string) => `${prefix}-${++idCounter}`;

function audit(action: string, target: string, details?: string, outcome: "success" | "failure" | "pending" = "success") {
  const s = readSession();
  db.audit.unshift({
    id: nextId("a"),
    at: new Date().toISOString(),
    actorName: s?.user.name ?? "Renova",
    actorRole: s?.user.role ?? "system",
    action,
    target,
    outcome,
    details,
  });
}

function memberById(id: string | undefined) {
  return db.teamMembers.find((m) => m.id === id);
}

function workflowTasks(workflowId: string) {
  return db.tasks.filter((t) => t.workflowId === workflowId).sort((a, b) => a.order - b.order);
}

/** Build an allocation plan (skill/availability aware heuristic mirroring backend behavior). */
function buildAllocation(workflowId: string): AllocationPlan {
  const wf = db.workflows.find((w) => w.id === workflowId)!;
  const ts = workflowTasks(workflowId);
  const recs: AllocationRecommendation[] = [];
  const load = new Map<string, number>();
  db.teamMembers.forEach((m) => load.set(m.id, m.allocatedHours));

  for (const t of ts) {
    const candidates = db.teamMembers
      .filter((m) => wf.memberIds.includes(m.id))
      .map((m) => {
        const skillScore = t.skills.reduce((acc, sk) => {
          const s = m.skills.find((x) => x.name === sk);
          return acc + (s ? s.level : 0);
        }, 0) / Math.max(t.skills.length, 1);
        const free = (m.weeklyCapacityHours * m.availability) - (load.get(m.id) ?? 0);
        return { m, skillScore, free };
      })
      .filter((c) => c.skillScore > 0)
      .sort((a, b) => b.skillScore * 10 - b.free * 0.1 - (a.skillScore * 10 - a.free * 0.1));

    const best = candidates[0];
    if (best) {
      const skilled = best.m.skills.filter((s) => t.skills.includes(s.name)).map((s) => `${s.name} L${s.level}`);
      recs.push({
        taskId: t.id,
        taskTitle: t.title,
        memberId: best.m.id,
        reason: skilled.length
          ? `Strongest skill match on ${skilled.join(", ")} with ${Math.round(best.free)}h free this week.`
          : `Available capacity (${Math.round(best.free)}h) and adjacent skills.`,
        confidence: Math.min(0.95, 0.55 + best.skillScore * 0.08),
        feasible: best.free > (t.estimateHours ?? 8) * 0.4,
        alternativeMemberIds: candidates.slice(1, 3).map((c) => c.m.id),
      });
      load.set(best.m.id, (load.get(best.m.id) ?? 0) + (t.estimateHours ?? 8));
    } else {
      recs.push({
        taskId: t.id,
        taskTitle: t.title,
        memberId: null,
        reason: "No team member matches the required skills — consider adding a member or adjusting skills.",
        confidence: 0,
        feasible: false,
      });
    }
  }

  const warnings: string[] = [];
  const overAllocated = db.teamMembers.filter((m) => {
    const free = m.weeklyCapacityHours * m.availability - (load.get(m.id) ?? m.allocatedHours);
    return free < 0;
  });
  if (overAllocated.length) {
    warnings.push(`Capacity: ${overAllocated.map((m) => m.name).join(", ")} would exceed available hours with the current proposal.`);
  }
  const liam = memberById("u-liam");
  if (liam && liam.availability < 1 && wf.memberIds.includes(liam.id)) {
    warnings.push(`${liam.name} is at ${Math.round(liam.availability * 100)}% availability this week.`);
  }

  return { workflowId, status: "draft", recommendations: recs, warnings, generatedAt: new Date().toISOString() };
}

function recomputeProgress(workflowId: string) {
  const ts = workflowTasks(workflowId);
  if (!ts.length) return;
  const done = ts.filter((t) => t.status === "done").length;
  const wf = db.workflows.find((w) => w.id === workflowId);
  if (wf) wf.progress = Math.round((done / ts.length) * 100);
}

const genPlanTemplates: Record<string, PlanTask[]> = {
  default: [
    {
      title: "Discovery & requirement confirmation",
      description: "Clarify scope, constraints and success measures for the goal; confirm assumptions with stakeholders.",
      acceptanceCriteria: ["Scope brief approved by the requester", "Open questions resolved or filed", "Success measures documented"],
      skills: ["Delivery Planning"], estimateHours: 6, dependsOn: [], suggestedPriority: "high",
    },
    {
      title: "Break down & estimate workstreams",
      description: "Split the goal into concrete workstreams with estimates and required skills.",
      acceptanceCriteria: ["Workstreams documented", "Estimates reviewed", "Skills identified per workstream"],
      skills: ["Delivery Planning"], estimateHours: 8, dependsOn: ["Discovery & requirement confirmation"], suggestedPriority: "high",
    },
    {
      title: "Execute primary workstream",
      description: "Implement the core workstream that directly advances the goal.",
      acceptanceCriteria: ["Deliverable meets acceptance criteria", "Review completed", "Documentation updated"],
      skills: ["Node.js API", "React"], estimateHours: 24, dependsOn: ["Break down & estimate workstreams"], suggestedPriority: "critical",
    },
    {
      title: "Validation & quality pass",
      description: "Verify the deliverable against acceptance criteria and run the quality checklist.",
      acceptanceCriteria: ["All acceptance criteria verified", "Quality checklist passed", "Issues resolved or filed"],
      skills: ["QA Automation"], estimateHours: 10, dependsOn: ["Execute primary workstream"], suggestedPriority: "high",
    },
    {
      title: "Rollout & handover",
      description: "Ship the outcome, communicate to stakeholders and hand over ownership notes.",
      acceptanceCriteria: ["Rollout complete", "Stakeholders informed", "Handover notes published"],
      skills: ["Stakeholder Comms"], estimateHours: 6, dependsOn: ["Validation & quality pass"], suggestedPriority: "medium",
    },
  ],
};

export class MockApiClient implements OpsPilotApi {
  /* Auth */
  async login(email: string, password: string): Promise<Session> {
    await simulate();
    const user = db.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!user || password.length < 6) {
      throw new ApiError(401, "invalid_credentials", "Incorrect email or password. Demo tip: any password with 6+ characters works.");
    }
    const session = { token: `demo-token-${user.id}-${Date.now()}`, user, workspace: { ...seed.workspace } };
    writeSession(session);
    return session;
  }

  async register(input: { name: string; email: string; password: string; organizationName: string }): Promise<Session> {
    await simulate("write");
    if (db.users.some((u) => u.email.toLowerCase() === input.email.toLowerCase())) {
      throw new ApiError(409, "email_taken", "An account with this email already exists.");
    }
    const user = {
      id: nextId("u"), name: input.name, email: input.email, role: "team_lead" as const,
      title: "Team Lead", initials: input.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase(),
      accent: "#6750A4",
    };
    db.users.push(user);
    db.teamMembers.push({
      ...user, skills: [{ name: "Delivery Planning", level: 3 }], availability: 1,
      weeklyCapacityHours: 40, allocatedHours: 0, activeTaskCount: 0,
    });
    const ws = { ...seed.workspace, id: nextId("ws"), name: input.organizationName || `${input.name.split(" ")[0]}'s Workspace`, inviteCode: `OPS-${Math.random().toString(36).slice(2, 5).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}` };
    const session = { token: `demo-token-${user.id}-${Date.now()}`, user, workspace: ws };
    writeSession(session);
    return session;
  }

  async requestPasswordReset(email: string): Promise<{ ok: true; message: string }> {
    await simulate("write");
    return { ok: true, message: `If an account exists for ${email}, a reset link is on its way. (Demo: no email is actually sent.)` };
  }

  async logout(): Promise<void> {
    await simulate();
    writeSession(null);
  }

  async getSession(): Promise<Session | null> {
    await delay(80);
    return readSession();
  }

  /* Workspace & team */
  async createWorkspace(input: { name: string; goalHint?: string }): Promise<Session> {
    await simulate("write");
    const session = requireSession();
    const ws = { ...session.workspace, name: input.name };
    const next = { ...session, workspace: ws };
    writeSession(next);
    audit("workspace.created", input.name);
    return next;
  }

  async joinWorkspace(input: { inviteCode: string }): Promise<Session> {
    await simulate("write");
    const session = requireSession();
    const code = input.inviteCode.trim().toUpperCase();
    if (code !== seed.workspace.inviteCode) {
      throw new ApiError(404, "invite_not_found", "That invite code was not found. Demo tip: use OPS-7K2-QM9.");
    }
    const next = { ...session, workspace: { ...seed.workspace } };
    writeSession(next);
    audit("workspace.joined", seed.workspace.name);
    return next;
  }

  async inviteMember(input: { email: string; role: "team_lead" | "employee"; title?: string }): Promise<{ ok: true; inviteCode: string }> {
    await simulate("write");
    requireLead();
    await delay(200);
    audit("member.invited", input.email, `Role: ${input.role}`);
    return { ok: true, inviteCode: seed.workspace.inviteCode };
  }

  async listTeam(): Promise<TeamMember[]> {
    await simulate();
    requireSession();
    return db.teamMembers.map((m) => ({ ...m }));
  }

  /* Workflows & planning */
  async listWorkflows(params?: { search?: string; status?: string }): Promise<Workflow[]> {
    await simulate();
    requireSession();
    let out = [...db.workflows];
    if (params?.search) {
      const q = params.search.toLowerCase();
      out = out.filter((w) => w.name.toLowerCase().includes(q) || w.goal.toLowerCase().includes(q));
    }
    if (params?.status && params.status !== "all") out = out.filter((w) => w.status === params.status);
    return out;
  }

  async getWorkflow(id: string): Promise<Workflow> {
    await simulate();
    requireSession();
    const wf = db.workflows.find((w) => w.id === id);
    if (!wf) throw new ApiError(404, "not_found", "Workflow not found. It may have been removed, or this is demo data that reset on reload.");
    return { ...wf, memberIds: [...wf.memberIds] };
  }

  async createWorkflow(input: { title?: string; goal: string; targetDate: string; context?: string; memberIds?: string[] }): Promise<{ workflowId: string }> {
    await simulate("write");
    const session = requireLead();
    const id = nextId("wf");
    const name = input.title?.trim() || (input.goal.length > 48 ? `${input.goal.slice(0, 45).trimEnd()}…` : input.goal) || "New workflow";
    db.workflows.push({
      id, name, goal: input.goal, context: input.context, status: "draft",
      targetDate: input.targetDate, createdAt: new Date().toISOString(), createdBy: session.user.id,
      progress: 0, memberIds: input.memberIds?.length ? input.memberIds : db.teamMembers.slice(0, 4).map((m) => m.id),
    });
    audit("workflow.created", name, "Plan generation requested");
    return { workflowId: id };
  }

  async generatePlan(workflowId: string): Promise<PlanProposal> {
    await simulate("write");
    requireLead();
    const wf = db.workflows.find((w) => w.id === workflowId);
    if (!wf) throw new ApiError(404, "not_found", "Workflow not found.");
    // Long-running AI generation simulation
    await delay(2400);
    const template = (genPlanTemplates.default).map((t) => ({ ...t, acceptanceCriteria: [...t.acceptanceCriteria], skills: [...t.skills], dependsOn: [...t.dependsOn] }));
    const proposal: PlanProposal = {
      workflowId,
      status: "proposed",
      generatedAt: new Date().toISOString(),
      summary: `A 5-task plan for “${wf.goal}” that confirms scope, breaks the goal into workstreams, executes the core work, validates quality, and hands over. Critical path runs through the primary workstream.`,
      tasks: template,
      warnings: ["Estimates are AI-generated suggestions — review them against your team's pace."],
    };
    db.proposedPlans[workflowId] = proposal;
    db.workflows.find((w) => w.id === workflowId)!.status = "planning";
    audit("plan.generated", wf.name, `${template.length} tasks proposed`);
    return JSON.parse(JSON.stringify(proposal));
  }

  async getPlan(workflowId: string): Promise<PlanProposal | null> {
    await simulate();
    requireLead();
    const p = db.proposedPlans[workflowId];
    return p ? JSON.parse(JSON.stringify(p)) : null;
  }

  async savePlanTask(workflowId: string, task: PlanTask): Promise<PlanProposal> {
    await simulate("write");
    requireLead();
    const p = db.proposedPlans[workflowId];
    if (!p) throw new ApiError(404, "not_found", "No plan found for this workflow yet.");
    if (task.id) {
      const i = p.tasks.findIndex((t) => t.id === task.id);
      if (i === -1) throw new ApiError(404, "not_found", "Task no longer exists in the plan.");
      p.tasks[i] = { ...task };
    } else {
      p.tasks.push({ ...task, id: nextId("pt") });
    }
    audit("plan.task_saved", task.title);
    return JSON.parse(JSON.stringify(p));
  }

  async deletePlanTask(workflowId: string, taskId: string): Promise<PlanProposal> {
    await simulate("write");
    requireLead();
    const p = db.proposedPlans[workflowId];
    if (!p) throw new ApiError(404, "not_found", "No plan found for this workflow yet.");
    p.tasks = p.tasks.filter((t) => t.id !== taskId);
    p.tasks.forEach((t) => { t.dependsOn = t.dependsOn.filter((d) => d !== taskId); });
    audit("plan.task_deleted", p.tasks.find((t) => t.id === taskId)?.title ?? taskId);
    return JSON.parse(JSON.stringify(p));
  }

  async validatePlan(workflowId: string): Promise<{ ok: true; issues: { severity: "error" | "warning"; message: string; taskTitle?: string }[] }> {
    await simulate();
    requireLead();
    const p = db.proposedPlans[workflowId];
    if (!p) throw new ApiError(404, "not_found", "No plan found for this workflow yet.");
    const issues: { severity: "error" | "warning"; message: string; taskTitle?: string }[] = [];
    // Cycle detection (frontend check; backend remains authoritative)
    const byId = new Map(p.tasks.map((t, i) => [t.id ?? `t${i}`, t]));
    const depsOf = (id: string): string[] => (byId.get(id)?.dependsOn ?? []);
    const state = new Map<string, 0 | 1 | 2>();
    let cyclic = false;
    const visit = (id: string) => {
      if (cyclic) return;
      const s = state.get(id);
      if (s === 1) { cyclic = true; return; }
      if (s === 2) return;
      state.set(id, 1);
      depsOf(id).forEach((d) => byId.has(d) && visit(d));
      state.set(id, 2);
    };
    p.tasks.forEach((t, i) => visit(t.id ?? `t${i}`));
    if (cyclic) issues.push({ severity: "error", message: "Dependency cycle detected — tasks cannot depend on each other in a loop." });
    p.tasks.forEach((t) => {
      if (!t.acceptanceCriteria.length) issues.push({ severity: "warning", message: "Task has no acceptance criteria — verification will be hard to automate.", taskTitle: t.title });
      const badDep = t.dependsOn.filter((d) => !byId.has(d));
      if (badDep.length) issues.push({ severity: "error", message: `References ${badDep.length} missing dependency(ies).`, taskTitle: t.title });
    });
    if (!issues.some((i) => i.severity === "error")) p.status = "validated";
    return { ok: true, issues };
  }

  async confirmPlan(workflowId: string): Promise<{ ok: true; createdTasksCount?: number; createdDependenciesCount?: number; taskIds?: string[] }> {
    await simulate("write");
    requireLead();
    const p = db.proposedPlans[workflowId];
    const wf = db.workflows.find((w) => w.id === workflowId);
    if (!p || !wf) throw new ApiError(404, "not_found", "No plan found for this workflow yet.");
    // Materialize proposed tasks as real tasks
    const taskIds: string[] = [];
    p.tasks.forEach((pt, i) => {
      const id = nextId("pt");
      db.tasks.push({
        id, workflowId, title: pt.title, description: pt.description,
        acceptanceCriteria: [...pt.acceptanceCriteria], status: "todo", priority: pt.suggestedPriority,
        estimateHours: pt.estimateHours, dueDate: pt.dueDate, skills: [...pt.skills], order: i,
      });
      pt.id = id;
      taskIds.push(id);
    });
    // Materialize dependencies by title references
    let dependencyCount = 0;
    p.tasks.forEach((pt) => {
      pt.dependsOn.forEach((depKey) => {
        const from = p.tasks.find((x) => x.id === depKey || x.title === depKey);
        const to = pt.id;
        if (from?.id && to) {
          db.dependencies.push({ id: nextId("d"), fromTaskId: from.id, toTaskId: to });
          dependencyCount += 1;
        }
      });
    });
    p.status = "confirmed";
    wf.status = "ready_for_allocation";
    audit("plan.confirmed", wf.name, `${p.tasks.length} tasks materialized`);
    return { ok: true, createdTasksCount: taskIds.length, createdDependenciesCount: dependencyCount, taskIds };
  }

  /** Mock mirror of a proposal rejection: the proposal is discarded and the
   *  workflow returns to draft so a new plan can be generated. `notes` has no
   *  mock persistence — it maps to the backend's ProposalRejectRequest.notes. */
  async rejectPlan(workflowId: string, _notes?: string): Promise<{ ok: true }> {
    await simulate("write");
    requireLead();
    const p = db.proposedPlans[workflowId];
    const wf = db.workflows.find((w) => w.id === workflowId);
    if (!p || !wf) throw new ApiError(404, "not_found", "No plan found for this workflow yet.");
    delete db.proposedPlans[workflowId];
    wf.status = "draft";
    audit("plan.rejected", wf.name, `${p.tasks.length}-task proposal discarded — the workflow returned to draft`);
    return { ok: true };
  }

  /* Allocation */
  async getAllocation(workflowId: string): Promise<AllocationPlan> {
    await simulate();
    requireLead();
    const cached = db.allocationPlans[workflowId];
    if (cached) return JSON.parse(JSON.stringify(cached));
    const plan = buildAllocation(workflowId);
    db.allocationPlans[workflowId] = plan;
    return JSON.parse(JSON.stringify(plan));
  }

  async reassignTask(workflowId: string, taskId: string, memberId: string | null): Promise<AllocationRecommendation> {
    await simulate("write");
    requireLead();
    const plan = db.allocationPlans[workflowId] ?? (db.allocationPlans[workflowId] = buildAllocation(workflowId));
    const rec = plan.recommendations.find((r) => r.taskId === taskId);
    if (!rec) throw new ApiError(404, "not_found", "Recommendation not found for this task.");
    if (memberId && !memberById(memberId)) throw new ApiError(404, "not_found", "Team member not found.");
    rec.memberId = memberId;
    const m = memberById(memberId ?? undefined);
    rec.reason = m ? `Manually assigned to ${m.name}. Skills: ${m.skills.map((s) => s.name).slice(0, 2).join(", ") || "generalist"}.` : "Unassigned — pending a decision.";
    rec.confidence = m ? 1 : 0;
    return { ...rec };
  }

  async confirmAllocation(workflowId: string): Promise<{ ok: true }> {
    await simulate("write");
    requireLead();
    const plan = db.allocationPlans[workflowId];
    const wf = db.workflows.find((w) => w.id === workflowId);
    if (!plan || !wf) throw new ApiError(404, "not_found", "Generate an allocation first.");
    const unassigned = plan.recommendations.filter((r) => !r.memberId);
    if (unassigned.length) {
      throw new ApiError(422, "unassigned_tasks", `Resolve ${unassigned.length} unassigned task(s) before confirming allocation.`);
    }
    plan.recommendations.forEach((r) => {
      const t = db.tasks.find((x) => x.id === r.taskId);
      if (t) t.assigneeId = r.memberId!;
    });
    plan.status = "confirmed";
    wf.status = "active";
    db.allocationPlans[workflowId] = plan;
    audit("allocation.confirmed", wf.name, `${plan.recommendations.length} assignments confirmed`);
    return { ok: true };
  }

  /* Execution */
  async getExecution(workflowId: string): Promise<import("./types").ExecutionSnapshot> {
    await simulate();
    requireSession();
    const wf = db.workflows.find((w) => w.id === workflowId);
    if (!wf) throw new ApiError(404, "not_found", "Workflow not found.");
    const ts = workflowTasks(workflowId);
    const deps = db.dependencies.filter((d) => ts.some((t) => t.id === d.fromTaskId) && ts.some((t) => t.id === d.toTaskId));
    const bl = db.blockers.filter((b) => b.workflowId === workflowId);
    const activity = db.audit.filter((a) => a.target === wf.name).slice(0, 8);
    return {
      workflow: { ...wf, memberIds: [...wf.memberIds] },
      tasks: ts.map((t) => ({ ...t })),
      dependencies: deps.map((d) => ({ ...d })),
      blockers: bl.map((b) => ({ ...b })),
      activity,
    };
  }

  async updateTaskStatus(taskId: string, status: TaskStatus): Promise<Task> {
    await simulate("write");
    const { session, task: t } = requireTaskMutation(taskId);
    // Backend-allowed transition rules (mirrored; backend remains authoritative)
    const allowed: Record<TaskStatus, TaskStatus[]> = {
      todo: ["in_progress", "blocked"],
      in_progress: ["in_review", "blocked", "done"],
      blocked: ["todo", "in_progress"],
      in_review: ["done", "in_progress"],
      done: [],
    };
    if (!allowed[t.status].includes(status)) {
      throw new ApiError(422, "invalid_transition", `Moving from “${t.status}” to “${status}” is not allowed by the workflow rules.`);
    }
    t.status = status;
    recomputeProgress(t.workflowId);
    if (status === "blocked") {
      db.blockers.unshift({
        id: nextId("bk"), workflowId: t.workflowId, workflowName: db.workflows.find((w) => w.id === t.workflowId)?.name ?? "",
        taskId: t.id, taskTitle: t.title, title: "Task marked blocked",
        description: `${session.user.name} marked this task as blocked. Add details via “Report blocker” so the Recovery Engine can analyze impact.`,
        severity: "high", status: "open", reportedByName: session.user.name, reportedAt: new Date().toISOString(),
      });
    }
    if (status !== "blocked") {
      db.blockers.filter((b) => b.taskId === t.id && b.status !== "resolved").forEach((b) => { b.status = "resolved"; b.resolution = `Task moved to ${status}.`; });
    }
    audit("task.status_changed", t.title, `→ ${status}`);
    return { ...t };
  }

  async reportBlocker(input: { taskId: string; title: string; description: string; severity: import("./types").BlockerSeverity }): Promise<Blocker> {
    await simulate("write");
    const { session, task: t } = requireTaskMutation(input.taskId);
    const wf = db.workflows.find((w) => w.id === t.workflowId)!;
    const blocker: Blocker = {
      id: nextId("bk"), workflowId: t.workflowId, workflowName: wf.name, taskId: t.id, taskTitle: t.title,
      title: input.title, description: input.description, severity: input.severity, status: "open",
      reportedByName: session.user.name, reportedAt: new Date().toISOString(),
    };
    db.blockers.unshift(blocker);
    t.status = "blocked";
    recomputeProgress(t.workflowId);
    audit("blocker.reported", t.title, input.title);
    return { ...blocker };
  }

  /* Employee */
  async listMyTasks(): Promise<(Task & { workflowName: string; prerequisiteTitles: string[]; dependentTitles: string[] })[]> {
    await simulate();
    const session = requireSession();
    const mine = db.tasks.filter((t) => t.assigneeId === session.user.id);
    return mine.map((t) => {
      const prereq = db.dependencies.filter((d) => d.toTaskId === t.id).map((d) => db.tasks.find((x) => x.id === d.fromTaskId)?.title).filter(Boolean) as string[];
      const dep = db.dependencies.filter((d) => d.fromTaskId === t.id).map((d) => db.tasks.find((x) => x.id === d.toTaskId)?.title).filter(Boolean) as string[];
      return { ...t, workflowName: db.workflows.find((w) => w.id === t.workflowId)?.name ?? "", prerequisiteTitles: prereq, dependentTitles: dep };
    });
  }

  async getTask(taskId: string): Promise<Task & { workflowName: string; prerequisiteTitles: string[]; dependentTitles: string[]; blocker?: Blocker }> {
    await simulate();
    requireSession();
    const t = db.tasks.find((x) => x.id === taskId);
    if (!t) throw new ApiError(404, "not_found", "Task not found.");
    const prereq = db.dependencies.filter((d) => d.toTaskId === t.id).map((d) => db.tasks.find((x) => x.id === d.fromTaskId)?.title).filter(Boolean) as string[];
    const dep = db.dependencies.filter((d) => d.fromTaskId === t.id).map((d) => db.tasks.find((x) => x.id === d.toTaskId)?.title).filter(Boolean) as string[];
    const blocker = db.blockers.find((b) => b.taskId === t.id && b.status !== "resolved");
    return { ...t, workflowName: db.workflows.find((w) => w.id === t.workflowId)?.name ?? "", prerequisiteTitles: prereq, dependentTitles: dep, blocker: blocker ? { ...blocker } : undefined };
  }

  async listApprovedChanges(): Promise<AuditEvent[]> {
    await simulate();
    requireSession();
    return db.approvedChanges.map((a) => ({ ...a }));
  }

  /* Recovery engine */
  async listRecoveryCases(): Promise<RecoveryCase[]> {
    await simulate();
    requireLead();
    return JSON.parse(JSON.stringify(db.recoveryCases));
  }

  async getRecoveryCase(id: string): Promise<RecoveryCase> {
    await simulate();
    requireLead();
    const c = db.recoveryCases.find((x) => x.id === id);
    if (!c) throw new ApiError(404, "not_found", "Recovery case not found.");
    return JSON.parse(JSON.stringify(c));
  }

  async requestAnalysis(blockerId: string): Promise<ImpactAnalysis> {
    await simulate("write");
    requireLead();
    const b = db.blockers.find((x) => x.id === blockerId);
    if (!b) throw new ApiError(404, "not_found", "Blocker not found.");
    await delay(1900); // analysis simulation
    // Build analysis from live dependency graph
    const downstream: string[] = [];
    let cursor = b.taskId;
    for (let i = 0; i < 6; i++) {
      const next = db.dependencies.find((d) => d.fromTaskId === cursor);
      if (!next) break;
      downstream.push(next.toTaskId);
      cursor = next.toTaskId;
    }
    const pathTitles = [b.taskTitle, ...downstream.map((id) => db.tasks.find((t) => t.id === id)?.title ?? id)];
    const analysis: ImpactAnalysis = {
      id: nextId("az"), blockerId, createdAt: new Date().toISOString(),
      triggerEvent: `${b.title} — ${b.description.slice(0, 120)}`,
      affectedTaskId: b.taskId, affectedTaskTitle: b.taskTitle,
      downstreamTaskIds: downstream,
      dependencyPath: pathTitles,
      deadlineExposure: `Task “${b.taskTitle}” and ${downstream.length} downstream task(s) are on the critical path to ${db.workflows.find((w) => w.id === b.workflowId)?.targetDate?.slice(0, 10) ?? "the target date"}.`,
      blastRadius: Math.min(95, 40 + downstream.length * 12 + (b.severity === "critical" ? 20 : 10)),
      blastRadiusFactors: [
        `${downstream.length + 1} task(s) on the critical path`,
        `Severity rated ${b.severity}`,
        "Fixed external commitments attached to the target date",
      ],
      constraints: db.teamMembers.filter((m) => m.availability < 1).map((m) => `${m.name} at ${Math.round(m.availability * 100)}% availability this week`),
    };
    db.analyses.unshift(analysis);
    b.status = "analyzing";
    const c = db.recoveryCases.find((x) => x.blocker.id === blockerId);
    if (c) { c.analysis = analysis; c.analysisId = analysis.id; c.status = "analyzing"; }
    audit("recovery.analyzed", `Blocker ${blockerId}`, `Blast radius estimate ${analysis.blastRadius}`);
    return JSON.parse(JSON.stringify(analysis));
  }

  async requestAlternatives(analysisId: string): Promise<RecoveryAlternative[]> {
    await simulate("write");
    requireLead();
    const az = db.analyses.find((a) => a.id === analysisId);
    if (!az) throw new ApiError(404, "not_found", "Analysis not found.");
    await delay(1700);
    const affected = db.tasks.find((t) => t.id === az.affectedTaskId);
    const wf = db.workflows.find((w) => w.id === affected?.workflowId);
    const candidates = db.teamMembers
      .filter((m) => wf?.memberIds.includes(m.id) && m.id !== affected?.assigneeId)
      .sort((a, b) => (b.skills.find((s) => affected?.skills.includes(s.name))?.level ?? 0) - (a.skills.find((s) => affected?.skills.includes(s.name))?.level ?? 0));
    const best = candidates[0];
    const alt: RecoveryAlternative[] = [];
    if (best) {
      alt.push({
        id: nextId("alt"), analysisId, label: "Fastest",
        title: `Bring in ${best.name} on “${affected?.title}”`,
        description: `${best.name} joins the affected task to parallelize recovery while the current assignee resolves the blocker.`,
        assignmentChanges: [{ taskId: affected?.id ?? "", taskTitle: affected?.title ?? "", toMemberId: best.id, toMemberName: best.name, reason: `Skill match (${best.skills.map((s) => s.name).slice(0, 2).join(", ")}) and ${Math.round(best.weeklyCapacityHours * best.availability - best.allocatedHours)}h free this week` }],
        scheduleEffect: "Recovers ~0.5–1 day on the critical path if the blocker clears soon",
        estimatedDelayDays: -0.5,
        skillFeasible: (best.skills.find((s) => affected?.skills.includes(s.name))?.level ?? 0) >= 3,
        availabilityFeasible: best.availability >= 0.5,
        workloadImpact: `${best.name} → ${Math.min(100, Math.round(((best.allocatedHours + 8) / (best.weeklyCapacityHours * best.availability)) * 100))}% of weekly capacity`,
        risks: ["Context ramp-up time", "Handover overhead"],
        assumptions: ["Blocker resolves within the current planning window"],
        recommended: false,
      });
    }
    alt.push({
      id: nextId("alt"), analysisId, label: "Balanced",
      title: "Re-sequence downstream work",
      description: "Pull any downstream work that does not depend on the blocked output forward; keep assignments unchanged.",
      assignmentChanges: [],
      scheduleEffect: "Keeps the target date if at least one downstream task can start now",
      estimatedDelayDays: 0,
      skillFeasible: true, availabilityFeasible: true,
      workloadImpact: "No assignment changes",
      risks: ["Re-sequencing may require re-planning", "Partial progress could need rework"],
      assumptions: ["At least one downstream task is independent of the blocked output"],
      recommended: !alt.length,
    });
    alt.push({
      id: nextId("alt"), analysisId, label: "Lowest Cost",
      title: "Hold plan and wait",
      description: "No changes. Monitor the blocker and re-run the analysis if it persists past the next check-in.",
      assignmentChanges: [],
      scheduleEffect: "Target date at risk; delay equal to blocker duration",
      estimatedDelayDays: 1,
      skillFeasible: true, availabilityFeasible: true,
      workloadImpact: "No workload changes",
      risks: ["No buffer left for downstream slips"],
      assumptions: ["Blocker clears within 1–2 days"],
      recommended: false,
    });
    const c = db.recoveryCases.find((x) => x.analysisId === analysisId);
    if (c) { c.alternatives = alt; c.status = "needs_decision"; }
    audit("recovery.alternatives_ready", `Analysis ${analysisId}`, `${alt.length} alternatives generated`);
    return JSON.parse(JSON.stringify(alt));
  }

  async decideProposal(input: { caseId: string; analysisId: string; alternativeId: string; decision: ApprovalDecision; comment?: string }): Promise<RecoveryDecision> {
    await simulate("write");
    const session = requireLead();
    const c = db.recoveryCases.find((x) => x.id === input.caseId);
    if (!c) throw new ApiError(404, "not_found", "Recovery case not found.");
    if (c.decision && ["pending", "processing", "applied", "partially_applied"].includes(c.decision.status)) {
      throw new ApiError(409, "stale_proposal", "A decision was already submitted for this case. Refresh to see the current state.");
    }
    const alt = c.alternatives?.find((a) => a.id === input.alternativeId);
    const decision: RecoveryDecision = {
      id: nextId("dec"), caseId: input.caseId, analysisId: input.analysisId, alternativeId: input.alternativeId,
      alternativeTitle: alt?.title ?? "Proposal", decision: input.decision, decidedByName: session.user.name,
      decidedAt: new Date().toISOString(), comment: input.comment, status: "processing",
    };
    db.decisions.push(decision);
    c.decision = decision;
    c.status = "decided";
    audit("recovery.decision_submitted", c.workflowName, `${input.decision}: ${decision.alternativeTitle}`, "pending");

    // Simulate apply + verify. Approval of alt-1 (Fastest) partially applies (Liam's capacity constraint).
    await delay(1800);
    if (input.decision === "approved") {
      const changes = (alt?.assignmentChanges ?? []).map((ch) => {
        const t = db.tasks.find((x) => x.id === ch.taskId);
        const applied = !(ch.toMemberId === "u-liam"); // Liam is at 50% — realistic partial application
        if (applied && t) {
          if (ch.fromMemberId) {
            const from = memberById(ch.fromMemberId);
            if (from) { from.allocatedHours = Math.max(0, from.allocatedHours - (t.estimateHours ?? 8) / 2); from.activeTaskCount = Math.max(0, from.activeTaskCount - 1); }
          }
          t.assigneeId = ch.toMemberId;
          const to = memberById(ch.toMemberId);
          if (to) { to.allocatedHours += (t.estimateHours ?? 8) / 2; to.activeTaskCount += 1; }
        }
        return { taskId: ch.taskId, taskTitle: ch.taskTitle, change: `Assign to ${ch.toMemberName}`, applied };
      });
      const anyFailed = changes.some((ch) => !ch.applied);
      const verification: VerificationResult = {
        decisionId: decision.id,
        status: anyFailed ? "partial" : "success",
        message: anyFailed
          ? "Partially applied — 1 assignment could not be applied because the target member's remaining weekly capacity is below the task's estimate. Review the unresolved issue and re-run recovery."
          : "All proposed changes were applied and verified against the live plan.",
        changes,
        unresolvedIssues: anyFailed ? ["Liam Park has only 10h free this week; the 16h task exceeds available capacity."] : [],
        checkedAt: new Date().toISOString(),
      };
      decision.status = anyFailed ? "partially_applied" : "applied";
      db.verifications.push(verification);
      c.verification = verification;
      if (!anyFailed) {
        const b = db.blockers.find((x) => x.id === c.blocker.id);
        if (b) b.status = "recovering";
      }
      audit("recovery.applied", c.workflowName, anyFailed ? "Partial application — 1 unresolved issue" : "Applied cleanly");
    } else {
      decision.status = "applied"; // rejection/return applied as a no-op state change
      const verification: VerificationResult = {
        decisionId: decision.id,
        status: input.decision === "rejected" ? "success" : "needs_attention",
        message: input.decision === "rejected"
          ? "Proposal rejected. No changes were applied to the plan. The blocker remains open — consider requesting a new analysis."
          : "Returned for edit. No changes were applied. Revise the proposal and resubmit.",
        changes: [],
        unresolvedIssues: input.decision === "returned_for_edit" ? ["Proposal needs revision before it can be applied."] : [],
        checkedAt: new Date().toISOString(),
      };
      db.verifications.push(verification);
      c.verification = verification;
      audit("recovery.decision_recorded", c.workflowName, input.decision);
    }
    return JSON.parse(JSON.stringify(decision));
  }

  async getVerification(decisionId: string): Promise<VerificationResult> {
    await simulate();
    requireLead();
    const v = db.verifications.find((x) => x.decisionId === decisionId);
    if (!v) throw new ApiError(404, "not_found", "No verification result for this decision yet.");
    return JSON.parse(JSON.stringify(v));
  }

  /* Misc */
  async listRisks(): Promise<RiskItem[]> {
    await simulate();
    requireLead();
    return db.risks.map((r) => ({ ...r }));
  }

  async listAudit(): Promise<AuditEvent[]> {
    await simulate();
    requireLead();
    return db.audit.map((a) => ({ ...a }));
  }

  async getUsage(): Promise<UsageInfo> {
    await simulate();
    requireLead();
    return { ...db.usage };
  }

  async getSettings(): Promise<WorkspaceSettings> {
    await simulate();
    requireSession();
    return JSON.parse(JSON.stringify(db.settings));
  }

  async updateSettings(patch: Partial<WorkspaceSettings>): Promise<WorkspaceSettings> {
    await simulate("write");
    requireLead();
    db.settings = { ...db.settings, ...patch, notifications: { ...db.settings.notifications, ...(patch.notifications ?? {}) } };
    audit("settings.updated", db.settings.name);
    return JSON.parse(JSON.stringify(db.settings));
  }

  async updateProfile(patch: { name?: string; title?: string }): Promise<Session> {
    await simulate("write");
    const session = requireSession();
    const user = { ...session.user, ...patch };
    const next = { ...session, user };
    writeSession(next);
    audit("profile.updated", user.name);
    return next;
  }

  /* Demo controls */
  getMockBehavior(): MockBehavior {
    return { ...readBehavior() };
  }
  setMockBehavior(patch: Partial<MockBehavior>): MockBehavior {
    Object.assign(behavior, patch);
    persistBehavior();
    return { ...behavior };
  }
}

/* ------------------------------------------------------------------ */
/* HTTP adapter — FastAPI verified goal-to-task slice                  */
/* ------------------------------------------------------------------ */

/**
 * Thin HTTP adapter over the shared FastAPI backend covering ONLY the
 * verified goal-to-task contract (routes, schemas and documented assumptions
 * live in ./fastapi). It intentionally does NOT implement the full
 * OpsPilotApi interface: the endpoint set assumed by earlier scaffolding
 * (auth, workspaces, allocation, recovery, settings, …) does not exist in
 * the backend's current contract, and inventing it is explicitly out of
 * scope. Authentication requires a Bearer JWT via a replaceable
 * AccessTokenProvider — the mock demo session token is never sent.
 */
export class HttpApiClient {
  readonly fastapi: FastApiClient;

  constructor(
    baseUrl: string,
    options?: { tokenProvider?: AccessTokenProvider; fetchImpl?: typeof fetch }
  ) {
    this.fastapi = new FastApiClient({ baseUrl, ...options });
  }
}

/**
 * API mode "http": the goal-to-task workflow (submit goal → generate plan →
 * review proposal → approve/reject) runs against the FastAPI backend, while
 * every not-yet-integrated surface keeps working on the mock adapter,
 * honestly labeled as demo data.
 *
 * Id policy: the id carried by the `/workflows/{id}/…` hash routes is the
 * backend GOAL id for backend-backed flows (registered in goalRefStore at
 * submission time); the backend PROPOSAL id is tracked separately in the
 * registry. Project, goal and proposal ids are never treated as
 * interchangeable, and no persisted workflow model is invented —
 * getWorkflow() returns a clearly client-side reference view for goals.
 */
export class IntegratedApiClient implements OpsPilotApi {
  constructor(
    private readonly http: HttpApiClient,
    private readonly mock: OpsPilotApi
  ) {}

  /* ---------------- integrated slice (FastAPI) ---------------- */

  async createWorkflow(input: { title?: string; goal: string; targetDate: string; context?: string; memberIds?: string[] }): Promise<{ workflowId: string }> {
    /* memberIds have no representation in the verified backend contract —
       team matching is deferred (INTEGRATION_NOTES.md). */
    const title = input.title?.trim() || deriveGoalTitle(input.goal);
    const goal = await this.http.fastapi.createGoal(DEMO_PROJECT_ID, {
      title,
      description: input.goal,
      /* GoalCreateRequest.target_date must be a UTC date-time in the future;
         the screen supplies a date-only value, mapped to end of that UTC day. */
      targetDate: toUtcTargetDate(input.targetDate),
    });
    goalRefStore.register({
      goalId: goal.id,
      projectId: DEMO_PROJECT_ID,
      title,
      goal: input.goal,
      targetDate: input.targetDate || undefined,
      context: input.context,
      createdAt: new Date().toISOString(),
    });
    return { workflowId: goal.id };
  }

  async getWorkflow(id: string): Promise<Workflow> {
    const ref = goalRefStore.get(id);
    if (ref) {
      /* Client-side reference view of the backend goal — NOT a persisted
         workflow entity. It only exists so the existing plan route can
         render; it is never presented as backend-confirmed state. */
      const session = await this.mock.getSession();
      const name = ref.title || ref.goal;
      return {
        id: ref.goalId,
        name: name.length > 48 ? `${name.slice(0, 45).trimEnd()}…` : name,
        goal: ref.goal,
        context: ref.context,
        status: "planning",
        targetDate: ref.targetDate ?? "",
        createdAt: ref.createdAt,
        createdBy: session?.user.id ?? "api",
        progress: 0,
        memberIds: [],
      };
    }
    return this.mock.getWorkflow(id);
  }

  async generatePlan(workflowId: string): Promise<PlanProposal> {
    const ref = goalRefStore.get(workflowId);
    if (ref) {
      /* The create screen's context/constraints feed the generator via the
         spec's PlanGenerateRequest.additional_instructions. */
      const { proposalId, proposal } = await this.http.fastapi.generatePlanProposal(ref.goalId, ref.context);
      goalRefStore.setProposalId(ref.goalId, proposalId);
      const normalized = proposal ?? (await this.http.fastapi.getPlanProposal(proposalId));
      return backendProposalToPlanProposal(normalized, workflowId);
    }
    return this.mock.generatePlan(workflowId);
  }

  async getPlan(workflowId: string): Promise<PlanProposal | null> {
    const ref = goalRefStore.get(workflowId);
    if (ref) {
      if (!ref.proposalId) return null;
      const normalized = await this.http.fastapi.getPlanProposal(ref.proposalId);
      return backendProposalToPlanProposal(normalized, workflowId);
    }
    return this.mock.getPlan(workflowId);
  }

  /** Approve the backend proposal (POST …/approve — no request body per
   *  spec). The UI re-fetches the proposal afterwards so the rendered state
   *  always comes from the backend's confirmation; the response counts
   *  (created tasks/dependencies) are surfaced to the caller for feedback. */
  async confirmPlan(workflowId: string): Promise<{ ok: true; createdTasksCount?: number; createdDependenciesCount?: number; taskIds?: string[] }> {
    const ref = goalRefStore.get(workflowId);
    if (ref) {
      if (!ref.proposalId) throw new ApiError(409, "conflict", "No plan proposal exists for this goal yet — generate one first.");
      const decision = await this.http.fastapi.approvePlanProposal(ref.proposalId);
      return {
        ok: true,
        ...(decision.createdTasksCount != null ? { createdTasksCount: decision.createdTasksCount } : {}),
        ...(decision.createdDependenciesCount != null ? { createdDependenciesCount: decision.createdDependenciesCount } : {}),
        ...(decision.taskIds?.length ? { taskIds: decision.taskIds } : {}),
      };
    }
    return this.mock.confirmPlan(workflowId);
  }

  async rejectPlan(workflowId: string, notes?: string): Promise<{ ok: true }> {
    const ref = goalRefStore.get(workflowId);
    if (ref) {
      if (!ref.proposalId) throw new ApiError(409, "conflict", "No plan proposal exists for this goal yet — generate one first.");
      await this.http.fastapi.rejectPlanProposal(ref.proposalId, notes);
      return { ok: true };
    }
    return this.mock.rejectPlan(workflowId, notes);
  }

  /* Proposal editing / validation are not part of the verified contract —
     backend proposals are read-only. Mock-backed flows are unaffected. */
  async savePlanTask(workflowId: string, task: PlanTask): Promise<PlanProposal> {
    if (goalRefStore.get(workflowId)) {
      throw new ApiError(501, "integration_blocker", "Editing a backend plan proposal isn't part of the verified API contract yet — the proposal is read-only in API mode.");
    }
    return this.mock.savePlanTask(workflowId, task);
  }

  async deletePlanTask(workflowId: string, taskId: string): Promise<PlanProposal> {
    if (goalRefStore.get(workflowId)) {
      throw new ApiError(501, "integration_blocker", "Editing a backend plan proposal isn't part of the verified API contract yet — the proposal is read-only in API mode.");
    }
    return this.mock.deletePlanTask(workflowId, taskId);
  }

  async validatePlan(workflowId: string): Promise<{ ok: true; issues: { severity: "error" | "warning"; message: string; taskTitle?: string }[] }> {
    if (goalRefStore.get(workflowId)) {
      throw new ApiError(501, "integration_blocker", "Plan validation isn't part of the verified API contract yet — the backend decides proposal validity.");
    }
    return this.mock.validatePlan(workflowId);
  }

  /* ------------- everything else stays mock-backed (demo) ------------- */

  login(email: string, password: string) { return this.mock.login(email, password); }
  register(input: { name: string; email: string; password: string; organizationName: string }) { return this.mock.register(input); }
  requestPasswordReset(email: string) { return this.mock.requestPasswordReset(email); }
  logout() { return this.mock.logout(); }
  getSession() { return this.mock.getSession(); }
  createWorkspace(input: { name: string; goalHint?: string }) { return this.mock.createWorkspace(input); }
  joinWorkspace(input: { inviteCode: string }) { return this.mock.joinWorkspace(input); }
  inviteMember(input: { email: string; role: "team_lead" | "employee"; title?: string }) { return this.mock.inviteMember(input); }
  listTeam() { return this.mock.listTeam(); }
  listWorkflows(params?: { search?: string; status?: string }) { return this.mock.listWorkflows(params); }
  getAllocation(workflowId: string) { return this.mock.getAllocation(workflowId); }
  reassignTask(workflowId: string, taskId: string, memberId: string | null) { return this.mock.reassignTask(workflowId, taskId, memberId); }
  confirmAllocation(workflowId: string) { return this.mock.confirmAllocation(workflowId); }
  getExecution(workflowId: string) { return this.mock.getExecution(workflowId); }
  updateTaskStatus(taskId: string, status: TaskStatus) { return this.mock.updateTaskStatus(taskId, status); }
  reportBlocker(input: { taskId: string; title: string; description: string; severity: import("./types").BlockerSeverity }) { return this.mock.reportBlocker(input); }
  listMyTasks() { return this.mock.listMyTasks(); }
  getTask(taskId: string) { return this.mock.getTask(taskId); }
  listApprovedChanges() { return this.mock.listApprovedChanges(); }
  listRecoveryCases() { return this.mock.listRecoveryCases(); }
  getRecoveryCase(id: string) { return this.mock.getRecoveryCase(id); }
  requestAnalysis(blockerId: string) { return this.mock.requestAnalysis(blockerId); }
  requestAlternatives(analysisId: string) { return this.mock.requestAlternatives(analysisId); }
  decideProposal(input: { caseId: string; analysisId: string; alternativeId: string; decision: ApprovalDecision; comment?: string }) { return this.mock.decideProposal(input); }
  getVerification(decisionId: string) { return this.mock.getVerification(decisionId); }
  listRisks() { return this.mock.listRisks(); }
  listAudit() { return this.mock.listAudit(); }
  getUsage() { return this.mock.getUsage(); }
  getSettings() { return this.mock.getSettings(); }
  updateSettings(patch: Partial<WorkspaceSettings>) { return this.mock.updateSettings(patch); }
  updateProfile(patch: { name?: string; title?: string }) { return this.mock.updateProfile(patch); }
  getMockBehavior(): MockBehavior { return this.mock.getMockBehavior(); }
  setMockBehavior(patch: Partial<MockBehavior>): MockBehavior { return this.mock.setMockBehavior(patch); }
}

/* ------------------------------------------------------------------ */
/* Factory                                                             */
/* ------------------------------------------------------------------ */

const mockClient = new MockApiClient();
let client: OpsPilotApi | null = null;

export function getApi(): OpsPilotApi {
  if (!client) {
    client =
      API_MODE === "http"
        ? new IntegratedApiClient(new HttpApiClient(API_BASE_URL), mockClient)
        : mockClient;
  }
  return client;
}

export type { ApiErrorType };
export { ApiError };
