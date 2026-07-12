import { describe, expect, it } from "vitest";
import { groupByDay, groupByMonth } from "./cashFlowGrouping";
import type { LedgerTransaction } from "../domain";

function row(overrides: Partial<LedgerTransaction>): LedgerTransaction {
  return {
    id: overrides.id ?? "tx",
    spaceId: "s",
    revision: 1,
    createdAt: "",
    updatedAt: "",
    deletedAt: null,
    accountId: "a",
    counterAccountId: null,
    date: "2026-05-01T00:00",
    name: "",
    amount: 0,
    currency: "TWD",
    originalAmount: null,
    originalCurrency: null,
    category: "",
    subcategory: "",
    merchant: "",
    entryType: "expense",
    settlementStatus: "settled",
    note: "",
    linkedInvestmentRecordId: null,
    groupId: null,
    isReviewed: false,
    receiptAttachmentId: null,
    recurringRuleId: null,
    ...overrides,
  };
}

// Identity converter: amount is already in primary currency.
const toPrimary = (r: LedgerTransaction, amount = r.amount) => amount;

describe("groupByDay", () => {
  it("groups rows by day (newest first, since input is assumed pre-sorted) and sums net", () => {
    const rows = [
      row({ id: "1", date: "2026-05-02T09:00", entryType: "income", amount: 500 }),
      row({ id: "2", date: "2026-05-02T18:00", entryType: "expense", amount: -200 }),
      row({ id: "3", date: "2026-05-01T09:00", entryType: "expense", amount: -100 }),
    ];
    const groups = groupByDay(rows, toPrimary);
    expect(groups.map((g) => g.date)).toEqual(["2026-05-02", "2026-05-01"]);
    expect(groups[0].rows.map((r) => r.id)).toEqual(["1", "2"]);
    expect(groups[0].net).toBe(300); // 500 - 200
    expect(groups[1].net).toBe(-100);
  });

  it("excludes neutral rows (transfers, counterAccountId pass-throughs) from net", () => {
    const rows = [
      row({ id: "1", date: "2026-05-01T09:00", entryType: "income", amount: 500 }),
      row({ id: "2", date: "2026-05-01T10:00", entryType: "transfer", amount: -500 }),
      row({ id: "3", date: "2026-05-01T11:00", entryType: "expense", amount: -50, counterAccountId: "b" }),
    ];
    const groups = groupByDay(rows, toPrimary);
    expect(groups[0].rows).toHaveLength(3); // still all rendered
    expect(groups[0].net).toBe(500); // transfer + counterAccountId row excluded from net
  });
});

describe("groupByMonth", () => {
  it("groups rows across two months, newest month first", () => {
    const rows = [
      row({ id: "1", date: "2026-06-05T09:00", entryType: "income", amount: 1000 }),
      row({ id: "2", date: "2026-06-10T09:00", entryType: "expense", amount: -300 }),
      row({ id: "3", date: "2026-05-20T09:00", entryType: "expense", amount: -150 }),
    ];
    const groups = groupByMonth(rows, toPrimary);
    expect(groups.map((g) => g.month)).toEqual(["2026-06", "2026-05"]);
    expect(groups[0].count).toBe(2);
    expect(groups[1].count).toBe(1);
  });

  it("splits income/expense by sign and derives net = income - expense", () => {
    const rows = [
      row({ id: "1", date: "2026-06-05T09:00", entryType: "income", amount: 1000 }),
      row({ id: "2", date: "2026-06-10T09:00", entryType: "expense", amount: -300 }),
      row({ id: "3", date: "2026-06-15T09:00", entryType: "expense", amount: -200 }),
    ];
    const [group] = groupByMonth(rows, toPrimary);
    expect(group.income).toBe(1000);
    expect(group.expense).toBe(500);
    expect(group.net).toBe(500);
  });

  it("excludes neutral rows from income/expense/net but still counts them", () => {
    const rows = [
      row({ id: "1", date: "2026-06-05T09:00", entryType: "income", amount: 1000 }),
      row({ id: "2", date: "2026-06-10T09:00", entryType: "transfer", amount: -500 }),
    ];
    const [group] = groupByMonth(rows, toPrimary);
    expect(group.count).toBe(2);
    expect(group.income).toBe(1000);
    expect(group.expense).toBe(0);
    expect(group.net).toBe(1000);
  });

  it("month net equals the sum of its days' nets from groupByDay", () => {
    const rows = [
      row({ id: "1", date: "2026-06-05T09:00", entryType: "income", amount: 1000 }),
      row({ id: "2", date: "2026-06-10T09:00", entryType: "expense", amount: -300 }),
      row({ id: "3", date: "2026-06-10T18:00", entryType: "expense", amount: -50 }),
    ];
    const [monthGroup] = groupByMonth(rows, toPrimary);
    const dayNetSum = groupByDay(rows, toPrimary).reduce((sum, g) => sum + g.net, 0);
    expect(monthGroup.net).toBe(dayNetSum);
  });
});
