"use client";

/**
 * Settings — workspace preferences (lead-editable), account profile, and the
 * clearly-marked demo controls that drive the mock adapter's failure rate.
 */
import * as React from "react";
import {
  ArrowRight, Building2, Check, Copy, CreditCard, Database, FlaskConical, Info, Lock, Save, Timer, UserCog,
} from "lucide-react";
import {
  Chip, DemoDataBadge, ErrorState, LoadingBlock, M3Button, PageHeader, SectionHeading,
  TextField,
} from "../primitives";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  useMockBehavior, useSession, useSetMockBehavior, useSettings, useUpdateProfile, useUpdateSettings,
} from "@/lib/api/queries";
import { navigate } from "@/lib/router";
import { useSubscriptionStore } from "@/lib/subscription";
import type { WorkspaceSettings } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const TIMEZONES = [
  "UTC",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "Asia/Calcutta",
  "Asia/Tokyo",
  "Australia/Sydney",
];

const NOTIFICATION_FIELDS: { key: keyof WorkspaceSettings["notifications"]; label: string; hint: string }[] = [
  { key: "blockerReported", label: "Blocker reported", hint: "Notify when a teammate reports a blocker." },
  { key: "recoveryDecisions", label: "Recovery decisions", hint: "Notify when a recovery decision is submitted or applied." },
  { key: "weeklyDigest", label: "Weekly digest", hint: "A weekly summary of plan health and usage." },
  { key: "deadlineReminders", label: "Deadline reminders", hint: "Remind the team ahead of at-risk deadlines." },
];

function ReadOnlyField({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-label-md font-medium">
        <Lock className="size-3.5 text-on-surface-variant" aria-hidden />
        {label}
      </p>
      <div className="flex h-12 items-center rounded-xl border border-outline-variant bg-surface-container-low px-4 text-body-md text-on-surface-variant">
        {value}
      </div>
      {hint && <p className="mt-1.5 text-label-sm text-on-surface-variant">{hint}</p>}
    </div>
  );
}

function SwitchRow({ label, hint, checked, disabled, onCheckedChange }: {
  label: string; hint: string; checked: boolean; disabled?: boolean; onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <Label className="text-label-md font-medium">{label}</Label>
        <p className="mt-0.5 text-label-sm text-on-surface-variant">{hint}</p>
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} aria-label={label} />
    </div>
  );
}

export default function SettingsPage() {
  const { data: session } = useSession();
  const { data: settings, isLoading, isError, refetch } = useSettings();
  const { state: subscription } = useSubscriptionStore();
  const { data: mockBehavior } = useMockBehavior();
  const updateSettings = useUpdateSettings();
  const updateProfile = useUpdateProfile();
  const setMock = useSetMockBehavior();

  const isLead = session?.user.role === "team_lead";

  /* ---------- Workspace form ---------- */
  const [ws, setWs] = React.useState<Pick<WorkspaceSettings, "name" | "timezone" | "weekStart" | "notifications">>({
    name: "", timezone: "UTC", weekStart: "monday",
    notifications: { blockerReported: true, recoveryDecisions: true, weeklyDigest: false, deadlineReminders: true },
  });
  const [loadedWs, setLoadedWs] = React.useState(false);

  React.useEffect(() => {
    if (!settings || loadedWs) return;
    setWs({ name: settings.name, timezone: settings.timezone, weekStart: settings.weekStart, notifications: { ...settings.notifications } });
    setLoadedWs(true);
  }, [settings, loadedWs]);

  const wsDirty = !!settings && (
    ws.name !== settings.name ||
    ws.timezone !== settings.timezone ||
    ws.weekStart !== settings.weekStart ||
    JSON.stringify(ws.notifications) !== JSON.stringify(settings.notifications)
  );

  const saveWorkspace = () => {
    if (!wsDirty || !isLead) return;
    updateSettings.mutate({
      name: ws.name.trim(),
      timezone: ws.timezone,
      weekStart: ws.weekStart,
      notifications: ws.notifications,
    });
  };

  /* ---------- Account form ---------- */
  const [profile, setProfile] = React.useState({ name: "", title: "" });
  const [profileLoaded, setProfileLoaded] = React.useState(false);

  React.useEffect(() => {
    if (!session || profileLoaded) return;
    setProfile({ name: session.user.name, title: session.user.title ?? "" });
    setProfileLoaded(true);
  }, [session, profileLoaded]);

  const profileDirty = !!session && (
    profile.name !== session.user.name ||
    profile.title !== (session.user.title ?? "")
  );

  const saveProfile = () => {
    if (!profileDirty) return;
    updateProfile.mutate({ name: profile.name.trim(), title: profile.title.trim() });
  };

  /* ---------- Demo controls ---------- */
  const [failurePct, setFailurePct] = React.useState<number>(0);
  const mockLoadedRef = React.useRef(false);

  React.useEffect(() => {
    if (!mockBehavior || mockLoadedRef.current) return;
    setFailurePct(Math.round(mockBehavior.failureRate * 100));
    mockLoadedRef.current = true;
  }, [mockBehavior]);

  const commitFailureRate = (v: number) => {
    setFailurePct(v);
    setMock.mutate({ failureRate: v / 100 });
  };

  const [copied, setCopied] = React.useState(false);
  const inviteCode = session?.workspace.inviteCode ?? "—";
  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      toast.success("Invite code copied", { description: inviteCode });
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copy failed — select the code and copy it manually.");
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:py-8">
        <PageHeader title="Settings" description="Workspace preferences, your account, and demo data controls." actions={<DemoDataBadge />} />
        <LoadingBlock label="Loading settings" />
      </div>
    );
  }

  if (isError || !settings) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:py-8">
        <PageHeader title="Settings" description="Workspace preferences, your account, and demo data controls." actions={<DemoDataBadge />} />
        <ErrorState message="Settings could not be loaded." onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:py-8">
      <PageHeader
        title="Settings"
        description="Workspace preferences, your account, and demo data controls."
        actions={<DemoDataBadge />}
      />

      <div className="space-y-8">
        {/* ---------------- Workspace ---------------- */}
        <section aria-labelledby="ws-settings" className="rounded-[28px] bg-card p-6 ring-1 ring-border">
          <SectionHeading
            title="Workspace"
            description={isLead
              ? "Applies to everyone in this workspace."
              : "View-only for employees — your team lead manages these."}
          />
          <span id="ws-settings" className="sr-only">Workspace settings</span>

          <div className="mt-6 grid gap-5 md:grid-cols-2">
            {isLead ? (
              <TextField
                label="Workspace name"
                value={ws.name}
                disabled={updateSettings.isPending}
                onChange={(e) => setWs((s) => ({ ...s, name: e.target.value }))}
              />
            ) : (
              <ReadOnlyField label="Workspace name" value={settings.name} hint="Only team leads can rename the workspace." />
            )}

            {isLead ? (
              <div>
                <p className="mb-1.5 text-label-md font-medium">Timezone</p>
                <Select value={ws.timezone} onValueChange={(v) => setWs((s) => ({ ...s, timezone: v }))}>
                  <SelectTrigger className="h-12 w-full rounded-xl" aria-label="Workspace timezone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz} value={tz}>{tz.replace("_", " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <ReadOnlyField label="Timezone" value={settings.timezone} hint="Only team leads can change the timezone." />
            )}

            <div className="md:col-span-2">
              <p className="mb-1.5 text-label-md font-medium">Week starts on</p>
              <div className="inline-flex rounded-full bg-surface-container-high p-1" role="group" aria-label="Week start day">
                {(["monday", "sunday"] as const).map((d) => {
                  const active = isLead ? ws.weekStart === d : settings.weekStart === d;
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={active}
                      disabled={!isLead}
                      onClick={() => isLead && setWs((s) => ({ ...s, weekStart: d }))}
                      className={cn(
                        "min-h-11 rounded-full px-5 text-label-md font-medium capitalize transition-all duration-200 ease-m3 outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40 disabled:opacity-60",
                        active ? "bg-primary text-primary-foreground shadow-sm" : "text-on-surface-variant hover:bg-surface-container-highest"
                      )}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
              {!isLead && (
                <p className="mt-1.5 flex items-center gap-1.5 text-label-sm text-on-surface-variant">
                  <Lock className="size-3.5" aria-hidden /> Locked by your team lead.
                </p>
              )}
            </div>
          </div>

          <div className="mt-6 border-t border-outline-variant/60 pt-2">
            <p className="mb-1 mt-3 text-label-md font-medium">Notifications</p>
            {NOTIFICATION_FIELDS.map((f) => (
              <SwitchRow
                key={f.key}
                label={f.label}
                hint={f.hint}
                checked={isLead ? ws.notifications[f.key] : settings.notifications[f.key]}
                disabled={!isLead || updateSettings.isPending}
                onCheckedChange={(v) =>
                  isLead && setWs((s) => ({ ...s, notifications: { ...s.notifications, [f.key]: v } }))
                }
              />
            ))}
            {!isLead && (
              <p className="mt-1 flex items-center gap-1.5 text-label-sm text-on-surface-variant">
                <Lock className="size-3.5" aria-hidden /> Notification defaults are managed by your team lead.
              </p>
            )}
          </div>

          {isLead && (
            <div className="mt-5 flex items-center gap-3">
              <M3Button onClick={saveWorkspace} loading={updateSettings.isPending} disabled={!wsDirty || updateSettings.isPending}>
                <Save className="size-4" aria-hidden /> Save workspace settings
              </M3Button>
              {!wsDirty && <span className="text-label-sm text-on-surface-variant">No changes to save.</span>}
            </div>
          )}
        </section>

        {/* ---------------- Subscription & billing ---------------- */}
        <section aria-labelledby="subscription-settings" className="rounded-[28px] bg-card p-6 ring-1 ring-border">
          <SectionHeading title="Subscription & billing" description="The workspace's simulated plan state — no billing exists in this demo." />
          <span id="subscription-settings" className="sr-only">Subscription settings</span>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Chip tone="primary">
              <CreditCard className="size-3.5" aria-hidden />
              {subscription?.plan ?? "Team"} plan · simulated
            </Chip>
            <Chip tone="outline">Demo — no payments, stored in this browser</Chip>
            <M3Button variant="text" className="ml-auto" onClick={() => navigate("/subscription")}>
              Manage subscription <ArrowRight className="size-4" aria-hidden />
            </M3Button>
          </div>
        </section>

        {/* ---------------- Account ---------------- */}
        <section aria-labelledby="account-settings" className="rounded-[28px] bg-card p-6 ring-1 ring-border">
          <SectionHeading title="Account" description="How you appear to teammates across plans, tasks and decisions." />
          <span id="account-settings" className="sr-only">Account settings</span>

          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <TextField
              label="Display name"
              value={profile.name}
              disabled={updateProfile.isPending}
              onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
            />
            <TextField
              label="Title"
              value={profile.title}
              placeholder="e.g. Backend Engineer"
              disabled={updateProfile.isPending}
              onChange={(e) => setProfile((p) => ({ ...p, title: e.target.value }))}
            />
            <ReadOnlyField label="Email" value={session?.user.email ?? "—"} hint="Email is fixed in this demo environment." />
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-label-md font-medium">
                <Lock className="size-3.5 text-on-surface-variant" aria-hidden />
                Role
              </p>
              <Chip tone={session?.user.role === "team_lead" ? "primary" : "neutral"} className="h-11 px-4">
                {session?.user.role === "team_lead" ? <Building2 className="size-3.5" aria-hidden /> : <UserCog className="size-3.5" aria-hidden />}
                {session?.user.role === "team_lead" ? "Team lead" : "Employee"}
              </Chip>
              <p className="mt-1.5 text-label-sm text-on-surface-variant">Roles are managed by the workspace owner.</p>
            </div>
          </div>

          <div className="mt-5 flex items-center gap-3">
            <M3Button onClick={saveProfile} loading={updateProfile.isPending} disabled={!profileDirty || updateProfile.isPending}>
              <Save className="size-4" aria-hidden /> Save profile
            </M3Button>
            {!profileDirty && <span className="text-label-sm text-on-surface-variant">No changes to save.</span>}
          </div>
        </section>

        {/* ---------------- Demo & data controls ---------------- */}
        <section
          aria-labelledby="demo-controls"
          className="rounded-[28px] border-2 border-dashed border-outline-variant bg-surface-container-low/60 p-6"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone="warning">
              <FlaskConical className="size-3.5" aria-hidden />
              DEMO — test controls
            </Chip>
            <Chip tone="info">
              <Database className="size-3.5" aria-hidden />
              Mock adapter
            </Chip>
          </div>
          <SectionHeading
            className="mt-3"
            title="Demo & data controls"
            description="This workspace runs on a mock adapter. Use the controls below to exercise honest error and latency states — no real system is affected."
          />
          <span id="demo-controls" className="sr-only">Demo and data controls</span>

          <div className="mt-6 space-y-6">
            {/* Failure rate */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor="failure-rate" className="text-label-md font-medium">Simulated API failure rate</Label>
                <Chip tone={failurePct === 0 ? "success" : failurePct > 50 ? "error" : "warning"}>
                  <Timer className="size-3.5" aria-hidden />
                  {failurePct}% of requests fail
                </Chip>
              </div>
              <Slider
                id="failure-rate"
                className="mt-4"
                min={0}
                max={100}
                step={5}
                value={[failurePct]}
                onValueChange={(v) => setFailurePct(v[0] ?? 0)}
                onValueCommit={(v) => commitFailureRate(v[0] ?? 0)}
                aria-label="Simulated API failure rate percent"
              />
              <div className="mt-1 flex justify-between text-label-sm text-on-surface-variant">
                <span>0% (reliable)</span>
                <span>100% (chaos)</span>
              </div>
            </div>

            {/* Latency */}
            <SwitchRow
              label="Simulated network latency"
              hint="Adds realistic delays so loading states are visible."
              checked={!!mockBehavior?.latency}
              onCheckedChange={(v) => setMock.mutate({ latency: v })}
            />

            <div className="flex items-start gap-2 rounded-2xl bg-info-container p-4 text-label-md text-on-info-container" role="note">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>Simulated failures return 503 and nothing is persisted. Resets on reload.</span>
            </div>

            {/* Read-only demo info */}
            <div className="grid gap-5 md:grid-cols-2">
              <ReadOnlyField
                label="Workspace invite code"
                value={
                  <span className="flex w-full items-center justify-between gap-2">
                    <code className="font-mono font-semibold text-foreground">{inviteCode}</code>
                    <button
                      type="button"
                      onClick={copyInvite}
                      aria-label="Copy invite code"
                      className="inline-flex size-9 items-center justify-center rounded-full text-primary hover:bg-primary/8 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40"
                    >
                      {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                    </button>
                  </span>
                }
                hint="Share this code so teammates can join the workspace."
              />
              <ReadOnlyField label="Plan" value={session?.workspace.plan ?? "—"} hint="Plan management lives under Plan & usage." />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
