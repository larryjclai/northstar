import type { Account, Book } from "./types";

/**
 * 帳本 (Books) scoping helpers — plan 189 (帳本 Phase 1b). Pure read-time
 * partitioning: these functions never touch storage, they only compute which
 * account ids belong in a given view so callers can filter their INPUT
 * accounts/rows before handing them to the existing domain aggregations
 * (`buildNetWorthBreakdown`, `calculateFireProjection`, etc.) — see
 * docs/ledger-books-plan.md §1/§2a/§5. No domain function signature changes;
 * only the arrays fed into them change.
 *
 * **The two-axis rule (docs/ledger-books-plan.md §5, operator-locked):**
 * 1. General views (net worth, cash-flow, investments, budgets, annual
 *    report) are scoped by the SWITCHER — `bookAccountIdSet(accounts,
 *    activeBookId)`. Viewing 公司帳 shows only that book; 總帳 (`"all"`) shows
 *    everything.
 * 2. FIRE-family metrics (`calculateFireProjection`, `trailingMonthly*`,
 *    `coverageRatioPct`, `runwayMonths`, `goalPace`) are scoped by
 *    `fireMetricAccountIdSet` REGARDLESS of the switcher — they answer "the
 *    user's personal financial independence", one answer, not one-per-tab. A
 *    company book with `includeInFireMetrics: false` never feeds these, even
 *    while viewing 總帳.
 * 3. The 北極星/personal-net-worth hero KPI (if it is the FI figure, not the
 *    raw book total) uses `personalNetWorthAccountIdSet`, same
 *    switcher-independent logic.
 */

/** Literal value for the 總帳 (consolidated) pseudo-book in the switcher. */
export const ALL_BOOKS = "all";

export type ActiveBookId = string | typeof ALL_BOOKS;

/**
 * The SWITCHER scope: which account ids are visible for the currently active
 * book. `"all"` (總帳) is the identity — every account id. Otherwise, only
 * the ids of accounts whose `bookId` matches.
 */
export function bookAccountIdSet(accounts: Account[], activeBookId: ActiveBookId): Set<string> {
  if (activeBookId === ALL_BOOKS) {
    return new Set(accounts.map((a) => a.id));
  }
  return new Set(accounts.filter((a) => a.bookId === activeBookId).map((a) => a.id));
}

/**
 * Keep only rows whose `accountId` is a member of `accountIdSet`. Generic
 * over any row shape with an `accountId` field (ledger rows, assets, etc.) —
 * callers with a differently-named account field (e.g.
 * `InvestmentRecord.linkedAccountId`) filter by that field directly rather
 * than using this helper.
 */
export function scopeRows<T extends { accountId: string | null }>(
  rows: T[],
  accountIdSet: Set<string>,
): T[] {
  return rows.filter((row) => row.accountId != null && accountIdSet.has(row.accountId));
}

/**
 * FIRE-family scope (axis 2 of the two-axis rule): ids of accounts belonging
 * to books with `includeInFireMetrics === true`. Independent of any
 * `activeBookId` — this does not take one, by design.
 */
export function fireMetricAccountIdSet(accounts: Account[], books: Book[]): Set<string> {
  const includedBookIds = new Set(books.filter((b) => b.includeInFireMetrics).map((b) => b.id));
  return new Set(accounts.filter((a) => includedBookIds.has(a.bookId)).map((a) => a.id));
}

/**
 * Personal net-worth / 北極星 scope (axis 3 of the two-axis rule): ids of
 * accounts belonging to books with `includeInPersonalNetWorth === true`.
 * Independent of any `activeBookId` — this does not take one, by design.
 */
export function personalNetWorthAccountIdSet(accounts: Account[], books: Book[]): Set<string> {
  const includedBookIds = new Set(books.filter((b) => b.includeInPersonalNetWorth).map((b) => b.id));
  return new Set(accounts.filter((a) => includedBookIds.has(a.bookId)).map((a) => a.id));
}
