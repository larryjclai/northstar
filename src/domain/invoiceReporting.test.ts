import { describe, expect, it } from "vitest";
import {
  agingBuckets,
  bimonthly401Summary,
  daysSalesOutstanding,
  outstandingSalesTax,
} from "./invoiceReporting";
import type { Invoice } from "./types";

const TODAY = "2026-07-14"; // Tuesday, bimonthly period 7-8月 (docs/ledger-books-plan.md §3)

function invoice(overrides: Partial<Invoice> & Pick<Invoice, "id">): Invoice {
  const base: Invoice = {
    id: overrides.id,
    bookId: "book-company",
    clientId: null,
    invoiceNumber: "AB00000000",
    issueDate: "2026-07-01",
    dueDate: null,
    amount: 105_000,
    taxExclusiveAmount: 100_000,
    taxAmount: 5_000,
    settledAt: null,
    linkedLedgerTransactionId: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    deletedAt: null,
    revision: 1,
  } as unknown as Invoice;
  return { ...base, ...overrides };
}

describe("agingBuckets", () => {
  it("buckets an unpaid invoice 45 days past due into d31_60 (the 31–60 day range)", () => {
    // dueDate 45 days before TODAY.
    const rows = agingBuckets(
      [invoice({ id: "i1", dueDate: "2026-05-30", amount: 12_000 })],
      TODAY,
    );
    const d31_60 = rows.find((r) => r.bucket === "d31_60")!;
    expect(d31_60.count).toBe(1);
    expect(d31_60.total).toBe(12_000);
    // Every other bucket stays empty.
    for (const r of rows) {
      if (r.bucket !== "d31_60") expect(r.count).toBe(0);
    }
  });

  it("buckets an invoice 15 days overdue into d1_30 — flagged as overdue, NOT notDue (the regression this scheme prevents)", () => {
    // dueDate 15 days before TODAY (2026-06-29 → 2026-07-14 = 15 days).
    const rows = agingBuckets([invoice({ id: "i1", dueDate: "2026-06-29", amount: 9_000 })], TODAY);
    const d1_30 = rows.find((r) => r.bucket === "d1_30")!;
    expect(d1_30.count).toBe(1);
    expect(d1_30.total).toBe(9_000);
    // A 15-day-overdue invoice must never land in notDue — the bug being fixed.
    expect(rows.find((r) => r.bucket === "notDue")!.count).toBe(0);
  });

  it("excludes a settled invoice from aging entirely", () => {
    const rows = agingBuckets(
      [invoice({ id: "i1", dueDate: "2026-05-30", settledAt: "2026-06-01T00:00:00.000Z" })],
      TODAY,
    );
    for (const r of rows) expect(r.count).toBe(0);
  });

  it("buckets a not-yet-due invoice into notDue", () => {
    const rows = agingBuckets([invoice({ id: "i1", dueDate: "2026-08-01", amount: 5_000 })], TODAY);
    const notDue = rows.find((r) => r.bucket === "notDue")!;
    expect(notDue.count).toBe(1);
    expect(notDue.total).toBe(5_000);
  });

  it("falls back invoices with no dueDate to notDue", () => {
    const rows = agingBuckets([invoice({ id: "i1", dueDate: null, amount: 7_000 })], TODAY);
    const notDue = rows.find((r) => r.bucket === "notDue")!;
    expect(notDue.count).toBe(1);
    expect(notDue.total).toBe(7_000);
  });

  it("always returns all five bucket ids, even when empty", () => {
    const rows = agingBuckets([], TODAY);
    expect(rows.map((r) => r.bucket).sort()).toEqual(
      ["notDue", "d1_30", "d31_60", "d61_90", "over90"].sort(),
    );
  });

  it("buckets a 75-day overdue invoice into d61_90 (61–90 range)", () => {
    const rows = agingBuckets([invoice({ id: "i1", dueDate: "2026-04-30" })], TODAY);
    expect(rows.find((r) => r.bucket === "d61_90")!.count).toBe(1);
  });

  it("buckets a 120-day overdue invoice into over90", () => {
    const rows = agingBuckets([invoice({ id: "i1", dueDate: "2026-03-16" })], TODAY);
    expect(rows.find((r) => r.bucket === "over90")!.count).toBe(1);
  });
});

describe("daysSalesOutstanding", () => {
  it("averages settle-issue day counts (10 and 20 days) to 15", () => {
    const dso = daysSalesOutstanding(
      [
        invoice({ id: "i1", issueDate: "2026-06-01", settledAt: "2026-06-11T00:00:00.000Z" }),
        invoice({ id: "i2", issueDate: "2026-06-01", settledAt: "2026-06-21T00:00:00.000Z" }),
      ],
      { todayIso: TODAY },
    );
    expect(dso).toBe(15);
  });

  it("returns null when nothing has settled", () => {
    const dso = daysSalesOutstanding([invoice({ id: "i1", settledAt: null })], { todayIso: TODAY });
    expect(dso).toBeNull();
  });

  it("excludes a settle that falls outside the trailing window", () => {
    const dso = daysSalesOutstanding(
      [
        invoice({ id: "i1", issueDate: "2024-01-01", settledAt: "2024-01-11T00:00:00.000Z" }), // ~2.5y ago
        invoice({ id: "i2", issueDate: "2026-06-01", settledAt: "2026-06-21T00:00:00.000Z" }), // 20 days, in-window
      ],
      { todayIso: TODAY, windowMonths: 12 },
    );
    expect(dso).toBe(20);
  });
});

describe("outstandingSalesTax", () => {
  it("sums taxAmount for invoices issued in the current bimonthly period", () => {
    const total = outstandingSalesTax(
      [
        invoice({ id: "i1", issueDate: "2026-07-05", taxAmount: 5_000 }),
        invoice({ id: "i2", issueDate: "2026-08-20", taxAmount: 3_000 }),
      ],
      TODAY,
    );
    expect(total).toBe(8_000);
  });

  it("excludes an invoice from a prior period even if unpaid", () => {
    const total = outstandingSalesTax(
      [
        invoice({ id: "i1", issueDate: "2026-05-15", taxAmount: 9_000, settledAt: null }),
        invoice({ id: "i2", issueDate: "2026-07-05", taxAmount: 5_000 }),
      ],
      TODAY,
    );
    expect(total).toBe(5_000);
  });

  it("includes unpaid (unsettled) invoices — issuance-based, not settle-based", () => {
    const total = outstandingSalesTax(
      [invoice({ id: "i1", issueDate: "2026-07-05", taxAmount: 5_000, settledAt: null })],
      TODAY,
    );
    expect(total).toBe(5_000);
  });
});

describe("bimonthly401Summary", () => {
  it("buckets invoices across two periods by issueDate, summing taxExclusive + tax per period", () => {
    const rows = bimonthly401Summary(
      [
        invoice({
          id: "i1",
          issueDate: "2026-03-10",
          taxExclusiveAmount: 100_000,
          taxAmount: 5_000,
        }),
        invoice({
          id: "i2",
          issueDate: "2026-04-20",
          taxExclusiveAmount: 40_000,
          taxAmount: 2_000,
        }),
        invoice({
          id: "i3",
          issueDate: "2026-07-05",
          taxExclusiveAmount: 20_000,
          taxAmount: 1_000,
        }),
      ],
      2026,
    );
    const marchApril = rows.find((r) => r.period === "3-4月")!;
    expect(marchApril.taxableSales).toBe(140_000);
    expect(marchApril.salesTax).toBe(7_000);
    const julyAugust = rows.find((r) => r.period === "7-8月")!;
    expect(julyAugust.taxableSales).toBe(20_000);
    expect(julyAugust.salesTax).toBe(1_000);
  });

  it("excludes invoices from a different year", () => {
    const rows = bimonthly401Summary(
      [invoice({ id: "i1", issueDate: "2025-07-05", taxAmount: 5_000 })],
      2026,
    );
    expect(rows.every((r) => r.salesTax === 0)).toBe(true);
  });

  it("always returns all six periods in calendar order", () => {
    const rows = bimonthly401Summary([], 2026);
    expect(rows.map((r) => r.period)).toEqual([
      "1-2月",
      "3-4月",
      "5-6月",
      "7-8月",
      "9-10月",
      "11-12月",
    ]);
  });
});
