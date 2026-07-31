import { describe, expect, it } from "vitest";
import { buildHeroTrendMeta, type HeroTrendPoint } from "./dashboardHeroTrend";

function points(...triples: Array<[string, number, string]>): HeroTrendPoint[] {
  return triples.map(([date, value, iso]) => ({ date, value, iso }));
}

describe("buildHeroTrendMeta", () => {
  it("empty array → null", () => {
    expect(buildHeroTrendMeta([])).toBeNull();
  });

  it("single point → null", () => {
    expect(buildHeroTrendMeta(points(["7/29", 100, "2026-07-29"]))).toBeNull();
  });

  it("two normal points (100 → 200) → startValue/endValue/change and nice-step yDomain snapped to yTicks", () => {
    const result = buildHeroTrendMeta(
      points(["7/29", 100, "2026-07-29"], ["7/30", 200, "2026-07-30"]),
    );
    expect(result).not.toBeNull();
    expect(result!.startValue).toBe(100);
    expect(result!.endValue).toBe(200);
    expect(result!.change).toBe(100);
    // padded range would be [85, 215]; nice-step snaps outward from there.
    expect(result!.yDomain[0]).toBeLessThanOrEqual(100);
    expect(result!.yDomain[1]).toBeGreaterThanOrEqual(200);
    expect(result!.yDomain[0]).toBe(result!.yTicks[0]);
    expect(result!.yDomain[1]).toBe(result!.yTicks[result!.yTicks.length - 1]);
  });

  it("flat series (all 1,000,000) → nice-step yDomain straddles the value, snapped to yTicks", () => {
    const result = buildHeroTrendMeta(
      points(
        ["7/28", 1_000_000, "2026-07-28"],
        ["7/29", 1_000_000, "2026-07-29"],
        ["7/30", 1_000_000, "2026-07-30"],
      ),
    );
    expect(result).not.toBeNull();
    expect(result!.yDomain[0]).toBeLessThan(1_000_000);
    expect(result!.yDomain[1]).toBeGreaterThan(1_000_000);
    expect(result!.yDomain[0]).toBe(result!.yTicks[0]);
    expect(result!.yDomain[1]).toBe(result!.yTicks[result!.yTicks.length - 1]);
  });

  it("all-zero series → does not collapse to [0, 0] (1-unit floor)", () => {
    const result = buildHeroTrendMeta(
      points(["7/28", 0, "2026-07-28"], ["7/29", 0, "2026-07-29"], ["7/30", 0, "2026-07-30"]),
    );
    expect(result).not.toBeNull();
    expect(result!.yDomain[0]).toBeLessThan(0);
    expect(result!.yDomain[1]).toBeGreaterThan(0);
  });

  it("negative net worth (-500,000 → -300,000) → domain covers both, change is positive 200,000", () => {
    const result = buildHeroTrendMeta(
      points(["7/29", -500_000, "2026-07-29"], ["7/30", -300_000, "2026-07-30"]),
    );
    expect(result).not.toBeNull();
    expect(result!.yDomain[0]).toBeLessThan(-500_000);
    expect(result!.yDomain[1]).toBeGreaterThan(-300_000);
    expect(result!.change).toBe(200_000);
  });

  it("ticks count: 30 points, maxTicks 6 → 6 ticks, first/last match, all present in input dates", () => {
    const thirty = Array.from({ length: 30 }, (_, i) => {
      const date = `${i}`;
      return [date, i, `2026-07-${String((i % 28) + 1).padStart(2, "0")}`] as [
        string,
        number,
        string,
      ];
    });
    const input = points(...thirty);
    const result = buildHeroTrendMeta(input, { maxTicks: 6 });
    expect(result).not.toBeNull();
    expect(result!.ticks.length).toBe(6);
    expect(result!.ticks[0]).toBe(input[0].date);
    expect(result!.ticks[result!.ticks.length - 1]).toBe(input[input.length - 1].date);
    const validDates = new Set(input.map((p) => p.date));
    for (const t of result!.ticks) {
      expect(validDates.has(t)).toBe(true);
    }
  });

  it("ticks de-dup: 5 points all dated '7/30' → ticks length 1, no error", () => {
    const input = points(
      ["7/30", 1, "2026-07-30"],
      ["7/30", 2, "2026-07-30"],
      ["7/30", 3, "2026-07-30"],
      ["7/30", 4, "2026-07-30"],
      ["7/30", 5, "2026-07-30"],
    );
    const result = buildHeroTrendMeta(input);
    expect(result).not.toBeNull();
    expect(result!.ticks).toEqual(["7/30"]);
  });

  it("fewer points than maxTicks: 3 points, maxTicks 6 → 3 ticks, no duplicates", () => {
    const input = points(
      ["7/28", 1, "2026-07-28"],
      ["7/29", 2, "2026-07-29"],
      ["7/30", 3, "2026-07-30"],
    );
    const result = buildHeroTrendMeta(input, { maxTicks: 6 });
    expect(result).not.toBeNull();
    expect(result!.ticks.length).toBe(3);
    expect(new Set(result!.ticks).size).toBe(3);
  });

  it("nice-step yTicks: 0 → 800,000 series lands on round multiples of the step", () => {
    const result = buildHeroTrendMeta(
      points(
        ["7/28", 0, "2026-07-28"],
        ["7/29", 400_000, "2026-07-29"],
        ["7/30", 800_000, "2026-07-30"],
      ),
    );
    expect(result).not.toBeNull();
    const ticks = result!.yTicks;
    expect(ticks.length).toBeGreaterThan(1);
    const step = ticks[1] - ticks[0];
    for (const t of ticks) {
      expect(Math.abs(Math.round(t / step) * step - t)).toBeLessThan(1e-6);
    }
    // The step itself should be a "clean" round number (multiple of 100,000
    // at this magnitude), not an arbitrary fraction of the padded range.
    expect(ticks.every((t) => Math.abs(t % 100_000) < 1e-6)).toBe(true);
  });

  it("⚠️ big net worth, small wobble (13,000,000 → 13,100,000) → domain does NOT reach toward 0 and does NOT flatten the line", () => {
    const result = buildHeroTrendMeta(
      points(["7/29", 13_000_000, "2026-07-29"], ["7/30", 13_100_000, "2026-07-30"]),
    );
    expect(result).not.toBeNull();
    const [lo, hi] = result!.yDomain;
    const dataRange = 13_100_000 - 13_000_000;
    // Guard: snapping to a nice step must never drag the lower bound toward
    // zero. If this assertion fails, DO NOT loosen it — report the actual
    // domain/range computed, per plan 281's STOP condition.
    expect(lo).toBeGreaterThan(12_000_000);
    expect(hi - lo).toBeLessThan(dataRange * 4);
    expect(lo).toBe(result!.yTicks[0]);
    expect(hi).toBe(result!.yTicks[result!.yTicks.length - 1]);
  });

  it("nice-step yTicks: negative net worth (-500,000 → -300,000) stays negative on both ends", () => {
    const result = buildHeroTrendMeta(
      points(["7/29", -500_000, "2026-07-29"], ["7/30", -300_000, "2026-07-30"]),
    );
    expect(result).not.toBeNull();
    expect(result!.yDomain[0]).toBeLessThan(0);
    expect(result!.yDomain[1]).toBeLessThanOrEqual(0);
    expect(result!.yDomain[0]).toBeLessThanOrEqual(-500_000);
    expect(result!.yDomain[1]).toBeGreaterThanOrEqual(-300_000);
    expect(result!.yDomain[0]).toBe(result!.yTicks[0]);
    expect(result!.yDomain[1]).toBe(result!.yTicks[result!.yTicks.length - 1]);
  });

  it("nice-step yTicks: series crossing zero (-50,000 → 120,000) covers both sides on round multiples", () => {
    const result = buildHeroTrendMeta(
      points(["7/29", -50_000, "2026-07-29"], ["7/30", 120_000, "2026-07-30"]),
    );
    expect(result).not.toBeNull();
    expect(result!.yDomain[0]).toBeLessThanOrEqual(-50_000);
    expect(result!.yDomain[1]).toBeGreaterThanOrEqual(120_000);
    const step = result!.yTicks.length > 1 ? result!.yTicks[1] - result!.yTicks[0] : 1;
    for (const t of result!.yTicks) {
      expect(Math.abs(Math.round(t / step) * step - t)).toBeLessThan(1e-6);
    }
  });

  it("nice-step yTicks: all-zero series still yields 3–8 ticks, never collapses to [0, 0]", () => {
    const result = buildHeroTrendMeta(
      points(["7/28", 0, "2026-07-28"], ["7/29", 0, "2026-07-29"], ["7/30", 0, "2026-07-30"]),
    );
    expect(result).not.toBeNull();
    expect(result!.yDomain).not.toEqual([0, 0]);
    expect(result!.yTicks.length).toBeGreaterThanOrEqual(3);
    expect(result!.yTicks.length).toBeLessThanOrEqual(8);
  });

  it("nice-step yTicks: tick count stays within the 3–8 band across all the above scenarios", () => {
    const scenarios: HeroTrendPoint[][] = [
      points(["7/29", 100, "2026-07-29"], ["7/30", 200, "2026-07-30"]),
      points(["7/28", 1_000_000, "2026-07-28"], ["7/30", 1_000_000, "2026-07-30"]),
      points(["7/28", 0, "2026-07-28"], ["7/30", 800_000, "2026-07-30"]),
      points(["7/29", 13_000_000, "2026-07-29"], ["7/30", 13_100_000, "2026-07-30"]),
      points(["7/29", -500_000, "2026-07-29"], ["7/30", -300_000, "2026-07-30"]),
      points(["7/29", -50_000, "2026-07-29"], ["7/30", 120_000, "2026-07-30"]),
      points(["7/28", 0, "2026-07-28"], ["7/30", 0, "2026-07-30"]),
    ];
    for (const input of scenarios) {
      const result = buildHeroTrendMeta(input);
      expect(result).not.toBeNull();
      expect(result!.yTicks.length).toBeGreaterThanOrEqual(3);
      expect(result!.yTicks.length).toBeLessThanOrEqual(8);
    }
  });
});
