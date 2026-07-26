import { describe, expect, it } from "vitest";
import {
  buildNetWorthBreakdown,
  buildOutstandingSettlements,
  calculateAvailableCash,
  calculateLiabilities,
} from "./dashboardSummary";
import type { Account, LedgerTransaction } from "./types";

// Plan 188 (帳本 Phase 1a) characterization test — written against TODAY's
// (pre-books) code and dataset. It must still pass BYTE-UNCHANGED once
// `Book`/`accounts.bookId` land: adding a book column is a pure read-time
// partition, so with no book filter applied these aggregate outputs must be
// bit-identical before and after. If this test ever needs editing to keep
// passing, the book column stopped being a pure partition — see plan 188's
// STOP conditions.
//
// The seed mirrors dashboardSummary.test.ts's fixture style: several account
// types (cash, depository, alternative, loan, credit×2 — one owed, one
// overpaid) plus ledger rows spanning income / expense / a transfer pair /
// a receivable / a payable, so the dataset looks like a real household +
// small-business mix that a books feature would eventually need to split.

const identity = (n: number) => n;

// Fixtures intentionally build only the fields the four functions under test
// actually read (deletedAt/type/balance/currency for accounts;
// deletedAt/settlementStatus/amount/currency/name/merchant/date for ledger
// rows), then cast to the domain type. This is deliberate: a characterization
// test whose whole point is "this dataset's outputs don't move when a new
// column is added to Account" must not itself be coupled to Account's exact
// field list, or every unrelated schema change would force an edit to this
// file — see the "byte-identical, never amended after Step 3" done criterion
// in plan 188.
type MinimalAccount = Pick<Account, "id" | "type" | "balance" | "currency" | "deletedAt">;
type MinimalLedgerRow = Pick<
  LedgerTransaction,
  | "id"
  | "accountId"
  | "entryType"
  | "amount"
  | "currency"
  | "name"
  | "merchant"
  | "date"
  | "deletedAt"
  | "settlementStatus"
  | "groupId"
>;

function account(
  overrides: Partial<MinimalAccount> & Pick<MinimalAccount, "id" | "type" | "balance">,
): Account {
  const row: MinimalAccount = {
    currency: "TWD",
    deletedAt: null,
    ...overrides,
  };
  return row as unknown as Account;
}

function ledgerRow(
  overrides: Partial<MinimalLedgerRow> & Pick<MinimalLedgerRow, "id">,
): LedgerTransaction {
  const row: MinimalLedgerRow = {
    accountId: "acct_cash_main",
    date: "2026-05-01T00:00",
    name: "",
    amount: 0,
    currency: "TWD",
    merchant: "",
    entryType: "expense",
    settlementStatus: "settled",
    deletedAt: null,
    groupId: null,
    ...overrides,
  };
  return row as unknown as LedgerTransaction;
}

// ── Seed: several account types incl. credit ────────────────────────────
const accounts: Account[] = [
  account({ id: "acct_cash_main", type: "cash", balance: 5000 }),
  account({ id: "acct_checking", type: "depository", balance: -300 }),
  account({ id: "acct_house", type: "alternative", balance: 8_000_000 }),
  account({ id: "acct_car_loan", type: "loan", balance: -600_000 }),
  account({ id: "acct_card_owed", type: "credit", balance: -2500 }),
  account({ id: "acct_card_overpaid", type: "credit", balance: 400 }),
];

const investmentsValue = 300_000;

// ── Seed: ledger rows incl. income / expense / transfer pair / receivable / payable ──
const transferGroupId = "group_transfer_1";
const ledger: LedgerTransaction[] = [
  ledgerRow({
    id: "l_income",
    accountId: "acct_cash_main",
    entryType: "income",
    amount: 50_000,
    name: "薪資",
    date: "2026-05-05T00:00",
  }),
  ledgerRow({
    id: "l_expense",
    accountId: "acct_checking",
    entryType: "expense",
    amount: -1200,
    name: "雜貨",
    date: "2026-05-06T00:00",
  }),
  ledgerRow({
    id: "l_transfer_out",
    accountId: "acct_checking",
    entryType: "transfer",
    amount: -20_000,
    groupId: transferGroupId,
    name: "轉帳",
    date: "2026-05-07T00:00",
  }),
  ledgerRow({
    id: "l_transfer_in",
    accountId: "acct_cash_main",
    entryType: "transfer",
    amount: 20_000,
    groupId: transferGroupId,
    name: "轉帳",
    date: "2026-05-07T00:00",
  }),
  ledgerRow({
    id: "l_receivable",
    accountId: "acct_cash_main",
    entryType: "income",
    settlementStatus: "receivable",
    amount: 8000,
    merchant: "客戶A",
    name: "應收帳款",
    date: "2026-05-08T00:00",
  }),
  ledgerRow({
    id: "l_payable",
    accountId: "acct_checking",
    entryType: "expense",
    settlementStatus: "payable",
    amount: -3000,
    merchant: "供應商B",
    name: "應付帳款",
    date: "2026-05-09T00:00",
  }),
];

describe("books partition characterization (plan 188)", () => {
  it("calculateAvailableCash — unaffected by any future book scoping", () => {
    expect(calculateAvailableCash(accounts, identity)).toBe(5000);
  });

  it("calculateLiabilities — unaffected by any future book scoping", () => {
    expect(calculateLiabilities(accounts, identity)).toBe(602_500);
  });

  it("buildNetWorthBreakdown reconciles 資產 − 負債 = 淨值, unaffected by any future book scoping", () => {
    const b = buildNetWorthBreakdown(accounts, investmentsValue, identity);
    expect(b.liquidCash).toBe(5400);
    expect(b.alternativeAssets).toBe(8_000_000);
    expect(b.investments).toBe(300_000);
    expect(b.liabilities).toBe(602_800);
    expect(b.totalAssets).toBe(8_305_400);
    expect(b.netWorth).toBe(7_702_600);
    expect(b.netWorth).toBe(b.totalAssets - b.liabilities);
  });

  it("buildOutstandingSettlements totals the seeded receivable/payable, unaffected by any future book scoping", () => {
    const s = buildOutstandingSettlements(ledger, identity);
    expect(s.receivableTotal).toBe(8000);
    expect(s.payableTotal).toBe(3000);
    expect(s.receivableCount).toBe(1);
    expect(s.payableCount).toBe(1);
  });
});
