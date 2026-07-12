# Plan 160: Interaction polish batch — instant ⌘K, faster QuickAdd, segmented-control sliding thumb, privacy-toggle scroll/blur, haptics wiring

> **Executor instructions**: Follow this plan step by step. The five parts are
> independent — if one hits a STOP condition, report it and continue with the
> others. Run every verification command before moving on. When done, update
> the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 37ccb332..HEAD -- src/components/ui/command.tsx src/components/QuickAdd.tsx src/components/SegmentedControl.tsx src/components/AppShell.tsx src/state/uiPreferences.ts`
> On drift, compare the "Current state" excerpts against live code; mismatch
> in a part = STOP for that part only.

## Status

- **Priority**: P2
- **Effort**: M (five small independent parts)
- **Risk**: LOW-MED — part 4 touches the privacy toggle (privacy-critical:
  the mask must never under-apply); part 5 touches the Rust workspace
- **Depends on**: none (independent of 156–159)
- **Category**: tech-debt (interaction polish)
- **Planned at**: commit `37ccb332`, 2026-07-12

## Why this matters

Five small frictions in the highest-frequency interactions: (1) the ⌘K
command palette animates open — a keyboard-initiated action used dozens of
times a day should be instant; (2) QuickAdd (⌘N, THE core action of an
expense tracker) has a 180 ms entrance — snappier reads as more responsive;
(3) SegmentedControl's active state teleports between options instead of
sliding (the iOS-signature motion); (4) toggling privacy mode (⌘⇧H) remounts
the whole `<main>`, **losing the user's scroll position**; (5) the app has
zero haptic feedback wired for the upcoming iOS build.

## Current state

All excerpts verified at commit `37ccb332`.

- **Part 1 — ⌘K**: `src/components/GlobalSearch.tsx:94` renders
  `<CommandDialog>` from `src/components/ui/command.tsx:34-54`, which wraps
  `<DialogContent>` from `src/components/ui/dialog.tsx:54`, whose classes
  include `duration-100 data-open:animate-in data-open:fade-in-0
  data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0
  data-closed:zoom-out-95`. `CommandDialog` already forwards a `className`
  to `DialogContent` (`command.tsx:54` area — confirm when editing).
- **Part 2 — QuickAdd**: `src/components/QuickAdd.tsx:237`:

  ```tsx
  className="animate-[ns-drawer-in_180ms_cubic-bezier(0.22,1,0.36,1)] flex flex-col gap-2.5"
  ```

- **Part 3 — SegmentedControl**: `src/components/SegmentedControl.tsx` wraps
  COSS `ToggleGroup`; the active item is restyled inline (background/shadow
  swap), no transition:

  ```tsx
  style={ value === option.value ? { background: "var(--ns-surface-elevated)", ... } : { background: "transparent", ... } }
  ```

- **Part 4 — privacy remount**: `src/components/AppShell.tsx:357-366`:

  ```tsx
  <main
    key={privacyMode ? "privacy-on" : "privacy-off"}
    className="ns-app-main pb-20 lg:pb-0 min-w-0"
  ```

  The `key` remount is **deliberate**: the money formatters read a module
  global (`setPrivacyMaskOn` in `src/domain/currency.ts`, synced by
  `usePrivacySync` in `src/state/uiPreferences.ts:398-403`), so a full
  re-render is the guarantee that every amount re-masks. KEEP the remount.
  Toggle entry points: sidebar button (`AppShell.tsx:312-327`, calls
  `togglePrivacy` = store's `togglePrivacyMode`) and `usePrivacyShortcut`
  (`AppShell.tsx:694-709`, same store action). The store action lives in
  `src/state/uiPreferences.ts:289-295` (`setPrivacyMode`/`toggle`).
- **Part 5 — haptics**: no haptics anywhere
  (`grep -rn "haptic" src src-tauri/Cargo.toml` → 0 matches).
  `src-tauri/Cargo.toml` already demonstrates the mobile/desktop gating
  pattern: `tauri-plugin-window-state = "2"` under a desktop-only cfg
  (`Cargo.toml:37-42`). Tests gotcha (AGENTS.md): vitest jsdom lacks
  `localStorage`; stub per-test with `vi.stubGlobal`.

## Commands you will need

| Purpose   | Command              | Expected on success |
|-----------|----------------------|---------------------|
| Typecheck + build | `npm run build` | exit 0 |
| Tests     | `npm test`           | all pass |
| Lint      | `npm run lint`       | exit 0 |
| Rust      | `npm run check:tauri` | exit 0 (fmt + check) |

## Scope

**In scope**:
- `src/components/ui/command.tsx` (Part 1)
- `src/components/QuickAdd.tsx` (Part 2, one class string)
- `src/components/SegmentedControl.tsx` + `src/styles/globals.css` (Part 3)
- `src/components/AppShell.tsx` + `src/styles/globals.css` (Part 4)
- `src/lib/haptics.ts` (create), `src/lib/haptics.test.ts` (create),
  `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`,
  `src-tauri/capabilities/` (Part 5), `src/components/QuickAdd.tsx` +
  `src/state/uiPreferences.ts` call sites (Part 5)
- `package.json` / `package-lock.json` (Part 5: JS guest bindings, if the
  plugin provides one)

**Out of scope**:
- `ui/dialog.tsx` itself — other dialogs keep their animation; only the
  CommandDialog instance goes instant.
- ModalShell/Toast motion (plans 157/158). The `<main key>` remount mechanism
  and the formatter global (privacy correctness is settled design — plan 101).

## Git workflow

- Branch: `feat/ai-interaction-polish`. Conventional commits, one commit per
  part. Do NOT push or open a PR unless the operator instructed it.

## Steps

### Part 1: ⌘K opens instantly

In `command.tsx`'s `CommandDialog`, append to the `DialogContent` className:
`data-open:animate-none data-closed:animate-none` (tw-animate-css respects
`animate-none` as an override; if the closed-state class ordering makes the
close still animate, additionally pass `duration-0`). Only the CommandDialog
call — not DialogContent's own definition.

**Verify**: `npm run build` → exit 0. Manual: ⌘K appears/disappears with no
zoom/fade.

### Part 2: QuickAdd enter at 140 ms

In `QuickAdd.tsx:237` change `ns-drawer-in_180ms` → `ns-drawer-in_140ms`
(same easing).

**Verify**: `grep -n "ns-drawer-in_140ms" src/components/QuickAdd.tsx` → 1 match; `npm run build` → exit 0.

### Part 3: SegmentedControl sliding thumb

Rebuild the active-state visual as a measured, transform-animated indicator:

1. Container (the existing wrapper div) gets `position: relative` and a ref.
2. Each `ToggleGroupItem` keeps its label styling but **drops** the
   background/shadow swap (active item keeps only the `color` change).
3. Add an absolutely-positioned thumb div (`.ns-seg-thumb`, `aria-hidden`)
   as the container's first child, styled in globals.css:

   ```css
   .ns-seg-thumb {
     position: absolute; top: 4px; bottom: 4px; left: 0;
     border-radius: calc(var(--ns-r-md) - 4px);
     background: var(--ns-surface-elevated);
     border: 1px solid var(--ns-border);
     box-shadow: 0 1px 2px rgba(0,0,0,0.05);
     transition: transform var(--ns-dur) var(--ns-ease), width var(--ns-dur) var(--ns-ease);
     will-change: transform;
   }
   ```

4. A `useLayoutEffect` keyed on `[value, options.length, fullWidth]` measures
   the active item (`container.querySelector('[data-pressed]')` — Base UI sets
   `data-pressed` on the pressed toggle; verify in the DOM and fall back to
   `[aria-pressed="true"]`) and sets the thumb's inline
   `transform: translateX(${offsetLeft}px)` and `width: ${offsetWidth}px`.
   Add a `ResizeObserver` on the container re-running the measurement.
   Hide the thumb (`opacity: 0`) until the first measurement to avoid a
   flash at x=0.

Note: width is not compositor-cheap, but segment counts are tiny and the
transition is 200 ms — acceptable; do not convert to scaleX (it would distort
the border).

**Verify**: `npm run build` → exit 0; `npm test` → all pass (SegmentedControl
consumers render unchanged semantics — ToggleGroup still drives selection).
Manual: 投資頁 segmented controls slide between options.

### Part 4: Privacy toggle keeps scroll position (+ masked-value blur)

1. In `AppShell`, create the wrapper used by BOTH entry points:

   ```tsx
   const privacyScrollRef = useRef(0);
   const handleTogglePrivacy = useCallback(() => {
     privacyScrollRef.current = window.scrollY;
     togglePrivacy();
   }, [togglePrivacy]);
   useLayoutEffect(() => {
     window.scrollTo(0, privacyScrollRef.current);
   }, [privacyMode]);
   ```

   Sidebar button `onClick={handleTogglePrivacy}`; change `usePrivacyShortcut`
   to accept the callback (`usePrivacyShortcut(handleTogglePrivacy)`) instead
   of reading the store action internally.
2. Blur crossfade on the remounted main — only after the first toggle (an app
   launch must not blur): keep a `hasToggledRef`, set it in
   `handleTogglePrivacy`; pass `data-privacy-anim` on `<main>` when set, with:

   ```css
   @keyframes ns-privacy-in { from { filter: blur(6px); opacity: .6; } to { filter: blur(0); opacity: 1; } }
   main[data-privacy-anim] { animation: ns-privacy-in 160ms var(--ns-ease); }
   ```

**Verify**: `npm run build` → exit 0. Manual: scroll mid-page on 總覽, press
⌘⇧H → amounts mask, scroll position unchanged, content blurs in briefly.
Launch the app fresh → no blur on first paint.

### Part 5: Haptics abstraction + wiring (device verification deferred)

1. Add the official plugin: `tauri-plugin-haptics = "2"` in
   `src-tauri/Cargo.toml` gated to mobile
   (`[target."cfg(any(target_os = \"ios\", target_os = \"android\"))".dependencies]`
   — mirror how mobile/desktop gating is done for window-state, inverted),
   register it in `src-tauri/src/lib.rs` under `#[cfg(mobile)]`, add the
   capability/permission JSON per the plugin README, and install the guest JS
   package `@tauri-apps/plugin-haptics`.
2. Create `src/lib/haptics.ts` — a safe wrapper that is a **silent no-op**
   outside Tauri-mobile:

   ```ts
   type Impact = "light" | "medium";
   export async function haptic(kind: Impact | "success" | "selection"): Promise<void> {
     try {
       if (!("__TAURI_INTERNALS__" in window)) return;
       const mod = await import("@tauri-apps/plugin-haptics");
       // map: success → notificationFeedback, selection → selectionFeedback,
       // light/medium → impactFeedback — match the plugin's actual exports.
       ...
     } catch { /* desktop or plugin absent — never throw */ }
   }
   ```

3. Wire exactly three call sites: QuickAdd save success (`haptic("success")`,
   next to its success toast), privacy toggle (`haptic("selection")` inside
   `handleTogglePrivacy`), TransactionDetailPanel 確定刪除 confirm
   (`haptic("medium")`).
4. `src/lib/haptics.test.ts`: in jsdom (no `__TAURI_INTERNALS__`), `haptic()`
   resolves without throwing and performs no dynamic import (spy on it or
   assert no rejection).

**Verify**: `npm run build` → exit 0; `npm test` → all pass incl. the new
test; `npm run check:tauri` → exit 0 (desktop target compiles with the plugin
compiled out). Real haptic output is verified later on an iOS device build
(docs/ios-mobile-plan.md) — note this in the status row.

## Done criteria

- [ ] `npm run build`, `npm test`, `npm run lint`, `npm run check:tauri` all exit 0
- [ ] ⌘K dialog carries `animate-none` overrides (grep `animate-none` in command.tsx)
- [ ] QuickAdd enter is 140 ms (grep gate in Part 2)
- [ ] SegmentedControl renders a `.ns-seg-thumb` that moves on selection
- [ ] Privacy toggle preserves `window.scrollY` (manual check noted in status row)
- [ ] `src/lib/haptics.ts` + passing test exist; three call sites wired
- [ ] `git status` clean outside the in-scope list
- [ ] `plans/README.md` status row updated (note device-deferred haptics)

## STOP conditions

Stop and report back (do not improvise) if:

- Part 1: `animate-none` doesn't suppress the tw-animate-css animation —
  report the class combination you tried; do not restructure dialog.tsx.
- Part 3: Base UI's toggle items expose neither `data-pressed` nor
  `aria-pressed` in the rendered DOM.
- Part 4: restoring scroll fights TanStack Router's own scroll behaviour
  (scroll jumps to top anyway) — report; do not patch the router.
- Part 5: `tauri-plugin-haptics` v2 doesn't exist on crates.io / its API
  differs from the impact/notification/selection model — report the actual
  API surface; the wrapper's public signature may not grow platform ifs at
  call sites.

## Maintenance notes

- The haptics wrapper is the ONLY sanctioned entry point — future callers must
  never import the plugin directly (keeps desktop no-op guarantees in one
  place). Reviewer: check the three call sites don't await `haptic()` in a way
  that delays UI feedback (fire-and-forget `void haptic(...)` is correct).
- If plan 159's drag-dismiss lands, a `selection` haptic at the
  dismiss-commit point is a natural follow-up — one line at the `requestClose`
  call in the gesture handler.
- If the ⌘K instant-open feels too abrupt to the operator, the fallback is a
  75 ms fade (opacity only) — deliberately not chosen by default.
