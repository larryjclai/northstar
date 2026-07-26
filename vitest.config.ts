import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Must mirror vite.config.ts's compiler setup — otherwise tests validate
  // uncompiled components while the app ships compiled ones (plan 266).
  plugins: [react(), babel({ presets: [reactCompilerPreset({ compilationMode: "annotation" })] })],
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
