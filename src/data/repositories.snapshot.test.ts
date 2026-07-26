import { expect, it } from "vitest";
import { describeEachRepo } from "./repositories.testHarness";
import type { BookDraft, ClientDraft, InvoiceDraft } from "./repositories";

// Plan 192 — snapshot export/import round-trip must preserve 帳本 (books),
// invoices, and clients on BOTH repo implementations.
//
// Guards two gaps:
// 1. The 188 regression (SQLite-only, shipped): SQLite's exportSnapshot()
//    silently omitted `books`, while its importSnapshot() unconditionally
//    does `delete from books` then re-inserts from the snapshot. Net effect:
//    a desktop backup → restore wiped every company book (and its 計入淨值/
//    FIRE toggles) even though accounts still pointed at the now-missing
//    book_id. The browser exportSnapshot already included books, which is
//    why existing tests + web usage never caught this.
// 2. The 190 gap: invoices/clients were in neither export path, neither
//    import path, nor the RepositorySnapshot type on EITHER repo — a backup/
//    restore would silently drop every invoice + client (real financial
//    records).
//
// Runs via describeEachRepo so the same assertions exercise both the
// in-memory (browser) twin and the real SQLite repo.

const companyBook: BookDraft = {
  name: "公司帳",
  kind: "company",
  includeInPersonalNetWorth: false,
  includeInFireMetrics: false,
  color: "#334155",
};

function clientDraft(overrides: Partial<ClientDraft> = {}): ClientDraft {
  return {
    bookId: "book_company",
    name: "客戶甲",
    taxId: "12345678",
    defaultPaymentTerms: 30,
    ...overrides,
  };
}

function invoiceDraft(overrides: Partial<InvoiceDraft> = {}): InvoiceDraft {
  return {
    bookId: "book_company",
    clientId: null,
    invoiceNumber: "AB12345678",
    issueDate: "2026-06-01",
    dueDate: "2026-07-01",
    amount: 105_000,
    taxExclusiveAmount: 100_000,
    taxAmount: 5_000,
    linkedLedgerTransactionId: null,
    ...overrides,
  };
}

describeEachRepo("snapshot round-trip (books/invoices/clients)", (makeRepo) => {
  it("export -> import on a fresh repo preserves the company book, its client, and its invoice", async () => {
    const source = await makeRepo();

    await source.createBook(companyBook);
    const company = (await source.listBooks()).find((book) => book.name === "公司帳");
    expect(company).toBeTruthy();

    await source.createClient(clientDraft({ bookId: company!.id }));
    const client = (await source.listClients()).find((c) => c.name === "客戶甲");
    expect(client).toBeTruthy();

    await source.createInvoice(invoiceDraft({ bookId: company!.id, clientId: client!.id }));
    const invoice = (await source.listInvoices()).find((i) => i.invoiceNumber === "AB12345678");
    expect(invoice).toBeTruthy();

    const snapshot = await source.exportSnapshot();

    // A fresh, independent repo — simulating "wipe/reinit a fresh repo" before
    // restoring a backup (the real desktop restore flow: importSnapshot runs
    // against the app's already-initialized repo, replacing its contents).
    const target = await makeRepo();
    await target.importSnapshot(snapshot);

    const restoredCompany = (await target.listBooks()).find((book) => book.name === "公司帳");
    expect(restoredCompany).toBeTruthy();
    expect(restoredCompany!.id).toBe(company!.id);
    expect(restoredCompany!.kind).toBe("company");
    expect(restoredCompany!.includeInPersonalNetWorth).toBe(false);
    expect(restoredCompany!.includeInFireMetrics).toBe(false);
    expect(restoredCompany!.color).toBe("#334155");

    const restoredClient = (await target.listClients()).find((c) => c.name === "客戶甲");
    expect(restoredClient).toBeTruthy();
    expect(restoredClient!.id).toBe(client!.id);
    expect(restoredClient!.bookId).toBe(restoredCompany!.id);
    expect(restoredClient!.taxId).toBe("12345678");
    expect(restoredClient!.defaultPaymentTerms).toBe(30);

    const restoredInvoice = (await target.listInvoices()).find((i) => i.invoiceNumber === "AB12345678");
    expect(restoredInvoice).toBeTruthy();
    expect(restoredInvoice!.id).toBe(invoice!.id);
    expect(restoredInvoice!.bookId).toBe(restoredCompany!.id);
    expect(restoredInvoice!.clientId).toBe(restoredClient!.id);
    expect(restoredInvoice!.issueDate).toBe("2026-06-01");
    expect(restoredInvoice!.dueDate).toBe("2026-07-01");
    expect(restoredInvoice!.amount).toBe(105_000);
    expect(restoredInvoice!.taxExclusiveAmount).toBe(100_000);
    expect(restoredInvoice!.taxAmount).toBe(5_000);
  });

  // Plan 273 — listDailyPriceSeries() narrows the *startup* read to four
  // columns, but exportSnapshot() must keep calling listDailyPrices() (the
  // full row). saveDailyPrices() normalises missing `source`/`updatedAt` to
  // "manual"/now — so if the round trip ever lost those fields, every
  // backup/restore would silently rewrite all price provenance. This guards
  // that the trap plan 273 was designed around never regresses.
  it("export -> import preserves daily price source and updatedAt (guards plan 273's round-trip trap)", async () => {
    const source = await makeRepo();

    await source.saveDailyPrices([
      { ticker: "0050.TW", date: "2026-06-10", close: 195.5, currency: "TWD", source: "twse", updatedAt: "2026-06-10T08:00:00Z" },
    ]);

    const snapshot = await source.exportSnapshot();

    const target = await makeRepo();
    await target.importSnapshot(snapshot);

    const restored = await target.listDailyPrices({ ticker: "0050.TW" });
    expect(restored).toHaveLength(1);
    expect(restored[0].source).toBe("twse");
    expect(restored[0].updatedAt).toBe("2026-06-10T08:00:00Z");
  });
});
