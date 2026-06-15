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
// TODO: if secrets are migrated to Stronghold in the future (see
// docs/secret-storage-plan.md and USE_STRONGHOLD in secretStore.ts), the
// sync-state clear must also clear the Stronghold snapshot — today secrets live
// in localStorage, so removing the SECRET_KEYS keys is sufficient.

import type { FinanceRepository } from "../../../data/repositories";
import { clearAllData } from "../../../data/demoData";
import { SECRET_KEYS } from "../crypto/secretStore";
import { clearRecoveryKitStatus } from "../crypto/recovery-kit";

const DEVICE_KEY = "northstar.device.v1";
const ACCOUNT_KEY = "northstar.sync.account.v1";

/** Clear sync identity/keys/cursors/conflicts. Leaves financial data intact. */
async function clearSyncIdentity(repo: FinanceRepository): Promise<void> {
  // Local sync conflicts.
  await repo.clearSyncConflicts();

  // All sync-related localStorage keys (identity, cursors, account, secrets).
  const keys = [DEVICE_KEY, ACCOUNT_KEY, ...SECRET_KEYS];
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
}

/**
 * Full reset: unlink sync AND wipe local financial data → brand-new device.
 */
export async function clearLocalSyncState(repo: FinanceRepository): Promise<void> {
  // Financial data + sync_outbox (clearAllData wipes both on desktop).
  await clearAllData(repo);
  await clearSyncIdentity(repo);
}
