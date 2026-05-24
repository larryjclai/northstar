import { describe, expect, it } from "vitest";
import { seedInvestmentRecords } from "../data/seed";
import { calculateFifo } from "./fifoCalculator";
import type { InvestmentRecord } from "./types";

describe("fifo calculator", () => {
  it("keeps buy records as open lots", () => {
    const result = calculateFifo(seedInvestmentRecords);
    expect(result.openLots).toHaveLength(2);
    expect(result.realizedLots).toHaveLength(0);
  });

  it("matches sells against earliest lot", () => {
    const buy: InvestmentRecord = {
      ...seedInvestmentRecords[0],
      id: "buy",
      price: 100,
      quantity: 10,
      fee: 0,
    };
    const sell: InvestmentRecord = {
      ...seedInvestmentRecords[0],
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
});

