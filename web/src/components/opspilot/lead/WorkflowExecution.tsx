"use client";

/**
 * Team lead — execution workspace.
 * Header with live progress, blocker alerts, and Board / List / Graph /
 * Activity tabs. Lead quick-status moves follow the backend's allowed
 * transition map; invalid moves are rejected server-side (422) and the
 * message is surfaced via toast by the hooks.
 */
import * as React from "react";
import { differenceInCalendarDays, format, formatDistanceToNow, parseISO } from "date-fns";
import {
  Activity as ActivityIcon,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  Columns3,
  FlaskConical,
  List as ListIcon,
  Loader2,
  MoreVertical,
  Network,
  OctagonAlert,
  RefreshCw,
  Users,
} from "lucide-react";
import { navigate } from "@/lib/router";
import { useExecution, useTeam, useUpdateTaskStatus } from "@/lib/api/queries";
import type { Task, TaskStatus, TeamMember } from "@/lib/api/types";
import {
  Avatar,
  BlockerStatusChip,
  Chip,
  DemoDataBadge,
  EmptyState,
  ErrorState,
  M3Button,
  PageHeader,
  PriorityChip,
  ProgressRing,
  SeverityChip,
  SkeletonCards,
  SkeletonTable,
  TASK_STATUS_META,
  TaskStatusChip,
  WorkflowStatusChip,
} from "@/components/opspilot/primitives";
import { DepGraph, depGraphNodesFromTasks } from "@/components/opspilot/dep-graph";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------- */
/* Helpers                                                           */
/* ---------------------------------------------------------------- */

function errMsg(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/** Backend-allowed transitions (mirrored; the API remains authoritative). */
const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  todo: ["in_progress", "blocked"],
  in_progress: ["in_review", "blocked", "done"],
  blocked: ["todo", "in_progress"],
  in_review: ["done", "in_progress"],
  done: [],
};

const COLUMN_ORDER: TaskStatus[] = ["todo", "in_progress", "blocked", "in_review", "done"];
const COLUMN_TONE: Record<TaskStatus, string> = {
  todo: "text-on-surface-variant",
  in_progress: "text-primary",
  blocked: "text-error",
  in_review: "text-warning",
  done: "text-success",
};

function targetChip(targetDate: string, completed: boolean) {
  const d = differenceInCalendarDays(parseISO(targetDate), new Date());
  const fmt = format(parseISO(targetDate), "MMM d");
  if (completed) return { tone: "neutral" as const, label: `Target ${fmt}` };
  if (d < 0) return { tone: "error" as const, label: `Overdue · ${fmt}` };
  if (d === 0) return { tone: "warning" as const, label: "Target today" };
  if (d === 1) return { tone: "warning" as const, label: "Target tomorrow" };
  if (d <= 7) return { tone: "warning" as const, label: `Target in ${d} days` };
  return { tone: "neutral" as const, label: `Target ${fmt}` };
}

function DueChip({ dueDate, className }: { dueDate: string; className?: string }) {
  const d = differenceInCalendarDays(parseISO(dueDate), new Date());
  const fmt = format(parseISO(dueDate), "MMM d");
  const tone = d < 0 ? "error" : d <= 2 ? "warning" : "neutral";
  const label = d < 0 ? `Overdue · ${fmt}` : d === 0 ? "Due today" : d === 1 ? "Due tomorrow" : `Due ${fmt}`;
  return (
    <Chip tone={tone} className={className}>
      <Clock className="size-3.5" aria-hidden /> {label}
    </Chip>
  );
}

/* ---------------------------------------------------------------- */
/* Page                                                              */
/* ---------------------------------------------------------------- */

export default function WorkflowExecutionPage({ workflowId }: { workflowId: string }) {
  const execQ = useExecution(workflowId);
  const teamQ = useTeam();
  const updateStatus = useUpdateTaskStatus(workflowId);

  const exec = execQ.data;
  const team = teamQ.data ?? [];
  const memberById = React.useMemo(() => new Map<string, TeamMember>(team.map((m) => [m.id, m])), [team]);

  const graph = React.useMemo(() => {
    if (!exec) return { nodes: [], edges: [] };
    return depGraphNodesFromTasks(
      exec.tasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        assigneeName: t.assigneeId ? memberById.get(t.assigneeId)?.name : undefined,
      })),
      exec.dependencies
    );
  }, [exec, memberById]);

  if (execQ.isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Workflow" />
        <SkeletonCards count={1} />
        <SkeletonTable rows={4} cols={4} />
      </div>
    );
  }

  if (execQ.isError || !exec) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Workflow" />
        <ErrorState
          title="Could not load this workflow"
          message={errMsg(execQ.error, "It may have been removed, or the demo data reset. Try again.")}
          onRetry={() => execQ.refetch()}
        />
      </div>
    );
  }

  const target = targetChip(exec.workflow.targetDate, exec.workflow.status === "completed");
  const openBlockers = exec.blockers.filter((b) => b.status !== "resolved");
  const members = exec.workflow.memberIds.map((id) => memberById.get(id)).filter((m): m is TeamMember => !!m);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[{ label: "Workflows", href: "#/workflows" }, { label: exec.workflow.name }]}
        title="Execution"
        description="Live board, dependency graph and activity for this workflow."
      />

      {/* Header card */}
      <section className="rounded-[24px] bg-card p-5 shadow-xs ring-1 ring-border md:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <WorkflowStatusChip status={exec.workflow.status} />
              <DemoDataBadge />
            </div>
            <h2 className="mt-2 text-title-lg font-bold">{exec.workflow.name}</h2>
            <p className="mt-1 text-body-md text-on-surface-variant">{exec.workflow.goal}</p>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <Chip tone={target.tone}>
                <Clock className="size-3.5" aria-hidden /> {target.label}
              </Chip>
              <Chip tone="outline">
                <Users className="size-3.5" aria-hidden /> {exec.workflow.memberIds.length} members
              </Chip>
            </div>
          </div>

          <div className="flex items-center gap-5">
            <ProgressRing value={exec.workflow.progress} size={72} />
            {members.length > 0 && (
              <div className="hidden sm:block">
                <p className="mb-1.5 text-label-sm text-on-surface-variant">Team</p>
                <div className="flex -space-x-2">
                  {members.slice(0, 5).map((m) => (
                    <Avatar key={m.id} name={m.name} accent={m.accent} className="size-8 ring-2 ring-card" />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:flex-col">
            <M3Button
              variant="outlined"
              size="icon"
              aria-label="Refresh workflow"
              onClick={() => execQ.refetch()}
              disabled={execQ.isRefetching}
            >
              <RefreshCw className={cn("size-5", execQ.isRefetching && "animate-spin")} aria-hidden />
            </M3Button>
            <M3Button variant="outlined" size="sm" onClick={() => navigate(`/workflows/${workflowId}/plan`)}>
              Plan
            </M3Button>
            <M3Button variant="outlined" size="sm" onClick={() => navigate(`/workflows/${workflowId}/allocation`)}>
              Allocation
            </M3Button>
          </div>
        </div>
      </section>

      {/* Blocker alerts */}
      {openBlockers.length > 0 && (
        <div className="flex flex-col gap-3">
          {openBlockers.map((b) => (
            <section
              key={b.id}
              role="alert"
              className="flex flex-col gap-3 rounded-[24px] border border-error/30 bg-error-container/50 p-4 md:flex-row md:items-center md:p-5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <SeverityChip severity={b.severity} />
                  <BlockerStatusChip status={b.status} />
                </div>
                <p className="mt-1.5 text-label-lg font-semibold">{b.title}</p>
                <p className="mt-0.5 line-clamp-2 text-label-md text-on-surface-variant">{b.description}</p>
                <p className="mt-1 text-label-sm text-on-surface-variant">
                  {b.taskTitle} · reported by {b.reportedByName} · {formatDistanceToNow(parseISO(b.reportedAt), { addSuffix: true })}
                </p>
              </div>
              <M3Button variant="destructive-tonal" size="sm" className="shrink-0" onClick={() => navigate("/recovery")}>
                Open Recovery Center
              </M3Button>
            </section>
          ))}
        </div>
      )}

      {/* Workspace tabs */}
      {exec.tasks.length === 0 ? (
        <EmptyState
          icon={FlaskConical}
          title="No tasks in this workflow yet"
          description="Confirm a plan to materialize tasks into execution, or add them from the plan review."
          action={<M3Button onClick={() => navigate(`/workflows/${workflowId}/plan`)}>Open plan review</M3Button>}
        />
      ) : (
        <Tabs defaultValue="board">
          <TabsList className="h-12 w-full justify-start overflow-x-auto rounded-full bg-surface-container-high p-1.5 scrollbar-slim sm:w-auto">
            <TabsTrigger value="board" className="shrink-0 rounded-full px-4 text-label-md data-[state=active]:bg-card data-[state=active]:shadow-sm">
              <Columns3 className="size-4" aria-hidden /> Board
            </TabsTrigger>
            <TabsTrigger value="list" className="shrink-0 rounded-full px-4 text-label-md data-[state=active]:bg-card data-[state=active]:shadow-sm">
              <ListIcon className="size-4" aria-hidden /> List
            </TabsTrigger>
            <TabsTrigger value="graph" className="shrink-0 rounded-full px-4 text-label-md data-[state=active]:bg-card data-[state=active]:shadow-sm">
              <Network className="size-4" aria-hidden /> Graph
            </TabsTrigger>
            <TabsTrigger value="activity" className="shrink-0 rounded-full px-4 text-label-md data-[state=active]:bg-card data-[state=active]:shadow-sm">
              <ActivityIcon className="size-4" aria-hidden /> Activity
            </TabsTrigger>
          </TabsList>

          {/* Board */}
          <TabsContent value="board" className="mt-4">
            <div className="-mx-4 overflow-x-auto px-4 pb-2 scrollbar-slim md:mx-0 md:px-0">
              <div className="flex min-w-max gap-4">
                {COLUMN_ORDER.map((col) => {
                  const items = exec.tasks.filter((t) => t.status === col);
                  const meta = TASK_STATUS_META[col];
                  const ColIcon = meta.icon;
                  return (
                    <section
                      key={col}
                      aria-label={`${meta.label} column`}
                      className="flex w-[272px] shrink-0 flex-col rounded-[24px] bg-surface-container-low/70 p-3"
                    >
                      <header className="mb-2 flex items-center gap-2 px-1.5 py-1">
                        <ColIcon className={cn("size-4", COLUMN_TONE[col])} aria-hidden />
                        <h3 className="text-label-md font-semibold">{meta.label}</h3>
                        <Chip tone="neutral" className="ml-auto min-w-6 justify-center px-2">
                          {items.length}
                        </Chip>
                      </header>
                      <div className="flex flex-col gap-2">
                        {items.length === 0 && (
                          <p className="rounded-2xl border border-dashed border-outline-variant px-3 py-6 text-center text-label-sm text-on-surface-variant">
                            No tasks
                          </p>
                        )}
                        {items.map((t) => (
                          <BoardCard
                            key={t.id}
                            task={t}
                            assignee={t.assigneeId ? memberById.get(t.assigneeId) ?? null : null}
                            moving={updateStatus.isPending && updateStatus.variables?.taskId === t.id}
                            onOpen={() => navigate(`/tasks/${t.id}`)}
                            onMove={(status) => updateStatus.mutate({ taskId: t.id, status })}
                          />
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
          </TabsContent>

          {/* List */}
          <TabsContent value="list" className="mt-4">
            <ListTable tasks={exec.tasks} memberById={memberById} />
          </TabsContent>

          {/* Graph */}
          <TabsContent value="graph" className="mt-4">
            <section className="rounded-[24px] bg-card p-5 shadow-xs ring-1 ring-border md:p-6">
              <DepGraph nodes={graph.nodes} edges={graph.edges} height={380} onNodeClick={(id) => navigate(`/tasks/${id}`)} />
              <p className="mt-2 text-label-sm text-on-surface-variant">Select a node to open the task. Blocked tasks pulse.</p>
            </section>
          </TabsContent>

          {/* Activity */}
          <TabsContent value="activity" className="mt-4">
            <section className="mx-auto max-w-3xl rounded-[24px] bg-card p-5 shadow-xs ring-1 ring-border md:p-6">
              {exec.activity.length === 0 ? (
                <p className="py-8 text-center text-label-lg text-on-surface-variant">No activity recorded yet.</p>
              ) : (
                <ul className="max-h-96 space-y-1 overflow-y-auto pr-1 scrollbar-slim">
                  {exec.activity.map((e) => {
                    const Icon = e.outcome === "success" ? CheckCircle2 : e.outcome === "failure" ? OctagonAlert : Clock;
                    const tone = e.outcome === "success" ? "text-success" : e.outcome === "failure" ? "text-error" : "text-warning";
                    return (
                      <li key={e.id} className="flex items-start gap-2.5 rounded-2xl px-2 py-2 transition-colors hover:bg-surface-container-low">
                        <Icon className={cn("mt-0.5 size-4 shrink-0", tone)} aria-hidden />
                        <div className="min-w-0 flex-1">
                          <p className="text-label-md">
                            <span className="font-medium">{e.actorName}</span>{" "}
                            <span className="text-on-surface-variant">{e.action.replace(/[._]/g, " ")}</span>
                            {e.target ? <span className="font-medium"> · {e.target}</span> : null}
                          </p>
                        </div>
                        <time dateTime={e.at} className="shrink-0 text-label-sm text-on-surface-variant">
                          {formatDistanceToNow(parseISO(e.at), { addSuffix: true })}
                        </time>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Board card                                                        */
/* ---------------------------------------------------------------- */

function BoardCard({
  task, assignee, moving, onOpen, onMove,
}: {
  task: Task;
  assignee: TeamMember | null;
  moving: boolean;
  onOpen: () => void;
  onMove: (status: TaskStatus) => void;
}) {
  const transitions = TRANSITIONS[task.status];
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      aria-label={`${task.title} — open task`}
      className="cursor-pointer rounded-2xl bg-card p-3 shadow-xs ring-1 ring-border outline-none transition-all duration-200 ease-m3 hover:shadow-md hover:ring-primary/30 focus-visible:ring-[3px] focus-visible:ring-primary/40"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-label-md font-semibold">{task.title}</p>
        {moving ? (
          <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-primary" aria-label="Updating status" />
        ) : transitions.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="-mr-1 -mt-1 flex size-9 shrink-0 items-center justify-center rounded-full text-on-surface-variant outline-none transition-colors hover:bg-surface-container-high focus-visible:ring-[3px] focus-visible:ring-primary/40"
                aria-label={`Move “${task.title}” to another status`}
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="size-4" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 rounded-2xl p-1.5">
              <DropdownMenuLabel className="px-2 py-1.5 text-label-sm text-on-surface-variant">Move to…</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {transitions.map((s) => {
                const meta = TASK_STATUS_META[s];
                const MoveIcon = meta.icon;
                return (
                  <DropdownMenuItem key={s} className="min-h-11 gap-2.5 rounded-full px-3" onSelect={() => onMove(s)}>
                    <MoveIcon className="size-4" aria-hidden /> {meta.label}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <PriorityChip priority={task.priority} />
        {task.dueDate && <DueChip dueDate={task.dueDate} className="shrink-0" />}
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        {assignee ? (
          <>
            <Avatar name={assignee.name} accent={assignee.accent} className="size-6 shrink-0" />
            <span className="min-w-0 truncate text-label-sm text-on-surface-variant">{assignee.name}</span>
          </>
        ) : (
          <span className="text-label-sm text-on-surface-variant">Unassigned</span>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* List table (sortable)                                             */
/* ---------------------------------------------------------------- */

type SortableKey = "title" | "status" | "assignee" | "due" | "estimate";

function ListTable({ tasks, memberById }: { tasks: Task[]; memberById: Map<string, TeamMember> }) {
  const [sort, setSort] = React.useState<{ key: SortableKey; dir: 1 | -1 } | null>(null);

  const sorted = React.useMemo(() => {
    const list = [...tasks];
    if (!sort) return list;
    const statusOrder = COLUMN_ORDER;
    list.sort((a, b) => {
      let cmp = 0;
      switch (sort.key) {
        case "title":
          cmp = a.title.localeCompare(b.title);
          break;
        case "status":
          cmp = statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status);
          break;
        case "assignee":
          cmp = (a.assigneeId ? memberById.get(a.assigneeId)?.name ?? "" : "").localeCompare(
            b.assigneeId ? memberById.get(b.assigneeId)?.name ?? "" : ""
          );
          break;
        case "due":
          cmp = (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
          break;
        case "estimate":
          cmp = (a.estimateHours ?? 0) - (b.estimateHours ?? 0);
          break;
      }
      return cmp * sort.dir;
    });
    return list;
  }, [tasks, sort, memberById]);

  function toggleSort(key: SortableKey) {
    setSort((s) => (s && s.key === key ? (s.dir === 1 ? { key, dir: -1 } : null) : { key, dir: 1 }));
  }

  const columns: { key: SortableKey; label: string }[] = [
    { key: "title", label: "Title" },
    { key: "status", label: "Status" },
    { key: "assignee", label: "Assignee" },
    { key: "due", label: "Due" },
    { key: "estimate", label: "Estimate" },
  ];

  return (
    <div className="overflow-x-auto rounded-[24px] ring-1 ring-border scrollbar-slim">
      <table className="w-full min-w-[680px] border-collapse bg-card text-left">
        <caption className="sr-only">Tasks in this workflow</caption>
        <thead>
          <tr className="border-b border-border bg-surface-container-low/60">
            {columns.map((c) => {
              const active = sort?.key === c.key;
              const SortIcon = !active ? ArrowUpDown : sort?.dir === 1 ? ArrowUp : ArrowDown;
              return (
                <th key={c.key} scope="col" className="px-4 py-2" aria-sort={active ? (sort?.dir === 1 ? "ascending" : "descending") : undefined}>
                  <button
                    type="button"
                    onClick={() => toggleSort(c.key)}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-label-md font-semibold outline-none transition-colors hover:bg-surface-container-high focus-visible:ring-[3px] focus-visible:ring-primary/40"
                  >
                    {c.label}
                    <SortIcon className="size-3.5" aria-hidden />
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((t) => {
            const assignee = t.assigneeId ? memberById.get(t.assigneeId) : null;
            return (
              <tr key={t.id} className="border-b border-border/70 transition-colors last:border-0 hover:bg-surface-container-low/50">
                <td className="px-4 py-3">
                  <a href={`#/tasks/${t.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
                    {t.title}
                  </a>
                </td>
                <td className="px-4 py-3">
                  <TaskStatusChip status={t.status} />
                </td>
                <td className="px-4 py-3">
                  {assignee ? (
                    <span className="flex items-center gap-2">
                      <Avatar name={assignee.name} accent={assignee.accent} className="size-6 shrink-0" />
                      <span className="text-label-md">{assignee.name}</span>
                    </span>
                  ) : (
                    <span className="text-label-md text-on-surface-variant">Unassigned</span>
                  )}
                </td>
                <td className="px-4 py-3">{t.dueDate ? <DueChip dueDate={t.dueDate} /> : <span className="text-label-md text-on-surface-variant">—</span>}</td>
                <td className="px-4 py-3 text-label-md">{t.estimateHours != null ? `${t.estimateHours}h` : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
