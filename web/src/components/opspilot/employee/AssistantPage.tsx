"use client";

/**
 * AI Work Assistant (route /assistant, role: employee).
 *
 * The ONLY source of assistant content is `requestAssistantHelp` (real backend
 * route /api/ai/assistant). No canned demo responses, no fake streaming:
 * if the service fails, an honest error bubble is the result.
 *
 * Every artifact is a DRAFT: the assistant never mutates tasks. The one
 * explicit hand-off ("Use in blocker report") merely PREFILLS the authorized
 * "Report blocker" dialog on the task page — the user still reviews and submits.
 */
import * as React from "react";
import { MotionConfig, motion } from "framer-motion";
import {
  AlertTriangle,
  Calendar,
  Check,
  ClipboardList,
  Clock,
  Copy,
  ChevronDown,
  Download,
  FileText,
  FlaskConical,
  GitBranch,
  HelpCircle,
  Hourglass,
  Info,
  Link2,
  ListChecks,
  ListTree,
  Loader2,
  Map as MapIcon,
  OctagonAlert,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { navigate, useHashRoute } from "@/lib/router";
import { useUiStore } from "@/lib/store";
import { useMyTasks, useSession, useTask } from "@/lib/api/queries";
import { ApiError, type Blocker, type Task } from "@/lib/api/types";
import {
  ASSISTANT_DEFERRED_MESSAGE,
  ASSISTANT_MODES,
  AssistantError,
  requestAssistantHelp,
  type AssistantMode,
  type AssistantTaskContext,
  type AssistantTurn,
} from "@/lib/api/assistant";
import { format } from "date-fns";
import {
  BlockerStatusChip,
  Chip,
  ErrorState,
  M3Button,
  PageHeader,
  PriorityChip,
  SeverityChip,
  TaskStatusChip,
  TextArea,
} from "../primitives";
import { MarkdownLite } from "../shared/MarkdownLite";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const EASE_M3: [number, number, number, number] = [0.05, 0.7, 0.1, 1];

type MyTask = Task & {
  workflowName: string;
  prerequisiteTitles: string[];
  dependentTitles: string[];
  blocker?: Blocker;
};

/** Local thread turn — keeps the producing mode so draft affordances can be mode-aware. */
interface UiTurn extends AssistantTurn {
  mode?: AssistantMode;
}

interface FailureState {
  message: string;
  mode: AssistantMode;
  turns: UiTurn[];
}

const MODE_ICONS: Record<AssistantMode, React.ElementType> = {
  decompose: ListTree,
  roadmap: MapIcon,
  research: Search,
  docs: FileText,
  tests: FlaskConical,
  explain: HelpCircle,
  progress: ClipboardList,
};

function modeLabel(mode: AssistantMode | undefined): string {
  return ASSISTANT_MODES.find((d) => d.id === mode)?.label ?? "Assistant";
}

function errMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  if (err instanceof AssistantError || err instanceof ApiError || err instanceof Error) return err.message || fallback;
  return fallback;
}

/* ------------------------------------------------------------------ */
/* Draft helpers (extracted from the assistant's markdown-lite output)  */
/* ------------------------------------------------------------------ */

/** First markdown heading in the draft, or null. */
function firstHeading(content: string): string | null {
  for (const line of content.split("\n")) {
    const t = line.trim();
    if (t.startsWith("### ")) return t.slice(4).trim();
    if (t.startsWith("## ")) return t.slice(3).trim();
    if (t.startsWith("# ")) return t.slice(2).trim();
  }
  return null;
}

/** Strip markdown emphasis/list markers from a line for use as plain text. */
function stripMarkdown(line: string): string {
  return line
    .replace(/^#{1,6}\s+/, "")
    .replace(/^[-*]\s+/, "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/^Blocked:?\s*/i, "")
    .trim();
}

/**
 * Derive a short, human blocker title from the draft: prefer a meaningful
 * sentence from the blocker-report section, then a non-generic heading,
 * else fall back to "Blocked: <task>".
 */
function blockerTitle(content: string, taskTitle: string): string {
  const generic = /^(progress summary|blocker report draft?|summary|status update)$/i;
  const section = blockerSection(content);
  if (section) {
    const line = section
      .split("\n")
      .map(stripMarkdown)
      .find((l) => l.length >= 12);
    if (line) {
      const sentence = line.split(/(?<=[.!?])\s/)[0] ?? line;
      return sentence.length > 72 ? `${sentence.slice(0, 71).trimEnd()}…` : sentence;
    }
  }
  const heading = firstHeading(content);
  if (heading && !generic.test(heading)) {
    const clean = stripMarkdown(heading);
    if (clean.length >= 8) return clean.length > 72 ? `${clean.slice(0, 71).trimEnd()}…` : clean;
  }
  return `Blocked: ${taskTitle}`;
}

/** The "Blocker report draft" section body, or null when the draft has none. */
function blockerSection(content: string): string | null {
  const lines = content.split("\n");
  let captured: string[] | null = null;
  for (const line of lines) {
    const t = line.trim();
    const isHeading = /^#{2,3}\s+/.test(t);
    if (captured && isHeading) break;
    if (!captured && /^#{2,3}\s+blocker/i.test(t)) {
      captured = [];
      continue;
    }
    if (captured) captured.push(line);
  }
  const text = (captured ?? []).join("\n").trim();
  return text.length > 0 ? text : null;
}

function downloadMarkdown(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ */
/* Small building blocks                                                */
/* ------------------------------------------------------------------ */

function CopyButton({ text }: { text: string }) {
  const [state, setState] = React.useState<"idle" | "copied" | "failed">("idle");
  const timer = React.useRef<number | null>(null);
  React.useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), 2000);
  };

  return (
    <button
      type="button"
      onClick={onCopy}
      aria-live="polite"
      className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-label-md font-medium text-on-surface-variant outline-none transition-colors duration-200 ease-m3 hover:bg-surface-container-high hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-primary/40"
    >
      {state === "copied" ? (
        <Check className="size-4 text-success" aria-hidden />
      ) : state === "failed" ? (
        <AlertTriangle className="size-4 text-error" aria-hidden />
      ) : (
        <Copy className="size-4" aria-hidden />
      )}
      {state === "copied" ? "Copied" : state === "failed" ? "Couldn't copy" : "Copy"}
    </button>
  );
}

function DownloadButton({ content, mode }: { content: string; mode: AssistantMode | undefined }) {
  const filename = `opspilot-assistant-${mode ?? "draft"}-${format(new Date(), "yyyy-MM-dd")}.md`;
  return (
    <button
      type="button"
      onClick={() => downloadMarkdown(filename, content)}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-label-md font-medium text-on-surface-variant outline-none transition-colors duration-200 ease-m3 hover:bg-surface-container-high hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-primary/40"
    >
      <Download className="size-4" aria-hidden /> .md
    </button>
  );
}

/** Left-rail panel — rendered once on desktop and once inside the mobile collapsible. */
function TaskContextPanel({
  tasks,
  tasksLoading,
  selectedId,
  onSelect,
  selectedTask,
  detail,
  detailLoading,
  mode,
  onModeChange,
}: {
  tasks: MyTask[];
  tasksLoading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  selectedTask: MyTask | null;
  detail: MyTask | null;
  detailLoading: boolean;
  mode: AssistantMode;
  onModeChange: (m: AssistantMode) => void;
}) {
  const groups = React.useMemo(() => {
    const byWorkflow = new Map<string, MyTask[]>();
    for (const t of tasks) {
      const key = t.workflowName || "Other work";
      const bucket = byWorkflow.get(key);
      if (bucket) bucket.push(t);
      else byWorkflow.set(key, [t]);
    }
    return Array.from(byWorkflow.entries());
  }, [tasks]);

  const blocker = detail?.blocker;

  return (
    <div className="space-y-4">
      {/* Task selector */}
      <div className="rounded-[24px] bg-card p-5 shadow-xs ring-1 ring-border">
        <h2 className="text-title-sm font-semibold">Task context</h2>
        <p className="mb-3 mt-0.5 text-label-sm text-on-surface-variant">
          Pick one of your tasks to ground the assistant&apos;s answers.
        </p>
        <Select value={selectedId ?? undefined} onValueChange={(v) => onSelect(v)}>
          <SelectTrigger
            id="assistant-task-select"
            disabled={tasksLoading || tasks.length === 0}
            className="h-12 w-full rounded-xl border border-input bg-background px-4 text-body-md data-[state=open]:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/25"
          >
            <SelectValue
              placeholder={
                tasksLoading ? "Loading your tasks…" : tasks.length === 0 ? "No tasks assigned yet" : "Select a task"
              }
            />
          </SelectTrigger>
          <SelectContent className="rounded-2xl">
            {groups.map(([workflowName, items]) => (
              <SelectGroup key={workflowName}>
                <SelectLabel className="text-label-sm font-semibold text-on-surface-variant">{workflowName}</SelectLabel>
                {items.map((t) => (
                  <SelectItem key={t.id} value={t.id} className="min-h-11 rounded-xl">
                    {t.title}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        {tasks.length === 0 && !tasksLoading && (
          <p className="mt-2 text-label-sm text-on-surface-variant">
            Once work is allocated to you it will show up here for grounded help.
          </p>
        )}
      </div>

      {/* Selected task summary */}
      {selectedTask && (
        <div className="rounded-[24px] bg-card p-5 shadow-xs ring-1 ring-border">
          <div className="flex flex-wrap items-center gap-2">
            <TaskStatusChip status={selectedTask.status} />
            <PriorityChip priority={selectedTask.priority} />
          </div>
          <h3 className="mt-2.5 text-title-md font-semibold leading-snug">{selectedTask.title}</h3>
          <p className="mt-0.5 text-label-sm text-on-surface-variant">{selectedTask.workflowName}</p>
          <p className="mt-2 line-clamp-3 text-label-md text-on-surface-variant">{selectedTask.description}</p>

          <ul className="mt-3 space-y-1.5 text-label-md">
            {selectedTask.dueDate && (
              <li className="flex items-center gap-2">
                <Calendar className="size-4 shrink-0 text-on-surface-variant" aria-hidden />
                Due {format(new Date(selectedTask.dueDate), "EEE, MMM d")}
              </li>
            )}
            {typeof selectedTask.estimateHours === "number" && (
              <li className="flex items-center gap-2">
                <Clock className="size-4 shrink-0 text-on-surface-variant" aria-hidden />
                {selectedTask.estimateHours} h estimate
              </li>
            )}
            <li className="flex items-center gap-2">
              <ListChecks className="size-4 shrink-0 text-on-surface-variant" aria-hidden />
              {selectedTask.acceptanceCriteria.length} acceptance{" "}
              {selectedTask.acceptanceCriteria.length === 1 ? "criterion" : "criteria"}
            </li>
            {selectedTask.prerequisiteTitles.length > 0 && (
              <li className="flex items-center gap-2">
                <Link2 className="size-4 shrink-0 text-on-surface-variant" aria-hidden />
                {selectedTask.prerequisiteTitles.length} prerequisite
                {selectedTask.prerequisiteTitles.length !== 1 ? "s" : ""}
              </li>
            )}
            {selectedTask.dependentTitles.length > 0 && (
              <li className="flex items-center gap-2">
                <GitBranch className="size-4 shrink-0 text-on-surface-variant" aria-hidden />
                {selectedTask.dependentTitles.length} dependent task
                {selectedTask.dependentTitles.length !== 1 ? "s" : ""}
              </li>
            )}
          </ul>

          {detailLoading && (
            <p className="mt-3 flex items-center gap-2 text-label-sm text-on-surface-variant">
              <Loader2 className="size-3.5 animate-spin" aria-hidden /> Loading full context…
            </p>
          )}

          {blocker && (
            <div className="mt-3 rounded-2xl bg-error-container/50 p-3 ring-1 ring-error/25">
              <p className="flex items-start gap-1.5 text-label-md font-medium text-on-error-container">
                <OctagonAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> Blocker: {blocker.title}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <SeverityChip severity={blocker.severity} />
                <BlockerStatusChip status={blocker.status} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mode picker */}
      <div className="rounded-[24px] bg-card p-5 shadow-xs ring-1 ring-border">
        <h2 className="text-title-sm font-semibold">What do you need?</h2>
        <p className="mb-3 mt-0.5 text-label-sm text-on-surface-variant">One mode is active at a time.</p>
        <div role="radiogroup" aria-label="Assistant mode" className="space-y-1.5">
          {ASSISTANT_MODES.map((spec) => {
            const Icon = MODE_ICONS[spec.id];
            const active = mode === spec.id;
            return (
              <button
                key={spec.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onModeChange(spec.id)}
                className={cn(
                  "flex min-h-11 w-full items-start gap-3 rounded-2xl px-3.5 py-3 text-left outline-none transition-all duration-200 ease-m3 focus-visible:ring-[3px] focus-visible:ring-primary/40",
                  active ? "bg-secondary shadow-xs ring-1 ring-primary/30" : "hover:bg-surface-container-high"
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl",
                    active ? "bg-primary/15 text-primary" : "bg-surface-container-high text-on-surface-variant"
                  )}
                >
                  <Icon className="size-[18px]" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className={cn("block text-label-lg font-medium", active && "text-primary")}>{spec.label}</span>
                  <span className="mt-0.5 block text-label-sm text-on-surface-variant">{spec.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */

export default function AssistantPage() {
  const route = useHashRoute();
  const taskParam = route.query.get("task");

  const { data: session } = useSession();
  const { data: tasksData, isLoading: tasksLoading } = useMyTasks();
  const tasks = React.useMemo(() => tasksData ?? [], [tasksData]);

  const [selectedId, setSelectedId] = React.useState<string | null>(taskParam);
  const { data: taskDetail, isLoading: detailLoading } = useTask(selectedId ?? "");

  const [mode, setMode] = React.useState<AssistantMode>("decompose");
  const [thread, setThread] = React.useState<UiTurn[]>([]);
  const [draft, setDraft] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [failure, setFailure] = React.useState<FailureState | null>(null);
  const [railOpen, setRailOpen] = React.useState(false);

  const threadScrollRef = React.useRef<HTMLDivElement>(null);
  const setDraftBlocker = useUiStore((s) => s.setDraftBlocker);

  const activeMode = React.useMemo(() => ASSISTANT_MODES.find((d) => d.id === mode) ?? ASSISTANT_MODES[0], [mode]);

  /* Keep the selection in sync with ?task= deep links. */
  React.useEffect(() => {
    if (taskParam) setSelectedId(taskParam);
  }, [taskParam]);

  /* Drop a selection that isn't one of MY tasks (e.g. a stale/crafted link). */
  React.useEffect(() => {
    if (tasksData && selectedId && !tasksData.some((t) => t.id === selectedId)) setSelectedId(null);
  }, [tasksData, selectedId]);

  const selectedTask = React.useMemo(() => tasks.find((t) => t.id === selectedId) ?? null, [tasks, selectedId]);

  const taskCtx: AssistantTaskContext | null = React.useMemo(() => {
    const base = (taskDetail as MyTask | undefined) ?? selectedTask;
    if (!base) return null;
    return {
      id: base.id,
      title: base.title,
      description: base.description,
      status: base.status,
      priority: base.priority,
      estimateHours: base.estimateHours,
      dueDate: base.dueDate,
      skills: base.skills,
      acceptanceCriteria: base.acceptanceCriteria,
      workflowName: base.workflowName,
      prerequisiteTitles: base.prerequisiteTitles,
      dependentTitles: base.dependentTitles,
      blocker: taskDetail?.blocker
        ? { title: taskDetail.blocker.title, severity: String(taskDetail.blocker.severity), status: String(taskDetail.blocker.status) }
        : null,
    };
  }, [taskDetail, selectedTask]);

  /* Keep the thread scrolled to the newest turn. */
  React.useEffect(() => {
    const el = threadScrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
  }, [thread.length, pending, failure]);

  const runRequest = React.useCallback(
    async (turns: UiTurn[], requestMode: AssistantMode) => {
      setPending(true);
      setFailure(null);
      try {
        const res = await requestAssistantHelp(
          {
            mode: requestMode,
            messages: turns.map((t) => ({ role: t.role, content: t.content })),
            task: taskCtx,
          },
          session?.token ?? null
        );
        setThread([...turns, { role: "assistant", content: res.content, mode: res.mode }]);
      } catch (err) {
        setFailure({ message: errMessage(err, "The assistant request failed. Please try again."), mode: requestMode, turns });
      } finally {
        setPending(false);
      }
    },
    [taskCtx, session?.token]
  );

  const send = () => {
    const prompt = draft.trim();
    if (!prompt || pending) return;
    const turns: UiTurn[] = [...thread, { role: "user", content: prompt }];
    setThread(turns);
    setDraft("");
    void runRequest(turns, mode);
  };

  const retry = () => {
    if (!failure || pending) return;
    void runRequest(failure.turns, failure.mode);
  };

  const newConversation = () => {
    setThread([]);
    setFailure(null);
  };

  /** Explicit, user-initiated hand-off: prefill the Report blocker dialog. */
  const handOffToBlockerReport = (turn: UiTurn) => {
    if (!taskCtx || taskCtx.status === "done") return;
    const title = blockerTitle(turn.content, taskCtx.title);
    const description = blockerSection(turn.content) ?? turn.content;
    setDraftBlocker({ taskId: taskCtx.id, taskTitle: taskCtx.title, title, description, severity: "high" });
    navigate(`/tasks/${taskCtx.id}`);
  };

  /* ---------------- Render ---------------- */

  if (!session) {
    return (
      <MotionConfig reducedMotion="user">
        <PageHeader title="AI Work Assistant" />
        <ErrorState
          title="You're signed out"
          message="Sign in again to use the AI Work Assistant. Nothing you drafted here is stored."
        />
      </MotionConfig>
    );
  }

  const rail = (
    <TaskContextPanel
      tasks={tasks}
      tasksLoading={tasksLoading}
      selectedId={selectedId}
      onSelect={(id) => setSelectedId(id)}
      selectedTask={selectedTask}
      detail={(taskDetail as MyTask | undefined) ?? null}
      detailLoading={detailLoading}
      mode={mode}
      onModeChange={setMode}
    />
  );

  return (
    <MotionConfig reducedMotion="user">
      <div>
        <PageHeader
          title="AI Work Assistant"
          description="Drafting help grounded in your own tasks — decompose work, plan your week, draft docs, generate test cases and more. Everything is a draft you review."
          actions={<Chip tone="warning">Deferred — no backend contract</Chip>}
        />

        {/* Honest deferral notice: the assistant's backend (previously a
            first-party AI route) was removed with the Next.js → Vite
            migration and the shared FastAPI contract has no assistant
            endpoint yet. The screen stays explorable; generation fails with
            this explanation instead of producing fabricated output. */}
        <div className="mb-5 flex items-start gap-2.5 rounded-2xl bg-warning-container/60 p-4 text-label-md text-on-warning-container" role="note">
          <Hourglass className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{ASSISTANT_DEFERRED_MESSAGE} The modes and task context below preview the intended experience — requests will return this notice until the shared backend defines its assistant API.</span>
        </div>

        <div className="flex flex-col gap-5 lg:flex-row lg:gap-6">
          {/* Mobile context rail */}
          <div className="lg:hidden">
            <Collapsible open={railOpen} onOpenChange={setRailOpen}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex min-h-11 w-full items-center justify-between rounded-[24px] bg-card px-5 py-3 text-left shadow-xs ring-1 ring-border outline-none transition-colors duration-200 ease-m3 hover:bg-surface-container-low/60 focus-visible:ring-[3px] focus-visible:ring-primary/40"
                >
                  <span className="flex items-center gap-2 text-title-sm font-semibold">
                    <ListChecks className="size-5 text-primary" aria-hidden /> Task context
                  </span>
                  <ChevronDown
                    className={cn(
                      "size-5 text-on-surface-variant transition-transform duration-200 ease-m3",
                      railOpen && "rotate-180"
                    )}
                    aria-hidden
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-4">{rail}</div>
              </CollapsibleContent>
            </Collapsible>
          </div>

          {/* Desktop context rail */}
          <aside className="hidden w-[320px] shrink-0 lg:block" aria-label="Task context">
            {rail}
          </aside>

          {/* Conversation */}
          <section aria-label="Assistant conversation" className="min-w-0 flex-1">
            {/* Guardrails — shown once, up top */}
            <div className="mb-4 flex items-start gap-2.5 rounded-2xl bg-secondary-container/60 p-3.5 text-on-secondary-container ring-1 ring-secondary/40">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p className="text-label-md">
                <span className="font-semibold">Drafts only —</span> the assistant never changes task statuses, reassigns
                teammates, or approves recovery plans.
              </p>
            </div>

            {/* Thread */}
            <div
              ref={threadScrollRef}
              role="log"
              aria-live="polite"
              aria-label="Assistant conversation"
              className="max-h-[62vh] min-h-[300px] overflow-y-auto pr-1 scrollbar-slim lg:max-h-[calc(100vh-360px)]"
            >
              {thread.length === 0 && !pending && !failure ? (
                <EmptyThreadIntro mode={mode} onModeChange={setMode} hasTasks={tasks.length > 0} />
              ) : (
                <ul className="space-y-4">
                  {thread.map((turn, i) =>
                    turn.role === "user" ? (
                      <motion.li
                        key={`u-${i}`}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25, ease: EASE_M3 }}
                        className="flex justify-end"
                      >
                        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-[24px] bg-secondary px-4 py-3 text-label-lg text-secondary-foreground sm:max-w-[75%]">
                          {turn.content}
                        </div>
                      </motion.li>
                    ) : (
                      <motion.li
                        key={`a-${i}`}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, ease: EASE_M3 }}
                      >
                        <div className="max-w-3xl rounded-[24px] bg-card p-5 shadow-xs ring-1 ring-border">
                          <div className="mb-2 flex items-center gap-2 text-label-sm text-on-surface-variant">
                            <Sparkles className="size-4 text-primary" aria-hidden />
                            <span>{modeLabel(turn.mode)}</span>
                          </div>
                          <MarkdownLite content={turn.content} />
                          <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-border/70 pt-3">
                            <Chip tone="info">
                              <Info className="size-3.5" aria-hidden /> AI draft — review before use
                            </Chip>
                            <CopyButton text={turn.content} />
                            <DownloadButton content={turn.content} mode={turn.mode} />
                            {turn.mode === "progress" && taskCtx && taskCtx.status !== "done" && (
                              <M3Button
                                variant="tonal"
                                size="sm"
                                className="ml-auto"
                                onClick={() => handOffToBlockerReport(turn)}
                              >
                                <ClipboardList className="size-4" aria-hidden /> Use in blocker report
                              </M3Button>
                            )}
                          </div>
                          {turn.mode === "progress" && taskCtx && taskCtx.status !== "done" && (
                            <p className="mt-2 text-label-sm text-on-surface-variant">
                              Prefills the report dialog — you still review and submit.
                            </p>
                          )}
                        </div>
                      </motion.li>
                    )
                  )}

                  {pending && (
                    <motion.li
                      key="pending"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, ease: EASE_M3 }}
                    >
                      <div className="max-w-3xl rounded-[24px] bg-card p-5 shadow-xs ring-1 ring-border">
                        <div className="flex items-center gap-3">
                          <span className="flex items-end gap-1" aria-hidden>
                            <span className="size-2 animate-bounce rounded-full bg-primary/70" />
                            <span className="size-2 animate-bounce rounded-full bg-primary/70" style={{ animationDelay: "150ms" }} />
                            <span className="size-2 animate-bounce rounded-full bg-primary/70" style={{ animationDelay: "300ms" }} />
                          </span>
                          <p className="text-label-lg text-on-surface-variant" aria-live="polite">
                            Assistant is drafting…
                          </p>
                        </div>
                      </div>
                    </motion.li>
                  )}

                  {failure && (
                    <motion.li
                      key="failure"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, ease: EASE_M3 }}
                    >
                      <div role="alert" className="max-w-3xl rounded-[24px] bg-error-container/60 p-5 ring-1 ring-error/30">
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-on-error-container" aria-hidden />
                          <div className="min-w-0 flex-1">
                            <p className="text-title-sm font-semibold text-on-error-container">
                              The assistant couldn&apos;t respond
                            </p>
                            <p className="mt-1 text-label-lg text-on-surface-variant">{failure.message}</p>
                            <p className="mt-1 text-label-sm text-on-surface-variant">
                              Your message is still in the thread — retrying won&apos;t duplicate it.
                            </p>
                            <M3Button
                              variant="outlined"
                              size="sm"
                              className="mt-3"
                              onClick={retry}
                              disabled={pending}
                            >
                              <RotateCcw className="size-4" aria-hidden /> Retry
                            </M3Button>
                          </div>
                        </div>
                      </div>
                    </motion.li>
                  )}
                </ul>
              )}
            </div>

            {/* Composer */}
            <form
              className="mt-4"
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
            >
              <p className="mb-2 flex items-start gap-1.5 text-label-sm text-on-surface-variant">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                Responses come from a live AI service and may be wrong. Nothing is saved to the task automatically —
                everything here is a draft.
              </p>
              <TextArea
                label="Your prompt"
                placeholder={activeMode.placeholder}
                value={draft}
                rows={3}
                onChange={(e) => setDraft(e.target.value)}
              />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <M3Button
                  type="button"
                  variant="text"
                  onClick={newConversation}
                  disabled={thread.length === 0 && !failure}
                >
                  <RotateCcw className="size-4" aria-hidden /> New conversation
                </M3Button>
                <M3Button type="submit" loading={pending} disabled={!draft.trim() || pending}>
                  <Send className="size-[18px]" aria-hidden /> Send
                </M3Button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </MotionConfig>
  );
}

/* ------------------------------------------------------------------ */
/* Empty-thread intro                                                   */
/* ------------------------------------------------------------------ */

function EmptyThreadIntro({
  mode,
  onModeChange,
  hasTasks,
}: {
  mode: AssistantMode;
  onModeChange: (m: AssistantMode) => void;
  hasTasks: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE_M3 }}
      className="rounded-[24px] border border-dashed border-outline-variant bg-surface-container-low/60 p-5 sm:p-7"
    >
      <div className="flex items-start gap-3.5">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
          <Sparkles className="size-5 text-primary" aria-hidden />
        </span>
        <div>
          <h2 className="text-title-md font-semibold">Your AI work assistant</h2>
          <p className="mt-1 max-w-xl text-label-lg text-on-surface-variant">
            Pick a mode below and ask for help. Answers are grounded in the task you select in the context panel —{" "}
            <span className="font-medium text-foreground">select a task for grounded help</span>.
          </p>
        </div>
      </div>

      <ul className="mt-5 grid gap-2 sm:grid-cols-2">
        {ASSISTANT_MODES.map((spec) => {
          const Icon = MODE_ICONS[spec.id];
          const active = mode === spec.id;
          return (
            <li key={spec.id}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onModeChange(spec.id)}
                className={cn(
                  "flex min-h-11 h-full w-full items-start gap-3 rounded-2xl p-3.5 text-left outline-none transition-all duration-200 ease-m3 focus-visible:ring-[3px] focus-visible:ring-primary/40",
                  active ? "bg-secondary ring-1 ring-primary/30" : "bg-card ring-1 ring-border hover:bg-surface-container-high"
                )}
              >
                <Icon
                  className={cn("mt-0.5 size-[18px] shrink-0", active ? "text-primary" : "text-on-surface-variant")}
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className="block text-label-lg font-medium">{spec.label}</span>
                  <span className="mt-0.5 block text-label-sm text-on-surface-variant">{spec.description}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {!hasTasks && (
        <p className="mt-4 text-label-sm text-on-surface-variant">
          You don&apos;t have assigned tasks yet — you can still chat, but grounded context appears once work is
          allocated to you.
        </p>
      )}
    </motion.div>
  );
}
