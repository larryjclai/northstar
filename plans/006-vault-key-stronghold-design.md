# Plan 006: Design + spike moving local secrets from localStorage into Stronghold

> **Executor instructions**: This is a DESIGN / SPIKE plan, not a
> build-everything plan. Your deliverable is a written design document plus a
> minimal, behind-a-flag prototype — NOT a full migration shipped to all
> platforms. Follow the steps, answer the open questions with evidence from the
> code and the Tauri Stronghold docs, and STOP at the decision gate (Step 5) for
> operator sign-off before any broad rollout. When done, update the status row
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 9115a2b5..HEAD -- src/features/connect/crypto src/features/connect/sync/account.ts src-tauri/src/lib.rs`

## Status

- **Priority**: P2 (high impact, high cost — sequence after tests land)
- **Effort**: L
- **Risk**: MED (touches the credential storage path on every platform)
- **Depends on**: plans/004-crypto-characterization-tests.md (the round-trip tests are the safety net for changing `saveVaultKey`/`loadVaultKey`)
- **Category**: security
- **Planned at**: commit `9115a2b5`, 2026-06-15

## Why this matters

Three secrets that together grant full access to a user's encrypted finances are stored
as plaintext in `localStorage`:

- the **vault key** (`northstar.vault.key.v1`, `src/features/connect/crypto/vault.ts:31`) —
  decrypts every sync envelope and local backup;
- the **device keypair** (`northstar.device.keypair.v1`, `src/features/connect/crypto/pairing.ts:40`);
- the **sync `apiSecret`** (`northstar.sync.account.v1`, `src/features/connect/sync/account.ts:39`).

`localStorage` is readable by any same-origin script, so an XSS or a compromised npm
dependency reads the vault key and silently defeats the E2EE design that is the product's
core promise. The Stronghold plugin — purpose-built secure storage — is **already a
dependency and already initialized in Rust** (`src-tauri/src/lib.rs:157`, argon2 with a
salt file) but has **no JavaScript usage anywhere in `src/`**. So the secure vault exists
and is wired up; nothing writes to it. This plan designs the migration that actually uses
it, and prototypes it behind a flag, deferring the full cross-platform rollout to an
operator decision because the failure mode (a user who can no longer load their own key)
is severe.

## Current state

- `src-tauri/src/lib.rs:155-157` — Stronghold plugin registered:
  ```rust
  // ...join("stronghold-salt.txt");
  .plugin(tauri_plugin_stronghold::Builder::with_argon2(&salt_path).build())?
  ```
  `Cargo.toml:21`: `tauri-plugin-stronghold = "2"`. The JS plugin `@tauri-apps/plugin-stronghold`
  is in `package.json` dependencies but **never imported** in `src/` (grep for `plugin-stronghold`
  / `Stronghold` in `src/` returns nothing).
- Secret writers/readers to migrate (all use `localStorage`):
  - `vault.ts` — `saveVaultKey` / `loadVaultKey` (key `northstar.vault.key.v1`).
  - `pairing.ts` — `saveDeviceKeyPair` / `loadDeviceKeyPair` (key `northstar.device.keypair.v1`).
  - `account.ts` — `loadSyncAccount` / save paths (key `northstar.sync.account.v1`).
- Non-secret status keys that should STAY in localStorage: `northstar.recovery.status.v1`
  (recovery-kit.ts) and the sync pull cursor — these are not credentials.
- Platform reality (from `PRODUCT.md` / `docs/architecture.md`): the app targets macOS,
  Windows, Linux, iOS, Android, **and a browser dev shell**. The browser dev shell has no
  Tauri/Stronghold — so a `localStorage` fallback must remain for non-Tauri environments.
  Mobile Stronghold availability is an OPEN QUESTION to resolve in Step 2.
- Existing escape-hatch convention: code already detects Tauri vs. web (e.g. local-backup
  uses Tauri fs with an IDB fallback — see `src/features/local-backup/`). Reuse that
  detection style for the secret-store abstraction.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Crypto tests (safety net) | `npx vitest run src/features/connect/crypto` | all pass |
| Full suite | `npx vitest run` | all pass |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Rust check | `npm run check:tauri` | exit 0 |
| Tauri dev (manual) | `npm run tauri dev` | for in-app prototype verification |

## Suggested executor toolkit

- Read the Tauri v2 Stronghold docs before designing the API: https://v2.tauri.app/plugin/stronghold/
  (client/store/record model, `save`/`load`, password/salt handling).

## Scope

**In scope** for this spike:
- `docs/secret-storage-plan.md` (create — the design deliverable)
- A **prototype** `src/features/connect/crypto/secretStore.ts` (create) — a thin
  `SecretStore` abstraction with two backends (Stronghold when in Tauri, `localStorage`
  fallback otherwise) and a one-way migration helper. Behind an off-by-default flag.
- `src/features/connect/crypto/secretStore.test.ts` (create) — tests for the
  `localStorage` fallback backend + the migration helper (the Stronghold backend is
  exercised manually in-app, not in vitest).

**Out of scope** (do NOT do in this plan):
- Switching `vault.ts` / `pairing.ts` / `account.ts` to use the new store by default. The
  prototype must NOT change the default storage path for existing users until the operator
  signs off at Step 5.
- Any change to `src-tauri/` Rust (Stronghold is already registered).
- Migrating the non-secret status/cursor keys.

## Git workflow

- Branch: `advisor/006-secret-store-spike`.
- Commit: `security(connect): spike Stronghold-backed secret store (flagged, off by default)`.
- Do NOT push or open a PR unless the operator instructs it.

## Steps

### Step 1: Confirm the safety net is in place

Run `npx vitest run src/features/connect/crypto`. If plan 004's crypto round-trip tests do
**not** exist or do not pass, STOP — do not modify the storage path without them.

### Step 2: Investigate and answer the open questions (write into `docs/secret-storage-plan.md`)

Research and record answers, each with a citation (code line or Stronghold doc URL):

1. **Stronghold JS API shape**: how does `@tauri-apps/plugin-stronghold` expose
   load/save of a raw secret (client → store → `insert`/`get` of bytes)? What password
   does `Stronghold.load(path, password)` need, given Rust already configures an argon2
   salt file?
2. **Mobile availability**: is Stronghold supported on iOS/Android in this Tauri version?
   If not, what is the secure fallback there (Keychain/Keystore plugin, or accept
   localStorage on mobile for now)? Cite the source.
3. **Web dev-shell fallback**: confirm the abstraction must fall back to `localStorage`
   when `window.__TAURI__` is absent (reuse the Tauri-detection pattern already in
   `src/features/local-backup/`). Name the exact detection used there.
4. **Password/unlock UX**: Stronghold needs a password to open. Where does it come from on
   app launch — a fixed app-derived value, or user input? Document the chosen approach and
   its threat-model implication (a fixed app-derived password protects against at-rest disk
   theft but not against in-process XSS; that is still strictly better than plaintext
   localStorage). 

### Step 3: Design the `SecretStore` interface (write into the doc, then implement the prototype)

Define a minimal interface and implement it in `src/features/connect/crypto/secretStore.ts`:

```ts
export interface SecretStore {
  get(key: string): Promise<string | null>;   // returns the stored base64/string secret
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}
```

- `createSecretStore()` returns a Stronghold-backed impl when running under Tauri, else a
  `localStorage`-backed impl (the current behavior, extracted).
- Add `migrateLocalStorageSecrets(store: SecretStore): Promise<void>` that, for each of the
  three secret keys, if a value exists in `localStorage` and not yet in `store`, copies it
  in (and, only once the operator approves default cutover, clears the localStorage copy).
- Gate the Stronghold path behind an explicit off-by-default flag (e.g. a module constant
  `const USE_STRONGHOLD = false;` with a comment) so merging this prototype changes nothing
  for current users.

### Step 4: Test the fallback backend + migration (vitest)

Create `src/features/connect/crypto/secretStore.test.ts`. Using the Map-backed
`localStorage` stub pattern from `src/features/connect/recoveryKitGate.test.ts:9-21`:

- the localStorage backend round-trips `set`/`get`/`remove`;
- `migrateLocalStorageSecrets` copies an existing localStorage secret into a fresh
  in-memory store and is idempotent (running twice does not double-write or lose data);
- migration leaves the localStorage copy intact while the flag is off (no destructive
  clear until cutover).

**Verify**: `npx vitest run src/features/connect/crypto/secretStore.test.ts` → all pass;
`npx tsc --noEmit` → exit 0; full `npx vitest run` → still ≥409 + new.

### Step 5: DECISION GATE — write the rollout recommendation, then STOP

In `docs/secret-storage-plan.md`, write a concrete rollout proposal for the operator:
the cutover sequence (turn on `USE_STRONGHOLD`, migrate on launch, verify load on each
platform, then clear localStorage copies), the per-platform verification checklist, the
rollback plan (flag flip), and any unresolved risk (esp. mobile from Step 2). Then STOP and
hand back — do **not** flip the default or wire `vault.ts`/`account.ts`/`pairing.ts` to the
new store in this plan.

## Test plan

- `secretStore.test.ts` covers the localStorage backend + migration idempotency (the
  Stronghold backend is verified manually in-app, since vitest has no Tauri runtime).
- Manual: in `npm run tauri dev`, temporarily flip `USE_STRONGHOLD` locally and confirm a
  secret written via the store is readable after an app restart — record the result in the
  doc; revert the flag before committing.
- Structural pattern for the test file: `src/features/connect/recoveryKitGate.test.ts`.

## Done criteria

ALL must hold:

- [ ] `docs/secret-storage-plan.md` exists and answers all four Step 2 questions with citations, plus the Step 5 rollout/rollback recommendation
- [ ] `src/features/connect/crypto/secretStore.ts` exists with the `SecretStore` interface, both backends, and the migration helper, Stronghold path off by default
- [ ] `src/features/connect/crypto/secretStore.test.ts` passes (`npx vitest run src/features/connect/crypto`)
- [ ] `npx tsc --noEmit` exits 0; `npm run check:tauri` exits 0; full `npx vitest run` ≥409 + new
- [ ] `vault.ts`, `pairing.ts`, `account.ts` are UNCHANGED (default storage path untouched) — `git status`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report (do not improvise) if:

- Plan 004's crypto tests are absent/failing (no safety net).
- Step 2 reveals Stronghold is unavailable on a target platform with no acceptable fallback —
  that changes the whole approach; report before prototyping further.
- Implementing the prototype appears to require changing `vault.ts`/`account.ts`/`pairing.ts`
  defaults or `src-tauri/` Rust — that is out of scope for the spike.

## Maintenance notes

- The actual cutover (flipping `USE_STRONGHOLD` on, migrating, then clearing localStorage)
  is a deliberate follow-up gated on operator sign-off and per-platform verification — it is
  the riskiest step (a botched migration locks users out of their own vault) and must not be
  bundled into the spike.
- Plan 003 (CSP) is the cheaper, independent mitigation for the same XSS threat; both should
  land — CSP shrinks the attack surface, Stronghold removes the plaintext secret.
- Reviewer of the eventual cutover PR should scrutinize: idempotent migration, that the
  Recovery Kit still restores after migration, and that the web dev-shell fallback still works.
