"use client";

/**
 * Employee dashboard — "My Workspace" (route /my-workspace, role: employee).
 *
 * Everything on this page is DERIVED from live hook data (useMyTasks,
 * useSession, useApprovedChanges via the shared ApprovedChangesCard).
 * Nothing is fabricated: stats, focus list, deadlines and the progress ring
 * all come from the tasks actually assigned to the signed-in user.
 */
import * as React from "react";
import { MotionConfig, motion } from "framer-motion";
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  CircleDot,
  Clock,
  ListChecks,
  OctagonAlert,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { navigate } from "@/lib/router";
import { addDays, format, isPast, isToday, isTomorrow, isWithinInterval, parseISO, startOfToday } from "date-fns";
import { useMyTasks, useSession } from "@/lib/api/queries";
import { ApiError, type Task, type TaskPriority, type TaskStatus } from "@/lib/api/types";
import {
  Chip,
  DemoDataBadge,
  EmptyState,
  ErrorState,
  M3Button,
  PageHeader,
  PriorityChip,
  ProgressRing,
  SkeletonCards,
  StatCard,
  TaskStatusChip,
} from "../primitives";
import { ApprovedChangesCard } from "../shared/ApprovedChangesCard";

const EASE_M3: [number, number, number, number] = [0.05, 0.7, 0.1, 1];

type MyTask = Task & {
  workflowName: string;
  prerequisiteTitles: string[];
  dependentTitles: string[];
};

const PRIORITY_WEIGHT: Record<TaskPriority, number> = { critical: 4, high: 3, medium: 2, low: 1 };
const ACTIVE_STATUSES: TaskStatus[] = ["todo", "in_progress", "in_review"];

function errMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/* ------------------------------------------------------------------ */
/* Date helpers (all honest — derived from the task's own dueDate)      */
/* ------------------------------------------------------------------ */

/** True when the due date falls between today and 7 days from now (inclusive). */
function isDueWithinWeek(dueDate: string): boolean {
  const d = parseISO(dueDate);
  const start = startOfToday();
  return isWithinInterval(d, { start, end: addDays(start, 7) });
}

/** True when the task should appear under "Upcoming deadlines" (overdue or due within 7 days). */
function isDeadlineRelevant(dueDate: string, status: TaskStatus): boolean {
  if (status === "done") return false;
  const d = parseISO(dueDate);
  return isPast(d) || isDueWithinWeek(dueDate);
}

/** Same tone rules as the My Tasks due chip: overdue=error, today/tomorrow=warning, else neutral. */
function DueChip({ dueDate, status }: { dueDate?: string; status: TaskStatus }) {
  if (!dueDate) return null;
  const d = parseISO(dueDate);
  const day = format(d, "EEE, MMM d");
  if (status !== "done" && isPast(d) && !isToday(d)) {
    return (
      <Chip tone="error">
        <Calendar className="size-3.5" aria-hidden /> Overdue · {day}
      </Chip>
    );
  }
  if (status !== "done" && isToday(d)) {
    return (
      <Chip tone="warning">
        <Calendar className="size-3.5" aria-hidden /> Due today
      </Chip>
    );
  }
  if (status !== "done" && isTomorrow(d)) {
    return (
      <Chip tone="warning">
        <Calendar className="size-3.5" aria-hidden /> Due tomorrow
      </Chip>
    );
  }
  return (
    <Chip tone="neutral">
      <Calendar className="size-3.5" aria-hidden /> {day}
    </Chip>
  );
}

/* ------------------------------------------------------------------ */
/* Compact focus card (local variant of the My Tasks card pattern)      */
/* ------------------------------------------------------------------ */

function FocusTaskCard({ task, index }: { task: MyTask; index: number }) {
  const skillCount = task.skills.length;
  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.05, 0.15), ease: EASE_M3 }}
      className="h-full"
    >
      <a
        href={`#/tasks/${task.id}`}
        className="group flex h-full flex-col rounded-[24px] bg-card p-5 shadow-xs ring-1 ring-border outline-none transition-all duration-200 ease-m3 hover:-translate-y-0.5 hover:shadow-md hover:ring-primary/30 focus-visible:ring-[3px] focus-visible:ring-primary/40 active:scale-[0.99]"
      >
        <div className="mb-2.5 flex flex-wrap items-center gap-2">
          <Chip tone="neutral" className="min-w-0 max-w-[12rem]">
            <span className="truncate">{task.workflowName}</span>
          </Chip>
          <span className="ml-auto">
            <TaskStatusChip status={task.status} />
          </span>
        </div>

        <h3 className="text-title-sm font-semibold leading-snug transition-colors duration-200 ease-m3 group-hover:text-primary">
          {task.title}
        </h3>

        <div className="mb-3 mt-3 flex flex-wrap items-center gap-1.5">
          <PriorityChip priority={task.priority} />
          <DueChip dueDate={task.dueDate} status={task.status} />
          {typeof task.estimateHours === "number" && (
            <Chip tone="outline">
              <Clock className="size-3.5" aria-hidden /> {task.estimateHours} h
            </Chip>
          )}
        </div>

        {skillCount > 0 && (
          <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-3">
            {task.skills.slice(0, 3).map((s) => (
              <Chip key={s} tone="neutral" className="px-2.5 py-0.5 text-[11px]">
                {s}
              </Chip>
            ))}
            {skillCount > 3 && (
              <Chip tone="outline" className="px-2.5 py-0.5 text-[11px]">
                +{skillCount - 3} more
              </Chip>
            )}
          </div>
        )}
      </a>
    </motion.li>
  );
}

/* ------------------------------------------------------------------ */
/* Blocked task card                                                    */
/* ------------------------------------------------------------------ */

function BlockedTaskCard({ task, index }: { task: MyTask; index: number }) {
  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.05, 0.15), ease: EASE_M3 }}
    >
      <a
        href={`#/tasks/${task.id}`}
        className="group flex flex-col gap-2 rounded-[24px] bg-error-container/40 p-5 ring-1 ring-error/30 outline-none transition-all duration-200 ease-m3 hover:shadow-md hover:ring-error/50 focus-visible:ring-[3px] focus-visible:ring-primary/40 active:scale-[0.99]"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-error-container text-on-error-container">
            <OctagonAlert className="size-5" aria-hidden />
          </span>
          <TaskStatusChip status="blocked" className="animate-pulse-soft" />
          <span className="ml-auto">
            <PriorityChip priority={task.priority} />
          </span>
        </div>
        <h3 className="text-title-md font-semibold leading-snug">{task.title}</h3>
        <p className="text-label-md text-on-surface-variant">{task.workflowName}</p>
        <span className="mt-1 inline-flex min-h-11 items-center gap-1 text-label-md font-medium text-primary">
          Review task
          <ArrowRight className="size-4 transition-transform duration-200 ease-m3 group-hover:translate-x-0.5" aria-hidden />
        </span>
      </a>
    </motion.li>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */

export default function MyWorkspacePage() {
  const { data: tasks, isLoading: tasksLoading, isError, error, refetch } = useMyTasks();
  const { data: session } = useSession();

  const firstName = session?.user.name.split(" ")[0] ?? "there";
  const workspaceName = session?.workspace.name ?? "your workspace";

  const list = React.useMemo(() => tasks ?? [], [tasks]);

  const stats = React.useMemo(() => {
    const inProgress = list.filter((t) => t.status === "in_progress").length;
    const blocked = list.filter((t) => t.status === "blocked").length;
    const dueSoon = list.filter((t) => t.status !== "done" && t.dueDate && isDueWithinWeek(t.dueDate)).length;
    const done = list.filter((t) => t.status === "done").length;
    return { inProgress, blocked, dueSoon, done };
  }, [list]);

  const focusTasks = React.useMemo(() => {
    return list
      .filter((t) => ACTIVE_STATUSES.includes(t.status))
      .slice()
      .sort((a, b) => {
        const da = a.dueDate ? parseISO(a.dueDate).getTime() : Infinity;
        const db = b.dueDate ? parseISO(b.dueDate).getTime() : Infinity;
        if (da !== db) return da - db;
        return PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
      })
      .slice(0, 3);
  }, [list]);

  const blockedTasks = React.useMemo(() => list.filter((t) => t.status === "blocked"), [list]);

  const deadlines = React.useMemo(() => {
    return list
      .filter((t) => t.dueDate && isDeadlineRelevant(t.dueDate, t.status))
      .slice()
      .sort((a, b) => (parseISO(a.dueDate!).getTime() || 0) - (parseISO(b.dueDate!).getTime() || 0));
  }, [list]);

  const doneCount = stats.done;
  const totalCount = list.length;
  const progressPct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  /* ---------------- Loading / error ---------------- */

  if (tasksLoading) {
    return (
      <MotionConfig reducedMotion="user">
        <div>
          <PageHeader
            title="My Workspace"
            description={`Hi ${firstName} — getting your dashboard ready…`}
            actions={<DemoDataBadge />}
          />
          <div aria-busy="true">
            <SkeletonCards count={4} />
          </div>
        </div>
      </MotionConfig>
    );
  }

  if (isError) {
    return (
      <MotionConfig reducedMotion="user">
        <div>
          <PageHeader
            title="My Workspace"
            description={`Hi ${firstName} — your dashboard couldn't be loaded.`}
            actions={<DemoDataBadge />}
          />
          <ErrorState
            title="Couldn't load your workspace"
            message={errMessage(error)}
            onRetry={() => refetch()}
          />
        </div>
      </MotionConfig>
    );
  }

  /* ---------------- Content ---------------- */

  return (
    <MotionConfig reducedMotion="user">
      <div>
        <PageHeader
          title="My Workspace"
          description={`Hi ${firstName} — here's what's happening in ${workspaceName}.`}
          actions={<DemoDataBadge />}
        />

        {/* Summary row */}
        <motion.section
          aria-label="This week at a glance"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: EASE_M3 }}
          className="mb-8"
        >
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="In progress"
              value={stats.inProgress}
              sub="tasks you're actively working"
              icon={CircleDot}
              tone="primary"
              href="#/tasks"
            />
            <StatCard
              label="Blocked"
              value={stats.blocked}
              sub={stats.blocked > 0 ? "needs your attention" : "nothing is blocked"}
              icon={OctagonAlert}
              tone={stats.blocked > 0 ? "error" : "primary"}
              href="#/tasks"
            />
            <StatCard
              label="Due this week"
              value={stats.dueSoon}
              sub="in the next 7 days"
              icon={Calendar}
              tone={stats.dueSoon > 0 ? "warning" : "primary"}
              href="#/tasks"
            />
            <StatCard
              label="Completed"
              value={stats.done}
              sub="across all your workflows"
              icon={CheckCircle2}
              tone="success"
              href="#/tasks"
            />
          </div>
        </motion.section>

        {totalCount === 0 ? (
          <section aria-label="Assigned tasks">
            <EmptyState
              icon={ListChecks}
              title="No tasks assigned yet"
              description="Once your team lead allocates work to you, it will appear here with deadlines, priorities and a progress overview. Approved assignment changes land here automatically."
              action={
                <M3Button variant="tonal" onClick={() => refetch()}>
                  Refresh
                </M3Button>
              }
            />
          </section>
        ) : (
          <>
            {/* Focus now */}
            <motion.section
              aria-label="Focus now"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.05, ease: EASE_M3 }}
              className="mb-8"
            >
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="text-title-md font-semibold">Focus now</h2>
                <p className="text-label-sm text-on-surface-variant">Top 3 by due date, then priority</p>
              </div>
              {focusTasks.length === 0 ? (
                <EmptyState
                  icon={ListChecks}
                  title="Nothing active right now"
                  description="Your remaining tasks are either blocked or already done. Blocked work is listed below; the rest shows under Completed."
                  className="py-10"
                />
              ) : (
                <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {focusTasks.map((task, i) => (
                    <FocusTaskCard key={task.id} task={task} index={i} />
                  ))}
                </ul>
              )}
            </motion.section>

            {/* Blocked tasks */}
            {blockedTasks.length > 0 && (
              <motion.section
                aria-label="Blocked tasks"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.1, ease: EASE_M3 }}
                className="mb-8"
              >
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  <h2 className="text-title-md font-semibold">
                    Blocked{" "}
                    <span className="ml-1 inline-flex min-w-6 items-center justify-center rounded-full bg-error px-2 py-0.5 text-label-sm font-bold text-white align-middle">
                      {blockedTasks.length}
                    </span>
                  </h2>
                </div>
                <ul className="grid gap-4 sm:grid-cols-2">
                  {blockedTasks.map((task, i) => (
                    <BlockedTaskCard key={task.id} task={task} index={i} />
                  ))}
                </ul>
                <p className="mt-3 text-label-sm text-on-surface-variant">
                  Blocker details live on the task page — open a task to review or update the details. Reporting details
                  to your lead happens there too.
                </p>
              </motion.section>
            )}

            {/* Deadlines + progress */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.15, ease: EASE_M3 }}
              className="mb-8 grid gap-4 lg:grid-cols-3"
            >
              <section aria-label="Upcoming deadlines" className="lg:col-span-2">
                <div className="flex h-full flex-col rounded-[24px] bg-card p-5 shadow-xs ring-1 ring-border">
                  <div className="mb-1 flex items-center gap-2.5">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-warning-container text-on-warning-container">
                      <Calendar className="size-5" aria-hidden />
                    </span>
                    <div>
                      <h2 className="text-title-md font-semibold">Upcoming deadlines</h2>
                      <p className="text-label-sm text-on-surface-variant">Next 7 days — plus anything overdue</p>
                    </div>
                  </div>

                  {deadlines.length === 0 ? (
                    <p className="flex flex-1 items-center justify-center py-8 text-center text-label-lg text-on-surface-variant">
                      Nothing due in the next 7 days, and nothing overdue.
                    </p>
                  ) : (
                    <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto pr-1 scrollbar-slim">
                      {deadlines.map((task) => (
                        <li key={task.id}>
                          <a
                            href={`#/tasks/${task.id}`}
                            className="flex min-h-11 items-center gap-3 rounded-2xl px-2 py-2 outline-none transition-colors duration-200 ease-m3 hover:bg-surface-container-high focus-visible:ring-[3px] focus-visible:ring-primary/40"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-label-md font-medium">{task.title}</span>
                              <span className="block truncate text-label-sm text-on-surface-variant">
                                {task.workflowName}
                              </span>
                            </span>
                            <span className="shrink-0">
                              <DueChip dueDate={task.dueDate} status={task.status} />
                            </span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>

              <section aria-label="Task progress">
                <div className="flex h-full flex-col items-center justify-center rounded-[24px] bg-card p-5 text-center shadow-xs ring-1 ring-border">
                  <h2 className="self-start text-title-md font-semibold">Progress</h2>
                  <div className="flex flex-1 flex-col items-center justify-center gap-3 py-4">
                    <ProgressRing value={progressPct} size={88} stroke={8} />
                    <p className="text-label-lg font-medium">
                      {doneCount} of {totalCount} task{totalCount !== 1 ? "s" : ""} done
                    </p>
                    <p className="text-label-sm text-on-surface-variant">Across all workflows assigned to you</p>
                  </div>
                </div>
              </section>
            </motion.div>
          </>
        )}

        {/* AI Work Assistant CTA */}
        <motion.section
          aria-label="AI Work Assistant"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2, ease: EASE_M3 }}
          className={cn(totalCount === 0 && "mt-6")}
        >
          <div className="flex flex-col gap-4 rounded-[24px] bg-secondary-container/70 p-5 text-on-secondary-container ring-1 ring-secondary/40 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="flex items-start gap-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                <Sparkles className="size-6" aria-hidden />
              </span>
              <div>
                <h2 className="text-title-md font-semibold">Meet your AI Work Assistant</h2>
                <p className="mt-1 max-w-xl text-label-lg">
                  Break down work, draft docs, prep test cases — grounded in the task you pick. Everything it writes is a
                  draft for you to review.
                </p>
              </div>
            </div>
            <M3Button onClick={() => navigate("/assistant")} className="shrink-0 self-start sm:self-center">
              <Sparkles className="size-[18px]" aria-hidden /> Open AI Assistant
            </M3Button>
          </div>
        </motion.section>

        <ApprovedChangesCard className="mt-6" />
      </div>
    </MotionConfig>
  );
}
