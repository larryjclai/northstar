import { describe, expect, it } from "vitest";
import { createMemoryFinanceRepositoryForTests, type LedgerDraft } from "./repositories";
import type { Account } from "../domain";

const account: Account = {
  id: "acct_bank",
  spaceId: "space_test",
  revision: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
  name: "Bank",
  currency: "TWD",
  openingBalance: 0,
  balance: 0,
  type: "depository",
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

function draft(overrides: Partial<LedgerDraft> = {}): LedgerDraft {
  return {
    accountId: "acct_bank",
    date: "2026-06-10",
    name: "薪資",
    amount: 50_000,
    currency: "TWD",
    category: "收入",
    subcategory: "薪資",
    merchant: "公司",
    entryType: "income",
    settlementStatus: "settled",
    note: "",
    ...overrides,
  };
}

describe("createLedgerTransaction fee leg", () => {
  it("income with feeAmount posts a gross income row plus a linked fee expense", async () => {
    const repo = createMemoryFinanceRepositoryForTests({ accounts: [account] });
    await repo.createLedgerTransaction(draft({ feeAmount: 30 }));

    const rows = await repo.listLedgerTransactions();
    expect(rows).toHaveLength(2);

    const income = rows.find((r) => r.entryType === "income")!;
    const fee = rows.find((r) => r.category === "手續費")!;
    // Gross income stays intact; the fee is its own expense leg.
    expect(income.amount).toBe(50_000);
    expect(fee.amount).toBe(-30);
    expect(fee.entryType).toBe("expense");
    expect(fee.subcategory).toBe("收入手續費");
    // Both rows share a group so deletes cascade together.
    expect(income.groupId).toBeTruthy();
    expect(fee.groupId).toBe(income.groupId);

    const [acct] = await repo.listAccounts();
    expect(acct.balance).toBe(49_970);
  });

  it("expense with feeAmount keeps the FX-surcharge subcategory", async () => {
    const repo = createMemoryFinanceRepositoryForTests({ accounts: [account] });
    await repo.createLedgerTransaction(draft({
      name: "海外刷卡",
      amount: -1_000,
      category: "購物",
      subcategory: "",
      entryType: "expense",
      feeAmount: 15,
    }));

    const rows = await repo.listLedgerTransactions();
    const fee = rows.find((r) => r.category === "手續費")!;
    expect(fee.amount).toBe(-15);
    expect(fee.subcategory).toBe("海外交易手續費");

    const [acct] = await repo.listAccounts();
    expect(acct.balance).toBe(-1_015);
  });

  it("no feeAmount posts a single row", async () => {
    const repo = createMemoryFinanceRepositoryForTests({ accounts: [account] });
    await repo.createLedgerTransaction(draft());
    expect(await repo.listLedgerTransactions()).toHaveLength(1);
  });
});
