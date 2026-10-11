"use client";

/**
 * Plan & usage — consumption meters for the workspace. Billing is honestly
 * marked unavailable in the demo: no fake checkout buttons.
 */
import * as React from "react";
import { format, parseISO } from "date-fns";
import {
  ArrowUpRight, CalendarRange, CreditCard, Cpu, FolderKanban, Info, ReceiptText, Users, Zap,
} from "lucide-react";
import {
  Chip, DemoDataBadge, ErrorState, LoadingBlock, M3Button, PageHeader,
} from "../primitives";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { navigate } from "@/lib/router";
import { useUsage } from "@/lib/api/queries";
import { planEntitlements, useSubscriptionStore } from "@/lib/subscription";
import { cn } from "@/lib/utils";

function UsageMeter({ label, used, limit, icon: Icon }: {
  label: string; used: number; limit: number; icon: React.ElementType;
}) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const barColor = pct >= 100 ? "bg-error" : pct > 80 ? "bg-warning" : "bg-primary";
  const level = pct >= 100 ? "Limit reached" : pct > 80 ? "Near limit" : "Within plan";
  return (
    <div
      role="img"
      aria-label={`${label}: ${used} of ${limit} used — ${level}`}
      className="rounded-[24px] bg-card p-5 ring-1 ring-border"
    >
      <div className="flex items-center gap-3">
        <span className={cn(
          "flex size-10 items-center justify-center rounded-2xl",
          pct >= 100 ? "bg-error-container text-on-error-container" : pct > 80 ? "bg-warning-container text-on-warning-container" : "bg-secondary text-secondary-foreground"
        )}>
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-label-md text-on-surface-variant">{label}</p>
          <p className="text-title-md font-semibold">
            {used} <span className="text-label-md font-normal text-on-surface-variant">of {limit}</span>
          </p>
        </div>
        <span className={cn(
          "ml-auto text-label-md font-medium",
          pct >= 100 ? "text-error" : pct > 80 ? "text-warning" : "text-on-surface-variant"
        )}>
          {pct}%
        </span>
      </div>
      <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-surface-container-high">
        <div
          className={cn("h-full rounded-full transition-all duration-500 ease-m3", barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1.5 text-label-sm text-on-surface-variant">{level}</p>
    </div>
  );
}

export default function UsagePage() {
  const { data: usage, isLoading, isError, refetch } = useUsage();
  const { state: subscription } = useSubscriptionStore();
  const plan = subscription?.plan ?? "Team";
  const entitlements = planEntitlements(plan);

  const reached: string[] = [];
  if (usage) {
    if (usage.workflowsUsed >= Math.min(usage.workflowsLimit, entitlements.workflows ?? usage.workflowsLimit)) reached.push("Workflows");
    if (usage.seatsUsed >= Math.min(usage.seatsLimit, entitlements.seats ?? usage.seatsLimit)) reached.push("Team seats");
    if (usage.aiGenerationsUsed >= Math.min(usage.aiGenerationsLimit, entitlements.aiGenerations ?? usage.aiGenerationsLimit)) reached.push("AI plan generations");
    if (usage.recoveryRunsUsed >= Math.min(usage.recoveryRunsLimit, entitlements.recoveryRuns ?? usage.recoveryRunsLimit)) reached.push("Recovery runs");
  }

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:py-8">
        <PageHeader title="Plan & usage" description="What this workspace consumes against its plan." actions={<DemoDataBadge />} />
        <LoadingBlock label="Loading usage" />
      </div>
    );
  }

  if (isError || !usage) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:py-8">
        <PageHeader title="Plan & usage" description="What this workspace consumes against its plan." actions={<DemoDataBadge />} />
        <ErrorState message="Usage data could not be loaded." onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:py-8">
      <PageHeader
        title="Plan & usage"
        description="What this workspace consumes against its plan for the current billing period."
        actions={<DemoDataBadge />}
      />

      {/* Plan card */}
      <section aria-label="Plan summary" className="mb-8 rounded-[28px] bg-surface-container-low p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone="primary">
            <ReceiptText className="size-3.5" aria-hidden />
            {usage.plan} plan
          </Chip>
          <Chip tone="neutral">
            <CalendarRange className="size-3.5" aria-hidden />
            {format(parseISO(usage.periodStart), "MMM d")} – {format(parseISO(usage.periodEnd), "MMM d, yyyy")}
          </Chip>
          <M3Button variant="text" size="sm" className="ml-auto" onClick={() => navigate("/subscription")}>
            Subscription & plans <ArrowUpRight className="size-4" aria-hidden />
          </M3Button>
        </div>

        {usage.billingStatus === "unavailable" ? (
          <div className="mt-4 flex items-start gap-3 rounded-2xl bg-info-container p-4 text-on-info-container" role="note">
            <Info className="mt-0.5 size-5 shrink-0" aria-hidden />
            <div>
              <p className="text-label-lg font-semibold">Billing is not available in this demo</p>
              <p className="mt-0.5 text-label-md">No checkout, no charges — the meters below only track demo consumption.</p>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex items-center gap-3">
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0}>
                    <M3Button variant="outlined" disabled aria-disabled="true">
                      <CreditCard className="size-4" aria-hidden /> Manage billing
                    </M3Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Coming soon</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
      </section>

      {/* Quota-reached message */}
      {reached.length > 0 && (
        <div role="status" className="mb-8 flex items-start gap-2.5 rounded-2xl bg-error-container/70 p-4 text-label-md text-on-error-container">
          <Zap className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {reached.length === 1 ? `The ${reached[0].toLowerCase()} quota is reached` : `${reached.length} quotas are reached`} on the
            {" "}{plan} plan. The backend enforces real limits; see the subscription screen for the (demo) upgrade path.{" "}
            <a href="#/subscription" className="font-semibold underline underline-offset-4">Compare plans</a>
          </span>
        </div>
      )}

      {/* Usage meters */}
      <section aria-label="Usage meters" aria-live="polite">
        <h2 className="mb-4 text-title-md font-semibold">This period</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <UsageMeter label="Workflows" used={usage.workflowsUsed} limit={usage.workflowsLimit} icon={FolderKanban} />
          <UsageMeter label="Seats" used={usage.seatsUsed} limit={usage.seatsLimit} icon={Users} />
          <UsageMeter label="AI plan generations" used={usage.aiGenerationsUsed} limit={usage.aiGenerationsLimit} icon={Cpu} />
          <UsageMeter label="Recovery runs" used={usage.recoveryRunsUsed} limit={usage.recoveryRunsLimit} icon={Zap} />
        </div>
        <p className="mt-3 text-label-sm text-on-surface-variant">
          Meters reflect demo consumption against demo limits — they preview quota UX and are not a security boundary.
        </p>
      </section>
    </div>
  );
}
