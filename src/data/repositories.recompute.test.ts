import { expect, it } from "vitest";
import { type InvestmentDraft, type LedgerDraft } from "./repositories";
import { describeEachRepo } from "./repositories.testHarness";
import type { Account } from "../domain";

// Characterization tests for the SQLite recompute paths (Plan 125). These pin
// the DERIVED values (account balances, asset quantity/cost) across the
// tombstone-filter + write-skip + de-quadratic-scan refactor. The math must be
// byte-for-byte identical before and after; both the memory twin and the real
// SQLite repo run every case.

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
    ...overrides,
  };
}

function ledgerDraft(overrides: Partial<LedgerDraft> & Pick<LedgerDraft, "accountId" | "amount">): LedgerDraft {
  return {
    date: "2026-06-10",
    name: "測試",
    currency: "TWD",
    category: "其他",
    subcategory: "",
    merchant: "",
    entryType: "expense",
    settlementStatus: "settled",
    note: "",
    ...overrides,
  };
}

const accountA = account({ id: "acct_a", name: "帳戶 A", openingBalance: 1_000 });
const accountB = account({ id: "acct_b", name: "帳戶 B", openingBalance: 500 });

describeEachRepo("recompute account balances — tombstone + write-skip", (makeRepo) => {
  it("excludes soft-deleted ledger rows and keeps every balance stable after a later mutation", async () => {
    const repo = await makeRepo({ accounts: [accountA, accountB] });

    // Seed 6 settled rows across two accounts.
    await repo.createLedgerTransaction(ledgerDraft({ accountId: "acct_a", amount: 2_000, entryType: "income", category: "收入" }));
    await repo.createLedgerTransaction(ledgerDraft({ accountId: "acct_a", amount: -500 }));
    await repo.createLedgerTransaction(ledgerDraft({ accountId: "acct_a", amount: 300, entryType: "income", category: "收入", name: "將被刪除" }));
    await repo.createLedgerTransaction(ledgerDraft({ accountId: "acct_b", amount: -200 }));
    await repo.createLedgerTransaction(ledgerDraft({ accountId: "acct_b", amount: 1_000, entryType: "income", category: "收入" }));
    await repo.createLedgerTransaction(ledgerDraft({ accountId: "acct_b", amount: -50 }));

    // Soft-delete the +300 row on A (its tombstone must not count toward balance).
    const rows = await repo.listLedgerTransactions();
    const toDelete = rows.find((r) => r.name === "將被刪除")!;
    await repo.deleteLedgerTransaction(toDelete.id);

    // A mutation that triggers recompute again (add -100 to A).
    await repo.createLedgerTransaction(ledgerDraft({ accountId: "acct_a", amount: -100 }));

    const accounts = await repo.listAccounts();
    const byId = new Map(accounts.map((a) => [a.id, a.balance]));
    // A: 1000 + 2000 - 500 - 100 (deleted +300 excluded) = 2400
    expect(byId.get("acct_a")).toBe(2_400);
    // B: 500 - 200 + 1000 - 50 = 1250
    expect(byId.get("acct_b")).toBe(1_250);
  });
});

const brokerAccount = account({
  id: "acct_broker",
  name: "券商",
  currency: "USD",
  type: "investment",
  openingBalance: 10_000,
  balance: 10_000,
});

const buyDraft: InvestmentDraft = {
  ticker: "QQQ",
  name: "Invesco QQQ",
  currency: "USD",
  linkedAccountId: "acct_broker",
  date: "2026-05-25",
  action: "buy",
  price: 100,
  quantity: 2,
  fee: 5,
  note: "",
};

describeEachRepo("recompute assets — de-quadratic scan keeps quantity/cost stable", (makeRepo) => {
  it("derives identical quantity and average cost after successive buys", async () => {
    const repo = await makeRepo({ accounts: [brokerAccount] });
    await repo.createInvestmentRecord(buyDraft);
    await repo.createInvestmentRecord({ ...buyDraft, date: "2026-05-26", price: 120, quantity: 3, fee: 0 });

    const assets = await repo.listPortfolioAssets();
    const qqq = assets.find((a) => a.ticker === "QQQ")!;
    // Quantity: 2 + 3 = 5.
    expect(qqq.totalQuantity).toBe(5);
    // Moving-average cost including the 5 fee on the first lot:
    // (2*100 + 5 + 3*120) / 5 = (205 + 360) / 5 = 113.
    expect(qqq.averageCost).toBe(113);
  });
});
