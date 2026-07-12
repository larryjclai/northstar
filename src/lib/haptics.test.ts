import { describe, expect, it, vi } from "vitest";
import { haptic } from "./haptics";

// jsdom has no `__TAURI_INTERNALS__` global, so `haptic()` should resolve
// without throwing and must never reach into the plugin module.
const impactFeedback = vi.fn();
const notificationFeedback = vi.fn();
const selectionFeedback = vi.fn();

vi.mock("@tauri-apps/plugin-haptics", () => ({
  impactFeedback: (...args: unknown[]) => impactFeedback(...args),
  notificationFeedback: (...args: unknown[]) => notificationFeedback(...args),
  selectionFeedback: (...args: unknown[]) => selectionFeedback(...args),
}));

describe("haptic", () => {
  it("resolves without throwing outside Tauri", async () => {
    await expect(haptic("light")).resolves.toBeUndefined();
    await expect(haptic("medium")).resolves.toBeUndefined();
    await expect(haptic("success")).resolves.toBeUndefined();
    await expect(haptic("selection")).resolves.toBeUndefined();
  });

  it("performs no dynamic import / plugin call when __TAURI_INTERNALS__ is absent", async () => {
    expect("__TAURI_INTERNALS__" in window).toBe(false);
    await haptic("selection");
    expect(impactFeedback).not.toHaveBeenCalled();
    expect(notificationFeedback).not.toHaveBeenCalled();
    expect(selectionFeedback).not.toHaveBeenCalled();
  });
});
