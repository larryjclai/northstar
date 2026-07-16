# Plan 221: 分帳 foundation — `share` legs on the split model (data layer only, zero UI)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. Do NOT update `plans/README.md` — the reviewer
> maintains the index.
>
> **Drift check (run first)**: `git diff --stat 55c636ac..HEAD -- src/domain/splitLegs.ts src/domain/ledgerTrust.ts src/data/repositories.ts src/domain/types.ts`
> On any in-scope change since `55c636ac`, compare "Current state" excerpts
> against live code; mismatch = STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (touches ledger-row creation in a finance app; mitigated by the
  characterization-test-first step and the reconciliation test)
- **Depends on**: none (181/182 both merged; this extends them)
- **Category**: direction (帳本/記帳 roadmap — 分帳 phase 2)
- **Planned at**: commit `55c636ac`, 2026-07-17

## Why this matters

多類別拆分 shipped (plans 181/182): one purchase = N sibling ledger rows sharing
a `groupId`, each `legKind: "category"`. 分帳 (splitting a bill with people) is
the decided phase 2 (spike: `docs/split-legs-plan.md`, operator-approved
2026-07-13): a `"share"` leg records someone else's portion of the same
purchase. This plan builds ONLY the data layer — types, builder, repository
methods, partial-sync guard, tests — so a follow-up UI plan (222) can be cut
against real, tested signatures, exactly how 182 was cut against 181.

**The finance semantics (this is the core — get these right):**

I pay NT$1000 from my bank for dinner; my share 400, my friend owes 600.
- My bank must drop by the FULL 1000 (I paid it).
- My *expense* must be only 400.
- The 600 must exist as a receivable, or `資產 − 負債 = 淨值` breaks.

The repo already has the machinery: a row with `counterAccountId` set is a
代墊 pass-through — it posts against `accountId` (bank, −600) and the counter
account (應收 account, +600), and `isNeutralLedgerRow`
(`src/domain/ledgerTrust.ts:22-24`) plus every spend aggregator's
`!row.counterAccountId` filter (e.g. `MerchantsTab.tsx:12`) excludes it from
income/expense. A `share` leg is exactly such a row, plus `legKind: "share"` and
the shared `groupId`. A share the user does NOT want tracked as receivable
(請客) is simply not a share leg — it stays inside the user's own category legs.
This is the spike's locked recommendation (`docs/split-legs-plan.md` §"分帳
share leg", §Invariants — read both before starting).

## Current state

- `src/domain/splitLegs.ts` — the builder. Today:
  - `SplitLegInput = { amount: number; category: string; subcategory: string }` (:21-25)
  - `SplitSharedFields` (:28-38) — shared subset incl. `entryType: "expense" | "income"`.
  - `SplitLegDraft extends SplitSharedFields` with pinned `groupId` +
    `legKind: "category"` (:45-51).
  - `buildSplitLegs(shared, legs, groupId)` (:59) throws zh-TW on `<2` legs
    (「拆分至少需要 2 筆明細。」), non-positive amounts, empty category; applies
    the sign itself (expense → negative).
- `src/data/repositories.ts`:
  - `LedgerDraft` (:58-80) — has `counterAccountId?: string | null` (:61,
    "Reimbursement (代墊) counter account") and
    `legKind?: "category" | null` (:75).
  - Interface: `createSplit(shared, legs)` (:337), `updateSplit(groupId, shared, legs)` (:345).
  - Browser impl `createSplit` (:1222-1228): `buildSplitLegs` →
    `assertLedgerInvariants` per draft → push → `recompute()` → persist.
  - `updateSplit` (:1230-1245): tombstone-all-active-in-group with `bump()`
    (revision++ so sync LWW propagates deletes) + recreate with SAME groupId.
  - SQLite override at :3141 (same shape, SQL transaction).
  - The `leg_kind` and `counter_account_id` SQLite columns already exist —
    **no migration needed** (181 added `leg_kind`; 代墊 predates it).
- `src/domain/types.ts` — `LedgerTransaction` with its own `legKind` literal
  type (grep `legKind` there).
- `src/domain/ledgerTrust.ts:180-188` — the partial-sync guard:

  ```ts
  export function incompleteSplitGroupIds(ledger: LedgerTransaction[]): string[] {
    const counts = new Map<string, number>();
    for (const row of ledger) {
      if (row.deletedAt !== null || row.legKind !== "category" || !row.groupId) continue;
      counts.set(row.groupId, (counts.get(row.groupId) ?? 0) + 1);
    }
    return [...counts.entries()].filter(([, count]) => count === 1).map(([groupId]) => groupId);
  }
  ```

- Tests to model after: `src/domain/splitLegs.test.ts`,
  `src/data/repositories.split.test.ts` (dual-harness browser+SQLite pattern),
  `src/domain/ledgerTrust.test.ts:93-113`.
- Convention: all thrown user-facing errors are zh-TW strings (see
  buildSplitLegs' existing messages). Domain must not import from data.

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0              |
| Lint      | `npm run lint`     | 0 errors / 762 warnings |
| All tests | `npm test`         | 1318 + new pass     |
| One suite | `npx vitest run src/domain/splitLegs.test.ts` | pass |

## Scope

**In scope**:
- `src/domain/splitLegs.ts` (+ its test)
- `src/domain/ledgerTrust.ts` (+ its test — ONLY `incompleteSplitGroupIds` and
  its doc comment)
- `src/domain/types.ts` (legKind literal widening only)
- `src/data/repositories.ts` (legKind literal widening; `createSplit`/`updateSplit`
  signatures + both impls; counter-account existence guard)
- `src/data/repositories.split.test.ts`

**Out of scope** (do NOT touch):
- ANY UI file — no EntryDrawer, no list rendering, no settle flow (plan 222).
- `isNeutralLedgerRow` and every spend aggregator — they already handle
  `counterAccountId`; the whole design leans on NOT touching them.
- Sync wiring — `legKind`/`counterAccountId` are existing synced columns;
  nothing new to wire.
- `buildSplitLegs`' existing category-leg validation messages — 182's UI
  asserts on them.

## Git workflow

- Branch: `feat/ai-share-legs-foundation` off `main`. Conventional commits
  (e.g. `feat: share legs — 分帳 foundation on the split model (plan 221)`).
  No push/merge.

## Steps

### Step 1: Widen the `legKind` literals

Grep `legKind` across `src/` (expect type sites: `domain/types.ts`,
`data/repositories.ts` LedgerDraft, `domain/splitLegs.ts`). Widen the literal
unions `"category" | null` → `"category" | "share" | null` in `types.ts` and
`repositories.ts` (LedgerDraft). Do NOT widen `SplitLegDraft.legKind` (stays
pinned `"category"`).

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Extend the builder

In `src/domain/splitLegs.ts` add:

```ts
/** One 分帳 participant's portion: positive amount + 對象 + the 應收 account
 *  the pass-through posts to. */
export interface SplitShareInput {
  amount: number;
  /** 對象 display name — becomes the leg's `name`. */
  counterparty: string;
  /** 代墊/應收 counter account id. Required: a share IS a receivable;
   *  a treated (請客) portion is just part of the payer's own category legs. */
  counterAccountId: string;
}

export interface SplitShareDraft extends SplitSharedFields {
  amount: number;
  category: "";
  subcategory: "";
  groupId: string;
  legKind: "share";
  counterAccountId: string;
}
```

Widen the builder signature (backward-compatible — 182's call sites pass no
4th arg): `buildSplitLegs(shared, legs, groupId, shares: SplitShareInput[] = []): Array<SplitLegDraft | SplitShareDraft>`.

New validation (zh-TW, matching existing style), in this order:
1. `shares.length > 0 && shared.entryType !== "expense"` → 「分帳僅支援支出。」
2. Combined minimum: `legs.length + shares.length < 2` → keep the existing
   「拆分至少需要 2 筆明細。」 (when `shares` is empty this is byte-identical to
   today's `legs.length < 2` check — restructure the guard so that holds).
3. `shares.length > 0 && legs.length < 1` → 「分帳需要至少 1 筆自己的類別明細。」
4. Per share: non-finite/≤0 amount → 「分帳明細金額必須大於 0。」; empty
   `counterparty.trim()` → 「分帳明細必須填寫對象。」; empty
   `counterAccountId` → 「分帳明細必須選擇應收帳戶。」

Share draft shape: all `shared` fields, then `name: share.counterparty`,
`category: ""`, `subcategory: ""`, `amount: -share.amount` (expense sign — same
sign rule the category legs get), `groupId`, `legKind: "share"`,
`counterAccountId: share.counterAccountId`, and `settlementStatus:
shared.settlementStatus` (pass through unchanged — 代墊 neutrality comes from
`counterAccountId`, not settlementStatus). Category legs keep today's shape,
including `counterAccountId` absent.

**Verify**: `npx vitest run src/domain/splitLegs.test.ts` → existing tests pass unchanged.

### Step 3: Builder tests

Extend `src/domain/splitLegs.test.ts` (match its existing structure): (1) mixed
split — 1 category leg 400 + 1 share 600 → two drafts, share has
`legKind:"share"`, `amount:-600`, `name` = counterparty, `counterAccountId`
set, `category:""`; (2) share on income throws 「分帳僅支援支出。」; (3) zero
category legs + 2 shares throws 「分帳需要至少 1 筆自己的類別明細。」; (4) 1
category leg + 1 share passes the ≥2 combined rule (this is the canonical 分帳
case); (5) empty counterparty / empty counterAccountId / non-positive amount
throw their messages; (6) regression: no-shares call is byte-identical to
today (2 category legs → same drafts as before).

**Verify**: `npx vitest run src/domain/splitLegs.test.ts` → all pass.

### Step 4: Repository methods

In `src/data/repositories.ts`:
1. Interface (:337, :345): append `shares?: SplitShareInput[]` to both methods
   (import the type from `../domain/splitLegs`).
2. Browser `createSplit`/`updateSplit`: pass `shares ?? []` through to
   `buildSplitLegs`. Before inserting, validate every share draft's counter
   account exists and is not deleted:
   `this.data.accounts.some((a) => a.id === draft.counterAccountId && a.deletedAt === null)`
   → else throw 「找不到應收帳戶。」 (match how the file's other zh-TW guards
   throw). Keep `assertLedgerInvariants` running on every draft as today.
3. SQLite overrides (:3141 area): same plumbing (they call the same builder;
   mirror the counter-account guard against the SQLite accounts read the
   method already performs — follow the existing override's structure).

**Verify**: `npx tsc --noEmit` → 0.

### Step 5: Partial-sync guard

In `src/domain/ledgerTrust.ts`, widen `incompleteSplitGroupIds` to count BOTH
user-leg kinds: `row.legKind !== "category" && row.legKind !== "share"` →
`continue`. Update its doc comment: a split needs ≥2 active user legs
(category+share combined); count===1 flags half-arrived/half-deleted. System
legs (legKind null) still never counted.

**Verify**: `npx vitest run src/domain/ledgerTrust.test.ts` → pass.

### Step 6: Guard tests

Extend `ledgerTrust.test.ts` (model after :93-113): (1) 1 category + 1 share
sharing a groupId → NOT flagged; (2) a lone share leg → flagged; (3) existing
lone-category case still flagged (should already exist — confirm, don't
duplicate).

**Verify**: suite passes.

### Step 7: Dual-harness repository tests — the reconciliation test

Extend `src/data/repositories.split.test.ts` (its dual browser/SQLite pattern),
seeding a bank account and a 代墊/應收 account:

1. **Reconciliation (the load-bearing test)**: `createSplit` of expense 1000 =
   category leg 400 + share 600 (counterAccountId = 應收 account). Assert: bank
   balance moved by **−1000**; 應收 account balance moved by **+600**; total
   expense (however the harness sums spend — reuse the file's existing helpers)
   counts **only 400**.
2. `updateSplit` keeps shares: update to 300/700 → old rows tombstoned with
   bumped revisions (same assertion style as the existing updateSplit test),
   new share leg −700 present.
3. Counter-account guard: share pointing at a nonexistent account id →
   rejects with 「找不到應收帳戶。」.
4. No-shares regression: existing createSplit tests unchanged and green.

**Verify**: `npx vitest run src/data/repositories.split.test.ts` → all pass,
both harnesses.

### Step 8: Full gates

**Verify**: `npx tsc --noEmit` 0 · `npm run lint` 0 errors / 762 warnings ·
`npm test` all pass (1318 + new).

## Test plan

Covered by steps 3, 6, 7. The reconciliation test (step 7.1) is the one that
must exist for this plan to be approvable — it proves `資產 − 負債 = 淨值`
holds through a 分帳, which is the repo's non-negotiable invariant #1.

## Done criteria

- [ ] All gates green with new tests (≥ 6 builder, ≥ 2 guard, ≥ 3 dual-harness)
- [ ] `grep -n '"share"' src/domain/splitLegs.ts src/domain/ledgerTrust.ts src/domain/types.ts src/data/repositories.ts` shows the widened literals
- [ ] Step 7.1's balance assertions pass on BOTH harnesses
- [ ] Zero UI files modified (`git status` shows only the 5 in-scope files)
- [ ] 182's existing split tests pass byte-unchanged

## STOP conditions

- **The reconciliation assumption fails**: after inserting a
  `counterAccountId` row, `recompute()` does NOT move the counter account's
  balance by the share amount (i.e. the 代墊 pass-through posting I described
  doesn't exist in `recompute`). Do not build a posting mechanism — STOP and
  report what `recompute` actually does with `counterAccountId`.
- `assertLedgerInvariants` rejects `category: ""` drafts.
- The SQLite `createSplit` override's structure makes the counter-account
  guard impossible without touching out-of-scope code.
- Any 182 UI test starts failing.

## Maintenance notes

- Plan 222 (分帳 UI) builds on these signatures: `SplitShareInput`,
  `buildSplitLegs(shared, legs, groupId, shares)`,
  `createSplit/updateSplit(..., shares?)`. Report the final signatures in your
  completion notes for the 222 author.
- Settle UX for share legs is deliberately NOT here: a share leg's receivable
  lives as the counter account's balance, settled today the way any 代墊 row is.
  If 222 wants one-tap settle, that's where it gets designed.
- Spike Q&A this encodes (docs/split-legs-plan.md §Operator questions):
  Q1 legs inherit the group date (no per-leg date) · Q2 no nesting ·
  Q3 group-atomic delete (existing groupId cascade untouched) ·
  Q6 選擇性應收 = a non-tracked share is just part of the payer's own legs.
