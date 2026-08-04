import { expect, test, type Page } from "@playwright/test";

// Dev-server readiness gate(2026-08-04 flake 修正)。
//
// 預設 5-worker 並行時,每個 worker 的第一個導航會同時打進 Vite 的
// on-demand transform 管線。冷啟動風暴下有兩種間歇性失敗,都只在並行時
// 出現、--workers=1 穩定通過:
//
//  1. 首次 transform 變慢,導航吃掉整個 30s test timeout(timeout 型);
//  2. 依賴延遲探索觸發 dep optimizer 重跑並廣播 full-page reload,
//     打斷其他 worker 正在進行的 goto()(「導航被中斷」型)。
//
// 這個 spec 由 playwright.config.ts 的 warmup project 執行,透過
// `dependencies` 保證先於 chromium / mobile 兩個真正的測試 project。
// 它用單一 page 走過整個套件會碰到的路由,讓所有 transform、依賴探索
// (以及可能的 reload 廣播)都發生在並行 worker 出現之前。第二輪走訪
// 證明 optimizer 已到達定點:第一輪觸發過 re-optimization 的路由,
// 第二輪載入時不會再觸發。
//
// 每條路由等待該頁的關鍵元素(web-first),與 smoke.spec.ts 的斷言
// 對齊;這裡逾時放寬到 30s 是因為冷 transform 本來就慢——吸收慢就是
// 這個 gate 的工作,不要「tidy」回預設值。

const ROUTES: Array<{ path: string; ready: (page: Page) => Promise<void> }> = [
  {
    path: "/",
    ready: (page) =>
      expect(page.getByRole("link", { name: "建立帳戶" })).toBeVisible({ timeout: 30_000 }),
  },
  {
    path: "/cash-flow",
    ready: (page) =>
      expect(page.getByRole("button", { name: "上一個月" })).toBeVisible({ timeout: 30_000 }),
  },
  {
    path: "/accounts",
    ready: (page) =>
      expect(page.getByRole("heading", { name: "帳戶" })).toBeVisible({ timeout: 30_000 }),
  },
  {
    path: "/investments",
    ready: (page) =>
      expect(page.getByRole("heading", { name: "投資", exact: true })).toBeVisible({
        timeout: 30_000,
      }),
  },
  {
    path: "/settings",
    ready: (page) =>
      expect(page.getByText("一般與備份", { exact: true })).toBeVisible({ timeout: 30_000 }),
  },
];

test("warm the dev server across all tested routes", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("northstar.onboarding.dismissed.v1", "1");
  });
  for (const pass of [1, 2] as const) {
    for (const route of ROUTES) {
      try {
        await page.goto(route.path);
        await route.ready(page);
      } catch (error) {
        // dep-optimizer reload 正好落在 goto 進行中,正是這個 gate 要吸收
        // 的事件——該路由重試一次;第二輪仍失敗才視為真的壞掉。
        if (pass === 2) throw error;
        await page.goto(route.path);
        await route.ready(page);
      }
    }
  }
});
