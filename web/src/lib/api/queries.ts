"use client";

/**
 * TanStack Query hooks — the ONLY way views talk to the API layer.
 * Centralized query keys + invalidation helpers keep cache behavior consistent.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getApi } from "./client";
import { ApiError, type ApprovalDecision, type MockBehavior, type PlanTask, type TaskStatus, type WorkspaceSettings } from "./types";

export const qk = {
  session: ["session"] as const,
  team: ["team"] as const,
  workflows: (params?: { search?: string; status?: string }) => ["workflows", params ?? {}] as const,
  workflow: (id: string) => ["workflow", id] as const,
  plan: (id: string) => ["plan", id] as const,
  allocation: (id: string) => ["allocation", id] as const,
  execution: (id: string) => ["execution", id] as const,
  myTasks: ["myTasks"] as const,
  task: (id: string) => ["task", id] as const,
  approvedChanges: ["approvedChanges"] as const,
  recoveryCases: ["recoveryCases"] as const,
  recoveryCase: (id: string) => ["recoveryCase", id] as const,
  risks: ["risks"] as const,
  audit: ["audit"] as const,
  usage: ["usage"] as const,
  settings: ["settings"] as const,
};

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/* ---------------- Session ---------------- */

export function useSession() {
  return useQuery({
    queryKey: qk.session,
    queryFn: async () => getApi().getSession(),
    staleTime: 60_000,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; password: string }) => getApi().login(input.email, input.password),
    onSuccess: (session) => {
      qc.setQueryData(qk.session, session);
      qc.invalidateQueries();
    },
    onError: (err) => toast.error(errorMessage(err, "Could not sign in.")),
  });
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; email: string; password: string; organizationName: string }) => getApi().register(input),
    onSuccess: (session) => {
      qc.setQueryData(qk.session, session);
      qc.invalidateQueries();
    },
    onError: (err) => toast.error(errorMessage(err, "Could not create your account.")),
  });
}

export function useRequestPasswordReset() {
  return useMutation({
    mutationFn: (email: string) => getApi().requestPasswordReset(email),
    onError: (err) => toast.error(errorMessage(err, "Could not send a reset link.")),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => getApi().logout(),
    onSuccess: () => {
      qc.setQueryData(qk.session, null);
      qc.clear();
    },
    onError: (err) => toast.error(errorMessage(err, "Sign out failed.")),
  });
}

/* ---------------- Workspace & team ---------------- */

export function useCreateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; goalHint?: string }) => getApi().createWorkspace(input),
    onSuccess: (session) => qc.setQueryData(qk.session, session),
    onError: (err) => toast.error(errorMessage(err, "Could not create the workspace.")),
  });
}

export function useJoinWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { inviteCode: string }) => getApi().joinWorkspace(input),
    onSuccess: (session) => qc.setQueryData(qk.session, session),
    onError: (err) => toast.error(errorMessage(err, "Could not join the workspace.")),
  });
}

export function useInviteMember() {
  return useMutation({
    mutationFn: (input: { email: string; role: "team_lead" | "employee"; title?: string }) => getApi().inviteMember(input),
    onError: (err) => toast.error(errorMessage(err, "Invite failed.")),
  });
}

export function useTeam() {
  return useQuery({ queryKey: qk.team, queryFn: () => getApi().listTeam() });
}

/* ---------------- Workflows & planning ---------------- */

export function useWorkflows(params?: { search?: string; status?: string }) {
  return useQuery({ queryKey: qk.workflows(params), queryFn: () => getApi().listWorkflows(params) });
}

export function useWorkflow(id: string) {
  return useQuery({ queryKey: qk.workflow(id), queryFn: () => getApi().getWorkflow(id), enabled: !!id });
}

export function useCreateWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { title?: string; goal: string; targetDate: string; context?: string; memberIds?: string[] }) => getApi().createWorkflow(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workflows"] }),
    onError: (err) => toast.error(errorMessage(err, "Could not create the workflow.")),
  });
}

export function useGeneratePlan(workflowId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => getApi().generatePlan(workflowId),
    onSuccess: (plan) => {
      qc.setQueryData(qk.plan(workflowId), plan);
      qc.invalidateQueries({ queryKey: qk.workflow(workflowId) });
      toast.success("Plan generated", { description: "Review the proposed tasks before validating." });
    },
    onError: (err) => toast.error(errorMessage(err, "Plan generation failed. You can retry — nothing was lost.")),
  });
}

export function usePlan(workflowId: string) {
  return useQuery({ queryKey: qk.plan(workflowId), queryFn: () => getApi().getPlan(workflowId), enabled: !!workflowId });
}

export function useSavePlanTask(workflowId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (task: PlanTask) => getApi().savePlanTask(workflowId, task),
    onSuccess: (plan) => qc.setQueryData(qk.plan(workflowId), plan),
    onError: (err) => toast.error(errorMessage(err, "Could not save the task.")),
  });
}

export function useDeletePlanTask(workflowId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => getApi().deletePlanTask(workflowId, taskId),
    onSuccess: (plan) => qc.setQueryData(qk.plan(workflowId), plan),
    onError: (err) => toast.error(errorMessage(err, "Could not delete the task.")),
  });
}

export function useValidatePlan(workflowId: string) {
  return useMutation({
    mutationFn: () => getApi().validatePlan(workflowId),
    onError: (err) => toast.error(errorMessage(err, "Validation request failed.")),
  });
}

export function useConfirmPlan(workflowId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => getApi().confirmPlan(workflowId),
    onSuccess: (res) => {
      /* Re-read the authoritative state: API mode re-fetches the backend
         proposal (now APPROVED); mock mode materializes tasks locally. */
      qc.invalidateQueries({ queryKey: qk.plan(workflowId) });
      qc.invalidateQueries({ queryKey: qk.workflow(workflowId) });
      qc.invalidateQueries({ queryKey: qk.execution(workflowId) });
      const counts = [
        res.createdTasksCount != null ? `${res.createdTasksCount} task${res.createdTasksCount === 1 ? "" : "s"}` : null,
        res.createdDependenciesCount != null ? `${res.createdDependenciesCount} dependenc${res.createdDependenciesCount === 1 ? "y" : "ies"}` : null,
      ].filter(Boolean).join(" · ");
      toast.success("Proposal approved", { description: counts ? `The backend created ${counts}.` : "The plan is confirmed." });
    },
    onError: (err) => toast.error(errorMessage(err, "Could not confirm the plan.")),
  });
}

export function useRejectPlan(workflowId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (notes?: string) => getApi().rejectPlan(workflowId, notes),
    onSuccess: () => {
      /* Re-fetch the authoritative state: mock mode drops the proposal (the
         generate step returns), API mode re-reads the backend proposal whose
         status is now "REJECTED". */
      qc.invalidateQueries({ queryKey: qk.plan(workflowId) });
      qc.invalidateQueries({ queryKey: qk.workflow(workflowId) });
      toast.success("Proposal rejected", { description: "Nothing was committed — you can generate a new plan." });
    },
    onError: (err) => toast.error(errorMessage(err, "Could not reject the proposal.")),
  });
}

/* ---------------- Allocation ---------------- */

export function useAllocation(workflowId: string) {
  return useQuery({ queryKey: qk.allocation(workflowId), queryFn: () => getApi().getAllocation(workflowId), enabled: !!workflowId });
}

export function useReassignTask(workflowId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { taskId: string; memberId: string | null }) => getApi().reassignTask(workflowId, input.taskId, input.memberId),
    onSuccess: (rec) => {
      qc.setQueryData<import("./types").AllocationPlan>(qk.allocation(workflowId), (old) =>
        old ? { ...old, recommendations: old.recommendations.map((r) => (r.taskId === rec.taskId ? rec : r)) } : old
      );
    },
    onError: (err) => toast.error(errorMessage(err, "Reassignment failed — showing authoritative state.")),
  });
}

export function useConfirmAllocation(workflowId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => getApi().confirmAllocation(workflowId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.allocation(workflowId) });
      qc.invalidateQueries({ queryKey: qk.workflow(workflowId) });
      qc.invalidateQueries({ queryKey: qk.execution(workflowId) });
      toast.success("Allocation confirmed", { description: "Assignments are now live in the workflow." });
    },
    onError: (err) => toast.error(errorMessage(err, "Could not confirm allocation.")),
  });
}

/* ---------------- Execution ---------------- */

export function useExecution(workflowId: string) {
  return useQuery({ queryKey: qk.execution(workflowId), queryFn: () => getApi().getExecution(workflowId), enabled: !!workflowId });
}

export function useUpdateTaskStatus(workflowId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { taskId: string; status: TaskStatus }) => getApi().updateTaskStatus(input.taskId, input.status),
    onMutate: async (input) => {
      // Optimistic update on the task detail cache only (safe, refetched on error)
      const prevTask = qc.getQueryData<import("./types").Task & object>(qk.task(input.taskId));
      return { prevTask };
    },
    onSuccess: (task) => {
      qc.setQueryData(qk.task(task.id), (old: object | undefined) => (old ? { ...(old as object), ...task } : task));
      qc.invalidateQueries({ queryKey: qk.myTasks });
      if (workflowId) qc.invalidateQueries({ queryKey: qk.execution(workflowId) });
      qc.invalidateQueries({ queryKey: ["workflows"] });
      toast.success(`Task moved to “${task.status.replace("_", " ")}”`);
    },
    onError: (err, _input, ctx) => {
      if (ctx?.prevTask) qc.setQueryData(qk.task(_input.taskId), ctx.prevTask);
      qc.invalidateQueries({ queryKey: qk.myTasks });
      toast.error(errorMessage(err, "Status update failed. The task list was restored."));
    },
  });
}

export function useReportBlocker() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { taskId: string; title: string; description: string; severity: import("./types").BlockerSeverity }) => getApi().reportBlocker(input),
    onSuccess: (blocker) => {
      qc.invalidateQueries({ queryKey: qk.task(blocker.taskId) });
      qc.invalidateQueries({ queryKey: qk.myTasks });
      qc.invalidateQueries({ queryKey: qk.execution(blocker.workflowId) });
      qc.invalidateQueries({ queryKey: qk.recoveryCases });
      toast.success("Blocker reported", { description: "The Recovery Center now has an open case for this task." });
    },
    onError: (err) => toast.error(errorMessage(err, "Could not report the blocker.")),
  });
}

/* ---------------- Employee ---------------- */

export function useMyTasks() {
  return useQuery({ queryKey: qk.myTasks, queryFn: () => getApi().listMyTasks() });
}

export function useTask(taskId: string) {
  return useQuery({ queryKey: qk.task(taskId), queryFn: () => getApi().getTask(taskId), enabled: !!taskId });
}

export function useApprovedChanges() {
  return useQuery({ queryKey: qk.approvedChanges, queryFn: () => getApi().listApprovedChanges() });
}

/* ---------------- Recovery engine ---------------- */

export function useRecoveryCases() {
  return useQuery({ queryKey: qk.recoveryCases, queryFn: () => getApi().listRecoveryCases() });
}

export function useRecoveryCase(id: string) {
  return useQuery({ queryKey: qk.recoveryCase(id), queryFn: () => getApi().getRecoveryCase(id), enabled: !!id });
}

function invalidateRecovery(qc: ReturnType<typeof useQueryClient>, caseId: string) {
  qc.invalidateQueries({ queryKey: qk.recoveryCases });
  qc.invalidateQueries({ queryKey: qk.recoveryCase(caseId) });
  qc.invalidateQueries({ queryKey: ["workflows"] });
  qc.invalidateQueries({ queryKey: qk.audit });
  qc.invalidateQueries({ queryKey: qk.team });
}

export function useRequestAnalysis(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (blockerId: string) => getApi().requestAnalysis(blockerId),
    onSuccess: (analysis) => {
      qc.setQueryData<import("./types").RecoveryCase>(qk.recoveryCase(caseId), (old) =>
        old ? { ...old, analysis, analysisId: analysis.id, status: "analyzing" } : old
      );
      invalidateRecovery(qc, caseId);
      toast.success("Impact analysis complete", { description: "Blast radius estimate is ready for review." });
    },
    onError: (err) => toast.error(errorMessage(err, "Analysis failed. You can safely retry.")),
  });
}

export function useRequestAlternatives(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (analysisId: string) => getApi().requestAlternatives(analysisId),
    onSuccess: (alternatives) => {
      qc.setQueryData<import("./types").RecoveryCase>(qk.recoveryCase(caseId), (old) =>
        old ? { ...old, alternatives, status: "needs_decision" } : old
      );
      invalidateRecovery(qc, caseId);
      toast.success("Recovery alternatives ready", { description: `${alternatives.length} options generated for comparison.` });
    },
    onError: (err) => toast.error(errorMessage(err, "Could not generate alternatives. You can retry.")),
  });
}

export function useDecideProposal(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { analysisId: string; alternativeId: string; decision: ApprovalDecision; comment?: string }) =>
      getApi().decideProposal({ caseId, ...input }),
    onSuccess: (decision) => {
      qc.setQueryData<import("./types").RecoveryCase>(qk.recoveryCase(caseId), (old) =>
        old ? { ...old, decision, status: "decided" } : old
      );
      invalidateRecovery(qc, caseId);
    },
    onError: (err) => {
      invalidateRecovery(qc, caseId);
      toast.error(errorMessage(err, "Decision could not be submitted. The case was refreshed to the server state."));
    },
  });
}

export function useVerification(decisionId: string | undefined) {
  return useQuery({
    queryKey: ["verification", decisionId],
    queryFn: () => getApi().getVerification(decisionId!),
    enabled: !!decisionId,
  });
}

/* ---------------- Misc ---------------- */

export function useRisks() {
  return useQuery({ queryKey: qk.risks, queryFn: () => getApi().listRisks() });
}

export function useAudit() {
  return useQuery({ queryKey: qk.audit, queryFn: () => getApi().listAudit() });
}

export function useUsage() {
  return useQuery({ queryKey: qk.usage, queryFn: () => getApi().getUsage() });
}

export function useSettings() {
  return useQuery({ queryKey: qk.settings, queryFn: () => getApi().getSettings() });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<WorkspaceSettings>) => getApi().updateSettings(patch),
    onSuccess: (s) => {
      qc.setQueryData(qk.settings, s);
      toast.success("Settings saved");
    },
    onError: (err) => toast.error(errorMessage(err, "Could not save settings.")),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: { name?: string; title?: string }) => getApi().updateProfile(patch),
    onSuccess: (session) => {
      qc.setQueryData(qk.session, session);
      toast.success("Profile updated");
    },
    onError: (err) => toast.error(errorMessage(err, "Could not update profile.")),
  });
}

/* ---------------- Demo controls ---------------- */

export function useMockBehavior() {
  return useQuery({ queryKey: ["mockBehavior"], queryFn: () => getApi().getMockBehavior(), staleTime: Infinity });
}

export function useSetMockBehavior() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<MockBehavior>) => Promise.resolve(getApi().setMockBehavior(patch)),
    onSuccess: (b) => qc.setQueryData(["mockBehavior"], b),
  });
}
