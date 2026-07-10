import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
    // worker/ is a standalone package with its own vitest-pool-workers config
    // (its tests import the workerd-only "cloudflare:test" module); run them via
    // `cd worker && npm test`, never through the app's jsdom runner.
    exclude: ["**/node_modules/**", "**/dist/**", "**/src/test/e2e/**", "**/.claude/**", "**/worker/**"],
  },
});
