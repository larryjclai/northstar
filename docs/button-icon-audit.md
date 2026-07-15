# Button & icon consistency audit

> Companion to `plans/200-button-icon-consistency-audit.md`. This doc is the
> artifact that matters — the census commands below are re-runnable in one
> paste, so future drift shows up as a number, not a feeling.
>
> **⚠ Read §8 before trusting §2–§7.** Those sections count the Phosphor
> `size={N}` **prop**. Inside `<Button>` and `<Badge>` that prop is **inert** —
> component CSS (`[&_svg:not([class*='size-'])]:size-*`) governs the rendered
> size instead. §8 proves this from the Phosphor source and the compiled CSS,
> and quantifies it: of the 31 icons Phase B raised, **21 changed real
> rendered pixels and 10 were source-only**. The prop census is still the
> right lens for *source consistency*; it is not a reliable proxy for what
> the user sees.

## 1. Method + commit

This audit was executed on top of `36d25f50` (`chore: bump version to
0.1.0-alpha.62`), stacked on two already-landed branches
(`fix/ai-bookswitcher-popover-z`, `fix/ai-dashboard-summary-layout`). The
merge commit that is the actual baseline for every diff/line-number claim in
this doc is **`aacc6cf46aa9ea468cda010fa9c7642ebbacfe6c`**. Both stacked
branches touch files this plan also touches (`BookSwitcher.tsx`,
`DashboardRoute.tsx`), which is why some line numbers here differ slightly
from the original plan text (e.g. `DashboardRoute.tsx`'s below-band icons
shifted from lines 1106/1149 to 1112/1155; the `h-9` buttons shifted from
1055/1060 to 1045/1050). Content matched at every shifted location; nothing
was found unexpectedly.

Reproduce this census with:

```bash
# Icon size distribution
grep -rhoE "size=\{[0-9]+\}" src/routes/*.tsx src/components/*.tsx | sort | uniq -c | sort -rn

# Below-band icons (size 10/11/12)
grep -rnE "size=\{1[012]\}" src/routes/*.tsx src/components/*.tsx

# Hand-rolled h-9 buttons
grep -rn '<Button[^>]*h-9' src/routes/*.tsx src/components/*.tsx

# Button size + variant usage (raw string match — see §3 caveat on Badge overlap)
grep -rhoE '<Button[^>]*size="[a-z-]+"' src/routes/*.tsx src/components/*.tsx | grep -oE 'size="[a-z-]+"' | sort | uniq -c | sort -rn
grep -rhoE 'variant="[a-z]+"' src/routes/*.tsx src/components/*.tsx | sort | uniq -c | sort -rn

# Raw <button> census
grep -rc "<button" src/routes/*.tsx src/components/*.tsx | grep -v ":0" | sort -t: -k2 -rn
```

## 2. Icon scale

Full distribution of `size={N}` across `src/routes/*.tsx` + `src/components/*.tsx`,
taken **before** Phase B's fixes (i.e. at the merge-commit baseline):

| `size={N}` | count | `DESIGN.md` §7 verdict |
|---|---|---|
| 14 | 137 | in band (13–16) — de-facto default |
| 16 | 60 | in band |
| 13 | 28 | in band |
| 15 | 22 | in band |
| **12** | **17** | below band |
| 24 | 13 | list/card band (18–26) |
| 18 | 13 | list/card band (18–26) — plausible, not individually re-verified per instance |
| **11** | **12** | below band (includes 1 exempt `BookDot` non-Phosphor use) |
| 20 | 10 | list/card band |
| 26 | 8 | list/card band |
| 22 | 7 | list/card band |
| 21 | 7 | list/card band |
| **10** | **3** | below band |
| 34, 52, 36, 32, 30, 23 | 1–2 each | large decorative/hero contexts, out of §7's scope entirely (not a UI icon size question) |

Note the plan's original table only listed values 10–18; the fuller
distribution above surfaces additional in-band-or-larger sizes (20/21/22/23/
24/26/30/32/34/36/52) that exist in the codebase but were not part of the
plan's below-band worklist and were not touched.

**Below-band worklist** — every line matched by `size=\{1[012]\}`, before fix.
28 lines matched (some lines contain two icons, both below band), for **31
individual Phosphor icon instances** requiring a size bump, plus 1 exempt
non-Phosphor use:

```
src/routes/AccountsRoute.tsx:779            <Check size={12}
src/routes/CategoriesRoute.tsx:280           <X size={10}
src/routes/CashFlowRoute.tsx:1546            <X size={11}
src/routes/CashFlowRoute.tsx:1688            <X size={10}
src/routes/CashFlowRoute.tsx:1808            <CaretDown size={12} / <CaretRight size={12}   (2 icons, 1 line)
src/routes/CashFlowRoute.tsx:2344            <CaretDown size={11} / <CaretRight size={11}   (2 icons, 1 line)
src/routes/CashFlowRoute.tsx:3250            <Plus size={12}
src/routes/CashFlowRoute.tsx:3279            <Plus size={12}
src/routes/CashFlowRoute.tsx:3898            <Sparkle size={12}
src/routes/GoalsRoute.tsx:218                <Star size={12} / <Target size={12}           (2 icons, 1 line)
src/routes/HoldingDetailRoute.tsx:463        <ArrowUp size={11}
src/routes/DashboardRoute.tsx:1112           <ChartBar size={11}
src/routes/DashboardRoute.tsx:1155           <ArrowUp size={11} / <ArrowDown size={11}      (2 icons, 1 line)
src/routes/InvestmentsRoute.tsx:1928         <CaretRight size={12}
src/routes/InvestmentsRoute.tsx:1966-1968    <ArrowUp / <ArrowDown / <ArrowsDownUp size={11} (3 icons, 3 lines — table sort caret)
src/routes/RecurringRulesTab.tsx:134         <Plus size={12}
src/routes/RecurringRulesTab.tsx:249         <CalendarBlank size={12}
src/routes/RecurringRulesTab.tsx:539         <Trash size={12}
src/routes/RecurringInvestmentsTab.tsx:177   <CalendarBlank size={12}
src/components/CategoryManagementDrawer.tsx:238  <PencilSimple size={12}
src/components/CategoryManagementDrawer.tsx:240  <Trash size={12}
src/components/BookSwitcher.tsx:75           <CaretUpDown size={11}
src/components/LedgerDateControl.tsx:111     <CaretDown size={12}
src/components/TransactionDetailPanel.tsx:180  <ArrowsClockwise size={10}
src/components/Toast.tsx:451                 <Copy size={12}
```

**Exempt, not touched**: `src/components/BookSwitcher.tsx:64`
`<BookDot color={dotColor} size={11} />`. `BookDot` is a local coloured
`<span>` dot defined in the same file (not a Phosphor icon); `DESIGN.md` §7
does not govern it. Confirmed by checking the file's imports — `BookDot` is
not among the names imported from `@phosphor-icons/react`.

No second exemption was found: every other below-band line's icon component
(`Check`, `X`, `CaretDown`, `CaretRight`, `Plus`, `Sparkle`, `Star`, `Target`,
`ArrowUp`, `ArrowDown`, `ArrowsDownUp`, `ChartBar`, `CalendarBlank`, `Trash`,
`PencilSimple`, `CaretUpDown`, `ArrowsClockwise`, `Copy`) was verified
imported from `@phosphor-icons/react` in its own file before being edited.

`DashboardRoute.tsx`'s `<ArrowsClockwise size={12}>` (plan 199's fix) was
already at `size={14}` by the time this plan's branch was created — confirmed
absent from the below-band grep at HEAD before any Phase B edit here, per
plan 199 already landing.

## 3. Button usage

Size and variant distribution across the same file set, **before** Phase B:

Button `size=` prop (raw grep, all matches on any `<Button ...>` tag,
same-line only):

| size | count |
|---|---|
| `icon-sm` | 33 |
| `sm` | 22 |
| `xs` | 13 |
| `icon-xs` | 6 |
| `icon` | 6 |

`variant="..."` (raw grep, **any** element in these files, not filtered to
`<Button>`):

| variant string | count |
|---|---|
| `ghost` | 93 |
| `outline` | 84 |
| `center` | 10 |
| `drawer` | 8 |
| `sheet` | 4 |
| `secondary` | 5 |
| `warning` | 2 |
| `success` | 1 |
| `error` | 1 |

**Confirmed**: `center` / `drawer` / `sheet` belong to `ModalShellVariant`
(`src/components/ModalShell.tsx`), not `Button`. `warning` / `success` /
`error` belong to `Badge` (spot-checked at `DashboardRoute.tsx:1385/1685`,
`InvestmentsRoute.tsx:1163/1166`). None of these six strings are Button
variants and none were counted as Button drift.

**Caveat found during this audit that the plan did not anticipate**: `ghost`,
`outline`, and `secondary` are **also** valid `Badge` variant strings, and
`Badge` appears throughout these same files (e.g.
`<Badge variant="outline" className="rounded-full">{a.currency}</Badge>` at
`AccountsRoute.tsx:434`). A precise scan that parses each `<Button ...>` tag's
own boundary (handling multi-line JSX and `render={<Button .../>}`) rather
than grepping the bare string found:

| variant (Button tags only) | count |
|---|---|
| `ghost` | 93 |
| *(default)* | 70 |
| `outline` | 63 |

i.e. **21 of the raw-grep's 84 "outline" hits and all 5 "secondary" hits are
actually on `<Badge>`, not `<Button>`**. `ghost`'s count happens to match
exactly (93 = 93) — no Badge instances used `variant="ghost"` in this file
set. Anyone re-running just the plan's original one-line grep will
over-count `Button` `outline` usage by ~25%. Recorded here so the next
person doesn't re-derive this the hard way.

Total `<Button>` tags found by the precise parse: 226 (134 default size, 38
`icon-sm`, 25 `sm`, 16 `xs`, 7 `icon-xs`, 6 `icon`, 0 `lg` — before Phase B's
6 new `size="lg"` uses).

### The 6 hand-rolled `h-9` Buttons (before fix)

```
src/routes/CashFlowRoute.tsx:1461   <Button variant="outline" className="h-9 sm:h-9 whitespace-nowrap">
src/routes/CashFlowRoute.tsx:1498   <Button variant="outline" className="h-9 sm:h-9 whitespace-nowrap" onClick={() => setClientManagerOpen...
src/routes/CashFlowRoute.tsx:1501   <Button variant="outline" className="h-9 sm:h-9 whitespace-nowrap" onClick={openInvoiceCreate}>
src/routes/CashFlowRoute.tsx:1507   <Button className="h-9 sm:h-9 whitespace-nowrap" onClick={() => openCreate("expense")}>
src/routes/DashboardRoute.tsx:1045  <Button variant="outline" className="h-9 flex-1 sm:flex-none shrink-0 sm:h-9" onClick={refreshMarket}...
src/routes/DashboardRoute.tsx:1050  <PopoverTrigger render={<Button variant="outline" className="h-9 flex-1 sm:flex-none shrink-0 sm:h-9" />}>
```

(Line numbers shifted from the plan's 1461/1498/1501/1507 in `CashFlowRoute`
— unchanged there — and 1055/1060 → 1045/1050 in `DashboardRoute.tsx`, due to
the stacked `fix/ai-dashboard-summary-layout` branch. Content matched
exactly.) `h-9 sm:h-9` was confirmed redundant on its face (same height at
both breakpoints) in every instance.

`src/components/ui/button.tsx`'s `size="lg"` variant is exactly `h-9 gap-1.5
px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2` —
confirmed at line 27 before any edit. This is the rationale for Phase B item
2: these six buttons should have used `size="lg"` instead of hand-rolling the
same height.

## 4. `DESIGN.md` is stale

`DESIGN.md:256` (before this plan's fix) read:

```
| `Button` | variant: `default` / `outline` / `ghost` / `secondary` / `link` / `destructive` / `destructive-outline`；size: `xs` / `sm` / `default` / `lg` / `xl` / `icon-*`；`render={<Link …/>}` 可變身路由連結 |
```

`src/components/ui/button.tsx` (confirmed lines 10–34) implements:

- variants: `default` / `outline` / `secondary` / `ghost` / `destructive` /
  `link` — **no `destructive-outline`**
- sizes: `default` / `xs` / `sm` / `lg` / `icon` / `icon-xs` / `icon-sm` /
  `icon-lg` — **no `xl`**

The doc listed two things the component does not have (`xl` size,
`destructive-outline` variant). This plan corrected the doc row to match the
component (see §7 of this document for the exact diff); it did **not** add
`xl` or `destructive-outline` to the component, since that would be a design
decision, not a doc fix.

## 5. Raw `<button>` inventory

```
src/routes/CashFlowRoute.tsx:22
src/components/ModalShell.test.tsx:17   ← test file, not production code (see caveat below)
src/routes/InvestmentsRoute.tsx:11
src/components/AppShell.tsx:10
src/routes/RecurringRulesTab.tsx:7
src/components/QuickAdd.tsx:6
src/components/LedgerDateControl.tsx:6
src/routes/InvestmentsAnalyticsTab.tsx:5
src/routes/HoldingEditModal.tsx:5
src/components/Toast.tsx:5
src/routes/CategoryDetailRoute.tsx:4
src/routes/CategoriesRoute.tsx:4
src/components/BookSwitcher.tsx:4
src/routes/MerchantsTab.tsx:3
src/routes/MerchantDetailRoute.tsx:3
src/routes/GoalsRoute.tsx:3
src/routes/CategoriesTab.tsx:3
src/components/OnboardingOverlay.tsx:3
src/routes/DashboardRoute.tsx:2
... (14 more files with 1 each)
```

**Methodology caveat**: `grep -rc "<button" src/components/*.tsx` also
matches `*.test.tsx` files (they're included by the `*.tsx` glob). 17 of the
counted hits are in `ModalShell.test.tsx`, i.e. test assertions/fixtures, not
production UI debt. Excluding that, the real top-3 production files are:

1. **`CashFlowRoute.tsx` (22)** — spot-checked (lines 1485, 1520, 1539, 1550,
   1726, 1802, 2201, 2258): filter-clear text links (`text-xs muted
   cursor-pointer`), inline tab strips with computed active-state inline
   styles, and expand/collapse row headers. These read as **deliberate**
   bespoke affordances (tab strip, inline text action) rather than
   `<Button>` standing in disguise — converting them would mean re-deriving
   the exact active/inactive inline-style logic as CVA variants, which is a
   design decision.
2. **`InvestmentsRoute.tsx` (11)** — spot-checked (lines 457, 491, 703, 806,
   1516, 1726): same tab-strip pattern as `CashFlowRoute.tsx` (`<button
   key={t.id} onClick={...} className="text-sm" style={{...}}>`). Same
   judgment: **deliberate**, a tab strip is not a `Button`.
3. **`AppShell.tsx` (10)** — spot-checked (lines 194–241): sidebar
   `ns-nav-link` rows for collapse/expand and the search trigger
   (`className="ns-nav-link ..."`, `CaretRight`/`CaretLeft`/`MagnifyingGlass`
   icons). This is the exact "deliberately bespoke" pattern the underlying
   plan called out by name (`ns-nav-link` rows) — **deliberate**, not drift.

No raw `<button>` was converted to `<Button>` in this plan — that is
explicitly out of scope (see plan §Scope, out of scope). This inventory is a
recommendation input for the operator, not a to-do list executed here.

## 6. Open questions for the operator

These require taste, not mechanics. Each has a recommendation and a
trade-off; the operator decides.

1. **Should `DESIGN.md` §7 narrow from a 13–16 band to a single default of
   14 with named exceptions?**
   Recommendation: leave the band as-is for now, but consider an ESLint rule
   (see plan's Maintenance notes) if drift recurs — a lint rule prevents
   drift going forward; narrowing the band by fiat doesn't stop new code
   from picking 13 or 16 again next month, it just makes today's 13/15/16
   instances "wrong" retroactively for no functional gain. Trade-off:
   narrowing the doc costs nothing today but invites a future PR to
   "normalize" all remaining 13/15/16 instances, which is real churn for a
   3px visual difference nobody has complained about.

2. **Is the `ghost` (93) vs `outline` (63, corrected count — see §3 caveat)
   Button-variant split intentional?**
   Recommendation: probably yes and not worth auditing exhaustively — `ghost`
   generally reads as "icon-only / secondary in-context action" and
   `outline` as "explicit secondary action with a visible boundary" across
   the spot-checks done for this audit, which is a coherent pattern. But
   this was **not** verified site-by-site (93 + 63 = 156 sites is out of
   scope for a mechanical-fix plan); a full affordance review is real design
   work, not a grep task.

3. **Should the raw `<button>` clusters (CashFlowRoute.tsx tab strip,
   InvestmentsRoute.tsx tab strip, AppShell.tsx nav rows, plus everything
   else in §5) be converted to `<Button>`?**
   Recommendation: no, for the tab strips and nav rows specifically — they
   have bespoke active/inactive inline-style logic that doesn't map cleanly
   onto `<Button>`'s variant system without inventing new variants first.
   The smaller single-instance files are more likely candidates for
   conversion (lower cost, less bespoke styling to preserve) and would make
   a reasonable, separately-scoped follow-up plan. Trade-off: converting the
   tab strips would be the highest-value consistency win (they're the most
   visible repeated pattern) but also the highest-risk (active-state styling
   easy to regress) — needs a design pass on what a "Button tab" variant
   should look like, not a mechanical swap.

4. **Should `size={18}` (13 instances, list/card band 18–26) be
   individually re-verified as genuinely list/card icons, or downgraded?**
   Not done in this audit beyond noting the count — plan explicitly scoped
   this out of Phase B and asked only that Phase A "verify each is actually
   a list/card icon." This audit did not individually inspect all 13; that
   remains open. Recommendation: a follow-up spot-check, not urgent (they're
   in-band regardless of context per §7's literal band language).

5. **Is `DESIGN.md`'s `xl` size / `destructive-outline` variant something
   the design system should eventually *gain*, rather than the doc simply
   being corrected to match today's component?**
   Recommendation: leave as a backlog item, not a doc-typo fix. If a real
   use case for an extra-large button or an outlined-destructive affordance
   shows up in a future feature, add it then with an actual call site driving
   the visual design, rather than speculatively building it now because a
   stale doc implied it should exist.

6. **Should an ESLint rule enforce the icon `size` band on
   `@phosphor-icons/react` imports going forward?**
   Recommendation: yes, if the operator wants this problem to actually stay
   fixed — a one-time sweep (this plan) only deletes the drift that exists
   today; nothing stops a future PR from introducing `size={11}` again. A
   lint rule (scoped to imports from `@phosphor-icons/react` specifically, to
   avoid flagging `BookDot`-style local components) is the actual
   enforcement mechanism. Deferred here because writing and testing a custom
   ESLint rule is a different shape of work than this plan's mechanical
   fixes.

7. **Should the two icon-sizing systems (§8) be reconciled — and which one
   wins?** The repo sizes icons two ways: the Phosphor `size` prop
   (`DESIGN.md` §7) and `button.tsx`/`badge.tsx`'s
   `[&_svg:not([class*='size-'])]:size-*` CSS, which silently overrides the
   prop for every icon inside a `Button` or `Badge` (10 of the 31 icons this
   plan touched). Three options:
   - **(a) CSS wins — drop the inert props.** Delete `size={N}` from Phosphor
     icons inside `Button`/`Badge` and let the component's `size` variant be
     the single control. *Recommendation: this one.* It matches how the COSS
     components are designed to work, it makes the source honest, and it's
     the option where icon size can't drift out of step with button size —
     they're derived from one variant. Trade-off: a large mechanical diff
     touching many call sites, and it removes the escape hatch for a
     genuinely one-off icon size (though the `[class*='size-']` opt-out
     already exists for that: passing `className="size-5"` beats the rule).
   - **(b) Prop wins — remove the components' svg CSS rules.** Trade-off:
     this is a **behavior change across the whole app**, not a cleanup —
     every icon currently relying on the CSS default silently resizes.
     Strongly recommend against without a full visual pass.
   - **(c) Keep both, document the split.** Cheapest; §8 plus the amended
     §7 line already does most of it. Trade-off: leaves the trap armed for
     the next person, and leaves `DESIGN.md` §7's 13px floor contradicted by
     the design system's own `Badge`/`Button xs` (12px).

   Whichever is chosen, **the ESLint rule in question 6 should be scoped
   accordingly** — under (a) it should flag `size` props on Phosphor icons
   *inside* Button/Badge as useless, which is a different rule than "enforce
   the 13–16 band". Do not act on this without an operator decision.

## 7. 已修正 (Phase B)

**What changed**: all 31 below-band Phosphor icon `size=` props (across the
28 worklist lines in §2) were raised individually from `size={10}` /
`size={11}` / `size={12}` to `size={14}`. The 6 hand-rolled `<Button
className="h-9 ...">` overrides (§3) had `h-9`/`sm:h-9` removed from
`className` and `size="lg"` added, which is `h-9 gap-1.5 px-2.5` — the exact
same height, and the same `gap`/`px` the hand-rolled versions were already
inheriting from `size="default"`. Net visual change: zero by construction
(same computed classes), not independently confirmed by the executor in a
browser — see Operator verification below.

**Before/after icon-size census** (full distribution,
`src/routes/*.tsx` + `src/components/*.tsx`):

| `size={N}` | before | after |
|---|---|---|
| 14 | 137 | 168 (+31) |
| 12 | 17 | 0 |
| 11 | 12 | 1 (`BookDot`, exempt) |
| 10 | 3 | 0 |
| 13 / 15 / 16 / 18 / 20-52 | unchanged | unchanged |

`grep -rnE "size=\{1[012]\}" src/routes/*.tsx src/components/*.tsx` now
returns only `src/components/BookSwitcher.tsx:64` (`BookDot`).
`grep -rn '<Button[^>]*h-9' src/routes/*.tsx src/components/*.tsx` now
returns no matches.

**Deliberately left alone, with reason**:

- All `size={18}` icons (13 instances) — plausible list/card band (18–26)
  per `DESIGN.md` §7; not individually re-verified (§6 open question 4).
- All `size={13}` and `size={15}` icons (28 + 22 instances) — already in
  band; normalizing to a single value was explicitly out of scope (a taste
  question, §6 open question 1).
- All raw `<button>` elements (§5) — converting bespoke tab-strip/nav-row
  patterns to `<Button>` needs a design pass, not a mechanical swap (§6 open
  question 3).
- `src/components/BookSwitcher.tsx:64` `<BookDot size={11} />` — not a
  Phosphor icon (`DESIGN.md` §7 doesn't govern it); confirmed via its
  file-local definition and absence from the file's
  `@phosphor-icons/react` import list.
- `src/components/ui/button.tsx` — untouched; no `xl` size or
  `destructive-outline` variant added, per plan scope (§6 open question 5).

**Verification run** (see main report for full output):
`npx tsc --noEmit` exit 0 both after Step B1 and after Step B2;
`npm test` 121 files / 1252 tests passing (unchanged from baseline);
`npm run lint` 0 errors / 762 warnings (unchanged from baseline);
`npm run build` exit 0.

**Not done — belongs to the operator**: a `npm run dev` visual pass over
記帳 (invoice/create toolbar, ± chips, category carets), 總覽 (更新行情 /
版面 / metric picker), 投資 (sort carets at `InvestmentsRoute.tsx:1966-1968`),
帳戶, 目標, recurring tabs, the category drawer, and a toast — to confirm the
raised 10px/11px/12px icons read as intentional rather than merely bigger in
their original tight rows. This executor did not run the dev server or take
screenshots; the plan explicitly assigns this verification to the operator.

## 8. 重要更正：`size` prop 在 `Button` / `Badge` 內是無效的

**This section invalidates the census methodology's core premise for a subset
of the icons above.** Everything in §1–§7 counts the `size={N}` **prop** and
treats it as governing rendered icon size. **Inside `<Button>` and `<Badge>`,
it does not.** The prop is inert there; component CSS governs. Verified from
first principles below — this was not in the plan and the plan's author
missed it too.

### The evidence

1. **Phosphor renders `size` as a presentation attribute, not a class.**
   `node_modules/@phosphor-icons/react/dist/lib/IconBase.es.js` is a
   `forwardRef` that does exactly:

   ```js
   createElement("svg", {
     ref: a, xmlns: "http://www.w3.org/2000/svg",
     width: t != null ? t : l,      // t = size prop, l = context size
     height: t != null ? t : l,
     fill: r != null ? r : d,
     viewBox: "0 0 256 256", ...
   })
   ```

   So `<Check size={14} />` emits `<svg width="14" height="14" ...>`. No
   class is added.

2. **Presentation attributes lose to any CSS declaration.** Per CSS spec they
   are author-origin rules of specificity zero — any real selector beats them.

3. **`src/components/ui/button.tsx` sets svg dimensions in CSS.** Base cva
   (line 7) carries `[&_svg:not([class*='size-'])]:size-4`; per-size
   overrides are `size-3` (`xs`, `icon-xs`, lines 25/30) and `size-3.5`
   (`sm`, line 26). `default`, `lg`, `icon`, `icon-sm`, `icon-lg` define **no**
   svg rule, so they inherit the base `size-4`.

4. **`src/components/coss/badge.tsx` does the same** (line 10):
   `[&_svg:not([class*='size-'])]:size-3.5 sm:[&_svg:not([class*='size-'])]:size-3`.

5. **Confirmed in the compiled output**, not just the source. `dist/assets/
   index-*.css` contains, verbatim:

   ```css
   .[&_svg:not([class*='size-'])]:size-4 svg:not([class*=size-]){
     width:calc(var(--spacing) * 4); height:calc(var(--spacing) * 4)
   }
   ```

   with `--spacing:.25rem`. A Phosphor svg carries no `size-` class, so
   `:not([class*=size-])` matches, and this class-selector rule overrides the
   `width`/`height` attributes.

Resolved pixel values (`--spacing` = .25rem = 4px):

| context | CSS rule | rendered icon size |
|---|---|---|
| `Button` `default` / `lg` / `icon` / `icon-sm` / `icon-lg` | base `size-4` | **16px** |
| `Button size="sm"` | `size-3.5` | **14px** |
| `Button size="xs"` / `size="icon-xs"` | `size-3` | **12px** |
| `Badge` (any variant/size) | `size-3.5`, `sm:size-3` | **14px** below 640px, **12px** at ≥640px |
| anywhere else (raw `<button>`, `<div>`, `<span>`) | none | the `size` prop |

The reviewer's worked example checks out: `<Button variant="ghost"
size="icon-sm"><PencilSimple size={12} /></Button>` in
`CategoryManagementDrawer.tsx` rendered at **16px** before this plan and
renders at **16px** after it. The prop never mattered.

### What Phase B actually bought — exact count

Of the **31** icon instances raised in Phase B, classified by whether an
ancestor `<Button>`/`<Badge>` governs them. (Note the cva rule is a
*descendant* selector — `[&_svg]` matches at any depth — so ancestors were
checked, not just immediate parents. Where a `<Button>`/`<Badge>` appeared
near a free-standing icon it was confirmed to be a closed sibling, not an
open ancestor.)

| | count | effect of the Phase B change |
|---|---|---|
| **Free-standing** (raw `<button>`, `<div>`, `<span>`, `PopoverTrigger render={<button/>}`) | **21** | **Real.** Icon visibly grew to 14px. |
| **Inside `<Button>`/`<Badge>`** | **10** | **Inert.** Source-only; rendered pixels unchanged. |

Per-file breakdown:

| file | free-standing (real) | in Button/Badge (inert) | total |
|---|---|---|---|
| `src/routes/CashFlowRoute.tsx` | 8 | 1 (`:1688` `X`, Button `xs`) | 9 |
| `src/routes/InvestmentsRoute.tsx` | 3 (`:1966-68` sort carets) | 1 (`:1928` `CaretRight`, Button `sm`) | 4 |
| `src/routes/DashboardRoute.tsx` | 1 (`:1112` `ChartBar`) | 2 (`:1155` MoM Badge arrows) | 3 |
| `src/routes/RecurringRulesTab.tsx` | 1 (`:249`) | 2 (`:134`, `:539`) | 3 |
| `src/routes/GoalsRoute.tsx` | 2 (`:218`) | 0 | 2 |
| `src/components/CategoryManagementDrawer.tsx` | 0 | 2 (`:238`, `:240`, Button `icon-sm`) | 2 |
| `src/routes/AccountsRoute.tsx` | 1 (`:779`) | 0 | 1 |
| `src/routes/CategoriesRoute.tsx` | 0 | 1 (`:280` `X`, Button default) | 1 |
| `src/routes/HoldingDetailRoute.tsx` | 0 | 1 (`:463` `ArrowUp`, Badge) | 1 |
| `src/routes/RecurringInvestmentsTab.tsx` | 1 (`:177`) | 0 | 1 |
| `src/components/BookSwitcher.tsx` | 1 (`:75` `CaretUpDown`) | 0 | 1 |
| `src/components/LedgerDateControl.tsx` | 1 (`:111`) | 0 | 1 |
| `src/components/TransactionDetailPanel.tsx` | 1 (`:180`) | 0 | 1 |
| `src/components/Toast.tsx` | 1 (`:451`) | 0 | 1 |
| **總計** | **21** | **10** | **31** |

A nuance worth recording for the 10 inert sites: raising the prop to 14
sometimes made the source *agree* with rendered reality and sometimes made it
disagree in a new way. `InvestmentsRoute.tsx:1928` (Button `sm` → CSS 14px)
now tells the truth. `CategoriesRoute.tsx:280` (Button default → CSS 16px)
and `CashFlowRoute.tsx:1688` (Button `xs` → CSS 12px) still don't — they just
misstate a different number than before. In no case did rendered pixels move.

### The real finding: two unreconciled icon-sizing systems

The repo has **two** icon-sizing systems that do not know about each other:

1. **`DESIGN.md` §7's prop convention** — `size={13–16}` for UI icons,
   `size={18–26}` for list/card icons, expressed as a Phosphor `size` prop.
2. **The components' CSS rules** — `button.tsx` and `badge.tsx` pin every
   descendant svg to `size-4`/`size-3.5`/`size-3` (16/14/12px) via
   `[&_svg:not([class*='size-'])]`, keyed off the *component's* `size`
   variant, silently overriding system 1.

**`DESIGN.md` §7 documents only system 1** and does not mention system 2
exists. That is why this drift was invisible: a reader following §7 writes
`size={14}` inside a `<Button size="icon-sm">`, believes they complied, and
ships a 16px icon. Both this plan's census and the plan's author read the
props and concluded things about pixels that were not true for ~a third of
the instances.

Note the two systems are not in conflict everywhere — `Button size="sm"`'s
14px and the §7 default of 14 happen to agree. They collide at
`Button` `default`/`lg`/`icon*` (16px, above §7's stated default) and at
`Badge`/`Button xs` (12px, *below* §7's 13px floor — i.e. **the design
system's own components render icons at a size `DESIGN.md` §7 declares to be
drift**). Reconciling them is §6 open question 7.

**No code was changed in response to this finding.** Phase B's diff stands as
committed: 21 real fixes, 10 source-consistency-only changes, zero
regressions. The corrective action is documentation plus an operator
decision.
