// Local reset of this device's sync state, in two flavours:
//   - unlinkSync():        drop sync identity, KEEP financial data
//   - clearLocalSyncState(): drop sync identity AND wipe financial data
//
// Both remove everything that makes the device "remember" a previous sync:
//   - device identity + cursors, sync account, vault key + device keypair
//   - recovery-kit confirmed flag
//   - local sync conflicts
// The full reset additionally wipes financial rows (via clearAllData).
//
// The server copy is untouched in either case: after this, the user pairs again
// (or restores from a Recovery Kit) and pulls their data back down.
//
// Secrets now live in the SecretStore (Stronghold on device, localStorage in the
// web/test fallback) — see docs/secret-storage-plan.md and USE_STRONGHOLD in
// secretStore.ts. So the sync-state clear removes each SECRET_KEYS entry from the
// SecretStore itself; on device the Stronghold snapshot is the only place the
// vault key, device keypair, account secret, and device credential actually live,
// so wiping localStorage alone would leave them intact. We also remove the
// localStorage copies (harmless, and covers the retained fallback copies + the
// pure-web backend).

import type { FinanceRepository } from "../../../data/repositories";
import { clearAllData } from "../../../data/demoData";
import { SECRET_KEYS, getSecretStore } from "../crypto/secretStore";
import { clearRecoveryKitStatus } from "../crypto/recovery-kit";
import {
  listVaultKeyVersions,
  vaultKeySlot,
  VAULT_KEY_CURRENT_VERSION_KEY,
  VAULT_KEY_VERSIONS_INDEX_KEY,
} from "../crypto/vault";

const DEVICE_KEY = "northstar.device.v1";
const ACCOUNT_KEY = "northstar.sync.account.v1";

/** Clear sync identity/keys/cursors/conflicts. Leaves financial data intact. */
async function clearSyncIdentity(repo: FinanceRepository): Promise<void> {
  // Local sync conflicts.
  await repo.clearSyncConflicts();

  const store = await getSecretStore();

  // Vault key: EVERY version this device has ever held (Plan 240), not just
  // the single `v1` entry SECRET_KEYS lists. This is a deliberate "wipe this
  // device and start over" action — distinct from (and not a violation of)
  // the "never delete a key version" invariant rotation depends on, which is
  // about NOT silently discarding history while a device remains an active
  // participant in sync. Read the version list BEFORE removing anything.
  const versions = await listVaultKeyVersions();
  for (const version of versions) {
    try { await store.remove(vaultKeySlot(version)); } catch { /* ignore backend errors */ }
  }
  try { await store.remove(VAULT_KEY_CURRENT_VERSION_KEY); } catch { /* ignore backend errors */ }
  try { await store.remove(VAULT_KEY_VERSIONS_INDEX_KEY); } catch { /* ignore backend errors */ }

  // Secrets: wipe every SECRET_KEYS entry from the SecretStore (Stronghold on
  // device — the authoritative store — or the localStorage fallback in web/tests).
  // Iterate SECRET_KEYS so any key added later (e.g. the device credential) is
  // cleared automatically.
  for (const key of SECRET_KEYS) {
    try { await store.remove(key); } catch { /* ignore backend errors */ }
  }

  // All sync-related localStorage keys (identity, cursors, account, secrets).
  // The SECRET_KEYS localStorage copies are cleared here too: harmless on device
  // (already gone from Stronghold above) and required for the pure-web backend
  // plus the retained migration copies. Versioned vault-key slots are included
  // too — in the pure-web backend they live directly in localStorage, not just
  // Stronghold.
  const versionSlotKeys = versions.map(vaultKeySlot);
  const keys = [
    DEVICE_KEY,
    ACCOUNT_KEY,
    VAULT_KEY_CURRENT_VERSION_KEY,
    VAULT_KEY_VERSIONS_INDEX_KEY,
    ...versionSlotKeys,
    ...SECRET_KEYS,
  ];
  for (const key of keys) {
    try { localStorage.removeItem(key); } catch { /* ignore quota/private mode */ }
  }

  // Recovery-kit confirmed flag.
  clearRecoveryKitStatus();
}

/**
 * Unlink this device from sync but keep all financial data. After this the
 * device is back to "sync not set up"; re-enabling sync re-pairs and re-pushes
 * the still-present local data.
 */
export async function unlinkSync(repo: FinanceRepository): Promise<void> {
  await clearSyncIdentity(repo);
  // Re-queue all local data for push. Without this, the SQLite outbox still
  // marks every existing record as "pushed" (to the PREVIOUS account), so after
  // re-enabling sync under a fresh account `collectPendingChanges` returns
  // nothing and the data — accounts, ledger, everything not edited since —
  // silently never re-uploads. This was the cause of a device pulling only the
  // few records that happened to be edited after an unlink. See
  // project_sync_sqlite memory (data split across user_ids). Re-enabling sync
  // creates a fresh device identity whose push cursor is already null, so the
  // browser (cursor-based) repo re-pushes too — no cursor reset needed here.
  await repo.requeueAllPendingChanges();
}

/**
 * Full reset: unlink sync AND wipe local financial data → brand-new device.
 */
export async function clearLocalSyncState(repo: FinanceRepository): Promise<void> {
  // Financial data + sync_outbox (clearAllData wipes both on desktop).
  await clearAllData(repo);
  await clearSyncIdentity(repo);
}
