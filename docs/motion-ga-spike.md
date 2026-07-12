# Plan 161 spike: GA motion — View Transitions push/pop, scroll-edge effect, Dynamic Type

Spike, not a feature. All findings below are from static/desk research (grep, `node_modules`
type reading, spec knowledge) — this environment is headless, so nothing here was watched
running in an actual WKWebView. Anywhere live-device confirmation is required, it's marked
**DEVICE-DEFERRED**. A minimal, real (compiling) PoC for Part A lives on this branch,
`feat/ai-ga-motion-spike`, confined to `src/routes/router.tsx` and `src/styles/globals.css` —
see "Scope note on Part B" below for why Part B stayed doc-only.

## Executive summary

- **Part A (View Transitions push/pop): GO, with a scoping recipe, for a follow-up ticket.**
  `document.startViewTransition` and the installed `@tanstack/react-router` (1.170/1.171)'s
  `viewTransition`/`defaultViewTransition` option both exist and interoperate cleanly — the
  router itself feature-detects `document.startViewTransition` and falls back to a plain
  navigation when it's absent, so this is safe to ship behind a scoped opt-in without
  touching the existing `::view-transition-old(root)/::view-transition-new(root) { animation:
  none }` guard. The real unlock is scoping to a **named** `view-transition-name` on the main
  content region instead of `root`, so the sidebar/dock chrome never enters the animated
  snapshot. One real bug found in the plan's own assumptions: the existing
  `prefers-reduced-motion` rule does **not** cover view-transition pseudo-elements (see
  Part A §4) — any real implementation must add its own reduced-motion override.
- **Part B (scroll-edge effect): DEFER for a fade-on-scroll implementation, DO for nothing
  yet.** Only two sticky surfaces actually qualify as "header separating from scrolling
  content" (demo banner, investments-analytics in-page nav) — everything else billed as
  "sticky" in the plan's Current State section (table `<thead>`s) turned out not to be sticky
  at all on inspection. Two surfaces isn't enough volume to justify the work right now.
- **Part C (Dynamic Type): DEFER past GA.** The type scale is fixed-px in *two* independent
  systems (`--ns-t-*` custom tokens and the Tailwind `@theme inline` `--text-*` ladder), plus
  102 scattered literal-px inline `fontSize:` values across component files with zero
  reference to either token system. A rem migration would not "cascade cleanly" — it would be
  a large, error-prone, file-by-file audit. Compounding that, `globals.css` already sets
  `-webkit-text-size-adjust: 100%` (disabling the browser's own default text-inflation
  behavior), so even a partial rem migration would not automatically pick up iOS Dynamic Type
  without additional native-bridge work.

---

## Part A — View Transitions push/pop

### 1. API availability in target engines (desk-check, not device-verified)

| API | Chrome/Edge (reference) | Safari / WKWebView | Verdict for this app |
|---|---|---|---|
| `document.startViewTransition()` (same-document) | Shipped M111 (2023) | Shipped **Safari 18** (macOS Sequoia 15 / iOS 18, Sept 2024) | macOS Tauri: present on Sequoia+ WKWebView, **absent** on Sonoma-and-older WKWebView (pre-Safari 18). iOS: present on iOS 18+, the SOP's stated floor. |
| `:active-view-transition-type()` CSS pseudo-class (needed to key CSS off `types`) | Shipped ~M126 (mid-2024) | Less certain — Interop tracked this as part of view-transition-types work; exact WebKit ship version **not confirmed from desk research**. **DEVICE-DEFERRED.** | If unsupported, the router's own type-detection (`CSS.supports('selector(:active-view-transition-type(a))')`, see §2) makes it fall back — see the important caveat in §4. |
| `@starting-style` | Shipped M117 (2023) | Shipped **Safari 17.5** (May 2024) — ships *before* the view-transitions floor above, so it's not a gate here | Available everywhere this app already requires for view-transitions. |

Net: for the macOS desktop build, this only activates on Sequoia-or-newer; on anything older
it silently no-ops (see the router's own fallback logic below) — no crash, just a plain nav.
For iOS the SOP already floors at iOS 18, which matches the view-transitions floor, so no
adjustment needed there.

### 2. Does the installed router support this?

Yes. Checked `node_modules/@tanstack/react-router` (1.170.16) and `@tanstack/router-core`
(1.171.13) types + compiled source directly:

- `NavigateOptions.viewTransition?: boolean | ViewTransitionOptions` exists on both `Link`
  and `navigate()` (`node_modules/@tanstack/router-core/dist/esm/link.d.ts:77`,
  `RouterProvider.d.ts:15`).
- `RouterOptions.defaultViewTransition?: boolean | ViewTransitionOptions` exists at the
  router-construction level (`router.d.ts:154`) — this is what the PoC uses, so **no call
  site anywhere in the app needs to pass `viewTransition: true` itself**.
- `ViewTransitionOptions.types` can be a function of `{ fromLocation, toLocation,
  pathChanged, hrefChanged, hashChanged }` returning `string[] | false` (`router.d.ts:551-559`).
  Returning `false` for a given navigation skips `document.startViewTransition` for that nav
  entirely and calls the update function directly instead — confirmed by reading
  `router.js`'s `startViewTransition` implementation (`router.js:639-659`):
  ```js
  this.startViewTransition = (fn) => {
    const shouldViewTransition = this.shouldViewTransition ?? this.options.defaultViewTransition;
    if (shouldViewTransition && typeof document !== "undefined" && "startViewTransition" in document ...) {
      if (typeof shouldViewTransition === "object" && this.isViewTransitionTypesSupported) {
        const resolvedViewTransitionTypes = ... shouldViewTransition.types(...) ...;
        if (resolvedViewTransitionTypes === false) { fn(); return; }   // <-- clean opt-out
        startViewTransitionParams = { update: fn, types: resolvedViewTransitionTypes };
      } else startViewTransitionParams = fn;   // <-- see caveat below
      document.startViewTransition(startViewTransitionParams);
    } else fn();   // <-- clean fallback when the API doesn't exist at all
  };
  ```
- **Caveat found while reading this** (not in the plan): `isViewTransitionTypesSupported`
  (`router.js:134`) is set once at router construction via
  `window.CSS.supports("selector(:active-view-transition-type(a))")`. If a browser has
  `document.startViewTransition` but **not** that newer selector (plausible on some interim
  WebKit build), the `object`-with-`types` branch is skipped and `startViewTransitionParams =
  fn` runs unconditionally for **every** navigation, not just the scoped pair — i.e. every nav
  in the app would trigger a real (untyped) view transition on `root`. This is caught safely
  by the pre-existing `::view-transition-old(root), ::view-transition-new(root) { animation:
  none }` guard (so it stays visually inert), but it means that specific engine combination
  pays the cost of an extra document-freeze-and-snapshot on every navigation. Worth a note in
  any real implementation ticket; not a blocker for this app's floor (Safari 18 ships both
  APIs together in practice, per the table above), but flag for **DEVICE-DEFERRED**
  confirmation if this dependency's version changes.

### 3. Wired PoC (real, compiling, on this branch)

Files touched: `src/routes/router.tsx`, `src/styles/globals.css` (both in-scope for this
part). Approach, verified with `npm run build` (exit 0):

- `router.tsx`: `createRouter({ ..., defaultViewTransition: { types: ({ fromLocation,
  toLocation }) => ... } })`. The resolver returns `["push"]` only for
  `/investments → /holdings/$ticker`, `["pop"]` only for the reverse, and `false` for every
  other navigation pair in the app (which — per §2 — skips `document.startViewTransition`
  entirely for those, so the root guard's job doesn't even come up for them). As a side
  effect it also stamps `document.documentElement.dataset.vt = "push" | "pop"` (self-clearing
  after 400ms) purely so the CSS below has something simple to key off, since
  `:active-view-transition-type()` support is unconfirmed (§1).
- `globals.css`: rather than animating `::view-transition-old/new(root)` (which would also
  visually drag the sidebar/dock along, since everything without its own
  `view-transition-name` belongs to the `root` group), the PoC gives **`.ns-app-main`** (the
  `<main>` wrapping the routed content, sibling of `.ns-sidebar` and `.ns-mobile-dock` in
  `src/components/AppShell.tsx`) its own `view-transition-name: ns-route-content`, scoped
  under `html[data-vt] .ns-app-main`. This directly answers the plan's open question in step
  4 — **yes, root-level does conflict with the sticky glass chrome, and the fix is exactly
  this named-region scoping**, applied via a pure CSS selector with zero changes needed to
  `AppShell.tsx` itself (its existing `.ns-app-main` class was reachable from CSS alone).
- Forward and back navigation both already exist unmodified in `src/routes/InvestmentsRoute.tsx`
  (`navigate({ to: '/holdings/$ticker', params: {...} })`, lines ~1400/1487) and
  `src/routes/HoldingDetailRoute.tsx` (`navigate({ to: "/investments" })`, lines ~224/266) —
  because the transition is wired at the router-default level keyed on `fromLocation`/
  `toLocation`, **no call site needed editing**, so `HoldingDetailRoute.tsx` ended up
  untouched even though it was in-scope for edits.

### 4. Reduced-motion gotcha (found, not in the plan)

The plan states: *"Reduced-motion rule zeroes animation durations — any push/pop must
degrade to a cut automatically (it will, via that rule)."* This is very likely **not fully
true**. The existing rule (`globals.css:577-584`) is:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.001ms !important; ... }
}
```
`::view-transition-old()`, `::view-transition-new()`, `::view-transition-group()` etc. are
part of a synthetic view-transition pseudo-element tree that the universal selector `*` (and
its `::before`/`::after` pairing) does not reach — pseudo-elements need to be targeted
explicitly. So this rule, as written, would **not** silence a real push/pop animation for a
reduced-motion user. Any real Part A implementation must add an explicit override, e.g.:
```css
@media (prefers-reduced-motion: reduce) {
  ::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*) {
    animation: none !important;
  }
}
```
This is a correctness gap worth fixing in the real ticket regardless of the View Transitions
decision — flagged for the follow-up.

### Verdict: A — GO (scoped, follow-up ticket), smoothness DEVICE-DEFERRED

- Mechanism is proven and cheap: router-level `defaultViewTransition.types` resolver + a named
  `view-transition-name` on `.ns-app-main`, no per-call-site changes.
- Effort estimate for the real implementation: **S–M**. Extend the `types` resolver to cover
  all drill-down pairs (`/holdings/$ticker`, `/cash-flow/categories/$categoryName`,
  `/cash-flow/merchants/$merchantName`, `/cash-flow/reconcile/$accountId`, `/goals/fire`) by
  pattern-matching "known list route → known detail route" rather than hardcoding one pair;
  add the reduced-motion pseudo-element override from §4; decide whether "back" detection
  should use router history direction instead of a static from/to pathname table (a pathname
  table is simpler and was sufficient for this PoC, but doesn't generalize to items reached
  from multiple parents).
- Whether it actually feels compositor-smooth on macOS WKWebView / iOS Safari 18+ is
  **DEVICE-DEFERRED** — cannot be assessed headless.

---

## Part B — Scroll-edge effect inventory

### 1. Inventory (verified by `grep -rn "\bsticky\b" src/routes src/components`)

| Surface | File:line | Separates from scrolling content w/ hard border? | Qualifies for scroll-edge fade? |
|---|---|---|---|
| Demo-mode banner | `src/components/AppShell.tsx:388` (`position: sticky, top: 0`, `borderBottom: 1px solid var(--ns-border)`, opaque `var(--ns-accent-soft)` bg) | Yes | **Yes — primary candidate**, exactly what the plan names |
| In-page section nav (投資分析分頁 anchors) | `src/routes/InvestmentsAnalyticsTab.tsx:507` (`sticky top-0 z-20`, `borderBottom: 1px solid var(--ns-border)`, opaque `var(--ns-bg)` bg) | Yes | **Yes — secondary candidate** |
| Desktop broker/account panel | `src/routes/InvestmentsRoute.tsx:641` (`lg:sticky lg:top-4`) | No — it's a whole self-contained bordered box with its own internal `overflow-y-auto`, not a header-over-content pattern | No |
| Left sidebar | `src/components/AppShell.tsx:158` (`lg:sticky lg:top-0 lg:h-screen`) | No — full-height column, already translucent/glass per existing design | No |

**Correction to the plan's "Current state":** the plan's verified-state section claims
"various route-level sticky table headers" exist. Checked every `<thead>` in the repo
(`MerchantDetailRoute`, `InvestmentImportWizard`, `ManualPriceImportWizard`,
`TransactionsRoute`, `CategoryDetailRoute`, `InvestmentsRoute`, `AnnualReportRoute`) — **none
of them are `position: sticky`**. They're plain `<thead>` with a `border-bottom` on `<th>`
cells only. So the actual inventory of qualifying surfaces is smaller than the plan assumed:
**2, not "various."**

### 2. Prototype design (documented, not wired — see scope note)

**Scope note on Part B:** the plan's global Scope section confines PoC edits to
`src/routes/router.tsx`, `src/routes/HoldingDetailRoute.tsx`, `src/styles/globals.css` — but
the demo banner (the plan's own suggested prototype target) lives in
`src/components/AppShell.tsx`, which isn't in that list. Rather than stretch a fragile
inline-style attribute selector to avoid touching `AppShell.tsx` (unreliable — engines don't
guarantee stable serialization order for `[style*="..."]` matching against a live
`CSSStyleDeclaration`), this spike keeps to the letter of the file-scope restriction and
documents the design as code here instead of wiring it live. Flagging this file-scope gap
for the reviewer/plan index — a real ticket for Part B should explicitly include
`AppShell.tsx` (and `InvestmentsAnalyticsTab.tsx` for the secondary surface) in its scope.

Design that would be wired, on `AppShell.tsx`'s demo banner:
```tsx
// AppShell.tsx — track whether main content has scrolled under the sticky banner
const [scrolled, setScrolled] = useState(false);
useEffect(() => {
  const el = mainRef.current;
  if (!el) return;
  const onScroll = () => setScrolled(el.scrollTop > 0);
  el.addEventListener("scroll", onScroll, { passive: true });
  return () => el.removeEventListener("scroll", onScroll);
}, []);
```
```css
/* globals.css */
.ns-demo-banner { border-bottom: 1px solid transparent; transition: border-color 160ms var(--ns-ease), background 160ms var(--ns-ease); }
.ns-demo-banner[data-scrolled="true"] {
  border-bottom-color: var(--ns-border);
  background: color-mix(in srgb, var(--ns-accent-soft) 92%, transparent);
  backdrop-filter: blur(8px) saturate(1.1);
}
```
A pure-CSS alternative exists (`animation-timeline: scroll()` scroll-driven animations,
animating `border-color`/`opacity` with no JS at all) but its WKWebView support is the same
open question as Part A's `:active-view-transition-type()` — **DEVICE-DEFERRED**, and the
JS `scrollTop > 0` class-toggle above works everywhere today regardless, so it's the safer
default recommendation.

### Verdict: B — do-top-2 (do the demo banner + the analytics in-page nav), not the other two

- Only 2 surfaces actually qualify; that's a small enough scope to be worth doing (it's a
  visible, cheap, "Apple-native" detail on both) but not enough to warrant a shared component
  abstraction yet — inline per-surface is fine at this volume.
- Effort: **S** per surface (~1 state hook + ~10 lines CSS each), no new dependencies.
- Not blocked on any of Part A's open questions (no relation to View Transitions).

---

## Part C — Dynamic Type / text-zoom audit

### 1. Counts (verified)

```
grep -c "font-size" src/styles/globals.css        → 32
grep -rn "fontSize" src --include="*.tsx" | wc -l  → 129
```

Of those 129 inline `fontSize:` occurrences, **102 are literal numeric px values**
(`fontSize: 13`, `fontSize: 12.5`, etc. — checked via `grep -c "fontSize: [0-9]"`), scattered
across many unrelated component files (`GoalEditorSheet.tsx`, `NotificationCenter.tsx`,
`QuickAdd.tsx`, `OnboardingOverlay.tsx`, `NetWorthProjectionCard.tsx`, and more). **Zero**
reference either token ladder by variable (`grep -c 'fontSize:\s*"var(--ns-t' → 0`) — they're
fully ad-hoc, not "one token used everywhere and easy to redefine." A few (`AssetLogo.tsx:47`,
`fontSize: size * 0.4`) are computed from a numeric prop, which would need to become a
computed rem expression too, not just a token swap.

There are also **two independent, parallel type-scale systems** in `globals.css`, both
fixed-px:
- `--ns-t-*` custom properties (`globals.css:41-44`): `--ns-t-display-xl: 56px` … down to
  `--ns-t-caption: 12px`, plus a mobile override block at `globals.css:339` shrinking
  `--ns-t-body`/`--ns-t-ui` further for small viewports.
- Tailwind v4's `@theme inline` block (`globals.css:1613` onward): a *separate*,
  newer, smaller ladder — `--text-micro: 10px`, `--text-caption: 11px`, `--text-body: 13px`,
  `--text-stat: 22px` — explicitly commented as a "4.4 收斂" (consolidation) migration that
  absorbed some of the ad-hoc .5px sizes into an integer scale. This second system existing
  at all is evidence a size-related refactor was already attempted once and only partially
  landed — a rem migration would need to unify both, not just one.

### 2. Does an `--ns-t-*` → rem swap cascade cleanly?

**No.** Three independent blockers found:
1. Two token systems (`--ns-t-*` and `--text-*`) would both need conversion, and their
   current relationship isn't 1:1 (different naming, different granularity, one has a mobile
   override block the other doesn't).
2. 102 scattered literal-px inline `fontSize:` values, disconnected from either token system,
   would each need individual triage (is this a case that *should* track a token size, or was
   it intentionally fixed for a chart-tick/badge context?). This is exactly the kind of
   "silent regression risk" the finance-app correctness invariant in `AGENTS.md` warns about
   applied to layout instead of money — not unsafe, but high-review-cost.
3. `globals.css:468-469` already sets `-webkit-text-size-adjust: 100%` (and the unprefixed
   `text-size-adjust: 100%`) — this explicitly opts the whole app **out** of the browser's
   default automatic text-inflation behavior (usually there to prevent orientation-change
   auto-zoom glitches). Even after a full rem migration, the OS-level "Larger Text"
   accessibility (Dynamic Type) setting does not automatically propagate into WKWebView
   content the way it does for native UIKit/SwiftUI — it would need an explicit bridge
   (native side reads `UIContentSizeCategory`, passes a scale factor to the webview, JS sets
   a root `font-size` multiplier) even with rem sizing in place. rem alone is a
   *precondition*, not a solution.

**Caveat already correctly named in the plan:** finance tables (`tabular-nums`, 28 usages
found via `grep -rn "tabular-nums" src --include="*.tsx" | wc -l`) are the hardest surface —
column alignment across amounts breaks easily if row heights/widths respond to arbitrary user
zoom levels, and this app's whole premise (`AGENTS.md` invariant #1: "Correctness first for
finance... calculations must be explainable") means any visual regression that makes numbers
harder to compare (misaligned decimals, wrapped ticker rows) is a real trust cost, not just
cosmetic.

### Verdict: C — DEFER past GA

- Option (a) full rem migration: ruled out for now given the three blockers above; genuinely
  large, cross-cutting, high-regression-risk work for an alpha-stage app that is still
  desktop-first (per `AGENTS.md`, iOS mobile build is a recent, separate in-progress effort —
  see `project_ios_mobile` memory).
- Option (b) iOS-only `-webkit-text-size-adjust` opt-in per content-size category: possible in
  principle but doesn't help until rem/em sizing exists to scale — this is really "(a) done
  first, then (b) on top," not a standalone cheaper alternative.
- Option (c) defer past GA: **recommended.** Revisit once/if the iOS mobile build (SOP:
  `docs/ios-mobile-plan.md`) is further along and there's a concrete native-bridge mechanism
  to drive it, at which point a *targeted* rem migration (start with the finance-table-adjacent
  surfaces last, everything else first, given the caveat above) becomes worth scoping as its
  own plan.

---

## Recommended follow-ups

(Not plan stubs — per the executor's instructions, these are pointers for whoever writes the
next plan, not `plans/` entries themselves.)

1. **Part A → real ticket**: generalize the `defaultViewTransition.types` resolver in
   `router.tsx` from the one hardcoded pair to a small list-route → detail-route pattern
   table covering all five drill-down pairs named in the plan's Current State section; add
   the missing `prefers-reduced-motion` override for view-transition pseudo-elements (§4);
   decide the back-detection strategy (static pathname table vs. router history direction).
   Remove this spike's `data-vt` PoC block from `router.tsx`/`globals.css` first — it's
   throwaway and duplicative work with the real ticket otherwise. **Effort: S–M.**
2. **Part A → device verification**: once on a real macOS Sequoia+ / iOS 18+ device, confirm
   (a) the transition is actually compositor-smooth and (b) whether
   `:active-view-transition-type()` is supported in the target WKWebView build — this changes
   whether the `data-vt` attribute workaround in this PoC is still needed for the real
   implementation or whether the CSS can key directly off `:root:active-view-transition-type(push)`.
3. **Part B → real ticket**: wire the `scrollTop > 0` class-toggle design from §2 onto
   `src/components/AppShell.tsx`'s demo banner and `src/routes/InvestmentsAnalyticsTab.tsx`'s
   in-page nav (both currently out of this spike's file scope). **Effort: S**, no new
   dependencies, not blocked on Part A.
4. **Part C**: no near-term ticket recommended; revisit once the iOS mobile build has a
   concrete native-bridge story for reading `UIContentSizeCategory`, and scope it as "finance
   tables last" given the `tabular-nums` alignment risk noted above.
