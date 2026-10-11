"use client";

/**
 * Task detail — shared by team leads and employees (rendered inside AppShell).
 * Main card: status/priority, description, acceptance criteria, skills, meta,
 * blocker alert, status-transition actions + "Report blocker" dialog.
 * Aside: "Where this fits" (prerequisites/dependents) and the workflow card.
 */
import * as React from "react";
import { MotionConfig, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  Eye,
  GitBranch,
  Link2,
  OctagonAlert,
  Play,
  RotateCcw,
  Sparkles,
  Workflow as WorkflowIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { navigate } from "@/lib/router";
import { useUiStore, type BlockerDraft } from "@/lib/store";
import { format, formatDistanceToNow, isPast, isToday, isTomorrow, parseISO } from "date-fns";
import {
  useExecution,
  useReportBlocker,
  useSession,
  useTask,
  useTeam,
  useUpdateTaskStatus,
  useWorkflow,
} from "@/lib/api/queries";
import { ApiError, type BlockerSeverity, type Task, type TaskStatus } from "@/lib/api/types";
import {
  Avatar,
  BlockerStatusChip,
  Chip,
  DemoDataBadge,
  ErrorState,
  M3Button,
  PageHeader,
  PriorityChip,
  SeverityChip,
  TaskStatusChip,
  TextArea,
  TextField,
  WorkflowStatusChip,
} from "../primitives";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

const EASE_M3: [number, number, number, number] = [0.05, 0.7, 0.1, 1];


function errMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/* ------------------------------------------------------------------ */
/* Status transitions (mirrors backend rules; backend stays authoritative) */
/* ------------------------------------------------------------------ */

interface Transition {
  to: TaskStatus;
  label: string;
  icon: React.ElementType;
  variant: "tonal" | "success-tonal" | "destructive-tonal";
}

const TRANSITIONS: Record<TaskStatus, Transition[]> = {
  todo: [
    { to: "in_progress", label: "Start task", icon: Play, variant: "tonal" },
    { to: "blocked", label: "Mark blocked", icon: OctagonAlert, variant: "destructive-tonal" },
  ],
  in_progress: [
    { to: "in_review", label: "Submit for review", icon: Eye, variant: "tonal" },
    { to: "done", label: "Mark done", icon: CheckCircle2, variant: "success-tonal" },
    { to: "blocked", label: "Mark blocked", icon: OctagonAlert, variant: "destructive-tonal" },
  ],
  blocked: [
    { to: "in_progress", label: "Resume work", icon: Play, variant: "tonal" },
    { to: "todo", label: "Move to to-do", icon: RotateCcw, variant: "tonal" },
  ],
  in_review: [
    { to: "done", label: "Approve & complete", icon: CheckCircle2, variant: "success-tonal" },
    { to: "in_progress", label: "Reopen work", icon: RotateCcw, variant: "tonal" },
  ],
  done: [],
};

/* ------------------------------------------------------------------ */
/* Small building blocks                                               */
/* ------------------------------------------------------------------ */

function DueMeta({ task }: { task: Task }) {
  if (!task.dueDate) return null;
  const d = parseISO(task.dueDate);
  const day = format(d, "EEE, MMM d");
  const soon = isToday(d) || isTomorrow(d);
  const overdue = task.status !== "done" && (soon || isPast(d));
  const label = isToday(d)
    ? `Due today · ${day}`
    : isTomorrow(d)
      ? `Due tomorrow · ${day}`
      : isPast(d)
        ? `Overdue · ${day}`
        : day;
  return (
    <span
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-full px-1 text-label-md",
        overdue ? "font-medium text-error" : "text-on-surface-variant"
      )}
    >
      <Calendar className="size-4" aria-hidden /> {label}
    </span>
  );
}

function TaskLinkList({
  titles,
  titleToId,
  icon: Icon,
  emptyText,
}: {
  titles: string[];
  titleToId: Map<string, string>;
  icon: React.ElementType;
  emptyText: string;
}) {
  if (titles.length === 0) {
    return <p className="text-label-md text-on-surface-variant">{emptyText}</p>;
  }
  return (
    <ul className="space-y-0.5">
      {titles.map((title) => {
        const id = titleToId.get(title);
        return (
          <li key={title}>
            {id ? (
              <a
                href={`#/tasks/${id}`}
                className="group -mx-2 flex min-h-11 items-center gap-2 rounded-xl px-2 text-label-md text-primary outline-none transition-colors duration-200 ease-m3 hover:bg-secondary/60 focus-visible:ring-[3px] focus-visible:ring-primary/40"
              >
                <Icon className="size-4 shrink-0 text-on-surface-variant" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{title}</span>
                <ArrowRight
                  className="size-3.5 shrink-0 opacity-0 transition-opacity duration-200 ease-m3 group-hover:opacity-100"
                  aria-hidden
                />
              </a>
            ) : (
              <span className="-mx-2 flex min-h-11 items-center gap-2 px-2 text-label-md">
                <Icon className="size-4 shrink-0 text-on-surface-variant" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{title}</span>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Blocker dialog                                                      */
/* ------------------------------------------------------------------ */

function ReportBlockerDialog({
  open,
  onOpenChange,
  taskTitle,
  pending,
  onSubmit,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskTitle: string;
  pending: boolean;
  onSubmit: (input: { title: string; description: string; severity: BlockerSeverity }) => void;
  initial?: BlockerDraft | null;
}) {
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [severity, setSeverity] = React.useState<BlockerSeverity>("high");
  const [titleError, setTitleError] = React.useState<string | null>(null);

  /* Prefill from an AI Work Assistant draft (explicit hand-off; still user-submitted) */
  React.useEffect(() => {
    if (open && initial) {
      setTitle(initial.title);
      setDescription(initial.description);
      setSeverity(initial.severity);
    }
  }, [open, initial]);

  const close = () => {
    onOpenChange(false);
    setTitle("");
    setDescription("");
    setSeverity("high");
    setTitleError(null);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setTitleError("Give the blocker a short title.");
      return;
    }
    setTitleError(null);
    onSubmit({ title: title.trim(), description: description.trim(), severity });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) close();
        else onOpenChange(true);
      }}
    >
      <DialogContent className="max-w-lg rounded-[28px] border-border bg-popover p-6">
        <DialogHeader>
          <DialogTitle className="text-title-md">Report a blocker</DialogTitle>
          <DialogDescription className="text-label-lg text-on-surface-variant">
            Describe what&apos;s blocking “{taskTitle}”. Your team lead is notified and a recovery case opens
            automatically.
          </DialogDescription>
        </DialogHeader>
        {initial && (
          <p className="flex items-start gap-2 rounded-2xl bg-secondary-container/60 p-3 text-label-md text-on-secondary-container ring-1 ring-secondary/40">
            <Sparkles className="mt-0.5 size-4 shrink-0" aria-hidden />
            Prefilled from an AI Work Assistant draft. Review and edit before reporting — nothing is submitted until you
            press “Report blocker”.
          </p>
        )}
        <form onSubmit={submit} className="space-y-4" noValidate>
          <TextField
            label="What's blocking you?"
            placeholder="e.g. Payments vendor sandbox returning 500s"
            required
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setTitleError(null);
            }}
            error={titleError ?? undefined}
          />
          <TextArea
            label="Details"
            placeholder="Include error messages, when it started and what you've already tried."
            hint="Optional, but details speed up recovery."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div>
            <Label htmlFor="blocker-severity" className="mb-1.5 block text-label-md font-medium">
              Severity
            </Label>
            <Select value={severity} onValueChange={(v) => setSeverity(v as BlockerSeverity)}>
              <SelectTrigger
                id="blocker-severity"
                className="h-12 w-full rounded-xl border border-input bg-background px-4 text-body-md data-[state=open]:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/25"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-2xl">
                <SelectItem value="low" className="min-h-11 rounded-xl">Low — annoying, not urgent</SelectItem>
                <SelectItem value="medium" className="min-h-11 rounded-xl">Medium — slows me down</SelectItem>
                <SelectItem value="high" className="min-h-11 rounded-xl">High — my work is stopped</SelectItem>
                <SelectItem value="critical" className="min-h-11 rounded-xl">Critical — the release is at risk</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <DialogClose asChild>
              <M3Button type="button" variant="text" disabled={pending}>
                Cancel
              </M3Button>
            </DialogClose>
            <M3Button type="submit" variant="destructive" loading={pending}>
              <OctagonAlert className="size-[18px]" aria-hidden /> Report blocker
            </M3Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Skeleton                                                            */
/* ------------------------------------------------------------------ */

function DetailSkeleton() {
  return (
    <div aria-hidden className="space-y-6">
      <Skeleton className="h-5 w-44 rounded-full" />
      <Skeleton className="h-9 w-2/3 max-w-lg rounded-full" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5 rounded-[24px] bg-card p-6 ring-1 ring-border md:p-8">
          <div className="flex gap-2">
            <Skeleton className="h-7 w-28 rounded-full" />
            <Skeleton className="h-7 w-24 rounded-full" />
          </div>
          <div className="space-y-2.5">
            <Skeleton className="h-4 w-full rounded-full" />
            <Skeleton className="h-4 w-5/6 rounded-full" />
            <Skeleton className="h-4 w-2/3 rounded-full" />
          </div>
          <Skeleton className="h-4 w-44 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-3/4 rounded-full" />
            <Skeleton className="h-4 w-2/3 rounded-full" />
          </div>
          <Skeleton className="h-11 w-full rounded-full" />
        </div>
        <div className="space-y-4">
          <div className="space-y-3 rounded-[24px] bg-card p-5 ring-1 ring-border">
            <Skeleton className="h-5 w-32 rounded-full" />
            <Skeleton className="h-4 w-full rounded-full" />
            <Skeleton className="h-4 w-3/4 rounded-full" />
          </div>
          <div className="space-y-3 rounded-[24px] bg-card p-5 ring-1 ring-border">
            <Skeleton className="h-5 w-28 rounded-full" />
            <Skeleton className="h-4 w-full rounded-full" />
            <Skeleton className="h-4 w-2/3 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function TaskDetailView({ taskId }: { taskId: string }) {
  const { data: task, isLoading, isError, error, refetch } = useTask(taskId);
  const { data: session } = useSession();
  const isLead = session?.user.role === "team_lead";
  const consumeDraftBlocker = useUiStore((s) => s.consumeDraftBlocker);
  const { data: team } = useTeam();
  const { data: workflow } = useWorkflow(task?.workflowId ?? "");
  const { data: execution } = useExecution(task?.workflowId ?? "");
  const statusMutation = useUpdateTaskStatus(undefined);
  const blockerMutation = useReportBlocker();
  const [blockerOpen, setBlockerOpen] = React.useState(false);
  const [blockerInitial, setBlockerInitial] = React.useState<BlockerDraft | null>(null);

  if (isLoading) return <DetailSkeleton />;

  if (isError || !task) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <div>
        <PageHeader
          title={notFound ? "Task not found" : "Task"}
          breadcrumbs={[{ label: "Tasks", href: "#/tasks" }]}
          actions={<DemoDataBadge />}
        />
        <ErrorState
          title={notFound ? "Task not found" : "Couldn't load this task"}
          message={errMessage(error, "The task may have been removed or the link is stale.")}
          onRetry={() => refetch()}
        />
        <div className="mt-4 flex justify-center">
          <M3Button variant="tonal" onClick={() => navigate("/tasks")}>
            <ArrowLeft className="size-4" aria-hidden /> Back to tasks
          </M3Button>
        </div>
      </div>
    );
  }

  const assignee = (team ?? []).find((m) => m.id === task.assigneeId);
  const canMutate = isLead || task.assigneeId === session?.user.id;
  const titleToId = new Map<string, string>((execution?.tasks ?? []).map((t) => [t.title, t.id]));
  const transitions = TRANSITIONS[task.status];
  const statusPending = statusMutation.isPending;

  const submitBlocker = (input: { title: string; description: string; severity: BlockerSeverity }) => {
    blockerMutation.mutate(
      { taskId: task.id, title: input.title, description: input.description, severity: input.severity },
      { onSuccess: () => setBlockerOpen(false) }
    );
  };

  /** One-shot hand-off from the AI Work Assistant: prefill, never auto-submit. */
  const openBlockerDialog = () => {
    const draft = consumeDraftBlocker();
    setBlockerInitial(draft && draft.taskId === task.id ? draft : null);
    setBlockerOpen(true);
  };

  return (
    <MotionConfig reducedMotion="user">
      <div>
        <div className="mb-1">
          <a
            href="#/tasks"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-1 text-label-md font-medium text-primary outline-none underline-offset-4 transition-colors duration-200 ease-m3 hover:underline focus-visible:ring-[3px] focus-visible:ring-primary/40"
          >
            <ArrowLeft className="size-4" aria-hidden /> Back to tasks
          </a>
        </div>
        <PageHeader
          title={task.title}
          breadcrumbs={[{ label: "Tasks", href: "#/tasks" }, { label: task.title }]}
          actions={<DemoDataBadge />}
        />

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* ------------------------- Main card ------------------------- */}
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: EASE_M3 }}
            aria-label="Task details"
            className="min-w-0 rounded-[24px] bg-card p-6 shadow-xs ring-1 ring-border md:p-8"
          >
            <div className="flex flex-wrap items-center gap-2">
              <TaskStatusChip status={task.status} />
              <PriorityChip priority={task.priority} />
            </div>

            <p className="mt-4 text-body-md text-on-surface-variant">{task.description}</p>

            <div className="mt-6">
              <h2 className="text-title-md font-semibold">Acceptance criteria</h2>
              <ul className="mt-3 space-y-2.5">
                {task.acceptanceCriteria.map((c) => (
                  <li key={c} className="flex items-start gap-2.5 text-label-lg">
                    <CheckCircle2 className="mt-0.5 size-[18px] shrink-0 text-success" aria-hidden />
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>

            {task.skills.length > 0 && (
              <div className="mt-6">
                <h2 className="text-title-md font-semibold">Skills</h2>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {task.skills.map((s) => (
                    <Chip key={s} tone="primary">
                      {s}
                    </Chip>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-1">
              {typeof task.estimateHours === "number" && (
                <span className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-1 text-label-md text-on-surface-variant">
                  <Clock className="size-4" aria-hidden /> {task.estimateHours} h estimated
                </span>
              )}
              <DueMeta task={task} />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border pt-5">
              <span className="inline-flex min-h-11 items-center gap-2">
                <span className="text-label-sm uppercase tracking-[0.08em] text-on-surface-variant">Workflow</span>
                {isLead ? (
                  <a
                    href={`#/workflows/${task.workflowId}`}
                    aria-label={`Open workflow ${task.workflowName}`}
                    className="inline-flex items-center rounded-full outline-none transition-transform duration-200 ease-m3 focus-visible:ring-[3px] focus-visible:ring-primary/40 hover:scale-[1.03] active:scale-95"
                  >
                    <Chip tone="primary">
                      <WorkflowIcon className="size-3.5" aria-hidden /> {task.workflowName}
                    </Chip>
                  </a>
                ) : (
                  <Chip tone="primary">
                    <WorkflowIcon className="size-3.5" aria-hidden /> {task.workflowName}
                  </Chip>
                )}
              </span>
              {assignee && (
                <span className="inline-flex min-h-11 items-center gap-2.5">
                  <span className="text-label-sm uppercase tracking-[0.08em] text-on-surface-variant">Assignee</span>
                  <Avatar name={assignee.name} accent={assignee.accent} className="size-8" />
                  <span className="text-label-md font-medium">{assignee.name}</span>
                </span>
              )}
            </div>

            {task.blocker && (
              <div role="alert" className="mt-6 rounded-2xl bg-error-container/60 p-4 ring-1 ring-error/20">
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityChip severity={task.blocker.severity} />
                  <BlockerStatusChip status={task.blocker.status} />
                </div>
                <p className="mt-2.5 text-label-lg font-semibold text-on-error-container">{task.blocker.title}</p>
                <p className="mt-1 text-label-md text-on-surface-variant">{task.blocker.description}</p>
                <p className="mt-1.5 text-label-sm text-on-surface-variant">
                  Reported by {task.blocker.reportedByName} ·{" "}
                  {formatDistanceToNow(parseISO(task.blocker.reportedAt), { addSuffix: true })}
                </p>
                {isLead && (
                  <a
                    href="#/recovery"
                    className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-1 text-label-md font-semibold text-error outline-none underline-offset-4 transition-colors duration-200 ease-m3 hover:underline focus-visible:ring-[3px] focus-visible:ring-error/40"
                  >
                    View recovery case <ArrowRight className="size-4" aria-hidden />
                  </a>
                )}
              </div>
            )}

            <div className="mt-6 border-t border-border pt-6">
              <h2 className="text-title-md font-semibold">Update status</h2>
              {canMutate ? (
                <>
                  <p className="mt-1 text-label-md text-on-surface-variant">
                    Only valid next steps are shown — the workflow rules reject anything else.
                  </p>
                  {transitions.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {transitions.map((tr) => {
                        const Icon = tr.icon;
                        return (
                          <M3Button
                            key={tr.to}
                            variant={tr.variant}
                            disabled={statusPending}
                            loading={statusPending && statusMutation.variables?.status === tr.to}
                            onClick={() => statusMutation.mutate({ taskId: task.id, status: tr.to })}
                          >
                            <Icon className="size-[18px]" aria-hidden /> {tr.label}
                          </M3Button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="mt-3 flex items-center gap-2 text-label-md text-on-surface-variant">
                      <Circle className="size-4 text-success" aria-hidden /> This task is completed — no further status
                      changes.
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <M3Button
                      variant="destructive-tonal"
                      onClick={openBlockerDialog}
                      disabled={blockerMutation.isPending}
                    >
                      <OctagonAlert className="size-[18px]" aria-hidden /> Report blocker
                    </M3Button>
                    {!isLead && task.status !== "done" && (
                      <M3Button variant="tonal" onClick={() => navigate(`/assistant?task=${task.id}`)}>
                        <Sparkles className="size-[18px]" aria-hidden /> Draft with AI Assistant
                      </M3Button>
                    )}
                  </div>
                </>
              ) : (
                <p className="mt-2 flex items-start gap-2 rounded-2xl bg-surface-container-low p-3 text-label-md text-on-surface-variant">
                  <Eye className="mt-0.5 size-4 shrink-0" aria-hidden />
                  Assigned to {assignee?.name ?? "a teammate"} — only the assignee can update this task&apos;s status or
                  report blockers. You have read-only view access.
                </p>
              )}
            </div>
          </motion.section>

          {/* ------------------------- Aside ------------------------- */}
          <div className="space-y-6">
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.05, ease: EASE_M3 }}
              aria-label="Where this task fits"
              className="rounded-[24px] bg-card p-5 shadow-xs ring-1 ring-border"
            >
              <h2 className="text-title-md font-semibold">Where this fits</h2>
              <div className="mt-4">
                <h3 className="mb-1.5 flex items-center gap-1.5 text-label-md font-semibold text-on-surface-variant">
                  <Link2 className="size-4" aria-hidden /> Prerequisites — finish these first
                </h3>
                <TaskLinkList
                  titles={task.prerequisiteTitles}
                  titleToId={titleToId}
                  icon={Link2}
                  emptyText="None — this task can start anytime."
                />
              </div>
              <div className="mt-5">
                <h3 className="mb-1.5 flex items-center gap-1.5 text-label-md font-semibold text-on-surface-variant">
                  <GitBranch className="size-4" aria-hidden /> Dependent tasks — waiting on this
                </h3>
                <TaskLinkList
                  titles={task.dependentTitles}
                  titleToId={titleToId}
                  icon={GitBranch}
                  emptyText="Nothing is waiting on this task."
                />
              </div>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1, ease: EASE_M3 }}
              aria-label="Workflow"
              className="rounded-[24px] bg-card p-5 shadow-xs ring-1 ring-border"
            >
              <h2 className="flex items-center gap-2 text-title-md font-semibold">
                <WorkflowIcon className="size-4 text-primary" aria-hidden /> Workflow
              </h2>
              <p className="mt-3 text-label-lg font-semibold">{workflow?.name ?? task.workflowName}</p>
              {workflow && (
                <>
                  <div className="mt-2">
                    <WorkflowStatusChip status={workflow.status} />
                  </div>
                  <div className="mt-3" role="img" aria-label={`${workflow.progress}% complete`}>
                    <div className="h-2 overflow-hidden rounded-full bg-surface-container-high">
                      <div
                        className="h-full rounded-full bg-primary transition-[width] duration-500 ease-m3"
                        style={{ width: `${workflow.progress}%` }}
                      />
                    </div>
                    <p className="mt-1 text-label-sm text-on-surface-variant">{workflow.progress}% complete</p>
                  </div>
                  <p className="mt-2 text-label-sm text-on-surface-variant">
                    Target · {format(parseISO(workflow.targetDate), "EEE, MMM d")}
                  </p>
                </>
              )}
              {isLead && (
                <a
                  href={`#/workflows/${task.workflowId}`}
                  className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-full px-1 text-label-md font-medium text-primary outline-none underline-offset-4 transition-colors duration-200 ease-m3 hover:underline focus-visible:ring-[3px] focus-visible:ring-primary/40"
                >
                  Open workflow <ArrowRight className="size-4" aria-hidden />
                </a>
              )}
            </motion.section>
          </div>
        </div>

        <ReportBlockerDialog
          open={blockerOpen}
          onOpenChange={setBlockerOpen}
          taskTitle={task.title}
          pending={blockerMutation.isPending}
          onSubmit={submitBlocker}
          initial={blockerInitial}
        />
      </div>
    </MotionConfig>
  );
}
