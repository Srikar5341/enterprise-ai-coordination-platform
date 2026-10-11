"use client";

/**
 * Team lead — create a workflow.
 * On success the user lands on the plan review page where Renova proposes
 * a task plan (generation is the next explicit step there, never automatic).
 *
 * API mode (VITE_OPSPILOT_API_MODE=http): the goal is submitted to the
 * shared FastAPI backend (POST /projects/{project_id}/goals) using the
 * spec's GoalCreateRequest { title (required, 3–255), description?,
 * target_date (required, UTC, future) } — so http mode shows an explicit
 * "Goal title" field and maps the long-form text to the description. The
 * returned id is the backend goal id. Inputs without a verified backend
 * representation (team-member selection) are hidden rather than silently
 * dropped.
 */
import * as React from "react";
import { format } from "date-fns";
import { AlertTriangle, Loader2, PlugZap, Sparkles } from "lucide-react";
import { navigate } from "@/lib/router";
import { API_BASE_URL, API_MODE, DEMO_PROJECT_ID } from "@/lib/api/client";
import { useCreateWorkflow, useTeam } from "@/lib/api/queries";
import {
  Avatar,
  Chip,
  M3Button,
  PageHeader,
  TextArea,
  TextField,
} from "@/components/opspilot/primitives";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

function errMsg(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export default function CreateWorkflowPage() {
  const teamQ = useTeam();
  const create = useCreateWorkflow();
  const liveApi = API_MODE === "http";

  const team = teamQ.data ?? [];
  const todayStr = format(new Date(), "yyyy-MM-dd");

  const [title, setTitle] = React.useState("");
  const [goal, setGoal] = React.useState("");
  const [targetDate, setTargetDate] = React.useState("");
  const [context, setContext] = React.useState("");
  /* null = "user hasn't touched the picker yet" → default to the first four members */
  const [selected, setSelected] = React.useState<string[] | null>(null);
  const [errors, setErrors] = React.useState<{ title?: string; goal?: string; target?: string }>({});

  const effectiveSelected = selected ?? team.slice(0, 4).map((m) => m.id);

  function toggleMember(id: string) {
    setSelected((prev) => {
      const base = prev ?? team.slice(0, 4).map((m) => m.id);
      return base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: { title?: string; goal?: string; target?: string } = {};
    if (liveApi) {
      /* Backend GoalCreateRequest.title is required (3–255 chars). */
      const t = title.trim();
      if (t.length < 3 || t.length > 255) {
        next.title = "A short title is required by the backend (3–255 characters).";
      }
    }
    if (goal.trim().length < 12) {
      next.goal = "Describe the goal in at least 12 characters so Renova can plan accurately.";
    }
    if (!targetDate) {
      next.target = "Pick a target date for this workflow.";
    } else if (targetDate < todayStr) {
      next.target = "The target date must be today or later.";
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    create.mutate(
      {
        title: liveApi ? title.trim() : undefined,
        goal: goal.trim(),
        targetDate,
        context: context.trim() || undefined,
        memberIds: effectiveSelected,
      },
      { onSuccess: (res) => navigate(`/workflows/${res.workflowId}/plan`) }
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[{ label: "Workflows", href: "#/workflows" }, { label: "New workflow" }]}
        title="Create a workflow"
        description="Describe the outcome you need and pick who can work on it. Renova takes it from there."
        actions={liveApi ? (
          <Chip tone="info" title={`Goals are submitted to the Renova backend at ${API_BASE_URL}`}>
            <PlugZap className="size-3.5" aria-hidden /> API-connected
          </Chip>
        ) : undefined}
      />

      {liveApi && (
        <div className="flex items-start gap-2.5 rounded-2xl bg-info-container/60 p-4 text-label-md text-on-info-container" role="note">
          <PlugZap className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            API mode: this goal is submitted to the Renova backend at <code className="font-mono text-[0.9em]">{API_BASE_URL}</code> as
            {" "}<code className="font-mono text-[0.9em]">POST /projects/&#123;project_id&#125;/goals</code>. Plan generation and approval go
            through the backend and require a provisioned API session.
            {!DEMO_PROJECT_ID && (
              <strong className="mt-1 block">
                Configuration blocker: no project id is set (VITE_OPSPILOT_DEMO_PROJECT_ID) — goal submission will be rejected until the
                backend owner provisions one.
              </strong>
            )}
          </span>
        </div>
      )}

      <form onSubmit={submit} className="mx-auto w-full max-w-4xl" noValidate>
        <div className="relative">
          {/* Full-card loading state while the mutation runs */}
          {create.isPending && (
            <div
              className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-[24px] bg-card/85 backdrop-blur-sm"
              role="status"
              aria-live="polite"
            >
              <Loader2 className="size-6 animate-spin text-primary" aria-hidden />
              <p className="text-label-lg text-on-surface-variant">
                {liveApi ? "Submitting goal to the Renova API…" : "Creating workflow…"}
              </p>
            </div>
          )}

          <section className="flex flex-col gap-7 rounded-[24px] bg-card p-5 shadow-xs ring-1 ring-border md:p-8">
            {/* Goal title — required by the backend's GoalCreateRequest (http mode only;
               the mock adapter names the workflow from the goal text). */}
            {liveApi && (
              <TextField
                label="Goal title"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                error={errors.title}
                placeholder="e.g. Ship payments reconciliation"
                hint="A short label (3–255 characters) the backend stores for this goal."
                autoFocus
              />
            )}

            {/* Goal */}
            <TextField
              label={liveApi ? "Goal description" : "Goal"}
              required
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              error={errors.goal}
              placeholder="e.g. Ship the payments reconciliation module to production by month end"
              hint={liveApi ? "Sent to the backend as the goal's detailed context (description)." : "Renova plans from this — the more concrete the outcome, the better the plan."}
              autoFocus={!liveApi}
            />

            {/* Target date */}
            <TextField
              label="Target date"
              required
              type="date"
              min={todayStr}
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              error={errors.target}
              hint="When should this be done?"
            />

            {/* Context */}
            <TextArea
              label="Context & constraints (optional)"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Dependencies, deadlines, environments, vendor constraints, team commitments…"
              hint="Anything the plan should respect."
            />

            {/* Team members */}
            <fieldset>
              <legend className="mb-1.5 text-label-md font-medium">
                Team members <span className="text-error" aria-hidden>*</span>
              </legend>

              {liveApi ? (
                /* No team surface exists in the verified backend contract yet —
                   hide the picker instead of silently dropping the input. */
                <p className="rounded-2xl bg-surface-container-low/70 px-4 py-3 text-label-md text-on-surface-variant">
                  Team selection isn&apos;t part of the backend contract yet — work is matched to teammates after the proposal is approved.
                </p>
              ) : (
                <>
                  <p className="mb-3 text-label-sm text-on-surface-variant">
                    Who can work on this? Renova matches proposed tasks to skills and capacity.
                  </p>

                  {teamQ.isLoading ? (
                <div className="flex items-center justify-center gap-3 py-8 text-label-lg text-on-surface-variant" role="status">
                  <Loader2 className="size-5 animate-spin text-primary" aria-hidden /> Loading team…
                </div>
              ) : teamQ.isError ? (
                <p role="alert" className="rounded-2xl bg-error-container/60 p-4 text-label-md text-on-error-container">
                  Could not load the team. {errMsg(teamQ.error, "")}{" "}
                  <button type="button" onClick={() => teamQ.refetch()} className="font-semibold underline underline-offset-4">
                    Retry
                  </button>
                </p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {team.map((m) => {
                    const checked = effectiveSelected.includes(m.id);
                    const free = Math.round(m.weeklyCapacityHours * m.availability - m.allocatedHours);
                    return (
                      <li key={m.id}>
                        <label
                          className={cn(
                            "flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border p-3.5 outline-none transition-all duration-200 ease-m3",
                            checked ? "border-primary/40 bg-secondary/50" : "border-outline-variant hover:bg-surface-container-low",
                            "focus-within:ring-[3px] focus-within:ring-primary/40"
                          )}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleMember(m.id)}
                            aria-label={`Include ${m.name} in the workflow`}
                            className="mt-0.5"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <Avatar name={m.name} accent={m.accent} className="size-8 shrink-0" />
                              <span className="min-w-0">
                                <span className="block truncate text-label-md font-semibold">{m.name}</span>
                                <span className="block truncate text-label-sm text-on-surface-variant">{m.title}</span>
                              </span>
                            </span>
                            <span className="mt-2 flex flex-wrap gap-1">
                              {m.skills.slice(0, 3).map((s) => (
                                <Chip key={s.name} tone="outline" className="px-2 py-0.5 text-[11px]">
                                  {s.name} · L{s.level}
                                </Chip>
                              ))}
                            </span>
                            <span className="mt-2 block text-label-sm text-on-surface-variant">
                              {free >= 0
                                ? `${free}h free of ${Math.round(m.weeklyCapacityHours * m.availability)}h this week`
                                : "Fully booked this week"}
                              {m.availability < 1 && ` · ${Math.round(m.availability * 100)}% availability`}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                  )}
                </>
              )}
            </fieldset>

            {/* Server error inline alert */}
            {create.isError && (
              <div role="alert" className="flex items-start gap-2.5 rounded-2xl bg-error-container/70 p-4 text-label-md text-on-error-container">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>{errMsg(create.error, "Could not create the workflow.")}</span>
              </div>
            )}

            {/* What happens next */}
            <div className="flex items-start gap-3 rounded-2xl bg-info-container/60 p-4 text-on-info-container">
              <Sparkles className="mt-0.5 size-4.5 shrink-0" aria-hidden />
              <p className="text-label-md">
                {liveApi
                  ? "After you submit the goal, the backend generates a plan proposal. You review it here and approve or reject it — the backend records the decision."
                  : "After you create the workflow, Renova proposes a task plan based on the goal, context and team skills. You review and adjust it before anything is committed."}
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2">
              <M3Button type="submit" loading={create.isPending}>
                {liveApi ? "Submit goal" : "Create workflow"}
              </M3Button>
              <M3Button type="button" variant="text" onClick={() => navigate("/workflows")} disabled={create.isPending}>
                Cancel
              </M3Button>
            </div>
          </section>
        </div>
      </form>
    </div>
  );
}
