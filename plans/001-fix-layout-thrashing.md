# Plan 001: Fix progress bar layout thrashing

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 2be0fe43..HEAD -- src/routes/AccountsRoute.tsx src/features/goals/FireGoalCard.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `2be0fe43`, 2026-06-26

## Why this matters

Animating layout properties (`width`, `height`, `padding`, `margin`) causes the browser to recalculate layout on every animation frame (Layout Thrashing). This produces janky, stuttering animations — especially noticeable on mobile devices and low-powered hardware. Switching to `transform: scaleX()` offloads the animation to the GPU compositor, making it smooth at 60fps with zero layout recalculation.

A full-repo search (`grep -rn "transition.*width" src/`) found **3 instances** of `width` transitions:

1. `src/routes/AccountsRoute.tsx:424` — credit utilization progress bar (**fix**)
2. `src/features/goals/FireGoalCard.tsx:94` — FIRE goal progress bar (**fix**)
3. `src/components/AppShell.tsx:148` — sidebar collapse/expand (**skip**: sidebar is a structural layout element, not a data-driven bar; `width` transition is intentional here and only fires on user toggle)

## Current state

**File 1: `src/routes/AccountsRoute.tsx:422-425`**
```tsx
<div style={{ height: 3, borderRadius: 99, background: "var(--ns-bg-hover)", overflow: "hidden" }}>
  <div style={{ width: `${utilPct}%`, height: "100%", borderRadius: 99, background: utilBarColor, transition: "width 0.3s ease" }} />
</div>
```

**File 2: `src/features/goals/FireGoalCard.tsx:92-103`**
```tsx
<div className="mt-1 h-2 overflow-hidden rounded-full" style={{ background: "var(--ns-surface-strong)" }}>
  <div
    className="h-full rounded-full transition-[width]"
    style={{
      width: `${progressPct}%`,
      background: reachedFi
        ? "var(--ns-positive, var(--ns-accent))"
        : projection.onTrack
          ? "var(--ns-accent)"
          : "var(--ns-danger, #c0392b)",
    }}
  />
</div>
```

Repo conventions:
- Design tokens: `var(--ns-ease)` = `cubic-bezier(.2,.7,.2,1)` (use this instead of generic `ease`).
- Inline styles are the convention for one-off visual tweaks in routes.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Typecheck | `npm run build`          | exit 0, no errors   |
| Lint      | `npm run lint`           | exit 0              |

## Scope

**In scope**:
- `src/routes/AccountsRoute.tsx`
- `src/features/goals/FireGoalCard.tsx`

**Out of scope**:
- `src/components/AppShell.tsx` — sidebar width transition is an intentional structural animation.
- Any other files.

## Git workflow

- Branch: `fix/ai-ui-phase-3` (or current branch)
- Commit message: `fix: replace width transitions with scaleX for GPU-composited animation`

## Steps

### Step 1: Fix AccountsRoute progress bar

In `src/routes/AccountsRoute.tsx` at line 424, replace the inner `<div>` style.

**Important**: When using `scaleX`, the element's `border-radius` gets visually compressed along the X axis. Since the outer container already has `overflow: "hidden"` and `borderRadius: 99`, remove `borderRadius` from the inner div and let the container handle rounding.

Before (line 424):
```tsx
<div style={{ width: `${utilPct}%`, height: "100%", borderRadius: 99, background: utilBarColor, transition: "width 0.3s ease" }} />
```

After:
```tsx
<div style={{ width: "100%", height: "100%", background: utilBarColor, transform: `scaleX(${(utilPct ?? 0) / 100})`, transformOrigin: "left", transition: "transform 0.3s var(--ns-ease)" }} />
```

**Verify**: `npm run build` → exit 0

### Step 2: Fix FireGoalCard progress bar

In `src/features/goals/FireGoalCard.tsx` at lines 93-102, apply the same pattern. The outer container (line 92) already has `overflow-hidden rounded-full`, so the inner div does not need its own `rounded-full`.

Before (lines 93-102):
```tsx
<div
  className="h-full rounded-full transition-[width]"
  style={{
    width: `${progressPct}%`,
    background: reachedFi ? ... : ...,
  }}
/>
```

After:
```tsx
<div
  className="h-full transition-[transform]"
  style={{
    width: "100%",
    background: reachedFi ? ... : ...,
    transform: `scaleX(${(progressPct ?? 0) / 100})`,
    transformOrigin: "left",
  }}
/>
```

Note: Keep the existing conditional `background` expression exactly as-is. Only change `width` → `transform`, remove `rounded-full`, and change `transition-[width]` → `transition-[transform]`.

**Verify**: `npm run build` → exit 0

### Step 3: Confirm no remaining layout-property transitions in progress bars

**Verify**: `grep -rn "transition.*width" src/ --include="*.tsx"` → should return only `src/components/AppShell.tsx:148` (the sidebar, which is out of scope).

## Test plan

- Manual verification: Open `/accounts` (if credit cards exist) and `/goals` to confirm progress bars render at correct widths and animate smoothly when data changes.
- `npm run build` → exit 0
- `npm run lint` → exit 0

## Done criteria

- [ ] `npm run build` exits 0
- [ ] `npm run lint` exits 0
- [ ] `grep -rn "transition.*width" src/ --include="*.tsx"` returns only `AppShell.tsx`
- [ ] `grep -n "scaleX" src/routes/AccountsRoute.tsx src/features/goals/FireGoalCard.tsx` returns matches in both files
- [ ] No files outside the in-scope list are modified (`git diff --name-only`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The code at the locations in "Current state" doesn't match the excerpts (codebase drifted).
- A step's verification fails twice after a reasonable fix attempt.
- The progress bar renders visually broken (e.g. bar fills entire width regardless of value) — this likely means `scaleX` math is wrong; STOP and report.

## Maintenance notes

- Future progress bars must use `transform: scaleX(fraction)` with `transformOrigin: "left"`, not `width` transitions. Put `border-radius` on the outer container with `overflow: hidden`, not on the inner fill bar.
- The sidebar in `AppShell.tsx` intentionally uses `width` transition — this is a structural layout animation that fires rarely, not a data-driven bar.
