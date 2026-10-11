"use client";

/**
 * Recovery case detail — the flagship decision flow.
 * A 4-stage guided pipeline: impact analysis → recovery alternatives →
 * approval & decision → verification. The UI is deliberately honest:
 * estimates are labeled as estimates, partial application is never shown
 * as success, and duplicate submissions are impossible.
 */
import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import {
  AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, CircleCheck, ClipboardCheck,
  Clock, ExternalLink, GitBranch, Info, ListChecks, Loader2, Lock, Radar,
  RefreshCw, ShieldAlert, Sparkles, Star, TriangleAlert, Users, XCircle, Zap,
} from "lucide-react";
import {
  Avatar, BlockerStatusChip, Chip, ConfirmDialog, DemoDataBadge,
  ErrorState, M3Button, PageHeader, SeverityChip, TextArea,
} from "../primitives";
import { navigate } from "@/lib/router";
import {
  useDecideProposal, useRecoveryCase, useRequestAlternatives, useRequestAnalysis,
  useTeam, useVerification,
} from "@/lib/api/queries";
import type {
  ApprovalDecision, RecoveryAlternative, RecoveryDecision,
  VerificationStatus,
} from "@/lib/api/types";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

const M3_EASE = [0.2, 0, 0, 1] as const;

function fmtDays(n: number): string {
  const abs = Math.abs(n);
  const num = Number.isInteger(abs) ? `${abs}` : abs.toFixed(1);
  return `${num} ${abs === 1 ? "day" : "days"}`;
}

function timeAgo(iso: string): string {
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true });
  } catch {
    return iso;
  }
}

function delayChipMeta(v: number): { tone: "success" | "neutral" | "warning"; label: string } {
  if (v < 0) return { tone: "success", label: `Recovers ${fmtDays(v)}` };
  if (v === 0) return { tone: "neutral", label: "No schedule change" };
  return { tone: "warning", label: `Adds ~${fmtDays(v)} delay` };
}

function blastTone(v: number): { color: string; label: string } {
  if (v >= 90) return { color: "var(--error)", label: "Severe impact (estimate)" };
  if (v >= 70) return { color: "var(--error)", label: "High impact (estimate)" };
  if (v >= 40) return { color: "var(--warning)", label: "Moderate impact (estimate)" };
  return { color: "var(--success)", label: "Low impact (estimate)" };
}

const DECISION_STATUS_META: Record<RecoveryDecision["status"], { label: string; tone: "success" | "warning" | "error" | "info" | "neutral"; pulse?: boolean }> = {
  pending: { label: "Pending", tone: "warning" },
  processing: { label: "Processing", tone: "info", pulse: true },
  applied: { label: "Applied", tone: "success" },
  partially_applied: { label: "Partially applied", tone: "warning" },
  failed: { label: "Failed", tone: "error" },
  stale: { label: "Stale", tone: "neutral" },
};

function DecisionStatusChip({ status }: { status: RecoveryDecision["status"] }) {
  const meta = DECISION_STATUS_META[status];
  return (
    <Chip tone={meta.tone} className={meta.pulse ? "animate-pulse-soft" : undefined}>
      {status === "applied" ? <CircleCheck className="size-3.5" aria-hidden /> : <Clock className="size-3.5" aria-hidden />}
      {meta.label}
    </Chip>
  );
}

function verificationBannerMeta(status: VerificationStatus): {
  tone: "success" | "warning" | "error" | "info";
  icon: React.ElementType;
  title: string;
} {
  switch (status) {
    case "success":
      return { tone: "success", icon: CheckCircle2, title: "All changes applied and verified" };
    case "partial":
      return { tone: "warning", icon: TriangleAlert, title: "Partially applied — review unresolved issues" };
    case "failed":
      return { tone: "error", icon: XCircle, title: "Application failed — the plan was left unchanged where possible" };
    case "stale":
      return { tone: "info", icon: RefreshCw, title: "Stale proposal — plan moved on since approval" };
    case "needs_attention":
      return { tone: "warning", icon: AlertTriangle, title: "Needs attention — no changes were applied" };
  }
}

const BANNER_TONES = {
  success: "bg-success-container text-on-success-container",
  warning: "bg-warning-container text-on-warning-container",
  error: "bg-error-container text-on-error-container",
  info: "bg-info-container text-on-info-container",
} as const;

function StatusBanner({ tone, icon: Icon, title, children, className }: {
  tone: keyof typeof BANNER_TONES; icon: React.ElementType; title: string; children?: React.ReactNode; className?: string;
}) {
  return (
    <div role="status" className={cn("flex items-start gap-3 rounded-2xl p-4", BANNER_TONES[tone], className)}>
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="min-w-0">
        <p className="text-label-lg font-semibold">{title}</p>
        {children && <div className="mt-1 text-label-md">{children}</div>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Blast radius meter                                                  */
/* ------------------------------------------------------------------ */

function BlastRadiusMeter({ value }: { value: number }) {
  const reduce = useReducedMotion();
  const R = 50;
  const LEN = Math.PI * R;
  const tone = blastTone(value);
  return (
    <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-center sm:gap-6">
      <div
        role="img"
        aria-label={`Blast radius ${value} out of 100 — ${tone.label}`}
        className="relative shrink-0"
      >
        <svg viewBox="0 0 120 68" width="200" height="114" aria-hidden>
          <path
            d={`M 10 60 A ${R} ${R} 0 0 1 110 60`}
            fill="none" stroke="var(--surface-container-high)" strokeWidth="11" strokeLinecap="round"
          />
          <motion.path
            d={`M 10 60 A ${R} ${R} 0 0 1 110 60`}
            fill="none" stroke={tone.color} strokeWidth="11" strokeLinecap="round"
            strokeDasharray={LEN}
            initial={{ strokeDashoffset: reduce ? LEN * (1 - value / 100) : LEN }}
            animate={{ strokeDashoffset: LEN * (1 - value / 100) }}
            transition={{ duration: reduce ? 0 : 0.9, ease: M3_EASE }}
          />
          <text x="60" y="54" textAnchor="middle" fontSize="26" fontWeight="700" fill="var(--foreground)">
            {value}
          </text>
        </svg>
      </div>
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-title-md font-semibold">
          <AlertTriangle className="size-5" style={{ color: tone.color }} aria-hidden />
          {value} — {tone.label}
        </p>
        <Chip tone="info" className="mt-2">
          <Info className="size-3.5" aria-hidden />
          Blast radius estimate — an impact heuristic, NOT a probability
        </Chip>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stage scaffolding                                                   */
/* ------------------------------------------------------------------ */

interface StageDef {
  n: number;
  title: string;
  hint: string;
  done: boolean;
}

function StageRailBadge({ stage, isCurrent }: { stage: StageDef; isCurrent: boolean }) {
  if (stage.done) {
    return (
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-success-container text-on-success-container" aria-hidden>
        <CheckCircle2 className="size-5" />
      </span>
    );
  }
  if (isCurrent) {
    return (
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-label-lg font-bold text-primary-foreground" aria-hidden>
        {stage.n}
      </span>
    );
  }
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant" aria-hidden>
      <Lock className="size-4" />
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Alternative card                                                    */
/* ------------------------------------------------------------------ */

function AssignmentChangeRow({ change, accentFor }: {
  change: RecoveryAlternative["assignmentChanges"][number];
  accentFor: (name: string) => string;
}) {
  return (
    <li className="flex items-start gap-2.5">
      <Avatar name={change.toMemberName} accent={accentFor(change.toMemberName)} className="size-7 text-label-sm" />
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-1.5 text-label-md font-medium">
          {change.fromMemberName ? (
            <>
              {change.fromMemberName}
              <ArrowRight className="size-3.5 text-on-surface-variant" aria-hidden />
              {change.toMemberName}
            </>
          ) : (
            <>
              <span className="text-on-surface-variant">Add</span> {change.toMemberName}
            </>
          )}
        </p>
        <p className="mt-0.5 text-label-sm text-on-surface-variant">{change.reason}</p>
      </div>
    </li>
  );
}

function AlternativeCard({ alt, selected, onSelect, accentFor }: {
  alt: RecoveryAlternative;
  selected: boolean;
  onSelect: () => void;
  accentFor: (name: string) => string;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const delay = delayChipMeta(alt.estimatedDelayDays);
  const infeasible = !alt.skillFeasible || !alt.availabilityFeasible;

  return (
    <div
      role="radio"
      aria-checked={selected}
      tabIndex={0}
      aria-label={`${alt.title}${alt.label ? `, ${alt.label}` : ""}${alt.recommended ? ", recommended" : ""}`}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); }
      }}
      className={cn(
        "flex cursor-pointer flex-col rounded-[24px] bg-card p-5 ring-1 ring-border transition-all duration-200 ease-m3",
        "hover:shadow-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40",
        selected ? "ring-2 ring-primary shadow-sm" : "hover:ring-primary/30"
      )}
    >
      {/* Header acts as the radio label */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {alt.label && (
            <Chip tone={alt.label === "Fastest" ? "success" : alt.label === "Balanced" ? "primary" : "neutral"}>
              {alt.label}
            </Chip>
          )}
          {alt.recommended && (
            <Chip tone="primary">
              <Star className="size-3.5" aria-hidden /> Recommended
            </Chip>
          )}
        </div>
        <span
          aria-hidden
          className={cn(
            "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
            selected ? "border-primary bg-primary text-primary-foreground" : "border-outline-variant"
          )}
        >
          {selected && <CheckCircle2 className="size-4" />}
        </span>
      </div>

      <h4 className="mt-3 text-title-md font-semibold leading-snug">{alt.title}</h4>
      <p className="mt-1.5 text-label-md text-on-surface-variant">{alt.description}</p>

      <ul className="mt-4 space-y-2 text-label-md">
        <li className="flex items-start gap-2">
          <Clock className="mt-0.5 size-4 shrink-0 text-on-surface-variant" aria-hidden />
          <span>{alt.scheduleEffect}</span>
        </li>
        <li className="flex items-start gap-2">
          <Users className="mt-0.5 size-4 shrink-0 text-on-surface-variant" aria-hidden />
          <span>{alt.workloadImpact}</span>
        </li>
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Chip tone={delay.tone}>
          <Clock className="size-3.5" aria-hidden />
          {delay.label}
        </Chip>
        <Chip tone={alt.skillFeasible ? "success" : "error"}>
          {alt.skillFeasible ? <CheckCircle2 className="size-3.5" aria-hidden /> : <XCircle className="size-3.5" aria-hidden />}
          Skill {alt.skillFeasible ? "feasible" : "gap"}
        </Chip>
        <Chip tone={alt.availabilityFeasible ? "success" : "error"}>
          {alt.availabilityFeasible ? <CheckCircle2 className="size-3.5" aria-hidden /> : <XCircle className="size-3.5" aria-hidden />}
          Availability {alt.availabilityFeasible ? "OK" : "conflict"}
        </Chip>
      </div>

      {infeasible && (
        <div role="alert" className="mt-3 flex items-start gap-2 rounded-2xl bg-warning-container p-3 text-label-md text-on-warning-container">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>This option has feasibility gaps above — review before selecting it.</span>
        </div>
      )}

      {alt.assignmentChanges.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-label-md font-medium">Assignment changes</p>
          <ul className="space-y-2.5">
            {alt.assignmentChanges.map((ch, i) => (
              <AssignmentChangeRow key={`${ch.taskId}-${i}`} change={ch} accentFor={accentFor} />
            ))}
          </ul>
        </div>
      )}

      {(alt.risks.length > 0 || alt.assumptions.length > 0) && (
        <div className="mt-4 border-t border-outline-variant/60 pt-3">
          <button
            type="button"
            aria-expanded={expanded}
            onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
            onKeyDown={(e) => e.stopPropagation()}
            className="flex min-h-11 w-full items-center justify-between rounded-xl px-1 text-label-md font-medium text-primary transition-colors hover:bg-primary/8 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40"
          >
            Risks &amp; assumptions
            <ChevronDown className={cn("size-4 transition-transform duration-200", expanded && "rotate-180")} aria-hidden />
          </button>
          <AnimatePresence initial={false}>
            {expanded && (
              <motion.ul
                initial={reduceMotionOrSkip()}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2, ease: M3_EASE }}
                className="space-y-2 overflow-hidden px-1 pt-2 text-label-sm"
              >
                {alt.risks.map((r, i) => (
                  <li key={`r-${i}`} className="flex items-start gap-2 text-on-surface-variant">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
                    <span><span className="font-medium text-foreground">Risk:</span> {r}</span>
                  </li>
                ))}
                {alt.assumptions.map((a, i) => (
                  <li key={`a-${i}`} className="flex items-start gap-2 text-on-surface-variant">
                    <Info className="mt-0.5 size-3.5 shrink-0 text-info" aria-hidden />
                    <span><span className="font-medium text-foreground">Assumes:</span> {a}</span>
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function reduceMotionOrSkip() {
  return { opacity: 0, height: 0 };
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

type ConfirmKind = "approved" | "rejected" | null;

const STAGE_TITLES = ["Impact analysis", "Recovery alternatives", "Approval & decision", "Verification"] as const;

export default function RecoveryCaseDetailPage({ caseId }: { caseId: string }) {
  const { data: item, isLoading, isError, refetch } = useRecoveryCase(caseId);
  const { data: team } = useTeam();

  const runAnalysis = useRequestAnalysis(caseId);
  const runAlternatives = useRequestAlternatives(caseId);
  const decide = useDecideProposal(caseId);
  const verificationQuery = useVerification(item?.decision?.id);

  const [selectedAltId, setSelectedAltId] = React.useState<string | null>(null);
  const [comment, setComment] = React.useState("");
  const [confirmKind, setConfirmKind] = React.useState<ConfirmKind>(null);
  const [staleBanner, setStaleBanner] = React.useState(false);
  const [expandedDoneStages, setExpandedDoneStages] = React.useState<Record<number, boolean>>({});

  const reduce = useReducedMotion();

  /* Default-select the recommended alternative once alternatives exist */
  React.useEffect(() => {
    if (!item?.alternatives?.length) return;
    setSelectedAltId((prev) => {
      if (prev && item.alternatives!.some((a) => a.id === prev)) return prev;
      return item.alternatives!.find((a) => a.recommended)?.id ?? item.alternatives![0].id;
    });
  }, [item?.alternatives]);

  const accentFor = React.useCallback(
    (name: string) => team?.find((m) => m.name === name)?.accent ?? "#6750A4",
    [team]
  );

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:py-8" aria-busy="true" aria-label="Loading recovery case">
        <div className="mb-2 h-4 w-56 animate-pulse rounded-full bg-surface-container-high" />
        <div className="mb-6 h-8 w-72 animate-pulse rounded-full bg-surface-container-high" />
        <div className="mb-6 h-36 animate-pulse rounded-[24px] bg-surface-container" />
        <div className="h-64 animate-pulse rounded-[24px] bg-surface-container" />
      </div>
    );
  }

  if (isError || !item) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:py-8">
        <ErrorState
          title="Recovery case unavailable"
          message="This case could not be loaded. It may have been reset with the demo data, or the id is wrong."
          onRetry={() => refetch()}
        />
        <div className="mt-4 text-center">
          <M3Button variant="text" onClick={() => navigate("/recovery")}>
            <ArrowRight className="size-4 rotate-180" aria-hidden /> Back to Recovery Center
          </M3Button>
        </div>
      </div>
    );
  }

  const analysis = item.analysis;
  const alternatives = item.alternatives ?? [];
  const decision = item.decision;
  const decisionLocked = !!decision && ["pending", "processing", "applied", "partially_applied"].includes(decision.status);
  const selectedAlt = alternatives.find((a) => a.id === selectedAltId) ?? null;

  /* Stage derivation */
  const s1Done = !!analysis;
  const s2Done = alternatives.length > 0;
  const s3Done = decisionLocked;
  const currentStage = !s1Done ? 1 : !s2Done ? 2 : !s3Done ? 3 : 4;

  const stages: StageDef[] = [
    { n: 1, title: STAGE_TITLES[0], hint: "Run the impact analysis to size the blast radius.", done: s1Done },
    { n: 2, title: STAGE_TITLES[1], hint: "Generate recovery alternatives from the analysis.", done: s2Done },
    { n: 3, title: STAGE_TITLES[2], hint: "Approve, reject or return a proposal.", done: s3Done },
    { n: 4, title: STAGE_TITLES[3], hint: "Verification unlocks after a decision is submitted.", done: !!item.verification || !!verificationQuery.data },
  ];

  const toggleDoneStage = (n: number) =>
    setExpandedDoneStages((prev) => ({ ...prev, [n]: !prev[n] }));

  const submitDecision = (kind: Exclude<ApprovalDecision, "returned_for_edit"> | "returned_for_edit") => {
    if (!item.analysisId || !selectedAltId) return;
    decide.mutate(
      { analysisId: item.analysisId, alternativeId: selectedAltId, decision: kind, comment: comment.trim() || undefined },
      {
        onError: (err) => {
          // Hook already toasts + invalidates; make sure the refreshed state is visible.
          const status = (err as { status?: number }).status;
          if (status === 409) setStaleBanner(true);
          refetch();
          setConfirmKind(null);
        },
        onSuccess: () => setConfirmKind(null),
      }
    );
  };

  /* ---------------- Stage content ---------------- */

  const stage1Content = !analysis ? (
    <div className="rounded-[24px] bg-card p-6 ring-1 ring-border">
      <h3 className="text-title-md font-semibold">Size the blast radius first</h3>
      <p className="mt-2 max-w-2xl text-body-md text-on-surface-variant">
        The impact analysis walks the dependency graph from the blocked task, identifies everything
        downstream, and produces a blast-radius estimate with the constraints that any recovery
        option must respect. It changes nothing in your plan.
      </p>
      <div className="mt-5">
        <M3Button loading={runAnalysis.isPending} disabled={runAnalysis.isPending} onClick={() => runAnalysis.mutate(item.blocker.id)}>
          <Radar className="size-4" aria-hidden />
          {runAnalysis.isPending ? "Analyzing dependency graph…" : "Run impact analysis"}
        </M3Button>
      </div>
      {runAnalysis.isPending && (
        <div className="mt-5 space-y-2" aria-hidden>
          <div className="h-4 w-3/4 animate-pulse rounded-full bg-surface-container-high" />
          <div className="h-4 w-1/2 animate-pulse rounded-full bg-surface-container-high" style={{ animationDelay: "120ms" }} />
          <div className="h-4 w-2/3 animate-pulse rounded-full bg-surface-container-high" style={{ animationDelay: "240ms" }} />
        </div>
      )}
    </div>
  ) : (
    <div className="space-y-4">
      {/* Trigger event */}
      <div className="flex items-start gap-3 rounded-[24px] bg-card p-5 ring-1 ring-border">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
          <Zap className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-label-md font-medium text-on-surface-variant">Trigger event</p>
          <p className="mt-0.5 text-body-md">{analysis.triggerEvent}</p>
        </div>
      </div>

      {/* Affected + downstream tasks */}
      <div className="rounded-[24px] bg-card p-5 ring-1 ring-border">
        <p className="text-label-md font-medium text-on-surface-variant">Affected &amp; downstream tasks</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Chip tone="error">
            <ShieldAlert className="size-3.5" aria-hidden />
            {analysis.affectedTaskTitle}
          </Chip>
          {analysis.downstreamTaskIds.map((tid, i) => (
            <Chip key={tid} tone="warning">
              <ArrowRight className="size-3.5" aria-hidden />
              {analysis.dependencyPath[i + 1] ?? tid}
            </Chip>
          ))}
          <Chip tone="neutral">{analysis.downstreamTaskIds.length} downstream</Chip>
        </div>

        {/* Dependency path flow */}
        <p className="mt-5 text-label-md font-medium text-on-surface-variant">Dependency path</p>
        <ol className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-2" aria-label="Critical dependency path, in order">
          {analysis.dependencyPath.map((title, i) => (
            <li key={`${title}-${i}`} className="flex items-center gap-1.5">
              {i > 0 && <ArrowRight className="size-4 shrink-0 text-outline" aria-hidden />}
              <Chip tone={i === 0 ? "error" : "outline"}>{title}</Chip>
            </li>
          ))}
        </ol>
      </div>

      {/* Deadline exposure */}
      <div className="flex items-start gap-3 rounded-2xl bg-warning-container p-4 text-on-warning-container" role="status">
        <Clock className="mt-0.5 size-5 shrink-0" aria-hidden />
        <div>
          <p className="text-label-lg font-semibold">Deadline exposure</p>
          <p className="mt-0.5 text-label-md">{analysis.deadlineExposure}</p>
        </div>
      </div>

      {/* Blast radius */}
      <div className="rounded-[24px] bg-card p-6 ring-1 ring-border">
        <p className="text-label-md font-medium text-on-surface-variant">Blast radius</p>
        <div className="mt-3">
          <BlastRadiusMeter value={analysis.blastRadius} />
        </div>

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <div>
            <p className="mb-2 text-label-md font-medium">Contributing factors</p>
            <ul className="space-y-2 text-label-md">
              {analysis.blastRadiusFactors.map((f, i) => (
                <li key={i} className="flex items-start gap-2">
                  <ListChecks className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-2 text-label-md font-medium">Constraints the recovery must respect</p>
            <ul className="space-y-2 rounded-2xl bg-info-container p-4 text-label-md text-on-info-container">
              {analysis.constraints.map((c, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );

  const stage2Content = !analysis ? null : !alternatives.length ? (
    <div className="rounded-[24px] bg-card p-6 ring-1 ring-border">
      <h3 className="text-title-md font-semibold">Compare ways out</h3>
      <p className="mt-2 max-w-2xl text-body-md text-on-surface-variant">
        Renova turns the analysis into 2–3 recovery alternatives — from fastest to lowest cost —
        with schedule effects, feasibility checks and workload impact, so you can decide with the
        trade-offs in the open.
      </p>
      <div className="mt-5">
        <M3Button loading={runAlternatives.isPending} disabled={runAlternatives.isPending} onClick={() => runAlternatives.mutate(analysis.id)}>
          <Sparkles className="size-4" aria-hidden />
          {runAlternatives.isPending ? "Generating alternatives…" : "Generate alternatives"}
        </M3Button>
      </div>
      {runAlternatives.isPending && (
        <div className="mt-5 grid gap-4 md:grid-cols-3" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-[24px] border border-border p-5">
              <div className="mb-3 h-5 w-20 animate-pulse rounded-full bg-surface-container-high" style={{ animationDelay: `${i * 120}ms` }} />
              <div className="mb-2 h-5 w-3/4 animate-pulse rounded-full bg-surface-container-high" style={{ animationDelay: `${i * 120 + 60}ms` }} />
              <div className="h-3 w-full animate-pulse rounded-full bg-surface-container" style={{ animationDelay: `${i * 120 + 120}ms` }} />
            </div>
          ))}
        </div>
      )}
    </div>
  ) : (
    <div className="space-y-4">
      <fieldset>
        <legend className="mb-3 text-label-md text-on-surface-variant">
          Select a proposal to review — {alternatives.length} options generated
        </legend>
        <div role="radiogroup" aria-label="Recovery alternatives" className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {alternatives.map((alt) => (
            <AlternativeCard
              key={alt.id}
              alt={alt}
              selected={selectedAltId === alt.id}
              onSelect={() => !decisionLocked && setSelectedAltId(alt.id)}
              accentFor={accentFor}
            />
          ))}
        </div>
      </fieldset>
      {decisionLocked && (
        <p className="text-label-md text-on-surface-variant">
          A decision was already submitted for this case — the options are read-only.
        </p>
      )}
    </div>
  );

  /* Declared as a lazy renderer so it can safely reference `proposalReview` below. */
  const renderStage3 = () =>
    !alternatives.length ? null : decision && decisionLocked ? (
      <div className="space-y-4">
        <div role="status" className="flex items-start gap-3 rounded-2xl bg-info-container p-4 text-on-info-container">
          <Lock className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div>
            <p className="text-label-lg font-semibold">Decision already submitted</p>
            <p className="mt-0.5 text-label-md">
              This proposal is locked while changes apply. Further submissions are blocked to prevent duplicates.
            </p>
          </div>
        </div>
        <div className="rounded-[24px] bg-card p-5 ring-1 ring-border">
          <div className="flex flex-wrap items-center gap-2">
            <DecisionStatusChip status={decision.status} />
            <Chip tone="primary">
              <ClipboardCheck className="size-3.5" aria-hidden />
              {decision.alternativeTitle}
            </Chip>
          </div>
          <p className="mt-3 text-label-md text-on-surface-variant">
            Decided by <span className="font-medium text-foreground">{decision.decidedByName}</span> · {timeAgo(decision.decidedAt)}
            {" "}({format(parseISO(decision.decidedAt), "MMM d, HH:mm")})
          </p>
          {decision.comment && (
            <blockquote className="mt-3 rounded-2xl bg-surface-container p-4 text-label-md">
              <span className="sr-only">Decision note: </span>“{decision.comment}”
            </blockquote>
          )}
        </div>
      </div>
    ) : decision && !decisionLocked ? (
      <div className="space-y-4">
        <StatusBanner tone="warning" icon={RefreshCw} title={`Previous decision was ${DECISION_STATUS_META[decision.status].label.toLowerCase()}`}>
          You can submit a revised decision for this case.
        </StatusBanner>
        {proposalReview}
      </div>
    ) : (
      proposalReview
    );

  const proposalReview = selectedAlt ? (
    <div className="rounded-[24px] bg-card p-6 ring-1 ring-border">
      <h3 className="text-title-md font-semibold">Proposal summary</h3>
      <p className="mt-1 text-label-md text-on-surface-variant">
        Review the full proposal before deciding — everything below will be applied on approval.
      </p>

      <div className="mt-4 rounded-2xl bg-surface-container-low p-4">
        <div className="flex flex-wrap items-center gap-2">
          {selectedAlt.label && <Chip tone="primary">{selectedAlt.label}</Chip>}
          {selectedAlt.recommended && (
            <Chip tone="success"><Star className="size-3.5" aria-hidden /> Recommended</Chip>
          )}
        </div>
        <p className="mt-2 text-title-md font-semibold">{selectedAlt.title}</p>
        <p className="mt-1 text-label-md text-on-surface-variant">{selectedAlt.description}</p>
      </div>

      {/* Affected tasks */}
      {analysis && (
        <div className="mt-4">
          <p className="mb-2 text-label-md font-medium">Affected tasks</p>
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone="error"><ShieldAlert className="size-3.5" aria-hidden />{analysis.affectedTaskTitle}</Chip>
            {analysis.dependencyPath.slice(1).map((t, i) => (
              <Chip key={`${t}-${i}`} tone="outline">{t}</Chip>
            ))}
          </div>
        </div>
      )}

      {/* Assignment changes */}
      <div className="mt-4">
        <p className="mb-2 text-label-md font-medium">Assignment changes</p>
        {selectedAlt.assignmentChanges.length === 0 ? (
          <p className="text-label-md text-on-surface-variant">None — this option keeps assignments unchanged.</p>
        ) : (
          <ul className="space-y-3">
            {selectedAlt.assignmentChanges.map((ch, i) => (
              <li key={`${ch.taskId}-${i}`} className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface-container p-3">
                {ch.fromMemberName && (
                  <>
                    <Avatar name={ch.fromMemberName} accent={accentFor(ch.fromMemberName)} className="size-8" />
                    <span className="text-label-md">{ch.fromMemberName}</span>
                    <ArrowRight className="size-4 text-on-surface-variant" aria-hidden />
                  </>
                )}
                <Avatar name={ch.toMemberName} accent={accentFor(ch.toMemberName)} className="size-8" />
                <span className="text-label-md font-medium">{ch.toMemberName}</span>
                <span className="text-label-sm text-on-surface-variant">on “{ch.taskTitle}” — {ch.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Deadline implications */}
      <div className="mt-4 flex items-start gap-2.5 rounded-2xl bg-surface-container p-4">
        <Clock className="mt-0.5 size-4 shrink-0 text-on-surface-variant" aria-hidden />
        <div>
          <p className="text-label-md font-medium">Deadline implications</p>
          <p className="mt-0.5 text-label-md text-on-surface-variant">{selectedAlt.scheduleEffect}</p>
        </div>
      </div>

      {/* Outstanding concerns */}
      {(selectedAlt.risks.length > 0 || selectedAlt.assumptions.length > 0) && (
        <div className="mt-4">
          <p className="mb-2 text-label-md font-medium">Outstanding concerns</p>
          <ul className="space-y-2 text-label-md">
            {selectedAlt.risks.map((r, i) => (
              <li key={`r-${i}`} className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                <span><span className="font-medium">Risk:</span> {r}</span>
              </li>
            ))}
            {selectedAlt.assumptions.map((a, i) => (
              <li key={`a-${i}`} className="flex items-start gap-2">
                <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
                <span><span className="font-medium">Assumes:</span> {a}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Audit-trail comment */}
      <div className="mt-5">
        <TextArea
          label="Add a note for the audit trail (optional)"
          placeholder="e.g. Approving — vendor ETA looks credible, pairing starts today."
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={400}
        />
      </div>

      {/* Actions */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <M3Button
          disabled={decide.isPending}
          onClick={() => setConfirmKind("approved")}
        >
          <CheckCircle2 className="size-4" aria-hidden /> Approve proposal
        </M3Button>
        <M3Button
          variant="outlined"
          disabled={decide.isPending}
          onClick={() => setConfirmKind("rejected")}
        >
          <XCircle className="size-4" aria-hidden /> Reject
        </M3Button>
        <M3Button
          variant="text"
          disabled={decide.isPending}
          onClick={() => submitDecision("returned_for_edit")}
        >
          <RefreshCw className="size-4" aria-hidden /> Return for edit
        </M3Button>
        {decide.isPending && (
          <span className="flex items-center gap-2 text-label-md text-on-surface-variant" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Submitting decision…
          </span>
        )}
      </div>

      <ConfirmDialog
        open={confirmKind !== null}
        onOpenChange={(o) => { if (!o) setConfirmKind(null); }}
        title={confirmKind === "approved" ? "Approve this recovery proposal?" : "Reject this recovery proposal?"}
        description={
          confirmKind === "approved"
            ? "This applies the assignment changes to the live plan. Verification runs immediately afterwards, and this action cannot be undone."
            : "No changes will be applied to the plan. The blocker stays open and a new analysis can be requested."
        }
        confirmLabel={confirmKind === "approved" ? "Approve" : "Reject proposal"}
        cancelLabel="Keep reviewing"
        destructive={confirmKind === "rejected"}
        loading={decide.isPending}
        onConfirm={() => confirmKind && submitDecision(confirmKind)}
      />
    </div>
  ) : (
    <div className="rounded-[24px] bg-card p-6 ring-1 ring-border">
      <p className="text-label-md text-on-surface-variant">Select an alternative in stage 2 to review the proposal here.</p>
    </div>
  );

  /* Stage 4 — verification */
  const verification = item.verification ?? verificationQuery.data;
  const stage4Content = !decision ? (
    <div className="rounded-[24px] bg-card p-6 ring-1 ring-border">
      <p className="flex items-center gap-2 text-label-md text-on-surface-variant">
        <Lock className="size-4" aria-hidden /> Verification unlocks after a decision is submitted.
      </p>
    </div>
  ) : decision.status === "processing" ? (
    <div className="flex items-center gap-4 rounded-[24px] bg-card p-6 ring-1 ring-border" role="status">
      <Loader2 className="size-6 animate-spin text-primary" aria-hidden />
      <div>
        <p className="text-title-md font-semibold">Applying changes…</p>
        <p className="mt-0.5 text-label-md text-on-surface-variant">
          Assignment changes are being written to the live plan. Nothing is confirmed until verification finishes.
        </p>
      </div>
    </div>
  ) : verificationQuery.isLoading && !verification ? (
    <div className="rounded-[24px] bg-card p-6 ring-1 ring-border" aria-busy="true">
      <div className="mb-3 h-5 w-56 animate-pulse rounded-full bg-surface-container-high" />
      <div className="mb-2 h-4 w-full animate-pulse rounded-full bg-surface-container" />
      <div className="h-4 w-2/3 animate-pulse rounded-full bg-surface-container" />
    </div>
  ) : verificationQuery.isError && !verification ? (
    <div className="rounded-[24px] bg-card p-6 ring-1 ring-border">
      <StatusBanner tone="info" icon={Clock} title="Verification result not available yet">
        The apply step may still be running. Retry in a moment.
      </StatusBanner>
      <M3Button variant="outlined" size="sm" className="mt-4" onClick={() => verificationQuery.refetch()}>
        <RefreshCw className="size-4" aria-hidden /> Check verification again
      </M3Button>
    </div>
  ) : verification ? (
    <div className="space-y-4">
      {(() => {
        const meta = verificationBannerMeta(verification.status);
        return (
          <StatusBanner tone={meta.tone} icon={meta.icon} title={meta.title}>
            <p>{verification.message}</p>
            <p className="mt-1 opacity-80">
              Verified {format(parseISO(verification.checkedAt), "MMM d, HH:mm")} · decision by {decision.decidedByName}
            </p>
          </StatusBanner>
        );
      })()}

      {verification.changes.length > 0 && (
        <div className="overflow-hidden rounded-[24px] ring-1 ring-border">
          <div className="hidden grid-cols-[1.2fr_1.6fr_auto] gap-3 border-b border-border bg-surface-container-low px-5 py-3 text-label-md font-medium md:grid">
            <span>Task</span><span>Change</span><span>Applied</span>
          </div>
          <ul className="divide-y divide-outline-variant/60 bg-card">
            {verification.changes.map((ch, i) => (
              <li key={`${ch.taskId}-${i}`} className="grid gap-1 px-5 py-3.5 md:grid-cols-[1.2fr_1.6fr_auto] md:items-center md:gap-3">
                <span className="text-label-md font-medium">{ch.taskTitle}</span>
                <span className="text-label-md text-on-surface-variant">{ch.change}</span>
                <span className="mt-1 md:mt-0">
                  <Chip tone={ch.applied ? "success" : "error"}>
                    {ch.applied ? <CheckCircle2 className="size-3.5" aria-hidden /> : <XCircle className="size-3.5" aria-hidden />}
                    {ch.applied ? "Applied" : "Not applied"}
                  </Chip>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {verification.unresolvedIssues.length > 0 && (
        <div className="rounded-[24px] bg-error-container p-5 text-on-error-container" role="alert">
          <p className="flex items-center gap-2 text-label-lg font-semibold">
            <TriangleAlert className="size-5" aria-hidden /> Unresolved issues ({verification.unresolvedIssues.length})
          </p>
          <ul className="mt-3 space-y-3">
            {verification.unresolvedIssues.map((issue, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-surface-container/60 p-3 text-label-md">
                <span className="min-w-0">{issue}</span>
                <a
                  href={`#/workflows/${item.workflowId}`}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40"
                >
                  Inspect current state
                  <ExternalLink className="size-4" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  ) : null;

  /* ---------------- Render ---------------- */

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:py-8">
      <PageHeader
        breadcrumbs={[
          { label: "Recovery Center", href: "#/recovery" },
          { label: item.workflowName },
        ]}
        title={item.blocker.title}
        description={`Recovery case · opened ${timeAgo(item.createdAt)}`}
        actions={<DemoDataBadge />}
      />

      {/* Header card — blocker summary */}
      <div className="mb-8 rounded-[28px] bg-surface-container-low p-6">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityChip severity={item.blocker.severity} />
          <BlockerStatusChip status={item.blocker.status} />
          <a
            href={`#/workflows/${item.workflowId}`}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-label-md font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40"
          >
            <GitBranch className="size-4" aria-hidden />
            {item.workflowName}
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </div>
        <p className="mt-3 text-body-md text-on-surface-variant">{item.blocker.description}</p>
        <p className="mt-3 flex items-center gap-1.5 text-label-sm text-on-surface-variant">
          <Users className="size-3.5" aria-hidden />
          Reported by {item.blocker.reportedByName} · {timeAgo(item.blocker.reportedAt)}
          {" "}({format(parseISO(item.blocker.reportedAt), "MMM d, HH:mm")}) · on “{item.blocker.taskTitle}”
        </p>

        {staleBanner && (
          <StatusBanner
            tone="warning"
            icon={RefreshCw}
            title="This proposal changed while you were reviewing — showing the current state."
            className="mt-4"
          >
            <button
              type="button"
              onClick={() => { setStaleBanner(false); refetch(); }}
              className="mt-1 inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40"
            >
              <RefreshCw className="size-4" aria-hidden /> Refresh now
            </button>
          </StatusBanner>
        )}
      </div>

      {/* Mobile progress bar */}
      <div className="mb-6 md:hidden" role="img" aria-label={`Recovery stage ${currentStage} of 4: ${STAGE_TITLES[currentStage - 1]}`}>
        <div className="flex gap-1.5">
          {stages.map((s) => (
            <span
              key={s.n}
              className={cn("h-1.5 flex-1 rounded-full", s.n <= currentStage ? "bg-primary" : "bg-surface-container-high")}
            />
          ))}
        </div>
        <p className="mt-2 text-label-md text-on-surface-variant">
          Stage {currentStage} of 4 — {STAGE_TITLES[currentStage - 1]}
        </p>
      </div>

      {/* Screen-reader stage announcer */}
      <p className="sr-only" aria-live="polite">
        Recovery step {currentStage} of 4: {STAGE_TITLES[currentStage - 1]}
      </p>

      {/* Stepper */}
      <ol className="space-y-6" aria-label="Recovery steps">
        {stages.map((stage, idx) => {
          const isCurrent = stage.n === currentStage;
          const isFuture = stage.n > currentStage;
          const isDone = stage.done && !isCurrent;
          const expanded = isCurrent || (isDone && expandedDoneStages[stage.n]);
          const content = stage.n === 1 ? stage1Content : stage.n === 2 ? stage2Content : stage.n === 3 ? renderStage3() : stage4Content;

          return (
            <li
              key={stage.n}
              aria-current={isCurrent ? "step" : undefined}
              className={cn("relative", idx < stages.length - 1 && "md:pb-2")}
            >
              <div className="flex gap-4">
                {/* Rail (desktop) */}
                <div className="hidden flex-col items-center md:flex">
                  <StageRailBadge stage={stage} isCurrent={isCurrent} />
                  {idx < stages.length - 1 && (
                    <span className="w-px flex-1 bg-outline-variant" aria-hidden />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="md:hidden"><StageRailBadge stage={stage} isCurrent={isCurrent} /></span>
                    <h2 className={cn("text-title-md font-semibold", isFuture && "text-on-surface-variant")}>
                      <span className="md:sr-only">{stage.n}. </span>{stage.title}
                    </h2>
                    {isDone && <Chip tone="success"><CheckCircle2 className="size-3.5" aria-hidden /> Completed</Chip>}
                    {isCurrent && <Chip tone="primary"><Radar className="size-3.5" aria-hidden /> Current step</Chip>}
                    {isDone && (
                      <button
                        type="button"
                        aria-expanded={expanded}
                        onClick={() => toggleDoneStage(stage.n)}
                        className="ml-auto inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-label-md font-medium text-primary hover:bg-primary/8 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40"
                      >
                        {expanded ? "Hide details" : "Show details"}
                        <ChevronDown className={cn("size-4 transition-transform duration-200", expanded && "rotate-180")} aria-hidden />
                      </button>
                    )}
                  </div>

                  <AnimatePresence initial={false}>
                    {expanded ? (
                      <motion.div
                        key="content"
                        initial={reduce ? false : { opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: reduce ? 0 : 0.25, ease: M3_EASE }}
                        className="mt-3"
                      >
                        {content}
                      </motion.div>
                    ) : (
                      <motion.p
                        key="collapsed"
                        initial={reduce ? false : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: reduce ? 0 : 0.2, ease: M3_EASE }}
                        className="mt-1.5 text-label-md text-on-surface-variant"
                      >
                        {isFuture ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Lock className="size-3.5" aria-hidden />
                            {stage.hint}
                          </span>
                        ) : (
                          stage.hint
                        )}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
