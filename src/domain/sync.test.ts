import { describe, expect, it } from "vitest";
import { buildPendingChanges } from "./sync";

function rec(id: string, updatedAt: string, deletedAt: string | null = null, revision = 1) {
  return { id, revision, updatedAt, deletedAt };
}

const source = {
  accounts: [rec("a1", "2026-05-01T00:00:00Z"), rec("a2", "2026-05-10T00:00:00Z")],
  ledgerTransactions: [rec("l1", "2026-05-05T00:00:00Z"), rec("l2", "2026-05-20T00:00:00Z", "2026-05-20T00:00:00Z")],
  portfolioAssets: [],
  investmentRecords: [],
  recurringTransactions: [rec("r1", "2026-04-01T00:00:00Z")],
  financialGoals: [rec("g1", "2026-05-15T00:00:00Z")],
};

describe("buildPendingChanges", () => {
  it("returns everything when there is no cursor, oldest-first", () => {
    const res = buildPendingChanges(source, null);
    expect(res.count).toBe(6);
    expect(res.changes.map((c) => c.entityId)).toEqual(["r1", "a1", "l1", "a2", "g1", "l2"]);
    expect(res.nextCursor).toBe("2026-05-20T00:00:00Z");
  });

  it("returns only changes strictly after the cursor", () => {
    const res = buildPendingChanges(source, "2026-05-10T00:00:00Z");
    expect(res.changes.map((c) => c.entityId)).toEqual(["g1", "l2"]);
    expect(res.count).toBe(2);
  });

  it("flags soft-deleted records as deleted", () => {
    const res = buildPendingChanges(source, "2026-05-15T00:00:00Z");
    expect(res.changes).toEqual([
      { entity: "ledger", entityId: "l2", revision: 1, updatedAt: "2026-05-20T00:00:00Z", deleted: true },
    ]);
  });

  it("keeps the cursor when nothing changed", () => {
    const res = buildPendingChanges(source, "2026-12-31T00:00:00Z");
    expect(res.count).toBe(0);
    expect(res.nextCursor).toBe("2026-12-31T00:00:00Z");
  });
});
