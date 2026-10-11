"use client";

/**
 * Employee workspace — "My Tasks".
 * Renders inside the AppShell (no sidebar/nav of its own): status filter
 * chips, task cards with rich meta, and a collapsible "Approved changes"
 * strip fed by useApprovedChanges().
 */
import * as React from "react";
import { MotionConfig, motion } from "framer-motion";
import {
  Calendar,
  Clock,
  GitBranch,
  Link2,
  ListChecks,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, isPast, isToday, isTomorrow, parseISO } from "date-fns";
import { useMyTasks } from "@/lib/api/queries";
import { ApiError, type Task, type TaskStatus } from "@/lib/api/types";
import {
  Chip,
  EmptyState,
  ErrorState,
  M3Button,
  PageHeader,
  PriorityChip,
  SkeletonCards,
  TaskStatusChip,
} from "../primitives";
import { ApprovedChangesCard } from "../shared/ApprovedChangesCard";

const EASE_M3: [number, number, number, number] = [0.05, 0.7, 0.1, 1];

type MyTask = Task & {
  workflowName: string;
  prerequisiteTitles: string[];
  dependentTitles: string[];
};

function errMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/* ------------------------------------------------------------------ */
/* Filters                                                             */
/* ------------------------------------------------------------------ */

const FILTERS: { value: "all" | TaskStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "blocked", label: "Blocked" },
  { value: "in_review", label: "In review" },
  { value: "done", label: "Done" },
];

function FilterChips({ value, onChange }: { value: "all" | TaskStatus; onChange: (v: "all" | TaskStatus) => void }) {
  return (
    <div role="group" aria-label="Filter tasks by status" className="flex flex-wrap items-center gap-2">
      {FILTERS.map((f) => {
        const active = value === f.value;
        return (
          <button
            key={f.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(f.value)}
            className="rounded-full outline-none transition-transform duration-200 ease-m3 focus-visible:ring-[3px] focus-visible:ring-primary/40 active:scale-95"
          >
            <Chip
              tone={active ? "primary" : "outline"}
              className={cn("cursor-pointer transition-colors duration-200 ease-m3", active && "font-semibold shadow-xs")}
            >
              {f.label}
            </Chip>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Due date                                                            */
/* ------------------------------------------------------------------ */

function DueChip({ dueDate, status }: { dueDate?: string; status: TaskStatus }) {
  if (!dueDate) return null;
  const d = parseISO(dueDate);
  const day = format(d, "EEE, MMM d");
  if (status === "done") {
    return (
      <Chip tone="neutral">
        <Calendar className="size-3.5" aria-hidden /> {day}
      </Chip>
    );
  }
  if (isToday(d)) {
    return (
      <Chip tone="warning">
        <Calendar className="size-3.5" aria-hidden /> Due today
      </Chip>
    );
  }
  if (isTomorrow(d)) {
    return (
      <Chip tone="warning">
        <Calendar className="size-3.5" aria-hidden /> Due tomorrow
      </Chip>
    );
  }
  if (isPast(d)) {
    return (
      <Chip tone="error">
        <Calendar className="size-3.5" aria-hidden /> Overdue · {day}
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
/* Task card                                                           */
/* ------------------------------------------------------------------ */

function TaskCard({ task, index }: { task: MyTask; index: number }) {
  const blocked = task.status === "blocked";
  const prereqCount = task.prerequisiteTitles.length;
  const depCount = task.dependentTitles.length;
  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.04, 0.2), ease: EASE_M3 }}
      className="h-full"
    >
      <a
        href={`#/tasks/${task.id}`}
        className={cn(
          "group flex h-full flex-col rounded-[24px] bg-card p-5 shadow-xs ring-1 ring-border outline-none transition-all duration-200 ease-m3",
          "hover:-translate-y-0.5 hover:shadow-md hover:ring-primary/30 focus-visible:ring-[3px] focus-visible:ring-primary/40 active:scale-[0.99]",
          blocked && "bg-error-container/30 ring-error/25"
        )}
      >
        <div className="mb-2.5 flex flex-wrap items-center gap-2">
          <Chip tone="neutral" className="min-w-0 max-w-[13rem]">
            <span className="truncate">{task.workflowName}</span>
          </Chip>
          <span className="ml-auto">
            <TaskStatusChip status={task.status} className={blocked ? "animate-pulse-soft" : undefined} />
          </span>
        </div>

        <h3 className="text-title-md font-semibold leading-snug transition-colors duration-200 ease-m3 group-hover:text-primary">
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

        <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-3">
          {task.skills.map((s) => (
            <Chip key={s} tone="neutral" className="px-2.5 py-0.5 text-[11px]">
              {s}
            </Chip>
          ))}
          {prereqCount > 0 && (
            <Chip tone="info" className="ml-auto">
              <Link2 className="size-3.5" aria-hidden /> {prereqCount} prerequisite{prereqCount !== 1 ? "s" : ""}
            </Chip>
          )}
          {depCount > 0 && (
            <Chip tone="info" className={cn(prereqCount === 0 && "ml-auto")}>
              <GitBranch className="size-3.5" aria-hidden /> {depCount} dependent task{depCount !== 1 ? "s" : ""}
            </Chip>
          )}
        </div>
      </a>
    </motion.li>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function MyTasksPage() {
  const { data: tasks, isLoading, isError, error, refetch } = useMyTasks();
  const [filter, setFilter] = React.useState<"all" | TaskStatus>("all");

  const filtered = React.useMemo(
    () => (tasks ?? []).filter((t) => filter === "all" || t.status === filter),
    [tasks, filter]
  );

  return (
    <MotionConfig reducedMotion="user">
      <div>
        <PageHeader
          title="My Tasks"
          description="Everything assigned to you across workflows, in one place. Tasks waiting on your approval show up here too."
          actions={<FilterChips value={filter} onChange={setFilter} />}
        />

        <section aria-label="Task list" aria-busy={isLoading || undefined}>
          {isLoading ? (
            <SkeletonCards count={6} />
          ) : isError ? (
            <ErrorState
              title="Couldn't load your tasks"
              message={errMessage(error)}
              onRetry={() => refetch()}
            />
          ) : filtered.length === 0 ? (
            filter === "all" ? (
              <EmptyState
                icon={ListChecks}
                title="You have no assigned tasks yet"
                description="Tasks allocated to you will appear here. Approved assignment changes from your team lead land here automatically — check back after the next planning round."
                action={
                  <M3Button variant="tonal" onClick={() => refetch()}>
                    Refresh
                  </M3Button>
                }
              />
            ) : (
              <EmptyState
                icon={ListChecks}
                title="No tasks match this filter"
                description={`Nothing is currently “${FILTERS.find((f) => f.value === filter)?.label ?? filter}”. Try another status or clear the filter.`}
                action={
                  <M3Button variant="tonal" onClick={() => setFilter("all")}>
                    Show all tasks
                  </M3Button>
                }
              />
            )
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((task, i) => (
                <TaskCard key={task.id} task={task} index={i} />
              ))}
            </ul>
          )}
        </section>

        <ApprovedChangesCard className="mt-8" />
      </div>
    </MotionConfig>
  );
}
