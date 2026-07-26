import { describe, expect, it } from "vitest";
import {
  buildNetWorthBreakdown,
  buildOutstandingSettlements,
  calculateAvailableCash,
  calculateLiabilities,
} from "./dashboardSummary";
import type { Account, LedgerTransaction } from "./types";

// Plan 190 (帳本 Phase 2a — Invoice/Client) characterization test — written
// against TODAY's (pre-invoice) code and dataset. It must still pass
// BYTE-UNCHANGED once `Invoice`/`Client` land: those are additive metadata
// records (docs/ledger-books-plan.md §3, "Invoice metadata storage") that
// point AT a receivable ledger row via `linkedLedgerTransactionId` — they are
// never inputs to these money-aggregate functions, so the ledger/account
// side's outputs must be bit-identical whether or not a parallel
// Invoice/Client record exists for the same receivable row. If this test ever
// needs editing to keep passing, invoices/clients stopped being pure
// additive metadata — see plan 190's STOP conditions.
//
// The seed mirrors booksPartition.test.ts's fixture style (plan 188), with
// the receivable row standing in for a 開發票 scenario: a company issues an
// invoice (105,000 含稅), which is recorded today as an ordinary receivable
// income row — exactly the row an `Invoice` would later link to via
// `linkedLedgerTransactionId`.

const identity = (n: number) => n;

// Fixtures intentionally build only the fields the four functions under test
// actually read — see booksPartition.test.ts for the same rationale: a
// characterization test must not couple to Account/LedgerTransaction's exact
// field list, or an unrelated schema change would force an edit here.
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
    accountId: "acct_company_cash",
    date: "2026-06-01T00:00",
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

// ── Seed: a small company-book-flavored account mix ─────────────────────
const accounts: Account[] = [
  account({ id: "acct_company_cash", type: "cash", balance: 200_000 }),
  account({ id: "acct_company_checking", type: "depository", balance: 50_000 }),
  account({ id: "acct_company_card", type: "credit", balance: -12_000 }),
];

const investmentsValue = 0;

// ── Seed: income / expense / an 開發票 receivable / an unrelated payable ──
const ledger: LedgerTransaction[] = [
  ledgerRow({
    id: "l_income",
    accountId: "acct_company_checking",
    entryType: "income",
    amount: 30_000,
    name: "顧問收入",
    date: "2026-06-02T00:00",
  }),
  ledgerRow({
    id: "l_expense",
    accountId: "acct_company_card",
    entryType: "expense",
    amount: -8_000,
    name: "軟體訂閱",
    date: "2026-06-03T00:00",
  }),
  // Model A (docs/ledger-books-plan.md §3): 開發票 = a receivable income row of
  // the 含稅 total. This is the row a future `Invoice` record would link to via
  // `linkedLedgerTransactionId` — the aggregate functions below never see the
  // Invoice, only this ledger row.
  ledgerRow({
    id: "l_invoice_receivable",
    accountId: "acct_company_cash",
    entryType: "income",
    settlementStatus: "receivable",
    amount: 105_000,
    merchant: "客戶甲",
    name: "開立發票",
    date: "2026-06-05T00:00",
  }),
  ledgerRow({
    id: "l_payable",
    accountId: "acct_company_checking",
    entryType: "expense",
    settlementStatus: "payable",
    amount: -5_000,
    merchant: "供應商乙",
    name: "應付帳款",
    date: "2026-06-06T00:00",
  }),
];

describe("invoices partition characterization (plan 190)", () => {
  it("calculateAvailableCash — unaffected by any future Invoice/Client record", () => {
    expect(calculateAvailableCash(accounts, identity)).toBe(250_000);
  });

  it("calculateLiabilities — unaffected by any future Invoice/Client record", () => {
    expect(calculateLiabilities(accounts, identity)).toBe(12_000);
  });

  it("buildNetWorthBreakdown reconciles 資產 − 負債 = 淨值, unaffected by any future Invoice/Client record", () => {
    const b = buildNetWorthBreakdown(accounts, investmentsValue, identity);
    expect(b.liquidCash).toBe(250_000);
    expect(b.alternativeAssets).toBe(0);
    expect(b.investments).toBe(0);
    expect(b.liabilities).toBe(12_000);
    expect(b.totalAssets).toBe(250_000);
    expect(b.netWorth).toBe(238_000);
    expect(b.netWorth).toBe(b.totalAssets - b.liabilities);
  });

  it("buildOutstandingSettlements totals the seeded receivable (開發票) + payable, unaffected by any future Invoice/Client record", () => {
    const s = buildOutstandingSettlements(ledger, identity);
    expect(s.receivableTotal).toBe(105_000);
    expect(s.payableTotal).toBe(5_000);
    expect(s.receivableCount).toBe(1);
    expect(s.payableCount).toBe(1);
  });
});
