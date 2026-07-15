# Plan 202: Extract `<ModalCloseButton />` and replace every hand-built modal close button

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update this plan's status row in `plans/README.md` — unless a
> reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 087a9b2e..HEAD -- src/routes src/components`
> The census below was taken at `087a9b2e`. If these files changed, **re-run the
> census in Step 1 and use your own numbers** — see the plan-201 note below.

## Status

- **Priority**: P0
- **Effort**: M
- **Risk**: LOW (mechanical replacement; one intended behavior change — see Step 3)
- **Depends on**: **plans/201** (soft — see below)
- **Category**: tech-debt
- **Planned at**: commit `087a9b2e`, 2026-07-15
- **Source**: `$impeccable critique` of `src/routes` (2026-07-15, 22/40) — P0 #1

### The 201 dependency is soft — read this

Plan 201 deletes the duplicated 編輯持倉 modal in `InvestmentsRoute.tsx`, which
contains **one** of the close buttons below (`InvestmentsRoute.tsx:1730`).

- **If 201 has landed**: that site is already gone. Expect **13** sites, not 14.
- **If 201 has not landed**: all 14 exist. You may still proceed — replace all 14;
  201 will later delete one of your replacements along with its whole modal. No
  conflict, just a little wasted motion.

Either way is correct. **Do not wait for 201.** Just report which case you found.

## Why this matters

The modal close button is the single most-repeated control in this app, and the
single most-repeated inconsistency. Verified at `087a9b2e` — **six treatments
across 14 sites**:

| Treatment | Count | Sites |
|---|---|---|
| `<Button variant="ghost" size="icon">` + `X size={16}` | 5 | `AccountsRoute.tsx:629`, `AccountsRoute.tsx:766`, `InvestmentsAddSheet.tsx:492`, `CashFlowRoute.tsx:2948`, `ClientManager.tsx:87` |
| `<Button variant="ghost" size="icon-sm">` + `X size={16}` | 4 | `InvestmentImportWizard.tsx:210`, `ManualPriceImportWizard.tsx:118`, `RecurringRulesTab.tsx:380`, `RecurringInvestmentsTab.tsx:236` |
| `<Button variant="ghost" size="icon-sm">` + `X size={18}` | 1 | `CategoryManagementDrawer.tsx:130` |
| `<Button variant="ghost" size="icon-sm" className="p-1.5">` + `X size={16}` | 1 | `TransactionDetailPanel.tsx:118` |
| raw `<button className="grid size-8 place-items-center rounded-md outline-none transition hover:opacity-70">` + `X size={18}` | 2 | `HoldingEditModal.tsx:172`, `InvestmentsRoute.tsx:1726` |
| raw `<button style={{background:"none",border:"none",cursor:"pointer"}}>` + `X size={18}` | 1 | `AppShell.tsx:437` |

That is **three hit sizes** (32 / 28 / 32-raw), **three icon sizes** (16 / 18, plus
whatever the CSS resolves them to), and **three hover languages** (`bg-accent` from
COSS ghost / `opacity-70` / nothing at all).

Two consequences that are not cosmetic:

1. **The three raw `<button>`s forfeit the 44pt touch target.** `coss/button.tsx:12`
   carries `pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11`, which
   gives every COSS Button a 44pt hit area via an `::after` pseudo under
   `@media (pointer: coarse)`. Raw buttons bypass it entirely. On iOS these are
   the only close buttons that are genuinely hard to tap — `AppShell.tsx:437` is
   the worst: a bare `<X size={18}>` with no box at all, **in the mobile-only
   「更多」 sheet**, i.e. touch-only by construction.
2. **No close button anywhere has a tooltip.** Verified: 17 `aria-label="關閉"`,
   **0 `title="關閉"`**. Consistent — consistently missing.

Nobody chose any of this. Six authors each looked at the neighbouring line.

## Current state

### The component to model after

`src/components/coss/button.tsx` — the COSS `Button`. Its `ghost` variant and
`icon-sm` size are what the majority of sites already use, and its
`pointer-coarse` `::after` rule is the mechanism the raw buttons are missing.

### Where to put the new component

`src/components/` — alongside `ModalShell.tsx`, `SegmentedControl.tsx`,
`ActionButton.tsx`. Match the export style of a sibling (named export, no default).

### The one site with an intentional deviation to preserve

`src/components/TransactionDetailPanel.tsx:118-120` adds `className="p-1.5"`:

```tsx
          <Button variant="ghost" size="icon-sm" aria-label="關閉" onClick={dismiss} className="p-1.5">
            <X size={16} />
          </Button>
```

`p-1.5` on a fixed `size-7` box does nothing to the box — it only insets the
glyph. Treat it as drift and drop it, **but** if removing it visibly moves the
glyph, keep the site as-is and report it rather than fighting it.

### `AppShell.tsx:435-439` — the mobile 「更多」 sheet

```tsx
              <div className="flex items-center justify-between px-4 pt-3 pb-1">
                <span className="text-xs muted font-medium">更多</span>
                <button type="button" aria-label="關閉" onClick={dismiss} className="muted" style={{ background: "none", border: "none", cursor: "pointer" }}>
                  <X size={18} />
                </button>
              </div>
```

Note `cursor: "pointer"` here is **dead code** — `globals.css:603` is
`* { cursor: default !important; }` and an `!important` author rule outranks
inline style. Don't preserve it.

### Conventions to match

- `AGENTS.md` 樣式撰寫優先序: (1) COSS components; (2) `ns-*` / Tailwind utilities;
  (3) inline `style={{}}` **only for dynamic values**. This plan is an instance of
  rule (1) — a repeated pattern becoming a component.
- Conventional commits. Example from `git log`: `fix(investments): 總額 shows net cash flow incl. fee/tax`

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `npm install` | exit 0 (fresh worktree) |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Tests | `npm test` | 121 files / 1252 tests pass |
| Lint | `npm run lint` | exit 0, **0 errors** (762 warnings pre-existing) |
| Build | `npm run build` | exit 0 |
| Dev | `npm run dev` | Vite dev server |

If `npm install` rewrites `package-lock.json` (known stale lockfile), revert it:
`git checkout -- package-lock.json`. Do not commit it.

## Scope

**In scope**:
- `src/components/ModalCloseButton.tsx` (create)
- The 14 (or 13) call sites listed in the census table above — **and only their
  close buttons**

**Out of scope** (do NOT touch):
- `src/components/coss/button.tsx` — the primitive is correct; do not add a variant for this.
- `src/components/ModalShell.tsx` — **do not** wire the close button into ModalShell
  via a `showClose` prop in this plan. It is the obvious next move and it is
  deliberately deferred: every one of these 14 modals renders its own `<header>`
  with its own title/layout, so hoisting the button into ModalShell means also
  hoisting the header, which is a much larger redesign. Land the component first;
  the ModalShell integration is a follow-up once all 14 headers look identical.
- Any **other** button in the touched files — icon-only row actions, delete
  buttons, toolbar buttons. Those are plans 204 and beyond. Your diff must contain
  only close buttons.
- The hand-rolled delete buttons inside `HoldingEditModal.tsx:196-224` — plan 204.
- `title` vs `aria-label` on **non-close** icon buttons — separate finding.

## Git workflow

- Branch: `feat/ai-modal-close-button` off `main`.
- Check `git status` first. Uncommitted work you did not create → **STOP and report**;
  never stash (per `.agentrules`). Note: uncommitted files under `plans/` are
  expected and are not yours to touch.
- Commit: `refactor(ui): 統一 modal 關閉鈕為共用 ModalCloseButton`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Re-run the census

```bash
grep -rn 'aria-label="關閉"' src/routes/*.tsx src/components/*.tsx
grep -rn 'title="關閉"' src/
```

Expect **14** sites (or 13 if plan 201 landed — check whether
`src/routes/InvestmentsRoute.tsx` still contains a `ModalShell` with
`title="編輯持倉"`), and **0** `title="關閉"`.

**If your count is outside 12–15, STOP and report** — the plan's inventory is stale.

Also note: the raw grep for `aria-label="關閉"` returns **17** repo-wide; the extra
~3 are not X-icon modal close buttons (verify each). **Only replace controls that
are a modal/sheet/drawer close button rendering an `<X>` icon.** If you find an
`aria-label="關閉"` on something that is not that, leave it and list it.

**Verify**: report your counts and the 201 case you found.

### Step 2: Create `src/components/ModalCloseButton.tsx`

```tsx
import { X } from "@phosphor-icons/react";
import { Button } from "./coss/button";

/**
 * The one modal/sheet/drawer close button. Before this existed the app had six
 * treatments across 14 sites (3 hit sizes, 3 icon sizes, 3 hover languages) —
 * three of them raw <button>s that bypassed COSS Button's `pointer-coarse`
 * 44pt hit-area expansion, making them the only close buttons genuinely hard
 * to tap on iOS. Use this everywhere; do not hand-build another.
 */
export function ModalCloseButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="icon-sm" onClick={onClick} aria-label="關閉" title="關閉">
      <X size={16} />
    </Button>
  );
}
```

Confirm the `Button` import path matches how siblings in `src/components/` import
it — if they use `@/components/coss/button` or similar, match that instead.

`size="icon-sm"` (28px) is chosen because it is already the plurality (6 of 14).
`X size={16}`: note per DESIGN.md §7's Button/Badge exception, this prop is
**inert** inside a Button — `icon-sm` defines no svg rule so the base `size-4`
(16px) governs. The prop is written to match reality, not to control it. Plan 203
may delete it; that is expected and fine.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Replace all sites

For each site in the census: replace the whole close-button element with
`<ModalCloseButton onClick={dismiss} />` (or whatever the local handler is —
`dismiss`, `requestClose`, `onClose`, `() => setEditingAsset(null)`; **use the
existing handler, do not change behavior**).

Add the import to each file. Remove the now-unused `X` import **only if `X` is
unused elsewhere in that file** — several files use `X` for other things (clear-filter
chips, snapshot delete). Let `tsc`/lint decide; do not delete on suspicion.

**This is an intended behavior change**: every close button gains a `title`, so
they all now show a hover tooltip where none did before. That is the point.

Three sites need extra care:
- `HoldingEditModal.tsx:172-179` — raw `<button>` → gains the 44pt coarse hit area.
- `InvestmentsRoute.tsx:1726-1733` — same (skip if 201 landed).
- `AppShell.tsx:437` — raw bare button in the **mobile-only** 「更多」 sheet. This one
  matters most: it is touch-only by construction and currently has no box at all.

**Verify**: `grep -rn 'aria-label="關閉"' src/routes/*.tsx src/components/*.tsx` → only
`src/components/ModalCloseButton.tsx` (plus any non-close-button sites you
identified and deliberately left in Step 1 — list them).
**Verify**: `grep -c "ModalCloseButton" src/components/ModalCloseButton.tsx` → ≥1
**Verify**: `npx tsc --noEmit` → exit 0.

### Step 4: Gates

- `npm run lint` → exit 0, 0 errors. Warning count must not rise.
- `npm test` → 121 files / 1252 tests (baseline).
- `npm run build` → exit 0.
- `git status --short` → only `ModalCloseButton.tsx` (new) + the census files.
- `git diff --stat` → each touched route should be net-negative or near-neutral.

### Step 5: Visual check

`npm run dev`. Open at least: a centre modal (帳戶 → edit), the 記帳 entry drawer,
the transaction detail panel, the 分類 management drawer, and — **resize to mobile
width** — the AppShell 「更多」 sheet.

Confirm for each: the X sits where it did, hover shows the 「關閉」 tooltip, clicking
closes. **On mobile width, confirm the 「更多」 sheet's close button is now a
visible 28px control rather than a bare glyph.**

If you cannot reach a surface, say which and why. Do not claim checks you did not run.

## Test plan

**No new automated test.** Reasons, in order:
- No existing test covers any of these 14 close buttons — verify with
  `grep -rln "關閉" src/**/*.test.*` before asserting this; if one exists, it must pass.
- The change is a JSX substitution. Its correctness is carried by `tsc` (the handler
  prop must typecheck at every site) and by the census grep going to zero.
- The thing worth testing — the 44pt coarse hit area — needs a real touch-pointer
  environment. jsdom has no pointer media, so a vitest assertion would pass
  regardless and prove nothing.

Gate: `npm test` stays at exactly 1252. Record before/after.

## Done criteria

ALL must hold:

- [ ] `src/components/ModalCloseButton.tsx` exists and exports `ModalCloseButton`
- [ ] `grep -rn 'aria-label="關閉"' src/routes/*.tsx src/components/*.tsx` returns only `ModalCloseButton.tsx` + any documented non-close exceptions
- [ ] `grep -rn 'grid size-8 place-items-center' src/routes/` returns no matches (both raw close buttons gone)
- [ ] `git diff 087a9b2e..HEAD -- src/components/coss/button.tsx src/components/ModalShell.tsx` is **empty**
- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run lint` exits 0, 0 errors
- [ ] `npm test` exits 0 at 1252
- [ ] `npm run build` exits 0
- [ ] Only in-scope files modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:
- Step 1's count is outside 12–15.
- Any site's close handler does something beyond closing (e.g. `requestClose` at
  `CashFlowRoute.tsx:2948` may run a dirty-check). **Read each handler before
  swapping it.** If a handler has side effects, the swap is still fine — you are
  only changing the button, not the handler — but if the *button* carries logic
  beyond `onClick`, report it.
- Removing `p-1.5` at `TransactionDetailPanel.tsx:118` visibly moves the glyph.
- You find yourself needing to change `coss/button.tsx` or `ModalShell.tsx`.
- A site's close button is inside a `<header>` whose layout breaks when the box
  size changes from 32 → 28 (the 5 `size="icon"` sites shrink by 4px).
- `npm test` was already failing before you started (baseline 1252).

## Maintenance notes

- **`ModalCloseButton` is now the only correct way to close a modal.** If a 15th
  modal appears with a hand-built X, that is a review failure — the component's
  docstring says so.
- **The obvious follow-up is wiring it into `ModalShell`** via a `showClose` prop so
  new modals get it without asking. Deliberately out of scope here because all 14
  modals hand-roll their own `<header>`; hoisting the button means hoisting the
  header. Worth doing once these headers are uniform — which this plan is the
  first step toward.
- **`ns-btn-icon` is referenced at `CategoryManagementDrawer.tsx:166` but never
  defined in `globals.css`** — the ghost of this exact abstraction. Someone named
  it and never wrote it. Not this plan's job, but it explains the archaeology.
- A reviewer should scrutinize: that only close buttons changed (the touched files
  are full of other buttons begging to be fixed — plan 204 owns those), and that
  no `X` import was removed from a file still using `X` elsewhere.
