# Plan 010: Fix Holdings Heatmap + Sector unreadable in light theme

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. Touch
> only the files listed as in scope. If any STOP condition occurs, stop
> immediately and report. When done, update the status row in
> `plans/README.md`. This plan has a MANDATORY visual check (Step 3) that
> cannot be automated.
>
> **Drift check (run first)**:
> `git diff --stat 9115a2b5..HEAD -- src/routes/InvestmentsAnalyticsTab.tsx`
> If the file changed since this plan was written, compare against the
> "Current state" excerpts before editing.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: correctness / UI
- **Planned at**: commit `9115a2b5`, 2026-06-15

## Why this matters

In light theme the Holdings Heatmap ("持倉熱度 · HOLDINGS HEATMAP") and the
Sector chart ("產業分類分布") sections are unreadable — text disappears into the
background. Both sections are rendered inside `NSAnBand` with `deep={true}`, and
that component hard-codes `#0a0c0e` (near-black) as its background when `deep` is
set, regardless of the current theme. In light mode the surrounding UI is near-white
but this band stays near-black, making all CSS-variable-driven text (`var(--ns-fg)`,
heading text, sector labels) invisible (dark-on-dark). Additionally the treemap cell
text color is hardcoded as `#08160a` (dark near-black); this works in dark mode
where positive cells are light mint green, but in light mode `--ns-pos` is dark
forest green `#0f7a40` so high-intensity cells are also dark — making the hardcoded
dark text invisible.

## Current state

**File**: `src/routes/InvestmentsAnalyticsTab.tsx`

**Bug 1 — `NSAnBand` hardcoded dark colors (line ~1202)**

```tsx
// src/routes/InvestmentsAnalyticsTab.tsx:1199-1212
function NSAnBand({ children, deep }: { children: ReactNode; deep?: boolean }) {
  return (
    <div
      style={{
        background: deep ? "#0a0c0e" : "var(--ns-bg-card)",  // ← BUG: hardcoded near-black
        border: deep ? "1px solid #1a1d20" : "1px solid var(--ns-border)",  // ← BUG: hardcoded dark
        borderRadius: "var(--ns-r-xl)",
        padding: 34,
      }}
    >
      {children}
    </div>
  );
}
```

Both components that use `NSAnBand deep`:
- Line ~843: `<NSAnBand deep>` → Holdings Heatmap (treemap)
- Line ~859: `<NSAnBand deep>` → Sector + Currency + Concentration allocation panel

**Bug 2 — `nsHeatText` hardcoded dark text (line ~1295)**

```tsx
// src/routes/InvestmentsAnalyticsTab.tsx:1293-1296
function nsHeatText(ret: number | null, scale = 9): string {
  if (ret == null) return "var(--ns-fg-dim)";
  return Math.abs(ret) / scale > 0.42 ? "#08160a" : "var(--ns-fg)";  // ← BUG: "#08160a" always dark
}
```

In dark mode `--ns-pos = #6ee49a` (light mint) so cells are light and dark text
works. In light mode `--ns-pos = #0f7a40` (dark forest green) so high-intensity
cells are dark and dark `#08160a` text is invisible.

**Token semantics** (from `src/styles/globals.css`):
- `--ns-bg` light = `oklch(0.972 0.006 250)` (near-white page bg)
- `--ns-bg` dark  = `oklch(0.165 0.008 250)` (near-black page bg)
- `--ns-pos` light = `#0f7a40` (dark forest green)
- `--ns-pos` dark  = `#6ee49a` (light mint green)

The fix uses `"var(--ns-bg)"` as the replacement value in both bugs because it
acts as a semantic "opposite of the cell color" in each theme — in dark mode it is
very dark (good contrast on light mint cells); in light mode it is near-white (good
contrast on dark green cells). For `NSAnBand`, `var(--ns-bg)` is the page
background token which creates a visually "sunken" treatment relative to cards in
both themes (dark: page bg is darker than cards; light: page bg is slightly grayer
than pure-white cards).

## Commands you will need

| Purpose   | Command                 | Expected on success |
|-----------|-------------------------|---------------------|
| Typecheck | `npx tsc --noEmit`      | exit 0              |
| Tests     | `npx vitest run`        | all pass (≥408)     |
| Dev (visual) | `npm run dev`        | see Step 3          |

## Scope

**In scope** (one file only):
- `src/routes/InvestmentsAnalyticsTab.tsx`

**Out of scope** (do NOT touch):
- `src/styles/globals.css` — token definitions are correct; only the component
  hard-codes non-token colors.
- Any other component. The `NSAnBand` and `nsHeatText` symbols are defined in and
  only used within this single file — no other caller will be affected.
- The `nsHeat` function's `color-mix` logic — it is correct; only the text
  contrast function `nsHeatText` needs updating.

## Git workflow

- Branch: `advisor/010-analytics-light-theme`.
- Commit: `fix(analytics): use theme tokens in NSAnBand + nsHeatText for light mode`.
- Do NOT push or open a PR unless the operator instructs it.

## Steps

### Step 1: Fix `NSAnBand` — replace hardcoded dark colors

In `src/routes/InvestmentsAnalyticsTab.tsx`, locate `function NSAnBand` (around
line 1199) and change the `deep` style values:

```tsx
// BEFORE
function NSAnBand({ children, deep }: { children: ReactNode; deep?: boolean }) {
  return (
    <div
      style={{
        background: deep ? "#0a0c0e" : "var(--ns-bg-card)",
        border: deep ? "1px solid #1a1d20" : "1px solid var(--ns-border)",

// AFTER
function NSAnBand({ children, deep }: { children: ReactNode; deep?: boolean }) {
  return (
    <div
      style={{
        background: deep ? "var(--ns-bg)" : "var(--ns-bg-card)",
        border: deep ? "1px solid var(--ns-border)" : "1px solid var(--ns-border)",
```

Only those two string values change. The `borderRadius` and `padding` are correct
and must not be touched.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Fix `nsHeatText` — replace hardcoded dark text color

In the same file, locate `function nsHeatText` (around line 1293) and change the
return value for high-intensity cells:

```tsx
// BEFORE
function nsHeatText(ret: number | null, scale = 9): string {
  if (ret == null) return "var(--ns-fg-dim)";
  return Math.abs(ret) / scale > 0.42 ? "#08160a" : "var(--ns-fg)";
}

// AFTER
function nsHeatText(ret: number | null, scale = 9): string {
  if (ret == null) return "var(--ns-fg-dim)";
  return Math.abs(ret) / scale > 0.42 ? "var(--ns-bg)" : "var(--ns-fg)";
}
```

Only the `"#08160a"` string changes to `"var(--ns-bg)"`. The threshold (0.42) and
the null guard are correct and must not change.

**Verify**: `npx tsc --noEmit` → exit 0. `npx vitest run` → all pass (≥408).

### Step 3: MANDATORY visual check (cannot be automated)

Run `npm run dev`, switch the app to **light theme**, open the Investments →
分析 tab, and confirm:

1. **Holdings Heatmap band** (`持倉熱度 · HOLDINGS HEATMAP`): the band
   background is now light (near-white/gray) — not a dark rectangle on a light
   page. Text headings and eyebrow label are readable.
2. **Treemap cells**: colored blocks are visible. Ticker symbols (`VOO`, `0050.TW`,
   etc.) and return percentages (`+25.1%`) are legible text on their colored cell
   backgrounds — no dark-on-dark disappearing text.
3. **Sector band** (`產業 · SECTOR`, `幣別曝險 · CURRENCY`): all in the same
   NSAnBand. Sector bar labels, percentages, and the currency distribution list are
   readable.
4. **Dark mode regression check**: switch back to dark mode. The Holdings Heatmap
   and Sector bands should still look like a "recessed dark feature band" — `var(--ns-bg)`
   in dark mode is `oklch(0.165...)` (near-black), which is distinctly darker than
   cards. Treemap cell text on light mint cells must still be readable.

If you cannot run the dev server in this environment, complete Steps 1–2, then STOP
and hand the Step 3 checklist to the operator as pending visual verification.

## Test plan

No new unit tests — the visual rendering cannot be covered by vitest. The gate is:
typecheck + full suite pass (Step 2), plus the Step 3 visual smoke in both light and
dark modes.

## Done criteria

ALL must hold:

- [ ] `src/routes/InvestmentsAnalyticsTab.tsx` contains `"var(--ns-bg)"` in `NSAnBand`'s `deep` branch (not `"#0a0c0e"` or `"#1a1d20"`)
- [ ] `src/routes/InvestmentsAnalyticsTab.tsx` contains `"var(--ns-bg)"` in `nsHeatText`'s high-intensity branch (not `"#08160a"`)
- [ ] `npx tsc --noEmit` exits 0
- [ ] `npx vitest run` exits 0, all pass (≥408), no test files modified
- [ ] No files outside `src/routes/InvestmentsAnalyticsTab.tsx` modified
- [ ] Step 3 visual check passed (or explicitly handed to operator as pending)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- The exact `NSAnBand` or `nsHeatText` code does not match the "Current state"
  excerpts (drift — a prior edit changed these functions).
- `npx tsc --noEmit` fails after the edit — something about the change is wrong.
- Step 3 reveals a dark-mode regression (treemap cell text unreadable on mint cells
  in dark mode) — the threshold in `nsHeatText` may need adjustment rather than a
  token swap.

## Maintenance notes

- `NSAnBand deep` now uses `var(--ns-bg)` = the page background token. This is
  intentionally "sunken" (one level below cards), not a neutral card. Future
  editorial sections can use `NSAnBand deep` confidently in both light and dark.
- If the design intent for dark mode is a *deeper-than-page* black, add a
  `--ns-bg-deep` token to `globals.css` with `oklch(0.120 0.007 250)` in dark and
  `oklch(0.935 0.009 250)` in light; then replace `"var(--ns-bg)"` in `NSAnBand`
  with `"var(--ns-bg-deep)"`. This is a deliberate design decision for a later pass.
- The `nsHeatText` threshold of `0.42` means: when the cell color is >42% of the
  way to full saturation, switch to the high-contrast text. In light mode this now
  switches to near-white, which is correct. If the threshold needs tuning, adjust
  only the numeric constant.
