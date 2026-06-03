import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  confirmRecoveryKit,
  isRecoveryKitConfirmed,
  loadLocalRecoveryKitStatus,
} from "./crypto/recovery-kit";
import { canEnableCloudBackedFeature } from "./policies";

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

describe("Recovery Kit sync gate", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("is not confirmed before the user saves the kit", () => {
    expect(isRecoveryKitConfirmed()).toBe(false);
  });

  it("is confirmed after confirmRecoveryKit()", () => {
    confirmRecoveryKit();
    expect(isRecoveryKitConfirmed()).toBe(true);
    expect(loadLocalRecoveryKitStatus()?.confirmedAt).toBeTruthy();
  });

  it("blocks cloud features until the kit is confirmed", () => {
    const recoveryKit = { createdAt: new Date().toISOString(), confirmedAt: null };
    expect(canEnableCloudBackedFeature({ isSignedIn: true, recoveryKit })).toBe(false);

    confirmRecoveryKit();
    const confirmed = loadLocalRecoveryKitStatus()!;
    expect(canEnableCloudBackedFeature({ isSignedIn: true, recoveryKit: confirmed })).toBe(true);
  });

  it("still requires sign-in even with a confirmed kit", () => {
    confirmRecoveryKit();
    const confirmed = loadLocalRecoveryKitStatus()!;
    expect(canEnableCloudBackedFeature({ isSignedIn: false, recoveryKit: confirmed })).toBe(false);
  });
});
