# Plan 208: Classify 淨值變動 onto the gain/loss axis — the hero badge contradicts 投資今日 under 紅漲綠跌

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update this plan's status row in `plans/README.md` — unless a
> reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 087a9b2e..HEAD -- src/routes/DashboardRoute.tsx DESIGN.md src/components/coss/badge.tsx`
> Note: plan 199 (already merged) moved lines in `DashboardRoute.tsx`; the line
> numbers below were read at `087a9b2e` (post-199). If the file moved again,
> find the excerpts by content.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW (a variant swap + doc edit; zero math changes)
- **Depends on**: none. **Coordinate**: plan 203 also edits `DESIGN.md` (§7; this plan edits §2.4 — different sections, trivial merge). Plan 209 also edits `DashboardRoute.tsx` (banner region ~970–1031; this plan edits ~1154 — different region).
- **Category**: bug (violates the decided color semantics)
- **Planned at**: commit `087a9b2e`, 2026-07-15
- **Source**: operator screenshot, 2026-07-15 — net worth badge **green** `+256,632 · 1.75%` sitting beside 投資今日 **red** `+252,326 · +1.74%`, same day, same direction, under 紅漲綠跌 (台股) mode.

## Why this matters

This app has a **decided, documented two-axis color rule** (`DESIGN.md` §2.4,
operator-locked 2026-06-10 after being bitten by the alternative):

- `--ns-pos`/`--ns-neg` — **fixed** green/red: toasts, cash-flow income/expense,
  amount signs, budget overspend, due alerts. Never affected by the palette switch.
- `--ns-gain`/`--ns-loss` — **market** up/down: 投資損益、報酬率、漲跌幅、movers、
  Portfolio/Alpha. Follows `[data-gainloss]` (設定 → 盈虧配色: US 綠漲 / TW 紅漲 / 中性).

The operator runs TW 紅漲綠跌. Their screenshot shows the incoherence: **the net
worth day-change badge renders green-when-up (fixed axis) while 投資今日 —
directly below it, describing the *same day's* movement, of which the net-worth
move is ~98% composed (+252,326 of +256,632) — renders red-when-up (market
axis).** Two market numbers, two colors, one glance.

The root cause is not a wrong token — it is that **「淨值變動」was never
classified by §2.4 at all**. It appears in neither list. The badge author fell
back to `success`/`error` by default. This plan classifies it (market axis),
fixes the one violating surface, and amends §2.4 so the next author doesn't
have to guess.

**What this plan deliberately does NOT do**: make everything one color. Full
uniformity was tried and explicitly rolled back on 2026-06-10 (binding gainloss
onto pos/neg turned success toasts red and expenses green in TW mode — the
operator demanded cash flow and alerts stay fixed). After this fix, 投資今日
(market, red-when-up in TW) and 本月現金流 (cash flow, fixed green-when-positive)
will STILL differ — **that split is the decided semantics**, and it matches what
every TW user lives with across brokerage apps (紅漲) and banking apps (支出紅).
The fix targets the actual incoherence: two *market* numbers wearing different
axes.

## Current state

### The violating surface — `src/routes/DashboardRoute.tsx:1152-1160`

```tsx
                {activeMetric.key === "netWorth" && reconciledTrend.length >= 2 ? (
                  <>
                    <Badge variant={momChange >= 0 ? "success" : "error"} className="gap-1 rounded-full px-2">
                      {momChange >= 0 ? <ArrowUp size={11} weight="bold" /> : <ArrowDown size={11} weight="bold" />}
                      <span className="num">
                        {momChange >= 0 ? "+" : "−"}{formatNumber(Math.abs(momChange))}
                        {momPct != null ? <> · {Math.abs(momPct).toFixed(2)}%</> : null}
                      </span>
                    </Badge>
```

(If plan 200's branch has merged, the `ArrowUp/ArrowDown size={11}` may read
`size={14}` — irrelevant to this plan; match by the `Badge variant=` line.)

### The infrastructure already exists — no new tokens or variants needed

- `src/components/coss/badge.tsx:30,32` — `gain` and `loss` Badge variants are
  **already defined**: `gain: "bg-gain/8 text-gain-foreground dark:bg-gain/16"`,
  `loss: "bg-loss/8 text-loss-foreground dark:bg-loss/16"`.
- `src/styles/globals.css:832-833` — `.gain { color: var(--ns-gain); }` /
  `.loss { color: var(--ns-loss); }` text classes exist.
- The pulse cell right below already does it correctly,
  `DashboardRoute.tsx:921`:
  `color: portfolioDayChange.amount >= 0 ? "var(--ns-gain)" : "var(--ns-loss)"`.

### The census of 總覽's colored deltas at `087a9b2e` — verified by the advisor

| Surface | Line | Token today | §2.4 verdict |
|---|---|---|---|
| **Net worth change badge (amount + %)** | ~1154 | `Badge success/error` | ❌ **market number on the fixed axis — THE fix** |
| 投資今日 pulse cell | 921 | `--ns-gain/loss` | ✅ correct |
| 本月現金流 pulse cell | 927 | `--ns-pos/neg` | ✅ correct — 現金流收支 is explicitly on the fixed list |
| 預算 pulse cell | ~933 | `--ns-neg` when over | ✅ correct — 預算超標 is explicitly on the fixed list |
| Hero chart line | 1216, 1313 | `--ns-accent` | ✅ not a semantic color at all (brand accent trend line) — leave alone |
| 今日漲跌 movers | (Today card) | gain/loss | ✅ correct per operator screenshot (red +12.14% in TW mode) — verify in Step 1 |

### The doc to amend — `DESIGN.md:83-85` (§2.4)

```
- `--ns-pos` / `--ns-neg`（+soft）— **固定**綠/紅。用於：成功/錯誤提示（toast、badge）、現金流收支正負、金額符號（+收入/−支出、轉入/轉出）、預算超標、到期警示。永不受配色切換影響。
- `--ns-gain` / `--ns-loss`（+soft）— **行情**漲跌。用於：投資損益、報酬率、漲跌幅、個股 movers、Portfolio/Alpha 指標。預設等於 pos/neg，透過 `[data-gainloss]` 切換（設定 → 「盈虧配色」，持久化於 uiPreferences）。
```

### Conventions

- zh-TW docs; conventional commits (example from log: `fix(dashboard): AI 本月摘要 gets its own full-width row`).
- Finance invariant #1 (`AGENTS.md`): don't silently change financial math — this plan changes **color classification only**; every number and calculation stays byte-identical.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `npm install` | exit 0 (fresh worktree; revert `package-lock.json` churn — known stale lockfile — do not commit it) |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Tests | `npm test` | 121 files / 1252 tests pass |
| Lint | `npm run lint` | exit 0, 0 errors (762 warnings pre-existing) |
| Dev | `npm run dev` | Vite dev server |

## Scope

**In scope**:
- `src/routes/DashboardRoute.tsx` — the net-worth delta badge only
- `DESIGN.md` — §2.4 only

**Out of scope** (do NOT touch):
- `本月現金流` / `預算` / to-do amounts / toasts — **correct by the decided rule.**
  Changing any of them re-litigates the 2026-06-10 decision.
- The hero chart's `--ns-accent` stroke — it is brand, not semantics. Making the
  chart red-when-rising in TW mode is a real design question, but it is the
  operator's, not yours; note it in your report if you feel strongly.
- `src/components/coss/badge.tsx` — the variants exist; do not add or retune.
- Other routes (投資/記帳/帳戶) — Step 1's census may FIND violations there;
  **report them, do not fix them.**
- `[data-gainloss]` mechanics, `uiPreferences`, settings UI.

## Git workflow

- Branch: `fix/ai-networth-delta-gainloss` off `main`.
- `git status` first; uncommitted work you did not create → **STOP**, never stash.
  Files under `plans/` are expected and not yours.
- Commit: `fix(dashboard): 淨值變動 badge 改走 gain/loss 行情軸（§2.4 邊界補課）`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Re-run the census

Confirm the table above at your HEAD. In particular:

```bash
grep -n "success\|error\|ns-pos\|ns-neg\|ns-gain\|ns-loss" src/routes/DashboardRoute.tsx | grep -vn "Toast\|StatusText"
```

Classify every hit against §2.4's two lists. Expected: the net-worth badge is
the only **market** number on the **fixed** axis in this file. If you find
others, list them in your report (do not fix). Also spot-check the 今日漲跌
movers use gain/loss.

**Verify**: your census table in the report, each row with a verdict.

### Step 2: Swap the badge onto the market axis

At ~`DashboardRoute.tsx:1154`:

```tsx
                    <Badge variant={momChange >= 0 ? "gain" : "loss"} className="gap-1 rounded-full px-2">
```

Everything else in the badge — arrows, sign, `formatNumber`, `momPct` — stays
byte-identical. The arrows inherit the badge's foreground; no separate change.

Add a one-line comment above it stating the classification, so the next reader
doesn't "fix" it back:

```tsx
                    {/* 淨值變動 is a market-performance number (§2.4 gain/loss axis):
                        it must agree with 投資今日/今日漲跌 under 紅漲綠跌, not with toasts. */}
```

**Verify**: `npx tsc --noEmit` → exit 0.
**Verify**: `grep -n 'momChange >= 0 ? "success"' src/routes/DashboardRoute.tsx` → no matches.

### Step 3: Amend DESIGN.md §2.4

Add 淨值變動 to the gain/loss bullet's 用於 list (`DESIGN.md:84`), e.g. after
「投資損益」: `淨值變動（總覽 hero badge 的日/月增減）`. Keep the register; do
not restructure the section.

**Verify**: `grep -n "淨值變動" DESIGN.md` → 1 match inside §2.4.

### Step 4: Gates + visual

- `npm run lint` → 0 errors; `npm test` → 1252; `npx tsc --noEmit` → 0.
- `npm run dev`, 設定 → 盈虧配色, and check the hero badge in **all three modes**:
  - **US 綠漲**: badge green-when-up — *visually unchanged from today* (gain
    defaults to pos), which is why this fix is safe for the default cohort.
  - **TW 紅漲**: badge red-when-up, **matching 投資今日 and 今日漲跌**. This is
    the fix, per the operator's exact screenshot scenario.
  - **中性**: badge teal/amber matching the preview in settings.
  - 本月現金流 stays fixed green/red in all three (unchanged).

Report which modes you checked. If you cannot run the dev server, say so.

## Test plan

**No new automated test.** The change is a ternary string swap consumed by CSS;
jsdom asserts nothing meaningful about resolved color, and snapshotting the
variant name would test the ternary against itself. Existing suite must stay at
1252 — that is the gate. (If a test asserts on `variant="success"` for this
badge — check with `grep -rn "success" src/routes/*.test.* src/**/Dashboard*` —
update it and say so; none is expected.)

## Done criteria

- [ ] `grep -n 'variant={momChange >= 0 ? "gain" : "loss"}' src/routes/DashboardRoute.tsx` → 1 match
- [ ] `grep -n "淨值變動" DESIGN.md` → 1 match in §2.4
- [ ] Census table delivered; any off-dashboard violations reported-not-fixed
- [ ] `git diff 087a9b2e..HEAD -- src/components/coss/badge.tsx` → empty
- [ ] `npx tsc --noEmit` 0; `npm run lint` 0 errors; `npm test` 1252
- [ ] Only `DashboardRoute.tsx` + `DESIGN.md` modified
- [ ] `plans/README.md` status row updated

## STOP conditions

- The badge at ~1154 no longer matches the excerpt (moved or already fixed).
- `gain`/`loss` Badge variants don't exist in `coss/badge.tsx`.
- Step 1's census finds the badge is NOT the only violation **in this file** —
  if 總覽 has more, report the full list first; the operator may want one plan.
- You feel the fix should extend to the hero chart stroke or another route.
  Report, don't do.

## Maintenance notes

- §2.4 now classifies 淨值變動. Any new aggregate-performance surface (e.g. a
  future 資產成長 KPI) should land on the gain/loss axis by the same logic; the
  judgment criterion from the original decision stands: 「台股使用者會不會預期
  這個數字紅漲綠跌」.
- The known residual: in TW mode the dashboard intentionally shows red
  (投資今日) beside green (本月現金流). If the operator ever reports *that* as
  confusing, the answer is the 中性色 palette, not a code change — the fixed
  axis was demanded by the operator after real breakage (green expenses).
- Reviewer: confirm zero numeric/logic diffs — this must be a pure color-axis
  change.
