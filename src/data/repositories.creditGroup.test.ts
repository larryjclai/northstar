import { expect, it } from "vitest";
import { describeEachRepo } from "./repositories.testHarness";
import type { AccountDraft, CreditGroupDraft } from "./repositories";

// 信用卡群組 (Credit groups) — plan 254 (model) / 255 (data layer). Mirrors
// repositories.invoices.test.ts (plan 190 CRUD/sync patterns) and
// repositories.snapshot.test.ts (export/import round-trip), and runs against
// BOTH repo implementations (describeEachRepo) so the browser twin and the
// real SQLite repo stay in parity.
//
// Covers: CRUD, sync push (pending changes + getSyncPayload), sync pull
// (applySyncChanges insert/update), snapshot round-trip, derive-on-read
// (grouped account reports the group's statementDay/paymentDueDay/
// creditLimit instead of its own stale columns), leave-group snapshot
// (clearing creditGroupId freezes the group's current values onto the
// account), and the non-destructive creditLimitGroup -> credit_groups
// backfill (idempotent, currency-mismatch-safe).

function groupDraft(overrides: Partial<CreditGroupDraft> = {}): CreditGroupDraft {
  return {
    name: "玉山銀行",
    currency: "TWD",
    creditLimit: 100_000,
    statementDay: 10,
    paymentDueDay: 25,
    ...overrides,
  };
}

function creditAccountDraft(overrides: Partial<AccountDraft> = {}): AccountDraft {
  return {
    name: "信用卡",
    currency: "TWD",
    openingBalance: 0,
    type: "credit",
    creditLimit: 50_000,
    creditLimitGroup: "",
    statementDay: 15,
    paymentDueDay: 5,
    creditPaymentPaidUntil: null,
    isSharedToHousehold: false,
    loanStartDate: null,
    annualInterestRate: null,
    loanTerm: null,
    iconName: null,
    color: null,
    ...overrides,
  };
}

describeEachRepo("credit groups (信用卡群組)", (makeRepo) => {
  it("create + list + update + soft-delete a credit group, drafts round-tripping every field", async () => {
    const repo = await makeRepo();
    await repo.createCreditGroup(groupDraft());

    let groups = await repo.listCreditGroups();
    const created = groups.find((g) => g.name === "玉山銀行");
    expect(created).toBeTruthy();
    expect(created!.currency).toBe("TWD");
    expect(created!.creditLimit).toBe(100_000);
    expect(created!.statementDay).toBe(10);
    expect(created!.paymentDueDay).toBe(25);
    expect(created!.revision).toBe(1);

    await repo.updateCreditGroup(created!.id, groupDraft({ name: "玉山銀行（改）", creditLimit: 150_000 }));
    groups = await repo.listCreditGroups();
    const updated = groups.find((g) => g.id === created!.id);
    expect(updated!.name).toBe("玉山銀行（改）");
    expect(updated!.creditLimit).toBe(150_000);
    expect(updated!.revision).toBeGreaterThan(created!.revision);

    await repo.deleteCreditGroup(created!.id);
    groups = await repo.listCreditGroups();
    expect(groups.find((g) => g.id === created!.id)).toBeUndefined();
  });

  it("a created credit group enters the pending-changes/outbox stream, and getSyncPayload returns the row", async () => {
    const repo = await makeRepo();
    await repo.createCreditGroup(groupDraft());
    const group = (await repo.listCreditGroups())[0];

    const pending = await repo.collectPendingChanges(null);
    const changes = pending.changes.filter((c) => c.entity === "creditGroup");
    expect(changes.some((c) => c.entityId === group.id)).toBe(true);

    const payload = await repo.getSyncPayload("creditGroup", group.id);
    expect(payload).toBeTruthy();
    expect(payload!.id).toBe(group.id);
    expect(payload!.name).toBe("玉山銀行");
    expect(Number(payload!.revision)).toBeGreaterThanOrEqual(1);
  });

  it("applySyncChanges inserts a new creditGroup row, and a later apply updates it in place", async () => {
    const repo = await makeRepo();
    const t0 = "2026-07-01T00:00:00.000Z";
    await repo.applySyncChanges([{
      entity: "creditGroup",
      payload: {
        id: "creditGroup_remote_1", spaceId: "space_personal_default", revision: 1,
        createdAt: t0, updatedAt: t0, deletedAt: null,
        name: "國泰銀行", currency: "TWD", creditLimit: 80_000, statementDay: 20, paymentDueDay: 10,
      },
    }]);
    let groups = await repo.listCreditGroups();
    let remote = groups.find((g) => g.id === "creditGroup_remote_1");
    expect(remote).toBeTruthy();
    expect(remote!.name).toBe("國泰銀行");
    expect(remote!.creditLimit).toBe(80_000);

    const t1 = "2026-07-02T00:00:00.000Z";
    await repo.applySyncChanges([{
      entity: "creditGroup",
      payload: {
        id: "creditGroup_remote_1", spaceId: "space_personal_default", revision: 2,
        createdAt: t0, updatedAt: t1, deletedAt: null,
        name: "國泰銀行（改）", currency: "TWD", creditLimit: 90_000, statementDay: 20, paymentDueDay: 10,
      },
    }]);
    groups = await repo.listCreditGroups();
    remote = groups.find((g) => g.id === "creditGroup_remote_1");
    expect(remote!.name).toBe("國泰銀行（改）");
    expect(remote!.creditLimit).toBe(90_000);
  });

  it("export -> import preserves credit groups", async () => {
    const source = await makeRepo();
    await source.createCreditGroup(groupDraft());
    const group = (await source.listCreditGroups()).find((g) => g.name === "玉山銀行");
    expect(group).toBeTruthy();

    const snapshot = await source.exportSnapshot();
    const target = await makeRepo();
    await target.importSnapshot(snapshot);

    const restored = (await target.listCreditGroups()).find((g) => g.name === "玉山銀行");
    expect(restored).toBeTruthy();
    expect(restored!.id).toBe(group!.id);
    expect(restored!.currency).toBe("TWD");
    expect(restored!.creditLimit).toBe(100_000);
    expect(restored!.statementDay).toBe(10);
    expect(restored!.paymentDueDay).toBe(25);
  });

  it("derive-on-read: a grouped account reports the group's statementDay/paymentDueDay/creditLimit, not its own stale columns", async () => {
    const repo = await makeRepo();
    await repo.createCreditGroup(groupDraft());
    const group = (await repo.listCreditGroups())[0];

    await repo.createAccount(creditAccountDraft({ name: "信用卡A" }));
    const [account] = await repo.listAccounts();
    // Account's own columns (15 / 5 / 50_000) intentionally differ from the
    // group's (10 / 25 / 100_000) so the assertion below can only pass if
    // listAccounts() is actually deriving from the group, not the stored row.
    await repo.updateAccount(account.id, creditAccountDraft({ creditGroupId: group.id }));

    const [updated] = await repo.listAccounts();
    expect(updated.creditGroupId).toBe(group.id);
    expect(updated.statementDay).toBe(10);
    expect(updated.paymentDueDay).toBe(25);
    expect(updated.creditLimit).toBe(100_000);
  });

  it("leave-group snapshot: clearing creditGroupId freezes the group's current values onto the account's own columns", async () => {
    const repo = await makeRepo();
    await repo.createCreditGroup(groupDraft());
    const group = (await repo.listCreditGroups())[0];

    await repo.createAccount(creditAccountDraft({ name: "信用卡B" }));
    const [account] = await repo.listAccounts();
    await repo.updateAccount(account.id, creditAccountDraft({ creditGroupId: group.id }));

    const [linked] = await repo.listAccounts();
    expect(linked.statementDay).toBe(10);
    expect(linked.paymentDueDay).toBe(25);
    expect(linked.creditLimit).toBe(100_000);

    await repo.updateAccount(account.id, creditAccountDraft({ creditGroupId: null }));
    const [left] = await repo.listAccounts();
    expect(left.creditGroupId).toBeNull();
    // The group's LAST-seen values are frozen onto the account's own columns.
    expect(left.statementDay).toBe(10);
    expect(left.paymentDueDay).toBe(25);
    expect(left.creditLimit).toBe(100_000);

    // Proof this is a snapshot, not still-derived: changing the group
    // afterward must NOT affect the now-ungrouped account.
    await repo.updateCreditGroup(group.id, groupDraft({ statementDay: 1, paymentDueDay: 2, creditLimit: 1 }));
    const [afterGroupChange] = await repo.listAccounts();
    expect(afterGroupChange.statementDay).toBe(10);
    expect(afterGroupChange.paymentDueDay).toBe(25);
    expect(afterGroupChange.creditLimit).toBe(100_000);
  });
});

// Plan 255 Step 9 — non-destructive backfill of the legacy free-text
// creditLimitGroup into first-class credit_groups rows. The backfill itself
// runs inside initialize() (both repos), not on ad-hoc CRUD calls, so these
// tests trigger it directly: `initialize()` for SQLite (a real second-start
// simulation — also the idempotency check), and the protected
// `backfillCreditGroupsInMemory()` for the browser twin (whose public
// initialize() reloads from localStorage, which this repo-level harness
// doesn't seed — loadDataForTests is the test-only entry point instead).
describeEachRepo("credit group backfill (creditLimitGroup 自動歸群)", (makeRepo, repoLabel) => {
  async function runBackfill(repo: Awaited<ReturnType<typeof makeRepo>>) {
    if (repoLabel === "sqlite") {
      await repo.initialize();
    } else {
      (repo as unknown as { backfillCreditGroupsInMemory(): void }).backfillCreditGroupsInMemory();
    }
  }

  it("two credit accounts sharing a creditLimitGroup link to one new group, and re-running is idempotent", async () => {
    const repo = await makeRepo();
    await repo.createAccount(creditAccountDraft({ name: "玉山卡A", creditLimitGroup: "玉山", statementDay: 10, paymentDueDay: 5, creditLimit: 50_000 }));
    await repo.createAccount(creditAccountDraft({ name: "玉山卡B", creditLimitGroup: "玉山", statementDay: 10, paymentDueDay: 5, creditLimit: 80_000 }));

    await runBackfill(repo);

    let groups = (await repo.listCreditGroups()).filter((g) => g.name === "玉山");
    expect(groups).toHaveLength(1);
    const group = groups[0];
    expect(group.statementDay).toBe(10);
    expect(group.paymentDueDay).toBe(5);

    let accounts = await repo.listAccounts();
    const linked = accounts.filter((a) => a.name === "玉山卡A" || a.name === "玉山卡B");
    expect(linked).toHaveLength(2);
    expect(linked.every((a) => a.creditGroupId === group.id)).toBe(true);
    // credit_limit_group stays intact — the backfill is non-destructive.
    expect(linked.every((a) => a.creditLimitGroup === "玉山")).toBe(true);

    // Re-run again (simulates a second app start) — must not duplicate.
    await runBackfill(repo);
    groups = (await repo.listCreditGroups()).filter((g) => g.name === "玉山");
    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe(group.id);
    accounts = await repo.listAccounts();
    expect(accounts.filter((a) => a.name === "玉山卡A" || a.name === "玉山卡B").every((a) => a.creditGroupId === group.id)).toBe(true);
  });

  it("a lone credit account with a creditLimitGroup is left ungrouped (nothing to share a bill with)", async () => {
    const repo = await makeRepo();
    await repo.createAccount(creditAccountDraft({ name: "單卡", creditLimitGroup: "單一銀行" }));

    await runBackfill(repo);

    const groups = await repo.listCreditGroups();
    expect(groups.find((g) => g.name === "單一銀行")).toBeUndefined();
    const [account] = await repo.listAccounts();
    expect(account.creditGroupId).toBeNull();
  });

  it("skips a creditLimitGroup whose members disagree on currency, rather than force-merging", async () => {
    const repo = await makeRepo();
    await repo.createAccount(creditAccountDraft({ name: "混幣卡A", currency: "TWD", creditLimitGroup: "混幣群組" }));
    await repo.createAccount(creditAccountDraft({ name: "混幣卡B", currency: "USD", creditLimitGroup: "混幣群組" }));

    await runBackfill(repo);

    const groups = await repo.listCreditGroups();
    expect(groups.find((g) => g.name === "混幣群組")).toBeUndefined();
    const accounts = await repo.listAccounts();
    const mismatched = accounts.filter((a) => a.name === "混幣卡A" || a.name === "混幣卡B");
    expect(mismatched).toHaveLength(2);
    expect(mismatched.every((a) => a.creditGroupId === null)).toBe(true);
  });

  it("reuses an existing group with a matching name instead of creating a duplicate", async () => {
    const repo = await makeRepo();
    await repo.createCreditGroup(groupDraft({ name: "永豐", statementDay: 12, paymentDueDay: 28, creditLimit: 60_000 }));
    const existing = (await repo.listCreditGroups())[0];

    await repo.createAccount(creditAccountDraft({ name: "永豐卡A", creditLimitGroup: "永豐" }));
    await repo.createAccount(creditAccountDraft({ name: "永豐卡B", creditLimitGroup: "永豐" }));

    await runBackfill(repo);

    const groups = (await repo.listCreditGroups()).filter((g) => g.name === "永豐");
    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe(existing.id);
    const accounts = await repo.listAccounts();
    expect(accounts.filter((a) => a.name === "永豐卡A" || a.name === "永豐卡B").every((a) => a.creditGroupId === existing.id)).toBe(true);
  });
});
