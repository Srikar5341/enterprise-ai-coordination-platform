/**
 * Demo subscription provider — clearly-labeled placeholder data.
 *
 * This is the ONLY implementation of the subscription boundary today. It:
 *  - persists a simulated plan choice in localStorage (key opspilot.subscription.v1),
 *  - shows DEMO placeholder entitlements (no real pricing / limits — see
 *    ./types.ts for the boundary contract),
 *  - never talks to a backend and never implies a payment or real billing.
 *
 * Replace via getSubscriptionProvider() when the backend contract lands.
 */
import { ApiError } from "@/lib/api/types";
import {
  type PlanCatalogEntry,
  type PlanChangeRecord,
  type PlanEntitlements,
  type PlanId,
  type SubscriptionProvider,
  type SubscriptionState,
} from "./types";

/* DEMO placeholder catalog — qualitative plan descriptions per the product
 * proposal. The numerical limits below are DEMO VALUES for the UI preview;
 * they are NOT approved commercial limits and are NOT enforced by anything. */
export const DEMO_PLAN_CATALOG: PlanCatalogEntry[] = [
  {
    id: "Free",
    name: "Free",
    tagline: "Entry-level access with limited usage",
    features: [
      "Public landing & workspace onboarding",
      "Create and coordinate a small number of workflows",
      "AI-assisted goal-to-task planning (limited generations)",
      "Task board for the core team",
      "Community support",
    ],
    entitlements: { workflows: 3, seats: 3, aiGenerations: 10, recoveryRuns: 3 },
  },
  {
    id: "Team",
    name: "Team",
    tagline: "Higher limits for team collaboration and AI-assisted planning",
    features: [
      "Everything in Free",
      "More workflows, seats and AI generations",
      "Recovery Engine: impact analysis, alternatives & approvals",
      "Risk monitoring, audit trail and approvals queue",
      "Plan & usage meters for the workspace",
      "Priority email support",
    ],
    entitlements: { workflows: 10, seats: 8, aiGenerations: 50, recoveryRuns: 15 },
  },
  {
    id: "Business",
    name: "Business",
    tagline: "Higher limits and advanced team-management capabilities",
    features: [
      "Everything in Team",
      "Highest demo limits across workflows, seats and AI planning",
      "Advanced team-management capabilities",
      "Extended audit and usage oversight",
      "Dedicated support channel",
    ],
    entitlements: { workflows: 50, seats: 25, aiGenerations: 250, recoveryRuns: 100 },
  },
];

export const SUBSCRIPTION_STORAGE_KEY = "opspilot.subscription.v1";

const PERIOD_START = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
const PERIOD_END = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);

function defaultState(): SubscriptionState {
  return {
    plan: "Team",
    status: "active",
    periodStart: PERIOD_START.toISOString(),
    periodEnd: PERIOD_END.toISOString(),
    source: "demo",
    updatedAt: new Date().toISOString(),
    history: [{ plan: "Team", at: new Date().toISOString(), action: "initial" }],
  };
}

function readState(): SubscriptionState {
  if (typeof window === "undefined") return defaultState();
  try {
    const raw = window.localStorage.getItem(SUBSCRIPTION_STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as SubscriptionState;
    if (parsed && (parsed.plan === "Free" || parsed.plan === "Team" || parsed.plan === "Business") && parsed.source === "demo") {
      return parsed;
    }
    return defaultState();
  } catch {
    return defaultState();
  }
}

function writeState(state: SubscriptionState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SUBSCRIPTION_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable — demo state degrades to in-memory only */
  }
}

const PLAN_ORDER: PlanId[] = ["Free", "Team", "Business"];

export class DemoSubscriptionProvider implements SubscriptionProvider {
  async getState(): Promise<SubscriptionState> {
    return readState();
  }

  async changePlan(planId: PlanId): Promise<SubscriptionState> {
    const current = readState();
    if (!PLAN_ORDER.includes(planId)) {
      throw new ApiError(422, "validation_error", `Unknown plan "${planId}".`);
    }
    if (current.plan === planId) return current;
    const direction: PlanChangeRecord["action"] =
      PLAN_ORDER.indexOf(planId) > PLAN_ORDER.indexOf(current.plan) ? "demo_upgrade" : "demo_downgrade";
    const next: SubscriptionState = {
      ...current,
      plan: planId,
      updatedAt: new Date().toISOString(),
      history: [...current.history, { plan: planId, at: new Date().toISOString(), action: direction }].slice(-20),
    };
    writeState(next);
    return next;
  }
}

/* ------------------------------------------------------------------ */
/* Factory — the replaceable seam                                      */
/* ------------------------------------------------------------------ */

let provider: SubscriptionProvider | null = null;

/**
 * Returns the active subscription provider. Today: the demo provider.
 * When the backend delivers the subscription contract, register an HTTP
 * implementation here (one-place change) and the UI keeps working.
 */
export function getSubscriptionProvider(): SubscriptionProvider {
  if (!provider) provider = new DemoSubscriptionProvider();
  return provider;
}

/** Test/seed helper — reset the demo state (never touches a backend). */
export function resetDemoSubscription() {
  provider = null;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(SUBSCRIPTION_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}

export function planEntitlements(plan: PlanId): PlanEntitlements {
  return DEMO_PLAN_CATALOG.find((p) => p.id === plan)!.entitlements;
}

export function formatLimit(limit: number | null): string {
  return limit == null ? "Unlimited" : limit.toLocaleString("en-US");
}
