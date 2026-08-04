import { act } from "react";
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useKeyboardInset } from "./useKeyboardInset";

// jsdom ships no `visualViewport` — every test backs it with a fake
// EventTarget so we can drive resize/scroll and assert cleanup, per repo
// convention (vi.stubGlobal per-test; see AGENTS.md "Testing gotchas").
function makeVisualViewportStub(overrides: { height: number; offsetTop: number }) {
  const target = new EventTarget();
  return Object.assign(target, {
    height: overrides.height,
    offsetTop: overrides.offsetTop,
    width: 0,
    offsetLeft: 0,
    pageLeft: 0,
    pageTop: 0,
    scale: 1,
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useKeyboardInset", () => {
  it("returns 0 when window.visualViewport is unavailable (desktop / jsdom default)", () => {
    vi.stubGlobal("visualViewport", undefined);
    const { result } = renderHook(() => useKeyboardInset());
    expect(result.current).toBe(0);
  });

  it("computes inset from innerHeight - vv.height - vv.offsetTop after a resize", () => {
    vi.stubGlobal("innerHeight", 800);
    const vv = makeVisualViewportStub({ height: 500, offsetTop: 10 });
    vi.stubGlobal("visualViewport", vv);

    const { result } = renderHook(() => useKeyboardInset());
    // Initial mount already runs `update()` once.
    expect(result.current).toBe(800 - 500 - 10);

    act(() => {
      vv.height = 480;
      vv.dispatchEvent(new Event("resize"));
    });
    expect(result.current).toBe(800 - 480 - 10);
  });

  it("clamps to 0 instead of going negative", () => {
    vi.stubGlobal("innerHeight", 600);
    const vv = makeVisualViewportStub({ height: 700, offsetTop: 0 });
    vi.stubGlobal("visualViewport", vv);

    const { result } = renderHook(() => useKeyboardInset());
    expect(result.current).toBe(0);
  });

  it("updates on scroll events too", () => {
    vi.stubGlobal("innerHeight", 800);
    const vv = makeVisualViewportStub({ height: 500, offsetTop: 0 });
    vi.stubGlobal("visualViewport", vv);

    const { result } = renderHook(() => useKeyboardInset());
    expect(result.current).toBe(300);

    act(() => {
      vv.offsetTop = 20;
      vv.dispatchEvent(new Event("scroll"));
    });
    expect(result.current).toBe(280);
  });

  it("removes its resize/scroll listeners on unmount", () => {
    const vv = makeVisualViewportStub({ height: 500, offsetTop: 0 });
    const removeSpy = vi.spyOn(vv, "removeEventListener");
    vi.stubGlobal("innerHeight", 800);
    vi.stubGlobal("visualViewport", vv);

    const { unmount } = renderHook(() => useKeyboardInset());
    unmount();

    expect(removeSpy).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith("scroll", expect.any(Function));
  });
});
