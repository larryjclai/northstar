import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  createSqliteFinanceRepositoryForTests,
  type FinanceRepository,
  type InvestmentDraft,
} from "./repositories";

// Minimal shim of @tauri-apps/plugin-sql's Database over node:sqlite, so the
// real SQLite repository (BEGIN/COMMIT, triggers, recompute) can be exercised
// in unit tests. plugin-sql uses `$1,$2,…` placeholders and *reuses* some
// numbers (e.g. `$6,$6`); node:sqlite treats `$1` as a named parameter, so we
// bind by name to preserve that reuse.
function makeShim() {
  const raw = new DatabaseSync(":memory:");
  function named(values?: unknown[]) {
    const obj: Record<string, unknown> = {};
    (values ?? []).forEach((v, i) => {
      obj[`$${i + 1}`] = v === undefined ? null : v;
    });
    return obj as never;
  }
  return {
    // Resolve on a later microtask to mimic plugin-sql's async round-trip, so
    // concurrently-started operations can interleave at their await points.
    async execute(sql: string, values?: unknown[]) {
      await Promise.resolve();
      if (!values || values.length === 0) {
        raw.exec(sql);
        return { rowsAffected: 0, lastInsertId: 0 };
      }
      const info = raw.prepare(sql).run(named(values));
      return { rowsAffected: Number(info.changes), lastInsertId: Number(info.lastInsertRowid) };
    },
    async select<T>(sql: string, values?: unknown[]): Promise<T> {
      await Promise.resolve();
      return raw.prepare(sql).all(named(values)) as unknown as T;
    },
    async close() {
      raw.close();
      return true;
    },
  } as never;
}

const buy: InvestmentDraft = {
  ticker: "2412.TW",
  name: "中華電",
  currency: "TWD",
  linkedAccountId: null,
  date: "2026-06-01T20:38",
  action: "buy",
  price: 2125,
  quantity: 5,
  fee: 5,
  note: "",
};

async function setup(): Promise<{ repo: FinanceRepository; accountId: string }> {
  const repo = await createSqliteFinanceRepositoryForTests(makeShim());
  await repo.createAccount({
    name: "凱基證券",
    currency: "TWD",
    openingBalance: 100000,
    type: "investment",
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
  } as never);
  const [account] = await repo.listAccounts();
  return { repo, accountId: account.id };
}

describe("sqlite repository transactions", () => {
  it("edits a buy record's share count", async () => {
    const { repo, accountId } = await setup();
    const draft = { ...buy, linkedAccountId: accountId };
    await repo.createInvestmentRecord(draft);
    const [created] = await repo.listInvestmentRecords();

    await repo.updateInvestmentRecord(created.id, { ...draft, quantity: 3 });

    const [after] = await repo.listInvestmentRecords();
    expect(after.quantity).toBe(3);
  });

  // Regression: two write operations that overlap (e.g. auto-sync firing while
  // the user saves an edit) must not crash with "cannot start a transaction
  // within a transaction". Each write wraps BEGIN…COMMIT; the serializer must
  // keep them from interleaving on the single shared connection.
  it("serializes overlapping write transactions instead of nesting BEGINs", async () => {
    const { repo, accountId } = await setup();
    const draft = { ...buy, linkedAccountId: accountId };
    await repo.createInvestmentRecord(draft);
    const [created] = await repo.listInvestmentRecords();

    await expect(
      Promise.all([
        repo.updateInvestmentRecord(created.id, { ...draft, quantity: 3 }),
        repo.createInvestmentRecord({
          ...draft,
          ticker: "2330.TW",
          name: "台積電",
          quantity: 1,
          price: 1000,
        }),
      ]),
    ).resolves.toBeDefined();

    const records = await repo.listInvestmentRecords();
    expect(records.find((r) => r.id === created.id)?.quantity).toBe(3);
    expect(records.some((r) => r.action === "buy" && r.quantity === 1)).toBe(true);
  });

  // Regression: importSnapshot() (sync restore) is the other multi-statement
  // transaction. It must also claim the connection exclusively — overlapping it
  // with an edit must not nest BEGINs or strand a transaction (which would lock
  // the DB until restart).
  it("serializes importSnapshot against a concurrent edit", async () => {
    const { repo, accountId } = await setup();
    const draft = { ...buy, linkedAccountId: accountId };
    await repo.createInvestmentRecord(draft);
    const [created] = await repo.listInvestmentRecords();

    const snapshot = await repo.exportSnapshot();

    await expect(
      Promise.all([
        repo.updateInvestmentRecord(created.id, { ...draft, quantity: 3 }),
        repo.importSnapshot(snapshot),
      ]),
    ).resolves.toBeDefined();

    // The DB must remain usable afterwards (no stranded transaction / lock).
    await expect(
      repo.createInvestmentRecord({
        ...draft,
        ticker: "2330.TW",
        name: "台積電",
        quantity: 1,
        price: 1000,
      }),
    ).resolves.toBeUndefined();
  });
});
