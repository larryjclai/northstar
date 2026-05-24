import { expect, test } from "@playwright/test";

test("loads dashboard and navigates to holdings", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "財務北極星" })).toBeVisible();
  await expect(page.getByText("Yahoo Finance")).toBeVisible();

  await page.getByRole("link", { name: /持倉/ }).first().click();
  await expect(page.getByRole("heading", { name: "持倉" })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

