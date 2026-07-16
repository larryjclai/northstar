# 217 — Motion hygiene batch: layout-prop transitions, hardcoded beziers, transition-all

- **Status**: TODO
- **Commit**: `ae708c1b`
- **Severity**: LOW (mechanical, no feel change intended except A)
- **Category**: Performance / Cohesion & tokens
- **Estimated scope**: 4 files, ~10 lines changed

Four small, independent fixes. Each step is self-contained; land them together as one mechanical commit.

## A. Toggle thumb animates `left` → animate `transform`

```tsx
// src/routes/RecurringRulesTab.tsx:508-515 — current
<div style={{
  width: 32, height: 18, borderRadius: 9, background: form.isActive ? "var(--ns-pos)" : "var(--ns-fg-dim)",
  position: "relative", transition: "background 0.2s",
}}>
  <div style={{
    position: "absolute", top: 2, width: 14, height: 14, borderRadius: 7,
    background: "var(--ns-bg-elev)", transition: "left 0.2s",
    left: form.isActive ? 16 : 2,
  }} />
</div>
```

`left` transitions run layout every frame. Target — static `left: 2`, thumb travel via transform (16 − 2 = 14px), tokens instead of bare `0.2s`:

```tsx
<div style={{
  width: 32, height: 18, borderRadius: 9, background: form.isActive ? "var(--ns-pos)" : "var(--ns-fg-dim)",
  position: "relative", transition: "background var(--ns-dur) var(--ns-ease)",
}}>
  <div style={{
    position: "absolute", top: 2, left: 2, width: 14, height: 14, borderRadius: 7,
    background: "var(--ns-bg-elev)", transition: "transform var(--ns-dur) var(--ns-ease)",
    transform: form.isActive ? "translateX(14px)" : "translateX(0)",
  }} />
</div>
```

## B. QuickAdd hardcodes the bezier that already exists as a token

```tsx
// src/components/QuickAdd.tsx:279 — current
className="animate-[ns-drawer-in_140ms_cubic-bezier(0.22,1,0.36,1)] flex flex-col gap-2.5"
```

`cubic-bezier(0.22,1,0.36,1)` is byte-identical to `--ns-ease-out-strong` (`src/styles/globals.css:50`). Target:

```tsx
className="animate-[ns-drawer-in_140ms_var(--ns-ease-out-strong)] flex flex-col gap-2.5"
```

(Tailwind v4 arbitrary values accept `var()`; no spaces inside the brackets. Verify the compiled CSS still contains the keyframe reference — `npm run build` then grep the output for `ns-drawer-in`.)

## C. `transition-all` on the legacy ui/button

```tsx
// src/components/ui/button.tsx:7 — current (excerpt)
"... whitespace-nowrap transition-all outline-none select-none ... active:not-aria-[haspopup]:translate-y-px ..."
```

`transition: all` animates unintended properties (e.g. width when a label swaps) off the compositor. This legacy button is only used inside `src/components/ui/{input-group,dialog,calendar}.tsx`, but the fix is one token. Target — replace `transition-all` with:

```
transition-[color,background-color,border-color,box-shadow,opacity]
```

**Deliberately exclude `transform`**: the app-wide press feedback (`globals.css:609-612` `:active { transform: translateY(1px) }`) is an *instant* nudge by design (documented "no bounce" macOS decision); transitioning transform here would make these three surfaces lag behind every other button.

## D. Sidebar collapse uses untokened `ease`

```tsx
// src/components/AppShell.tsx:155 — current
style={{ gridTemplateColumns: collapsed ? "64px 1fr" : "240px 1fr", transition: "grid-template-columns 0.2s ease" }}

// src/components/AppShell.tsx:178 — current
transition: "width 0.2s ease, min-width 0.2s ease, padding 0.2s ease",
```

Target — same 200ms, token easing (the two transitions must stay in lockstep):

```tsx
transition: "grid-template-columns var(--ns-dur) var(--ns-ease)"
transition: "width var(--ns-dur) var(--ns-ease), min-width var(--ns-dur) var(--ns-ease), padding var(--ns-dur) var(--ns-ease)"
```

**Note (recorded, not fixed here)**: this collapse animates layout of the entire app grid for 200ms. That is inherent to a push-style sidebar — a transform-only rewrite would require overlaying + snapping content and is not worth it unless device QA shows dropped frames. If jank is ever observed on iPad/low-end hardware, that becomes its own plan; do not attempt it in this batch.

## Repo conventions to follow

- Tokens at `src/styles/globals.css:47-50`: `--ns-ease: cubic-bezier(.2,.7,.2,1)`, `--ns-dur: 200ms`, `--ns-ease-out-strong: cubic-bezier(0.22, 1, 0.36, 1)`.
- Dynamic values stay inline; these styles are already inline because they're dynamic or component-local one-offs — don't extract classes in this batch.

## Steps

1. Apply A in `src/routes/RecurringRulesTab.tsx:508-515`.
2. Apply B in `src/components/QuickAdd.tsx:279`.
3. Apply C in `src/components/ui/button.tsx:7`.
4. Apply D in `src/components/AppShell.tsx:155` and `:178`.

## Boundaries

- Do NOT redesign the RecurringRules toggle into a shared Switch component (none exists; out of scope).
- Do NOT change any duration or visual value beyond what's specified (0.2s → `var(--ns-dur)` is 200ms — identical).
- Do NOT touch `coss/button.tsx` (already `transition-shadow` only) or the global `:active` rule.
- If any quoted code doesn't match, STOP and report.

## Verification

- **Mechanical**: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build` (then confirm the built CSS still emits the `ns-drawer-in` animation with `var(--ns-ease-out-strong)`).
- **Feel check**:
  - 週期規則 → edit a rule → toggle 啟用中/已暫停: thumb slides identically to before (200ms), background crossfades; at 10% playback the thumb moves smoothly (transform), not in layout steps.
  - ⌘N / QuickAdd: drawer entrance is indistinguishable from before (same curve, now via token).
  - Sidebar collapse toggle: same speed/feel, slightly snappier tail from `--ns-ease`.
- **Done when**: `grep -rn "cubic-bezier" src --include='*.tsx'` returns nothing, `grep -n "transition-all" src/components/ui/button.tsx` returns nothing, and `grep -n "transition: \"left" src -r` returns nothing.
