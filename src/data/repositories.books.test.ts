import { expect, it } from "vitest";
import { describeEachRepo } from "./repositories.testHarness";
import type { AccountDraft, BookDraft, FinanceRepository } from "./repositories";

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
});
