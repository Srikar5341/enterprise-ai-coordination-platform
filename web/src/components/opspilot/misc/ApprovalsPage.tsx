"use client";

/**
 * Approvals — the team lead's decision queue. Every case with generated
 * alternatives lands here until a decision is submitted; recently decided
 * cases show their verified outcome honestly (partial ≠ success).
 */
import * as React from "react";
import { formatDistanceToNow, parseISO } from "date-fns";
import {
  ArrowRight, CalendarClock, CheckCircle2, ClipboardList, GitBranch, Inbox,
  ShieldAlert, TriangleAlert, XCircle, Info, RefreshCw,
} from "lucide-react";
import {
  Chip, DemoDataBadge, EmptyState, ErrorState, M3Button, PageHeader, SkeletonCards, StatCard,
} from "../primitives";
import { navigate } from "@/lib/router";
import { useRecoveryCases } from "@/lib/api/queries";
import type { ApprovalDecision, RecoveryCase, VerificationStatus } from "@/lib/api/types";

const DECISION_META: Record<ApprovalDecision, { label: string; tone: "success" | "error" | "warning" }> = {
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Rejected", tone: "error" },
  returned_for_edit: { label: "Returned for edit", tone: "warning" },
};

const VERIFICATION_META: Record<VerificationStatus, { label: string; tone: "success" | "warning" | "error" | "info"; icon: React.ElementType }> = {
  success: { label: "Verified — all changes applied", tone: "success", icon: CheckCircle2 },
  partial: { label: "Partially applied", tone: "warning", icon: TriangleAlert },
  failed: { label: "Failed", tone: "error", icon: XCircle },
  stale: { label: "Stale proposal", tone: "info", icon: RefreshCw },
  needs_attention: { label: "Needs attention", tone: "warning", icon: TriangleAlert },
};

function OutcomeChip({ item }: { item: RecoveryCase }) {
  if (item.verification) {
    const meta = VERIFICATION_META[item.verification.status];
    const Icon = meta.icon;
    return (
      <Chip tone={meta.tone}>
        <Icon className="size-3.5" aria-hidden />
        {meta.label}
      </Chip>
    );
  }
  // Honest fallback: a decision exists but verification hasn't reported yet.
  return (
    <Chip tone="neutral">
      <Info className="size-3.5" aria-hidden />
      Outcome pending verification
    </Chip>
  );
}

function QueueCard({ item }: { item: RecoveryCase }) {
  const altCount = item.alternatives?.length ?? 0;
  return (
    <article className="flex flex-col gap-4 rounded-[24px] bg-card p-5 ring-1 ring-border transition-all duration-200 ease-m3 hover:shadow-md">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone="primary">
          <GitBranch className="size-3.5" aria-hidden />
          {item.workflowName}
        </Chip>
        <span className="ml-auto flex items-center gap-1.5 text-label-sm text-on-surface-variant">
          <CalendarClock className="size-3.5" aria-hidden />
          Waiting {formatDistanceToNow(parseISO(item.createdAt), { addSuffix: true })}
        </span>
      </div>

      <div className="min-w-0">
        <h3 className="text-title-md font-semibold leading-snug">{item.blocker.title}</h3>
        <p className="mt-1 line-clamp-2 text-label-md text-on-surface-variant">{item.blocker.description}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Chip tone="outline">
          <ShieldAlert className="size-3.5" aria-hidden />
          Affected: {item.affectedTaskTitle}
        </Chip>
        <Chip tone="info">
          <ClipboardList className="size-3.5" aria-hidden />
          {altCount} alternative{altCount === 1 ? "" : "s"} ready
        </Chip>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-outline-variant/60 pt-3">
        <p className="text-label-sm text-on-surface-variant">Reported by {item.blocker.reportedByName}</p>
        <M3Button size="sm" onClick={() => navigate(`/recovery/${item.id}`)}>
          Review
          <ArrowRight className="size-4" aria-hidden />
        </M3Button>
      </div>
    </article>
  );
}

function DecidedRow({ item }: { item: RecoveryCase }) {
  const decision = item.decision!;
  const dMeta = DECISION_META[decision.decision];
  return (
    <li className="flex flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-border sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate text-label-lg font-medium">{item.blocker.title}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-label-sm text-on-surface-variant">
          <span className="inline-flex items-center gap-1">
            <GitBranch className="size-3.5" aria-hidden />
            {item.workflowName}
          </span>
          · {decision.alternativeTitle} · decided {formatDistanceToNow(parseISO(decision.decidedAt), { addSuffix: true })}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={dMeta.tone}>{dMeta.label}</Chip>
        <OutcomeChip item={item} />
        <M3Button variant="text" size="sm" onClick={() => navigate(`/recovery/${item.id}`)}>
          Details
        </M3Button>
      </div>
    </li>
  );
}

export default function ApprovalsPage() {
  const { data: cases, isLoading, isError, refetch } = useRecoveryCases();

  const list = cases ?? [];
  const queue = list.filter((c) => c.status === "needs_decision");
  const decided = list
    .filter((c) => c.status === "decided" && c.decision)
    .sort((a, b) => (a.decision!.decidedAt < b.decision!.decidedAt ? 1 : -1));

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:py-8">
      <PageHeader
        title="Approvals"
        description="Recovery proposals waiting on a decision, and the verified outcome of everything already decided."
        actions={<DemoDataBadge />}
      />

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Awaiting decision" value={isLoading ? "—" : queue.length} sub="Proposals ready to review" icon={ClipboardList} tone="info" />
        <StatCard label="Decided" value={isLoading ? "—" : decided.length} sub="With verification outcomes" icon={CheckCircle2} tone="success" />
        <StatCard label="Partial applications" value={isLoading ? "—" : decided.filter((c) => c.verification?.status === "partial").length} sub="Need follow-up" icon={TriangleAlert} tone="warning" />
      </div>

      <section aria-label="Decision queue" aria-live="polite">
        <h2 className="mb-4 text-title-md font-semibold">Decision queue</h2>
        {isLoading ? (
          <SkeletonCards count={2} />
        ) : isError ? (
          <ErrorState message="The approval queue could not be loaded from the (mock) backend." onRetry={() => refetch()} />
        ) : queue.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="Nothing waiting on you"
            description="When recovery alternatives are generated for an open blocker, the proposal appears here for review."
            action={
              <M3Button variant="tonal" onClick={() => navigate("/recovery")}>
                Open Recovery Center
              </M3Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {queue.map((c) => (
              <QueueCard key={c.id} item={c} />
            ))}
          </div>
        )}
      </section>

      {decided.length > 0 && (
        <section aria-label="Recently decided" className="mt-10">
          <h2 className="mb-4 text-title-md font-semibold">Recently decided</h2>
          <ul className="space-y-3">
            {decided.slice(0, 8).map((c) => (
              <DecidedRow key={c.id} item={c} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
