import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createMemoryFinanceRepositoryForTests, createSqliteFinanceRepositoryForTests, type FinanceRepository } from "./repositories";

// Minimal shim of @tauri-apps/plugin-sql's Database over node:sqlite (same as
// repositories.sqlite-tx.test.ts). plugin-sql uses `$1,$2,…` placeholders;
// node:sqlite treats `$1` as a named parameter, so we bind by name.
function makeShim() {
  const raw = new DatabaseSync(":memory:");
  function named(values?: unknown[]) {
    const obj: Record<string, unknown> = {};
    (values ?? []).forEach((v, i) => { obj[`$${i + 1}`] = v === undefined ? null : v; });
    return obj as never;
  }
  return {
    async execute(sql: string, values?: unknown[]) {
      await Promise.resolve();
      if (!values || values.length === 0) { raw.exec(sql); return { rowsAffected: 0, lastInsertId: 0 }; }
      const info = raw.prepare(sql).run(named(values));
      return { rowsAffected: Number(info.changes), lastInsertId: Number(info.lastInsertRowid) };
    },
    async select<T>(sql: string, values?: unknown[]): Promise<T> {
      await Promise.resolve();
      return raw.prepare(sql).all(named(values)) as unknown as T;
    },
    async close() { raw.close(); return true; },
  } as never;
}

async function setupSqlite(): Promise<{ repo: FinanceRepository; accountId: string }> {
  const repo = await createSqliteFinanceRepositoryForTests(makeShim());
  await repo.createAccount({
    name: "現金", currency: "TWD", openingBalance: 0, type: "cash",
    creditLimit: null, creditLimitGroup: "", statementDay: null, paymentDueDay: null, creditPaymentPaidUntil: null,
    isSharedToHousehold: false, loanStartDate: null, annualInterestRate: null, loanTerm: null,
    iconName: null, color: null,
  } as never);
  const [account] = await repo.listAccounts();
  return { repo, accountId: account.id };
}

function makeLedgerPayload(id: string, accountId: string, key: string) {
  const ts = "2026-06-01T00:00:00.000Z";
  return {
    id,
    spaceId: "personal",
    revision: 1,
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null,
    accountId,
    counterAccountId: null,
    date: "2026-06-01",
    name: "recurring expense",
    amount: -500,
    currency: "TWD",
    originalAmount: null,
    originalCurrency: null,
    category: "食",
    subcategory: "",
    merchant: "",
    entryType: "expense",
    settlementStatus: "settled",
    note: "",
    linkedInvestmentRecordId: null,
    groupId: null,
    isReviewed: false,
    receiptAttachmentId: null,
    recurringRuleId: "rule_1",
    recurringOccurrenceKey: key,
    installmentGroupId: null,
    installmentIndex: null,
    installmentTotal: null,
    refundOfLedgerId: null,
    postDate: null,
  };
}

describe("collectPendingChanges (repository)", () => {
  it("reports created and deleted records as pending changes", async () => {
    const repo = createMemoryFinanceRepositoryForTests({});
    await repo.createAccount({
      name: "錢包", currency: "TWD", openingBalance: 0, type: "cash",
      creditLimit: null, creditLimitGroup: "", statementDay: null, paymentDueDay: null, creditPaymentPaidUntil: null,
      isSharedToHousehold: false, loanStartDate: null, annualInterestRate: null, loanTerm: null,
      iconName: null, color: null,
    });

    const all = await repo.collectPendingChanges(null);
    const accounts = all.changes.filter((c) => c.entity === "account");
    expect(accounts).toHaveLength(1);
    expect(accounts[0].deleted).toBe(false);
    expect(all.nextCursor).not.toBeNull();

    // Nothing pending once the cursor is advanced past the latest change.
    const caughtUp = await repo.collectPendingChanges(all.nextCursor);
    expect(caughtUp.count).toBe(0);

    // A soft-delete shows up as a pending deletion after the cursor.
    const [created] = await repo.listAccounts();
    await repo.deleteAccount(created.id);
    const afterDelete = await repo.collectPendingChanges(all.nextCursor);
    expect(afterDelete.changes.some((c) => c.entity === "account" && c.deleted)).toBe(true);
  });
});

describe("sync recurring-occurrence dedup (SQLite)", () => {
  const OCCURRENCE_KEY = "rule_1:2026-06-01";

  it("incoming id > existing id: existing wins, incoming is tombstoned", async () => {
    const { repo, accountId } = await setupSqlite();

    // Seed row "aaa" via applySyncChanges (simulates local device).
    await repo.applySyncChanges([{
      entity: "ledger",
      payload: makeLedgerPayload("aaa", accountId, OCCURRENCE_KEY),
    }]);

    // Apply duplicate from remote device with id "zzz" (> "aaa").
    // Without the dedup fix this would throw UNIQUE constraint error 2067.
    await expect(repo.applySyncChanges([{
      entity: "ledger",
      payload: makeLedgerPayload("zzz", accountId, OCCURRENCE_KEY),
    }])).resolves.toBeUndefined();

    // Exactly one non-deleted row with this occurrence key.
    const live = await repo.listLedgerTransactions();
    const liveWithKey = live.filter((r) => r.recurringOccurrenceKey === OCCURRENCE_KEY);
    expect(liveWithKey).toHaveLength(1);
    expect(liveWithKey[0].id).toBe("aaa"); // min(id) wins

    // The loser "zzz" exists but is tombstoned.
    const loserPayload = await repo.getSyncPayload("ledger", "zzz");
    expect(loserPayload).not.toBeNull();
    expect(loserPayload!.deletedAt).not.toBeNull();
  });

  it("incoming id < existing id: incoming wins, existing is tombstoned", async () => {
    const { repo, accountId } = await setupSqlite();

    // Seed row "aaa" via applySyncChanges (simulates local device).
    await repo.applySyncChanges([{
      entity: "ledger",
      payload: makeLedgerPayload("aaa", accountId, OCCURRENCE_KEY),
    }]);

    // Apply duplicate from remote with id "000" (< "aaa") — incoming wins.
    await expect(repo.applySyncChanges([{
      entity: "ledger",
      payload: makeLedgerPayload("000", accountId, OCCURRENCE_KEY),
    }])).resolves.toBeUndefined();

    // Exactly one non-deleted row, and it's the incoming "000".
    const live = await repo.listLedgerTransactions();
    const liveWithKey = live.filter((r) => r.recurringOccurrenceKey === OCCURRENCE_KEY);
    expect(liveWithKey).toHaveLength(1);
    expect(liveWithKey[0].id).toBe("000"); // min(id) wins

    // The loser "aaa" is tombstoned.
    const loserPayload = await repo.getSyncPayload("ledger", "aaa");
    expect(loserPayload).not.toBeNull();
    expect(loserPayload!.deletedAt).not.toBeNull();
  });
});

// The browser/in-memory repository must converge to the SAME end state as the
// SQLite path above: among non-deleted rows sharing a recurringOccurrenceKey,
// the lexicographically smallest id survives; the loser is tombstoned.
describe("sync recurring-occurrence dedup (memory)", () => {
  const OCCURRENCE_KEY = "rule_1:2026-06-01";

  it("incoming id < existing id: incoming wins, existing is tombstoned", async () => {
    const repo = createMemoryFinanceRepositoryForTests({});

    // Seed the existing occurrence row tx_bbb (e.g. posted locally).
    await repo.applySyncChanges([{
      entity: "ledger",
      payload: makeLedgerPayload("tx_bbb", "acct_cash", OCCURRENCE_KEY),
    }]);

    // Apply a duplicate from a remote device with a smaller id tx_aaa.
    await repo.applySyncChanges([{
      entity: "ledger",
      payload: makeLedgerPayload("tx_aaa", "acct_cash", OCCURRENCE_KEY),
    }]);

    const live = await repo.listLedgerTransactions();
    const liveWithKey = live.filter((r) => r.recurringOccurrenceKey === OCCURRENCE_KEY);
    expect(liveWithKey).toHaveLength(1);
    expect(liveWithKey[0].id).toBe("tx_aaa"); // min(id) wins

    const loserPayload = await repo.getSyncPayload("ledger", "tx_bbb");
    expect(loserPayload).not.toBeNull();
    expect(loserPayload!.deletedAt).not.toBeNull();
  });

  it("incoming id > existing id: existing wins, incoming is stored tombstoned", async () => {
    const repo = createMemoryFinanceRepositoryForTests({});

    await repo.applySyncChanges([{
      entity: "ledger",
      payload: makeLedgerPayload("tx_aaa", "acct_cash", OCCURRENCE_KEY),
    }]);

    await repo.applySyncChanges([{
      entity: "ledger",
      payload: makeLedgerPayload("tx_zzz", "acct_cash", OCCURRENCE_KEY),
    }]);

    const live = await repo.listLedgerTransactions();
    const liveWithKey = live.filter((r) => r.recurringOccurrenceKey === OCCURRENCE_KEY);
    expect(liveWithKey).toHaveLength(1);
    expect(liveWithKey[0].id).toBe("tx_aaa"); // min(id) wins

    const loserPayload = await repo.getSyncPayload("ledger", "tx_zzz");
    expect(loserPayload).not.toBeNull();
    expect(loserPayload!.deletedAt).not.toBeNull();
  });
});
