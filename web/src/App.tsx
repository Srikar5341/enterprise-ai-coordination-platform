/**
 * Renova root application (React + Vite).
 * Renders the whole product through a single Vite entry using the hash router:
 * marketing, auth, onboarding, team-lead app, employee workspace.
 *
 * Role model: the role comes from the authenticated session ONLY. Route
 * guards below are a UX layer — the backend (mirrored by the mock adapter's
 * 403s) remains authoritative.
 */
import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { useHashRoute, navigate } from "@/lib/router";
import { useSession } from "@/lib/api/queries";
import { canAccess, ROLE_HOME } from "@/lib/roles";
import { AppShell, BrandMark } from "./components/opspilot/shell/AppShell";
import { Loader2 } from "lucide-react";

/* View imports */
import LandingPage from "./components/opspilot/landing/LandingPage";
import { LoginPage, RegisterPage, ForgotPasswordPage } from "./components/opspilot/auth/AuthPages";
import WorkspaceSetupPage from "./components/opspilot/auth/WorkspaceSetup";
import TeamOnboardingPage from "./components/opspilot/auth/TeamOnboarding";
import OverviewPage from "./components/opspilot/lead/Overview";
import MyWorkspacePage from "./components/opspilot/employee/MyWorkspace";
import AssistantPage from "./components/opspilot/employee/AssistantPage";
import WorkflowListPage from "./components/opspilot/lead/WorkflowList";
import CreateWorkflowPage from "./components/opspilot/lead/CreateWorkflow";
import PlanReviewPage from "./components/opspilot/lead/PlanReview";
import AllocationPage from "./components/opspilot/lead/Allocation";
import WorkflowExecutionPage from "./components/opspilot/lead/WorkflowExecution";
import MyTasksPage from "./components/opspilot/employee/MyTasks";
import TaskDetailView from "./components/opspilot/shared/TaskDetailView";
import RecoveryCenterPage from "./components/opspilot/recovery/RecoveryCenter";
import RecoveryCaseDetailPage from "./components/opspilot/recovery/RecoveryCaseDetail";
import TeamPage from "./components/opspilot/misc/TeamPage";
import RisksPage from "./components/opspilot/misc/RisksPage";
import ApprovalsPage from "./components/opspilot/misc/ApprovalsPage";
import AuditPage from "./components/opspilot/misc/AuditPage";
import UsagePage from "./components/opspilot/misc/UsagePage";
import SubscriptionPage from "./components/opspilot/misc/SubscriptionPage";
import SettingsPage from "./components/opspilot/misc/SettingsPage";
import NotFoundPage from "./components/opspilot/shared/NotFound";

function Splash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background" role="status" aria-label="Loading Renova">
      <BrandMark />
      <Loader2 className="size-5 animate-spin text-primary" aria-hidden />
    </div>
  );
}

const AUTH_ROUTES = new Set(["/login", "/register", "/forgot-password"]);
const PUBLIC_ROUTES = new Set(["/", ""]);
const ONBOARDING_ROUTES = new Set(["/workspace/setup", "/onboarding/team"]);

function AppRoutes() {
  const route = useHashRoute();
  const { data: session, isLoading, isError } = useSession();
  const guardRef = React.useRef<string | null>(null);

  const seg = route.segments;
  const p = route.path;
  const role = session?.user.role;

  const isAppRoute = !PUBLIC_ROUTES.has(p) && !AUTH_ROUTES.has(p) && !ONBOARDING_ROUTES.has(p) && p !== "/not-found";

  /* Auth + role guard: app routes require a session; role-mismatched routes
     redirect to the role's home. Expired/missing session → login with return path. */
  React.useEffect(() => {
    if (isLoading) return;
    if (isAppRoute && !session) {
      if (guardRef.current !== p) {
        guardRef.current = p;
        navigate(`/login?next=${encodeURIComponent(p)}`);
      }
    } else if (AUTH_ROUTES.has(p) && session && role) {
      navigate(ROLE_HOME[role]);
    } else if (isAppRoute && session && role && !canAccess(role, p)) {
      if (guardRef.current !== p) {
        guardRef.current = p;
        navigate(ROLE_HOME[role]);
      }
    } else if ((p === "" || p === "/") && !session) {
      /* landing is public — no redirect */
    }
    if (session && (!isAppRoute || (role && canAccess(role, p)))) guardRef.current = null;
  }, [session, isLoading, isAppRoute, p, role]);

  if (isLoading) return <Splash />;
  if (isError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <BrandMark />
        <p className="max-w-sm text-label-lg text-on-surface-variant">
          Renova could not load your session. Check your connection and reload the page.
        </p>
        <button onClick={() => window.location.reload()} className="min-h-11 rounded-full bg-primary px-6 font-medium text-primary-foreground active:scale-95">
          Reload
        </button>
      </div>
    );
  }

  /* ------------- Public marketing (anonymous-accessible) ------------- */
  if (p === "" || p === "/") return <LandingPage />;

  /* ------------- Auth ------------- */
  if (p === "/login") return <LoginPage />;
  if (p === "/register") return <RegisterPage />;
  if (p === "/forgot-password") return <ForgotPasswordPage />;

  /* ------------- Onboarding (session required) ------------- */
  if (ONBOARDING_ROUTES.has(p)) {
    if (!session) return <Splash />;
    return (
      <AuthFrame>
        {p === "/workspace/setup" ? <WorkspaceSetupPage /> : <TeamOnboardingPage />}
      </AuthFrame>
    );
  }

  /* ------------- Application (guarded) ------------- */
  if (isAppRoute) {
    if (!session) return <Splash />; // redirect in flight

    let view: React.ReactNode;
    if (p === "/overview") view = <OverviewPage />;
    else if (p === "/my-workspace") view = <MyWorkspacePage />;
    else if (p === "/assistant") view = <AssistantPage />;
    else if (p === "/workflows") view = <WorkflowListPage />;
    else if (p === "/workflows/new") view = <CreateWorkflowPage />;
    else if (seg[0] === "workflows" && seg[1] && seg[2] === "plan") view = <PlanReviewPage workflowId={seg[1]} />;
    else if (seg[0] === "workflows" && seg[1] && seg[2] === "allocation") view = <AllocationPage workflowId={seg[1]} />;
    else if (seg[0] === "workflows" && seg[1]) view = <WorkflowExecutionPage workflowId={seg[1]} />;
    else if (p === "/tasks") view = <MyTasksPage />;
    else if (seg[0] === "tasks" && seg[1]) view = <TaskDetailView taskId={seg[1]} />;
    else if (p === "/recovery") view = <RecoveryCenterPage />;
    else if (seg[0] === "recovery" && seg[1]) view = <RecoveryCaseDetailPage caseId={seg[1]} />;
    else if (p === "/team") view = <TeamPage />;
    else if (p === "/risks") view = <RisksPage />;
    else if (p === "/approvals") view = <ApprovalsPage />;
    else if (p === "/audit") view = <AuditPage />;
    else if (p === "/usage") view = <UsagePage />;
    else if (p === "/subscription") view = <SubscriptionPage />;
    else if (p === "/settings") view = <SettingsPage />;
    else view = <NotFoundPage path={p} />;

    return <AppShell>{view}</AppShell>;
  }

  return <NotFoundPage path={p} />;
}

function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-surface-container-low">
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-2xl">{children}</div>
      </div>
      <footer className="px-6 py-4 text-center text-label-sm text-on-surface-variant">
        Renova — demo environment · sample data only
      </footer>
    </div>
  );
}

export default function App() {
  const [qc] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 20_000,
            refetchOnWindowFocus: false,
            retry: (count, err) => {
              const status = (err as { status?: number })?.status;
              if (typeof status === "number" && status >= 400 && status < 500) return false;
              return count < 2;
            },
          },
        },
      })
  );

  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  return (
    <QueryClientProvider client={qc}>
      {mounted ? <AppRoutes /> : <Splash />}
      <Toaster position="bottom-right" toastOptions={{ className: "rounded-2xl border-border bg-popover text-popover-foreground shadow-lg" }} />
    </QueryClientProvider>
  );
}
