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
    const report = buildAnnualReport({
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
    const report = buildAnnualReport({
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
    const report = buildAnnualReport({
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
    const report = buildAnnualReport({
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
    const report = buildAnnualReport({
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
    const report = buildAnnualReport({
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
    const report = buildAnnualReport({
      assets: [asset({ id: "u", currency: "USD" })],
      recordsByAsset: byAsset(records),
      dividendByYear: [],
      toPrimary: fx,
    });
    const y2025 = report.find((y) => y.year === "2025")!;
    // 200 USD realized × 30 = 6000 TWD.
    expect(y2025.realizedGain).toBeCloseTo(6000, 6);
  });
});
