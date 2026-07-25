import { describe, expect, it } from "vitest";
import { createSqliteFinanceRepositoryForTests } from "./repositories";
import { makeSqliteShim } from "./repositories.testHarness";

// ---------------------------------------------------------------------------
// Legacy-schema migration + data-repair coverage.
//
// TauriSqlFinanceRepository.initialize() IS the migration engine: it runs the
// CREATE-TABLE migrations, ~60 idempotent `ensureSqliteColumn` ALTERs, then
// DATA-MUTATING repairs (base_quantity backfill, opening-lot materialization,
// the opening-lot cash-leak tombstone, and the manual/transaction asset merge).
// Every other repository test starts from a FRESH DB where every ALTER is a
// no-op and every repair matches zero rows. These tests instead seed an OLDER
// on-disk shape (raw SQL predating current code) and assert initialize()
// upgrades + repairs it without corrupting balances.
//
// Fixture mechanism (no production change required): plan 126's makeSqliteShim()
// wraps a persistent node:sqlite `:memory:` connection. We obtain the shim,
// run raw legacy DDL/DML against it FIRST, then hand the SAME shim to
// createSqliteFinanceRepositoryForTests() — which constructs the repository and
// calls initialize() on our pre-seeded database.
// ---------------------------------------------------------------------------

interface RawDb {
  execute(sql: string, values?: unknown[]): Promise<{ rowsAffected: number; lastInsertId: number }>;
  select<T>(sql: string, values?: unknown[]): Promise<T>;
}

const SPACE = "space_personal_default";
const TS = "2026-01-01T00:00:00.000Z";

/** Obtain a raw handle to a fresh in-memory DB plus the shim to hand the factory. */
function makeRawDb(): { db: RawDb; shim: unknown } {
  const shim = makeSqliteShim();
  return { db: shim as unknown as RawDb, shim };
}

async function pragmaColumns(db: RawDb, table: string): Promise<string[]> {
  const rows = await db.select<Array<{ name: string }>>(`pragma table_info(${table})`);
  return rows.map((r) => r.name);
}

// --- Legacy DDL (migration-1 shape MINUS the chosen columns) ---------------
// Test 1 removes three representative ensureSqliteColumn targets — a ledger
// column (`merchant`), an assets column (`acquisition_date`), and a recurring
// column (`merchant`) — to prove initialize() re-adds each via PRAGMA-guarded
// ALTER. The other migration-1 columns stay so seeded rows remain readable.

const LEGACY_LEDGER_NO_MERCHANT = `
  create table ledger_transactions (
    id text primary key, space_id text not null, revision integer not null,
    created_at text not null, updated_at text not null, deleted_at text,
    account_id text not null, counter_account_id text, date text not null,
    amount real not null, currency text not null, category text not null,
    subcategory text not null default '', entry_type text not null default 'expense',
    settlement_status text not null default 'settled', note text not null,
    linked_investment_record_id text, group_id text, is_reviewed integer not null default 0,
    receipt_attachment_id text, recurring_occurrence_key text, installment_group_id text,
    installment_index integer, installment_total integer, refund_of_ledger_id text
  );`;

const LEGACY_ASSETS_NO_ACQ_DATE = `
  create table portfolio_assets (
    id text primary key, space_id text not null, revision integer not null,
    created_at text not null, updated_at text not null, deleted_at text,
    ticker text not null, name text not null, currency text not null,
    total_quantity real not null, average_cost real not null,
    holding_source text not null default 'transactions'
  );`;

const LEGACY_RECURRING_NO_MERCHANT = `
  create table recurring_transactions (
    id text primary key, space_id text not null, revision integer not null,
    created_at text not null, updated_at text not null, deleted_at text,
    account_id text not null, counter_account_id text, amount real not null,
    currency text not null, category text not null, subcategory text not null default '',
    entry_type text not null default 'expense', settlement_status text not null default 'settled',
    note text not null, day_of_month integer not null, next_run_date text not null,
    is_active integer not null default 1
  );`;

// Accounts at migration-1 shape (used by every fixture; nothing removed here).
const ACCOUNTS_MIGRATION_1 = `
  create table accounts (
    id text primary key, space_id text not null, revision integer not null,
    created_at text not null, updated_at text not null, deleted_at text,
    name text not null, currency text not null, opening_balance real not null,
    balance real not null, type text not null, credit_limit real,
    credit_limit_group text not null default '', is_shared_to_household integer not null default 0,
    custom_group text not null default ''
  );`;

// Repair-era shapes: migration-1 plus the ensure-columns the repairs read/seed
// (`base_quantity`, `account_id` on assets; `cashless` on records). This is the
// version right BEFORE the cash-leak / merge repairs were added.
const REPAIR_ERA_ASSETS = `
  create table portfolio_assets (
    id text primary key, space_id text not null, revision integer not null,
    created_at text not null, updated_at text not null, deleted_at text,
    ticker text not null, name text not null, currency text not null,
    total_quantity real not null, average_cost real not null,
    holding_source text not null default 'transactions', acquisition_date text,
    account_id text, base_quantity real
  );`;

const REPAIR_ERA_RECORDS = `
  create table investment_records (
    id text primary key, space_id text not null, revision integer not null,
    created_at text not null, updated_at text not null, deleted_at text,
    asset_id text not null, linked_account_id text, date text not null,
    action text not null, price real not null, quantity real not null, fee real not null,
    note text not null, is_reviewed integer not null default 0,
    linked_ledger_transaction_id text, cashless integer not null default 0
  );`;

const LEDGER_MIGRATION_1 = `
  create table ledger_transactions (
    id text primary key, space_id text not null, revision integer not null,
    created_at text not null, updated_at text not null, deleted_at text,
    account_id text not null, counter_account_id text, date text not null,
    amount real not null, currency text not null, category text not null,
    subcategory text not null default '', merchant text not null default '',
    entry_type text not null default 'expense', settlement_status text not null default 'settled',
    note text not null, linked_investment_record_id text, group_id text,
    is_reviewed integer not null default 0, receipt_attachment_id text,
    recurring_occurrence_key text, installment_group_id text, installment_index integer,
    installment_total integer, refund_of_ledger_id text
  );`;

async function seedAccount(
  db: RawDb,
  id: string,
  openingBalance: number,
  balance: number,
  type = "bank",
) {
  await db.execute(
    `insert into accounts (id, space_id, revision, created_at, updated_at, deleted_at, name, currency, opening_balance, balance, type, credit_limit, credit_limit_group, is_shared_to_household, custom_group)
     values ($1,$2,1,$3,$3,null,$4,'TWD',$5,$6,$7,null,'',0,'')`,
    [id, SPACE, TS, id, openingBalance, balance, type],
  );
}

// Seed the pre-repair cash-leak shape: a cashless opening lot (`cashless = 1`)
// whose linked settled ledger leg (−2000) should be tombstoned by initialize().
// Stored account balance is the leaked 98000; the repair restores it to 100000.
async function seedCashLeak(db: RawDb) {
  await seedAccount(db, "acct_1", 100000, 98000, "investment");
  await db.execute(
    `insert into portfolio_assets (id, space_id, revision, created_at, updated_at, deleted_at, ticker, name, currency, total_quantity, average_cost, holding_source, acquisition_date, account_id, base_quantity)
     values ('asset_x',$1,1,$2,$2,null,'2317.TW','鴻海','TWD',5,500,'manual','2026-01-01','acct_1',5)`,
    [SPACE, TS],
  );
  await db.execute(
    `insert into investment_records (id, space_id, revision, created_at, updated_at, deleted_at, asset_id, linked_account_id, date, action, price, quantity, fee, note, is_reviewed, linked_ledger_transaction_id, cashless)
     values ('inv_open_asset_x',$1,1,$2,$2,null,'asset_x','acct_1','2026-01-01','buy',500,5,0,'期初部位',1,'led_bad',1)`,
    [SPACE, TS],
  );
  await db.execute(
    `insert into ledger_transactions (id, space_id, revision, created_at, updated_at, deleted_at, account_id, counter_account_id, date, amount, currency, category, subcategory, merchant, entry_type, settlement_status, note, linked_investment_record_id, group_id, is_reviewed, receipt_attachment_id, recurring_occurrence_key, installment_group_id, installment_index, installment_total, refund_of_ledger_id)
     values ('led_bad',$1,1,$2,$2,null,'acct_1',null,'2026-01-01',-2000,'TWD','投資','','','expense','settled','','inv_open_asset_x',null,0,null,null,null,null,null,null)`,
    [SPACE, TS],
  );
}

describe("legacy-schema migration + repair chain", () => {
  it("upgrades an older schema: re-adds dropped columns, keeps rows and balances", async () => {
    const { db, shim } = makeRawDb();
    await db.execute(ACCOUNTS_MIGRATION_1);
    await db.execute(LEGACY_LEDGER_NO_MERCHANT);
    await db.execute(LEGACY_ASSETS_NO_ACQ_DATE);
    await db.execute(LEGACY_RECURRING_NO_MERCHANT);

    // 100000 opening − 500 settled expense = 99500 already stored (correct);
    // no repair applies, so recompute must leave it exactly 99500.
    await seedAccount(db, "acct_1", 100000, 99500);
    await db.execute(
      `insert into ledger_transactions (id, space_id, revision, created_at, updated_at, deleted_at, account_id, counter_account_id, date, amount, currency, category, subcategory, entry_type, settlement_status, note, linked_investment_record_id, group_id, is_reviewed, receipt_attachment_id, recurring_occurrence_key, installment_group_id, installment_index, installment_total, refund_of_ledger_id)
       values ('led_1',$1,1,$2,$2,null,'acct_1',null,'2026-06-01',-500,'TWD','餐飲','','expense','settled','午餐',null,null,0,null,null,null,null,null,null)`,
      [SPACE, TS],
    );
    await db.execute(
      `insert into portfolio_assets (id, space_id, revision, created_at, updated_at, deleted_at, ticker, name, currency, total_quantity, average_cost, holding_source)
       values ('asset_1',$1,1,$2,$2,null,'2330.TW','台積電','TWD',10,500,'transactions')`,
      [SPACE, TS],
    );
    await db.execute(
      `insert into recurring_transactions (id, space_id, revision, created_at, updated_at, deleted_at, account_id, counter_account_id, amount, currency, category, subcategory, entry_type, settlement_status, note, day_of_month, next_run_date, is_active)
       values ('rec_1',$1,1,$2,$2,null,'acct_1',null,-1000,'TWD','訂閱','','expense','settled','Netflix',5,'2026-07-05',1)`,
      [SPACE, TS],
    );

    const repo = await createSqliteFinanceRepositoryForTests(shim as never);

    // (a) The dropped columns now exist.
    expect(await pragmaColumns(db, "ledger_transactions")).toContain("merchant");
    expect(await pragmaColumns(db, "portfolio_assets")).toContain("acquisition_date");
    expect(await pragmaColumns(db, "recurring_transactions")).toContain("merchant");

    // (b) Seeded rows are still readable through the repository list methods.
    const ledger = await repo.listLedgerTransactions();
    expect(ledger.find((r) => r.id === "led_1")?.merchant).toBe("");
    const assets = await repo.listPortfolioAssets();
    expect(assets.find((a) => a.id === "asset_1")?.ticker).toBe("2330.TW");
    const recurring = await repo.listRecurringTransactions();
    expect(recurring.find((r) => r.id === "rec_1")?.merchant).toBe("");

    // (c) Balance unchanged where no repair applies.
    const accounts = await repo.listAccounts();
    expect(accounts).toHaveLength(1);
    expect(accounts.find((a) => a.id === "acct_1")?.balance).toBe(99500);
  });

  it("cash-leak repair: tombstones the settled leg of a cashless opening lot", async () => {
    const { db, shim } = makeRawDb();
    await db.execute(ACCOUNTS_MIGRATION_1);
    await db.execute(LEDGER_MIGRATION_1);
    await db.execute(REPAIR_ERA_ASSETS);
    await db.execute(REPAIR_ERA_RECORDS);
    await seedCashLeak(db);

    const repo = await createSqliteFinanceRepositoryForTests(shim as never);

    // The bad leg is tombstoned...
    const legRows = await db.select<Array<{ deleted_at: string | null }>>(
      `select deleted_at from ledger_transactions where id = 'led_bad'`,
    );
    expect(legRows[0]?.deleted_at).not.toBeNull();

    // ...the account balance excludes it...
    const accounts = await repo.listAccounts();
    expect(accounts.find((a) => a.id === "acct_1")?.balance).toBe(100000);

    // ...and the record's ledger link is cleared.
    const records = await repo.listInvestmentRecords();
    expect(records.find((r) => r.id === "inv_open_asset_x")?.linkedLedgerTransactionId ?? null).toBeNull();
  });

  it("asset merge: collapses a manual+transaction split for one ticker", async () => {
    const { db, shim } = makeRawDb();
    await db.execute(ACCOUNTS_MIGRATION_1);
    await db.execute(LEDGER_MIGRATION_1);
    await db.execute(REPAIR_ERA_ASSETS);
    await db.execute(REPAIR_ERA_RECORDS);

    await seedAccount(db, "acct_1", 100000, 100000, "investment");
    // Two live assets for the same ticker: one manual, one transactions.
    await db.execute(
      `insert into portfolio_assets (id, space_id, revision, created_at, updated_at, deleted_at, ticker, name, currency, total_quantity, average_cost, holding_source, acquisition_date, account_id, base_quantity)
       values ('asset_m',$1,1,$2,$2,null,'2330.TW','台積電','TWD',5,500,'manual','2026-01-01','acct_1',5)`,
      [SPACE, TS],
    );
    await db.execute(
      `insert into portfolio_assets (id, space_id, revision, created_at, updated_at, deleted_at, ticker, name, currency, total_quantity, average_cost, holding_source, acquisition_date, account_id, base_quantity)
       values ('asset_t',$1,1,$2,$2,null,'2330.TW','台積電','TWD',3,600,'transactions',null,null,null)`,
      [SPACE, TS],
    );
    // A record pointing at the transactions asset — must be re-pointed on merge.
    await db.execute(
      `insert into investment_records (id, space_id, revision, created_at, updated_at, deleted_at, asset_id, linked_account_id, date, action, price, quantity, fee, note, is_reviewed, linked_ledger_transaction_id, cashless)
       values ('rec_buy',$1,1,$2,$2,null,'asset_t','acct_1','2026-03-01','buy',600,3,0,'',0,null,0)`,
      [SPACE, TS],
    );

    const repo = await createSqliteFinanceRepositoryForTests(shim as never);

    // One survivor for the ticker, and it is the manual asset.
    const live = (await repo.listPortfolioAssets()).filter((a) => a.ticker === "2330.TW");
    expect(live).toHaveLength(1);
    expect(live[0].id).toBe("asset_m");
    expect(live[0].holdingSource).toBe("manual");

    // The record is re-pointed onto the survivor.
    const records = await repo.listInvestmentRecords();
    expect(records.find((r) => r.id === "rec_buy")?.assetId).toBe("asset_m");

    // The transactions asset is tombstoned.
    const tombstoned = await db.select<Array<{ deleted_at: string | null }>>(
      `select deleted_at from portfolio_assets where id = 'asset_t'`,
    );
    expect(tombstoned[0]?.deleted_at).not.toBeNull();
  });

  it("is idempotent: a second initialize() mutates no data", async () => {
    const { db, shim } = makeRawDb();
    await db.execute(ACCOUNTS_MIGRATION_1);
    await db.execute(LEDGER_MIGRATION_1);
    await db.execute(REPAIR_ERA_ASSETS);
    await db.execute(REPAIR_ERA_RECORDS);
    // The first initialize() (run by the factory) fires the tombstone +
    // link-clear repairs. A second pass must be a total no-op — no revision
    // bump, no updated_at churn, no re-tombstone.
    await seedCashLeak(db);

    const repo = await createSqliteFinanceRepositoryForTests(shim as never);

    const fingerprint = async () => {
      const acc = await db.select(`select id, revision, updated_at, deleted_at, balance from accounts order by id`);
      const led = await db.select(`select id, revision, updated_at, deleted_at, amount from ledger_transactions order by id`);
      const inv = await db.select(`select id, revision, updated_at, deleted_at, linked_ledger_transaction_id from investment_records order by id`);
      const ast = await db.select(`select id, revision, updated_at, deleted_at, total_quantity, average_cost from portfolio_assets order by id`);
      return JSON.stringify({ acc, led, inv, ast });
    };

    const before = await fingerprint();
    await repo.initialize();
    const after = await fingerprint();

    expect(after).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// Plan 259: secondary indexes for the high-volume ledger/investment tables.
// ---------------------------------------------------------------------------

const PLAN_259_INDEX_NAMES = [
  "idx_ledger_group",
  "idx_ledger_account",
  "idx_ledger_counter_account",
  "idx_ledger_installment_group",
  "idx_ledger_linked_investment",
  "idx_investment_asset",
  "idx_investment_linked_account",
  "idx_investment_drip_group",
  "idx_portfolio_assets_ticker",
  "idx_invoices_linked_ledger",
  "idx_invoices_book",
  "idx_clients_book",
  "idx_accounts_book",
];

async function listIdxIndexNames(db: RawDb): Promise<string[]> {
  const rows = await db.select<Array<{ name: string }>>(
    `select name from sqlite_master where type = 'index' and name like 'idx_%'`,
  );
  return rows.map((r) => r.name);
}

describe("plan 259: secondary indexes", () => {
  it("creates every new index on a fresh database", async () => {
    const { db, shim } = makeRawDb();
    await createSqliteFinanceRepositoryForTests(shim as never);

    const names = await listIdxIndexNames(db);
    for (const idx of PLAN_259_INDEX_NAMES) {
      expect(names).toContain(idx);
    }
  });

  it("is idempotent: a second initialize() does not change the index count", async () => {
    const { db, shim } = makeRawDb();
    const repo = await createSqliteFinanceRepositoryForTests(shim as never);

    const before = (await listIdxIndexNames(db)).sort();
    await expect(repo.initialize()).resolves.not.toThrow();
    const after = (await listIdxIndexNames(db)).sort();

    expect(after).toEqual(before);
  });
});
