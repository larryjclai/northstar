import { expect, test, type Page } from "@playwright/test";

// Plan 292: on a 390px-wide viewport the ledger confirm card used to keep its
// desktop two-column grid (`1fr 1fr`), squeezing the category-chip column to
// ~160px and clipping the right column against `html/body`'s
// `overflow-x: clip` — those fields were rendered but unreachable. This spec
// pins the fix: the grid collapses to a single column below 1024px
// (`.ns-quickadd-grid`, globals.css) and nothing inside the confirm card
// extends past the viewport's right edge.

test.use({ viewport: { width: 390, height: 844 } });

async function dismissOnboarding(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("northstar.onboarding.dismissed.v1", "1");
  });
}

test("記帳確認卡在 390px 視口單欄顯示、無元素超出右緣", async ({ page }) => {
  await dismissOnboarding(page);
  await page.goto("/cash-flow");

  // Mobile FAB (desktop uses the sidebar entry point instead — see AppShell.tsx).
  await page.getByRole("button", { name: "快速記帳" }).click();

  const quickInput = page.getByPlaceholder(
    "記帳 · 試試「午餐 @添飯 120 信用卡」或「+ 接案 5000 富邦」",
  );
  await expect(quickInput).toBeVisible();
  await quickInput.fill("午餐 120");
  await quickInput.press("Enter");
  await expect(page.getByText("確認 · 支出")).toBeVisible();

  const grid = page.locator(".ns-quickadd-grid").first();
  await expect(grid).toBeVisible();

  // Single column: the grid should read as close to the full card width, not a
  // squeezed ~160px half-column (the old `1fr 1fr` bug this spec regresses).
  const gridBox = await grid.boundingBox();
  expect(gridBox).not.toBeNull();
  expect(gridBox!.width).toBeGreaterThan(300);

  // Category chips must actually render (not just exist off-screen).
  await expect(page.getByRole("button", { name: "餐飲" })).toBeVisible();

  // Nothing inside the confirm card should overflow the viewport's right edge —
  // the historical failure mode was html/body's `overflow-x: clip` silently
  // eating the right column, making fields present in the DOM but untappable.
  const viewportWidth = 390;
  const overflowing = await page.evaluate((vw) => {
    const card = document.querySelector('[data-slot="card"]');
    if (!card) return ["confirm card not found"];
    const nodes = card.querySelectorAll("*");
    const offenders: string[] = [];
    nodes.forEach((node) => {
      const rect = node.getBoundingClientRect();
      if (rect.width > 0 && rect.right > vw + 1) {
        offenders.push(`${node.tagName}.${Array.from(node.classList).join(".")}`);
      }
    });
    return offenders;
  }, viewportWidth);
  expect(overflowing).toEqual([]);
});
