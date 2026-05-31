// HTTP client for the Northstar sync worker.
// All payloads are already encrypted by the caller; this module only handles transport.

export const WORKER_URL = "https://northstar-sync.larrynote.workers.dev";

export interface EnvelopeRecord {
  id: string;
  deviceId: string;
  entity: string;
  entityId: string;
  revision: number;
  encryptedPayload: string;
  updatedAt: string;
}

export interface DeviceRecord {
  id: string;
  name: string;
  platform: string;
  trusted_at: string | null;
  created_at: string;
}

export interface KeyEnvelopeRecord {
  id: string;
  sourceDeviceId: string;
  keyType: string;
  wrappedKey: string;
  createdAt: string;
}

export interface PullResult {
  envelopes: EnvelopeRecord[];
  nextCursor: string;
  count: number;
}

async function request<T>(
  path: string,
  options: RequestInit & { apiSecret?: string } = {},
): Promise<T> {
  const { apiSecret, ...rest } = options;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(apiSecret ? { Authorization: `Bearer ${apiSecret}` } : {}),
    ...(options.headers as Record<string, string>),
  };
  const res = await fetch(`${WORKER_URL}${path}`, { ...rest, headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sync worker ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

/** Register a new user account + first device. Call once on first sync setup. */
export async function registerUser(opts: {
  userId: string;
  apiSecretHash: string;
  device: { id: string; name: string; platform: string };
}): Promise<void> {
  await request("/users", { method: "POST", body: JSON.stringify(opts) });
}

/** Push a batch of encrypted envelopes. */
export async function pushEnvelopes(
  apiSecret: string,
  envelopes: EnvelopeRecord[],
): Promise<void> {
  await request("/envelopes", {
    method: "POST",
    apiSecret,
    body: JSON.stringify({ envelopes }),
  });
}

/** Pull encrypted envelopes since a cursor. */
export async function pullEnvelopes(
  apiSecret: string,
  cursor: string,
  limit = 200,
): Promise<PullResult> {
  const params = new URLSearchParams({ cursor, limit: String(limit) });
  return request<PullResult>(`/envelopes?${params}`, { apiSecret });
}

/** Register an additional device on an existing account (Device B pairing path). */
export async function addDevice(
  apiSecret: string,
  device: { id: string; name: string; platform: string },
): Promise<void> {
  await request("/devices", { method: "POST", apiSecret, body: JSON.stringify(device) });
}

/** List trusted devices for this account. */
export async function listDevices(apiSecret: string): Promise<DeviceRecord[]> {
  return request<DeviceRecord[]>("/devices", { apiSecret });
}

/** Revoke a device's access. */
export async function revokeDevice(apiSecret: string, deviceId: string): Promise<void> {
  await request(`/devices/${deviceId}`, { method: "DELETE", apiSecret });
}

/** Store a wrapped vault key envelope for a target device. */
export async function storeKeyEnvelope(
  apiSecret: string,
  targetDeviceId: string,
  envelope: Omit<KeyEnvelopeRecord, "createdAt">,
): Promise<void> {
  await request(`/keys/${targetDeviceId}`, {
    method: "POST",
    apiSecret,
    body: JSON.stringify(envelope),
  });
}

/** Fetch key envelopes destined for a specific device. */
export async function fetchKeyEnvelopes(
  apiSecret: string,
  targetDeviceId: string,
): Promise<KeyEnvelopeRecord[]> {
  return request<KeyEnvelopeRecord[]>(`/keys/${targetDeviceId}`, { apiSecret });
}

// ---------- pairing ----------

/**
 * Device A: deposit an encrypted credentials bundle on the Worker.
 * The bundle can only be decrypted by someone who knows the pairing code.
 */
export async function createPairingSession(
  apiSecret: string,
  code: string,
  encryptedBundle: string,
): Promise<void> {
  await request("/pairing", {
    method: "POST",
    apiSecret,
    body: JSON.stringify({ code, encryptedBundle }),
  });
}

/**
 * Device B: claim the encrypted bundle using the pairing code.
 * One-time — the server marks the session as claimed on first successful fetch.
 */
export async function claimPairingSession(
  code: string,
): Promise<{ encryptedBundle: string }> {
  // Unauthenticated — the code itself is the credential
  return request<{ encryptedBundle: string }>(`/pairing/${encodeURIComponent(code)}`);
}
