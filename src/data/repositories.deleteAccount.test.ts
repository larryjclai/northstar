import { expect, it } from "vitest";
import { type LedgerDraft } from "./repositories";
import { describeEachRepo } from "./repositories.testHarness";
import type { Account } from "../domain";

function account(overrides: Partial<Account> & Pick<Account, "id" | "name">): Account {
  return {
    spaceId: "space_test",
    revision: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    currency: "TWD",
    openingBalance: 0,
    balance: 0,
    type: "cash",
    creditLimit: null,
    creditLimitGroup: "",
    bookId: "book_test_default",
    isSharedToHousehold: false,
    loanStartDate: null,
    annualInterestRate: null,
    loanTerm: null,
    iconName: null,
    color: null,
    statementDay: null,
    paymentDueDay: null,
    creditPaymentPaidUntil: null,
    ...overrides,
  };
}

const accountA = account({ id: "acct_a", name: "帳戶 A" });
const accountB = account({ id: "acct_b", name: "代墊帳戶 B" });

function receivableDraft(overrides: Partial<LedgerDraft> = {}): LedgerDraft {
  // 應收 (receivable) with a 代墊 counter account and no settle account yet:
  // accountId is "" (lands on settle), counterAccountId = B (paid out now).
  return {
    accountId: "",
    counterAccountId: accountB.id,
    date: "2026-06-01",
    name: "代墊款項",
    amount: 1_000,
    currency: "TWD",
    category: "其他",
    subcategory: "",
    merchant: "",
    entryType: "income",
    settlementStatus: "receivable",
    note: "",
    ...overrides,
  };
}

describeEachRepo("deleteAccount guard — counter-account references", (makeRepo) => {
  it("blocks deleting an account referenced only via counterAccountId", async () => {
    const repo = await makeRepo({ accounts: [accountA, accountB] });
    await repo.createLedgerTransaction(receivableDraft());

    await expect(repo.deleteAccount(accountB.id)).rejects.toThrow("已有交易的帳戶不能刪除。");

    // Account B must still be present (deletion blocked).
    const accounts = await repo.listAccounts();
    expect(accounts.some((a) => a.id === accountB.id)).toBe(true);
  });

  it("still allows deleting an account with no references", async () => {
    const repo = await makeRepo({ accounts: [accountA, accountB] });

    await expect(repo.deleteAccount(accountA.id)).resolves.toBeUndefined();

    const accounts = await repo.listAccounts();
    expect(accounts.some((a) => a.id === accountA.id)).toBe(false);
  });
});
