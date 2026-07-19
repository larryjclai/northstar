# Plan 233: 年度報表列印 — gate the 列印 button off coarse-pointer (mobile) devices

> **Executor instructions**: Follow this plan step by step. Run every
> verification command. On any STOP condition, stop and report. Do NOT update
> `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 4f9356fa..HEAD -- src/routes/AnnualReportRoute.tsx`
> Mismatch = STOP.

## Status

- **Priority**: P3 (plan 173's recorded deferred polish, item b)
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: UX polish
- **Planned at**: commit `4f9356fa`, 2026-07-19

## Why this matters

Plan 173 shipped 列印/匯出 PDF on `/reports/annual` via `window.print()` and
recorded a deferral: on iOS WKWebView `window.print()` technically works but is
unpolished — the print CSS was designed for desktop. The decided fix: hide the
列印 button on mobile-class devices rather than ship a rough experience. The
repo's mobile signal is the ModalShell media query.

## Current state

- `src/routes/AnnualReportRoute.tsx:185-192` — the button:

  ```tsx
  <Button
    variant="outline"
    disabled={printButton.disabled}
    title={printButton.title}
    onClick={() => window.print()}
  >
    <Printer size={14} />列印 / 匯出 PDF
  </Button>
  ```

- Mobile-detection convention — `src/components/ModalShell.tsx:140-143`:
  `window.matchMedia("(pointer: coarse), (max-width: 1023px)").matches`,
  guarded for jsdom (`typeof window.matchMedia === "function"`). Note
  ModalShell samples it in state; for this static gate a simpler render-time
  check is fine, but keep the jsdom guard.

## Commands

| Purpose   | Command            | Expected |
|-----------|--------------------|----------|
| Typecheck | `npx tsc --noEmit` | 0        |
| Lint      | `npm run lint`     | 0 errors / 761 warnings |
| Tests     | `npm test`         | all pass (no new tests needed — jsdom lacks matchMedia; stub-based test optional) |

## Scope

**In scope**: `src/routes/AnnualReportRoute.tsx` only.
**Out of scope**: the `@media print` CSS, the CSV 匯出 button, ModalShell.

## Steps

1. Add near the component top:
   ```tsx
   // 列印 is desktop-only (plan 173 deferral → 233): iOS WKWebView's
   // window.print() renders the desktop print CSS poorly — hide, don't degrade.
   const coarsePointer =
     typeof window.matchMedia === "function" &&
     window.matchMedia("(pointer: coarse), (max-width: 1023px)").matches;
   ```
2. Wrap the 列印 button: `{!coarsePointer ? <Button ...>列印 / 匯出 PDF</Button> : null}`.
   The CSV 匯出 button beside it stays unconditional.

**Verify**: `npx tsc --noEmit` → 0; `npm run lint` → 0/761; `npm test` → all pass.

## Done criteria

- [ ] Gates green
- [ ] `grep -n "coarsePointer" src/routes/AnnualReportRoute.tsx` shows gate + usage
- [ ] Desktop viewport still shows the button (reviewer dev-server check;
  resize to 375px → button gone, CSV stays)

## STOP conditions

- The button markup at `:185-192` doesn't match (drift).

## Maintenance notes

- Plan 173's OTHER deferred item — the human eyeball of actual print output
  (dark theme, long multi-year report, no page-split through a year row) —
  remains operator-only; this plan does not close it. Reviewer can partially
  check via DevTools print-media emulation but paper/PDF output needs a real
  print dialog.
