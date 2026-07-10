-- Per-user relay sequence (Plan 133 item A).
--
-- The original schema put a GLOBAL unique index on relay_sequence
-- (idx_envelopes_sequence). Because handlePushEnvelopes assigns sequences from a
-- single (SELECT MAX(relay_sequence)) read, two concurrent pushes from DIFFERENT
-- accounts read the same max and collide on that global unique index -> the
-- whole batch fails with a 500 for one tenant. That couples otherwise isolated
-- accounts.
--
-- Fix: make uniqueness per-user. Sequences only ever need to be distinct and
-- strictly increasing WITHIN a user (pull filters by user_id and paginates on
-- relay_sequence), so (user_id, relay_sequence) is the correct uniqueness key.
-- The paired code change scopes the MAX read with `WHERE user_id = ?`.
--
-- Existing rows keep their old globally-assigned values. Those values are still
-- strictly increasing within each user, so per-account pull cursors survive
-- unchanged.
--
-- The new unique index on (user_id, relay_sequence) fully supersedes the
-- existing non-unique idx_envelopes_cursor on the same columns, so drop that
-- redundant index too.
DROP INDEX IF EXISTS idx_envelopes_sequence;
DROP INDEX IF EXISTS idx_envelopes_cursor;
CREATE UNIQUE INDEX IF NOT EXISTS idx_envelopes_user_sequence
  ON sync_envelopes(user_id, relay_sequence);
