CREATE TABLE sync_envelopes_v2 (
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

INSERT INTO sync_envelopes_v2 (
  id, user_id, device_id, entity, entity_id, revision,
  encrypted_payload, updated_at, relay_sequence
)
SELECT
  id, user_id, device_id, entity, entity_id, revision,
  encrypted_payload, updated_at, rowid
FROM sync_envelopes;

DROP TABLE sync_envelopes;
ALTER TABLE sync_envelopes_v2 RENAME TO sync_envelopes;

CREATE UNIQUE INDEX IF NOT EXISTS idx_envelopes_sequence ON sync_envelopes(relay_sequence);
CREATE INDEX IF NOT EXISTS idx_envelopes_cursor ON sync_envelopes(user_id, relay_sequence);
CREATE INDEX IF NOT EXISTS idx_envelopes_entity ON sync_envelopes(user_id, entity, entity_id);
