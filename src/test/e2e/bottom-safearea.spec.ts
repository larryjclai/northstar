import { expect, test, type Page } from "@playwright/test";

// Plan 293 (revised — operator decision B, 2026-08-04: match iOS-native design
// language, mobile toasts become TOP banners instead of hovering above the
// bottom dock). This replaces the plan's original bottom-of-dock approach,
// which the executor's manual verification caught overlapping the Quick-Add
// FAB (src/components/AppShell.tsx) at 390px — both shared the same
// `bottom-[calc(5rem+env(safe-area-inset-bottom))]` expression.
//
// What's under test:
// - src/components/Toast.tsx `ToastViewport` className: mobile branch is now
//   a top banner (`top-[calc(env(safe-area-inset-top,0px)+8px)]`); the ≥1024px
//   desktop branch is unchanged from before this plan (bottom-right).
// - src/routes/CashFlowRoute.tsx EntryDrawer footer padding-bottom safe-area
//   is covered by the `build`/grep done-criteria, not by this spec.

async function dismissOnboarding(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("northstar.onboarding.dismissed.v1", "1");
  });
}

// Every measurement spec must first prove the dev server under test is
// actually serving THIS worktree, not a stale checkout on the same port
// (see plan 284/293 setup notes — this has burned prior executors).
async function assertServingThisWorktree(page: Page) {
  const src = await page.evaluate(async () => (await fetch("/src/components/Toast.tsx")).text());
  expect(src, "server is NOT serving this worktree's Toast.tsx").toContain(
    "top-[calc(env(safe-area-inset-top",
  );
}

// Loads demo data so an account exists to import transactions against.
// Demo seeding stashes any existing data and takes a few seconds to populate
// (see sticky-chrome.spec.ts, same helper).
async function enterDemoMode(page: Page) {
  await page.goto("/settings?tab=general");
  await page.getByRole("button", { name: "進入示範模式" }).click();
  await expect(page.getByText("目前在示範模式。")).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(7_000);
}

// Triggers a real toast.success("成功匯入 …") the same way sticky-chrome.spec.ts
// exercises the CSV import path — a one-row import against an account
// demoData.ts always seeds. This is preferred over driving the EntryDrawer's
// category-chip / suggested-account UI directly, which has no stable test
// hooks and would make the toast-position assertions below flaky for reasons
// unrelated to what this spec verifies (toast viewport placement).
async function saveTransactionViaImport(page: Page) {
  await page.goto("/cash-flow");
  await page.waitForLoadState("networkidle");
  const header =
    "date,account,name,entryType,settlementStatus,amount,currency,category,subcategory,merchant";
  const row = `${new Date().toISOString().slice(0, 10)},國泰世華 數位帳戶,bottom-safearea e2e,expense,cleared,-42,TWD,餐飲,,e2e`;
  await page.setInputFiles('input[type="file"]', {
    name: "bottom-safearea-seed.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(`${header}\n${row}`, "utf-8"),
  });
  await expect(page.getByText("1 valid")).toBeVisible();
  await page.getByRole("button", { name: "確認匯入" }).click();
  await expect(page.getByText("成功匯入 1 筆資料")).toBeVisible();
}

async function toastViewportRect(page: Page) {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="toast-viewport"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
  });
}

async function dockTop(page: Page) {
  return page.evaluate(() => {
    const el = document.querySelector(".ns-mobile-dock");
    return el ? el.getBoundingClientRect().top : null;
  });
}

test.describe("bottom safe-area — toast viewport (plan 293)", () => {
  // Demo seeding + CSV import is genuinely slow (~7s fixed wait alone); give
  // both tests headroom on a slow CI runner rather than the 30s default.
  test.describe.configure({ mode: "serial", timeout: 60_000 });

  test.beforeEach(async ({ page }) => {
    await dismissOnboarding(page);
  });

  test.describe("mobile 390×844", () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

    test("toast becomes a top banner and never overlaps the mobile dock", async ({ page }) => {
      await enterDemoMode(page);
      await assertServingThisWorktree(page);
      await saveTransactionViaImport(page);

      const rect = await toastViewportRect(page);
      expect(rect, "toast viewport should be present after a successful import").not.toBeNull();
      // top-[calc(env(safe-area-inset-top,0px)+8px)]; env() resolves to 0 in a
      // plain browser, so this should land at (or very near) 8px.
      expect(rect!.top).toBeLessThan(100);

      const dTop = await dockTop(page);
      expect(dTop, ".ns-mobile-dock should exist in the mobile layout").not.toBeNull();
      expect(rect!.bottom).toBeLessThan(dTop!);
    });
  });

  test.describe("desktop 1280×800", () => {
    test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

    test("toast viewport keeps its original bottom-right position", async ({ page }) => {
      await enterDemoMode(page);
      await assertServingThisWorktree(page);
      await saveTransactionViaImport(page);

      const rect = await toastViewportRect(page);
      expect(rect, "toast viewport should be present after a successful import").not.toBeNull();
      // Unchanged desktop behaviour: lg:right-6 / lg:bottom-6 (24px insets).
      expect(1280 - rect!.right).toBeLessThan(40);
      expect(800 - rect!.bottom).toBeLessThan(40);
      // And nowhere near the mobile top-banner position.
      expect(rect!.top).toBeGreaterThan(400);
    });
  });
});
