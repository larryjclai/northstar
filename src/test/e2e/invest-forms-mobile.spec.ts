import { expect, test, type Page } from "@playwright/test";

// Plan 298: 投資輸入表單手機版. On narrow viewports the 新增交易 sheet's three
// numeric columns (股數/每股價格/手續費) used to be squeezed to ~80px each via a
// fixed `gridTemplateColumns: "repeat(3, minmax(0, 1fr))"` — readable at desktop
// widths but not on a 390px phone. `.ns-form-row-3` collapses to `auto-fit,
// minmax(140px, 1fr)` under 1024px so columns wrap instead of shrinking below a
// readable width. 編輯持倉 (HoldingEditModal) is a `variant="center"` modal that
// now opts into `mobilePresentation="bottom-sheet"` so it renders as a proper
// bottom sheet (not a center dialog pinned to a 16px gap) below 1024px.

async function dismissOnboarding(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("northstar.onboarding.dismissed.v1", "1");
  });
}

/** Load the built-in demo dataset (accounts + holdings) via the Dashboard's
 *  empty-state "載入示範資料" button, so /investments has real positions to
 *  open 新增交易 / 編輯持倉 against. */
async function loadDemoData(page: Page) {
  await page.goto("/");
  const demoButton = page.getByRole("button", { name: "載入示範資料" });
  await expect(demoButton).toBeVisible();
  await demoButton.click();
  await expect(page.getByText("已進入示範模式")).toBeVisible({ timeout: 15_000 });
}

async function openAddTransactionSheet(page: Page) {
  await page.goto("/investments");
  await expect(page.getByRole("heading", { name: "投資", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "新增交易" }).click();
  await expect(page.locator(".ns-overlay-panel")).toBeVisible();
  // Default action is "buy" (emptyTransactionDraft), which renders the
  // 股數/每股價格/手續費 three-column row directly — no side-tab click needed.
  await expect(page.locator(".ns-form-row-3")).toBeVisible();
}

/** Open HoldingEditModal via the holding-detail page's 編輯持倉 button, using
 *  the demo dataset's "VOO" position (data/demoData.ts). The 持倉 table's
 *  interaction pattern differs by width — below Tailwind's `sm` (640px) it's
 *  a card list that navigates straight to the detail page on tap, at `sm`+ it's
 *  an expandable grid row — so going through the detail page directly keeps
 *  this helper identical (and reliable) at both the 390px and 1280px specs
 *  below, instead of branching on which holdings-table layout is visible. */
async function openHoldingEditModal(page: Page) {
  await page.goto("/holdings/VOO");
  await page.getByRole("button", { name: "編輯持倉" }).click();
  await expect(page.locator(".ns-overlay-panel")).toBeVisible();
}

test.describe("390×844 — 新增交易 number columns stay readable, no form overflow", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("quantity/price/fee inputs are wide enough and the form body doesn't scroll horizontally", async ({
    page,
  }) => {
    await dismissOnboarding(page);
    await loadDemoData(page);
    await openAddTransactionSheet(page);

    const numberInputs = page.locator(".ns-form-row-3 input");
    await expect(numberInputs).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      const box = await numberInputs.nth(i).boundingBox();
      expect(box, `input ${i} has a bounding box`).not.toBeNull();
      expect(box!.width, `input ${i} width`).toBeGreaterThanOrEqual(116);
    }

    // The scrollable form body is the flex column with inline overflow:auto
    // wrapping the ticker/date/amount fields (InvestmentsAddSheet.tsx).
    const formBody = page.locator('.ns-overlay-panel [style*="overflow: auto"]').first();
    const { scrollWidth, clientWidth, scrollLeft } = await formBody.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      scrollLeft: el.scrollLeft,
    }));
    expect(scrollLeft).toBe(0);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test("編輯持倉 renders as a bottom sheet", async ({ page }) => {
    await dismissOnboarding(page);
    await loadDemoData(page);
    await openHoldingEditModal(page);

    const panel = page.locator(".ns-overlay-panel");
    await expect(panel).toHaveClass(/ns-sheet-bottom/);
  });
});

test.describe("1280×800 — desktop layout unchanged", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("quantity/price/fee columns stay side by side", async ({ page }) => {
    await dismissOnboarding(page);
    await loadDemoData(page);
    await openAddTransactionSheet(page);

    const numberInputs = page.locator(".ns-form-row-3 input");
    await expect(numberInputs).toHaveCount(3);
    // Measure all three in ONE evaluate. Three separate boundingBox() calls are
    // three browser round-trips, and the drawer enters on `transform:
    // translateX(28px) → 0` over 220ms (globals.css `[data-motion="drawer"]`) —
    // so each call can land on a different animation frame. The residual
    // translate differs between frames but is identical for all elements within
    // one frame, which is exactly what these relative assertions need. This
    // failed once in CI at 959.93 vs an expected ≥ 962 — a ~2px frame-to-frame
    // translate delta, on a tree whose previous run was green.
    await expect(async () => {
      const boxes = await numberInputs.evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width };
        }),
      );
      expect(boxes).toHaveLength(3);
      // Same row: all three inputs share (approximately) the same top offset.
      const tops = boxes.map((b) => b.y);
      expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(2);
      // Side by side: each input starts to the right of the previous one's end.
      expect(boxes[1].x).toBeGreaterThanOrEqual(boxes[0].x + boxes[0].width);
      expect(boxes[2].x).toBeGreaterThanOrEqual(boxes[1].x + boxes[1].width);
    }).toPass();
  });

  test("編輯持倉 stays a center modal (not a bottom sheet)", async ({ page }) => {
    await dismissOnboarding(page);
    await loadDemoData(page);
    await openHoldingEditModal(page);

    const panel = page.locator(".ns-overlay-panel");
    await expect(panel).not.toHaveClass(/ns-sheet-bottom/);
    await expect(panel).toHaveClass(/max-w-2xl/);
  });
});
