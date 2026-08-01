import { expect, test, type Page } from "@playwright/test";

// Plan 284 Phase B: the condensing page chrome on 記帳 (/cash-flow) and 投資
// (/investments). Both must condense to a short pinned bar on scroll instead
// of pinning the full-height header, and must never wrap at the tightest
// desktop width (1024).

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
// nav (Phase A) still sits directly below the condensed chrome.
async function switchToInvestmentsAnalyticsTab(page: Page) {
  await page.getByRole("button", { name: "分析", exact: true }).click();
  // Backfill/history chart rendering settles asynchronously.
  await page.waitForTimeout(1_500);
}

// The top-edge contract (Phase A, globals.css): `--ns-sticky-top` accounts for
// the safe-area/titlebar inset (0 in a browser) and `--ns-demo-banner-h`
// accounts for the demo-mode banner, measured at runtime by AppShell. The
// condensed chrome must pin exactly at their sum, not at the viewport edge.
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
  // page still isn't tall enough to actually scroll 1200px, the condensing
  // assertions below would be meaningless rather than a real regression
  // guard. Fail loudly instead of silently shrinking the scroll distance.
  const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
  expect(
    scrollHeight,
    "seeded page is too short to prove condensing via scroll — see STOP condition in plan 284 Phase B Step B4",
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
  await expect(chrome).toHaveAttribute("data-condensed", expected);
  // `data-condensed` flips the instant the observer fires, but the CSS
  // padding-block/background transition it drives (globals.css `--ns-dur`,
  // 200ms) is still animating at that exact moment — measuring immediately
  // catches an in-flight height, not the settled one. Wait it out.
  await page.waitForTimeout(300);
}

test.describe("sticky page chrome — 記帳 / 投資 (plan 284 Phase B)", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await dismissOnboarding(page);
  });

  test("/cash-flow: desktop 1440×900 condenses on scroll and stays ≤56px", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
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
    // after explicitly returning to the top, or restBox measures a page
    // that's already partway condensed.
    await scrollAndAwaitChrome(page, chrome, 0, "false");
    const restBox = await chrome.boundingBox();
    expect(restBox).not.toBeNull();

    await scrollAndAwaitChrome(page, chrome, 1200, "true");

    const condensedBox = await chrome.boundingBox();
    expect(condensedBox).not.toBeNull();
    // Pinned directly below the top edge — in demo mode that's the demo
    // banner's measured height (--ns-demo-banner-h), not 0.
    const demoBannerH = await expectedStickyTop(page);
    expect(condensedBox!.y).toBeGreaterThanOrEqual(demoBannerH - 1);
    expect(condensedBox!.y).toBeLessThanOrEqual(demoBannerH + 4);
    // The machine-checkable proof that condensing actually engaged.
    expect(condensedBox!.height).toBeLessThan(restBox!.height);
    // The core value proposition of this plan over the rejected pin-as-is
    // alternative — must be enforced by a test, or someone adds one button
    // at a time and it silently regresses to ~132px.
    expect(condensedBox!.height).toBeLessThanOrEqual(56);
  });

  test("/investments: desktop 1440×900 condenses on scroll and stays ≤56px", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
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

    const condensedBox = await chrome.boundingBox();
    expect(condensedBox).not.toBeNull();
    const demoBannerH = await expectedStickyTop(page);
    expect(condensedBox!.y).toBeGreaterThanOrEqual(demoBannerH - 1);
    expect(condensedBox!.y).toBeLessThanOrEqual(demoBannerH + 4);
    expect(condensedBox!.height).toBeLessThan(restBox!.height);
    expect(condensedBox!.height).toBeLessThanOrEqual(56);
  });

  test("記帳: phone 390×780 condensed chrome stays ≤100px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await enterDemoMode(page);
    await page.goto("/cash-flow");
    await page.waitForLoadState("networkidle");
    await assertServingThisWorktree(page);
    await prepareTallCashFlowPage(page);

    const chrome = page.locator(".ns-page-chrome");
    await expect(chrome).toBeVisible();

    await assertTallEnoughToScroll(page);

    await scrollAndAwaitChrome(page, chrome, 1200, "true");

    const condensedBox = await chrome.boundingBox();
    expect(condensedBox).not.toBeNull();
    expect(condensedBox!.height).toBeLessThanOrEqual(100);

    // Tabs must still be tappable while condensed.
    const overviewTab = page.getByRole("button", { name: "交易" });
    await expect(overviewTab).toBeVisible();
  });

  test("記帳: desktop 1024×768 condensed row does not wrap; tabs scroll horizontally", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await enterDemoMode(page);
    await page.goto("/cash-flow");
    await page.waitForLoadState("networkidle");
    await assertServingThisWorktree(page);
    await prepareTallCashFlowPage(page);

    const chrome = page.locator(".ns-page-chrome");
    await expect(chrome).toBeVisible();

    await assertTallEnoughToScroll(page);

    await scrollAndAwaitChrome(page, chrome, 1200, "true");

    const condensedBox = await chrome.boundingBox();
    expect(condensedBox).not.toBeNull();
    expect(condensedBox!.height).toBeLessThanOrEqual(56);

    // No wrap: the tabs row must stay a single line — its own height must be
    // small (one row of buttons), not stacked into two.
    const tabsRow = page.locator(".ns-page-chrome-tabs-row");
    const tabsBox = await tabsRow.boundingBox();
    expect(tabsBox).not.toBeNull();
    expect(tabsBox!.height).toBeLessThanOrEqual(48);

    // Tabs scroll horizontally instead of wrapping: the row's scrollable
    // content is wider than its visible box.
    const [scrollWidth, clientWidth] = await tabsRow.evaluate((el) => [
      el.scrollWidth,
      el.clientWidth,
    ]);
    expect(scrollWidth).toBeGreaterThan(clientWidth);
  });
});
