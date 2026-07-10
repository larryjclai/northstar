-- Best-effort rate limiting for unauthenticated endpoints (Plan 133 item B).
--
-- Fixed 1-minute windows keyed by "<scope>:<ip>:<windowMinute>". The count is
-- incremented per request; when it exceeds the scope's limit the request is
-- rejected with 429. This is a D1-backed fallback to the Cloudflare rate-limit
-- binding: simpler and adequate at this scale, and — unlike the binding — it is
-- exercisable in the workers test harness.
--
-- expires_at (epoch ms) lets old windows be pruned. Rows are opportunistically
-- deleted when a fresh window opens; an operator/cron may also sweep the table.
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_expiry ON rate_limits(expires_at);
