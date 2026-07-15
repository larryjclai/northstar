# Plan 200: Audit button & icon consistency across all routes, then fix the unambiguous violations

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **This plan has two phases and a hard gate between them.** Phase A is an
> audit that ships a document and changes no UI. Phase B applies **only** the
> mechanical fixes enumerated in this plan — the ones where the correct value
> is already decided by `DESIGN.md`. Anything Phase A turns up that is *not* on
> the Phase B list gets written into the audit doc as a recommendation for the
> operator. **You do not get to decide taste questions.**
>
> **Drift check (run first)**: `git diff --stat 36d25f50..HEAD -- src/routes/ src/components/ DESIGN.md`
> This plan's evidence is a repo-wide grep census taken at `36d25f50`. If files
> changed since, re-run the census commands in Step A1 and use *your* numbers,
> noting the delta in your report. Do not treat the counts below as ground truth
> if the tree has moved.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW (Phase A), MED (Phase B — touches many files shallowly)
- **Depends on**: none. **Coordinate with plan 199**: it fixes one `size={12}`
  icon in `DashboardRoute.tsx:1529`. If 199 lands first, that instance is already
  done — expect 28 not 29. If this plan lands first, 199's Step 2 icon change is
  a no-op. Neither blocks the other; just don't both edit that line concurrently.
- **Category**: tech-debt
- **Planned at**: commit `36d25f50`, 2026-07-15

## Why this matters

The operator asked whether buttons and icons are used consistently across every
page. A census at `36d25f50` says: **mostly yes, with a measurable tail of
drift.** Icons appear at 8 distinct sizes (10/11/12/13/14/15/16/18) where
`DESIGN.md` sanctions two bands; 29 instances fall below the sanctioned band. Six
Buttons hand-roll `className="h-9"` instead of using the `size="lg"` variant
that produces exactly that height. This is the kind of drift that is invisible
in any single PR and obvious when you look at the whole app at once — which is
what this plan does.

The value here is **not** a big refactor. It is (1) writing down the census so
the next drift is detectable, and (2) closing the gap on the violations where
`DESIGN.md` has *already* decided the right answer, so nobody has to re-litigate
them. Everything requiring judgment stays with the operator.

## Current state

### The rules that already exist — this plan enforces them, it does not invent them

`DESIGN.md` §7 圖示系統 (lines 337–347). Quoted verbatim — the executor has not
read this file:

```
使用 **Phosphor Icons**（`@phosphor-icons/react`）：

<Star size={14} weight="fill" color="var(--ns-pos)" />

慣例：
- 一般 UI 圖示 `size={13–16}`、列表/卡片圖示 `size={18–26}`
- `weight="fill"` 用於強調狀態（達成、警告）、`weight="bold"` 用於按鈕內的 + 號
- 顏色一律用 ns token，不寫死色碼
```

`DESIGN.md` line 256, on the Button component:

```
| `Button` | variant: `default` / `outline` / `ghost` / `secondary` / `link` /
`destructive` / `destructive-outline`；size: `xs` / `sm` / `default` / `lg` /
`xl` / `icon-*`；`render={<Link …/>}` 可變身路由連結 |
```

**Note a real discrepancy to record in the audit**: `DESIGN.md` lists sizes
`xs / sm / default / lg / xl / icon-*` and variants including
`destructive-outline`, but the actual component at `src/components/ui/button.tsx`
implements sizes `default / xs / sm / lg / icon / icon-xs / icon-sm / icon-lg`
(**no `xl`**) and variants `default / outline / secondary / ghost / destructive /
link` (**no `destructive-outline`**). `DESIGN.md` is stale here. Document it;
**do not "fix" it by adding an `xl` size or a `destructive-outline` variant** —
that is a design decision, not a doc typo.

### The Button component — the source of truth for sizes

`src/components/ui/button.tsx`, the `size` variants:

```ts
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs ... [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] ... [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs": "size-6 rounded-[min(var(--radius-md),10px)] ... [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7 rounded-[min(var(--radius-md),12px)] ...",
        "icon-lg": "size-9",
      },
```

**`size="lg"` is literally `h-9`.** That is the finding behind Phase B item 2.

### Census at `36d25f50` — reproduce it, don't trust it blind

Icon size distribution across `src/routes/*.tsx` + `src/components/*.tsx`:

| `size={N}` | count | `DESIGN.md` §7 verdict |
|---|---|---|
| 14 | 136 | ✅ in band (13–16) — the de-facto default |
| 16 | 60 | ✅ in band |
| 13 | 28 | ✅ in band |
| 15 | 22 | ✅ in band |
| **12** | **18** | ❌ below band |
| 18 | 13 | ✅ list/card band (18–26) — verify each is actually a list/card icon |
| **11** | **12** | ❌ below band |
| **10** | **3** | ❌ below band |

Button variant usage (`variant="..."` across the same files): `ghost` 93,
`outline` 84, `secondary` 5. (Raw counts also match `center` 10, `drawer` 8,
`sheet` 4, `warning` 2, `success` 1, `error` 1 — **these are NOT Button
variants**; they belong to other components such as `ModalShell`. Do not report
them as Button drift. Confirm this during Phase A before writing it down.)

Button size usage: `icon-sm` 33, `sm` 22, `xs` 13, `icon-xs` 6, `icon` 6.

### The 29 below-band icon instances (Phase B item 1)

Every one of these is a Phosphor icon below `DESIGN.md`'s 13–16 band:

```
src/routes/AccountsRoute.tsx:779            <Check size={12}
src/routes/CashFlowRoute.tsx:1546           <X size={11}
src/routes/CashFlowRoute.tsx:1688           <X size={10}
src/routes/CashFlowRoute.tsx:1808           <CaretRight size={12}
src/routes/CashFlowRoute.tsx:2344           <CaretRight size={11}
src/routes/CashFlowRoute.tsx:3250           <Plus size={12}
src/routes/CashFlowRoute.tsx:3279           <Plus size={12}
src/routes/CashFlowRoute.tsx:3898           <Sparkle size={12}
src/routes/GoalsRoute.tsx:218               <Target size={12}
src/routes/CategoriesRoute.tsx:280          <X size={10}
src/routes/HoldingDetailRoute.tsx:463       <ArrowUp size={11}
src/routes/DashboardRoute.tsx:1106          <ChartBar size={11}
src/routes/DashboardRoute.tsx:1149          <ArrowDown size={11}
src/routes/DashboardRoute.tsx:1529          <ArrowsClockwise size={12}   ← also touched by plan 199
src/routes/InvestmentsRoute.tsx:1928        <CaretRight size={12}
src/routes/InvestmentsRoute.tsx:1966        <ArrowUp size={11}
src/routes/InvestmentsRoute.tsx:1967        <ArrowDown size={11}
src/routes/InvestmentsRoute.tsx:1968        <ArrowsDownUp size={11}
src/routes/RecurringRulesTab.tsx:134        <Plus size={12}
src/routes/RecurringRulesTab.tsx:249        <CalendarBlank size={12}
src/routes/RecurringRulesTab.tsx:539        <Trash size={12}
src/routes/RecurringInvestmentsTab.tsx:177  <CalendarBlank size={12}
src/components/CategoryManagementDrawer.tsx:238  <PencilSimple size={12}
src/components/CategoryManagementDrawer.tsx:240  <Trash size={12}
src/components/BookSwitcher.tsx:75          <CaretUpDown size={11}
src/components/LedgerDateControl.tsx:111    <CaretDown size={12}
src/components/TransactionDetailPanel.tsx:180  <ArrowsClockwise size={10}
src/components/Toast.tsx:451                <Copy size={12}
```

**Known exemption — do not touch**: `src/components/BookSwitcher.tsx:64`
`<BookDot ... size={11} />`. `BookDot` is a **local coloured `<span>` dot**, not
a Phosphor icon (see its definition at `BookSwitcher.tsx:11-25`); `DESIGN.md` §7
does not govern it. An 11px dot next to 13.5px nav text is correct. This is the
class of mistake to watch for: **`size=` is not exclusively a Phosphor prop.**

### The 6 hand-rolled `h-9` Buttons (Phase B item 2)

```
src/routes/CashFlowRoute.tsx:1461   <Button variant="outline" className="h-9 sm:h-9 whitespace-nowrap">
src/routes/CashFlowRoute.tsx:1498   <Button variant="outline" className="h-9 sm:h-9 whitespace-nowrap" onClick={() => setClientManagerOpen...
src/routes/CashFlowRoute.tsx:1501   <Button variant="outline" className="h-9 sm:h-9 whitespace-nowrap" onClick={openInvoiceCreate}>
src/routes/CashFlowRoute.tsx:1507   <Button className="h-9 sm:h-9 whitespace-nowrap" onClick={() => openCreate("expense")}>
src/routes/DashboardRoute.tsx:1055  <Button variant="outline" className="h-9 flex-1 sm:flex-none shrink-0 sm:h-9" onClick={refreshMarket}...
src/routes/DashboardRoute.tsx:1060  <PopoverTrigger render={<Button variant="outline" className="h-9 flex-1 sm:flex-none shrink-0 sm:h-9" />}>
```

Note `h-9 sm:h-9` is redundant on its face — the same height at both breakpoints.

### Conventions to match

- `AGENTS.md` 樣式撰寫優先序: (1) COSS components; (2) `ns-*` utility classes and
  Tailwind utilities; (3) inline `style={{}}` **only for dynamic values** from
  props/state/computation. Static styling must not be inline. A static pattern
  repeated 3+ times should become a shared `ns-*` class (example given in
  `AGENTS.md`: `.ns-field-label`).
- `DESIGN.md` §7: icon colors must use ns tokens, never hard-coded hex.
- Docs in this repo are zh-TW first with English section scaffolding. Match
  `DESIGN.md`'s register when writing the audit doc.

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0, no errors |
| Tests     | `npm test`         | all pass (~1252 tests) |
| Lint      | `npm run lint`     | exit 0, 0 errors |
| Build     | `npm run build`    | exit 0 (`tsc && vite build`) |
| Dev app   | `npm run dev`      | Vite dev server |

**Record the baseline test count before you change anything.** You will need it
in Done criteria.

## Suggested executor toolkit

- The `impeccable` skill, if available in your environment, is well matched to
  the Phase A judgment calls (visual hierarchy, consistency, design tokens).
  Use it for *analysis* only — its recommendations go into the audit doc, they
  do not authorize you to widen Phase B.

## Scope

**In scope**:
- `docs/button-icon-audit.md` (create — Phase A deliverable)
- `DESIGN.md` (Phase A: **only** the §7 icon-scale clarification in Step A3 and
  the stale-Button-API correction in Step A4. No other edits.)
- Phase B: **only** the exact lines enumerated in the two tables above, in these
  files:
  `src/routes/AccountsRoute.tsx`, `src/routes/CashFlowRoute.tsx`,
  `src/routes/GoalsRoute.tsx`, `src/routes/CategoriesRoute.tsx`,
  `src/routes/HoldingDetailRoute.tsx`, `src/routes/DashboardRoute.tsx`,
  `src/routes/InvestmentsRoute.tsx`, `src/routes/RecurringRulesTab.tsx`,
  `src/routes/RecurringInvestmentsTab.tsx`,
  `src/components/CategoryManagementDrawer.tsx`, `src/components/BookSwitcher.tsx`,
  `src/components/LedgerDateControl.tsx`, `src/components/TransactionDetailPanel.tsx`,
  `src/components/Toast.tsx`

**Out of scope** (do NOT touch, even though they look related):
- `src/components/ui/button.tsx` — **do not add an `xl` size or a
  `destructive-outline` variant**, however much `DESIGN.md` implies they exist.
  The doc is stale; the component is correct. Changing the design system's
  primitives is an operator decision.
- **The 13 `size={18}` icons.** They are plausibly the list/card band and
  plausibly fine. Audit them in Phase A; do not change them in Phase B.
- **Any `size={13}` or `size={15}` icon.** They are in band. Do not normalize
  them to 14 "for consistency" — `DESIGN.md` sanctions a band, not a single
  value, and a 22-file diff to satisfy your own preference is exactly the
  scope creep this plan exists to prevent.
- `src/components/BookSwitcher.tsx:64` `<BookDot size={11} />` — exempt, see above.
- **Converting raw `<button>` elements to `<Button>`.** The census counts 22 raw
  `<button>` in `CashFlowRoute.tsx` alone, plus more elsewhere. Many are
  deliberately bespoke (`ns-nav-link` rows, table headers, chips). Sorting the
  deliberate from the drifted is a design review, not a mechanical fix. **Audit
  only. Recommend in the doc. Do not convert.**
- The `variant="ghost"` (93) vs `variant="outline"` (84) split. Whether the right
  affordance was chosen at each site is a taste question for the operator.
- `plans/199-*` territory: the layout of the AI summary row.
- Any behavior change. Nothing in this plan may alter what a button *does*.

## Git workflow

- Branch: `fix/ai-button-icon-consistency` off the current `main`.
- Before branching, run `git status`. If there is uncommitted work in the tree
  that you did not create, **STOP and report** — do not stash it (per `.agentrules`).
- **Commit Phase A and Phase B separately** — the audit doc must be reviewable
  without the code churn. Example messages, matching `git log`'s conventional style:
  - Phase A: `docs(design): button + icon consistency audit @ 36d25f50`
  - Phase B: `fix(ui): icon sizes into DESIGN.md band; h-9 buttons use size="lg"`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Phase A — audit (no UI changes)

#### Step A1: Re-run the census at HEAD

Run each and record the output verbatim — these numbers go in the doc:

```bash
# Icon size distribution
grep -rhoE "size=\{[0-9]+\}" src/routes/*.tsx src/components/*.tsx | sort | uniq -c | sort -rn

# Below-band icons (the Phase B item 1 worklist)
grep -rnE "size=\{1[012]\}" src/routes/*.tsx src/components/*.tsx

# Hand-rolled h-9 buttons (the Phase B item 2 worklist)
grep -rn '<Button[^>]*h-9' src/routes/*.tsx src/components/*.tsx

# Button size + variant usage
grep -rhoE '<Button[^>]*size="[a-z-]+"' src/routes/*.tsx src/components/*.tsx | grep -oE 'size="[a-z-]+"' | sort | uniq -c | sort -rn

# Raw <button> census (audit-only — informs the recommendation, not a fix)
grep -rc "<button" src/routes/*.tsx src/components/*.tsx | grep -v ":0" | sort -t: -k2 -rn
```

**Verify**: each command exits 0 and returns output. If your below-band count is
not 29 (or 28 with plan 199 landed), the tree drifted — note the delta and
proceed with **your** list, not this plan's.

#### Step A2: Write `docs/button-icon-audit.md`

Structure it as:

1. **Method + commit** — the census commands and the SHA they ran at, so anyone
   can reproduce this in one paste. This is the part that makes future drift
   detectable; do not skip it.
2. **Icon scale** — the distribution table, which values are in/out of
   `DESIGN.md` §7's bands, and the 29-instance worklist.
3. **Button usage** — size and variant distributions; the 6 `h-9` overrides.
4. **`DESIGN.md` is stale** — the `xl` / `destructive-outline` discrepancy from
   "Current state" above, stated as fact with `file:line` evidence.
5. **Raw `<button>` inventory** — counts per file, and for the top 3 files a
   one-line judgment on whether each cluster looks deliberate (bespoke nav/chip/
   table-header affordances) or drifted (re-implementing `<Button>` by hand).
   **Judgment stated as a recommendation, no code changed.**
6. **Open questions for the operator** — everything you found that needs taste,
   each with your recommendation and the trade-off in 2–3 sentences. Candidates:
   should `DESIGN.md` narrow §7 from a 13–16 band to a single default of 14 with
   named exceptions? Is the ghost/outline split intentional? Should the raw
   `<button>` clusters be converted?

**Verify**: `test -f docs/button-icon-audit.md && wc -l docs/button-icon-audit.md`
→ file exists. **Verify**: `git status --short` → only `docs/button-icon-audit.md`
is new; no `src/` file modified yet.

#### Step A3: Add the icon-scale clarification to `DESIGN.md` §7

The band 13–16 is what allows four values to coexist. Do **not** change the band
(that is the operator's call, raised in the doc's open questions). Add **one
line** under the existing 慣例 list making the de-facto default explicit and
naming the floor, since both are already true of the code:

```
- 預設用 `size={14}`（全庫最常用）；13/15/16 保留給既有的緊湊或強調情境。
  低於 13 不符合本節規範——`size={10–12}` 一律視為 drift（見 `docs/button-icon-audit.md`）。
```

**Verify**: `git diff --stat DESIGN.md` → exactly 1 file, ~2 lines added.

#### Step A4: Correct the stale Button API row in `DESIGN.md`

Line 256's Button row lists `xl` and `destructive-outline`, which
`src/components/ui/button.tsx` does not implement. Correct the row to match the
component exactly:

- sizes: `xs` / `sm` / `default` / `lg` / `icon` / `icon-xs` / `icon-sm` / `icon-lg`
- variants: `default` / `outline` / `secondary` / `ghost` / `destructive` / `link`

**Verify**: `grep -n "destructive-outline\|size: .*xl" DESIGN.md` → no matches on
the Button row.

**Verify**: `npx tsc --noEmit` → exit 0 (nothing in `src/` changed yet — this
confirms your baseline is clean before Phase B).

#### Step A5: **GATE — stop here and report**

Phase A is a complete, shippable unit. Report to whoever dispatched you:

- the census numbers,
- the audit doc path,
- your open questions with recommendations,
- an explicit statement that Phase B will change exactly N icon sizes and 6
  Button size props, and nothing else.

**If a reviewer dispatched you and told you to run straight through, proceed to
Phase B.** Otherwise, wait. Do not start Phase B to "save a round trip."

### Phase B — mechanical fixes only

#### Step B1: Raise the 29 below-band icons to `size={14}`

For **each** line in the Phase B item 1 table, change `size={10}` / `size={11}` /
`size={12}` → `size={14}`.

Rules that are not negotiable:

- **Edit each instance individually.** Do **not** run a global
  `sed`/`replace_all` on `size={12}` → `size={14}`. `size=` is a prop on
  non-Phosphor components too (`BookDot` is the proof) and a blind replace will
  silently corrupt them.
- **Skip `src/components/BookSwitcher.tsx:64`** (`<BookDot size={11} />`) — exempt.
  Line 75's `<CaretUpDown size={11} />` in the same file **is** in scope.
- Before each edit, confirm the component being sized is imported from
  `@phosphor-icons/react` in that file. If it is not, **skip it and record it in
  the audit doc as a second exemption.**
- Change nothing else on those lines — not `weight`, not `color`, not `style`.

**Verify**: `grep -rnE "size=\{1[012]\}" src/routes/*.tsx src/components/*.tsx`
→ only `src/components/BookSwitcher.tsx:64` (`BookDot`) plus any additional
non-Phosphor exemptions you recorded. Nothing else.

**Verify**: `npx tsc --noEmit` → exit 0.

#### Step B2: Replace the 6 `h-9` overrides with `size="lg"`

For each of the 6 lines in the Phase B item 2 table: remove `h-9` and `sm:h-9`
from `className`, add `size="lg"`. Keep every other class.

- `CashFlowRoute.tsx:1461` → `<Button variant="outline" size="lg" className="whitespace-nowrap">`
- `CashFlowRoute.tsx:1498` → `<Button variant="outline" size="lg" className="whitespace-nowrap" onClick={...}>`
- `CashFlowRoute.tsx:1501` → `<Button variant="outline" size="lg" className="whitespace-nowrap" onClick={openInvoiceCreate}>`
- `CashFlowRoute.tsx:1507` → `<Button size="lg" className="whitespace-nowrap" onClick={...}>`
- `DashboardRoute.tsx:1055` → `<Button variant="outline" size="lg" className="flex-1 sm:flex-none shrink-0" onClick={refreshMarket} ...>`
- `DashboardRoute.tsx:1060` → `<Button variant="outline" size="lg" className="flex-1 sm:flex-none shrink-0" />`

`size="lg"` is `h-9 gap-1.5 px-2.5` — so this also *adds* `gap-1.5 px-2.5`, which
the hand-rolled versions were inheriting from `size="default"`'s identical
`gap-1.5 px-2.5`. Net visual change should be **zero**. If it is not zero, that
is a finding — report it, do not paper over it with a compensating class.

**Verify**: `grep -rn '<Button[^>]*h-9' src/routes/*.tsx src/components/*.tsx`
→ no matches.

**Verify**: `npx tsc --noEmit` → exit 0. (`size="lg"` is a valid variant — if TS
rejects it, the component drifted: STOP.)

#### Step B3: Full gate run

**Verify**: `npm run lint` → exit 0, 0 errors.
**Verify**: `npm test` → all pass at the baseline count.
**Verify**: `npm run build` → exit 0.
**Verify**: `git status --short` → only in-scope files.

#### Step B4: Append the outcome to the audit doc

Add a short "已修正 (Phase B)" section: what changed, the before/after census
numbers, and what was deliberately left alone with the one-line reason (the
`size={18}` band, in-band 13/15, raw `<button>` conversions, `BookDot`).

## Test plan

**No new automated tests.** Say so explicitly in your report:

- Icon `size` and Button `size` are visual props. jsdom computes no layout, so
  a vitest assertion on rendered size cannot fail and would be a fake test.
- Asserting on class strings (`expect(btn.className).toContain("h-9")`) tests
  the CVA library, not this repo's behavior, and would need updating every time
  a class changes — negative value.

The real gate is that **existing coverage does not move**: `npm test` must pass
at exactly the baseline count you recorded. Both numbers go in your report.

Real verification is visual and belongs to the operator — see below.

## Done criteria

Machine-checkable. ALL must hold:

**Phase A:**
- [ ] `docs/button-icon-audit.md` exists and contains: the census commands, the SHA they ran at, the icon distribution table, the below-band worklist, the Button size/variant distribution, the raw-`<button>` inventory, the `DESIGN.md`-stale finding, and an operator open-questions section
- [ ] `DESIGN.md` §7 contains the `size={14}` default + sub-13 floor line
- [ ] `grep -n "destructive-outline" DESIGN.md` returns no match on the Button row
- [ ] `git diff --stat 36d25f50..HEAD -- src/components/ui/button.tsx` is empty

**Phase B:**
- [ ] `grep -rnE "size=\{1[012]\}" src/routes/*.tsx src/components/*.tsx` returns only `BookSwitcher.tsx:64` (`BookDot`) plus any recorded non-Phosphor exemptions
- [ ] `grep -rn '<Button[^>]*h-9' src/routes/*.tsx src/components/*.tsx` returns no matches
- [ ] `git diff 36d25f50..HEAD --stat -- src/` touches only the 14 in-scope files
- [ ] No `size={13}`, `size={15}`, `size={16}`, or `size={18}` instance was changed: `git diff -- src/ | grep '^[-+].*size={1[3568]}'` shows no *removals* of those values
- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run lint` exits 0 with 0 errors
- [ ] `npm test` exits 0 at the baseline count
- [ ] `npm run build` exits 0
- [ ] `plans/README.md` status row updated

**Operator verification (not yours — request it in your report):** run
`npm run dev` and look at the touched surfaces — 記帳 (invoice/create toolbar,
the ± chips, category carets), 總覽 (更新行情 / 版面 / the metric picker), 投資
(the sort carets at `InvestmentsRoute.tsx:1966-1968`), 帳戶, 目標, recurring
tabs, the category drawer, and a toast. Confirm the raised icons read as
intentional rather than merely bigger — the 10px and 11px carets in particular
were sized to sit inside tight rows, and 14 may crowd them. **If any look wrong,
that is a real finding: report it rather than reverting silently.**

## STOP conditions

Stop and report back (do not improvise) if:

- Your Step A1 census materially disagrees with this plan's numbers (a below-band
  count outside 27–30, say). The tree drifted; the worklist needs re-deriving and
  the operator should see the new numbers first.
- `src/components/ui/button.tsx` does not implement `size="lg"` as `h-9`, or the
  size/variant lists differ from "Current state". The whole Phase B item 2
  rationale rests on `lg === h-9`.
- Any Phase B icon line's surrounding JSX doesn't match the census excerpt.
- Raising an icon to 14 requires *any* compensating change — a padding tweak, a
  gap change, a wrapper — to avoid breaking its row. That means the small size
  was **load-bearing**, not drift. Leave that instance alone, record it in the
  audit doc as a candidate `DESIGN.md` exception, and tell the operator.
- You find yourself wanting to change a file not in the Scope list, convert a raw
  `<button>`, normalize in-band 13/15 values, or add the `xl` size. All four are
  explicitly out of scope; wanting them is the signal to report, not to proceed.
- `npm test` was already failing before your change (record the baseline first).

## Maintenance notes

For the human/agent who owns this code after the change lands:

- **`docs/button-icon-audit.md` is the artifact that matters, not the diff.** Its
  census commands are re-runnable in one paste; re-run them before a release to
  see drift as a number. If the doc rots, this plan bought nothing lasting.
- **This plan enforced `DESIGN.md`; it did not tighten it.** The band is still
  13–16, so 13/14/15/16 will all keep appearing and drift will recur slowly. The
  operator's answer to the "narrow §7 to a single default?" open question decides
  whether that's acceptable. If the answer is yes, an ESLint rule on the
  `@phosphor-icons/react` `size` prop is the enforcement mechanism worth building
  — a lint rule prevents drift; a one-time sweep only deletes it.
- **The raw `<button>` inventory is the real remaining debt** (22 in
  `CashFlowRoute.tsx` alone). It was deliberately not touched here because
  separating bespoke-by-design from drifted needs design judgment. That is the
  natural follow-up plan once the operator answers the open questions.
- A reviewer should scrutinize: that no global find-replace was used on `size={N}`
  (check `BookDot` at `BookSwitcher.tsx:64` is still 11), that `ui/button.tsx` is
  untouched, and that no in-band icon was "normalized" as a bonus.
- Deferred out of this plan, all named above: the ESLint rule, the raw-`<button>`
  conversion, the ghost/outline affordance review, the §7 band decision, and the
  `size={18}` list/card band verification.
