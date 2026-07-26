import { expect, it } from "vitest";
import { describeEachRepo } from "./repositories.testHarness";
import type {
  AccountDraft,
  BookDraft,
  ClientDraft,
  FinanceRepository,
  InvoiceDraft,
} from "./repositories";

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

// Plan 211 — trigger the merge+heal routine via the SAME call site under the
// closest scrutiny (applySyncChanges, "outside withOutboxSuppressed" — the
// plan's #1 trap). Re-applies an existing book's own current, unchanged sync
// payload: a legitimate "a pull applied a change" simulation with zero actual
// content change, purely to invoke the post-apply hook symmetrically on both
// harnesses (the in-memory twin has no separate initialize()-reentry path that
// wouldn't also blow away seeded test data — see loadDataForTests).
async function triggerMergeCycle(repo: FinanceRepository) {
  const [anyBook] = await repo.listBooks();
  const payload = await repo.getSyncPayload("book", anyBook.id);
  await repo.applySyncChanges([{ entity: "book", payload: payload! }]);
}

// Deterministic (createdAt, then id) order — the exact rule planMintMerge
// uses. Tests use this only to know WHICH of two mints they created should
// win, so assertions aren't tied to insertion order; the rule itself is
// covered independently by bookMerge.test.ts's tiebreak tests.
function byMergeOrder<T extends { createdAt: string; id: string }>(a: T, b: T): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : 1;
}

const mintDraft: BookDraft = {
  name: "個人帳",
  kind: "personal",
  includeInPersonalNetWorth: true,
  includeInFireMetrics: true,
  color: null,
};

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
    const bookChanges = pending.changes.filter(
      (change) => change.entity === "book" && change.entityId === company.id,
    );
    const deleteChange = bookChanges.find((change) => change.deleted);
    expect(deleteChange).toBeTruthy();
    expect(deleteChange!.revision).toBeGreaterThan(1);
  });

  it("refuses to delete a book that still has accounts", async () => {
    const repo = await makeRepo();
    await repo.createBook(companyDraft);
    const company = (await repo.listBooks()).find((book) => book.name === "公司帳")!;
    await repo.createAccount(accountDraft({ name: "公司現金", bookId: company.id }));

    await expect(repo.deleteBook(company.id)).rejects.toThrow(
      "此帳本還有 1 個帳戶，請先將它們移到其他帳本。",
    );

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

    await expect(repo.deleteBook(company.id)).rejects.toThrow(
      "此帳本還有發票或客戶資料，不能刪除。",
    );
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

    await expect(repo.deleteBook(company.id)).rejects.toThrow(
      "此帳本還有發票或客戶資料，不能刪除。",
    );
  });

  // Plan 211 — default-帳本 convergence: merge untouched system-minted
  // duplicates on pull, announce, and the kind-aware straggler self-heal.
  // See plans/211-default-book-merge-build.md and the design record it
  // builds on (docs/default-book-convergence-spike.md, plans/207-*.md).
  it("merges two untouched mints: the oldest survives, the loser is tombstoned with a bumped revision, and its account re-points to the survivor", async () => {
    const repo = await makeRepo();
    await repo.createBook(mintDraft);
    const mints = (await repo.listBooks()).filter((book) => book.kind === "personal");
    expect(mints.length).toBe(2);
    const [survivor, loser] = [...mints].sort(byMergeOrder);

    await repo.createAccount(accountDraft({ name: "帳戶A", bookId: loser.id }));

    await triggerMergeCycle(repo);

    const remaining = await repo.listBooks();
    expect(remaining.some((book) => book.id === survivor.id)).toBe(true);
    expect(remaining.some((book) => book.id === loser.id)).toBe(false);

    const tombstoned = await repo.getSyncPayload("book", loser.id);
    expect(tombstoned!.deletedAt).not.toBeNull();
    expect(Number(tombstoned!.revision)).toBeGreaterThan(1);

    const account = (await repo.listAccounts()).find((a) => a.name === "帳戶A")!;
    expect(account.bookId).toBe(survivor.id);
  });

  // The load-bearing test: proves the merge's writes actually reach the
  // outbox/pending-changes stream, not just the local tables. A regression
  // that moved the merge call back inside withOutboxSuppressed (the plan's
  // #1 trap) would pass every OTHER test in this file while failing only
  // this one — the tombstone and re-point would apply locally but never
  // propagate, and another device would never converge.
  it("the merge's tombstone AND its re-pointed account both reach the outbox at their bumped revision (proves the merge runs outside withOutboxSuppressed)", async () => {
    const repo = await makeRepo();
    await repo.createBook(mintDraft);
    const mints = (await repo.listBooks()).filter((book) => book.kind === "personal");
    const [survivor, loser] = [...mints].sort(byMergeOrder);

    await repo.createAccount(accountDraft({ name: "帳戶A", bookId: loser.id }));
    const accountBefore = (await repo.listAccounts()).find((a) => a.name === "帳戶A")!;

    await triggerMergeCycle(repo);

    const accountAfter = (await repo.listAccounts()).find((a) => a.id === accountBefore.id)!;
    expect(accountAfter.bookId).toBe(survivor.id);
    expect(accountAfter.revision).toBeGreaterThan(accountBefore.revision);

    const pending = await repo.collectPendingChanges(null);
    const tombstoneChange = pending.changes.find(
      (change) => change.entity === "book" && change.entityId === loser.id && change.deleted,
    );
    expect(tombstoneChange).toBeTruthy();
    expect(tombstoneChange!.revision).toBeGreaterThan(1);

    const accountChange = pending.changes.find(
      (change) =>
        change.entity === "account" &&
        change.entityId === accountBefore.id &&
        change.revision === accountAfter.revision,
    );
    expect(accountChange).toBeTruthy();
  });

  // Decision 2's core safety property: a book the user has ever edited
  // (revision > 1) is NEVER an auto-merge candidate, even sitting right
  // alongside an untouched mint. Under ANY input, a customized book must
  // never appear in loserIds and must never be silently discarded.
  it("a mint alongside a user-edited personal book (revision > 1) never merges — decision 2", async () => {
    const repo = await makeRepo();
    const original = await defaultBook(repo);
    await repo.createBook(mintDraft);
    const created = (await repo.listBooks()).find(
      (book) => book.kind === "personal" && book.id !== original.id,
    )!;
    // Simulate a user edit — bumps revision to 2, taking it out of the mint domain.
    await repo.updateBook(created.id, { ...mintDraft, name: "生活帳" });

    await triggerMergeCycle(repo);

    const after = await repo.listBooks();
    const personalBooks = after.filter((book) => book.kind === "personal");
    expect(personalBooks.length).toBe(2); // still both — no merge happened
    expect(personalBooks.some((book) => book.id === created.id)).toBe(true);
    expect(personalBooks.some((book) => book.id === original.id)).toBe(true);
  });

  it("straggler heal (personal): an account pointing at a tombstoned personal book re-homes to the default, with a bumped revision", async () => {
    const repo = await makeRepo();
    await repo.createBook({
      name: "生活帳",
      kind: "personal",
      includeInPersonalNetWorth: true,
      includeInFireMetrics: true,
      color: "#123456",
    });
    const lifeBook = (await repo.listBooks()).find((book) => book.name === "生活帳")!;
    await repo.createAccount(accountDraft({ name: "生活帳戶", bookId: lifeBook.id }));
    const accountBefore = (await repo.listAccounts()).find((a) => a.name === "生活帳戶")!;

    // Simulate the tombstone arriving (by any means — another device's
    // deleteBook, or a race) while this device's account row still points at
    // it — the exact straggler the 207 spike's §3(c) found.
    const tombstonePayload = await repo.getSyncPayload("book", lifeBook.id);
    await repo.applySyncChanges([
      {
        entity: "book",
        payload: {
          ...tombstonePayload,
          deletedAt: new Date().toISOString(),
          revision: Number(tombstonePayload!.revision) + 1,
        },
      },
    ]);

    const defaultBookRow = await defaultBook(repo);
    const healed = (await repo.listAccounts()).find((a) => a.id === accountBefore.id)!;
    expect(healed.bookId).toBe(defaultBookRow.id);
    expect(healed.revision).toBeGreaterThan(accountBefore.revision);

    // Personal books never resurrect — the book stays dead.
    const books = await repo.listBooks();
    expect(books.some((book) => book.id === lifeBook.id)).toBe(false);
  });

  it("straggler heal (company): an account pointing at a tombstoned company book resurrects the book; the account itself is untouched", async () => {
    const repo = await makeRepo();
    await repo.createBook(companyDraft);
    const company = (await repo.listBooks()).find((book) => book.name === "公司帳")!;
    await repo.createAccount(accountDraft({ name: "公司現金", bookId: company.id }));
    const accountBefore = (await repo.listAccounts()).find((a) => a.name === "公司現金")!;

    const tombstonePayload = await repo.getSyncPayload("book", company.id);
    const tombstoneRevision = Number(tombstonePayload!.revision) + 1;
    await repo.applySyncChanges([
      {
        entity: "book",
        payload: {
          ...tombstonePayload,
          deletedAt: new Date().toISOString(),
          revision: tombstoneRevision,
        },
      },
    ]);

    const resurrected = (await repo.listBooks()).find((book) => book.id === company.id);
    expect(resurrected).toBeTruthy();
    expect(resurrected!.deletedAt).toBeNull();
    expect(resurrected!.revision).toBeGreaterThan(tombstoneRevision);

    // The account was never re-homed or touched — resurrection, not rehoming,
    // is what keeps a company account's KPI scoping exactly as the user set.
    const untouched = (await repo.listAccounts()).find((a) => a.id === accountBefore.id)!;
    expect(untouched.bookId).toBe(company.id);
    expect(untouched.revision).toBe(accountBefore.revision);
  });

  it("straggler heal (unknown id): an account pointing at a book id this device has never seen re-homes to the default", async () => {
    const repo = await makeRepo();
    await repo.createAccount(
      accountDraft({ name: "幽靈帳本帳戶", bookId: "book_ghost_never_synced" }),
    );
    const accountBefore = (await repo.listAccounts()).find((a) => a.name === "幽靈帳本帳戶")!;

    await triggerMergeCycle(repo);

    const defaultBookRow = await defaultBook(repo);
    const healed = (await repo.listAccounts()).find((a) => a.id === accountBefore.id)!;
    expect(healed.bookId).toBe(defaultBookRow.id);
  });

  it("running the merge+heal routine twice is idempotent — the second run changes nothing", async () => {
    const repo = await makeRepo();
    await repo.createBook(mintDraft);
    await repo.createBook({
      name: "生活帳",
      kind: "personal",
      includeInPersonalNetWorth: true,
      includeInFireMetrics: true,
      color: "#123456",
    });
    const lifeBook = (await repo.listBooks()).find((book) => book.name === "生活帳")!;
    await repo.createAccount(accountDraft({ name: "帳戶A", bookId: lifeBook.id })); // legit customized book, untouched
    await repo.createAccount(accountDraft({ name: "幽靈", bookId: "book_ghost_idempotence" })); // unknown id, heals once

    await triggerMergeCycle(repo); // first run: merges the 2 mints, heals the ghost account

    const snapshot = async () => ({
      books: (await repo.listBooks())
        .map((book) => ({ id: book.id, revision: book.revision }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      accounts: (await repo.listAccounts())
        .map((a) => ({ id: a.id, bookId: a.bookId, revision: a.revision }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    });
    const afterFirst = await snapshot();

    await triggerMergeCycle(repo); // second run: should find nothing left to do

    const afterSecond = await snapshot();
    expect(afterSecond).toEqual(afterFirst);
  });

  it("consumeBookMergeAnnouncement reports the merged count after a LOCAL merge, then drains back to 0", async () => {
    const repo = await makeRepo();
    await repo.createBook(mintDraft);
    expect(await repo.consumeBookMergeAnnouncement()).toBe(0); // nothing merged yet

    await triggerMergeCycle(repo);

    expect(await repo.consumeBookMergeAnnouncement()).toBe(1); // one loser tombstoned
    expect(await repo.consumeBookMergeAnnouncement()).toBe(0); // drained — nothing new
  });

  it("does not announce a tombstone this device only RECEIVED via sync (not a local merge)", async () => {
    const repo = await makeRepo();
    await repo.createBook(mintDraft);
    const mints = (await repo.listBooks()).filter((book) => book.kind === "personal");
    const loser = mints[1];

    // This device never computes planMintMerge over a >=2-mint set locally —
    // by the time the post-apply hook runs, only 1 active mint remains, so
    // no local merge happens and the announce counter must stay at 0.
    const payload = await repo.getSyncPayload("book", loser.id);
    await repo.applySyncChanges([
      {
        entity: "book",
        payload: {
          ...payload,
          deletedAt: new Date().toISOString(),
          revision: Number(payload!.revision) + 1,
        },
      },
    ]);

    expect(await repo.consumeBookMergeAnnouncement()).toBe(0);
  });
});
