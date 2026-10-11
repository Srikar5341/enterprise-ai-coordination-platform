"use client";

/**
 * Risks — detected delivery risks across workflows, filterable by severity.
 * Color is always paired with an icon + text label (never color alone).
 */
import * as React from "react";
import { formatDistanceToNow, parseISO } from "date-fns";
import {
  Clock, ExternalLink, Funnel, GitBranch, Inbox, ListChecks, TriangleAlert,
} from "lucide-react";
import {
  Chip, DemoDataBadge, EmptyState, ErrorState, M3Button, PageHeader, SeverityChip, SkeletonTable,
} from "../primitives";
import { navigate } from "@/lib/router";
import { useRisks } from "@/lib/api/queries";
import type { RiskItem } from "@/lib/api/types";
import { cn } from "@/lib/utils";

type SeverityFilter = "all" | "critical" | "high" | "medium" | "low";

const LIKELIHOOD_META: Record<RiskItem["likelihood"], { label: string; tone: "neutral" | "info" | "warning" | "error" }> = {
  unlikely: { label: "Unlikely", tone: "neutral" },
  possible: { label: "Possible", tone: "info" },
  likely: { label: "Likely", tone: "warning" },
  almost_certain: { label: "Almost certain", tone: "error" },
};

const FILTERS: { key: SeverityFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "critical", label: "Critical" },
  { key: "high", label: "High" },
  { key: "medium", label: "Medium" },
  { key: "low", label: "Low" },
];

function RiskCard({ risk }: { risk: RiskItem }) {
  const likelihood = LIKELIHOOD_META[risk.likelihood];
  return (
    <article className="flex flex-col gap-3 rounded-[24px] bg-card p-5 ring-1 ring-border">
      <div className="flex flex-wrap items-center gap-2">
        <SeverityChip severity={risk.severity} />
        <Chip tone={likelihood.tone}>
          <TriangleAlert className="size-3.5" aria-hidden />
          Likelihood: {likelihood.label}
        </Chip>
        <span className="ml-auto text-label-sm text-on-surface-variant">
          Detected {formatDistanceToNow(parseISO(risk.detectedAt), { addSuffix: true })}
        </span>
      </div>

      <div className="min-w-0">
        <h3 className="text-title-md font-semibold leading-snug">{risk.title}</h3>
        <p className="mt-1 text-label-md text-on-surface-variant">{risk.description}</p>
      </div>

      <a
        href={`#/workflows/${risk.workflowId}`}
        className="inline-flex w-fit min-h-11 items-center rounded-full"
        aria-label={`Open workflow ${risk.workflowName}`}
      >
        <Chip tone="primary" className="hover:bg-secondary/80">
          <GitBranch className="size-3.5" aria-hidden />
          {risk.workflowName}
          <ExternalLink className="size-3.5" aria-hidden />
        </Chip>
      </a>

      {risk.deadlineExposure && (
        <div className="flex items-start gap-2.5 rounded-2xl bg-warning-container p-3.5 text-label-md text-on-warning-container">
          <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span><span className="font-semibold">Deadline exposure:</span> {risk.deadlineExposure}</span>
        </div>
      )}

      {risk.factors.length > 0 && (
        <div>
          <p className="mb-2 text-label-md font-medium">Contributing factors</p>
          <ul className="space-y-1.5 text-label-md">
            {risk.factors.map((f, i) => (
              <li key={i} className="flex items-start gap-2">
                <ListChecks className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

export default function RisksPage() {
  const { data: risks, isLoading, isError, refetch } = useRisks();
  const [filter, setFilter] = React.useState<SeverityFilter>("all");

  const list = risks ?? [];
  const filtered = filter === "all" ? list : list.filter((r) => r.severity === filter);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:py-8">
      <PageHeader
        title="Risks"
        description="Risks detected from plan structure, workload and dependencies — reviewed, not auto-mitigated."
        actions={<DemoDataBadge />}
      />

      {/* Severity filter */}
      <div className="mb-6 flex flex-wrap items-center gap-2" role="group" aria-label="Filter risks by severity">
        <Funnel className="size-4 text-on-surface-variant" aria-hidden />
        {FILTERS.map((f) => {
          const pressed = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={pressed}
              onClick={() => setFilter(f.key)}
              className={cn(
                "min-h-11 rounded-full px-4 text-label-md font-medium transition-all duration-200 ease-m3 outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40 active:scale-95",
                pressed
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest"
              )}
            >
              {f.label}
              {f.key !== "all" && (
                <span className="ml-1.5 opacity-70">
                  {list.filter((r) => r.severity === f.key).length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <section aria-label="Risk register" aria-live="polite">
        {isLoading ? (
          <SkeletonTable rows={4} cols={3} />
        ) : isError ? (
          <ErrorState message="The risk register could not be loaded." onRetry={() => refetch()} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={list.length === 0 ? "No risks detected" : "No risks at this severity"}
            description={
              list.length === 0
                ? "Risks appear here when deadlines, workloads or dependencies look fragile."
                : "Try a different severity filter to see the rest of the register."
            }
            action={list.length > 0 ? (
              <M3Button variant="tonal" onClick={() => setFilter("all")}>Show all risks</M3Button>
            ) : (
              <M3Button variant="tonal" onClick={() => navigate("/recovery")}>Open Recovery Center</M3Button>
            )}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {filtered.map((r) => (
              <RiskCard key={r.id} risk={r} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
