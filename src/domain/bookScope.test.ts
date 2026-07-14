import { describe, expect, it } from "vitest";
import {
  ALL_BOOKS,
  bookAccountIdSet,
  fireMetricAccountIdSet,
  personalNetWorthAccountIdSet,
  scopeRows,
} from "./bookScope";
import { isNeutralLedgerRow } from "./ledgerTrust";
import type { Account, Book, LedgerTransaction } from "./types";

// Plan 189 (帳本 Phase 1b) — semantics-as-tests for the shared bookScope
// helpers, written FIRST per the plan's Step 1, before any UI wiring. Model
// on booksPartition.test.ts's minimal-fixture style: build only the fields
// each function actually reads, cast to the domain type, so this file stays
// decoupled from unrelated Account/Book/LedgerTransaction field churn.

type MinimalAccount = Pick<Account, "id" | "bookId">;
type MinimalBook = Pick<Book, "id" | "includeInFireMetrics" | "includeInPersonalNetWorth">;
type MinimalLedgerRow = Pick<LedgerTransaction, "id" | "accountId" | "entryType" | "counterAccountId">;

function account(overrides: MinimalAccount): Account {
  return overrides as unknown as Account;
}

function book(overrides: MinimalBook): Book {
  return overrides as unknown as Book;
}

function ledgerRow(overrides: Partial<MinimalLedgerRow> & Pick<MinimalLedgerRow, "id" | "accountId">): LedgerTransaction {
  const row: MinimalLedgerRow = {
    entryType: "expense",
    counterAccountId: null,
    ...overrides,
  };
  return row as unknown as LedgerTransaction;
}

// ── Shared fixture: 個人帳 (personal, both toggles ON by default) and 公司帳
// (company, both toggles OFF by default per §5's operator-locked decision) ──
const personalBook = book({ id: "book_personal", includeInFireMetrics: true, includeInPersonalNetWorth: true });
const companyBook = book({ id: "book_company", includeInFireMetrics: false, includeInPersonalNetWorth: false });
const books: Book[] = [personalBook, companyBook];

const acctPersonalCash = account({ id: "acct_personal_cash", bookId: "book_personal" });
const acctPersonalCard = account({ id: "acct_personal_card", bookId: "book_personal" });
const acctCompanyChecking = account({ id: "acct_company_checking", bookId: "book_company" });
const accounts: Account[] = [acctPersonalCash, acctPersonalCard, acctCompanyChecking];

describe("bookScope (plan 189 Step 1 semantics)", () => {
  // (a) bookAccountIdSet(accounts, "all") → identity (every account id)
  it("bookAccountIdSet with activeBookId 'all' (總帳) returns every account id", () => {
    const set = bookAccountIdSet(accounts, ALL_BOOKS);
    expect(set).toEqual(new Set(["acct_personal_cash", "acct_personal_card", "acct_company_checking"]));
    expect(set.size).toBe(accounts.length);
  });

  // (b) bookAccountIdSet(accounts, someBookId) → only that book's account ids,
  // and scopeRows drops other books' rows.
  it("bookAccountIdSet with a specific bookId returns only that book's account ids", () => {
    const personalSet = bookAccountIdSet(accounts, "book_personal");
    expect(personalSet).toEqual(new Set(["acct_personal_cash", "acct_personal_card"]));

    const companySet = bookAccountIdSet(accounts, "book_company");
    expect(companySet).toEqual(new Set(["acct_company_checking"]));
  });

  it("scopeRows drops rows belonging to accounts outside the active book's set", () => {
    const rows: LedgerTransaction[] = [
      ledgerRow({ id: "l1", accountId: "acct_personal_cash" }),
      ledgerRow({ id: "l2", accountId: "acct_personal_card" }),
      ledgerRow({ id: "l3", accountId: "acct_company_checking" }),
    ];
    const personalSet = bookAccountIdSet(accounts, "book_personal");
    const scoped = scopeRows(rows, personalSet);
    expect(scoped.map((r) => r.id)).toEqual(["l1", "l2"]);
  });

  // (c) fireMetricAccountIdSet / personalNetWorthAccountIdSet include ONLY
  // accounts of books with the respective toggle true, INDEPENDENT of any
  // activeBookId (they don't take one).
  it("fireMetricAccountIdSet includes only accounts of books with includeInFireMetrics true, regardless of switcher", () => {
    const set = fireMetricAccountIdSet(accounts, books);
    // personal book has the toggle ON, company book OFF (operator-locked default)
    expect(set).toEqual(new Set(["acct_personal_cash", "acct_personal_card"]));
  });

  it("personalNetWorthAccountIdSet includes only accounts of books with includeInPersonalNetWorth true, regardless of switcher", () => {
    const set = personalNetWorthAccountIdSet(accounts, books);
    expect(set).toEqual(new Set(["acct_personal_cash", "acct_personal_card"]));
  });

  it("fireMetricAccountIdSet still excludes the company book even when a toggle is flipped ON for a non-FIRE book set — proves the function has no activeBookId parameter to smuggle switcher state through", () => {
    // Signature-level proof: fireMetricAccountIdSet/personalNetWorthAccountIdSet
    // take (accounts, books) only — there is no activeBookId argument for the
    // switcher to influence. Flip the company book's FIRE toggle ON here and
    // confirm the result changes solely because of the toggle, not because of
    // any notion of "which book is active".
    const companyOptedIn = book({ id: "book_company", includeInFireMetrics: true, includeInPersonalNetWorth: false });
    const toggledBooks: Book[] = [personalBook, companyOptedIn];
    const set = fireMetricAccountIdSet(accounts, toggledBooks);
    expect(set).toEqual(new Set(["acct_personal_cash", "acct_personal_card", "acct_company_checking"]));
  });

  // (d) A transfer pair whose two legs are in different books stays
  // isNeutralLedgerRow for both — proving a cross-book transfer is counted as
  // income/expense in NEITHER book's cash-flow view.
  it("a cross-book transfer pair is neutral (excluded from income/expense) in both books' scoped views", () => {
    const rows: LedgerTransaction[] = [
      ledgerRow({ id: "l_out", accountId: "acct_personal_cash", entryType: "transfer" }),
      ledgerRow({ id: "l_in", accountId: "acct_company_checking", entryType: "transfer" }),
    ];

    // Both legs are neutral by entryType, independent of which book each
    // account belongs to — the exclusion mechanism (isNeutralLedgerRow) reads
    // entryType/counterAccountId only, never account/book.
    for (const row of rows) {
      expect(isNeutralLedgerRow(row)).toBe(true);
    }

    // Scoped to the personal book: only the outgoing leg is even in view, and
    // it is neutral (never counted as an expense).
    const personalSet = bookAccountIdSet(accounts, "book_personal");
    const personalScoped = scopeRows(rows, personalSet);
    expect(personalScoped.map((r) => r.id)).toEqual(["l_out"]);
    expect(personalScoped.every((r) => isNeutralLedgerRow(r))).toBe(true);

    // Scoped to the company book: only the incoming leg is in view, and it is
    // neutral too (never counted as income).
    const companySet = bookAccountIdSet(accounts, "book_company");
    const companyScoped = scopeRows(rows, companySet);
    expect(companyScoped.map((r) => r.id)).toEqual(["l_in"]);
    expect(companyScoped.every((r) => isNeutralLedgerRow(r))).toBe(true);

    // 總帳: both legs in view, both still neutral.
    const allSet = bookAccountIdSet(accounts, ALL_BOOKS);
    const allScoped = scopeRows(rows, allSet);
    expect(allScoped).toHaveLength(2);
    expect(allScoped.every((r) => isNeutralLedgerRow(r))).toBe(true);
  });
});
