import { expect, test, type Page } from "@playwright/test";

// Regression (custom-asset detail navigation): custom (manually-priced,
// no-ticker) assets are created with ticker "", and the only detail route used
// to be /holdings/$ticker — navigating with an empty param resolves to
// "/holdings/", which matches no route and lands on a 404. Clicking a custom
// asset in the 持倉 list therefore showed "Not Found" instead of the detail
// page (including the 手動價格紀錄 table that is the whole point of custom
// assets). They now route through /holdings/id/$assetId — this spec drives the
// real creation → list → detail → manual-price flow end-to-end.

const STORAGE_KEY = "northstar.browserRepository.v1";
const ASSET_NAME = "老家不動產";

async function seedInvestmentAccount(page: Page) {
  await page.addInitScript(
    ([storageKey]) => {
      window.localStorage.setItem("northstar.onboarding.dismissed.v1", "1");
      // Minimal browser-repository snapshot: one investment account so the add
      // sheet has a broker to attach the holding to. Missing fields (bookId,
      // …) are backfilled by normalizeStoredData / ensureDefaultBookInMemory.
      const timestamp = "2026-01-01T00:00:00.000Z";
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({
          accounts: [
            {
              id: "acc_e2e_broker",
              spaceId: "space_personal_default",
              revision: 1,
              createdAt: timestamp,
              updatedAt: timestamp,
              deletedAt: null,
              name: "測試券商",
              currency: "TWD",
              openingBalance: 0,
              balance: 0,
              type: "investment",
              bookId: "",
              creditLimit: null,
              creditLimitGroup: "",
              creditGroupId: null,
              statementDay: null,
              paymentDueDay: null,
              creditPaymentPaidUntil: null,
              isSharedToHousehold: false,
              loanStartDate: null,
              annualInterestRate: null,
              loanTerm: null,
              iconName: null,
              color: null,
            },
          ],
        }),
      );
    },
    [STORAGE_KEY],
  );
}

async function stubMarketData(page: Page) {
  // Keep the flow hermetic: no live Yahoo / sector-feed traffic (CI has no
  // network; a 502 from the dev proxy would only add console noise).
  await page.route("**/api/yahoo/**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ chart: { result: [], error: null } }),
    });
  });
  await page.route("**/api/market-data**", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ funds: {} }) });
  });
}

async function createCustomAsset(page: Page) {
  await page.goto("/investments");
  await page.getByRole("button", { name: "新增交易" }).first().click();
  const drawer = page.locator(".ns-overlay-panel");
  await expect(drawer).toBeVisible();

  // Switch the drawer to 建立持倉 mode, then flag it as a custom asset.
  await drawer.getByRole("button", { name: "建立持倉／自訂資產" }).click();
  // force: the styled checkbox row sits inside the drawer's enter transition,
  // which can keep failing Playwright's hit-point check; the toBeChecked
  // assertion below still verifies the real toggle state.
  const customToggle = drawer.getByRole("checkbox", { name: /自訂資產（無報價）/ });
  await customToggle.check({ force: true });
  await expect(customToggle).toBeChecked();

  // The Ticker field must be gone in custom mode (it was previously shown but
  // silently discarded on save).
  await expect(drawer.getByLabel("Ticker", { exact: true })).toHaveCount(0);

  await drawer.getByLabel("名稱").fill(ASSET_NAME);
  // AppSelect trigger takes its accessible name from the wrapping Field label.
  await drawer.getByRole("button", { name: "券商 / 帳戶" }).click();
  await page.getByText("測試券商 (TWD)").click();
  await drawer.getByRole("spinbutton", { name: "股數" }).fill("1");
  await drawer.getByRole("spinbutton", { name: "平均成本" }).fill("10000000");
  await drawer.getByRole("button", { name: "儲存持倉" }).click();
  await expect(drawer).toHaveCount(0);
}

async function openDetailFromHoldingsList(page: Page) {
  // Both layouts render the position as a button whose accessible name carries
  // the asset name (mobile card / desktop expandable row); the DOM keeps the
  // other layout's hidden copy around, so filter to the visible one.
  const row = page
    .getByRole("button", { name: new RegExp(ASSET_NAME) })
    .filter({ visible: true })
    .first();
  await row.click();
  const isMobileLayout = (page.viewportSize()?.width ?? 1280) < 640;
  if (!isMobileLayout) {
    // Desktop rows expand in place; 查看詳情 inside the expansion navigates.
    await page.getByRole("button", { name: "查看詳情" }).click();
  }
}

test("custom asset is reachable from the 持倉 list and records manual prices", async ({ page }) => {
  await seedInvestmentAccount(page);
  await stubMarketData(page);
  await createCustomAsset(page);

  await expect(page.getByText(ASSET_NAME).first()).toBeVisible();
  await openDetailFromHoldingsList(page);

  // The id-based detail route, not a 404.
  await expect(page).toHaveURL(/\/holdings\/id\/asset_/);
  await expect(page.getByText("Not Found")).toHaveCount(0);
  await expect(page.getByText("找不到此持倉")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: ASSET_NAME })).toBeVisible();
  await expect(page.getByText("手動價格", { exact: true })).toBeVisible();

  // Manual-price flow: add a price, expect it in the 價格紀錄 history table.
  await page.getByRole("button", { name: "更新價格" }).click();
  await page.getByLabel("價格", { exact: true }).fill("12000000");
  await page.getByRole("button", { name: "儲存價格" }).click();
  await expect(page.getByText("價格紀錄 · 1")).toBeVisible();
  // Rendered by the 手動價格 indicator and the history row.
  await expect(page.getByText("12,000,000.00 TWD").first()).toBeVisible();
});
