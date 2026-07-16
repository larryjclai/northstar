import { describe, expect, it } from "vitest";
import {
  evaluateIndexNudge,
  buildIndexNudgeWindows,
  alignTwrWithBenchmark,
  DEFAULT_GAP_FLOOR_PCT,
  DEFAULT_NUDGE_WINDOW_DAYS,
  type NudgeWindowSeries,
} from "./indexNudge";

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

// ─── buildIndexNudgeWindows ──────────────────────────────────────────────────

/** ISO date `days` calendar days after `date` (UTC, mirrors the implementation). */
function isoAddDays(date: string, days: number): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** Cumulative-return series with points exactly at the k·91-day boundaries,
 *  compounding at `quarterlyPct` % per window. */
function quarterlySeries(start: string, quarters: number, quarterlyPct: number): NudgeWindowSeries[] {
  return Array.from({ length: quarters + 1 }, (_, k) => ({
    date: isoAddDays(start, k * DEFAULT_NUDGE_WINDOW_DAYS),
    pct: (Math.pow(1 + quarterlyPct / 100, k) - 1) * 100,
  }));
}

describe("buildIndexNudgeWindows", () => {
  // Hand-computed fixture: 3 quarters, boundaries at +91/+182/+273 days.
  // Portfolio compounds 10%/quarter (cum 0, 10, 21, 33.1), benchmark
  // 5%/quarter (cum 0, 5, 10.25, 15.7625).
  const port3q = quarterlySeries("2025-01-01", 3, 10);
  const bench3q = quarterlySeries("2025-01-01", 3, 5);

  it("slices ~3 quarters of aligned series into 3 windows with correct per-window returns", () => {
    // Sanity-check the fixture's hand-computed dates and cum levels.
    expect(port3q.map((p) => p.date)).toEqual(["2025-01-01", "2025-04-02", "2025-07-02", "2025-10-01"]);
    expect(port3q[3].pct).toBeCloseTo(33.1, 6);
    expect(bench3q[3].pct).toBeCloseTo(15.7625, 6);

    const { portfolioReturns, benchmarkReturns } = buildIndexNudgeWindows({
      portfolioCum: port3q,
      benchmarkCum: bench3q,
    });
    expect(portfolioReturns).toHaveLength(3);
    expect(benchmarkReturns).toHaveLength(3);
    for (const r of portfolioReturns) expect(r).toBeCloseTo(10, 6);
    for (const r of benchmarkReturns) expect(r).toBeCloseTo(5, 6);
  });

  it("uses only intersecting dates when the series are misaligned", () => {
    // Portfolio has two extra dates the benchmark lacks (and vice versa); the
    // intersection is exactly the 4 boundary points, so windows match the
    // aligned fixture above.
    const portExtra = [
      port3q[0],
      { date: "2025-02-15", pct: 99 }, // no benchmark point that day → ignored
      ...port3q.slice(1),
    ];
    const benchExtra = [
      bench3q[0],
      { date: "2025-03-20", pct: -50 }, // no portfolio point that day → ignored
      ...bench3q.slice(1),
    ];
    const { portfolioReturns, benchmarkReturns } = buildIndexNudgeWindows({
      portfolioCum: portExtra,
      benchmarkCum: benchExtra,
    });
    expect(portfolioReturns).toHaveLength(3);
    for (const r of portfolioReturns) expect(r).toBeCloseTo(10, 6);
    for (const r of benchmarkReturns) expect(r).toBeCloseTo(5, 6);
  });

  it("returns empty arrays when fewer than 2 aligned points exist", () => {
    // Disjoint dates → 0 aligned points.
    const disjoint = buildIndexNudgeWindows({
      portfolioCum: [{ date: "2025-01-01", pct: 0 }, { date: "2025-01-02", pct: 1 }],
      benchmarkCum: [{ date: "2025-06-01", pct: 0 }, { date: "2025-06-02", pct: 1 }],
    });
    expect(disjoint).toEqual({ portfolioReturns: [], benchmarkReturns: [] });

    // Exactly 1 common date → still insufficient.
    const single = buildIndexNudgeWindows({
      portfolioCum: [{ date: "2025-01-01", pct: 0 }, { date: "2025-01-02", pct: 1 }],
      benchmarkCum: [{ date: "2025-01-01", pct: 0 }, { date: "2025-03-01", pct: 1 }],
    });
    expect(single).toEqual({ portfolioReturns: [], benchmarkReturns: [] });
  });

  it("drops a trailing partial window shorter than half the window size", () => {
    // 30 days past the +273 boundary (< 45.5) with a wild cum jump — the tail
    // must be dropped, leaving the 3 full windows untouched.
    const tailDate = isoAddDays("2025-10-01", 30);
    const { portfolioReturns, benchmarkReturns } = buildIndexNudgeWindows({
      portfolioCum: [...port3q, { date: tailDate, pct: 300 }],
      benchmarkCum: [...bench3q, { date: tailDate, pct: -60 }],
    });
    expect(portfolioReturns).toHaveLength(3);
    for (const r of portfolioReturns) expect(r).toBeCloseTo(10, 6);
    for (const r of benchmarkReturns) expect(r).toBeCloseTo(5, 6);
  });

  it("keeps a trailing partial window covering at least half the window size", () => {
    // 46 days past the +273 boundary (≥ 45.5) → a 4th (partial) window.
    const tailDate = isoAddDays("2025-10-01", 46);
    const { portfolioReturns, benchmarkReturns } = buildIndexNudgeWindows({
      portfolioCum: [...port3q, { date: tailDate, pct: (Math.pow(1.1, 3) * 1.05 - 1) * 100 }],
      benchmarkCum: [...bench3q, { date: tailDate, pct: (Math.pow(1.05, 3) * 1.02 - 1) * 100 }],
    });
    expect(portfolioReturns).toHaveLength(4);
    expect(portfolioReturns[3]).toBeCloseTo(5, 6);
    expect(benchmarkReturns[3]).toBeCloseTo(2, 6);
  });

  it("round-trips into evaluateIndexNudge: persistent lag triggers, leading does not", () => {
    // 8 quarters: portfolio 1%/q vs benchmark 3%/q → 8 consecutive lagging
    // windows, 2pp gap each → 16pp cumulative ≥ 5pp floor → triggered.
    const laggingPort = quarterlySeries("2023-01-01", 8, 1);
    const laggingBench = quarterlySeries("2023-01-01", 8, 3);
    const lag = buildIndexNudgeWindows({ portfolioCum: laggingPort, benchmarkCum: laggingBench });
    const lagVerdict = evaluateIndexNudge({
      portfolioReturns: lag.portfolioReturns,
      benchmarkReturns: lag.benchmarkReturns,
      minWindows: 8,
    });
    expect(lagVerdict.triggered).toBe(true);
    expect(lagVerdict.reason).toBe("persistent-lag");
    expect(lagVerdict.consecutiveLagging).toBe(8);
    expect(lagVerdict.cumulativeGapPct).toBeCloseTo(16, 6);

    // Same construction with the sides swapped → leading, never triggers.
    const lead = buildIndexNudgeWindows({ portfolioCum: laggingBench, benchmarkCum: laggingPort });
    const leadVerdict = evaluateIndexNudge({
      portfolioReturns: lead.portfolioReturns,
      benchmarkReturns: lead.benchmarkReturns,
      minWindows: 8,
    });
    expect(leadVerdict.triggered).toBe(false);
    expect(leadVerdict.reason).toBe("leading");
  });
});

// ─── alignTwrWithBenchmark ───────────────────────────────────────────────────

describe("alignTwrWithBenchmark", () => {
  it("rebases both series to 0% at the first common date on the happy path", () => {
    const twrSeries = [
      { date: "2025-01-01", pct: 0 },
      { date: "2025-02-01", pct: 10 },
      { date: "2025-03-01", pct: 21 },
    ];
    const bench = [
      { date: "2025-01-01", value: 100 },
      { date: "2025-02-01", value: 105 },
      { date: "2025-03-01", value: 110 },
    ];
    const aligned = alignTwrWithBenchmark(twrSeries, bench);
    expect(aligned).not.toBeNull();
    expect(aligned!.portfolioCum[0].pct).toBeCloseTo(0, 6);
    expect(aligned!.portfolioCum[1].pct).toBeCloseTo(10, 6);
    expect(aligned!.portfolioCum[2].pct).toBeCloseTo(21, 6);
    expect(aligned!.benchmarkCum[0].pct).toBeCloseTo(0, 6);
    expect(aligned!.benchmarkCum[1].pct).toBeCloseTo(5, 6);
    expect(aligned!.benchmarkCum[2].pct).toBeCloseTo(10, 6);
  });

  it("returns null when fewer than 2 dates overlap", () => {
    const twrSeries = [
      { date: "2025-01-01", pct: 0 },
      { date: "2025-02-01", pct: 5 },
    ];
    const bench = [{ date: "2025-01-01", value: 100 }]; // only 1 shared date
    expect(alignTwrWithBenchmark(twrSeries, bench)).toBeNull();

    const noOverlap = [{ date: "2025-06-01", value: 100 }];
    expect(alignTwrWithBenchmark(twrSeries, noOverlap)).toBeNull();
  });

  it("returns null when the TWR base is degenerate (pct = -100 → base 0)", () => {
    const twrSeries = [
      { date: "2025-01-01", pct: -100 },
      { date: "2025-02-01", pct: 5 },
    ];
    const bench = [
      { date: "2025-01-01", value: 100 },
      { date: "2025-02-01", value: 105 },
    ];
    expect(alignTwrWithBenchmark(twrSeries, bench)).toBeNull();
  });

  it("drops non-overlapping leading benchmark dates and keeps only shared dates", () => {
    const twrSeries = [
      { date: "2025-01-01", pct: 0 },
      { date: "2025-02-01", pct: 10 },
    ];
    const bench = [
      { date: "2024-12-01", value: 90 }, // leads the TWR series, no match → dropped
      { date: "2025-01-01", value: 100 },
      { date: "2025-02-01", value: 105 },
    ];
    const aligned = alignTwrWithBenchmark(twrSeries, bench);
    expect(aligned).not.toBeNull();
    expect(aligned!.portfolioCum).toHaveLength(2);
    expect(aligned!.benchmarkCum).toHaveLength(2);
    expect(aligned!.portfolioCum.map((p) => p.date)).toEqual(["2025-01-01", "2025-02-01"]);
    expect(aligned!.benchmarkCum[0].pct).toBeCloseTo(0, 6);
    expect(aligned!.benchmarkCum[1].pct).toBeCloseTo(5, 6);
  });
});
