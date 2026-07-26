import { describe, expect, it } from "vitest";
import { groupByDayWithSubtotals, type DailySettlementRow } from "./investmentDailySettlement";

function row(overrides: Partial<DailySettlementRow>): DailySettlementRow {
  return {
    date: "2026-01-02",
    currency: "TWD",
    actionKey: "buy",
    price: 100,
    quantity: 1,
    fee: 0,
    signed: -100,
    isOpeningLot: false,
    ...overrides,
  };
}

describe("groupByDayWithSubtotals", () => {
  it("groups rows by calendar day, preserving newest-first input order", () => {
    const rows: DailySettlementRow[] = [
      row({ date: "2026-01-03T09:00:00" }),
      row({ date: "2026-01-03T10:30:00" }),
      row({ date: "2026-01-02T14:00:00" }),
    ];
    const groups = groupByDayWithSubtotals(rows);
    expect(groups.map((g) => g.date)).toEqual(["2026-01-03", "2026-01-02"]);
    expect(groups[0].rows).toHaveLength(2);
    expect(groups[1].rows).toHaveLength(1);
  });

  it("computes gross/fee/net for a single buy (user's case)", () => {
    // buy price 5065 × qty 2 = 10130 gross; fee 8; net signed -10138.
    const groups = groupByDayWithSubtotals([
      row({ actionKey: "buy", price: 5065, quantity: 2, fee: 8, signed: -10138 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].subtotals).toEqual([{ currency: "TWD", gross: 10130, fee: 8, net: -10138 }]);
  });

  it("sums gross and net across a buy and a sell on the same day", () => {
    const groups = groupByDayWithSubtotals([
      row({ actionKey: "buy", price: 100, quantity: 2, fee: 5, signed: -205 }),
      row({ actionKey: "sell", price: 120, quantity: 1, fee: 3, signed: 117 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].subtotals).toEqual([{ currency: "TWD", gross: 320, fee: 8, net: -88 }]);
  });

  it("excludes opening-lot rows from subtotals but keeps them in rows", () => {
    const rows: DailySettlementRow[] = [
      row({ actionKey: "buy", price: 50, quantity: 1, fee: 0, signed: 0, isOpeningLot: true }),
      row({ actionKey: "buy", price: 100, quantity: 2, fee: 4, signed: -204 }),
    ];
    const groups = groupByDayWithSubtotals(rows);
    expect(groups[0].rows).toHaveLength(2);
    expect(groups[0].subtotals).toEqual([{ currency: "TWD", gross: 200, fee: 4, net: -204 }]);
  });

  it("keeps one subtotal per currency, ordered by first appearance, no cross-currency summing", () => {
    const rows: DailySettlementRow[] = [
      row({ currency: "TWD", actionKey: "buy", price: 100, quantity: 1, fee: 2, signed: -102 }),
      row({ currency: "USD", actionKey: "buy", price: 10, quantity: 3, fee: 1, signed: -31 }),
    ];
    const groups = groupByDayWithSubtotals(rows);
    expect(groups[0].subtotals).toEqual([
      { currency: "TWD", gross: 100, fee: 2, net: -102 },
      { currency: "USD", gross: 30, fee: 1, net: -31 },
    ]);
  });

  it("a cash transfer contributes to net only, not gross/fee", () => {
    const groups = groupByDayWithSubtotals([
      row({ actionKey: "deposit", price: 0, quantity: 0, fee: 0, signed: 5000 }),
    ]);
    expect(groups[0].subtotals).toEqual([{ currency: "TWD", gross: 0, fee: 0, net: 5000 }]);
  });
});
