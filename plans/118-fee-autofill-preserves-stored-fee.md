# Plan 118: Stop the TW fee auto-fill from overwriting the stored fee when editing an existing record

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 65fe04c1..HEAD -- src/routes/InvestmentsAddSheet.tsx`
> If the file changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as
> a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `65fe04c1`, 2026-07-09

## Why this matters

Northstar auto-computes Taiwan brokerage fees (手續費) for convenience. But the
sheet resets its "user touched the fee" flag every time it opens — including
when it opens to **edit an existing record**. The auto-fill effect then fires
(its deps all change as the preset loads) and silently replaces the record's
stored fee with a fresh formula estimate. Users who imported real broker fees,
have a promo discount, or manually corrected a fee lose that value on any
edit-and-save of a `.TW`/`.TWO` buy/sell — corrupting realized cost and P&L.

## Current state

- `src/routes/InvestmentsAddSheet.tsx` — the add/edit sheet for investment
  records. `transactionPreset` is the prop that carries an existing record into
  edit mode.

Open-effect (runs on every open; note the unconditional reset), around line 200:

```tsx
    setDripDividendAmount(0);
    setMessage("");
    // Reset auto-fill state whenever the drawer opens.
    feeTouchedRef.current = false;
    dripAmountTouchedRef.current = false;
    setInstrument("stock");
  }, [open, emptyHoldingDraft, timezone, initialMode, transactionPreset]);
```

Auto-fill effect (lines ~218–241): fires when action/ticker/quantity/price/
linkedAccountId/instrument change; guarded only by `feeConfig.enabled`,
`feeTouchedRef.current`, action ∈ {buy, sell}, and `isTaiwanTicker(...)`. It
ends with:

```tsx
    setTransactionForm((prev) => ({ ...prev, fee: suggested }));
```

When editing, the preset loads all those deps at once, `feeTouchedRef.current`
is `false` (just reset), and the stored fee is clobbered.

Find where `transactionPreset` seeds the form (search `transactionPreset` in
the same file) to see how edit mode is distinguishable from create mode.

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Typecheck | `npx tsc`        | exit 0              |
| Tests     | `npm test`       | all pass (~831)     |
| Lint      | `npm run lint`   | exit 0              |

## Scope

**In scope**:
- `src/routes/InvestmentsAddSheet.tsx`
- A new test file `src/routes/InvestmentsAddSheet.feeAutofill.test.tsx` (or a
  pure-logic extraction if a component test is impractical — see Test plan)

**Out of scope**:
- `src/domain/tradingFees.ts` (`computeTradeFee`) — the fee formula is correct;
  do not touch it.
- The DRIP amount auto-fill (`dripAmountTouchedRef`) — same pattern but plan
  109 already tuned it deliberately; leave it alone.
- Any change to create-mode behavior: a fresh TW buy/sell must still auto-fill.

## Git workflow

- Branch: `fix/ai-fee-autofill-edit-clobber`
- Commit style: conventional, e.g. `fix(investments): preserve stored fee when editing a TW record`
- Do NOT push or merge to `main`; leave the branch for review.

## Steps

### Step 1: Mark the fee as "touched" when opening in edit mode

In the open-effect, after the existing `feeTouchedRef.current = false;` line,
set the flag to `true` when the sheet opens with a preset that carries a fee:

```tsx
    feeTouchedRef.current = false;
    // Editing an existing record: its fee is data, not a suggestion target.
    if (transactionPreset && transactionPreset.fee != null) {
      feeTouchedRef.current = true;
    }
```

Adjust the exact preset field access to match how `transactionPreset` is
shaped in this file (read the type where it's declared). If the preset can
carry `fee: 0` legitimately, treat `0` as a real stored fee too (use `!= null`,
not truthiness).

**Verify**: `npx tsc` → exit 0.

### Step 2: Add the regression test

Preferred: a component test with Testing Library (pattern:
`src/components/NumberField.test.tsx`) that renders the sheet with a TW-ticker
`transactionPreset` whose `fee` differs from the formula value, waits a tick,
and asserts the fee input still shows the stored fee. If mounting the full
sheet requires too much provider scaffolding (React Query + repository), STOP
and report with what was missing — do not ship the fix untested.

**Verify**: `npm test -- InvestmentsAddSheet` → new test passes.

### Step 3: Full gates

**Verify**: `npm test` → all pass. `npm run lint` → exit 0.

## Done criteria

- [ ] `npx tsc` exits 0; `npm test` all pass including ≥1 new test
- [ ] Editing a TW buy/sell preset with a non-formula fee preserves that fee
- [ ] Creating a new TW buy/sell still auto-fills (existing behavior unchanged)
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The open-effect or auto-fill effect no longer matches the excerpts.
- `transactionPreset` has no fee field (the form seeds fee some other way) —
  report the actual mechanism instead of guessing.
- The component test needs more than ~40 lines of provider mocking.

## Maintenance notes

- If a future "recompute fee" button is added, it should set the form fee AND
  `feeTouchedRef.current = true` (explicit user action).
- Reviewer: check that `fee: 0` presets (free trades exist) are treated as
  stored data, not as "empty → auto-fill".
