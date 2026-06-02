import { expect, test } from "@playwright/test";

test("first-run trust and entry surfaces stay usable", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await page.route("**/api/yahoo/v8/finance/chart/**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        chart: {
          result: [{
            meta: { symbol: "USDTWD=X", currency: "TWD", regularMarketPrice: 31.2, previousClose: 31.1 },
            timestamp: [Date.UTC(2026, 4, 30) / 1000],
            indicators: { quote: [{ close: [31.2] }] },
          }],
          error: null,
        },
      }),
    });
  });

  await page.goto("/");
  await expect(page.getByText("先建立第一個帳戶，Northstar 會開始計算總覽。")).toBeVisible();
  await expect(page.getByRole("link", { name: "建立帳戶" })).toBeVisible();

  await page.goto("/cash-flow");
  await expect(page.getByRole("button", { name: "上一個月" })).toBeVisible();
  await expect(page.getByRole("button", { name: "下一個月" })).toBeVisible();
  await expect(page.locator("select").filter({ has: page.locator('option[value="all"]') })).toHaveCount(2);
  await expect(page.getByRole("option", { name: "所有帳戶" })).toHaveCount(1);
  await expect(page.getByRole("option", { name: "所有分類" })).toHaveCount(1);

  await page.keyboard.press("Control+N");
  const quickInput = page.getByPlaceholder("快速記帳 · 試試「拿鐵 120 信用卡」或「買 2330.TW 5股 @1042」");
  await expect(quickInput).toBeVisible();
  await quickInput.fill("拿鐵 180");
  await quickInput.press("Enter");
  await expect(page.getByText("確認 · 支出")).toBeVisible();
  await expect(page.getByRole("button", { name: "• 餐飲" })).toBeVisible();
  await expect(page.getByText("支出 TWD 180")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.keyboard.press("Control+K");
  await expect(page.getByRole("dialog", { name: "Command Palette" })).toBeVisible();
  await expect(page.getByRole("option", { name: "• 餐飲" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/accounts");
  await expect(page.getByRole("heading", { name: "帳戶" })).toBeVisible();
  await page.getByRole("button", { name: "重新計算", exact: true }).click();
  await expect(page.getByText("重新計算完成：修正 0 個帳戶、0 個持倉。")).toBeVisible();

  await page.goto("/investments");
  await expect(page.getByRole("heading", { name: "Holdings" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "目前沒有持倉" })).toBeVisible();

  await page.goto("/settings");
  await page.getByText("General & Export", { exact: true }).click();
  await page.getByRole("button", { name: "重新計算帳戶與投資" }).click();
  await expect(page.getByText("已修正 0 筆衍生資料。孤兒關聯 0 筆，不完整轉帳 0 組。")).toBeVisible();

  expect(consoleErrors.filter((item) => !item.includes("Download the React DevTools"))).toEqual([]);
});
