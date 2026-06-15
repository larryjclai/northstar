import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  formatKitCode,
  parseKitCode,
  generateRecoveryKit,
  restoreFromRecoveryKit,
} from "./recovery-kit";
import { generateVaultKey, exportVaultKey, saveVaultKey, loadVaultKey } from "./vault";

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
});
