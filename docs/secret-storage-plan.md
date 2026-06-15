# Secret Storage Plan: Stronghold-backed SecretStore

**Status**: SPIKE — USE_STRONGHOLD=false (off by default). Awaiting operator sign-off before cutover.
**Authored**: 2026-06-15 (against commit 9115a2b5)
**Depends on**: Plan 004 (crypto characterization tests done — b5ae1fd5)

---

## 1. Context: what we're protecting

Three secrets currently stored in plaintext localStorage:

| Key | Used in | What it protects |
|-----|---------|-----------------|
| `northstar.vault.key.v1` | `vault.ts` `saveVaultKey`/`loadVaultKey` | E2EE vault encryption key; compromise exposes all encrypted data |
| `northstar.device.keypair.v1` | `pairing.ts` `saveDeviceKeyPair`/`loadDeviceKeyPair` | Device identity keypair for sync pairing |
| `northstar.sync.account.v1` | `account.ts` `loadSyncAccount`/save paths | Sync account credentials |

localStorage on desktop is plain JSON on disk — readable by any process with filesystem access or a devtools session. Moving these into Stronghold provides OS-keychain-grade encryption at rest on the desktop.

---

## 2. Research findings

### 2a. Stronghold JS API shape

**Source**: `node_modules/@tauri-apps/plugin-stronghold/dist-js/index.js` + `index.d.ts`
Version: `@tauri-apps/plugin-stronghold@2.3.1`

The JS API surface relevant to this plan:

```
Stronghold.load(path: string, password: string): Promise<Stronghold>
  // Invokes plugin:stronghold|initialize. If snapshot exists, password must match.
  // Creates a fresh snapshot if none exists.

stronghold.loadClient(client: ClientPath): Promise<Client>
stronghold.createClient(client: ClientPath): Promise<Client>
stronghold.save(): Promise<void>   // flush to disk

// Via client.getStore():
Store.get(key: StoreKey): Promise<Uint8Array | null>
Store.insert(key: StoreKey, value: number[], lifetime?: Duration): Promise<void>
Store.remove(key: StoreKey): Promise<Uint8Array | null>
```

The **Store** (not Vault) is the right primitive for our use case: it is a key-value map that allows reading back values. Vault (`insert`/`remove`) is write-only and requires cryptographic procedures to use the data — it cannot round-trip string values, so it is not suitable for the secrets we need to read at runtime.

**`Stronghold.load` with argon2**: The Rust side registers the plugin via `tauri_plugin_stronghold::Builder::with_argon2(&salt_path).build()` (lib.rs:157). This means argon2 is used as the KDF: the plugin generates (or reuses) a random salt stored at `{appLocalData}/stronghold-salt.txt`, then derives an encryption key from `(password, salt)` using argon2. The derived key encrypts the snapshot file. The JS side passes a `password` string to `Stronghold.load()`; the Rust backend runs argon2 on it.

### 2b. Mobile availability

**Source**: `node_modules/@tauri-apps/plugin-stronghold/package.json` — no mobile-specific exports, no `android`/`ios` fields.
**Source**: `src-tauri/Cargo.toml` — `tauri-plugin-stronghold = "2"` at the top-level dependencies block (not inside a `[target.'cfg(not(any(...)))']` block). This means the Rust crate is compiled on **all platforms including iOS and Android**.

However, the IOTA Stronghold library itself (`iota_stronghold`) has historically had compile issues on some mobile targets. There is no explicit mobile feature flag gating in the project's `Cargo.toml`. The mobile build plan (`docs/ios-mobile-plan.md`) mentions that the updater capability is gated to desktop, but Stronghold is not explicitly gated.

**Risk**: Mobile (iOS/Android) support is **unverified**. The Rust crate is compiled in, but whether it works correctly at runtime on iOS/Android requires a real device test. If Stronghold does not work on mobile at runtime, the migration would need to fall back to localStorage (the current behavior) or a different secure storage primitive (e.g., iOS Keychain via a different Tauri plugin).

**Fallback if unavailable on mobile**: Keep localStorage as the mobile fallback. The `USE_STRONGHOLD` flag can be refined to `USE_STRONGHOLD && !isMobile()` (detect via `navigator.platform` or a mobile-capability flag) pending confirmation.

### 2c. Web dev-shell fallback — Tauri detection pattern

**Source**: `src/features/local-backup/localBackup.ts:34–35`

```ts
function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
```

The exact symbol is `"__TAURI_INTERNALS__"` (not `__TAURI__`). The same pattern appears verbatim in:
- `src/features/market-data/taiwanMarketDataProvider.ts:152–153`
- `src/features/market-data/yahooFinanceProvider.ts:295–296`
- `src/features/connect/sync/sync-manager.ts:145–146`
- `src/data/repositories.ts:412–413`

`secretStore.ts` uses this same pattern.

### 2d. Password / unlock UX

**The problem**: `Stronghold.load(path, password)` requires a password string. The argon2 KDF derives the snapshot encryption key from `(password, salt)`. If the password is weak or predictable, the protection is limited to the salt's randomness — which is good (argon2 with a random salt is resistant to offline brute force), but the password still matters.

**Options considered**:

| Option | Pros | Cons |
|--------|------|------|
| User-entered master password on each launch | Maximum security | Terrible UX; not aligned with current app design (no master password concept) |
| Derive from existing vault key | Password is already secret | Creates circular dependency (vault key is one of the secrets being moved) |
| Fixed app-level constant (e.g. app bundle ID) | Zero UX friction | Password is effectively public; security comes entirely from the salt file |
| OS-provided secret (e.g. keychain lookup for the password) | Strong | Requires another Tauri plugin; significant complexity |

**Chosen approach for this spike**: Use a fixed app-derived constant (`"northstar-stronghold-v1"`). This is the approach documented in the Stronghold plugin README and used in most Tauri example applications.

**Threat-model implication**: With a fixed password, the effective security is: **the salt file must remain secret**. The salt is stored at `{appLocalData}/stronghold-salt.txt` — the same directory that holds the SQLite database. An attacker who can read the app's local data directory can obtain the salt, then brute-force the fixed password (trivially, since it's a known constant), and decrypt the snapshot. This is only marginally better than localStorage for a local attacker with filesystem access.

**What this does protect against**:
- Web page cross-origin reads (localStorage is same-origin; Stronghold is not exposed to the web layer at all)
- Simple "copy the app data folder" attacks where the attacker doesn't know the app internals

**Future improvement path**: Replace the fixed password with a per-install random token stored in the OS keychain (`@tauri-apps/plugin-keychain` or similar). This would provide full OS-keychain-grade protection without a user-facing password.

---

## 3. Implementation: secretStore.ts

See `src/features/connect/crypto/secretStore.ts`.

Key design decisions:
- `USE_STRONGHOLD = false` compile-time flag to prevent any Stronghold import at runtime until the operator signs off
- Dynamic `import()` of `@tauri-apps/plugin-stronghold` to prevent crashes in the web dev shell
- `createSecretStore()` chooses backend based on `USE_STRONGHOLD && isTauriRuntime()`
- Stronghold snapshot lives at `{appLocalData}/northstar-stronghold.bin` (resolved via `@tauri-apps/api/path`)
- Client name: `"northstar-secrets"`; Store used (not Vault) for round-trip read/write
- `save()` called after each write to flush snapshot to disk

---

## 4. Rollout recommendation (Step 5)

### Cutover sequence

1. **Merge prerequisite**: Confirm plan 004 crypto tests remain green on the target branch.
2. **Set `USE_STRONGHOLD = true`** in `secretStore.ts`.
3. **Wire `migrateLocalStorageSecrets`** at app startup — call it during the app initialization flow, **before** `loadVaultKey()` / `loadDeviceKeyPair()` / `loadSyncAccount()` are called. A good location is the app root (`src/main.tsx` or the initialization thunk that currently calls these).
4. **Update vault.ts / pairing.ts / account.ts** to call `createSecretStore()` instead of `localStorage` directly. This is intentionally **not** done in this spike — it is the follow-up commit.
5. **Verify on each platform** (checklist below).
6. **Clear localStorage copies** in a separate follow-up commit after per-platform verification passes. Clearing early prevents rollback.

### Per-platform verification checklist

**macOS**:
- [ ] Fresh install: secrets written to Stronghold on first launch
- [ ] Restart: secrets loaded from Stronghold (vault key unlocks, sync account loads)
- [ ] Confirm `{Library}/Application Support/com.northstar.app/northstar-stronghold.bin` exists
- [ ] Confirm `stronghold-salt.txt` exists in same directory
- [ ] Downgrade test: flip `USE_STRONGHOLD = false`, restart — secrets load from localStorage (migration copy still there)

**Windows**:
- [ ] Same as macOS; path is `{APPDATA}\com.northstar.app\`
- [ ] Defender / AV does not block Stronghold file writes

**Linux**:
- [ ] Same; path is `{XDG_DATA_HOME}/com.northstar.app/` or `~/.local/share/com.northstar.app/`

**iOS** (if Stronghold compiles and runs on mobile):
- [ ] Build succeeds with `tauri-plugin-stronghold` in deps
- [ ] `isTauriRuntime()` returns true on iOS (verify `__TAURI_INTERNALS__` is set)
- [ ] Secrets round-trip correctly
- [ ] If build fails or runtime panics: gate `USE_STRONGHOLD` behind desktop detection — see Unresolved Risks

**Android**:
- [ ] Same as iOS — unverified, treat as risk until tested

### Rollback plan

The migration step (`migrateLocalStorageSecrets`) **copies but does not clear** localStorage. This means:
- Flipping `USE_STRONGHOLD = false` immediately restores the prior behavior (localStorage reads)
- No data loss in either direction while the copy exists
- The "clear localStorage" commit is the point of no return — do not land it until multiple platform verifications pass

### Unresolved risks

1. **Mobile Stronghold support** — highest risk. `tauri-plugin-stronghold` crate is in deps but not mobile-gated. If `Stronghold.load()` panics or fails on iOS/Android, the app fails to start. Mitigation: gate behind `!isMobileRuntime()` (add a separate mobile detection function checking `navigator.userAgent` or a Tauri capability flag) until mobile is explicitly tested.

2. **Fixed password weakness** — as documented in §2d. The current design relies entirely on the salt file for protection. This is acceptable for the spike but should be replaced with a per-install random token in the OS keychain before declaring the migration "fully secure."

3. **Snapshot corruption** — if the app crashes between `store.insert()` and `stronghold.save()`, the write is lost but the snapshot is not corrupted (Stronghold keeps the prior snapshot). This means a write can be silently dropped. For secrets that are set once at pairing time, this is acceptable. For frequently-updated values, a retry/verify pattern would be needed.

4. **Multi-process safety** — Stronghold's Rust backend serializes access via the plugin, but if two app windows somehow load the same snapshot simultaneously, the last writer wins. Northstar is a single-window app, so this is not a current concern.

5. **`appLocalDataDir()` path resolution** — the JS path API (`@tauri-apps/api/path`) is async and may throw in the web shell. The `createStrongholdStore()` function handles this with a try/catch, falling back to localStorage. Verify that the resolved path on each platform matches the directory where `stronghold-salt.txt` is written by the Rust side.
