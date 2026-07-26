// 開發票 entry assembly — plan 191 step 1.
//
// Pure helper that turns one 開發票 form into the two drafts the UI must
// create (in this order — see plan 191 §"Create-ledger-then-invoice
// mutation"): the `ar` receivable ledger row (含稅 total) and the `invoices`
// row (未稅額/稅額 split via `computeSalesTax`). No repository access here —
// the route composes the actual create-ledger-then-create-invoice sequence.

import type { LedgerDraft, InvoiceDraft } from "../data/repositories";
import { computeSalesTax } from "./salesTax";
import { validateInvoiceNumber, type InvoiceNumberPreset } from "./invoiceNumbering";

export interface InvoiceEntryForm {
  bookId: string;
  /** Null when the invoice has no client on file (free-text counterparty only). */
  clientId: string | null;
  /** Client display name — becomes the receivable ledger row's `merchant`/`name`. */
  clientName: string;
  invoiceNumber: string;
  invoiceNumberPreset: InvoiceNumberPreset;
  issueDate: string;
  dueDate: string | null;
  /** 含稅總額 — the receivable ledger row's `amount`. */
  taxInclusiveTotal: number;
  /** 營業稅率, defaults to `computeSalesTax`'s 5%. */
  rate?: number;
  currency: string;
  category: string;
  subcategory: string;
  note: string;
  /** 代墊 counter account — mirrors the plain 應收 drawer's optional field. */
  counterAccountId?: string | null;
}

export interface InvoiceEntryDrafts {
  ledger: LedgerDraft;
  invoice: Omit<InvoiceDraft, "linkedLedgerTransactionId">;
}

/**
 * Assemble the receivable `LedgerDraft` + `InvoiceDraft` (minus the
 * `linkedLedgerTransactionId`, which only exists after the ledger row is
 * created) for one 開發票 entry. Throws on an invalid invoice number or a
 * non-positive total — callers surface the message the same way `submitLedger`
 * does for other entry types.
 */
export function buildInvoiceDrafts(form: InvoiceEntryForm): InvoiceEntryDrafts {
  const invoiceNumber = form.invoiceNumber.trim();
  if (!invoiceNumber) throw new Error("請輸入發票號碼。");
  if (!validateInvoiceNumber(invoiceNumber, form.invoiceNumberPreset)) {
    throw new Error(
      form.invoiceNumberPreset === "TW_UNIFORM"
        ? "發票號碼格式錯誤，統一發票格式為 2 碼英文字軌 + 8 碼數字（例：AB12345678）。"
        : "發票號碼格式錯誤。",
    );
  }
  if (!Number.isFinite(form.taxInclusiveTotal) || form.taxInclusiveTotal <= 0) {
    throw new Error("含稅總額必須大於 0。");
  }

  const { taxExclusive, tax } = computeSalesTax(form.taxInclusiveTotal, form.rate);

  const ledger: LedgerDraft = {
    accountId: "",
    counterAccountId: form.counterAccountId ?? null,
    date: form.issueDate,
    name: form.clientName.trim(),
    amount: form.taxInclusiveTotal,
    currency: form.currency,
    category: form.category,
    subcategory: form.subcategory,
    merchant: form.clientName.trim(),
    entryType: "income",
    settlementStatus: "receivable",
    note: form.note,
  };

  const invoice: Omit<InvoiceDraft, "linkedLedgerTransactionId"> = {
    bookId: form.bookId,
    clientId: form.clientId,
    invoiceNumber,
    issueDate: form.issueDate,
    dueDate: form.dueDate,
    amount: form.taxInclusiveTotal,
    taxExclusiveAmount: taxExclusive,
    taxAmount: tax,
  };

  return { ledger, invoice };
}

/**
 * Default 到期日 (dueDate) for a new invoice: `issueDate + defaultPaymentTerms`
 * days when the client has payment terms on file, else null (operator picks
 * one manually). `issueDate` may be a plain date (`YYYY-MM-DD`) or a
 * datetime-local string (`YYYY-MM-DDTHH:mm`) — only the date portion matters.
 */
export function defaultInvoiceDueDate(
  issueDate: string,
  defaultPaymentTerms: number | null,
): string | null {
  if (defaultPaymentTerms === null || !Number.isFinite(defaultPaymentTerms)) return null;
  const datePart = issueDate.slice(0, 10);
  const parsed = new Date(`${datePart}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setDate(parsed.getDate() + defaultPaymentTerms);
  // Format from local date components, not toISOString() — that converts to
  // UTC first, which can shift the date by a day depending on the runtime's
  // timezone offset (e.g. GMT+8 midnight → previous day in UTC).
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
