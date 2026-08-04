import { expect, test, type Page } from "@playwright/test";

// Plan 302: a dozen hand-rolled (non-COSS) tap targets in QuickAdd
// (category/subcategory chips, mode toggle, example chips, preview-remediation
// chips) rendered 20–36px tall — well under the 44pt guideline — in dense
// wrapping rows, risking mis-taps onto a neighboring chip. `.ns-chip`
// (src/styles/globals.css) mirrors the COSS button's `::after` hit-area
// expansion trick (touch:after:min-h-11/min-w-11 in coss/button.tsx) for these
// raw buttons: invisible at desktop width, expands the hit area to ≥44px at
// phone width without changing the visible chip size. Separately,
// AccountFilter/AppSelect's popovers used to render at a fixed 256px, which
// could overflow a narrow phone viewport; they now clamp to
// `min(320px, 100vw - 32px)`. This spec pins both fixes.

async function dismissOnboarding(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("northstar.onboarding.dismissed.v1", "1");
  });
}

// Every measurement spec must first prove the dev server under test is
// actually serving THIS worktree's edited source, not a stale checkout on the
// same port (see plan 284 Phase B setup notes / touch-variant.spec.ts). The
// `.ns-chip` class only exists on QuickAdd's chip buttons after this plan's
// edit, so fetching the dev-transformed module and asserting it contains the
// class name proves the running server compiled the actual edited file.
async function assertServingThisWorktree(page: Page) {
  const src = await page.evaluate(async () => (await fetch("/src/components/QuickAdd.tsx")).text());
  expect(src, "server is NOT serving this worktree's plan-302 edits").toContain("ns-chip");
}

test.use({ viewport: { width: 390, height: 844 } });

test("QuickAdd 分類 chip 在 390px 視口的 ::after 命中區 ≥44px", async ({ page }) => {
  await dismissOnboarding(page);
  await page.goto("/cash-flow");
  await assertServingThisWorktree(page);

  await page.getByRole("button", { name: "快速記帳" }).click();

  const quickInput = page.getByPlaceholder(
    "記帳 · 試試「午餐 @添飯 120 信用卡」或「+ 接案 5000 富邦」",
  );
  await expect(quickInput).toBeVisible();
  await quickInput.fill("午餐 120");
  await quickInput.press("Enter");
  await expect(page.getByText("確認 · 支出")).toBeVisible();

  // First rendered .ns-chip is a category chip (分類 field renders before
  // 子分類). Don't hardcode which category the parser guesses — just assert
  // the hit-area contract on whichever chip renders first.
  const chip = page.locator(".ns-chip").first();
  await expect(chip).toBeVisible();

  const after = await chip.evaluate((el) => {
    const style = getComputedStyle(el, "::after");
    return { content: style.content, width: style.width, height: style.height };
  });
  expect(after.content).not.toBe("none");
  expect(parseFloat(after.width)).toBeGreaterThanOrEqual(44);
  expect(parseFloat(after.height)).toBeGreaterThanOrEqual(44);

  // The visible chip itself stays small (unchanged from before this plan) —
  // only the invisible ::after hit-area grew. Confirms the ::after trick
  // didn't bloat the actual pill.
  const chipBox = await chip.boundingBox();
  expect(chipBox).not.toBeNull();
  expect(chipBox!.height).toBeLessThan(40);
});

test("AccountFilter popover 在 390px 視口不超出可視寬度", async ({ page }) => {
  await dismissOnboarding(page);
  await page.goto("/cash-flow");
  await assertServingThisWorktree(page);

  await page.getByRole("button", { name: "快速記帳" }).click();

  const quickInput = page.getByPlaceholder(
    "記帳 · 試試「午餐 @添飯 120 信用卡」或「+ 接案 5000 富邦」",
  );
  await quickInput.fill("午餐 120");
  await quickInput.press("Enter");
  await expect(page.getByText("確認 · 支出")).toBeVisible();

  // The ledger confirm card's only <button className="ns-input"> is the
  // 帳戶 field's AccountFilter trigger — every other `.ns-input` element in
  // the card is a plain <input>.
  const trigger = page.locator("button.ns-input").first();
  await expect(trigger).toBeVisible();
  await trigger.click();

  const popover = page.locator('[data-slot="popover-content"]');
  await expect(popover).toBeVisible();

  const box = await popover.boundingBox();
  expect(box).not.toBeNull();
  const innerWidth = await page.evaluate(() => window.innerWidth);
  // 1px tolerance for subpixel rounding.
  expect(box!.width).toBeLessThanOrEqual(innerWidth - 32 + 1);
});
