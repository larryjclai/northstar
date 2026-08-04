import { expect, test, type Page } from "@playwright/test";

// Plan 287: two fixed-pixel-width overlays overflowed the viewport on phone
// widths — the Connect 同步 pairing dialog (`Card` was `width: 480`) and the
// 交易詳情 drawer (`panelStyle` was `width: 460`). Both now opt into
// `mobilePresentation="bottom-sheet"` on ModalShell, which only strips the
// call site's positional `panelStyle` keys automatically — the pairing
// dialog's fixed-width `Card` (a child, not `panelStyle`) had to be capped
// separately at `min(480px, 100%)`. These tests assert the rendered panel's
// bounding box never exceeds the viewport at phone width, and that desktop
// presentation (centered 480px card / right-docked 460px drawer) is
// unchanged.

async function dismissOnboarding(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("northstar.onboarding.dismissed.v1", "1");
  });
}

// Every measurement spec must first prove the dev server under test is
// actually serving THIS worktree's edited source, not a stale checkout on
// the same port (see plan 284 Phase B setup notes / sticky-chrome.spec.ts).
// Fetching the dev-transformed ConnectSection module and asserting it
// contains `mobilePresentation` is a stronger fingerprint than a generic CSS
// class check here — that prop only exists on the pairing dialog's
// `ModalShell` call site after this plan's fix, so it proves the running
// server is compiling the actual edited file rather than another checkout.
async function assertServingThisWorktree(page: Page) {
  const src = await page.evaluate(async () =>
    (await fetch("/src/routes/settings/ConnectSection.tsx")).text(),
  );
  expect(src, "server is NOT serving this worktree's plan-287 edits").toContain(
    "mobilePresentation",
  );
}

async function enterDemoMode(page: Page) {
  await page.goto("/settings?tab=general");
  const enterButton = page.getByRole("button", { name: "進入示範模式" });
  await enterButton.click();
  await expect(page.getByText("目前在示範模式。")).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(7_000);
}

// A bounding box is only meaningful once the resting layout exists, and two
// separate things can make an early read lie — both of which only bit under
// parallel CI workers:
//
//   1. ModalShell's enter motion (`.ns-overlay-panel[data-motion]`) interpolates
//      transform/opacity over ~260ms, and the center variant's scale-in nudges
//      the box width mid-transition.
//   2. The Vite dev server injects CSS through JS. Under a cold-start storm the
//      panel can mount a frame before its stylesheet lands, so an unstyled
//      `.ns-sheet-bottom` misses `max-height: min(92dvh, 100%)` and measures its
//      full content height instead (observed in CI: 1566px against an 844px
//      viewport). `toHaveClass(/ns-sheet-bottom/)` passes here — the class is on
//      the element; it's the rule that hasn't applied.
//
// A fixed delay only ever covered (1). No constant covers (2): under load the
// injection can land past any value we'd pick, and padding the delay slows every
// run to chase the worst case. Polling until the assertion actually holds covers
// both and costs nothing once the layout has settled.
const SETTLE_TIMEOUT_MS = 10_000;

/** Retry `assertion` until it holds against a settled layout (see above). */
async function expectOnSettledLayout(assertion: () => Promise<void>) {
  await expect(assertion).toPass({ timeout: SETTLE_TIMEOUT_MS });
}

// Asserts a locator's rendered box is fully inside the current viewport
// (left/top >= 0, right/bottom <= viewport dimensions).
async function assertWithinViewport(page: Page, locator: ReturnType<Page["locator"]>) {
  const viewport = page.viewportSize();
  expect(viewport, "page has no viewport size").not.toBeNull();
  await expectOnSettledLayout(async () => {
    const box = await locator.boundingBox();
    expect(box, "target element has no bounding box (not visible?)").not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 0.5);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height + 0.5);
  });
}

test.describe("mobile overlays fit viewport width (plan 287)", () => {
  test.beforeEach(async ({ page }) => {
    await dismissOnboarding(page);
  });

  test.describe("phone 390×844", () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

    test("Connect 同步 配對 dialog renders as a bottom sheet within viewport width", async ({
      page,
    }) => {
      await page.goto("/settings?tab=general");
      await assertServingThisWorktree(page);

      const joinButton = page.getByRole("button", { name: "以配對碼加入現有裝置" });
      // This button is disabled unless the build has a sync worker endpoint
      // configured (VITE_NORTHSTAR_SYNC_WORKER_URL) — CI's playwright.config.ts
      // webServer does not set it, so the pairing dialog cannot open there.
      // Probe runtime state (not process.env: a dev's local .env can enable
      // the server without the test runner itself seeing the var) and skip
      // rather than fail when unconfigured. The 交易詳情 drawer test below
      // covers plan 287's ModalShell bottom-sheet change unconditionally, so
      // this environment gap doesn't leave the fix unverified in CI.
      const configured = await joinButton.isEnabled({ timeout: 3_000 }).catch(() => false);
      test.skip(
        !configured,
        "sync worker not configured (VITE_NORTHSTAR_SYNC_WORKER_URL unset) — pairing dialog cannot open in this environment",
      );
      await joinButton.click();

      const dialog = page.getByRole("dialog", { name: "加入現有裝置" });
      await expect(dialog).toBeVisible();

      // Bottom-sheet presentation must actually be active on this viewport —
      // otherwise the width assertion below would pass vacuously against the
      // desktop centered-card layout instead of proving the mobile fix.
      await expect(dialog).toHaveClass(/ns-sheet-bottom/);

      // The full, untruncated title must be present — the original bug
      // clipped it to "入現有裝置" because the card overflowed left of 0.
      await expect(dialog.getByRole("heading", { name: "加入現有裝置" })).toBeVisible();

      await assertWithinViewport(page, dialog);
    });

    test("交易詳情 drawer renders as a bottom sheet within viewport width", async ({ page }) => {
      await enterDemoMode(page);
      // No `networkidle` wait: against the Vite dev server it is unreliable in
      // both directions (the HMR socket and on-demand transform requests keep
      // traffic trickling under parallel load). The web-first row assertion
      // below is the real readiness signal.
      await page.goto("/cash-flow");
      await assertServingThisWorktree(page);

      const firstRow = page.locator(".ns-cf-row").first();
      await expect(firstRow).toBeVisible({ timeout: 15_000 });
      await firstRow.click();

      const dialog = page.getByRole("dialog", { name: "交易詳情" });
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveClass(/ns-sheet-bottom/);

      await assertWithinViewport(page, dialog);
    });
  });

  test.describe("desktop 1280×800", () => {
    test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

    test("Connect 同步 配對 dialog stays a centered 480px card on desktop", async ({ page }) => {
      await page.goto("/settings?tab=general");
      await assertServingThisWorktree(page);

      const joinButton = page.getByRole("button", { name: "以配對碼加入現有裝置" });
      // See the matching skip in the phone describe block above for why:
      // CI has no VITE_NORTHSTAR_SYNC_WORKER_URL, so this button stays
      // disabled and the pairing dialog can't be exercised there.
      const configured = await joinButton.isEnabled({ timeout: 3_000 }).catch(() => false);
      test.skip(
        !configured,
        "sync worker not configured (VITE_NORTHSTAR_SYNC_WORKER_URL unset) — pairing dialog cannot open in this environment",
      );
      await joinButton.click();

      const dialog = page.getByRole("dialog", { name: "加入現有裝置" });
      await expect(dialog).toBeVisible();
      const className = await dialog.getAttribute("class");
      expect(className ?? "").not.toContain("ns-sheet-bottom");

      const card = dialog.locator(":scope > div").first();
      await expectOnSettledLayout(async () => {
        const box = await card.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.width).toBeCloseTo(480, 0);
      });
    });

    test("交易詳情 drawer stays a right-docked 460px panel on desktop", async ({ page }) => {
      await enterDemoMode(page);
      // No `networkidle` wait: against the Vite dev server it is unreliable in
      // both directions (the HMR socket and on-demand transform requests keep
      // traffic trickling under parallel load). The web-first row assertion
      // below is the real readiness signal.
      await page.goto("/cash-flow");
      await assertServingThisWorktree(page);

      const firstRow = page.locator(".ns-cf-row").first();
      await expect(firstRow).toBeVisible({ timeout: 15_000 });
      await firstRow.click();

      const dialog = page.getByRole("dialog", { name: "交易詳情" });
      await expect(dialog).toBeVisible();
      const className = await dialog.getAttribute("class");
      expect(className ?? "").not.toContain("ns-sheet-bottom");

      const viewport = page.viewportSize();
      expect(viewport).not.toBeNull();
      await expectOnSettledLayout(async () => {
        const box = await dialog.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.width).toBeCloseTo(460, 0);
        expect(box!.x + box!.width).toBeCloseTo(viewport!.width, 0);
      });
    });
  });
});
