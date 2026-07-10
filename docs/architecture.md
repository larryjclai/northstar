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

Repositories hide storage details from UI components. Local-only mode must keep working without the Connect Worker or any network.

## Market Data

Market data flows through `MarketDataProvider`. The first implementation is Yahoo Finance:

- chart endpoint for quote/history
- search endpoint for symbols
- FX pairs such as `USDTWD=X`
- default range `1y`, interval `1d`
- 60-second quote cache and 5-minute FX cache

Yahoo is acceptable for v1 but treated as replaceable.

## Connect And E2EE

The sync backend is the **Connect Worker** — a Cloudflare Worker (`worker/src/index.ts`) backed
by Cloudflare **D1** (SQLite at the edge). The frontend talks to it through
`src/features/connect/sync/client.ts`, pointed at `VITE_NORTHSTAR_SYNC_WORKER_URL` and
authenticated with a per-device `Authorization: Bearer <api_secret>` token. It is a blind relay,
not a readable finance backend. (An earlier design used a hosted SQL/Postgres backend; that is no
longer used — there is no such directory in the tree.)

The Worker exposes:

- `POST /users` — register a sync account + its first device (idempotent).
- `POST /devices`, `GET /devices`, `POST /devices/:id/credential` — device registration, listing,
  and per-device credential self-provisioning / revocation.
- `POST /envelopes`, `GET /envelopes?cursor=` — push and pull encrypted change records (the
  `sync_envelopes` table), ordered by a per-user `relay_sequence` cursor.
- `POST /keys/:target_device_id`, `GET /keys/:target_device_id` — the wrapped key-envelope mailbox.
- `POST /pairing`, `POST /pairing/join`, `GET /pairing/:code`, `GET /keys/:device` (with
  `X-Pairing-Token`) — ECDH pairing sessions for onboarding a new trusted device.

The Worker's D1 tables therefore hold only:

- encrypted sync envelopes
- encrypted (wrapped) key envelopes
- device metadata and credentials
- pairing session state
- household membership metadata (planned)

The Worker must never hold readable:

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
4. Push encrypted envelope to the Connect Worker (`POST /envelopes`).
5. Other devices pull by per-user `relay_sequence` cursor (`GET /envelopes?cursor=`), decrypt
   locally, and apply revisions.

There is no realtime push channel: devices pull on startup/focus (a debounced auto-push is planned — see ROADMAP 5.3).

## Household Sharing

Household sharing does not expose a full personal vault. A user chooses accounts to share. Northstar publishes encrypted projections into a household space. Private notes and receipts are excluded by default.

