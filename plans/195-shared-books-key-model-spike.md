# Plan 195: 共享帳本金鑰/成員模型 design spike（取代 143，帳本感知）

> **Executor instructions**: This is a DESIGN/SPIKE plan — the deliverable is
> a decision document, ZERO code. Write it to `docs/shared-books-plan.md`.
> On a STOP condition, stop and report. Do NOT modify any `src/`, `worker/`,
> or `src-tauri/` file. Do NOT update `plans/README.md` — the reviewer
> maintains the index.
>
> **Read first (all committed to main)**: `docs/ledger-books-plan.md` §4
> (共同記帳對齊 — the operator-locked framing this spike executes) and §2a
> (bookId model), plus `plans/143-household-sharing-spike.md` (the older,
> pre-books version this supersedes — mine its investigation-input list, but
> design against BOOKS, not `isSharedToHousehold` on accounts).
>
> **Drift check (run first)**:
> `git diff --stat 8a40e8f4..HEAD -- src/features/connect worker/migrations src/domain/types.ts docs/ledger-books-plan.md`
> Material change to the crypto/worker foundation → compare before writing.

## Status

- **Priority**: P3 (biggest bet — design before any build; operator chose "spike now, decide build later" 2026-07-13)
- **Effort**: M (investigation + writing; the build would be XL across Phase 3 + Phase 4)
- **Risk**: — (paper only; the FEATURE risk is HIGH: crypto/privacy boundary, non-negotiable invariant)
- **Depends on**: none to run. Supersedes plan 143. Composes with `docs/ledger-books-plan.md` §4.
- **Category**: direction
- **Planned at**: commit `8a40e8f4`, 2026-07-13

## Why this matters

帳本 Phase 2 shipped (188–194): company/personal books, invoices, the lot.
`docs/ledger-books-plan.md` §4 locked the sharing framing: **book = the
sharing boundary; the end goal is 雙向共寫 (both members write to a shared
book); read-only shared projections come first**. Nothing can be BUILT until
the key/membership/revocation model is decided — you can't create an
E2E-encrypted shared book without knowing how its key is wrapped to each
member's devices, how membership changes, and what the relay learns. This
spike produces those decisions as concrete options + a recommendation, so
Phase 3/4 build plans can be cut from it. **This is doc-only; the operator
reviews the decisions before any build.**

## Current state — the REAL foundation to design against (verify each)

The original plan 143 designed against the *target state* of then-unbuilt
plans 130–132. Those shipped — design against what EXISTS now:

- **Crypto (client)**, `src/features/connect/crypto/`:
  - `pairing.ts` (269 lines): ECDH pairing — `generatePairingCode`,
    `generateBundleSalt`, `PublicPairingBundle`, `CredentialsBundle`.
  - `secretStore.ts` (247): `SecretStore` interface + `SECRET_KEYS` +
    `getSecretStore()` — where the vault key + device keypair live.
  - `vault.ts` (67): envelope encryption. `recovery-kit.ts` (124).
  - All have tests. This is a working per-user, multi-device E2E stack.
- **Worker (relay)**, `worker/migrations/`:
  - `0001` users + devices; `0002` pairing_sessions; `0003`
    `sync_envelopes_v2` (per-user, per-device relay, `user_id` FK);
    `0004` pairing_ecdh; `0005` device_credentials; `0006`
    per_user_relay_sequence; `0007` rate_limits.
  - **Everything is scoped to ONE `user_id`.** There is NO multi-user /
    household / shared-namespace concept. The relay never sees plaintext
    (E2E). This is the gap the spike must fill.
- **Books (client)**: `Book` entity (`src/domain/types.ts`), `Account.bookId`,
  `bookScope.ts`, the switcher — all Phase 1. A `Book` has no sharing field
  yet (the old `Account.isSharedToHousehold` is vestigial — note it, don't
  design around it).
- **Locked invariant** (AGENTS.md): sharing must not collapse personal
  privacy; the relay must never become a readable finance database.
- **186 §4 decisions to honor** (operator-locked, quote them): book is the
  sharing unit; 雙向共寫 is the target; read-only projections first; the LWW
  per-record sync core is REUSED (two-way write = multi-device sync where
  devices belong to two people); the genuinely new problems are (a) the
  key/privacy boundary, (b) membership/revocation, (c) conflict UX for
  concurrent edits by two humans, (d) book-scoped categories/accounts.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Sanity | `npm test` | all pass (you change no code; run once to confirm a clean tree) |
| Greps | `grep -rn "user_id\|sync_envelopes" worker/src \| head` | orient the relay model |

## Scope

**In scope** (only these):
- `docs/shared-books-plan.md` (create)
- `plans/README.md` — your status row (reviewer will actually do this)

**Out of scope**:
- ANY `src/`, `worker/`, `src-tauri/` code — paper only.
- Actually building shared books (Phase 3/4).
- Re-deciding Phase 1/2 (books, invoices) — settled.

## The deliverable — `docs/shared-books-plan.md` must contain:

### 1. Product slice (½ page)
What a shared book v1 IS. Per 186 §4: a `Book` becomes shareable; members
sync its accounts + ledger rows (+ invoices/clients for a company book?).
State exactly what crosses the boundary and what NEVER does (a member's
OTHER books stay private; personal notes?). Read-only-projection scope first
vs 雙向共寫 target — define both.

### 2. Key model options (the heart — 2–3 options, each ≤1 page)
How a shared book's key is wrapped to each member's devices, building on the
SHIPPED `pairing.ts`/`secretStore.ts`/`vault.ts`. Options to weigh:
- (a) **Book Space Key**: a per-book symmetric key, wrapped to each member's
  device public keys via the existing ECDH pairing mailbox; shared-book
  envelopes encrypted under it in a separate relay namespace.
- (b) **Per-pair wrapping**: sender wraps each envelope to each recipient
  device (no shared key). Simpler revocation, worse fan-out.
- (c) any you identify.
For EACH: invite flow (reuse the pairing UX?), member revocation (can a
removed member read past data? future?), key-rotation cost, and **what the
relay learns** (it must not learn balances; can it learn the member graph? —
state honestly). Bold a recommendation.

### 3. Membership + revocation (½ page)
Who is a member of a shared book; how invite/accept works; what removal means
for already-synced data (delete request? tombstone honor? state the honest
answer). Compose with the existing `device_credentials` (0005) model.

### 4. Worker / relay schema delta (½ page)
New tables/namespaces alongside the single-user `sync_envelopes_v2`: a
`shared_books` / `shared_book_members` / shared-envelope namespace; the
cursor model for a stream readable by N members; how a member's device
authenticates to a shared stream. What migrations (0008+) it implies.

### 5. Sync-protocol delta + 雙向共寫 conflict UX (½ page)
How shared-book envelopes reach N members (the LWW core is reused — say what
changes vs single-user). For 雙向共寫 specifically: the conflict UX when two
HUMANS edit the same row concurrently (silent LWW is fine for one person's
devices, surprising when the loser is another person) — propose the minimal
resolution surface. Book-scoped categories/accounts (a shared row's
`category`/`accountId` must resolve in the shared book's namespace, not leak
into a member's personal lists).

### 6. Client UX sketch (½ page, text not pixels)
Where sharing lives (a 「共享此帳本」 action in 帳本管理, reusing the pairing
flow?); the invite/accept flow; how a shared book renders in the switcher for
the invited member; convert-in-place (186 §5 open-Q5: invite a member to an
EXISTING book, no re-entry).

### 7. Phased build outline + open questions
- **Phase 3**: shared books READ-ONLY (projections) — effort estimate + the
  plan files it becomes.
- **Phase 4**: 雙向共寫 — effort (XL) + the conflict-UX/book-scoped-category
  plans it becomes.
- Numbered **open questions for the operator**, each with a recommended
  answer (e.g. does a removed member keep past data? is the member graph
  acceptable metadata for the relay to hold? recovery-kit for shared keys?).

## Done criteria
- [ ] `docs/shared-books-plan.md` exists with all 7 sections
- [ ] Designs against the SHIPPED crypto/worker foundation (cites real files/migrations), NOT plans 130–132's target state
- [ ] Honors 186 §4 (book = boundary, 雙向共寫 target, LWW reuse) — cites it
- [ ] Every current-code claim carries a `file:line`/migration reference re-verified during the spike
- [ ] No `src/`/`worker/`/`src-tauri/` file modified (`git status`)

## STOP conditions
- `docs/ledger-books-plan.md` §4 is missing/materially changed (the framing moved).
- The crypto foundation doesn't match "Current state" (e.g. `pairing.ts` gone) — the base moved; report.
- You find shared-book/household code has already started in `worker/` or `src/features/connect` — design would race a build.

## Maintenance notes
- Supersedes plan 143 (mark it REJECTED/superseded in the index — this is the
  books-aware version).
- Phase 3/4 build plans are cut from this doc AFTER operator review of §7's
  open questions — exactly like 186 → 188–193.
- Deferred by design: multi-household, >2 members performance, cross-household
  sharing.
