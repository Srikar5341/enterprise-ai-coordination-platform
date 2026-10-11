"use client";

import { create } from "zustand";

/**
 * One-shot blocker-report draft handed over from the AI Work Assistant.
 * The assistant NEVER reports blockers itself — it only fills this draft;
 * the user still reviews and submits the authorized "Report blocker" dialog
 * on the task detail page, which consumes (clears) the draft once.
 */
export interface BlockerDraft {
  taskId: string;
  taskTitle: string;
  title: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
}

interface OpsPilotUiState {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  /** Landing page "pause nonessential animation" control */
  animationsPaused: boolean;
  setAnimationsPaused: (paused: boolean) => void;
  draftBlocker: BlockerDraft | null;
  setDraftBlocker: (draft: BlockerDraft | null) => void;
  /** Reads and clears the draft (one-shot). */
  consumeDraftBlocker: () => BlockerDraft | null;
}

export const useUiStore = create<OpsPilotUiState>((set, get) => ({
  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  animationsPaused: false,
  setAnimationsPaused: (paused) => set({ animationsPaused: paused }),
  draftBlocker: null,
  setDraftBlocker: (draft) => set({ draftBlocker: draft }),
  consumeDraftBlocker: () => {
    const draft = get().draftBlocker;
    if (draft) set({ draftBlocker: null });
    return draft;
  },
}));
