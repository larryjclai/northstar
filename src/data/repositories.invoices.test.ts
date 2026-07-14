import { expect, it } from "vitest";
import { describeEachRepo } from "./repositories.testHarness";
import type { ClientDraft, InvoiceDraft } from "./repositories";

// 發票/客戶 (Invoices/Clients) — plan 190 step 5. Runs against BOTH the
// in-memory twin and the real SQLite repo (describeEachRepo) so the two
// implementations stay in parity, mirroring repositories.books.test.ts
// (plan 188): CRUD + draft round-trip, sync payload, and — the trigger-array
// regression guard — a created invoice/client landing in the
// pending-changes/outbox stream.

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

describeEachRepo("invoices + clients (發票/客戶)", (makeRepo) => {
  it("create + list + update a client, drafts round-tripping every field", async () => {
    const repo = await makeRepo();
    await repo.createClient(clientDraft());

    let clients = await repo.listClients();
    const created = clients.find((client) => client.name === "客戶甲");
    expect(created).toBeTruthy();
    expect(created!.bookId).toBe("book_company");
    expect(created!.taxId).toBe("12345678");
    expect(created!.defaultPaymentTerms).toBe(30);

    await repo.updateClient(created!.id, clientDraft({ name: "客戶甲（改名）", taxId: "", defaultPaymentTerms: null }));
    clients = await repo.listClients();
    const updated = clients.find((client) => client.id === created!.id);
    expect(updated!.name).toBe("客戶甲（改名）");
    expect(updated!.taxId).toBe("");
    expect(updated!.defaultPaymentTerms).toBeNull();
  });

  it("create + list + update an invoice, drafts round-tripping every field, settledAt starting null", async () => {
    const repo = await makeRepo();
    await repo.createClient(clientDraft());
    const client = (await repo.listClients()).find((c) => c.name === "客戶甲")!;

    await repo.createInvoice(invoiceDraft({ clientId: client.id }));
    let invoices = await repo.listInvoices();
    const created = invoices.find((invoice) => invoice.invoiceNumber === "AB12345678");
    expect(created).toBeTruthy();
    expect(created!.bookId).toBe("book_company");
    expect(created!.clientId).toBe(client.id);
    expect(created!.issueDate).toBe("2026-06-01");
    expect(created!.dueDate).toBe("2026-07-01");
    expect(created!.amount).toBe(105_000);
    expect(created!.taxExclusiveAmount).toBe(100_000);
    expect(created!.taxAmount).toBe(5_000);
    expect(created!.linkedLedgerTransactionId).toBeNull();
    // A newly created invoice always starts unsettled.
    expect(created!.settledAt).toBeNull();

    await repo.updateInvoice(created!.id, invoiceDraft({ clientId: null, invoiceNumber: "AB12345679", amount: 210_000, taxExclusiveAmount: 200_000, taxAmount: 10_000 }));
    invoices = await repo.listInvoices();
    const updated = invoices.find((invoice) => invoice.id === created!.id);
    expect(updated!.invoiceNumber).toBe("AB12345679");
    expect(updated!.clientId).toBeNull();
    expect(updated!.amount).toBe(210_000);
    expect(updated!.taxExclusiveAmount).toBe(200_000);
    expect(updated!.taxAmount).toBe(10_000);
    // update does not touch settledAt.
    expect(updated!.settledAt).toBeNull();
  });

  it("stampInvoiceSettled sets and clears settledAt on the invoice matching linkedLedgerTransactionId", async () => {
    const repo = await makeRepo();
    await repo.createInvoice(invoiceDraft({ linkedLedgerTransactionId: "ledger_abc" }));
    const invoice = (await repo.listInvoices()).find((row) => row.linkedLedgerTransactionId === "ledger_abc")!;
    expect(invoice.settledAt).toBeNull();

    await repo.stampInvoiceSettled("ledger_abc", "2026-07-15T00:00:00.000Z");
    let refreshed = (await repo.listInvoices()).find((row) => row.id === invoice.id)!;
    expect(refreshed.settledAt).toBe("2026-07-15T00:00:00.000Z");

    // Revert: clearing settledAt back to null (settle reverted).
    await repo.stampInvoiceSettled("ledger_abc", null);
    refreshed = (await repo.listInvoices()).find((row) => row.id === invoice.id)!;
    expect(refreshed.settledAt).toBeNull();
  });

  it("stampInvoiceSettled is a no-op when no invoice links to the given ledger id", async () => {
    const repo = await makeRepo();
    await repo.createInvoice(invoiceDraft({ linkedLedgerTransactionId: "ledger_abc" }));
    // Should not throw, and should not touch the unrelated invoice.
    await repo.stampInvoiceSettled("ledger_does_not_exist", "2026-07-15T00:00:00.000Z");
    const invoice = (await repo.listInvoices()).find((row) => row.linkedLedgerTransactionId === "ledger_abc")!;
    expect(invoice.settledAt).toBeNull();
  });

  it("findInvoiceByLedgerId resolves the linked invoice, and null when there is none", async () => {
    const repo = await makeRepo();
    await repo.createInvoice(invoiceDraft({ linkedLedgerTransactionId: "ledger_xyz" }));
    const found = await repo.findInvoiceByLedgerId("ledger_xyz");
    expect(found).toBeTruthy();
    expect(found!.linkedLedgerTransactionId).toBe("ledger_xyz");

    const missing = await repo.findInvoiceByLedgerId("ledger_nonexistent");
    expect(missing).toBeNull();
  });

  it("getSyncPayload returns an invoice row with revision + updatedAt", async () => {
    const repo = await makeRepo();
    await repo.createInvoice(invoiceDraft());
    const invoice = (await repo.listInvoices())[0];

    const payload = await repo.getSyncPayload("invoice", invoice.id);
    expect(payload).toBeTruthy();
    expect(payload!.id).toBe(invoice.id);
    expect(Number(payload!.revision)).toBeGreaterThanOrEqual(1);
    expect(typeof payload!.updatedAt).toBe("string");
    expect(payload!.invoiceNumber).toBe("AB12345678");
  });

  it("getSyncPayload returns a client row with revision + updatedAt", async () => {
    const repo = await makeRepo();
    await repo.createClient(clientDraft());
    const client = (await repo.listClients())[0];

    const payload = await repo.getSyncPayload("client", client.id);
    expect(payload).toBeTruthy();
    expect(payload!.id).toBe(client.id);
    expect(Number(payload!.revision)).toBeGreaterThanOrEqual(1);
    expect(typeof payload!.updatedAt).toBe("string");
    expect(payload!.name).toBe("客戶甲");
  });

  it("a created invoice enters the pending-changes/outbox stream as entity invoice", async () => {
    const repo = await makeRepo();
    await repo.createInvoice(invoiceDraft());
    const invoice = (await repo.listInvoices())[0];

    const pending = await repo.collectPendingChanges(null);
    const invoiceChanges = pending.changes.filter((change) => change.entity === "invoice");
    expect(invoiceChanges.some((change) => change.entityId === invoice.id)).toBe(true);
  });

  it("a created client enters the pending-changes/outbox stream as entity client", async () => {
    const repo = await makeRepo();
    await repo.createClient(clientDraft());
    const client = (await repo.listClients())[0];

    const pending = await repo.collectPendingChanges(null);
    const clientChanges = pending.changes.filter((change) => change.entity === "client");
    expect(clientChanges.some((change) => change.entityId === client.id)).toBe(true);
  });
});
