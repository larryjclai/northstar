import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import worker from "./index";

// ---- helpers ----------------------------------------------------------------

// The worker's fetch is (request, env) and never touches the execution context,
// so we call it directly against the test-provided env (real D1 binding).
async function call(path: string, init: RequestInit = {}): Promise<Response> {
  return worker.fetch(new Request(`https://relay.test${path}`, init), env);
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

// A fresh pairing code per use — `code` is the pairing_sessions PRIMARY KEY, so
// reusing a literal across tests would collide.
function randomCode(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const group = () =>
    Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  return `${group()}-${group()}`;
}

let userSeq = 0;

interface Account {
  userId: string;
  apiSecret: string;
  deviceId: string;
  deviceSecret?: string;
}

/** Register a fresh account (+ first device). Optionally give the device its own credential. */
async function register(opts: { deviceSecret?: string; deviceId?: string } = {}): Promise<Account> {
  userSeq += 1;
  const userId = `user_${userSeq}_${crypto.randomUUID()}`;
  // No dot → unambiguously an account (legacy) secret, never a device token.
  const apiSecret = `acct-${crypto.randomUUID().replace(/-/g, "")}`;
  const deviceId = opts.deviceId ?? `dev_${crypto.randomUUID()}`;
  const device: Record<string, unknown> = { id: deviceId, name: "Mac", platform: "macos" };
  if (opts.deviceSecret) device.secretHash = await sha256Hex(opts.deviceSecret);

  const res = await call("/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, apiSecretHash: await sha256Hex(apiSecret), device }),
  });
  expect(res.status).toBe(201);
  return { userId, apiSecret, deviceId, deviceSecret: opts.deviceSecret };
}

function envelope(over: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: crypto.randomUUID(),
    deviceId: "dev_body",
    entity: "account",
    entityId: "acc_1",
    revision: 1,
    encryptedPayload: "cipher",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

// Plan 239 revise round 1: the ONLY place a wrapped_key_version is minted.
// Returns the allocated version so callers can reuse the SAME value across
// multiple POST /keys/:targetDeviceId deposits (one rotation -> N devices,
// ONE shared version — the bug this round fixed).
async function allocateVersion(acct: Account, keyType: string): Promise<number> {
  const res = await call("/keys/version", {
    method: "POST",
    headers: bearer(acct.apiSecret),
    body: JSON.stringify({ keyType }),
  });
  expect(res.status).toBe(201);
  const body = await res.json<{ version: number }>();
  return body.version;
}

// Convenience: allocate a version for keyType, then store one envelope under
// it for a single target device. Most tests want this one-shot shape; the
// "same rotation, N devices" tests call allocateVersion once and storeKey
// (below) is NOT used for those — they build the /keys/:target body inline
// so the SAME allocated version is reused across multiple calls.
async function storeKey(
  acct: Account,
  target: string,
  keyType = "vault-v1",
  overrides: Partial<Record<string, unknown>> = {},
): Promise<Response> {
  const version = "wrappedKeyVersion" in overrides ? overrides.wrappedKeyVersion : await allocateVersion(acct, keyType);
  return call(`/keys/${target}`, {
    method: "POST",
    headers: bearer(acct.apiSecret),
    body: JSON.stringify({
      id: crypto.randomUUID(),
      sourceDeviceId: acct.deviceId,
      keyType,
      wrappedKey: "w",
      wrappedKeyVersion: version,
      ...overrides,
    }),
  });
}

beforeEach(() => {
  userSeq = 0;
});

// ---- harness ---------------------------------------------------------------

describe("harness", () => {
  it("has the migrated D1 schema (users, devices, sync_envelopes, pairing_sessions)", async () => {
    const rows = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    ).all<{ name: string }>();
    const names = rows.results.map((r: { name: string }) => r.name);
    expect(names).toEqual(expect.arrayContaining([
      "users", "devices", "sync_envelopes", "pairing_sessions", "key_envelopes",
    ]));
  });

  it("has the Plan 132 device_secret_hash column", async () => {
    const info = await env.DB.prepare("PRAGMA table_info(devices)").all<{ name: string }>();
    expect(info.results.map((c: { name: string }) => c.name)).toContain("device_secret_hash");
  });

  it("has the Plan 239 devices.public_key column and key_version_counters table (revise round 1)", async () => {
    const deviceCols = await env.DB.prepare("PRAGMA table_info(devices)").all<{ name: string }>();
    expect(deviceCols.results.map((c: { name: string }) => c.name)).toContain("public_key");

    const tables = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    ).all<{ name: string }>();
    expect(tables.results.map((r: { name: string }) => r.name)).toContain("key_version_counters");
  });
});

// ---- registration + auth ---------------------------------------------------

describe("authenticate", () => {
  it("legacy account-secret token authenticates and lists devices", async () => {
    const acct = await register();
    const res = await call("/devices", { headers: bearer(acct.apiSecret) });
    expect(res.status).toBe(200);
    const devices = await res.json<Array<{ id: string }>>();
    expect(devices.map((d) => d.id)).toEqual([acct.deviceId]);
  });

  it("rejects a missing Authorization header with 401", async () => {
    const res = await call("/devices");
    expect(res.status).toBe(401);
  });

  it("rejects a wrong account secret with 401", async () => {
    await register();
    const res = await call("/devices", { headers: bearer("acct-wrongsecret") });
    expect(res.status).toBe(401);
  });

  it("device-credential token authenticates (happy path)", async () => {
    const secret = crypto.randomUUID().replace(/-/g, "");
    const acct = await register({ deviceSecret: secret });
    const res = await call("/devices", { headers: bearer(`${acct.deviceId}.${secret}`) });
    expect(res.status).toBe(200);
    const devices = await res.json<Array<{ id: string }>>();
    expect(devices.map((d) => d.id)).toEqual([acct.deviceId]);
  });

  it("a revoked device's token returns 401 (row hard-deleted)", async () => {
    const acct = await register();
    const secret = crypto.randomUUID().replace(/-/g, "");
    const deviceB = `dev_${crypto.randomUUID()}`;
    // Add a second device with its own credential using the account secret.
    const add = await call("/devices", {
      method: "POST",
      headers: bearer(acct.apiSecret),
      body: JSON.stringify({ id: deviceB, name: "iPhone", platform: "ios", secretHash: await sha256Hex(secret) }),
    });
    expect(add.status).toBe(201);
    // B's token works…
    expect((await call("/devices", { headers: bearer(`${deviceB}.${secret}`) })).status).toBe(200);
    // …until it is revoked.
    const revoke = await call(`/devices/${deviceB}`, { method: "DELETE", headers: bearer(acct.apiSecret) });
    expect(revoke.status).toBe(200);
    const after = await call("/devices", { headers: bearer(`${deviceB}.${secret}`) });
    expect(after.status).toBe(401);
  });

  it("a malformed device token (unknown device / empty secret) returns 401", async () => {
    await register();
    expect((await call("/devices", { headers: bearer("dev_ghost.nosuchsecret") })).status).toBe(401);
    // Dotted token with an empty secret must not fall through to legacy auth.
    expect((await call("/devices", { headers: bearer("dev_ghost.") })).status).toBe(401);
  });

  it("a device secret that does not match the stored hash returns 401", async () => {
    const acct = await register({ deviceSecret: "correct-secret" });
    const res = await call("/devices", { headers: bearer(`${acct.deviceId}.wrong-secret`) });
    expect(res.status).toBe(401);
  });
});

// ---- set-once device credential provisioning -------------------------------

describe("POST /devices/:id/credential (set-once provision)", () => {
  it("provisions a credential on an owned, credential-less device, then the token works", async () => {
    const acct = await register(); // device registered with NO credential
    const secret = crypto.randomUUID().replace(/-/g, "");
    const res = await call(`/devices/${acct.deviceId}/credential`, {
      method: "POST",
      headers: bearer(acct.apiSecret),
      body: JSON.stringify({ secretHash: await sha256Hex(secret) }),
    });
    expect(res.status).toBe(201);
    expect((await call("/devices", { headers: bearer(`${acct.deviceId}.${secret}`) })).status).toBe(200);
  });

  it("refuses to overwrite an already-provisioned credential with 409", async () => {
    const acct = await register({ deviceSecret: "first-secret" });
    const res = await call(`/devices/${acct.deviceId}/credential`, {
      method: "POST",
      headers: bearer(acct.apiSecret),
      body: JSON.stringify({ secretHash: await sha256Hex("second-secret") }),
    });
    expect(res.status).toBe(409);
    // The original credential still authenticates; the second never took effect.
    expect((await call("/devices", { headers: bearer(`${acct.deviceId}.first-secret`) })).status).toBe(200);
    expect((await call("/devices", { headers: bearer(`${acct.deviceId}.second-secret`) })).status).toBe(401);
  });

  it("returns 409 for a device not owned by the caller", async () => {
    const acct = await register();
    const res = await call(`/devices/dev_not_mine/credential`, {
      method: "POST",
      headers: bearer(acct.apiSecret),
      body: JSON.stringify({ secretHash: await sha256Hex("x") }),
    });
    expect(res.status).toBe(409);
  });
});

// ---- envelope push / pull with cursor --------------------------------------

describe("envelopes push + cursor pull", () => {
  async function push(acct: Account, envelopes: unknown[], token = acct.apiSecret) {
    return call("/envelopes", {
      method: "POST",
      headers: bearer(token),
      body: JSON.stringify({ envelopes }),
    });
  }
  async function pull(acct: Account, cursor = 0, token = acct.apiSecret) {
    const res = await call(`/envelopes?cursor=${cursor}`, { headers: bearer(token) });
    return res.json<{ envelopes: Array<Record<string, unknown>>; nextCursor: string; count: number }>();
  }

  it("pushes envelopes and pulls them back in relay-sequence order, advancing the cursor", async () => {
    const acct = await register();
    const res = await push(acct, [
      envelope({ entityId: "acc_1", revision: 1 }),
      envelope({ entityId: "acc_2", revision: 1 }),
      envelope({ entityId: "acc_3", revision: 1 }),
    ]);
    expect(res.status).toBe(200);

    const page = await pull(acct, 0);
    expect(page.count).toBe(3);
    expect(page.envelopes.map((e) => e.entityId)).toEqual(["acc_1", "acc_2", "acc_3"]);
    const seqs = page.envelopes.map((e) => Number(e.sequence));
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(page.nextCursor).toBe(String(seqs[seqs.length - 1]));

    // Pulling from the last cursor returns nothing new.
    const empty = await pull(acct, Number(page.nextCursor));
    expect(empty.count).toBe(0);
    expect(empty.nextCursor).toBe(page.nextCursor);
  });

  it("scopes pulls per user — one account never sees another's envelopes", async () => {
    const a = await register();
    const b = await register();
    await push(a, [envelope({ entityId: "acc_a" })]);
    const bPage = await pull(b, 0);
    expect(bPage.count).toBe(0);
  });

  it("de-duplicates a re-pushed envelope (ON CONFLICT DO NOTHING) — no duplicate row", async () => {
    const acct = await register();
    const dup = envelope({ entityId: "acc_dup", revision: 1, deviceId: "dev_body" });
    await push(acct, [dup]);
    // Same (user, entity, entityId, revision, deviceId) → conflict target → ignored.
    await push(acct, [{ ...dup, id: crypto.randomUUID(), encryptedPayload: "cipher-2" }]);
    const page = await pull(acct, 0);
    expect(page.count).toBe(1);
    expect(page.envelopes[0].encryptedPayload).toBe("cipher"); // first write wins
  });

  it("stamps the authenticated device id over the body value for device-token pushes", async () => {
    const secret = crypto.randomUUID().replace(/-/g, "");
    const acct = await register({ deviceSecret: secret });
    await push(acct, [envelope({ entityId: "acc_stamp", deviceId: "dev_LIES" })], `${acct.deviceId}.${secret}`);
    const page = await pull(acct, 0);
    expect(page.envelopes[0].deviceId).toBe(acct.deviceId);
  });

  it("rejects an empty envelope array with 400", async () => {
    const acct = await register();
    const res = await push(acct, []);
    expect(res.status).toBe(400);
  });
});

// ---- envelope key_version stamp (Plan 240, rotation phase B) --------------

describe("envelope key_version stamp (Plan 240)", () => {
  async function push(acct: Account, envelopes: unknown[]) {
    return call("/envelopes", {
      method: "POST",
      headers: bearer(acct.apiSecret),
      body: JSON.stringify({ envelopes }),
    });
  }
  async function pull(acct: Account, cursor = 0) {
    const res = await call(`/envelopes?cursor=${cursor}`, { headers: bearer(acct.apiSecret) });
    return res.json<{ envelopes: Array<Record<string, unknown>>; nextCursor: string; count: number }>();
  }

  it("has the Plan 240 sync_envelopes.key_version column", async () => {
    const info = await env.DB.prepare("PRAGMA table_info(sync_envelopes)").all<{ name: string }>();
    expect(info.results.map((c: { name: string }) => c.name)).toContain("key_version");
  });

  it("persists a client-supplied keyVersion and returns it on pull", async () => {
    const acct = await register();
    await push(acct, [envelope({ entityId: "acc_v3", keyVersion: 3 })]);
    const page = await pull(acct, 0);
    expect(page.envelopes[0].keyVersion).toBe(3);
  });

  it("defaults keyVersion to 1 when the client omits it entirely", async () => {
    const acct = await register();
    const body = envelope({ entityId: "acc_noversion" });
    delete (body as Record<string, unknown>).keyVersion; // envelope() never sets it, but be explicit
    await push(acct, [body]);
    const page = await pull(acct, 0);
    expect(page.envelopes[0].keyVersion).toBe(1);
  });

  it("clamps an invalid keyVersion (zero/negative/non-integer) to 1 rather than trusting the wire", async () => {
    const acct = await register();
    await push(acct, [
      envelope({ entityId: "acc_zero", keyVersion: 0 }),
      envelope({ entityId: "acc_negative", keyVersion: -5 }),
      envelope({ entityId: "acc_float", keyVersion: 1.5 }),
    ]);
    const page = await pull(acct, 0);
    for (const e of page.envelopes) expect(e.keyVersion).toBe(1);
  });

  it("different envelopes in the same push batch keep independent keyVersion stamps", async () => {
    const acct = await register();
    await push(acct, [
      envelope({ entityId: "acc_a", keyVersion: 1 }),
      envelope({ entityId: "acc_b", keyVersion: 2 }),
    ]);
    const page = await pull(acct, 0);
    const byEntity = new Map(page.envelopes.map((e) => [e.entityId, e.keyVersion]));
    expect(byEntity.get("acc_a")).toBe(1);
    expect(byEntity.get("acc_b")).toBe(2);
  });
});

// ---- per-user relay sequence (Plan 133 item A) -----------------------------

describe("per-user relay sequence (Plan 133 item A)", () => {
  async function push(acct: Account, envelopes: unknown[]) {
    return call("/envelopes", {
      method: "POST",
      headers: bearer(acct.apiSecret),
      body: JSON.stringify({ envelopes }),
    });
  }
  async function pull(acct: Account, cursor = 0) {
    const res = await call(`/envelopes?cursor=${cursor}`, { headers: bearer(acct.apiSecret) });
    return res.json<{ envelopes: Array<Record<string, unknown>>; nextCursor: string; count: number }>();
  }

  it("scopes the sequence counter per user — a second account starts at 1, not the global max", async () => {
    const a = await register();
    const b = await register();
    await push(a, [
      envelope({ entityId: "a1" }),
      envelope({ entityId: "a2" }),
      envelope({ entityId: "a3" }),
    ]);
    const bRes = await push(b, [envelope({ entityId: "b1" })]);
    expect(bRes.status).toBe(200);

    const bPage = await pull(b);
    expect(bPage.count).toBe(1);
    // Under the old GLOBAL MAX this would be 4; the scoped MAX(WHERE user_id) → 1.
    expect(Number(bPage.envelopes[0].sequence)).toBe(1);
  });

  it("lets two accounts hold the SAME relay_sequence value (per-user unique index)", async () => {
    const a = await register();
    const b = await register();
    // a takes relay_sequence 1. Under the old GLOBAL unique index, b re-using
    // relay_sequence 1 would trip the unique constraint and 500 the whole batch.
    const ra = await push(a, [envelope({ entityId: "x" })]);
    const rb = await push(b, [envelope({ entityId: "x" })]);
    expect(ra.status).toBe(200);
    expect(rb.status).toBe(200);

    expect(Number((await pull(a)).envelopes[0].sequence)).toBe(1);
    expect(Number((await pull(b)).envelopes[0].sequence)).toBe(1);
  });

  it("interleaved concurrent pushes from different accounts both succeed, per-user ordering intact", async () => {
    const a = await register();
    const b = await register();
    const [ra, rb] = await Promise.all([
      push(a, [envelope({ entityId: "a1" }), envelope({ entityId: "a2" }), envelope({ entityId: "a3" })]),
      push(b, [envelope({ entityId: "b1" }), envelope({ entityId: "b2" }), envelope({ entityId: "b3" })]),
    ]);
    expect(ra.status).toBe(200);
    expect(rb.status).toBe(200);

    const aPage = await pull(a);
    const bPage = await pull(b);
    expect(aPage.envelopes.map((e) => e.entityId)).toEqual(["a1", "a2", "a3"]);
    expect(bPage.envelopes.map((e) => e.entityId)).toEqual(["b1", "b2", "b3"]);
    // Each user's sequences are strictly increasing and independent of the other's.
    expect(aPage.envelopes.map((e) => Number(e.sequence))).toEqual([1, 2, 3]);
    expect(bPage.envelopes.map((e) => Number(e.sequence))).toEqual([1, 2, 3]);
  });
});

// ---- key envelopes ---------------------------------------------------------

describe("key envelopes store + fetch", () => {
  it("round-trips a wrapped key envelope for a target device", async () => {
    const acct = await register();
    const target = `dev_${crypto.randomUUID()}`;
    const version = await allocateVersion(acct, "vault-v1");
    const store = await call(`/keys/${target}`, {
      method: "POST",
      headers: bearer(acct.apiSecret),
      body: JSON.stringify({
        id: crypto.randomUUID(),
        sourceDeviceId: acct.deviceId,
        keyType: "vault-v1",
        wrappedKey: "wrapped-blob",
        sourcePublicKeyB64: "pub",
        wrappedKeyVersion: version,
      }),
    });
    expect(store.status).toBe(201);

    const fetched = await call(`/keys/${target}`, { headers: bearer(acct.apiSecret) });
    const rows = await fetched.json<Array<Record<string, unknown>>>();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ keyType: "vault-v1", wrappedKey: "wrapped-blob", sourcePublicKeyB64: "pub" });
  });
});

// ---- device public-key directory (Plan 239, rotation phase A) --------------

describe("device public-key directory (Plan 239)", () => {
  it("POST /devices accepts an optional publicKeyB64 and GET /devices returns it", async () => {
    const acct = await register();
    const target = `dev_${crypto.randomUUID()}`;
    const add = await call("/devices", {
      method: "POST",
      headers: bearer(acct.apiSecret),
      body: JSON.stringify({ id: target, name: "iPhone", platform: "ios", publicKeyB64: "pubkey-b64" }),
    });
    expect(add.status).toBe(201);

    const list = await call("/devices", { headers: bearer(acct.apiSecret) });
    const devices = await list.json<Array<{ id: string; publicKeyB64: string | null }>>();
    const found = devices.find((d) => d.id === target);
    expect(found?.publicKeyB64).toBe("pubkey-b64");
  });

  it("GET /devices returns publicKeyB64: null for a device with no key on file", async () => {
    const acct = await register(); // first device registered via POST /users, no key
    const list = await call("/devices", { headers: bearer(acct.apiSecret) });
    const devices = await list.json<Array<{ id: string; publicKeyB64: string | null }>>();
    expect(devices[0].publicKeyB64).toBeNull();
  });

  it("self-provisions a public key on an owned, key-less device", async () => {
    const acct = await register();
    const res = await call(`/devices/${acct.deviceId}/public-key`, {
      method: "POST",
      headers: bearer(acct.apiSecret),
      body: JSON.stringify({ publicKeyB64: "my-pub-key" }),
    });
    expect(res.status).toBe(201);

    const list = await call("/devices", { headers: bearer(acct.apiSecret) });
    const devices = await list.json<Array<{ id: string; publicKeyB64: string | null }>>();
    expect(devices[0].publicKeyB64).toBe("my-pub-key");
  });

  it("refuses to overwrite an already-provisioned public key with 409", async () => {
    const acct = await register();
    const first = await call(`/devices/${acct.deviceId}/public-key`, {
      method: "POST",
      headers: bearer(acct.apiSecret),
      body: JSON.stringify({ publicKeyB64: "first-key" }),
    });
    expect(first.status).toBe(201);

    const second = await call(`/devices/${acct.deviceId}/public-key`, {
      method: "POST",
      headers: bearer(acct.apiSecret),
      body: JSON.stringify({ publicKeyB64: "second-key" }),
    });
    expect(second.status).toBe(409);

    const list = await call("/devices", { headers: bearer(acct.apiSecret) });
    const devices = await list.json<Array<{ id: string; publicKeyB64: string | null }>>();
    expect(devices[0].publicKeyB64).toBe("first-key"); // second write never took effect
  });

  it("returns 409 for a public-key self-provision on a device not owned by the caller", async () => {
    const acct = await register();
    const res = await call(`/devices/dev_not_mine/public-key`, {
      method: "POST",
      headers: bearer(acct.apiSecret),
      body: JSON.stringify({ publicKeyB64: "x" }),
    });
    expect(res.status).toBe(409);
  });

  it("rejects a public-key provision request missing the field with 400", async () => {
    const acct = await register();
    const res = await call(`/devices/${acct.deviceId}/public-key`, {
      method: "POST",
      headers: bearer(acct.apiSecret),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  // ---- POST /keys/version — relay-allocated "next version" (spike gap 2 /
  // §4, §5; revise round 1 fixed the original per-deposit allocation bug) ---

  describe("POST /keys/version (allocation, revise round 1)", () => {
    it("allocates starting at 1", async () => {
      const acct = await register();
      const res = await call("/keys/version", {
        method: "POST",
        headers: bearer(acct.apiSecret),
        body: JSON.stringify({ keyType: "vault-v1" }),
      });
      expect(res.status).toBe(201);
      expect((await res.json<{ version: number }>()).version).toBe(1);
    });

    it("increments monotonically across sequential calls for the same user+keyType", async () => {
      const acct = await register();
      const versions: number[] = [];
      for (let i = 0; i < 4; i++) versions.push(await allocateVersion(acct, "vault-v1"));
      expect(versions).toEqual([1, 2, 3, 4]);
    });

    it("scopes allocation per (user, keyType) — a different keyType restarts at 1, a different user is independent", async () => {
      const a = await register();
      const b = await register();
      expect(await allocateVersion(a, "vault-v1")).toBe(1);
      expect(await allocateVersion(a, "vault-v1")).toBe(2);
      expect(await allocateVersion(a, "account-v1")).toBe(1); // independent counter per keyType
      expect(await allocateVersion(b, "vault-v1")).toBe(1); // independent counter per user
    });

    it("rejects a missing keyType with 400", async () => {
      const acct = await register();
      const res = await call("/keys/version", {
        method: "POST",
        headers: bearer(acct.apiSecret),
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    // This is plan 239's flagged STOP-worthy unknown, relocated here in revise
    // round 1: does the per-(user,keyType)-scoped counter UPSERT actually hold
    // under CONCURRENT allocation? handleAllocateKeyVersion computes the
    // increment inside a single INSERT ... ON CONFLICT DO UPDATE statement,
    // relying on SQLite's single-writer guarantee to serialize concurrent
    // calls rather than trusting an application-level read-then-write.
    it("assigns DISTINCT, gapless versions under concurrent allocation for the same user+keyType", async () => {
      const acct = await register();
      const calls = Array.from({ length: 10 }, () => allocateVersion(acct, "vault-v1"));
      const versions = await Promise.all(calls);

      // No two concurrent allocations collided on the same version number...
      expect(new Set(versions).size).toBe(10);
      // ...and the allocator did not skip or reuse any integer in the range.
      expect([...versions].sort((x, y) => x - y)).toEqual(
        Array.from({ length: 10 }, (_, i) => i + 1),
      );
    });

    it("concurrent allocation stays correctly scoped per user (two accounts racing don't cross-contaminate)", async () => {
      const a = await register();
      const b = await register();
      const [aVersions, bVersions] = await Promise.all([
        Promise.all(Array.from({ length: 5 }, () => allocateVersion(a, "vault-v1"))),
        Promise.all(Array.from({ length: 5 }, () => allocateVersion(b, "vault-v1"))),
      ]);
      expect([...aVersions].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5]);
      expect([...bVersions].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5]);
    });
  });

  // ---- handleStoreKey: version is CALLER-SUPPLIED + validated, not self-
  // allocated (revise round 1 fix for the "N devices, N versions" defect) ---

  describe("POST /keys/:target — wrappedKeyVersion validation (revise round 1)", () => {
    it("rejects a deposit with no wrappedKeyVersion at all with 400", async () => {
      const acct = await register();
      const res = await call(`/keys/dev_${crypto.randomUUID()}`, {
        method: "POST",
        headers: bearer(acct.apiSecret),
        body: JSON.stringify({ id: crypto.randomUUID(), sourceDeviceId: acct.deviceId, keyType: "vault-v1", wrappedKey: "w" }),
      });
      expect(res.status).toBe(400);
    });

    // Note: NaN is deliberately excluded — JSON.stringify(NaN) serializes to
    // `null`, which is a different (but still correctly rejected) code path
    // than the Number.isInteger() shape check this test targets.
    it.each([0, -1, 1.5])("rejects an invalid wrappedKeyVersion (%s) with 400", async (bad) => {
      const acct = await register();
      await allocateVersion(acct, "vault-v1"); // an allocation exists — still rejected on shape
      const res = await storeKey(acct, `dev_${crypto.randomUUID()}`, "vault-v1", { wrappedKeyVersion: bad });
      expect(res.status).toBe(400);
    });

    it("rejects a wrappedKeyVersion that exceeds the allocated maximum (hostile/buggy client) with 400", async () => {
      const acct = await register();
      await allocateVersion(acct, "vault-v1"); // allocates 1 — nothing higher exists yet
      const res = await storeKey(acct, `dev_${crypto.randomUUID()}`, "vault-v1", { wrappedKeyVersion: 9999 });
      expect(res.status).toBe(400);
    });

    it("rejects a wrappedKeyVersion when NO version has ever been allocated for this keyType", async () => {
      const acct = await register();
      const res = await storeKey(acct, `dev_${crypto.randomUUID()}`, "vault-v1", { wrappedKeyVersion: 1 });
      expect(res.status).toBe(400); // allocatedMax is 0 — even version 1 needs a prior allocation
    });

    it("accepts a validly pre-allocated version and stores it verbatim", async () => {
      const acct = await register();
      const version = await allocateVersion(acct, "vault-v1");
      const res = await storeKey(acct, `dev_${crypto.randomUUID()}`, "vault-v1", { wrappedKeyVersion: version });
      expect(res.status).toBe(201);
      expect((await res.json<{ wrappedKeyVersion: number }>()).wrappedKeyVersion).toBe(version);
    });

    it("GET /keys/:target returns wrappedKeyVersion on fetch", async () => {
      const acct = await register();
      const target = `dev_${crypto.randomUUID()}`;
      const version = await allocateVersion(acct, "vault-v1");
      await storeKey(acct, target, "vault-v1", { wrappedKeyVersion: version });
      const fetched = await call(`/keys/${target}`, { headers: bearer(acct.apiSecret) });
      const rows = await fetched.json<Array<{ wrappedKeyVersion: number }>>();
      expect(rows[0].wrappedKeyVersion).toBe(version);
    });

    it("re-storing to the SAME target device (UPSERT) accepts a newer pre-allocated version", async () => {
      const acct = await register();
      const target = `dev_${crypto.randomUUID()}`;
      const v1 = await allocateVersion(acct, "vault-v1");
      const first = await storeKey(acct, target, "vault-v1", { wrappedKeyVersion: v1 });
      const v2 = await allocateVersion(acct, "vault-v1");
      const second = await storeKey(acct, target, "vault-v1", { wrappedKeyVersion: v2 }); // same (user, target, keyType) -> UPSERT path
      expect((await first.json<{ wrappedKeyVersion: number }>()).wrappedKeyVersion).toBe(v1);
      expect((await second.json<{ wrappedKeyVersion: number }>()).wrappedKeyVersion).toBe(v2);
    });

    // THE regression this whole revise round exists to fix: one rotation
    // deposits the SAME actual vault key to every remaining device. Per
    // docs/vault-key-rotation-plan.md §2 ("per vault key", not per envelope),
    // all of those deposits MUST carry the SAME wrappedKeyVersion — round 1's
    // per-deposit self-allocation instead minted a DIFFERENT number for each
    // target device, which would have made Phase B's devices unable to
    // decrypt each other's post-rotation pushes (see the commit/PR notes).
    it("one allocation + deposits to 3 target devices: all three key_envelopes rows carry the SAME version", async () => {
      const acct = await register();
      const version = await allocateVersion(acct, "vault-v1"); // ONE allocation for this rotation
      const targets = [`dev_${crypto.randomUUID()}`, `dev_${crypto.randomUUID()}`, `dev_${crypto.randomUUID()}`];

      const results = await Promise.all(
        targets.map((t) => storeKey(acct, t, "vault-v1", { wrappedKeyVersion: version })),
      );
      for (const res of results) expect(res.status).toBe(201);

      for (const t of targets) {
        const fetched = await call(`/keys/${t}`, { headers: bearer(acct.apiSecret) });
        const rows = await fetched.json<Array<{ wrappedKeyVersion: number }>>();
        expect(rows[0].wrappedKeyVersion).toBe(version);
      }
    });
  });
});

// ---- pairing: ECDH join + token TTL / single-use / device-scope ------------

describe("pairing /join + token-scoped key fetch", () => {
  async function join(deviceId: string, code = randomCode()) {
    const res = await call("/pairing/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, encryptedBundle: "pubkey-bundle", deviceId }),
    });
    return res;
  }

  async function storeKeyFor(acct: Account, target: string, keyType: string) {
    await storeKey(acct, target, keyType); // module-level helper: allocates a version, then deposits
  }

  it("mints a pairing token; polling before envelopes land returns [] without consuming it", async () => {
    const deviceB = `dev_${crypto.randomUUID()}`;
    const joined = await join(deviceB);
    expect(joined.status).toBe(201);
    const { pairingToken } = await joined.json<{ pairingToken: string }>();
    expect(pairingToken).toMatch(/^[0-9a-f]{64}$/);

    // No envelopes yet → empty, token stays usable (B can poll while A approves).
    const early = await call(`/keys/${deviceB}`, { headers: { "X-Pairing-Token": pairingToken } });
    expect(early.status).toBe(200);
    expect(await early.json()).toEqual([]);
  });

  it("consumes the token once both envelopes exist; a second fetch is 410", async () => {
    const acct = await register();
    const deviceB = `dev_${crypto.randomUUID()}`;
    const { pairingToken } = await (await join(deviceB)).json<{ pairingToken: string }>();

    await storeKeyFor(acct, deviceB, "vault-v1");
    await storeKeyFor(acct, deviceB, "account-v1");

    const first = await call(`/keys/${deviceB}`, { headers: { "X-Pairing-Token": pairingToken } });
    expect(first.status).toBe(200);
    expect(await first.json<unknown[]>()).toHaveLength(2);

    const second = await call(`/keys/${deviceB}`, { headers: { "X-Pairing-Token": pairingToken } });
    expect(second.status).toBe(410);
  });

  it("rejects a token presented for a different device id (device-scoped) with 401", async () => {
    const deviceB = `dev_${crypto.randomUUID()}`;
    const { pairingToken } = await (await join(deviceB)).json<{ pairingToken: string }>();
    const otherDevice = `dev_${crypto.randomUUID()}`;
    const res = await call(`/keys/${otherDevice}`, { headers: { "X-Pairing-Token": pairingToken } });
    expect(res.status).toBe(401);
  });

  it("rejects an expired pairing token with 410", async () => {
    const deviceB = `dev_${crypto.randomUUID()}`;
    const { pairingToken } = await (await join(deviceB)).json<{ pairingToken: string }>();
    // Force the TTL into the past.
    await env.DB.prepare(
      "UPDATE pairing_sessions SET pairing_token_expires_at = ? WHERE target_device_id = ?",
    ).bind("2000-01-01T00:00:00.000Z", deviceB).run();
    const res = await call(`/keys/${deviceB}`, { headers: { "X-Pairing-Token": pairingToken } });
    expect(res.status).toBe(410);
  });

  it("rejects an unknown pairing token with 401", async () => {
    const deviceB = `dev_${crypto.randomUUID()}`;
    await join(deviceB);
    const res = await call(`/keys/${deviceB}`, { headers: { "X-Pairing-Token": "deadbeef".repeat(8) } });
    expect(res.status).toBe(401);
  });
});

// ---- pairing: legacy create + claim single-use -----------------------------

describe("pairing create + claim (legacy)", () => {
  it("claims a deposited bundle once, then a second claim returns 410", async () => {
    const acct = await register();
    const code = randomCode();
    const create = await call("/pairing", {
      method: "POST",
      headers: bearer(acct.apiSecret),
      body: JSON.stringify({ code, encryptedBundle: "secret-bundle" }),
    });
    expect(create.status).toBe(201);

    const first = await call(`/pairing/${code}`);
    expect(first.status).toBe(200);
    expect(await first.json<{ encryptedBundle: string }>()).toEqual({ encryptedBundle: "secret-bundle" });

    const second = await call(`/pairing/${code}`);
    expect(second.status).toBe(410);
  });

  it("returns 404 for an unknown pairing code", async () => {
    const res = await call("/pairing/QQ00-WW11");
    expect(res.status).toBe(404);
  });
});

// ---- rate limiting on unauthenticated endpoints (Plan 133 item B) -----------

describe("rate limiting (Plan 133 item B)", () => {
  function ipHeaders(ip: string): Record<string, string> {
    return { "Content-Type": "application/json", "CF-Connecting-IP": ip };
  }

  async function registerFrom(ip: string): Promise<number> {
    userSeq += 1;
    const userId = `rl_${userSeq}_${crypto.randomUUID()}`;
    const res = await call("/users", {
      method: "POST",
      headers: ipHeaders(ip),
      body: JSON.stringify({
        userId,
        apiSecretHash: await sha256Hex(`s-${userId}`),
        device: { id: `dev_${crypto.randomUUID()}`, name: "Mac", platform: "macos" },
      }),
    });
    return res.status;
  }

  it("throttles POST /users to 10 per IP per window; the 11th is 429", async () => {
    const ip = "203.0.113.7";
    for (let i = 0; i < 10; i++) {
      expect(await registerFrom(ip)).toBe(201);
    }
    expect(await registerFrom(ip)).toBe(429);
  });

  it("buckets per IP — a second IP is unaffected by the first's exhaustion", async () => {
    const ip1 = "203.0.113.10";
    for (let i = 0; i < 11; i++) await registerFrom(ip1);
    expect(await registerFrom(ip1)).toBe(429);
    // A different client is on its own counter.
    expect(await registerFrom("203.0.113.11")).toBe(201);
  });

  it("does not throttle when there is no client IP (local dev / non-CF edge)", async () => {
    // The existing suite hits /users with no CF-Connecting-IP; those must never
    // be blocked. Well past the /users limit still succeeds.
    for (let i = 0; i < 15; i++) {
      userSeq += 1;
      const userId = `noip_${userSeq}_${crypto.randomUUID()}`;
      const res = await call("/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          apiSecretHash: await sha256Hex(`s-${userId}`),
          device: { id: `dev_${crypto.randomUUID()}`, name: "Mac", platform: "macos" },
        }),
      });
      expect(res.status).toBe(201);
    }
  });

  it("throttles pairing endpoints to 30 per IP per window; the 31st is 429", async () => {
    const ip = "203.0.113.20";
    for (let i = 0; i < 30; i++) {
      // Unknown codes 404, but the rate check runs first and still counts.
      const res = await call("/pairing/QQ00-WW11", { headers: { "CF-Connecting-IP": ip } });
      expect(res.status).toBe(404);
    }
    const blocked = await call("/pairing/QQ00-WW11", { headers: { "CF-Connecting-IP": ip } });
    expect(blocked.status).toBe(429);
  });

  it("shares the pairing budget across /pairing/join and GET /pairing/:code", async () => {
    const ip = "203.0.113.21";
    // Spend 30 on /pairing/join…
    for (let i = 0; i < 30; i++) {
      const res = await call("/pairing/join", {
        method: "POST",
        headers: ipHeaders(ip),
        body: JSON.stringify({ code: randomCode(), encryptedBundle: "b", deviceId: `dev_${i}` }),
      });
      expect(res.status).toBe(201);
    }
    // …the next claim on the SAME IP is already over budget.
    const blocked = await call("/pairing/QQ00-WW11", { headers: { "CF-Connecting-IP": ip } });
    expect(blocked.status).toBe(429);
  });
});
