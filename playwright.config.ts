import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./src/test/e2e",
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry",
  },
  projects: [
    // Readiness gate:先用單一 page 走過所有受測路由,把 Vite 冷啟動的
    // on-demand transform 與依賴探索(可能廣播 full-page reload、打斷其他
    // worker 的 goto)都做完,再讓並行 worker 進場。見 warmup.setup.ts。
    // 逾時 120s 是 gate 自己的預算(10 次路由走訪 × 冷 transform),
    // 與各測試的 timeout 無關。
    {
      name: "warmup",
      testMatch: /warmup\.setup\.ts/,
      timeout: 120_000,
      use: { ...devices["Desktop Chrome"] },
    },
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, dependencies: ["warmup"] },
    { name: "mobile", use: { ...devices["iPhone 15"] }, dependencies: ["warmup"] },
  ],
});
