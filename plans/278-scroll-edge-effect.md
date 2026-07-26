# Plan 278: Scroll-edge effect on the two qualifying sticky headers (161 Part B)

> **Executor instructions**: Work in a git worktree on branch
> `feat/ai-scroll-edge`. **Never edit the main checkout.** First command every
> session: `pwd`. On a STOP condition, stop and report. Do NOT update
> `plans/README.md`.

## Status

- **Priority**: P3 · **Effort**: S · **Risk**: LOW (visual only)
- **Depends on**: 277 (landed the spike doc this plan is cut from)
- **Category**: UI polish / motion
- **Planned at**: commit `9abf1341`, 2026-07-26

## What and why

`docs/motion-ga-spike.md` Part B, verdict **do-top-2**: give the two sticky
headers that genuinely separate from scrolling content a scroll-edge treatment
— border and background appear only once content has scrolled under them,
instead of a permanently-drawn hard border. It is the Apple-native detail the
DESIGN direction asks for, it is cheap, and it is not blocked on anything.

The spike also **shrank this job**: it checked every `<thead>` in the repo
(`MerchantDetailRoute`, `InvestmentImportWizard`, `ManualPriceImportWizard`,
`TransactionsRoute`, `CategoryDetailRoute`, `InvestmentsRoute`,
`AnnualReportRoute`) and found **none are `position: sticky`** — the original
plan's "various route-level sticky table headers" did not exist. Two surfaces
qualify, not "various". Do not go looking for more.

| # | Surface | File (verified at `9abf1341`) |
|---|---|---|
| 1 | Demo-mode banner | `src/components/AppShell.tsx:478-487` |
| 2 | 投資分析 in-page section nav | `src/routes/InvestmentsAnalyticsTab.tsx:741-747` |

The spike cited these at `AppShell.tsx:388` and `InvestmentsAnalyticsTab.tsx:507`;
both have **drifted** to the lines above. Re-locate by content, not line number.

## Two corrections to the spike's prototype — read before writing code

The spike documented its Part B design without wiring it (its file scope
excluded `AppShell.tsx`). Two things in that sketch do not survive contact:

### Correction 1 — there is no scroll container; the window scrolls

The spike's snippet attaches a listener to `mainRef.current` and reads
`el.scrollTop`. **`mainRef` does not exist in `AppShell.tsx`, and nothing in
the app scrolls internally**: `grep -n "overflow-y-auto\|overflowY"
src/components/AppShell.tsx` returns nothing, and `globals.css:530` sets
`html, body, #root { min-height: 100% }` with no height cap. The page scrolls
the **window**. A listener bound to a container's `scroll` event would attach
successfully and then simply never fire — a silent no-op that looks like
working code.

Use `window` + `window.scrollY` for surface 1, `{ passive: true }`, and
`cancelAnimationFrame`-style coalescing is unnecessary at this simplicity —
one boolean `setState` guarded by an equality check is enough.

### Correction 2 — `scrollY > 0` is correct for surface 1 and WRONG for surface 2

The demo banner sits flush at the viewport top, so "window has scrolled at
all" and "content is under the banner" are the same condition.

The analytics nav does **not**. It is the first child of the tab content
(`InvestmentsAnalyticsTab.tsx:737`), which renders below the route header and
tab bar — so it sits several hundred px down the page in its natural position.
Keying it off `scrollY > 0` would light its border the instant the user
scrolls one pixel, while the nav is still sitting mid-page and nothing is
under it. Visibly wrong, and it would read as a bug.

Surface 2 needs **"is this element currently stuck?"**, not "has the page
scrolled". Use the standard sentinel technique:

- Render a zero-height `<div>` immediately **before** the `<nav>`.
- `IntersectionObserver` on that sentinel with `threshold: 0`.
- Sentinel intersecting ⇒ nav is in its natural position ⇒ not stuck.
  Sentinel out of view ⇒ nav is pinned ⇒ stuck.
- Clean up the observer on unmount.

Do not try to make one shared hook serve both surfaces. At two call sites with
genuinely different trigger conditions, per-surface local state is the right
size — the spike says the same ("not enough to warrant a shared component
abstraction yet").

## Implementation

### Step 1 — CSS in `src/styles/globals.css`

Add two classes near the existing sticky/chrome rules. Static styling belongs
in CSS per AGENTS.md's style order, **not** inline — and these transitions
cannot be expressed inline anyway.

```css
.ns-scroll-edge {
  border-bottom: 1px solid transparent;
  transition:
    border-color 160ms var(--ns-ease),
    background-color 160ms var(--ns-ease);
}
.ns-scroll-edge[data-stuck="true"] {
  border-bottom-color: var(--ns-border);
}
```

`--ns-ease` is real (`globals.css:47`). Give each surface its own
`background-color` under `[data-stuck="true"]` if the design calls for it —
keep the banner's `--ns-accent-soft` identity and the nav's `--ns-bg`; do not
homogenise them.

**Reduced motion needs no new work here.** `globals.css:668` already zeroes
`transition-duration` via the universal selector, which *does* match these
ordinary elements. (The spike's separate finding — that the universal selector
does **not** reach view-transition pseudo-elements — was already fixed at
`globals.css:677`. Different mechanism, already handled, do not touch it.)

### Step 2 — surface 1, `AppShell.tsx`

Add local `const [stuck, setStuck] = useState(false)` plus a `useEffect` that
listens on `window` (`{ passive: true }`) and sets `scrollY > 0`. Read the
initial value once on mount — a route restored mid-scroll must not start with
the border missing.

On the banner element: add `className="ns-scroll-edge …"`, add
`data-stuck={stuck}`, and **remove the now-conflicting static
`borderBottom: "1px solid var(--ns-border)"` from its inline `style`**. Leave
`position/top/zIndex/background` alone.

### Step 3 — surface 2, `InvestmentsAnalyticsTab.tsx`

Sentinel + `IntersectionObserver` per Correction 2. Same class/attribute
wiring, same removal of the static inline `borderBottom`.

Note the nav also carries `-mb-2`; the sentinel must not disturb that spacing
— a zero-height element with no margin will not, but check it visually.

## Explicitly out of scope

- Any other surface. The desktop broker panel and the sidebar were both
  evaluated and **rejected** by the spike (§1) — do not "improve" them.
- `animation-timeline: scroll()`. The spike names it as the pure-CSS
  alternative and marks it **DEVICE-DEFERRED** on WKWebView support. The JS
  approach works everywhere today.
- A shared hook/component abstraction (see above).
- The pre-existing z-index overlap between the demo banner (`z-30`, sticky
  `top: 0`) and the analytics nav (`z-20`, sticky `top: 0`): with demo mode
  active both pin to the same line and the nav slides under the banner. This
  is **existing behaviour, not caused by this change** — note it in your report
  if you can reproduce it, but do not fix it here.

## On tests

Neither file has a test today, and neither jsdom nor this repo's setup
implements `IntersectionObserver`. Standing up that harness is disproportionate
to a border fade — follow plan 276's precedent: **no test file**. The logic
carries no financial or data-correctness meaning; the failure mode is a border
that appears at the wrong time, which is exactly what visual verification
catches.

## Verify

1. `git diff --stat main` lists **exactly three** files: `globals.css`,
   `AppShell.tsx`, `InvestmentsAnalyticsTab.tsx`. Any fourth ⇒ STOP.
2. `grep -c 'borderBottom: "1px solid var(--ns-border)"' src/components/AppShell.tsx`
   and the same in `InvestmentsAnalyticsTab.tsx` → both `0` (the static borders
   are gone, replaced by the class).
3. `npx tsc --noEmit` → 0 errors.
4. `npm run lint` → 0 errors. Watch for `react-hooks/exhaustive-deps` on both
   effects.
5. `npm run format:check` passes.
6. `npm test` → 1512 passing, unchanged.
7. `npm run build` succeeds.
8. **Visual proof, required — this is a visual change.** Run the dev server via
   the preview tooling and capture, for surface 1: banner at `scrollY === 0`
   (no border) and after scrolling (border present). Demo mode must be ON for
   the banner to render. For surface 2: the nav in its natural mid-page
   position while the page is scrolled a little (**border must be absent** —
   this is the exact bug Correction 2 exists to prevent) and once pinned
   (border present). Attach all four.

## STOP conditions

- `mainRef` or an internal scroll container turns out to exist after all
  (Correction 1's premise is wrong — re-derive before writing either effect).
- Removing the inline `borderBottom` visibly breaks either header's layout in
  a way the class does not restore.
- The analytics nav's border lights while the nav is still mid-page. That is
  Correction 2's failure mode; do not ship it, and do not "fix" it by adding a
  scroll-offset threshold — go back to the sentinel.

## Commit

`feat(ui): scroll-edge effect on the two sticky headers (plan 278)` + standard
trailer. Push the branch; do not merge.

## Maintenance notes

- Follow-up #1 from the same spike (View Transitions push/pop) remains
  unclaimed. It is **S–M** but half its acceptance is device-only (whether the
  transition is compositor-smooth, and whether WKWebView supports
  `:active-view-transition-type()`), so it should be cut when there is a
  macOS Sequoia+ / iOS 18+ device in the loop. Its PoC is at tag
  `spike/161-ga-motion-poc`.
- If a third qualifying sticky surface ever appears, that is the moment to
  extract a shared hook — not before.
