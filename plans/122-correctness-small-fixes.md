# Plan 122: Correctness small-fix basket (CSV error path, update-check listener, scope-edit transaction, oversell clamp)

> **Executor instructions**: Follow this plan step by step. The four fixes are
> independent — commit each separately; if one hits a STOP condition, skip it,
> finish the others, and report. Run every verification command. When done,
> update this plan's status row in `plans/README.md` — unless a reviewer
> dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 65fe04c1..HEAD -- src/routes/CashFlowRoute.tsx src/components/AppShell.tsx src/data/repositories.ts src/domain/portfolioMetrics.ts`
> Re-locate all excerpts by grep (line numbers WILL drift); STOP per-item on a
> content mismatch.

## Status

- **Priority**: P2
- **Effort**: M (four S items)
- **Risk**: LOW–MED (item C touches transaction semantics)
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `65fe04c1`, 2026-07-09

## Why this matters

Four small, verified defects: a silent import failure, an update-check
listener that dies under StrictMode, a bulk edit that can half-apply, and an
inconsistent oversell calculation that pollutes XIRR inputs. Individually
minor; together a cheap trust batch.

## Current state + steps (per item)

Commands used throughout: `npx tsc` (exit 0), `npm test` (~831 pass),
`npm run lint` (exit 0).

Git: branch `fix/ai-correctness-small-fixes`; conventional commit per item.

---

### Item A — CSV import has no error path

`src/routes/CashFlowRoute.tsx` (~line 699):

```tsx
  async function handleCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPreview(parseLedgerCsv(await file.text(), accountFor));
    event.target.value = "";
  }
```

A rejecting `file.text()` or a throwing `parseLedgerCsv` yields an unhandled
rejection: the user sees nothing. Fix: wrap in try/catch/finally; on error
call the toast the way this file already does (grep `toast.error(` in the same
file for the exemplar and copy tone — zh-TW, e.g. 「CSV 解析失敗」 plus the
error message). `event.target.value = ""` moves to `finally`.

First check `parseLedgerCsv` (`src/data/csv.ts`): if it returns structured
errors instead of throwing, surface those in the same toast instead.

**Verify**: `npx tsc` → exit 0. Test: only if `src/data/csv.ts` throws on
malformed input, add a route-level test is NOT required (UI glue); note in
report.

---

### Item B — update-check focus listener killed by one-shot ref guard

`src/components/AppShell.tsx` (~line 568):

```tsx
  useEffect(() => {
    if (checkedRef.current) return; // guard StrictMode double-mount
    checkedRef.current = true;
    void checkForUpdate();
    window.addEventListener("focus", checkForUpdate);
    return () => window.removeEventListener("focus", checkForUpdate);
  }, [checkForUpdate]);
```

Under StrictMode (enabled in `src/main.tsx`), run 1 adds + cleanup removes the
listener; run 2 early-returns → **no focus listener in dev**, and any future
`checkForUpdate` identity change kills it in prod. Fix: register the listener
unconditionally; keep only the initial call behind the once-guard:

```tsx
  useEffect(() => {
    if (!checkedRef.current) {
      checkedRef.current = true;
      void checkForUpdate();
    }
    window.addEventListener("focus", checkForUpdate);
    return () => window.removeEventListener("focus", checkForUpdate);
  }, [checkForUpdate]);
```

Confirm `checkForUpdate` already self-throttles (grep `lastCheckRef` nearby —
the audit saw one); if it does NOT, add a ≥6h throttle inside it so focus spam
can't hammer the updater.

**Verify**: `npx tsc` → exit 0; `npm test` → all pass.

---

### Item C — "全部" recurring scope edit is not atomic (SQLite)

`src/data/repositories.ts`, base-class `applyRecurringScopeEdit` (~line 829):
the `scope === "all"` branch loops `await this.updateLedgerTransaction(sib.id,
{...})` per sibling. On SQLite, each of those runs in its OWN `withTransaction`
(see `updateLedgerTransaction` override ~line 2249), and
`applyRecurringScopeEdit` is inherited with no outer transaction — a mid-loop
failure leaves the series half-updated.

Fix shape: add a SQLite override of `applyRecurringScopeEdit` in
`TauriSqlFinanceRepository` that wraps `super.applyRecurringScopeEdit(...)` in
one `this.withTransaction(...)` — BUT first verify `withTransaction` is
re-entrant (read its implementation ~line 1978: if it plain-executes
`BEGIN`/`COMMIT`, nested calls will fail). If it is NOT re-entrant, STOP on
this item and report — the fix then requires a savepoint or an internal
unwrapped update path, which is a bigger change than this basket.

Test (only if the fix lands): in `src/data/repositories.recurring.test.ts`
the memory repo can't prove SQLite atomicity — instead add the test under the
SQLite factory if `repositories.sqlite-tx.test.ts` patterns allow (it tests
transactions already; model on it): make the 2nd sibling update fail (e.g.
invalid draft), assert the 1st sibling kept its OLD values.

**Verify**: `npm test -- repositories` → all pass.

---

### Item D — moving-average oversell books proceeds for unheld shares

`src/domain/portfolioMetrics.ts` (~line 88):

```ts
    } else if (r.action === "sell") {
      const avg = quantity === 0 ? 0 : cost / quantity;
      const soldQty = Math.min(r.quantity, quantity);
      const proceeds = r.price * r.quantity - r.fee;
      realizedGain += proceeds - avg * soldQty;
      quantity -= r.quantity;
      cost -= avg * soldQty;
      cashflows.push({ date: day(r.date), amount: proceeds });
      settle();
```

Cost is clamped to `soldQty` but proceeds and the quantity decrement use the
full requested `r.quantity` — an oversell (reachable via backdated ordering,
import, or sync) inflates the XIRR cashflow and disagrees with
`buildQuantityTimeline`/`buildCostBasisTimeline`, which clamp. Fix: use
`soldQty` consistently:

```ts
      const proceeds = r.price * soldQty - r.fee;
      realizedGain += proceeds - avg * soldQty;
      quantity -= soldQty;
```

Add a characterization test in `src/domain/portfolioMetrics.test.ts` (model on
its existing cases): records = sell 10 before any buy (or sell 10 with only 4
held) → assert quantity floors at 0, proceeds cashflow = `price*4 - fee`, and
the quantity timeline agrees. IMPORTANT: run the full suite after — if any
existing test encodes the old full-quantity proceeds, STOP on this item and
report the conflict instead of changing that test's expectation (it may be a
decided semantic).

**Verify**: `npm test -- portfolioMetrics` → all pass incl. new test.

---

## Scope

**In scope**: the four files above + the named test files.
**Out of scope**: `validateInvestmentDraft` (entry-time oversell guard —
already correct); DRIP paths; `parseLedgerCsv` internals beyond reading its
error contract; any refactor of `withTransaction`.

## Done criteria

- [ ] A: CSV failure shows a zh-TW error toast; input resets in `finally`
- [ ] B: focus listener survives StrictMode remount (effect registers
      unconditionally)
- [ ] C: SQLite scope-edit "全部" is atomic (or item STOP-reported)
- [ ] D: oversell uses `soldQty` for proceeds/decrement + regression test
      (or item STOP-reported)
- [ ] `npx tsc`, `npm test`, `npm run lint` all green
- [ ] `plans/README.md` updated (note any per-item STOPs)

## STOP conditions

Per-item, as embedded above. Globally: any fix requires touching
`src/domain/sync.ts` or changing a public repository interface type.

## Maintenance notes

- Item D interacts with plan 126 (dual-repo harness): the timeline-agreement
  assertion is a good candidate for its shared suite.
- Reviewer: on D, confirm `realizedGain` still equals proceeds − cost for the
  clamped quantity; on C, confirm no double-BEGIN in the SQL trace.
