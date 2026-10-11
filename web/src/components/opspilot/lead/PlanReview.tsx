"use client";

/**
 * Team lead — plan review.
 *
 * Draft/planning workflows without a plan get a "Generate plan" hero with an
 * animated step panel (purely presentational while the mutation runs).
 * Existing plans are reviewable: editable tasks, dependency graph with
 * client-side cycle prevention, validation and confirm gating. The backend
 * stays authoritative — the client DFS only prevents obvious mistakes early.
 *
 * Backend proposals (API mode): proposals carrying `backendId` are served by
 * the shared FastAPI backend and are READ-ONLY — editing/validation stay
 * mock-only until the contract supports them. Approval and rejection go
 * through the backend's approve/reject endpoints, and the rendered state is
 * always re-read from the backend afterwards (never assumed locally).
 */
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock,
  GitBranch,
  ListChecks,
  Loader2,
  Network,
  OctagonAlert,
  Pencil,
  PlugZap,
  Plus,
  Sparkles,
  Trash2,
  X,
  History,
  ServerOff,
  TimerOff,
} from "lucide-react";
import { navigate } from "@/lib/router";
import {
  qk,
  useConfirmPlan,
  useDeletePlanTask,
  useGeneratePlan,
  usePlan,
  useRejectPlan,
  useSavePlanTask,
  useValidatePlan,
  useWorkflow,
} from "@/lib/api/queries";
import type { PlanIssue, PlanProposal, PlanTask, TaskPriority, TaskStatus } from "@/lib/api/types";
import {
  Chip,
  ConfirmDialog,
  DemoDataBadge,
  EmptyState,
  ErrorState,
  M3Button,
  PageHeader,
  PriorityChip,
  SkeletonCards,
  SkeletonTable,
  TextArea,
  TextField,
} from "@/components/opspilot/primitives";
import { DepGraph, depGraphNodesFromTasks } from "@/components/opspilot/dep-graph";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------- */
/* Helpers                                                           */
/* ---------------------------------------------------------------- */

function errMsg(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/** Stable key for a plan task: persisted id when present, otherwise title. */
const keyOf = (t: PlanTask) => t.id ?? t.title;

/** Resolve a dependsOn reference (id or title) to the stable key of a task. */
function resolveDepKey(tasks: PlanTask[], dep: string): string | null {
  const byId = tasks.find((t) => t.id === dep);
  if (byId) return keyOf(byId);
  const byTitle = tasks.find((t) => t.title === dep);
  return byTitle ? keyOf(byTitle) : null;
}

/**
 * Client-side cycle guard: adding "self depends on dep" creates a cycle iff
 * self is reachable from dep by following dependsOn edges.
 */
function wouldCreateCycle(tasks: PlanTask[], selfKey: string, depKey: string): boolean {
  if (selfKey === depKey) return true;
  const byKey = new Map(tasks.map((t) => [keyOf(t), t]));
  const seen = new Set<string>();
  const stack = [depKey];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (cur === selfKey) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const t = byKey.get(cur);
    if (!t) continue;
    for (const d of t.dependsOn) {
      const k = resolveDepKey(tasks, d);
      if (k) stack.push(k);
    }
  }
  return false;
}

const PRIORITY_ORDER: TaskPriority[] = ["low", "medium", "high", "critical"];
const GEN_STEPS = ["Analyzing goal", "Sequencing work", "Matching skills", "Drafting acceptance criteria"];

const inputCls =
  "h-11 w-full rounded-xl border border-input bg-background px-3.5 text-body-md outline-none transition-all duration-200 ease-m3 placeholder:text-outline focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/25 hover:border-outline";

/* ---------------------------------------------------------------- */
/* Page                                                              */
/* ---------------------------------------------------------------- */

export default function PlanReviewPage({ workflowId }: { workflowId: string }) {
  const wfQ = useWorkflow(workflowId);
  const planQ = usePlan(workflowId);
  const gen = useGeneratePlan(workflowId);

  const wf = wfQ.data;
  const plan = planQ.data ?? null;
  const canGenerate = !!wf && (wf.status === "draft" || wf.status === "planning");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[
          { label: "Workflows", href: "#/workflows" },
          ...(wf ? [{ label: wf.name, href: `#/workflows/${workflowId}` }] : []),
          { label: "Plan" },
        ]}
        title="Plan review"
        description={
          wf ? `Review, adjust and confirm the proposed plan for “${wf.name}”.` : "Review the proposed plan before committing it to the workflow."
        }
        actions={
          plan?.backendId ? (
            <Chip tone="info" title="This proposal is served by the shared Renova backend (API mode).">
              <PlugZap className="size-3.5" aria-hidden /> Backend proposal
            </Chip>
          ) : (
            <DemoDataBadge />
          )
        }
      />

      {wfQ.isLoading || planQ.isLoading ? (
        <div className="flex flex-col gap-4">
          <SkeletonCards count={1} />
          <SkeletonTable rows={4} cols={3} />
        </div>
      ) : wfQ.isError ? (
        <ErrorState title="Could not load this workflow" message={errMsg(wfQ.error, "Try again in a moment.")} onRetry={() => wfQ.refetch()} />
      ) : planQ.isError ? (
        <ErrorState title="Could not load the plan" message={errMsg(planQ.error, "Try again in a moment.")} onRetry={() => planQ.refetch()} />
      ) : plan ? (
        <PlanReviewBody workflowId={workflowId} plan={plan} />
      ) : canGenerate ? (
        <GenerateHero pending={gen.isPending} error={gen.isError ? gen.error : null} onGenerate={() => gen.mutate()} />
      ) : (
        <EmptyState
          icon={ListChecks}
          title="No plan on record"
          description="This workflow doesn't have a plan proposal — its tasks live directly in execution."
          action={<M3Button onClick={() => navigate(`/workflows/${workflowId}`)}>Open workflow</M3Button>}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Generate hero (no plan yet)                                       */
/* ---------------------------------------------------------------- */

function GenerateHero({ pending, error, onGenerate }: { pending: boolean; error: unknown; onGenerate: () => void }) {
  const [step, setStep] = React.useState(0);

  React.useEffect(() => {
    if (!pending) {
      setStep(0);
      return;
    }
    const t = setInterval(() => setStep((s) => Math.min(s + 1, GEN_STEPS.length - 1)), 700);
    return () => clearInterval(t);
  }, [pending]);

  return (
    <section className="rounded-[24px] bg-card p-6 shadow-xs ring-1 ring-border md:p-10">
      {error ? (
        <ErrorState title="Plan generation failed" message={errMsg(error, "Nothing was lost — you can safely retry.")} onRetry={onGenerate} />
      ) : pending ? (
        <div className="mx-auto max-w-md" aria-live="polite" role="status">
          <div className="mb-6 flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-secondary text-primary">
              <Loader2 className="size-5 animate-spin" aria-hidden />
            </span>
            <div>
              <p className="text-title-md font-semibold">Generating the plan…</p>
              <p className="text-label-md text-on-surface-variant">
                Step {step + 1} of {GEN_STEPS.length} — usually a few seconds.
              </p>
            </div>
          </div>
          <ol className="space-y-3">
            {GEN_STEPS.map((label, i) => {
              const state = i < step ? "done" : i === step ? "active" : "idle";
              return (
                <li key={label} className="flex items-center gap-3">
                  {state === "done" ? (
                    <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden />
                  ) : state === "active" ? (
                    <Loader2 className="size-5 shrink-0 animate-spin text-primary" aria-hidden />
                  ) : (
                    <Circle className="size-5 shrink-0 text-outline-variant" aria-hidden />
                  )}
                  <span className={cn("text-label-lg", state === "idle" && "text-on-surface-variant")}>{label}</span>
                  {state === "done" && (
                    <Chip tone="success" className="ml-auto">
                      Done
                    </Chip>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-5 py-6 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-secondary text-primary">
            <Sparkles className="size-6" aria-hidden />
          </div>
          <div className="max-w-lg">
            <h2 className="text-title-lg font-bold">Let Renova draft the plan</h2>
            <p className="mt-2 text-body-md text-on-surface-variant">
              Renova breaks the goal into sequenced tasks with skills, estimates and acceptance criteria. You review and adjust
              everything before it&apos;s committed.
            </p>
          </div>
          <M3Button size="lg" onClick={onGenerate}>
            <Sparkles className="size-5" aria-hidden /> Generate plan with Renova
          </M3Button>
          <p className="text-label-sm text-on-surface-variant">Nothing is saved until you review and confirm the proposal.</p>
        </div>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- */
/* Plan review body (plan exists)                                    */
/* ---------------------------------------------------------------- */

function PlanReviewBody({ workflowId, plan }: { workflowId: string; plan: PlanProposal }) {
  const qc = useQueryClient();
  const save = useSavePlanTask(workflowId);
  const del = useDeletePlanTask(workflowId);
  const validate = useValidatePlan(workflowId);
  const confirm = useConfirmPlan(workflowId);
  const reject = useRejectPlan(workflowId);

  /* Backend proposals (API mode) are read-only and decided via the backend's
     approve/reject endpoints; the raw backend status drives the UI. Spec
     status enum: generated | validated | approved | rejected | stale |
     persistence_failed (lower-cased by the adapter). */
  const isBackend = !!plan.backendId;
  const backendRejected = isBackend && plan.backendStatus === "rejected";
  const backendStale = isBackend && plan.backendStatus === "stale";
  const backendPersistenceFailed = isBackend && plan.backendStatus === "persistence_failed";
  const backendExpired =
    isBackend &&
    !backendRejected &&
    plan.status !== "confirmed" &&
    !!plan.backendExpiresAt &&
    parseISO(plan.backendExpiresAt).getTime() < Date.now();

  const confirmed = plan.status === "confirmed";
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [dialogTask, setDialogTask] = React.useState<PlanTask | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<PlanTask | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [rejectNotes, setRejectNotes] = React.useState("");

  /* Validation results belong to the exact plan snapshot they were run on;
     any save/delete produces a new snapshot and silently invalidates them. */
  const [validation, setValidation] = React.useState<{ plan: PlanProposal; issues: PlanIssue[] } | null>(null);
  const issues = validation && validation.plan === plan ? validation.issues : null;
  const hasErrors = !!issues?.some((i) => i.severity === "error");
  const zeroTasks = plan.tasks.length === 0;

  const graph = React.useMemo(() => {
    // dep-graph natively supports the "proposed" status (tertiary container);
    // its public type only lists TaskStatus, hence the narrow cast.
    const nodes = plan.tasks.map((t) => ({
      id: keyOf(t),
      title: t.title,
      status: "proposed" as unknown as TaskStatus,
    }));
    const edges = plan.tasks
      .flatMap((t) => t.dependsOn.map((d) => ({ d, to: keyOf(t) })))
      .map(({ d, to }) => {
        const from = resolveDepKey(plan.tasks, d);
        return from ? { fromTaskId: from, toTaskId: to } : null;
      })
      .filter((e): e is { fromTaskId: string; toTaskId: string } => !!e);
    return depGraphNodesFromTasks(nodes, edges);
  }, [plan]);

  function runValidate() {
    validate.mutate(undefined, {
      onSuccess: (data) => setValidation({ plan, issues: data.issues }),
    });
  }

  function onConfirm() {
    confirm.mutate(undefined, {
      onSuccess: () => {
        setConfirmOpen(false);
        qc.invalidateQueries({ queryKey: qk.plan(workflowId) });
        /* Allocation is mock-backed — only meaningful for demo workflows. */
        if (!isBackend) navigate(`/workflows/${workflowId}/allocation`);
      },
      onError: () => setConfirmOpen(false),
    });
  }

  function onReject() {
    /* notes map to the backend's ProposalRejectRequest.notes (≤4000 chars). */
    reject.mutate(rejectNotes.trim() || undefined, {
      onSuccess: () => setRejectOpen(false),
      onError: () => setRejectOpen(false),
    });
  }

  /** Generated tasks have no id until saved once — save then delete. */
  async function handleDelete(t: PlanTask) {
    setDeleting(true);
    try {
      let id = t.id;
      if (!id) {
        const saved = await save.mutateAsync(t);
        for (let i = saved.tasks.length - 1; i >= 0; i--) {
          if (saved.tasks[i].title === t.title) {
            id = saved.tasks[i].id;
            break;
          }
        }
      }
      if (id) await del.mutateAsync(id);
    } catch {
      /* toasts already surfaced by the hooks */
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {confirmed && (
        <section
          role="status"
          className="flex flex-col gap-3 rounded-[24px] bg-success-container p-5 text-on-success-container md:flex-row md:items-center md:p-6"
        >
          <CheckCircle2 className="size-6 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-title-sm font-semibold">
              {isBackend ? "This proposal is approved on the backend" : "This plan is confirmed"}
            </p>
            <p className="text-label-md opacity-80">
              {isBackend
                ? "The approval was recorded by the Renova API. Task materialization and team assignment follow the backend's execution model — the proposal itself stays read-only here."
                : "Tasks are materialized in the workflow. Editing is closed — manage the work in allocation or execution."}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {isBackend ? (
              <M3Button size="sm" onClick={() => navigate("/workflows")}>
                Back to workflows <ArrowRight className="size-4" aria-hidden />
              </M3Button>
            ) : (
              <>
                <M3Button variant="outlined" size="sm" className="border-on-success-container/40 text-on-success-container hover:bg-on-success-container/10" onClick={() => navigate(`/workflows/${workflowId}/allocation`)}>
                  Allocation
                </M3Button>
                <M3Button size="sm" onClick={() => navigate(`/workflows/${workflowId}`)}>
                  Execution <ArrowRight className="size-4" aria-hidden />
                </M3Button>
              </>
            )}
          </div>
        </section>
      )}

      {backendRejected && (
        <section
          role="status"
          className="flex flex-col gap-3 rounded-[24px] bg-error-container p-5 text-on-error-container md:flex-row md:items-center md:p-6"
        >
          <OctagonAlert className="size-6 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-title-sm font-semibold">This proposal was rejected on the backend</p>
            <p className="text-label-md opacity-80">
              The rejection was recorded by the Renova API — nothing was committed. You can generate a new plan proposal for this goal.
            </p>
          </div>
        </section>
      )}

      {backendStale && (
        <section
          role="status"
          className="flex flex-col gap-3 rounded-[24px] bg-warning-container p-5 text-on-warning-container md:flex-row md:items-center md:p-6"
        >
          <History className="size-6 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-title-sm font-semibold">The backend marked this proposal stale</p>
            <p className="text-label-md opacity-80">
              The goal changed or the proposal expired before a decision was recorded. Generate a new plan proposal for this goal — approving a stale proposal is not possible.
            </p>
          </div>
        </section>
      )}

      {backendPersistenceFailed && (
        <section
          role="alert"
          className="flex flex-col gap-3 rounded-[24px] bg-error-container p-5 text-on-error-container md:flex-row md:items-center md:p-6"
        >
          <ServerOff className="size-6 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-title-sm font-semibold">The backend could not persist the approved plan</p>
            <p className="text-label-md opacity-80">
              Approval did not result in persisted tasks (PERSISTENCE_FAILED). Nothing is shown as saved — retry the approval or contact the backend owner.
            </p>
          </div>
        </section>
      )}

      {backendExpired && !backendStale && (
        <section
          role="status"
          className="flex items-start gap-3 rounded-[24px] bg-warning-container/70 p-4 text-on-warning-container"
        >
          <TimerOff className="mt-0.5 size-5 shrink-0" aria-hidden />
          <p className="text-label-md">
            This proposal expired on {format(parseISO(plan.backendExpiresAt!), "MMM d, yyyy 'at' p")} — the backend refreshes stale
            proposals automatically; if approval fails, generate a new plan.
          </p>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Left column */}
        <div className="flex min-w-0 flex-col gap-4">
          {/* Summary */}
          <section className="rounded-[24px] bg-card p-5 shadow-xs ring-1 ring-border md:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone={confirmed ? "success" : backendRejected ? "error" : "tertiary"}>
                {confirmed ? "Confirmed" : backendRejected ? "Rejected" : isBackend ? "Pending approval" : "Proposed"}
              </Chip>
              {isBackend && plan.backendId && (
                <Chip tone="outline" title="Backend plan-proposal id — not interchangeable with workflow or goal ids">
                  proposal {plan.backendId}
                </Chip>
              )}
              <span className="text-label-md text-on-surface-variant">
                Generated {format(parseISO(plan.generatedAt), "MMM d, yyyy 'at' p")}
              </span>
            </div>
            <p className="mt-3 text-body-md">{plan.summary}</p>
            {plan.warnings.length > 0 && (
              <ul className="mt-4 space-y-2">
                {plan.warnings.map((w, i) => (
                  <li key={i} className="flex items-start gap-2.5 rounded-2xl bg-warning-container/60 p-3 text-label-md text-on-warning-container">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Tasks */}
          <div className="flex items-center gap-2 px-1">
            <h2 className="text-title-md font-semibold">{confirmed ? "Plan tasks" : "Proposed tasks"}</h2>
            <Chip tone="neutral">{plan.tasks.length}</Chip>
          </div>

          {zeroTasks && (
            <p className="rounded-2xl bg-warning-container/50 p-4 text-label-md text-on-warning-container" role="status">
              {isBackend
                ? "The backend returned a proposal with no tasks — treat this as an empty plan and reject it or generate a new one."
                : "The plan has no tasks yet — add at least one task below before validating or confirming."}
            </p>
          )}

          <ul className="flex flex-col gap-3">
            {plan.tasks.map((t, i) => {
              const k = keyOf(t);
              const isOpen = expanded === k;
              const depTitles = t.dependsOn
                .map((d) => resolveDepKey(plan.tasks, d))
                .map((dk) => (dk ? plan.tasks.find((x) => keyOf(x) === dk)?.title ?? dk : dk))
                .filter((v): v is string => !!v);
              return (
                <li
                  key={k}
                  className={cn(
                    "rounded-[24px] bg-card shadow-xs transition-shadow ring-1",
                    isOpen ? "ring-primary/30 shadow-md" : "ring-border hover:shadow-md"
                  )}
                >
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-[24px] p-4 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40 md:p-5"
                    aria-expanded={isOpen}
                    onClick={() => setExpanded(isOpen ? null : k)}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-container-high text-label-md font-semibold">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-label-lg font-semibold">{t.title}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5">
                        <PriorityChip priority={t.suggestedPriority} />
                        {t.estimateHours != null && (
                          <Chip tone="outline">
                            <Clock className="size-3.5" aria-hidden /> {t.estimateHours}h
                          </Chip>
                        )}
                        {t.dependsOn.length > 0 && (
                          <Chip tone="neutral">
                            <GitBranch className="size-3.5" aria-hidden /> {t.dependsOn.length} dep{t.dependsOn.length > 1 ? "s" : ""}
                          </Chip>
                        )}
                        {t.dueDate && (
                          <Chip tone="outline">
                            <CalendarDays className="size-3.5" aria-hidden /> {format(parseISO(t.dueDate), "MMM d")}
                          </Chip>
                        )}
                      </span>
                    </span>
                    <ChevronDown
                      className={cn("size-5 shrink-0 text-on-surface-variant transition-transform duration-200 ease-m3", isOpen && "rotate-180")}
                      aria-hidden
                    />
                  </button>

                  {isOpen && (
                    <div className="border-t border-border/70 px-4 pb-5 pt-4 md:px-5">
                      <p className="text-body-md text-on-surface-variant">{t.description || "No description yet."}</p>

                      {t.acceptanceCriteria.length > 0 && (
                        <div className="mt-3">
                          <p className="text-label-md font-semibold">Acceptance criteria</p>
                          <ul className="mt-1.5 space-y-1">
                            {t.acceptanceCriteria.map((c, ci) => (
                              <li key={ci} className="flex items-start gap-2 text-label-md">
                                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                                <span>{c}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {t.skills.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {t.skills.map((s) => (
                            <Chip key={s} tone="primary">
                              {s}
                            </Chip>
                          ))}
                        </div>
                      )}

                      {depTitles.length > 0 && (
                        <p className="mt-3 text-label-md text-on-surface-variant">
                          <span className="font-medium text-foreground">Depends on:</span> {depTitles.join(", ")}
                        </p>
                      )}

                      {!confirmed && !isBackend && (
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          <M3Button
                            variant="outlined"
                            size="sm"
                            onClick={() => {
                              setDialogTask(t);
                              setDialogOpen(true);
                            }}
                          >
                            <Pencil className="size-4" aria-hidden /> Edit
                          </M3Button>
                          <M3Button
                            variant="text"
                            size="sm"
                            className="text-error hover:bg-error-container/60"
                            loading={deleting && deleteTarget === t}
                            onClick={() => setDeleteTarget(t)}
                          >
                            <Trash2 className="size-4" aria-hidden /> Delete
                          </M3Button>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {!confirmed && !isBackend && (
            <button
              type="button"
              onClick={() => {
                setDialogTask(null);
                setDialogOpen(true);
              }}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[24px] border border-dashed border-outline-variant bg-surface-container-low/50 px-5 py-4 text-label-lg font-medium text-primary outline-none transition-colors duration-200 ease-m3 hover:bg-secondary/50 focus-visible:ring-[3px] focus-visible:ring-primary/40"
            >
              <Plus className="size-5" aria-hidden /> Add task
            </button>
          )}
        </div>

        {/* Right column — graph */}
        <div className="min-w-0">
          <section className="self-start rounded-[24px] bg-card p-5 shadow-xs ring-1 ring-border lg:sticky lg:top-24 md:p-6">
            <header className="mb-2 flex items-center gap-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-secondary text-primary">
                <Network className="size-[18px]" aria-hidden />
              </span>
              <h2 className="text-title-md font-semibold">Dependency graph</h2>
            </header>
            {zeroTasks ? (
              <p className="py-8 text-center text-label-lg text-on-surface-variant">Add tasks to see the graph.</p>
            ) : (
              <>
                <DepGraph
                  nodes={graph.nodes}
                  edges={graph.edges}
                  height={330}
                  legend={false}
                  onNodeClick={(id) => setExpanded(id)}
                />
                <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-label-sm text-on-surface-variant" aria-label="Graph legend">
                  <li className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full" style={{ background: "var(--tertiary-container)", border: "1px solid var(--tertiary)" }} />
                    Proposed task (tertiary)
                  </li>
                  <li className="flex items-center gap-1.5">
                    <GitBranch className="size-3.5" aria-hidden /> Arrow = “must finish before”
                  </li>
                </ul>
              </>
            )}
          </section>
        </div>
      </div>

      {/* Bottom action bar */}
      {!confirmed && !backendRejected && (
        <div className="sticky bottom-4 z-20">
          <section className="rounded-[24px] bg-card/95 p-4 shadow-lg ring-1 ring-border backdrop-blur md:p-5">
            {!isBackend && issues && issues.length > 0 && (
              <ul className="mb-3 max-h-36 space-y-1.5 overflow-y-auto pr-1 scrollbar-slim">
                {issues.map((iss, i) => (
                  <li
                    key={i}
                    className={cn(
                      "flex items-start gap-2 rounded-2xl p-2.5 text-label-md",
                      iss.severity === "error" ? "bg-error-container/70 text-on-error-container" : "bg-warning-container/60 text-on-warning-container"
                    )}
                  >
                    {iss.severity === "error" ? (
                      <OctagonAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                    ) : (
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                    )}
                    <span className="min-w-0">
                      {iss.taskTitle && <span className="font-medium">{iss.taskTitle}: </span>}
                      {iss.message}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {confirm.isError && (
              <p role="alert" className="mb-3 rounded-2xl bg-error-container/70 p-3 text-label-md text-on-error-container">
                {errMsg(confirm.error, "Could not confirm the plan.")}
              </p>
            )}

            {reject.isError && (
              <p role="alert" className="mb-3 rounded-2xl bg-error-container/70 p-3 text-label-md text-on-error-container">
                {errMsg(reject.error, "Could not reject the proposal.")}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-label-md font-medium">
                  {plan.tasks.length} task{plan.tasks.length === 1 ? "" : "s"} proposed
                </p>
                <p className="text-label-sm text-on-surface-variant">
                  {isBackend
                    ? "The decision is recorded by the Renova API and the proposal is re-read afterwards."
                    : zeroTasks
                      ? "Add at least one task before confirming."
                      : hasErrors
                        ? "Resolve the errors above to continue."
                        : issues
                          ? "No blocking issues found."
                          : "Validate to catch missing criteria or dependency problems."}
                </p>
              </div>
              {isBackend ? (
                <>
                  <M3Button variant="outlined" className="border-outline text-error hover:bg-error-container/40" onClick={() => setRejectOpen(true)} loading={reject.isPending}>
                    <X className="size-[18px]" aria-hidden /> Reject proposal
                  </M3Button>
                  <M3Button onClick={() => setConfirmOpen(true)} loading={confirm.isPending} disabled={zeroTasks}>
                    Approve proposal <CheckCircle2 className="size-[18px]" aria-hidden />
                  </M3Button>
                </>
              ) : (
                <>
                  <M3Button variant="tonal" onClick={runValidate} loading={validate.isPending}>
                    <ListChecks className="size-[18px]" aria-hidden /> Validate plan
                  </M3Button>
                  <M3Button
                    onClick={() => setConfirmOpen(true)}
                    loading={confirm.isPending}
                    disabled={zeroTasks || hasErrors || validate.isPending}
                  >
                    Confirm & continue <ArrowRight className="size-[18px]" aria-hidden />
                  </M3Button>
                </>
              )}
            </div>
          </section>
        </div>
      )}

      {/* Dialogs */}
      <TaskEditDialog
        open={dialogOpen}
        onOpenChange={(v) => {
          setDialogOpen(v);
          if (!v) setDialogTask(null);
        }}
        task={dialogTask}
        siblings={plan.tasks}
        saving={save.isPending}
        onSave={(t) => save.mutate(t, { onSuccess: () => { setDialogOpen(false); setDialogTask(null); } })}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => {
          if (!v) setDeleteTarget(null);
        }}
        title="Remove this task?"
        description={`“${deleteTarget?.title ?? ""}” will be removed from the plan. Dependencies referencing it are cleaned up automatically.`}
        confirmLabel="Delete task"
        destructive
        loading={deleting}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={isBackend ? "Approve this proposal?" : "Confirm this plan?"}
        description={
          isBackend
            ? "The approval is recorded by the Renova API. The proposal state below is re-read from the backend afterwards — nothing is committed locally."
            : "This materializes the proposed tasks into the workflow. You can still adjust assignments at the allocation step."
        }
        confirmLabel={isBackend ? "Approve proposal" : "Confirm plan"}
        loading={confirm.isPending}
        onConfirm={onConfirm}
      />

      <ConfirmDialog
        open={rejectOpen}
        onOpenChange={(v) => {
          setRejectOpen(v);
          if (!v) setRejectNotes("");
        }}
        title="Reject this proposal?"
        description={
          isBackend
            ? "The rejection is recorded by the Renova API and the proposal can no longer be approved. Nothing is committed."
            : "The proposal is discarded and the workflow returns to draft — nothing is committed."
        }
        confirmLabel="Reject proposal"
        destructive
        loading={reject.isPending}
        onConfirm={onReject}
      >
        {isBackend && (
          <div className="mb-4">
            <TextArea
              label="Rejection notes (optional)"
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              placeholder="What should change? The backend records this as the rejection rationale."
              hint="Sent to the backend as ProposalRejectRequest.notes."
              maxLength={4000}
            />
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Task edit / create dialog                                         */
/* ---------------------------------------------------------------- */

function TaskEditDialog({
  open, onOpenChange, task, siblings, saving, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  task: PlanTask | null;
  siblings: PlanTask[];
  saving: boolean;
  onSave: (t: PlanTask) => void;
}) {
  const isNew = !task;
  const selfKey = task ? keyOf(task) : "__new__";

  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [criteria, setCriteria] = React.useState<string[]>([]);
  const [skills, setSkills] = React.useState<string[]>([]);
  const [skillInput, setSkillInput] = React.useState("");
  const [estimate, setEstimate] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");
  const [priority, setPriority] = React.useState<TaskPriority>("medium");
  const [deps, setDeps] = React.useState<string[]>([]);
  const [titleError, setTitleError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
    setCriteria(task?.acceptanceCriteria?.length ? [...task.acceptanceCriteria] : [""]);
    setSkills(task?.skills ? [...task.skills] : []);
    setSkillInput("");
    setEstimate(task?.estimateHours != null ? String(task.estimateHours) : "");
    setDueDate(task?.dueDate ?? "");
    setPriority(task?.suggestedPriority ?? "medium");
    /* Normalize dependsOn refs (ids or titles) to stable keys so checkboxes
       reflect reality even when a referenced task gained an id since. */
    setDeps(task?.dependsOn ? task.dependsOn.map((d) => resolveDepKey(siblings, d) ?? d) : []);
    setTitleError(null);
  }, [open, task, siblings]);

  function addSkill(raw: string) {
    const v = raw.trim().replace(/,+$/, "");
    if (!v) return;
    setSkills((s) => (s.some((x) => x.toLowerCase() === v.toLowerCase()) ? s : [...s, v]));
    setSkillInput("");
  }

  function submit() {
    if (!title.trim()) {
      setTitleError("Give the task a title.");
      return;
    }
    onSave({
      ...(task?.id ? { id: task.id } : {}),
      title: title.trim(),
      description: description.trim(),
      acceptanceCriteria: criteria.map((c) => c.trim()).filter(Boolean),
      skills,
      estimateHours: estimate ? Number(estimate) : undefined,
      dueDate: dueDate || undefined,
      dependsOn: deps,
      suggestedPriority: priority,
    });
  }

  const otherTasks = siblings.filter((t) => keyOf(t) !== selfKey);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-[28px] p-6 scrollbar-slim sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-title-md">{isNew ? "Add task" : "Edit task"}</DialogTitle>
          <DialogDescription className="text-label-md text-on-surface-variant">
            {isNew
              ? "Add a task to the proposal. Dependencies control the order of work."
              : "Adjust the task details. Changes apply to the proposal immediately."}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex flex-col gap-5"
        >
          <TextField
            label="Title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            error={titleError ?? undefined}
            placeholder="e.g. Implement retry handling for reconciliation"
          />

          <TextArea
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does done look like? Scope, approach, constraints…"
          />

          {/* Acceptance criteria */}
          <div>
            <p className="mb-1.5 text-label-md font-medium">Acceptance criteria</p>
            <div className="space-y-2">
              {criteria.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={c}
                    onChange={(e) => setCriteria((cs) => cs.map((x, xi) => (xi === i ? e.target.value : x)))}
                    placeholder={`Criterion ${i + 1}`}
                    aria-label={`Acceptance criterion ${i + 1}`}
                    className={inputCls}
                  />
                  <button
                    type="button"
                    aria-label={`Remove criterion ${i + 1}`}
                    onClick={() => setCriteria((cs) => cs.filter((_, xi) => xi !== i))}
                    className="flex size-11 shrink-0 items-center justify-center rounded-full text-on-surface-variant outline-none transition-colors hover:bg-error-container hover:text-error focus-visible:ring-[3px] focus-visible:ring-primary/40"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </div>
              ))}
            </div>
            <M3Button type="button" variant="text" size="sm" className="mt-1 px-2" onClick={() => setCriteria((cs) => [...cs, ""])}>
              <Plus className="size-4" aria-hidden /> Add criterion
            </M3Button>
          </div>

          {/* Skills */}
          <div>
            <label htmlFor="task-skills-input" className="mb-1.5 block text-label-md font-medium">
              Skills
            </label>
            <input
              id="task-skills-input"
              value={skillInput}
              onChange={(e) => setSkillInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addSkill(skillInput);
                }
              }}
              onBlur={() => addSkill(skillInput)}
              placeholder="Type a skill and press Enter (e.g. Node.js API)"
              className={inputCls}
            />
            {skills.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {skills.map((s) => (
                  <Chip key={s} tone="primary" className="pr-1.5">
                    {s}
                    <button
                      type="button"
                      aria-label={`Remove skill ${s}`}
                      onClick={() => setSkills((arr) => arr.filter((x) => x !== s))}
                      className="flex size-5 items-center justify-center rounded-full outline-none transition-colors hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-primary/40"
                    >
                      <X className="size-3" aria-hidden />
                    </button>
                  </Chip>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              label="Estimate (hours)"
              type="number"
              min={0.5}
              step={0.5}
              value={estimate}
              onChange={(e) => setEstimate(e.target.value)}
              placeholder="e.g. 16"
            />
            <TextField label="Due date (optional)" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>

          {/* Priority */}
          <div>
            <p className="mb-1.5 text-label-md font-medium">Priority</p>
            <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
              <SelectTrigger className="h-12 w-full rounded-xl" aria-label="Suggested priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-2xl">
                {PRIORITY_ORDER.map((p) => (
                  <SelectItem key={p} value={p} className="min-h-11 rounded-full capitalize">
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Dependencies */}
          <div>
            <p className="mb-1.5 text-label-md font-medium">Depends on</p>
            <p className="mb-2 text-label-sm text-on-surface-variant">
              These tasks must finish before this one starts. Choices that would create a cycle are disabled.
            </p>
            {otherTasks.length === 0 ? (
              <p className="rounded-2xl bg-surface-container-low/70 px-3 py-3 text-label-md text-on-surface-variant">
                No other tasks yet — dependencies become available once there is something to depend on.
              </p>
            ) : (
              <ul className="max-h-44 space-y-0.5 overflow-y-auto pr-1 scrollbar-slim">
                {otherTasks.map((o) => {
                  const k = keyOf(o);
                  const cyclic = wouldCreateCycle(siblings, selfKey, k);
                  const checked = deps.includes(k);
                  return (
                    <li key={k}>
                      <TooltipProvider delayDuration={150}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <label
                              className={cn(
                                "flex min-h-11 items-center gap-3 rounded-2xl px-3 outline-none transition-colors",
                                cyclic ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-surface-container-low focus-within:bg-surface-container-low"
                              )}
                            >
                              <Checkbox
                                checked={checked}
                                disabled={cyclic}
                                onCheckedChange={(v) => setDeps((d) => (v ? [...d, k] : d.filter((x) => x !== k)))}
                                aria-label={`Depends on ${o.title}`}
                              />
                              <span className="min-w-0 flex-1 truncate text-label-md">{o.title}</span>
                            </label>
                          </TooltipTrigger>
                          {cyclic && <TooltipContent side="left">Adding this would create a dependency cycle.</TooltipContent>}
                        </Tooltip>
                      </TooltipProvider>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <M3Button type="button" variant="text" onClick={() => onOpenChange(false)}>
              Cancel
            </M3Button>
            <M3Button type="submit" loading={saving}>
              {isNew ? "Add task" : "Save changes"}
            </M3Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
