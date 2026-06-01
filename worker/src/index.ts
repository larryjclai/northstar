// Northstar Sync Worker — encrypted envelope relay.
// The server stores only opaque ciphertext; all plaintext stays on devices.

export interface Env {
  DB: D1Database;
}

// ---------- helpers ----------

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function err(message: string, status: number): Response {
  return json({ error: message }, status);
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------- auth ----------

async function authenticate(
  request: Request,
  env: Env,
): Promise<{ userId: string } | Response> {
  const auth = request.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return err("Missing Authorization header", 401);

  const hash = await sha256Hex(token);
  const user = await env.DB.prepare("SELECT id FROM users WHERE api_secret_hash = ?")
    .bind(hash)
    .first<{ id: string }>();
  if (!user) return err("Invalid token", 401);
  return { userId: user.id };
}

// ---------- router ----------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS preflight
    if (method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Authorization, Content-Type",
        },
      });
    }

    try {
      // POST /users — register a new sync account + first device
      if (method === "POST" && path === "/users") {
        return handleRegister(request, env);
      }

      // GET /pairing/:code — Device B claims the bundle (unauthenticated; code is the credential)
      const pairingClaim = path.match(/^\/pairing\/([A-Z0-9]{4}-[A-Z0-9]{4})$/);
      if (method === "GET" && pairingClaim) {
        return withCors(await handleClaimPairing(env, pairingClaim[1]));
      }

      // All routes below require auth
      const auth = await authenticate(request, env);
      if (auth instanceof Response) return withCors(auth);
      const { userId } = auth;

      // POST /devices — register a device
      if (method === "POST" && path === "/devices") {
        return withCors(await handleAddDevice(request, env, userId));
      }
      // GET /devices — list devices
      if (method === "GET" && path === "/devices") {
        return withCors(await handleListDevices(env, userId));
      }
      // DELETE /devices/:id — revoke a device
      const deviceRevoke = path.match(/^\/devices\/([^/]+)$/);
      if (method === "DELETE" && deviceRevoke) {
        return withCors(await handleRevokeDevice(env, userId, deviceRevoke[1]));
      }

      // POST /envelopes — upload encrypted change records
      if (method === "POST" && path === "/envelopes") {
        return withCors(await handlePushEnvelopes(request, env, userId));
      }
      // GET /envelopes?cursor= — fetch changes since cursor
      if (method === "GET" && path === "/envelopes") {
        return withCors(await handlePullEnvelopes(url, env, userId));
      }

      // POST /keys/:target_device_id — store wrapped key envelope
      const keyPost = path.match(/^\/keys\/([^/]+)$/);
      if (method === "POST" && keyPost) {
        return withCors(await handleStoreKey(request, env, userId, keyPost[1]));
      }
      // GET /keys/:target_device_id — fetch wrapped key envelope
      if (method === "GET" && keyPost) {
        return withCors(await handleFetchKey(env, userId, keyPost[1]));
      }

      // POST /pairing — Device A deposits encrypted credentials bundle (auth required)
      if (method === "POST" && path === "/pairing") {
        return withCors(await handleCreatePairing(request, env));
      }

      return withCors(err("Not found", 404));
    } catch (e) {
      console.error(e);
      return withCors(err("Internal server error", 500));
    }
  },
};

function withCors(response: Response): Response {
  const next = new Response(response.body, response);
  next.headers.set("Access-Control-Allow-Origin", "*");
  return next;
}

// ---------- handlers ----------

interface RegisterBody {
  userId: string;
  apiSecretHash: string;
  device: { id: string; name: string; platform: string };
}

async function handleRegister(request: Request, env: Env): Promise<Response> {
  const body = await request.json<RegisterBody>();
  if (!body.userId || !body.apiSecretHash || !body.device?.id) {
    return err("Missing required fields", 400);
  }

  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO users (id, api_secret_hash, created_at) VALUES (?, ?, ?)")
      .bind(body.userId, body.apiSecretHash, now),
    env.DB.prepare(
      "INSERT INTO devices (id, user_id, name, platform, trusted_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(body.device.id, body.userId, body.device.name, body.device.platform, now, now),
  ]);

  return withCors(json({ ok: true }, 201));
}

interface DeviceBody {
  id: string;
  name: string;
  platform: string;
}

async function handleAddDevice(
  request: Request,
  env: Env,
  userId: string,
): Promise<Response> {
  const body = await request.json<DeviceBody>();
  if (!body.id || !body.name || !body.platform) return err("Missing fields", 400);

  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO devices (id, user_id, name, platform, created_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(body.id, userId, body.name, body.platform, now)
    .run();

  return json({ ok: true }, 201);
}

async function handleListDevices(env: Env, userId: string): Promise<Response> {
  const result = await env.DB.prepare(
    "SELECT id, name, platform, trusted_at, created_at FROM devices WHERE user_id = ? ORDER BY created_at",
  )
    .bind(userId)
    .all();
  return json(result.results);
}

async function handleRevokeDevice(
  env: Env,
  userId: string,
  deviceId: string,
): Promise<Response> {
  await env.DB.prepare("DELETE FROM devices WHERE id = ? AND user_id = ?")
    .bind(deviceId, userId)
    .run();
  return json({ ok: true });
}

interface Envelope {
  id: string;
  deviceId: string;
  entity: string;
  entityId: string;
  revision: number;
  encryptedPayload: string;
  updatedAt: string;
  sequence?: number;
}

async function handlePushEnvelopes(
  request: Request,
  env: Env,
  userId: string,
): Promise<Response> {
  const { envelopes } = await request.json<{ envelopes: Envelope[] }>();
  if (!Array.isArray(envelopes) || envelopes.length === 0) {
    return err("envelopes must be a non-empty array", 400);
  }
  if (envelopes.length > 500) return err("Max 500 envelopes per request", 400);

  const stmt = env.DB.prepare(
    `INSERT INTO sync_envelopes
       (id, user_id, device_id, entity, entity_id, revision, encrypted_payload, updated_at, relay_sequence)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(relay_sequence), 0) + 1 FROM sync_envelopes))
     ON CONFLICT(user_id, entity, entity_id, revision, device_id) DO NOTHING`,
  );
  const batch = envelopes.map((e) =>
    stmt.bind(e.id, userId, e.deviceId, e.entity, e.entityId, e.revision, e.encryptedPayload, e.updatedAt),
  );
  await env.DB.batch(batch);

  return json({ ok: true, count: envelopes.length });
}

async function handlePullEnvelopes(
  url: URL,
  env: Env,
  userId: string,
): Promise<Response> {
  const cursor = Number(url.searchParams.get("cursor") ?? "0") || 0;
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "200"), 500);

  const result = await env.DB.prepare(
    `SELECT id, device_id as deviceId, entity, entity_id as entityId,
            revision, encrypted_payload as encryptedPayload, updated_at as updatedAt,
            relay_sequence as sequence
     FROM sync_envelopes
     WHERE user_id = ? AND relay_sequence > ?
     ORDER BY relay_sequence ASC
     LIMIT ?`,
  )
    .bind(userId, cursor, limit)
    .all<Envelope>();

  const envelopes = result.results;
  const nextCursor =
    envelopes.length > 0 ? String(envelopes[envelopes.length - 1].sequence) : String(cursor);

  return json({ envelopes, nextCursor, count: envelopes.length });
}

interface KeyEnvelopeBody {
  id: string;
  sourceDeviceId: string;
  keyType: string;
  wrappedKey: string;
}

async function handleStoreKey(
  request: Request,
  env: Env,
  userId: string,
  targetDeviceId: string,
): Promise<Response> {
  const body = await request.json<KeyEnvelopeBody>();
  if (!body.id || !body.sourceDeviceId || !body.keyType || !body.wrappedKey) {
    return err("Missing fields", 400);
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO key_envelopes
       (id, user_id, target_device_id, source_device_id, key_type, wrapped_key, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, target_device_id, key_type)
     DO UPDATE SET wrapped_key = excluded.wrapped_key,
                   source_device_id = excluded.source_device_id,
                   created_at = excluded.created_at`,
  )
    .bind(body.id, userId, targetDeviceId, body.sourceDeviceId, body.keyType, body.wrappedKey, now)
    .run();

  return json({ ok: true }, 201);
}

async function handleFetchKey(
  env: Env,
  userId: string,
  targetDeviceId: string,
): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT id, source_device_id as sourceDeviceId, key_type as keyType,
            wrapped_key as wrappedKey, created_at as createdAt
     FROM key_envelopes
     WHERE user_id = ? AND target_device_id = ?`,
  )
    .bind(userId, targetDeviceId)
    .all();

  return json(row.results);
}

// ---------- pairing ----------

interface CreatePairingBody {
  code: string;
  encryptedBundle: string;
}

async function handleCreatePairing(request: Request, env: Env): Promise<Response> {
  const body = await request.json<CreatePairingBody>();
  if (!body.code || !body.encryptedBundle) return err("Missing fields", 400);
  if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(body.code)) return err("Invalid code format", 400);

  // 5-minute TTL
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  await env.DB.prepare(
    "INSERT INTO pairing_sessions (code, encrypted_bundle, expires_at) VALUES (?, ?, ?)",
  )
    .bind(body.code, body.encryptedBundle, expiresAt)
    .run();

  return json({ ok: true }, 201);
}

async function handleClaimPairing(env: Env, code: string): Promise<Response> {
  const now = new Date().toISOString();

  const session = await env.DB.prepare(
    "SELECT encrypted_bundle, attempt_count, expires_at, claimed_at FROM pairing_sessions WHERE code = ?",
  )
    .bind(code)
    .first<{ encrypted_bundle: string; attempt_count: number; expires_at: string; claimed_at: string | null }>();

  if (!session) return err("Invalid code", 404);
  if (session.claimed_at) return err("Code already used", 410);
  if (session.expires_at < now) return err("Code expired", 410);
  if (session.attempt_count >= 5) return err("Too many attempts", 429);

  // Increment attempt count and mark claimed in one batch
  await env.DB.batch([
    env.DB.prepare("UPDATE pairing_sessions SET attempt_count = attempt_count + 1, claimed_at = ? WHERE code = ?")
      .bind(now, code),
  ]);

  return json({ encryptedBundle: session.encrypted_bundle });
}
