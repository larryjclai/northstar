# Plan 204: Adopt the `destructive` Button variants; make delete look like delete

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update this plan's status row in `plans/README.md` — unless a
> reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 087a9b2e..HEAD -- src/routes src/components`
> The census below is from `087a9b2e`. **Re-census in Step 1 and use your own numbers.**

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (changes what destructive controls LOOK like across the app — visible, intended)
- **Depends on**: **plans/201** (soft), **plans/202** (soft) — see below
- **Category**: bug
- **Planned at**: commit `087a9b2e`, 2026-07-15. **Census refreshed at `96e3d12a`.**
- **Source**: `$impeccable critique` of `src/routes` (2026-07-15, 22/40) — P1

### Dependencies — one is HARD

- ⚠ **HARD: plan 203 must land first.** 203 deletes the inert Phosphor `size` props from
  icons inside `Button`/`Badge`. It and this plan touch **the same lines** in 5 shared
  files (`CashFlowRoute`, `InvestmentsRoute`, `CategoryManagementDrawer`,
  `HoldingDetailRoute`, `RecurringRulesTab`) — e.g.
  `<Button variant="ghost" style={{ color: "var(--ns-neg)" }}><Trash size={14} /></Button>`
  where 203 removes `size={14}` and this plan rewrites the `variant` and drops the
  `style`. Running them concurrently guarantees conflicts.
  **Verify before starting**: `git log --oneline -20 | grep -c "icon-size-source-of-truth"`
  or check that `grep -rn "PencilSimple size=" src/components/CategoryManagementDrawer.tsx`
  returns nothing. If 203 has NOT landed, **STOP and report**.
- **201 (merged)** deleted the duplicated 編輯持倉 modal and its 3 hand-rolled delete
  buttons. They are already gone — do not look for them in `InvestmentsRoute.tsx`.
- **206 (merged)** added the one existing `destructive-outline` call site. Leave it.
- **202** replaces close buttons — different controls. Trivial merge if both touch a file.

## Why this matters

**In a finance app, the control that destroys a record is visually indistinguishable
from the one that opens it — on at least one page.**

`src/routes/TransactionsRoute.tsx` renders delete with **no colour distinction at
all** from edit. Same ghost variant, same size, same foreground. `Trash` and
`PencilSimple` at small sizes are near-identical silhouettes. That is the whole
finding: a user deleting a transaction gets no visual warning that this button is
different from the one beside it.

Meanwhile the design system **already solved this and almost nobody used it**.

⚠ **Census refreshed at `96e3d12a` — the original claim has drifted, in your favour:**

- `variant="destructive"` → **0 call sites** (still true)
- `variant="destructive-outline"` → **1 call site**: `src/routes/AccountsRoute.tsx`, the
  帳本 delete button added by plan 206 (merged after this plan was written). It was 0 when
  this plan was authored. **That call site is already correct — do not "fix" it**; treat it
  as the worked example of what every other delete trigger should look like.
- Both are **defined** in `src/components/coss/button.tsx`
- `--destructive: var(--ns-neg)` is correctly wired in `globals.css`

**Re-run the census yourself in Step 1 and use your numbers, not these.**

Instead, red is hand-applied. The census found **three different tokens for one
idea**, plus dead fallbacks that are also wrong:

| Pattern | Note |
|---|---|
| `style={{ color: "var(--ns-neg)" }}` | the plurality |
| `style={{ color: "var(--ns-danger)" }}` | **same value** — `globals.css:157` is `--ns-danger: var(--ns-neg)` |
| `style={{ color: "var(--ns-danger, #d33)" }}` | `HoldingDetailRoute.tsx:382` |
| `style={{ background: "var(--ns-neg)" }}` + `text-white` | `HoldingEditModal.tsx:201` |
| **nothing** | `TransactionsRoute.tsx` delete |

**The hex fallbacks are dead AND wrong.** `--ns-danger` *is* defined, so
`var(--ns-danger, #d33)` never falls back. And the three fallback hexes in the repo
disagree with each other and with the real token:

| Written | Where | Real `--ns-neg` |
|---|---|---|
| `#d33` | `HoldingDetailRoute.tsx:358,382` | `#c62a1d` |
| `#c0392b` | `Toast.tsx:502,505`, `FireGoalCard.tsx:101` | `#c62a1d` |

Three reds, none correct, none rendering. This violates DESIGN.md §7's
「顏色一律用 ns token，不寫死色碼」 by construction.

Copy is split too: **「確定刪除」 ×7 vs 「確認刪除」 ×3**.

The critique's diagnosis of *why*: no call site was ever "first" — each author
looked at the neighbouring line, not at `coss/button.tsx`. This plan makes the
variant the path of least resistance.

## Current state

### The variants that already exist — `src/components/coss/button.tsx`

Read the file. Confirm both `destructive` and `destructive-outline` are present and
note their exact rendering (`destructive` is **solid** in COSS; `ui/button.tsx`'s is
soft — **you want the COSS one**; `ui/` is quarantined per `ui/README.md`).

### The two shapes to standardize on

- **Trigger** (the button that *asks* — 刪除持倉, the trash icon in a row):
  `variant="destructive-outline"`
- **Confirm** (the button that *does it* — 確定刪除):
  `variant="destructive"`

This is the DESIGN.md §12 confirm-gate pattern already used across the app.

### The emotional-journey bug this also fixes

`HoldingEditModal.tsx:196-213` — 確認刪除 is `background: var(--ns-neg)` + `text-white`
+ `font-semibold`; 取消 is **unstyled text** at `--ns-muted`. The destructive option
is visually dominant and the escape is the weakest thing on screen.

`TransactionDetailPanel.tsx:298-313` solves the identical interaction the **opposite**
way — both `outline`/`ghost`, red carried only as text colour.

Neither is wrong alone. Having both means muscle memory for "which button is safe"
is invalidated between screens. Standardizing fixes it; **the confirm should be
`destructive`, the cancel should be a normal `ghost`/`outline` Button — not bare text.**

### Conventions

- `AGENTS.md` 樣式撰寫優先序: COSS component > `ns-*`/Tailwind > inline style
  (**dynamic values only**). Every inline red object here is a static value = violation.
- UI copy is edited in `copy.csv` then round-tripped via `npm run copy:export/import`
  — **do not hand-edit user-visible strings straight in `.tsx`.** See Step 4.
- Conventional commits.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `npm install` | exit 0 |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Tests | `npm test` | 121 files / 1252 tests |
| Lint | `npm run lint` | exit 0, **0 errors** |
| Build | `npm run build` | exit 0 |
| Dev | `npm run dev` | Vite dev server |
| Copy round-trip | `npm run copy:export` / `npm run copy:import` | see Step 4 |

Revert `package-lock.json` churn; do not commit it.

## Scope

**In scope** — **buttons only**:
- Delete/destructive **buttons** in: `AccountsRoute.tsx`, `GoalsRoute.tsx`,
  `CashFlowRoute.tsx`, `RecurringInvestmentsTab.tsx`, `RecurringRulesTab.tsx`,
  `InvestmentImportWizard.tsx`, `TransactionDetailPanel.tsx`,
  `CategoryManagementDrawer.tsx`, `HoldingDetailRoute.tsx`, `HoldingEditModal.tsx`,
  `TransactionsRoute.tsx`, `InvestmentsRoute.tsx` (skip if 201 landed)
- The dead hex fallbacks on those buttons

**Out of scope** (do NOT touch):
- **`src/components/coss/button.tsx`** — the variants exist and are correct. Do not
  retune them to match a call site.
- **Non-button uses of `--ns-neg`.** The census finds **38** `color: "var(--ns-neg)"`
  occurrences; most are **amounts, deltas, and status text**, not buttons. Those are
  correct — negative money *should* be red. **Only touch controls.** This is the
  main way to get this plan wrong.
- `Toast.tsx:502,505` and `FireGoalCard.tsx:101` hex fallbacks — same dead-fallback
  bug, but they are **not buttons** (toast border/icon, a goal card). Same fix,
  different plan. List them; leave them.
- The gain/loss system (`--ns-gain`/`--ns-loss`, `[data-gainloss]`). **Do not confuse
  it with pos/neg.** Per DESIGN.md §2.4, `--ns-neg` is fixed red (cash flow, toasts,
  amounts); `--ns-loss` follows the TW/US/Neutral setting. **A destructive button is
  `--ns-neg`, never `--ns-loss`.** Getting this wrong would make delete buttons turn
  green for TW users.
- Close buttons — plan 202.
- `AccountsRoute.tsx`'s missing delete confirmation (§12.2 violation) — real, separate finding.

## Git workflow

- Branch: `fix/ai-destructive-variant` off `main`.
- `git status` first; uncommitted work you did not create → **STOP**, never stash.
  `plans/` files are expected and not yours.
- Commit: `fix(ui): 刪除動作改用 destructive variant，收斂 14 處手刷紅色`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Census the buttons — separate controls from text

```bash
grep -rn 'var(--ns-neg)\|var(--ns-danger' src/routes/*.tsx src/components/*.tsx
```

For each hit, classify: **button/control** (in scope) or **text/amount/border**
(out of scope). Produce the in-scope list before editing anything.

Expected rough shape: ~14 control sites; ~30+ text/amount sites you will **not**
touch. **If your control count is wildly different from ~14, report it.**

**Verify**: report both counts and the in-scope list.

### Step 2: Convert triggers and confirms

Per site:

```tsx
// trigger — before
<Button variant="ghost" size="icon-sm" style={{ color: "var(--ns-neg)" }} aria-label="刪除"><Trash /></Button>
// after
<Button variant="destructive-outline" size="icon-sm" aria-label="刪除"><Trash /></Button>

// confirm — before
<Button variant="ghost" size="sm" style={{ color: "var(--ns-danger, #d33)" }}>確認刪除</Button>
// after
<Button variant="destructive" size="sm">確定刪除</Button>
```

Delete the inline `style` object entirely when its **only** job was the red. If it
also carries a dynamic value, keep the dynamic part.

`HoldingEditModal.tsx:196-213` needs the extra fix: the hand-rolled 確認刪除 /
取消 / 刪除持倉 raw `<button>`s become `<Button variant="destructive">` /
`<Button variant="ghost">` / `<Button variant="destructive-outline">`. **The cancel
must become a real Button, not bare text** — that is the emotional-journey fix.
Drop the hardcoded `text-white` (§7 violation; the variant handles its own foreground).

**Verify**: `npx tsc --noEmit` → exit 0.
**Verify**: `grep -rn 'ns-danger, #' src/routes/ src/components/` → only `Toast.tsx` and `FireGoalCard.tsx` (out of scope) remain.

### Step 3: One token

Any remaining in-scope `--ns-danger` → `--ns-neg`. Per DESIGN.md §2.7 the raw token
is preferred for new code; they are the same value (`globals.css:157`).

**Verify**: `grep -rn 'var(--ns-danger' src/routes/*.tsx src/components/*.tsx` → only out-of-scope sites.

### Step 4: One string — via copy.csv, NOT the tsx

「確定刪除」 (7) wins over 「確認刪除」 (3) on frequency alone.

⚠ **`AGENTS.md`: UI copy is edited in `copy.csv` then round-tripped via
`npm run copy:export/import` — do not hand-edit strings straight in `.tsx`.**

1. Check whether these strings are in the catalogue: `grep -n "確認刪除\|確定刪除" copy.csv`
2. **If they are**: edit `copy.csv`, run `npm run copy:import`, and let the tooling
   update `translation.json`. Report what it changed.
3. **If they are not** (hardcoded literals never migrated): change them in the `.tsx`
   and **say so explicitly in your report** — you are adding to the un-migrated debt,
   which is a known state, not a licence to ignore the rule.

**If the round-trip produces a diff you don't understand, STOP.** The copy pipeline
touches translation files broadly and is easy to corrupt.

**Verify**: `grep -rn "確認刪除" src/` → no matches (or: only sites you documented as out of scope).

### Step 5: Gates

- `npx tsc --noEmit` → 0
- `npm run lint` → 0 errors; warnings must not rise
- `npm test` → 1252
- `npm run build` → 0
- `git status --short` → only in-scope files (+ `copy.csv`/`translation.json` if Step 4 used the pipeline)

### Step 6: Visual — this one is required, not optional

`npm run dev`. **This plan changes what destructive controls look like. That is the
point, and it is the only way to know it worked.**

Check:
1. **記帳 / Transactions** — delete is now visually distinct from edit. **This is the
   headline fix.**
2. 帳戶 row actions — the delete in the 5-button cluster now reads as destructive.
3. 編輯持倉 → 刪除持倉 → 確定刪除: confirm is `destructive`, cancel is a real Button
   with comparable weight. **The escape must no longer be the weakest thing on screen.**
4. 分類管理 drawer delete.
5. **Toggle 設定 → 外觀主題 to light AND dark.** `--ns-neg` differs per theme
   (`#c62a1d` light / `#ff7d6b` dark). Confirm both are legible.
6. **Toggle 設定 → 漲跌配色 to TW (紅漲綠跌).** Confirm delete buttons **stay red**.
   If any turned green you used `--ns-loss` instead of `--ns-neg` — that is a bug,
   report immediately.

Report which surfaces you reached and which you could not. Do not claim checks you did not run.

## Test plan

**No new automated test.** Variant props are visual; jsdom computes no layout or
cascade, so an assertion would prove nothing and could not fail.

Check for existing tests asserting on these strings before you start:
`grep -rn "確認刪除\|確定刪除" src/**/*.test.*` — **if any exist, Step 4 will break
them and updating them is in scope.** Report what you changed.

Gate: `npm test` at 1252 (or 1252 with documented string-assertion updates).

## Done criteria

ALL must hold:

- [ ] `grep -rn 'variant="destructive"' src/ | grep -v coss/button` → ≥1
- [ ] `grep -rn 'variant="destructive-outline"' src/ | grep -v coss/button` → ≥1
- [ ] `grep -rn 'ns-danger, #' src/routes/ src/components/` → only `Toast.tsx`, `FireGoalCard.tsx`
- [ ] `grep -rn "確認刪除" src/` → no matches (or documented exceptions)
- [ ] `grep -rn 'text-white' src/routes/HoldingEditModal.tsx` → no matches
- [ ] `git diff 087a9b2e..HEAD -- src/components/coss/button.tsx` → **empty**
- [ ] **No non-button `--ns-neg` was touched**: `git diff -- src/ | grep '^-.*var(--ns-neg)'` shows only control sites
- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run lint` exits 0, 0 errors
- [ ] `npm test` exits 0
- [ ] `npm run build` exits 0
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:
- Step 1's control count is far from ~14.
- `coss/button.tsx`'s `destructive` / `destructive-outline` don't exist or don't render as described.
- The COSS `destructive` looks wrong at a confirm site (e.g. too loud in a dense row) — that is a **design** question for the operator, not yours to solve with a className override.
- Step 4's copy round-trip produces a diff you can't explain.
- **Any delete button changes colour when 漲跌配色 is set to TW.** You used the wrong token.
- You are tempted to touch a non-button `--ns-neg`.
- `npm test` was already failing before you started.

## Maintenance notes

- **`variant` is still optional on `<Button>`**, so a 15th author can still hand-roll
  red tomorrow. This plan fixes today's drift; it does not prevent recurrence. The
  durable fix is making `variant` **required** — which forces every author to answer
  "is this the primary action / is this destructive?", a question currently answered
  by omission. That is a real API change with ~227 call sites of blast radius; it is
  the natural sequel and it is **plan 205's territory**.
- **The dead-hex-fallback bug also exists at `Toast.tsx:502,505` and
  `FireGoalCard.tsx:101`** (`var(--ns-danger, #c0392b)` — dead, and `#c0392b` ≠ the
  real `#c62a1d`). Left out of scope because they are not buttons. Worth a one-line
  follow-up.
- **`AccountsRoute.tsx` deletes an account with no confirmation** (DESIGN.md §12.2).
  After this plan it will at least *look* destructive, which arguably makes the
  missing confirm worse, not better. Blast radius is limited — `repositories.ts:970`
  rejects accounts with transactions — but this is a real gap and this plan does not
  close it.
- A reviewer should scrutinize: that no **amount/text** `--ns-neg` was converted (the
  single easiest way to wreck this — negative money must stay red), that
  `coss/button.tsx` is untouched, and that `--ns-loss` was never substituted for
  `--ns-neg`.
