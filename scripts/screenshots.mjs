#!/usr/bin/env node
/**
 * Capture README screenshots from Demo Mode (示範資料).
 *
 * Boots the Vite dev server, loads the app in headless Chromium (dark theme,
 * zh-TW, 1440×900 @2x), clicks 「載入示範資料」 on the first-run dashboard,
 * then screenshots the key routes into docs/screenshots/.
 *
 * Usage:  node scripts/screenshots.mjs
 * Re-run whenever the UI changes enough that the README shots look stale.
 */
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(root, "docs/screenshots");
const URL_BASE = "http://127.0.0.1:5173";

async function waitForServer(url, timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`dev server did not become ready at ${url}`);
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  console.log("▸ starting vite dev server…");
  const server = spawn("npm", ["run", "dev"], { cwd: root, stdio: "ignore", detached: true });
  const killServer = () => {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {
      /* already gone */
    }
  };
  process.on("exit", killServer);

  try {
    await waitForServer(URL_BASE);
    console.log("▸ server ready, launching chromium…");

    const browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      colorScheme: "dark",
      locale: "zh-TW",
      timezoneId: "Asia/Taipei",
    });
    // Same isolation the e2e smoke test uses: skip the first-run onboarding
    // overlay and stub the external ETF sector feed so nothing 502s offline.
    await context.addInitScript(() => {
      window.localStorage.setItem("northstar.onboarding.dismissed.v1", "1");
    });
    await context.route("**/api/market-data**", (route) =>
      route.fulfill({ contentType: "application/json", body: JSON.stringify({ funds: {} }) }),
    );

    const page = await context.newPage();
    const settle = async (ms = 2500) => {
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(ms); // let Recharts/fonts finish painting
    };
    const shot = async (name) => {
      await page.screenshot({ path: resolve(OUT, `${name}.png`) });
      console.log(`  ✓ ${name}.png`);
    };

    // 1) First run → enter demo mode from the empty dashboard.
    await page.goto(`${URL_BASE}/`);
    await page.getByRole("button", { name: "載入示範資料" }).click({ timeout: 30_000 });
    await settle(4000);
    await shot("dashboard");

    // 2) Investments — holdings.
    await page.goto(`${URL_BASE}/investments`);
    await settle();
    await shot("investments");

    // 3) Investments — analytics tab (報酬、風險指標). Scroll to the benchmark
    // chart: demo data spans only ~2 months, so the annualized-XIRR box up top
    // shows an honest-but-absurd extrapolation that would read as a bug in a
    // marketing shot.
    await page.getByRole("button", { name: "分析", exact: true }).click({ timeout: 10_000 });
    await settle(3500);
    await page.mouse.move(1100, 600); // over the scrollable content pane
    await page.mouse.wheel(0, 760);
    await page.waitForTimeout(900);
    // Clip off the top strip: when scrolled, the sticky sub-tab bar overlaps
    // the demo banner (cosmetic app nit — tracked separately).
    await page.screenshot({
      path: resolve(OUT, "analytics.png"),
      clip: { x: 0, y: 64, width: 1440, height: 836 },
    });
    console.log("  ✓ analytics.png");

    // 4) Cash flow — 收支.
    await page.goto(`${URL_BASE}/cash-flow`);
    await settle();
    await shot("cash-flow");

    await browser.close();
    console.log(`▸ done → ${OUT}`);
  } finally {
    killServer();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
