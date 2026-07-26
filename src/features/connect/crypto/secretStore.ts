/**
 * SecretStore: pluggable storage for application secrets.
 *
 * Two backends, selected at runtime:
 *  - Stronghold (Tauri encrypted-at-rest snapshot) — the active backend on device.
 *  - localStorage — fallback for the web dev shell (where the Stronghold plugin
 *    and `invoke` are unavailable) and for jsdom tests.
 *
 * The Stronghold backend dynamically imports @tauri-apps/plugin-stronghold so it
 * never loads in the web dev shell.
 *
 * Rollout status (this is the shipped state): USE_STRONGHOLD is ON. The vault key
 * (vault.ts), the device ECDH keypair (pairing.ts), and the sync account
 * (account.ts) are all routed through this store via getSecretStore(). Existing
 * installs are migrated on first access by migrateLocalStorageSecrets. The
 * plaintext localStorage copies are RETAINED for now (migration is
 * non-destructive); clearing them is a separate follow-up gated on the
 * per-platform verification checklist in docs/secret-storage-plan.md §4.
 */

// Stronghold is the active backend on device; localStorage is the web/test
// fallback (see createSecretStore). This flag is committed ON — the cutover is
// shipped. See docs/secret-storage-plan.md for the threat model and the one
// remaining rollout step (clearing the retained localStorage copies).
const USE_STRONGHOLD = true;

// Password passed to Stronghold.load(). The Rust side uses argon2 with a
// per-install random salt file, so effective security comes from the salt.
// See docs/secret-storage-plan.md §2d for the full threat-model discussion.
const STRONGHOLD_PASSWORD = "northstar-stronghold-v1";

// Filename for the Stronghold snapshot, written under {appLocalData}/.
const STRONGHOLD_FILENAME = "northstar-stronghold.bin";

// Client name inside the Stronghold snapshot.
const STRONGHOLD_CLIENT = "northstar-secrets";

// The localStorage keys that hold secrets today.
// Referenced by migrateLocalStorageSecrets; kept here for a single source of truth.
export const SECRET_KEYS = [
  "northstar.vault.key.v1",
  "northstar.device.keypair.v1",
  "northstar.sync.account.v1",
  // Per-device relay credential (Plan 132). The plaintext secret; only its
  // SHA-256 hash is ever sent to the worker.
  "northstar.device.secret.v1",
] as const;

// Widened from a closed literal union (Plan 240, rotation phase B — see
// docs/vault-key-rotation-plan.md §2). Versioned vault-key slots
// (`northstar.vault.key.v{n}` for n > 1, plus the "current version" pointer
// and version index — see vault.ts) are dynamic key names that cannot be
// enumerated as a closed set of string literals, so the TYPE widens to
// `string` to admit them; the SecretStore interface below already accepted
// arbitrary string keys, so this is a type-only change.
//
// SECRET_KEYS itself (the const array above) deliberately stays the
// original, unchanged four entries: it backs ONLY migrateLocalStorageSecrets
// below, the one-time pre-Stronghold localStorage→SecretStore cutover, which
// can never encounter a versioned slot — vault-key versioning shipped long
// after the Stronghold cutover, so no install's plaintext localStorage ever
// held "northstar.vault.key.v2". Enumerating every version a device
// currently holds (for the full-device wipe in sync/reset.ts) is handled
// separately by vault.ts's listVaultKeyVersions(), since that set is
// discovered at runtime, not known statically here.
export type SecretKey = string;

// ---------------------------------------------------------------------------
// SecretStore interface
// ---------------------------------------------------------------------------

export interface SecretStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Tauri detection — matches the pattern used throughout the codebase:
//   src/features/local-backup/localBackup.ts:34–35
//   src/features/connect/sync/sync-manager.ts:145–146
//   src/data/repositories.ts:412–413
// ---------------------------------------------------------------------------

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

// ---------------------------------------------------------------------------
// Backend 1: localStorage (current behaviour)
// ---------------------------------------------------------------------------

export function createLocalStorageStore(): SecretStore {
  return {
    async get(key: string): Promise<string | null> {
      return localStorage.getItem(key);
    },
    async set(key: string, value: string): Promise<void> {
      localStorage.setItem(key, value);
    },
    async remove(key: string): Promise<void> {
      localStorage.removeItem(key);
    },
  };
}

// ---------------------------------------------------------------------------
// Backend 2: Stronghold (Tauri-only)
// ---------------------------------------------------------------------------

// Text encoder/decoder for converting between string and Uint8Array.
const enc = new TextEncoder();
const dec = new TextDecoder();

/**
 * Create a Stronghold-backed SecretStore.
 *
 * Uses the Stronghold Store (not Vault) because Store supports round-trip
 * reads. Vault is write-only (cryptographic procedures only) and cannot return
 * the raw stored bytes — unsuitable for secrets that must be read at runtime.
 *
 * The Stronghold snapshot is written to {appLocalData}/northstar-stronghold.bin.
 * The Rust plugin (lib.rs:157) generates/reads a per-install argon2 salt at
 * {appLocalData}/stronghold-salt.txt and uses it to derive the encryption key
 * from the password we pass here.
 *
 * This function uses dynamic import so the module never loads in the web shell.
 */
export async function createStrongholdStore(): Promise<SecretStore> {
  // Dynamic imports — both may throw in the web shell; callers should catch.
  const [{ Stronghold }, { appLocalDataDir }] = await Promise.all([
    import("@tauri-apps/plugin-stronghold"),
    import("@tauri-apps/api/path"),
  ]);

  const dataDir = await appLocalDataDir();
  const snapshotPath = `${dataDir}${STRONGHOLD_FILENAME}`;

  const stronghold = await Stronghold.load(snapshotPath, STRONGHOLD_PASSWORD);

  // Attempt to load an existing client; create one if it doesn't exist yet.
  let client;
  try {
    client = await stronghold.loadClient(STRONGHOLD_CLIENT);
  } catch {
    client = await stronghold.createClient(STRONGHOLD_CLIENT);
    await stronghold.save();
  }

  const store = client.getStore();

  return {
    async get(key: string): Promise<string | null> {
      const bytes = await store.get(key);
      if (bytes == null) return null;
      return dec.decode(bytes);
    },

    async set(key: string, value: string): Promise<void> {
      const bytes = Array.from(enc.encode(value));
      await store.insert(key, bytes);
      await stronghold.save();
    },

    async remove(key: string): Promise<void> {
      await store.remove(key);
      await stronghold.save();
    },
  };
}

// ---------------------------------------------------------------------------
// Factory: choose backend based on USE_STRONGHOLD flag + runtime env
// ---------------------------------------------------------------------------

/**
 * Returns the appropriate SecretStore for the current environment.
 *
 * - USE_STRONGHOLD is true AND running inside Tauri: returns the Stronghold store
 *   (falling back to localStorage if Stronghold init throws).
 * - Not in Tauri (web dev shell / jsdom tests): returns the localStorage store.
 *
 * Prefer getSecretStore() over calling this directly — it memoizes a single
 * process-wide instance and runs the one-time migration.
 */
export async function createSecretStore(): Promise<SecretStore> {
  if (USE_STRONGHOLD && isTauriRuntime()) {
    try {
      return await createStrongholdStore();
    } catch (err) {
      console.error("[SecretStore] Stronghold init failed — falling back to localStorage:", err);
      return createLocalStorageStore();
    }
  }
  return createLocalStorageStore();
}

// ---------------------------------------------------------------------------
// Migration helper
// ---------------------------------------------------------------------------

/**
 * Copy any of the three known secret keys from localStorage into the provided
 * store, if they are not already present in the store.
 *
 * - Idempotent: if the store already has a value for a key, it is left unchanged.
 * - Non-destructive: localStorage copies are NOT cleared (clearing is the
 *   post-cutover step, handled in a separate commit after per-platform
 *   verification). See docs/secret-storage-plan.md §4.
 */
export async function migrateLocalStorageSecrets(store: SecretStore): Promise<void> {
  for (const key of SECRET_KEYS) {
    const existing = localStorage.getItem(key);
    if (existing == null) continue; // nothing in localStorage to migrate

    const inStore = await store.get(key);
    if (inStore != null) continue; // already in store; do not overwrite

    await store.set(key, existing);
  }
}

// ---------------------------------------------------------------------------
// Shared instance accessor
// ---------------------------------------------------------------------------

// Memoized promise so every caller (vault key, device keypair, sync account)
// shares ONE store instance. Critically, this means two concurrent callers
// during startup await the same createSecretStore() — a single Stronghold load,
// no race. The one-time localStorage→store migration runs inside the same
// promise, so it completes before any consumer's first get()/set().
let secretStorePromise: Promise<SecretStore> | null = null;

/**
 * Return the process-wide shared SecretStore, creating it on first call and
 * running the (idempotent, non-destructive) localStorage→store migration once.
 *
 * All secret consumers should use this rather than createSecretStore() directly
 * so that a single backend instance is reused and migration happens exactly once
 * per session.
 */
export function getSecretStore(): Promise<SecretStore> {
  if (secretStorePromise == null) {
    secretStorePromise = (async () => {
      const store = await createSecretStore();
      await migrateLocalStorageSecrets(store);
      return store;
    })();
  }
  return secretStorePromise;
}

/**
 * Test-only: drop the memoized store so the next getSecretStore() rebuilds it.
 * Not used in production code paths.
 */
export function resetSecretStoreForTests(): void {
  secretStorePromise = null;
}
