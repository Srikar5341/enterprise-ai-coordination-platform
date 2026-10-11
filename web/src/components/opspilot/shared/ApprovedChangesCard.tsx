"use client";

/**
 * Shared "Approved changes" card — fed by useApprovedChanges().
 * Used by the employee My Workspace dashboard and the My Tasks page.
 * Shows real approved assignment/recovery changes from the (mock) API —
 * nothing is fabricated here.
 */
import * as React from "react";
import { CheckCircle2, ChevronDown } from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { useApprovedChanges } from "@/lib/api/queries";
import type { AuditEvent } from "@/lib/api/types";
import { M3Button } from "../primitives";

function ApprovedChangeRow({ event }: { event: AuditEvent }) {
  const headline = event.details || event.target || event.action.replace(/[._]/g, " ");
  const target = event.details && event.target ? event.target : null;
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-success-container text-on-success-container">
        <CheckCircle2 className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-label-md font-medium">{target ? `${target} — ${headline}` : headline}</p>
        <p className="mt-0.5 text-label-sm text-on-surface-variant">
          {event.actorName} · {formatDistanceToNow(parseISO(event.at), { addSuffix: true })}
        </p>
      </div>
    </li>
  );
}

export function ApprovedChangesCard({ className }: { className?: string }) {
  const { data, isLoading, isError, refetch } = useApprovedChanges();
  const [open, setOpen] = React.useState(false);
  const count = data?.length ?? 0;

  return (
    <section aria-label="Approved changes" className={className}>
      <div className="overflow-hidden rounded-[24px] bg-card shadow-xs ring-1 ring-border">
        <div className="flex items-center gap-2 px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="approved-changes-panel"
            className="flex min-h-11 flex-1 items-center gap-3 rounded-2xl text-left outline-none transition-colors duration-200 ease-m3 focus-visible:ring-[3px] focus-visible:ring-primary/40"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-success-container text-on-success-container">
              <CheckCircle2 className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-title-md font-semibold">Approved changes</span>
              <span className="block truncate text-label-sm text-on-surface-variant">
                {isLoading
                  ? "Checking for recent approvals…"
                  : isError
                    ? "Couldn't load recent approvals"
                    : count === 0
                      ? "Nothing approved yet"
                      : `${count} recent approval${count !== 1 ? "s" : ""} from your team lead`}
              </span>
            </span>
            <ChevronDown className={`size-5 shrink-0 text-on-surface-variant transition-transform duration-200 ease-m3 ${open ? "rotate-180" : ""}`} aria-hidden />
          </button>
          {isError && !isLoading && (
            <M3Button variant="text" onClick={() => refetch()}>
              Retry
            </M3Button>
          )}
        </div>

        {open && (
          <div id="approved-changes-panel" className="border-t border-border px-4 py-4 sm:px-5">
            {isLoading ? (
              <div className="space-y-3" aria-hidden>
                {[0, 1].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="size-7 animate-pulse rounded-full bg-surface-container-high" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3.5 w-2/3 animate-pulse rounded-full bg-surface-container-high" />
                      <div className="h-3 w-1/3 animate-pulse rounded-full bg-surface-container" />
                    </div>
                  </div>
                ))}
              </div>
            ) : isError ? (
              <p className="text-label-md text-on-surface-variant">
                Recent approvals couldn&apos;t be loaded. Use “Retry” above — everything else on this page still works.
              </p>
            ) : count === 0 ? (
              <p className="text-label-md text-on-surface-variant">
                No approved changes yet. When your team lead approves reassignments or recovery plans, they&apos;ll be
                listed here.
              </p>
            ) : (
              <ul className="space-y-3">
                {data!.map((event) => (
                  <ApprovedChangeRow key={event.id} event={event} />
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
