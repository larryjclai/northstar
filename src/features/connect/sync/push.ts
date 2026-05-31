// Push pending local changes to the sync worker as encrypted envelopes.
// Each PendingChange is serialised and encrypted before leaving the device.

import type { FinanceRepository } from "../../../data/repositories";
import { getOrCreateDeviceIdentity, setLastSyncCursor } from "../../../state/deviceIdentity";
import { loadVaultKey, encryptPayload } from "../crypto/vault";
import { pushEnvelopes, type EnvelopeRecord } from "./client";
import type { SyncAccount } from "./account";

const BATCH_SIZE = 200;

export interface PushResult {
  pushed: number;
  nextCursor: string | null;
}

/**
 * Encrypt and push all changes since the device's last sync cursor.
 * Returns the number of envelopes pushed and the new cursor.
 *
 * Note: the encrypted payload currently contains PendingChange metadata.
 * Full record payloads will be added once per-entity serialisers are in place.
 */
export async function pushPendingChanges(
  repo: FinanceRepository,
  account: SyncAccount,
): Promise<PushResult> {
  const vaultKey = await loadVaultKey();
  if (!vaultKey) throw new Error("Vault key not initialised. Complete sync setup first.");

  const device = getOrCreateDeviceIdentity();
  const changeSet = await repo.collectPendingChanges(device.lastSyncCursor);

  if (changeSet.count === 0) {
    return { pushed: 0, nextCursor: device.lastSyncCursor };
  }

  // Process in batches to stay within the worker's 500-envelope limit
  for (let i = 0; i < changeSet.changes.length; i += BATCH_SIZE) {
    const batch = changeSet.changes.slice(i, i + BATCH_SIZE);
    const envelopes: EnvelopeRecord[] = await Promise.all(
      batch.map(async (change) => ({
        id: crypto.randomUUID(),
        deviceId: device.deviceId,
        entity: change.entity,
        entityId: change.entityId,
        revision: change.revision,
        encryptedPayload: await encryptPayload(vaultKey, change),
        updatedAt: change.updatedAt,
      })),
    );
    await pushEnvelopes(account.apiSecret, envelopes);
  }

  if (changeSet.nextCursor) {
    setLastSyncCursor(changeSet.nextCursor);
  }

  return { pushed: changeSet.count, nextCursor: changeSet.nextCursor };
}
