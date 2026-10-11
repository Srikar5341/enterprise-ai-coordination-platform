"use client";

/**
 * Audit trail — the system-recorded event stream, searchable and filterable.
 * Table on desktop, stacked cards on mobile, scrollable on long lists.
 */
import * as React from "react";
import { format, parseISO } from "date-fns";
import {
  CheckCircle2, ChevronDown, Clock, Info, XCircle, ShieldCheck, User,
} from "lucide-react";
import {
  Chip, DemoDataBadge, EmptyState, ErrorState, M3Button, PageHeader, TextField,
} from "../primitives";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useAudit } from "@/lib/api/queries";
import type { AuditEvent } from "@/lib/api/types";
import { cn } from "@/lib/utils";

type OutcomeFilter = "all" | "success" | "failure" | "pending";

const OUTCOME_META: Record<AuditEvent["outcome"], { label: string; tone: "success" | "error" | "warning"; icon: React.ElementType }> = {
  success: { label: "Success", tone: "success", icon: CheckCircle2 },
  failure: { label: "Failure", tone: "error", icon: XCircle },
  pending: { label: "Pending", tone: "warning", icon: Clock },
};

const ROLE_META: Record<AuditEvent["actorRole"], { label: string; tone: "primary" | "neutral" | "info" }> = {
  team_lead: { label: "Team lead", tone: "primary" },
  employee: { label: "Employee", tone: "neutral" },
  system: { label: "System", tone: "info" },
};

function OutcomeChip({ outcome }: { outcome: AuditEvent["outcome"] }) {
  const meta = OUTCOME_META[outcome];
  const Icon = meta.icon;
  return (
    <Chip tone={meta.tone}>
      <Icon className="size-3.5" aria-hidden />
      {meta.label}
    </Chip>
  );
}

function DetailsCell({ id, details }: { id: string; details?: string }) {
  const [open, setOpen] = React.useState(false);
  if (!details) return <span className="text-on-surface-variant">—</span>;
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`audit-details-${id}`}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-11 items-center gap-1 rounded-full px-2 -mx-2 text-left text-label-md text-on-surface-variant hover:bg-surface-container-high focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40"
      >
        <span className={cn("max-w-[22ch] truncate sm:max-w-[34ch]", open && "hidden")}>{details}</span>
        <span className={cn("sr-only", open && "not-sr-only")}>{open ? "Hide details" : "Show details"}</span>
        <ChevronDown className={cn("size-4 shrink-0 transition-transform duration-200", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <p id={`audit-details-${id}`} className="mt-1 max-w-md text-label-sm text-on-surface-variant">
          {details}
        </p>
      )}
    </div>
  );
}

export default function AuditPage() {
  const { data: events, isLoading, isError, refetch } = useAudit();
  const [query, setQuery] = React.useState("");
  const [outcome, setOutcome] = React.useState<OutcomeFilter>("all");

  const list = React.useMemo(() => {
    let out = [...(events ?? [])].sort((a, b) => (a.at < b.at ? 1 : -1));
    if (outcome !== "all") out = out.filter((e) => e.outcome === outcome);
    const q = query.trim().toLowerCase();
    if (q) out = out.filter((e) => e.actorName.toLowerCase().includes(q) || e.target.toLowerCase().includes(q));
    return out;
  }, [events, query, outcome]);

  const filters: { key: OutcomeFilter; label: string; count: number }[] = [
    { key: "all", label: "All", count: events?.length ?? 0 },
    { key: "success", label: "Success", count: events?.filter((e) => e.outcome === "success").length ?? 0 },
    { key: "failure", label: "Failure", count: events?.filter((e) => e.outcome === "failure").length ?? 0 },
    { key: "pending", label: "Pending", count: events?.filter((e) => e.outcome === "pending").length ?? 0 },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
      <PageHeader
        title="Audit trail"
        description="Every plan, allocation and recovery action, recorded as it happened."
        actions={<DemoDataBadge />}
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="w-full sm:max-w-sm">
          <TextField
            label="Search"
            placeholder="Search by actor or target…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            type="search"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by outcome">
          {filters.map((f) => {
            const pressed = outcome === f.key;
            return (
              <button
                key={f.key}
                type="button"
                aria-pressed={pressed}
                onClick={() => setOutcome(f.key)}
                className={cn(
                  "min-h-11 rounded-full px-4 text-label-md font-medium transition-all duration-200 ease-m3 outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40 active:scale-95",
                  pressed
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest"
                )}
              >
                {f.label} <span className="ml-1 opacity-70">{f.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <p className="mb-4 flex items-start gap-2 rounded-2xl bg-info-container p-3.5 text-label-md text-on-info-container" role="note">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        Events are recorded by the system — this demo shows the mock audit stream.
      </p>

      {isLoading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading audit trail">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-2xl bg-surface-container" style={{ animationDelay: `${i * 80}ms` }} />
          ))}
        </div>
      ) : isError ? (
        <ErrorState message="The audit stream could not be loaded." onRetry={() => refetch()} />
      ) : list.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title={query || outcome !== "all" ? "No matching events" : "No events yet"}
          description={
            query || outcome !== "all"
              ? "Try a different search term or clear the outcome filter."
              : "Actions taken in this workspace will appear here as they happen."
          }
          action={(query || outcome !== "all") ? (
            <M3Button variant="tonal" onClick={() => { setQuery(""); setOutcome("all"); }}>
              Clear filters
            </M3Button>
          ) : undefined}
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden max-h-[560px] overflow-y-auto rounded-[24px] ring-1 ring-border scrollbar-slim md:block" tabIndex={0} aria-label="Audit events table, scrollable">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-surface-container-low">
                <TableRow>
                  <TableHead className="w-36">Time</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="bg-card">
                {list.map((e) => {
                  const role = ROLE_META[e.actorRole];
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="whitespace-nowrap text-label-md text-on-surface-variant">
                        {format(parseISO(e.at), "MMM d, HH:mm")}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="size-4 text-on-surface-variant" aria-hidden />
                          <span className="text-label-md font-medium">{e.actorName}</span>
                          <Chip tone={role.tone}>{role.label}</Chip>
                        </div>
                      </TableCell>
                      <TableCell>
                        <code className="rounded-lg bg-surface-container-high px-2 py-1 font-mono text-label-md">{e.action}</code>
                      </TableCell>
                      <TableCell className="text-label-md">{e.target}</TableCell>
                      <TableCell><OutcomeChip outcome={e.outcome} /></TableCell>
                      <TableCell><DetailsCell id={e.id} details={e.details} /></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <ul className="space-y-3 md:hidden" aria-label="Audit events">
            {list.map((e) => {
              const role = ROLE_META[e.actorRole];
              return (
                <li key={e.id} className="rounded-[24px] bg-card p-4 ring-1 ring-border">
                  <div className="flex flex-wrap items-center gap-2">
                    <OutcomeChip outcome={e.outcome} />
                    <Chip tone={role.tone}>{role.label}</Chip>
                    <span className="ml-auto text-label-sm text-on-surface-variant">
                      {format(parseISO(e.at), "MMM d, HH:mm")}
                    </span>
                  </div>
                  <p className="mt-2 text-label-lg font-medium">{e.actorName}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 text-label-md">
                    <code className="rounded-lg bg-surface-container-high px-2 py-0.5 font-mono text-label-sm">{e.action}</code>
                    <span className="text-on-surface-variant">→ {e.target}</span>
                  </p>
                  {e.details && (
                    <div className="mt-2 border-t border-outline-variant/60 pt-2">
                      <DetailsCell id={`m-${e.id}`} details={e.details} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
