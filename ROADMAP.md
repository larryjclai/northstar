# Northstar Roadmap

This roadmap is organized around shippable local-first milestones. Phase 1-6 make the app genuinely useful offline before Connect, Recovery Kit, and household sync are added.

## Phase 1 — Local SQLite Foundation ✅

- Initialize the Tauri SQL plugin with `sqlite:northstar.db`.
- Run idempotent migrations at app startup.
- Replace direct seeded data reads with a typed repository boundary.
- Keep a browser/dev fallback repository so the React app remains testable outside the Tauri shell.
- Seed demo data only when the local database is empty.
- Preserve sync-ready fields on all records: `id`, `spaceId`, `revision`, `createdAt`, `updatedAt`, `deletedAt`.

## Phase 2 — Accounts CRUD ✅

- Create, edit, and soft-delete accounts.
- Persist account changes locally.
- Keep `isSharedToHousehold` in the model, but do not expose real household sharing yet.
- Recompute account balances after ledger mutations.

## Phase 3 — Cash Flow CRUD ✅

- Create, edit, and soft-delete ledger transactions.
- Support income and expense rows.
- Preserve `groupId` for transfer/split compatibility.
- Evaluate amount expressions such as `120+85+30`.
- Recompute affected account balances after writes.

## Phase 3.5 — Transfers And Split Rows ✅

- Add same-currency and cross-currency transfer creation.
- Store transfer legs as grouped ledger rows.
- Render transfer groups as a single user-facing cash-flow row.
- Keep split/group classification in domain logic.

## Phase 4 — Investment Transactions CRUD ✅

- Create, edit, and soft-delete investment records.
- Create a portfolio asset when a new ticker appears.
- Recompute holdings after investment mutations.
- Keep linked cash-account wiring as the next refinement; the data model already supports it.

## Phase 5 — CSV Import / Export ✅

- Export accounts, ledger transactions, and investment records to CSV.
- Import ledger and investment records from CSV.
- Preview rows before committing imports.
- Report invalid rows with reasons.
- Recompute balances and holdings after import.

## Phase 6 — Yahoo Market Data UI ✅

- Add refresh actions in Dashboard and Holdings.
- Use Yahoo Finance as the first replaceable `MarketDataProvider`.
- Cache quotes locally with source and timestamp.
- Show source, last updated time, stale/error states.
- Keep Yahoo as v1-only infrastructure; licensed market data belongs in Connect Plus.

## Phase 7 — Connect Preparation

- Persist a real mutation outbox for all local CRUD writes.
- Add local device identity and vault metadata.
- Define encrypted sync envelope serialization.
- Add crypto abstraction with tests.

## Phase 8 — Recovery Kit

- Generate a Recovery Kit before Connect can be enabled.
- Store vault key material through Stronghold.
- Add user confirmation that the Recovery Kit was saved.
- Block cloud-backed features until recovery is ready.

## Phase 9 — Connect Sync

- Add Supabase Auth.
- Add Supabase schema, RLS, and Edge Functions.
- Push/pull encrypted envelopes by cursor.
- Add conflict review for sensitive financial record conflicts.
- Use Realtime only as a sync wake-up signal.

## Phase 10 — Household Sharing

- Create Household Spaces with a separate key.
- Invite a partner through account invite and pairing.
- Publish selected account projections into household space.
- Keep private vault records hidden by default.

