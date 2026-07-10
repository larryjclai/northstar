import { applyD1Migrations, env } from "cloudflare:test";

// Build the D1 schema before any test runs. The migration list is injected as a
// binding by vitest.config.ts (readD1Migrations over worker/migrations/*.sql).
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
