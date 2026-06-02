import { describe, expect, it } from "vitest";
import { calculateFifo } from "./fifoCalculator";
import type { InvestmentRecord } from "./types";

const baseRecord: InvestmentRecord = {
  id: "base",
  spaceId: "space_test",
  revision: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
  assetId: "asset_test",
  linkedAccountId: null,
  date: "2026-01-01",
  action: "buy",
  price: 100,
  quantity: 10,
  fee: 0,
  note: "",
  isReviewed: true,
  linkedLedgerTransactionId: null,
};

describe("fifo calculator", () => {
  it("keeps buy records as open lots", () => {
    const result = calculateFifo([
      baseRecord,
      { ...baseRecord, id: "buy_2", date: "2026-01-10", price: 120, quantity: 3 },
    ]);
    expect(result.openLots).toHaveLength(2);
    expect(result.realizedLots).toHaveLength(0);
  });

  it("matches sells against earliest lot", () => {
    const buy: InvestmentRecord = {
      ...baseRecord,
      id: "buy",
      price: 100,
      quantity: 10,
      fee: 0,
    };
    const sell: InvestmentRecord = {
      ...baseRecord,
      id: "sell",
      action: "sell",
      date: "2026-01-20",
      price: 120,
      quantity: 4,
      fee: 0,
    };

    const result = calculateFifo([buy, sell]);
    expect(result.openLots[0].quantity).toBe(6);
    expect(result.realizedLots[0].realizedGain).toBe(80);
  });

  it("adjusts open lots for stock splits and capital reductions", () => {
    const result = calculateFifo([
      baseRecord,
      { ...baseRecord, id: "split", action: "stockSplit", date: "2026-01-10", quantity: 2, price: 0 },
      { ...baseRecord, id: "reduction", action: "capitalReduction", date: "2026-01-11", quantity: 20, price: 5 },
    ]);
    expect(result.openLots[0].quantity).toBe(20);
    expect(result.openLots[0].costPerShare).toBe(45);
  });
});
