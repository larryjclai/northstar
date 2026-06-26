/**
 * SecretStore: pluggable storage for application secrets.
 *
 * Two backends:
 *  - localStorage (default, current behavior)
 *  - Stronghold (Tauri encrypted snapshot — disabled by default; flip USE_STRONGHOLD to test)
 *
 * The Stronghold backend dynamically imports @tauri-apps/plugin-stronghold so it
 * never loads in the web dev shell (where `invoke` is unavailable).
 *
 * docs/secret-storage-plan.md contains the full design rationale, threat model,
 * rollout sequence, and per-platform verification checklist.
 */

// Off by default — flip to true only for manual Tauri dev testing.
// Do NOT commit as true until the rollout sequence in docs/secret-storage-plan.md
const USE_STRONGHOLD = true;

// Password passed to Stronghold.load(). The Rust side uses argon2 with a
// per-install random salt file, so effective security comes from the salt.
// See docs/secret-storage-plan.md §2d for the full threat-model discussion.
const STRONGHOLD_PASSWORD = "northstar-stronghold-v1";

// Filename for the Stronghold snapshot, written under {appLocalData}/.
const STRONGHOLD_FILENAME = "northstar-stronghold.bin";

// Client name inside the Stronghold snapshot.
const STRONGHOLD_CLIENT = "northstar-secrets";

// The three localStorage keys that hold secrets today.
// Referenced by migrateLocalStorageSecrets; kept here for a single source of truth.
export const SECRET_KEYS = [
  "northstar.vault.key.v1",
  "northstar.device.keypair.v1",
  "northstar.sync.account.v1",
] as const;

export type SecretKey = (typeof SECRET_KEYS)[number];

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
 * - When USE_STRONGHOLD is false (default): returns localStorage store.
 * - When USE_STRONGHOLD is true AND running inside Tauri: returns Stronghold store.
 * - When USE_STRONGHOLD is true but NOT in Tauri (web dev shell): falls back to
 *   localStorage store with a console warning.
 */
export async function createSecretStore(): Promise<SecretStore> {
  if (USE_STRONGHOLD && isTauriRuntime()) {
    try {
      return await createStrongholdStore();
    } catch (err) {
      console.error(
        "[SecretStore] Stronghold init failed — falling back to localStorage:",
        err,
      );
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
export async function migrateLocalStorageSecrets(
  store: SecretStore,
): Promise<void> {
  for (const key of SECRET_KEYS) {
    const existing = localStorage.getItem(key);
    if (existing == null) continue; // nothing in localStorage to migrate

    const inStore = await store.get(key);
    if (inStore != null) continue; // already in store; do not overwrite

    await store.set(key, existing);
  }
}
