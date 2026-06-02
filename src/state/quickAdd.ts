// Global QuickAdd open state (Zustand).
//
// QuickAdd is the single record-entry surface. Routing every trigger — the
// sidebar button, the mobile FAB, the ⌘N shortcut and the dashboard 新增
// button — through one store keeps "add" behaviour identical everywhere instead
// of some triggers opening QuickAdd and others navigating to a page.

import { create } from "zustand";

interface QuickAddState {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

export const useQuickAdd = create<QuickAddState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((state) => ({ open: !state.open })),
}));
