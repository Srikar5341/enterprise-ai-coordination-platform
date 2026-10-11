import { addDays, formatISO, startOfMonth, endOfMonth } from "date-fns";
import type {
  AuditEvent,
  Blocker,
  ImpactAnalysis,
  RecoveryAlternative,
  RecoveryCase,
  RiskItem,
  Session,
  Task,
  Dependency,
  TeamMember,
  UsageInfo,
  User,
  Workflow,
  WorkspaceSettings,
  AllocationPlan,
  PlanProposal,
} from "./types";

/* Demo passwords (mock adapter only — never used against a real backend) */
export const DEMO_CREDENTIALS = {
  lead: { email: "lead@renova.dev", password: "demo1234", label: "Team Lead" },
  employee: { email: "marcus@renova.dev", password: "demo1234", label: "Employee" },
};

const now = new Date();
const iso = (d: Date) => formatISO(d);
const daysFromNow = (n: number) => iso(addDays(now, n));
const daysAgo = (n: number, h = 10) => iso(addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n, h, 24), 0));

export const users: User[] = [
  { id: "u-ava", name: "Ava Chen", email: "lead@renova.dev", role: "team_lead", title: "Engineering Team Lead", initials: "AC", accent: "#6750A4" },
  { id: "u-marcus", name: "Marcus Webb", email: "marcus@renova.dev", role: "employee", title: "Backend Engineer", initials: "MW", accent: "#7D5260" },
  { id: "u-priya", name: "Priya Nair", email: "priya@renova.dev", role: "employee", title: "QA Engineer", initials: "PN", accent: "#115E59" },
  { id: "u-diego", name: "Diego Ruiz", email: "diego@renova.dev", role: "employee", title: "Frontend Engineer", initials: "DR", accent: "#7A5900" },
  { id: "u-sofia", name: "Sofia Ahmad", email: "sofia@renova.dev", role: "employee", title: "DevOps Engineer", initials: "SA", accent: "#4A2574" },
  { id: "u-liam", name: "Liam Park", email: "liam@renova.dev", role: "employee", title: "Backend Engineer", initials: "LP", accent: "#0B4A6F" },
];

export const teamMembers: TeamMember[] = [
  {
    ...users[0], skills: [
      { name: "Delivery Planning", level: 5 }, { name: "Stakeholder Comms", level: 4 },
    ], availability: 1, weeklyCapacityHours: 32, allocatedHours: 18, activeTaskCount: 2,
  },
  {
    ...users[1], skills: [
      { name: "Node.js API", level: 5 }, { name: "Databases", level: 4 }, { name: "Docker", level: 3 },
    ], availability: 1, weeklyCapacityHours: 40, allocatedHours: 26, activeTaskCount: 3,
  },
  {
    ...users[2], skills: [
      { name: "QA Automation", level: 5 }, { name: "API Testing", level: 4 }, { name: "Performance", level: 3 },
    ], availability: 1, weeklyCapacityHours: 40, allocatedHours: 30, activeTaskCount: 3,
    note: "Committed to Customer Portal QA on Thursday",
  },
  {
    ...users[3], skills: [
      { name: "React", level: 5 }, { name: "TypeScript", level: 4 }, { name: "Design Systems", level: 4 },
    ], availability: 1, weeklyCapacityHours: 40, allocatedHours: 22, activeTaskCount: 2,
  },
  {
    ...users[4], skills: [
      { name: "CI/CD", level: 5 }, { name: "Kubernetes", level: 4 }, { name: "Observability", level: 4 },
    ], availability: 1, weeklyCapacityHours: 40, allocatedHours: 20, activeTaskCount: 2,
  },
  {
    ...users[5], skills: [
      { name: "Go", level: 4 }, { name: "Node.js API", level: 3 }, { name: "Databases", level: 3 },
    ], availability: 0.5, weeklyCapacityHours: 20, allocatedHours: 10, activeTaskCount: 1,
    note: "Half capacity this week (on-call handover)",
  },
];

export const workspace = {
  id: "ws-northwind",
  name: "Northwind Product",
  inviteCode: "OPS-7K2-QM9",
  plan: "Team" as const,
  createdAt: daysAgo(120),
};

export const workflows: Workflow[] = [
  {
    id: "wf-release",
    name: "Friday Product Release",
    goal: "Ship v2.4 to production by Friday 18:00 with zero critical regressions.",
    context: "Marketing announcement is locked for Monday morning. Payments vendor sandbox is an external dependency for integration testing.",
    status: "active",
    targetDate: daysFromNow(2),
    createdAt: daysAgo(9),
    createdBy: "u-ava",
    progress: 58,
    memberIds: ["u-marcus", "u-priya", "u-diego", "u-sofia", "u-liam"],
  },
  {
    id: "wf-portal",
    name: "Customer Portal Redesign",
    goal: "Redesign the self-service portal with a component-driven UI and cut support tickets 20%.",
    context: "Design tokens are ready in Figma. Backend endpoints for billing history ship next sprint.",
    status: "planning",
    targetDate: daysFromNow(24),
    createdAt: daysAgo(4),
    createdBy: "u-ava",
    progress: 12,
    memberIds: ["u-diego", "u-priya", "u-marcus"],
  },
  {
    id: "wf-onboard",
    name: "Support Team Onboarding",
    goal: "Onboard 3 new support engineers to the runbook and escalation process.",
    status: "completed",
    targetDate: daysAgo(6),
    createdAt: daysAgo(26),
    createdBy: "u-ava",
    progress: 100,
    memberIds: ["u-sofia", "u-priya"],
  },
];

export const tasks: Task[] = [
  // Friday Product Release
  {
    id: "t0", workflowId: "wf-release", title: "Cut release branch & version bump",
    description: "Create release/2.4 from main, bump versions, kick the nightly pipeline.",
    acceptanceCriteria: ["release/2.4 branch exists", "Version reported as 2.4.0 in build metadata", "Nightly pipeline green"],
    status: "done", priority: "high", assigneeId: "u-sofia", estimateHours: 3, dueDate: daysAgo(2), skills: ["CI/CD"], order: 0,
  },
  {
    id: "t1", workflowId: "wf-release", title: "API Development",
    description: "Implement payments reconciliation endpoints against the vendor sandbox and update API clients.",
    acceptanceCriteria: ["POST /reconciliations returns 201 with fixture data", "Client SDK regenerated", "Unit coverage >= 85% on new modules"],
    status: "blocked", priority: "critical", assigneeId: "u-marcus", estimateHours: 16, dueDate: daysFromNow(1), skills: ["Node.js API", "Databases"], order: 1,
  },
  {
    id: "t2", workflowId: "wf-release", title: "Integration Testing",
    description: "Run the full integration suite against the staging environment including payments sandbox flows.",
    acceptanceCriteria: ["Integration suite passes on staging", "Sandbox reconciliation flow verified end-to-end", "Failures triaged with owners"],
    status: "todo", priority: "critical", assigneeId: "u-priya", estimateHours: 10, dueDate: daysFromNow(2), skills: ["API Testing"], order: 2,
  },
  {
    id: "t3", workflowId: "wf-release", title: "QA Validation",
    description: "Exploratory plus scripted QA pass on the release candidate across key journeys.",
    acceptanceCriteria: ["No open critical/high defects", "Regression pack executed", "Sign-off recorded in QA log"],
    status: "todo", priority: "high", assigneeId: "u-priya", estimateHours: 8, dueDate: daysFromNow(2), skills: ["QA Automation"], order: 3,
  },
  {
    id: "t4", workflowId: "wf-release", title: "Release Readiness",
    description: "Final go/no-go checklist, deploy to production, verify dashboards and rollback plan.",
    acceptanceCriteria: ["Go/no-go checklist complete", "Production deploy successful", "Rollback plan rehearsed"],
    status: "todo", priority: "critical", assigneeId: "u-sofia", estimateHours: 6, dueDate: daysFromNow(2), skills: ["CI/CD"], order: 4,
  },
  // Customer Portal Redesign (planning — proposed plan)
  {
    id: "p1", workflowId: "wf-portal", title: "Audit existing portal journeys",
    description: "Map current routes, components and drop-off points; produce a findings brief.",
    acceptanceCriteria: ["Journey map for top 5 flows", "List of deprecated components", "Brief reviewed with team"],
    status: "todo", priority: "medium", estimateHours: 12, skills: ["React", "Design Systems"], order: 0,
  },
  {
    id: "p2", workflowId: "wf-portal", title: "Design system alignment",
    description: "Adopt the new tokens into the portal component library and document variants.",
    acceptanceCriteria: ["Tokenized theme applied", "Storybook updated", "Visual diffs approved"],
    status: "todo", priority: "high", estimateHours: 16, skills: ["Design Systems"], order: 1,
  },
  {
    id: "p3", workflowId: "wf-portal", title: "Rebuild billing history page",
    description: "Implement the new billing history page with pagination and CSV export.",
    acceptanceCriteria: ["Page matches Figma", "CSV export works", "Loading/empty/error states implemented"],
    status: "todo", priority: "high", estimateHours: 20, skills: ["React", "TypeScript"], order: 2,
  },
  {
    id: "p4", workflowId: "wf-portal", title: "Usability test round 1",
    description: "Run moderated sessions with 5 customers; synthesize findings into actions.",
    acceptanceCriteria: ["5 sessions completed", "Findings doc published", "P1 actions filed"],
    status: "todo", priority: "medium", estimateHours: 10, skills: ["QA Automation"], order: 3,
  },
  // Completed workflow
  {
    id: "o1", workflowId: "wf-onboard", title: "Runbook walkthrough sessions",
    description: "Three guided sessions covering the primary runbooks.",
    acceptanceCriteria: ["All sessions held", "Attendance recorded"],
    status: "done", priority: "medium", assigneeId: "u-sofia", estimateHours: 6, dueDate: daysAgo(10), skills: ["Observability"], order: 0,
  },
  {
    id: "o2", workflowId: "wf-onboard", title: "Escalation dry-run",
    description: "Simulated P2 incident with the new engineers.",
    acceptanceCriteria: ["Dry-run debrief completed", "Runbook edits merged"],
    status: "done", priority: "high", assigneeId: "u-priya", estimateHours: 4, dueDate: daysAgo(7), skills: ["QA Automation"], order: 1,
  },
];

export const dependencies: Dependency[] = [
  { id: "d1", fromTaskId: "t0", toTaskId: "t1" },
  { id: "d2", fromTaskId: "t1", toTaskId: "t2" },
  { id: "d3", fromTaskId: "t2", toTaskId: "t3" },
  { id: "d4", fromTaskId: "t3", toTaskId: "t4" },
  { id: "d5", fromTaskId: "p1", toTaskId: "p2" },
  { id: "d6", fromTaskId: "p2", toTaskId: "p3" },
  { id: "d7", fromTaskId: "p3", toTaskId: "p4" },
  { id: "d8", fromTaskId: "o1", toTaskId: "o2" },
];

export const proposedPlans: Record<string, PlanProposal> = {
  "wf-portal": {
    workflowId: "wf-portal",
    status: "proposed",
    generatedAt: daysAgo(1, 16),
    summary:
      "A 4-task sequence that audits current journeys first, aligns the design system, rebuilds the billing history page, then validates with customers. Critical path runs through design-system alignment.",
    warnings: ["Backend billing-history endpoints are scheduled for next sprint — p3 may need a stubbed API."],
    tasks: [
      {
        title: "Audit existing portal journeys",
        description: "Map current routes, components and drop-off points; produce a findings brief.",
        acceptanceCriteria: ["Journey map for top 5 flows", "List of deprecated components", "Brief reviewed with team"],
        skills: ["React", "Design Systems"], estimateHours: 12, dependsOn: [], suggestedPriority: "medium",
      },
      {
        title: "Design system alignment",
        description: "Adopt the new tokens into the portal component library and document variants.",
        acceptanceCriteria: ["Tokenized theme applied", "Storybook updated", "Visual diffs approved"],
        skills: ["Design Systems"], estimateHours: 16, dependsOn: ["Audit existing portal journeys"], suggestedPriority: "high",
      },
      {
        title: "Rebuild billing history page",
        description: "Implement the new billing history page with pagination and CSV export.",
        acceptanceCriteria: ["Page matches Figma", "CSV export works", "Loading/empty/error states implemented"],
        skills: ["React", "TypeScript"], estimateHours: 20, dependsOn: ["Design system alignment"], suggestedPriority: "high",
      },
      {
        title: "Usability test round 1",
        description: "Run moderated sessions with 5 customers; synthesize findings into actions.",
        acceptanceCriteria: ["5 sessions completed", "Findings doc published", "P1 actions filed"],
        skills: ["QA Automation"], estimateHours: 10, dependsOn: ["Rebuild billing history page"], suggestedPriority: "medium",
      },
    ],
  },
};

export const blockers: Blocker[] = [
  {
    id: "bk-1",
    workflowId: "wf-release",
    workflowName: "Friday Product Release",
    taskId: "t1",
    taskTitle: "API Development",
    title: "Payments vendor sandbox returning 500s",
    description: "The vendor's sandbox has been failing since 09:12 with HTTP 500 on all reconciliation calls. Vendor status page says 'investigating', no ETA yet. I can't finish endpoint validation without it.",
    severity: "high",
    status: "open",
    reportedByName: "Marcus Webb",
    reportedAt: daysAgo(0, 9),
  },
];

export const analyses: ImpactAnalysis[] = [
  {
    id: "az-1",
    blockerId: "bk-1",
    createdAt: daysAgo(0, 9),
    triggerEvent: "Payments vendor sandbox outage (HTTP 500 on all reconciliation endpoints, no vendor ETA)",
    affectedTaskId: "t1",
    affectedTaskTitle: "API Development",
    downstreamTaskIds: ["t2", "t3", "t4"],
    dependencyPath: ["API Development", "Integration Testing", "QA Validation", "Release Readiness"],
    deadlineExposure: "Release target Friday 18:00 is at risk — estimated 1.5-day critical-path delay if the sandbox stays down past Thursday noon.",
    blastRadius: 72,
    blastRadiusFactors: [
      "4 downstream tasks sit on the critical path",
      "Fixed external release window (marketing locked for Monday)",
      "QA lead shared with Customer Portal QA commitment on Thursday",
      "Vendor ETA unknown — recovery cannot start until endpoints respond",
    ],
    constraints: [
      "Priya Nair committed to Customer Portal QA on Thursday",
      "Liam Park at 50% capacity this week",
      "Staging environment reserved Wednesday for release rehearsal",
    ],
  },
];

export const alternatives: RecoveryAlternative[] = [
  {
    id: "alt-1",
    analysisId: "az-1",
    label: "Fastest",
    title: "Pair Liam with Marcus on API recovery",
    description: "Move Liam onto the reconciliation endpoints immediately as a pair so context transfer happens while the sandbox is down; pre-write retry/backoff handling and fixture-based tests so only the live verification remains when the vendor returns.",
    assignmentChanges: [
      { taskId: "t1", taskTitle: "API Development", toMemberId: "u-liam", toMemberName: "Liam Park", reason: "Second backend engineer; pairing keeps Marcus unblocked on non-sandbox work" },
    ],
    scheduleEffect: "Meets Friday 18:00 with ~4h buffer if vendor returns by Thursday 12:00",
    estimatedDelayDays: -0.5,
    skillFeasible: true,
    availabilityFeasible: true,
    workloadImpact: "Liam 50% → 85% this week; drops his docs task",
    risks: ["Ramp-up on the payments module (~2h)", "Pairing session needs Marcus's full attention today"],
    assumptions: ["Vendor sandbox recovers by Thursday noon", "Fixture tests cover 80% of validation"],
    recommended: false,
  },
  {
    id: "alt-2",
    analysisId: "az-1",
    label: "Balanced",
    title: "Shift QA Validation to Diego, keep Marcus focused",
    description: "Diego takes the scripted regression portion of QA Validation, freeing Priya to run integration testing the moment the sandbox recovers. Marcus keeps full focus on API recovery without pairing overhead.",
    assignmentChanges: [
      { taskId: "t3", taskTitle: "QA Validation", fromMemberId: "u-priya", fromMemberName: "Priya Nair", toMemberId: "u-diego", toMemberName: "Diego Ruiz", reason: "Diego has capacity and knows the journeys; Priya stays on integration testing" },
    ],
    scheduleEffect: "Meets Friday 18:00 with ~2h buffer; no change to API task",
    estimatedDelayDays: 0,
    skillFeasible: true,
    availabilityFeasible: true,
    workloadImpact: "Diego 55% → 75%; Priya protects her Thursday commitment",
    risks: ["Diego unfamiliar with the QA harness — add a 2h onboarding pair session", "Exploratory depth slightly reduced"],
    assumptions: ["Diego completes harness onboarding by Wednesday evening"],
    recommended: true,
  },
  {
    id: "alt-3",
    analysisId: "az-1",
    label: "Lowest Cost",
    title: "Wait for vendor, compress QA window",
    description: "No assignment changes. Hold the current plan and compress QA into a single condensed window once integration testing completes.",
    assignmentChanges: [],
    scheduleEffect: "Friday 18:00 at risk (~60% confidence); QA window shrinks from 8h to 4h",
    estimatedDelayDays: 0.5,
    skillFeasible: true,
    availabilityFeasible: true,
    workloadImpact: "No workload changes",
    risks: ["No buffer for regression fixes", "Marketing commit for Monday could slip"],
    assumptions: ["Team accepts overtime risk on Friday", "Vendor recovers by Thursday EOD"],
    recommended: false,
  },
];

export const recoveryCases: RecoveryCase[] = [
  {
    id: "rc-1",
    workflowId: "wf-release",
    workflowName: "Friday Product Release",
    blocker: blockers[0],
    status: "needs_decision",
    createdAt: daysAgo(0, 9),
    affectedTaskTitle: "API Development",
    analysisId: "az-1",
    analysis: analyses[0],
    alternatives: alternatives,
  },
];

export const risks: RiskItem[] = [
  {
    id: "rk-1", workflowId: "wf-release", workflowName: "Friday Product Release", taskId: "t1",
    title: "External dependency: payments vendor sandbox",
    description: "Integration testing depends on a third-party sandbox with a history of instability. No contractual uptime guarantee for release weeks.",
    severity: "high", likelihood: "likely", deadlineExposure: "Friday 18:00 release window",
    factors: ["Vendor ETA unknown during active outage", "Critical path passes through affected task"], detectedAt: daysAgo(1),
  },
  {
    id: "rk-2", workflowId: "wf-release", workflowName: "Friday Product Release", taskId: "t3",
    title: "QA capacity contention on Thursday",
    description: "Priya is committed to Customer Portal QA on Thursday while QA Validation may land on the same day.",
    severity: "medium", likelihood: "possible", deadlineExposure: "QA Validation due Friday",
    factors: ["Single QA engineer on release", "Parallel workflow commitment"], detectedAt: daysAgo(2),
  },
  {
    id: "rk-3", workflowId: "wf-portal", workflowName: "Customer Portal Redesign", taskId: "p3",
    title: "Billing API lands after UI build starts",
    description: "Backend billing-history endpoints are scheduled for next sprint; p3 may need a stubbed API and rework.",
    severity: "medium", likelihood: "likely", deadlineExposure: "Portal milestone in 3 weeks",
    factors: ["Cross-team dependency", "No agreed stub contract yet"], detectedAt: daysAgo(1),
  },
];

export const auditEvents: AuditEvent[] = [
  { id: "a1", at: daysAgo(9, 9), actorName: "Ava Chen", actorRole: "team_lead", action: "workflow.created", target: "Friday Product Release", outcome: "success", details: "Goal captured, plan generation requested" },
  { id: "a2", at: daysAgo(9, 9), actorName: "Renova", actorRole: "system", action: "plan.generated", target: "Friday Product Release", outcome: "success", details: "5 tasks proposed, 4 dependencies" },
  { id: "a3", at: daysAgo(8, 14), actorName: "Ava Chen", actorRole: "team_lead", action: "allocation.confirmed", target: "Friday Product Release", outcome: "success", details: "4 assignments confirmed from 4 recommendations" },
  { id: "a4", at: daysAgo(2, 11), actorName: "Sofia Ahmad", actorRole: "employee", action: "task.status_changed", target: "Cut release branch & version bump", outcome: "success", details: "in_progress → done" },
  { id: "a5", at: daysAgo(0, 9), actorName: "Marcus Webb", actorRole: "employee", action: "blocker.reported", target: "API Development", outcome: "success", details: "Payments vendor sandbox returning 500s" },
  { id: "a6", at: daysAgo(0, 9), actorName: "Renova", actorRole: "system", action: "recovery.analyzed", target: "Blocker bk-1", outcome: "success", details: "Blast radius estimate 72, 4 downstream tasks" },
  { id: "a7", at: daysAgo(0, 9), actorName: "Renova", actorRole: "system", action: "recovery.alternatives_ready", target: "Blocker bk-1", outcome: "success", details: "3 alternatives generated" },
  { id: "a8", at: daysAgo(4, 10), actorName: "Ava Chen", actorRole: "team_lead", action: "workflow.created", target: "Customer Portal Redesign", outcome: "success" },
  { id: "a9", at: daysAgo(1, 16), actorName: "Renova", actorRole: "system", action: "plan.generated", target: "Customer Portal Redesign", outcome: "success", details: "4 tasks proposed" },
];

export const usage: UsageInfo = {
  plan: "Team",
  periodStart: iso(startOfMonth(now)),
  periodEnd: iso(endOfMonth(now)),
  workflowsUsed: 3,
  workflowsLimit: 10,
  seatsUsed: 6,
  seatsLimit: 8,
  aiGenerationsUsed: 14,
  aiGenerationsLimit: 50,
  recoveryRunsUsed: 3,
  recoveryRunsLimit: 15,
  billingStatus: "unavailable",
};

export const defaultSettings: WorkspaceSettings = {
  name: "Northwind Product",
  timezone: "Asia/Calcutta",
  weekStart: "monday",
  notifications: { blockerReported: true, recoveryDecisions: true, weeklyDigest: false, deadlineReminders: true },
  demoMode: true,
};

export const allocationPlans: Record<string, AllocationPlan> = {};

export function seedSessionFor(userId: string): Session {
  const user = users.find((u) => u.id === userId)!;
  return { token: `demo-token-${userId}-${Date.now()}`, user, workspace };
}
