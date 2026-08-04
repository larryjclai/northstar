import { expect, test, type Page } from "@playwright/test";

// Plan 299 — two independent, self-contained mobile overlay regressions:
//
// 1. CategoryManagementDrawer passes panelStyle.maxWidth:400 (sized for a
//    right-docked desktop drawer). Before the fix, ModalShell's bottom-sheet
//    mode stripped position/top/right/bottom/left/width but NOT maxWidth, so
//    on a 428px-wide phone the sheet rendered 400px wide flush-left instead
//    of spanning the full viewport, leaving a ~30px scrim gap on the right.
//
// 2. Onboarding step 1's CSV field-mapping chips used
//    repeat(5, minmax(0, 1fr)), which let each chip shrink below its
//    intrinsic content width on a 390px phone — "Account"/"Category"
//    overflowed their chip and bled into the neighbor.
//
// Each test seeds its own state (localStorage dismiss flag / demo data) so
// neither depends on the other test or on suite ordering.

async function dismissOnboarding(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("northstar.onboarding.dismissed.v1", "1");
  });
}

test.describe("CategoryManagementDrawer bottom-sheet width (plan 299 / step 1)", () => {
  test.use({ viewport: { width: 428, height: 926 }, isMobile: true, hasTouch: true });

  test("sheet spans the full viewport width — no scrim gap from a stale maxWidth", async ({
    page,
  }) => {
    await dismissOnboarding(page);
    await page.goto("/cash-flow");
    await page.getByRole("button", { name: "分類", exact: true }).click();
    await page.getByRole("button", { name: "分類設定" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveClass(/ns-sheet-bottom/);

    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    // Full-bleed: left edge at 0, right edge at the viewport width — not
    // clamped to the old maxWidth:400 call-site value.
    expect(box!.x).toBeCloseTo(0, 0);
    expect(box!.width).toBeGreaterThan(420);
    expect(box!.width).toBeCloseTo(428, 0);
  });
});

test.describe("Onboarding step-1 CSV field chips (plan 299 / step 2)", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("chip labels wrap instead of overflowing their container on a 390px phone", async ({
    page,
  }) => {
    // Fresh profile: onboarding auto-opens at step 0 (no data yet).
    await page.goto("/");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Load demo data from step 0 so hasAnyData becomes true.
    await page.getByRole("button", { name: "先用示範資料逛逛" }).click();
    await expect(page.getByText("已載入示範資料")).toBeVisible({ timeout: 15_000 });

    // Close, then reopen via the same public event onboarding's trigger uses
    // (openOnboarding()) — with data present this lands directly on step 1,
    // the CSV field-mapping preview with the chip row under test.
    await page.getByRole("button", { name: "關閉導覽" }).click();
    await expect(dialog).toHaveCount(0);
    await page.evaluate(() => {
      window.dispatchEvent(new Event("northstar:open-onboarding"));
    });
    await expect(dialog).toBeVisible();
    // Step indicator confirms we landed on step index 1 (current = step + 1).
    // Two copies render: a desktop-rail one (hidden below `sm`) and a
    // mobile-only one (`sm:hidden`) — on this 390px viewport only the latter
    // is visible.
    await expect(page.getByText("步驟 2 ，共 4 個步驟").last()).toBeVisible();

    const chips = page.getByTestId("onboarding-csv-chips");
    await expect(chips).toBeVisible();
    const overflow = await chips.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    // Each chip's rendered box must stay within the grid container's bounds
    // (ellipsis-clipped text is fine and expected; a chip visually bleeding
    // past its own box into the neighbor's is the regression).
    const containerBox = await chips.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right };
    });
    const chipBoxes = await chips.evaluate((el) =>
      Array.from(el.children).map((child) => {
        const r = child.getBoundingClientRect();
        return { left: r.left, right: r.right };
      }),
    );
    for (const box of chipBoxes) {
      expect(box.left).toBeGreaterThanOrEqual(containerBox.left - 1);
      expect(box.right).toBeLessThanOrEqual(containerBox.right + 1);
    }
  });
});
