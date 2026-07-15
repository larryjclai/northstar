# Plan 203: Make the component the single source of truth for icon size — rewrite DESIGN.md §7 and delete the inert props

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update this plan's status row in `plans/README.md` — unless a
> reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 087a9b2e..HEAD -- DESIGN.md src/routes src/components`

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW (deletes props that are provably inert — zero rendered-pixel change)
- **Depends on**: **plan 200 must be merged first** (see below)
- **Category**: tech-debt
- **Planned at**: commit `087a9b2e`, 2026-07-15
- **Operator decision**: 2026-07-15 — "改文件：承認元件是對的" (option A of 3)

### Hard prerequisite: plan 200 must be merged

Plan 200's branch `fix/ai-button-icon-consistency` (3 commits, ending `1f171585`)
contains the audit doc (`docs/button-icon-audit.md`) this plan amends and the
icon-size sweep whose inert third this plan deletes.

**Check first**: `git log --oneline main | grep -c "button-icon"` or
`test -f docs/button-icon-audit.md`.

**If `docs/button-icon-audit.md` does not exist on your branch's base, STOP** —
200 has not landed and this plan has nothing to amend.

## Why this matters

The app has **two icon-sizing systems that contradict each other**, and the design
doc only knows about one of them.

**System 1 (documented)**: `DESIGN.md` §7 — Phosphor `size={N}` prop, band 13–16
for general UI icons, 18–26 for list/card icons.

**System 2 (undocumented, and the one that actually wins)**: `coss/button.tsx` and
`coss/badge.tsx` carry `[&_svg:not([class*='size-'])]:size-*` rules. Phosphor
renders `createElement("svg", { width: size, height: size })` — **presentation
attributes**, which lose to any CSS declaration. So inside `<Button>`/`<Badge>` the
`size` prop is **inert**; the component's `size` variant governs:

| Context | Rendered icon size |
|---|---|
| `Button` `default` / `lg` / `icon` / `icon-sm` / `icon-lg` | 16px (base `size-4`, no per-size rule) |
| `Button` `sm` | 14px (`size-3.5`) |
| `Button` `xs` / `icon-xs` | 12px (`size-3`) |
| `Badge` | 14px below 640px, 12px at ≥640px |
| Free-standing (raw `<button>`, plain JSX) | whatever the prop says |

**The contradiction**: Button `xs` and Badge render icons at **12px** — a size
§7 (as amended by plan 200) explicitly calls drift. **The design system's own
components violate its own design doc.** That is not a documentation gap; it means
either the band is wrong or the components are wrong.

**Operator decided (2026-07-15): the components are right.** They are what actually
renders. So §7 gets rewritten to describe reality, and the inert props — which are
decoration that misleads readers into thinking they control something — get deleted.

Plan 200 already added a §7 exception note and documented the mechanism in
`docs/button-icon-audit.md` §8. This plan finishes the job: **§7 becomes correct
rather than caveated, and the lie is removed from the code.**

## Current state

### The 10 inert props — verified in plan 200's audit (`docs/button-icon-audit.md` §8)

Plan 200 raised 31 icons from 10/11/12 → 14. **21 were free-standing (real
change); 10 were inside Button/Badge (inert — source-only, pixels never moved).**
Those 10 are this plan's deletion list:

| File | Site | Container | Actually renders |
|---|---|---|---|
| `src/routes/CashFlowRoute.tsx` | `X` (was `:1688`) | Button `xs` | 12px |
| `src/routes/InvestmentsRoute.tsx` | `CaretRight` (was `:1928`) | Button `sm` | 14px |
| `src/routes/DashboardRoute.tsx` | MoM Badge arrows ×2 (was `:1155`) | Badge | 12px @≥640 |
| `src/components/CategoryManagementDrawer.tsx` | `PencilSimple` `:238`, `Trash` `:240` | Button `icon-sm` | 16px |
| `src/routes/CategoriesRoute.tsx` | `X` (was `:280`) | Button default | 16px |
| `src/routes/HoldingDetailRoute.tsx` | `ArrowUp` (was `:463`) | Badge | 12px @≥640 |
| `src/routes/RecurringRulesTab.tsx` | 2 sites | Button | per variant |

⚠ **Line numbers have drifted** — plan 200 changed these files, and plans 198/199
are now merged into `main`. **Find each by content and container, not by line
number.** The audit doc's §8 table is the authoritative list; read it.

⚠ Plan 200's executor recorded a nuance worth knowing: raising those 10 to 14
made the source *agree* with reality in some cases (`InvestmentsRoute` `CaretRight`
in a Button `sm` → genuinely 14px) and *misstate a different wrong number* in
others (`CategoriesRoute` `X` renders 16px; `CashFlowRoute` `X` renders 12px).
**Do not assume the current prop values are correct** — you are deleting them, so
it does not matter, but do not "fix" them instead.

### The exemption — do NOT touch

`src/components/BookSwitcher.tsx` — `<BookDot color={dotColor} size={11} />`.
`BookDot` is a **local coloured `<span>`**, not a Phosphor icon (see its definition
at the top of that file). `size=` is its own prop. It is not governed by §7 and
must stay `11`.

### DESIGN.md §7 today (as amended by plan 200)

Plan 200 added two things to §7: a `size={14}` default + sub-13 floor line, and a
Button/Badge exception note. The exception note reads (approximately — read the
live file):

```
- **例外：`Button` / `Badge` 內的圖示不吃 `size` prop。** 兩者的 CSS
  （`[&_svg:not([class*='size-'])]:size-*`）會蓋掉 Phosphor 的 width/height，實際大小由元件的
  `size` variant 決定（Button 預設/`lg`/`icon*` = 16px、`sm` = 14px、`xs` = 12px；Badge = 14px，
  ≥640px 為 12px）。要調整請改元件的 `size`，不是圖示的 `size`（見 `docs/button-icon-audit.md` §8）。
```

This is currently a **caveat bolted onto a rule that is wrong**. The rule says
10–12 is drift; the components render 12. This plan restructures §7 so the two
systems are stated as two scopes, not a rule plus an apology.

### Conventions

- `DESIGN.md` is zh-TW. Match the surrounding register exactly.
- Conventional commits. Example: `docs(readme): document 帳本 (Books) + 公司帳 invoicing features`

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `npm install` | exit 0 |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Tests | `npm test` | 121 files / 1252 tests |
| Lint | `npm run lint` | exit 0, **0 errors** |
| Build | `npm run build` | exit 0 |

Revert any `package-lock.json` churn from `npm install`; do not commit it.

## Scope

**In scope**:
- `DESIGN.md` — §7 only
- `docs/button-icon-audit.md` — record the resolution
- The **10 inert prop sites** listed above (delete the `size` prop only)

**Out of scope** (do NOT touch):
- `src/components/coss/button.tsx`, `src/components/coss/badge.tsx` — **do not remove
  the `[&_svg]:size-*` rules.** That was option (b) and the operator **rejected** it:
  it is an app-wide visual change requiring full visual verification, not a cleanup.
- **The 21 free-standing icons plan 200 raised to 14** — they are real and correct.
- **Any other `size={N}` inside a Button/Badge that plan 200 did not touch.** There
  are many (every `<Button><Icon size={14}/></Button>` in the app is equally inert).
  This plan deletes only the **10 that plan 200 changed**, because those are the
  ones the audit doc enumerates and the ones whose churn this plan is reversing.
  A full sweep of every inert prop app-wide is a follow-up — see Maintenance notes.
- `BookSwitcher.tsx`'s `<BookDot size={11} />`.
- The `xl` / `destructive-outline` staleness in DESIGN.md:256 — plan 200 already fixed it.

## Git workflow

- Branch: `docs/ai-icon-size-source-of-truth` off `main` (after 200 is merged).
- `git status` first; uncommitted work you did not create → **STOP**, never stash.
  Files under `plans/` are expected and not yours.
- Commit **twice**: (1) the DESIGN.md + audit doc rewrite, (2) the prop deletions.
  Keeps the doc decision reviewable apart from the code churn.
  - `docs(design): §7 — 元件的 size variant 是圖示尺寸的唯一事實來源`
  - `refactor(ui): 刪除 Button/Badge 內無效的 Phosphor size prop`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Confirm the prerequisite and read the evidence

```bash
test -f docs/button-icon-audit.md && echo "200 landed" || echo "STOP: 200 not merged"
```

Then **read `docs/button-icon-audit.md` §8 in full**. It contains the verified
mechanism (Phosphor source → compiled CSS) and the authoritative per-file inert
list. This plan's tables are a summary; §8 is the source.

**Verify**: report the exact inert count §8 states (expected: 10).

### Step 2: Rewrite DESIGN.md §7

Restructure the 慣例 list so the two systems are **two scopes**, not a rule and an
exception. Target shape (zh-TW, match the file's register — this is the intent, not
a script to paste verbatim):

- **Free-standing 圖示**（raw `<button>`、純 JSX、清單/卡片）：`size` prop 說了算。
  一般 UI `size={14}`（預設，全庫最常用），13/15/16 保留給既有的緊湊或強調情境；
  列表/卡片 `size={18–26}`。
- **`Button` / `Badge` 內的圖示**：`size` prop **無效**，由元件的 `size` variant 決定
  （Button 預設/`lg`/`icon*` = 16px、`sm` = 14px、`xs`/`icon-xs` = 12px；Badge = 14px，
  ≥640px 為 12px）。**不要在這裡寫 `size` prop** — 要改尺寸請改元件的 `size` variant。
  逃生門：給 svg 任何 `size-*` class，`:not()` 就不再命中。
- 機制與驗證見 `docs/button-icon-audit.md` §8。

**Delete** plan 200's sub-13 floor line ("低於 13 不符合本節規範——`size={10–12}` 一律
視為 drift"). It is now **false**: Button `xs` and Badge legitimately render 12px.
That line is exactly the contradiction this plan resolves. Its replacement is the
scope split above.

**Verify**: `grep -n "低於 13\|一律視為 drift" DESIGN.md` → no matches.
**Verify**: `grep -n "size-4\|size variant\|無效" DESIGN.md` → the new §7 text is present.

### Step 3: Record the resolution in the audit doc

Append to `docs/button-icon-audit.md`: open question 7 is **answered — option (a),
CSS wins**, by operator decision 2026-07-15. State that §7 was restructured and
the 10 inert props deleted. Update the ⚠ forward-reference at the top of the doc
if it now misdescribes the state.

**Verify**: `git diff --stat docs/button-icon-audit.md DESIGN.md` → 2 files.
**Verify**: `npx tsc --noEmit` → exit 0 (no `src/` change yet — confirms a clean base).

**Commit here** (commit 1 of 2).

### Step 4: Delete the 10 inert props

For each site in §8's list: delete **only** the `size={N}` prop from the Phosphor
icon. Leave `weight`, `color`, `style`, `className` untouched.

```tsx
// before
<Button variant="ghost" size="icon-sm" aria-label="重新命名"><PencilSimple size={14} /></Button>
// after
<Button variant="ghost" size="icon-sm" aria-label="重新命名"><PencilSimple /></Button>
```

Rules:
- **Edit each individually. No `sed`, no `replace_all`.** `size=` is a prop on
  non-Phosphor components too — `BookDot` is the proof.
- Before each deletion, confirm (a) the icon is imported from `@phosphor-icons/react`
  in that file, and (b) its nearest ancestor really is a `<Button>` or `<Badge>`.
  The cva rule is a **descendant** selector (`[&_svg]` matches at any depth), so
  check ancestors, not just the immediate parent. A closed sibling `<Button/>` on a
  nearby line does **not** make an icon inert — plan 200's executor hit this exact
  trap and documented it.
- **If any of the 10 turns out NOT to be inside a Button/Badge**, do not delete its
  prop — report it as a correction to §8.

**Verify**: `npx tsc --noEmit` → exit 0.
**Verify**: `grep -rn "size={11}" src/components/BookSwitcher.tsx` → still 1 match (BookDot untouched).
**Verify**: `git diff --stat` for `src/` → ~10 lines changed across ~6 files.

### Step 5: Gates + visual no-op check

- `npm run lint` → exit 0, 0 errors
- `npm test` → 1252
- `npm run build` → exit 0
- `git status --short` → only in-scope files

**Visual**: `npm run dev`. This change must be a **pixel-level no-op**. Check the
分類管理 drawer (rename/delete icons), the 總覽 MoM badge arrow, and 記帳's clear-filter
X. **If anything visibly changes size, STOP** — that means a prop was NOT inert and
§8's classification is wrong for that site.

Say plainly which surfaces you checked and which you could not reach.

**Commit here** (commit 2 of 2).

## Test plan

**No new automated test.** The change deletes props that provably do nothing —
there is no behavior to assert. jsdom computes no layout, so a size assertion
cannot fail either way.

The real gate is the **visual no-op** in Step 5 plus `npm test` staying at 1252.
Record both counts.

## Done criteria

ALL must hold:

- [ ] `grep -n "低於 13\|一律視為 drift" DESIGN.md` → no matches
- [ ] DESIGN.md §7 states the free-standing vs Button/Badge scope split
- [ ] `docs/button-icon-audit.md` records open question 7 as answered — option (a)
- [ ] All 10 inert `size` props deleted (§8's list)
- [ ] `grep -rn "size={11}" src/components/BookSwitcher.tsx` → 1 match (BookDot intact)
- [ ] `git diff 087a9b2e..HEAD -- src/components/coss/button.tsx src/components/coss/badge.tsx` → **empty**
- [ ] Exactly 2 commits: docs, then code
- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run lint` exits 0, 0 errors
- [ ] `npm test` exits 0 at 1252
- [ ] `npm run build` exits 0
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:
- `docs/button-icon-audit.md` doesn't exist (200 not merged).
- §8's inert count is not 10.
- Any of the 10 is not actually inside a Button/Badge.
- Deleting a prop **visibly changes** an icon's size (→ it was not inert; §8 is wrong).
- You are tempted to also delete inert props plan 200 did not touch. Out of scope — see Maintenance notes.
- You are tempted to remove the `[&_svg]:size-*` rules. That is option (b), **explicitly rejected** by the operator.
- `npm test` was already failing before you started.

## Maintenance notes

- **This plan deletes only the 10 props plan 200 churned — not every inert prop in
  the app.** There are many more (`<Button><Icon size={14}/></Button>` is inert
  everywhere). That full sweep is the natural follow-up, and it is now *safe* to do
  because §7 finally says what the rule is. Deliberately deferred: it would be a
  large diff with zero pixel change, and it should be done once, mechanically, with
  the ESLint rule below landing alongside it.
- **The durable fix is a lint rule**, not a sweep: forbid `size` on
  `@phosphor-icons/react` icons whose ancestor is `<Button>`/`<Badge>`. A sweep
  deletes today's drift; a rule prevents tomorrow's. Ancestor-aware lint rules are
  non-trivial in ESLint (JSX ancestry isn't scope), so scope that honestly before
  committing to it — a simpler heuristic (forbid `size` on any icon that is a direct
  JSX child of `<Button>`) catches most of it.
- **`docs/button-icon-audit.md` §8's census commands are re-runnable in one paste.**
  Re-run before a release to see drift as a number. If that doc rots, this plan
  bought a one-time cleanup and nothing lasting.
- A reviewer should scrutinize: that `coss/button.tsx` and `coss/badge.tsx` are
  untouched (the tempting "cleaner" fix the operator rejected), that `BookDot` is
  still `size={11}`, and that the visual no-op claim in Step 5 was actually checked
  rather than assumed.
