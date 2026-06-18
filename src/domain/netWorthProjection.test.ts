import { describe, expect, it } from "vitest";
import { projectNetWorth } from "./netWorthProjection";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NW = 5_000_000;
const ANNUAL_CONTRIBUTION = 600_000;
const RETURN_PCT = 7;

// ---------------------------------------------------------------------------
// Basic shape & milestone values
// ---------------------------------------------------------------------------

describe("projectNetWorth", () => {
  it("returns a 31-point series (year 0 through year 30)", () => {
    const result = projectNetWorth(NW, ANNUAL_CONTRIBUTION, RETURN_PCT);
    expect(result.series).toHaveLength(31);
    expect(result.series[0].yearsFromNow).toBe(0);
    expect(result.series[30].yearsFromNow).toBe(30);
  });

  it("series[0] (anchor) equals current net worth for all scenarios", () => {
    const result = projectNetWorth(NW, ANNUAL_CONTRIBUTION, RETURN_PCT);
    const anchor = result.series[0];
    expect(anchor.neutralBalance).toBe(NW);
    expect(anchor.bearBalance).toBe(NW);
    expect(anchor.bullBalance).toBe(NW);
  });

  it("at10/at20/at30 are monotonically increasing with positive contribution + return", () => {
    const result = projectNetWorth(NW, ANNUAL_CONTRIBUTION, RETURN_PCT);
    expect(result.at10).toBeGreaterThan(NW);
    expect(result.at20).toBeGreaterThan(result.at10);
    expect(result.at30).toBeGreaterThan(result.at20);
  });

  it("at10/at20/at30 match the corresponding series points", () => {
    const result = projectNetWorth(NW, ANNUAL_CONTRIBUTION, RETURN_PCT);
    const y10 = result.series.find((p) => p.yearsFromNow === 10)!;
    const y20 = result.series.find((p) => p.yearsFromNow === 20)!;
    const y30 = result.series.find((p) => p.yearsFromNow === 30)!;
    expect(result.at10).toBeCloseTo(y10.neutralBalance);
    expect(result.at20).toBeCloseTo(y20.neutralBalance);
    expect(result.at30).toBeCloseTo(y30.neutralBalance);
  });

  it("bear ≤ neutral ≤ bull throughout the series", () => {
    const result = projectNetWorth(NW, ANNUAL_CONTRIBUTION, RETURN_PCT);
    for (const point of result.series.slice(1)) { // skip year-0 anchor (all equal)
      expect(point.bearBalance).toBeLessThanOrEqual(point.neutralBalance + 1); // ±1 rounding
      expect(point.neutralBalance).toBeLessThanOrEqual(point.bullBalance + 1);
    }
  });

  it("exposes correct cagr values", () => {
    const result = projectNetWorth(NW, ANNUAL_CONTRIBUTION, RETURN_PCT);
    expect(result.returnPct).toBe(RETURN_PCT);
    expect(result.bearCagr).toBeCloseTo(RETURN_PCT - 2.5);
    expect(result.bullCagr).toBeCloseTo(RETURN_PCT + 2.5);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("projectNetWorth edge cases", () => {
  it("zero contribution: pure compounding, still grows with positive return", () => {
    const result = projectNetWorth(NW, 0, RETURN_PCT);
    expect(result.at30).toBeGreaterThan(NW);
  });

  it("zero net worth: starts at 0 and grows from contributions alone", () => {
    const result = projectNetWorth(0, ANNUAL_CONTRIBUTION, RETURN_PCT);
    expect(result.series[0].neutralBalance).toBe(0);
    expect(result.at30).toBeGreaterThan(0);
  });

  it("negative net worth is clamped to 0 for the projection", () => {
    const result = projectNetWorth(-1_000_000, ANNUAL_CONTRIBUTION, RETURN_PCT);
    // Engine starts from 0; contributions still grow
    expect(result.at30).toBeGreaterThanOrEqual(0);
    expect(result.series[0].neutralBalance).toBe(0);
  });

  it("negative contribution is clamped to 0 (no drawdown in v1)", () => {
    const resultPos = projectNetWorth(NW, 0, RETURN_PCT);
    const resultNeg = projectNetWorth(NW, -500_000, RETURN_PCT);
    // Both should produce identical results since negative → 0
    expect(resultNeg.at30).toBeCloseTo(resultPos.at30);
  });

  it("default return pct is 7% when omitted", () => {
    const withDefault = projectNetWorth(NW, ANNUAL_CONTRIBUTION);
    const explicit7 = projectNetWorth(NW, ANNUAL_CONTRIBUTION, 7);
    expect(withDefault.at30).toBeCloseTo(explicit7.at30);
  });

  it("year labels start at the current calendar year", () => {
    const currentYear = new Date().getFullYear();
    const result = projectNetWorth(NW, ANNUAL_CONTRIBUTION, RETURN_PCT);
    expect(result.series[0].year).toBe(currentYear);
    expect(result.series[10].year).toBe(currentYear + 10);
    expect(result.series[30].year).toBe(currentYear + 30);
  });
});

// ---------------------------------------------------------------------------
// Orientation: cross-check vs the FIRE engine for the same inputs
// ---------------------------------------------------------------------------

describe("cross-check with engine", () => {
  it("nominal 30-yr result with zero inflation/fees roughly matches FV formula", () => {
    // FV(r=7%, n=30, pmt=600000, pv=5000000):
    // PV growth: 5_000_000 × 1.07^30 ≈ 38_061_284
    // PMT annuity: 600_000 × ((1.07^30 - 1) / 0.07) ≈ 56_822_280
    // Total ≈ 94_883_564
    const result = projectNetWorth(5_000_000, 600_000, 7);
    const fvPv = 5_000_000 * Math.pow(1.07, 30);
    const fvPmt = 600_000 * ((Math.pow(1.07, 30) - 1) / 0.07);
    const expected = fvPv + fvPmt;
    // Allow ±2% tolerance (engine applies round-cents at each step)
    expect(result.at30).toBeGreaterThan(expected * 0.98);
    expect(result.at30).toBeLessThan(expected * 1.02);
  });
});
