"use client";

/**
 * Subscription & billing — dedicated SaaS experience (DEMO DATA, clearly labeled).
 *
 * What this screen is:
 *  - Current workspace plan + plan status.
 *  - Usage overview for workflows, team seats, AI generations and recovery
 *    runs with used-versus-allowed quota indicators and clear quota-reached
 *    messages.
 *  - Plan comparison (Free / Team / Business) with a clearly labeled
 *    "demo upgrade" that simulates a plan change WITHOUT any payment.
 *
 * What this screen is NOT (honesty rules):
 *  - No real checkout, no prices, no billing intervals — final pricing and
 *    limits come from the product configuration / backend contract, which do
 *    not exist yet (see src/lib/subscription/types.ts boundary note).
 *  - No server persistence: the simulated plan lives in this browser only.
 *  - Quota meters are a UX preview, never a security boundary — the backend
 *    enforces real limits.
 */
import * as React from "react";
import { format, parseISO } from "date-fns";
import {
  ArrowUpRight, BadgeCheck, Check, Cpu, CreditCard, FolderKanban, Info, RotateCcw, Users, Zap,
} from "lucide-react";
import {
  Chip,
  ConfirmDialog,
  DemoDataBadge,
  M3Button,
  PageHeader,
  SectionHeading,
} from "../primitives";
import { useUsage } from "@/lib/api/queries";
import { cn } from "@/lib/utils";
import {
  DEMO_PLAN_CATALOG,
  ENTITLEMENT_LABELS,
  formatLimit,
  planEntitlements,
  useSubscriptionStore,
} from "@/lib/subscription";
import type { EntitlementKey } from "@/lib/subscription";

const ENT_ICONS: Record<EntitlementKey, React.ElementType> = {
  workflows: FolderKanban,
  seats: Users,
  aiGenerations: Cpu,
  recoveryRuns: Zap,
};

function QuotaCard({ label, used, allowed, icon: Icon }: {
  label: string; used: number; allowed: number | null; icon: React.ElementType;
}) {
  const unlimited = allowed == null;
  const pct = unlimited ? 0 : allowed > 0 ? Math.min(100, Math.round((used / allowed) * 100)) : 100;
  const reached = !unlimited && used >= allowed;
  const near = !unlimited && !reached && pct > 80;
  const barColor = reached ? "bg-error" : near ? "bg-warning" : "bg-primary";
  const level = reached ? "Limit reached" : near ? "Near limit" : unlimited ? "Unlimited" : "Within plan";
  return (
    <div
      role="img"
      aria-label={`${label}: ${used} used of ${unlimited ? "unlimited" : allowed} — ${level}`}
      className="rounded-[24px] bg-card p-5 ring-1 ring-border"
    >
      <div className="flex items-center gap-3">
        <span className={cn(
          "flex size-10 items-center justify-center rounded-2xl",
          reached ? "bg-error-container text-on-error-container" : near ? "bg-warning-container text-on-warning-container" : "bg-secondary text-secondary-foreground"
        )}>
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-label-md text-on-surface-variant">{label}</p>
          <p className="text-title-md font-semibold">
            {used} <span className="text-label-md font-normal text-on-surface-variant">of {unlimited ? "unlimited" : allowed}</span>
          </p>
        </div>
        <span className={cn(
          "ml-auto text-label-md font-medium",
          reached ? "text-error" : near ? "text-warning" : "text-on-surface-variant"
        )}>
          {unlimited ? "∞" : `${pct}%`}
        </span>
      </div>
      <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-surface-container-high">
        <div className={cn("h-full rounded-full transition-all duration-500 ease-m3", barColor)} style={{ width: `${unlimited ? 0 : pct}%` }} />
      </div>
      <p className={cn("mt-1.5 text-label-sm", reached ? "font-semibold text-error" : "text-on-surface-variant")}>
        {reached
          ? `Quota reached — the demo shows an upgrade path below. The backend enforces real limits.`
          : level}
      </p>
    </div>
  );
}

export default function SubscriptionPage() {
  const { state, loading, error, changing, load, changePlan, resetDemo } = useSubscriptionStore();
  const { data: usage } = useUsage();
  const [pendingPlan, setPendingPlan] = React.useState<string | null>(null);

  React.useEffect(() => {
    void load();
  }, [load]);

  const plan = state?.plan ?? "Team";
  const entitlements = planEntitlements(plan);

  const usageFor = (key: EntitlementKey): number => {
    if (!usage) return 0;
    if (key === "workflows") return usage.workflowsUsed;
    if (key === "seats") return usage.seatsUsed;
    if (key === "aiGenerations") return usage.aiGenerationsUsed;
    return usage.recoveryRunsUsed;
  };

  const reachedKeys = (Object.keys(ENTITLEMENT_LABELS) as EntitlementKey[])
    .filter((k) => entitlements[k] != null && usageFor(k) >= entitlements[k]!);

  function onConfirmChange() {
    if (!pendingPlan) return;
    const target = pendingPlan as typeof plan;
    changePlan(target)
      .then(() => {
        setPendingPlan(null);
      })
      .catch(() => {
        /* error state surfaced by the store; keep the dialog open state consistent */
        setPendingPlan(null);
      });
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-0 lg:px-0">
      <PageHeader
        title="Subscription"
        description="The workspace's plan, what it consumes, and the available plans."
        actions={<DemoDataBadge label="Demo · no billing" />}
      />

      {/* Honest boundary notice */}
      <div className="flex items-start gap-2.5 rounded-2xl bg-info-container/60 p-4 text-label-md text-on-info-container" role="note">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          <strong>Demo subscription experience.</strong> The subscription backend is not implemented yet — no prices,
          billing intervals or entitlement enforcement exist. Plan changes below are <strong>simulated locally</strong>
          {" "}("demo upgrade"), stored only in this browser, and never imply a purchase or a real subscription. The
          backend must enforce all real limits.
        </span>
      </div>

      {error && (
        <div role="alert" className="rounded-2xl bg-error-container/70 p-4 text-label-md text-on-error-container">
          {error}
        </div>
      )}

      {/* Current plan */}
      <section aria-label="Current plan" className="rounded-[28px] bg-surface-container-low p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone="primary">
            <CreditCard className="size-3.5" aria-hidden />
            {plan} plan
          </Chip>
          <Chip tone="success">
            <BadgeCheck className="size-3.5" aria-hidden />
            Active
          </Chip>
          <Chip tone="outline">Simulated in this browser — not a real subscription</Chip>
          {state && (
            <span className="ml-auto text-label-sm text-on-surface-variant">
              Period {format(parseISO(state.periodStart), "MMM d")} – {format(parseISO(state.periodEnd), "MMM d, yyyy")} · demo
            </span>
          )}
        </div>
        <p className="mt-3 max-w-2xl text-label-md text-on-surface-variant">
          This is the workspace's simulated plan state. When the subscription backend contract lands, this card switches to
          server-reported state automatically — the UI already treats the backend as authoritative.
        </p>
        {state && state.history.length > 1 && (
          <p className="mt-2 text-label-sm text-on-surface-variant">
            Last simulated change: {format(parseISO(state.updatedAt), "MMM d, yyyy 'at' p")} —{" "}
            {state.history[state.history.length - 1].action.replace("_", " ")} to {state.history[state.history.length - 1].plan}.
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <M3Button
            variant="text"
            onClick={() => {
              void resetDemo();
            }}
            disabled={changing || state?.history.length === 1}
          >
            <RotateCcw className="size-4" aria-hidden /> Reset demo plan state
          </M3Button>
        </div>
      </section>

      {/* Usage overview */}
      <section aria-label="Usage overview" aria-live="polite">
        <SectionHeading
          title="Usage this period"
          description="Used versus allowed for this workspace — demo consumption against the simulated plan's demo limits."
        />
        {reachedKeys.length > 0 && (
          <div role="status" className="mb-4 flex items-start gap-2.5 rounded-2xl bg-error-container/70 p-4 text-label-md text-on-error-container">
            <Zap className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              {reachedKeys.length === 1
                ? `The ${ENTITLEMENT_LABELS[reachedKeys[0]].toLowerCase()} quota for the ${plan} plan is reached.`
                : `${reachedKeys.length} quotas are reached on the ${plan} plan.`}{" "}
              Compare plans below — upgrades are a labeled simulation while the billing backend does not exist.
            </span>
          </div>
        )}
        {loading && !state ? (
          <div className="flex items-center gap-3 py-8 text-label-lg text-on-surface-variant" role="status">Loading subscription…</div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {(Object.keys(ENTITLEMENT_LABELS) as EntitlementKey[]).map((key) => {
              const Icon = ENT_ICONS[key];
              return <QuotaCard key={key} label={ENTITLEMENT_LABELS[key]} used={usageFor(key)} allowed={entitlements[key]} icon={Icon} />;
            })}
          </div>
        )}
        <p className="mt-3 text-label-sm text-on-surface-variant">
          Consumed values come from the labeled demo adapter; allowed values are demo placeholders for the {plan} plan.
        </p>
      </section>

      {/* Plan comparison */}
      <section aria-label="Plan comparison">
        <SectionHeading
          title="Compare plans"
          description="Free, Team and Business — qualitative features and demo placeholder limits. No pricing is shown because none has been agreed yet."
        />
        <div className="grid gap-4 lg:grid-cols-3">
          {DEMO_PLAN_CATALOG.map((entry) => {
            const isCurrent = entry.id === plan;
            return (
              <article
                key={entry.id}
                className={cn(
                  "flex flex-col rounded-[28px] bg-card p-6 ring-1 ring-border",
                  isCurrent && "ring-2 ring-primary/50"
                )}
                aria-current={isCurrent ? "true" : undefined}
              >
                <div className="flex items-center gap-2">
                  <h3 className="text-title-lg font-semibold">{entry.name}</h3>
                  {isCurrent && <Chip tone="primary">Current</Chip>}
                </div>
                <p className="mt-1 text-label-md text-on-surface-variant">{entry.tagline}</p>

                <p className="mt-4 text-label-sm font-semibold uppercase tracking-[0.08em] text-on-surface-variant">Demo limits</p>
                <ul className="mt-1.5 space-y-1">
                  {(Object.keys(ENTITLEMENT_LABELS) as EntitlementKey[]).map((key) => (
                    <li key={key} className="flex items-center justify-between gap-2 text-label-md">
                      <span className="text-on-surface-variant">{ENTITLEMENT_LABELS[key]}</span>
                      <span className="font-medium">{formatLimit(entry.entitlements[key])}</span>
                    </li>
                  ))}
                </ul>

                <p className="mt-4 text-label-sm font-semibold uppercase tracking-[0.08em] text-on-surface-variant">Features</p>
                <ul className="mt-1.5 flex-1 space-y-1.5">
                  {entry.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-label-md">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-5">
                  {isCurrent ? (
                    <M3Button variant="outlined" disabled aria-disabled="true" className="w-full">
                      Current plan
                    </M3Button>
                  ) : (
                    <M3Button
                      className="w-full"
                      onClick={() => setPendingPlan(entry.id)}
                      disabled={changing}
                    >
                      {entry.id === "Free" ? "Simulate switch to Free" : `Demo upgrade to ${entry.name}`}
                      <ArrowUpRight className="size-4" aria-hidden />
                    </M3Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        <p className="mt-3 text-label-sm text-on-surface-variant">
          Features above the current plan are listed on the other plan cards; nothing is gated in this demo — the meters
          and notices preview quota UX only, and the backend remains the security boundary.
        </p>
      </section>

      {/* Demo upgrade confirmation */}
      <ConfirmDialog
        open={!!pendingPlan}
        onOpenChange={(v) => {
          if (!v) setPendingPlan(null);
        }}
        title={`Demo upgrade to ${pendingPlan ?? ""} — no payment`}
        description="This is a demonstration of the upgrade flow. No payment is processed, nothing is billed, no real subscription is created — the plan change is simulated and stored in this browser only, clearly labeled as demo data."
        confirmLabel="Simulate plan change"
        loading={changing}
        onConfirm={onConfirmChange}
      />
    </div>
  );
}
