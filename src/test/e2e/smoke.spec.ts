import { expect, test } from "@playwright/test";

test("first-run finance flows stay empty until the user creates real data", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await page.addInitScript(() => window.localStorage.removeItem("northstar.browserRepository.v1"));
  await page.route("**/api/yahoo/v1/finance/search**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        quotes: [
          {
            symbol: "QQQ",
            shortname: "Invesco QQQ Trust",
            currency: "USD",
            exchange: "NMS",
            quoteType: "ETF",
            typeDisp: "ETF",
          },
        ],
      }),
    });
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "總覽" })).toBeVisible();
  await expect(page.getByText("先建立你的第一個帳戶")).toBeVisible();
  await expect(page.getByText("0050.TW")).toHaveCount(0);
  await expect(page.getByText("SPY")).toHaveCount(0);

  await page.getByRole("link", { name: /帳戶/ }).first().click();
  await page.getByLabel("名稱").fill("測試帳戶");
  await page.getByLabel("幣別").fill("TWD");
  await page.getByLabel("期初餘額").fill("5000");
  await page.getByRole("button", { name: "新增" }).click();
  await expect(page.getByText("測試帳戶")).toBeVisible();

  await page.getByRole("link", { name: /設定/ }).first().click();
  await page.getByPlaceholder("新增常用商家").fill("藍瓶咖啡");
  await page.locator("section").filter({ has: page.getByPlaceholder("新增常用商家") }).getByRole("button", { name: "新增" }).click();
  await expect(page.getByText("藍瓶咖啡").first()).toBeVisible();
  await page.getByRole("button", { name: "儲存設定" }).click();
  await expect(page.getByText("設定已儲存。")).toBeVisible();

  await page.getByRole("link", { name: /收支/ }).first().click();
  const cashForm = page.locator("section").filter({ hasText: "新增收支" });
  await cashForm.getByLabel("帳戶").selectOption({ label: "測試帳戶" });
  await cashForm.getByLabel("類型").selectOption("expense");
  await cashForm.getByLabel("金額 / 算式").fill("120+80");
  await cashForm.locator("select").nth(2).selectOption("餐飲");
  await cashForm.locator("select").nth(3).selectOption("點心");
  await cashForm.getByLabel("商家").fill("藍瓶咖啡");
  await cashForm.getByRole("button", { name: "新增" }).click();
  const ledgerList = page.locator("section").filter({ hasText: "本機收支" });
  await expect(ledgerList.getByText("餐飲 / 點心")).toBeVisible();
  await expect(ledgerList.getByText("支出 200 TWD")).toBeVisible();
  await expect(ledgerList.getByText("藍瓶咖啡")).toBeVisible();

  await page.getByRole("link", { name: /交易/ }).first().click();
  await page.getByLabel("Ticker").fill("QQ");
  await page.getByRole("button", { name: /QQQ/ }).click();
  await page.getByLabel("價格").fill("450");
  await page.getByLabel("數量").fill("2");
  await page.getByRole("button", { name: "新增" }).click();
  await expect(page.locator("section").filter({ hasText: "交易紀錄" }).getByText("QQQ")).toBeVisible();

  await page.getByRole("button", { name: "直接建立持倉" }).click();
  const holdingForm = page.locator("section").filter({ hasText: "直接建立持倉" });
  await holdingForm.getByLabel("Ticker").fill("0050.TW");
  await holdingForm.getByLabel("名稱").fill("元大台灣50");
  await holdingForm.getByLabel("股數").fill("3000");
  await holdingForm.getByLabel("平均成本").fill("50");
  await holdingForm.getByRole("button", { name: "新增持倉" }).click();

  await page.getByRole("link", { name: /持倉/ }).first().click();
  await expect(page.getByText("QQQ", { exact: true })).toBeVisible();
  await expect(page.getByText("0050.TW", { exact: true })).toBeVisible();
  await expect(page.getByText("手動持倉")).toBeVisible();

  expect(consoleErrors.filter((item) => !item.includes("Download the React DevTools"))).toEqual([]);
});
