import { expect, test } from "@playwright/test";

// The overview renders its empty state without any data or network, so these
// two cases need no fixtures — they measure the page shell, not the content.
async function pageShellWidth(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("northstar.onboarding.dismissed.v1", "1");
  });
  await page.goto("/");
  const shell = await page.locator(".ns-page").first().boundingBox();
  expect(shell).not.toBeNull();
  return shell!.width;
}

test.describe("wide desktop", () => {
  test.use({ viewport: { width: 2560, height: 1440 }, isMobile: false, hasTouch: false });

  test("content grows to the 1920 ceiling instead of sitting at 1180", async ({ page }) => {
    const width = await pageShellWidth(page);
    expect(width).toBeGreaterThan(1900);
    expect(width).toBeLessThanOrEqual(1920);
  });
});

test.describe("laptop", () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

  // Below the ceiling the shell must fill its column exactly — no gutters, and
  // no regression from the old 1180 behaviour (which was already full-bleed here).
  test("fills the main column edge to edge", async ({ page }) => {
    const width = await pageShellWidth(page);
    const main = await page.locator("main.ns-app-main").boundingBox();
    expect(main).not.toBeNull();
    expect(Math.abs(width - main!.width)).toBeLessThanOrEqual(1);
  });
});
