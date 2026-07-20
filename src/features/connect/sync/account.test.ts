import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { provisionDeviceCredential, provisionDevicePublicKey } from "./client";
import { resetSecretStoreForTests } from "../crypto/secretStore";
import { generateDeviceKeyPair, saveDeviceKeyPair } from "../crypto/pairing";
import { getOrCreateDeviceIdentity } from "../../../state/deviceIdentity";
import {
  generateDeviceSecret,
  loadDeviceSecret,
  saveDeviceSecret,
  clearDeviceSecret,
  getSyncAuthToken,
  ensureDeviceCredential,
  ensureDevicePublicKeyUploaded,
  sha256Hex,
  type SyncAccount,
} from "./account";

// Only provisionDeviceCredential/provisionDevicePublicKey are used from
// ./client here; the rest of the module is irrelevant to these unit tests.
vi.mock("./client", () => ({
  provisionDeviceCredential: vi.fn(),
  provisionDevicePublicKey: vi.fn(),
}));
const mockedProvision = vi.mocked(provisionDeviceCredential);
const mockedProvisionPublicKey = vi.mocked(provisionDevicePublicKey);

const account: SyncAccount = { userId: "u1", apiSecret: "acct-secret-legacy" };

beforeEach(() => {
  mockedProvision.mockReset();
  mockedProvisionPublicKey.mockReset();
  const mem = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
  });
  resetSecretStoreForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetSecretStoreForTests();
});

describe("getSyncAuthToken", () => {
  it("falls back to the account secret when no device secret is provisioned", async () => {
    expect(await getSyncAuthToken(account)).toBe(account.apiSecret);
  });

  it("prefers the device token <deviceId>.<deviceSecret> once provisioned", async () => {
    const secret = generateDeviceSecret();
    await saveDeviceSecret(secret);
    const { deviceId } = getOrCreateDeviceIdentity();
    expect(await getSyncAuthToken(account)).toBe(`${deviceId}.${secret}`);
  });

  it("device secret never contains the '.' separator", async () => {
    // deviceId.deviceSecret must split unambiguously on the first dot.
    for (let i = 0; i < 20; i++) {
      expect(generateDeviceSecret()).not.toContain(".");
    }
  });
});

describe("ensureDeviceCredential", () => {
  it("provisions a credential and persists the secret when none exists", async () => {
    mockedProvision.mockResolvedValue(undefined);
    await ensureDeviceCredential(account);

    const secret = await loadDeviceSecret();
    expect(secret).toBeTruthy();
    expect(mockedProvision).toHaveBeenCalledTimes(1);

    // It registered only the HASH of the secret, using the account (legacy) token.
    const { deviceId } = getOrCreateDeviceIdentity();
    const [apiSecretArg, deviceIdArg, hashArg] = mockedProvision.mock.calls[0];
    expect(apiSecretArg).toBe(account.apiSecret);
    expect(deviceIdArg).toBe(deviceId);
    expect(hashArg).toBe(await sha256Hex(secret!));
  });

  it("is a no-op when a credential already exists", async () => {
    await saveDeviceSecret(generateDeviceSecret());
    await ensureDeviceCredential(account);
    expect(mockedProvision).not.toHaveBeenCalled();
  });

  it("does NOT persist the secret if the relay rejects provisioning", async () => {
    mockedProvision.mockRejectedValue(new Error("Sync worker 409: already set"));
    await ensureDeviceCredential(account);

    // Nothing saved → next sync keeps using the account secret and retries.
    expect(await loadDeviceSecret()).toBeNull();
    expect(await getSyncAuthToken(account)).toBe(account.apiSecret);
  });
});

describe("ensureDevicePublicKeyUploaded (Plan 239)", () => {
  it("is a no-op when this device has never paired (no persisted keypair)", async () => {
    await ensureDevicePublicKeyUploaded(account);
    expect(mockedProvisionPublicKey).not.toHaveBeenCalled();
  });

  it("uploads the public key for a device that has a persisted keypair, then never repeats the call", async () => {
    const pair = await generateDeviceKeyPair();
    await saveDeviceKeyPair(pair);
    mockedProvisionPublicKey.mockResolvedValue(undefined);

    await ensureDevicePublicKeyUploaded(account);
    expect(mockedProvisionPublicKey).toHaveBeenCalledTimes(1);
    const { deviceId } = getOrCreateDeviceIdentity();
    const [apiSecretArg, deviceIdArg, publicKeyArg] = mockedProvisionPublicKey.mock.calls[0];
    expect(apiSecretArg).toBe(account.apiSecret);
    expect(deviceIdArg).toBe(deviceId);
    expect(typeof publicKeyArg).toBe("string");

    // The local marker short-circuits every subsequent call — no repeat network hit.
    await ensureDevicePublicKeyUploaded(account);
    await ensureDevicePublicKeyUploaded(account);
    expect(mockedProvisionPublicKey).toHaveBeenCalledTimes(1);
  });

  it("treats a 409 (already set via another path, e.g. the approver's addDevice) as done — does not retry", async () => {
    const pair = await generateDeviceKeyPair();
    await saveDeviceKeyPair(pair);
    mockedProvisionPublicKey.mockRejectedValue(new Error("Sync worker 409: already set"));

    await ensureDevicePublicKeyUploaded(account);
    await ensureDevicePublicKeyUploaded(account);
    expect(mockedProvisionPublicKey).toHaveBeenCalledTimes(1); // marked done after the 409
  });

  it("retries on the next call after a transient (non-409) failure", async () => {
    const pair = await generateDeviceKeyPair();
    await saveDeviceKeyPair(pair);
    mockedProvisionPublicKey.mockRejectedValue(new Error("Network error"));

    await ensureDevicePublicKeyUploaded(account);
    await ensureDevicePublicKeyUploaded(account);
    expect(mockedProvisionPublicKey).toHaveBeenCalledTimes(2); // not marked done — retried
  });
});

describe("clearDeviceSecret", () => {
  it("removes the stored credential so the token falls back to the account secret", async () => {
    await saveDeviceSecret(generateDeviceSecret());
    await clearDeviceSecret();
    expect(await loadDeviceSecret()).toBeNull();
    expect(await getSyncAuthToken(account)).toBe(account.apiSecret);
  });
});
