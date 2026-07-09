import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryFinanceRepositoryForTests } from "./repositories";
import { nextRecurringDate } from "../domain";
import type { Account, RecurringTransaction } from "../domain";

// `createRecurringTransaction` routes nextRunDate through `firstFutureRunDate`,
// which reads the real clock to advance a rule to its first *future* occurrence.
// Without a fixed clock the "does not duplicate the seed…" test flips between
// pass/fail depending on the calendar day it runs (e.g. it broke on 2026-07-05,
// one month after the hard-coded 2026-06-05 seed). Pin "today" to the seed date
// so every date-sensitive assertion is deterministic. Only Date is faked — timers
// stay real so async persist()/microtasks are unaffected.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-06-05T00:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

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
    counterAccountId: null,
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

  it("carries counterAccountId from a 代墊 rule into each posted occurrence", async () => {
    const repo = createMemoryFinanceRepositoryForTests({
      accounts: [account],
      recurringTransactions: [recurring({ settlementStatus: "receivable", entryType: "income", amount: 500, counterAccountId: "acct_pay" })],
    });
    await repo.postDueRecurringTransactions("2026-05-29");
    const ledger = await repo.listLedgerTransactions();
    expect(ledger.length).toBeGreaterThan(0);
    expect(ledger.every((row) => row.counterAccountId === "acct_pay")).toBe(true);
  });
});

describe("applyRecurringScopeEdit", () => {
  async function setup() {
    const repo = createMemoryFinanceRepositoryForTests({ accounts: [account], recurringTransactions: [recurring()] });
    await repo.postDueRecurringTransactions("2026-05-29"); // posts 03-05, 04-05, 05-05
    const ledger = await repo.listLedgerTransactions();
    return { repo, ledger };
  }

  function draftFrom(row: Awaited<ReturnType<typeof setup>>["ledger"][number]) {
    return {
      accountId: row.accountId,
      counterAccountId: row.counterAccountId,
      date: row.date,
      name: row.name,
      amount: -2000,
      currency: row.currency,
      category: "居住",
      subcategory: "房租",
      merchant: "新房東",
      entryType: "expense" as const,
      settlementStatus: "settled" as const,
      note: "調漲",
    };
  }

  it("scope=this updates only the edited occurrence", async () => {
    const { repo, ledger } = await setup();
    const target = ledger[0];
    await repo.applyRecurringScopeEdit(target.id, "this", draftFrom(target));
    const after = await repo.listLedgerTransactions();
    expect(after.filter((r) => r.amount === -2000)).toHaveLength(1);
    const [rule] = await repo.listRecurringTransactions();
    expect(rule.amount).toBe(-1000); // rule untouched
  });

  it("scope=future updates the edited occurrence and the rule", async () => {
    const { repo, ledger } = await setup();
    const target = ledger[0];
    await repo.applyRecurringScopeEdit(target.id, "future", draftFrom(target));
    const after = await repo.listLedgerTransactions();
    expect(after.filter((r) => r.amount === -2000)).toHaveLength(1); // only this occurrence
    const [rule] = await repo.listRecurringTransactions();
    expect(rule.amount).toBe(-2000); // rule updated
    expect(rule.merchant).toBe("新房東");
  });

  it("scope=all rewrites every occurrence but keeps each original date", async () => {
    const { repo, ledger } = await setup();
    const dates = ledger.map((r) => r.date).sort();
    const target = ledger.find((r) => r.date === dates[1])!; // edit a middle one
    await repo.applyRecurringScopeEdit(target.id, "all", { ...draftFrom(target), date: "2026-09-09T09:00" });
    const after = await repo.listLedgerTransactions();
    expect(after.every((r) => r.amount === -2000 && r.merchant === "新房東")).toBe(true);
    // The edited row keeps its new date; siblings keep their originals.
    expect(after.map((r) => r.date).sort()).toEqual([dates[0], dates[2], "2026-09-09T09:00"].sort());
    const [rule] = await repo.listRecurringTransactions();
    expect(rule.amount).toBe(-2000);
  });
});
