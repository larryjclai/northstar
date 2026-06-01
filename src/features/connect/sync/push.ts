// Push pending local changes to the sync worker as encrypted envelopes.
// Each envelope carries the full serialised record so the receiving device
// can reconstruct the entity without any additional round-trips.

import type { FinanceRepository } from "../../../data/repositories";
import { getOrCreateDeviceIdentity, setLastSyncCursor } from "../../../state/deviceIdentity";
import { loadVaultKey, encryptPayload } from "../crypto/vault";
import { pushEnvelopes, type EnvelopeRecord } from "./client";
import type { SyncAccount } from "./account";
import type { SyncEntity } from "../../../domain/sync";

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
  const changeSet = await repo.collectPendingChanges(device.lastSyncCursor);

  if (changeSet.count === 0) {
    return { pushed: 0, nextCursor: device.lastSyncCursor };
  }

  // Export snapshot to look up full record data by entity+id.
  // exportSnapshot() includes soft-deleted records via the repository's
  // allSyncRecords() path, so tombstones are included.
  const snapshot = await repo.exportSnapshot();

  // Build id→record lookup maps for each entity type.
  const settingsPayload = {
    id: "app_settings",
    revision: snapshot.settingsRevision ?? 1,
    updatedAt: snapshot.settingsUpdatedAt ?? new Date().toISOString(),
    deletedAt: null,
    settings: snapshot.settings,
  };
  const lookup: Record<SyncEntity, Map<string, unknown>> = {
    account: new Map(snapshot.accounts.map((r) => [r.id, r])),
    ledger: new Map(snapshot.ledgerTransactions.map((r) => [r.id, r])),
    asset: new Map(snapshot.portfolioAssets.map((r) => [r.id, r])),
    investment: new Map(snapshot.investmentRecords.map((r) => [r.id, r])),
    recurring: new Map(snapshot.recurringTransactions.map((r) => [r.id, r])),
    goal: new Map((snapshot.financialGoals ?? []).map((r) => [r.id, r])),
    settings: new Map([["app_settings", settingsPayload]]),
  };

  // Process in batches to stay within the Worker's 500-envelope limit.
  for (let i = 0; i < changeSet.changes.length; i += BATCH_SIZE) {
    const batch = changeSet.changes.slice(i, i + BATCH_SIZE);
    const envelopes: EnvelopeRecord[] = await Promise.all(
      batch.map(async (change) => {
        const record = lookup[change.entity].get(change.entityId);
        // For soft-deleted records the full record (with deletedAt set) is the payload.
        // If the record is missing from snapshot, fall back to a minimal tombstone.
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
    await pushEnvelopes(account.apiSecret, envelopes);
  }

  if (changeSet.nextCursor) {
    setLastSyncCursor(changeSet.nextCursor);
  }

  return { pushed: changeSet.count, nextCursor: changeSet.nextCursor };
}
