export * from "./types";
export * from "./demo";

import { create } from "zustand";
import { getSubscriptionProvider, resetDemoSubscription } from "./demo";
import type { PlanId, SubscriptionState } from "./types";

interface SubscriptionUiState {
  state: SubscriptionState | null;
  loading: boolean;
  error: string | null;
  /** Simulated plan change in flight (demo upgrade/downgrade). */
  changing: boolean;
  load: () => Promise<void>;
  changePlan: (plan: PlanId) => Promise<SubscriptionState>;
  resetDemo: () => Promise<void>;
}

/**
 * Reactive wrapper over the replaceable subscription boundary. Everything here
 * is demo data (source: "demo") until the backend contract exists — the UI
 * must keep labeling it as such.
 */
export const useSubscriptionStore = create<SubscriptionUiState>((set, get) => ({
  state: null,
  loading: false,
  error: null,
  changing: false,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const state = await getSubscriptionProvider().getState();
      set({ state, loading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Could not load the subscription state.", loading: false });
    }
  },

  changePlan: async (plan) => {
    set({ changing: true, error: null });
    try {
      const state = await getSubscriptionProvider().changePlan(plan);
      set({ state, changing: false });
      return state;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Could not change the plan.", changing: false });
      throw err;
    }
  },

  resetDemo: async () => {
    resetDemoSubscription();
    await get().load();
  },
}));
