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
        recurring_occurrence_key text
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
  // NOTE: extension columns for `financial_goals` (retirement projection
  // inputs) are added via `ensureSqliteColumn` calls inside the SQLite
  // initialize() routine, not via a sql migration. SQLite's bare
  // `ALTER TABLE ADD COLUMN` would fail when run a second time, and the
  // ensure-column helper inspects `pragma table_info` first to stay
  // idempotent across restarts and reseeds.
];

export function splitSqlStatements(sql: string): string[] {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}
