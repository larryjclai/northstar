import { expect, test, type Page } from "@playwright/test";

// 投資 → 分析 tab on mobile viewports (plan 288). Two overflow bugs, both
// clipped by .ns-app-main's `overflowX: clip` (AppShell.tsx, a deliberate
// anti-page-scroll guard that must NOT be removed to fix this):
//   1. The page-global period SegmentedControl (1W…5Y/All/自訂) is wider than
//      a ~390pt viewport — "自訂" used to be clipped off-screen and
//      unclickable. Fix: wrap it in the existing `.ns-hscroll` helper so it
//      scrolls horizontally instead of being clipped.
//   2. SectionHeader (01–05) is a non-wrapping flex row — the trailing
//      ScopeTag pill used to be pushed off the right edge and clipped. Fix:
//      allow the row to wrap (`flexWrap: "wrap"`) with `minWidth: 0` on the
//      question span so the tag can drop to its own line at narrow widths.

async function dismissOnboarding(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("northstar.onboarding.dismissed.v1", "1");
  });
}

// Every measurement spec must first prove the dev server under test is
// actually serving THIS worktree, not a stale checkout on the same port
// (see plan 284 Phase B setup notes / sticky-chrome.spec.ts — this has
// burned prior executors). Beyond the generic globals.css fingerprint, also
// assert the DOM structure this plan's fix actually produces: the period
// SegmentedControl must be wrapped in a `.ns-hscroll` container — that proves
// Step 1's edit is present, not just that *some* build of the app is served.
// Must be called AFTER switching to the 分析 tab — the period control this
// checks for only exists on that tab, not the default 持倉 tab.
async function assertServingThisWorktree(page: Page) {
  const css = await page.evaluate(async () => (await fetch("/src/styles/globals.css")).text());
  expect(css, "server is NOT serving this worktree").toContain("ns-page-chrome");

  const periodScrollWrap = page.locator(".ns-hscroll", {
    has: page.getByRole("button", { name: "自訂" }),
  });
  await expect(
    periodScrollWrap,
    "period SegmentedControl is not wrapped in .ns-hscroll — plan 288 Step 1 fix is not present in this build",
  ).toHaveCount(1);
}

async function enterDemoMode(page: Page) {
  await page.goto("/settings?tab=general");
  const enterButton = page.getByRole("button", { name: "進入示範模式" });
  await enterButton.click();
  await expect(page.getByText("目前在示範模式。")).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(7_000);
}

async function switchToInvestmentsAnalyticsTab(page: Page) {
  await page.getByRole("button", { name: "分析", exact: true }).click();
  // Backfill/history chart rendering settles asynchronously.
  await page.waitForTimeout(1_500);
}

test.describe("投資 → 分析: mobile overflow (plan 288)", () => {
  test.describe.configure({ timeout: 60_000 });

  test.beforeEach(async ({ page }) => {
    await dismissOnboarding(page);
  });

  test.describe("phone 390×844", () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

    test("period control scrolls to 自訂 and it is clickable", async ({ page }) => {
      await enterDemoMode(page);
      await page.goto("/investments");
      await page.waitForLoadState("networkidle");
      await switchToInvestmentsAnalyticsTab(page);
      await assertServingThisWorktree(page);

      const scrollWrap = page.locator(".ns-hscroll", {
        has: page.getByRole("button", { name: "自訂" }),
      });
      await expect(scrollWrap).toBeVisible();

      // The control must actually be wider than the viewport for this test to
      // be meaningful — otherwise the scroll assertion below is vacuous.
      const [scrollWidth, clientWidth] = await scrollWrap.evaluate((el) => [
        el.scrollWidth,
        el.clientWidth,
      ]);
      expect(
        scrollWidth,
        "period control fits without scrolling at 390px — this test no longer exercises the overflow bug",
      ).toBeGreaterThan(clientWidth);

      // Scroll the container all the way right so "自訂" is fully in view,
      // then click it — before the fix this segment was clipped by
      // .ns-app-main's overflowX:clip and unreachable.
      await scrollWrap.evaluate((el) => {
        el.scrollLeft = el.scrollWidth;
      });
      const customButton = page.getByRole("button", { name: "自訂" });
      await expect(customButton).toBeVisible();
      const box = await customButton.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(390 + 1);

      await customButton.click();

      // Selecting Custom reveals the two date-range inputs.
      const dateInputs = page.locator('input[type="date"]');
      await expect(dateInputs).toHaveCount(2);
      await expect(dateInputs.first()).toBeVisible();
      await expect(dateInputs.last()).toBeVisible();
    });

    test("SectionHeader ScopeTag pills stay within the viewport", async ({ page }) => {
      await enterDemoMode(page);
      await page.goto("/investments");
      await page.waitForLoadState("networkidle");
      await switchToInvestmentsAnalyticsTab(page);
      await assertServingThisWorktree(page);

      // One ScopeTag per rendered 01–05 section: SectionHeader's `tag` prop is
      // always its last child, and each analytics section renders exactly one
      // SectionHeader as its first child. Some sections (02 貢獻, 04 收益) are
      // conditionally rendered depending on the demo data shape, so query
      // however many are actually present rather than hard-coding 5.
      const tags = page.locator('section[id^="an-"] > div:first-child > span:last-child');
      const count = await tags.count();
      expect(
        count,
        "no analytics sections rendered — setup did not reach a measurable state",
      ).toBeGreaterThan(0);

      for (let i = 0; i < count; i++) {
        const tag = tags.nth(i);
        await tag.scrollIntoViewIfNeeded();
        const box = await tag.boundingBox();
        expect(box, `section ${i} ScopeTag has no bounding box`).not.toBeNull();
        expect(
          box!.x + box!.width,
          `section ${i} ScopeTag right edge (${box!.x + box!.width}) exceeds viewport width (390)`,
        ).toBeLessThanOrEqual(390 + 1);
        expect(box!.x).toBeGreaterThanOrEqual(0);
      }
    });
  });

  test.describe("desktop 1280×900", () => {
    test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false });

    test("period control and SectionHeader stay single-line, no scroll needed", async ({
      page,
    }) => {
      await enterDemoMode(page);
      await page.goto("/investments");
      await page.waitForLoadState("networkidle");
      await switchToInvestmentsAnalyticsTab(page);
      await assertServingThisWorktree(page);

      // At desktop width the period control must not need to scroll — the
      // .ns-hscroll wrapper is a no-op when content already fits.
      const scrollWrap = page.locator(".ns-hscroll", {
        has: page.getByRole("button", { name: "自訂" }),
      });
      const [scrollWidth, clientWidth] = await scrollWrap.evaluate((el) => [
        el.scrollWidth,
        el.clientWidth,
      ]);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

      // SectionHeader must stay a single row: the "no", title, question, and
      // tag spans should all land on the same visual line, not wrap onto a
      // second line the way they intentionally do at 390px. The row is
      // `alignItems: baseline`, so same-line items do NOT share an identical
      // `top` (a large title span and a small mono span baseline-align, not
      // top-align) — comparing raw `top` equality is a false positive for
      // wrapping. Instead check that every span's vertical range overlaps a
      // common band: same-line items always overlap vertically (the shorter
      // spans sit inside the tallest span's box); a wrapped item on its own
      // line sits entirely below with no overlap.
      const headers = page.locator('section[id^="an-"] > div:first-child');
      const count = await headers.count();
      expect(count).toBeGreaterThan(0);
      for (let i = 0; i < count; i++) {
        const spans = headers.nth(i).locator("> span");
        const boxes = await spans.evaluateAll((els) =>
          els.map((el) => {
            const r = el.getBoundingClientRect();
            return { top: r.top, bottom: r.bottom };
          }),
        );
        const maxTop = Math.max(...boxes.map((b) => b.top));
        const minBottom = Math.min(...boxes.map((b) => b.bottom));
        expect(
          maxTop,
          `section ${i} SectionHeader wrapped onto multiple lines at 1280px (spans: ${JSON.stringify(boxes)})`,
        ).toBeLessThanOrEqual(minBottom);
      }
    });
  });
});
