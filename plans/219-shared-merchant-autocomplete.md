# Plan 219: One shared MerchantAutocomplete — EntryDrawer gains keyboard nav + a11y

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. Do NOT update `plans/README.md` — the reviewer
> maintains the index.
>
> **Drift check (run first)**: `git diff --stat 55c636ac..HEAD -- src/components/QuickAdd.tsx src/routes/CashFlowRoute.tsx`
> If either file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt / dx
- **Planned at**: commit `55c636ac`, 2026-07-17

## Why this matters

The app has TWO hand-rolled merchant autocompletes. QuickAdd's (plan 180,
operator-reviewed) has keyboard navigation (Arrow/Enter/Escape), `role="combobox"`
aria wiring, and internal substring filtering. The CashFlow EntryDrawer's (from the
2026-05-29 記帳 rebuild, predating plan 180) has none of that — a desktop user
tabbing through the entry form cannot select a suggestion without the mouse, and
its `onBlur` close is a 120ms `setTimeout` race instead of the `onMouseDown`
pattern. Extracting QuickAdd's implementation into one shared component gives the
drawer keyboard support for free and deletes a duplicate.

**Correction to the recorded follow-up**: plans/README.md's open follow-up said the
drawer's 商家 field "is still a plain input" — that was wrong when written; the
drawer has had its own (weaker) autocomplete since `60ac6277`. The real gap is
keyboard nav + a11y + dedupe, which is this plan.

## Current state

- `src/components/QuickAdd.tsx:550-556` — the good implementation:

  ```tsx
  // ── 商家 autocomplete (plan 180) ─────────────────────────────────────────────
  // Free-text input with a lightweight filtered dropdown of known merchants.
  // Deliberately not the Popover+Command combobox (AccountFilter): that pattern
  // wraps a button trigger, but this field must stay a plain text input.
  function MerchantAutocomplete({ value, merchants, onChange }: {
  ```

  Behavior: internal `useMemo` filter — case-insensitive substring over
  `merchants`, hides the exact current value, caps at 8; `role="combobox"`,
  `aria-expanded`, `aria-autocomplete="list"`; ArrowUp/ArrowDown wrap highlight,
  Enter selects, Escape closes the dropdown only (`e.stopPropagation()` so the
  QuickAdd overlay's window-level Escape listener doesn't fire). Used once, at
  `QuickAdd.tsx:373`, fed by `merchantOptions`.

- `src/routes/CashFlowRoute.tsx:3922-3966` — the weak duplicate (same exported
  name, module-local): plain input + panel of `suggestions.slice(0, 8)` buttons,
  `onMouseDown` select (good), `onBlur={() => window.setTimeout(() => setOpen(false), 120)}`
  (racy), NO keyboard nav, NO aria. Used once, at `CashFlowRoute.tsx:3334`
  (支出/收入 form's 商家 / 來源 field), fed by `merchantSuggestions`.

- `src/routes/CashFlowRoute.tsx:357-360` — the drawer pre-filters per keystroke:

  ```tsx
  const merchantSuggestions = useMemo(
    () => buildMerchantSuggestions(merchantPool, ledgerForm.merchant),
    [merchantPool, ledgerForm.merchant],
  );
  ```

  and `buildMerchantSuggestions` (`CashFlowRoute.tsx:3995-4001`) is a pure
  case-insensitive substring filter capped at 12 — semantically the same
  filtering the shared component does internally, so it becomes redundant.

- The drawer's field ALSO does a category reverse-fill in its `onChange`
  (`CashFlowRoute.tsx:3335-3344`) — that logic lives in the CALLER's onChange
  and must be preserved untouched; it is orthogonal to the component swap.

- Shared-component precedent/exemplar: `src/components/ClientAutocomplete.tsx`
  (plan 191) — a standalone autocomplete component file in `src/components/`.
  Match its file placement and export style.

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0, no output   |
| Lint      | `npm run lint`     | 0 errors, exactly 762 warnings (baseline) |
| Tests     | `npm test`         | 1318 passed         |

## Scope

**In scope** (the only files you may modify):
- `src/components/MerchantAutocomplete.tsx` (create)
- `src/components/QuickAdd.tsx`
- `src/routes/CashFlowRoute.tsx`

**Out of scope** (do NOT touch):
- `src/components/ClientAutocomplete.tsx` — similar but client-master-specific
  (plan 191); unifying it is not this plan.
- The category reverse-fill / `categoryForMerchant` logic in CashFlowRoute —
  keep byte-identical, it stays in the caller's `onChange`.
- `merchantPool` / `merchantCategoryMap` derivations.
- Any styling redesign — the shared component keeps QuickAdd's current look.

## Git workflow

- Branch: `feat/ai-shared-merchant-autocomplete` off `main`.
- Conventional commits (repo style), e.g.
  `refactor: extract shared MerchantAutocomplete — EntryDrawer gains keyboard nav (plan 219)`.
- Do NOT push or merge.

## Steps

### Step 1: Extract the component

Create `src/components/MerchantAutocomplete.tsx` by MOVING QuickAdd's
`MerchantAutocomplete` function (lines ~556-655, including its header comment
block) into the new file as the default-less named export:

```tsx
export function MerchantAutocomplete({ value, merchants, onChange, placeholder = "選填" }: {
  value: string;
  /** Known merchant names, ranked by history frequency (unfiltered — the component filters). */
  merchants: string[];
  /** Called for both typing and selecting an entry. */
  onChange: (v: string) => void;
  placeholder?: string;
}) {
```

Only two changes from the QuickAdd original: (a) the new optional `placeholder`
prop (QuickAdd's hardcoded `placeholder="選填"` becomes the default), (b) imports
(`useState`, `useMemo` from react). Everything else — filtering, highlight,
keyboard handling, Escape `stopPropagation`, listbox markup — byte-identical.

**Verify**: `npx tsc --noEmit` → fails only with "MerchantAutocomplete is declared
but never used" style errors in the two call-site files is NOT expected — tsc has
no such rule; expect exit 0 once step 2-3 are done. It's fine to run tsc only
after step 3.

### Step 2: Switch QuickAdd to the import

In `src/components/QuickAdd.tsx`: delete the local `MerchantAutocomplete`
function + its `// ── 商家 autocomplete (plan 180)` comment block; add
`import { MerchantAutocomplete } from "./MerchantAutocomplete";`. The call site
at `:373` is unchanged. Remove `useMemo` from QuickAdd's react import ONLY if
nothing else in the file uses it (grep first — expect it IS still used; leave it).

**Verify**: `npx tsc --noEmit` → may still error if step 3 pending; proceed.

### Step 3: Switch the EntryDrawer

In `src/routes/CashFlowRoute.tsx`:
1. Delete the local `MerchantAutocomplete` (lines ~3922-3966) and
   `buildMerchantSuggestions` (~3995-4001).
2. Add `import { MerchantAutocomplete } from "../components/MerchantAutocomplete";`.
3. Replace the `merchantSuggestions` memo (~357-360) usage: the drawer now passes
   the UNFILTERED ranked pool. Change the prop wiring at the call site (~3334)
   from `suggestions={merchantSuggestions}` to `merchants={merchantPool}` and
   keep `placeholder`/`value`/`onChange` exactly as they are (the reverse-fill
   `onChange` body is untouched). Delete the `merchantSuggestions` memo and its
   prop plumbing through the EntryDrawer component signature
   (`CashFlowRoute.tsx:2002`, `:2638`, `:2686`) — pass `merchantPool` through the
   same plumbing route instead (rename the prop to `merchantPool`).

Behavioral deltas, both accepted: dropdown caps at 8 (was 12), and the exact
current value is hidden from the list (QuickAdd semantics).

**Verify**: `npx tsc --noEmit` → exit 0. `grep -n "buildMerchantSuggestions\|function MerchantAutocomplete" src/routes/CashFlowRoute.tsx src/components/QuickAdd.tsx` → no matches.

### Step 4: Full gates

**Verify**: `npm run lint` → 0 errors / 762 warnings. `npm test` → 1318 passed.

## Test plan

No new unit tests — this is a pure extraction plus one adoption; the component
is DOM-interaction logic that the repo tests via live checks, not jsdom. The
existing 1318 tests must stay green. Reviewer will feel-check (below).

## Done criteria

- [ ] `npx tsc --noEmit` exit 0; `npm run lint` 0 errors / 762 warnings; `npm test` 1318 passed
- [ ] `src/components/MerchantAutocomplete.tsx` exists; both call sites import it
- [ ] `grep -rn "function MerchantAutocomplete" src/components/QuickAdd.tsx src/routes/CashFlowRoute.tsx` → empty
- [ ] `grep -n "buildMerchantSuggestions" src/routes/CashFlowRoute.tsx` → empty
- [ ] No files outside the in-scope list modified (`git status`)

## STOP conditions

- The QuickAdd `MerchantAutocomplete` at ~:556 or the CashFlow one at ~:3922
  doesn't match the descriptions above (drift).
- The EntryDrawer's 商家 field turns out to have keyboard-dependent behavior
  tied to its 120ms blur timeout that the swap breaks in a way you can't
  resolve by the `onMouseDown` pattern already in the shared component.
- `merchantPool` turns out NOT to be a plain ranked `string[]`.

## Maintenance notes

- Reviewer feel-check (dev server): in 記帳 → 新增 → 支出, focus 商家/來源,
  type one CJK char → dropdown filters; ArrowDown + Enter selects; Escape closes
  the dropdown but NOT the drawer; picking a merchant with no category chosen
  still reverse-fills the category (caller logic).
- If a future plan unifies `ClientAutocomplete` with this component, the delta
  is its client-master rows (taxId display) — check plan 191 first.
