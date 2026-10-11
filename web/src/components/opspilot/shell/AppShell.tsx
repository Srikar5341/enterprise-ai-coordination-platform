"use client";

/**
 * Responsive application shell: desktop sidebar + mobile sheet, topbar with
 * contextual notifications and user menu, and a sticky bottom status footer.
 */
import * as React from "react";
import {
  LayoutDashboard, Workflow as WorkflowIcon, ListChecks, LifeBuoy, Stamp, Users, ShieldAlert,
  ScrollText, GaugeCircle, Settings, LogOut, Bell, Menu, CircleUser, Database, X, Sparkles, Home,
  CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { navigate, useHashRoute } from "@/lib/router";
import { ROLE_HOME } from "@/lib/roles";
import { API_MODE } from "@/lib/api/client";
import { useApprovedChanges, useLogout, useMyTasks, useRecoveryCases, useSession } from "@/lib/api/queries";
import type { UserRole } from "@/lib/api/types";
import { formatDistanceToNow, isToday, isTomorrow, parseISO } from "date-fns";
import { Avatar } from "../primitives";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

export function BrandMark({ className, dark = false }: { className?: string; dark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <img
        src="/images/renova-mark.png"
        alt=""
        aria-hidden="true"
        decoding="async"
        className="size-9 shrink-0 rounded-xl object-cover ring-1 ring-border"
        width={36}
        height={36}
      />
      <span className={cn("text-title-md font-bold tracking-tight", dark ? "text-white" : "text-foreground")}>
        Re<span className="text-primary">nova</span>
      </span>
    </span>
  );
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badgeKey?: "recovery" | "approvals" | "blocked";
}

/**
 * Distinct navigation per role — derived ONLY from the authenticated session's
 * role (see src/lib/roles.ts for the matching route guard map). Recovery,
 * approvals, risks, team/audit/usage are team-lead exclusive; employees get a
 * focused personal-workspace nav including the AI Work Assistant.
 */
const NAV_BY_ROLE: Record<UserRole, { section: string; items: NavItem[] }[]> = {
  team_lead: [
    {
      section: "Coordinate",
      items: [
        { label: "Overview", href: "/overview", icon: LayoutDashboard },
        { label: "Workflows", href: "/workflows", icon: WorkflowIcon },
        { label: "Team", href: "/team", icon: Users },
      ],
    },
    {
      section: "Recover",
      items: [
        { label: "Recovery Center", href: "/recovery", icon: LifeBuoy, badgeKey: "recovery" },
        { label: "Approvals", href: "/approvals", icon: Stamp, badgeKey: "approvals" },
        { label: "Risks", href: "/risks", icon: ShieldAlert },
      ],
    },
    {
      section: "Workspace",
      items: [
        { label: "Audit Trail", href: "/audit", icon: ScrollText },
        { label: "Plan & Usage", href: "/usage", icon: GaugeCircle },
        { label: "Subscription", href: "/subscription", icon: CreditCard },
        { label: "Settings", href: "/settings", icon: Settings },
      ],
    },
  ],
  employee: [
    {
      section: "My work",
      items: [
        { label: "My Workspace", href: "/my-workspace", icon: Home },
        { label: "My Tasks", href: "/tasks", icon: ListChecks, badgeKey: "blocked" },
        { label: "AI Assistant", href: "/assistant", icon: Sparkles },
      ],
    },
    {
      section: "Workspace",
      items: [
        { label: "Subscription", href: "/subscription", icon: CreditCard },
        { label: "Settings", href: "/settings", icon: Settings },
      ],
    },
  ],
};

function NavList({ role, onNavigate, badges }: { role: UserRole; onNavigate?: () => void; badges: { recovery: number; approvals: number; blocked: number } }) {
  const route = useHashRoute();
  const groups = NAV_BY_ROLE[role];
  return (
    <nav aria-label="Application" className="flex-1 space-y-6 overflow-y-auto px-3 py-4 scrollbar-slim">
      {groups.map((group) => {
        const items = group.items;
        if (!items.length) return null;
        return (
          <div key={group.section}>
            <p className="mb-1.5 px-3 text-label-sm font-bold uppercase tracking-[0.14em] text-on-surface-variant/70">{group.section}</p>
            <ul className="space-y-0.5">
              {items.map((item) => {
                const active = route.path === item.href || route.path.startsWith(`${item.href}/`);
                const badge = item.badgeKey ? badges[item.badgeKey] : 0;
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <a
                      href={`#${item.href}`}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex min-h-11 items-center gap-3 rounded-full px-4 text-label-lg transition-all duration-200 ease-m3 outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40",
                        active
                          ? "bg-secondary font-semibold text-secondary-foreground shadow-xs"
                          : "text-on-surface-variant hover:bg-surface-container-high hover:text-foreground"
                      )}
                    >
                      <Icon className={cn("size-[18px]", active ? "text-primary" : "text-current opacity-80")} aria-hidden />
                      <span className="flex-1 truncate">{item.label}</span>
                      {badge > 0 && (
                        <span className="flex size-5 items-center justify-center rounded-full bg-error text-[11px] font-bold text-white" aria-label={`${badge} require attention`}>
                          {badge}
                        </span>
                      )}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function UserMenu() {
  const { data: session } = useSession();
  const logout = useLogout();
  if (!session) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex min-h-11 items-center gap-2 rounded-full py-1 pl-1 pr-2 outline-none transition-colors hover:bg-surface-container-high focus-visible:ring-[3px] focus-visible:ring-primary/40" aria-label="Account menu">
          <Avatar name={session.user.name} accent={session.user.accent} className="size-8" />
          <span className="hidden text-left md:block">
            <span className="block text-label-md font-semibold leading-tight">{session.user.name}</span>
            <span className="block text-label-sm capitalize leading-tight text-on-surface-variant">{session.user.role.replace("_", " ")}</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60 rounded-2xl p-2">
        <DropdownMenuLabel className="px-3 py-2">
          <span className="block text-label-md font-semibold">{session.user.name}</span>
          <span className="block text-label-sm text-on-surface-variant">{session.user.email}</span>
          <span className="mt-1 block text-label-sm text-on-surface-variant">{session.workspace.name} · {session.workspace.plan} plan</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="min-h-11 rounded-full px-3" onClick={() => navigate("/settings")}>
          <CircleUser className="size-4" aria-hidden /> Profile & settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="min-h-11 rounded-full px-3 text-error focus:text-error"
          onClick={() => { logout.mutate(); navigate("/"); }}
        >
          <LogOut className="size-4" aria-hidden /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface NotificationItem {
  id: string;
  title: string;
  sub: string;
  href: string;
  tone: "error" | "warning" | "success" | "info";
  at?: string;
}

const TONE_DOT: Record<NotificationItem["tone"], string> = {
  error: "bg-error",
  warning: "bg-tertiary",
  success: "bg-success",
  info: "bg-primary",
};

function EmployeeNotifications(): NotificationItem[] {
  const { data: tasks } = useMyTasks();
  const { data: changes } = useApprovedChanges();
  const items: NotificationItem[] = [];
  (tasks ?? []).forEach((t) => {
    if (t.status === "blocked") {
      items.push({ id: `blk-${t.id}`, title: "Task blocked", sub: `${t.workflowName} — ${t.title}`, href: `/tasks/${t.id}`, tone: "error" });
    } else if (t.status !== "done" && t.dueDate) {
      const d = parseISO(t.dueDate);
      if (isToday(d) || isTomorrow(d)) {
        items.push({ id: `due-${t.id}`, title: isToday(d) ? "Due today" : "Due tomorrow", sub: `${t.workflowName} — ${t.title}`, href: `/tasks/${t.id}`, tone: "warning" });
      }
    }
  });
  (changes ?? []).slice(0, 3).forEach((c) => {
    items.push({
      id: `chg-${c.id}`,
      title: c.details || c.target || "Change approved by your lead",
      sub: `${c.actorName} · ${formatDistanceToNow(parseISO(c.at), { addSuffix: true })}`,
      href: "/tasks",
      tone: "success",
      at: c.at,
    });
  });
  return items;
}

function LeadNotifications(): NotificationItem[] {
  const { data: cases } = useRecoveryCases();
  return (cases ?? [])
    .filter((c) => c.status === "needs_decision" || c.status === "needs_analysis")
    .map((c) => ({
      id: `rc-${c.id}`,
      title: c.status === "needs_decision" ? "Recovery decision pending" : "Blocker needs analysis",
      sub: `${c.workflowName} — ${c.blocker.title}`,
      href: `/recovery/${c.id}`,
      tone: c.status === "needs_decision" ? ("error" as const) : ("warning" as const),
      at: c.createdAt,
    }));
}

function NotificationsButton({ role }: { role: UserRole }) {
  const items = role === "team_lead" ? LeadNotifications() : EmployeeNotifications();
  const open = items.length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative size-11 rounded-full" aria-label={`Notifications${open ? `, ${open} items need attention` : ""}`}>
          <Bell className="size-5" aria-hidden />
          {open > 0 && <span className="absolute right-2 top-2 size-2.5 rounded-full bg-error ring-2 ring-background" aria-hidden />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 rounded-[24px] p-4">
        <p className="mb-2 text-title-sm font-semibold">Needs attention</p>
        {open === 0 ? (
          <p className="py-4 text-center text-label-lg text-on-surface-variant">You&apos;re all caught up.</p>
        ) : (
          <ul className="max-h-80 space-y-2 overflow-y-auto scrollbar-slim">
            {items.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.href}`}
                  className="flex items-start gap-2.5 rounded-2xl bg-surface-container-low p-3 transition-colors hover:bg-surface-container-high"
                >
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", TONE_DOT[item.tone])} aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-label-md font-semibold">{item.title}</span>
                    <span className="mt-0.5 block truncate text-label-sm text-on-surface-variant">{item.sub}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const { data: cases } = useRecoveryCases();
  const { data: myTasks } = useMyTasks();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const role = session?.user.role ?? "team_lead";
  const badges = {
    recovery: (cases ?? []).filter((c) => c.status === "needs_decision" || c.status === "needs_analysis").length,
    approvals: (cases ?? []).filter((c) => c.status === "needs_decision").length,
    blocked: (myTasks ?? []).filter((t) => t.status === "blocked").length,
  };
  const home = ROLE_HOME[role];

  if (!session) return null;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex flex-1">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-sidebar lg:flex" aria-label="Primary">
          <div className="px-5 pb-2 pt-5">
            <a href={`#${home}`} aria-label="Renova home" className="inline-flex rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40">
              <BrandMark />
            </a>
          </div>
          <NavList role={role} badges={badges} />
          <div className="border-t border-border px-5 py-3">
            <p
              className="flex items-center gap-2 text-label-sm text-on-surface-variant"
              title={
                API_MODE === "http"
                  ? "Goal-to-task planning runs against the shared Renova API; every other surface is still demo data."
                  : "Everything runs on the mock adapter — nothing touches a backend."
              }
            >
              <Database className="size-3.5" aria-hidden /> {API_MODE === "http" ? "Hybrid API · goal flow live, rest demo" : "Mock API · demo data"}
            </p>
          </div>
        </aside>

        {/* Main column */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-md md:px-6">
            {/* Mobile nav */}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="size-11 rounded-full lg:hidden" aria-label="Open navigation">
                  <Menu className="size-5" aria-hidden />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 rounded-r-[28px] border-border bg-sidebar p-0">
                <SheetTitle asChild>
                  <div className="px-5 pb-2 pt-5 text-left"><BrandMark /></div>
                </SheetTitle>
                <NavList role={role} badges={badges} onNavigate={() => setMobileOpen(false)} />
              </SheetContent>
            </Sheet>

            <a href={`#${home}`} aria-label="Renova home" className="lg:hidden inline-flex rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40">
              <BrandMark className="scale-95" />
            </a>

            <div className="ml-auto flex items-center gap-1.5">
              <NotificationsButton role={role} />
              <UserMenu />
            </div>
          </header>

          <main id="main" className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 md:px-6 md:py-8 lg:px-8">
            {children}
          </main>

          {/* Sticky footer — sits at the bottom on short pages, pushed down on long ones */}
          <footer className="mt-auto border-t border-border bg-surface-container-low/60">
            <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center justify-between gap-2 px-4 py-3 text-label-sm text-on-surface-variant md:px-6 lg:px-8">
              <p>Renova · When plans change, progress continues.</p>
              <p className="flex items-center gap-1.5">
                <Database className="size-3.5" aria-hidden />
                Mock adapter — data resets on reload; nothing here changes a real backend.
              </p>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}

export { X as CloseIcon };
