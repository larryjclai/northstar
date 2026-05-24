# Northstar Architecture

## App Boundary

Northstar is a Tauri 2 app with a React/TypeScript frontend and Rust native shell. The frontend owns product UI, domain logic, and local-first workflows. Rust/Tauri owns native packaging, plugin access, SQLite, secure storage, and future platform integrations.

## Local Data

SQLite is the source of truth. Every domain object includes sync-ready metadata from day one:

- `id`
- `spaceId`
- `revision`
- `createdAt`
- `updatedAt`
- `deletedAt`

Repositories hide storage details from UI components. Local-only mode must keep working without Supabase.

## Market Data

Market data flows through `MarketDataProvider`. The first implementation is Yahoo Finance:

- chart endpoint for quote/history
- search endpoint for symbols
- FX pairs such as `USDTWD=X`
- default range `1y`, interval `1d`
- 60-second quote cache and 5-minute FX cache

Yahoo is acceptable for v1 but treated as replaceable.

## Connect And E2EE

Supabase is infrastructure, not a readable finance backend.

Supabase may store:

- encrypted sync envelopes
- encrypted key envelopes
- device metadata
- household membership metadata
- subscription metadata
- encrypted attachment blobs

Supabase must not store readable:

- transactions
- holdings
- balances
- cost basis
- net worth
- performance analytics

Account login answers "who is this user?" It does not answer "can this device decrypt the vault?"

## Key Model

- Personal Vault Key protects each user's private data.
- Household Space Key protects shared household projections.
- Trusted-device pairing is the preferred new-device path.
- Recovery Kit is the fallback when no trusted device is available.

## Sync Model

Sync uses record-level encrypted envelopes, not whole-database overwrite.

Local write flow:

1. Write to SQLite.
2. Append mutation to local outbox.
3. Encrypt payload locally.
4. Push encrypted envelope to Supabase.
5. Other devices pull by cursor, decrypt locally, and apply revisions.

Realtime is only a notification channel.

## Household Sharing

Household sharing does not expose a full personal vault. A user chooses accounts to share. Northstar publishes encrypted projections into a household space. Private notes and receipts are excluded by default.

