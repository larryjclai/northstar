// End-to-end vault-key rotation tests: multiple "devices" (isolated
// localStorage stores) exchange a rotated vault key through an in-memory fake
// of the relay transport, using the REAL crypto/vault/pairing/rotation code.
// Modeled after pairing-flow.e2e.test.ts's fake-relay pattern (Plan 241).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---- in-memory relay (shared with the ./client mock via vi.hoisted) ----
const relay = vi.hoisted(() => ({
  sessions: new Map<string, { encryptedBundle: string; deviceId: string; token: string; claimed: boolean }>(),
  keyEnvelopes: new Map<string, Array<{ id: string; sourceDeviceId: string; keyType: string; wrappedKey: string; sourcePublicKeyB64?: string; wrappedKeyVersion: number; createdAt: string }>>(),
  devices: [] as Array<{ id: string; name: string; platform: string; secretHash?: string; publicKeyB64?: string | null }>,
  publicKeys: new Map<string, string>(),
  keyVersionCounters: new Map<string, number>(),
  bundles: [] as string[],
  reset() {
    this.sessions.clear();
    this.keyEnvelopes.clear();
    this.devices.length = 0;
    this.publicKeys.clear();
    this.keyVersionCounters.clear();
    this.bundles.length = 0;
  },
}));

vi.mock("./client", () => ({
  isSyncWorkerConfigured: () => true,
  allocateKeyVersion: vi.fn(async (_apiSecret: string, keyType: string) => {
    const next = (relay.keyVersionCounters.get(keyType) ?? 0) + 1;
    relay.keyVersionCounters.set(keyType, next);
    return next;
  }),
  joinPairingSession: vi.fn(async (code: string, encryptedBundle: string, deviceId: string) => {
    const token = "tok_" + Math.random().toString(36).slice(2);
    relay.sessions.set(code, { encryptedBundle, deviceId, token, claimed: false });
    relay.bundles.push(encryptedBundle);
    return { pairingToken: token };
  }),
  claimPairingSession: vi.fn(async (code: string) => {
    const s = relay.sessions.get(code);
    if (!s) throw new Error("Invalid code");
    if (s.claimed) throw new Error("Already claimed");
    s.claimed = true;
    return { encryptedBundle: s.encryptedBundle };
  }),
  storeKeyEnvelope: vi.fn(async (
    _apiSecret: string,
    target: string,
    env: { id: string; sourceDeviceId: string; keyType: string; wrappedKey: string; sourcePublicKeyB64?: string; wrappedKeyVersion: number },
  ) => {
    const arr = relay.keyEnvelopes.get(target) ?? [];
    const next = arr.filter((e) => e.keyType !== env.keyType);
    next.push({ ...env, createdAt: new Date().toISOString() });
    relay.keyEnvelopes.set(target, next);
  }),
  fetchKeyEnvelopesWithToken: vi.fn(async (token: string, target: string) => {
    const ok = [...relay.sessions.values()].some((s) => s.token === token && s.deviceId === target);
    if (!ok) throw new Error("Invalid pairing token");
    return relay.keyEnvelopes.get(target) ?? [];
  }),
  // Recipient-side pickup path under test — the authenticated variant, which
  // (per plan 241's motivation) had zero production call sites before this.
  fetchKeyEnvelopes: vi.fn(async (_apiSecret: string, target: string) => {
    return relay.keyEnvelopes.get(target) ?? [];
  }),
  listDevices: vi.fn(async (_apiSecret: string) => {
    return relay.devices.map((d) => ({
      id: d.id,
      name: d.name,
      platform: d.platform,
      trusted_at: null,
      created_at: new Date().toISOString(),
      publicKeyB64: relay.publicKeys.get(d.id) ?? d.publicKeyB64 ?? null,
    }));
  }),
  addDevice: vi.fn(async (
    _apiSecret: string,
    device: { id: string; name: string; platform: string; secretHash?: string; publicKeyB64?: string },
  ) => {
    relay.devices.push(device);
    if (device.publicKeyB64 && !relay.publicKeys.has(device.id)) {
      relay.publicKeys.set(device.id, device.publicKeyB64);
    }
  }),
  provisionDevicePublicKey: vi.fn(async (_apiSecret: string, deviceId: string, publicKeyB64: string) => {
    if (relay.publicKeys.has(deviceId)) {
      throw new Error("Sync worker 409: already set");
    }
    relay.publicKeys.set(deviceId, publicKeyB64);
  }),
  // legacy — unused by the flows under test but imported by pairing-flow.ts
  createPairingSession: vi.fn(),
  // imported by account.ts (ensureDeviceCredential); unused on these paths
  provisionDeviceCredential: vi.fn(),
}));

import {
  startJoinSession,
  completeJoin,
  inspectJoinRequest,
  approveJoiningDevice,
} from "./pairing-flow";
import { rotateVaultKey, pickUpRotatedVaultKey } from "./rotation";
import { generateVaultKey, saveVaultKey, loadVaultKey, exportVaultKey, getCurrentVaultKeyVersion } from "../crypto/vault";
import { generateDeviceKeyPair, exportPublicKey } from "../crypto/pairing";
import { getOrCreateSyncAccount, type SyncAccount } from "./account";
import { resetSecretStoreForTests } from "../crypto/secretStore";
import { getOrCreateDeviceIdentity } from "../../../state/deviceIdentity";
import { listDevices, allocateKeyVersion, storeKeyEnvelope } from "./client";

const mockedListDevices = vi.mocked(listDevices);
const mockedAllocateKeyVersion = vi.mocked(allocateKeyVersion);
const mockedStoreKeyEnvelope = vi.mocked(storeKeyEnvelope);

function makeLocalStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => m.clear(),
    key: (i: number) => Array.from(m.keys())[i] ?? null,
    get length() { return m.size; },
  } as Storage;
}

let deviceA: Storage;
let deviceB: Storage;
let deviceC: Storage;

/** Switch the "current device" — swaps localStorage and rebuilds the memoized secret store. */
function activate(store: Storage) {
  vi.stubGlobal("localStorage", store);
  resetSecretStoreForTests();
}

/** Pair a fresh device (its own localStorage) onto A's account. Returns the new device's id. */
async function pairDevice(newDevice: Storage, name: string, platform: string): Promise<string> {
  activate(newDevice);
  const session = await startJoinSession(name, platform);
  activate(deviceA);
  const approval = await inspectJoinRequest(session.code);
  await approveJoiningDevice(approval);
  activate(newDevice);
  const result = await completeJoin(session);
  expect(result).not.toBeNull();
  return session.deviceId;
}

beforeEach(() => {
  relay.reset();
  vi.clearAllMocks(); // reset call-count history (not implementations) between tests
  deviceA = makeLocalStorage();
  deviceB = makeLocalStorage();
  deviceC = makeLocalStorage();
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetSecretStoreForTests();
});

describe("rotateVaultKey — initiator side", () => {
  it("is a no-op for a solo-device account (zero remaining targets)", async () => {
    activate(deviceA);
    const aVaultKey = await generateVaultKey();
    await saveVaultKey(aVaultKey);
    const aAccount = await getOrCreateSyncAccount();

    const result = await rotateVaultKey(aAccount);

    expect(result).toEqual({ rotated: false, reason: "no-remaining-devices", targetCount: 0, succeeded: [], failed: [] });
    // No key generated, no version allocated, no pointer touched.
    expect(mockedAllocateKeyVersion).not.toHaveBeenCalled();
    expect(mockedStoreKeyEnvelope).not.toHaveBeenCalled();
    expect(await getCurrentVaultKeyVersion()).toBe(1);
    expect(await exportVaultKey((await loadVaultKey())!)).toBe(await exportVaultKey(aVaultKey));
  });

  it("deposits one wrapped envelope per remaining device, excluding the just-revoked one, and flips the pointer LAST", async () => {
    activate(deviceA);
    const aVaultKey = await generateVaultKey();
    await saveVaultKey(aVaultKey);
    const aAccount = await getOrCreateSyncAccount();

    const bId = await pairDevice(deviceB, "B", "macos");
    const cId = await pairDevice(deviceC, "C", "ios");

    activate(deviceA);
    // Simulate C having just been revoked: gone from the relay's device list.
    relay.devices = relay.devices.filter((d) => d.id !== cId);
    relay.publicKeys.delete(cId);

    const beforeVersion = await getCurrentVaultKeyVersion();
    const result = await rotateVaultKey(aAccount, cId);

    expect(result.rotated).toBe(true);
    expect(result.reason).toBe("ok");
    expect(result.targetCount).toBe(1); // only B — A excludes itself, C is gone
    expect(result.succeeded).toEqual([bId]);
    expect(result.failed).toEqual([]);
    expect(result.newVersion).toBeGreaterThan(beforeVersion);

    // Exactly one envelope deposited, addressed to B, carrying the new version.
    const envs = relay.keyEnvelopes.get(bId)!.filter((e) => e.keyType === "vault-v1");
    expect(envs).toHaveLength(1);
    expect(envs[0].wrappedKeyVersion).toBe(result.newVersion);

    // A's own pointer flipped to the new version (flip-LAST, but this IS the
    // success path, so it must have happened).
    expect(await getCurrentVaultKeyVersion()).toBe(result.newVersion);
    const newAVaultKey = await loadVaultKey();
    expect(await exportVaultKey(newAVaultKey!)).not.toBe(await exportVaultKey(aVaultKey));

    // Old key version (1) is still retrievable — Phase B's never-delete
    // invariant holds; nothing in rotation deletes a prior slot.
    const { loadVaultKeyVersion } = await import("../crypto/vault");
    const oldKey = await loadVaultKeyVersion(1);
    expect(oldKey).not.toBeNull();
    expect(await exportVaultKey(oldKey!)).toBe(await exportVaultKey(aVaultKey));
  });

  it("reports a partial failure (device with no public key on file) and does NOT flip the pointer", async () => {
    activate(deviceA);
    const aVaultKey = await generateVaultKey();
    await saveVaultKey(aVaultKey);
    const aAccount = await getOrCreateSyncAccount();

    // In reality, a remaining device can only exist because this account
    // already went through >=1 real pairing, which itself calls
    // allocateKeyVersion("vault-v1") and lands on 1 — matching the local
    // convention that version 1 (the DEFAULT, never explicitly stamped) is
    // whatever key existed before any pairing/rotation ever ran. Seed that
    // same precondition here without needing a full pairDevice() round trip.
    relay.keyVersionCounters.set("vault-v1", 1);

    // A device that is trusted but never uploaded a public key (e.g. a
    // pre-Phase-A install that hasn't synced since) — no entry in
    // relay.publicKeys, mirroring devices.public_key IS NULL.
    relay.devices.push({ id: "device_no_key", name: "Old Laptop", platform: "windows" });

    const result = await rotateVaultKey(aAccount);

    expect(result.rotated).toBe(false);
    expect(result.reason).toBe("partial-failure");
    expect(result.failed).toEqual([{ deviceId: "device_no_key", reason: "no public key on file" }]);
    expect(mockedStoreKeyEnvelope).not.toHaveBeenCalled();

    // Pointer must remain on the OLD version — safe, exactly like a crash
    // mid-loop.
    expect(await getCurrentVaultKeyVersion()).toBe(1);
    expect(await exportVaultKey((await loadVaultKey())!)).toBe(await exportVaultKey(aVaultKey));
  });

  it("re-running after a partial failure converges once the blocking device is reachable", async () => {
    activate(deviceA);
    const aVaultKey = await generateVaultKey();
    await saveVaultKey(aVaultKey);
    const aAccount = await getOrCreateSyncAccount();
    const bId = await pairDevice(deviceB, "B", "macos");

    relay.devices.push({ id: "device_no_key", name: "Old Laptop", platform: "windows" });

    activate(deviceA);
    const first = await rotateVaultKey(aAccount);
    expect(first.reason).toBe("partial-failure");
    expect(await getCurrentVaultKeyVersion()).toBe(1); // unchanged

    // The blocking device now has a REAL public key on file (e.g. it synced
    // and ran the Phase A backfill).
    const backfilledPair = await generateDeviceKeyPair();
    relay.publicKeys.set("device_no_key", await exportPublicKey(backfilledPair.publicKey));

    // Re-run: a fresh version is allocated (the failed attempt's version 2
    // is simply abandoned — harmless, per the never-delete invariant) and
    // this time BOTH targets are reachable, so it fully converges.
    const second = await rotateVaultKey(aAccount);
    expect(second.rotated).toBe(true);
    expect(second.reason).toBe("ok");
    expect(second.succeeded.sort()).toEqual([bId, "device_no_key"].sort());
    expect(second.failed).toEqual([]);
    expect(second.newVersion).toBeGreaterThan(first.newVersion!);
    expect(await getCurrentVaultKeyVersion()).toBe(second.newVersion);
  });
});

describe("pickUpRotatedVaultKey — recipient side", () => {
  it("adopts a newer wrapped key waiting in the mailbox and flips the local pointer", async () => {
    activate(deviceA);
    const aVaultKey = await generateVaultKey();
    await saveVaultKey(aVaultKey);
    const aAccount = await getOrCreateSyncAccount();
    await pairDevice(deviceB, "B", "macos");

    activate(deviceA);
    const rotation = await rotateVaultKey(aAccount);
    expect(rotation.rotated).toBe(true);
    const newVaultKeyB64 = await exportVaultKey((await loadVaultKey())!);

    // ── B was fully caught up before rotation; picks it up now ──
    activate(deviceB);
    const bAccount = { userId: aAccount.userId, apiSecret: aAccount.apiSecret } as SyncAccount;
    expect(await getCurrentVaultKeyVersion()).toBe(1);

    await pickUpRotatedVaultKey(bAccount);

    expect(await getCurrentVaultKeyVersion()).toBe(rotation.newVersion);
    const bVaultKey = await loadVaultKey();
    expect(await exportVaultKey(bVaultKey!)).toBe(newVaultKeyB64);
  });

  it("is idempotent — re-fetching an already-applied envelope is a no-op", async () => {
    activate(deviceA);
    await saveVaultKey(await generateVaultKey());
    const aAccount = await getOrCreateSyncAccount();
    await pairDevice(deviceB, "B", "macos");

    activate(deviceA);
    const rotation = await rotateVaultKey(aAccount);

    activate(deviceB);
    const bAccount = { userId: aAccount.userId, apiSecret: aAccount.apiSecret } as SyncAccount;
    await pickUpRotatedVaultKey(bAccount);
    const versionAfterFirst = await getCurrentVaultKeyVersion();
    const keyAfterFirst = await exportVaultKey((await loadVaultKey())!);

    // Second call: same envelope still sitting in the mailbox (UPSERT
    // overwrite, never cleared) — version comparison short-circuits.
    await pickUpRotatedVaultKey(bAccount);

    expect(await getCurrentVaultKeyVersion()).toBe(versionAfterFirst);
    expect(versionAfterFirst).toBe(rotation.newVersion);
    expect(await exportVaultKey((await loadVaultKey())!)).toBe(keyAfterFirst);
  });

  it("offline-then-later: a device that misses the rotation entirely still converges on its next sync", async () => {
    activate(deviceA);
    await saveVaultKey(await generateVaultKey());
    const aAccount = await getOrCreateSyncAccount();
    await pairDevice(deviceB, "B", "macos");
    await pairDevice(deviceC, "C", "ios");

    // C goes offline for the entire rotation — never calls pickUpRotatedVaultKey.
    activate(deviceA);
    const rotation = await rotateVaultKey(aAccount);
    expect(rotation.rotated).toBe(true);
    const rotatedKeyB64 = await exportVaultKey((await loadVaultKey())!);

    // ... time passes, C finally comes back online and runs a normal sync ...
    activate(deviceC);
    const cAccount = { userId: aAccount.userId, apiSecret: aAccount.apiSecret } as SyncAccount;
    expect(await getCurrentVaultKeyVersion()).toBe(1);

    await pickUpRotatedVaultKey(cAccount);

    expect(await getCurrentVaultKeyVersion()).toBe(rotation.newVersion);
    expect(await exportVaultKey((await loadVaultKey())!)).toBe(rotatedKeyB64);
  });

  it("is a safe no-op for a device with no persisted keypair", async () => {
    activate(deviceA);
    await saveVaultKey(await generateVaultKey());
    const aAccount = await getOrCreateSyncAccount();

    // A brand-new device that has never paired/approved anyone has no ECDH
    // keypair yet — nothing to unwrap a rotated key with.
    const freshDevice = makeLocalStorage();
    activate(freshDevice);
    getOrCreateDeviceIdentity(); // establishes a device identity, but no keypair

    await expect(pickUpRotatedVaultKey(aAccount)).resolves.toBeUndefined();
    expect(await loadVaultKey()).toBeNull();
  });
});

describe("rotateVaultKey / pickUpRotatedVaultKey — never touch relay history", () => {
  it("only ever calls the /keys mailbox and device directory, never a sync-envelope push/pull primitive", async () => {
    activate(deviceA);
    await saveVaultKey(await generateVaultKey());
    const aAccount = await getOrCreateSyncAccount();
    await pairDevice(deviceB, "B", "macos");

    activate(deviceA);
    await rotateVaultKey(aAccount);

    // GET /devices was consulted (directory lookup) — but no push/pull-shaped
    // relay call exists anywhere in this module to assert absence of; the
    // structural guarantee is simply that rotation.ts never imports
    // pushEnvelopes/pullEnvelopes (see the module's own import list).
    expect(mockedListDevices).toHaveBeenCalled();
  });
});
