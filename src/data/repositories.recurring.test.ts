import { describe, expect, it } from "vitest";
import { createMemoryFinanceRepositoryForTests } from "./repositories";
import { nextRecurringDate } from "../domain";
import type { Account, RecurringTransaction } from "../domain";

const account: Account = {
  id: "acct_cash",
  spaceId: "space_test",
  revision: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
  name: "Cash",
  currency: "TWD",
  openingBalance: 0,
  balance: 0,
  type: "cash",
  creditLimit: null,
  creditLimitGroup: "",
  isSharedToHousehold: false,
  loanStartDate: null,
  annualInterestRate: null,
  loanTerm: null,
  iconName: null,
  color: null,
  statementDay: null,
  paymentDueDay: null,
  creditPaymentPaidUntil: null,
};

function recurring(overrides: Partial<RecurringTransaction> = {}): RecurringTransaction {
  return {
    id: "rec_rent",
    spaceId: "space_test",
    revision: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    accountId: "acct_cash",
    amount: -1000,
    currency: "TWD",
    category: "居住",
    subcategory: "房租",
    merchant: "房東",
    entryType: "expense",
    settlementStatus: "settled",
    note: "",
    frequency: "monthly",
    dayOfMonth: 5,
    nextRunDate: "2026-03-05",
    isActive: true,
    ...overrides,
  };
}

describe("postDueRecurringTransactions", () => {
  it("catches up every missed monthly period and advances past today", async () => {
    const repo = createMemoryFinanceRepositoryForTests({ accounts: [account], recurringTransactions: [recurring()] });
    // From 2026-03-05 up to 2026-05-29: 03-05, 04-05, 05-05 are due → 3 rows.
    const posted = await repo.postDueRecurringTransactions("2026-05-29");
    expect(posted).toBe(3);

    const ledger = await repo.listLedgerTransactions();
    expect(ledger).toHaveLength(3);
    expect(ledger.every((row) => row.category === "居住")).toBe(true);

    const [rule] = await repo.listRecurringTransactions();
    expect(rule.nextRunDate).toBe("2026-06-05");
  });

  it("posts nothing when the rule is already in the future", async () => {
    const repo = createMemoryFinanceRepositoryForTests({ accounts: [account], recurringTransactions: [recurring({ nextRunDate: "2099-01-05" })] });
    const posted = await repo.postDueRecurringTransactions("2026-05-29");
    expect(posted).toBe(0);
    expect(await repo.listLedgerTransactions()).toHaveLength(0);
  });

  it("ignores inactive rules", async () => {
    const repo = createMemoryFinanceRepositoryForTests({ accounts: [account], recurringTransactions: [recurring({ isActive: false })] });
    const posted = await repo.postDueRecurringTransactions("2026-05-29");
    expect(posted).toBe(0);
  });

  it("does not duplicate the seed transaction when a new monthly rule starts next period", async () => {
    const repo = createMemoryFinanceRepositoryForTests({ accounts: [account] });
    await repo.createLedgerTransaction({
      accountId: "acct_cash",
      date: "2026-06-05T09:00",
      name: "定錨產業筆記",
      amount: -399,
      currency: "TWD",
      category: "訂閱",
      subcategory: "串流媒體",
      merchant: "定錨產業筆記",
      entryType: "expense",
      settlementStatus: "settled",
      note: "",
    });
    await repo.createRecurringTransaction({
      accountId: "acct_cash",
      amount: -399,
      currency: "TWD",
      category: "訂閱",
      subcategory: "串流媒體",
      merchant: "定錨產業筆記",
      entryType: "expense",
      settlementStatus: "settled",
      note: "",
      frequency: "monthly",
      dayOfMonth: 5,
      nextRunDate: nextRecurringDate("2026-06-05", "monthly", 5),
      isActive: true,
    });

    expect(await repo.postDueRecurringTransactions("2026-06-05")).toBe(0);
    expect(await repo.listLedgerTransactions()).toHaveLength(1);

    expect(await repo.postDueRecurringTransactions("2026-07-05")).toBe(1);
    expect(await repo.listLedgerTransactions()).toHaveLength(2);
  });
});
