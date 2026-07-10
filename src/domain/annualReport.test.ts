import { describe, expect, it } from "vitest";
import { buildAnnualReport } from "./annualReport";
import { buildPositionMetrics } from "./portfolioMetrics";
import type { InvestmentRecord, PortfolioAsset } from "./types";

const identity = (value: number) => value;

function record(
  overrides: Partial<InvestmentRecord> & Pick<InvestmentRecord, "assetId" | "date" | "action">,
): InvestmentRecord {
  return {
    id: `r_${Math.random().toString(36).slice(2)}`,
    spaceId: "space", revision: 1, createdAt: "", updatedAt: "", deletedAt: null,
    linkedAccountId: null, price: 0, quantity: 0, fee: 0, note: "",
    isReviewed: false, linkedLedgerTransactionId: null, cashless: false,
    ...overrides,
  };
}

function asset(overrides: Partial<PortfolioAsset> & Pick<PortfolioAsset, "id">): PortfolioAsset {
  return {
    spaceId: "space", revision: 1, createdAt: "", updatedAt: "", deletedAt: null,
    ticker: overrides.id, name: overrides.id, nameZh: null, nameEn: null,
    currency: "TWD", totalQuantity: 0, averageCost: 0, holdingSource: "transactions",
    acquisitionDate: null, assetType: null, sector: null, industry: null,
    accountId: null, baseQuantity: null,
    ...overrides,
  };
}

/** Helper: wrap a flat record list into the recordsByAsset closure. */
function byAsset(records: InvestmentRecord[]) {
  return (assetId: string) => records.filter((r) => r.assetId === assetId);
}

describe("buildAnnualReport", () => {
  it("EQUALITY GUARD: per-year realized gains sum to lifetime realizedGain", () => {
    // Sells across two years against one moving-average position.
    const records = [
      record({ assetId: "a", date: "2023-01-10", action: "buy", price: 100, quantity: 100, fee: 50 }),
      record({ assetId: "a", date: "2024-03-01", action: "sell", price: 130, quantity: 40, fee: 20 }),
      record({ assetId: "a", date: "2025-06-01", action: "sell", price: 150, quantity: 60, fee: 30 }),
    ];
    const { years: report } = buildAnnualReport({
      assets: [asset({ id: "a" })],
      recordsByAsset: byAsset(records),
      dividendByYear: [],
      toPrimary: identity,
    });
    const lifetime = buildPositionMetrics(records).realizedGain;
    const summed = report.reduce((s, y) => s + y.realizedGain, 0);
    expect(summed).toBeCloseTo(lifetime, 6);
    expect(report.map((y) => y.year)).toEqual(["2023", "2024", "2025"]); // 2023 only has a buy → trading cost row
  });

  it("buy then sell in the same year → realized = proceeds − cost", () => {
    const records = [
      record({ assetId: "a", date: "2025-01-01", action: "buy", price: 100, quantity: 10 }),
      record({ assetId: "a", date: "2025-09-01", action: "sell", price: 120, quantity: 10 }),
    ];
    const { years: report } = buildAnnualReport({
      assets: [asset({ id: "a" })],
      recordsByAsset: byAsset(records),
      dividendByYear: [],
      toPrimary: identity,
    });
    const y2025 = report.find((y) => y.year === "2025")!;
    // proceeds 1200 − cost 1000 = 200.
    expect(y2025.realizedGain).toBeCloseTo(200, 6);
    expect(y2025.total).toBeCloseTo(200, 6);
  });

  it("sells in two different years → each year gets its own disposal's gain", () => {
    const records = [
      record({ assetId: "a", date: "2024-01-01", action: "buy", price: 100, quantity: 100 }),
      record({ assetId: "a", date: "2024-12-01", action: "sell", price: 110, quantity: 50 }), // +500
      record({ assetId: "a", date: "2025-12-01", action: "sell", price: 120, quantity: 50 }), // +1000
    ];
    const { years: report } = buildAnnualReport({
      assets: [asset({ id: "a" })],
      recordsByAsset: byAsset(records),
      dividendByYear: [],
      toPrimary: identity,
    });
    expect(report.find((y) => y.year === "2024")!.realizedGain).toBeCloseTo(500, 6);
    expect(report.find((y) => y.year === "2025")!.realizedGain).toBeCloseTo(1000, 6);
  });

  it("capitalReduction returning cash above basis → excess attributed to its year", () => {
    const records = [
      record({ assetId: "a", date: "2024-01-01", action: "buy", price: 10, quantity: 100 }), // cost 1000
      // cancel 100 shares, return 12/share = 1200 cash; basis 1000 → 200 realized gain.
      record({ assetId: "a", date: "2025-05-01", action: "capitalReduction", price: 12, quantity: 100 }),
    ];
    const { years: report } = buildAnnualReport({
      assets: [asset({ id: "a" })],
      recordsByAsset: byAsset(records),
      dividendByYear: [],
      toPrimary: identity,
    });
    expect(report.find((y) => y.year === "2025")!.realizedGain).toBeCloseTo(200, 6);
    // Cross-check against the engine's lifetime figure.
    expect(buildPositionMetrics(records).realizedGain).toBeCloseTo(200, 6);
  });

  it("a dividends-only year still appears with realizedGain 0", () => {
    const { years: report } = buildAnnualReport({
      assets: [asset({ id: "a" })],
      recordsByAsset: byAsset([]),
      dividendByYear: [{ year: "2025", total: 3000 }],
      toPrimary: identity,
    });
    const y2025 = report.find((y) => y.year === "2025")!;
    expect(y2025.realizedGain).toBe(0);
    expect(y2025.dividends).toBeCloseTo(3000, 6);
    expect(y2025.total).toBeCloseTo(3000, 6);
  });

  it("tradingCost = Σ fee for the year and total EXCLUDES tradingCost", () => {
    const records = [
      record({ assetId: "a", date: "2025-01-01", action: "buy", price: 100, quantity: 10, fee: 15 }),
      record({ assetId: "a", date: "2025-09-01", action: "sell", price: 120, quantity: 10, fee: 25 }),
    ];
    const { years: report } = buildAnnualReport({
      assets: [asset({ id: "a" })],
      recordsByAsset: byAsset(records),
      dividendByYear: [{ year: "2025", total: 500 }],
      toPrimary: identity,
    });
    const y2025 = report.find((y) => y.year === "2025")!;
    expect(y2025.tradingCost).toBeCloseTo(40, 6); // 15 + 25
    // realized = (1200 − 25) − (1000 + 15) = 160 (fees already netted in).
    expect(y2025.realizedGain).toBeCloseTo(160, 6);
    // total = realized + dividends = 160 + 500; tradingCost NOT subtracted.
    expect(y2025.total).toBeCloseTo(660, 6);
  });

  it("foreign-currency disposal converts via the injected toPrimary seam", () => {
    // USD asset; convert at a fixed 30 TWD/USD via the stubbed seam.
    const fx = (value: number, currency: string) => (currency === "USD" ? value * 30 : value);
    const records = [
      record({ assetId: "u", date: "2025-01-01", action: "buy", price: 10, quantity: 100 }), // cost 1000 USD
      record({ assetId: "u", date: "2025-08-01", action: "sell", price: 12, quantity: 100 }), // +200 USD realized
    ];
    const { years: report } = buildAnnualReport({
      assets: [asset({ id: "u", currency: "USD" })],
      recordsByAsset: byAsset(records),
      dividendByYear: [],
      toPrimary: fx,
    });
    const y2025 = report.find((y) => y.year === "2025")!;
    // 200 USD realized × 30 = 6000 TWD.
    expect(y2025.realizedGain).toBeCloseTo(6000, 6);
  });

  it("byHolding sums to the year's realizedGain and dividends (conservation)", () => {
    const records = [
      // Asset a: sells in 2024 and 2025.
      record({ assetId: "a", date: "2024-01-01", action: "buy", price: 100, quantity: 100 }),
      record({ assetId: "a", date: "2024-12-01", action: "sell", price: 110, quantity: 50 }), // +500
      record({ assetId: "a", date: "2025-06-01", action: "sell", price: 120, quantity: 50 }), // +1000
      record({ assetId: "a", date: "2025-03-01", action: "cashDividend", price: 200, quantity: 0 }), // +200
      // Asset b: sells in 2025 only, plus a dividend in 2025.
      record({ assetId: "b", date: "2023-01-01", action: "buy", price: 50, quantity: 200 }),
      record({ assetId: "b", date: "2025-02-01", action: "sell", price: 60, quantity: 100 }), // +1000
      record({ assetId: "b", date: "2025-07-01", action: "cashDividend", price: 300, quantity: 0 }), // +300
    ];
    const { years: report } = buildAnnualReport({
      assets: [asset({ id: "a", ticker: "a" }), asset({ id: "b", ticker: "b" })],
      recordsByAsset: byAsset(records),
      // Aggregate dividendByYear must match the per-record sum for the invariant to hold end-to-end.
      dividendByYear: [{ year: "2025", total: 500 }],
      toPrimary: identity,
    });

    for (const y of report) {
      const summedRealized = y.byHolding.reduce((s, h) => s + h.realizedGain, 0);
      expect(summedRealized).toBeCloseTo(y.realizedGain, 6);
      const summedDividends = y.byHolding.reduce((s, h) => s + h.dividends, 0);
      expect(summedDividends).toBeCloseTo(y.dividends, 6);
    }

    const y2025 = report.find((y) => y.year === "2025")!;
    expect(y2025.realizedGain).toBeCloseTo(2000, 6); // 1000 (a) + 1000 (b)
    expect(y2025.dividends).toBeCloseTo(500, 6); // 200 (a) + 300 (b)
  });

  it("domestic (.TW) vs overseas (US) holdings are split, and sum back to the year total", () => {
    const records = [
      // Domestic holding (.TW suffix).
      record({ assetId: "tw", date: "2025-01-01", action: "buy", price: 20, quantity: 1000 }),
      record({ assetId: "tw", date: "2025-06-01", action: "sell", price: 25, quantity: 1000 }), // +5000
      record({ assetId: "tw", date: "2025-08-01", action: "cashDividend", price: 400, quantity: 0 }), // +400
      // Overseas holding (bare US ticker).
      record({ assetId: "us", date: "2025-01-01", action: "buy", price: 10, quantity: 100 }),
      record({ assetId: "us", date: "2025-09-01", action: "sell", price: 15, quantity: 100 }), // +500
      record({ assetId: "us", date: "2025-10-01", action: "cashDividend", price: 50, quantity: 0 }), // +50
    ];
    const { years: report } = buildAnnualReport({
      assets: [
        asset({ id: "tw", ticker: "2330.TW", currency: "TWD" }),
        asset({ id: "us", ticker: "AAPL", currency: "USD" }),
      ],
      recordsByAsset: byAsset(records),
      dividendByYear: [{ year: "2025", total: 450 }],
      toPrimary: identity,
    });

    const y2025 = report.find((y) => y.year === "2025")!;
    const twHolding = y2025.byHolding.find((h) => h.assetId === "tw")!;
    const usHolding = y2025.byHolding.find((h) => h.assetId === "us")!;
    expect(twHolding.country).toBe("TW");
    expect(usHolding.country).toBe("US");

    expect(y2025.domestic.realizedGain).toBeCloseTo(5000, 6);
    expect(y2025.domestic.dividends).toBeCloseTo(400, 6);
    expect(y2025.overseas.realizedGain).toBeCloseTo(500, 6);
    expect(y2025.overseas.dividends).toBeCloseTo(50, 6);

    // domestic + overseas === year total.
    expect(y2025.domestic.realizedGain + y2025.overseas.realizedGain).toBeCloseTo(y2025.realizedGain, 6);
    expect(y2025.domestic.dividends + y2025.overseas.dividends).toBeCloseTo(y2025.dividends, 6);
  });

  it("a holding with an undeterminable country is bucketed into overseas", () => {
    // A bare numeric ticker with no currency tiebreak (per resolveHoldingCountry) → null.
    const records = [
      record({ assetId: "x", date: "2025-01-01", action: "buy", price: 10, quantity: 100 }),
      record({ assetId: "x", date: "2025-06-01", action: "sell", price: 12, quantity: 100 }), // +200
    ];
    const { years: report } = buildAnnualReport({
      assets: [asset({ id: "x", ticker: "1234", currency: "" as unknown as PortfolioAsset["currency"] })],
      recordsByAsset: byAsset(records),
      dividendByYear: [],
      toPrimary: identity,
    });
    const y2025 = report.find((y) => y.year === "2025")!;
    const holding = y2025.byHolding.find((h) => h.assetId === "x")!;
    expect(holding.country).toBeNull();
    expect(y2025.overseas.realizedGain).toBeCloseTo(200, 6);
    expect(y2025.domestic.realizedGain).toBeCloseTo(0, 6);
  });

  it("byHolding excludes a holding with no activity in that year and sorts by combined magnitude", () => {
    const records = [
      // Asset a: only active in 2024, not 2025.
      record({ assetId: "a", date: "2024-01-01", action: "buy", price: 10, quantity: 100 }),
      record({ assetId: "a", date: "2024-06-01", action: "sell", price: 12, quantity: 100 }), // +200 (2024 only)
      // Asset b: small gain in 2025.
      record({ assetId: "b", date: "2025-01-01", action: "buy", price: 10, quantity: 100 }),
      record({ assetId: "b", date: "2025-06-01", action: "sell", price: 11, quantity: 100 }), // +100
      // Asset c: larger gain in 2025.
      record({ assetId: "c", date: "2025-01-01", action: "buy", price: 10, quantity: 1000 }),
      record({ assetId: "c", date: "2025-06-01", action: "sell", price: 15, quantity: 1000 }), // +5000
    ];
    const { years: report } = buildAnnualReport({
      assets: [asset({ id: "a", ticker: "a" }), asset({ id: "b", ticker: "b" }), asset({ id: "c", ticker: "c" })],
      recordsByAsset: byAsset(records),
      dividendByYear: [],
      toPrimary: identity,
    });
    const y2025 = report.find((y) => y.year === "2025")!;
    // Asset "a" had no realized gain or dividend in 2025 → excluded.
    expect(y2025.byHolding.find((h) => h.assetId === "a")).toBeUndefined();
    // Descending by |realizedGain| + dividends: c (5000) before b (100).
    expect(y2025.byHolding.map((h) => h.assetId)).toEqual(["c", "b"]);
  });

  it("excludes and counts an unpriced (null-rate) disposal instead of valuing it 0", () => {
    // No USD rate → toPrimary returns null; TWD passes through.
    const fx = (value: number, currency: string): number | null => (currency === "USD" ? null : value);
    const records = [
      // TWD holding realizes +200 → counted.
      record({ assetId: "tw", date: "2025-01-01", action: "buy", price: 10, quantity: 100 }),
      record({ assetId: "tw", date: "2025-06-01", action: "sell", price: 12, quantity: 100 }),
      // USD holding realizes +200 USD → excluded because no rate.
      record({ assetId: "us", date: "2025-01-01", action: "buy", price: 10, quantity: 100 }),
      record({ assetId: "us", date: "2025-08-01", action: "sell", price: 12, quantity: 100 }),
    ];
    const { years, fxMisses } = buildAnnualReport({
      assets: [asset({ id: "tw", ticker: "2330.TW", currency: "TWD" }), asset({ id: "us", ticker: "AAPL", currency: "USD" })],
      recordsByAsset: byAsset(records),
      dividendByYear: [],
      toPrimary: fx,
    });
    const y2025 = years.find((y) => y.year === "2025")!;
    // Only the TWD leg contributes; the USD leg is excluded, not added as 0.
    expect(y2025.realizedGain).toBeCloseTo(200, 6);
    expect(y2025.byHolding.map((h) => h.assetId)).toEqual(["tw"]);
    expect(fxMisses.count).toBe(1);
    expect(fxMisses.currencies).toEqual(["USD"]);
  });

  it("reports zero fx misses when every leg converts", () => {
    const records = [
      record({ assetId: "a", date: "2025-01-01", action: "buy", price: 100, quantity: 10, fee: 5 }),
      record({ assetId: "a", date: "2025-09-01", action: "sell", price: 120, quantity: 10 }),
    ];
    const { fxMisses } = buildAnnualReport({
      assets: [asset({ id: "a" })],
      recordsByAsset: byAsset(records),
      dividendByYear: [],
      toPrimary: identity,
    });
    expect(fxMisses).toEqual({ count: 0, currencies: [] });
  });
});
