# Plan 133: Worker + shell hardening (per-user relay sequence, rate limits, CSP connect-src, SQL capability)

> **Executor instructions**: Follow this plan step by step. The four items are
> independent — commit separately; on a per-item STOP, skip it and finish the
> rest. Run every verification command. When done, update the status row in
> `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 65fe04c1..HEAD -- worker/ src-tauri/tauri.conf.json src-tauri/capabilities/`
> Re-locate by grep; STOP per-item on mismatch.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW–MED (item C/D can break app features if over-tightened —
  verification steps included)
- **Depends on**: plans/129 (worker tests) recommended for items A/B
- **Category**: security
- **Planned at**: commit `65fe04c1`, 2026-07-09

## Why this matters

Defense-in-depth gaps, none independently critical: (A) the sync relay's
global sequence couples tenants — one account's concurrent pushes can 500
another's; (B) unauthenticated registration/pairing endpoints have no
throttle; (C) the desktop CSP allows `connect-src https:` (ANY host — an
injection bug would have a free exfiltration channel); (D) the webview holds
`sql:allow-execute` (arbitrary SQL) when scoped statements may suffice.

## Item A — Per-user relay sequence

`worker/src/index.ts` (~line 243) inside `handlePushEnvelopes`:

```ts
  const maxRow = await env.DB.prepare(
    "SELECT COALESCE(MAX(relay_sequence), 0) AS maxSeq FROM sync_envelopes",
  ).first<{ maxSeq: number }>();
  let nextSequence = (maxRow?.maxSeq ?? 0) + 1;
```

`worker/migrations/0003_relay_sequence.sql` creates
`CREATE UNIQUE INDEX idx_envelopes_sequence ON sync_envelopes(relay_sequence)`
— **global** — while the cursor index is already per-user
(`idx_envelopes_cursor ON sync_envelopes(user_id, relay_sequence)`), and
`handlePullEnvelopes` (read it, ~line 262-287) filters by `user_id` and
paginates on `relay_sequence`. Two concurrent pushes from DIFFERENT accounts
read the same MAX and collide on the UNIQUE index → 500 for one tenant.

Fix: new migration — drop `idx_envelopes_sequence`, create
`CREATE UNIQUE INDEX idx_envelopes_user_sequence ON
sync_envelopes(user_id, relay_sequence)`; scope the MAX query
`WHERE user_id = ?`. Pull semantics are unchanged (cursor was already
per-user). Existing rows keep their global values — still strictly increasing
per user, so cursors survive.

**Verify**: worker tests: two users push concurrently-ish (sequential in test
but with interleaved MAX reads simulated by pushing user B between user A's
two batches) → both succeed; per-user pull ordering intact. `cd worker &&
npm test` green.

## Item B — Rate limiting on unauthenticated endpoints

`POST /users` (~line 68) and `GET /pairing/:code` / `POST /pairing` have no
throttle beyond the per-code 5-attempt counter. Add worker-side rate limiting
via Cloudflare's rate-limiting binding
(`unsafe.bindings` type `ratelimit` in `wrangler.jsonc` — check current
wrangler 4.x syntax with `npx wrangler --help` or the local types) keyed on
`request.headers.get("CF-Connecting-IP")`: suggested 10/min for /users,
30/min for pairing claim. If the ratelimit binding is unavailable on the
account's plan, fall back to a D1-backed counter table (fixed window, 1-min
buckets, best-effort) — simpler and adequate at this scale.

**Verify**: worker test (D1 fallback) or documented manual check (binding);
`cd worker && npm test` green.

## Item C — CSP connect-src tightening

`src-tauri/tauri.conf.json:33` currently includes
`connect-src 'self' ipc: http://ipc.localhost https: blob: data:`.

Inventory the hosts the webview actually contacts (grep `fetch(` and URL
constants under `src/`): the sync worker URL (env
`VITE_NORTHSTAR_SYNC_WORKER_URL` — a fixed host per build; read `.env.example`
for the production host), GitHub releases (updater — but the updater runs via
the Rust plugin, not webview fetch; verify by reading
`src/features/updater/`), Yahoo/market data (proxied through Rust commands
`fetch_yahoo`/`fetch_market_data` — NOT webview; verify by grepping
`invoke(` in `src/features/market-data/`). If the webview only ever fetches
the worker: replace `https:` with the specific worker origin(s) — dev + prod.
Keep `ipc:`/`http://ipc.localhost`/blob/data as-is.

**Verify**: `npm run tauri dev` (or ask operator if no macOS runner): sync
round trip works, market refresh works, updater check works. If you cannot
run the Tauri shell, mark this item "prepared, operator must smoke-test"
and list the three checks explicitly.

## Item D — SQL capability scoping

`src-tauri/capabilities/default.json:8-9` grants `sql:default` +
`sql:allow-execute`. Check what plugin-sql permissions exist
(`sql:allow-load`, `allow-select`, `allow-execute` — read the plugin's
permission docs via the generated files under `src-tauri/gen/` or
`Cargo.lock`-vendored plugin source). The app legitimately needs
select/execute from the webview (the whole repo layer runs there), so the
realistic tightening is: confirm `sql:default` doesn't already include
execute (drop the redundant grant), and REMOVE nothing that breaks the repo
layer. If no meaningful narrowing exists, record "checked — no narrower
grant available for plugin-sql architecture" and close the item honestly.

**Verify**: `npm run check:tauri` → exit 0; app smoke as in item C.

## Commands

| Purpose | Command | Expected |
|---|---|---|
| Worker tests | `cd worker && npm test` | pass |
| Worker types | `cd worker && npx tsc --noEmit` | exit 0 |
| Rust check | `npm run check:tauri` | exit 0 |
| App tests | `npm test` | pass |

## Scope

**In scope**: `worker/src/index.ts`, new `worker/migrations/000N_*.sql`,
`worker/wrangler.jsonc`, `src-tauri/tauri.conf.json`,
`src-tauri/capabilities/default.json`.

**Out of scope**: auth model (plan 132), CORS policy (accepted as-is —
prior-audit decision), `handleClaimPairing` attempt semantics, any src/
change.

## Git workflow

- Branch: `fix/ai-worker-shell-hardening`; one commit per item.
- Do NOT push/merge/deploy; worker deploy + migration run is the operator's.

## Done criteria

- [ ] A: per-user unique index + scoped MAX; cross-tenant push test green
- [ ] B: rate limit in place (binding or D1 fallback) with a test or a
      documented manual check
- [ ] C: `https:` wildcard replaced by explicit origins (or item
      STOP-reported with the fetch inventory)
- [ ] D: capability grant reviewed; redundant grants dropped or "no narrower
      grant" recorded
- [ ] All gates green; `plans/README.md` updated (note operator actions:
      worker deploy + migration + Tauri smoke)

## STOP conditions

- A: pull turns out to consume the GLOBAL ordering anywhere (grep
  `relay_sequence` in client code — the pull cursor comparison must be
  per-user; if the client stores a cross-user assumption, report).
- C: the webview fetch inventory finds a dynamic/user-configurable host.
- D: dropping any grant breaks `check:tauri` or plugin init.

## Maintenance notes

- Item A's migration must run BEFORE the new worker code deploys (new code
  writes per-user sequences that could collide under the old global unique
  index — actually they collide the same way; still, deploy migration+code
  together; note for operator).
- Reviewer: confirm the sequence change preserves strict monotonicity per
  user (pull correctness depends on it).
