# Plan 014: Replace stray English UI copy in content routes with zh-TW (consistency cleanup)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in "STOP conditions" occurs, stop and report — do not
> improvise. When done, update this plan's status row in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 8b2302d1..HEAD -- src/routes/DashboardRoute.tsx src/routes/InvestmentsRoute.tsx src/routes/InvestmentsAnalyticsTab.tsx src/routes/CashFlowRoute.tsx src/routes/HoldingDetailRoute.tsx`
> If any in-scope file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch treat
> it as a STOP condition. Because line numbers drift, this plan locates each
> string by `grep`, not by line number.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs (UI copy / i18n)
- **Planned at**: commit `8b2302d1`, 2026-06-16

## Why this matters

Northstar is zh-TW-first (`DESIGN.md` §1: 「繁體中文為主」). The content routes
intentionally hardcode Traditional Chinese strings (they do **not** use `t()`),
but a handful of user-visible English literals leaked in next to Chinese
siblings — a card title `Recent activity`, a table header `Ticker`, metric
labels `Alpha` / `Gainers` / `Losers`, and a fallback `Asset`. These read as
half-finished and undercut the "calm, native" product feel. This plan replaces
them with Chinese, matching the surrounding code style (literal strings, no new
`t()` keys).

**Important nuance (do not over-reach):** Northstar uses **English mono-uppercase
eyebrows by deliberate convention** (`DESIGN.md` §3.5: 「頁首使用英文 eyebrow + 中文 h1」,
e.g. `PORTFOLIO`, `LONG-TERM PROGRESS`). Those are **out of scope** — do not
translate page-header eyebrows. This plan only touches the specific strings
listed below, which sit beside Chinese siblings and are inconsistencies, not the
convention.

## Current state

The app does not localize content routes via i18next; strings are literal JSX.
Match that — replace English literal with Chinese literal in place.

Strings to fix (located by grep; exact lines drift):

- `src/routes/CashFlowRoute.tsx` — ledger card title + count, **not** an eyebrow
  (rendered as a 15px/600 title + muted text):
  ```tsx
  <span className="text-[15px]" style={{ fontWeight: 600 }}>Recent activity</span>
  ...
  <span className="muted text-xs">{displayRows.length} events</span>
  ```
- `src/routes/InvestmentsRoute.tsx` — holdings table column header (siblings are
  「日期」「標的」「數量」 etc.):
  ```tsx
  <SortableHeader label="Ticker" sortKey="ticker" sort={sort} onToggle={toggleSort} />
  ```
- `src/routes/DashboardRoute.tsx` — `PortfolioStrip` cell label (siblings 「投資組合」、
  `${benchmarkTicker} 指標`) and `MoverColumn` labels:
  ```tsx
  { label: "Alpha", val: data.alpha, color: ... },
  ...
  <MoverColumn label="Gainers" tone="pos" movers={gainers} />
  <MoverColumn label="Losers" tone="neg" movers={losers} />
  ```
- `src/routes/InvestmentsAnalyticsTab.tsx` — performance breakdown `Alpha` label
  (same cell pattern as Dashboard; confirm by grep — see Step 1).
- `src/routes/HoldingDetailRoute.tsx` — assetType fallback and a mixed eyebrow:
  ```tsx
  {asset.assetType || "Asset"} · {asset.ticker}
  ...
  <div className="ns-eyebrow" ...>Your position · 平均成本</div>
  ```

Prescribed replacements (use exactly these; they are the decided copy):

| File | Find (literal) | Replace with |
|---|---|---|
| CashFlowRoute.tsx | `Recent activity` | `近期動態` |
| CashFlowRoute.tsx | `{displayRows.length} events` (the `events` word) | `{displayRows.length} 筆` |
| InvestmentsRoute.tsx | `label="Ticker"` | `label="代號"` |
| DashboardRoute.tsx | `label: "Alpha"` | `label: "超額報酬"` |
| DashboardRoute.tsx | `label="Gainers"` | `label="上漲"` |
| DashboardRoute.tsx | `label="Losers"` | `label="下跌"` |
| InvestmentsAnalyticsTab.tsx | `Alpha` label literal (the metric-cell label only) | `超額報酬` |
| HoldingDetailRoute.tsx | `\|\| "Asset"` | `\|\| "資產"` |
| HoldingDetailRoute.tsx | `Your position · 平均成本` | `你的部位 · 平均成本` |

If `superscript`/help text already says "Alpha" inside a tooltip, leave the
tooltip; only change the visible cell **label**.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0, no errors |
| Tests | `npm run test` | all pass |
| Lint | `npm run lint` | exit 0 (≈706 pre-existing warnings are OK; **0 errors**) |
| Visual check | `npm run dev` then open the affected screens in the browser preview | strings render in Chinese |

## Scope

**In scope** (only these files):
- `src/routes/CashFlowRoute.tsx`
- `src/routes/InvestmentsRoute.tsx`
- `src/routes/DashboardRoute.tsx`
- `src/routes/InvestmentsAnalyticsTab.tsx`
- `src/routes/HoldingDetailRoute.tsx`

**Out of scope** (do NOT touch):
- Any `ns-eyebrow` **page-header** eyebrow (e.g. `PORTFOLIO`, `LONG-TERM PROGRESS`,
  `INTERACTIVE`) — intentional English convention per `DESIGN.md` §3.5.
- Ticker symbols, account codes, currency codes (e.g. `0050.TW`, `TWD`).
- Introducing `t()` / i18next into these routes — they are zh-TW literal by design.
- `src/locales/**` and `copy.csv` — no catalog changes needed for literal JSX.

## Git workflow

- Branch: `advisor/014-i18n-content-copy`
- One commit; message style = conventional commits (repo uses e.g.
  `fix(sync): ...`, `docs(roadmap): ...`). Suggested:
  `fix(i18n): replace stray English UI copy in content routes with zh-TW`
- Do NOT push or open a PR unless the operator asks.

## Steps

### Step 1: Locate every target literal
Run:
```
grep -rn '"Alpha"\|label="Ticker"\|label="Gainers"\|label="Losers"\|Recent activity\|"Asset"\|Your position' src/routes
```
Confirm you find the occurrences described in "Current state". If `Alpha`
appears in `InvestmentsAnalyticsTab.tsx` as a metric-cell label, include it;
if it only appears inside a `help=`/tooltip string, leave that one.

**Verify**: the grep output matches the rows in the replacement table (allowing
for the `events`/count and `|| "Asset"` cases which need context).

### Step 2: Apply the replacements
Edit each occurrence per the table. For the CashFlow count, change only the word
`events` → `筆` (keep `{displayRows.length}`). For `assetType || "Asset"`, change
only the fallback literal.

**Verify**: `grep -rn 'Recent activity\|label="Ticker"\|label="Gainers"\|label="Losers"\|Your position\|\|\| "Asset"' src/routes` → no matches for the changed strings. (`Alpha` may still appear inside tooltip help text — that is allowed.)

### Step 3: Typecheck, lint, build-sanity
**Verify**:
- `npx tsc --noEmit` → exit 0
- `npm run lint` → 0 errors
- `npm run test` → all pass

### Step 4: Visual confirm
Run `npm run dev`, open Dashboard (Top Movers + Portfolio strip), Cash Flow
(ledger card), Investments (holdings table header), a Holding Detail page.

**Verify**: the previously-English labels now show 上漲/下跌/超額報酬/代號/近期動態/
你的部位/資產. No layout break (labels are short).

## Test plan

No new unit tests — these are display-string changes with no logic. The
existing suite must stay green (`npm run test`). Verification is the typecheck +
visual check above.

## Done criteria

ALL must hold:
- [ ] `grep -rn 'Recent activity\|label="Ticker"\|label="Gainers"\|label="Losers"\|Your position' src/routes` → no matches
- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run lint` → 0 errors
- [ ] `npm run test` passes
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report (do not improvise) if:
- A target literal is not found where described (file drifted) — re-locate via
  grep; if still absent, STOP.
- Changing a label visibly breaks a fixed-width layout (truncation/overflow) —
  report which one rather than restyling.
- You find the string is actually used as a logic key/ID, not display text
  (e.g. a switch on `"Gainers"`), in which case do NOT change it — report it.

## Maintenance notes

- These routes are zh-TW literal by design; future copy should also be literal
  Chinese here (no `t()`), unless the team adopts a catalog (`copy.csv`) for
  content routes — which is a separate, larger decision.
- Reviewer: confirm no page-header eyebrow was translated (those stay English).
- Deferred: `Alpha` is a finance term; if the team prefers keeping "Alpha"
  visible, that is a copy decision — this plan standardizes on 超額報酬 for
  consistency with neighboring Chinese labels.
