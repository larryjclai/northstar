import { describe, expect, it } from "vitest";
import { buildLedgerLabelStats, buildMerchantMasterList } from "./ledgerLabels";
import type { LedgerTransaction } from "./types";

function row(id: string, overrides: Partial<LedgerTransaction> = {}): LedgerTransaction {
  return {
    id,
    spaceId: "space",
    revision: 1,
    createdAt: "",
    updatedAt: "",
    deletedAt: null,
    accountId: "cash",
    counterAccountId: null,
    date: "2026-06-01",
    name: "計程車",
    amount: -100,
    currency: "TWD",
    originalAmount: null,
    originalCurrency: null,
    category: "交通",
    subcategory: "",
    merchant: "Uber",
    entryType: "expense",
    settlementStatus: "settled",
    note: "",
    linkedInvestmentRecordId: null,
    groupId: null,
    isReviewed: true,
    receiptAttachmentId: null,
    recurringRuleId: null,
    ...overrides,
  };
}

describe("buildLedgerLabelStats", () => {
  it("sorts by count descending", () => {
    const rows = [
      row("1", { merchant: "小半天" }),
      row("2", { merchant: "小半天" }),
      row("3", { merchant: "全家" }),
    ];
    const stats = buildLedgerLabelStats(rows, "merchant");
    expect(stats.map((s) => s.value)).toEqual(["小半天", "全家"]);
    expect(stats[0].count).toBe(2);
    expect(stats[1].count).toBe(1);
  });

  it("breaks ties in count by most-recent lastUsed first", () => {
    const rows = [
      row("1", { merchant: "小半天", date: "2026-01-01" }),
      row("2", { merchant: "全家", date: "2026-06-01" }),
    ];
    const stats = buildLedgerLabelStats(rows, "merchant");
    expect(stats.map((s) => s.value)).toEqual(["全家", "小半天"]);
  });

  it("excludes soft-deleted rows", () => {
    const rows = [
      row("1", { merchant: "小半天" }),
      row("2", { merchant: "已刪除商家", deletedAt: "2026-01-01T00:00:00.000Z" }),
    ];
    const stats = buildLedgerLabelStats(rows, "merchant");
    expect(stats.map((s) => s.value)).toEqual(["小半天"]);
  });

  it("excludes empty / whitespace-only values", () => {
    const rows = [row("1", { merchant: "" }), row("2", { merchant: "   " })];
    const stats = buildLedgerLabelStats(rows, "merchant");
    expect(stats).toEqual([]);
  });

  it("trims whitespace so padded and unpadded values collapse into one entry", () => {
    const rows = [row("1", { merchant: " 全家 " }), row("2", { merchant: "全家" })];
    const stats = buildLedgerLabelStats(rows, "merchant");
    expect(stats).toEqual([{ value: "全家", count: 2, lastUsed: "2026-06-01" }]);
  });

  it("tracks name and merchant fields independently", () => {
    const rows = [row("1", { name: "早餐", merchant: "全家" })];
    const nameStats = buildLedgerLabelStats(rows, "name");
    const merchantStats = buildLedgerLabelStats(rows, "merchant");
    expect(nameStats.map((s) => s.value)).toEqual(["早餐"]);
    expect(merchantStats.map((s) => s.value)).toEqual(["全家"]);
  });
});

describe("buildMerchantMasterList", () => {
  it("includes settings-only merchants with count 0, sorted after used merchants", () => {
    const rows = [row("1", { merchant: "小半天" })];
    const master = buildMerchantMasterList(rows, ["公司", "小半天"]);
    expect(master.map((s) => s.value)).toEqual(["小半天", "公司"]);
    expect(master.find((s) => s.value === "公司")?.count).toBe(0);
    expect(master.find((s) => s.value === "小半天")?.count).toBe(1);
  });

  it("does not duplicate a merchant present in both settings and history", () => {
    const rows = [row("1", { merchant: "全家" }), row("2", { merchant: "全家" })];
    const master = buildMerchantMasterList(rows, ["全家"]);
    expect(master.filter((s) => s.value === "全家")).toHaveLength(1);
    expect(master.find((s) => s.value === "全家")?.count).toBe(2);
  });
});
