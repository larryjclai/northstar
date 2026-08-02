import { expect, test, type Page } from "@playwright/test";

// The pinned page toolbar on 記帳 (/cash-flow) and 投資 (/investments).
// Plan 284's condensing morph was replaced (operator request, 2026-08-02) by
// a static single-row toolbar: the display header scrolls away, and the
// toolbar (tabs + actions) pins WITHOUT changing shape. These tests assert
// the pinned bar's position/budget, that its height is scroll-independent,
// and that it never wraps at the tightest desktop width (1024).

async function dismissOnboarding(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("northstar.onboarding.dismissed.v1", "1");
  });
}

// Every measurement spec must first prove the dev server under test is
// actually serving THIS worktree, not a stale main checkout on the same port
// (see plan 284 Phase B setup notes — this has burned two prior executors).
async function assertServingThisWorktree(page: Page) {
  const css = await page.evaluate(async () => (await fetch("/src/styles/globals.css")).text());
  expect(css, "server is NOT serving this worktree").toContain("ns-page-chrome");
}

// Loads demo data so the ledger/holdings lists are long enough to scroll.
// Demo seeding stashes any existing data and takes a few seconds to populate.
async function enterDemoMode(page: Page) {
  await page.goto("/settings?tab=general");
  const enterButton = page.getByRole("button", { name: "進入示範模式" });
  await enterButton.click();
  await expect(page.getByText("目前在示範模式。")).toBeVisible({ timeout: 15_000 });
  // Seeding continues asynchronously (React Query refetch) after the
  // confirmation text appears — give it time to populate the ledger/holdings
  // lists before navigating, or the target route measures a half-seeded page.
  await page.waitForTimeout(7_000);
}

// 記帳 defaults to "本月" (the current calendar month), which the seeded demo
// data barely touches. Widen to 近 12 個月 (the widest preset actually wired
// into this popover — "全部" exists as a DateScopePreset but isn't offered
// here) so imported rows below are in scope.
async function widenCashFlowDateRange(page: Page) {
  await page.getByRole("button", { name: /^本月/ }).click();
  await page.getByRole("button", { name: "近 12 個月", exact: true }).click();
  await page.keyboard.press("Escape");
}

// Even widened, demo data alone isn't enough rows to make the page tall
// enough to scroll (~1400px against the 1500px floor below) — and unlike a
// short range, a >92-day scope collapses into per-month headers rather than
// a "顯示更早的交易" pager (CashFlowRoute.tsx `isLongRangeView`), so loading
// more pages isn't an option here either. Seed extra rows through the app's
// own CSV import (the same path a real user's import takes) rather than
// editing demoData.ts, which is shared by far more than this one spec.
async function seedExtraCashFlowTransactions(page: Page, count: number) {
  const header =
    "date,account,name,entryType,settlementStatus,amount,currency,category,subcategory,merchant";
  const rows = [header];
  for (let i = 0; i < count; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const date = d.toISOString().slice(0, 10);
    rows.push(
      `${date},國泰世華 數位帳戶,e2e 測試支出 ${i},expense,cleared,-100,TWD,餐飲,,e2e 測試商家 ${i}`,
    );
  }
  await page.setInputFiles('input[type="file"]', {
    name: "sticky-chrome-seed.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(rows.join("\n"), "utf-8"),
  });
  await expect(page.getByText(`${count} valid`)).toBeVisible();
  await page.getByRole("button", { name: "確認匯入" }).click();
  await expect(page.getByText(`成功匯入 ${count} 筆資料`)).toBeVisible();
}

// The long-range (近 12 個月) view groups rows under collapsed month headers
// (plan 169 variant D) — expand a couple so their day-grouped rows actually
// render into the DOM and contribute scrollable height.
async function expandCashFlowMonths(page: Page, n: number) {
  const monthHeaders = page.locator(".ns-cf-month-header");
  const total = await monthHeaders.count();
  for (let i = 0; i < Math.min(n, total); i++) {
    await monthHeaders.nth(i).click();
  }
}

async function prepareTallCashFlowPage(page: Page) {
  await widenCashFlowDateRange(page);
  await seedExtraCashFlowTransactions(page, 60);
  await expandCashFlowMonths(page, 2);
}

// 投資's 持倉 (default) tab alone is short even with demo data. The 分析 tab
// renders the full risk/benchmark/allocation-drift/rolling-volatility charts
// and is comfortably tall — switch to it instead of seeding fake investment
// records, and it happens to double as a check that the analytics section
// nav (Phase A) still sits directly below the pinned toolbar.
async function switchToInvestmentsAnalyticsTab(page: Page) {
  await page.getByRole("button", { name: "分析", exact: true }).click();
  // Backfill/history chart rendering settles asynchronously.
  await page.waitForTimeout(1_500);
}

// The top-edge contract (Phase A, globals.css): `--ns-sticky-top` accounts for
// the safe-area/titlebar inset (0 in a browser) and `--ns-demo-banner-h`
// accounts for the demo-mode banner, measured at runtime by AppShell. The
// pinned toolbar must sit exactly at their sum, not at the viewport edge.
async function expectedStickyTop(page: Page) {
  return page.evaluate(() => {
    const shell = document.querySelector(".ns-app-shell");
    if (!shell) return 0;
    const style = getComputedStyle(shell);
    const stickyTop = parseFloat(style.getPropertyValue("--ns-sticky-top")) || 0;
    const bannerH = parseFloat(style.getPropertyValue("--ns-demo-banner-h")) || 0;
    return stickyTop + bannerH;
  });
}

async function assertTallEnoughToScroll(page: Page) {
  // STOP condition guard (plan 284 Phase B Step B4): if the seeded/expanded
  // page still isn't tall enough to actually scroll 1200px, the pinned-bar
  // assertions below would be meaningless rather than a real regression
  // guard. Fail loudly instead of silently shrinking the scroll distance.
  const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
  expect(
    scrollHeight,
    "seeded page is too short to prove pinning via scroll — see STOP condition in plan 284 Phase B Step B4",
  ).toBeGreaterThan(1500);
}

// Scrolls to the measurement position and waits for the chrome to reach
// `expected`. `prepareTallCashFlowPage` above does an unusually large amount
// of synchronous DOM work in one burst — a 60-row CSV import plus expanding
// two collapsed months, none of which a real user does back-to-back in under
// a second — and Chromium's IntersectionObserver can end up not dispatching
// a fresh entry for the sentinel until it sees an actual intersection change
// from a clean baseline. Settling at the top first (a real scroll, not just
// state) gives it that baseline before the real measurement scroll.
async function scrollAndAwaitChrome(
  page: Page,
  chrome: import("@playwright/test").Locator,
  y: number,
  expected: "true" | "false",
) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  await page.evaluate((y) => window.scrollTo(0, y), y);
  // data-stuck drives only the .ns-scroll-edge hairline — the toolbar's
  // layout is scroll-independent, so no transition-settling wait is needed
  // beyond the observer flip itself.
  await expect(chrome).toHaveAttribute("data-stuck", expected);
  await page.waitForTimeout(100);
}

test.describe("sticky page chrome — 記帳 / 投資 (plan 284 Phase B)", () => {
  // The default 30s Playwright timeout has no headroom here: setup per test
  // is genuinely ~15s of real work — demo-mode seeding (a fixed 7s wait),
  // widening the date range, importing a 60-row CSV, and expanding two
  // month headers — before the scroll/measurement assertions even start.
  // That fits inside 30s on a fast dev machine, which is why this passed
  // locally many times, but CI's runner is roughly 2-3x slower and one of
  // these tests (/cash-flow desktop 1440×900) timed out mid-setup on CI
  // (see PR #24, failure at expandCashFlowMonths). This raises the ceiling
  // to give the real setup cost room to complete on a slow runner — it is
  // not a workaround for a hang, and the assertions below are unchanged.
  // Do not "tidy" this back down to the default.
  test.describe.configure({ mode: "serial", timeout: 90_000 });

  test.beforeEach(async ({ page }) => {
    await dismissOnboarding(page);
  });

  // These three tests assert desktop (mouse) chrome behaviour and must run
  // with the project's mobile device emulation (isMobile/hasTouch) cleared —
  // `page.setViewportSize` only resizes the viewport, it does not clear
  // those flags, which left the "mobile" project running these under iPhone
  // 15 touch emulation and intermittently timing out on the month-header
  // click. `test.use` at describe level is the correct override (see
  // page-width.spec.ts).
  test.describe("desktop 1440×900", () => {
    test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false });

    test("/cash-flow: desktop 1440×900 toolbar pins without changing shape, ≤56px", async ({
      page,
    }) => {
      await enterDemoMode(page);
      await page.goto("/cash-flow");
      await page.waitForLoadState("networkidle");
      await assertServingThisWorktree(page);
      await prepareTallCashFlowPage(page);

      const chrome = page.locator(".ns-page-chrome");
      await expect(chrome).toBeVisible();

      await assertTallEnoughToScroll(page);

      // The setup above (opening the date popover, importing a CSV, expanding
      // month headers) leaves the page scrolled to wherever the last clicked
      // element happened to be — capture the genuine at-rest baseline only
      // after explicitly returning to the top.
      await scrollAndAwaitChrome(page, chrome, 0, "false");
      const restBox = await chrome.boundingBox();
      expect(restBox).not.toBeNull();

      await scrollAndAwaitChrome(page, chrome, 1200, "true");

      const pinnedBox = await chrome.boundingBox();
      expect(pinnedBox).not.toBeNull();
      // Pinned directly below the top edge — in demo mode that's the demo
      // banner's measured height (--ns-demo-banner-h), not 0.
      const demoBannerH = await expectedStickyTop(page);
      expect(pinnedBox!.y).toBeGreaterThanOrEqual(demoBannerH - 1);
      expect(pinnedBox!.y).toBeLessThanOrEqual(demoBannerH + 4);
      // The chrome must NOT morph: the whole point of replacing plan 284's
      // condensing layout is that the toolbar is the same shape at rest and
      // pinned (operator request, 2026-08-02). Any height delta means a
      // scroll-triggered layout change crept back in.
      expect(Math.abs(pinnedBox!.height - restBox!.height)).toBeLessThanOrEqual(1);
      // The pinned-cost budget from plan 284 still holds — one row of chrome,
      // or someone adds one button at a time and it regresses to ~132px.
      expect(pinnedBox!.height).toBeLessThanOrEqual(56);
      // The display header lives outside the chrome and scrolls away.
      const title = page.getByRole("heading", { name: "記帳", exact: true });
      const titleBox = await title.boundingBox();
      expect(titleBox).not.toBeNull();
      expect(titleBox!.y + titleBox!.height).toBeLessThan(0);
    });

    test("/investments: desktop 1440×900 toolbar pins without changing shape, ≤56px", async ({
      page,
    }) => {
      await enterDemoMode(page);
      await page.goto("/investments");
      await page.waitForLoadState("networkidle");
      await assertServingThisWorktree(page);
      await switchToInvestmentsAnalyticsTab(page);

      const chrome = page.locator(".ns-page-chrome");
      await expect(chrome).toBeVisible();

      await assertTallEnoughToScroll(page);

      await scrollAndAwaitChrome(page, chrome, 0, "false");
      const restBox = await chrome.boundingBox();
      expect(restBox).not.toBeNull();

      await scrollAndAwaitChrome(page, chrome, 1200, "true");

      const pinnedBox = await chrome.boundingBox();
      expect(pinnedBox).not.toBeNull();
      const demoBannerH = await expectedStickyTop(page);
      expect(pinnedBox!.y).toBeGreaterThanOrEqual(demoBannerH - 1);
      expect(pinnedBox!.y).toBeLessThanOrEqual(demoBannerH + 4);
      expect(Math.abs(pinnedBox!.height - restBox!.height)).toBeLessThanOrEqual(1);
      expect(pinnedBox!.height).toBeLessThanOrEqual(56);
      const title = page.getByRole("heading", { name: "投資", exact: true });
      const titleBox = await title.boundingBox();
      expect(titleBox).not.toBeNull();
      expect(titleBox!.y + titleBox!.height).toBeLessThan(0);
    });
  });

  test.describe("desktop 1024×768", () => {
    test.use({ viewport: { width: 1024, height: 768 }, isMobile: false, hasTouch: false });

    test("記帳: desktop 1024×768 toolbar stays one row; tabs scroll horizontally", async ({
      page,
    }) => {
      await enterDemoMode(page);
      await page.goto("/cash-flow");
      await page.waitForLoadState("networkidle");
      await assertServingThisWorktree(page);
      await prepareTallCashFlowPage(page);

      const chrome = page.locator(".ns-page-chrome");
      await expect(chrome).toBeVisible();

      await assertTallEnoughToScroll(page);

      await scrollAndAwaitChrome(page, chrome, 1200, "true");

      const pinnedBox = await chrome.boundingBox();
      expect(pinnedBox).not.toBeNull();
      expect(pinnedBox!.height).toBeLessThanOrEqual(56);

      // No wrap: the tab strip must stay a single line — its own height must
      // be small (one row of buttons), not stacked into two.
      const tabsRow = page.locator(".ns-page-toolbar-tabs");
      const tabsBox = await tabsRow.boundingBox();
      expect(tabsBox).not.toBeNull();
      expect(tabsBox!.height).toBeLessThanOrEqual(48);

      // Tabs scroll horizontally instead of wrapping: the row's scrollable
      // content is wider than its visible box. (At 1024 the content column is
      // 720px and tabs + actions want ~800px — plan 284's width contract.)
      const [scrollWidth, clientWidth] = await tabsRow.evaluate((el) => [
        el.scrollWidth,
        el.clientWidth,
      ]);
      expect(scrollWidth).toBeGreaterThan(clientWidth);
    });
  });

  // The phone test genuinely wants touch emulation — pin it explicitly
  // instead of relying on whichever project happens to run it, so it
  // actually exercises touch rather than accidentally running as desktop
  // under the `chromium` project.
  test.describe("phone 390×780", () => {
    test.use({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true });

    test("記帳: phone 390×780 pinned chrome stays ≤100px", async ({ page }) => {
      await enterDemoMode(page);
      await page.goto("/cash-flow");
      await page.waitForLoadState("networkidle");
      await assertServingThisWorktree(page);
      await prepareTallCashFlowPage(page);

      const chrome = page.locator(".ns-page-chrome");
      await expect(chrome).toBeVisible();

      await assertTallEnoughToScroll(page);

      await scrollAndAwaitChrome(page, chrome, 1200, "true");

      // Below 1024 the toolbar wraps into two rows (actions above, tabs
      // below) — that two-row bar must stay inside plan 284's phone budget.
      const pinnedBox = await chrome.boundingBox();
      expect(pinnedBox).not.toBeNull();
      expect(pinnedBox!.height).toBeLessThanOrEqual(100);

      // Tabs must still be tappable while pinned.
      const overviewTab = page.getByRole("button", { name: "交易" });
      await expect(overviewTab).toBeVisible();
    });
  });
});
