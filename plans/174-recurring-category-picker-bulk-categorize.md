# Plan 174: Structured category picker for recurring rules + suggest-and-confirm bulk categorization

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update the status row in `plans/README.md` — unless a reviewer
> dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 4ac63576..HEAD -- src/routes/RecurringRulesTab.tsx src/domain/userLexicon.ts src/domain/merchantCategory.ts src/routes/CashFlowRoute.tsx`
> On drift, compare "Current state" excerpts against live code; on a mismatch,
> treat as STOP.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED (Part B writes categories onto existing transactions — must be
  strictly confirm-gated and reversible via the normal edit flow)
- **Depends on**: none
- **Category**: direction (self-learning categorization exists but only helps at QuickAdd; plans-index standing follow-up)
- **Planned at**: commit `4ac63576`, 2026-07-12

## Why this matters

Northstar shipped a self-learning categorization stack — `userLexicon.ts`
(merchant→category learned from history + correction feedback) and
`merchantCategory.ts` — but it is consumed **only** by `QuickAdd.tsx` and
`CashFlowRoute.tsx`. Two gaps waste it:

- **Part A**: `RecurringRulesTab.tsx` still takes category as **free text**
  (a standing follow-up in `plans/README.md`), so recurring rules bypass both
  the structured category tree and category-kind tagging — typos create
  phantom categories that pollute budgets and category analytics.
- **Part B**: historical/uncategorized transactions never benefit from what
  the lexicon has learned. A user with months of uncategorized imports has no
  way to apply their own learned rules retroactively.

Correctness-first constraint: bulk writes are **suggest-and-confirm, never
silent** — the user reviews each suggestion (or unchecks it) before anything
is written.

## Current state

- `src/routes/RecurringRulesTab.tsx:466-474` — the free-text field:

  ```tsx
  {/* Category */}
  <RuleField label="分類">
    <input
      className="ns-input"
      value={form.category}
      onChange={(e) => setForm({ ...form, category: e.target.value })}
      placeholder="選填"
    />
  </RuleField>
  ```

  The Account field directly above it (line ~453) already uses the structured
  `AppSelect` — that's the component and layout convention to match.
- Category source of truth: `settings.categories` —
  `{ name, children[] }[]` (see the default in `src/data/repositories.ts:384`).
  `src/routes/CashFlowRoute.tsx:2527` and `:2555` render a category +
  subcategory picker from it (`categories.map` / `subcategories.map`) — read
  that block; it is the UX to mirror (category then optional child, stored as
  a single string — check how CashFlow composes parent/child into the stored
  value and store identically).
- `src/domain/userLexicon.ts` — exports `buildUserLexicon(...)` (line 72),
  `matchAccountFromLexicon` (215), `lookupCategory` (252). Read
  `lookupCategory`'s signature/JSDoc for exact inputs (lexicon + merchant
  text) and its confidence semantics.
- `src/domain/merchantCategory.ts` — merchant→category rules; check how
  `CashFlowRoute.tsx` combines it with the lexicon so Part B ranks suggestions
  the same way (QuickAdd behavior is the reference semantics).
- `src/domain/categoryKind.ts` — category-kind tagging (expense/income);
  plan 154 made kind persistence consistent — Part A must go through the same
  structured path so kinds stay correct.
- UI copy: these route files carry inline zh-TW strings; match surrounding
  copy style. Styling: COSS/`ns-*` first, inline styles only for dynamic
  values.

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0              |
| Tests     | `npm test`         | all pass            |
| Lint      | `npm run lint`     | exit 0, 0 errors    |

## Scope

**In scope**:
- `src/routes/RecurringRulesTab.tsx` (Part A)
- `src/domain/bulkCategorize.ts` + `src/domain/bulkCategorize.test.ts` (create — Part B pure logic)
- ONE UI host for Part B: a card/section in the cash-flow area or settings
  where uncategorized transactions are listed with suggestions (see Step 3 for
  the placement rule)
- `src/styles/globals.css` only if a new `ns-*` class is genuinely needed

**Out of scope** (do NOT touch):
- `userLexicon.ts`, `merchantCategory.ts`, `quickAddCorrections.ts` — consume,
  don't modify.
- QuickAdd's parse pipeline and `CashFlowRoute`'s existing category picker.
- Any automatic (unconfirmed) write of a category. Also no writes to
  transactions that already HAVE a category — v1 is uncategorized-only.
- Schema changes.

## Git workflow

- Branch: `feat/ai-category-picker-bulk-categorize`
- Conventional commits, e.g. `feat(recurring): structured category picker`,
  `feat(cash-flow): suggest-and-confirm bulk categorization`
- Do NOT push or merge; leave the branch for review.

## Steps

### Step 1 (Part A): Replace the free-text category input

In `RecurringRulesTab.tsx`, replace the `ns-input` at :466 with a structured
picker over `settings.categories` matching CashFlowRoute's parent/child
composition (same stored string format — verify by reading how CashFlow writes
`category` on a transaction, then store the identical shape). Keep「選填」
semantics: an explicit "no category" choice must remain possible. If existing
rules hold free-text values that don't match any category, show the stored
value as a fallback option labelled as 自訂 so editing an old rule doesn't
silently drop its category.

**Verify**: `npx tsc --noEmit` → 0; `npm test` → all pass (recurring tests in
`src/data/repositories.recurring.test.ts` unaffected).

### Step 2 (Part B): Pure suggestion builder

Create `src/domain/bulkCategorize.ts`:

```ts
export interface CategorySuggestion {
  transactionId: string;
  merchantText: string;      // what was matched on
  suggested: string;         // category string in the stored format
  source: "lexicon" | "merchant-rule" | "keyword";
  confidence: "high" | "medium";
}
/** Uncategorized ledger transactions → ranked suggestions. Pure. */
export function buildCategorySuggestions(
  transactions: LedgerTransaction[],
  lexicon: UserLexicon,
  /* + whatever merchantCategory needs — mirror QuickAdd's usage */
): CategorySuggestion[];
```

Rules: only transactions with an empty/missing category; skip transfers and
investment-linked legs (check `LedgerTransaction`'s type fields in
`src/domain/types.ts` for how transfers are marked); no suggestion below the
confidence floor (better to suggest nothing than wrongly — mirror the
confidence gating QuickAdd applies); deterministic order (date desc).

**Verify**: `npm test` → new `bulkCategorize.test.ts` passes.

### Step 3 (Part B): Suggest-and-confirm UI

Placement rule: put the entry point where uncategorized transactions are
already visible — if `CashFlowRoute.tsx` has an uncategorized filter/indicator,
add a「套用建議分類」affordance there; otherwise add a card in the cash-flow
route near the existing 自動分類 explanations. (Decide by reading; record the
choice in the commit message.) The flow: list suggestions with checkboxes (all
checked by default at `high` confidence, unchecked at `medium`), each row
showing merchant text → suggested category + source; a single confirm button
applies the checked ones via the normal repository update path (the same
update method the transaction edit flow uses — find it via
`useRepositoryMutation` usages in `CashFlowRoute.tsx`), then invalidates
queries. Empty state:「沒有可建議的未分類交易」.

**Verify**: `npx tsc --noEmit` → 0; `npm run lint` → 0 errors.

## Test plan

`src/domain/bulkCategorize.test.ts` (model after `src/domain/userLexicon.test.ts`):
- learned merchant in lexicon → high-confidence suggestion with correct category.
- transaction already categorized → excluded.
- transfer / investment leg → excluded.
- unknown merchant below floor → no suggestion.
- ordering + stable output for identical input.

Part A: if `RecurringRulesTab` has an existing test file, extend it to assert
the select renders `settings.categories` options; if not, skip UI tests (repo
convention for these route files) — Part A's safety net is the recurring
repository tests plus typecheck.

## Done criteria

- [ ] `npx tsc --noEmit` 0; `npm run lint` 0 errors; `npm test` all pass with ≥ 5 new bulkCategorize tests
- [ ] `grep -n "ns-input" src/routes/RecurringRulesTab.tsx` → no category free-text input remains (the note/備註 field may still be an ns-input — only the category one must be gone)
- [ ] `grep -rn "buildCategorySuggestions" src/routes/` → exactly one UI consumer
- [ ] No write path applies a suggestion without the confirm button (code-read check; state it in the PR body)
- [ ] `plans/README.md` status row updated

## STOP conditions

- CashFlow's stored category format turns out to be ambiguous (parent vs
  parent/child composition unclear) — report with examples rather than
  guessing; a wrong format corrupts budget/category analytics.
- Part B seems to need a new repository method (no suitable update path
  exists) — report; repository surface changes need review.
- The lexicon build turns out to be expensive enough that building it for the
  bulk screen needs caching/memoization beyond a `useMemo` — report with
  numbers.

## Maintenance notes

- Applying suggestions writes normal edits — sync (LWW) and budgets pick them
  up automatically; nothing special to maintain.
- Future: extending suggestions to *re*-categorization (already-categorized
  rows) was deliberately excluded — it needs a different confirmation UX and
  a "why" display. Revisit only on user demand.
- Reviewer: scrutinize the transfer/investment-leg exclusion and the
  confidence floor — both guard the correctness-first invariant.
