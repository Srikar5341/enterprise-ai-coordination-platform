"use client";

/**
 * Team onboarding (session exists) — two local steps:
 * 1. Invite your team (queue emails + roles, send via useInviteMember).
 * 2. Share your invite code (big monospace box + copy button).
 */
import * as React from "react";
import { MotionConfig, motion } from "framer-motion";
import { toast } from "sonner";
import { ArrowRight, ArrowLeft, Check, Copy, Mail, RotateCcw, UserPlus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { navigate } from "@/lib/router";
import { useInviteMember, useSession } from "@/lib/api/queries";
import { M3Button, TextField } from "../primitives";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const EASE_M3: [number, number, number, number] = [0.05, 0.7, 0.1, 1];

type InviteRole = "employee" | "team_lead";
interface Invitee {
  email: string;
  role: InviteRole;
}

const ROLE_LABEL: Record<InviteRole, string> = { employee: "Employee", team_lead: "Team Lead" };

function Stepper({ step }: { step: 1 | 2 }) {
  const labels = ["Invite your team", "Share your invite code"];
  return (
    <ol
      className="mx-auto flex w-fit flex-wrap items-center gap-x-3 gap-y-2 rounded-full bg-surface-container-low px-4 py-2"
      aria-label={`Setup progress: step ${step} of 2`}
    >
      {labels.map((label, i) => {
        const n = (i + 1) as 1 | 2;
        const done = n < step;
        const current = n === step;
        return (
          <li key={label} className="flex items-center gap-2">
            {i > 0 && <span className="mr-1 hidden h-px w-10 bg-outline-variant sm:block" aria-hidden />}
            <span
              aria-current={current ? "step" : undefined}
              className={cn(
                "flex size-7 items-center justify-center rounded-full text-label-md font-semibold",
                done || current ? "bg-primary text-primary-foreground" : "bg-surface-container-high text-on-surface-variant"
              )}
            >
              {done ? <Check className="size-4" aria-hidden /> : n}
            </span>
            <span className={cn("text-label-md", current ? "font-semibold text-foreground" : "text-on-surface-variant")}>
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default function TeamOnboardingPage() {
  const { data: session } = useSession();
  const invite = useInviteMember();

  const [step, setStep] = React.useState<1 | 2>(1);
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<InviteRole>("employee");
  const [emailError, setEmailError] = React.useState<string | null>(null);
  const [list, setList] = React.useState<Invitee[]>([]);
  const [sending, setSending] = React.useState(false);
  const [sendNote, setSendNote] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  const inviteCode = session?.workspace.inviteCode ?? "";
  const workspaceName = session?.workspace.name ?? "your workspace";

  const addToList = () => {
    const value = email.trim().toLowerCase();
    if (!value) {
      setEmailError("Enter a teammate's email address.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(value)) {
      setEmailError("That email address doesn't look right.");
      return;
    }
    if (list.some((i) => i.email === value)) {
      setEmailError("That email is already on the invite list.");
      return;
    }
    setEmailError(null);
    setSendNote(null);
    setList((l) => [...l, { email: value, role }]);
    setEmail("");
  };

  const removeFromList = (target: string) => {
    setList((l) => l.filter((i) => i.email !== target));
  };

  const sendInvites = async () => {
    if (list.length === 0 || sending) return;
    setSending(true);
    setSendNote(null);
    let ok = 0;
    const failed: Invitee[] = [];
    for (const item of list) {
      try {
        await invite.mutateAsync({ email: item.email, role: item.role });
        ok += 1;
      } catch {
        failed.push(item);
      }
    }
    setSending(false);
    setList(failed);
    if (ok > 0) {
      toast.success(ok === 1 ? "1 invite sent" : `${ok} invites sent`, {
        description: "They can join with your workspace invite code.",
      });
    }
    if (failed.length === 0 && ok > 0) {
      setStep(2);
    } else if (failed.length > 0) {
      setSendNote("Some invites couldn't be sent — the failed ones are still listed below. You can retry or continue.");
    }
  };

  const copyCode = async () => {
    if (!inviteCode) return;
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      toast.success("Copied", { description: "Invite code copied to your clipboard." });
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't access the clipboard — please copy the code manually.");
    }
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="w-full space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-title-lg font-bold tracking-tight">Bring your team aboard</h1>
          <p className="max-w-md text-label-lg text-on-surface-variant">
            Two quick steps and <span className="font-medium text-foreground">{workspaceName}</span> is ready for
            everyone.
          </p>
        </div>

        <Stepper step={step} />

        {step === 1 ? (
          <motion.section
            key="step-1"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: EASE_M3 }}
            aria-label="Invite your team"
            className="rounded-[28px] bg-card p-6 shadow-lg ring-1 ring-border md:p-8"
          >
            <h2 className="text-title-md font-bold">Invite your team</h2>
            <p className="mt-1 text-label-lg text-on-surface-variant">
              Add teammates by email — pick a role for each so Renova can tailor their workspace.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                addToList();
              }}
              className="mt-5 space-y-3"
              noValidate
            >
              <TextField
                label="Email address"
                type="email"
                inputMode="email"
                placeholder="teammate@company.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setEmailError(null);
                }}
                error={emailError ?? undefined}
              />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="sm:w-52">
                  <Label htmlFor="invite-role" className="mb-1.5 block text-label-md font-medium">
                    Role
                  </Label>
                  <Select value={role} onValueChange={(v) => setRole(v as InviteRole)}>
                    <SelectTrigger
                      id="invite-role"
                      className="h-12 w-full rounded-xl border-input bg-background px-4 text-body-md data-[state=open]:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/25"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl">
                      <SelectItem value="employee" className="min-h-11 rounded-xl">
                        Employee
                      </SelectItem>
                      <SelectItem value="team_lead" className="min-h-11 rounded-xl">
                        Team Lead
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <M3Button type="submit" variant="tonal" className="w-full sm:ml-auto sm:w-auto">
                  <UserPlus className="size-[18px]" aria-hidden /> Add to invite list
                </M3Button>
              </div>
            </form>

            {list.length > 0 ? (
              <ul className="mt-5 flex flex-wrap gap-2" aria-label="Invites queued to send">
                {list.map((item) => (
                  <li key={item.email}>
                    <ChipWithRemove item={item} onRemove={() => removeFromList(item.email)} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-5 text-label-sm text-on-surface-variant">
                No invites queued yet — you can also skip ahead and share the code instead.
              </p>
            )}

            <div className="mt-6 flex flex-col gap-2 border-t border-border pt-5 sm:flex-row sm:items-center">
              <M3Button onClick={sendInvites} loading={sending} disabled={list.length === 0} className="w-full sm:w-auto">
                {list.length > 0 ? `Send ${list.length} invite${list.length > 1 ? "s" : ""}` : "Send invites"}
              </M3Button>
              <M3Button variant="text" onClick={() => setStep(2)} className="w-full sm:ml-auto sm:w-auto">
                Next: invite code <ArrowRight className="size-4" aria-hidden />
              </M3Button>
            </div>
            {sendNote && (
              <p className="mt-3 text-label-md text-error" role="alert">
                {sendNote}
              </p>
            )}
          </motion.section>
        ) : (
          <motion.section
            key="step-2"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: EASE_M3 }}
            aria-label="Share your invite code"
            className="rounded-[28px] bg-card p-6 text-center shadow-lg ring-1 ring-border md:p-8"
          >
            <h2 className="text-title-md font-bold">Share your invite code</h2>
            <p className="mx-auto mt-1 max-w-md text-label-lg text-on-surface-variant">
              Teammates can join <span className="font-medium text-foreground">{workspaceName}</span> at Renova with
              this code.
            </p>

            <div className="mx-auto mt-6 flex max-w-sm items-center justify-center rounded-2xl bg-surface-container-low px-4 py-5 ring-1 ring-border">
              <span className="break-all font-mono text-title-lg font-bold tracking-[0.18em] text-primary">
                {inviteCode || "—"}
              </span>
            </div>

            <div className="mt-4 flex justify-center">
              <M3Button variant="tonal" onClick={copyCode}>
                {copied ? <Check className="size-[18px]" aria-hidden /> : <Copy className="size-[18px]" aria-hidden />}
                {copied ? "Copied" : "Copy code"}
              </M3Button>
            </div>

            <p className="mx-auto mt-3 max-w-sm text-label-sm text-on-surface-variant">
              Anyone with this code can join the workspace — share it only with people you trust.
            </p>

            <div className="mt-6 flex flex-col items-center gap-2 border-t border-border pt-5">
              <M3Button onClick={() => navigate("/overview")} className="w-full sm:w-auto">
                Go to Overview <ArrowRight className="size-4" aria-hidden />
              </M3Button>
              <M3Button variant="text" onClick={() => setStep(1)}>
                <ArrowLeft className="size-4" aria-hidden /> Back to invites
              </M3Button>
            </div>
          </motion.section>
        )}

        <div className="text-center">
          <button
            type="button"
            onClick={() => navigate("/overview")}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-label-md font-medium text-primary outline-none underline-offset-4 transition-all duration-200 ease-m3 hover:underline focus-visible:ring-[3px] focus-visible:ring-primary/40"
          >
            <RotateCcw className="size-4" aria-hidden /> Skip — go straight to Overview
          </button>
        </div>
      </div>
    </MotionConfig>
  );
}

function ChipWithRemove({ item, onRemove }: { item: Invitee; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-secondary py-1.5 pl-3 pr-1.5 text-label-sm font-medium text-secondary-foreground">
      <Mail className="size-3.5 shrink-0" aria-hidden />
      <span className="max-w-[15rem] truncate">{item.email}</span>
      <span className="rounded-full bg-primary-foreground/15 px-2 py-0.5 text-[11px] font-semibold">
        {ROLE_LABEL[item.role]}
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${item.email} from the invite list`}
        className="flex size-7 shrink-0 items-center justify-center rounded-full outline-none transition-colors duration-200 ease-m3 hover:bg-primary-foreground/15 focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </span>
  );
}
