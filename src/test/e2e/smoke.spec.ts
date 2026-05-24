import { expect, test } from "@playwright/test";

test("local-first CRUD flows work without runtime errors", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await page.addInitScript(() => window.localStorage.removeItem("northstar.browserRepository.v1"));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "總覽" })).toBeVisible();
  await expect(page.getByText("Yahoo Finance")).toBeVisible();

  await page.getByRole("link", { name: /帳戶/ }).first().click();
  await page.getByLabel("名稱").fill("測試帳戶");
  await page.getByLabel("幣別").fill("TWD");
  await page.getByLabel("期初餘額").fill("5000");
  await page.getByRole("button", { name: "新增" }).click();
  await expect(page.getByText("測試帳戶")).toBeVisible();

  await page.getByRole("link", { name: /收支/ }).first().click();
  await page.getByLabel("帳戶").selectOption({ label: "測試帳戶" });
  await page.getByLabel("金額 / 算式").fill("-120-80");
  await page.getByLabel("分類").fill("餐飲");
  await page.getByRole("button", { name: "新增" }).click();
  await expect(page.getByText("餐飲")).toBeVisible();
  await expect(page.getByText("-200 TWD")).toBeVisible();

  await page.getByRole("link", { name: /交易/ }).first().click();
  await page.getByLabel("Ticker").fill("QQQ");
  await page.getByLabel("名稱").fill("Invesco QQQ");
  await page.getByLabel("價格").fill("450");
  await page.getByLabel("數量").fill("2");
  await page.getByRole("button", { name: "新增" }).click();
  await expect(page.getByText("QQQ")).toBeVisible();

  await page.getByRole("link", { name: /持倉/ }).first().click();
  await expect(page.getByText("QQQ", { exact: true })).toBeVisible();

  expect(consoleErrors).toEqual([]);
});
