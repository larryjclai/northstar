import { describe, expect, it } from "vitest";
import { buildTodoRows, type TodoRowSources } from "./todoRows";

const accountName = (id: string) => (id === "acc1" ? "薪轉戶" : id);
const identity = (amount: number, _currency: string) => amount;

function sources(overrides: Partial<TodoRowSources> = {}): TodoRowSources {
  return {
    bills: [],
    cards: [],
    settleItems: [],
    dcaRules: [],
    ...overrides,
  };
}

describe("buildTodoRows", () => {
  it("merges all three sources and sorts by date ascending", () => {
    const rows = buildTodoRows(
      sources({
        bills: [{ id: "b1", entryType: "expense", merchant: "房租", category: "住房", accountId: "acc1", nextRunDate: "2026-07-20", amount: 20000 }],
        cards: [{ accountId: "cc1", name: "玉山信用卡", dueDate: "2026-07-15", daysUntilDue: 5, outstanding: 3200 }],
        settleItems: [{ id: "s1", kind: "receivable", counterparty: "客戶A", name: "發票 1001", date: "2026-07-25T00:00:00.000Z", amount: 5000, currency: "TWD" }],
      }),
      accountName,
      identity,
    );
    expect(rows.map((r) => r.key)).toEqual(["card-cc1", "bill-b1", "settle-s1"]);
    expect(rows.map((r) => r.iso)).toEqual(["2026-07-15", "2026-07-20", "2026-07-25"]);
  });

  it("regression: a card row later than 7 nearer-dated bills is NOT dropped — it lands last", () => {
    const bills = Array.from({ length: 7 }, (_, i) => ({
      id: `b${i}`,
      entryType: "expense",
      merchant: `帳單 ${i}`,
      category: "雜項",
      accountId: "acc1",
      nextRunDate: `2026-07-0${i + 1}`,
      amount: 100,
    }));
    const rows = buildTodoRows(
      sources({
        bills,
        cards: [{ accountId: "cc1", name: "玉山信用卡", dueDate: "2026-07-31", daysUntilDue: 20, outstanding: 3200 }],
      }),
      accountName,
      identity,
    );
    expect(rows).toHaveLength(8);
    expect(rows.at(-1)?.key).toBe("card-cc1");
    expect(rows.some((r) => r.key === "card-cc1")).toBe(true);
  });

  it("signs income/expense bills correctly and carries link fields for card/recv/pay rows", () => {
    const rows = buildTodoRows(
      sources({
        bills: [
          { id: "b1", entryType: "income", merchant: "薪水", category: "收入", accountId: "acc1", nextRunDate: "2026-07-05", amount: 50000 },
          { id: "b2", entryType: "expense", merchant: "房租", category: "住房", accountId: "acc1", nextRunDate: "2026-07-06", amount: 20000 },
        ],
        cards: [{ accountId: "cc1", name: "玉山信用卡", dueDate: "2026-07-10", daysUntilDue: 5, outstanding: 3200 }],
        settleItems: [
          { id: "s1", kind: "receivable", counterparty: "客戶A", name: "發票 1001", date: "2026-07-11T00:00:00.000Z", amount: 5000, currency: "TWD" },
          { id: "s2", kind: "payable", counterparty: "廠商B", name: "採購 2002", date: "2026-07-12T00:00:00.000Z", amount: 8000, currency: "TWD" },
        ],
      }),
      accountName,
      identity,
    );
    const income = rows.find((r) => r.key === "bill-b1");
    const expense = rows.find((r) => r.key === "bill-b2");
    const card = rows.find((r) => r.key === "card-cc1");
    const recv = rows.find((r) => r.key === "settle-s1");
    const pay = rows.find((r) => r.key === "settle-s2");
    expect(income?.amt).toBe(50000);
    expect(expense?.amt).toBe(-20000);
    expect(card?.linkAccountId).toBe("cc1");
    expect(recv?.linkTxId).toBe("s1");
    expect(recv?.amt).toBe(5000);
    expect(pay?.linkTxId).toBe("s2");
    expect(pay?.amt).toBe(-8000);
  });

  it("interleaves a dca row by date, signs amt negative, and shows the account name", () => {
    const rows = buildTodoRows(
      sources({
        bills: [{ id: "b1", entryType: "expense", merchant: "房租", category: "住房", accountId: "acc1", nextRunDate: "2026-07-20", amount: 20000 }],
        dcaRules: [{ id: "d1", name: "0050 定期定額", ticker: "0050", accountId: "acc1", nextRunDate: "2026-07-10", perPeriodCash: 5000 }],
      }),
      accountName,
      identity,
    );
    expect(rows.map((r) => r.key)).toEqual(["dca-d1", "bill-b1"]);
    const dca = rows.find((r) => r.key === "dca-d1");
    expect(dca?.type).toBe("dca");
    expect(dca?.amt).toBe(-5000);
    expect(dca?.sub).toBe("定期定額 · 薪轉戶");
    expect(dca?.name).toBe("0050 定期定額");
    expect(dca?.iso).toBe("2026-07-10");
  });

  it("dca row falls back to ticker as name when name is empty", () => {
    const rows = buildTodoRows(
      sources({
        dcaRules: [{ id: "d1", name: "", ticker: "0050", accountId: "acc1", nextRunDate: "2026-07-10", perPeriodCash: -5000 }],
      }),
      accountName,
      identity,
    );
    expect(rows[0].name).toBe("0050");
    expect(rows[0].amt).toBe(-5000);
  });

  it("falls back to the raw amount when toPrimary returns null", () => {
    const toPrimaryNull = () => null;
    const rows = buildTodoRows(
      sources({
        settleItems: [{ id: "s1", kind: "receivable", counterparty: "客戶A", name: "發票 1001", date: "2026-07-11", amount: 5000, currency: "USD" }],
      }),
      accountName,
      toPrimaryNull,
    );
    expect(rows[0].amt).toBe(5000);
  });
});
