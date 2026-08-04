import { expect, test, type Page } from "@playwright/test";

// Plan 290: the mobile "快速記帳" FAB is scoped to the dashboard (/) and
// 記帳 (/cash-flow…) routes. On other mobile routes it used to sit fixed at
// z-index 40 and cover clickable content (投資分析's 回補歷史 button, 設定's
// 採用遠端 conflict-resolution button). This spec asserts the FAB shows only
// where it belongs.

async function dismissOnboarding(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("northstar.onboarding.dismissed.v1", "1");
  });
}

// Every measurement spec must first prove the dev server under test is
// actually serving THIS worktree, not a stale checkout on the same port
// (see plan 284 Phase B setup notes — this has burned prior executors).
async function assertServingThisWorktree(page: Page) {
  const css = await page.evaluate(async () => (await fetch("/src/styles/globals.css")).text());
  expect(css, "server is NOT serving this worktree").toContain("ns-page-chrome");
}

const fab = (page: Page) => page.locator('[aria-label="快速記帳"]');

test.describe("quick-add FAB scope (plan 290)", () => {
  test.describe("phone 390×844", () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

    test("shows on 總覽 (/)", async ({ page }) => {
      await dismissOnboarding(page);
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      await assertServingThisWorktree(page);
      await expect(fab(page)).toBeVisible();
    });

    test("shows on 記帳 (/cash-flow)", async ({ page }) => {
      await dismissOnboarding(page);
      await page.goto("/cash-flow");
      await page.waitForLoadState("networkidle");
      await assertServingThisWorktree(page);
      await expect(fab(page)).toBeVisible();
    });

    test("hidden on 投資 (/investments)", async ({ page }) => {
      await dismissOnboarding(page);
      await page.goto("/investments");
      await page.waitForLoadState("networkidle");
      await assertServingThisWorktree(page);
      await expect(fab(page)).toHaveCount(0);
    });

    test("hidden on 設定 (/settings)", async ({ page }) => {
      await dismissOnboarding(page);
      await page.goto("/settings");
      await page.waitForLoadState("networkidle");
      await assertServingThisWorktree(page);
      await expect(fab(page)).toHaveCount(0);
    });

    test("hidden on 帳戶 (/accounts)", async ({ page }) => {
      await dismissOnboarding(page);
      await page.goto("/accounts");
      await page.waitForLoadState("networkidle");
      await assertServingThisWorktree(page);
      await expect(fab(page)).toHaveCount(0);
    });
  });

  test.describe("desktop 1280×800", () => {
    test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

    test("never shows on desktop, even on scoped routes", async ({ page }) => {
      // The FAB is `lg:hidden` — on scoped routes (/, /cash-flow) it stays
      // in the DOM but must not be visible; the CSS breakpoint, not the
      // route scoping, is what hides it here.
      await dismissOnboarding(page);
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      await assertServingThisWorktree(page);
      await expect(fab(page)).toBeHidden();

      await page.goto("/cash-flow");
      await page.waitForLoadState("networkidle");
      await expect(fab(page)).toBeHidden();
    });
  });
});
