# Plan 198: Make the sidebar 帳本 (BookSwitcher) popover appear above the sidebar

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 36d25f50..HEAD -- src/components/BookSwitcher.tsx src/components/AppShell.tsx src/components/ui/popover.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `36d25f50`, 2026-07-15

## Why this matters

The 帳本 switcher in the sidebar — the control that sets `activeBookId`, which
every book-scoped route reads — **renders its dropdown behind the sidebar, so
clicking 總帳 appears to do nothing**. The popover opens correctly (state
flips, Base UI portals the content into `document.body`), but it is painted
underneath the sidebar and is therefore invisible and unclickable. This makes
the entire 帳本 feature (plans 188–194, shipped in alpha.61) unreachable from
its primary entry point. The fix is one prop; the value of this plan is in
fixing it *at the right layer* and leaving a comment so it does not regress.

## Current state

### The bug

Two facts combine:

1. **The desktop sidebar deliberately sits at `z-index: 1100`** — the highest
   layer in the app. `src/components/AppShell.tsx:159-178`:

```tsx
      <aside
        className="ns-sidebar hidden lg:flex lg:flex-col lg:sticky lg:top-0 lg:h-screen lg:self-start"
        style={{
          ...
          // The sidebar is position:sticky → setting a z-index makes it form its
          // own stacking context that sits ABOVE every fixed overlay backdrop
          // (TransactionDetailPanel 998/999, CashFlow modals 1000, drawers,
          // QuickAdd). This keeps the macOS-vibrancy sidebar from being greyed
          // out by a full-viewport `inset:0` scrim (052 follow-up; plan 063).
          zIndex: 1100,
```

2. **`PopoverContent` portals to `document.body` and positions at `z-50`.**
   `src/components/ui/popover.tsx:34-41`:

```tsx
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className={cn("isolate z-50", positionerClassName)}
      >
```

`.ns-app-shell` (`src/components/AppShell.tsx:152-155`) sets only `background`
and `grid-template-columns` — **it does not create a stacking context**. So the
`<aside>` (z-index 1100) and the portaled positioner (z-index 50) are siblings
in the *root* stacking context. 1100 > 50 → the sidebar paints over the
popover. Because the popover is 220px wide and anchored to a trigger inside the
240px-wide sidebar, it is covered almost entirely — hence "選單沒有跳出來".

`BookSwitcher` is rendered inside the aside at `src/components/AppShell.tsx:257`.

### The BookSwitcher call site to change

`src/components/BookSwitcher.tsx:80` — note there is **no** `positionerClassName`:

```tsx
      <PopoverContent align="start" className="w-64 p-1" style={{ width: 220 }}>
```

### The repo's established escape hatch — use it, do not invent a new one

`PopoverContent` already accepts a `positionerClassName` prop for exactly this
situation. `src/components/ui/popover.tsx:29-31` documents it:

```tsx
    /** Override the positioner classes — e.g. a higher z-index when the popover
        is anchored inside a high-z overlay (QuickAdd sits at z-80). */
    positionerClassName?: string
```

Existing precedents that raise the positioner above a high-z host:

- `src/components/QuickAdd.tsx:383` → `positionerClassName="z-[90]"` (host overlay at `zIndex: 80`)
- `src/routes/CashFlowRoute.tsx:2158` → `positionerClassName="z-[1001]"` (host modal at `zIndex: 1000`)
- `src/routes/InvestmentImportWizard.tsx:250` → `positionerClassName="z-[260]"`

The convention is: **host z + 1, as an arbitrary Tailwind value**. The sidebar
is at 1100, so the BookSwitcher popover positioner must be `z-[1101]`.

### The app's z-index scale (for your reference — do not change any of these)

| Layer | z-index | Where |
|---|---|---|
| `.ns-titlebar-drag` | 30 | `src/styles/globals.css:548` |
| mobile dock / FAB | 40 | `src/styles/globals.css:509`, `AppShell.tsx:418` |
| default popovers / dialogs | 50 | `src/components/ui/popover.tsx:40` |
| QuickAdd overlay | 80 | `src/components/QuickAdd.tsx:274` |
| modal scrim | 1000 | `src/styles/globals.css:665` |
| **desktop sidebar** | **1100** | `src/components/AppShell.tsx:176` |

### Conventions to match

- Comments in this repo explain *why*, in English, at the non-obvious line. See
  the z-index rationale comment at `AppShell.tsx:169-175` for the house style.
- Per `AGENTS.md` 樣式撰寫優先序: prefer existing classes/props over new inline
  style. Here, `positionerClassName` is the existing prop — use it.

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Typecheck | `npm run build`    | exit 0 (runs `tsc && vite build`) |
| Tests     | `npm test`         | all pass (~1252 tests) |
| Lint      | `npm run lint`     | exit 0, 0 errors |

There is no standalone `typecheck` script; `npm run build` runs `tsc` first.
If you want typecheck only, run `npx tsc --noEmit`.

## Scope

**In scope** (the only files you should modify):
- `src/components/BookSwitcher.tsx`

**Out of scope** (do NOT touch, even though they look related):
- `src/components/AppShell.tsx` — **do not lower the sidebar's `zIndex: 1100`.**
  It is load-bearing: plan 063 / the 052 follow-up set it so the macOS-vibrancy
  sidebar is not greyed out by full-viewport `inset:0` scrims. Lowering it
  reintroduces that bug.
- `src/components/ui/popover.tsx` — **do not raise the shared `z-50` default.**
  Every other popover in the app depends on 50 sitting *below* the 1000-level
  modals. Raising it globally would make dropdowns float above modal scrims.
- `src/styles/globals.css` — no new z-index rules needed.
- Any other `positionerClassName` call site — they are correct for their hosts.

## Git workflow

- Branch: `fix/ai-bookswitcher-popover-z` off the current `main`.
- Before branching, run `git status`. If there is uncommitted work in the tree
  that you did not create, **STOP and report** — do not stash it (per `.agentrules`).
- Commit style: conventional commits, matching `git log`. Example from history:
  `fix(investments): 總額 shows net cash flow incl. fee/tax`
  Yours: `fix(books): 帳本 switcher popover renders above the sidebar`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Raise the BookSwitcher popover positioner above the sidebar

In `src/components/BookSwitcher.tsx`, change line 80 from:

```tsx
      <PopoverContent align="start" className="w-64 p-1" style={{ width: 220 }}>
```

to:

```tsx
      {/* The sidebar <aside> sits at z-index 1100 (AppShell.tsx — deliberate, so
          full-viewport scrims don't grey out the vibrancy sidebar). This popover
          portals to document.body and would default to z-50, i.e. *behind* the
          sidebar. Raise the positioner above it. */}
      <PopoverContent
        align="start"
        className="w-64 p-1"
        positionerClassName="z-[1101]"
        style={{ width: 220 }}
      >
```

Keep everything else — `align`, `className`, `style`, children — byte-identical.

**Verify**: `grep -n 'z-\[1101\]' src/components/BookSwitcher.tsx` → exactly 1 match.

**Verify**: `npx tsc --noEmit` → exit 0, no errors.

### Step 2: Confirm nothing else regressed

**Verify**: `npm run lint` → exit 0, 0 errors.

**Verify**: `npm test` → all pass. No test currently covers BookSwitcher's
z-index (this is a CSS-layer bug that jsdom cannot observe — see "Test plan").
The suite must stay green, not grow.

**Verify**: `git status --short` → only `src/components/BookSwitcher.tsx` modified
(plus `plans/README.md` if you are maintaining the index).

## Test plan

**No new automated test.** This is deliberate, and you should not invent one:

- The bug is *paint order in a real stacking context*. jsdom does not compute
  stacking contexts or paint, so a vitest/jsdom test asserting "the popover is
  visible" would pass **both before and after the fix** — a test that cannot
  fail is worse than no test.
- A meaningful regression test would need Playwright plus a screenshot/hit-test
  at the sidebar. The repo has `npm run test:e2e`, but there is no existing
  sidebar-popover e2e spec to model after, and standing one up is out of
  proportion to a one-prop fix.

What you **may** add, if and only if it is cheap and passes: a shallow render
assertion in a new `src/components/BookSwitcher.test.tsx` that the rendered
positioner element carries the `z-[1101]` class — it pins the prop against
accidental deletion even though it cannot prove paint order. Model the file
structure after any existing component test in `src/components/*.test.tsx`
(e.g. `src/components/ModalShell.test.tsx`). **If this test needs more than
~20 lines or any mocking beyond what `ModalShell.test.tsx` already does, skip
it and say so in your report.**

The real verification is manual and belongs to the operator — see below.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n 'positionerClassName="z-\[1101\]"' src/components/BookSwitcher.tsx` returns exactly 1 match
- [ ] `git diff 36d25f50..HEAD -- src/components/AppShell.tsx src/components/ui/popover.tsx src/styles/globals.css` is empty (the out-of-scope files are untouched)
- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run lint` exits 0 with 0 errors
- [ ] `npm test` exits 0, suite still green
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

**Operator verification (not yours — state it in your report as required):**
run the app, click 總帳 in the sidebar, confirm the dropdown appears fully in
front of the sidebar, that picking a book changes `activeBookId`, and that the
collapsed-sidebar variant behaves the same.

## STOP conditions

Stop and report back (do not improvise) if:

- The code at `BookSwitcher.tsx:80` or `AppShell.tsx:176` doesn't match the
  excerpts above (the codebase drifted since this plan was written).
- `AppShell.tsx:176` no longer reads `zIndex: 1100` — the correct value for
  `positionerClassName` is derived from it (host + 1). Report the new value
  instead of guessing.
- `positionerClassName` no longer exists on `PopoverContent`.
- Raising the positioner is not sufficient — e.g. you find the popover is *also*
  clipped by `overflow: hidden` on the aside (`AppShell.tsx:166`). It should not
  be, because the content is portaled outside the aside's DOM subtree, but if
  evidence says otherwise, report rather than restructuring the portal.
- `npm test` was already failing before your change (record the baseline first).

## Maintenance notes

For the human/agent who owns this code after the change lands:

- **This is a coupling between two files.** `BookSwitcher.tsx`'s `z-[1101]` is
  only correct while `AppShell.tsx`'s aside is at `1100`. If anyone changes the
  sidebar's z-index, this must move with it. The comment added in Step 1 is what
  makes that discoverable — keep it.
- **Any future popover, tooltip, select, or date picker rendered inside the
  sidebar has this same bug by default.** If a third one appears, that is the
  signal to stop patching call sites and instead give the sidebar a named z
  token (e.g. `--ns-z-sidebar`) plus a `SidebarPopover` wrapper that reads it.
  Two call sites is not yet worth the abstraction; three is.
- A reviewer should scrutinize: that the sidebar's z-index was **not** lowered
  (the tempting "cleaner" fix that silently reintroduces plan 063's bug), and
  that the shared `z-50` in `ui/popover.tsx` is untouched.
- Deferred out of this plan: an e2e regression test for sidebar overlay
  stacking, and the z-token refactor described above.
