# Plan 199: Give the 總覽 AI monthly summary its own full-width row under the header

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 36d25f50..HEAD -- src/routes/DashboardRoute.tsx`
> If the file changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as
> a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (layout)
- **Planned at**: commit `36d25f50`, 2026-07-15

## Why this matters

The on-device AI 本月摘要 on 總覽 renders as a cramped, narrow paragraph with a
large empty gap to its right, and a refresh icon floating awkwardly against the
text's right edge mid-paragraph. It reads as broken rather than "low-key".

The cause is structural, not cosmetic: the summary is nested inside the *left
column* of the header's `justify-between` flex row, so it is competing for
width with the right-hand toolbar (匯率 + 更新行情 + 版面 + 通知) even though
it sits two lines below it and has no visual relationship to it. On top of
that, `max-w-xl` caps it at 576px regardless of available space. The operator's
instinct — "可能他是要左右滿版比較好嗎?" — is right: the summary is prose, and
prose belongs on its own line at the container's width, not squeezed into a
column sized by unrelated buttons.

This plan moves it out of the header row into its own full-width row directly
beneath, and fixes the refresh button placement so it no longer collides with
the text.

## Current state

### Files

- `src/routes/DashboardRoute.tsx` — the 總覽 route. Two regions matter:
  - the header row, lines 1033–1078
  - the `MonthlySummaryInline` component definition, lines 1440–1534

### The header row today — `src/routes/DashboardRoute.tsx:1033-1078`

```tsx
      {/* Header — greeting/summary shrinks (min-w-0) so a long AI summary wraps
          in place; the FX one-liner + 更新行情 + 版面 + 通知 stay pinned top-right. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between" style={{ marginBottom: 18 }}>
        <div className="min-w-0">
          <div className="text-xs ns-field-label">Overview · {monthLabel}</div>
          <h1 className="text-[28px]" style={{ fontFamily: "var(--ns-font-display)", margin: 0, letterSpacing: -0.02, fontWeight: 600 }}>{greeting}</h1>
          {hasAnyData ? (
            <MonthlySummaryInline
              monthKey={monthKey}
              income={monthIncome}
              expense={monthExpense}
              savingsRatePct={savingsRate}
              netWorthChange={momChange}
              currency={primaryCurrency}
              budgetCats={budgetCats}
            />
          ) : null}
        </div>
        {/* 匯率 one-liner sits inline with 更新行情 + 版面. The single time-range
            control lives on the net-worth card (the period segmented control). */}
        <div className="flex flex-wrap items-center justify-end gap-2 sm:shrink-0">
            <FxInline rates={fxRates} />
            <Button variant="outline" className="h-9 flex-1 sm:flex-none shrink-0 sm:h-9" onClick={refreshMarket} ...>
              <ArrowsClockwise size={14} />{refreshingMarket ? "更新中" : "更新行情"}
            </Button>
            {hasAnyData ? (
              <Popover>
                ... 版面 popover ...
              </Popover>
            ) : null}
            <NotificationCenter />
        </div>
      </div>
```

Note the comment on line 1033-1034 describes the *intended* behavior ("wraps in
place") — that intent is what this plan revises. The greeting `<h1>` and the
`Overview · {monthLabel}` eyebrow **must stay** in the left column: the
English-eyebrow + Chinese-h1 header convention is a house rule (`AGENTS.md`).
Only the summary moves.

### `MonthlySummaryInline`'s render — `src/routes/DashboardRoute.tsx:1513-1533`

```tsx
  return (
    <div className="mt-2 flex max-w-xl items-start gap-2">
      {loading ? (
        <Skeleton className="h-5 w-full" />
      ) : (
        <MarkdownText text={summaryText ?? ""} className="text-body muted leading-relaxed" />
      )}
      {!loading && summaryText ? (
        <Button
          variant="ghost"
          size="xs"
          className="shrink-0"
          onClick={generate}
          title="由裝置端 AI 產生，不會上傳任何資料 · 重新產生"
          aria-label="重新產生本月摘要"
        >
          <ArrowsClockwise size={12} />
        </Button>
      ) : null}
    </div>
  );
```

Three separate problems live in this one `<div>`:

1. `max-w-xl` (576px) caps the prose even when the row is 1500px wide.
2. `flex items-start` puts the refresh Button **beside** the text as a flex
   sibling, so it sits at the paragraph's right edge, vertically top-aligned —
   this is the icon "floating in the middle of nowhere" in the screenshot.
3. Because the parent left column is `min-w-0` inside a `justify-between` row,
   the text column collapses toward its content width, so the effective wrap
   width is unpredictable and unrelated to the page width.

### The component's early-return guards — do not change these

`src/routes/DashboardRoute.tsx:1506-1511`:

```tsx
  // Don't render anything if FM is unavailable or still checking.
  if (available === false || available === null) return null;
  // Don't render if there's no month data yet.
  if (income + expense === 0) return null;
  // Don't render if generation failed with nothing to show — stay quiet.
  if (!loading && !summaryText) return null;
```

These are load-bearing privacy/quiet-failure behavior. They stay exactly as-is.
Because the component can return `null`, **wherever you place it, the surrounding
markup must not reserve space or draw a gap when it renders nothing** — this is
why Step 1 keeps the conditional wrapper outside, not a wrapper `<div>` inside.

### Design constraints to honor (from `DESIGN.md`, which you have not read)

- `DESIGN.md` §7 圖示系統: 一般 UI 圖示 `size={13–16}`. The refresh icon here is
  currently `size={12}`, below that band. Since you are touching this exact JSX,
  bring it to `size={14}` (the repo's dominant value — 136 uses).
- Per `AGENTS.md` 樣式撰寫優先序: (1) COSS components; (2) `ns-*` utility classes
  and Tailwind utilities; (3) inline `style={{}}` **only for dynamic values**.
  Everything in this plan is static → **use Tailwind classes, no inline style.**
- The summary is deliberately **not a Card** — see the component's own docstring
  at line 1440-1445: "rendered inline under the greeting header (not a card —
  kept low-key/immersive)". **Do not turn it into a Card.** Full-width here means
  full *row width*, not a new boxed surface.

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0, no errors |
| Tests     | `npm test`         | all pass (~1252 tests) |
| Lint      | `npm run lint`     | exit 0, 0 errors |
| Build     | `npm run build`    | exit 0 (`tsc && vite build`) |
| Dev app   | `npm run dev`      | Vite dev server |

## Scope

**In scope** (the only file you should modify):
- `src/routes/DashboardRoute.tsx`

**Out of scope** (do NOT touch, even though they look related):
- The AI generation logic — `generate`, `isFmAvailable`, `buildMonthlySummaryInput`,
  `generateMonthlySummary`, the `ranRef` auto-run effect, and the three early-return
  guards. **This plan is layout-only.** The aggregates-only privacy contract
  (docstring, lines 1443-1444) must not be disturbed.
- `MarkdownText` and `Skeleton` components themselves.
- The right-hand toolbar cluster (`FxInline`, 更新行情, 版面, `NotificationCenter`)
  — its layout is correct and stays where it is.
- The `<h1>` greeting and the `Overview · {monthLabel}` eyebrow — the
  English-eyebrow/Chinese-h1 convention stays.
- Every other route's header. If this pattern is worth spreading, that is a
  separate plan.

## Git workflow

- Branch: `fix/ai-dashboard-summary-layout` off the current `main`.
- Before branching, run `git status`. If there is uncommitted work in the tree
  that you did not create, **STOP and report** — do not stash it (per `.agentrules`).
- Commit style: conventional commits, matching `git log`. Example from history:
  `feat(investments): 日結 grouping mode with per-day 小計`
  Yours: `fix(dashboard): AI 本月摘要 gets its own full-width row`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Move `<MonthlySummaryInline>` out of the header row

In `src/routes/DashboardRoute.tsx`, the header block at lines 1033–1078:

**1a.** Delete the `{hasAnyData ? (<MonthlySummaryInline ... />) : null}` block
(lines 1039–1049) from inside the left `<div className="min-w-0">`. That div now
contains only the eyebrow and the `<h1>`.

**1b.** Reduce the header row's bottom margin, since the summary now provides
the separation. Change the header row's `style={{ marginBottom: 18 }}` to
`style={{ marginBottom: 10 }}`.

**1c.** Immediately **after** the header row's closing `</div>` (currently line
1078), insert the summary as its own sibling row, before the
`{/* Row 1 · Northstar hero + pulse strip */}` comment:

```tsx
      {/* AI 本月摘要 — its own full-width row: it's prose, so it wraps at the
          page's width rather than fighting the header toolbar for space. Renders
          null when Foundation Models is unavailable or there's no month data, so
          no gap is reserved. */}
      {hasAnyData ? (
        <MonthlySummaryInline
          monthKey={monthKey}
          income={monthIncome}
          expense={monthExpense}
          savingsRatePct={savingsRate}
          netWorthChange={momChange}
          currency={primaryCurrency}
          budgetCats={budgetCats}
        />
      ) : null}
```

The props are unchanged — copy them across verbatim.

**1d.** Update the now-stale comment at lines 1033–1034. Replace:

```tsx
      {/* Header — greeting/summary shrinks (min-w-0) so a long AI summary wraps
          in place; the FX one-liner + 更新行情 + 版面 + 通知 stay pinned top-right. */}
```

with:

```tsx
      {/* Header — greeting left, FX one-liner + 更新行情 + 版面 + 通知 pinned
          top-right. The AI summary is NOT in this row (see below): as prose it
          needs the full width, not the leftovers of a justify-between split. */}
```

**Verify**: `npx tsc --noEmit` → exit 0.

**Verify**: `grep -c "MonthlySummaryInline" src/routes/DashboardRoute.tsx` → `2`
(one call site, one function declaration). If it returns 3, you copied instead
of moved — remove the original.

### Step 2: Make the summary itself full-width and fix the refresh button

Replace the return block of `MonthlySummaryInline` (lines 1513–1533) with:

```tsx
  return (
    <div className="mb-4 flex w-full items-baseline justify-between gap-3">
      {loading ? (
        <Skeleton className="h-5 w-full" />
      ) : (
        <MarkdownText text={summaryText ?? ""} className="text-body muted leading-relaxed" />
      )}
      {!loading && summaryText ? (
        <Button
          variant="ghost"
          size="icon-xs"
          className="shrink-0 self-start"
          onClick={generate}
          title="由裝置端 AI 產生，不會上傳任何資料 · 重新產生"
          aria-label="重新產生本月摘要"
        >
          <ArrowsClockwise size={14} />
        </Button>
      ) : null}
    </div>
  );
```

What changed and why — each is deliberate, do not "tidy" any of them away:

| Change | Reason |
|---|---|
| `max-w-xl` → **removed** | the 576px cap is what made the prose narrow |
| `mt-2` → `mb-4` | it no longer hangs off the h1 above; it now separates itself from the hero card below |
| added `w-full` | fills the row it now owns |
| `items-start` → `items-baseline` | aligns the refresh glyph to the first text line instead of the box top |
| added `justify-between` | pushes refresh to the row's right edge, off the prose |
| `gap-2` → `gap-3` | the button is no longer touching the text |
| `size="xs"` → `size="icon-xs"` | it is an icon-only button; `icon-xs` is the square 6×6 variant (`ui/button.tsx`), `xs` is the text variant and gives it text padding |
| added `self-start` | keeps the button pinned to the first line when the prose wraps to 2+ lines |
| icon `size={12}` → `size={14}` | `DESIGN.md` §7 band is 13–16; 12 is out of spec |

**Verify**: `npx tsc --noEmit` → exit 0.

**Verify**: `grep -n "max-w-xl" src/routes/DashboardRoute.tsx` → no matches in
`MonthlySummaryInline`. (If `max-w-xl` appears elsewhere in the file, leave those
alone — they are out of scope.)

### Step 3: Confirm the suite is green

**Verify**: `npm run lint` → exit 0, 0 errors.

**Verify**: `npm test` → all pass, same count as your recorded baseline.

**Verify**: `git status --short` → only `src/routes/DashboardRoute.tsx` modified
(plus `plans/README.md` if you maintain the index).

## Test plan

**No new automated test.** Be explicit about this in your report rather than
padding the suite:

- This change is CSS/flex layout. jsdom computes no layout — `offsetWidth` is 0
  for everything — so an assertion like "the summary is full width" cannot fail
  in vitest and would be a fake test.
- `MonthlySummaryInline` is a local (non-exported) component inside
  `DashboardRoute.tsx`, so it is not directly mountable without exporting it —
  and exporting it purely to test class names would be a change to the module's
  public surface in service of a test that proves nothing about layout.

Confirm instead that you did **not** break existing coverage: `npm test` must
stay at the same pass count as before your change. Record both numbers in your
report.

Real verification is visual and belongs to the operator — see below.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -c "MonthlySummaryInline" src/routes/DashboardRoute.tsx` returns exactly `2`
- [ ] `grep -n "max-w-xl" src/routes/DashboardRoute.tsx` shows no match inside `MonthlySummaryInline`'s return
- [ ] `grep -n 'size="icon-xs"' src/routes/DashboardRoute.tsx` includes the refresh button
- [ ] `grep -n "size={12}" src/routes/DashboardRoute.tsx` no longer matches the summary's `ArrowsClockwise`
- [ ] The three early-return guards at "Current state" are byte-unchanged: `git diff -- src/routes/DashboardRoute.tsx` shows no change to `isFmAvailable`, `generate`, `ranRef`, or the `available === false` / `income + expense === 0` / `!loading && !summaryText` returns
- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run lint` exits 0 with 0 errors
- [ ] `npm test` exits 0 at the same pass count as baseline
- [ ] No files outside `src/routes/DashboardRoute.tsx` are modified (`git status`)
- [ ] `plans/README.md` status row updated

**Operator verification (not yours — request it in your report):** run
`npm run dev`, open 總覽 on a wide window and confirm the summary spans the
content width on one or two lines with the refresh button at the far right of
the first line. Then narrow the window to sm/mobile and confirm the summary
still reads well and the header toolbar wraps as before. Finally, confirm on a
machine/state where Foundation Models is unavailable that **no empty gap**
appears between the greeting and the hero card.

## STOP conditions

Stop and report back (do not improvise) if:

- The code at lines 1033–1078 or 1513–1533 doesn't match the excerpts above
  (the file drifted since this plan was written).
- `hasAnyData`, `monthKey`, `monthIncome`, `monthExpense`, `savingsRate`,
  `momChange`, `primaryCurrency`, or `budgetCats` are **not in scope** at the new
  insertion point (i.e. the summary's new position is outside the block where
  those are defined). They should be — the new position is a sibling a few lines
  down in the same JSX return — but if TypeScript disagrees, report rather than
  hoisting or restructuring state.
- Removing the summary from the left column visibly breaks the header's
  `justify-between` balance in a way a class tweak can't fix.
- A step's verification fails twice after a reasonable fix attempt.
- You conclude the summary needs to become a Card, or needs its own background
  surface, to look right. That contradicts the component's stated design intent
  (docstring line 1441-1442) — it is an operator decision, not yours.

## Maintenance notes

For the human/agent who owns this code after the change lands:

- **The summary is now a top-level row of the 總覽 layout, not a header child.**
  Anything inserted between the header and `{/* Row 1 · Northstar hero */}` must
  account for it. Its `mb-4` is what spaces it from the hero card — if a new row
  lands in between, that margin is what to revisit.
- **It can render `null`** (FM unavailable / no data / generation failed). Never
  wrap it in a parent that draws a border, background, or unconditional gap, or
  those states will show an empty box. This is why the plan uses a margin on the
  component's own root rather than a `gap` on a parent.
- A reviewer should scrutinize: that this stayed layout-only — no change to what
  data is sent to the model. The privacy contract ("aggregate numbers only — no
  raw transactions/merchants/accounts/tickers", line 1443-1444) is the thing to
  guard in any future edit to this component.
- Deferred out of this plan: the wider icon-size / button-variant consistency
  sweep across all routes (the `size={12}` fixed here is one of ~33 out-of-band
  instances repo-wide) — that is **plan 200**. Do not widen this branch into it.
