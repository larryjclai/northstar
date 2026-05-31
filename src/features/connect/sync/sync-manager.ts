// Central sync orchestrator.
//
// runSync():
//   1. Push local pending changes (encrypted)
//   2. Save a pre-pull backup snapshot
//   3. Pull remote envelopes and apply (last-write-wins by revision)
//   4. Update the local sync cursor
//
// Designed to be called both on manual button press and on app focus.

import type { FinanceRepository } from "../../../data/repositories";
import { getOrCreateDeviceIdentity, setLastSyncCursor } from "../../../state/deviceIdentity";
import { loadVaultKey } from "../crypto/vault";
import { loadSyncAccount } from "./account";
import { pushPendingChanges } from "./push";
import { pullAndApply } from "./pull";
import { saveBackup } from "./backup";

export interface SyncResult {
  pushed: number;
  pulled: number;
  applied: number;
}

/** Run a full push-then-pull sync cycle. Throws on error. */
export async function runSync(repo: FinanceRepository): Promise<SyncResult> {
  const account = loadSyncAccount();
  if (!account) throw new Error("尚未設定同步帳號");

  const vaultKey = await loadVaultKey();
  if (!vaultKey) throw new Error("加密金鑰尚未初始化");

  const device = getOrCreateDeviceIdentity();

  // 1. Push local changes
  const pushResult = await pushPendingChanges(repo, account);

  // 2. Save a pre-pull backup so the user can revert if something goes wrong
  const snapshot = await repo.exportSnapshot();
  await saveBackup(snapshot).catch(console.warn); // non-fatal

  // 3. Pull and apply remote changes
  const cursor = device.lastSyncCursor ?? "";
  const pullResult = await pullAndApply(repo, account, cursor, device.deviceId);

  // 4. Advance cursor
  if (pullResult.nextCursor && pullResult.nextCursor !== cursor) {
    setLastSyncCursor(pullResult.nextCursor);
  }

  return {
    pushed: pushResult.pushed,
    pulled: pullResult.pulled,
    applied: pullResult.applied,
  };
}

/** True if the current environment is a Tauri desktop app. */
export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
