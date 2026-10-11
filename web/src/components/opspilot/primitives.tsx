"use client";

/**
 * Material You (M3) primitives shared by every OpsPilot screen.
 * Views should compose these instead of re-styling raw elements, so tokens,
 * motion and accessibility stay consistent.
 */
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2, AlertTriangle, Inbox, RefreshCw, Info, CheckCircle2, OctagonAlert, Circle, CircleDot, Eye, Ban, FlaskConical, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { BlockerSeverity, TaskPriority, TaskStatus, WorkflowStatus, BlockerStatus } from "@/lib/api/types";

/* ------------------------------------------------------------------ */
/* Button                                                              */
/* ------------------------------------------------------------------ */

const m3ButtonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-all duration-200 ease-m3 select-none outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-95 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 min-h-11",
  {
    variants: {
      variant: {
        filled: "bg-primary text-primary-foreground shadow-sm hover:shadow-md hover:bg-primary/92",
        tonal: "bg-secondary text-secondary-foreground hover:bg-secondary/80 hover:shadow-sm",
        elevated: "bg-card text-primary shadow-md hover:shadow-lg",
        outlined: "border border-outline text-primary bg-transparent hover:bg-primary/8",
        text: "text-primary px-3 hover:bg-primary/8",
        destructive: "bg-error text-white shadow-sm hover:shadow-md hover:bg-error/90",
        "destructive-tonal": "bg-error-container text-on-error-container hover:bg-error-container/80",
        "success-tonal": "bg-success-container text-on-success-container hover:bg-success-container/80",
      },
      size: {
        sm: "h-9 min-h-9 px-4 text-label-md [&_svg:not([class*='size-'])]:size-4",
        md: "h-11 px-6 text-label-lg [&_svg:not([class*='size-'])]:size-[18px]",
        lg: "h-12 px-7 text-body-md [&_svg:not([class*='size-'])]:size-5",
        icon: "h-11 w-11 p-0 [&_svg:not([class*='size-'])]:size-5",
      },
    },
    defaultVariants: { variant: "filled", size: "md" },
  }
);

export interface M3ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof m3ButtonVariants> {
  loading?: boolean;
}

export function M3Button({ className, variant, size, loading, children, disabled, ...props }: M3ButtonProps) {
  return (
    <button className={cn(m3ButtonVariants({ variant, size }), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading && <Loader2 className="animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Chips & status                                                      */
/* ------------------------------------------------------------------ */

const chipTones = {
  neutral: "bg-surface-container-high text-on-surface-variant",
  primary: "bg-secondary text-secondary-foreground",
  success: "bg-success-container text-on-success-container",
  warning: "bg-warning-container text-on-warning-container",
  error: "bg-error-container text-on-error-container",
  info: "bg-info-container text-on-info-container",
  tertiary: "bg-tertiary-container text-on-tertiary-container",
  outline: "border border-outline-variant text-on-surface-variant bg-transparent",
} as const;

export function Chip({ tone = "neutral", className, children, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof chipTones }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-label-sm font-medium", chipTones[tone], className)}
      {...props}
    >
      {children}
    </span>
  );
}

export const TASK_STATUS_META: Record<TaskStatus, { label: string; tone: keyof typeof chipTones; icon: React.ElementType }> = {
  todo: { label: "To do", tone: "neutral", icon: Circle },
  in_progress: { label: "In progress", tone: "primary", icon: CircleDot },
  blocked: { label: "Blocked", tone: "error", icon: OctagonAlert },
  in_review: { label: "In review", tone: "warning", icon: Eye },
  done: { label: "Done", tone: "success", icon: CheckCircle2 },
};

export const WORKFLOW_STATUS_META: Record<WorkflowStatus, { label: string; tone: keyof typeof chipTones; icon: React.ElementType }> = {
  draft: { label: "Draft", tone: "neutral", icon: Circle },
  planning: { label: "Planning", tone: "tertiary", icon: FlaskConical },
  ready_for_allocation: { label: "Ready to allocate", tone: "info", icon: CircleDot },
  allocated: { label: "Allocated", tone: "primary", icon: CircleDot },
  active: { label: "Active", tone: "primary", icon: CircleDot },
  completed: { label: "Completed", tone: "success", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", tone: "outline", icon: Ban },
};

export const BLOCKER_STATUS_META: Record<BlockerStatus, { label: string; tone: keyof typeof chipTones; icon: React.ElementType }> = {
  open: { label: "Open", tone: "error", icon: OctagonAlert },
  analyzing: { label: "Analyzing", tone: "warning", icon: RefreshCw },
  recovering: { label: "Recovering", tone: "info", icon: RefreshCw },
  resolved: { label: "Resolved", tone: "success", icon: CheckCircle2 },
};

function ChipFromMeta({ meta, className, pulse }: { meta: { label: string; tone: keyof typeof chipTones; icon: React.ElementType }; className?: string; pulse?: boolean }) {
  const Icon = meta.icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-label-sm font-medium", chipTones[meta.tone], pulse && "animate-pulse-soft", className)}>
      <Icon className="size-3.5" aria-hidden />
      {meta.label}
    </span>
  );
}

export function TaskStatusChip({ status, className }: { status: TaskStatus; className?: string }) {
  return <ChipFromMeta meta={TASK_STATUS_META[status]} className={className} />;
}
export function WorkflowStatusChip({ status, className }: { status: WorkflowStatus; className?: string }) {
  return <ChipFromMeta meta={WORKFLOW_STATUS_META[status]} className={className} />;
}
export function BlockerStatusChip({ status, className }: { status: BlockerStatus; className?: string }) {
  return <ChipFromMeta meta={BLOCKER_STATUS_META[status]} className={className} />;
}

const PRIORITY_META: Record<TaskPriority, { label: string; tone: keyof typeof chipTones }> = {
  low: { label: "Low", tone: "outline" },
  medium: { label: "Medium", tone: "info" },
  high: { label: "High", tone: "warning" },
  critical: { label: "Critical", tone: "error" },
};

export function PriorityChip({ priority, className }: { priority: TaskPriority; className?: string }) {
  const meta = PRIORITY_META[priority];
  return (
    <Chip tone={meta.tone} className={className}>
      <AlertTriangle className="size-3.5" aria-hidden />
      {meta.label}
    </Chip>
  );
}

const SEVERITY_META: Record<BlockerSeverity, { label: string; tone: keyof typeof chipTones }> = {
  low: { label: "Low severity", tone: "outline" },
  medium: { label: "Medium severity", tone: "warning" },
  high: { label: "High severity", tone: "error" },
  critical: { label: "Critical severity", tone: "error" },
};

export function SeverityChip({ severity, className }: { severity: BlockerSeverity; className?: string }) {
  const meta = SEVERITY_META[severity];
  return (
    <Chip tone={meta.tone} className={className}>
      <AlertTriangle className="size-3.5" aria-hidden />
      {meta.label}
    </Chip>
  );
}

/* ------------------------------------------------------------------ */
/* Avatars                                                             */
/* ------------------------------------------------------------------ */

export function Avatar({ name, accent, className, title }: { name: string; accent: string; className?: string; title?: string }) {
  const initials = name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <span
      title={title ?? name}
      className={cn("inline-flex size-9 items-center justify-center rounded-full text-label-md font-medium text-white select-none", className)}
      style={{ backgroundColor: accent }}
      aria-hidden={false}
      role="img"
      aria-label={name}
    >
      {initials}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Layout helpers                                                      */
/* ------------------------------------------------------------------ */

export function PageHeader({
  title, description, breadcrumbs, actions, className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-6", className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-2">
          <ol className="flex flex-wrap items-center gap-1 text-label-md text-on-surface-variant">
            {breadcrumbs.map((b, i) => (
              <li key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="size-3.5 text-outline" aria-hidden />}
                {b.href ? (
                  <a href={b.href} className="rounded px-1 py-0.5 hover:bg-surface-container-high hover:text-primary transition-colors">{b.label}</a>
                ) : (
                  <span className="px-1 py-0.5 text-foreground font-medium" aria-current="page">{b.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-title-lg font-bold tracking-tight">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-label-lg text-on-surface-variant">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function SectionHeading({ eyebrow, title, description, align = "left", dark = false, className }: {
  eyebrow?: string; title: React.ReactNode; description?: React.ReactNode; align?: "left" | "center"; dark?: boolean; className?: string;
}) {
  return (
    <div className={cn("max-w-3xl", align === "center" && "mx-auto text-center", className)}>
      {eyebrow && (
        <p className={cn("mb-3 text-label-md font-bold uppercase tracking-[0.18em]", dark ? "text-[#b79df5]" : "text-primary")}>{eyebrow}</p>
      )}
      <h2 className={cn("text-headline-md font-bold tracking-tight text-balance md:text-title-lg", dark ? "text-white" : "text-foreground")}>{title}</h2>
      {description && <p className={cn("mt-3 text-body-md", dark ? "text-white/70" : "text-on-surface-variant")}>{description}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* States                                                              */
/* ------------------------------------------------------------------ */

export function EmptyState({ icon: Icon = Inbox, title, description, action, className }: {
  icon?: React.ElementType; title: string; description?: string; action?: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-[24px] border border-dashed border-outline-variant bg-surface-container-low/60 px-6 py-14 text-center", className)}>
      <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
        <Icon className="size-6" aria-hidden />
      </div>
      <h3 className="text-title-md font-semibold">{title}</h3>
      {description && <p className="mt-1.5 max-w-md text-label-lg text-on-surface-variant">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", message, onRetry, className, retryLabel = "Try again" }: {
  title?: string; message?: string; onRetry?: () => void; className?: string; retryLabel?: string;
}) {
  return (
    <div role="alert" className={cn("flex flex-col items-center justify-center rounded-[24px] border border-error/30 bg-error-container/50 px-6 py-12 text-center", className)}>
      <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-error-container text-on-error-container">
        <AlertTriangle className="size-6" aria-hidden />
      </div>
      <h3 className="text-title-md font-semibold text-on-error-container">{title}</h3>
      {message && <p className="mt-1.5 max-w-md text-label-lg text-on-surface-variant">{message}</p>}
      {onRetry && (
        <M3Button variant="outlined" size="sm" className="mt-5" onClick={onRetry}>
          <RefreshCw className="size-4" aria-hidden /> {retryLabel}
        </M3Button>
      )}
    </div>
  );
}

export function LoadingBlock({ label = "Loading", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex items-center justify-center gap-3 py-12 text-label-lg text-on-surface-variant", className)} role="status" aria-live="polite">
      <Loader2 className="size-5 animate-spin text-primary" aria-hidden />
      {label}…
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-[24px] border border-border" aria-hidden>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 border-b border-border/70 px-5 py-4 last:border-0">
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className="h-4 flex-1 animate-pulse rounded-full bg-surface-container-high" style={{ animationDelay: `${(r * cols + c) * 60}ms` }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", className)} aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-[24px] border border-border p-5">
          <div className="mb-4 h-4 w-1/3 animate-pulse rounded-full bg-surface-container-high" />
          <div className="mb-2 h-6 w-3/4 animate-pulse rounded-full bg-surface-container-high" style={{ animationDelay: "80ms" }} />
          <div className="h-3 w-full animate-pulse rounded-full bg-surface-container" style={{ animationDelay: "160ms" }} />
          <div className="mt-2 h-3 w-2/3 animate-pulse rounded-full bg-surface-container" style={{ animationDelay: "240ms" }} />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stats & data viz                                                    */
/* ------------------------------------------------------------------ */

export function StatCard({ label, value, sub, icon: Icon, tone = "primary", href, onClick, className }: {
  label: string; value: React.ReactNode; sub?: string; icon?: React.ElementType;
  tone?: "primary" | "error" | "warning" | "success" | "info"; href?: string; onClick?: () => void; className?: string;
}) {
  const toneIcon = {
    primary: "bg-secondary text-primary",
    error: "bg-error-container text-on-error-container",
    warning: "bg-warning-container text-on-warning-container",
    success: "bg-success-container text-on-success-container",
    info: "bg-info-container text-on-info-container",
  }[tone];
  const Tag: React.ElementType = href ? "a" : onClick ? "button" : "div";
  return (
    <Tag
      href={href}
      onClick={onClick}
      className={cn(
        "group flex min-h-11 items-center gap-4 rounded-[24px] bg-card p-5 text-left shadow-xs ring-1 ring-border transition-all duration-200 ease-m3",
        (href || onClick) && "cursor-pointer hover:shadow-md hover:ring-primary/30 active:scale-[0.98]",
        className
      )}
    >
      {Icon && (
        <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-2xl transition-transform group-hover:scale-105", toneIcon)}>
          <Icon className="size-5" aria-hidden />
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-label-md text-on-surface-variant">{label}</span>
        <span className="block text-title-lg font-bold leading-tight">{value}</span>
        {sub && <span className="mt-0.5 block truncate text-label-sm text-on-surface-variant">{sub}</span>}
      </span>
    </Tag>
  );
}

export function ProgressRing({ value, size = 64, stroke = 7, className, showLabel = true }: {
  value: number; size?: number; stroke?: number; className?: string; showLabel?: boolean;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("relative inline-flex items-center justify-center", className)} role="img" aria-label={`${pct}% complete`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-container-high)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--primary)" strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (pct / 100) * c}
          className="transition-[stroke-dashoffset] duration-500 ease-m3"
        />
      </svg>
      {showLabel && <span className="absolute text-label-md font-bold">{pct}%</span>}
    </div>
  );
}

export function WorkloadBar({ allocated, capacity, availability = 1, className }: {
  allocated: number; capacity: number; availability?: number; className?: string;
}) {
  const effective = capacity * availability;
  const pct = effective > 0 ? Math.min(100, Math.round((allocated / effective) * 100)) : 0;
  const tone = pct >= 95 ? "bg-error" : pct >= 75 ? "bg-warning" : "bg-success";
  const label = pct >= 95 ? "At or over capacity" : pct >= 75 ? "Near capacity" : "Healthy workload";
  return (
    <div className={cn("w-full", className)} role="img" aria-label={`Workload ${pct}%. ${label}`}>
      <div className="mb-1 flex items-center justify-between text-label-sm">
        <span className="text-on-surface-variant">{allocated}h of {Math.round(effective)}h</span>
        <span className="font-medium">{pct}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container-high">
        <div className={cn("h-full rounded-full transition-all duration-500 ease-m3", tone)} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-label-sm text-on-surface-variant">{label}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Dialogs                                                             */
/* ------------------------------------------------------------------ */

export function ConfirmDialog({
  open, onOpenChange, title, description, confirmLabel = "Confirm", cancelLabel = "Cancel", destructive, onConfirm, loading, children,
}: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: React.ReactNode;
  confirmLabel?: string; cancelLabel?: string; destructive?: boolean; onConfirm: () => void; loading?: boolean; children?: React.ReactNode;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md rounded-[28px] border-border bg-popover p-6">
        <AlertDialogHeader className="text-left">
          <AlertDialogTitle className="text-title-md">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-label-lg text-on-surface-variant">{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel className="mt-0 min-h-11 rounded-full border-outline px-5 font-medium hover:bg-surface-container-high">{cancelLabel}</AlertDialogCancel>
          <M3Button variant={destructive ? "destructive" : "filled"} onClick={onConfirm} loading={loading} className="px-5">
            {confirmLabel}
          </M3Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ------------------------------------------------------------------ */
/* Misc                                                                */
/* ------------------------------------------------------------------ */

export function DemoDataBadge({ className, label = "Demo data" }: { className?: string; label?: string }) {
  return (
    <Chip tone="info" className={cn("gap-1", className)} title="Sample data from the mock adapter — nothing here touches a real backend.">
      <Info className="size-3.5" aria-hidden /> {label}
    </Chip>
  );
}

export function TextField({ label, error, hint, id, className, required, ...props }: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string; error?: string; hint?: string; id?: string;
}) {
  const autoId = React.useId();
  const inputId = id ?? autoId;
  return (
    <div className={cn("w-full", className)}>
      <label htmlFor={inputId} className="mb-1.5 block text-label-md font-medium">
        {label} {required && <span className="text-error" aria-hidden>*</span>}
      </label>
      <input
        id={inputId}
        aria-invalid={!!error || undefined}
        aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
        className={cn(
          "h-12 w-full rounded-xl border bg-background px-4 text-body-md outline-none transition-all duration-200 ease-m3 placeholder:text-outline",
          "focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/25",
          error ? "border-error" : "border-input hover:border-outline"
        )}
        {...props}
      />
      {error && <p id={`${inputId}-error`} className="mt-1.5 text-label-md text-error" role="alert">{error}</p>}
      {!error && hint && <p id={`${inputId}-hint`} className="mt-1.5 text-label-sm text-on-surface-variant">{hint}</p>}
    </div>
  );
}

export function TextArea({ label, error, hint, id, className, required, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string; error?: string; hint?: string; id?: string;
}) {
  const autoId = React.useId();
  const inputId = id ?? autoId;
  return (
    <div className={cn("w-full", className)}>
      <label htmlFor={inputId} className="mb-1.5 block text-label-md font-medium">
        {label} {required && <span className="text-error" aria-hidden>*</span>}
      </label>
      <textarea
        id={inputId}
        aria-invalid={!!error || undefined}
        className={cn(
          "min-h-24 w-full rounded-xl border bg-background px-4 py-3 text-body-md outline-none transition-all duration-200 ease-m3 placeholder:text-outline scrollbar-slim",
          "focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/25",
          error ? "border-error" : "border-input hover:border-outline"
        )}
        {...props}
      />
      {error && <p className="mt-1.5 text-label-md text-error" role="alert">{error}</p>}
      {!error && hint && <p className="mt-1.5 text-label-sm text-on-surface-variant">{hint}</p>}
    </div>
  );
}
