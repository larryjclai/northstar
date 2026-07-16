# Plan 213: Finish `ModalCloseButton` — the 2 sites plan 202's census missed

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update this plan's status row in `plans/README.md` — unless a
> reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat cfd08051..HEAD -- src/features/goals/GoalEditorSheet.tsx src/routes/settings/ConnectSection.tsx src/components/ModalCloseButton.tsx`
> If any changed, compare the "Current state" excerpts against live code; on a
> mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S (two mechanical swaps + one docstring correction)
- **Risk**: LOW (the component is merged and proven at 13 sites)
- **Depends on**: plan 202 (**merged** @ `cfd08051` — supplies `ModalCloseButton`)
- **Category**: bug (iOS tap target) / tech-debt
- **Planned at**: commit `cfd08051`, 2026-07-16
- **Source**: found by plan 202's executor, verified by the advisor. **This is the advisor's census error, not an executor's**: plan 202 used non-recursive globs (`src/routes/*.tsx`, `src/components/*.tsx`) which never reach `src/features/goals/` or `src/routes/settings/`.

## Why this matters

Plan 202 extracted `<ModalCloseButton />` and replaced 13 hand-built modal close
buttons with it. Its stated purpose: kill the raw `<button>` close buttons that
bypass COSS Button's 44pt `pointer-coarse` hit-area expansion — **the only close
buttons in the app that are genuinely hard to tap on iOS.**

Two sites were missed because the plan's census globs weren't recursive. One of
them matters:

**`src/features/goals/GoalEditorSheet.tsx` now holds the LAST raw close button
in the app.** Verified at `cfd08051`:
`grep -rln "grid size-8 place-items-center" src/ --include="*.tsx"` returns only
that file. It is byte-identical in shape to the two raw buttons 202 did fix, and
it carries the same defect: no 44pt coarse-pointer expansion. Leaving it means
202's whole reason for existing is unfinished, on a real touch-target bug, in a
sheet the user reaches from 目標 → edit a goal.

The second is cosmetic-but-inconsistent: `ConnectSection.tsx` already uses a
COSS Button but lacks the `title` tooltip every other close button now has.

## Current state

### Site 1 — `src/features/goals/GoalEditorSheet.tsx:145-152` (the raw one)

Inside a `ModalShell` render-prop that supplies `dismiss` (see line ~142,
`{(dismiss) => (<>`):

```tsx
          <button
            type="button"
            onClick={dismiss}
            className="grid size-8 place-items-center rounded-md outline-none transition hover:opacity-70"
            aria-label="關閉"
          >
            <X size={18} />
          </button>
```

`<X ` appears **exactly once** in this file (verified) — so its `X` import
becomes unused after the swap and must be removed.

### Site 2 — `src/routes/settings/ConnectSection.tsx:1218`

```tsx
          <Button variant="ghost" size="icon-sm" aria-label="關閉" onClick={dismiss}><X size={16} /></Button>
```

Also inside a render-prop supplying `dismiss`. `<X ` appears **exactly once**
here too → its `X` import also becomes unused.

⚠ **`Button` may still be used elsewhere in `ConnectSection.tsx`** — it is a
large settings file. **Grep before touching that import.**

### The component to use — `src/components/ModalCloseButton.tsx` (merged, do not modify except the docstring)

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
      <X />
    </Button>
  );
}
```

Note it deliberately passes **no `size` prop** to `<X />`: per `DESIGN.md` §7,
the Phosphor `size` prop is **inert** inside a `Button` (the component's CSS
governs — source `coss/button.tsx`). Don't add one.

### The one site that must STAY hand-built — `src/components/ui/dialog.tsx:67`

A recursive census at `cfd08051` finds exactly 3 `aria-label="關閉"` outside
`ModalCloseButton.tsx`: the two above, plus `ui/dialog.tsx:67`. **That third one
is out of scope and must not be touched.** It is the vendored base-ui Dialog
primitive's own internal close affordance, inside the quarantined `ui/` layer
(see `src/components/ui/README.md` — app code is forbidden from importing that
layer; it exists for calendar/command/dialog internals). It is not a hand-built
app close button and it isn't ours to unify.

### Conventions

- Import style: match how each file's siblings import from `src/components/`
  (relative paths — e.g. `../../components/ModalCloseButton` from
  `src/features/goals/`, `../../components/ModalCloseButton` from
  `src/routes/settings/`). **Verify the correct depth per file rather than
  copying this line.**
- Conventional commits. Example from `git log`:
  `refactor(ui): 統一 modal 關閉鈕為共用 ModalCloseButton`

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `npm install` | exit 0 (revert `package-lock.json` churn — known stale lockfile — do not commit it) |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Tests | `npm test` | **123 files / 1318 tests** at `cfd08051` — unchanged by this plan |
| Lint | `npm run lint` | 0 errors (762 warnings pre-existing) |
| Build | `npm run build` | exit 0 |
| Dev | `npm run dev` | Vite dev server |

## Scope

**In scope**:
- `src/features/goals/GoalEditorSheet.tsx` — the close button only
- `src/routes/settings/ConnectSection.tsx` — the close button only
- `src/components/ModalCloseButton.tsx` — **the docstring's count only**

**Out of scope** (do NOT touch):
- **`src/components/ui/dialog.tsx`** — see above. Leaving it is correct.
- `src/components/coss/button.tsx`, `src/components/ModalShell.tsx` — untouched by 202, untouched here.
- **Any other button in the two touched files.** `GoalEditorSheet` and
  `ConnectSection` contain plenty of other controls (save, delete, pairing
  actions). Every hunk must be a close button.
- The 13 sites plan 202 already converted — done, reviewed, merged.
- `ModalCloseButton`'s implementation (props, variant, size, the `<X />` with no
  size prop). Only its docstring count changes.

## Git workflow

- Branch: `fix/ai-modal-close-missed-sites` off `main` (`cfd08051`).
- `git status` first; uncommitted work you did not create → STOP, never stash.
  Files under `plans/` are expected and not yours.
- Commit: `fix(ui): ModalCloseButton 補上 GoalEditorSheet 與 ConnectSection（202 普查漏網）`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Confirm the census before editing

```bash
grep -rn 'aria-label="關閉"' src/ --include="*.tsx" | grep -v ModalCloseButton
grep -rln "grid size-8 place-items-center" src/ --include="*.tsx"
```

Expect exactly 3 from the first (GoalEditorSheet, ui/dialog.tsx, ConnectSection)
and exactly 1 from the second (GoalEditorSheet — the last raw one).

**If the counts differ, STOP and report** — someone changed things since this
plan was written.

**Verify**: report both outputs.

### Step 2: Swap `GoalEditorSheet.tsx` (the one that matters)

Replace the whole raw `<button>…</button>` block (lines ~145-152) with:

```tsx
          <ModalCloseButton onClick={dismiss} />
```

`dismiss` is the render-prop parameter from the enclosing `ModalShell`
(`{(dismiss) => (<>` at ~line 142) — **read the file and confirm the actual
name** rather than trusting this plan.

Add the `ModalCloseButton` import; remove the now-unused `X` import (verified:
`<X ` appears once in this file, so it becomes unused — but re-grep to be sure).

**Verify**: `npx tsc --noEmit` → exit 0 (an unused import would surface in lint,
a wrong handler name in tsc).

### Step 3: Swap `ConnectSection.tsx`

Replace the `<Button …><X size={16} /></Button>` at ~line 1218 with:

```tsx
          <ModalCloseButton onClick={dismiss} />
```

Same: confirm the real handler name. Add the import. Remove the `X` import
(appears once — re-grep). **Grep for other `<Button` usage in this file before
touching the `Button` import — it is a large settings file and `Button` is very
likely still used.**

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 4: Correct the component's docstring count

`src/components/ModalCloseButton.tsx`'s docstring says "six treatments across
**14** sites" — that was plan 202's census, which we now know undercounted
(non-recursive globs). Make it accurate: it now replaces **15** hand-built close
buttons app-wide. Add a line noting `ui/dialog.tsx`'s primitive close button is
deliberately outside this component's remit (vendored/quarantined layer).

**Keep** the six-treatments history and the "do not hand-build another"
instruction — those are the load-bearing parts. Change nothing but the prose.

**Verify**: `git diff -- src/components/ModalCloseButton.tsx` shows only comment
lines changed — **no change to the JSX or the props**.

### Step 5: Gates

- `grep -rn 'aria-label="關閉"' src/ --include="*.tsx" | grep -v ModalCloseButton` → **only `src/components/ui/dialog.tsx`**
- `grep -rln "grid size-8 place-items-center" src/ --include="*.tsx"` → **empty** ← *the criterion that matters most: the last raw close button is gone*
- `npx tsc --noEmit` → 0
- `npm run lint` → 0 errors, warnings not risen
- `npm test` → 1318, unchanged
- `npm run build` → 0
- `git status --short` → only the 3 in-scope files
- `git diff cfd08051..HEAD -- src/components/ui/dialog.tsx src/components/coss/button.tsx src/components/ModalShell.tsx` → **empty**

### Step 6: Live check (cheap only)

⚠ **Worktree dev-server hazard (burned several executors on this repo)**: the
shared preview server on port 5173 serves the operator's MAIN checkout, not your
worktree — a check against it would validate the OLD code. Start your own
(`npm run dev -- --port 5271 --strictPort`) and verify its cwd is YOUR worktree
via `lsof -a -d cwd -p <pid>` before trusting anything. Kill it after.

Open 目標 → edit a goal → confirm the close button is a 28px box (desktop),
hovering shows the 「關閉」 tooltip, and clicking closes the sheet.

`ConnectSection`'s pairing sheet needs sync configured — **if staging it is
expensive, skip it and say so.** Static verification (diff shape identical to
the 13 proven swaps + gates green) is sufficient there.

Report what you checked and what you couldn't.

## Test plan

**No new automated test.** Same reasoning plan 202 recorded: these are JSX
substitutions whose correctness is carried by `tsc` (the handler must typecheck
at each site) and by the census greps going to their expected values. The thing
worth testing — the 44pt coarse-pointer hit area — needs a real touch-pointer
environment; jsdom has no pointer media, so an assertion would pass regardless
and prove nothing.

Gate: `npm test` stays at exactly **1318**.

## Done criteria

ALL must hold:

- [ ] `grep -rln "grid size-8 place-items-center" src/ --include="*.tsx"` → **empty**
- [ ] `grep -rn 'aria-label="關閉"' src/ --include="*.tsx" | grep -v ModalCloseButton` → only `ui/dialog.tsx`
- [ ] `grep -c "ModalCloseButton" src/features/goals/GoalEditorSheet.tsx` → 2 (import + usage)
- [ ] `grep -c "ModalCloseButton" src/routes/settings/ConnectSection.tsx` → 2
- [ ] `git diff cfd08051..HEAD -- src/components/ui/dialog.tsx src/components/coss/button.tsx src/components/ModalShell.tsx` → empty
- [ ] `ModalCloseButton.tsx`'s diff is comment-only
- [ ] `npx tsc --noEmit` 0; `npm run lint` 0 errors; `npm test` 1318; `npm run build` 0
- [ ] Only the 3 in-scope files modified
- [ ] `plans/README.md` status row updated

## STOP conditions

- Step 1's counts don't match (3 and 1).
- Either site's close handler turns out to do more than close (read it first —
  plan 202 found `CashFlowRoute`'s `requestClose` was a documented two-phase
  close; if you find similar, the swap is still fine since you only change the
  *button*, but report it).
- Removing an `X` import breaks a file still using `X` elsewhere (re-grep; the
  plan verified once each but verify again).
- You're tempted to touch `ui/dialog.tsx`, or any non-close button in the two
  files.
- `npm test` was already failing at your base.

## Maintenance notes

- **After this, `ModalCloseButton` is the only way to close a modal in app
  code.** The single legitimate exception is `ui/dialog.tsx`'s vendored
  primitive. A 16th hand-built close button is a review failure — the docstring
  says so.
- **The lesson worth carrying**: plan 202's census used non-recursive globs
  (`src/routes/*.tsx`) and silently missed two subdirectories. **Any future
  repo-wide census should use `grep -rn … src/` (recursive), not per-directory
  globs.** This is the second census-methodology error of this batch (the first:
  reading `ui/button.tsx` instead of `coss/button.tsx`), and both were caught by
  executors measuring reality rather than trusting the plan.
- The natural follow-up 202 already named: wire `ModalCloseButton` into
  `ModalShell` behind a `showClose` prop so new modals get it for free. Still
  deferred — every modal hand-rolls its own `<header>`, so hoisting the button
  means hoisting the header. Worth doing once those headers are uniform.
- A reviewer should scrutinize: that `ui/dialog.tsx` is untouched, that only
  close buttons changed in two busy files, and that the `X`/`Button` import
  removals didn't strip a still-used import.
