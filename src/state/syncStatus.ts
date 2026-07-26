// Global sync status store (Zustand).
// Updated by runSync() callers; read by ConnectStatus UI and AppShell.

import { create } from "zustand";

export type SyncPhase = "idle" | "pushing" | "pulling" | "done" | "error";

export interface SyncStatusState {
  phase: SyncPhase;
  lastSyncAt: string | null; // ISO timestamp of last successful full sync
  lastPushed: number; // envelopes pushed in last run
  lastPulled: number; // envelopes pulled in last run
  lastApplied: number; // records merged in last run
  error: string | null;

  // Actions
  setPhase: (phase: SyncPhase) => void;
  setSyncDone: (pushed: number, pulled: number, applied: number) => void;
  setError: (message: string) => void;
  reset: () => void;
}

const STORAGE_KEY = "northstar.sync.lastSyncAt.v1";

function loadLastSyncAt(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export const useSyncStatus = create<SyncStatusState>((set) => ({
  phase: "idle",
  lastSyncAt: loadLastSyncAt(),
  lastPushed: 0,
  lastPulled: 0,
  lastApplied: 0,
  error: null,

  setPhase: (phase) => set({ phase }),

  setSyncDone: (pushed, pulled, applied) => {
    const now = new Date().toISOString();
    try {
      localStorage.setItem(STORAGE_KEY, now);
    } catch {
      /* ignore */
    }
    set({
      phase: "done",
      lastSyncAt: now,
      lastPushed: pushed,
      lastPulled: pulled,
      lastApplied: applied,
      error: null,
    });
    // Return to idle after a brief moment so the spinner stops
    setTimeout(() => set((s) => (s.phase === "done" ? { ...s, phase: "idle" } : s)), 2500);
  },

  setError: (message) => set({ phase: "error", error: message }),

  reset: () => set({ phase: "idle", error: null }),
}));
