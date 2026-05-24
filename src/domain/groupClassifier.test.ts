import { describe, expect, it } from "vitest";
import { seedLedgerTransactions } from "../data/seed";
import { classifyLedgerGroup } from "./groupClassifier";
import type { LedgerTransaction } from "./types";

const base = seedLedgerTransactions[0];

describe("ledger group classifier", () => {
  it("classifies a single row as singleton", () => {
    expect(classifyLedgerGroup([base])).toBe("singleton");
  });

  it("classifies sibling rows in one account as split", () => {
    const rows: LedgerTransaction[] = [
      { ...base, id: "a", groupId: "g", amount: -100, category: "餐飲" },
      { ...base, id: "b", groupId: "g", amount: -50, category: "交通" },
    ];
    expect(classifyLedgerGroup(rows)).toBe("split");
  });

  it("classifies two signed rows across accounts as transfer", () => {
    const rows: LedgerTransaction[] = [
      { ...base, id: "a", groupId: "g", accountId: "source", amount: -100 },
      { ...base, id: "b", groupId: "g", accountId: "dest", amount: 100 },
    ];
    expect(classifyLedgerGroup(rows)).toBe("transfer");
  });
});

