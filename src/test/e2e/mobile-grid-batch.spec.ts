import { expect, test, type Page } from "@playwright/test";

// Plan 297: four independent fixed-column-grid/unshrinkable-flex spots that
// squeezed content on a 390px phone — Reconcile's 3-stat summary, Categories
// tab's 3-stat summary, the Names/Merchants settings tables, and the sync
// conflict row. Each fix swapped a fixed grid-template-columns (or, for the
// conflict row, an unshrinkable flex cluster) for an auto-fit/collapsing
// pattern already used correctly elsewhere in the same file family.

async function dismissOnboarding(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("northstar.onboarding.dismissed.v1", "1");
  });
}

// Every measurement spec must first prove the dev server under test is
// actually serving THIS worktree, not a stale checkout on the same port
// (see plan 284 Phase B setup notes / project_worktree_devserver_trap memory
// — this has burned prior executors before).
async function assertServingThisWorktree(page: Page) {
  const css = await page.evaluate(async () => (await fetch("/src/styles/globals.css")).text());
  expect(css, "server is NOT serving this worktree").toContain("ns-conflict-row");
}

// Loads demo data so Categories/Names/Reconcile all have real rows to render.
async function enterDemoMode(page: Page) {
  await page.goto("/settings?tab=general");
  const enterButton = page.getByRole("button", { name: "進入示範模式" });
  await enterButton.click();
  await expect(page.getByText("目前在示範模式。")).toBeVisible({ timeout: 15_000 });
  // Seeding continues asynchronously (React Query refetch) after the
  // confirmation text appears — give it time to populate the ledger/account
  // lists before navigating, or the target route measures a half-seeded page.
  await page.waitForTimeout(7_000);
}

test.describe("mobile grid/flex collapse — plan 297", () => {
  test.describe.configure({ timeout: 60_000 });

  test.beforeEach(async ({ page }) => {
    await dismissOnboarding(page);
  });

  test.describe("phone 390×844", () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

    test("記帳 → 分類分頁摘要卡不溢出", async ({ page }) => {
      await enterDemoMode(page);
      await page.goto("/cash-flow");
      await page.waitForLoadState("networkidle");
      await assertServingThisWorktree(page);

      await page.getByRole("button", { name: "分類", exact: true }).click();

      // Top summary cards render inside the tab body — grab every Card at the
      // top of the 分類 tab and assert none overflows the 390px viewport.
      const summaryCards = page.locator("div.grid.gap-5 > *");
      const count = await summaryCards.count();
      expect(count).toBeGreaterThan(0);
      for (let i = 0; i < count; i++) {
        const box = await summaryCards.nth(i).boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(390 + 1);
      }
    });

    test("設定 → 名稱表：名稱欄寬 > 內容寬 50%、無溢出、最後使用欄隱藏", async ({ page }) => {
      await enterDemoMode(page);
      await page.goto("/settings?tab=names");
      await page.waitForLoadState("networkidle");
      await assertServingThisWorktree(page);

      const head = page.locator(".ns-settings-names-head");
      await expect(head).toBeVisible();
      const headBox = await head.boundingBox();
      expect(headBox).not.toBeNull();
      expect(headBox!.x + headBox!.width).toBeLessThanOrEqual(390 + 1);

      // The 最後使用 column is hidden on mobile (globals.css mobile override) —
      // both header and row copies of it must be gone from layout.
      const lastUsedCells = page.locator(".ns-settings-names-lastused");
      const lastUsedCount = await lastUsedCells.count();
      for (let i = 0; i < lastUsedCount; i++) {
        await expect(lastUsedCells.nth(i)).not.toBeVisible();
      }

      // First data row: the name column (first cell) should take up the
      // majority of the row's width, not be squeezed to a sliver.
      const firstRow = page.locator(".ns-settings-names-row").first();
      await expect(firstRow).toBeVisible();
      const rowBox = await firstRow.boundingBox();
      expect(rowBox).not.toBeNull();
      expect(rowBox!.x + rowBox!.width).toBeLessThanOrEqual(390 + 1);

      const nameCell = firstRow.locator("> :first-child");
      const nameBox = await nameCell.boundingBox();
      expect(nameBox).not.toBeNull();
      expect(nameBox!.width).toBeGreaterThan(rowBox!.width * 0.5);
    });

    test("帳戶 → 對帳頁摘要卡三卡不溢出（若 demo 資料無信用卡帳戶則略過）", async ({ page }) => {
      await enterDemoMode(page);
      await page.goto("/accounts");
      await page.waitForLoadState("networkidle");
      await assertServingThisWorktree(page);

      const reconcileButton = page.getByTitle("對帳").first();
      const hasReconcile = (await reconcileButton.count()) > 0;
      test.skip(
        !hasReconcile,
        "demo 資料未生成信用卡帳戶，無法進入對帳頁 — 已改由分類分頁與名稱表覆蓋 mobile 溢出斷言",
      );

      await reconcileButton.click();
      await page.waitForLoadState("networkidle");
      await expect(page.getByText("本期消費")).toBeVisible();

      const summaryCards = page.locator(
        "div.p-4:has-text('本期消費'), div.p-4:has-text('已核對'), div.p-4:has-text('未核對')",
      );
      const count = await summaryCards.count();
      expect(count).toBeGreaterThan(0);
      for (let i = 0; i < count; i++) {
        const box = await summaryCards.nth(i).boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x + box!.width).toBeLessThanOrEqual(390 + 1);
      }
    });
  });

  test.describe("desktop 1280×800", () => {
    test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

    test("記帳 → 分類分頁摘要卡在桌機維持三欄同列", async ({ page }) => {
      await enterDemoMode(page);
      await page.goto("/cash-flow");
      await page.waitForLoadState("networkidle");
      await assertServingThisWorktree(page);

      await page.getByRole("button", { name: "分類", exact: true }).click();

      const summaryCards = page.locator("div.grid.gap-5 > *");
      const count = await summaryCards.count();
      expect(count).toBeGreaterThanOrEqual(3);
      const firstBox = await summaryCards.nth(0).boundingBox();
      const secondBox = await summaryCards.nth(1).boundingBox();
      expect(firstBox).not.toBeNull();
      expect(secondBox).not.toBeNull();
      // Same row: roughly equal y, and the second card sits to the right of
      // the first rather than stacked below it.
      expect(Math.abs(firstBox!.y - secondBox!.y)).toBeLessThanOrEqual(2);
      expect(secondBox!.x).toBeGreaterThan(firstBox!.x);
    });

    test("設定 → 名稱表在桌機維持原本欄寬（未被 mobile override 影響）", async ({ page }) => {
      await enterDemoMode(page);
      await page.goto("/settings?tab=names");
      await page.waitForLoadState("networkidle");
      await assertServingThisWorktree(page);

      const lastUsedHeader = page.locator(".ns-settings-names-head .ns-settings-names-lastused");
      await expect(lastUsedHeader).toBeVisible();
    });
  });
});
