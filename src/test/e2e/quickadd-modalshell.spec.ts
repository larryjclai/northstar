import { expect, test, type Page } from "@playwright/test";

// Plan 301: QuickAdd migrated from a hand-rolled `fixed inset-0` overlay to
// the shared <ModalShell> (DESIGN.md §6.4). This spec is self-contained and
// covers the parts of the behavior matrix that need a real browser:
//
//   1. Mobile (390px): bottom-sheet presentation + drag handle present.
//   2. The Escape-layering regression this migration originally exposed and
//      that plan 305's macrotask fix (ModalShell.tsx) resolves — Escape with
//      a nested SuggestInput dropdown open must close ONLY the dropdown on
//      the first press, and the whole overlay on the second. This is now a
//      permanent regression test, not just a manual verification step.
//   3. AccountFilter's Base UI popover (portals to document.body, so it sits
//      outside ModalShell's own DOM-descendant focus trap by construction) —
//      Escape inside the popover must close only the popover, not QuickAdd.
//   4. Desktop (1280px): no bottom-sheet class, and the panel keeps the
//      pre-migration bottom-anchored, sidebar-aware, centered position
//      (Step 1's `variant="sheet"` + self-positioned `panelStyle` choice).

async function dismissOnboarding(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("northstar.onboarding.dismissed.v1", "1");
  });
}

// Every measurement spec must first prove the dev server under test is
// actually serving THIS worktree's edited source (plan 284 / mobile-overlays
// spec precedent) — fetching the dev-transformed QuickAdd module and
// asserting it imports ModalShell is a stronger fingerprint than a generic
// CSS class check, since that import only exists on this migration's edit.
async function assertServingThisWorktree(page: Page) {
  const src = await page.evaluate(async () => (await fetch("/src/components/QuickAdd.tsx")).text());
  // Vite's dev transform rewrites the relative import to an absolute path, so
  // match on the module specifier's resolved form rather than the source text.
  expect(src, "server is NOT serving this worktree's plan-301 edits").toContain(
    "components/ModalShell.tsx",
  );
}

async function openQuickAdd(page: Page) {
  await page.getByRole("button", { name: "快速記帳" }).first().click();
  const dialog = page.getByRole("dialog", { name: "快速記帳" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function parseToConfirmCard(page: Page, dialog: ReturnType<Page["getByRole"]>) {
  const quickInput = page.getByPlaceholder(
    "記帳 · 試試「午餐 @添飯 120 信用卡」或「+ 接案 5000 富邦」",
  );
  await quickInput.fill("晚餐 200");
  await dialog.getByRole("button", { name: "解析" }).click();
  await expect(page.getByText("確認 · 支出")).toBeVisible();
}

test.describe("QuickAdd mobile bottom-sheet presentation (plan 301)", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("opens as a bottom sheet with a drag handle", async ({ page }) => {
    await dismissOnboarding(page);
    await page.goto("/cash-flow");
    await assertServingThisWorktree(page);

    const dialog = await openQuickAdd(page);
    await expect(dialog).toHaveClass(/ns-sheet-bottom/);
    await expect(dialog.locator(".ns-sheet-grab")).toBeVisible();
    await expect(dialog.locator(".ns-sheet-handle")).toBeVisible();
  });
});

test.describe("QuickAdd Escape layering (plan 301 / plan 305 macrotask fix)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("first Escape closes only the SuggestInput dropdown; second Escape closes QuickAdd", async ({
    page,
  }) => {
    await dismissOnboarding(page);
    await page.goto("/cash-flow");
    await assertServingThisWorktree(page);

    const dialog = await openQuickAdd(page);
    await parseToConfirmCard(page, dialog);

    // Default settings seed a few merchants (全家, 7-ELEVEN, Uber, ...) — no
    // ledger history or accounts required to make the 商家 suggestion
    // dropdown appear, keeping this test self-contained.
    const merchantInput = dialog.getByPlaceholder("選填");
    await merchantInput.click();
    await merchantInput.fill("全");

    const listbox = page.getByRole("listbox");
    await expect(listbox).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog, "QuickAdd must stay open after the first Escape").toBeVisible();
    await expect(
      listbox,
      "the suggestion dropdown must close on the first Escape",
    ).not.toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog, "the second Escape closes QuickAdd").not.toBeVisible();
  });
});

test.describe("QuickAdd AccountFilter popover isolation (plan 301)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("Escape inside the account popover closes only the popover, not QuickAdd", async ({
    page,
  }) => {
    await dismissOnboarding(page);
    await page.goto("/cash-flow");
    await assertServingThisWorktree(page);

    const dialog = await openQuickAdd(page);
    await parseToConfirmCard(page, dialog);

    await dialog.getByRole("button", { name: "選擇帳戶" }).click();
    const searchInput = page.getByPlaceholder("搜尋帳戶…");
    await expect(searchInput).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(searchInput, "the popover must close on Escape").not.toBeVisible();
    await expect(dialog, "QuickAdd must stay open — the popover owns its own Escape").toBeVisible();
  });
});

test.describe("QuickAdd desktop parity (plan 301)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("no bottom-sheet class; panel is bottom-anchored, centered right of the sidebar", async ({
    page,
  }) => {
    await dismissOnboarding(page);
    await page.goto("/cash-flow");
    await assertServingThisWorktree(page);

    const dialog = await openQuickAdd(page);
    const className = await dialog.getAttribute("class");
    expect(className ?? "").not.toContain("ns-sheet-bottom");
    await expect(dialog).toHaveAttribute("aria-modal", "true");

    const sidebar = page.locator("aside").first();
    const sidebarBox = await sidebar.boundingBox();
    const dialogBox = await dialog.boundingBox();
    const viewport = page.viewportSize();
    expect(sidebarBox).not.toBeNull();
    expect(dialogBox).not.toBeNull();
    expect(viewport).not.toBeNull();

    // Bottom-anchored: a small gap from the viewport bottom, not flush (that's
    // the mobile sheet's job).
    expect(dialogBox!.y + dialogBox!.height).toBeLessThan(viewport!.height);
    expect(dialogBox!.y + dialogBox!.height).toBeGreaterThan(viewport!.height - 60);

    // Right of the sidebar (letting it out, not covering it), and roughly
    // centered in the remaining region — not pinned to either edge. A loose
    // tolerance here (not exact-pixel) because the vertical scrollbar's width
    // shifts `right:0`'s effective edge by a few px depending on platform/OS.
    const regionLeft = sidebarBox!.x + sidebarBox!.width;
    const regionWidth = viewport!.width - regionLeft;
    expect(dialogBox!.x).toBeGreaterThanOrEqual(regionLeft - 1);
    const regionCenter = regionLeft + regionWidth / 2;
    const dialogCenter = dialogBox!.x + dialogBox!.width / 2;
    expect(Math.abs(dialogCenter - regionCenter)).toBeLessThan(regionWidth * 0.05);
  });
});
