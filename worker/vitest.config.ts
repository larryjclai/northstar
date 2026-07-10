import path from "node:path";
import { defineConfig } from "vitest/config";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";

// Runs the endpoint suite inside workerd (via miniflare) with a real D1 binding.
// The D1 schema is built by reading worker/migrations/*.sql and applying them in
// a setup file; isolated storage gives every test a clean, post-migration DB.
//
// vitest-pool-workers v4 exposes its integration as a Vite plugin (cloudflareTest)
// instead of the old `poolOptions.workers` block / `defineWorkersConfig` helper.
export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(__dirname, "migrations"));

  return {
    plugins: [
      cloudflareTest({
        singleWorker: true,
        isolatedStorage: true,
        miniflare: {
          compatibilityDate: "2025-05-31",
          d1Databases: ["DB"],
          // Surfaced to the setup file, which applies the migrations once per
          // isolated-storage seed so schema persists but per-test writes roll back.
          bindings: { TEST_MIGRATIONS: migrations },
        },
      }),
    ],
    test: {
      setupFiles: ["./test/apply-migrations.ts"],
    },
  };
});
