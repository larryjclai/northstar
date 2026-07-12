// Thin, safe wrapper around `@tauri-apps/plugin-haptics`. Silent no-op outside
// Tauri-mobile (desktop app, browser dev server, and vitest/jsdom): the plugin
// is compiled out of the Rust binary on desktop (see src-tauri/Cargo.toml +
// src-tauri/src/lib.rs cfg(mobile) gates), so calling it there would either
// throw or do nothing useful — we just skip the dynamic import entirely.
//
// This is the ONLY sanctioned entry point for haptic feedback. Call sites
// should fire-and-forget (`void haptic(...)`), never await in a way that
// delays UI feedback, and never reach into the plugin module directly.

export type HapticKind = "light" | "medium" | "success" | "selection";

export async function haptic(kind: HapticKind): Promise<void> {
  try {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;
    const mod = await import("@tauri-apps/plugin-haptics");
    switch (kind) {
      case "light":
        await mod.impactFeedback("light");
        break;
      case "medium":
        await mod.impactFeedback("medium");
        break;
      case "success":
        await mod.notificationFeedback("success");
        break;
      case "selection":
        await mod.selectionFeedback();
        break;
    }
  } catch {
    // Desktop, browser, or plugin absent — never throw, never block the UI.
  }
}
