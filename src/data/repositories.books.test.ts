import { expect, it } from "vitest";
import { describeEachRepo } from "./repositories.testHarness";
import type { AccountDraft, BookDraft, ClientDraft, FinanceRepository, InvoiceDraft } from "./repositories";

// 帳本 (Books) Phase 1a — plan 188. Runs against BOTH the in-memory twin and the
// real SQLite repo (describeEachRepo) so the two implementations stay in parity:
// default-book guarantee, boolean 0/1 hydration, book_id plumbing, sync payload,
// and — the trigger-array regression guard — the created book landing in the
// pending-changes/outbox stream.

function accountDraft(overrides: Partial<AccountDraft> = {}): AccountDraft {
  return {
    name: "測試帳戶",
    currency: "TWD",
    openingBalance: 0,
    type: "cash",
    creditLimit: null,
    creditLimitGroup: "",
    statementDay: null,
    paymentDueDay: null,
    creditPaymentPaidUntil: null,
    isSharedToHousehold: false,
    loanStartDate: null,
    annualInterestRate: null,
    loanTerm: null,
    iconName: null,
    color: null,
    bankBrandDomain: null,
    ...overrides,
  };
}

const companyDraft: BookDraft = {
  name: "公司帳",
  kind: "company",
  includeInPersonalNetWorth: false,
  includeInFireMetrics: false,
  color: "#334155",
};

async function defaultBook(repo: FinanceRepository) {
  const books = await repo.listBooks();
  const personal = books.find((book) => book.name === "個人帳" && book.kind === "personal");
  if (!personal) throw new Error("expected a default 個人帳 book");
  return personal;
}

describeEachRepo("books (帳本)", (makeRepo) => {
  it("guarantees a default 個人帳 book with both toggles on", async () => {
    const repo = await makeRepo();
    const personal = await defaultBook(repo);
    expect(personal.kind).toBe("personal");
    expect(personal.includeInPersonalNetWorth).toBe(true);
    expect(personal.includeInFireMetrics).toBe(true);
  });

  it("create + list + update a book, with booleans surviving SQLite 0/1 hydration", async () => {
    const repo = await makeRepo();
    await repo.createBook(companyDraft);

    let books = await repo.listBooks();
    const company = books.find((book) => book.name === "公司帳");
    expect(company).toBeTruthy();
    expect(company!.kind).toBe("company");
    // Booleans, not integers — the SQLite harness would return 0/1 without hydration.
    expect(company!.includeInPersonalNetWorth).toBe(false);
    expect(company!.includeInFireMetrics).toBe(false);
    expect(typeof company!.includeInPersonalNetWorth).toBe("boolean");
    expect(company!.color).toBe("#334155");

    await repo.updateBook(company!.id, {
      name: "公司帳（改）",
      kind: "company",
      includeInPersonalNetWorth: true,
      includeInFireMetrics: false,
      color: null,
    });
    books = await repo.listBooks();
    const updated = books.find((book) => book.id === company!.id);
    expect(updated!.name).toBe("公司帳（改）");
    expect(updated!.includeInPersonalNetWorth).toBe(true);
    expect(updated!.includeInFireMetrics).toBe(false);
    expect(updated!.color).toBeNull();
  });

  it("an account created without a bookId lands in the default 個人帳", async () => {
    const repo = await makeRepo();
    const personal = await defaultBook(repo);

    await repo.createAccount(accountDraft({ name: "無帳本帳戶" }));
    const accounts = await repo.listAccounts();
    const created = accounts.find((account) => account.name === "無帳本帳戶");
    expect(created).toBeTruthy();
    expect(created!.bookId).toBe(personal.id);
  });

  it("an account carries an explicit bookId through create and update", async () => {
    const repo = await makeRepo();
    await repo.createBook(companyDraft);
    const company = (await repo.listBooks()).find((book) => book.name === "公司帳")!;

    await repo.createAccount(accountDraft({ name: "公司現金", bookId: company.id }));
    let account = (await repo.listAccounts()).find((a) => a.name === "公司現金")!;
    expect(account.bookId).toBe(company.id);

    const personal = await defaultBook(repo);
    await repo.updateAccount(account.id, accountDraft({ name: "公司現金", bookId: personal.id }));
    account = (await repo.listAccounts()).find((a) => a.name === "公司現金")!;
    expect(account.bookId).toBe(personal.id);
  });

  it("getSyncPayload returns a book row with revision + hydrated booleans", async () => {
    const repo = await makeRepo();
    await repo.createBook(companyDraft);
    const company = (await repo.listBooks()).find((book) => book.name === "公司帳")!;

    const payload = await repo.getSyncPayload("book", company.id);
    expect(payload).toBeTruthy();
    expect(payload!.id).toBe(company.id);
    expect(Number(payload!.revision)).toBeGreaterThanOrEqual(1);
    expect(typeof payload!.updatedAt).toBe("string");
    expect(typeof payload!.includeInPersonalNetWorth).toBe("boolean");
    expect(payload!.includeInFireMetrics).toBe(false);
  });

  it("a created book enters the pending-changes/outbox stream as entity book", async () => {
    const repo = await makeRepo();
    await repo.createBook(companyDraft);
    const company = (await repo.listBooks()).find((book) => book.name === "公司帳")!;

    const pending = await repo.collectPendingChanges(null);
    const bookChanges = pending.changes.filter((change) => change.entity === "book");
    // At least the default 個人帳 + the new 公司帳; the new one must be present.
    expect(bookChanges.some((change) => change.entityId === company.id)).toBe(true);
  });

  it("deleteBook soft-deletes: vanishes from listBooks, direct read shows deletedAt + bumped revision", async () => {
    const repo = await makeRepo();
    await repo.createBook(companyDraft);
    const company = (await repo.listBooks()).find((book) => book.name === "公司帳")!;
    expect(company.revision).toBe(1);

    await repo.deleteBook(company.id);

    const books = await repo.listBooks();
    expect(books.some((book) => book.id === company.id)).toBe(false);

    const payload = await repo.getSyncPayload("book", company.id);
    expect(payload).toBeTruthy();
    expect(payload!.deletedAt).not.toBeNull();
    expect(Number(payload!.revision)).toBeGreaterThan(1);
  });

  // The trigger-array regression guard, mirrored for delete (see the file
  // header): a hard `delete from books` would fire no outbox trigger (it only
  // fires `when new.revision <> old.revision`), so the tombstone would never
  // sync and the book would resurrect from the other device's next pull. This
  // test is what proves the delete is an `update ... set deleted_at = …,
  // revision = revision + 1`, not a hard delete.
  it("the tombstone reaches the outbox after deleteBook", async () => {
    const repo = await makeRepo();
    await repo.createBook(companyDraft);
    const company = (await repo.listBooks()).find((book) => book.name === "公司帳")!;

    await repo.deleteBook(company.id);

    // The SQLite harness's outbox is an append-only log — it can still hold
    // the earlier create-revision-1 row alongside the delete-revision-2 row
    // (both unacknowledged), so filter for entityId and assert a tombstoned
    // entry exists, rather than assuming a single/last entry.
    const pending = await repo.collectPendingChanges(null);
    const bookChanges = pending.changes.filter((change) => change.entity === "book" && change.entityId === company.id);
    const deleteChange = bookChanges.find((change) => change.deleted);
    expect(deleteChange).toBeTruthy();
    expect(deleteChange!.revision).toBeGreaterThan(1);
  });

  it("refuses to delete a book that still has accounts", async () => {
    const repo = await makeRepo();
    await repo.createBook(companyDraft);
    const company = (await repo.listBooks()).find((book) => book.name === "公司帳")!;
    await repo.createAccount(accountDraft({ name: "公司現金", bookId: company.id }));

    await expect(repo.deleteBook(company.id)).rejects.toThrow("此帳本還有 1 個帳戶，請先將它們移到其他帳本。");

    // Refused, not cascaded — the book and its account are both still there.
    const books = await repo.listBooks();
    expect(books.some((book) => book.id === company.id)).toBe(true);
  });

  it("refuses to delete the last personal book", async () => {
    const repo = await makeRepo();
    const personal = await defaultBook(repo);

    await expect(repo.deleteBook(personal.id)).rejects.toThrow("這是最後一個個人帳本，不能刪除。");

    const books = await repo.listBooks();
    expect(books.some((book) => book.id === personal.id)).toBe(true);
  });

  it("deleting a book with 0 accounts succeeds (the operator's duplicate-個人帳 case)", async () => {
    const repo = await makeRepo();
    // Simulate the duplicate-default-book bug this plan is an escape hatch
    // for: a second book with kind "personal", with no accounts in it.
    await repo.createBook({
      name: "個人帳",
      kind: "personal",
      includeInPersonalNetWorth: true,
      includeInFireMetrics: true,
      color: null,
    });
    const books = await repo.listBooks();
    const personalBooks = books.filter((book) => book.kind === "personal");
    expect(personalBooks.length).toBe(2);
    const [original, extra] = personalBooks;

    await repo.deleteBook(extra.id);

    const remaining = await repo.listBooks();
    expect(remaining.some((book) => book.id === extra.id)).toBe(false);
    expect(remaining.some((book) => book.id === original.id)).toBe(true);
  });

  it("refuses to delete a book that still has invoices", async () => {
    const repo = await makeRepo();
    await repo.createBook(companyDraft);
    const company = (await repo.listBooks()).find((book) => book.name === "公司帳")!;
    const invoiceDraft: InvoiceDraft = {
      bookId: company.id,
      clientId: null,
      invoiceNumber: "AB12345678",
      issueDate: "2026-06-01",
      dueDate: "2026-07-01",
      amount: 105_000,
      taxExclusiveAmount: 100_000,
      taxAmount: 5_000,
      linkedLedgerTransactionId: null,
    };
    await repo.createInvoice(invoiceDraft);

    await expect(repo.deleteBook(company.id)).rejects.toThrow("此帳本還有發票或客戶資料，不能刪除。");
  });

  it("refuses to delete a book that still has clients", async () => {
    const repo = await makeRepo();
    await repo.createBook(companyDraft);
    const company = (await repo.listBooks()).find((book) => book.name === "公司帳")!;
    const clientDraft: ClientDraft = {
      bookId: company.id,
      name: "客戶甲",
      taxId: "12345678",
      defaultPaymentTerms: 30,
    };
    await repo.createClient(clientDraft);

    await expect(repo.deleteBook(company.id)).rejects.toThrow("此帳本還有發票或客戶資料，不能刪除。");
  });
});
