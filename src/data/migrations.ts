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
        is_shared_to_household integer not null default 0
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
        note text not null,
        linked_investment_record_id text,
        group_id text,
        is_reviewed integer not null default 0,
        receipt_attachment_id text
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
        average_cost real not null
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
    `,
  },
];

