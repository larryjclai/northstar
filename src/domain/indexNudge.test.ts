import { describe, expect, it } from "vitest";
import { evaluateIndexNudge, DEFAULT_GAP_FLOOR_PCT } from "./indexNudge";

// Helpers -------------------------------------------------------------------
/** Build a benchmark series that beats the portfolio by `gap` pp every window. */
function laggingBy(gap: number, windows: number, portReturn = 1): { port: number[]; bench: number[] } {
  return {
    port: Array.from({ length: windows }, () => portReturn),
    bench: Array.from({ length: windows }, () => portReturn + gap),
  };
}

describe("evaluateIndexNudge", () => {
  it("returns insufficient-data when fewer than minWindows are supplied", () => {
    const { port, bench } = laggingBy(2, 5); // 5 lagging windows, need 8
    const v = evaluateIndexNudge({ portfolioReturns: port, benchmarkReturns: bench, minWindows: 8 });
    expect(v.reason).toBe("insufficient-data");
    expect(v.triggered).toBe(false);
    expect(v.consecutiveLagging).toBe(0);
    expect(v.cumulativeGapPct).toBeNull();
  });

  it("returns leading (not triggered) when the most recent window is ahead", () => {
    // 8 windows, portfolio ahead in the last one (breaks any lagging streak).
    const port = [1, 1, 1, 1, 1, 1, 1, 5];
    const bench = [3, 3, 3, 3, 3, 3, 3, 1];
    const v = evaluateIndexNudge({ portfolioReturns: port, benchmarkReturns: bench, minWindows: 8 });
    expect(v.reason).toBe("leading");
    expect(v.triggered).toBe(false);
    expect(v.consecutiveLagging).toBe(0);
    expect(v.cumulativeGapPct).toBeNull();
  });

  it("treats an exact tie in the latest window as leading (strict-lag rule)", () => {
    const port = [1, 1, 1, 1, 1, 1, 1, 2];
    const bench = [3, 3, 3, 3, 3, 3, 3, 2]; // tie on the last window
    const v = evaluateIndexNudge({ portfolioReturns: port, benchmarkReturns: bench, minWindows: 8 });
    expect(v.reason).toBe("leading");
    expect(v.triggered).toBe(false);
  });

  it("returns lagging-not-persistent when the lagging streak is too short", () => {
    // 8 windows of data (passes the sample gate) but only the last 3 lag.
    const port = [5, 5, 5, 5, 5, 1, 1, 1];
    const bench = [1, 1, 1, 1, 1, 3, 3, 3];
    const v = evaluateIndexNudge({ portfolioReturns: port, benchmarkReturns: bench, minWindows: 8 });
    expect(v.reason).toBe("lagging-not-persistent");
    expect(v.triggered).toBe(false);
    expect(v.consecutiveLagging).toBe(3);
    expect(v.cumulativeGapPct).toBeCloseTo(6, 6); // 3 windows × 2pp
  });

  it("returns lagging-not-persistent when persistent but the cumulative gap is below the floor", () => {
    // 8 consecutive lagging windows but only 0.5pp each → 4pp total < 5pp floor.
    const { port, bench } = laggingBy(0.5, 8);
    const v = evaluateIndexNudge({ portfolioReturns: port, benchmarkReturns: bench, minWindows: 8 });
    expect(v.reason).toBe("lagging-not-persistent");
    expect(v.triggered).toBe(false);
    expect(v.consecutiveLagging).toBe(8);
    expect(v.cumulativeGapPct).toBeCloseTo(4, 6);
  });

  it("triggers persistent-lag when the streak and cumulative gap both clear", () => {
    const { port, bench } = laggingBy(2, 8); // 8 windows × 2pp = 16pp gap
    const v = evaluateIndexNudge({ portfolioReturns: port, benchmarkReturns: bench, minWindows: 8 });
    expect(v.reason).toBe("persistent-lag");
    expect(v.triggered).toBe(true);
    expect(v.consecutiveLagging).toBe(8);
    expect(v.cumulativeGapPct).toBeCloseTo(16, 6);
  });

  it("only counts the trailing consecutive streak, not earlier lagging windows", () => {
    // Earlier windows lag too, but a leading window in the middle resets the run.
    const port = [1, 1, 5, 1, 1, 1, 1, 1, 1, 1, 1, 1]; // index 2 leads
    const bench = [3, 3, 1, 3, 3, 3, 3, 3, 3, 3, 3, 3];
    const v = evaluateIndexNudge({ portfolioReturns: port, benchmarkReturns: bench, minWindows: 8 });
    expect(v.consecutiveLagging).toBe(9); // windows 3..11 (0-indexed)
    expect(v.reason).toBe("persistent-lag");
    expect(v.triggered).toBe(true);
    expect(v.cumulativeGapPct).toBeCloseTo(18, 6); // 9 × 2pp
  });

  // Boundary: exactly minWindows consecutive lagging windows -----------------
  it("triggers at exactly minWindows consecutive lagging windows (inclusive)", () => {
    // 9 windows: only the last 8 lag; streak === minWindows.
    const port = [9, 1, 1, 1, 1, 1, 1, 1, 1];
    const bench = [1, 3, 3, 3, 3, 3, 3, 3, 3];
    const v = evaluateIndexNudge({ portfolioReturns: port, benchmarkReturns: bench, minWindows: 8 });
    expect(v.consecutiveLagging).toBe(8);
    expect(v.reason).toBe("persistent-lag");
    expect(v.triggered).toBe(true);
  });

  // Boundary: cumulative gap exactly at the floor ---------------------------
  it("triggers when the cumulative gap is exactly at the floor (inclusive)", () => {
    // 8 windows × 0.625pp = 5.0pp === DEFAULT_GAP_FLOOR_PCT.
    const gap = DEFAULT_GAP_FLOOR_PCT / 8;
    const { port, bench } = laggingBy(gap, 8);
    const v = evaluateIndexNudge({ portfolioReturns: port, benchmarkReturns: bench, minWindows: 8 });
    expect(v.cumulativeGapPct).toBeCloseTo(DEFAULT_GAP_FLOOR_PCT, 6);
    expect(v.reason).toBe("persistent-lag");
    expect(v.triggered).toBe(true);
  });

  it("respects a custom gapFloorPct override", () => {
    const { port, bench } = laggingBy(1, 8); // 8pp cumulative gap
    const v = evaluateIndexNudge({ portfolioReturns: port, benchmarkReturns: bench, minWindows: 8, gapFloorPct: 10 });
    expect(v.reason).toBe("lagging-not-persistent"); // 8pp < 10pp floor
    expect(v.triggered).toBe(false);
  });

  it("considers only the first min(length) windows when series lengths differ", () => {
    const port = [1, 1, 1, 1, 1, 1, 1, 1];
    const bench = [3, 3, 3, 3, 3, 3, 3, 3, 3, 3]; // longer; min length = 8
    const v = evaluateIndexNudge({ portfolioReturns: port, benchmarkReturns: bench, minWindows: 8 });
    expect(v.consecutiveLagging).toBe(8);
    expect(v.triggered).toBe(true);
  });
});
