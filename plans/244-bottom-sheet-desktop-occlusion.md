# Plan 244: 小視窗下交易 Sheet 跑版 — bottom-sheet 與桌面側欄互相重疊

> **Executor instructions**: Follow this plan step by step. Run every
> verification command. On any STOP condition, stop and report. Do NOT update
> `plans/README.md`. You may ONLY touch the two files in **Scope**.
>
> **Drift check (run first)**:
> `git diff --stat d7818bde..HEAD -- src/components/ModalShell.tsx src/components/ModalShell.test.tsx`
> If either file already differs from `d7818bde` in the lines this plan edits, STOP and report.

## Status

- **Priority**: P2 (visible layout breakage in the primary 新增交易 flow on the shipping desktop build)
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: correctness / UX (responsive layout)
- **Planned at**: commit `d7818bde`, 2026-07-21, via `/improve plan`

## Symptom (what the user reported)

在桌面 app（Tauri / macOS）把視窗縮到最小時，開啟「投資 → 新增交易」的抽屜會**跑版**：
整張表單的左緣被切掉——標題「交易」只剩右半、欄位標籤「股票代號 / Symbol」變成
「號 / Symbol」、日期「07/21/2026」變成「21/2026」、「影響預覽」變成「:影響預覽」、
底部「取消 / 確認買入」也被切。左側的導覽側欄（收合成 icon rail）疊在表單上面。

## Root cause (confirmed live)

The 新增交易 sheet is rendered through `ModalShell` with
`mobilePresentation="bottom-sheet"` (`src/routes/InvestmentsAddSheet.tsx:462`).
When **bottom-sheet mode is active**, `ModalShell` gives the panel the
`.ns-sheet-bottom` class, whose CSS is a **full-viewport fixed element**:

`src/styles/globals.css:388`
```css
.ns-sheet-bottom {
  position: fixed; left: 0; right: 0; bottom: 0;
  ...
}
```

Verified live in the dev server (900px viewport, sheet open): the panel computes to
`position: fixed; left: 0px; right: 0px; width: <viewport>px` — it spans the **entire
window width, from x=0**, i.e. straight underneath the left sidebar.

The sidebar (`AppShell.tsx:160`, `aside.ns-sidebar`) is a real layout column shown at
the `lg` breakpoint (`hidden lg:flex` → min-width **1024px**) and carries
**`z-index: 1100`** (`AppShell.tsx:177`), deliberately higher than the modal scrim
(`z-index: 50`) so overlays don't grey it out. So whenever the sidebar **and** a
bottom-sheet are painted at the same time, the sidebar sits **on top of** the sheet's
left edge and occludes it. That is the "跑版".

**Why it happens on desktop even though a bottom sheet sounds like a mobile thing.**
`ModalShell` decides whether to use the sheet from this media query
(`src/components/ModalShell.tsx:138-144`):

```ts
const [isCoarse] = useState(
  () =>
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse), (max-width: 1023px)").matches,
);
const sheetActive = mobilePresentation === "bottom-sheet" && isCoarse;
```

The condition is **`(pointer: coarse)` OR `(max-width: 1023px)`**. Two facts make this
fire on the desktop app precisely when the sidebar is shown:

1. The Tauri desktop window has **`minWidth: 1024`** (`src-tauri/tauri.conf.json:21`).
   So the window is **always ≥ 1024px**, the sidebar is **always shown**, and the
   `(max-width: 1023px)` half is **never** the trigger there.
2. The macOS/Tauri **WKWebView reports `(pointer: coarse)` as `true`**. That half fires
   at every width, including ≥ 1024px.

Result: on the desktop build the sheet activates via the coarse-pointer clause while
the sidebar is still on screen — the exact overlap. At the minimum 1024px window the
sheet is narrowest, so the fixed-width sidebar occludes the largest fraction of it →
"小視窗下最嚴重". (A normal fine-pointer desktop **browser** does not reproduce this —
`(pointer: coarse)` is `false` there — which is why it only bites the packaged app.)

### The fix

Bottom-sheet presentation is the **mobile-layout** affordance and must be **mutually
exclusive with the desktop sidebar**. The sidebar's visibility is purely width-driven
(`lg` = 1024px), so gate the sheet on the **same** width that hides the sidebar:
`(max-width: 1023px)`. Drop the `(pointer: coarse)` clause — it is an unreliable
"mobile" signal here because the desktop webview reports coarse.

After the change:
- Desktop app (always ≥ 1024px): `sheetActive` is `false` → the sheet falls back to its
  base `variant="drawer"` (right-anchored, `width: min(520px, 100%)`, verified at all six
  call sites below) which sits at the **right** edge and never touches the sidebar. Bug gone.
- Real mobile / narrow windows (< 1024px, where the sidebar is hidden and the mobile bottom
  nav is shown): `sheetActive` is `true` → full-width bottom sheet, unchanged and correct.

This is a **deliberate, documented narrowing**: a touch device with a **wide** viewport
(e.g. iPad landscape ≥ 1024px, which also shows the sidebar) now gets the drawer instead of
the drag-to-dismiss sheet. That is the correct outcome — the drawer never underlaps the
sidebar and is fully dismissible by scrim tap, the × button, and Escape.

## Current state (exact excerpts to change)

**File: `src/components/ModalShell.tsx`**

JSDoc on the prop, `:45-51`:
```ts
  /**
   * Opt in to native-style bottom-sheet presentation on coarse-pointer/narrow
   * viewports (drag-to-dismiss with momentum). Default `"none"` — zero change
   * for un-migrated call sites. When active, the call site's positional
   * `panelStyle` keys (position/top/right/bottom/left/width) are ignored.
   */
  mobilePresentation?: ModalShellMobilePresentation;
```

The detection block, `:135-144`:
```ts
  // Evaluated once per mount — coarse pointer or narrow (mobile-nav) viewport.
  // Guard `matchMedia` presence: jsdom (most ModalShell.test.tsx cases) has no
  // implementation at all, so un-mocked tests must fall through to `false`, not throw.
  const [isCoarse] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse), (max-width: 1023px)").matches,
  );
  const sheetActive = mobilePresentation === "bottom-sheet" && isCoarse;
```

`isCoarse` is referenced **only** on the `sheetActive` line — a single usage, so the
rename below is safe (verify with the grep in Done criteria).

## Scope

**In scope (only these two files):**
- `src/components/ModalShell.tsx` — the detection block + the JSDoc wording.
- `src/components/ModalShell.test.tsx` — add a regression test; refresh two stale test titles.

**Out of scope — do NOT touch:**
- `src/styles/globals.css` (`.ns-sheet-bottom` geometry is correct **for its intended
  mobile context**; after the gate fix the sheet and sidebar are never co-present, so no
  CSS change is needed or wanted).
- `AppShell.tsx` and the sidebar `z-index: 1100` (intentional — see the comment at
  `AppShell.tsx:170-177`).
- The six `mobilePresentation="bottom-sheet"` call sites (`InvestmentsAddSheet.tsx:462`,
  `CategoryManagementDrawer.tsx:117`, `RecurringRulesTab.tsx:363`, `AccountsRoute.tsx:809`,
  `AppShell.tsx:428`, and the test file). They all keep a base `variant="drawer"` and are
  fixed **transitively** by the ModalShell change — do not edit them.
- `src/routes/AnnualReportRoute.tsx:32` — it has its **own** copy of the
  `(pointer: coarse), (max-width: 1023px)` query (from plan 233) with the **same** latent
  false-signal, but it hides a print button rather than causing this layout break. It is a
  **separate** follow-up (see Maintenance notes), NOT part of this plan.

## Steps

1. **In `src/components/ModalShell.tsx`, replace the detection block `:135-144`** with:

   ```ts
   // Bottom-sheet presentation is the MOBILE-layout affordance and must stay
   // mutually exclusive with the desktop sidebar (AppShell `aside.ns-sidebar`,
   // shown at `lg` = min-width:1024px, z-index 1100). `.ns-sheet-bottom` is a
   // full-viewport `position:fixed; left:0; right:0` panel, so any time the
   // sidebar is also painted it occludes the sheet's left edge (plan 244).
   // Gate strictly on the viewport width that HIDES the sidebar. We must NOT use
   // `(pointer: coarse)`: the macOS/Tauri WKWebView reports coarse on the desktop
   // build (min window width 1024 → sidebar always shown), which is exactly the
   // overlap we are fixing. Evaluated once per mount; guard `matchMedia` presence
   // so jsdom (most ModalShell.test.tsx cases) falls through to `false`, not throws.
   const [isMobileViewport] = useState(
     () =>
       typeof window !== "undefined" &&
       typeof window.matchMedia === "function" &&
       window.matchMedia("(max-width: 1023px)").matches,
   );
   const sheetActive = mobilePresentation === "bottom-sheet" && isMobileViewport;
   ```

   (This renames `isCoarse` → `isMobileViewport` and changes the media query to
   `"(max-width: 1023px)"`. No other reference to `isCoarse` exists.)

2. **Refresh the JSDoc wording at `:45-51`** — change the first sentence from
   `native-style bottom-sheet presentation on coarse-pointer/narrow viewports` to:

   ```ts
   /**
    * Opt in to native-style bottom-sheet presentation on narrow (mobile-layout)
    * viewports — width < 1024px, where the desktop sidebar is hidden — with
    * drag-to-dismiss and momentum. Default `"none"` — zero change for un-migrated
    * call sites. When active, the call site's positional `panelStyle` keys
    * (position/top/right/bottom/left/width) are ignored.
    */
   ```

3. **In `src/components/ModalShell.test.tsx`**, add a query-aware stub helper next to the
   existing `stubMatchMedia` (after its closing `}` at line 29):

   ```ts
   // Query-aware variant: the fix (plan 244) keys off the exact media string
   // "(max-width: 1023px)", so a boolean-for-any-query stub can't distinguish a
   // coarse-pointer desktop from a narrow phone. Map specific queries to results.
   function stubMatchMediaByQuery(map: Record<string, boolean>) {
     vi.stubGlobal(
       "matchMedia",
       vi.fn().mockImplementation((query: string) => ({
         matches: map[query] ?? false,
         media: query,
         onchange: null,
         addListener: vi.fn(),
         removeListener: vi.fn(),
         addEventListener: vi.fn(),
         removeEventListener: vi.fn(),
         dispatchEvent: vi.fn(),
       })),
     );
   }
   ```

4. **Add the regression test** inside the `describe("mobilePresentation (plan 159)", ...)`
   block — insert it immediately **after** the closing `});` of the first test (the one at
   `:222-243`), before the `"leaves panelStyle positioning untouched…"` test:

   ```ts
   it("does NOT use the sheet on a coarse-pointer DESKTOP viewport — sidebar overlap guard (plan 244)", () => {
     // Desktop Tauri: pointer is coarse but the window is >= 1024px (sidebar shown).
     stubMatchMediaByQuery({ "(pointer: coarse)": true, "(max-width: 1023px)": false });
     render(
       <ModalShell
         title="t"
         onClose={() => {}}
         variant="drawer"
         mobilePresentation="bottom-sheet"
         panelStyle={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 420 }}
       >
         <button>ok</button>
       </ModalShell>,
     );
     const dialog = screen.getByRole("dialog");
     expect(dialog).not.toHaveClass("ns-sheet-bottom");
     expect(dialog).toHaveAttribute("data-motion", "drawer");
     // The right-anchored drawer geometry is preserved (never underlaps the sidebar).
     expect(dialog.style.position).toBe("absolute");
     expect(dialog.style.width).toBe("420px");
   });

   it("uses the sheet on a narrow (mobile) viewport where the sidebar is hidden (plan 244)", () => {
     stubMatchMediaByQuery({ "(max-width: 1023px)": true });
     render(
       <ModalShell
         title="t"
         onClose={() => {}}
         variant="drawer"
         mobilePresentation="bottom-sheet"
         panelStyle={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 420 }}
       >
         <button>ok</button>
       </ModalShell>,
     );
     const dialog = screen.getByRole("dialog");
     expect(dialog).toHaveClass("ns-sheet-bottom");
     expect(dialog).toHaveAttribute("data-motion", "sheet-bottom");
   });
   ```

5. **Refresh two now-stale test titles** (the assertions are unchanged and still pass — the
   old `stubMatchMedia(boolean)` stub returns the same value for any query, so both keep
   working):
   - `:222` — change `... on a coarse pointer` → `... on a narrow (mobile) viewport`.
   - `:245` — change `... on a fine pointer even when opted in` →
     `... on a desktop (wide) viewport even when opted in`.

## Commands (verification gates)

| Purpose   | Command                                   | Expected |
|-----------|-------------------------------------------|----------|
| Typecheck | `npx tsc --noEmit`                        | exit 0, no output |
| Tests     | `npm test -- src/components/ModalShell.test.tsx` | all pass (existing 3 sheet tests + 2 new) |
| Full tests| `npm test`                                | all pass (no regressions) |
| Lint      | `npm run lint`                            | 0 errors (warning count unchanged) |

## Done criteria (machine-checkable)

- [ ] `git diff --name-only d7818bde..HEAD` lists **only** `src/components/ModalShell.tsx`
      and `src/components/ModalShell.test.tsx`.
- [ ] `grep -n "isCoarse" src/components/ModalShell.tsx` → **no matches** (fully renamed).
- [ ] `grep -n "pointer: coarse" src/components/ModalShell.tsx` → **no matches**.
- [ ] `grep -n 'matchMedia("(max-width: 1023px)")' src/components/ModalShell.tsx` → 1 match.
- [ ] `grep -n "isMobileViewport" src/components/ModalShell.tsx` → 2 matches (declaration + `sheetActive`).
- [ ] `npx tsc --noEmit` exits 0.
- [ ] `npm test -- src/components/ModalShell.test.tsx` passes, including the two new
      `(plan 244)` tests.
- [ ] `npm run lint` reports 0 errors.

### Reviewer-only live check (not required of the executor; needs the packaged behavior)
- In a dev browser, resize to **1024px** and open 投資 → 新增交易: the panel is the
  **right-anchored drawer** (~520px, flush right, sidebar fully visible and un-occluded),
  **not** a full-width bottom sheet. Resize to **900px** (sidebar hidden): it becomes the
  full-width bottom sheet as before. Because a fine-pointer browser can't reproduce the
  coarse-pointer trigger, the definitive check is on a real Tauri desktop build — verify the
  交易 form no longer has its left edge cut off at the minimum window size.

## STOP conditions

- The detection block at `ModalShell.tsx:135-144` or the JSDoc at `:45-51` does not match the
  excerpts above (drift) → STOP.
- Any reference to `isCoarse` exists **outside** `ModalShell.tsx` (the grep in step 1 found a
  second usage) → STOP and report; the rename would need wider coordination.
- `npm test` shows a **pre-existing** failure unrelated to this change → STOP and report the
  failing test rather than "fixing" it.
- You discover that removing the `(pointer: coarse)` clause makes some intended narrow **touch
  ≥1024** experience lose the drag-to-dismiss sheet and the maintainer considers that a
  requirement → STOP and report; the alternative (constrain the sheet's `left` to the sidebar
  width instead of gating on width) is a bigger change deliberately not taken here.

## Maintenance notes

- **Sibling bug, separate follow-up (not this plan):** `src/routes/AnnualReportRoute.tsx:32`
  uses the identical `(pointer: coarse), (max-width: 1023px)` query (introduced by plan 233)
  to hide the 列印 / 匯出 PDF button on "mobile". By the same WKWebView-reports-coarse fact,
  that button is currently **hidden on the desktop Tauri app** too. That is a different
  symptom (a missing button, not a layout break) and a different tradeoff (print CSS really is
  desktop-only), so it is intentionally out of scope. If the maintainer wants it fixed, that is
  a small follow-up plan mirroring this width-based gate — consider extracting a shared
  `isMobileLayout()` helper (single source of truth for "sidebar hidden") that both ModalShell
  and AnnualReportRoute consume, so the coarse-pointer false signal can't creep back in.
- **Why not fix the CSS instead?** Constraining `.ns-sheet-bottom { left: <sidebar-width> }`
  was rejected: the sidebar width is dynamic (collapsed vs expanded), the sheet is meant to be
  edge-to-edge on true mobile, and after this gate the sheet and sidebar are never co-present —
  so a geometry patch would add fragility for a case that can no longer occur.
- **Watch in review:** any new `mobilePresentation="bottom-sheet"` call site is automatically
  covered by the ModalShell gate — no per-call-site work needed. The invariant to preserve is
  "bottom sheet ⟺ sidebar hidden"; if the sidebar's `lg` breakpoint (1024px) ever changes,
  update the `(max-width: 1023px)` query to match it.
