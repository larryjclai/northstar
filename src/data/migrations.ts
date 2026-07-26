import type { SyncEntity } from "../domain/sync";

export interface Migration {
  id: number;
  description: string;
  sql: string;
}

export const migrations: Migration[] = [
  {
    id: 1,
    description: "Initial local-first finance schema",
    sql: `
      create table if not exists accounts (
        id text primary key,
        space_id text not null,
        revision integer not null,
        created_at text not null,
        updated_at text not null,
        deleted_at text,
        name text not null,
        currency text not null,
        opening_balance real not null,
        balance real not null,
        type text not null,
        credit_limit real,
        credit_limit_group text not null default '',
        is_shared_to_household integer not null default 0,
        custom_group text not null default ''
      );

      create table if not exists ledger_transactions (
        id text primary key,
        space_id text not null,
        revision integer not null,
        created_at text not null,
        updated_at text not null,
        deleted_at text,
        account_id text not null,
        counter_account_id text,
        date text not null,
        amount real not null,
        currency text not null,
        category text not null,
        subcategory text not null default '',
        merchant text not null default '',
        entry_type text not null default 'expense',
        settlement_status text not null default 'settled',
        note text not null,
        linked_investment_record_id text,
        group_id text,
        is_reviewed integer not null default 0,
        receipt_attachment_id text,
        recurring_occurrence_key text,
        installment_group_id text,
        installment_index integer,
        installment_total integer,
        refund_of_ledger_id text
      );

      create table if not exists portfolio_assets (
        id text primary key,
        space_id text not null,
        revision integer not null,
        created_at text not null,
        updated_at text not null,
        deleted_at text,
        ticker text not null,
        name text not null,
        currency text not null,
        total_quantity real not null,
        average_cost real not null,
        holding_source text not null default 'transactions',
        acquisition_date text
      );

      create table if not exists investment_records (
        id text primary key,
        space_id text not null,
        revision integer not null,
        created_at text not null,
        updated_at text not null,
        deleted_at text,
        asset_id text not null,
        linked_account_id text,
        date text not null,
        action text not null,
        price real not null,
        quantity real not null,
        fee real not null,
        note text not null,
        is_reviewed integer not null default 0,
        linked_ledger_transaction_id text
      );

      create table if not exists recurring_transactions (
        id text primary key,
        space_id text not null,
        revision integer not null,
        created_at text not null,
        updated_at text not null,
        deleted_at text,
        account_id text not null,
        counter_account_id text,
        amount real not null,
        currency text not null,
        category text not null,
        subcategory text not null default '',
        merchant text not null default '',
        entry_type text not null default 'expense',
        settlement_status text not null default 'settled',
        note text not null,
        day_of_month integer not null,
        next_run_date text not null,
        is_active integer not null default 1
      );

      create table if not exists sync_outbox (
        id text primary key,
        space_id text not null,
        record_type text not null,
        record_id text not null,
        revision integer not null,
        encrypted_payload text,
        created_at text not null,
        pushed_at text
      );

      create table if not exists market_quotes (
        symbol text primary key,
        name text not null,
        currency text not null,
        price real not null,
        change real not null,
        change_percent real not null,
        market_time text,
        source text not null,
        updated_at text not null
      );

      create table if not exists app_settings (
        key text primary key,
        value text not null,
        updated_at text not null
      );

      create table if not exists fx_rates (
        currency_from text not null,
        currency_to text not null,
        date text not null,
        rate real not null,
        source text not null,
        updated_at text not null,
        primary key (currency_from, currency_to, date)
      );

      create index if not exists idx_fx_rates_pair_date on fx_rates (currency_from, currency_to, date);

      create table if not exists daily_prices (
        ticker text not null,
        date text not null,
        close real not null,
        currency text not null default '',
        source text not null,
        updated_at text not null,
        primary key (ticker, date)
      );

      create index if not exists idx_daily_prices_ticker_date on daily_prices (ticker, date);
    `,
  },
  {
    id: 2,
    description: "Goals table for FIRE and future custom targets",
    sql: `
      create table if not exists financial_goals (
        id text primary key,
        space_id text not null,
        revision integer not null,
        created_at text not null,
        updated_at text not null,
        deleted_at text,
        kind text not null default 'fire',
        name text not null,
        currency text not null,
        annual_spending real not null default 0,
        withdrawal_rate real not null default 0.04,
        expected_annual_return real not null default 0.07,
        monthly_contribution real not null default 0,
        target_amount real,
        start_date text not null
      );
    `,
  },
  {
    id: 3,
    description: "Manual price snapshots for assets not tracked by Yahoo Finance",
    sql: `
      create table if not exists manual_price_snapshots (
        id text primary key,
        asset_id text not null,
        date text not null,
        price real not null,
        note text not null default '',
        created_at text not null
      );

      create index if not exists idx_manual_price_snapshots_asset_date on manual_price_snapshots (asset_id, date);
    `,
  },
  {
    id: 4,
    description: "Recurring investment plans (定期定額 / 定期定股)",
    sql: `
      create table if not exists recurring_investments (
        id text primary key,
        space_id text not null,
        revision integer not null,
        created_at text not null,
        updated_at text not null,
        deleted_at text,
        account_id text not null,
        ticker text not null,
        name text not null default '',
        currency text not null,
        mode text not null default 'fixedAmount',
        amount real not null default 0,
        quantity real not null default 0,
        price real not null default 0,
        fee real not null default 0,
        frequency text not null default 'monthly',
        day_of_month integer not null default 1,
        next_run_date text not null,
        is_active integer not null default 1
      );
    `,
  },
  {
    id: 5,
    description: "帳本 (Books) — partition accounts into 個人帳 / 公司帳 (plan 188)",
    sql: `
      create table if not exists books (
        id text primary key,
        space_id text not null,
        revision integer not null,
        created_at text not null,
        updated_at text not null,
        deleted_at text,
        name text not null,
        kind text not null default 'personal',
        include_in_personal_net_worth integer not null default 1,
        include_in_fire_metrics integer not null default 1,
        color text
      );
    `,
  },
  {
    id: 6,
    description: "發票 (Invoices) — 開發票 metadata linking to a receivable ledger row (plan 190)",
    sql: `
      create table if not exists invoices (
        id text primary key,
        space_id text not null,
        revision integer not null,
        created_at text not null,
        updated_at text not null,
        deleted_at text,
        book_id text not null default '',
        client_id text,
        invoice_number text not null default '',
        issue_date text not null,
        due_date text,
        amount real not null default 0,
        tax_exclusive_amount real not null default 0,
        tax_amount real not null default 0,
        settled_at text,
        linked_ledger_transaction_id text
      );
    `,
  },
  {
    id: 7,
    description: "客戶主檔 (Clients) — invoice counterparties (plan 190)",
    sql: `
      create table if not exists clients (
        id text primary key,
        space_id text not null,
        revision integer not null,
        created_at text not null,
        updated_at text not null,
        deleted_at text,
        book_id text not null default '',
        name text not null default '',
        tax_id text not null default '',
        default_payment_terms real
      );
    `,
  },
  {
    id: 8,
    description: "信用卡群組 (Credit groups) — first-class shared billing cycle + limit (plan 254)",
    sql: `
      create table if not exists credit_groups (
        id text primary key,
        space_id text not null,
        revision integer not null,
        created_at text not null,
        updated_at text not null,
        deleted_at text,
        name text not null default '',
        currency text not null,
        credit_limit real,
        statement_day integer,
        payment_due_day integer
      );
    `,
  },
  {
    id: 9,
    description: "Secondary indexes for the high-volume ledger/investment tables",
    sql: `
      -- Every one of these columns is queried on a hot path but was a full table
      -- scan until now (see plan 259). All are additive: they change no query
      -- result, only how SQLite reaches the rows.

      -- Split/fee/transfer legs are grouped by group_id; every edit, delete and
      -- reconcile of a grouped transaction fans out through it.
      create index if not exists idx_ledger_group on ledger_transactions (group_id)
        where group_id is not null and deleted_at is null;

      -- Account balance derivation and the delete-guard both filter by
      -- "account_id = ? or counter_account_id = ?". SQLite can only use an
      -- index per side of an OR, so both sides need their own.
      create index if not exists idx_ledger_account on ledger_transactions (account_id)
        where deleted_at is null;
      create index if not exists idx_ledger_counter_account on ledger_transactions (counter_account_id)
        where counter_account_id is not null and deleted_at is null;

      -- 分期 (installments): the whole schedule is rewritten by group.
      create index if not exists idx_ledger_installment_group on ledger_transactions (installment_group_id)
        where installment_group_id is not null and deleted_at is null;

      -- The cashless-leak repair in initialize() joins ledger legs back to their
      -- investment record through this column.
      create index if not exists idx_ledger_linked_investment on ledger_transactions (linked_investment_record_id)
        where linked_investment_record_id is not null;

      -- recomputeSqliteAssets and the per-asset guards group records by asset.
      create index if not exists idx_investment_asset on investment_records (asset_id)
        where deleted_at is null;
      create index if not exists idx_investment_linked_account on investment_records (linked_account_id)
        where deleted_at is null;

      -- Ticker lookups drive holding identity (manual vs transactions split).
      create index if not exists idx_portfolio_assets_ticker on portfolio_assets (ticker)
        where deleted_at is null;

      -- 帳本 (books) membership counts, and invoice settlement by ledger leg.
      create index if not exists idx_invoices_linked_ledger on invoices (linked_ledger_transaction_id)
        where deleted_at is null;
      create index if not exists idx_invoices_book on invoices (book_id) where deleted_at is null;
      create index if not exists idx_clients_book on clients (book_id) where deleted_at is null;

      -- NOTE: accounts.book_id is NOT indexed here — that column is added by
      -- ensureSqliteColumn(), which runs after this migration. See below.
    `,
  },
  // NOTE: extension columns for `financial_goals` (retirement projection
  // inputs) are added via `ensureSqliteColumn` calls inside the SQLite
  // initialize() routine, not via a sql migration. SQLite's bare
  // `ALTER TABLE ADD COLUMN` would fail when run a second time, and the
  // ensure-column helper inspects `pragma table_info` first to stay
  // idempotent across restarts and reseeds. `accounts.book_id` follows this
  // same pattern (see initialize()), not a migration ALTER. `accounts.
  // credit_group_id` (plan 254/255) follows the same ensure-column pattern.
];

export function splitSqlStatements(sql: string): string[] {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

/**
 * Additive columns applied after the `migrations` array. SQLite has no
 * `add column if not exists`, so these are applied by probing the table first
 * (see TauriSqlFinanceRepository.ensureSqliteColumn).
 *
 * This list is DECLARATIVE ON PURPOSE (plan 268): it is both the thing that gets
 * executed and the thing that gets fingerprinted, so adding a column here
 * automatically invalidates the startup DDL gate. Never apply a column by
 * calling ensureSqliteColumn() directly from initialize() — it would run, but it
 * would not be part of the fingerprint, and existing installs would silently
 * miss it.
 */
export const ADDITIVE_COLUMNS: ReadonlyArray<
  readonly [table: string, column: string, definition: string]
> = [
  ["ledger_transactions", "merchant", "text not null default ''"],
  ["ledger_transactions", "name", "text not null default ''"],
  ["ledger_transactions", "entry_type", "text not null default 'expense'"],
  ["ledger_transactions", "subcategory", "text not null default ''"],
  ["ledger_transactions", "settlement_status", "text not null default 'settled'"],
  ["accounts", "credit_limit", "real"],
  ["accounts", "credit_limit_group", "text not null default ''"],
  ["recurring_transactions", "subcategory", "text not null default ''"],
  ["recurring_transactions", "merchant", "text not null default ''"],
  ["recurring_transactions", "entry_type", "text not null default 'expense'"],
  ["recurring_transactions", "settlement_status", "text not null default 'settled'"],
  ["recurring_transactions", "frequency", "text not null default 'monthly'"],
  ["accounts", "loan_start_date", "text"],
  ["accounts", "annual_interest_rate", "real"],
  ["accounts", "loan_term", "real"],
  ["accounts", "icon_name", "text"],
  ["accounts", "color", "text"],
  ["accounts", "bank_brand_domain", "text"],
  ["accounts", "statement_day", "integer"],
  ["accounts", "credit_payment_paid_until", "text"],
  ["accounts", "payment_due_day", "integer"],
  ["accounts", "custom_group", "text not null default ''"],
  // 帳本 (Books, plan 188): the `books` table is created via migration 5; the
  // join column is additive on `accounts`. Empty string is the "unassigned"
  // sentinel that ensureSqliteDefaultBook() replaces with the default 個人帳.
  ["accounts", "book_id", "text not null default ''"],
  // 信用卡群組 (Credit groups, plan 254/255): additive join column on
  // `accounts`. Null means ungrouped — statementDay/paymentDueDay/creditLimit
  // stay on the account's own columns (derive-on-read only kicks in when set).
  ["accounts", "credit_group_id", "text"],
  ["portfolio_assets", "holding_source", "text not null default 'transactions'"],
  ["portfolio_assets", "acquisition_date", "text"],
  ["portfolio_assets", "name_zh", "text"],
  ["portfolio_assets", "name_en", "text"],
  ["portfolio_assets", "account_id", "text"],
  ["portfolio_assets", "asset_type", "text"],
  ["portfolio_assets", "sector", "text"],
  ["portfolio_assets", "industry", "text"],
  ["portfolio_assets", "sector_canonical", "text"],
  ["portfolio_assets", "base_quantity", "real"],
  ["portfolio_assets", "classification_locked", "integer not null default 0"],
  ["investment_records", "cashless", "integer not null default 0"],
  // 股息再投入 (DRIP): links a record's cashDividend + buy legs. Null for non-DRIP.
  ["investment_records", "drip_group_id", "text"],
  // Retirement-projection extensions for financial_goals. Each one is
  // optional at the DB level — readers coalesce missing values to the
  // sane defaults documented in `goalFieldsFromDraft`.
  ["financial_goals", "current_age", "real"],
  ["financial_goals", "retirement_age", "real"],
  ["financial_goals", "plan_through_age", "real"],
  ["financial_goals", "pre_retirement_return", "real"],
  ["financial_goals", "post_retirement_return", "real"],
  ["financial_goals", "inflation_rate", "real"],
  ["financial_goals", "annual_fee", "real"],
  ["financial_goals", "contribution_growth_rate", "real"],
  ["financial_goals", "spending_items", "text"],
  ["financial_goals", "income_items", "text"],
  ["financial_goals", "display_mode", "text"],
  ["financial_goals", "account_share_map", "text"],
  ["financial_goals", "target_date", "text"],
  ["ledger_transactions", "recurring_rule_id", "text"],
  ["ledger_transactions", "original_amount", "real"],
  ["ledger_transactions", "original_currency", "text"],
  ["ledger_transactions", "recurring_occurrence_key", "text"],
  ["ledger_transactions", "counter_account_id", "text"],
  ["ledger_transactions", "installment_group_id", "text"],
  ["ledger_transactions", "installment_index", "integer"],
  ["ledger_transactions", "installment_total", "integer"],
  ["ledger_transactions", "refund_of_ledger_id", "text"],
  ["ledger_transactions", "post_date", "text"],
  ["ledger_transactions", "leg_kind", "text"],
  ["recurring_transactions", "counter_account_id", "text"],
  // These two columns are added by ensureSqliteColumn() above, not by a
  // create-table migration, so their indexes cannot live in migration 9 —
  // it runs before those columns exist (plan 259).
  ["sync_outbox", "updated_at", "text"],
  ["sync_outbox", "deleted_at", "text"],
] as const;

/** Indexes that cannot live in a migration because their column is added above. */
export const ADDITIVE_INDEXES: readonly string[] = [
  `create unique index if not exists idx_ledger_recurring_occurrence on ledger_transactions (recurring_occurrence_key) where recurring_occurrence_key is not null and deleted_at is null`,
  `create index if not exists idx_investment_drip_group on investment_records (drip_group_id) where drip_group_id is not null and deleted_at is null`,
  `create index if not exists idx_accounts_book on accounts (book_id) where deleted_at is null`,
];

/**
 * Every sync-tracked table paired with its sync entity name. Feeds both the
 * outbox-trigger creation (`ensureSyncTriggers`) and the outbox backfill
 * (`backfillSyncOutbox`) — previously duplicated verbatim in both places, which
 * meant a new synced entity had to be added twice or the two sets would drift
 * apart. Exported here so both call sites import the same list, and so it feeds
 * `schemaFingerprint()` (plan 268).
 */
export const SYNC_TRIGGER_ENTITIES: ReadonlyArray<
  readonly [string, Exclude<SyncEntity, "settings">]
> = [
  ["accounts", "account"],
  ["ledger_transactions", "ledger"],
  ["portfolio_assets", "asset"],
  ["investment_records", "investment"],
  ["recurring_transactions", "recurring"],
  ["recurring_investments", "recurringInvestment"],
  ["financial_goals", "goal"],
  ["books", "book"],
  ["invoices", "invoice"],
  ["clients", "client"],
  ["credit_groups", "creditGroup"],
];

/**
 * Fingerprint of the entire DDL definition: the migrations, the additive
 * columns, the additive indexes, and the sync-trigger entity list. Stamped into
 * `PRAGMA user_version` after the DDL phase runs, and compared on the next
 * launch to decide whether the phase can be skipped (plan 268).
 *
 * SELF-INVALIDATING BY DESIGN. There is no constant to bump: change any DDL
 * above and this number changes, so the phase re-runs on every existing install.
 * That is the whole point — a hand-maintained version constant fails silently
 * when someone forgets it, and "existing databases never get the new column" is
 * the worst bug this area can produce.
 *
 * FNV-1a, masked to 31 bits because PRAGMA user_version is a signed 32-bit int.
 * Collision risk is irrelevant here: a collision means one skipped DDL pass on
 * one schema revision, and every statement in that pass is `if not exists`
 * anyway — the next change re-runs it.
 */
export function schemaFingerprint(): number {
  const source = JSON.stringify([
    migrations.map((m) => [m.id, m.sql]),
    ADDITIVE_COLUMNS,
    ADDITIVE_INDEXES,
    SYNC_TRIGGER_ENTITIES,
  ]);
  let hash = 0x811c9dc5;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) & 0x7fffffff;
}
