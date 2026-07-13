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

function expenseDraft(overrides: Partial<LedgerDraft> = {}): LedgerDraft {
  return {
    accountId: "acct_card",
    date: "2026-06-01",
    name: "外套",
    amount: -1_000,
    currency: "TWD",
    category: "購物",
    subcategory: "服飾",
    merchant: "Uniqlo",
    entryType: "expense",
    settlementStatus: "settled",
    note: "",
    ...overrides,
  };
}

describeEachRepo("setLedgerPostDate (延後入帳)", (makeRepo) => {
  it("sets and clears postDate", async () => {
    const repo = await makeRepo({ accounts: [card] });
    await repo.createLedgerTransaction(expenseDraft());
    const row = (await repo.listLedgerTransactions())[0];

    await repo.setLedgerPostDate(row.id, "2026-07-01");
    const deferred = (await repo.listLedgerTransactions()).find((r) => r.id === row.id)!;
    expect(deferred.postDate).toBe("2026-07-01");

    await repo.setLedgerPostDate(row.id, null);
    const reset = (await repo.listLedgerTransactions()).find((r) => r.id === row.id)!;
    expect(reset.postDate).toBeNull();
  });

  it("is balance-neutral", async () => {
    const repo = await makeRepo({ accounts: [card] });
    await repo.createLedgerTransaction(expenseDraft());
    const row = (await repo.listLedgerTransactions())[0];

    const before = (await repo.listAccounts())[0].balance;
    await repo.setLedgerPostDate(row.id, "2026-07-01");
    const after = (await repo.listAccounts())[0].balance;

    expect(after).toBe(before);
    expect(after).toBe(-1_000);
  });
});
