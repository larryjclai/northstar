import { expect, it } from "vitest";
import { type LedgerDraft } from "./repositories";
import { describeEachRepo } from "./repositories.testHarness";
import type { Account } from "../domain";

const card: Account = {
  id: "acct_card",
  spaceId: "space_test",
  revision: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
  name: "信用卡",
  currency: "TWD",
  openingBalance: 0,
  balance: 0,
  type: "credit",
  creditLimit: 100_000,
  creditLimitGroup: "",
  creditGroupId: null,
  bookId: "book_test_default",
  isSharedToHousehold: false,
  loanStartDate: null,
  annualInterestRate: null,
  loanTerm: null,
  iconName: null,
  color: null,
  statementDay: 15,
  paymentDueDay: 5,
  creditPaymentPaidUntil: null,
};

function draft(overrides: Partial<LedgerDraft> = {}): LedgerDraft {
  return {
    accountId: "acct_card",
    date: "2026-01-31",
    name: "筆電",
    amount: -12_000,
    currency: "TWD",
    category: "購物",
    subcategory: "3C",
    merchant: "Apple",
    entryType: "expense",
    settlementStatus: "settled",
    note: "",
    ...overrides,
  };
}

describeEachRepo("createInstallmentPlan", (makeRepo) => {
  it("posts N monthly rows that sum to the total, with clamped dates", async () => {
    const repo = await makeRepo({ accounts: [card] });
    await repo.createInstallmentPlan(draft(), 12);

    const rows = await repo.listLedgerTransactions();
    expect(rows).toHaveLength(12);
    expect(rows.every((r) => r.amount === -1000)).toBe(true);
    expect(rows.every((r) => r.installmentTotal === 12)).toBe(true);
    const groupIds = new Set(rows.map((r) => r.installmentGroupId));
    expect(groupIds.size).toBe(1);

    const dates = rows.map((r) => r.date).sort();
    // 01-31 start: February clamps to 28, later months return to 31/30.
    expect(dates[0]).toBe("2026-01-31");
    expect(dates[1]).toBe("2026-02-28");
    expect(dates[3]).toBe("2026-04-30");

    // Full liability lands on the card immediately (cash-basis: you owe it all).
    const [acct] = await repo.listAccounts();
    expect(acct.balance).toBe(-12_000);
  });

  it("deleteInstallmentPlan with fromIndex keeps earlier periods (提前清償)", async () => {
    const repo = await makeRepo({ accounts: [card] });
    await repo.createInstallmentPlan(draft(), 6);

    const rows = await repo.listLedgerTransactions();
    const groupId = rows[0].installmentGroupId!;
    await repo.deleteInstallmentPlan(groupId, { fromIndex: 4 });

    const remaining = await repo.listLedgerTransactions();
    expect(remaining).toHaveLength(3);
    expect(remaining.map((r) => r.installmentIndex).sort()).toEqual([1, 2, 3]);
  });

  it("deleteInstallmentPlan without fromIndex removes the whole plan", async () => {
    const repo = await makeRepo({ accounts: [card] });
    await repo.createInstallmentPlan(draft(), 3);
    const rows = await repo.listLedgerTransactions();
    await repo.deleteInstallmentPlan(rows[0].installmentGroupId!);
    expect(await repo.listLedgerTransactions()).toHaveLength(0);
    const [acct] = await repo.listAccounts();
    expect(acct.balance).toBe(0);
  });

  it("plain deleteLedgerTransaction removes only that period (no groupId cascade)", async () => {
    const repo = await makeRepo({ accounts: [card] });
    await repo.createInstallmentPlan(draft(), 3);
    const rows = await repo.listLedgerTransactions();
    await repo.deleteLedgerTransaction(rows[0].id);
    expect(await repo.listLedgerTransactions()).toHaveLength(2);
  });

  it("editing one period preserves its installment metadata", async () => {
    const repo = await makeRepo({ accounts: [card] });
    await repo.createInstallmentPlan(draft(), 3);
    const rows = await repo.listLedgerTransactions();
    const target = rows.find((r) => r.installmentIndex === 2)!;
    await repo.updateLedgerTransaction(target.id, draft({ amount: -4100, note: "調整" }));
    const updated = (await repo.listLedgerTransactions()).find((r) => r.id === target.id)!;
    expect(updated.amount).toBe(-4100);
    expect(updated.installmentGroupId).toBe(target.installmentGroupId);
    expect(updated.installmentIndex).toBe(2);
    expect(updated.installmentTotal).toBe(3);
  });
});
