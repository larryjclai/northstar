import { describe, expect, it } from "vitest";
import { nextInvoiceNumber, validateInvoiceNumber } from "./invoiceNumbering";

describe("validateInvoiceNumber", () => {
  it("TW_UNIFORM accepts 2 letters + 8 digits", () => {
    expect(validateInvoiceNumber("AB12345678", "TW_UNIFORM")).toBe(true);
  });

  it("TW_UNIFORM rejects lowercase letters", () => {
    expect(validateInvoiceNumber("ab12345678", "TW_UNIFORM")).toBe(false);
  });

  it("TW_UNIFORM rejects the wrong digit count", () => {
    expect(validateInvoiceNumber("AB1234567", "TW_UNIFORM")).toBe(false);
    expect(validateInvoiceNumber("AB123456789", "TW_UNIFORM")).toBe(false);
  });

  it("TW_UNIFORM rejects a single-letter or three-letter prefix", () => {
    expect(validateInvoiceNumber("A12345678", "TW_UNIFORM")).toBe(false);
    expect(validateInvoiceNumber("ABC12345678", "TW_UNIFORM")).toBe(false);
  });

  it("FREE_TEXT accepts anything, including non-ASCII free text", () => {
    expect(validateInvoiceNumber("隨便文字123", "FREE_TEXT")).toBe(true);
    expect(validateInvoiceNumber("", "FREE_TEXT")).toBe(true);
  });
});

describe("nextInvoiceNumber", () => {
  it("TW_UNIFORM increments the numeric part, preserving the prefix", () => {
    expect(nextInvoiceNumber("AB00000001", "TW_UNIFORM")).toEqual({ ok: true, value: "AB00000002" });
  });

  it("TW_UNIFORM pads the incremented numeric part back to 8 digits", () => {
    expect(nextInvoiceNumber("AB00000099", "TW_UNIFORM")).toEqual({ ok: true, value: "AB00000100" });
  });

  it("TW_UNIFORM flags overflow instead of rolling the letter track", () => {
    expect(nextInvoiceNumber("AB99999999", "TW_UNIFORM")).toEqual({ ok: false, value: null, error: "overflow" });
  });

  it("TW_UNIFORM rejects an invalid previous value", () => {
    expect(nextInvoiceNumber("not-a-number", "TW_UNIFORM")).toEqual({ ok: false, value: null, error: "invalid_format" });
  });

  it("FREE_TEXT does not auto-increment — returns the previous value unchanged", () => {
    expect(nextInvoiceNumber("INV-2026-001", "FREE_TEXT")).toEqual({ ok: true, value: "INV-2026-001" });
  });
});
