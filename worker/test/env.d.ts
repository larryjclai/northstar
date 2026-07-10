import type { D1Migration } from "@cloudflare/vitest-pool-workers";

// Augment the test-provided env with the bindings vitest.config.ts declares.
declare module "cloudflare:test" {
  interface ProvidedEnv {
    DB: D1Database;
    TEST_MIGRATIONS: D1Migration[];
  }
}
