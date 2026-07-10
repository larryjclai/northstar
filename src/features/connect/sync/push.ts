// Push pending local changes to the sync worker as encrypted envelopes.
// Each envelope carries the full serialised record so the receiving device
// can reconstruct the entity without any additional round-trips.

import type { FinanceRepository } from "../../../data/repositories";
import { getOrCreateDeviceIdentity, setLocalPushCursor } from "../../../state/deviceIdentity";
import { loadVaultKey, encryptPayload } from "../crypto/vault";
import { pushEnvelopes, type EnvelopeRecord } from "./client";
import { getSyncAuthToken, type SyncAccount } from "./account";

const BATCH_SIZE = 200;

export interface PushResult {
  pushed: number;
  nextCursor: string | null;
}

/**
 * Encrypt and push all changes since the device's last sync cursor.
 * The payload of each envelope is the full record (or a tombstone for deletes).
 */
export async function pushPendingChanges(
  repo: FinanceRepository,
  account: SyncAccount,
): Promise<PushResult> {
  const vaultKey = await loadVaultKey();
  if (!vaultKey) throw new Error("Vault key not initialised. Complete sync setup first.");

  const device = getOrCreateDeviceIdentity();
  const changeSet = await repo.collectPendingChanges(device.localPushCursor);

  if (changeSet.count === 0) {
    return { pushed: 0, nextCursor: device.localPushCursor };
  }

  // Prefer this device's own credential; falls back to the account secret.
  const authToken = await getSyncAuthToken(account);

  // Process in batches to stay within the Worker's 500-envelope limit.
  for (let i = 0; i < changeSet.changes.length; i += BATCH_SIZE) {
    const batch = changeSet.changes.slice(i, i + BATCH_SIZE);
    const envelopes: EnvelopeRecord[] = await Promise.all(
      batch.map(async (change) => {
        const record = await repo.getSyncPayload(change.entity, change.entityId);
        // Legacy browser snapshots may still lack a row. Keep a minimal
        // tombstone fallback for compatibility; SQLite outbox rows resolve to
        // the complete soft-deleted record.
        const payload = record ?? {
          id: change.entityId,
          entity: change.entity,
          revision: change.revision,
          updatedAt: change.updatedAt,
          deletedAt: change.updatedAt,
        };
        return {
          id: crypto.randomUUID(),
          deviceId: device.deviceId,
          entity: change.entity,
          entityId: change.entityId,
          revision: change.revision,
          encryptedPayload: await encryptPayload(vaultKey, payload),
          updatedAt: change.updatedAt,
        };
      }),
    );
    await pushEnvelopes(authToken, envelopes);
    await repo.acknowledgePendingChanges(
      batch.flatMap((change) => change.outboxId ? [change.outboxId] : []),
    );
  }

  if (changeSet.nextCursor) {
    setLocalPushCursor(changeSet.nextCursor);
  }

  return { pushed: changeSet.count, nextCursor: changeSet.nextCursor };
}
