import { expect, test, type Page } from "@playwright/test";

// Plan 295: the 記帳 month-collapsed view's header row (long ranges — YTD /
// 近12個月 / 全部) puts three whitespace-nowrap amount groups (收入/支出/淨)
// in a single non-wrapping right cluster. At real amounts that cluster is
// wider than a 390px phone's content column, and AppShell clips overflow-x —
// the 淨 figure (most important number) was silently cut off and unreachable
// by scroll. This spec proves it now wraps onto a second row on narrow
// viewports (fitting inside the header) and stays a single row unchanged at
// desktop widths.

async function dismissOnboarding(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("northstar.onboarding.dismissed.v1", "1");
  });
}

// Every measurement spec must first prove the dev server under test is
// actually serving THIS worktree, not a stale main checkout on the same port
// (see plan 284 Phase B setup notes — this has burned multiple executors).
async function assertServingThisWorktree(page: Page) {
  const css = await page.evaluate(async () => (await fetch("/src/styles/globals.css")).text());
  expect(css, "server is NOT serving this worktree").toContain("ns-cf-month-amounts");
}

// Loads demo data so the ledger has real transactions with real amounts.
async function enterDemoMode(page: Page) {
  await page.goto("/settings?tab=general");
  const enterButton = page.getByRole("button", { name: "進入示範模式" });
  await enterButton.click();
  await expect(page.getByText("目前在示範模式。")).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(7_000);
}

// 記帳 defaults to "本月". Widen to 近 12 個月 — the widest preset actually
// wired into the ledger date popover (PERIOD_PRESETS in LedgerDateControl.tsx
// is month/ytd/last12m/custom; "全部" is a DateScopePreset but isn't offered
// here, same constraint documented in sticky-chrome.spec.ts) — so the view
// enters isLongRangeView and renders the month-collapsed headers under test.
async function widenCashFlowDateRange(page: Page) {
  await page.getByRole("button", { name: /^本月/ }).click();
  await page.getByRole("button", { name: "近 12 個月", exact: true }).click();
  await page.keyboard.press("Escape");
}

test.describe("記帳月份標頭 — mobile amount wrap (plan 295)", () => {
  test.beforeEach(async ({ page }) => {
    await dismissOnboarding(page);
  });

  test.describe("phone 390×844", () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

    test("month header wraps to two rows; all three amount groups stay visible", async ({
      page,
    }) => {
      await enterDemoMode(page);
      await page.goto("/cash-flow");
      await page.waitForLoadState("networkidle");
      await assertServingThisWorktree(page);
      await widenCashFlowDateRange(page);

      const monthHeader = page.locator(".ns-cf-month-header").first();
      await expect(monthHeader).toBeVisible();

      // The header itself must not cause horizontal overflow.
      const [scrollWidth, clientWidth] = await monthHeader.evaluate((el) => [
        el.scrollWidth,
        el.clientWidth,
      ]);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

      // The 淨 (net) figure — the most important number, previously clipped —
      // must be fully within the viewport width, not just present in the DOM.
      const netSpan = monthHeader.locator("span.pos, span.neg").last();
      await expect(netSpan).toBeVisible();
      const netBox = await netSpan.boundingBox();
      expect(netBox).not.toBeNull();
      const innerWidth = await page.evaluate(() => window.innerWidth);
      expect(netBox!.x + netBox!.width).toBeLessThanOrEqual(innerWidth);

      const headerBox = await monthHeader.boundingBox();
      expect(headerBox).not.toBeNull();

      // The 淨 span must have actually wrapped INSIDE the header box, not been
      // clipped by it — i.e. its vertical extent is contained within the
      // header's own bounding box, not sitting past its bottom edge.
      expect(netBox!.y).toBeGreaterThanOrEqual(headerBox!.y);
      expect(netBox!.y + netBox!.height).toBeLessThanOrEqual(headerBox!.y + headerBox!.height + 1);

      // Two-row stacking must not blow the sticky header past the repo's
      // established mobile chrome budget (plan 284 Phase B: ≤100px for a
      // two-row pinned bar). NOT a tight pixel budget — CJK amount-cluster
      // width (and therefore how many lines it wraps to) varies with the
      // host's font metrics; CI's Linux fonts render wider than local macOS
      // and pushed a tighter 72px budget over in PR #45. 100px still catches
      // a genuine three-or-more-line regression while tolerating font-driven
      // wrap differences across environments.
      expect(headerBox!.height).toBeLessThanOrEqual(100);
    });
  });

  test.describe("desktop 1280×800", () => {
    test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

    test("month header stays a single row (unchanged from before)", async ({ page }) => {
      await enterDemoMode(page);
      await page.goto("/cash-flow");
      await page.waitForLoadState("networkidle");
      await assertServingThisWorktree(page);
      await widenCashFlowDateRange(page);

      const monthHeader = page.locator(".ns-cf-month-header").first();
      await expect(monthHeader).toBeVisible();

      const headerBox = await monthHeader.boundingBox();
      expect(headerBox).not.toBeNull();
      // Single row of text + padding — well under the two-row phone budget.
      // Kept loose (not a tight single-line pixel count) for the same reason
      // as the phone budget above: CI's Linux font metrics render CJK text
      // wider than local macOS, and 1280px has generous headroom either way.
      expect(headerBox!.height).toBeLessThan(60);

      const [scrollWidth, clientWidth] = await monthHeader.evaluate((el) => [
        el.scrollWidth,
        el.clientWidth,
      ]);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
    });
  });
});
