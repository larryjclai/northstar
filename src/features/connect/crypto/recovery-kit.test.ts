import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  formatKitCode,
  parseKitCode,
  generateRecoveryKit,
  restoreFromRecoveryKit,
  isRecoveryKitStale,
} from "./recovery-kit";
import {
  generateVaultKey,
  exportVaultKey,
  saveVaultKey,
  loadVaultKey,
  saveVaultKeyVersion,
  setCurrentVaultKeyVersion,
} from "./vault";

beforeAll(() => {
  if (typeof globalThis.localStorage === "undefined") {
    const store = new Map<string, string>();
    globalThis.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, String(v)); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => { store.clear(); },
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() { return store.size; },
    } as Storage;
  }
});

describe("recovery kit crypto", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("format/parse round-trip: 64-char lowercase hex → 8 uppercase dash-separated groups → back to lowercase hex", () => {
    const hex = "aabbccdd" + "eeff0011" + "2233aabb" + "ccdd1122" + "aabbccdd" + "eeff0011" + "2233aabb" + "ccdd1122";
    expect(hex.length).toBe(64);
    const formatted = formatKitCode(hex);
    const parts = formatted.split("-");
    expect(parts.length).toBe(8);
    for (const part of parts) {
      expect(part.length).toBe(8);
      expect(part).toBe(part.toUpperCase());
    }
    const parsed = parseKitCode(formatted);
    expect(parsed).toBe(hex.toLowerCase());
  });

  it("generate → restore: restoring from recovery kit yields same vault key", async () => {
    // Set up vault key and save it
    const vaultKey = await generateVaultKey();
    await saveVaultKey(vaultKey);
    const originalB64 = await exportVaultKey(vaultKey);

    // Generate recovery kit code
    const code = await generateRecoveryKit();

    // Clear storage to simulate all devices lost
    localStorage.clear();

    // Restore from the recovery kit code
    await restoreFromRecoveryKit(code);

    // Confirm the restored key matches the original
    const loaded = await loadVaultKey();
    expect(loaded).not.toBeNull();
    const restoredB64 = await exportVaultKey(loaded!);
    expect(restoredB64).toBe(originalB64);
  });

  it("restoreFromRecoveryKit rejects malformed input: 'not-hex'", async () => {
    await expect(restoreFromRecoveryKit("not-hex")).rejects.toThrow();
  });

  it("restoreFromRecoveryKit rejects wrong-length input: 32 hex chars", async () => {
    // 32 lowercase hex chars — right characters but wrong length (half of 64)
    const shortHex = "aabbccdd".repeat(4); // 32 chars
    await expect(restoreFromRecoveryKit(shortHex)).rejects.toThrow();
  });

  // -------------------------------------------------------------------
  // Plan 240 — Recovery Kit staleness signal (spike §3 step 9)
  // -------------------------------------------------------------------

  it("isRecoveryKitStale is false when no kit has ever been generated (that's the separate confirm-first gate)", async () => {
    expect(await isRecoveryKitStale()).toBe(false);
  });

  it("isRecoveryKitStale is false right after generating a kit at the current version", async () => {
    await saveVaultKey(await generateVaultKey());
    await generateRecoveryKit();
    expect(await isRecoveryKitStale()).toBe(false);
  });

  it("isRecoveryKitStale becomes true once the current version advances past what the kit encodes", async () => {
    await saveVaultKeyVersion(1, await generateVaultKey());
    await generateRecoveryKit(); // encodes version 1
    expect(await isRecoveryKitStale()).toBe(false);

    // Simulate a rotation: a new version is saved and becomes current — the
    // kit generated above still only encodes version 1.
    await saveVaultKeyVersion(2, await generateVaultKey());
    await setCurrentVaultKeyVersion(2);

    expect(await isRecoveryKitStale()).toBe(true);
  });

  it("restoreFromRecoveryKit records the version restored to, so staleness is accurate immediately after recovery", async () => {
    await saveVaultKeyVersion(1, await generateVaultKey());
    const code = await generateRecoveryKit();
    localStorage.clear(); // simulate all devices lost

    await restoreFromRecoveryKit(code);

    // Fresh device, current version defaults to 1, kit was just (re)confirmed
    // at that same version → not stale.
    expect(await isRecoveryKitStale()).toBe(false);
  });
});
