// Full local reset of this device's sync state, for a clean re-pair.
//
// Removes everything that makes the device "remember" a previous sync:
//   - financial rows (via clearAllData)
//   - device identity + cursors, sync account, vault key + device keypair
//   - recovery-kit confirmed flag
//   - local sync conflicts
//
// The server copy is untouched: after this, the user pairs again (or restores
// from a Recovery Kit) and pulls their data back down.
//
// TODO: if secrets are migrated to Stronghold in the future (see
// docs/secret-storage-plan.md and USE_STRONGHOLD in secretStore.ts),
// clearLocalSyncState must also clear the Stronghold snapshot — today secrets
// live in localStorage, so removing the SECRET_KEYS keys is sufficient.

import type { FinanceRepository } from "../../../data/repositories";
import { clearAllData } from "../../../data/demoData";
import { SECRET_KEYS } from "../crypto/secretStore";
import { clearRecoveryKitStatus } from "../crypto/recovery-kit";

const DEVICE_KEY = "northstar.device.v1";
const ACCOUNT_KEY = "northstar.sync.account.v1";

export async function clearLocalSyncState(repo: FinanceRepository): Promise<void> {
  // 1. Financial data + sync_outbox (clearAllData wipes both on desktop).
  await clearAllData(repo);

  // 2. Local sync conflicts.
  await repo.clearSyncConflicts();

  // 3. All sync-related localStorage keys (identity, cursors, account, secrets).
  const keys = [DEVICE_KEY, ACCOUNT_KEY, ...SECRET_KEYS];
  for (const key of keys) {
    try { localStorage.removeItem(key); } catch { /* ignore quota/private mode */ }
  }

  // 4. Recovery-kit confirmed flag.
  clearRecoveryKitStatus();
}
