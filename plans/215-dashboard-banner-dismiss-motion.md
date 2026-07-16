# 215 — Animate dashboard banner dismissal (collapse, don't teleport)

- **Status**: TODO
- **Commit**: `ae708c1b`
- **Severity**: MEDIUM
- **Category**: Missed opportunity (jarring state change)
- **Estimated scope**: 2 files (`src/routes/DashboardRoute.tsx`, `src/styles/globals.css`), ~50 lines

## Problem

Dismissing a dashboard banner removes it from layout in a single frame — everything below (the header row, KPI strip, charts) **jumps up 50+px with no transition**. This is the most jarring state change on the app's most-visited page.

Two banners share the pattern — a conditional render keyed on the dismissed-fingerprint store:

```tsx
// src/routes/DashboardRoute.tsx:985 — data-health banner
{dataHealthFingerprint !== dismissedBanners.dataHealth ? (
  !dataHealthReport.healthy ? (
    <div className="text-body" style={{ padding: "10px 14px", borderRadius: "var(--ns-r-md)", background: ..., border: "1px solid var(--ns-border)", marginBottom: 14 }}>
```

```tsx
// src/routes/DashboardRoute.tsx:1064 — over-budget banner
{overBudget.length > 0 && overBudgetFp !== dismissedBanners.overBudget ? (
  <div className="text-body" style={{ display: "flex", ..., marginBottom: 14 }}>
```

Dismiss handlers that flip the store directly: `DashboardRoute.tsx:1016`, `:1056` (data-health), `:1076` (over-budget) — all call `setDismissedBanner(key, fingerprint)`.

## Target

On dismiss, the banner fades and its layout space collapses over 200ms; content below glides up instead of jumping. Banner *appearance* (initial page load) stays instant — do not animate entrances.

```css
/* src/styles/globals.css — target (add after the .ns-toast block or plan 214's block) */

/* ── Dashboard banner dismiss collapse (plan 215) ── */
.ns-banner-collapse {
  display: grid;
  grid-template-rows: 1fr;
  transition: grid-template-rows 200ms var(--ns-ease), opacity 160ms var(--ns-ease), margin-bottom 200ms var(--ns-ease);
  margin-bottom: 14px;
}
.ns-banner-collapse > * { min-height: 0; overflow: hidden; }
.ns-banner-collapse[data-dismissed] {
  grid-template-rows: 0fr;
  opacity: 0;
  margin-bottom: 0;
  pointer-events: none;
}
```

(The `1fr → 0fr` grid-row trick collapses `height: auto` content without measuring. It is a layout animation, but scoped to one element, 200ms, occasional-frequency — acceptable; there is no transform-only way to collapse layout space.)

Component: dismiss sets local "dismissing" state → collapse plays → on `transitionend` the real `setDismissedBanner(...)` fires and the node unmounts.

## Repo conventions to follow

- Tokens at `src/styles/globals.css:47-50`; use `var(--ns-ease)`, never hand-typed beziers.
- Exit-then-unmount via `transitionend` + timeout fallback: exemplar `src/components/ModalShell.tsx:246-268`.
- Static styles go in a `ns-*` class, not inline (AGENTS.md 樣式撰寫優先序); the banners' `marginBottom: 14` moves into the wrapper class.

## Steps

1. **`src/styles/globals.css`**: add the `.ns-banner-collapse` block exactly as in Target, with the section header comment.
2. **`src/routes/DashboardRoute.tsx`**: add local state near the other banner state (~line 170):
   ```tsx
   const [dismissingBanner, setDismissingBanner] = useState<"dataHealth" | "overBudget" | null>(null);
   ```
   and a helper:
   ```tsx
   function dismissBannerAnimated(key: "dataHealth" | "overBudget", fingerprint: string, e: React.MouseEvent) {
     const wrapper = (e.currentTarget as HTMLElement).closest(".ns-banner-collapse");
     if (!wrapper) { setDismissedBanner(key, fingerprint); return; }
     setDismissingBanner(key);
     let done = false;
     const finish = () => { if (done) return; done = true; setDismissedBanner(key, fingerprint); setDismissingBanner(null); };
     wrapper.addEventListener("transitionend", (ev) => { if (ev.target === wrapper) finish(); }, { once: true });
     window.setTimeout(finish, 300); // reduced-motion / missed-event fallback
   }
   ```
3. Wrap each banner in the collapse wrapper. For the data-health banner (line 985) and the over-budget banner (line 1064):
   ```tsx
   <div className="ns-banner-collapse" data-dismissed={dismissingBanner === "dataHealth" || undefined}>
     <div> {/* existing banner div, unchanged, minus its marginBottom */} </div>
   </div>
   ```
   Remove `marginBottom: 14` from each banner's inline style (the wrapper class now owns it). Use `data-dismissed={dismissingBanner === "overBudget" || undefined}` for the second banner.
4. Point the three dismiss `onClick`s (lines 1016, 1056, 1076) at `dismissBannerAnimated(key, fingerprint, e)` with the same key/fingerprint arguments they pass today.
5. The data-health banner has an expand/collapse (`setHealthExpanded`) header click — leave it untouched; only the ✕/dismiss actions change.

## Boundaries

- Do NOT animate banner entrances (page-load content must not shift late).
- Do NOT touch banner copy, fingerprints, or the `useUiPreferences` store shape.
- Do NOT touch the AI-summary block or the header row below the banners.
- If line numbers drifted, re-locate by the quoted code; if the banner structure changed, STOP and report.

## Verification

- **Mechanical**: `npx tsc --noEmit`, `npm run lint`, `npm test` — clean.
- **Feel check**: in the dev app with a triggerable banner (demo mode usually surfaces the over-budget one; data-health can be forced by any integrity warning):
  - Click ✕: the banner fades while its space closes; the KPI strip below **glides** up — no frame where content jumps.
  - DevTools Animations panel at 10% speed: opacity finishes slightly before the height (160ms vs 200ms) — the content should be invisible before the space is fully gone, so no squashed-text frame is visible.
  - Reload after dismissal: banner is simply absent (persistence unchanged).
  - Emulate `prefers-reduced-motion: reduce`: dismissal is instant, and the banner still actually dismisses (timeout fallback).
- **Done when**: both banners dismiss with the collapse, persistence still works, and no squashed-content frame is visible at 10% playback.
