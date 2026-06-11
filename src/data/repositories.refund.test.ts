import { describe, expect, it } from "vitest";
import { createMemoryFinanceRepositoryForTests, type LedgerDraft } from "./repositories";
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

describe("refund ledger rows (退款沖銷)", () => {
  it("a refund is a positive-amount expense linked to the original row", async () => {
    const repo = createMemoryFinanceRepositoryForTests({ accounts: [card] });
    await repo.createLedgerTransaction(expenseDraft());
    const original = (await repo.listLedgerTransactions())[0];

    // Partial refund of 400.
    await repo.createLedgerTransaction(expenseDraft({
      name: "外套 退款",
      amount: 400,
      refundOfLedgerId: original.id,
    }));

    const rows = await repo.listLedgerTransactions();
    const refund = rows.find((r) => r.refundOfLedgerId)!;
    expect(refund.entryType).toBe("expense");
    expect(refund.amount).toBe(400);
    expect(refund.refundOfLedgerId).toBe(original.id);
    // Same category so it nets against the original spend.
    expect(refund.category).toBe("購物");

    // Card balance: −1000 + 400 = −600 (the refund returns money to the card).
    const [acct] = await repo.listAccounts();
    expect(acct.balance).toBe(-600);
  });

  it("rejects a negative-amount refund", async () => {
    const repo = createMemoryFinanceRepositoryForTests({ accounts: [card] });
    await expect(
      repo.createLedgerTransaction(expenseDraft({ amount: -400, refundOfLedgerId: "ledger_x" })),
    ).rejects.toThrow();
  });
});
