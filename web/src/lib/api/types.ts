/**
 * Renova domain model — single source of truth for the frontend.
 * Aligned with the intended backend contract; the mock adapter implements
 * these exact shapes so swapping to the real API requires no UI changes.
 */

export type UUID = string;

export type UserRole = "team_lead" | "employee";

export type TaskStatus =
  | "todo"
  | "in_progress"
  | "blocked"
  | "in_review"
  | "done";

export type WorkflowStatus =
  | "draft"
  | "planning"
  | "ready_for_allocation"
  | "allocated"
  | "active"
  | "completed"
  | "cancelled";

export type TaskPriority = "low" | "medium" | "high" | "critical";
export type BlockerSeverity = "low" | "medium" | "high" | "critical";
export type BlockerStatus = "open" | "analyzing" | "recovering" | "resolved";

export interface User {
  id: UUID;
  name: string;
  email: string;
  role: UserRole;
  title?: string;
  initials: string;
  accent: string; // hex used for avatar tonal background
}

export interface Workspace {
  id: UUID;
  name: string;
  inviteCode: string;
  plan: "Free" | "Team" | "Business";
  createdAt: string;
}

export interface Session {
  token: string;
  user: User;
  workspace: Workspace;
}

export interface Skill {
  name: string;
  level: 1 | 2 | 3 | 4 | 5;
}

export interface TeamMember extends User {
  skills: Skill[];
  availability: number; // 0..1 (1 = fully available)
  weeklyCapacityHours: number;
  allocatedHours: number;
  activeTaskCount: number;
  note?: string;
}

/* ---------------- Workflows & tasks ---------------- */

export interface Workflow {
  id: UUID;
  name: string;
  goal: string;
  context?: string;
  status: WorkflowStatus;
  targetDate: string;
  createdAt: string;
  createdBy: UUID;
  progress: number; // 0..100
  memberIds: UUID[];
}

export interface Task {
  id: UUID;
  workflowId: UUID;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId?: UUID;
  estimateHours?: number;
  dueDate?: string;
  skills: string[];
  order: number;
}

export interface Dependency {
  id: UUID;
  fromTaskId: UUID; // must finish before
  toTaskId: UUID; // depends on fromTask
}

export interface ActivityEvent {
  id: UUID;
  at: string;
  actorName: string;
  action: string;
  target?: string;
  outcome: "success" | "failure" | "pending";
}

export interface ExecutionSnapshot {
  workflow: Workflow;
  tasks: Task[];
  dependencies: Dependency[];
  blockers: Blocker[];
  activity: ActivityEvent[];
}

/* ---------------- Planning ---------------- */

export interface PlanTask {
  id?: UUID; // present once persisted
  title: string;
  description: string;
  acceptanceCriteria: string[];
  skills: string[];
  estimateHours?: number;
  dueDate?: string;
  dependsOn: string[]; // plan-task ids or titles kept stable client-side
  suggestedPriority: TaskPriority;
}

export interface PlanProposal {
  workflowId: UUID;
  status: "generating" | "proposed" | "validated" | "confirmed";
  generatedAt: string;
  summary: string;
  tasks: PlanTask[];
  warnings: string[];
  /** Present ONLY when the proposal is served by the real backend (API mode = http).
   *  backendId is the backend plan-proposal id; backendStatus is the raw backend
   *  status (PlanProposalStatus: generated | validated | approved | rejected |
   *  stale | persistence_failed — lower-cased) rendered as-is.
   *  backendExpiresAt is the proposal's TTL (PlanProposalResponse.expires_at). */
  backendId?: UUID;
  backendStatus?: string;
  backendExpiresAt?: string;
}

export interface PlanIssue {
  severity: "error" | "warning";
  message: string;
  taskTitle?: string;
}

/* ---------------- Allocation ---------------- */

export interface AllocationRecommendation {
  taskId: UUID;
  taskTitle: string;
  memberId: UUID | null;
  reason: string;
  confidence: number; // 0..1
  feasible: boolean;
  alternativeMemberIds?: UUID[];
}

export interface AllocationPlan {
  workflowId: UUID;
  status: "draft" | "confirmed";
  recommendations: AllocationRecommendation[];
  warnings: string[];
  generatedAt: string;
}

/* ---------------- Blockers & recovery ---------------- */

export interface Blocker {
  id: UUID;
  workflowId: UUID;
  workflowName: string;
  taskId: UUID;
  taskTitle: string;
  title: string;
  description: string;
  severity: BlockerSeverity;
  status: BlockerStatus;
  reportedByName: string;
  reportedAt: string;
  resolution?: string;
}

export interface ImpactAnalysis {
  id: UUID;
  blockerId: UUID;
  createdAt: string;
  triggerEvent: string;
  affectedTaskId: UUID;
  affectedTaskTitle: string;
  downstreamTaskIds: UUID[];
  dependencyPath: string[]; // ordered task titles
  deadlineExposure: string;
  blastRadius: number; // 0..100 ESTIMATE
  blastRadiusFactors: string[];
  constraints: string[];
}

export interface AssignmentChange {
  taskId: UUID;
  taskTitle: string;
  fromMemberId?: UUID;
  fromMemberName?: string;
  toMemberId: UUID;
  toMemberName: string;
  reason: string;
}

export type AlternativeLabel = "Fastest" | "Balanced" | "Lowest Cost";

export interface RecoveryAlternative {
  id: UUID;
  analysisId: UUID;
  label?: AlternativeLabel;
  title: string;
  description: string;
  assignmentChanges: AssignmentChange[];
  scheduleEffect: string;
  estimatedDelayDays: number; // negative = recovers time
  skillFeasible: boolean;
  availabilityFeasible: boolean;
  workloadImpact: string;
  risks: string[];
  assumptions: string[];
  recommended?: boolean;
}

export type ApprovalDecision = "approved" | "rejected" | "returned_for_edit";

export type RecoveryCaseStatus =
  | "needs_analysis"
  | "analyzing"
  | "needs_decision"
  | "decided"
  | "closed";

export interface RecoveryDecision {
  id: UUID;
  caseId: UUID;
  analysisId: UUID;
  alternativeId: UUID | null;
  alternativeTitle: string;
  decision: ApprovalDecision;
  decidedByName: string;
  decidedAt: string;
  comment?: string;
  status: "pending" | "processing" | "applied" | "partially_applied" | "failed" | "stale";
}

export interface VerificationChange {
  taskId: UUID;
  taskTitle: string;
  change: string;
  applied: boolean;
}

export type VerificationStatus =
  | "success"
  | "partial"
  | "failed"
  | "stale"
  | "needs_attention";

export interface VerificationResult {
  decisionId: UUID;
  status: VerificationStatus;
  message: string;
  changes: VerificationChange[];
  unresolvedIssues: string[];
  checkedAt: string;
}

export interface RecoveryCase {
  id: UUID;
  workflowId: UUID;
  workflowName: string;
  blocker: Blocker;
  status: RecoveryCaseStatus;
  createdAt: string;
  affectedTaskTitle: string;
  analysisId?: UUID;
  decision?: RecoveryDecision;
  verification?: VerificationResult;
  analysis?: ImpactAnalysis;
  alternatives?: RecoveryAlternative[];
}

/* ---------------- Risk, audit, usage, settings ---------------- */

export interface RiskItem {
  id: UUID;
  workflowId: UUID;
  workflowName: string;
  taskId?: UUID;
  title: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  likelihood: "unlikely" | "possible" | "likely" | "almost_certain";
  deadlineExposure?: string;
  factors: string[];
  detectedAt: string;
}

export interface AuditEvent {
  id: UUID;
  at: string;
  actorName: string;
  actorRole: UserRole | "system";
  action: string;
  target: string;
  outcome: "success" | "failure" | "pending";
  details?: string;
}

export interface UsageInfo {
  plan: string;
  periodStart: string;
  periodEnd: string;
  workflowsUsed: number;
  workflowsLimit: number;
  seatsUsed: number;
  seatsLimit: number;
  aiGenerationsUsed: number;
  aiGenerationsLimit: number;
  recoveryRunsUsed: number;
  recoveryRunsLimit: number;
  billingStatus: "active" | "unavailable";
}

export interface WorkspaceSettings {
  name: string;
  timezone: string;
  weekStart: "monday" | "sunday";
  notifications: {
    blockerReported: boolean;
    recoveryDecisions: boolean;
    weeklyDigest: boolean;
    deadlineReminders: boolean;
  };
  demoMode: boolean;
}

export interface MockBehavior {
  failureRate: number; // 0..1 — simulated API failure rate (demo/testing)
  latency: boolean;
}

/* ---------------- API errors ---------------- */

export class ApiError extends Error {
  status: number;
  code: string;
  /** Structured details from the backend error envelope (error.details), when present. */
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}
