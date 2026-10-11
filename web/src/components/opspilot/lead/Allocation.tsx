"use client";

/**
 * Team lead — team allocation.
 * Shows per-task recommendations (skill/capacity aware), lets the lead
 * override any assignment, runs a capacity check side panel and confirms.
 * Confirming with unassigned tasks is rejected by the API (422) — the UI
 * prevents it up front and surfaces any server message inline + toast.
 */
import * as React from "react";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock,
  Info,
  Loader2,
  OctagonAlert,
  Users,
} from "lucide-react";
import { navigate } from "@/lib/router";
import {
  useAllocation,
  useConfirmAllocation,
  useExecution,
  useReassignTask,
  useTeam,
  useWorkflow,
} from "@/lib/api/queries";
import type { AllocationRecommendation, TeamMember } from "@/lib/api/types";
import {
  Avatar,
  Chip,
  ConfirmDialog,
  DemoDataBadge,
  EmptyState,
  ErrorState,
  M3Button,
  PageHeader,
  SkeletonCards,
  WorkloadBar,
} from "@/components/opspilot/primitives";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

function errMsg(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export default function AllocationPage({ workflowId }: { workflowId: string }) {
  const allocQ = useAllocation(workflowId);
  const teamQ = useTeam();
  const wfQ = useWorkflow(workflowId);
  const execQ = useExecution(workflowId); // task skills + estimates for display
  const reassign = useReassignTask(workflowId);
  const confirmAlloc = useConfirmAllocation(workflowId);

  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const alloc = allocQ.data ?? null;
  const team = teamQ.data ?? [];
  const confirmed = alloc?.status === "confirmed";

  const taskById = React.useMemo(() => new Map((execQ.data?.tasks ?? []).map((t) => [t.id, t])), [execQ.data]);
  const memberById = React.useMemo(() => new Map(team.map((m) => [m.id, m])), [team]);

  /* Proposed hours per member = sum of estimates of tasks recommended to them (derived) */
  const proposedByMember = React.useMemo(() => {
    const map = new Map<string, number>();
    (alloc?.recommendations ?? []).forEach((r) => {
      if (!r.memberId) return;
      const est = taskById.get(r.taskId)?.estimateHours ?? 0;
      map.set(r.memberId, (map.get(r.memberId) ?? 0) + est);
    });
    return map;
  }, [alloc, taskById]);

  const unassignedCount = alloc?.recommendations.filter((r) => !r.memberId).length ?? 0;
  const riskCount = alloc?.recommendations.filter((r) => !r.feasible).length ?? 0;

  const wfName = wfQ.data?.name;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[
          { label: "Workflows", href: "#/workflows" },
          ...(wfName ? [{ label: wfName, href: `#/workflows/${workflowId}` }] : []),
          { label: "Allocation" },
        ]}
        title="Team allocation"
        description={wfName ? `Assign the materialized tasks of “${wfName}” to your team.` : "Assign tasks to your team."}
        actions={<DemoDataBadge />}
      />

      {allocQ.isLoading ? (
        <SkeletonCards count={3} />
      ) : allocQ.isError ? (
        <ErrorState
          title="Could not load the allocation"
          message={errMsg(allocQ.error, "Try again in a moment.")}
          onRetry={() => allocQ.refetch()}
        />
      ) : !alloc ? null : alloc.recommendations.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nothing to allocate"
          description="This workflow has no tasks yet — confirm a plan first and its tasks will appear here."
          action={<M3Button onClick={() => navigate(`/workflows/${workflowId}/plan`)}>Open plan review</M3Button>}
        />
      ) : (
        <div className="flex flex-col gap-6">
          {/* Banner */}
          {confirmed ? (
            <section
              role="status"
              className="flex flex-col gap-3 rounded-[24px] bg-success-container p-4 text-on-success-container md:flex-row md:items-center md:px-6"
            >
              <CheckCircle2 className="size-5 shrink-0" aria-hidden />
              <p className="min-w-0 flex-1 text-label-lg">
                Allocation confirmed — assignments are live. Team members see these tasks in their workspace.
              </p>
              <M3Button size="sm" className="shrink-0" onClick={() => navigate(`/workflows/${workflowId}`)}>
                Open execution <ArrowRight className="size-4" aria-hidden />
              </M3Button>
            </section>
          ) : (
            <section className="flex flex-wrap items-center gap-3 rounded-[24px] bg-info-container p-4 text-on-info-container md:px-6">
              <Info className="size-5 shrink-0" aria-hidden />
              <p className="min-w-0 flex-1 text-label-lg">
                Recommendations are proposals until you confirm them. Override any assignment — Renova keeps the capacity check
                up to date.
              </p>
            </section>
          )}

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            {/* Recommendations */}
            <div className="flex min-w-0 flex-col gap-4">
              {alloc.recommendations.map((rec, i) => (
                <RecommendationCard
                  key={rec.taskId}
                  rec={rec}
                  index={i}
                  confirmed={confirmed}
                  member={rec.memberId ? memberById.get(rec.memberId) ?? null : null}
                  taskSkills={taskById.get(rec.taskId)?.skills ?? []}
                  estimateHours={taskById.get(rec.taskId)?.estimateHours}
                  dueDate={taskById.get(rec.taskId)?.dueDate}
                  team={team}
                  pendingRow={reassign.isPending && reassign.variables?.taskId === rec.taskId}
                  onReassign={(memberId) => reassign.mutate({ taskId: rec.taskId, memberId })}
                />
              ))}
            </div>

            {/* Capacity check side panel */}
            <aside className="flex min-w-0 flex-col gap-4 self-start lg:sticky lg:top-24">
              <section className="rounded-[24px] bg-card p-5 shadow-xs ring-1 ring-border md:p-6">
                <header className="mb-4 flex items-center gap-2.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-secondary text-primary">
                    <Users className="size-[18px]" aria-hidden />
                  </span>
                  <h2 className="text-title-md font-semibold">Capacity check</h2>
                </header>
                {teamQ.isLoading ? (
                  <div className="space-y-4 py-2" aria-hidden>
                    {[0, 1, 2].map((x) => (
                      <div key={x} className="h-10 animate-pulse rounded-full bg-surface-container-high" />
                    ))}
                  </div>
                ) : (
                  <ul className="space-y-4">
                    {team.map((m) => (
                      <li key={m.id}>
                        <div className="mb-1 flex items-center gap-2">
                          <Avatar name={m.name} accent={m.accent} className="size-7 shrink-0" />
                          <p className="min-w-0 flex-1 truncate text-label-md font-medium">{m.name}</p>
                          {!!proposedByMember.get(m.id) && (
                            <Chip tone="tertiary" className="shrink-0">
                              +{proposedByMember.get(m.id)}h proposed
                            </Chip>
                          )}
                        </div>
                        <WorkloadBar
                          allocated={m.allocatedHours + (proposedByMember.get(m.id) ?? 0)}
                          capacity={m.weeklyCapacityHours}
                          availability={m.availability}
                        />
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-label-sm text-on-surface-variant">
                  Allocated hours include proposed assignments from this plan (derived estimate).
                </p>
              </section>

              {alloc.warnings.length > 0 && (
                <section className="rounded-[24px] bg-warning-container/60 p-5 text-on-warning-container md:p-6">
                  <h3 className="mb-2 flex items-center gap-2 text-title-sm font-semibold">
                    <AlertTriangle className="size-4 shrink-0" aria-hidden /> Plan warnings
                  </h3>
                  <ul className="space-y-2 text-label-md">
                    {alloc.warnings.map((w, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-current" aria-hidden />
                        <span>{w}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </aside>
          </div>

          {/* Confirm bar */}
          {!confirmed && (
            <div className="sticky bottom-4 z-20">
              <section className="rounded-[24px] bg-card/95 p-4 shadow-lg ring-1 ring-border backdrop-blur md:p-5">
                {confirmAlloc.isError && (
                  <p role="alert" className="mb-3 rounded-2xl bg-error-container/70 p-3 text-label-md text-on-error-container">
                    {errMsg(confirmAlloc.error, "Could not confirm the allocation.")}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-label-md font-medium">
                      {alloc.recommendations.length} task{alloc.recommendations.length === 1 ? "" : "s"} to assign
                      {unassignedCount > 0 ? ` · ${unassignedCount} unassigned` : ""}
                    </p>
                    <p className="text-label-sm text-on-surface-variant">
                      {unassignedCount > 0
                        ? `Resolve ${unassignedCount} unassigned task${unassignedCount === 1 ? "" : "s"} first.`
                        : riskCount > 0
                          ? `${riskCount} task${riskCount === 1 ? "" : "s"} flagged with capacity risk — confirm if acceptable.`
                          : "Everyone looks good to go."}
                    </p>
                  </div>
                  <TooltipProvider delayDuration={150}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex">
                          <M3Button
                            disabled={unassignedCount > 0}
                            loading={confirmAlloc.isPending}
                            onClick={() => setConfirmOpen(true)}
                          >
                            Confirm allocation
                          </M3Button>
                        </span>
                      </TooltipTrigger>
                      {unassignedCount > 0 && (
                        <TooltipContent>
                          Resolve {unassignedCount} unassigned task{unassignedCount === 1 ? "" : "s"} first
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </section>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Confirm allocation?"
        description="Assignments become live in the workflow. Team members will immediately see their tasks in their workspace."
        confirmLabel="Confirm allocation"
        loading={confirmAlloc.isPending}
        onConfirm={() =>
          confirmAlloc.mutate(undefined, {
            onSuccess: () => {
              setConfirmOpen(false);
              navigate(`/workflows/${workflowId}`);
            },
            onError: () => setConfirmOpen(false),
          })
        }
      />
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Recommendation card                                               */
/* ---------------------------------------------------------------- */

function RecommendationCard({
  rec, index, confirmed, member, taskSkills, estimateHours, dueDate, team, pendingRow, onReassign,
}: {
  rec: AllocationRecommendation;
  index: number;
  confirmed: boolean;
  member: TeamMember | null;
  taskSkills: string[];
  estimateHours?: number;
  dueDate?: string;
  team: TeamMember[];
  pendingRow: boolean;
  onReassign: (memberId: string | null) => void;
}) {
  const engineRecommended = rec.confidence > 0 && rec.confidence < 1;

  return (
    <article
      className={cn(
        "rounded-[24px] bg-card p-5 shadow-xs md:p-6",
        confirmed ? "ring-1 ring-primary/30" : "border border-dashed border-outline-variant"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-label-sm text-on-surface-variant">Task {index + 1}</p>
          <h3 className="mt-0.5 text-label-lg font-semibold">{rec.taskTitle}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {taskSkills.map((s) => (
              <Chip key={s} tone="primary">
                {s}
              </Chip>
            ))}
            {estimateHours != null && (
              <Chip tone="outline">
                <Clock className="size-3.5" aria-hidden /> {estimateHours}h
              </Chip>
            )}
            {dueDate && differenceInCalendarDays(parseISO(dueDate), new Date()) <= 7 && (
              <Chip tone="outline">
                <CalendarDays className="size-3.5" aria-hidden /> {format(parseISO(dueDate), "MMM d")}
              </Chip>
            )}
          </div>
        </div>
        {pendingRow && <Loader2 className="size-5 shrink-0 animate-spin text-primary" aria-label="Updating assignment" />}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        {member ? (
          <>
            <Avatar name={member.name} accent={member.accent} className="size-9 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-label-md font-semibold">{member.name}</p>
              <p className="max-w-xl text-label-sm text-on-surface-variant">{rec.reason}</p>
            </div>
          </>
        ) : (
          <div className="min-w-0 flex-1">
            <Chip tone="error">
              <OctagonAlert className="size-3.5" aria-hidden /> Unassigned
            </Chip>
            <p className="mt-1 max-w-xl text-label-sm text-on-surface-variant">{rec.reason}</p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          {engineRecommended && <Chip tone="primary">{Math.round(rec.confidence * 100)}% match</Chip>}
          {engineRecommended && <Chip tone="outline">Recommended</Chip>}
          {!rec.feasible && (
            <Chip tone="warning">
              <AlertTriangle className="size-3.5" aria-hidden /> Capacity risk
            </Chip>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Select
          value={rec.memberId ?? "none"}
          onValueChange={(v) => onReassign(v === "none" ? null : v)}
          disabled={confirmed}
        >
          <SelectTrigger
            className="h-11 w-full max-w-xs rounded-full bg-surface-container-low/60 px-4 text-label-md sm:w-80"
            aria-label={`Assignee for ${rec.taskTitle}`}
          >
            <SelectValue placeholder="Choose assignee" />
          </SelectTrigger>
          <SelectContent className="rounded-2xl">
            <SelectItem value="none" className="min-h-11 rounded-full">
              Unassigned
            </SelectItem>
            {team.map((m) => (
              <SelectItem key={m.id} value={m.id} className="min-h-11 rounded-full">
                {m.name} · {m.skills[0]?.name ?? "Generalist"}
                {m.availability < 1 ? ` (${Math.round(m.availability * 100)}%)` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-label-sm text-on-surface-variant">Override the recommendation if needed.</span>
      </div>
    </article>
  );
}
