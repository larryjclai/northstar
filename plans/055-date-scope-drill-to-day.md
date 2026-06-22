# Plan 055: Let the bookkeeping date picker drill from month down to a single day

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. This has
> a visual component — verify in the running app. If anything in "STOP conditions"
> occurs, stop and report. When done, update this plan's row in `plans/README.md`
> unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 8f2e90bd..HEAD -- src/components/DateScopeControl.tsx src/components/ui/month-picker.tsx src/components/ui/date-picker.tsx src/domain/dateScope.ts`
> If these changed since this plan was written, compare the "Current state"
> excerpts against live code before proceeding; on a mismatch, treat it as a STOP
> condition.

## Status

- **Priority**: P2
- **Effort**: S–M
- **Risk**: LOW (UI + a date-scope value shape; finance math reads the resolved
  range, which already supports single days)
- **Depends on**: none
- **Category**: feature (UX)
- **Planned at**: commit `8f2e90bd`, 2026-06-21

## Why this matters

Operator-reported: 記帳的日曆希望可以精細到選日. **Operator decision (asked &
answered):** *"上面的日曆選單，點了之後可以細到日"* — i.e. the top date picker (the
one currently showing a **month**) should let you drill down and pick a **specific
day**, not require switching to the separate 自訂區間 (custom range) preset.

The capability technically exists today only via 自訂區間 (a `DateRangePicker`
that selects a day range); the default 月 (month) preset uses a month-only
picker. The fix is to make the top picker itself drill to a day, mapping a chosen
day to a single-day scope. The finance layer already supports this: a single-day
scope is just `start === end`, and `resolveDateScope` / `isWithinDateScope`
already handle that — so **no finance-math change** is needed.

## Current state

`src/domain/dateScope.ts` — the scope model:

```ts
export type DateScopePreset = "month" | "ytd" | "last12m" | "all" | "custom";
export interface DateScopeValue { preset: DateScopePreset; month: string; start: string; end: string; }

// custom already resolves a single day fine:
if (scope.preset === "custom") {
  const start = scope.start || today; const end = scope.end || today;
  return start <= end
    ? { preset: "custom", start, end, label: `${start} → ${end}` }
    : { preset: "custom", start: end, end: start, label: `${end} → ${start}` };
}
// isWithinDateScope: day-level inclusive compare on start/end — single day works.
```

`src/components/DateScopeControl.tsx` — the top control. For the `month` preset it
renders a month-only `<MonthPicker>`; for `custom` a `<DateRangePicker>`:

```tsx
{value.preset === "month" ? (
  <MonthPicker value={value.month} onChange={(month) => onChange({ ...value, month })} … />
) : value.preset === "custom" ? (
  <DateRangePicker start={value.start} end={value.end} onChange={({start,end}) => onChange({ ...value, start, end })} … />
) : ( /* 自訂區間 button → enterCustom() */ )}
```

`src/components/ui/month-picker.tsx` — a custom popover with month buttons +
year nav (`shiftMonth`); it does **not** offer day selection.

`src/components/ui/calendar.tsx` — a `react-day-picker` `DayPicker` wrapper that
**does** support day selection (used by `DateRangePicker`). This is the building
block for day drill-down.

Used in CashFlow at `src/routes/CashFlowRoute.tsx:886`:
`<DateScopeControl value={dateScope} onChange={setDateScope} />`.

### Conventions to follow

- Don't change the finance/aggregation layer — it consumes `resolveDateScope(...)`
  (a `{start,end}` range). A single day = `start === end`. Keep that contract.
- Reuse the existing `calendar.tsx` (`react-day-picker`) for day selection rather
  than building a new calendar; it already matches the DS styling.
- The control must keep a **fixed-width detail slot** (see the comment in
  `DateScopeControl`: the toolbar must not reflow when switching presets).
- zh-TW labels; show a clear single-day label (e.g. the `YYYY-MM-DD`) when a day
  is selected.

## Decision (already made — implement this)

Make the top picker drill month → day. Recommended implementation (least
invasive, no finance change):

- Enhance the month-preset picker so the user can **drill into a month and click a
  specific day**. On day selection, set the scope to that single day. Map it to
  the existing model as `{ preset: "custom", start: day, end: day }` (custom
  already renders/resolves a single day), OR add a dedicated `"day"` preset to
  `DateScopePreset` with `start === end` if a cleaner label/segment is wanted.
  **Prefer reusing `custom` with `start===end`** to avoid touching every
  `preset`-switch site — only add a `"day"` preset if the operator wants a
  distinct segment label. If you add `"day"`, you MUST handle it in
  `resolveDateScope`, `dateScopePresetLabel`, and any exhaustive switch (grep
  `DateScopePreset`).
- Keep month-level selection available (clicking a month still filters the whole
  month) — drilling to a day is additive, not a replacement.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Tests | `npm test` | all pass |
| Test scope | `npx vitest run src/domain/dateScope.test.ts` | all pass (if it exists) |
| Lint | `npm run lint` | exit 0 (0 errors) |
| Build | `npm run build` | exit 0 |
| Dev server (visual) | `npm run dev` | serves on 127.0.0.1 |

## Scope

**In scope:**
- `src/components/DateScopeControl.tsx` — wire day drill-down into the top picker.
- `src/components/ui/month-picker.tsx` — add a day-drill view (reusing
  `calendar.tsx`), OR a new small combined picker; keep the month option.
- `src/domain/dateScope.ts` + its test — ONLY if you add a `"day"` preset
  (otherwise no change here; `custom` single-day already works).

**Out of scope (do NOT touch):**
- The finance aggregation / chart bucketing — it reads the resolved range; a
  single day already works. (Note: chart granularity auto-steps off "day" for
  non-month presets at `CashFlowRoute.tsx:173` — confirm a single-day scope still
  renders sensibly; if it forces an odd granularity, leave the granularity logic
  alone and just confirm the list/summary filter correctly.)
- The transaction entry date field (the per-transaction datetime input is already
  day+time — that's not what this is about).
- Other pages' `DateScopeControl` usages inherit the improvement for free; don't
  special-case them.

## Git workflow

- Branch from current main: `git checkout -B advisor/055-date-scope-day main`.
- Match the repo's short imperative commit style. Do NOT push/PR unless told.

## Steps

### Step 1: add day drill-down to the picker
In the month-preset picker, add a way to drill into a month and select a day
(reuse `calendar.tsx`'s `DayPicker`). On selecting a day, call `onChange` with a
single-day scope (`{ preset: "custom", start: day, end: day }`, or a `"day"`
preset if chosen). Keep "select whole month" working.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: label + fixed-width slot
Ensure the trigger shows the selected day (`YYYY-MM-DD`) when a day is chosen, and
the detail slot keeps its fixed width (no toolbar reflow).

**Verify**: `npm run lint` → 0 errors.

### Step 3: visual check
Run dev server, open 記帳, open the top date picker, drill into a month, pick a
day. Confirm the list/summary filter to that single day and the label reads the
day. Screenshot. Confirm switching back to a whole month still works.

### Step 4: full verification
**Verify**: `npx tsc --noEmit` exit 0; `npm test` all pass; `npm run lint` 0
errors; `npm run build` exit 0.

## Test plan

- If you add a `"day"` preset: add `dateScope.test.ts` cases — a day scope
  resolves to `start === end === thatDay` with a correct label; `isWithinDateScope`
  includes only that day. If you reuse `custom`, the existing custom single-day
  behavior is already covered — verify by a quick test that `start===end` resolves
  to that one day.
- Visual verification per Step 3 for the picker UX.

## Done criteria

ALL must hold:

- [ ] The top date picker can drill from a month into a specific day; selecting a
      day filters 記帳 to that single day (label shows the day)
- [ ] Whole-month selection still works; the toolbar does not reflow when
      switching
- [ ] No finance-math/aggregation file changed (`git status` shows only the UI +
      optional `dateScope.ts`)
- [ ] `npx tsc --noEmit` exits 0; `npm test` all pass; `npm run lint` 0 errors;
      `npm run build` exits 0
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the cited lines doesn't match the excerpts (drift since `8f2e90bd`).
- Adding a `"day"` preset ripples into more `preset`-switch sites than
  `dateScope.ts` + `DateScopeControl` (grep `DateScopePreset` first) — prefer the
  `custom` single-day approach instead, or report.
- A single-day scope makes the cash-flow chart render brokenly (e.g. an empty or
  malformed bucket) — report; the chart-granularity logic is out of scope and may
  need an operator decision.

## Maintenance notes

- For the reviewer: confirm the finance layer is untouched — a single day is just
  `start===end`. The change is purely in the picker UI (+ optional preset).
- This improvement is global (every `DateScopeControl` user benefits). Sanity-check
  one other page (e.g. Investments/Dashboard scope) still works.
