# Plan 042: Fix timezone-shifted net-worth window so the headline delta matches the chart

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 13f6a723..HEAD -- src/routes/DashboardRoute.tsx src/domain/dateScope.ts`
> If either in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (correctness)
- **Planned at**: commit `13f6a723`, 2026-06-20

## Why this matters

On the Dashboard net-worth hero, the "1D / 近1日" change badge shows a number
that doesn't match the visible chart. Reported case: headline TWD 15,545,451,
badge **↓ −351 · 0.00%**, while the chart's two visible points are 6/19 =
15,548,356 and 6/20 = 15,545,451 (a −2,905 move). The −351 is measured from the
wrong start date.

Root cause: `stripStartDate()` builds a date in **local time** but serializes it
back through `.toISOString()` (**UTC**). In any timezone with a positive UTC
offset (the app is zh-TW / `Asia/Taipei` = UTC+8 first), this crosses back over
midnight and pulls the window start **one extra day earlier**. Reproduced under
`Asia/Taipei`:

```
stripStartDate("1D", "2026-06-20")  =>  2026-06-18   (should be 2026-06-19)
stripStartDate("1W", "2026-06-20")  =>  2026-06-12   (should be 2026-06-13)
```

So the "1D" window secretly spans **6/18 → 6/20**. `rangeView`
(`DashboardRoute.tsx:382`) then prepends a carried anchor at 6/18 as `points[0]`
and treats 6/19 as a mere intermediate point, so the delta `endValue −
points[0]` measures 6/18→now (≈ −351) instead of the visible 6/19→6/20 (−2,905).
After the fix the "1D" window is exactly 6/19 → 6/20 and the badge equals the
chart move.

A secondary correctness issue rides along: `todayIso` / `end` are derived from
`new Date().toISOString().slice(0,10)` (UTC) at three sites, even though the app
has a timezone-correct `todayInTimezone(timezone)` (already imported in
`DashboardRoute.tsx`) used everywhere else. Near local midnight that UTC "today"
can be a day behind, skewing both the window and the live-quote-vs-daily-close
reconciliation. This plan routes the window math through the user's timezone.

## Current state

Files and roles:

- `src/routes/DashboardRoute.tsx` — the net-worth hero, trend chart, and the
  buggy `stripStartDate`. Already imports `todayInTimezone` (line 53) and reads
  `const timezone = useUiPreferences((state) => state.timezone)` (line 120).
- `src/domain/dateScope.ts` — the existing **timezone-safe** date-scope domain
  module. It already imports `todayInTimezone` and does string/local-component
  date math via its `ymd()` / `shiftMonths()` helpers with **no** `.toISOString()`
  round-trip. This is the correct home for the relocated `stripStartDate`.
- `src/domain/datetime.ts` — exports `todayInTimezone(timezone, now?)` (returns
  `YYYY-MM-DD` in the given IANA zone).

### The bug — `DashboardRoute.tsx:95-102`

```ts
function stripStartDate(period: StripPeriod, end: string): string {
  if (period === "All") return "1900-01-01";
  if (period === "YTD") return `${end.slice(0, 4)}-01-01`;
  const days: Record<Exclude<StripPeriod, "YTD" | "All">, number> = { "1D": 1, "1W": 7, "1M": 31, "3M": 92, "1Y": 365, "5Y": 1825 };
  const d = new Date(`${end}T00:00:00`);   // ← parsed as LOCAL midnight
  d.setDate(d.getDate() - days[period]);
  return d.toISOString().slice(0, 10);     // ← serialized as UTC → off-by-one in UTC+
}
```

### The type + arrays — `DashboardRoute.tsx:66-78`

```ts
type StripPeriod = "1D" | "1W" | "1M" | "3M" | "YTD" | "1Y" | "5Y" | "All";
const STRIP_PERIODS: StripPeriod[] = ["1D", "1W", "1M", "3M", "YTD", "1Y", "5Y", "All"];
const STRIP_PERIOD_LABELS: Record<StripPeriod, string> = {
  "1D": "近 1 日", "1W": "近 1 週", "1M": "近 1 個月", "3M": "近 3 個月",
  "YTD": "今年以來", "1Y": "近 1 年", "5Y": "近 5 年", "All": "全期間",
};
```

### The three UTC "today" sites

- `DashboardRoute.tsx:195` — `const todayIso = new Date().toISOString().slice(0, 10);`
  (component-level; used by `reconciledTrend` at line 372 and others).
- `DashboardRoute.tsx:389` — inside the `rangeView` memo:
  `const todayIso = new Date().toISOString().slice(0, 10);`
  then `const startIso = stripStartDate(stripPeriod, todayIso);`
- `DashboardRoute.tsx:481` — inside the `stripData` memo:
  `const end = new Date().toISOString().slice(0, 10);`
  then `const start = stripStartDate(stripPeriod, end);`

### The exemplar pattern to copy (`dateScope.ts:72-80`)

```ts
function shiftMonths(dateString: string, delta: number) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1 + delta, day);   // local construct
  return ymd(date);
}
function ymd(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;  // local read
}
```

Constructing **and** reading with local components (never `.toISOString()`) is
timezone-stable — the value is identical in every zone. Match this exactly.

### Conventions to follow

- Finance/date math lives in `src/domain/*` with unit tests (`AGENTS.md` #1;
  every domain change ships tests). `stripStartDate` is date math → it belongs in
  `dateScope.ts` and gets a test.
- Timezone-correct "today" comes from `todayInTimezone(timezone)` — used across
  the app; do not reintroduce raw `new Date().toISOString()` for a calendar day.
- vitest jsdom has no `localStorage`; not relevant here (pure date math), but
  keep the new test free of DOM/storage assumptions.

## Commands you will need

| Purpose   | Command                                       | Expected on success |
|-----------|-----------------------------------------------|---------------------|
| Install   | `npm install`                                 | exit 0 (fresh worktree) |
| Typecheck | `npx tsc --noEmit`                            | exit 0, no errors   |
| Test one  | `npx vitest run src/domain/dateScope.test.ts` | all pass            |
| Tests     | `npm test`                                     | all pass            |
| Lint      | `npm run lint`                                 | exit 0 (0 errors; warnings ok) |
| Build     | `npm run build`                               | exit 0              |

## Scope

**In scope** (the only files you should modify/create):
- `src/domain/dateScope.ts` — add the relocated, fixed `stripStartDate` +
  `StripPeriod` type + `STRIP_PERIODS` array (exported).
- `src/domain/dateScope.test.ts` — **create**; unit tests for `stripStartDate`.
- `src/routes/DashboardRoute.tsx` — import from `dateScope`, delete the local
  copies, route the three "today" sites through `todayInTimezone(timezone)`.

**Out of scope** (do NOT touch):
- `STRIP_PERIOD_LABELS` semantics — keep it in `DashboardRoute.tsx` (it may now
  import the `StripPeriod` type from `dateScope`). Do not move the zh-TW labels.
- `rangeView`'s carry-forward/anchor logic, `reconciledTrend`, `buildNetWorthTrend`,
  or any valuation math — the only behavioral change is the corrected window
  start date and timezone-correct "today". Do not redesign the delta.
- Any other route or the `datetime.ts` helpers.

## Git workflow

- Branch from current main: `git checkout -B advisor/042-networth-window-tz main`.
- Commit per logical unit; short imperative messages (e.g.
  `fix: timezone-stable net-worth window start (stripStartDate)`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: add the fixed `stripStartDate` to `dateScope.ts`

Append to `src/domain/dateScope.ts` (it already imports `todayInTimezone` and has
`ymd`):

```ts
export type StripPeriod = "1D" | "1W" | "1M" | "3M" | "YTD" | "1Y" | "5Y" | "All";
export const STRIP_PERIODS: StripPeriod[] = ["1D", "1W", "1M", "3M", "YTD", "1Y", "5Y", "All"];

/**
 * Window start date (YYYY-MM-DD) for a net-worth range control, `days` before
 * `end`. Timezone-stable: builds and reads the date with LOCAL components only
 * (no `.toISOString()` round-trip), so a positive UTC offset can't shift the
 * result across midnight.
 */
export function stripStartDate(period: StripPeriod, end: string): string {
  if (period === "All") return "1900-01-01";
  if (period === "YTD") return `${end.slice(0, 4)}-01-01`;
  const days: Record<Exclude<StripPeriod, "YTD" | "All">, number> = {
    "1D": 1, "1W": 7, "1M": 31, "3M": 92, "1Y": 365, "5Y": 1825,
  };
  const [year, month, day] = end.split("-").map(Number);
  const d = new Date(year, month - 1, day);     // local construct
  d.setDate(d.getDate() - days[period]);
  return ymd(d);                                 // local read — see exemplar
}
```

If `ymd` is not already accessible in the same module scope, reuse the existing
private `ymd` (it is defined in this file at the bottom). Do not duplicate it.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: write `src/domain/dateScope.test.ts`

Create the test file. Model the structure after any existing `src/domain/*.test.ts`
(e.g. `src/domain/datetime.test.ts`). Cover the cases in the Test plan below.

**Verify**: `npx vitest run src/domain/dateScope.test.ts` → all pass.

### Step 3: wire DashboardRoute to the domain function

In `src/routes/DashboardRoute.tsx`:

1. Add an import: `import { stripStartDate, STRIP_PERIODS, type StripPeriod } from "../domain/dateScope";`
   (match the existing relative-import style; there are already imports from
   `../domain/*`).
2. **Delete** the local `type StripPeriod` (line 66), the local `STRIP_PERIODS`
   (line 67), and the local `stripStartDate` function (lines 95-102).
3. Keep `STRIP_PERIOD_LABELS` where it is; it now relies on the imported
   `StripPeriod` type (no code change needed beyond the import existing).

**Verify**: `npx tsc --noEmit` → exit 0 (no "duplicate identifier" / "cannot
find name StripPeriod" errors).

### Step 4: route the three "today" sites through the user timezone

`timezone` is already in scope (`DashboardRoute.tsx:120`). `todayInTimezone` is
already imported (line 53).

1. Line 195: `const todayIso = new Date().toISOString().slice(0, 10);`
   → `const todayIso = todayInTimezone(timezone);`
2. Inside `rangeView` (line ~389): delete the local
   `const todayIso = new Date().toISOString().slice(0, 10);` and use the
   component-level `todayIso` from step 4.1. Add `todayIso` to the `rangeView`
   `useMemo` dependency array (currently `[reconciledTrend, stripPeriod]` →
   `[reconciledTrend, stripPeriod, todayIso]`).
3. Inside `stripData` (line ~481): replace
   `const end = new Date().toISOString().slice(0, 10);` with
   `const end = todayInTimezone(timezone);` and add `timezone` to the `stripData`
   `useMemo` dependency array (currently ends with
   `..., stripPeriod, benchmarkTicker]` → add `timezone`).

**Verify**:
- `npx tsc --noEmit` → exit 0.
- `grep -n 'new Date().toISOString().slice(0, 10)' src/routes/DashboardRoute.tsx`
  → **no matches** (all three replaced). Note: line 140's `monthKey` uses
  `slice(0, 7)` — that is a different call and is **out of scope**; leave it.

### Step 5: full verification

**Verify**:
- `npx tsc --noEmit` → exit 0
- `npx vitest run src/domain/dateScope.test.ts` → all pass
- `npm test` → all pass
- `npm run lint` → 0 errors
- `npm run build` → exit 0

## Test plan

Create `src/domain/dateScope.test.ts`. Import
`{ stripStartDate } from "./dateScope"`. Assert exact strings (these are correct
in every timezone once the fix lands; under the old UTC-round-trip code they were
wrong in UTC+ zones, which is the regression this guards):

- `stripStartDate("1D", "2026-06-20")` === `"2026-06-19"`
- `stripStartDate("1W", "2026-06-20")` === `"2026-06-13"`
- `stripStartDate("1M", "2026-06-20")` === `"2026-05-20"`
- `stripStartDate("3M", "2026-06-20")` === `"2026-03-20"`
- `stripStartDate("1Y", "2026-06-20")` === `"2025-06-21"`  *(365 days before;
  compute and pin the exact value the implementation returns — if your run
  yields a different ISO for the 365/1825-day cases, use the produced value and
  note it; the load-bearing assertions are 1D/1W/1M and the boundary cases)*
- `stripStartDate("YTD", "2026-06-20")` === `"2026-01-01"`
- `stripStartDate("All", "2026-06-20")` === `"1900-01-01"`
- **month boundary**: `stripStartDate("1D", "2026-03-01")` === `"2026-02-28"`
- **year boundary**: `stripStartDate("1D", "2026-01-01")` === `"2025-12-31"`

Add a comment in the test naming the bug: "Regression guard: a previous
implementation built the date in local time but serialized via toISOString()
(UTC), shifting the window start one day early in UTC+ zones (e.g. Asia/Taipei)."

Verification: `npx vitest run src/domain/dateScope.test.ts` → all pass.

## Done criteria

ALL must hold:

- [ ] `stripStartDate` lives in `src/domain/dateScope.ts`, is exported, and uses
      local-component construct+read (no `.toISOString()`)
- [ ] `src/domain/dateScope.test.ts` exists with the cases above and passes
- [ ] `DashboardRoute.tsx` imports `stripStartDate`/`STRIP_PERIODS`/`StripPeriod`
      from `dateScope` and no longer defines them locally
- [ ] `grep -n 'new Date().toISOString().slice(0, 10)' src/routes/DashboardRoute.tsx`
      → no matches
- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm test` exits 0
- [ ] `npm run lint` exits 0 (0 errors)
- [ ] `npm run build` exits 0
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated (skip if your reviewer maintains the index)

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the cited lines doesn't match the excerpts (drift since `13f6a723`).
- After Step 3, TypeScript reports errors that aren't a direct consequence of the
  move (e.g. `STRIP_PERIOD_LABELS` can't see `StripPeriod`) and can't be fixed by
  the import alone — report rather than refactoring further.
- Removing the local `todayIso` (Step 4.2) breaks a different memo/closure that
  relied on it — report which.
- Any existing test outside `dateScope.test.ts` changes its expected value — that
  means the window change altered behavior beyond the bug; stop and report.
- A verification fails twice after a reasonable fix attempt.

## Maintenance notes

- For the reviewer: the only intended behavioral change is the corrected window
  start (and timezone-correct "today"). Confirm `rangeView`'s anchor/carry logic
  and `reconciledTrend` are untouched, and that the "1D" badge now equals the
  visible chart endpoints. Scrutinize the two `useMemo` dependency-array edits
  (Step 4) — a missing dep would make the window go stale across a day change.
- The `1Y`/`5Y` cases use fixed day counts (365/1825), so they don't account for
  leap years — that's pre-existing behavior, intentionally preserved here. If
  exact calendar-year windows are wanted later, that's a separate change.
- Other routes that do their own `new Date().toISOString().slice(0,10)` for a
  calendar day may have the same UTC-vs-local skew — out of scope here, but worth
  a follow-up sweep (`grep -rn "toISOString().slice(0, 10)" src/`).
