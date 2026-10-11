"use client";

/**
 * Team directory — skills, availability and workload at a glance, plus the
 * lead-only invite flow that surfaces the workspace invite code.
 */
import * as React from "react";
import {
  Briefcase, Check, CircleDot, Copy, Info, Lock, Mail, UserPlus, Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  Avatar, Chip, DemoDataBadge, EmptyState, ErrorState, M3Button, PageHeader,
  SkeletonCards, StatCard, TextField, WorkloadBar,
} from "../primitives";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useInviteMember, useSession, useTeam } from "@/lib/api/queries";
import type { TeamMember } from "@/lib/api/types";
import { cn } from "@/lib/utils";

function SkillDots({ level }: { level: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className={cn("size-1.5 rounded-full", i < level ? "bg-primary" : "bg-surface-container-highest")}
        />
      ))}
    </span>
  );
}

function MemberCard({ member }: { member: TeamMember }) {
  const availabilityPct = Math.round(member.availability * 100);
  return (
    <article className="flex flex-col gap-4 rounded-[24px] bg-card p-5 ring-1 ring-border">
      <div className="flex items-center gap-3">
        <Avatar name={member.name} accent={member.accent} className="size-12 text-title-md" />
        <div className="min-w-0">
          <h3 className="truncate text-title-md font-semibold">{member.name}</h3>
          <p className="truncate text-label-md text-on-surface-variant">{member.title ?? "Team member"}</p>
        </div>
        <span className="ml-auto">
          <Chip tone={member.role === "team_lead" ? "primary" : "neutral"}>
            {member.role === "team_lead" ? "Team lead" : "Employee"}
          </Chip>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={availabilityPct >= 75 ? "success" : "warning"}>
          <CircleDot className="size-3.5" aria-hidden />
          {availabilityPct}% available
        </Chip>
        <Chip tone="outline">
          <Briefcase className="size-3.5" aria-hidden />
          {member.activeTaskCount} active task{member.activeTaskCount === 1 ? "" : "s"}
        </Chip>
      </div>

      {member.skills.length > 0 && (
        <div>
          <p className="mb-2 text-label-md font-medium">Skills</p>
          <ul className="flex flex-wrap gap-2">
            {member.skills.map((s) => (
              <li key={s.name}>
                <span className="inline-flex items-center gap-2 rounded-full bg-surface-container-high px-3 py-1 text-label-sm">
                  {s.name}
                  <SkillDots level={s.level} />
                  <span className="sr-only">{`level ${s.level} of 5`}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <WorkloadBar allocated={member.allocatedHours} capacity={member.weeklyCapacityHours} availability={member.availability} />

      {member.note && (
        <div className="flex items-start gap-2 rounded-2xl bg-info-container p-3 text-label-md text-on-info-container">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{member.note}</span>
        </div>
      )}
    </article>
  );
}

function InviteDialog({ open, onOpenChange, inviteCode }: {
  open: boolean; onOpenChange: (o: boolean) => void; inviteCode: string;
}) {
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<"employee" | "team_lead">("employee");
  const [emailError, setEmailError] = React.useState<string | undefined>(undefined);
  const [succeeded, setSucceeded] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const invite = useInviteMember();

  const reset = () => {
    setEmail("");
    setRole("employee");
    setEmailError(undefined);
    setSucceeded(false);
    setCopied(false);
  };

  const submit = () => {
    const valid = /.+@.+\..+/.test(email.trim());
    if (!valid) {
      setEmailError("Enter a valid email address.");
      return;
    }
    setEmailError(undefined);
    invite.mutate(
      { email: email.trim(), role },
      {
        onSuccess: () => {
          setSucceeded(true);
          setEmail("");
        },
      }
    );
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      toast.success("Invite code copied", { description: inviteCode });
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copy failed — select the code and copy it manually.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-md rounded-[28px] border-border bg-popover p-6">
        <DialogHeader>
          <DialogTitle className="text-title-md">Invite a member</DialogTitle>
          <DialogDescription className="text-label-md text-on-surface-variant">
            Sends a demo invitation — nothing leaves this mock workspace.
          </DialogDescription>
        </DialogHeader>

        {succeeded ? (
          <div className="space-y-4" aria-live="polite">
            <div className="flex items-start gap-2 rounded-2xl bg-success-container p-4 text-on-success-container">
              <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p className="text-label-md">Invitation recorded. Share this invite code so they can join the workspace:</p>
            </div>
            <div className="flex items-center justify-between gap-2 rounded-2xl bg-surface-container-high p-4">
              <code className="font-mono text-title-md font-semibold tracking-wide">{inviteCode}</code>
              <M3Button variant="tonal" size="sm" onClick={copyCode} aria-label="Copy invite code">
                {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                {copied ? "Copied" : "Copy"}
              </M3Button>
            </div>
            <M3Button variant="outlined" className="w-full" onClick={() => onOpenChange(false)}>
              Done
            </M3Button>
          </div>
        ) : (
          <div className="space-y-4">
            <TextField
              label="Email"
              type="email"
              placeholder="teammate@company.com"
              value={email}
              error={emailError}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
              autoFocus
            />
            <div>
              <p className="mb-1.5 text-label-md font-medium" id="invite-role-label">Role</p>
              <Select value={role} onValueChange={(v) => setRole(v as "employee" | "team_lead")}>
                <SelectTrigger aria-labelledby="invite-role-label" className="h-12 w-full rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="team_lead">Team lead</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <M3Button className="w-full" loading={invite.isPending} disabled={invite.isPending} onClick={submit}>
              <Mail className="size-4" aria-hidden /> Send invite
            </M3Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function TeamPage() {
  const { data: session } = useSession();
  const { data: team, isLoading, isError, refetch } = useTeam();
  const [inviteOpen, setInviteOpen] = React.useState(false);

  const isLead = session?.user.role === "team_lead";
  const members = team ?? [];
  const fullAvailability = members.filter((m) => m.availability >= 0.75).length;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
      <PageHeader
        title="Team"
        description="Who is on the team, what they're strong at, and how loaded they are this week."
        actions={
          <>
            <DemoDataBadge />
            {isLead && (
              <M3Button onClick={() => setInviteOpen(true)}>
                <UserPlus className="size-4" aria-hidden /> Invite member
              </M3Button>
            )}
          </>
        }
      />

      {!isLead && (
        <div className="mb-6 flex items-start gap-2 rounded-2xl bg-info-container p-4 text-label-md text-on-info-container" role="note">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>You can view the team directory; invites are managed by team leads.</span>
        </div>
      )}

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Members" value={isLoading ? "—" : members.length} sub="In this workspace" icon={Users} tone="primary" />
        <StatCard label="Fully available" value={isLoading ? "—" : fullAvailability} sub="≥ 75% availability this week" icon={CircleDot} tone="success" />
        <StatCard label="Active tasks" value={isLoading ? "—" : members.reduce((s, m) => s + m.activeTaskCount, 0)} sub="Assigned right now" icon={Briefcase} tone="info" />
      </div>

      {isLoading ? (
        <SkeletonCards count={6} />
      ) : isError ? (
        <ErrorState message="The team directory could not be loaded." onRetry={() => refetch()} />
      ) : members.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No members yet"
          description={isLead ? "Invite your first teammate to start planning together." : "The team lead hasn't invited anyone yet."}
          action={isLead ? <M3Button variant="tonal" onClick={() => setInviteOpen(true)}>Invite member</M3Button> : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {members.map((m) => (
            <MemberCard key={m.id} member={m} />
          ))}
        </div>
      )}

      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        inviteCode={session?.workspace.inviteCode ?? "—"}
      />
    </div>
  );
}
