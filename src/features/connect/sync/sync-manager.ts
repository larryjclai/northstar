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
import {
  getOrCreateDeviceIdentity,
  setRemotePullCursor,
  setLocalPushCursor,
  resetSyncCursors,
} from "../../../state/deviceIdentity";
import { loadVaultKey } from "../crypto/vault";
import { isRecoveryKitConfirmed } from "../crypto/recovery-kit";
import { loadSyncAccount, ensureDeviceCredential, ensureDevicePublicKeyUploaded } from "./account";
import { pickUpRotatedVaultKey } from "./rotation";

/** Thrown by runSync when the Recovery Kit has not been confirmed yet. */
export const RECOVERY_KIT_REQUIRED = "請先備份並確認 Recovery Kit 才能開始同步";
import { pushPendingChanges } from "./push";
import { pullAndApply, type SkippedEnvelope } from "./pull";
import { saveBackup } from "./backup";

export interface SyncResult {
  pushed: number;
  pulled: number;
  applied: number;
  /** Envelopes skipped because they failed to decrypt or validate. */
  skipped: number;
  /**
   * Per-envelope skip reasons (plan 242 step 5 — see pull.ts's SkipReason),
   * aggregated across every page pulled this run. Undefined (not an empty
   * array) when nothing was skipped, so callers/tests comparing SyncResult
   * with toEqual don't need to account for it on the happy path. Lets the
   * UI message "unknown-key-version" (benign, self-heals next sync)
   * differently from a genuine decrypt/validation failure.
   */
  skippedDetails?: SkippedEnvelope[];
  /** Set by forceFullResync when applied === 0, to explain why. */
  reason?: "ok" | "empty-relay" | "nothing-applied";
}

// Module-level mutex — prevents concurrent syncs hitting SQLite simultaneously.
// Both auto-sync (AppShell focus event) and manual-sync (Settings button)
// share this lock, so only one can run at a time.
let _syncRunning = false;

export function isSyncRunning(): boolean {
  return _syncRunning;
}

/** Run a full push-then-pull sync cycle. Throws on error. */
export async function runSync(repo: FinanceRepository): Promise<SyncResult> {
  if (_syncRunning) throw new Error("同步正在進行中，請稍候");
  _syncRunning = true;

  try {
    return await _doSync(repo);
  } finally {
    _syncRunning = false;
  }
}

async function _doSync(repo: FinanceRepository): Promise<SyncResult> {
  const account = await loadSyncAccount();
  if (!account) throw new Error("尚未設定同步帳號");

  const vaultKey = await loadVaultKey();
  if (!vaultKey) throw new Error("加密金鑰尚未初始化");

  // Gate: a confirmed Recovery Kit is required before any cloud-backed sync.
  // Without the kit, a lost device means permanently lost data — see
  // canEnableCloudBackedFeature in policies.ts.
  if (!isRecoveryKitConfirmed()) throw new Error(RECOVERY_KIT_REQUIRED);

  // Migrate existing installs onto a per-device credential before we push/pull.
  // Best-effort: never blocks sync (falls back to the account secret on failure).
  await ensureDeviceCredential(account);

  // Backfill this device's public key into the durable directory if it paired
  // before that directory existed (Plan 239, rotation phase A). Best-effort,
  // one-time, never blocks sync — see ensureDevicePublicKeyUploaded.
  await ensureDevicePublicKeyUploaded(account);

  // Recipient-side rotation pickup (Plan 241, rotation phase C — spike §3
  // steps 6-7): check the key mailbox for a rotated vault key newer than
  // what this device currently holds, and adopt it BEFORE pushing, so this
  // device's own push below (if a rotation just landed) already stamps the
  // new current version rather than one more push under the stale key.
  // Best-effort and idempotent — see pickUpRotatedVaultKey's docstring.
  await pickUpRotatedVaultKey(account);

  const device = getOrCreateDeviceIdentity();

  // 1. Push local changes
  const pushResult = await pushPendingChanges(repo, account);

  // 2. Save a pre-pull backup so the user can revert if something goes wrong
  const snapshot = await repo.exportSnapshot();
  await saveBackup(snapshot).catch(console.warn); // non-fatal

  // 3. Pull and apply remote changes
  let cursor = device.remotePullCursor ?? "";
  let pulled = 0;
  let applied = 0;
  let skipped = 0;
  let skippedDetails: SkippedEnvelope[] | undefined;
  for (;;) {
    const page = await pullAndApply(repo, account, cursor, device.deviceId);
    pulled += page.pulled;
    applied += page.applied;
    skipped += page.skipped;
    if (page.skippedDetails?.length) {
      skippedDetails = (skippedDetails ?? []).concat(page.skippedDetails);
    }
    if (!page.nextCursor || page.nextCursor === cursor) break;
    cursor = page.nextCursor;
    setRemotePullCursor(cursor);
  }

  return {
    pushed: pushResult.pushed,
    pulled,
    applied,
    skipped,
    skippedDetails,
  };
}

/**
 * Re-download the entire dataset from the relay and rebuild local state,
 * ignoring the stored pull cursor.
 *
 * This is the recovery path for a wiped or reinstalled device. The pull cursor
 * lives in localStorage (not in the SQLite DB), so deleting northstar.db leaves
 * the cursor pointing "up to date" — a normal sync would then fetch only
 * changes newer than that stale cursor and never restore the bulk of the data
 * already on the server.
 *
 * Pull-only by design: it deliberately does NOT push first, so an empty/seeded
 * local DB can't upload its placeholder state and pollute the relay. It also
 * pulls envelopes from *every* device (includeOwnDevice) and loops until the
 * relay is drained, since each page is capped at 200 envelopes.
 */
export async function forceFullResync(repo: FinanceRepository): Promise<SyncResult> {
  if (_syncRunning) throw new Error("同步正在進行中，請稍候");
  _syncRunning = true;

  try {
    const account = await loadSyncAccount();
    if (!account) throw new Error("尚未設定同步帳號");

    const vaultKey = await loadVaultKey();
    if (!vaultKey) throw new Error("加密金鑰尚未初始化");

    const device = getOrCreateDeviceIdentity();

    // Clear any stale watermark so a normal sync after this can't skip data,
    // and so the drain below truly starts from the beginning of the relay.
    resetSyncCursors();

    // Pre-pull backup so the user can revert if the recovery looks wrong.
    const snapshot = await repo.exportSnapshot();
    await saveBackup(snapshot).catch(console.warn);

    let cursor = "";
    let pulled = 0;
    let applied = 0;
    let skipped = 0;
    let skippedDetails: SkippedEnvelope[] | undefined;
    // Drain the relay one page at a time. pullAndApply re-exports the (now
    // updated) local state on each call, so pages accumulate correctly.
    for (;;) {
      const page = await pullAndApply(repo, account, cursor, device.deviceId, {
        includeOwnDevice: true,
      });
      pulled += page.pulled;
      applied += page.applied;
      skipped += page.skipped;
      if (page.skippedDetails?.length) {
        skippedDetails = (skippedDetails ?? []).concat(page.skippedDetails);
      }
      if (!page.nextCursor || page.nextCursor === cursor) break;
      cursor = page.nextCursor;
    }

    if (cursor) setRemotePullCursor(cursor);

    const reason: SyncResult["reason"] =
      applied > 0 ? "ok" : pulled === 0 ? "empty-relay" : "nothing-applied";
    return { pushed: 0, pulled, applied, skipped, skippedDetails, reason };
  } finally {
    _syncRunning = false;
  }
}

/**
 * Re-upload the ENTIRE local dataset to the current sync account, then pull.
 *
 * Recovery path for the inverse of forceFullResync: the local DB is the good
 * copy but the relay is missing records (e.g. after an unlink + re-enable that
 * minted a fresh account, the old data was marked "pushed" and never re-sent —
 * the relay then had assets/investments but no accounts). Clearing the push
 * marks + cursor forces every record back onto the relay so other devices can
 * pull them. Idempotent on the relay (worker push is ON CONFLICT DO NOTHING).
 */
export async function forceFullRepush(repo: FinanceRepository): Promise<SyncResult> {
  if (_syncRunning) throw new Error("同步正在進行中，請稍候");
  _syncRunning = true;
  try {
    const account = await loadSyncAccount();
    if (!account) throw new Error("尚未設定同步帳號");
    if (!(await loadVaultKey())) throw new Error("加密金鑰尚未初始化");
    if (!isRecoveryKitConfirmed()) throw new Error(RECOVERY_KIT_REQUIRED);

    await repo.requeueAllPendingChanges();
    setLocalPushCursor(null);
    return await _doSync(repo);
  } finally {
    _syncRunning = false;
  }
}

/** True if the current environment is a Tauri desktop app. */
export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
