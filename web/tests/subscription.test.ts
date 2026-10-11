/**
 * Tests for the subscription demo boundary: clearly-labeled demo data,
 * simulated plan changes (upgrade/downgrade), validation, and persistence
 * — never a backend call, never a payment.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  DEMO_PLAN_CATALOG,
  DemoSubscriptionProvider,
  SUBSCRIPTION_STORAGE_KEY,
  planEntitlements,
} from "@/lib/subscription/demo";
import { ApiError } from "@/lib/api/types";

describe("DemoSubscriptionProvider", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it("defaults to the Team plan with source: demo", async () => {
    const state = await new DemoSubscriptionProvider().getState();
    expect(state.plan).toBe("Team");
    expect(state.source).toBe("demo");
    expect(state.status).toBe("active");
  });

  it("simulates an upgrade and records history (no payment anywhere)", async () => {
    const provider = new DemoSubscriptionProvider();
    await provider.getState();
    const next = await provider.changePlan("Business");
    expect(next.plan).toBe("Business");
    expect(next.history).toHaveLength(2);
    expect(next.history[1]).toMatchObject({ plan: "Business", action: "demo_upgrade" });
    // persisted in localStorage only
    expect(JSON.parse(window.localStorage.getItem(SUBSCRIPTION_STORAGE_KEY)!).plan).toBe("Business");
  });

  it("records a downgrade as demo_downgrade", async () => {
    const provider = new DemoSubscriptionProvider();
    await provider.changePlan("Business");
    const next = await provider.changePlan("Free");
    expect(next.history[next.history.length - 1].action).toBe("demo_downgrade");
    expect(next.plan).toBe("Free");
  });

  it("rejects unknown plans with a validation error", async () => {
    const provider = new DemoSubscriptionProvider();
    await expect(provider.changePlan("Enterprise" as never)).rejects.toBeInstanceOf(ApiError);
  });

  it("exposes entitlements for every catalog plan", () => {
    for (const plan of DEMO_PLAN_CATALOG) {
      const e = planEntitlements(plan.id);
      expect(e.workflows as number).toBeGreaterThan(0);
      expect(e.seats as number).toBeGreaterThan(0);
      expect(e.aiGenerations as number).toBeGreaterThan(0);
      expect(e.recoveryRuns as number).toBeGreaterThan(0);
    }
    // Free < Team < Business (demo ordering sanity)
    expect(planEntitlements("Free").workflows as number).toBeLessThan(planEntitlements("Team").workflows as number);
    expect(planEntitlements("Team").workflows as number).toBeLessThan(planEntitlements("Business").workflows as number);
  });

  it("ignores corrupted stored state and falls back to the default", async () => {
    window.localStorage.setItem(SUBSCRIPTION_STORAGE_KEY, "{{{not-json");
    const state = await new DemoSubscriptionProvider().getState();
    expect(state.plan).toBe("Team");
    expect(state.source).toBe("demo");
  });
});
