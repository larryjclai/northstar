import { describe, expect, it } from "vitest";

import { escapeTargetInsideDialog } from "./escapeOwnership";

describe("escapeTargetInsideDialog", () => {
  it('returns true when the event target is inside a [role="dialog"] ancestor', () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const child = document.createElement("input");
    dialog.appendChild(child);
    document.body.appendChild(dialog);

    const event = new KeyboardEvent("keydown", { key: "Escape" });
    Object.defineProperty(event, "target", { value: child });

    expect(escapeTargetInsideDialog(event)).toBe(true);

    dialog.remove();
  });

  it("returns true when the event target IS the dialog element itself", () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.appendChild(dialog);

    const event = new KeyboardEvent("keydown", { key: "Escape" });
    Object.defineProperty(event, "target", { value: dialog });

    expect(escapeTargetInsideDialog(event)).toBe(true);

    dialog.remove();
  });

  it('returns false when the event target is outside any [role="dialog"]', () => {
    const outside = document.createElement("input");
    document.body.appendChild(outside);

    const event = new KeyboardEvent("keydown", { key: "Escape" });
    Object.defineProperty(event, "target", { value: outside });

    expect(escapeTargetInsideDialog(event)).toBe(false);

    outside.remove();
  });

  it("returns false for a non-Element target (defensive — window keydown targets are usually Elements, but don't assume)", () => {
    const event = new KeyboardEvent("keydown", { key: "Escape" });
    Object.defineProperty(event, "target", { value: null });

    expect(escapeTargetInsideDialog(event)).toBe(false);
  });
});
