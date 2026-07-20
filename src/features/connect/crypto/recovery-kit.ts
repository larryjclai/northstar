// Recovery Kit — a printable/downloadable backup of the vault key.
//
// The kit IS the vault key encoded as uppercase hex, split into 4 groups
// of 8 characters for readability:
//
//   AABBCCDD-EEFF0011-2233AABB-CCDD1122-AABBCCDD-EEFF0011-2233AABB-CCDD1122
//
// If all trusted devices are lost, entering this code restores the vault key
// and allows the user to pair a new device or decrypt local backups.

import { exportVaultKey, importVaultKey, loadVaultKey, saveVaultKey, getCurrentVaultKeyVersion } from "./vault";

const STATUS_KEY = "northstar.recovery.status.v1";

export interface LocalRecoveryKitStatus {
  createdAt: string;
  confirmedAt: string | null;
  /**
   * Vault key version this kit encodes (Plan 240, rotation phase B — see
   * docs/vault-key-rotation-plan.md §3 step 9). Absent on a kit generated
   * before this field existed — treated as version 1, the only version that
   * has ever existed pre-rotation, which is exactly correct for those kits.
   */
  keyVersion?: number;
}

export function loadLocalRecoveryKitStatus(): LocalRecoveryKitStatus | null {
  const raw = localStorage.getItem(STATUS_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as LocalRecoveryKitStatus; } catch { return null; }
}

function saveLocalRecoveryKitStatus(status: LocalRecoveryKitStatus) {
  localStorage.setItem(STATUS_KEY, JSON.stringify(status));
}

/** Format raw hex string as XXXXXXXX-XXXXXXXX-... (8 groups of 8) */
export function formatKitCode(hex: string): string {
  return Array.from({ length: 8 }, (_, i) => hex.slice(i * 8, i * 8 + 8).toUpperCase())
    .join("-");
}

/** Strip formatting and normalise to lowercase hex */
export function parseKitCode(input: string): string {
  return input.replace(/[-\s]/g, "").toLowerCase();
}

/**
 * Generate a Recovery Kit code from the current vault key.
 * Returns the formatted code and marks createdAt in localStorage.
 * Call confirmRecoveryKit() after the user has saved it.
 */
export async function generateRecoveryKit(): Promise<string> {
  const vaultKey = await loadVaultKey();
  if (!vaultKey) throw new Error("Vault key not initialised.");
  const keyVersion = await getCurrentVaultKeyVersion();
  const b64 = await exportVaultKey(vaultKey);
  const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const hex = Array.from(raw).map((b) => b.toString(16).padStart(2, "0")).join("");
  const code = formatKitCode(hex);
  saveLocalRecoveryKitStatus({ createdAt: new Date().toISOString(), confirmedAt: null, keyVersion });
  return code;
}

/**
 * True once the currently active vault key version has moved past what the
 * last-generated Recovery Kit encodes — i.e. a rotation happened since the
 * kit was made, so restoring from it today would reinstate a STALE
 * pre-rotation key and silently desync the recovering device from every
 * post-rotation push (spike §3 step 9). Phase D renders the "regenerate your
 * Recovery Kit" prompt off this signal; this phase only computes it.
 *
 * False when no kit has ever been generated — that is the separate "please
 * confirm a Recovery Kit first" gate (isRecoveryKitConfirmed), not staleness.
 */
export async function isRecoveryKitStale(): Promise<boolean> {
  const status = loadLocalRecoveryKitStatus();
  if (!status) return false;
  const kitVersion = status.keyVersion ?? 1;
  const currentVersion = await getCurrentVaultKeyVersion();
  return currentVersion > kitVersion;
}

/** Clear the local "recovery kit confirmed" flag (used by full device reset). */
export function clearRecoveryKitStatus(): void {
  try { localStorage.removeItem(STATUS_KEY); } catch { /* ignore */ }
}

/** Mark the Recovery Kit as confirmed (user has saved it). */
export function confirmRecoveryKit(): void {
  const existing = loadLocalRecoveryKitStatus();
  saveLocalRecoveryKitStatus({
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    confirmedAt: new Date().toISOString(),
  });
}

/**
 * True once the user has a confirmed Recovery Kit on this device.
 * Cloud-backed sync is gated on this — see `canEnableCloudBackedFeature`
 * in policies.ts and the guard in `runSync`.
 */
export function isRecoveryKitConfirmed(): boolean {
  return Boolean(loadLocalRecoveryKitStatus()?.confirmedAt);
}

/**
 * Restore the vault key from a Recovery Kit code entered by the user.
 * Accepts both formatted ("AABB…-CCDD…") and raw hex strings.
 */
export async function restoreFromRecoveryKit(input: string): Promise<void> {
  const hex = parseKitCode(input);
  if (hex.length !== 64 || !/^[0-9a-f]+$/.test(hex)) {
    throw new Error("備援碼格式不正確，應為 64 位十六進位字元（共 8 組，每組 8 字元）。");
  }
  const raw = new Uint8Array(hex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
  const b64 = btoa(String.fromCharCode(...raw));
  const key = await importVaultKey(b64);
  await saveVaultKey(key);
  const keyVersion = await getCurrentVaultKeyVersion();
  saveLocalRecoveryKitStatus({ createdAt: new Date().toISOString(), confirmedAt: new Date().toISOString(), keyVersion });
}

/** Download the Recovery Kit as a .txt file. */
export function downloadRecoveryKit(code: string, userId: string): void {
  const content = [
    "Northstar Connect — Recovery Kit",
    "=================================",
    "",
    "保管這份備援碼。如果所有裝置遺失，可用此碼還原加密金鑰。",
    "Keep this code safe. Use it to recover your vault key if all devices are lost.",
    "",
    "Recovery Code:",
    code,
    "",
    `Account ID: ${userId}`,
    `Generated:  ${new Date().toISOString()}`,
    "",
    "⚠ 請勿分享此備援碼。此碼可存取你的所有財務資料。",
    "⚠ Never share this code. It grants access to all your financial data.",
  ].join("\n");

  const blob = new Blob([content], { type: "text/plain; charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `northstar-recovery-kit-${userId.slice(0, 8)}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
