# 216 — Unify expand/collapse motion: rotating carets + content enter

- **Status**: TODO
- **Commit**: `ae708c1b`
- **Severity**: MEDIUM (high-traffic rows) / LOW (caret cohesion)
- **Category**: Cohesion & tokens / Missed opportunity
- **Estimated scope**: 5 files, ~30 lines

## Problem

The app has two competing expand/collapse languages:

**A. Carets.** Two sites rotate a single caret smoothly; three sites hard-swap between two different icons (`CaretRight` ↔ `CaretDown`), which flips in one frame:

```tsx
// GOOD — src/routes/InvestmentsRoute.tsx:1570-1574 (exemplar, do not change)
<CaretRight size={14} aria-hidden="true"
  style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s" }} />

// GOOD — src/routes/BulkCategorizeCard.tsx:112 (rotate(180deg) on a CaretDown; do not change)

// BAD — src/routes/ReconcileRoute.tsx:294
{open ? <CaretDown size={14} /> : <CaretRight size={14} />}

// BAD — src/routes/AnnualReportRoute.tsx:237-238
isOpen ? <CaretDown size={13} /> : <CaretRight size={13} />

// BAD — src/components/CategoryManagementDrawer.tsx:164
{isExp ? <CaretDown size={14} weight="bold" /> : <CaretRight size={14} weight="bold" />}
```

**B. Expanded content teleports.** The two highest-traffic expansions — holdings rows (投資) and reconcile periods (對帳) — pop their detail content in with zero transition:

```tsx
// src/routes/InvestmentsRoute.tsx:1577-1589 — HoldingExpansion mounts with no motion
{isExpanded ? (
  <HoldingExpansion position={position} ... />
) : null}

// src/routes/ReconcileRoute.tsx:325-329 — period rows mount with no motion
{open ? (
  period.rows.length === 0 ? (
    <div className="muted text-body" style={{ padding: "16px 18px" }}>本期尚無交易。</div>
  ) : (
    period.rows.map((row, i) => (
```

No height animation is wanted (finance tables; content below will reflow regardless), but a brief content fade-in removes the single-frame "slam".

## Target

**Carets**: one convention — a single `CaretRight` rotated 90° when open, transitioning transform over 150ms with the repo easing token:

```tsx
<CaretRight size={14} style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 150ms var(--ns-ease)" }} />
```

**Content enter**: a shared utility class, applied to expansion content:

```css
/* src/styles/globals.css — target */

/* ── Expand/collapse content enter (plan 216) ── */
.ns-expand-in {
  transition: opacity 150ms var(--ns-ease-out-strong), transform 150ms var(--ns-ease-out-strong);
  @starting-style { opacity: 0; transform: translateY(-4px); }
}
```

Enter-only (no exit animation): collapse should be instant — closing is a dismissal, the user has moved on.

## Repo conventions to follow

- Tokens: `--ns-ease`, `--ns-ease-out-strong` at `src/styles/globals.css:47-50`.
- `@starting-style` enter pattern: `src/styles/globals.css:358-366` (`.ns-overlay-scrim`).
- Caret rotation exemplar: `src/routes/InvestmentsRoute.tsx:1570-1574` (but note its `transition: "transform 0.15s"` omits the easing token — new sites should write `150ms var(--ns-ease)`; also fix the exemplar's own transition string to match, transform value untouched).
- Repeated static inline styles should be a class; the caret style appears 4+ times after this change — if a shared `ns-*` class is cleaner, add `.ns-caret-rotate { transition: transform 150ms var(--ns-ease); }` and keep only the dynamic `transform` inline (AGENTS.md 樣式撰寫優先序 rule 3: inline is for dynamic values only).

## Steps

1. **`src/styles/globals.css`**: add `.ns-expand-in` (Target above) and `.ns-caret-rotate { transition: transform 150ms var(--ns-ease); }`, with section comment, after the toast/notification motion blocks.
2. **`src/routes/ReconcileRoute.tsx:294`**: replace the icon swap with `<CaretRight size={14} className="ns-caret-rotate" style={{ transform: open ? "rotate(90deg)" : "none" }} />`. Drop the now-unused `CaretDown` import if nothing else uses it (check line 1's import list).
3. **`src/routes/AnnualReportRoute.tsx:237-238`**: same replacement at `size={13}`. Prune unused imports likewise.
4. **`src/components/CategoryManagementDrawer.tsx:164`**: same replacement, keeping `weight="bold"` and `size={14}`. Prune unused imports.
5. **`src/routes/InvestmentsRoute.tsx:1570-1574`**: convert the exemplar to the shared class: `className="ns-caret-rotate"`, inline style reduced to the dynamic `transform`. **`src/routes/BulkCategorizeCard.tsx:112`**: same conversion (its `rotate(180deg)` on `CaretDown` semantics stay exactly as-is — only the transition string moves to the class).
6. **Content enter — 投資**: in `src/routes/InvestmentsRoute.tsx`, find `function HoldingExpansion(` (line 1631) and add `ns-expand-in` to its root element's className.
7. **Content enter — 對帳**: in `src/routes/ReconcileRoute.tsx:325-329`, add `ns-expand-in` to the empty-state `<div>` and to each mapped row `<div>` (they enter together — no stagger; stagger on a reconcile task list would slow the user down).

## Boundaries

- Do NOT animate height/max-height anywhere — content enter is opacity+transform only.
- Do NOT touch `src/routes/AnnualReportRoute.tsx`'s expanded `<tr>` content — transforms on table rows render inconsistently; the caret fix alone is that site's scope.
- Do NOT change which element toggles, keyboard handling, or aria attributes.
- Do NOT add exit animations to expansions.
- If code at a cited line doesn't match the quote, re-locate by content; if the structure changed, STOP and report.

## Verification

- **Mechanical**: `npx tsc --noEmit`, `npm run lint` (catches unused icon imports), `npm test`.
- **Feel check**:
  - 投資 → click a holdings row: caret rotates (not swaps), detail block fades in with a 4px rise. At 10% playback (DevTools Animations) confirm the content never starts from fully transparent + wrong position (i.e. `@starting-style` fires — if it doesn't in the dev browser, check the WKWebView/Chrome version note at `globals.css:358-362`).
  - 對帳 → expand a period: same. Collapse: instant, no exit flicker.
  - 分類管理 drawer + 年度報表: carets rotate; expanded content behavior unchanged in 年度報表.
  - Rapid open/close spam on a holdings row: transitions retarget smoothly, no restart-from-zero.
  - `prefers-reduced-motion: reduce`: everything still expands/collapses, instantly.
- **Done when**: `grep -rn "CaretDown" src/routes/ReconcileRoute.tsx src/routes/AnnualReportRoute.tsx src/components/CategoryManagementDrawer.tsx` shows no conditional caret swaps remain (legit non-toggle uses may stay), and all five sites share the same rotate + enter language.
