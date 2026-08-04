import { expect, test, type Page } from "@playwright/test";

// Plan 300: the COSS 44pt hit-area expansion (Button/Toggle/Badge-as-button/
// Select trigger `::after` pseudo-element) used to key off Tailwind's
// `pointer-coarse:` variant (`@media (pointer: coarse)`). WKWebView misreports
// `pointer: coarse` on macOS Tauri desktop builds (plans 244/245) — every
// button on desktop grew an invisible 44×44 hit target, and on a genuinely
// coarse-pointer device that misreports the other way, the 44pt guarantee
// would silently vanish. This repo's mobile/desktop split is decided by
// window width (`max-width: 1023px`, matching ModalShell's gate), never
// `pointer: coarse` — so the custom `touch:` variant declared in
// `src/styles/globals.css` mirrors that width threshold instead. These tests
// assert the resulting behaviour directly off `getComputedStyle`, not the
// underlying class name, so they fail if the width threshold regresses in
// either direction.

async function dismissOnboarding(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("northstar.onboarding.dismissed.v1", "1");
  });
}

// Every measurement spec must first prove the dev server under test is
// actually serving THIS worktree's compiled CSS, not a stale main checkout
// on the same port (see plan 284 Phase B setup notes — this has burned two
// prior executors). `touch\:after\:absolute` only exists once the
// `pointer-coarse:` → `touch:` rename has landed, so it doubles as the
// worktree fingerprint for this specific change.
async function assertServingThisWorktree(page: Page) {
  const css = await page.evaluate(async () => (await fetch("/src/styles/globals.css")).text());
  expect(css, "server is NOT serving this worktree's plan-300 CSS").toMatch(
    /touch\\+:after\\+:absolute/,
  );
}

test.describe("desktop 1280×800 — no invisible hit-area", () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

  test("COSS Button's ::after is inert at desktop width", async ({ page }) => {
    await dismissOnboarding(page);
    await page.goto("/");
    await assertServingThisWorktree(page);

    const button = page.getByRole("button", { name: "更新行情" });
    await expect(button).toBeVisible();

    const after = await button.evaluate((el) => {
      const style = getComputedStyle(el, "::after");
      return { content: style.content, minHeight: style.minHeight };
    });
    // Below the 1023px threshold the `touch:` variant doesn't apply at all —
    // no pseudo-element content, so no 44px min-height either. Assert both:
    // the plan's Test plan calls for "content 為 none 或 minHeight 非 44px",
    // but on this branch (unlike the old pointer-coarse: misreport) neither
    // should ever fire on desktop, so pin down both.
    expect(after.content === "none" || after.minHeight !== "44px").toBe(true);
    expect(after.content).toBe("none");
    expect(after.minHeight).not.toBe("44px");
  });
});

test.describe("phone 390×844 — 44pt hit-area", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("COSS Button's ::after expands to 44pt at phone width", async ({ page }) => {
    await dismissOnboarding(page);
    await page.goto("/");
    await assertServingThisWorktree(page);

    const button = page.getByRole("button", { name: "更新行情" });
    await expect(button).toBeVisible();

    const after = await button.evaluate((el) => {
      const style = getComputedStyle(el, "::after");
      return { content: style.content, minHeight: style.minHeight, minWidth: style.minWidth };
    });
    expect(after.content).not.toBe("none");
    expect(after.minHeight).toBe("44px");
    expect(after.minWidth).toBe("44px");
  });
});
