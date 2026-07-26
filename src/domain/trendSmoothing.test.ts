import { describe, expect, it } from "vitest";
import { smoothTrend } from "./trendSmoothing";

const pt = (value: number, iso = "2026-01-01") => ({ value, iso, date: iso });

describe("smoothTrend", () => {
  it("computes a trailing moving average over a known series", () => {
    // window 3 over [10,20,30,40,50]; last point keeps its real value.
    const out = smoothTrend(
      [10, 20, 30, 40, 50].map((v) => pt(v)),
      { window: 3 },
    );
    expect(out.map((p) => p.value)).toEqual([
      10, // avg(10)
      15, // avg(10,20)
      20, // avg(10,20,30)
      30, // avg(20,30,40)
      50, // last point = real value (NOT avg(30,40,50)=40)
    ]);
  });

  it("returns the input unchanged for window <= 1", () => {
    const input = [10, 20, 30].map((v) => pt(v));
    expect(smoothTrend(input, { window: 1 }).map((p) => p.value)).toEqual([10, 20, 30]);
    expect(smoothTrend(input, { window: 0 }).map((p) => p.value)).toEqual([10, 20, 30]);
  });

  it("degrades gracefully when the series is shorter than the window (no NaN, no throw)", () => {
    const out = smoothTrend(
      [10, 30].map((v) => pt(v)),
      { window: 30 },
    );
    expect(out.map((p) => p.value)).toEqual([10, 30]);
    expect(out.every((p) => Number.isFinite(p.value))).toBe(true);
  });

  it("keeps the endpoint equal to the real latest value (plan-032 invariant)", () => {
    const series = [100, 200, 150, 175, 9999].map((v) => pt(v));
    const out = smoothTrend(series, { window: 30 });
    expect(out[out.length - 1].value).toBe(9999);
  });

  it("preserves non-value fields and does not mutate the input", () => {
    const input = [pt(10, "2026-01-01"), pt(20, "2026-01-02"), pt(30, "2026-01-03")];
    const snapshot = input.map((p) => ({ ...p }));
    const out = smoothTrend(input, { window: 2 });
    expect(out.map((p) => p.iso)).toEqual(["2026-01-01", "2026-01-02", "2026-01-03"]);
    expect(input).toEqual(snapshot); // input untouched
  });

  it("handles empty and single-point series", () => {
    expect(smoothTrend([], { window: 30 })).toEqual([]);
    expect(smoothTrend([pt(42)], { window: 30 }).map((p) => p.value)).toEqual([42]);
  });

  it("defaults to a 30-point window when no option is given", () => {
    // 31 points of constant 100 → MA is 100 everywhere; trivially stable.
    const input = Array.from({ length: 31 }, () => pt(100));
    const out = smoothTrend(input);
    expect(out.every((p) => p.value === 100)).toBe(true);
  });
});
