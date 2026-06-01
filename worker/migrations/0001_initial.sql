-- Users: a sync account identified by user_id + hashed api secret.
-- The client generates both; the server never sees the plaintext secret.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  api_secret_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Devices: trusted devices belonging to a user.
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  platform TEXT NOT NULL,
  trusted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Sync envelopes: encrypted change records pushed from any device.
-- The server only stores opaque ciphertext; it cannot read the payload.
CREATE TABLE IF NOT EXISTS sync_envelopes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  encrypted_payload TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  relay_sequence INTEGER NOT NULL,
  UNIQUE(user_id, entity, entity_id, revision, device_id)
);

-- Key envelopes: device-pairing key material.
-- Existing device wraps the vault key for a new device; server relays the blob.
CREATE TABLE IF NOT EXISTS key_envelopes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_device_id TEXT NOT NULL,
  source_device_id TEXT NOT NULL,
  key_type TEXT NOT NULL,
  wrapped_key TEXT NOT NULL,
  wrapped_key_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, target_device_id, key_type)
);

CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_envelopes_sequence ON sync_envelopes(relay_sequence);
CREATE INDEX IF NOT EXISTS idx_envelopes_cursor ON sync_envelopes(user_id, relay_sequence);
CREATE INDEX IF NOT EXISTS idx_envelopes_entity ON sync_envelopes(user_id, entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_key_envelopes_target ON key_envelopes(user_id, target_device_id);
