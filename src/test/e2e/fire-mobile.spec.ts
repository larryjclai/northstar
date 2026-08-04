import { expect, test } from "@playwright/test";

// FIRE calculator (/goals/fire) collapses to a single column under 1024px
// (plan 291). Below that breakpoint the 340px shrink-0 sidebar + overflow-hidden
// page root used to zero out the results column's width; these assertions guard
// against that regression by measuring .ns-fire-main directly, and confirm the
// desktop two-column layout (340px sidebar) is unchanged above the breakpoint.

test.describe("mobile (390x844)", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("results column is visible, page scrolls, no horizontal overflow", async ({ page }) => {
    await page.goto("/goals/fire");
    const main = page.locator(".ns-fire-main");
    await expect(main).toBeVisible();
    const box = await main.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(300);

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth);
  });
});

test.describe("desktop (1280x800)", () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

  test("keeps the fixed 340px sidebar next to the results column", async ({ page }) => {
    await page.goto("/goals/fire");
    const sidebar = page.locator(".ns-fire-sidebar");
    await expect(sidebar).toBeVisible();
    const box = await sidebar.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.round(box!.width)).toBe(340);
  });
});
