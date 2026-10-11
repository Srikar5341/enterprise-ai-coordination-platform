"use client";

/**
 * Team lead — workflow list with debounced search, status filters and sorting.
 * Rows are full-surface cards; the title is a real anchor (keyboard/AT path)
 * and a dropdown exposes View / Plan / Allocation shortcuts.
 */
import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import {
  ChevronRight,
  Eye,
  FlaskConical,
  MoreVertical,
  OctagonAlert,
  Plus,
  Search,
  Users,
  Workflow as WorkflowIcon,
} from "lucide-react";
import { navigate } from "@/lib/router";
import { useRecoveryCases, useTeam, useWorkflows } from "@/lib/api/queries";
import type { Workflow } from "@/lib/api/types";
import {
  Avatar,
  Chip,
  DemoDataBadge,
  EmptyState,
  ErrorState,
  M3Button,
  PageHeader,
  ProgressRing,
  SkeletonTable,
  WorkflowStatusChip,
} from "@/components/opspilot/primitives";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------- */
/* Helpers                                                           */
/* ---------------------------------------------------------------- */

type StatusFilter = "all" | "active" | "planning" | "ready_for_allocation" | "completed";
type SortKey = "newest" | "target" | "name";

const STATUS_FILTERS: { label: string; value: StatusFilter }[] = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Planning", value: "planning" },
  { label: "Ready to allocate", value: "ready_for_allocation" },
  { label: "Completed", value: "completed" },
];

function targetMeta(targetDate: string, completed: boolean) {
  const d = differenceInCalendarDays(parseISO(targetDate), new Date());
  const fmt = format(parseISO(targetDate), "MMM d");
  if (completed) return { tone: "neutral" as const, label: `Target ${fmt}` };
  if (d < 0) return { tone: "error" as const, label: `Overdue · ${fmt}` };
  if (d === 0) return { tone: "warning" as const, label: "Target today" };
  if (d === 1) return { tone: "warning" as const, label: "Target tomorrow" };
  if (d <= 3) return { tone: "warning" as const, label: `Target in ${d} days` };
  return { tone: "neutral" as const, label: `Target ${fmt}` };
}

function FadeUp({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 12 }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-24px" }}
      transition={{ duration: 0.3, delay, ease: [0.2, 0, 0, 1] }}
    >
      {children}
    </motion.div>
  );
}

/* ---------------------------------------------------------------- */
/* Page                                                              */
/* ---------------------------------------------------------------- */

export default function WorkflowListPage() {
  const teamQ = useTeam();
  const casesQ = useRecoveryCases();

  const [searchInput, setSearchInput] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");
  const [sort, setSort] = React.useState<SortKey>("newest");

  /* Debounce the search box (250 ms) */
  React.useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  const workflowsQ = useWorkflows({
    search: search || undefined,
    status: statusFilter === "all" ? undefined : statusFilter,
  });

  const memberById = React.useMemo(() => new Map((teamQ.data ?? []).map((m) => [m.id, m])), [teamQ.data]);

  /* Open (non-closed) recovery cases per workflow → blocker indicator */
  const blockersByWorkflow = React.useMemo(() => {
    const map = new Map<string, number>();
    (casesQ.data ?? []).forEach((c) => {
      if (c.status === "closed") return;
      map.set(c.workflowId, (map.get(c.workflowId) ?? 0) + 1);
    });
    return map;
  }, [casesQ.data]);

  const sorted = React.useMemo(() => {
    const list: Workflow[] = [...(workflowsQ.data ?? [])];
    if (sort === "newest") list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    else if (sort === "target") list.sort((a, b) => a.targetDate.localeCompare(b.targetDate));
    else list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [workflowsQ.data, sort]);

  const filtersActive = statusFilter !== "all" || search.length > 0;
  const hasAnyWorkflows = (workflowsQ.data ?? []).length > 0;

  function clearFilters() {
    setSearchInput("");
    setSearch("");
    setStatusFilter("all");
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            Workflows <DemoDataBadge />
          </span>
        }
        description="Plan, allocate and run every body of work from one place."
        actions={
          <M3Button onClick={() => navigate("/workflows/new")}>
            <Plus className="size-[18px]" aria-hidden /> New workflow
          </M3Button>
        }
      />

      {/* Controls */}
      <div className="flex flex-col gap-3 rounded-[24px] bg-card p-4 shadow-xs ring-1 ring-border md:p-5 lg:flex-row lg:items-center">
        <div className="relative lg:w-72 lg:shrink-0">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-outline" aria-hidden />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name or goal…"
            aria-label="Search workflows"
            className="h-12 w-full rounded-xl border border-input bg-background pl-11 pr-4 text-body-md outline-none transition-all duration-200 ease-m3 placeholder:text-outline focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/25 hover:border-outline"
          />
        </div>

        <div role="group" aria-label="Filter by status" className="flex items-center gap-1.5 overflow-x-auto py-0.5 scrollbar-slim">
          {STATUS_FILTERS.map((f) => {
            const active = statusFilter === f.value;
            return (
              <button
                key={f.value}
                type="button"
                aria-pressed={active}
                onClick={() => setStatusFilter(f.value)}
                className={cn(
                  "min-h-11 shrink-0 rounded-full px-4 text-label-md font-medium outline-none transition-all duration-200 ease-m3 focus-visible:ring-[3px] focus-visible:ring-primary/40",
                  active
                    ? "bg-secondary text-secondary-foreground shadow-xs"
                    : "text-on-surface-variant hover:bg-surface-container-high hover:text-foreground"
                )}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        <div className="lg:ml-auto lg:shrink-0">
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger
              aria-label="Sort workflows"
              className="h-11 w-full rounded-full bg-surface-container-low/60 px-4 text-label-md sm:w-52"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-2xl">
              <SelectItem value="newest" className="min-h-11 rounded-full">Newest first</SelectItem>
              <SelectItem value="target" className="min-h-11 rounded-full">Target date</SelectItem>
              <SelectItem value="name" className="min-h-11 rounded-full">Name</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Results */}
      {workflowsQ.isLoading ? (
        <SkeletonTable rows={4} cols={3} />
      ) : workflowsQ.isError ? (
        <ErrorState
          title="Could not load workflows"
          message="Something went wrong while fetching the workflow list."
          onRetry={() => workflowsQ.refetch()}
        />
      ) : sorted.length === 0 ? (
        filtersActive || hasAnyWorkflows ? (
          <EmptyState
            icon={Search}
            title="No workflows match your filters"
            description="Try a different search term or clear the filters to see everything."
            action={
              <M3Button variant="tonal" onClick={clearFilters}>
                Clear filters
              </M3Button>
            }
          />
        ) : (
          <EmptyState
            icon={WorkflowIcon}
            title="No workflows yet"
            description="Create your first workflow — Renova will draft a plan you can review with your team."
            action={
              <M3Button onClick={() => navigate("/workflows/new")}>
                <Plus className="size-[18px]" aria-hidden /> Create workflow
              </M3Button>
            }
          />
        )
      ) : (
        <ul className="flex flex-col gap-3">
          {sorted.map((w, i) => {
            const target = targetMeta(w.targetDate, w.status === "completed");
            const blockerCount = blockersByWorkflow.get(w.id) ?? 0;
            const members = w.memberIds.map((id) => memberById.get(id)).filter((m): m is NonNullable<typeof m> => !!m);
            return (
              <li key={w.id}>
                <FadeUp delay={Math.min(i * 0.04, 0.24)}>
                  <div
                    className="group flex items-stretch overflow-hidden rounded-[24px] bg-card shadow-xs ring-1 ring-border transition-all duration-200 ease-m3 hover:shadow-md hover:ring-primary/30 focus-within:ring-[3px] focus-within:ring-primary/40"
                    onKeyDown={(e) => {
                      if ((e.key === "Enter" || e.key === " ") && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLAnchorElement)) {
                        navigate(`/workflows/${w.id}`);
                      }
                    }}
                  >
                    <a
                      href={`#/workflows/${w.id}`}
                      className="flex min-w-0 flex-1 items-center gap-4 p-4 outline-none md:p-5"
                      aria-label={`Open ${w.name}`}
                    >
                      <WorkflowStatusChip status={w.status} className="hidden sm:inline-flex" />

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-label-lg font-semibold transition-colors group-hover:text-primary">{w.name}</span>
                        <span className="mt-0.5 line-clamp-1 block text-label-md text-on-surface-variant">{w.goal}</span>
                        <span className="mt-2 flex flex-wrap items-center gap-1.5 sm:hidden">
                          <WorkflowStatusChip status={w.status} />
                        </span>
                        <span className="mt-2 flex flex-wrap items-center gap-1.5">
                          <Chip tone={target.tone}>
                            {target.tone === "error" && <OctagonAlert className="size-3.5" aria-hidden />} {target.label}
                          </Chip>
                          {blockerCount > 0 && (
                            <Chip tone="error">
                              <OctagonAlert className="size-3.5" aria-hidden /> {blockerCount} blocker{blockerCount > 1 ? "s" : ""}
                            </Chip>
                          )}
                        </span>
                      </span>

                      <ProgressRing value={w.progress} size={48} stroke={5} className="hidden shrink-0 sm:inline-flex" />

                      <span className="hidden shrink-0 -space-x-2 md:flex" aria-label={`${members.length} team members`}>
                        {members.slice(0, 3).map((m) => (
                          <Avatar key={m.id} name={m.name} accent={m.accent} className="size-8 ring-2 ring-card" />
                        ))}
                        {members.length > 3 && (
                          <span className="z-10 flex size-8 items-center justify-center rounded-full bg-surface-container-high text-[11px] font-semibold text-on-surface-variant ring-2 ring-card">
                            +{members.length - 3}
                          </span>
                        )}
                      </span>

                      <ChevronRight className="size-5 shrink-0 text-outline transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />
                    </a>

                    <div className="flex items-center pr-2 md:pr-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="flex size-11 items-center justify-center rounded-full text-on-surface-variant outline-none transition-colors hover:bg-surface-container-high hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-primary/40"
                            aria-label={`Actions for ${w.name}`}
                          >
                            <MoreVertical className="size-5" aria-hidden />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48 rounded-2xl p-1.5">
                          <DropdownMenuLabel className="px-2 py-1.5 text-label-sm text-on-surface-variant">Quick actions</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="min-h-11 gap-2.5 rounded-full px-3" onSelect={() => navigate(`/workflows/${w.id}`)}>
                            <Eye className="size-4" aria-hidden /> View workflow
                          </DropdownMenuItem>
                          <DropdownMenuItem className="min-h-11 gap-2.5 rounded-full px-3" onSelect={() => navigate(`/workflows/${w.id}/plan`)}>
                            <FlaskConical className="size-4" aria-hidden /> Plan
                          </DropdownMenuItem>
                          <DropdownMenuItem className="min-h-11 gap-2.5 rounded-full px-3" onSelect={() => navigate(`/workflows/${w.id}/allocation`)}>
                            <Users className="size-4" aria-hidden /> Allocation
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </FadeUp>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
