import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AnimatedNumber } from "./AnimatedNumber";
import { setPrivacyMaskOn } from "../domain/currency";

// jsdom-safe rAF: run frames manually via vi.advanceTimersByTime.
function stubRaf() {
  let now = 0;
  vi.useFakeTimers();
  vi.stubGlobal("performance", { now: () => now });
  vi.stubGlobal(
    "requestAnimationFrame",
    (cb: FrameRequestCallback) =>
      setTimeout(() => {
        now += 16;
        cb(now);
      }, 16) as unknown as number,
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
}

afterEach(() => {
  setPrivacyMaskOn(false);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const fmt = (n: number) => n.toFixed(0);

describe("AnimatedNumber", () => {
  it("renders the formatted value immediately on first mount (no tween-in)", () => {
    stubRaf();
    render(
      <span data-testid="n">
        <AnimatedNumber value={100} format={fmt} />
      </span>,
    );
    expect(screen.getByTestId("n").textContent).toBe("100");
  });

  it("renders fallback for null", () => {
    stubRaf();
    render(
      <span data-testid="n">
        <AnimatedNumber value={null} format={fmt} fallback="—" />
      </span>,
    );
    expect(screen.getByTestId("n").textContent).toBe("—");
  });

  it("tweens to a new value and settles exactly on the target", () => {
    stubRaf();
    const { rerender } = render(
      <span data-testid="n">
        <AnimatedNumber value={100} format={fmt} />
      </span>,
    );
    rerender(
      <span data-testid="n">
        <AnimatedNumber value={200} format={fmt} />
      </span>,
    );
    act(() => {
      vi.advanceTimersByTime(96);
    }); // mid-flight
    const mid = Number(screen.getByTestId("n").textContent);
    expect(mid).toBeGreaterThan(100);
    expect(mid).toBeLessThan(200);
    act(() => {
      vi.advanceTimersByTime(1000);
    }); // past DURATION_MS
    expect(screen.getByTestId("n").textContent).toBe("200");
  });

  it("snaps (no tween) when resetKey changes", () => {
    stubRaf();
    const { rerender } = render(
      <span data-testid="n">
        <AnimatedNumber value={100} format={fmt} resetKey="a" />
      </span>,
    );
    rerender(
      <span data-testid="n">
        <AnimatedNumber value={999} format={fmt} resetKey="b" />
      </span>,
    );
    expect(screen.getByTestId("n").textContent).toBe("999");
  });

  it("snaps when privacy mask is on", () => {
    stubRaf();
    const { rerender } = render(
      <span data-testid="n">
        <AnimatedNumber value={100} format={fmt} />
      </span>,
    );
    setPrivacyMaskOn(true);
    rerender(
      <span data-testid="n">
        <AnimatedNumber value={200} format={fmt} />
      </span>,
    );
    expect(screen.getByTestId("n").textContent).toBe("200");
  });

  it("snaps under prefers-reduced-motion", () => {
    stubRaf();
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((q: string) => ({
        matches: q === "(prefers-reduced-motion: reduce)",
        media: q,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    const { rerender } = render(
      <span data-testid="n">
        <AnimatedNumber value={100} format={fmt} />
      </span>,
    );
    rerender(
      <span data-testid="n">
        <AnimatedNumber value={200} format={fmt} />
      </span>,
    );
    expect(screen.getByTestId("n").textContent).toBe("200");
  });
});
