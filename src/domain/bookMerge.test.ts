import { describe, expect, it } from "vitest";
import { isUntouchedMint, planBookMerge, planMintMerge } from "./bookMerge";
import type { Book } from "./types";

function book(overrides: Partial<Book> & { id: string }): Book {
  return {
    spaceId: "space_personal_default",
    revision: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    name: "個人帳",
    kind: "personal",
    includeInPersonalNetWorth: true,
    includeInFireMetrics: true,
    color: null,
    ...overrides,
  };
}

describe("planBookMerge", () => {
  it("returns null for a single personal book (nothing to merge)", () => {
    const books = [book({ id: "book_a" })];
    expect(planBookMerge(books)).toBeNull();
  });

  it("returns null for zero books", () => {
    expect(planBookMerge([])).toBeNull();
  });

  it("picks the earlier-created book as survivor when created_at differs", () => {
    const older = book({ id: "book_b", createdAt: "2026-01-01T00:00:00.000Z" });
    const newer = book({ id: "book_a", createdAt: "2026-02-01T00:00:00.000Z" });
    // Deliberately fed newer-first to prove the result doesn't depend on array order.
    const plan = planBookMerge([newer, older]);
    expect(plan).toEqual({ survivorId: "book_b", loserIds: ["book_a"] });
  });

  it("breaks a created_at tie by id — the rule that makes cross-device convergence deterministic", () => {
    const tiedAt = "2026-03-15T08:00:00.000Z";
    const bookZ = book({ id: "book_zzz", createdAt: tiedAt });
    const bookA = book({ id: "book_aaa", createdAt: tiedAt });
    // Fed in one order...
    const planOne = planBookMerge([bookZ, bookA]);
    // ...and the reverse order. Both devices must agree regardless of local
    // array order (which mirrors query result order on each device).
    const planTwo = planBookMerge([bookA, bookZ]);
    expect(planOne).toEqual({ survivorId: "book_aaa", loserIds: ["book_zzz"] });
    expect(planTwo).toEqual({ survivorId: "book_aaa", loserIds: ["book_zzz"] });
  });

  it("excludes tombstoned (soft-deleted) books from both survivor and loser consideration", () => {
    const deleted = book({ id: "book_old", createdAt: "2025-01-01T00:00:00.000Z", deletedAt: "2026-01-01T00:00:00.000Z" });
    const survivor = book({ id: "book_b", createdAt: "2026-02-01T00:00:00.000Z" });
    const loser = book({ id: "book_c", createdAt: "2026-03-01T00:00:00.000Z" });
    const plan = planBookMerge([deleted, survivor, loser]);
    // Only the two non-deleted books are candidates; the deleted one (despite
    // being oldest) must not become the survivor or appear as a loser.
    expect(plan).toEqual({ survivorId: "book_b", loserIds: ["book_c"] });
  });

  it("leaves company books untouched — they are never survivors or losers", () => {
    const company = book({ id: "book_co", kind: "company", createdAt: "2025-01-01T00:00:00.000Z" });
    const personalOld = book({ id: "book_p1", createdAt: "2026-01-01T00:00:00.000Z" });
    const personalNew = book({ id: "book_p2", createdAt: "2026-02-01T00:00:00.000Z" });
    const plan = planBookMerge([company, personalOld, personalNew]);
    expect(plan).toEqual({ survivorId: "book_p1", loserIds: ["book_p2"] });
  });

  it("returns null when only one personal book exists alongside company books", () => {
    const company = book({ id: "book_co", kind: "company" });
    const personal = book({ id: "book_p1" });
    expect(planBookMerge([company, personal])).toBeNull();
  });
});

describe("isUntouchedMint", () => {
  it("is true for the exact shape ensureSqliteDefaultBook's INSERT writes", () => {
    expect(isUntouchedMint(book({ id: "book_mint" }))).toBe(true);
  });

  it("is false once revision > 1 (the book has been synced-through an edit or a heal)", () => {
    expect(isUntouchedMint(book({ id: "book_a", revision: 2 }))).toBe(false);
  });

  it("is false for a non-default name (user renamed it)", () => {
    expect(isUntouchedMint(book({ id: "book_a", name: "我的帳本" }))).toBe(false);
  });

  it("is false for a non-null color (user customized it)", () => {
    expect(isUntouchedMint(book({ id: "book_a", color: "#334155" }))).toBe(false);
  });

  it("is false when includeInPersonalNetWorth was toggled off", () => {
    expect(isUntouchedMint(book({ id: "book_a", includeInPersonalNetWorth: false }))).toBe(false);
  });

  it("is false when includeInFireMetrics was toggled off", () => {
    expect(isUntouchedMint(book({ id: "book_a", includeInFireMetrics: false }))).toBe(false);
  });

  it("is false for a company book even with otherwise-default fields", () => {
    expect(isUntouchedMint(book({ id: "book_a", kind: "company" }))).toBe(false);
  });

  it("is false once tombstoned", () => {
    expect(isUntouchedMint(book({ id: "book_a", deletedAt: "2026-01-01T00:00:00.000Z" }))).toBe(false);
  });
});

describe("planMintMerge — decision 2's narrowed domain (untouched mints only)", () => {
  it("returns null for a mint + a customized personal book — decision 2's core case", () => {
    const mint = book({ id: "book_mint" });
    const customized = book({ id: "book_custom", name: "生活帳", revision: 3 });
    expect(planMintMerge([mint, customized])).toBeNull();
  });

  it("never puts a customized book in loserIds, even when it is older than the mint", () => {
    const customizedOlder = book({ id: "book_custom", name: "生活帳", revision: 3, createdAt: "2025-01-01T00:00:00.000Z" });
    const mintNewer = book({ id: "book_mint", createdAt: "2026-01-01T00:00:00.000Z" });
    // Only one mint exists — still no merge, regardless of createdAt ordering.
    expect(planMintMerge([customizedOlder, mintNewer])).toBeNull();
  });

  it("never puts a customized book in loserIds, even when it is newer than the mint, once a second mint exists", () => {
    const customizedNewer = book({ id: "book_custom", name: "生活帳", revision: 5, createdAt: "2026-06-01T00:00:00.000Z" });
    const mintA = book({ id: "book_mint_a", createdAt: "2026-01-01T00:00:00.000Z" });
    const mintB = book({ id: "book_mint_b", createdAt: "2026-02-01T00:00:00.000Z" });
    const plan = planMintMerge([customizedNewer, mintA, mintB]);
    expect(plan).toEqual({ survivorId: "book_mint_a", loserIds: ["book_mint_b"] });
    expect(plan!.loserIds).not.toContain("book_custom");
    expect(plan!.survivorId).not.toBe("book_custom");
  });

  it("revision > 1 exempts a book from the merge domain entirely", () => {
    const editedDuplicate = book({ id: "book_edited", revision: 2 });
    const mint = book({ id: "book_mint" });
    // Only 1 true mint in the set — no merge, even though editedDuplicate looks
    // identical to a mint apart from revision.
    expect(planMintMerge([editedDuplicate, mint])).toBeNull();
  });

  it("non-default name/color/flags exempt a book from the merge domain", () => {
    const renamed = book({ id: "book_renamed", name: "我的帳本" });
    const colored = book({ id: "book_colored", color: "#334155" });
    const flagged = book({ id: "book_flagged", includeInFireMetrics: false });
    const mint = book({ id: "book_mint" });
    expect(planMintMerge([renamed, colored, flagged, mint])).toBeNull();
  });

  it("≥2 mints → the oldest mint survives, exactly like planBookMerge's tiebreak", () => {
    const mintOld = book({ id: "book_mint_old", createdAt: "2026-01-01T00:00:00.000Z" });
    const mintNew = book({ id: "book_mint_new", createdAt: "2026-02-01T00:00:00.000Z" });
    const plan = planMintMerge([mintNew, mintOld]);
    expect(plan).toEqual({ survivorId: "book_mint_old", loserIds: ["book_mint_new"] });
  });

  it("3 mints → oldest survives, the other two are losers", () => {
    const a = book({ id: "book_a", createdAt: "2026-01-01T00:00:00.000Z" });
    const b = book({ id: "book_b", createdAt: "2026-02-01T00:00:00.000Z" });
    const c = book({ id: "book_c", createdAt: "2026-03-01T00:00:00.000Z" });
    const plan = planMintMerge([c, a, b]);
    expect(plan).toEqual({ survivorId: "book_a", loserIds: ["book_b", "book_c"] });
  });
});
