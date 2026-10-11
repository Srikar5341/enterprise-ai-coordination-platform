"use client";

/**
 * Team lead overview — workspace dashboard.
 *
 * Every number is derived from data fetched through the API hooks; where a
 * number is only a partial view (e.g. tasks in progress taken from the
 * primary active workflow only) the label says so explicitly.
 */
import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { differenceInCalendarDays, format, formatDistanceToNow, parseISO } from "date-fns";
import {
  Activity as ActivityIcon,
  CalendarClock,
  CheckCircle2,
  Clock,
  ListChecks,
  OctagonAlert,
  Plus,
  Stamp,
  Users,
  Workflow as WorkflowIcon,
} from "lucide-react";
import { navigate } from "@/lib/router";
import { useAudit, useExecution, useRecoveryCases, useSession, useTeam, useWorkflows } from "@/lib/api/queries";
import {
  Avatar,
  Chip,
  DemoDataBadge,
  EmptyState,
  ErrorState,
  M3Button,
  PageHeader,
  SkeletonCards,
  SkeletonTable,
  StatCard,
  WorkloadBar,
} from "@/components/opspilot/primitives";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------- */
/* Local helpers                                                     */
/* ---------------------------------------------------------------- */

function FadeUp({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 14 }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-24px" }}
      transition={{ duration: 0.35, delay, ease: [0.2, 0, 0, 1] }}
    >
      {children}
    </motion.div>
  );
}

function PanelCard({
  title, icon: Icon, count, action, children, className,
}: {
  title: string; icon: React.ElementType; count?: number; action?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={cn("flex h-full flex-col rounded-[24px] bg-card p-5 shadow-xs ring-1 ring-border md:p-6", className)}>
      <header className="mb-4 flex items-center gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-secondary text-primary">
          <Icon className="size-[18px]" aria-hidden />
        </span>
        <h2 className="min-w-0 flex-1 truncate text-title-md font-semibold">{title}</h2>
        {typeof count === "number" && <Chip tone="neutral" className="shrink-0">{count}</Chip>}
        {action}
      </header>
      {children}
    </section>
  );
}

const ACTIVITY_ICON = { success: CheckCircle2, failure: OctagonAlert, pending: Clock } as const;
const ACTIVITY_TONE = { success: "text-success", failure: "text-error", pending: "text-warning" } as const;

/* ---------------------------------------------------------------- */
/* Page                                                              */
/* ---------------------------------------------------------------- */

export default function OverviewPage() {
  const workflowsQ = useWorkflows();
  const teamQ = useTeam();
  const casesQ = useRecoveryCases();
  const auditQ = useAudit();
  const sessionQ = useSession();

  const workflowsData = workflowsQ.data;
  const workflows = workflowsData ?? [];
  const primary = workflows.find((w) => w.status === "active") ?? workflows.find((w) => w.status === "allocated") ?? null;
  const execData = useExecution(primary?.id ?? "").data;

  const activeCount = workflows.filter((w) => w.status === "active").length;
  const inProgressCount = execData?.tasks.filter((t) => t.status === "in_progress").length ?? 0;
  const approvalsCount = (casesQ.data ?? []).filter((c) => c.status === "needs_decision").length;

  const blockedCount = React.useMemo(() => {
    const ids = new Set<string>();
    (casesQ.data ?? []).forEach((c) => {
      if (c.status !== "closed") ids.add(c.blocker.id);
    });
    (execData?.blockers ?? []).forEach((b) => {
      if (b.status !== "resolved") ids.add(b.id);
    });
    return ids.size;
  }, [casesQ.data, execData]);

  const deadlines = React.useMemo(() => {
    const now = new Date();
    const items: { key: string; title: string; sub: string; at: string; tone: "error" | "warning" | "neutral"; label: string }[] = [];
    const push = (key: string, title: string, sub: string, at: string) => {
      const d = differenceInCalendarDays(parseISO(at), now);
      if (d > 7) return;
      items.push({
        key,
        title,
        sub,
        at,
        tone: d < 0 ? "error" : d <= 2 ? "warning" : "neutral",
        label: d < 0 ? `Overdue · ${format(parseISO(at), "MMM d")}` : d === 0 ? "Today" : d === 1 ? "Tomorrow" : format(parseISO(at), "MMM d"),
      });
    };
    (workflowsData ?? []).forEach((w) => {
      if (w.status === "completed" || w.status === "cancelled") return;
      push(`wf-${w.id}`, w.name, "Workflow target date", w.targetDate);
    });
    if (execData) {
      execData.tasks.forEach((t) => {
        if (!t.dueDate || t.status === "done") return;
        push(`t-${t.id}`, t.title, `${execData.workflow.name} · task`, t.dueDate);
      });
    }
    return items.sort((a, b) => a.at.localeCompare(b.at));
  }, [workflowsData, execData]);

  const activity = (auditQ.data ?? []).slice(0, 8);

  if (workflowsQ.isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Overview" description="Workspace health, deadlines and workload." />
        <SkeletonCards count={4} className="sm:grid-cols-2 xl:grid-cols-4" />
        <SkeletonTable rows={3} cols={3} />
      </div>
    );
  }

  if (workflowsQ.isError) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Overview" />
        <ErrorState
          title="Could not load your workspace"
          message="The workflow list failed to load. Check your connection and retry."
          onRetry={() => workflowsQ.refetch()}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            Overview <DemoDataBadge />
          </span>
        }
        description={`Workspace health, deadlines and workload for ${sessionQ.data?.workspace.name ?? "your workspace"}.`}
        actions={
          <M3Button onClick={() => navigate("/workflows/new")}>
            <Plus className="size-[18px]" aria-hidden /> Create workflow
          </M3Button>
        }
      />

      {workflows.length === 0 ? (
        <EmptyState
          icon={WorkflowIcon}
          title="No workflows yet"
          description="Create your first workflow and Renova will help you plan, allocate and run it."
          action={
            <M3Button onClick={() => navigate("/workflows/new")}>
              <Plus className="size-[18px]" aria-hidden /> Create workflow
            </M3Button>
          }
        />
      ) : (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <FadeUp>
              <StatCard
                label="Active workflows"
                value={activeCount}
                sub={`${workflows.length} total in workspace`}
                icon={WorkflowIcon}
                href="#/workflows"
              />
            </FadeUp>
            <FadeUp delay={0.05}>
              <StatCard
                label="Tasks in progress"
                value={inProgressCount}
                sub={primary ? `from “${primary.name}”` : "no active workflow yet"}
                icon={ListChecks}
                tone="info"
                href="#/workflows"
              />
            </FadeUp>
            <FadeUp delay={0.1}>
              <StatCard
                label="Blocked tasks"
                value={blockedCount}
                sub="open blockers · workspace-wide"
                icon={OctagonAlert}
                tone={blockedCount > 0 ? "error" : "success"}
                href="#/recovery"
              />
            </FadeUp>
            <FadeUp delay={0.15}>
              <StatCard
                label="Approvals needing attention"
                value={approvalsCount}
                sub="recovery decisions pending"
                icon={Stamp}
                tone={approvalsCount > 0 ? "warning" : "success"}
                href="#/approvals"
              />
            </FadeUp>
          </div>

          {/* Secondary row */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <FadeUp className="min-w-0">
              <PanelCard title="Upcoming deadlines" icon={CalendarClock} count={deadlines.length}>
                {deadlines.length === 0 ? (
                  <p className="py-6 text-center text-label-lg text-on-surface-variant">Nothing due in the next 7 days.</p>
                ) : (
                  <ul className="max-h-72 space-y-1 overflow-y-auto pr-1 scrollbar-slim">
                    {deadlines.map((d) => (
                      <li key={d.key} className="flex items-center gap-3 rounded-2xl px-2 py-2 transition-colors hover:bg-surface-container-low">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-label-md font-medium">{d.title}</p>
                          <p className="truncate text-label-sm text-on-surface-variant">{d.sub}</p>
                        </div>
                        <Chip tone={d.tone} className="shrink-0">
                          <Clock className="size-3.5" aria-hidden /> {d.label}
                        </Chip>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-label-sm text-on-surface-variant">
                  Workflow target dates plus tasks of the primary active workflow, due within 7 days.
                </p>
              </PanelCard>
            </FadeUp>

            <FadeUp delay={0.05} className="min-w-0">
              <PanelCard title="Team workload" icon={Users}>
                {teamQ.isLoading ? (
                  <div className="space-y-4 py-2" aria-hidden>
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="h-10 animate-pulse rounded-full bg-surface-container-high" style={{ animationDelay: `${i * 90}ms` }} />
                    ))}
                  </div>
                ) : teamQ.isError ? (
                  <ErrorState title="Team failed to load" onRetry={() => teamQ.refetch()} />
                ) : (
                  <>
                    <ul className="max-h-80 space-y-4 overflow-y-auto pr-1 scrollbar-slim">
                      {(teamQ.data ?? []).map((m) => (
                        <li key={m.id} className="flex items-center gap-3">
                          <Avatar name={m.name} accent={m.accent} className="shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="mb-1 truncate text-label-md font-medium">
                              {m.name}
                              {m.availability < 1 && (
                                <span className="font-normal text-on-surface-variant"> · {Math.round(m.availability * 100)}% availability</span>
                              )}
                            </p>
                            <WorkloadBar allocated={m.allocatedHours} capacity={m.weeklyCapacityHours} availability={m.availability} />
                          </div>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 text-label-sm text-on-surface-variant">Allocated vs weekly capacity, adjusted for availability.</p>
                  </>
                )}
              </PanelCard>
            </FadeUp>

            <FadeUp delay={0.1} className="min-w-0">
              <PanelCard
                title="Recent activity"
                icon={ActivityIcon}
                action={
                  <a href="#/audit" className="shrink-0 text-label-md font-medium text-primary underline-offset-4 hover:underline">
                    View all
                  </a>
                }
              >
                {auditQ.isLoading ? (
                  <div className="space-y-3 py-2" aria-hidden>
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} className="h-4 animate-pulse rounded-full bg-surface-container-high" style={{ animationDelay: `${i * 80}ms` }} />
                    ))}
                  </div>
                ) : auditQ.isError ? (
                  <ErrorState title="Activity failed to load" onRetry={() => auditQ.refetch()} />
                ) : activity.length === 0 ? (
                  <p className="py-6 text-center text-label-lg text-on-surface-variant">No activity recorded yet.</p>
                ) : (
                  <ul className="max-h-80 space-y-1 overflow-y-auto pr-1 scrollbar-slim">
                    {activity.map((e) => {
                      const Icon = ACTIVITY_ICON[e.outcome];
                      return (
                        <li key={e.id} className="flex items-start gap-2.5 rounded-2xl px-2 py-2 transition-colors hover:bg-surface-container-low">
                          <Icon className={cn("mt-0.5 size-4 shrink-0", ACTIVITY_TONE[e.outcome])} aria-hidden />
                          <div className="min-w-0 flex-1">
                            <p className="text-label-md">
                              <span className="font-medium">{e.actorName}</span>{" "}
                              <span className="text-on-surface-variant">{e.action.replace(/[._]/g, " ")}</span>
                              {e.target ? <span className="font-medium"> · {e.target}</span> : null}
                            </p>
                            {e.details && <p className="truncate text-label-sm text-on-surface-variant">{e.details}</p>}
                          </div>
                          <time dateTime={e.at} className="shrink-0 text-label-sm text-on-surface-variant">
                            {formatDistanceToNow(parseISO(e.at), { addSuffix: true })}
                          </time>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </PanelCard>
            </FadeUp>
          </div>
        </>
      )}
    </div>
  );
}
