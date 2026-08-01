import { expect, it } from "vitest";
import { describeEachRepo } from "./repositories.testHarness";
import type { Account, LedgerTransaction, RecurringTransaction } from "../domain";

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
  creditGroupId: null,
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
};

function ledgerRow(id: string, overrides: Partial<LedgerTransaction> = {}): LedgerTransaction {
  return {
    id,
    spaceId: "space_test",
    revision: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    accountId: "acct_cash",
    counterAccountId: null,
    date: "2026-06-01",
    name: "咖啡",
    amount: -100,
    currency: "TWD",
    originalAmount: null,
    originalCurrency: null,
    category: "餐飲",
    subcategory: "",
    merchant: "小半天",
    entryType: "expense",
    settlementStatus: "settled",
    note: "",
    linkedInvestmentRecordId: null,
    groupId: null,
    isReviewed: true,
    receiptAttachmentId: null,
    recurringRuleId: null,
    ...overrides,
  };
}

function recurringRow(
  id: string,
  overrides: Partial<RecurringTransaction> = {},
): RecurringTransaction {
  return {
    id,
    spaceId: "space_test",
    revision: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    accountId: "acct_cash",
    counterAccountId: null,
    amount: -100,
    currency: "TWD",
    category: "餐飲",
    subcategory: "",
    merchant: "小半天",
    entryType: "expense",
    settlementStatus: "settled",
    note: "",
    frequency: "monthly",
    dayOfMonth: 5,
    nextRunDate: "2026-07-05",
    isActive: true,
    ...overrides,
  };
}

describeEachRepo("renameMerchant", (makeRepo) => {
  it("renames every active ledger row and returns the changed count", async () => {
    const repo = await makeRepo({
      accounts: [account],
      ledgerTransactions: [
        ledgerRow("l1", { merchant: "小半天" }),
        ledgerRow("l2", { merchant: "小半天" }),
      ],
    });
    const changed = await repo.renameMerchant("小半天", "小半天咖啡");
    expect(changed).toBe(2);
    const rows = await repo.listLedgerTransactions();
    expect(rows.every((r) => r.merchant === "小半天咖啡")).toBe(true);
  });

  it("also renames matching recurring_transactions rules (the cascade gap)", async () => {
    const repo = await makeRepo({
      accounts: [account],
      ledgerTransactions: [ledgerRow("l1", { merchant: "小半天" })],
      recurringTransactions: [recurringRow("r1", { merchant: "小半天" })],
    });
    await repo.renameMerchant("小半天", "小半天咖啡");
    const rules = await repo.listRecurringTransactions();
    expect(rules.find((r) => r.id === "r1")?.merchant).toBe("小半天咖啡");
  });

  it("replaces the old name inside settings.merchants", async () => {
    const repo = await makeRepo({
      accounts: [account],
      settings: {
        primaryCurrency: "TWD",
        categories: [],
        merchants: ["小半天", "全家"],
        exchangeRates: [],
      },
    });
    await repo.renameMerchant("小半天", "小半天咖啡");
    const settings = await repo.getAppSettings();
    expect(settings.merchants).toContain("小半天咖啡");
    expect(settings.merchants).not.toContain("小半天");
  });

  it("merging onto an existing merchant combines rows and dedupes settings.merchants", async () => {
    const repo = await makeRepo({
      accounts: [account],
      ledgerTransactions: [
        ledgerRow("l1", { merchant: "小半天" }),
        ledgerRow("l2", { merchant: "小半天咖啡" }),
      ],
      settings: {
        primaryCurrency: "TWD",
        categories: [],
        merchants: ["小半天", "小半天咖啡"],
        exchangeRates: [],
      },
    });
    const changed = await repo.renameMerchant("小半天", "小半天咖啡");
    expect(changed).toBe(1);
    const rows = await repo.listLedgerTransactions();
    expect(rows.every((r) => r.merchant === "小半天咖啡")).toBe(true);
    const settings = await repo.getAppSettings();
    expect(settings.merchants.filter((m) => m === "小半天咖啡")).toHaveLength(1);
  });

  it("leaves rows for a different merchant untouched (including revision)", async () => {
    const repo = await makeRepo({
      accounts: [account],
      ledgerTransactions: [
        ledgerRow("l1", { merchant: "小半天" }),
        ledgerRow("l2", { merchant: "全家", revision: 1 }),
      ],
    });
    await repo.renameMerchant("小半天", "小半天咖啡");
    const rows = await repo.listLedgerTransactions();
    const untouched = rows.find((r) => r.id === "l2");
    expect(untouched?.merchant).toBe("全家");
    expect(untouched?.revision).toBe(1);
  });

  it("does not rename soft-deleted rows", async () => {
    const repo = await makeRepo({
      accounts: [account],
      ledgerTransactions: [
        ledgerRow("l1", { merchant: "小半天", deletedAt: "2026-01-02T00:00:00.000Z" }),
      ],
    });
    const changed = await repo.renameMerchant("小半天", "小半天咖啡");
    // `changed === 0` proves the WHERE `deleted_at is null` guard excluded
    // this row — implementation-independent, so it regresses in either repo
    // if the guard is dropped. We can't also assert "row unchanged" once for
    // both: BrowserFinanceRepository.exportSnapshot() returns tombstones
    // unfiltered (repositories.ts:2709-2715), but TauriSqlFinanceRepository's
    // exportSnapshot() delegates to listLedgerTransactions(), which excludes
    // them (repositories.ts:4054).
    expect(changed).toBe(0);
  });

  it("throws on an empty / whitespace-only new name", async () => {
    const repo = await makeRepo({ accounts: [account] });
    await expect(repo.renameMerchant("小半天", "   ")).rejects.toThrow();
  });
});

describeEachRepo("renameLedgerName", (makeRepo) => {
  it("renames every active ledger row and returns the changed count", async () => {
    const repo = await makeRepo({
      accounts: [account],
      ledgerTransactions: [
        ledgerRow("l1", { name: "小半天" }),
        ledgerRow("l2", { name: "小半天" }),
      ],
    });
    const changed = await repo.renameLedgerName("小半天", "小半天咖啡");
    expect(changed).toBe(2);
    const rows = await repo.listLedgerTransactions();
    expect(rows.every((r) => r.name === "小半天咖啡")).toBe(true);
  });

  it("leaves rows for a different name untouched (including revision)", async () => {
    const repo = await makeRepo({
      accounts: [account],
      ledgerTransactions: [
        ledgerRow("l1", { name: "小半天" }),
        ledgerRow("l2", { name: "早餐", revision: 1 }),
      ],
    });
    await repo.renameLedgerName("小半天", "小半天咖啡");
    const rows = await repo.listLedgerTransactions();
    const untouched = rows.find((r) => r.id === "l2");
    expect(untouched?.name).toBe("早餐");
    expect(untouched?.revision).toBe(1);
  });

  it("does not rename soft-deleted rows", async () => {
    const repo = await makeRepo({
      accounts: [account],
      ledgerTransactions: [
        ledgerRow("l1", { name: "小半天", deletedAt: "2026-01-02T00:00:00.000Z" }),
      ],
    });
    const changed = await repo.renameLedgerName("小半天", "小半天咖啡");
    // `changed === 0` is the implementation-independent proof that the WHERE
    // `deleted_at is null` guard excluded this row. See the renameMerchant
    // test above for why a "row unchanged" assertion can't be written once
    // for both repos: BrowserFinanceRepository.exportSnapshot() keeps
    // tombstones (repositories.ts:2709-2715) but TauriSqlFinanceRepository's
    // drops them via listLedgerTransactions() (repositories.ts:4054).
    expect(changed).toBe(0);
  });

  it("throws on an empty / whitespace-only new name", async () => {
    const repo = await makeRepo({ accounts: [account] });
    await expect(repo.renameLedgerName("小半天", "   ")).rejects.toThrow();
  });

  it("does not touch the merchant field or settings.merchants", async () => {
    const repo = await makeRepo({
      accounts: [account],
      ledgerTransactions: [ledgerRow("l1", { name: "小半天", merchant: "小半天" })],
      settings: {
        primaryCurrency: "TWD",
        categories: [],
        merchants: ["小半天"],
        exchangeRates: [],
      },
    });
    await repo.renameLedgerName("小半天", "小半天咖啡");
    const rows = await repo.listLedgerTransactions();
    expect(rows.find((r) => r.id === "l1")?.merchant).toBe("小半天");
    const settings = await repo.getAppSettings();
    expect(settings.merchants).toEqual(["小半天"]);
  });

  it("merging onto an existing name counts only the rows that actually changed", async () => {
    const repo = await makeRepo({
      accounts: [account],
      ledgerTransactions: [
        ledgerRow("l1", { name: "小半天" }),
        ledgerRow("l2", { name: "小半天咖啡" }),
      ],
    });
    const changed = await repo.renameLedgerName("小半天", "小半天咖啡");
    // l2 already carries the target name, so it's never written — `changed`
    // reflects rows actually updated (1), not the combined group size (2).
    expect(changed).toBe(1);
    const rows = await repo.listLedgerTransactions();
    expect(rows.every((r) => r.name === "小半天咖啡")).toBe(true);
  });
});
