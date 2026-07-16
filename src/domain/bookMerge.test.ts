import { describe, expect, it } from "vitest";
import { planBookMerge } from "./bookMerge";
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
