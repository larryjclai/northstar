# Plan 245: 年度報表「列印 / 匯出 PDF」按鈕在桌面 Tauri 被 coarse 假訊號錯誤隱藏

> **Executor instructions**: Follow this plan step by step. Run every
> verification command. On any STOP condition, stop and report. Do NOT update
> `plans/README.md`. You may ONLY touch the one file in **Scope**.
>
> **Drift check (run first)**:
> `git diff --stat d7818bde..HEAD -- src/routes/AnnualReportRoute.tsx`
> If the file already differs from `d7818bde` in the lines this plan edits, STOP and report.

## Status

- **Priority**: P3 (a missing-but-not-broken button on one route; lower urgency than plan 244's layout break, same root cause class)
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (independent of plan 244 — a different file; they share only the root-cause pattern)
- **Category**: correctness / UX (responsive gating)
- **Planned at**: commit `d7818bde`, 2026-07-21, via `/improve plan`

## Why this matters

`src/routes/AnnualReportRoute.tsx` hides its 列印 / 匯出 PDF button on "mobile-class"
devices. Plan 233 added this because iOS WKWebView's `window.print()` renders the
desktop-designed print CSS poorly — the decision was to hide rather than ship a rough
experience. The "mobile" signal it chose is the same media query ModalShell used:

`src/routes/AnnualReportRoute.tsx:28-32`
```ts
  // 列印 is desktop-only (plan 173 deferral → 233): iOS WKWebView's
  // window.print() renders the desktop print CSS poorly — hide, don't degrade.
  const coarsePointer =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse), (max-width: 1023px)").matches;
```

That query is `(pointer: coarse)` **OR** `(max-width: 1023px)`. The **macOS / Tauri
desktop WKWebView reports `(pointer: coarse) = true`** (this is the exact fact that
caused the plan 244 bottom-sheet layout break). So on the packaged **desktop** app —
where the window is always ≥ 1024px (`src-tauri/tauri.conf.json:21` → `minWidth: 1024`)
and print CSS works fine — the `(pointer: coarse)` half fires and the 列印 button is
**wrongly hidden**. A desktop user who wants to print / export the annual report to PDF
has no button.

The CSV 匯出 button beside it is unconditional and unaffected — only the print/PDF path
is lost, which is why this went unnoticed longer than plan 244's visible breakage.

### The fix

Gate the button on **viewport width** — the same "mobile-layout / sidebar-hidden"
signal — instead of pointer type: `(max-width: 1023px)`. Drop the `(pointer: coarse)`
clause. This mirrors plan 244's ModalShell fix.

After the change:
- **Desktop app** (always ≥ 1024px, sidebar shown, desktop print CSS): button **shows** ✓
  — the bug is fixed.
- **iPhone / narrow window** (< 1024px, mobile layout): button **hidden** ✓ — still
  correct; unpolished iOS print stays hidden.
- **iPad landscape ≥ 1024px** (desktop-class layout, sidebar shown): button now **shows**.
  This is a deliberate, documented widening from plan 233 (which hid it on *all* coarse
  devices). It is acceptable — at ≥ 1024px the app renders the desktop layout, so the
  desktop print CSS is the one that applies. If the maintainer instead wants "hidden on
  iOS regardless of width", that needs a genuine platform check (Tauri `@tauri-apps/plugin-os`
  `platform()`), which is async and a larger change — see STOP conditions.

There is **no reliable synchronous desktop-vs-iOS discriminator** available today:
`isTauri()` (`src/state/deviceIdentity.ts:15`, `"__TAURI_INTERNALS__" in window`) is true
for **both** desktop and iOS Tauri, so it cannot be used here. Width is the pragmatic,
self-contained signal — and it is consistent with how the whole app already decides
"mobile vs desktop" (the `lg` = 1024px sidebar breakpoint).

## Current state (exact excerpt to change)

**File: `src/routes/AnnualReportRoute.tsx`**

Detection, `:28-32` (shown above). `coarsePointer` is referenced in exactly **two** places:
its declaration and the button gate at `:191`:

```tsx
          {!coarsePointer ? (
            <Button
              variant="outline"
              disabled={printButton.disabled}
              title={printButton.title}
              onClick={() => window.print()}
            >
              <Printer size={14} />列印 / 匯出 PDF
            </Button>
          ) : null}
```

## Scope

**In scope (only this file):** `src/routes/AnnualReportRoute.tsx` — the detection block
+ its single usage on the button gate.

**Out of scope — do NOT touch:**
- `src/components/ModalShell.tsx` (its equivalent fix is plan 244, a separate branch).
- `src/routes/annualReportPrint.ts` and `annualReportPrint.test.ts` (the pure
  `annualPrintButtonState` helper is orthogonal — it computes disabled/title, not
  visibility; leave it alone).
- The `@media print` CSS, the CSV 匯出 button.
- Do NOT add the Tauri OS plugin or any async platform detection.

## Steps

1. **Replace the detection block at `:28-32`** with:

   ```ts
   // 列印 is desktop-only (plan 173 deferral → 233): iOS WKWebView's
   // window.print() renders the desktop print CSS poorly — hide, don't degrade.
   // Gate on viewport WIDTH (the mobile-layout / sidebar-hidden signal), NOT
   // pointer type: the macOS/Tauri desktop WKWebView reports a coarse pointer, so
   // the old `(pointer: coarse), (max-width: 1023px)` query wrongly hid this button
   // on the desktop app (min window width 1024, where print works fine). Mirrors
   // plan 244's ModalShell fix. See plan 245.
   const isMobileViewport =
     typeof window.matchMedia === "function" &&
     window.matchMedia("(max-width: 1023px)").matches;
   ```

2. **Update the single usage at `:191`** — change `{!coarsePointer ? (` to
   `{!isMobileViewport ? (`. Nothing else in the button block changes.

## Commands (verification gates)

| Purpose   | Command                              | Expected |
|-----------|--------------------------------------|----------|
| Typecheck | `npx tsc --noEmit`                   | exit 0, no output |
| Tests     | `npm test`                           | all pass (no test exercises this inline gate — jsdom has no `matchMedia`; the pure `annualPrintButtonState` tests in `annualReportPrint.test.ts` are unaffected) |
| Lint      | `npm run lint`                       | 0 errors (warning count unchanged) |

## Done criteria (machine-checkable)

- [ ] `git diff --name-only d7818bde..HEAD` lists **only** `src/routes/AnnualReportRoute.tsx`
      (plus any commit you make; no other source file changes).
- [ ] `grep -n "coarsePointer" src/routes/AnnualReportRoute.tsx` → **no matches** (fully renamed).
- [ ] `grep -n 'matchMedia("(pointer:' src/routes/AnnualReportRoute.tsx` → **no matches**
      (the coarse-pointer *query* is gone; a mention of the words inside the explanatory
      comment is fine and expected).
- [ ] `grep -n 'matchMedia("(max-width: 1023px)")' src/routes/AnnualReportRoute.tsx` → 1 match.
- [ ] `grep -cn "isMobileViewport" src/routes/AnnualReportRoute.tsx` → 2 (declaration + gate).
- [ ] `npx tsc --noEmit` exits 0.
- [ ] `npm test` passes with no new failures.
- [ ] `npm run lint` reports 0 errors.

### Reviewer-only live check (not required of the executor)
- Dev server at **≥ 1024px** viewport, open `/reports/annual`: the 列印 / 匯出 PDF button
  is **present** next to CSV 匯出. Resize to **375px**: the 列印 button is **gone**, CSV
  匯出 stays. (A fine-pointer browser can't reproduce the coarse-pointer bug itself; the
  definitive desktop-app confirmation is on a real Tauri macOS build — the button now shows.)

## STOP conditions

- The detection block at `:28-32` does not match the excerpt above (drift) → STOP.
- `grep -n "coarsePointer" src/routes/AnnualReportRoute.tsx` finds usages **beyond** the two
  documented (declaration + `:191`) → STOP and report; the rename would miss a reference.
- `npm test` shows a **pre-existing** failure unrelated to this change → STOP and report it
  rather than "fixing" it.
- If the maintainer's intent turns out to be "the print button must be hidden on iOS even at
  ≥ 1024px (iPad landscape)", a width gate cannot express that — STOP and report; the correct
  fix is then the async Tauri `platform()` check, which is deliberately out of this plan's scope.

## Maintenance notes

- **Consolidation opportunity (optional, future):** this file and `ModalShell.tsx` (plan 244)
  now both inline the same `window.matchMedia("(max-width: 1023px)")` "mobile-layout" test.
  A future refactor could extract a single `isMobileLayout()` helper (e.g. in `src/lib/`) as
  the one source of truth for "sidebar hidden", so the `(pointer: coarse)` false signal can't
  be reintroduced by copy-paste. Not done here to keep this change single-file and low-risk,
  and because plan 244 is still on an unmerged branch — attempting a shared helper now would
  couple the two. Do it as a dedicated cleanup once both land.
- **Plan 233's other deferred item** — a human eyeball of real print output (dark theme, long
  multi-year report, page-splitting) — remains operator-only and is untouched here.
- **If the 1024px breakpoint ever moves** (the `lg` sidebar threshold), update this query to
  match, exactly as for plan 244.
