"use client";

/**
 * Auth screens — sign in, registration and password reset.
 *
 * Shared Material You layout: dark brand panel on lg+, centered white card,
 * sticky mini-footer. All data flows through the TanStack Query hooks in
 * `@/lib/api/queries`; server errors surface inline (role="alert") in
 * addition to the automatic toasts.
 */
import * as React from "react";
import { MotionConfig, motion } from "framer-motion";
import { AlertTriangle, ArrowRight, CheckCircle2, Eye, EyeOff, ShieldCheck, Sparkles, CalendarCheck2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { navigate, useHashRoute } from "@/lib/router";
import { ROLE_HOME } from "@/lib/roles";
import { useLogin, useRegister, useRequestPasswordReset } from "@/lib/api/queries";
import { ApiError } from "@/lib/api/types";
import { DEMO_CREDENTIALS } from "@/lib/api/mock-data";
import { M3Button, TextField, DemoDataBadge } from "../primitives";

const EASE_M3: [number, number, number, number] = [0.05, 0.7, 0.1, 1];

function errMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/**
 * Redirect after a successful auth mutation.
 *
 * The root auth-guard (App) also reacts to the session appearing while
 * the router still shows an auth route and navigates to /overview. Because the
 * router state updates on `hashchange` (after that guard's render), a direct
 * navigate here would be overwritten. Instead we wait for the guard's redirect
 * (the first hashchange) and then replace it with the intended path — falling
 * back to a short timer if no hashchange ever arrives.
 */
function useRedirectAfterAuth() {
  return React.useCallback((to: string) => {
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      window.removeEventListener("hashchange", go);
      navigate(to, { replace: true });
    };
    window.addEventListener("hashchange", go);
    window.setTimeout(go, 400);
  }, []);
}

/* ------------------------------------------------------------------ */
/* Brand                                                               */
/* ------------------------------------------------------------------ */

/** Renova wordmark with the approved emblem tile. */
function AuthBrandMark({ onDark = false, className }: { onDark?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <img
        src="/images/renova-mark.png"
        alt=""
        aria-hidden="true"
        decoding="async"
        className="size-10 shrink-0 rounded-2xl object-cover shadow-md"
        width={40}
        height={40}
      />
      <span className={cn("text-title-md font-bold tracking-tight", onDark ? "text-white" : "text-foreground")}>
        Re<span className={onDark ? "text-[#b79df5]" : "text-primary"}>nova</span>
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

const PANEL_FEATURES = [
  { icon: ShieldCheck, text: "Blockers surface before they cascade through the plan" },
  { icon: Sparkles, text: "AI-proposed recovery alternatives, ready for lead review" },
  { icon: CalendarCheck2, text: "Commitments tracked, so Fridays stay shippable" },
];

function BrandPanel() {
  return (
    <aside
      className="relative hidden overflow-hidden rounded-[32px] p-10 lg:block"
      style={{ background: "linear-gradient(160deg, #0b0614 0%, #150a28 55%, #1d0f38 100%)" }}
    >
      {/* Subtle glows */}
      <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 size-80 rounded-full bg-[#6750a4]/30 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 -right-16 size-96 rounded-full bg-[#7d5260]/25 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute left-1/3 top-1/2 size-64 rounded-full bg-[#b79df5]/10 blur-3xl" />

      {/* Decorative node graph */}
      <svg viewBox="0 0 320 200" className="pointer-events-none absolute -right-6 bottom-6 w-72 opacity-20" fill="none" stroke="white" strokeWidth="1.5" aria-hidden>
        <circle cx="40" cy="150" r="7" fill="white" stroke="none" />
        <circle cx="140" cy="60" r="9" fill="white" stroke="none" />
        <circle cx="230" cy="120" r="7" fill="white" stroke="none" />
        <circle cx="290" cy="40" r="6" fill="white" stroke="none" />
        <path d="M46 146 L134 64 M147 62 L224 116 M236 115 L286 45 M150 68 L228 118" />
      </svg>

      <div className="relative flex h-full flex-col">
        <AuthBrandMark onDark />
        <h2 className="mt-12 text-headline-md font-bold leading-tight text-white">
          Plans change.
          <br />
          Your team stays in motion.
        </h2>
        <p className="mt-4 max-w-md text-body-md text-white/70">
          Renova turns goals into allocated plans, spots blockers early and proposes recovery options — so a slipped
          task never becomes a slipped release.
        </p>
        <ul className="mt-auto space-y-4 pt-10">
          {PANEL_FEATURES.map((f) => (
            <li key={f.text} className="flex items-start gap-3 text-label-lg text-white/80">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-white/10 text-[#d0bcff]">
                <f.icon className="size-4" aria-hidden />
              </span>
              {f.text}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

function AuthCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-[28px] bg-card p-6 shadow-lg ring-1 ring-border md:p-8", className)}>{children}</div>;
}

function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-screen flex-col bg-surface-container-low">
        <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col justify-center px-4 py-8 sm:px-6 md:py-12">
          <div className="grid w-full items-center gap-10 lg:grid-cols-[1.1fr_minmax(0,26rem)] lg:gap-14">
            <BrandPanel />
            <motion.main
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: EASE_M3 }}
              className="mx-auto w-full max-w-md"
            >
              {children}
            </motion.main>
          </div>
        </div>
        <footer className="px-6 pb-5 text-center text-label-sm text-on-surface-variant">
          Demo environment — sample data only
        </footer>
      </div>
    </MotionConfig>
  );
}

/* ------------------------------------------------------------------ */
/* Shared form bits                                                    */
/* ------------------------------------------------------------------ */

function ServerErrorAlert({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="flex items-start gap-3 rounded-2xl bg-error-container px-4 py-3 text-on-error-container">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p className="text-label-md">{message}</p>
    </div>
  );
}

const passwordInputClasses = cn(
  "h-12 w-full rounded-xl border bg-background px-4 pr-14 text-body-md outline-none transition-all duration-200 ease-m3 placeholder:text-outline",
  "focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/25"
);

/** TextField-style input with a 44px visibility toggle inside the field. */
function PasswordField({
  label,
  error,
  hint,
  id,
  required,
  value,
  onChange,
  autoComplete,
  placeholder,
  disabled,
}: {
  label: string;
  error?: string;
  hint?: string;
  id?: string;
  required?: boolean;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  autoComplete?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const autoId = React.useId();
  const inputId = id ?? autoId;
  const [show, setShow] = React.useState(false);
  return (
    <div className="w-full">
      <label htmlFor={inputId} className="mb-1.5 block text-label-md font-medium">
        {label} {required && <span className="text-error" aria-hidden>*</span>}
      </label>
      <div className="relative">
        <input
          id={inputId}
          type={show ? "text" : "password"}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          className={cn(passwordInputClasses, error ? "border-error" : "border-input hover:border-outline")}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
          aria-pressed={show}
          className="absolute inset-y-0 right-0 my-auto mr-1 flex size-11 items-center justify-center rounded-full text-on-surface-variant outline-none transition-colors duration-200 ease-m3 hover:bg-surface-container-high focus-visible:ring-[3px] focus-visible:ring-primary/40"
        >
          {show ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
        </button>
      </div>
      {error && (
        <p id={`${inputId}-error`} className="mt-1.5 text-label-md text-error" role="alert">
          {error}
        </p>
      )}
      {!error && hint && (
        <p id={`${inputId}-hint`} className="mt-1.5 text-label-sm text-on-surface-variant">
          {hint}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Login                                                               */
/* ------------------------------------------------------------------ */

export function LoginPage() {
  const route = useHashRoute();
  const redirectAfterAuth = useRedirectAfterAuth();
  const nextParam = route.query.get("next");
  const next = nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : null;
  const login = useLogin();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");

  const serverError = login.isError && login.error ? errMessage(login.error) : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    login.mutate(
      { email: email.trim(), password },
      { onSuccess: (session) => redirectAfterAuth(next ?? ROLE_HOME[session.user.role]) }
    );
  };

  const fillDemo = (which: "lead" | "employee") => {
    const cred = DEMO_CREDENTIALS[which];
    setEmail(cred.email);
    setPassword(cred.password);
    login.reset();
  };

  return (
    <AuthLayout>
      <AuthCard>
        <AuthBrandMark />
        <h1 className="mt-6 text-title-lg font-bold tracking-tight">Welcome back</h1>
        <p className="mt-1 text-label-lg text-on-surface-variant">Sign in to keep your workflows moving.</p>

        <div className="mt-5 rounded-2xl bg-surface-container-low p-3">
          <p className="text-label-sm font-medium text-on-surface-variant">
            Demo shortcuts — sample data, any password with 6+ characters works:
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <M3Button type="button" variant="tonal" onClick={() => fillDemo("lead")}>
              <ShieldCheck className="size-[18px]" aria-hidden /> Fill Team Lead demo
            </M3Button>
            <M3Button type="button" variant="tonal" onClick={() => fillDemo("employee")}>
              <Sparkles className="size-[18px]" aria-hidden /> Fill Employee demo
            </M3Button>
          </div>
        </div>

        <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
          <TextField
            label="Email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@company.com"
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (login.isError) login.reset();
            }}
          />
          <PasswordField
            label="Password"
            autoComplete="current-password"
            placeholder="••••••••"
            required
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (login.isError) login.reset();
            }}
          />
          <ServerErrorAlert message={serverError} />
          <div className="flex justify-end">
            <a
              href="#/forgot-password"
              className="inline-flex min-h-11 items-center rounded-full px-1 text-label-md font-medium text-primary outline-none underline-offset-4 hover:underline focus-visible:ring-[3px] focus-visible:ring-primary/40"
            >
              Forgot password?
            </a>
          </div>
          <M3Button type="submit" className="w-full" loading={login.isPending}>
            Sign in
          </M3Button>
        </form>

        <p className="mt-6 text-center text-label-md text-on-surface-variant">
          New to Renova?{" "}
          <a
            href="#/register"
            className="inline-flex min-h-11 items-center font-medium text-primary outline-none underline-offset-4 hover:underline focus-visible:ring-[3px] focus-visible:ring-primary/40"
          >
            Create an account
          </a>
        </p>
      </AuthCard>
    </AuthLayout>
  );
}

/* ------------------------------------------------------------------ */
/* Register                                                            */
/* ------------------------------------------------------------------ */

type RegisterField = "name" | "email" | "organizationName" | "password" | "confirm";

export function RegisterPage() {
  const register = useRegister();
  const redirectAfterAuth = useRedirectAfterAuth();
  const [form, setForm] = React.useState<Record<RegisterField, string>>({
    name: "",
    email: "",
    organizationName: "",
    password: "",
    confirm: "",
  });
  const [errors, setErrors] = React.useState<Partial<Record<RegisterField, string>>>({});

  const serverError = register.isError && register.error ? errMessage(register.error) : null;
  const passwordStrong = form.password.length >= 8 && /\d/.test(form.password);

  const setField = (key: RegisterField) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
    if (register.isError) register.reset();
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Partial<Record<RegisterField, string>> = {};
    if (!form.name.trim()) next.name = "Enter your name.";
    if (!form.email.trim()) next.email = "Enter your work email.";
    else if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) next.email = "That email address doesn't look right.";
    if (!form.organizationName.trim()) next.organizationName = "Give your workspace a name.";
    if (!passwordStrong) next.password = "Use at least 8 characters including a number.";
    if (form.confirm !== form.password || !form.confirm) next.confirm = "Passwords don't match.";
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    register.mutate(
      {
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        organizationName: form.organizationName.trim(),
      },
      { onSuccess: () => redirectAfterAuth("/workspace/setup") }
    );
  };

  return (
    <AuthLayout>
      <AuthCard>
        <AuthBrandMark />
        <h1 className="mt-6 text-title-lg font-bold tracking-tight">Create your account</h1>
        <p className="mt-1 text-label-lg text-on-surface-variant">Set up a workspace for your team in about a minute.</p>

        <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
          <TextField
            label="Your name"
            autoComplete="name"
            placeholder="e.g. Ava Chen"
            required
            value={form.name}
            onChange={setField("name")}
            error={errors.name}
          />
          <TextField
            label="Work email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@company.com"
            required
            value={form.email}
            onChange={setField("email")}
            error={errors.email}
          />
          <TextField
            label="Organization name"
            autoComplete="organization"
            placeholder="e.g. Northwind Product"
            required
            value={form.organizationName}
            onChange={setField("organizationName")}
            error={errors.organizationName}
          />
          <PasswordField
            label="Password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            required
            value={form.password}
            onChange={setField("password")}
            error={errors.password}
            hint={
              form.password
                ? passwordStrong
                  ? "Strength looks good — 8+ characters with a number."
                  : "Add more characters or a number to strengthen it."
                : "Use at least 8 characters including a number."
            }
          />
          <PasswordField
            label="Confirm password"
            autoComplete="new-password"
            placeholder="Repeat your password"
            required
            value={form.confirm}
            onChange={setField("confirm")}
            error={errors.confirm}
          />
          <ServerErrorAlert message={serverError} />
          <M3Button type="submit" className="w-full" loading={register.isPending}>
            Create account
          </M3Button>
        </form>

        <p className="mt-6 text-center text-label-md text-on-surface-variant">
          Already have an account?{" "}
          <a
            href="#/login"
            className="inline-flex min-h-11 items-center font-medium text-primary outline-none underline-offset-4 hover:underline focus-visible:ring-[3px] focus-visible:ring-primary/40"
          >
            Sign in
          </a>
        </p>
      </AuthCard>
    </AuthLayout>
  );
}

/* ------------------------------------------------------------------ */
/* Forgot password                                                     */
/* ------------------------------------------------------------------ */

export function ForgotPasswordPage() {
  const reset = useRequestPasswordReset();
  const [email, setEmail] = React.useState("");
  const [fieldError, setFieldError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = email.trim();
    if (!value) {
      setFieldError("Enter the email you signed up with.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(value)) {
      setFieldError("That email address doesn't look right.");
      return;
    }
    setFieldError(null);
    reset.mutate(value, { onSuccess: (res) => setSent(res.message) });
  };

  if (sent) {
    return (
      <AuthLayout>
        <AuthCard className="text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-success-container text-on-success-container">
            <CheckCircle2 className="size-7" aria-hidden />
          </div>
          <h1 className="mt-4 text-title-lg font-bold tracking-tight">Check your inbox</h1>
          <p className="mx-auto mt-2 max-w-sm text-label-lg text-on-surface-variant">{sent}</p>
          <p className="mt-3 text-label-md text-on-surface-variant">
            Didn&apos;t receive anything? Check your spam folder or request a new link in a minute.
          </p>
          <div className="mt-4 flex justify-center">
            <DemoDataBadge label="Demo — no real email is sent" />
          </div>
          <M3Button variant="tonal" className="mt-6 w-full" onClick={() => navigate("/login")}>
            <ArrowRight className="size-4" aria-hidden /> Back to sign in
          </M3Button>
        </AuthCard>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <AuthCard>
        <AuthBrandMark />
        <h1 className="mt-6 text-title-lg font-bold tracking-tight">Reset your password</h1>
        <p className="mt-1 text-label-lg text-on-surface-variant">
          Enter your email and we&apos;ll send you a reset link.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
          <TextField
            label="Email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@company.com"
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setFieldError(null);
            }}
            error={fieldError ?? undefined}
          />
          <M3Button type="submit" className="w-full" loading={reset.isPending}>
            Send reset link
          </M3Button>
        </form>

        <p className="mt-6 text-center text-label-md text-on-surface-variant">
          Remembered it after all?{" "}
          <a
            href="#/login"
            className="inline-flex min-h-11 items-center font-medium text-primary outline-none underline-offset-4 hover:underline focus-visible:ring-[3px] focus-visible:ring-primary/40"
          >
            Back to sign in
          </a>
        </p>
      </AuthCard>
    </AuthLayout>
  );
}
