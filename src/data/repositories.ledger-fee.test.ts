import { expect, it } from "vitest";
import { type LedgerDraft } from "./repositories";
import { describeEachRepo } from "./repositories.testHarness";
import type { Account, LedgerTransaction, RecurringTransaction } from "../domain";

const account: Account = {
  id: "acct_bank",
  spaceId: "space_test",
  revision: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
  name: "Bank",
  currency: "TWD",
  openingBalance: 0,
  balance: 0,
  type: "depository",
  creditLimit: null,
  creditLimitGroup: "",
  creditGroupId: null,
  bookId: "book_test_default",
  isSharedToHousehold: false,
  loanStartDate: null,
  annualInterestRate: null,
  loanTerm: null,
  iconName: null,
  color: null,
  statementDay: null,
  paymentDueDay: null,
  creditPaymentPaidUntil: null,
};

const cashAccount: Account = { ...account, id: "acct_cash", name: "Cash", type: "cash" };

function draft(overrides: Partial<LedgerDraft> = {}): LedgerDraft {
  return {
    accountId: "acct_bank",
    date: "2026-06-10",
    name: "薪資",
    amount: 50_000,
    currency: "TWD",
    category: "收入",
    subcategory: "薪資",
    merchant: "公司",
    entryType: "income",
    settlementStatus: "settled",
    note: "",
    ...overrides,
  };
}

describeEachRepo("createLedgerTransaction fee leg", (makeRepo) => {
  it("income with feeAmount posts a gross income row plus a linked fee expense", async () => {
    const repo = await makeRepo({ accounts: [account] });
    await repo.createLedgerTransaction(draft({ feeAmount: 30 }));

    const rows = await repo.listLedgerTransactions();
    expect(rows).toHaveLength(2);

    const income = rows.find((r) => r.entryType === "income")!;
    const fee = rows.find((r) => r.category === "手續費")!;
    // Gross income stays intact; the fee is its own expense leg.
    expect(income.amount).toBe(50_000);
    expect(fee.amount).toBe(-30);
    expect(fee.entryType).toBe("expense");
    expect(fee.subcategory).toBe("收入手續費");
    // Both rows share a group so deletes cascade together.
    expect(income.groupId).toBeTruthy();
    expect(fee.groupId).toBe(income.groupId);

    const [acct] = await repo.listAccounts();
    expect(acct.balance).toBe(49_970);
  });

  it("expense with feeAmount keeps the FX-surcharge subcategory", async () => {
    const repo = await makeRepo({ accounts: [account] });
    await repo.createLedgerTransaction(
      draft({
        name: "海外刷卡",
        amount: -1_000,
        category: "購物",
        subcategory: "",
        entryType: "expense",
        feeAmount: 15,
      }),
    );

    const rows = await repo.listLedgerTransactions();
    const fee = rows.find((r) => r.category === "手續費")!;
    expect(fee.amount).toBe(-15);
    expect(fee.subcategory).toBe("海外交易手續費");

    const [acct] = await repo.listAccounts();
    expect(acct.balance).toBe(-1_015);
  });

  it("no feeAmount posts a single row", async () => {
    const repo = await makeRepo({ accounts: [account] });
    await repo.createLedgerTransaction(draft());
    expect(await repo.listLedgerTransactions()).toHaveLength(1);
  });
});

// Plan 226: 手續費 editable on edit — updateLedgerTransaction reconciles the
// linked fee leg (create/update/tombstone) instead of ignoring feeAmount.
describeEachRepo("updateLedgerTransaction fee leg", (makeRepo) => {
  it("adding a fee on edit creates a linked leg sharing a fresh groupId", async () => {
    const repo = await makeRepo({ accounts: [account] });
    await repo.createLedgerTransaction(draft()); // no fee at creation → no groupId
    const [row] = await repo.listLedgerTransactions();
    expect(row.groupId).toBeNull();

    await repo.updateLedgerTransaction(row.id, draft({ feeAmount: 250 }));

    const rows = await repo.listLedgerTransactions();
    expect(rows).toHaveLength(2);
    const main = rows.find((r) => r.id === row.id)!;
    const fee = rows.find((r) => r.category === "手續費")!;
    expect(main.groupId).toBeTruthy();
    expect(fee.groupId).toBe(main.groupId);
    expect(fee.amount).toBe(-250);
    expect(fee.entryType).toBe("expense");
    expect(fee.legKind == null).toBe(true);

    const [acct] = await repo.listAccounts();
    expect(acct.balance).toBe(50_000 - 250);
  });

  it("changing the fee updates the SAME leg, never creating a second one", async () => {
    const repo = await makeRepo({ accounts: [account] });
    await repo.createLedgerTransaction(draft({ feeAmount: 250 }));
    const before = await repo.listLedgerTransactions();
    const main = before.find((r) => r.category !== "手續費")!;
    const feeBefore = before.find((r) => r.category === "手續費")!;

    await repo.updateLedgerTransaction(main.id, draft({ feeAmount: 100 }));

    const after = await repo.listLedgerTransactions();
    expect(after).toHaveLength(2);
    const feeAfter = after.find((r) => r.category === "手續費")!;
    expect(feeAfter.id).toBe(feeBefore.id);
    expect(feeAfter.amount).toBe(-100);

    const [acct] = await repo.listAccounts();
    expect(acct.balance).toBe(50_000 - 100);
  });

  it("clearing the fee (feeAmount: 0) tombstones the leg with a bumped revision", async () => {
    const repo = await makeRepo({ accounts: [account] });
    await repo.createLedgerTransaction(draft({ feeAmount: 250 }));
    const before = await repo.listLedgerTransactions();
    const main = before.find((r) => r.category !== "手續費")!;
    const feeBefore = before.find((r) => r.category === "手續費")!;

    await repo.updateLedgerTransaction(main.id, draft({ feeAmount: 0 }));

    // listLedgerTransactions() only returns active rows — the tombstoned leg
    // drops out, and the balance reflects the fee no longer being deducted.
    const after = await repo.listLedgerTransactions();
    expect(after).toHaveLength(1);
    const [acct] = await repo.listAccounts();
    expect(acct.balance).toBe(50_000);

    // bump()'s revision discipline (sync LWW) applies to the tombstone itself
    // — collectPendingChanges(null) surfaces every row (including deleted
    // ones), unlike listLedgerTransactions().
    // buildPendingChanges is an append-only changelog (one entry per write,
    // oldest-first per the outbox), not a per-entity latest-state map — take
    // the LAST entry for this id to see its current state.
    const pending = await repo.collectPendingChanges(null);
    const tombstoned = pending.changes.filter((c) => c.entityId === feeBefore.id).at(-1)!;
    expect(tombstoned.deleted).toBe(true);
    expect(tombstoned.revision).toBeGreaterThan(feeBefore.revision);
  });

  it("editing an unrelated field with feeAmount echoing the current fee does not duplicate the leg", async () => {
    const repo = await makeRepo({ accounts: [account] });
    await repo.createLedgerTransaction(draft({ feeAmount: 30 }));
    const before = await repo.listLedgerTransactions();
    const main = before.find((r) => r.category !== "手續費")!;
    const feeBefore = before.find((r) => r.category === "手續費")!;

    // Echo the SAME fee back while changing an unrelated field (note). Per
    // the Design table, "exists + feeAmount > 0" always resolves to "update
    // the leg" — there's no special-case that skips the write when the
    // amount is unchanged, so the leg's revision legitimately bumps here;
    // what matters is there's still exactly one leg and its amount is intact.
    await repo.updateLedgerTransaction(main.id, draft({ feeAmount: 30, note: "改備註" }));

    const after = await repo.listLedgerTransactions();
    expect(after).toHaveLength(2);
    const feeAfter = after.find((r) => r.category === "手續費")!;
    expect(feeAfter.id).toBe(feeBefore.id);
    expect(feeAfter.amount).toBe(-30);
    const mainAfter = after.find((r) => r.id === main.id)!;
    expect(mainAfter.note).toBe("改備註");
  });

  it("transfer rows ignore feeAmount in the update input (no leg created)", async () => {
    const repo = await makeRepo({ accounts: [account, cashAccount] });
    await repo.createTransfer({
      date: "2026-06-10",
      sourceAccountId: "acct_bank",
      destinationAccountId: "acct_cash",
      sourceCurrency: "TWD",
      destinationCurrency: "TWD",
      sourceAmount: 500,
      note: "",
    });
    const before = await repo.listLedgerTransactions();
    expect(before).toHaveLength(2);
    const sourceLeg = before.find((r) => r.amount < 0)!;

    await repo.updateLedgerTransaction(sourceLeg.id, {
      accountId: sourceLeg.accountId,
      date: sourceLeg.date,
      name: sourceLeg.name,
      amount: sourceLeg.amount,
      currency: sourceLeg.currency,
      category: sourceLeg.category,
      subcategory: sourceLeg.subcategory,
      merchant: sourceLeg.merchant,
      entryType: "transfer",
      settlementStatus: "settled",
      note: "改備註",
      groupId: sourceLeg.groupId,
      feeAmount: 500,
    });

    const after = await repo.listLedgerTransactions();
    expect(after).toHaveLength(2); // still just the transfer pair — no fee leg
    expect(after.some((r) => r.category === "手續費")).toBe(false);
  });

  it("recurring scope=all propagates template fields to siblings but never fans out fee legs", async () => {
    // Sibling rewrites inside applyRecurringScopeEdit never set feeAmount on
    // their per-sibling draft — confirming that keeps a sibling's own linked
    // fee leg untouched (STOP condition in plan 226: fee stays scoped to the
    // directly-edited occurrence; scope propagation copies template fields
    // only).
    const occ1: LedgerTransaction = {
      id: "led_occ1",
      spaceId: "space_test",
      revision: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      deletedAt: null,
      accountId: "acct_bank",
      counterAccountId: null,
      date: "2026-06-05T09:00",
      name: "房東",
      amount: -1000,
      currency: "TWD",
      originalAmount: null,
      originalCurrency: null,
      category: "居住",
      subcategory: "房租",
      merchant: "房東",
      entryType: "expense",
      settlementStatus: "settled",
      note: "",
      linkedInvestmentRecordId: null,
      groupId: "group_occ1_fee",
      legKind: null,
      isReviewed: false,
      receiptAttachmentId: null,
      recurringRuleId: "rec_1",
      recurringOccurrenceKey: "rec_1:2026-06-05",
      installmentGroupId: null,
      installmentIndex: null,
      installmentTotal: null,
      refundOfLedgerId: null,
      postDate: null,
    };
    const occ1Fee: LedgerTransaction = {
      ...occ1,
      id: "led_occ1_fee",
      name: "手續費",
      amount: -50,
      category: "手續費",
      subcategory: "海外交易手續費",
      note: "由系統自動建立的手續費紀錄",
      recurringRuleId: null,
      recurringOccurrenceKey: null,
    };
    const occ2: LedgerTransaction = {
      ...occ1,
      id: "led_occ2",
      date: "2026-07-05T09:00",
      groupId: null,
      recurringOccurrenceKey: "rec_1:2026-07-05",
    };
    const rule: RecurringTransaction = {
      id: "rec_1",
      spaceId: "space_test",
      revision: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      deletedAt: null,
      accountId: "acct_bank",
      counterAccountId: null,
      amount: -1000,
      currency: "TWD",
      category: "居住",
      subcategory: "房租",
      merchant: "房東",
      entryType: "expense",
      settlementStatus: "settled",
      note: "",
      frequency: "monthly",
      dayOfMonth: 5,
      nextRunDate: "2026-08-05",
      isActive: true,
    };

    const repo = await makeRepo({
      accounts: [account],
      ledgerTransactions: [occ1, occ1Fee, occ2],
      recurringTransactions: [rule],
    });

    await repo.applyRecurringScopeEdit(occ2.id, "all", {
      accountId: "acct_bank",
      counterAccountId: null,
      date: occ2.date,
      name: "房東",
      amount: -1000,
      currency: "TWD",
      category: "居住",
      subcategory: "房租",
      merchant: "新房東",
      entryType: "expense",
      settlementStatus: "settled",
      note: "調漲",
      feeAmount: 500,
    });

    const after = await repo.listLedgerTransactions();
    // occ1 + occ1's untouched fee leg + occ2 + occ2's newly created fee leg.
    expect(after).toHaveLength(4);

    const occ1After = after.find((r) => r.id === "led_occ1")!;
    const occ1FeeAfter = after.find((r) => r.id === "led_occ1_fee")!;
    const occ2After = after.find((r) => r.id === "led_occ2")!;
    const occ2Fee = after.find((r) => r.groupId === occ2After.groupId && r.category === "手續費")!;

    // Template fields DO propagate to the sibling (occ1).
    expect(occ1After.merchant).toBe("新房東");
    // But occ1's own fee leg is untouched: same id, same amount, still active.
    expect(occ1FeeAfter.id).toBe("led_occ1_fee");
    expect(occ1FeeAfter.amount).toBe(-50);
    expect(occ1FeeAfter.deletedAt).toBeNull();
    // occ2 (the directly-edited occurrence) gets its own new fee leg.
    expect(occ2After.merchant).toBe("新房東");
    expect(occ2Fee.amount).toBe(-500);
    expect(occ2Fee.id).not.toBe(occ1FeeAfter.id);
  });
});
