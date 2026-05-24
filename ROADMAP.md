# Northstar Roadmap

## Phase 1 — Tauri Foundation

- Scaffold React + TypeScript + Vite inside Tauri 2.
- Establish Tailwind v4, Base UI, Phosphor Icons, TanStack Router/Query/Table, Zustand, React Hook Form, Zod, Recharts.
- Build the first app shell: Dashboard, Holdings, Transactions, Cash Flow, Accounts, Settings.
- Remove Swift/Xcode active code after archiving it on GitHub.

## Phase 2 — Local Data Core

- Wire SQLite through the Tauri SQL plugin.
- Add migrations and typed repositories.
- Port Swift domain rules into TypeScript with Vitest coverage.
- Keep local-only mode fully usable without account login.

## Phase 3 — Market Data

- Use Yahoo Finance as the first quote/history/FX provider.
- Add provider interface so Yahoo can be replaced later.
- Cache quotes for 60 seconds and FX for 5 minutes.
- Surface source, last-updated, stale, and error states.

## Phase 4 — Connect E2EE

- Add Supabase Auth for identity.
- Generate Personal Vault Key before sync.
- Require Recovery Kit confirmation before any cloud-backed feature.
- Add trusted-device pairing and encrypted key envelopes.
- Add encrypted record-level sync envelopes.

## Phase 5 — Household Sharing

- Add Household Space Key.
- Invite partner through account invite and pairing flow.
- Share selected accounts as encrypted household projections.
- Keep private notes and receipts excluded unless explicitly shared.

## Phase 6 — Plus Capabilities

- Licensed market data.
- Broker sync where reliable.
- AI-assisted categorization and insights with provider-included plans.
- Tax and reporting depth for Taiwan investors.

