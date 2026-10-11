"use client";

/**
 * Workspace setup (post-registration; a session already exists).
 * Two tabs: create a fresh workspace, or join an existing one with an invite
 * code. A labeled demo shortcut joins the seeded Northwind workspace.
 */
import * as React from "react";
import { MotionConfig, motion } from "framer-motion";
import { ArrowRight, Building2, Loader2, Sparkles, Users } from "lucide-react";
import { navigate } from "@/lib/router";
import { ROLE_HOME } from "@/lib/roles";
import { useCreateWorkspace, useJoinWorkspace, useSession } from "@/lib/api/queries";
import { ApiError } from "@/lib/api/types";
import { M3Button, TextArea, TextField } from "../primitives";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const EASE_M3: [number, number, number, number] = [0.05, 0.7, 0.1, 1];
const DEMO_INVITE_CODE = "OPS-7K2-QM9";

function errMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

function ServerErrorAlert({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="flex items-start gap-3 rounded-2xl bg-error-container px-4 py-3 text-on-error-container">
      <p className="text-label-md">{message}</p>
    </div>
  );
}

export default function WorkspaceSetupPage() {
  const { data: session } = useSession();
  const create = useCreateWorkspace();
  const join = useJoinWorkspace();

  const [name, setName] = React.useState("");
  const [goalHint, setGoalHint] = React.useState("");
  const [nameError, setNameError] = React.useState<string | null>(null);
  const [code, setCode] = React.useState("");
  const [codeError, setCodeError] = React.useState<string | null>(null);
  const [skipping, setSkipping] = React.useState(false);

  const createError = create.isError && create.error ? errMessage(create.error) : null;
  const joinError = join.isError && join.error ? errMessage(join.error) : null;
  const busy = create.isPending || join.isPending;

  const submitCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setNameError("Give your workspace a name.");
      return;
    }
    setNameError(null);
    create.mutate(
      { name: name.trim(), goalHint: goalHint.trim() || undefined },
      { onSuccess: () => navigate("/onboarding/team") }
    );
  };

  const submitJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const value = code.trim().toUpperCase();
    if (!value) {
      setCodeError("Enter the invite code from your team lead.");
      return;
    }
    setCodeError(null);
    join.mutate({ inviteCode: value }, { onSuccess: (s) => navigate(ROLE_HOME[s.user.role]) });
  };

  const joinDemo = () => {
    setSkipping(true);
    join.mutate(
      { inviteCode: DEMO_INVITE_CODE },
      { onSuccess: (s) => navigate(ROLE_HOME[s.user.role]), onSettled: () => setSkipping(false) }
    );
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="w-full space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: EASE_M3 }}
          className="flex flex-col items-center gap-2 text-center"
        >
          <h1 className="text-title-lg font-bold tracking-tight">Set up your workspace</h1>
          <p className="max-w-md text-label-lg text-on-surface-variant">
            Signed in as <span className="font-medium text-foreground">{session?.user.email ?? "…"}</span> — create a
            fresh workspace or join your team&apos;s existing one.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05, ease: EASE_M3 }}
          className="rounded-[28px] bg-card p-6 shadow-lg ring-1 ring-border md:p-8"
        >
          <Tabs defaultValue="create">
            <TabsList className="grid w-full grid-cols-1 rounded-full bg-surface-container-high p-1 sm:grid-cols-2">
              <TabsTrigger
                value="create"
                className="min-h-11 rounded-full px-4 text-label-md data-[state=active]:bg-card data-[state=active]:shadow-sm"
              >
                <Building2 className="size-4" aria-hidden /> Create a workspace
              </TabsTrigger>
              <TabsTrigger
                value="join"
                className="min-h-11 rounded-full px-4 text-label-md data-[state=active]:bg-card data-[state=active]:shadow-sm"
              >
                <Users className="size-4" aria-hidden /> Join with invite code
              </TabsTrigger>
            </TabsList>

            <TabsContent value="create" className="mt-6">
              <form onSubmit={submitCreate} className="space-y-4" noValidate>
                <TextField
                  label="Workspace name"
                  placeholder="e.g. Northwind Product"
                  required
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setNameError(null);
                    if (create.isError) create.reset();
                  }}
                  error={nameError ?? undefined}
                />
                <TextArea
                  label="What are you trying to achieve?"
                  placeholder="e.g. Ship our next release without last-minute firefighting."
                  hint="Optional — Renova uses this to tailor suggestions later."
                  value={goalHint}
                  onChange={(e) => {
                    setGoalHint(e.target.value);
                    if (create.isError) create.reset();
                  }}
                />
                <ServerErrorAlert message={createError} />
                <M3Button type="submit" className="w-full" loading={create.isPending} disabled={busy}>
                  <Building2 className="size-[18px]" aria-hidden /> Create workspace
                </M3Button>
              </form>
            </TabsContent>

            <TabsContent value="join" className="mt-6">
              <form onSubmit={submitJoin} className="space-y-4" noValidate>
                <TextField
                  label="Invite code"
                  placeholder="OPS-XXX-XXX"
                  required
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.toUpperCase());
                    setCodeError(null);
                    if (join.isError) join.reset();
                  }}
                  error={codeError ?? undefined}
                  hint="Ask your team lead — it looks like OPS-7K2-QM9."
                  className="[&_input]:font-mono [&_input]:tracking-widest"
                />
                <ServerErrorAlert message={joinError} />
                <M3Button type="submit" variant="tonal" className="w-full" loading={join.isPending && !skipping} disabled={busy}>
                  <Users className="size-[18px]" aria-hidden /> Join workspace
                </M3Button>
              </form>
            </TabsContent>
          </Tabs>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.1, ease: EASE_M3 }}
          className="text-center"
        >
          <button
            type="button"
            onClick={joinDemo}
            disabled={busy}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-label-md font-medium text-primary outline-none underline-offset-4 transition-all duration-200 ease-m3 hover:underline focus-visible:ring-[3px] focus-visible:ring-primary/40 disabled:opacity-50"
          >
            {skipping ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="size-4" aria-hidden />
            )}
            Skip for now — explore the demo workspace
            <ArrowRight className="size-4" aria-hidden />
          </button>
          <p className="mt-1 text-label-sm text-on-surface-variant">
            Demo shortcut — joins the seeded “Northwind Product” workspace with code {DEMO_INVITE_CODE}.
          </p>
        </motion.div>
      </div>
    </MotionConfig>
  );
}
