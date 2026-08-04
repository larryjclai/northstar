import { expect, test } from "@playwright/test";

// Plan 289: iOS status-bar scrim. `.ns-statusbar-scrim` is a fixed, static
// element sized to `env(safe-area-inset-top, 0px)` so scrolling content
// passes under the system clock/battery icons on iOS instead of overlapping
// them. In a browser (no safe-area inset) that env() resolves to 0px, so the
// scrim must render with zero height — this guards against someone later
// giving it a fixed height and causing a visual regression on desktop/Android
// where there is no top inset to cover.

test.describe("status-bar scrim (plan 289)", () => {
  test("renders with zero height when there is no safe-area top inset", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const scrim = page.locator(".ns-statusbar-scrim");
    await expect(scrim).toBeAttached();

    const height = await scrim.evaluate((el) => el.getBoundingClientRect().height);
    expect(height).toBe(0);
  });
});
