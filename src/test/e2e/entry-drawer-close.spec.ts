import { expect, test, type Page } from "@playwright/test";

// Regression: closing the 記帳 EntryDrawer through its ANIMATED path (Escape /
// 取消 / scrim — anything but 儲存, which closes synchronously) used to leave
// `closing=true` while the parent had already unmounted the panel, and the
// close effect depended on the unstable `onClose` prop — so every parent
// render re-ran it, each run called onClose() → parent setState → new onClose
// identity → run again. Production React throws that nested-update loop as
// minified error #185 and the route error boundary replaces 記帳 with
// 「這個畫面發生問題」. Dev React logs "Maximum update depth exceeded" instead
// of throwing, which is what these tests listen for.
//
// The loop needs a real exit transition (jsdom's transition-duration is 0, so
// unit tests take the synchronous close branch and can never see it) — hence
// an e2e spec.

function collectMaxDepthErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && msg.text().includes("Maximum update depth")) {
      errors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => {
    if (err.message.includes("Maximum update depth")) errors.push(err.message);
  });
  return errors;
}

async function dismissOnboarding(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("northstar.onboarding.dismissed.v1", "1");
  });
}

async function openEntryDrawer(page: Page) {
  await page.goto("/cash-flow");
  await page.getByRole("button", { name: "記一筆" }).click();
  await expect(page.locator(".ns-overlay-panel")).toBeVisible();
}

async function expectDrawerClosedCleanly(page: Page, errors: string[]) {
  // The exit transition is 160ms with a 300ms fallback — well inside 5s.
  await expect(page.locator(".ns-overlay-panel")).toHaveCount(0, { timeout: 5_000 });
  await expect(page.getByText("這個畫面發生問題")).toHaveCount(0);
  expect(errors, "nested-update loop on drawer close (#185)").toHaveLength(0);
}

test("Escape closes the entry drawer without a nested-update loop", async ({ page }) => {
  const errors = collectMaxDepthErrors(page);
  await dismissOnboarding(page);
  await openEntryDrawer(page);
  await page.keyboard.press("Escape");
  await expectDrawerClosedCleanly(page, errors);

  // Reopen and close again: the closing flag must reset across cycles.
  await page.getByRole("button", { name: "記一筆" }).click();
  await expect(page.locator(".ns-overlay-panel")).toBeVisible();
  await page.keyboard.press("Escape");
  await expectDrawerClosedCleanly(page, errors);
});

test("取消 closes the entry drawer without a nested-update loop", async ({ page }) => {
  const errors = collectMaxDepthErrors(page);
  await dismissOnboarding(page);
  await openEntryDrawer(page);
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expectDrawerClosedCleanly(page, errors);
});
