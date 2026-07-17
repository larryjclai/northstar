# Plan 224: Ref-count the viewport scroll lock — interleaved overlay close can never strand `overflow: hidden`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. On
> any STOP condition, stop and report — do not improvise. Do NOT update
> `plans/README.md` — the reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat af28266e..HEAD -- src/lib/scrollLock.ts src/lib/scrollLock.test.ts`
> Mismatch with the excerpts below = STOP.

## Status

- **Priority**: P1 (operator-reported live: page permanently unscrollable)
- **Effort**: S
- **Risk**: LOW (one pure module + its tests; call sites unchanged)
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `af28266e`, 2026-07-17

## Why this matters

Operator flow: 對帳 → 編輯交易 (lands on /cash-flow, TransactionDetailPanel
opens) → edit in the EntryDrawer → return to 對帳 → **the main content is
frozen, cannot scroll**. Root cause is an interleaved save/restore on the
viewport scroll lock:

1. `TransactionDetailPanel` (a `ModalShell`) locks: saves `previous = ""`,
   sets `<html style="overflow: hidden">`.
2. User clicks 編輯 → `onClose` + `startEdit` run together
   (`CashFlowRoute.tsx:2057` — `onEdit={(row) => { setDetailRow(null); startEdit(row); }}`).
   The EntryDrawer's own lock (`CashFlowRoute.tsx:2823`) acquires **while the
   panel is still playing its exit motion** (ModalShell releases only after
   `transitionend`, ~180ms — plan 157), so the drawer saves `previous = "hidden"`.
3. Panel finishes exiting, releases → restores `""`.
4. Drawer eventually closes, releases → restores **`"hidden"`** → the viewport
   is locked forever; only a reload clears it.

The module's own comment claims "Re-entrant: nested overlays each get a
release() that restores the value saved at their own acquire time" — that is
only safe for strictly LIFO release order, which the exit-motion delay broke.
Fix: ref-count. First acquire sets `hidden`, last release restores; release
handles are idempotent. This heals every ordering, including future overlays.

## Current state

`src/lib/scrollLock.ts` (entire file):

```ts
export function lockViewportScroll(): () => void {
  const root = document.documentElement;
  const previous = root.style.overflow;
  root.style.overflow = "hidden";
  return () => {
    root.style.overflow = previous;
  };
}
```

(Above it sits a doc comment explaining WHY the lock goes on `<html>` not
`<body>` — the `overflow-x: clip` / `position: sticky` rationale from plan 155.
**Keep that comment**; replace only the re-entrancy paragraph.)

Call sites (do not modify): `src/components/ModalShell.tsx:278` and
`src/routes/CashFlowRoute.tsx:2823` — both do
`const release = lockViewportScroll()` in an effect and call `release()` in
cleanup. The API shape must not change.

Existing tests: `src/lib/scrollLock.test.ts` — resets
`document.documentElement.style.overflow = ""` in a hook, asserts lock sets
`hidden` on `<html>` (not `<body>`) and nested LIFO release restores.

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| One suite | `npx vitest run src/lib/scrollLock.test.ts` | all pass |
| Typecheck | `npx tsc --noEmit` | exit 0              |
| Lint      | `npm run lint`     | 0 errors / 762 warnings |
| Tests     | `npm test`         | 1338 + new pass     |

## Scope

**In scope**: `src/lib/scrollLock.ts`, `src/lib/scrollLock.test.ts`.
**Out of scope**: ModalShell, CashFlowRoute, any overlay component — the API
is unchanged, so no call-site edits are needed or allowed.

## Git workflow

- Branch: `fix/ai-scroll-lock-refcount` off `main`. Conventional commit, e.g.
  `fix: ref-count viewport scroll lock — interleaved overlay close stranded overflow:hidden (plan 224)`.
  No push/merge.

## Steps

### Step 1: Rewrite the lock as a ref-count

```ts
let lockCount = 0;
let savedOverflow = "";

export function lockViewportScroll(): () => void {
  const root = document.documentElement;
  if (lockCount === 0) {
    savedOverflow = root.style.overflow; // whatever inline value predates ALL overlays
    root.style.overflow = "hidden";
  }
  lockCount += 1;
  let released = false; // each handle releases at most once
  return () => {
    if (released) return;
    released = true;
    lockCount -= 1;
    if (lockCount === 0) root.style.overflow = savedOverflow;
  };
}
```

Update the doc comment's re-entrancy paragraph: ref-counted; first acquire
saves+locks, last release restores; handles idempotent; release order
irrelevant (the old save/restore pairing stranded `hidden` when an opening
overlay captured another overlay's `hidden` as its "previous" — the exact
對帳→編輯 bug). Keep the html-vs-body paragraph verbatim.

**Verify**: `npx tsc --noEmit` → 0.

### Step 2: Tests

Keep the existing cases (they must still pass — LIFO ordering is a subset of
correct orderings). Add, in the same file/style:

1. **The regression**: A locks → B locks → A releases → B releases → overflow
   is `""` (old code left `"hidden"`).
2. Idempotent release: calling one handle's release twice releases only one
   count (lock with A+B, release A twice, overflow still `"hidden"`, then
   release B → `""`).
3. Pre-existing inline value survives: set `overflow = "scroll"` first, lock,
   release → `"scroll"` restored.

**Verify**: `npx vitest run src/lib/scrollLock.test.ts` → all pass (old + 3 new).

### Step 3: Gates

**Verify**: `npm run lint` → 0/762 · `npm test` → all pass.

## Test plan

Step 2. Plus reviewer feel-check (dev server): 記帳 → open any transaction's
detail panel → 編輯 → save → close everything → the page scrolls; repeat the
full 對帳 → 編輯交易 → back round-trip and confirm scrolling survives.

## Done criteria

- [ ] All gates green; ≥3 new scrollLock tests
- [ ] `grep -n "lockCount" src/lib/scrollLock.ts` → hits (ref-count exists)
- [ ] Zero changes outside the two in-scope files (`git status`)

## STOP conditions

- Any call site turns out to rely on the exact restore-my-own-previous
  semantics (e.g. a test elsewhere asserts an intermediate value mid-stack) —
  report which.
- The existing test file's structure contradicts the excerpt.

## Maintenance notes

- Module-level state means jsdom test isolation matters: the existing
  beforeEach-style reset must also reset the count — expose nothing; instead
  make tests release every handle they acquire (structure the new tests that
  way).
- Any future overlay that locks scroll must keep using this module — never a
  bespoke `style.overflow` write.
