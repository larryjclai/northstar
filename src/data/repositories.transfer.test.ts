import { expect, it } from "vitest";
import { describeEachRepo } from "./repositories.testHarness";
import type { TransferDraft } from "./repositories";
import type { Account, LedgerTransaction } from "../domain";

const twd: Account = {
  id: "acct_twd_a",
  spaceId: "space_test",
  revision: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
  name: "台幣帳戶A",
  currency: "TWD",
  openingBalance: 10_000,
  balance: 10_000,
  type: "cash",
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

const twdB: Account = {
  ...twd,
  id: "acct_twd_b",
  name: "台幣帳戶B",
  openingBalance: 5_000,
  balance: 5_000,
};

const twdC: Account = {
  ...twd,
  id: "acct_twd_c",
  name: "台幣帳戶C",
  openingBalance: 0,
  balance: 0,
};

const usd: Account = {
  ...twd,
  id: "acct_usd",
  name: "美金帳戶",
  currency: "USD",
  openingBalance: 1_000,
  balance: 1_000,
};

const draft: TransferDraft = {
  date: "2026-07-01",
  sourceAccountId: "acct_twd_a",
  destinationAccountId: "acct_twd_b",
  sourceCurrency: "TWD",
  destinationCurrency: "TWD",
  sourceAmount: 1_000,
  note: "",
};

async function activeLegs(repo: { listLedgerTransactions(): Promise<LedgerTransaction[]> }, groupId: string) {
  const rows = await repo.listLedgerTransactions();
  return rows.filter((row) => row.groupId === groupId && row.deletedAt === null);
}

async function createDraftTransfer(repo: { createTransfer(input: TransferDraft): Promise<void>; listLedgerTransactions(): Promise<LedgerTransaction[]> }, input: TransferDraft = draft) {
  await repo.createTransfer(input);
  const rows = await repo.listLedgerTransactions();
  const groupId = rows.find((row) => row.entryType === "transfer")!.groupId!;
  return { groupId, rows: rows.filter((row) => row.groupId === groupId) };
}

describeEachRepo("transfer edit (updateTransfer, plan 227)", (makeRepo) => {
  it("updates amount/date/note in place — SAME leg ids, no duplicate pair", async () => {
    const repo = await makeRepo({ accounts: [twd, twdB] });
    const { groupId, rows: before } = await createDraftTransfer(repo);
    expect(before).toHaveLength(2);
    const beforeIds = before.map((row) => row.id).sort();

    await repo.updateTransfer(groupId, { ...draft, sourceAmount: 800, date: "2026-07-05", note: "改過" });

    const after = await activeLegs(repo, groupId);
    expect(after).toHaveLength(2); // THE regression: must stay 2, not 4
    expect(after.map((row) => row.id).sort()).toEqual(beforeIds);
    const source = after.find((row) => row.amount < 0)!;
    const dest = after.find((row) => row.amount > 0)!;
    expect(source.amount).toBe(-800);
    expect(dest.amount).toBe(800);
    expect(source.date).toBe("2026-07-05");
    expect(dest.date).toBe("2026-07-05");
    expect(source.note).toBe("改過");
    expect(dest.note).toBe("改過");

    const accounts = await repo.listAccounts();
    const a = accounts.find((acc) => acc.id === "acct_twd_a")!;
    const b = accounts.find((acc) => acc.id === "acct_twd_b")!;
    expect(a.balance).toBe(10_000 - 800); // NOT 10_000 - 1800
    expect(b.balance).toBe(5_000 + 800);
  });

  it("moves the source account: both accounts' balances correct after recompute", async () => {
    const repo = await makeRepo({ accounts: [twd, twdB, twdC] });
    const { groupId } = await createDraftTransfer(repo);

    await repo.updateTransfer(groupId, { ...draft, sourceAccountId: "acct_twd_c" });

    const after = await activeLegs(repo, groupId);
    const source = after.find((row) => row.amount < 0)!;
    expect(source.accountId).toBe("acct_twd_c");

    const accounts = await repo.listAccounts();
    const a = accounts.find((acc) => acc.id === "acct_twd_a")!;
    const b = accounts.find((acc) => acc.id === "acct_twd_b")!;
    const c = accounts.find((acc) => acc.id === "acct_twd_c")!;
    expect(a.balance).toBe(10_000); // untouched now that source moved off it
    expect(b.balance).toBe(5_000 + 1_000);
    expect(c.balance).toBe(0 - 1_000);
  });

  it("cross-currency edit flips names/category to 外幣兌換 and uses destinationAmount", async () => {
    const repo = await makeRepo({ accounts: [twd, twdB, usd] });
    const { groupId } = await createDraftTransfer(repo);

    await repo.updateTransfer(groupId, {
      date: "2026-07-01",
      sourceAccountId: "acct_twd_a",
      destinationAccountId: "acct_usd",
      sourceCurrency: "TWD",
      destinationCurrency: "USD",
      sourceAmount: 1_000,
      destinationAmount: 32,
      note: "",
    });

    const after = await activeLegs(repo, groupId);
    const source = after.find((row) => row.amount < 0)!;
    const dest = after.find((row) => row.amount > 0)!;
    expect(source.name).toBe("外幣換出");
    expect(dest.name).toBe("外幣換入");
    expect(source.category).toBe("外幣兌換");
    expect(dest.category).toBe("外幣兌換");
    expect(dest.currency).toBe("USD");
    expect(dest.amount).toBe(32);
    expect(dest.accountId).toBe("acct_usd");
  });

  it("fee lifecycle: 0 -> 100 creates a fee leg, 100 -> 50 updates it in place, 50 -> 0 tombstones it", async () => {
    const repo = await makeRepo({ accounts: [twd, twdB] });
    const { groupId } = await createDraftTransfer(repo);
    expect(await activeLegs(repo, groupId)).toHaveLength(2);

    await repo.updateTransfer(groupId, { ...draft, feeAmount: 100 });
    let rows = await activeLegs(repo, groupId);
    expect(rows).toHaveLength(3);
    const feeLeg = rows.find((row) => row.category === "手續費")!;
    expect(feeLeg.amount).toBe(-100);
    expect(feeLeg.groupId).toBe(groupId);
    const feeLegId = feeLeg.id;

    await repo.updateTransfer(groupId, { ...draft, feeAmount: 50 });
    rows = await activeLegs(repo, groupId);
    expect(rows).toHaveLength(3);
    const updatedFee = rows.find((row) => row.category === "手續費")!;
    expect(updatedFee.id).toBe(feeLegId); // SAME leg id, not tombstone+recreate
    expect(updatedFee.amount).toBe(-50);

    await repo.updateTransfer(groupId, { ...draft, feeAmount: 0 });
    rows = await activeLegs(repo, groupId);
    expect(rows).toHaveLength(2);
    expect(rows.some((row) => row.category === "手續費")).toBe(false);
    const payload = await repo.getSyncPayload("ledger", feeLegId);
    expect(payload).not.toBeNull();
    expect(payload!.deletedAt).not.toBeNull();
  });

  it("reconcile state (isReviewed, postDate) survives an edit on the same leg", async () => {
    const repo = await makeRepo({ accounts: [twd, twdB] });
    const { groupId, rows } = await createDraftTransfer(repo);
    const destLeg = rows.find((row) => row.amount > 0)!;

    await repo.setLedgerReviewed(destLeg.id, true);
    await repo.setLedgerPostDate(destLeg.id, "2026-08-01");

    await repo.updateTransfer(groupId, { ...draft, sourceAmount: 700 });

    const after = await activeLegs(repo, groupId);
    const updatedDest = after.find((row) => row.id === destLeg.id)!;
    expect(updatedDest.isReviewed).toBe(true);
    expect(updatedDest.postDate).toBe("2026-08-01");
    expect(updatedDest.amount).toBe(700);
  });

  it("invariant rejection is atomic: same source/dest account throws and leaves the group byte-unchanged", async () => {
    const repo = await makeRepo({ accounts: [twd, twdB] });
    const { groupId, rows: before } = await createDraftTransfer(repo);

    await expect(
      repo.updateTransfer(groupId, { ...draft, destinationAccountId: "acct_twd_a" }),
    ).rejects.toThrow("來源與目標帳戶不可相同。");

    const after = await activeLegs(repo, groupId);
    expect(after).toHaveLength(2);
    for (const row of before) {
      const match = after.find((r) => r.id === row.id)!;
      expect(match.amount).toBe(row.amount);
      expect(match.revision).toBe(row.revision);
    }
  });

  it("throws 找不到轉帳交易 on an unknown groupId", async () => {
    const repo = await makeRepo({ accounts: [twd, twdB] });
    await expect(repo.updateTransfer("group_missing", draft)).rejects.toThrow("找不到轉帳交易。");
  });

  it("throws 找不到轉帳交易 on a tombstoned groupId", async () => {
    const repo = await makeRepo({ accounts: [twd, twdB] });
    const { groupId, rows } = await createDraftTransfer(repo);
    await repo.deleteLedgerTransaction(rows[0].id); // cascades the whole group
    expect(await activeLegs(repo, groupId)).toHaveLength(0);

    await expect(repo.updateTransfer(groupId, draft)).rejects.toThrow("找不到轉帳交易。");
  });
});
