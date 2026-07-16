/**
 * Default-book convergence spike (plan 207) — pure-domain PoC.
 *
 * ── What this is ─────────────────────────────────────────────────────────────
 * `ensureSqliteDefaultBook` (src/data/repositories.ts) mints a 個人帳 with a
 * random UUID on every device, before that device has pulled from sync. Two
 * devices that haven't synced yet each mint their own — sync then shows both,
 * forever (see docs/default-book-convergence-spike.md §1 for the full trace).
 *
 * This module is the deterministic MERGE RULE evaluated in that doc's §3
 * option (c): given the current book set, decide which duplicate personal
 * book survives and which are the losers to tombstone. It is a PURE function
 * — no storage, no repository, no UI, no revision bumping, no re-pointing of
 * `accounts.book_id`/`invoices.book_id`/`clients.book_id`. Those side effects
 * belong to a caller in the data layer, which is explicitly out of scope for
 * this spike (see the plan's Scope section).
 *
 * ── Why the tiebreak matters (the version-skew argument in §4) ─────────────
 * Two devices that both see the same set of personal books must independently
 * compute the SAME survivor without coordinating — that's what makes the
 * merge self-healing across devices instead of a new source of divergence.
 * `order by created_at, id` is already the exact rule
 * `ensureSqliteDefaultBook`'s "pick the existing default" query uses
 * (src/data/repositories.ts:2540), so this isn't a new invention: it reuses a
 * tiebreak already proven to behave deterministically in production. The `id`
 * tiebreak specifically exists to break a `created_at` TIE (e.g. clock skew,
 * or both devices minting within the same second) — without it, two devices
 * could disagree on the survivor and never converge.
 *
 * ── Scope of "personal" ──────────────────────────────────────────────────────
 * Only `kind === "personal"` books are ever candidates: a 公司帳 (company
 * book) is a deliberately created, named, distinct ledger — never a duplicate
 * of the default 個人帳 minted by `ensureSqliteDefaultBook`. Company books are
 * filtered out up front and never appear as a survivor or a loser.
 *
 * ── Tombstoned books ──────────────────────────────────────────────────────────
 * A book with `deletedAt !== null` is already gone (e.g. removed via
 * `deleteBook`, plan 206) and must not be resurrected or counted — filtered
 * out up front, same as company books.
 */

import type { Book } from "./types";

export interface BookMergePlan {
  /** The book every device keeps — the oldest personal book by (createdAt, id). */
  survivorId: string;
  /** Every other non-deleted personal book id — these get tombstoned by the caller. */
  loserIds: string[];
}

/**
 * Decide which personal book survives when more than one non-deleted
 * personal book exists. Returns `null` when there is nothing to merge (zero
 * or one eligible personal book) — the caller should treat `null` as a no-op.
 *
 * Deterministic and order-independent: the same input SET (regardless of
 * array order) always yields the same survivor, which is what lets two
 * unsynchronized devices agree on the outcome without talking to each other.
 *
 * NOTE: this general-purpose function operates over ALL active personal
 * books and is kept for its existing test coverage / as a documented PoC of
 * the tiebreak rule. Plan 211 (the build) does NOT call this for the
 * production auto-merge — it calls the narrower `planMintMerge` below, whose
 * domain is restricted to untouched system mints per operator decision 2.
 */
export function planBookMerge(books: Book[]): BookMergePlan | null {
  const personal = books.filter((book) => book.kind === "personal" && book.deletedAt === null);
  if (personal.length < 2) return null;

  return planForSet(personal);
}

/**
 * Plan 211 — narrows the merge domain per operator decision 2 (verbatim,
 * `plans/211-default-book-merge-build.md`): 「如果是使用者自己新增的不用自動
 * 合併，但這次是因為系統突然幫我新增了一個 0 帳戶的帳本」 → only
 * system-minted, never-edited duplicates are auto-merged. User-created or
 * user-edited books are NEVER auto-merged, even if they look duplicated.
 *
 * A book is an **untouched system mint** iff it exactly matches what
 * `ensureSqliteDefaultBook` / `ensureDefaultBookInMemory` write on the INSERT
 * path (src/data/repositories.ts) and has never been touched since:
 * `revision === 1` alone should suffice — `updateBook` and `deleteBook`'s
 * tombstone are the only two places a book's revision is ever bumped
 * (src/data/repositories.ts), so revision 1 means "never edited, on any
 * device" (revision is itself a synced field). The remaining field checks are
 * belt-and-suspenders, matching the literal INSERT values verbatim.
 *
 * The bias is deliberate and load-bearing: false negatives just leave cosmetic
 * clutter behind (the user can still `deleteBook` it manually); false
 * positives would auto-discard a book the user customized. Under-merge,
 * never over-merge — do not widen this predicate without an operator
 * decision (see the plan's "Maintenance notes").
 */
export function isUntouchedMint(book: Book): boolean {
  return (
    book.kind === "personal" &&
    book.deletedAt === null &&
    book.revision === 1 &&
    book.name === "個人帳" &&
    book.color === null &&
    book.includeInPersonalNetWorth === true &&
    book.includeInFireMetrics === true
  );
}

/**
 * The production auto-merge rule (plan 211). Domain = untouched mints ONLY
 * (see `isUntouchedMint`). A customized personal book or a company book is
 * never a candidate — it can never become a survivor-by-force and never
 * appears in `loserIds`, regardless of its `createdAt`/`id`. Returns `null`
 * unless at least 2 untouched mints exist (one mint + one customized book is
 * a user choice, not the bug — no merge).
 */
export function planMintMerge(books: Book[]): BookMergePlan | null {
  const mints = books.filter(isUntouchedMint);
  if (mints.length < 2) return null;

  return planForSet(mints);
}

/** Shared deterministic tiebreak: oldest (createdAt, then id) survives. */
function planForSet(candidates: Book[]): BookMergePlan {
  const sorted = [...candidates].sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    if (a.id !== b.id) return a.id < b.id ? -1 : 1;
    return 0;
  });

  const [survivor, ...losers] = sorted;
  return { survivorId: survivor.id, loserIds: losers.map((book) => book.id) };
}
