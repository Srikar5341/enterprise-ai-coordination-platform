"use client";

/**
 * Recovery Center — overview of open blockers and recovery workflow cases.
 * Quick actions let a lead drive the recovery pipeline straight from the list;
 * clicking a case opens the flagship decision flow in the detail view.
 */
import * as React from "react";
import { formatDistanceToNow, parseISO } from "date-fns";
import {
  AlertTriangle, CheckCircle2, ClipboardList, GitBranch, History, Inbox,
  Radar, ShieldAlert, Sparkles, Users,
} from "lucide-react";
import {
  BlockerStatusChip, Chip, DemoDataBadge, EmptyState, ErrorState, M3Button,
  PageHeader, SeverityChip, SkeletonCards, StatCard,
} from "../primitives";
import { navigate } from "@/lib/router";
import {
  useRecoveryCases, useRequestAlternatives, useRequestAnalysis,
} from "@/lib/api/queries";
import type { RecoveryCase, RecoveryCaseStatus } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const CASE_STATUS_META: Record<RecoveryCaseStatus, { label: string; tone: "error" | "warning" | "info" | "primary" | "neutral" | "success"; icon: React.ElementType }> = {
  needs_analysis: { label: "Needs analysis", tone: "error", icon: AlertTriangle },
  analyzing: { label: "Analyzing", tone: "warning", icon: Radar },
  needs_decision: { label: "Decision needed", tone: "info", icon: ClipboardList },
  decided: { label: "Decided", tone: "primary", icon: CheckCircle2 },
  closed: { label: "Closed", tone: "success", icon: CheckCircle2 },
};

function CaseStatusChip({ status }: { status: RecoveryCaseStatus }) {
  const meta = CASE_STATUS_META[status];
  const Icon = meta.icon;
  return (
    <Chip tone={meta.tone}>
      <Icon className="size-3.5" aria-hidden />
      {meta.label}
    </Chip>
  );
}

/* ------------------------------------------------------------------ */
/* Case card                                                           */
/* ------------------------------------------------------------------ */

function RecoveryCaseCard({ item }: { item: RecoveryCase }) {
  const runAnalysis = useRequestAnalysis(item.id);
  const runAlternatives = useRequestAlternatives(item.id);

  const hasAnalysis = !!item.analysis;
  const hasAlternatives = !!item.alternatives && item.alternatives.length > 0;

  const quickAction = (() => {
    if (item.decision || item.status === "decided") {
      return (
        <M3Button
          variant="tonal"
          size="sm"
          onClick={(e) => { e.stopPropagation(); navigate(`/recovery/${item.id}`); }}
        >
          <History className="size-4" aria-hidden /> View outcome
        </M3Button>
      );
    }
    if (item.status === "closed") {
      return (
        <M3Button
          variant="text"
          size="sm"
          onClick={(e) => { e.stopPropagation(); navigate(`/recovery/${item.id}`); }}
        >
          View case
        </M3Button>
      );
    }
    if (!hasAnalysis) {
      return (
        <M3Button
          size="sm"
          loading={runAnalysis.isPending}
          disabled={runAnalysis.isPending}
          onClick={(e) => { e.stopPropagation(); runAnalysis.mutate(item.blocker.id); }}
        >
          <Radar className="size-4" aria-hidden />
          {runAnalysis.isPending ? "Analyzing…" : "Run impact analysis"}
        </M3Button>
      );
    }
    if (!hasAlternatives) {
      return (
        <M3Button
          size="sm"
          loading={runAlternatives.isPending}
          disabled={runAlternatives.isPending}
          onClick={(e) => { e.stopPropagation(); runAlternatives.mutate(item.analysisId!); }}
        >
          <Sparkles className="size-4" aria-hidden />
          {runAlternatives.isPending ? "Generating…" : "Generate alternatives"}
        </M3Button>
      );
    }
    return (
      <M3Button
        variant="tonal"
        size="sm"
        onClick={(e) => { e.stopPropagation(); navigate(`/recovery/${item.id}`); }}
      >
        <ClipboardList className="size-4" aria-hidden /> Review &amp; decide
      </M3Button>
    );
  })();

  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={`Recovery case: ${item.blocker.title} in ${item.workflowName}. Open details.`}
      onClick={() => navigate(`/recovery/${item.id}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(`/recovery/${item.id}`); }
      }}
      className={cn(
        "group flex cursor-pointer flex-col gap-4 rounded-[24px] bg-card p-5 ring-1 ring-border transition-all duration-200 ease-m3",
        "hover:shadow-md hover:ring-primary/30 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40"
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone="primary">
          <GitBranch className="size-3.5" aria-hidden />
          {item.workflowName}
        </Chip>
        <span className="ml-auto">
          <CaseStatusChip status={item.status} />
        </span>
      </div>

      <div className="min-w-0">
        <h3 className="text-title-md font-semibold leading-snug">{item.blocker.title}</h3>
        <p className="mt-1 line-clamp-2 text-label-md text-on-surface-variant">{item.blocker.description}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SeverityChip severity={item.blocker.severity} />
        <BlockerStatusChip status={item.blocker.status} />
        <Chip tone="outline">
          <AlertTriangle className="size-3.5" aria-hidden />
          Affected: {item.affectedTaskTitle}
        </Chip>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant/60 pt-3">
        <p className="flex items-center gap-1.5 text-label-sm text-on-surface-variant">
          <Users className="size-3.5" aria-hidden />
          Reported by {item.blocker.reportedByName} · {formatDistanceToNow(parseISO(item.blocker.reportedAt), { addSuffix: true })}
        </p>
        {quickAction}
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function RecoveryCenterPage() {
  const { data: cases, isLoading, isError, refetch } = useRecoveryCases();

  const list = cases ?? [];
  const activeBlockers = list.filter((c) => c.blocker.status !== "resolved").length;
  const affectedTasks = list.reduce((sum, c) => sum + (c.analysis?.downstreamTaskIds.length ?? 0), 0);
  const pendingDecisions = list.filter((c) => c.status === "needs_decision").length;
  const atRiskDeadlines = new Set(list.filter((c) => c.analysis).map((c) => c.workflowName)).size;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
      <PageHeader
        title="Recovery Center"
        description="When a blocker hits a plan, this is mission control: measure the blast radius, compare recovery alternatives, and apply the fix with full verification."
        actions={<DemoDataBadge />}
      />

      {/* Stat row */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-live="polite">
        <StatCard label="Active blockers" value={isLoading ? "—" : activeBlockers} sub="Across all workflows" icon={ShieldAlert} tone="error" />
        <StatCard label="Potentially affected tasks" value={isLoading ? "—" : affectedTasks} sub="Downstream of blocked work" icon={GitBranch} tone="warning" />
        <StatCard label="Pending recovery decisions" value={isLoading ? "—" : pendingDecisions} sub="Alternatives waiting on you" icon={ClipboardList} tone="info" />
        <StatCard label="At-risk deadlines" value={isLoading ? "—" : atRiskDeadlines} sub="Workflows with exposure" icon={AlertTriangle} tone="primary" />
      </div>

      {/* Cases */}
      <section aria-label="Recovery cases" aria-live="polite">
        <h2 className="mb-4 text-title-md font-semibold">Recovery cases</h2>

        {isLoading ? (
          <SkeletonCards count={3} />
        ) : isError ? (
          <ErrorState
            title="Couldn't load recovery cases"
            message="The recovery queue could not be fetched from the (mock) backend. Nothing was lost — retry when ready."
            onRetry={() => refetch()}
          />
        ) : list.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No open blockers — your plans are in motion"
            description="When a teammate reports a blocker on a task, a recovery case appears here automatically with an impact analysis."
            action={
              <M3Button variant="tonal" onClick={() => navigate("/overview")}>
                Go to Overview
              </M3Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {list.map((c) => (
              <RecoveryCaseCard key={c.id} item={c} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
