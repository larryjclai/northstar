import { describe, expect, it } from "vitest";
import { buildHoldingPositions, buildHoldingPositionsByAccount } from "./portfolioCalculator";
import type { InvestmentRecord, PortfolioAsset } from "./types";

const manualAsset: PortfolioAsset = {
  id: "asset_manual",
  spaceId: "space_test",
  revision: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
  ticker: "0050.TW",
  name: "元大台灣50",
  nameZh: "元大台灣50",
  nameEn: "Yuanta Taiwan 50 ETF",
  currency: "TWD",
  totalQuantity: 3000,
  averageCost: 50,
  holdingSource: "manual",
  acquisitionDate: "2026-05-24",
  assetType: null,
  sector: null,
  industry: null,
  accountId: "acct_test",
};

const transactionAsset: PortfolioAsset = {
  ...manualAsset,
  id: "asset_tx",
  ticker: "QQQ",
  name: "Invesco QQQ",
  currency: "USD",
  totalQuantity: 0,
  averageCost: 450,
  holdingSource: "transactions",
  acquisitionDate: null,
};

const buyRecord: InvestmentRecord = {
  id: "inv_buy",
  spaceId: "space_test",
  revision: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
  assetId: "asset_tx",
  linkedAccountId: null,
  date: "2026-01-01",
  action: "buy",
  price: 450,
  quantity: 2,
  fee: 0,
  note: "",
  isReviewed: true,
  linkedLedgerTransactionId: null,
};

describe("portfolio calculator", () => {
  it("uses manual holding quantity without requiring investment records", () => {
    const [position] = buildHoldingPositions([manualAsset], [], {
      "0050.TW": { symbol: "0050.TW", price: 60, currency: "TWD" },
    });

    expect(position.quantity).toBe(3000);
    expect(position.costBasis).toBe(150000);
    expect(position.marketValue).toBe(180000);
  });

  it("derives transaction holdings from investment records", () => {
    const [position] = buildHoldingPositions([transactionAsset], [buyRecord], {
      QQQ: { symbol: "QQQ", price: 500, currency: "USD" },
    });

    expect(position.quantity).toBe(2);
    expect(position.costBasis).toBe(900);
    expect(position.unrealizedGain).toBe(100);
  });

  it("splits transaction holdings by linked account when computing per-account positions", () => {
    const schwab: InvestmentRecord = { ...buyRecord, id: "inv_schwab", linkedAccountId: "acct_schwab" };
    const firstrade: InvestmentRecord = {
      ...buyRecord,
      id: "inv_first",
      linkedAccountId: "acct_first",
      quantity: 3,
      price: 460,
    };
    const positions = buildHoldingPositionsByAccount([transactionAsset], [schwab, firstrade], {
      QQQ: { symbol: "QQQ", price: 500, currency: "USD" },
    });

    expect(positions).toHaveLength(2);
    const schwabPos = positions.find((p) => p.accountId === "acct_schwab")!;
    const firstradePos = positions.find((p) => p.accountId === "acct_first")!;
    expect(schwabPos.quantity).toBe(2);
    expect(schwabPos.marketValue).toBe(1000);
    expect(firstradePos.quantity).toBe(3);
    expect(firstradePos.costBasis).toBeCloseTo(1380);
  });

  it("treats manual holdings as one row per asset/account pair", () => {
    const positions = buildHoldingPositionsByAccount([manualAsset], [], {
      "0050.TW": { symbol: "0050.TW", price: 60, currency: "TWD" },
    });
    expect(positions).toHaveLength(1);
    expect(positions[0].accountId).toBe("acct_test");
    expect(positions[0].quantity).toBe(3000);
  });
});
