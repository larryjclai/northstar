// Pull encrypted envelopes from the sync worker and decrypt them locally.
// Decrypted change metadata is logged here; applying changes to the repository
// will be wired in once full record payloads are implemented.

import { loadVaultKey, decryptPayload } from "../crypto/vault";
import { pullEnvelopes, type EnvelopeRecord } from "./client";
import type { SyncAccount } from "./account";
import type { PendingChange } from "../../../domain/sync";

export interface SyncPullResult {
  pulled: number;
  nextCursor: string;
  changes: PendingChange[];
}

/**
 * Fetch and decrypt all envelopes since `cursor`.
 * Returns decrypted change records for the caller to apply.
 */
export async function pullRemoteChanges(
  account: SyncAccount,
  cursor: string,
  deviceId: string,
): Promise<SyncPullResult> {
  const vaultKey = await loadVaultKey();
  if (!vaultKey) throw new Error("Vault key not initialised.");

  const result = await pullEnvelopes(account.apiSecret, cursor);

  // Filter out envelopes we pushed ourselves (already applied locally)
  const foreign = result.envelopes.filter(
    (e: EnvelopeRecord) => e.deviceId !== deviceId,
  );

  const changes = await Promise.all(
    foreign.map((e: EnvelopeRecord) =>
      decryptPayload(vaultKey, e.encryptedPayload) as Promise<PendingChange>,
    ),
  );

  return { pulled: foreign.length, nextCursor: result.nextCursor, changes };
}
