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
 */
export function planBookMerge(books: Book[]): BookMergePlan | null {
  const personal = books.filter((book) => book.kind === "personal" && book.deletedAt === null);
  if (personal.length < 2) return null;

  const sorted = [...personal].sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    if (a.id !== b.id) return a.id < b.id ? -1 : 1;
    return 0;
  });

  const [survivor, ...losers] = sorted;
  return { survivorId: survivor.id, loserIds: losers.map((book) => book.id) };
}
