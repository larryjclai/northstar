// Global demo-mode flag (Zustand), mirrored to localStorage by enter/exitDemoMode
// in data/demoData.ts. Lets the AppShell banner and the Settings card stay in
// sync no matter which surface toggled demo mode.

import { create } from "zustand";
import { isDemoMode } from "../data/demoData";

interface DemoModeState {
  active: boolean;
  set: (active: boolean) => void;
}

export const useDemoMode = create<DemoModeState>((set) => ({
  active: isDemoMode(),
  set: (active) => set({ active }),
}));
