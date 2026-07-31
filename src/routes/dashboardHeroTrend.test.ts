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

  it("two normal points (100 → 200) → startValue/endValue/change and 15% padded yDomain", () => {
    const result = buildHeroTrendMeta(
      points(["7/29", 100, "2026-07-29"], ["7/30", 200, "2026-07-30"]),
    );
    expect(result).not.toBeNull();
    expect(result!.startValue).toBe(100);
    expect(result!.endValue).toBe(200);
    expect(result!.change).toBe(100);
    // range = 100, pad = 15
    expect(result!.yDomain[0]).toBeCloseTo(100 - 15);
    expect(result!.yDomain[1]).toBeCloseTo(200 + 15);
  });

  it("flat series (all 1,000,000) → fallback pad of 2% (20,000), yDomain straddles the value", () => {
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
    expect(result!.yDomain[1] - 1_000_000).toBeCloseTo(20_000);
    expect(1_000_000 - result!.yDomain[0]).toBeCloseTo(20_000);
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
});
