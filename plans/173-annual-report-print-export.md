# Plan 173: 年度報表列印/匯出 — make the annual report leave the app (print-CSS first, PDF only if needed)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update the status row in `plans/README.md` — unless a reviewer
> dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 4ac63576..HEAD -- src/routes/AnnualReportRoute.tsx src/routes/router.tsx src/styles/globals.css`
> On drift, compare "Current state" excerpts against live code; on a mismatch,
> treat as STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (additive; no data or calculation changes)
- **Depends on**: none
- **Category**: direction (surface asymmetry: report view exists, export doesn't)
- **Planned at**: commit `4ac63576`, 2026-07-12

## Why this matters

Plan 046 shipped the read-only annual report (`/reports/annual`, backed by
`src/domain/annualReport.ts`: per-year realized gains, dividend income, trading
costs) and explicitly deferred PDF export (`docs/annual-report-plan.md` line 3:
「PDF 匯出延後」). ROADMAP.md 規劃中 keeps the promise:「報表匯出 — 月度/年度
財務摘要 PDF … 供報稅與家庭會議用」. Taiwan tax filing is in May; the numbers
exist but can't leave the app. The cheapest honest version is a **print
stylesheet + a 列印/匯出 button** — the OS print dialog already offers
"Save as PDF" on macOS, which covers the tax/family-meeting use case at ~20%
of the cost of programmatic PDF generation. This plan ships that, with a
feasibility gate up front because printing from a Tauri webview is the one
genuinely uncertain piece.

## Current state

- `src/routes/router.tsx:116-120` — route:

  ```tsx
  const annualReportRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/reports/annual",
    component: AnnualReportRoute,
  });
  ```

- `src/routes/AnnualReportRoute.tsx` (294 lines) — the report UI. Read it fully
  before Step 2; it renders per-year sections from `annualReport.ts` outputs.
- `src/domain/annualReport.ts` — the calculation layer. **Do not modify.** Its
  regression guard (sum of per-year realizedGain === `buildPositionMetrics`
  total) is documented in `docs/annual-report-plan.md`.
- App chrome: `src/components/AppShell.tsx` renders sidebar/tab-bar around
  `.ns-app-main` — print CSS must hide chrome and print only the report.
- Styling conventions (AGENTS.md): (1) COSS components, (2) `ns-*` utility
  classes in `src/styles/globals.css`, (3) inline style only for dynamic
  values. Add print rules as a `@media print` block in `globals.css` with
  `ns-print-*` helper classes if needed.
- Runtime split: the app runs in a Tauri 2 WKWebView on macOS AND in a browser
  dev shell. `window.print()` is guaranteed in the browser; in the Tauri
  webview it may be unavailable or a no-op — that's the Step 1 gate.
- Privacy feature interplay: the app has a privacy mask (隱私遮罩) that blurs
  amounts. A printed report with masked numbers is useless; the print path must
  print real values only when the mask is OFF (simplest rule: disable the
  button with a tooltip「請先關閉隱私遮罩」when the mask is on — find the mask
  state via `grep -rn "privacy" src/state/uiPreferences.ts`).

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0              |
| Tests     | `npm test`         | all pass            |
| Lint      | `npm run lint`     | exit 0, 0 errors    |
| Tauri check | `npm run check:tauri` | exit 0 (only if you touch `src-tauri/`) |

## Scope

**In scope**:
- `src/routes/AnnualReportRoute.tsx` (add the button + print-mode wiring)
- `src/styles/globals.css` (`@media print` block)
- `src/routes/annualReportPrint.ts` + test (create, only if any pure logic —
  e.g. filename/title formatting — is worth extracting; skip if trivial)

**Out of scope** (do NOT touch):
- `src/domain/annualReport.ts` and every other `src/domain/` file — locked
  finance math.
- Monthly reports, CSV export, charts-to-image — the roadmap mentions monthly
  summaries too; explicitly deferred (see Maintenance notes).
- Adding a PDF-generation dependency (jspdf, printpdf, headless render). That
  is the escape-hatch path and needs an operator decision first (STOP #2).

## Git workflow

- Branch: `feat/ai-annual-report-print`
- Conventional commits, e.g. `feat(reports): print/export the annual report`
- Do NOT push or merge; leave the branch for review.

## Steps

### Step 1: Feasibility gate — can the Tauri webview print?

Determine whether `window.print()` opens the macOS print dialog inside the
Tauri 2 WKWebView, checking in this order:
1. `grep -rn "print" src-tauri/capabilities/ src-tauri/tauri.conf.json` — any
   existing permission/config.
2. Check the installed `@tauri-apps/api` version's webview/window API surface
   for a `print()` method (`node_modules/@tauri-apps/api/` or its docs).
3. If the API exists but needs a capability entry, note the exact capability
   identifier for Step 3.

Record the finding as a comment in the PR description AND a line in the plan's
status row when done. If neither `window.print()` nor a Tauri API can work
without a new plugin/dependency → **STOP condition #2** (report; the fallback
decision is the operator's).

**Verify**: a one-paragraph written answer with evidence (file paths / API
names) exists before any code is written.

### Step 2: Print stylesheet

In `globals.css`, add a `@media print` block that: hides app chrome (sidebar,
tab bar, FAB, toolbar buttons — inspect `AppShell.tsx` for the concrete
classes/elements), forces light theme values for ink (the DS dark theme must
not print white-on-black), expands the report to full width, sets sane page
margins, and avoids page breaks inside a year section
(`break-inside: avoid` on the section container). Add a report header that
prints (app name, 年度, generated date) — it may be a print-only element
(`display: none` on screen, shown in print).

**Verify**: in the browser dev shell (`npm run dev`), open
`/reports/annual`, trigger the browser's print preview manually, and confirm:
no sidebar, readable light-ink output, no split year sections. (This is a
human-eyeball step in dev; note it as done in the commit message.)

### Step 3: The 列印 / 匯出 PDF button

Add a button to `AnnualReportRoute.tsx`'s header area (match the route's
existing header conventions — English eyebrow + Chinese h1 per AGENTS.md).
Behavior: disabled with tooltip while the privacy mask is on; otherwise calls
`window.print()` (or the Tauri API from Step 1, behind the existing
`isTauriRuntime()`-style runtime check — see `sync-manager.ts:191` for the
canonical check). Label:「列印 / 匯出 PDF」.

**Verify**: `npx tsc --noEmit` → 0; `npm run lint` → 0 errors.

### Step 4: Tests + gates

See test plan.

**Verify**: `npm test` → all pass.

## Test plan

- jsdom cannot execute print. Test the pure parts only:
  - If `annualReportPrint.ts` was created (title/filename formatting), unit
    test it (model after `src/routes/holdingDetailToday.ts` + its test — the
    repo's precedent for extracting a route's pure helper).
  - A render test asserting the button is disabled when the privacy-mask
    preference is on (stub `uiPreferences` the way existing route tests do;
    remember: no localStorage in jsdom — `vi.stubGlobal`).
- Everything visual is the Step 2 eyeball check; list what was checked in the
  PR body.

## Done criteria

- [ ] `npx tsc --noEmit` 0; `npm run lint` 0 errors; `npm test` all pass
- [ ] `grep -n "@media print" src/styles/globals.css` ≥ 1 match
- [ ] `grep -n "列印" src/routes/AnnualReportRoute.tsx` ≥ 1 match
- [ ] `git diff --stat` shows no `src/domain/` changes
- [ ] Step 1 feasibility answer recorded; `plans/README.md` status row updated
      (include "Tauri print: works / needs capability X / unsupported")

## STOP conditions

- The report route's structure differs materially from a linear
  sections-per-year layout (print CSS assumptions break).
- Step 1 concludes printing is impossible in the Tauri webview without a new
  dependency or plugin — report the options (tauri print plugin, save-as-HTML
  via `plugin-fs`, programmatic PDF lib) with one-line costs; the operator
  picks.
- Hiding app chrome for print requires structural changes to `AppShell.tsx`
  beyond adding classes.

## Maintenance notes

- Deferred deliberately: monthly summary printing, chart rasterization
  (recharts SVGs may print acceptably as-is — check in Step 2's eyeball),
  programmatic PDF with pagination/headers. If tax-season feedback demands
  real PDF files, that's a new plan on top of this one.
- Reviewer: check the dark-theme-print case and the privacy-mask gate; both
  are the likely escape routes for wrong output.
- The mobile app (iOS) has no print dialog — the button should be hidden or
  disabled on touch/mobile presentation (follow how other desktop-only
  affordances are gated; `grep -rn "isTauriRuntime\|platform" src/components/AppShell.tsx`).
