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

/**
 * 資料庫「世代」— the generation of the *whole* startup schema pipeline, not just
 * the `migrations` array above.
 *
 * `TauriSqlFinanceRepository.initialize()` runs a long, strictly idempotent
 * block: the migrations, ~64 `ensureSqliteColumn()` probes, the one-time data
 * repairs, the sync triggers, and the 帳本 / 信用卡群組 / sync_outbox backfills.
 * Re-running that block on a database that has already reached generation N
 * cannot change it — so we stamp the file's `PRAGMA user_version` with this
 * number and skip the block when it already matches. That removes ~150
 * sequential IPC round trips and 11 full-table scans from every cold start
 * (plan 260).
 *
 * ⚠️ BUMP THIS whenever you add ANYTHING to that gated block — a migration, an
 * `ensureSqliteColumn()` call, a repair statement, a trigger, or a backfill.
 * Forgetting to bump it means existing installs never receive your change and
 * will fail at runtime with "no such column". There is a test that fails if the
 * gated block runs on a stamped database, but nothing can detect a forgotten
 * bump for you — treat it as part of writing the migration.
 */
export const SCHEMA_GENERATION = 10;

export function splitSqlStatements(sql: string): string[] {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}
