import { describe, expect, it } from "vitest";
import { buildInvoiceDrafts, defaultInvoiceDueDate, type InvoiceEntryForm } from "./invoiceEntry";

function baseForm(overrides: Partial<InvoiceEntryForm> = {}): InvoiceEntryForm {
  return {
    bookId: "book-1",
    clientId: "client-1",
    clientName: "ABC 公司",
    invoiceNumber: "AB12345678",
    invoiceNumberPreset: "TW_UNIFORM",
    issueDate: "2026-07-14T10:00",
    dueDate: null,
    taxInclusiveTotal: 105_000,
    currency: "TWD",
    category: "收入",
    subcategory: "",
    note: "",
    ...overrides,
  };
}

describe("buildInvoiceDrafts", () => {
  it("splits 含稅 105,000 into invoice {未稅 100,000, 稅 5,000} while the ledger row keeps the 含稅 total", () => {
    const { ledger, invoice } = buildInvoiceDrafts(baseForm());
    expect(invoice.taxExclusiveAmount).toBe(100_000);
    expect(invoice.taxAmount).toBe(5_000);
    expect(invoice.amount).toBe(105_000);
    expect(ledger.amount).toBe(105_000);
  });

  it("marks the ledger row as an ar 應收 receivable income row", () => {
    const { ledger } = buildInvoiceDrafts(baseForm());
    expect(ledger.entryType).toBe("income");
    expect(ledger.settlementStatus).toBe("receivable");
    // Receivable rows defer the account to settle time, per the existing ar flow.
    expect(ledger.accountId).toBe("");
  });

  it("carries the client name onto the ledger row's name/merchant", () => {
    const { ledger } = buildInvoiceDrafts(baseForm({ clientName: "  ABC 公司  " }));
    expect(ledger.name).toBe("ABC 公司");
    expect(ledger.merchant).toBe("ABC 公司");
  });

  it("passes bookId/clientId/invoiceNumber/dates through to the invoice draft", () => {
    const { invoice } = buildInvoiceDrafts(baseForm({ dueDate: "2026-08-13" }));
    expect(invoice.bookId).toBe("book-1");
    expect(invoice.clientId).toBe("client-1");
    expect(invoice.invoiceNumber).toBe("AB12345678");
    expect(invoice.issueDate).toBe("2026-07-14T10:00");
    expect(invoice.dueDate).toBe("2026-08-13");
  });

  it("throws a validation error for a TW-format number failing the preset", () => {
    expect(() => buildInvoiceDrafts(baseForm({ invoiceNumber: "not-a-real-number" }))).toThrow(
      /發票號碼格式錯誤/,
    );
  });

  it("throws for a blank invoice number", () => {
    expect(() => buildInvoiceDrafts(baseForm({ invoiceNumber: "  " }))).toThrow(/請輸入發票號碼/);
  });

  it("accepts any non-empty string under the FREE_TEXT preset", () => {
    expect(() =>
      buildInvoiceDrafts(
        baseForm({ invoiceNumber: "INV-2026-001", invoiceNumberPreset: "FREE_TEXT" }),
      ),
    ).not.toThrow();
  });

  it("throws for a non-positive total", () => {
    expect(() => buildInvoiceDrafts(baseForm({ taxInclusiveTotal: 0 }))).toThrow(/含稅總額/);
    expect(() => buildInvoiceDrafts(baseForm({ taxInclusiveTotal: -100 }))).toThrow(/含稅總額/);
  });
});

describe("defaultInvoiceDueDate", () => {
  it("adds defaultPaymentTerms days to the issue date", () => {
    expect(defaultInvoiceDueDate("2026-07-14", 30)).toBe("2026-08-13");
  });

  it("works from a datetime-local issue date (only the date part matters)", () => {
    expect(defaultInvoiceDueDate("2026-07-14T10:30", 30)).toBe("2026-08-13");
  });

  it("returns null when the client has no default payment terms", () => {
    expect(defaultInvoiceDueDate("2026-07-14", null)).toBeNull();
  });
});
