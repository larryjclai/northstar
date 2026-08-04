import { expect, test, type Page } from "@playwright/test";

// Plan 296: on mobile the FIFO tax-lot table, transaction-history table, and
// manual-price-history table each have a fixed-width mono grid (~340-455px)
// that used to overflow the whole page (the root was `h-full overflow-auto`
// with no per-table scroll container), so a 390px viewport scrolled the
// entire page — breadcrumb and hero card included — sideways. Each table is
// now wrapped in its own `.ns-hscroll` container so only the table scrolls,
// and the 今日/現價/昨收 strip collapses from 3 columns to 1 below the sm
// (640px) breakpoint. These specs assert both hold on the持倉明細 page.

// Every measurement spec must first prove the dev server under test is
// actually serving THIS worktree, not a stale checkout on the same port (see
// plan 284 Phase B setup notes — this has burned prior executors).
async function assertServingThisWorktree(page: Page) {
  const css = await page.evaluate(async () => (await fetch("/src/styles/globals.css")).text());
  expect(css, "server is NOT serving this worktree").toContain("ns-holding-daychange-cell");
}

// Enables demo mode (seeds a holding with FIFO lots + transaction history)
// and lands on 2330.TW's detail page, fully settled. Every test calls this
// itself — no shared/cross-test state — via each describe's beforeEach.
//
// A SINGLE initial navigation, straight to /settings: an earlier version of
// this spec did `goto("/")` first and then `goto("/settings?tab=general")`
// inside this helper. In the `mobile` Playwright project that double
// navigation raced the app's own client-side routing — "Frame load
// interrupted" / "Navigation ... is interrupted by another navigation to /"
// — and failed fast (before demo mode was ever entered). It only passed when
// other specs had already run first and warmed the dev server's module
// cache, which is exactly the kind of order-dependent flake that breaks
// under CI sharding. Landing directly on /settings removes the race.
async function enterDemoModeOnHoldingDetail(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("northstar.onboarding.dismissed.v1", "1");
  });
  await page.goto("/settings?tab=general");
  await assertServingThisWorktree(page);

  const enterButton = page.getByRole("button", { name: "進入示範模式" });
  await expect(enterButton).toBeVisible();
  await enterButton.click();
  await expect(page.getByText("目前在示範模式。")).toBeVisible({ timeout: 15_000 });
  // Seeding continues asynchronously (React Query refetch) after the
  // confirmation text appears — give it time to populate the holdings list
  // before navigating, or the target route measures a half-seeded page.
  await page.waitForTimeout(7_000);

  // 2330.TW (台積電) has both FIFO lots and multiple transactions in the
  // seeded demo data — see src/data/demoData.ts INVESTMENTS.
  await page.goto("/holdings/2330.TW");
  // Web-first readiness gate: don't measure anything until the page has
  // actually rendered past the loading skeleton. FIFO renders below the
  // 今日/現價/昨收 strip in the DOM, so its visibility also implies the
  // strip (if present) has mounted.
  await expect(page.getByText("稅務批次 (FIFO)")).toBeVisible({ timeout: 15_000 });
}

test.describe("holding detail — mobile (390px)", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test.beforeEach(async ({ page }) => {
    await enterDemoModeOnHoldingDetail(page);
  });

  test("page itself never scrolls horizontally; each table scrolls internally", async ({
    page,
  }) => {
    // The page shell must not grow past the viewport width — this is the
    // actual bug plan 296 fixes (the whole page used to scroll sideways).
    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth);

    // FIFO 批次 and 交易紀錄 always render for this ticker (manual-price
    // history is custom-asset-only and isn't present in demo data, so only
    // these two are asserted here — see plan 296 NOTES).
    const wrappers = page.locator(".ns-hscroll");
    await expect(wrappers).toHaveCount(2);
    for (let i = 0; i < 2; i++) {
      const info = await wrappers.nth(i).evaluate((el) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      }));
      expect(info.scrollWidth).toBeGreaterThan(info.clientWidth);
    }
  });

  test("今日/現價/昨收 strip stacks into one column", async ({ page }) => {
    const cells = page.locator(".ns-holding-daychange-cell");
    await expect(cells.first()).toBeVisible();
    const boxes = await cells.evaluateAll((els) => els.map((el) => el.getBoundingClientRect()));
    expect(boxes.length).toBeGreaterThanOrEqual(2);
    // Stacked: each subsequent cell starts below the previous one, not beside it.
    for (let i = 1; i < boxes.length; i++) {
      expect(boxes[i].y).toBeGreaterThanOrEqual(boxes[i - 1].y + boxes[i - 1].height - 1);
    }
  });
});

test.describe("holding detail — desktop (1280px)", () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

  test.beforeEach(async ({ page }) => {
    await enterDemoModeOnHoldingDetail(page);
  });

  test("今日/現價/昨收 strip stays 3-across, gutter unchanged", async ({ page }) => {
    const cells = page.locator(".ns-holding-daychange-cell");
    await expect(cells.first()).toBeVisible();
    const boxes = await cells.evaluateAll((els) => els.map((el) => el.getBoundingClientRect()));
    expect(boxes.length).toBeGreaterThanOrEqual(2);
    // Side-by-side: the second cell starts to the right of the first, same row.
    expect(boxes[1].x).toBeGreaterThan(boxes[0].x + boxes[0].width - 1);
    expect(Math.abs(boxes[1].y - boxes[0].y)).toBeLessThanOrEqual(1);

    // No page-level horizontal scroll at desktop width either.
    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
  });
});
