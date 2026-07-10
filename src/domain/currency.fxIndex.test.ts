import { describe, expect, it } from "vitest";
import { buildDailyRateIndex, convertCurrency, createFxConverter } from "./currency";
import type { AppSettings, DailyFxRate } from "./types";

function rate(from: string, to: string, date: string, value: number): DailyFxRate {
  return {
    from: from as DailyFxRate["from"],
    to: to as DailyFxRate["to"],
    date,
    rate: value,
    source: "test",
    updatedAt: `${date}T00:00:00Z`,
  };
}

// Minimal settings with no static exchangeRates so the daily-rate path is the
// only thing under test (falls through to null when a pair has no daily row).
const settings = { primaryCurrency: "TWD", exchangeRates: [] } as unknown as AppSettings;

// Compare the two public convertCurrency paths: linear `dailyRates` scan vs the
// prebuilt `dailyRateIndex` binary search. They must agree for every query —
// this is the proof that the index changes no conversion result.
function linear(rates: DailyFxRate[], amount: number, from: string, to: string, asOf: string) {
  return convertCurrency(amount, from, to, settings, { dailyRates: rates, asOfDate: asOf });
}
function indexed(rates: DailyFxRate[], amount: number, from: string, to: string, asOf: string) {
  const index = buildDailyRateIndex(rates);
  return convertCurrency(amount, from, to, settings, { dailyRateIndex: index, asOfDate: asOf });
}

describe("daily-rate index vs linear scan", () => {
  const rates: DailyFxRate[] = [
    rate("USD", "TWD", "2026-01-01", 31.0),
    rate("USD", "TWD", "2026-03-01", 32.0),
    rate("USD", "TWD", "2026-06-01", 33.0),
    rate("JPY", "TWD", "2026-02-01", 0.21),
  ];

  it("(a) exact-date hit matches", () => {
    expect(indexed(rates, 10, "USD", "TWD", "2026-03-01")).toBe(320);
    expect(indexed(rates, 10, "USD", "TWD", "2026-03-01")).toBe(
      linear(rates, 10, "USD", "TWD", "2026-03-01"),
    );
  });

  it("(b) between dates picks the earlier row", () => {
    // Between 2026-03-01 (32) and 2026-06-01 (33) → 32.
    expect(indexed(rates, 10, "USD", "TWD", "2026-04-15")).toBe(320);
    expect(indexed(rates, 10, "USD", "TWD", "2026-04-15")).toBe(
      linear(rates, 10, "USD", "TWD", "2026-04-15"),
    );
  });

  it("(c) before all dates → falls through to null (no static rate)", () => {
    expect(indexed(rates, 10, "USD", "TWD", "2025-12-31")).toBeNull();
    expect(indexed(rates, 10, "USD", "TWD", "2025-12-31")).toBe(
      linear(rates, 10, "USD", "TWD", "2025-12-31"),
    );
  });

  it("(d) inverse pair fallback matches", () => {
    // No TWD→USD row exists; converter inverts USD→TWD (32 on 2026-03-01).
    expect(indexed(rates, 320, "TWD", "USD", "2026-03-01")).toBeCloseTo(10, 10);
    expect(indexed(rates, 320, "TWD", "USD", "2026-03-01")).toBe(
      linear(rates, 320, "TWD", "USD", "2026-03-01"),
    );
  });

  it("(e) empty rates → null / matches", () => {
    expect(indexed([], 10, "USD", "TWD", "2026-03-01")).toBeNull();
    expect(indexed([], 10, "USD", "TWD", "2026-03-01")).toBe(
      linear([], 10, "USD", "TWD", "2026-03-01"),
    );
  });

  it("tie-break: rows sharing the max date keep the FIRST in array order", () => {
    const dup: DailyFxRate[] = [
      rate("USD", "TWD", "2026-01-01", 30.0),
      rate("USD", "TWD", "2026-02-01", 31.0),
      rate("USD", "TWD", "2026-02-01", 99.0), // same date, later in array → ignored
    ];
    expect(indexed(dup, 1, "USD", "TWD", "2026-02-15")).toBe(
      linear(dup, 1, "USD", "TWD", "2026-02-15"),
    );
    expect(indexed(dup, 1, "USD", "TWD", "2026-02-15")).toBe(31.0);
  });
});

describe("property: indexed lookup equals linear scan on random data", () => {
  it("50 random rates × 20 queries agree exactly", () => {
    // Deterministic LCG so failures are reproducible.
    let seed = 123456789;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const pairs: Array<[string, string]> = [
      ["USD", "TWD"],
      ["JPY", "TWD"],
      ["EUR", "USD"],
    ];
    const rates: DailyFxRate[] = [];
    for (let i = 0; i < 50; i += 1) {
      const [f, t] = pairs[Math.floor(rand() * pairs.length)];
      const month = 1 + Math.floor(rand() * 12);
      const day = 1 + Math.floor(rand() * 28);
      const date = `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      rates.push(rate(f, t, date, 1 + rand() * 100));
    }
    const index = buildDailyRateIndex(rates);
    for (let q = 0; q < 20; q += 1) {
      const [f, t] = pairs[Math.floor(rand() * pairs.length)];
      const month = 1 + Math.floor(rand() * 12);
      const day = 1 + Math.floor(rand() * 28);
      const asOf = `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const amount = 1 + rand() * 1000;
      const viaLinear = convertCurrency(amount, f, t, settings, { dailyRates: rates, asOfDate: asOf });
      const viaIndex = convertCurrency(amount, f, t, settings, { dailyRateIndex: index, asOfDate: asOf });
      expect(viaIndex).toBe(viaLinear);
      // Also cross-check the inverse direction.
      const invLinear = convertCurrency(amount, t, f, settings, { dailyRates: rates, asOfDate: asOf });
      const invIndex = convertCurrency(amount, t, f, settings, { dailyRateIndex: index, asOfDate: asOf });
      expect(invIndex).toBe(invLinear);
    }
  });
});

describe("createFxConverter builds and uses the index", () => {
  it("toPrimary resolves via the internal index identically to the linear path", () => {
    const rates: DailyFxRate[] = [
      rate("USD", "TWD", "2026-01-01", 31.0),
      rate("USD", "TWD", "2026-06-01", 33.0),
    ];
    const { toPrimary, primaryCurrency } = createFxConverter(settings, rates);
    expect(primaryCurrency).toBe("TWD");
    const viaConverter = toPrimary(10, "USD", "2026-06-15");
    const viaLinear = convertCurrency(10, "USD", "TWD", settings, {
      dailyRates: rates,
      asOfDate: "2026-06-15",
    });
    expect(viaConverter).toBe(viaLinear);
    expect(viaConverter).toBe(330);
  });
});
