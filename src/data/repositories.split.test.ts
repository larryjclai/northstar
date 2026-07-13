import { expect, it } from "vitest";
import { describeEachRepo } from "./repositories.testHarness";
import { classifyLedgerGroup } from "../domain/groupClassifier";
import { categoryPeriodSpend } from "../domain/categorySpend";
import type { SplitSharedFields } from "../domain/splitLegs";
import type { Account, LedgerTransaction } from "../domain";

const cash: Account = {
  id: "acct_cash",
  spaceId: "space_test",
  revision: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
  name: "現金",
  currency: "TWD",
  openingBalance: 10_000,
  balance: 10_000,
  type: "cash",
  creditLimit: null,
  creditLimitGroup: "",
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

const shared: SplitSharedFields = {
  accountId: "acct_cash",
  date: "2026-07-01",
  name: "全聯採買",
  merchant: "全聯",
  currency: "TWD",
  entryType: "expense",
  settlementStatus: "settled",
  note: "",
};

const legs = [
  { amount: 300, category: "餐飲", subcategory: "菜錢" },
  { amount: 120, category: "居住", subcategory: "日用品" },
];

async function activeGroupRows(repo: { listLedgerTransactions(): Promise<LedgerTransaction[]> }) {
  const rows = await repo.listLedgerTransactions();
  return rows.filter((row) => row.legKind === "category");
}

describeEachRepo("split legs (多類別拆分)", (makeRepo) => {
  it("createSplit inserts N rows sharing a groupId with legKind category", async () => {
    const repo = await makeRepo({ accounts: [cash] });
    await repo.createSplit(shared, legs);

    const rows = await activeGroupRows(repo);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.groupId)).size).toBe(1);
    expect(rows[0].groupId).toBeTruthy();
    expect(rows.every((row) => row.legKind === "category")).toBe(true);
    expect(rows.map((row) => row.amount).sort((a, b) => a - b)).toEqual([-300, -120]);
    expect(rows.map((row) => row.category).sort()).toEqual(["居住", "餐飲"]);
  });

  it("account balance moves by exactly the leg sum (reconciliation)", async () => {
    const repo = await makeRepo({ accounts: [cash] });
    await repo.createSplit(shared, legs);
    const [account] = await repo.listAccounts();
    expect(account.balance).toBe(10_000 - 420);
  });

  it("classifyLedgerGroup on the group returns split", async () => {
    const repo = await makeRepo({ accounts: [cash] });
    await repo.createSplit(shared, legs);
    const rows = await activeGroupRows(repo);
    expect(classifyLedgerGroup(rows)).toBe("split");
  });

  it("deleting ANY leg tombstones the whole group (existing groupId cascade)", async () => {
    const repo = await makeRepo({ accounts: [cash] });
    await repo.createSplit(shared, legs);
    const rows = await activeGroupRows(repo);
    await repo.deleteLedgerTransaction(rows[1].id);
    expect(await repo.listLedgerTransactions()).toHaveLength(0);
    const [account] = await repo.listAccounts();
    expect(account.balance).toBe(10_000);
  });

  it("updateSplit re-shapes legs (add/remove/edit) without changing the groupId", async () => {
    const repo = await makeRepo({ accounts: [cash] });
    await repo.createSplit(shared, legs);
    const before = await activeGroupRows(repo);
    const groupId = before[0].groupId!;

    await repo.updateSplit(groupId, { ...shared, note: "改過" }, [
      { amount: 250, category: "餐飲", subcategory: "外食" },
      { amount: 80, category: "交通", subcategory: "捷運" },
      { amount: 40, category: "居住", subcategory: "日用品" },
    ]);

    const after = await activeGroupRows(repo);
    expect(after).toHaveLength(3);
    expect(after.every((row) => row.groupId === groupId)).toBe(true);
    expect(after.every((row) => row.note === "改過")).toBe(true);
    expect(after.map((row) => row.amount).sort((a, b) => a - b)).toEqual([-250, -80, -40]);
    const [account] = await repo.listAccounts();
    expect(account.balance).toBe(10_000 - 370);
  });

  it("updateSplit bumps the tombstoned rows' revisions (sync LWW)", async () => {
    const repo = await makeRepo({ accounts: [cash] });
    await repo.createSplit(shared, legs);
    const before = await activeGroupRows(repo);
    const groupId = before[0].groupId!;

    await repo.updateSplit(groupId, shared, [
      { amount: 200, category: "餐飲", subcategory: "" },
      { amount: 100, category: "交通", subcategory: "" },
    ]);

    for (const old of before) {
      const payload = await repo.getSyncPayload("ledger", old.id);
      expect(payload).not.toBeNull();
      expect(payload!.deletedAt).not.toBeNull();
      expect(Number(payload!.revision)).toBe(old.revision + 1);
    }
  });

  it("updateSplit throws on an unknown group and writes nothing", async () => {
    const repo = await makeRepo({ accounts: [cash] });
    await expect(repo.updateSplit("group_missing", shared, legs)).rejects.toThrow("找不到拆分群組。");
    expect(await repo.listLedgerTransactions()).toHaveLength(0);
    const [account] = await repo.listAccounts();
    expect(account.balance).toBe(10_000);
  });

  it("a builder rejection leaves the existing group untouched", async () => {
    const repo = await makeRepo({ accounts: [cash] });
    await repo.createSplit(shared, legs);
    const before = await activeGroupRows(repo);
    const groupId = before[0].groupId!;

    await expect(repo.updateSplit(groupId, shared, [{ amount: 100, category: "餐飲", subcategory: "" }]))
      .rejects.toThrow("拆分至少需要 2 筆明細。");

    const after = await activeGroupRows(repo);
    expect(after.map((row) => row.id).sort()).toEqual(before.map((row) => row.id).sort());
    const [account] = await repo.listAccounts();
    expect(account.balance).toBe(10_000 - 420);
  });

  it("categorySpend counts each leg under its own category (consumers unchanged)", async () => {
    const repo = await makeRepo({ accounts: [cash] });
    await repo.createSplit(shared, legs);
    const rows = await repo.listLedgerTransactions();
    const spend = categoryPeriodSpend(
      rows,
      { preset: "custom", start: "2026-07-01", end: "2026-07-31", label: "7月" },
      "TWD",
      (row) => row.amount,
    );
    expect(spend.total).toBe(420);
    expect(spend.categories).toEqual([
      { name: "餐飲", amount: 300, count: 1 },
      { name: "居住", amount: 120, count: 1 },
    ]);
  });

  it("fee legs keep legKind null (splits and fee pairs stay distinguishable)", async () => {
    const repo = await makeRepo({ accounts: [cash] });
    await repo.createLedgerTransaction({
      accountId: "acct_cash",
      date: "2026-07-02",
      name: "海外刷卡",
      amount: -1000,
      currency: "TWD",
      category: "購物",
      subcategory: "",
      merchant: "Amazon",
      entryType: "expense",
      settlementStatus: "settled",
      note: "",
      feeAmount: 15,
    });
    const rows = await repo.listLedgerTransactions();
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.legKind == null)).toBe(true);
    expect(new Set(rows.map((row) => row.groupId)).size).toBe(1);
  });
});
