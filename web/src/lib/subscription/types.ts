/**
 * Subscription & usage — typed UI models + a replaceable API boundary.
 *
 * INTEGRATION BOUNDARY (do not remove this note):
 * The subscription backend (plans, persistence, entitlement enforcement,
 * billing) is NOT yet part of the verified FastAPI contract (docs/openapi.json
 * defines no /subscriptions endpoints). Per the integration scope:
 *  - No /subscriptions endpoints are invented or called.
 *  - Plan LIMITS, PRICES and ENTITLEMENT RULES shown here are DEMO PLACEHOLDERS,
 *    clearly labeled — final commercial pricing and limits come from the agreed
 *    product configuration or backend contract, never from this file.
 *  - "Demo upgrade" simulates a plan change locally (localStorage only). It is
 *    unmistakably labeled as a demonstration: no transaction, no recurring
 *    billing, no subscription persistence beyond this browser.
 *  - Demo quota meters are a UX preview ONLY — they are never a security
 *    boundary. The backend must enforce limits for real (metered) requests.
 *
 * When the backend owner delivers the subscription contract, implement
 * `SubscriptionProvider` against it (HTTP), swap the factory in ./demo.ts and
 * delete the demo data — the UI models below are designed to survive that swap.
 */

export type PlanId = "Free" | "Team" | "Business";

/** Metered resources shown in the usage overview. */
export type EntitlementKey = "workflows" | "seats" | "aiGenerations" | "recoveryRuns";

export type EntitlementLimit = number | null; // null = unlimited

export interface PlanEntitlements {
  workflows: EntitlementLimit;
  seats: EntitlementLimit;
  aiGenerations: EntitlementLimit;
  recoveryRuns: EntitlementLimit;
}

export interface PlanCatalogEntry {
  id: PlanId;
  name: PlanId;
  tagline: string;
  /** Qualitative feature list (no invented pricing / billing intervals). */
  features: string[];
  /** DEMO placeholder limits — replaced by the backend contract when it lands. */
  entitlements: PlanEntitlements;
}

export interface PlanChangeRecord {
  plan: PlanId;
  at: string;
  action: "initial" | "demo_upgrade" | "demo_downgrade";
}

export interface SubscriptionState {
  plan: PlanId;
  /** "active" is the only real-world value; demo changes never imply billing. */
  status: "active";
  periodStart: string;
  periodEnd: string;
  /** Where this state came from — always "demo" until the backend contract exists. */
  source: "demo";
  updatedAt: string;
  history: PlanChangeRecord[];
}

export interface SubscriptionProvider {
  getState(): Promise<SubscriptionState>;
  /** Simulated (demo) plan change — MUST be replaced by the real backend call
   *  when the subscription contract lands. Never implies a payment. */
  changePlan(planId: PlanId): Promise<SubscriptionState>;
}

export const ENTITLEMENT_LABELS: Record<EntitlementKey, string> = {
  workflows: "Workflows",
  seats: "Team seats",
  aiGenerations: "AI plan generations",
  recoveryRuns: "Recovery runs",
};
